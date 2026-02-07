import React, { useState, useEffect } from 'react'
import { FileText, Save, X, Printer } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://gtwyqxfkpdwpakmgrkbu.supabase.co'
const SUPABASE_KEY = 'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Logo Tabora en Base64
const LOGO_TABORA_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK6eAAAACXBIWXMAAAsTAAALEwEAmpwYAAAF8WlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNy4xLWMwMDAgNzkuZWRhMmIzZmFjLCAyMDIxLzExLzE3LTE3OjIzOjE5ICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtbG5zOmRjPSJodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLyIgeG1sbnM6cGhvdG9zaG9wPSJodHRwOi8vbnMuYWRvYmUuY29tL3Bob3Rvc2hvcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgMjMuMSAoV2luZG93cykiIHhtcDpDcmVhdGVEYXRlPSIyMDI0LTAxLTE1VDEwOjAwOjAwKzAxOjAwIiB4bXA6TW9kaWZ5RGF0ZT0iMjAyNC0wMS0xNVQxMDowMDowMCswMTowMCIgeG1wOk1ldGFkYXRhRGF0ZT0iMjAyNC0wMS0xNVQxMDowMDowMCswMTowMCIgZGM6Zm9ybWF0PSJpbWFnZS9wbmciIHBob3Rvc2hvcDpDb2xvck1vZGU9IjMiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6ZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmYiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6ZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmYiIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDpmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmYiPiA8eG1wTU06SGlzdG9yeT4gPHJkZjpTZXE+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJjcmVhdGVkIiBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZiIgc3RFdnQ6d2hlbj0iMjAyNC0wMS0xNVQxMDowMDowMCswMTowMCIgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIDIzLjEgKFdpbmRvd3MpIi8+IDwvcmRmOlNlcT4gPC94bXBNTTpIaXN0b3J5PiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI/PgH//v38+/r5+Pf29fTz8vHw7+7t7Ovq6ejn5uXk4+Lh4N/e3dzb2tnY19bV1NPS0dDPzs3My8rJyMfGxcTDwsHAv769vLu6ubi3trW0s7KxsK+urayrqqmop6alpKOioaCfnp2cm5qZmJeWlZSTkpGQj46NjIuKiYiHhoWEg4KBgH9+fXx7enl4d3Z1dHNycXBvbm1sa2ppaGdmZWRjYmFgX15dXFtaWVhXVlVUU1JRUE9OTUxLSklIR0ZFRENCQUA/Pj08Ozo5ODc2NTQzMjEwLy4tLCsqKSgnJiUkIyIhIB8eHRwbGhkYFxYVFBMSERAPDg0MCwoJCAcGBQQDAgEAACH5BAEAAAEALAAAAAABAAEAAAICRAEAOw=='

