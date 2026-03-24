"""Seed database with realistic CAPEX data.

Usage:
    python seed_db.py          # Only seeds if DB is empty
    python seed_db.py --reset  # Drops all data and re-seeds
"""
import sys
import random
from sqlalchemy.orm import Session
from database import SessionLocal, engine
import models

models.Base.metadata.create_all(bind=engine)

# ---------------------------------------------------------------------------
# New category distribution
# ---------------------------------------------------------------------------
CATEGORIES = {
    "CORRECTIVO": 0.18,
    "GESTIÓN DE RIESGO": 0.12,
    "MEJORAS VIDA ÚTIL": 0.10,
    "NORMATIVO": 0.10,
    "OTROS": 0.10,
    "PD CAMBIO DE ESTÁNDAR": 0.08,
    "PLAN DE DESARROLLO": 0.15,
    "RENTABILIDAD": 0.12,
    "ACTIVACIÓN FINANCIERA": 0.05,
}

# ---------------------------------------------------------------------------
# Duration profiles
# ---------------------------------------------------------------------------
DURATION_SHORT = (1, 3)
DURATION_MEDIUM = (2, 4)
DURATION_LONG = (3, 5)
DURATION_MEGA = (4, 5)

# ---------------------------------------------------------------------------
# Realistic project templates for new categories
# ---------------------------------------------------------------------------
TEMPLATES = [
    # CORRECTIVO (~18%) — Obligatorio: repairs, emergency fixes
    # Cost ranges in MM (Millones de Pesos) — kept modest so obligatory projects fit within ~55% of budget
    {"nombre": "REPARACIÓN EMERGENCIA RED AP", "cat": "CORRECTIVO", "subcat": "CORRECTIVO URGENTE", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN CORRECTIVO", "cost_range": (20, 100), "duration": DURATION_SHORT, "vir_range": (5, 30), "rmi_range": (40, 95)},
    {"nombre": "REPARACIÓN COLECTOR DAÑADO", "cat": "CORRECTIVO", "subcat": "CORRECTIVO URGENTE", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN CORRECTIVO", "cost_range": (32, 140), "duration": DURATION_SHORT, "vir_range": (8, 35), "rmi_range": (50, 95)},
    {"nombre": "CORRECCIÓN FALLA ESTRUCTURAL ESTANQUE", "cat": "CORRECTIVO", "subcat": "CORRECTIVO INFRAESTRUCTURA", "gerencia": "G. OBRAS MAYORES", "codir": "GESTIÓN DE ACTIVOS", "tipo": "PROYECTO", "plan": "PLAN CORRECTIVO", "cost_range": (40, 180), "duration": DURATION_MEDIUM, "vir_range": (10, 40), "rmi_range": (55, 95)},
    {"nombre": "REPARACIÓN IMPULSIÓN AVERIADA", "cat": "CORRECTIVO", "subcat": "CORRECTIVO URGENTE", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN CORRECTIVO", "cost_range": (24, 112), "duration": DURATION_SHORT, "vir_range": (5, 25), "rmi_range": (45, 90)},
    {"nombre": "REPARACIÓN VÁLVULAS CRÍTICAS", "cat": "CORRECTIVO", "subcat": "CORRECTIVO URGENTE", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN CORRECTIVO", "cost_range": (16, 60), "duration": DURATION_SHORT, "vir_range": (3, 20), "rmi_range": (35, 85)},

    # GESTIÓN DE RIESGO (~12%) — Obligatorio: risk mitigation
    {"nombre": "MITIGACIÓN RIESGO SÍSMICO PLANTA", "cat": "GESTIÓN DE RIESGO", "subcat": "RIESGO NATURAL", "gerencia": "G. OBRAS MAYORES", "codir": "SEGURIDAD", "tipo": "PROYECTO", "plan": "PLAN GESTIÓN DE RIESGO", "cost_range": (40, 180), "duration": DURATION_LONG, "vir_range": (20, 60), "rmi_range": (60, 95)},
    {"nombre": "REFUERZO ANTISÍSMICO ESTANQUE", "cat": "GESTIÓN DE RIESGO", "subcat": "RIESGO NATURAL", "gerencia": "G. OBRAS MAYORES", "codir": "SEGURIDAD", "tipo": "PROYECTO", "plan": "PLAN GESTIÓN DE RIESGO", "cost_range": (32, 140), "duration": DURATION_MEDIUM, "vir_range": (15, 50), "rmi_range": (55, 90)},
    {"nombre": "PLAN CONTINGENCIA HÍDRICA ZONA", "cat": "GESTIÓN DE RIESGO", "subcat": "RIESGO OPERACIONAL", "gerencia": "G. PLANIFICACIÓN", "codir": "RECURSO HÍDRICO", "tipo": "PROYECTO", "plan": "PLAN DE SEQUÍA", "cost_range": (28, 120), "duration": DURATION_MEDIUM, "vir_range": (15, 45), "rmi_range": (50, 85)},
    {"nombre": "SEGURIDAD CIBERNÉTICA SCADA", "cat": "GESTIÓN DE RIESGO", "subcat": "RIESGO OPERACIONAL", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "PROYECTO", "plan": "PLAN GESTIÓN DE RIESGO", "cost_range": (20, 80), "duration": DURATION_SHORT, "vir_range": (10, 35), "rmi_range": (40, 80)},

    # MEJORAS VIDA ÚTIL (~10%) — Normal: extend asset life
    {"nombre": "EXTENSIÓN VIDA ÚTIL RED AP", "cat": "MEJORAS VIDA ÚTIL", "subcat": "REHABILITACIÓN", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN MEJORAS VIDA ÚTIL", "cost_range": (60, 240), "duration": DURATION_MEDIUM, "vir_range": (10, 45), "rmi_range": (15, 60)},
    {"nombre": "REHABILITACIÓN COLECTORES ANTIGUOS", "cat": "MEJORAS VIDA ÚTIL", "subcat": "REHABILITACIÓN", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN MEJORAS VIDA ÚTIL", "cost_range": (80, 320), "duration": DURATION_MEDIUM, "vir_range": (12, 50), "rmi_range": (20, 65)},
    {"nombre": "RENOVACIÓN REVESTIMIENTO ESTANQUE", "cat": "MEJORAS VIDA ÚTIL", "subcat": "REHABILITACIÓN", "gerencia": "G. OBRAS MAYORES", "codir": "GESTIÓN DE ACTIVOS", "tipo": "PROYECTO", "plan": "PLAN MEJORAS VIDA ÚTIL", "cost_range": (60, 260), "duration": DURATION_MEDIUM, "vir_range": (10, 40), "rmi_range": (15, 55)},
    {"nombre": "MEJORAMIENTO PROTECCIÓN CATÓDICA", "cat": "MEJORAS VIDA ÚTIL", "subcat": "REHABILITACIÓN", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN MEJORAS VIDA ÚTIL", "cost_range": (32, 120), "duration": DURATION_SHORT, "vir_range": (5, 30), "rmi_range": (10, 45)},

    # NORMATIVO (~10%) — Obligatorio: regulatory compliance
    {"nombre": "ADECUACIÓN NORMA DS90 PTAS", "cat": "NORMATIVO", "subcat": "NORMATIVO AMBIENTAL", "gerencia": "G. DEPURACIÓN", "codir": "SEGURIDAD", "tipo": "PROYECTO", "plan": "PLAN NORMATIVO", "cost_range": (40, 180), "duration": DURATION_LONG, "vir_range": (20, 60), "rmi_range": (50, 90)},
    {"nombre": "CUMPLIMIENTO NORMA EMISIÓN DESCARGAS", "cat": "NORMATIVO", "subcat": "NORMATIVO AMBIENTAL", "gerencia": "G. DESARROLLO SOSTENIBLE", "codir": "SEGURIDAD", "tipo": "PROYECTO", "plan": "PLAN NORMATIVO", "cost_range": (32, 140), "duration": DURATION_MEDIUM, "vir_range": (15, 50), "rmi_range": (45, 85)},
    {"nombre": "ADAPTACIÓN REGULATORIA AGUA POTABLE", "cat": "NORMATIVO", "subcat": "NORMATIVO SANITARIO", "gerencia": "G. PLANIFICACIÓN", "codir": "SEGURIDAD", "tipo": "PROYECTO", "plan": "PLAN NORMATIVO", "cost_range": (24, 100), "duration": DURATION_MEDIUM, "vir_range": (10, 40), "rmi_range": (40, 80)},
    {"nombre": "CUMPLIMIENTO NORMA CALIDAD NCH409", "cat": "NORMATIVO", "subcat": "NORMATIVO SANITARIO", "gerencia": "G. PLANIFICACIÓN", "codir": "SEGURIDAD", "tipo": "PROYECTO", "plan": "PLAN NORMATIVO", "cost_range": (20, 80), "duration": DURATION_SHORT, "vir_range": (8, 35), "rmi_range": (35, 75)},

    # OTROS (~10%) — Mixto: ~15% are automotive (forced), rest competes
    # Automotive projects (will be forced)
    {"nombre": "ADQUISICIÓN VEHÍCULOS OPERACIONALES", "cat": "OTROS", "subcat": "FLOTA", "gerencia": "G. TERRITORIALES", "codir": "OTROS", "tipo": "RECURRENTES", "plan": "PLAN FLOTA VEHICULAR", "cost_range": (20, 80), "duration": (1, 2), "vir_range": (5, 20), "rmi_range": (10, 35), "_is_auto": True},
    {"nombre": "RENOVACIÓN FLOTA CAMIONETAS ZONA", "cat": "OTROS", "subcat": "FLOTA", "gerencia": "G. TERRITORIALES", "codir": "OTROS", "tipo": "RECURRENTES", "plan": "PLAN FLOTA VEHICULAR", "cost_range": (24, 100), "duration": (1, 2), "vir_range": (5, 15), "rmi_range": (8, 30), "_is_auto": True},
    # Non-automotive projects (compete in ranking)
    {"nombre": "IMPLEMENTACIÓN TELEMETRÍA ZONA", "cat": "OTROS", "subcat": "TECNOLOGÍA", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN MEJORAS OPERACIONALES", "cost_range": (40, 160), "duration": DURATION_SHORT, "vir_range": (5, 35), "rmi_range": (10, 45)},
    {"nombre": "RENOVACIÓN SCADA SECTOR", "cat": "OTROS", "subcat": "TECNOLOGÍA", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN MEJORAS OPERACIONALES", "cost_range": (40, 200), "duration": DURATION_SHORT, "vir_range": (8, 40), "rmi_range": (15, 55)},
    {"nombre": "REMODELACIÓN RECINTOS VARIOS", "cat": "OTROS", "subcat": "INFRAESTRUCTURA", "gerencia": "G. OBRAS MAYORES", "codir": "OTROS", "tipo": "RECURRENTES", "plan": "REMODELACIÓN AGENCIAS COMERCIALES", "cost_range": (20, 80), "duration": DURATION_SHORT, "vir_range": (1, 8), "rmi_range": (3, 20)},
    {"nombre": "MANTENIMIENTO CENTRO OPERACIONAL", "cat": "OTROS", "subcat": "INFRAESTRUCTURA", "gerencia": "G. OBRAS MAYORES", "codir": "OTROS", "tipo": "RECURRENTES", "plan": "REMODELACIÓN AGENCIAS COMERCIALES", "cost_range": (16, 60), "duration": DURATION_SHORT, "vir_range": (1, 5), "rmi_range": (2, 15)},
    {"nombre": "EQUIPAMIENTO LABORATORIO", "cat": "OTROS", "subcat": "EQUIPAMIENTO", "gerencia": "G. DESARROLLO SOSTENIBLE", "codir": "OTROS", "tipo": "RECURRENTES", "plan": "PLAN EQUIPAMIENTO", "cost_range": (20, 100), "duration": DURATION_SHORT, "vir_range": (3, 15), "rmi_range": (5, 25)},

    # PD CAMBIO DE ESTÁNDAR (~8%) — Obligatorio: standard changes
    {"nombre": "CAMBIO ESTÁNDAR MATERIALIDAD RED AP", "cat": "PD CAMBIO DE ESTÁNDAR", "subcat": "CAMBIO ESTÁNDAR", "gerencia": "G. PLANIFICACIÓN", "codir": "REDES", "tipo": "PROYECTO", "plan": "PLAN DESARROLLO CAMBIO ESTÁNDAR", "cost_range": (32, 140), "duration": DURATION_MEDIUM, "vir_range": (15, 50), "rmi_range": (30, 75)},
    {"nombre": "ACTUALIZACIÓN ESTÁNDAR PTAS", "cat": "PD CAMBIO DE ESTÁNDAR", "subcat": "CAMBIO ESTÁNDAR", "gerencia": "G. DEPURACIÓN", "codir": "GESTIÓN DE ACTIVOS", "tipo": "PROYECTO", "plan": "PLAN DESARROLLO CAMBIO ESTÁNDAR", "cost_range": (40, 180), "duration": DURATION_LONG, "vir_range": (20, 55), "rmi_range": (35, 80)},
    {"nombre": "MIGRACIÓN ESTÁNDAR MEDIDORES", "cat": "PD CAMBIO DE ESTÁNDAR", "subcat": "CAMBIO ESTÁNDAR", "gerencia": "G. EXPERIENCIA CLIENTE", "codir": "SERVICIO AL CLIENTE", "tipo": "PROYECTO", "plan": "PLAN DESARROLLO CAMBIO ESTÁNDAR", "cost_range": (24, 100), "duration": DURATION_MEDIUM, "vir_range": (10, 40), "rmi_range": (25, 65)},

    # PLAN DE DESARROLLO (~15%) — Obligatorio: development projects
    {"nombre": "AMPLIACIÓN RED AP SECTOR", "cat": "PLAN DE DESARROLLO", "subcat": "DESARROLLO REDES", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "PROYECTO", "plan": "PLAN DE DESARROLLO", "cost_range": (28, 120), "duration": DURATION_MEDIUM, "vir_range": (25, 65), "rmi_range": (15, 50)},
    {"nombre": "AMPLIACIÓN RED AS SECTOR", "cat": "PLAN DE DESARROLLO", "subcat": "DESARROLLO REDES", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "PROYECTO", "plan": "PLAN DE DESARROLLO", "cost_range": (24, 100), "duration": DURATION_MEDIUM, "vir_range": (20, 60), "rmi_range": (10, 45)},
    {"nombre": "CONSTRUCCIÓN NUEVO ESTANQUE", "cat": "PLAN DE DESARROLLO", "subcat": "DESARROLLO INFRAESTRUCTURA", "gerencia": "G. OBRAS MAYORES", "codir": "REDES", "tipo": "PROYECTO", "plan": "PLAN DE DESARROLLO", "cost_range": (40, 180), "duration": DURATION_LONG, "vir_range": (30, 75), "rmi_range": (20, 55)},
    {"nombre": "NUEVA IMPULSIÓN AP ZONA", "cat": "PLAN DE DESARROLLO", "subcat": "DESARROLLO INFRAESTRUCTURA", "gerencia": "G. OBRAS MAYORES", "codir": "REDES", "tipo": "PROYECTO", "plan": "PLAN DE DESARROLLO", "cost_range": (32, 140), "duration": DURATION_LONG, "vir_range": (25, 70), "rmi_range": (15, 50)},
    {"nombre": "EXTENSIÓN MATRIZ DISTRIBUCIÓN", "cat": "PLAN DE DESARROLLO", "subcat": "DESARROLLO REDES", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "PROYECTO", "plan": "PLAN DE DESARROLLO", "cost_range": (20, 80), "duration": DURATION_MEDIUM, "vir_range": (20, 55), "rmi_range": (10, 40)},

    # RENTABILIDAD (~12%) — Normal: profitability-driven
    {"nombre": "REDUCCIÓN PÉRDIDAS COMERCIALES", "cat": "RENTABILIDAD", "subcat": "EFICIENCIA COMERCIAL", "gerencia": "G. EXPERIENCIA CLIENTE", "codir": "SERVICIO AL CLIENTE", "tipo": "PROYECTO", "plan": "PLAN RENTABILIDAD", "cost_range": (60, 240), "duration": DURATION_MEDIUM, "vir_range": (30, 70), "rmi_range": (5, 30)},
    {"nombre": "OPTIMIZACIÓN ENERGÉTICA PLANTA", "cat": "RENTABILIDAD", "subcat": "EFICIENCIA OPERACIONAL", "gerencia": "G. DEPURACIÓN", "codir": "GESTIÓN DE ACTIVOS", "tipo": "PROYECTO", "plan": "PLAN RENTABILIDAD", "cost_range": (80, 280), "duration": DURATION_MEDIUM, "vir_range": (35, 75), "rmi_range": (5, 25)},
    {"nombre": "REDUCCIÓN AGUA NO FACTURADA ZONA", "cat": "RENTABILIDAD", "subcat": "EFICIENCIA COMERCIAL", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "PROYECTO", "plan": "PLAN RENTABILIDAD", "cost_range": (80, 320), "duration": DURATION_MEDIUM, "vir_range": (40, 80), "rmi_range": (5, 25)},
    {"nombre": "RENOVACIÓN MEDIDORES MASIVA", "cat": "RENTABILIDAD", "subcat": "EFICIENCIA COMERCIAL", "gerencia": "G. EXPERIENCIA CLIENTE", "codir": "SERVICIO AL CLIENTE", "tipo": "RECURRENTES", "plan": "PLAN DE MEDIDORES", "cost_range": (80, 320), "duration": DURATION_MEDIUM, "vir_range": (25, 65), "rmi_range": (10, 40)},

    # ACTIVACIÓN FINANCIERA (~5%) — Normal: financial activation
    {"nombre": "ACTIVACIÓN FINANCIERA OBRAS VARIAS", "cat": "ACTIVACIÓN FINANCIERA", "subcat": "ACTIVACIÓN", "gerencia": "G. OBRAS MAYORES", "codir": "OTROS", "tipo": "RECURRENTES", "plan": "ACTIVACIÓN FINANCIERA", "cost_range": (32, 120), "duration": (1, 2), "vir_range": (45, 90), "rmi_range": (5, 25)},
    {"nombre": "ACTIVACIÓN OBRAS EN CURSO", "cat": "ACTIVACIÓN FINANCIERA", "subcat": "ACTIVACIÓN", "gerencia": "G. OBRAS MAYORES", "codir": "OTROS", "tipo": "RECURRENTES", "plan": "ACTIVACIÓN FINANCIERA", "cost_range": (20, 100), "duration": (1, 2), "vir_range": (40, 85), "rmi_range": (5, 20)},
]

ZONAS = [
    "MAIPÚ", "LO BARNECHEA", "PUENTE ALTO", "LAS CONDES", "LA FLORIDA",
    "PROVIDENCIA", "ÑUÑOA", "VITACURA", "SAN BERNARDO", "PEÑALOLÉN",
    "LA REINA", "MACUL", "COLINA", "BUIN", "TALAGANTE",
    "MELIPILLA", "SAN ANTONIO", "VALPARAÍSO", "RANCAGUA",
]

ESTADOS = ["Adjudicado", "Adjudicado Parcial", "Solicitado", "Sin Presupuesto"]

_pep_counter = 0


def _next_pep() -> str:
    global _pep_counter
    _pep_counter += 1
    return f"10GI.{str(_pep_counter).zfill(5)}"


def _generate_project_from_template(template: dict) -> models.Project:
    """Generate a single project from a template with realistic variation."""
    zona = random.choice(ZONAS)
    nombre = template["nombre"]

    if random.random() > 0.4:
        nombre = f"{nombre} {zona}"

    low, high = template["cost_range"]
    dur_min, dur_max = template["duration"]

    # --- Realistic duration: pick how many years this project spans ---
    project_duration = random.randint(dur_min, dur_max)

    # Pick a random starting year
    max_start = 5 - project_duration
    balanced_weights = [1] * (max_start + 1)
    start_year = random.choices(range(max_start + 1), weights=balanced_weights, k=1)[0]

    active_years = list(range(start_year, start_year + project_duration))

    # --- Generate costs ONLY for active years ---
    flujo_caja = {}
    total_cost = round(random.uniform(low, high))

    if project_duration == 1:
        flujo_caja = {str(y): 0.0 for y in range(5)}
        flujo_caja[str(active_years[0])] = float(total_cost)
    else:
        raw_weights = []
        for i, y in enumerate(active_years):
            if i == 0:
                w = random.uniform(0.1, 0.4)
            elif i == len(active_years) - 1:
                w = random.uniform(0.05, 0.25)
            else:
                w = random.uniform(0.3, 0.6)
            raw_weights.append(w)

        total_weight = sum(raw_weights)
        flujo_caja = {str(y): 0.0 for y in range(5)}
        for i, y in enumerate(active_years):
            year_cost = round(total_cost * (raw_weights[i] / total_weight))
            flujo_caja[str(y)] = float(year_cost)

    # --- VIR and RMI from template ranges ---
    vir_low, vir_high = template["vir_range"]
    rmi_low, rmi_high = template["rmi_range"]

    vir = round(random.betavariate(2, 3) * (vir_high - vir_low) + vir_low, 1)
    rmi = round(random.betavariate(2, 3) * (rmi_high - rmi_low) + rmi_low, 1)

    # ~5% of non-obligatory projects get Adjudicado
    estado = "Solicitado"
    if random.random() < 0.05:
        estado = "Adjudicado"
        rmi = round(random.uniform(70, 100), 1)

    return models.Project(
        pep=_next_pep(),
        nombre=nombre,
        gerencia=template["gerencia"],
        categoria=template["cat"],
        subcategoria=template["subcat"],
        criterio_codir=template["codir"],
        tipo_proyecto=template["tipo"],
        plan=template["plan"],
        estado=estado,
        rmi=rmi,
        vir=vir,
        flujo_caja=flujo_caja,
    )


def seed_db(reset: bool = False):
    global _pep_counter
    _pep_counter = 0

    db = SessionLocal()

    if reset:
        # Drop and recreate all tables to handle schema changes (e.g. removed columns)
        models.Base.metadata.drop_all(bind=engine)
        models.Base.metadata.create_all(bind=engine)
        print("Tablas recreadas (schema actualizado).")

    if db.query(models.Project).count() > 0:
        print("La base de datos ya tiene proyectos. Usa --reset para re-sembrar.")
        db.close()
        return

    # Build project list following category distribution
    projects_to_create = []
    total_target = 200

    # Group templates by category
    templates_by_cat = {}
    for t in TEMPLATES:
        cat = t["cat"]
        templates_by_cat.setdefault(cat, []).append(t)

    for cat, pct in CATEGORIES.items():
        count_for_cat = max(1, round(total_target * pct))
        cat_templates = templates_by_cat.get(cat, [])
        if not cat_templates:
            continue
        for _ in range(count_for_cat):
            template = random.choice(cat_templates)
            projects_to_create.append(_generate_project_from_template(template))

    random.shuffle(projects_to_create)

    # ------------------------------------------------------------------
    # POST-GENERATION: ensure obligatory projects fit within budget
    # ------------------------------------------------------------------
    # Budget ceilings per year (MM - Millones de Pesos)
    budget = {"0": 3200.0, "1": 3200.0, "2": 3200.0, "3": 3000.0, "4": 2800.0}
    # Max fraction of budget that obligatory projects may consume (55%)
    MAX_OBLIGATORY_FRACTION = 0.55

    # Obligatory categories (same logic as optimizer.py)
    _OBLIG_CATS = {
        "CORRECTIVO", "GESTIÓN DE RIESGO", "GESTION DE RIESGO",
        "NORMATIVO", "PD CAMBIO DE ESTÁNDAR", "PD CAMBIO DE ESTANDAR",
        "PLAN DE DESARROLLO",
    }
    _AUTO_KW = ["AUTO", "VEHÍCULO", "VEHICULO", "FLOTA", "CAMIÓN",
                "CAMION", "CAMIONETA", "FURGÓN", "FURGON"]

    def _seed_is_forced(p):
        cat = (p.categoria or "").strip().upper()
        if cat in _OBLIG_CATS:
            return True
        nombre_up = (p.nombre or "").upper()
        if cat == "OTROS" and any(kw in nombre_up for kw in _AUTO_KW):
            return True
        return False

    obligatory = [p for p in projects_to_create if _seed_is_forced(p)]
    non_obligatory = [p for p in projects_to_create if not _seed_is_forced(p)]

    # Check per-year: if obligatory costs exceed the allowed ceiling, scale down
    for y in range(5):
        ys = str(y)
        year_ceiling = budget[ys] * MAX_OBLIGATORY_FRACTION
        oblig_cost = sum(p.flujo_caja.get(ys, 0.0) for p in obligatory)

        if oblig_cost > year_ceiling and oblig_cost > 0:
            scale = year_ceiling / oblig_cost
            for p in obligatory:
                old_val = p.flujo_caja.get(ys, 0.0)
                p.flujo_caja[ys] = round(old_val * scale)

    # Also ensure "Adjudicado" non-obligatory projects don't push forced total
    # over budget — mark them as "Adjudicado Parcial" instead of forcing them.
    # (The optimizer forces Adjudicado projects too, so we limit those.)
    for p in non_obligatory:
        if (p.estado or "").strip().lower() == "adjudicado":
            # Keep as Adjudicado but ensure costs are modest
            for y in range(5):
                ys = str(y)
                old_val = p.flujo_caja.get(ys, 0.0)
                if old_val > 120:
                    p.flujo_caja[ys] = round(old_val * 0.5)

    print(f"\n--- Budget verification ---")
    for y in range(5):
        ys = str(y)
        oblig_cost = sum(p.flujo_caja.get(ys, 0.0) for p in obligatory)
        adj_cost = sum(
            sum(p.flujo_caja.get(str(yy), 0.0) for yy in range(5))
            for p in non_obligatory
            if (p.estado or "").strip().lower() == "adjudicado"
        ) if y == 0 else 0  # print once
        total_forced = oblig_cost + (adj_cost if y == 0 else 0)
        print(f"  Year {y}: obligatory={oblig_cost:,.0f} MM / ceiling={budget[ys]:,.0f} MM "
              f"({oblig_cost/budget[ys]*100:.1f}%)")

    for p in projects_to_create:
        db.add(p)

    # Default settings in CLP (legacy MM values are normalized by API too).
    settings = models.Settings(
        presupuesto_anual={
            "0": 3_200_000_000.0,
            "1": 3_200_000_000.0,
            "2": 3_200_000_000.0,
            "3": 3_000_000_000.0,
            "4": 2_800_000_000.0,
        },
        ano_en_curso=2026,
        minimo_priorizar_clp=30_000_000.0,
        minimo_categoria_opcional_clp=30_000_000.0,
        minimos_categoria_opcional_clp={
            "MEJORAS VIDA ÚTIL": 30_000_000.0,
            "OTROS": 30_000_000.0,
            "RENTABILIDAD": 30_000_000.0,
        },
        historico_promedios={
            "CORRECTIVO": 72_000_000.0,
            "GESTIÓN DE RIESGO": 88_000_000.0,
            "MEJORAS VIDA ÚTIL": 160_000_000.0,
            "NORMATIVO": 80_000_000.0,
            "OTROS": 72_000_000.0,
            "PD CAMBIO DE ESTÁNDAR": 88_000_000.0,
            "PLAN DE DESARROLLO": 80_000_000.0,
            "RENTABILIDAD": 200_000_000.0,
            "ACTIVACIÓN FINANCIERA": 60_000_000.0,
        },
        drivers_categoria={
            "CORRECTIVO": "rmi",
            "GESTIÓN DE RIESGO": "rmi",
            "MEJORAS VIDA ÚTIL": "vir",
            "NORMATIVO": "rmi",
            "OTROS": "vir",
            "PD CAMBIO DE ESTÁNDAR": "rmi",
            "PLAN DE DESARROLLO": "vir",
            "RENTABILIDAD": "vir",
            "ACTIVACIÓN FINANCIERA": "vir",
        }
    )
    db.add(settings)

    db.commit()

    # --- Print summary ---
    from collections import Counter
    dur_counter = Counter()
    for p in projects_to_create:
        active = sum(1 for y in range(5) if p.flujo_caja.get(str(y), 0) > 0)
        dur_counter[active] += 1

    print(f"\nBase de datos sembrada con {len(projects_to_create)} proyectos.")
    print(f"\nDistribucion de duraciones:")
    for dur in sorted(dur_counter):
        print(f"   {dur} ano(s): {dur_counter[dur]} proyectos")

    cat_counter = Counter(p.categoria for p in projects_to_create)
    print(f"\nDistribucion por categoria:")
    for cat, count in cat_counter.most_common():
        print(f"   {cat}: {count} proyectos")

    vir_vals = [p.vir for p in projects_to_create]
    rmi_vals = [p.rmi for p in projects_to_create]
    print(f"\nMetricas:")
    print(f"   VIR — Promedio: {sum(vir_vals)/len(vir_vals):.1f} | Min: {min(vir_vals):.1f} | Max: {max(vir_vals):.1f}")
    print(f"   RMI — Promedio: {sum(rmi_vals)/len(rmi_vals):.1f} | Min: {min(rmi_vals):.1f} | Max: {max(rmi_vals):.1f}")

    db.close()


if __name__ == "__main__":
    do_reset = "--reset" in sys.argv
    seed_db(reset=do_reset)
