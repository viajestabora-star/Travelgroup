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
import { createClient } from '@supabase/supabase-js'
import jsPDF from 'jspdf'

const SUPABASE_URL = 'https://gtwyqxfkpdwpakmgrkbu.supabase.co'
const SUPABASE_KEY = 'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const Cierres = () => {
  const [tabActiva, setTabActiva] = useState('facturas')

  // Facturas ya emitidas (lectura unificada desde facturas_emitidas_global)
  const [facturas, setFacturas] = useState([])
  const [cargandoFacturas, setCargandoFacturas] = useState(false)

  // Facturación directa a clientes (sin expediente)
  const [clientes, setClientes] = useState([])
  const [cargandoClientes, setCargandoClientes] = useState(false)
  const [clienteSearch, setClienteSearch] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [importeBase, setImporteBase] = useState('')
  const [ivaPorcentaje, setIvaPorcentaje] = useState(21)
  const [concepto, setConcepto] = useState('')
  const [aplicandoFacturaDirecta, setAplicandoFacturaDirecta] = useState(false)

  useEffect(() => {
    if (tabActiva === 'facturas') {
      cargarFacturas()
      cargarClientes()
    }
  }, [tabActiva])

  // ===================== LECTURA FACTURAS (SINCRONIZADO CON facturas_emitidas_global) =====================
  const cargarFacturas = async () => {
    setCargandoFacturas(true)
    try {
      const { data, error } = await supabase
        .from('facturas_emitidas_global')
        .select('*')
        // ✅ Ordenamos SOLO por fecha_emision (no usamos created_at para el orden)
        .order('fecha_emision', { ascending: false })

      if (error) {
        console.error('Error cargando facturas desde facturas_emitidas_global:', error)
        alert(`Error cargando facturas: ${error.message}`)
        setFacturas([])
        return
      }

      setFacturas(data || [])
    } catch (err) {
      console.error('Error inesperado cargando facturas:', err)
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
        console.error('Error cargando clientes para facturación directa:', error)
        alert(`Error cargando clientes: ${error.message}`)
        setClientes([])
        return
      }

      setClientes(data || [])
    } catch (err) {
      console.error('Error inesperado cargando clientes:', err)
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

  // ===================== GENERACIÓN NÚMERO DE FACTURA =====================
  const obtenerSiguienteNumeroFactura = async () => {
    const año = new Date().getFullYear()

    const { data, error } = await supabase
      .from('facturas_emitidas_global')
      .select('numero_factura')
      .ilike('numero_factura', `${año}-%`)
      .order('numero_factura', { ascending: false })
      .limit(1)

    if (error) {
      console.error('Error obteniendo última factura:', error)
      throw new Error('No se pudo obtener el último número de factura')
    }

    if (data && data.length > 0 && data[0]?.numero_factura) {
      const partes = String(data[0].numero_factura).split('-')
      const siguienteNum = parseInt(partes[1] || '0', 10) + 1
      return `${año}-${String(siguienteNum).padStart(4, '0')}`
    }

    return `${año}-0001`
  }

  // ===================== FACTURACIÓN DIRECTA (CLIENTE SIN EXPEDIENTE) =====================
  const handleApplyFacturacionDirecta = async () => {
    if (!clienteSeleccionado) {
      alert('Por favor, selecciona un cliente de la lista.')
      return
    }

    const base = parseFloat(String(importeBase).replace(',', '.'))
    if (!base || base <= 0) {
      alert('Importe base no válido.')
      return
    }

    const ivaPct = parseFloat(String(ivaPorcentaje))
    if (Number.isNaN(ivaPct) || ivaPct < 0) {
      alert('Porcentaje de IVA no válido.')
      return
    }

    if (!concepto || concepto.trim().length < 3) {
      alert('Indica un concepto de factura más descriptivo.')
      return
    }

    setAplicandoFacturaDirecta(true)
    try {
      const numeroFactura = await obtenerSiguienteNumeroFactura()

      const baseImponible = base
      const iva = +(baseImponible * (ivaPct / 100)).toFixed(2)
      const totalFactura = +(baseImponible + iva).toFixed(2)

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
          baseImponible: baseImponible.toFixed(2),
          iva: iva.toFixed(2),
          totalFactura: totalFactura.toFixed(2),
          tipoIVA: ivaPct
        }
      }

      const { error: errorInsert } = await supabase.from('facturas_emitidas_global').insert([
        {
          numero_factura: numeroFactura,
          cliente_id: clienteSeleccionado.id,
          cliente_nombre: clienteSeleccionado.nombre,
          tipo_factura: 'DIRECTA',
          importe_total: totalFactura,
          fecha_emision: fechaEmisionISO,
          datos_json
        }
      ])

      if (errorInsert) {
        console.error('Error insertando factura directa en facturas_emitidas_global:', errorInsert)
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

        doc.setFont(undefined, 'bold')
        doc.text('Base imponible:', 20, yPos)
        doc.text(`${baseImponible.toFixed(2)}€`, pageWidth - 20, yPos, { align: 'right' })
        yPos += 8
        doc.text(`IVA (${ivaPct}%):`, 20, yPos)
        doc.text(`${iva.toFixed(2)}€`, pageWidth - 20, yPos, { align: 'right' })
        yPos += 10
        doc.setFontSize(14)
        doc.text('TOTAL:', 20, yPos)
        doc.text(`${totalFactura.toFixed(2)}€`, pageWidth - 20, yPos, { align: 'right' })

        doc.save(`Factura_${numeroFactura}_Directa.pdf`)
      } catch (pdfError) {
        console.error('Error generando PDF de factura directa:', pdfError)
      }

      alert(`✅ Factura directa ${numeroFactura} emitida correctamente`)

      // Reset formulario
      setImporteBase('')
      setConcepto('')
      setClienteSeleccionado(null)
      setClienteSearch('')

      // Refrescar listado
      await cargarFacturas()
    } catch (err) {
      console.error('Error inesperado en facturación directa:', err)
      alert(`Error inesperado emitiendo factura directa: ${err.message}`)
    } finally {
      setAplicandoFacturaDirecta(false)
    }
  }

  // ===================== PDF: VISOR / REGENERADOR PARA CUALQUIER FACTURA =====================
  const regenerarPDFDesdeDatos = async (factura) => {
    const datos = factura?.datos_factura || factura?.datos_json

    if (!datos) {
      console.error('No hay datos_factura ni datos_json para esta factura')
      alert('No hay datos de factura para regenerar el PDF')
      return
    }

    const numeroFactura = factura.numero_factura || datos.numero_factura || 'SIN-NUMERO'

    try {
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()

      doc.setFontSize(20)
      doc.setTextColor(33, 150, 243)
      doc.setFont(undefined, 'bold')
      doc.text(`FACTURA ${numeroFactura}`, pageWidth - 20, 25, { align: 'right' })

      const fecha = datos.fecha_emision
        ? new Date(datos.fecha_emision)
        : new Date(factura.fecha_emision || Date.now())
      const fechaFormateada = fecha.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      })
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text(`Fecha: ${fechaFormateada}`, pageWidth - 20, 35, { align: 'right' })

      let yPos = 50
      doc.setFontSize(12)
      doc.setFont(undefined, 'bold')
      doc.text('FACTURAR A:', 20, yPos)
      yPos += 8
      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')

      const receptor =
        datos.receptor ||
        datos.formFactura?.receptor ||
        datos.formFactura || {
          nombre: factura.cliente_nombre || ''
        }

      if (receptor.nombre) {
        doc.text(receptor.nombre, 20, yPos)
        yPos += 6
      }
      if (receptor.cif_nif || receptor.cif) {
        doc.text(`CIF/NIF: ${receptor.cif_nif || receptor.cif}`, 20, yPos)
        yPos += 6
      }
      if (receptor.direccion) {
        doc.text(receptor.direccion, 20, yPos)
        yPos += 6
      }

      yPos += 10
      doc.setFontSize(12)
      doc.setFont(undefined, 'bold')
      doc.text('CONCEPTO:', 20, yPos)
      yPos += 8
      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')

      const concepto =
        datos.concepto || datos.concepts?.concepto || factura.concepto || 'Servicios de viaje'
      doc.text(concepto, 20, yPos)
      yPos += 12

      const calc = datos.calcularBaseFactura || {}
      const baseImponible = parseFloat(calc.baseImponible || factura.base_imponible || 0) || 0
      const iva = parseFloat(calc.iva || 0) || 0
      const total =
        parseFloat(calc.totalFactura || datos.importe_total || factura.importe_total || 0) || 0

      doc.setFont(undefined, 'bold')
      doc.text('Base imponible:', 20, yPos)
      doc.text(`${baseImponible.toFixed(2)}€`, pageWidth - 20, yPos, { align: 'right' })
      yPos += 8
      doc.text('IVA:', 20, yPos)
      doc.text(`${iva.toFixed(2)}€`, pageWidth - 20, yPos, { align: 'right' })
      yPos += 10
      doc.setFontSize(14)
      doc.text('TOTAL:', 20, yPos)
      doc.text(`${total.toFixed(2)}€`, pageWidth - 20, yPos, { align: 'right' })

      doc.save(`Factura_${numeroFactura}.pdf`)
      alert('PDF regenerado y descargado correctamente')
    } catch (error) {
      console.error('Error generando PDF:', error)
      alert('Error generando PDF: ' + error.message)
    }
  }

  const verPDF = (factura) => {
    if (factura.url_pdf) {
      window.open(factura.url_pdf, '_blank')
      return
    }

    if (factura.datos_json || factura.datos_factura) {
      regenerarPDFDesdeDatos(factura)
      return
    }

    alert('No hay PDF ni datos para generar el documento.')
  }

  const totalFacturado = useMemo(() => {
    if (!facturas || facturas.length === 0) return 0
    return facturas.reduce((acc, f) => acc + (parseFloat(f.importe_total) || 0), 0)
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

      {/* PESTAÑAS: FACTURAS / CIERRES (LIQUIDACIÓN) */}
      <div className="mb-6 border-b border-slate-200">
        <div className="flex gap-1">
          <button
            onClick={() => setTabActiva('facturas')}
            className={`px-6 py-3 font-semibold transition-colors flex items-center gap-2 ${
              tabActiva === 'facturas'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Receipt size={18} />
            Facturas
          </button>
          <button
            onClick={() => setTabActiva('cierres')}
            className={`px-6 py-3 font-semibold transition-colors flex items-center gap-2 ${
              tabActiva === 'cierres'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingUp size={18} />
            Cierres (Liquidación)
          </button>
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
                    {clientesFiltrados.map((c) => (
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

              {/* Importe e IVA */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.18em] mb-2">
                    Base imponible
                  </label>
                  <div className="relative">
                    <Euro className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={importeBase}
                      onChange={(e) => setImporteBase(e.target.value)}
                      placeholder="0,00"
                      className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.18em] mb-2">
                    IVA (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={ivaPorcentaje}
                    onChange={(e) => setIvaPorcentaje(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Total estimado</span>
                    <span className="font-semibold text-slate-900">
                      {(() => {
                        const base = parseFloat(String(importeBase).replace(',', '.')) || 0
                        const ivaPct = parseFloat(String(ivaPorcentaje)) || 0
                        const iva = base * (ivaPct / 100)
                        const total = base + iva
                        return `${total.toFixed(2)} €`
                      })()}
                    </span>
                  </div>
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
                      Tipo
                    </th>
                    <th className="px-6 py-3 text-xs font-black uppercase tracking-[0.2em] text-left">
                      Cliente
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
                  {facturas.map((factura) => (
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
                      <td className="px-6 py-3 font-semibold text-slate-900">
                        {factura.numero_factura || '-'}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            factura.tipo_factura === 'DIRECTA'
                              ? 'bg-sky-100 text-sky-800'
                              : factura.tipo_factura === 'PASAJERO'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {factura.tipo_factura || 'N/D'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-700">
                        {factura.cliente_nombre || 'Sin cliente'}
                      </td>
                      <td className="px-6 py-3 text-right font-bold text-emerald-700">
                        {factura.importe_total
                          ? `${Number(factura.importe_total).toFixed(2)} €`
                          : '-'}
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
    </div>
  )
}

export default Cierres
