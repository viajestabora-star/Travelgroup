-- Opcional: garantía en BD contra duplicados de numero_expediente (dos altas simultáneas).
-- Ejecutar solo si no hay duplicados actuales:
--   SELECT numero_expediente, count(*) FROM expedientes WHERE numero_expediente IS NOT NULL GROUP BY 1 HAVING count(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_expedientes_numero_expediente
  ON public.expedientes (numero_expediente)
  WHERE numero_expediente IS NOT NULL AND trim(numero_expediente) <> '';
