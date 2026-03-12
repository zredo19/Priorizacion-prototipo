from sqlalchemy import Column, Integer, String, Float, Boolean, JSON
from database import Base
from pydantic import BaseModel, ConfigDict
from typing import Optional, Dict

# SQLAlchemy Models
class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    pep = Column(String, index=True)  # Código PEP del proyecto
    nombre = Column(String, index=True)  # DEFINICIÓN DE PROYECTO
    gerencia = Column(String, index=True)  # GERENCIA EJECUTANTE
    categoria = Column(String, index=True)  # CATEGORÍA
    subcategoria = Column(String, nullable=True)  # SUBCATEGORÍA
    criterio_codir = Column(String, nullable=True)  # CRITERIO CODIR
    tipo_proyecto = Column(String, nullable=True)  # TIPO DE PROYECTO
    plan = Column(String, nullable=True)  # PLAN AL QUE PERTENECE
    estado = Column(String, nullable=True)  # ESTADO
    rmi = Column(Float, default=0.0)
    vir = Column(Float, default=0.0)
    van = Column(Float, default=0.0)
    tir = Column(Float, default=0.0)

    # Store projected cashflow/costs for years 0 to 4 as JSON
    # Format: {"0": 100.0, "1": 150.0, "2": 0.0, "3": 0.0, "4": 0.0}
    flujo_caja = Column(JSON)

class Settings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    # Budget per year as JSON: {"0": 1000.0, "1": 1000.0, ...}
    presupuesto_anual = Column(JSON)
    valor_uf = Column(Float, default=38000.0)
    # Limits per category as JSON: {"REPOSICIÓN": 0.5, "MEJORA": 0.3}
    limites_categoria = Column(JSON)
    
    # New Time and Financial controls
    ano_en_curso = Column(Integer, default=2026)
    ano_priorizar = Column(Integer, default=2027)
    minimo_priorizar_uf = Column(Float, default=1000.0)
    historico_promedios = Column(JSON, default=dict)
    # Drivers por categoria: {"REPOSICIÓN": "max_rmi_vir", "TARIFA": "rmi"}
    drivers_categoria = Column(JSON, default=dict)

# Pydantic Schemas
class ProjectBase(BaseModel):
    pep: str = ""
    nombre: str
    gerencia: str
    categoria: str
    subcategoria: str = ""
    criterio_codir: str = ""
    tipo_proyecto: str = ""
    plan: str = ""
    estado: str = ""
    rmi: float = 0.0
    vir: float = 0.0
    van: float = 0.0
    tir: float = 0.0
    flujo_caja: Dict[str, float]

class ProjectCreate(ProjectBase):
    pass

class ProjectResponse(ProjectBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class SettingsBase(BaseModel):
    presupuesto_anual: Dict[str, float]
    valor_uf: float
    limites_categoria: Dict[str, float]
    ano_en_curso: int = 2026
    ano_priorizar: int = 2027
    minimo_priorizar_uf: float = 1000.0
    historico_promedios: Dict[str, float] = {}
    drivers_categoria: Dict[str, str] = {}

class SettingsResponse(SettingsBase):
    id: int
    model_config = ConfigDict(from_attributes=True)
