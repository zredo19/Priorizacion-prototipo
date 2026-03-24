import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Calculator,
  Settings as SettingsIcon,
  Database,
  Loader2,
  Upload,
  Download,
  Plus,
  Edit2,
  Trash2,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  CheckCircle,
} from 'lucide-react';

const API_BASE = 'http://localhost:8001';

const TABS = [
  { id: 'simulator', label: 'Simulador', icon: Calculator },
  { id: 'projects', label: 'Base de Proyectos', icon: Database },
  { id: 'settings', label: 'Configuración', icon: SettingsIcon },
  { id: 'results', label: 'Resultados', icon: Calculator },
];

const YEAR_LABELS = ['Año 0', 'Año 1', 'Año 2', 'Año 3', 'Año 4'];
const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];
const CATEGORIAS_OBLIGATORIAS = [
  'correctivo',
  'gestion de riesgo',
  'normativo',
  'pd cambio de estandar',
  'pd cambio estandar',
  'plan de desarrollo',
];
const LEGACY_OTROS_KEYS = [
  'OTROS (FORZAR AUTOS)',
  'OTROS(FORZAR AUTOS)',
  'OTROS(FORZARAUTOS)',
  'OTROS FORZAR AUTOS',
];

const formatNumber = (num) => {
  const val = Number(num || 0);
  return Math.round(val).toLocaleString('es-CL');
};

const formatCurrency = (num) => `$${formatNumber(num)}`;

const formatCurrencyAxis = (num) => {
  const value = Number(num) || 0;
  if (Math.abs(value) >= 1000000) return `$${Math.round(value / 1000000).toLocaleString('es-CL')}M`;
  return `$${Math.round(value).toLocaleString('es-CL')}`;
};

const onlyDigits = (raw) => String(raw || '').replace(/\D/g, '');
const parseIntegerInput = (raw) => {
  const numeric = onlyDigits(raw);
  return numeric ? Number(numeric) : 0;
};

const normalizeCategory = (cat = '') =>
  String(cat)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const normalizeVisibleCategory = (cat = '') => {
  const raw = String(cat || '').trim();
  const upper = raw.toUpperCase();
  const compact = upper.replace(/\s+/g, '');
  if (LEGACY_OTROS_KEYS.includes(upper) || compact === 'OTROS(FORZARAUTOS)' || compact === 'OTROSFORZARAUTOS' || compact === 'OTROS') {
    return 'Otros';
  }
  return raw || 'OTROS';
};

const isActivacionFinanciera = (cat) => normalizeCategory(cat) === 'activacion financiera';
const isObligatoria = (cat) => CATEGORIAS_OBLIGATORIAS.includes(normalizeCategory(cat));

const normalizeOptionalMinByCategory = (rawMap = {}, optionalCategories = [], fallback = 30000000) => {
  const mapped = { ...(rawMap || {}) };
  for (const legacyKey of LEGACY_OTROS_KEYS) {
    if (mapped[legacyKey] != null && mapped.OTROS == null) mapped.OTROS = mapped[legacyKey];
  }

  const result = {};
  for (const category of optionalCategories) {
    const key = String(category || '').toUpperCase() === 'OTROS' ? 'OTROS' : category;
    const parsed = Number(mapped[key]);
    result[category] = Number.isFinite(parsed) ? parsed : fallback;
  }
  return result;
};

