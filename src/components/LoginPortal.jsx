import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { sincronizarNivelAccesoEnSesion } from '../utils/nivelAcceso'
import { aplicarMarcaDocumento, NOMBRE_APP_DEFAULT } from '../utils/marcaBlanca'
import { DEFAULT_EMPRESA_ID } from '../config/empresa'

/**
 * Login unificado: solo Supabase Auth + perfil en public.profiles.
 */
const LoginPortal = ({ onSesion }) => {
  const [nombreMarca, setNombreMarca] = useState(NOMBRE_APP_DEFAULT)
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const cargarMarcaPortada = useCallback(async () => {
    const { data, error } = await supabase.rpc('portal_marca_portada')
    if (error || !data) {
      setNombreMarca(NOMBRE_APP_DEFAULT)
      aplicarMarcaDocumento(NOMBRE_APP_DEFAULT, null)
      return
    }
    const nombre = typeof data === 'object' && data !== null ? data.nombre_app : NOMBRE_APP_DEFAULT
    const fav = typeof data === 'object' && data !== null ? data.favicon_url : null
    const n = nombre && String(nombre).trim() ? String(nombre).trim() : NOMBRE_APP_DEFAULT
    setNombreMarca(n)
    aplicarMarcaDocumento(n, fav)
  }, [])

  useEffect(() => {
    cargarMarcaPortada()
  }, [cargarMarcaPortada])

  const emailNorm = email.toLowerCase().trim()

  const entrarSupabase = async (e) => {
    e.preventDefault()
    setMensaje('')
    setCargando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: emailNorm, password: pass })
    if (error) {
      setCargando(false)
      const msg = String(error.message || '')
      if (/invalid login credentials|invalid credentials/i.test(msg)) {
        setMensaje('Email o contraseña incorrectos. Si aún no activaste acceso, crea tu contraseña desde el enlace de invitación.')
      } else {
        setMensaje(msg || 'No se pudo iniciar sesión. Inténtalo de nuevo.')
      }
      return
    }
    let { data: ui, error: e2 } = await supabase.rpc('sesion_usuario_ui')
    setCargando(false)
    const u = (!e2 && ui && typeof ui === 'object') ? ui : {}
    // Modo emergencia: no bloquear login si profiles/rpc falla.
    // Se crea perfil temporal en memoria y se fuerza empresa_id=1 para andres@viajestabora.com.
    const empresaTemporal = emailNorm === 'andres@viajestabora.com' ? 1 : DEFAULT_EMPRESA_ID
    const empresaIdSesion = u.empresa_id ?? empresaTemporal
    let cifEmpresa = null
    if (empresaIdSesion != null) {
      const { data: empresaData } = await supabase
        .from('empresas')
        .select('cif')
        .eq('id', Number(empresaIdSesion))
        .maybeSingle()
      cifEmpresa = empresaData?.cif ?? null
    }
    const sesion = {
      email: u.email || emailNorm,
      nombre: u.nombre || emailNorm.split('@')[0],
      nivel_acceso: u.nivel_acceso || (emailNorm === 'andres@viajestabora.com' ? 'ADMIN' : 'STAFF'),
      empresa_id: empresaIdSesion,
      id: u.id,
      cif: cifEmpresa,
      nombre_app: u.nombre_app || NOMBRE_APP_DEFAULT,
      favicon_url: u.favicon_url || null,
    }
    if (e2 || !ui) {
      setMensaje('Perfil no disponible temporalmente. Accediendo con perfil de emergencia.')
    }
    const merged = sincronizarNivelAccesoEnSesion({
      ...sesion,
      empresa_id: sesion.empresa_id ?? DEFAULT_EMPRESA_ID,
    })
    aplicarMarcaDocumento(merged.nombre_app, merged.favicon_url)
    localStorage.setItem('sesion_tabora', JSON.stringify(merged))
    onSesion(merged)
    window.location.reload()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-lg border border-slate-200 p-8">
        <h1 className="text-center text-2xl font-bold text-slate-900 tracking-tight">{nombreMarca}</h1>
        <p className="text-center text-sm text-slate-500 mt-1 mb-6">ERP</p>
        <form onSubmit={entrarSupabase} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Correo electrónico</label>
            <input
              type="email"
              required
              value={email}
              onChange={(ev) => {
                setEmail(ev.target.value)
                if (mensaje) setMensaje('')
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none"
              placeholder="tu@empresa.com"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Contraseña</label>
            <input
              type="password"
              required
              value={pass}
              onChange={(ev) => {
                setPass(ev.target.value)
                if (mensaje) setMensaje('')
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:ring-2 focus:ring-blue-600 outline-none"
              autoComplete="current-password"
            />
          </div>
          {mensaje && <p className="text-sm text-rose-600">{mensaje}</p>}
          <button
            type="submit"
            disabled={cargando}
            className="w-full py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {cargando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

      </div>
    </div>
  )
}

export default LoginPortal
