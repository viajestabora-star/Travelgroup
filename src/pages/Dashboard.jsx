import React, { useEffect, useState } from 'react'
import { Users, Calculator, Calendar, TrendingUp, Briefcase, FileText, AlertTriangle, Clock } from 'lucide-react'
import { storage } from '../utils/storage'

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalClientes: 0,
    totalCotizaciones: 0,
    proximosViajes: 0,
    visitasPendientes: 0,
  })
  const [alertasRelease, setAlertasRelease] = useState([])

  useEffect(() => {
    const clientes = storage.getClientes()
    const expedientes = storage.get('expedientes') || []
    const planning = storage.getPlanning()
    const visitas = storage.getVisitas()

    setStats({
      totalClientes: clientes.length,
      totalCotizaciones: expedientes.length,
      proximosViajes: planning.length,
      visitasPendientes: visitas.filter(v => !v.completada).length,
    })

    // Calcular alertas de release
    calcularAlertasRelease(expedientes)
  }, [])

  const calcularAlertasRelease = (expedientes) => {
    const hoy = new Date()
    const alertas = []

    expedientes.forEach(expediente => {
      if (expediente.cotizacion && expediente.cotizacion.servicios) {
        expediente.cotizacion.servicios.forEach(servicio => {
          if (servicio.fechaRelease) {
            const fechaRelease = new Date(servicio.fechaRelease)
            const diferenciaDias = Math.ceil((fechaRelease - hoy) / (1000 * 60 * 60 * 24))

            // Alerta si está entre 0 y 7 días
            if (diferenciaDias >= 0 && diferenciaDias <= 7) {
              alertas.push({
                expediente: expediente.responsable || expediente.destino || 'Sin nombre',
                destino: expediente.destino,
                servicio: servicio.tipo,
                descripcion: servicio.descripcion,
                fechaRelease: servicio.fechaRelease,
                diasRestantes: diferenciaDias,
                urgencia: diferenciaDias <= 2 ? 'alta' : diferenciaDias <= 5 ? 'media' : 'baja'
              })
            }
          }
        })
      }
    })

    // Ordenar por días restantes (más urgentes primero)
    alertas.sort((a, b) => a.diasRestantes - b.diasRestantes)
    setAlertasRelease(alertas)
  }

  const cards = [
    { 
      title: 'Total Clientes', 
      value: stats.totalClientes, 
      icon: Users, 
      color: 'bg-blue-500',
      link: '/clientes'
    },
    { 
      title: 'Expedientes', 
      value: stats.totalCotizaciones, 
      icon: Calculator, 
      color: 'bg-green-500',
      link: '/expedientes'
    },
    { 
      title: 'Próximos Viajes', 
      value: stats.proximosViajes, 
      icon: Calendar, 
      color: 'bg-purple-500',
      link: '/planning'
    },
    { 
      title: 'Visitas Pendientes', 
      value: stats.visitasPendientes, 
      icon: Briefcase, 
      color: 'bg-orange-500',
      link: '/crm'
    },
  ]

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-navy-900 mb-2">Dashboard</h1>
        <p className="text-gray-600">Bienvenido a Viajes Tabora ERP</p>
      </div>

      {/* Alertas de Release */}
      {alertasRelease.length > 0 && (
        <div className="mb-8">
          <div className="card bg-gradient-to-r from-orange-50 to-red-50 border-2 border-orange-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-orange-500 rounded-lg">
                <AlertTriangle className="text-white" size={28} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-orange-900">⚠️ Alertas de Release</h2>
                <p className="text-orange-700">Tienes {alertasRelease.length} servicio(s) próximo(s) a vencer</p>
              </div>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {alertasRelease.map((alerta, index) => {
                const colorUrgencia = alerta.urgencia === 'alta' 
                  ? 'bg-red-100 border-red-400 text-red-900' 
                  : alerta.urgencia === 'media' 
                  ? 'bg-orange-100 border-orange-400 text-orange-900' 
                  : 'bg-yellow-100 border-yellow-400 text-yellow-900'
                
                const iconoUrgencia = alerta.urgencia === 'alta'
                  ? '🔴'
                  : alerta.urgencia === 'media'
                  ? '🟠'
                  : '🟡'

                return (
                  <div key={index} className={`p-4 rounded-lg border-2 ${colorUrgencia} flex items-start gap-3`}>
                    <div className="text-2xl">{iconoUrgencia}</div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-bold text-lg">{alerta.expediente}</h3>
                        <span className="flex items-center gap-1 font-bold">
                          <Clock size={16} />
                          {alerta.diasRestantes === 0 ? '¡HOY!' : alerta.diasRestantes === 1 ? 'Mañana' : `${alerta.diasRestantes} días`}
                        </span>
                      </div>
                      <p className="text-sm mb-1">
                        <span className="font-semibold">Destino:</span> {alerta.destino}
                      </p>
                      <p className="text-sm mb-1">
                        <span className="font-semibold">Servicio:</span> {alerta.servicio} - {alerta.descripcion}
                      </p>
                      <p className="text-sm">
                        <span className="font-semibold">Fecha Release:</span> {new Date(alerta.fechaRelease).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {cards.map((card) => (
          <div key={card.title} className="card hover:shadow-xl transition-shadow cursor-pointer">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm mb-1">{card.title}</p>
                <h3 className="text-3xl font-bold text-navy-900">{card.value}</h3>
              </div>
              <div className={`${card.color} p-3 rounded-lg`}>
                <card.icon className="text-white" size={24} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Access */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="card">
          <h2 className="text-xl font-bold text-navy-900 mb-4 flex items-center gap-2">
            <TrendingUp size={24} />
            Actividad Reciente
          </h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <p className="text-sm text-gray-700">Sistema iniciado correctamente</p>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <p className="text-sm text-gray-700">Datos cargados desde archivos CSV</p>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
              <p className="text-sm text-gray-700">LocalStorage configurado</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <h2 className="text-xl font-bold text-navy-900 mb-4">Acciones Rápidas</h2>
          <div className="space-y-3">
            <a href="/expedientes" className="flex items-center gap-3 p-4 bg-navy-50 hover:bg-navy-100 rounded-lg transition-colors">
              <Calculator className="text-navy-700" size={20} />
              <span className="font-medium text-navy-900">Nuevo Expediente</span>
            </a>
            <a href="/clientes" className="flex items-center gap-3 p-4 bg-navy-50 hover:bg-navy-100 rounded-lg transition-colors">
              <Users className="text-navy-700" size={20} />
              <span className="font-medium text-navy-900">Gestionar Clientes</span>
            </a>
            <a href="/planning" className="flex items-center gap-3 p-4 bg-navy-50 hover:bg-navy-100 rounded-lg transition-colors">
              <Calendar className="text-navy-700" size={20} />
              <span className="font-medium text-navy-900">Ver Planning 2026</span>
            </a>
            <a href="/cierres" className="flex items-center gap-3 p-4 bg-navy-50 hover:bg-navy-100 rounded-lg transition-colors">
              <FileText className="text-navy-700" size={20} />
              <span className="font-medium text-navy-900">Cierre de Grupo</span>
            </a>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="mt-8 card bg-gradient-to-r from-navy-700 to-navy-900 text-white">
        <h3 className="text-xl font-bold mb-2">Viajes Tabora ERP - Sistema Completo</h3>
        <p className="text-navy-100">
          Gestiona tus clientes, cotiza viajes, planifica itinerarios y realiza seguimiento de visitas. 
          Todos los datos se guardan automáticamente en tu navegador.
        </p>
      </div>
    </div>
  )
}

export default Dashboard
