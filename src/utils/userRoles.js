/**
 * Perfiles de aplicación (sesión desde localStorage / login en App.jsx).
 */
export const esUsuarioGestoria = (user) =>
  user?.rol === 'GESTORIA' || String(user?.email || '').toLowerCase() === 'alcor@asesores.com'

export const esUsuarioAdmin = (user) => user?.rol === 'ADMIN'

/** Sidebar y ruta `/historial-cierres` (Cierres Económicos): solo ADMIN o GESTORIA. */
export const puedeAccederCierresEconomicos = (user) =>
  esUsuarioAdmin(user) || esUsuarioGestoria(user)
