/**
 * Protocolo de certeza post-escritura Supabase:
 * no dar por bueno un guardado si no hay fila devuelta o falta PK (evita 204 / RLS silencioso).
 */

export const MSJ_PERSISTENCIA_FALLIDA =
  'Error: El registro no pudo ser persistido. Contacte con soporte o revise permisos.'

export function getEmpresaIdNumerico(empresaId) {
  const n = Number(empresaId)
  return Number.isInteger(n) && n > 0 ? n : null
}

/** Lanza si no hay tenant numérico válido (antes de INSERT/UPDATE con empresa_id explícito). */
export function empresaIdNumericoOThrow(
  empresaId,
  mensaje = 'Falta empresa_id del tenant. No se enviará la petición.',
) {
  const n = getEmpresaIdNumerico(empresaId)
  if (!n) throw new Error(mensaje)
  return n
}

/**
 * Tras .insert().select().single() / .update().eq(...).select().single()
 * @param {{ data?: unknown, error?: unknown }} result
 * @param {{ pkKey?: string }} [opts]
 * @returns {unknown} data
 */
export function assertFilaPersistida(result, opts = {}) {
  const { pkKey = 'id' } = opts
  const { data, error } = result || {}
  if (error) {
    const msg = error?.message || String(error)
    throw new Error(msg)
  }
  if (data == null) {
    throw new Error(MSJ_PERSISTENCIA_FALLIDA)
  }
  const pk = data[pkKey]
  if (pk === undefined || pk === null || pk === '') {
    throw new Error(MSJ_PERSISTENCIA_FALLIDA)
  }
  return data
}

export function toIsoDateOnly(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}
