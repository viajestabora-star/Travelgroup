import React, { useState, useEffect, useMemo } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import {
  LayoutDashboard, Users, Calculator, Calendar, Briefcase,
  FileText, Menu, X, Plane, Truck, Edit3, History, LogOut, UserCog, Shield,
} from 'lucide-react'
import { getEjercicioActual, subscribeToEjercicioChanges } from '../utils/ejercicioGlobal'
import { esUsuarioGestoria, puedeAccederCierresEconomicos, esUsuarioAdmin } from '../utils/userRoles'
import { puedeAccederAdminMaster } from '../utils/adminMasterAccess'
import { NOMBRE_APP_DEFAULT } from '../utils/marcaBlanca'
import { asegurarVinculacionEmpleado } from '../utils/empleadosVinculacion'
import { empresaIdDesdeJwtUsuario } from '../utils/tenantEmpresa'

const Layout = ({ user, onLogout }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [ejercicioActual, setEjercicioActual] = useState(getEjercicioActual())
  const [authSession, setAuthSession] = useState(null)
  /** nombre_comercial desde empresas, resolviendo empresa_id vía JWT o public.profiles */
  const [nombreEmpresaBD, setNombreEmpresaBD] = useState(null)
  const [nombreEmpresaError, setNombreEmpresaError] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setAuthSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setAuthSession(session))
    return () => subscription?.unsubscribe()
  }, [])

  // Resuelve empresa_id leyendo directamente public.empleados (sin RPC obsoleta).
  useEffect(() => {
    const userId = authSession?.user?.id
    if (!userId) return
    // Prioridad: app_metadata (servidor) > user_metadata (cliente)
    const empresaIdActual = Number(
      authSession?.user?.app_metadata?.empresa_id
      ?? authSession?.user?.user_metadata?.empresa_id
      ?? 0,
    )
    if (empresaIdActual > 0) return
    // Si no hay claim, simplemente refrescamos la sesi?n para que el trigger de DB lo cargue.
    supabase.auth.refreshSession().then(({ data, error }) => {
      if (!error && data?.session) setAuthSession(data.session)
    })
  }, [authSession?.user?.id, authSession?.user?.app_metadata?.empresa_id])

  // Check de vinculaci?n global: no bloquea acceso; asegura fila en empleados para @viajestabora.com.
  useEffect(() => {
    const authUser = authSession?.user
    if (!authUser?.id) return
    asegurarVinculacionEmpleado({ authUser, appUser: user }).catch(() => {})
  }, [authSession?.user?.id, authSession?.user?.email, user])

  useEffect(() => {
    const unsubscribe = subscribeToEjercicioChanges((nuevoEjercicio) => {
      setEjercicioActual(nuevoEjercicio)
    })
    return unsubscribe
  }, [])

  // Identidad tenant: empresa_id desde JWT o public.profiles → nombre_comercial en empresas.
  useEffect(() => {
    const uid = authSession?.user?.id
    if (!uid) {
      setNombreEmpresaBD(null)
      setNombreEmpresaError(null)
      return
    }

    let cancelled = false

    const cargarNombreComercial = async () => {
      let empresaId = Number(
        authSession?.user?.app_metadata?.empresa_id
        ?? authSession?.user?.user_metadata?.empresa_id
        ?? user?.empresa_id
        ?? 0,
      )

      if (!(empresaId > 0)) {
        const j = empresaIdDesdeJwtUsuario(authSession?.user)
        if (j) empresaId = j
      }

      if (!(empresaId > 0)) {
        const { data: sess2 } = await supabase.auth.getSession()
        const j2 = empresaIdDesdeJwtUsuario(sess2?.session?.user)
        if (j2) empresaId = j2
      }

      if (!(empresaId > 0)) {
        const hint = Number(user?.empresa_id) > 0 ? Number(user.empresa_id) : null
        let q = supabase.from('profiles').select('empresa_id').eq('id', uid)
        if (hint) q = q.eq('empresa_id', hint)
        const { data: perfil, error: errP } = await q.maybeSingle()
        if (cancelled) return
        if (errP || perfil?.empresa_id == null || Number(perfil.empresa_id) <= 0) {
          setNombreEmpresaBD(null)
          // No bloquear la app: marca blanca cae al nombre en sesión / default
          setNombreEmpresaError(null)
          return
        }
        empresaId = Number(perfil.empresa_id)
      }

      if (!(empresaId > 0)) {
        if (!cancelled) {
          setNombreEmpresaBD(null)
          setNombreEmpresaError('No se pudo determinar la empresa de tu perfil.')
        }
        return
      }

      const { data: emp, error: errE } = await supabase
        .from('empresas')
        .select('nombre_comercial')
        .eq('id', empresaId)
        .maybeSingle()

      if (cancelled) return
      if (errE || !emp?.nombre_comercial) {
        setNombreEmpresaBD(null)
        setNombreEmpresaError('No se pudo cargar el nombre comercial de la empresa.')
        return
      }

      setNombreEmpresaError(null)
      setNombreEmpresaBD(String(emp.nombre_comercial).trim())
    }

    cargarNombreComercial()
    return () => { cancelled = true }
  }, [
    authSession?.user?.id,
    authSession?.user?.app_metadata?.empresa_id,
    authSession?.user?.user_metadata?.empresa_id,
    user?.empresa_id,
  ])

  const esAdmin    = esUsuarioAdmin(user)
  const esGestoria = esUsuarioGestoria(user)
  // Prioridad: BD (empresas) → caché sesión → marca por defecto (nunca cadena vacía salvo error explícito arriba)
  const nombreMarcaFallback = (user?.nombre_comercial && String(user.nombre_comercial).trim())
    || (user?.nombre_app && String(user.nombre_app).trim())
    || NOMBRE_APP_DEFAULT
  const nombreMarca = nombreEmpresaBD || nombreMarcaFallback
  // Logo dinámico: logo_url de la empresa (BD) → favicon_url de sesión → sin imagen (solo nombre)
  const logoSrc = user?.logo_url || user?.favicon_url || null

  const menuItems = useMemo(() => {
    // Paths relativos (sin "/" inicial) para resolver bajo /:slug.
    const base = [
      { path: 'dashboard',              icon: LayoutDashboard, label: 'PANEL DE CONTROL' },
      { path: 'clientes',               icon: Users,           label: 'CLIENTES' },
      { path: 'notas',                  icon: Briefcase,       label: 'NOTAS DE TRABAJO' },
      { path: 'expedientes',            icon: FileText,        label: `EXPEDIENTES ${ejercicioActual}` },
      { path: 'proveedores',            icon: Truck,           label: 'PROVEEDORES' },
      { path: 'planning',               icon: Calendar,        label: `PLANNING ${ejercicioActual}` },
      { path: 'crm',                    icon: Plane,           label: 'CRM / CAPTACIÓN' },
      { path: 'composer',               icon: Edit3,           label: 'COMPOSER' },
      { path: 'cierres',                icon: Calculator,      label: 'CIERRES' },
    ]

    if (puedeAccederCierresEconomicos(user)) {
      base.push({ path: 'historial-cierres', icon: History, label: 'CIERRES ECONÓMICOS' })
    }
    if (!esGestoria) {
      base.push({ path: 'gestion-equipo', icon: UserCog, label: 'GESTIÓN DE EQUIPO' })
    }
    if (puedeAccederAdminMaster(user)) {
      base.push({ path: 'admin-master', icon: Shield, label: 'PANEL MASTER' })
    }

    // Gestor?a: filtrar solo secciones autorizadas.
    if (esGestoria) {
      const permitidas = new Set(['cierres', 'historial-cierres', 'proveedores', 'crm'])
      return base.filter(item => permitidas.has(item.path))
    }
    return base
  }, [ejercicioActual, esAdmin, esGestoria, user])

  // Suscripci?n vencida: pantalla dedicada (consulta directa a empresas).
  useEffect(() => {
    const uid = authSession?.user?.id
    if (!uid) return
    if (location.pathname === '/suscripcion-expirada') return
    let cancelled = false

    // Prioridad: JWT metadata ? prop user ? null. Sin fallback a 1 para evitar
    // que un Tenant con JWT sin empresa_id chequee la suscripci?n de Tabora.
    const empresaId = Number(
      authSession?.user?.app_metadata?.empresa_id ||
      authSession?.user?.user_metadata?.empresa_id ||
      user?.empresa_id ||
      0
    ) || null

    if (!empresaId) return

    supabase
      .from('empresas')
      .select('suscripcion_activa, fecha_expiracion')
      .eq('id', empresaId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return
        const expirada =
          data.suscripcion_activa === false ||
          (data.fecha_expiracion && new Date(data.fecha_expiracion) < new Date())
        if (expirada) navigate('/suscripcion-expirada', { replace: true })
      })

    return () => { cancelled = true }
  }, [authSession?.user?.id, location.pathname, navigate, user?.empresa_id])

  // Si la agencia est? marcada inactiva en BD, cortar sesi?n (consulta directa a empresas).
  useEffect(() => {
    const uid = authSession?.user?.id
    if (!uid) return
    if (location.pathname === '/suscripcion-expirada') return
    let cancelled = false

    // Sin fallback a 1: si el JWT no trae empresa_id no comprobamos la empresa de Tabora.
    const empresaId = Number(
      authSession?.user?.app_metadata?.empresa_id ||
      authSession?.user?.user_metadata?.empresa_id ||
      user?.empresa_id ||
      0
    ) || null

    if (!empresaId) return

    supabase
      .from('empresas')
      .select('activa')
      .eq('id', empresaId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return
        if (data.activa === false) {
          window.alert('Tu agencia est? desactivada. Contacta con soporte.')
          onLogout?.()
        }
      })

    return () => { cancelled = true }
  }, [authSession?.user?.id, location.pathname, onLogout, user?.empresa_id])

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-slate-800 text-white transition-all duration-300 flex flex-col`}>
        <div className="border-b border-slate-700">
          <div className="flex items-center justify-between p-4">
            {sidebarOpen && (
              <div className="flex flex-col items-center justify-center flex-1 py-6 px-4 gap-2">
                {logoSrc && (
                  <img src={logoSrc} alt={nombreMarca} className="h-12 w-auto object-contain" />
                )}
                {nombreEmpresaError ? (
                  <p className="text-center text-[11px] font-medium text-amber-300 leading-snug px-1">
                    {nombreEmpresaError}
                  </p>
                ) : (
                  <p className="text-center text-xs font-semibold text-slate-300 tracking-wide">{nombreMarca}</p>
                )}
              </div>
            )}
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 hover:bg-slate-700 rounded">
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          {menuItems.map((item) => (
            <NavLink key={item.path} to={item.path} className={({ isActive }) => `flex items-center px-4 py-3 transition-colors ${isActive ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}>
              <item.icon size={22} className={sidebarOpen ? 'mr-3' : 'mx-auto'} />
              {sidebarOpen && <span className="text-sm font-medium uppercase tracking-wide">{item.label}</span>}
            </NavLink>
          ))}
          {onLogout && (
            <button
              onClick={() => {
                onLogout()
              }}
              className="flex items-center px-4 py-3 w-full text-slate-400 hover:bg-slate-700 hover:text-white transition-colors mt-1 border-t border-slate-700"
            >
              <LogOut size={22} className={sidebarOpen ? 'mr-3' : 'mx-auto'} />
              {sidebarOpen && <span className="text-sm font-medium uppercase tracking-wide">CERRAR SESIÓN</span>}
            </button>
          )}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout;