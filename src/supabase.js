import { createClient } from '@supabase/supabase-js'
import { applyTenantFilter } from './utils/tenantDb'

/**
 * Cliente Supabase de la app (browser).
 *
 * - Usa SIEMPRE la clave anónima (VITE_SUPABASE_ANON_KEY), nunca service_role aquí.
 *   Con service_role, PostgREST no ejecuta RLS como el usuario y auth.uid() puede
 *   comportarse distinto o quedar nulo según el contexto; las inserciones operativas
 *   deben ir con la sesión del usuario autenticado.
 *
 * - Alta de usuarios (signUp): incluir empresa_id en `options.data` (user_metadata),
 *   p. ej. en Panel Master (`AdminMaster.jsx`) y registro de equipo (`gestionEquipoRegistration.js`).
 *   Las tablas operativas (clientes, proveedores, …) no deben enviar empresa_id en el
 *   INSERT: lo asigna el trigger `fn_set_empresa_id_global` según el perfil/JWT.
 */

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
