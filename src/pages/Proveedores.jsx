import React, { useState, useEffect } from 'react'
import { Truck, Plus, Edit2, Trash2, X, Save, Building2, Search } from 'lucide-react'
import { storage } from '../utils/storage'

const Proveedores = () => {
  const [proveedores, setProveedores] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [tipoFilter, setTipoFilter] = useState('todos') // Filtro por tipo de servicio
  const [showModal, setShowModal] = useState(false)
  const [editingProveedor, setEditingProveedor] = useState(null)
  const [formData, setFormData] = useState({
    nombreComercial: '',
    nombreFiscal: '',
    cif: '',
    personaContacto: '',
    telefono: '',
    movil: '',
    email: '',
    direccion: '',
    poblacion: '',
    cp: '',
    provincia: '',
    pais: 'España',
    iban: '',
    tipo: 'hotel',
    observaciones: '',
  })

  const tiposProveedor = [
    { value: 'hotel', label: 'Hotel', icon: '🏨' },
    { value: 'restaurante', label: 'Restaurante', icon: '🍽️' },
    { value: 'autobus', label: 'Autobús', icon: '🚌' },
    { value: 'guia', label: 'Guía', icon: '👤' },
    { value: 'entradas', label: 'Entradas/Tickets', icon: '🎫' },
    { value: 'seguro', label: 'Seguro', icon: '🛡️' },
    { value: 'otro', label: 'Otro', icon: '📦' },
  ]

  useEffect(() => {
    loadProveedores()
  }, [])

  const loadProveedores = () => {
    const saved = storage.get('proveedores') || []
    setProveedores(saved)
  }

  const saveProveedores = (data) => {
    storage.set('proveedores', data)
    setProveedores(data)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    let updated

    if (editingProveedor) {
      // Editar proveedor existente - NO duplicar
      updated = proveedores.map(p => 
        p.id === editingProveedor.id ? { ...formData, id: p.id } : p
      )
    } else {
      // Crear nuevo proveedor
      const newProveedor = {
        ...formData,
        id: Date.now(),
      }
      updated = [...proveedores, newProveedor]
    }

    saveProveedores(updated)
    closeModal()
    
    if (editingProveedor) {
      alert('✅ Proveedor actualizado correctamente')
    } else {
      alert('✅ Proveedor creado correctamente')
    }
  }

  const handleDelete = (id) => {
    const proveedor = proveedores.find(p => p.id === id)
    const nombreProveedor = proveedor?.nombreComercial || proveedor?.nombre || 'este proveedor'
    const tipoProveedor = proveedor ? getTipoLabel(proveedor.tipo) : ''
    
    if (window.confirm(`¿Está seguro de que desea eliminar a "${nombreProveedor}" (${tipoProveedor})?\n\nEsta acción no se puede deshacer.`)) {
      const updated = proveedores.filter(p => p.id !== id)
      saveProveedores(updated)
      alert('✅ Proveedor eliminado correctamente')
    }
  }

  const openModal = (proveedor = null) => {
    if (proveedor) {
      setEditingProveedor(proveedor)
      setFormData({
        nombreComercial: proveedor.nombreComercial || proveedor.nombre || '',
        nombreFiscal: proveedor.nombreFiscal || '',
        cif: proveedor.cif || '',
        personaContacto: proveedor.personaContacto || proveedor.contacto || '',
        telefono: proveedor.telefono || '',
        movil: proveedor.movil || '',
        email: proveedor.email || '',
        direccion: proveedor.direccion || '',
        poblacion: proveedor.poblacion || '',
        cp: proveedor.cp || '',
        provincia: proveedor.provincia || '',
        pais: proveedor.pais || 'España',
        iban: proveedor.iban || '',
        tipo: proveedor.tipo || 'hotel',
        observaciones: proveedor.observaciones || '',
      })
    } else {
      setEditingProveedor(null)
      setFormData({
        nombreComercial: '',
        nombreFiscal: '',
        cif: '',
        personaContacto: '',
        telefono: '',
        movil: '',
        email: '',
        direccion: '',
        poblacion: '',
        cp: '',
        provincia: '',
        pais: 'España',
        iban: '',
        tipo: 'hotel',
        observaciones: '',
      })
    }
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingProveedor(null)
  }

  const getTipoLabel = (tipo) => {
    const t = tiposProveedor.find(tp => tp.value === tipo)
    return t ? t.label : tipo
  }

  const getTipoIcon = (tipo) => {
    const t = tiposProveedor.find(tp => tp.value === tipo)
    return t ? t.icon : '📦'
  }

  const filteredProveedores = proveedores
    .filter(proveedor => {
      // ============ FILTRO POR TIPO DE SERVICIO ============
      const coincideTipo = tipoFilter === 'todos' || proveedor.tipo === tipoFilter
      
      // ============ FILTRO POR BÚSQUEDA ============
      const coincideBusqueda = 
        (proveedor.nombreComercial?.toLowerCase() || proveedor.nombre?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (proveedor.poblacion?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (proveedor.cif?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (proveedor.personaContacto?.toLowerCase() || proveedor.contacto?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        getTipoLabel(proveedor.tipo).toLowerCase().includes(searchTerm.toLowerCase())
      
      return coincideTipo && coincideBusqueda
    })
    .sort((a, b) => {
      // Primero ordenar por tipo de servicio
      const tipoA = getTipoLabel(a.tipo)
      const tipoB = getTipoLabel(b.tipo)
      const compareTipo = tipoA.localeCompare(tipoB)
      
      if (compareTipo !== 0) {
        return compareTipo
      }
      
      // Si son del mismo tipo, ordenar alfabéticamente por nombre
      const nombreA = (a.nombreComercial || a.nombre || '').toLowerCase()
      const nombreB = (b.nombreComercial || b.nombre || '').toLowerCase()
      return nombreA.localeCompare(nombreB)
    })

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-navy-900 mb-2">Gestión de Proveedores</h1>
          <p className="text-gray-600">
            {tipoFilter === 'todos' 
              ? `Total: ${proveedores.length} proveedores registrados`
              : `${getTipoLabel(tipoFilter)}: ${filteredProveedores.length} de ${proveedores.length} proveedores`
            }
          </p>
        </div>
        <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
          <Plus size={20} />
          Nuevo Proveedor
        </button>
      </div>

      {/* Filtro por Tipo de Servicio */}
      <div className="card mb-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTipoFilter('todos')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tipoFilter === 'todos'
                ? 'bg-navy-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            📦 Todos ({proveedores.length})
          </button>
          {tiposProveedor.map(tipo => {
            const count = proveedores.filter(p => p.tipo === tipo.value).length
            return (
              <button
                key={tipo.value}
                onClick={() => setTipoFilter(tipo.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tipoFilter === tipo.value
                    ? 'bg-navy-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tipo.icon} {tipo.label} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* Search Bar */}
      <div className="card mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por nombre, tipo, población, CIF o contacto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        {tipoFilter !== 'todos' && (
          <p className="text-xs text-blue-600 mt-2">
            🔍 Filtrando por: <strong>{getTipoLabel(tipoFilter)}</strong> • {filteredProveedores.length} resultado(s)
          </p>
        )}
      </div>

      {/* Proveedores Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-navy-50 border-b-2 border-navy-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-navy-900 uppercase tracking-wider">
                  Nombre Comercial
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-navy-900 uppercase tracking-wider">
                  Tipo
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-navy-900 uppercase tracking-wider">
                  Población
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-navy-900 uppercase tracking-wider">
                  Teléfono
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-navy-900 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-right text-xs font-bold text-navy-900 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredProveedores.map((proveedor) => (
                <tr key={proveedor.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="text-2xl">{getTipoIcon(proveedor.tipo)}</div>
                      <div>
                        <div className="text-sm font-bold text-gray-900">
                          {proveedor.nombreComercial || proveedor.nombre || 'Sin nombre'}
                        </div>
                        {proveedor.personaContacto && (
                          <div className="text-xs text-gray-500">
                            👤 {proveedor.personaContacto || proveedor.contacto}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-navy-100 text-navy-800">
                      {getTipoLabel(proveedor.tipo)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-700">{proveedor.poblacion || '-'}</div>
                    {proveedor.provincia && (
                      <div className="text-xs text-gray-500">{proveedor.provincia}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {proveedor.telefono || proveedor.movil || '-'}
                    </div>
                    {proveedor.telefono && proveedor.movil && (
                      <div className="text-xs text-gray-500">📱 {proveedor.movil}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-700 truncate max-w-xs">
                      {proveedor.email || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => openModal(proveedor)}
                      className="text-navy-600 hover:text-navy-900 mr-3 p-2 hover:bg-navy-50 rounded-lg transition-colors"
                      title="Editar proveedor"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(proveedor.id)}
                      className="text-red-600 hover:text-red-900 p-2 hover:bg-red-50 rounded-lg transition-colors"
                      title="Eliminar proveedor"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {proveedores.length === 0 && (
        <div className="card text-center py-12 mt-6">
          <Truck className="mx-auto text-gray-400 mb-4" size={64} />
          <h3 className="text-xl font-bold text-gray-700 mb-2">No hay proveedores</h3>
          <p className="text-gray-600 mb-6">Crea tu primer proveedor</p>
          <button onClick={() => openModal()} className="btn-primary inline-flex items-center gap-2">
            <Plus size={20} />
            Crear Primer Proveedor
          </button>
        </div>
      )}

      {/* Modal de Edición/Creación */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header del Modal */}
            <div className="px-8 py-6 border-b border-gray-200 bg-gradient-to-r from-navy-50 to-white sticky top-0 z-10">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-3xl font-bold text-navy-900">
                    {editingProveedor ? 'Editar Proveedor' : 'Nuevo Proveedor'}
                  </h2>
                  <p className="text-gray-600 mt-1">
                    {editingProveedor ? 'Modifica los datos del proveedor' : 'Completa la información del nuevo proveedor'}
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-8">
              {/* Sección 1: Datos de Identidad */}
              <div className="mb-8">
                <h3 className="text-xl font-bold text-navy-900 mb-4 flex items-center gap-2">
                  <div className="w-1 h-6 bg-navy-600 rounded"></div>
                  Datos de Identidad
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="label">Nombre Comercial *</label>
                    <input
                      type="text"
                      value={formData.nombreComercial}
                      onChange={(e) => setFormData({ ...formData, nombreComercial: e.target.value })}
                      className="input-field"
                      placeholder="Nombre con el que opera el proveedor"
                      required
                    />
                  </div>

                  <div>
                    <label className="label">Nombre Fiscal</label>
                    <input
                      type="text"
                      value={formData.nombreFiscal}
                      onChange={(e) => setFormData({ ...formData, nombreFiscal: e.target.value })}
                      className="input-field"
                      placeholder="Nombre legal/registrado"
                    />
                  </div>

                  <div>
                    <label className="label">CIF</label>
                    <input
                      type="text"
                      value={formData.cif}
                      onChange={(e) => setFormData({ ...formData, cif: e.target.value })}
                      className="input-field"
                      placeholder="X0000000X"
                    />
                  </div>
                </div>
              </div>

              {/* Sección 2: Clasificación */}
              <div className="mb-8">
                <h3 className="text-xl font-bold text-navy-900 mb-4 flex items-center gap-2">
                  <div className="w-1 h-6 bg-purple-600 rounded"></div>
                  Clasificación
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Tipo de Proveedor *</label>
                    <select
                      value={formData.tipo}
                      onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
                      className="input-field"
                      required
                    >
                      {tiposProveedor.map(t => (
                        <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Sección 3: Contacto Directo */}
              <div className="mb-8">
                <h3 className="text-xl font-bold text-navy-900 mb-4 flex items-center gap-2">
                  <div className="w-1 h-6 bg-green-600 rounded"></div>
                  Contacto Directo
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="label">Persona de Contacto</label>
                    <input
                      type="text"
                      value={formData.personaContacto}
                      onChange={(e) => setFormData({ ...formData, personaContacto: e.target.value })}
                      className="input-field"
                      placeholder="Nombre del responsable o contacto principal"
                    />
                  </div>

                  <div>
                    <label className="label">Teléfono (Fijo)</label>
                    <input
                      type="tel"
                      value={formData.telefono}
                      onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                      className="input-field"
                      placeholder="900 000 000"
                    />
                  </div>

                  <div>
                    <label className="label">Móvil</label>
                    <input
                      type="tel"
                      value={formData.movil}
                      onChange={(e) => setFormData({ ...formData, movil: e.target.value })}
                      className="input-field"
                      placeholder="600 000 000"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="label">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="input-field"
                      placeholder="contacto@proveedor.com"
                    />
                  </div>
                </div>
              </div>

              {/* Sección 4: Ubicación */}
              <div className="mb-8">
                <h3 className="text-xl font-bold text-navy-900 mb-4 flex items-center gap-2">
                  <div className="w-1 h-6 bg-blue-600 rounded"></div>
                  Ubicación
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="label">Dirección</label>
                    <input
                      type="text"
                      value={formData.direccion}
                      onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                      className="input-field"
                      placeholder="Calle, número, piso..."
                    />
                  </div>

                  <div>
                    <label className="label">Población</label>
                    <input
                      type="text"
                      value={formData.poblacion}
                      onChange={(e) => setFormData({ ...formData, poblacion: e.target.value })}
                      className="input-field"
                      placeholder="Ciudad o pueblo"
                    />
                  </div>

                  <div>
                    <label className="label">Código Postal</label>
                    <input
                      type="text"
                      value={formData.cp}
                      onChange={(e) => setFormData({ ...formData, cp: e.target.value })}
                      className="input-field"
                      placeholder="00000"
                    />
                  </div>

                  <div>
                    <label className="label">Provincia</label>
                    <input
                      type="text"
                      value={formData.provincia}
                      onChange={(e) => setFormData({ ...formData, provincia: e.target.value })}
                      className="input-field"
                      placeholder="Provincia"
                    />
                  </div>

                  <div>
                    <label className="label">País</label>
                    <input
                      type="text"
                      value={formData.pais}
                      onChange={(e) => setFormData({ ...formData, pais: e.target.value })}
                      className="input-field"
                      placeholder="España"
                    />
                  </div>
                </div>
              </div>

              {/* Sección 5: Datos Financieros */}
              <div className="mb-8">
                <h3 className="text-xl font-bold text-navy-900 mb-4 flex items-center gap-2">
                  <div className="w-1 h-6 bg-orange-600 rounded"></div>
                  Datos Financieros
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="label">Número de Cuenta (IBAN)</label>
                    <input
                      type="text"
                      value={formData.iban}
                      onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                      className="input-field"
                      placeholder="ES00 0000 0000 0000 0000 0000"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Formato: ES + 22 dígitos
                    </p>
                  </div>
                </div>
              </div>

              {/* Sección 6: Observaciones */}
              <div className="mb-8">
                <h3 className="text-xl font-bold text-navy-900 mb-4 flex items-center gap-2">
                  <div className="w-1 h-6 bg-gray-600 rounded"></div>
                  Observaciones
                </h3>
                <div>
                  <label className="label">Notas y Observaciones</label>
                  <textarea
                    value={formData.observaciones}
                    onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                    className="input-field"
                    rows="4"
                    placeholder="Horarios de atención, condiciones especiales, tarifas, etc."
                  />
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="flex gap-3 pt-6 border-t border-gray-200">
                <button 
                  type="submit" 
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  <Save size={20} />
                  {editingProveedor ? 'Actualizar Proveedor' : 'Crear Proveedor'}
                </button>
                <button 
                  type="button" 
                  onClick={closeModal} 
                  className="btn-secondary flex-1"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Proveedores
