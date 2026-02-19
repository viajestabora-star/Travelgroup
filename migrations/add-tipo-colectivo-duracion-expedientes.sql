-- Migración: Añadir tipo_colectivo y duracion_viaje a expedientes
-- tipo_colectivo: Jubilados | Amas de Casa | Otros
-- duracion_viaje: Día completo | Finde | Gran viaje
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expedientes' AND column_name = 'tipo_colectivo'
  ) THEN
    ALTER TABLE expedientes ADD COLUMN tipo_colectivo TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expedientes' AND column_name = 'duracion_viaje'
  ) THEN
    ALTER TABLE expedientes ADD COLUMN duracion_viaje TEXT;
  END IF;
END $$;
