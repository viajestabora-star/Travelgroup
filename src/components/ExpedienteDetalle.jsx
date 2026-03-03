import React, { useState, useEffect, useMemo, useRef } from 'react'
import { X, Users, Calculator, Bed, DollarSign, FileUp, TrendingUp, Save, Upload, Trash2, Plus, FileText, Pencil, MapPin, Printer, FileDown, CheckCircle, CreditCard } from 'lucide-react'
import { storage } from '../utils/storage'
import { normalizarFechaEspañola, convertirEspañolAISO, convertirISOAEspañol, parsearFechaADate } from '../utils/dateNormalizer'
import { supabase } from '../supabase'
import ExpedienteFinanzas from './ExpedienteFinanzas'
import ServiciosCotizacionPanel from './ServiciosCotizacionPanel'
import EditableInput from './EditableInput'
import jsPDF from 'jspdf'

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

/** Compara formData de cotización con último guardado (para detectar cambios sin guardar) */
const formDataCotizacionIgual = (a, b) => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const keys = ['total_pax', 'gratuidades', 'precio_venta_cliente', 'bonificacion_pax', 'sup_individual_pax', 'sup_individual_precio_dia', 'sup_seguro_pax', 'sup_seguro_precio_total'];
  return keys.every(k => toNum(a[k]) === toNum(b[k]));
};

/**
 * ============ DEFAULT_SERVICE_VALUES - DEFENSA CONTRA UNDEFINED ============
 * Valores por defecto para cualquier tipo de servicio. Campos canónicos únicos (sin duplicados).
 */
const DEFAULT_SERVICE_VALUES = {
  id: null,
  proveedorId: null,
  proveedorNombreTemporal: '',
  mayorista_id: null,
  tipo: 'Hotel',
  tipo_servicio: 'Hotel',
  tipo_calculo: 'porPersona', // 'porPersona' | 'porGrupo' (Precio por Persona | Total a dividir)
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
};

/**
 * ============ MOTOR DE CÁLCULO (MÓDULO) - CÓDIGO CRÍTICO ============
 * - porPersona: Precio por Persona → total = coste_pax × totalPax
 * - porGrupo: Total a dividir entre el grupo → coste_pax = total / pasajeros_pago
 * - Autobús: Siempre divide el total entre pasajeros_pago (equivalente a porGrupo)
 */
