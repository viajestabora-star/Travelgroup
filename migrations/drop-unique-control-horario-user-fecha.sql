-- ============================================================================
-- Migración: Eliminar constraint único (user_email, fecha) en control_horario
-- Permite múltiples sesiones por usuario por día (entrada única por pestaña)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'control_horario_user_email_fecha_key'
  ) THEN
    ALTER TABLE control_horario
    DROP CONSTRAINT control_horario_user_email_fecha_key;
  END IF;
END $$;
