-- Plantilla de gastos recurrentes + tabla operativa de estructura mensual (gastos_estructura).
-- Tras aplicar, la app prioriza `gastos_estructura` y hace fallback a `gastos_fijos` si la nueva tabla no existe.

CREATE TABLE IF NOT EXISTS gastos_plantilla (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concepto TEXT NOT NULL,
  proveedor TEXT,
  periodicidad TEXT NOT NULL DEFAULT 'mensual',
  importe_sugerido NUMERIC DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gastos_plantilla_periodicidad ON gastos_plantilla (periodicidad) WHERE activo = true;

ALTER TABLE gastos_plantilla ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gastos_plantilla_all" ON gastos_plantilla;
CREATE POLICY "gastos_plantilla_all" ON gastos_plantilla FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS gastos_estructura (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concepto TEXT NOT NULL,
  proveedor TEXT,
  importe NUMERIC,
  importe_iva NUMERIC NOT NULL DEFAULT 0,
  url_pdf TEXT,
  mes INTEGER CHECK (mes IS NULL OR (mes >= 1 AND mes <= 12)),
  anio INTEGER,
  fecha_factura DATE,
  activo BOOLEAN DEFAULT true,
  periodicidad TEXT,
  es_extra BOOLEAN NOT NULL DEFAULT false,
  plantilla_id UUID REFERENCES gastos_plantilla (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gastos_estructura_anio_mes ON gastos_estructura (anio, mes) WHERE mes IS NOT NULL;

ALTER TABLE gastos_estructura ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gastos_estructura_all" ON gastos_estructura;
CREATE POLICY "gastos_estructura_all" ON gastos_estructura FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE gastos_plantilla IS 'Conceptos recurrentes (p. ej. mensual); usado por «Generar gastos mensuales» en Cierres Económicos.';
COMMENT ON TABLE gastos_estructura IS 'Facturas y partidas de gasto de estructura por ejercicio/mes; sustituye en app la lectura mensual de gastos_fijos cuando existe.';
COMMENT ON COLUMN gastos_estructura.es_extra IS 'true = creado manualmente como gasto extra (no generado desde plantilla).';
COMMENT ON COLUMN gastos_estructura.plantilla_id IS 'Referencia a gastos_plantilla si la fila proviene de generación automática.';

-- Copia única desde gastos_fijos (filas mensuales ya existentes).
INSERT INTO gastos_estructura (
  id, concepto, proveedor, importe, importe_iva, url_pdf, mes, anio, fecha_factura, activo, periodicidad, es_extra, plantilla_id
)
SELECT
  gf.id,
  gf.concepto,
  COALESCE(gf.proveedor, ''),
  gf.importe,
  COALESCE(gf.importe_iva, 0),
  gf.url_pdf,
  gf.mes,
  gf.anio,
  gf.fecha_factura,
  COALESCE(gf.activo, true),
  COALESCE(gf.periodicidad, 'mensual'),
  false,
  NULL
FROM gastos_fijos gf
WHERE gf.mes IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM gastos_estructura ge WHERE ge.id = gf.id);

-- Ejemplos opcionales (solo si no existen ya filas similares).
INSERT INTO gastos_plantilla (concepto, proveedor, periodicidad, activo)
SELECT 'Seguro coche', NULL, 'mensual', true
WHERE NOT EXISTS (SELECT 1 FROM gastos_plantilla WHERE concepto ILIKE '%Seguro coche%');
