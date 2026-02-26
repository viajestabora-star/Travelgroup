-- ============================================================================
-- Migración: Asegurar que cobros_expediente use 'importe' (no 'monto')
-- ============================================================================
-- Si la tabla tiene columna 'monto', renombrarla a 'importe'.
-- Si no existe 'importe', crearla.
-- Ejecutar en Supabase SQL Editor si hay error "column monto does not exist".
-- ============================================================================

DO $$
BEGIN
  -- Si existe monto y no existe importe: renombrar monto -> importe
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cobros_expediente' AND column_name = 'monto'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cobros_expediente' AND column_name = 'importe'
  ) THEN
    ALTER TABLE cobros_expediente RENAME COLUMN monto TO importe;
  END IF;

  -- Si no existe importe ni monto: crear importe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cobros_expediente' AND column_name = 'importe'
  ) THEN
    ALTER TABLE cobros_expediente ADD COLUMN importe NUMERIC;
  END IF;

  -- Asegurar que existe fecha
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cobros_expediente' AND column_name = 'fecha'
  ) THEN
    ALTER TABLE cobros_expediente ADD COLUMN fecha TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;
