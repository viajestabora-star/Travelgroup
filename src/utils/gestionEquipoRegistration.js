import { normalizarNivelAccesoParaServidor } from './nivelAcceso'

export const MENSAJE_SIN_LICENCIAS =
  'No tienes licencias disponibles. Contacta con soporte para ampliar tu plan.'

/**
 * @param {{ message?: string }|null|undefined} fnError
 * @param {unknown} fnData cuerpo JSON devuelto por la Edge Function (a veces presente aunque haya error)
 */
export function esErrorLimiteLicencias(fnError, fnData) {
  const blob = [
    fnError?.message,
    typeof fnData === 'string' ? fnData : JSON.stringify(fnData ?? {}),
  ]
    .filter(Boolean)
    .join(' ')
  return /LIMITE_USUARIOS_ALCANZADO/i.test(blob)
}

/**
 * 1) Comprueba licencias vía RPC `licencias_equipo_resumen`.
 * 2) Invoca Edge Function `invite-team-member` (empresa_id solo en servidor, desde JWT del admin).
 *
 * @param {*} supabase cliente `@supabase/supabase-js`
 * @param {{ email: string; password: string; nivel_acceso: string }} params
 */
export async function verificarLicenciasYRegistrarMiembro(supabase, { email, password, nivel_acceso }) {
  const nivel = normalizarNivelAccesoParaServidor(nivel_acceso)
  if (!nivel) {
    return { ok: false, code: 'ROL_INVALIDO', message: 'Selecciona un rol válido (ADMIN, STAFF o GESTORIA).' }
  }

  const em = String(email).trim().toLowerCase()
  if (!em || !em.includes('@')) {
    return { ok: false, code: 'EMAIL', message: 'Introduce un correo válido.' }
  }
  if (!password || String(password).length < 6) {
    return { ok: false, code: 'PASSWORD', message: 'La contraseña debe tener al menos 6 caracteres.' }
  }

  const { data: resumen, error: errResumen } = await supabase.rpc('licencias_equipo_resumen')
  if (errResumen) {
    return { ok: false, code: 'RPC_LICENCIAS', message: errResumen.message }
  }

  if (resumen?.error === 'sin_perfil') {
    return {
      ok: false,
      code: 'SIN_PERFIL',
      message:
        'Tu usuario no tiene perfil en Supabase para esta empresa. Ejecuta la migración de equipo o contacta con soporte.',
    }
  }

  const disponibles = Number(resumen?.disponibles ?? 0)
  if (!Number.isFinite(disponibles) || disponibles <= 0) {
    return { ok: false, code: 'SIN_LICENCIAS', message: MENSAJE_SIN_LICENCIAS }
  }

  const { data: fnData, error: fnError } = await supabase.functions.invoke('invite-team-member', {
    body: { email: em, password, nivel_acceso: nivel },
  })

  if (fnError) {
    if (esErrorLimiteLicencias(fnError, fnData)) {
      return { ok: false, code: 'LIMITE', message: MENSAJE_SIN_LICENCIAS }
    }
    const hint =
      /Edge Function|FunctionsHttpError|Failed to fetch|non-2xx/i.test(String(fnError.message))
        ? ' Comprueba que la función invite-team-member esté desplegada en tu proyecto Supabase.'
        : ''
    return { ok: false, code: 'INVITE', message: (fnError.message || 'Error al invitar.') + hint }
  }

  if (fnData && typeof fnData === 'object' && fnData.error === 'LIMITE_USUARIOS_ALCANZADO') {
    return { ok: false, code: 'LIMITE', message: MENSAJE_SIN_LICENCIAS }
  }
  if (fnData && typeof fnData === 'object' && fnData.ok === false) {
    if (fnData.error === 'LIMITE_USUARIOS_ALCANZADO') {
      return { ok: false, code: 'LIMITE', message: MENSAJE_SIN_LICENCIAS }
    }
    return { ok: false, code: 'INVITE_BODY', message: String(fnData.error || 'No se pudo crear el usuario.') }
  }

  return { ok: true, code: 'OK', message: 'Usuario creado correctamente.' }
}
