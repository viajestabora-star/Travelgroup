import React, { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
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
  Truck 
} from 'lucide-react'

const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const ejercicioActual = new Date().getFullYear() // Año automático sin errores de utils

  const menuItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/clientes', icon: Users, label: 'Gestión de Clientes' },
    { path: '/notas', icon: Briefcase, label: 'NOTAS DE TRABAJO' },
    { path: '/expedientes', icon: FileText, label: `Gestión ${ejercicioActual}` },
    { path: '/proveedores', icon: Truck, label: 'Proveedores' },
    { path: '/planning', icon: Calendar, label: `Planning ${ejercicioActual}` },
    { path: '/crm', icon: Plane, label: 'CRM / Captación' },
    { path: '/cierres', icon: Calculator, label: 'Cierres' }
  ]

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-slate-800 text-white transition-all duration-300 flex flex-col`}>
        <div className="p-4 flex justify-between items-center border-b border-slate-700">
          {sidebarOpen && <span className="font-bold text-xl text-sky-400">TABORA ERP</span>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 hover:bg-slate-700 rounded">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
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