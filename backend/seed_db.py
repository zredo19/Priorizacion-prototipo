"""
Seed database with realistic CAPEX project data based on real utility company structure.
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
# Real category distribution from production data
# ---------------------------------------------------------------------------
CATEGORIES = {
    "REPOSICIÓN": 0.39,
    "CRECIMIENTO": 0.24,
    "TARIFA": 0.21,
    "MEJORAS": 0.13,
    "ACTIVACIÓN FINANCIERA": 0.02,
    "FILIALES": 0.01,
}

# ---------------------------------------------------------------------------
# Duration profiles: how many years a project type typically spans
# (min_years, max_years) — the project will have costs ONLY in those years
# ---------------------------------------------------------------------------
DURATION_SHORT = (1, 3)    # Renovaciones pequeñas, compras, activaciones
DURATION_MEDIUM = (2, 4)   # Mejoras operacionales, ampliaciones menores
DURATION_LONG = (3, 5)     # Obras mayores, ampliaciones grandes
DURATION_MEGA = (4, 5)     # Plantas de tratamiento, emisarios

# ---------------------------------------------------------------------------
# Realistic project templates
# ---------------------------------------------------------------------------
TEMPLATES = [
    # REPOSICIÓN projects (~39%) — Short to medium duration
    {"nombre": "RENOVACIÓN ARRANQUES CORREC", "cat": "REPOSICIÓN", "subcat": "REPOSICIÓN", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN DE RENOVACIÓN REDES AP Y AS", "cost_range": (5000, 20000), "duration": DURATION_SHORT, "vir_range": (1, 30), "rmi_range": (15, 85)},
    {"nombre": "RENOVACIÓN REDES CORREC", "cat": "REPOSICIÓN", "subcat": "REPOSICIÓN", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN DE RENOVACIÓN REDES AP Y AS", "cost_range": (4000, 16000), "duration": DURATION_SHORT, "vir_range": (1, 25), "rmi_range": (20, 80)},
    {"nombre": "RENOVACIÓN COLECTORES CORREC", "cat": "REPOSICIÓN", "subcat": "REPOSICIÓN", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN DE RENOVACIÓN REDES AP Y AS", "cost_range": (8000, 35000), "duration": DURATION_MEDIUM, "vir_range": (5, 35), "rmi_range": (25, 90)},
    {"nombre": "RENOVACIÓN VÁLVULAS CORREC", "cat": "REPOSICIÓN", "subcat": "REPOSICIÓN", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN DE RENOVACIÓN REDES AP Y AS", "cost_range": (2000, 8000), "duration": DURATION_SHORT, "vir_range": (1, 15), "rmi_range": (10, 60)},
    {"nombre": "RENOVACIÓN GRIFOS CORREC", "cat": "REPOSICIÓN", "subcat": "REPOSICIÓN", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN DE RENOVACIÓN REDES AP Y AS", "cost_range": (1500, 6000), "duration": DURATION_SHORT, "vir_range": (1, 10), "rmi_range": (5, 50)},
    {"nombre": "INSTALACIÓN GRIFOS CORREC", "cat": "REPOSICIÓN", "subcat": "REPOSICIÓN", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN DE RENOVACIÓN REDES AP Y AS", "cost_range": (1000, 5000), "duration": DURATION_SHORT, "vir_range": (1, 10), "rmi_range": (5, 40)},
    {"nombre": "INSTALACIÓN VÁLVULAS CORREC", "cat": "REPOSICIÓN", "subcat": "REPOSICIÓN", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN DE RENOVACIÓN REDES AP Y AS", "cost_range": (1000, 5000), "duration": DURATION_SHORT, "vir_range": (1, 12), "rmi_range": (8, 45)},
    {"nombre": "RENOVACIÓN CÁMARAS AS CORREC", "cat": "REPOSICIÓN", "subcat": "REPOSICIÓN", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN DE RENOVACIÓN REDES AP Y AS", "cost_range": (1000, 5000), "duration": DURATION_SHORT, "vir_range": (1, 8), "rmi_range": (5, 35)},
    {"nombre": "RENOVACIÓN CÁMARAS AP CORREC", "cat": "REPOSICIÓN", "subcat": "REPOSICIÓN", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN DE RENOVACIÓN REDES AP Y AS", "cost_range": (800, 4000), "duration": DURATION_SHORT, "vir_range": (1, 8), "rmi_range": (5, 30)},
    {"nombre": "INSTALACIÓN REDES CORREC", "cat": "REPOSICIÓN", "subcat": "REPOSICIÓN", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN DE RENOVACIÓN REDES AP Y AS", "cost_range": (2000, 8000), "duration": DURATION_SHORT, "vir_range": (1, 10), "rmi_range": (5, 40)},
    {"nombre": "RENOVACIÓN UD CORREC", "cat": "REPOSICIÓN", "subcat": "REPOSICIÓN", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN DE RENOVACIÓN REDES AP Y AS", "cost_range": (4000, 18000), "duration": DURATION_MEDIUM, "vir_range": (3, 20), "rmi_range": (15, 70)},
    {"nombre": "CIERRE MALLAS: REFUERZOS CORREC", "cat": "REPOSICIÓN", "subcat": "REPOSICIÓN", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN DE RENOVACIÓN REDES AP Y AS", "cost_range": (1500, 6000), "duration": DURATION_SHORT, "vir_range": (1, 8), "rmi_range": (3, 25)},
    {"nombre": "RENOVACIÓN MEDIDORES CORREC", "cat": "REPOSICIÓN", "subcat": "REPOSICIÓN", "gerencia": "G. EXPERIENCIA CLIENTE", "codir": "SERVICIO AL CLIENTE", "tipo": "RECURRENTES", "plan": "PLAN DE MEDIDORES", "cost_range": (5000, 25000), "duration": DURATION_MEDIUM, "vir_range": (5, 30), "rmi_range": (10, 55)},
    {"nombre": "REMODELACIÓN RECINTOS VARIOS", "cat": "REPOSICIÓN", "subcat": "REPOSICIÓN", "gerencia": "G. OBRAS MAYORES", "codir": "OTROS", "tipo": "RECURRENTES", "plan": "REMODELACIÓN AGENCIAS COMERCIALES Y RECINTOS", "cost_range": (1000, 5000), "duration": DURATION_SHORT, "vir_range": (1, 8), "rmi_range": (3, 20)},
    {"nombre": "REPOS ACT PARA G ZONA", "cat": "REPOSICIÓN", "subcat": "REPOSICIÓN", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN DE RENOVACIÓN REDES AP Y AS", "cost_range": (1500, 6000), "duration": DURATION_SHORT, "vir_range": (1, 8), "rmi_range": (3, 25)},
    {"nombre": "MANTENIMIENTO CENTRO OPERACIONAL", "cat": "REPOSICIÓN", "subcat": "REPOSICIÓN", "gerencia": "G. OBRAS MAYORES", "codir": "OTROS", "tipo": "RECURRENTES", "plan": "REMODELACIÓN AGENCIAS COMERCIALES Y RECINTOS", "cost_range": (800, 4000), "duration": DURATION_SHORT, "vir_range": (1, 5), "rmi_range": (2, 15)},

    # CRECIMIENTO projects (~24%) — Medium to long duration
    {"nombre": "ADQUISICIÓN DERECHOS DE AGUA", "cat": "CRECIMIENTO", "subcat": "VEGETATIVO", "gerencia": "G. PLANIFICACIÓN", "codir": "RECURSO HÍDRICO", "tipo": "RECURRENTES", "plan": "PLAN DE SEQUÍA", "cost_range": (2000, 8000), "duration": DURATION_SHORT, "vir_range": (30, 70), "rmi_range": (10, 40)},
    {"nombre": "AMPLIACIÓN RED AP SECTOR", "cat": "CRECIMIENTO", "subcat": "VEGETATIVO", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "PROYECTO", "plan": "PLAN DE DESARROLLO", "cost_range": (5000, 25000), "duration": DURATION_MEDIUM, "vir_range": (25, 65), "rmi_range": (5, 35)},
    {"nombre": "AMPLIACIÓN RED AS SECTOR", "cat": "CRECIMIENTO", "subcat": "VEGETATIVO", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "PROYECTO", "plan": "PLAN DE DESARROLLO", "cost_range": (4000, 20000), "duration": DURATION_MEDIUM, "vir_range": (20, 60), "rmi_range": (5, 30)},
    {"nombre": "AMPLIACIÓN ESTANQUE", "cat": "CRECIMIENTO", "subcat": "VEGETATIVO", "gerencia": "G. OBRAS MAYORES", "codir": "REDES", "tipo": "PROYECTO", "plan": "PLAN DE DESARROLLO", "cost_range": (8000, 35000), "duration": DURATION_LONG, "vir_range": (30, 75), "rmi_range": (8, 40)},
    {"nombre": "NUEVA IMPULSIÓN AP", "cat": "CRECIMIENTO", "subcat": "VEGETATIVO", "gerencia": "G. OBRAS MAYORES", "codir": "REDES", "tipo": "PROYECTO", "plan": "PLAN DE DESARROLLO", "cost_range": (6000, 30000), "duration": DURATION_LONG, "vir_range": (25, 70), "rmi_range": (10, 45)},
    {"nombre": "EXTENSIÓN MATRIZ DISTRIBUCIÓN", "cat": "CRECIMIENTO", "subcat": "VEGETATIVO", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "PROYECTO", "plan": "PLAN DE DESARROLLO", "cost_range": (3000, 14000), "duration": DURATION_MEDIUM, "vir_range": (20, 55), "rmi_range": (5, 30)},
    {"nombre": "CONSTRUCCIÓN PLANTA ELEVADORA", "cat": "CRECIMIENTO", "subcat": "VEGETATIVO", "gerencia": "G. OBRAS MAYORES", "codir": "REDES", "tipo": "PROYECTO", "plan": "PLAN DE DESARROLLO", "cost_range": (12000, 50000), "duration": DURATION_MEGA, "vir_range": (40, 80), "rmi_range": (15, 50)},

    # TARIFA projects (~21%) — Medium to mega duration
    {"nombre": "PLANTA TRATAMIENTO", "cat": "TARIFA", "subcat": "TARIFA ADJUDICADA", "gerencia": "G. DESARROLLO SOSTENIBLE", "codir": "SEGURIDAD", "tipo": "PROYECTO", "plan": "PLAN DE DESARROLLO", "cost_range": (5000, 25000), "duration": DURATION_LONG, "vir_range": (35, 90), "rmi_range": (25, 75)},
    {"nombre": "ESTACIÓN DE BOMBEO TARIFADA", "cat": "TARIFA", "subcat": "TARIFA ADJUDICADA", "gerencia": "G. OBRAS MAYORES", "codir": "SEGURIDAD", "tipo": "PROYECTO", "plan": "PLAN DE DESARROLLO", "cost_range": (5000, 20000), "duration": DURATION_MEDIUM, "vir_range": (30, 80), "rmi_range": (20, 65)},
    {"nombre": "AMPLIACIÓN PTAS TARIFADAS", "cat": "TARIFA", "subcat": "TARIFA ADJUDICADA", "gerencia": "G. DEPURACIÓN", "codir": "GESTIÓN DE ACTIVOS", "tipo": "PROYECTO", "plan": "PLAN DE DESARROLLO", "cost_range": (8000, 40000), "duration": DURATION_MEGA, "vir_range": (40, 95), "rmi_range": (30, 80)},
    {"nombre": "EMISARIO SUBMARINO CONCESIONADO", "cat": "TARIFA", "subcat": "TARIFA ADJUDICADA", "gerencia": "G. DESARROLLO SOSTENIBLE", "codir": "SEGURIDAD", "tipo": "PROYECTO", "plan": "PLAN DE DESARROLLO", "cost_range": (12000, 55000), "duration": DURATION_MEGA, "vir_range": (50, 95), "rmi_range": (35, 80)},
    {"nombre": "OBRAS COMPLEMENTARIAS TARIFA", "cat": "TARIFA", "subcat": "TARIFA ADJUDICADA", "gerencia": "G. OBRAS MAYORES", "codir": "SEGURIDAD", "tipo": "PROYECTO", "plan": "PLAN DE DESARROLLO", "cost_range": (2000, 10000), "duration": DURATION_SHORT, "vir_range": (25, 60), "rmi_range": (15, 50)},

    # MEJORAS projects (~13%) — Short to medium
    {"nombre": "INVERSIÓN EN MEJORAMIENTO PTAS", "cat": "MEJORAS", "subcat": "MEJORAS", "gerencia": "G. DEPURACIÓN", "codir": "GESTIÓN DE ACTIVOS", "tipo": "RECURRENTES", "plan": "PLAN DE MEJORAS OPERACIONALES", "cost_range": (5000, 22000), "duration": DURATION_MEDIUM, "vir_range": (10, 45), "rmi_range": (15, 60)},
    {"nombre": "MEJORAS OPERACIONALES PLANTA", "cat": "MEJORAS", "subcat": "MEJORAS", "gerencia": "G. DEPURACIÓN", "codir": "GESTIÓN DE ACTIVOS", "tipo": "RECURRENTES", "plan": "PLAN DE MEJORAS OPERACIONALES", "cost_range": (3000, 14000), "duration": DURATION_SHORT, "vir_range": (8, 40), "rmi_range": (10, 55)},
    {"nombre": "IMPLEMENTACIÓN TELEMETRÍA", "cat": "MEJORAS", "subcat": "MEJORAS", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN DE MEJORAS OPERACIONALES", "cost_range": (2000, 10000), "duration": DURATION_SHORT, "vir_range": (5, 35), "rmi_range": (10, 45)},
    {"nombre": "RENOVACIÓN SCADA", "cat": "MEJORAS", "subcat": "MEJORAS", "gerencia": "G. TERRITORIALES", "codir": "REDES", "tipo": "RECURRENTES", "plan": "PLAN DE MEJORAS OPERACIONALES", "cost_range": (2000, 12000), "duration": DURATION_SHORT, "vir_range": (8, 40), "rmi_range": (15, 55)},
    {"nombre": "SEGURIDAD HÍDRICA ZONA", "cat": "MEJORAS", "subcat": "MEJORAS", "gerencia": "G. PLANIFICACIÓN", "codir": "RECURSO HÍDRICO", "tipo": "RECURRENTES", "plan": "PLAN DE SEQUÍA", "cost_range": (5000, 25000), "duration": DURATION_LONG, "vir_range": (15, 50), "rmi_range": (20, 65)},

    # ACTIVACIÓN FINANCIERA projects (~2%) — Short duration
    {"nombre": "ACTIVACIÓN FINANCIERA OBRAS VARIAS", "cat": "ACTIVACIÓN FINANCIERA", "subcat": "ACTIVACIÓN", "gerencia": "G. OBRAS MAYORES", "codir": "OTROS", "tipo": "RECURRENTES", "plan": "ACTIVACIÓN FINANCIERA", "cost_range": (1500, 8000), "duration": (1, 2), "vir_range": (45, 90), "rmi_range": (5, 25)},
    {"nombre": "ACTIVACIÓN OBRAS EN CURSO", "cat": "ACTIVACIÓN FINANCIERA", "subcat": "ACTIVACIÓN", "gerencia": "G. OBRAS MAYORES", "codir": "OTROS", "tipo": "RECURRENTES", "plan": "ACTIVACIÓN FINANCIERA", "cost_range": (1000, 6000), "duration": (1, 2), "vir_range": (40, 85), "rmi_range": (5, 20)},

    # FILIALES projects (~1%) — Short to medium duration, small costs to fit 1% limit
    {"nombre": "INVERSIÓN FILIAL AGUA NUEVA", "cat": "FILIALES", "subcat": "FILIALES", "gerencia": "G. DESARROLLO SOSTENIBLE", "codir": "OTROS", "tipo": "PROYECTO", "plan": "PLAN DE DESARROLLO FILIALES", "cost_range": (800, 4000), "duration": DURATION_SHORT, "vir_range": (5, 35), "rmi_range": (5, 30)},
    {"nombre": "MANTENCIÓN FILIAL ZONA", "cat": "FILIALES", "subcat": "FILIALES", "gerencia": "G. DESARROLLO SOSTENIBLE", "codir": "OTROS", "tipo": "RECURRENTES", "plan": "PLAN DE DESARROLLO FILIALES", "cost_range": (500, 3000), "duration": DURATION_SHORT, "vir_range": (8, 40), "rmi_range": (8, 35)},
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

    # Pick a random starting year — fully uniform so all years get equal demand
    max_start = 5 - project_duration
    balanced_weights = [1] * (max_start + 1)
    start_year = random.choices(range(max_start + 1), weights=balanced_weights, k=1)[0]

    active_years = list(range(start_year, start_year + project_duration))

    # --- Generate costs ONLY for active years ---
    flujo_caja = {}
    total_cost = round(random.uniform(low, high))

    if project_duration == 1:
        # All cost in one year
        flujo_caja = {str(y): 0.0 for y in range(5)}
        flujo_caja[str(active_years[0])] = float(total_cost)
    else:
        # Distribute cost across active years with a realistic "bell curve" pattern
        # (more cost in middle years, less at start/end)
        raw_weights = []
        for i, y in enumerate(active_years):
            if i == 0:
                w = random.uniform(0.1, 0.4)  # Start: lower cost (design/permits)
            elif i == len(active_years) - 1:
                w = random.uniform(0.05, 0.25)  # End: finishing/commissioning
            else:
                w = random.uniform(0.3, 0.6)  # Middle: construction peak
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

    # FORZADO: ~5% of projects get Adjudicado (Equivalent to old es_estructural)
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
        db.query(models.Project).delete()
        db.query(models.Settings).delete()
        db.commit()
        print("Datos existentes eliminados.")

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

    for p in projects_to_create:
        db.add(p)

    # Default settings with real category limits
    settings = models.Settings(
        presupuesto_anual={
            "0": 80000.0,
            "1": 80000.0,
            "2": 80000.0,
            "3": 75000.0,
            "4": 70000.0,
        },
        valor_uf=39807.65,
        ano_en_curso=2026,
        ano_priorizar=2027,
        minimo_priorizar_uf=1000.0,
        historico_promedios={
            "REPOSICIÓN": 12000.0,
            "CRECIMIENTO": 8000.0,
            "TARIFA": 10000.0,
            "MEJORAS": 5000.0,
            "ACTIVACIÓN FINANCIERA": 1000.0,
            "FILIALES": 500.0
        },
        limites_categoria={
            "ACTIVACIÓN FINANCIERA": 0.02,
            "CRECIMIENTO": 0.24,
            "FILIALES": 0.01,
            "MEJORAS": 0.13,
            "REPOSICIÓN": 0.39,
            "TARIFA": 0.21,
        },
        drivers_categoria={
            "REPOSICIÓN": "vir",
            "CRECIMIENTO": "rmi",
            "TARIFA": "max_rmi_vir",
            "MEJORAS": "vir",
            "ACTIVACIÓN FINANCIERA": "rmi",
            "FILIALES": "max_rmi_vir"
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

    print(f"\n✅ Base de datos sembrada con {len(projects_to_create)} proyectos.")
    print(f"\n📊 Distribución de duraciones:")
    for dur in sorted(dur_counter):
        print(f"   {dur} año(s): {dur_counter[dur]} proyectos")

    cat_counter = Counter(p.categoria for p in projects_to_create)
    print(f"\n📂 Distribución por categoría:")
    for cat, count in cat_counter.most_common():
        print(f"   {cat}: {count} proyectos")

    vir_vals = [p.vir for p in projects_to_create]
    rmi_vals = [p.rmi for p in projects_to_create]
    print(f"\n📈 Métricas:")
    print(f"   VIR — Promedio: {sum(vir_vals)/len(vir_vals):.1f} | Min: {min(vir_vals):.1f} | Max: {max(vir_vals):.1f}")
    print(f"   RMI — Promedio: {sum(rmi_vals)/len(rmi_vals):.1f} | Min: {min(rmi_vals):.1f} | Max: {max(rmi_vals):.1f}")

    db.close()


if __name__ == "__main__":
    do_reset = "--reset" in sys.argv
    seed_db(reset=do_reset)