const Composer = () => {
  const [titulo, setTitulo] = useState('')
  const [contenido, setContenido] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [proveedores, setProveedores] = useState([])
  const [expedientes, setExpedientes] = useState([])
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState('')
  const [expedienteSeleccionado, setExpedienteSeleccionado] = useState('')
  const [fechaServicio, setFechaServicio] = useState('')
  const [recogidaDetalles, setRecogidaDetalles] = useState('')
  const [tlfGuia, setTlfGuia] = useState('')
  const [tlfResponsable, setTlfResponsable] = useState('')
  const [nPersonas, setNPersonas] = useState('')
  const [observacionesInternas, setObservacionesInternas] = useState('')

  // Cargar proveedores y expedientes
  useEffect(() => {
    const cargarDatosRelacionados = async () => {
      try {
        const [provRes, expRes] = await Promise.all([
          supabase
            .from('proveedores')
            .select('id, nombre_comercial, direccion, poblacion, movil')
            .order('nombre_comercial', { ascending: true }),
          supabase
            .from('expedientes')
            .select('id, nombre_cliente, destino, fecha_inicio, total_pax, movil_guia, movil_responsable, descripcion_ruta')
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

    cargarDatosRelacionados()
  }, [])

  // Autocompletar campos al seleccionar expediente
  useEffect(() => {
    if (!expedienteSeleccionado) return
    const exp = expedientes.find((e) => e.id === expedienteSeleccionado)
    if (!exp) return

    if (!titulo) {
      setTitulo(`Bono de Bus - ${exp.nombre_cliente || 'Cliente'}`)
    }

    if (exp.fecha_inicio) {
      try {
        const d = new Date(exp.fecha_inicio)
        if (!isNaN(d.getTime())) {
          const dia = String(d.getDate()).padStart(2, '0')
          const mes = String(d.getMonth() + 1).padStart(2, '0')
          const año = d.getFullYear()
          setFechaServicio(`${dia}/${mes}/${año}`)
        }
      } catch {
        // mantener vacío si falla
      }
    }

    if (exp.total_pax && !nPersonas) {
      setNPersonas(String(exp.total_pax))
    }

    if (exp.movil_guia && !tlfGuia) {
      setTlfGuia(exp.movil_guia)
    }
    if (exp.movil_responsable && !tlfResponsable) {
      setTlfResponsable(exp.movil_responsable)
    }

    if (exp.descripcion_ruta && !contenido) {
      setContenido(exp.descripcion_ruta)
    }
  }, [expedienteSeleccionado, expedientes])

  const generarBonoBus = () => {
    if (!proveedorSeleccionado || !expedienteSeleccionado) {
      alert('Selecciona un proveedor y un expediente antes de generar el bono.')
      return
    }

    const expediente = expedientes.find((e) => e.id === expedienteSeleccionado)
    if (!expediente) {
      alert('No se han podido cargar los datos del expediente seleccionado.')
      return
    }

    const nombreCliente = expediente.nombre_cliente || 'Cliente'
    const destino = expediente.destino || ''

    if (!titulo) {
      setTitulo(`Bono de Bus - ${nombreCliente}`)
    }

    if (!contenido && destino) {
      setContenido(`Circuito ${destino}`)
    }
  }

  const buildVoucherText = () => {
    const proveedor = proveedores.find((p) => p.id === proveedorSeleccionado)
    const expediente = expedientes.find((e) => e.id === expedienteSeleccionado)

    const nombreProveedor = proveedor?.nombre_comercial || 'Proveedor sin nombre'
    const direccionProveedor = proveedor?.direccion || ''
    const telefonoProveedor = proveedor?.movil || ''

    const nombreCliente = expediente?.nombre_cliente || 'Cliente'
    const destino = expediente?.destino || ''

    let fechaServicioTexto = fechaServicio || ''
    if (!fechaServicioTexto && expediente?.fecha_inicio) {
      try {
        const d = new Date(expediente.fecha_inicio)
        if (!isNaN(d.getTime())) {
          fechaServicioTexto = d.toLocaleDateString('es-ES')
        }
      } catch {
        // mantener vacío si falla
      }
    }

    const descripcionRuta = contenido || (destino ? `Circuito ${destino}` : '')
    const hoy = new Date()
    const fechaEmision = hoy.toLocaleDateString('es-ES')

    const lineas = [
      'VIAJES TABORA',
      'C/ Santa Amalia, nº 2 Entresuelo 2º Of. L1 (46009 Valencia) ESP',
      'Tel: +34 96 339 04 64',
      '',
      'BONO/VOUCHER',
      `Fecha de emisión: ${fechaEmision}`,
      '',
      `Proveedor: ${nombreProveedor}`,
      direccionProveedor ? `Dirección: ${direccionProveedor}` : '',
      telefonoProveedor ? `Teléfono: ${telefonoProveedor}` : '',
      '',
      'Rogamos facilitar los siguientes servicios:',
      '',
      `Cliente / Grupo: ${nombreCliente}`,
      fechaServicioTexto
        ? `Fecha servicio: ${fechaServicioTexto}`
        : 'Fecha servicio: ____/____/______',
      `Descripción / Ruta: ${descripcionRuta || '_____________________________'}`,
      `Recogida: ${recogidaDetalles || '_____________________________'}`,
      `Teléfono Guía: ${tlfGuia || '________________'}`,
      `Teléfono Jefe de Grupo: ${tlfResponsable || '________________'}`,
      `Total personas: ${nPersonas || '___'}`,
      '',
      'Observaciones:',
      observacionesInternas || '___________________________________________',
    ].filter(Boolean)

    return lineas.join('\n')
  }

  const handleImprimirBono = () => {
    if (!proveedorSeleccionado || !expedienteSeleccionado) {
      alert('Selecciona un proveedor y un expediente antes de imprimir.')
      return
    }
    window.print()
  }

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

      const textoBono = buildVoucherText()

      const safe = (v) => {
        if (v === undefined || v === null) return null
        if (typeof v === 'string' && v.trim() === '') return null
        return v
      }

      const nPersonasNumber =
        nPersonas && !isNaN(parseInt(nPersonas, 10)) ? parseInt(nPersonas, 10) : null

      const datosParaGuardar = {
        titulo: safe(titulo.trim()),
        contenido: safe(textoBono),
        expediente_id: safe(expedienteSeleccionado || null),
        proveedor_id: safe(proveedorSeleccionado || null),
        fecha_servicio: safe(fechaServicio),
        descripcion_ruta: safe(contenido || ''),
        recogida_detalles: safe(recogidaDetalles),
        tlf_guia: safe(tlfGuia),
        tlf_responsable: safe(tlfResponsable),
        n_personas: nPersonasNumber,
        observaciones_internas: safe(observacionesInternas),
      }

      const { error } = await supabase
        .from('plantillas_viajes')
        .insert([datosParaGuardar])

      if (error) {
        console.error('❌ Error guardando bono:', error)
        alert(`Error al guardar el bono: ${error.message}`)
        return
      }

      alert('Bono guardado con éxito')
    } catch (err) {
      console.error('❌ Error inesperado guardando plantilla:', err)
      alert('Error inesperado al guardar la plantilla')
    } finally {
      setGuardando(false)
    }
  }

  const proveedor = proveedores.find((p) => p.id === proveedorSeleccionado)
  const expediente = expedientes.find((e) => e.id === expedienteSeleccionado)

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
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          /* Ocultar barra lateral y elementos no deseados */
          aside, .sidebar, nav, button, .no-print, header {
            display: none !important;
          }

          /* Solo mostrar el bono */
          .bono-container {
            width: 100% !important;
            max-width: 100% !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            margin: 0 !important;
            padding: 20mm !important;
            background: white !important;
          }

          .bono-print {
            width: 100% !important;
            box-shadow: none !important;
            border: none !important;
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
            {/* Selección de proveedor y expediente */}
            <div className="no-print grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Proveedor para Bono
                </label>
                <select
                  value={proveedorSeleccionado}
                  onChange={(e) => setProveedorSeleccionado(e.target.value || '')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Selecciona un proveedor...</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre_comercial}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Expediente / Grupo
                </label>
                <select
                  value={expedienteSeleccionado}
                  onChange={(e) => setExpedienteSeleccionado(e.target.value || '')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Selecciona un expediente...</option>
                  {expedientes.map((exp) => {
                    const cliente = exp.nombre_cliente || 'Cliente sin nombre'
                    const tituloViaje = exp.destino || 'Viaje sin título'
                    return (
                      <option key={exp.id} value={exp.id}>
                        {cliente} - {tituloViaje}
                      </option>
                    )
                  })}
                </select>
              </div>
            </div>

            {/* Dos columnas: formulario y vista previa */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Columna izquierda: formulario */}
              <div className="no-print space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Título
                  </label>
                  <input
                    type="text"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Escribe un título de plantilla..."
                  />
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
                      placeholder="Ej: 10/10/2025"
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
                    value={contenido}
                    onChange={(e) => setContenido(e.target.value)}
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
                      placeholder="Ej: Miguel 658 066 849"
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
                      placeholder="Ej: Pura 653 86 30 20"
                    />
                  </div>
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

                <div className="flex flex-wrap gap-3 pt-4">
                  <button
                    type="button"
                    onClick={generarBonoBus}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-semibold"
                  >
                    Generar Bono de Bus
                  </button>
                  <button
                    onClick={handleGuardar}
                    disabled={guardando}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-semibold"
                  >
                    <Save size={18} />
                    {guardando ? 'Guardando...' : 'Guardar plantilla'}
                  </button>
                  <button
                    type="button"
                    onClick={handleImprimirBono}
                    className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-2 text-sm font-semibold"
                  >
                    <Printer size={18} />
                    Imprimir Bono
                  </button>
                  <button
                    onClick={() => {
                      setTitulo('')
                      setContenido('')
                      setFechaServicio('')
                      setRecogidaDetalles('')
                      setTlfGuia('')
                      setTlfResponsable('')
                      setNPersonas('')
                      setObservacionesInternas('')
                      setProveedorSeleccionado('')
                      setExpedienteSeleccionado('')
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex items-center gap-2 text-sm font-semibold"
                  >
                    <X size={18} />
                    Limpiar
                  </button>
                </div>
              </div>

              {/* Columna derecha: vista previa del bono */}
              <div className="bono-print border rounded-xl p-6 bg-white shadow-inner">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex flex-col items-start">
                    <img
                      src={LOGO_TABORA_BASE64}
                      alt="Viajes Tabora"
                      className="h-12 object-contain mb-1"
                    />
                  </div>
                  <div className="text-right text-xs text-gray-600">
                    <div className="font-semibold">VIAJES TABORA</div>
                    <div>C/ Santa Amalia, nº 2 Entresuelo 2º Of. L1</div>
                    <div>46009 Valencia (ESP)</div>
                    <div>Tel: +34 96 339 04 64</div>
                  </div>
                </div>

                <div className="text-center mb-4">
                  <div className="text-sm font-bold tracking-wide">BONO/VOUCHER</div>
                  <div className="text-xs text-gray-600">
                    Fecha de emisión: {new Date().toLocaleDateString('es-ES')}
                  </div>
                </div>

                {/* Proveedor / Cliente */}
                <div className="grid grid-cols-1 gap-3 text-xs mt-4">
                  <div className="border rounded-lg p-3">
                    <div className="font-semibold mb-1">Proveedor</div>
                    <div>
                      {proveedor ? (
                        <>
                          <div>{proveedor.nombre_comercial}</div>
                          {proveedor.direccion && <div>{proveedor.direccion}</div>}
                          {proveedor.movil && <div>Tel: {proveedor.movil}</div>}
                        </>
                      ) : (
                        'Selecciona un proveedor'
                      )}
                    </div>
                  </div>
                  <div className="border rounded-lg p-3">
                    <div className="font-semibold mb-1">Cliente / Grupo</div>
                    <div>
                      {expediente ? (
                        <>
                          <div>{expediente.nombre_cliente || 'Cliente'}</div>
                          {expediente.destino && <div>Destino: {expediente.destino}</div>}
                        </>
                      ) : (
                        'Selecciona un expediente'
                      )}
                    </div>
                  </div>
                </div>

                {/* Sección central: servicios */}
                <div className="mt-4 text-xs text-gray-800 space-y-2">
                  <div className="font-semibold">
                    Rogamos facilitar los siguientes servicios:
                  </div>
                  <div>
                    <span className="font-semibold">Fecha servicio: </span>
                    {fechaServicio || '____/____/______'}
                  </div>
                  <div>
                    <span className="font-semibold">Descripción / Ruta: </span>
                    {contenido || (expediente?.destino ? `Circuito ${expediente.destino}` : '_______________________________')}
                  </div>
                  <div>
                    <span className="font-semibold">Recogida: </span>
                    {recogidaDetalles || '_______________________________'}
                  </div>
                  <div>
                    <span className="font-semibold">Teléfono Guía: </span>
                    {tlfGuia || '________________'}
                  </div>
                  <div>
                    <span className="font-semibold">Teléfono Jefe Grupo: </span>
                    {tlfResponsable || '________________'}
                  </div>
                  <div>
                    <span className="font-semibold">Total personas: </span>
                    {nPersonas || '___'}
                  </div>
                </div>

                {/* Observaciones */}
                <div className="mt-4 text-xs">
                  <div className="font-semibold mb-1">Observaciones:</div>
                  <div className="min-h-[40px] border border-dashed border-gray-300 rounded-md p-2 whitespace-pre-line">
                    {observacionesInternas || '___________________________________________'}
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
