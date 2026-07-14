-- ============================================================
-- GRUPO A — servicios_cotizacion.url_factura_pdf
-- Metadatos (numero_factura/fecha/importe) SOLO si existe un pago cuya
-- URL normalizada coincide exactamente con la del servicio. Si no hay
-- coincidencia real, la factura se migra igualmente pero con metadatos NULL
-- (nunca se copian datos de un pago sin relación documental confirmada).
-- ============================================================
WITH origen_a AS (
  SELECT
    sc.id AS servicio_id,
    sc.empresa_id,
    sc.id_expediente AS expediente_id,
    CASE
      WHEN sc.url_factura_pdf ~ '/object/public/facturas_proveedores/' THEN 'facturas_proveedores'
      WHEN sc.url_factura_pdf ~ '/object/public/facturas/'             THEN 'facturas'
      WHEN sc.url_factura_pdf ~ '^fac-[0-9]+\.pdf$'                    THEN 'facturas_proveedores'
      ELSE NULL
    END AS bucket_calc,
    NULLIF(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(btrim(sc.url_factura_pdf), '^[''"]+', ''),
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
  FROM public.servicios_cotizacion sc
  WHERE sc.url_factura_pdf IS NOT NULL
),
origen_a_valido AS (
  SELECT * FROM origen_a WHERE bucket_calc IS NOT NULL AND storage_path_calc IS NOT NULL
),
metadata_a AS (
  SELECT
    oa.servicio_id,
    pago.numero_factura,
    pago.fecha_pago,
    pago.importe_pagado
  FROM origen_a_valido oa
  LEFT JOIN LATERAL (
    SELECT pp.numero_factura, pp.fecha_pago, pp.importe_pagado
    FROM public.pagos_proveedores pp
    WHERE pp.servicio_id = oa.servicio_id
      AND pp.url_pdf IS NOT NULL
      AND CASE
            WHEN pp.url_pdf ~ '/object/public/facturas_proveedores/' THEN 'facturas_proveedores'
            WHEN pp.url_pdf ~ '/object/public/facturas/'             THEN 'facturas'
            WHEN pp.url_pdf ~ '^fac-[0-9]+\.pdf$'                    THEN 'facturas_proveedores'
            ELSE NULL
          END = oa.bucket_calc
      AND NULLIF(
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
          ) = oa.storage_path_calc
    ORDER BY pp.fecha_pago DESC NULLS LAST, pp.id DESC
    LIMIT 1
  ) pago ON true
),
insertados_a AS (
  INSERT INTO public.facturas_servicio
    (empresa_id, expediente_id, servicio_id, bucket, storage_path, numero_factura, fecha_factura, importe_factura)
  SELECT
    oa.empresa_id, oa.expediente_id, oa.servicio_id, oa.bucket_calc, oa.storage_path_calc,
    ma.numero_factura, ma.fecha_pago, ma.importe_pagado
  FROM origen_a_valido oa
  JOIN metadata_a ma ON ma.servicio_id = oa.servicio_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.facturas_servicio fs
    WHERE fs.servicio_id = oa.servicio_id
      AND fs.bucket = oa.bucket_calc
      AND fs.storage_path = oa.storage_path_calc
  )
  RETURNING id
)
SELECT count(*) AS filas_insertadas_grupo_a FROM insertados_a;

-- ============================================================
-- GRUPO B — pagos_proveedores con servicio_id, no cubiertos por Grupo A
-- Deduplicación del ORIGEN antes de insertar: si dos pagos del mismo
-- servicio comparten (bucket, storage_path), se queda solo uno
-- (fecha_pago más reciente > created_at más reciente > id como desempate).
-- ============================================================
WITH origen_b AS (
  SELECT
    pp.id,
    pp.empresa_id,
    pp.expediente_id,
    pp.servicio_id,
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
  WHERE pp.servicio_id IS NOT NULL
    AND pp.url_pdf IS NOT NULL
),
origen_b_valido AS (
  SELECT * FROM origen_b WHERE bucket_calc IS NOT NULL AND storage_path_calc IS NOT NULL
),
origen_b_dedup AS (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY servicio_id, bucket_calc, storage_path_calc
      ORDER BY fecha_pago DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM origen_b_valido
),
insertados_b AS (
  INSERT INTO public.facturas_servicio
    (empresa_id, expediente_id, servicio_id, bucket, storage_path, numero_factura, fecha_factura, importe_factura)
  SELECT
    ob.empresa_id, ob.expediente_id, ob.servicio_id, ob.bucket_calc, ob.storage_path_calc,
    ob.numero_factura, ob.fecha_pago, ob.importe_pagado
  FROM origen_b_dedup ob
  WHERE ob.rn = 1
    AND NOT EXISTS (
      SELECT 1 FROM public.facturas_servicio fs
      WHERE fs.servicio_id = ob.servicio_id
        AND fs.bucket = ob.bucket_calc
        AND fs.storage_path = ob.storage_path_calc
    )
  RETURNING id
)
SELECT count(*) AS filas_insertadas_grupo_b FROM insertados_b;

-- Filas excluidas por formato de URL no reconocido (revisión manual)
SELECT sc.id AS servicio_id, sc.url_factura_pdf
FROM public.servicios_cotizacion sc
WHERE sc.url_factura_pdf IS NOT NULL
  AND CASE
        WHEN sc.url_factura_pdf ~ '/object/public/facturas_proveedores/' THEN 'facturas_proveedores'
        WHEN sc.url_factura_pdf ~ '/object/public/facturas/'             THEN 'facturas'
        WHEN sc.url_factura_pdf ~ '^fac-[0-9]+\.pdf$'                    THEN 'facturas_proveedores'
        ELSE NULL
      END IS NULL;

SELECT pp.id AS pago_id, pp.url_pdf
FROM public.pagos_proveedores pp
WHERE pp.servicio_id IS NOT NULL
  AND pp.url_pdf IS NOT NULL
  AND CASE
        WHEN pp.url_pdf ~ '/object/public/facturas_proveedores/' THEN 'facturas_proveedores'
        WHEN pp.url_pdf ~ '/object/public/facturas/'             THEN 'facturas'
        WHEN pp.url_pdf ~ '^fac-[0-9]+\.pdf$'                    THEN 'facturas_proveedores'
        ELSE NULL
      END IS NULL;
