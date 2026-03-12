import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, ComposedChart, Line
} from 'recharts';
import { Calculator, Settings as SettingsIcon, Database, CheckCircle, XCircle, Loader2, Save, Info, Upload, Download, Plus, Edit2, Trash2, ChevronDown, ChevronUp, ArrowUpDown, X, Filter, RefreshCw } from 'lucide-react';

const API_BASE = 'http://localhost:8001';

const HISTORICAL_DATA = {
    'HISTORICO 2020': {
        'ACTIVACIÓN FINANCIERA': 2200,
        'CRECIMIENTO': 14000,
        'FILIALES': 1000,
        'MEJORAS': 9500,
        'REPOSICIÓN': 20000,
        'TARIFA': 18000
    },
    'HISTORICO 2019': {
        'ACTIVACIÓN FINANCIERA': 1900,
        'CRECIMIENTO': 12500,
        'FILIALES': 850,
        'MEJORAS': 8000,
        'REPOSICIÓN': 18500,
        'TARIFA': 16500
    },
    'HISTORICO 2018': {
        'ACTIVACIÓN FINANCIERA': 1600,
        'CRECIMIENTO': 11000,
        'FILIALES': 750,
        'MEJORAS': 7000,
        'REPOSICIÓN': 16000,
        'TARIFA': 14500
    },
    'HISTORICO 2017': {
        'ACTIVACIÓN FINANCIERA': 1400,
        'CRECIMIENTO': 9500,
        'FILIALES': 650,
        'MEJORAS': 6000,
        'REPOSICIÓN': 14000,
        'TARIFA': 12500
    },
    'HISTORICO 2015-2020': {
        'ACTIVACIÓN FINANCIERA': 1000,
        'CRECIMIENTO': 8000,
        'FILIALES': 500,
        'MEJORAS': 5000,
        'REPOSICIÓN': 12000,
        'TARIFA': 10000
    },
    'HISTORICO 2009-2014': {
        'ACTIVACIÓN FINANCIERA': 800,
        'CRECIMIENTO': 6000,
        'FILIALES': 400,
        'MEJORAS': 4000,
        'REPOSICIÓN': 9000,
        'TARIFA': 7500
    }
};

