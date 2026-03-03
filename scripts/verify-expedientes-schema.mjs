#!/usr/bin/env node
/**
 * Verificación del esquema de expedientes.
 * Ejecuta: SELECT * FROM expedientes LIMIT 1
 * Uso: node scripts/verify-expedientes-schema.mjs
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL || 'https://gtwyqxfkpdwpakmgrkbu.supabase.co'
const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'

const supabase = createClient(url, key)

const { data, error } = await supabase
  .from('expedientes')
  .select('*')
  .limit(1)
  .maybeSingle()

if (error) {
  console.error('Error:', error.message)
  process.exit(1)
}

console.log('=== Esquema expedientes (columnas del primer registro) ===')
if (data) {
  const columnas = Object.keys(data).sort()
  console.log('Columnas:', columnas.join(', '))
  console.log('\n¿Tiene id (PK)?', 'id' in data ? 'SÍ' : 'NO')
  console.log('¿Tiene expediente_id?', 'expediente_id' in data ? 'SÍ (PROHIBIDO)' : 'NO (correcto)')
  console.log('¿total_ingresos?', 'total_ingresos' in data ? 'SÍ' : 'NO')
  console.log('¿total_gastos_reales?', 'total_gastos_reales' in data ? 'SÍ' : 'NO')
  console.log('¿beneficio_neto_real?', 'beneficio_neto_real' in data ? 'SÍ' : 'NO')
} else {
  console.log('No hay registros en expedientes (tabla vacía).')
}
