-- ============================================================================
-- Migración: Añadir columna cantidad a servicios_cotizacion
-- ============================================================================
-- Ejecutar en Supabase SQL Editor si la columna cantidad no existe.
-- Permite persistir la cantidad manual del Guía (días).
-- ============================================================================

-- Añadir columna cantidad si no existe (PostgreSQL 9.5+)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'servicios_cotizacion' AND column_name = 'cantidad'
  ) THEN
    ALTER TABLE servicios_cotizacion ADD COLUMN cantidad INTEGER DEFAULT 1;
  END IF;
END $$;
