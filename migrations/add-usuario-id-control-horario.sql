-- ============================================================================
-- Migración: Añadir usuario_id a control_horario (alinear con auth.uid())
-- Ejecutar si la tabla ya tiene user_email y necesitas usuario_id para RLS.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'control_horario' AND column_name = 'usuario_id'
  ) THEN
    ALTER TABLE control_horario ADD COLUMN usuario_id UUID NULL;
    CREATE INDEX IF NOT EXISTS idx_control_horario_usuario_id ON control_horario(usuario_id);
  END IF;
END $$;
