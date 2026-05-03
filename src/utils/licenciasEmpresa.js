/**
 * Cupo de licencias según empresas.licencias_max y conteo en public.profiles.
 */
export async function obtenerResumenLicenciasEmpresa(supabase, empresaId) {
  const id = Number(empresaId)
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, error: 'empresa_id inválido.', resumen: null }
  }

  const [empRes, countRes] = await Promise.all([
    supabase.from('empresas').select('licencias_max').eq('id', id).maybeSingle(),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('empresa_id', id),
  ])

  if (empRes.error) {
    return { ok: false, error: empRes.error.message || 'No se pudo leer el cupo de la empresa.', resumen: null }
  }
  if (countRes.error) {
    return { ok: false, error: countRes.error.message || 'No se pudo contar usuarios.', resumen: null }
  }

  const maxRaw = Number(empRes.data?.licencias_max)
  const max = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 0
  const usados = Number(countRes.count) || 0
  const disponibles = Math.max(0, max - usados)

  return {
    ok: true,
    error: null,
    resumen: {
      empresa_id: id,
      usados,
      max,
      disponibles,
    },
  }
}
