-- Idempotent CAPEX migration for Docker startup.

CREATE TABLE IF NOT EXISTS capex_configuracion (
  id SERIAL PRIMARY KEY,
  presupuesto_anual JSON,
  ano_en_curso INTEGER DEFAULT 2026,
  minimo_priorizar_clp DOUBLE PRECISION DEFAULT 30000000,
  minimo_categoria_opcional_clp DOUBLE PRECISION DEFAULT 30000000,
  minimos_categoria_opcional_clp JSON,
  historico_promedios JSON,
  drivers_categoria JSON
);

ALTER TABLE capex_configuracion ADD COLUMN IF NOT EXISTS presupuesto_anual JSON;
ALTER TABLE capex_configuracion ADD COLUMN IF NOT EXISTS ano_en_curso INTEGER DEFAULT 2026;
ALTER TABLE capex_configuracion ADD COLUMN IF NOT EXISTS minimo_priorizar_clp DOUBLE PRECISION DEFAULT 30000000;
ALTER TABLE capex_configuracion ADD COLUMN IF NOT EXISTS minimo_categoria_opcional_clp DOUBLE PRECISION DEFAULT 30000000;
ALTER TABLE capex_configuracion ADD COLUMN IF NOT EXISTS minimos_categoria_opcional_clp JSON;
ALTER TABLE capex_configuracion ADD COLUMN IF NOT EXISTS historico_promedios JSON;
ALTER TABLE capex_configuracion ADD COLUMN IF NOT EXISTS drivers_categoria JSON;

UPDATE capex_configuracion
SET minimo_priorizar_clp = 30000000
WHERE minimo_priorizar_clp IS NULL;

UPDATE capex_configuracion
SET minimo_categoria_opcional_clp = 30000000
WHERE minimo_categoria_opcional_clp IS NULL;

UPDATE capex_configuracion
SET minimos_categoria_opcional_clp =
  json_build_object('MEJORAS VIDA ÚTIL', 30000000, 'OTROS', 30000000, 'RENTABILIDAD', 30000000)::json
WHERE minimos_categoria_opcional_clp IS NULL;

UPDATE projects
SET categoria = 'Otros'
WHERE upper(trim(categoria)) IN (
  'OTROS (FORZAR AUTOS)',
  'OTROS(FORZAR AUTOS)',
  'OTROS(FORZARAUTOS)',
  'OTROS FORZAR AUTOS'
);
