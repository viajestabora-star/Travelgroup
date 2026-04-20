/**
 * Perfiles de aplicación (sesión desde localStorage / login en App.jsx).
 * `nivel_acceso` es el campo alineado con la BD; `rol` se mantiene sincronizado vía nivelAcceso.js.
 */
import { normalizarNivelAccesoParaServidor } from './nivelAcceso'

/**
 * Nivel efectivo para comprobaciones en UI (acepta legado en minúsculas solo en memoria).
 * @returns {'ADMIN'|'STAFF'|'GESTORIA'|null}
 */
export const nivelAccesoEfectivo = (user) => {
  const norm = normalizarNivelAccesoParaServidor(user?.nivel_acceso ?? user?.rol)
  if (norm) return norm
  if (String(user?.email || '').toLowerCase() === 'alcor@asesores.com') return 'GESTORIA'
  return null
}

export const esUsuarioGestoria = (user) => nivelAccesoEfectivo(user) === 'GESTORIA'

export const esUsuarioAdmin = (user) => nivelAccesoEfectivo(user) === 'ADMIN'

/** Sidebar y ruta `/historial-cierres` (Cierres Económicos): solo ADMIN o GESTORIA. */
export const puedeAccederCierresEconomicos = (user) =>
  esUsuarioAdmin(user) || esUsuarioGestoria(user)
