import React, { useEffect, useState } from 'react'
import { Users, Calculator, Calendar, TrendingUp, Briefcase, FileText, AlertTriangle, Clock } from 'lucide-react'
import { storage } from '../utils/storage'
import { createClient } from '@supabase/supabase-js'
import { getEjercicioActual, subscribeToEjercicioChanges } from '../utils/ejercicioGlobal'
import { extraerAño } from '../utils/dateNormalizer'

// Cliente de Supabase
const supabase = createClient(
  'https://gtwyqxfkpdwpakmgrkbu.supabase.co',
  'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'
)

const Dashboard = () => {
  const [ejercicioActual, setEjercicioActual] = useState(getEjercicioActual())
  const [stats, setStats] = useState({
    totalClientes: 0,
    totalCotizaciones: 0,
    proximosViajes: 0,
    visitasPendientes: 0,
  })
  const [alertasRelease, setAlertasRelease] = useState([])
  const [proximosViajes, setProximosViajes] = useState([])
  const [proximasVisitas, setProximasVisitas] = useState([])

  // Sincronizar con cambios globales del ejercicio
  useEffect(() => {
    const unsubscribe = subscribeToEjercicioChanges((nuevoEjercicio) => {
      console.log('📅 Dashboard: Ejercicio cambiado a', nuevoEjercicio)
      setEjercicioActual(nuevoEjercicio)
    })
    return unsubscribe
  }, [])

  // Cargar clientes desde Supabase
  const cargarClientes = async () => {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('id', { count: 'exact' })
      
      if (error) {
        console.error('Error cargando clientes:', error)
        // Fallback a localStorage
        const clientes = storage.getClientes()
        return clientes.length
      }
      
      return data?.length || 0
    } catch (error) {
      console.error('Error fatal cargando clientes:', error)
      // Fallback a localStorage
      const clientes = storage.getClientes()
      return clientes.length
    }
  }

  // Cargar contador de expedientes del año seleccionado
  const cargarExpedientesDelAño = async (año) => {
    try {
      // Calcular rango de fechas para el año seleccionado
      const inicioAño = `${año}-01-01`
      const finAño = `${año}-12-31`
      
      const { data, error } = await supabase
        .from('expedientes')
        .select('id_expediente', { count: 'exact' })
        .gte('fecha_inicio', inicioAño)
        .lte('fecha_inicio', finAño)
      
      if (error) {
        console.error('Error cargando expedientes del año:', error)
        // Fallback a localStorage
        const expedientes = storage.get('expedientes') || []
        return expedientes.filter(exp => {
          const fechaInicio = exp.fecha_inicio || exp.fechaInicio
          if (!fechaInicio) return false
          const añoExpediente = extraerAño(fechaInicio)
          return añoExpediente === año
        }).length
      }
      
      return data?.length || 0
    } catch (error) {
      console.error('Error fatal cargando expedientes del año:', error)
      // Fallback a localStorage
      const expedientes = storage.get('expedientes') || []
      return expedientes.filter(exp => {
        const fechaInicio = exp.fecha_inicio || exp.fechaInicio
        if (!fechaInicio) return false
        const añoExpediente = extraerAño(fechaInicio)
        return añoExpediente === año
      }).length
    }
  }

  // Cargar próximos viajes desde Supabase (filtrado por año seleccionado)
  const cargarProximosViajes = async (año) => {
    try {
      const hoy = new Date().toISOString().split('T')[0] // YYYY-MM-DD
      
      // Calcular rango de fechas para el año seleccionado
      const inicioAño = `${año}-01-01`
      const finAño = `${año}-12-31`
      
      const { data, error } = await supabase
        .from('expedientes')
        .select('id_expediente, fecha_inicio, fecha_fin, cliente_nombre, destino, estado, responsable')
        .gte('fecha_inicio', hoy) // Solo futuros
        .gte('fecha_inicio', inicioAño) // Del año seleccionado en adelante
        .lte('fecha_inicio', finAño) // Hasta fin del año seleccionado
        .order('fecha_inicio', { ascending: true })
        .limit(10)
      
      if (error) {
        console.error('Error cargando próximos viajes:', error)
        return []
      }
      
      return (data || []).map(exp => ({
        id: exp.id_expediente,
        fechaInicio: exp.fecha_inicio,
        fechaFin: exp.fecha_fin,
        clienteNombre: exp.cliente_nombre,
        destino: exp.destino,
        estado: exp.estado,
        responsable: exp.responsable
      }))
    } catch (error) {
      console.error('Error fatal cargando próximos viajes:', error)
      return []
    }
  }

  // Cargar próximas visitas (expedientes con estado 'peticion' del año seleccionado)
  const cargarProximasVisitas = async (año) => {
    try {
      // Calcular rango de fechas para el año seleccionado
      const inicioAño = `${año}-01-01`
      const finAño = `${año}-12-31`
      
      const { data, error } = await supabase
        .from('expedientes')
        .select('id_expediente, fecha_inicio, cliente_nombre, destino, estado, responsable, telefono, email')
        .eq('estado', 'peticion')
        .gte('fecha_inicio', inicioAño)
        .lte('fecha_inicio', finAño)
        .order('fecha_inicio', { ascending: true })
        .limit(10)
      
      if (error) {
        console.error('Error cargando próximas visitas:', error)
        return []
      }
      
      return (data || []).map(exp => ({
        id: exp.id_expediente,
        fechaInicio: exp.fecha_inicio,
        clienteNombre: exp.cliente_nombre,
        destino: exp.destino,
        estado: exp.estado,
        responsable: exp.responsable,
        telefono: exp.telefono,
        email: exp.email
      }))
    } catch (error) {
      console.error('Error fatal cargando próximas visitas:', error)
      return []
    }
  }

  useEffect(() => {
    const cargarDatos = async () => {
      // Cargar contador de clientes desde Supabase (sin filtro de año - total acumulado)
      const totalClientes = await cargarClientes()
      
      // Cargar contador de expedientes del año seleccionado
      const totalExpedientes = await cargarExpedientesDelAño(ejercicioActual)
      
      // Cargar expedientes desde localStorage como fallback para alertas
      const expedientes = storage.get('expedientes') || []
      const planning = storage.getPlanning()
      const visitas = storage.getVisitas()

      // Cargar próximos viajes y visitas desde Supabase (filtrados por año)
      const viajes = await cargarProximosViajes(ejercicioActual)
      const visitasPend = await cargarProximasVisitas(ejercicioActual)

      setStats({
        totalClientes,
        totalCotizaciones: totalExpedientes,
        proximosViajes: viajes.length,
        visitasPendientes: visitasPend.length,
      })

      setProximosViajes(viajes)
      setProximasVisitas(visitasPend)

      // Calcular alertas de release (solo del año seleccionado)
      const expedientesDelAño = expedientes.filter(exp => {
        const fechaInicio = exp.fecha_inicio || exp.fechaInicio
        if (!fechaInicio) return false
        const añoExpediente = extraerAño(fechaInicio)
        return añoExpediente === ejercicioActual
      })
      calcularAlertasRelease(expedientesDelAño)
    }

    cargarDatos()
  }, [ejercicioActual]) // Recargar cuando cambie el ejercicio

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

      {/* Próximos Viajes */}
      <div className="mt-8 card">
        <h2 className="text-xl font-bold text-navy-900 mb-4 flex items-center gap-2">
          <Calendar size={24} />
          Próximos Viajes
        </h2>
        {proximosViajes.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No hay viajes próximos programados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Fecha Salida</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Cliente</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Destino</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Estado</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Responsable</th>
                </tr>
              </thead>
              <tbody>
                {proximosViajes.map((viaje) => {
                  const fechaSalida = viaje.fechaInicio ? new Date(viaje.fechaInicio) : null
                  const fechaFormateada = fechaSalida ? fechaSalida.toLocaleDateString('es-ES', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric' 
                  }) : '-'
                  
                  const estadoColors = {
                    peticion: 'bg-yellow-100 text-yellow-800',
                    confirmado: 'bg-green-100 text-green-800',
                    finalizado: 'bg-blue-100 text-blue-800',
                    cancelado: 'bg-red-100 text-red-800'
                  }
                  
                  return (
                    <tr key={viaje.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm">{fechaFormateada}</td>
                      <td className="py-3 px-4 text-sm font-medium">{viaje.clienteNombre || '-'}</td>
                      <td className="py-3 px-4 text-sm">{viaje.destino || '-'}</td>
                      <td className="py-3 px-4 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoColors[viaje.estado] || 'bg-gray-100 text-gray-800'}`}>
                          {viaje.estado || 'peticion'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm">{viaje.responsable || '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Próximas Visitas */}
      <div className="mt-8 card">
        <h2 className="text-xl font-bold text-navy-900 mb-4 flex items-center gap-2">
          <Briefcase size={24} />
          Próximas Visitas
        </h2>
        {proximasVisitas.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No hay visitas pendientes</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Cliente</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Destino</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Responsable</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Teléfono</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Email</th>
                </tr>
              </thead>
              <tbody>
                {proximasVisitas.map((visita) => (
                  <tr key={visita.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm font-medium">{visita.clienteNombre || '-'}</td>
                    <td className="py-3 px-4 text-sm">{visita.destino || '-'}</td>
                    <td className="py-3 px-4 text-sm">{visita.responsable || '-'}</td>
                    <td className="py-3 px-4 text-sm">{visita.telefono || '-'}</td>
                    <td className="py-3 px-4 text-sm">{visita.email || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
