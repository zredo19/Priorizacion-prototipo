from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Dict, Any
import io
import csv
import openpyxl
from pydantic import BaseModel

import models
from database import engine, get_db
from optimizer import run_optimization, run_ranker

# Create tables if not exist
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="CAPEX Prioritization API")

# Setup CORS to allow React Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For dev only, restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------
# PROJECTS CRUD
# ---------------------------------------------------------

@app.get("/projects/", response_model=List[models.ProjectResponse])
def get_projects(skip: int = 0, limit: int = 500, db: Session = Depends(get_db)):
    return db.query(models.Project).offset(skip).limit(limit).all()

@app.post("/projects/", response_model=models.ProjectResponse)
def create_project(project: models.ProjectCreate, db: Session = Depends(get_db)):
    db_project = models.Project(**project.model_dump())
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

@app.put("/projects/{project_id}", response_model=models.ProjectResponse)
def update_project(project_id: int, project_in: models.ProjectCreate, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    for key, value in project_in.model_dump().items():
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

# Flexible column aliases to map various header names to internal fields
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
    "es_estructural": ["forzado", "es_estructural", "estructural", "structural", "obligatorio"],
    "flujo_0": ["año 0", "ano 0", "año_0", "ano_0", "year_0", "a0", "flujo_0"],
    "flujo_1": ["año 1", "ano 1", "año_1", "ano_1", "year_1", "a1", "flujo_1"],
    "flujo_2": ["año 2", "ano 2", "año_2", "ano_2", "year_2", "a2", "flujo_2"],
    "flujo_3": ["año 3", "ano 3", "año_3", "ano_3", "year_3", "a3", "flujo_3"],
    "flujo_4": ["año 4", "ano 4", "año_4", "ano_4", "year_4", "a4", "flujo_4"],
}
# Columns that exist in exports but are computed/ignored on import
_IGNORED_COLUMNS = {"total proyecto", "total_proy.", "total_proy", "max (rmi/vir)", "max(rmi/vir)"}

def _normalize_header(header: str) -> str:
    """Normalize a header string for flexible column matching."""
    import unicodedata
    normalized = unicodedata.normalize("NFD", header)
    normalized = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
    return normalized.strip().lower().replace("  ", " ")

def _map_columns(raw_headers: List[str]) -> Dict[str, str]:
    """Map raw file headers to internal field names using aliases."""
    mapping = {}
    normalized_headers = {_normalize_header(h): h for h in raw_headers}
    for field, aliases in _COLUMN_ALIASES.items():
        for alias in aliases:
            norm_alias = _normalize_header(alias)
            if norm_alias in normalized_headers:
                mapping[field] = normalized_headers[norm_alias]
                break
    return mapping

def _parse_bool(value) -> bool:
    """Parse various boolean representations."""
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    str_val = str(value).strip().lower()
    return str_val in ("true", "1", "si", "sí", "yes", "verdadero", "x")

def _parse_float(value, default: float = 0.0) -> float:
    """Safely parse a float value."""
    if value is None:
        return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default

def _row_to_project(row: Dict[str, Any], col_map: Dict[str, str]) -> models.Project:
    """Convert a raw row dict into a Project ORM instance."""
    def get(field: str, default=None):
        raw_col = col_map.get(field)
        if raw_col is None:
            return default
        return row.get(raw_col, default)

    flujo_caja = {
        "0": _parse_float(get("flujo_0")),
        "1": _parse_float(get("flujo_1")),
        "2": _parse_float(get("flujo_2")),
        "3": _parse_float(get("flujo_3")),
        "4": _parse_float(get("flujo_4")),
    }

    return models.Project(
        pep=str(get("pep", "")),
        nombre=str(get("nombre", "Sin nombre")),
        gerencia=str(get("gerencia", "General")),
        categoria=str(get("categoria", "OTROS")),
        subcategoria=str(get("subcategoria", "") or ""),
        criterio_codir=str(get("criterio_codir", "") or ""),
        tipo_proyecto=str(get("tipo_proyecto", "") or ""),
        plan=str(get("plan", "") or ""),
        estado=str(get("estado", "") or "Solicitado"),
        rmi=_parse_float(get("rmi")),
        vir=_parse_float(get("vir")),
        van=_parse_float(get("van")),
        tir=_parse_float(get("tir")),
        flujo_caja=flujo_caja,
    )

