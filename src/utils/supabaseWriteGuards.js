export const isRlsError = (error) => {
  const msg = String(error?.message || '').toLowerCase()
  const details = String(error?.details || '').toLowerCase()
  return (
    error?.code === '42501' ||
    msg.includes('row-level security') ||
    msg.includes('rls') ||
    msg.includes('permission denied') ||
    details.includes('row-level security')
  )
}

export const ensureAuthenticatedSession = async (supabase) => {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) {
    return {
      ok: false,
      message: 'Sesión no válida. Inicia sesión de nuevo para guardar cambios.',
    }
  }
  return { ok: true }
}

export const buildWriteErrorMessage = ({ table, error, action = 'guardar' }) => {
  if (isRlsError(error)) {
    return `RLS bloqueó la operación en la tabla "${table}". Revisa permisos/políticas para este usuario autenticado.`
  }

  const detail = error?.message || error?.details || 'Error desconocido.'
  return `No se pudo ${action}. Detalle: ${detail}`
}
