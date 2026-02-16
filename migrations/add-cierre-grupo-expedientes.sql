-- ============================================================================
-- Migración: Añadir columna cierre_grupo a expedientes
-- ============================================================================
-- Ejecutar en Supabase SQL Editor para habilitar el guardado del Cierre de Grupo.
-- Almacena: ingresos, costesReales, gastosImprevistos y resumen fiscal.
-- NO afecta a la cotización original (servicios_cotizacion).
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expedientes' AND column_name = 'cierre_grupo'
  ) THEN
    ALTER TABLE expedientes ADD COLUMN cierre_grupo JSONB DEFAULT NULL;
  END IF;
END $$;
