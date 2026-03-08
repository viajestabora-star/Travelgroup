import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'

const CLAVE_MAESTRA = 'tabora'
const MAX_INTENTOS = 3
const BLOQUEO_MS = 60 * 1000 // 1 minuto

const STORAGE_KEY_BLOQUEO = 'control_horario_bloqueo_hasta'
const STORAGE_KEY_ENTRADA = 'control_horario_entrada_id'
const STORAGE_KEY_FECHA = 'control_horario_fecha_validada'

/**
 * TimeTrackerModal - Bloquea la app hasta que el usuario introduzca la contraseña correcta.
 * Solo aplica a Marisa (grupos@viajestabora.com) en el primer acceso del día.
 * Si falla 3 veces, bloquea 1 minuto.
 */
const TimeTrackerModal = ({ user, onValidado, children }) => {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [intentos, setIntentos] = useState(0)
  const [bloqueadoHasta, setBloqueadoHasta] = useState(null)
  const [cargando, setCargando] = useState(false)

  const esMarisa = user?.email?.toLowerCase() === 'grupos@viajestabora.com'

  const verificarBloqueo = useCallback(() => {
    const hasta = localStorage.getItem(STORAGE_KEY_BLOQUEO)
    if (!hasta) return false
    const ts = parseInt(hasta, 10)
    if (Date.now() < ts) {
      setBloqueadoHasta(ts)
      return true
    }
    localStorage.removeItem(STORAGE_KEY_BLOQUEO)
    return false
  }, [])

  const registrarEntrada = useCallback(async () => {
    if (!user?.email) return
    setCargando(true)
    setError('')
    try {
      const hoy = new Date().toISOString().slice(0, 10)
      const { data, error: insertError } = await supabase
        .from('control_horario')
        .insert([{
          user_email: user.email.toLowerCase(),
          fecha: hoy,
          hora_entrada: new Date().toISOString(),
        }])
        .select('id')
        .single()

      if (insertError) throw insertError
      if (data?.id) {
        sessionStorage.setItem(STORAGE_KEY_ENTRADA, data.id)
        sessionStorage.setItem(STORAGE_KEY_FECHA, hoy)
        onValidado(data.id)
      }
    } catch (err) {
      setError(err?.message || 'Error al registrar la entrada')
    } finally {
      setCargando(false)
    }
  }, [user?.email, onValidado])

  const handleSubmit = useCallback((e) => {
    e.preventDefault()
    setError('')

    if (verificarBloqueo()) {
      setError(`Demasiados intentos. Espera 1 minuto.`)
      return
    }

    if (password.trim() === '') {
      setError('Introduce la contraseña')
      return
    }

    if (password !== CLAVE_MAESTRA) {
      const nuevosIntentos = intentos + 1
      setIntentos(nuevosIntentos)
      setPassword('')
      if (nuevosIntentos >= MAX_INTENTOS) {
        const hasta = Date.now() + BLOQUEO_MS
        localStorage.setItem(STORAGE_KEY_BLOQUEO, String(hasta))
        setBloqueadoHasta(hasta)
        setError('Demasiados intentos. Bloqueado 1 minuto.')
      } else {
        setError(`Contraseña incorrecta. ${MAX_INTENTOS - nuevosIntentos} intentos restantes.`)
      }
      return
    }

    registrarEntrada()
  }, [password, intentos, verificarBloqueo, registrarEntrada])

  useEffect(() => {
    if (!bloqueadoHasta) return
    const interval = setInterval(() => {
      if (Date.now() >= bloqueadoHasta) {
        localStorage.removeItem(STORAGE_KEY_BLOQUEO)
        setBloqueadoHasta(null)
        setIntentos(0)
        setError('')
        clearInterval(interval)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [bloqueadoHasta])

  if (!esMarisa) {
    return children
  }

  const segundosRestantes = bloqueadoHasta ? Math.ceil((bloqueadoHasta - Date.now()) / 1000) : 0

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/90">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-800 mb-1">Control de acceso</h2>
        <p className="text-sm text-slate-500 mb-6">Introduce tu contraseña para registrar la entrada</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="time-tracker-pwd" className="block text-sm font-medium text-slate-600 mb-1">
              Contraseña
            </label>
            <input
              id="time-tracker-pwd"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!!bloqueadoHasta || cargando}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed"
              autoFocus
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          {bloqueadoHasta && segundosRestantes > 0 && (
            <p className="text-sm text-amber-600">Reintentar en {segundosRestantes} s</p>
          )}

          <button
            type="submit"
            disabled={!!bloqueadoHasta || cargando}
            className="w-full py-2.5 bg-slate-700 text-white font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {cargando ? 'Registrando...' : 'Confirmar'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default TimeTrackerModal
