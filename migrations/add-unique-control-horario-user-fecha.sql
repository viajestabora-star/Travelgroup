-- ============================================================================
-- Migración: Constraint único (user_email, fecha) para upsert en control_horario
-- Requerido para Layout.jsx upsert sin conflictos en refrescos rápidos
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'control_horario_user_email_fecha_key'
  ) THEN
    ALTER TABLE control_horario
    ADD CONSTRAINT control_horario_user_email_fecha_key
    UNIQUE (user_email, fecha);
  END IF;
END $$;
