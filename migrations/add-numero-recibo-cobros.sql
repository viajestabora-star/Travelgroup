-- ============================================================================
-- Migración: Añadir numero_recibo a cobros_expediente (RECIBOS INMUTABLES)
-- ============================================================================
-- Formato: REC-YYYY-000X (ej. REC-2026-0001)
-- El número se asigna automáticamente al registrar el cobro y no es editable.
-- Ejecutar en Supabase SQL Editor si la columna no existe.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cobros_expediente' AND column_name = 'numero_recibo'
  ) THEN
    ALTER TABLE cobros_expediente ADD COLUMN numero_recibo TEXT;
  END IF;
END $$;
