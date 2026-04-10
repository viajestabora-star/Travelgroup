-- Facturas de estructura mensual (Historial de Cierres): concepto, proveedor, PDF por mes/año.
-- Las filas legacy de gastos_fijos siguen con mes / anio NULL.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gastos_fijos' AND column_name = 'proveedor'
  ) THEN
    ALTER TABLE gastos_fijos ADD COLUMN proveedor TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gastos_fijos' AND column_name = 'url_pdf'
  ) THEN
    ALTER TABLE gastos_fijos ADD COLUMN url_pdf TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gastos_fijos' AND column_name = 'mes'
  ) THEN
    ALTER TABLE gastos_fijos ADD COLUMN mes INTEGER CHECK (mes IS NULL OR (mes >= 1 AND mes <= 12));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gastos_fijos' AND column_name = 'anio'
  ) THEN
    ALTER TABLE gastos_fijos ADD COLUMN anio INTEGER;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gastos_fijos_anio_mes ON gastos_fijos (anio, mes) WHERE mes IS NOT NULL;

COMMENT ON COLUMN gastos_fijos.proveedor IS 'Proveedor (facturas estructura mensual en Historial de Cierres).';
COMMENT ON COLUMN gastos_fijos.url_pdf IS 'Ruta u objeto en bucket facturas_proveedores (mismo patrón que pagos a proveedores).';
COMMENT ON COLUMN gastos_fijos.mes IS '1–12 si es factura de estructura mensual; NULL = fila legacy de gasto fijo.';
COMMENT ON COLUMN gastos_fijos.anio IS 'Año ejercicio si es factura de estructura mensual.';
