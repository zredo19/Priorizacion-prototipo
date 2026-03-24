from __future__ import annotations

import csv
import io
import json
import re
import unicodedata
from pathlib import Path
from typing import Any, Dict, List

import openpyxl
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

import models
from database import SessionLocal, engine, get_db
from optimizer import build_budget_matrix, run_ranker


CLP_MULTIPLIER = 1_000_000.0
MIN_CATEGORY_SPEND_CLP = 30_000_000.0

DEFAULT_PRESUPUESTO_ANUAL = {
    "0": 3_200_000_000.0,
    "1": 3_200_000_000.0,
    "2": 3_200_000_000.0,
    "3": 3_000_000_000.0,
    "4": 2_800_000_000.0,
}

DEFAULT_DRIVERS_CATEGORIA = {
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

DEFAULT_MINIMOS_CATEGORIA_OPCIONAL = {
    "MEJORAS VIDA ÚTIL": 30_000_000.0,
    "OTROS": 30_000_000.0,
    "RENTABILIDAD": 30_000_000.0,
}

LEGACY_OTROS_KEYS = {
    "OTROS (FORZAR AUTOS)",
    "OTROS(FORZAR AUTOS)",
    "OTROS(FORZARAUTOS)",
    "OTROS FORZAR AUTOS",
}

LEGACY_OTROS_COMPACT = {
    "OTROS",
    "OTROS(FORZARAUTOS)",
    "OTROSFORZARAUTOS",
}

CANONICAL_CATEGORY_LABELS = {
    "CORRECTIVO": "CORRECTIVO",
    "GESTION DE RIESGO": "GESTIÓN DE RIESGO",
    "MEJORAS VIDA UTIL": "MEJORAS VIDA ÚTIL",
    "NORMATIVO": "NORMATIVO",
    "OTROS": "OTROS",
    "PD CAMBIO DE ESTANDAR": "PD CAMBIO DE ESTÁNDAR",
    "PLAN DE DESARROLLO": "PLAN DE DESARROLLO",
    "RENTABILIDAD": "RENTABILIDAD",
    "ACTIVACION FINANCIERA": "ACTIVACIÓN FINANCIERA",
}

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"
MIGRATION_FILES = ["001_capex_idempotent.sql"]


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFD", str(value or ""))
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def _normalize_spaces_upper(value: str) -> str:
    return " ".join(str(value or "").strip().upper().split())


def _normalize_key_no_accents(value: str) -> str:
    normalized = _normalize_spaces_upper(_strip_accents(value))
    normalized = re.sub(r"[^A-Z0-9() ]+", " ", normalized)
    return _normalize_spaces_upper(normalized)


def _is_otros_key(value: str) -> bool:
    normalized = _normalize_key_no_accents(value)
    compact = normalized.replace(" ", "")
    return normalized in LEGACY_OTROS_KEYS or compact in LEGACY_OTROS_COMPACT


def _canonical_category_label(value: str) -> str:
    key = _normalize_key_no_accents(value)
    compact = key.replace(" ", "")

    if key in LEGACY_OTROS_KEYS or compact in LEGACY_OTROS_COMPACT or "OTRO" in key:
        return "OTROS"
    if "CORRECT" in key:
        return CANONICAL_CATEGORY_LABELS["CORRECTIVO"]
    if "RIESGO" in key and ("GEST" in key or "RISK" in key):
        return CANONICAL_CATEGORY_LABELS["GESTION DE RIESGO"]
    if "MEJOR" in key and ("VIDA" in key or "UTIL" in key):
        return CANONICAL_CATEGORY_LABELS["MEJORAS VIDA UTIL"]
    if "NORMAT" in key:
        return CANONICAL_CATEGORY_LABELS["NORMATIVO"]
    if "PD" in key and "ESTANDAR" in key:
        return CANONICAL_CATEGORY_LABELS["PD CAMBIO DE ESTANDAR"]
    if "PLAN" in key and "DESARROL" in key:
        return CANONICAL_CATEGORY_LABELS["PLAN DE DESARROLLO"]
    if "RENTAB" in key:
        return CANONICAL_CATEGORY_LABELS["RENTABILIDAD"]
    if "ACTIV" in key and "FINAN" in key:
        return CANONICAL_CATEGORY_LABELS["ACTIVACION FINANCIERA"]
    if key in CANONICAL_CATEGORY_LABELS:
        return CANONICAL_CATEGORY_LABELS[key]
    return ""


def _normalize_category_public(value: str) -> str:
    canonical = _canonical_category_label(value)
    if canonical == "OTROS":
        return "Otros"
    if canonical:
        return canonical
    raw = str(value or "").strip()
    return raw if raw else "OTROS"


def _normalize_driver_key(value: str) -> str:
    canonical = _canonical_category_label(value)
    if canonical:
        return canonical
    if _is_otros_key(value):
        return "OTROS"
    return _normalize_spaces_upper(value)


def _coerce_dict(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return {}
    return {}


def _parse_decimal_like(value: Any, default: float = 0.0) -> float:
    if value is None or value == "":
        return default
    if isinstance(value, (int, float)):
        return float(value)
    raw = str(value).strip().replace(" ", "")
    if raw == "":
        return default
    # CL locale tolerance: 1.234.567,89 -> 1234567.89
    if "," in raw and "." in raw:
        raw = raw.replace(".", "").replace(",", ".")
    elif "," in raw:
        raw = raw.replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return default


def _normalize_to_clp_amount(value: Any) -> float:
    amount = float(_parse_decimal_like(value, 0.0))
    # Legacy heuristic: values historically persisted in MM.
    if 0 < abs(amount) < 1_000_000:
        return amount * CLP_MULTIPLIER
    return amount


def _normalize_budget_dict_to_clp(raw_budget: Dict[str, Any]) -> Dict[str, float]:
    raw = _coerce_dict(raw_budget)
    normalized = {str(k): _normalize_to_clp_amount(v) for k, v in raw.items()}
    return {str(y): float(normalized.get(str(y), 0.0)) for y in range(5)}


def _normalize_flujo_caja_to_clp(raw_flujo: Dict[str, Any]) -> Dict[str, float]:
    raw = _coerce_dict(raw_flujo)
    normalized = {str(k): _normalize_to_clp_amount(v) for k, v in raw.items()}
    return {str(y): float(normalized.get(str(y), 0.0)) for y in range(5)}


def _normalize_driver_keys(drivers: Dict[str, Any]) -> Dict[str, str]:
    normalized: Dict[str, str] = {}
    for raw_key, raw_value in _coerce_dict(drivers).items():
        key = _normalize_driver_key(raw_key)
        if not key:
            continue
        value = str(raw_value or "vir").lower()
        normalized[key] = value if value in {"vir", "rmi"} else "vir"
    return normalized


def _normalize_optional_category_minimums(raw_minimums: Dict[str, Any], fallback_default: float) -> Dict[str, float]:
    normalized: Dict[str, float] = {}
    for raw_key, raw_value in _coerce_dict(raw_minimums).items():
        key = _normalize_driver_key(raw_key)
        if not key:
            continue
        normalized[key] = max(0.0, float(_normalize_to_clp_amount(raw_value)))

    if "OTROS" not in normalized:
        raw = _coerce_dict(raw_minimums)
        for legacy_key in LEGACY_OTROS_KEYS:
            if legacy_key in raw:
                normalized["OTROS"] = max(0.0, float(_normalize_to_clp_amount(raw.get(legacy_key, fallback_default))))
                break

    return normalized


def _is_obligatory_or_activacion(category_key: str) -> bool:
    key = _normalize_key_no_accents(category_key)
    return key in {
        "CORRECTIVO",
        "GESTION DE RIESGO",
        "NORMATIVO",
        "PD CAMBIO DE ESTANDAR",
        "PLAN DE DESARROLLO",
        "ACTIVACION FINANCIERA",
    }


def _build_optional_category_minimums(
    drivers_categoria: Dict[str, str],
    explicit_minimums: Dict[str, Any],
    fallback_default: float,
) -> Dict[str, float]:
    mins_by_category = _normalize_optional_category_minimums(explicit_minimums, fallback_default)
    result: Dict[str, float] = {}

    for category in _coerce_dict(drivers_categoria).keys():
        display_key = _normalize_driver_key(category)
        if not display_key or _is_obligatory_or_activacion(display_key):
            continue
        result[display_key] = float(mins_by_category.get(display_key, fallback_default))

    return result


def _settings_payload_to_normalized(payload: Dict[str, Any]) -> Dict[str, Any]:
    normalized_payload = dict(payload)

    legacy_min_mm = normalized_payload.get("minimo_priorizar_mm")
    minimo_priorizar_clp = normalized_payload.get("minimo_priorizar_clp")
    if minimo_priorizar_clp is None and legacy_min_mm is not None:
        minimo_priorizar_clp = legacy_min_mm

    normalized_payload["presupuesto_anual"] = _normalize_budget_dict_to_clp(
        normalized_payload.get("presupuesto_anual", DEFAULT_PRESUPUESTO_ANUAL)
    )
    normalized_payload["minimo_priorizar_clp"] = _normalize_to_clp_amount(minimo_priorizar_clp or MIN_CATEGORY_SPEND_CLP)
    normalized_payload["minimo_categoria_opcional_clp"] = _normalize_to_clp_amount(
        normalized_payload.get("minimo_categoria_opcional_clp", MIN_CATEGORY_SPEND_CLP)
    )
    normalized_payload["drivers_categoria"] = _normalize_driver_keys(
        normalized_payload.get("drivers_categoria", DEFAULT_DRIVERS_CATEGORIA)
    )
    normalized_payload["minimos_categoria_opcional_clp"] = _build_optional_category_minimums(
        normalized_payload.get("drivers_categoria", {}),
        normalized_payload.get("minimos_categoria_opcional_clp", DEFAULT_MINIMOS_CATEGORIA_OPCIONAL),
        normalized_payload.get("minimo_categoria_opcional_clp", MIN_CATEGORY_SPEND_CLP),
    )
    normalized_payload["historico_promedios"] = _coerce_dict(
        normalized_payload.get("historico_promedios", {})
    )
    normalized_payload["ano_en_curso"] = int(_parse_decimal_like(normalized_payload.get("ano_en_curso", 2026), 2026))
    normalized_payload.pop("minimo_priorizar_mm", None)
    return normalized_payload


def _get_or_create_settings(db: Session) -> models.Settings:
    settings = db.query(models.Settings).first()
    if settings:
        return settings

    settings = models.Settings(
        presupuesto_anual=DEFAULT_PRESUPUESTO_ANUAL,
        ano_en_curso=2026,
        minimo_priorizar_clp=MIN_CATEGORY_SPEND_CLP,
        minimo_categoria_opcional_clp=MIN_CATEGORY_SPEND_CLP,
        minimos_categoria_opcional_clp=DEFAULT_MINIMOS_CATEGORIA_OPCIONAL,
        historico_promedios={},
        drivers_categoria=DEFAULT_DRIVERS_CATEGORIA,
    )
    db.add(settings)
    db.flush()
    return settings


def _normalize_and_persist_settings(db: Session, settings: models.Settings) -> None:
    payload = {
        "presupuesto_anual": settings.presupuesto_anual,
        "ano_en_curso": settings.ano_en_curso,
        "minimo_priorizar_clp": getattr(settings, "minimo_priorizar_clp", None),
        "minimo_priorizar_mm": getattr(settings, "minimo_priorizar_mm", None),
        "minimo_categoria_opcional_clp": getattr(settings, "minimo_categoria_opcional_clp", None),
        "minimos_categoria_opcional_clp": getattr(settings, "minimos_categoria_opcional_clp", None),
        "historico_promedios": getattr(settings, "historico_promedios", None),
        "drivers_categoria": getattr(settings, "drivers_categoria", None),
    }
    normalized = _settings_payload_to_normalized(payload)

    changed = False
    for key, value in normalized.items():
        if getattr(settings, key, None) != value:
            setattr(settings, key, value)
            changed = True

    if changed:
        db.flush()


def _migrate_legacy_settings_if_needed(db: Session) -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())

    if "settings" not in table_names:
        return
    if db.query(models.Settings).first() is not None:
        return

    row = db.execute(text("SELECT * FROM settings ORDER BY id LIMIT 1")).mappings().first()
    if row is None:
        return

    legacy_payload = {
        "presupuesto_anual": row.get("presupuesto_anual", DEFAULT_PRESUPUESTO_ANUAL),
        "ano_en_curso": row.get("ano_en_curso", 2026),
        "minimo_priorizar_clp": row.get("minimo_priorizar_clp"),
        "minimo_priorizar_mm": row.get("minimo_priorizar_mm"),
        "minimo_categoria_opcional_clp": row.get("minimo_categoria_opcional_clp", MIN_CATEGORY_SPEND_CLP),
        "minimos_categoria_opcional_clp": row.get("minimos_categoria_opcional_clp", DEFAULT_MINIMOS_CATEGORIA_OPCIONAL),
        "historico_promedios": row.get("historico_promedios", {}),
        "drivers_categoria": row.get("drivers_categoria", DEFAULT_DRIVERS_CATEGORIA),
    }
    normalized = _settings_payload_to_normalized(legacy_payload)

    settings = models.Settings(**normalized)
    db.add(settings)
    db.flush()


def _normalize_existing_projects(db: Session) -> None:
    projects = db.query(models.Project).all()
    changed = False

    for project in projects:
        normalized_category = _normalize_category_public(project.categoria)
        if project.categoria != normalized_category:
            project.categoria = normalized_category
            changed = True

        normalized_flujo = _normalize_flujo_caja_to_clp(project.flujo_caja or {})
        if project.flujo_caja != normalized_flujo:
            project.flujo_caja = normalized_flujo
            changed = True

    if changed:
        db.flush()


def _normalize_legacy_settings_table(db: Session) -> None:
    inspector = inspect(engine)
    if "settings" not in set(inspector.get_table_names()):
        return

    rows = db.execute(text("SELECT id, presupuesto_anual, drivers_categoria, historico_promedios FROM settings")).mappings().all()
    if not rows:
        return

    for row in rows:
        presupuesto = _normalize_budget_dict_to_clp(row.get("presupuesto_anual") or DEFAULT_PRESUPUESTO_ANUAL)
        drivers = _normalize_driver_keys(row.get("drivers_categoria") or DEFAULT_DRIVERS_CATEGORIA)

        historico_raw = _coerce_dict(row.get("historico_promedios") or {})
        historico_norm = {
            _normalize_driver_key(k) if _normalize_driver_key(k) else str(k): _normalize_to_clp_amount(v)
            for k, v in historico_raw.items()
        }

        db.execute(
            text(
                """
                UPDATE settings
                SET presupuesto_anual = CAST(:presupuesto AS json),
                    drivers_categoria = CAST(:drivers AS json),
                    historico_promedios = CAST(:historico AS json),
                    minimo_priorizar_mm = CASE
                        WHEN minimo_priorizar_mm IS NULL THEN minimo_priorizar_mm
                        WHEN abs(minimo_priorizar_mm) > 0 AND abs(minimo_priorizar_mm) < 1000000 THEN minimo_priorizar_mm * 1000000
                        ELSE minimo_priorizar_mm
                    END
                WHERE id = :id
                """
            ),
            {
                "id": row["id"],
                "presupuesto": json.dumps(presupuesto, ensure_ascii=False),
                "drivers": json.dumps(drivers, ensure_ascii=False),
                "historico": json.dumps(historico_norm, ensure_ascii=False),
            },
        )


def _normalize_d_categoria_veolia_if_exists(db: Session) -> None:
    inspector = inspect(engine)
    if "d_categoria_veolia" not in set(inspector.get_table_names()):
        return

    db.execute(
        text(
            """
            UPDATE d_categoria_veolia
            SET valor = 'Otros'
            WHERE upper(trim(valor)) IN (
                'OTROS (FORZAR AUTOS)',
                'OTROS(FORZAR AUTOS)',
                'OTROS(FORZARAUTOS)',
                'OTROS FORZAR AUTOS'
            )
            """
        )
    )


def _run_sql_migrations() -> None:
    if not MIGRATIONS_DIR.exists():
        return

    with engine.begin() as conn:
        for filename in MIGRATION_FILES:
            path = MIGRATIONS_DIR / filename
            if not path.exists():
                continue
            sql = path.read_text(encoding="utf-8")
            conn.execute(text(sql))


def _seed_auto_otros_example_if_missing(db: Session) -> None:
    existing = (
        db.query(models.Project)
        .filter(models.Project.categoria == "Otros")
        .filter(models.Project.nombre.ilike("%AUTO%"))
        .first()
    )
    if existing:
        return

    sample = models.Project(
        pep="AUTO-DEMO-001",
        nombre="RENOVACION FLOTA AUTO OPERACIONAL",
        gerencia="G. TERRITORIALES",
        categoria="Otros",
        subcategoria="FLOTA",
        criterio_codir="OTROS",
        tipo_proyecto="RECURRENTES",
        plan="PLAN FLOTA",
        estado="Solicitado",
        rmi=8.0,
        vir=5.0,
        van=0.0,
        tir=0.0,
        flujo_caja={"0": 22_000_000.0, "1": 5_000_000.0, "2": 0.0, "3": 0.0, "4": 0.0},
    )
    db.add(sample)
    db.flush()


def run_startup_migrations() -> None:
    models.Base.metadata.create_all(bind=engine)

    _run_sql_migrations()

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS capex_configuracion (
                    id SERIAL PRIMARY KEY,
                    presupuesto_anual JSON,
                    ano_en_curso INTEGER DEFAULT 2026,
                    minimo_priorizar_clp DOUBLE PRECISION DEFAULT 30000000,
                    minimo_categoria_opcional_clp DOUBLE PRECISION DEFAULT 30000000,
                    minimos_categoria_opcional_clp JSON,
                    historico_promedios JSON,
                    drivers_categoria JSON
                )
                """
            )
        )
        conn.execute(text("ALTER TABLE capex_configuracion ADD COLUMN IF NOT EXISTS presupuesto_anual JSON"))
        conn.execute(text("ALTER TABLE capex_configuracion ADD COLUMN IF NOT EXISTS ano_en_curso INTEGER DEFAULT 2026"))
        conn.execute(text("ALTER TABLE capex_configuracion ADD COLUMN IF NOT EXISTS minimo_priorizar_clp DOUBLE PRECISION DEFAULT 30000000"))
        conn.execute(text("ALTER TABLE capex_configuracion ADD COLUMN IF NOT EXISTS minimo_categoria_opcional_clp DOUBLE PRECISION DEFAULT 30000000"))
        conn.execute(text("ALTER TABLE capex_configuracion ADD COLUMN IF NOT EXISTS minimos_categoria_opcional_clp JSON"))
        conn.execute(text("ALTER TABLE capex_configuracion ADD COLUMN IF NOT EXISTS historico_promedios JSON"))
        conn.execute(text("ALTER TABLE capex_configuracion ADD COLUMN IF NOT EXISTS drivers_categoria JSON"))

    db = SessionLocal()
    try:
        _normalize_legacy_settings_table(db)
        _normalize_d_categoria_veolia_if_exists(db)
        _migrate_legacy_settings_if_needed(db)
        settings = _get_or_create_settings(db)
        _normalize_and_persist_settings(db, settings)
        _normalize_existing_projects(db)
        _seed_auto_otros_example_if_missing(db)
        db.commit()
    finally:
        db.close()


# Ensure schema and data migrations run on container/app startup.
run_startup_migrations()

app = FastAPI(title="CAPEX Prioritization API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def healthcheck() -> Dict[str, str]:
    return {"status": "ok"}


# ---------------------------------------------------------
# PROJECTS CRUD
# ---------------------------------------------------------


@app.get("/projects/", response_model=List[models.ProjectResponse])
def get_projects(skip: int = 0, limit: int = 500, db: Session = Depends(get_db)):
    projects = db.query(models.Project).offset(skip).limit(limit).all()
    for project in projects:
        project.categoria = _normalize_category_public(project.categoria)
        project.flujo_caja = _normalize_flujo_caja_to_clp(project.flujo_caja or {})
    return projects


@app.post("/projects/", response_model=models.ProjectResponse)
def create_project(project: models.ProjectCreate, db: Session = Depends(get_db)):
    payload = project.model_dump()
    payload["categoria"] = _normalize_category_public(payload.get("categoria"))
    payload["flujo_caja"] = _normalize_flujo_caja_to_clp(payload.get("flujo_caja", {}))

    db_project = models.Project(**payload)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project


@app.put("/projects/{project_id}", response_model=models.ProjectResponse)
def update_project(project_id: int, project_in: models.ProjectCreate, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    payload = project_in.model_dump()
    payload["categoria"] = _normalize_category_public(payload.get("categoria"))
    payload["flujo_caja"] = _normalize_flujo_caja_to_clp(payload.get("flujo_caja", {}))

    for key, value in payload.items():
        setattr(project, key, value)

    db.commit()
    db.refresh(project)
    return project


@app.delete("/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(project)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------
# UPLOAD EXCEL/CSV
# ---------------------------------------------------------


_COLUMN_ALIASES = {
    "pep": ["pep", "código", "codigo", "code", "id_proyecto"],
    "nombre": ["nombre", "definición de proyecto", "definicion de proyecto", "name", "proyecto", "nombre del proyecto", "nombre_proyecto"],
    "gerencia": ["gerencia", "gerencia ejecutante", "gerencia_ejecutante", "area", "departamento"],
    "categoria": ["categoría", "categoria", "category", "tipo_categoria"],
    "subcategoria": ["subcategoría", "subcategoria", "subcategory"],
    "criterio_codir": ["criterio codir", "criterio_codir", "codir"],
    "tipo_proyecto": ["tipo de proyecto", "tipo_de_proyecto", "tipo_proyecto", "tipo"],
    "plan": ["plan al que pertenece", "plan_al_que_pertenece", "plan"],
    "estado": ["estado", "status"],
    "rmi": ["rmi", "risk_management_index"],
    "vir": ["vir", "valor_importancia_relativa"],
    "van": ["van", "valor_actual_neto"],
    "tir": ["tir", "tasa_interna_retorno"],
    "flujo_0": ["año 0", "ano 0", "año_0", "ano_0", "year_0", "a0", "flujo_0"],
    "flujo_1": ["año 1", "ano 1", "año_1", "ano_1", "year_1", "a1", "flujo_1"],
    "flujo_2": ["año 2", "ano 2", "año_2", "ano_2", "year_2", "a2", "flujo_2"],
    "flujo_3": ["año 3", "ano 3", "año_3", "ano_3", "year_3", "a3", "flujo_3"],
    "flujo_4": ["año 4", "ano 4", "año_4", "ano_4", "year_4", "a4", "flujo_4"],
}


def _normalize_header(header: str) -> str:
    normalized = unicodedata.normalize("NFD", header)
    normalized = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
    return normalized.strip().lower().replace("  ", " ")


def _map_columns(raw_headers: List[str]) -> Dict[str, str]:
    mapping = {}
    normalized_headers = {_normalize_header(h): h for h in raw_headers}
    for field, aliases in _COLUMN_ALIASES.items():
        for alias in aliases:
            norm_alias = _normalize_header(alias)
            if norm_alias in normalized_headers:
                mapping[field] = normalized_headers[norm_alias]
                break
    return mapping


def _row_to_project(row: Dict[str, Any], col_map: Dict[str, str]) -> models.Project:
    def get(field: str, default=None):
        raw_col = col_map.get(field)
        if raw_col is None:
            return default
        return row.get(raw_col, default)

    flujo_caja = _normalize_flujo_caja_to_clp(
        {
            "0": _parse_decimal_like(get("flujo_0")),
            "1": _parse_decimal_like(get("flujo_1")),
            "2": _parse_decimal_like(get("flujo_2")),
            "3": _parse_decimal_like(get("flujo_3")),
            "4": _parse_decimal_like(get("flujo_4")),
        }
    )

    categoria = _normalize_category_public(str(get("categoria", "OTROS")))

    return models.Project(
        pep=str(get("pep", "")),
        nombre=str(get("nombre", "Sin nombre")),
        gerencia=str(get("gerencia", "General")),
        categoria=categoria,
        subcategoria=str(get("subcategoria", "") or ""),
        criterio_codir=str(get("criterio_codir", "") or ""),
        tipo_proyecto=str(get("tipo_proyecto", "") or ""),
        plan=str(get("plan", "") or ""),
        estado=str(get("estado", "") or "Solicitado"),
        rmi=_parse_decimal_like(get("rmi")),
        vir=_parse_decimal_like(get("vir")),
        van=_parse_decimal_like(get("van")),
        tir=_parse_decimal_like(get("tir")),
        flujo_caja=flujo_caja,
    )


@app.post("/projects/upload")
async def upload_projects(
    file: UploadFile = File(...),
    reset: bool = Query(False, description="Delete existing projects before import"),
    db: Session = Depends(get_db),
):
    filename = file.filename or ""
    contents = await file.read()

    rows: List[Dict[str, Any]] = []
    headers: List[str] = []

    if filename.lower().endswith(".csv"):
        text_content = contents.decode("utf-8-sig")
        first_line = text_content.split("\n")[0] if text_content else ""
        delimiter = ";" if ";" in first_line else ","
        reader = csv.DictReader(io.StringIO(text_content), delimiter=delimiter)
        headers = reader.fieldnames or []
        rows = list(reader)
    elif filename.lower().endswith((".xlsx", ".xls")):
        workbook = openpyxl.load_workbook(io.BytesIO(contents), read_only=True, data_only=True)
        worksheet = workbook.active
        all_rows = list(worksheet.iter_rows(values_only=True))
        if len(all_rows) < 2:
            raise HTTPException(status_code=400, detail="El archivo no tiene filas de datos.")
        headers = [str(h) if h else f"col_{i}" for i, h in enumerate(all_rows[0])]
        for data_row in all_rows[1:]:
            if all(cell is None for cell in data_row):
                continue
            rows.append(dict(zip(headers, data_row)))
        workbook.close()
    else:
        raise HTTPException(status_code=400, detail="Formato no soportado. Usa .xlsx o .csv")

    col_map = _map_columns(headers)
    if "nombre" not in col_map:
        raise HTTPException(
            status_code=400,
            detail=f"No se encontró la columna 'nombre' o 'DEFINICIÓN DE PROYECTO'. Columnas detectadas: {headers}",
        )

    if reset:
        db.query(models.Project).delete()
        db.commit()

    inserted = 0
    for raw_row in rows:
        project = _row_to_project(raw_row, col_map)
        db.add(project)
        inserted += 1

    db.commit()
    return {"inserted": inserted, "total_rows": len(rows)}


# ---------------------------------------------------------
# SETTINGS
# ---------------------------------------------------------


@app.get("/settings/", response_model=models.SettingsResponse)
def get_settings(db: Session = Depends(get_db)):
    settings = _get_or_create_settings(db)
    _normalize_and_persist_settings(db, settings)
    db.commit()
    db.refresh(settings)
    return settings


@app.put("/settings/", response_model=models.SettingsResponse)
def update_settings(settings_in: models.SettingsBase, db: Session = Depends(get_db)):
    settings = _get_or_create_settings(db)
    payload = _settings_payload_to_normalized(settings_in.model_dump())

    for key, value in payload.items():
        setattr(settings, key, value)

    db.commit()
    db.refresh(settings)
    return settings


# ---------------------------------------------------------
# OPTIMIZE ENDPOINT
# ---------------------------------------------------------


class OptimizePayload(BaseModel):
    metric: str = "vir"


@app.post("/optimize/")
def optimize_portfolio(payload: OptimizePayload, db: Session = Depends(get_db)):
    projects = db.query(models.Project).all()
    settings = _get_or_create_settings(db)
    _normalize_and_persist_settings(db, settings)
    db.commit()
    db.refresh(settings)

    projects_list = []
    for project in projects:
        normalized_flujo = _normalize_flujo_caja_to_clp(project.flujo_caja or {})
        has_cashflow = any(float(v or 0.0) > 0 for v in normalized_flujo.values())
        if not has_cashflow:
            total_estimated = float(project.van or 0.0)
            normalized_flujo = _derive_flujo_caja_from_total(total_estimated)

        projects_list.append(
            {
                "id": project.id,
                "pep": project.pep,
                "nombre": project.nombre,
                "categoria": _normalize_category_public(project.categoria),
                "subcategoria": project.subcategoria,
                "gerencia": project.gerencia,
                "criterio_codir": project.criterio_codir,
                "tipo_proyecto": project.tipo_proyecto,
                "plan": project.plan,
                "estado": project.estado,
                "rmi": project.rmi,
                "vir": project.vir,
                "van": project.van,
                "tir": project.tir,
                "flujo_caja": normalized_flujo,
            }
        )

    settings_dict = {
        "presupuesto_anual": _normalize_budget_dict_to_clp(settings.presupuesto_anual or {}),
        "ano_en_curso": settings.ano_en_curso,
        "drivers_categoria": _normalize_driver_keys(settings.drivers_categoria or {}),
        "minimo_priorizar_clp": _normalize_to_clp_amount(getattr(settings, "minimo_priorizar_clp", MIN_CATEGORY_SPEND_CLP)),
        "minimo_categoria_clp": _normalize_to_clp_amount(
            getattr(settings, "minimo_categoria_opcional_clp", MIN_CATEGORY_SPEND_CLP)
        ),
        "minimos_categoria_clp": _build_optional_category_minimums(
            _normalize_driver_keys(settings.drivers_categoria or {}),
            getattr(settings, "minimos_categoria_opcional_clp", {}) or {},
            _normalize_to_clp_amount(getattr(settings, "minimo_categoria_opcional_clp", MIN_CATEGORY_SPEND_CLP)),
        ),
    }

    result = run_ranker(projects_list, settings_dict, metric=payload.metric)
    result["budget_matrix"] = build_budget_matrix(result, settings_dict)
    return result


def _derive_flujo_caja_from_total(total_cost: float) -> Dict[str, float]:
    total = float(total_cost or 0.0)
    if total <= 0:
        return {str(y): 0.0 for y in range(5)}

    weights = [0.40, 0.25, 0.15, 0.12, 0.08]
    years = {str(idx): round(total * weights[idx], 2) for idx in range(5)}
    assigned = sum(years.values())
    years["4"] += round(total - assigned, 2)
    return years
