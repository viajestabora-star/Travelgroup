import React, { useState, useEffect, useMemo } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { supabase } from '../supabase'
import { registrarSalidaOnUnload, heartbeatSalida } from '../utils/controlHorario'
import { 
  LayoutDashboard, Users, Calculator, Calendar, Briefcase, 
  FileText, Menu, X, Plane, Truck, Edit3, History, TrendingUp, LogOut 
} from 'lucide-react'
import { getEjercicioActual, subscribeToEjercicioChanges } from '../utils/ejercicioGlobal'

const HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000
const STORAGE_KEY_ENTRADA = 'control_horario_entrada_id'
const STORAGE_KEY_FECHA = 'control_horario_fecha_validada'
const EMAILS_CONTROL_HORARIO = ['andres@viajestabora.com', 'info@viajestabora.com', 'grupos@viajestabora.com']
const LOGO_TABORA = "https://gtwyqxfkpdwpakmgrkbu.supabase.co/storage/v1/object/public/branding/Logo%20tabora%202023.png"

const Layout = ({ user, onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [ejercicioActual, setEjercicioActual] = useState(getEjercicioActual())

  useEffect(() => {
    const unsubscribe = subscribeToEjercicioChanges((nuevoEjercicio) => {
      setEjercicioActual(nuevoEjercicio)
    })
    return unsubscribe
  }, [])

  // CONTROL HORARIO - Registro único por día, sesión existente, formatos en-CA/es-ES
  useEffect(() => {
    const ejecutarRegistro = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email?.trim()?.toLowerCase() || '';
      const usuarioId = session?.user?.id || null;

      if (!email || !usuarioId) return;
      if (!EMAILS_CONTROL_HORARIO.includes(email)) return;

      const ahora = new Date();
      const f_actual = ahora.toLocaleDateString('en-CA');
      const h_actual = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

      try {
        const { data: existe, error: errExiste } = await supabase
          .from('control_horario')
          .select('id')
          .eq('user_email', email)
          .eq('fecha', f_actual)
          .maybeSingle();

        if (errExiste) {
          console.log('[Control Horario] Error buscar:', errExiste.code, errExiste.message);
          return;
        }

        if (!existe) {
          const { data: nuevo, error: errInsert } = await supabase
            .from('control_horario')
            .insert([{
              fecha: f_actual,
              hora_entrada: h_actual,
              user_email: email,
              usuario_id: usuarioId
            }])
            .select('id')
            .single();

          if (errInsert) {
            console.log('[Control Horario] Error insert:', errInsert.code, errInsert.message);
            return;
          }
          if (nuevo?.id) {
            localStorage.setItem(STORAGE_KEY_ENTRADA, nuevo.id);
            localStorage.setItem(STORAGE_KEY_FECHA, f_actual);
            console.log('[Control Horario] Registro creado para:', email);
          }
        } else {
          localStorage.setItem(STORAGE_KEY_ENTRADA, existe.id);
          localStorage.setItem(STORAGE_KEY_FECHA, f_actual);
        }
      } catch (err) {
        console.log('[Control Horario] Excepción:', err?.message);
      }
    };

    ejecutarRegistro();

    const intervalId = setInterval(() => {
      const entradaId = localStorage.getItem(STORAGE_KEY_ENTRADA);
      if (entradaId) heartbeatSalida();
    }, HEARTBEAT_INTERVAL_MS);

    const handleUnload = () => {
      const entradaId = localStorage.getItem(STORAGE_KEY_ENTRADA);
      if (entradaId) registrarSalidaOnUnload();
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, []);

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
            <button onClick={onLogout} className="flex items-center px-4 py-3 w-full text-slate-400 hover:bg-slate-700 hover:text-white transition-colors mt-4 border-t border-slate-700">
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