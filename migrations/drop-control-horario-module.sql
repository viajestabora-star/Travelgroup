-- Eliminación del módulo Control Horario (tabla + función trigger si existían).
BEGIN;

DROP TABLE IF EXISTS public.control_horario CASCADE;
DROP FUNCTION IF EXISTS public.control_horario_calcular_duracion();

COMMIT;
