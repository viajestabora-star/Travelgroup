-- Fecha de factura para gastos de estructura mensual (Historial de Cierres).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gastos_fijos' AND column_name = 'fecha_factura'
  ) THEN
    ALTER TABLE gastos_fijos ADD COLUMN fecha_factura DATE;
  END IF;
END $$;

COMMENT ON COLUMN gastos_fijos.fecha_factura IS 'Fecha de la factura (estructura mensual); debe alinearse con mes/anio del registro.';
