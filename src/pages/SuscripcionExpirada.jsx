import React from 'react'
import { supabase } from '../supabase'

/**
 * Pantalla bloqueante cuando la fecha_expiracion de la empresa del usuario es anterior a hoy.
 */
const SuscripcionExpirada = ({ user, onLogout }) => {
  const cerrarTodo = async () => {
    await supabase.auth.signOut().catch(() => {})
    onLogout?.()
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white px-6 py-12">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="inline-flex rounded-full bg-amber-500/20 p-4 ring-2 ring-amber-400/50">
          <span className="text-4xl" aria-hidden>
            ⏳
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Suscripción expirada</h1>
        <p className="text-slate-300 text-sm leading-relaxed">
          El periodo contratado para tu agencia ha finalizado. Para seguir accediendo a los datos del ERP,
          renueva el plan con Viajes Tabora o contacta con soporte.
        </p>
        {user?.email && (
          <p className="text-xs text-slate-500">
            Sesión: <span className="text-slate-400">{user.email}</span>
          </p>
        )}
        <button
          type="button"
          onClick={cerrarTodo}
          className="w-full py-3 rounded-xl bg-white text-slate-900 font-semibold hover:bg-slate-100 transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

export default SuscripcionExpirada
