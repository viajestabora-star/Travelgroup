/**
 * Cupo de licencias por tenant (Blueprint Tabora).
 *
 * - Contratadas: columna empresas.limite_licencias (solo lectura en esta capa).
 * - Usadas: COUNT(*) en public.profiles WHERE empresa_id = <tenant autenticado>.
 * - Disponibles: GREATEST(0, Contratadas - Usadas).
 *
 * Aislamiento multitenant: el empresa_id efectivo se obtiene únicamente desde
 * public.profiles del usuario autenticado (auth.uid). Cualquier empresa_id
 * pasado desde la UI debe coincidir exactamente con ese valor; en caso
 * contrario se rechaza la operación para no mezclar datos entre tenants.
 */
import { obtenerEmpresaIdTenantDesdePerfil } from './tenantEmpresa'

/**
 * @typedef {Object} ResumenLicenciasTenant
 * @property {number} empresa_id
 * @property {number} contratadas   valor empresas.limite_licencias
 * @property {number} usados         perfiles con empresa_id = tenant
 * @property {number} disponibles    contratadas - usados (mínimo 0)
 */

/**
 * Resuelve el cupo contractual y el uso real para la empresa del perfil autenticado.
 *
 * @param {*} supabase
 * @param {number|null|undefined} empresaIdSolicitado  Si se informa, debe ser idéntico al profiles.empresa_id de la sesión.
 * @returns {Promise<{ ok: boolean, error: string|null, resumen: ResumenLicenciasTenant|null }>}
 */
export async function obtenerResumenLicenciasEmpresa(supabase, empresaIdSolicitado = null) {
  const { empresaId: tenantDesdePerfil, error: errTenant } = await obtenerEmpresaIdTenantDesdePerfil(supabase)

  if (errTenant || !tenantDesdePerfil) {
    return {
      ok: false,
      error: errTenant || 'No se pudo determinar la empresa del perfil autenticado.',
      resumen: null,
    }
  }

  const tenantId = Number(tenantDesdePerfil)
  const solicitado = empresaIdSolicitado == null || empresaIdSolicitado === '' ? null : Number(empresaIdSolicitado)

  if (solicitado != null && Number.isFinite(solicitado) && solicitado > 0 && solicitado !== tenantId) {
    return {
      ok: false,
      error:
        'El identificador de empresa solicitado no coincide con tu sesión. Operación bloqueada por aislamiento multitenant.',
      resumen: null,
    }
  }

  const empresaIdEfectivo = tenantId

  const [empRes, countRes] = await Promise.all([
    supabase
      .from('empresas')
      .select('limite_licencias, licencias_max')
      .eq('id', empresaIdEfectivo)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresaIdEfectivo),
  ])

  if (empRes.error) {
    return {
      ok: false,
      error: empRes.error.message || 'No se pudo leer el cupo contractual de la empresa.',
      resumen: null,
    }
  }
  if (countRes.error) {
    return {
      ok: false,
      error: countRes.error.message || 'No se pudo contar los usuarios del tenant.',
      resumen: null,
    }
  }

  const row = empRes.data
  if (!row) {
    return {
      ok: false,
      error: 'No existe registro de empresa para tu perfil autenticado.',
      resumen: null,
    }
  }

  const limiteCol = row.limite_licencias
  const legado = row.licencias_max
  const contratadasRaw =
    limiteCol != null && limiteCol !== ''
      ? Number(limiteCol)
      : Number(legado)
  const contratadas = Number.isFinite(contratadasRaw) && contratadasRaw > 0 ? contratadasRaw : 0

  const usados = Number(countRes.count) || 0
  const disponibles = Math.max(0, contratadas - usados)

  return {
    ok: true,
    error: null,
    resumen: {
      empresa_id: empresaIdEfectivo,
      contratadas,
      usados,
      disponibles,
    },
  }
}
