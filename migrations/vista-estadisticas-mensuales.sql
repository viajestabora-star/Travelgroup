-- ============================================================================
-- Migración: Vista vista_estadisticas_mensuales
-- ============================================================================
-- Agrega estadísticas financieras por mes para el Dashboard.
-- Columnas: mes, año, volumen_bruto, ingresos_reales, pendiente
-- Ejecutar en Supabase SQL Editor.
-- ============================================================================

CREATE OR REPLACE VIEW vista_estadisticas_mensuales AS
SELECT
  EXTRACT(MONTH FROM fecha_inicio)::int AS mes,
  EXTRACT(YEAR FROM fecha_inicio)::int AS año,
  COALESCE(SUM(COALESCE(presupuesto_total, 0)), 0)::numeric(14,2) AS volumen_bruto,
  COALESCE(SUM(COALESCE(total_cobrado, 0)), 0)::numeric(14,2) AS ingresos_reales,
  COALESCE(SUM(COALESCE(presupuesto_total, 0) - COALESCE(total_cobrado, 0)), 0)::numeric(14,2) AS pendiente
FROM expedientes
WHERE fecha_inicio IS NOT NULL
GROUP BY EXTRACT(YEAR FROM fecha_inicio), EXTRACT(MONTH FROM fecha_inicio)
ORDER BY año DESC, mes DESC;
