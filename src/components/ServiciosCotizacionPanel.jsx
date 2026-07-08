import React, { useState, useEffect, useRef, useMemo } from 'react'
import { X, Save, Plus, Trash2, CheckCircle } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import ProveedorForm from './ProveedorForm'
import { leerIdExpedienteSoloUseParams, resolverIdExpedienteFuenteVerdad } from '../utils/expedienteCotizacionId'
import { toDb, fromDb, servicioVacio, validarServicio } from '../lib/serviciosCotizacionAdapter'
import { useQueryClient } from '@tanstack/react-query'
import { useServiciosCotizacion } from '../hooks/useServiciosCotizacion'
import { useMutarServiciosCotizacion } from '../hooks/useMutarServiciosCotizacion'
import { useEliminarServicio } from '../hooks/useEliminarServicio'
import { queryKeys } from '../lib/queryKeys'

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

/** Mensaje legible para fallos RLS, FK u otros errores PostgREST, y para fallos de red. */
const formatearErrorSupabaseTenant = (error) => {
  if (error == null) {
    return 'Error desconocido al guardar servicios (sin objeto error de Supabase).'
  }

  const msgOriginal = error.message != null ? String(error.message) : String(error)
  const msgLower = msgOriginal.toLowerCase()
  const esFallaDeRed =
    error instanceof TypeError &&
    error.code === undefined &&
    (
      msgLower.includes('failed to fetch') ||
      msgLower.includes('networkerror') ||
      msgLower.includes('network request failed')
    )

  if (esFallaDeRed) {
    return 'Problema de conexión. Puede que los datos no se hayan confirmado. Revisa la conexión y vuelve a intentarlo.'
  }

  const code = error.code ?? error.status ?? 'sin código'
  const msg = msgOriginal
  const details = error.details != null ? String(error.details) : ''
  const hint = error.hint != null ? String(error.hint) : ''
  const lower = msgLower
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


/**
 * Convierte filas devueltas por Supabase al modelo de UI del panel (ids canónicos, búsqueda proveedor).
 *
 * ⚠️ FUNCIÓN CRÍTICA: Ultra-defensiva - NUNCA descarta filas, aunque tengan datos incompletos.
 * Todas las filas existentes en BD deben mostrarse en la interfaz con valores por defecto.
 */
const mapearRespuestaSupabaseAServiciosUI = (rows, proveedores = []) => {
  const serviciosUI = rows.map((row) => fromDb(row, proveedores))

  const busquedaProveedor = {}
  serviciosUI.forEach((svc) => {
    if (svc.proveedorNombre) {
      busquedaProveedor[svc.id] = svc.proveedorNombre
    }
  })

  return { serviciosUI, busquedaProveedor }
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
  setServicios,
  proveedores,
  paxPago,
  totalPax,
  onRefresh,
  cargarProveedores,
  persistirCambios,
  guardarCotizacionYServiciosRef = null,
  multicotizacionMode = false,
  // Refs para sincronización estricta del estado "sin guardar"
  lastSavedVersionesRef,
  lastSavedFormDataRef,
  versiones,
  formData,
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
  // Estado para controlar cambios sin guardar en servicios
  const [serviciosOriginales, setServiciosOriginales] = useState(null)
  // Estado para mostrar en UI los servicios que no se pudieron guardar (validación o error Supabase)
  const [errorGuardado, setErrorGuardado] = useState(null)
  const [isGuardando, setIsGuardando] = useState(false)

  const serviciosInicializados = useRef(false)

  const { data: servicios = [], isLoading, isError, error } = useServiciosCotizacion({
    idExpediente: idExpedienteCotizacion,
    proveedores,
  })

  const empresaId = expediente?.empresa_id ?? expediente?.empresa_id_int
  const { mutate: guardarServicios, isPending: isSaving, isError: isMutationError, error: mutationError } = useMutarServiciosCotizacion({
    idExpediente: idExpedienteCotizacion,
    empresaId,
  })

  const queryClient = useQueryClient()
  const queryKey = queryKeys.expedientes.servicios.all(idExpedienteCotizacion)
  const { mutate: mutateEliminar } = useEliminarServicio({ idExpediente: idExpedienteCotizacion })

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
        proveedor_id: proveedorIdInt,
        proveedorNombre: proveedorNombre
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

  const añadirServicio = () => {
    const nuevoServicio = {
      ...servicioVacio(),
      id: generarUUID(),
      tipo: 'Hotel',
      tipo_calculo: 'porPersona',
      isDraft: true,
    }
    queryClient.setQueryData(queryKey, (prev = []) => [...prev, nuevoServicio])
  }

  const seleccionarMayoristaYCrearHotel = (servicioId, proveedorId, nombreProveedor) => {
    console.log('[DEBUG seleccionarMayoristaYCrearHotel] proveedorId:', proveedorId)
    console.log('[DEBUG seleccionarMayoristaYCrearHotel] nombreProveedor:', nombreProveedor)
    const proveedorIdInt = Number(proveedorId)
    const proveedorNombre = nombreProveedor || ''
    console.log('[DEBUG seleccionarMayoristaYCrearHotel] proveedorIdInt:', proveedorIdInt)
    
    const servicioActual = servicios.find(s => s.id === servicioId)
    const nuevoHotel = {
      ...servicioVacio(),
      id: generarUUID(),
      tipo: 'Hotel',
      mayorista_id: proveedorId,
      tipo_calculo: 'porPersona',
    }
    queryClient.setQueryData(queryKey, (prev = []) => {
      const idx2 = prev.findIndex(s => s.id === servicioId)
      if (idx2 < 0) return prev
      const actualizado = prev.map(s =>
        s.id === servicioId
          ? { ...s, proveedor_id: proveedorIdInt, proveedorNombre: proveedorNombre }
          : s
      )
      return [...actualizado.slice(0, idx2 + 1), nuevoHotel, ...actualizado.slice(idx2 + 1)]
    })
    setBusquedaProveedor(prev => ({ ...prev, [servicioId]: proveedorNombre }))
    setMostrarSugerencias(prev => ({ ...prev, [servicioId]: false }))
    /* Persistence via manual Guardar button */
  }

  const eliminarServicio = async (id) => {
    const servicio = servicios.find((s) => s.id === id)
    const nombre = servicio?.descripcion || servicio?.tipo || 'este servicio'
    const esMayorista = servicio?.tipo === 'Mayorista'
    const mensajeConfirm = esMayorista
      ? '¿Estás seguro de que quieres borrar este servicio? También se eliminará el Hotel vinculado a este mayorista.'
      : `¿Estás seguro de que quieres borrar el servicio "${nombre}"?\n\nEsta acción no se puede deshacer.`
    if (!window.confirm(mensajeConfirm)) return
    if (servicio.id === null || servicio.id === undefined) {
      queryClient.setQueryData(queryKey, (prev = []) => prev.filter((s) => s.id !== id))
      return
    }
    const idsAEliminar = [id]
    if (esMayorista && servicio?.proveedor_id) {
      const hotelesVinculados = servicios.filter(
        (s) => s.tipo === 'Hotel' && s.mayorista_id != null && String(s.mayorista_id) === String(servicio.proveedor_id)
      )
      hotelesVinculados.forEach((h) => idsAEliminar.push(h.id))
    }
    mutateEliminar(idsAEliminar)
  }

  const calcularTotalFilaUI = (servicio) => {
    const s = { ...servicioVacio(), ...servicio }
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
    const asignaProveedor =
      ('proveedor_id' in updates && updates.proveedor_id != null) ||
      ('proveedorNombre' in updates && String(updates.proveedorNombre ?? '').trim() !== '')
    const updatesFinal = asignaProveedor
      ? { ...updates, isDraft: false }
      : updates
    const serviciosActualizados = servicios.map(s =>
      s.id === id ? { ...s, ...updatesFinal } : s
    )
    queryClient.setQueryData(queryKey, serviciosActualizados)
  }

  const buildDatosParaSupabase = (servicio, idExpedienteCanonico, empresaIdInt) =>
    toDb(servicio, idExpedienteCanonico, empresaIdInt)
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

      // Acumulador de servicios que no se pudieron guardar (validación o error Supabase)
      const serviciosConError = []
      const sincronizarErrorGuardado = () => {
        if (serviciosConError.length > 0) {
          const resumen = serviciosConError
            .map(e => `• ${e.servicio?.nombreEspecifico || e.servicio?.tipo_servicio || 'Servicio sin nombre'}: ${e.errores.join(', ')}`)
            .join('\n')
          setErrorGuardado(`Algunos servicios no se pudieron guardar:\n${resumen}`)
        } else {
          setErrorGuardado(null)
        }
      }

      const candidatos = listaServicios.filter((s) => s && String(s.id || '').trim() !== SERVICIO_ANOMALO_ID)
      const filasValidadas = []
      const serviciosValidos = []
      for (let index = 0; index < candidatos.length; index++) {
        const servicio = candidatos[index]

        const { valido, errores } = validarServicio(servicio)
        if (!valido) {
          console.warn('[handleGuardar] Servicio inválido omitido:', errores, servicio)
          serviciosConError.push({ servicio, errores })
          continue
        }

        const idFinal = esUuidServicioValido(servicio.id) ? String(servicio.id).trim() : generarUUID()
        const dbRecord = existentesMap.get(idFinal) || {}

        const datosUI = buildDatosParaSupabase(servicio, idCanonico, empresaIdInt)

        const filaLimpia = {
          ...toDb(servicio, idCanonico, empresaIdInt),
          id: servicio.id, // Fuerza absoluta del ID original
        }

        console.log(`[DEBUG guardarTodosServiciosEnSupabase] Fila ${filasValidadas.length}:`)
        console.log(`  - id: ${filaLimpia.id}`)
        console.log(`  - id_expediente: ${filaLimpia.id_expediente}`)
        console.log(`  - empresa_id: ${filaLimpia.empresa_id}`)
        console.log(`  - proveedor_id:`, filaLimpia.proveedor_id)
        console.log(`  - nombre_proveedor_manual:`, filaLimpia.nombre_proveedor_manual)
        console.log(`  - tipo_servicio:`, filaLimpia.tipo_servicio)

        filasValidadas.push(filaLimpia)
        serviciosValidos.push(servicio)
      }

      if (filasValidadas.length === 0) {
        sincronizarErrorGuardado()
        return { ok: true }
      }

      console.log('📦 PAYLOAD ENVIADO A SUPABASE:', filasValidadas)
      console.log('📦 CANTIDAD DE FILAS A GUARDAR:', filasValidadas.length)
      
      // Mostrar primera fila como ejemplo para debug
      if (filasValidadas.length > 0) {
        console.log('📦 EJEMPLO PRIMERA FILA:', JSON.stringify(filasValidadas[0], null, 2))
      }

      console.log("Payload enviado a Supabase:", JSON.stringify(filasValidadas, null, 2))

      // Hacer upsert SIN .select() primero para verificar si hay error de inserción
      const upsertRes = await supabase
        .from('servicios_cotizacion')
        .upsert(filasValidadas, { onConflict: 'id' })

      console.log('[DEBUG] Respuesta de Supabase (sin select) - upsertRes:', upsertRes)
      console.log('[DEBUG] Respuesta de Supabase (sin select) - error:', upsertRes.error)
      
      if (upsertRes.error) {
        console.error('[handleGuardar] Error Supabase al persistir servicio:', upsertRes.error, filasValidadas)
        serviciosValidos.forEach((servicio) => serviciosConError.push({ servicio, errores: [upsertRes.error.message] }))
        sincronizarErrorGuardado()
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
      setBusquedaProveedor(bpSync)

      // Reemplazo total en TanStack Query con la verdad de BD
      queryClient.setQueryData(queryKey, serviciosUI)

      // Notificar al padre si escucha cambios via prop setServicios
      if (typeof setServicios === 'function') {
        setServicios(serviciosUI)
      }
      
      // Limpiar el array de IDs eliminados después de guardar exitosamente
      setIdsEliminados([])
      console.log('✅ Guardado completo - idsEliminados limpiado')

      // Reflejar en UI los servicios omitidos por validación (guardado parcial)
      sincronizarErrorGuardado()

      return { ok: true }
    } catch (error) {
      const detalle = formatearErrorSupabaseTenant(error)
      console.error('[ServiciosCotizacion] Error en el motor de guardado:', error)
      alert(detalle)
      return { ok: false, error: detalle, userAlerted: true }
    }
  }
  const handleGuardar = async () => {
    if (isGuardando) return
    setIsGuardando(true)
    setErrorGuardado(null)
    
    try {
      // PASO 1 — Persistir cabecera del expediente (pax, noches, precio venta, etc.)
      if (typeof persistirCambios === 'function') {
        try {
          await persistirCambios()
        } catch (errCabecera) {
          const msg = errCabecera instanceof Error ? errCabecera.message : String(errCabecera)
          console.error('[handleGuardar] Error al persistir cabecera:', errCabecera)
          setErrorGuardado('Error al guardar parámetros del viaje: ' + msg)
          return 
        }
      }

      // PASO 2 — Upsert de los servicios de cotización
      const resultado = await guardarTodosServiciosEnSupabase(servicios)
      if (!resultado.ok && !resultado.userAlerted) {
        setErrorGuardado(resultado.error ?? 'Error desconocido al guardar servicios')
        return
      }

      // PASO 3 — Sincronizar refs 
      if (lastSavedFormDataRef && formData !== undefined) {
        lastSavedFormDataRef.current = formData
      }
      if (lastSavedVersionesRef && versiones !== undefined) {
        lastSavedVersionesRef.current = versiones
      }
      
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[handleGuardar] Excepción inesperada:', err)
      setErrorGuardado(msg)
    } finally {
      setIsGuardando(false) 
    }
  }
  if (guardarCotizacionYServiciosRef) {
    guardarCotizacionYServiciosRef.current = handleGuardar
  }
  // Aviso de cambios sin guardar al intentar cerrar/navegar fuera
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isGuardando) return  // está guardando, no interrumpir
      e.preventDefault()
      e.returnValue = 'Tienes cambios sin guardar en la cotización. ¿Seguro que quieres salir?'
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isGuardando])

  if (isLoading) return <div className="p-4 text-sm text-gray-500">Cargando servicios...</div>
  if (isError) return <div className="p-4 text-sm text-red-600">Error al cargar servicios: {error?.message}</div>

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
                  <col style={{ width: '115px', minWidth: '115px', maxWidth: '115px' }} />
                  <col style={{ width: '170px', minWidth: '170px', maxWidth: '170px' }} />
                  <col style={{ width: '130px', minWidth: '130px', maxWidth: '130px' }} />
                  <col style={{ width: '50px', minWidth: '50px', maxWidth: '50px' }} />
                  <col style={{ width: '100px', minWidth: '100px', maxWidth: '100px' }} />
                  <col style={{ width: '110px', minWidth: '110px', maxWidth: '110px' }} />
                  <col style={{ width: '85px', minWidth: '85px', maxWidth: '85px' }} />
                  <col style={{ width: '110px', minWidth: '110px', maxWidth: '110px' }} />
                  <col style={{ width: '40px', minWidth: '40px', maxWidth: '40px' }} />
                </colgroup>
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-1 py-2 text-left text-xs font-semibold text-gray-700" style={{ width: '115px' }}>Servicio</th>
                    <th className="px-1 py-2 text-left text-xs font-semibold text-gray-700" style={{ width: '170px' }}>Proveedor</th>
                    <th className="px-1 py-2 text-left text-xs font-semibold text-gray-700" style={{ width: '130px' }}>Detalle</th>
                    <th className="px-1 py-2 text-center text-xs font-semibold text-gray-700" style={{ width: '50px' }}>Cant.</th>
                    <th className="px-1 py-2 text-center text-xs font-semibold text-gray-700" style={{ width: '100px' }}>Precio</th>
                    <th className="px-1 py-2 text-center text-xs font-semibold text-gray-700" style={{ width: '110px' }}>Modo</th>
                    <th className="px-1 py-2 text-right text-xs font-semibold text-gray-700" style={{ width: '85px' }}>Total</th>
                    <th className="px-1 py-2 text-center text-xs font-semibold text-gray-700" style={{ width: '110px' }}>Release</th>
                    <th className="px-1 py-2 text-center text-xs font-semibold text-gray-700" style={{ width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {servicios.map((servicio, idx) => (
                    <tr key={servicio.id || `svc-${idx}`} className="border-t border-gray-200 hover:bg-gray-50 whitespace-nowrap">
                      <td className="px-1 py-2 align-middle" onClick={(e) => e.stopPropagation()} style={{ width: '115px', minWidth: '115px', maxWidth: '115px' }}>
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
                            if (servicio.proveedor_id) {
                              const proveedorActual = obtenerProveedorPorId(servicio.proveedor_id)
                              const tipoProveedorActual = mapearTipoServicioAProveedor(proveedorActual?.tipo || '')
                              const nuevoTipoProveedor = mapearTipoServicioAProveedor(nuevoTipo)
                              if (tipoProveedorActual !== nuevoTipoProveedor) {
                                updates.proveedor_id = null
                                setBusquedaProveedor(prev => ({ ...prev, [servicio.id]: '' }))
                              }
                            }
                            actualizarServicio(servicio.id, updates)
                            setMostrarSugerencias(prev => ({ ...prev, [servicio.id]: true }))
                          }}
                          className="input-field text-xs transition-all"
                          style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0', width: '113px', minWidth: '113px', maxWidth: '113px' }}
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
                                value={busquedaProveedor[servicio.id] !== undefined ? busquedaProveedor[servicio.id] : (obtenerProveedorPorId(servicio.proveedor_id)?.nombreComercial || '')}
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
                                    if (!servicio.proveedor_id && busquedaProveedor[servicio.id]) {
                                      setBusquedaProveedor(prev => ({ ...prev, [servicio.id]: '' }))
                                    }
                                  }, 120)
                                }}
                              />
                              {(busquedaProveedor[servicio.id] || servicio.proveedor_id) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBusquedaProveedor(prev => ({ ...prev, [servicio.id]: '' }))
                                    actualizarServicio(servicio.id, 'proveedor_id', null)
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

                      <td className="px-1 py-2 align-middle" style={{ width: '100px', minWidth: '100px', maxWidth: '100px' }}>
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
                            style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0', width: '98px', minWidth: '98px', maxWidth: '98px' }}
                            placeholder="0.00"
                            min="0"
                          />
                        </div>
                      </td>

                      <td className="px-1 py-2 text-center align-middle" style={{ width: '110px', minWidth: '110px', maxWidth: '110px' }}>
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
                            style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0', width: '108px', minWidth: '108px', maxWidth: '108px' }}
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

                      <td className="px-1 py-2 align-middle text-right" style={{ width: '85px', minWidth: '85px', maxWidth: '85px' }}>
                        <span className="text-gray-900 text-xs font-semibold whitespace-nowrap">{calcularTotalFilaUI(servicio).toFixed(2)}€</span>
                      </td>

                      <td className="px-1 py-2 text-center align-middle" style={{ width: '110px', minWidth: '110px', maxWidth: '110px' }}>
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
                            style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '4px 4px', width: '108px', minWidth: '108px', maxWidth: '108px', fontSize: '11px' }}
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
                        if (servicio.proveedor_id) {
                          const proveedorActual = obtenerProveedorPorId(servicio.proveedor_id)
                          const tipoProveedorActual = mapearTipoServicioAProveedor(proveedorActual?.tipo || '')
                          const nuevoTipoProveedor = mapearTipoServicioAProveedor(nuevoTipo)
                          if (tipoProveedorActual !== nuevoTipoProveedor) {
                            updates.proveedor_id = null
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
                            value={busquedaProveedor[servicio.id] !== undefined ? busquedaProveedor[servicio.id] : (obtenerProveedorPorId(servicio.proveedor_id)?.nombreComercial || '')}
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
                                if (!servicio.proveedor_id && busquedaProveedor[servicio.id]) setBusquedaProveedor(prev => ({ ...prev, [servicio.id]: '' }))
                              }, 120)
                            }}
                          />
                          {(busquedaProveedor[servicio.id] || servicio.proveedor_id) && (
                            <button onClick={() => { setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: '' }); actualizarServicio(servicio.id, 'proveedor_id', null); setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: false }) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10" title="Limpiar"><X size={14} /></button>
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

        {errorGuardado ? (
          <div
            className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
            role="alert"
          >
            <strong className="font-semibold">No se pudieron guardar todos los servicios.</strong>
            <pre className="mt-1 whitespace-pre-wrap font-sans text-red-800">{errorGuardado}</pre>
          </div>
        ) : null}
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
                  // Usar proveedor_id (BIGINT) del objeto mapeado por ProveedorForm
                  const proveedorIdInt = nuevoProveedor?.proveedor_id != null
                    ? Number(nuevoProveedor.proveedor_id)
                    : Number(nuevoProveedor?.id)
                  const proveedorNombre = nuevoProveedor?.nombreComercial || nuevoProveedor?.nombre_comercial || ''
                  console.log('[DEBUG ProveedorForm onSaved] proveedorIdInt:', proveedorIdInt)
                  console.log('[DEBUG ProveedorForm onSaved] proveedorNombre:', proveedorNombre)
                  actualizarServicio(servicioIdParaProveedor, {
                    proveedor_id: proveedorIdInt,
                    proveedorNombre: proveedorNombre
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
