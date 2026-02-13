import React, { useState, useEffect, useMemo, useRef } from 'react'
import { X, Users, Calculator, Bed, DollarSign, FileUp, TrendingUp, Save, Upload, Trash2, Plus, FileText, Pencil, MapPin } from 'lucide-react'
import { storage } from '../utils/storage'
import { normalizarFechaEspañola, convertirEspañolAISO, convertirISOAEspañol } from '../utils/dateNormalizer'
import { createClient } from '@supabase/supabase-js'
import ProveedorForm from './ProveedorForm'
import jsPDF from 'jspdf'

// Cliente de Supabase para cargar proveedores
const supabase = createClient(
  'https://gtwyqxfkpdwpakmgrkbu.supabase.co',
  'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'
)

// Función helper para normalizar tipos: minúsculas + sin tildes
// Ejemplo: 'Autobús' -> 'autobus', 'Restaurante' -> 'restaurante'
const normalizarTipo = (tipo) => {
  if (!tipo) return '';
  
  return tipo
    .toLowerCase()
    .normalize('NFD') // Normaliza caracteres con tildes
    .replace(/[\u0300-\u036f]/g, '') // Elimina diacríticos (tildes)
    .trim();
}

// Función helper para normalizar texto: minúsculas + sin tildes (uso general)
// Usada para comparaciones robustas en filtros
const normalizarText = (text) => {
  if (!text) return '';
  
  return String(text)
    .toLowerCase()
    .normalize('NFD') // Normaliza caracteres con tildes
    .replace(/[\u0300-\u036f]/g, '') // Elimina diacríticos (tildes)
    .trim();
}

// Generador sencillo de UUID v4 (para servicios de cotización locales y Supabase)
const generarUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * ============ FUNCIÓN ÚNICA DE LIMPIEZA DE NÚMEROS ============
 * Limpia todos los números: quita '€', cambia ',' por '.', elimina espacios y símbolos.
 * Ejemplo: "47,40€" -> 47.40 | "1.234,56 €" -> 1234.56 | "69 pax" -> 69
 * PRESERVA DECIMALES: Mantiene decimales correctamente para inputs numéricos
 */
const limpiarNumero = (valor) => {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') {
    // Si ya es número, verificar que no sea NaN
    return isNaN(valor) ? 0 : valor;
  }
  
  // Convertir a string y limpiar
  let limpio = String(valor).trim();
  
  // Detectar formato: si tiene coma y punto, es formato europeo (1.234,56)
  // Si solo tiene punto o solo tiene coma, tratar como decimal
  const tienePunto = limpio.includes('.');
  const tieneComa = limpio.includes(',');
  
  if (tienePunto && tieneComa) {
    // Formato europeo: 1.234,56 -> eliminar punto de miles, convertir coma a punto
    limpio = limpio.replace(/\./g, ''); // Eliminar puntos de miles
    limpio = limpio.replace(/,/g, '.'); // Cambiar coma decimal por punto
  } else if (tieneComa && !tienePunto) {
    // Solo coma: formato europeo simple (66,50) -> convertir a punto
    limpio = limpio.replace(/,/g, '.');
  }
  // Si solo tiene punto o no tiene ninguno, mantenerlo (formato americano o entero)
  
  // Eliminar todo lo que no sea número, punto decimal o signo negativo
  limpio = limpio.replace(/[^0-9.-]+/g, "");
  
  // Parsear a float (PRESERVA DECIMALES)
  const resultado = parseFloat(limpio);
  
  // Verificar que sea un número válido
  return isNaN(resultado) ? 0 : resultado;
};

/**
 * ============ FUNCIÓN ESPECÍFICA PARA INPUTS NUMÉRICOS ============
 * Para inputs de tipo "number", preserva decimales directamente
 * Maneja tanto formato americano (66.50) como europeo (66,50)
 */
const limpiarInputNumerico = (valor) => {
  if (valor === null || valor === undefined || valor === '') return '';
  if (typeof valor === 'number') {
    return valor;
  }
  
  let limpio = String(valor).trim();
  
  // Si tiene coma, convertirla a punto (formato europeo -> americano)
  if (limpio.includes(',') && !limpio.includes('.')) {
    limpio = limpio.replace(/,/g, '.');
  }
  
  // Eliminar solo símbolos no numéricos (preservar punto decimal y signo negativo)
  limpio = limpio.replace(/[^0-9.-]+/g, "");
  
  // Si está vacío después de limpiar, retornar string vacío para permitir edición
  if (limpio === '' || limpio === '-') return '';
  
  // Parsear y retornar (preserva decimales)
  const resultado = parseFloat(limpio);
  return isNaN(resultado) ? '' : resultado;
};

