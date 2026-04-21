import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { sincronizarNivelAccesoEnSesion } from '../utils/nivelAcceso'
import { aplicarMarcaDocumento, NOMBRE_APP_DEFAULT } from '../utils/marcaBlanca'
import { DEFAULT_EMPRESA_ID } from '../config/empresa'

/**
 * Login multi-paso: primer acceso (roles_usuarios + signUp) y acceso Supabase estándar.
 */
const LoginPortal = ({ onSesion }) => {
  const [nombreMarca, setNombreMarca] = useState(NOMBRE_APP_DEFAULT)
  const [faviconMarca, setFaviconMarca] = useState(null)
  const [email, setEmail] = useState('')
  const [paso, setPaso] = useState('email')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const cargarMarcaPortada = useCallback(async () => {
    const { data, error } = await supabase.rpc('portal_marca_portada')
    if (error || !data) {
      setNombreMarca(NOMBRE_APP_DEFAULT)
      setFaviconMarca(null)
      aplicarMarcaDocumento(NOMBRE_APP_DEFAULT, null)
      return
    }
    const nombre = typeof data === 'object' && data !== null ? data.nombre_app : NOMBRE_APP_DEFAULT
    const fav = typeof data === 'object' && data !== null ? data.favicon_url : null
    const n = nombre && String(nombre).trim() ? String(nombre).trim() : NOMBRE_APP_DEFAULT
    setNombreMarca(n)
    setFaviconMarca(fav || null)
    aplicarMarcaDocumento(n, fav)
  }, [])

  useEffect(() => {
    cargarMarcaPortada()
  }, [cargarMarcaPortada])

  const emailNorm = email.toLowerCase().trim()

  const continuarEmail = async (e) => {
    e.preventDefault()
    setMensaje('')
    const em = emailNorm
    if (!em || !em.includes('@')) {
      setMensaje('Introduce un correo válido.')
      return
    }
    setCargando(true)
    const { data, error } = await supabase.rpc('portal_estado_primer_acceso', { p_email: em })
    setCargando(false)
    if (error) {
      // Fallback seguro: si la RPC no está disponible por cambios de esquema,
      // no bloqueamos el acceso y pasamos al login estándar de Supabase.
      setMensaje('No se pudo validar el estado de primer acceso. Puedes iniciar sesión con tu contraseña de Supabase.')
      setPaso('supabase_login')
      setPass('')
      return
    }
    const st = data && typeof data === 'object' ? data : {}
    if (st.valido === false) {
      setMensaje('Correo no válido.')
      return
    }
    if (st.puede_primer_acceso === true) {
      setPaso('primer_acceso')
      setPass('')
      setPass2('')
      return
    }
    setPaso('supabase_login')
    setPass('')
  }

  const activarPrimerAcceso = async (e) => {
    e.preventDefault()
    setMensaje('')
    if (pass.length < 6) {
      setMensaje('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (pass !== pass2) {
      setMensaje('Las contraseñas no coinciden.')
      return
    }
    setCargando(true)
    const { data: rd, error: e1 } = await supabase.rpc('portal_datos_roles_para_signup', { p_email: emailNorm })
    if (e1 || !rd || rd.empresa_id == null) {
      setCargando(false)
      setMensaje('No se encontraron datos de acceso para este correo.')
      return
    }
    const empresaId = Number(rd.empresa_id)
    const rolRaw = String(rd.rol || 'STAFF').toUpperCase()
    const { data: authData, error: e2 } = await supabase.auth.signUp({
      email: emailNorm,
      password: pass,
      options: {
        data: {
          empresa_id: empresaId,
          nivel_acceso: rolRaw,
          nombre: emailNorm.split('@')[0],
        },
      },
    })
    setCargando(false)
    if (e2) {
      setMensaje(e2.message || 'No se pudo registrar.')
      return
    }
    if (authData?.session) {
      if (empresaId > 0) {
        await supabase.rpc('ensure_empresa_id_claim', { p_empresa_id: empresaId }).catch(() => {})
        await supabase.auth.refreshSession().catch(() => {})
      }
      const { data: ui, error: e3 } = await supabase.rpc('sesion_usuario_ui')
      if (e3 || !ui) {
        setMensaje('Cuenta creada. Inicia sesión de nuevo con tu contraseña.')
        setPaso('supabase_login')
        return
      }
      const u = typeof ui === 'object' ? ui : {}
      const sesion = {
        email: u.email || emailNorm,
        nombre: u.nombre || emailNorm.split('@')[0],
        nivel_acceso: u.nivel_acceso || rolRaw,
        empresa_id: u.empresa_id ?? empresaId,
        id: u.id,
        nombre_app: u.nombre_app || NOMBRE_APP_DEFAULT,
        favicon_url: u.favicon_url || null,
      }
      const merged = sincronizarNivelAccesoEnSesion(sesion)
      aplicarMarcaDocumento(merged.nombre_app, merged.favicon_url)
      localStorage.setItem('sesion_tabora', JSON.stringify(merged))
      onSesion(merged)
      return
    }
    setMensaje(
      'Si tu proyecto Supabase exige confirmar el correo, revisa la bandeja de entrada y vuelve a entrar tras confirmar.'
    )
  }

  const entrarSupabase = async (e) => {
    e.preventDefault()
    setMensaje('')
    setCargando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: emailNorm, password: pass })
    if (error) {
      setCargando(false)
      const msg = String(error.message || '')
      if (/invalid login credentials|invalid credentials/i.test(msg)) {
        setMensaje('Email o contraseña incorrectos. Verifica tus datos e inténtalo de nuevo.')
      } else {
        setMensaje(msg || 'No se pudo iniciar sesión. Inténtalo de nuevo.')
      }
      return
    }
    let { data: ui, error: e2 } = await supabase.rpc('sesion_usuario_ui')
    const empClaim = Number(ui?.empresa_id)
    if (!e2 && ui && !Number.isNaN(empClaim) && empClaim > 0) {
      await supabase.rpc('ensure_empresa_id_claim', { p_empresa_id: empClaim }).catch(() => {})
      await supabase.auth.refreshSession().catch(() => {})
      const r2 = await supabase.rpc('sesion_usuario_ui')
      if (!r2.error && r2.data) ui = r2.data
    }
    setCargando(false)
    if (e2 || !ui) {
      setMensaje('No se pudo cargar el perfil. ¿Existe fila en public.profiles para tu usuario?')
      return
    }
    const u = typeof ui === 'object' ? ui : {}
    const sesion = {
      email: u.email || emailNorm,
      nombre: u.nombre || emailNorm.split('@')[0],
      nivel_acceso: u.nivel_acceso || 'STAFF',
      empresa_id: u.empresa_id ?? DEFAULT_EMPRESA_ID,
      id: u.id,
      nombre_app: u.nombre_app || NOMBRE_APP_DEFAULT,
      favicon_url: u.favicon_url || null,
    }
    const merged = sincronizarNivelAccesoEnSesion({
      ...sesion,
      empresa_id: sesion.empresa_id ?? DEFAULT_EMPRESA_ID,
    })
    aplicarMarcaDocumento(merged.nombre_app, merged.favicon_url)
    localStorage.setItem('sesion_tabora', JSON.stringify(merged))
    onSesion(merged)
  }

  const volverEmail = () => {
    setPaso('email')
    setPass('')
    setPass2('')
    setMensaje('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-lg border border-slate-200 p-8">
        <h1 className="text-center text-2xl font-bold text-slate-900 tracking-tight">{nombreMarca}</h1>
        <p className="text-center text-sm text-slate-500 mt-1 mb-6">ERP</p>

        {paso === 'email' && (
          <form onSubmit={continuarEmail} className="space-y-4">
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
            {mensaje && <p className="text-sm text-rose-600">{mensaje}</p>}
            <button
              type="submit"
              disabled={cargando}
              className="w-full py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {cargando ? 'Comprobando…' : 'Continuar'}
            </button>
          </form>
        )}

        {paso === 'primer_acceso' && (
          <form onSubmit={activarPrimerAcceso} className="space-y-4">
            <p className="text-sm text-slate-600">
              Hemos reconocido <strong>{emailNorm}</strong>. Define tu contraseña para activar tu cuenta.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Contraseña</label>
              <input
                type="password"
                required
                minLength={6}
                value={pass}
                onChange={(ev) => {
                  setPass(ev.target.value)
                  if (mensaje) setMensaje('')
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:ring-2 focus:ring-blue-600 outline-none"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Confirmar contraseña</label>
              <input
                type="password"
                required
                minLength={6}
                value={pass2}
                onChange={(ev) => {
                  setPass2(ev.target.value)
                  if (mensaje) setMensaje('')
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:ring-2 focus:ring-blue-600 outline-none"
                autoComplete="new-password"
              />
            </div>
            {mensaje && <p className="text-sm text-amber-700">{mensaje}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={volverEmail} className="flex-1 py-2.5 rounded-lg border border-slate-300 font-medium text-slate-700 hover:bg-slate-50">
                Atrás
              </button>
              <button type="submit" disabled={cargando} className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50">
                {cargando ? 'Creando…' : 'Activar acceso'}
              </button>
            </div>
          </form>
        )}

        {paso === 'supabase_login' && (
          <form onSubmit={entrarSupabase} className="space-y-4">
            <p className="text-sm text-slate-600">
              Cuenta registrada para <strong>{emailNorm}</strong>. Introduce tu contraseña.
            </p>
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
            <div className="flex gap-2">
              <button type="button" onClick={volverEmail} className="flex-1 py-2.5 rounded-lg border border-slate-300 font-medium text-slate-700 hover:bg-slate-50">
                Atrás
              </button>
              <button type="submit" disabled={cargando} className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50">
                {cargando ? 'Entrando…' : 'Entrar'}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  )
}

export default LoginPortal
