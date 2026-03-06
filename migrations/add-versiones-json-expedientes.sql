-- Migración: Añadir versiones_json a expedientes para Multicotización
-- Estructura: { versiones: [{ id, nombre, servicios: [...], confirmada }], versionConfirmadaId }
-- Solo la opción CONFIRMADA suma para beneficio_neto_real en Central de Inteligencia.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expedientes' AND column_name = 'versiones_json'
  ) THEN
    ALTER TABLE expedientes ADD COLUMN versiones_json JSONB DEFAULT NULL;
    COMMENT ON COLUMN expedientes.versiones_json IS 'Multicotización: versiones de presupuesto [{ id, nombre, servicios, confirmada }]. Solo la confirmada cuenta para beneficio_neto_real.';
  END IF;
END $$;
