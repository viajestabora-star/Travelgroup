import { supabase } from '../supabase'

/**
 * Multicotización: el Cierre se hace sobre la variante CONFIRMADA (versiones_cotizacion.confirmada).
 * Devuelve Map id_expediente → version_id confirmado, solo para los expedientes que tienen una
 * (y solo una) variante confirmada. Los expedientes sin variantes o sin confirmada no aparecen:
 * sus consumidores mantienen la carga de todos los servicios del expediente.
 * @param {string[]} expedienteIds
 * @param {object} [supabaseClient]
 * @returns {Promise<Map<string, string>>}
 */
export async function obtenerVersionConfirmadaPorExpediente(expedienteIds, supabaseClient = supabase) {
  const ids = [...new Set((expedienteIds || []).map((id) => String(id || '').trim()).filter(Boolean))]
  const mapa = new Map()
  if (ids.length === 0) return mapa

  const { data, error } = await supabaseClient
    .from('versiones_cotizacion')
    .select('id, id_expediente')
    .in('id_expediente', ids)
    .eq('confirmada', true)
  if (error) throw error

  const conteo = new Map()
  ;(data || []).forEach((f) => conteo.set(String(f.id_expediente), (conteo.get(String(f.id_expediente)) || 0) + 1))
  ;(data || []).forEach((f) => {
    if (conteo.get(String(f.id_expediente)) === 1) mapa.set(String(f.id_expediente), f.id)
  })
  return mapa
}
