-- ============================================================================
-- Migración: desglose_gastos_reales en expedientes + tabla gastos_fijos
-- ============================================================================

-- Columna desglose_gastos_reales: array de { proveedor, concepto, precio_coste_real }
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expedientes' AND column_name = 'desglose_gastos_reales') THEN
    ALTER TABLE expedientes ADD COLUMN desglose_gastos_reales JSONB DEFAULT '[]';
  END IF;
END $$;

-- Tabla gastos_fijos: sueldos, alquileres, etc.
CREATE TABLE IF NOT EXISTS gastos_fijos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concepto TEXT NOT NULL,
  importe NUMERIC NOT NULL DEFAULT 0,
  periodicidad TEXT DEFAULT 'mensual',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS básico
ALTER TABLE gastos_fijos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gastos_fijos_all" ON gastos_fijos;
CREATE POLICY "gastos_fijos_all" ON gastos_fijos FOR ALL USING (true) WITH CHECK (true);
