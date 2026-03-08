import React, { useEffect } from 'react'
import { supabase } from '../supabase'
import { registrarSalidaOnUnload, heartbeatSalida, registrarEntradaSilencioso } from '../utils/controlHorario'

const HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000 // 30 minutos

const STORAGE_KEY_FECHA = 'control_horario_fecha_validada'

/**
 * TimeTrackerProvider - Registro silencioso de control horario para Marisa.
 * Fichaje 100% invisible en segundo plano. Sin modales ni pantallas intermedias.
 * Heartbeat cada 30 min. Registra salida en logout y cierre de pestaña.
 */
const TimeTrackerProvider = ({ user, children }) => {
  const esMarisa = user?.email?.toLowerCase() === 'grupos@viajestabora.com'

  useEffect(() => {
    if (!esMarisa) return

    const init = async () => {
      const hoy = new Date().toISOString().slice(0, 10)
      if (sessionStorage.getItem(STORAGE_KEY_FECHA) === hoy && sessionStorage.getItem('control_horario_entrada_id')) return

      const { data: registros, error } = await supabase
        .from('control_horario')
        .select('id, hora_salida')
        .eq('user_email', user.email.toLowerCase())
        .eq('fecha', hoy)
        .order('hora_entrada', { ascending: false })

      if (!error && Array.isArray(registros) && registros.length > 0) {
        const abierto = registros.find((r) => !r.hora_salida)
        if (abierto) sessionStorage.setItem('control_horario_entrada_id', abierto.id)
        sessionStorage.setItem(STORAGE_KEY_FECHA, hoy)
      } else {
        await registrarEntradaSilencioso(user.email)
      }
    }

    init()
  }, [esMarisa, user?.email])

  useEffect(() => {
    if (!esMarisa) return
    const handleBeforeUnload = () => registrarSalidaOnUnload()
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [esMarisa])

  useEffect(() => {
    if (!esMarisa) return
    const tick = () => heartbeatSalida()
    const id = setInterval(tick, HEARTBEAT_INTERVAL_MS)
    return () => clearInterval(id)
  }, [esMarisa])

  return children
}

export default TimeTrackerProvider
