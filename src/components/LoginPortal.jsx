import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { sincronizarNivelAccesoEnSesion } from '../utils/nivelAcceso'
import { aplicarMarcaDocumento, NOMBRE_APP_DEFAULT } from '../utils/marcaBlanca'
import { setTenantEmpresaId } from '../utils/tenantDb'
import { toSlug } from '../utils/slugify'

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

    // 1. Autenticar con Supabase Auth
    const { error: authError } = await supabase.auth.signInWithPassword({ email: emailNorm, password: pass })
    if (authError) {
      setCargando(false)
      const msg = String(authError.message || '')
      if (/invalid login credentials|invalid credentials/i.test(msg)) {
        setMensaje('Email o contraseña incorrectos. Si aún no activaste acceso, crea tu contraseña desde el enlace de invitación.')
      } else {
        setMensaje(msg || 'No se pudo iniciar sesión. Inténtalo de nuevo.')
      }
      return
    }

    // 2. Obtener el userId del JWT (fuente de verdad: Supabase Auth)
    const { data: sessionData } = await supabase.auth.getSession()
    const authUser = sessionData?.session?.user
    const userId = authUser?.id

    if (!userId) {
      setCargando(false)
      await supabase.auth.signOut()
      setMensaje('No se pudo verificar la sesión. Inténtalo de nuevo.')
      return
    }

    // 3. Leer empresa_id y nivel_acceso desde la tabla profiles
    // La columna real es nivel_acceso (no rol). Se selecciona explícitamente.
    const { data: perfil, error: perfilError } = await supabase
      .from('profiles')
      .select('empresa_id, nivel_acceso, nombre, email')
      .eq('id', userId)
      .maybeSingle()

    const empresaIdPerfil = Number(perfil?.empresa_id) > 0 ? Number(perfil.empresa_id) : null

    // Fallback: si profiles no tiene empresa_id, leer del JWT (app_metadata > user_metadata).
    // Imprescindible para el Superadmin (empresa_id=1 / Tabora) cuya fila de profiles
    // puede no tener empresa_id si el trigger de DB no lo escribió aún.
    const empresaIdJWT = Number(
      authUser?.app_metadata?.empresa_id
      ?? authUser?.user_metadata?.empresa_id
      ?? 0,
    )
    const empresaIdSesion = empresaIdPerfil ?? (empresaIdJWT > 0 ? empresaIdJWT : null)

    if (perfilError || !empresaIdSesion) {
      // Bypass: si el JWT (app_metadata) confirma un empresa_id válido, permitir acceso
      // aunque profiles aún no tenga la columna rellena (p.ej. primer login de un Tenant
      // recién creado cuyo trigger de BD no ha ejecutado todavía).
      // Aplica a CUALQUIER empresa_id > 0, no solo al Superadmin (id=1).
      if (empresaIdJWT > 0) {
        console.warn('[Login] profiles sin empresa_id, pero JWT confirma empresa_id válido:', empresaIdJWT, '— Acceso permitido.')
      } else {
        setCargando(false)
        await supabase.auth.signOut()
        setMensaje('Tu cuenta no tiene empresa asignada. Contacta con el administrador del sistema.')
        return
      }
    }

    // 4. Activar el filtro multi-tenant ANTES de cualquier query posterior
    setTenantEmpresaId(empresaIdSesion)

    // 5. Datos de empresa: cif + slug + logo (no crítico, no bloquea el acceso)
    const { data: empresaData } = await supabase
      .from('empresas')
      .select('cif, nombre_comercial, logo_url')
      .eq('id', empresaIdSesion)
      .maybeSingle()

    const cifEmpresa  = empresaData?.cif ?? null
    const logoUrl     = empresaData?.logo_url ?? null
    const nombreComercial = empresaData?.nombre_comercial ?? null
    const empresaSlug = toSlug(empresaData?.nombre_comercial || `empresa-${empresaIdSesion}`)

    // 6. Datos de marca blanca (no crítico)
    const { data: ui } = await supabase.rpc('sesion_usuario_ui')
    const u = (ui && typeof ui === 'object') ? ui : {}

    setCargando(false)

    // perfil puede ser null en el bypass por JWT (primer login de cualquier tenant).
    // Si empresa_id=1 (Superadmin de Tabora) el nivel por defecto es ADMIN; para el
    // resto de tenants el nivel por defecto es STAFF hasta que profiles lo complete.
    const nivelAccesoDefault = empresaIdSesion === 1 ? 'ADMIN' : 'STAFF'
    const sesion = {
      email:        perfil?.email        || emailNorm,
      nombre:       perfil?.nombre       || u.nombre || emailNorm.split('@')[0],
      nivel_acceso: perfil?.nivel_acceso || nivelAccesoDefault,
      empresa_id:   empresaIdSesion,
      id:           userId,
      cif:          cifEmpresa,
      nombre_comercial: nombreComercial,
      logo_url:     logoUrl,
      empresa_slug: empresaSlug,
      nombre_app:   u.nombre_app  || NOMBRE_APP_DEFAULT,
      favicon_url:  u.favicon_url || null,
    }

    const merged = sincronizarNivelAccesoEnSesion(sesion)
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
