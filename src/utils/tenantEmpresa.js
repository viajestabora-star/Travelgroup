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

  // Fallback sin JWT: siempre se filtra al menos por .eq('id', uid) — solo devuelve la propia fila.
  // Añadimos empresa_id desde localStorage como filtro extra si está disponible (determinismo máximo).
  let lsHint = 0
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('sesion_tabora') : null
    if (raw) lsHint = Number(JSON.parse(raw).empresa_id) || 0
  } catch (_) {}

  let q = supabase.from('profiles').select('empresa_id').eq('id', uid)
  if (lsHint > 0) q = q.eq('empresa_id', lsHint)
  const { data: perfil, error: perfilErr } = await q.maybeSingle()

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

/** Mensaje único para guardas de escritura sin tenant. */
export const MSJ_OPERACION_SIN_EMPRESA_ID = 'Fallo crítico: Intento de operación sin identidad de empresa'

/**
 * Guarda síncrona antes de insert/upload: exige empresa_id numérico válido.
 * @param {unknown} empresaId
 * @returns {number}
 */
export function assertEmpresaIdOperacion(empresaId) {
  const n = Number(empresaId)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(MSJ_OPERACION_SIN_EMPRESA_ID)
  }
  return n
}

/**
 * Fuente de verdad para escritura: sesión Supabase (JWT + coherencia con `profiles`).
 * No usar campos del formulario ni estado local del expediente como origen de empresa_id.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<number>}
 */
export async function resolverEmpresaIdDesdeSesionSupabase(supabase) {
  const { empresaId } = await obtenerEmpresaIdTenantDesdePerfil(supabase)
  const n = Number(empresaId)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(MSJ_OPERACION_SIN_EMPRESA_ID)
  }
  return n
}

/** Tabora (ID 1): fallback de emergencia si la sesión no trae `empresa_id` en metadatos. */
export const EMPRESA_ID_TABORA_EMERGENCIA = 1

/**
 * Integridad escritura Storage / expedientes: lee SOLO de la sesión Supabase activa
 * (`getSession` → `user.user_metadata.empresa_id`, luego `app_metadata.empresa_id`).
 * Nunca devuelve null ni ≤0: si falta o es inválido → {@link EMPRESA_ID_TABORA_EMERGENCIA}.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<number>}
 */
export async function resolverEmpresaIdEscrituraObligatorio(supabase) {
  try {
    const { data: bundle, error } = await supabase.auth.getSession()
    if (error || !bundle?.session?.user) {
      return EMPRESA_ID_TABORA_EMERGENCIA
    }
    const u = bundle.session.user
    const raw = u.user_metadata?.empresa_id ?? u.app_metadata?.empresa_id
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) {
      return Math.trunc(n)
    }
  } catch (_) {
    /* misma política que sesión ausente */
  }
  return EMPRESA_ID_TABORA_EMERGENCIA
}

/**
 * Misma regla que {@link resolverEmpresaIdEscrituraObligatorio} para UI síncrona (objeto `user` de la app).
 * Nunca null: mínimo {@link EMPRESA_ID_TABORA_EMERGENCIA}.
 */
export function empresaIdDesdeUserMetadataOUno(user) {
  const raw = user?.user_metadata?.empresa_id ?? user?.app_metadata?.empresa_id ?? user?.empresa_id
  const n = Number(raw)
  if (Number.isFinite(n) && n > 0) {
    return Math.trunc(n)
  }
  return EMPRESA_ID_TABORA_EMERGENCIA
}
