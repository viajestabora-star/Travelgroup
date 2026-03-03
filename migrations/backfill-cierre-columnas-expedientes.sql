-- ============================================================================
-- Backfill: Rellenar total_ingresos, total_gastos_reales, cuota_iva, beneficio_neto_real
-- desde cierre_grupo para expedientes ya cerrados (ejecutar tras add-columnas-cierre-expedientes.sql)
-- ============================================================================

UPDATE expedientes SET
  total_ingresos = COALESCE(
    (cierre_grupo->>'ingresos_totales')::numeric,
    (cierre_grupo->>'total_ingresos')::numeric,
    0
  ),
  total_gastos_reales = COALESCE(
    (cierre_grupo->>'gastos_totales')::numeric,
    (cierre_grupo->>'total_gastos')::numeric,
    0
  ),
  cuota_iva = COALESCE((cierre_grupo->>'iva_pagado')::numeric, 0),
  beneficio_neto_real = COALESCE(
    (cierre_grupo->>'beneficio_limpio')::numeric,
    (cierre_grupo->>'beneficio')::numeric,
    0
  )
WHERE (estado = 'Cerrado' OR estado ILIKE 'cerrado')
  AND cierre_grupo IS NOT NULL
  AND jsonb_typeof(cierre_grupo) = 'object';
