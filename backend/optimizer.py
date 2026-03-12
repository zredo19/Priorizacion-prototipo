"""
CAPEX Optimization logic using PuLP.
Mapping Business Rules:
1. Stage 1: Structural Projects (FORZADO) automatically take budget.
2. Stage 2: Integer/Binary Knapsack with PuLP for rest.
Years are indexed 0-4 (AÑO 0 through AÑO 4).
"""
import pulp
from typing import List, Dict, Any

YEARS = range(5)  # 0, 1, 2, 3, 4


def _get_metric_value(project: Dict[str, Any], metric: str) -> float:
    """Return the metric value for a project.
    If metric is 'max_rmi_vir', returns max(rmi, vir) — same as Excel's MAX column."""
    if metric == "max_rmi_vir":
        return max(float(project.get("rmi", 0.0)), float(project.get("vir", 0.0)))
    return float(project.get(metric, 0.0))


def run_optimization(
    projects: List[Dict[str, Any]],
    settings: Dict[str, Any],
    metric: str = "vir",
    mode: str = "pmp"
):
    """
    Run the 2-stage optimization process.
    `projects` is a list of dicts mapping to the Project DB Model.
    `settings` contains 'presupuesto_anual', 'limites_categoria', 'ano_en_curso', 'ano_priorizar'.
    """
    selected_projects = []
    rejected_projects = []

    # Deep copy budget to avoid mutating the original settings object
    remaining_budget = {str(y): float(settings.get("presupuesto_anual", {}).get(str(y), 0)) for y in YEARS}

    ano_en_curso = int(settings.get("ano_en_curso", 2026))
    ano_priorizar = int(settings.get("ano_priorizar", 2027))
    target_year_idx = ano_priorizar - ano_en_curso
    is_poa = mode.lower() == "poa" and 0 <= target_year_idx <= 4
    
    is_poa = mode.lower() == "poa" and 0 <= target_year_idx <= 4

    # ---------------------------------------------------------
    # STAGE 1: Structural Projects (Ingreso Directo / FORZADO)
    # ---------------------------------------------------------
    structural_projects = [p for p in projects if p.get("estado", "").lower() == "adjudicado"]
    ignored_projects = [p for p in projects if p.get("estado", "").lower() == "sin presupuesto"]
    competing_projects = [
        p for p in projects 
        if p.get("estado", "").lower() not in ["adjudicado", "sin presupuesto"]
    ]

    # Filter by minimum prioritization threshold
    minimo_priorizar = float(settings.get("minimo_priorizar_uf", 0))
    if minimo_priorizar > 0:
        below_min = [p for p in competing_projects if sum(float(p.get("flujo_caja", {}).get(str(y), 0)) for y in YEARS) < minimo_priorizar]
        competing_projects = [p for p in competing_projects if p not in below_min]
        rejected_projects.extend(below_min)

    for sp in structural_projects:
        selected_projects.append(sp)
        for y in YEARS:
            year_str = str(y)
            cost_this_year = float(sp.get("flujo_caja", {}).get(year_str, 0.0))
            remaining_budget[year_str] -= cost_this_year

    # ---------------------------------------------------------
    # STAGE 2: Optimization via PuLP
    # ---------------------------------------------------------
    if not competing_projects:
        return {"selected": selected_projects, "rejected": [], "remaining_budget": remaining_budget}

    prob = pulp.LpProblem("CAPEX_Optimization", pulp.LpMaximize)

    # Decision Variables: 1 if project 'i' is selected, 0 otherwise
    project_vars = {}
    for i, p in enumerate(competing_projects):
        project_vars[i] = pulp.LpVariable(f"proj_{i}", cat='Binary')

    # Helper for specific metric
    # vir, rmi, max_rmi_vir: apply globally to all categories.
    # personalizado: use per-category driver from settings.
    drivers = settings.get("drivers_categoria", {})
    _logged_cats = set()

    def get_project_metric(p):
        if metric == "personalizado":
            cat = (p.get("categoria") or "").strip()
            m = drivers.get(cat) or "max_rmi_vir"
            if cat not in _logged_cats:
                print(f"[DEBUG] Category '{cat}' using driver: {m}")
                _logged_cats.add(cat)
            return _get_metric_value(p, m)
        return _get_metric_value(p, metric)

    # Objective Function: Maximize total metric (VIR, RMI, or MAX(RMI/VIR)) by category driver
    # In POA mode, we only get score from projects that have cost in the target year.
    prob += pulp.lpSum([
        project_vars[i] * get_project_metric(p) 
        for i, p in enumerate(competing_projects)
        if not is_poa or float(p.get("flujo_caja", {}).get(str(target_year_idx), 0.0)) > 0
    ])

    # Constraint 1: Do not exceed remaining budget per year
    for y in YEARS:
        year_str = str(y)
        available = max(0.0, remaining_budget[year_str])
        prob += pulp.lpSum([
            project_vars[i] * float(p.get("flujo_caja", {}).get(year_str, 0.0))
            for i, p in enumerate(competing_projects)
        ]) <= available, f"Budget_Year_{year_str}"

    # Constraint 2: Category Limits (STRICT PER YEAR)
    original_budget = {str(y): float(settings.get("presupuesto_anual", {}).get(str(y), 0)) for y in YEARS}
    category_limits = settings.get("limites_categoria", {})
    
    if category_limits:
        for cat, percent_limit in category_limits.items():
            for y in YEARS:
                year_str = str(y)
                year_budget = original_budget[year_str]
                if year_budget <= 0:
                    continue
                
                max_cat_budget_year = year_budget * percent_limit

                # Structural costs for this category and year
                struct_cat_cost_year = sum(
                    float(sp.get("flujo_caja", {}).get(year_str, 0.0))
                    for sp in structural_projects if sp.get("categoria") == cat
                )
                
                # Prevent infeasible problem if structural projects already exceeded limit
                available_cat_budget = max(0.0, max_cat_budget_year - struct_cat_cost_year)

                prob += pulp.lpSum([
                    project_vars[i] * float(p.get("flujo_caja", {}).get(year_str, 0.0))
                    for i, p in enumerate(competing_projects) if p.get("categoria") == cat
                ]) <= available_cat_budget

    # Solve
    prob.solve(pulp.PULP_CBC_CMD(msg=0))

    for i, p in enumerate(competing_projects):
        if pulp.value(project_vars[i]) == 1.0:
            selected_projects.append(p)
            for y in YEARS:
                year_str = str(y)
                remaining_budget[year_str] -= float(p.get("flujo_caja", {}).get(year_str, 0.0))
        else:
            rejected_projects.append(p)

    return {
        "selected": selected_projects,
        "rejected": rejected_projects,
        "remaining_budget": remaining_budget
    }


