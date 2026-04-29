import React, { useState, useEffect, useCallback } from 'react'
import { FileText, Plus, Trash2, X, Search, UserPlus, Download, Calendar } from 'lucide-react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { storage } from '../utils/storage'
import ExpedienteDetalle from '../components/ExpedienteDetalle'
import { normalizarExpedientes, formatearFechaVisual, parsearFechaADate, extraerAño, convertirEspañolAISO, convertirISOAEspañol } from '../utils/dateNormalizer'
import { getEjercicioActual, subscribeToEjercicioChanges, setEjercicioActual as guardarEjercicioGlobal, getAñosDisponibles } from '../utils/ejercicioGlobal'
import { supabase } from '../supabase'
import {
  existeNumeroExpedienteEnSupabase,
  esNumeroExpedienteValido,
  obtenerSiguienteNumeroExpedienteCorrelativo,
  esErrorUnicidadNumeroExpediente,
} from '../utils/expedienteNumero'
import { validarProveedoresServicios, consolidarGastosExpediente } from '../utils/consolidacionGastos'
import { DURACION_VIAJE_OPTIONS, TIPO_COLECTIVO_OPTIONS } from '../constants/viaje'
import { sanitizarExpedienteParaDB } from '../utils/constraintValidator'
import { DestinoExpedienteEditable } from '../components/expedientes/FichaDelGrupo'
import { useEmpresa } from '../context/EmpresaContext'
import { ensureAuthenticatedSession, buildWriteErrorMessage } from '../utils/supabaseWriteGuards'

// Función helper para convertir fechas a formato ISO (YYYY-MM-DD) para Supabase
// Esta función se usa SOLO al guardar datos en Supabase
// El formato visual DD/MM/YYYY se mantiene en inputs y tablas para el usuario
// Acepta fechas en formato DD/MM/YYYY o YYYY-MM-DD y siempre devuelve YYYY-MM-DD
const convertirFechaAISO = (fecha) => {
  if (!fecha || fecha.trim() === '') return '';
  
  // Si ya está en formato YYYY-MM-DD, devolverlo tal cual
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha.trim())) {
    return fecha.trim();
  }
  
  // Si está en formato DD/MM/YYYY, convertir a YYYY-MM-DD
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(fecha.trim())) {
    try {
      const [dia, mes, año] = fecha.trim().split('/');
      return `${año}-${mes}-${dia}`;
    } catch (error) {
      return '';
    }
  }
  
  // Intentar parsear como Date y convertir a ISO
  try {
    const fechaDate = new Date(fecha);
    if (!isNaN(fechaDate.getTime())) {
      return fechaDate.toISOString().split('T')[0];
    }
  } catch (error) {
  }
  
  // Si no se puede convertir, intentar usar la función existente
  try {
    const fechaISO = convertirEspañolAISO(fecha);
    if (fechaISO) return fechaISO;
  } catch (error) {
  }
  
  return '';
}

const MENSAJE_DUPLICADO_EXPEDIENTE =
  'Ya existe un expediente para este cliente, fecha y destino. Por favor, revísalo para evitar duplicados.'

const MENSAJE_COLISION_NUMERO_EXPEDIENTE =
  'El número de expediente ya se había asignado (otro usuario creando al mismo tiempo). Se ha reintentado con el siguiente correlativo.'

/** PostgreSQL 23505 / mensajes habituales de restricción única */
const esErrorRestriccionUnicidad = (error) => {
  if (!error) return false
  const code = String(error.code ?? '')
  if (code === '23505') return true
  const msg = String(error.message ?? error.details ?? '').toLowerCase()
  return (
    msg.includes('duplicate key') ||
    msg.includes('unique constraint') ||
    msg.includes('violates unique constraint') ||
    msg.includes('uniq_') ||
    msg.includes('_unique')
  )
}

const toIntOrNull = (value) => {
  if (value === null || value === undefined) return null
  const raw = String(value).trim()
  if (raw === '') return null
  const num = Number(raw)
  if (!Number.isFinite(num)) return null
  return Math.trunc(num)
}

/**
 * Comprueba si ya existe un expediente con el mismo cliente_id, fecha_inicio y destino.
 * Alineado con los valores que se insertarán (null vs cadena vacía → null en destino).
 */
const consultarExpedienteDuplicadoSupabase = async ({ cliente_id, fecha_inicio, destino }) => {
  let q = supabase.from('expedientes').select('id').eq('cliente_id', cliente_id)
  if (fecha_inicio == null || fecha_inicio === '') {
    q = q.is('fecha_inicio', null)
  } else {
    q = q.eq('fecha_inicio', fecha_inicio)
  }
  const destNormalizado =
    destino != null && String(destino).trim() !== '' ? String(destino).trim() : null
  if (destNormalizado === null) {
    q = q.is('destino', null)
  } else {
    q = q.eq('destino', destNormalizado)
  }
  const { data, error } = await q.limit(1)
  if (error) return { exists: false, error }
  const exists = Array.isArray(data) && data.length > 0
  return { exists, error: null }
}

// Función helper para manejar errores de Supabase, especialmente errores de permisos
const manejarErrorSupabase = (error, operacion = 'operación') => {
  if (!error) return null;
  
  const errorCode = error.code || error.status || '';
  const errorMessage = error.message || String(error);
  
  // Detectar errores de permisos (RLS)
  if (
    errorCode === '42501' || // PostgreSQL: insufficient_privilege
    errorCode === 'PGRST301' || // PostgREST: Permission denied
    errorCode === 403 ||
    errorMessage.includes('Permission denied') ||
    errorMessage.includes('permission denied') ||
    errorMessage.includes('new row violates row-level security policy') ||
    errorMessage.includes('violates row-level security')
  ) {
    return {
      tipo: 'permisos',
      mensaje: `🔒 Error de permisos: No tienes permisos para realizar esta ${operacion}. Verifica las políticas RLS en Supabase.`,
      error: error
    };
  }

  return {
    tipo: 'otro',
    mensaje: `⚠️ Error en ${operacion}: ${errorMessage}`,
    error: error
  };
}
// ============================================================================
// NÚMERO DE EXPEDIENTE: correlativo por ejercicio (orden de entrada), ver expedienteNumero.js
// ============================================================================
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const pareceUUID = (v) => v && typeof v === 'string' && REGEX_UUID.test(String(v).trim());

