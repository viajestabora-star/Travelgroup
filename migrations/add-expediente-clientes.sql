-- ============================================================================
-- Migración: Tabla expediente_clientes (multi-asociación)
-- ============================================================================
-- Relaciona expediente_id con cliente_id. Permite varios clientes por expediente.
-- El campo cliente_id en expedientes se mantiene para compatibilidad con expedientes antiguos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS expediente_clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id UUID NOT NULL REFERENCES expedientes(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  pax INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(expediente_id, cliente_id)
);

CREATE INDEX IF NOT EXISTS idx_expediente_clientes_expediente ON expediente_clientes(expediente_id);
CREATE INDEX IF NOT EXISTS idx_expediente_clientes_cliente ON expediente_clientes(cliente_id);

COMMENT ON TABLE expediente_clientes IS 'Relación N:M entre expedientes y clientes (asociaciones). pax opcional para anotar personas por asociación en el cierre.';
