import React, { useState, useEffect, useRef, useMemo } from 'react'
import { X, Save, Plus, Trash2, CheckCircle } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import ProveedorForm from './ProveedorForm'
import { leerIdExpedienteSoloUseParams, resolverIdExpedienteFuenteVerdad } from '../utils/expedienteCotizacionId'

const SERVICIO_ANOMALO_ID = 'b97fbcff-eb61-4443-b4a0-77352f794d9c'

/**
 * Resuelve el tenant (empresa_id) desde el expediente que inyecta el padre.
 * Debe ejecutarse antes de cualquier lectura/escritura multi-tenant en Supabase.
 */
const resolverEmpresaIdDesdeExpediente = (expediente) => {
  if (expediente == null || typeof expediente !== 'object') {
    throw new Error(
      '[Servicios cotización] Multi-tenant: no hay expediente en contexto; no se puede resolver empresa_id antes de acceder a la base de datos.'
    )
  }
  const raw = expediente.empresa_id ?? expediente.empresa_id_int
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new Error(
      '[Servicios cotización] Multi-tenant: el expediente no incluye empresa_id ni empresa_id_int. El componente padre debe cargar el expediente completo antes de leer o guardar servicios.'
    )
  }
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    throw new Error(
      `[Servicios cotización] Multi-tenant: empresa_id del expediente no es un entero positivo válido (recibido: ${String(raw)}).`
    )
  }
  return n
}

/** Mensaje legible para fallos RLS, FK u otros errores PostgREST por tenant. */
const formatearErrorSupabaseTenant = (error) => {
  if (error == null) {
    return 'Error desconocido al guardar servicios (sin objeto error de Supabase).'
  }
  const code = error.code ?? error.status ?? 'sin código'
  const msg = error.message != null ? String(error.message) : String(error)
  const details = error.details != null ? String(error.details) : ''
  const hint = error.hint != null ? String(error.hint) : ''
  const lower = msg.toLowerCase()
  let titulo = 'Error al persistir servicios_cotizacion (PostgREST / Supabase)'
  if (code === '42501' || lower.includes('row-level security') || lower.includes('rls')) {
    titulo = 'Bloqueo por políticas del tenant (RLS): la fila no es visible o no permitida para esta empresa_id / sesión'
  }
  if (code === '23503' || lower.includes('foreign key') || lower.includes('violates foreign key')) {
    titulo = 'Violación de clave foránea: un id referenciado (expediente, proveedor, empresa, etc.) no existe o no pertenece a este tenant'
  }
  const partes = [titulo, `Código: ${code}`, `Mensaje: ${msg}`]
  if (details) partes.push(`Detalle: ${details}`)
  if (hint) partes.push(`Pista: ${hint}`)
  return partes.join('\n')
}

const esUuidServicioValido = (id) => {
  if (id == null || typeof id !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim())
}

/** Busca proveedor por id numérico de lista o `id_int` legado. */
const buscarProveedorEnLista = (proveedoresList, proveedorRef) => {
  const listaProv = Array.isArray(proveedoresList) ? proveedoresList : []
  if (proveedorRef == null || proveedorRef === '') return null
  const strId = typeof proveedorRef === 'object' && proveedorRef?.id != null
    ? String(proveedorRef.id).trim()
    : String(proveedorRef).trim()
  if (!strId) return null
  const numId = Number(strId)
  if (isNaN(numId) || numId <= 0) return null
  return (
    listaProv.find((p) => {
      const pn = Number(p?.id)
      if (!isNaN(pn) && pn === numId) return true
      const pint = p?.id_int != null ? Number(p.id_int) : NaN
      return !isNaN(pint) && pint === numId
    }) || null
  )
}

/** Cruza lista de proveedores por id numérico o id_int. */
const resolverNombreProveedorDesdeLista = (proveedoresList, proveedorRef) => {
  const pr = buscarProveedorEnLista(proveedoresList, proveedorRef)
  if (!pr) return ''
  const nombre = pr.nombreComercial ?? pr.nombre_comercial ?? pr.nombre ?? pr.nombre_fiscal ?? ''
  return String(nombre).trim()
}

const toNum = (v) => {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number' && !isNaN(v)) return v
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

const normalizarTipo = (tipo) => {
  if (!tipo) return ''
  return tipo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

const normalizarText = (text) => {
  if (!text) return ''
  return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

const generarUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const DEFAULT_SERVICE_VALUES = {
  id: null,
  proveedorId: null,
  proveedorNombreTemporal: '',
  mayorista_id: null,
  tipo: 'Hotel',
  tipo_servicio: 'Hotel',
  tipo_calculo: 'porPersona',
  nombreEspecifico: '',
  localizacion: '',
  especificacion_destino: '',
  coste_unitario: 0,
  total_servicio_manual: 0,
  margen: 0,
  noches: 1,
  dias_guia: 1,
  cantidad: 1,
  fechaRelease: '',
  releasePagado: false,
}

/**
 * Convierte filas devueltas por Supabase al modelo de UI del panel (ids canónicos, búsqueda proveedor).
 *
 * ⚠️ FUNCIÓN CRÍTICA: Ultra-defensiva - NUNCA descarta filas, aunque tengan datos incompletos.
 * Todas las filas existentes en BD deben mostrarse en la interfaz con valores por defecto.
 */
const mapearRespuestaSupabaseAServiciosUI = (dataRows, proveedoresList) => {
  const lista = Array.isArray(dataRows) ? dataRows : []
  const busquedaProveedoresRestaurada = {}
  
  // Ordenar manteniendo el orden original de BD
  const ordenados = [...lista].sort((a, b) => {
    const oa = a?.orden ?? 0
    const ob = b?.orden ?? 0
    if (oa !== ob) return oa - ob
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''))
  })
  
  const proveedores = Array.isArray(proveedoresList) ? proveedoresList : []
  
  // Mapeo ULTRA-DEFENSIVO: Cada fila se mapea SIN CONDICIONES
  // Incluso filas con datos corruptos o incompletos se muestran
  const todosMapeados = ordenados.map((row) => {
    // ID único: preservar el original o generar uno nuevo si es necesario
    const idNormalizado = row?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)
      ? row.id
      : (row?.id || generarUUID())
    
    // ID_EXPEDIENTE: Crítico para el anclaje relacional - siempre preservar
    const idExpedientePreservado = row?.id_expediente || row?.expediente_id || null
    
    // PROVEEDOR: Múltiples fallbacks para datos antiguos/corruptos
    let proveedorIdIntRow = null
    if (row?.proveedor_id_int != null && row.proveedor_id_int !== '') {
      const parsed = Number(row.proveedor_id_int)
      if (!isNaN(parsed) && parsed > 0) proveedorIdIntRow = parsed
    } else if (row?.proveedorId != null && row.proveedorId !== '') {
      const parsed = Number(row.proveedorId)
      if (!isNaN(parsed) && parsed > 0) proveedorIdIntRow = parsed
    } else if (row?.proveedor_id != null && row.proveedor_id !== '') {
      const parsed = Number(row.proveedor_id)
      if (!isNaN(parsed) && parsed > 0) proveedorIdIntRow = parsed
    }
    
    const proveedorIdUi = proveedorIdIntRow
    
    // Nombre del proveedor con múltiples fuentes de fallback
    let nombreProveedor = 'Sin proveedor'
    if (row?.proveedor_nombre && String(row.proveedor_nombre).trim()) {
      nombreProveedor = String(row.proveedor_nombre).trim()
    } else if (row?.nombre_proveedor_manual && String(row.nombre_proveedor_manual).trim()) {
      nombreProveedor = String(row.nombre_proveedor_manual).trim()
    } else if (row?.nombre_proveedor_texto && String(row.nombre_proveedor_texto).trim()) {
      nombreProveedor = String(row.nombre_proveedor_texto).trim()
    } else if (proveedorIdUi != null) {
      const nombreDesdeLista = resolverNombreProveedorDesdeLista(proveedores, proveedorIdUi)
      if (nombreDesdeLista) nombreProveedor = nombreDesdeLista
    }
    
    // Guardar para restaurar en búsqueda
    if (nombreProveedor && nombreProveedor !== 'Sin proveedor') {
      busquedaProveedoresRestaurada[idNormalizado] = nombreProveedor
    }
    
    // Campos numéricos con fallbacks seguros
    const coste = toNum(row?.coste_unitario ?? row?.precio_venta ?? 0)
    const margen = toNum(row?.margen_pax ?? row?.margen ?? 0)
    const nochesRaw = toNum(row?.noches ?? 1)
    const noches = nochesRaw > 0 ? nochesRaw : 1
    const diasGuiaRaw = toNum(row?.dias_guia ?? noches)
    const diasGuia = diasGuiaRaw > 0 ? diasGuiaRaw : noches
    const cantidadRaw = toNum(row?.cantidad ?? diasGuia ?? noches ?? 1)
    const cantidad = cantidadRaw > 0 ? cantidadRaw : 1
    
    // Tipo de cálculo
    const tipoCalculoRaw = row?.tipo_calculo || ''
    const esPorGrupo = tipoCalculoRaw === 'Total a dividir' || tipoCalculoRaw === 'porGrupo'
    
    // Tipo de servicio con fallback
    const tipoNormalizado = row?.tipo_servicio || row?.tipo || 'Hotel'
    
    // Fechas con manejo seguro
    const fechaRelease = row?.fecha_release
      ? String(row.fecha_release).split('T')[0]
      : ''
    
    // Mayorista ID con validación
    let mayoristaId = null
    if (row?.mayorista_id != null && row.mayorista_id !== '') {
      mayoristaId = typeof row.mayorista_id === 'string' && row.mayorista_id.includes('-')
        ? row.mayorista_id
        : String(row.mayorista_id)
    }
    
    // Nombre del servicio con múltiples fallbacks
    const nombreServicio = row?.nombre_servicio || row?.nombre_especifico || row?.descripcion || 'Servicio sin nombre'
    
    return {
      ...DEFAULT_SERVICE_VALUES,
      // ID único preservado
      id: idNormalizado,
      // ID_EXPEDIENTE preservado para anclaje relacional
      id_expediente: idExpedientePreservado,
      expediente_id: idExpedientePreservado,
      // Datos del servicio con fallbacks
      nombre_servicio: nombreServicio,
      nombreEspecifico: nombreServicio,
      tipo: tipoNormalizado,
      tipo_servicio: tipoNormalizado,
      // Proveedor con valores por defecto
      proveedorId: proveedorIdUi,
      proveedor_id_int: proveedorIdUi,
      proveedorNombreTemporal: nombreProveedor,
      proveedor_nombre: nombreProveedor,
      // Localización
      localizacion: row?.localizacion || '',
      especificacion_destino: row?.especificacion_destino || '',
      // Campos numéricos
      coste_unitario: coste,
      total_servicio_manual: esPorGrupo ? coste : 0,
      tipo_calculo: esPorGrupo ? 'porGrupo' : 'porPersona',
      margen: margen,
      noches: noches,
      dias_guia: diasGuia,
      cantidad: cantidad,
      // Fechas y estado
      fechaRelease: fechaRelease,
      releasePagado: !!row?.release_pagado,
      mayorista_id: mayoristaId,
      // Campos adicionales preservados
      orden: row?.orden ?? 0,
      created_at: row?.created_at || null,
      updated_at: row?.updated_at || null,
    }
  })
  
  return { serviciosUI: todosMapeados, busquedaProveedor: busquedaProveedoresRestaurada }
}

