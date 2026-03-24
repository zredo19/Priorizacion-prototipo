"""CAPEX Prioritization logic (CLP)."""

from typing import Any, Dict, List
import unicodedata

YEARS = range(5)
MIN_CATEGORY_SPEND_CLP = 30_000_000.0

OBLIGATORY_CATEGORIES = {
    "correctivo",
    "gestion de riesgo",
    "normativo",
    "pd cambio de estandar",
    "pd cambio estandar",
    "plan de desarrollo",
}

_AUTO_KEYWORDS = [
    "AUTO",
    "VEHICULO",
    "FLOTA",
    "AUTOMOVIL",
    "VEHICULOS",
    "TRANSPORTE",
    "CAMION",
    "CAMIONETA",
    "FURGON",
    "MOVIL",
]

PUBLIC_OTROS_LABEL = "Otros"


def normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFD", (value or ""))
    normalized = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    return " ".join(normalized.lower().strip().split())


def _project_total_cost(project: Dict[str, Any]) -> float:
    return sum(float(project.get("flujo_caja", {}).get(str(y), 0.0)) for y in YEARS)


def _is_auto_project(project: Dict[str, Any]) -> bool:
    nombre = normalize_text(project.get("nombre") or "").upper()
    return any(keyword in nombre for keyword in _AUTO_KEYWORDS)


def _is_otros_category(category: str) -> bool:
    normalized = normalize_text(category or "")
    compact = normalized.replace(" ", "")
    return compact in {
        "otros",
        "otros(forzarautos)",
        "otrosforzarautos",
    }


def _public_category_label(category: str) -> str:
    raw = (category or "").strip()
    if _is_otros_category(raw):
        return PUBLIC_OTROS_LABEL
    return raw or "OTROS"


def _category_key(category: str) -> str:
    normalized = normalize_text(category or "OTROS") or "otros"
    if _is_otros_category(normalized):
        return "otros"
    return normalized


def _is_activacion_financiera_category(category: str) -> bool:
    return normalize_text(category or "") == "activacion financiera"


def is_forced(project: Dict[str, Any]) -> bool:
    estado = normalize_text(project.get("estado") or "")
    if estado == "adjudicado":
        return True

    cat = normalize_text(project.get("categoria") or "")
    if cat in OBLIGATORY_CATEGORIES:
        return True

    if _is_activacion_financiera_category(cat):
        return True

    if _is_otros_category(cat) and _is_auto_project(project):
        return True

    return False


def _is_optional_category(category: str) -> bool:
    normalized = normalize_text(category or "")
    if normalized in OBLIGATORY_CATEGORIES:
        return False
    if _is_activacion_financiera_category(normalized):
        return False
    return True


def _optional_category_minimums(settings: Dict[str, Any], categories_present: set, default_minimum: float) -> Dict[str, float]:
    raw = settings.get("minimos_categoria_clp", {}) or {}
    normalized: Dict[str, float] = {}

    for raw_key, raw_value in raw.items():
        key = _category_key(str(raw_key or ""))
        if not key:
            continue
        value = float(raw_value or default_minimum)
        normalized[key] = max(0.0, value)

    result: Dict[str, float] = {}
    for category in categories_present:
        if not _is_optional_category(category):
            continue
        result[category] = float(normalized.get(category, default_minimum))

    return result


def _can_afford(project: Dict[str, Any], remaining_budget: Dict[str, float]) -> bool:
    for y in YEARS:
        ys = str(y)
        cost = float(project.get("flujo_caja", {}).get(ys, 0.0))
        if cost > max(0.0, remaining_budget.get(ys, 0.0)):
            return False
    return True


def _allocate_project(project: Dict[str, Any], selected: List[Dict[str, Any]], remaining_budget: Dict[str, float]) -> None:
    selected.append(project)
    for y in YEARS:
        ys = str(y)
        cost = float(project.get("flujo_caja", {}).get(ys, 0.0))
        remaining_budget[ys] = float(remaining_budget.get(ys, 0.0)) - cost


def _get_metric_value(project: Dict[str, Any], metric: str) -> float:
    return float(project.get(metric, 0.0) or 0.0)


