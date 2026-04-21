import React, { useState, useEffect, useMemo, useRef } from 'react'
import { X, Users, Calculator, Bed, DollarSign, FileUp, TrendingUp, Save, Upload, Trash2, Plus, FileText, Pencil, Printer, FileDown, CheckCircle, CreditCard, Paperclip, Eye } from 'lucide-react'
import { storage } from '../utils/storage'
import { normalizarFechaEspañola, convertirEspañolAISO, convertirISOAEspañol, parsearFechaADate } from '../utils/dateNormalizer'
import { supabase } from '../supabase'
import { validarProveedoresServicios, consolidarGastosExpediente } from '../utils/consolidacionGastos'
import { construirBloqueTotalesCierre } from '../utils/cierreGrupoFuenteVerdad'
import { detectarCamposPendientes } from '../utils/constraintValidator'
import { existeNumeroExpedienteEnSupabase, esNumeroExpedienteValido } from '../utils/expedienteNumero'
import { normalizarMetodoPago } from '../utils/finanzasHelpers'
import { desgloseIvaBeneficioBruto } from '../utils/finance'
import { DATOS_EMISOR } from '../config/empresa'
import ExpedienteFinanzas from './ExpedienteFinanzas'
import ServiciosCotizacionPanel from './ServiciosCotizacionPanel'
import TablaServiciosVariante from './TablaServiciosVariante'
import EditableInput from './EditableInput'
import {
  DestinoExpedienteEditable,
  normalizarServicioFuentePresupuestoParaPagos,
  filtrarServiciosParaTabPagosProveedores,
  unificarServiciosPagosPorNombreYProveedor,
  limpiarDesgloseGruposParaSupabase,
  idsServicioFilaPagos,
} from './expedientes/FichaDelGrupo'
import jsPDF from 'jspdf'
import {
  categorizarPagoInformeCierre,
  payloadDesdeCierreGrupo,
  crearJsPdfInformeCierreFinanciero,
} from '../utils/informeCierreHaciendaPdf'
import { useEmpresa } from '../context/EmpresaContext'

/** Bucket único de Storage para facturas adjuntas en «Pagos a Proveedores». */
const BUCKET_FACTURAS_PROVEEDORES = 'facturas_proveedores'
const SUBMIT_DEDUPE_MS = 2000

const proveedorInformeTexto = (proveedor) => {
  const txt = String(proveedor ?? '').trim()
  return txt || 'Varios/Sin asignar'
}

