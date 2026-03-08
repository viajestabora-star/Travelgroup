import { supabase } from '../supabase'

const STORAGE_KEY_ENTRADA = 'control_horario_entrada_id'

/**
 * Registra la hora de salida. El trigger en BD calcula duracion_minutos.
 * Usar en logout.
 */
export async function registrarSalida() {
  const id = sessionStorage.getItem(STORAGE_KEY_ENTRADA)
  if (!id) return

  const ahora = new Date().toISOString()
  await supabase
    .from('control_horario')
    .update({ hora_salida: ahora })
    .eq('id', id)

  sessionStorage.removeItem(STORAGE_KEY_ENTRADA)
}

/**
 * Versión para beforeunload: fetch con keepalive para que la petición sobreviva al cierre.
 * El trigger en BD calcula duracion_minutos al actualizar hora_salida.
 */
export function registrarSalidaOnUnload() {
  const id = sessionStorage.getItem(STORAGE_KEY_ENTRADA)
  if (!id) return

  const url = import.meta.env.VITE_SUPABASE_URL || 'https://gtwyqxfkpdwpakmgrkbu.supabase.co'
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

  fetch(`${url}/rest/v1/control_horario?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ hora_salida: new Date().toISOString() }),
    keepalive: true,
  }).catch(() => {})

  sessionStorage.removeItem(STORAGE_KEY_ENTRADA)
}
