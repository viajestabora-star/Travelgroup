/** Llave maestra de acceso para Panel Master. */
export const TABORA_MASTER_CIF = 'B98998107'

/** Ruta y menú `/admin-master`: acceso solo para CIF maestro + nivel ADMIN. */
export function puedeAccederAdminMaster(user) {
  return user?.cif === TABORA_MASTER_CIF && user?.nivel_acceso === 'ADMIN'
}
