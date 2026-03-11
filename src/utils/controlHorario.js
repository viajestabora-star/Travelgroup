import { supabase } from '../supabase'

const STORAGE_KEY_ENTRADA = 'control_horario_entrada_id'
const STORAGE_KEY_FECHA = 'control_horario_fecha_validada'

const formatFechaYYYYMMDD = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const formatHoraHHmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const formatHoraSalida = (d) => `${formatFechaYYYYMMDD(d)} ${formatHoraHHmm(d)}:00`

/**
 * Registro silencioso de entrada. Se llama automáticamente al iniciar sesión.
 * fecha: YYYY-MM-DD, hora_entrada: 'YYYY-MM-DD HH:mm:00'
 */
export async function registrarEntradaSilencioso(session) {
  if (!session?.user?.email) return

  const ahora = new Date()
  const fecha = formatFechaYYYYMMDD(ahora)
  const objeto = {
    usuario_id: session.user.id,
    user_email: session.user.email.trim().toLowerCase(),
    fecha,
    hora_entrada: formatHoraSalida(ahora),
  }

  const { data: existente, error: errBuscar } = await supabase
    .from('control_horario')
    .select('id')
    .eq('user_email', objeto.user_email)
    .eq('fecha', fecha)
    .maybeSingle()

  if (errBuscar) {
    console.error('[Control Horario] Error al buscar:', errBuscar)
    return
  }

  if (!existente) {
    const { data, error } = await supabase.from('control_horario').insert([objeto]).select('id').single()
    if (error) {
      console.error('[Control Horario] Error INSERT:', error)
      return
    }
    if (data?.id) {
      sessionStorage.setItem(STORAGE_KEY_ENTRADA, data.id)
      sessionStorage.setItem(STORAGE_KEY_FECHA, objeto.fecha)
    }
  } else {
    sessionStorage.setItem(STORAGE_KEY_ENTRADA, existente.id)
    sessionStorage.setItem(STORAGE_KEY_FECHA, objeto.fecha)
  }
}

/**
 * Heartbeat por id: actualiza hora_salida solo en la fila identificada.
 * Evita pisar registros de otros usuarios. Formato hora_salida: HH:mm
 */
export async function heartbeatSalidaById(id) {
  if (!id) return

  const horaSalida = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const { error } = await supabase
    .from('control_horario')
    .update({ hora_salida: horaSalida })
    .eq('id', id)

  if (error) console.error('[Control Horario] Error UPDATE heartbeat:', error)
}

/**
 * Heartbeat por email (legacy): actualiza hora_salida filtrando por user_email y fecha.
 * Formato hora_salida: HH:mm
 */
export async function heartbeatSalida(email) {
  if (!email) return

  const fecha = new Date().toISOString().split('T')[0]
  const horaSalida = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

  const { error } = await supabase
    .from('control_horario')
    .update({ hora_salida: horaSalida })
    .eq('user_email', email)
    .eq('fecha', fecha)

  if (error) console.error('[Control Horario] Error UPDATE heartbeat:', error)
}

/**
 * Registra la hora de salida y cierra la sesión. El trigger en BD calcula duracion_minutos.
 * Usar en logout. Formato hora_salida: 'YYYY-MM-DD HH:mm:00'
 */
export async function registrarSalida() {
  const id = sessionStorage.getItem(STORAGE_KEY_ENTRADA)
  if (!id) return

  const { error } = await supabase
    .from('control_horario')
    .update({ hora_salida: formatHoraSalida(new Date()) })
    .eq('id', id)

  if (error) console.error('[Control Horario] Error UPDATE registrarSalida:', error)
  sessionStorage.removeItem(STORAGE_KEY_ENTRADA)
}

/**
 * Versión para beforeunload: fetch con keepalive para que la petición sobreviva al cierre.
 * Acepta id opcional; si no se pasa, usa localStorage/sessionStorage.
 * Formato hora_salida: HH:mm (consistente con heartbeat)
 */
export function registrarSalidaOnUnload(idFromRef) {
  const id = idFromRef || localStorage.getItem(STORAGE_KEY_ENTRADA) || sessionStorage.getItem(STORAGE_KEY_ENTRADA)
  if (!id) return

  const horaSalida = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
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
    body: JSON.stringify({ hora_salida: horaSalida }),
    keepalive: true,
  }).catch((err) => console.error('[Control Horario] Error PATCH onUnload:', err))

  localStorage.removeItem(STORAGE_KEY_ENTRADA)
  sessionStorage.removeItem(STORAGE_KEY_ENTRADA)
}
