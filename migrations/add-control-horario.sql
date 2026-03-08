-- ============================================================================
-- Migración: Tabla control_horario para registro de entrada/salida de personal
-- Usado por el Control Horario de Marisa (TimeTrackerModal).
-- ============================================================================

CREATE TABLE IF NOT EXISTS control_horario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  hora_entrada TIMESTAMPTZ NOT NULL DEFAULT now(),
  hora_salida TIMESTAMPTZ,
  duracion_minutos INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_control_horario_user_fecha ON control_horario(user_email, fecha);

COMMENT ON TABLE control_horario IS 'Registro de entrada/salida para control horario de personal (ej. Marisa).';

-- Trigger: calcular duracion_minutos al actualizar hora_salida
CREATE OR REPLACE FUNCTION control_horario_calcular_duracion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.hora_salida IS NOT NULL AND NEW.hora_entrada IS NOT NULL THEN
    NEW.duracion_minutos := ROUND(EXTRACT(EPOCH FROM (NEW.hora_salida - NEW.hora_entrada)) / 60)::INTEGER;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_control_horario_duracion ON control_horario;
CREATE TRIGGER trg_control_horario_duracion
  BEFORE UPDATE ON control_horario
  FOR EACH ROW
  WHEN (NEW.hora_salida IS DISTINCT FROM OLD.hora_salida)
  EXECUTE PROCEDURE control_horario_calcular_duracion();
