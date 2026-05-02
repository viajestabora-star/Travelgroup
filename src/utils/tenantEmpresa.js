/**
 * Resolución estricta del tenant (empresa SaaS) desde el perfil autenticado.
 * No usar datos de clientes ni empresa_id arbitrario del cliente.
 */
export async function obtenerEmpresaIdTenantDesdePerfil(supabase) {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getUser()
  if (sessionErr || !sessionData?.user?.id) {
    return { empresaId: null, error: sessionErr?.message || 'Sin sesión activa' }
  }
  const { data: perfil, error: perfilErr } = await supabase
    .from('profiles')
    .select('empresa_id')
    .eq('id', sessionData.user.id)
    .maybeSingle()

  if (perfilErr) {
    return { empresaId: null, error: perfilErr.message || 'No se pudo leer profiles' }
  }
  const id = Number(perfil?.empresa_id)
  if (!Number.isFinite(id) || id <= 0) {
    return {
      empresaId: null,
      error: 'Tu perfil (profiles) no tiene empresa_id válido. No se puede continuar.',
    }
  }
  return { empresaId: id, error: null }
}
