import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import TimeTrackerModal from './TimeTrackerModal'
import { registrarSalida, registrarSalidaOnUnload } from '../utils/controlHorario'

const STORAGE_KEY_FECHA = 'control_horario_fecha_validada'

/**
 * TimeTrackerProvider - Envuelve la app para Marisa.
 * Comprueba si ya registró entrada hoy. Si no, muestra modal.
 * Registra salida en logout y cierre de pestaña.
 */
const TimeTrackerProvider = ({ user, children }) => {
  const [validado, setValidado] = useState(false)
  const [comprobando, setComprobando] = useState(true)

  const esMarisa = user?.email?.toLowerCase() === 'grupos@viajestabora.com'

  useEffect(() => {
    if (!esMarisa) {
      setValidado(true)
      setComprobando(false)
      return
    }

    const comprobar = async () => {
      const hoy = new Date().toISOString().slice(0, 10)
      const fechaGuardada = sessionStorage.getItem(STORAGE_KEY_FECHA)
      if (fechaGuardada === hoy && sessionStorage.getItem('control_horario_entrada_id')) {
        setValidado(true)
        setComprobando(false)
        return
      }

      const { data: registros, error } = await supabase
        .from('control_horario')
        .select('id, hora_salida')
        .eq('user_email', user.email.toLowerCase())
        .eq('fecha', hoy)
        .order('hora_entrada', { ascending: false })

      if (!error && Array.isArray(registros) && registros.length > 0) {
        const abierto = registros.find((r) => !r.hora_salida)
        if (abierto) {
          sessionStorage.setItem('control_horario_entrada_id', abierto.id)
        }
        sessionStorage.setItem(STORAGE_KEY_FECHA, hoy)
        setValidado(true)
      }
      setComprobando(false)
    }

    comprobar()
  }, [esMarisa, user?.email])

  useEffect(() => {
    if (!esMarisa || !validado) return

    const handleBeforeUnload = () => {
      registrarSalidaOnUnload()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [esMarisa, validado])

  const handleValidado = useCallback(() => {
    setValidado(true)
  }, [])

  if (comprobando && esMarisa) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-slate-500">Comprobando acceso...</div>
      </div>
    )
  }

  if (esMarisa && !validado) {
    return (
      <TimeTrackerModal user={user} onValidado={handleValidado}>
        {null}
      </TimeTrackerModal>
    )
  }

  return children
}

export default TimeTrackerProvider