def run_ranker(projects: List[Dict[str, Any]], settings: Dict[str, Any], metric: str = "vir") -> Dict[str, Any]:
    selected_projects: List[Dict[str, Any]] = []
    rejected_projects: List[Dict[str, Any]] = []
    warnings: List[str] = []

    remaining_budget = {
        str(y): float(settings.get("presupuesto_anual", {}).get(str(y), 0.0) or 0.0)
        for y in YEARS
    }

    for project in projects:
        project["categoria"] = _public_category_label(project.get("categoria") or "")

    ignored_projects = [
        p for p in projects if normalize_text(p.get("estado") or "") == "sin presupuesto"
    ]

    forced_projects = [p for p in projects if p not in ignored_projects and is_forced(p)]
    competing_projects = [p for p in projects if p not in ignored_projects and p not in forced_projects]

    # Stage A: forced projects.
    for project in forced_projects:
        project["pre_adjudicado"] = True
        _allocate_project(project, selected_projects, remaining_budget)

    for y in YEARS:
        ys = str(y)
        if remaining_budget[ys] < 0:
            deficit = abs(remaining_budget[ys])
            warnings.append(
                f"Los proyectos obligatorios exceden el presupuesto del Año {y} por ${deficit:,.0f} CLP."
            )

    drivers_raw = settings.get("drivers_categoria", {}) or {}
    drivers = {
        _category_key(cat): str(driver or "vir").lower() for cat, driver in drivers_raw.items()
    }

    def get_project_metric(project: Dict[str, Any]) -> float:
        if metric == "personalizado":
            cat = _category_key(project.get("categoria") or "")
            selected_metric = drivers.get(cat, "vir")
            if selected_metric not in {"vir", "rmi"}:
                selected_metric = "vir"
            return _get_metric_value(project, selected_metric)
        return _get_metric_value(project, metric)

    # Stage B: ranking by chosen metric.
    competing_projects.sort(key=get_project_metric, reverse=True)

    # Stage C: minimum coverage by optional category.
    min_category_spend = float(settings.get("minimo_categoria_clp", MIN_CATEGORY_SPEND_CLP) or 0.0)
    category_spent: Dict[str, float] = {}
    category_labels: Dict[str, str] = {}

    for project in projects:
        if project in ignored_projects:
            continue
        key = _category_key(project.get("categoria") or "OTROS")
        category_labels.setdefault(key, _public_category_label(project.get("categoria") or "OTROS"))

    for project in selected_projects:
        cat = _category_key(project.get("categoria") or "OTROS")
        category_spent[cat] = category_spent.get(cat, 0.0) + _project_total_cost(project)

    categories_present = {
        _category_key(p.get("categoria") or "OTROS") for p in projects if p not in ignored_projects
    }
    min_by_category = _optional_category_minimums(settings, categories_present, min_category_spend)

    for category in sorted(categories_present):
        if not _is_optional_category(category):
            continue

        category_min_spend = float(min_by_category.get(category, min_category_spend))
        current_spend = category_spent.get(category, 0.0)
        if current_spend >= category_min_spend:
            continue

        category_candidates = [
            p for p in competing_projects if _category_key(p.get("categoria") or "OTROS") == category
        ]

        while current_spend < category_min_spend and category_candidates:
            affordable = [p for p in category_candidates if _can_afford(p, remaining_budget)]
            if not affordable:
                break

            affordable.sort(key=get_project_metric, reverse=True)
            chosen = affordable[0]
            chosen["pre_adjudicado"] = False
            _allocate_project(chosen, selected_projects, remaining_budget)
            competing_projects.remove(chosen)
            category_candidates.remove(chosen)

            project_cost = _project_total_cost(chosen)
            current_spend += project_cost
            category_spent[category] = current_spend

        if current_spend < category_min_spend and (category_candidates or category_spent.get(category, 0.0) > 0):
            category_label = category_labels.get(category, category.upper())
            warnings.append(
                f"No fue posible alcanzar el minimo de ${category_min_spend:,.0f} CLP para categoria '{category_label}'."
            )

    # Stage D: greedy fill with remaining budget.
    competing_projects.sort(key=get_project_metric, reverse=True)
    for project in competing_projects:
        if _can_afford(project, remaining_budget):
            project["pre_adjudicado"] = False
            _allocate_project(project, selected_projects, remaining_budget)
        else:
            project["pre_adjudicado"] = False
            rejected_projects.append(project)

    return {
        "selected": selected_projects,
        "rejected": rejected_projects,
        "remaining_budget": remaining_budget,
        "warnings": warnings,
    }


def build_budget_matrix(result: Dict[str, Any], settings: Dict[str, Any]) -> Dict[str, Any]:
    presupuesto_anual = settings.get("presupuesto_anual", {})
    years = ["0", "1", "2", "3", "4"]

    all_categories = sorted(
        {
            _public_category_label(project.get("categoria", ""))
            for project in result.get("selected", []) + result.get("rejected", [])
            if project.get("categoria", "")
        },
        key=lambda cat: (_is_activacion_financiera_category(cat), normalize_text(cat)),
    )

    matrix: Dict[str, Any] = {}

    for cat in all_categories:
        cat_data = {"years": {}}
        for y in years:
            year_budget = float(presupuesto_anual.get(y, 0))
            pre_adj = 0.0
            agregado = 0.0
            rechazado = 0.0

            for project in result.get("selected", []):
                if _public_category_label(project.get("categoria", "")) != cat:
                    continue
                cost = float(project.get("flujo_caja", {}).get(y, 0.0))
                if bool(project.get("pre_adjudicado")) or is_forced(project):
                    pre_adj += cost
                else:
                    agregado += cost

            for project in result.get("rejected", []):
                if _public_category_label(project.get("categoria", "")) != cat:
                    continue
                rechazado += float(project.get("flujo_caja", {}).get(y, 0.0))

            cat_data["years"][y] = {
                "budget_total": round(year_budget, 2),
                "pre_adjudicado": round(pre_adj, 2),
                "agregado": round(agregado, 2),
                "rechazado": round(rechazado, 2),
                "total": round(pre_adj + agregado, 2),
            }

        matrix[cat] = cat_data

    total_row = {"years": {}}
    for y in years:
        year_budget = float(presupuesto_anual.get(y, 0))
        total_pre_adj = sum(matrix[cat]["years"][y]["pre_adjudicado"] for cat in all_categories)
        total_agregado = sum(matrix[cat]["years"][y]["agregado"] for cat in all_categories)
        total_rechazado = sum(matrix[cat]["years"][y]["rechazado"] for cat in all_categories)
        total_row["years"][y] = {
            "budget_total": round(year_budget, 2),
            "pre_adjudicado": round(total_pre_adj, 2),
            "agregado": round(total_agregado, 2),
            "rechazado": round(total_rechazado, 2),
            "total": round(total_pre_adj + total_agregado, 2),
        }

    matrix["TOTAL"] = total_row
    return matrix
