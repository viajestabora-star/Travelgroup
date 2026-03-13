import React, { useState, useEffect, useRef } from 'react'
import { X, Plus, Save, Pencil, Trash2, FileText, Printer, FileDown } from 'lucide-react'
import { supabase } from '../supabase'
import jsPDF from 'jspdf'
import { toNum, generarUUID, limpiarNumero, categorizarPago, numeroATexto, normalizarTipo, normalizarMetodoPago } from '../utils/finanzasHelpers'
import { validarProveedoresServicios, consolidarGastosExpediente } from '../utils/consolidacionGastos'
import { DATOS_EMISOR } from '../config/empresa'

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
}

/**
 * ============ MOTOR DE CÁLCULO (MÓDULO) - CÓDIGO CRÍTICO ============
 * - porPersona: Precio por Persona → total = coste_pax × totalPax
 * - porGrupo: Total a dividir entre el grupo → coste_pax = total / pasajeros_pago
 * - Autobús: Siempre divide el total entre pasajeros_pago (equivalente a porGrupo)
 */
const finalizarCalculoModulo = (servicio, paxPago = 31, paxTotal = 35) => {
  const s = servicio || {}
  const pP = Math.max(1, toNum(paxPago))
  const pT = Math.max(1, toNum(paxTotal))
  const precio = toNum(s.coste_unitario)
  const n = Math.max(1, toNum(s.noches))
  const d = Math.max(1, toNum(s.dias_guia))
  const manual = toNum(s.total_servicio_manual)
  const tipoNorm = normalizarTipo(s?.tipo_servicio || s?.tipo || '')
  const esPorGrupo = s?.tipo_calculo === 'porGrupo' || s?.tipo_calculo === 'Total a dividir'
  const esAutobusOTransporte = tipoNorm === 'autobus' || tipoNorm === 'transporte'

  let totalFinal = 0
  let costePorPersona = 0

  if (esAutobusOTransporte || esPorGrupo) {
    // Autobús/Transporte o Total a dividir: total = manual (o precio×cantidad para guía), coste_pax = total / pasajeros_pago
    totalFinal = manual > 0 ? manual : (tipoNorm === 'guia' || tipoNorm === 'g' ? precio * Math.max(1, toNum(s.cantidad ?? d)) : precio)
    costePorPersona = pP > 0 ? totalFinal / pP : 0
  } else {
    // Precio por Persona: coste_pax = precio × factor, total = coste_pax × totalPax
    const factor = (tipoNorm === 'hotel') ? n : (tipoNorm === 'guia' || tipoNorm === 'g' ? d : 1)
    costePorPersona = precio * factor
    totalFinal = costePorPersona * pT
  }
  return { ...s, coste_pax: Number(costePorPersona.toFixed(2)), total_servicio: Number(totalFinal.toFixed(2)) }
}

