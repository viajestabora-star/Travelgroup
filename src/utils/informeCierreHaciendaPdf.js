import jsPDF from 'jspdf'

/**
 * Misma fórmula que en Cierres.jsx (informe Hacienda / cierre).
 * Ingresos = (precio venta × pax pago + suplementos) − (bonificaciones + gratuidades monetarias).
 */
export function calcularTotalesInforme(lineasInforme, expedienteSeleccionado) {
  const totalGastosReales = (lineasInforme || []).reduce(
    (acc, l) => acc + (parseFloat(l.importe_real) || 0),
    0
  )

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
  const ingresosTotales = precioVenta + suplementosVal - (bonificaciones + gratuidadesVal)

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
 * Líneas del informe: informe guardado o derivadas de servicios_cotizacion (como Cierres.jsx).
 */
export async function obtenerLineasInformeDesdeExpediente(supabaseClient, exp) {
  if (exp?.informe_gastos_hacienda && Array.isArray(exp.informe_gastos_hacienda.lineas)) {
    return exp.informe_gastos_hacienda.lineas
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

    const servicios = Array.isArray(data) ? data : []

    return servicios.map((s) => {
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
  } catch {
    return []
  }
}

/**
 * PDF alineado con exportarInformeHaciendaPDF de Cierres.jsx.
 * Si no hay líneas, una página de resumen con totales persistidos en el expediente.
 */
export function crearJsPdfInformeCierre(expedienteSeleccionado, lineasInforme) {
  const exp = expedienteSeleccionado
  const lineas = lineasInforme || []
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()

  const nombreGrupo =
    exp.nombre_grupo || exp.cliente_nombre || exp.destino || 'Sin nombre'

  doc.setFontSize(16)
  doc.setFont(undefined, 'bold')
  doc.text('Informe de Cierre', pageWidth / 2, 20, { align: 'center' })

  doc.setFontSize(10)
  doc.setFont(undefined, 'normal')
  doc.text('(Ingresos, gastos y beneficio neto — documento para auditoría / gestoría)', pageWidth / 2, 28, {
    align: 'center',
  })

  doc.setFontSize(11)
  doc.text(`Expediente: ${exp.numero_expediente || '-'}`, 20, 40)
  doc.text(`Grupo / Cliente: ${nombreGrupo}`, 20, 46)
  if (exp.destino) {
    doc.text(`Destino: ${exp.destino}`, 20, 52)
  }

  if (lineas.length === 0) {
    const ing = Number(exp.total_ingresos ?? exp.cierre_grupo?.ingresos_totales ?? 0) || 0
    const gas = Number(exp.total_gastos_reales ?? exp.cierre_grupo?.gastos_totales ?? 0) || 0
    const ben =
      Number(
        exp.beneficio_neto_real ??
          exp.liquidacion_final_beneficio ??
          exp.cierre_grupo?.beneficio_limpio ??
          exp.cierre_grupo?.beneficio_neto ??
          ing - gas
      ) || 0

    let y = 68
    doc.setFontSize(11)
    doc.setFont(undefined, 'bold')
    doc.text('Resumen financiero', 20, y)
    y += 8
    doc.setFont(undefined, 'normal')
    doc.text(
      'No hay líneas de servicio en cotización ni informe guardado; se muestran totales del expediente.',
      20,
      y,
      { maxWidth: pageWidth - 40 }
    )
    y += 14
    doc.setFont(undefined, 'bold')
    doc.text('Ingresos totales:', 20, y)
    doc.text(`${ing.toFixed(2)} €`, pageWidth - 20, y, { align: 'right' })
    y += 8
    doc.text('Gastos reales:', 20, y)
    doc.text(`${gas.toFixed(2)} €`, pageWidth - 20, y, { align: 'right' })
    y += 8
    doc.text('Beneficio neto:', 20, y)
    doc.text(`${ben.toFixed(2)} €`, pageWidth - 20, y, { align: 'right' })
    return doc
  }

  const totales = calcularTotalesInforme(lineas, exp)
  const { totalGastosReales } = totales

  let y = 62
  doc.setFontSize(10)
  doc.setFont(undefined, 'bold')
  doc.text('Concepto', 20, y)
  doc.text('Proveedor', 80, y)
  doc.text('Importe Real (€)', pageWidth - 20, y, { align: 'right' })
  y += 4
  doc.setLineWidth(0.3)
  doc.line(20, y, pageWidth - 20, y)
  y += 6

  doc.setFont(undefined, 'normal')
  lineas.forEach((l) => {
    if (y > 260) {
      doc.addPage()
      y = 20
    }
    const concepto = String(l.concepto || '')
    const proveedor = String(l.proveedor || '')
    const importeReal = Number(l.importe_real || 0).toFixed(2)

    const conceptoLines = doc.splitTextToSize(concepto, 50)
    const proveedorLines = doc.splitTextToSize(proveedor, 50)
    const maxLines = Math.max(conceptoLines.length, proveedorLines.length)

    for (let i = 0; i < maxLines; i++) {
      const c = conceptoLines[i] || ''
      const p = proveedorLines[i] || ''
      doc.text(c, 20, y)
      doc.text(p, 80, y)
      if (i === 0) {
        doc.text(importeReal, pageWidth - 20, y, { align: 'right' })
      }
      y += 5
    }
    y += 2
  })

  y += 4
  doc.setLineWidth(0.3)
  doc.line(20, y, pageWidth - 20, y)
  y += 6

  doc.setFont(undefined, 'bold')
  doc.text('Total Gastos Reales:', 20, y)
  doc.text(`${totalGastosReales.toFixed(2)} €`, pageWidth - 20, y, { align: 'right' })
  y += 6

  doc.text('Ingresos Totales (cotización):', 20, y)
  doc.text(`${totales.ingresosTotales.toFixed(2)} €`, pageWidth - 20, y, { align: 'right' })
  y += 6

  doc.text('Beneficio Neto Final del Grupo:', 20, y)
  doc.text(`${totales.beneficio.toFixed(2)} €`, pageWidth - 20, y, { align: 'right' })

  return doc
}

export function nombreArchivoInformeCierrePdf(numeroExpediente) {
  const raw = String(numeroExpediente || 'SIN_NUM').replace(/[^a-zA-Z0-9_.-]/g, '_')
  return `Informe_Cierre_${raw}.pdf`
}
