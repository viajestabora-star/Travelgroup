import jsPDF from 'jspdf'
import { categorizarPago } from './finanzasHelpers'

/** Orden de secciones alineado con el cuaderno de cierres / modelo operativo. */
const CATEGORIAS_ORDEN = ['Bus', 'Hotel', 'Guía', 'Restaurante', 'Otros']

/**
 * Convierte cualquier fila (informe, cotización o pagos_proveedores) a formato único.
 */
export function normalizarLineaInforme(raw) {
  if (!raw || typeof raw !== 'object') return null
  const concepto = String(raw.concepto ?? raw.descripcion ?? 'Concepto').trim() || 'Concepto'
  const proveedor = String(raw.proveedor ?? raw.proveedor_nombre ?? '—').trim() || '—'
  const importe =
    parseFloat(raw.importe_real ?? raw.importe_pagado ?? raw.importe ?? 0) || 0
  return { concepto, proveedor, importe_real: +importe.toFixed(2) }
}

export function normalizarLineasInforme(lineas) {
  return (lineas || []).map(normalizarLineaInforme).filter(Boolean)
}

/**
 * Ingresos por fórmula de cotización; si da 0, usa totales persistidos en expediente.
 */
export function calcularTotalesInforme(lineasInforme, expedienteSeleccionado) {
  const lineas = normalizarLineasInforme(lineasInforme)
  const totalGastosReales = lineas.reduce((acc, l) => acc + (parseFloat(l.importe_real) || 0), 0)

  const exp = expedienteSeleccionado
  const paxPago = Math.max(1, parseInt(exp?.pax_pago || exp?.total_pax || 0, 10) || 0)
  const precioVenta = paxPago * (parseFloat(exp?.precio_venta_cliente || 0) || 0)
  const noches = Math.max(1, Number(exp?.noches) || 1)
  const totalSupHabitacion =
    (parseFloat(exp?.sup_individual_pax || 0) || 0) *
    (parseFloat(exp?.sup_individual_precio_dia || 0) || 0) *
    noches
  const totalSupSeguro =
    (parseFloat(exp?.sup_seguro_pax || 0) || 0) * (parseFloat(exp?.sup_seguro_precio_total || 0) || 0)
  const suplementosVal = totalSupHabitacion + totalSupSeguro
  const bonificaciones = (parseFloat(exp?.bonificacion_pax || 0) || 0) * paxPago
  const gratuidadesVal = Number(exp?.gratuidades_monetario || 0)
  let ingresosTotales = precioVenta + suplementosVal - (bonificaciones + gratuidadesVal)

  if (ingresosTotales <= 0) {
    ingresosTotales =
      Number(exp?.total_ingresos ?? exp?.cierre_grupo?.ingresos_totales ?? exp?.cierre_grupo?.total_ingresos ?? 0) ||
      0
  }

  const beneficioBruto = ingresosTotales - totalGastosReales
  const ivaPagado = beneficioBruto > 0 ? beneficioBruto * 0.21 : 0
  const beneficioNeto = beneficioBruto - ivaPagado

  return {
    totalGastosReales,
    ingresosTotales,
    totalFacturadoClientes: ingresosTotales,
    beneficioBruto,
    ivaPagado,
    beneficio: beneficioNeto,
  }
}

/**
 * Agrupa líneas normalizadas por categoría (según texto de concepto).
 */
export function agruparGastosPorCategoria(lineasNormalizadas) {
  const porCat = Object.fromEntries(CATEGORIAS_ORDEN.map((c) => [c, []]))
  for (const l of lineasNormalizadas) {
    const cat = categorizarPago(l.concepto)
    const key = porCat[cat] !== undefined ? cat : 'Otros'
    porCat[key].push(l)
  }
  return porCat
}

