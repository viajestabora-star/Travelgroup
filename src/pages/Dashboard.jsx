import React, { useEffect, useState } from 'react'
import { Users, Calculator, Calendar, Briefcase, AlertTriangle, Clock, CheckCircle, Globe, X, StickyNote, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { storage } from '../utils/storage'
import { supabase } from '../supabase'
import { getEjercicioActual, subscribeToEjercicioChanges } from '../utils/ejercicioGlobal'
import { registrarSalidaOnUnload, heartbeatSalida, registrarEntradaSilencioso } from '../utils/controlHorario'

const HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000
const STORAGE_KEY_FECHA = 'control_horario_fecha_validada'
import CentralDeInteligencia from '../components/CentralDeInteligencia'
import ResumenPipeline from '../components/ResumenPipeline'

const Dashboard = ({ user = null }) => {
  const navigate = useNavigate()
  const [ejercicioActual, setEjercicioActual] = useState(getEjercicioActual())
  const [showIntelligenceHub, setShowIntelligenceHub] = useState(false)
  const [stats, setStats] = useState({
    totalClientes: 0,
    totalCotizaciones: 0,
    visitasPendientes: 0,
  })
  const [proximosReleases, setProximosReleases] = useState([])
  const [notasPendientes, setNotasPendientes] = useState([])
  const [cargandoNotas, setCargandoNotas] = useState(true)

  useEffect(() => {
    const fetchNotas = async () => {
      try {
        const { data } = await supabase
          .from('notas')
          .select('*')
          .is('expediente_id', null)
          .eq('estado', 'Pendiente')
          .order('fecha_plazo', { ascending: true })
        setNotasPendientes(data || [])
      } catch (_) {
        setNotasPendientes([])
      } finally {
        setCargandoNotas(false)
      }
    }
    fetchNotas()
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToEjercicioChanges((nuevoEjercicio) => {
      setEjercicioActual(nuevoEjercicio)
    })
    return unsubscribe
  }, [])

  // Control horario (Marisa): efecto secundario solo tras Login. 100% en segundo plano.
  const esMarisa = user?.email?.toLowerCase() === 'grupos@viajestabora.com'
  useEffect(() => {
    if (!esMarisa || !user?.email) return
    const init = async () => {
      try {
        const hoy = new Date().toISOString().slice(0, 10)
        if (sessionStorage.getItem(STORAGE_KEY_FECHA) === hoy && sessionStorage.getItem('control_horario_entrada_id')) return
        const { data: registros, error } = await supabase
          .from('control_horario')
          .select('id, hora_salida')
          .eq('user_email', user.email.toLowerCase())
          .eq('fecha', hoy)
          .order('hora_entrada', { ascending: false })
        if (!error && Array.isArray(registros) && registros.length > 0) {
          const abierto = registros.find((r) => !r.hora_salida)
          if (abierto) sessionStorage.setItem('control_horario_entrada_id', abierto.id)
          sessionStorage.setItem(STORAGE_KEY_FECHA, hoy)
        } else {
          await registrarEntradaSilencioso(user.email)
        }
      } catch (_) {}
    }
    init()
  }, [esMarisa, user?.email])
  useEffect(() => {
    if (!esMarisa) return
    window.addEventListener('beforeunload', registrarSalidaOnUnload)
    return () => window.removeEventListener('beforeunload', registrarSalidaOnUnload)
  }, [esMarisa])
  useEffect(() => {
    if (!esMarisa || !user?.email) return
    const tick = () => heartbeatSalida(user.email)
    const id = setInterval(tick, HEARTBEAT_INTERVAL_MS)
    return () => clearInterval(id)
  }, [esMarisa, user?.email])

  const cargarClientes = async () => {
    try {
      const { data, error } = await supabase.from('clientes').select('id', { count: 'exact' })
      if (error) {
        const clientes = storage.getClientes()
        return clientes?.length || 0
      }
      return data?.length || 0
    } catch {
      const clientes = storage.getClientes()
      return clientes?.length || 0
    }
  }

  const cargarExpedientesCount = async () => {
    try {
      const inicio = `${ejercicioActual}-01-01T00:00:00`
      const fin = `${ejercicioActual + 1}-01-01T00:00:00`
      const { data, error } = await supabase
        .from('expedientes')
        .select('id', { count: 'exact' })
        .gte('created_at', inicio)
        .lt('created_at', fin)
      if (error) return 0
      return data?.length ?? 0
    } catch {
      return 0
    }
  }

  const cargarVisitasPendientesCount = async () => {
    try {
      const inicio = `${ejercicioActual}-01-01T00:00:00`
      const fin = `${ejercicioActual + 1}-01-01T00:00:00`
      const { count, error } = await supabase
        .from('expedientes')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'peticion')
        .gte('created_at', inicio)
        .lt('created_at', fin)
      if (error) return 0
      return count ?? 0
    } catch {
      return 0
    }
  }

  const cargarProximosReleases = async () => {
    try {
      const { data: serviciosData, error: serviciosError } = await supabase
        .from('servicios_cotizacion')
        .select('id, fecha_release, tipo_servicio, nombre_especifico, id_expediente, release_pagado')
        .or('release_pagado.is.null,release_pagado.eq.false')
        .not('fecha_release', 'is', null)
        .order('fecha_release', { ascending: true })
        .limit(50)
      if (serviciosError || !serviciosData?.length) return []
      const expedientesIds = [...new Set(serviciosData.map((s) => s.id_expediente).filter(Boolean))]
      if (!expedientesIds.length) return []
      const { data: expedientesData, error: expedientesError } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, cliente_nombre, destino, responsable')
        .in('id', expedientesIds)
      if (expedientesError) return []
      const expedientesMap = {}
      ;(expedientesData || []).forEach((exp) => { expedientesMap[exp.id] = exp })
      const hoyDate = new Date()
      hoyDate.setHours(0, 0, 0, 0)
      const releases = serviciosData
        .map((servicio) => {
          const expediente = expedientesMap[servicio.id_expediente]
          if (!expediente) return null
          const fechaRelease = new Date(servicio.fecha_release)
          fechaRelease.setHours(0, 0, 0, 0)
          const diasRestantes = Math.ceil((fechaRelease - hoyDate) / (1000 * 60 * 60 * 24))
          return {
            id: servicio.id,
            expedienteId: servicio.id_expediente,
            numeroExpediente: expediente.numero_expediente || expediente.id?.substring(0, 8) || '',
            clienteNombre: expediente.cliente_nombre || 'Sin cliente',
            destino: expediente.destino || 'Sin destino',
            responsable: expediente.responsable || 'Sin responsable',
            tipoServicio: servicio.tipo_servicio || 'Servicio',
            nombreEspecifico: servicio.nombre_especifico || '',
            fechaRelease: servicio.fecha_release,
            diasRestantes,
          }
        })
        .filter(Boolean)
        .sort((a, b) => a.diasRestantes - b.diasRestantes)
      return releases
    } catch {
      return []
    }
  }

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        const [totalClientes, totalExpedientes, visitasPendientes, releases] = await Promise.all([
          cargarClientes(),
          cargarExpedientesCount(),
          cargarVisitasPendientesCount(),
          cargarProximosReleases(),
        ])
        setStats({ totalClientes, totalCotizaciones: totalExpedientes, visitasPendientes })
        setProximosReleases(releases)
      } catch {
        // Mantener estado previo
      }
    }
    cargarDatos()
  }, [ejercicioActual])

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
    } catch {
      alert('No se pudo marcar como pagado.')
    }
  }

  const cards = [
    { title: 'Total Clientes', value: stats.totalClientes, icon: Users, color: 'bg-blue-500', link: '/clientes' },
    { title: 'Expedientes', value: stats.totalCotizaciones, icon: Calculator, color: 'bg-green-500', link: '/expedientes' },
    { title: 'Planificación', value: null, icon: Calendar, color: 'bg-purple-500', link: '/planning' },
    { title: 'Visitas Pendientes', value: stats.visitasPendientes, icon: Briefcase, color: 'bg-orange-500', link: '/crm' },
  ]

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-navy-900 mb-2">Panel de Control</h1>
          <p className="text-gray-600">Bienvenido a Viajes Tabora ERP</p>
        </div>
        <button
          onClick={() => setShowIntelligenceHub(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-navy-700 hover:bg-navy-800 text-white rounded-xl font-semibold transition-colors shadow-md"
          aria-label="Globo de Inteligencia"
        >
          <Globe size={20} />
          Globo de Inteligencia
        </button>
      </div>

      {showIntelligenceHub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-xl font-bold text-navy-900">Central de Inteligencia</h2>
              <button
                onClick={() => setShowIntelligenceHub(false)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Cerrar"
              >
                <X size={24} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <CentralDeInteligencia user={user} />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {cards.map((card) => (
          <div
            key={card.title}
            onClick={() => navigate(card.link)}
            className="card hover:shadow-2xl transition-all duration-300 cursor-pointer transform hover:scale-[1.02] active:scale-[0.98]"
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
                {card.value !== null && <h3 className="text-3xl font-bold text-navy-900">{card.value}</h3>}
              </div>
              <div className={`${card.color} p-3 rounded-lg`}>
                <card.icon className="text-white" size={24} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                const diasRestantes = release.diasRestantes ?? 0
                let colorClass = 'bg-orange-50 border-orange-300 text-orange-900'
                let iconColor = 'text-orange-600'
                let badgeColor = 'bg-orange-100 text-orange-800'
                if (diasRestantes < 0 || diasRestantes < 3) {
                  colorClass = 'bg-red-50 border-red-300 text-red-900'
                  iconColor = 'text-red-600'
                  badgeColor = 'bg-red-100 text-red-800'
                } else if (diasRestantes < 7) {
                  colorClass = 'bg-orange-50 border-orange-300 text-orange-900'
                  iconColor = 'text-orange-600'
                  badgeColor = 'bg-orange-100 text-orange-800'
                }
                const diasTexto =
                  diasRestantes === 0 ? '¡HOY!' : diasRestantes === 1 ? 'Mañana' : diasRestantes < 0 ? `Hace ${Math.abs(diasRestantes)} días` : `${diasRestantes} días`
                const fechaFormateada = new Date(release.fechaRelease).toLocaleDateString('es-ES', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })
                return (
                  <div
                    key={release.id}
                    onClick={() => navigate('/expedientes', { state: { abrirExpedienteId: release.expedienteId } })}
                    className={`p-4 rounded-lg border-2 ${colorClass} cursor-pointer hover:shadow-md transition-all`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold">{release.tipoServicio}</h3>
                          {release.nombreEspecifico && <span className="opacity-75">- {release.nombreEspecifico}</span>}
                        </div>
                        <p className="font-medium mb-1">Expediente: <span className="font-bold">{release.numeroExpediente}</span></p>
                        <p className="opacity-80">{release.clienteNombre} {release.destino ? ` · ${release.destino}` : ''}</p>
                      </div>
                      <div className={`px-3 py-1.5 rounded-full font-bold ${badgeColor} whitespace-nowrap ml-3`}>{diasTexto}</div>
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-current border-opacity-20">
                      <div className="flex items-center gap-2">
                        <Clock size={14} className={iconColor} />
                        <span className="font-medium">{fechaFormateada}</span>
                      </div>
                      <button
                        onClick={(e) => marcarReleaseComoPagado(release.id, e)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
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

        <div className="card flex flex-col" style={{ minHeight: '360px' }}>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-navy-900 flex items-center gap-2">
              <StickyNote size={22} className="text-red-500" />
              Notas Pendientes
            </h2>
            <button
              onClick={() => navigate('/notas')}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              Ver todas <ChevronRight size={16} />
            </button>
          </div>

          {/* Body */}
          {cargandoNotas ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : notasPendientes.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="text-green-600" size={28} />
              </div>
              <p className="text-gray-500 text-sm font-medium">¡Sin notas pendientes!</p>
              <p className="text-gray-400 text-xs mt-1">Todo el equipo está al día</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {notasPendientes.map((nota) => {
                const colorBorde = {
                  'Todos':   '#9ca3af',
                  'Andres':  '#3b82f6',
                  'Marisa':  '#10b981',
                  'German':  '#f59e0b',
                }[nota.destinatario] || '#9ca3af'

                const fechaTexto = nota.fecha_plazo
                  ? new Date(nota.fecha_plazo).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
                  : null

                const preview = nota.contenido
                  ? nota.contenido.length > 80
                    ? nota.contenido.slice(0, 80) + '…'
                    : nota.contenido
                  : null

                return (
                  <div
                    key={nota.id}
                    onClick={() => navigate('/notas', { state: { notaId: nota.id } })}
                    className="p-3 rounded-lg border-l-4 bg-red-50 hover:bg-red-100 cursor-pointer transition-all group"
                    style={{ borderLeftColor: colorBorde }}
                  >
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-semibold text-sm text-gray-900 leading-tight line-clamp-1 flex-1">
                        {nota.titulo || 'Sin título'}
                      </span>
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                        Pendiente
                      </span>
                    </div>

                    {/* Sender / recipient */}
                    {nota.destinatario && (
                      <p className="text-xs text-gray-500 mb-1">
                        Para: <span className="font-medium" style={{ color: colorBorde }}>{nota.destinatario}</span>
                      </p>
                    )}

                    {/* Content preview */}
                    {preview && (
                      <p className="text-xs text-gray-600 leading-relaxed mb-1 line-clamp-2">{preview}</p>
                    )}

                    {/* Date + deep-link hint */}
                    <div className="flex items-center justify-between mt-1">
                      {fechaTexto && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Clock size={11} />
                          {fechaTexto}
                        </span>
                      )}
                      <span className="ml-auto text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                        Editar →
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