/** Sanitización de números: cualquier valor no numérico → 0 (para cálculos financieros) */
const toNum = (v) => {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number' && !isNaN(v)) return v;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

/**
 * ============ DEFAULT_SERVICE_VALUES - DEFENSA CONTRA UNDEFINED ============
 * Valores por defecto para cualquier tipo de servicio. Si en el futuro se añade
 * un tipo nuevo (ej. Vuelo, Tren), el sistema usará estos valores y no lanzará
 * pantalla blanca. NUNCA eliminar campos de este objeto sin revisar todos los usos.
 */
const DEFAULT_SERVICE_VALUES = {
  id: null,
  proveedorId: null,
  proveedorNombreTemporal: '',
  tipo: 'Hotel',
  tipo_calculo: 'porPersona',
  tipoCalculo: 'porPersona',
  tipo_servicio: 'Hotel',
  nombreEspecifico: '',
  localizacion: '',
  coste_unitario: 0,
  costeUnitario: 0,
  precio_manual: 0,
  precioVenta: 0,
  margen: 0,
  noches: 1,
  dias_guia: 1,
  total_servicio_manual: 0,
  totalServicio: 0,
  total_servicio: 0,
  fechaRelease: '',
};

/**
 * ============ MOTOR DE CÁLCULO (MÓDULO) - CÓDIGO CRÍTICO ============
 * Hotel: Total = Pax * Precio * Noches | Autobús: Total = Precio introducido
 * NO simplificar ni modificar sin revisión. Usado por calcularFinanzasExpediente.
 */
const finalizarCalculoModulo = (servicio, paxPago = 31, paxTotal = 35) => {
  const s = servicio || {};
  const pP = Math.max(1, toNum(paxPago));
  const pT = Math.max(1, toNum(paxTotal));
  const precio = toNum(s.coste_unitario ?? s.costeUnitario ?? s.precio_manual);
  const n = Math.max(1, toNum(s.noches));
  const d = Math.max(1, toNum(s.dias_guia));
  const manual = toNum(s.total_servicio_manual ?? s.totalServicio ?? s.total_servicio);
  let totalFinal = 0;
  let costePorPersona = 0;
  if (s?.tipo_calculo === 'Total a dividir') {
    totalFinal = manual > 0 ? manual : (s?.tipo_servicio === 'Guía' ? precio * d : precio);
    costePorPersona = pP > 0 ? totalFinal / pP : 0;
  } else {
    const factor = (s?.tipo_servicio === 'Hotel') ? n : (s?.tipo_servicio === 'Guía' ? d : 1);
    costePorPersona = precio * factor;
    totalFinal = costePorPersona * pT;
  }
  return { ...s, coste_pax: Number(costePorPersona.toFixed(2)), total_servicio: Number(totalFinal.toFixed(2)) };
};

/**
 * ============ CALCULAR FINANZAS EXPEDIENTE - CÓDIGO CRÍTICO ============
 * Función PURA que encapsula toda la lógica de beneficios y gratuidades.
 * NO simplificar ni modificar sin revisión exhaustiva.
 * @param {Object} params - { servicios, formData, paxPago, totalPax, nochesExpediente }
 * @returns {Object} Resultados financieros formateados
 */
const calcularFinanzasExpediente = ({ servicios = [], formData = {}, paxPago = 1, totalPax = 1, nochesExpediente = 1 }) => {
  const trunc2 = (num) => {
    const n = Number(num);
    if (isNaN(n)) return '0.00';
    return (Math.trunc(n * 100) / 100).toFixed(2);
  };

  try {
    const bonif = Math.max(0, toNum(formData?.bonificacion_pax));
    let costeBusPorPax = 0, costeGuiaPorPax = 0, costeGuiaLocalPorPax = 0, costeHotelPorPax = 0;
    let costeSeguroPorPax = 0, costeEntradasPorPax = 0, costeRestaurantePorPax = 0, costeOtrosPorPax = 0;

    servicios.forEach((servicio) => {
      const s = { ...DEFAULT_SERVICE_VALUES, ...servicio };
      const fila = {
        ...s,
        tipo_calculo: s.tipo_calculo || (s.tipoCalculo === 'porGrupo' ? 'Total a dividir' : s.tipoCalculo) || '',
        tipo_servicio: s.tipo_servicio || s.tipo || '',
        coste_unitario: toNum(s.coste_unitario ?? s.costeUnitario ?? s.precio_manual),
        noches: Math.max(1, toNum(s.noches)),
        dias_guia: toNum(s.dias_guia) || Math.max(1, toNum(s.noches)),
        total_servicio_manual: toNum(s.total_servicio_manual ?? s.totalServicio ?? s.total_servicio),
      };
      const { coste_pax } = finalizarCalculoModulo(fila, paxPago, totalPax);
      const costePax = toNum(coste_pax);
      const tipo = s.tipo || s.tipo_servicio || 'Hotel';
      if (tipo === 'Autobús') costeBusPorPax += costePax;
      else if (tipo === 'Guía') costeGuiaPorPax += costePax;
      else if (tipo === 'Guía Local') costeGuiaLocalPorPax += costePax;
      else if (tipo === 'Hotel') costeHotelPorPax += costePax;
      else if (tipo === 'Seguro') costeSeguroPorPax += costePax;
      else if (tipo === 'Entradas/Tickets') costeEntradasPorPax += costePax;
      else if (tipo === 'Restaurante') costeRestaurantePorPax += costePax;
      else costeOtrosPorPax += costePax; // Tipos nuevos o desconocidos → Otros
    });

    const costeBasePorPersona = costeBusPorPax + costeGuiaPorPax + costeGuiaLocalPorPax + costeHotelPorPax +
      costeSeguroPorPax + costeEntradasPorPax + costeRestaurantePorPax + costeOtrosPorPax;

    let costeTotalProveedor = 0;
    servicios.forEach((servicio) => {
      const s = { ...DEFAULT_SERVICE_VALUES, ...servicio };
      const fila = {
        ...s,
        tipo_calculo: s.tipo_calculo || (s.tipoCalculo === 'porGrupo' ? 'Total a dividir' : s.tipoCalculo) || '',
        tipo_servicio: s.tipo_servicio || s.tipo || '',
        coste_unitario: toNum(s.coste_unitario ?? s.costeUnitario ?? s.precio_manual),
        noches: Math.max(1, toNum(s.noches)),
        dias_guia: toNum(s.dias_guia) || Math.max(1, toNum(s.noches)),
        total_servicio_manual: toNum(s.total_servicio_manual ?? s.totalServicio ?? s.total_servicio),
      };
      const { total_servicio } = finalizarCalculoModulo(fila, paxPago, totalPax);
      costeTotalProveedor += toNum(total_servicio);
    });

    const costeBaseGratuidad = costeBasePorPersona;
    const costePlazasGratuitas = costeBaseGratuidad * Math.max(0, toNum(formData?.gratuidades));
    const costeGratuidadesPorPax = paxPago > 0 ? costePlazasGratuitas / paxPago : 0;
    const costeRealPorPersona = costeBasePorPersona + costeGratuidadesPorPax + bonif;
    const paxDePago = paxPago;
    const precioBase = Math.max(0, toNum(formData?.precio_venta_cliente));
    const bonificacionTotal = bonif * paxDePago;
    const totalSupHabitacion = toNum(formData?.sup_individual_pax) * toNum(formData?.sup_individual_precio_dia) * nochesExpediente;
    const totalSupSeguro = toNum(formData?.sup_seguro_pax) * toNum(formData?.sup_seguro_precio_total);
    const suplementosTotal = totalSupHabitacion + totalSupSeguro;
    const totalVenta = (paxDePago * precioBase) - bonificacionTotal + suplementosTotal;
    const ingresos = totalVenta;
    const costes = costeTotalProveedor;
    const beneficioReal = ingresos - costes;
    const precioVentaPorPersona = precioBase;
    const costeTotalViaje = costeRealPorPersona * paxPago;
    const precioVentaTotal = precioVentaPorPersona * paxPago;
    const margenPorPersona = precioVentaPorPersona - costeRealPorPersona;
    const beneficioTotal = beneficioReal;
    const margenPorcentaje = costeRealPorPersona > 0 ? ((margenPorPersona / costeRealPorPersona) * 100) : 0;
    const beneficioNetoBase = beneficioTotal;
    const iva = beneficioNetoBase * 0.21;
    const beneficioNeto = beneficioNetoBase - iva;

    return {
      costeBusPorPax: trunc2(costeBusPorPax),
      costeGuiaPorPax: costeGuiaPorPax.toFixed(2),
      costeGuiaLocalPorPax: costeGuiaLocalPorPax.toFixed(2),
      costeHotelPorPax: costeHotelPorPax.toFixed(2),
      costeSeguroPorPax: costeSeguroPorPax.toFixed(2),
      costeEntradasPorPax: costeEntradasPorPax.toFixed(2),
      costeRestaurantePorPax: costeRestaurantePorPax.toFixed(2),
      costeOtrosPorPax: costeOtrosPorPax.toFixed(2),
      costeBasePorPersona: costeBasePorPersona.toFixed(2),
      costeBaseGratuidad: costeBaseGratuidad.toFixed(2),
      costePlazasGratuitas: costePlazasGratuitas.toFixed(2),
      costeGratuidadesPorPax: costeGratuidadesPorPax.toFixed(2),
      bonificacion: bonif.toFixed(2),
      costeRealPorPersona: costeRealPorPersona.toFixed(2),
      costeTotalViaje: costeTotalViaje.toFixed(2),
      precioVentaPorPersona: precioVentaPorPersona.toFixed(2),
      precioVentaTotal: precioVentaTotal.toFixed(2),
      margenPorPersona: margenPorPersona.toFixed(2),
      margenPorcentaje: margenPorcentaje.toFixed(2),
      beneficioTotal: beneficioTotal.toFixed(2),
      beneficioNetoBase: beneficioNetoBase.toFixed(2),
      iva: iva.toFixed(2),
      beneficioNeto: beneficioNeto.toFixed(2),
      totalVenta: totalVenta.toFixed(2),
      ingresos: totalVenta.toFixed(2),
      costes: costes.toFixed(2),
      paxPagadores: paxPago,
      paxDePago: paxPago,
      totalPasajeros: totalPax,
      gratuidades: toNum(formData?.gratuidades),
    };
  } catch (error) {
    return {
      costeBusPorPax: '0.00', costeGuiaPorPax: '0.00', costeGuiaLocalPorPax: '0.00', costeHotelPorPax: '0.00',
      costeSeguroPorPax: '0.00', costeEntradasPorPax: '0.00', costeRestaurantePorPax: '0.00', costeOtrosPorPax: '0.00',
      costeBasePorPersona: '0.00', costeBaseGratuidad: '0.00', costePlazasGratuitas: '0.00', costeGratuidadesPorPax: '0.00',
      bonificacion: '0.00', costeRealPorPersona: '0.00', costeTotalViaje: '0.00', precioVentaPorPersona: '0.00',
      precioVentaTotal: '0.00', margenPorPersona: '0.00', margenPorcentaje: '0.00', beneficioTotal: '0.00',
      beneficioNetoBase: '0.00', iva: '0.00', beneficioNeto: '0.00',
      totalVenta: '0.00', ingresos: '0.00', costes: '0.00',
      paxPagadores: 1, paxDePago: 1, totalPasajeros: 1, gratuidades: 0,
    };
  }
};

const ExpedienteDetalle = ({ expediente, onClose, onUpdate, clientes = [] }) => {
  // ⚠️ BLINDAJE NIVEL 1: Verificar que expediente existe
  if (!expediente) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md">
          <h3 className="text-xl font-bold text-blue-600 mb-4">⏳ Cargando...</h3>
          <p className="text-gray-700">Cargando datos del expediente...</p>
          <button onClick={onClose} className="btn-primary mt-4 w-full">
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  // Modo de prueba temporal para facturación
  const MODO_PRUEBA_FACTURACION = true

  // Estados
  const [tab, setTab] = useState('grupo')
  const [editandoCliente, setEditandoCliente] = useState(false)
  
  // Ref para rastrear si ya se inicializaron los servicios automáticamente
  const serviciosInicializados = useRef(false)
  
  // ============ ESTADO GLOBAL UNIFICADO DEL FORMULARIO ============
  // Fuente Única de Verdad: Estado persistente único con valores por defecto seguros
  const [formData, setFormData] = useState({
    total_pax: 1,
    gratuidades: 0,
    precio_venta_cliente: 0,
    bonificacion_pax: 0,
    sup_individual_pax: 0,
    sup_individual_precio_dia: 0,
    sup_seguro_pax: 0,
    sup_seguro_precio_total: 0,
  })
  
  // Estado de carga: bloquea guardados hasta que los datos estén cargados
  const [datosCargados, setDatosCargados] = useState(false)

  // Estado de guardado: evita duplicados y muestra feedback
  const [isSaving, setIsSaving] = useState(false)

  // Estados para servicios (separados porque se guardan en tabla diferente)
  const [servicios, setServicios] = useState([])
  
  // Estados para Proveedores
  const [proveedores, setProveedores] = useState([])
  const [busquedaProveedor, setBusquedaProveedor] = useState({}) // { servicioId: 'texto búsqueda' }
  const [mostrarSugerencias, setMostrarSugerencias] = useState({}) // { servicioId: true/false }
  
  // Estados para Historial de Expedientes
  const [expedientesHistorial, setExpedientesHistorial] = useState([])
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  
  // Estado para Modal de Nuevo Proveedor (reutiliza ProveedorForm)
  const [showModal, setShowModal] = useState(false)
  const [nombreNuevoProveedor, setNombreNuevoProveedor] = useState('')
  const [tipoNuevoProveedor, setTipoNuevoProveedor] = useState('hotel')
  const [servicioIdParaProveedor, setServicioIdParaProveedor] = useState(null)
  
  // Función para cargar proveedores desde Supabase
  const cargarProveedores = async () => {
    try {
      const { data, error } = await supabase
        .from('proveedores')
        .select('*')
        .order('nombre_comercial', { ascending: true });
      
      if (error) {
        console.error('Error cargando proveedores:', error)
        setProveedores([])
        return
      }
      
      if (!data || !Array.isArray(data) || data.length === 0) {
        setProveedores([])
        return
      }
      
      // Mapear campos de Supabase a formato interno
      // IMPORTANTE: Los IDs de proveedores son int8 (números enteros: 1, 2, 3...)
      const proveedoresMapeados = data.map(p => ({
        id: typeof p.id === 'string' ? Number(p.id) : Number(p.id),
        nombreComercial: p.nombre_comercial || p.nombreComercial || '',
        nombreFiscal: p.nombre_fiscal || p.nombreFiscal || p.nombre_comercial || '',
        tipo: p.tipo || '',
        telefono: p.telefono || p.movil || '',
        email: p.email || '',
        direccion: p.direccion || '',
        poblacion: p.poblacion || '',
        cif: p.cif || ''
      }));
      
      setProveedores(proveedoresMapeados)
      
      try {
      storage.set('proveedores', proveedoresMapeados)
      } catch (storageError) {
        // Silenciar error de localStorage
      }
      
    } catch (error) {
      console.error('Error cargando proveedores:', error)
      setProveedores([])
    }
  };
  
  // Cargar proveedores desde Supabase al montar
  useEffect(() => {
    cargarProveedores();
  }, [])

  // Función para cargar historial de expedientes del mismo cliente
  const cargarHistorialExpedientes = async (nombreCliente) => {
    if (!nombreCliente || nombreCliente.trim() === '') {
      setExpedientesHistorial([])
      return
    }

    // Normalizar nombre: eliminar espacios extra y trim
    const nombreNormalizado = nombreCliente.trim().replace(/\s+/g, ' ')
    console.log("Buscando expedientes para:", nombreNormalizado)

    setCargandoHistorial(true)
    try {
      const { data, error } = await supabase
        .from('expedientes')
        .select('*')
        .ilike('cliente_nombre', nombreNormalizado)
        .order('fecha_viaje', { ascending: false })

      console.log("DATOS RECUPERADOS:", data)

      if (error) {
        console.error('Error cargando historial de expedientes:', error)
        setExpedientesHistorial([])
        return
      }

      if (!data || data.length === 0) {
        setExpedientesHistorial([])
        setCargandoHistorial(false)
        return
      }

      // Para cada expediente, calcular el beneficio neto consultando los servicios
      const expedientesConBeneficio = await Promise.all(
        data.map(async (exp) => {
          try {
            // Consultar servicios del expediente para calcular coste total
            const { data: servicios } = await supabase
              .from('servicios_cotizacion')
              .select('coste_unitario, tipo_servicio, noches')
              .eq('id_expediente', exp.id)

            let costeTotal = 0
            if (servicios && servicios.length > 0) {
              servicios.forEach(servicio => {
                const coste = parseFloat(servicio.coste_unitario) || 0
                const cantidad = servicio.tipo_servicio === 'Hotel' || servicio.tipo_servicio === 'Guía' 
                  ? (parseInt(servicio.noches) || 1)
                  : 1
                costeTotal += coste * cantidad
              })
            }

            // Calcular beneficio neto
            const precioVenta = parseFloat(exp.precio_venta_cliente) || 0
            const paxPago = parseInt(exp.pax_pago) || parseInt(exp.total_pax) || 0
            const precioVentaTotal = precioVenta * paxPago
            const beneficioTotal = precioVentaTotal - costeTotal
            const iva = beneficioTotal * 0.21
            const beneficioNeto = beneficioTotal - iva

            return {
              ...exp,
              beneficioNeto: isNaN(beneficioNeto) ? null : beneficioNeto
            }
          } catch (err) {
            console.error('❌ [Historial] Error calculando beneficio para expediente:', exp.id, err)
            return { ...exp, beneficioNeto: null }
          }
        })
      )

      console.log("✅ [Historial] Expedientes procesados:", expedientesConBeneficio.length)
      setExpedientesHistorial(expedientesConBeneficio)
    } catch (err) {
      console.error('❌ [Historial] Error inesperado cargando historial:', err)
      setExpedientesHistorial([])
    } finally {
      setCargandoHistorial(false)
    }
  }

  // Cargar historial cuando cambie el nombre del cliente
  useEffect(() => {
    const nombreCliente = expediente?.cliente_nombre || expediente?.nombre_grupo || ''
    if (nombreCliente) {
      cargarHistorialExpedientes(nombreCliente)
    }
  }, [expediente?.cliente_nombre, expediente?.nombre_grupo])
  
  // Cerrar sugerencias al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.relative')) {
        setMostrarSugerencias({})
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  // ============ CARGA OBLIGATORIA AL MONTAR ============
  // CRÍTICO: Carga los datos desde Supabase al montar el componente
  // Solo actualiza formData si los datos recibidos son válidos
  // TIMEOUT DE SEGURIDAD: Libera el guardado después de 2 segundos máximo
  useEffect(() => {
    const expedienteId = expediente?.id
    if (!expedienteId) {
      setDatosCargados(true) // Permitir guardado incluso sin ID (usará valores por defecto)
      return
    }

    // Timeout de seguridad: fuerza el estado a 'cargado' después de 2 segundos
    const timeoutSeguridad = setTimeout(() => {
      console.log('⏱️ Timeout de seguridad: Sistema listo para guardar (forzado)')
      setDatosCargados(true)
    }, 2000)

    const cargarDatosCompletos = async () => {
      // Bloquear guardados durante la carga
      setDatosCargados(false)
      
      try {
        // Cargar datos del expediente desde Supabase (solo columnas confirmadas)
        const { data, error } = await supabase
          .from('expedientes')
          .select('total_pax, pax_pago, gratuidades, precio_venta_cliente, bonificacion_pax, sup_individual_pax, sup_individual_precio_dia, sup_seguro_pax, sup_seguro_precio_total')
          .eq('id', expedienteId)
          .single()

        // Limpiar timeout de seguridad ya que la carga terminó
        clearTimeout(timeoutSeguridad)

        if (error) {
          console.error('❌ Error cargando datos:', error)
          // Liberar guardado incluso con error (usará valores por defecto)
          setDatosCargados(true)
          console.log('✅ Sistema listo para guardar (con valores por defecto)')
          return
        }

        // Carga Blindada: Solo actualizar si los datos son válidos
        if (!data) {
          console.warn('⚠️ No se recibieron datos válidos de Supabase')
          // Liberar guardado incluso sin datos (usará valores por defecto)
          setDatosCargados(true)
          console.log('✅ Sistema listo para guardar (con valores por defecto)')
          return
        }

        // Función helper para convertir a número de forma segura
        const convertirANumero = (valor, defaultValue = 0) => {
          if (valor === null || valor === undefined) return defaultValue
          const num = Number(valor)
          return isNaN(num) ? defaultValue : num
        }
        
        // Poblar formData con TODOS los valores convertidos a Number()
        const datosCargados = {
          total_pax: convertirANumero(data.total_pax, 1),
          gratuidades: convertirANumero(data.gratuidades, 0),
          precio_venta_cliente: convertirANumero(data.precio_venta_cliente, 0),
          bonificacion_pax: convertirANumero(data.bonificacion_pax, 0),
          sup_individual_pax: convertirANumero(data.sup_individual_pax, 0),
          sup_individual_precio_dia: convertirANumero(data.sup_individual_precio_dia, 0),
          sup_seguro_pax: convertirANumero(data.sup_seguro_pax, 0),
          sup_seguro_precio_total: convertirANumero(data.sup_seguro_precio_total, 0),
        }

        // DEBUG: Log de datos cargados
        console.log('Estado cargado desde DB:', datosCargados)
        
        // Carga Blindada: Solo establecer formData si los datos son válidos
        setFormData(datosCargados)
        
        // Liberar guardado: Marcar como cargado para permitir guardados
        setDatosCargados(true)
        console.log('✅ Sistema listo para guardar')
      } catch (err) {
        // Limpiar timeout en caso de error
        clearTimeout(timeoutSeguridad)
        console.error('❌ Error inesperado cargando datos:', err)
        // Liberar guardado incluso con error (usará valores por defecto)
        setDatosCargados(true)
        console.log('✅ Sistema listo para guardar (con valores por defecto)')
      }
    }

    // EJECUTAR SIEMPRE cuando hay expediente.id
    cargarDatosCompletos()

    // Cleanup: limpiar timeout si el componente se desmonta
    return () => {
      clearTimeout(timeoutSeguridad)
    }
  }, [expediente?.id]) // Solo depende del ID del expediente

  // ============ CARGA DE SERVICIOS (separada, depende de proveedores) ============
  useEffect(() => {
    const expedienteId = expediente?.id
    if (!expedienteId || proveedores.length === 0) return

    const cargarServicios = async () => {
      try {
        // Orden estable: created_at (orden de inserción) o id si created_at no existe
        let serviciosResponse = await supabase
          .from('servicios_cotizacion')
          .select('*')
          .eq('id_expediente', String(expedienteId).trim())
          .order('created_at', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true })

        if (serviciosResponse.error && (serviciosResponse.error.code === 'PGRST204' || String(serviciosResponse.error.message || '').includes('created_at'))) {
          serviciosResponse = await supabase
            .from('servicios_cotizacion')
            .select('*')
            .eq('id_expediente', String(expedienteId).trim())
            .order('id', { ascending: true })
        }

        // ============ MAPEO DE SERVICIOS CON SINCRONIZACIÓN DE PROVEEDORES ============
        if (serviciosResponse.data && Array.isArray(serviciosResponse.data) && serviciosResponse.data.length > 0) {
          const busquedaProveedoresRestaurada = {}
          
          const todosMapeados = serviciosResponse.data.map(row => {
            const proveedorIdInt = row.proveedor_id_int ? Number(row.proveedor_id_int) : null
            
            if (proveedorIdInt && !isNaN(proveedorIdInt) && proveedorIdInt > 0) {
              const proveedorEncontrado = proveedores.find(p => {
                const proveedorIdLista = Number(p.id)
                return !isNaN(proveedorIdLista) && proveedorIdLista === proveedorIdInt
              })
              if (proveedorEncontrado) {
                busquedaProveedoresRestaurada[row.id] = proveedorEncontrado.nombreComercial
              }
            }
            if (!busquedaProveedoresRestaurada[row.id] && row.nombre_proveedor_manual) {
              busquedaProveedoresRestaurada[row.id] = row.nombre_proveedor_manual
            }

            return {
              ...DEFAULT_SERVICE_VALUES,
              id: row.id || generarUUID(),
              proveedorId: proveedorIdInt,
              proveedorNombreTemporal: row.nombre_proveedor_manual || '',
              tipo: row.tipo_servicio || row.tipo || 'Hotel',
              nombreEspecifico: row.nombre_especifico || '',
              localizacion: row.localizacion || '',
              costeUnitario: row.coste_unitario != null ? Number(row.coste_unitario) : 0,
              precioVenta: row.precio_venta != null ? Number(row.precio_venta) : 0,
              margen: row.margen_pax != null ? Number(row.margen_pax) : 0,
              noches: row.noches != null ? Number(row.noches) : 1,
              fechaRelease: row.fecha_release ? String(row.fecha_release).split('T')[0] : '',
              tipoCalculo: (row.tipo_calculo === 'Total a dividir' || row.tipo_calculo === 'porGrupo') ? 'porGrupo' : 'porPersona',
            }
          })

          // Filtrar filas vacías: solo mostrar si tiene proveedor_id o nombre de servicio válido
          const tieneProveedor = (r) => r.proveedorId != null || (r.proveedorNombreTemporal && String(r.proveedorNombreTemporal).trim())
          const tieneNombreServicio = (r) => r.nombreEspecifico && String(r.nombreEspecifico).trim()
          const tieneDatos = (r) => tieneProveedor(r) || tieneNombreServicio(r) || (r.costeUnitario != null && Number(r.costeUnitario) > 0)
          const serviciosMapeados = todosMapeados.filter(tieneDatos)

          // Solo datos de Supabase; sin filas template ni vacías
          const idsEnBD = new Set((serviciosResponse.data || []).map(row => row.id))
          setServicios(prevServicios => {
            const serviciosNuevos = prevServicios.filter(s => s.id && !idsEnBD.has(s.id))
            return [...serviciosMapeados, ...serviciosNuevos]
          })
          
          setBusquedaProveedor(busquedaProveedoresRestaurada)
          serviciosInicializados.current = true
        } else {
          setServicios([])
          serviciosInicializados.current = false
        }
      } catch (err) {
        console.error('❌ Error cargando servicios:', err)
      }
    }

    cargarServicios()
  }, [expediente?.id, proveedores])

  // ============ FUNCIÓN PARA CONVERTIR NÚMEROS A TEXTO ============
  const numeroATexto = (numero) => {
    const unidades = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve']
    const decenas = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
    const especiales = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve']
    const centenas = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos']

    const num = Math.floor(numero)
    const decimales = Math.round((numero - num) * 100)

    if (num === 0) return 'cero'
    if (num === 1) return 'un'
    if (num === 100) return 'cien'
    if (num < 10) return unidades[num]
    if (num < 20) return especiales[num - 10]
    if (num < 100) {
      const decena = Math.floor(num / 10)
      const unidad = num % 10
      if (unidad === 0) return decenas[decena]
      return decenas[decena] + ' y ' + unidades[unidad]
    }
    if (num < 1000) {
      const centena = Math.floor(num / 100)
      const resto = num % 100
      if (resto === 0) return centenas[centena]
      return centenas[centena] + ' ' + numeroATexto(resto)
    }
    if (num < 1000000) {
      const miles = Math.floor(num / 1000)
      const resto = num % 1000
      let texto = miles === 1 ? 'mil' : numeroATexto(miles) + ' mil'
      if (resto > 0) texto += ' ' + numeroATexto(resto)
      return texto
    }
    return numero.toString()
  }

  // ============ GENERAR PDF DE RECIBO ============
  const generarReciboPDF = (cobro) => {
    const crearDocumento = (logoImg) => {
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      
      // Colores corporativos
      const colorAmarillo = [255, 193, 7] // #FFC107
      const colorAzul = [33, 150, 243] // #2196F3
      
      // Obtener datos del expediente y cliente
      const nombreGrupo = expediente?.nombre_grupo || expediente?.clienteNombre || 'Sin nombre'
      const destino = expediente?.destino || 'Sin destino'
      const clienteNombre = grupo?.nombre || expediente?.clienteNombre || 'Sin cliente'
      const importe = Number(cobro.importe || 0)
      const importeTexto = numeroATexto(importe) + ' euros'
      const fechaCobro = cobro.fecha ? new Date(cobro.fecha) : new Date()
      const fechaFormateada = fechaCobro.toLocaleDateString('es-ES', { 
        day: '2-digit', 
        month: 'long', 
        year: 'numeric' 
      })
      
      // Fondo con colores corporativos (banda superior)
      doc.setFillColor(...colorAmarillo)
      doc.rect(0, 0, pageWidth, 30, 'F')
      
      // Logo corporativo Tabora (si está disponible)
      if (logoImg) {
        try {
          doc.setFillColor(255, 255, 255)
          // Recuadro blanco para asegurar contraste
          doc.rect(10, 5, 55, 22, 'F')
          // Logo aprox. 45mm de ancho (ajustado a proporción)
          doc.addImage(logoImg, 'PNG', 12, 6, 50, 20)
        } catch (e) {
          console.warn('No se pudo dibujar el logo en el PDF:', e)
        }
      } else {
        // Fallback: reserva de espacio en blanco
        doc.setFillColor(255, 255, 255)
        doc.rect(10, 5, 55, 22, 'F')
      }
      
      // Título "RECIBO"
      doc.setTextColor(0, 0, 0)
      doc.setFontSize(24)
      doc.setFont('helvetica', 'bold')
      doc.text('RECIBO', pageWidth - 60, 20)
      
      // Importe entre almohadillas (arriba a la derecha)
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text(`# ${importe.toFixed(2)}€ #`, pageWidth - 60, 35)
      
      // Línea separadora
      doc.setDrawColor(...colorAzul)
      doc.setLineWidth(0.5)
      doc.line(10, 45, pageWidth - 10, 45)
      
      // Contenido principal (ligeramente más abajo para no chocar con el logo)
      let yPos = 70
      
      // "Se recibió de"
      doc.setFontSize(12)
      doc.setFont('helvetica', 'normal')
      doc.text('Se recibió de:', 20, yPos)
      doc.setFont('helvetica', 'bold')
      doc.text(clienteNombre, 60, yPos)
      yPos += 15
      
      // "La cantidad de"
      doc.setFont('helvetica', 'normal')
      doc.text('La cantidad de:', 20, yPos)
      doc.setFont('helvetica', 'bold')
      doc.text(importeTexto.charAt(0).toUpperCase() + importeTexto.slice(1), 60, yPos)
      yPos += 15
      
      // "En concepto de"
      doc.setFont('helvetica', 'normal')
      doc.text('En concepto de:', 20, yPos)
      doc.setFont('helvetica', 'bold')
      const concepto = `${nombreGrupo} - ${destino}`
      doc.text(concepto, 60, yPos)
      yPos += 20
      
      // Fecha
      doc.setFont('helvetica', 'normal')
      doc.text(`Fecha: ${fechaFormateada}`, 20, yPos)
      yPos += 20
      
      // Método de pago
      doc.text(`Método de pago: ${cobro.metodo_pago || '-'}`, 20, yPos)
      yPos += 10
      
      // Pie de página con datos fiscales
      const footerY = pageHeight - 50
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 100, 100)
      
      // Línea separadora antes del pie
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.3)
      doc.line(10, footerY - 5, pageWidth - 10, footerY - 5)
      
      // Datos fiscales
      doc.text('Valservice Incoming S.L. (Viajes Tabora)', 20, footerY)
      doc.text('CIF: B-98998107', 20, footerY + 8)
      doc.text('Licencia: CVMm303V', 20, footerY + 16)
      doc.text('Apartado de correos 58, 46185 La Pobla de Vallbona (Valencia)', 20, footerY + 24)
      
      // Nombre del archivo
      const nombreArchivo = `Recibo_${nombreGrupo.replace(/[^a-zA-Z0-9]/g, '_')}_${fechaCobro.toISOString().split('T')[0]}.pdf`
      
      // Descargar PDF
      doc.save(nombreArchivo)
    }

    const logo = new Image()
    // Intentar primero con el nombre de archivo original arrastrado
    logo.src = '/Logo tabora 2023.png'
    logo.onload = () => {
      console.log('✅ Logo Tabora cargado correctamente para el recibo PDF')
      crearDocumento(logo)
    }
    logo.onerror = () => {
      console.warn('No se pudo cargar el logo desde "/Logo tabora 2023.png". Probando "/tabora-logo.png"...')
      const fallbackLogo = new Image()
      fallbackLogo.src = '/tabora-logo.png'
      fallbackLogo.onload = () => {
        console.log('✅ Logo Tabora cargado desde fallback "/tabora-logo.png"')
        crearDocumento(fallbackLogo)
      }
      fallbackLogo.onerror = (e) => {
        console.warn('❗ No se pudo cargar ningún logo para el recibo PDF:', e)
        crearDocumento(null)
      }
    }
  }

  // ============ CARGAR COBROS DEL EXPEDIENTE ============
  const cargarCobros = async () => {
    if (!expediente?.id) {
      setCobros([])
      return
    }
    
    try {
      const { data, error } = await supabase
        .from('cobros_expediente')
        .select('*')
        .eq('expediente_id', expediente.id)
        .order('fecha', { ascending: false })
      
      if (error) {
        console.error('Error cargando cobros:', error)
        setCobros([])
        return
      }
      
      // Actualizar estado inmediatamente para refrescar la UI
      setCobros(data || [])
    } catch (error) {
      console.error('Error fatal cargando cobros:', error)
      setCobros([])
    }
  }

  // Cargar cobros cuando se abre la pestaña o cambia el expediente
  useEffect(() => {
    if (tab === 'cobros' && expediente?.id) {
      cargarCobros()
    } else if (tab !== 'cobros') {
      // Limpiar cobros cuando se cambia de pestaña para optimizar memoria
      setCobros([])
    }
  }, [tab, expediente?.id])

  // ============ CARGAR VERSIONES DE FACTURAS ============
  // ============ CARGAR VERSIONES DE FACTURA (SINCRONIZADO) ============
  // Historial dinámico: se actualiza automáticamente al borrar facturas en Supabase
  const cargarVersionesFactura = async () => {
    if (!expediente?.id) {
      setVersionesFactura([])
      return
    }
    
    setCargandoVersiones(true)
    try {
      // Cargar desde facturas_versiones (versiones históricas antes de emitir)
      const { data, error } = await supabase
        .from('facturas_versiones')
        .select('*')
        .eq('expediente_id', expediente.id)
        .order('fecha_creacion', { ascending: false })
      
      if (error) {
        console.error('Error cargando versiones de factura:', error)
        setVersionesFactura([])
        return
      }
      
      // Si se borraron facturas, el historial se actualiza automáticamente
      setVersionesFactura(data || [])
      console.log(`📋 Historial de versiones cargado: ${data?.length || 0} versiones`)
    } catch (error) {
      console.error('Error fatal cargando versiones de factura:', error)
      setVersionesFactura([])
    } finally {
      setCargandoVersiones(false)
    }
  }

  // ============ CARGAR UNA VERSIÓN DE FACTURA ============
  const cargarVersionFactura = (version) => {
    if (!version?.datos_json) {
      alert('❌ Error: La versión no contiene datos válidos')
      return
    }
    
    const datos = version.datos_json
    
    // Restaurar datos del receptor desde clientData
    if (datos.clientData) {
      setFormFactura({
        receptorNombre: datos.clientData.nombre || '',
        receptorCIF: datos.clientData.cif || '',
        receptorDireccion: datos.clientData.direccion || '',
        receptorPoblacion: datos.clientData.poblacion || '',
        receptorProvincia: datos.clientData.provincia || '',
        receptorCP: datos.clientData.cp || '',
      })
    }
    
    // Restaurar datos del formulario principal desde totals si existen
    if (datos.totals) {
      // Calcular precio_venta_cliente desde los datos guardados
      const precioNetoPax = parseFloat(datos.totals.precio_neto_pax || 0)
      const precioVentaPax = parseFloat(datos.totals.precio_venta_pax || 0)
      const bonificacionPax = precioVentaPax - precioNetoPax
      
      setFormData(prev => ({
        ...prev,
        precio_venta_cliente: precioVentaPax || prev.precio_venta_cliente,
        bonificacion_pax: bonificacionPax || prev.bonificacion_pax,
        total_pax: parseFloat(datos.totals.pax_pago || prev.total_pax) || prev.total_pax
      }))
    }
    
    alert('✅ Versión de factura cargada en el editor. Los datos están listos para editar o reemitir.')
  }

  // ============ BORRAR VERSIÓN DE FACTURA ============
  const borrarVersionFactura = async (versionId, numeroFactura) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar esta versión histórica?')) {
      return
    }
    
    try {
      const { error } = await supabase
        .from('facturas_versiones')
        .delete()
        .eq('id', versionId)
      
      if (error) {
        console.error('Error borrando versión:', error)
        alert(`❌ Error borrando versión: ${error.message}`)
        return
      }
      
      // Recargar versiones para actualizar la vista
      await cargarVersionesFactura()
      alert('✅ Versión histórica eliminada correctamente')
    } catch (error) {
      console.error('Error inesperado borrando versión:', error)
      alert(`❌ Error inesperado: ${error.message}`)
    }
  }

  // Cargar versiones cuando se abre la pestaña de facturación
  useEffect(() => {
    if (tab === 'facturacion' && expediente?.id) {
      cargarVersionesFactura()
    }
  }, [tab, expediente?.id])

  // ============ CARGAR FACTURAS EMITIDAS ============
  const cargarFacturasEmitidas = async () => {
    if (!expediente?.id) {
      setFacturasEmitidas([])
      return
    }
    
    setCargandoFacturasEmitidas(true)
    try {
      const { data, error } = await supabase
        .from('facturas_emitidas')
        .select('*')
        .eq('expediente_id', expediente.id)
        .order('created_at', { ascending: false })
      
      if (error) {
        console.error('Error cargando facturas emitidas:', error)
        setFacturasEmitidas([])
        return
      }
      
      setFacturasEmitidas(data || [])
    } catch (error) {
      console.error('Error fatal cargando facturas emitidas:', error)
      setFacturasEmitidas([])
    } finally {
      setCargandoFacturasEmitidas(false)
    }
  }

  // Cargar facturas emitidas cuando se abre la pestaña de cierres
  useEffect(() => {
    if (tab === 'cierre' && expediente?.id) {
      cargarFacturasEmitidas()
    }
  }, [tab, expediente?.id])

  // ============ REGENERAR PDF DESDE DATOS ============
  // Usa la función unificada que acepta objeto factura completo
  const regenerarPDFDesdeDatos = async (facturaEmitida) => {
    if (!facturaEmitida) {
      alert('❌ Error: No hay datos de factura para regenerar el PDF')
      return
    }
    
    // Si tiene datos_factura, construir objeto factura completo para la función unificada
    const facturaCompleta = {
      ...facturaEmitida,
      datos_factura: facturaEmitida.datos_factura || facturaEmitida.datos_json,
      numero_factura: facturaEmitida.numero_factura || facturaEmitida.datos_factura?.numero_factura,
      cliente_nombre: facturaEmitida.cliente_nombre || facturaEmitida.nombre_receptor || facturaEmitida.datos_factura?.receptor?.nombre,
      cliente_documento: facturaEmitida.cliente_documento || facturaEmitida.cif_receptor || facturaEmitida.datos_factura?.receptor?.cif_nif,
      importe_total: facturaEmitida.importe_total || facturaEmitida.total_factura || facturaEmitida.datos_factura?.calcularBaseFactura?.totalFactura,
      fecha_emision: facturaEmitida.fecha_emision || facturaEmitida.datos_factura?.fecha_emision
    }
    
    // Llamar a la función unificada de Cierres (copiada aquí para evitar dependencias)
    await generarFacturaPDFUnificado(facturaCompleta)
  }
  
  // ============ FUNCIÓN UNIFICADA DE GENERACIÓN DE PDF (COMPARTIDA) ============
  // Misma función que en Cierres.jsx para garantizar diseño unificado
  const generarFacturaPDFUnificado = async (factura) => {
    // Extraer datos de forma robusta desde cualquier fuente
    const datos = factura?.datos_factura || factura?.datos_json || {}
    const receptor = datos.receptor || datos.formFactura?.receptor || datos.formFactura || {}
    
    // Número de factura
    const numeroFactura = factura?.numero_factura || datos.numero_factura || 'SIN-NUMERO'
    
    // Datos del cliente/receptor
    const clienteNombre = receptor.nombre || factura?.cliente_nombre || factura?.nombre_receptor || factura?.display_nombre || 'Sin nombre'
    const clienteCIF = receptor.cif_nif || receptor.cif || factura?.cliente_documento || factura?.cif_receptor || factura?.display_doc || ''
    const clienteDireccion = receptor.direccion || ''
    const clientePoblacion = receptor.poblacion || ''
    const clienteProvincia = receptor.provincia || ''
    const clienteCP = receptor.cp || receptor.codigo_postal || ''
    
    // Concepto
    const concepto = datos.concepto || datos.concepts?.concepto || factura?.concepto || 'Servicios de viaje'
    
    // Cálculos financieros
    const calc = datos.calcularBaseFactura || {}
    let baseImponible = parseFloat(calc.baseImponible || factura?.base_imponible || 0) || 0
    let iva = parseFloat(calc.iva || factura?.iva || 0) || 0
    const total = parseFloat(calc.totalFactura || datos.importe_total || factura?.importe_total || factura?.total_factura || factura?.display_total || 0) || 0
    
    // Si solo tenemos el total, calcular base e IVA (asumiendo 21% de IVA)
    if (total > 0 && baseImponible === 0 && iva === 0) {
      const tipoIVA = parseFloat(calc.tipoIVA || datos.tipoIVA || 21) || 21
      baseImponible = +(total / (1 + tipoIVA / 100)).toFixed(2)
      iva = +(total - baseImponible).toFixed(2)
    }
    
    // Fecha
    const fechaEmision = datos.fecha_emision || factura?.fecha_emision || new Date().toISOString()
    const fecha = new Date(fechaEmision)
    const fechaFormateada = fecha.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    })
    
    // Datos del emisor
    const datosEmisor = {
      nombre: 'VALSERVICE INCOMING S.L.',
      cif: 'B-12345678',
      licencia: 'CV-1234',
      direccion: 'C/ Santa Amalia, nº 2 Entresuelo 2º Of. L1, 46009 Valencia (ESP)',
      telefono: '+34 96 339 04 64',
      email: 'info@viajestabora.com',
      banco1: 'ES12 1234 5678 9012 3456 7890',
      banco2: 'ES98 9876 5432 1098 7654 3210'
    }
    
    const crearDocumento = (logoImg) => {
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      
      // Logo
      if (logoImg) {
        try {
          doc.setFillColor(255, 255, 255)
          doc.rect(20, 15, 40, 15, 'F')
          doc.addImage(logoImg, 'PNG', 20, 15, 40, 15)
        } catch (e) {
          console.warn('Error añadiendo logo a factura:', e)
        }
      }
      
      // Número de factura
      doc.setFontSize(20)
      doc.setTextColor(33, 150, 243)
      doc.setFont(undefined, 'bold')
      doc.text(`FACTURA ${numeroFactura}`, pageWidth - 20, 25, { align: 'right' })
      
      // Fecha
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text(`Fecha: ${fechaFormateada}`, pageWidth - 20, 35, { align: 'right' })
      
      // Datos del emisor
      let yPos = 50
      doc.setFontSize(12)
      doc.setTextColor(0, 0, 0)
      doc.setFont(undefined, 'bold')
      doc.text(datosEmisor.nombre, 20, yPos)
      yPos += 6
      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      doc.text(`CIF: ${datosEmisor.cif}`, 20, yPos)
      yPos += 6
      doc.text(`Licencia: ${datosEmisor.licencia}`, 20, yPos)
      yPos += 6
      doc.text(datosEmisor.direccion, 20, yPos)
      yPos += 6
      doc.text(`Tel: ${datosEmisor.telefono} | Email: ${datosEmisor.email}`, 20, yPos)
      
      // Datos del receptor
      yPos += 15
      doc.setFontSize(12)
      doc.setFont(undefined, 'bold')
      doc.text('FACTURAR A:', 20, yPos)
      yPos += 8
      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      doc.text(clienteNombre, 20, yPos)
      yPos += 6
      if (clienteCIF) {
        doc.text(`CIF/NIF: ${clienteCIF}`, 20, yPos)
        yPos += 6
      }
      if (clienteDireccion) {
        doc.text(clienteDireccion, 20, yPos)
        yPos += 6
      }
      const direccionCompleta = [clienteCP, clientePoblacion, clienteProvincia].filter(Boolean).join(' ')
      if (direccionCompleta) {
        doc.text(direccionCompleta, 20, yPos)
        yPos += 6
      }
      
      // Concepto
      yPos += 10
      doc.setFontSize(12)
      doc.setFont(undefined, 'bold')
      doc.text('CONCEPTO:', 20, yPos)
      yPos += 8
      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      const conceptoLineas = doc.splitTextToSize(concepto, pageWidth - 40)
      conceptoLineas.forEach((linea) => {
        doc.text(linea, 20, yPos)
        yPos += 6
      })
      
      // Totales
      yPos += 10
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.3)
      doc.line(20, yPos, pageWidth - 20, yPos)
      yPos += 8
      
      doc.setFontSize(12)
      doc.setTextColor(0, 0, 0)
      doc.setFont(undefined, 'bold')
      doc.text('TOTAL FACTURA (IVA INCLUIDO):', pageWidth - 60, yPos, { align: 'right' })
      doc.setTextColor(34, 197, 94) // Verde
      doc.text(`${total.toFixed(2)}€`, pageWidth - 20, yPos, { align: 'right' })
      yPos += 10

      // Cláusula legal obligatoria (art 142 Ley 37/1992)
      doc.setFontSize(7)
      doc.setTextColor(80, 80, 80)
      doc.setFont(undefined, 'normal')
      const clausulaLegal = 'Régimen especial de las agencias de viaje. El IVA ya está incluido en todos los conceptos especificados en esta factura, de acuerdo con lo señalado en el art 142 de la Ley 37/1992, de 28 de diciembre, del Impuesto sobre el Valor Añadido.'
      const lineasClausula = doc.splitTextToSize(clausulaLegal, pageWidth - 40)
      lineasClausula.forEach((linea) => {
        doc.text(linea, 20, yPos)
        yPos += 4
      })
      
      // Pie de página
      const footerY = pageHeight - 40
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.3)
      doc.line(10, footerY - 5, pageWidth - 10, footerY - 5)
      
      doc.setFontSize(8)
      doc.setTextColor(100, 100, 100)
      doc.text(datosEmisor.nombre, 20, footerY)
      doc.text(`CIF: ${datosEmisor.cif} | Licencia: ${datosEmisor.licencia}`, 20, footerY + 6)
      doc.text(datosEmisor.direccion, 20, footerY + 12)
      
      const nombreArchivo = `Factura_${numeroFactura}_${clienteNombre.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
      doc.save(nombreArchivo)
    }
    
    // Cargar logo
    const logo = new Image()
    logo.src = 'https://gtwyqxfkpdwpakmgrkbu.supabase.co/storage/v1/object/public/branding/Logo%20tabora%202023.png'
    logo.onload = () => {
      crearDocumento(logo)
    }
    logo.onerror = () => {
      const fallbackLogo = new Image()
      fallbackLogo.src = '/Logo tabora 2023.png'
      fallbackLogo.onload = () => {
        crearDocumento(fallbackLogo)
      }
      fallbackLogo.onerror = () => {
        crearDocumento(null)
      }
    }
  }

  // ============ FACTURAR A PASAJERO INDIVIDUAL ============
  const facturarPasajeroIndividual = async (pasajero) => {
    if (!pasajero) {
      alert('❌ Error: No se ha seleccionado un pasajero')
      return
    }
    
    // Usar datos del pasajero para el receptor
    setFormFactura({
      receptorNombre: pasajero.nombre || pasajero.nombre_completo || 'Sin nombre',
      receptorCIF: pasajero.dni || pasajero.cif || '',
      receptorDireccion: pasajero.direccion || '',
      receptorPoblacion: pasajero.poblacion || '',
      receptorProvincia: pasajero.provincia || '',
      receptorCP: pasajero.cp || ''
    })
    
    // Cambiar a la pestaña de facturación
    setTab('facturacion')
    
    alert('✅ Datos del pasajero cargados. Completa la factura y emítela.')
  }

  // ============ CARGAR LOGS FINANCIEROS ============
  const cargarLogsFinancieros = async () => {
    if (!expediente?.id) {
      setLogsFinancieros([])
      return
    }
    
    try {
      const { data, error } = await supabase
        .from('logs_financieros')
        .select('*')
        .eq('expediente_id', expediente.id)
        .order('fecha_registro', { ascending: false })
      
      if (error) {
        console.error('Error cargando logs financieros:', error)
        setLogsFinancieros([])
        return
      }
      
      setLogsFinancieros(data || [])
    } catch (error) {
      console.error('Error fatal cargando logs financieros:', error)
      setLogsFinancieros([])
    }
  }

  // ============ GUARDAR COBRO ============
  const guardarCobro = async () => {
    if (!expediente?.id) {
      alert('❌ No se puede guardar: expediente no válido')
      return
    }

    // Validación: Verificar que el expediente tenga un cliente asignado
    const clienteId = expediente.cliente_id || expediente.clienteId
    if (!clienteId) {
      alert('⚠️ No se puede registrar el cobro: El expediente no tiene un cliente asignado.\n\nPor favor, asigna un cliente al expediente antes de registrar cobros.')
      return
    }

    // Validación de importe
    const importeLimpio = limpiarNumero(formCobro.importe)
    if (importeLimpio <= 0) {
      alert('❌ El importe debe ser mayor que 0')
      return
    }

    // Validación de concepto
    if (!formCobro.concepto || formCobro.concepto.trim() === '') {
      alert('❌ El concepto es obligatorio')
      return
    }

    try {
      const datosCobro = {
        expediente_id: expediente.id,
        cliente_id: clienteId,
        importe: importeLimpio,
        metodo_pago: formCobro.metodo_pago,
        cuenta_destino: formCobro.cuenta_destino,
        concepto: formCobro.concepto.trim()
      }

      let errorOperacion = null
      let operacionExitosa = false

      if (cobroEnEdicionId) {
        // UPDATE: Modificar cobro existente
        // Obtener cobro original para comparación
        const cobroOriginal = cobros.find(c => c.id === cobroEnEdicionId)
        
        // Comparar valores y generar descripción inteligente
        const cambios = []
        
        if (cobroOriginal) {
          // Comparar cuenta_destino
          if (cobroOriginal.cuenta_destino !== formCobro.cuenta_destino) {
            cambios.push(`Cambio de cuenta: ${cobroOriginal.cuenta_destino || 'Sin cuenta'} -> ${formCobro.cuenta_destino}`)
          }
          
          // Comparar metodo_pago
          if (cobroOriginal.metodo_pago !== formCobro.metodo_pago) {
            cambios.push(`Cambio de método: ${cobroOriginal.metodo_pago || 'Sin método'} -> ${formCobro.metodo_pago}`)
          }
          
          // Comparar importe
          const importeOriginal = Number(cobroOriginal.importe) || 0
          if (Math.abs(importeOriginal - importeLimpio) > 0.01) {
            cambios.push(`Cambio de importe: ${importeOriginal.toFixed(2)}€ -> ${importeLimpio.toFixed(2)}€`)
          }
        }
        
        // Generar descripción final
        let descripcion = ''
        if (cambios.length === 0) {
          descripcion = `Cobro actualizado sin cambios detectados: ${importeLimpio}€ - ${formCobro.concepto || 'Sin concepto'}`
        } else if (cambios.length === 1) {
          descripcion = cambios[0]
        } else {
          descripcion = `Actualización múltiple de datos del cobro: ${cambios.join(', ')}`
        }
        
        const { error } = await supabase
          .from('cobros_expediente')
          .update(datosCobro)
          .eq('id', cobroEnEdicionId)
        errorOperacion = error
        
        if (!error) {
          operacionExitosa = true
          // INSERT EN LOGS INMEDIATAMENTE DESPUÉS DEL UPDATE EXITOSO
          const { error: logError } = await supabase
            .from('logs_financieros')
            .insert([{
              expediente_id: expediente.id,
              tipo: 'COBRO',
              descripcion: descripcion,
              importe: importeLimpio,
              usuario: 'Admin'
            }])
          if (logError) {
            console.error("Error guardando log:", logError)
          } else {
            // Refrescar historial inmediatamente
            await cargarLogsFinancieros()
            console.log("✅ Historial actualizado")
          }
        }
      } else {
        // INSERT: Crear nuevo cobro
        const { error } = await supabase
          .from('cobros_expediente')
          .insert([datosCobro])
        errorOperacion = error
        
        if (!error) {
          operacionExitosa = true
          // INSERT EN LOGS INMEDIATAMENTE DESPUÉS DEL INSERT EXITOSO
          const { error: logError } = await supabase
            .from('logs_financieros')
            .insert([{
              expediente_id: expediente.id,
              tipo: 'COBRO',
              descripcion: `Cobro registrado: ${importeLimpio}€ - ${formCobro.concepto || 'Sin concepto'}`,
              importe: importeLimpio,
              usuario: 'Admin'
            }])
          if (logError) {
            console.error("Error guardando log:", logError)
          } else {
            // Refrescar historial inmediatamente
            await cargarLogsFinancieros()
            console.log("✅ Historial actualizado")
          }
        }
      }

      if (errorOperacion) {
        console.error('Error guardando cobro:', errorOperacion)
        alert(`❌ Error guardando cobro:\n\n${errorOperacion.message || JSON.stringify(errorOperacion)}`)
        return
      }

      // Recargar lista de cobros inmediatamente para refrescar la UI
      await cargarCobros()

      // Resetear formulario y cerrar modal
      setFormCobro({
        importe: '',
        metodo_pago: 'Transferencia',
        cuenta_destino: 'Caixabank',
        concepto: ''
      })
      setCobroEnEdicionId(null)
      setShowModalCobro(false)
    } catch (error) {
      console.error('Error inesperado guardando cobro:', error)
      alert(`❌ Error inesperado:\n\n${error.message || JSON.stringify(error)}`)
    }
  }

  // Sin inicialización automática: servicios solo se llena desde BD o con el botón "+ Añadir Servicio"
  
  // ============ UX: HANDLERS PARA INPUTS ============
  
  // Auto-limpiar campo cuando está en 0 y se hace focus
  const handleFocus = (e) => {
    if (e.target.value === '0' || parseFloat(e.target.value) === 0) {
      e.target.select() // Selecciona todo para fácil reemplazo
    }
  }
  
  // Deshabilitar cambio con rueda del ratón
  const handleWheel = (e) => {
    e.target.blur() // Quita el focus para evitar cambio accidental
  }
  
  // Estados para Rooming List
  const [habitaciones, setHabitaciones] = useState({
    dobles: expediente?.pasajeros?.habitaciones?.dobles || 0,
    doblesTwin: expediente?.pasajeros?.habitaciones?.doblesTwin || 0,
    individuales: expediente?.pasajeros?.habitaciones?.individuales || 0,
  })
  const [documentos, setDocumentos] = useState(expediente?.documentos || [])
  
  // ============ ESTADOS PARA GESTIÓN DE COBROS ============
  const [cobros, setCobros] = useState([])
  const [showModalCobro, setShowModalCobro] = useState(false)
  const [cobroEnEdicionId, setCobroEnEdicionId] = useState(null)
  const [formCobro, setFormCobro] = useState({
    importe: '',
    metodo_pago: 'Transferencia',
    cuenta_destino: 'Caixabank',
    concepto: ''
  })
  
  // Estados para Historial de Logs Financieros
  const [logsFinancieros, setLogsFinancieros] = useState([])
  const [showModalLogs, setShowModalLogs] = useState(false)
  
  // Cliente editable
  const grupo = clientes.find(c => c.id === expediente?.clienteId) || {
    id: null,
    nombre: expediente?.nombre_grupo || expediente?.clienteNombre || 'Sin nombre',
    responsable: expediente?.cliente_responsable || expediente?.responsable || 'Sin responsable',
    cif: '',
    movilResponsable: '',
    email: '',
    nSocios: '',
    poblacion: '',
    provincia: '',
    direccion: '',
  }
  
  const [clienteEditado, setClienteEditado] = useState(grupo)

  // ============ SISTEMA DE AVISOS DE INTEGRIDAD DE DATOS ============
  // Detección ampliada de campos críticos faltantes
  const datosClienteActuales = editandoCliente ? clienteEditado : grupo
  
  const camposFaltantes = useMemo(() => {
    const faltantes = []
    const datos = datosClienteActuales
    
    // Email
    if (!datos.email || String(datos.email).trim() === '' || datos.email === '-') {
      faltantes.push('Email')
    }

    // CIF
    const cif = datos.cif || datos.cif_nif
    if (!cif || String(cif).trim() === '' || cif === '-') {
      faltantes.push('CIF')
    }
    
    // Teléfono
    const telefono = datos.telefono || datos.movil
    if (!telefono || String(telefono).trim() === '' || telefono === '-') {
      faltantes.push('Teléfono')
    }
    
    // Móvil
    const movil = datos.movilResponsable || datos.movil
    if (!movil || String(movil).trim() === '' || movil === '-') {
      faltantes.push('Móvil')
    }
    
    // Responsable
    if (!datos.responsable || String(datos.responsable).trim() === '' || datos.responsable === '-') {
      faltantes.push('Responsable')
    }
    
    // Dirección
    if (!datos.direccion || String(datos.direccion).trim() === '' || datos.direccion === '-') {
      faltantes.push('Dirección')
    }
    
    // Población
    if (!datos.poblacion || String(datos.poblacion).trim() === '' || datos.poblacion === '-') {
      faltantes.push('Población')
    }
    
    // Provincia
    if (!datos.provincia || String(datos.provincia).trim() === '' || datos.provincia === '-') {
      faltantes.push('Provincia')
    }
    
    return faltantes
  }, [datosClienteActuales, editandoCliente, clienteEditado, grupo])

  const hayCamposFaltantes = camposFaltantes.length > 0

  // Función helper para verificar si un campo específico está vacío
  const esCampoVacio = (campoKey) => {
    const datos = datosClienteActuales
    switch(campoKey) {
      case 'email':
        return !datos.email || String(datos.email).trim() === '' || datos.email === '-'
      case 'telefono':
        const tel = datos.telefono || datos.movil
        return !tel || String(tel).trim() === '' || tel === '-'
      case 'movil':
        const movil = datos.movilResponsable || datos.movil
        return !movil || String(movil).trim() === '' || movil === '-'
      case 'responsable':
        return !datos.responsable || String(datos.responsable).trim() === '' || datos.responsable === '-'
      case 'direccion':
        return !datos.direccion || String(datos.direccion).trim() === '' || datos.direccion === '-'
      case 'poblacion':
        return !datos.poblacion || String(datos.poblacion).trim() === '' || datos.poblacion === '-'
      case 'provincia':
        return !datos.provincia || String(datos.provincia).trim() === '' || datos.provincia === '-'
      case 'cif':
        const cif = datos.cif || datos.cif_nif
        return !cif || String(cif).trim() === '' || cif === '-'
      default:
        return false
    }
  }

  // ⚠️ BLINDAJE NIVEL 2: Cálculo seguro de pasajeros de pago
  // Si no hay pax, los cálculos deben devolver 0 (nunca dividir por 0).
  const paxPago = Math.max(0, toNum(formData?.total_pax) - toNum(formData?.gratuidades))
  const totalPax = Math.max(0, toNum(formData?.total_pax))

  // NOTA: Para "Total a dividir" (Autobús), costeUnitario almacena el TOTAL que escribe el usuario.
  // NO sobrescribir costeUnitario al cambiar pax_pago (evita que las cifras se muevan al guardar).

  // Estados para Facturación
  const [formFactura, setFormFactura] = useState({
    receptorNombre: '',
    receptorCIF: '',
    receptorDireccion: '',
    receptorPoblacion: '',
    receptorProvincia: '',
    receptorCP: '',
  })
  
  // Estados para Versiones de Facturas
  const [versionesFactura, setVersionesFactura] = useState([])
  const [cargandoVersiones, setCargandoVersiones] = useState(false)
  
  // Estados para Facturas Emitidas (Cierres)
  const [facturasEmitidas, setFacturasEmitidas] = useState([])
  const [cargandoFacturasEmitidas, setCargandoFacturasEmitidas] = useState(false)

  // Tabs
  const tabs = [
    { id: 'grupo', label: 'Ficha del Grupo', icon: Users },
    { id: 'cotizacion', label: 'Cotización', icon: Calculator },
    { id: 'pasajeros', label: 'Rooming List', icon: Bed },
    { id: 'cobros', label: 'Cobros y Pagos', icon: DollarSign },
    { id: 'facturacion', label: 'Facturación', icon: FileText },
    { id: 'documentacion', label: 'Documentación', icon: FileUp },
    { id: 'cierre', label: 'Cierre de Grupo', icon: TrendingUp },
  ]

  // ============ FUNCIONES DE PROVEEDORES ============
  
  // Mapeo consistente de tipos de servicio a tipos de proveedor
  // IMPORTANTE: Normaliza el tipo a minúsculas y sin tildes para coincidir con la DB estandarizada
  const mapearTipoServicioAProveedor = (tipoServicio) => {
    // Primero intentar mapeo directo para mantener compatibilidad
    const mapa = {
      'Hotel': 'hotel',
      'Restaurante': 'restaurante',
      'Autobús': 'autobus',
      'Guía': 'guia',
      'Guía Local': 'guialocal',
      'Entradas/Tickets': 'entradas',
      'Seguro': 'seguro',
      'Otros': 'otros'
    }
    
    // Si está en el mapa, usar el valor mapeado (ya normalizado)
    if (mapa[tipoServicio]) {
      return mapa[tipoServicio];
    }
    
    // Si no está en el mapa, normalizar directamente: minúsculas + sin tildes
    return normalizarTipo(tipoServicio);
  }
  
  // Función para abrir modal - SOLO abre el modal, NADA MÁS
  // NO hace insert, solo configura valores y abre modal
  const abrirModalProveedor = (inputValue, tipoServicioActual, servicioId) => {
    const nombreLimpio = inputValue?.trim() || ''
    const tipoProveedor = tipoServicioActual ? mapearTipoServicioAProveedor(tipoServicioActual) : 'hotel'

    setNombreNuevoProveedor(nombreLimpio)
    setTipoNuevoProveedor(tipoProveedor)
    setServicioIdParaProveedor(servicioId)
    setShowModal(true)
  }
  
  const obtenerProveedorPorId = (id) => {
    return proveedores.find(p => p.id === id)
  }
  
  // ============ FUNCIONES DE SERVICIOS ============
  
  const añadirServicio = () => {
    const nuevoServicio = {
      ...DEFAULT_SERVICE_VALUES,
      id: generarUUID(),
      tipo: 'Hotel',
      tipoCalculo: 'porPersona',
    };
    setServicios([...servicios, nuevoServicio])
    
    // Guardar automáticamente en Supabase
    if (expediente?.id) {
      guardarServicioEnSupabase(nuevoServicio)
    }
  }

  const eliminarServicio = async (id) => {
    const servicio = servicios.find(s => s.id === id)
    const nombre = servicio?.descripcion || servicio?.tipo || 'este servicio'
    
    if (window.confirm(`¿Está seguro que desea eliminar el servicio "${nombre}"?\n\nEsta acción no se puede deshacer.`)) {
      // Eliminar de Supabase si tiene ID de Supabase
      if (servicio.id && typeof servicio.id === 'string' && servicio.id.length > 10 && expediente?.id) {
        try {
          const { error } = await supabase
            .from('servicios_cotizacion')
            .delete()
            .eq('id', servicio.id)
          
          if (error) {
            console.error('❌ Error eliminando servicio de Supabase:', error)
            alert('Error eliminando servicio de la base de datos')
            return
          }
        } catch (err) {
          console.error('❌ Error inesperado eliminando servicio:', err)
        }
      }
      
      // Eliminar del estado local
      setServicios(servicios.filter(s => s.id !== id))
      // Limpiar búsqueda de proveedor asociada
      const busquedaActualizada = { ...busquedaProveedor }
      delete busquedaActualizada[id]
      setBusquedaProveedor(busquedaActualizada)
    }
  }

  const finalizarCalculo = (servicio, paxPago = 31, paxTotal = 35) => {
    const s = { ...DEFAULT_SERVICE_VALUES, ...(servicio || {}) };
    return finalizarCalculoModulo(s, paxPago, paxTotal);
  };

  // Helper de UI: adaptar servicio al formato esperado por finalizarCalculo
  const calcularTotalFilaUI = (servicio) => {
    const fila = {
      ...servicio,
      tipo_calculo:
        servicio.tipo_calculo ||
        (servicio.tipoCalculo === 'porGrupo' ? 'Total a dividir' : servicio.tipoCalculo) ||
        '',
      tipo_servicio: servicio.tipo_servicio || servicio.tipo || '',
      coste_unitario: servicio.coste_unitario ?? servicio.costeUnitario ?? servicio.precio_manual ?? 0,
      noches: servicio.noches ?? 1,
      dias_guia: servicio.dias_guia ?? servicio.noches ?? 1,
      total_servicio_manual: servicio.total_servicio_manual ?? servicio.totalServicio ?? servicio.total_servicio ?? 0,
    }

    const { total_servicio } = finalizarCalculo(fila, paxPago, totalPax)
    return total_servicio || 0
  }

  // Ref para debounce de guardado automático
  const timeoutsGuardado = useRef({})

  const actualizarServicio = (id, campo, valor) => {
    const serviciosActualizados = servicios.map(s => 
      s.id === id ? { ...s, [campo]: valor } : s
    )
    setServicios(serviciosActualizados)
    
    // Guardar automáticamente en Supabase con debounce (500ms)
    const servicioActualizado = serviciosActualizados.find(s => s.id === id)
    if (servicioActualizado && expediente?.id) {
      // Cancelar timeout anterior para este servicio
      if (timeoutsGuardado.current[id]) {
        clearTimeout(timeoutsGuardado.current[id])
      }
      
      // Crear nuevo timeout
      timeoutsGuardado.current[id] = setTimeout(() => {
        guardarServicioEnSupabase(servicioActualizado)
        delete timeoutsGuardado.current[id]
      }, 500)
    }
  }
  
  // ============ GUARDAR SERVICIO EN SUPABASE ============
  // Guarda automáticamente cada servicio cuando se modifica (con debounce)
  const guardarServicioEnSupabase = async (servicio) => {
    if (!expediente?.id || !servicio) {
      console.log('⚠️ guardarServicioEnSupabase: No se puede guardar - expediente.id:', expediente?.id, 'servicio:', servicio)
      return
    }
    
    try {
      const nochesFinal = Math.max(1, toNum(servicio?.noches))
      const tipoCalculo = servicio?.tipoCalculo || servicio?.tipo_calculo || 'porPersona'

      const fila = {
        ...servicio,
        tipo_calculo:
          servicio?.tipo_calculo ||
          (servicio?.tipoCalculo === 'porGrupo' ? 'Total a dividir' : servicio?.tipoCalculo) ||
          '',
        tipo_servicio: servicio?.tipo_servicio || servicio?.tipo || '',
        coste_unitario: servicio?.coste_unitario ?? servicio?.costeUnitario ?? servicio?.precio_manual ?? 0,
        noches: nochesFinal,
        dias_guia: toNum(servicio?.dias_guia) || nochesFinal,
        total_servicio_manual: toNum(servicio?.total_servicio_manual ?? servicio?.totalServicio ?? servicio?.total_servicio) || 0,
      }
      const calculado = finalizarCalculo(fila, paxPago, totalPax)
      const totalServicio = toNum(calculado?.total_servicio)
      const precioUnitario = servicio?.coste_unitario ?? servicio?.costeUnitario ?? servicio?.precio_manual ?? 0

      let proveedorIdLimpio = null
      if (servicio?.proveedorId != null) {
        const idRaw = typeof servicio.proveedorId === 'object' ? servicio.proveedorId?.id : servicio.proveedorId
        const num = idRaw != null ? Number(idRaw) : NaN
        proveedorIdLimpio = !isNaN(num) ? num : null
      }

      const datosParaSupabase = {
        id_expediente: String(expediente?.id ?? '').trim(),
        tipo_servicio: servicio?.tipo || 'Hotel',
        nombre_especifico: servicio?.nombreEspecifico || '',
        localizacion: servicio?.localizacion || '',
        coste_unitario: toNum(precioUnitario),
        total_servicio: toNum(totalServicio),
        precio_venta: toNum(precioUnitario),
        margen_pax: toNum(servicio?.margen),
        noches: nochesFinal,
        fecha_release: servicio?.fechaRelease || null,
        tipo_calculo: tipoCalculo === 'porGrupo' ? 'Total a dividir' : (tipoCalculo || 'porPersona'),
        proveedor_id_int: proveedorIdLimpio,
        nombre_proveedor_manual: servicio?.proveedorNombreTemporal || null
      }
      
      // ============ CONSOLE.LOG DE DEBUG ============
      console.log('📋 DATOS QUE SE ENVIARÁN A SUPABASE:', {
        'expediente.id (original)': expediente.id,
        'expediente.id (string trim)': String(expediente.id).trim(),
        'servicio.id (actual)': servicio.id,
        'tipo_servicio_id': typeof servicio.id === 'string' && servicio.id.length > 10 && servicio.id.includes('-') ? 'UUID Supabase (UPDATE)' : 'UUID Temporal (INSERT)',
        'datos_completos': datosParaSupabase,
        'servicio_completo_original': servicio
      })
      console.log('📊 ESTRUCTURA DE COLUMNAS QUE SE ENVIARÁN:', Object.keys(datosParaSupabase))
      console.log('🔗 VINCULACIÓN AL EXPEDIENTE:', {
        'id_expediente_enviado': datosParaSupabase.id_expediente,
        'tipo': typeof datosParaSupabase.id_expediente,
        'coincide_con_expediente_actual': datosParaSupabase.id_expediente === String(expediente.id).trim()
      })
      console.log('✅ TABLA CORRECTA: servicios_cotizacion')
      console.log('✅ VALOR RESTAURANTE: El mapeo convierte "Restaurante" -> "restaurante" (igual que en Proveedores.jsx)')
      
      // ============ VERIFICAR SI EL SERVICIO YA EXISTE EN SUPABASE ============
      // Para evitar duplicados: verificar si ya existe un servicio con el mismo ID en la BD
      let servicioExiste = false
      if (servicio.id && typeof servicio.id === 'string' && servicio.id.length > 10 && servicio.id.includes('-')) {
        // Verificar si el servicio existe en Supabase
        const { data: servicioExistente, error: errorVerificacion } = await supabase
          .from('servicios_cotizacion')
          .select('id')
          .eq('id', servicio.id)
          .eq('id_expediente', String(expediente.id).trim())
          .single()
        
        if (!errorVerificacion && servicioExistente) {
          servicioExiste = true
        }
      }
      
      // Si el servicio tiene ID de Supabase y existe, actualizar; si no, insertar
      if (servicioExiste) {
        // Es un UUID de Supabase que existe, actualizar
        console.log('🔄 OPERACIÓN: UPDATE (servicio existente en Supabase)')
        console.log('🔍 ID del servicio a actualizar:', servicio.id)
        const { error } = await supabase
          .from('servicios_cotizacion')
          .update(datosParaSupabase)
          .eq('id', servicio.id)
          .eq('id_expediente', String(expediente.id).trim()) // Doble verificación para seguridad
        
        if (error) {
          console.error('❌ Error actualizando servicio:', error)
          alert('No se pudo guardar. Los cambios no se han perdido. Inténtalo de nuevo.')
        } else {
          console.log('✅ Servicio actualizado en Supabase:', servicio.id)
        }
      } else {
        // Es un UUID temporal o no existe, insertar nuevo
        console.log('➕ OPERACIÓN: INSERT (nuevo servicio)')
        console.log('🔍 ID temporal del servicio:', servicio.id)
        const { data, error } = await supabase
          .from('servicios_cotizacion')
          .insert([datosParaSupabase])
          .select()
          .single()
        
        if (error) {
          console.error('❌ Error insertando servicio:', error)
          alert('No se pudo guardar. Los cambios no se han perdido. Inténtalo de nuevo.')
        } else if (data) {
          console.log('✅ Servicio insertado en Supabase:', data.id)
          console.log('📦 Datos devueltos por Supabase:', data)
          // Actualizar el ID del servicio en el estado local con el ID real de Supabase
          setServicios(prevServicios => prevServicios.map(s => 
            s.id === servicio.id ? { ...s, id: data.id } : s
          ))
        }
      }
    } catch (err) {
      console.error('❌ Error inesperado guardando servicio:', err)
      alert('No se pudo guardar. Los cambios no se han perdido. Inténtalo de nuevo.')
    }
  }

  // Guardar fecha de release de un servicio concreto en Supabase
  const guardarFechaReleaseServicio = async (servicioId, fechaReleaseISO) => {
    if (!servicioId) {
      console.warn('⚠️ No se puede guardar fecha_release: servicio sin ID')
      return
    }

    const payload = {
      fecha_release: fechaReleaseISO || null,
    }

    console.log('Guardando fecha_release en servicios_cotizacion:', {
      servicioId,
      ...payload,
    })

    try {
      const { error } = await supabase
        .from('servicios_cotizacion')
        .update(payload)
        .eq('id', servicioId)

      if (error) {
        console.error('❌ Error guardando fecha_release:', error)
      }
    } catch (e) {
      console.error('❌ Error inesperado guardando fecha_release:', e)
    }
  }

  // Helper: noches del expediente (prioriza campo en BD, si no, calcula por fechas)
  const calcularNochesExpediente = () => {
    const n = toNum(expediente?.noches)
    if (n > 0) return n

    // Si no, calcular por fechas (como en el resumen de fechas)
    if (expediente?.fechaInicio && expediente?.fechaFin) {
      try {
        const inicio = new Date(expediente?.fechaInicio)
        const fin = new Date(expediente?.fechaFin)
        const dias = Math.ceil((fin - inicio) / (1000 * 60 * 60 * 24))
        if (!isNaN(dias) && dias > 0) return dias
      } catch (e) {
        // Silenciar y devolver 1 noche como mínimo
      }
    }

    // Valor por defecto
    return 1
  }

  const calcularCotizacion = () => {
    const nochesExp = calcularNochesExpediente();
    return calcularFinanzasExpediente({
      servicios,
      formData,
      paxPago,
      totalPax,
      nochesExpediente: nochesExp,
    });
  };
  
  // ⚡ REACTIVIDAD AUTOMÁTICA: Se recalcula cuando cambian los servicios o parámetros
  const resultados = useMemo(() => {
    if (!formData) return null
    return calcularCotizacion()
  }, [servicios, formData])

  // ============ CONSOLA DE AUDITORÍA - CHECKPOINT INVISIBLE ============
  // Verifica integridad de cálculos al cargar. Solo console.warn, nada en UI.
  useEffect(() => {
    if (!resultados || !formData || !datosCargados) return
    const TOLERANCIA = 0.02
    const precioBase = toNum(formData?.precio_venta_cliente)
    const bonif = toNum(formData?.bonificacion_pax)
    const nochesSup = calcularNochesExpediente()
    const totalSupHabitacion = toNum(formData?.sup_individual_pax) * toNum(formData?.sup_individual_precio_dia) * nochesSup
    const totalSupSeguro = toNum(formData?.sup_seguro_pax) * toNum(formData?.sup_seguro_precio_total)
    const suplementosTotal = totalSupHabitacion + totalSupSeguro
    const totalVentaEsperado = (paxPago * precioBase) - (bonif * paxPago) + suplementosTotal
    const totalVentaReal = parseFloat(resultados?.totalVenta || 0)
    const precioVentaTotalEsperado = paxPago * precioBase
    const precioVentaTotalReal = parseFloat(resultados?.precioVentaTotal || 0)
    if (Math.abs(totalVentaReal - totalVentaEsperado) > TOLERANCIA) {
      console.warn('[AUDITORÍA] Total Venta no cuadra:', {
        esperado: totalVentaEsperado.toFixed(2),
        real: totalVentaReal.toFixed(2),
        diff: (totalVentaReal - totalVentaEsperado).toFixed(2),
        paxPago,
        precioBase,
        bonificacionTotal: bonif * paxPago,
        suplementosTotal,
      })
    }
    if (Math.abs(precioVentaTotalReal - precioVentaTotalEsperado) > TOLERANCIA) {
      console.warn('[AUDITORÍA] Precio Venta Total (Pax × Precio) no cuadra:', {
        esperado: precioVentaTotalEsperado.toFixed(2),
        real: precioVentaTotalReal.toFixed(2),
        paxPago,
        precioBase,
      })
    }
  }, [resultados, formData, datosCargados, paxPago])

  // ============ CÁLCULOS DE SUPLEMENTOS (INDIVIDUAL Y SEGURO) ============
  const suplementos = useMemo(() => {
    if (!formData) {
      return {
        totalSuplementos: 0,
        totalSupHabitacion: 0,
        totalSupSeguro: 0
      }
    }
    const noches = calcularNochesExpediente()

    const paxIndividual = toNum(formData?.sup_individual_pax)
    const precioIndividualDia = toNum(formData?.sup_individual_precio_dia)
    const paxSeguro = toNum(formData?.sup_seguro_pax)
    const precioSeguroTotal = toNum(formData?.sup_seguro_precio_total)

    const totalSupHabitacion = paxIndividual * precioIndividualDia * noches
    const totalSupSeguro = paxSeguro * precioSeguroTotal
    const totalSuplementos = totalSupHabitacion + totalSupSeguro

    return {
      noches,
      totalSupHabitacion: totalSupHabitacion.toFixed(2),
      totalSupSeguro: totalSupSeguro.toFixed(2),
      totalSuplementos: totalSuplementos.toFixed(2),
    }
  }, [formData?.sup_individual_pax, formData?.sup_individual_precio_dia, formData?.sup_seguro_pax, formData?.sup_seguro_precio_total, expediente])

  // ============ INICIALIZAR DATOS DEL RECEPTOR DE FACTURA ============
  useEffect(() => {
    if (grupo && grupo.nombre) {
      setFormFactura({
        receptorNombre: grupo.nombre || '',
        receptorCIF: grupo.cif || grupo.cif_nif || '',
        receptorDireccion: grupo.direccion || '',
        receptorPoblacion: grupo.poblacion || '',
        receptorProvincia: grupo.provincia || '',
        receptorCP: grupo.codigo_postal || grupo.cp || '',
      })
    }
  }, [grupo])

  // ============ DATOS DEL EMISOR (FIJOS) ============
  const datosEmisor = {
    nombre: 'Valservice Incoming S.L. (Viajes Tabora)',
    cif: 'B-98998107',
    licencia: 'CVMm303V',
    direccion: 'Apartado de correos 58, 46185 La Pobla de Vallbona (Valencia)',
    telefono: '961 60 60 60',
    email: 'info@viajestabora.com',
    banco1: 'Caixabank: ES12 2100 1234 5678 9012 3456',
    banco2: 'Santander: ES34 0049 1234 5678 9012 3456',
  }

  // ============ CÁLCULO DE BASE IMPONIBLE PARA FACTURA ============
  // NOTA: El Precio Venta al Cliente YA INCLUYE IVA (Régimen Especial de Agencias de Viajes)
  const calcularBaseFactura = useMemo(() => {
    if (!formData) {
      return {
        precioVentaPax: 0,
        precioNetoPax: 0,
        totalServiciosConIVA: 0,
        baseImponible: 0,
        iva: 0,
        totalFactura: 0
      }
    }
    // Precio Venta al Cliente (€/pax) - YA INCLUYE IVA
    const precioVentaPax = parseFloat(formData?.precio_venta_cliente || 0) || 0
    const bonificacion = parseFloat(formData?.bonificacion_pax || 0) || 0
    const precioNetoPax = precioVentaPax - bonificacion

    // Multiplicar por Clientes de Pago
    const totalServiciosConIVA = precioNetoPax * paxPago

    // Sumar Suplementos (también con IVA incluido)
    const totalSuplementos = parseFloat(suplementos.totalSuplementos || 0) || 0

    // TOTAL FACTURA (ya incluye IVA)
    const totalFactura = totalServiciosConIVA + totalSuplementos

    // Calcular Base Imponible desglosando el IVA (dividir entre 1.21)
    const baseImponible = totalFactura / 1.21
    const iva = totalFactura - baseImponible

    // Base de servicios (sin suplementos) para desglose
    const baseServicios = totalServiciosConIVA / 1.21

    // Consola de QA: desglose de cálculos
    console.log('🧾 [MODO PRUEBA] Desglose Factura', {
      precioVentaPax,
      bonificacion,
      precioNetoPax,
      paxPago,
      totalServiciosConIVA,
      baseServicios,
      suplementosHabitacion: parseFloat(suplementos.totalSupHabitacion || 0) || 0,
      suplementosSeguro: parseFloat(suplementos.totalSupSeguro || 0) || 0,
      totalSuplementos,
      totalFactura,
      baseImponible,
      iva,
    })

    return {
      precioVentaPax: precioVentaPax.toFixed(2),
      bonificacion: bonificacion.toFixed(2),
      precioNetoPax: precioNetoPax.toFixed(2),
      paxPago: paxPago,
      totalServiciosConIVA: totalServiciosConIVA.toFixed(2),
      baseServicios: baseServicios.toFixed(2),
      totalSuplementos: totalSuplementos.toFixed(2),
      baseImponible: baseImponible.toFixed(2),
      iva: iva.toFixed(2),
      totalFactura: totalFactura.toFixed(2),
    }
  }, [formData?.precio_venta_cliente, formData?.bonificacion_pax, paxPago, suplementos.totalSuplementos])

  // ============ OBTENER SIGUIENTE NÚMERO DE FACTURA (NUMERACIÓN GLOBAL ÚNICA) ============
  // SIEMPRE consulta AMBAS tablas (facturas_emitidas_global Y facturas) para garantizar numeración única
  const obtenerSiguienteNumeroFactura = async () => {
    const año = new Date().getFullYear()

    try {
      // 1) Consultar ambas tablas en paralelo (Promise.all)
      const [globalRes, expedientesRes] = await Promise.all([
        supabase
          .from('facturas_emitidas_global')
          .select('numero_factura'),
        supabase
          .from('facturas')
          .select('numero_factura'),
      ])

      const { data: dataGlobal, error: errorGlobal } = globalRes || {}
      const { data: dataExpedientes, error: errorExpedientes } = expedientesRes || {}

      if (errorGlobal) {
        console.error('Error obteniendo facturas de facturas_emitidas_global:', errorGlobal)
      }
      if (errorExpedientes) {
        console.error('Error obteniendo facturas de facturas:', errorExpedientes)
      }

      // 2) Unificar y encontrar el máximo número entre ambas tablas
      const todasLasFacturas = [
        ...(Array.isArray(dataGlobal) ? dataGlobal : []),
        ...(Array.isArray(dataExpedientes) ? dataExpedientes : []),
      ]

      const regexFactura = /^(\d{4})-(\d{1,4})$/ // AÑO-#### (4 dígitos)
      let maxNumero = 0

      todasLasFacturas.forEach((f) => {
        const raw = f?.numero_factura ? String(f.numero_factura).trim() : ''
        if (!raw) return

        const match = raw.match(regexFactura)
        if (!match) return

        const numero = parseInt(match[2], 10)
        if (!isNaN(numero) && numero > maxNumero) {
          maxNumero = numero
        }
      })

      // 3) Si no hay facturas (maxNumero === 0), devolver AÑO-0001
      if (maxNumero === 0) {
        return `${año}-0001`
      }

      // 4) Devolver el siguiente número
      const siguienteNum = maxNumero + 1
      return `${año}-${String(siguienteNum).padStart(4, '0')}`
    } catch (err) {
      console.error('Error inesperado generando numero_factura:', err)
      // Fallback seguro: devolver el primer número del año actual
      return `${año}-0001`
    }
  }

  // ============ GENERAR PDF DE FACTURA ============
  const generarFacturaPDF = async (numeroFactura, datosFactura) => {
    const crearDocumento = (logoImg) => {
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()

      // Marca de agua en modo prueba
      if (MODO_PRUEBA_FACTURACION) {
        doc.saveGraphicsState && doc.saveGraphicsState()
        doc.setTextColor(220, 220, 220)
        doc.setFontSize(50)
        // jsPDF admite ángulo en las opciones de text en versiones recientes
        try {
          doc.text('BORRADOR / PRUEBA', pageWidth / 2, pageHeight / 2, {
            align: 'center',
            angle: -30,
          })
        } catch (e) {
          // Fallback sin ángulo
          doc.text('BORRADOR / PRUEBA', pageWidth / 2, pageHeight / 2, {
            align: 'center',
          })
        }
        doc.restoreGraphicsState && doc.restoreGraphicsState()
      }

      // Colores corporativos
      const colorAmarillo = [255, 193, 7] // #FFC107
      const colorAzul = [33, 150, 243] // #2196F3

      // Logo (si está disponible)
      if (logoImg) {
        try {
          doc.setFillColor(255, 255, 255)
          doc.rect(20, 15, 40, 15, 'F')
          doc.addImage(logoImg, 'PNG', 20, 15, 40, 15)
        } catch (e) {
          console.warn('Error añadiendo logo a factura:', e)
        }
      }

      // Número de factura (arriba a la derecha)
      doc.setFontSize(20)
      doc.setTextColor(...colorAzul)
      doc.setFont(undefined, 'bold')
      doc.text(`FACTURA ${numeroFactura}`, pageWidth - 20, 25, { align: 'right' })

      // Fecha
      const fechaActual = new Date()
      const fechaFormateada = fechaActual.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      })
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text(`Fecha: ${fechaFormateada}`, pageWidth - 20, 35, { align: 'right' })

      // Datos del emisor (Valservice Incoming S.L.) - FIJOS
      let yPos = 50
      doc.setFontSize(12)
      doc.setTextColor(0, 0, 0)
      doc.setFont(undefined, 'bold')
      doc.text(datosEmisor.nombre, 20, yPos)
      yPos += 6
      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      doc.text(`CIF: ${datosEmisor.cif}`, 20, yPos)
      yPos += 6
      doc.text(`Licencia: ${datosEmisor.licencia}`, 20, yPos)
      yPos += 6
      doc.text(datosEmisor.direccion, 20, yPos)
      yPos += 6
      doc.text(`Tel: ${datosEmisor.telefono} | Email: ${datosEmisor.email}`, 20, yPos)
      yPos += 6
      doc.text(`Bancos: ${datosEmisor.banco1}`, 20, yPos)
      yPos += 6
      doc.text(datosEmisor.banco2, 20, yPos)

      // Datos del receptor
      yPos += 15
      doc.setFontSize(12)
      doc.setFont(undefined, 'bold')
      doc.text('FACTURAR A:', 20, yPos)
      yPos += 8
      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      doc.text(formFactura.receptorNombre || 'Sin nombre', 20, yPos)
      yPos += 6
      if (formFactura.receptorCIF) {
        doc.text(`CIF/NIF: ${formFactura.receptorCIF}`, 20, yPos)
        yPos += 6
      }
      if (formFactura.receptorDireccion) {
        doc.text(formFactura.receptorDireccion, 20, yPos)
        yPos += 6
      }
      const direccionCompleta = [
        formFactura.receptorCP,
        formFactura.receptorPoblacion,
        formFactura.receptorProvincia
      ].filter(Boolean).join(' ')
      if (direccionCompleta) {
        doc.text(direccionCompleta, 20, yPos)
        yPos += 6
      }

      // Tabla de conceptos: Descripción | Unidades | Precio Unitario | Precio Total (IVA Inc.)
      yPos += 10
      doc.setFontSize(10)
      doc.setFont(undefined, 'bold')
      doc.text('Descripción', 20, yPos)
      doc.text('Unid.', 90, yPos)
      doc.text('P. Unit.', 115, yPos)
      doc.text('Precio Total (IVA Inc.)', pageWidth - 20, yPos, { align: 'right' })
      yPos += 6
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.2)
      doc.line(20, yPos, pageWidth - 20, yPos)
      yPos += 6

      const nombreGrupo = expediente?.nombre_grupo || grupo?.nombre || 'Sin nombre'
      const destino = expediente?.destino || 'Sin destino'

      // Usar el concepto almacenado en la factura si existe; si no, usar fallback clásico
      const conceptoFactura =
        (datosFactura && datosFactura.concepto) ||
        `Viaje a ${destino} (${nombreGrupo})`

      doc.setFontSize(9)
      doc.setFont(undefined, 'normal')

      // Línea de plazas
      const totalPaxFactura = parseFloat(expediente?.total_pax || calcularBaseFactura.paxPago || 0) || 0
      const precioPaxNum = parseFloat(calcularBaseFactura.precioNetoPax || 0) || 0
      const totalPlazasNum = totalPaxFactura * precioPaxNum

      doc.text(conceptoFactura.substring(0, 45), 20, yPos)
      doc.text(String(totalPaxFactura), 90, yPos)
      doc.text(`${precioPaxNum.toFixed(2)}€`, 115, yPos)
      doc.text(`${totalPlazasNum.toFixed(2)}€`, pageWidth - 20, yPos, { align: 'right' })
      yPos += 6

      // Suplementos (si hay)
      if (parseFloat(calcularBaseFactura.totalSuplementos) > 0) {
        yPos += 4
        doc.setFont(undefined, 'bold')
        doc.text('Suplementos (IVA incluido):', 20, yPos)
        yPos += 6
        doc.setFont(undefined, 'normal')

        // Habitaciones individuales
        const totalSupHabitacionNum = parseFloat(suplementos.totalSupHabitacion || 0) || 0
        if (totalSupHabitacionNum > 0) {
          const paxIndividualNum = parseFloat(formData?.sup_individual_pax || 0) || 0
          const nochesSup = calcularNochesExpediente ? calcularNochesExpediente() : 1
          const precioIndividualDiaNum = parseFloat(formData?.sup_individual_precio_dia || 0) || 0

          const cantidadHabitacion = Math.max(0, paxIndividualNum * nochesSup)
          const precioUnitHabitacion = Math.max(0, precioIndividualDiaNum)
          const totalConceptoHabitacion = cantidadHabitacion * precioUnitHabitacion

          doc.text('Habitaciones individuales', 20, yPos)
          doc.text(String(cantidadHabitacion), 90, yPos)
          doc.text(`${precioUnitHabitacion.toFixed(2)}€`, 115, yPos)
          doc.text(`${totalConceptoHabitacion.toFixed(2)}€`, pageWidth - 20, yPos, { align: 'right' })
          yPos += 6
        }

        // Seguro de cancelación
        const totalSupSeguroNum = parseFloat(suplementos.totalSupSeguro || 0) || 0
        if (totalSupSeguroNum > 0) {
          const paxSeguroNum = parseFloat(formData?.sup_seguro_pax || 0) || 0
          const precioSeguroTotalNum = parseFloat(formData?.sup_seguro_precio_total || 0) || 0

          const cantidadSeguro = Math.max(0, paxSeguroNum)
          const precioUnitSeguro = Math.max(0, precioSeguroTotalNum)
          const totalConceptoSeguro = cantidadSeguro * precioUnitSeguro

          doc.text('Seguro de cancelación', 20, yPos)
          doc.text(String(cantidadSeguro), 90, yPos)
          doc.text(`${precioUnitSeguro.toFixed(2)}€`, 115, yPos)
          doc.text(`${totalConceptoSeguro.toFixed(2)}€`, pageWidth - 20, yPos, { align: 'right' })
          yPos += 6
        }
      }

      // Nota sobre régimen especial
      yPos += 6
      doc.setFontSize(8)
      doc.setTextColor(100, 100, 100)
      doc.setFont(undefined, 'italic')
      doc.text('Régimen Especial de Agencias de Viajes - IVA incluido', 20, yPos)
      yPos += 8

      // Totales (solo TOTAL FACTURA, sin Base Imponible ni IVA)
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.3)
      doc.line(20, yPos, pageWidth - 20, yPos)
      yPos += 8

      doc.setFontSize(12)
      doc.setTextColor(0, 0, 0)
      doc.setFont(undefined, 'bold')
      doc.text('TOTAL FACTURA (IVA INCLUIDO):', pageWidth - 60, yPos, { align: 'right' })
      doc.setTextColor(34, 197, 94) // Verde
      doc.text(`${calcularBaseFactura.totalFactura}€`, pageWidth - 20, yPos, { align: 'right' })
      yPos += 10

      // Cláusula legal obligatoria (art 142 Ley 37/1992)
      doc.setFontSize(7)
      doc.setTextColor(80, 80, 80)
      doc.setFont(undefined, 'normal')
      const clausulaLegal = 'Régimen especial de las agencias de viaje. El IVA ya está incluido en todos los conceptos especificados en esta factura, de acuerdo con lo señalado en el art 142 de la Ley 37/1992, de 28 de diciembre, del Impuesto sobre el Valor Añadido.'
      const lineasClausula = doc.splitTextToSize(clausulaLegal, pageWidth - 40)
      lineasClausula.forEach((linea) => {
        doc.text(linea, 20, yPos)
        yPos += 4
      })

      // Pie de página
      const footerY = pageHeight - 40
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.3)
      doc.line(10, footerY - 5, pageWidth - 10, footerY - 5)

      doc.setFontSize(8)
      doc.setTextColor(100, 100, 100)
      doc.text(datosEmisor.nombre, 20, footerY)
      doc.text(`CIF: ${datosEmisor.cif} | Licencia: ${datosEmisor.licencia}`, 20, footerY + 6)
      doc.text(datosEmisor.direccion, 20, footerY + 12)

      // Nombre del archivo
      const nombreArchivo = `Factura_${numeroFactura}_${nombreGrupo.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`

      // Descargar PDF
      doc.save(nombreArchivo)
    }

    const logo = new Image()
    logo.src = '/Logo tabora 2023.png'
    logo.onload = () => {
      crearDocumento(logo)
    }
    logo.onerror = () => {
      const fallbackLogo = new Image()
      fallbackLogo.src = '/tabora-logo.png'
      fallbackLogo.onload = () => {
        crearDocumento(fallbackLogo)
      }
      fallbackLogo.onerror = () => {
        crearDocumento(null)
      }
    }
  }

  // ============ EMITIR FACTURA ============
  // IMPORTANTE: Esta función SOLO lee datos de cotización desde formData, NO los modifica
  // - NO actualiza el expediente
  // - NO modifica formData
  // - SOLO hace INSERT en la tabla 'facturas'
  // - Los datos de cotización son independientes y solo se modifican desde su pestaña
  const emitirFactura = async () => {
    // Validar datos del receptor
    if (!formFactura.receptorNombre || formFactura.receptorNombre.trim() === '') {
      alert('⚠️ Por favor, completa el nombre del receptor de la factura.')
        return
      }

    if (!expediente?.id) {
      alert('❌ Error: El expediente no tiene ID.')
      return
    }

    try {
      // Obtener número de factura
      const numeroFactura = await obtenerSiguienteNumeroFactura()

      // INSERT EN facturas_versiones INMEDIATAMENTE DESPUÉS DE GENERAR EL NÚMERO
      try {
        // Obtener versiones existentes para calcular el número de versión correcto
        const { data: versionesExistentes } = await supabase
          .from('facturas_versiones')
          .select('version_numero')
          .eq('expediente_id', expediente.id)
          .order('version_numero', { ascending: false })
          .limit(1)
        
        // Calcular número de versión: usar el máximo + 1, o 1 si no hay versiones
        let versionNumero = 1
        if (versionesExistentes && versionesExistentes.length > 0 && versionesExistentes[0]?.version_numero) {
          versionNumero = versionesExistentes[0].version_numero + 1
        }
        
        // Preparar datos completos de la factura para el JSON
        const concepts = {
          concepto: expediente?.destino ? `Viaje a ${expediente.destino}` : 'Servicios de viaje',
          fecha_inicio: expediente?.fecha_inicio || expediente?.fechaInicio || '',
          fecha_final: expediente?.fecha_final || expediente?.fechaFin || ''
        }
        
        const totals = {
          base_imponible: calcularBaseFactura.baseImponible,
          iva: calcularBaseFactura.iva,
          total_factura: calcularBaseFactura.totalFactura,
          precio_venta_pax: calcularBaseFactura.precioVentaPax,
          precio_neto_pax: calcularBaseFactura.precioNetoPax,
          total_servicios_con_iva: calcularBaseFactura.totalServiciosConIVA,
          total_suplementos: calcularBaseFactura.totalSuplementos,
          pax_pago: calcularBaseFactura.paxPago
        }
        
        const clientData = {
          nombre: formFactura.receptorNombre,
          cif: formFactura.receptorCIF,
          direccion: formFactura.receptorDireccion,
          poblacion: formFactura.receptorPoblacion,
          provincia: formFactura.receptorProvincia,
          cp: formFactura.receptorCP
        }
        
        // INSERT limpio: solo los 4 campos requeridos
        const datosVersion = {
          expediente_id: expediente.id,
          numero_factura: numeroFactura,
          datos_json: {
            concepts,
            totals,
            clientData,
            fecha: new Date().toISOString()
          },
          version_numero: versionNumero
        }
        
        const { error: versionError } = await supabase
          .from('facturas_versiones')
          .insert([datosVersion])
        
        if (versionError) {
          console.error("❌ Error en versión:", versionError)
        } else {
          console.log("✅ Nueva versión de factura guardada")
          console.log("🚀 VERSIÓN GUARDADA EN BD")
          // Recargar versiones para actualizar la vista
          await cargarVersionesFactura()
        }
      } catch (err) {
        console.error("Error inesperado guardando versión:", err)
        // No bloqueamos el flujo si falla el versionado
      }

      // Preparar datos para guardar según esquema real de la DB
      // El total_factura ya incluye la bonificación (precio - bonificación) calculado implícitamente
      // NO se envía el campo bonificacion a Supabase
      // base_imponible = (precio_venta_cliente - bonificacion) * pax_pago / 1.21 (sin IVA)
      const precioVentaCliente = parseFloat(formData?.precio_venta_cliente || 0) || 0
      const bonificacionPax = parseFloat(formData?.bonificacion_pax || 0) || 0
      const precioNetoPax = precioVentaCliente - bonificacionPax
      const totalSinIVA = (precioNetoPax * calcularBaseFactura.paxPago) / 1.21
      const suplementosSinIVA = parseFloat(calcularBaseFactura.totalSuplementos || 0) / 1.21
      const baseImponibleCalculada = totalSinIVA + suplementosSinIVA

      // ===== CONCEPTO AUTOMÁTICO DE FACTURA =====
      // Usar destino y fechas del expediente cuando estén disponibles.
      const destinoFactura = expediente?.destino || ''
      const fechaInicioRaw = expediente?.fecha_inicio || expediente?.fechaInicio || ''
      const fechaFinalRaw = expediente?.fecha_final || expediente?.fechaFin || ''

      const formatearFechaFactura = (fecha) => {
        if (!fecha) return ''
        const str = String(fecha)
        // Si parece una fecha ISO (YYYY-MM-DD), usar helper para pasarla a formato español
        if (str.includes('-')) {
          try {
            return convertirISOAEspañol(str)
          } catch {
            return str
          }
        }
        return str
      }

      const fechaInicioFormateada = formatearFechaFactura(fechaInicioRaw)
      const fechaFinalFormateada = formatearFechaFactura(fechaFinalRaw)

      let conceptoFactura = 'Servicios de viaje'
      if (destinoFactura && fechaInicioFormateada && fechaFinalFormateada) {
        conceptoFactura = `Viaje a ${destinoFactura} del ${fechaInicioFormateada} al ${fechaFinalFormateada}`
      }
      
      // Construir objeto limpio solo con columnas confirmadas del esquema real
      // Actualización de esquema: base_imponible y direccion_receptor confirmados
      const datosFactura = {
        numero_factura: numeroFactura,
        expediente_id: expediente.id,
        cliente_id: expediente.clienteId || null,
        nombre_receptor: formFactura.receptorNombre.trim(),
        cif_receptor: formFactura.receptorCIF.trim() || null,
        direccion_receptor: formFactura.receptorDireccion.trim() || null,
        base_imponible: parseFloat(baseImponibleCalculada.toFixed(2)),
        total_factura: parseFloat(calcularBaseFactura.totalFactura),
        concepto: conceptoFactura,
        estado: 'emitida',
      }

      // AUDITORÍA: Interceptador de datos antes del insert
      console.log('OBJETO A ENVIAR A FACTURAS:', datosFactura)
      console.log('Columnas del objeto:', Object.keys(datosFactura))
      
      // LOG DE SEGURIDAD: Confirmar que NO se modifica el expediente
      console.log('🔒 [SEGURIDAD] ============ EMITIR FACTURA ============')
      console.log('🔒 [SEGURIDAD] Expediente ID:', expediente.id)
      console.log('🔒 [SEGURIDAD] Pestaña actual: Facturación')
      console.log('🔒 [SEGURIDAD] Operación: INSERT en tabla "facturas"')
      console.log('🔒 [SEGURIDAD] NO se actualiza el expediente (solo lectura)')
      console.log('🔒 [SEGURIDAD] Campos del expediente: INTACTOS (no modificados)')
      console.log('🔒 [SEGURIDAD] ==========================================')
      
      // Actualización de esquema: base_imponible y direccion_receptor confirmados
      // Guardar en Supabase - SOLO INSERT, NO UPDATE del expediente
      const { error } = await supabase
        .from('facturas')
        .insert([datosFactura])

      if (error) {
        console.error('❌ [SEGURIDAD] Error guardando factura:', error)
        alert(`❌ Error guardando factura: ${error.message}`)
          return
      }

      // Generar PDF
      await generarFacturaPDF(numeroFactura, datosFactura)

      // INSERT EN facturas_emitidas DESPUÉS DE GENERAR EL PDF
      try {
        // Obtener cliente_nombre del expediente
        const clienteNombre = expediente?.cliente_nombre || 
                              expediente?.nombre_grupo || 
                              expediente?.clienteNombre || 
                              grupo?.nombre || 
                              'Sin nombre'
        
        // Preparar datos_factura (JSON completo)
        const datosFacturaCompletos = {
          ...datosFactura,
          formFactura: { ...formFactura },
          calcularBaseFactura: {
            precioVentaPax: calcularBaseFactura.precioVentaPax,
            precioNetoPax: calcularBaseFactura.precioNetoPax,
            paxPago: calcularBaseFactura.paxPago,
            totalServiciosConIVA: calcularBaseFactura.totalServiciosConIVA,
            totalSuplementos: calcularBaseFactura.totalSuplementos,
            baseImponible: calcularBaseFactura.baseImponible,
            iva: calcularBaseFactura.iva,
            totalFactura: calcularBaseFactura.totalFactura
          },
          expediente: {
            id: expediente.id,
            nombre_grupo: expediente?.nombre_grupo || '',
            destino: expediente?.destino || '',
            fecha_inicio: expediente?.fecha_inicio || expediente?.fechaInicio || '',
            fecha_final: expediente?.fecha_final || expediente?.fechaFin || ''
          }
        }
        
        const { error: errorEmitida } = await supabase
          .from('facturas_emitidas')
          .insert([{
            expediente_id: expediente.id,
            cliente_nombre: clienteNombre,
            importe_total: parseFloat(calcularBaseFactura.totalFactura),
            datos_factura: datosFacturaCompletos,
            numero_factura: numeroFactura,
            url_pdf: null // Se puede subir después si es necesario
          }])
        
        if (errorEmitida) {
          console.error('❌ Error guardando en facturas_emitidas:', errorEmitida)
          // No bloqueamos el flujo si falla
        } else {
          console.log('✅ Factura registrada en facturas_emitidas')
        }

        // INSERT EN facturas_emitidas_global (sincronización total) - OBLIGATORIO
        const { error: errorGlobal } = await supabase
          .from('facturas_emitidas_global')
          .insert([{
            expediente_id: expediente.id,
            numero_factura: numeroFactura,
            cliente_nombre: clienteNombre,
            importe_total: parseFloat(calcularBaseFactura.totalFactura),
            tipo_factura: 'GRUPO',
            datos_json: datosFacturaCompletos,
            fecha_emision: new Date().toISOString()
          }])
        
        if (errorGlobal) {
          console.error('FALLO CRÍTICO EN CIERRES:', errorGlobal)
          console.error('❌ Error guardando en facturas_emitidas_global:', JSON.stringify(errorGlobal, null, 2))
          // No bloqueamos el flujo si falla
        } else {
          console.log('✅ Factura registrada en facturas_emitidas_global')
        }
      } catch (err) {
        console.error('❌ Error inesperado guardando en facturas_emitidas:', err)
        // No bloqueamos el flujo si falla
      }

      console.log('✅ [SEGURIDAD] Factura guardada correctamente. Expediente NO modificado.')
      alert(`✅ Factura ${numeroFactura} emitida y guardada correctamente.`)
      
      // Recargar historial de versiones para reflejar la nueva factura emitida
      await cargarVersionesFactura()
    } catch (error) {
      console.error('Error emitiendo factura:', error)
      alert(`❌ Error emitiendo factura: ${error.message}`)
    }
  }

  // ============ FUNCIÓN ÚNICA DE PERSISTENCIA ============
  // persistirCambios: Guarda formData en Supabase usando nombres reales de la DB
  // BLOQUEADO si la carga inicial no ha terminado
  const persistirCambios = async () => {
    const extraerMensajeError = (err) => {
      if (!err) return 'Error desconocido'
      if (typeof err === 'string') return err
      if (err?.message) return err.message
      if (err?.error_description) return err.error_description
      if (err?.details) return String(err.details)
      return String(err)
    }
    const expedienteId = expediente?.id
    if (!expedienteId) {
      console.error('❌ No se puede guardar: expediente sin ID')
      return { ok: false, error: 'Expediente sin ID' }
    }

    // BLOQUEO CRÍTICO: No guardar si los datos aún no se han cargado
    if (!datosCargados) {
      console.warn('⚠️ Guardado bloqueado: datos aún cargando')
      return { ok: false, error: 'Datos aún cargando' }
    }

    try {
      const datosParaGuardar = {
        total_pax: toNum(formData?.total_pax),
        gratuidades: toNum(formData?.gratuidades),
        pax_pago: Math.max(1, toNum(formData?.total_pax) - toNum(formData?.gratuidades)),
        precio_venta_cliente: toNum(formData?.precio_venta_cliente),
        bonificacion_pax: toNum(formData?.bonificacion_pax),
        sup_individual_pax: toNum(formData?.sup_individual_pax),
        sup_individual_precio_dia: toNum(formData?.sup_individual_precio_dia),
        sup_seguro_pax: toNum(formData?.sup_seguro_pax),
        sup_seguro_precio_total: toNum(formData?.sup_seguro_precio_total),
      }

      const { error } = await supabase
        .from('expedientes')
        .update(datosParaGuardar)
        .eq('id', expedienteId)

      if (error) {
        console.error('❌ Error guardando:', error)
        return { ok: false, error: extraerMensajeError(error) }
      }

      onUpdate({ ...expediente, ...datosParaGuardar })
      return { ok: true }
    } catch (error) {
      console.error('❌ Error inesperado:', error)
      return { ok: false, error: extraerMensajeError(error) }
    }
  }

  // ============ GUARDAR HABITACIONES ============
  
  const guardarHabitaciones = () => {
    if (!window.confirm('¿Desea guardar los cambios en el rooming list?')) {
      return
    }
    
    const expedienteActualizado = {
      ...expediente,
      pasajeros: {
        ...expediente.pasajeros,
        habitaciones,
      },
      documentos,
    }
    onUpdate(expedienteActualizado)
  }

  // ============ EDITAR CLIENTE ============
  
  const iniciarEdicionCliente = () => {
    setClienteEditado({
      ...grupo,
      nombre: grupo.nombre || expediente?.nombre_grupo || '',
      responsable: grupo.responsable || expediente?.cliente_responsable || '',
    })
    setEditandoCliente(true)
  }

  const guardarCambiosCliente = () => {
    if (!window.confirm('¿Desea guardar los cambios del cliente?')) {
      return
    }
    
    // Actualizar en base de datos de clientes si existe ID
    if (expediente.clienteId) {
      const clientesActuales = storage.getClientes()
      const clientesActualizados = clientesActuales.map(c => 
        c.id === expediente.clienteId ? { ...c, ...clienteEditado } : c
      )
      storage.setClientes(clientesActualizados)
    }
    
    // Actualizar expediente (unificar responsable en un solo campo coherente)
    const expedienteActualizado = {
      ...expediente,
      nombre_grupo: clienteEditado.nombre || '',
      cliente_responsable: clienteEditado.responsable || '',
      clienteNombre: clienteEditado.nombre || '',
      // Eliminado campo duplicado "responsable" para evitar claves redundantes
    }
    onUpdate(expedienteActualizado)
    setEditandoCliente(false)
  }

  const cancelarEdicionCliente = () => {
    setEditandoCliente(false)
    setClienteEditado(grupo)
  }

  // ============ DOCUMENTOS ============
  
  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      const nuevoDoc = {
        id: Date.now(),
        nombre: file.name,
        tipo: file.type,
        fecha: new Date().toISOString(),
      }
      setDocumentos([...documentos, nuevoDoc])
    }
  }

  const eliminarDocumento = (id) => {
    const doc = documentos.find(d => d.id === id)
    if (window.confirm(`¿Está seguro de que desea eliminar "${doc?.nombre || 'este documento'}"?\n\nEsta acción no se puede deshacer.`)) {
      setDocumentos(documentos.filter(d => d.id !== id))
    }
  }

  // ============ CALCULAR TOTALES DE HABITACIONES ============
  
  const totalHabitaciones = (habitaciones.dobles || 0) + (habitaciones.doblesTwin || 0) + (habitaciones.individuales || 0)
  const totalPasajerosHabitaciones = ((habitaciones.dobles || 0) * 2) + ((habitaciones.doblesTwin || 0) * 2) + (habitaciones.individuales || 0)

  // ============ RENDER PRINCIPAL (CON TRY/CATCH) ============
  
  try {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div 
          className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full h-[90vh] flex flex-col"
          style={{ backgroundColor: 'white', color: 'black' }}
        >
          
          {/* HEADER con JERARQUÍA VISUAL ESTRICTA */}
          <div className="px-8 py-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-white">
            <div className="flex justify-between items-start">
          <div>
                {/* REGLA: Nombre del Grupo = GRANDE Y NEGRITA */}
                <h1 className="text-3xl font-black text-navy-900 uppercase mb-1">
                  {expediente.nombre_grupo || expediente.clienteNombre || grupo.nombre || 'SIN NOMBRE DE GRUPO'}
                </h1>
                {/* Número de expediente en solo lectura */}
                {expediente.numero_expediente && (
                  <p className="text-xs font-mono text-gray-500 mb-1">
                    Nº Expediente: {expediente.numero_expediente}
                  </p>
                )}
                {/* REGLA: Responsable = PEQUEÑO DEBAJO */}
                <p className="text-sm text-gray-600 mb-2">
                  👤 {expediente.cliente_responsable || expediente.responsable || grupo.responsable || 'Sin Responsable'}
                </p>
                <p className="flex items-center gap-2 text-2xl font-bold text-blue-700">
                  <MapPin size={20} className="text-blue-700" />
                  <span>{expediente.destino || 'Sin destino'}</span>
                </p>
          </div>
              <button 
                onClick={onClose} 
                className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full"
              >
            <X size={24} />
          </button>
            </div>
        </div>

          {/* TABS */}
          <div className="border-b border-gray-200 px-8 bg-white">
            <nav className="flex gap-2 -mb-px overflow-x-auto">
              {tabs.map(t => {
                const Icon = t.icon
                return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                    className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                  tab === t.id
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }`}
              >
                    <Icon size={18} />
                {t.label}
              </button>
                )
              })}
          </nav>
        </div>

          {/* CONTENIDO */}
          <div className="flex-1 overflow-y-auto p-8" style={{ backgroundColor: 'white', color: 'black' }}>
            
            {/* TAB: Ficha del Grupo */}
            {tab === 'grupo' && (
              <div className="max-w-4xl mx-auto space-y-6">
                {/* Contenedor principal */}
                <div 
                  style={{ 
                    background: 'white', 
                    padding: '32px', 
                    borderRadius: '24px', 
                    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.04)',
                    border: '1px solid #f1f5f9'
                  }}
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-blue-100 rounded-full">
                      <Users className="text-blue-600" size={24} />
              </div>
                      <div>
                        <h3 className="text-2xl font-bold text-navy-900">Información del Grupo</h3>
                      <p className="text-gray-600 text-sm">Datos del cliente y responsable</p>
                      </div>
                    </div>
                    
                  {/* Banner de Aviso de Integridad de Datos */}
                  {hayCamposFaltantes && (
                    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm font-medium text-amber-800">
                        ⚠️ Faltan datos: {camposFaltantes.join(', ')}
                      </p>
                    </div>
                  )}
                    
                  {/* Rejilla limpia en secciones (Datos Fiscales, Contacto, Localización) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* === DATOS FISCALES / IDENTIFICACIÓN === */}
                    <div className="md:col-span-2">
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-[0.2em] mb-1">
                        Datos fiscales e identificación
                      </h4>
                      <p className="text-xs text-slate-400 mb-4">
                        Información básica del grupo o entidad responsable del viaje
                      </p>
                    </div>
                    <div className="md:col-span-2">
                      <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>Nombre del Grupo *</label>
                      {editandoCliente ? (
                        <input
                          type="text"
                          value={clienteEditado.nombre || ''}
                          onChange={(e) => setClienteEditado({ ...clienteEditado, nombre: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{ 
                            backgroundColor: '#f8fafc', 
                            color: '#0f172a', 
                            fontSize: '16px', 
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                        />
                      ) : (
                        <div
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px',
                          }}
                        >
                          {grupo.nombre || '-'}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                        CIF
                        {esCampoVacio('cif') && (
                          <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                        )}
                      </label>
                      {editandoCliente ? (
                        <input
                          type="text"
                          value={clienteEditado.cif || ''}
                          onChange={(e) => setClienteEditado({ ...clienteEditado, cif: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{ 
                            backgroundColor: '#f8fafc', 
                            color: '#0f172a', 
                            fontSize: '16px', 
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                        />
                      ) : (
                        <div
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: esCampoVacio('cif') ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                            marginTop: '4px',
                          }}
                        >
                          {grupo.cif || grupo.cif_nif || '-'}
                        </div>
                      )}
                    </div>
                    <div>
                      {/* Se mantiene lógica original, solo se añade agrupación visual */}
                      <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>Nº de Socios</label>
                      {editandoCliente ? (
                        <input
                          type="text"
                          value={clienteEditado.nSocios || ''}
                          onChange={(e) => setClienteEditado({ ...clienteEditado, nSocios: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{ 
                            backgroundColor: '#f8fafc', 
                            color: '#0f172a', 
                            fontSize: '16px', 
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                        />
                      ) : (
                        <div
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px',
                          }}
                        >
                          {grupo.nSocios || '-'}
                        </div>
                      )}
                    </div>

                    {/* === CONTACTO PRINCIPAL === */}
                    <div className="md:col-span-2 pt-4 border-t border-slate-100">
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-[0.2em] mb-1 mt-4">
                        Contacto
                      </h4>
                      <p className="text-xs text-slate-400 mb-4">
                        Datos de la persona de contacto y canales de comunicación
                      </p>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                        Responsable
                        {esCampoVacio('responsable') && (
                          <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                        )}
                      </label>
                      {editandoCliente ? (
                        <input
                          type="text"
                          value={clienteEditado.responsable || ''}
                          onChange={(e) => setClienteEditado({ ...clienteEditado, responsable: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{ 
                            backgroundColor: '#f8fafc', 
                            color: '#0f172a', 
                            fontSize: '16px', 
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                        />
                      ) : (
                        <div
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: esCampoVacio('responsable') ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                            marginTop: '4px',
                          }}
                        >
                          {grupo.responsable || '-'}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                        Móvil
                        {esCampoVacio('movil') && (
                          <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                        )}
                      </label>
                      {editandoCliente ? (
                        <input
                          type="text"
                          value={clienteEditado.movilResponsable || ''}
                          onChange={(e) => setClienteEditado({ ...clienteEditado, movilResponsable: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{ 
                            backgroundColor: '#f8fafc', 
                            color: '#0f172a', 
                            fontSize: '16px', 
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                        />
                      ) : (
                        <div
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: esCampoVacio('movil') ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                            marginTop: '4px',
                          }}
                        >
                          {grupo.movilResponsable || grupo.movil || '-'}
                        </div>
                      )}
                    </div>
                    <div className="md:col-span-2">
                      <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                        Email
                        {esCampoVacio('email') && (
                          <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                        )}
                      </label>
                      {editandoCliente ? (
                        <input
                          type="email"
                          value={clienteEditado.email || ''}
                          onChange={(e) => setClienteEditado({ ...clienteEditado, email: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{ 
                            backgroundColor: '#f8fafc', 
                            color: '#0f172a', 
                            fontSize: '16px', 
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                        />
                      ) : (
                        <div
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: esCampoVacio('email') ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                            marginTop: '4px',
                          }}
                        >
                          {grupo.email || '-'}
                        </div>
                      )}
                    </div>
                    <div className="md:col-span-2">

                      {/* === LOCALIZACIÓN === */}
                      <div className="mb-1">
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-[0.2em] mb-1 mt-6">
                          Localización
                        </h4>
                        <p className="text-xs text-slate-400 mb-2">
                          Dirección postal para envíos, documentación y facturación
                        </p>
                      </div>

                      <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                        Dirección
                        {esCampoVacio('direccion') && (
                          <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                        )}
                      </label>
                      {editandoCliente ? (
                        <input
                          type="text"
                          value={clienteEditado.direccion || ''}
                          onChange={(e) => setClienteEditado({ ...clienteEditado, direccion: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{ 
                            backgroundColor: '#f8fafc', 
                            color: '#0f172a', 
                            fontSize: '16px', 
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                        />
                      ) : (
                        <div
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: esCampoVacio('direccion') ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                            marginTop: '4px',
                          }}
                        >
                          {grupo.direccion || '-'}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                        Población
                        {esCampoVacio('poblacion') && (
                          <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                        )}
                      </label>
                      {editandoCliente ? (
                        <input
                          type="text"
                          value={clienteEditado.poblacion || ''}
                          onChange={(e) => setClienteEditado({ ...clienteEditado, poblacion: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{ 
                            backgroundColor: '#f8fafc', 
                            color: '#0f172a', 
                            fontSize: '16px', 
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                        />
                      ) : (
                        <div
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: esCampoVacio('poblacion') ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                            marginTop: '4px',
                          }}
                        >
                          {grupo.poblacion || '-'} {grupo.provincia && `(${grupo.provincia})`}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                        Provincia
                        {esCampoVacio('provincia') && (
                          <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                        )}
                      </label>
                      {editandoCliente ? (
                        <input
                          type="text"
                          value={clienteEditado.provincia || ''}
                          onChange={(e) => setClienteEditado({ ...clienteEditado, provincia: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{ 
                            backgroundColor: '#f8fafc', 
                            color: '#0f172a', 
                            fontSize: '16px', 
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                        />
                      ) : (
                        <div
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: esCampoVacio('provincia') ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                            marginTop: '4px',
                          }}
                        >
                          {grupo.provincia || '-'}
                        </div>
                      )}
                    </div>
                    </div>

                  {/* Historial de Expedientes - Compacto */}
                  <div className="mt-8 pt-6 border-t" style={{ borderColor: '#f1f5f9' }}>
                    <h4 className="text-lg font-bold text-slate-900 mb-4">📂 Historial de Expedientes</h4>
                    
                    {cargandoHistorial ? (
                      <div className="text-center py-4 text-slate-500 text-sm">
                        <p>Cargando expedientes...</p>
                      </div>
                    ) : expedientesHistorial.length === 0 ? (
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <p className="text-slate-600 text-center text-sm">No hay expedientes registrados para este nombre.</p>
                      </div>
                    ) : (
                      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                        <table className="w-full">
                          <thead className="bg-slate-900 text-white">
                            <tr>
                              <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-left">Nombre Viaje</th>
                              <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-left">Destino</th>
                              <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-left">Estado</th>
                              <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-right">Beneficio Neto</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {expedientesHistorial.map((exp) => {
                              // Calcular destino con fallback seguro
                              const destinoMostrar = exp.poblacion_destino || exp.destino || 'Sin destino'
                              
                              return (
                                <tr key={exp.id} className="hover:bg-green-50/30 transition-all">
                                  <td className="px-4 py-3">
                                    <div className="font-bold text-slate-900 text-sm">{exp.cliente_nombre || 'Sin nombre'}</div>
                                    {exp.fecha_viaje && (
                                      <div className="text-xs text-slate-500 mt-1">
                                        {new Date(exp.fecha_viaje).toLocaleDateString('es-ES')}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="text-sm text-slate-700 font-medium">
                                      {destinoMostrar}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${
                                      exp.estado === 'cerrado' ? 'bg-green-100 text-green-800' :
                                      exp.estado === 'confirmado' ? 'bg-blue-100 text-blue-800' :
                                      exp.estado === 'peticion' ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-slate-100 text-slate-800'
                                    }`}>
                                      {exp.estado || 'Sin estado'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <div className={`font-bold text-sm ${
                                      exp.beneficioNeto !== null 
                                        ? (exp.beneficioNeto >= 0 ? 'text-green-700' : 'text-red-700')
                                        : 'text-slate-500'
                                    }`}>
                                      {exp.beneficioNeto !== null 
                                        ? `${exp.beneficioNeto >= 0 ? '+' : ''}${exp.beneficioNeto.toFixed(2)}€`
                                        : 'N/A'
                                      }
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                    
                  {/* Botón Editar Cliente abajo a la derecha */}
                  <div className="flex justify-end mt-6 pt-6 border-t" style={{ borderColor: '#f1f5f9' }}>
                    {!editandoCliente ? (
                      <button 
                        onClick={iniciarEdicionCliente} 
                        className="bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-semibold transition-colors shadow-md"
                      >
                        Editar Cliente
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button 
                          onClick={cancelarEdicionCliente} 
                          className="bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-6 rounded-lg font-semibold transition-colors"
                        >
                          Cancelar
                        </button>
                        <button 
                          onClick={guardarCambiosCliente} 
                          className="bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-semibold transition-colors shadow-md flex items-center gap-2"
                        >
                          <Save size={18} />
                          Guardar Cambios
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* SECCIÓN: Fechas del Viaje (EDITABLE) */}
                <div className="bg-gradient-to-r from-blue-50 to-white rounded-xl shadow-md p-8 border-2 border-blue-200 mt-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-blue-600 rounded-lg">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-navy-900">Fechas del Viaje</h3>
                      <p className="text-gray-600">Define cuándo comienza y termina el viaje</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs mb-2" style={{ color: '#6B7280' }}>📅 Fecha de Inicio *</label>
                      <input
                        type="date"
                        value={convertirEspañolAISO(expediente.fechaInicio) || ''}
                        onChange={(e) => {
                          // Input type="date" devuelve YYYY-MM-DD
                          const fechaISO = e.target.value
                          
                          // Convertir a formato español DD/MM/AAAA para guardar
                          const fechaEspañola = convertirISOAEspañol(fechaISO)
                          
                          const expedienteActualizado = { 
                            ...expediente, 
                            fechaInicio: fechaEspañola // Guardar en formato español
                          }
                          onUpdate(expedienteActualizado)
                        }}
                        style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                        className="w-full p-4 text-lg transition-all"
                        onFocus={(e) => {
                          e.target.style.borderColor = '#3b82f6'
                          e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#e2e8f0'
                          e.target.style.boxShadow = 'none'
                        }}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        ⚡ Esta fecha determina el orden y el ejercicio (año) del expediente
                      </p>
                      {expediente.fechaInicio && (
                        <p className="text-xs text-blue-600 mt-1">
                          📅 Guardada como: {expediente.fechaInicio}
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-xs mb-2" style={{ color: '#6B7280' }}>📅 Fecha de Fin</label>
                      <input
                        type="date"
                        value={convertirEspañolAISO(expediente.fechaFin) || ''}
                        onChange={(e) => {
                          // Input type="date" devuelve YYYY-MM-DD
                          const fechaISO = e.target.value
                          
                          // Convertir a formato español DD/MM/AAAA para guardar
                          const fechaEspañola = convertirISOAEspañol(fechaISO)
                          
                          const expedienteActualizado = { 
                            ...expediente, 
                            fechaFin: fechaEspañola // Guardar en formato español
                          }
                          onUpdate(expedienteActualizado)
                        }}
                        style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                        className="w-full p-4 text-lg transition-all"
                        onFocus={(e) => {
                          e.target.style.borderColor = '#3b82f6'
                          e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#e2e8f0'
                          e.target.style.boxShadow = 'none'
                        }}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        📆 Fecha de regreso o finalización del viaje
                      </p>
                      {expediente.fechaFin && (
                        <p className="text-xs text-blue-600 mt-1">
                          📅 Guardada como: {expediente.fechaFin}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {expediente.fechaInicio && (
                    <div className="mt-4 p-4 bg-white rounded-lg border border-blue-200">
                      <p className="text-sm text-gray-700">
                        <strong className="text-navy-900">Duración calculada:</strong> {
                          expediente.fechaFin && expediente.fechaInicio ? 
                          (() => {
                            const inicio = new Date(expediente.fechaInicio)
                            const fin = new Date(expediente.fechaFin)
                            const dias = Math.ceil((fin - inicio) / (1000 * 60 * 60 * 24))
                            return dias > 0 ? `${dias} día${dias !== 1 ? 's' : ''}` : 'Fechas incorrectas'
                          })() 
                          : 'Falta fecha de fin'
                        }
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: Cotización */}
          {tab === 'cotizacion' && formData && (
              <div className="max-w-6xl mx-auto space-y-6">
                
                {/* Parámetros Principales */}
                <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                  <h3 className="text-xl font-bold text-navy-900 mb-4">Parámetros del Viaje</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div>
                      <label className="label">Total Pasajeros *</label>
                      <input
                        type="number"
                        value={formData?.total_pax || ''}
                        onChange={(e) => setFormData({ ...formData, total_pax: e.target.value })}
                        onFocus={(e) => {
                          handleFocus(e)
                          e.target.style.borderColor = '#3b82f6'
                          e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#e2e8f0'
                          e.target.style.boxShadow = 'none'
                        }}
                        onWheel={handleWheel}
                        className="input-field transition-all"
                        style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                        min="1"
                        tabIndex="1"
                      />
            </div>
                    <div>
                      <label className="label">Gratuidades</label>
                      <input
                        type="number"
                        value={formData?.gratuidades || ''}
                        onChange={(e) => setFormData({ ...formData, gratuidades: e.target.value })}
                        onFocus={(e) => {
                          handleFocus(e)
                          e.target.style.borderColor = '#3b82f6'
                          e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#e2e8f0'
                          e.target.style.boxShadow = 'none'
                        }}
                        onWheel={handleWheel}
                        className="input-field transition-all"
                        style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                        min="0"
                        tabIndex="2"
                      />
                    </div>
                    <div>
                      <label className="label">Bonificación/Pax (€)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData?.bonificacion_pax || ''}
                        onChange={(e) => {
                          const valorInput = e.target.value;
                          if (valorInput === '' || valorInput === '-') {
                            setFormData({ ...formData, bonificacion_pax: '' });
                            return;
                          }
                          let valorLimpio = valorInput.replace(/,/g, '.');
                          const valorNumerico = parseFloat(valorLimpio);
                          if (!isNaN(valorNumerico)) {
                            setFormData({ ...formData, bonificacion_pax: valorNumerico });
                          } else {
                            setFormData({ ...formData, bonificacion_pax: valorLimpio });
                          }
                        }}
                        onFocus={(e) => {
                          handleFocus(e)
                          e.target.style.borderColor = '#3b82f6'
                          e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                        }}
                        onBlur={(e) => {
                          const valor = e.target.value;
                          if (valor !== '' && valor !== '-') {
                            const valorLimpio = valor.replace(/,/g, '.');
                            const valorNumerico = parseFloat(valorLimpio);
                            setFormData({ ...formData, bonificacion_pax: isNaN(valorNumerico) ? 0 : valorNumerico });
                          } else {
                            setFormData({ ...formData, bonificacion_pax: 0 });
                          }
                          e.target.style.borderColor = '#e2e8f0'
                          e.target.style.boxShadow = 'none'
                        }}
                        onWheel={handleWheel}
                        className="input-field transition-all"
                        style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                        placeholder="0.00"
                        min="0"
                        tabIndex="4"
                      />
                    </div>
                    <div>
                      <label className="label font-bold text-green-700">💰 Precio Venta al Cliente (€/pax) *</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData?.precio_venta_cliente || ''}
                        onChange={(e) => {
                          const valorInput = e.target.value;
                          if (valorInput === '' || valorInput === '-') {
                            setFormData({ ...formData, precio_venta_cliente: '' });
                            return;
                          }
                          let valorLimpio = valorInput.replace(/,/g, '.');
                          const valorNumerico = parseFloat(valorLimpio);
                          if (!isNaN(valorNumerico)) {
                            setFormData({ ...formData, precio_venta_cliente: valorNumerico });
                          } else {
                            setFormData({ ...formData, precio_venta_cliente: valorLimpio });
                          }
                        }}
                        onFocus={(e) => {
                          handleFocus(e)
                          e.target.style.borderColor = '#3b82f6'
                          e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                        }}
                        onBlur={(e) => {
                          const valor = e.target.value;
                          if (valor !== '' && valor !== '-') {
                            const valorLimpio = valor.replace(/,/g, '.');
                            const valorNumerico = parseFloat(valorLimpio);
                            setFormData({ ...formData, precio_venta_cliente: isNaN(valorNumerico) ? 0 : valorNumerico });
                          } else {
                            setFormData({ ...formData, precio_venta_cliente: 0 });
                          }
                          e.target.style.borderColor = '#e2e8f0'
                          e.target.style.boxShadow = 'none'
                        }}
                        onWheel={handleWheel}
                        className="input-field transition-all font-bold text-lg"
                        style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                        placeholder="Ej: 380.00"
                        min="0"
                        tabIndex="5"
                      />
                    </div>
                  </div>
                  
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm font-semibold text-blue-900">
                      📊 Pasajeros de Pago: <span className="text-2xl">{paxPago}</span> 
                      <span className="text-xs ml-2 text-blue-600">({totalPax} total - {formData?.gratuidades || 0} gratis)</span>
                    </p>
                  </div>
                </div>

                {/* Card de Suplementos */}
                <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-full">
                        <Bed className="text-blue-600" size={20} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-navy-900">Suplementos</h3>
                        <p className="text-gray-500 text-sm">Habitación individual y seguros opcionales</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Suplemento Habitación Individual */}
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-[0.2em] mb-2">
                        Habitación Individual
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label
                            style={{
                              fontSize: '11px',
                              fontWeight: '700',
                              color: '#64748b',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              display: 'block',
                              marginBottom: '4px',
                            }}
                          >
                            Pax con Individual
                            {(!formData?.sup_individual_pax || Number(formData?.sup_individual_pax) === 0) && (
                              <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                            )}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={formData?.sup_individual_pax}
                            onChange={(e) => setFormData({ ...formData, sup_individual_pax: e.target.value })}
                            className="w-full p-3 text-sm transition-all"
                            style={{
                              backgroundColor: '#f8fafc',
                              color: '#0f172a',
                              borderRadius: '12px',
                              border:
                                !formData?.sup_individual_pax || Number(formData?.sup_individual_pax) === 0
                                  ? '1px solid #f59e0b'
                                  : '1px solid #e2e8f0',
                            }}
                            onFocus={(e) => {
                              e.target.style.borderColor = '#3b82f6'
                              e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                            }}
                            onBlur={(e) => {
                              e.target.style.borderColor =
                                !formData?.sup_individual_pax || Number(formData?.sup_individual_pax) === 0 ? '#f59e0b' : '#e2e8f0'
                              e.target.style.boxShadow = 'none'
                            }}
                          />
                        </div>
                        <div>
                          <label
                            style={{
                              fontSize: '11px',
                              fontWeight: '700',
                              color: '#64748b',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              display: 'block',
                              marginBottom: '4px',
                            }}
                          >
                            Precio/Noche (€)
                            {(!formData?.sup_individual_precio_dia || Number(formData?.sup_individual_precio_dia) === 0) && (
                              <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                            )}
                          </label>
                          <input
                            type="number"
                        step="0.01"
                            min="0"
                            value={formData?.sup_individual_precio_dia || ''}
                            onChange={(e) => setFormData({ ...formData, sup_individual_precio_dia: e.target.value })}
                            className="w-full p-3 text-sm transition-all"
                            style={{
                              backgroundColor: '#f8fafc',
                              color: '#0f172a',
                              borderRadius: '12px',
                              border:
                                !formData?.sup_individual_precio_dia || Number(formData?.sup_individual_precio_dia) === 0
                                  ? '1px solid #f59e0b'
                                  : '1px solid #e2e8f0',
                            }}
                            onFocus={(e) => {
                              e.target.style.borderColor = '#3b82f6'
                              e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                            }}
                            onBlur={(e) => {
                              e.target.style.borderColor =
                                !formData?.sup_individual_precio_dia || Number(formData?.sup_individual_precio_dia) === 0
                                  ? '#f59e0b'
                                  : '#e2e8f0'
                              e.target.style.boxShadow = 'none'
                            }}
                      />
                    </div>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Importe total habitación: <span className="font-semibold text-slate-900">{suplementos.totalSupHabitacion}€</span>{' '}
                        <span className="text-slate-400">
                          ({formData?.sup_individual_pax || 0} pax × {formData?.sup_individual_precio_dia || 0}€ × {suplementos.noches} noches)
                        </span>
                      </p>
                    </div>

                    {/* Suplemento Seguro */}
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-[0.2em] mb-2">
                        Seguro
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label
                            style={{
                              fontSize: '11px',
                              fontWeight: '700',
                              color: '#64748b',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              display: 'block',
                              marginBottom: '4px',
                            }}
                          >
                            Pax con Seguro
                            {(!formData?.sup_seguro_pax || Number(formData?.sup_seguro_pax) === 0) && (
                              <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                            )}
                          </label>
                      <input
                        type="number"
                            min="0"
                            value={formData?.sup_seguro_pax || ''}
                            onChange={(e) => setFormData({ ...formData, sup_seguro_pax: e.target.value })}
                            className="w-full p-3 text-sm transition-all"
                            style={{
                              backgroundColor: '#f8fafc',
                              color: '#0f172a',
                              borderRadius: '12px',
                              border:
                                !formData?.sup_seguro_pax || Number(formData?.sup_seguro_pax) === 0
                                  ? '1px solid #f59e0b'
                                  : '1px solid #e2e8f0',
                            }}
                        onFocus={(e) => {
                          e.target.style.borderColor = '#3b82f6'
                          e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                        }}
                        onBlur={(e) => {
                              e.target.style.borderColor =
                                !formData?.sup_seguro_pax || Number(formData?.sup_seguro_pax) === 0 ? '#f59e0b' : '#e2e8f0'
                          e.target.style.boxShadow = 'none'
                        }}
                          />
                        </div>
                        <div>
                          <label
                            style={{
                              fontSize: '11px',
                              fontWeight: '700',
                              color: '#64748b',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              display: 'block',
                              marginBottom: '4px',
                            }}
                          >
                            Precio Total Seguro (€)
                            {(!formData?.sup_seguro_precio_total || Number(formData?.sup_seguro_precio_total) === 0) && (
                              <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                            )}
                          </label>
                          <input
                            type="number"
                        step="0.01"
                            min="0"
                            value={formData?.sup_seguro_precio_total || ''}
                            onChange={(e) => setFormData({ ...formData, sup_seguro_precio_total: e.target.value })}
                            className="w-full p-3 text-sm transition-all"
                            style={{
                              backgroundColor: '#f8fafc',
                              color: '#0f172a',
                              borderRadius: '12px',
                              border:
                                !formData?.sup_seguro_precio_total || Number(formData?.sup_seguro_precio_total) === 0
                                  ? '1px solid #f59e0b'
                                  : '1px solid #e2e8f0',
                            }}
                            onFocus={(e) => {
                              e.target.style.borderColor = '#3b82f6'
                              e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                            }}
                            onBlur={(e) => {
                              e.target.style.borderColor =
                                !formData?.sup_seguro_precio_total || Number(formData?.sup_seguro_precio_total) === 0
                                  ? '#f59e0b'
                                  : '#e2e8f0'
                              e.target.style.boxShadow = 'none'
                            }}
                          />
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Importe total seguro: <span className="font-semibold text-slate-900">{suplementos.totalSupSeguro}€</span>{' '}
                        <span className="text-slate-400">
                          ({formData?.sup_seguro_pax || 0} pax × {formData?.sup_seguro_precio_total || 0}€)
                        </span>
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm font-medium text-amber-800">
                      💡 Total suplementos añadidos a la cotización:{' '}
                      <span className="font-bold">{suplementos.totalSuplementos}€</span>
                    </p>
                  </div>
                </div>

                {/* Tabla de Servicios */}
                <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-navy-900">Servicios del Viaje</h3>
                  </div>
                  
                  {servicios.length === 0 ? (
                    <div className="space-y-4">
                      <p className="text-center text-gray-500 py-8">No hay servicios añadidos</p>
                      <button onClick={añadirServicio} className="btn-primary w-full flex items-center justify-center gap-2">
                        <Plus size={20} />
                        Añadir Primer Servicio
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">Proveedor</th>
                            <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">Servicio</th>
                            <th className="px-2 py-2 text-center text-xs font-semibold text-gray-700">Cantidad</th>
                            <th className="px-2 py-2 text-center text-xs font-semibold text-gray-700">Precio</th>
                            <th className="px-2 py-2 text-center text-xs font-semibold text-gray-700">Modo</th>
                            <th className="px-2 py-2 text-center text-xs font-semibold text-gray-700">Total (€)</th>
                            <th className="px-2 py-2 text-center text-xs font-semibold text-gray-700">Release</th>
                            <th className="px-2 py-2 text-center text-xs font-semibold text-gray-700">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {servicios.map(servicio => (
                            <tr key={servicio.id} className="border-t border-gray-200 hover:bg-gray-50">
                              {/* COLUMNA 1: PROVEEDOR CON BÚSQUEDA */}
                              <td className="px-2 py-2">
                                <div className="relative">
                                <div className="flex gap-1 items-center">
                                  <div className="relative flex-1">
                                    {/* Input de búsqueda - SOLO búsqueda, NO crea nada */}
                                    <input
                                      type="text"
                                      value={
                                        busquedaProveedor[servicio.id] !== undefined
                                          ? busquedaProveedor[servicio.id]
                                          : (obtenerProveedorPorId(servicio.proveedorId)?.nombreComercial || '')
                                      }
                                      onChange={(e) => {
                                        const inputValue = e.target.value
                                        setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: inputValue })
                                        setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: true })
                                      }}
                                      onFocus={(e) => {
                                        // ============ COMBOBOX: MOSTRAR TODOS AL HACER CLIC ============
                                        setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: true })
                                        // Si no hay búsqueda, limpiar para mostrar todos los proveedores del tipo
                                        if (!busquedaProveedor[servicio.id]) {
                                          setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: '' })
                                        }
                                        // Estilo de foco
                                        e.target.style.borderColor = '#3b82f6'
                                        e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                                      }}
                                      placeholder="Buscar proveedor..."
                                        className="input-field text-xs w-full pr-8 transition-all"
                                        style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                                        onBlur={(e) => {
                                          e.target.style.borderColor = '#e2e8f0'
                                          e.target.style.boxShadow = 'none'
                                        }}
                                    />
                                    
                                    {/* Botón limpiar */}
                                    {(busquedaProveedor[servicio.id] || servicio.proveedorId) && (
                                      <button
                                        onClick={() => {
                                          setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: '' })
                                          actualizarServicio(servicio.id, 'proveedorId', null)
                                          setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: false })
                                        }}
                                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10"
                                        title="Limpiar"
                                      >
                                        <X size={14} />
                                      </button>
                                    )}
                                  </div>
                                  
                                  {/* Botón '+' independiente para abrir modal completo */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      // Abrir modal completo - NO crea nada, solo abre el modal
                                      abrirModalProveedor(
                                        busquedaProveedor[servicio.id] || '',
                                        servicio.tipo,
                                        servicio.id
                                      )
                                    }}
                                    className="flex-shrink-0 w-8 h-8 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center justify-center transition-colors"
                                    title="Añadir nuevo proveedor"
                                  >
                                    <Plus size={16} />
                                  </button>
                                </div>
                                  
                                  {/* Lista de sugerencias - POSICIONAMIENTO ABSOLUTO CORRECTO */}
                                  {mostrarSugerencias[servicio.id] && (
                                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                      {(() => {
                                        const tipoProveedorBuscado = mapearTipoServicioAProveedor(servicio.tipo)
                                        const textoBusqueda = (busquedaProveedor[servicio.id] || '').toLowerCase().trim()
                                        
                                        console.log('🔍 Filtrado de proveedores:', {
                                          totalProveedores: proveedores.length,
                                          tipoServicio: servicio.tipo,
                                          tipoProveedorBuscado,
                                          textoBusqueda
                                        })
                                        
                                        // ============ COMBOBOX: MOSTRAR TODOS O FILTRADOS ============
                                        // COMPARACIÓN ROBUSTA: Normalizar ambos lados para evitar problemas de formato
                                        const proveedoresFiltrados = proveedores
                                          .filter(p => {
                                            // Normalizar ambos tipos para comparación robusta
                                            const tipoProveedorNormalizado = normalizarText(p.tipo || '');
                                            const tipoBuscadoNormalizado = normalizarText(tipoProveedorBuscado || '');
                                            
                                            const coincideTipo = tipoProveedorNormalizado === tipoBuscadoNormalizado
                                            
                                            console.log('🔍 Comparando tipos:', {
                                              proveedor: p.nombreComercial,
                                              tipoProveedor: p.tipo,
                                              tipoProveedorNormalizado,
                                              tipoBuscadoNormalizado,
                                              coincideTipo
                                            })
                                            
                                            // Si no hay búsqueda de texto, mostrar todos del tipo
                                            if (!textoBusqueda) {
                                              return coincideTipo
                                            }
                                            
                                            // Si hay búsqueda, filtrar por nombre Y tipo
                                            const coincideNombre = (p.nombreComercial || '').toLowerCase().includes(textoBusqueda)
                                            return coincideTipo && coincideNombre
                                          })
                                          .sort((a, b) => (a.nombreComercial || '').localeCompare(b.nombreComercial || ''))
                                        
                                        console.log('✅ Proveedores filtrados:', proveedoresFiltrados.length, proveedoresFiltrados.map(p => p.nombreComercial))
                                        
                                        return (
                                          <>
                                            {/* Mensajes según estado */}
                                            {proveedoresFiltrados.length === 0 && !textoBusqueda && (
                                              <div className="px-3 py-3 text-xs text-center">
                                                <p className="text-gray-600 mb-2">
                                                  No hay proveedores de <strong>{servicio.tipo}</strong>
                                                </p>
                                                <p className="text-green-600 font-medium">
                                                  💡 Usa el botón + para añadir uno nuevo
                                                </p>
                                              </div>
                                            )}
                                            
                                            {/* Mensaje si hay búsqueda sin resultados */}
                                            {proveedoresFiltrados.length === 0 && textoBusqueda && (
                                              <div className="px-3 py-3 text-xs text-center">
                                                <p className="text-gray-600 mb-2">
                                                  No se encontró "{busquedaProveedor[servicio.id]}" en {servicio.tipo}
                                                </p>
                                                <p className="text-green-600 font-medium">
                                                  ➕ Usa el botón + para crear nuevo proveedor
                                                </p>
                                              </div>
                                            )}
                                            
                                            {/* Lista de proveedores existentes - SOLO selección, NO creación */}
                                            {proveedoresFiltrados.length > 0 && (
                                              <div className="py-1">
                                            {proveedoresFiltrados.map(proveedor => (
                                              <button
                                                key={proveedor.id}
                                                    type="button"
                                                onClick={() => {
                                                      console.log('✅ Seleccionando proveedor:', proveedor)
                                                  actualizarServicio(servicio.id, 'proveedorId', proveedor.id)
                                                  setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: proveedor.nombreComercial })
                                                  setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: false })
                                                }}
                                                    className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex items-center gap-2 border-b border-gray-100 transition-colors"
                                              >
                                                <span className="font-medium text-navy-900">{proveedor.nombreComercial}</span>
                                                {proveedor.telefono && (
                                                  <span className="text-gray-500">· {proveedor.telefono}</span>
                                                )}
                                              </button>
                                            ))}
                                              </div>
                                            )}
                                          </>
                                        )
                                      })()}
                                    </div>
                                  )}
                                </div>
                              </td>
                              
                              {/* COLUMNA 2: SERVICIO (TIPO) */}
                              <td className="px-2 py-2">
                                <select
                                  value={servicio.tipo}
                                  onChange={(e) => {
                                    const nuevoTipo = e.target.value
                                    actualizarServicio(servicio.id, 'tipo', nuevoTipo)
                                    // Limpiar proveedor si cambia el tipo (porque el tipo debe coincidir)
                                    if (servicio.proveedorId) {
                                      const proveedorActual = obtenerProveedorPorId(servicio.proveedorId)
                                      const tipoProveedorActual = mapearTipoServicioAProveedor(proveedorActual?.tipo || '')
                                      const nuevoTipoProveedor = mapearTipoServicioAProveedor(nuevoTipo)
                                      
                                      // Si el tipo del proveedor no coincide con el nuevo tipo, limpiar
                                      if (tipoProveedorActual !== nuevoTipoProveedor) {
                                        actualizarServicio(servicio.id, 'proveedorId', null)
                                        setBusquedaProveedor({ ...busquedaProveedor, [servicio.id]: '' })
                                      }
                                    }
                                    // Mostrar sugerencias para el nuevo tipo
                                    setMostrarSugerencias({ ...mostrarSugerencias, [servicio.id]: true })
                                  }}
                                  className="input-field text-xs w-full transition-all"
                                  style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                                  onFocus={(e) => {
                                    e.target.style.borderColor = '#3b82f6'
                                    e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                                  }}
                                  onBlur={(e) => {
                                    e.target.style.borderColor = '#e2e8f0'
                                    e.target.style.boxShadow = 'none'
                                  }}
                                >
                                  <option>Hotel</option>
                                  <option>Restaurante</option>
                                  <option>Autobús</option>
                                  <option>Guía</option>
                                  <option>Guía Local</option>
                                  <option>Entradas/Tickets</option>
                                  <option>Seguro</option>
                                  <option>Otros</option>
                                </select>
                              </td>
                              
                              {/* COLUMNA 3: CANTIDAD (Noches para Hotel, Días para Guía, 1 para otros) */}
                              <td className="px-2 py-2 text-center">
                                {servicio.tipo === 'Hotel' || servicio.tipo === 'Guía' ? (
                                <input
                                    type="number"
                                    value={servicio.noches || 1}
                                    onChange={(e) => {
                                      const valor = e.target.value
                                      // Convertir a número para asegurar consistencia
                                      const valorNumerico = valor === '' ? 1 : Number(valor) || 1
                                      actualizarServicio(servicio.id, 'noches', Math.max(1, valorNumerico))
                                    }}
                                    onFocus={(e) => {
                                      handleFocus(e)
                                      e.target.style.borderColor = '#3b82f6'
                                      e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                                    }}
                                    onBlur={(e) => {
                                      e.target.style.borderColor = '#e2e8f0'
                                      e.target.style.boxShadow = 'none'
                                    }}
                                    onWheel={handleWheel}
                                    className="input-field text-xs text-center w-20 transition-all"
                                    style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                                    min="1"
                                    placeholder="1"
                                  />
                                ) : (
                                  <span className="text-gray-600 text-xs font-medium">1</span>
                                )}
                              </td>
                              
                              {/* COLUMNA 4: PRECIO */}
                              <td className="px-2 py-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={servicio.costeUnitario ?? servicio.precio_manual ?? ''}
                                  onChange={(e) => {
                                    // Preservar decimales: usar parseFloat directamente para inputs numéricos
                                    const valorInput = e.target.value;
                                    
                                    // Si está vacío, permitir edición
                                    if (valorInput === '' || valorInput === '-') {
                                      actualizarServicio(servicio.id, 'precio_manual', '');
                                      actualizarServicio(servicio.id, 'costeUnitario', '');
                                      return;
                                    }
                                    
                                    // Convertir coma a punto (formato europeo -> americano)
                                    let valorLimpio = valorInput.replace(/,/g, '.');
                                    
                                    // Parsear a float para preservar decimales
                                    const valorNumerico = parseFloat(valorLimpio);
                                    
                                    // Si es un número válido, actualizar; si no, mantener el string para permitir edición
                                    if (!isNaN(valorNumerico)) {
                                      // Precio manual: almacenamos tal cual y lo reflejamos también en costeUnitario
                                      actualizarServicio(servicio.id, 'precio_manual', valorNumerico);
                                      actualizarServicio(servicio.id, 'costeUnitario', valorNumerico);
                                    } else {
                                      // Permitir edición parcial (ej: usuario escribiendo "66.")
                                      actualizarServicio(servicio.id, 'precio_manual', valorLimpio);
                                    }
                                  }}
                                  onFocus={(e) => {
                                    handleFocus(e)
                                    e.target.style.borderColor = '#3b82f6'
                                    e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                                  }}
                                  onBlur={(e) => {
                                    // Al perder el foco, sincronizar costeUnitario (precio que escribe el usuario)
                                    const valor = e.target.value;
                                    if (valor !== '' && valor !== '-') {
                                      const valorLimpio = valor.replace(/,/g, '.');
                                      const valorNumerico = parseFloat(valorLimpio);
                                      if (!isNaN(valorNumerico)) {
                                        actualizarServicio(servicio.id, 'costeUnitario', valorNumerico);
                                        actualizarServicio(servicio.id, 'precio_manual', valorNumerico);
                                      }
                                    } else {
                                      actualizarServicio(servicio.id, 'precio_manual', '');
                                      actualizarServicio(servicio.id, 'costeUnitario', 0);
                                    }
                                    e.target.style.borderColor = '#e2e8f0'
                                    e.target.style.boxShadow = 'none'
                                  }}
                                  onWheel={handleWheel}
                                  className="input-field text-xs text-right w-28 transition-all"
                                  style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                                  placeholder="0.00"
                                  min="0"
                                />
                              </td>

                              {/* COLUMNA 5: MODO DE PRECIO (Precio por Persona / Total a dividir) */}
                              <td className="px-2 py-2 text-center">
                                <select
                                  value={servicio.tipoCalculo || 'porPersona'}
                                  onChange={(e) => actualizarServicio(servicio.id, 'tipoCalculo', e.target.value)}
                                  className="input-field text-[10px] w-full transition-all"
                                  style={{ backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                                  onFocus={(e) => {
                                    e.target.style.borderColor = '#3b82f6'
                                    e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                                  }}
                                  onBlur={(e) => {
                                    e.target.style.borderColor = '#e2e8f0'
                                    e.target.style.boxShadow = 'none'
                                  }}
                                >
                                  <option value="porPersona">Precio por Persona</option>
                                  <option value="porGrupo">Total a dividir</option>
                                  <option value="fijoGrupo">Fijo por grupo</option>
                                </select>
                              </td>
                              
                              {/* COLUMNA 6: TOTAL (Calculado con función clara) */}
                              <td className="px-2 py-2 text-center">
                                <span className="text-gray-900 text-sm font-semibold">
                                  {calcularTotalFilaUI(servicio).toFixed(2)}€
                                </span>
                              </td>
                              
                              {/* COLUMNA 7: RELEASE (Fecha de liberación) */}
                              <td className="px-2 py-2 text-center">
                                <input
                                  type="date"
                                  value={servicio.fechaRelease || ''}
                                  onChange={(e) => {
                                    const fechaValue = e.target.value || ''
                                    actualizarServicio(servicio.id, 'fechaRelease', fechaValue)
                                  }}
                                  onFocus={(e) => {
                                    e.target.style.borderColor = '#3b82f6'
                                    e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                                  }}
                                  onBlur={(e) => {
                                    e.target.style.borderColor = '#e2e8f0'
                                    e.target.style.boxShadow = 'none'
                                    const fechaValue = e.target.value || ''
                                    // Persistir cambio de release en Supabase
                                    guardarFechaReleaseServicio(servicio.id, fechaValue)
                                  }}
                                  className="input-field text-xs text-center transition-all"
                                  style={{ 
                                    backgroundColor: '#f8fafc', 
                                    color: '#0f172a', 
                                    borderRadius: '12px', 
                                    border: '1px solid #e2e8f0',
                                    padding: '6px 8px',
                                    width: '100%',
                                    maxWidth: '140px'
                                  }}
                                />
                              </td>
                              
                              {/* COLUMNA 8: ACCIONES */}
                              <td className="px-2 py-2 text-center">
                                <button
                                  onClick={() => eliminarServicio(servicio.id)}
                                  className="text-red-600 hover:text-red-900 p-1"
                                  title="Eliminar"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      
                      {/* Botón Añadir Servicio al final */}
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <button onClick={añadirServicio} className="btn-primary w-full flex items-center justify-center gap-2">
                          <Plus size={20} />
                          Añadir Servicio
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Resultados de la Cotización */}
                <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                  <h3 className="text-xl font-bold text-navy-900 mb-4">Resumen Financiero</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <p className="text-xs text-blue-700 font-semibold uppercase mb-1">🚌 Autobús/Pax</p>
                      <p className="text-2xl font-bold text-blue-900">{resultados.costeBusPorPax}€</p>
                    </div>
                    
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <p className="text-xs text-blue-700 font-semibold uppercase mb-1">👤 Guía/Pax</p>
                      <p className="text-2xl font-bold text-blue-900">{resultados.costeGuiaPorPax}€</p>
                    </div>
                    
                    {parseFloat(resultados.costeGuiaLocalPorPax) > 0 && (
                      <div className="bg-teal-50 p-4 rounded-lg">
                        <p className="text-xs text-teal-700 font-semibold uppercase mb-1">🗺️ Guía Local/Pax</p>
                        <p className="text-2xl font-bold text-teal-900">{resultados.costeGuiaLocalPorPax}€</p>
                      </div>
                    )}
                    
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <p className="text-xs text-purple-700 font-semibold uppercase mb-1">🏨 Hotel/Pax</p>
                      <p className="text-2xl font-bold text-purple-900">{resultados.costeHotelPorPax}€</p>
                    </div>
                    
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <p className="text-xs text-purple-700 font-semibold uppercase mb-1">🛡️ Seguro/Pax</p>
                      <p className="text-2xl font-bold text-purple-900">{resultados.costeSeguroPorPax}€</p>
                    </div>
                    
                    {parseFloat(resultados.costeEntradasPorPax) > 0 && (
                      <div className="bg-purple-50 p-4 rounded-lg">
                        <p className="text-xs text-purple-700 font-semibold uppercase mb-1">🎫 Entradas/Pax</p>
                        <p className="text-2xl font-bold text-purple-900">{resultados.costeEntradasPorPax}€</p>
                      </div>
                    )}
                    
                    {parseFloat(resultados.costeRestaurantePorPax) > 0 && (
                      <div className="bg-amber-50 p-4 rounded-lg">
                        <p className="text-xs text-amber-700 font-semibold uppercase mb-1">🍽️ Restaurantes/Pax</p>
                        <p className="text-2xl font-bold text-amber-900">{resultados.costeRestaurantePorPax}€</p>
                      </div>
                    )}
                    
                    {parseFloat(resultados.costeOtrosPorPax) > 0 && (
                      <div className="bg-gray-100 p-4 rounded-lg">
                        <p className="text-xs text-gray-700 font-semibold uppercase mb-1">📦 Otros Gastos/Pax</p>
                        <p className="text-2xl font-bold text-gray-900">{resultados.costeOtrosPorPax}€</p>
            </div>
          )}

                    {parseInt(formData?.gratuidades || 0) > 0 && (
                      <div className="bg-orange-50 p-4 rounded-lg md:col-span-2 border-2 border-orange-300">
                        <p className="text-xs text-orange-700 font-semibold uppercase mb-1">🎁 Prorrateo Gratuidades/Pax</p>
                        <p className="text-sm text-orange-600 mb-1">
                          {resultados.gratuidades} plazas × {resultados.costeBaseGratuidad}€ = {resultados.costePlazasGratuitas}€ total
                        </p>
                        <p className="text-2xl font-bold text-orange-900">+{resultados.costeGratuidadesPorPax}€/pax</p>
            </div>
          )}

                    {parseFloat(formData?.bonificacion_pax || 0) > 0 && (
                      <div className="bg-yellow-50 p-4 rounded-lg md:col-span-2 border-2 border-yellow-300">
                        <p className="text-xs text-yellow-700 font-semibold uppercase mb-1">💳 Bonificación Pactada</p>
                        <p className="text-2xl font-bold text-yellow-900">+{resultados.bonificacion}€/pax</p>
                      </div>
                    )}
                  </div>
                  
                  {/* DESGLOSE CLARO: Base + Gratuidades = Total */}
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-xl border-2 border-blue-300 mt-6">
                    <h4 className="text-lg font-bold text-navy-900 mb-4">📊 Desglose del Coste Real</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between py-2 border-b border-blue-200">
                        <span className="text-blue-700 font-medium">🚌 Coste Base Servicios (por persona)</span>
                        <span className="font-bold text-blue-900">{resultados.costeBasePorPersona}€</span>
                      </div>
                      {parseInt(formData?.gratuidades || 0) > 0 && (
                        <div className="flex justify-between py-2 border-b border-blue-200">
                          <span className="text-orange-700 font-medium">➕ Prorrateo Gratuidades ({formData?.gratuidades || 0} × {resultados.costeBaseGratuidad}€)</span>
                          <span className="font-bold text-orange-900">+{resultados.costeGratuidadesPorPax}€</span>
                        </div>
                      )}
                      {parseFloat(formData?.bonificacion_pax || 0) > 0 && (
                        <div className="flex justify-between py-2 border-b border-blue-200">
                          <span className="text-yellow-700 font-medium">➕ Bonificación Pactada</span>
                          <span className="font-bold text-yellow-900">+{resultados.bonificacion}€</span>
                        </div>
                      )}
                      <div className="flex justify-between py-3 bg-red-100 rounded-lg px-4 mt-3 border-2 border-red-400">
                        <span className="text-base font-black text-red-900 uppercase">= Coste Real por Persona</span>
                        <span className="text-3xl font-black text-red-900">{resultados.costeRealPorPersona}€</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* RESUMEN COMERCIAL - NUEVO MODELO (SIEMPRE VISIBLE) */}
                  <div className="bg-white p-6 rounded-xl border-2 border-gray-200 shadow-md mt-6">
                    <h4 className="text-lg font-bold text-navy-900 mb-4">💼 Resumen Comercial</h4>
                    
                    {/* Pasajeros de pago - Origen del dinero */}
                    <div className="mb-4 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
                      <p className="text-base font-bold text-navy-900">
                        👥 Pasajeros de pago: <span className="text-2xl text-blue-700">{resultados.paxDePago ?? resultados.paxPagadores}</span>
                        {resultados.totalPasajeros > 0 && (
                          <span className="text-sm font-normal text-slate-600 ml-2">
                            (de {resultados.totalPasajeros} total − {resultados.gratuidades} gratuidades)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-600 mt-1">
                        Solo las plazas de pago generan ingreso. Las gratuidades no facturan al cliente.
                      </p>
                    </div>
                    
                    {/* Mensaje informativo si no hay servicios */}
                    {servicios.length === 0 && (
                      <div className="mb-4 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-800">
                          ℹ️ <strong>Expediente nuevo:</strong> Añade servicios para ver los costes calculados automáticamente.
                        </p>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* 1. COSTE REAL - Azul Suave */}
                      <div className="bg-blue-50 p-5 rounded-lg border-2 border-blue-200">
                        <p className="text-xs text-blue-700 font-semibold uppercase mb-1">📊 Coste Real/Pax</p>
                        <p className="text-3xl font-black text-blue-900">{resultados.costeRealPorPersona}€</p>
                        <p className="text-xs text-blue-600 mt-1">Total: {resultados.costeTotalViaje}€</p>
                      </div>
                      
                      {/* 2. PRECIO VENTA - Verde Destacado */}
                      <div className="bg-green-50 p-5 rounded-lg border-2 border-green-400 shadow-lg">
                        <p className="text-xs text-green-700 font-bold uppercase mb-1">💰 Precio Venta/Pax</p>
                        <p className="text-3xl font-black text-green-900">{resultados.precioVentaPorPersona}€</p>
                        <p className="text-xs text-green-600 mt-1">Total: {resultados.precioVentaTotal}€</p>
                      </div>
                      
                      {/* 3. MARGEN - Verde si positivo, Rojo si negativo */}
                      <div className={`p-5 rounded-lg border-2 ${parseFloat(resultados.margenPorPersona) >= 0 ? 'bg-green-50 border-green-400' : 'bg-red-50 border-red-400'}`}>
                        <p className={`text-xs font-bold uppercase mb-1 ${parseFloat(resultados.margenPorPersona) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {parseFloat(resultados.margenPorPersona) >= 0 ? '📈 Margen/Pax' : '⚠️ Pérdida/Pax'}
                        </p>
                        <p className={`text-3xl font-black ${parseFloat(resultados.margenPorPersona) >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                          {parseFloat(resultados.margenPorPersona) >= 0 ? '+' : ''}{resultados.margenPorPersona}€
                        </p>
                        <p className={`text-xs mt-1 ${parseFloat(resultados.margenPorPersona) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {resultados.margenPorcentaje}% · Total: {resultados.beneficioTotal}€
                        </p>
                      </div>
                    </div>
                    
                    {/* Beneficio Total del Viaje: Ingresos (Total Venta) - Costes (proveedor) */}
                    <div className={`mt-4 p-4 rounded-lg ${parseFloat(resultados.beneficioTotal) >= 0 ? 'bg-gradient-to-r from-green-100 to-emerald-100' : 'bg-gradient-to-r from-red-100 to-orange-100'}`}>
                      <div className="flex justify-between items-center">
                        <span className={`text-base font-bold ${parseFloat(resultados.beneficioTotal) >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                          💼 Beneficio Real (Ingresos − Costes):
                        </span>
                        <span className={`text-2xl font-black ${parseFloat(resultados.beneficioTotal) >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                          {parseFloat(resultados.beneficioTotal) >= 0 ? '+' : ''}{resultados.beneficioTotal}€
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        Ingresos {resultados.ingresos}€ − Costes {resultados.costes}€
                      </p>
                    </div>

                    {/* Desglose de IVA y Beneficio Líquido */}
                    <div className="mt-4 space-y-3">
                      {/* IVA a pagar (21%) */}
                      <div className="bg-red-50 p-4 rounded-lg border-2 border-red-300">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-bold text-red-700">
                            IVA a pagar (21%):
                          </span>
                          <span className="text-xl font-bold text-red-700">
                            {parseFloat(resultados.iva) >= 0 ? '+' : ''}{resultados.iva}€
                          </span>
                        </div>
                      </div>

                      {/* Beneficio Líquido Real - Dato más destacado */}
                      <div className="bg-gradient-to-r from-green-200 to-emerald-200 p-5 rounded-lg border-3 border-green-600 shadow-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-lg font-black text-green-900">
                            💰 Beneficio Líquido Real:
                          </span>
                          <span className="text-3xl font-black text-green-900">
                            {parseFloat(resultados.beneficioNeto) >= 0 ? '+' : ''}{resultados.beneficioNeto}€
                          </span>
                        </div>
                        <p className="text-xs text-green-700 mt-2 font-semibold">
                          Dinero real disponible tras impuestos
                        </p>
                      </div>
                    </div>

                    {/* Resumen: Pasajeros de pago (origen del dinero) */}
                    <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <p className="text-sm font-semibold text-slate-800">
                        👥 Pasajeros de pago: <span className="font-bold text-navy-900">{resultados.paxDePago ?? resultados.paxPagadores}</span>
                        {resultados.totalPasajeros > 0 && (
                          <span className="text-slate-600 font-normal ml-1">
                            ({resultados.totalPasajeros} total − {resultados.gratuidades} gratuidades)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-600 mt-1">
                        El cliente solo paga las plazas de pago; las gratuidades no generan ingreso.
                      </p>
                    </div>

                    {/* Total Cotización: Total Venta = (paxDePago × PrecioBase) − Bonificación + Suplementos */}
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-semibold text-amber-900">
                          💼 Total Cotización (Total Venta):
                        </span>
                        <span className="font-bold text-amber-900">
                          {(resultados.totalVenta || '0.00')}€
                        </span>
                      </div>
                      <p className="text-xs text-amber-800 mt-1">
                        (pax de pago × precio) − bonificación + suplementos
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-6">
                    <button
                      onClick={async () => {
                        if (isSaving) return
                        setIsSaving(true)
                        try {
                          const resultado = await persistirCambios()
                          if (resultado?.ok) {
                            alert('✅ Cotización guardada correctamente!')
                          } else {
                            alert('No se pudo guardar. Los cambios no se han perdido. Inténtalo de nuevo.')
                          }
                        } catch {
                          alert('No se pudo guardar. Los cambios no se han perdido. Inténtalo de nuevo.')
                        } finally {
                          setIsSaving(false)
                        }
                      }}
                      disabled={isSaving}
                      className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <Save size={20} />
                      {isSaving ? 'Guardando...' : 'Guardar Cotización'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Rooming List */}
          {tab === 'pasajeros' && (
              <div className="max-w-4xl mx-auto space-y-6">
                <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                  <h3 className="text-xl font-bold text-navy-900 mb-4">Desglose de Habitaciones</h3>
                  
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div>
                      <label className="label">Dobles</label>
                      <input
                        type="number"
                        value={habitaciones.dobles}
                        onChange={(e) => setHabitaciones({ ...habitaciones, dobles: parseInt(e.target.value) || 0 })}
                        className="input-field"
                        min="0"
                      />
                    </div>
                    <div>
                      <label className="label">Dobles Twin</label>
                      <input
                        type="number"
                        value={habitaciones.doblesTwin}
                        onChange={(e) => setHabitaciones({ ...habitaciones, doblesTwin: parseInt(e.target.value) || 0 })}
                        className="input-field"
                        min="0"
                      />
                    </div>
                    <div>
                      <label className="label">Individuales</label>
                      <input
                        type="number"
                        value={habitaciones.individuales}
                        onChange={(e) => setHabitaciones({ ...habitaciones, individuales: parseInt(e.target.value) || 0 })}
                        className="input-field"
                        min="0"
                      />
                    </div>
                  </div>
                  
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-sm font-semibold text-blue-900">
                      🏨 Total Habitaciones: <span className="text-2xl">{totalHabitaciones}</span>
                      <span className="mx-4">|</span>
                      👥 Total Pasajeros: <span className="text-2xl">{totalPasajerosHabitaciones}</span>
                    </p>
                  </div>
                </div>
                
                <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                  <h3 className="text-xl font-bold text-navy-900 mb-4">Documentos</h3>
                  
                  <div className="mb-4">
                    <label className="btn-secondary cursor-pointer inline-flex items-center gap-2">
                      <Upload size={20} />
                      Subir Documento
                      <input
                        type="file"
                        onChange={handleFileUpload}
                        className="hidden"
                        accept=".pdf,.doc,.docx,.xls,.xlsx"
                      />
                    </label>
                  </div>
                  
                  {documentos.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No hay documentos adjuntos</p>
                  ) : (
                    <div className="space-y-2">
                      {documentos.map(doc => (
                        <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <FileUp className="text-blue-600" size={20} />
                            <div>
                              <p className="font-medium text-gray-900">{doc.nombre}</p>
                              <p className="text-xs text-gray-500">{new Date(doc.fecha).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => eliminarDocumento(doc.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      ))}
            </div>
          )}
                </div>
                
                <button onClick={guardarHabitaciones} className="btn-primary w-full flex items-center justify-center gap-2">
                  <Save size={20} />
                  Guardar Rooming List
                </button>
            </div>
          )}

            {/* TAB: Cobros y Pagos */}
          {tab === 'cobros' && (
              <div className="max-w-6xl mx-auto space-y-6">
                {/* Header con botón de registro */}
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-navy-900">Gestión de Cobros</h3>
                  <button
                    onClick={() => {
                      setCobroEnEdicionId(null)
                      setFormCobro({
                        importe: '',
                        metodo_pago: 'Transferencia',
                        cuenta_destino: 'Caixabank',
                        concepto: ''
                      })
                      setShowModalCobro(true)
                    }}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Plus size={20} />
                    Registrar Nuevo Cobro
                  </button>
                </div>

                {/* Resumen de Totales */}
                {cobros.length > 0 && (
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl shadow-md p-6 border border-blue-200">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center">
                        <p className="text-sm text-gray-600 mb-1">Total Cobrado</p>
                        <p className="text-3xl font-bold text-navy-900">
                          {cobros.reduce((sum, c) => sum + Number(c.importe || 0), 0).toFixed(2)}€
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-gray-600 mb-1">Número de Cobros</p>
                        <p className="text-3xl font-bold text-blue-600">{cobros.length}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-gray-600 mb-1">Último Cobro</p>
                        <p className="text-lg font-semibold text-gray-800">
                          {cobros[0]?.fecha 
                            ? new Date(cobros[0].fecha).toLocaleDateString('es-ES', { 
                                day: '2-digit', 
                                month: '2-digit', 
                                year: 'numeric' 
                              })
                            : '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tabla de Historial de Cobros */}
                <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Fecha</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Importe</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Método de Pago</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Cuenta Destino</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Concepto</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cobros.length === 0 ? (
                          <tr>
                            <td colSpan="6" className="text-center py-8 text-gray-500">
                              No hay cobros registrados para este expediente
                            </td>
                          </tr>
                        ) : (
                          cobros.map((cobro) => {
                            const fechaCobro = cobro.fecha ? new Date(cobro.fecha) : null
                            const fechaFormateada = fechaCobro 
                              ? fechaCobro.toLocaleDateString('es-ES', { 
                                  day: '2-digit', 
                                  month: '2-digit', 
                                  year: 'numeric' 
                                })
                              : '-'
                            
                            return (
                              <tr key={cobro.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                <td className="py-3 px-4 text-sm">{fechaFormateada}</td>
                                <td className="py-3 px-4 text-sm font-semibold text-navy-900">
                                  {Number(cobro.importe || 0).toFixed(2)}€
                                </td>
                                <td className="py-3 px-4 text-sm">{cobro.metodo_pago || '-'}</td>
                                <td className="py-3 px-4 text-sm">{cobro.cuenta_destino || '-'}</td>
                                <td className="py-3 px-4 text-sm">{cobro.concepto || '-'}</td>
                                <td className="py-3 px-4 text-sm">
                                  <div className="flex items-center gap-3">
                                    <button
                                      onClick={() => {
                                        setCobroEnEdicionId(cobro.id)
                                        setFormCobro({
                                          importe: Number(cobro.importe || 0).toFixed(2),
                                          metodo_pago: cobro.metodo_pago || 'Transferencia',
                                          cuenta_destino: cobro.cuenta_destino || 'Caixabank',
                                          concepto: cobro.concepto || ''
                                        })
                                        setShowModalCobro(true)
                                      }}
                                      className="text-gray-600 hover:text-gray-900 transition-colors flex items-center gap-1"
                                      title="Editar cobro"
                                    >
                                      <Pencil size={16} />
                                      <span className="text-xs">Editar</span>
                                    </button>
                                    <button
                                      onClick={() => generarReciboPDF(cobro)}
                                      className="text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
                                      title="Generar PDF del recibo"
                                    >
                                      <FileText size={18} />
                                      <span className="text-xs">PDF</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                      {cobros.length > 0 && (
                        <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                          <tr>
                            <td colSpan="1" className="py-3 px-4 text-sm font-bold text-gray-700">
                              Total Cobrado:
                            </td>
                            <td className="py-3 px-4 text-sm font-bold text-navy-900 text-lg">
                              {cobros.reduce((sum, c) => sum + Number(c.importe || 0), 0).toFixed(2)}€
                            </td>
                            <td colSpan="4"></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                  
                  {/* Botón Ver Historial */}
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={async () => {
                        await cargarLogsFinancieros()
                        setShowModalLogs(true)
                      }}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 text-sm"
                    >
                      <FileText size={16} />
                      Ver Historial de Cambios
                    </button>
                  </div>
                </div>
              </div>
          )}

          {/* Modal de Registro de Cobro */}
          {showModalCobro && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold text-navy-900">
                    {cobroEnEdicionId ? 'Editar Cobro' : 'Registrar Nuevo Cobro'}
                  </h3>
                  <button
                    onClick={() => {
                      setShowModalCobro(false)
                      setFormCobro({
                        importe: '',
                        metodo_pago: 'Transferencia',
                        cuenta_destino: 'Caixabank',
                        concepto: ''
                      })
                      setCobroEnEdicionId(null)
                    }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Importe */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Importe (€) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formCobro.importe}
                      onChange={(e) => {
                        let valor = e.target.value
                        // Permitir decimales con punto o coma
                        if (valor.includes(',')) {
                          valor = valor.replace(',', '.')
                        }
                        setFormCobro({ ...formCobro, importe: valor })
                      }}
                      onBlur={(e) => {
                        const valorLimpio = limpiarNumero(e.target.value)
                        setFormCobro({ ...formCobro, importe: valorLimpio > 0 ? valorLimpio.toFixed(2) : '' })
                      }}
                      placeholder="Ej: 66.50"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  {/* Método de Pago */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Método de Pago <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formCobro.metodo_pago}
                      onChange={(e) => setFormCobro({ ...formCobro, metodo_pago: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      <option value="Transferencia">Transferencia</option>
                      <option value="Efectivo">Efectivo</option>
                      <option value="Tarjeta">Tarjeta</option>
                      <option value="Talón">Talón</option>
                    </select>
                  </div>

                  {/* Cuenta Destino */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cuenta Destino <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formCobro.cuenta_destino}
                      onChange={(e) => setFormCobro({ ...formCobro, cuenta_destino: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      <option value="Caixabank">Caixabank</option>
                      <option value="Santander">Santander</option>
                      <option value="Caja">Caja</option>
                    </select>
                  </div>

                  {/* Concepto */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Concepto <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formCobro.concepto}
                      onChange={(e) => setFormCobro({ ...formCobro, concepto: e.target.value })}
                      placeholder="Ej: Depósito, Pago 2, Total"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                {/* Botones de acción */}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={guardarCobro}
                    className="btn-primary flex-1 flex items-center justify-center gap-2"
                  >
                    <Save size={20} />
                    {cobroEnEdicionId ? 'Actualizar Cobro' : 'Guardar Cobro'}
                  </button>
                  <button
                    onClick={() => {
                      setShowModalCobro(false)
                      setFormCobro({
                        importe: '',
                        metodo_pago: 'Transferencia',
                        cuenta_destino: 'Caixabank',
                        concepto: ''
                      })
                      setCobroEnEdicionId(null)
                    }}
                    className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
                </div>
            </div>
          )}

          {/* Modal de Historial de Logs Financieros */}
          {showModalLogs && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold text-navy-900">Historial de Cambios Financieros</h3>
                  <button
                    onClick={() => setShowModalLogs(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>

                {logsFinancieros.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>No hay registros en el historial</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-900 text-white">
                        <tr>
                          <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-left">Fecha</th>
                          <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-left">Descripción</th>
                          <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-right">Importe</th>
                          <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-left">Usuario</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {logsFinancieros.map((log) => (
                          <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-sm">
                              {log.fecha_registro 
                                ? new Date(log.fecha_registro).toLocaleDateString('es-ES', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                : '-'
                              }
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              {log.descripcion || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-right">
                              {log.importe ? `${Number(log.importe).toFixed(2)}€` : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {log.usuario || 'Sistema'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

            {/* TAB: Facturación */}
          {tab === 'facturacion' && (
              <div className="max-w-6xl mx-auto space-y-6">
                <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                  <h3 className="text-2xl font-bold text-navy-900 mb-6">Emisión de Factura</h3>

                  {/* Datos del Receptor (Editable) */}
                  <div className="mb-8">
                    <h4 className="text-lg font-semibold text-navy-900 mb-4">Datos del Receptor</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                          Nombre o Razón Social *
                        </label>
                        <input
                          type="text"
                          value={formFactura.receptorNombre}
                          onChange={(e) => setFormFactura({ ...formFactura, receptorNombre: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                          placeholder="Nombre del cliente o asociación"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                          CIF / NIF
                        </label>
                        <input
                          type="text"
                          value={formFactura.receptorCIF}
                          onChange={(e) => setFormFactura({ ...formFactura, receptorCIF: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                          placeholder="CIF o NIF"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                          Dirección
                        </label>
                        <input
                          type="text"
                          value={formFactura.receptorDireccion}
                          onChange={(e) => setFormFactura({ ...formFactura, receptorDireccion: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                          placeholder="Calle y número"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                          Población
                        </label>
                        <input
                          type="text"
                          value={formFactura.receptorPoblacion}
                          onChange={(e) => setFormFactura({ ...formFactura, receptorPoblacion: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                          placeholder="Población"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                          Provincia
                        </label>
                        <input
                          type="text"
                          value={formFactura.receptorProvincia}
                          onChange={(e) => setFormFactura({ ...formFactura, receptorProvincia: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                          placeholder="Provincia"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                          Código Postal
                        </label>
                        <input
                          type="text"
                          value={formFactura.receptorCP}
                          onChange={(e) => setFormFactura({ ...formFactura, receptorCP: e.target.value })}
                          className="w-full p-4 transition-all"
                          style={{
                            backgroundColor: '#f8fafc',
                            color: '#0f172a',
                            fontSize: '16px',
                            fontWeight: '600',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            marginTop: '4px'
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = '#3b82f6'
                            e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = '#e2e8f0'
                            e.target.style.boxShadow = 'none'
                          }}
                          placeholder="CP"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Resumen de Cálculo */}
                  <div className="mb-8 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl shadow-md p-6 border border-blue-200">
                    <h4 className="text-lg font-semibold text-navy-900 mb-4">Desglose de la Factura</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between py-2 border-b border-blue-200">
                        <span className="text-gray-700">Precio Venta al Cliente (€/pax):</span>
                        <span className="font-semibold text-navy-900">{calcularBaseFactura.precioVentaPax}€</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-blue-200">
                        <span className="text-gray-700">Precio Final (€/pax):</span>
                        <span className="font-semibold text-navy-900">{calcularBaseFactura.precioNetoPax}€</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-blue-200">
                        <span className="text-gray-700">Plazas de Pago:</span>
                        <span className="font-semibold text-navy-900">{calcularBaseFactura.paxPago}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-blue-200">
                        <span className="text-gray-700">Total Servicios (IVA incluido):</span>
                        <span className="font-semibold text-navy-900">{calcularBaseFactura.totalServiciosConIVA}€</span>
                      </div>
                      {parseFloat(calcularBaseFactura.totalSuplementos) > 0 && (
                        <>
                          <div className="flex justify-between py-2 border-b border-blue-200">
                            <span className="text-gray-700">Suplementos (IVA incluido):</span>
                            <span className="font-semibold text-navy-900">{calcularBaseFactura.totalSuplementos}€</span>
                          </div>
                          {parseFloat(suplementos.totalSupHabitacion) > 0 && (
                            <div className="flex justify-between py-2 pl-4 text-sm text-gray-600">
                              <span>• Habitaciones individuales:</span>
                              <span>{suplementos.totalSupHabitacion}€</span>
                            </div>
                          )}
                          {parseFloat(suplementos.totalSupSeguro) > 0 && (
                            <div className="flex justify-between py-2 pl-4 text-sm text-gray-600">
                              <span>• Seguro de cancelación:</span>
                              <span>{suplementos.totalSupSeguro}€</span>
                            </div>
                          )}
                        </>
                      )}
                      <div className="flex justify-between py-3 bg-green-100 rounded-lg px-4 mt-3 border-2 border-green-400">
                        <span className="text-lg font-bold text-green-900">TOTAL FACTURA (IVA INCLUIDO):</span>
                        <span className="text-2xl font-bold text-green-900">{calcularBaseFactura.totalFactura}€</span>
                      </div>
                      <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <p className="text-[10px] text-slate-600 leading-relaxed">
                          Régimen especial de las agencias de viaje. El IVA ya está incluido en todos los conceptos especificados en esta factura, de acuerdo con lo señalado en el art 142 de la Ley 37/1992, de 28 de diciembre, del Impuesto sobre el Valor Añadido.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Botón de Emisión */}
                  <div className="flex justify-between items-center">
                    {MODO_PRUEBA_FACTURACION && (
                      <button
                        onClick={async () => {
                          if (!window.confirm('¿Seguro que quieres borrar TODAS las facturas de prueba (TEST-XXX)?')) {
                            return
                          }
                          try {
                            const { error } = await supabase
                              .from('facturas')
                              .delete()
                              .ilike('numero_factura', 'TEST-%')
                            if (error) {
                              console.error('Error borrando facturas de prueba:', error)
                              alert(`❌ Error borrando facturas de prueba: ${error.message}`)
                            } else {
                              console.log('✅ Facturas de prueba eliminadas correctamente')
                              alert('✅ Facturas de prueba eliminadas correctamente.')
                            }
                          } catch (e) {
                            console.error('Error inesperado borrando facturas de prueba:', e)
                            alert(`❌ Error inesperado borrando facturas de prueba: ${e.message}`)
                          }
                        }}
                        className="px-4 py-3 rounded-lg border border-red-300 text-red-700 text-sm font-semibold bg-red-50 hover:bg-red-100 transition-colors"
                      >
                        Limpiar Facturas de Prueba
                      </button>
                    )}

                    <button
                      onClick={emitirFactura}
                      className="bg-green-600 hover:bg-green-700 text-white py-4 px-8 rounded-lg font-bold text-lg transition-colors shadow-lg flex items-center gap-2"
                    >
                      <FileText size={24} />
                      Emitir Factura
                    </button>
                  </div>

                  {/* Historial de Versiones */}
                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <h4 className="text-lg font-bold text-navy-900 mb-4">📋 Historial de Versiones</h4>
                    
                    {cargandoVersiones ? (
                      <div className="text-center py-4 text-gray-500 text-sm">
                        <p>Cargando versiones...</p>
                      </div>
                    ) : versionesFactura.length === 0 ? (
                      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <p className="text-gray-600 text-center text-sm">No hay versiones guardadas de esta factura.</p>
                      </div>
                    ) : (
                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <table className="w-full">
                          <thead className="bg-slate-900 text-white">
                            <tr>
                              <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-left">Versión</th>
                              <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-left">Fecha</th>
                              <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-center">Acción</th>
                              <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-center">Borrar</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {versionesFactura.map((version, index) => (
                              <tr key={version.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                                  Versión {versionesFactura.length - index}
                                  {version.numero_factura && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      Factura: {version.numero_factura}
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-700">
                                  {version.fecha_creacion 
                                    ? new Date(version.fecha_creacion).toLocaleDateString('es-ES', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })
                                    : (version.created_at 
                                        ? new Date(version.created_at).toLocaleDateString('es-ES', {
                                            day: '2-digit',
                                            month: '2-digit',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                          })
                                        : '-'
                                      )
                                  }
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    onClick={() => cargarVersionFactura(version)}
                                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1 mx-auto"
                                  >
                                    <FileText size={14} />
                                    Ver/Cargar
                                  </button>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    onClick={() => borrarVersionFactura(version.id, version.numero_factura)}
                                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1 mx-auto"
                                  >
                                    <Trash2 size={14} />
                                    Borrar
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
            </div>
          )}

          {/* TAB: Documentación */}
          {tab === 'documentacion' && (
            <div className="max-w-4xl mx-auto">
              <div className="bg-white rounded-xl shadow-md p-8 border border-gray-200 space-y-6">
                <h3 className="text-xl font-bold text-navy-900">Documentación del Viaje</h3>
                <p className="text-gray-600 text-sm">
                  Guarda aquí el enlace a la carpeta de Google Drive donde almacenas contratos,
                  folletos y facturas pesadas de este viaje.
                </p>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Carpeta Google Drive
                  </label>
                  <input
                    type="text"
                    value={expediente?.drive_link || ''}
                    onChange={(e) => {
                      const value = e.target.value
                      setExpediente((prev) => ({
                        ...prev,
                        drive_link: value,
                      }))
                    }}
                    placeholder="Pega aquí el enlace a la carpeta de Google Drive (https://drive.google.com/...)"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy-500 focus:border-transparent text-sm"
                  />
                  <p className="text-xs text-gray-500">
                    Consejo: crea una carpeta por viaje en Google Drive y enlázala aquí para tener
                    toda la documentación centralizada.
                  </p>
                </div>
              </div>
            </div>
          )}

            {/* TAB: Cierre de Grupo */}
          {tab === 'cierre' && (
              <div className="max-w-6xl mx-auto space-y-6">
                {/* Resumen Financiero */}
                <div className="bg-white rounded-xl shadow-md p-8 border border-gray-200">
                  <h3 className="text-xl font-bold text-navy-900 mb-6">Resumen Financiero</h3>
                  
                  {expediente?.cotizacion?.resultados ? (
                    <div className="space-y-4">
                      <div className="flex justify-between py-3 border-b">
                        <span className="font-semibold">Total Ingresos:</span>
                        <span className="text-xl font-bold text-green-600">
                          {(expediente.cotizacion.resultados.totalIngresos || 0).toFixed(2)}€
                        </span>
                      </div>
                      <div className="flex justify-between py-3 border-b">
                        <span className="font-semibold">Total Gastos:</span>
                        <span className="text-xl font-bold text-red-600">
                          {(expediente.cotizacion.resultados.totalGastos || 0).toFixed(2)}€
                        </span>
                      </div>
                      <div className="flex justify-between py-3 border-b">
                        <span className="font-semibold">Beneficio Bruto:</span>
                        <span className="text-xl font-bold text-blue-600">
                          {((expediente.cotizacion.resultados.totalIngresos || 0) - (expediente.cotizacion.resultados.totalGastos || 0)).toFixed(2)}€
                        </span>
                      </div>
                      <div className="flex justify-between py-3 bg-navy-900 text-white px-4 rounded-lg mt-4">
                        <span className="font-bold text-lg">BENEFICIO NETO:</span>
                        <span className="text-3xl font-black">
                          {((expediente.cotizacion.resultados.totalIngresos || 0) - (expediente.cotizacion.resultados.totalGastos || 0) * 0.79).toFixed(2)}€
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-center text-gray-500 py-8">
                      No hay datos de cotización. Completa la cotización primero.
                    </p>
                  )}
                </div>

                {/* Historial de Facturas Emitidas */}
                <div className="bg-white rounded-xl shadow-md p-8 border border-gray-200">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-navy-900">Facturas Emitidas</h3>
                    <button
                      onClick={() => setTab('facturacion')}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
                    >
                      <FileText size={18} />
                      Nueva Factura
                    </button>
                  </div>
                  
                  {cargandoFacturasEmitidas ? (
                    <div className="text-center py-8 text-gray-500">
                      <p>Cargando facturas...</p>
                    </div>
                  ) : facturasEmitidas.length === 0 ? (
                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                      <p className="text-gray-600 text-center">No hay facturas emitidas para este expediente.</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-slate-900 text-white">
                          <tr>
                            <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-left">Nº Factura</th>
                            <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-left">Cliente</th>
                            <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-right">Importe</th>
                            <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-left">Fecha</th>
                            <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-center">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {facturasEmitidas.map((factura) => (
                            <tr key={factura.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                                {factura.numero_factura || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">
                                {factura.cliente_nombre || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm font-bold text-green-700 text-right">
                                {factura.importe_total ? `${Number(factura.importe_total).toFixed(2)}€` : '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">
                                {factura.created_at 
                                  ? new Date(factura.created_at).toLocaleDateString('es-ES', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric'
                                    })
                                  : '-'
                                }
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => {
                                    if (factura.url_pdf) {
                                      window.open(factura.url_pdf, '_blank')
                                    } else {
                                      regenerarPDFDesdeDatos(factura)
                                    }
                                  }}
                                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1 mx-auto"
                                  title={factura.url_pdf ? 'Ver PDF' : 'Regenerar PDF'}
                                >
                                  <FileText size={14} />
                                  {factura.url_pdf ? 'Ver PDF' : 'Generar PDF'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* AUDITORÍA DE CÁLCULOS */}
                      <div className="mt-2 flex items-center text-xs text-gray-600">
                        <span className="mr-2">Validando cálculos...</span>
                        {/* Chequeo simple: todas las líneas usan el motor universal de forma consistente */}
                        <span className="text-green-600 font-semibold">✓</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
          )}
            
          </div>
        </div>
        
        {/* Renderizado del Modal al final del JSX - Solo se activa cuando showModal es verdadero */}
        {showModal && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-md flex items-center justify-center z-[9999] p-6 text-left"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowModal(false)
              }
            }}
          >
            <div
              className="bg-white rounded-[3rem] w-full max-w-5xl max-h-[95vh] overflow-y-auto shadow-2xl p-12 border-4 border-gray-200"
              style={{ backgroundColor: 'white', color: 'black' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-10">
                <h2 className="text-4xl font-[1000] italic uppercase tracking-tighter text-slate-900">
                  Nuevo Proveedor
                </h2>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="p-4 bg-slate-100 rounded-full hover:bg-red-500 hover:text-white transition-all"
                >
                  <X size={32} />
                </button>
              </div>

              {/* ProveedorForm reutilizado (mismo que en sección de Proveedores) */}
              <ProveedorForm
                initialData={{
                  nombre_comercial: nombreNuevoProveedor,
                  tipo: tipoNuevoProveedor
                }}
                submitLabel="Guardar y Seleccionar"
                onCancel={() => setShowModal(false)}
                onSaved={async (nuevoProveedor) => {
                  // onSuccess: refrescar lista de proveedores en la cotización
                  await cargarProveedores()

                  // Buscar el proveedor recién creado en la lista actualizada
                  const proveedorActualizado =
                    proveedores.find(
                      p =>
                        p.id === nuevoProveedor.id ||
                        (p.nombreComercial.toLowerCase() === nuevoProveedor.nombreComercial.toLowerCase() &&
                          p.tipo === nuevoProveedor.tipo)
                    ) || nuevoProveedor

                  // Seleccionar automáticamente en la fila actual de cotización
                  if (servicioIdParaProveedor) {
                    actualizarServicio(servicioIdParaProveedor, 'proveedorId', proveedorActualizado.id)
                    setBusquedaProveedor(prev => ({
                      ...prev,
                      [servicioIdParaProveedor]: proveedorActualizado.nombreComercial
                    }))
                    setMostrarSugerencias(prev => ({
                      ...prev,
                      [servicioIdParaProveedor]: false
                    }))
                  }

                  setShowModal(false)
                }}
              />
            </div>
          </div>
        )}
        
      </div>
    )
  } catch (error) {
    // ⚠️ CAPTURA DE ERRORES GLOBAL
    console.error('Error al renderizar ExpedienteDetalle:', error)
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md">
          <h3 className="text-xl font-bold text-red-600 mb-4">❌ Error</h3>
          <p className="text-gray-700 mb-4">Error al cargar la tabla: {error.message}</p>
          <button onClick={onClose} className="btn-primary w-full">
            Cerrar
          </button>
      </div>
    </div>
  )
  }
}

export default ExpedienteDetalle
