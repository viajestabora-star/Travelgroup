import React, { useState, useEffect } from 'react'
import { FileText, Save, Printer, X } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://gtwyqxfkpdwpakmgrkbu.supabase.co'
const SUPABASE_KEY = 'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Logo Tabora en Base64 (pendiente de incrustar)
const LOGO_TABORA_BASE64 = ''

// ============================================================================
// FUNCIONES HELPER: Blindaje contra NULLs
// ============================================================================
const safe = (value) => value || ''

// Función de prioridad inteligente para teléfono de proveedor
// Orden: movil -> telefono_fijo -> telefono
const obtenerTelefonoProveedor = (proveedor) => {
  if (!proveedor) return ''
  const movil = safe(proveedor.movil)
  if (movil) return movil
  const telefonoFijo = safe(proveedor.telefono_fijo)
  if (telefonoFijo) return telefonoFijo
  return safe(proveedor.telefono) || ''
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
const Composer = () => {
  // Estados
  const [proveedores, setProveedores] = useState([])
  const [expedientes, setExpedientes] = useState([])
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState('')
  const [expedienteSeleccionado, setExpedienteSeleccionado] = useState('')
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState('Bono')
  const [contenido, setContenido] = useState('')
  const [fechaServicio, setFechaServicio] = useState('')
  const [descripcionRuta, setDescripcionRuta] = useState('')
  const [recogidaDetalles, setRecogidaDetalles] = useState('')
  const [tlfGuia, setTlfGuia] = useState('')
  const [tlfResponsable, setTlfResponsable] = useState('')
  const [nPersonas, setNPersonas] = useState('')
  const [observacionesInternas, setObservacionesInternas] = useState('')
  const [guardando, setGuardando] = useState(false)

  // ============================================================================
  // CARGA INICIAL DE DATOS
  // ============================================================================
  useEffect(() => {
    const cargarDatos = async () => {
      try {
        const [provRes, expRes] = await Promise.all([
          supabase
            .from('proveedores')
            .select('id, nombre_comercial, direccion, poblacion, movil, telefono_fijo, telefono')
            .order('nombre_comercial', { ascending: true }),
          supabase
            .from('expedientes')
            .select('id, nombre_cliente, movil_guia, movil_responsable, destino, fecha_inicio, total_pax, descripcion_ruta')
            .order('fecha_inicio', { ascending: false }),
        ])

        if (!provRes.error && Array.isArray(provRes.data)) {
          setProveedores(provRes.data)
        } else if (provRes.error) {
          console.error('❌ Error cargando proveedores:', provRes.error)
        }

        if (!expRes.error && Array.isArray(expRes.data)) {
          setExpedientes(expRes.data)
        } else if (expRes.error) {
          console.error('❌ Error cargando expedientes:', expRes.error)
        }
      } catch (err) {
        console.error('❌ Error inesperado cargando datos:', err)
      }
    }

    cargarDatos()
  }, [])

  // ============================================================================
  // AUTOCOMPLETADO AL SELECCIONAR EXPEDIENTE
  // ============================================================================
  useEffect(() => {
    if (!expedienteSeleccionado) return
    
    const expediente = expedientes.find((e) => e.id === expedienteSeleccionado)
    if (!expediente) return

    // Título - siempre actualizar si hay nombre_cliente
    const nombreCliente = safe(expediente.nombre_cliente)
    if (nombreCliente && !titulo) {
      setTitulo(`Bono - ${nombreCliente}`)
    }

    // Fecha de servicio
    if (expediente.fecha_inicio) {
      try {
        const d = new Date(expediente.fecha_inicio)
        if (!isNaN(d.getTime())) {
          const dia = String(d.getDate()).padStart(2, '0')
          const mes = String(d.getMonth() + 1).padStart(2, '0')
          const año = d.getFullYear()
          setFechaServicio(`${dia}/${mes}/${año}`)
        }
      } catch {}
    }

    // Número de personas
    if (expediente.total_pax) {
      const totalPax = safe(expediente.total_pax)
      if (totalPax) {
        setNPersonas(String(totalPax))
      }
    }

    // Teléfono Guía - desde movil_guia
    const movilGuia = safe(expediente.movil_guia)
    setTlfGuia(movilGuia)

    // Teléfono Responsable - desde movil_responsable
    const movilResponsable = safe(expediente.movil_responsable)
    setTlfResponsable(movilResponsable)

    // Descripción de ruta
    const descRuta = safe(expediente.descripcion_ruta)
    if (descRuta) {
      setDescripcionRuta(descRuta)
    }
  }, [expedienteSeleccionado, expedientes])

  // ============================================================================
  // HANDLERS DE SELECCIÓN
  // ============================================================================
  const handleProveedorChange = (e) => {
    const proveedorId = e.target.value || ''
    setProveedorSeleccionado(proveedorId)
  }

  const handleExpedienteChange = (e) => {
    const expedienteId = e.target.value || ''
    setExpedienteSeleccionado(expedienteId)
  }

  // ============================================================================
  // GUARDAR EN PLANTILLAS_VIAJES
  // ============================================================================
  const handleGuardar = async () => {
    if (!titulo.trim()) {
      alert('Por favor, rellena al menos el título.')
      return
    }

    if (!proveedorSeleccionado || !expedienteSeleccionado) {
      alert('Selecciona un proveedor y un expediente antes de guardar.')
      return
    }

    try {
      setGuardando(true)

      const safeValue = (v) => {
        if (v === undefined || v === null) return null
        if (typeof v === 'string' && v.trim() === '') return null
        return v
      }

      const nPersonasNumber = nPersonas && !isNaN(parseInt(nPersonas, 10)) ? parseInt(nPersonas, 10) : null

      const datosParaGuardar = {
        titulo: safeValue(titulo.trim()),
        tipo: safeValue(tipo || 'Bono'),
        contenido: safeValue(contenido),
        fecha_servicio: safeValue(fechaServicio),
        descripcion_ruta: safeValue(descripcionRuta),
        recogida_detalles: safeValue(recogidaDetalles),
        tlf_guia: safeValue(tlfGuia),
        tlf_responsable: safeValue(tlfResponsable),
        n_personas: nPersonasNumber,
      }

      const { error } = await supabase
        .from('plantillas_viajes')
        .insert([datosParaGuardar])

      if (error) {
        console.error('❌ Error guardando bono:', error)
        alert(`Error al guardar el bono: ${error.message}`)
        return
      }

      alert('✅ Bono guardado con éxito')
    } catch (err) {
      console.error('❌ Error inesperado guardando plantilla:', err)
      alert('Error inesperado al guardar la plantilla')
    } finally {
      setGuardando(false)
    }
  }

  // ============================================================================
  // IMPRIMIR BONO
  // ============================================================================
  const handleImprimirBono = () => {
    if (!proveedorSeleccionado || !expedienteSeleccionado) {
      alert('Selecciona un proveedor y un expediente antes de imprimir.')
      return
    }
    window.print()
  }

  // ============================================================================
  // LIMPIAR FORMULARIO
  // ============================================================================
  const handleLimpiar = () => {
    setTitulo('')
    setTipo('Bono')
    setContenido('')
    setFechaServicio('')
    setDescripcionRuta('')
    setRecogidaDetalles('')
    setTlfGuia('')
    setTlfResponsable('')
    setNPersonas('')
    setObservacionesInternas('')
    setProveedorSeleccionado('')
    setExpedienteSeleccionado('')
  }

  // ============================================================================
  // DATOS ACTUALES PARA VISTA PREVIA
  // ============================================================================
  const proveedor = proveedores.find((p) => p.id === proveedorSeleccionado)
  const expediente = expedientes.find((e) => e.id === expedienteSeleccionado)
  const telefonoProveedor = obtenerTelefonoProveedor(proveedor)

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="p-6">
      <style>
        {`
        @media print {
          @page {
            size: A4;
            margin: 10mm;
          }

          body {
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background: white !important;
          }

          /* Ocultar toda la interfaz del CRM */
          aside, .sidebar, nav, button, .no-print, header, 
          .navbar, .menu, .sidebar-menu, [class*="sidebar"], 
          [class*="menu"], [class*="nav"], [role="navigation"],
          [class*="header"], [class*="Header"] {
            display: none !important;
            visibility: hidden !important;
          }

          .bono-container {
            width: 100% !important;
            max-width: 100% !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          .bono-print {
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            border: 1px solid #e5e7eb !important;
            padding: 20mm !important;
            background: white !important;
            margin: 0 auto !important;
          }

          .logo-tabora {
            display: block !important;
            max-width: 200px !important;
            height: auto !important;
          }
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
            {/* Selectores */}
            <div className="no-print grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Proveedor
                </label>
                <select
                  value={proveedorSeleccionado}
                  onChange={handleProveedorChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Selecciona un proveedor...</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {safe(p.nombre_comercial) || 'Proveedor sin nombre'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Expediente / Cliente
                </label>
                <select
                  value={expedienteSeleccionado}
                  onChange={handleExpedienteChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Selecciona un expediente...</option>
                  {expedientes.map((exp) => (
                    <option key={exp.id} value={exp.id}>
                      {safe(exp.nombre_cliente) || 'Cliente sin nombre'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Formulario y Vista Previa */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Columna Izquierda: Formulario */}
              <div className="no-print space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Título *
                  </label>
                  <input
                    type="text"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ej: Bono de Bus - Cliente"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tipo
                  </label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="Bono">Bono</option>
                    <option value="Voucher">Voucher</option>
                    <option value="Itinerario">Itinerario</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fecha de servicio
                    </label>
                    <input
                      type="text"
                      value={fechaServicio}
                      onChange={(e) => setFechaServicio(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="DD/MM/YYYY"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Total personas
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={nPersonas}
                      onChange={(e) => setNPersonas(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: 42"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Descripción / Ruta
                  </label>
                  <textarea
                    value={descripcionRuta}
                    onChange={(e) => setDescripcionRuta(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[100px]"
                    placeholder="Descripción del viaje o ruta..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Detalle de recogidas
                  </label>
                  <textarea
                    value={recogidaDetalles}
                    onChange={(e) => setRecogidaDetalles(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[80px]"
                    placeholder="Ej: 08:00h C/ Luis Vives s/n (frente al instituto). 42 pax"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Teléfono Guía
                    </label>
                    <input
                      type="text"
                      value={tlfGuia}
                      onChange={(e) => setTlfGuia(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: 658 066 849"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Teléfono Jefe Grupo
                    </label>
                    <input
                      type="text"
                      value={tlfResponsable}
                      onChange={(e) => setTlfResponsable(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ej: 653 86 30 20"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contenido adicional
                  </label>
                  <textarea
                    value={contenido}
                    onChange={(e) => setContenido(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[100px]"
                    placeholder="Contenido adicional del bono..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Observaciones internas
                  </label>
                  <textarea
                    value={observacionesInternas}
                    onChange={(e) => setObservacionesInternas(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[80px]"
                    placeholder="Notas internas para logística / guía..."
                  />
                </div>

                {/* Botones de acción */}
                <div className="flex flex-wrap gap-3 pt-4">
                  <button
                    onClick={handleGuardar}
                    disabled={guardando}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-semibold"
                  >
                    <Save size={18} />
                    {guardando ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button
                    type="button"
                    onClick={handleImprimirBono}
                    className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-2 text-sm font-semibold"
                  >
                    <Printer size={18} />
                    Imprimir
                  </button>
                  <button
                    type="button"
                    onClick={handleLimpiar}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex items-center gap-2 text-sm font-semibold"
                  >
                    <X size={18} />
                    Limpiar
                  </button>
                </div>
              </div>

              {/* Columna Derecha: Vista Previa del Bono */}
              <div className="bono-print border rounded-xl p-6 bg-white shadow-inner">
                {/* Encabezado con Logo */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex flex-col items-start">
                    {LOGO_TABORA_BASE64 && (
                      <img
                        src={LOGO_TABORA_BASE64}
                        alt="Viajes Tabora"
                        className="logo-tabora h-12 object-contain mb-1"
                      />
                    )}
                  </div>
                  <div className="text-right text-xs text-gray-600">
                    <div className="font-semibold">VIAJES TABORA</div>
                    <div>C/ Santa Amalia, nº 2 Entresuelo 2º Of. L1</div>
                    <div>46009 Valencia (ESP)</div>
                    <div>Tel: +34 96 339 04 64</div>
                  </div>
                </div>

                {/* Título del Bono */}
                <div className="text-center mb-4">
                  <div className="text-sm font-bold tracking-wide uppercase">BONO/VOUCHER</div>
                  <div className="text-xs text-gray-600 mt-1">
                    Fecha de emisión: {new Date().toLocaleDateString('es-ES')}
                  </div>
                </div>

                {/* Información del Proveedor */}
                <div className="border rounded-lg p-3 mb-3 text-xs">
                  <div className="font-semibold mb-2">Proveedor</div>
                  {proveedor ? (
                    <div>
                      <div className="font-medium">{safe(proveedor.nombre_comercial)}</div>
                      {safe(proveedor.direccion) && (
                        <div className="text-gray-600 mt-1">{safe(proveedor.direccion)}</div>
                      )}
                      {safe(proveedor.poblacion) && (
                        <div className="text-gray-600">{safe(proveedor.poblacion)}</div>
                      )}
                      {telefonoProveedor && (
                        <div className="text-gray-600 mt-1">Tel: {telefonoProveedor}</div>
                      )}
                    </div>
                  ) : (
                    <div className="text-gray-400 italic">Selecciona un proveedor</div>
                  )}
                </div>

                {/* Información del Cliente */}
                <div className="border rounded-lg p-3 mb-3 text-xs">
                  <div className="font-semibold mb-2">Cliente / Grupo</div>
                  {expediente ? (
                    <div>
                      <div className="font-medium">{safe(expediente.nombre_cliente) || 'Cliente'}</div>
                      {safe(expediente.destino) && (
                        <div className="text-gray-600 mt-1">Destino: {safe(expediente.destino)}</div>
                      )}
                    </div>
                  ) : (
                    <div className="text-gray-400 italic">Selecciona un expediente</div>
                  )}
                </div>

                {/* Servicios Solicitados */}
                <div className="mt-4 text-xs text-gray-800 space-y-2">
                  <div className="font-semibold mb-2">
                    Rogamos facilitar los siguientes servicios:
                  </div>
                  <div>
                    <span className="font-semibold">Fecha servicio: </span>
                    {safe(fechaServicio) || '____/____/______'}
                  </div>
                  <div>
                    <span className="font-semibold">Descripción / Ruta: </span>
                    {safe(descripcionRuta) || (safe(expediente?.destino) ? `Circuito ${safe(expediente.destino)}` : '_______________________________')}
                  </div>
                  <div>
                    <span className="font-semibold">Recogida: </span>
                    {safe(recogidaDetalles) || '_______________________________'}
                  </div>
                  <div>
                    <span className="font-semibold">Teléfono Guía: </span>
                    {safe(tlfGuia) || '________________'}
                  </div>
                  <div>
                    <span className="font-semibold">Teléfono Jefe Grupo: </span>
                    {safe(tlfResponsable) || '________________'}
                  </div>
                  <div>
                    <span className="font-semibold">Total personas: </span>
                    {safe(nPersonas) || '___'}
                  </div>
                </div>

                {/* Contenido adicional */}
                {contenido && (
                  <div className="mt-4 text-xs">
                    <div className="font-semibold mb-1">Información adicional:</div>
                    <div className="text-gray-700 whitespace-pre-line">{safe(contenido)}</div>
                  </div>
                )}

                {/* Observaciones */}
                <div className="mt-4 text-xs">
                  <div className="font-semibold mb-1">Observaciones:</div>
                  <div className="min-h-[40px] border border-dashed border-gray-300 rounded-md p-2 whitespace-pre-line">
                    {safe(observacionesInternas) || '___________________________________________'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Composer
