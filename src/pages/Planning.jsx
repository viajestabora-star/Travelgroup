import React, { useState, useEffect } from 'react'
import { Calendar, Plus, Trash2, X } from 'lucide-react'
import { storage } from '../utils/storage'
import { normalizarExpedientes, formatearFechaVisual, parsearFechaADate, extraerAño, convertirEspañolAISO, convertirISOAEspañol } from '../utils/dateNormalizer'
import ExpedienteDetalle from '../components/ExpedienteDetalle'
import { getEjercicioActual, subscribeToEjercicioChanges } from '../utils/ejercicioGlobal'

// ============================================================================
// PLANNING 2026 - DISEÑO EN COLUMNA ÚNICA
// ============================================================================
// ESTÉTICA: EXACTAMENTE IGUAL que Gestión de Expedientes (tarjetas limpias)
// SINCRONIZACIÓN: Lee DIRECTAMENTE de expedientes (fuente única de verdad)
// ORDEN: Función universal de ordenación cronológica
// LAYOUT: Columna única vertical con trimestres uno debajo del otro
// ============================================================================

// Alias de las funciones del normalizador
const parsearFecha = parsearFechaADate
const formatearFecha = formatearFechaVisual

// ============ ESTADOS CON COLORES (IGUALES A EXPEDIENTES.JSX) ============

const ESTADOS = {
  peticion: { 
    label: 'Petición', 
    color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    badge: 'bg-yellow-400'
  },
  presupuesto: { 
    label: 'Presupuesto', 
    color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    badge: 'bg-yellow-400'
  },
  confirmado: { 
    label: 'Confirmado', 
    color: 'bg-green-100 text-green-800 border-green-300',
    badge: 'bg-green-500'
  },
  encurso: { 
    label: 'En Curso', 
    color: 'bg-blue-100 text-blue-800 border-blue-300',
    badge: 'bg-blue-500'
  },
  finalizado: { 
    label: 'Finalizado', 
    color: 'bg-gray-100 text-gray-800 border-gray-300',
    badge: 'bg-gray-400'
  },
  cancelado: { 
    label: 'Cancelado', 
    color: 'bg-red-100 text-red-800 border-red-300',
    badge: 'bg-red-500'
  },
}

// ============ COMPONENTE PRINCIPAL ============

