-- ============================================================================
-- Migración: Columnas para persistir Cierre de Grupo en expedientes
-- El Dashboard suma estas 4 columnas donde estado = 'Cerrado'
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'expedientes' AND column_name = 'total_ingresos') THEN
    ALTER TABLE expedientes ADD COLUMN total_ingresos NUMERIC DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'expedientes' AND column_name = 'total_gastos_reales') THEN
    ALTER TABLE expedientes ADD COLUMN total_gastos_reales NUMERIC DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'expedientes' AND column_name = 'beneficio_neto_real') THEN
    ALTER TABLE expedientes ADD COLUMN beneficio_neto_real NUMERIC DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'expedientes' AND column_name = 'desglose_gastos_reales') THEN
    ALTER TABLE expedientes ADD COLUMN desglose_gastos_reales JSONB DEFAULT '[]';
  END IF;
END $$;

-- Rellenar expedientes ya cerrados desde cierre_grupo (ejecutar tras la migración si hay datos legacy)
-- UPDATE expedientes SET
--   total_ingresos = COALESCE((cierre_grupo->>'ingresos_totales')::numeric, (cierre_grupo->>'total_ingresos')::numeric, 0),
--   total_gastos_reales = COALESCE((cierre_grupo->>'gastos_totales')::numeric, (cierre_grupo->>'total_gastos')::numeric, 0),
--   cuota_iva = COALESCE((cierre_grupo->>'iva_pagado')::numeric, 0),
--   beneficio_neto_real = COALESCE((cierre_grupo->>'beneficio_limpio')::numeric, (cierre_grupo->>'beneficio')::numeric, 0)
-- WHERE (estado = 'Cerrado' OR estado ILIKE 'cerrado') AND cierre_grupo IS NOT NULL;
