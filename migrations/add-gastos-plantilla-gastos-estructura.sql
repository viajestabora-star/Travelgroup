-- Esquema alineado con la app (Cierres Económicos): solo columnas usadas en código.
-- `gastos_estructura.mes` es TEXT (p. ej. '1'..'12'); `anio` es INTEGER; importe en `importe_iva`.
-- `gastos_plantilla`: importe sugerido en `importe_base`.

CREATE TABLE IF NOT EXISTS gastos_plantilla (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor TEXT,
  periodicidad TEXT NOT NULL DEFAULT 'mensual',
  importe_base NUMERIC,
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
  proveedor TEXT,
  importe_iva NUMERIC,
  url_pdf TEXT,
  mes TEXT,
  anio INTEGER,
  es_extra BOOLEAN NOT NULL DEFAULT false,
  plantilla_id UUID REFERENCES gastos_plantilla (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gastos_estructura_anio_mes ON gastos_estructura (anio, mes);

ALTER TABLE gastos_estructura ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gastos_estructura_all" ON gastos_estructura;
CREATE POLICY "gastos_estructura_all" ON gastos_estructura FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE gastos_plantilla IS 'Plantilla de gastos (importe_base, periodicidad mensual o anual).';
COMMENT ON TABLE gastos_estructura IS 'Gastos de estructura por ejercicio; importe en importe_iva; mes en TEXT.';

-- Si la tabla se creó antes con columnas obsoletas, eliminarlas.
ALTER TABLE gastos_estructura DROP COLUMN IF EXISTS activo;
ALTER TABLE gastos_estructura DROP COLUMN IF EXISTS fecha_factura;
ALTER TABLE gastos_estructura DROP COLUMN IF EXISTS periodicidad;

-- Seguro coche (anual): solo se usa en lógica de noviembre en la app.
INSERT INTO gastos_plantilla (proveedor, periodicidad, importe_base, activo)
SELECT 'Seguro coche', 'anual', 0, true
WHERE NOT EXISTS (
  SELECT 1 FROM gastos_plantilla WHERE periodicidad = 'anual' AND proveedor ILIKE '%Seguro coche%'
);
