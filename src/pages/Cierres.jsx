import React, { useEffect, useMemo, useState } from 'react'
import { esUsuarioGestoria } from '../utils/userRoles'
import {
  FileText,
  Eye,
  FileDown,
  Receipt,
  TrendingUp,
  Search,
  User,
  Euro,
  CheckCircle2,
  RefreshCw
} from 'lucide-react'
import { supabase } from '../supabase'
import jsPDF from 'jspdf'
import { DATOS_EMISOR } from '../config/empresa'
import { cargarDatosEmisorEmpresa } from '../utils/datosEmisorEmpresa'
import {
  calcularTotalesInforme as computeTotalesInforme,
  crearJsPdfInformeCierre,
  nombreArchivoInformeCierrePdf,
} from '../utils/informeCierreHaciendaPdf'
import { obtenerLineasInformeComoCierres } from '../utils/lineasInformeCierres'
import { finanzasExpedienteParaInformes } from '../utils/cierreGrupoFuenteVerdad'
import VisualizadorPro from '../components/VisualizadorPro'
import { getNextInvoiceNumber } from '../utils/facturaNumeracion'
import { getEjercicioActual } from '../utils/ejercicioGlobal'

// ===================== FUNCIÓN UNIFICADA DE GENERACIÓN DE PDF =====================
// Función compartida para generar PDFs de facturas con diseño profesional unificado
const generarFacturaPDFUnificado = async (factura, emisorOpts = {}, opciones = {}) => {
  // Extraer datos de forma robusta desde cualquier fuente (facturas o facturas)
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
  
  const datosEmisor = emisorOpts.emisor || DATOS_EMISOR
  
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
    doc.text(datosEmisor.telefono ? `Tel: ${datosEmisor.telefono} | Email: ${datosEmisor.email}` : `Email: ${datosEmisor.email}`, 20, yPos)
    yPos += 6
    doc.text(datosEmisor.banco1, 20, yPos)
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
      // Fallback: reconstruir desde calc
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

    yPos += 6
    doc.setFontSize(8)
    doc.setTextColor(100, 100, 100)
    doc.setFont(undefined, 'italic')
    doc.text('Régimen Especial de Agencias de Viajes - IVA incluido', 20, yPos)
    yPos += 8
    
    // Totales
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
    doc.text(datosEmisor.nombre, 20, footerY)
    doc.text(`CIF: ${datosEmisor.cif} | Licencia: ${datosEmisor.licencia}`, 20, footerY + 6)
    doc.text(datosEmisor.direccion, 20, footerY + 12)
    doc.text(datosEmisor.banco1, 20, footerY + 18)
    doc.text(datosEmisor.banco2, 20, footerY + 24)
    
    // Nombre del archivo
    const nombreArchivo = `Factura_${numeroFactura}_${clienteNombre.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
    
    if (opciones.mode === 'download') {
      doc.save(nombreArchivo)
    }
    return {
      blobUrl: doc.output('bloburl'),
      nombreArchivo,
    }
  }
  
  // Cargar logo dinámico desde emisorOpts, con fallback sin imagen
  const logoSrc = emisorOpts.logoSrc || null
  return await new Promise((resolve) => {
    if (logoSrc) {
      const logo = new Image()
      logo.crossOrigin = 'anonymous'
      logo.src = logoSrc
      logo.onload = () => resolve(crearDocumento(logo))
      logo.onerror = () => resolve(crearDocumento(null))
    } else {
      resolve(crearDocumento(null))
    }
  })
}

const Cierres = ({ user, onClose }) => {
  const esGestoria = esUsuarioGestoria(user)
  const [tabActiva, setTabActiva] = useState('facturas')
  const [visualizadorOpen, setVisualizadorOpen] = useState(false)
  const [visualizadorSrc, setVisualizadorSrc] = useState(null)
  const [visualizadorTitulo, setVisualizadorTitulo] = useState('Documento')
  const [visualizadorDownloadName, setVisualizadorDownloadName] = useState('documento.pdf')

  // Emisor dinámico: datos fiscales de la empresa actual (para PDFs de facturas)
  const [emisorData, setEmisorData] = useState({ ...DATOS_EMISOR, logo_url: null })
  useEffect(() => {
    const empresaId = Number(user?.empresa_id) || null
    if (!empresaId) return
    cargarDatosEmisorEmpresa(empresaId).then(setEmisorData).catch(() => {})
  }, [user?.empresa_id])

  // Facturas ya emitidas (lectura unificada desde facturas)
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

  // ===================== LECTURA FACTURAS (FUENTE ÚNICA: public.facturas) =====================
  // Lista sincronizada solo con la tabla `facturas` para evitar registros obsoletos
  // provenientes de tablas auxiliares.
  const cargarFacturas = async () => {
    setCargandoFacturas(true)
    try {
      // Query mínima para evitar fallos por columnas opcionales/ausentes en ORDER BY.
      const { data, error } = await supabase
        .from('facturas')
        .select('*')

      console.log('DATOS_RECIBIDOS:', data)
      console.error('ERROR_RECUPERACION:', error)

      if (error) {
        setFacturas([])
        return
      }

      const normalizadas = (Array.isArray(data) ? data : []).map((f) => ({
        ...f,
        _origen: 'facturas',
        display_num: f.numero_factura || '',
        display_nombre: f.nombre_receptor || 'Sin nombre',
        display_doc: f.cif_receptor || '-',
        display_total: f.total_factura ?? 0,
      }))

      setFacturas(normalizadas)
    } catch (err) {
      setFacturas([])
    } finally {
      setCargandoFacturas(false)
    }
  }

  useEffect(() => {
    if (tabActiva !== 'facturas') return

    const channel = supabase
      .channel('facturas-sync-cierres')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'facturas' },
        () => {
          cargarFacturas()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tabActiva])

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

  // Lógica unificada: ver computeTotalesInforme en ../utils/informeCierreHaciendaPdf.js
  const calcularTotalesInforme = useMemo(
    () => computeTotalesInforme(lineasInforme, expedienteSeleccionado),
    [lineasInforme, expedienteSeleccionado]
  )

  const cargarInformeParaExpediente = async (exp) => {
    setExpedienteSeleccionado(exp)
    const lineas = await obtenerLineasInformeComoCierres(supabase, exp, { preferPagosPrimero: false })
    setLineasInforme(lineas)
  }

  const actualizarLineaInforme = (index, campo, valor) => {
    setLineasInforme((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [campo]: campo === 'importe_real' ? Number(valor) || 0 : valor } : l))
    )
  }

  const guardarInformeHacienda = async () => {
    if (!expedienteSeleccionado) return
    if (!window.confirm('¿Estás seguro de que quieres cerrar este expediente? Se actualizarán los registros financieros de forma permanente.')) return
    if (!window.confirm('¿Estás seguro de que los importes reales coinciden con las facturas de proveedores?')) return

    setGuardandoInforme(true)
    try {
      const idExpedienteLimpio = String(expedienteSeleccionado.id);

      const { totalGastosReales, ingresosTotales, beneficioBruto, ivaPagado, beneficio } = calcularTotalesInforme

      const lineasLimpias = lineasInforme.map((l) => ({
        id_servicio: l.id_servicio,
        concepto: l.concepto || '',
        proveedor: l.proveedor || '',
        importe_cotizado: Number(l.importe_cotizado) || 0,
        importe_real: Number(l.importe_real) || 0,
      }))

      const payloadInforme = {
        lineas: lineasLimpias,
        resumen: {
          total_gastos_reales: totalGastosReales,
          ingresos_totales: ingresosTotales,
          liquidacion_final_beneficio: beneficio,
          iva_sobre_beneficio: ivaPagado,
          beneficio_neto_real: beneficio,
          updated_at: new Date().toISOString(),
        },
      }

      const ingresosVal = Number(ingresosTotales);
      const gastosVal = Number(totalGastosReales);
      const beneficioVal = Number(beneficio);
      const ivaVal = Number(ivaPagado);

      const { error } = await supabase
        .from('expedientes')
        .update({
          total_ingresos: ingresosVal,
          total_gastos_reales: gastosVal,
          beneficio_neto_real: beneficioVal,
          liquidacion_final_beneficio: beneficioVal,
          cuota_iva: ivaVal,
          estado: 'Cerrado',
          informe_gastos_hacienda: payloadInforme
        })
        .eq('id', idExpedienteLimpio);

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
    if (!expedienteSeleccionado) {
      alert('Selecciona un expediente.')
      return
    }
    const doc = crearJsPdfInformeCierre(expedienteSeleccionado, lineasInforme)
    doc.save(
      nombreArchivoInformeCierrePdf(
        expedienteSeleccionado.numero_expediente ||
          expedienteSeleccionado.nombre_grupo ||
          expedienteSeleccionado.cliente_nombre
      )
    )
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
      const totalFactura = +totalInput.toFixed(2)
      const fechaEmisionISO = new Date().toISOString()

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

      const añoEjercicio = getEjercicioActual()
      const MAX_INTENTOS_NUMERO = 5
      let numeroFactura = ''

      for (let intento = 0; intento < MAX_INTENTOS_NUMERO; intento++) {
        let n = await getNextInvoiceNumber(supabase, añoEjercicio)
        await new Promise((r) => setTimeout(r, 1))
        n = await getNextInvoiceNumber(supabase, añoEjercicio)
        numeroFactura = String(n || '').trim()
        if (!numeroFactura) {
          alert('No se pudo obtener un número de factura válido.')
          return
        }

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
            email: clienteSeleccionado.email || '',
          },
          concepto: concepto.trim(),
          calcularBaseFactura: {
            totalFactura: totalFactura.toFixed(2),
          },
        }

        const registroGlobal = {
          numero_factura: numeroFactura,
          cliente_nombre: nombreCliente,
          cliente_documento: documentoCliente || '',
          importe_total: importeFinal,
          fecha_emision: fechaEmisionISO,
          datos_json,
        }

        const { error: errorGlobal } = await supabase.from('facturas_emitidas_global').insert([registroGlobal])
        if (!errorGlobal) {
          const registroEmitidas = {
            expediente_id: null,
            numero_factura: numeroFactura,
            cliente_nombre: nombreCliente,
            importe_total: importeFinal,
            datos_factura: datos_json,
            url_pdf: null,
          }
          const { error: errorEmitidas } = await supabase.from('facturas_emitidas').insert([registroEmitidas])
          if (errorEmitidas) {
            // No bloquear: la factura ya está en global; emitidas puede fallar por schema
          }
          break
        }

        if (errorGlobal.code === '23505' && intento < MAX_INTENTOS_NUMERO - 1) continue
        alert(`Error guardando factura directa: ${errorGlobal.message}`)
        return
      }

      if (!numeroFactura) {
        return
      }

      // Generar PDF básico inmediatamente (opcional pero profesional)
      try {
        const doc = new jsPDF()
        const pageWidth = doc.internal.pageSize.getWidth()
        const pageHeight = doc.internal.pageSize.getHeight()
        
        doc.setFontSize(20)
        doc.setTextColor(33, 150, 243)
        doc.setFont(undefined, 'bold')
        doc.text(`FACTURA ${numeroFactura}`, pageWidth - 20, 25, { align: 'right' })
        
        let yPos = 40
        doc.setFontSize(10)
        doc.setFont(undefined, 'normal')
        doc.setTextColor(0, 0, 0)
        doc.text(datosEmisor.nombre, 20, yPos)
        yPos += 5
        doc.text(`CIF: ${datosEmisor.cif} | Licencia: ${datosEmisor.licencia}`, 20, yPos)
        yPos += 5
        doc.text(datosEmisor.direccion, 20, yPos)
        yPos += 5
        doc.text(datosEmisor.telefono ? `Tel: ${datosEmisor.telefono} | ${datosEmisor.email}` : datosEmisor.email, 20, yPos)
        yPos += 5
        doc.text(datosEmisor.banco1, 20, yPos)
        yPos += 5
        doc.text(datosEmisor.banco2, 20, yPos)
        yPos += 15
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
  const verPDF = async (factura) => {
    // Si hay URL de PDF, abrir directamente
    if (factura.url_pdf) {
      setVisualizadorSrc(factura.url_pdf)
      setVisualizadorTitulo(`Factura ${factura.display_num || factura.numero_factura || ''}`.trim())
      setVisualizadorDownloadName(`Factura_${factura.display_num || factura.numero_factura || 'documento'}.pdf`)
      setVisualizadorOpen(true)
      return
    }

    // Normalizar: asegurar datos_factura para que el PDF tenga acceso al desglose (lineasFactura)
    const facturaNormalizada = {
      ...factura,
      datos_factura: factura.datos_factura || factura.datos_json || factura.datosFactura
    }

    const resultado = await generarFacturaPDFUnificado(
      facturaNormalizada,
      { emisor: emisorData, logoSrc: emisorData.logo_url },
      { mode: 'viewer' }
    )
    if (resultado?.blobUrl) {
      setVisualizadorSrc(resultado.blobUrl)
      setVisualizadorTitulo(`Factura ${factura.display_num || factura.numero_factura || ''}`.trim())
      setVisualizadorDownloadName(resultado.nombreArchivo || 'Factura.pdf')
      setVisualizadorOpen(true)
    }
  }

  const descargarPDF = async (factura) => {
    if (factura.url_pdf) {
      window.open(factura.url_pdf, '_blank')
      return
    }
    const facturaNormalizada = {
      ...factura,
      datos_factura: factura.datos_factura || factura.datos_json || factura.datosFactura,
    }
    await generarFacturaPDFUnificado(
      facturaNormalizada,
      { emisor: emisorData, logoSrc: emisorData.logo_url },
      { mode: 'download' }
    )
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
            Facturación
          </h1>
          <p className="text-slate-500 font-medium text-sm mt-1">
            {esGestoria
              ? 'Vista de solo lectura — facturas y cierres de ejercicio'
              : 'Control global de facturas y cierres de ejercicio'}
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
                <span>Sincronizado con `facturas`</span>
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
                {!esGestoria && (
                  <div className="flex justify-end mt-1">
                    <button
                      type="button"
                      onClick={handleApplyFacturacionDirecta}
                      disabled={aplicandoFacturaDirecta}
                      className="inline-flex items-center justify-center px-8 py-3 rounded-xl bg-slate-900 hover:bg-blue-700 text-white text-sm font-extrabold tracking-[0.25em] uppercase shadow-md transition disabled:bg-slate-400 disabled:cursor-not-allowed"
                    >
                      APPLY
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* LISTADO DE FACTURAS EMITIDAS */}
          <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <FileText className="text-slate-500" size={18} />
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-[0.2em]">
                  Facturas emitidas (tabla facturas)
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-xs text-slate-500 font-medium">
                  Total facturado:{' '}
                  <span className="font-semibold text-emerald-700">
                    {totalFacturado.toFixed(2)} €
                  </span>
                </div>
                <button
                  type="button"
                  onClick={cargarFacturas}
                  disabled={cargandoFacturas}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  <RefreshCw size={12} className={cargandoFacturas ? 'animate-spin' : ''} />
                  Actualizar
                </button>
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
                  {(facturas || []).map((factura, idx) => (
                    <tr key={factura.id ?? `factura-${factura.numero_factura || factura.display_num}-${idx}`} className="hover:bg-slate-50 transition-colors">
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
                            factura.cliente_nombre // heurística: registros de facturas
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
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => verPDF(factura)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors"
                          >
                            <Eye size={14} />
                            Ver
                          </button>
                          <button
                            type="button"
                            onClick={() => descargarPDF(factura)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-colors"
                          >
                            <FileDown size={14} />
                            Descargar
                          </button>
                        </div>
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
                    facturas
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
                        {(() => {
                          const fin = finanzasExpedienteParaInformes(exp)
                          if (!fin.desdeCierreGrupo && exp?.liquidacion_final_beneficio == null) return null
                          const ben = fin.beneficio_limpio
                          return (
                          <span
                            className={`text-[11px] font-semibold ${
                              ben >= 0 ? 'text-emerald-600' : 'text-red-600'
                            }`}
                          >
                            Beneficio: {ben.toFixed(2)} €
                          </span>
                          )
                        })()}
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
                    disabled={!expedienteSeleccionado}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <FileText size={14} />
                    Exportar PDF
                  </button>
                  {!esGestoria && (
                    <button
                      type="button"
                      onClick={guardarInformeHacienda}
                      disabled={!expedienteSeleccionado || lineasInforme.length === 0 || guardandoInforme}
                      className="px-6 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold uppercase tracking-[0.18em] hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {guardandoInforme ? 'Guardando...' : 'Guardar Informe'}
                    </button>
                  )}
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
                            {esGestoria ? (
                              <span className="text-slate-800">{l.proveedor || '—'}</span>
                            ) : (
                              <input
                                type="text"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs lg:text-sm"
                                value={l.proveedor || ''}
                                onChange={(e) =>
                                  actualizarLineaInforme(index, 'proveedor', e.target.value)
                                }
                              />
                            )}
                          </td>
                          <td className="px-4 py-3 text-right align-top text-slate-500">
                            {Number(l.importe_cotizado || 0).toFixed(2)} €
                          </td>
                          <td className="px-4 py-3 text-right align-top">
                            {esGestoria ? (
                              <span className="font-semibold text-slate-900 tabular-nums">
                                {Number(l.importe_real || 0).toFixed(2)} €
                              </span>
                            ) : (
                              <input
                                type="number"
                                step="0.01"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-right text-xs lg:text-sm"
                                value={l.importe_real}
                                onChange={(e) =>
                                  actualizarLineaInforme(index, 'importe_real', e.target.value)
                                }
                              />
                            )}
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

      <VisualizadorPro
        open={visualizadorOpen}
        src={visualizadorSrc}
        title={visualizadorTitulo}
        downloadName={visualizadorDownloadName}
        onClose={() => {
          setVisualizadorOpen(false)
          setVisualizadorSrc(null)
        }}
      />
    </div>
  )
}

export default Cierres
