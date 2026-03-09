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
const STORAGE_KEY_FECHA = 'control_horario_fecha_validada'
const EMAILS_CONTROL_HORARIO = ['andres@viajestabora.com', 'info@viajestabora.com', 'grupos@viajestabora.com']

const formatFechaYYYYMMDD = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const formatHoraHHmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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

  // CONTROL HORARIO - BLOQUE UNIFICADO (fuerza bruta: busca siempre, insert inmediato si no existe)
  useEffect(() => {
    if (!user?.email) return;

    const gestionarFichaje = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const usuarioId = session.user.id;
        const userEmail = String(session.user.email || '').trim().toLowerCase();
        if (!userEmail) return;
        if (!EMAILS_CONTROL_HORARIO.includes(userEmail)) return;

        const ahora = new Date();
        const f_actual = formatFechaYYYYMMDD(ahora);
        const horaEntradaValor = `${f_actual} ${formatHoraHHmm(ahora)}:00`;

        const { data: existe, error: errExiste } = await supabase
          .from('control_horario')
          .select('id')
          .eq('user_email', userEmail)
          .eq('fecha', f_actual)
          .maybeSingle();

        if (errExiste) {
          console.error('ERROR DB:', errExiste);
          return;
        }

        if (!existe) {
          const { data: nuevo, error: errInsert } = await supabase
            .from('control_horario')
            .insert([{
              usuario_id: usuarioId,
              user_email: userEmail,
              fecha: f_actual,
              hora_entrada: horaEntradaValor
            }])
            .select('id')
            .single();

          if (errInsert) {
            console.error('ERROR DB:', errInsert);
            return;
          }
          if (nuevo?.id) {
            sessionStorage.setItem('control_horario_entrada_id', nuevo.id);
            sessionStorage.setItem(STORAGE_KEY_FECHA, f_actual);
          }
        } else {
          sessionStorage.setItem('control_horario_entrada_id', existe.id);
          sessionStorage.setItem(STORAGE_KEY_FECHA, f_actual);
        }
      } catch (err) {
        console.error('ERROR DB:', err);
      }
    };

    gestionarFichaje();

    const intervalId = setInterval(() => {
      const entradaId = sessionStorage.getItem('control_horario_entrada_id');
      if (entradaId) heartbeatSalida();
    }, HEARTBEAT_INTERVAL_MS);

    const handleUnload = () => {
      const entradaId = sessionStorage.getItem('control_horario_entrada_id');
      if (entradaId) registrarSalidaOnUnload();
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [user?.email]);

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