import React, { useState, useEffect } from 'react'
import { FileText, Plus, Eye, Briefcase, User, Receipt, TrendingUp } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import jsPDF from 'jspdf'

const supabase = createClient(
  'https://gtwyqxfkpdwpakmgrkbu.supabase.co',
  'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'
)

const Cierres = () => {
  const [tabActiva, setTabActiva] = useState('facturas')
  const [facturas, setFacturas] = useState([])
  const [cargando, setCargando] = useState(false)
  const [showModalPasajero, setShowModalPasajero] = useState(false)
  const [showModalGrupo, setShowModalGrupo] = useState(false)
  const [expedientes, setExpedientes] = useState([])
  const [expedienteSeleccionado, setExpedienteSeleccionado] = useState(null)
  const [pasajeros, setPasajeros] = useState([])
  const [cargandoExpedientes, setCargandoExpedientes] = useState(false)
  const [cargandoPasajeros, setCargandoPasajeros] = useState(false)

  useEffect(() => {
    if (tabActiva === 'facturas') {
      cargarFacturas()
    }
  }, [tabActiva])

  const cargarFacturas = async () => {
    setCargando(true)
    try {
      const { data, error } = await supabase
        .from('facturas_emitidas_global')
        .select('*')
        .order('fecha_emision', { ascending: false })
      
      if (error) {
        console.error('Error cargando facturas:', error)
        alert(`Error cargando facturas: ${error.message}`)
        setFacturas([])
        return
      }
      
      setFacturas(data || [])
    } catch (error) {
      console.error('Error fatal cargando facturas:', error)
      setFacturas([])
    } finally {
      setCargando(false)
    }
  }

  const cargarExpedientes = async () => {
    setCargandoExpedientes(true)
    try {
      const { data, error } = await supabase
        .from('expedientes')
        .select('id, cliente_nombre, nombre_grupo, destino, fecha_viaje, estado')
        .order('fecha_viaje', { ascending: false })
        .limit(200)
      
      if (error) {
        console.error('Error cargando expedientes:', error)
        setExpedientes([])
        return
      }
      
      setExpedientes(data || [])
    } catch (error) {
      console.error('Error fatal cargando expedientes:', error)
      setExpedientes([])
    } finally {
      setCargandoExpedientes(false)
    }
  }

  const cargarPasajeros = async (expedienteId) => {
    setCargandoPasajeros(true)
    try {
      const { data, error } = await supabase
        .from('expedientes')
        .select('pasajeros')
        .eq('id', expedienteId)
        .single()
      
      if (error || !data) {
        console.error('Error cargando pasajeros:', error)
        setPasajeros([])
        return
      }
      
      // pasajeros es un JSON array
      const pasajerosArray = data.pasajeros || []
      setPasajeros(Array.isArray(pasajerosArray) ? pasajerosArray : [])
    } catch (error) {
      console.error('Error fatal cargando pasajeros:', error)
      setPasajeros([])
    } finally {
      setCargandoPasajeros(false)
    }
  }

  const regenerarPDFDesdeDatos = async (factura) => {
    if (!factura?.datos_factura) {
      alert('❌ Error: No hay datos de factura para regenerar el PDF')
      return
    }
    
    const datos = factura.datos_factura
    const numeroFactura = factura.numero_factura || datos.numero_factura || 'SIN-NUMERO'
    
    try {
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      
      // Número de factura
      doc.setFontSize(20)
      doc.setTextColor(33, 150, 243)
      doc.setFont(undefined, 'bold')
      doc.text(`FACTURA ${numeroFactura}`, pageWidth - 20, 25, { align: 'right' })
      
      // Fecha
      const fechaActual = new Date()
      const fechaFormateada = fechaActual.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      })
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text(`Fecha: ${fechaFormateada}`, pageWidth - 20, 35, { align: 'right' })
      
      // Datos del emisor (Valservice Incoming S.L.)
      let yPos = 50
      doc.setFontSize(12)
      doc.setFont(undefined, 'bold')
      doc.text('VALSERVICE INCOMING S.L.', 20, yPos)
      yPos += 6
      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      doc.text('CIF: B12345678', 20, yPos)
      yPos += 6
      doc.text('C/ Santa Amalia, nº 2 Entresuelo 2º Of. L1', 20, yPos)
      yPos += 6
      doc.text('46009 Valencia (ESP)', 20, yPos)
      yPos += 6
      doc.text('Tel: +34 96 339 04 64', 20, yPos)
      
      // Receptor
      yPos += 15
      doc.setFontSize(12)
      doc.setFont(undefined, 'bold')
      doc.text('FACTURAR A:', 20, yPos)
      yPos += 8
      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      
      if (datos.formFactura) {
        doc.text(datos.formFactura.receptorNombre || 'Sin nombre', 20, yPos)
        yPos += 6
        if (datos.formFactura.receptorCIF) {
          doc.text(`CIF/NIF: ${datos.formFactura.receptorCIF}`, 20, yPos)
          yPos += 6
        }
        if (datos.formFactura.receptorDireccion) {
          doc.text(datos.formFactura.receptorDireccion, 20, yPos)
          yPos += 6
        }
        const direccionCompleta = [
          datos.formFactura.receptorCP,
          datos.formFactura.receptorPoblacion,
          datos.formFactura.receptorProvincia
        ].filter(Boolean).join(' ')
        if (direccionCompleta) {
          doc.text(direccionCompleta, 20, yPos)
          yPos += 6
        }
      }
      
      // Concepto
      yPos += 10
      doc.setFontSize(12)
      doc.setFont(undefined, 'bold')
      doc.text('CONCEPTO:', 20, yPos)
      yPos += 8
      doc.setFontSize(10)
      doc.setFont(undefined, 'normal')
      
      const concepto = datos.concepto || datos.concepts?.concepto || 'Servicios de viaje'
      doc.text(concepto, 20, yPos)
      yPos += 10
      
      // Desglose si existe
      if (datos.calcularBaseFactura) {
        const calc = datos.calcularBaseFactura
        if (calc.paxPago && calc.precioNetoPax) {
          doc.text(`${calc.paxPago} Plazas x ${calc.precioNetoPax}€:`, 20, yPos)
          doc.text(`${calc.totalServiciosConIVA || '0.00'}€ (IVA incluido)`, pageWidth - 20, yPos, { align: 'right' })
          yPos += 6
        }
        if (calc.totalSuplementos && parseFloat(calc.totalSuplementos) > 0) {
          doc.text('Suplementos (IVA incluido):', 20, yPos)
          doc.text(`${calc.totalSuplementos}€`, pageWidth - 20, yPos, { align: 'right' })
          yPos += 6
        }
      }
      
      // Totales
      yPos += 10
      doc.setFont(undefined, 'bold')
      doc.text('Base Imponible:', 20, yPos)
      doc.text(`${datos.calcularBaseFactura?.baseImponible || datos.base_imponible || '0.00'}€`, pageWidth - 20, yPos, { align: 'right' })
      yPos += 8
      doc.text('IVA (21%):', 20, yPos)
      doc.text(`${datos.calcularBaseFactura?.iva || '0.00'}€`, pageWidth - 20, yPos, { align: 'right' })
      yPos += 8
      doc.setFontSize(14)
      doc.setFont(undefined, 'bold')
      doc.text('TOTAL:', 20, yPos)
      doc.text(`${datos.calcularBaseFactura?.totalFactura || datos.importe_total || '0.00'}€`, pageWidth - 20, yPos, { align: 'right' })
      
      // Descargar PDF
      const nombreArchivo = `Factura_${numeroFactura}.pdf`
      doc.save(nombreArchivo)
      
      alert('✅ PDF regenerado y descargado')
    } catch (error) {
      console.error('Error generando PDF:', error)
      alert('❌ Error generando PDF: ' + error.message)
    }
  }

  const verPDF = (factura) => {
    if (factura.url_pdf) {
      window.open(factura.url_pdf, '_blank')
    } else {
      regenerarPDFDesdeDatos(factura)
    }
  }

  const abrirModalPasajero = () => {
    setShowModalPasajero(true)
    setExpedienteSeleccionado(null)
    setPasajeros([])
    cargarExpedientes()
  }

  const abrirModalGrupo = () => {
    setShowModalGrupo(true)
    setExpedienteSeleccionado(null)
    cargarExpedientes()
  }

  const seleccionarExpediente = async (expedienteId) => {
    const exp = expedientes.find(e => e.id === expedienteId)
    setExpedienteSeleccionado(exp)
    if (showModalPasajero && expedienteId) {
      await cargarPasajeros(expedienteId)
    }
  }

  const facturarPasajero = (pasajero) => {
    if (!expedienteSeleccionado) {
      alert('⚠️ Por favor, selecciona un expediente primero')
      return
    }
    
    // Redirigir a ExpedienteDetalle con el pasajero seleccionado
    const url = `/expedientes?expediente=${expedienteSeleccionado.id}&pasajero=${encodeURIComponent(JSON.stringify(pasajero))}`
    window.location.href = url
  }

  const facturarGrupo = () => {
    if (!expedienteSeleccionado) {
      alert('⚠️ Por favor, selecciona un expediente')
      return
    }
    
    // Redirigir a ExpedienteDetalle con el expediente seleccionado
    const url = `/expedientes?expediente=${expedienteSeleccionado.id}&tab=facturacion`
    window.location.href = url
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-navy-900 mb-2">Cierres</h1>
          <p className="text-gray-600">Gestión contable y facturación global</p>
        </div>
        {tabActiva === 'facturas' && (
          <div className="flex gap-3">
            <button
              onClick={abrirModalPasajero}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
            >
              <User size={18} />
              Nueva Factura Pasajero
            </button>
            <button
              onClick={abrirModalGrupo}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
            >
              <Briefcase size={18} />
              Nueva Factura Grupo
            </button>
          </div>
        )}
      </div>

      {/* Sistema de Pestañas */}
      <div className="mb-6 border-b border-gray-200">
        <div className="flex gap-1">
          <button
            onClick={() => setTabActiva('facturas')}
            className={`px-6 py-3 font-semibold transition-colors flex items-center gap-2 ${
              tabActiva === 'facturas'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Receipt size={18} />
            Facturas Emitidas
          </button>
          <button
            onClick={() => setTabActiva('cierres')}
            className={`px-6 py-3 font-semibold transition-colors flex items-center gap-2 ${
              tabActiva === 'cierres'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <TrendingUp size={18} />
            Cierres de Expedientes
          </button>
        </div>
      </div>

      {/* Contenido de Pestaña: Facturas Emitidas */}
      {tabActiva === 'facturas' && (
        <>
          {cargando ? (
            <div className="text-center py-12 text-gray-500">
              <p>Cargando facturas...</p>
            </div>
          ) : facturas.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md p-12 border border-gray-200 text-center">
              <FileText className="mx-auto text-gray-400 mb-4" size={64} />
              <h3 className="text-xl font-bold text-gray-700 mb-2">No hay facturas emitidas</h3>
              <p className="text-gray-600">Las facturas emitidas aparecerán aquí</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-left">Fecha</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-left">Nº Factura</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-left">Tipo</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-left">Cliente</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-right">Importe</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-center">PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {facturas.map((factura) => (
                    <tr key={factura.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {factura.fecha_emision 
                          ? new Date(factura.fecha_emision).toLocaleDateString('es-ES', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric'
                            })
                          : (factura.created_at 
                              ? new Date(factura.created_at).toLocaleDateString('es-ES', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric'
                                })
                              : '-'
                            )
                        }
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                        {factura.numero_factura || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${
                          factura.tipo === 'pasajero' 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {factura.tipo === 'pasajero' ? 'Pasajero' : 'Grupo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {factura.cliente_nombre || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-green-700 text-right">
                        {factura.importe_total ? `${Number(factura.importe_total).toFixed(2)}€` : '-'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => verPDF(factura)}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1 mx-auto"
                          title={factura.url_pdf ? 'Ver PDF' : 'Regenerar PDF desde datos'}
                        >
                          <Eye size={14} />
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Contenido de Pestaña: Cierres de Expedientes */}
      {tabActiva === 'cierres' && (
        <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
          <div className="p-8 text-center">
            <TrendingUp className="mx-auto text-gray-400 mb-4" size={64} />
            <h3 className="text-xl font-bold text-gray-700 mb-2">Módulo de Cuadre de Gastos para Hacienda</h3>
            <p className="text-gray-600 mb-6">Próximamente</p>
          </div>
          
          {/* Tabla vacía con estructura */}
          <table className="w-full">
            <thead className="bg-slate-900 text-white">
              <tr>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-left">Expediente</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-left">Destino</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-left">Estado Liquidación</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="4" className="px-6 py-12 text-center text-gray-500">
                  <p className="text-sm">Esta funcionalidad estará disponible próximamente</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Nueva Factura Pasajero */}
      {showModalPasajero && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold text-navy-900 mb-6">Nueva Factura - Pasajero Individual</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Seleccionar Expediente
                </label>
                <select
                  value={expedienteSeleccionado?.id || ''}
                  onChange={(e) => seleccionarExpediente(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={cargandoExpedientes}
                >
                  <option value="">-- Selecciona un expediente --</option>
                  {expedientes.map((exp) => (
                    <option key={exp.id} value={exp.id}>
                      {exp.cliente_nombre || exp.nombre_grupo || 'Sin nombre'} - {exp.destino || 'Sin destino'}
                    </option>
                  ))}
                </select>
                {cargandoExpedientes && (
                  <p className="text-xs text-gray-500 mt-1">Cargando expedientes...</p>
                )}
              </div>

              {expedienteSeleccionado && (
                <>
                  {cargandoPasajeros ? (
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <p className="text-blue-800 text-sm">Cargando pasajeros...</p>
                    </div>
                  ) : pasajeros.length > 0 ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Seleccionar Pasajero
                      </label>
                      <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-2">
                        {pasajeros.map((pasajero, index) => (
                          <button
                            key={index}
                            onClick={() => facturarPasajero(pasajero)}
                            className="w-full text-left px-4 py-3 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-200"
                          >
                            <div className="font-medium text-gray-900">
                              {pasajero.nombre || pasajero.nombre_completo || `Pasajero ${index + 1}`}
                            </div>
                            {pasajero.dni && (
                              <div className="text-sm text-gray-600">DNI: {pasajero.dni}</div>
                            )}
                            {pasajero.email && (
                              <div className="text-xs text-gray-500">{pasajero.email}</div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                      <p className="text-yellow-800 text-sm">No hay pasajeros registrados en este expediente.</p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowModalPasajero(false)
                  setExpedienteSeleccionado(null)
                  setPasajeros([])
                }}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors flex-1"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nueva Factura Grupo */}
      {showModalGrupo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold text-navy-900 mb-6">Nueva Factura - Grupo</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Seleccionar Expediente
                </label>
                <select
                  value={expedienteSeleccionado?.id || ''}
                  onChange={(e) => seleccionarExpediente(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  disabled={cargandoExpedientes}
                >
                  <option value="">-- Selecciona un expediente --</option>
                  {expedientes.map((exp) => (
                    <option key={exp.id} value={exp.id}>
                      {exp.cliente_nombre || exp.nombre_grupo || 'Sin nombre'} - {exp.destino || 'Sin destino'}
                    </option>
                  ))}
                </select>
                {cargandoExpedientes && (
                  <p className="text-xs text-gray-500 mt-1">Cargando expedientes...</p>
                )}
              </div>

              {expedienteSeleccionado && (
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <p className="text-green-800 font-medium mb-2">Expediente seleccionado:</p>
                  <p className="text-green-900 font-semibold">{expedienteSeleccionado.cliente_nombre || expedienteSeleccionado.nombre_grupo}</p>
                  <p className="text-sm text-green-700">{expedienteSeleccionado.destino}</p>
                  {expedienteSeleccionado.fecha_viaje && (
                    <p className="text-xs text-green-600 mt-1">
                      Fecha: {new Date(expedienteSeleccionado.fecha_viaje).toLocaleDateString('es-ES')}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowModalGrupo(false)
                  setExpedienteSeleccionado(null)
                }}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors flex-1"
              >
                Cancelar
              </button>
              <button
                onClick={facturarGrupo}
                disabled={!expedienteSeleccionado}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors flex-1 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Continuar a Facturación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Cierres
