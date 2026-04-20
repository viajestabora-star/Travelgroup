import React, { useState } from 'react'
import { supabase } from '../supabase'
import { X, KeyRound } from 'lucide-react'

/**
 * Cambio de contraseña vía Supabase Auth (requiere sesión JWT activa).
 */
const CuentaPasswordModal = ({ open, onClose, tieneSesionSupabase }) => {
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' })

  const cerrar = () => {
    if (enviando) return
    setNueva('')
    setConfirmar('')
    setMensaje({ tipo: '', texto: '' })
    onClose()
  }

  const guardar = async (e) => {
    e.preventDefault()
    setMensaje({ tipo: '', texto: '' })
    if (!tieneSesionSupabase) {
      setMensaje({
        tipo: 'err',
        texto: 'Inicia sesión con Supabase Auth para cambiar la contraseña de esa cuenta.',
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
    setTimeout(cerrar, 1500)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2 font-bold text-slate-900">
            <KeyRound className="text-sky-600" size={22} />
            Cambiar contraseña
          </div>
          <button type="button" onClick={cerrar} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Cerrar">
            <X size={22} />
          </button>
        </div>
        <form onSubmit={guardar} className="p-5 space-y-4">
          {!tieneSesionSupabase && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Estás usando solo el acceso ERP local. El cambio de contraseña aplica a tu usuario de{' '}
              <strong>Supabase Auth</strong> cuando inicies sesión con ese proveedor.
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
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={cerrar}
              disabled={enviando}
              className="flex-1 py-2.5 rounded-lg border border-slate-300 font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enviando || !tieneSesionSupabase}
              className="flex-1 py-2.5 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700 disabled:opacity-40"
            >
              {enviando ? 'Guardando…' : 'Actualizar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CuentaPasswordModal
