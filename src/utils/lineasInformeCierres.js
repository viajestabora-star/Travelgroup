import { supabase } from '../supabase'

/**
 * Campos del expediente necesarios para `calcularTotalesInforme` + `crearJsPdfInformeCierre`
 * (misma consulta que usa la pestaña Informe Hacienda en Cierres.jsx).
 */
export const EXPEDIENTE_SELECT_PARA_PDF_CIERRES =
  'id, numero_expediente, nombre_grupo, cliente_nombre, destino, precio_venta_cliente, pax_pago, total_pax, gratuidades, bonificacion_pax, sup_individual_pax, sup_individual_precio_dia, sup_seguro_pax, sup_seguro_precio_total, noches, informe_gastos_hacienda, total_ingresos, total_gastos_reales, liquidacion_final_beneficio, cierre_grupo'

const n = (v) => {
  const num = Number(v ?? 0)
  return Number.isFinite(num) ? num : 0
}

/**
 * Mapeo EXACTO de servicios_cotizacion → lineasInforme (Cierres.jsx, cargarInformeParaExpediente).
 */
export function mapServiciosCotizacionALineasInforme(servicios) {
  return (servicios || []).map((s) => {
    const concepto =
      s.nombre_especifico ||
      s.nombre_servicio ||
      s.tipo_servicio ||
      s.tipo ||
      'Servicio sin nombre'

    const proveedor =
      s.nombre_proveedor_texto || s.nombre_proveedor_manual || ''

    let importeCotizado = 0
    if (s.total_servicio !== null && s.total_servicio !== undefined) {
      importeCotizado = Number(s.total_servicio) || 0
    } else {
      const coste = Number(s.coste_unitario) || 0
      const noches = Number(s.noches) || 1
      const tipoCalculo = s.tipo_calculo || 'porPersona'

      if (tipoCalculo === 'porGrupo') {
        importeCotizado = coste
      } else {
        importeCotizado = coste * noches
      }
    }

    const importeReal = importeCotizado

    return {
      id_servicio: s.id,
      concepto,
      proveedor,
      importe_cotizado: +importeCotizado.toFixed(2),
      importe_real: +importeReal.toFixed(2),
    }
  })
}

/**
 * Misma forma que `lineasInforme` en Cierres: concepto y proveedor desde pagos_proveedores.
 */
export function mapPagosProveedoresALineasInforme(pagos) {
  return (pagos || []).map((p) => {
    const rawConcepto = String(p.concepto ?? '').trim()
    const factura = String(p.numero_factura ?? '').trim()
    const concepto =
      rawConcepto || (factura ? `Factura ${factura}` : '') || 'Servicio sin nombre'
    const proveedor = String(p.proveedor_nombre ?? '').trim()
    const importeReal = n(p.importe_pagado)
    return {
      id_servicio: p.id,
      concepto,
      proveedor,
      importe_cotizado: +importeReal.toFixed(2),
      importe_real: +importeReal.toFixed(2),
    }
  })
}

function normalizarLineasInformeGuardado(lineas) {
  return (lineas || []).map((l) => ({
    id_servicio: l.id_servicio,
    concepto: l.concepto ?? '',
    proveedor: l.proveedor ?? '',
    importe_cotizado: Number(l.importe_cotizado) || 0,
    importe_real: Number(l.importe_real) || 0,
  }))
}

/**
 * Replica la lógica de `cargarInformeParaExpediente` en Cierres.jsx.
 *
 * @param {object} supabaseClient - cliente Supabase
 * @param {object} exp - expediente (con id)
 * @param {{ preferPagosPrimero?: boolean }} options - si true (pack auditoría): primero pagos_proveedores; si hay filas, mismas lineas que Cierres + mismo PDF
 */
export async function obtenerLineasInformeComoCierres(supabaseClient, exp, options = {}) {
  const { preferPagosPrimero = false } = options
  if (!exp?.id) return []

  if (preferPagosPrimero) {
    const { data: pagos, error } = await supabaseClient
      .from('pagos_proveedores')
      .select('id, concepto, proveedor_nombre, importe_pagado, fecha_pago, numero_factura')
      .eq('expediente_id', exp.id)
      .order('fecha_pago', { ascending: true, nullsFirst: true })

    if (!error && Array.isArray(pagos) && pagos.length > 0) {
      return mapPagosProveedoresALineasInforme(pagos)
    }
  }

  if (exp.informe_gastos_hacienda && Array.isArray(exp.informe_gastos_hacienda.lineas)) {
    const lineas = exp.informe_gastos_hacienda.lineas
    if (lineas.length > 0) {
      return normalizarLineasInformeGuardado(lineas)
    }
  }

  try {
    const { data, error } = await supabaseClient
      .from('servicios_cotizacion')
      .select(
        'id, tipo_servicio, tipo, nombre_especifico, nombre_servicio, nombre_proveedor_texto, nombre_proveedor_manual, proveedor_id_int, coste_unitario, noches, tipo_calculo, total_servicio'
      )
      .eq('id_expediente', exp.id)
      .order('id', { ascending: true })

    if (error) return []

    return mapServiciosCotizacionALineasInforme(Array.isArray(data) ? data : [])
  } catch {
    return []
  }
}

/** Refresco de expediente para PDF (Historial) sin acoplar al import de página. */
export async function obtenerExpedienteParaPdfCierres(expedienteId) {
  const { data, error } = await supabase
    .from('expedientes')
    .select(EXPEDIENTE_SELECT_PARA_PDF_CIERRES)
    .eq('id', expedienteId)
    .single()
  if (error || !data) return null
  return data
}
