-- Ejecutar SOLO si 02_auditoria_c.sql dio huerfanos_sin_servicio_valido = 0
WITH origen_c AS (
  SELECT
    pp.id,
    pp.empresa_id,
    pp.expediente_id,
    pp.servicio_cotizacion_id AS servicio_id,
    pp.numero_factura,
    pp.fecha_pago,
    pp.importe_pagado,
    pp.created_at,
    CASE
      WHEN pp.url_pdf ~ '/object/public/facturas_proveedores/' THEN 'facturas_proveedores'
      WHEN pp.url_pdf ~ '/object/public/facturas/'             THEN 'facturas'
      WHEN pp.url_pdf ~ '^fac-[0-9]+\.pdf$'                    THEN 'facturas_proveedores'
      ELSE NULL
    END AS bucket_calc,
    NULLIF(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(btrim(pp.url_pdf), '^[''"]+', ''),
                '[''"]+$', ''
              ),
              '^.*/object/public/facturas/facturas/', ''
            ),
            '^.*/object/public/facturas/', ''
          ),
          '^.*/object/public/facturas_proveedores/', ''
        ),
        '^/+', ''
      ),
      ''
    ) AS storage_path_calc
  FROM public.pagos_proveedores pp
  JOIN public.servicios_cotizacion sc ON sc.id = pp.servicio_cotizacion_id
  WHERE pp.servicio_id IS NULL
    AND pp.servicio_cotizacion_id IS NOT NULL
    AND pp.url_pdf IS NOT NULL
),
origen_c_valido AS (
  SELECT * FROM origen_c WHERE bucket_calc IS NOT NULL AND storage_path_calc IS NOT NULL
),
origen_c_dedup AS (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY servicio_id, bucket_calc, storage_path_calc
      ORDER BY fecha_pago DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM origen_c_valido
),
insertados_c AS (
  INSERT INTO public.facturas_servicio
    (empresa_id, expediente_id, servicio_id, bucket, storage_path, numero_factura, fecha_factura, importe_factura)
  SELECT
    oc.empresa_id, oc.expediente_id, oc.servicio_id, oc.bucket_calc, oc.storage_path_calc,
    oc.numero_factura, oc.fecha_pago, oc.importe_pagado
  FROM origen_c_dedup oc
  WHERE oc.rn = 1
    AND NOT EXISTS (
      SELECT 1 FROM public.facturas_servicio fs
      WHERE fs.servicio_id = oc.servicio_id
        AND fs.bucket = oc.bucket_calc
        AND fs.storage_path = oc.storage_path_calc
    )
  RETURNING id
)
SELECT count(*) AS filas_insertadas_grupo_c FROM insertados_c;
