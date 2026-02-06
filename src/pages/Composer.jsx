import React, { useState, useEffect } from 'react'
import { FileText, Save, X } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://gtwyqxfkpdwpakmgrkbu.supabase.co'
const SUPABASE_KEY = 'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const Composer = () => {
  const [titulo, setTitulo] = useState('')
  const [contenido, setContenido] = useState('')
  const [categoria, setCategoria] = useState('Itinerario')
  const [precioSugerido, setPrecioSugerido] = useState('')
  const [duracion, setDuracion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [proveedores, setProveedores] = useState([])
  const [expedientes, setExpedientes] = useState([])
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState('')
  const [expedienteSeleccionado, setExpedienteSeleccionado] = useState('')
  // Campos específicos del bono / plantilla de viaje
  const [fechaServicio, setFechaServicio] = useState('')
  const [recogidaDetalles, setRecogidaDetalles] = useState('')
  const [tlfGuia, setTlfGuia] = useState('')
  const [tlfResponsable, setTlfResponsable] = useState('')
  const [nPersonas, setNPersonas] = useState('')
  const [observacionesInternas, setObservacionesInternas] = useState('')
  const [modoImpresion, setModoImpresion] = useState(false)

  // Cargar proveedores y expedientes para los selectores
  useEffect(() => {
    const cargarDatosRelacionados = async () => {
      try {
        const [provRes, expRes] = await Promise.all([
          supabase
            .from('proveedores')
            .select('id, nombre_comercial, direccion, poblacion, telefono, telefono_fijo, movil')
            .order('nombre_comercial', { ascending: true }),
          supabase
            .from('expedientes')
            .select('id, nombre_grupo, destino, fecha_inicio, total_pax, movil_guia, movil_responsable, descripcion_ruta')
            .order('fecha_inicio', { ascending: false }),
        ])

        if (!provRes.error && Array.isArray(provRes.data)) {
          setProveedores(provRes.data)
        } else if (provRes.error) {
          console.error('❌ Error cargando proveedores para Composer:', provRes.error)
        }

        if (!expRes.error && Array.isArray(expRes.data)) {
          setExpedientes(expRes.data)
        } else if (expRes.error) {
          console.error('❌ Error cargando expedientes para Composer:', expRes.error)
        }
      } catch (err) {
        console.error('❌ Error inesperado cargando datos en Composer:', err)
      }
    }

    cargarDatosRelacionados()
  }, [])

  const handleCargarItinerarioBase = () => {
    const plantillaBase = [
      'DIA 1 - CIUDAD DE ORIGEN / DESTINO',
      'Descripción del día 1...',
      '',
      'DIA 2 - DESTINO',
      'Descripción del día 2...',
      '',
      'DIA 3 - DESTINO / REGRESO',
      'Descripción del día 3...',
      '',
      'INCLUYE:',
      '- ',
      '',
      'NO INCLUYE:',
      '- ',
    ].join('\n')

    setCategoria('Itinerario')
    setContenido(plantillaBase)
  }

  // Cuando se selecciona un expediente, pre-rellenar algunos campos del bono
  useEffect(() => {
    if (!expedienteSeleccionado) return
    const exp = expedientes.find((e) => e.id === expedienteSeleccionado)
    if (!exp) return

    if (!titulo) {
      setTitulo(`Bono de Bus - ${exp.nombre_grupo || 'Grupo / Cliente'}`)
    }

    // Fecha de servicio inicial = fecha_inicio del expediente (editable)
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
        // dejar campo editable en blanco si falla
      }
    }

    // Nº personas desde total_pax si existe
    if (exp.total_pax && !nPersonas) {
      setNPersonas(String(exp.total_pax))
    }

    // Autocompletar teléfonos si vienen del expediente
    if (exp.movil_guia && !tlfGuia) {
      setTlfGuia(exp.movil_guia)
    }
    if (exp.movil_responsable && !tlfResponsable) {
      setTlfResponsable(exp.movil_responsable)
    }

    // Autocompletar descripción / ruta si la tiene el expediente
    if (exp.descripcion_ruta && !duracion) {
      setDuracion(exp.descripcion_ruta)
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

    const nombreCliente = expediente.nombre_grupo || 'Grupo / Cliente'
    const destino = expediente.destino || ''

    setCategoria('Itinerario')
    if (!titulo) {
      setTitulo(`Bono de Bus - ${nombreCliente}`)
    }

    // Si no hay descripción/ruta explícita, proponerla a partir del destino
    if (!duracion && destino) {
      setDuracion(`Circuito ${destino}`)
    }
  }

  // Construir texto plano del bono desde el estado actual
  const buildVoucherText = () => {
    const proveedor = proveedores.find((p) => p.id === proveedorSeleccionado)
    const expediente = expedientes.find((e) => e.id === expedienteSeleccionado)

    const nombreProveedor = proveedor?.nombre_comercial || 'Proveedor sin nombre'
    const direccionProveedor = proveedor?.direccion || ''
    const telefonoProveedor =
      proveedor?.telefono || proveedor?.telefono_fijo || proveedor?.movil || ''

    const nombreCliente = expediente?.nombre_grupo || 'Grupo / Cliente'
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

    const descripcionRuta =
      duracion || (destino ? `Circuito ${destino}` : '')

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
    const texto = buildVoucherText()
    if (!texto.trim()) {
      alert('No hay contenido para imprimir.')
      return
    }
    window.print()
  }

  const handleGuardar = async () => {
    if (!titulo.trim()) {
      alert('Por favor, rellena al menos el título.')
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
        tipo: safe(categoria),
        contenido: safe(textoBono),
        expediente_id: safe(expedienteSeleccionado || null),
        proveedor_id: safe(proveedorSeleccionado || null),
        fecha_servicio: safe(fechaServicio),
        descripcion_ruta: safe(duracion || ''),
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
        console.error('❌ Error guardando bono en plantillas_viajes:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          datosEnviados: datosParaGuardar,
        })
        alert(`Error al guardar el bono: ${error.message}`)
        return
      }

      alert('Bono guardado con éxito')
    } catch (err) {
      console.error('❌ Error inesperado guardando plantilla de viaje:', err)
      alert('Error inesperado al guardar la plantilla')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="p-6">
      {/* CSS de impresión: solo imprimir el contenedor del bono, a tamaño A4 */}
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

          .no-print {
            display: none !important;
          }

          .bono-print {
            display: block !important;
            width: 100% !important;
            box-shadow: none !important;
            border: none !important;
          }
        }
        `}
      </style>
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="no-print flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-navy-900 flex items-center gap-2">
              <FileText className="text-navy-600" size={28} />
              Composer - Generador de Bonos
            </h1>
          </div>

          <div className="space-y-6">
            {/* Selección de proveedor y expediente para bonos */}
            <div className="no-print grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="no-print">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Proveedor para Bono
                </label>
                <select
                  value={proveedorSeleccionado}
                  onChange={(e) => setProveedorSeleccionado(e.target.value || '')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-navy-500 focus:border-transparent"
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-navy-500 focus:border-transparent"
                >
                  <option value="">Selecciona un expediente...</option>
                  {expedientes.map((exp) => {
                    const cliente = exp.nombre_grupo || 'Cliente sin nombre'
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

            {/* Dos columnas: izquierda datos (no-print), derecha vista previa del bono (bono-print) */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Columna izquierda: formulario de datos */}
              <div className="no-print">
                {/* Metadatos de la plantilla */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Título
              </label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy-500 focus:border-transparent"
                  placeholder="Escribe un título de plantilla..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                      Categoría
                    </label>
                    <select
                      value={categoria}
                      onChange={(e) => setCategoria(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-navy-500 focus:border-transparent"
                    >
                      <option value="Itinerario">Itinerario</option>
                      <option value="Condiciones de Venta">Condiciones de Venta</option>
                      <option value="Presupuesto">Presupuesto</option>
                    </select>
                  </div>
                </div>

                {/* Campos específicos del bono */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fecha de servicio
                    </label>
                    <input
                      type="text"
                      value={fechaServicio}
                      onChange={(e) => setFechaServicio(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy-500 focus:border-transparent"
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
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy-500 focus:border-transparent"
                      placeholder="Ej: 42"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Detalle de recogidas
                    </label>
                    <textarea
                      value={recogidaDetalles}
                      onChange={(e) => setRecogidaDetalles(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy-500 focus:border-transparent min-h-[80px]"
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy-500 focus:border-transparent"
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
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy-500 focus:border-transparent"
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
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy-500 focus:border-transparent min-h-[80px]"
                      placeholder="Notas internas para logística / guía..."
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 pt-4">
                  <button
                    type="button"
                    onClick={handleCargarItinerarioBase}
                    className="text-xs font-semibold text-navy-600 hover:text-navy-800 underline"
                  >
                    Cargar Itinerario Base
                  </button>
                  <button
                    type="button"
                    onClick={generarBonoBus}
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline"
                  >
                    Generar Bono de Bus
                  </button>
            </div>

                <div className="flex flex-wrap gap-3 pt-4">
              <button
                onClick={handleGuardar}
                    disabled={guardando}
                    className="btn-primary flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Save size={18} />
                    {guardando ? 'Guardando...' : 'Guardar plantilla'}
                  </button>
                  <button
                    type="button"
                    onClick={handleImprimirBono}
                    className="btn-secondary flex items-center gap-2"
                  >
                    Imprimir Bono
              </button>
              <button
                onClick={() => {
                  setTitulo('')
                  setContenido('')
                      setCategoria('Itinerario')
                      setPrecioSugerido('')
                      setDuracion('')
                      setFechaServicio('')
                      setRecogidaDetalles('')
                      setTlfGuia('')
                      setTlfResponsable('')
                      setNPersonas('')
                      setObservacionesInternas('')
                }}
                className="btn-secondary flex items-center gap-2"
              >
                <X size={18} />
                Limpiar
              </button>
                </div>
              </div>

              {/* Columna derecha: vista previa del bono */}
              <div className="bono-print border rounded-xl p-6 bg-white shadow-inner">
                <div className="flex justify-between items-start mb-4">
                  {/* Logo TABORA: coloca /public/tabora-logo.png en tu proyecto */}
                  <div className="flex flex-col items-start">
                    <img
                      src="/tabora-logo.png"
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
                <div className="text-center mb-2">
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
                      {(() => {
                        const prov = proveedores.find((p) => p.id === proveedorSeleccionado)
                        if (!prov) return 'Selecciona un proveedor'
                        const telefono =
                          prov.telefono || prov.telefono_fijo || prov.movil || ''
                        return (
                          <>
                            <div>{prov.nombre_comercial}</div>
                            {prov.direccion && <div>{prov.direccion}</div>}
                            {telefono && <div>Tel: {telefono}</div>}
                          </>
                        )
                      })()}
                    </div>
                  </div>
                  <div className="border rounded-lg p-3">
                    <div className="font-semibold mb-1">Cliente / Grupo</div>
                    <div>
                      {(() => {
                        const exp = expedientes.find((e) => e.id === expedienteSeleccionado)
                        if (!exp) return 'Selecciona un expediente'
                        return (
                          <>
                            <div>{exp.nombre_grupo || 'Grupo / Cliente'}</div>
                            {exp.destino && <div>Destino: {exp.destino}</div>}
                          </>
                        )
                      })()}
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
                    {(() => {
                      const exp = expedientes.find((e) => e.id === expedienteSeleccionado)
                      if (exp?.destino) return `Circuito ${exp.destino}`
                      return '_______________________________'
                    })()}
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

                {/* Observaciones visuales (lo que vería el proveedor) */}
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
