import { supabase } from '../supabase'

const STORAGE_KEY_ENTRADA = 'control_horario_entrada_id'
const STORAGE_KEY_FECHA = 'control_horario_fecha_validada'

/**
 * Registro silencioso de entrada. Se llama automáticamente al iniciar sesión.
 * Payload: usuario_id, user_email, fecha, hora_entrada (24h en-GB).
 */
export async function registrarEntradaSilencioso(session) {
  const user = session?.user ?? session
  if (!user?.email) return
  const payload = {
    usuario_id: user.id ?? null,
    user_email: user.email,
    fecha: new Date().toISOString().split('T')[0],
    hora_entrada: new Date().toLocaleTimeString('en-GB', { hour12: false }),
  }

  const { data, error } = await supabase
    .from('control_horario')
    .insert([payload])
    .select('id')
    .single()

  if (error) {
    console.dir(error)
    if (error.code === '23505') {
      const hoy = payload.fecha
      let q = supabase.from('control_horario').select('id').eq('fecha', hoy)
      if (payload.usuario_id) q = q.eq('usuario_id', payload.usuario_id)
      else q = q.eq('user_email', user.email.toLowerCase())
      const { data: rows } = await q.order('hora_entrada', { ascending: false }).limit(1)
      const existente = Array.isArray(rows) ? rows[0] : rows
      if (existente?.id) {
        sessionStorage.setItem(STORAGE_KEY_ENTRADA, existente.id)
        sessionStorage.setItem(STORAGE_KEY_FECHA, hoy)
      }
      return
    }
    return
  }
  if (data?.id) {
    sessionStorage.setItem(STORAGE_KEY_ENTRADA, data.id)
    sessionStorage.setItem(STORAGE_KEY_FECHA, payload.fecha)
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
