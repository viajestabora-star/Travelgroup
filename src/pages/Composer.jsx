import React, { useState, useEffect, useRef, useCallback } from 'react'
import { FileText, Save, Printer, X, FileDown } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { convertirISOAEspañol, convertirEspañolAISO } from '../utils/dateNormalizer'
import jsPDF from 'jspdf'

// Logo Tabora - URL oficial
const LOGO_TABORA = "https://gtwyqxfkpdwpakmgrkbu.supabase.co/storage/v1/object/public/branding/Logo%20tabora%202023.png"

// ============================================================================
// FUNCIONES HELPER: Blindaje contra NULLs
// ============================================================================
const safe = (value) => value || ''

// ============================================================================
// VOUCHER PREVIEW - Memoizado para evitar re-renders innecesarios
// ============================================================================
const VoucherPreview = React.memo(function VoucherPreview({
  nombreClienteGrupo,
  expedienteDestino,
  expedienteClienteNombre,
  descripcionRuta,
  recogidaDetalles,
  tlfGuia,
  tlfResponsable,
  nPersonas,
  contenido,
  observacionesInternas,
  fechaInicio,
  fechaFin,
  proveedorNombre,
  direccion,
  poblacion,
  telefono,
}) {
  const destinoTexto = safe(expedienteDestino)
  const clienteTexto = safe(nombreClienteGrupo) || safe(expedienteClienteNombre) || '—'
  const descRutaTexto = safe(descripcionRuta) || (destinoTexto ? `Circuito ${destinoTexto}` : '_______________________________')

  return (
    <div className="bono-print border rounded-xl p-6 bg-white shadow-inner">
      <div className="flex justify-between items-center mb-4">
        <div className="flex-shrink-0">
          <img src={LOGO_TABORA} alt="Tabora" className="h-20 w-auto object-contain print:h-24 logo-tabora" />
        </div>
        <div className="text-right text-xs text-gray-600">
          <div className="font-semibold">VIAJES TABORA</div>
          <div>C/ Santa Amalia, nº 2 Entresuelo 2º Of. L1</div>
          <div>46009 Valencia (ESP)</div>
          <div>Tel: +34 96 339 04 64</div>
        </div>
      </div>

      <div className="text-center mb-4">
        <div className="text-sm font-bold tracking-wide uppercase">BONO/VOUCHER</div>
        <div className="text-xs text-gray-600 mt-1">Fecha de emisión: {new Date().toLocaleDateString('es-ES')}</div>
      </div>

      <div className="border rounded-lg p-3 mb-3 text-xs">
        <div className="font-semibold mb-2">Proveedor</div>
        {proveedorNombre ? (
          <div>
            <div className="font-medium">{proveedorNombre}</div>
            {direccion && <div className="text-gray-600 mt-1">{direccion}</div>}
            {poblacion && <div className="text-gray-600">{poblacion}</div>}
            {telefono && <div className="text-gray-600 mt-1">Tel: {telefono}</div>}
          </div>
        ) : (
          <div className="text-gray-400 italic">Selecciona un proveedor</div>
        )}
      </div>

      <div className="border rounded-lg p-3 mb-3 text-xs">
        <div className="font-semibold mb-2">Cliente / Grupo</div>
        <div className="font-medium text-slate-800 text-base">{clienteTexto}</div>
        {destinoTexto && <div className="text-gray-600 mt-1">Destino: {destinoTexto}</div>}
      </div>

      <div className="mt-4 text-xs text-gray-800 space-y-2">
        <div className="font-semibold mb-2">Rogamos facilitar los siguientes servicios:</div>
        <div>
          <span className="font-semibold">Del </span>
          {fechaInicio ? convertirISOAEspañol(fechaInicio) : '____/____/______'}
          <span className="font-semibold"> al </span>
          {fechaFin ? convertirISOAEspañol(fechaFin) : '____/____/______'}
        </div>
        <div><span className="font-semibold">Descripción / Ruta: </span>{descRutaTexto}</div>
        <div><span className="font-semibold">Recogida: </span>{safe(recogidaDetalles) || '_______________________________'}</div>
        <div><span className="font-semibold">Teléfono Guía: </span>{safe(tlfGuia) || '________________'}</div>
        <div><span className="font-semibold">Teléfono Jefe Grupo: </span>{safe(tlfResponsable) || '________________'}</div>
        <div><span className="font-semibold">Total personas: </span>{safe(nPersonas) || '___'}</div>
      </div>

      {contenido && (
        <div className="mt-4 text-xs">
          <div className="font-semibold mb-1">Información adicional:</div>
          <div className="text-gray-700 whitespace-pre-line">{contenido}</div>
        </div>
      )}

      <div className="mt-4 text-xs">
        <div className="font-semibold mb-1">Observaciones:</div>
        <div className="min-h-[40px] border border-dashed border-gray-300 rounded-md p-2 whitespace-pre-line">
          {safe(observacionesInternas) || '___________________________________________'}
        </div>
      </div>
    </div>
  )
})

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
const Composer = () => {
  const [proveedorId, setProveedorId] = useState('')
  const [expedienteId, setExpedienteId] = useState('')
  const [referenciaProveedor, setReferenciaProveedor] = useState('')
  const [contenido, setContenido] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [nombreClienteGrupo, setNombreClienteGrupo] = useState('')
  const [descripcionRuta, setDescripcionRuta] = useState('')
  const [recogidaDetalles, setRecogidaDetalles] = useState('')
  const [tlfGuia, setTlfGuia] = useState('')
  const [tlfResponsable, setTlfResponsable] = useState('')
  const [nPersonas, setNPersonas] = useState('')
  const [observacionesInternas, setObservacionesInternas] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [poblacion, setPoblacion] = useState('')

  const [proveedores, setProveedores] = useState([])
  const [expedientes, setExpedientes] = useState([])
  const [guardando, setGuardando] = useState(false)

  const [searchParams] = useSearchParams()
  const bonoId = searchParams.get('bonoId') || ''
  const lastLoadedBonoIdRef = useRef(null)

  // ============================================================================
  // CARGA INICIAL DE DATOS (solo al montar)
  // ============================================================================
  useEffect(() => {
    const cargarDatos = async () => {
      try {
        const [provRes, expRes] = await Promise.all([
          supabase.from('proveedores').select('id, nombre_comercial, direccion, poblacion, movil, telefono_fijo, telefono').order('nombre_comercial', { ascending: true }),
          supabase.from('expedientes').select('*').order('fecha_inicio', { ascending: true, nullsFirst: false }),
        ])
        if (!provRes.error && Array.isArray(provRes.data)) setProveedores(provRes.data)
        if (!expRes.error && Array.isArray(expRes.data)) setExpedientes(expRes.data)
      } catch (err) {}
    }
    cargarDatos()
  }, [])

  // ============================================================================
  // CARGA BONO DESDE URL (?bonoId=xxx) - Dependencias primitivas + guardia
  // ============================================================================
  useEffect(() => {
    if (!bonoId) return
    if (lastLoadedBonoIdRef.current === bonoId) return
    lastLoadedBonoIdRef.current = bonoId

    const cargarBono = async () => {
      const { data, error } = await supabase.from('bonos_generados').select('*').eq('id', bonoId).single()
      if (error || !data) return

      const d = data.datos_completos || data
      setExpedienteId(data.expediente_id || '')
      setProveedorId(String(d.proveedorId ?? data.proveedor_id ?? ''))
      setReferenciaProveedor(d.referenciaProveedor || data.referencia_proveedor || '')
      setNombreClienteGrupo(d.nombreClienteGrupo || data.nombre_cliente_grupo || '')
      setContenido(d.contenido || data.contenido || '')
      setFechaInicio(d.fechaInicio || data.fecha_inicio || '')
      setFechaFin(d.fechaFin || data.fecha_fin || '')
      setDescripcionRuta(d.descripcionRuta || data.descripcion_ruta || '')
      setRecogidaDetalles(d.recogidaDetalles || data.recogida_detalles || '')
      setTlfGuia(d.tlfGuia || data.tlf_guia || '')
      setTlfResponsable(d.tlfResponsable || data.tlf_responsable || '')
      setNPersonas(d.nPersonas != null ? String(d.nPersonas) : (data.n_personas != null ? String(data.n_personas) : ''))
      setObservacionesInternas(d.observacionesInternas || data.observaciones_internas || '')
      setTelefono(d.telefono || '')
      setDireccion(d.direccion || '')
      setPoblacion(d.poblacion || '')
    }

    cargarBono()
  }, [bonoId])

  // ============================================================================
  // HANDLERS (estables con useCallback donde se pasen como deps)
  // ============================================================================
  const handleProveedorChange = useCallback((e) => {
    const selectedId = e.target.value
    setProveedorId(selectedId)
    if (selectedId) {
      const p = proveedores.find((item) => String(item.id) === String(selectedId))
      if (p) {
        setTelefono(p.movil || p.telefono_fijo || p.telefono || '')
        setDireccion(p.direccion || '')
        setPoblacion(p.poblacion || '')
      }
    }
  }, [proveedores])

  const handleExpedienteChange = useCallback((e) => {
    const id = e.target.value
    setExpedienteId(id)
    const exp = expedientes.find((item) => item.id === id)
    if (exp) {
      setNombreClienteGrupo(exp.cliente_nombre || exp.nombre_grupo || '')
      const fIni = exp.fecha_inicio || exp.fechaInicio || ''
      const fFin = exp.fecha_final || exp.fecha_fin || exp.fechaFin || ''
      setFechaInicio(/^\d{4}-\d{2}-\d{2}$/.test(fIni) ? fIni : (convertirEspañolAISO(fIni) || ''))
      setFechaFin(/^\d{4}-\d{2}-\d{2}$/.test(fFin) ? fFin : (convertirEspañolAISO(fFin) || ''))
      setNPersonas(exp.total_pax ? String(exp.total_pax) : '')
      setTlfGuia(exp.movil_guia || '')
      setTlfResponsable(exp.movil_responsable || '')
      setDescripcionRuta((prev) => {
        const descRuta = safe(exp.descripcion_ruta)
        return descRuta && !prev ? descRuta : prev
      })
    }
  }, [expedientes])

  const safeValue = useCallback((v) => {
    if (v === undefined || v === null) return null
    if (typeof v === 'string' && v.trim() === '') return null
    return v
  }, [])

  const guardarEnBonosGenerados = useCallback(async () => {
    if (!proveedorId || !expedienteId) return { error: { message: 'Selecciona proveedor y expediente' } }
    const nPersonasNumber = nPersonas && !isNaN(parseInt(nPersonas, 10)) ? parseInt(nPersonas, 10) : null
    const datosParaGuardar = {
      expediente_id: expedienteId,
      proveedor_id: parseInt(proveedorId, 10),
      referencia_proveedor: safeValue(referenciaProveedor.trim()),
      nombre_cliente_grupo: safeValue(nombreClienteGrupo),
      contenido: safeValue(contenido),
      fecha_inicio: safeValue(fechaInicio) || null,
      fecha_fin: safeValue(fechaFin) || null,
      descripcion_ruta: safeValue(descripcionRuta),
      recogida_detalles: safeValue(recogidaDetalles),
      tlf_guia: safeValue(tlfGuia),
      tlf_responsable: safeValue(tlfResponsable),
      n_personas: nPersonasNumber,
      observaciones_internas: safeValue(observacionesInternas),
      datos_completos: {
        proveedorId,
        expedienteId,
        referenciaProveedor,
        nombreClienteGrupo,
        contenido,
        fechaInicio: fechaInicio || null,
        fechaFin: fechaFin || null,
        descripcionRuta: descripcionRuta || null,
        recogidaDetalles: recogidaDetalles || null,
        tlfGuia: tlfGuia || null,
        tlfResponsable: tlfResponsable || null,
        nPersonas: nPersonas || null,
        observacionesInternas: observacionesInternas || null,
        telefono: telefono || null,
        direccion: direccion || null,
        poblacion: poblacion || null,
      },
    }
    const { error } = await supabase.from('bonos_generados').insert([datosParaGuardar])
    return { error }
  }, [
    proveedorId,
    expedienteId,
    referenciaProveedor,
    nombreClienteGrupo,
    contenido,
    fechaInicio,
    fechaFin,
    descripcionRuta,
    recogidaDetalles,
    tlfGuia,
    tlfResponsable,
    nPersonas,
    observacionesInternas,
    telefono,
    direccion,
    poblacion,
  ])

  const handleGuardarEnExpediente = useCallback(async () => {
    if (!proveedorId || !expedienteId) {
      alert('Selecciona un proveedor y un expediente antes de guardar.')
      return
    }
    try {
      setGuardando(true)
      const { error } = await guardarEnBonosGenerados()
      if (error) {
        alert(`Error al guardar el bono: ${error.message}`)
        return
      }
      alert('✅ Bono guardado en el expediente')
    } catch (err) {
      alert('Error inesperado al guardar el bono')
    } finally {
      setGuardando(false)
    }
  }, [proveedorId, expedienteId, guardarEnBonosGenerados])

  const handleDescargarPDF = useCallback(async () => {
    if (!proveedorId || !expedienteId) {
      alert('Selecciona un proveedor y un expediente antes de descargar.')
      return
    }
    try {
      setGuardando(true)
      const { error } = await guardarEnBonosGenerados()
      if (error) {
        alert(`Error al guardar el bono: ${error.message}`)
        return
      }
      const expediente = expedientes.find((e) => e.id === expedienteId)
      const proveedor = proveedores.find((p) => String(p.id) === String(proveedorId))
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const margin = 15
      let y = 20

      doc.setFontSize(14)
      doc.text('BONO/VOUCHER', pageWidth / 2, y, { align: 'center' })
      y += 8
      doc.setFontSize(9)
      doc.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-ES')}`, pageWidth / 2, y, { align: 'center' })
      y += 12

      doc.setFontSize(10)
      doc.setFont(undefined, 'bold')
      doc.text('Proveedor', margin, y)
      y += 6
      doc.setFont(undefined, 'normal')
      if (proveedor) {
        doc.text(safe(proveedor.nombre_comercial), margin, y)
        y += 5
        if (direccion) { doc.text(direccion, margin, y); y += 5 }
        if (poblacion) { doc.text(poblacion, margin, y); y += 5 }
        if (telefono) { doc.text(`Tel: ${telefono}`, margin, y); y += 5 }
      } else {
        doc.text('—', margin, y)
        y += 5
      }
      y += 4

      doc.setFont(undefined, 'bold')
      doc.text('Cliente / Grupo', margin, y)
      y += 6
      doc.setFont(undefined, 'normal')
      doc.text(safe(nombreClienteGrupo) || (expediente ? (safe(expediente.cliente_nombre) || safe(expediente.nombre_grupo)) : '') || '—', margin, y)
      y += 8

      doc.setFont(undefined, 'bold')
      doc.text('Servicios solicitados:', margin, y)
      y += 6
      doc.setFont(undefined, 'normal')
      doc.text(`Del ${fechaInicio ? convertirISOAEspañol(fechaInicio) : '____/____/______'} al ${fechaFin ? convertirISOAEspañol(fechaFin) : '____/____/______'}`, margin, y)
      y += 5
      doc.text(`Descripción / Ruta: ${safe(descripcionRuta) || (expediente?.destino ? `Circuito ${safe(expediente.destino)}` : '—')}`, margin, y)
      y += 5
      doc.text(`Recogida: ${safe(recogidaDetalles) || '—'}`, margin, y)
      y += 5
      doc.text(`Teléfono Guía: ${safe(tlfGuia) || '—'}`, margin, y)
      y += 5
      doc.text(`Teléfono Jefe Grupo: ${safe(tlfResponsable) || '—'}`, margin, y)
      y += 5
      doc.text(`Total personas: ${safe(nPersonas) || '—'}`, margin, y)
      y += 8

      if (contenido) {
        doc.setFont(undefined, 'bold')
        doc.text('Información adicional:', margin, y)
        y += 6
        doc.setFont(undefined, 'normal')
        const lineas = doc.splitTextToSize(safe(contenido), pageWidth - 2 * margin)
        doc.text(lineas, margin, y)
        y += lineas.length * 5 + 4
      }

      doc.setFont(undefined, 'bold')
      doc.text('Observaciones:', margin, y)
      y += 6
      doc.setFont(undefined, 'normal')
      doc.text(safe(observacionesInternas) || '—', margin, y)

      const nombreArchivo = `Bono_${expediente?.numero_expediente || expedienteId?.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.pdf`
      doc.save(nombreArchivo)
      alert('✅ PDF descargado y bono guardado en el expediente')
    } catch (err) {
      alert('Error al generar el PDF')
    } finally {
      setGuardando(false)
    }
  }, [proveedorId, expedienteId, expedientes, proveedores, guardarEnBonosGenerados, nombreClienteGrupo, descripcionRuta, recogidaDetalles, tlfGuia, tlfResponsable, nPersonas, contenido, observacionesInternas, direccion, poblacion, telefono, fechaInicio, fechaFin])

  const handleImprimirBono = useCallback(() => {
    if (!proveedorId || !expedienteId) {
      alert('Selecciona un proveedor y un expediente antes de imprimir.')
      return
    }
    window.print()
  }, [proveedorId, expedienteId])

  const handleLimpiar = useCallback(() => {
    lastLoadedBonoIdRef.current = null
    setReferenciaProveedor('')
    setContenido('')
    setFechaInicio('')
    setFechaFin('')
    setNombreClienteGrupo('')
    setDescripcionRuta('')
    setRecogidaDetalles('')
    setTlfGuia('')
    setTlfResponsable('')
    setNPersonas('')
    setObservacionesInternas('')
    setProveedorId('')
    setExpedienteId('')
    setTelefono('')
    setDireccion('')
    setPoblacion('')
  }, [])

  // Datos derivados (primitivos para VoucherPreview)
  const proveedor = proveedores.find((p) => String(p.id) === String(proveedorId))
  const expediente = expedientes.find((e) => e.id === expedienteId)

  return (
    <div className="p-6">
      <style>
        {`
        @media print {
          @page { size: A4; margin: 10mm; }
          body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white !important; }
          aside, .sidebar, nav, button, .no-print, header, .navbar, .menu, .sidebar-menu, [class*="sidebar"], [class*="menu"], [class*="nav"], [role="navigation"], [class*="header"], [class*="Header"] { display: none !important; visibility: hidden !important; }
          .bono-container { width: 100% !important; max-width: 100% !important; position: absolute !important; top: 0 !important; left: 0 !important; margin: 0 !important; padding: 0 !important; background: white !important; }
          .bono-print { width: 100% !important; max-width: 100% !important; box-shadow: none !important; border: 1px solid #e5e7eb !important; padding: 20mm !important; background: white !important; margin: 0 auto !important; }
          .logo-tabora { display: block !important; max-width: 200px !important; height: auto !important; object-fit: contain !important; image-rendering: -webkit-optimize-contrast !important; image-rendering: crisp-edges !important; page-break-inside: avoid !important; }
        }
        `}
      </style>

      <div className="bono-container max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="no-print flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <FileText className="text-slate-600" size={28} />
              Composer - Generador de Bonos
            </h1>
          </div>

          <div className="space-y-6">
            <div className="no-print grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Proveedor</label>
                <select onChange={handleProveedorChange} value={proveedorId} className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option value="">Selecciona un proveedor...</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre_comercial || 'Proveedor sin nombre'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Expediente / Cliente</label>
                <select onChange={handleExpedienteChange} value={expedienteId} className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option value="">Selecciona un expediente...</option>
                  {(expedientes || []).map((exp) => {
                    const codigo = safe(exp.numero_expediente)
                    const destino = safe(exp.destino)
                    const cliente = safe(exp.cliente_nombre || exp.nombre_grupo)
                    const label = [codigo, destino, cliente].filter(Boolean).join(' - ') || 'Sin datos'
                    return <option key={exp.id} value={exp.id}>{label}</option>
                  })}
                </select>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="no-print space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nombre del Cliente / Grupo *</label>
                  <input type="text" value={nombreClienteGrupo} onChange={(e) => setNombreClienteGrupo(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Se rellena al seleccionar expediente" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Referencia para el Proveedor</label>
                  <input type="text" value={referenciaProveedor} onChange={(e) => setReferenciaProveedor(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Ej: Reserva Hotel / Servicio Bus" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Fecha Inicio</label>
                    <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Fecha Fin</label>
                    <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Total personas</label>
                    <input type="number" min="1" value={nPersonas} onChange={(e) => setNPersonas(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Ej: 42" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Descripción / Ruta</label>
                  <textarea value={descripcionRuta} onChange={(e) => setDescripcionRuta(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[100px]" placeholder="Descripción del viaje o ruta..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Detalle de recogidas</label>
                  <textarea value={recogidaDetalles} onChange={(e) => setRecogidaDetalles(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[80px]" placeholder="Ej: 08:00h C/ Luis Vives s/n (frente al instituto). 42 pax" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Teléfono Guía</label>
                    <input type="text" value={tlfGuia} onChange={(e) => setTlfGuia(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Ej: 658 066 849" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Teléfono Jefe Grupo</label>
                    <input type="text" value={tlfResponsable} onChange={(e) => setTlfResponsable(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Ej: 653 86 30 20" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contenido adicional</label>
                  <textarea value={contenido} onChange={(e) => setContenido(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[100px]" placeholder="Contenido adicional del bono..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Observaciones internas</label>
                  <textarea value={observacionesInternas} onChange={(e) => setObservacionesInternas(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[80px]" placeholder="Notas internas para logística / guía..." />
                </div>
                <div className="flex flex-wrap gap-3 pt-4">
                  <button onClick={handleGuardarEnExpediente} disabled={guardando} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-semibold">
                    <Save size={18} />{guardando ? 'Guardando...' : 'Guardar en Expediente'}
                  </button>
                  <button type="button" onClick={handleDescargarPDF} disabled={guardando} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-60 flex items-center gap-2 text-sm font-semibold">
                    <FileDown size={18} />Descargar PDF
                  </button>
                  <button type="button" onClick={handleImprimirBono} className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-2 text-sm font-semibold">
                    <Printer size={18} />Imprimir
                  </button>
                  <button type="button" onClick={handleLimpiar} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex items-center gap-2 text-sm font-semibold">
                    <X size={18} />Limpiar
                  </button>
                </div>
              </div>

              <VoucherPreview
                nombreClienteGrupo={nombreClienteGrupo}
                expedienteDestino={expediente?.destino ?? ''}
                expedienteClienteNombre={expediente ? (expediente.cliente_nombre || expediente.nombre_grupo) : ''}
                descripcionRuta={descripcionRuta}
                recogidaDetalles={recogidaDetalles}
                tlfGuia={tlfGuia}
                tlfResponsable={tlfResponsable}
                nPersonas={nPersonas}
                contenido={contenido}
                observacionesInternas={observacionesInternas}
                fechaInicio={fechaInicio}
                fechaFin={fechaFin}
                proveedorNombre={proveedor?.nombre_comercial ?? ''}
                direccion={direccion}
                poblacion={poblacion}
                telefono={telefono}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Composer