/** Ruta relativa del objeto dentro del bucket (p. ej. para remove y getPublicUrl). */
const extraerRutaObjectoFacturaProveedor = (urlPdf) => {
  if (!urlPdf || typeof urlPdf !== 'string') return null
  const trimmed = urlPdf.trim()
  const marker = `/object/public/${BUCKET_FACTURAS_PROVEEDORES}/`
  const idx = trimmed.indexOf(marker)
  if (idx >= 0) {
    let path = trimmed.slice(idx + marker.length).split('?')[0]
    try {
      path = decodeURIComponent(path)
    } catch (_) {}
    return path
  }
  if (!/^https?:\/\//i.test(trimmed)) return trimmed.replace(/^\/+/, '')
  return null
}

/**
 * Ver factura: getPublicUrl(nombreUnico) en facturas_proveedores + window.open.
 * En BD se guarda la ruta del objeto (fac-….pdf) o URL legada.
 */
const abrirFacturaProveedorPorUrlGuardada = (valorGuardado) => {
  if (!valorGuardado || typeof valorGuardado !== 'string') return
  const nombreUnico =
    extraerRutaObjectoFacturaProveedor(valorGuardado) || valorGuardado.replace(/^\/+/, '').trim()
  if (nombreUnico) {
    const publicUrl = supabase.storage.from('facturas_proveedores').getPublicUrl(nombreUnico).data
      ?.publicUrl
    if (publicUrl) {
      window.open(publicUrl, '_blank', 'noopener,noreferrer')
      return
    }
  }
  const t = valorGuardado.trim()
  if (/^https?:\/\//i.test(t)) window.open(t, '_blank', 'noopener,noreferrer')
}

const eliminarObjetoStorageFacturaProveedor = async (urlPdf) => {
  const path = extraerRutaObjectoFacturaProveedor(urlPdf)
  if (!path) return { ok: true }
  const { error } = await supabase.storage.from(BUCKET_FACTURAS_PROVEEDORES).remove([path])
  if (error) return { ok: false, error }
  return { ok: true }
}

/** Coincide pago con fila de servicio de cotización (esquema actual: servicio_id). */
const pagoProveedorCoincideServicioCot = (pago, servicioId) => {
  if (!pago || servicioId == null || servicioId === '') return false
  return String(pago.servicio_id ?? '') === String(servicioId)
}

const pagoProveedorCoincideFilaServiciosCot = (pago, filaServicio) => {
  const ids = idsServicioFilaPagos(filaServicio)
  return ids.some((id) => pagoProveedorCoincideServicioCot(pago, id))
}

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

/**
 * Tipo de servicio legible para pagos_proveedores.concepto (solo categoría: "Guía Local", "Autobús", …).
 */
const tipoServicioLegibleParaConcepto = (servicio) => {
  if (!servicio) return 'Servicio'
  const tipoRaw = servicio.tipo_servicio || servicio.tipo || ''
  const t = normalizarTipo(tipoRaw)
  const map = {
    autobus: 'Autobús',
    transporte: 'Autobús',
    bus: 'Autobús',
    hotel: 'Hotel',
    restaurante: 'Restaurante',
    guia: 'Guía Local',
    museo: 'Museo',
    entrada: 'Entrada',
    excursion: 'Excursión',
    seguro: 'Seguro',
    otro: 'Otros',
    otros: 'Otros',
    tren: 'Tren',
    avion: 'Avión',
    vuelo: 'Vuelo',
    ferry: 'Ferry',
    barco: 'Barco',
    circuito: 'Circuito',
    visita: 'Visita',
  }
  return map[t] || (String(tipoRaw).trim() || 'Servicio')
}

/** proveedor_id (FK) y nombre mostrado desde fila servicios_cotizacion enriquecida. */
const datosProveedorDesdeServicioCot = (servicio) => {
  if (!servicio) return { proveedorId: null, proveedorNombre: null }
  const rawId = servicio.proveedor_id_int ?? servicio.proveedorId
  const proveedorId =
    rawId != null && rawId !== '' && !Number.isNaN(Number(rawId)) ? Number(rawId) : null
  const proveedorNombre =
    String(
      servicio._proveedorNombre
        || servicio.nombre_proveedor_texto
        || servicio.nombre_proveedor_manual
        || ''
    ).trim() || null
  return { proveedorId, proveedorNombre }
}

/** Columnas de pagos_proveedores (information_schema). Solo lectura/respuesta API. */
const PAGOS_PROVEEDORES_COLUMNAS =
  'id, expediente_id, proveedor_id, proveedor_nombre, servicio_id, fecha_pago, importe_pagado, numero_factura, url_pdf, concepto'

/**
 * Objeto insert/update: únicamente las columnas anteriores (sin id). Evita PGRST / schema cache.
 */
const filaPagosProveedores = ({
  expediente_id,
  proveedor_id,
  proveedor_nombre,
  servicio_id,
  fecha_pago,
  importe_pagado,
  numero_factura,
  url_pdf,
  concepto,
}) => ({
  expediente_id,
  proveedor_id: proveedor_id ?? null,
  proveedor_nombre: proveedor_nombre ?? null,
  servicio_id: servicio_id ?? null,
  fecha_pago,
  importe_pagado,
  numero_factura: numero_factura ?? null,
  url_pdf: url_pdf ?? null,
  concepto,
})

/**
 * Vista «Pagos a Proveedores»: ocultar en pantalla (no borrar datos) líneas con importe 0 € y sin proveedor.
 * Criterio alineado con la tarjeta: nombre vacío e id ausente.
 */
const filaPagoProveedorOcultaEnVistaPagosTab = (p) => {
  const imp = Math.round(Number(p?.importe_pagado ?? 0) * 100) / 100
  const nom = String(p?.proveedor_nombre ?? '').trim()
  const id = p?.proveedor_id
  const tieneProveedor = nom.length > 0 || (id != null && String(id).trim() !== '')
  return imp === 0 && !tieneProveedor
}

const tarjetaServicioCotOcultaEnVistaPagosTab = (s) => {
  const imp = Math.round(
    Number(s?.total_servicio_manual ?? s?.total_servicio ?? s?.coste_unitario ?? 0) * 100
  ) / 100
  const tieneProveedor = String(s?._proveedorNombre ?? '').trim().length > 0
  return imp === 0 && !tieneProveedor
}

/** Título del servicio como en la tarjeta (tipo_servicio / tipo); si vacío, etiqueta legible. */
const tituloServicioParaConcepto = (servicio) => {
  if (!servicio) return 'Servicio'
  const t = String(servicio.tipo_servicio || servicio.tipo || '').trim()
  return t || tipoServicioLegibleParaConcepto(servicio)
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

/** Keys de cabecera por variante (Pasajeros, Precio, Bonificación, Suplementos) */
const CABECERA_KEYS = ['total_pax', 'gratuidades', 'precio_venta_cliente', 'bonificacion_pax', 'sup_individual_pax', 'sup_individual_precio_dia', 'sup_seguro_pax', 'sup_seguro_precio_total'];

/** Compara formData de cotización con último guardado (para detectar cambios sin guardar) */
const formDataCotizacionIgual = (a, b) => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return CABECERA_KEYS.every(k => toNum(a[k]) === toNum(b[k]));
};

/** Cabecera por defecto desde expediente o formData */
const getDefaultCabecera = (exp, fd) => ({
  total_pax: toNum(exp?.total_pax ?? fd?.total_pax) || 1,
  gratuidades: toNum(exp?.gratuidades ?? fd?.gratuidades) || 0,
  precio_venta_cliente: toNum(exp?.precio_venta_cliente ?? fd?.precio_venta_cliente) || 0,
  bonificacion_pax: toNum(exp?.bonificacion_pax ?? fd?.bonificacion_pax) || 0,
  sup_individual_pax: toNum(exp?.sup_individual_pax ?? fd?.sup_individual_pax) || 0,
  sup_individual_precio_dia: toNum(exp?.sup_individual_precio_dia ?? fd?.sup_individual_precio_dia) || 0,
  sup_seguro_pax: toNum(exp?.sup_seguro_pax ?? fd?.sup_seguro_pax) || 0,
  sup_seguro_precio_total: toNum(exp?.sup_seguro_precio_total ?? fd?.sup_seguro_precio_total) || 0,
});

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
    const desgloseBen = desgloseIvaBeneficioBruto(beneficioTotal)
    const iva = desgloseBen.ivaPagado
    const beneficioNeto = desgloseBen.beneficioNeto
    const beneficioNetoBase = desgloseBen.beneficioBruto

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

const ExpedienteDetalle = ({ expediente, onClose, onUpdate, onRefresh, clientes = [], initialTab, user = null }) => {
  const { empresaId } = useEmpresa()
  const cierreGrupo = expediente?.cierre_grupo || {}

  // Estados
  const [tab, setTab] = useState('grupo')
  const [editandoCliente, setEditandoCliente] = useState(false)
  const [errorNumeroExpediente, setErrorNumeroExpediente] = useState(null)

  // Abrir en tab específica cuando se navega desde Historial de Cierres (Ver Detalle)
  useEffect(() => {
    if (initialTab && ['grupo', 'cotizacion', 'pasajeros', 'cobros', 'pagosProveedores', 'facturacion', 'documentacion', 'cierre'].includes(initialTab)) {
      setTab(initialTab)
    }
  }, [initialTab])

  // Limpiar error de numero_expediente al cambiar de expediente
  useEffect(() => {
    setErrorNumeroExpediente(null)
  }, [expediente?.id])

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
  }, [expediente?.id, expediente?.cierre_grupo])
  
  const informeLiquidacionInicializadoRef = useRef(false)

  // Ref para detectar cambios sin guardar en cotización (formData)
  const lastSavedFormDataRef = useRef(null)
  const lastSavedVersionesRef = useRef(null)
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
  
  // ── MULTIGRUPO ────────────────────────────────────────────────────────────────────
  // Per-row search state for the client selector: { [rowId]: string }
  const [busquedaGrupo, setBusquedaGrupo] = useState({})
  // Per-row dropdown visibility: { [rowId]: boolean }
  const [dropdownGrupo, setDropdownGrupo] = useState({})

  // ── MULTIGRUPO: safe init from prop (select('*') already fetches desglose_grupos) ──
  const [desgloseGrupos, setDesgloseGrupos] = useState(() => {
    try {
      return Array.isArray(expediente?.desglose_grupos) && expediente.desglose_grupos.length > 0
        ? expediente.desglose_grupos
        : []
    } catch { return [] }
  })

  // Re-sync from parent prop whenever the expediente changes (open/reopen/save refresh).
  // Always overwrites local state with DB truth so groups are never stale.
  useEffect(() => {
    try {
      const grupos = expediente?.desglose_grupos
      if (Array.isArray(grupos)) {
        setDesgloseGrupos(grupos) // covers both non-empty (load) and [] (cleared)
      }
    } catch { /* silent */ }
  }, [expediente?.id, expediente?.desglose_grupos])

  // Sync ONLY total_pax + gratuidades from group table when groups have pax data.
  // bonificacion_pax is intentionally NOT touched — it stays on the main cotización field.
  // If all groups have pax === 0, the manual fields remain editable and unchanged.
  useEffect(() => {
    try {
      if (!desgloseGrupos.length) return
      const sumPax = desgloseGrupos.reduce((s, g) => s + (Number(g.pax) || 0), 0)
      const sumGratis = desgloseGrupos.reduce((s, g) => s + (Number(g.gratuidades) || 0), 0)
      if (sumPax === 0) return // groups exist but no pax entered yet — keep manual value
      setFormData(prev => ({ ...prev, total_pax: sumPax, gratuidades: sumGratis }))
      if (versiones.length > 0) {
        setVersiones(prev => prev.map((v, i) =>
          i === versionActiva
            ? { ...v, cabecera: { ...(v.cabecera || {}), total_pax: sumPax, gratuidades: sumGratis } }
            : v
        ))
      }
    } catch { /* silent — never crash load */ }
  }, [desgloseGrupos])

  // Estado de carga: bloquea guardados hasta que los datos estén cargados
  const [datosCargados, setDatosCargados] = useState(false)

  // Estado de guardado: evita duplicados y muestra feedback
  const [isSaving, setIsSaving] = useState(false)

  // Estados para servicios (separados porque se guardan en tabla diferente)
  const [servicios, setServicios] = useState([])

  // Multicotización: versiones de presupuesto. versiones_json en expediente.
  // Solo la opción CONFIRMADA suma para beneficio_neto_real (Central de Inteligencia).
  const [versiones, setVersiones] = useState([])
  const [versionActiva, setVersionActiva] = useState(0)
  
  // Estados para Proveedores
  const [proveedores, setProveedores] = useState([])
  
  // Estados para Historial de Expedientes
  const [expedientesHistorial, setExpedientesHistorial] = useState([])
  const [cargandoHistorial, setCargandoHistorial] = useState(false)

  // Estados para Pagos a Proveedores
  const [pagosProveedores, setPagosProveedores] = useState([])
  const [cargandoPagosProveedores, setCargandoPagosProveedores] = useState(false)
  const [formPago, setFormPago] = useState({ servicio_id: '', fecha_pago: '', importe_pagado: '' })
  const [isSubmittingPagoProveedor, setIsSubmittingPagoProveedor] = useState(false)

  // Lista inteligente de servicios (solo activa en la pestaña de pagos)
  const [serviciosCot,     setServiciosCot]     = useState([])
  const [cargandoCot,      setCargandoCot]       = useState(false)
  const [errorCot,         setErrorCot]          = useState(null)
  const [inlineId,         setInlineId]          = useState(null)   // ID del servicio con form abierto
  const [fInline,          setFInline]           = useState({ numero_factura: '', fecha_pago: new Date().toISOString().split('T')[0], importe_pagado: '' })
  const [pdfInline,        setPdfInline]         = useState(null)
  const [subiendoPdfCot,   setSubiendoPdfCot]    = useState(false)
  const [showGastoExtra,   setShowGastoExtra]    = useState(false)
  const [fExtra,           setFExtra]            = useState({ numero_factura: '', fecha_pago: new Date().toISOString().split('T')[0], importe_pagado: '', proveedor_nombre: '', concepto: '' })
  const [pdfExtra,         setPdfExtra]          = useState(null)
  const [mensajeExitoFacturaProveedor, setMensajeExitoFacturaProveedor] = useState(null)
  const lastSubmitRef = useRef({})

  const esSubmitDuplicadoReciente = (key, payload) => {
    const ahora = Date.now()
    const previo = lastSubmitRef.current[key]
    const firma = JSON.stringify(payload)
    if (previo && previo.firma === firma && ahora - previo.ts < SUBMIT_DEDUPE_MS) return true
    lastSubmitRef.current[key] = { firma, ts: ahora }
    return false
  }

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

  // Mapear fila BD → objeto servicio interno
  const mapearFilaAServicio = (row) => {
    const coste = (v) => toNum(v)
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
  }
  const tieneDatos = (r) => {
    const tieneProveedor = (x) => x.proveedorId != null || (x.proveedorNombreTemporal && String(x.proveedorNombreTemporal).trim())
    const tieneNombreServicio = (x) => x.nombreEspecifico && String(x.nombreEspecifico).trim()
    const tieneTipo = (x) => x.tipo && String(x.tipo).trim()
    const tieneImporte = (x) => x.coste_unitario != null && Number(x.coste_unitario) > 0
    const tieneTotalManual = (x) => x.total_servicio_manual != null && Number(x.total_servicio_manual) > 0
    return tieneProveedor(r) || tieneNombreServicio(r) || tieneImporte(r) || tieneTotalManual(r) || tieneTipo(r)
  }

  // Cargar servicios de cotización cuando se abre el expediente (para Cierre de Grupo y otras pestañas)
  // Multicotización: si versiones_json existe, usar; si no, crear Opción 1 desde servicios_cotizacion
  const cargarServiciosCotizacion = async () => {
    const id = expediente?.id
    if (!id) return
    lastSavedVersionesRef.current = null
    try {
      const { data: expData } = await supabase.from('expedientes').select('versiones_json').eq('id', id).single()
      const vj = expData?.versiones_json ?? expediente?.versiones_json
      const versionesGuardadas = Array.isArray(vj?.versiones) ? vj.versiones : null

      if (versionesGuardadas && versionesGuardadas.length > 0) {
        const defaultCab = getDefaultCabecera(expediente, null)
        const vs = versionesGuardadas.map(v => {
          const cab = v.cabecera && typeof v.cabecera === 'object'
            ? { ...defaultCab, ...v.cabecera }
            : defaultCab
          return {
            id: v.id || generarUUID(),
            nombre: v.nombre ?? '',
            servicios: Array.isArray(v.servicios) ? v.servicios : [],
            confirmada: !!v.confirmada,
            cabecera: cab,
          }
        })
        setVersiones(vs)
        lastSavedVersionesRef.current = JSON.parse(JSON.stringify(vs))
        setVersionActiva(0)
        const servs = versionesGuardadas[0]?.servicios || []
        setServicios(Array.isArray(servs) ? servs : [])
        return
      }

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
      const defaultCab = getDefaultCabecera(expediente, null)
      if (data && Array.isArray(data) && data.length > 0) {
        const todosMapeados = data.map(mapearFilaAServicio)
        const serviciosMapeados = todosMapeados.filter(tieneDatos)
        const versionInicial = {
          id: generarUUID(),
          nombre: '',
          servicios: serviciosMapeados,
          confirmada: false,
          cabecera: { ...defaultCab },
        }
        setVersiones([versionInicial])
        setVersionActiva(0)
        setServicios(serviciosMapeados)
      } else {
        const versionInicial = { id: generarUUID(), nombre: '', servicios: [], confirmada: false, cabecera: { ...defaultCab } }
        setVersiones([versionInicial])
        setVersionActiva(0)
        setServicios([])
      }
    } catch (_) {
      const defaultCab = getDefaultCabecera(expediente, null)
      setVersiones([{ id: generarUUID(), nombre: '', servicios: [], confirmada: false, cabecera: { ...defaultCab } }])
      setVersionActiva(0)
      setServicios([])
    }
  }

  useEffect(() => {
    if (expediente?.id) {
      cargarServiciosCotizacion()
    } else {
      setServicios([])
      setVersiones([])
      setVersionActiva(0)
    }
  }, [expediente?.id])

  // setServicios que persiste en versiones[versionActiva].servicios (no en raíz del expediente)
  const setServiciosYVersiones = (nuevosServiciosOrUpdater) => {
    const nuevos = typeof nuevosServiciosOrUpdater === 'function'
      ? nuevosServiciosOrUpdater(servicios)
      : nuevosServiciosOrUpdater
    const arrFinal = Array.isArray(nuevos) ? nuevos : []
    setServicios(arrFinal)
    setVersiones(prev => {
      const next = [...prev]
      if (next[versionActiva]) {
        next[versionActiva] = { ...next[versionActiva], servicios: [...arrFinal] }
      }
      return next
    })
  }

  // Al cambiar de pestaña: TablaServiciosVariante ya actualiza versiones en cada cambio; aquí solo cambiamos activa.
  const cambiarVersionActiva = (nuevoIdx) => {
    if (nuevoIdx === versionActiva) return
    setVersiones(prev => {
      const servs = prev[versionActiva]?.servicios ?? servicios
      return prev.map((v, i) => i === versionActiva ? { ...v, servicios: [...servs] } : v)
    })
    setVersionActiva(nuevoIdx)
  }

  // VINCULACIÓN DE DATOS: servicios = versiones[versionActiva].servicios. Actualiza inputs al cambiar pestaña.
  useEffect(() => {
    if (versiones.length > 0 && versionActiva >= 0 && versionActiva < versiones.length) {
      const servs = versiones[versionActiva]?.servicios ?? []
      setServicios(Array.isArray(servs) ? [...servs] : [])
    }
  }, [versionActiva, versiones])

  // Cabecera por variante: en multicotización usa versiones[versionActiva].cabecera; si no, formData
  const formDataParaVariante = useMemo(() => {
    if (versiones.length > 0 && versionActiva >= 0 && versionActiva < versiones.length) {
      const cab = versiones[versionActiva]?.cabecera
      return { ...getDefaultCabecera(expediente, formData), ...cab }
    }
    return formData
  }, [versiones, versionActiva, formData, expediente])

  // Actualizar cabecera de la variante activa (solo en multicotización)
  const setCabeceraVariante = (field, value) => {
    if (versiones.length === 0) {
      setFormData(prev => ({ ...prev, [field]: value }))
      return
    }
    setVersiones(prev => prev.map((v, i) =>
      i === versionActiva ? { ...v, cabecera: { ...(v.cabecera || getDefaultCabecera(expediente, formData)), [field]: value } } : v
    ))
  }

  // Duplicar cotización actual: hereda servicios y cabecera de la variante activa
  const duplicarCotizacion = () => {
    const v = versiones[versionActiva]
    const servs = v?.servicios ?? servicios
    const cab = v?.cabecera ? { ...getDefaultCabecera(expediente, null), ...v.cabecera } : getDefaultCabecera(expediente, formData)
    const nuevaVersion = {
      id: generarUUID(),
      nombre: '',
      servicios: servs.map(s => ({ ...s, id: generarUUID() })),
      confirmada: false,
      cabecera: { ...cab },
    }
    setVersiones(prev => [...prev, nuevaVersion])
    setVersionActiva(versiones.length)
    setServicios(nuevaVersion.servicios)
  }

  // Marcar versión como CONFIRMADA (solo esta suma para beneficio_neto_real)
  const marcarComoConfirmada = (idx) => {
    setVersiones(prev => prev.map((v, i) => ({ ...v, confirmada: i === idx })))
  }

  // Servicios para Cierre/beneficio: usar la versión CONFIRMADA
  const serviciosParaCierre = useMemo(() => {
    const conf = versiones.find(v => v.confirmada)
    if (conf && Array.isArray(conf.servicios) && conf.servicios.length > 0) return conf.servicios
    return servicios
  }, [versiones, servicios])

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
            const { beneficioNeto } = desgloseIvaBeneficioBruto(beneficioTotal)

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

  // Detectar cambios sin guardar en cotización (cabecera + versiones vs último guardado)
  const hasCotizacionSinGuardar = useMemo(() => {
    if (versiones.length > 0) {
      const last = lastSavedVersionesRef.current
      if (!last) return true // versiones nuevas sin guardar aún
      try {
        return JSON.stringify(versiones) !== JSON.stringify(last)
      } catch {
        return false
      }
    }
    const last = lastSavedFormDataRef.current
    return last && formData && !formDataCotizacionIgual(formData, last)
  }, [formData, versiones])

  const recargarInformeDesdeCotizacion = async () => {
    if (!expediente?.id) return
    informeLiquidacionInicializadoRef.current = false

    console.log('[Cierre] Recargando servicios desde Supabase para expediente', expediente.id)

    // Fetch directo a Supabase — nunca usa el prop servicios (puede estar desactualizado)
    let serviciosQuery = await supabase
      .from('servicios_cotizacion')
      .select('*')
      .eq('id_expediente', String(expediente.id).trim())
      .order('orden', { ascending: true })
      .order('id', { ascending: true })

    // Fallback: si orden no existe aún en esta instancia de la BD
    if (serviciosQuery.error) {
      serviciosQuery = await supabase
        .from('servicios_cotizacion')
        .select('*')
        .eq('id_expediente', String(expediente.id).trim())
        .order('id', { ascending: true })
    }

    const { data: serviciosDB, error: errServicios } = serviciosQuery

    const { data: expFresco } = await supabase
      .from('expedientes')
      .select('id, total_pax, pax_pago, gratuidades, precio_venta_cliente, bonificacion_pax')
      .eq('id', expediente.id)
      .single()

    if (errServicios) {
      console.error('[Cierre] Error al recargar servicios:', errServicios.message)
      return
    }

    console.log('[Cierre] Servicios cargados:', serviciosDB?.length ?? 0)

    const serviciosActualizados = Array.isArray(serviciosDB) && serviciosDB.length > 0
      ? serviciosDB
      : []

    // Resolver nombres de proveedor directamente desde la BD para evitar caché obsoleta
    const idsNecesarios = [...new Set(
      serviciosActualizados.map(s => s.proveedor_id_int).filter(Boolean)
    )]
    let proveedoresMap = {}
    if (idsNecesarios.length > 0) {
      const { data: provsDB } = await supabase
        .from('proveedores')
        .select('id, nombre_comercial')
        .in('id', idsNecesarios)
      if (Array.isArray(provsDB)) {
        provsDB.forEach(p => { proveedoresMap[p.id] = p.nombre_comercial })
      }
    }

    // Datos frescos del expediente
    const paxTotalFresco = toNum(expFresco?.total_pax) || toNum(expediente?.total_pax) || toNum(formData?.total_pax) || 0
    const gratuidadesFrescas = toNum(expFresco?.gratuidades) || toNum(expediente?.gratuidades) || toNum(formData?.gratuidades) || 0
    const paxPagoFresco = toNum(expFresco?.pax_pago) || Math.max(0, paxTotalFresco - gratuidadesFrescas) || paxPago
    const precioVentaFresco = toNum(expFresco?.precio_venta_cliente) || toNum(expediente?.precio_venta_cliente) || toNum(formData?.precio_venta_cliente) || 0
    const bonificacionFresco = toNum(expFresco?.bonificacion_pax) || toNum(expediente?.bonificacion_pax) || toNum(formData?.bonificacion_pax) || 0

    const precioViaje = paxPagoFresco * precioVentaFresco
    const suplementosVal = parseFloat(suplementos?.totalSuplementos || 0)
    const descuentosVal = bonificacionFresco * paxPagoFresco

    const savedCostesReales = (informeLiquidacion.costesReales || []).reduce((acc, c) => {
      acc[c.id_servicio] = c.coste_real
      return acc
    }, {})

    const costesRealesIniciales = serviciosActualizados.map((s) => {
      const nombreComercialCache = obtenerProveedorPorId ? obtenerProveedorPorId(s?.proveedor_id_int)?.nombreComercial : null
      const proveedor = nombreComercialCache
        || proveedoresMap[s?.proveedor_id_int]
        || s?.nombre_proveedor_texto
        || s?.nombre_proveedor_manual
        || s?.proveedorNombreTemporal
        || '—'
      const tipo = s?.tipo || s?.tipo_servicio || 'Servicio'
      const nombre = s?.nombre_especifico ? `${tipo} ${s.nombre_especifico}` : (s?.nombreEspecifico ? `${tipo} ${s.nombreEspecifico}` : tipo)
      const costeCotizado = toNum(s?.total_servicio) || calcularTotalFilaUI({ ...DEFAULT_SERVICE_VALUES, ...s })
      const costeReal = savedCostesReales[s?.id] ?? costeCotizado
      return {
        id_servicio: s?.id || generarUUID(),
        concepto: nombre,
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

    // Actualizar paxPorAsociacion con datos frescos si no hay distribución manual guardada
    const guardado = expediente?.cierre_grupo?.pax_por_asociacion
    if (!Array.isArray(guardado) || guardado.length === 0) {
      if (expedienteClientes.length > 0) {
        const paxPorCliente = paxTotalFresco > 0 ? Math.floor(paxTotalFresco / expedienteClientes.length) : null
        setPaxPorAsociacion(expedienteClientes.map(ec => ({
          cliente_id: ec.cliente_id,
          cliente_nombre: ec.cliente_nombre,
          pax: paxPorCliente,
        })))
      } else if (clienteIdPrincipal) {
        const nombrePrincipal = grupo?.nombre || expediente?.cliente_nombre || expediente?.nombre_grupo || '—'
        setPaxPorAsociacion([{
          cliente_id: clienteIdPrincipal,
          cliente_nombre: nombrePrincipal,
          pax: paxTotalFresco || null,
        }])
      }
    }

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

  const generarInformeLiquidacionPDF = () => {
    if (!expediente?.cierre_grupo || typeof expediente?.cierre_grupo !== 'object') return
    const payload = payloadDesdeCierreGrupo(expediente)
    if (!payload) return
    const doc = crearJsPdfInformeCierreFinanciero(payload)
    const safeG = payload.grupo.replace(/\s+/g, '_')
    const safeV = payload.viaje.replace(/\s+/g, '_')
    doc.save(`Informe_Cierre_${safeG}_${safeV}.pdf`)
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

    const porCategoria = { Bus: [], Hotel: [], Restaurante: [], Guía: [], Otros: [] }
    costesReales.forEach(c => {
      const cat = categorizarPagoInformeCierre(c.concepto)
      porCategoria[cat].push(c)
    })

    const filasPagos = []
    ;['Bus', 'Hotel', 'Restaurante', 'Guía', 'Otros'].forEach(cat => {
      porCategoria[cat].forEach(c => {
        filasPagos.push(`<tr><td>${cat}</td><td>${(c.concepto || '—').replace(/</g, '&lt;')}</td><td>${proveedorInformeTexto(c.proveedor).replace(/</g, '&lt;')}</td><td class="num">${Number(c.coste_real || 0).toFixed(2)} €</td></tr>`)
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
      <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 8px 0;">Cuota IVA (21% s/ base imponible)</td><td style="text-align:right; font-weight: 600; color: #b45309;">− ${ivaPagado.toFixed(2)} €</td></tr>
      <tr style="background: #f0fdf4;"><td style="padding: 12px 0; font-weight: 700;">BENEFICIO NETO REAL</td><td style="text-align:right; font-size: 1.25rem; font-weight: 700; color: #059669;">${beneficioLimpio.toFixed(2)} €</td></tr>
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
      ...costesReales.map(c => `"${categorizarPagoInformeCierre(c.concepto)}","${(c.concepto || '').replace(/"/g, '""')}","${(c.proveedor || '').replace(/"/g, '""')}",${Number(c.coste_real || 0).toFixed(2)}`),
      '',
      'Gastos Imprevistos',
      'Concepto,Importe',
      ...gastosImprevistos.map(g => `"${(g.concepto || '').replace(/"/g, '""')}",${Number(g.importe || 0).toFixed(2)}`),
      `TOTAL GASTOS,${gastosTotales.toFixed(2)}`,
      '',
      'Resumen de resultados',
      `Beneficio Bruto,${beneficioBruto.toFixed(2)}`,
      `Cuota IVA (21% s/ base imponible),-${ivaPagado.toFixed(2)}`,
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
  // Beneficio bruto = ingresos − gastos (IVA 21% incluido) | Neto = bruto/1,21 | Cuota IVA = bruto − neto (ver desgloseIvaBeneficioBruto)
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
    const { beneficioBruto, ivaPagado, beneficioLimpio } = desgloseIvaBeneficioBruto(ingresosTotales - gastosTotales)
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
    if (!window.confirm('¿Confirmar cierre? Se consolidarán los costes para el análisis financiero.')) return
    setGuardandoCierre(true)
    try {
      const { data: expData } = await supabase.from('expedientes').select('id, numero_expediente, versiones_json').eq('id', expediente.id).single()
      const expConVersiones = expData || expediente
      const validacion = await validarProveedoresServicios(expediente.id, expConVersiones?.versiones_json)
      if (!validacion.ok) {
        const confirmarSinProveedor = window.confirm(
          validacion.warning || 'Falta proveedor por asignar. ¿Deseas consolidar de todas formas?'
        )
        if (!confirmarSinProveedor) {
          setGuardandoCierre(false)
          return
        }
      }
      const { ingresosTotales, gastosTotales, beneficioBruto, ivaPagado, beneficioLimpio } = calcularCierreFinanciero()
      const n = (v) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : 0)
      const ingresosCalculados = n(ingresosTotales)
      const gastosCalculados = n(gastosTotales)
      const ivaCalculado = n(ivaPagado)
      const beneficioCalculado = n(beneficioLimpio)

      const costesRealesArr = (informeLiquidacion.costesReales || []).map((c) => ({
        id_servicio: c.id_servicio,
        concepto: c.concepto || '',
        proveedor: c.proveedor || '',
        coste_cotizado: n(c.coste_cotizado),
        coste_real: n(c.coste_real),
      }))
      const gastosImprevistosArr = (informeLiquidacion.gastosImprevistos || []).map((g) => ({
        id: g.id,
        concepto: g.concepto || '',
        importe: n(g.importe),
      }))
      const totales = construirBloqueTotalesCierre({
        ingresos_totales: ingresosCalculados,
        gastos_totales_formulario: gastosCalculados,
        beneficio_bruto: beneficioBruto,
        iva_pagado: ivaCalculado,
        beneficio_limpio: beneficioCalculado,
        costesReales: costesRealesArr,
        gastosImprevistos: gastosImprevistosArr,
      })

      const cierreGrupoJson = {
        ingresos_totales: ingresosCalculados,
        gastos_totales: totales.gastos_totales,
        beneficio_bruto: totales.beneficio_bruto,
        iva_pagado: totales.iva_pagado,
        beneficio_limpio: totales.beneficio_limpio,
        totales,
        fecha: new Date().toISOString(),
        ingresos: { precioViaje: n(informeLiquidacion?.ingresos?.precioViaje), suplementos: n(informeLiquidacion?.ingresos?.suplementos), descuentos: n(informeLiquidacion?.ingresos?.descuentos) },
        costesReales: costesRealesArr,
        gastosImprevistos: gastosImprevistosArr,
        pax_por_asociacion: paxPorAsociacion.filter((p) => p.cliente_id).map((p) => ({ cliente_id: p.cliente_id, cliente_nombre: p.cliente_nombre || '', pax: p.pax })),
      }

      const financialPayload = {
        total_ingresos: totales.ingresos_totales,
        total_gastos_reales: totales.gastos_totales,
        beneficio_neto_real: totales.beneficio_limpio,
        cuota_iva: totales.iva_pagado,
        estado: 'Cerrado',
        cierre_grupo: cierreGrupoJson,
      }

      const { error } = await supabase
        .from('expedientes')
        .update(financialPayload)
        .eq('id', expediente.id)

      if (error) {
        alert('Error al guardar el cierre: ' + (error?.message || 'Revisa columnas en expedientes.'))
        setGuardandoCierre(false)
        return
      }

      const cons = await consolidarGastosExpediente(expediente.id, expConVersiones, true)
      if (!cons.ok) {
        alert(cons.error || 'Error al consolidar gastos. El cierre se guardó pero revisa los proveedores.')
      }

      const paxTotal = Math.max(1, n(formData?.total_pax) || n(expediente?.total_pax))
      const gratuidades = n(formData?.gratuidades) || n(expediente?.gratuidades)
      const bonificacionPax = n(formData?.bonificacion_pax) || n(expediente?.bonificacion_pax)
      const precioVentaCliente = n(formData?.precio_venta_cliente) || n(expediente?.precio_venta_cliente)
      const paxPago = Math.max(1, paxTotal - gratuidades)
      if (onUpdate) onUpdate({ ...expediente, cierre_grupo: cierreGrupoJson, total_ingresos: totales.ingresos_totales, total_gastos_reales: totales.gastos_totales, cuota_iva: totales.iva_pagado, beneficio_neto_real: totales.beneficio_limpio, estado: 'Cerrado', total_pax: paxTotal, gratuidades, bonificacion_pax: bonificacionPax, precio_venta_cliente: precioVentaCliente, pax_pago: paxPago })
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
      const footerY = pageHeight - 55
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 100, 100)
      
      // Línea separadora antes del pie
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.3)
      doc.line(10, footerY - 5, pageWidth - 10, footerY - 5)
      
      // Datos fiscales
      doc.text(datosEmisor.nombre, 20, footerY)
      doc.text(`CIF: ${datosEmisor.cif}`, 20, footerY + 8)
      doc.text(`Licencia: ${datosEmisor.licencia}`, 20, footerY + 16)
      doc.text(datosEmisor.direccion, 20, footerY + 24)
      doc.text(datosEmisor.banco1, 20, footerY + 32)
      doc.text(datosEmisor.banco2, 20, footerY + 38)
      
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
        .select(PAGOS_PROVEEDORES_COLUMNAS)
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

  // Firma del presupuesto activo: al cambiar servicios (o al cargar variantes), la pestaña Pagos se rehidrata.
  const firmaServiciosPresupuestoPagos = useMemo(() => {
    try {
      if (!Array.isArray(versiones) || versiones.length === 0) return `db:${expediente?.id || ''}`
      const list = versiones[versionActiva]?.servicios || []
      return `v${versionActiva}:` + JSON.stringify(
        list.map((s) => ({
          id: s?.id,
          tipo: s?.tipo_servicio || s?.tipo,
          nom: s?.nombre_especifico || s?.nombreEspecifico,
          pid: s?.proveedor_id_int ?? s?.proveedorId,
          tm: s?.total_servicio_manual,
          ts: s?.total_servicio,
          c: s?.coste_unitario,
        }))
      )
    } catch {
      return ''
    }
  }, [versiones, versionActiva, expediente?.id])

  // Carga servicios para Pagos: misma fuente que el presupuesto (versiones_json) si existe; si no, servicios_cotizacion.
  // Se sincroniza al montar la pestaña y cuando cambia la firma del presupuesto (sin botón de refresco).
  useEffect(() => {
    if (tab !== 'pagosProveedores' || !expediente?.id) return

    const estadoActual = String(expediente?.estado || '').trim().toLowerCase()
    const esPeticion   = estadoActual === 'petición' || estadoActual === 'peticion'

    // Expedientes en estado Petición no tienen servicios confirmados aún
    if (esPeticion) {
      setServiciosCot([])
      setCargandoCot(false)
      return
    }

    const expId = String(expediente.id).trim()
    setCargandoCot(true)
    setErrorCot(null)

    ;(async () => {
      try {
        let serviciosFuente = []

        if (Array.isArray(versiones) && versiones.length > 0 && versionActiva >= 0 && versionActiva < versiones.length) {
          const rawList = versiones[versionActiva]?.servicios || []
          serviciosFuente = rawList
            .map((row) => normalizarServicioFuentePresupuestoParaPagos(row))
            .filter(Boolean)
        } else {
          let res = await supabase
            .from('servicios_cotizacion')
            .select('*')
            .eq('id_expediente', expId)
            .order('orden', { ascending: true })
            .order('created_at', { ascending: true, nullsFirst: false })
            .order('id', { ascending: true })

          if (res.error && (res.error.code === 'PGRST204' || String(res.error.message || '').includes('created_at'))) {
            res = await supabase
              .from('servicios_cotizacion')
              .select('*')
              .eq('id_expediente', expId)
              .order('orden', { ascending: true })
              .order('id', { ascending: true })
          }

          console.log('[Pagos] id_expediente:', expId, '| estado:', estadoActual, '→', res.data?.length ?? 0, 'filas', res.error || '')
          if (res.error) throw res.error

          serviciosFuente = (res.data || [])
            .map((row) => normalizarServicioFuentePresupuestoParaPagos(row))
            .filter(Boolean)
        }

        const serviciosFiltrados = serviciosFuente.filter(s => {
          const t = (s.tipo_servicio || '').toLowerCase().trim()
          return t !== 'guía' && t !== 'guia'
        })

        const idsNumericos = [...new Set(
          serviciosFiltrados
            .map(s => s.proveedor_id_int)
            .filter(id => id != null && id !== '' && !isNaN(Number(id)))
            .map(id => Number(id))
        )]

        let proveedoresMap = {}
        if (idsNumericos.length > 0) {
          const { data: provsDB } = await supabase
            .from('proveedores')
            .select('id, nombre_comercial')
            .in('id', idsNumericos)
          if (Array.isArray(provsDB)) {
            provsDB.forEach(p => { proveedoresMap[p.id] = p.nombre_comercial })
          }
        }

        const enriquecidos = serviciosFiltrados.map(s => {
          const provId = s.proveedor_id_int != null ? Number(s.proveedor_id_int) : null
          const _proveedorNombre =
            (provId && proveedoresMap[provId])
            || s.nombre_proveedor_texto
            || s.proveedorNombreTemporal
            || s.nombre_proveedor_manual
            || null
          return { ...s, _proveedorNombre }
        })

        const filtrados = filtrarServiciosParaTabPagosProveedores(enriquecidos)
        const unificados = unificarServiciosPagosPorNombreYProveedor(filtrados)
        setServiciosCot(unificados)
      } catch (err) {
        console.error('[Pagos] Error cargando servicios:', err)
        setErrorCot('No se pudieron cargar los servicios de la cotización.')
      } finally {
        setCargandoCot(false)
      }
    })()
  }, [tab, expediente?.id, expediente?.estado, firmaServiciosPresupuestoPagos])

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
    
    const datosEmisorHistorial = DATOS_EMISOR
    
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
      doc.text(datosEmisorHistorial.nombre, 20, yPos)
      yPos += 6
      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      doc.text(`CIF: ${datosEmisorHistorial.cif}`, 20, yPos)
      yPos += 6
      doc.text(`Licencia: ${datosEmisorHistorial.licencia}`, 20, yPos)
      yPos += 6
      doc.text(datosEmisorHistorial.direccion, 20, yPos)
      yPos += 6
      if (datosEmisorHistorial.telefono) {
        doc.text(`Tel: ${datosEmisorHistorial.telefono} | Email: ${datosEmisorHistorial.email}`, 20, yPos)
      } else {
        doc.text(`Email: ${datosEmisorHistorial.email}`, 20, yPos)
      }
      yPos += 6
      doc.text(datosEmisorHistorial.banco1, 20, yPos)
      yPos += 6
      doc.text(datosEmisorHistorial.banco2, 20, yPos)
      
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
      
      // Tabla de conceptos: Descripción | Unidades | P. Unit | Precio Total (IVA Inc.)
      yPos += 10
      doc.setFontSize(10)
      doc.setFont(undefined, 'bold')
      doc.text('Descripción', 20, yPos)
      doc.text('Unidades', 90, yPos)
      doc.text('P. Unit', 115, yPos)
      doc.text('Precio Total (IVA Inc.)', pageWidth - 20, yPos, { align: 'right' })
      yPos += 6
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.2)
      doc.line(20, yPos, pageWidth - 20, yPos)
      yPos += 6

      const fmtEuro = (n) => (parseFloat(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€'
      const lineas = datos.lineasFactura || []
      if (lineas.length > 0) {
        doc.setFontSize(9)
        doc.setFont(undefined, 'normal')
        lineas.forEach((l) => {
          const unid = parseFloat(l.unid) || 0
          const pUnit = parseFloat(l.pUnit) || 0
          const tot = parseFloat(l.total) || 0
          doc.text((l.concepto || '').substring(0, 50), 20, yPos)
          doc.text(String(unid), 90, yPos)
          doc.text(fmtEuro(pUnit), 115, yPos)
          doc.text(fmtEuro(tot), pageWidth - 20, yPos, { align: 'right' })
          yPos += 6
        })
      } else {
        // Fallback si no hay lineasFactura: reconstruir desde calc
        const paxP = parseFloat(calc.paxPago || 0) || 0
        const pNeto = parseFloat(calc.precioNetoPax || 0) || 0
        const totServ = parseFloat(calc.totalServiciosConIVA || 0) || 0
        const destinoExp = datos.expediente?.destino || factura?.destino || ''
        doc.setFontSize(9)
        doc.setFont(undefined, 'normal')
        doc.text(`Viaje a ${destinoExp || 'destino'} (Pasajeros)`.substring(0, 50), 20, yPos)
        doc.text(String(paxP), 90, yPos)
        doc.text(fmtEuro(pNeto), 115, yPos)
        doc.text(fmtEuro(totServ), pageWidth - 20, yPos, { align: 'right' })
        yPos += 6
        const totSupHab = parseFloat(datos.totalSupHabitacion || 0) || 0
        const totSupSeg = parseFloat(datos.totalSupSeguro || 0) || 0
        const totSup = parseFloat(calc.totalSuplementos || 0) || 0
        if (totSupHab > 0) {
          const supPax = Math.max(1, parseFloat(datos.sup_individual_pax || 1) || 1)
          doc.text('Suplemento Habitación Individual', 20, yPos)
          doc.text(String(supPax), 90, yPos)
          doc.text(fmtEuro(totSupHab / supPax), 115, yPos)
          doc.text(fmtEuro(totSupHab), pageWidth - 20, yPos, { align: 'right' })
          yPos += 6
        }
        if (totSupSeg > 0) {
          const paxSeg = Math.max(1, parseFloat(datos.sup_seguro_pax || 1) || 1)
          const pUnitSeg = parseFloat(datos.sup_seguro_precio_total || totSupSeg / paxSeg) || 0
          doc.text('Seguro de cancelación', 20, yPos)
          doc.text(String(paxSeg), 90, yPos)
          doc.text(fmtEuro(pUnitSeg), 115, yPos)
          doc.text(fmtEuro(totSupSeg), pageWidth - 20, yPos, { align: 'right' })
          yPos += 6
        } else if (totSup > 0 && totSupHab === 0) {
          const supPax = Math.max(1, parseFloat(datos.sup_individual_pax || 1) || 1)
          doc.text('Suplementos', 20, yPos)
          doc.text(String(supPax), 90, yPos)
          doc.text(fmtEuro(totSup / supPax), 115, yPos)
          doc.text(fmtEuro(totSup), pageWidth - 20, yPos, { align: 'right' })
          yPos += 6
        }
      }

      // Nota régimen especial
      yPos += 6
      doc.setFontSize(8)
      doc.setTextColor(100, 100, 100)
      doc.setFont(undefined, 'italic')
      doc.text('Régimen Especial de Agencias de Viajes - IVA incluido', 20, yPos)
      yPos += 8
      
      // Totales
      yPos += 4
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.3)
      doc.line(20, yPos, pageWidth - 20, yPos)
      yPos += 8
      
      doc.setFontSize(12)
      doc.setTextColor(0, 0, 0)
      doc.setFont(undefined, 'bold')
      doc.text('TOTAL FACTURA (IVA INCLUIDO):', pageWidth - 60, yPos, { align: 'right' })
      doc.setTextColor(34, 197, 94) // Verde
      doc.text(fmtEuro(total), pageWidth - 20, yPos, { align: 'right' })
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
      const footerY = pageHeight - 50
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.3)
      doc.line(10, footerY - 5, pageWidth - 10, footerY - 5)
      
      doc.setFontSize(8)
      doc.setTextColor(100, 100, 100)
      doc.text(datosEmisorHistorial.nombre, 20, footerY)
      doc.text(`CIF: ${datosEmisorHistorial.cif} | Licencia: ${datosEmisorHistorial.licencia}`, 20, footerY + 6)
      doc.text(datosEmisorHistorial.direccion, 20, footerY + 12)
      doc.text(datosEmisorHistorial.banco1, 20, footerY + 18)
      doc.text(datosEmisorHistorial.banco2, 20, footerY + 24)
      
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
        metodo_pago: normalizarMetodoPago(formCobro.metodo_pago),
        cuenta_destino: String(formCobro.cuenta_destino || 'Caixabank'),
        concepto: String(formCobro.concepto || '').trim(),
        fecha: new Date().toISOString(),
        empresa_id: empresaId
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

  // ⚠️ BLINDAJE NIVEL 2: Cálculo seguro de pasajeros de pago (usa cabecera de variante activa)
  const paxPago = Math.max(0, toNum(expediente?.pax_pago) || Math.max(0, toNum(formDataParaVariante?.total_pax) - toNum(formDataParaVariante?.gratuidades)))
  const totalPax = Math.max(0, toNum(expediente?.total_pax) || toNum(formDataParaVariante?.total_pax))

  // Servicios para cálculos: en multicotización usar variante activa; si no, servicios raíz
  const serviciosParaCalculo = versiones.length > 0 && versionActiva >= 0 && versionActiva < versiones.length
    ? (versiones[versionActiva]?.servicios ?? servicios)
    : servicios

  // Firma primitiva de servicios: evita re-renders cuando el array cambia de referencia pero el contenido es igual
  const serviciosSignature = useMemo(() =>
    serviciosParaCalculo.map(s => `${s.id}:${toNum(s.coste_unitario)}:${toNum(s.noches)}:${toNum(s.cantidad)}:${s.tipo_calculo}:${toNum(s.total_servicio_manual)}:${s.tipo || ''}`).join('|'),
    [serviciosParaCalculo]
  )

  // Resultados de Cotización: usa cabecera de variante activa (pasajeros × precio por variante)
  const resultados = useMemo(() => {
    const nochesExpediente = Math.max(1, toNum(expediente?.noches) || toNum(formData?.noches))
    return calcularFinanzasExpediente({
      servicios: serviciosParaCalculo,
      formData: formDataParaVariante,
      paxPago,
      totalPax,
      nochesExpediente,
    })
  }, [serviciosSignature, formDataParaVariante, paxPago, totalPax, expediente?.noches, expediente?.pax_pago, expediente?.total_pax])

  // NOTA: Para "Total a dividir" (porGrupo), coste_unitario y total_servicio_manual almacenan el TOTAL.

  // Campos pendientes del expediente (duración, destino, servicios sin proveedor) — avisos discretos, nunca bloquean
  const expedientePendiente = useMemo(
    () => detectarCamposPendientes(expediente, serviciosParaCalculo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expediente?.duracion_viaje, expediente?.destino, expediente?.tipo_colectivo, expediente?.responsable, serviciosSignature]
  )

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
    if (isSubmittingPagoProveedor) return
    if (!expediente?.id || !formPago.servicio_id || !formPago.fecha_pago || !formPago.importe_pagado) {
      alert('Completa Servicio, Fecha e Importe.')
      return
    }
    const importe = parseFloat(String(formPago.importe_pagado).replace(',', '.'))
    if (isNaN(importe) || importe <= 0) {
      alert('El importe debe ser un número positivo.')
      return
    }
    const firmaPago = {
      expediente_id: expediente.id,
      servicio_id: String(formPago.servicio_id),
      fecha_pago: formPago.fecha_pago,
      importe: Number(importe.toFixed(2)),
    }
    if (esSubmitDuplicadoReciente('registrarPagoProveedor', firmaPago)) return
    setIsSubmittingPagoProveedor(true)
    try {
      const servicioRow = serviciosCot.find((sc) => String(sc.id) === String(formPago.servicio_id))
      const concepto = servicioRow ? tituloServicioParaConcepto(servicioRow) : 'Servicio'
      const { proveedorId, proveedorNombre } = datosProveedorDesdeServicioCot(servicioRow)
      const { error } = await supabase
        .from('pagos_proveedores')
        .insert([
          filaPagosProveedores({
            expediente_id: expediente.id,
            proveedor_id: proveedorId,
            proveedor_nombre: proveedorNombre,
            servicio_id: formPago.servicio_id,
            fecha_pago: formPago.fecha_pago,
            importe_pagado: importe,
            numero_factura: null,
            url_pdf: null,
            concepto,
          }),
        ])
      if (error) {
        alert(`Error al registrar pago: ${error.message}`)
        return
      }
      setFormPago({ servicio_id: '', fecha_pago: '', importe_pagado: '' })
      await cargarPagosProveedores()
      if (typeof onRefresh === 'function') onRefresh()
    } catch (e) {
      alert('Error inesperado al registrar el pago.')
    } finally {
      setIsSubmittingPagoProveedor(false)
    }
  }

  // ── Facturación documental ─────────────────────────────────────────────────

  const subirPdfFacturaCot = async (file) => {
    if (!file || !expediente?.id) return null
    const nombreUnico = 'fac-' + Date.now() + '.pdf'
    const { error } = await supabase.storage.from('facturas_proveedores').upload(nombreUnico, file)
    if (error) {
      const hint =
        /rls|row-level security|policy/i.test(String(error.message))
          ? '\n\nSi el error menciona RLS, ejecuta en Supabase el script migrations/storage-rls-facturas-proveedores.sql'
          : ''
      throw new Error(String(error.message) + hint)
    }
    // Persistir en pagos_proveedores.url_pdf la ruta dentro del bucket (no metadatos ni URL completa obligatoria)
    return nombreUnico
  }

  const guardarFacturaCot = async (servicio) => {
    if (subiendoPdfCot) return
    if (!fInline.fecha_pago || !fInline.importe_pagado) { alert('Completa Fecha e Importe.'); return }
    const importe = parseFloat(String(fInline.importe_pagado).replace(',', '.'))
    if (isNaN(importe) || importe <= 0) { alert('Importe inválido.'); return }
    const firmaFactura = {
      expediente_id: expediente?.id || null,
      servicio_id: String(servicio?.id ?? ''),
      fecha_pago: fInline.fecha_pago,
      importe: Number(importe.toFixed(2)),
      numero_factura: String(fInline.numero_factura || '').trim(),
      pdf_nombre: pdfInline?.name || null,
    }
    if (esSubmitDuplicadoReciente('guardarFacturaCot', firmaFactura)) return
    setSubiendoPdfCot(true)
    try {
      const existente = pagosProveedores.find((p) => pagoProveedorCoincideFilaServiciosCot(p, servicio))
      const urlAnterior = existente?.url_pdf?.trim() || ''

      let urlPdf = null
      if (pdfInline) {
        urlPdf = await subirPdfFacturaCot(pdfInline)
        if (urlAnterior && urlPdf && urlAnterior !== urlPdf) {
          await eliminarObjetoStorageFacturaProveedor(urlAnterior)
        }
      }

      let filaGuardada = null
      let dbError = null
      const conceptoTitulo = tituloServicioParaConcepto(servicio)
      const { proveedorId, proveedorNombre } = datosProveedorDesdeServicioCot(servicio)
      const urlPdfFinal = urlPdf != null && urlPdf !== '' ? urlPdf : (existente?.url_pdf ?? null)
      const servicioIdPersistencia =
        existente?.servicio_id != null && existente.servicio_id !== ''
          ? existente.servicio_id
          : servicio.id

      if (existente?.id) {
        const fila = filaPagosProveedores({
          expediente_id: expediente.id,
          proveedor_id: proveedorId,
          proveedor_nombre: proveedorNombre,
          servicio_id: servicioIdPersistencia,
          fecha_pago: fInline.fecha_pago,
          importe_pagado: importe,
          numero_factura: fInline.numero_factura || existente.numero_factura || null,
          url_pdf: urlPdfFinal,
          concepto: conceptoTitulo,
        })
        const res = await supabase
          .from('pagos_proveedores')
          .update(fila)
          .eq('id', existente.id)
          .select(PAGOS_PROVEEDORES_COLUMNAS)
          .single()
        dbError = res.error
        filaGuardada = res.data
      } else {
        const res = await supabase
          .from('pagos_proveedores')
          .insert([
            filaPagosProveedores({
              expediente_id: expediente.id,
              proveedor_id: proveedorId,
              proveedor_nombre: proveedorNombre,
              servicio_id: servicioIdPersistencia,
              fecha_pago: fInline.fecha_pago,
              importe_pagado: importe,
              numero_factura: fInline.numero_factura || null,
              url_pdf: urlPdfFinal,
              concepto: conceptoTitulo,
            }),
          ])
          .select(PAGOS_PROVEEDORES_COLUMNAS)
          .single()
        dbError = res.error
        filaGuardada = res.data
      }

      if (dbError) { alert('Error al guardar: ' + dbError.message); return }

      setMensajeExitoFacturaProveedor('Factura registrada con éxito')
      window.setTimeout(() => setMensajeExitoFacturaProveedor(null), 4500)

      // Cerrar formulario y refrescar lista tras guardado correcto
      setInlineId(null)
      setFInline({ numero_factura: '', fecha_pago: new Date().toISOString().split('T')[0], importe_pagado: '' })
      setPdfInline(null)
      setSubiendoPdfCot(false)

      await cargarPagosProveedores()
      if (typeof onRefresh === 'function') onRefresh()
    } catch (e) { alert(e.message || 'Error inesperado.')
    } finally { setSubiendoPdfCot(false) }
  }

  const abrirFormularioCambiarPdfServicio = (servicio, pagoRegistrado) => {
    setInlineId(servicio.id)
    setFInline({
      numero_factura: pagoRegistrado?.numero_factura || '',
      fecha_pago: pagoRegistrado?.fecha_pago || new Date().toISOString().split('T')[0],
      importe_pagado: pagoRegistrado?.importe_pagado ?? servicio.total_servicio_manual ?? servicio.total_servicio ?? servicio.coste_unitario ?? '',
    })
    setPdfInline(null)
  }

  const quitarPdfFacturaServicioCot = async (pagoRegistrado) => {
    if (!pagoRegistrado?.id) return
    if (!window.confirm('¿Quitar el PDF de esta factura? Se eliminará el archivo del almacén y podrás adjuntar otro.')) return
    try {
      if (pagoRegistrado.url_pdf) {
        const res = await eliminarObjetoStorageFacturaProveedor(pagoRegistrado.url_pdf)
        if (!res.ok) console.warn('[facturas_proveedores] remove', res.error)
      }
      const { error } = await supabase
        .from('pagos_proveedores')
        .update({ url_pdf: null })
        .eq('id', pagoRegistrado.id)
      if (error) {
        alert('No se pudo actualizar el registro: ' + error.message)
        return
      }
      await cargarPagosProveedores()
      if (typeof onRefresh === 'function') onRefresh()
    } catch (e) {
      alert(e?.message || 'No se pudo quitar el PDF.')
    }
  }

  const guardarGastoExtra = async () => {
    if (subiendoPdfCot) return
    if (!fExtra.concepto || !fExtra.importe_pagado || !fExtra.fecha_pago) { alert('Completa Concepto, Fecha e Importe.'); return }
    const importe = parseFloat(String(fExtra.importe_pagado).replace(',', '.'))
    if (isNaN(importe) || importe <= 0) { alert('Importe inválido.'); return }
    const firmaGastoExtra = {
      expediente_id: expediente?.id || null,
      concepto: String(fExtra.concepto || '').trim(),
      proveedor_nombre: String(fExtra.proveedor_nombre || '').trim(),
      fecha_pago: fExtra.fecha_pago,
      importe: Number(importe.toFixed(2)),
      numero_factura: String(fExtra.numero_factura || '').trim(),
      pdf_nombre: pdfExtra?.name || null,
    }
    if (esSubmitDuplicadoReciente('guardarGastoExtra', firmaGastoExtra)) return
    setSubiendoPdfCot(true)
    try {
      const urlPdf = pdfExtra ? await subirPdfFacturaCot(pdfExtra) : null
      const proveedorNombreExtra = String(fExtra.proveedor_nombre || '').trim() || null
      const { error } = await supabase.from('pagos_proveedores').insert([
        filaPagosProveedores({
          expediente_id: expediente.id,
          proveedor_id: null,
          proveedor_nombre: proveedorNombreExtra,
          servicio_id: null,
          fecha_pago: fExtra.fecha_pago,
          importe_pagado: importe,
          numero_factura: fExtra.numero_factura || null,
          url_pdf: urlPdf,
          concepto: String(fExtra.concepto || '').trim(),
        }),
      ])
      if (error) { alert('Error: ' + error.message); return }
      await cargarPagosProveedores()
      setMensajeExitoFacturaProveedor('Factura guardada con éxito')
      window.setTimeout(() => setMensajeExitoFacturaProveedor(null), 4500)
      setShowGastoExtra(false)
      setFExtra({ numero_factura: '', fecha_pago: new Date().toISOString().split('T')[0], importe_pagado: '', proveedor_nombre: '', concepto: '' })
      setPdfExtra(null)
      if (typeof onRefresh === 'function') onRefresh()
    } catch (e) { alert(e.message || 'Error inesperado.')
    } finally { setSubiendoPdfCot(false) }
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

  const calcularDuracionSeguroDesdeFechas = (fechaInicioRaw, fechaFinRaw) => {
    try {
      const inicio = parsearFechaADate(fechaInicioRaw)
      const fin = parsearFechaADate(fechaFinRaw)
      if (!inicio || !fin || isNaN(inicio.getTime()) || isNaN(fin.getTime()) || fin.getTime() < inicio.getTime()) {
        return { dias: null, noches: null, texto: null }
      }
      const diffMs = fin.getTime() - inicio.getTime()
      const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1
      const noches = Math.max(0, dias - 1)
      return {
        dias: Number(dias),
        noches: Number(noches),
        texto: `${dias} día${dias !== 1 ? 's' : ''} / ${noches} noche${noches !== 1 ? 's' : ''}`,
      }
    } catch (_) {
      return { dias: null, noches: null, texto: null }
    }
  }

  // ============ CÁLCULOS DE SUPLEMENTOS (INDIVIDUAL Y SEGURO) ============
  const suplementos = useMemo(() => {
    const fd = formDataParaVariante
    if (!fd) {
      return {
        totalSuplementos: 0,
        totalSupHabitacion: 0,
        totalSupSeguro: 0
      }
    }
    const noches = calcularNochesExpediente()

    const paxIndividual = toNum(fd?.sup_individual_pax)
    const precioIndividualDia = toNum(fd?.sup_individual_precio_dia)
    const paxSeguro = toNum(fd?.sup_seguro_pax)
    const precioSeguroTotal = toNum(fd?.sup_seguro_precio_total)

    const totalSupHabitacion = paxIndividual * precioIndividualDia * noches
    const totalSupSeguro = paxSeguro * precioSeguroTotal
    const totalSuplementos = totalSupHabitacion + totalSupSeguro

    return {
      noches,
      totalSupHabitacion: totalSupHabitacion.toFixed(2),
      totalSupSeguro: totalSupSeguro.toFixed(2),
      totalSuplementos: totalSuplementos.toFixed(2),
    }
  }, [formDataParaVariante?.sup_individual_pax, formDataParaVariante?.sup_individual_precio_dia, formDataParaVariante?.sup_seguro_pax, formDataParaVariante?.sup_seguro_precio_total, expediente?.noches, expediente?.fecha_inicio, expediente?.fechaInicio, expediente?.fecha_final, expediente?.fecha_fin, expediente?.fechaFin])

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
  const datosEmisor = DATOS_EMISOR

  // ============ CÁLCULO DE BASE IMPONIBLE PARA FACTURA ============
  // NOTA: El Precio Venta al Cliente YA INCLUYE IVA (Régimen Especial de Agencias de Viajes)
  // Sincronizado con Desglose: usa formDataParaVariante (misma fuente que suplementos y paxPago)
  const calcularBaseFactura = useMemo(() => {
    const fd = formDataParaVariante || formData
    if (!fd) {
      return {
        precioVentaPax: 0,
        precioNetoPax: 0,
        totalServiciosConIVA: 0,
        baseImponible: 0,
        iva: 0,
        totalFactura: 0,
        paxPago: 0
      }
    }
    // Precio Venta al Cliente (€/pax) - YA INCLUYE IVA
    const precioVentaPax = parseFloat(fd?.precio_venta_cliente || 0) || 0
    const bonificacion = parseFloat(fd?.bonificacion_pax || 0) || 0
    const precioNetoPax = precioVentaPax - bonificacion

    // Multiplicar por Clientes de Pago (paxPago ya usa formDataParaVariante)
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
  }, [formDataParaVariante?.precio_venta_cliente, formDataParaVariante?.bonificacion_pax, formData, paxPago, suplementos.totalSuplementos])

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
      if (datosEmisor.telefono) {
        doc.text(`Tel: ${datosEmisor.telefono} | Email: ${datosEmisor.email}`, 20, yPos)
      } else {
        doc.text(`Email: ${datosEmisor.email}`, 20, yPos)
      }
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
      doc.text('Unidades', 90, yPos)
      doc.text('P. Unit', 115, yPos)
      doc.text('Precio Total (IVA Inc.)', pageWidth - 20, yPos, { align: 'right' })
      yPos += 6
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.2)
      doc.line(20, yPos, pageWidth - 20, yPos)
      yPos += 6

      const nombreGrupo = expediente?.nombre_grupo || grupo?.nombre || 'Sin nombre'
      const destino = expediente?.destino || 'Sin destino'

      // Formato numérico español (10.540,00)
      const fmtEuro = (n) => (parseFloat(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€'

      // Línea 1: Viaje a {destino} (Pasajeros) | Unid: 31 | P. Unit: 340,00€ | Total: 10.540,00€
      const conceptoLinea1 = destino ? `Viaje a ${destino} (Pasajeros)` : (datosFactura?.concepto || 'Viaje (Pasajeros)')
      const paxPagoFactura = parseFloat(calcularBaseFactura.paxPago || 0) || 0
      const precioNetoPaxNum = parseFloat(calcularBaseFactura.precioNetoPax || 0) || 0
      const totalConceptoPrincipal = paxPagoFactura * precioNetoPaxNum

      doc.setFontSize(9)
      doc.setFont(undefined, 'normal')
      doc.text(conceptoLinea1.substring(0, 50), 20, yPos)
      doc.text(String(paxPagoFactura), 90, yPos)
      doc.text(fmtEuro(precioNetoPaxNum), 115, yPos)
      doc.text(fmtEuro(totalConceptoPrincipal), pageWidth - 20, yPos, { align: 'right' })
      yPos += 6

      // Línea 2: Suplemento Habitación Individual (sincronizado con Desglose)
      const totalSupHabitacionNum = parseFloat(suplementos.totalSupHabitacion || 0) || 0
      if (totalSupHabitacionNum > 0) {
        const paxIndividualNum = Math.max(1, parseFloat(formDataParaVariante?.sup_individual_pax || formData?.sup_individual_pax || 0) || 0)
        const cantidadHabitacion = paxIndividualNum
        const precioUnitHabitacion = totalSupHabitacionNum / paxIndividualNum
        const totalConceptoHabitacion = cantidadHabitacion * precioUnitHabitacion

        doc.text('Suplemento Habitación Individual', 20, yPos)
        doc.text(String(cantidadHabitacion), 90, yPos)
        doc.text(fmtEuro(precioUnitHabitacion), 115, yPos)
        doc.text(fmtEuro(totalConceptoHabitacion), pageWidth - 20, yPos, { align: 'right' })
        yPos += 6
      }

      const totalSupSeguroNum = parseFloat(suplementos.totalSupSeguro || 0) || 0
      if (totalSupSeguroNum > 0) {
        const paxSeguroNum = parseFloat(formDataParaVariante?.sup_seguro_pax || formData?.sup_seguro_pax || 0) || 0
        const precioSeguroTotalNum = parseFloat(formDataParaVariante?.sup_seguro_precio_total || formData?.sup_seguro_precio_total || 0) || 0

        const cantidadSeguro = Math.max(0, paxSeguroNum)
        const precioUnitSeguro = Math.max(0, precioSeguroTotalNum)
        const totalConceptoSeguro = cantidadSeguro * precioUnitSeguro

        doc.text('Seguro de cancelación', 20, yPos)
        doc.text(String(cantidadSeguro), 90, yPos)
        doc.text(fmtEuro(precioUnitSeguro), 115, yPos)
        doc.text(fmtEuro(totalConceptoSeguro), pageWidth - 20, yPos, { align: 'right' })
        yPos += 6
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
      doc.text(fmtEuro(calcularBaseFactura.totalFactura), pageWidth - 20, yPos, { align: 'right' })
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
      const footerY = pageHeight - 50
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.3)
      doc.line(10, footerY - 5, pageWidth - 10, footerY - 5)

      doc.setFontSize(8)
      doc.setTextColor(100, 100, 100)
      doc.text(datosEmisor.nombre, 20, footerY)
      doc.text(`CIF: ${datosEmisor.cif} | Licencia: ${datosEmisor.licencia}`, 20, footerY + 6)
      doc.text(datosEmisor.direccion, 20, footerY + 12)
      doc.text(datosEmisor.banco1, 20, footerY + 18)
      doc.text(datosEmisor.banco2, 20, footerY + 24)

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

    // Validar valores del Desglose (no aceptar ceros por defecto)
    const paxP = Number(calcularBaseFactura.paxPago) || 0
    const precioNeto = parseFloat(calcularBaseFactura.precioNetoPax) || 0
    const totalF = parseFloat(calcularBaseFactura.totalFactura) || 0
    if (paxP <= 0 || precioNeto <= 0) {
      alert('⚠️ Revisa la cotización: Pasajeros de pago y Precio neto deben ser mayores que 0. Completa el Desglose antes de emitir.')
      return
    }
    if (totalF <= 0) {
      alert('⚠️ El total de la factura es 0. Revisa el Desglose (Pasajeros, Precio, Suplementos) antes de emitir.')
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
        const totalSupHab = parseFloat(suplementos.totalSupHabitacion || 0) || 0
        const paxInd = Math.max(1, parseFloat(formDataParaVariante?.sup_individual_pax || formData?.sup_individual_pax || 0) || 0)
        const datosFacturaCompletos = {
          ...datosFactura,
          numero_expediente: expediente?.numero_expediente || expediente?.numeroExpediente || '',
          formFactura: { ...formFactura },
          receptor: { nombre: formFactura.receptorNombre, cif_nif: formFactura.receptorCIF, direccion: formFactura.receptorDireccion, poblacion: formFactura.receptorPoblacion, provincia: formFactura.receptorProvincia, cp: formFactura.receptorCP },
          sup_individual_pax: paxInd,
          totalSupHabitacion: totalSupHab,
          totalSupSeguro: parseFloat(suplementos.totalSupSeguro || 0) || 0,
          sup_seguro_pax: parseFloat(formDataParaVariante?.sup_seguro_pax || formData?.sup_seguro_pax || 0) || 0,
          sup_seguro_precio_total: parseFloat(formDataParaVariante?.sup_seguro_precio_total || formData?.sup_seguro_precio_total || 0) || 0,
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
          lineasFactura: [
            { concepto: `Viaje a ${expediente?.destino || ''} (Pasajeros)`, unid: Number(calcularBaseFactura.paxPago), pUnit: Number(calcularBaseFactura.precioNetoPax), total: Number(calcularBaseFactura.totalServiciosConIVA) },
            ...(totalSupHab > 0 ? [{ concepto: 'Suplemento Habitación Individual', unid: paxInd, pUnit: Number((totalSupHab / paxInd).toFixed(2)), total: totalSupHab }] : []),
            ...(parseFloat(suplementos.totalSupSeguro || 0) > 0 ? [{ concepto: 'Seguro de cancelación', unid: Number(formDataParaVariante?.sup_seguro_pax || formData?.sup_seguro_pax || 0), pUnit: Number(formDataParaVariante?.sup_seguro_precio_total || formData?.sup_seguro_precio_total || 0), total: Number(suplementos.totalSupSeguro) }] : [])
          ],
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
      const fd = versiones?.length > 0 ? formDataParaVariante : formData
      const datosParaGuardar = {
        total_pax: toNum(fd?.total_pax),
        gratuidades: toNum(fd?.gratuidades),
        pax_pago: Math.max(1, toNum(fd?.total_pax) - toNum(fd?.gratuidades)),
        precio_venta_cliente: toNum(fd?.precio_venta_cliente),
        bonificacion_pax: toNum(fd?.bonificacion_pax),
        sup_individual_pax: toNum(fd?.sup_individual_pax),
        sup_individual_precio_dia: toNum(fd?.sup_individual_precio_dia),
        sup_seguro_pax: toNum(fd?.sup_seguro_pax),
        sup_seguro_precio_total: toNum(fd?.sup_seguro_precio_total),
        // Multigrupo: sin entradas vacías/nulas (columna expedientes: desglose_grupos)
        desglose_grupos: limpiarDesgloseGruposParaSupabase(desgloseGrupos),
      }
      let versionesGuardadas = null
      if (versiones?.length > 0) {
        const servsActuales = versiones[versionActiva]?.servicios ?? servicios
        const cabActual = {
          total_pax: toNum(fd?.total_pax),
          gratuidades: toNum(fd?.gratuidades),
          precio_venta_cliente: toNum(fd?.precio_venta_cliente),
          bonificacion_pax: toNum(fd?.bonificacion_pax),
          sup_individual_pax: toNum(fd?.sup_individual_pax),
          sup_individual_precio_dia: toNum(fd?.sup_individual_precio_dia),
          sup_seguro_pax: toNum(fd?.sup_seguro_pax),
          sup_seguro_precio_total: toNum(fd?.sup_seguro_precio_total),
        }
        versionesGuardadas = versiones.map((v, i) =>
          i === versionActiva ? { ...v, servicios: [...servsActuales], cabecera: cabActual } : v
        )
        datosParaGuardar.versiones_json = { versiones: versionesGuardadas }
      }

      const { error } = await supabase
        .from('expedientes')
        .update(datosParaGuardar)
        .eq('id', expedienteId)

      if (error) return { ok: false, error: extraerMensajeError(error) }

      onUpdate({ ...expediente, ...datosParaGuardar })
      if (versionesGuardadas) lastSavedVersionesRef.current = JSON.parse(JSON.stringify(versionesGuardadas))
      else lastSavedFormDataRef.current = { ...fd }
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
                <DestinoExpedienteEditable
                  expedienteId={expediente.id}
                  value={expediente.destino}
                  variant="header"
                  onSaved={(d) => onUpdate && onUpdate({ ...expediente, destino: d })}
                />
          </div>
              <button 
                onClick={handleClose} 
                className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full"
              >
            <X size={24} />
          </button>
            </div>
        </div>

          {/* AVISO DISCRETO DE DATOS PENDIENTES — nunca bloquea, solo informa */}
          {expedientePendiente.length > 0 && (
            <div className="px-4 sm:px-8 py-2 bg-amber-50 border-b border-amber-100 flex-shrink-0 flex items-center gap-2">
              <span className="text-amber-500 text-sm shrink-0">⚑</span>
              <p className="text-xs text-amber-700 font-medium leading-snug">
                Datos pendientes de completar:{' '}
                <span className="font-semibold">{expedientePendiente.join(' · ')}</span>
              </p>
            </div>
          )}

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
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>Nº Expediente</label>
                      <EditableInput
                        type="text"
                        value={expediente?.numero_expediente ?? expediente?.numeroExpediente ?? ''}
                        onSave={async (v) => {
                          const val = String(v || '').trim()
                          if (!val) return
                          const partes = val.split('-')
                          let formatted = val
                          if (partes.length === 2) {
                            const año = partes[0]
                            const seq = parseInt(partes[1], 10)
                            if (!isNaN(seq)) formatted = `${año}-${String(seq).padStart(3, '0')}`
                          }
                          if (!esNumeroExpedienteValido(formatted)) return
                          const yaExiste = await existeNumeroExpedienteEnSupabase(formatted, expediente?.id)
                          if (yaExiste) {
                            setErrorNumeroExpediente('Error: Este número de expediente ya está en uso')
                            return
                          }
                          setErrorNumeroExpediente(null)
                          if (onUpdate) onUpdate({ ...expediente, numero_expediente: formatted })
                        }}
                        parseValue={(v) => {
                          const s = String(v || '').trim()
                          if (!s) return ''
                          const partes = s.split('-')
                          if (partes.length === 2) {
                            const año = partes[0]
                            const seq = parseInt(partes[1], 10)
                            if (!isNaN(seq)) return `${año}-${String(seq).padStart(3, '0')}`
                          }
                          return s
                        }}
                        formatForDisplay={(v) => (v == null || v === '' ? '' : String(v))}
                        className="w-full p-4 transition-all font-mono font-semibold text-blue-700"
                        style={{ backgroundColor: '#f8fafc', color: '#1d4ed8', borderRadius: '12px', border: errorNumeroExpediente ? '2px solid #dc2626' : '1px solid #e2e8f0' }}
                        placeholder="2026-001"
                      />
                      {errorNumeroExpediente ? (
                        <p className="text-xs font-semibold text-red-600 mt-1">{errorNumeroExpediente}</p>
                      ) : (
                        <p className="text-xs text-slate-500 mt-1">Formato YYYY-XXX (ej: 2026-012)</p>
                      )}
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

                      <DestinoExpedienteEditable
                        expedienteId={expediente.id}
                        value={expediente.destino}
                        variant="form"
                        onSaved={(d) => onUpdate && onUpdate({ ...expediente, destino: d })}
                      />

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
                          const fechaFinVigente = expediente?.fecha_final || expediente?.fecha_fin || expediente?.fechaFin || ''
                          const duracion = calcularDuracionSeguroDesdeFechas(fechaISO, fechaFinVigente)
                          const expedienteActualizado = {
                            ...expediente,
                            fechaInicio: fechaEspañola,
                            fecha_inicio: fechaISO, // Sobrescribir para que la UI y Duración se actualicen al instante
                            dias: duracion.dias,
                            noches: duracion.noches,
                            duracion_calculada: duracion.texto,
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
                          const fechaInicioVigente = expediente?.fecha_inicio || expediente?.fechaInicio || ''
                          const duracion = calcularDuracionSeguroDesdeFechas(fechaInicioVigente, fechaISO)
                          const expedienteActualizado = {
                            ...expediente,
                            fechaFin: fechaEspañola,
                            fecha_final: fechaISO, // Sobrescribir para que la UI y Duración se actualicen al instante
                            dias: duracion.dias,
                            noches: duracion.noches,
                            duracion_calculada: duracion.texto,
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
                        value={formDataParaVariante?.total_pax ?? ''}
                        onSave={(v) => setCabeceraVariante('total_pax', v)}
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
                        value={formDataParaVariante?.gratuidades ?? ''}
                        onSave={(v) => setCabeceraVariante('gratuidades', v)}
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
                        value={formDataParaVariante?.bonificacion_pax ?? ''}
                        onSave={(v) => setCabeceraVariante('bonificacion_pax', v)}
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
                        value={formDataParaVariante?.precio_venta_cliente ?? ''}
                        onSave={(v) => setCabeceraVariante('precio_venta_cliente', v)}
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
                      <span className="text-xs ml-2 text-blue-600">({totalPax} total - {formDataParaVariante?.gratuidades || 0} gratis)</span>
                    </p>
                  </div>
                </div>

                {/* ── CONFIGURACIÓN DE GRUPOS ─────────────────────────────── */}
                <div className="bg-white rounded-xl shadow-md border border-blue-200 overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-6 py-4 bg-blue-600 text-white">
                    <div>
                      <h3 className="text-lg font-bold">Configuración de Grupos</h3>
                      <p className="text-blue-100 text-xs mt-0.5">
                        Define una fila por asociación. El total de pasajeros se calcula automáticamente.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDesgloseGrupos(prev => {
                          const blankRow = { id: `grp-${Date.now() + 1}`, cliente_id: null, nombre_grupo: '', pax: 0, gratuidades: 0 }
                          // First click on empty table → seed with existing cotización values so no data is lost
                          if (prev.length === 0) {
                            const nombreActual = expediente?.cliente_nombre || expediente?.nombre_grupo || ''
                            const idActual = clienteIdPrincipal || null
                            const paxActual = Number(formDataParaVariante?.total_pax) || 0
                            const gratisActual = Number(formDataParaVariante?.gratuidades) || 0
                            return [
                              { id: `grp-${Date.now()}-main`, cliente_id: idActual, nombre_grupo: nombreActual, pax: paxActual, gratuidades: gratisActual },
                              blankRow,
                            ]
                          }
                          return [...prev, blankRow]
                        })
                      }}
                      className="flex items-center gap-2 bg-white text-blue-700 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors shadow"
                    >
                      <Plus size={15} />
                      Añadir Asociación/Grupo
                    </button>
                  </div>

                  {desgloseGrupos.length === 0 ? (
                    <div className="px-6 py-8 text-center text-slate-400 text-sm">
                      Sin grupos configurados. Pulsa «Añadir Asociación/Grupo» para empezar.
                      <br />
                      <span className="text-xs text-slate-400 mt-1 block">
                        El primer clic creará automáticamente una fila con los datos actuales del expediente (cliente, pax y gratuidades).
                        Si no añades grupos, los campos de pasajeros siguen siendo editables manualmente.
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[400px]">
                          <thead>
                            <tr className="bg-blue-50 border-b border-blue-200">
                              <th className="px-4 py-2.5 text-left font-semibold text-blue-800 w-[50%]">Cliente / Asociación</th>
                              <th className="px-4 py-2.5 text-center font-semibold text-blue-800 w-[18%]">Pasajeros</th>
                              <th className="px-4 py-2.5 text-center font-semibold text-blue-800 w-[18%]">Gratuidades</th>
                              <th className="px-4 py-2.5 w-[14%]"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {desgloseGrupos.map((g, idx) => (
                              <tr
                                key={g.id || idx}
                                className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}
                              >
                                {/* ── Cliente selector ── */}
                                <td className="px-3 py-2">
                                  <div className="relative">
                                    <input
                                      type="text"
                                      value={busquedaGrupo[g.id] !== undefined ? busquedaGrupo[g.id] : (g.nombre_grupo || '')}
                                      placeholder="Buscar cliente…"
                                      autoComplete="off"
                                      onChange={e => {
                                        const q = e.target.value
                                        setBusquedaGrupo(prev => ({ ...prev, [g.id]: q }))
                                        setDropdownGrupo(prev => ({ ...prev, [g.id]: true }))
                                        if (!q) setDesgloseGrupos(prev =>
                                          prev.map((r, i) => i === idx ? { ...r, cliente_id: null, nombre_grupo: '' } : r)
                                        )
                                      }}
                                      onFocus={() => setDropdownGrupo(prev => ({ ...prev, [g.id]: true }))}
                                      onBlur={() => setTimeout(() => setDropdownGrupo(prev => ({ ...prev, [g.id]: false })), 200)}
                                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                                    />
                                    {dropdownGrupo[g.id] && (() => {
                                      const q = (busquedaGrupo[g.id] || '').toLowerCase().trim()
                                      const matches = clientes.filter(c =>
                                        !q || (c.nombre || '').toLowerCase().includes(q)
                                      ).slice(0, 8)
                                      if (!matches.length) return null
                                      return (
                                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-52 overflow-y-auto">
                                          {matches.map(c => (
                                            <button
                                              key={c.id}
                                              type="button"
                                              onMouseDown={e => {
                                                e.preventDefault()
                                                setDesgloseGrupos(prev =>
                                                  prev.map((r, i) => i === idx
                                                    ? { ...r, cliente_id: c.id, nombre_grupo: c.nombre }
                                                    : r
                                                  )
                                                )
                                                setBusquedaGrupo(prev => ({ ...prev, [g.id]: undefined }))
                                                setDropdownGrupo(prev => ({ ...prev, [g.id]: false }))
                                              }}
                                              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-100 last:border-0 transition-colors"
                                            >
                                              <span className="font-medium text-slate-800">{c.nombre}</span>
                                              {c.responsable && <span className="text-xs text-slate-400 ml-2">{c.responsable}</span>}
                                            </button>
                                          ))}
                                        </div>
                                      )
                                    })()}
                                    {g.cliente_id && (
                                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium pointer-events-none">✓</span>
                                    )}
                                  </div>
                                </td>
                                {/* ── Pasajeros ── */}
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    min="0"
                                    value={g.pax || ''}
                                    placeholder="0"
                                    onWheel={e => e.target.blur()}
                                    onChange={e => setDesgloseGrupos(prev =>
                                      prev.map((r, i) => i === idx ? { ...r, pax: Math.max(0, parseInt(e.target.value, 10) || 0) } : r)
                                    )}
                                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                                  />
                                </td>
                                {/* ── Gratuidades ── */}
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    min="0"
                                    value={g.gratuidades || ''}
                                    placeholder="0"
                                    onWheel={e => e.target.blur()}
                                    onChange={e => setDesgloseGrupos(prev =>
                                      prev.map((r, i) => i === idx ? { ...r, gratuidades: Math.max(0, parseInt(e.target.value, 10) || 0) } : r)
                                    )}
                                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                                  />
                                </td>
                                {/* ── Eliminar ── */}
                                <td className="px-3 py-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => setDesgloseGrupos(prev => prev.filter((_, i) => i !== idx))}
                                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Eliminar fila"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-blue-50 border-t-2 border-blue-300 font-bold text-blue-900">
                              <td className="px-4 py-2.5 text-sm">TOTALES</td>
                              <td className="px-4 py-2.5 text-center text-blue-700 text-base">
                                {desgloseGrupos.reduce((s, g) => s + (Number(g.pax) || 0), 0)}
                              </td>
                              <td className="px-4 py-2.5 text-center text-blue-700">
                                {desgloseGrupos.reduce((s, g) => s + (Number(g.gratuidades) || 0), 0)}
                              </td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {/* Summary pill */}
                      <div className="px-6 py-3 bg-blue-50 border-t border-blue-100 flex flex-wrap items-center gap-6 text-sm">
                        <span className="font-semibold text-blue-900">
                          Total Pax:&nbsp;<strong className="text-xl">{desgloseGrupos.reduce((s, g) => s + (Number(g.pax) || 0), 0)}</strong>
                        </span>
                        <span className="font-semibold text-slate-700">
                          Gratuidades:&nbsp;<strong>{desgloseGrupos.reduce((s, g) => s + (Number(g.gratuidades) || 0), 0)}</strong>
                        </span>
                        <span className="font-semibold text-emerald-700">
                          Pax de Pago:&nbsp;<strong>{Math.max(0, desgloseGrupos.reduce((s, g) => s + (Number(g.pax) || 0), 0) - desgloseGrupos.reduce((s, g) => s + (Number(g.gratuidades) || 0), 0))}</strong>
                        </span>
                        <span className="text-xs text-slate-400 italic">La bonificación se aplica globalmente desde el campo superior.</span>
                      </div>
                    </>
                  )}
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
                            {(!formDataParaVariante?.sup_individual_pax || Number(formDataParaVariante?.sup_individual_pax) === 0) && (
                              <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                            )}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={formDataParaVariante?.sup_individual_pax}
                            onChange={(e) => setCabeceraVariante('sup_individual_pax', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                            onWheel={handleWheel}
                            className="w-full p-3 text-sm transition-all"
                            style={{
                              backgroundColor: '#f8fafc',
                              color: '#0f172a',
                              borderRadius: '12px',
                              border:
                                !formDataParaVariante?.sup_individual_pax || Number(formDataParaVariante?.sup_individual_pax) === 0
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
                                !formDataParaVariante?.sup_individual_pax || Number(formDataParaVariante?.sup_individual_pax) === 0 ? '#f59e0b' : '#e2e8f0'
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
                            {(!formDataParaVariante?.sup_individual_precio_dia || Number(formDataParaVariante?.sup_individual_precio_dia) === 0) && (
                              <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                            )}
                          </label>
                          <input
                            type="number"
                        step="0.01"
                            min="0"
                            value={formDataParaVariante?.sup_individual_precio_dia || ''}
                            onChange={(e) => setCabeceraVariante('sup_individual_precio_dia', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                            onWheel={handleWheel}
                            className="w-full p-3 text-sm transition-all"
                            style={{
                              backgroundColor: '#f8fafc',
                              color: '#0f172a',
                              borderRadius: '12px',
                              border:
                                !formDataParaVariante?.sup_individual_precio_dia || Number(formDataParaVariante?.sup_individual_precio_dia) === 0
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
                                !formDataParaVariante?.sup_individual_precio_dia || Number(formDataParaVariante?.sup_individual_precio_dia) === 0
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
                          ({formDataParaVariante?.sup_individual_pax || 0} pax × {(parseFloat(suplementos.totalSupHabitacion) / Math.max(1, parseFloat(formDataParaVariante?.sup_individual_pax || 0))).toFixed(2)}€)
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
                            {(!formDataParaVariante?.sup_seguro_pax || Number(formDataParaVariante?.sup_seguro_pax) === 0) && (
                              <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                            )}
                          </label>
                      <input
                        type="number"
                            min="0"
                            value={formDataParaVariante?.sup_seguro_pax || ''}
                            onChange={(e) => setCabeceraVariante('sup_seguro_pax', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                            onWheel={handleWheel}
                            className="w-full p-3 text-sm transition-all"
                            style={{
                              backgroundColor: '#f8fafc',
                              color: '#0f172a',
                              borderRadius: '12px',
                              border:
                                !formDataParaVariante?.sup_seguro_pax || Number(formDataParaVariante?.sup_seguro_pax) === 0
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
                                !formDataParaVariante?.sup_seguro_pax || Number(formDataParaVariante?.sup_seguro_pax) === 0 ? '#f59e0b' : '#e2e8f0'
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
                            {(!formDataParaVariante?.sup_seguro_precio_total || Number(formDataParaVariante?.sup_seguro_precio_total) === 0) && (
                              <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                            )}
                          </label>
                          <input
                            type="number"
                        step="0.01"
                            min="0"
                            value={formDataParaVariante?.sup_seguro_precio_total || ''}
                            onChange={(e) => setCabeceraVariante('sup_seguro_precio_total', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                            onWheel={handleWheel}
                            className="w-full p-3 text-sm transition-all"
                            style={{
                              backgroundColor: '#f8fafc',
                              color: '#0f172a',
                              borderRadius: '12px',
                              border:
                                !formDataParaVariante?.sup_seguro_precio_total || Number(formDataParaVariante?.sup_seguro_precio_total) === 0
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
                                !formDataParaVariante?.sup_seguro_precio_total || Number(formDataParaVariante?.sup_seguro_precio_total) === 0
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
                          ({formDataParaVariante?.sup_seguro_pax || 0} pax × {formDataParaVariante?.sup_seguro_precio_total || 0}€)
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

                {/* Multicotización: pestañas Opción 1, Opción 2... + Duplicar */}
                <div className="bg-white rounded-xl shadow-md p-4 sm:p-6 border border-gray-200 mb-6">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h3 className="text-lg font-bold text-navy-900">Presupuestos (Multicotización)</h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={duplicarCotizacion}
                        className="px-3 py-2 bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 font-medium text-sm flex items-center gap-2"
                      >
                        ➕ Duplicar esta cotización
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3 mb-3">
                    {versiones.map((v, idx) => (
                      <div key={v.id} className="flex items-center gap-1 flex-wrap">
                        <button
                          type="button"
                          onClick={() => cambiarVersionActiva(idx)}
                          className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors min-w-[100px] ${
                            versionActiva === idx
                              ? 'bg-navy-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {v.nombre || `Opción ${idx + 1}`}
                        </button>
                        <input
                          type="text"
                          value={v.nombre}
                          onChange={(e) => {
                            const val = e.target.value
                            setVersiones(prev => prev.map((x, i) => i === idx ? { ...x, nombre: val } : x))
                          }}
                          onFocus={(ev) => ev.stopPropagation()}
                          className="text-xs w-32 px-2 py-1 border border-gray-200 rounded bg-white"
                          placeholder="Nombre de la opción"
                          title="Editar nombre de la opción"
                        />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); marcarComoConfirmada(idx) }}
                          title="Solo la opción CONFIRMADA suma para beneficio_neto_real en Central de Inteligencia"
                          className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
                            v.confirmada ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-800'
                          }`}
                        >
                          {v.confirmada ? '✓ CONFIRMADA' : 'Confirmar'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tabla de Servicios - TablaServiciosVariante con key=versionActiva: contenedor estanco por variante */}
                {versiones.length > 0 ? (
                  <TablaServiciosVariante
                    key={versionActiva}
                    indiceActivo={versionActiva}
                    versiones={versiones}
                    onVersionesChange={setVersiones}
                    expedienteId={expediente?.id}
                    proveedores={proveedores}
                    paxPago={paxPago}
                    totalPax={totalPax}
                    onRefresh={onRefresh}
                    cargarProveedores={cargarProveedores}
                    persistirCambios={persistirCambios}
                    isSaving={isSaving}
                    setIsSaving={setIsSaving}
                    expediente={expediente}
                  />
                ) : (
                  <ServiciosCotizacionPanel
                    expediente={expediente}
                    expedienteId={expediente?.id}
                    servicios={servicios}
                    setServicios={setServiciosYVersiones}
                    multicotizacionMode={false}
                    proveedores={proveedores}
                    paxPago={paxPago}
                    totalPax={totalPax}
                    onRefresh={onRefresh}
                    cargarProveedores={cargarProveedores}
                    persistirCambios={persistirCambios}
                    isSaving={isSaving}
                    setIsSaving={setIsSaving}
                  />
                )}

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

                    {parseInt(formDataParaVariante?.gratuidades || 0) > 0 && (
                      <div className="bg-orange-50 p-4 rounded-lg md:col-span-2 border-2 border-orange-300">
                        <p className="text-xs text-orange-700 font-semibold uppercase mb-1">🎁 Prorrateo Gratuidades/Pax</p>
                        <p className="text-sm text-orange-600 mb-1">
                          {resultados?.gratuidades ?? 0} plazas × {resultados?.costeBaseGratuidad ?? 0}€ = {resultados?.costePlazasGratuitas ?? 0}€ total
                        </p>
                        <p className="text-2xl font-bold text-orange-900">+{resultados?.costeGratuidadesPorPax ?? 0}€/pax</p>
            </div>
          )}

                    {parseFloat(formDataParaVariante?.bonificacion_pax || 0) > 0 && (
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
                      {parseInt(formDataParaVariante?.gratuidades || 0) > 0 && (
                        <div className="flex justify-between py-2 border-b border-blue-200">
                          <span className="text-orange-700 font-medium">➕ Prorrateo Gratuidades ({formDataParaVariante?.gratuidades || 0} × {resultados?.costeBaseGratuidad ?? 0}€)</span>
                          <span className="font-bold text-orange-900">+{resultados?.costeGratuidadesPorPax ?? 0}€</span>
                        </div>
                      )}
                      {parseFloat(formDataParaVariante?.bonificacion_pax || 0) > 0 && (
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
                      {/* Cuota IVA desglose base imponible */}
                      <div className="bg-red-50 p-4 rounded-lg border-2 border-red-300">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-bold text-red-700">
                            Cuota IVA (21% s/ base imponible):
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
                  const { data } = await supabase
                    .from('expedientes')
                    .select('presupuesto_total, total_cobrado, total_ingresos')
                    .eq('id', expediente.id)
                    .single()
                  if (data) {
                    onUpdate({
                      ...expediente,
                      presupuesto_total: data.presupuesto_total != null ? Number(data.presupuesto_total) : expediente.presupuesto_total,
                      total_cobrado: data.total_cobrado != null ? Number(data.total_cobrado) : 0,
                      total_ingresos: data.total_ingresos != null ? Number(data.total_ingresos) : expediente.total_ingresos,
                    })
                  }
                }}
                servicios={servicios}
                versiones={versiones}
                versionActiva={versionActiva}
                onVersionChange={cambiarVersionActiva}
                formData={formData}
                suplementos={suplementos}
                expedienteClientes={expedienteClientes}
                grupo={grupo}
                clienteIdPrincipal={clienteIdPrincipal}
                obtenerProveedorPorId={obtenerProveedorPorId}
                clientes={clientes}
                user={user}
              />
          )}

          {/* TAB: Pagos a Proveedores */}
          {tab === 'pagosProveedores' && (
            <div className="max-w-4xl mx-auto space-y-6">

              {/* ── Sección inteligente: registrar factura por servicio ──────── */}
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                <h3 className="text-xl font-bold text-navy-900 mb-5">Registrar Factura por Servicio</h3>

                {mensajeExitoFacturaProveedor ? (
                  <div
                    role="status"
                    className="mb-5 rounded-lg border border-emerald-200/90 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
                  >
                    {mensajeExitoFacturaProveedor}
                  </div>
                ) : null}

                {/* Error de carga de servicios — no bloquea nada más */}
                {errorCot && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm mb-4 flex items-center gap-2">
                    <span>⚠</span> {errorCot}
                  </div>
                )}

                {cargandoCot && (
                  <p className="text-gray-400 text-sm mb-4">Cargando servicios de la cotización…</p>
                )}

                {!cargandoCot && !errorCot && serviciosCot.length === 0 && (
                  <p className="text-gray-400 text-sm mb-4">No hay servicios en la cotización de este expediente.</p>
                )}

                {/* Tarjetas de servicios */}
                {serviciosCot.length > 0 && (
                  <div className="space-y-3 mb-6">
                    {serviciosCot.map(s => {
                      const pagoRegistrado = pagosProveedores.find((p) =>
                        pagoProveedorCoincideFilaServiciosCot(p, s)
                      )
                      // "Documentado" requiere pago + url_pdf con contenido real
                      const urlPdf = String(pagoRegistrado?.url_pdf ?? '').trim()
                      const documentado = Boolean(pagoRegistrado && urlPdf.length > 0)
                      const idsFila = idsServicioFilaPagos(s)
                      const abierto = idsFila.some((id) => String(inlineId ?? '') === id)
                      return (
                        <div
                          key={idsFila.join('-')}
                          className={`rounded-xl border transition-all ${
                          abierto         ? 'border-blue-400 bg-blue-50'
                          : documentado   ? 'border-green-300 bg-green-50'
                          : pagoRegistrado? 'border-amber-300 bg-amber-50'
                          :                 'border-gray-200 bg-gray-50'
                          } ${tarjetaServicioCotOcultaEnVistaPagosTab(s) ? 'hidden' : ''}`}
                        >
                          {/* Fila principal */}
                          <div className="flex items-center justify-between px-4 py-3">
                            <div className="min-w-0">
                              {/* Tipo + nombre específico */}
                              <p className="font-semibold text-slate-800 text-sm leading-snug">
                                {s.tipo_servicio || 'Servicio'}
                                {s.nombre_especifico ? ` — ${s.nombre_especifico}` : ''}
                              </p>
                              {/* Proveedor resuelto (DB lookup → texto manual → fallback) */}
                              <p className={`text-xs mt-0.5 font-medium ${s._proveedorNombre ? 'text-indigo-700' : 'text-gray-400 italic'}`}>
                                {s._proveedorNombre || 'Sin proveedor asignado'}
                              </p>
                              {/* Importe presupuestado */}
                              <p className="text-xs text-gray-400 mt-1">
                                Presupuestado: <span className="font-semibold text-gray-600">{Number(s.total_servicio_manual || s.total_servicio || s.coste_unitario || 0).toFixed(2)} €</span>
                              </p>
                            </div>
                            <div className="shrink-0 ml-4">
                              {documentado ? (
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  <span className="flex items-center gap-1.5 text-emerald-800 font-semibold text-sm">
                                    <CheckCircle size={17} strokeWidth={1.75} /> Documentado
                                  </span>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => abrirFacturaProveedorPorUrlGuardada(urlPdf)}
                                      className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors"
                                      title="Ver factura en una pestaña nueva"
                                      aria-label="Ver Factura"
                                    >
                                      <Eye size={18} strokeWidth={1.75} className="shrink-0 text-slate-600" />
                                      Ver Factura
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => abrirFormularioCambiarPdfServicio(s, pagoRegistrado)}
                                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
                                      title="Cambiar archivo PDF"
                                      aria-label="Cambiar factura PDF"
                                    >
                                      <Pencil size={16} strokeWidth={1.75} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => quitarPdfFacturaServicioCot(pagoRegistrado)}
                                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors"
                                      title="Quitar PDF"
                                      aria-label="Quitar PDF adjunto"
                                    >
                                      <Trash2 size={16} strokeWidth={1.75} />
                                    </button>
                                  </div>
                                </div>
                              ) : pagoRegistrado ? (
                                /* ⚠ Pago registrado pero sin PDF adjunto */
                                <div className="flex items-center gap-2">
                                  <span className="text-amber-600 text-sm font-semibold">⚠ Sin factura PDF</span>
                                  <button
                                    onClick={() => {
                                      setInlineId(s.id)
                                      setFInline({ numero_factura: pagoRegistrado.numero_factura || '', fecha_pago: pagoRegistrado.fecha_pago || new Date().toISOString().split('T')[0], importe_pagado: pagoRegistrado.importe_pagado || s.total_servicio_manual || s.total_servicio || s.coste_unitario || '' })
                                      setPdfInline(null)
                                    }}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors"
                                  >
                                    <Paperclip size={12} /> Adjuntar PDF
                                  </button>
                                </div>
                              ) : (
                                /* Sin registro — botón principal */
                                <button
                                  onClick={() => {
                                    setInlineId(s.id)
                                    setFInline({ numero_factura: '', fecha_pago: new Date().toISOString().split('T')[0], importe_pagado: s.total_servicio_manual || s.total_servicio || s.coste_unitario || '' })
                                    setPdfInline(null)
                                  }}
                                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
                                >
                                  <Paperclip size={14} /> Registrar Factura
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Formulario inline */}
                          {abierto && (
                            <div className="px-4 pb-4 pt-1 border-t border-blue-200 mt-1">
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                                <div>
                                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nº Factura</label>
                                  <input type="text" placeholder="F2024-001"
                                    className="w-full p-2.5 rounded-lg border border-gray-200 bg-white text-sm"
                                    value={fInline.numero_factura}
                                    onChange={e => setFInline({ ...fInline, numero_factura: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Fecha *</label>
                                  <input type="date"
                                    className="w-full p-2.5 rounded-lg border border-gray-200 bg-white text-sm"
                                    value={fInline.fecha_pago}
                                    onChange={e => setFInline({ ...fInline, fecha_pago: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Importe Final (€) *</label>
                                  <input type="number" step="0.01" min="0" placeholder="0.00"
                                    className="w-full p-2.5 rounded-lg border border-gray-200 bg-white text-sm"
                                    value={fInline.importe_pagado}
                                    onChange={e => setFInline({ ...fInline, importe_pagado: e.target.value })}
                                    onWheel={e => e.target.blur()}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                                    <Paperclip size={10} className="inline mr-1" />PDF Factura
                                  </label>
                                  <input type="file" accept=".pdf,.PDF"
                                    className="w-full text-xs text-gray-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700"
                                    onChange={e => setPdfInline(e.target.files?.[0] || null)}
                                  />
                                  {pdfInline && <p className="text-xs text-green-600 mt-0.5">✓ {pdfInline.name}</p>}
                                </div>
                              </div>
                              <div className="flex gap-3 mt-3">
                                <button onClick={() => guardarFacturaCot(s)} disabled={subiendoPdfCot}
                                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm disabled:opacity-50 transition-colors">
                                  <CreditCard size={14} />
                                  {subiendoPdfCot ? 'Guardando…' : 'REGISTRAR FACTURA'}
                                </button>
                                <button onClick={() => { setInlineId(null); setPdfInline(null) }}
                                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-100">
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Botón: Añadir Gasto Extra */}
                <div className="border-t border-gray-100 pt-4">
                  <button onClick={() => setShowGastoExtra(v => !v)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-sm font-semibold transition-colors">
                    <Plus size={15} /> {showGastoExtra ? 'Cerrar Gasto Extra' : 'Añadir Gasto Extra'}
                  </button>
                </div>

                {/* Formulario Gasto Extra */}
                {showGastoExtra && (
                  <div className="mt-4 bg-emerald-50 rounded-xl border border-emerald-300 p-4">
                    <h4 className="font-semibold text-slate-800 text-sm mb-3 flex items-center gap-2">
                      <Plus size={14} className="text-emerald-600" /> Gasto Extra — No cotizado
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Proveedor</label>
                        <input type="text" placeholder="Nombre del proveedor"
                          className="w-full p-2.5 rounded-lg border border-gray-200 bg-white text-sm"
                          value={fExtra.proveedor_nombre}
                          onChange={e => setFExtra({ ...fExtra, proveedor_nombre: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Concepto *</label>
                        <input type="text" placeholder="Descripción del gasto"
                          className="w-full p-2.5 rounded-lg border border-gray-200 bg-white text-sm"
                          value={fExtra.concepto}
                          onChange={e => setFExtra({ ...fExtra, concepto: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nº Factura</label>
                        <input type="text" placeholder="F2024-099"
                          className="w-full p-2.5 rounded-lg border border-gray-200 bg-white text-sm"
                          value={fExtra.numero_factura}
                          onChange={e => setFExtra({ ...fExtra, numero_factura: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Fecha *</label>
                        <input type="date"
                          className="w-full p-2.5 rounded-lg border border-gray-200 bg-white text-sm"
                          value={fExtra.fecha_pago}
                          onChange={e => setFExtra({ ...fExtra, fecha_pago: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Importe (€) *</label>
                        <input type="number" step="0.01" min="0" placeholder="0.00"
                          className="w-full p-2.5 rounded-lg border border-gray-200 bg-white text-sm"
                          value={fExtra.importe_pagado}
                          onChange={e => setFExtra({ ...fExtra, importe_pagado: e.target.value })}
                          onWheel={e => e.target.blur()}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                          <Paperclip size={10} className="inline mr-1" />PDF Factura
                        </label>
                        <input type="file" accept=".pdf,.PDF"
                          className="w-full text-xs text-gray-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700"
                          onChange={e => setPdfExtra(e.target.files?.[0] || null)}
                        />
                        {pdfExtra && <p className="text-xs text-green-600 mt-0.5">✓ {pdfExtra.name}</p>}
                      </div>
                    </div>
                    <div className="flex gap-3 mt-4">
                      <button onClick={guardarGastoExtra} disabled={subiendoPdfCot}
                        className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm disabled:opacity-50 transition-colors">
                        <Plus size={14} />{subiendoPdfCot ? 'Guardando…' : 'Guardar Gasto Extra'}
                      </button>
                      <button onClick={() => { setShowGastoExtra(false); setPdfExtra(null) }}
                        className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-100">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Facturas y pagos registrados ──────────────────────────── */}
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
                <h3 className="text-xl font-bold text-navy-900 mb-4">Facturas registradas</h3>
                {cargandoPagosProveedores ? (
                  <p className="text-gray-500">Cargando...</p>
                ) : pagosProveedores.length === 0 ? (
                  <p className="text-gray-500">No hay facturas registradas.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-gray-500 text-xs uppercase tracking-wider">
                          <th className="pb-2 pr-3">Tipo</th>
                          <th className="pb-2 pr-3">Nº Factura</th>
                          <th className="pb-2 pr-3">Concepto</th>
                          <th className="pb-2 pr-3">Fecha</th>
                          <th className="pb-2 pr-3 text-right">Importe</th>
                          <th className="pb-2 text-center w-14">PDF</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {pagosProveedores.map((p) => (
                          <tr
                            key={p.id || `${p.servicio_id}-${p.fecha_pago}`}
                            className={`hover:bg-slate-50/80 transition-colors${filaPagoProveedorOcultaEnVistaPagosTab(p) ? ' hidden' : ''}`}
                          >
                            <td className="py-2.5 pr-3">
                              {(p.servicio_id == null || String(p.servicio_id).trim() === '')
                                ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Extra</span>
                                : <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Cotizado</span>
                              }
                            </td>
                            <td className="py-2.5 pr-3 font-mono text-xs text-gray-700">{p.numero_factura || '—'}</td>
                            <td className="py-2.5 pr-3 font-medium text-gray-900">{p.concepto || '—'}</td>
                            <td className="py-2.5 pr-3 text-gray-500 text-xs whitespace-nowrap">{p.fecha_pago || '—'}</td>
                            <td className="py-2.5 pr-3 text-right font-semibold">{Number(p.importe_pagado || 0).toFixed(2)} €</td>
                            <td className="py-2.5 text-center">
                              {p.url_pdf ? (
                                <button
                                  type="button"
                                  onClick={() => abrirFacturaProveedorPorUrlGuardada(p.url_pdf)}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                                  title="Ver Factura"
                                >
                                  <Eye size={16} strokeWidth={1.75} />
                                  Ver Factura
                                </button>
                              ) : (
                                <span className="text-slate-300 text-xs">—</span>
                              )}
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

          {/* TAB: Cierre de Grupo - delegado a ExpedienteFinanzas */}
          {/* Solo la opción CONFIRMADA suma para beneficio_neto_real (Central de Inteligencia) */}
          {tab === 'cierre' && (
              <ExpedienteFinanzas
                activeTab="cierre"
                expediente={expediente}
                onUpdate={onUpdate}
                cobros={cobros}
                onCobrosReload={cargarCobros}
                onExpedienteRefresh={async () => {
                  if (!expediente?.id || !onUpdate) return
                  const { data } = await supabase
                    .from('expedientes')
                    .select('presupuesto_total, total_cobrado, total_ingresos')
                    .eq('id', expediente.id)
                    .single()
                  if (data) {
                    onUpdate({
                      ...expediente,
                      presupuesto_total: data.presupuesto_total != null ? Number(data.presupuesto_total) : expediente.presupuesto_total,
                      total_cobrado: data.total_cobrado != null ? Number(data.total_cobrado) : 0,
                      total_ingresos: data.total_ingresos != null ? Number(data.total_ingresos) : expediente.total_ingresos,
                    })
                  }
                }}
                servicios={serviciosParaCierre}
                formData={formData}
                suplementos={suplementos}
                expedienteClientes={expedienteClientes}
                grupo={grupo}
                clienteIdPrincipal={clienteIdPrincipal}
                obtenerProveedorPorId={obtenerProveedorPorId}
                clientes={clientes}
                versiones={versiones}
                versionActiva={versionActiva}
                onVersionChange={cambiarVersionActiva}
                desgloseGrupos={desgloseGrupos}
                user={user}
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
                      <div className="py-2 border-b border-blue-200">
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Detalle (Unid. × P. Unit = Total)</div>
                        <div className="space-y-1.5 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-700">
                              Viaje · {calcularBaseFactura.paxPago} × {calcularBaseFactura.precioNetoPax}€
                            </span>
                            <span className="font-semibold text-navy-900">{calcularBaseFactura.totalServiciosConIVA}€</span>
                          </div>
                          {parseFloat(suplementos.totalSupHabitacion) > 0 && (
                            <div className="flex justify-between">
                              <span className="text-gray-700">
                                Habitación individual · {formDataParaVariante?.sup_individual_pax || 0} × {(parseFloat(suplementos.totalSupHabitacion) / Math.max(1, parseFloat(formDataParaVariante?.sup_individual_pax || 0))).toFixed(2)}€
                              </span>
                              <span className="font-semibold text-navy-900">{suplementos.totalSupHabitacion}€</span>
                            </div>
                          )}
                          {parseFloat(suplementos.totalSupSeguro) > 0 && (
                            <div className="flex justify-between">
                              <span className="text-gray-700">
                                Seguro cancelación · {formDataParaVariante?.sup_seguro_pax || 0} × {formDataParaVariante?.sup_seguro_precio_total || 0}€
                              </span>
                              <span className="font-semibold text-navy-900">{suplementos.totalSupSeguro}€</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between py-3 bg-green-100 rounded-lg px-4 mt-3 border-2 border-green-400">
                        <span className="text-lg font-bold text-green-900">TOTAL FACTURA (IVA INCLUIDO):</span>
                        <span className="text-2xl font-bold text-green-900">{calcularBaseFactura.totalFactura}€</span>
                      </div>
                      <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <p className="text-[10px] text-slate-600 leading-relaxed">
                          Régimen especial de las agencias de viaje. El IVA ya está incluido en todos los conceptos especificados en esta factura, de acuerdo con lo señalado en el art 142 de la Ley 37/1992, de 28 de diciembre, del Impuesto sobre el Valor Añadido.
                        </p>
                      </div>
                      <div className="mt-3 pt-3 border-t border-slate-200 text-[10px] text-slate-600">
                        <p className="font-semibold text-slate-700">{datosEmisor.nombre}</p>
                        <p>CIF: {datosEmisor.cif} · Licencia: {datosEmisor.licencia}</p>
                        <p>{datosEmisor.direccion}</p>
                        <p>{datosEmisor.telefono ? `Tel: ${datosEmisor.telefono} · ` : ''}{datosEmisor.email}</p>
                        <p className="mt-1">Ingresos: {datosEmisor.banco1} · {datosEmisor.banco2}</p>
                      </div>
                    </div>
                  </div>

                  {/* Botón de Emisión */}
                  <div className="flex justify-between items-center">
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