const getCost5Y = (project) => Object.values(project?.flujo_caja || {}).reduce((s, v) => s + (Number(v) || 0), 0);

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('simulator');
  const [projects, setProjects] = useState([]);
  const [settings, setSettings] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const [localSettings, setLocalSettings] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaveMessage, setSettingsSaveMessage] = useState(null);
  const [numericDrafts, setNumericDrafts] = useState({});

  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [bddSortConfig, setBddSortConfig] = useState({ key: 'pep', direction: 'asc' });

  const [pmpMetric, setPmpMetric] = useState('vir');
  const [uploading, setUploading] = useState(false);
  const [uploadReset, setUploadReset] = useState(false);

  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);

  const [newCategory, setNewCategory] = useState('');

  const getNumericDisplayValue = (key, committedValue) => {
    if (Object.prototype.hasOwnProperty.call(numericDrafts, key)) return numericDrafts[key];
    return formatNumber(committedValue || 0);
  };

  const beginNumericEdit = (key, committedValue) => {
    setNumericDrafts((prev) => ({ ...prev, [key]: onlyDigits(committedValue) }));
  };

  const updateNumericDraft = (key, rawValue) => {
    setNumericDrafts((prev) => ({ ...prev, [key]: onlyDigits(rawValue) }));
  };

  const commitNumericDraft = (key, commitFn, fallbackValue = 0) => {
    const raw = Object.prototype.hasOwnProperty.call(numericDrafts, key) ? numericDrafts[key] : onlyDigits(fallbackValue);
    commitFn(parseIntegerInput(raw));
    setNumericDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const normalizeSettingsFromApi = useCallback((settingsData) => {
    const normalized = {
      ...settingsData,
      presupuesto_anual: Object.fromEntries(
        Object.entries(settingsData?.presupuesto_anual || {}).map(([k, v]) => [String(k), Number(v) || 0])
      ),
      minimo_priorizar_clp: Number.isFinite(Number(settingsData?.minimo_priorizar_clp))
        ? Number(settingsData?.minimo_priorizar_clp)
        : Number(settingsData?.minimo_priorizar_mm) || 30000000,
      minimo_categoria_opcional_clp: Number.isFinite(Number(settingsData?.minimo_categoria_opcional_clp))
        ? Number(settingsData?.minimo_categoria_opcional_clp)
        : 30000000,
      drivers_categoria: { ...(settingsData?.drivers_categoria || {}) },
      minimos_categoria_opcional_clp: { ...(settingsData?.minimos_categoria_opcional_clp || {}) },
    };

    const remappedDrivers = {};
    Object.entries(normalized.drivers_categoria).forEach(([cat, driver]) => {
      const visible = normalizeVisibleCategory(cat);
      const key = visible.toUpperCase() === 'OTROS' || visible === 'Otros' ? 'OTROS' : visible;
      remappedDrivers[key] = String(driver || 'vir').toLowerCase() === 'rmi' ? 'rmi' : 'vir';
    });
    normalized.drivers_categoria = remappedDrivers;

    const optionalCategories = Object.keys(normalized.drivers_categoria).filter(
      (cat) => !isObligatoria(cat) && !isActivacionFinanciera(cat)
    );
    normalized.minimos_categoria_opcional_clp = normalizeOptionalMinByCategory(
      normalized.minimos_categoria_opcional_clp,
      optionalCategories,
      normalized.minimo_categoria_opcional_clp
    );

    return normalized;
  }, []);

  const normalizeProjectsFromApi = useCallback((projectsData) => {
    return (projectsData || []).map((project) => ({
      ...project,
      categoria: normalizeVisibleCategory(project.categoria),
      flujo_caja: Object.fromEntries(
        Object.entries(project.flujo_caja || {}).map(([k, v]) => [String(k), Number(v) || 0])
      ),
    }));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectsRes, settingsRes] = await Promise.all([
        axios.get(`${API_BASE}/projects/`),
        axios.get(`${API_BASE}/settings/`),
      ]);

      const normalizedProjects = normalizeProjectsFromApi(projectsRes.data || []);
      const normalizedSettings = normalizeSettingsFromApi(settingsRes.data || {});

      setProjects(normalizedProjects);
      setSettings(normalizedSettings);
      setLocalSettings(normalizedSettings);
    } catch (err) {
      console.error(err);
      setError('Error al cargar datos CAPEX. Verifica tu conexión.');
    } finally {
      setLoading(false);
    }
  }, [normalizeProjectsFromApi, normalizeSettingsFromApi]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!settingsSaveMessage) return undefined;
    const timer = setTimeout(() => setSettingsSaveMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [settingsSaveMessage]);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timer = setTimeout(() => setSuccessMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const handleOptimize = async (metric = 'vir') => {
    setOptimizing(true);
    setError(null);
    try {
      const response = await axios.post(`${API_BASE}/optimize/`, { metric });
      const result = response.data || {};
      result.selected = normalizeProjectsFromApi(result.selected || []);
      result.rejected = normalizeProjectsFromApi(result.rejected || []);
      setResults(result);
      setActiveTab('results');
      setSuccessMessage(`Priorización completada: ${(result.selected || []).length} proyectos aprobados`);
    } catch (err) {
      console.error(err);
      setError(`Error al ejecutar la priorización: ${err.response?.data?.detail || err.message}`);
    } finally {
      setOptimizing(false);
    }
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await axios.post(`${API_BASE}/projects/upload?reset=${uploadReset}`, formData);
      await loadData();
      setResults(null);
      setSuccessMessage('Proyectos importados correctamente');
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'Error al importar archivo');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleExport = () => {
    if (!projects?.length) return;

    const headers = [
      'PEP',
      'DEFINICIÓN DE PROYECTO',
      'GERENCIA EJECUTANTE',
      'AÑO 0',
      'AÑO 1',
      'AÑO 2',
      'AÑO 3',
      'AÑO 4',
      'TOTAL PROYECTO',
      'ESTADO',
      'CATEGORÍA',
      'SUBCATEGORÍA',
      'CRITERIO CODIR',
      'TIPO DE PROYECTO',
      'PLAN AL QUE PERTENECE',
      'RMI',
      'VIR',
      'FORZADO',
    ];

    let csvContent = `\uFEFF${headers.join(';')}\n`;
    projects.forEach((project) => {
      const flujo = project.flujo_caja || {};
      const a0 = Number(flujo['0'] || 0);
      const a1 = Number(flujo['1'] || 0);
      const a2 = Number(flujo['2'] || 0);
      const a3 = Number(flujo['3'] || 0);
      const a4 = Number(flujo['4'] || 0);
      const total = a0 + a1 + a2 + a3 + a4;
      const row = [
        project.pep,
        project.nombre,
        project.gerencia,
        a0,
        a1,
        a2,
        a3,
        a4,
        total,
        project.estado,
        project.categoria,
        project.subcategoria,
        project.criterio_codir,
        project.tipo_proyecto,
        project.plan,
        project.rmi,
        project.vir,
        (project.estado || 'Solicitado') === 'Adjudicado' ? 'Sí' : 'No',
      ];
      const rowStr = row
        .map((value) => {
          const str = String(value ?? '');
          return str.includes(';') ? `"${str.replace(/"/g, '""')}"` : str;
        })
        .join(';');
      csvContent += `${rowStr}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'proyectos_export.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openCreateModal = () => {
    setEditingProject({
      pep: '',
      nombre: '',
      gerencia: '',
      categoria: 'CORRECTIVO',
      subcategoria: '',
      criterio_codir: '',
      tipo_proyecto: '',
      plan: '',
      estado: 'Solicitado',
      rmi: 0,
      vir: 0,
      van: 0,
      tir: 0,
      flujo_caja: { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0 },
    });
    setShowProjectModal(true);
  };

  const openEditModal = (project) => {
    setEditingProject({
      ...project,
      flujo_caja: {
        '0': Number(project?.flujo_caja?.['0'] || 0),
        '1': Number(project?.flujo_caja?.['1'] || 0),
        '2': Number(project?.flujo_caja?.['2'] || 0),
        '3': Number(project?.flujo_caja?.['3'] || 0),
        '4': Number(project?.flujo_caja?.['4'] || 0),
      },
    });
    setShowProjectModal(true);
  };

  const handleSaveProject = async () => {
    if (!editingProject?.nombre) {
      setError('El nombre del proyecto es obligatorio');
      return;
    }
    const payload = {
      ...editingProject,
      categoria: normalizeVisibleCategory(editingProject.categoria),
      rmi: Number(editingProject.rmi || 0),
      vir: Number(editingProject.vir || 0),
      van: Number(editingProject.van || 0),
      tir: Number(editingProject.tir || 0),
      flujo_caja: Object.fromEntries(
        Object.entries(editingProject.flujo_caja || {}).map(([k, v]) => [String(k), Number(v) || 0])
      ),
    };

    try {
      if (editingProject.id) await axios.put(`${API_BASE}/projects/${editingProject.id}`, payload);
      else await axios.post(`${API_BASE}/projects/`, payload);

      setShowProjectModal(false);
      setEditingProject(null);
      await loadData();
      setSuccessMessage('Proyecto guardado correctamente');
    } catch (err) {
      console.error(err);
      setError(`Error al guardar proyecto: ${err.response?.data?.detail || err.message}`);
    }
  };

  const handleDeleteProject = async (id) => {
    if (!window.confirm('¿Eliminar este proyecto?')) return;
    try {
      await axios.delete(`${API_BASE}/projects/${id}`);
      await loadData();
      setSuccessMessage('Proyecto eliminado');
    } catch (err) {
      console.error(err);
      setError(`Error al eliminar proyecto: ${err.response?.data?.detail || err.message}`);
    }
  };

  const handleSaveSettings = async () => {
    if (!localSettings) return;
    setSavingSettings(true);
    setSettingsSaveMessage(null);
    setError(null);

    try {
      const driversCategoria = { ...(localSettings.drivers_categoria || {}) };
      const optionalCategories = Object.keys(driversCategoria).filter(
        (cat) => !isObligatoria(cat) && !isActivacionFinanciera(cat)
      );

      const payload = {
        ...localSettings,
        presupuesto_anual: Object.fromEntries(
          Object.entries(localSettings.presupuesto_anual || {}).map(([k, v]) => [String(k), Number(v) || 0])
        ),
        minimo_priorizar_clp: Number(localSettings.minimo_priorizar_clp || 0),
        minimo_categoria_opcional_clp: Number(localSettings.minimo_categoria_opcional_clp || 30000000),
        drivers_categoria: Object.fromEntries(
          Object.entries(driversCategoria).map(([cat, driver]) => {
            const normalized = normalizeVisibleCategory(cat);
            const key = normalized === 'Otros' ? 'OTROS' : normalized;
            return [key, String(driver || 'vir').toLowerCase() === 'rmi' ? 'rmi' : 'vir'];
          })
        ),
      };

      payload.minimos_categoria_opcional_clp = normalizeOptionalMinByCategory(
        localSettings.minimos_categoria_opcional_clp || {},
        optionalCategories,
        payload.minimo_categoria_opcional_clp
      );

      const response = await axios.put(`${API_BASE}/settings/`, payload);
      const normalized = normalizeSettingsFromApi(response.data || payload);
      setSettings(normalized);
      setLocalSettings(normalized);
      setSettingsSaveMessage('Configuración guardada correctamente');
    } catch (err) {
      console.error(err);
      setError(`Error al guardar configuración: ${err.response?.data?.detail || err.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleBddSort = (key) => {
    setBddSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const getSortedResults = useCallback(() => {
    if (!results) return [];
    const allProjects = [
      ...(results.selected || []).map((p) => ({ ...p, status: 'approved' })),
      ...(results.rejected || []).map((p) => ({ ...p, status: 'rejected' })),
    ];
    if (!sortConfig.key) return allProjects;

    return [...allProjects].sort((a, b) => {
      let aVal;
      let bVal;
      switch (sortConfig.key) {
        case 'decision':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'proyecto':
          aVal = a.nombre;
          bVal = b.nombre;
          break;
        case 'gerencia':
          aVal = a.gerencia;
          bVal = b.gerencia;
          break;
        case 'categoria':
          aVal = a.categoria;
          bVal = b.categoria;
          break;
        case 'vir':
          aVal = Number(a.vir || 0);
          bVal = Number(b.vir || 0);
          break;
        case 'rmi':
          aVal = Number(a.rmi || 0);
          bVal = Number(b.rmi || 0);
          break;
        case 'costo':
          aVal = getCost5Y(a);
          bVal = getCost5Y(b);
          break;
        case 'estado':
          aVal = a.estado || '';
          bVal = b.estado || '';
          break;
        default:
          aVal = 0;
          bVal = 0;
      }

      if (typeof aVal === 'string') {
        return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal, 'es') : bVal.localeCompare(aVal, 'es');
      }
      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [results, sortConfig]);

  const sortedProjects = useMemo(() => {
    const arr = [...projects];
    if (!bddSortConfig.key) return arr;

    return arr.sort((a, b) => {
      let aVal;
      let bVal;
      switch (bddSortConfig.key) {
        case 'pep':
          aVal = a.pep || '';
          bVal = b.pep || '';
          break;
        case 'nombre':
          aVal = a.nombre || '';
          bVal = b.nombre || '';
          break;
        case 'gerencia':
          aVal = a.gerencia || '';
          bVal = b.gerencia || '';
          break;
        case 'categoria':
          aVal = a.categoria || '';
          bVal = b.categoria || '';
          break;
        case 'subcategoria':
          aVal = a.subcategoria || '';
          bVal = b.subcategoria || '';
          break;
        case 'vir':
          aVal = Number(a.vir || 0);
          bVal = Number(b.vir || 0);
          break;
        case 'rmi':
          aVal = Number(a.rmi || 0);
          bVal = Number(b.rmi || 0);
          break;
        case 'van':
          aVal = Number(a.van || 0);
          bVal = Number(b.van || 0);
          break;
        case 'tir':
          aVal = Number(a.tir || 0);
          bVal = Number(b.tir || 0);
          break;
        case 'costo':
          aVal = getCost5Y(a);
          bVal = getCost5Y(b);
          break;
        case 'estado':
          aVal = a.estado || '';
          bVal = b.estado || '';
          break;
        default:
          aVal = 0;
          bVal = 0;
      }

      if (typeof aVal === 'string') {
        return bddSortConfig.direction === 'asc' ? aVal.localeCompare(bVal, 'es') : bVal.localeCompare(aVal, 'es');
      }
      return bddSortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [projects, bddSortConfig]);

  const kpis = useMemo(() => {
    if (!results || !settings) return null;

    const selected = results.selected || [];
    const rejected = results.rejected || [];
    const totalBudget = Object.values(settings.presupuesto_anual || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const totalSpent = selected.reduce((sum, project) => sum + getCost5Y(project), 0);
    const activacionSpent = selected
      .filter((project) => isActivacionFinanciera(project.categoria))
      .reduce((sum, project) => sum + getCost5Y(project), 0);

    return {
      totalProjects: selected.length + rejected.length,
      approvedProjects: selected.length,
      rejectedProjects: rejected.length,
      totalBudget,
      totalSpent,
      activacionSpent,
      totalSpentWithoutActivacion: totalSpent - activacionSpent,
      budgetUsage: totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(1) : '0.0',
    };
  }, [results, settings]);

  const categoryChartData = useMemo(() => {
    if (!results) return [];
    const categoryMap = {};
    [...(results.selected || []), ...(results.rejected || [])].forEach((project) => {
      const cat = normalizeVisibleCategory(project.categoria || 'Sin categoría');
      categoryMap[cat] = (categoryMap[cat] || 0) + getCost5Y(project);
    });
    return Object.entries(categoryMap)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [results]);

  const budgetChartData = useMemo(() => {
    if (!results || !settings) return [];
    return YEAR_LABELS.map((label, idx) => {
      const ys = String(idx);
      const budget = Number(settings.presupuesto_anual?.[ys] || 0);
      const remaining = Number(results.remaining_budget?.[ys] || 0);
      const spent = budget - remaining;
      return {
        name: label,
        Presupuesto: Math.round(budget),
        Utilizado: Math.round(spent),
        Restante: Math.round(remaining),
      };
    });
  }, [results, settings]);

  const simulatorSummary = useMemo(() => {
    const budgetSource = localSettings?.presupuesto_anual || settings?.presupuesto_anual || {};
    const totalBudget5Y = Object.values(budgetSource).reduce((sum, value) => sum + (Number(value) || 0), 0);

    const categoriesFromDrivers = Object.keys(localSettings?.drivers_categoria || settings?.drivers_categoria || {});
    const categoriesCount =
      categoriesFromDrivers.length > 0
        ? categoriesFromDrivers.length
        : new Set((projects || []).map((project) => normalizeVisibleCategory(project.categoria || 'Sin categoría'))).size;

    return {
      totalProjects: projects.length,
      totalBudget5Y,
      categoriesCount,
      anoEnCurso: localSettings?.ano_en_curso ?? settings?.ano_en_curso ?? 2026,
    };
  }, [projects, settings, localSettings]);

  const SortIcon = ({ columnKey, bdd = false }) => {
    const current = bdd ? bddSortConfig : sortConfig;
    if (current.key !== columnKey) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return current.direction === 'asc' ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
      </div>
    );
  }

  const orderedDriverEntries = Object.entries(localSettings?.drivers_categoria || {}).sort(([a], [b]) => {
    const ao = isObligatoria(a) ? 0 : isActivacionFinanciera(a) ? 1 : 2;
    const bo = isObligatoria(b) ? 0 : isActivacionFinanciera(b) ? 1 : 2;
    if (ao !== bo) return ao - bo;
    return a.localeCompare(b, 'es', { sensitivity: 'base' });
  });

  const optionalCategories = orderedDriverEntries
    .map(([cat]) => cat)
    .filter((cat) => !isObligatoria(cat) && !isActivacionFinanciera(cat));

  const optionalMinByCategory = normalizeOptionalMinByCategory(
    localSettings?.minimos_categoria_opcional_clp || {},
    optionalCategories,
    localSettings?.minimo_categoria_opcional_clp || 30000000
  );

  return (
    <div className="space-y-6 pb-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <Calculator className="w-8 h-8 text-blue-500" /> Priorización CAPEX
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Simulador de priorización para proyectos de inversión</p>
        </div>
        <span className="text-xs bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full text-slate-500 dark:text-slate-400">
          {projects.length} proyectos cargados
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-red-300/60 bg-red-50/80 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="rounded-xl border border-emerald-300/60 bg-emerald-50/80 dark:bg-emerald-900/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {successMessage}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 p-2">
        <div className="flex flex-wrap gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const disabled = tab.id === 'results' && !results;
            return (
              <button
                key={tab.id}
                disabled={disabled}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'simulator' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Calculator className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Priorizar PMP</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Selecciona el criterio de optimización</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="grid grid-cols-3 w-full sm:w-auto bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                {['vir', 'rmi', 'personalizado'].map((metric) => (
                  <button
                    key={metric}
                    onClick={() => setPmpMetric(metric)}
                    className={`px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                      pmpMetric === metric
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    {metric.toUpperCase()}
                  </button>
                ))}
              </div>

              <button
                onClick={() => handleOptimize(pmpMetric)}
                disabled={optimizing}
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {optimizing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Ejecutar
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
              El modo Personalizado usa el driver definido por categoría en Configuración.
            </p>
          </div>

          <div className="rounded-[22px] border border-[#1f3a65] bg-[linear-gradient(180deg,#081b43_0%,#0a1534_100%)] shadow-[0_14px_36px_rgba(4,9,28,0.38)] p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-4 sm:mb-5">
              <div className="w-1.5 h-7 bg-blue-500 rounded-full" />
              <h3 className="text-white font-semibold text-[clamp(1.3rem,1.45vw,1.85rem)] leading-tight">Resumen del Portafolio</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
              <PortfolioSummaryCard label="PROYECTOS TOTALES" value={formatNumber(simulatorSummary.totalProjects)} />
              <PortfolioSummaryCard label="PRESUPUESTO 5 AÑOS" value={formatCurrency(simulatorSummary.totalBudget5Y)} highlight="blue" kind="currency" />
              <PortfolioSummaryCard label="CATEGORÍAS" value={formatNumber(simulatorSummary.categoriesCount)} highlight="green" />
              <PortfolioSummaryCard label="AÑO EN CURSO" value={String(simulatorSummary.anoEnCurso)} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'projects' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-wrap gap-2 items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Catálogo de Proyectos</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-sm text-slate-600 dark:text-slate-300 inline-flex items-center gap-2">
                  <input type="checkbox" checked={uploadReset} onChange={(e) => setUploadReset(e.target.checked)} />
                  Reemplazar existentes
                </label>

                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm cursor-pointer border border-blue-200 dark:border-blue-800">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {uploading ? 'Importando...' : 'Importar'}
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUpload} disabled={uploading} />
                </label>

                <button
                  onClick={handleExport}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-sm border border-teal-200 dark:border-teal-800"
                >
                  <Download className="w-4 h-4" /> Exportar
                </button>

                <button
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm"
                >
                  <Plus className="w-4 h-4" /> Nuevo
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-900/90">
                  <tr>
                    {[
                      ['pep', 'PEP'],
                      ['nombre', 'Nombre'],
                      ['gerencia', 'Gerencia'],
                      ['categoria', 'Categoría'],
                      ['subcategoria', 'Subcategoría'],
                      ['vir', 'VIR'],
                      ['rmi', 'RMI'],
                      ['van', 'VAN'],
                      ['tir', 'TIR'],
                      ['costo', 'Costo 5Y (CLP)'],
                      ['estado', 'Estado'],
                    ].map(([key, label]) => (
                      <th
                        key={key}
                        onClick={() => handleBddSort(key)}
                        className="px-3 py-3 text-left uppercase tracking-wider text-slate-500 dark:text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <div className="flex items-center">
                          {label}
                          <SortIcon columnKey={key} bdd />
                        </div>
                      </th>
                    ))}
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {sortedProjects.map((project) => (
                    <tr key={project.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-2.5">{project.pep || '-'}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-white">{project.nombre || '-'}</td>
                      <td className="px-3 py-2.5">{project.gerencia || '-'}</td>
                      <td className="px-3 py-2.5">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700">{normalizeVisibleCategory(project.categoria)}</span>
                      </td>
                      <td className="px-3 py-2.5">{project.subcategoria || '-'}</td>
                      <td className="px-3 py-2.5">{Number(project.vir || 0).toFixed(2)}</td>
                      <td className="px-3 py-2.5">{Number(project.rmi || 0).toFixed(2)}</td>
                      <td className="px-3 py-2.5">{Number(project.van || 0) ? formatNumber(project.van) : '—'}</td>
                      <td className="px-3 py-2.5">{Number(project.tir || 0) ? `${Number(project.tir).toFixed(2)}%` : '—'}</td>
                      <td className="px-3 py-2.5 text-emerald-600 dark:text-emerald-400">{formatCurrency(getCost5Y(project))}</td>
                      <td className="px-3 py-2.5">{project.estado || 'Solicitado'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEditModal(project)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteProject(project.id)} className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'settings' && localSettings && (
        <div className="space-y-6">
          <div className="sticky top-2 z-20 h-0 pointer-events-none">
            <div className="flex justify-end">
              <div className="pointer-events-auto w-full sm:w-auto max-w-[420px]">
                {settingsSaveMessage && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg border border-emerald-300/70 dark:border-emerald-700/70 bg-emerald-50/95 dark:bg-emerald-900/50 px-3 py-2 text-xs font-medium text-emerald-800 dark:text-emerald-200 shadow-md">
                    <CheckCircle className="w-4 h-4" />
                    <span>{settingsSaveMessage}</span>
                  </div>
                )}
                <div className="rounded-xl border border-slate-200/70 dark:border-slate-700/70 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm p-2 shadow-lg shadow-slate-900/10">
                  <button
                    onClick={handleSaveSettings}
                    disabled={savingSettings}
                    className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {savingSettings ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Guardar Configuración
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-1.5 h-6 bg-blue-500 rounded-full" />
              <h3 className="font-bold text-slate-900 dark:text-white">Presupuesto Anual (CLP)</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {YEAR_LABELS.map((label, idx) => (
                <div key={label}>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={getNumericDisplayValue(`budget-${idx}`, localSettings.presupuesto_anual?.[String(idx)] || 0)}
                      onFocus={() => beginNumericEdit(`budget-${idx}`, localSettings.presupuesto_anual?.[String(idx)] || 0)}
                      onChange={(e) => updateNumericDraft(`budget-${idx}`, e.target.value)}
                      onBlur={() =>
                        commitNumericDraft(
                          `budget-${idx}`,
                          (nextValue) =>
                            setLocalSettings((prev) => ({
                              ...prev,
                              presupuesto_anual: { ...(prev.presupuesto_anual || {}), [String(idx)]: nextValue },
                            })),
                          localSettings.presupuesto_anual?.[String(idx)] || 0
                        )
                      }
                      className="w-full pr-12 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                    <span className="absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-slate-500 dark:text-slate-400 pointer-events-none">CLP</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
              <h3 className="font-bold text-slate-900 dark:text-white">Configuración General</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Año en Curso</label>
                <div className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white text-sm">
                  {localSettings.ano_en_curso || 2026}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Mínimo para Priorizar (CLP)</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={getNumericDisplayValue('minimo-priorizar', localSettings.minimo_priorizar_clp || 0)}
                    onFocus={() => beginNumericEdit('minimo-priorizar', localSettings.minimo_priorizar_clp || 0)}
                    onChange={(e) => updateNumericDraft('minimo-priorizar', e.target.value)}
                    onBlur={() =>
                      commitNumericDraft(
                        'minimo-priorizar',
                        (nextValue) => setLocalSettings((prev) => ({ ...prev, minimo_priorizar_clp: nextValue })),
                        localSettings.minimo_priorizar_clp || 0
                      )
                    }
                    className="w-full pr-12 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                  <span className="absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-slate-500 dark:text-slate-400 pointer-events-none">CLP</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-1.5 h-6 bg-violet-500 rounded-full" />
              <h3 className="font-bold text-slate-900 dark:text-white">Gestión de Categorías + Drivers por Categoría</h3>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <input
                type="text"
                placeholder="Nombre de nueva categoría"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value.toUpperCase())}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
              />
              <button
                onClick={() => {
                  const name = newCategory.trim();
                  if (!name) return;
                  if (Object.keys(localSettings.drivers_categoria || {}).some((k) => k.toLowerCase() === name.toLowerCase())) {
                    setError('Esa categoría ya existe');
                    return;
                  }
                  setLocalSettings((prev) => ({
                    ...prev,
                    drivers_categoria: { ...(prev.drivers_categoria || {}), [name]: 'vir' },
                    minimos_categoria_opcional_clp: {
                      ...(prev.minimos_categoria_opcional_clp || {}),
                      [name]: Number(prev.minimo_categoria_opcional_clp || 30000000),
                    },
                  }));
                  setNewCategory('');
                }}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm"
              >
                <Plus className="w-4 h-4" /> Agregar
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {orderedDriverEntries.map(([cat, driver]) => {
                const obligatory = isObligatoria(cat) || isActivacionFinanciera(cat);
                return (
                  <div key={cat} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl px-4 py-3">
                    <span className="text-sm text-slate-700 dark:text-slate-300 flex-1 truncate font-medium">{cat}</span>
                    {obligatory ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 whitespace-nowrap">
                        Obligatoria
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-300 whitespace-nowrap">
                        Opcional
                      </span>
                    )}

                    {!obligatory && (
                      <select
                        value={driver}
                        onChange={(e) =>
                          setLocalSettings((prev) => ({
                            ...prev,
                            drivers_categoria: { ...(prev.drivers_categoria || {}), [cat]: e.target.value },
                          }))
                        }
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm"
                      >
                        <option value="vir">VIR</option>
                        <option value="rmi">RMI</option>
                      </select>
                    )}

                    {obligatory && (
                      <span className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm">
                        {String(driver || 'vir').toUpperCase()}
                      </span>
                    )}

                    {!obligatory && (
                      <button
                        onClick={() => {
                          const { [cat]: _, ...restDrivers } = localSettings.drivers_categoria || {};
                          const { [cat]: __, ...restMins } = localSettings.minimos_categoria_opcional_clp || {};
                          setLocalSettings((prev) => ({
                            ...prev,
                            drivers_categoria: restDrivers,
                            minimos_categoria_opcional_clp: restMins,
                          }));
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-1.5 h-6 bg-cyan-500 rounded-full" />
              <h3 className="font-bold text-slate-900 dark:text-white">Mínimo por Categoría Opcional (CLP)</h3>
            </div>

            <div className="space-y-3">
              {optionalCategories.length > 0 ? (
                optionalCategories.map((cat) => (
                  <div key={cat} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] gap-3 items-center bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{cat}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Mínimo objetivo para cobertura de la categoría.</p>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={getNumericDisplayValue(`min-cat-${cat}`, optionalMinByCategory[cat] || 30000000)}
                        onFocus={() => beginNumericEdit(`min-cat-${cat}`, optionalMinByCategory[cat] || 30000000)}
                        onChange={(e) => updateNumericDraft(`min-cat-${cat}`, e.target.value)}
                        onBlur={() =>
                          commitNumericDraft(
                            `min-cat-${cat}`,
                            (nextValue) =>
                              setLocalSettings((prev) => ({
                                ...prev,
                                minimos_categoria_opcional_clp: {
                                  ...(prev.minimos_categoria_opcional_clp || {}),
                                  [cat]: nextValue,
                                },
                              })),
                            optionalMinByCategory[cat] || 30000000
                          )
                        }
                        className="w-full pr-12 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                      />
                      <span className="absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-slate-500 dark:text-slate-400 pointer-events-none">CLP</span>
                    </div>
                  </div>
                ))
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400">No hay categorías opcionales configuradas.</span>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'results' && (
        <div className="space-y-6">
          {!results ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-12 text-center text-slate-500 dark:text-slate-400">
              Aún no se ha ejecutado la priorización.
            </div>
          ) : (
            <>
              {results.warnings?.length > 0 && (
                <div className="rounded-xl border border-amber-300/70 dark:border-amber-700/70 bg-amber-50/95 dark:bg-amber-900/30 p-4 text-sm text-amber-800 dark:text-amber-200">
                  <ul className="list-disc list-inside space-y-1">
                    {results.warnings.map((warning, idx) => (
                      <li key={idx}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {kpis && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  <KpiCard title="Totales" value={kpis.totalProjects} tone="blue" />
                  <KpiCard title="Aprobados" value={kpis.approvedProjects} tone="emerald" />
                  <KpiCard title="Postergados" value={kpis.rejectedProjects} tone="red" />
                  <KpiCard title="Presupuesto 5 Años" value={formatCurrency(kpis.totalBudget)} />
                  <KpiCard title="Comprometido" value={formatCurrency(kpis.totalSpent)} />
                  <KpiCard title="Uso Presupuesto" value={`${kpis.budgetUsage}%`} tone="violet" />
                  <KpiCard title="Activación Financiera" value={formatCurrency(kpis.activacionSpent)} tone="teal" />
                  <KpiCard title="Comprometido Sin Activación" value={formatCurrency(kpis.totalSpentWithoutActivacion)} />
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 h-[390px]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-1.5 h-6 bg-amber-500 rounded-full" />
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm">Desglose Presupuestario</h3>
                  </div>
                  <ResponsiveContainer width="100%" height="85%">
                    <BarChart data={budgetChartData} margin={{ top: 20, right: 8, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} className="dark:opacity-20" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} className="fill-slate-500 dark:fill-slate-400" />
                      <YAxis axisLine={false} tickLine={false} width={72} tick={{ fontSize: 11 }} tickFormatter={formatCurrencyAxis} className="fill-slate-500 dark:fill-slate-400" />
                      <RechartsTooltip formatter={(v) => formatCurrency(v)} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingBottom: 4 }} />
                      <Bar dataKey="Presupuesto" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Utilizado" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Restante" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 h-[420px]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-1.5 h-6 bg-indigo-500 rounded-full" />
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm">Distribución por Categoría</h3>
                  </div>
                  <div className="h-[72%] min-h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 14, right: 10, left: 10, bottom: 14 }}>
                        <Pie data={categoryChartData} cx="50%" cy="46%" innerRadius={58} outerRadius={92} paddingAngle={3} dataKey="value" stroke="#0f172a" strokeWidth={2}>
                          {categoryChartData.map((_, idx) => (
                            <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip formatter={(v) => formatCurrency(v)} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      {categoryChartData.map((item, idx) => (
                        <div key={item.name} className="inline-flex items-center gap-2 max-w-[48%] text-xs text-slate-600 dark:text-slate-300">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                          <span className="truncate" title={item.name}>{item.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {results.budget_matrix && renderBudgetMatrix(results, settings)}
              {renderResultsTable(getSortedResults(), handleSort, SortIcon)}
            </>
          )}
        </div>
      )}

      {showProjectModal && editingProject && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowProjectModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl text-slate-900 dark:text-white">{editingProject.id ? 'Editar Proyecto' : 'Nuevo Proyecto'}</h3>
              <button onClick={() => setShowProjectModal(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">×</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Field label="PEP">
                <input className="input-base" value={editingProject.pep || ''} onChange={(e) => setEditingProject((prev) => ({ ...prev, pep: e.target.value }))} />
              </Field>
              <Field label="Nombre">
                <input className="input-base" value={editingProject.nombre || ''} onChange={(e) => setEditingProject((prev) => ({ ...prev, nombre: e.target.value.toUpperCase() }))} />
              </Field>
              <Field label="Categoría">
                <select
                  className="input-base"
                  value={editingProject.categoria || 'CORRECTIVO'}
                  onChange={(e) => setEditingProject((prev) => ({ ...prev, categoria: e.target.value }))}
                >
                  {Object.keys(localSettings?.drivers_categoria || {}).map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </Field>
              <Field label="Gerencia">
                <input className="input-base" value={editingProject.gerencia || ''} onChange={(e) => setEditingProject((prev) => ({ ...prev, gerencia: e.target.value.toUpperCase() }))} />
              </Field>
              <Field label="Subcategoría">
                <input className="input-base" value={editingProject.subcategoria || ''} onChange={(e) => setEditingProject((prev) => ({ ...prev, subcategoria: e.target.value.toUpperCase() }))} />
              </Field>
              <Field label="Estado">
                <select className="input-base" value={editingProject.estado || 'Solicitado'} onChange={(e) => setEditingProject((prev) => ({ ...prev, estado: e.target.value }))}>
                  <option value="Solicitado">Solicitado</option>
                  <option value="Adjudicado">Adjudicado</option>
                  <option value="Adjudicado Parcial">Adjudicado Parcial</option>
                  <option value="Sin Presupuesto">Sin Presupuesto</option>
                </select>
              </Field>
              <Field label="VIR">
                <input type="number" step="0.01" className="input-base" value={editingProject.vir || 0} onChange={(e) => setEditingProject((prev) => ({ ...prev, vir: Number(e.target.value) || 0 }))} />
              </Field>
              <Field label="RMI">
                <input type="number" step="0.01" className="input-base" value={editingProject.rmi || 0} onChange={(e) => setEditingProject((prev) => ({ ...prev, rmi: Number(e.target.value) || 0 }))} />
              </Field>
            </div>

            <div className="mb-6">
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-2 uppercase">Flujo de Caja por Año (CLP)</label>
              <div className="grid grid-cols-5 gap-3">
                {['0', '1', '2', '3', '4'].map((y) => (
                  <div key={y} className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Año {y}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 outline-none border-none p-0"
                      value={formatNumber(editingProject.flujo_caja?.[y] || 0)}
                      onChange={(e) =>
                        setEditingProject((prev) => ({
                          ...prev,
                          flujo_caja: {
                            ...(prev.flujo_caja || {}),
                            [y]: parseIntegerInput(e.target.value),
                          },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setShowProjectModal(false)} className="px-5 py-2.5 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Cancelar</button>
              <button onClick={handleSaveProject} className="px-5 py-2.5 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1 uppercase">{label}</label>
      {children}
    </div>
  );
}

function KpiCard({ title, value, tone }) {
  const toneClasses = {
    blue: 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30',
    emerald: 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/30',
    red: 'bg-red-50/50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30',
    violet: 'bg-violet-50/50 dark:bg-violet-900/10 border-violet-100 dark:border-violet-900/30',
    teal: 'bg-teal-50/50 dark:bg-teal-900/10 border-teal-100 dark:border-teal-900/30',
  };

  return (
    <div className={`min-w-0 rounded-2xl border p-4 ${toneClasses[tone] || 'bg-slate-50/50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700'}`}>
      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-4 mb-1">{title}</p>
      <p className="text-lg sm:text-xl xl:text-2xl font-bold text-slate-900 dark:text-white tabular-nums leading-tight break-words">{value}</p>
    </div>
  );
}

function PortfolioSummaryCard({ label, value, highlight, kind = 'default' }) {
  const highlightClass =
    highlight === 'blue'
      ? 'text-blue-400'
      : highlight === 'green'
        ? 'text-emerald-400'
        : 'text-white';

  const compactValue = String(value || '').replace(/\s+/g, '');
  const isVeryLongValue = compactValue.length >= 12;

  const valueSizeClass =
    kind === 'currency'
      ? isVeryLongValue
        ? 'text-[clamp(1.45rem,1.6vw,1.95rem)]'
        : 'text-[clamp(1.65rem,1.85vw,2.2rem)]'
      : 'text-[clamp(1.8rem,2vw,2.45rem)]';

  return (
    <div className="min-w-0 rounded-2xl border border-[#274570] bg-[#112446]/72 px-5 py-4 overflow-hidden">
      <p className="text-[0.78rem] tracking-[0.02em] text-slate-300 uppercase leading-4">{label}</p>
      <p
        className={`mt-2 font-semibold tabular-nums tracking-tight leading-none whitespace-nowrap overflow-hidden text-ellipsis ${valueSizeClass} ${highlightClass}`}
        title={String(value)}
      >
        {value}
      </p>
    </div>
  );
}

function renderBudgetMatrix(results, settings) {
  const matrix = results.budget_matrix;
  const categories = Object.keys(matrix).filter((key) => key !== 'TOTAL');
  const years = ['0', '1', '2', '3', '4'];

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="p-6 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-6 bg-violet-500 rounded-full" />
          <h3 className="font-bold text-slate-900 dark:text-white">Detalle Resumen de Resultados</h3>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 dark:bg-slate-900/50">
            <tr>
              <th className="px-3 py-3 text-left text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider sticky left-0 z-10 bg-slate-50 dark:bg-slate-900/50 border-r border-slate-200 dark:border-slate-600">Categoría</th>
              <th className="px-3 py-3 text-left text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Concepto</th>
              {years.map((year) => (
                <th key={year} className="px-3 py-3 text-right text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">{YEAR_LABELS[Number(year)]}</th>
              ))}
              <th className="px-3 py-3 text-right text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider border-l border-slate-200 dark:border-slate-600">Total 5 Años</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => renderMatrixBlock(category, matrix[category], false, years))}
            {matrix.TOTAL && renderMatrixBlock('TOTAL', matrix.TOTAL, true, years)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderMatrixBlock(label, data, isTotal, years) {
  const concepts = [
    { key: 'budget_total', name: 'Presupuesto', color: 'text-slate-500 dark:text-slate-400' },
    { key: 'pre_adjudicado', name: 'Pre-Adjudicado', color: 'text-emerald-700 dark:text-emerald-400', badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' },
    { key: 'agregado', name: 'Agregado', color: 'text-blue-700 dark:text-blue-400', badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
    { key: 'rechazado', name: 'Rechazado', color: 'text-red-600 dark:text-red-400', badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
    { key: 'total', name: 'Resultado', color: 'text-slate-800 dark:text-slate-200 font-medium', badge: 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200' },
  ];

  const rowBase = isTotal ? 'bg-indigo-50/50 dark:bg-indigo-900/10 font-semibold' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30';

  return (
    <React.Fragment key={label}>
      {concepts.map((concept, index) => {
        const yearTotal = years.reduce((sum, year) => sum + (data.years?.[year]?.[concept.key] || 0), 0);
        return (
          <tr key={`${label}-${concept.key}`} className={`${rowBase} ${index === 0 ? 'border-t-2 border-slate-200 dark:border-slate-700' : ''}`}>
            {index === 0 && (
              <td rowSpan={5} className={`px-3 py-2 text-sm align-middle border-r border-slate-200 dark:border-slate-600 whitespace-nowrap sticky left-0 z-10 ${isTotal ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-900 dark:text-indigo-200 font-bold' : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'}`}>
                {label}
              </td>
            )}
            <td className="px-3 py-1.5 text-xs whitespace-nowrap">
              {concept.badge ? <span className={`px-1.5 py-0.5 rounded text-xs ${concept.badge}`}>{concept.name}</span> : <span className={concept.color}>{concept.name}</span>}
            </td>
            {years.map((year) => (
              <td key={year} className={`px-3 py-1.5 text-xs text-right tabular-nums ${concept.color}`}>
                {formatCurrency(data.years?.[year]?.[concept.key] || 0)}
              </td>
            ))}
            <td className={`px-3 py-1.5 text-xs text-right tabular-nums font-medium border-l border-slate-200 dark:border-slate-600 ${concept.color}`}>
              {formatCurrency(yearTotal)}
            </td>
          </tr>
        );
      })}
    </React.Fragment>
  );
}

function renderResultsTable(sortedResults, handleSort, SortIcon) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="p-6 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-6 bg-blue-500 rounded-full" />
          <h3 className="font-bold text-slate-900 dark:text-white">Detalle de Asignación</h3>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 dark:bg-slate-900/50">
            <tr>
              {[
                ['decision', 'Decisión'],
                ['proyecto', 'Proyecto'],
                ['gerencia', 'Gerencia'],
                ['categoria', 'Categoría'],
                ['vir', 'VIR'],
                ['rmi', 'RMI'],
                ['costo', 'Costo Total'],
                ['estado', 'Estado'],
              ].map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => handleSort(key)}
                  className="px-4 py-3 text-left text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <div className="flex items-center">
                    {label}
                    <SortIcon columnKey={key} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {sortedResults.map((project, index) => (
              <tr key={index} className={`${project.status === 'approved' ? 'bg-emerald-50/50 dark:bg-emerald-900/5' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
                <td className="px-4 py-3 whitespace-nowrap text-sm">
                  {project.status === 'approved' ? (
                    <div className="flex items-center text-emerald-600 dark:text-emerald-400"><CheckCircle className="w-4 h-4 mr-1" />Aprobado</div>
                  ) : (
                    <div className="text-slate-400 dark:text-slate-500">Postergado</div>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-slate-900 dark:text-white font-medium max-w-[220px] truncate">{project.nombre}</td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{project.gerencia}</td>
                <td className="px-4 py-3"><span className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-xs">{project.categoria}</span></td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 tabular-nums">{Number(project.vir || 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 tabular-nums">{Number(project.rmi || 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 tabular-nums">{formatCurrency(getCost5Y(project))}</td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{project.estado || 'Solicitado'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