const finalizarCalculoModulo = (servicio, paxPago = 31, paxTotal = 35) => {
  const s = servicio || {}
  const pP = Math.max(1, toNum(paxPago))
  const pT = Math.max(1, toNum(paxTotal))
  const precio = toNum(s.coste_unitario)
  const n = Math.max(1, toNum(s.noches))
  const d = Math.max(1, toNum(s.dias_guia))
  const manual = toNum(s.total_servicio_manual)
  const tipoNorm = normalizarTipo(s?.tipo_servicio || s?.tipo || '')
  const esPorGrupo = s?.tipo_calculo === 'porGrupo' || s?.tipo_calculo === 'Total a dividir'
  const esAutobusOTransporte = tipoNorm === 'autobus' || tipoNorm === 'transporte'

  let totalFinal = 0
  let costePorPersona = 0

  if (esAutobusOTransporte || esPorGrupo) {
    totalFinal = manual > 0 ? manual : (tipoNorm === 'guia' || tipoNorm === 'g' ? precio * Math.max(1, toNum(s.cantidad ?? d)) : precio)
    costePorPersona = pP > 0 ? totalFinal / pP : 0
  } else {
    const factor = (tipoNorm === 'hotel') ? n : (tipoNorm === 'guia' || tipoNorm === 'g' ? d : 1)
    costePorPersona = precio * factor
    totalFinal = costePorPersona * pT
  }
  return { ...s, coste_pax: Number(costePorPersona.toFixed(2)), total_servicio: Number(totalFinal.toFixed(2)) }
}

// ─── Helpers de filtrado de proveedores ──────────────────────────────────────

/**
 * Divide la lista de proveedores en dos grupos:
 *  - tipoOficial: coinciden con el tipo del servicio (siempre visibles sin búsqueda)
 *  - otrosTipos: de otro tipo pero el nombre coincide con el texto buscado (solo con búsqueda)
 *
 * Usa normalizarText para comparaciones robustas (tildes, mayúsculas).
 */
const computarGruposProveedores = (proveedores, tipoProveedorBuscado, textoBusqueda) => {
  const tipoBuscadoNorm = normalizarText(tipoProveedorBuscado || '')
  const busquedaNorm    = normalizarText(textoBusqueda || '')

  const tipoOficial = proveedores
    .filter(p => {
      const coincideTipo = normalizarText(p.tipo || '') === tipoBuscadoNorm
      if (!busquedaNorm) return coincideTipo
      return coincideTipo && normalizarText(p.nombreComercial || '').includes(busquedaNorm)
    })
    .sort((a, b) => (a.nombreComercial || '').localeCompare(b.nombreComercial || '', 'es'))

  // Solo aparecen cuando el usuario escribe algo
  const otrosTipos = busquedaNorm
    ? proveedores
        .filter(p =>
          normalizarText(p.tipo || '') !== tipoBuscadoNorm &&
          normalizarText(p.nombreComercial || '').includes(busquedaNorm)
        )
        .sort((a, b) => (a.nombreComercial || '').localeCompare(b.nombreComercial || '', 'es'))
    : []

  return { tipoOficial, otrosTipos }
}

// ─── Dropdown de sugerencias con grupos visuales ─────────────────────────────

/**
 * Renderiza el panel desplegable del combobox de proveedor.
 *
 * Grupos:
 *  1. «{tipoServicio}» — proveedores del tipo correcto que coinciden con la búsqueda.
 *  2. «Otros tipos» — proveedores de otro tipo que coinciden por nombre (solo al buscar).
 *
 * @param {Object}   servicio            - Objeto de servicio actual
 * @param {string}   textoBusqueda       - Texto escrito en el input de búsqueda
 * @param {Array}    proveedores         - Lista completa de proveedores
 * @param {Function} mapearTipo          - mapearTipoServicioAProveedor
 * @param {Function} onSeleccionar       - (servicio, proveedor) => void
 */
