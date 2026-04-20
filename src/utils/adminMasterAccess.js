import { DEFAULT_EMPRESA_ID } from '../config/empresa'

/** Empresa raíz Tabora en BD y en sesión ERP. */
export const TABORA_MASTER_EMPRESA_ID = DEFAULT_EMPRESA_ID

/** Ruta y menú `/admin-master`: solo usuarios con empresa_id = 1 (Tabora). Las mutaciones en Supabase exigen además operador master (RPC). */
export function puedeAccederAdminMaster(user) {
  return Number(user?.empresa_id) === TABORA_MASTER_EMPRESA_ID
}
