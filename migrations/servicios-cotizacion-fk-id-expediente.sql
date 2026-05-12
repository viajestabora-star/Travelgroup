-- Integridad: servicios_cotizacion.id_expediente → expedientes.id
-- Ejecutar en Supabase SQL Editor (o aplicar como migración) cuando no haya datos huérfanos críticos.
-- Orden: limpiar → NOT NULL → FK ON DELETE CASCADE

-- 1) Eliminar filas sin expediente válido (huérfanas o id inexistente)
DELETE FROM public.servicios_cotizacion sc
WHERE sc.id_expediente IS NULL
   OR NOT EXISTS (SELECT 1 FROM public.expedientes e WHERE e.id = sc.id_expediente);

-- 2) Obligar valor no nulo
ALTER TABLE public.servicios_cotizacion
  ALTER COLUMN id_expediente SET NOT NULL;

-- 3) Clave foránea (idempotente por nombre)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'servicios_cotizacion'
      AND c.conname = 'fk_servicios_cotizacion_expediente'
  ) THEN
    ALTER TABLE public.servicios_cotizacion
      ADD CONSTRAINT fk_servicios_cotizacion_expediente
      FOREIGN KEY (id_expediente)
      REFERENCES public.expedientes (id)
      ON DELETE CASCADE;
  END IF;
END $$;
