import { supabase } from '../supabase'

const STORAGE_KEY_ENTRADA = 'control_horario_entrada_id'
const STORAGE_KEY_FECHA = 'control_horario_fecha_validada'

/**
 * Registro silencioso de entrada. Se llama automáticamente al iniciar sesión.
 * Objeto exacto para insert. Verifica existente antes de insertar.
 */
export async function registrarEntradaSilencioso(session) {
  if (!session?.user?.email) return

  const objeto = {
    usuario_id: session.user.id,
    user_email: session.user.email,
    fecha: new Date().toISOString().split('T')[0],
    hora_entrada: new Date().toLocaleTimeString('en-GB', { hour12: false }),
  }

  const { data: existente } = await supabase
    .from('control_horario')
    .select('id')
    .eq('usuario_id', session.user.id)
    .eq('fecha', new Date().toISOString().split('T')[0])
    .single()

  if (!existente) {
    const { data, error } = await supabase.from('control_horario').insert([objeto]).select('id').single()
    if (error) {
      console.dir(error)
      return
    }
    if (data?.id) {
      sessionStorage.setItem(STORAGE_KEY_ENTRADA, data.id)
      sessionStorage.setItem(STORAGE_KEY_FECHA, objeto.fecha)
      console.log('Fichaje realizado con éxito')
    }
  } else {
    sessionStorage.setItem(STORAGE_KEY_ENTRADA, existente.id)
    sessionStorage.setItem(STORAGE_KEY_FECHA, objeto.fecha)
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
