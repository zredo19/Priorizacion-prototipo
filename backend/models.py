from typing import Dict, Optional

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import JSON, Column, Float, Integer, String

from database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    pep = Column(String, index=True)
    nombre = Column(String, index=True)
    gerencia = Column(String, index=True)
    categoria = Column(String, index=True)
    subcategoria = Column(String, nullable=True)
    criterio_codir = Column(String, nullable=True)
    tipo_proyecto = Column(String, nullable=True)
    plan = Column(String, nullable=True)
    estado = Column(String, nullable=True)
    rmi = Column(Float, default=0.0)
    vir = Column(Float, default=0.0)
    van = Column(Float, default=0.0)
    tir = Column(Float, default=0.0)
    flujo_caja = Column(JSON, default=dict)


class CapexConfiguracion(Base):
    __tablename__ = "capex_configuracion"

    id = Column(Integer, primary_key=True, index=True)
    presupuesto_anual = Column(JSON, default=dict)
    ano_en_curso = Column(Integer, default=2026)
    minimo_priorizar_clp = Column(Float, default=30_000_000.0)
    minimo_categoria_opcional_clp = Column(Float, default=30_000_000.0)
    minimos_categoria_opcional_clp = Column(JSON, default=dict)
    historico_promedios = Column(JSON, default=dict)
    drivers_categoria = Column(JSON, default=dict)


# Backward-compatible alias used across existing code.
Settings = CapexConfiguracion


class ProjectBase(BaseModel):
    pep: str = ""
    nombre: str
    gerencia: str = ""
    categoria: str = ""
    subcategoria: str = ""
    criterio_codir: str = ""
    tipo_proyecto: str = ""
    plan: str = ""
    estado: str = "Solicitado"
    rmi: float = 0.0
    vir: float = 0.0
    van: float = 0.0
    tir: float = 0.0
    flujo_caja: Dict[str, float] = Field(default_factory=dict)


class ProjectCreate(ProjectBase):
    pass


class ProjectResponse(ProjectBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class SettingsBase(BaseModel):
    presupuesto_anual: Dict[str, float] = Field(default_factory=dict)
    ano_en_curso: int = 2026
    minimo_priorizar_clp: float = 30_000_000.0
    minimo_categoria_opcional_clp: float = 30_000_000.0
    minimos_categoria_opcional_clp: Dict[str, float] = Field(default_factory=dict)
    historico_promedios: Dict[str, float] = Field(default_factory=dict)
    drivers_categoria: Dict[str, str] = Field(default_factory=dict)
    # Backward compatibility for legacy clients still sending MM.
    minimo_priorizar_mm: Optional[float] = None


class SettingsResponse(SettingsBase):
    id: int
    model_config = ConfigDict(from_attributes=True)
