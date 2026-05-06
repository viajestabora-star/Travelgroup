-- Migración: URL de factura PDF por línea de cotización (servicios_cotizacion)
-- Usada desde Cierre de Grupo para trazabilidad junto con pagos_proveedores.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'servicios_cotizacion'
      AND column_name = 'url_factura_pdf'
  ) THEN
    ALTER TABLE public.servicios_cotizacion ADD COLUMN url_factura_pdf TEXT;
  END IF;
END $$;
