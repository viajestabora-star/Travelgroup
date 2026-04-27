/**
 * Comprueba si un correo ya tiene cuenta en Supabase Auth vía RPC pública
 * `portal_estado_primer_acceso` (auth.users).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} rawEmail
 * @returns {Promise<{ ok: true, tieneAuth: boolean } | { ok: false, error: string }>}
 */
export async function portalConsultarTieneAuth(supabase, rawEmail) {
  const em = String(rawEmail || '').trim().toLowerCase()
  if (!em || !em.includes('@')) return { ok: true, tieneAuth: false }

  const { data, error } = await supabase.rpc('portal_estado_primer_acceso', { p_email: em })
  if (error) {
    return { ok: false, error: error.message || 'No se pudo comprobar el correo en Auth.' }
  }
  const tieneAuth = data?.tiene_auth === true
  return { ok: true, tieneAuth }
}
