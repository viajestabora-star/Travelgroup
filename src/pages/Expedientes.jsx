import React, { useState, useEffect } from 'react'
import { FileText, Plus, Trash2, X, Search, UserPlus, Download, Calendar } from 'lucide-react'
import { storage } from '../utils/storage'
import ExpedienteDetalle from '../components/ExpedienteDetalle'
import { normalizarExpedientes, formatearFechaVisual, parsearFechaADate, extraerAño, convertirEspañolAISO, convertirISOAEspañol } from '../utils/dateNormalizer'
import { getEjercicioActual, subscribeToEjercicioChanges, setEjercicioActual, getAñosDisponibles } from '../utils/ejercicioGlobal'
import { createClient } from '@supabase/supabase-js'

// Cliente de Supabase usando anon_key (publishable key)
// NOTA: Esta key requiere políticas RLS (Row Level Security) configuradas en Supabase
// Si recibes errores 403 o "Permission Denied", verifica las políticas RLS en la tabla
const supabase = createClient(
  'https://gtwyqxfkpdwpakmgrkbu.supabase.co',
  'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'
)

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
      console.error('Error convirtiendo fecha:', fecha, error);
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
    console.error('Error parseando fecha:', fecha, error);
  }
  
  // Si no se puede convertir, intentar usar la función existente
  try {
    const fechaISO = convertirEspañolAISO(fecha);
    if (fechaISO) return fechaISO;
  } catch (error) {
    console.error('Error usando convertirEspañolAISO:', fecha, error);
  }
  
  return '';
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
    console.error(`❌ Error de permisos (RLS) en ${operacion}:`, error);
    return {
      tipo: 'permisos',
      mensaje: `🔒 Error de permisos: No tienes permisos para realizar esta ${operacion}. Verifica las políticas RLS en Supabase.`,
      error: error
    };
  }
  
  // Otros errores
  console.error(`❌ Error en ${operacion}:`, error);
  return {
    tipo: 'otro',
    mensaje: `⚠️ Error en ${operacion}: ${errorMessage}`,
    error: error
  };
}
const ESTADOS = {
  peticion: { label: 'Petición', color: 'bg-yellow-100 text-yellow-800 border-yellow-300', badge: 'bg-yellow-500', cssClass: 'peticion' },
  confirmado: { label: 'Confirmado', color: 'bg-green-100 text-green-800 border-green-300', badge: 'bg-green-500', cssClass: 'confirmado' },
  finalizado: { label: 'Finalizado', color: 'bg-blue-100 text-blue-800 border-blue-300', badge: 'bg-blue-500', cssClass: 'finalizado' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-800 border-red-300', badge: 'bg-red-500', cssClass: 'cancelado' },
}

// ============================================================================
// FUNCIONES DE FECHAS: Usar normalizador centralizado
// ============================================================================
const parsearFecha = parsearFechaADate  // Devuelve Date object para comparaciones
const formatearFecha = formatearFechaVisual  // Devuelve DD/MM/AAAA para mostrar

const Expedientes = () => {
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

  const [expedienteForm, setExpedienteForm] = useState({
    responsable: '',
    destino: '',
    fechaInicio: '',
    fechaFin: '',
    clienteId: '',
    clienteNombre: '',
    telefono: '',
    email: '',
    estado: 'peticion',
    observaciones: '',
    itinerario: '',
  })

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

  // Cargar todos los clientes de Supabase
  const fetchClientesFromSupabase = async () => {
    try {
      const { data, error } = await supabase.from('clientes').select('*')
      if (error) {
        const errorInfo = manejarErrorSupabase(error, 'cargar clientes');
        if (errorInfo) {
          console.error(errorInfo.mensaje);
        } else {
          console.error('Error obteniendo clientes de Supabase:', error);
        }
        return []
      }
      setClientes(Array.isArray(data) ? data : [])
      return data
    } catch (error) {
      console.error('Error fetch clientes supabase:', error)
      return []
    }
  }

  useEffect(() => {
    loadData()
    sincronizarConPlanning()
    fetchClientesFromSupabase()
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

  // Cargar expedientes desde Supabase
  const loadData = async () => {
    try {
      // Lee expedientes de Supabase - traer solo las columnas que existen
      const { data: cloudData, error } = await supabase
        .from('expedientes')
        .select('id_expediente, fecha_inicio, fecha_fin, cliente_nombre, cliente_id, destino, telefono, email, responsable, observaciones, estado')
        .order('id_expediente', { ascending: false })

      if (error) {
        const errorInfo = manejarErrorSupabase(error, 'cargar expedientes');
        if (errorInfo) {
          alert(errorInfo.mensaje);
        } else {
          alert('⚠️ Error cargando expedientes desde la nube. Revisa tu conexión.');
        }
        return;
      }

      // Parsear campos de Supabase
      const expedientesParseados = (cloudData || []).map(exp => {
        // Mapear campos de Supabase a formato interno
        const expedienteParseado = {
          id: exp.id_expediente,
          cliente_id: exp.cliente_id || '',
          clienteId: exp.cliente_id || null, // Para compatibilidad interna
          cliente_nombre: exp.cliente_nombre || '',
          clienteNombre: exp.cliente_nombre || '', // Para compatibilidad interna
          fecha_inicio: exp.fecha_inicio || '',
          fecha_fin: exp.fecha_fin || '',
          fechaInicio: exp.fecha_inicio || '', // Para compatibilidad interna
          fechaFin: exp.fecha_fin || '', // Para compatibilidad interna
          destino: exp.destino || '',
          telefono: exp.telefono || '',
          email: exp.email || '',
          responsable: exp.responsable || '',
          estado: exp.estado || 'peticion',
          observaciones: exp.observaciones || '',
          // Campos por defecto para compatibilidad
          cotizacion: null,
          pasajeros: [],
          cobros: [],
          pagos: [],
          documentos: [],
          cierre: null,
        }
        
        return expedienteParseado
      })

      const expedientesNormalizados = normalizarExpedientes(expedientesParseados)
      setExpedientes(expedientesNormalizados)
      
      // También guardar en localStorage como backup
      if (expedientesParseados && expedientesParseados.length > 0) {
        storage.set('expedientes', expedientesParseados)
      }
      
      // Cargar clientes de Supabase
      fetchClientesFromSupabase()
    } catch (error) {
      console.error('Error cargando datos:', error)
      // Fallback a localStorage si hay error
      const localData = storage.get('expedientes') || []
      setExpedientes(normalizarExpedientes(localData))
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
          responsable: '',
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
        const idExpediente = expediente.id_expediente || expediente.id;
        let totalPaxTexto = expediente.cotizacion?.resultados?.totalPasajeros 
          ? String(expediente.cotizacion.resultados.totalPasajeros) 
          : '';
        
        // Preparar datos para Supabase
        // IMPORTANTE: Las fechas deben estar en formato YYYY-MM-DD para Supabase
        const datosParaSupabase = {
          cliente_id: String(expediente.cliente_id || expediente.clienteId || ''),
          cliente_nombre: String(expediente.cliente_nombre || expediente.clienteNombre || ''),
          fecha_inicio: convertirFechaAISO(expediente.fecha_inicio || expediente.fechaInicio || ''),
          fecha_fin: convertirFechaAISO(expediente.fecha_fin || expediente.fechaFin || ''),
          destino: String(expediente.destino || ''),
          telefono: String(expediente.telefono || ''),
          email: String(expediente.email || ''),
          responsable: String(expediente.responsable || ''),
          estado: String(expediente.estado || 'peticion'),
          observaciones: String(expediente.observaciones || ''),
          itinerario: String(expediente.itinerario || ''),
          total_pax: String(totalPaxTexto)
        };
        
        // Si tiene id_expediente, es un UPDATE (upsert)
        // Si no tiene id_expediente, es un INSERT (el trigger de Supabase generará el ID automáticamente: EXP. YYYY-XXX)
        if (idExpediente) {
          datosParaSupabase.id_expediente = idExpediente;
          const { error } = await supabase
            .from('expedientes')
            .upsert(datosParaSupabase, { onConflict: 'id_expediente' });
          if (error) {
            const errorInfo = manejarErrorSupabase(error, 'sincronizar expediente');
            if (errorInfo) {
              console.error(errorInfo.mensaje);
            } else {
              console.error('Error en sincronización:', error);
            }
          }
        } else {
          // INSERT sin id_expediente - el trigger de Supabase generará el ID automáticamente (formato: EXP. YYYY-XXX)
          const { error } = await supabase
            .from('expedientes')
            .insert([datosParaSupabase]);
          if (error) {
            const errorInfo = manejarErrorSupabase(error, 'insertar expediente');
            if (errorInfo) {
              console.error(errorInfo.mensaje);
            } else {
              console.error('Error en inserción:', error);
            }
          }
        }
      }
      storage.set('expedientes', dataToSave);
      setExpedientes(dataToSave);
    } catch (error) {
      console.error('Error guardando datos:', error);
    }
  }; // CIERRE CORRECTO DE SAVEEXPEDIENTES

  const handleExpedienteSubmit = async (e) => {
    e.preventDefault();
    let finalId = expedienteForm.clienteId ? String(expedienteForm.clienteId) : '';
    let finalNombre = expedienteForm.clienteNombre || clienteInputValue.trim() || 'Sin Nombre';

    // 1. Crear cliente si no existe
    if (!expedienteForm.clienteId && clienteInputValue.trim()) {
      try {
      const { data, error } = await supabase
        .from('clientes')
        .insert([{ nombre: finalNombre, responsable: expedienteForm.responsable || '' }])
        .select().single();
        if (error) {
          const errorInfo = manejarErrorSupabase(error, 'crear cliente');
          if (errorInfo) {
            alert(errorInfo.mensaje);
            return;
          }
          throw error;
        }
        finalId = String(data.id);
        finalNombre = data.nombre;
        await reloadClientes();
      } catch (err) {
        console.error('Error creando cliente previo:', err);
        return;
      }
    }

    // 2. Insertar Expediente con mapeo a cliente_nombre
    try {
      // Validar que cliente_nombre esté presente
      if (!finalNombre || finalNombre.trim() === '') {
        alert('⚠️ El nombre del cliente es obligatorio');
        return;
      }

      // Asegurar que todos los campos obligatorios estén presentes y no sean NULL
      // NOTA: id_expediente NO se incluye porque Supabase lo genera automáticamente mediante trigger (formato: EXP. YYYY-XXX)
      // 
      // CONVERSIÓN DE FECHAS: El usuario ve y edita fechas en formato DD/MM/YYYY (formato visual)
      // Justo antes de enviar a Supabase, convertimos a YYYY-MM-DD (formato requerido por Supabase)
      // Esto corrige el error "date/time field value out of range" sin cambiar la experiencia visual
      const datosInsertar = {
        cliente_id: String(finalId || ''),
        cliente_nombre: String(finalNombre || ''),
        fecha_inicio: convertirFechaAISO(expedienteForm.fechaInicio || ''), // Convierte DD/MM/YYYY → YYYY-MM-DD
        fecha_fin: convertirFechaAISO(expedienteForm.fechaFin || ''), // Convierte DD/MM/YYYY → YYYY-MM-DD
        destino: String(expedienteForm.destino || ''),
        telefono: String(expedienteForm.telefono || ''),
        email: String(expedienteForm.email || ''),
        responsable: String(expedienteForm.responsable || ''),
        estado: String(expedienteForm.estado || 'peticion'),
        observaciones: String(expedienteForm.observaciones || ''),
        itinerario: String(expedienteForm.itinerario || ''),
        total_pax: String('')
      };

      // VERIFICACIÓN EXPLÍCITA: Asegurar que id_expediente NO esté en el objeto
      if ('id_expediente' in datosInsertar) {
        delete datosInsertar.id_expediente;
      }

      // Insertar sin id_expediente - el trigger de Supabase lo generará automáticamente
      const { data, error } = await supabase
        .from('expedientes')
        .insert([datosInsertar])
        .select()
        .single();

      if (error) {
        const errorInfo = manejarErrorSupabase(error, 'crear expediente');
        if (errorInfo) {
          alert(errorInfo.mensaje);
          return;
        }
        throw error;
      }

      // 3. Refrescar la lista completa desde Supabase para mostrar el ID generado por el trigger
      await loadData();
      
      setShowExpedienteModal(false);
      resetExpedienteForm();
      setClienteInputValue('');
      setShowSuggestions(false);
      alert(`✅ Expediente creado con éxito. ID: ${data.id_expediente}`);
    } catch (err) {
      const errorInfo = manejarErrorSupabase(err, 'crear expediente');
      if (errorInfo) {
        alert(errorInfo.mensaje);
      } else {
        console.error('ERROR TÉCNICO:', err);
        alert('⚠️ No se pudo guardar. Revisa la consola.');
      }
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
      gratuidades: ''
    }

    try {
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

      // Actualiza el estado
      await reloadClientes()
      setExpedienteForm({
        ...expedienteForm,
        clienteId: data.id,
        clienteNombre: data.nombre,
        responsable: data.responsable || ''
      })
      setClienteInputValue(data.nombre)
      setShowClienteModal(false)
      resetClienteForm()
    } catch (err) {
      alert('⚠️ Error creando cliente en la base de datos. Revisa tu conexión y los campos.')
      // Opcional: setShowClienteModal(false)
    }
  }

  const handleDeleteExpediente = async (id) => {
    const expediente = expedientes.find(exp => exp.id === id)
    const nombreExpediente = expediente?.responsable || expediente?.destino || 'este expediente'
    const destino = expediente?.destino ? ` - ${expediente.destino}` : ''
    if (window.confirm(`¿Está seguro de que desea eliminar el expediente "${nombreExpediente}${destino}"?\n\nEsta acción no se puede deshacer.`)) {
      try {
        // Eliminar de Supabase
        const { error } = await supabase
          .from('expedientes')
          .delete()
          .eq('id_expediente', id)
        
        if (error) {
          const errorInfo = manejarErrorSupabase(error, 'eliminar expediente');
          if (errorInfo) {
            alert(errorInfo.mensaje);
            return;
          }
          throw error;
        }
        
        // Actualizar estado local
        const nuevosExpedientes = expedientes.filter(exp => exp.id !== id)
        setExpedientes(nuevosExpedientes)
        storage.set('expedientes', nuevosExpedientes)
        alert('✅ Expediente eliminado correctamente')
      } catch (err) {
        console.error('Error eliminando expediente:', err)
        alert('⚠️ Error eliminando expediente. Revisa tu conexión.')
      }
    }
  }

  const actualizarExpediente = async (expedienteActualizado) => {
    try {
      // Extraer total_pax de la cotización como texto
      let totalPaxTexto = ''
      if (expedienteActualizado.cotizacion && expedienteActualizado.cotizacion.resultados && expedienteActualizado.cotizacion.resultados.totalPasajeros !== undefined) {
        totalPaxTexto = String(expedienteActualizado.cotizacion.resultados.totalPasajeros)
      }
      
      const idExpediente = expedienteActualizado.id_expediente || expedienteActualizado.id;
      if (!idExpediente) {
        throw new Error('id_expediente es requerido para actualizar');
      }
      
      // Objeto exacto para Supabase - Asegurar que todos los campos obligatorios estén presentes y no sean NULL
      // IMPORTANTE: Las fechas deben estar en formato YYYY-MM-DD para Supabase
      const expedienteActualizadoParaSupabase = {
        cliente_id: String(expedienteActualizado.cliente_id || expedienteActualizado.clienteId || ''),
        cliente_nombre: String(expedienteActualizado.cliente_nombre || expedienteActualizado.clienteNombre || ''),
        fecha_inicio: convertirFechaAISO(expedienteActualizado.fecha_inicio || expedienteActualizado.fechaInicio || ''),
        fecha_fin: convertirFechaAISO(expedienteActualizado.fecha_fin || expedienteActualizado.fechaFin || ''),
        destino: String(expedienteActualizado.destino || ''),
        telefono: String(expedienteActualizado.telefono || ''),
        email: String(expedienteActualizado.email || ''),
        responsable: String(expedienteActualizado.responsable || ''),
        estado: String(expedienteActualizado.estado || 'peticion'),
        observaciones: String(expedienteActualizado.observaciones || ''),
        itinerario: String(expedienteActualizado.itinerario || ''),
        total_pax: String(totalPaxTexto),
        // NUEVO: Guardar cotización completa como JSON
        cotizacion: expedienteActualizado.cotizacion ? JSON.stringify(expedienteActualizado.cotizacion) : null,
      }
      
      const { error } = await supabase
        .from('expedientes')
        .update(expedienteActualizadoParaSupabase)
        .eq('id_expediente', idExpediente)
      
      if (error) {
        const errorInfo = manejarErrorSupabase(error, 'actualizar expediente');
        if (errorInfo) {
          alert(errorInfo.mensaje);
          return;
        }
        throw error;
      }
      
      // Actualizar estado local
      const updated = expedientes.map(exp =>
        exp.id === expedienteActualizado.id ? expedienteActualizado : exp
      )
      setExpedientes(updated)
      storage.set('expedientes', updated)
    } catch (err) {
      console.error('Error actualizando expediente:', err)
      alert('⚠️ Error actualizando expediente. Revisa tu conexión.')
    }
  }

  const cambiarEstado = async (id, nuevoEstado) => {
    try {
      // Actualizar en Supabase
      const { error } = await supabase
        .from('expedientes')
        .update({ estado: nuevoEstado })
        .eq('id_expediente', id)
      
      if (error) {
        const errorInfo = manejarErrorSupabase(error, 'cambiar estado');
        if (errorInfo) {
          alert(errorInfo.mensaje);
          return;
        }
        throw error;
      }
      
      // Actualizar estado local
      const updated = expedientes.map(exp =>
        exp.id === id ? { ...exp, estado: nuevoEstado } : exp
      )
      setExpedientes(updated)
      storage.set('expedientes', updated)
      
      const expediente = updated.find(exp => exp.id === id)
      if (expediente && expediente.planningId) {
        const planning = storage.getPlanning()
        const updatedPlanning = planning.map(p =>
          p.id === expediente.planningId
            ? { ...p, estado: nuevoEstado }
            : p
        )
        storage.setPlanning(updatedPlanning)
      }
    } catch (err) {
      console.error('Error cambiando estado:', err)
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
  const seleccionarCliente = (cliente) => {
    // Autorellena TODOS los campos disponibles del formulario expediente
    setExpedienteForm({
      ...expedienteForm,
      clienteId: cliente.id,
      clienteNombre: cliente.nombre,
      responsable: cliente.responsable || '',
      telefono: cliente.telefono || cliente.movil || '',
      email: cliente.email || ''
    })
    setClienteInputValue(cliente.nombre)
    setShowSuggestions(false)
  }

  // El buscador solo manipula el value buscado y activa sugerencias
  const handleClienteInputChange = (value) => {
    setClienteInputValue(value)
    setShowSuggestions(true)
    if (!value) {
      setExpedienteForm({
        ...expedienteForm,
        clienteId: '',
        clienteNombre: ''
      })
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
      clienteId: '',
      clienteNombre: '',
      telefono: '',
      email: '',
      estado: 'peticion',
      observaciones: '',
      itinerario: '',
    })
    setClienteInputValue('')
    setShowSuggestions(false)
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
      console.error('Error obteniendo cliente:', error)
      return 'Pendiente'
    }
  }

  const exportarTrimestre = () => {
    const expedientesFiltrados = expedientes.filter(exp => {
      const fechaInicio = exp.fecha_inicio || exp.fechaInicio
      if (!fechaInicio) return false
      const fechaISO = parsearFecha(fechaInicio)
      if (!fechaISO) return false
      const fecha = new Date(fechaISO + 'T00:00:00')
      if (isNaN(fecha.getTime())) return false
      const mes = fecha.getMonth() + 1
      switch(trimestreExport) {
        case 'Q1': return mes >= 1 && mes <= 3
        case 'Q2': return mes >= 4 && mes <= 6
        case 'Q3': return mes >= 7 && mes <= 9
        case 'Q4': return mes >= 10 && mes <= 12
        default: return false
      }
    })

    let html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Expedientes ${trimestreExport} - Viajes Tabora</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; padding: 40px; background: white; }
            .header { margin-bottom: 30px; border-bottom: 3px solid #1e3a5f; padding-bottom: 20px; }
            h1 { color: #1e3a5f; margin: 0 0 5px 0; font-size: 32px; }
            h2 { color: #666; font-weight: normal; margin: 5px 0; font-size: 16px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            th { background: #1e3a5f; color: white; padding: 14px 12px; text-align: left; font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
            td { padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
            tr:hover { background: #f9fafb; }
            tr:last-child td { border-bottom: none; }
            .estado { padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block; }
            .peticion { background: #fef3c7; color: #92400e; border: 1px solid #fde047; }
            .confirmado { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
            .finalizado { background: #dbeafe; color: #1e3a8a; border: 1px solid #93c5fd; }
            .cancelado { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
            .footer { margin-top: 60px; padding-top: 20px; border-top: 2px solid #e5e7eb; font-size: 13px; color: #6b7280; }
            .footer strong { color: #1e3a5f; font-size: 14px; }
            .beneficio-positivo { color: #065f46; font-weight: 600; }
            .beneficio-negativo { color: #991b1b; font-weight: 600; }
            @media print { body { padding: 20px; } .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Viajes Tabora - Listado de Expedientes ${trimestreExport}</h1>
            <h2>Generado el ${new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h2>
          </div>
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Destino</th>
                <th>Fecha Viaje</th>
                <th>Estado</th>
                <th style="text-align: right;">Beneficio Neto</th>
              </tr>
            </thead>
            <tbody>
    `

    expedientesFiltrados.forEach(exp => {
      const cliente = clientes.find(c => String(c.id) === String(exp.cliente_id || exp.clienteId))
      const beneficio = exp.cotizacion?.resultados?.beneficioNeto || 0
      const beneficioClass = beneficio >= 0 ? 'beneficio-positivo' : 'beneficio-negativo'

      html += `
        <tr>
          <td>-</td>
          <td><strong>${cliente?.nombre || exp.cliente_nombre || '-'}</strong></td>
          <td>${exp.destino || '-'}</td>
          <td>${exp.fecha_inicio || exp.fechaInicio ? formatearFecha(exp.fecha_inicio || exp.fechaInicio) : '-'}</td>
          <td>${exp.fecha_fin || exp.fechaFin ? formatearFecha(exp.fecha_fin || exp.fechaFin) : '-'}</td>
          <td><span class="estado ${ESTADOS[exp.estado].cssClass}">${ESTADOS[exp.estado].label}</span></td>
          <td style="text-align: right;" class="${beneficioClass}">${beneficio.toFixed(2)}€</td>
        </tr>
      `
    })

    const totalBeneficio = expedientesFiltrados.reduce((sum, exp) => sum + (exp.cotizacion?.resultados?.beneficioNeto || 0), 0)

    html += `
            </tbody>
            <tfoot>
              <tr style="background: #f3f4f6; font-weight: bold;">
                <td colspan="6" style="text-align: right; padding: 14px;">TOTAL BENEFICIO NETO:</td>
                <td style="text-align: right; padding: 14px; color: ${totalBeneficio >= 0 ? '#065f46' : '#991b1b'}; font-size: 16px;">
                  ${totalBeneficio.toFixed(2)}€
                </td>
              </tr>
            </tfoot>
          </table>
          <div class="footer">
            <p><strong>Viajes Tabora - Valservice Incoming S.L</strong></p>
            <p>CIF: B98998107 | Apartado de correos 58, La Pobla de Vallbona - Valencia</p>
            <p>Tel: +34 96 339 04 64 | Email: info@taboratours.com</p>
            <p style="margin-top: 10px; font-size: 11px;">
              Este documento contiene ${expedientesFiltrados.length} expediente(s) del ${trimestreExport} de ${new Date().getFullYear()}
            </p>
          </div>
          <div class="no-print" style="margin-top: 30px; text-align: center;">
            <button onclick="window.print()" style="background: #1e3a5f; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
              Imprimir / Guardar PDF
            </button>
          </div>
        </body>
      </html>
    `

    const ventana = window.open('', '_blank')
    ventana.document.write(html)
    ventana.document.close()
    setShowExportModal(false)
  }

  // Filtrar expedientes por ejercicio y búsqueda
  const expedientesFiltradosPorEjercicio = expedientes.filter(exp => {
    // Filtro por ejercicio
    const fechaInicio = exp.fecha_inicio || exp.fechaInicio
    if (!fechaInicio) return false
    const añoExpediente = extraerAño(fechaInicio)
    if (añoExpediente !== ejercicioActual) return false
    
    // Filtro por búsqueda
    if (!searchTermExpedientes.trim()) return true
    
    const term = searchTermExpedientes.toLowerCase()
    const cliente = clientes.find(c => String(c.id) === String(exp.cliente_id || exp.clienteId))
    const nombreCliente = cliente?.nombre || exp.cliente_nombre || ''
    const destino = exp.destino || ''
    
    return (
      nombreCliente.toLowerCase().includes(term) ||
      destino.toLowerCase().includes(term) ||
      exp.observaciones?.toLowerCase().includes(term)
    )
  })

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
                setEjercicioActual(nuevoEjercicio) // Actualizar estado local
                setEjercicioActual(nuevoEjercicio) // Guardar en localStorage y disparar evento global
              }}
              className="px-3 py-2 border-2 border-navy-300 rounded-lg bg-white text-navy-900 font-semibold focus:outline-none focus:ring-2 focus:ring-navy-500"
              style={{ backgroundColor: 'white', color: '#0f172a' }}
            >
              {getAñosDisponibles().map(año => (
                <option key={año} value={año}>{año}</option>
              ))}
            </select>
          </div>
          <button onClick={() => setShowExportModal(true)} className="btn-secondary flex items-center gap-2">
            <Download size={20} />
            Exportar Trimestre
          </button>
          <button onClick={() => setShowExpedienteModal(true)} className="btn-primary flex items-center gap-2">
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
          />
        </div>
      </div>

      {/* ==================== CONTADOR DE EXPEDIENTES ==================== */}
      <div className="mb-6 p-4 bg-gradient-to-r from-navy-50 to-blue-50 rounded-xl border border-navy-200">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Calendar className="text-navy-600" size={24} />
            <div>
              <p className="text-sm font-medium text-gray-700">Ejercicio {ejercicioActual}</p>
              <p className="text-xs text-gray-500">
                {searchTermExpedientes 
                  ? `Buscando: "${searchTermExpedientes}" - ${expedientesFiltradosPorEjercicio.length} resultado${expedientesFiltradosPorEjercicio.length !== 1 ? 's' : ''}`
                  : `Vista de expedientes del año seleccionado`
                }
              </p>
            </div>
          </div>
          <div className="px-4 py-2 bg-navy-600 text-white rounded-lg font-bold">
            {expedientesFiltradosPorEjercicio.length} expediente{expedientesFiltradosPorEjercicio.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Object.entries(ESTADOS).map(([key, estado]) => {
          const count = expedientesFiltradosPorEjercicio.filter(exp => exp.estado === key).length
          return (
            <div key={key} className={`card border-2 ${estado.color}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{estado.label}</p>
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
          <h3 className="text-xl font-bold text-gray-700 mb-2">No hay expedientes en {ejercicioActual}</h3>
          <p className="text-gray-600 mb-6">
            {expedientes.length === 0
              ? 'Crea tu primer expediente'
              : `Cambia el ejercicio arriba o crea un nuevo expediente para ${ejercicioActual}`
            }
          </p>
          <button onClick={() => setShowExpedienteModal(true)} className="btn-primary inline-flex items-center gap-2">
            <Plus size={20} />
            Nuevo Expediente
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {expedientesFiltradosPorEjercicio
            .slice()
            .sort((a, b) => {
              try {
                const esFinalizadoA = a.estado === 'finalizado' || a.estado === 'cancelado'
                const esFinalizadoB = b.estado === 'finalizado' || b.estado === 'cancelado'
                if (esFinalizadoA && !esFinalizadoB) return 1
                if (!esFinalizadoA && esFinalizadoB) return -1
                const fechaInicioA = a.fecha_inicio || a.fechaInicio
                const fechaInicioB = b.fecha_inicio || b.fechaInicio
                const fechaObjA = parsearFecha(fechaInicioA)
                const fechaObjB = parsearFecha(fechaInicioB)
                if (!fechaObjA) return 1
                if (!fechaObjB) return -1
                return fechaObjA - fechaObjB
              } catch (error) {
                return 0
              }
            })
            .map(expediente => {
              try {
                if (!expediente || !expediente.id) return null
                const estado = ESTADOS[expediente.estado || 'peticion'] || ESTADOS.peticion
                const cliente = clientes.find(c => String(c.id) === String(expediente.cliente_id || expediente.clienteId)) || {}
                const nombreGrupo = expediente.cliente_nombre || cliente.nombre || 'GRUPO SIN NOMBRE'
                const destino = expediente.destino || 'Sin destino'
                const fechaInicio = expediente.fecha_inicio || expediente.fechaInicio || ''
                const fechaFin = expediente.fecha_fin || expediente.fechaFin || ''

                return (
                  <div key={expediente?.id || Math.random()} className={`card border-l-4 ${estado.badge.replace('bg-', 'border-')} hover:shadow-xl transition-shadow cursor-pointer`}
                       onClick={() => abrirDetalle(expediente)}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${estado.color}`}>
                            {estado.label}
                          </span>
                        </div>
                        <h2 className="text-2xl font-black text-navy-900 uppercase tracking-wide mb-1">
                          {nombreGrupo}
                        </h2>
                        <p className="text-base text-navy-600 font-medium">{destino}</p>
                    </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteExpediente(expediente?.id)
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
                    </div>
                    <div className="flex gap-2 mt-3">
                      {Object.entries(ESTADOS).map(([key, est]) => (
                        <button
                          key={key}
                          onClick={(e) => {
                            e.stopPropagation()
                            cambiarEstado(expediente?.id, key)
                          }}
                          className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                            expediente?.estado === key ? est.color : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                          title={est.label}
                        >
                          {est.label.charAt(0)}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              } catch (error) {
                return (
                  <div key={expediente?.id || Math.random()} className="card border-l-4 border-red-500 bg-red-50">
                    <div className="p-4">
                      <p className="text-red-800 font-bold">⚠️ Error en expediente</p>
                      <p className="text-red-600 text-sm mt-1">
                        {expediente?.destino || expediente?.cliente_nombre || 'Expediente con datos incompletos'}
                      </p>
                      <button
                        onClick={() => handleDeleteExpediente(expediente?.id)}
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
            <form onSubmit={handleExpedienteSubmit} className="p-6" style={{ backgroundColor: 'white', color: 'black' }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        clientesFiltrados.map(cliente => (
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
                    {Object.entries(ESTADOS).map(([key, estado]) => (
                      <option key={key} value={key}>{estado.label}</option>
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
                <button type="submit" className="btn-primary flex-1">
                  Crear Expediente
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

      {showDetalleModal && expedienteActual && (
        <ExpedienteDetalle
          expediente={expedienteActual}
          clientes={clientes}
          onClose={() => setShowDetalleModal(false)}
          onUpdate={actualizarExpediente}
        />
      )}
    </div>
  )
}

export default Expedientes
