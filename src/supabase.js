import { createClient } from '@supabase/supabase-js'
import { applyTenantFilter } from './utils/tenantDb'

// Variables de producción: VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Vercel
// Fallback para desarrollo local sin .env
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://gtwyqxfkpdwpakmgrkbu.supabase.co'
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'

const _rawClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
  },
})

// Interceptor global: from('tabla_erp') devuelve un QueryBuilder proxificado
// que inyecta automáticamente .eq('empresa_id', tenantId) en todas las queries.
const _origFrom = _rawClient.from.bind(_rawClient)
_rawClient.from = (table) => applyTenantFilter(table, _origFrom(table))

export const supabase = _rawClient