const finalizarCalculoModulo = (servicio, paxPago = 31, paxTotal = 35) => {
  const s = servicio || {};
  const pP = Math.max(1, toNum(paxPago));
  const pT = Math.max(1, toNum(paxTotal));
  const precio = toNum(s.coste_unitario);
  const n = Math.max(1, toNum(s.noches));
  const d = Math.max(1, toNum(s.dias_guia));
  const manual = toNum(s.total_servicio_manual);
  const tipoNorm = normalizarTipo(s?.tipo_servicio || s?.tipo || '');
  const esPorGrupo = s?.tipo_calculo === 'porGrupo' || s?.tipo_calculo === 'Total a dividir';
  const esAutobusOTransporte = tipoNorm === 'autobus' || tipoNorm === 'transporte';

  let totalFinal = 0;
  let costePorPersona = 0;

  if (esAutobusOTransporte || esPorGrupo) {
    // Autobús/Transporte o Total a dividir: total = manual (o precio×cantidad para guía), coste_pax = total / pasajeros_pago
    totalFinal = manual > 0 ? manual : (tipoNorm === 'guia' || tipoNorm === 'g' ? precio * Math.max(1, toNum(s.cantidad ?? d)) : precio);
    costePorPersona = pP > 0 ? totalFinal / pP : 0;
  } else {
    // Precio por Persona: coste_pax = precio × factor, total = coste_pax × totalPax
    const factor = (tipoNorm === 'hotel') ? n : (tipoNorm === 'guia' || tipoNorm === 'g' ? d : 1);
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

  const pP = Math.max(1, toNum(paxPago));
  const pT = Math.max(1, toNum(totalPax));
  const gratuidades = Math.max(0, toNum(formData?.gratuidades));

  try {
    const bonif = Math.max(0, toNum(formData?.bonificacion_pax));
    let costeBusPorPax = 0, costeGuiaPorPax = 0, costeGuiaLocalPorPax = 0, costeHotelPorPax = 0;
    let costeSeguroPorPax = 0, costeEntradasPorPax = 0, costeRestaurantePorPax = 0, costeOtrosPorPax = 0;

    const normalizarTipoCalc = (tc) => (tc === 'porGrupo' || tc === 'Total a dividir' ? 'porGrupo' : 'porPersona');
    const getCosteUnitario = (s) => toNum(s.coste_unitario ?? s.costeUnitario ?? s.precio_manual);
    const getTotalManual = (s) => toNum(s.total_servicio_manual ?? s.totalServicio ?? s.total_servicio);

    servicios.forEach((servicio) => {
      const s = { ...DEFAULT_SERVICE_VALUES, ...servicio };
      const fila = {
        ...s,
        tipo_calculo: normalizarTipoCalc(s.tipo_calculo || s.tipoCalculo),
        tipo_servicio: s.tipo_servicio || s.tipo || '',
        coste_unitario: getCosteUnitario(s),
        noches: Math.max(1, toNum(s.noches)),
        dias_guia: toNum(s.dias_guia) || Math.max(1, toNum(s.noches)),
        total_servicio_manual: getTotalManual(s),
      };
      const tipoNorm = normalizarTipo(s.tipo || s.tipo_servicio || 'Hotel') || 'hotel';

      let costePax = 0;
      if (tipoNorm === 'guia' || tipoNorm === 'g') {
        const cantidad = Math.max(1, toNum(s.cantidad ?? s.dias_guia ?? 1));
        costePax = pP > 0 ? (getCosteUnitario(s) * cantidad) / pP : 0;
      } else {
        const { coste_pax } = finalizarCalculoModulo(fila, paxPago, totalPax);
        costePax = toNum(coste_pax);
      }

      if (tipoNorm === 'autobus' || tipoNorm === 'transporte') costeBusPorPax += costePax;
      else if (tipoNorm === 'guialocal' || tipoNorm === 'guia local') costeGuiaLocalPorPax += costePax;
      else if (tipoNorm === 'guia' || tipoNorm === 'g') costeGuiaPorPax += costePax;
      else if (tipoNorm === 'hotel') costeHotelPorPax += costePax;
      else if (tipoNorm === 'seguro') costeSeguroPorPax += costePax;
      else if (tipoNorm === 'entradas' || tipoNorm.includes('entradas')) costeEntradasPorPax += costePax;
      else if (tipoNorm === 'restaurante') costeRestaurantePorPax += costePax;
      else costeOtrosPorPax += costePax;
    });

    const costeBasePorPersona = costeBusPorPax + costeGuiaPorPax + costeGuiaLocalPorPax + costeHotelPorPax +
      costeSeguroPorPax + costeEntradasPorPax + costeRestaurantePorPax + costeOtrosPorPax;

    let costeTotalProveedor = 0;
    servicios.forEach((servicio) => {
      const s = { ...DEFAULT_SERVICE_VALUES, ...servicio };
      const tipoNorm = normalizarTipo(s.tipo || s.tipo_servicio || 'Hotel') || 'hotel';
      const fila = {
        ...s,
        tipo_calculo: normalizarTipoCalc(s.tipo_calculo || s.tipoCalculo),
        tipo_servicio: s.tipo_servicio || s.tipo || '',
        coste_unitario: getCosteUnitario(s),
        noches: Math.max(1, toNum(s.noches)),
        dias_guia: toNum(s.dias_guia) || Math.max(1, toNum(s.noches)),
        total_servicio_manual: getTotalManual(s),
      };
      if (tipoNorm === 'guia' || tipoNorm === 'g') {
        const cantidad = Math.max(1, toNum(s.cantidad ?? s.dias_guia ?? 1));
        costeTotalProveedor += getCosteUnitario(s) * cantidad;
      } else {
        const { total_servicio } = finalizarCalculoModulo(fila, paxPago, totalPax);
        costeTotalProveedor += toNum(total_servicio);
      }
    });

    // Prorrateo: coste de gratuidades se reparte entre pasajeros de pago
    // Fórmula documentada: Coste Real = Coste Base + Prorrateo Gratuidades + Bonificación
    const costePlazasGratuitas = costeBasePorPersona * gratuidades;
    const costeGratuidadesPorPax = pP > 0 ? costePlazasGratuitas / pP : 0;
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
      costeBaseGratuidad: costeBasePorPersona.toFixed(2),
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
      gratuidades,
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

const ExpedienteDetalle = ({ expediente, onClose, onUpdate, onRefresh, clientes = [], initialTab }) => {
  const cierreGrupo = expediente?.cierre_grupo || {}

  // Modo de prueba temporal para facturación
  const MODO_PRUEBA_FACTURACION = true

  // Estados
  const [tab, setTab] = useState('grupo')
  const [editandoCliente, setEditandoCliente] = useState(false)

  // Abrir en tab específica cuando se navega desde Historial de Cierres (Ver Detalle)
  useEffect(() => {
    if (initialTab && ['grupo', 'cotizacion', 'pasajeros', 'cobros', 'pagosProveedores', 'facturacion', 'documentacion', 'cierre'].includes(initialTab)) {
      setTab(initialTab)
    }
  }, [initialTab])

  // Restaurar cierre_grupo guardado (JSONB: total_ingresos, total_gastos, beneficio, fecha + detalle)
  useEffect(() => {
    const cg = expediente?.cierre_grupo
    if (typeof cg !== 'object' || cg === null) return
    if (cg.ingresos || Array.isArray(cg.costesReales) || Array.isArray(cg.gastosImprevistos)) {
      setInformeLiquidacion(prev => ({
        ...prev,
        ingresos: cg.ingresos || prev.ingresos,
        costesReales: Array.isArray(cg.costesReales) ? cg.costesReales : (prev.costesReales || []),
        gastosImprevistos: Array.isArray(cg.gastosImprevistos) ? cg.gastosImprevistos : (prev.gastosImprevistos || []),
      }))
    }
  }, [expediente?.id])
  
  const informeLiquidacionInicializadoRef = useRef(false)

  // Ref para detectar cambios sin guardar en cotización (formData)
  const lastSavedFormDataRef = useRef(null)
  const [guardadoExitoCotizacion, setGuardadoExitoCotizacion] = useState(false)

  // Estado local del Cierre de Grupo (editable, NO machaca cotización)
  // costesReales: desde servicios cotización, con coste_real editable (factura proveedor)
  // gastosImprevistos: conceptos extra (taxis, propinas, reparaciones, etc.)
  const [informeLiquidacion, setInformeLiquidacion] = useState({
    ingresos: { precioViaje: 0, suplementos: 0, descuentos: 0 },
    costesReales: [],      // { id_servicio, concepto, proveedor, coste_cotizado, coste_real }
    gastosImprevistos: [], // { id, concepto, importe }
  })
  
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
  
  // Estados para Historial de Expedientes
  const [expedientesHistorial, setExpedientesHistorial] = useState([])
  const [cargandoHistorial, setCargandoHistorial] = useState(false)

  // Estados para Pagos a Proveedores
  const [pagosProveedores, setPagosProveedores] = useState([])
  const [cargandoPagosProveedores, setCargandoPagosProveedores] = useState(false)
  const [formPago, setFormPago] = useState({ servicio_id: '', fecha_pago: '', importe_pagado: '' })

  // Cliente(s) del expediente: relación directa expedientes.cliente_id → clientes (tabla expediente_clientes NO existe)
  const expedienteClientes = useMemo(() => {
    const mainId = expediente?.cliente_id || expediente?.clienteId
    if (!mainId) return []
    const c = clientes.find(x => String(x.id) === String(mainId))
    const nombre = c?.nombre || expediente?.cliente_nombre || expediente?.clienteNombre || '—'
    return [{ id: mainId, cliente_id: mainId, cliente_nombre: nombre }]
  }, [expediente?.cliente_id, expediente?.clienteId, expediente?.cliente_nombre, expediente?.clienteNombre, clientes])

  // Cliente principal y grupo (derivados) - usados por paxPorAsociacion y cierre
  const clienteIdPrincipal = expediente?.clienteId ?? expediente?.cliente_id
  const grupo = clientes.find(c => String(c.id) === String(clienteIdPrincipal)) || {
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
  
  // Función para cargar proveedores desde Supabase
  const cargarProveedores = async () => {
    try {
      const { data, error } = await supabase
        .from('proveedores')
        .select('*')
        .order('nombre_comercial', { ascending: true }); // Regla 1.14: siempre A-Z alfabético
      
      if (error) {
        // Fallback: intentar cargar desde storage (sesión anterior)
        try {
          const cached = storage.get('proveedores')
          if (Array.isArray(cached) && cached.length > 0) {
            const conEsMayorista = cached.map(c => ({ ...c, es_mayorista: !!c.es_mayorista }))
            setProveedores(conEsMayorista)
            return
          }
        } catch (_) {}
        setProveedores([])
        return
      }
      
      if (!data || !Array.isArray(data) || data.length === 0) {
        // Fallback: usar cache de storage si la BD está vacía
        try {
          const cached = storage.get('proveedores')
          if (Array.isArray(cached) && cached.length > 0) {
            const conEsMayorista = cached.map(c => ({ ...c, es_mayorista: !!c.es_mayorista }))
            setProveedores(conEsMayorista)
            return
          }
        } catch (_) {}
        setProveedores([])
        return
      }
      
      // Mapear campos de Supabase a formato interno
      // id: preservar UUID como string (mayorista_id espera UUID); si es numérico, usar Number (proveedor_id_int)
      const proveedoresMapeados = data.map(p => {
        const rawId = p.id
        const esUuid = typeof rawId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId)
        const id = esUuid ? rawId : (typeof rawId === 'number' ? rawId : Number(rawId))
        return {
          id,
          nombreComercial: p.nombre_comercial || p.nombreComercial || '',
          nombreFiscal: p.nombre_fiscal || p.nombreFiscal || p.nombre_comercial || '',
          tipo: p.tipo || '',
          telefono: p.telefono || p.movil || '',
          email: p.email || '',
          direccion: p.direccion || '',
          poblacion: p.poblacion || '',
          cif: p.cif || '',
          es_mayorista: p.es_mayorista === true || p.es_mayorista === 'true'
        }
      });
      
      setProveedores(proveedoresMapeados)
      
      try {
      storage.set('proveedores', proveedoresMapeados)
      } catch (storageError) {
        // Silenciar error de localStorage
      }
      
    } catch (error) {
      setProveedores([])
    }
  };

  // Cargar proveedores desde Supabase al montar (imprescindible para dropdowns de Cotización)
  useEffect(() => {
    cargarProveedores()
  }, [])

  // Cargar servicios de cotización cuando se abre el expediente (para Cierre de Grupo y otras pestañas)
  // Así "Cargar desde Cotización" funciona aunque el usuario no haya visitado la pestaña Cotización
  const cargarServiciosCotizacion = async () => {
    const id = expediente?.id
    if (!id) return
    try {
      let serviciosResponse = await supabase
        .from('servicios_cotizacion')
        .select('*')
        .eq('id_expediente', String(id).trim())
        .order('created_at', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })

      if (serviciosResponse.error && (serviciosResponse.error.code === 'PGRST204' || String(serviciosResponse.error.message || '').includes('created_at'))) {
        serviciosResponse = await supabase
          .from('servicios_cotizacion')
          .select('*')
          .eq('id_expediente', String(id).trim())
          .order('id', { ascending: true })
      }

      const data = serviciosResponse.data
      if (data && Array.isArray(data) && data.length > 0) {
        const coste = (v) => toNum(v)
        const todosMapeados = data.map((row) => {
          const proveedorIdInt = row.proveedor_id_int ? Number(row.proveedor_id_int) : null
          const c = coste(row.coste_unitario ?? row.precio_venta)
          const esPorGrupo = row.tipo_calculo === 'Total a dividir' || row.tipo_calculo === 'porGrupo'
          return {
            ...DEFAULT_SERVICE_VALUES,
            id: row.id || generarUUID(),
            proveedorId: proveedorIdInt,
            proveedorNombreTemporal: row.nombre_proveedor_manual || '',
            tipo: row.tipo_servicio || row.tipo || 'Hotel',
            tipo_servicio: row.tipo_servicio || row.tipo || 'Hotel',
            nombreEspecifico: row.nombre_especifico || '',
            localizacion: row.localizacion || '',
            especificacion_destino: row.especificacion_destino || '',
            coste_unitario: c,
            total_servicio_manual: esPorGrupo ? c : 0,
            tipo_calculo: esPorGrupo ? 'porGrupo' : 'porPersona',
            margen: coste(row.margen_pax),
            noches: Math.max(1, coste(row.noches)),
            dias_guia: coste(row.dias_guia) || Math.max(1, coste(row.noches)),
            cantidad: Math.max(1, coste(row.cantidad ?? row.dias_guia ?? row.noches ?? 1)),
            fechaRelease: row.fecha_release ? String(row.fecha_release).split('T')[0] : '',
            releasePagado: !!row.release_pagado,
            mayorista_id: (row.mayorista_id != null && row.mayorista_id !== '') ? (typeof row.mayorista_id === 'string' && row.mayorista_id.includes('-') ? row.mayorista_id : String(row.mayorista_id)) : null,
          }
        })
        const tieneProveedor = (r) => r.proveedorId != null || (r.proveedorNombreTemporal && String(r.proveedorNombreTemporal).trim())
        const tieneNombreServicio = (r) => r.nombreEspecifico && String(r.nombreEspecifico).trim()
        const tieneTipo = (r) => r.tipo && String(r.tipo).trim()
        const tieneImporte = (r) => r.coste_unitario != null && Number(r.coste_unitario) > 0
        const tieneTotalManual = (r) => r.total_servicio_manual != null && Number(r.total_servicio_manual) > 0
        const tieneDatos = (r) => tieneProveedor(r) || tieneNombreServicio(r) || tieneImporte(r) || tieneTotalManual(r) || tieneTipo(r)
        const serviciosMapeados = todosMapeados.filter(tieneDatos)
        setServicios(serviciosMapeados)
      } else {
        setServicios([])
      }
    } catch (_) {
      setServicios([])
    }
  }

  useEffect(() => {
    if (expediente?.id) {
      cargarServiciosCotizacion()
    } else {
      setServicios([])
    }
  }, [expediente?.id])

  // Función para cargar historial de expedientes del mismo cliente
  const cargarHistorialExpedientes = async (nombreCliente) => {
    if (!nombreCliente || nombreCliente.trim() === '') {
      setExpedientesHistorial([])
      return
    }

    // Normalizar nombre: eliminar espacios extra y trim
    const nombreNormalizado = nombreCliente.trim().replace(/\s+/g, ' ')

    setCargandoHistorial(true)
    try {
      const { data, error } = await supabase
        .from('expedientes')
        .select('*')
        .ilike('cliente_nombre', nombreNormalizado)
        .order('fecha_inicio', { ascending: true, nullsFirst: false })


      if (error) {
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
            return { ...exp, beneficioNeto: null }
          }
        })
      )

      setExpedientesHistorial(expedientesConBeneficio)
    } catch (err) {
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
          // Liberar guardado incluso con error (usará valores por defecto)
          setDatosCargados(true)
          return
        }

        // Carga Blindada: Solo actualizar si los datos son válidos
        if (!data) {
          // Liberar guardado incluso sin datos (usará valores por defecto)
          setDatosCargados(true)
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
        
        // Carga Blindada: Solo establecer formData si los datos son válidos
        setFormData(datosCargados)
        lastSavedFormDataRef.current = { ...datosCargados }
        
        // Liberar guardado: Marcar como cargado para permitir guardados
        setDatosCargados(true)
      } catch (err) {
        // Limpiar timeout en caso de error
        clearTimeout(timeoutSeguridad)
        // Liberar guardado incluso con error (usará valores por defecto)
        setDatosCargados(true)
      }
    }

    // EJECUTAR SIEMPRE cuando hay expediente.id
    cargarDatosCompletos()

    // Cleanup: limpiar timeout si el componente se desmonta
    return () => {
      clearTimeout(timeoutSeguridad)
    }
  }, [expediente?.id]) // Solo depende del ID del expediente

  // Detectar cambios sin guardar en cotización (formData vs último guardado)
  const hasCotizacionSinGuardar = useMemo(() => {
    const last = lastSavedFormDataRef.current
    return last && formData && !formDataCotizacionIgual(formData, last)
  }, [formData])

  const recargarInformeDesdeCotizacion = () => {
    if (!servicios?.length) return
    informeLiquidacionInicializadoRef.current = false
    const precioViaje = paxPago * toNum(formData?.precio_venta_cliente)
    const suplementosVal = parseFloat(suplementos?.totalSuplementos || 0)
    const descuentosVal = toNum(formData?.bonificacion_pax) * paxPago
    const savedCostesReales = (informeLiquidacion.costesReales || []).reduce((acc, c) => {
      acc[c.id_servicio] = c.coste_real
      return acc
    }, {})
    const costesRealesIniciales = servicios.map((s) => {
      const prov = obtenerProveedorPorId(s?.proveedorId)
      const proveedor = prov?.nombreComercial || s?.proveedorNombreTemporal || '—'
      const tipo = s?.tipo || s?.tipo_servicio || 'Servicio'
      const nombre = s?.nombreEspecifico ? `${tipo} ${s.nombreEspecifico}` : tipo
      const concepto = nombre
      const fila = { ...DEFAULT_SERVICE_VALUES, ...s }
      const costeCotizado = calcularTotalFilaUI(s)
      const costeReal = savedCostesReales[s?.id] ?? costeCotizado
      return {
        id_servicio: s?.id || generarUUID(),
        concepto,
        proveedor,
        coste_cotizado: costeCotizado,
        coste_real: costeReal,
      }
    })
    setInformeLiquidacion(prev => ({
      ...prev,
      ingresos: { precioViaje, suplementos: suplementosVal, descuentos: descuentosVal },
      costesReales: costesRealesIniciales,
      gastosImprevistos: prev.gastosImprevistos || [],
    }))
    informeLiquidacionInicializadoRef.current = true
  }

  const actualizarInformeIngreso = (campo, valor) => {
    setInformeLiquidacion(prev => ({
      ...prev,
      ingresos: { ...prev.ingresos, [campo]: toNum(valor) }
    }))
  }
  const actualizarCosteReal = (idServicio, costeReal) => {
    setInformeLiquidacion(prev => ({
      ...prev,
      costesReales: prev.costesReales.map(c =>
        c.id_servicio === idServicio ? { ...c, coste_real: toNum(costeReal) } : c
      )
    }))
  }
  const agregarGastoImprevisto = () => {
    setInformeLiquidacion(prev => ({
      ...prev,
      gastosImprevistos: [...(prev.gastosImprevistos || []), { id: generarUUID(), concepto: '', importe: 0 }]
    }))
  }
  const eliminarGastoImprevisto = (id) => {
    setInformeLiquidacion(prev => ({
      ...prev,
      gastosImprevistos: (prev.gastosImprevistos || []).filter(g => g.id !== id)
    }))
  }
  const actualizarGastoImprevisto = (id, campo, valor) => {
    setInformeLiquidacion(prev => ({
      ...prev,
      gastosImprevistos: (prev.gastosImprevistos || []).map(g =>
        g.id === id ? { ...g, [campo]: campo === 'importe' ? toNum(valor) : valor } : g
      )
    }))
  }

  const categorizarPago = (concepto) => {
    const c = String(concepto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (/bus|autobus|transporte/.test(c)) return 'Bus'
    if (/restaurante/.test(c)) return 'Restaurante'
    if (/guia|guía/.test(c)) return 'Guía'
    return 'Otros'
  }

  const generarInformeLiquidacionPDF = () => {
    if (!expediente?.cierre_grupo || typeof expediente?.cierre_grupo !== 'object') return
    const cg = expediente?.cierre_grupo
    const ingresosTotales = Number(cg.ingresos_totales ?? cg.total_ingresos ?? 0)
    const gastosTotales = Number(cg.gastos_totales ?? cg.total_gastos ?? 0)
    const beneficioBruto = Number(cg.beneficio_bruto ?? (cg.beneficio_limpio ?? cg.beneficio ?? 0) + (cg.iva_pagado ?? 0))
    const ivaPagado = Number(cg.iva_pagado ?? 0)
    const beneficioLimpio = Number(cg.beneficio_limpio ?? cg.beneficio ?? beneficioBruto - ivaPagado)
    const costesReales = Array.isArray(cg.costesReales) ? cg.costesReales : []
    const gastosImprevistos = Array.isArray(cg.gastosImprevistos) ? cg.gastosImprevistos : []
    const grupo = expediente?.nombre_grupo || expediente?.cliente_nombre || 'Sin grupo'
    const viaje = expediente?.destino || 'Sin destino'

    const porCategoria = { Bus: [], Restaurante: [], Guía: [], Otros: [] }
    costesReales.forEach(c => {
      const cat = categorizarPago(c.concepto)
      porCategoria[cat].push(c)
    })

    const doc = new jsPDF()
    const pageW = doc.internal.pageSize.getWidth()
    let y = 24

    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 41, 59)
    doc.text('INFORME DE CIERRE FINANCIERO', pageW / 2, y, { align: 'center' })
    y += 14

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.text(`Grupo: ${grupo}`, 20, y)
    y += 6
    doc.text(`Viaje: ${viaje}`, 20, y)
    y += 12

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(30, 41, 59)
    doc.text('TOTAL INGRESOS', 20, y)
    doc.text(`${ingresosTotales.toFixed(2)} €`, pageW - 20, y, { align: 'right' })
    y += 10

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Desglose de pagos a proveedores', 20, y)
    y += 8

    const categoriasOrden = ['Bus', 'Restaurante', 'Guía', 'Otros']
    categoriasOrden.forEach(cat => {
      const items = porCategoria[cat]
      if (items.length === 0) return
      const subtotal = items.reduce((s, c) => s + Number(c.coste_real || 0), 0)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(51, 65, 85)
      doc.text(`${cat}`, 25, y)
      doc.text(`${subtotal.toFixed(2)} €`, pageW - 25, y, { align: 'right' })
      y += 5
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(100, 116, 139)
      items.forEach(c => {
        if (y > 270) { doc.addPage(); y = 20 }
        doc.text(`  ${(c.concepto || '—').substring(0, 50)} | ${(c.proveedor || '—').substring(0, 25)}`, 25, y)
        doc.text(`${Number(c.coste_real || 0).toFixed(2)} €`, pageW - 25, y, { align: 'right' })
        y += 4
      })
      y += 2
    })

    if (gastosImprevistos.length > 0) {
      if (y > 260) { doc.addPage(); y = 20 }
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text('Gastos imprevistos', 25, y)
      y += 5
      const totalImp = gastosImprevistos.reduce((s, g) => s + Number(g.importe || 0), 0)
      doc.text(`${totalImp.toFixed(2)} €`, pageW - 25, y - 5, { align: 'right' })
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      gastosImprevistos.forEach(g => {
        doc.text(`  ${(g.concepto || '—').substring(0, 60)}`, 25, y)
        doc.text(`${Number(g.importe || 0).toFixed(2)} €`, pageW - 25, y, { align: 'right' })
        y += 4
      })
      y += 4
    }

    y += 6
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.5)
    doc.line(20, y, pageW - 20, y)
    y += 10

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('TOTAL GASTOS', 20, y)
    doc.text(`${gastosTotales.toFixed(2)} €`, pageW - 20, y, { align: 'right' })
    y += 10

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Beneficio Bruto', 20, y)
    doc.text(`${beneficioBruto.toFixed(2)} €`, pageW - 20, y, { align: 'right' })
    y += 8

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text('IVA (21%): impuesto restado', 20, y)
    doc.text(`− ${ivaPagado.toFixed(2)} €`, pageW - 20, y, { align: 'right' })
    y += 10

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(16, 185, 129)
    doc.text('BENEFICIO NETO', 20, y)
    doc.text(`${beneficioLimpio.toFixed(2)} €`, pageW - 20, y, { align: 'right' })
    doc.setTextColor(0, 0, 0)

    doc.save(`Informe_Cierre_${grupo.replace(/\s+/g, '_')}_${viaje.replace(/\s+/g, '_')}.pdf`)
  }

  const imprimirInformeCierre = () => {
    if (!expediente?.cierre_grupo || typeof expediente.cierre_grupo !== 'object') return
    const ventana = window.open('', '_blank', 'width=800,height=600')
    if (!ventana) { alert('Permite ventanas emergentes para imprimir.'); return }
    const cg = expediente.cierre_grupo
    const ingresosTotales = Number(cg.ingresos_totales ?? cg.total_ingresos ?? 0)
    const gastosTotales = Number(cg.gastos_totales ?? cg.total_gastos ?? 0)
    const beneficioBruto = Number(cg.beneficio_bruto ?? (cg.beneficio_limpio ?? cg.beneficio ?? 0) + (cg.iva_pagado ?? 0))
    const ivaPagado = Number(cg.iva_pagado ?? 0)
    const beneficioLimpio = Number(cg.beneficio_limpio ?? cg.beneficio ?? beneficioBruto - ivaPagado)
    const costesReales = Array.isArray(cg.costesReales) ? cg.costesReales : []
    const gastosImprevistos = Array.isArray(cg.gastosImprevistos) ? cg.gastosImprevistos : []
    const grupo = expediente?.nombre_grupo || expediente?.cliente_nombre || 'Sin grupo'
    const viaje = expediente?.destino || 'Sin destino'

    const porCategoria = { Bus: [], Restaurante: [], Guía: [], Otros: [] }
    costesReales.forEach(c => {
      const cat = categorizarPago(c.concepto)
      porCategoria[cat].push(c)
    })

    const filasPagos = []
    ;['Bus', 'Restaurante', 'Guía', 'Otros'].forEach(cat => {
      porCategoria[cat].forEach(c => {
        filasPagos.push(`<tr><td>${cat}</td><td>${(c.concepto || '—').replace(/</g, '&lt;')}</td><td>${(c.proveedor || '—').replace(/</g, '&lt;')}</td><td class="num">${Number(c.coste_real || 0).toFixed(2)} €</td></tr>`)
      })
    })
    gastosImprevistos.forEach(g => {
      filasPagos.push(`<tr><td>Imprevisto</td><td colspan="2">${(g.concepto || '—').replace(/</g, '&lt;')}</td><td class="num">${Number(g.importe || 0).toFixed(2)} €</td></tr>`)
    })

    ventana.document.write(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Informe de Cierre - ${grupo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1e293b; padding: 40px; max-width: 700px; margin: 0 auto; }
    h1 { font-size: 1.5rem; font-weight: 700; color: #0f172a; margin-bottom: 24px; letter-spacing: 0.02em; }
    .meta { font-size: 0.9rem; color: #64748b; margin-bottom: 24px; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    th { font-weight: 600; color: #475569; font-size: 0.75rem; text-transform: uppercase; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .total-row { font-weight: 600; background: #f8fafc; }
    .beneficio { font-size: 1.25rem; font-weight: 700; color: #059669; margin-top: 16px; padding-top: 16px; border-top: 2px solid #e2e8f0; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>Informe de Cierre Financiero</h1>
  <div class="meta">
    <p><strong>Grupo:</strong> ${grupo.replace(/</g, '&lt;')}</p>
    <p><strong>Viaje:</strong> ${viaje.replace(/</g, '&lt;')}</p>
  </div>
  <div class="section">
    <div class="section-title">Total Ingresos</div>
    <p style="font-size: 1.1rem; font-weight: 600;">${ingresosTotales.toFixed(2)} €</p>
  </div>
  <div class="section">
    <div class="section-title">Desglose de pagos a proveedores</div>
    <table>
      <thead><tr><th>Categoría</th><th>Concepto</th><th>Proveedor</th><th class="num">Importe</th></tr></thead>
      <tbody>${filasPagos.join('')}</tbody>
      <tfoot><tr class="total-row"><td colspan="3">Total Gastos</td><td class="num">${gastosTotales.toFixed(2)} €</td></tr></tfoot>
    </table>
  </div>
  <div class="section">
    <div class="section-title">Resumen de resultados</div>
    <table style="width:100%; border-collapse: collapse;">
      <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 8px 0;">Beneficio Bruto</td><td style="text-align:right; font-weight: 600;">${beneficioBruto.toFixed(2)} €</td></tr>
      <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 8px 0;">IVA (21%): impuesto restado</td><td style="text-align:right; font-weight: 600; color: #b45309;">− ${ivaPagado.toFixed(2)} €</td></tr>
      <tr style="background: #f0fdf4;"><td style="padding: 12px 0; font-weight: 700;">BENEFICIO NETO</td><td style="text-align:right; font-size: 1.25rem; font-weight: 700; color: #059669;">${beneficioLimpio.toFixed(2)} €</td></tr>
    </table>
  </div>
</body>
</html>`)
    ventana.document.close()
    ventana.focus()
    setTimeout(() => { ventana.print(); ventana.close() }, 300)
  }

  const exportarInformeGestoria = () => {
    if (!expediente?.cierre_grupo || typeof expediente?.cierre_grupo !== 'object') return
    const cg = expediente?.cierre_grupo
    const ingresosTotales = Number(cg.ingresos_totales ?? cg.total_ingresos ?? 0)
    const gastosTotales = Number(cg.gastos_totales ?? cg.total_gastos ?? 0)
    const beneficioBruto = Number(cg.beneficio_bruto ?? (cg.beneficio_limpio ?? cg.beneficio ?? 0) + (cg.iva_pagado ?? 0))
    const ivaPagado = Number(cg.iva_pagado ?? 0)
    const beneficioLimpio = Number(cg.beneficio_limpio ?? cg.beneficio ?? beneficioBruto - ivaPagado)
    const costesReales = Array.isArray(cg.costesReales) ? cg.costesReales : []
    const gastosImprevistos = Array.isArray(cg.gastosImprevistos) ? cg.gastosImprevistos : []
    const grupo = expediente?.nombre_grupo || expediente?.cliente_nombre || 'Sin grupo'
    const viaje = expediente?.destino || 'Sin destino'
    const lineas = [
      'INFORME DE CIERRE FINANCIERO',
      `GRUPO,${grupo}`,
      `VIAJE,${viaje}`,
      '',
      'Total Ingresos',
      `Importe,${ingresosTotales.toFixed(2)}`,
      '',
      'Desglose Pagos a Proveedores',
      'Categoría,Concepto,Proveedor,Importe',
      ...costesReales.map(c => `"${categorizarPago(c.concepto)}","${(c.concepto || '').replace(/"/g, '""')}","${(c.proveedor || '').replace(/"/g, '""')}",${Number(c.coste_real || 0).toFixed(2)}`),
      '',
      'Gastos Imprevistos',
      'Concepto,Importe',
      ...gastosImprevistos.map(g => `"${(g.concepto || '').replace(/"/g, '""')}",${Number(g.importe || 0).toFixed(2)}`),
      `TOTAL GASTOS,${gastosTotales.toFixed(2)}`,
      '',
      'Resumen de resultados',
      `Beneficio Bruto,${beneficioBruto.toFixed(2)}`,
      `IVA (21%): impuesto restado,-${ivaPagado.toFixed(2)}`,
      `BENEFICIO NETO FINAL,${beneficioLimpio.toFixed(2)}`
    ]
    const blob = new Blob(['\ufeff' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Informe_Liquidacion_${grupo.replace(/\s+/g, '_')}_${viaje.replace(/\s+/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ============ CÁLCULO CIERRE FINANCIERO ============
  // Lógica de cotización: ingresosTotales = (precio_venta + suplementos) - (bonificaciones + gratuidades)
  // Beneficio Bruto = ingresosTotales - totalGastosReales | IVA (21%) = Beneficio Bruto * 0.21 | Beneficio Neto = Bruto - IVA
  const calcularCierreFinanciero = () => {
    const paxPago = Math.max(1, toNum(expediente?.pax_pago) || Math.max(0, toNum(formData?.total_pax) - toNum(formData?.gratuidades)))
    const precioVenta = paxPago * toNum(expediente?.precio_venta_cliente ?? formData?.precio_venta_cliente ?? 0)
    const suplementosVal = parseFloat(suplementos?.totalSuplementos || 0) || 0
    const bonificaciones = toNum(expediente?.bonificacion_pax ?? formData?.bonificacion_pax ?? 0) * paxPago
    // gratuidades: valor monetario de plazas gratis (precio_venta ya usa pax_pago, así que 0 si no hay campo monetario)
    const gratuidadesVal = toNum(expediente?.gratuidades_monetario ?? 0)
    const ingresosTotales = (precioVenta + suplementosVal) - (bonificaciones + gratuidadesVal)

    const gastosReales = (informeLiquidacion.costesReales || []).reduce((a, c) => a + toNum(c.coste_real), 0)
    const gastosImprevistos = (informeLiquidacion.gastosImprevistos || []).reduce((a, g) => a + toNum(g.importe), 0)
    const gastosTotales = gastosReales + gastosImprevistos
    const beneficioBruto = ingresosTotales - gastosTotales
    const ivaPagado = beneficioBruto > 0 ? beneficioBruto * 0.21 : 0
    const beneficioLimpio = beneficioBruto - ivaPagado
    return { ingresosTotales, gastosTotales, beneficioLimpio, ivaPagado, beneficioBruto }
  }

  const isCierreGuardado = Boolean(
    cierreGrupo &&
    typeof cierreGrupo === 'object' &&
    (cierreGrupo.ingresos_totales != null || cierreGrupo.total_ingresos != null || cierreGrupo.beneficio_limpio != null || cierreGrupo.beneficio != null)
  )

  // Pax por asociación (opcional, para cierre)
  const [paxPorAsociacion, setPaxPorAsociacion] = useState([])
  useEffect(() => {
    const guardado = cierreGrupo?.pax_por_asociacion
    if (Array.isArray(guardado) && guardado.length > 0) {
      setPaxPorAsociacion(guardado)
    } else if (expedienteClientes.length > 0) {
      setPaxPorAsociacion(prev => {
        const idsPrev = new Set(prev.map(p => String(p.cliente_id)))
        const nuevos = expedienteClientes.filter(ec => !idsPrev.has(String(ec.cliente_id))).map(ec => ({ cliente_id: ec.cliente_id, cliente_nombre: ec.cliente_nombre, pax: null }))
        return prev.length > 0 ? [...prev, ...nuevos] : expedienteClientes.map(ec => ({ cliente_id: ec.cliente_id, cliente_nombre: ec.cliente_nombre, pax: null }))
      })
    } else if (clienteIdPrincipal) {
      const nombrePrincipal = grupo?.nombre || expediente?.cliente_nombre || expediente?.nombre_grupo || '—'
      setPaxPorAsociacion(prev => prev.length > 0 ? prev : [{ cliente_id: clienteIdPrincipal, cliente_nombre: nombrePrincipal, pax: null }])
    }
  }, [expediente?.id, expediente?.cierre_grupo?.pax_por_asociacion, expedienteClientes, clienteIdPrincipal, grupo?.nombre])
  const actualizarPaxAsociacion = (clienteId, pax) => {
    setPaxPorAsociacion(prev => {
      const existe = prev.find(p => String(p.cliente_id) === String(clienteId))
      if (existe) return prev.map(p => String(p.cliente_id) === String(clienteId) ? { ...p, pax: pax === '' ? null : Number(pax) || 0 } : p)
      return [...prev, { cliente_id: clienteId, cliente_nombre: expedienteClientes.find(ec => String(ec.cliente_id) === String(clienteId))?.cliente_nombre || '—', pax: pax === '' ? null : Number(pax) || 0 }]
    })
  }

  // ============ GUARDAR CIERRE (sin machacar cotización) ============
  const [guardandoCierre, setGuardandoCierre] = useState(false)
  const handleGuardarCierre = async () => {
    if (!expediente?.id) return
    setGuardandoCierre(true)
    try {
      const { ingresosTotales, gastosTotales, beneficioBruto, ivaPagado, beneficioLimpio } = calcularCierreFinanciero()
      const n = (v) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : 0)
      const totalIngresos = n(ingresosTotales)
      const totalGastosReales = n(gastosTotales)
      const cuotaIva = n(ivaPagado)
      const beneficioNetoReal = n(beneficioLimpio)

      const cierreGrupoJson = {
        ingresos_totales: totalIngresos,
        gastos_totales: totalGastosReales,
        beneficio_bruto: beneficioBruto,
        iva_pagado: cuotaIva,
        beneficio_limpio: beneficioNetoReal,
        fecha: new Date().toISOString(),
        ingresos: { precioViaje: n(informeLiquidacion?.ingresos?.precioViaje), suplementos: n(informeLiquidacion?.ingresos?.suplementos), descuentos: n(informeLiquidacion?.ingresos?.descuentos) },
        costesReales: (informeLiquidacion.costesReales || []).map((c) => ({ id_servicio: c.id_servicio, concepto: c.concepto || '', proveedor: c.proveedor || '', coste_cotizado: n(c.coste_cotizado), coste_real: n(c.coste_real) })),
        gastosImprevistos: (informeLiquidacion.gastosImprevistos || []).map((g) => ({ id: g.id, concepto: g.concepto || '', importe: n(g.importe) })),
        pax_por_asociacion: paxPorAsociacion.filter((p) => p.cliente_id).map((p) => ({ cliente_id: p.cliente_id, cliente_nombre: p.cliente_nombre || '', pax: p.pax })),
      }

      const payload = {
        cierre_grupo: cierreGrupoJson,
        total_ingresos: totalIngresos,
        total_gastos_reales: totalGastosReales,
        cuota_iva: cuotaIva,
        beneficio_neto_real: beneficioNetoReal,
        estado: 'Cerrado',
      }

      const { error } = await supabase.from('expedientes').update(payload).eq('id', expediente.id)

      if (error) {
        alert('Error al guardar el cierre: ' + (error?.message || 'Revisa columnas en expedientes.'))
        return
      }

      const paxTotal = Math.max(1, n(formData?.total_pax) || n(expediente?.total_pax))
      const gratuidades = n(formData?.gratuidades) || n(expediente?.gratuidades)
      const bonificacionPax = n(formData?.bonificacion_pax) || n(expediente?.bonificacion_pax)
      const precioVentaCliente = n(formData?.precio_venta_cliente) || n(expediente?.precio_venta_cliente)
      const paxPago = Math.max(1, paxTotal - gratuidades)
      if (onUpdate) onUpdate({ ...expediente, cierre_grupo: cierreGrupoJson, total_ingresos: totalIngresos, total_gastos_reales: totalGastosReales, cuota_iva: cuotaIva, beneficio_neto_real: beneficioNetoReal, estado: 'Cerrado', total_pax: paxTotal, gratuidades, bonificacion_pax: bonificacionPax, precio_venta_cliente: precioVentaCliente, pax_pago: paxPago })
      alert('Cierre guardado correctamente.')
    } catch (err) {
      alert('Error al guardar el cierre: ' + (err?.message || String(err)))
    } finally {
      setGuardandoCierre(false)
    }
  }

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
      const importe = Number(cobro.importe ?? 0)
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
        }
      } else {
        // Fallback: reserva de espacio en blanco
        doc.setFillColor(255, 255, 255)
        doc.rect(10, 5, 55, 22, 'F')
      }
      
      // Nº Expediente (EXP-XXXX) — prominente en cabecera de Recibo oficial
      const numExp = expediente?.numero_expediente || expediente?.numeroExpediente || ''
      const numeroExpedienteDisplay = numExp ? `EXP-${numExp}` : '—'
      doc.setFontSize(12)
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'bold')
      doc.text(numeroExpedienteDisplay, pageWidth - 60, 15)
      
      // Título "RECIBO" + Nº Recibo
      const numeroRecibo = cobro.numero_recibo || '—'
      doc.setTextColor(0, 0, 0)
      doc.setFontSize(24)
      doc.setFont('helvetica', 'bold')
      doc.text('RECIBO', pageWidth - 60, 22)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(numeroRecibo, pageWidth - 60, 28)
      
      // Importe entre almohadillas (arriba a la derecha)
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text(`# ${importe.toFixed(2)}€ #`, pageWidth - 60, 38)
      
      // Línea separadora
      doc.setDrawColor(...colorAzul)
      doc.setLineWidth(0.5)
      doc.line(10, 48, pageWidth - 10, 48)
      
      // Texto técnico: Recibo oficial correspondiente al Expediente [EXP-XXXX]
      doc.setFontSize(10)
      doc.setTextColor(60, 60, 60)
      doc.setFont('helvetica', 'italic')
      doc.text(`Recibo oficial correspondiente al Expediente ${numeroExpedienteDisplay}`, 20, 58)
      
      // Contenido principal (ligeramente más abajo para no chocar con el logo)
      let yPos = 75
      
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
      yPos += 6
      doc.text(`Nº Recibo: ${numeroRecibo}`, 20, yPos)
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
      
      // Nombre del archivo (incluye nº recibo si existe)
      const nombreArchivo = numeroRecibo !== '—'
        ? `Recibo_${numeroRecibo}_${nombreGrupo.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
        : `Recibo_${nombreGrupo.replace(/[^a-zA-Z0-9]/g, '_')}_${fechaCobro.toISOString().split('T')[0]}.pdf`
      
      // Descargar PDF
      doc.save(nombreArchivo)
    }

    const logo = new Image()
    // Intentar primero con el nombre de archivo original arrastrado
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
      fallbackLogo.onerror = (e) => {
        crearDocumento(null)
      }
    }
  }

  // ============ OBTENER SIGUIENTE NÚMERO DE RECIBO (REC-YYYY-000X) ============
  // Fuente de verdad: recibos_oficiales (numero_recibo NO se guarda en cobros_expediente)
  const obtenerSiguienteNumeroRecibo = async () => {
    const año = new Date().getFullYear()
    const prefijo = `REC-${año}-`
    try {
      const { data, error } = await supabase
        .from('recibos_oficiales')
        .select('numero_recibo')
        .ilike('numero_recibo', `${prefijo}%`)
        .order('numero_recibo', { ascending: false })
        .limit(1)
      if (error || !Array.isArray(data) || data.length === 0 || !data[0]?.numero_recibo) {
        return `${prefijo}0001`
      }
      const match = String(data[0].numero_recibo).match(/REC-\d{4}-(\d+)/)
      if (!match) return `${prefijo}0001`
      const num = parseInt(match[1], 10)
      const siguiente = isNaN(num) || num < 0 ? 1 : num + 1
      return `${prefijo}${String(siguiente).padStart(4, '0')}`
    } catch {
      return `${prefijo}0001`
    }
  }

  // ============ CARGAR COBROS DEL EXPEDIENTE ============
  // Lee de cobros_expediente; numero_recibo viene de recibos_oficiales
  // Blindeado: try/catch + fallback; vacío → "Sin cobros" (no bloquea)
  const cargarCobros = async () => {
    if (!expediente?.id) {
      setCobros([])
      return
    }
    try {
      const { data: cobrosData, error: errorCobros } = await supabase
        .from('cobros_expediente')
        .select('*')
        .eq('expediente_id', expediente.id)
        .order('fecha', { ascending: false })
      if (errorCobros) {
        setCobros([])
        return
      }
      const cobrosList = Array.isArray(cobrosData) ? cobrosData : []
      if (cobrosList.length === 0) {
        setCobros([])
        return
      }
      try {
        const { data: recibosData, error: errorRecibos } = await supabase
          .from('recibos_oficiales')
          .select('cobro_id, numero_recibo')
          .in('cobro_id', cobrosList.map(c => c.id))
        const mapRecibo = {}
        if (!errorRecibos && Array.isArray(recibosData)) {
          recibosData.forEach(r => { mapRecibo[r.cobro_id] = r.numero_recibo })
        }
        const cobrosConRecibo = cobrosList.map(c => ({
          ...c,
          numero_recibo: mapRecibo[c.id] || null
        }))
        setCobros(cobrosConRecibo)
      } catch (_) {
        setCobros(cobrosList.map(c => ({ ...c, numero_recibo: null })))
      }
    } catch (_) {
      setCobros([])
    }
  }

  // Cargar cobros cuando se abre Cobros o Cotización (Cierre ya no usa cobros)
  useEffect(() => {
    if ((tab === 'cobros' || tab === 'cotizacion') && expediente?.id) {
      cargarCobros()
    } else if (!['cobros', 'cotizacion'].includes(tab)) {
      setCobros([])
    }
  }, [tab, expediente?.id])

  // Cargar pagos a proveedores solo cuando se abre la pestaña (evita bucles)
  const cargarPagosProveedores = async () => {
    if (!expediente?.id) {
      setPagosProveedores([])
      return
    }
    setCargandoPagosProveedores(true)
    try {
      const { data, error } = await supabase
        .from('pagos_proveedores')
        .select('*')
        .eq('expediente_id', expediente.id)
        .order('fecha_pago', { ascending: false })
      if (error) {
        setPagosProveedores([])
        return
      }
      setPagosProveedores(data || [])
    } catch (_) {
      setPagosProveedores([])
    } finally {
      setCargandoPagosProveedores(false)
    }
  }
  useEffect(() => {
    if (tab === 'pagosProveedores' && expediente?.id) {
      cargarPagosProveedores()
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
        setVersionesFactura([])
        return
      }
      
      // Si se borraron facturas, el historial se actualiza automáticamente
      setVersionesFactura(data || [])
    } catch (error) {
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
  // Regla 1.14: Confirmación doble antes de borrar documento oficial
  const borrarVersionFactura = async (versionId, numeroFactura) => {
    if (!window.confirm('¿Estás seguro de que quieres borrar esta versión histórica de factura?')) {
      return
    }
    if (!window.confirm('¿Estás seguro de que quieres borrar este documento oficial definitivamente?')) {
      return
    }
    
    try {
      const { error } = await supabase
        .from('facturas_versiones')
        .delete()
        .eq('id', versionId)
      
      if (error) {
        alert(`❌ Error borrando versión: ${error.message}`)
        return
      }
      
      // Recargar versiones para actualizar la vista
      await cargarVersionesFactura()
      alert('✅ Versión histórica eliminada correctamente')
    } catch (error) {
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
        setFacturasEmitidas([])
        return
      }
      
      setFacturasEmitidas(data || [])
    } catch (error) {
      setFacturasEmitidas([])
    } finally {
      setCargandoFacturasEmitidas(false)
    }
  }


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
      numero_expediente: facturaEmitida.datos_factura?.numero_expediente || expediente?.numero_expediente || expediente?.numeroExpediente || '',
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
        }
      }
      
      // Nº Expediente (EXP-XXXX) — prominente en cabecera de Factura oficial
      const numExpFact = factura?.numero_expediente || factura?.datos_factura?.numero_expediente || factura?.datos_json?.numero_expediente || expediente?.numero_expediente || expediente?.numeroExpediente || ''
      const numeroExpedienteFactura = numExpFact ? `EXP-${numExpFact}` : '—'
      doc.setFontSize(12)
      doc.setTextColor(0, 0, 0)
      doc.setFont(undefined, 'bold')
      doc.text(numeroExpedienteFactura, pageWidth - 20, 22, { align: 'right' })
      
      // Número de factura
      doc.setFontSize(20)
      doc.setTextColor(33, 150, 243)
      doc.setFont(undefined, 'bold')
      doc.text(`FACTURA ${numeroFactura}`, pageWidth - 20, 30, { align: 'right' })
      
      // Fecha
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text(`Fecha: ${fechaFormateada}`, pageWidth - 20, 40, { align: 'right' })
      
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
        setLogsFinancieros([])
        return
      }
      
      setLogsFinancieros(data || [])
    } catch (error) {
      setLogsFinancieros([])
    }
  }

  // ============ ELIMINAR COBRO ============
  // Recibos con numero_recibo requieren confirmación doble de seguridad
  const eliminarCobro = async (cobro) => {
    const esReciboEmitido = !!cobro?.numero_recibo
    const mensaje1 = esReciboEmitido
      ? `¿Estás seguro de que quieres borrar este recibo (${cobro.numero_recibo})?`
      : '¿Estás seguro de que quieres borrar este cobro?'
    if (!window.confirm(mensaje1)) return
    if (esReciboEmitido) {
      const mensaje2 = '¿Estás seguro de que quieres borrar este recibo definitivamente?'
      if (!window.confirm(mensaje2)) return
    }
    try {
      // Primero eliminar el recibo oficial (si existe) para evitar violación de FK
      await supabase.from('recibos_oficiales').delete().eq('cobro_id', cobro.id)
      const { error } = await supabase
        .from('cobros_expediente')
        .delete()
        .eq('id', cobro.id)
      if (error) {
        alert(`❌ Error al eliminar el cobro: ${error.message}`)
        return
      }
      await cargarCobros()
    } catch (err) {
      alert(`❌ Error inesperado al eliminar: ${err.message}`)
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
      const importeNumerico = Number(parseFloat(String(importeLimpio))) || 0
      const datosCobro = {
        expediente_id: expediente.id,
        cliente_id: clienteId,
        importe: importeNumerico,
        metodo_pago: String(formCobro.metodo_pago || 'Transferencia'),
        cuenta_destino: String(formCobro.cuenta_destino || 'Caixabank'),
        concepto: String(formCobro.concepto || '').trim(),
        fecha: new Date().toISOString()
      }

      let errorOperacion = null
      let operacionExitosa = false
      let numeroReciboGenerado = null

      if (cobroEnEdicionId) {
        // UPDATE: Modificar cobro existente
        // Obtener cobro original para comparación
        const cobroOriginal = (cobros || []).find(c => c.id === cobroEnEdicionId)
        
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
          } else {
            // Refrescar historial inmediatamente
            await cargarLogsFinancieros()
          }
        }
      } else {
        // INSERT: Crear nuevo cobro en cobros_expediente (sin numero_recibo)
        const { data: cobroInsertado, error } = await supabase
          .from('cobros_expediente')
          .insert([datosCobro])
          .select('id')
        errorOperacion = error
        
        if (!error && cobroInsertado?.[0]?.id) {
          operacionExitosa = true
          const numeroRecibo = await obtenerSiguienteNumeroRecibo()
          const numeroExp = expediente?.numero_expediente || expediente?.numeroExpediente || ''
          const datosRecibo = {
            cobro_id: cobroInsertado[0].id,
            numero_recibo: numeroRecibo,
            expediente_id: datosCobro.expediente_id,
            numero_expediente: numeroExp || null,
            cliente_id: datosCobro.cliente_id,
            importe_total: datosCobro.importe,
            importe: datosCobro.importe,
            concepto: datosCobro.concepto,
            metodo_pago: datosCobro.metodo_pago,
            cuenta_destino: datosCobro.cuenta_destino,
            fecha: datosCobro.fecha
          }
          const { error: errRecibo } = await supabase
            .from('recibos_oficiales')
            .insert([datosRecibo])
          if (errRecibo) {
            alert(`⚠️ El cobro se guardó pero no se pudo crear el recibo oficial:\n\n${errRecibo.message}\n\nEl cobro permanece registrado.`)
          } else {
            numeroReciboGenerado = numeroRecibo
          }
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
          } else {
            await cargarLogsFinancieros()
          }
        }
      }

      if (errorOperacion) {
        alert(`❌ Error al guardar el cobro:\n\n${errorOperacion.message || JSON.stringify(errorOperacion)}`)
        return
      }

      // Recargar lista de cobros inmediatamente para refrescar la UI
      await cargarCobros()

      alert(numeroReciboGenerado
        ? `✅ Cobro registrado y Recibo ${numeroReciboGenerado} generado con éxito.`
        : '✅ Cobro guardado correctamente.')

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
      alert(`❌ Error inesperado al guardar el cobro:\n\n${error.message || JSON.stringify(error)}`)
    }
  }

  // Sin inicialización automática: servicios solo se llena desde BD o con el botón "+ Añadir Servicio"
  
  // ============ UX: HANDLERS PARA INPUTS ============
  
  // Auto-limpiar campo cuando está en 0 y se hace focus
  const handleFocus = (e) => {
    e.target.select() // Auto-seleccionar al hacer focus para fácil reemplazo
  }
  
  // Deshabilitar cambio con rueda en inputs numéricos: blur sin preventDefault (evita errores passive listener)
  const handleWheel = (e) => {
    e.target.blur()
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
  
  // Cliente editable (usa grupo declarado arriba)
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
  // Si expediente tiene pax_pago, usarlo como divisor; si no, calcular desde formData.
  const paxPago = Math.max(0, toNum(expediente?.pax_pago) || Math.max(0, toNum(formData?.total_pax) - toNum(formData?.gratuidades)))
  const totalPax = Math.max(0, toNum(expediente?.total_pax) || toNum(formData?.total_pax))

  // Firma primitiva de servicios: evita re-renders cuando el array cambia de referencia pero el contenido es igual
  const serviciosSignature = useMemo(() =>
    servicios.map(s => `${s.id}:${toNum(s.coste_unitario)}:${toNum(s.noches)}:${toNum(s.cantidad)}:${s.tipo_calculo}:${toNum(s.total_servicio_manual)}:${s.tipo || ''}`).join('|'),
    [servicios]
  )

  // Resultados de Cotización: depende de valores primitivos para evitar recálculos innecesarios
  const resultados = useMemo(() => {
    const nochesExpediente = Math.max(1, toNum(expediente?.noches) || toNum(formData?.noches))
    return calcularFinanzasExpediente({
      servicios,
      formData,
      paxPago,
      totalPax,
      nochesExpediente,
    })
  }, [serviciosSignature, formData, paxPago, totalPax, expediente?.noches, expediente?.pax_pago, expediente?.total_pax])

  // NOTA: Para "Total a dividir" (porGrupo), coste_unitario y total_servicio_manual almacenan el TOTAL.

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
    { id: 'pagosProveedores', label: 'Pagos a Proveedores', icon: CreditCard },
    { id: 'facturacion', label: 'Facturación', icon: FileText },
    { id: 'documentacion', label: 'Documentación', icon: FileUp },
    { id: 'cierre', label: 'Cierre de Grupo', icon: TrendingUp },
  ]

  // ============ FUNCIONES DE PROVEEDORES ============
  
  const obtenerProveedorPorId = (id) => {
    return proveedores.find(p => p.id === id)
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

  // Registrar pago a proveedor (insert en pagos_proveedores)
  const registrarPagoProveedor = async () => {
    if (!expediente?.id || !formPago.servicio_id || !formPago.fecha_pago || !formPago.importe_pagado) {
      alert('Completa Servicio, Fecha e Importe.')
      return
    }
    const importe = parseFloat(String(formPago.importe_pagado).replace(',', '.'))
    if (isNaN(importe) || importe <= 0) {
      alert('El importe debe ser un número positivo.')
      return
    }
    try {
      const { error } = await supabase
        .from('pagos_proveedores')
        .insert([{
          expediente_id: expediente.id,
          servicio_id: formPago.servicio_id,
          fecha_pago: formPago.fecha_pago,
          importe_pagado: importe,
        }])
      if (error) {
        alert(`Error al registrar pago: ${error.message}`)
        return
      }
      setFormPago({ servicio_id: '', fecha_pago: '', importe_pagado: '' })
      await cargarPagosProveedores()
      if (typeof onRefresh === 'function') onRefresh()
    } catch (e) {
      alert('Error inesperado al registrar el pago.')
    }
  }

  // Helper: noches del expediente (prioriza campo en BD, si no, calcula por fechas)
  // Regla: noches = días - 1 (mismo día = 1 día = 0 noches; 4 días = 3 noches)
  // Columnas expedientes: fecha_inicio, fecha_final (o fechaInicio, fechaFin, fecha_viaje)
  const calcularNochesExpediente = () => {
    const n = toNum(expediente?.noches)
    if (n > 0) return n

    const fechaInicioRaw = expediente?.fecha_inicio || expediente?.fechaInicio || expediente?.fecha_viaje || ''
    const fechaFinRaw = expediente?.fecha_final || expediente?.fecha_fin || expediente?.fechaFin || ''
    if (fechaInicioRaw && fechaFinRaw) {
      try {
        const inicio = parsearFechaADate(fechaInicioRaw)
        const fin = parsearFechaADate(fechaFinRaw)
        if (inicio && fin && !isNaN(inicio.getTime()) && !isNaN(fin.getTime()) && fin.getTime() >= inicio.getTime()) {
          const diffMs = fin.getTime() - inicio.getTime()
          const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1
          const noches = Math.max(0, dias - 1)
          return Math.max(1, noches) // Mínimo 1 noche para cálculos de cotización
        }
      } catch (_) { /* fallback a 1 */ }
    }

    return 1
  }

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
  }, [formData?.sup_individual_pax, formData?.sup_individual_precio_dia, formData?.sup_seguro_pax, formData?.sup_seguro_precio_total, expediente?.noches, expediente?.fecha_inicio, expediente?.fechaInicio, expediente?.fecha_final, expediente?.fecha_fin, expediente?.fechaFin])

  // ============ INICIALIZAR DATOS DEL RECEPTOR DE FACTURA ============
  // Dependencias estables (primitivas) para evitar bucle infinito con objeto grupo
  useEffect(() => {
    const g = clientes.find(c => String(c.id) === String(clienteIdPrincipal)) || {
      nombre: expediente?.nombre_grupo || expediente?.clienteNombre || 'Sin nombre',
      cif: expediente?.cif || '',
      direccion: expediente?.direccion || '',
      poblacion: expediente?.poblacion || '',
      provincia: expediente?.provincia || '',
      codigo_postal: expediente?.cp || expediente?.codigo_postal || '',
    }
    if (g && g.nombre) {
      setFormFactura({
        receptorNombre: g.nombre || '',
        receptorCIF: g.cif || g.cif_nif || '',
        receptorDireccion: g.direccion || '',
        receptorPoblacion: g.poblacion || '',
        receptorProvincia: g.provincia || '',
        receptorCP: g.codigo_postal || g.cp || '',
      })
    }
  }, [clienteIdPrincipal, expediente?.id, expediente?.nombre_grupo, expediente?.clienteNombre, clientes])

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
        }
      }

      // Nº Expediente (EXP-XXXX) — prominente en cabecera de Factura
      const numExp = expediente?.numero_expediente || expediente?.numeroExpediente || ''
      const numeroExp = numExp ? `EXP-${numExp}` : '—'
      doc.setFontSize(12)
      doc.setTextColor(0, 0, 0)
      doc.setFont(undefined, 'bold')
      doc.text(numeroExp, pageWidth - 20, 22, { align: 'right' })

      // Número de factura (arriba a la derecha)
      doc.setFontSize(20)
      doc.setTextColor(...colorAzul)
      doc.setFont(undefined, 'bold')
      doc.text(`FACTURA ${numeroFactura}`, pageWidth - 20, 30, { align: 'right' })

      // Fecha
      const fechaActual = new Date()
      const fechaFormateada = fechaActual.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      })
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text(`Fecha: ${fechaFormateada}`, pageWidth - 20, 40, { align: 'right' })

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

          doc.text('Total estancia (habitación individual)', 20, yPos)
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
        } else {
          // Recargar versiones para actualizar la vista
          await cargarVersionesFactura()
        }
      } catch (err) {
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

      // Actualización de esquema: base_imponible y direccion_receptor confirmados
      // Guardar en Supabase - SOLO INSERT, NO UPDATE del expediente
      const { error } = await supabase
        .from('facturas')
        .insert([datosFactura])

      if (error) {
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
        
        // Preparar datos_factura (JSON completo) — incluye numero_expediente para plantillas
        const datosFacturaCompletos = {
          ...datosFactura,
          numero_expediente: expediente?.numero_expediente || expediente?.numeroExpediente || '',
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
          // No bloqueamos el flujo si falla
        } else {
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
          // No bloqueamos el flujo si falla
        } else {
        }
      } catch (err) {
        // No bloqueamos el flujo si falla
      }

      alert(`✅ Factura ${numeroFactura} emitida y guardada correctamente.`)
      
      // Recargar historial de versiones para reflejar la nueva factura emitida
      await cargarVersionesFactura()
    } catch (error) {
      alert(`❌ Error emitiendo factura: ${error.message}`)
    }
  }

  // ============ RECARGAR DATOS FINANCIEROS DESDE SUPABASE ============
  const recargarDatosFinancieros = async () => {
    const expedienteId = expediente?.id
    if (!expedienteId) return
    try {
      const { data, error } = await supabase
        .from('expedientes')
        .select('total_pax, pax_pago, gratuidades, precio_venta_cliente, bonificacion_pax, sup_individual_pax, sup_individual_precio_dia, sup_seguro_pax, sup_seguro_precio_total')
        .eq('id', expedienteId)
        .single()
      if (error || !data) return
      const convertirANumero = (v, d) => (v == null ? d : (isNaN(Number(v)) ? d : Number(v)))
      const datos = {
        total_pax: convertirANumero(data.total_pax, 1),
        gratuidades: convertirANumero(data.gratuidades, 0),
        precio_venta_cliente: convertirANumero(data.precio_venta_cliente, 0),
        bonificacion_pax: convertirANumero(data.bonificacion_pax, 0),
        sup_individual_pax: convertirANumero(data.sup_individual_pax, 0),
        sup_individual_precio_dia: convertirANumero(data.sup_individual_precio_dia, 0),
        sup_seguro_pax: convertirANumero(data.sup_seguro_pax, 0),
        sup_seguro_precio_total: convertirANumero(data.sup_seguro_precio_total, 0),
      }
      setFormData(datos)
      lastSavedFormDataRef.current = { ...datos }
    } catch {
    }
  }

  // ============ FUNCIÓN ÚNICA DE PERSISTENCIA ============
  // persistirCambios: Guarda formData en Supabase usando nombres exactos de columna
  // Campos financieros: total_pax, gratuidades, bonificacion_pax, precio_venta_cliente
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
    if (!expedienteId) return { ok: false, error: 'Expediente sin ID' }
    if (!datosCargados) return { ok: false, error: 'Datos aún cargando' }

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

      if (error) return { ok: false, error: extraerMensajeError(error) }

      onUpdate({ ...expediente, ...datosParaGuardar })
      await recargarDatosFinancieros()
      if (typeof onRefresh === 'function') onRefresh()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: extraerMensajeError(error) }
    }
  }

  // Guardar cotización (formData) y mostrar feedback. Retorna { ok } para permitir navegación tras guardar.
  const guardarCotizacion = async () => {
    const resultado = await persistirCambios()
    if (resultado.ok) {
      lastSavedFormDataRef.current = { ...formData }
      setGuardadoExitoCotizacion(true)
      setTimeout(() => setGuardadoExitoCotizacion(false), 2500)
    } else {
      alert(`❌ Error al guardar: ${resultado.error}`)
    }
    return resultado
  }

  // Interceptar cambio de pestaña: aviso si hay cotización sin guardar
  const handleTabChange = (nuevoTab) => {
    if (tab === 'cotizacion' && hasCotizacionSinGuardar) {
      const salir = window.confirm('Tienes cambios sin guardar. ¿Quieres salir?')
      if (salir) {
        guardarCotizacion().then((r) => { if (r?.ok) setTab(nuevoTab) })
      }
      // Si cancela, permanece en la pantalla (no cambia de pestaña)
    } else {
      setTab(nuevoTab)
    }
  }

  // Interceptar cierre: aviso si hay cotización sin guardar
  const handleClose = () => {
    if (tab === 'cotizacion' && hasCotizacionSinGuardar) {
      const salir = window.confirm('Tienes cambios sin guardar. ¿Quieres salir?')
      if (salir) {
        guardarCotizacion().then((r) => { if (r?.ok) onClose() })
      }
      // Si cancela, permanece en la pantalla (no cierra)
    } else {
      onClose()
    }
  }

  // ============ GUARDAR HABITACIONES ============
  
  const guardarHabitaciones = () => {
    if (!window.confirm('¿Quieres guardar los cambios en el rooming list?')) {
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
    if (!window.confirm('¿Quieres guardar los cambios del cliente?')) {
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

  // Asociaciones: solo cliente principal (expedientes.cliente_id). Tabla expediente_clientes no existe.

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

  // Regla 1.14: Confirmación doble antes de borrar documento oficial
  const eliminarDocumento = (id) => {
    const doc = documentos.find(d => d.id === id)
    if (!window.confirm(`¿Estás seguro de que quieres borrar "${doc?.nombre || 'este documento'}"?\n\nEsta acción no se puede deshacer.`)) return
    if (!window.confirm('¿Estás seguro de que quieres borrar este registro definitivamente?')) return
    setDocumentos(documentos.filter(d => d.id !== id))
  }

  // ============ CALCULAR TOTALES DE HABITACIONES ============
  
  const totalHabitaciones = (habitaciones.dobles || 0) + (habitaciones.doblesTwin || 0) + (habitaciones.individuales || 0)
  const totalPasajerosHabitaciones = ((habitaciones.dobles || 0) * 2) + ((habitaciones.doblesTwin || 0) * 2) + (habitaciones.individuales || 0)

  // ============ RENDER PRINCIPAL (CON TRY/CATCH) ============
  // Si expediente es null/undefined: retornar null para no bloquear el renderizado del padre
  if (!expediente || !expediente.id) {
    return null
  }

  try {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]">
        <div 
          className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full h-[90vh] sm:h-[90vh] flex flex-col"
          style={{ backgroundColor: 'white', color: 'black' }}
        >
          
          {/* HEADER con JERARQUÍA VISUAL ESTRICTA - Safe area para X y barra iPhone */}
          <div className="px-4 sm:px-8 py-4 sm:py-6 pt-[max(1rem,env(safe-area-inset-top))] border-b border-gray-200 bg-gradient-to-r from-blue-50 to-white flex-shrink-0">
            <div className="flex justify-between items-start">
          <div>
                {/* REGLA: Nombre del Grupo = GRANDE Y NEGRITA */}
                <h1 className="text-3xl font-black text-navy-900 uppercase mb-1">
                  {expediente.nombre_grupo || expediente.clienteNombre || grupo.nombre || 'SIN NOMBRE DE GRUPO'}
                </h1>
                {/* Número de expediente (EXP-XXXX) y Badge de Estado */}
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {expediente.numero_expediente && (
                    <p className="text-sm font-bold font-mono text-blue-700">
                      EXP-{expediente.numero_expediente}
                    </p>
                  )}
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      ['peticion', 'confirmado'].includes((expediente.estado || '').toLowerCase())
                        ? 'bg-yellow-400 text-black'
                        : (expediente.estado || '').toLowerCase() === 'en_curso'
                        ? 'bg-green-500 text-white'
                        : (expediente.estado || '').toLowerCase() === 'finalizado'
                        ? 'bg-blue-500 text-white'
                        : (expediente.estado || '').toLowerCase() === 'cerrado'
                        ? 'bg-purple-600 text-white'
                        : (expediente.estado || '').toLowerCase() === 'cancelado'
                        ? 'bg-red-600 text-white'
                        : 'bg-yellow-400 text-black'
                    }`}
                  >
                    {['peticion', 'confirmado'].includes((expediente.estado || '').toLowerCase())
                      ? 'Petición'
                      : (expediente.estado || '').toLowerCase() === 'en_curso'
                      ? 'Confirmado'
                      : (expediente.estado || '').toLowerCase() === 'finalizado'
                      ? 'Finalizado'
                      : (expediente.estado || '').toLowerCase() === 'cerrado'
                      ? 'Cerrado'
                      : (expediente.estado || '').toLowerCase() === 'cancelado'
                      ? 'Cancelado'
                      : expediente.estado || 'Petición'}
                  </span>
                </div>
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
                onClick={handleClose} 
                className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full"
              >
            <X size={24} />
          </button>
            </div>
        </div>

          {/* TABS */}
          <div className="border-b border-gray-200 px-4 sm:px-8 bg-white flex-shrink-0">
            <nav className="flex gap-2 -mb-px overflow-x-auto">
              {tabs.map(t => {
                const Icon = t.icon
                return (
              <button
                key={t.id}
                onClick={() => handleTabChange(t.id)}
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

          {/* CONTENIDO - Padding inferior safe-area para iPhone */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 pb-[max(1rem,env(safe-area-inset-bottom))]" style={{ backgroundColor: 'white', color: 'black' }}>
            
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

                  {/* Cliente del expediente (expedientes.cliente_id → clientes) */}
                  <div className="mt-8 pt-6 border-t" style={{ borderColor: '#f1f5f9' }}>
                    <h4 className="text-lg font-bold text-slate-900 mb-4">🔗 Cliente del expediente</h4>
                    <p className="text-sm text-slate-500 mb-4">Cliente principal vinculado desde la tabla expedientes.</p>
                    <div className="space-y-3">
                      {expedienteClientes.length === 0 ? (
                        <p className="text-sm text-slate-500 italic">Sin cliente asignado.</p>
                      ) : (
                        expedienteClientes.map((ec, idx) => (
                          <div key={ec.id || ec.cliente_id || `ec-${idx}`} className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <span className="font-medium text-slate-900">{ec.cliente_nombre || '—'}</span>
                          </div>
                        ))
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
                            {expedientesHistorial.map((exp, idx) => {
                              // Calcular destino con fallback seguro
                              const destinoMostrar = exp.poblacion_destino || exp.destino || 'Sin destino'
                              
                              return (
                                <tr key={exp.id || `hist-${idx}`} className="hover:bg-green-50/30 transition-all">
                                  <td className="px-4 py-3">
                                    <div className="font-bold text-slate-900 text-sm">{exp.cliente_nombre || 'Sin nombre'}</div>
                                    {(exp.fecha_inicio || exp.fecha_viaje) && (
                                      <div className="text-xs text-slate-500 mt-1">
                                        {new Date(exp.fecha_inicio || exp.fecha_viaje).toLocaleDateString('es-ES')}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="text-sm text-slate-700 font-medium">
                                      {destinoMostrar}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`inline-block px-2.5 py-1 rounded-full text-sm font-bold ${
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
                        value={convertirEspañolAISO(expediente.fecha_inicio || expediente.fechaInicio) || ''}
                        onChange={(e) => {
                          // Input type="date" devuelve YYYY-MM-DD
                          const fechaISO = e.target.value
                          const fechaEspañola = convertirISOAEspañol(fechaISO)
                          const expedienteActualizado = {
                            ...expediente,
                            fechaInicio: fechaEspañola,
                            fecha_inicio: fechaISO, // Sobrescribir para que la UI y Duración se actualicen al instante
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
                      {(expediente.fecha_inicio || expediente.fechaInicio) && (
                        <p className="text-xs text-blue-600 mt-1">
                          📅 Guardada como: {expediente.fecha_inicio || expediente.fechaInicio}
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-xs mb-2" style={{ color: '#6B7280' }}>📅 Fecha de Fin</label>
                      <input
                        type="date"
                        value={convertirEspañolAISO(expediente.fecha_final || expediente.fecha_fin || expediente.fechaFin) || ''}
                        onChange={(e) => {
                          // Input type="date" devuelve YYYY-MM-DD
                          const fechaISO = e.target.value
                          const fechaEspañola = convertirISOAEspañol(fechaISO)
                          const expedienteActualizado = {
                            ...expediente,
                            fechaFin: fechaEspañola,
                            fecha_final: fechaISO, // Sobrescribir para que la UI y Duración se actualicen al instante
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
                      {(expediente.fecha_final || expediente.fecha_fin || expediente.fechaFin) && (
                        <p className="text-xs text-blue-600 mt-1">
                          📅 Guardada como: {expediente.fecha_final || expediente.fecha_fin || expediente.fechaFin}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {(expediente.fechaInicio || expediente.fecha_inicio || expediente.fechaFin || expediente.fecha_final || expediente.fecha_fin) && (
                    <div className="mt-4 p-4 bg-white rounded-lg border border-blue-200">
                      <p className="text-sm text-gray-700">
                        <strong className="text-navy-900">Duración calculada:</strong>{' '}
                        {(() => {
                          const fechaInicioRaw = expediente.fecha_inicio || expediente.fechaInicio || ''
                          const fechaFinRaw = expediente.fecha_final || expediente.fecha_fin || expediente.fechaFin || ''
                          if (!fechaInicioRaw && !fechaFinRaw) return <span>—</span>
                          if (!fechaInicioRaw) return <span>{fechaFinRaw || '—'}</span>
                          if (!fechaFinRaw) return <span>{fechaInicioRaw} — Falta fecha fin</span>
                          try {
                            const inicio = parsearFechaADate(fechaInicioRaw)
                            const fin = parsearFechaADate(fechaFinRaw)
                            if (!inicio || isNaN(inicio.getTime())) return <span>{fechaInicioRaw} — {fechaFinRaw}</span>
                            if (!fin || isNaN(fin.getTime())) return <span>{fechaInicioRaw} — {fechaFinRaw}</span>
                            const diffMs = fin.getTime() - inicio.getTime()
                            if (diffMs < 0) return <span>{fechaInicioRaw} — {fechaFinRaw}</span>
                            const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1
                            const noches = Math.max(0, dias - 1)
                            return (
                              <span>
                                {dias} día{dias !== 1 ? 's' : ''} / {noches} noche{noches !== 1 ? 's' : ''}
                              </span>
                            )
                          } catch (_) {
                            return <span>{fechaInicioRaw} — {fechaFinRaw}</span>
                          }
                        })()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: Cotización */}
          {tab === 'cotizacion' && formData && (
              <div className="max-w-6xl mx-auto space-y-6 relative">
                {/* Botón Guardar Cotización + feedback éxito */}
                {hasCotizacionSinGuardar && (
                  <div className="sticky top-0 z-10 -mx-4 sm:-mx-8 px-4 sm:px-8 py-3 bg-amber-50/95 backdrop-blur border-b border-amber-200 flex items-center justify-between gap-4">
                    <span className="text-sm text-amber-800">
                      Cambios sin guardar
                    </span>
                    <button
                      onClick={guardarCotizacion}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save size={18} />
                      Guardar Cotización
                    </button>
                  </div>
                )}
                {guardadoExitoCotizacion && (
                  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg shadow-lg animate-pulse">
                    ✓ Guardado con éxito
                  </div>
                )}
                
                {/* Parámetros Principales */}
                <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                  <h3 className="text-xl font-bold text-navy-900 mb-4">Parámetros del Viaje</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div>
                      <label className="label">Total Pasajeros *</label>
                      <EditableInput
                        type="number"
                        value={formData?.total_pax ?? ''}
                        onSave={(v) => setFormData(prev => ({ ...prev, total_pax: v }))}
                        parseValue={(v) => Math.max(1, parseInt(String(v).trim(), 10) || 1)}
                        formatForDisplay={(v) => (v === null || v === undefined || v === '' ? '' : String(v))}
                        onFocus={(e) => {
                          e.target.select()
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
                      <EditableInput
                        type="number"
                        value={formData?.gratuidades ?? ''}
                        onSave={(v) => setFormData(prev => ({ ...prev, gratuidades: v }))}
                        parseValue={(v) => Math.max(0, parseInt(String(v).trim(), 10) || 0)}
                        formatForDisplay={(v) => (v === null || v === undefined || v === '' ? '' : String(v))}
                        onFocus={(e) => {
                          e.target.select()
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
                      <EditableInput
                        type="text"
                        value={formData?.bonificacion_pax ?? ''}
                        onSave={(v) => setFormData(prev => ({ ...prev, bonificacion_pax: v }))}
                        parseValue={(v) => {
                          const s = String(v || '').trim().replace(/,/g, '.')
                          if (s === '' || s === '-') return 0
                          const n = parseFloat(s)
                          return isNaN(n) ? 0 : Math.max(0, n)
                        }}
                        formatForDisplay={(v) => (v === null || v === undefined || v === '' ? '' : String(v))}
                        onFocus={(e) => {
                          e.target.select()
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
                        placeholder="0.00"
                        min="0"
                        tabIndex="4"
                      />
                    </div>
                    <div>
                      <label className="label font-bold text-green-700">💰 Precio Venta al Cliente (€/pax) *</label>
                      <EditableInput
                        type="text"
                        value={formData?.precio_venta_cliente ?? ''}
                        onSave={(v) => setFormData(prev => ({ ...prev, precio_venta_cliente: v }))}
                        parseValue={(v) => {
                          const s = String(v || '').trim().replace(/,/g, '.')
                          if (s === '' || s === '-') return 0
                          const n = parseFloat(s)
                          return isNaN(n) ? 0 : Math.max(0, n)
                        }}
                        formatForDisplay={(v) => (v === null || v === undefined || v === '' ? '' : String(v))}
                        onFocus={(e) => {
                          e.target.select()
                          handleFocus(e)
                          e.target.style.borderColor = '#3b82f6'
                          e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                        }}
                        onBlur={(e) => {
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
                            onWheel={handleWheel}
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
                              e.target.select()
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
                            Total Estancia (€)
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
                            onWheel={handleWheel}
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
                              e.target.select()
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
                        Total estancia: <span className="font-semibold text-slate-900">{suplementos.totalSupHabitacion}€</span>{' '}
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
                            onWheel={handleWheel}
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
                          e.target.select()
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
                            Precio por Persona (€)
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
                            onWheel={handleWheel}
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
                              e.target.select()
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
                <ServiciosCotizacionPanel
                  expediente={expediente}
                  expedienteId={expediente?.id}
                  servicios={servicios}
                  setServicios={setServicios}
                  proveedores={proveedores}
                  paxPago={paxPago}
                  totalPax={totalPax}
                  onRefresh={onRefresh}
                  cargarProveedores={cargarProveedores}
                  persistirCambios={persistirCambios}
                  isSaving={isSaving}
                  setIsSaving={setIsSaving}
                />

                {/* Resultados de la Cotización */}
                <div className="bg-white rounded-xl shadow-md p-4 sm:p-6 border border-gray-200">
                  <h3 className="text-xl font-bold text-navy-900 mb-4">Resumen Financiero</h3>
                  
                  {/* 8 cuadros: 2 columnas en móvil, 4 en desktop */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <p className="text-xs text-blue-700 font-semibold uppercase mb-1">🚌 Autobús/Pax</p>
                      <p className="text-xl font-bold text-blue-900">{resultados?.costeBusPorPax ?? '0.00'}€</p>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <p className="text-xs text-blue-700 font-semibold uppercase mb-1">👤 Guía/Pax</p>
                      <p className="text-xl font-bold text-blue-900">{resultados?.costeGuiaPorPax ?? '0.00'}€</p>
                    </div>
                    <div className="bg-teal-50 p-4 rounded-lg border border-teal-200">
                      <p className="text-xs text-teal-700 font-semibold uppercase mb-1">🗺️ Guía Local/Pax</p>
                      <p className="text-xl font-bold text-teal-900">{resultados?.costeGuiaLocalPorPax ?? '0.00'}€</p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                      <p className="text-xs text-purple-700 font-semibold uppercase mb-1">🏨 Hotel/Pax</p>
                      <p className="text-xl font-bold text-purple-900">{resultados?.costeHotelPorPax ?? '0.00'}€</p>
                    </div>
                    <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                      <p className="text-xs text-indigo-700 font-semibold uppercase mb-1">🛡️ Seguro/Pax</p>
                      <p className="text-xl font-bold text-indigo-900">{resultados?.costeSeguroPorPax ?? '0.00'}€</p>
                    </div>
                    <div className="bg-violet-50 p-4 rounded-lg border border-violet-200">
                      <p className="text-xs text-violet-700 font-semibold uppercase mb-1">🎫 Entradas/Pax</p>
                      <p className="text-xl font-bold text-violet-900">{resultados?.costeEntradasPorPax ?? '0.00'}€</p>
                    </div>
                    <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                      <p className="text-xs text-amber-700 font-semibold uppercase mb-1">🍽️ Restaurante/Pax</p>
                      <p className="text-xl font-bold text-amber-900">{resultados?.costeRestaurantePorPax ?? '0.00'}€</p>
                    </div>
                    <div className="bg-slate-100 p-4 rounded-lg border border-slate-300">
                      <p className="text-xs text-slate-700 font-semibold uppercase mb-1">📦 Otros/Pax</p>
                      <p className="text-xl font-bold text-slate-900">{resultados?.costeOtrosPorPax ?? '0.00'}€</p>
                    </div>

                    {parseInt(formData?.gratuidades || 0) > 0 && (
                      <div className="bg-orange-50 p-4 rounded-lg md:col-span-2 border-2 border-orange-300">
                        <p className="text-xs text-orange-700 font-semibold uppercase mb-1">🎁 Prorrateo Gratuidades/Pax</p>
                        <p className="text-sm text-orange-600 mb-1">
                          {resultados?.gratuidades ?? 0} plazas × {resultados?.costeBaseGratuidad ?? 0}€ = {resultados?.costePlazasGratuitas ?? 0}€ total
                        </p>
                        <p className="text-2xl font-bold text-orange-900">+{resultados?.costeGratuidadesPorPax ?? 0}€/pax</p>
            </div>
          )}

                    {parseFloat(formData?.bonificacion_pax || 0) > 0 && (
                      <div className="bg-yellow-50 p-4 rounded-lg md:col-span-2 border-2 border-yellow-300">
                        <p className="text-xs text-yellow-700 font-semibold uppercase mb-1">💳 Bonificación Pactada</p>
                        <p className="text-2xl font-bold text-yellow-900">+{resultados?.bonificacion ?? 0}€/pax</p>
                      </div>
                    )}
                  </div>
                  
                  {/* DESGLOSE CLARO: Base + Gratuidades = Total */}
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-xl border-2 border-blue-300 mt-6">
                    <h4 className="text-lg font-bold text-navy-900 mb-4">📊 Desglose del Coste Real</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between py-2 border-b border-blue-200">
                        <span className="text-blue-700 font-medium">🚌 Coste Base Servicios (por persona)</span>
                        <span className="font-bold text-blue-900">{resultados?.costeBasePorPersona ?? 0}€</span>
                      </div>
                      {parseInt(formData?.gratuidades || 0) > 0 && (
                        <div className="flex justify-between py-2 border-b border-blue-200">
                          <span className="text-orange-700 font-medium">➕ Prorrateo Gratuidades ({formData?.gratuidades || 0} × {resultados?.costeBaseGratuidad ?? 0}€)</span>
                          <span className="font-bold text-orange-900">+{resultados?.costeGratuidadesPorPax ?? 0}€</span>
                        </div>
                      )}
                      {parseFloat(formData?.bonificacion_pax || 0) > 0 && (
                        <div className="flex justify-between py-2 border-b border-blue-200">
                          <span className="text-yellow-700 font-medium">➕ Bonificación Pactada</span>
                          <span className="font-bold text-yellow-900">+{resultados?.bonificacion ?? 0}€</span>
                        </div>
                      )}
                      <div className="flex justify-between py-3 bg-red-100 rounded-lg px-4 mt-3 border-2 border-red-400">
                        <span className="text-base font-black text-red-900 uppercase">= Coste Real por Persona</span>
                        <span className="text-3xl font-black text-red-900">{resultados?.costeRealPorPersona ?? 0}€</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* RESUMEN COMERCIAL - NUEVO MODELO (SIEMPRE VISIBLE) */}
                  <div className="bg-white p-6 rounded-xl border-2 border-gray-200 shadow-md mt-6">
                    <h4 className="text-lg font-bold text-navy-900 mb-4">💼 Resumen Comercial</h4>
                    
                    {/* Pasajeros de pago - Origen del dinero */}
                    <div className="mb-4 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
                      <p className="text-base font-bold text-navy-900">
                        👥 Pasajeros de pago: <span className="text-2xl text-blue-700">{resultados?.paxDePago ?? resultados?.paxPagadores}</span>
                        {resultados?.totalPasajeros > 0 && (
                          <span className="text-sm font-normal text-slate-600 ml-2">
                            (de {resultados?.totalPasajeros ?? 0} total − {resultados?.gratuidades ?? 0} gratuidades)
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
                        <p className="text-3xl font-black text-blue-900">{resultados?.costeRealPorPersona ?? 0}€</p>
                        <p className="text-xs text-blue-600 mt-1">Total: {resultados?.costeTotalViaje ?? 0}€</p>
                      </div>
                      
                      {/* 2. PRECIO VENTA - Verde Destacado */}
                      <div className="bg-green-50 p-5 rounded-lg border-2 border-green-400 shadow-lg">
                        <p className="text-xs text-green-700 font-bold uppercase mb-1">💰 Precio Venta/Pax</p>
                        <p className="text-3xl font-black text-green-900">{resultados?.precioVentaPorPersona ?? 0}€</p>
                        <p className="text-xs text-green-600 mt-1">Total: {resultados?.precioVentaTotal ?? 0}€</p>
                      </div>
                      
                      {/* 3. MARGEN - Verde si positivo, Rojo si negativo */}
                      <div className={`p-5 rounded-lg border-2 ${parseFloat(resultados?.margenPorPersona) >= 0 ? 'bg-green-50 border-green-400' : 'bg-red-50 border-red-400'}`}>
                        <p className={`text-xs font-bold uppercase mb-1 ${parseFloat(resultados?.margenPorPersona) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {parseFloat(resultados?.margenPorPersona) >= 0 ? '📈 Margen/Pax' : '⚠️ Pérdida/Pax'}
                        </p>
                        <p className={`text-3xl font-black ${parseFloat(resultados?.margenPorPersona) >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                          {parseFloat(resultados?.margenPorPersona) >= 0 ? '+' : ''}{resultados?.margenPorPersona ?? 0}€
                        </p>
                        <p className={`text-xs mt-1 ${parseFloat(resultados?.margenPorPersona) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {resultados?.margenPorcentaje ?? 0}% · Total: {resultados?.beneficioTotal ?? 0}€
                        </p>
                      </div>
                    </div>
                    
                    {/* Beneficio Total del Viaje: Ingresos (Total Venta) - Costes (proveedor) */}
                    <div className={`mt-4 p-4 rounded-lg ${parseFloat(resultados?.beneficioTotal) >= 0 ? 'bg-gradient-to-r from-green-100 to-emerald-100' : 'bg-gradient-to-r from-red-100 to-orange-100'}`}>
                      <div className="flex justify-between items-center">
                        <span className={`text-base font-bold ${parseFloat(resultados?.beneficioTotal) >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                          💼 Beneficio Real (Ingresos − Costes):
                        </span>
                        <span className={`text-2xl font-black ${parseFloat(resultados?.beneficioTotal) >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                          {parseFloat(resultados?.beneficioTotal) >= 0 ? '+' : ''}{resultados?.beneficioTotal ?? 0}€
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        Ingresos {resultados?.ingresos ?? 0}€ − Costes {resultados?.costes ?? 0}€
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
                            {parseFloat(resultados?.iva) >= 0 ? '+' : ''}{resultados?.iva ?? 0}€
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
                            {parseFloat(resultados?.beneficioNeto) >= 0 ? '+' : ''}{resultados?.beneficioNeto ?? 0}€
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
                        👥 Pasajeros de pago: <span className="font-bold text-navy-900">{resultados?.paxDePago ?? resultados?.paxPagadores}</span>
                        {resultados?.totalPasajeros > 0 && (
                          <span className="text-slate-600 font-normal ml-1">
                            ({resultados?.totalPasajeros ?? 0} total − {resultados?.gratuidades ?? 0} gratuidades)
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
                          {(resultados?.totalVenta ?? '0.00')}€
                        </span>
                      </div>
                      <p className="text-xs text-amber-800 mt-1">
                        (pax de pago × precio) − bonificación + suplementos
                      </p>
                    </div>

                    {/* Comparativa de cobros: Total Cobrado y Saldo Pendiente */}
                    {(() => {
                      const totalCotizacion = parseFloat(String(resultados?.totalVenta ?? 0).replace(',', '.')) || 0
                      const totalCobrado = Array.isArray(cobros) ? cobros.reduce((sum, c) => sum + (parseFloat(String(c.importe ?? 0).replace(',', '.')) || 0), 0) : 0
                      const saldoPendiente = totalCotizacion - totalCobrado
                      const isPagado = saldoPendiente <= 0
                      return (
                        <>
                          <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                            <div className="flex justify-between items-center text-sm">
                              <span className="font-semibold text-slate-700">Total Cobrado:</span>
                              <span className="font-bold text-slate-900">{totalCobrado.toFixed(2)}€</span>
                            </div>
                          </div>
                          <div className={`mt-2 p-3 border rounded-lg ${isPagado ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                            <div className="flex justify-between items-center text-sm">
                              <span className={`font-semibold ${isPagado ? 'text-green-800' : 'text-red-800'}`}>
                                Pendiente de Cobro:
                              </span>
                              <span className={`font-bold ${isPagado ? 'text-green-900' : 'text-red-900'}`}>
                                {isPagado ? 'Pagado' : `${saldoPendiente.toFixed(2)}€`}
                              </span>
                            </div>
                          </div>
                        </>
                      )
                    })()}
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
                        onWheel={handleWheel}
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
                        onWheel={handleWheel}
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
                        onWheel={handleWheel}
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
                      {documentos.map((doc, idx) => (
                        <div key={doc.id || `doc-${idx}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
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

            {/* TAB: Cobros y Pagos - delegado a ExpedienteFinanzas */}
          {tab === 'cobros' && (
              <ExpedienteFinanzas
                activeTab="cobros"
                expediente={expediente}
                onUpdate={onUpdate}
                cobros={cobros}
                onCobrosReload={cargarCobros}
                onExpedienteRefresh={async () => {
                  if (!expediente?.id || !onUpdate) return
                  const { data } = await supabase.from('expedientes').select('presupuesto_total, total_cobrado').eq('id', expediente.id).single()
                  if (data) onUpdate({ ...expediente, presupuesto_total: data.presupuesto_total, total_cobrado: data.total_cobrado })
                }}
                servicios={servicios}
                formData={formData}
                suplementos={suplementos}
                expedienteClientes={expedienteClientes}
                grupo={grupo}
                clienteIdPrincipal={clienteIdPrincipal}
                obtenerProveedorPorId={obtenerProveedorPorId}
                clientes={clientes}
              />
          )}

          {/* TAB: Pagos a Proveedores */}
          {tab === 'pagosProveedores' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                <h3 className="text-xl font-bold text-navy-900 mb-4">Registrar nuevo pago</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Servicio</label>
                    <select
                      value={formPago.servicio_id}
                      onChange={(e) => setFormPago({ ...formPago, servicio_id: e.target.value })}
                      className="w-full p-3 rounded-lg border border-gray-200 bg-gray-50 text-gray-900"
                    >
                      <option value="">— Seleccionar —</option>
                      {servicios.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.tipo || 'Servicio'} {s.nombreEspecifico ? `- ${s.nombreEspecifico}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Fecha de Pago</label>
                    <input
                      type="date"
                      value={formPago.fecha_pago}
                      onChange={(e) => setFormPago({ ...formPago, fecha_pago: e.target.value })}
                      className="w-full p-3 rounded-lg border border-gray-200 bg-gray-50 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Importe Pagado (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formPago.importe_pagado}
                      onChange={(e) => setFormPago({ ...formPago, importe_pagado: e.target.value })}
                      className="w-full p-3 rounded-lg border border-gray-200 bg-gray-50 text-gray-900"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={registrarPagoProveedor}
                      className="btn-primary w-full flex items-center justify-center gap-2 py-3"
                    >
                      <CreditCard size={18} />
                      Registrar Pago
                    </button>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                <h3 className="text-xl font-bold text-navy-900 mb-4">Pagos realizados</h3>
                {cargandoPagosProveedores ? (
                  <p className="text-gray-500">Cargando...</p>
                ) : pagosProveedores.length === 0 ? (
                  <p className="text-gray-500">No hay pagos registrados.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-gray-600 font-semibold">
                          <th className="py-2 pr-4">Fecha</th>
                          <th className="py-2 pr-4">Servicio</th>
                          <th className="py-2 pr-4">Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagosProveedores.map((p) => {
                          const servicio = servicios.find((s) => s.id === (p.servicio_id || p.id_servicio))
                          return (
                            <tr key={p.id || `${p.servicio_id}-${p.fecha_pago}-${p.importe_pagado}`} className="border-b border-gray-100">
                              <td className="py-2 pr-4">{p.fecha_pago || '—'}</td>
                              <td className="py-2 pr-4">{servicio ? `${servicio.tipo || ''} ${servicio.nombreEspecifico || ''}`.trim() || '—' : '—'}</td>
                              <td className="py-2 pr-4 font-medium">{Number(p.importe_pagado || 0).toFixed(2)} €</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: Cierre de Grupo - delegado a ExpedienteFinanzas */}
          {tab === 'cierre' && (
              <ExpedienteFinanzas
                activeTab="cierre"
                expediente={expediente}
                onUpdate={onUpdate}
                cobros={cobros}
                onCobrosReload={cargarCobros}
                onExpedienteRefresh={async () => {
                  if (!expediente?.id || !onUpdate) return
                  const { data } = await supabase.from('expedientes').select('presupuesto_total, total_cobrado').eq('id', expediente.id).single()
                  if (data) onUpdate({ ...expediente, presupuesto_total: data.presupuesto_total, total_cobrado: data.total_cobrado })
                }}
                servicios={servicios}
                formData={formData}
                suplementos={suplementos}
                expedienteClientes={expedienteClientes}
                grupo={grupo}
                clienteIdPrincipal={clienteIdPrincipal}
                obtenerProveedorPorId={obtenerProveedorPorId}
                clientes={clientes}
              />
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
                              <span>• Total estancia (habitación individual):</span>
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
                          if (!window.confirm('¿Estás seguro de que quieres borrar TODAS las facturas de prueba (TEST-XXX)?')) {
                            return
                          }
                          try {
                            const { error } = await supabase
                              .from('facturas')
                              .delete()
                              .ilike('numero_factura', 'TEST-%')
                            if (error) {
                              alert(`❌ Error borrando facturas de prueba: ${error.message}`)
                            } else {
                              alert('✅ Facturas de prueba eliminadas correctamente.')
                            }
                          } catch (e) {
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
                              <tr key={version.id || `ver-${index}`} className="hover:bg-gray-50 transition-colors">
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
                      if (onUpdate) onUpdate({ ...expediente, drive_link: value })
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

            
          </div>
        </div>
        
      </div>
    )
  } catch (e) {
    return <div className="p-4 text-red-600">Error al cargar esta sección</div>
  }
}

export default ExpedienteDetalle
