import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { KeyRound } from 'lucide-react'

/**
 * Cambio de contraseña (Supabase Auth). Uso embebido en Gestión de Equipo → Seguridad.
 */
const CambioContraseñaForm = ({ className = '' }) => {
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' })
  const [tieneSesionSupabase, setTieneSesionSupabase] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setTieneSesionSupabase(!!session?.user)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setTieneSesionSupabase(!!session?.user)
    })
    return () => {
      cancelled = true
      subscription?.unsubscribe()
    }
  }, [])

  const guardar = async (e) => {
    e.preventDefault()
    setMensaje({ tipo: '', texto: '' })
    if (!tieneSesionSupabase) {
      setMensaje({
        tipo: 'err',
        texto: 'Inicia sesión con tu cuenta para cambiar la contraseña.',
      })
      return
    }
    if (nueva.length < 6) {
      setMensaje({ tipo: 'err', texto: 'La contraseña debe tener al menos 6 caracteres.' })
      return
    }
    if (nueva !== confirmar) {
      setMensaje({ tipo: 'err', texto: 'Las contraseñas no coinciden.' })
      return
    }
    setEnviando(true)
    const { error } = await supabase.auth.updateUser({ password: nueva })
    setEnviando(false)
    if (error) {
      setMensaje({ tipo: 'err', texto: error.message || 'No se pudo actualizar la contraseña.' })
      return
    }
    setMensaje({ tipo: 'ok', texto: 'Contraseña actualizada correctamente.' })
    setNueva('')
    setConfirmar('')
  }

  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
        <KeyRound size={18} className="text-slate-600" />
        <span className="font-semibold text-slate-800">Cambio de contraseña</span>
      </div>
      <form onSubmit={guardar} className="p-4 md:p-5 space-y-4 max-w-md">
        {!tieneSesionSupabase && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            No hay sesión activa para actualizar la contraseña. Vuelve a iniciar sesión e inténtalo de nuevo.
          </p>
        )}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Nueva contraseña</label>
          <input
            type="password"
            autoComplete="new-password"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-sky-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Confirmar contraseña</label>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-sky-500 outline-none"
          />
        </div>
        {mensaje.texto && (
          <div
            className={`rounded-lg px-3 py-2 text-sm ${
              mensaje.tipo === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'
            }`}
          >
            {mensaje.texto}
          </div>
        )}
        <button
          type="submit"
          disabled={enviando || !tieneSesionSupabase}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700 disabled:opacity-40"
        >
          {enviando ? 'Guardando…' : 'Actualizar contraseña'}
        </button>
      </form>
    </div>
  )
}

export default CambioContraseñaForm
