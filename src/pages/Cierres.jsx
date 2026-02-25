import React, { useEffect, useMemo, useState } from 'react'
import {
  FileText,
  Eye,
  Receipt,
  TrendingUp,
  Search,
  User,
  Euro,
  CheckCircle2
} from 'lucide-react'
import { supabase } from '../supabase'
import jsPDF from 'jspdf'

// ===================== FUNCIÓN UNIFICADA DE GENERACIÓN DE PDF =====================
// Función compartida para generar PDFs de facturas con diseño profesional unificado
const generarFacturaPDFUnificado = async (factura) => {
  // Extraer datos de forma robusta desde cualquier fuente (facturas_emitidas_global o facturas)
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
  
  // Datos del emisor (Valservice Incoming S.L.)
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
    
    // Logo (si está disponible)
    if (logoImg) {
      try {
        doc.setFillColor(255, 255, 255)
        doc.rect(20, 15, 40, 15, 'F')
        doc.addImage(logoImg, 'PNG', 20, 15, 40, 15)
      } catch (e) {
      }
    }
    
    // Nº Expediente (EXP-XXXX) — prominente en cabecera de Factura oficial
    const numExp = factura?.numero_expediente || factura?.expediente_numero_expediente || factura?.datos_factura?.numero_expediente || factura?.datos_json?.numero_expediente || ''
    const numeroExpedienteFactura = numExp ? `EXP-${numExp}` : '—'
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
    
    // Dividir concepto en líneas si es muy largo
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
    
    // Nombre del archivo
    const nombreArchivo = `Factura_${numeroFactura}_${clienteNombre.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
    
    // Descargar PDF
    doc.save(nombreArchivo)
  }
  
  // Cargar logo
  const logo = new Image()
  logo.src = 'https://gtwyqxfkpdwpakmgrkbu.supabase.co/storage/v1/object/public/branding/Logo%20tabora%202023.png'
  logo.onload = () => {
    crearDocumento(logo)
  }
  logo.onerror = () => {
    // Intentar logo local
    const fallbackLogo = new Image()
    fallbackLogo.src = '/Logo tabora 2023.png'
    fallbackLogo.onload = () => {
      crearDocumento(fallbackLogo)
    }
    fallbackLogo.onerror = () => {
      // Generar sin logo
      crearDocumento(null)
    }
  }
}

const Cierres = ({ user, onClose }) => {
  const [tabActiva, setTabActiva] = useState('facturas')

  // Facturas ya emitidas (lectura unificada desde facturas_emitidas_global)
  const [facturas, setFacturas] = useState([])
  const [cargandoFacturas, setCargandoFacturas] = useState(false)

  // Facturación directa a clientes (sin expediente)
  const [clientes, setClientes] = useState([])
  const [cargandoClientes, setCargandoClientes] = useState(false)
  const [clienteSearch, setClienteSearch] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [importeTotalInput, setImporteTotalInput] = useState('')
  const [concepto, setConcepto] = useState('')
  const [aplicandoFacturaDirecta, setAplicandoFacturaDirecta] = useState(false)

  // ===================== ESTADO INFORME HACIENDA =====================
  const [expedientesCierre, setExpedientesCierre] = useState([])
  const [cargandoExpedientesCierre, setCargandoExpedientesCierre] = useState(false)
  const [expedienteSeleccionado, setExpedienteSeleccionado] = useState(null)
  const [lineasInforme, setLineasInforme] = useState([])
  const [guardandoInforme, setGuardandoInforme] = useState(false)

  useEffect(() => {
    if (tabActiva === 'facturas') {
      cargarFacturas()
      cargarClientes()
    }
    if (tabActiva === 'informe_hacienda') {
      cargarExpedientesCierre()
    }
  }, [tabActiva])

  // ===================== LECTURA FACTURAS (UNIFICADA + NORMALIZADA + ÚNICA) =====================
  // Historial dinámico: muestra facturas_emitidas_global ordenadas por fecha DESC
  // Se actualiza automáticamente al borrar filas en Supabase (refrescar página)
  const cargarFacturas = async () => {
    setCargandoFacturas(true)
    try {
      // 1) Lectura de facturas globales (facturas_emitidas_global) - FUENTE PRINCIPAL
      const { data: facturasGlobal, error: errorGlobal } = await supabase
        .from('facturas_emitidas_global')
        .select('*')
        .order('fecha_emision', { ascending: false })
      
      // 2) Lectura de facturas de expedientes normales (tabla facturas) - COMPLEMENTARIA
      const { data: facturasExpedientes, error: errorExpedientes } = await supabase
        .from('facturas')
        .select('*')
        .order('fecha_emision', { ascending: false })

      if (errorGlobal) {
      }
      if (errorExpedientes) {
      }

      const listaGlobal = Array.isArray(facturasGlobal) ? facturasGlobal : []
      const listaExpedientes = Array.isArray(facturasExpedientes) ? facturasExpedientes : []

      // 3) Normalización de ambas fuentes a un shape uniforme
      const normalizadasGlobal = listaGlobal.map((f) => {
        return {
          ...f,
          display_num: f.numero_factura || '',
          display_nombre: f.cliente_nombre || 'Sin nombre',
          display_doc: f.cliente_documento || '-',
          display_total: f.importe_total ?? 0
        }
      })

      const normalizadasExpedientes = listaExpedientes.map((f) => {
        return {
          ...f,
          display_num: f.numero_factura || '',
          display_nombre: f.nombre_receptor || 'Sin nombre',
          display_doc: f.cif_receptor || '-',
          display_total: f.total_factura ?? 0
        }
      })

      // 4) Unificación y eliminación de duplicados por numero_factura
      const porNumero = new Map()

      const candidatas = [...normalizadasGlobal, ...normalizadasExpedientes]

      const score = (f) => {
        let s = 0
        if (f.display_nombre && f.display_nombre !== 'Sin nombre') s++
        if (f.display_doc && f.display_doc !== '-') s++
        if (f.display_total && Number(f.display_total) !== 0) s++
        if (f.fecha_emision) s++
        return s
      }

      for (const f of candidatas) {
        const key = f.display_num || f.numero_factura || ''
        if (!key) {
          // Sin número: igualmente lo dejamos entrar con clave única artificial
          porNumero.set(`__NO_NUM__${Math.random().toString(36).slice(2)}`, f)
          continue
        }
        const existente = porNumero.get(key)
        if (!existente) {
          porNumero.set(key, f)
        } else {
          const sNuevo = score(f)
          const sViejo = score(existente)
          porNumero.set(key, sNuevo >= sViejo ? f : existente)
        }
      }

    const todasLasFacturas = Array.from(porNumero.values())

    // 5) Orden cronológico estricto por fecha_emision descendente (más nuevas primero)
    // Si no hay fecha, se colocan al final
    todasLasFacturas.sort((a, b) => {
      const fechaA = a.fecha_emision ? new Date(a.fecha_emision).getTime() : 0
      const fechaB = b.fecha_emision ? new Date(b.fecha_emision).getTime() : 0
      
      // Si ambas tienen fecha, ordenar descendente
      if (fechaA > 0 && fechaB > 0) {
        return fechaB - fechaA
      }
      // Si solo una tiene fecha, la que tiene fecha va primero
      if (fechaA > 0) return -1
      if (fechaB > 0) return 1
      // Si ninguna tiene fecha, mantener orden original
      return 0
    })


    setFacturas(todasLasFacturas)
    } catch (err) {
      setFacturas([])
    } finally {
      setCargandoFacturas(false)
    }
  }

  // ===================== CLIENTES PARA FACTURACIÓN DIRECTA =====================
  const cargarClientes = async () => {
    // Ya cargados: no recargar si ya tenemos datos
    if (clientes.length > 0) return

    setCargandoClientes(true)
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .order('nombre', { ascending: true })
      
      if (error) {
        alert(`Error cargando clientes: ${error.message}`)
        setClientes([])
        return
      }
      
      setClientes(data || [])
    } catch (err) {
      setClientes([])
    } finally {
      setCargandoClientes(false)
    }
  }

  const clientesFiltrados = useMemo(() => {
    const term = clienteSearch.trim().toLowerCase()
    if (!term) return []
    return clientes
      .filter((c) => (c.nombre || '').toLowerCase().includes(term))
      .slice(0, 20)
  }, [clientes, clienteSearch])

  const seleccionarCliente = (cliente) => {
    setClienteSeleccionado(cliente)
    setClienteSearch(cliente.nombre || '')
  }

  // ===================== CARGA EXPEDIENTES PARA INFORME HACIENDA =====================
  const cargarExpedientesCierre = async () => {
    if (expedientesCierre.length > 0) return
    setCargandoExpedientesCierre(true)
    try {
      const { data, error } = await supabase
        .from('expedientes')
        .select(
          'id, numero_expediente, nombre_grupo, cliente_nombre, destino, precio_venta_cliente, pax_pago, total_pax, gratuidades, bonificacion_pax, sup_individual_pax, sup_individual_precio_dia, sup_seguro_pax, sup_seguro_precio_total, noches, informe_gastos_hacienda, total_gastos_reales, liquidacion_final_beneficio, cierre_grupo'
        )
        .order('fecha_inicio', { ascending: true, nullsFirst: false })

      if (error) {
        setExpedientesCierre([])
        return
      }

      setExpedientesCierre(Array.isArray(data) ? data : [])
    } catch (err) {
      setExpedientesCierre([])
    } finally {
      setCargandoExpedientesCierre(false)
    }
  }

  // Lógica unificada: ingresosTotales = (precio_venta + suplementos) - (bonificaciones + gratuidades)
  // Beneficio Bruto = ingresosTotales - totalGastosReales | IVA (21%) | Beneficio Neto = Bruto - IVA
  const calcularTotalesInforme = useMemo(() => {
    const totalGastosReales = lineasInforme.reduce((acc, l) => acc + (parseFloat(l.importe_real) || 0), 0)

    const exp = expedienteSeleccionado
    const paxPago = Math.max(1, parseInt(exp?.pax_pago || exp?.total_pax || 0, 10) || 0)
    const precioVenta = paxPago * (parseFloat(exp?.precio_venta_cliente || 0) || 0)
    const noches = Math.max(1, Number(exp?.noches) || 1)
    const totalSupHabitacion = (parseFloat(exp?.sup_individual_pax || 0) || 0) * (parseFloat(exp?.sup_individual_precio_dia || 0) || 0) * noches
    const totalSupSeguro = (parseFloat(exp?.sup_seguro_pax || 0) || 0) * (parseFloat(exp?.sup_seguro_precio_total || 0) || 0)
    const suplementosVal = totalSupHabitacion + totalSupSeguro
    const bonificaciones = (parseFloat(exp?.bonificacion_pax || 0) || 0) * paxPago
    const gratuidadesVal = 0
    const ingresosTotales = (precioVenta + suplementosVal) - (bonificaciones + gratuidadesVal)

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
  }, [lineasInforme, expedienteSeleccionado])

  const cargarInformeParaExpediente = async (exp) => {
    setExpedienteSeleccionado(exp)

    // Si ya hay informe guardado, restaurar directamente
    if (exp.informe_gastos_hacienda && Array.isArray(exp.informe_gastos_hacienda.lineas)) {
      setLineasInforme(exp.informe_gastos_hacienda.lineas)
      return
    }

    try {
      const { data, error } = await supabase
        .from('servicios_cotizacion')
        .select(
          'id, tipo_servicio, tipo, nombre_especifico, nombre_servicio, nombre_proveedor_texto, nombre_proveedor_manual, proveedor_id_int, coste_unitario, noches, tipo_calculo, total_servicio'
        )
        .eq('id_expediente', exp.id)
        .order('id', { ascending: true })

      if (error) {
        setLineasInforme([])
        return
      }

      const servicios = Array.isArray(data) ? data : []

      const lineas = servicios.map((s) => {
        const concepto =
          s.nombre_especifico ||
          s.nombre_servicio ||
          s.tipo_servicio ||
          s.tipo ||
          'Servicio sin nombre'

        const proveedor =
          s.nombre_proveedor_texto ||
          s.nombre_proveedor_manual ||
          '' // se podría enriquecer con join a proveedores usando proveedor_id_int

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

      setLineasInforme(lineas)
    } catch (err) {
      setLineasInforme([])
    }
  }

  const actualizarLineaInforme = (index, campo, valor) => {
    setLineasInforme((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [campo]: campo === 'importe_real' ? Number(valor) || 0 : valor } : l))
    )
  }

  const guardarInformeHacienda = async () => {
    if (!expedienteSeleccionado) return
    if (!window.confirm('¿Estás seguro de que los importes reales coinciden con las facturas de proveedores?')) return

    setGuardandoInforme(true)
    try {
      const { totalGastosReales, ingresosTotales, beneficioBruto, ivaPagado, beneficio } = calcularTotalesInforme

      const payloadInforme = {
        lineas: lineasInforme,
        resumen: {
          total_gastos_reales: totalGastosReales,
          ingresos_totales: ingresosTotales,
          liquidacion_final_beneficio: beneficioBruto,
          iva_sobre_beneficio: ivaPagado,
          beneficio_neto_real: beneficio,
          updated_at: new Date().toISOString(),
        },
      }

      const { error } = await supabase
        .from('expedientes')
        .upsert(
          {
            id: expedienteSeleccionado.id,
            informe_gastos_hacienda: payloadInforme,
            total_gastos_reales: totalGastosReales,
            liquidacion_final_beneficio: beneficio,
          },
          { onConflict: 'id' }
        )

      if (error) {
        alert('Error guardando Informe Hacienda: ' + error.message)
        return
      }

      if (typeof onClose === 'function') onClose()
      alert('Éxito. Informe para Hacienda guardado correctamente.')
    } catch (err) {
      const detalle = err?.message || err?.toString?.() || JSON.stringify(err)
      alert('Error guardando Informe Hacienda:\n\n' + detalle)
    } finally {
      setGuardandoInforme(false)
    }
  }

  const exportarInformeHaciendaPDF = () => {
    if (!expedienteSeleccionado || lineasInforme.length === 0) {
      alert('Selecciona un expediente y asegúrate de que el informe tenga líneas.')
      return
    }

    const { totalGastosReales } = calcularTotalesInforme

    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()

    const nombreGrupo =
      expedienteSeleccionado.nombre_grupo ||
      expedienteSeleccionado.cliente_nombre ||
      expedienteSeleccionado.destino ||
      'Sin nombre'

    doc.setFontSize(16)
    doc.setFont(undefined, 'bold')
    doc.text('Informe de Gastos para Hacienda', pageWidth / 2, 20, { align: 'center' })

    doc.setFontSize(11)
    doc.setFont(undefined, 'normal')
    doc.text(`Expediente: ${expedienteSeleccionado.numero_expediente || '-'}`, 20, 32)
    doc.text(`Grupo / Cliente: ${nombreGrupo}`, 20, 38)
    if (expedienteSeleccionado.destino) {
      doc.text(`Destino: ${expedienteSeleccionado.destino}`, 20, 44)
    }

    let y = 56
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
    lineasInforme.forEach((l) => {
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
    doc.text(`${calcularTotalesInforme.ingresosTotales.toFixed(2)} €`, pageWidth - 20, y, { align: 'right' })
    y += 6

    doc.text('Beneficio Neto Final del Grupo:', 20, y)
    doc.text(`${calcularTotalesInforme.beneficio.toFixed(2)} €`, pageWidth - 20, y, { align: 'right' })

    const nombreArchivo = `Informe_Hacienda_${expedienteSeleccionado.numero_expediente || nombreGrupo}.pdf`
    doc.save(nombreArchivo.replace(/[^a-zA-Z0-9_.-]/g, '_'))
  }

  // ===================== GENERACIÓN NÚMERO DE FACTURA (ÚNICO Y GLOBAL) =====================
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
      }
      if (errorExpedientes) {
      }

      // 2) Unificar y encontrar el máximo número entre ambas tablas
      const todasLasFacturas = [
        ...(Array.isArray(dataGlobal) ? dataGlobal : []),
        ...(Array.isArray(dataExpedientes) ? dataExpedientes : []),
      ]

      const regexFactura = /^(\d{4})-(\d{1,4})$/ // AÑO-#### (4 dígitos, sin TEST)
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

      // 3) Si no hay facturas, iniciar numeración en AÑO-0001
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

  // ===================== FACTURACIÓN DIRECTA (CLIENTE SIN EXPEDIENTE) =====================
  const handleApplyFacturacionDirecta = async () => {
    if (!clienteSeleccionado) {
      alert('Por favor, selecciona un cliente de la lista.')
      return
    }
    
    const totalInput = parseFloat(String(importeTotalInput).replace(',', '.'))
    if (!totalInput || totalInput <= 0) {
      alert('Importe total no válido.')
      return
    }

    if (!concepto || concepto.trim().length < 3) {
      alert('Indica un concepto de factura más descriptivo.')
      return
    }

    setAplicandoFacturaDirecta(true)
    try {
      const numeroFactura = await obtenerSiguienteNumeroFactura()

      // El usuario introduce el TOTAL (IVA incluido). Sin desglose: estructura unificada como expedientes.
      const totalFactura = +totalInput.toFixed(2)

      const fechaEmisionISO = new Date().toISOString()

      const datos_json = {
        numero_factura: numeroFactura,
        tipo_factura: 'DIRECTA',
        fecha_emision: fechaEmisionISO,
        receptor: {
          nombre: clienteSeleccionado.nombre || '',
          cif_nif: clienteSeleccionado.cif_nif || clienteSeleccionado.cif || '',
          direccion: clienteSeleccionado.direccion || '',
          poblacion: clienteSeleccionado.poblacion || '',
          provincia: clienteSeleccionado.provincia || '',
          cp: clienteSeleccionado.codigo_postal || clienteSeleccionado.cp || '',
          telefono: clienteSeleccionado.movil || clienteSeleccionado.telefono || '',
          email: clienteSeleccionado.email || ''
        },
        concepto: concepto.trim(),
        calcularBaseFactura: {
          totalFactura: totalFactura.toFixed(2)
        }
      }

      // Validación robusta: asegurar que los campos críticos nunca estén vacíos
      const nombreCliente = String(clienteSeleccionado.nombre || '').trim()
      if (!nombreCliente) {
        alert('Error: El nombre del cliente no puede estar vacío.')
        return
      }

      const importeFinal = Number(totalFactura) || 0
      if (importeFinal <= 0) {
        alert('Error: El importe total debe ser mayor que cero.')
        return
      }

      const documentoCliente = String(
        clienteSeleccionado.cif_nif || clienteSeleccionado.cif || ''
      ).trim()

      const { error: errorInsert } = await supabase.from('facturas_emitidas_global').insert([
        {
          numero_factura: numeroFactura,
          cliente_nombre: nombreCliente,
          cliente_documento: documentoCliente || '',
          importe_total: importeFinal,
          fecha_emision: fechaEmisionISO,
          datos_json
        }
      ])

      if (errorInsert) {
        alert(`Error guardando factura directa: ${errorInsert.message}`)
        return
      }

      // Generar PDF básico inmediatamente (opcional pero profesional)
      try {
        const doc = new jsPDF()
        const pageWidth = doc.internal.pageSize.getWidth()
        
        doc.setFontSize(20)
        doc.setTextColor(33, 150, 243)
        doc.setFont(undefined, 'bold')
        doc.text(`FACTURA ${numeroFactura}`, pageWidth - 20, 25, { align: 'right' })
        
        let yPos = 50
        doc.setFontSize(12)
        doc.setFont(undefined, 'bold')
        doc.text('FACTURAR A:', 20, yPos)
        yPos += 8
        doc.setFontSize(10)
        doc.setFont(undefined, 'normal')
        doc.text(clienteSeleccionado.nombre || '-', 20, yPos)
        yPos += 6
        if (clienteSeleccionado.cif_nif || clienteSeleccionado.cif) {
          doc.text(
            `CIF/NIF: ${clienteSeleccionado.cif_nif || clienteSeleccionado.cif}`,
            20,
            yPos
          )
          yPos += 6
        }
        if (clienteSeleccionado.direccion) {
          doc.text(clienteSeleccionado.direccion, 20, yPos)
          yPos += 6
        }
        
        yPos += 10
        doc.setFontSize(12)
        doc.setFont(undefined, 'bold')
        doc.text('CONCEPTO:', 20, yPos)
        yPos += 8
        doc.setFontSize(10)
        doc.setFont(undefined, 'normal')
        doc.text(concepto.trim(), 20, yPos)
        yPos += 12

        doc.setFontSize(12)
        doc.setFont(undefined, 'bold')
        doc.text('TOTAL FACTURA (IVA INCLUIDO):', 20, yPos)
        doc.text(`${totalFactura.toFixed(2)}€`, pageWidth - 20, yPos, { align: 'right' })
        yPos += 10

        doc.setFontSize(7)
        doc.setFont(undefined, 'normal')
        doc.setTextColor(80, 80, 80)
        const clausulaLegal = 'Régimen especial de las agencias de viaje. El IVA ya está incluido en todos los conceptos especificados en esta factura, de acuerdo con lo señalado en el art 142 de la Ley 37/1992, de 28 de diciembre, del Impuesto sobre el Valor Añadido.'
        const lineasClausula = doc.splitTextToSize(clausulaLegal, pageWidth - 40)
        lineasClausula.forEach((linea) => {
          doc.text(linea, 20, yPos)
          yPos += 4
        })
        
        doc.save(`Factura_${numeroFactura}_Directa.pdf`)
      } catch (pdfError) {
      }

      alert(`✅ Factura directa ${numeroFactura} emitida correctamente`)

      // Reset formulario
      setImporteTotalInput('')
      setConcepto('')
      setClienteSeleccionado(null)
      setClienteSearch('')

      // Refrescar listado
      await cargarFacturas()
    } catch (err) {
      alert(`Error inesperado emitiendo factura directa: ${err.message}`)
    } finally {
      setAplicandoFacturaDirecta(false)
    }
  }

  // ===================== PDF: VISOR / REGENERADOR PARA CUALQUIER FACTURA =====================
  // Usa la función unificada de generación de PDF
  const verPDF = (factura) => {
    // Si hay URL de PDF, abrir directamente
    if (factura.url_pdf) {
      window.open(factura.url_pdf, '_blank')
      return
    }

    // SIEMPRE generar PDF desde los datos de la factura (el objeto completo tiene toda la info)
    // No hay validación de "si no hay datos" porque el botón solo aparece si hay factura
    generarFacturaPDFUnificado(factura)
  }

  const totalFacturado = useMemo(() => {
    if (!facturas || facturas.length === 0) return 0
    return facturas.reduce((acc, f) => {
      const total =
        f.display_total ??
        f.importe_total ??
        f.total_factura ??
        0
      return acc + (parseFloat(total) || 0)
    }, 0)
  }, [facturas])

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      {/* HEADER PRINCIPAL */}
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">
            Cierres &amp; Facturación
          </h1>
          <p className="text-slate-500 font-medium text-sm mt-1">
            Control global de facturas y cierres de ejercicio
          </p>
        </div>
      </div>

      {/* PESTAÑAS: FACTURAS / CIERRES (LIQUIDACIÓN) / INFORME HACIENDA */}
      <div className="mb-6 border-b border-slate-200">
        <div className="flex gap-1">
          {[
            { id: 'facturas', nombre: 'Facturas', icon: Receipt },
            { id: 'cierres', nombre: 'Cierres (Liquidación)', icon: TrendingUp },
            { id: 'informe_hacienda', nombre: 'Informe Hacienda', icon: FileText },
          ].map((tab) => {
            const Icon = tab.icon
            const isActive = tabActiva === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setTabActiva(tab.id)}
                className={`px-6 py-3 font-semibold transition-colors flex items-center gap-2 ${
                  isActive
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon size={18} />
                {tab.nombre}
              </button>
            )
          })}
        </div>
      </div>

      {/* ===================== TAB: FACTURAS ===================== */}
      {tabActiva === 'facturas' && (
        <div className="space-y-6">
          {/* BLOQUE FACTURACIÓN DIRECTA A CLIENTES */}
          <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-blue-50">
                  <User className="text-blue-600" size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Facturación directa a Cliente (sin expediente)
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Ideal para entidades como Arrancapins u otros clientes de cartera.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <CheckCircle2 className="text-emerald-500" size={16} />
                <span>Sincronizado con `facturas_emitidas_global`</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Selector de cliente con búsqueda */}
              <div className="md:col-span-1">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.18em] mb-2">
                  Cliente
                </label>
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300"
                    size={18}
                  />
                  <input
                    type="text"
                    value={clienteSearch}
                    onChange={(e) => {
                      setClienteSearch(e.target.value)
                      setClienteSeleccionado(null)
                    }}
                    placeholder="Buscar cliente (Arrancapins, Puzol, etc.)..."
                    className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                {cargandoClientes && (
                  <p className="text-xs text-slate-400 mt-1">Cargando clientes...</p>
                )}
                {clienteSearch && clientesFiltrados.length > 0 && (
                  <div className="mt-2 max-h-52 overflow-y-auto border border-slate-200 rounded-lg shadow-sm bg-white text-sm">
                    {(clientesFiltrados || []).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => seleccionarCliente(c)}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-slate-100 last:border-b-0"
                      >
                        <div className="font-semibold text-slate-900">{c.nombre}</div>
                        <div className="text-[11px] text-slate-500">
                          {c.poblacion} {c.provincia}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {clienteSearch && !cargandoClientes && clientesFiltrados.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    No se han encontrado clientes con ese nombre.
                  </p>
                )}
                {clienteSeleccionado && (
                  <div className="mt-3 p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-xs text-emerald-800">
                    Seleccionado: <strong>{clienteSeleccionado.nombre}</strong>
                    {clienteSeleccionado.cif_nif || clienteSeleccionado.cif ? (
                      <span className="ml-2">
                        · CIF/NIF: {clienteSeleccionado.cif_nif || clienteSeleccionado.cif}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Importe total (con IVA) + desglose automático */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.18em] mb-2">
                    Importe total (IVA incluido)
                  </label>
                  <div className="relative">
                    <Euro className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={importeTotalInput}
                      onChange={(e) => setImporteTotalInput(e.target.value)}
                      placeholder="0,00 (total factura)"
                      className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-600">
                  {(() => {
                    const totalInput = parseFloat(String(importeTotalInput).replace(',', '.')) || 0
                    return (
                      <div className="flex justify-between font-semibold text-slate-900">
                        <span>TOTAL FACTURA (IVA INCLUIDO):</span>
                        <span>{totalInput.toFixed(2)} €</span>
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* Concepto + BOTÓN APPLY */}
              <div className="flex flex-col justify-between gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.18em] mb-2">
                    Concepto
                  </label>
                  <textarea
                    rows={3}
                    value={concepto}
                    onChange={(e) => setConcepto(e.target.value)}
                    placeholder="Ej: Servicios de organización de viaje para el grupo Arrancapins."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                </div>
                <div className="flex justify-end mt-1">
                  {/* ✅ BOTÓN PRINCIPAL APPLY */}
                  <button
                    type="button"
                    onClick={handleApplyFacturacionDirecta}
                    disabled={aplicandoFacturaDirecta}
                    className="inline-flex items-center justify-center px-8 py-3 rounded-xl bg-slate-900 hover:bg-blue-700 text-white text-sm font-extrabold tracking-[0.25em] uppercase shadow-md transition disabled:bg-slate-400 disabled:cursor-not-allowed"
                  >
                    APPLY
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* LISTADO DE FACTURAS EMITIDAS */}
          <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <FileText className="text-slate-500" size={18} />
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-[0.2em]">
                  Facturas emitidas (facturas_emitidas_global)
                </h3>
              </div>
              <div className="text-xs text-slate-500 font-medium">
                Total facturado:{' '}
                <span className="font-semibold text-emerald-700">
                  {totalFacturado.toFixed(2)} €
                </span>
              </div>
            </div>

            {cargandoFacturas ? (
              <div className="py-10 text-center text-slate-500 text-sm">Cargando facturas...</div>
          ) : facturas.length === 0 ? (
              <div className="py-10 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
                <FileText className="text-slate-300" size={40} />
                <span>No hay facturas emitidas todavía.</span>
            </div>
          ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="px-6 py-3 text-xs font-black uppercase tracking-[0.2em] text-left">
                      Fecha emisión
                    </th>
                    <th className="px-6 py-3 text-xs font-black uppercase tracking-[0.2em] text-left">
                      Nº Factura
                    </th>
                    <th className="px-6 py-3 text-xs font-black uppercase tracking-[0.2em] text-left">
                      Cliente
                    </th>
                    <th className="px-6 py-3 text-xs font-black uppercase tracking-[0.2em] text-left">
                      Documento
                    </th>
                    <th className="px-6 py-3 text-xs font-black uppercase tracking-[0.2em] text-right">
                      Importe
                    </th>
                    <th className="px-6 py-3 text-xs font-black uppercase tracking-[0.2em] text-center">
                      PDF
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(facturas || []).map((factura) => (
                    <tr key={factura.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 text-slate-700">
                        {factura.fecha_emision 
                          ? new Date(factura.fecha_emision).toLocaleDateString('es-ES', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric'
                            })
                          : '-'}
                      </td>
                      <td className="px-6 py-3 font-semibold">
                        <span
                          className={
                            factura.cliente_nombre // heurística: registros de facturas_emitidas_global
                              ? 'text-emerald-700 font-extrabold'
                              : 'text-slate-900 font-semibold'
                          }
                        >
                          {factura.display_num || factura.numero_factura || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-700">
                        {factura.display_nombre ||
                          factura.cliente_nombre ||
                          factura.nombre_recep ||
                          'Sin nombre'}
                      </td>
                      <td className="px-6 py-3 text-slate-700">
                        {factura.display_doc ||
                          factura.cliente_documento ||
                          factura.cif_receptor ||
                          factura.datos_json?.receptor?.cif_nif ||
                          factura.datos_json?.receptor?.dni ||
                          '-'}
                      </td>
                      <td className="px-6 py-3 text-right font-bold text-emerald-700">
                        {(() => {
                          const total =
                            factura.display_total ??
                            factura.importe_total ??
                            factura.total_factura ??
                            0
                          return `${Number(total).toFixed(2)} €`
                        })()}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => verPDF(factura)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors"
                        >
                          <Eye size={14} />
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
            </div>
      )}

      {/* ===================== TAB: CIERRES (LIQUIDACIÓN) ===================== */}
      {tabActiva === 'cierres' && (
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
          <div className="p-8 text-center">
            <TrendingUp className="mx-auto text-slate-300 mb-4" size={56} />
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              Cierres de ejercicio y liquidación
            </h3>
            <p className="text-slate-500 text-sm max-w-xl mx-auto mb-6">
              Esta pestaña estará dedicada al cuadre de gastos/ingresos por expediente y a la
              liquidación fina para Hacienda.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-white">
              <tr>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-[0.2em] text-left">
                  Expediente / Grupo
                </th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-[0.2em] text-left">
                  Destino
                </th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-[0.2em] text-left">
                  Estado liquidación
                </th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-[0.2em] text-center">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colSpan={4}
                  className="px-6 py-12 text-center text-slate-500 text-sm bg-slate-50"
                >
                  El módulo de cierres y liquidación detallada se implementará en la siguiente
                  fase. De momento, toda la facturación está sincronizada contra{' '}
                  <span className="font-mono text-xs bg-slate-800 text-slate-100 px-2 py-1 rounded">
                    facturas_emitidas_global
                  </span>
                  .
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ===================== TAB: INFORME HACIENDA ===================== */}
      {tabActiva === 'informe_hacienda' && (
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Columna izquierda: Selector de expediente */}
            <div className="w-full lg:w-1/3 border-r border-slate-100 pr-0 lg:pr-6">
              <h3 className="text-sm font-black text-slate-500 uppercase tracking-[0.18em] mb-3">
                Expediente / Grupo
              </h3>
              {cargandoExpedientesCierre ? (
                <p className="text-sm text-slate-500">Cargando expedientes...</p>
              ) : expedientesCierre.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No se han encontrado expedientes en la base de datos.
                </p>
              ) : (
                <div className="h-[420px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/80">
                  {(expedientesCierre || []).map((exp) => {
                    const nombreGrupo =
                      exp.nombre_grupo || exp.cliente_nombre || exp.destino || 'Sin nombre'
                    const seleccionado = expedienteSeleccionado?.id === exp.id
                    return (
                      <button
                        key={exp.id}
                        type="button"
                        onClick={() => cargarInformeParaExpediente(exp)}
                        className={`w-full text-left px-4 py-3 border-b border-slate-200 text-xs lg:text-sm flex flex-col gap-1 transition-colors ${
                          seleccionado ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'bg-transparent'
                        }`}
                      >
                        <span className="font-bold text-slate-900">
                          {exp.numero_expediente || 'SIN Nº'} · {nombreGrupo}
                        </span>
                        {exp.destino && (
                          <span className="text-[11px] text-slate-500">{exp.destino}</span>
                        )}
                        {(typeof exp.liquidacion_final_beneficio === 'number' || (exp?.cierre_grupo && typeof (exp.cierre_grupo?.beneficio_limpio ?? exp.cierre_grupo?.beneficio ?? exp.cierre_grupo?.beneficio_neto) === 'number')) && (
                          <span
                            className={`text-[11px] font-semibold ${
                              (exp.liquidacion_final_beneficio ?? exp?.cierre_grupo?.beneficio_limpio ?? exp?.cierre_grupo?.beneficio ?? exp?.cierre_grupo?.beneficio_neto ?? 0) >= 0
                                ? 'text-emerald-600'
                                : 'text-red-600'
                            }`}
                          >
                            Beneficio: {(exp.liquidacion_final_beneficio ?? exp?.cierre_grupo?.beneficio_limpio ?? exp?.cierre_grupo?.beneficio ?? exp?.cierre_grupo?.beneficio_neto ?? 0).toFixed(2)} €
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
              {expedienteSeleccionado && (
                <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                  <p className="font-semibold text-slate-700">
                    Resumen del expediente seleccionado:
                  </p>
                  <p className="text-slate-600">
                    <span className="font-semibold">Ingresos Totales:</span>{' '}
                    {calcularTotalesInforme.ingresosTotales.toFixed(2)} €
                  </p>
                  <p className="text-slate-600">
                    <span className="font-semibold">Total Gastos Reales:</span>{' '}
                    {calcularTotalesInforme.totalGastosReales.toFixed(2)} €
                  </p>
                  <p
                    className={`text-slate-700 font-bold ${
                      calcularTotalesInforme.beneficio >= 0 ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    Beneficio Neto Grupo:{' '}
                    {calcularTotalesInforme.beneficio.toFixed(2)} €
                  </p>
                </div>
              )}
            </div>

            {/* Columna derecha: Tabla editable Informe Hacienda */}
            <div className="w-full lg:w-2/3">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-black text-slate-500 uppercase tracking-[0.18em] mb-1">
                    Informe para Hacienda
                  </h3>
                  {expedienteSeleccionado ? (
                    <p className="text-xs text-slate-500">
                      Expediente:{' '}
                      <span className="font-semibold">
                        {expedienteSeleccionado.numero_expediente || '-'}
                      </span>{' '}
                      · Grupo:{' '}
                      <span className="font-semibold">
                        {expedienteSeleccionado.nombre_grupo ||
                          expedienteSeleccionado.cliente_nombre ||
                          expedienteSeleccionado.destino ||
                          'Sin nombre'}
                      </span>
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400">
                      Selecciona un expediente a la izquierda para comenzar.
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={exportarInformeHaciendaPDF}
                    disabled={!expedienteSeleccionado || lineasInforme.length === 0}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <FileText size={14} />
                    Exportar PDF
                  </button>
                  <button
                    type="button"
                    onClick={guardarInformeHacienda}
                    disabled={!expedienteSeleccionado || lineasInforme.length === 0 || guardandoInforme}
                    className="px-6 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold uppercase tracking-[0.18em] hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {guardandoInforme ? 'Guardando...' : 'Guardar Informe'}
                  </button>
                </div>
              </div>

              {!expedienteSeleccionado ? (
                <div className="mt-6 p-10 text-center text-slate-400 text-sm bg-slate-50 rounded-2xl border border-slate-100">
                  Selecciona un expediente en la columna izquierda para cargar el Informe de Hacienda.
                </div>
              ) : lineasInforme.length === 0 ? (
                <div className="mt-6 p-10 text-center text-slate-400 text-sm bg-slate-50 rounded-2xl border border-slate-100">
                  No se han encontrado servicios para este expediente en{' '}
                  <code className="font-mono text-xs bg-slate-800 text-slate-100 px-2 py-1 rounded">
                    servicios_cotizacion
                  </code>
                  .
                </div>
              ) : (
                <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full text-xs lg:text-sm">
                    <thead className="bg-slate-900 text-white">
                      <tr>
                        <th className="px-4 py-3 text-left font-black uppercase tracking-[0.16em]">
                          Concepto
                        </th>
                        <th className="px-4 py-3 text-left font-black uppercase tracking-[0.16em]">
                          Proveedor
                        </th>
                        <th className="px-4 py-3 text-right font-black uppercase tracking-[0.16em]">
                          Importe Cotizado (€)
                        </th>
                        <th className="px-4 py-3 text-right font-black uppercase tracking-[0.16em]">
                          Importe Real (Factura) (€)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {(lineasInforme || []).map((l, index) => (
                        <tr key={index} className="hover:bg-slate-50">
                          <td className="px-4 py-3 align-top">
                            <div className="font-semibold text-slate-900">{l.concepto}</div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <input
                              type="text"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs lg:text-sm"
                              value={l.proveedor || ''}
                              onChange={(e) =>
                                actualizarLineaInforme(index, 'proveedor', e.target.value)
                              }
                            />
                          </td>
                          <td className="px-4 py-3 text-right align-top text-slate-500">
                            {Number(l.importe_cotizado || 0).toFixed(2)} €
                          </td>
                          <td className="px-4 py-3 text-right align-top">
                            <input
                              type="number"
                              step="0.01"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-right text-xs lg:text-sm"
                              value={l.importe_real}
                              onChange={(e) =>
                                actualizarLineaInforme(index, 'importe_real', e.target.value)
                              }
                            />
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-slate-50 border-t border-slate-200">
                        <td className="px-4 py-3 text-left font-bold text-slate-800" colSpan={3}>
                          Total Gastos Reales
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">
                          {calcularTotalesInforme.totalGastosReales.toFixed(2)} €
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Cierres
