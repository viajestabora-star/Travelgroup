/**
 * ID numérico de la empresa raíz (Tabora / Superadmin).
 * Se usa como entero para evitar comparaciones string ("1" !== 1).
 */
export const MASTER_EMPRESA_ID = 1

/**
 * Ruta y menú `/admin-master`.
 * Criterio: empresa raíz (empresa_id === 1, Integer) + nivel ADMIN.
 * No se compara el CIF (string) para evitar dependencias en datos variables.
 * La capa de RLS del servidor sigue siendo la autoridad final.
 */
export function puedeAccederAdminMaster(user) {
  return (
    Number(user?.empresa_id) === MASTER_EMPRESA_ID &&
    user?.nivel_acceso === 'ADMIN'
  )
}
