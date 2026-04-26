import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { registrarSalidaOnUnload, heartbeatSalidaById } from '../utils/controlHorario'
import { 
  LayoutDashboard, Users, Calculator, Calendar, Briefcase, 
  FileText, Menu, X, Plane, Truck, Edit3, History, TrendingUp, LogOut, UserCog, Shield, KeyRound
} from 'lucide-react'
import { getEjercicioActual, subscribeToEjercicioChanges } from '../utils/ejercicioGlobal'
import { esUsuarioGestoria, puedeAccederCierresEconomicos, esUsuarioAdmin } from '../utils/userRoles'
import { puedeAccederAdminMaster } from '../utils/adminMasterAccess'
import CuentaPasswordModal from './CuentaPasswordModal'
import { NOMBRE_APP_DEFAULT } from '../utils/marcaBlanca'
import { asegurarVinculacionEmpleado } from '../utils/empleadosVinculacion'

const HEARTBEAT_INTERVAL_MS = 1800000
const STORAGE_ATTENDANCE_ID = 'attendance_id'

const Layout = ({ user, onLogout }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [ejercicioActual, setEjercicioActual] = useState(getEjercicioActual())
  const [authSession, setAuthSession] = useState(null)
  const [cuentaModalOpen, setCuentaModalOpen] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState(null)
  const currentSessionIdRef = useRef(null)
  const isProcessing = useRef(false)
  // Nombre de empresa siempre fresco desde empresas.nombre_comercial (no desde caché de sesión)
  const [nombreEmpresaBD, setNombreEmpresaBD] = useState(null)

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

  // CONTROL HORARIO - Orden l?gico estricto para evitar duplicados al refrescar
  useEffect(() => {
    const sessionEmail = authSession?.user?.email || user?.email
    if (!sessionEmail) return

    const activeId = sessionStorage.getItem(STORAGE_ATTENDANCE_ID)
    if (activeId) {
      setCurrentSessionId(activeId)
      currentSessionIdRef.current = activeId
      const handleUnload = () => {
        if (currentSessionIdRef.current) registrarSalidaOnUnload(currentSessionIdRef.current)
      }
      window.addEventListener('beforeunload', handleUnload)
      return () => window.removeEventListener('beforeunload', handleUnload)
    }
    if (isProcessing.current) return

    isProcessing.current = true

    const ejecutarRegistro = async () => {
      // Envuelto en try-catch silencioso: un fallo de RLS en control_horario
      // (p.ej. pol?tica no aplicada a?n) NO debe bloquear ning?n flujo del ERP.
      try {
        const hoy = new Date()
        const fechaDDMMYYYY = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`
        const horaEntrada = hoy.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

        const { data, error } = await supabase
          .from('control_horario')
          .insert([{
            usuario_id: user?.id ?? null,
            user_email: sessionEmail,
            fecha: fechaDDMMYYYY,
            hora_entrada: horaEntrada
          }])
          .select('id')
          .single()

        if (error) {
          // Error no cr?tico ? el finally libera isProcessing; no se propaga
          return
        }
        if (data?.id) {
          sessionStorage.setItem(STORAGE_ATTENDANCE_ID, data.id)
          setCurrentSessionId(data.id)
          currentSessionIdRef.current = data.id
        }
      } catch (_) {
        // Silencioso: cualquier excepci?n en control_horario es no cr?tica
      } finally {
        isProcessing.current = false
      }
    }

    ejecutarRegistro()

    const handleUnload = () => {
      if (currentSessionIdRef.current) registrarSalidaOnUnload(currentSessionIdRef.current)
    }
    window.addEventListener('beforeunload', handleUnload)

    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [authSession?.user?.email, user?.email])

  // Latido 30 min (1.800.000 ms): no actualiza hora_salida antes de ese tiempo
  useEffect(() => {
    if (!currentSessionId) return

    const intervalId = setInterval(() => {
      heartbeatSalidaById(currentSessionId)
    }, HEARTBEAT_INTERVAL_MS)

    return () => clearInterval(intervalId)
  }, [currentSessionId])

  useEffect(() => {
    const unsubscribe = subscribeToEjercicioChanges((nuevoEjercicio) => {
      setEjercicioActual(nuevoEjercicio)
    })
    return unsubscribe
  }, [])

  // Fetch de nombre_comercial siempre desde empresas (no depende de la caché de sesión).
  // Se dispara cuando tenemos empresa_id confirmado (de la sesión o del JWT).
  useEffect(() => {
    const empresaId = Number(
      authSession?.user?.app_metadata?.empresa_id
      ?? user?.empresa_id
      ?? 0,
    ) || null
    if (!empresaId) return
    let cancelled = false
    supabase
      .from('empresas')
      .select('nombre_comercial')
      .eq('id', empresaId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.nombre_comercial) {
          setNombreEmpresaBD(String(data.nombre_comercial).trim())
        }
      })
    return () => { cancelled = true }
  }, [authSession?.user?.id, user?.empresa_id])

  const esAdmin    = esUsuarioAdmin(user)
  const esGestoria = esUsuarioGestoria(user)
  // Prioridad: BD (siempre fresca) → sesión (nombre_comercial o nombre_app) → default
  const nombreMarca = nombreEmpresaBD
    || (user?.nombre_comercial && String(user.nombre_comercial).trim() ? String(user.nombre_comercial).trim() : null)
    || (user?.nombre_app && String(user.nombre_app).trim() ? String(user.nombre_app).trim() : NOMBRE_APP_DEFAULT)
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
    if (esAdmin || esGestoria) {
      base.push({ path: 'inteligencia-economica', icon: TrendingUp, label: 'INTELIGENCIA ECONÓMICA' })
    }
    if (!esGestoria) {
      base.push({ path: 'gestion-equipo', icon: UserCog, label: 'GESTIÓN DE EQUIPO' })
    }
    if (puedeAccederAdminMaster(user)) {
      base.push({ path: 'admin-master', icon: Shield, label: 'PANEL MASTER' })
    }

    // Gestor?a: filtrar solo secciones autorizadas.
    if (esGestoria) {
      const permitidas = new Set(['cierres', 'historial-cierres', 'proveedores', 'inteligencia-economica', 'crm'])
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
          sessionStorage.removeItem(STORAGE_ATTENDANCE_ID)
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
                <p className="text-center text-xs font-semibold text-slate-300 tracking-wide">{nombreMarca}</p>
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
          <button
            type="button"
            onClick={() => setCuentaModalOpen(true)}
            className="flex items-center px-4 py-3 w-full text-slate-400 hover:bg-slate-700 hover:text-white transition-colors mt-2"
          >
            <KeyRound size={22} className={sidebarOpen ? 'mr-3' : 'mx-auto'} />
            {sidebarOpen && <span className="text-sm font-medium uppercase tracking-wide">CUENTA</span>}
          </button>
          {onLogout && (
            <button
              onClick={() => {
                sessionStorage.removeItem(STORAGE_ATTENDANCE_ID)
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
      <CuentaPasswordModal
        open={cuentaModalOpen}
        onClose={() => setCuentaModalOpen(false)}
        tieneSesionSupabase={!!authSession?.user}
      />
    </div>
  )
}

export default Layout;