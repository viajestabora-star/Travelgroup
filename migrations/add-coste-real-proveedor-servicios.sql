-- Migración: Añadir coste_real_proveedor a servicios_cotizacion
-- Coste real pagado al proveedor (factura proveedor)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'servicios_cotizacion' AND column_name = 'coste_real_proveedor'
  ) THEN
    ALTER TABLE servicios_cotizacion ADD COLUMN coste_real_proveedor NUMERIC;
  END IF;
END $$;