const Planning = () => {
  const [expedientes, setExpedientes] = useState([])
  // ============ EJERCICIO GLOBAL (PERSISTENTE) ============
  const [ejercicioActual, setEjercicioActual] = useState(getEjercicioActual())
  const [showModal, setShowModal] = useState(false)
  const [showDetalleModal, setShowDetalleModal] = useState(false)
  const [expedienteActual, setExpedienteActual] = useState(null)
  const [formData, setFormData] = useState({
    nombre_grupo: '',
    cliente_responsable: '',
    destino: '',
    fechaInicio: '',
    fechaFin: '',
    estado: 'peticion',
    observaciones: '',
  })

  useEffect(() => {
    loadExpedientes()
    
    // Recargar cada 2 segundos para sincronización en tiempo real
    const interval = setInterval(loadExpedientes, 2000)
    return () => clearInterval(interval)
  }, [ejercicioActual]) // Recargar cuando cambie el ejercicio

  // ============ SINCRONIZACIÓN GLOBAL DEL EJERCICIO ============
  useEffect(() => {
    const unsubscribe = subscribeToEjercicioChanges((nuevoEjercicio) => {
      console.log('📅 Ejercicio cambiado globalmente a:', nuevoEjercicio)
      setEjercicioActual(nuevoEjercicio)
    })
    
    return unsubscribe
  }, [])

  // ============ CARGAR EXPEDIENTES (FUENTE ÚNICA DE VERDAD) ============
  const loadExpedientes = () => {
    try {
      const allExpedientes = storage.get('expedientes') || []
      
      console.log('📦 Total expedientes en base de datos:', allExpedientes.length)
      
      // ============ NORMALIZACIÓN AUTOMÁTICA DE FECHAS ============
      const expedientesNormalizados = normalizarExpedientes(allExpedientes)
      
      // ============ FILTRAR POR EJERCICIO (AÑO) SELECCIONADO ============
      const expedientesFiltrados = expedientesNormalizados.filter(exp => {
        // Solo mostrar expedientes con fecha_inicio o fechaInicio (compatibilidad)
        const fechaInicio = exp.fecha_inicio || exp.fechaInicio
        if (!fechaInicio) {
          return false
        }
        
        // Extraer año del expediente
        const añoExpediente = extraerAño(fechaInicio)
        if (!añoExpediente) {
          return false
        }
        
        return añoExpediente === ejercicioActual
      })
      
      console.log(`📅 Expedientes de ${ejercicioActual} filtrados:`, expedientesFiltrados.length)
      console.log('📋 Nombres:', expedientesFiltrados.map(e => e.nombre_grupo || e.clienteNombre).join(', '))
      
      setExpedientes(expedientesFiltrados)
    } catch (error) {
      console.error('❌ Error cargando expedientes para Planning:', error)
      setExpedientes([])
    }
  }

  // ============ FUNCIÓN DE ORDENACIÓN UNIVERSAL ============
  const ordenarExpedientes = (exps) => {
    return exps.slice().sort((a, b) => {
      try {
        // ============ NUEVA LÓGICA: SOLO FECHA PARA ACTIVOS ============
        // REGLA: Finalizados y Cancelados al final, el resto SOLO por fecha
        
        const esFinalizadoA = a.estado === 'finalizado' || a.estado === 'cancelado'
        const esFinalizadoB = b.estado === 'finalizado' || b.estado === 'cancelado'
        
        // Si uno está finalizado y el otro no → finalizado va al final
        if (esFinalizadoA && !esFinalizadoB) return 1
        if (!esFinalizadoA && esFinalizadoB) return -1
        
        // ============ ORDENACIÓN ESTRICTA POR FECHA ============
        // Para TODOS los activos o TODOS los finalizados
        // NO importa el estado, SOLO la fecha
        
        const fechaInicioA = a.fecha_inicio || a.fechaInicio
        const fechaInicioB = b.fecha_inicio || b.fechaInicio
        const fechaObjA = parsearFecha(fechaInicioA)
        const fechaObjB = parsearFecha(fechaInicioB)
        
        // Debug log para verificar conversión
        if (a.nombre_grupo === 'ARRANCAPINS' || a.nombre_grupo === 'VIVEROS' || 
            b.nombre_grupo === 'ARRANCAPINS' || b.nombre_grupo === 'VIVEROS') {
          console.log('🔍 Planning - Comparando fechas:', {
            A: { nombre: a.nombre_grupo, fechaStr: fechaInicioA, fechaObj: fechaObjA },
            B: { nombre: b.nombre_grupo, fechaStr: fechaInicioB, fechaObj: fechaObjB }
          })
        }
        
        // Sin fecha → al final del grupo
        if (!fechaObjA) return 1
        if (!fechaObjB) return -1
        
        // Más cercano primero: 16/01 < 25/01
        const resultado = fechaObjA - fechaObjB
        
        // Debug log del resultado
        if (a.nombre_grupo === 'ARRANCAPINS' || a.nombre_grupo === 'VIVEROS' || 
            b.nombre_grupo === 'ARRANCAPINS' || b.nombre_grupo === 'VIVEROS') {
          console.log('📊 Planning - Resultado:', resultado, 
            resultado < 0 ? `${a.nombre_grupo} va ANTES` : `${b.nombre_grupo} va ANTES`)
        }
        
        return resultado
        
      } catch (error) {
        console.error('❌ Error en ordenación:', error)
        return 0
      }
    })
  }

  // ============ OBTENER TRIMESTRE DE UNA FECHA ============
  const getTrimestreFromFecha = (fechaStr) => {
    if (!fechaStr) {
      // INSTRUCCIÓN TÉCNICA: Si no tiene fecha, asignar trimestre actual
      const hoy = new Date()
      const mesActual = hoy.getMonth() + 1
      if (mesActual >= 1 && mesActual <= 3) return 'Q1'
      if (mesActual >= 4 && mesActual <= 6) return 'Q2'
      if (mesActual >= 7 && mesActual <= 9) return 'Q3'
      return 'Q4'
    }
    
    const fecha = parsearFecha(fechaStr)
    if (!fecha) {
      // Si la fecha es inválida, asignar trimestre actual
      const hoy = new Date()
      const mesActual = hoy.getMonth() + 1
      if (mesActual >= 1 && mesActual <= 3) return 'Q1'
      if (mesActual >= 4 && mesActual <= 6) return 'Q2'
      if (mesActual >= 7 && mesActual <= 9) return 'Q3'
      return 'Q4'
    }
    
    const mes = fecha.getMonth() + 1
    
    if (mes >= 1 && mes <= 3) return 'Q1'
    if (mes >= 4 && mes <= 6) return 'Q2'
    if (mes >= 7 && mes <= 9) return 'Q3'
    return 'Q4'
  }

  // ============ AGRUPAR Y ORDENAR POR TRIMESTRE ============
  const expedientesPorTrimestre = {
    Q1: ordenarExpedientes(expedientes.filter(e => getTrimestreFromFecha(e.fecha_inicio || e.fechaInicio) === 'Q1')),
    Q2: ordenarExpedientes(expedientes.filter(e => getTrimestreFromFecha(e.fecha_inicio || e.fechaInicio) === 'Q2')),
    Q3: ordenarExpedientes(expedientes.filter(e => getTrimestreFromFecha(e.fecha_inicio || e.fechaInicio) === 'Q3')),
    Q4: ordenarExpedientes(expedientes.filter(e => getTrimestreFromFecha(e.fecha_inicio || e.fechaInicio) === 'Q4')),
  }

  console.log('📊 Distribución por trimestre:', {
    Q1: expedientesPorTrimestre.Q1.length,
    Q2: expedientesPorTrimestre.Q2.length,
    Q3: expedientesPorTrimestre.Q3.length,
    Q4: expedientesPorTrimestre.Q4.length,
  })
  
  // VERIFICACIÓN: Orden de Arrancapins y Viveros en Q1
  const arrancapinsIndex = expedientesPorTrimestre.Q1.findIndex(e => e.nombre_grupo === 'ARRANCAPINS')
  const viverosIndex = expedientesPorTrimestre.Q1.findIndex(e => e.nombre_grupo === 'VIVEROS')
  
  if (arrancapinsIndex !== -1 || viverosIndex !== -1) {
    console.log('✅ VERIFICACIÓN DE ORDEN EN Q1:')
    if (arrancapinsIndex !== -1) {
      const fechaArrancapins = expedientesPorTrimestre.Q1[arrancapinsIndex].fecha_inicio || expedientesPorTrimestre.Q1[arrancapinsIndex].fechaInicio
      console.log(`   ARRANCAPINS en posición ${arrancapinsIndex + 1}`, 
        `(Fecha: ${fechaArrancapins})`)
    }
    if (viverosIndex !== -1) {
      const fechaViveros = expedientesPorTrimestre.Q1[viverosIndex].fecha_inicio || expedientesPorTrimestre.Q1[viverosIndex].fechaInicio
      console.log(`   VIVEROS en posición ${viverosIndex + 1}`, 
        `(Fecha: ${fechaViveros})`)
    }
    if (arrancapinsIndex !== -1 && viverosIndex !== -1) {
      if (arrancapinsIndex < viverosIndex) {
        console.log('   ✅ ORDEN CORRECTO: Arrancapins está ANTES que Viveros')
      } else {
        console.log('   ❌ ORDEN INCORRECTO: Arrancapins está DESPUÉS que Viveros')
      }
    }
  }

  // ============ CREAR EXPEDIENTE ============
  const handleSubmit = (e) => {
    e.preventDefault()
    
    const allExpedientes = storage.get('expedientes') || []
    
    const nuevoExpediente = {
      id: Date.now(),
      ...formData,
      fecha_inicio: formData.fechaInicio || '',
      fecha_fin: formData.fechaFin || '',
      clienteId: '',
      clienteNombre: formData.nombre_grupo,
      fechaCreacion: new Date().toISOString(),
      cotizacion: null,
      pasajeros: [],
      cobros: [],
      pagos: [],
      documentos: [],
      cierre: null,
    }
    
    storage.set('expedientes', [...allExpedientes, nuevoExpediente])
    closeModal()
    loadExpedientes()
  }

  // ============ ELIMINAR EXPEDIENTE ============
  const handleDelete = (id) => {
    const expediente = expedientes.find(e => e.id === id)
    const nombre = expediente?.nombre_grupo || expediente?.destino || 'este expediente'
    
    if (window.confirm(`¿Está seguro de que desea eliminar el viaje "${nombre}"?\n\nEsta acción no se puede deshacer.`)) {
      const allExpedientes = storage.get('expedientes') || []
      const updated = allExpedientes.filter(exp => exp.id !== id)
      storage.set('expedientes', updated)
      loadExpedientes()
    }
  }

  const openModal = () => {
    setFormData({
      nombre_grupo: '',
      cliente_responsable: '',
      destino: '',
      fechaInicio: '',
      fechaFin: '',
      estado: 'peticion',
      observaciones: '',
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
  }

  // ============ FUNCIONES PARA DETALLE DE EXPEDIENTE ============
  const abrirDetalle = (expediente) => {
    setExpedienteActual(expediente)
    setShowDetalleModal(true)
  }

  const cerrarDetalle = () => {
    setShowDetalleModal(false)
    setExpedienteActual(null)
    loadExpedientes() // Recargar lista para reflejar cambios
  }

  const actualizarExpediente = (expedienteActualizado) => {
    try {
      const allExpedientes = storage.get('expedientes') || []
      
      // SEGURIDAD: Usar map para actualizar, NUNCA sobreescribir
      const updated = allExpedientes.map(exp => 
        exp.id === expedienteActualizado.id ? expedienteActualizado : exp
      )
      
      storage.set('expedientes', updated)
      setExpedienteActual(expedienteActualizado)
      loadExpedientes() // Recargar para reflejar orden actualizado
      
      console.log('✅ Expediente actualizado:', expedienteActualizado.nombre_grupo)
    } catch (error) {
      console.error('❌ Error actualizando expediente:', error)
    }
  }

  // ============ RENDER DE TARJETA (EXACTAMENTE IGUAL A EXPEDIENTES) ============
  const renderTarjeta = (expediente) => {
    if (!expediente || !expediente.id) return null
    
    const estado = ESTADOS[expediente.estado || 'peticion'] || ESTADOS.peticion
    const nombreGrupo = expediente.nombre_grupo || expediente.clienteNombre || 'GRUPO SIN NOMBRE'
    const nombreResponsable = expediente.cliente_responsable || expediente.responsable || 'Sin responsable'
    const destino = expediente.destino || 'Sin destino'
    const fechaInicio = expediente.fecha_inicio || expediente.fechaInicio || ''
    const fechaFin = expediente.fecha_fin || expediente.fechaFin || ''
    
    return (
      <div 
        key={expediente.id} 
        onClick={() => abrirDetalle(expediente)}
        className={`card border-l-4 ${estado.badge.replace('bg-', 'border-')} hover:shadow-xl transition-shadow cursor-pointer`}
      >
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${estado.color}`}>
                {estado.label}
              </span>
            </div>
            {/* JERARQUÍA VISUAL IDÉNTICA A EXPEDIENTES */}
            <h2 className="text-2xl font-black text-navy-900 uppercase tracking-wide mb-1">
              {nombreGrupo}
            </h2>
            <span className="text-sm text-gray-600 block mb-2">
              👤 {nombreResponsable}
            </span>
            <p className="text-base text-navy-600 font-medium">{destino}</p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleDelete(expediente.id)
            }}
            className="text-red-600 hover:text-red-900 p-2"
          >
            <Trash2 size={18} />
          </button>
        </div>

        <div className="space-y-2 text-sm mb-4">
          {fechaInicio && (
            <p className="text-gray-700">
              📅 {formatearFecha(fechaInicio)}
              {fechaFin && ` - ${formatearFecha(fechaFin)}`}
            </p>
          )}
          {!fechaInicio && (
            <p className="text-gray-500 italic">
              📅 Sin fecha asignada
            </p>
          )}
        </div>
      </div>
    )
  }

  // ============ RENDER PRINCIPAL ============
  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-navy-900 mb-2">Planning {ejercicioActual}</h1>
          <p className="text-gray-600">
            Calendario de viajes por trimestre • Sincronización automática
          </p>
          <p className="text-xs text-blue-600 mt-1">
            📦 {expedientes.length} expediente(s) en {ejercicioActual}
          </p>
        </div>
        <button onClick={openModal} className="btn-primary flex items-center gap-2">
          <Plus size={20} />
          Nuevo Viaje
        </button>
      </div>

      {/* ==================== INDICADOR DE EJERCICIO ==================== */}
      <div className="mb-8 p-4 bg-gradient-to-r from-navy-50 to-blue-50 rounded-xl border border-navy-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="text-navy-600" size={24} />
            <div>
              <p className="text-sm font-medium text-gray-700">Ejercicio {ejercicioActual}</p>
              <p className="text-xs text-gray-500">Vista de viajes del año seleccionado</p>
            </div>
          </div>
          <div className="px-4 py-2 bg-navy-600 text-white rounded-lg font-bold">
            {expedientes.length} viaje{expedientes.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* ============================================================================ */}
      {/* TRIMESTRES EN COLUMNA ÚNICA VERTICAL (100% ANCHO)                         */}
      {/* ============================================================================ */}
      <div className="space-y-10">
        
        {/* ==================== PRIMER TRIMESTRE ==================== */}
        <div className="w-full">
          <div className="mb-6 pb-4 border-b-4 border-navy-400">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-bold text-navy-900 uppercase tracking-wide">
                📅 Primer Trimestre • Enero - Marzo
              </h2>
              <span className="px-4 py-2 bg-navy-100 text-navy-900 rounded-full text-base font-bold">
                {expedientesPorTrimestre.Q1.length} viaje{expedientesPorTrimestre.Q1.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {expedientesPorTrimestre.Q1.length === 0 ? (
              <div className="col-span-full card text-center py-12">
                <Calendar className="mx-auto text-gray-400 mb-3" size={56} />
                <p className="text-gray-500 text-lg">No hay viajes programados en el primer trimestre</p>
              </div>
            ) : (
              expedientesPorTrimestre.Q1.map(renderTarjeta)
            )}
          </div>
        </div>

        {/* ==================== SEGUNDO TRIMESTRE ==================== */}
        <div className="w-full">
          <div className="mb-6 pb-4 border-b-4 border-green-400">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-bold text-green-900 uppercase tracking-wide">
                🌸 Segundo Trimestre • Abril - Junio
              </h2>
              <span className="px-4 py-2 bg-green-100 text-green-900 rounded-full text-base font-bold">
                {expedientesPorTrimestre.Q2.length} viaje{expedientesPorTrimestre.Q2.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {expedientesPorTrimestre.Q2.length === 0 ? (
              <div className="col-span-full card text-center py-12">
                <Calendar className="mx-auto text-gray-400 mb-3" size={56} />
                <p className="text-gray-500 text-lg">No hay viajes programados en el segundo trimestre</p>
              </div>
            ) : (
              expedientesPorTrimestre.Q2.map(renderTarjeta)
            )}
          </div>
        </div>

        {/* ==================== TERCER TRIMESTRE ==================== */}
        <div className="w-full">
          <div className="mb-6 pb-4 border-b-4 border-blue-400">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-bold text-blue-900 uppercase tracking-wide">
                ☀️ Tercer Trimestre • Julio - Septiembre
              </h2>
              <span className="px-4 py-2 bg-blue-100 text-blue-900 rounded-full text-base font-bold">
                {expedientesPorTrimestre.Q3.length} viaje{expedientesPorTrimestre.Q3.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {expedientesPorTrimestre.Q3.length === 0 ? (
              <div className="col-span-full card text-center py-12">
                <Calendar className="mx-auto text-gray-400 mb-3" size={56} />
                <p className="text-gray-500 text-lg">No hay viajes programados en el tercer trimestre</p>
              </div>
            ) : (
              expedientesPorTrimestre.Q3.map(renderTarjeta)
            )}
          </div>
        </div>

        {/* ==================== CUARTO TRIMESTRE ==================== */}
        <div className="w-full">
          <div className="mb-6 pb-4 border-b-4 border-purple-400">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-bold text-purple-900 uppercase tracking-wide">
                🍂 Cuarto Trimestre • Octubre - Diciembre
              </h2>
              <span className="px-4 py-2 bg-purple-100 text-purple-900 rounded-full text-base font-bold">
                {expedientesPorTrimestre.Q4.length} viaje{expedientesPorTrimestre.Q4.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {expedientesPorTrimestre.Q4.length === 0 ? (
              <div className="col-span-full card text-center py-12">
                <Calendar className="mx-auto text-gray-400 mb-3" size={56} />
                <p className="text-gray-500 text-lg">No hay viajes programados en el cuarto trimestre</p>
              </div>
            ) : (
              expedientesPorTrimestre.Q4.map(renderTarjeta)
            )}
          </div>
        </div>
      </div>

      {/* MODAL: CREAR VIAJE */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-2xl font-bold text-navy-900">Nuevo Viaje</h2>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="label">Nombre del Grupo *</label>
                  <input
                    type="text"
                    value={formData.nombre_grupo}
                    onChange={(e) => setFormData({ ...formData, nombre_grupo: e.target.value })}
                    className="input-field"
                    required
                    placeholder="Ej: LLOMBAI"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="label">Responsable</label>
                  <input
                    type="text"
                    value={formData.cliente_responsable}
                    onChange={(e) => setFormData({ ...formData, cliente_responsable: e.target.value })}
                    className="input-field"
                    placeholder="Ej: Juan Pérez"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="label">Destino *</label>
                  <input
                    type="text"
                    value={formData.destino}
                    onChange={(e) => setFormData({ ...formData, destino: e.target.value })}
                    className="input-field"
                    required
                    placeholder="Ej: Galicia"
                  />
                </div>

                <div>
                  <label className="label">Fecha de Inicio</label>
                  <input
                    type="date"
                    value={convertirEspañolAISO(formData.fechaInicio) || ''}
                    onChange={(e) => {
                      const fechaISO = e.target.value
                      const fechaEspañola = convertirISOAEspañol(fechaISO)
                      setFormData({ ...formData, fechaInicio: fechaEspañola })
                    }}
                    className="input-field"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    📅 Determina el ejercicio y trimestre del viaje
                  </p>
                </div>

                <div>
                  <label className="label">Fecha de Fin</label>
                  <input
                    type="date"
                    value={convertirEspañolAISO(formData.fechaFin) || ''}
                    onChange={(e) => {
                      const fechaISO = e.target.value
                      const fechaEspañola = convertirISOAEspañol(fechaISO)
                      setFormData({ ...formData, fechaFin: fechaEspañola })
                    }}
                    className="input-field"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="label">Estado</label>
                  <select
                    value={formData.estado}
                    onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                    className="input-field"
                  >
                    {Object.entries(ESTADOS).map(([key, estado]) => (
                      <option key={key} value={key}>{estado.label}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="label">Observaciones</label>
                  <textarea
                    value={formData.observaciones}
                    onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                    className="input-field"
                    rows="3"
                    placeholder="Notas adicionales..."
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button type="button" onClick={closeModal} className="btn-secondary flex-1">
                  Cancelar
                </button>
                <button type="submit" className="btn-primary flex-1">
                  Crear Viaje
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL DETALLE DE EXPEDIENTE ==================== */}
      {showDetalleModal && expedienteActual && (
        <ExpedienteDetalle
          expediente={expedienteActual}
          onClose={cerrarDetalle}
          onUpdate={actualizarExpediente}
          clientes={[]} // Planning no necesita lista de clientes para el modal
        />
      )}
    </div>
  )
}

export default Planning
