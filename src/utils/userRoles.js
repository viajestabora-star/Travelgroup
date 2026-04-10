/**
 * Perfiles de aplicación (sesión desde localStorage / login en App.jsx).
 */
export const esUsuarioGestoria = (user) =>
  user?.rol === 'GESTORIA' || String(user?.email || '').toLowerCase() === 'alcor@asesores.com'

export const esUsuarioAdmin = (user) => user?.rol === 'ADMIN'
