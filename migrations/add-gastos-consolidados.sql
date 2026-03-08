-- ============================================================================
-- Migración: Tabla gastos_consolidados para análisis financiero
-- Se alimenta al cambiar estado a Finalizado/Cerrado (consolidación de costes).
-- proveedor_id NOT NULL: validación previa obligatoria antes de INSERT.
-- ============================================================================

CREATE TABLE IF NOT EXISTS gastos_consolidados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id UUID NOT NULL REFERENCES expedientes(id) ON DELETE CASCADE,
  proveedor_id BIGINT NOT NULL,
  tipo_servicio TEXT,
  coste_total NUMERIC NOT NULL DEFAULT 0,
  año_ejercicio INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gastos_consolidados_expediente ON gastos_consolidados(expediente_id);
CREATE INDEX IF NOT EXISTS idx_gastos_consolidados_proveedor ON gastos_consolidados(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_gastos_consolidados_año ON gastos_consolidados(año_ejercicio);

COMMENT ON TABLE gastos_consolidados IS 'Costes consolidados por expediente para análisis financiero. Se rellena al cerrar/finalizar.';
