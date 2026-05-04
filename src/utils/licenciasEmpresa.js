/**
 * Cupo de licencias por tenant (Blueprint Tabora).
 *
 * - Contratadas: columna empresas.max_usuarios (fuente de verdad). Si es nula o inválida, se usa 1.
 * - Usadas: COUNT(*) en public.profiles WHERE empresa_id = <tenant autenticado>.
 * - Disponibles: GREATEST(0, Contratadas - Usadas).
 *
 * Aislamiento multitenant: el empresa_id efectivo se obtiene únicamente desde
 * public.profiles del usuario autenticado (auth.uid). Cualquier empresa_id
 * pasado desde la UI debe coincidir exactamente con ese valor; en caso
 * contrario se rechaza la operación para no mezclar datos entre tenants.
 */
import { obtenerEmpresaIdTenantDesdePerfil } from './tenantEmpresa'

/** Si el conteo de perfiles falla (RLS, red, etc.), no tumbar toda la UI: cupo leído, uso 0 hasta poder contar. */
const resumenLicenciasDegradado = (empresaIdEfectivo, contratadas, mensajeConteo) => ({
  empresa_id: empresaIdEfectivo,
  contratadas,
  usados: 0,
  disponibles: contratadas,
  _contadorDegradado: true,
  _detalleConteo: mensajeConteo || null,
})

/**
 * Límite contractual de usuarios desde la fila empresas (max_usuarios en Supabase).
 * null / no numérico / ≤ 0 → 1 (empresas con cupo explícito, p. ej. Tabora con 999, leen su valor).
 *
 * @param {{ max_usuarios?: number | null }} row
 * @returns {number}
 */
export function limiteUsuariosDesdeEmpresaRow(row) {
  const raw = row?.max_usuarios
  if (raw == null) return 1
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 1
}

/**
 * @typedef {Object} ResumenLicenciasTenant
 * @property {number} empresa_id
 * @property {number} contratadas   valor efectivo empresas.max_usuarios (mínimo 1)
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
      .select('max_usuarios')
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

  const row = empRes.data
  if (!row) {
    return {
      ok: false,
      error: 'No existe registro de empresa para tu perfil autenticado.',
      resumen: null,
    }
  }

  const contratadas = limiteUsuariosDesdeEmpresaRow(row)

  if (countRes.error) {
    return {
      ok: true,
      error: null,
      resumen: resumenLicenciasDegradado(empresaIdEfectivo, contratadas, countRes.error.message),
    }
  }

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
