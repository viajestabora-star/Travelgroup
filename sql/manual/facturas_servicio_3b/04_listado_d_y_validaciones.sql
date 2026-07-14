-- GRUPO D — solo listado, nunca se inserta
SELECT pp.id, pp.expediente_id, pp.proveedor_nombre, pp.concepto, pp.url_pdf, pp.importe_pagado
FROM public.pagos_proveedores pp
WHERE pp.servicio_id IS NULL AND pp.servicio_cotizacion_id IS NULL;

-- VALIDACIONES OBLIGATORIAS
SELECT count(*) AS total_filas_migradas FROM public.facturas_servicio;

SELECT servicio_id, bucket, storage_path, count(*) c
FROM public.facturas_servicio
GROUP BY servicio_id, bucket, storage_path
HAVING count(*) > 1; -- debe devolver 0 filas

SELECT fs.id FROM public.facturas_servicio fs
LEFT JOIN public.servicios_cotizacion sc ON sc.id = fs.servicio_id
WHERE sc.id IS NULL; -- debe devolver 0 filas

SELECT fs.id FROM public.facturas_servicio fs
JOIN public.servicios_cotizacion sc ON sc.id = fs.servicio_id
WHERE sc.id_expediente <> fs.expediente_id; -- debe devolver 0 filas
