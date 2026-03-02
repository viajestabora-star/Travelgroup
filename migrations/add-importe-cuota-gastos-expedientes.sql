-- ============================================================================
-- Migración: Añadir columnas importe, cuota_iva, gastos_reales a expedientes
-- Para Inteligencia Económica: Beneficio Bruto, IVA, Beneficio Neto
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expedientes' AND column_name = 'importe') THEN
    ALTER TABLE expedientes ADD COLUMN importe NUMERIC DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expedientes' AND column_name = 'cuota_iva') THEN
    ALTER TABLE expedientes ADD COLUMN cuota_iva NUMERIC DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expedientes' AND column_name = 'gastos_reales') THEN
    ALTER TABLE expedientes ADD COLUMN gastos_reales NUMERIC DEFAULT NULL;
  END IF;
END $$;