// Sistema de 5 Estados: Petición, Confirmado, Finalizado, Cerrado, Cancelado
const ESTADOS = {
  peticion: { label: 'Petición', color: 'bg-yellow-100 text-yellow-900 border-yellow-400', badge: 'bg-yellow-400', cssClass: 'peticion' },
  confirmado: { label: 'Petición', color: 'bg-yellow-100 text-yellow-900 border-yellow-400', badge: 'bg-yellow-400', cssClass: 'peticion' },
  en_curso: { label: 'Confirmado', color: 'bg-green-100 text-green-800 border-green-300', badge: 'bg-green-500', cssClass: 'en_curso' },
  finalizado: { label: 'Finalizado', color: 'bg-blue-100 text-blue-800 border-blue-300', badge: 'bg-blue-500', cssClass: 'finalizado' },
  cerrado: { label: 'Cerrado', color: 'bg-purple-100 text-purple-800 border-purple-300', badge: 'bg-purple-600', cssClass: 'cerrado' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-800 border-red-300', badge: 'bg-red-600', cssClass: 'cancelado' },
}
// Helper: lookup por estado normalizado (BD puede guardar 'Finalizado', 'Petición', etc.)
const getEstadoUI = (estado) => ESTADOS[(estado || '').toString().trim().toLowerCase()] || ESTADOS.peticion

const ESTADOS_UI = ['peticion', 'en_curso', 'finalizado', 'cancelado']

// 5 pestañas: Petición, Confirmado, Finalizado, Cerrado, Cancelado
const TABS_EXPEDIENTES = [
  { id: 'pendientes', label: 'Petición', estados: ['peticion', 'confirmado'] },
  { id: 'confirmados', label: 'Confirmado', estados: ['en_curso'] },
  { id: 'finalizado', label: 'Finalizado', estados: ['finalizado'] },
  { id: 'cerrado', label: 'Cerrado', estados: ['cerrado'] },
  { id: 'cancelado', label: 'Cancelado', estados: ['cancelado'] },
]

// ============================================================================
// FUNCIONES DE FECHAS: Usar normalizador centralizado
// ============================================================================
const parsearFecha = parsearFechaADate  // Devuelve Date object para comparaciones
const formatearFecha = formatearFechaVisual  // Devuelve DD/MM/AAAA para mostrar

const Expedientes = ({ user = null }) => {
  const { empresaId } = useEmpresa()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [expedientes, setExpedientes] = useState([])
  const [clientes, setClientes] = useState([])
  const [showExpedienteModal, setShowExpedienteModal] = useState(false)
  const [showClienteModal, setShowClienteModal] = useState(false)
  const [showDetalleModal, setShowDetalleModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [expedienteActual, setExpedienteActual] = useState(null)
  const [clienteInputValue, setClienteInputValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [trimestreExport, setTrimestreExport] = useState('Q1')
  const [ejercicioActual, setEjercicioActual] = useState(getEjercicioActual())
  const [searchTermExpedientes, setSearchTermExpedientes] = useState('')
  const [isSubmittingExpediente, setIsSubmittingExpediente] = useState(false) // Estado de loading para submit
  const [avisoFormularioExpediente, setAvisoFormularioExpediente] = useState(null)
  const [confirmarBorrado, setConfirmarBorrado] = useState(null) // { id, nombre, destino } - Modal confirmación (Regla 1.14)
  const [confirmarCierre, setConfirmarCierre] = useState(null) // { id, nuevoEstado, expediente } - Modal consolidación
  const [isLoading, setIsLoading] = useState(false) // MODO SEGURO: mostrar "Cargando..." en lugar de romperse

  const [expedienteForm, setExpedienteForm] = useState({
    responsable: '',
    destino: '',
    fechaInicio: '',
    fechaFin: '',
    clienteId: null, // Usar null para números, no '' (string vacío)
    clienteNombre: '',
    telefono: '',
    email: '',
    estado: 'peticion',
    tipo_colectivo: '',
    duracion_viaje: '',
    observaciones: '',
    itinerario: '',
    total_pax: '',
  })

  useEffect(() => {
    if (!showExpedienteModal) return
    setAvisoFormularioExpediente((prev) => (prev ? null : prev))
  }, [expedienteForm.clienteId, expedienteForm.fechaInicio, expedienteForm.destino, showExpedienteModal])

  const aplicarDestinoLocal = useCallback((id, destino) => {
    const d = destino ?? ''
    setExpedientes((prev) => (prev || []).map((e) => (e.id === id ? { ...e, destino: d } : e)))
    setExpedienteActual((prev) => (prev?.id === id ? { ...prev, destino: d } : prev))
    try {
      const raw = storage.get('expedientes') || []
      const next = Array.isArray(raw) ? raw.map((e) => (e.id === id ? { ...e, destino: d } : e)) : raw
      storage.set('expedientes', next)
    } catch (_) {}
  }, [])

  const [clienteForm, setClienteForm] = useState({
    nombre: '',
    cif: '',
    direccion: '',
    poblacion: '',
    cp: '',
    provincia: '',
    nSocios: '',
    responsable: '',
    telefono: '',
    email: ''
  })

  // Cargar todos los clientes de Supabase (orden A-Z por nombre)
  const fetchClientesFromSupabase = async () => {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .order('nombre', { ascending: true })
      if (error) {
        manejarErrorSupabase(error, 'cargar clientes');
        return []
      }
      setClientes(Array.isArray(data) ? data : [])
      return data
    } catch (error) {
      return []
    }
  }

  useEffect(() => {
    const init = async () => {
      try {
        await fetchExpedientesData()
      } catch (_) {
        setExpedientes([])
        setIsLoading(false)
      }
    }
    init()
    try {
      sincronizarConPlanning()
      fetchClientesFromSupabase()
    } catch (_) {
      setIsLoading(false)
    }
    // eslint-disable-next-line
  }, [])

  // Actualiza clientes al crear uno nuevo o al modificar
  const reloadClientes = () => fetchClientesFromSupabase()

  // ============ SINCRONIZACIÓN GLOBAL DEL EJERCICIO ============
  useEffect(() => {
    const unsubscribe = subscribeToEjercicioChanges((nuevoEjercicio) => {
      setEjercicioActual(nuevoEjercicio)
    })
    return unsubscribe
  }, [])

  // Tab inicial al abrir desde Historial de Cierres (Ver Detalle)
  const [tabInicialParaDetalle, setTabInicialParaDetalle] = useState(null)

  // ============ DETECCIÓN DE NAVEGACIÓN DESDE DASHBOARD O HISTORIAL ============
  // Abrir expediente automáticamente si se navega con un ID (y opcionalmente tab inicial)
  useEffect(() => {
    if (location.state?.abrirExpedienteId && expedientes.length > 0) {
      const expedienteId = location.state.abrirExpedienteId
      const tabInicial = location.state?.tabInicial
      const expedienteEncontrado = expedientes.find(exp => exp.id === expedienteId)
      
      if (expedienteEncontrado) {
        setExpedienteActual(expedienteEncontrado)
        setTabInicialParaDetalle(tabInicial || null)
        setShowDetalleModal(true)
        navigate(location.pathname, { replace: true, state: {} })
      }
    }
  }, [location.state, expedientes, navigate])

  // Función maestra de refresco: obtiene expedientes desde Supabase y actualiza el estado
  const fetchExpedientesData = async () => {
    setIsLoading(true)
    try {
      // Lee expedientes de Supabase - usar select('*') para evitar errores de columnas
      const { data: cloudData, error } = await Promise.resolve(
        supabase
          .from('expedientes')
          .select('*')
          .eq('empresa_id', empresaId)         // AISLAMIENTO: solo expedientes de esta empresa
          .order('fecha_inicio', { ascending: true, nullsFirst: false })
      ).finally(() => setIsLoading(false))

      if (error) {
        setExpedientes([])
        return
      }

      // Parsear campos de Supabase
      const expedientesParseados = (cloudData || []).map(exp => {
        // Mapear campos de Supabase a formato interno
        return {
          // 🔑 ID UUID (string) - La PK es 'id'
          id: exp.id,

          // Número de expediente correlativo (YYYY-000)
          numero_expediente: exp.numero_expediente || '',

          // Datos básicos
          cliente_id: exp.cliente_id || '',
          clienteId: exp.cliente_id || null, // Compatibilidad interna
          // Nombre de cliente solo para mostrar (se leerá si existe, pero no se vuelve a escribir a Supabase)
          cliente_nombre: exp.cliente_nombre || exp.cliente_name || '',
          clienteNombre: exp.cliente_nombre || exp.cliente_name || '',
          fecha_inicio: exp.fecha_inicio || '',
          fecha_final: exp.fecha_final || exp.fecha_fin || '',
          fechaInicio: exp.fecha_inicio || '',
          fechaFin: exp.fecha_final || exp.fecha_fin || '',
          destino: exp.destino || '',
          telefono: exp.telefono || '',
          email: exp.email || '',
          responsable: exp.responsable || '',
          estado: exp.estado || 'peticion',
          tipo_colectivo: (exp?.tipo_colectivo || ''),
          duracion_viaje: (exp?.duracion_viaje || ''),
          observaciones: exp.observaciones || '',
          itinerario: exp.itinerario || '',

          // Ejercicio (año) guardado en la tabla o derivado de la fecha de inicio
          ejercicio: exp.ejercicio || extraerAño(exp.fecha_inicio || '') || getEjercicioActual(),

          // Parámetros de cotización resumidos en columnas planas
          total_pax: exp.total_pax || null,
          pax_pago: exp.pax_pago || null,
          gratuidades: exp.gratuidades ?? 0,
          precio_venta_cliente: exp.precio_venta_cliente ?? 0,
          bonificacion_pax: exp.bonificacion_pax ?? 0,
          total_ingresos: exp.total_ingresos != null ? Number(exp.total_ingresos) : null,
          total_cobrado: exp.total_cobrado != null ? Number(exp.total_cobrado) : 0,
          presupuesto_total: exp.presupuesto_total != null ? Number(exp.presupuesto_total) : null,

          // Cierre de Grupo - pasar tal cual, sin parsear (JSONB en Supabase)
          cierre_grupo: exp?.cierre_grupo ?? null,

          // Configuración de Grupos Compartidos - pasar tal cual (JSONB array en Supabase)
          desglose_grupos: Array.isArray(exp?.desglose_grupos) ? exp.desglose_grupos : (exp?.desglose_grupos ?? null),

          // Campos por defecto para compatibilidad
          pasajeros: [],
          cobros: [],
          pagos: [],
          documentos: [],
          cierre: null,
        }
      })

      const expedientesNormalizados = normalizarExpedientes(expedientesParseados)
      setExpedientes(expedientesNormalizados)
      
      // También guardar en localStorage como backup (estructura limpia sin cotizacion JSON)
      if (expedientesParseados && expedientesParseados.length > 0) {
        try {
          storage.set('expedientes', expedientesParseados)
        } catch (_) { /* no bloquear por localStorage */ }
      }

      // Cargar clientes de Supabase (no bloquear si falla)
      try {
        await fetchClientesFromSupabase()
      } catch (_) { /* expedientes ya cargados, no bloquear */ }
    } catch (error) {
      setExpedientes([])
    } finally {
      setIsLoading(false)
    }
  }

  const sincronizarConPlanning = () => {
    const planning = storage.getPlanning()
    const expedientesActuales = storage.get('expedientes') || []

    // Crear expedientes desde Planning si no existen
    const nuevosExpedientes = []
    planning.forEach(viaje => {
      const existe = expedientesActuales.find(exp => exp.planningId === viaje.id)
      if (!existe) {
        const fechas = viaje.fecha ? viaje.fecha.split(' AL ') : ['', '']
      const nuevoExpediente = {
        id: Date.now() + Math.random(),
        planningId: viaje.id,
        nombre_grupo: viaje.grupo || '',
        responsable: '',
        destino: viaje.destino || '',
          fechaInicio: parsearFecha(fechas[0]) || '',
          fechaFin: parsearFecha(fechas[1]) || '',
          clienteId: '',
          estado: 'peticion',
          observaciones: viaje.observaciones || '',
          fechaCreacion: new Date().toISOString(),
          cotizacion: null,
          pasajeros: [],
          cobros: [],
          pagos: [],
          documentos: [],
          cierre: null,
          hotel: viaje.hotel || '',
          plazas: viaje.plazas || 0,
          bus: viaje.bus || '',
          precioBus: viaje.precioBus || 0,
          clienteNombre: viaje.grupo || '',
        }
        nuevosExpedientes.push(nuevoExpediente)
      }
    })

    if (nuevosExpedientes.length > 0) {
      const todosExpedientes = [...expedientesActuales, ...nuevosExpedientes]
      storage.set('expedientes', todosExpedientes)
      setExpedientes(todosExpedientes)
    }
  }

  const saveExpedientes = async (data) => {
    try {
      const dataToSave = Array.isArray(data) ? data : [];

      for (const expediente of dataToSave) {
        // ARQUITECTURA UUID: cliente_id es UUID (string)
        const clienteIdParaSync = expediente.cliente_id || expediente.clienteId;
        const clienteIdUUID = clienteIdParaSync ? String(clienteIdParaSync).trim() : null;

        const totalPaxNum = expediente.total_pax != null ? Number(expediente.total_pax) : 1
        const gratuidadesNum = expediente.gratuidades != null ? Number(expediente.gratuidades) : 0
        const paxPagoNum = Math.max(1, (isNaN(totalPaxNum) ? 1 : totalPaxNum) - (isNaN(gratuidadesNum) ? 0 : gratuidadesNum))

        // numero_expediente: NUNCA vacío ni UUID (ID interno) - forzar 2026-XXX si se detecta UUID
        let numeroExpFinal = String(expediente.numero_expediente || expediente.numeroExpediente || '').trim();
        if (!esNumeroExpedienteValido(numeroExpFinal) || pareceUUID(numeroExpFinal)) {
          const añoExp = getEjercicioActual()
          numeroExpFinal = await obtenerSiguienteNumeroExpedienteCorrelativo(añoExp);
        } else {
          // VALIDACIÓN: Si el usuario puso un número manualmente, comprobar que no exista
          const idExpediente = expediente.id;
          const yaExiste = await existeNumeroExpedienteEnSupabase(numeroExpFinal, idExpediente);
          if (yaExiste) {
            alert('Error: Este número de expediente ya está en uso');
            return;
          }
          // Normalizar formato YYYY-XXX con ceros a la izquierda
          const partes = numeroExpFinal.split('-');
          if (partes.length === 2) {
            const año = partes[0];
            const seq = parseInt(partes[1], 10);
            if (!isNaN(seq)) numeroExpFinal = `${año}-${String(seq).padStart(3, '0')}`;
          }
        }

        const añoEjPersist =
          expediente.ejercicio != null && expediente.ejercicio !== '' && Number.isFinite(Number(expediente.ejercicio))
            ? Number(expediente.ejercicio)
            : (() => {
                const fi = expediente.fecha_inicio || expediente.fechaInicio
                return fi ? (parsearFecha(fi)?.getFullYear?.() || getEjercicioActual()) : getEjercicioActual()
              })()

        const datosParaSupabase = {
          numero_expediente: numeroExpFinal,
          ejercicio: añoEjPersist,
          cliente_id: (clienteIdUUID && clienteIdUUID !== '') ? clienteIdUUID : null,
          cliente_nombre: String(expediente.cliente_nombre || expediente.clienteNombre || ''),
          fecha_inicio: convertirFechaAISO(expediente.fecha_inicio || expediente.fechaInicio || ''),
          fecha_final: convertirFechaAISO(expediente.fecha_final || expediente.fechaFin || expediente.fecha_fin || ''),
          destino: String(expediente.destino || ''),
          telefono: String(expediente.telefono || ''),
          email: String(expediente.email || ''),
          responsable: String(expediente.responsable || ''),
          estado: String(expediente.estado || 'peticion'),
          tipo_colectivo: ((expediente?.tipo_colectivo || '').trim()) || null,
          duracion_viaje: ((expediente?.duracion_viaje || '').trim()) || null,
          observaciones: String(expediente.observaciones || ''),
          itinerario: String(expediente.itinerario || ''),
          total_pax: (expediente.total_pax !== undefined && expediente.total_pax !== null) ? String(expediente.total_pax) : null,
          gratuidades: isNaN(gratuidadesNum) ? 0 : gratuidadesNum,
          pax_pago: paxPagoNum,
          precio_venta_cliente: expediente.precio_venta_cliente != null ? Number(expediente.precio_venta_cliente) : 0,
          bonificacion_pax: expediente.bonificacion_pax != null ? Number(expediente.bonificacion_pax) : 0,
        };

        const idExpediente = expediente.id;

        if (idExpediente) {
          // UPDATE: Si tiene id (UUID), es un upsert
          const { error } = await supabase
            .from('expedientes')
            .upsert({ ...datosParaSupabase, id: idExpediente }, { onConflict: 'id' });
          if (error) throw error;
        } else {
          // INSERT: Si no tiene id, Supabase generará el UUID automáticamente
          const { error } = await supabase
            .from('expedientes')
            .insert([datosParaSupabase]);
          if (error) throw error;
        }
      }

      // Sincronización con estado local tras éxito en Supabase
      setExpedientes(dataToSave);
      storage.set('expedientes', dataToSave);
      await fetchExpedientesData();

    } catch (error) {
      const errorInfo = manejarErrorSupabase(error, 'sincronizar expediente');
      alert(errorInfo ? errorInfo.mensaje : 'Error al guardar el expediente');
    }
  };

  const handleExpedienteSubmit = async (e) => {
    e.preventDefault();
    
    // CORRECCIÓN: Activar loading al inicio
    setIsSubmittingExpediente(true);
    
    try {
      // CORRECCIÓN OBLIGATORIA: Sanitización Pre-Envío - Redefinir cliente_id ANTES de cualquier otra operación
      // Obtener el ID del formulario
      let selectedClientId = expedienteForm.clienteId;
      
      // ARQUITECTURA UUID: cliente_id es ahora UUID (string), NO integer
      // Validar que sea un UUID válido (string no vacío)
      let clienteIdSanitizado = null;
      if (selectedClientId !== null && selectedClientId !== undefined && selectedClientId !== '') {
        // CORRECCIÓN: Asegurar que no sea un objeto
        if (typeof selectedClientId === 'object') {
          alert('⚠️ ERROR: El ID del cliente tiene un formato inválido. Por favor, selecciona un cliente válido.');
          throw new Error('cliente_id es un objeto en lugar de string UUID');
        }
        // UUID es un string, validar que no esté vacío
        const clienteIdString = String(selectedClientId).trim();
        if (clienteIdString.length > 0) {
          clienteIdSanitizado = clienteIdString;
        }
      }
    
      // ARQUITECTURA UUID: Bloqueo de Seguridad - Abortar si cliente_id es null o string vacío
      if (!clienteIdSanitizado || clienteIdSanitizado.trim() === '') {
        alert('⚠️ Por favor, selecciona un cliente válido de la lista antes de crear el expediente.');
        throw new Error('cliente_id inválido o vacío');
      }
    
    let finalId = clienteIdSanitizado; // UUID (string)
    let finalNombre = expedienteForm.clienteNombre || clienteInputValue.trim() || 'Sin Nombre';

    // 1. Crear cliente si no existe
    if (!finalId && clienteInputValue.trim()) {
      try {
      const { data, error } = await supabase
        .from('clientes')
        .insert([{
          nombre: finalNombre,
          responsable: expedienteForm.responsable || '',
        }])
        .select().single();
        if (error) {
          const errorInfo = manejarErrorSupabase(error, 'crear cliente');
          if (errorInfo) {
            alert(errorInfo.mensaje);
            throw new Error(errorInfo.mensaje);
          }
          throw error;
        }
        // ARQUITECTURA UUID: El ID devuelto es UUID (string)
        const idGeneradoCliente = data.id ? String(data.id).trim() : null;
        if (!idGeneradoCliente || idGeneradoCliente === '') {
          alert('⚠️ ERROR: El cliente se creó pero el ID generado no es válido. Por favor, contacta al administrador.');
          throw new Error('ID de cliente generado inválido');
        }
        finalId = idGeneradoCliente; // UUID (string)
        finalNombre = data.nombre;
        await reloadClientes();
      } catch (err) {
        throw err; // Re-lanzar para que el catch principal lo maneje
      }
    }

    // ARQUITECTURA UUID: cliente_id es UUID (string)
    const clienteIdUUID = finalId; // UUID (string) ya sanitizado

    // 2. Insertar Expediente con mapeo a cliente_nombre
    try {
      // Validar que cliente_nombre esté presente
      if (!finalNombre || finalNombre.trim() === '') {
        alert('⚠️ El nombre del cliente es obligatorio');
        throw new Error('nombre del cliente es obligatorio');
      }

      // ARQUITECTURA UUID: cliente_id es UUID (string)
      const clienteIdFinal = clienteIdUUID; // UUID (string) ya sanitizado
      
      // CORRECCIÓN: Verificar que clienteIdFinal sea realmente un string UUID, no un objeto
      if (typeof clienteIdFinal !== 'string' || clienteIdFinal.trim() === '') {
        alert('⚠️ ERROR CRÍTICO: El cliente_id no es un UUID válido (string).');
        throw new Error('cliente_id no es un UUID válido');
      }
      
      // Limpieza de Tipos - total_pax debe ser string o null, NUNCA string vacío
      let totalPaxSanitizado = null;
      if (expedienteForm.total_pax !== null && expedienteForm.total_pax !== undefined && expedienteForm.total_pax !== '') {
        const totalPaxNum = parseInt(String(expedienteForm.total_pax), 10);
        if (!isNaN(totalPaxNum) && totalPaxNum > 0) {
          totalPaxSanitizado = String(totalPaxNum); // Supabase espera string para total_pax
        }
      }
      
      // ARQUITECTURA UUID: Usar id generado por Supabase (UUID), NO enviar campo id
      // CORRECCIÓN: Asegurar que todos los campos obligatorios tengan valores válidos
      const paxPagoNum = totalPaxSanitizado ? parseInt(totalPaxSanitizado, 10) : 0;
      const datosInsertar = {
        cliente_id: clienteIdFinal, // UUID (string), NUNCA integer, NUNCA objeto
        cliente_nombre: String(finalNombre || '').trim() || 'Sin nombre', // Obligatorio: nunca null
        nombre_grupo: String(finalNombre || '').trim() || 'Sin nombre',
        fecha_inicio: convertirFechaAISO(expedienteForm.fechaInicio || '') || null,
        fecha_final: convertirFechaAISO(expedienteForm.fechaFin || '') || null,
        destino: String(expedienteForm.destino || '').trim() || null,
        telefono: String(expedienteForm.telefono || '').trim() || null,
        email: String(expedienteForm.email || '').trim() || null,
        responsable: String(expedienteForm.responsable || '').trim() || null,
        estado: String(expedienteForm.estado || 'peticion').trim(), // Siempre tiene valor por defecto
        tipo_colectivo: ((expedienteForm?.tipo_colectivo || '').trim()) || null,
        duracion_viaje: ((expedienteForm?.duracion_viaje || '').trim()) || null,
        observaciones: String(expedienteForm.observaciones || '').trim() || null,
        itinerario: String(expedienteForm.itinerario || '').trim() || null,
        total_pax: totalPaxSanitizado || null,
        pax_pago: paxPagoNum,
        precio_venta_cliente: 0, // Valor por defecto para evitar NOT NULL
      };

      // VERIFICACIÓN EXPLÍCITA: Asegurar que id NO esté en el objeto
      if ('id' in datosInsertar) {
        delete datosInsertar.id;
      }

      // ARQUITECTURA UUID: Verificar que cliente_id sea un UUID válido (string no vacío)
      if (!datosInsertar.cliente_id || typeof datosInsertar.cliente_id !== 'string' || datosInsertar.cliente_id.trim() === '') {
        alert('⚠️ ERROR CRÍTICO: El cliente_id no es un UUID válido. No se puede crear el expediente.');
        throw new Error('cliente_id en datosInsertar no es válido');
      }

      // ESCÁNER ELÁSTICO: sanitiza silenciosamente sin bloquear al usuario
      const { datosSanitizados: insertSanitizado } = sanitizarExpedienteParaDB(datosInsertar);
      Object.assign(datosInsertar, insertSanitizado);

      const { exists: hayDuplicado, error: errorConsultaDuplicado } =
        await consultarExpedienteDuplicadoSupabase({
          cliente_id: datosInsertar.cliente_id,
          fecha_inicio: datosInsertar.fecha_inicio,
          destino: datosInsertar.destino,
        });
      if (errorConsultaDuplicado) {
        const errorInfo = manejarErrorSupabase(errorConsultaDuplicado, 'comprobar duplicado de expediente');
        alert(errorInfo ? errorInfo.mensaje : `Error al comprobar duplicados: ${errorConsultaDuplicado.message || String(errorConsultaDuplicado)}`);
        throw errorConsultaDuplicado;
      }
      if (hayDuplicado) {
        setAvisoFormularioExpediente(MENSAJE_DUPLICADO_EXPEDIENTE);
        return;
      }

      // Numeración por orden de entrada: correlativo del ejercicio seleccionado (no por fecha del viaje).
      const añoNumeracion = Number(ejercicioActual) || new Date().getFullYear();
      datosInsertar.ejercicio = añoNumeracion;

      const MAX_REINTENTOS_NUMERO = 12
      let data = null
      let huboColisionNumero = false
      for (let intento = 0; intento < MAX_REINTENTOS_NUMERO; intento++) {
        let numeroExp = await obtenerSiguienteNumeroExpedienteCorrelativo(añoNumeracion);
        if (!esNumeroExpedienteValido(numeroExp)) {
          numeroExp = `${añoNumeracion}-001`;
        }
        datosInsertar.numero_expediente = numeroExp

        const result = await supabase
          .from('expedientes')
          .insert([datosInsertar])
          .select()
          .single()
        const error = result.error

        if (!error) {
          data = result.data
          break
        }

        if (esErrorUnicidadNumeroExpediente(error)) {
          huboColisionNumero = true
          continue
        }
        if (esErrorRestriccionUnicidad(error)) {
          setAvisoFormularioExpediente(MENSAJE_DUPLICADO_EXPEDIENTE);
          return;
        }
        const errorInfo = manejarErrorSupabase(error, 'crear expediente');
        const mensaje = errorInfo ? errorInfo.mensaje : `Error al guardar: ${error.message || String(error)}`;
        alert(mensaje);
        throw new Error(mensaje);
      }

      if (!data) {
        alert('No se pudo asignar un número de expediente único tras varios intentos. Reintenta en unos segundos.')
        return
      }
      if (huboColisionNumero) {
        setAvisoFormularioExpediente(MENSAJE_COLISION_NUMERO_EXPEDIENTE)
      }

      // 3. Refrescar la lista completa desde Supabase para mostrar el ID generado
      await fetchExpedientesData();
      
      setShowExpedienteModal(false);
      resetExpedienteForm();
      setClienteInputValue('');
      setShowSuggestions(false);
      alert(`✅ Expediente creado: ${data.numero_expediente || 'sin número'} (ID interno: ${data.id})`);
      } catch (err) {
        if (esErrorRestriccionUnicidad(err)) {
          setAvisoFormularioExpediente(MENSAJE_DUPLICADO_EXPEDIENTE);
          return;
        }
        const errorInfo = manejarErrorSupabase(err, 'crear expediente');
        const mensaje = errorInfo ? errorInfo.mensaje : `No se pudo guardar: ${err?.message || String(err)}`;
        alert(mensaje);
      }
    } catch (error) {
      const errorInfo = manejarErrorSupabase(error, 'procesar expediente');
      const mensaje = errorInfo ? errorInfo.mensaje : `Error inesperado: ${error?.message || String(error)}`;
      alert(mensaje);
    } finally {
      // CORRECCIÓN CRÍTICA: Asegurar que el loading se apague SIEMPRE
      setIsSubmittingExpediente(false);
    }
  }

  // NUEVA VERSIÓN: CREA CLIENTE TANTO EN SUPABASE COMO LOCAL
  const handleCrearCliente = async (e) => {
    e.preventDefault()
    const newCliente = {
      nombre: clienteForm.nombre,
      cif_nif: clienteForm.cif || '',
      direccion: clienteForm.direccion,
      poblacion: clienteForm.poblacion,
      codigo_postal: clienteForm.cp || '',
      provincia: clienteForm.provincia,
      responsable: clienteForm.responsable,
      telefono: clienteForm.telefono || '',
      movil: clienteForm.telefono || '', // Usar teléfono como móvil si no hay móvil específico
      email: clienteForm.email || '',
      bonificaciones: '',
      gratuidades: '',
    }

    try {
      const sessionCheck = await ensureAuthenticatedSession(supabase)
      if (!sessionCheck.ok) {
        alert(sessionCheck.message)
        return
      }

      // Inserta en Supabase
      const { data, error } = await supabase.from('clientes').insert([newCliente]).select().single()
      if (error) {
        const errorInfo = manejarErrorSupabase(error, 'crear cliente');
        if (errorInfo) {
          alert(errorInfo.mensaje);
          return;
        }
        throw error;
      }

      // ARQUITECTURA UUID: Insertar Cliente -> Obtener UUID -> Usar ese UUID para cliente_id
      const nuevoClienteIdUUID = data.id ? String(data.id).trim() : null;
      if (!nuevoClienteIdUUID || nuevoClienteIdUUID === '') {
        alert('⚠️ ERROR: El cliente se creó pero el ID generado no es válido. Por favor, contacta al administrador.');
        return;
      }

      // Actualiza el estado
      await reloadClientes()
      setExpedienteForm({
        ...expedienteForm,
        clienteId: nuevoClienteIdUUID, // UUID (string)
        clienteNombre: data.nombre,
        responsable: data.responsable || ''
      })
      setClienteInputValue(data.nombre)
      setShowClienteModal(false)
      resetClienteForm()
    } catch (err) {
      alert(buildWriteErrorMessage({ table: 'clientes', error: err, action: 'crear el cliente' }))
      // Opcional: setShowClienteModal(false)
    }
  }

  // Regla 1.14: Confirmación de borrado - evita pérdidas accidentales
  const solicitarBorradoExpediente = (expediente) => {
    const nombre = expediente?.cliente_nombre || expediente?.clienteNombre || expediente?.responsable || expediente?.destino || 'este expediente'
    const destino = expediente?.destino ? ` - ${expediente.destino}` : ''
    setConfirmarBorrado({ id: expediente?.id, nombre, destino })
  }

  // Regla 1.14: Confirmación doble antes de borrar documento oficial
  const handleDeleteExpediente = async (id) => {
    if (!id) return
    // La confirmación se muestra en el modal (confirmarBorrado)
    try {
      const { error } = await supabase
        .from('expedientes')
        .delete()
        .eq('id', id)

      if (error) {
        const errorInfo = manejarErrorSupabase(error, 'eliminar expediente');
        if (errorInfo) {
          alert(errorInfo.mensaje);
          return;
        }
        throw error;
      }

      setConfirmarBorrado(null)
      alert('✅ Expediente eliminado correctamente')
      await fetchExpedientesData()
    } catch (err) {
      alert('⚠️ Error eliminando expediente. Revisa tu conexión.')
    }
  }

  const actualizarExpediente = async (expedienteActualizado) => {
    const prevExpedientes = expedientes
    const prevExpedienteActual = expedienteActual
    try {
      const idExpediente = expedienteActualizado.id
      if (!idExpediente) {
        throw new Error('id es requerido para actualizar')
      }

      // VALIDACIÓN: Si el usuario cambió numero_expediente manualmente, comprobar que no exista
      const numeroNuevo = String(expedienteActualizado.numero_expediente || expedienteActualizado.numeroExpediente || '').trim()
      const expedienteOriginal = expedientes.find(e => e.id === idExpediente)
      const numeroOriginal = String(expedienteOriginal?.numero_expediente || expedienteOriginal?.numeroExpediente || '').trim()
      if (numeroNuevo && esNumeroExpedienteValido(numeroNuevo) && numeroNuevo !== numeroOriginal) {
        const yaExiste = await existeNumeroExpedienteEnSupabase(numeroNuevo, idExpediente)
        if (yaExiste) {
          alert('Error: Este número de expediente ya está en uso')
          return
        }
      }

      // Actualización optimista: actualizar UI al instante antes de Supabase
      const updated = (expedientes || []).map(exp =>
        exp.id === expedienteActualizado.id ? expedienteActualizado : exp
      )
      setExpedientes(updated)
      storage.set('expedientes', updated)
      if (expedienteActual?.id === expedienteActualizado.id) {
        setExpedienteActual(expedienteActualizado)
      }

      // Extraer total_pax desde el propio expediente (modelo plano, sin JSON cotizacion)
      const totalPaxNumNormalizado = toIntOrNull(expedienteActualizado.total_pax)
      
      // Objeto exacto para Supabase - Asegurar que todos los campos obligatorios estén presentes y no sean NULL
      // IMPORTANTE: Las fechas deben estar en formato YYYY-MM-DD para Supabase
      // Usar EXACTAMENTE los nombres de columna restaurados en Supabase
      // ARQUITECTURA UUID: cliente_id es UUID (string)
      const clienteIdParaUpdate = expedienteActualizado.cliente_id || expedienteActualizado.clienteId;
      
      let clienteIdUUIDUpdate = null;
      if (clienteIdParaUpdate !== null && clienteIdParaUpdate !== undefined && clienteIdParaUpdate !== '') {
        clienteIdUUIDUpdate = String(clienteIdParaUpdate).trim();
        if (clienteIdUUIDUpdate === '') {
          clienteIdUUIDUpdate = null;
        }
      }
      
      const gratuidadesNum = toIntOrNull(expedienteActualizado.gratuidades) ?? 0
      const paxPagoNum = totalPaxNumNormalizado == null
        ? (toIntOrNull(expedienteActualizado.pax_pago) ?? 1)
        : Math.max(1, totalPaxNumNormalizado - gratuidadesNum)

      // numero_expediente: normalizar formato YYYY-XXX con ceros a la izquierda
      let numeroExpParaSupabase = null
      if (numeroNuevo && esNumeroExpedienteValido(numeroNuevo)) {
        const partes = numeroNuevo.split('-')
        if (partes.length === 2) {
          const año = partes[0]
          const seq = parseInt(partes[1], 10)
          numeroExpParaSupabase = !isNaN(seq) ? `${año}-${String(seq).padStart(3, '0')}` : numeroNuevo
        } else {
          numeroExpParaSupabase = numeroNuevo
        }
      }

      const expedienteActualizadoParaSupabase = {
        cliente_id: (clienteIdUUIDUpdate && clienteIdUUIDUpdate !== '') ? clienteIdUUIDUpdate : null,
        cliente_nombre: String(expedienteActualizado.cliente_nombre || expedienteActualizado.clienteNombre || ''),
        fecha_inicio: convertirFechaAISO(expedienteActualizado.fecha_inicio || expedienteActualizado.fechaInicio || ''),
        fecha_final: convertirFechaAISO(expedienteActualizado.fecha_final || expedienteActualizado.fechaFin || expedienteActualizado.fecha_fin || ''),
        destino: String(expedienteActualizado.destino || ''),
        telefono: String(expedienteActualizado.telefono || ''),
        email: String(expedienteActualizado.email || ''),
        responsable: String(expedienteActualizado.responsable || ''),
        estado: String(expedienteActualizado.estado || 'peticion'),
        tipo_colectivo: ((expedienteActualizado?.tipo_colectivo || '').trim()) || null,
        duracion_viaje: ((expedienteActualizado?.duracion_viaje || '').trim()) || null,
        observaciones: String(expedienteActualizado.observaciones || ''),
        itinerario: String(expedienteActualizado.itinerario || ''),
        total_pax: totalPaxNumNormalizado == null ? null : Number(totalPaxNumNormalizado),
        gratuidades: isNaN(gratuidadesNum) ? 0 : gratuidadesNum,
        pax_pago: paxPagoNum,
        precio_venta_cliente: expedienteActualizado.precio_venta_cliente != null ? Number(expedienteActualizado.precio_venta_cliente) : 0,
        bonificacion_pax: expedienteActualizado.bonificacion_pax != null ? Number(expedienteActualizado.bonificacion_pax) : 0,
      }
      if (numeroExpParaSupabase) {
        expedienteActualizadoParaSupabase.numero_expediente = numeroExpParaSupabase
      }

      // ESCÁNER ELÁSTICO: sanitiza silenciosamente sin bloquear al usuario
      const { datosSanitizados: updateSanitizado } = sanitizarExpedienteParaDB(expedienteActualizadoParaSupabase);
      Object.assign(expedienteActualizadoParaSupabase, updateSanitizado);

      const { error } = await supabase
        .from('expedientes')
        .update(expedienteActualizadoParaSupabase)
        .eq('id', idExpediente)
      
      if (error) {
        const errorInfo = manejarErrorSupabase(error, 'actualizar expediente');
        if (errorInfo) {
          alert(errorInfo.mensaje);
        }
        setExpedientes(prevExpedientes)
        storage.set('expedientes', prevExpedientes)
        if (prevExpedienteActual?.id === expedienteActualizado.id) {
          setExpedienteActual(prevExpedienteActual)
        }
        return;
      }
      await fetchExpedientesData()
    } catch (err) {
      alert('⚠️ Error actualizando expediente. Revisa tu conexión.')
      setExpedientes(prevExpedientes)
      storage.set('expedientes', prevExpedientes)
      if (prevExpedienteActual?.id === expedienteActualizado.id) {
        setExpedienteActual(prevExpedienteActual)
      }
    }
  }

  const cambiarEstado = async (id, nuevoEstado) => {
    const estadoNorm = (nuevoEstado || '').toString().trim().toLowerCase()
    const esFinalizadoOCerrado = estadoNorm === 'finalizado' || estadoNorm === 'cerrado'

    if (esFinalizadoOCerrado) {
      const expediente = expedientes.find(exp => exp.id === id)
      setConfirmarCierre({ id, nuevoEstado, expediente })
      return
    }

    await ejecutarCambioEstado(id, nuevoEstado, false)
  }

  const ejecutarCambioEstado = async (id, nuevoEstado, debeConsolidar) => {
    try {
      let expediente = expedientes.find(exp => exp.id === id)
      if (debeConsolidar) {
        const { data } = await supabase.from('expedientes').select('id, numero_expediente, versiones_json').eq('id', id).single()
        expediente = data || expediente
      }

      if (debeConsolidar && expediente) {
        const validacion = await validarProveedoresServicios(id, expediente?.versiones_json)
        if (!validacion.ok) {
          const confirmarSinProveedor = window.confirm(
            validacion.warning || 'Falta proveedor por asignar. ¿Deseas consolidar de todas formas?'
          )
          if (!confirmarSinProveedor) return
        }
        const cons = await consolidarGastosExpediente(id, expediente, true)
        if (!cons.ok) {
          alert(cons.error || 'Error al consolidar gastos.')
          return
        }
      } else {
        const cons = await consolidarGastosExpediente(id, expediente || { id }, false)
        if (!cons.ok) {
          console.warn('Consolidación DELETE:', cons.error)
        }
      }

      const { error } = await supabase
        .from('expedientes')
        .update({ estado: nuevoEstado })
        .eq('id', id)

      if (error) {
        const errorInfo = manejarErrorSupabase(error, 'cambiar estado')
        if (errorInfo) {
          alert(errorInfo.mensaje)
          return
        }
        throw error
      }
      await fetchExpedientesData()

      const expedienteLocal = expedientes.find(exp => exp.id === id)
      if (expedienteLocal?.planningId) {
        const planning = storage.getPlanning()
        const updatedPlanning = (planning || []).map(p =>
          p.id === expedienteLocal.planningId ? { ...p, estado: nuevoEstado } : p
        )
        storage.setPlanning(updatedPlanning)
      }
    } catch (err) {
      alert('⚠️ Error actualizando estado. Revisa tu conexión.')
    }
  }

  // ========= Buscador: SIEMPRE mostrar clientes de Supabase ===========
  const [loadingClientes, setLoadingClientes] = useState(false)
  const clientesFiltrados = React.useMemo(() => {
    // Siempre incluir TODOS los clientes de la base, y filtrar si hay texto
    if (clienteInputValue.trim() === '') {
      return clientes.slice().sort((a, b) => (a.nombre || '').toLowerCase().localeCompare((b.nombre || '').toLowerCase()))
    }
    return clientes.filter(c =>
      c.nombre?.toLowerCase().includes(clienteInputValue.toLowerCase()) ||
      c.poblacion?.toLowerCase().includes(clienteInputValue.toLowerCase())
    ).sort((a, b) => (a.nombre || '').toLowerCase().localeCompare((b.nombre || '').toLowerCase()))
  }, [clientes, clienteInputValue])

  // Selección de cliente: AUTOCOMPLETADO TOTAL
  // CORRECCIÓN OBLIGATORIA: Sincronización de Selección - Asegurar que selectedClientId reciba el ID numérico
  const seleccionarCliente = (cliente) => {
    // CORRECCIÓN CRÍTICA: Forzar conversión a número entero ANTES de guardar
    if (!cliente || !cliente.id) {
      alert('⚠️ ERROR: Cliente inválido. Por favor, selecciona un cliente válido de la lista.');
      return;
    }
    
    // ARQUITECTURA UUID: cliente.id es UUID (string), NO integer
    const clienteIdUUID = cliente.id ? String(cliente.id).trim() : null;
    if (!clienteIdUUID || clienteIdUUID === '') {
      alert(`⚠️ ERROR: El cliente seleccionado tiene un ID inválido (${cliente.id}). Por favor, selecciona un cliente válido.`);
      return;
    }
    
    // ARQUITECTURA UUID: Guardar como UUID (string)
    setExpedienteForm(prev => ({
      ...prev,
      clienteId: clienteIdUUID, // UUID (string)
      clienteNombre: cliente.nombre || '',
      responsable: cliente.responsable || '',
      telefono: cliente.telefono || cliente.movil || '',
      email: cliente.email || ''
    }))
    
    setClienteInputValue(cliente.nombre)
    setShowSuggestions(false)
  }

  // El buscador solo manipula el value buscado y activa sugerencias
  // CORRECCIÓN OBLIGATORIA: NO limpiar clienteId si ya hay uno válido seleccionado
  const handleClienteInputChange = (value) => {
    setClienteInputValue(value)
    setShowSuggestions(true)
    // CORRECCIÓN: Solo limpiar clienteId si el input está completamente vacío Y no hay un ID válido ya guardado
    // Esto evita perder la selección si el usuario está editando el texto
    if ((!value || value.trim() === '') && (!expedienteForm.clienteId || typeof expedienteForm.clienteId !== 'number')) {
      setExpedienteForm(prev => ({
        ...prev,
        clienteId: null, // Usar null en lugar de '' para números
        clienteNombre: ''
      }))
    }
  }
  const handleClienteInputFocus = () => {
    setShowSuggestions(true)
  }

  const resetExpedienteForm = () => {
    setExpedienteForm({
      responsable: '',
      destino: '',
      fechaInicio: '',
      fechaFin: '',
      clienteId: null, // Usar null para números, no '' (string vacío)
      clienteNombre: '',
      telefono: '',
      email: '',
      estado: 'peticion',
      tipo_colectivo: '',
      duracion_viaje: '',
      observaciones: '',
      itinerario: '',
      total_pax: '',
    })
    setClienteInputValue('')
    setShowSuggestions(false)
    setAvisoFormularioExpediente(null)
  }

  const resetClienteForm = () => {
    setClienteForm({
      nombre: '',
      cif: '',
      direccion: '',
      poblacion: '',
      cp: '',
      provincia: '',
      nSocios: '',
      responsable: '',
      telefono: '',
      email: ''
    })
  }

  const abrirDetalle = (expediente) => {
    setExpedienteActual(expediente)
    setShowDetalleModal(true)
  }

  // PROTECCIÓN: Obtener nombre de cliente de forma segura
  const getClienteNombre = (clienteId) => {
    try {
      if (!clienteId) return 'Pendiente'
      const cliente = clientes.find(c => c.id === clienteId)
      return cliente?.nombre || 'Pendiente'
    } catch (error) {
      return 'Pendiente'
    }
  }

  const exportarTrimestre = () => {
    setShowExportModal(false)
  }

  // ============ BLOQUEO DE FANTASMAS (Regla: evitar expedientes sin fechas) ============
  // El botón Guardar está deshabilitado si Fecha Inicio o Fecha Fin están vacíos (+ Nombre/Cliente)
  const isFormValid = React.useMemo(() => {
    const nombreCompleto = (clienteInputValue || expedienteForm.clienteNombre || '').trim()
    const fechaInicioValida = (expedienteForm.fechaInicio || '').trim() !== ''
    const fechaFinValida = (expedienteForm.fechaFin || '').trim() !== ''
    return nombreCompleto !== '' && fechaInicioValida && fechaFinValida
  }, [clienteInputValue, expedienteForm.clienteNombre, expedienteForm.fechaInicio, expedienteForm.fechaFin])

  // Tab: Pendientes | Confirmados | Finalizados | Cancelados (soporta ?tab= desde URL)
  const tabParam = searchParams.get('tab')
  const tabInicial = ['pendientes', 'confirmados', 'finalizado', 'cancelado'].includes(tabParam || '') ? tabParam : 'pendientes'
  const [tabExpedientes, setTabExpedientes] = useState(tabInicial)

  useEffect(() => {
    if (tabParam && ['pendientes', 'confirmados', 'finalizado', 'cancelado'].includes(tabParam)) {
      setTabExpedientes(tabParam)
    }
  }, [tabParam])

  // Filtrar expedientes por ejercicio y búsqueda (base común)
  // IMPORTANTE: Expedientes sin fecha se mantienen en BD pero no se muestran (se arreglan manualmente)
  const expedientesFiltradosPorEjercicioYBusqueda = expedientes.filter(exp => {
    // Filtro por ejercicio (expedientes sin fecha no aparecen en el listado por ejercicio)
    const fechaInicio = exp.fecha_inicio || exp.fechaInicio
    const añoEjercicioRegistro =
      exp.ejercicio != null && exp.ejercicio !== '' && Number.isFinite(Number(exp.ejercicio))
        ? Number(exp.ejercicio)
        : (fechaInicio ? extraerAño(fechaInicio) : null)
    if (añoEjercicioRegistro == null || añoEjercicioRegistro !== ejercicioActual) return false
    
    // Filtro por búsqueda (cliente, responsable, destino, observaciones)
    if (!searchTermExpedientes.trim()) return true
    
    const term = searchTermExpedientes.toLowerCase()
    const cliente = clientes.find(c => String(c.id) === String(exp.cliente_id || exp.clienteId))
    const nombreCliente = cliente?.nombre || exp.cliente_nombre || ''
    const responsable = exp.responsable || ''
    const destino = exp.destino || ''
    
    return (
      nombreCliente.toLowerCase().includes(term) ||
      responsable.toLowerCase().includes(term) ||
      destino.toLowerCase().includes(term) ||
      exp.observaciones?.toLowerCase().includes(term)
    )
  })

  // Filtrar por pestaña activa: conteo por estado (case-insensitive, BD puede guardar 'Cerrado', 'Finalizado', etc.)
  const expedientesPorTab = TABS_EXPEDIENTES.reduce((acc, t) => {
    acc[t.id] = expedientesFiltradosPorEjercicioYBusqueda.filter(exp => {
      const estadoExp = (exp.estado ?? '').toString().trim().toLowerCase()
      return (t.estados || []).some(e => ((e ?? '').toString().trim().toLowerCase()) === estadoExp)
    })
    return acc
  }, {})

  const expedientesFiltradosPorEjercicio = expedientesPorTab[tabExpedientes] || []
  const expedientesFinales = (expedientesFiltradosPorEjercicio || []).slice().sort((a, b) => {
    if (a?.estado === 'Cerrado' && b?.estado === 'Cerrado') {
      return new Date(b?.created_at || 0) - new Date(a?.created_at || 0)
    }
    return 0 // Mantener orden original para el resto
  })

  // No desmontar el modal de detalle durante el loading: preservar pestaña activa (ej. Cotización)
  if (isLoading && !showDetalleModal) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-xl text-gray-600 font-medium">Cargando...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-navy-900 mb-2">Gestión de Expedientes</h1>
          <p className="text-gray-600">Sistema completo con estados y seguimiento</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Ejercicio:</label>
            <select
              value={ejercicioActual}
              onChange={(e) => {
                const nuevoEjercicio = parseInt(e.target.value)
                setEjercicioActual(nuevoEjercicio) // Actualizar estado local de React
                guardarEjercicioGlobal(nuevoEjercicio) // Guardar en localStorage y disparar evento global
              }}
              className="px-3 py-2 border-2 border-navy-300 rounded-lg bg-white text-navy-900 font-semibold focus:outline-none focus:ring-2 focus:ring-navy-500"
              style={{ backgroundColor: 'white', color: '#0f172a' }}
            >
              {getAñosDisponibles().map(año => (
                <option key={año} value={año}>{año}</option>
              ))}
            </select>
          </div>
          <button onClick={() => setShowExportModal(true)} className="btn-secondary flex items-center justify-center p-3 rounded-xl" title="Exportar trimestre" style={{ fontSize: '16px' }}>
            <Download size={20} />
          </button>
          <button onClick={() => setShowExpedienteModal(true)} className="px-4 py-2 bg-slate-800 text-white rounded-lg flex items-center gap-2 font-semibold hover:bg-slate-700 transition-colors" title="Nuevo Expediente">
            <Plus size={20} />
            Nuevo Expediente
          </button>
        </div>
      </div>

      {/* ==================== BUSCADOR DE EXPEDIENTES ==================== */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar expedientes por cliente, responsable, destino..."
            value={searchTermExpedientes}
            onChange={(e) => setSearchTermExpedientes(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border-2 border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent"
            style={{ fontSize: '16px' }}
            title="Buscar por cliente, responsable o destino"
          />
        </div>
      </div>

      {/* ==================== PESTAÑAS: 4 ESTADOS ==================== */}
      <div className="mb-6 border-b border-gray-200 overflow-x-auto">
        <nav className="flex gap-2 -mb-px min-w-max pb-px" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {TABS_EXPEDIENTES.map(t => {
            const count = (expedientesPorTab[t.id] || []).length
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTabExpedientes(t.id)}
                className={`flex items-center gap-2 px-5 py-3 border-b-2 font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                  tabExpedientes === t.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }`}
                style={{ fontSize: '16px' }}
                title={t.label}
              >
                {t.label} ({count})
              </button>
            )
          })}
        </nav>
      </div>

      {/* ==================== CONTADOR DE EXPEDIENTES ==================== */}
      <div className="mb-6 p-4 bg-gradient-to-r from-navy-50 to-blue-50 rounded-xl border border-navy-200">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Calendar className="text-navy-600" size={24} />
            <div>
              <p className="text-sm font-medium text-gray-700">
                Ejercicio {ejercicioActual} · {(TABS_EXPEDIENTES.find(t => t.id === tabExpedientes) || {}).label || tabExpedientes}
              </p>
              <p className="text-xs text-gray-500">
                {searchTermExpedientes 
                  ? `Buscando: "${searchTermExpedientes}" - ${expedientesFiltradosPorEjercicio.length} resultado${expedientesFiltradosPorEjercicio.length !== 1 ? 's' : ''}`
                  : `${(TABS_EXPEDIENTES.find(t => t.id === tabExpedientes) || {}).label || ''} en ${ejercicioActual}`
                }
              </p>
            </div>
          </div>
          <div className="px-4 py-2 bg-navy-600 text-white rounded-lg font-bold">
            {expedientesFiltradosPorEjercicio.length} expediente{expedientesFiltradosPorEjercicio.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {TABS_EXPEDIENTES.map(t => {
          const primerEstado = (t.estados || [])[0]
          const estado = ESTADOS[primerEstado] || ESTADOS.peticion
          const count = (expedientesPorTab[t.id] || []).length
          const isActive = tabExpedientes === t.id
          return (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() => setTabExpedientes(t.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTabExpedientes(t.id); } }}
              className={`card border-2 cursor-pointer transition-all hover:shadow-lg ${estado.color} ${isActive ? 'ring-2 ring-navy-500 ring-offset-2 shadow-lg' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-2xl font-bold">{count}</p>
                </div>
                <div className={`w-3 h-3 rounded-full ${estado.badge}`}></div>
              </div>
            </div>
          )
        })}
      </div>

      {expedientesFiltradosPorEjercicio.length === 0 ? (
        <div className="card text-center py-12">
          <FileText className="mx-auto text-gray-400 mb-4" size={64} />
          <h3 className="text-xl font-bold text-gray-700 mb-2">
            No hay expedientes en {(TABS_EXPEDIENTES.find(t => t.id === tabExpedientes) || {}).label || 'esta pestaña'}
          </h3>
          <p className="text-gray-600 mb-6">
            {expedientes.length === 0 ? 'Crea tu primer expediente' : `No hay expedientes con estado ${(TABS_EXPEDIENTES.find(t => t.id === tabExpedientes) || {}).label || ''} en ${ejercicioActual}`}
          </p>
          {tabExpedientes === 'pendientes' && (
            <button onClick={() => setShowExpedienteModal(true)} className="px-4 py-2 bg-slate-800 text-white rounded-lg flex items-center gap-2 font-semibold hover:bg-slate-700 transition-colors" title="Nuevo Expediente">
              <Plus size={20} />
              Nuevo Expediente
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {expedientesFinales.map((expediente, idx) => {
              try {
                if (!expediente || !expediente.id) return null
                const estado = getEstadoUI(expediente.estado)
                const cliente = clientes.find(c => String(c.id) === String(expediente.cliente_id || expediente.clienteId)) || {}
                const nombreGrupo = expediente.cliente_nombre || cliente.nombre || 'GRUPO SIN NOMBRE'
                const responsableCompleto = expediente.responsable || cliente.responsable || ''
                const fechaInicio = expediente.fecha_inicio || expediente.fechaInicio || ''
                const fechaFin = expediente.fecha_final || expediente.fechaFin || expediente.fecha_fin || ''

                const esCancelado = (expediente.estado || '').toString().trim().toLowerCase() === 'cancelado'
                return (
                  <div key={expediente.id} className={`card border-l-4 ${estado.badge.replace('bg-', 'border-')} hover:shadow-xl transition-shadow cursor-pointer ${esCancelado ? 'bg-red-50/50 border-red-200' : ''}`}
                       onClick={() => abrirDetalle(expediente)}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <h2 className="text-2xl font-black text-navy-900 uppercase tracking-wide mb-1" style={{ fontSize: '16px' }}>
                          {nombreGrupo}
                        </h2>
                        {responsableCompleto && (
                          <p className="text-navy-700 font-medium mb-1" style={{ fontSize: '16px' }} title="Responsable">
                            👤 {responsableCompleto}
                          </p>
                        )}
                        <DestinoExpedienteEditable
                          expedienteId={expediente.id}
                          value={expediente.destino}
                          variant="card"
                          onSaved={(d) => aplicarDestinoLocal(expediente.id, d)}
                        />
                    </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          solicitarBorradoExpediente(expediente)
                        }}
                        className="text-red-600 hover:text-red-900 p-2"
                        style={{ cursor: 'pointer' }}
                        title="Eliminar expediente"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                    <div className="space-y-2 mb-4">
                      {fechaInicio && (
                        <p className="text-gray-700" style={{ fontSize: '16px' }}>
                          📅 {formatearFecha(fechaInicio)}
                          {fechaFin && ` - ${formatearFecha(fechaFin)}`}
                        </p>
                      )}
                      {expediente && expediente.tipo_colectivo && (
                        <p className="text-gray-600" style={{ fontSize: '14px' }}>Tipo: {expediente.tipo_colectivo}</p>
                      )}
                      {expediente && expediente.duracion_viaje && (
                        <p className="text-gray-600" style={{ fontSize: '14px' }}>Duración: {expediente.duracion_viaje}</p>
                      )}
                      <p className="text-gray-600" style={{ fontSize: '14px' }}>
                        Cierre: {expediente?.cierre_grupo ? 'Cerrado' : 'Abierto'}
                        {typeof expediente?.cierre_grupo === 'object' && typeof (expediente.cierre_grupo?.beneficio_limpio ?? expediente.cierre_grupo?.beneficio ?? expediente.cierre_grupo?.beneficio_neto) === 'number' && (
                          <span className="ml-1 font-semibold">
                            ({(expediente.cierre_grupo?.beneficio_limpio ?? expediente.cierre_grupo?.beneficio ?? expediente.cierre_grupo?.beneficio_neto ?? 0).toFixed(2)} €)
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-4">
                      <button
                        title="Petición"
                        type="button"
                        onClick={(e) => { e.stopPropagation(); cambiarEstado(expediente?.id, 'peticion'); }}
                        className={`w-9 h-9 rounded-full flex items-center justify-center font-bold shadow-sm transition-all ${['peticion', 'confirmado'].includes((expediente?.estado || '').toString().trim().toLowerCase()) ? 'bg-yellow-400 text-black' : 'bg-gray-100 text-gray-400'}`}
                      >P</button>
                      <button
                        title="Confirmado"
                        type="button"
                        onClick={(e) => { e.stopPropagation(); cambiarEstado(expediente?.id, 'en_curso'); }}
                        className={`w-9 h-9 rounded-full flex items-center justify-center font-bold shadow-sm transition-all ${(expediente?.estado || '').toString().trim().toLowerCase() === 'en_curso' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}
                      >C</button>
                      <button
                        title="Finalizado"
                        type="button"
                        onClick={(e) => { e.stopPropagation(); cambiarEstado(expediente?.id, 'finalizado'); }}
                        className={`w-9 h-9 rounded-full flex items-center justify-center font-bold shadow-sm transition-all ${(expediente?.estado || '').toString().trim().toLowerCase() === 'finalizado' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'}`}
                      >F</button>
                      <button
                        title="Cerrado"
                        type="button"
                        onClick={(e) => { e.stopPropagation(); cambiarEstado(expediente?.id, 'Cerrado'); }}
                        className={`w-9 h-9 rounded-full flex items-center justify-center font-bold shadow-sm transition-all ${(expediente?.estado || '').toString().trim().toLowerCase() === 'cerrado' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-400'}`}
                      >Ce</button>
                      <button
                        title="Cancelado"
                        type="button"
                        onClick={(e) => { e.stopPropagation(); cambiarEstado(expediente?.id, 'cancelado'); }}
                        className={`w-9 h-9 rounded-full flex items-center justify-center font-bold shadow-sm transition-all ${(expediente?.estado || '').toString().trim().toLowerCase() === 'cancelado' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-400'}`}
                      >Ca</button>
                    </div>
                  </div>
                )
              } catch (error) {
                return (
                  <div key={expediente?.id || `err-${idx}`} className="card border-l-4 border-red-500 bg-red-50">
                    <div className="p-4">
                      <p className="text-red-800 font-bold">⚠️ Error en expediente</p>
                      <p className="text-red-600 text-sm mt-1">
                        {expediente?.destino || expediente?.cliente_nombre || 'Expediente con datos incompletos'}
                      </p>
                      <button
                        onClick={() => solicitarBorradoExpediente(expediente)}
                        className="btn-secondary text-xs mt-2"
                      >
                        Eliminar expediente corrupto
                      </button>
                    </div>
                  </div>
                )
              }
            })}
        </div>
      )}

      {/* Modal Confirmación Cierre (consolidación de gastos) */}
      {confirmarCierre && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-navy-900 mb-2">Confirmar cierre</h2>
            <p className="text-gray-600 mb-4">
              ¿Confirmar cierre? Se consolidarán los costes para el análisis financiero.
            </p>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  const { id, nuevoEstado, expediente } = confirmarCierre
                  setConfirmarCierre(null)
                  await ejecutarCambioEstado(id, nuevoEstado, true)
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                Confirmar
              </button>
              <button
                onClick={() => setConfirmarCierre(null)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmación Borrado (Regla 1.14) */}
      {confirmarBorrado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-navy-900 mb-2">Confirmar eliminación</h2>
            <p className="text-gray-600 mb-4">
              ¿Estás seguro de que quieres borrar el expediente <strong>"{confirmarBorrado.nombre}{confirmarBorrado.destino}"</strong>?
            </p>
            <p className="text-sm text-red-600 mb-6">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDeleteExpediente(confirmarBorrado.id)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
              >
                Confirmar
              </button>
              <button
                onClick={() => setConfirmarBorrado(null)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Exportar */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-navy-900">Exportar Trimestre</h2>
              <p className="text-gray-600 text-sm mt-1">Selecciona el trimestre para la gestoría</p>
            </div>
            <div className="p-6">
              <label className="label">Trimestre</label>
              <select
                value={trimestreExport}
                onChange={(e) => setTrimestreExport(e.target.value)}
                className="input-field mb-6"
              >
                <option value="Q1">Q1 - Enero a Marzo</option>
                <option value="Q2">Q2 - Abril a Junio</option>
                <option value="Q3">Q3 - Julio a Septiembre</option>
                <option value="Q4">Q4 - Octubre a Diciembre</option>
              </select>
              <div className="flex gap-3">
                <button onClick={exportarTrimestre} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  <Download size={20} />
                  Generar Listado
                </button>
                <button onClick={() => setShowExportModal(false)} className="btn-secondary flex-1">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nuevo Expediente */}
      {showExpedienteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div 
            className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: 'white', color: 'black' }}
          >
            <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-2xl font-bold text-navy-900">Nuevo Expediente</h2>
              <button onClick={() => { setShowExpedienteModal(false); resetExpedienteForm(); }} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleExpedienteSubmit} className="p-6 md:p-8" style={{ backgroundColor: 'white', color: 'black' }}>
              {avisoFormularioExpediente ? (
                <div
                  role="alert"
                  className="mb-8 rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/95 to-stone-50/80 px-6 py-5 text-[15px] leading-relaxed tracking-wide text-slate-800 shadow-sm"
                >
                  <p className="font-medium text-slate-900" style={{ letterSpacing: '0.02em' }}>
                    {avisoFormularioExpediente}
                  </p>
                </div>
              ) : null}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="md:col-span-2">
                  <div className="flex justify-between items-center mb-2">
                    <label className="label mb-0">Nombre del Grupo</label>
                    <button
                      type="button"
                      onClick={() => setShowClienteModal(true)}
                      className="text-sm text-navy-600 hover:text-navy-800 flex items-center gap-1"
                    >
                      <UserPlus size={16} />
                      Crear Nuevo Cliente
                    </button>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      placeholder="Buscar cliente existente o escribir uno nuevo..."
                      value={clienteInputValue}
                      onChange={(e) => handleClienteInputChange(e.target.value)}
                      onFocus={handleClienteInputFocus}
                      className="input-field pl-10 bg-white text-black border-gray-200"
                      style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                    />
                  </div>
                  {showSuggestions && (
                    <div className="mt-2 max-h-48 overflow-y-auto border-2 border-navy-300 rounded-lg shadow-lg bg-white">
                      {clientesFiltrados.length > 0 ? (
                        (clientesFiltrados || []).map(cliente => (
                          <div
                            key={cliente.id}
                            onClick={() => seleccionarCliente(cliente)}
                            className={`p-3 cursor-pointer hover:bg-navy-50 border-b border-gray-100 last:border-b-0 ${
                              expedienteForm.clienteId === cliente.id ? 'bg-navy-100' : ''
                            }`}
                          >
                            <p className="font-medium text-navy-900">{cliente.nombre}</p>
                            <p className="text-sm text-gray-600">{cliente.poblacion} {cliente.provincia && `- ${cliente.provincia}`}</p>
                            {cliente.responsable && (
                              <p className="text-xs text-navy-600 mt-1">👤 {cliente.responsable}</p>
                            )}
                          </div>
                        ))
                      ) : clienteInputValue.trim() !== '' ? (
                        <div className="p-3 text-center text-gray-500 text-sm">
                          No se encontró "{clienteInputValue}". Se creará como nuevo cliente.
                        </div>
                      ) : (
                        <div className="p-3 text-center text-gray-500 text-sm">
                          No hay clientes registrados. Cree uno nuevo.
                        </div>
                      )}
                    </div>
                  )}
                  {clienteInputValue && (
                    <div className="mt-2">
                      {expedienteForm.clienteId ? (
                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-sm font-medium text-green-800">
                            ✓ Cliente seleccionado: {getClienteNombre(expedienteForm.clienteId)}
                          </p>
                        </div>
                      ) : (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-sm font-medium text-blue-800">
                            ➕ Se creará nuevo cliente: "{clienteInputValue}"
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="label">Responsable</label>
                  <input
                    type="text"
                    value={expedienteForm.responsable}
                    onChange={(e) => setExpedienteForm({ ...expedienteForm, responsable: e.target.value })}
                    className="input-field bg-white text-black border-gray-200"
                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                    placeholder="Nombre del responsable del viaje"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {expedienteForm.clienteId ? '✓ Auto-rellenado del cliente seleccionado' : 'Se puede rellenar manualmente'}
                  </p>
                </div>
                <div>
                  <label className="label">Teléfono</label>
                  <input
                    type="tel"
                    value={expedienteForm.telefono}
                    onChange={(e) => setExpedienteForm({ ...expedienteForm, telefono: e.target.value })}
                    className="input-field bg-white text-black border-gray-200"
                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                    placeholder="Teléfono de contacto"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {expedienteForm.clienteId ? '✓ Auto-rellenado del cliente' : 'Opcional'}
                  </p>
                </div>
                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    value={expedienteForm.email}
                    onChange={(e) => setExpedienteForm({ ...expedienteForm, email: e.target.value })}
                    className="input-field bg-white text-black border-gray-200"
                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                    placeholder="Email de contacto"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {expedienteForm.clienteId ? '✓ Auto-rellenado del cliente' : 'Opcional'}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className="label">Destino</label>
                  <input
                    type="text"
                    value={expedienteForm.destino}
                    onChange={(e) => setExpedienteForm({ ...expedienteForm, destino: e.target.value })}
                    className="input-field bg-white text-black border-gray-200"
                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                    placeholder="Ej: Galicia"
                  />
                </div>
                <div>
                  <label className="label">Fecha Inicio</label>
                  <input
                    type="date"
                    value={convertirEspañolAISO(expedienteForm.fechaInicio) || ''}
                    onChange={(e) => {
                      const fechaISO = e.target.value
                      const fechaEspañola = convertirISOAEspañol(fechaISO)
                      setExpedienteForm({ ...expedienteForm, fechaInicio: fechaEspañola })
                    }}
                    className="input-field bg-white text-black border-gray-200"
                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    📅 Determina el ejercicio (año) del expediente
                  </p>
                </div>
                <div>
                  <label className="label">Fecha Fin</label>
                  <input
                    type="date"
                    value={convertirEspañolAISO(expedienteForm.fechaFin) || ''}
                    onChange={(e) => {
                      const fechaISO = e.target.value
                      const fechaEspañola = convertirISOAEspañol(fechaISO)
                      setExpedienteForm({ ...expedienteForm, fechaFin: fechaEspañola })
                    }}
                    className="input-field bg-white text-black border-gray-200"
                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Estado Inicial</label>
                  <select
                    value={expedienteForm.estado}
                    onChange={(e) => setExpedienteForm({ ...expedienteForm, estado: e.target.value })}
                    className="input-field bg-white text-black border-gray-200"
                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                  >
                    {ESTADOS_UI.map((key) => (
                      <option key={key} value={key}>{ESTADOS[key].label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Tipo Colectivo</label>
                  <select
                    value={(expedienteForm?.tipo_colectivo || '')}
                    onChange={(e) => setExpedienteForm({ ...expedienteForm, tipo_colectivo: e.target.value })}
                    className="input-field bg-white text-black border-gray-200"
                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                  >
                    <option value="">— Seleccionar —</option>
                    {TIPO_COLECTIVO_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Duración del Viaje</label>
                  <select
                    value={(expedienteForm?.duracion_viaje || '')}
                    onChange={(e) => setExpedienteForm({ ...expedienteForm, duracion_viaje: e.target.value })}
                    className="input-field bg-white text-black border-gray-200"
                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                  >
                    <option value="">— Seleccionar —</option>
                    {DURACION_VIAJE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="label">Observaciones</label>
                  <textarea
                    value={expedienteForm.observaciones}
                    onChange={(e) => setExpedienteForm({ ...expedienteForm, observaciones: e.target.value })}
                    className="input-field bg-white text-black border-gray-200"
                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                    rows="3"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Itinerario</label>
                  <textarea
                    value={expedienteForm.itinerario}
                    onChange={(e) => setExpedienteForm({ ...expedienteForm, itinerario: e.target.value })}
                    className="input-field bg-white text-black border-gray-200"
                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                    rows="3"
                    placeholder="Descripción del itinerario del viaje..."
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button 
                  type="submit" 
                  className={`flex-1 flex items-center justify-center gap-2 font-semibold rounded-lg transition-colors ${
                    !isFormValid || isSubmittingExpediente
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'btn-primary'
                  }`}
                  disabled={!isFormValid || isSubmittingExpediente}
                  title={!isFormValid ? 'Completa Nombre, Cliente, Fecha Inicio y Fecha Fin para guardar' : ''}
                >
                  {isSubmittingExpediente ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" onClick={() => { setShowExpedienteModal(false); resetExpedienteForm(); }} className="btn-secondary flex-1">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Crear Cliente */}
      {showClienteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div 
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full"
            style={{ backgroundColor: 'white', color: 'black' }}
          >
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-navy-900">Crear Nuevo Cliente</h2>
              <button onClick={() => setShowClienteModal(false)} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleCrearCliente} className="p-6" style={{ backgroundColor: 'white', color: 'black' }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="label">Nombre del Grupo</label>
                  <input
                    type="text"
                    value={clienteForm.nombre}
                    onChange={(e) => setClienteForm({ ...clienteForm, nombre: e.target.value })}
                    className="input-field bg-white text-black border-gray-200"
                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                  />
                </div>
                <div>
                  <label className="label">CIF</label>
                  <input
                    type="text"
                    value={clienteForm.cif}
                    onChange={(e) => setClienteForm({ ...clienteForm, cif: e.target.value })}
                    className="input-field bg-white text-black border-gray-200"
                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                  />
                </div>
                <div>
                  <label className="label">Nº de Socios</label>
                  <input
                    type="number"
                    value={clienteForm.nSocios}
                    onChange={(e) => setClienteForm({ ...clienteForm, nSocios: e.target.value })}
                    onFocus={(e) => e.target.select()}
                    className="input-field bg-white text-black border-gray-200"
                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Responsable</label>
                  <input
                    type="text"
                    value={clienteForm.responsable}
                    onChange={(e) => setClienteForm({ ...clienteForm, responsable: e.target.value })}
                    className="input-field bg-white text-black border-gray-200"
                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                    placeholder="Se usará como responsable del expediente"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Dirección</label>
                  <input
                    type="text"
                    value={clienteForm.direccion}
                    onChange={(e) => setClienteForm({ ...clienteForm, direccion: e.target.value })}
                    className="input-field bg-white text-black border-gray-200"
                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                  />
                </div>
                <div>
                  <label className="label">Población</label>
                  <input
                    type="text"
                    value={clienteForm.poblacion}
                    onChange={(e) => setClienteForm({ ...clienteForm, poblacion: e.target.value })}
                    className="input-field bg-white text-black border-gray-200"
                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                  />
                </div>
                <div>
                  <label className="label">CP</label>
                  <input
                    type="text"
                    value={clienteForm.cp}
                    onChange={(e) => setClienteForm({ ...clienteForm, cp: e.target.value })}
                    className="input-field bg-white text-black border-gray-200"
                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Provincia</label>
                  <input
                    type="text"
                    value={clienteForm.provincia}
                    onChange={(e) => setClienteForm({ ...clienteForm, provincia: e.target.value })}
                    className="input-field bg-white text-black border-gray-200"
                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                  />
                </div>
                <div>
                  <label className="label">Teléfono</label>
                  <input
                    type="text"
                    value={clienteForm.telefono}
                    onChange={(e) => setClienteForm({ ...clienteForm, telefono: e.target.value })}
                    className="input-field bg-white text-black border-gray-200"
                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                  />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input
                    type="text"
                    value={clienteForm.email}
                    onChange={(e) => setClienteForm({ ...clienteForm, email: e.target.value })}
                    className="input-field bg-white text-black border-gray-200"
                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button type="submit" className="btn-primary flex-1">
                  Crear y Asignar Cliente
                </button>
                <button type="button" onClick={() => setShowClienteModal(false)} className="btn-secondary flex-1">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Orquestador: lista de globos → al hacer clic abre ExpedienteDetalle (ficha) que a su vez usa ExpedienteFinanzas para cobros y cierre */}
      {showDetalleModal && expedienteActual && (
        <ExpedienteDetalle
          expediente={expedienteActual}
          clientes={clientes}
          user={user}
          onClose={() => {
            setShowDetalleModal(false)
            setTabInicialParaDetalle(null)
          }}
          onUpdate={actualizarExpediente}
          onRefresh={fetchExpedientesData}
          initialTab={tabInicialParaDetalle}
        />
      )}
    </div>
  )
}

export default Expedientes
