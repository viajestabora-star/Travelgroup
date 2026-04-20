import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { supabase } from '../supabase'
import { registrarSalidaOnUnload, heartbeatSalidaById } from '../utils/controlHorario'
import { 
  LayoutDashboard, Users, Calculator, Calendar, Briefcase, 
  FileText, Menu, X, Plane, Truck, Edit3, History, TrendingUp, LogOut
} from 'lucide-react'
import { getEjercicioActual, subscribeToEjercicioChanges } from '../utils/ejercicioGlobal'
import { esUsuarioGestoria, puedeAccederCierresEconomicos, esUsuarioAdmin } from '../utils/userRoles'

const HEARTBEAT_INTERVAL_MS = 1800000
const STORAGE_ATTENDANCE_ID = 'attendance_id'
const LOGO_TABORA = "https://gtwyqxfkpdwpakmgrkbu.supabase.co/storage/v1/object/public/branding/Logo%20tabora%202023.png"

const Layout = ({ user, onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [ejercicioActual, setEjercicioActual] = useState(getEjercicioActual())
  const [authSession, setAuthSession] = useState(null)
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
    // Gestoría: filtrar solo secciones autorizadas
    if (esGestoria) {
      const permitidas = new Set(['/cierres', '/historial-cierres', '/proveedores', '/inteligencia-economica'])
      return base.filter(item => permitidas.has(item.path))
    }
    return base
  }, [ejercicioActual, esAdmin, esGestoria, user])

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-slate-800 text-white transition-all duration-300 flex flex-col`}>
        <div className="border-b border-slate-700">
          <div className="flex items-center justify-between p-4">
            {sidebarOpen && (
              <div className="flex items-center justify-center flex-1 py-8 px-4">
                <img src={LOGO_TABORA} alt="Tabora" className="h-14 w-auto object-contain" />
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
          {onLogout && (
            <button
              onClick={() => {
                sessionStorage.removeItem(STORAGE_ATTENDANCE_ID)
                onLogout()
              }}
              className="flex items-center px-4 py-3 w-full text-slate-400 hover:bg-slate-700 hover:text-white transition-colors mt-4 border-t border-slate-700"
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
    </div>
  )
}

export default Layout;