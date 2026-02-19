import React, { useEffect, useState } from 'react'
import { Users, Calculator, Calendar, TrendingUp, Briefcase, FileText, AlertTriangle, Clock, CheckCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { storage } from '../utils/storage'
import { supabase } from '../supabase'
import { getEjercicioActual, subscribeToEjercicioChanges } from '../utils/ejercicioGlobal'
import { extraerAño } from '../utils/dateNormalizer'

const Dashboard = ({ user = null }) => {
  const navigate = useNavigate()
  const [ejercicioActual, setEjercicioActual] = useState(getEjercicioActual())
  const [stats, setStats] = useState({
    totalClientes: 0,
    totalCotizaciones: 0,
    visitasPendientes: 0,
  })
  const [alertasRelease, setAlertasRelease] = useState([])
  const [proximosReleases, setProximosReleases] = useState([])
  const [esAdmin, setEsAdmin] = useState(false)
  const [beneficioNetoTotal, setBeneficioNetoTotal] = useState(null)

  // Sincronizar con cambios globales del ejercicio
  useEffect(() => {
    const unsubscribe = subscribeToEjercicioChanges((nuevoEjercicio) => {
      setEjercicioActual(nuevoEjercicio)
    })
    return unsubscribe
  }, [])

  // DISABLED: roles_usuarios - deshabilitado temporalmente para evitar pantalla blanca
  // useEffect(() => {
  //   const verificarAdmin = async () => {
  //     const email = user?.email?.toLowerCase?.()
  //     if (!email) { setEsAdmin(user?.rol === 'ADMIN'); return }
  //     try {
  //       const { data, error } = await supabase.from('roles_usuarios').select('rol').eq('email', email).eq('rol', 'ADMIN').maybeSingle()
  //       if (!error && data?.rol === 'ADMIN') setEsAdmin(true)
  //       else setEsAdmin(user?.rol === 'ADMIN')
  //     } catch { setEsAdmin(user?.rol === 'ADMIN') }
  //   }
  //   verificarAdmin()
  // }, [user?.email, user?.rol])

  // Calcular beneficio neto del año (solo para ADMIN)
  const cargarBeneficioNeto = async (año) => {
    try {
      const inicioAño = `${año}-01-01`
      const finAño = `${año}-12-31`
      const { data: expedientesData, error: errExp } = await supabase
        .from('expedientes')
        .select('id, precio_venta_cliente, pax_pago, total_pax, gratuidades')
        .gte('fecha_inicio', inicioAño)
        .lte('fecha_inicio', finAño)
      if (errExp || !expedientesData?.length) {
        setBeneficioNetoTotal(0)
        return
      }
      const ids = expedientesData.map(e => e.id)
      const { data: serviciosData, error: errServ } = await supabase
        .from('servicios_cotizacion')
        .select('id_expediente, total_servicio, coste_real_proveedor')
        .in('id_expediente', ids)
      if (errServ) {
        setBeneficioNetoTotal(0)
        return
      }
      let ingresosTotal = 0
      let costesTotal = 0
      expedientesData.forEach(exp => {
        const paxPago = Math.max(1, Number(exp.pax_pago) || (Number(exp.total_pax) || 1) - (Number(exp.gratuidades) || 0))
        ingresosTotal += paxPago * (Number(exp.precio_venta_cliente) || 0)
      })
      const porExpediente = {}
      ;(serviciosData || []).forEach(s => {
        const idExp = s.id_expediente
        if (!porExpediente[idExp]) porExpediente[idExp] = 0
        const coste = s.coste_real_proveedor != null && Number(s.coste_real_proveedor) > 0
          ? Number(s.coste_real_proveedor)
          : Number(s.total_servicio) || 0
        porExpediente[idExp] += coste
      })
      Object.values(porExpediente).forEach(c => { costesTotal += c })
      const beneficioBruto = ingresosTotal - costesTotal
      const iva = beneficioBruto > 0 ? beneficioBruto * 0.21 : 0
      const beneficioNeto = beneficioBruto - iva
      setBeneficioNetoTotal(beneficioNeto)
    } catch {
      setBeneficioNetoTotal(0)
    }
  }

  // Cargar clientes desde Supabase
  const cargarClientes = async () => {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('id', { count: 'exact' })
      
      if (error) {
        // Fallback a localStorage
        const clientes = storage.getClientes()
        return clientes.length
      }
      
      return data?.length || 0
    } catch (error) {
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
      
      // ARQUITECTURA UUID: usar id (UUID) generado por Supabase
      const { data, error } = await supabase
        .from('expedientes')
        .select('id', { count: 'exact' }) // ARQUITECTURA UUID: usar id (UUID)
        .gte('fecha_inicio', inicioAño)
        .lte('fecha_inicio', finAño)
      
      if (error) {
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


  // Contador de visitas pendientes (expedientes estado 'peticion') para la card
  const cargarVisitasPendientesCount = async (año) => {
    try {
      const inicioAño = `${año}-01-01`
      const finAño = `${año}-12-31`
      const { count, error } = await supabase
        .from('expedientes')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'peticion')
        .gte('fecha_inicio', inicioAño)
        .lte('fecha_inicio', finAño)
      if (error) return 0
      return count ?? 0
    } catch {
      return 0
    }
  }

  // ============ CARGAR PRÓXIMOS RELEASES ============
  const cargarProximosReleases = async () => {
    try {
      const { data: serviciosData, error: serviciosError } = await supabase
        .from('servicios_cotizacion')
        .select('id, fecha_release, tipo_servicio, nombre_especifico, id_expediente, release_pagado')
        .or('release_pagado.is.null,release_pagado.eq.false')
        .not('fecha_release', 'is', null)
        .order('fecha_release', { ascending: true })
        .limit(50)
      
      if (serviciosError) {
        return []
      }
      
      if (!serviciosData || serviciosData.length === 0) {
        return []
      }
      
      // Obtener IDs únicos de expedientes
      const expedientesIds = [...new Set(serviciosData.map(s => s.id_expediente).filter(Boolean))]
      
      if (expedientesIds.length === 0) {
        return []
      }
      
      // Cargar información de expedientes
      const { data: expedientesData, error: expedientesError } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, cliente_nombre, destino, responsable')
        .in('id', expedientesIds)
      
      if (expedientesError) {
        return []
      }
      
      // Crear mapa de expedientes por ID
      const expedientesMap = {}
      if (expedientesData) {
        expedientesData.forEach(exp => {
          expedientesMap[exp.id] = exp
        })
      }
      
      // Procesar servicios y calcular días restantes
      const hoyDate = new Date()
      hoyDate.setHours(0, 0, 0, 0)
      
      const releases = serviciosData
        .map(servicio => {
          const expediente = expedientesMap[servicio.id_expediente]
          if (!expediente) return null
          
          const fechaRelease = new Date(servicio.fecha_release)
          fechaRelease.setHours(0, 0, 0, 0)
          
          const diasRestantes = Math.ceil((fechaRelease - hoyDate) / (1000 * 60 * 60 * 24))
          
          return {
            id: servicio.id,
            expedienteId: servicio.id_expediente,
            numeroExpediente: expediente.numero_expediente || expediente.id.substring(0, 8),
            clienteNombre: expediente.cliente_nombre || 'Sin cliente',
            destino: expediente.destino || 'Sin destino',
            responsable: expediente.responsable || 'Sin responsable',
            tipoServicio: servicio.tipo_servicio || 'Servicio',
            nombreEspecifico: servicio.nombre_especifico || '',
            fechaRelease: servicio.fecha_release,
            diasRestantes: diasRestantes
          }
        })
        .filter(Boolean)
        .sort((a, b) => a.diasRestantes - b.diasRestantes) // Ordenar por días restantes
      
      return releases
    } catch (error) {
      return []
    }
  }

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        // Cargar contador de clientes desde Supabase (sin filtro de año - total acumulado)
        const totalClientes = await cargarClientes()
        
        // Cargar contador de expedientes del año seleccionado
        const totalExpedientes = await cargarExpedientesDelAño(ejercicioActual)
        
        // Cargar expedientes desde localStorage como fallback para alertas
        const expedientes = storage.get('expedientes') || []

        // Contador de visitas pendientes (solo count, sin datos de tabla)
        const visitasPendientesCount = await cargarVisitasPendientesCount(ejercicioActual)

        // Cargar próximos releases desde servicios_cotizacion
        const releases = await cargarProximosReleases()

        setStats({
          totalClientes,
          totalCotizaciones: totalExpedientes,
          visitasPendientes: visitasPendientesCount,
        })

        setProximosReleases(releases)

        if (esAdmin) {
          cargarBeneficioNeto(ejercicioActual)
        } else {
          setBeneficioNetoTotal(null)
        }

        // Calcular alertas de release (solo del año seleccionado) - mantener para compatibilidad
        const expedientesDelAño = expedientes.filter(exp => {
          const fechaInicio = exp?.fecha_inicio || exp?.fechaInicio
          if (!fechaInicio) return false
          const añoExpediente = extraerAño(fechaInicio)
          return añoExpediente === ejercicioActual
        })
        calcularAlertasRelease(expedientesDelAño)
      } catch {
        // Fallback: no bloquear la pantalla; mantener estado previo o valores por defecto
      }
    }

    cargarDatos()
  }, [ejercicioActual, esAdmin]) // Recargar cuando cambie el ejercicio o el rol

  const marcarReleaseComoPagado = async (releaseId, e) => {
    e?.stopPropagation?.()
    if (!window.confirm('¿Estás seguro de que quieres marcar este release como pagado?')) return
    try {
      const { error } = await supabase
        .from('servicios_cotizacion')
        .update({ release_pagado: true })
        .eq('id', releaseId)
      if (error) {
        alert('No se pudo marcar como pagado. Inténtalo de nuevo.')
        return
      }
      const releases = await cargarProximosReleases()
      setProximosReleases(releases)
    } catch (err) {
      alert('No se pudo marcar como pagado.')
    }
  }

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
      title: 'Planificación', 
      value: null, 
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
        <h1 className="text-3xl font-bold text-navy-900 mb-2">Panel de Control</h1>
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

      {/* Beneficio Neto (solo visible para ADMIN) */}
      {/* DISABLED: Beneficio neto (dependía de roles_usuarios) */}
      {false && esAdmin && beneficioNetoTotal != null && typeof beneficioNetoTotal === 'number' && (
        <div className="mb-8">
          <div
            className="card border-2 border-emerald-200 bg-gradient-to-r from-emerald-50 to-green-50"
            style={{ cursor: 'default' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm mb-1">Beneficio Neto ({ejercicioActual ?? ''})</p>
                <h3 className={`text-3xl font-bold ${beneficioNetoTotal >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                  {beneficioNetoTotal >= 0 ? '+' : ''}{Number(beneficioNetoTotal).toFixed(2)} €
                </h3>
              </div>
              <div className="p-3 bg-emerald-500 rounded-lg">
                <TrendingUp className="text-white" size={24} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {cards.map((card) => (
          <div
            key={card.title}
            onClick={() => navigate(card.link)}
            className="card hover:shadow-2xl transition-all duration-300 cursor-pointer transform hover:scale-[1.02] active:scale-[0.98]"
            style={{ cursor: 'pointer' }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                navigate(card.link)
              }
            }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm mb-1">{card.title}</p>
                {card.value !== null && (
                  <h3 className="text-3xl font-bold text-navy-900">{card.value}</h3>
                )}
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
        {/* Panel de Alertas Críticas - Próximos Releases */}
        <div className="card">
          <h2 className="text-xl font-bold text-navy-900 mb-4 flex items-center gap-2">
            <AlertTriangle size={24} className="text-orange-600" />
            Próximos Releases
          </h2>
          {proximosReleases.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Clock className="text-green-600" size={32} />
              </div>
              <p className="text-gray-500 text-sm">No hay releases próximos</p>
              <p className="text-gray-400 text-xs mt-1">Todos los servicios están al día</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {proximosReleases.map((release) => {
                // Pendientes: naranja llamativo; vencidos: rojo
                const diasRestantes = release.diasRestantes ?? 0
                let colorClass = 'bg-orange-50 border-orange-300 text-orange-900'
                let iconColor = 'text-orange-600'
                let badgeColor = 'bg-orange-100 text-orange-800'
                if (diasRestantes < 0) {
                  colorClass = 'bg-red-50 border-red-300 text-red-900'
                  iconColor = 'text-red-600'
                  badgeColor = 'bg-red-100 text-red-800'
                } else if (diasRestantes < 3) {
                  colorClass = 'bg-red-50 border-red-300 text-red-900'
                  iconColor = 'text-red-600'
                  badgeColor = 'bg-red-100 text-red-800'
                } else if (diasRestantes < 7) {
                  colorClass = 'bg-orange-50 border-orange-300 text-orange-900'
                  iconColor = 'text-orange-600'
                  badgeColor = 'bg-orange-100 text-orange-800'
                }
                let diasTexto = ''
                if (diasRestantes === 0) diasTexto = '¡HOY!'
                else if (diasRestantes === 1) diasTexto = 'Mañana'
                else if (diasRestantes < 0) diasTexto = `Hace ${Math.abs(diasRestantes)} días`
                else diasTexto = `${diasRestantes} días`
                const fechaFormateada = new Date(release.fechaRelease).toLocaleDateString('es-ES', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                })
                return (
                  <div
                    key={release.id}
                    onClick={() => navigate('/expedientes', { state: { abrirExpedienteId: release.expedienteId } })}
                    className={`p-4 rounded-lg border-2 ${colorClass} cursor-pointer hover:shadow-md transition-all`}
                    style={{ cursor: 'pointer', fontSize: '16px' }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold" style={{ fontSize: '16px' }}>{release.tipoServicio}</h3>
                          {release.nombreEspecifico && (
                            <span className="opacity-75" style={{ fontSize: '16px' }}>- {release.nombreEspecifico}</span>
                          )}
                        </div>
                        <p className="font-medium mb-1" style={{ fontSize: '16px' }}>
                          Expediente: <span className="font-bold">{release.numeroExpediente}</span>
                        </p>
                        <p className="opacity-80" style={{ fontSize: '16px' }}>
                          {release.clienteNombre} {release.destino ? ` · ${release.destino}` : ''}
                        </p>
                      </div>
                      <div className={`px-3 py-1.5 rounded-full font-bold ${badgeColor} whitespace-nowrap ml-3`} style={{ fontSize: '16px' }}>
                        {diasTexto}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-current border-opacity-20">
                      <div className="flex items-center gap-2">
                        <Clock size={14} className={iconColor} />
                        <span className="font-medium" style={{ fontSize: '16px' }}>{fechaFormateada}</span>
                      </div>
                      <button
                        onClick={(e) => marcarReleaseComoPagado(release.id, e)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
                        style={{ fontSize: '16px' }}
                        title="Marcar como pagado"
                      >
                        <CheckCircle size={16} />
                        Pagado
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
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

      {/* Acceso a Planning */}
      <div className="mt-8 card">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-navy-900 mb-2 flex items-center gap-2">
              <Calendar size={24} />
              Planning
            </h2>
            <p className="text-gray-600 text-sm">Gestiona el calendario completo de viajes y expedientes</p>
          </div>
          <button
            onClick={() => navigate('/planning')}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-md flex items-center gap-2"
          >
            <Calendar size={20} />
            Gestionar Calendario Completo
          </button>
        </div>
      </div>

      <div className="mt-8 card min-h-[200px]">
        {/* Placeholder: Espacio reservado para métricas y estados */}
      </div>
    </div>
  )
}

export default Dashboard