const DropdownSugerencias = ({ servicio, textoBusqueda, proveedores, mapearTipo, onSeleccionar }) => {
  const tipoProveedorBuscado = mapearTipo(servicio.tipo)
  const { tipoOficial, otrosTipos } = computarGruposProveedores(proveedores, tipoProveedorBuscado, textoBusqueda)
  const totalResultados = tipoOficial.length + otrosTipos.length
  const hayBusqueda     = (textoBusqueda || '').trim().length > 0

  if (totalResultados === 0) {
    return (
      <div className="px-3 py-3 text-xs text-center">
        {!hayBusqueda ? (
          <>
            <p className="text-gray-600 mb-2">No hay proveedores de <strong>{servicio.tipo}</strong></p>
            <p className="text-green-600 font-medium">💡 Usa el botón + para añadir uno nuevo</p>
          </>
        ) : (
          <>
            <p className="text-gray-600 mb-2">No se encontró <strong>«{textoBusqueda}»</strong> en ningún tipo</p>
            <p className="text-green-600 font-medium">➕ Usa el botón + para crear nuevo proveedor</p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="py-1">
      {/* Grupo tipo oficial */}
      {tipoOficial.length > 0 && (
        <>
          {/* Cabecera de grupo solo cuando también hay resultados cruzados */}
          {otrosTipos.length > 0 && (
            <div className="px-3 py-1 text-[10px] font-bold text-blue-700 uppercase tracking-wider bg-blue-50 border-b border-blue-100 sticky top-0">
              {servicio.tipo}
            </div>
          )}
          {tipoOficial.map((proveedor, pidx) => (
            <button
              key={proveedor.id || `prov-oficial-${pidx}`}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onSeleccionar(servicio, proveedor) }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex items-center gap-2 border-b border-gray-100 transition-colors"
            >
              <span className="font-medium text-navy-900">{proveedor.nombreComercial}</span>
              {proveedor.telefono && <span className="text-gray-400">· {proveedor.telefono}</span>}
            </button>
          ))}
        </>
      )}

      {/* Grupo otros tipos (solo visible al buscar) */}
      {otrosTipos.length > 0 && (
        <>
          <div className="px-3 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50 border-y border-slate-200 sticky top-0">
            Otros tipos
          </div>
          {otrosTipos.map((proveedor, pidx) => (
            <button
              key={proveedor.id || `prov-otros-${pidx}`}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onSeleccionar(servicio, proveedor) }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2 border-b border-gray-100 transition-colors"
            >
              <span className="font-medium text-slate-700">{proveedor.nombreComercial}</span>
              <span className="ml-auto text-[9px] text-slate-400 italic bg-slate-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">{proveedor.tipo}</span>
              {proveedor.telefono && <span className="text-gray-400">· {proveedor.telefono}</span>}
            </button>
          ))}
        </>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

/**
 * ServiciosCotizacionPanel
 * Gestiona la tabla de servicios de cotización: añadir, editar, eliminar, guardar en Supabase.
 */
const ServiciosCotizacionPanel = ({
  expediente,
  expedienteId: expedienteIdProp,
  servicios,
  setServicios,
  proveedores,
  paxPago,
  totalPax,
  onRefresh,
  cargarProveedores,
  persistirCambios,
  guardarCotizacionYServiciosRef = null,
  isSaving,
  setIsSaving,
  multicotizacionMode = false,
}) => {
  const params = useParams()
  const paramsRef = useRef(params)
  paramsRef.current = params

  const idExpedienteCotizacion = useMemo(
    () => leerIdExpedienteSoloUseParams(params).idExpediente,
    [params.expedienteId, params.expedienteUUID],
  )
  const errorVinculacionExpediente = useMemo(() => {
    const { idExpediente, error } = leerIdExpedienteSoloUseParams(params)
    if (error) return error
    if (expediente?.id && String(expediente.id) !== idExpediente) {
      return 'El expediente abierto no coincide con el id en la URL.'
    }
    if (!idExpediente) return 'Sin expediente válido en la URL.'
    return null
  }, [params.expedienteId, params.expedienteUUID, expediente?.id])

  const [busquedaProveedor, setBusquedaProveedor] = useState({})
  const [mostrarSugerencias, setMostrarSugerencias] = useState({})
  const [showModal, setShowModal] = useState(false)
  const [nombreNuevoProveedor, setNombreNuevoProveedor] = useState('')
  const [tipoNuevoProveedor, setTipoNuevoProveedor] = useState('hotel')
  const [servicioIdParaProveedor, setServicioIdParaProveedor] = useState(null)
  // Estado para trackear IDs eliminados que deben borrarse de la BD al guardar
  const [idsEliminados, setIdsEliminados] = useState([])

  const serviciosInicializados = useRef(false)

  const handleFocus = (e) => e.target.select()
  const handleWheel = (e) => e.target.blur()

  const mapearTipoServicioAProveedor = (tipoServicio) => {
    const mapa = {
      Hotel: 'hotel', Mayorista: 'mayorista', Restaurante: 'restaurante', Autobús: 'autobus',
      Transporte: 'transporte', Guía: 'guia', 'Guía Local': 'guialocal', 'Entradas/Tickets': 'entradas',
      Seguro: 'seguro', Barco: 'barco', Otros: 'otros'
    }
    return mapa[tipoServicio] || normalizarTipo(tipoServicio)
  }

  const obtenerProveedorPorId = (id) => buscarProveedorEnLista(proveedores, id)

  const abrirModalProveedor = (inputValue, tipoServicioActual, servicioId) => {
    const nombreLimpio = inputValue?.trim() || ''
    const tipoProveedor = tipoServicioActual ? mapearTipoServicioAProveedor(tipoServicioActual) : 'hotel'
    setNombreNuevoProveedor(nombreLimpio)
    setTipoNuevoProveedor(tipoProveedor)
    setServicioIdParaProveedor(servicioId)
    setShowModal(true)
  }

  /** Selecciona un proveedor del dropdown (llamado desde DropdownSugerencias). */
  const handleSeleccionarProveedor = (servicio, proveedor) => {
    console.log('[DEBUG handleSeleccionarProveedor] proveedor:', proveedor)
    console.log('[DEBUG handleSeleccionarProveedor] proveedor.id:', proveedor?.id)
    console.log('[DEBUG handleSeleccionarProveedor] proveedor.nombreComercial:', proveedor?.nombreComercial)
    const proveedorIdInt = Number(proveedor?.id)
    const proveedorNombre = proveedor?.nombreComercial || proveedor?.nombre_comercial || ''
    console.log('[DEBUG handleSeleccionarProveedor] proveedorIdInt (Number):', proveedorIdInt)
    console.log('[DEBUG handleSeleccionarProveedor] proveedorNombre:', proveedorNombre)
    
    if (servicio.tipo === 'Mayorista') {
      seleccionarMayoristaYCrearHotel(servicio.id, proveedor.id, proveedor.nombreComercial)
    } else {
      actualizarServicio(servicio.id, {
        proveedorId: proveedor.id,
        proveedor_id_int: proveedorIdInt,
        proveedor_nombre: proveedorNombre
      })
      setBusquedaProveedor(prev => ({ ...prev, [servicio.id]: proveedorNombre }))
      setMostrarSugerencias(prev => ({ ...prev, [servicio.id]: false }))
    }
  }

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-provider-combobox]')) {
        setMostrarSugerencias({})
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [])

  useEffect(() => {
    if (!idExpedienteCotizacion) return
    if (multicotizacionMode) return

    let empresaIdInt
    try {
      empresaIdInt = resolverEmpresaIdDesdeExpediente(expediente)
    } catch {
      return
    }

    const cargarServicios = async () => {
      try {
        // 🔧 CORRECCIÓN CRÍTICA: Intentar primero con empresa_id del expediente
        // Si no hay resultados, probar sin filtro de empresa (para datos antiguos)
        let serviciosResponse = await supabase
          .from('servicios_cotizacion')
          .select('*')
          .eq('id_expediente', idExpedienteCotizacion)
          .eq('empresa_id', empresaIdInt)
          .order('orden', { ascending: true })
          .order('created_at', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true })

        if (serviciosResponse.error && (serviciosResponse.error.code === 'PGRST204' || String(serviciosResponse.error.message || '').includes('created_at'))) {
          serviciosResponse = await supabase
            .from('servicios_cotizacion')
            .select('*')
            .eq('id_expediente', idExpedienteCotizacion)
            .eq('empresa_id', empresaIdInt)
            .order('orden', { ascending: true })
            .order('id', { ascending: true })
        }

        // 🔧 Intento 2: Si no hay resultados, probar sin filtro de empresa_id
        if (!serviciosResponse.error && (!serviciosResponse.data || serviciosResponse.data.length === 0)) {
          console.log('[ServiciosCotizacionPanel] Sin resultados con empresa_id=' + empresaIdInt + ', probando sin filtro...')
          serviciosResponse = await supabase
            .from('servicios_cotizacion')
            .select('*')
            .eq('id_expediente', idExpedienteCotizacion)
            .order('orden', { ascending: true })
            .order('created_at', { ascending: true, nullsFirst: false })
            .order('id', { ascending: true })
        }

        if (serviciosResponse.error) return

        let dataRows = serviciosResponse.data || []
        let serviciosDesdeVersionesJson = false
        
        // ═══════════════════════════════════════════════════════════════════════════
        // 🔴 PLAN B - CONTINGENCIA PARA EXPEDIENTES ANTIGUOS
        // Si la tabla relacional tiene 0 filas, los datos están en versiones_json
        // ═══════════════════════════════════════════════════════════════════════════
        if (dataRows.length === 0 && expediente?.id) {
          console.log('[ServiciosCotizacionPanel] [PLAN B] Tabla vacía. Cargando desde versiones_json...')
          
          try {
            const { data: expDataPlanB } = await supabase
              .from('expedientes')
              .select('versiones_json')
              .eq('id', expediente.id)
              .single()
            
            const vjPlanB = expDataPlanB?.versiones_json ?? expediente?.versiones_json
            
            if (vjPlanB?.versiones && Array.isArray(vjPlanB.versiones) && vjPlanB.versiones.length > 0) {
              const primeraVersion = vjPlanB.versiones[0]
              if (primeraVersion?.servicios && Array.isArray(primeraVersion.servicios)) {
                dataRows = primeraVersion.servicios.map(s => ({
                  ...s,
                  // Asegurar campos necesarios para el mapeo
                  id_expediente: s.id_expediente || expediente.id,
                }))
                serviciosDesdeVersionesJson = true
                console.log('[ServiciosCotizacionPanel] [PLAN B] ✅ Cargados:', dataRows.length, 'servicios')
              }
            }
          } catch (err) {
            console.log('[ServiciosCotizacionPanel] [PLAN B] Error cargando versiones_json:', err)
          }
        }

        // ⚠️ CAMBIO CRÍTICO: Todas las filas de BD se muestran sin filtrar
        // El mapeo ultra-defensivo ya asegura que cada fila tenga valores por defecto
        if (dataRows.length > 0) {
          const { serviciosUI: todosMapeados, busquedaProveedor: busquedaProveedoresRestaurada } = mapearRespuestaSupabaseAServiciosUI(
            dataRows,
            proveedores
          )

          // NUNCA filtrar - todas las filas existentes deben mostrarse
          // Incluso filas antiguas con datos incompletos se muestran con valores por defecto
          const idsEnBD = new Set(dataRows.map(row => row.id))
          setServicios(prev => {
            const serviciosNuevos = prev.filter(s => s.id && !idsEnBD.has(s.id))
            return [...todosMapeados, ...serviciosNuevos]
          })
          setBusquedaProveedor(busquedaProveedoresRestaurada)
          serviciosInicializados.current = true
        } else {
          setServicios([])
          serviciosInicializados.current = false
        }
      } catch (_) {}
    }

    cargarServicios()
  }, [idExpedienteCotizacion, proveedores, multicotizacionMode, expediente?.empresa_id, expediente?.empresa_id_int])

  const añadirServicio = () => {
    const nuevoServicio = {
      ...DEFAULT_SERVICE_VALUES,
      id: generarUUID(),
      tipo: 'Hotel',
      tipo_calculo: 'porPersona',
    }
    setServicios(prev => [...prev, nuevoServicio])
    /* Persistence via manual Guardar button */
  }

  const seleccionarMayoristaYCrearHotel = (servicioId, proveedorId, nombreProveedor) => {
    console.log('[DEBUG seleccionarMayoristaYCrearHotel] proveedorId:', proveedorId)
    console.log('[DEBUG seleccionarMayoristaYCrearHotel] nombreProveedor:', nombreProveedor)
    const proveedorIdInt = Number(proveedorId)
    const proveedorNombre = nombreProveedor || ''
    console.log('[DEBUG seleccionarMayoristaYCrearHotel] proveedorIdInt:', proveedorIdInt)
    
    const servicioActual = servicios.find(s => s.id === servicioId)
    const nuevoHotel = {
      ...DEFAULT_SERVICE_VALUES,
      id: generarUUID(),
      tipo: 'Hotel',
      mayorista_id: proveedorId,
      tipo_calculo: 'porPersona',
    }
    setServicios(prev => {
      const idx2 = prev.findIndex(s => s.id === servicioId)
      if (idx2 < 0) return prev
      const actualizado = prev.map(s => s.id === servicioId ? { ...s, proveedorId, proveedor_id_int: proveedorIdInt, proveedor_nombre: proveedorNombre } : s)
      return [...actualizado.slice(0, idx2 + 1), nuevoHotel, ...actualizado.slice(idx2 + 1)]
    })
    setBusquedaProveedor(prev => ({ ...prev, [servicioId]: proveedorNombre }))
    setMostrarSugerencias(prev => ({ ...prev, [servicioId]: false }))
    /* Persistence via manual Guardar button */
  }

  const eliminarServicio = async (id) => {
    const servicio = servicios.find(s => s.id === id)
    const nombre = servicio?.descripcion || servicio?.tipo || 'este servicio'
    const esMayorista = servicio?.tipo === 'Mayorista'
    const mensajeConfirm = esMayorista
      ? '¿Estás seguro de que quieres borrar este servicio? También se eliminará el Hotel vinculado a este mayorista.'
      : `¿Estás seguro de que quieres borrar el servicio "${nombre}"?\n\nEsta acción no se puede deshacer.`

    if (!window.confirm(mensajeConfirm)) return

    const idsAEliminar = [id]
    if (esMayorista && servicio?.proveedorId) {
      const hotelesVinculados = servicios.filter(s => s.tipo === 'Hotel' && s.mayorista_id != null && String(s.mayorista_id) === String(servicio.proveedorId))
      hotelesVinculados.forEach(h => idsAEliminar.push(h.id))
    }

    // BORRADO INMEDIATO DE LA BASE DE DATOS para IDs reales (UUID)
    let borradosEnBD = 0
    for (const idElim of idsAEliminar) {
      // Verificar si es un ID real de Supabase (UUID) o un ID temporal local
      const esUuidReal = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idElim)
      if (esUuidReal) {
        console.log('[eliminarServicio] Borrando inmediatamente de BD:', idElim)
        const { error: deleteError } = await supabase
          .from('servicios_cotizacion')
          .delete()
          .eq('id', idElim)
        
        if (deleteError) {
          console.error('[eliminarServicio] Error al borrar en BD:', deleteError)
          alert('Error al eliminar servicio de la base de datos: ' + deleteError.message)
          return // No continuar si hay error
        }
        console.log('[eliminarServicio] Borrado exitoso en BD:', idElim)
        borradosEnBD++
      } else {
        console.log('[eliminarServicio] ID temporal, no existe en BD:', idElim)
      }
    }
    
    // Eliminar de la UI inmediatamente (antes de la recarga)
    const nuevosServicios = servicios.filter(s => !idsAEliminar.includes(s.id))
    setServicios(nuevosServicios)
    const busquedaActualizada = { ...busquedaProveedor }
    idsAEliminar.forEach(idElim => delete busquedaActualizada[idElim])
    setBusquedaProveedor(busquedaActualizada)
    
    // FORZAR RECARGA DESDE SUPABASE para sincronizar completamente con el padre
    if (typeof onRefresh === 'function') {
      console.log('[eliminarServicio] Forzando recarga desde BD para sincronizar padre...')
      await onRefresh()
    }
  }

  const calcularTotalFilaUI = (servicio) => {
    const s = { ...DEFAULT_SERVICE_VALUES, ...servicio }
    const tipoNorm = normalizarTipo(s.tipo || s.tipo_servicio || '')
    const precioCoste = toNum(s.coste_unitario)
    if (tipoNorm === 'guia' || tipoNorm === 'g') {
      const cantidad = Math.max(1, toNum(s.cantidad ?? s.dias_guia ?? 1))
      return precioCoste * cantidad
    }
    const fila = {
      ...s,
      tipo_calculo: s.tipo_calculo === 'porGrupo' || s.tipo_calculo === 'Total a dividir' ? 'porGrupo' : 'porPersona',
      coste_unitario: precioCoste,
      total_servicio_manual: toNum(s.total_servicio_manual),
    }
    const { total_servicio } = finalizarCalculoModulo(fila, paxPago, totalPax)
    return toNum(total_servicio)
  }

  const actualizarServicio = (id, campoOrUpdates, valorOrOpts, opts = {}) => {
    const isMulti = typeof campoOrUpdates === 'object' && campoOrUpdates !== null && !Array.isArray(campoOrUpdates)
    const updates = isMulti ? campoOrUpdates : { [campoOrUpdates]: valorOrOpts }
    const serviciosActualizados = servicios.map(s => (s.id === id ? { ...s, ...updates } : s))
    setServicios(serviciosActualizados)
    /* No auto-save on blur: all persistence via manual Guardar button to avoid focus loss and save loops */
  }

  const buildDatosParaSupabase = (servicio, idExpedienteCanonico, empresaIdInt) => {
    const nochesFinal = Math.max(1, toNum(servicio?.noches))
    const tipoCalc = servicio?.tipo_calculo === 'porGrupo' || servicio?.tipo_calculo === 'Total a dividir' ? 'porGrupo' : 'porPersona'
    const precioUnitario = toNum(servicio?.coste_unitario)
    const fila = {
      ...servicio,
      tipo_calculo: tipoCalc,
      tipo_servicio: servicio?.tipo_servicio || servicio?.tipo || '',
      coste_unitario: precioUnitario,
      noches: nochesFinal,
      dias_guia: toNum(servicio?.dias_guia) || nochesFinal,
      total_servicio_manual: toNum(servicio?.total_servicio_manual) || 0,
    }
    const calculado = finalizarCalculoModulo(fila, paxPago, totalPax)
    const totalServicio = toNum(calculado?.total_servicio)

    const rawProveedorId = servicio?.proveedorId ?? servicio?.proveedor_id_int
    console.log('[DEBUG buildDatosParaSupabase] servicio.id:', servicio?.id)
    console.log('[DEBUG buildDatosParaSupabase] servicio.proveedorId:', servicio?.proveedorId)
    console.log('[DEBUG buildDatosParaSupabase] servicio.proveedor_id_int:', servicio?.proveedor_id_int)
    console.log('[DEBUG buildDatosParaSupabase] rawProveedorId:', rawProveedorId)
    console.log('[DEBUG buildDatosParaSupabase] rawProveedorId != null:', rawProveedorId != null)
    console.log('[DEBUG buildDatosParaSupabase] rawProveedorId !== \'\':', rawProveedorId !== '')
    console.log('[DEBUG buildDatosParaSupabase] !isNaN(Number(rawProveedorId)):', !isNaN(Number(rawProveedorId)))
    console.log('[DEBUG buildDatosParaSupabase] Number(rawProveedorId) > 0:', Number(rawProveedorId) > 0)
    const proveedorIdInt = rawProveedorId != null && rawProveedorId !== '' && !isNaN(Number(rawProveedorId)) && Number(rawProveedorId) > 0
      ? Number(rawProveedorId)
      : null
    console.log('[DEBUG buildDatosParaSupabase] proveedorIdInt FINAL:', proveedorIdInt)

    const textoBusquedaProveedor = servicio?.id != null && busquedaProveedor[servicio.id] !== undefined
      ? String(busquedaProveedor[servicio.id]).trim()
      : ''
    const nombreTemporalTrim = (servicio?.proveedorNombreTemporal && String(servicio.proveedorNombreTemporal).trim()) || ''

    let proveedorNombrePayload = null
    if (proveedorIdInt != null) {
      const desdeLista = resolverNombreProveedorDesdeLista(proveedores, proveedorIdInt)
      const desdeServicio = String(servicio?.proveedor_nombre ?? servicio?.nombre_proveedor_texto ?? '').trim()
      const combinado = desdeLista || desdeServicio || textoBusquedaProveedor
      proveedorNombrePayload = combinado || null
    } else {
      proveedorNombrePayload = nombreTemporalTrim || textoBusquedaProveedor || null
    }

    const tipoNorm = normalizarTipo(servicio?.tipo || servicio?.tipo_servicio || '')
    const cantidadGuia = Math.max(1, toNum(servicio?.cantidad ?? servicio?.dias_guia ?? nochesFinal))
    const totalServicioFinal = (tipoNorm === 'guia' || tipoNorm === 'g')
      ? toNum(precioUnitario) * cantidadGuia
      : toNum(totalServicio)

    const conceptoPrincipal = String(
      servicio?.nombre_servicio
      ?? servicio?.nombreEspecifico
      ?? servicio?.nombre_especifico
      ?? servicio?.descripcion
      ?? servicio?.tipo
      ?? servicio?.tipo_servicio
      ?? 'Servicio'
    ).trim() || 'Servicio'
    const nombre_especifico = String(
      servicio?.nombreEspecifico ?? servicio?.nombre_especifico ?? conceptoPrincipal
    ).trim() || conceptoPrincipal

    const tipoServicioUi = servicio?.tipo_servicio || servicio?.tipo || 'Hotel'
    const cantidadPayload = (tipoNorm === 'guia' || tipoNorm === 'g')
      ? cantidadGuia
      : Math.max(1, toNum(servicio?.cantidad ?? servicio?.noches ?? 1))
    const idExpedienteStr = String(idExpedienteCanonico ?? '').trim()
    if (!idExpedienteStr) {
      console.warn('[ServiciosCotizacion] buildDatosParaSupabase: id_expediente vacío; la fila no debería enviarse a Supabase.')
    }

    return {
      id_expediente: idExpedienteStr,
      empresa_id: Math.trunc(Number(empresaIdInt)),
      tipo_servicio: tipoServicioUi,
      nombre_servicio: conceptoPrincipal,
      nombre_especifico,
      localizacion: servicio?.localizacion || '',
      especificacion_destino: (servicio?.especificacion_destino && String(servicio.especificacion_destino).trim()) || null,
      coste_unitario: toNum(precioUnitario),
      total_servicio: totalServicioFinal,
      precio_venta: toNum(precioUnitario),
      margen_pax: toNum(servicio?.margen),
      noches: nochesFinal,
      dias_guia: (tipoNorm === 'guia' || tipoNorm === 'g') ? cantidadGuia : nochesFinal,
      cantidad: cantidadPayload,
      fecha_release: servicio?.fechaRelease || null,
      release_pagado: !!servicio?.releasePagado,
      tipo_calculo: tipoCalc === 'porGrupo' ? 'Total a dividir' : 'porPersona',
      proveedor_id_int: proveedorIdInt,
      proveedor_nombre: proveedorNombrePayload,
      mayorista_id: (() => {
        const v = servicio?.mayorista_id
        if (v == null || v === '' || v === undefined) return null
        const str = String(v)
        const esUuidValido = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
        return esUuidValido ? str : null
      })(),
    }
  }
  const guardarTodosServiciosEnSupabase = async (serviciosLista) => {
    const listaServicios = Array.isArray(serviciosLista) ? serviciosLista : []
    const paramsAlClic = paramsRef.current
    const idDesdeRuta = leerIdExpedienteSoloUseParams(paramsAlClic).idExpediente
    const { idExpediente: idCanonico, error: errResolucionExp } = resolverIdExpedienteFuenteVerdad({
      expediente,
      expedienteIdProp,
      idDesdeRuta,
    })

    if (!idCanonico) {
      const msg = errResolucionExp || 'No se pudo resolver un id de expediente válido (URL, prop o fila expediente).'
      console.error('[ServiciosCotizacion] guardar abortado:', msg)
      return { ok: false, error: msg }
    }

    let empresaIdInt
    try {
      empresaIdInt = resolverEmpresaIdDesdeExpediente(expediente)
    } catch (errTenant) {
      const msg = errTenant instanceof Error ? errTenant.message : String(errTenant)
      console.error('[ServiciosCotizacion] guardar abortado (tenant):', msg)
      return { ok: false, error: msg }
    }

    const empresaIdFila = Math.trunc(Number(empresaIdInt))

    try {
      const { data: existentes, error: errorEx } = await supabase
        .from('servicios_cotizacion')
        .select('*')
        .eq('id_expediente', idCanonico)
        .eq('empresa_id', empresaIdFila)

      if (errorEx != null) {
        const detalle = formatearErrorSupabaseTenant(errorEx)
        console.error('[ServiciosCotizacion] Error leyendo servicios existentes:', errorEx)
        alert(detalle)
        return { ok: false, error: detalle, userAlerted: true }
      }

      const existentesMap = new Map((existentes || []).map((e) => [String(e.id).trim(), e]))

      const filasValidadas = listaServicios
        .filter((s) => s && String(s.id || '').trim() !== SERVICIO_ANOMALO_ID)
        .map((s, index) => {
          const idFinal = esUuidServicioValido(s.id) ? String(s.id).trim() : generarUUID()
          const dbRecord = existentesMap.get(idFinal) || {}

          const datosUI = buildDatosParaSupabase(s, idCanonico, empresaIdInt)

          // Crear objeto base con los datos necesarios
          const filaBase = {
            ...dbRecord,
            ...datosUI,
            id: idFinal,
            id_expediente: String(idCanonico || '').trim(),
            empresa_id: Math.trunc(Number(empresaIdFila)),
            orden: index,
          }
          
          // CLONAR el objeto antes de limpiar campos UI (evita mutar estado de React)
          const filaLimpia = { ...filaBase }
          
          // Limpiar campos no permitidos por la tabla
          delete filaLimpia.descripcion
          delete filaLimpia.tipo
          delete filaLimpia.proveedor_id  // Se usa proveedor_id_int, no proveedor_id
          delete filaLimpia.proveedorId   // Campo UI, no existe en BD
          delete filaLimpia.nombre_proveedor_texto  // Campo UI legacy
          delete filaLimpia.proveedorNombreTemporal // Campo UI temporal
          delete filaLimpia.created_at    // Gestionado por Supabase
          delete filaLimpia.updated_at    // Gestionado por Supabase
          
          console.log(`[DEBUG guardarTodosServiciosEnSupabase] Fila ${index}:`)
          console.log(`  - id: ${filaLimpia.id}`)
          console.log(`  - id_expediente: ${filaLimpia.id_expediente}`)
          console.log(`  - empresa_id: ${filaLimpia.empresa_id}`)
          console.log(`  - proveedor_id_int:`, filaLimpia.proveedor_id_int)
          console.log(`  - proveedor_nombre:`, filaLimpia.proveedor_nombre)
          console.log(`  - tipo_servicio:`, filaLimpia.tipo_servicio)
          
          return filaLimpia
        })

      if (filasValidadas.length === 0) {
        return { ok: true }
      }

      console.log('📦 PAYLOAD ENVIADO A SUPABASE:', filasValidadas)
      console.log('📦 CANTIDAD DE FILAS A GUARDAR:', filasValidadas.length)
      
      // Mostrar primera fila como ejemplo para debug
      if (filasValidadas.length > 0) {
        console.log('📦 EJEMPLO PRIMERA FILA:', JSON.stringify(filasValidadas[0], null, 2))
      }

      // Hacer upsert SIN .select() primero para verificar si hay error de inserción
      const upsertRes = await supabase
        .from('servicios_cotizacion')
        .upsert(filasValidadas, { onConflict: 'id' })

      console.log('[DEBUG] Respuesta de Supabase (sin select) - upsertRes:', upsertRes)
      console.log('[DEBUG] Respuesta de Supabase (sin select) - error:', upsertRes.error)
      
      if (upsertRes.error) {
        console.error('[ServiciosCotizacion] ❌ ERROR EN UPSERT:', upsertRes.error)
        alert('ERROR AL GUARDAR: ' + upsertRes.error.message)
        return { ok: false, error: upsertRes.error.message, userAlerted: true }
      }

      // Borrar de la BD los servicios eliminados en la UI
      if (idsEliminados.length > 0) {
        console.log('🗑️ IDs A ELIMINAR DE LA BASE DE DATOS:', idsEliminados)
        const deleteRes = await supabase
          .from('servicios_cotizacion')
          .delete()
          .in('id', idsEliminados)
        
        console.log('[DEBUG] Respuesta de delete:', deleteRes)
        
        if (deleteRes.error) {
          console.error('[ServiciosCotizacion] ❌ ERROR AL ELIMINAR:', deleteRes.error)
          alert('Error al eliminar servicios: ' + deleteRes.error.message)
          // Continuamos aunque haya error en delete, para no bloquear el guardado
        } else {
          console.log('✅ Servicios eliminados correctamente de la BD')
        }
      }

      // Si el upsert fue exitoso, hacer select separado
      console.log('[DEBUG] Upsert exitoso, consultando filas guardadas...')
      const selectRes = await supabase
        .from('servicios_cotizacion')
        .select('*')
        .eq('id_expediente', idCanonico)
        .eq('empresa_id', empresaIdFila)
      
      console.log('[DEBUG] Select después de upsert - selectRes:', selectRes)
      console.log('[DEBUG] Select después de upsert - data:', selectRes.data)
      console.log('[DEBUG] Select después de upsert - count:', selectRes.data?.length)

      if (upsertRes.error != null) {
        const detalle = formatearErrorSupabaseTenant(upsertRes.error)
        console.error('[ServiciosCotizacion] ❌ ERROR EN UPSERT:', upsertRes.error)
        console.error('[ServiciosCotizacion] Código de error:', upsertRes.error.code)
        console.error('[ServiciosCotizacion] Mensaje:', upsertRes.error.message)
        console.error('[ServiciosCotizacion] Detalles:', upsertRes.error.details)
        alert('ERROR AL GUARDAR: ' + detalle)
        return { ok: false, error: detalle, userAlerted: true }
      }

      const dataDevuelta = selectRes.data || []
      console.log('[DEBUG] dataDevuelta:', dataDevuelta)
      console.log('[DEBUG] dataDevuelta es array:', Array.isArray(dataDevuelta))
      console.log('[DEBUG] Cantidad de filas devueltas:', dataDevuelta?.length)
      
      if (selectRes.error) {
        console.error('[ServiciosCotizacion] ❌ ERROR EN SELECT POST-UPSERT:', selectRes.error)
        alert('Error al leer datos guardados: ' + selectRes.error.message)
        return { ok: false, error: selectRes.error.message, userAlerted: true }
      }

      const { serviciosUI, busquedaProveedor: bpSync } = mapearRespuestaSupabaseAServiciosUI(dataDevuelta, proveedores)
      setServicios(serviciosUI)
      setBusquedaProveedor(bpSync)
      
      // Limpiar el array de IDs eliminados después de guardar exitosamente
      setIdsEliminados([])
      console.log('✅ Guardado completo - idsEliminados limpiado')

      return { ok: true }
    } catch (error) {
      const detalle = formatearErrorSupabaseTenant(error)
      console.error('[ServiciosCotizacion] Error en el motor de guardado:', error)
      alert(detalle)
      return { ok: false, error: detalle, userAlerted: true }
    }
  }
  const handleGuardar = async () => {
    console.log('🔥 CLICK CAPTURADO EN UI')
    if (isSaving) {
      console.warn('[ServiciosCotizacionPanel] Guardar omitido: isSaving ya es true')
      return { ok: false, error: 'Ya se está guardando' }
    }
    setIsSaving(true)

    try {
      let resultadoForm = { ok: true }
      if (typeof persistirCambios === 'function') {
        resultadoForm = await persistirCambios()
        if (resultadoForm == null || typeof resultadoForm.ok !== 'boolean') {
          resultadoForm = { ok: false, error: 'persistirCambios no devolvió { ok: boolean }' }
        }
      }

      if (!resultadoForm.ok) {
        const msg = resultadoForm.error || 'Error desconocido'
        alert('❌ Error al guardar: ' + msg)
        return { ok: false, error: msg }
      }

      const serviciosUpsert = Array.isArray(servicios) ? [...servicios] : []
      const resultadoServicios = await guardarTodosServiciosEnSupabase(serviciosUpsert)
      if (resultadoServicios == null || typeof resultadoServicios.ok !== 'boolean') {
        throw new Error('guardarTodosServiciosEnSupabase no devolvió { ok: boolean }')
      }

      if (resultadoServicios.ok) {
        if (onRefresh) await onRefresh()
        alert('✅ Todo guardado correctamente. ERP protegido.')
        return { ok: true }
      }
      const msg = resultadoServicios.error || 'Error desconocido'
      if (!resultadoServicios.userAlerted) {
        alert('❌ Error al guardar: ' + msg)
      }
      return { ok: false, error: msg, userAlerted: resultadoServicios.userAlerted }
    } catch (err) {
      console.error('❌ Error crítico en handleGuardar:', err)
      alert('ERROR: ' + (err?.message || String(err)))
      return { ok: false, error: err?.message || String(err) }
    } finally {
      setIsSaving(false)
    }
  }
  if (guardarCotizacionYServiciosRef) {
    guardarCotizacionYServiciosRef.current = handleGuardar
  }
  // Aviso de cambios sin guardar al intentar cerrar/navegar fuera
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isSaving) return  // está guardando, no interrumpir
      e.preventDefault()
      e.returnValue = 'Tienes cambios sin guardar en la cotización. ¿Seguro que quieres salir?'
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isSaving])

  return (
    <>
      {errorVinculacionExpediente ? (
        <div
          className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          <strong className="font-semibold">Error de vinculación del expediente.</strong>{' '}
          {errorVinculacionExpediente}
        </div>
      ) : null}
      <div className="bg-white rounded-xl shadow-md p-4 sm:p-6 border border-gray-200">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
          <h3 className="text-xl font-bold text-navy-900">Servicios del Viaje</h3>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleGuardar}
              disabled={!!isSaving}
              className="btn-secondary w-full sm:w-auto flex items-center justify-center gap-2 px-3 py-2.5 sm:py-1.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Save size={16} />
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
          </div>
        {servicios.length === 0 ? (
          <div className="space-y-4">
            <p className="text-center text-gray-500 py-8">No hay servicios añadidos</p>
            <button onClick={añadirServicio} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
              <Plus size={20} />
              Añadir Primer Servicio
            </button>
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-visible">
              <table className="w-full whitespace-nowrap" style={{ tableLayout: 'fixed', minWidth: '860px' }}>
                <colgroup>
                  <col style={{ width: '160px', minWidth: '160px', maxWidth: '160px' }} />
                  <col style={{ width: '170px', minWidth: '170px', maxWidth: '170px' }} />
                  <col style={{ width: '130px', minWidth: '130px', maxWidth: '130px' }} />
                  <col style={{ width: '50px', minWidth: '50px', maxWidth: '50px' }} />
                  <col style={{ width: '70px', minWidth: '70px', maxWidth: '70px' }} />
                  <col style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }} />
                  <col style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }} />
                  <col style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }} />
                  <col style={{ width: '40px', minWidth: '40px', maxWidth: '40px' }} />
                </colgroup>
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-1 py-2 text-left text-xs font-semibold text-gray-700" style={{ width: '160px' }}>Servicio</th>
                    <th className="px-1 py-2 text-left text-xs font-semibold text-gray-700" style={{ width: '170px' }}>Proveedor</th>
                    <th className="px-1 py-2 text-left text-xs font-semibold text-gray-700" style={{ width: '130px' }}>Detalle</th>
                    <th className="px-1 py-2 text-center text-xs font-semibold text-gray-700" style={{ width: '50px' }}>Cant.</th>
                    <th className="px-1 py-2 text-center text-xs font-semibold text-gray-700" style={{ width: '70px' }}>Precio</th>
                    <th className="px-1 py-2 text-center text-xs font-semibold text-gray-700" style={{ width: '120px' }}>Modo</th>
                    <th className="px-1 py-2 text-right text-xs font-semibold text-gray-700" style={{ width: '90px' }}>Total</th>
                    <th className="px-1 py-2 text-center text-xs font-semibold text-gray-700" style={{ width: '120px' }}>Release</th>
                    <th className="px-1 py-2 text-center text-xs font-semibold text-gray-700" style={{ width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {servicios.map((servicio, idx) => (
                    <tr key={servicio.id || `svc-${idx}`} className="border-t border-gray-200 hover:bg-gray-50 whitespace-nowrap">
                      <td className="px-1 py-2 align-middle" onClick={(e) => e.stopPropagation()} style={{ width: '160px', minWidth: '160px', maxWidth: '160px' }}>
                        <select
                          value={servicio.tipo}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation()
                            const nuevoTipo = e.target.value
                            const updates = { tipo: nuevoTipo, tipo_servicio: nuevoTipo }
                            if (nuevoTipo === 'Autobús' || nuevoTipo === 'Transporte') {
                              updates.tipo_calculo = 'porGrupo'
                              if (servicio.coste_unitario) updates.total_servicio_manual = toNum(servicio.coste_unitario)
                            }
                            if (servicio.proveedorId) {
                              const proveedorActual = obtenerProveedorPorId(servicio.proveedorId)
                              const tipoProveedorActual = mapearTipoServicioAProveedor(proveedorActual?.tipo || '')
                              const nuevoTipoProveedor = mapearTipoServicioAProveedor(nuevoTipo)
                              if (tipoProveedorActual !== nuevoTipoProveedor) {
                                updates.proveedorId = null
                                setBusquedaProveedor(prev => ({ ...prev, [servicio.id]: '' }))
                              }
                            }
                            actualizarServicio(servicio.id, updates)
                            setMostrarSugerencias(prev => ({ ...prev, [servicio.id]: true }))
                          }}
                          className="input-field text-xs transition-all"
                          style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0', width: '158px', minWidth: '158px', maxWidth: '158px' }}
                          onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                            actualizarServicio(servicio.id, { tipo: e.target.value, tipo_servicio: e.target.value })
                          }}
                        >
                          <option>Hotel</option>
                          <option>Mayorista</option>
                          <option>Restaurante</option>
                          <option>Autobús</option>
                          <option>Transporte</option>
                          <option>Guía</option>
                          <option>Guía Local</option>
                          <option>Entradas/Tickets</option>
                          <option>Seguro</option>
                          <option>Barco</option>
                          <option>Otros</option>
                        </select>
                      </td>

                      <td className="px-1 py-2 align-middle" onClick={(e) => e.stopPropagation()} style={{ width: '170px', minWidth: '170px', maxWidth: '170px' }}>
                        <div className="relative" data-provider-combobox>
                          <div className="flex flex-row gap-1.5 items-center flex-nowrap w-full">
                            <div className="relative flex-1 min-w-0">
                              <input
                                type="text"
                                value={busquedaProveedor[servicio.id] !== undefined ? busquedaProveedor[servicio.id] : (obtenerProveedorPorId(servicio.proveedorId)?.nombreComercial || '')}
                                onChange={(e) => {
                                  const inputValue = e.target.value
                                  setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: inputValue })
                                  setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: true })
                                }}
                                onFocus={(e) => {
                                  setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: true })
                                  if (!busquedaProveedor[servicio.id]) setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: '' })
                                  e.target.style.borderColor = '#3b82f6'
                                  e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                                }}
                                placeholder="Pendiente"
                                className="input-field text-xs w-full pr-8 transition-all"
                                style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                                onBlur={(e) => {
                                  e.target.style.borderColor = '#e2e8f0'
                                  e.target.style.boxShadow = 'none'
                                  setTimeout(() => {
                                    setMostrarSugerencias(prev => ({ ...prev, [servicio.id]: false }))
                                    if (!servicio.proveedorId && busquedaProveedor[servicio.id]) {
                                      setBusquedaProveedor(prev => ({ ...prev, [servicio.id]: '' }))
                                    }
                                  }, 120)
                                }}
                              />
                              {(busquedaProveedor[servicio.id] || servicio.proveedorId) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBusquedaProveedor(prev => ({ ...prev, [servicio.id]: '' }))
                                    actualizarServicio(servicio.id, 'proveedorId', null)
                                    setMostrarSugerencias(prev => ({ ...prev, [servicio.id]: false }))
                                  }}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10 transition-colors"
                                  title="Limpiar"
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => abrirModalProveedor(busquedaProveedor[servicio.id] || '', servicio.tipo, servicio.id)}
                              className="flex-shrink-0 w-8 h-8 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center justify-center transition-colors"
                              style={{ width: '32px', minWidth: '32px' }}
                              title="Añadir nuevo proveedor"
                            >
                              <Plus size={16} />
                            </button>
                          </div>

                          {mostrarSugerencias[servicio.id] && (
                            <div className="absolute left-0 top-full mt-1 w-full min-w-[190px] bg-white border border-gray-300 rounded-lg shadow-xl max-h-52 overflow-y-auto" style={{ zIndex: 9999 }}>
                              <DropdownSugerencias
                                servicio={servicio}
                                textoBusqueda={busquedaProveedor[servicio.id] || ''}
                                proveedores={proveedores}
                                mapearTipo={mapearTipoServicioAProveedor}
                                onSeleccionar={handleSeleccionarProveedor}
                              />
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-1 py-2 align-middle" onClick={(e) => e.stopPropagation()} style={{ width: '130px', minWidth: '130px', maxWidth: '130px' }}>
                        <input
                          type="text"
                          value={servicio.especificacion_destino || ''}
                          onChange={(e) => actualizarServicio(servicio.id, 'especificacion_destino', e.target.value)}
                          onFocus={(e) => e.target.select()}
                          onBlur={(e) => actualizarServicio(servicio.id, 'especificacion_destino', e.target.value)}
                          placeholder={servicio.tipo === 'Guía Local' ? 'ej. Santiago' : servicio.tipo === 'Entradas/Tickets' ? 'ej. Catedral' : 'Detalle...'}
                          className="input-field text-xs py-1.5 px-2 w-full"
                          style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '8px', border: '1px solid #e2e8f0', width: '100%', minWidth: 0, maxWidth: '130px' }}
                        />
                      </td>

                      <td className="px-1 py-2 align-middle" style={{ width: '50px', minWidth: '50px', maxWidth: '50px' }}>
                        <div className="flex justify-center">
                          {servicio.tipo === 'Hotel' ? (
                            <input
                              type="number"
                              value={servicio.noches || 1}
                              onChange={(e) => {
                                const valor = e.target.value
                                const valorNumerico = valor === '' ? 1 : Number(valor) || 1
                                actualizarServicio(servicio.id, 'noches', Math.max(1, valorNumerico))
                              }}
                              onWheel={handleWheel}
                              onFocus={(e) => { e.target.select(); handleFocus(e); e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }}
                              onBlur={(e) => {
                                e.target.style.borderColor = '#e2e8f0'
                                e.target.style.boxShadow = 'none'
                                const valor = e.target.value
                                const valorNumerico = Math.max(1, valor === '' ? 1 : Number(valor) || 1)
                                actualizarServicio(servicio.id, 'noches', valorNumerico)
                              }}
                              className="input-field text-xs text-center transition-all"
                              style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0', width: '50px', minWidth: '50px', maxWidth: '50px' }}
                              min="1"
                              placeholder="1"
                            />
                          ) : servicio.tipo === 'Guía' ? (
                            <input
                              type="number"
                              value={servicio.cantidad ?? servicio.dias_guia ?? 1}
                              onChange={(e) => {
                                const valor = e.target.value
                                const valorNumerico = valor === '' ? 1 : Number(valor) || 1
                                actualizarServicio(servicio.id, 'cantidad', Math.max(1, valorNumerico))
                              }}
                              onWheel={handleWheel}
                              onBlur={(e) => {
                                e.target.style.borderColor = '#e2e8f0'
                                e.target.style.boxShadow = 'none'
                                const valor = e.target.value
                                const valorNumerico = Math.max(1, valor === '' ? 1 : Number(valor) || 1)
                                actualizarServicio(servicio.id, 'cantidad', valorNumerico)
                              }}
                              onFocus={(e) => { e.target.select(); handleFocus(e); e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }}
                              className="input-field text-xs text-center transition-all"
                              style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0', width: '50px', minWidth: '50px', maxWidth: '50px' }}
                              min="1"
                              placeholder="1"
                            />
                          ) : (
                            <span className="text-gray-600 text-xs font-medium">1</span>
                          )}
                        </div>
                      </td>

                      <td className="px-1 py-2 align-middle" style={{ width: '70px', minWidth: '70px', maxWidth: '70px' }}>
                        <div className="flex justify-end">
                          <input
                            type="number"
                            step="0.01"
                            value={servicio.coste_unitario === '' || servicio.coste_unitario == null ? '' : servicio.coste_unitario}
                            onWheel={handleWheel}
                            onChange={(e) => {
                              const valorInput = e.target.value
                              if (valorInput === '' || valorInput === '-') {
                                actualizarServicio(servicio.id, servicio.tipo_calculo === 'porGrupo'
                                  ? { coste_unitario: '', total_servicio_manual: '' }
                                  : { coste_unitario: '' })
                                return
                              }
                              const valorLimpio = valorInput.replace(/,/g, '.')
                              const valorNumerico = parseFloat(valorLimpio)
                              if (!isNaN(valorNumerico)) {
                                actualizarServicio(servicio.id, servicio.tipo_calculo === 'porGrupo'
                                  ? { coste_unitario: valorNumerico, total_servicio_manual: valorNumerico }
                                  : { coste_unitario: valorNumerico })
                              } else {
                                actualizarServicio(servicio.id, 'coste_unitario', valorLimpio)
                              }
                            }}
                            onFocus={(e) => { e.target.select(); handleFocus(e); e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }}
                            onBlur={(e) => {
                              const valor = e.target.value
                              if (valor !== '' && valor !== '-') {
                                const valorNumerico = parseFloat(valor.replace(/,/g, '.'))
                                if (!isNaN(valorNumerico)) {
                                  actualizarServicio(servicio.id, servicio.tipo_calculo === 'porGrupo'
                                    ? { coste_unitario: valorNumerico, total_servicio_manual: valorNumerico }
                                    : { coste_unitario: valorNumerico })
                                }
                              } else {
                                actualizarServicio(servicio.id, servicio.tipo_calculo === 'porGrupo'
                                  ? { coste_unitario: 0, total_servicio_manual: 0 }
                                  : { coste_unitario: 0 })
                              }
                              e.target.style.borderColor = '#e2e8f0'
                              e.target.style.boxShadow = 'none'
                            }}
                            className="input-field text-xs text-right w-full transition-all"
                            style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0', width: '70px', minWidth: '70px', maxWidth: '70px' }}
                            placeholder="0.00"
                            min="0"
                          />
                        </div>
                      </td>

                      <td className="px-1 py-2 text-center align-middle" style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }}>
                        {(servicio.tipo === 'Autobús' || servicio.tipo === 'Transporte') ? (
                          <span className="text-xs font-medium text-slate-600" title="Autobús/Transporte siempre divide el total entre pasajeros de pago">Total ÷ pax</span>
                        ) : (
                          <select
                            value={servicio.tipo_calculo || 'porPersona'}
                            onChange={(e) => {
                              const nuevoModo = e.target.value
                              const updates = { tipo_calculo: nuevoModo }
                              if (nuevoModo === 'porGrupo' && servicio.coste_unitario) updates.total_servicio_manual = toNum(servicio.coste_unitario)
                              else if (nuevoModo === 'porPersona') updates.total_servicio_manual = 0
                              actualizarServicio(servicio.id, updates)
                            }}
                            className="input-field text-[10px] transition-all"
                            style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0', width: '120px', minWidth: '120px', maxWidth: '120px' }}
                            onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }}
                            onBlur={(e) => {
                              e.target.style.borderColor = '#e2e8f0'
                              e.target.style.boxShadow = 'none'
                              const nuevoModo = e.target.value
                              const updates = { tipo_calculo: nuevoModo }
                              if (nuevoModo === 'porGrupo' && servicio.coste_unitario) updates.total_servicio_manual = toNum(servicio.coste_unitario)
                              else if (nuevoModo === 'porPersona') updates.total_servicio_manual = 0
                              actualizarServicio(servicio.id, updates)
                            }}
                          >
                            <option value="porPersona">X pax</option>
                            <option value="porGrupo">÷ Todos</option>
                          </select>
                        )}
                      </td>

                      <td className="px-1 py-2 align-middle text-right" style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }}>
                        <span className="text-gray-900 text-xs font-semibold whitespace-nowrap">{calcularTotalFilaUI(servicio).toFixed(2)}€</span>
                      </td>

                      <td className="px-1 py-2 text-center align-middle" style={{ width: '120px', minWidth: '120px', maxWidth: '120px' }}>
                        <div className="flex flex-col items-center gap-1">
                          <input
                            type="date"
                            value={servicio.fechaRelease || ''}
                            onChange={(e) => actualizarServicio(servicio.id, 'fechaRelease', e.target.value || '')}
                            onFocus={(e) => { e.target.select(); e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }}
                            onBlur={(e) => {
                              e.target.style.borderColor = '#e2e8f0'
                              e.target.style.boxShadow = 'none'
                              actualizarServicio(servicio.id, 'fechaRelease', e.target.value || '')
                            }}
                            className="input-field text-center transition-all"
                            style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '4px 4px', width: '120px', minWidth: '120px', maxWidth: '120px', fontSize: '11px' }}
                          />
                          {!servicio.releasePagado && servicio.fechaRelease && (
                            <button type="button" onClick={() => marcarReleaseComoPagadoServicio(servicio.id)} className="flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded font-semibold" style={{ fontSize: '16px' }} title="Marcar como pagado"><CheckCircle size={12} /> Pagado</button>
                          )}
                          {servicio.releasePagado && (
                            <span className="text-green-600 font-semibold flex items-center gap-1" style={{ fontSize: '16px' }}><CheckCircle size={12} /> Pagado</span>
                          )}
                        </div>
                      </td>

                      <td className="px-1 py-2 text-center align-middle" style={{ width: '40px', minWidth: '40px', maxWidth: '40px' }}>
                        <button onClick={() => eliminarServicio(servicio.id)} className="text-red-600 hover:text-red-900 p-1" title="Eliminar">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-4">
              {servicios.map((servicio, idx) => (
                <div key={servicio.id || `svc-${idx}`} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-semibold text-gray-500 uppercase">Servicio</span>
                    <button onClick={() => eliminarServicio(servicio.id)} className="text-red-600 hover:text-red-900 p-1" title="Eliminar"><Trash2 size={16} /></button>
                  </div>
                  <div>
                    <select
                      value={servicio.tipo}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation()
                        const nuevoTipo = e.target.value
                        const updates = { tipo: nuevoTipo, tipo_servicio: nuevoTipo }
                        if (nuevoTipo === 'Autobús' || nuevoTipo === 'Transporte') {
                          updates.tipo_calculo = 'porGrupo'
                          if (servicio.coste_unitario) updates.total_servicio_manual = toNum(servicio.coste_unitario)
                        }
                        if (servicio.proveedorId) {
                          const proveedorActual = obtenerProveedorPorId(servicio.proveedorId)
                          const tipoProveedorActual = mapearTipoServicioAProveedor(proveedorActual?.tipo || '')
                          const nuevoTipoProveedor = mapearTipoServicioAProveedor(nuevoTipo)
                          if (tipoProveedorActual !== nuevoTipoProveedor) {
                            updates.proveedorId = null
                            setBusquedaProveedor(prev => ({ ...prev, [servicio.id]: '' }))
                          }
                        }
                        actualizarServicio(servicio.id, updates)
                        setMostrarSugerencias(prev => ({ ...prev, [servicio.id]: true }))
                      }}
                      className="input-field text-xs w-full transition-all"
                      style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                      onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0'
                        e.target.style.boxShadow = 'none'
                        actualizarServicio(servicio.id, { tipo: e.target.value, tipo_servicio: e.target.value })
                      }}
                    >
                      <option>Hotel</option>
                      <option>Mayorista</option>
                      <option>Restaurante</option>
                      <option>Autobús</option>
                      <option>Transporte</option>
                      <option>Guía</option>
                      <option>Guía Local</option>
                      <option>Entradas/Tickets</option>
                      <option>Seguro</option>
                      <option>Barco</option>
                      <option>Otros</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Proveedor</span>
                    <div className="relative" data-provider-combobox onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-row gap-1.5 items-center flex-nowrap">
                        <div className="relative flex-1 min-w-0">
                          <input
                            type="text"
                            value={busquedaProveedor[servicio.id] !== undefined ? busquedaProveedor[servicio.id] : (obtenerProveedorPorId(servicio.proveedorId)?.nombreComercial || '')}
                            onChange={(e) => { const inputValue = e.target.value; setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: inputValue }); setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: true }) }}
                            onFocus={(e) => { setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: true }); if (!busquedaProveedor[servicio.id]) setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: '' }); e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }}
                            placeholder="Pendiente"
                            className="input-field text-xs w-full pr-8 transition-all"
                            style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                            onBlur={(e) => {
                              e.target.style.borderColor = '#e2e8f0'
                              e.target.style.boxShadow = 'none'
                              setTimeout(() => {
                                setMostrarSugerencias(prev => ({ ...prev, [servicio.id]: false }))
                                if (!servicio.proveedorId && busquedaProveedor[servicio.id]) setBusquedaProveedor(prev => ({ ...prev, [servicio.id]: '' }))
                              }, 120)
                            }}
                          />
                          {(busquedaProveedor[servicio.id] || servicio.proveedorId) && (
                            <button onClick={() => { setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: '' }); actualizarServicio(servicio.id, 'proveedorId', null); setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: false }) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10" title="Limpiar"><X size={14} /></button>
                          )}
                        </div>
                        <button type="button" onClick={() => abrirModalProveedor(busquedaProveedor[servicio.id] || '', servicio.tipo, servicio.id)} className="flex-shrink-0 w-8 h-8 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center justify-center transition-colors" title="Añadir nuevo proveedor"><Plus size={16} /></button>
                      </div>
                      {mostrarSugerencias[servicio.id] && (
                        <div className="absolute left-0 top-full mt-1 w-full min-w-[190px] bg-white border border-gray-300 rounded-lg shadow-xl max-h-52 overflow-y-auto" style={{ zIndex: 9999 }}>
                          <DropdownSugerencias
                            servicio={servicio}
                            textoBusqueda={busquedaProveedor[servicio.id] || ''}
                            proveedores={proveedores}
                            mapearTipo={mapearTipoServicioAProveedor}
                            onSeleccionar={handleSeleccionarProveedor}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Detalle</span>
                    <input
                      type="text"
                      value={servicio.especificacion_destino || ''}
                      onChange={(e) => actualizarServicio(servicio.id, 'especificacion_destino', e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onBlur={(e) => actualizarServicio(servicio.id, 'especificacion_destino', e.target.value)}
                      placeholder={servicio.tipo === 'Guía Local' ? 'ej. Santiago' : servicio.tipo === 'Entradas/Tickets' ? 'ej. Catedral' : 'Detalle...'}
                      className="input-field text-xs w-full py-1.5 px-2"
                      style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Cantidad</span>
                      {servicio.tipo === 'Hotel' ? (
                        <input type="number" value={servicio.noches || 1} onChange={(e) => { const valor = e.target.value; const valorNumerico = valor === '' ? 1 : Number(valor) || 1; actualizarServicio(servicio.id, 'noches', Math.max(1, valorNumerico)) }} onWheel={handleWheel} onFocus={(e) => { e.target.select(); handleFocus(e); e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }} onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; const valor = e.target.value; const valorNumerico = Math.max(1, valor === '' ? 1 : Number(valor) || 1); actualizarServicio(servicio.id, 'noches', valorNumerico) }} className="input-field text-xs text-center w-full transition-all" style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }} min="1" placeholder="1" />
                      ) : servicio.tipo === 'Guía' ? (
                        <input type="number" value={servicio.cantidad ?? servicio.dias_guia ?? 1} onChange={(e) => { const valor = e.target.value; const valorNumerico = valor === '' ? 1 : Number(valor) || 1; actualizarServicio(servicio.id, 'cantidad', Math.max(1, valorNumerico)) }} onWheel={handleWheel} onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; const valor = e.target.value; const valorNumerico = Math.max(1, valor === '' ? 1 : Number(valor) || 1); actualizarServicio(servicio.id, 'cantidad', valorNumerico) }} onFocus={(e) => { e.target.select(); handleFocus(e); e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }} className="input-field text-xs text-center w-full transition-all" style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }} min="1" placeholder="1" />
                      ) : (
                        <span className="text-gray-600 text-xs font-medium block py-2">1</span>
                      )}
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Precio</span>
                      <input type="number" step="0.01" value={servicio.coste_unitario === '' || servicio.coste_unitario == null ? '' : servicio.coste_unitario} onWheel={handleWheel} onChange={(e) => { const valorInput = e.target.value; if (valorInput === '' || valorInput === '-') { actualizarServicio(servicio.id, servicio.tipo_calculo === 'porGrupo' ? { coste_unitario: '', total_servicio_manual: '' } : { coste_unitario: '' }); return; } const valorLimpio = valorInput.replace(/,/g, '.'); const valorNumerico = parseFloat(valorLimpio); if (!isNaN(valorNumerico)) { actualizarServicio(servicio.id, servicio.tipo_calculo === 'porGrupo' ? { coste_unitario: valorNumerico, total_servicio_manual: valorNumerico } : { coste_unitario: valorNumerico }); } else { actualizarServicio(servicio.id, 'coste_unitario', valorLimpio); } }} onFocus={(e) => { e.target.select(); handleFocus(e); e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }} onBlur={(e) => { const valor = e.target.value; if (valor !== '' && valor !== '-') { const valorNumerico = parseFloat(valor.replace(/,/g, '.')); if (!isNaN(valorNumerico)) { actualizarServicio(servicio.id, servicio.tipo_calculo === 'porGrupo' ? { coste_unitario: valorNumerico, total_servicio_manual: valorNumerico } : { coste_unitario: valorNumerico }); } } else { actualizarServicio(servicio.id, servicio.tipo_calculo === 'porGrupo' ? { coste_unitario: 0, total_servicio_manual: 0 } : { coste_unitario: 0 }); } e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }} className="input-field text-xs text-right w-full transition-all" style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }} placeholder="0.00" min="0" />
                    </div>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Modo</span>
                    {(servicio.tipo === 'Autobús' || servicio.tipo === 'Transporte') ? (
                      <span className="text-xs font-medium text-slate-600">Total ÷ pax</span>
                    ) : (
                      <select value={servicio.tipo_calculo || 'porPersona'} onChange={(e) => { const nuevoModo = e.target.value; const updates = { tipo_calculo: nuevoModo }; if (nuevoModo === 'porGrupo' && servicio.coste_unitario) updates.total_servicio_manual = toNum(servicio.coste_unitario); else if (nuevoModo === 'porPersona') updates.total_servicio_manual = 0; actualizarServicio(servicio.id, updates); }} className="input-field text-xs w-full transition-all" style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }} onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }} onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; const nuevoModo = e.target.value; const updates = { tipo_calculo: nuevoModo }; if (nuevoModo === 'porGrupo' && servicio.coste_unitario) updates.total_servicio_manual = toNum(servicio.coste_unitario); else if (nuevoModo === 'porPersona') updates.total_servicio_manual = 0; actualizarServicio(servicio.id, updates); }}>
                        <option value="porPersona">X pax</option>
                        <option value="porGrupo">÷ Todos</option>
                      </select>
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Total</span>
                    <span className="text-gray-900 text-sm font-semibold">{calcularTotalFilaUI(servicio).toFixed(2)}€</span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Release</span>
                    <input type="date" value={servicio.fechaRelease || ''} onChange={(e) => actualizarServicio(servicio.id, 'fechaRelease', e.target.value || '')} onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)' }} onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; actualizarServicio(servicio.id, 'fechaRelease', e.target.value || '') }} className="input-field w-full transition-all" style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '6px 8px', fontSize: '16px' }} />
                    {!servicio.releasePagado && servicio.fechaRelease && (
                      <button type="button" onClick={() => marcarReleaseComoPagadoServicio(servicio.id)} className="mt-2 flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded font-semibold w-full justify-center" style={{ fontSize: '16px' }}><CheckCircle size={14} /> Marcar como Pagado</button>
                    )}
                    {servicio.releasePagado && (
                      <span className="mt-2 text-green-600 font-semibold flex items-center gap-1" style={{ fontSize: '16px' }}><CheckCircle size={14} /> Pagado</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200">
              <button onClick={añadirServicio} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
                <Plus size={20} />
                Añadir Servicio
              </button>
            </div>
          </>
        )}
      </div>

      {showModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-md flex items-center justify-center z-[9999] p-6 text-left"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-navy-900">Nuevo Proveedor</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-4 bg-slate-100 rounded-full hover:bg-red-500 hover:text-white transition-all">
                <X size={32} />
              </button>
            </div>
            <ProveedorForm
              initialData={{ nombre_comercial: nombreNuevoProveedor, tipo: tipoNuevoProveedor }}
              submitLabel="Guardar y Seleccionar"
              onCancel={() => setShowModal(false)}
              onSaved={async (nuevoProveedor) => {
                console.log('[DEBUG ProveedorForm onSaved] nuevoProveedor:', nuevoProveedor)
                await cargarProveedores?.()
                if (servicioIdParaProveedor) {
                  const proveedorIdInt = Number(nuevoProveedor?.id)
                  const proveedorNombre = nuevoProveedor?.nombreComercial || nuevoProveedor?.nombre_comercial || ''
                  console.log('[DEBUG ProveedorForm onSaved] proveedorIdInt:', proveedorIdInt)
                  console.log('[DEBUG ProveedorForm onSaved] proveedorNombre:', proveedorNombre)
                  actualizarServicio(servicioIdParaProveedor, {
                    proveedorId: nuevoProveedor.id,
                    proveedor_id_int: proveedorIdInt,
                    proveedor_nombre: proveedorNombre
                  })
                  setBusquedaProveedor(prev => ({ ...prev, [servicioIdParaProveedor]: proveedorNombre }))
                  setMostrarSugerencias(prev => ({ ...prev, [servicioIdParaProveedor]: false }))
                }
                setShowModal(false)
              }}
            />
          </div>
        </div>
      )}
    </>
  )
}

export default ServiciosCotizacionPanel
