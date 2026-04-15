import jsPDF from 'jspdf'
import {
  n as nCierre,
  leerTotalesCierreGrupo,
  sumarDesgloseGastosCierreGrupo,
  leerFinanzasCierreDesdeSoloCierreGrupo,
  cierreGrupoTieneFinanzasVerificadas,
} from './cierreGrupoFuenteVerdad'

/**
 * Categorización alineada con la ficha de expediente + Hotel y «Autobús» (conceptos reales en pagos_proveedores).
 * Exportada para imprimir / CSV / HTML en ExpedienteDetalle.
 */
export function categorizarPagoInformeCierre(concepto) {
  const c = String(concepto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (/bus|autobus|transporte/.test(c)) return 'Bus'
  if (/hotel|alojamiento|habitacion|hostal|pension/.test(c)) return 'Hotel'
  if (/restaurante|comida|catering|menu|menú/.test(c)) return 'Restaurante'
  if (/guia|guía/.test(c)) return 'Guía'
  return 'Otros'
}

/** Mismo orden visual que la ficha (con Hotel explícito). */
export const CATEGORIAS_INFORME_CIERRE_ORDEN = ['Bus', 'Hotel', 'Restaurante', 'Guía', 'Otros']

// ─── Líneas Hacienda / cotización (Cierres.jsx) ─────────────────────────────

const n = (v) => {
  const num = Number(v ?? 0)
  return Number.isFinite(num) ? num : 0
}

export function normalizarLineaInforme(raw) {
  if (!raw || typeof raw !== 'object') return null
  const c = String(raw.concepto ?? raw.descripcion ?? '').trim()
  const concepto = c || 'Servicio sin nombre'
  const proveedor = String(raw.proveedor ?? raw.proveedor_nombre ?? '—').trim() || '—'
  const importe = parseFloat(raw.importe_real ?? raw.importe_pagado ?? raw.importe ?? 0) || 0
  return { concepto, proveedor, importe_real: +importe.toFixed(2) }
}

export function normalizarLineasInforme(lineas) {
  return (lineas || []).map(normalizarLineaInforme).filter(Boolean)
}

export function calcularTotalesInforme(lineasInforme, expedienteSeleccionado) {
  const exp = expedienteSeleccionado
  const cg = exp?.cierre_grupo
  const tieneCierre = cierreGrupoTieneFinanzasVerificadas(cg)

  const lineas = normalizarLineasInforme(lineasInforme)
  const totalGastosDesdeLineasEditor = lineas.reduce((acc, l) => acc + n(l.importe_real), 0)

  if (tieneCierre) {
    const f = leerFinanzasCierreDesdeSoloCierreGrupo(cg)
    const gastosDesgloseCierre = sumarDesgloseGastosCierreGrupo(cg)
    const totalGastosReales =
      gastosDesgloseCierre > 0 ? gastosDesgloseCierre : f.gastos_totales
    return {
      totalGastosReales,
      ingresosTotales: f.ingresos_totales,
      totalFacturadoClientes: f.ingresos_totales,
      beneficioBruto: f.beneficio_bruto,
      ivaPagado: f.iva_pagado,
      beneficio: f.beneficio_limpio,
    }
  }

  const totalGastosReales = totalGastosDesdeLineasEditor
  const paxPago = Math.max(1, parseInt(exp?.pax_pago || exp?.total_pax || 0, 10) || 0)
  const precioVenta = paxPago * n(exp?.precio_venta_cliente)
  const noches = Math.max(1, Number(exp?.noches) || 1)
  const totalSupHabitacion =
    n(exp?.sup_individual_pax) * n(exp?.sup_individual_precio_dia) * noches
  const totalSupSeguro = n(exp?.sup_seguro_pax) * n(exp?.sup_seguro_precio_total)
  const suplementosVal = totalSupHabitacion + totalSupSeguro
  const bonificaciones = n(exp?.bonificacion_pax) * paxPago
  const gratuidadesVal = Number(exp?.gratuidades_monetario || 0)
  let ingresosTotales = precioVenta + suplementosVal - (bonificaciones + gratuidadesVal)

  if (ingresosTotales <= 0) {
    ingresosTotales = n(exp?.total_ingresos)
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

/** Payload para el PDF idéntico al desglose del cierre (cada línea de coste_real; totales desde `totales` / JSON). */
export function payloadDesdeCierreGrupo(expediente) {
  const cg = expediente?.cierre_grupo
  if (!cierreGrupoTieneFinanzasVerificadas(cg)) return null

  const costesReales = Array.isArray(cg.costesReales)
    ? cg.costesReales.map((c) => ({
        concepto: c.concepto || '—',
        proveedor: c.proveedor || '—',
        coste_real: nCierre(c.coste_real),
      }))
    : []
  const gastosImprevistos = Array.isArray(cg.gastosImprevistos) ? cg.gastosImprevistos : []

  const sumaLineas = sumarDesgloseGastosCierreGrupo({ ...cg, costesReales, gastosImprevistos })
  const t = leerTotalesCierreGrupo(cg)

  const gastosTotales = sumaLineas > 0 ? sumaLineas : t.gastos_totales
  const ingresosTotales = t.ingresos_totales
  const ivaPagado = t.iva_pagado
  const beneficioNetoReal = t.beneficio_limpio
  const beneficioBruto = t.beneficio_bruto

  return {
    grupo: expediente.nombre_grupo || expediente.cliente_nombre || 'Sin grupo',
    viaje: expediente.destino || 'Sin destino',
    numeroExpediente: expediente.numero_expediente,
    ingresosTotales,
    gastosTotales,
    beneficioBruto,
    ivaPagado,
    beneficioNetoReal,
    costesReales,
    gastosImprevistos,
  }
}

/** Pestaña Informe Hacienda (Cierres.jsx): si hay cierre verificado, mismo payload que la ficha; si no, líneas editadas. */
export function payloadDesdeLineasHacienda(expedienteSeleccionado, lineasInforme) {
  const desdeCierre = payloadDesdeCierreGrupo(expedienteSeleccionado)
  if (desdeCierre) return desdeCierre

  const lineas = normalizarLineasInforme(lineasInforme)
  const costesReales = lineas.map((l) => ({
    concepto: l.concepto,
    proveedor: l.proveedor,
    coste_real: l.importe_real,
  }))
  const t = calcularTotalesInforme(lineas, expedienteSeleccionado)
  return {
    grupo:
      expedienteSeleccionado.nombre_grupo ||
      expedienteSeleccionado.cliente_nombre ||
      'Sin grupo',
    viaje: expedienteSeleccionado.destino || 'Sin destino',
    numeroExpediente: expedienteSeleccionado.numero_expediente,
    ingresosTotales: t.ingresosTotales,
    gastosTotales: t.totalGastosReales,
    beneficioBruto: t.beneficioBruto,
    ivaPagado: t.ivaPagado,
    beneficioNetoReal: t.beneficio,
    costesReales,
    gastosImprevistos: [],
  }
}

/**
 * PDF idéntico al de ExpedienteDetalle → generarInformeLiquidacionPDF (ficha individual).
 */
export function crearJsPdfInformeCierreFinanciero(payload) {
  if (!payload) {
    return new jsPDF()
  }

  const {
    grupo,
    viaje,
    numeroExpediente,
    ingresosTotales,
    gastosTotales,
    beneficioBruto,
    ivaPagado,
    beneficioNetoReal,
    costesReales,
    gastosImprevistos = [],
  } = payload

  const porCategoria = Object.fromEntries(CATEGORIAS_INFORME_CIERRE_ORDEN.map((k) => [k, []]))
  ;(costesReales || []).forEach((c) => {
    const cat = categorizarPagoInformeCierre(c.concepto)
    const key = porCategoria[cat] !== undefined ? cat : 'Otros'
    porCategoria[key].push(c)
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
  y += 6
  if (numeroExpediente) {
    doc.text(`N.º Expediente: ${numeroExpediente}`, 20, y)
    y += 6
  }
  y += 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(30, 41, 59)
  doc.text('TOTAL INGRESOS', 20, y)
  doc.text(`${Number(ingresosTotales).toFixed(2)} €`, pageW - 20, y, { align: 'right' })
  y += 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Desglose de pagos a proveedores', 20, y)
  y += 8

  CATEGORIAS_INFORME_CIERRE_ORDEN.forEach((cat) => {
    const items = porCategoria[cat]
    if (items.length === 0) return
    const subtotal = items.reduce((s, c) => s + n(c.coste_real), 0)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(51, 65, 85)
    doc.text(`${cat}`, 25, y)
    doc.text(`${subtotal.toFixed(2)} €`, pageW - 25, y, { align: 'right' })
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(100, 116, 139)
    items.forEach((c) => {
      if (y > 270) {
        doc.addPage()
        y = 20
      }
      const linea = `  ${(c.concepto || '—').substring(0, 50)} | ${(c.proveedor || '—').substring(0, 25)}`
      doc.text(linea, 25, y)
      doc.text(`${n(c.coste_real).toFixed(2)} €`, pageW - 25, y, { align: 'right' })
      y += 4
    })
    y += 2
  })

  if (gastosImprevistos.length > 0) {
    if (y > 260) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('Gastos imprevistos', 25, y)
    y += 5
    const totalImp = gastosImprevistos.reduce((s, g) => s + n(g.importe), 0)
    doc.text(`${totalImp.toFixed(2)} €`, pageW - 25, y - 5, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    gastosImprevistos.forEach((g) => {
      doc.text(`  ${(g.concepto || '—').substring(0, 60)}`, 25, y)
      doc.text(`${n(g.importe).toFixed(2)} €`, pageW - 25, y, { align: 'right' })
      y += 4
    })
    y += 4
  }

  if (
    (!costesReales || costesReales.length === 0) &&
    (!gastosImprevistos || gastosImprevistos.length === 0)
  ) {
    if (y > 260) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.text('Sin líneas de pago a proveedores registradas.', 25, y)
    doc.setTextColor(0, 0, 0)
    y += 10
  }

  y += 6
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.5)
  doc.line(20, y, pageW - 20, y)
  y += 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('TOTAL GASTOS', 20, y)
  doc.text(`${Number(gastosTotales).toFixed(2)} €`, pageW - 20, y, { align: 'right' })
  y += 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Beneficio Bruto', 20, y)
  doc.text(`${Number(beneficioBruto).toFixed(2)} €`, pageW - 20, y, { align: 'right' })
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('IVA (21%): impuesto restado', 20, y)
  doc.text(`− ${Number(ivaPagado).toFixed(2)} €`, pageW - 20, y, { align: 'right' })
  y += 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(16, 185, 129)
  doc.text('BENEFICIO NETO REAL', 20, y)
  doc.text(`${Number(beneficioNetoReal).toFixed(2)} €`, pageW - 20, y, { align: 'right' })
  doc.setTextColor(0, 0, 0)

  return doc
}

/** Compatibilidad Cierres.jsx (líneas del informe Hacienda). */
export function crearJsPdfInformeCierre(expedienteSeleccionado, lineasInforme) {
  const payload = payloadDesdeLineasHacienda(expedienteSeleccionado, lineasInforme)
  return crearJsPdfInformeCierreFinanciero(payload)
}

export function nombreArchivoInformeCierrePdf(numeroExpediente) {
  const raw = String(numeroExpediente || 'SIN_NUM').replace(/[^a-zA-Z0-9_.-]/g, '_')
  return `Informe_Cierre_${raw}.pdf`
}