export default function Dashboard({ isDarkMode }) {
    const [projects, setProjects] = useState([]);
    const [settings, setSettings] = useState(null);
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [editableBudget, setEditableBudget] = useState({});
    const [editableLimits, setEditableLimits] = useState({});
    const [editableUf, setEditableUf] = useState(38000);
    const [editableAnoCurso, setEditableAnoCurso] = useState(2026);
    const [editableAnoPriorizar, setEditableAnoPriorizar] = useState(2027);
    const [editableMinimoPriorizar, setEditableMinimoPriorizar] = useState(1000);
    const [editableHistorico, setEditableHistorico] = useState({});
    const [editableDrivers, setEditableDrivers] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [isSyncingUf, setIsSyncingUf] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const [limitError, setLimitError] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'decision', direction: 'desc' });
    const [bddSortConfig, setBddSortConfig] = useState({ key: 'pep', direction: 'asc' });
    const [lastOptimizeConfig, setLastOptimizeConfig] = useState({ method: '', metric: '' });
    const [selectedHistoricalPeriod, setSelectedHistoricalPeriod] = useState('HISTORICO 2015-2020');
    const saveRef = useRef(null);

    // Helper to format numbers for Chile (thousands: . , decimals: ,)
    const formatNumber = (val) => {
        if (val === undefined || val === null || val === '') return '';
        const stringVal = val.toString().replace(',', '.');
        const [int, dec] = stringVal.split('.');
        const formattedInt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        return dec !== undefined ? `${formattedInt},${dec}` : formattedInt;
    };

    const parseNumber = (val) => {
        if (!val) return "";
        // Remove dots (thousands) and replace comma with dot (decimal)
        const clean = val.toString().replace(/\./g, '').replace(',', '.');
        return clean;
    };

    // Method & Metric selectors
    const [optimizeMethod, setOptimizeMethod] = useState('optimization');
    const [optimizeMetric, setOptimizeMetric] = useState('vir');
    const [showCLP, setShowCLP] = useState(false);

    // Upload state
    const [isUploading, setIsUploading] = useState(false);
    const [uploadReset, setUploadReset] = useState(false);

    // CRUD modal state
    const [showModal, setShowModal] = useState(false);
    const [editingProject, setEditingProject] = useState(null);
    const [modalForm, setModalForm] = useState({
        pep: '', nombre: '', categoria: 'REPOSICIÓN', gerencia: 'G. TERRITORIALES',
        subcategoria: '', criterio_codir: '', tipo_proyecto: '', plan: '', estado: 'Solicitado',
        rmi: 0, vir: 0,
        flujo_caja: { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0 }
    });

    // Tabs
    const [activeTab, setActiveTab] = useState('dashboard');

    // Load Initial Data
    useEffect(() => {
        fetchData();

        // Listen for navigation events from the global Navbar
        const handleNav = () => setActiveTab('dashboard');
        window.addEventListener('nav-to-dashboard', handleNav);
        return () => window.removeEventListener('nav-to-dashboard', handleNav);
    }, []);

    const fetchData = async () => {
        setLoading(true);
        console.log("Iniciando carga de datos...");
        try {
            const [pRes, sRes] = await Promise.all([
                axios.get(`${API_BASE}/projects/`).catch(e => {
                    console.error("Error cargando proyectos:", e);
                    return { data: [] };
                }),
                axios.get(`${API_BASE}/settings/`).catch(e => {
                    console.error("Error cargando configuración:", e);
                    return { data: null };
                })
            ]);

            if (pRes.data) {
                console.log(`Proyectos cargados: ${pRes.data.length}`);
                setProjects(pRes.data);
            }

            if (sRes.data) {
                console.log("Configuración cargada:", sRes.data);
                const s = sRes.data;
                setSettings(s);

                // Initialize editable copies con fallbacks seguros
                setEditableBudget(s.presupuesto_anual || {});
                setEditableUf(s.valor_uf || 38000);
                setEditableAnoCurso(s.ano_en_curso ?? 2026);
                setEditableAnoPriorizar(s.ano_priorizar ?? 2027);
                setEditableMinimoPriorizar(s.minimo_priorizar_uf ?? 1000);
                setEditableHistorico(s.historico_promedios || {});
                setEditableDrivers(s.drivers_categoria || {});

                const baseLimits = s.limites_categoria || {};
                const limits = {};
                Object.entries(baseLimits).forEach(([cat, val]) => {
                    limits[cat] = (val * 100).toString();
                });
                setEditableLimits(limits);
            } else {
                console.warn("No se pudo obtener la configuración del backend.");
            }
        } catch (e) {
            console.error("Error crítico en fetchData:", e);
        }
        setLoading(false);
    };

    const handleOptimize = async (mode) => {
        setIsOptimizing(true);
        try {
            const res = await axios.post(`${API_BASE}/optimize/`, {
                method: optimizeMethod,
                metric: optimizeMetric,
                mode: mode
            });
            setResults(res.data);
            setLastOptimizeConfig({ method: optimizeMethod, metric: optimizeMetric, mode: mode });
            setActiveTab('results');
        } catch (e) {
            alert('Error en la optimización: ' + (e.response?.data?.detail || e.message));
            console.error(e);
        }
        setIsOptimizing(false);
    };

    const handleUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            await axios.post(`${API_BASE}/projects/upload?reset=${uploadReset}`, formData);
            await fetchData();
            setResults(null);
        } catch (err) {
            alert(err.response?.data?.detail || 'Error al importar archivo');
        }
        setIsUploading(false);
        e.target.value = '';
    };

    const handleExport = () => {
        if (!projects || projects.length === 0) return;

        const headers = ["PEP", "DEFINICIÓN DE PROYECTO", "GERENCIA EJECUTANTE", "AÑO 0", "AÑO 1", "AÑO 2", "AÑO 3", "AÑO 4", "TOTAL PROYECTO", "ESTADO", "CATEGORÍA", "SUBCATEGORÍA", "CRITERIO CODIR", "TIPO DE PROYECTO", "PLAN AL QUE PERTENECE", "RMI", "VIR", "MAX (RMI/VIR)", "FORZADO"];

        let csvContent = "\uFEFF" + headers.join(";") + "\n";

        projects.forEach(p => {
            const flujo = p.flujo_caja || {};
            const a0 = flujo['0'] || 0;
            const a1 = flujo['1'] || 0;
            const a2 = flujo['2'] || 0;
            const a3 = flujo['3'] || 0;
            const a4 = flujo['4'] || 0;
            const totalProj = a0 + a1 + a2 + a3 + a4;
            const maxRmiVir = Math.max(p.rmi || 0, p.vir || 0);
            const r = [
                p.pep, p.nombre, p.gerencia,
                a0, a1, a2, a3, a4, totalProj,
                p.estado, p.categoria, p.subcategoria,
                p.criterio_codir, p.tipo_proyecto, p.plan,
                p.rmi, p.vir, maxRmiVir,
                (p.estado || "Solicitado") === "Adjudicado" ? "Sí" : "No"
            ];
            const rowStr = r.map(val => {
                let s = String(val ?? '');
                return s.includes(';') ? `"${s.replace(/"/g, '""')}"` : s;
            }).join(';');
            csvContent += rowStr + "\n";
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "proyectos_export.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const openCreateModal = () => {
        setEditingProject(null);
        setModalForm({
            pep: '', nombre: '', categoria: 'REPOSICIÓN', gerencia: 'G. TERRITORIALES',
            subcategoria: '', criterio_codir: '', tipo_proyecto: '', plan: '', estado: 'Solicitado',
            rmi: 0, vir: 0,
            flujo_caja: { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0 }
        });
        setShowModal(true);
    };

    const openEditModal = (project) => {
        setEditingProject(project);
        setModalForm({
            pep: project.pep || '', nombre: project.nombre, categoria: project.categoria, gerencia: project.gerencia,
            subcategoria: project.subcategoria || '', criterio_codir: project.criterio_codir || '',
            tipo_proyecto: project.tipo_proyecto || '', plan: project.plan || '', estado: project.estado || 'Solicitado',
            rmi: project.rmi, vir: project.vir,
            flujo_caja: { ...project.flujo_caja }
        });
        setShowModal(true);
    };

    const handleSaveProject = async () => {
        try {
            const payload = {
                ...modalForm,
                rmi: parseFloat(modalForm.rmi) || 0,
                vir: parseFloat(modalForm.vir) || 0,
                flujo_caja: Object.fromEntries(
                    Object.entries(modalForm.flujo_caja).map(([k, v]) => [k, parseFloat(v) || 0])
                ),
            };
            if (editingProject) {
                await axios.put(`${API_BASE}/projects/${editingProject.id}`, payload);
            } else {
                await axios.post(`${API_BASE}/projects/`, payload);
            }
            setShowModal(false);
            await fetchData();
        } catch (err) {
            alert('Error al guardar proyecto');
        }
    };

    const handleDeleteProject = async (id) => {
        if (!window.confirm('¿Eliminar este proyecto?')) return;
        try {
            await axios.delete(`${API_BASE}/projects/${id}`);
            await fetchData();
        } catch (err) {
            alert('Error al eliminar');
        }
    };

    const handleSaveSettings = async () => {
        const totalPercent = Object.values(editableLimits).reduce((acc, val) => acc + (parseFloat(val) || 0), 0);
        if (totalPercent > 100) {
            setLimitError('La suma de los limites debe ser 100% o menos.');
            setTimeout(() => setLimitError(null), 4000);
            return;
        }
        setIsSaving(true);
        setSaveMessage(null);
        setLimitError(null);
        try {
            const payload = {
                presupuesto_anual: Object.fromEntries(
                    Object.entries(editableBudget).map(([k, v]) => [k, parseFloat(v) || 0])
                ),
                valor_uf: parseFloat(editableUf) || 38000,
                limites_categoria: Object.fromEntries(
                    Object.entries(editableLimits).map(([k, v]) => [k, (parseFloat(v) || 0) / 100])
                ),
                ano_en_curso: parseInt(editableAnoCurso) || 2026,
                ano_priorizar: parseInt(editableAnoPriorizar) || 2027,
                minimo_priorizar_uf: parseFloat(editableMinimoPriorizar) || 0,
                historico_promedios: Object.fromEntries(
                    Object.entries(editableHistorico).map(([k, v]) => [k, parseFloat(v) || 0])
                ),
                drivers_categoria: editableDrivers
            };
            const res = await axios.put(`${API_BASE}/settings/`, payload);
            setSettings(res.data);
            setSaveMessage('success');
            setTimeout(() => setSaveMessage(null), 6000);
        } catch (e) {
            console.error('Error saving settings', e);
            setSaveMessage('error');
            setTimeout(() => setSaveMessage(null), 6000);
        }
        setIsSaving(false);
    };

    const handleSyncUf = async () => {
        setIsSyncingUf(true);
        try {
            const res = await axios.get(`${API_BASE}/settings/fetch-uf`);
            setEditableUf(res.data.valor_uf);
        } catch (e) {
            console.error('Error fetching UF', e);
            setSaveMessage('error');
            setTimeout(() => setSaveMessage(null), 4000);
        }
        setIsSyncingUf(false);
    };

    const handleBudgetChange = (year, value) => {
        const clean = parseNumber(value);
        if (/^\d*\.?\d*$/.test(clean)) {
            setEditableBudget(prev => ({ ...prev, [year]: clean }));
        }
    };

    const handleLimitChange = (cat, value) => {
        const numericValue = value.replace(/[^0-9.]/g, '');
        setEditableLimits(prev => ({ ...prev, [cat]: numericValue }));
    };

    const handleHistoricoChange = (period) => {
        setSelectedHistoricalPeriod(period);
        if (HISTORICAL_DATA[period]) {
            setEditableHistorico(HISTORICAL_DATA[period]);
        }
    };

    const limitsTotal = Object.values(editableLimits).reduce((acc, val) => acc + (parseFloat(val) || 0), 0);
    const isLimitOver = limitsTotal > 100;

    // Resolve dynamic year label
    const getYearLabel = (yIndex) => {
        if (!settings) return `Año ${yIndex}`;
        const actualYear = settings.ano_en_curso + parseInt(yIndex, 10);
        return `Año ${yIndex}: ${actualYear}`;
    };

    const getSortedResults = () => {
        if (!results) return [];
        const combined = [
            ...results.selected.map(p => ({ ...p, status: 'approved' })),
            ...results.rejected.map(p => ({ ...p, status: 'rejected' }))
        ];

        if (!sortConfig.key) return combined;

        return combined.sort((a, b) => {
            let valA, valB;
            switch (sortConfig.key) {
                case 'decision': valA = a.status === 'approved' ? 1 : 0; valB = b.status === 'approved' ? 1 : 0; break;
                case 'proyecto': valA = a.nombre; valB = b.nombre; break;
                case 'gerencia': valA = a.gerencia; valB = b.gerencia; break;
                case 'categoria': valA = a.categoria; valB = b.categoria; break;
                case 'vir': valA = a.vir || 0; valB = b.vir || 0; break;
                case 'rmi': valA = a.rmi || 0; valB = b.rmi || 0; break;
                case 'costo':
                    valA = Object.values(a.flujo_caja || {}).reduce((sum, v) => sum + v, 0);
                    valB = Object.values(b.flujo_caja || {}).reduce((sum, v) => sum + v, 0);
                    break;
                case 'estado': valA = a.estado; valB = b.estado; break;
                default: valA = 0; valB = 0;
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    };

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handleBddSort = (key) => {
        let direction = 'asc';
        if (bddSortConfig.key === key && bddSortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setBddSortConfig({ key, direction });
    };

    const SortIcon = ({ columnKey, isBdd = false }) => {
        const currentConfig = isBdd ? bddSortConfig : sortConfig;
        if (currentConfig.key !== columnKey) return <ArrowUpDown className="w-3 h-3 ml-1 text-gray-400 dark:text-slate-500 opacity-50 group-hover:opacity-100 transition-opacity" />;
        return currentConfig.direction === 'asc'
            ? <ChevronUp className="w-3 h-3 ml-1 text-primary-500" />
            : <ChevronDown className="w-3 h-3 ml-1 text-primary-500" />;
    };

    const getSortedBddResults = () => {
        if (!projects) return [];
        let sorted = [...projects];

        if (!bddSortConfig.key) return sorted;

        return sorted.sort((a, b) => {
            let valA, valB;
            switch (bddSortConfig.key) {
                case 'pep': valA = a.pep; valB = b.pep; break;
                case 'nombre': valA = a.nombre; valB = b.nombre; break;
                case 'gerencia': valA = a.gerencia; valB = b.gerencia; break;
                case 'categoria': valA = a.categoria; valB = b.categoria; break;
                case 'subcategoria': valA = a.subcategoria; valB = b.subcategoria; break;
                case 'vir': valA = parseFloat(a.vir) || 0; valB = parseFloat(b.vir) || 0; break;
                case 'rmi': valA = parseFloat(a.rmi) || 0; valB = parseFloat(b.rmi) || 0; break;
                case 'van': valA = parseFloat(a.van) || 0; valB = parseFloat(b.van) || 0; break;
                case 'tir': valA = parseFloat(a.tir) || 0; valB = parseFloat(b.tir) || 0; break;
                case 'estado': valA = a.estado; valB = b.estado; break;
                case 'costo':
                    valA = Object.values(a.flujo_caja || {}).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
                    valB = Object.values(b.flujo_caja || {}).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
                    break;
                default: valA = 0; valB = 0;
            }

            if (valA < valB) return bddSortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return bddSortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    };

    const uniqueSubcategories = [...new Set(projects.map(p => p.subcategoria).filter(Boolean))].sort();

    const renderKPIs = () => {
        if (!results || !settings) return null;

        const totalBudget = Object.values(settings.presupuesto_anual).reduce((acc, curr) => acc + curr, 0);
        const remainingBudget = Object.values(results.remaining_budget).reduce((acc, curr) => acc + curr, 0);
        const utilizedBudget = totalBudget - remainingBudget;

        const utilizationPct = ((utilizedBudget / totalBudget) * 100).toFixed(1);
        const totalVir = results.selected.reduce((acc, curr) => acc + (curr.vir || 0), 0).toFixed(1);

        const methodLabel = lastOptimizeConfig.method === 'optimization' ? 'Optimizador (PuLP)' : 'Rankeador (Greedy)';
        const metricLabel = lastOptimizeConfig.metric === 'vir' ? 'VIR' :
            lastOptimizeConfig.metric === 'rmi' ? 'RMI' :
                lastOptimizeConfig.metric === 'max_rmi_vir' ? 'MAX (RMI/VIR)' :
                    lastOptimizeConfig.metric === 'personalizado' ? 'Personalizado' : lastOptimizeConfig.metric;

        return (
            <>
                <div className="flex items-center gap-3 mb-4 px-1">
                    <div className="flex items-center bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-full text-xs font-medium border border-blue-100 dark:border-blue-800">
                        <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                        {methodLabel}
                    </div>
                    <div className="flex items-center bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-3 py-1.5 rounded-full text-xs font-medium border border-indigo-100 dark:border-indigo-800">
                        <Calculator className="w-3.5 h-3.5 mr-1.5" />
                        Criterio: {metricLabel}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-md border border-blue-100 dark:border-slate-700 hover:shadow-lg transition-shadow relative overflow-hidden group">
                        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-blue-50 dark:bg-blue-900/30 rounded-full blur-xl transition-colors"></div>
                        <p className="text-sm text-blue-600/80 dark:text-gray-400 relative z-10">Presupuesto Utilizado (5 Años)</p>
                        <p className="text-4xl text-blue-900 dark:text-white mt-2 relative z-10">${utilizedBudget.toLocaleString()}</p>
                        <p className="text-sm text-blue-600/80 dark:text-gray-400 mt-2 relative z-10">
                            <span className="text-blue-700 dark:text-blue-400 font-medium">{utilizationPct}%</span> del total disponible
                        </p>
                    </div>

                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-md border border-emerald-100 dark:border-slate-700 hover:shadow-lg transition-shadow relative overflow-hidden group">
                        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-emerald-50 dark:bg-emerald-900/30 rounded-full blur-xl transition-colors"></div>
                        <p className="text-sm text-emerald-600/80 dark:text-gray-400 relative z-10">Proyectos Aprobados</p>
                        <p className="text-4xl text-emerald-900 dark:text-white mt-2 relative z-10">{results.selected.length}</p>
                        <p className="text-sm text-emerald-600/80 dark:text-gray-400 mt-2 relative z-10">de {projects.length} totales</p>
                    </div>

                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-md border border-indigo-100 dark:border-slate-700 hover:shadow-lg transition-shadow relative overflow-hidden group">
                        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-indigo-50 dark:bg-indigo-900/30 rounded-full blur-xl transition-colors"></div>
                        <p className="text-sm text-indigo-600/80 dark:text-gray-400 relative z-10">VIR Total Cartera</p>
                        <p className="text-4xl text-indigo-900 dark:text-white mt-2 relative z-10">{totalVir}</p>
                    </div>
                </div>
            </>
        );
    };

    const renderCharts = () => {
        if (!results) return null;

        const gerenciaMap = {};
        results.selected.forEach(p => {
            const cost = Object.values(p.flujo_caja).reduce((acc, val) => acc + val, 0);
            gerenciaMap[p.gerencia] = (gerenciaMap[p.gerencia] || 0) + cost;
        });
        const pieData = Object.keys(gerenciaMap).map(k => ({ name: k, value: gerenciaMap[k] }));

        const catMap = {};
        results.selected.forEach(p => {
            const cost = Object.values(p.flujo_caja).reduce((acc, val) => acc + val, 0);
            catMap[p.categoria] = (catMap[p.categoria] || 0) + cost;
        });
        const barData = Object.keys(catMap).map(k => ({ name: k, monto: catMap[k] }));

        // Bolsas chart data: grouped bars per year + limit line
        const bolsasData = (() => {
            if (!results.budget_matrix || !settings) return [];
            const matrix = results.budget_matrix;
            const cats = Object.keys(matrix).filter(k => k !== 'TOTAL');
            return cats.map(cat => {
                const entry = { name: cat };
                const catData = matrix[cat];
                let totalLimit = 0;
                ['0', '1', '2', '3', '4'].forEach(y => {
                    const yearData = catData?.years?.[y] || {};
                    const yearLabel = `Año ${y}: ${settings.ano_en_curso + parseInt(y)}`;
                    entry[yearLabel] = Math.round((yearData.pre_adjudicado || 0) + (yearData.agregado || 0));
                    totalLimit += (yearData.budget_limit || 0);
                });
                entry['Límite 5Y'] = Math.round(totalLimit);
                return entry;
            });
        })();

        const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1'];
        const textColor = isDarkMode ? '#e2e8f0' : '#475569';
        const gridColor = isDarkMode ? '#334155' : '#e2e8f0';

        return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-md border border-gray-100 dark:border-slate-700 h-96 transition-all duration-300">
                    <h3 className="text-lg mb-6 text-gray-800 dark:text-gray-100 flex items-center">
                        <div className="w-2 h-6 bg-blue-500 rounded-full mr-3"></div>
                        Presupuesto por Gerencia
                    </h3>
                    <ResponsiveContainer width="100%" height="80%">
                        <PieChart>
                            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5}>
                                {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} stroke="rgba(0,0,0,0)" />)}
                            </Pie>
                            <RechartsTooltip
                                formatter={(value) => `$${value.toLocaleString()}`}
                                contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.3)',
                                    backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
                                    color: isDarkMode ? '#ffffff' : '#000000'
                                }}
                                itemStyle={{ color: isDarkMode ? '#ffffff' : '#000000' }}
                                labelStyle={{ color: isDarkMode ? '#ffffff' : '#000000' }}
                            />
                            <Legend
                                verticalAlign="bottom"
                                height={60}
                                wrapperStyle={{
                                    paddingTop: '20px',
                                    color: isDarkMode ? '#ffffff' : '#475569'
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-md border border-gray-100 dark:border-slate-700 h-96 transition-all duration-300">
                    <h3 className="text-lg mb-6 text-gray-800 dark:text-gray-100 flex items-center">
                        <div className="w-2 h-6 bg-emerald-500 rounded-full mr-3"></div>
                        Bolsas de Priorización por Categoría
                    </h3>
                    <ResponsiveContainer width="100%" height="80%">
                        <ComposedChart data={bolsasData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: textColor, fontSize: 10 }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: textColor, fontSize: 12 }} />
                            <RechartsTooltip
                                cursor={{ fill: isDarkMode ? '#334155' : '#f1f5f9' }}
                                formatter={(value) => `$${value.toLocaleString()}`}
                                contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.3)',
                                    backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
                                    color: isDarkMode ? '#ffffff' : '#000000'
                                }}
                                itemStyle={{ color: isDarkMode ? '#ffffff' : '#000000' }}
                                labelStyle={{ color: isDarkMode ? '#ffffff' : '#000000' }}
                            />
                            <Legend wrapperStyle={{ color: isDarkMode ? '#ffffff' : '#475569', fontSize: '11px' }} />
                            {bolsasData.length > 0 && Object.keys(bolsasData[0]).filter(k => k !== 'name' && k !== 'Límite 5Y').map((yearKey, i) => {
                                const YEAR_COLORS = ['#94a3b8', '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981'];
                                return <Bar key={yearKey} dataKey={yearKey} fill={YEAR_COLORS[i % YEAR_COLORS.length]} radius={[3, 3, 0, 0]} barSize={12} />;
                            })}
                            <Line type="stepAfter" dataKey="Límite 5Y" stroke="#f97316" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 4, fill: '#f97316' }} name="Límite 5Y" />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>
        );
    }

    if (loading) return (
        <div className="flex flex-col items-center justify-center mt-32">
            <Loader2 className="w-12 h-12 text-primary-500 animate-spin mb-4" />
            <p className="text-lg text-gray-500 dark:text-gray-400">Cargando base de datos...</p>
        </div>
    );

    return (
        <>
            <div>
                {/* Navigation Tabs */}
                <div className="border-b border-gray-200 dark:border-slate-700 mb-8">
                    <nav className="-mb-px flex space-x-8 overflow-x-auto pb-1">
                        <a onClick={() => setActiveTab('dashboard')} className={`${activeTab === 'dashboard' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-slate-600'} whitespace-nowrap py-4 px-1 border-b-2 cursor-pointer flex items-center transition-colors`}>
                            <Calculator className="w-5 h-5 mr-2" />
                            Simulador
                        </a>
                        <a onClick={() => setActiveTab('bdd')} className={`${activeTab === 'bdd' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-slate-600'} whitespace-nowrap py-4 px-1 border-b-2 cursor-pointer flex items-center transition-colors`}>
                            <Database className="w-5 h-5 mr-2" />
                            Base de Proyectos
                        </a>
                        <a onClick={() => setActiveTab('settings')} className={`${activeTab === 'settings' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-slate-600'} whitespace-nowrap py-4 px-1 border-b-2 cursor-pointer flex items-center transition-colors`}>
                            <SettingsIcon className="w-5 h-5 mr-2" />
                            Configuración
                        </a>
                        {results && (
                            <a onClick={() => setActiveTab('results')} className={`${activeTab === 'results' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-slate-600'} whitespace-nowrap py-4 px-1 border-b-2 cursor-pointer flex items-center transition-colors`}>
                                Resultados de Cartera
                            </a>
                        )}
                    </nav>
                </div>

                {activeTab === 'dashboard' && (
                    <div className="text-center p-16 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-blue-50 dark:border-slate-700 max-w-4xl mx-auto relative overflow-hidden">
                        <div className="absolute -top-32 -left-32 w-64 h-64 bg-primary-100 dark:bg-primary-900/40 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
                        <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-blue-100 dark:bg-blue-900/40 rounded-full blur-3xl opacity-50 pointer-events-none"></div>

                        <h2 className="text-3xl text-gray-900 dark:text-white mb-6 relative z-10">Motor de Priorización CAPEX</h2>
                        <p className="text-lg text-gray-500 dark:text-gray-400 mb-8 max-w-2xl mx-auto relative z-10 leading-relaxed">
                            {optimizeMethod === 'optimization'
                                ? 'Programación Lineal Entera (Knapsack): encuentra la combinación óptima de proyectos maximizando el beneficio total respetando restricciones de presupuesto y categoría.'
                                : 'Rankeador Greedy: ordena los proyectos por métrica y los aprueba secuencialmente hasta agotar el presupuesto.'}
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10 relative z-10">
                            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-blue-100 dark:border-slate-700 text-left w-full sm:w-64 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Método</label>
                                <select
                                    value={optimizeMethod}
                                    onChange={(e) => setOptimizeMethod(e.target.value)}
                                    className="bg-transparent text-gray-900 dark:text-gray-100 dark:bg-slate-800 text-sm outline-none border-none cursor-pointer w-full"
                                >
                                    <option value="optimization">Optimizador (PuLP)</option>
                                    <option value="ranker">Rankeador (Greedy)</option>
                                </select>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-blue-100 dark:border-slate-700 text-left w-full sm:w-64 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Métrica</label>
                                <select
                                    value={optimizeMetric}
                                    onChange={(e) => setOptimizeMetric(e.target.value)}
                                    className="bg-transparent text-gray-900 dark:text-gray-100 dark:bg-slate-800 text-sm outline-none border-none cursor-pointer w-full"
                                >
                                    <option value="vir">VIR (Valor Importancia Relativa)</option>
                                    <option value="rmi">RMI (Risk Management Index)</option>
                                    <option value="max_rmi_vir">MAX (RMI/VIR)</option>
                                    <option value="personalizado">Personalizado (Por Categoría)</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 justify-center mx-auto relative z-10">
                            <button
                                onClick={() => handleOptimize("poa")}
                                disabled={isOptimizing}
                                className={`flex-1 flex items-center justify-center px-8 py-4 rounded-xl text-lg font-medium transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1 active:translate-y-0 ${isOptimizing ? 'bg-indigo-300 text-white cursor-not-allowed' : 'bg-white text-indigo-600 border-2 border-indigo-500 hover:bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-500/50 dark:hover:bg-indigo-900/40'}`}
                            >
                                {isOptimizing ? <Loader2 className="w-6 h-6 mr-3 animate-spin" /> : null}
                                {isOptimizing ? 'Optimizando...' : 'OPTIMIZAR POA'}
                            </button>
                            <button
                                onClick={() => handleOptimize("pmp")}
                                disabled={isOptimizing}
                                className={`flex-1 flex items-center justify-center px-8 py-4 rounded-xl text-lg text-white font-medium transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1 active:translate-y-0 ${isOptimizing ? 'bg-primary-400 cursor-not-allowed' : 'bg-gradient-to-r from-primary-600 to-blue-500 hover:from-primary-500 hover:to-blue-400'}`}
                            >
                                {isOptimizing ? <Loader2 className="w-6 h-6 mr-3 animate-spin" /> : null}
                                {isOptimizing ? 'Optimizando...' : 'OPTIMIZAR PMP'}
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'results' && results && (
                    <div>
                        {renderKPIs()}

                        {/* Executive Summary + UF/CLP Toggle */}
                        {settings && results && (() => {
                            const ufMultiplier = showCLP ? (settings.valor_uf || 38000) : 1;
                            const unit = showCLP ? 'CLP (MM$)' : 'UF';

                            return (
                                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md border border-gray-100 dark:border-slate-700 mb-8 overflow-hidden">
                                    <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/30">
                                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center">
                                            <div className="w-2 h-4 bg-cyan-500 rounded-full mr-2"></div>
                                            Resumen Ejecutivo por Año ({unit})
                                        </h3>
                                        <button
                                            onClick={() => setShowCLP(!showCLP)}
                                            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${showCLP
                                                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                                : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                                }`}
                                        >
                                            {showCLP ? '$ CLP → UF' : 'UF → $ CLP'}
                                        </button>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full text-xs">
                                            <thead>
                                                <tr className="bg-gray-50 dark:bg-slate-900/50">
                                                    <th className="px-4 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Concepto</th>
                                                    {[0, 1, 2, 3, 4].map(y => (
                                                        <th key={y} className="px-4 py-2 text-right text-gray-500 dark:text-gray-400 font-medium">
                                                            {getYearLabel(y)}
                                                        </th>
                                                    ))}
                                                    <th className="px-4 py-2 text-right text-gray-500 dark:text-gray-400 font-medium border-l border-gray-200 dark:border-slate-600">Total 5Y</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr className="border-t border-gray-100 dark:border-slate-700">
                                                    <td className="px-4 py-2 text-gray-600 dark:text-gray-300 font-medium">Límite</td>
                                                    {[0, 1, 2, 3, 4].map(y => {
                                                        const val = (settings.presupuesto_anual[String(y)] || 0) * ufMultiplier;
                                                        return <td key={y} className="px-4 py-2 text-right text-gray-600 dark:text-gray-300 tabular-nums">
                                                            {formatNumber(Math.round(showCLP ? val / 1000000 : val))}
                                                        </td>;
                                                    })}
                                                    <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-300 tabular-nums font-medium border-l border-gray-200 dark:border-slate-600">
                                                        {formatNumber(Math.round(showCLP
                                                            ? Object.values(settings.presupuesto_anual).reduce((a, b) => a + b, 0) * ufMultiplier / 1000000
                                                            : Object.values(settings.presupuesto_anual).reduce((a, b) => a + b, 0)
                                                        ))}
                                                    </td>
                                                </tr>
                                                <tr className="border-t border-gray-100 dark:border-slate-700">
                                                    <td className="px-4 py-2 font-medium">
                                                        <span className="text-blue-700 dark:text-blue-400">Resultado</span>
                                                    </td>
                                                    {[0, 1, 2, 3, 4].map(y => {
                                                        const budget = settings.presupuesto_anual[String(y)] || 0;
                                                        const remaining = results.remaining_budget[String(y)] || 0;
                                                        const spent = (budget - remaining) * ufMultiplier;
                                                        return <td key={y} className="px-4 py-2 text-right text-blue-700 dark:text-blue-400 tabular-nums font-medium">
                                                            {formatNumber(Math.round(showCLP ? spent / 1000000 : spent))}
                                                        </td>;
                                                    })}
                                                    <td className="px-4 py-2 text-right text-blue-700 dark:text-blue-400 tabular-nums font-bold border-l border-gray-200 dark:border-slate-600">
                                                        {(() => {
                                                            const totalSpent = [0, 1, 2, 3, 4].reduce((acc, y) => {
                                                                const b = settings.presupuesto_anual[String(y)] || 0;
                                                                const r = results.remaining_budget[String(y)] || 0;
                                                                return acc + (b - r);
                                                            }, 0) * ufMultiplier;
                                                            return formatNumber(Math.round(showCLP ? totalSpent / 1000000 : totalSpent));
                                                        })()}
                                                    </td>
                                                </tr>
                                                <tr className="border-t border-gray-100 dark:border-slate-700 bg-emerald-50/30 dark:bg-emerald-900/10">
                                                    <td className="px-4 py-2 font-medium">
                                                        <span className="text-emerald-700 dark:text-emerald-400">Restante</span>
                                                    </td>
                                                    {[0, 1, 2, 3, 4].map(y => {
                                                        const val = (results.remaining_budget[String(y)] || 0) * ufMultiplier;
                                                        return <td key={y} className="px-4 py-2 text-right text-emerald-700 dark:text-emerald-400 tabular-nums font-medium">
                                                            {formatNumber(Math.round(showCLP ? val / 1000000 : val))}
                                                        </td>;
                                                    })}
                                                    <td className="px-4 py-2 text-right text-emerald-700 dark:text-emerald-400 tabular-nums font-bold border-l border-gray-200 dark:border-slate-600">
                                                        {formatNumber(Math.round(showCLP
                                                            ? Object.values(results.remaining_budget).reduce((a, b) => a + b, 0) * ufMultiplier / 1000000
                                                            : Object.values(results.remaining_budget).reduce((a, b) => a + b, 0)
                                                        ))}
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })()}

                        {renderCharts()}

                        {/* Annual Budget Breakdown Chart */}
                        {settings && (() => {
                            const annualData = [0, 1, 2, 3, 4].map(y => {
                                const ys = String(y);
                                const budget = settings.presupuesto_anual[ys] || 0;
                                const remaining = results.remaining_budget[ys] || 0;
                                const spent = budget - remaining;
                                return { name: getYearLabel(y), Presupuesto: budget, Gastado: spent, Restante: remaining };
                            });
                            const textColor = isDarkMode ? '#e2e8f0' : '#475569';
                            const gridColor = isDarkMode ? '#334155' : '#e2e8f0';
                            return (
                                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-md border border-gray-100 dark:border-slate-700 mb-8 h-96">
                                    <h3 className="text-lg mb-6 text-gray-800 dark:text-gray-100 flex items-center">
                                        <div className="w-2 h-6 bg-amber-500 rounded-full mr-3"></div>
                                        Desglose Presupuestario por Año
                                    </h3>
                                    <ResponsiveContainer width="100%" height="80%">
                                        <BarChart data={annualData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: textColor, fontSize: 12 }} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: textColor, fontSize: 12 }} />
                                            <RechartsTooltip formatter={(v) => `$${v.toLocaleString()}`} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: isDarkMode ? '#1e293b' : '#fff', color: isDarkMode ? '#fff' : '#000' }} />
                                            <Legend wrapperStyle={{ color: textColor }} />
                                            <Bar dataKey="Presupuesto" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="Gastado" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="Restante" fill="#10b981" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            );
                        })()}

                        {/* --- BUDGET MATRIX: Detalle Resumen de Resultados --- */}
                        {results.budget_matrix && settings && (() => {
                            const matrix = results.budget_matrix;
                            const categories = Object.keys(matrix).filter(k => k !== 'TOTAL');
                            const years = ['0', '1', '2', '3', '4'];

                            const renderMatrixRow = (label, data, isTotal = false) => {
                                const yearTotals = years.reduce((acc, y) => ({
                                    budget_limit: acc.budget_limit + (data.years[y]?.budget_limit || 0),
                                    pre_adjudicado: acc.pre_adjudicado + (data.years[y]?.pre_adjudicado || 0),
                                    agregado: acc.agregado + (data.years[y]?.agregado || 0),
                                    rechazado: acc.rechazado + (data.years[y]?.rechazado || 0),
                                    total: acc.total + (data.years[y]?.total || 0),
                                }), { budget_limit: 0, pre_adjudicado: 0, agregado: 0, rechazado: 0, total: 0 });

                                const rowBase = isTotal
                                    ? 'bg-indigo-50/50 dark:bg-indigo-900/20 font-semibold'
                                    : 'hover:bg-gray-50 dark:hover:bg-slate-700/30';

                                const blockBorder = isTotal
                                    ? 'border-t-2 border-indigo-200 dark:border-indigo-800/50'
                                    : 'border-t-2 border-gray-200 dark:border-slate-700';

                                return (
                                    <React.Fragment key={label}>
                                        {/* Limit row */}
                                        <tr className={`${rowBase} ${blockBorder} transition-colors`}>
                                            <td rowSpan={5} className={`px-3 py-2 text-sm ${isTotal ? 'text-indigo-900 dark:text-indigo-200 font-bold' : 'text-gray-900 dark:text-gray-100'} align-middle border-r border-gray-200 dark:border-slate-600 whitespace-nowrap sticky left-0 z-10 ${isTotal ? 'bg-indigo-50 dark:bg-slate-800' : 'bg-white dark:bg-slate-800'} tabular-nums`}>
                                                {label}
                                            </td>
                                            <td className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Limite</td>
                                            {years.map(y => (
                                                <td key={y} className="px-3 py-1.5 text-xs text-right text-gray-500 dark:text-gray-400 tabular-nums">
                                                    {formatNumber(Math.round(data.years[y]?.budget_limit || 0))}
                                                </td>
                                            ))}
                                            <td className="px-3 py-1.5 text-xs text-right text-gray-500 dark:text-gray-400 tabular-nums font-medium border-l border-gray-200 dark:border-slate-600">
                                                {formatNumber(Math.round(yearTotals.budget_limit))}
                                            </td>
                                        </tr>
                                        {/* Pre-adjudicado row */}
                                        <tr className={`${rowBase} transition-colors`}>
                                            <td className="px-3 py-1.5 text-xs whitespace-nowrap">
                                                <span className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded text-xs">Pre-Adjudicado</span>
                                            </td>
                                            {years.map(y => (
                                                <td key={y} className="px-3 py-1.5 text-xs text-right text-emerald-700 dark:text-emerald-400 tabular-nums">
                                                    {formatNumber(Math.round(data.years[y]?.pre_adjudicado || 0))}
                                                </td>
                                            ))}
                                            <td className="px-3 py-1.5 text-xs text-right text-emerald-700 dark:text-emerald-400 tabular-nums font-medium border-l border-gray-200 dark:border-slate-600">
                                                {formatNumber(Math.round(yearTotals.pre_adjudicado))}
                                            </td>
                                        </tr>
                                        {/* Agregado row */}
                                        <tr className={`${rowBase} transition-colors`}>
                                            <td className="px-3 py-1.5 text-xs whitespace-nowrap">
                                                <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs">Agregado</span>
                                            </td>
                                            {years.map(y => (
                                                <td key={y} className="px-3 py-1.5 text-xs text-right text-blue-700 dark:text-blue-400 tabular-nums">
                                                    {formatNumber(Math.round(data.years[y]?.agregado || 0))}
                                                </td>
                                            ))}
                                            <td className="px-3 py-1.5 text-xs text-right text-blue-700 dark:text-blue-400 tabular-nums font-medium border-l border-gray-200 dark:border-slate-600">
                                                {formatNumber(Math.round(yearTotals.agregado))}
                                            </td>
                                        </tr>
                                        {/* Rechazado row */}
                                        <tr className={`${rowBase} transition-colors`}>
                                            <td className="px-3 py-1.5 text-xs whitespace-nowrap">
                                                <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-xs">Rechazado</span>
                                            </td>
                                            {years.map(y => (
                                                <td key={y} className="px-3 py-1.5 text-xs text-right text-red-600 dark:text-red-400 tabular-nums">
                                                    {formatNumber(Math.round(data.years[y]?.rechazado || 0))}
                                                </td>
                                            ))}
                                            <td className="px-3 py-1.5 text-xs text-right text-red-600 dark:text-red-400 tabular-nums font-medium border-l border-gray-200 dark:border-slate-600">
                                                {formatNumber(Math.round(yearTotals.rechazado))}
                                            </td>
                                        </tr>
                                        {/* Resultado row (Comprometido + Optimizado) */}
                                        <tr className={`${rowBase} border-b border-gray-100 dark:border-slate-700 transition-colors`}>
                                            <td className="px-3 py-1.5 text-xs whitespace-nowrap">
                                                <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-gray-200 rounded text-xs font-medium">Resultado</span>
                                            </td>
                                            {years.map(y => (
                                                <td key={y} className="px-3 py-1.5 text-xs text-right text-gray-800 dark:text-gray-200 tabular-nums font-medium">
                                                    {formatNumber(Math.round(data.years[y]?.total || 0))}
                                                </td>
                                            ))}
                                            <td className="px-3 py-1.5 text-xs text-right text-gray-800 dark:text-gray-200 tabular-nums font-bold border-l border-gray-200 dark:border-slate-600">
                                                {formatNumber(Math.round(yearTotals.total))}
                                            </td>
                                        </tr>
                                    </React.Fragment>
                                );
                            };

                            return (
                                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md border border-gray-100 dark:border-slate-700 mb-8 overflow-hidden">
                                    <div className="p-6 border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/30">
                                        <h3 className="text-lg text-gray-800 dark:text-gray-100 flex items-center">
                                            <div className="w-2 h-6 bg-violet-500 rounded-full mr-3"></div>
                                            Detalle Resumen de Resultados
                                        </h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-5">
                                            Desglose por categoría y año: Límite presupuestario, Presupuesto Pre-adjudicado (forzado) y Presupuesto Agregado (seleccionado por el optimizador).
                                        </p>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                                            <thead className="bg-gray-50 dark:bg-slate-900/50">
                                                <tr>
                                                    <th className="px-3 py-3 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider border-r border-gray-200 dark:border-slate-600 sticky left-0 z-10 bg-gray-50 dark:bg-slate-900/50">Categoría</th>
                                                    <th className="px-3 py-3 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Concepto</th>
                                                    {years.map(y => (
                                                        <th key={y} className="px-3 py-3 text-right text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                            {getYearLabel(y)} <span className="lowercase normal-case font-normal">(UF)</span>
                                                        </th>
                                                    ))}
                                                    <th className="px-3 py-3 text-right text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider border-l border-gray-200 dark:border-slate-600">Total 5Y <span className="lowercase normal-case font-normal">(UF)</span></th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white dark:bg-slate-800">
                                                {categories.map(cat => renderMatrixRow(cat, matrix[cat]))}
                                                {matrix.TOTAL && renderMatrixRow('TOTAL', matrix.TOTAL, true)}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })()}

                        <h3 className="text-2xl mb-6 text-gray-900 dark:text-white">Detalle de Asignación</h3>
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md border border-gray-100 dark:border-slate-700 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                                    <thead className="bg-gray-50 dark:bg-slate-900/50">
                                        <tr>
                                            {[
                                                { key: 'decision', label: 'Decisión' },
                                                { key: 'proyecto', label: 'Proyecto' },
                                                { key: 'gerencia', label: 'Gerencia' },
                                                { key: 'categoria', label: 'Categoría' },
                                                { key: 'vir', label: 'VIR' },
                                                { key: 'rmi', label: 'RMI' },
                                                { key: 'costo', label: 'Costo 5Y' },
                                                { key: 'estado', label: 'Estado' }
                                            ].map(({ key, label }) => (
                                                <th
                                                    key={key}
                                                    onClick={() => handleSort(key)}
                                                    className="px-4 py-4 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                                                >
                                                    <div className="flex items-center">
                                                        {label}
                                                        <SortIcon columnKey={key} />
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-100 dark:divide-slate-700">
                                        {getSortedResults().map((p, idx) => (
                                            <tr key={idx} className={`${p.status === 'approved' ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'} transition-colors`}>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    {p.status === 'approved'
                                                        ? <div className="flex items-center text-emerald-600 dark:text-emerald-400 text-sm"><CheckCircle className="w-4 h-4 mr-1" /> Aprobado</div>
                                                        : <div className="flex items-center text-gray-400 dark:text-gray-500 text-sm"><XCircle className="w-4 h-4 mr-1" /> Postergado</div>
                                                    }
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{p.nombre}</td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{p.gerencia}</td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm"><span className="px-3 py-1 bg-gray-100 dark:bg-slate-700 rounded-full text-xs">{p.categoria}</span></td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-primary-600 dark:text-primary-400">{p.vir}</td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-amber-600 dark:text-amber-400">{p.rmi}</td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">${Object.values(p.flujo_caja || {}).reduce((a, b) => a + b, 0).toLocaleString()}</td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                    {p.estado === 'Adjudicado' ? 'Adjudicado' : p.estado === 'Adjudicado Parcial' ? 'Adj. Parcial' : p.estado === 'Sin Presupuesto' ? 'Sin Pts.' : p.estado || 'Solicitado'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'bdd' && (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md border border-gray-100 dark:border-slate-700 overflow-hidden">
                        <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex flex-wrap gap-4 justify-between items-center bg-gray-50/50 dark:bg-slate-900/30">
                            <h3 className="text-xl text-gray-900 dark:text-white flex items-center">
                                <Database className="w-6 h-6 mr-3 text-primary-500" />
                                Catálogo de Proyectos
                                <span className="ml-3 px-3 py-1 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-full text-sm text-gray-700 dark:text-gray-200 shadow-sm">{projects.length}</span>
                            </h3>
                            <div className="flex items-center gap-3 flex-wrap">
                                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
                                    <input type="checkbox" checked={uploadReset} onChange={(e) => setUploadReset(e.target.checked)} className="rounded" />
                                    Reemplazar existentes
                                </label>
                                <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors ${isUploading ? 'bg-gray-200 dark:bg-slate-700 cursor-wait' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800'}`}>
                                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                    {isUploading ? 'Importando...' : 'Importar'}
                                    <input type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} className="hidden" disabled={isUploading} />
                                </label>
                                <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50 border border-teal-200 dark:border-teal-800">
                                    <Download className="w-4 h-4" /> Exportar
                                </button>
                                <button onClick={openCreateModal} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-primary-600 hover:bg-primary-500 text-white transition-colors">
                                    <Plus className="w-4 h-4" /> Nuevo
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto max-h-[800px] overflow-y-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700 relative">
                                <thead className="bg-gray-50 dark:bg-slate-900/80 sticky top-0 z-20 backdrop-blur-sm">
                                    <tr>
                                        {[
                                            { key: 'pep', label: 'PEP', sticky: true, zindex: 30 },
                                            { key: 'nombre', label: 'Nombre', sticky: true, zindex: 30 },
                                            { key: 'gerencia', label: 'Gerencia' },
                                            { key: 'categoria', label: 'Categoría' },
                                            { key: 'subcategoria', label: 'Subcategoría' },
                                            { key: 'vir', label: 'VIR' },
                                            { key: 'rmi', label: 'RMI' },
                                            { key: 'van', label: 'VAN' },
                                            { key: 'tir', label: 'TIR (%)' },
                                            { key: 'costo', label: 'Costo 5Y (UF)' },
                                            { key: 'estado', label: 'Estado' },
                                        ].map(({ key, label, sticky, zindex }, index) => (
                                            <th
                                                key={key}
                                                onClick={() => handleBddSort(key)}
                                                className={`px-3 py-3 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group transition-colors ${sticky ? 'sticky bg-gray-50 dark:bg-slate-900/80 shadow-[inset_-1px_0_0_rgba(200,200,200,0.5)] dark:shadow-[inset_-1px_0_0_rgba(50,50,50,0.5)]' : 'hover:bg-gray-200 dark:hover:bg-slate-800'}`}
                                                style={sticky ? { left: index === 0 ? 0 : '120px', zIndex: zindex } : {}}
                                            >
                                                <div className="flex items-center">
                                                    {label}
                                                    <SortIcon columnKey={key} isBdd={true} />
                                                </div>
                                            </th>
                                        ))}
                                        <th className="px-3 py-3 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider"></th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-100 dark:divide-slate-700">
                                    {getSortedBddResults().map((p) => (
                                        <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                                            <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-400 dark:text-gray-500 sticky left-0 bg-white dark:bg-slate-800 shadow-[inset_-1px_0_0_rgba(200,200,200,0.5)] dark:shadow-[inset_-1px_0_0_rgba(50,50,50,0.5)] z-10 w-[120px] max-w-[120px] overflow-hidden text-ellipsis">{p.pep}</td>
                                            <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 sticky bg-white dark:bg-slate-800 shadow-[inset_-1px_0_0_rgba(200,200,200,0.5)] dark:shadow-[inset_-1px_0_0_rgba(50,50,50,0.5)] z-10 w-[300px] max-w-[300px] overflow-hidden text-ellipsis" style={{ left: '120px' }} title={p.nombre}>{p.nombre}</td>
                                            <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{p.gerencia}</td>
                                            <td className="px-3 py-3 whitespace-nowrap text-sm"><span className="px-2 py-0.5 bg-gray-100 dark:bg-slate-700 rounded-full text-xs">{p.categoria}</span></td>
                                            <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{p.subcategoria}</td>
                                            <td className="px-3 py-3 whitespace-nowrap text-sm text-primary-600 dark:text-primary-400 font-medium">{p.vir}</td>
                                            <td className="px-3 py-3 whitespace-nowrap text-sm text-amber-600 dark:text-amber-400 font-medium">{p.rmi}</td>
                                            <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{typeof p.van === 'number' && p.van !== 0 ? formatNumber(Math.round(p.van)) : '—'}</td>
                                            <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{typeof p.tir === 'number' && p.tir !== 0 ? `${(p.tir * 100).toFixed(1)}%` : '—'}</td>
                                            <td className="px-3 py-3 whitespace-nowrap text-sm text-emerald-600 dark:text-emerald-400 font-medium">{formatNumber(Math.round(Object.values(p.flujo_caja || {}).reduce((a, b) => a + b, 0)))}</td>
                                            <td className="px-3 py-3 whitespace-nowrap text-sm">
                                                {p.estado === 'Adjudicado' ? (
                                                    <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full text-xs">Adjudicado</span>
                                                ) : p.estado === 'Adjudicado Parcial' ? (
                                                    <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full text-xs">Adj. Parcial</span>
                                                ) : p.estado === 'Sin Presupuesto' ? (
                                                    <span className="px-2 py-0.5 bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 rounded-full text-xs">Sin Presupuesto</span>
                                                ) : (
                                                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs">{p.estado || 'Solicitado'}</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 whitespace-nowrap text-sm">
                                                <div className="flex gap-1">
                                                    <button onClick={() => openEditModal(p)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 transition-colors" title="Editar">
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleDeleteProject(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors" title="Eliminar">
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
                )}

                {
                    activeTab === 'settings' && settings && (
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
                            {/* Main Content Column */}
                            <div className="lg:col-span-3 bg-white dark:bg-slate-800 rounded-3xl shadow-md border border-gray-100 dark:border-slate-700 p-8">
                                <div className="flex items-center justify-between mb-8 border-b border-gray-100 dark:border-slate-700 pb-6">
                                    <div className="flex items-center">
                                        <div className="p-3 bg-gray-100 dark:bg-slate-700 rounded-xl mr-4">
                                            <SettingsIcon className="w-6 h-6 text-gray-700 dark:text-gray-300" />
                                        </div>
                                        <div>
                                            <h3 className="text-2xl text-gray-900 dark:text-white">Reglas del Simulador</h3>
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Modifica los parametros y presiona Guardar para actualizar el modelo.</p>
                                        </div>
                                    </div>
                                </div>

                                {/* --- CONFIGURACION DE TIEMPO Y FINANZAS BASE --- */}
                                <div className="mb-8 p-6 bg-indigo-50 dark:bg-slate-900/50 rounded-2xl border border-indigo-100 dark:border-slate-700">
                                    <h4 className="text-sm text-indigo-800 dark:text-indigo-300 mb-4 uppercase tracking-wider font-semibold">Configuración de Tiempo y Mínimos</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                        <div>
                                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase">Año en Curso</label>
                                            <input
                                                type="number"
                                                value={editableAnoCurso}
                                                readOnly
                                                className="w-full bg-gray-100 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-gray-500 dark:text-gray-400 outline-none cursor-not-allowed"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase">Año a Priorizar</label>
                                            <select
                                                value={editableAnoPriorizar}
                                                onChange={(e) => setEditableAnoPriorizar(parseInt(e.target.value))}
                                                className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-500 cursor-pointer"
                                            >
                                                {[2026, 2027, 2028, 2029, 2030].map(y => (
                                                    <option key={y} value={y} className="dark:bg-slate-800">{y}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-gray-200 dark:border-slate-600 focus-within:border-indigo-500 transition-colors">
                                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase">Mínimo a Priorizar (UF)</label>
                                            <div className="flex items-center">
                                                <input
                                                    type="text"
                                                    value={formatNumber(editableMinimoPriorizar)}
                                                    onChange={(e) => {
                                                        const clean = parseNumber(e.target.value);
                                                        if (/^\d*\.?\d*$/.test(clean)) setEditableMinimoPriorizar(clean);
                                                    }}
                                                    className="w-full bg-transparent text-gray-900 dark:text-gray-100 outline-none border-none p-0"
                                                />
                                            </div>
                                            <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
                                                Eq: ${(editableMinimoPriorizar * editableUf / 1000000).toLocaleString(undefined, { maximumFractionDigits: 1 })} MM$
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* --- PRESUPUESTO ANUAL --- */}
                                <div className="mb-8">
                                    <h4 className="text-sm text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wider">Techo Presupuestario por Año (UF)</h4>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">El máximo de UF que el optimizador puede gastar en cada año fiscal. Cada proyecto tiene flujos de caja distribuidos en 5 años y cada año se descuenta del techo de ese año.</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                                        {Object.keys(editableBudget).map(year => {
                                            const actualYear = editableAnoCurso + parseInt(year, 10);
                                            return (
                                                <div key={year} className="bg-gray-50 dark:bg-slate-900/50 p-4 rounded-xl border border-gray-200 dark:border-slate-700 focus-within:border-primary-500 dark:focus-within:border-primary-400 transition-colors">
                                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2">AÑO {year}: {actualYear}</label>
                                                    <div className="flex items-center">
                                                        <span className="text-gray-400 dark:text-gray-500 mr-1">$</span>
                                                        <input
                                                            type="text"
                                                            value={formatNumber(editableBudget[year])}
                                                            onChange={(e) => handleBudgetChange(year, e.target.value)}
                                                            className="w-full bg-transparent text-lg text-gray-900 dark:text-gray-100 outline-none border-none p-0"
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                                        Total 5 Años: <span className="text-lg text-gray-900 dark:text-white ml-1">${Object.values(editableBudget).reduce((a, v) => a + (parseFloat(v) || 0), 0).toLocaleString()} UF</span>
                                    </div>
                                </div>

                                {/* --- VALOR UF --- */}
                                <div className="mb-8">
                                    <h4 className="text-sm text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wider">Valor UF (CLP)</h4>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Valor de referencia de la Unidad de Fomento para convertir los montos a pesos chilenos en los reportes.</p>
                                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                                        <div className="max-w-xs flex-1">
                                            <div className="bg-gray-50 dark:bg-slate-900/50 p-4 rounded-xl border border-gray-200 dark:border-slate-700 focus-within:border-primary-500 dark:focus-within:border-primary-400 transition-colors">
                                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2">PESOS CHILENOS</label>
                                                <div className="flex items-center">
                                                    <span className="text-gray-400 dark:text-gray-500 mr-1">$</span>
                                                    <input
                                                        type="text"
                                                        value={formatNumber(editableUf)}
                                                        onChange={(e) => {
                                                            const clean = parseNumber(e.target.value);
                                                            if (/^\d*\.?\d*$/.test(clean)) setEditableUf(clean);
                                                        }}
                                                        className="w-full bg-transparent text-lg text-gray-900 dark:text-gray-100 outline-none border-none p-0"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={handleSyncUf}
                                            disabled={isSyncingUf}
                                            className={`flex items-center px-4 py-4 rounded-xl text-sm font-medium transition-all h-[74px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 ${isSyncingUf ? 'cursor-wait opacity-90' : ''}`}
                                        >
                                            {isSyncingUf ? (
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            ) : (
                                                <RefreshCw className="w-4 h-4 mr-2" />
                                            )}
                                            {isSyncingUf ? 'Sincronizando...' : 'Actualizar hoy'}
                                        </button>
                                    </div>
                                </div>

                                {/* --- LIMITES POR CATEGORIA --- */}
                                <div className="mb-8">
                                    <h4 className="text-sm text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wider">Limites Maximos por Categoria</h4>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Porcentaje maximo del presupuesto total que puede destinarse a proyectos de cada categoria. El optimizador descartara proyectos si al aprobarlos se excede este techo.</p>
                                    <div className="grid grid-cols-2 gap-4">
                                        {Object.keys(editableLimits).map(cat => (
                                            <div key={cat} className="flex items-center justify-between bg-gray-50 dark:bg-slate-900/50 p-4 rounded-xl border border-gray-200 dark:border-slate-700 focus-within:border-primary-500 dark:focus-within:border-primary-400 transition-colors">
                                                <span className="text-sm text-gray-700 dark:text-gray-300">{cat}</span>
                                                <div className="flex items-center">
                                                    <input
                                                        type="text"
                                                        value={editableLimits[cat]}
                                                        onChange={(e) => handleLimitChange(cat, e.target.value)}
                                                        className="w-16 bg-transparent text-right text-sm text-primary-700 dark:text-primary-300 outline-none border-none p-0"
                                                    />
                                                    <span className="text-sm text-primary-700 dark:text-primary-300 ml-0.5">%</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className={`mt-3 text-sm ${isLimitOver ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                        Total actual: {limitsTotal.toFixed(1)}%
                                    </div>
                                    {limitError && (
                                        <div className="mt-4 text-sm text-red-600 dark:text-red-400">
                                            {limitError}
                                        </div>
                                    )}
                                </div>

                                {/* --- DRIVERS POR CATEGORÍA --- */}
                                <div className="mb-8">
                                    <h4 className="text-sm text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wider">Criterio de Priorización por Categoría</h4>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Configura qué métrica usará cada categoría cuando selecciones la métrica <strong>"Personalizado"</strong> en el simulador.</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {Object.keys(editableDrivers).map(cat => (
                                            <div key={`drv-${cat}`} className="flex flex-col bg-gray-50 dark:bg-slate-900/50 p-4 rounded-xl border border-gray-200 dark:border-slate-700 focus-within:border-primary-500 dark:focus-within:border-primary-400 transition-colors">
                                                <label className="text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase">{cat}</label>
                                                <select
                                                    value={editableDrivers[cat]}
                                                    onChange={(e) => setEditableDrivers(prev => ({ ...prev, [cat]: e.target.value }))}
                                                    className="w-full bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none border-none p-0 cursor-pointer"
                                                >
                                                    <option value="max_rmi_vir" className="dark:bg-slate-800">MAX (RMI/VIR)</option>
                                                    <option value="rmi" className="dark:bg-slate-800">RMI</option>
                                                    <option value="vir" className="dark:bg-slate-800">VIR</option>
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* --- HISTORICO PROMEDIOS --- */}
                                <div className="mb-8">
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="flex items-center gap-3">
                                            <h4 className="text-sm text-gray-700 dark:text-gray-200 uppercase tracking-wider font-semibold">Histórico de Gastos</h4>
                                            <select
                                                value={selectedHistoricalPeriod}
                                                onChange={(e) => handleHistoricoChange(e.target.value)}
                                                className="bg-slate-100 dark:bg-slate-700/80 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer shadow-sm transition-all"
                                            >
                                                {Object.keys(HISTORICAL_DATA).map(period => (
                                                    <option key={period} value={period} className="dark:bg-slate-800">{period}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-400 dark:text-gray-400 mb-4">Promedio de gasto histórico referencial para cada categoría.</p>
                                    <div className="grid grid-cols-2 gap-4">
                                        {Object.keys(editableLimits).map(cat => (
                                            <div key={`hist-${cat}`} className="flex items-center justify-between bg-white dark:bg-slate-700/40 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all duration-300">
                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{cat}</span>
                                                <div className="flex items-center bg-slate-50 dark:bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-700">
                                                    <span className="text-xs text-indigo-500 dark:text-indigo-400 mr-2 font-mono font-bold">$</span>
                                                    <span className="text-sm font-bold text-gray-800 dark:text-white font-mono">
                                                        {formatNumber(editableHistorico[cat] || 0)}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* --- INFO CALLOUT --- */}
                                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl flex items-start border border-blue-100 dark:border-blue-900/50 mb-8">
                                    <div className="bg-blue-100 dark:bg-blue-900 p-1.5 rounded-full mr-3 mt-0.5 flex-shrink-0">
                                        <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <p className="text-sm text-blue-800 dark:text-blue-300">
                                        Estos parametros alimentan el motor de <strong>Programacion Lineal Entera (PuLP)</strong>. Al guardar, los nuevos valores se persisten en la base de datos y se usaran la proxima vez que ejecutes una optimizacion desde el <strong>Simulador</strong>.
                                    </p>
                                </div>

                            </div>

                            {/* Floating Action Column (Right Side) */}
                            <div className="lg:sticky lg:top-24 space-y-4">
                                <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-gray-100 dark:border-slate-700 p-6">
                                    <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4">Acciones</h4>
                                    <div className="space-y-3" ref={saveRef}>
                                        <button
                                            onClick={handleSaveSettings}
                                            disabled={isSaving || isLimitOver}
                                            className={`w-full flex items-center justify-center px-4 py-4 rounded-xl text-md text-white font-bold transition-all shadow-md hover:shadow-lg transform active:scale-[0.98] ${isSaving || isLimitOver ? 'bg-primary-400 cursor-not-allowed' : 'bg-gradient-to-r from-primary-600 to-blue-500 hover:from-primary-500 hover:to-blue-400'}`}
                                        >
                                            {isSaving ? (
                                                <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Guardando...</>
                                            ) : (
                                                <><Save className="w-5 h-5 mr-2" /> Guardar Cambios</>
                                            )}
                                        </button>

                                        {saveMessage === 'success' && (
                                            <div className="text-center text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 rounded-lg border border-emerald-100 dark:border-emerald-800/30 animate-in fade-in zoom-in duration-300">
                                                <CheckCircle className="w-4 h-4 mx-auto mb-1" /> ¡Guardado con éxito!
                                            </div>
                                        )}
                                        {saveMessage === 'error' && (
                                            <div className="text-center text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg border border-red-100 dark:border-red-800/30 animate-in fade-in zoom-in duration-300">
                                                <XCircle className="w-4 h-4 mx-auto mb-1" /> Error al guardar
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* CRUD Modal */}
                {
                    showModal && (
                        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
                            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-xl text-gray-900 dark:text-white">{editingProject ? 'Editar Proyecto' : 'Nuevo Proyecto'}</h3>
                                    <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500"><X className="w-5 h-5" /></button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                                    <div>
                                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase">PEP</label>
                                        <input type="text" value={modalForm.pep} onChange={(e) => setModalForm(p => ({ ...p, pep: e.target.value }))} className="w-full bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100 outline-none focus:border-primary-500" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase">Nombre</label>
                                        <input type="text" value={modalForm.nombre} onChange={(e) => setModalForm(p => ({ ...p, nombre: e.target.value }))} className="w-full bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100 outline-none focus:border-primary-500" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase">Categoría</label>
                                        <select value={modalForm.categoria} onChange={(e) => setModalForm(p => ({ ...p, categoria: e.target.value }))} className="w-full bg-gray-50 dark:bg-slate-900/50 dark:text-gray-100 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-gray-900 outline-none">
                                            {['ACTIVACIÓN FINANCIERA', 'CRECIMIENTO', 'FILIALES', 'MEJORAS', 'REPOSICIÓN', 'TARIFA'].map(c => <option key={c} value={c} className="dark:bg-slate-800">{c}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase">Gerencia</label>
                                        <select value={modalForm.gerencia} onChange={(e) => setModalForm(p => ({ ...p, gerencia: e.target.value }))} className="w-full bg-gray-50 dark:bg-slate-900/50 dark:text-gray-100 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-gray-900 outline-none">
                                            {['G. TERRITORIALES', 'G. OBRAS MAYORES', 'G. DESARROLLO SOSTENIBLE', 'G. PLANIFICACIÓN', 'G. EXPERIENCIA CLIENTE', 'G. DEPURACIÓN'].map(g => <option key={g} value={g} className="dark:bg-slate-800">{g}</option>)}
                                        </select>
                                    </div>
                                    {[['VIR', 'vir'], ['RMI', 'rmi']].map(([label, field]) => (
                                        <div key={field}>
                                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase">{label}</label>
                                            <input
                                                type="text"
                                                value={formatNumber(modalForm[field])}
                                                onChange={(e) => {
                                                    const clean = parseNumber(e.target.value);
                                                    if (/^\d*\.?\d*$/.test(clean)) setModalForm(p => ({ ...p, [field]: clean }));
                                                }}
                                                className="w-full bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-gray-900 dark:text-gray-100 outline-none focus:border-primary-500"
                                            />
                                        </div>
                                    ))}
                                    <div>
                                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase">Subcategoría</label>
                                        <select
                                            value={modalForm.subcategoria}
                                            onChange={(e) => setModalForm(p => ({ ...p, subcategoria: e.target.value }))}
                                            className="w-full bg-gray-50 dark:bg-slate-900/50 dark:text-gray-100 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-gray-900 outline-none"
                                        >
                                            <option value="">(Sin Subcategoría)</option>
                                            {uniqueSubcategories.map(s => (
                                                <option key={s} value={s} className="dark:bg-slate-800">{s}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase">Estado</label>
                                        <select value={modalForm.estado} onChange={(e) => setModalForm(p => ({ ...p, estado: e.target.value }))} className="w-full bg-gray-50 dark:bg-slate-900/50 dark:text-gray-100 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-gray-900 outline-none">
                                            {['Adjudicado', 'Adjudicado Parcial', 'Solicitado', 'Sin Presupuesto'].map(s => <option key={s} value={s} className="dark:bg-slate-800">{s}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="mb-6">
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase">Flujo de Caja por Año (UF)</label>
                                    <div className="grid grid-cols-5 gap-3">
                                        {[0, 1, 2, 3, 4].map(y => (
                                            <div key={y} className="bg-gray-50 dark:bg-slate-900/50 p-3 rounded-lg border border-gray-200 dark:border-slate-700">
                                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Año {y}</label>
                                                <input
                                                    type="text"
                                                    value={formatNumber(modalForm.flujo_caja[String(y)] || 0)}
                                                    onChange={(e) => {
                                                        const clean = parseNumber(e.target.value);
                                                        if (/^\d*\.?\d*$/.test(clean)) setModalForm(p => ({ ...p, flujo_caja: { ...p.flujo_caja, [String(y)]: clean } }));
                                                    }}
                                                    className="w-full bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none border-none p-0"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex gap-3 justify-end">
                                    <button onClick={() => setShowModal(false)} className="px-5 py-2.5 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">Cancelar</button>
                                    <button onClick={handleSaveProject} className="px-5 py-2.5 rounded-lg text-sm bg-primary-600 hover:bg-primary-500 text-white transition-colors">Guardar</button>
                                </div>
                            </div>
                        </div>
                    )
                }
            </div >
        </>
    );
}
