import React, { useState, useEffect } from 'react'
import { FileText, Plus, TrendingUp, TrendingDown, DollarSign } from 'lucide-react'
import { storage } from '../utils/storage'

const Cierres = () => {
  const [cierres, setCierres] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    nombreGrupo: '',
    destino: '',
    fechaInicio: '',
    fechaFin: '',
    nPax: 39,
    precioViaje: 469,
    suplementoIndividual: 130,
    nIndividuales: 1,
    descuentoPax: 10,
    nDescuentos: 38,
    gratuidades: 469,
    nGratuidades: 1,
    // Gastos
    gastos: []
  })

  const [nuevoGasto, setNuevoGasto] = useState({
    concepto: '',
    cantidad: 0,
    precio: 0,
  })

  useEffect(() => {
    loadCierres()
  }, [])

  const loadCierres = () => {
    const saved = storage.getCierres()
    setCierres(saved)
  }

  const calcularTotales = () => {
    const {
      nPax,
      precioViaje,
      suplementoIndividual,
      nIndividuales,
      descuentoPax,
      nDescuentos,
      gratuidades,
      nGratuidades,
      gastos
    } = formData

    // Ingresos
    const totalViajes = nPax * precioViaje
    const totalSuplemento = nIndividuales * suplementoIndividual
    const totalDescuentos = nDescuentos * descuentoPax
    const totalGratuidades = nGratuidades * gratuidades
    
    const totalCobrado = totalViajes + totalSuplemento - totalDescuentos

    // Gastos
    const totalGastos = gastos.reduce((sum, g) => sum + (g.cantidad * g.precio), 0)

    // Beneficio
    const beneficioBruto = totalCobrado - totalGastos
    const iva = beneficioBruto * 0.21
    const beneficioNeto = beneficioBruto - iva
    const netoPax = beneficioNeto / nPax

    return {
      totalViajes,
      totalSuplemento,
      totalDescuentos,
      totalGratuidades,
      totalCobrado,
      totalGastos,
      beneficioBruto,
      iva,
      beneficioNeto,
      netoPax
    }
  }

  const agregarGasto = () => {
    if (nuevoGasto.concepto && nuevoGasto.cantidad > 0) {
      setFormData({
        ...formData,
        gastos: [...formData.gastos, { ...nuevoGasto, id: Date.now() }]
      })
      setNuevoGasto({ concepto: '', cantidad: 0, precio: 0 })
    }
  }

  const eliminarGasto = (id) => {
    setFormData({
      ...formData,
      gastos: formData.gastos.filter(g => g.id !== id)
    })
  }

  const guardarCierre = () => {
    if (!formData.nombreGrupo || !formData.destino) {
      alert('Por favor completa el nombre del grupo y destino')
      return
    }

    const totales = calcularTotales()
    const nuevoCierre = {
      id: Date.now(),
      fecha: new Date().toISOString(),
      ...formData,
      totales
    }

    const updated = [...cierres, nuevoCierre]
    setCierres(updated)
    storage.setCierres(updated)
    setShowModal(false)
    resetForm()
    alert('Cierre guardado correctamente')
  }

  const resetForm = () => {
    setFormData({
      nombreGrupo: '',
      destino: '',
      fechaInicio: '',
      fechaFin: '',
      nPax: 39,
      precioViaje: 469,
      suplementoIndividual: 130,
      nIndividuales: 1,
      descuentoPax: 10,
      nDescuentos: 38,
      gratuidades: 469,
      nGratuidades: 1,
      gastos: []
    })
  }

  const totales = calcularTotales()

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-navy-900 mb-2">Cierres de Grupo</h1>
          <p className="text-gray-600">Control de gastos e ingresos por viaje</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={20} />
          Nuevo Cierre
        </button>
      </div>

      {/* Cierres Guardados */}
      {cierres.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {cierres.slice().reverse().map((cierre) => (
            <div key={cierre.id} className="card">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold text-navy-900">{cierre.nombreGrupo}</h3>
                  <p className="text-gray-600">{cierre.destino}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(cierre.fecha).toLocaleDateString('es-ES')} | {cierre.nPax} PAX
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${cierre.totales.beneficioNeto > 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                  {cierre.totales.beneficioNeto > 0 ? (
                    <TrendingUp className="text-green-600" size={24} />
                  ) : (
                    <TrendingDown className="text-red-600" size={24} />
                  )}
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Total Cobrado:</span>
                  <span className="font-bold text-green-600">{cierre.totales.totalCobrado.toFixed(2)}€</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Total Gastos:</span>
                  <span className="font-bold text-red-600">{cierre.totales.totalGastos.toFixed(2)}€</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Beneficio Bruto:</span>
                  <span className="font-bold text-blue-600">{cierre.totales.beneficioBruto.toFixed(2)}€</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">IVA (21%):</span>
                  <span className="font-bold text-orange-600">{cierre.totales.iva.toFixed(2)}€</span>
                </div>
                <div className="flex justify-between py-3 bg-navy-50 rounded-lg px-3 mt-2">
                  <span className="font-bold text-navy-900">Beneficio Neto:</span>
                  <span className={`text-xl font-bold ${cierre.totales.beneficioNeto > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {cierre.totales.beneficioNeto.toFixed(2)}€
                  </span>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="text-gray-600">Neto por PAX:</span>
                  <span className="font-medium">{cierre.totales.netoPax.toFixed(2)}€</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {cierres.length === 0 && (
        <div className="card text-center py-12">
          <FileText className="mx-auto text-gray-400 mb-4" size={64} />
          <h3 className="text-xl font-bold text-gray-700 mb-2">No hay cierres registrados</h3>
          <p className="text-gray-600 mb-6">Crea tu primer cierre de grupo para controlar gastos e ingresos</p>
          <button onClick={() => setShowModal(true)} className="btn-primary inline-flex items-center gap-2">
            <Plus size={20} />
            Crear Primer Cierre
          </button>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h2 className="text-2xl font-bold text-navy-900">Nuevo Cierre de Grupo</h2>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Formulario */}
              <div className="lg:col-span-2 space-y-6">
                {/* Datos Básicos */}
                <div className="card">
                  <h3 className="text-lg font-bold text-navy-900 mb-4">Datos del Viaje</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Grupo *</label>
                      <input
                        type="text"
                        required
                        value={formData.nombreGrupo}
                        onChange={(e) => setFormData({ ...formData, nombreGrupo: e.target.value })}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="label">Destino *</label>
                      <input
                        type="text"
                        required
                        value={formData.destino}
                        onChange={(e) => setFormData({ ...formData, destino: e.target.value })}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="label">Fecha Inicio</label>
                      <input
                        type="date"
                        value={formData.fechaInicio}
                        onChange={(e) => setFormData({ ...formData, fechaInicio: e.target.value })}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="label">Fecha Fin</label>
                      <input
                        type="date"
                        value={formData.fechaFin}
                        onChange={(e) => setFormData({ ...formData, fechaFin: e.target.value })}
                        className="input-field"
                      />
                    </div>
                  </div>
                </div>

                {/* Ingresos */}
                <div className="card">
                  <h3 className="text-lg font-bold text-navy-900 mb-4">Ingresos</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Nº PAX</label>
                      <input
                        type="number"
                        value={formData.nPax}
                        onChange={(e) => setFormData({ ...formData, nPax: parseFloat(e.target.value) || 0 })}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="label">Precio Viaje (€)</label>
                      <input
                        type="number"
                        value={formData.precioViaje}
                        onChange={(e) => setFormData({ ...formData, precioViaje: parseFloat(e.target.value) || 0 })}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="label">Nº Individuales</label>
                      <input
                        type="number"
                        value={formData.nIndividuales}
                        onChange={(e) => setFormData({ ...formData, nIndividuales: parseFloat(e.target.value) || 0 })}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="label">Supl. Individual (€)</label>
                      <input
                        type="number"
                        value={formData.suplementoIndividual}
                        onChange={(e) => setFormData({ ...formData, suplementoIndividual: parseFloat(e.target.value) || 0 })}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="label">Nº Descuentos</label>
                      <input
                        type="number"
                        value={formData.nDescuentos}
                        onChange={(e) => setFormData({ ...formData, nDescuentos: parseFloat(e.target.value) || 0 })}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="label">Descuento PAX (€)</label>
                      <input
                        type="number"
                        value={formData.descuentoPax}
                        onChange={(e) => setFormData({ ...formData, descuentoPax: parseFloat(e.target.value) || 0 })}
                        className="input-field"
                      />
                    </div>
                  </div>
                </div>

                {/* Gastos */}
                <div className="card">
                  <h3 className="text-lg font-bold text-navy-900 mb-4">Gastos</h3>
                  
                  {/* Agregar Gasto */}
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    <div className="col-span-2">
                      <input
                        type="text"
                        placeholder="Concepto"
                        value={nuevoGasto.concepto}
                        onChange={(e) => setNuevoGasto({ ...nuevoGasto, concepto: e.target.value })}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        placeholder="Cant."
                        value={nuevoGasto.cantidad}
                        onChange={(e) => setNuevoGasto({ ...nuevoGasto, cantidad: parseFloat(e.target.value) || 0 })}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        placeholder="Precio"
                        value={nuevoGasto.precio}
                        onChange={(e) => setNuevoGasto({ ...nuevoGasto, precio: parseFloat(e.target.value) || 0 })}
                        className="input-field"
                      />
                    </div>
                  </div>
                  <button onClick={agregarGasto} className="btn-secondary w-full mb-4">
                    Agregar Gasto
                  </button>

                  {/* Lista de Gastos */}
                  {formData.gastos.length > 0 && (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {formData.gastos.map((gasto) => (
                        <div key={gasto.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium text-gray-900">{gasto.concepto}</p>
                            <p className="text-sm text-gray-600">
                              {gasto.cantidad} x {gasto.precio}€ = {(gasto.cantidad * gasto.precio).toFixed(2)}€
                            </p>
                          </div>
                          <button
                            onClick={() => eliminarGasto(gasto.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Resumen */}
              <div className="space-y-4">
                <div className="card bg-gradient-to-br from-green-50 to-green-100 sticky top-24">
                  <h3 className="text-lg font-bold text-navy-900 mb-4 flex items-center gap-2">
                    <DollarSign size={20} />
                    Resumen Financiero
                  </h3>
                  
                  <div className="space-y-3 text-sm">
                    <div className="pb-2 border-b border-green-200">
                      <p className="text-gray-600 mb-1">Ingresos Viajes</p>
                      <p className="text-lg font-bold text-green-700">{totales.totalViajes.toFixed(2)}€</p>
                    </div>
                    
                    <div className="pb-2 border-b border-green-200">
                      <p className="text-gray-600 mb-1">Suplementos</p>
                      <p className="font-medium text-green-600">+{totales.totalSuplemento.toFixed(2)}€</p>
                    </div>
                    
                    <div className="pb-2 border-b border-red-200">
                      <p className="text-gray-600 mb-1">Descuentos</p>
                      <p className="font-medium text-red-600">-{totales.totalDescuentos.toFixed(2)}€</p>
                    </div>
                    
                    <div className="pb-2 border-b border-green-300">
                      <p className="text-gray-700 font-medium mb-1">Total Cobrado</p>
                      <p className="text-xl font-bold text-green-700">{totales.totalCobrado.toFixed(2)}€</p>
                    </div>
                    
                    <div className="pb-2 border-b border-red-300">
                      <p className="text-gray-700 font-medium mb-1">Total Gastos</p>
                      <p className="text-xl font-bold text-red-600">{totales.totalGastos.toFixed(2)}€</p>
                    </div>
                    
                    <div className="pb-2 border-b border-blue-200">
                      <p className="text-gray-700 font-medium mb-1">Beneficio Bruto</p>
                      <p className="text-lg font-bold text-blue-600">{totales.beneficioBruto.toFixed(2)}€</p>
                    </div>
                    
                    <div className="pb-2 border-b border-orange-200">
                      <p className="text-gray-600 mb-1">IVA (21%)</p>
                      <p className="font-medium text-orange-600">-{totales.iva.toFixed(2)}€</p>
                    </div>
                    
                    <div className="pt-2 bg-navy-900 -mx-6 -mb-6 px-6 pb-6 rounded-b-xl">
                      <p className="text-white font-medium mb-2">Beneficio Neto</p>
                      <p className={`text-3xl font-bold ${totales.beneficioNeto > 0 ? 'text-green-300' : 'text-red-300'}`}>
                        {totales.beneficioNeto.toFixed(2)}€
                      </p>
                      <p className="text-navy-200 text-sm mt-2">
                        {totales.netoPax.toFixed(2)}€ por PAX
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3 sticky bottom-0 bg-white">
              <button onClick={guardarCierre} className="btn-primary flex-1">
                Guardar Cierre
              </button>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="btn-secondary flex-1">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Cierres