function lineasDesdeServiciosCotizacion(servicios) {
  return (servicios || []).map((s) => {
    const concepto =
      s.nombre_especifico ||
      s.nombre_servicio ||
      s.tipo_servicio ||
      s.tipo ||
      'Servicio sin nombre'
    const proveedor = s.nombre_proveedor_texto || s.nombre_proveedor_manual || ''
    let importeCotizado = 0
    if (s.total_servicio !== null && s.total_servicio !== undefined) {
      importeCotizado = Number(s.total_servicio) || 0
    } else {
      const coste = Number(s.coste_unitario) || 0
      const n = Number(s.noches) || 1
      const tipoCalculo = s.tipo_calculo || 'porPersona'
      importeCotizado = tipoCalculo === 'porGrupo' ? coste : coste * n
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

function lineasDesdePagosProveedores(rows) {
  return (rows || []).map((p) => ({
    id_pago: p.id,
    concepto: p.concepto?.trim() ? p.concepto : 'Pago a proveedor',
    proveedor: p.proveedor_nombre || '—',
    importe_real: +(parseFloat(p.importe_pagado) || 0).toFixed(2),
    importe_cotizado: +(parseFloat(p.importe_pagado) || 0).toFixed(2),
  }))
}

/**
 * 1) Líneas del informe guardado (Hacienda).
 * 2) Si no hay, cotización (servicios_cotizacion).
 * 3) Si sigue vacío, pagos_proveedores por expediente_id.
 */
export async function obtenerLineasInformeDesdeExpediente(supabaseClient, exp) {
  if (!exp?.id) return []

  if (exp?.informe_gastos_hacienda && Array.isArray(exp.informe_gastos_hacienda.lineas)) {
    const lineas = exp.informe_gastos_hacienda.lineas
    if (lineas.length > 0) return lineas
  }

  try {
    const { data, error } = await supabaseClient
      .from('servicios_cotizacion')
      .select(
        'id, tipo_servicio, tipo, nombre_especifico, nombre_servicio, nombre_proveedor_texto, nombre_proveedor_manual, proveedor_id_int, coste_unitario, noches, tipo_calculo, total_servicio'
      )
      .eq('id_expediente', exp.id)
      .order('id', { ascending: true })

    if (!error) {
      const servicios = Array.isArray(data) ? data : []
      const desdeCot = lineasDesdeServiciosCotizacion(servicios)
      if (desdeCot.length > 0) return desdeCot
    }
  } catch {
    /* continuar a pagos */
  }

  try {
    const { data: pagos, error: errPagos } = await supabaseClient
      .from('pagos_proveedores')
      .select('id, concepto, proveedor_nombre, importe_pagado, fecha_pago')
      .eq('expediente_id', exp.id)
      .order('fecha_pago', { ascending: true, nullsFirst: true })

    if (!errPagos && Array.isArray(pagos) && pagos.length > 0) {
      return lineasDesdePagosProveedores(pagos)
    }
  } catch {
    return []
  }

  return []
}

/** Salto de página si nos acercamos al borde inferior (altura ~280 en A4). */
function asegurarEspacio(doc, y, maxY = 272) {
  if (y <= maxY) return y
  doc.addPage()
  return 22
}

/**
 * Informe de cierre unificado: siempre encabezado, ingresos, desglose por categoría y resumen con IVA 21 %.
 */
export function crearJsPdfInformeCierre(expedienteSeleccionado, lineasInforme) {
  const exp = expedienteSeleccionado
  const lineasRaw = lineasInforme || []
  const lineas = normalizarLineasInforme(lineasRaw)
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  const rightX = pageWidth - margin

  const nombreGrupo = exp.nombre_grupo || exp.cliente_nombre || exp.destino || 'Sin nombre'
  const numExp = exp.numero_expediente || '—'
  const destino = exp.destino || '—'

  let y = 18
  doc.setFontSize(15)
  doc.setFont(undefined, 'bold')
  doc.text('Informe de Cierre', pageWidth / 2, y, { align: 'center' })
  y += 8
  doc.setFontSize(9)
  doc.setFont(undefined, 'normal')
  doc.setTextColor(80, 80, 80)
  doc.text('Documento para auditoría y gestoría — desglose de pagos a proveedores', pageWidth / 2, y, {
    align: 'center',
  })
  doc.setTextColor(0, 0, 0)
  y += 12

  doc.setFontSize(11)
  doc.setFont(undefined, 'bold')
  doc.text('Datos del expediente', margin, y)
  y += 7
  doc.setFont(undefined, 'normal')
  doc.setFontSize(10)
  doc.text(`Grupo / Cliente: ${nombreGrupo}`, margin, y)
  y += 6
  doc.text(`Destino: ${destino}`, margin, y)
  y += 6
  doc.text(`Número de expediente: ${numExp}`, margin, y)
  y += 10

  const totales = calcularTotalesInforme(lineas, exp)

  doc.setFont(undefined, 'bold')
  doc.setFontSize(11)
  doc.text('Ingresos', margin, y)
  y += 7
  doc.setFont(undefined, 'normal')
  doc.setFontSize(10)
  doc.text('Total ingresos', margin, y)
  doc.text(`${totales.ingresosTotales.toFixed(2)} €`, rightX, y, { align: 'right' })
  y += 10

  doc.setFont(undefined, 'bold')
  doc.setFontSize(11)
  doc.text('Desglose de pagos a proveedores', margin, y)
  y += 6
  doc.setFontSize(9)
  doc.setFont(undefined, 'normal')
  doc.setTextColor(90, 90, 90)
  doc.text('Agrupado por categoría (según concepto): Bus, Hotel, Guía, Restaurante, Otros.', margin, y, {
    maxWidth: pageWidth - 2 * margin,
  })
  doc.setTextColor(0, 0, 0)
  y += 8

  const porCat = agruparGastosPorCategoria(lineas)
  let hayAlgunaLinea = false

  for (const cat of CATEGORIAS_ORDEN) {
    const items = porCat[cat] || []
    if (items.length === 0) continue
    hayAlgunaLinea = true

    y = asegurarEspacio(doc, y, 268)
    doc.setFillColor(241, 245, 249)
    doc.rect(margin, y - 4, pageWidth - 2 * margin, 8, 'F')
    doc.setFont(undefined, 'bold')
    doc.setFontSize(10)
    doc.text(cat.toUpperCase(), margin + 2, y + 1)
    y += 10
    doc.setFont(undefined, 'normal')
    doc.setFontSize(9)

    for (const l of items) {
      y = asegurarEspacio(doc, y, 275)
      const proveedor = String(l.proveedor || '—')
      const importeStr = `${Number(l.importe_real || 0).toFixed(2)} €`
      const textoLinea = `${cat} — ${proveedor} — ${importeStr}`
      const lines = doc.splitTextToSize(textoLinea, pageWidth - 2 * margin - 4)
      for (const t of lines) {
        doc.text(t, margin + 3, y)
        y += 4.5
      }
      y += 1
    }
    y += 4
  }

  if (!hayAlgunaLinea) {
    y = asegurarEspacio(doc, y, 268)
    doc.setFont(undefined, 'italic')
    doc.setFontSize(9)
    doc.setTextColor(120, 120, 120)
    doc.text(
      'No hay líneas en cotización guardada ni en pagos a proveedores para este expediente.',
      margin,
      y,
      { maxWidth: pageWidth - 2 * margin }
    )
    doc.setTextColor(0, 0, 0)
    doc.setFont(undefined, 'normal')
    y += 12
  }

  y += 4
  y = asegurarEspacio(doc, y, 240)
  doc.setLineWidth(0.4)
  doc.line(margin, y, rightX, y)
  y += 8

  doc.setFontSize(11)
  doc.setFont(undefined, 'bold')
  doc.text('Resumen final', margin, y)
  y += 8
  doc.setFontSize(10)

  const fila = (label, valor, opts = {}) => {
    y = asegurarEspacio(doc, y, 275)
    doc.setFont(undefined, opts.bold ? 'bold' : 'normal')
    doc.text(label, margin, y)
    doc.text(valor, rightX, y, { align: 'right' })
    y += opts.gap ?? 6
  }

  doc.setFont(undefined, 'normal')
  fila('Total gastos (proveedores)', `${totales.totalGastosReales.toFixed(2)} €`)
  fila('Beneficio bruto (ingresos − gastos)', `${totales.beneficioBruto.toFixed(2)} €`)
  fila(
    'IVA e impuestos (21 % sobre beneficio bruto)',
    `${totales.ivaPagado.toFixed(2)} €`
  )
  doc.setFont(undefined, 'bold')
  fila('Beneficio neto final', `${totales.beneficio.toFixed(2)} €`, { bold: true, gap: 8 })

  return doc
}

export function nombreArchivoInformeCierrePdf(numeroExpediente) {
  const raw = String(numeroExpediente || 'SIN_NUM').replace(/[^a-zA-Z0-9_.-]/g, '_')
  return `Informe_Cierre_${raw}.pdf`
}