@app.post("/projects/upload")
async def upload_projects(
    file: UploadFile = File(...),
    reset: bool = Query(False, description="Delete existing projects before import"),
    db: Session = Depends(get_db),
):
    """Import projects from an Excel (.xlsx) or CSV file."""
    filename = file.filename or ""
    contents = await file.read()

    rows: List[Dict[str, Any]] = []
    headers: List[str] = []

    if filename.lower().endswith(".csv"):
        text = contents.decode("utf-8-sig")
        # Auto-detect delimiter: semicolon vs comma
        first_line = text.split("\n")[0] if text else ""
        delimiter = ";" if ";" in first_line else ","
        reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
        headers = reader.fieldnames or []
        rows = list(reader)
    elif filename.lower().endswith((".xlsx", ".xls")):
        wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True, data_only=True)
        ws = wb.active
        all_rows = list(ws.iter_rows(values_only=True))
        if len(all_rows) < 2:
            raise HTTPException(status_code=400, detail="El archivo no tiene filas de datos.")
        headers = [str(h) if h else f"col_{i}" for i, h in enumerate(all_rows[0])]
        for data_row in all_rows[1:]:
            if all(cell is None for cell in data_row):
                continue
            rows.append(dict(zip(headers, data_row)))
        wb.close()
    else:
        raise HTTPException(status_code=400, detail="Formato no soportado. Usa .xlsx o .csv")

    col_map = _map_columns(headers)

    if "nombre" not in col_map:
        raise HTTPException(
            status_code=400,
            detail=f"No se encontró la columna 'nombre' o 'DEFINICIÓN DE PROYECTO'. Columnas detectadas: {headers}"
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
    settings = db.query(models.Settings).first()
    if not settings:
        settings = models.Settings(
            presupuesto_anual={"0": 60000.0, "1": 65000.0, "2": 70000.0, "3": 72000.0, "4": 75000.0},
            valor_uf=38000.0,
            limites_categoria={
                "ACTIVACIÓN FINANCIERA": 0.02,
                "CRECIMIENTO": 0.24,
                "FILIALES": 0.01,
                "MEJORAS": 0.13,
                "REPOSICIÓN": 0.39,
                "TARIFA": 0.21,
            },
            drivers_categoria={
                "REPOSICIÓN": "max_rmi_vir",
                "CRECIMIENTO": "max_rmi_vir",
                "TARIFA": "rmi",
                "MEJORAS": "rmi",
                "ACTIVACIÓN FINANCIERA": "vir",
                "FILIALES": "vir"
            }
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings

@app.put("/settings/", response_model=models.SettingsResponse)
def update_settings(settings_in: models.SettingsBase, db: Session = Depends(get_db)):
    settings = db.query(models.Settings).first()
    if not settings:
        settings = models.Settings(**settings_in.model_dump())
        db.add(settings)
    else:
        for key, value in settings_in.model_dump().items():
            setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    return settings

@app.get("/settings/fetch-uf")
def fetch_uf():
    """Fetch today's UF value from mindicador.cl and return it without saving."""
    import urllib.request
    import json
    import ssl
    import time

    MAX_RETRIES = 3
    TIMEOUT_SECONDS = 15
    url = "https://mindicador.cl/api/uf"

    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            if attempt < 2:
                ctx = ssl.create_default_context()
            else:
                ctx = ssl._create_unverified_context()

            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS, context=ctx) as response:
                data = json.loads(response.read().decode())
                valor_uf = data["serie"][0]["valor"]
            
            return {"valor_uf": valor_uf}

        except Exception as e:
            last_error = e
            if attempt < MAX_RETRIES - 1:
                time.sleep(1)

    raise HTTPException(status_code=500, detail="Error al obtener UF")

# ---------------------------------------------------------
# OPTIMIZE ENDPOINT
# ---------------------------------------------------------

class OptimizePayload(BaseModel):
    method: str = "optimization"  # "optimization" or "ranker"
    metric: str = "vir"  # "vir" or "rmi"
    mode: str = "pmp"  # "pmp" (Medium Term) or "poa" (Annual)

@app.post("/optimize/")
def optimize_portfolio(payload: OptimizePayload, db: Session = Depends(get_db)):
    projects = db.query(models.Project).all()
    settings = db.query(models.Settings).first()

    if not settings:
        raise HTTPException(status_code=400, detail="Settings not configured")

    projects_list = []
    for p in projects:
        projects_list.append({
            "id": p.id,
            "pep": p.pep,
            "nombre": p.nombre,
            "categoria": p.categoria,
            "subcategoria": p.subcategoria,
            "gerencia": p.gerencia,
            "criterio_codir": p.criterio_codir,
            "tipo_proyecto": p.tipo_proyecto,
            "plan": p.plan,
            "estado": p.estado,
            "rmi": p.rmi,
            "vir": p.vir,
            "van": p.van,
            "tir": p.tir,
            "flujo_caja": p.flujo_caja
        })

    settings_dict = {
        "presupuesto_anual": settings.presupuesto_anual,
        "limites_categoria": settings.limites_categoria,
        "ano_en_curso": settings.ano_en_curso,
        "ano_priorizar": settings.ano_priorizar,
        "drivers_categoria": settings.drivers_categoria,
        "minimo_priorizar_uf": settings.minimo_priorizar_uf
    }

    print(f"[OPTIMIZE] method={payload.method}, metric={payload.metric}, mode={payload.mode}")
    print(f"[OPTIMIZE] drivers_categoria={settings_dict.get('drivers_categoria', {})}")

    if payload.method == "ranker":
        result = run_ranker(projects_list, settings_dict, metric=payload.metric, mode=payload.mode)
    else:
        result = run_optimization(projects_list, settings_dict, metric=payload.metric, mode=payload.mode)

    # --- Post-optimization: Budget Matrix (Detalle Resumen de Resultados) ---
    budget_matrix = _build_budget_matrix(result, settings_dict)
    result["budget_matrix"] = budget_matrix

    return result

def _build_budget_matrix(
    result: Dict[str, Any],
    settings_dict: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Build the budget breakdown matrix per Category x Year.
    For each category and each year returns:
      - budget_limit: max budget for this category in this year
      - pre_adjudicado: sum of cashflows for 'Adjudicado' projects (forced)
      - agregado: sum of cashflows for optimizer-selected non-Adjudicado projects
      - total: pre_adjudicado + agregado
    Also returns a 'TOTAL' row aggregating all categories.
    """
    presupuesto_anual = settings_dict.get("presupuesto_anual", {})
    limites_categoria = settings_dict.get("limites_categoria", {})
    years = ["0", "1", "2", "3", "4"]

    # Compute total budget per year
    total_budget_all_years = sum(float(presupuesto_anual.get(y, 0)) for y in years)

    # Collect all categories from limits
    all_categories = list(limites_categoria.keys())

    # Also include categories from selected projects that might not be in limits
    for p in result.get("selected", []):
        cat = p.get("categoria", "")
        if cat and cat not in all_categories:
            all_categories.append(cat)

    matrix = {}

    for cat in all_categories:
        cat_pct = float(limites_categoria.get(cat, 0))
        cat_data = {"years": {}}

        for y in years:
            year_budget = float(presupuesto_anual.get(y, 0))
            cat_budget_limit = year_budget * cat_pct

            pre_adj = 0.0
            agregado = 0.0
            rechazado = 0.0

            for p in result.get("selected", []):
                if p.get("categoria", "") != cat:
                    continue
                cost = float(p.get("flujo_caja", {}).get(y, 0.0))
                if p.get("estado", "").lower() == "adjudicado":
                    pre_adj += cost
                else:
                    agregado += cost

            for p in result.get("rejected", []):
                if p.get("categoria", "") != cat:
                    continue
                rechazado += float(p.get("flujo_caja", {}).get(y, 0.0))

            cat_data["years"][y] = {
                "budget_limit": round(cat_budget_limit, 2),
                "pre_adjudicado": round(pre_adj, 2),
                "agregado": round(agregado, 2),
                "rechazado": round(rechazado, 2),
                "total": round(pre_adj + agregado, 2)
            }

        matrix[cat] = cat_data

    # Build TOTAL row
    total_row = {"years": {}}
    for y in years:
        total_limit = sum(matrix[cat]["years"][y]["budget_limit"] for cat in all_categories)
        total_pre_adj = sum(matrix[cat]["years"][y]["pre_adjudicado"] for cat in all_categories)
        total_agregado = sum(matrix[cat]["years"][y]["agregado"] for cat in all_categories)
        total_rechazado = sum(matrix[cat]["years"][y]["rechazado"] for cat in all_categories)
        
        total_row["years"][y] = {
            "budget_limit": round(total_limit, 2),
            "pre_adjudicado": round(total_pre_adj, 2),
            "agregado": round(total_agregado, 2),
            "rechazado": round(total_rechazado, 2),
            "total": round(total_pre_adj + total_agregado, 2)
        }
    
    matrix["TOTAL"] = total_row
    
    return matrix