const ExpedienteFinanzas = ({
  expediente,
  onUpdate,
  cobros = [],
  onCobrosReload,
  onExpedienteRefresh,
  servicios = [],
  formData = {},
  suplementos = {},
  expedienteClientes = [],
  grupo,
  clienteIdPrincipal,
  obtenerProveedorPorId,
  clientes = [],
  activeTab,
  versiones = [],
  versionActiva = 0,
  onVersionChange,
  desgloseGrupos = [],
}) => {
  const cierreGrupo = expediente?.cierre_grupo || {}

  // paxPago and totalPax computed from expediente/formData
  const paxPago = Math.max(0, toNum(expediente?.pax_pago) || Math.max(0, toNum(formData?.total_pax) - toNum(formData?.gratuidades)))
  const totalPax = Math.max(0, toNum(expediente?.total_pax) || toNum(formData?.total_pax))

  // presupuesto_total y total_cobrado: confiar en Supabase (trigger DB actualiza total_cobrado)
  // No recalcular total_cobrado en frontend; fallback de presupuesto si no existe columna
  const presupuestoTotal = expediente?.presupuesto_total != null
    ? toNum(expediente.presupuesto_total)
    : (() => {
        const pP = Math.max(1, toNum(expediente?.pax_pago) || Math.max(0, toNum(formData?.total_pax) - toNum(formData?.gratuidades)))
        const precioVenta = pP * toNum(expediente?.precio_venta_cliente ?? formData?.precio_venta_cliente ?? 0)
        const suplementosVal = parseFloat(suplementos?.totalSuplementos || 0) || 0
        const bonificaciones = toNum(expediente?.bonificacion_pax ?? formData?.bonificacion_pax ?? 0) * pP
        const gratuidadesVal = toNum(expediente?.gratuidades_monetario ?? 0)
        return (precioVenta + suplementosVal) - (bonificaciones + gratuidadesVal)
      })()
  const totalCobrado = toNum(expediente?.total_cobrado)
  const pendiente = presupuestoTotal - totalCobrado

  // State
  const [formCobro, setFormCobro] = useState({
    importe: '',
    metodo_pago: 'Transferencia',
    cuenta_destino: 'Caixabank',
    concepto: ''
  })
  const [showModalCobro, setShowModalCobro] = useState(false)
  const [cobroEnEdicionId, setCobroEnEdicionId] = useState(null)
  const [logsFinancieros, setLogsFinancieros] = useState([])
  const [showModalLogs, setShowModalLogs] = useState(false)
  const [informeLiquidacion, setInformeLiquidacion] = useState({
    ingresos: { precioViaje: 0, suplementos: 0, descuentos: 0 },
    costesReales: [],
    gastosImprevistos: [],
  })
  const [paxPorAsociacion, setPaxPorAsociacion] = useState([])
  const [guardandoCierre, setGuardandoCierre] = useState(false)
  const informeLiquidacionInicializadoRef = useRef(false)

  // Effect: restore informeLiquidacion from expediente.cierre_grupo when modal opens or cierre_grupo loads
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

  // Effect: paxPorAsociacion init — si hay guardado en cierre_grupo, usarlo; si no, distribuir total_pax
  useEffect(() => {
    const guardado = cierreGrupo?.pax_por_asociacion
    const paxTotalExpediente = toNum(expediente?.total_pax) || toNum(formData?.total_pax) || 0

    if (Array.isArray(guardado) && guardado.length > 0) {
      setPaxPorAsociacion(guardado)
    } else if (expedienteClientes.length > 0) {
      const paxPorCliente = expedienteClientes.length > 0 && paxTotalExpediente > 0
        ? Math.floor(paxTotalExpediente / expedienteClientes.length)
        : null
      setPaxPorAsociacion(prev => {
        const idsPrev = new Set(prev.map(p => String(p.cliente_id)))
        const nuevos = expedienteClientes.filter(ec => !idsPrev.has(String(ec.cliente_id))).map(ec => ({
          cliente_id: ec.cliente_id,
          cliente_nombre: ec.cliente_nombre,
          pax: paxPorCliente,
        }))
        return prev.length > 0 ? [...prev, ...nuevos] : expedienteClientes.map(ec => ({
          cliente_id: ec.cliente_id,
          cliente_nombre: ec.cliente_nombre,
          pax: paxPorCliente,
        }))
      })
    } else if (clienteIdPrincipal) {
      const nombrePrincipal = grupo?.nombre || expediente?.cliente_nombre || expediente?.nombre_grupo || '—'
      setPaxPorAsociacion(prev => prev.length > 0 ? prev : [{
        cliente_id: clienteIdPrincipal,
        cliente_nombre: nombrePrincipal,
        pax: paxTotalExpediente || null,
      }])
    }
  }, [expediente?.id, expediente?.total_pax, expediente?.cierre_grupo?.pax_por_asociacion, expedienteClientes, clienteIdPrincipal, grupo?.nombre])

  // Effect: load cobros when activeTab is cobros (call onCobrosReload)
  useEffect(() => {
    if (activeTab === 'cobros' && expediente?.id && onCobrosReload) {
      onCobrosReload()
    }
  }, [activeTab, expediente?.id])

  // cargarCobros (internal, calls onCobrosReload)
  const cargarCobros = async () => {
    if (onCobrosReload) await onCobrosReload()
  }

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

  const guardarCobro = async () => {
    if (!expediente?.id) {
      alert('❌ No se puede guardar: expediente no válido')
      return
    }

    const clienteId = expediente.cliente_id || expediente.clienteId
    if (!clienteId) {
      alert('⚠️ No se puede registrar el cobro: El expediente no tiene un cliente asignado.\n\nPor favor, asigna un cliente al expediente antes de registrar cobros.')
      return
    }

    const importeLimpio = limpiarNumero(formCobro.importe)
    if (importeLimpio <= 0) {
      alert('❌ El importe debe ser mayor que 0')
      return
    }

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
        fecha: new Date().toISOString()
      }

      let errorOperacion = null
      let operacionExitosa = false
      let numeroReciboGenerado = null

      if (cobroEnEdicionId) {
        const cobroOriginal = (cobros || []).find(c => c.id === cobroEnEdicionId)
        const cambios = []

        if (cobroOriginal) {
          if (cobroOriginal.cuenta_destino !== formCobro.cuenta_destino) {
            cambios.push(`Cambio de cuenta: ${cobroOriginal.cuenta_destino || 'Sin cuenta'} -> ${formCobro.cuenta_destino}`)
          }
          if (cobroOriginal.metodo_pago !== formCobro.metodo_pago) {
            cambios.push(`Cambio de método: ${cobroOriginal.metodo_pago || 'Sin método'} -> ${formCobro.metodo_pago}`)
          }
          const importeOriginal = Number(cobroOriginal.importe) || 0
          if (Math.abs(importeOriginal - importeLimpio) > 0.01) {
            cambios.push(`Cambio de importe: ${importeOriginal.toFixed(2)}€ -> ${importeLimpio.toFixed(2)}€`)
          }
        }

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
          const { error: logError } = await supabase
            .from('logs_financieros')
            .insert([{
              expediente_id: expediente.id,
              tipo: 'COBRO',
              descripcion: descripcion,
              importe: importeLimpio,
              usuario: 'Admin'
            }])
          if (!logError) {
            await cargarLogsFinancieros()
          }
        }
      } else {
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
          const { error: logError } = await supabase
            .from('logs_financieros')
            .insert([{
              expediente_id: expediente.id,
              tipo: 'COBRO',
              descripcion: `Cobro registrado: ${importeLimpio}€ - ${formCobro.concepto || 'Sin concepto'}`,
              importe: importeLimpio,
              usuario: 'Admin'
            }])
          if (!logError) {
            await cargarLogsFinancieros()
          }
        }
      }

      if (errorOperacion) {
        alert(`❌ Error al guardar el cobro:\n\n${errorOperacion.message || JSON.stringify(errorOperacion)}`)
        return
      }

      await cargarCobros()
      await onExpedienteRefresh?.()
      alert(numeroReciboGenerado
        ? `✅ Cobro registrado y Recibo ${numeroReciboGenerado} generado con éxito.`
        : '✅ Cobro guardado correctamente.')

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
      await onExpedienteRefresh?.()
    } catch (err) {
      alert(`❌ Error inesperado al eliminar: ${err.message}`)
    }
  }

  const generarReciboPDF = (cobro) => {
    const crearDocumento = (logoImg) => {
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const colorAmarillo = [255, 193, 7]
      const colorAzul = [33, 150, 243] // #2196F3

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

      doc.setFillColor(...colorAmarillo)
      doc.rect(0, 0, pageWidth, 30, 'F')

      if (logoImg) {
        try {
          doc.setFillColor(255, 255, 255)
          doc.rect(10, 5, 55, 22, 'F')
          doc.addImage(logoImg, 'PNG', 12, 6, 50, 20)
        } catch (e) {}
      } else {
        doc.setFillColor(255, 255, 255)
        doc.rect(10, 5, 55, 22, 'F')
      }

      const numExp = expediente?.numero_expediente || expediente?.numeroExpediente || ''
      const numeroExpedienteDisplay = numExp ? `EXP-${numExp}` : '—'
      doc.setFontSize(12)
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'bold')
      doc.text(numeroExpedienteDisplay, pageWidth - 60, 15)

      const numeroRecibo = cobro.numero_recibo || '—'
      doc.setTextColor(0, 0, 0)
      doc.setFontSize(24)
      doc.setFont('helvetica', 'bold')
      doc.text('RECIBO', pageWidth - 60, 22)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(numeroRecibo, pageWidth - 60, 28)

      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text(`# ${importe.toFixed(2)}€ #`, pageWidth - 60, 38)

      doc.setDrawColor(...colorAzul)
      doc.setLineWidth(0.5)
      doc.line(10, 48, pageWidth - 10, 48)

      doc.setFontSize(10)
      doc.setTextColor(60, 60, 60)
      doc.setFont('helvetica', 'italic')
      doc.text(`Recibo oficial correspondiente al Expediente ${numeroExpedienteDisplay}`, 20, 58)

      let yPos = 75
      doc.setFontSize(12)
      doc.setFont('helvetica', 'normal')
      doc.text('Se recibió de:', 20, yPos)
      doc.setFont('helvetica', 'bold')
      doc.text(clienteNombre, 60, yPos)
      yPos += 15

      doc.setFont('helvetica', 'normal')
      doc.text('La cantidad de:', 20, yPos)
      doc.setFont('helvetica', 'bold')
      doc.text(importeTexto.charAt(0).toUpperCase() + importeTexto.slice(1), 60, yPos)
      yPos += 15

      doc.setFont('helvetica', 'normal')
      doc.text('En concepto de:', 20, yPos)
      doc.setFont('helvetica', 'bold')
      const concepto = `${nombreGrupo} - ${destino}`
      doc.text(concepto, 60, yPos)
      yPos += 20

      doc.setFont('helvetica', 'normal')
      doc.text(`Fecha: ${fechaFormateada}`, 20, yPos)
      yPos += 6
      doc.text(`Nº Recibo: ${numeroRecibo}`, 20, yPos)
      yPos += 20
      doc.text(`Método de pago: ${cobro.metodo_pago || '-'}`, 20, yPos)
      yPos += 10

      const footerY = pageHeight - 55
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 100, 100)
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.3)
      doc.line(10, footerY - 5, pageWidth - 10, footerY - 5)
      doc.text(DATOS_EMISOR.nombre, 20, footerY)
      doc.text(`CIF: ${DATOS_EMISOR.cif}`, 20, footerY + 8)
      doc.text(`Licencia: ${DATOS_EMISOR.licencia}`, 20, footerY + 16)
      doc.text(DATOS_EMISOR.direccion, 20, footerY + 24)
      doc.text(DATOS_EMISOR.banco1, 20, footerY + 32)
      doc.text(DATOS_EMISOR.banco2, 20, footerY + 38)

      const nombreArchivo = numeroRecibo !== '—'
        ? `Recibo_${numeroRecibo}_${nombreGrupo.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
        : `Recibo_${nombreGrupo.replace(/[^a-zA-Z0-9]/g, '_')}_${fechaCobro.toISOString().split('T')[0]}.pdf`
      doc.save(nombreArchivo)
    }

    const logo = new Image()
    logo.src = '/Logo tabora 2023.png'
    logo.onload = () => crearDocumento(logo)
    logo.onerror = () => {
      const fallbackLogo = new Image()
      fallbackLogo.src = '/tabora-logo.png'
      fallbackLogo.onload = () => crearDocumento(fallbackLogo)
      fallbackLogo.onerror = () => crearDocumento(null)
    }
  }

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

  const [cargandoCotizacion, setCargandoCotizacion] = React.useState(false)
  const [errorCargaCotizacion, setErrorCargaCotizacion] = React.useState(null)

  const recargarInformeDesdeCotizacion = async () => {
    if (!expediente?.id) return
    setCargandoCotizacion(true)
    setErrorCargaCotizacion(null)
    informeLiquidacionInicializadoRef.current = false

    try {
      // ── 1. Single DB call: PAX data + versiones_json (primary service storage) ────
      const { data: expFresco, error: errExp } = await supabase
        .from('expedientes')
        .select('id, total_pax, pax_pago, gratuidades, precio_venta_cliente, bonificacion_pax, versiones_json')
        .eq('id', expediente.id)
        .single()
      if (errExp) console.warn('[Cierre] No se pudo cargar expediente fresco:', errExp.message)

      // ── 2. Resolve services — versiones_json is the primary store for new expedientes ──
      let serviciosActualizados = []

      const vj = expFresco?.versiones_json ?? expediente?.versiones_json
      const versionesGuardadas = Array.isArray(vj?.versiones) ? vj.versiones : null

      if (versionesGuardadas && versionesGuardadas.length > 0) {
        // Prefer confirmed version → versionActiva index → first version
        const confirmed = versionesGuardadas.find(v => v.confirmada)
        const targetIdx = versionActiva >= 0 && versionActiva < versionesGuardadas.length ? versionActiva : 0
        const target = confirmed || versionesGuardadas[targetIdx]
        const servs = target?.servicios
        if (Array.isArray(servs) && servs.length > 0) {
          serviciosActualizados = servs
          console.log('[Cierre] Servicios desde versiones_json:', serviciosActualizados.length)
        }
      }

      // ── 3. Legacy fallback: servicios_cotizacion table (for older expedientes) ─────
      if (serviciosActualizados.length === 0) {
        let sq = await supabase
          .from('servicios_cotizacion')
          .select('*')
          .eq('id_expediente', String(expediente.id).trim())
          .order('orden', { ascending: true })
          .order('id', { ascending: true })
        if (sq.error) {
          sq = await supabase
            .from('servicios_cotizacion')
            .select('*')
            .eq('id_expediente', String(expediente.id).trim())
            .order('id', { ascending: true })
        }
        if (!sq.error && Array.isArray(sq.data) && sq.data.length > 0) {
          serviciosActualizados = sq.data
          console.log('[Cierre] Servicios desde servicios_cotizacion:', serviciosActualizados.length)
        }
      }

      // ── 4. In-memory fallback: servicios prop already passed by the parent ─────────
      if (serviciosActualizados.length === 0 && Array.isArray(servicios) && servicios.length > 0) {
        serviciosActualizados = servicios
        console.log('[Cierre] Servicios desde prop (fallback):', serviciosActualizados.length)
      }

      console.log('[Cierre] Total servicios a cargar en Cierre:', serviciosActualizados.length)

      // ── 5. Resolve provider names ─────────────────────────────────────────────────
      // Services from versiones_json use proveedorId; DB rows use proveedor_id_int.
      const idsNecesarios = [...new Set(
        serviciosActualizados
          .map(s => s.proveedor_id_int || s.proveedorId)
          .filter(id => id != null && id !== '')
      )]
      let proveedoresMap = {}
      if (idsNecesarios.length > 0) {
        const { data: provsDB } = await supabase
          .from('proveedores')
          .select('id, nombre_comercial')
          .in('id', idsNecesarios)
        if (Array.isArray(provsDB)) provsDB.forEach(p => { proveedoresMap[p.id] = p.nombre_comercial })
      }

      // ── 6. PAX figures — DB → props → formData. desglose_grupos has no effect here ─
      const paxTotalFresco = toNum(expFresco?.total_pax) || toNum(expediente?.total_pax) || toNum(formData?.total_pax) || 0
      const gratuidadesFrescas = toNum(expFresco?.gratuidades) || toNum(expediente?.gratuidades) || toNum(formData?.gratuidades) || 0
      const paxPagoFresco = toNum(expFresco?.pax_pago) || Math.max(0, paxTotalFresco - gratuidadesFrescas) || paxPago
      const precioVentaFresco = toNum(expFresco?.precio_venta_cliente) || toNum(expediente?.precio_venta_cliente) || toNum(formData?.precio_venta_cliente) || 0
      const bonificacionFresco = toNum(expFresco?.bonificacion_pax) || toNum(expediente?.bonificacion_pax) || toNum(formData?.bonificacion_pax) || 0

      const precioViaje = paxPagoFresco * precioVentaFresco
      const suplementosVal = parseFloat(suplementos?.totalSuplementos || 0)
      const descuentosVal = bonificacionFresco * paxPagoFresco

      // ── 7. Build coste rows — preserve manually edited coste_real values ───────────
      const savedCostesReales = (informeLiquidacion.costesReales || []).reduce((acc, c) => {
        acc[c.id_servicio] = c.coste_real
        return acc
      }, {})

      const costesRealesIniciales = serviciosActualizados.map((s) => {
        // versiones_json → proveedorId; servicios_cotizacion → proveedor_id_int
        const provId = s?.proveedor_id_int || s?.proveedorId || null
        const nombreComercialCache = obtenerProveedorPorId && provId != null
          ? obtenerProveedorPorId(provId)?.nombreComercial
          : null
        const proveedor = nombreComercialCache
          || (provId != null ? proveedoresMap[provId] : null)
          || s?.nombre_proveedor_texto
          || s?.proveedorNombreTemporal  // versiones_json manual name
          || s?.nombre_proveedor_manual
          || 'Sin asignar'
        const tipo = s?.tipo || s?.tipo_servicio || 'Servicio'
        const nombre = s?.nombre_especifico ? `${tipo} – ${s.nombre_especifico}` : tipo
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

      // ── 8. Commit state ────────────────────────────────────────────────────────────
      setInformeLiquidacion(prev => ({
        ...prev,
        ingresos: { precioViaje, suplementos: suplementosVal, descuentos: descuentosVal },
        costesReales: costesRealesIniciales,
        gastosImprevistos: prev.gastosImprevistos || [],
      }))

      // ── 9. PAX por asociación — only update when no saved manual distribution ──────
      const guardado = expediente?.cierre_grupo?.pax_por_asociacion
      if (!Array.isArray(guardado) || guardado.length === 0) {
        if (expedienteClientes.length > 0) {
          const paxPorCliente = paxTotalFresco > 0
            ? Math.floor(paxTotalFresco / expedienteClientes.length)
            : null
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
    } catch (err) {
      console.error('[Cierre] Error al cargar cotización:', err)
      setErrorCargaCotizacion(err?.message || 'Error desconocido al cargar los datos')
    } finally {
      setCargandoCotizacion(false)
    }
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

  const actualizarPaxAsociacion = (clienteId, pax) => {
    setPaxPorAsociacion(prev => {
      const existe = prev.find(p => String(p.cliente_id) === String(clienteId))
      if (existe) return prev.map(p => String(p.cliente_id) === String(clienteId) ? { ...p, pax: pax === '' ? null : Number(pax) || 0 } : p)
      return [...prev, { cliente_id: clienteId, cliente_nombre: expedienteClientes.find(ec => String(ec.cliente_id) === String(clienteId))?.cliente_nombre || '—', pax: pax === '' ? null : Number(pax) || 0 }]
    })
  }

  const calcularCierreFinanciero = () => {
    const pP = Math.max(1, toNum(expediente?.pax_pago) || Math.max(0, toNum(formData?.total_pax) - toNum(formData?.gratuidades)))
    const precioVenta = pP * toNum(expediente?.precio_venta_cliente ?? formData?.precio_venta_cliente ?? 0)
    const suplementosVal = parseFloat(suplementos?.totalSuplementos || 0) || 0
    const bonificaciones = toNum(expediente?.bonificacion_pax ?? formData?.bonificacion_pax ?? 0) * pP
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

  const estadoExp = expediente?.estado || ''
  const esFinalizado = estadoExp === 'Finalizado'
  const esCerrado = estadoExp === 'Cerrado' || estadoExp.toLowerCase() === 'cerrado'
  // Campos bloqueados SOLO si el cierre está guardado Y el estado es Cerrado o Finalizado
  // En cualquier otro estado (Confirmado, Petición, En curso) siempre editables
  const [edicionHabilitada, setEdicionHabilitada] = useState(false)
  const camposBloqueados = isCierreGuardado && (esCerrado || esFinalizado) && !edicionHabilitada

  const handleGuardarCierre = async () => {
    if (!expediente?.id) return
    if (!window.confirm('¿Confirmar cierre? Se consolidarán los costes para el análisis financiero.')) return
    setGuardandoCierre(true)
    try {
      const { data: expDataRaw } = await supabase.from('expedientes').select('id, numero_expediente, versiones_json').eq('id', expediente.id).single()
      const expData = expDataRaw || expediente
      const validacion = await validarProveedoresServicios(expediente.id, expData?.versiones_json)
      if (!validacion.ok) {
        alert(validacion.error || 'Error: Faltan proveedores por asignar en los servicios. No se puede consolidar.')
        setGuardandoCierre(false)
        return
      }
      const { ingresosTotales, gastosTotales, beneficioBruto, ivaPagado, beneficioLimpio } = calcularCierreFinanciero()

      const n = (v) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : 0)
      const ingresosCalculados = n(ingresosTotales)
      const gastosCalculados = n(gastosTotales)
      const ivaCalculado = n(ivaPagado)
      const beneficioCalculado = n(beneficioLimpio)

      const cierreGrupoJson = {
        ingresos_totales: ingresosCalculados,
        gastos_totales: gastosCalculados,
        beneficio_bruto: beneficioBruto,
        iva_pagado: ivaCalculado,
        beneficio_limpio: beneficioCalculado,
        fecha: new Date().toISOString(),
        ingresos: { precioViaje: n(informeLiquidacion?.ingresos?.precioViaje), suplementos: n(informeLiquidacion?.ingresos?.suplementos), descuentos: n(informeLiquidacion?.ingresos?.descuentos) },
        costesReales: (informeLiquidacion.costesReales || []).map((c) => ({ id_servicio: c.id_servicio, concepto: c.concepto || '', proveedor: c.proveedor || '', coste_cotizado: n(c.coste_cotizado), coste_real: n(c.coste_real) })),
        gastosImprevistos: (informeLiquidacion.gastosImprevistos || []).map((g) => ({ id: g.id, concepto: g.concepto || '', importe: n(g.importe) })),
        pax_por_asociacion: paxPorAsociacion.filter((p) => p.cliente_id).map((p) => ({ cliente_id: p.cliente_id, cliente_nombre: p.cliente_nombre || '', pax: p.pax })),
      }

      const financialPayload = {
        total_ingresos: ingresosCalculados,
        total_gastos_reales: gastosCalculados,
        beneficio_neto_real: beneficioCalculado,
        cuota_iva: ivaCalculado,
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

      const cons = await consolidarGastosExpediente(expediente.id, expData, true)
      if (!cons.ok) {
        alert(cons.error || 'Error al consolidar gastos. El cierre se guardó pero revisa los proveedores.')
      }

      const paxTotal = Math.max(1, n(formData?.total_pax) || n(expediente?.total_pax))
      const gratuidades = n(formData?.gratuidades) || n(expediente?.gratuidades)
      const bonificacionPax = n(formData?.bonificacion_pax) || n(expediente?.bonificacion_pax)
      const precioVentaCliente = n(formData?.precio_venta_cliente) || n(expediente?.precio_venta_cliente)
      const paxPago = Math.max(1, paxTotal - gratuidades)
      if (onUpdate) onUpdate({ ...expediente, cierre_grupo: cierreGrupoJson, total_ingresos: ingresosCalculados, total_gastos_reales: gastosCalculados, cuota_iva: ivaCalculado, beneficio_neto_real: beneficioCalculado, estado: 'Cerrado', total_pax: paxTotal, gratuidades, bonificacion_pax: bonificacionPax, precio_venta_cliente: precioVentaCliente, pax_pago: paxPago })
      alert('Cierre guardado correctamente.')
    } catch (err) {
      alert('Error al guardar el cierre: ' + (err?.message || String(err)))
    } finally {
      setGuardandoCierre(false)
    }
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

    const CATEGORIAS = ['Bus', 'Hotel', 'Restaurante', 'Guía', 'Otros']
    const porCategoria = Object.fromEntries(CATEGORIAS.map(c => [c, []]))
    costesReales.forEach(c => {
      const cat = categorizarPago(c.concepto)
      if (porCategoria[cat]) porCategoria[cat].push(c)
      else porCategoria.Otros.push(c)
    })

    const filasPagos = []
    CATEGORIAS.forEach(cat => {
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

    const CATEGORIAS = ['Bus', 'Hotel', 'Restaurante', 'Guía', 'Otros']
    const porCategoria = Object.fromEntries(CATEGORIAS.map(c => [c, []]))
    costesReales.forEach(c => {
      const cat = categorizarPago(c.concepto)
      if (porCategoria[cat]) porCategoria[cat].push(c)
      else porCategoria.Otros.push(c)
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

    const categoriasOrden = ['Bus', 'Hotel', 'Restaurante', 'Guía', 'Otros']
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

  const handleWheel = (e) => {
    e.target.blur()
  }

  // Return null when activeTab is neither 'cobros' nor 'cierre'
  if (activeTab !== 'cobros' && activeTab !== 'cierre') {
    return null
  }

  const cobrosSeguros = Array.isArray(cobros) ? cobros : []

  return (
    <>
      {/* TAB: Cobros */}
      {activeTab === 'cobros' && (
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Multicotización: botones de variante (20PAX, 15PAX, etc.) - clic cambia cotizacionActiva */}
          {versiones?.length > 0 && (
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-sm font-semibold text-slate-700 mb-2">Presupuestos (Multicotización)</p>
              <div className="flex flex-wrap gap-2">
                {versiones.map((v, idx) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onVersionChange?.(idx)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      versionActiva === idx
                        ? 'bg-navy-600 text-white ring-2 ring-navy-400'
                        : v.confirmada
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                    }`}
                  >
                    {v.nombre || `Opción ${idx + 1}`}{v.confirmada ? ' ✓ CONFIRMADA' : ''}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">Solo la opción CONFIRMADA suma para beneficio_neto_real en Central de Inteligencia.</p>
            </div>
          )}

          {/* Banner Estado Financiero: Presupuesto - Cobrado = Pendiente (total_cobrado desde Supabase/trigger) */}
          <div className={`p-4 rounded-xl border-2 ${pendiente > 0 ? 'bg-red-50 text-red-800 border-red-200' : 'bg-green-50 text-green-800 border-green-200'}`}>
            <p className="font-bold text-lg">
              Estado Financiero: {pendiente > 0
                ? `Pendiente de cobro: ${pendiente.toFixed(2)}€`
                : 'Pagado totalmente'}
            </p>
            <p className="text-sm mt-1 opacity-90">
              Presupuesto: {presupuestoTotal.toFixed(2)}€ — Cobrado: {totalCobrado.toFixed(2)}€
            </p>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-navy-900">Gestión de Cobros</h3>
            {/* Botón siempre activo: permite añadir cobros incluso tras cierre (cobros_expediente sin restricción) */}
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
              Añadir Cobro (Incluso tras cierre)
            </button>
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl shadow-md p-6 border border-blue-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-1">Total Cobrado</p>
                <p className="text-3xl font-bold text-navy-900">
                  {totalCobrado.toFixed(2)}€
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-1">Número de Cobros</p>
                <p className="text-3xl font-bold text-blue-600">{cobrosSeguros.length}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-1">Último Cobro</p>
                <p className="text-lg font-semibold text-gray-800">
                  {cobrosSeguros[0]?.fecha
                    ? new Date(cobrosSeguros[0].fecha).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      })
                    : '-'}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Nº Recibo</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Fecha</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Importe</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Método de Pago</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Cuenta Destino</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Concepto</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {cobrosSeguros.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="text-center py-8 text-gray-500">
                        Sin cobros
                      </td>
                    </tr>
                  ) : (
                    cobrosSeguros.map((cobro, idx) => {
                      const fechaCobro = cobro.fecha ? new Date(cobro.fecha) : null
                      const fechaFormateada = fechaCobro
                        ? fechaCobro.toLocaleDateString('es-ES', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          })
                        : '-'

                      return (
                        <tr key={cobro.id || `cobro-${idx}`} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-4 text-sm font-mono text-gray-600">{cobro.numero_recibo || '—'}</td>
                          <td className="py-3 px-4 text-sm">{fechaFormateada}</td>
                          <td className="py-3 px-4 text-sm font-semibold text-navy-900">
                            {Number(cobro.importe ?? 0).toFixed(2)}€
                          </td>
                          <td className="py-3 px-4 text-sm">{cobro.metodo_pago || '-'}</td>
                          <td className="py-3 px-4 text-sm">{cobro.cuenta_destino || '-'}</td>
                          <td className="py-3 px-4 text-sm">{cobro.concepto || '-'}</td>
                          <td className="py-3 px-4 text-sm">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => {
                                  setCobroEnEdicionId(cobro.id)
                                  const valorImporte = Number(cobro.importe ?? 0)
                                  setFormCobro({
                                    importe: valorImporte > 0 ? valorImporte.toFixed(2) : '',
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
                              <button
                                onClick={() => eliminarCobro(cobro)}
                                className="text-red-600 hover:text-red-800 transition-colors flex items-center gap-1"
                                title="Eliminar cobro"
                              >
                                <Trash2 size={16} />
                                <span className="text-xs">Borrar</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                  <tr>
                    <td colSpan="1" className="py-3 px-4 text-sm font-bold text-gray-700">
                      Total Cobrado:
                    </td>
                    <td className="py-3 px-4 text-sm font-bold text-navy-900 text-lg">
                      {totalCobrado.toFixed(2)}€
                    </td>
                    <td colSpan="5"></td>
                  </tr>
                </tfoot>
              </table>
            </div>

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

      {/* TAB: Cierre */}
      {activeTab === 'cierre' && (
        <div className="max-w-4xl mx-auto space-y-6 print:max-w-none" id="informe-liquidacion">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
            <div className="mb-6 pb-4 border-b-2 border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 uppercase tracking-tight">
                Liquidación de Beneficios
              </h1>
              {isCierreGuardado && (
                <div className="flex items-center gap-2">
                  <span className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-sm uppercase tracking-wide">
                    CERRADO
                  </span>
                  {camposBloqueados && (
                    <button
                      type="button"
                      onClick={() => setEdicionHabilitada(true)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-amber-400 text-amber-700 hover:bg-amber-50 font-semibold"
                    >
                      Habilitar Edición
                    </button>
                  )}
                  {edicionHabilitada && (
                    <span className="text-xs px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 font-semibold">
                      Edición habilitada
                    </span>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500 uppercase font-semibold">Grupo</span>
                  <p className="font-bold text-slate-900">{expediente?.nombre_grupo || expediente?.cliente_nombre || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-500 uppercase font-semibold">Viaje</span>
                  <p className="font-bold text-slate-900">{expediente?.destino || '—'}</p>
                </div>
              </div>
            </div>

            <section className="mb-6">
              <h2 className="text-base font-bold text-slate-800 uppercase mb-3 border-b border-slate-300 pb-1">Ingresos Totales</h2>
              <div className="space-y-2 text-sm">
                <p className="text-slate-600">(Precio venta × pax pago) + suplementos − bonificaciones − gratuidades</p>
                <div className="flex justify-between pt-2 border-t-2 border-slate-200 font-bold text-slate-900">
                  <span>Total Ingresos</span>
                  <span>{calcularCierreFinanciero().ingresosTotales.toFixed(2)} €</span>
                </div>
              </div>
            </section>

            <section className="mb-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
                <h2 className="text-base font-bold text-slate-800 uppercase border-b border-slate-300 pb-1">Costes Reales (factura proveedor)</h2>
                {!camposBloqueados && (
                  <button
                    type="button"
                    onClick={recargarInformeDesdeCotizacion}
                    disabled={cargandoCotizacion}
                    className={`text-sm border px-3 py-1.5 rounded-lg font-medium self-start sm:self-auto transition-colors ${cargandoCotizacion ? 'border-blue-300 bg-blue-50 text-blue-500 cursor-wait' : 'border-slate-400 hover:bg-slate-50'}`}
                  >
                    {cargandoCotizacion ? '⏳ Cargando…' : '↺ Cargar desde Cotización'}
                  </button>
                )}
              </div>
              {errorCargaCotizacion && (
                <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{errorCargaCotizacion}</span>
                  <button type="button" onClick={() => setErrorCargaCotizacion(null)} className="ml-auto text-red-400 hover:text-red-600 font-bold">✕</button>
                </div>
              )}
              {(informeLiquidacion.costesReales || []).length === 0 ? (
                <div className="py-6 text-center text-slate-500 text-sm border border-slate-200 rounded-lg bg-slate-50">
                  No hay servicios. Abre la pestaña Cotización, añade servicios y pulsa «Cargar desde Cotización».
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm min-w-[400px]">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="px-3 py-2 text-left font-bold text-slate-800">Concepto</th>
                        <th className="px-3 py-2 text-left font-bold text-slate-800 hidden sm:table-cell">Proveedor</th>
                        <th className="px-3 py-2 text-right font-bold text-slate-800">Cotizado</th>
                        <th className="px-3 py-2 text-right font-bold text-slate-800">Precio Coste Real</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(informeLiquidacion.costesReales || []).map((c, idx) => (
                        <tr key={c.id_servicio || `cr-${idx}`} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-800">{c.concepto || '—'}</td>
                          <td className="px-3 py-2 text-slate-600 hidden sm:table-cell">{c.proveedor || '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{Number(c.coste_cotizado || 0).toFixed(2)} €</td>
                          <td className="px-3 py-2">
                            <input type="number" step="0.01" value={c.coste_real ?? ''} onChange={(e) => actualizarCosteReal(c.id_servicio, e.target.value)} disabled={camposBloqueados} readOnly={camposBloqueados} className={`w-full min-w-[80px] border rounded-lg px-2 py-1 text-right font-medium ${camposBloqueados ? 'bg-slate-100 border-slate-200 cursor-not-allowed' : 'border-slate-300 focus:ring-2 focus:ring-blue-500'}`} placeholder="0" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 bg-slate-50 text-right font-bold text-slate-800 text-sm">
                    Total Gastos Reales: {(informeLiquidacion.costesReales || []).reduce((a, c) => a + toNum(c.coste_real), 0).toFixed(2)} €
                  </div>
                </div>
              )}
            </section>

            <section className="mb-6">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-base font-bold text-slate-800 uppercase border-b border-slate-300 pb-1">Gastos Imprevistos</h2>
                {!camposBloqueados && (
                  <button type="button" onClick={agregarGastoImprevisto} className="text-sm border border-amber-500 text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-50 font-medium flex items-center gap-1">
                    <Plus size={14} /> Añadir Gasto Extra
                  </button>
                )}
              </div>
              {(informeLiquidacion.gastosImprevistos || []).length === 0 ? (
                <p className="text-sm text-slate-500 py-2">Taxis, propinas, reparaciones… Pulsa «Añadir Gasto Extra».</p>
              ) : (
                <div className="space-y-2">
                  {(informeLiquidacion.gastosImprevistos || []).map((g, idx) => (
                    <div key={g.id || `gi-${idx}`} className="flex gap-2 items-center">
                      <input type="text" value={g.concepto || ''} onChange={(e) => actualizarGastoImprevisto(g.id, 'concepto', e.target.value)} placeholder="Concepto" disabled={camposBloqueados} readOnly={camposBloqueados} className={`flex-1 border rounded-lg px-2 py-1.5 text-sm ${camposBloqueados ? 'bg-slate-100 border-slate-200 cursor-not-allowed' : 'border-slate-300'}`} />
                      <input type="number" step="0.01" value={g.importe ?? ''} onChange={(e) => actualizarGastoImprevisto(g.id, 'importe', e.target.value)} placeholder="0" disabled={camposBloqueados} readOnly={camposBloqueados} className={`w-24 border rounded-lg px-2 py-1.5 text-right text-sm ${camposBloqueados ? 'bg-slate-100 border-slate-200 cursor-not-allowed' : 'border-slate-300'}`} />
                      {!camposBloqueados && <button type="button" onClick={() => eliminarGastoImprevisto(g.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 size={16} /></button>}
                    </div>
                  ))}
                  <div className="text-right font-semibold text-slate-700 text-sm">
                    Total Imprevistos: {(informeLiquidacion.gastosImprevistos || []).reduce((a, g) => a + toNum(g.importe), 0).toFixed(2)} €
                  </div>
                </div>
              )}
            </section>

            {(expedienteClientes.length > 0 || paxPorAsociacion.length > 0) && (
              <section className="mb-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3 border-b border-slate-300 pb-1">
                  <h2 className="text-base font-bold text-slate-800 uppercase">Pax por asociación</h2>
                  <span className="text-xs text-slate-500 font-medium">
                    Total expediente: <strong className="text-slate-700">{toNum(expediente?.total_pax) || toNum(formData?.total_pax) || 0} pax</strong>
                    {' · '}Confirmados en cotización: <strong className="text-slate-700">{paxPago} pax pago</strong>
                  </span>
                </div>
                <p className="text-sm text-slate-500 mb-3">Distribución de pasajeros por asociación. Datos cargados desde la cotización.</p>
                <div className="space-y-2">
                  {(expedienteClientes.length > 0 ? expedienteClientes : (paxPorAsociacion || []).map(p => ({ cliente_id: p.cliente_id, cliente_nombre: p.cliente_nombre }))).map((item, idx) => {
                    const clienteId = item.cliente_id
                    const nombre = item.cliente_nombre || expedienteClientes.find(ec => String(ec.cliente_id) === String(clienteId))?.cliente_nombre || '—'
                    const paxVal = paxPorAsociacion.find(p => String(p.cliente_id) === String(clienteId))?.pax ?? ''
                    return (
                      <div key={clienteId || `pax-${idx}`} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                        <span className="flex-1 font-medium text-slate-800">{nombre}</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={paxVal}
                          onChange={(e) => actualizarPaxAsociacion(clienteId, e.target.value)}
                          disabled={camposBloqueados}
                          className={`w-20 border rounded-lg px-2 py-1 text-right ${camposBloqueados ? 'bg-slate-100 border-slate-200 cursor-not-allowed' : 'border-slate-300'}`}
                          placeholder="0"
                        />
                        <span className="text-slate-500 text-sm">pax</span>
                      </div>
                    )
                  })}
                  {paxPorAsociacion.length > 0 && (
                    <div className="text-right text-xs text-slate-500 pt-1 font-medium">
                      Total declarado: <strong className="text-slate-700">{paxPorAsociacion.reduce((s, p) => s + (toNum(p.pax) || 0), 0)} pax</strong>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── BENEFICIO POR GRUPO (solo visible si hay grupos configurados) ── */}
            {Array.isArray(desgloseGrupos) && desgloseGrupos.length > 0 && (() => {
              try {
                const { ingresosTotales, gastosTotales } = calcularCierreFinanciero()
                const precioVenta = toNum(expediente?.precio_venta_cliente ?? formData?.precio_venta_cliente ?? 0)
                const totalPaxPagoGlobal = Math.max(1, desgloseGrupos.reduce((s, g) => {
                  return s + Math.max(0, (Number(g.pax) || 0) - (Number(g.gratuidades) || 0))
                }, 0))
                return (
                  <section className="mb-6">
                    <h2 className="text-base font-bold text-slate-800 uppercase mb-3 border-b border-slate-300 pb-1">
                      Beneficio por Grupo
                    </h2>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-sm min-w-[520px]">
                        <thead>
                          <tr className="bg-slate-100">
                            <th className="px-3 py-2 text-left font-bold text-slate-700">Grupo</th>
                            <th className="px-3 py-2 text-center font-bold text-slate-700">Pax Pago</th>
                            <th className="px-3 py-2 text-right font-bold text-slate-700">Bonif. €/pax</th>
                            <th className="px-3 py-2 text-right font-bold text-slate-700">Ingresos</th>
                            <th className="px-3 py-2 text-right font-bold text-slate-700">Costes prorrat.</th>
                            <th className="px-3 py-2 text-right font-bold text-slate-700">Beneficio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {desgloseGrupos.map((g, idx) => {
                            const paxPagoGrupo = Math.max(0, (Number(g.pax) || 0) - (Number(g.gratuidades) || 0))
                            const bonif = Number(g.bonificacion_pax) || 0
                            const ingresoGrupo = paxPagoGrupo * precioVenta - paxPagoGrupo * bonif
                            const proporcion = paxPagoGrupo / totalPaxPagoGlobal
                            const costesGrupo = gastosTotales * proporcion
                            const beneficioGrupo = ingresoGrupo - costesGrupo
                            return (
                              <tr key={g.id || idx} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                                <td className="px-3 py-2 font-medium text-slate-800">{g.nombre_grupo || `Grupo ${idx + 1}`}</td>
                                <td className="px-3 py-2 text-center text-slate-700">{paxPagoGrupo}</td>
                                <td className="px-3 py-2 text-right text-slate-600">{bonif > 0 ? `${bonif.toFixed(2)} €` : '—'}</td>
                                <td className="px-3 py-2 text-right text-slate-800">{ingresoGrupo.toFixed(2)} €</td>
                                <td className="px-3 py-2 text-right text-red-600">−{costesGrupo.toFixed(2)} €</td>
                                <td className={`px-3 py-2 text-right font-bold ${beneficioGrupo >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                  {beneficioGrupo.toFixed(2)} €
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-sm">
                            <td className="px-3 py-2 text-slate-700">TOTAL</td>
                            <td className="px-3 py-2 text-center">{totalPaxPagoGlobal}</td>
                            <td></td>
                            <td className="px-3 py-2 text-right text-slate-800">{ingresosTotales.toFixed(2)} €</td>
                            <td className="px-3 py-2 text-right text-red-600">−{gastosTotales.toFixed(2)} €</td>
                            <td className={`px-3 py-2 text-right font-extrabold text-base ${(ingresosTotales - gastosTotales) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                              {(ingresosTotales - gastosTotales).toFixed(2)} €
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Costes prorrateados por proporción de pax de pago de cada grupo.
                    </p>
                  </section>
                )
              } catch { return null }
            })()}

            {(() => {
              const { ingresosTotales: ingresoTotal, gastosTotales: gastosTotales, beneficioBruto, ivaPagado: ivaSobreBeneficio, beneficioLimpio: beneficioNeto } = calcularCierreFinanciero()
              return (
                <section className="border-t-2 border-slate-200 pt-6 pb-6">
                  <h2 className="text-base font-bold text-slate-800 uppercase mb-4 border-b border-slate-300 pb-1">Resumen de resultados</h2>
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-sm">
                      <tbody>
                        <tr className="border-b border-slate-100">
                          <td className="px-4 py-3 text-slate-600">Beneficio Bruto</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">{beneficioBruto.toFixed(2)} €</td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="px-4 py-3 text-slate-600">IVA (21%)</td>
                          <td className="px-4 py-3 text-right font-semibold text-amber-700">− {ivaSobreBeneficio.toFixed(2)} €</td>
                        </tr>
                        <tr className="bg-emerald-50">
                          <td className="px-4 py-4 text-slate-800 font-bold">BENEFICIO NETO</td>
                          <td className={`px-4 py-4 text-right text-xl font-extrabold ${beneficioNeto >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{beneficioNeto.toFixed(2)} €</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-slate-400 text-xs mt-2">Ingresos − (Gastos Reales + Imprevistos) − IVA</p>
                </section>
              )
            })()}

            <div className="mt-6 flex flex-wrap gap-3">
              {!camposBloqueados && (
                <button type="button" onClick={handleGuardarCierre} disabled={guardandoCierre} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed">
                  <Save size={18} /> {guardandoCierre ? 'Guardando…' : 'Guardar Cierre'}
                </button>
              )}
              <button type="button" onClick={imprimirInformeCierre} disabled={!isCierreGuardado} title={!isCierreGuardado ? 'Guarda el cierre antes de imprimir' : 'Imprimir informe'} className={`flex items-center gap-2 px-4 py-2 border-2 rounded-lg font-semibold ${isCierreGuardado ? 'border-slate-800 bg-white text-slate-900 hover:bg-slate-100' : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'}`}>
                <Printer size={18} /> Imprimir
              </button>
              <button type="button" onClick={generarInformeLiquidacionPDF} disabled={!isCierreGuardado} title={!isCierreGuardado ? 'Guarda el cierre antes de descargar PDF' : 'Descargar PDF'} className={`flex items-center gap-2 px-4 py-2 border-2 rounded-lg font-semibold ${isCierreGuardado ? 'border-slate-800 bg-white text-slate-900 hover:bg-slate-100' : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'}`}>
                <FileDown size={18} /> Descargar PDF
              </button>
              <button type="button" onClick={exportarInformeGestoria} disabled={!isCierreGuardado} title={!isCierreGuardado ? 'Guarda el cierre antes de exportar' : 'Exportar CSV'} className={`flex items-center gap-2 px-4 py-2 border-2 rounded-lg font-semibold ${isCierreGuardado ? 'border-slate-800 bg-white text-slate-900 hover:bg-slate-100' : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'}`}>
                <FileDown size={18} /> Exportar CSV
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
              {cobroEnEdicionId && (() => {
                const cobroEdit = (cobros || []).find(c => c.id === cobroEnEdicionId)
                const nr = cobroEdit?.numero_recibo
                if (!nr) return null
                return (
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Nº Recibo (inmutable)</label>
                    <p className="text-sm font-mono font-bold text-navy-900">{nr}</p>
                  </div>
                )
              })()}
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
                    if (valor.includes(',')) {
                      valor = valor.replace(',', '.')
                    }
                    setFormCobro({ ...formCobro, importe: valor })
                  }}
                  onWheel={handleWheel}
                  onBlur={(e) => {
                    const valorLimpio = limpiarNumero(e.target.value)
                    setFormCobro({ ...formCobro, importe: valorLimpio > 0 ? valorLimpio.toFixed(2) : '' })
                  }}
                  placeholder="Ej: 66.50"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

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
                  <option value="Talon">Talón</option>
                  <option value="Mixto">Mixto</option>
                </select>
              </div>

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
                    {logsFinancieros.map((log, idx) => (
                      <tr key={log.id || `log-${idx}`} className="hover:bg-gray-50 transition-colors">
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
    </>
  )
}

export default ExpedienteFinanzas