def run_ranker(
    projects: List[Dict[str, Any]],
    settings: Dict[str, Any],
    metric: str = "vir",
    mode: str = "pmp"
):
    """
    Ranker logic with category limits. Greedily allocates budget sorted by metric,
    respecting both annual budget ceilings and category percentage limits.
    """
    selected_projects = []
    rejected_projects = []
    remaining_budget = {str(y): float(settings.get("presupuesto_anual", {}).get(str(y), 0)) for y in YEARS}

    ano_en_curso = int(settings.get("ano_en_curso", 2026))
    ano_priorizar = int(settings.get("ano_priorizar", 2027))
    target_year_idx = ano_priorizar - ano_en_curso
    is_poa = mode.lower() == "poa" and 0 <= target_year_idx <= 4

    # STAGE 1: Structural
    structural_projects = [p for p in projects if p.get("estado", "").lower() == "adjudicado"]
    ignored_projects = [p for p in projects if p.get("estado", "").lower() == "sin presupuesto"]
    competing_projects = [
        p for p in projects 
        if p.get("estado", "").lower() not in ["adjudicado", "sin presupuesto"]
    ]

    # Filter by minimum prioritization threshold
    minimo_priorizar = float(settings.get("minimo_priorizar_uf", 0))
    if minimo_priorizar > 0:
        below_min = [p for p in competing_projects if sum(float(p.get("flujo_caja", {}).get(str(y), 0)) for y in YEARS) < minimo_priorizar]
        competing_projects = [p for p in competing_projects if p not in below_min]
        rejected_projects.extend(below_min)

    for sp in structural_projects:
        selected_projects.append(sp)
        for y in YEARS:
            year_str = str(y)
            remaining_budget[year_str] -= float(sp.get("flujo_caja", {}).get(year_str, 0.0))

    # Category limits setup (STRICT PER YEAR)
    category_limits = settings.get("limites_categoria", {})
    original_budget = {str(y): float(settings.get("presupuesto_anual", {}).get(str(y), 0)) for y in YEARS}

    # Track spending per category and year (including structural)
    category_spent_years = {} # { "CAT": { "0": 100, "1": 50 } }
    for sp in structural_projects:
        cat = sp.get("categoria", "")
        if cat not in category_spent_years:
            category_spent_years[cat] = {str(y): 0.0 for y in YEARS}
        for y in YEARS:
            ys = str(y)
            cost = float(sp.get("flujo_caja", {}).get(ys, 0.0))
            category_spent_years[cat][ys] += cost

    # Helper for specific metric
    # vir, rmi, max_rmi_vir: apply globally to all categories.
    # personalizado: use per-category driver from settings.
    drivers = settings.get("drivers_categoria", {})
    _logged_cats = set()

    def get_project_metric(p):
        if metric == "personalizado":
            cat = (p.get("categoria") or "").strip()
            m = drivers.get(cat) or "max_rmi_vir"
            if cat not in _logged_cats:
                print(f"[DEBUG-RANKER] Category '{cat}' using driver: {m}")
                _logged_cats.add(cat)
            return _get_metric_value(p, m)
        return _get_metric_value(p, metric)

    # Sort DESC by chosen metric per category
    competing_projects.sort(key=lambda x: get_project_metric(x), reverse=True)

    for p in competing_projects:
        # In POA mode, greedily skip projects that have no cost in the target year
        if is_poa and float(p.get("flujo_caja", {}).get(str(target_year_idx), 0.0)) <= 0:
            rejected_projects.append(p)
            continue

        # Check constraints
        can_afford = True
        for y in YEARS:
            year_str = str(y)
            cost = float(p.get("flujo_caja", {}).get(year_str, 0.0))
            if cost > max(0.0, remaining_budget[year_str]):
                can_afford = False
                break

        # Check category limit STRICT PER YEAR
        if can_afford and category_limits:
            cat = p.get("categoria", "")
            if cat in category_limits:
                percent_limit = category_limits[cat]
                for y in YEARS:
                    ys = str(y)
                    year_budget = original_budget[ys]
                    if year_budget <= 0: continue
                    
                    max_cat_budget_year = year_budget * percent_limit
                    project_cost_year = float(p.get("flujo_caja", {}).get(ys, 0.0))
                    current_cat_spent_year = category_spent_years.get(cat, {}).get(ys, 0.0)
                    
                    if current_cat_spent_year + project_cost_year > max_cat_budget_year:
                        can_afford = False
                        break

        if can_afford:
            selected_projects.append(p)
            cat = p.get("categoria", "")
            if cat not in category_spent_years:
                category_spent_years[cat] = {str(y): 0.0 for y in YEARS}
            for y in YEARS:
                ys = str(y)
                cost = float(p.get("flujo_caja", {}).get(ys, 0.0))
                remaining_budget[ys] -= cost
                category_spent_years[cat][ys] += cost
        else:
            rejected_projects.append(p)

    return {
        "selected": selected_projects,
        "rejected": rejected_projects,
        "remaining_budget": remaining_budget
    }
