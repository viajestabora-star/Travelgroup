import React, { useState, useEffect, useMemo } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { supabase } from '../supabase'
import { registrarSalidaOnUnload, heartbeatSalida } from '../utils/controlHorario'
import { 
  LayoutDashboard, 
  Users, 
  Calculator, 
  Calendar, 
  Briefcase, 
  FileText, 
  Menu, 
  X, 
  Plane, 
  Truck,
  Edit3,
  History,
  TrendingUp,
  LogOut
} from 'lucide-react'
import { getEjercicioActual, subscribeToEjercicioChanges } from '../utils/ejercicioGlobal'

const HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000
const STORAGE_KEY_FECHA = 'control_horario_fecha_validada'

// Logo Tabora - URL oficial
const LOGO_TABORA = "https://gtwyqxfkpdwpakmgrkbu.supabase.co/storage/v1/object/public/branding/Logo%20tabora%202023.png"

const Layout = ({ user, onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [ejercicioActual, setEjercicioActual] = useState(getEjercicioActual())

  // Sincronizar con cambios globales del ejercicio
  useEffect(() => {
    const unsubscribe = subscribeToEjercicioChanges((nuevoEjercicio) => {
      setEjercicioActual(nuevoEjercicio)
    })
    return unsubscribe
  }, [])

  // Control horario: registro silencioso para TODOS los usuarios autenticados
  useEffect(() => {
    const init = async () => {
      try {
        await new Promise((r) => setTimeout(r, 0))

        const { data: authData } = await supabase.auth.getSession()
        let session = authData?.session
        if (!session?.user) {
          const { data: { user: authUser } } = await supabase.auth.getUser()
          if (!user?.email) return
          session = { user: { id: authUser?.id ?? user?.id ?? null, email: user.email } }
        }
        if (!session?.user || !session.user.email) return

        const hoy = new Date().toISOString().split('T')[0]
        if (sessionStorage.getItem(STORAGE_KEY_FECHA) === hoy && sessionStorage.getItem('control_horario_entrada_id')) return

        let query = supabase.from('control_horario').select('id').eq('fecha', hoy)
        if (session.user.id) {
          query = query.eq('usuario_id', session.user.id)
        } else {
          query = query.eq('user_email', session.user.email.toLowerCase())
        }
        const { data: existe, error: errExiste } = await query.maybeSingle()

        if (errExiste) {
          console.error('Detalle error:', errExiste)
          return
        }

        if (!existe) {
          const ahora = new Date().toISOString()
          const payload = {
            usuario_id: session.user.id ?? null,
            user_email: session.user.email,
            fecha: hoy,
            hora_entrada: ahora,
          }
          const { data: inserted, error: errInsert } = await supabase.from('control_horario').insert([payload]).select('id').single()

          if (errInsert) {
            console.error('Detalle error:', errInsert)
            return
          }
          if (inserted?.id) {
            sessionStorage.setItem('control_horario_entrada_id', inserted.id)
            sessionStorage.setItem(STORAGE_KEY_FECHA, hoy)
          }
        } else {
          sessionStorage.setItem('control_horario_entrada_id', existe.id)
          sessionStorage.setItem(STORAGE_KEY_FECHA, hoy)
        }
      } catch (err) {
        console.error('[control_horario] Error inesperado:', err)
        console.dir(err)
      }
    }
    init()
  }, [user])

  useEffect(() => {
    if (!user?.email) return
    window.addEventListener('beforeunload', registrarSalidaOnUnload)
    return () => window.removeEventListener('beforeunload', registrarSalidaOnUnload)
  }, [user?.email])

  useEffect(() => {
    if (!user?.email) return
    const id = setInterval(heartbeatSalida, HEARTBEAT_INTERVAL_MS)
    return () => clearInterval(id)
  }, [user?.email])

  // Recalcular menuItems cuando cambie el ejercicio. Inteligencia Económica solo para ADMIN, al final.
  const esAdmin = user?.rol === 'ADMIN'
  const menuItems = useMemo(() => {
    const base = [
      { path: '/dashboard', icon: LayoutDashboard, label: 'Panel de Control' },
      { path: '/clientes', icon: Users, label: 'Clientes' },
      { path: '/notas', icon: Briefcase, label: 'NOTAS DE TRABAJO' },
      { path: '/expedientes', icon: FileText, label: `Expedientes ${ejercicioActual}` },
      { path: '/proveedores', icon: Truck, label: 'Proveedores' },
      { path: '/planning', icon: Calendar, label: `Planning ${ejercicioActual}` },
      { path: '/crm', icon: Plane, label: 'CRM / Captación' },
      { path: '/composer', icon: Edit3, label: 'Composer' },
      { path: '/cierres', icon: Calculator, label: 'Cierres' },
      { path: '/historial-cierres', icon: History, label: 'Historial de Cierres' }
    ]
    if (esAdmin) {
      base.push({ path: '/inteligencia-economica', icon: TrendingUp, label: 'Inteligencia Económica' })
    }
    return base
  }, [ejercicioActual, esAdmin])

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-slate-800 text-white transition-all duration-300 flex flex-col`}>
        <div className="border-b border-slate-700">
          {sidebarOpen ? (
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center justify-center flex-1 py-8 px-4">
                <img src={LOGO_TABORA} alt="Tabora" className="h-14 w-auto object-contain" />
              </div>
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 hover:bg-slate-700 rounded">
                <X size={20} />
              </button>
            </div>
          ) : (
            <div className="p-4 flex justify-center items-center">
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 hover:bg-slate-700 rounded">
                <Menu size={20} />
              </button>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `
                flex items-center px-4 py-3 transition-colors
                ${isActive ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}
              `}
            >
              <item.icon size={22} className={sidebarOpen ? 'mr-3' : 'mx-auto'} />
              {sidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
            </NavLink>
          ))}
          {onLogout && (
            <button
              onClick={onLogout}
              className="flex items-center px-4 py-3 w-full text-slate-400 hover:bg-slate-700 hover:text-white transition-colors mt-4 border-t border-slate-700"
            >
              <LogOut size={22} className={sidebarOpen ? 'mr-3' : 'mx-auto'} />
              {sidebarOpen && <span className="text-sm font-medium">Cerrar sesión</span>}
            </button>
          )}
        </nav>
      </aside>

      {/* Contenido principal */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout