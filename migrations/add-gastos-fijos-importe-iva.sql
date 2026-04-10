-- Importe de IVA desglosado para gastos mensuales (Historial de Cierres).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gastos_fijos' AND column_name = 'importe_iva'
  ) THEN
    ALTER TABLE gastos_fijos ADD COLUMN importe_iva NUMERIC NOT NULL DEFAULT 0;
  END IF;
END $$;

COMMENT ON COLUMN gastos_fijos.importe_iva IS 'Cuota de IVA de la factura (gastos mensuales / estructura).';
