/** empresa_id numérico desde claims JWT (evita depender solo de `profiles` si RLS falla o recurre). */
export function empresaIdDesdeJwtUsuario(authUser) {
  const n = Number(authUser?.app_metadata?.empresa_id ?? authUser?.user_metadata?.empresa_id ?? 0)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null
}

/**
 * Resolución del tenant (empresa SaaS) del usuario autenticado.
 * Orden: JWT → `profiles` acotado por `id` + `empresa_id` (filtrado manual anti-RLS/recursión) → lectura legacy de `profiles` solo si no hay JWT.
 */
export async function obtenerEmpresaIdTenantDesdePerfil(supabase) {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getUser()
  if (sessionErr || !sessionData?.user?.id) {
    return { empresaId: null, error: sessionErr?.message || 'Sin sesión activa' }
  }
  const authUser = sessionData.user
  const uid = authUser.id
  const jwtEmpresa = empresaIdDesdeJwtUsuario(authUser)

  if (jwtEmpresa) {
    const { data: perfil, error: perfilErr } = await supabase
      .from('profiles')
      .select('empresa_id')
      .eq('id', uid)
      .eq('empresa_id', jwtEmpresa)
      .maybeSingle()

    if (!perfilErr && perfil?.empresa_id != null) {
      const id = Number(perfil.empresa_id)
      if (Number.isFinite(id) && id > 0 && id === jwtEmpresa) {
        return { empresaId: id, error: null }
      }
    }
    // Coherencia con JWT: no bloquear licencias ni flujos si `profiles` falla o está desalineado.
    return { empresaId: jwtEmpresa, error: null }
  }

  const { data: perfil, error: perfilErr } = await supabase
    .from('profiles')
    .select('empresa_id')
    .eq('id', uid)
    .maybeSingle()

  if (perfilErr) {
    return { empresaId: null, error: perfilErr.message || 'No se pudo leer el perfil de usuario.' }
  }
  const id = Number(perfil?.empresa_id)
  if (!Number.isFinite(id) || id <= 0) {
    return {
      empresaId: null,
      error: 'Tu perfil no tiene una agencia asignada. No se puede continuar.',
    }
  }
  return { empresaId: id, error: null }
}

/**
 * empresa_id del usuario ya hidratado en sesión (App / LoginPortal) o fallback del contexto.
 * No sustituye la lectura de profiles para operaciones de escritura críticas del tenant.
 */
export function empresaIdSesionValido(user, empresaIdContext = null) {
  const n = Number(user?.empresa_id ?? empresaIdContext)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}
