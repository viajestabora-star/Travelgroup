-- SOLO LECTURA. No contiene ningún INSERT.
SELECT
  count(*) AS total_grupo_c,
  count(*) FILTER (WHERE sc.id IS NULL) AS huerfanos_sin_servicio_valido
FROM public.pagos_proveedores pp
LEFT JOIN public.servicios_cotizacion sc ON sc.id = pp.servicio_cotizacion_id
WHERE pp.servicio_id IS NULL
  AND pp.servicio_cotizacion_id IS NOT NULL;
