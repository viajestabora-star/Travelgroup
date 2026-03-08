import { supabase } from '../supabase'

const STORAGE_KEY_ENTRADA = 'control_horario_entrada_id'
const STORAGE_KEY_FECHA = 'control_horario_fecha_validada'

/**
 * Registro silencioso de entrada. Se llama automáticamente al iniciar sesión.
 * Inserta en control_horario con usuario_id (auth.uid()) y user_email. 100% invisible.
 */
export async function registrarEntradaSilencioso(userEmail, usuarioId = null) {
  if (!userEmail) return
  const hoy = new Date().toISOString().slice(0, 10)
  const payload = {
    user_email: userEmail.toLowerCase(),
    fecha: hoy,
    hora_entrada: new Date().toISOString(),
  }
  if (usuarioId) payload.usuario_id = usuarioId

  const { data, error } = await supabase
    .from('control_horario')
    .insert([payload])
    .select('id')
    .single()

  if (error) {
    console.error('[control_horario] Error al insertar entrada:', error.message, 'Detalle:', error)
    return
  }
  if (data?.id) {
    sessionStorage.setItem(STORAGE_KEY_ENTRADA, data.id)
    sessionStorage.setItem(STORAGE_KEY_FECHA, hoy)
    console.log('Fichaje realizado con éxito')
  }
}

/**
 * Heartbeat: actualiza hora_salida sin cerrar la sesión.
 * Usar cada 30 min para mantener el registro actualizado (cierre inesperado, pestaña olvidada).
 */
export async function heartbeatSalida() {
  const id = sessionStorage.getItem(STORAGE_KEY_ENTRADA)
  if (!id) return

  const ahora = new Date().toISOString()
  await supabase
    .from('control_horario')
    .update({ hora_salida: ahora })
    .eq('id', id)
}

/**
 * Registra la hora de salida y cierra la sesión. El trigger en BD calcula duracion_minutos.
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
