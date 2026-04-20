/**
 * ENUM en BD (roles_usuarios_nivel_acceso_check): solo mayúsculas.
 * No enviar minúsculas al servidor.
 */
export const NIVELES_ACCESO = Object.freeze(['ADMIN', 'STAFF', 'GESTORIA'])

const SET_NIVELES = new Set(NIVELES_ACCESO)

/**
 * @param {unknown} value
 * @returns {'ADMIN'|'STAFF'|'GESTORIA'|null}
 */
export function normalizarNivelAccesoParaServidor(value) {
  if (value == null || value === '') return null
  const u = String(value).trim().toUpperCase()
  return SET_NIVELES.has(u) ? u : null
}

/**
 * Alinea objeto de sesión: `nivel_acceso` y `rol` coherentes en mayúsculas (compat. con código que aún lee `rol`).
 * @param {Record<string, unknown>|null|undefined} partialUser
 */
export function sincronizarNivelAccesoEnSesion(partialUser) {
  if (!partialUser || typeof partialUser !== 'object') return partialUser
  const norm = normalizarNivelAccesoParaServidor(
    partialUser.nivel_acceso ?? partialUser.rol
  )
  if (!norm) return { ...partialUser }
  return { ...partialUser, nivel_acceso: norm, rol: norm }
}
