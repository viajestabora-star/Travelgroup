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
const LOGO_TABORA = "https://gtwyqxfkpdwpakmgrkbu.supabase.co/storage/v1/object/public/branding/Logo%20tabora%202023.png"

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setAuthSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setAuthSession(session))
    return () => subscription?.unsubscribe()
  }, [])

  // Garantiza que el JWT incluya app_metadata.empresa_id para usuarios autenticados.
  useEffect(() => {
    const asegurarEmpresaIdEnToken = async () => {
      const userId = authSession?.user?.id
      if (!userId) return
      const empresaIdActual = Number(authSession?.user?.app_metadata?.empresa_id ?? 0)
      if (empresaIdActual > 0) return

      const { error } = await supabase.rpc('ensure_empresa_id_claim', { p_empresa_id: 1 })
      if (error) {
        console.warn('[Auth] No se pudo asegurar empresa_id en app_metadata:', error.message)
        return
      }

      // Refresca token para que el claim actualizado esté disponible en el JWT actual.
      const { data, error: refreshError } = await supabase.auth.refreshSession()
      if (!refreshError && data?.session) setAuthSession(data.session)
    }

    asegurarEmpresaIdEnToken()
  }, [authSession?.user?.id, authSession?.user?.app_metadata?.empresa_id])

  // Check de vinculación global: no bloquea acceso; asegura fila en empleados para @viajestabora.com.
  useEffect(() => {
    const authUser = authSession?.user
    if (!authUser?.id) return
    asegurarVinculacionEmpleado({ authUser, appUser: user }).catch(() => {})
  }, [authSession?.user?.id, authSession?.user?.email, user])

  // CONTROL HORARIO - Orden lógico estricto para evitar duplicados al refrescar
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
        console.error('[Control Horario]', error.message)
        isProcessing.current = false
        return
      }
      if (data?.id) {
        sessionStorage.setItem(STORAGE_ATTENDANCE_ID, data.id)
        setCurrentSessionId(data.id)
        currentSessionIdRef.current = data.id
      }
      isProcessing.current = false
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

  const esAdmin    = esUsuarioAdmin(user)
  const esGestoria = esUsuarioGestoria(user)
  const nombreMarca = user?.nombre_app && String(user.nombre_app).trim() ? String(user.nombre_app).trim() : NOMBRE_APP_DEFAULT

  const menuItems = useMemo(() => {
    const base = [
      { path: '/dashboard',         icon: LayoutDashboard, label: 'Panel de Control' },
      { path: '/clientes',          icon: Users,           label: 'Clientes' },
      { path: '/notas',             icon: Briefcase,       label: 'NOTAS DE TRABAJO' },
      { path: '/expedientes',       icon: FileText,        label: `Expedientes ${ejercicioActual}` },
      { path: '/proveedores',       icon: Truck,           label: 'Proveedores' },
      { path: '/planning',          icon: Calendar,        label: `Planning ${ejercicioActual}` },
      { path: '/crm',               icon: Plane,           label: 'CRM / Captación' },
      { path: '/composer',             icon: Edit3,      label: 'Composer' },
      { path: '/cierres',              icon: Calculator, label: 'Cierres' },
    ]
    if (puedeAccederCierresEconomicos(user)) {
      base.push({ path: '/historial-cierres', icon: History, label: 'Cierres Económicos' })
    }
    if (esAdmin || esGestoria) {
      base.push({ path: '/inteligencia-economica', icon: TrendingUp, label: 'Inteligencia Económica' })
    }
    if (esAdmin) {
      base.push({ path: '/gestion-equipo', icon: UserCog, label: 'Gestión de Equipo' })
    }
    if (puedeAccederAdminMaster(user)) {
      base.push({ path: '/admin-master', icon: Shield, label: 'Panel Master' })
    }
    // Gestoría: filtrar solo secciones autorizadas
    if (esGestoria) {
      const permitidas = new Set(['/cierres', '/historial-cierres', '/proveedores', '/inteligencia-economica', '/crm'])
      return base.filter(item => permitidas.has(item.path))
    }
    return base
  }, [ejercicioActual, esAdmin, esGestoria, user])

  // Suscripción vencida: pantalla dedicada (no datos del ERP).
  useEffect(() => {
    const uid = authSession?.user?.id
    if (!uid) return
    if (location.pathname === '/suscripcion-expirada') return
    let cancelled = false
    supabase.rpc('mi_empresa_suscripcion_vigente').then(({ data, error }) => {
      if (cancelled || error) return
      if (data === false) {
        navigate('/suscripcion-expirada', { replace: true })
      }
    })
    return () => {
      cancelled = true
    }
  }, [authSession?.user?.id, location.pathname, navigate])

  // Si la agencia está marcada inactiva en BD, cortar sesión Supabase.
  useEffect(() => {
    const uid = authSession?.user?.id
    if (!uid) return
    if (location.pathname === '/suscripcion-expirada') return
    let cancelled = false
    supabase.rpc('mi_empresa_activa').then(({ data, error }) => {
      if (cancelled || error) return
      if (data === false) {
        window.alert('Tu agencia está desactivada. Contacta con soporte.')
        sessionStorage.removeItem(STORAGE_ATTENDANCE_ID)
        onLogout?.()
      }
    })
    return () => {
      cancelled = true
    }
  }, [authSession?.user?.id, location.pathname, onLogout])

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-slate-800 text-white transition-all duration-300 flex flex-col`}>
        <div className="border-b border-slate-700">
          <div className="flex items-center justify-between p-4">
            {sidebarOpen && (
              <div className="flex flex-col items-center justify-center flex-1 py-6 px-4 gap-2">
                <img src={LOGO_TABORA} alt={nombreMarca} className="h-12 w-auto object-contain" />
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
              {sidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setCuentaModalOpen(true)}
            className="flex items-center px-4 py-3 w-full text-slate-400 hover:bg-slate-700 hover:text-white transition-colors mt-2"
          >
            <KeyRound size={22} className={sidebarOpen ? 'mr-3' : 'mx-auto'} />
            {sidebarOpen && <span className="text-sm font-medium">Cuenta</span>}
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
              {sidebarOpen && <span className="text-sm font-medium">Cerrar sesión</span>}
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