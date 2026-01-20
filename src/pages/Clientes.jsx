import React, { useState, useEffect } from 'react'
import { Search, Plus, Edit2, Trash2, X, Save, User, History, TrendingUp, Calendar, DollarSign } from 'lucide-react'
import { storage } from '../utils/storage'
import { initialClientes } from '../utils/initialData'

const Clientes = () => {
  const [clientes, setClientes] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingCliente, setEditingCliente] = useState(null)
  const [formData, setFormData] = useState({
    nombre: '', responsable: '', movilResponsable: '', telefonoHogar: '',
    email: '', razonSocial: '', cif: '', direccion: '', cp: '',
    poblacion: '', provincia: '', pais: 'España', nSocios: '', bonificaciones: '',
  })

  useEffect(() => { loadClientes() }, [])

  const loadClientes = () => {
    let loadedClientes = storage.getClientes()
    if (!loadedClientes || loadedClientes.length === 0) loadedClientes = initialClientes
    const ordenados = [...loadedClientes].sort((a, b) => 
      (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' })
    )
    setClientes(ordenados)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    let updatedClientes
    if (editingCliente) {
      updatedClientes = clientes.map(c => c.id === editingCliente.id ? { ...formData, id: c.id } : c)
    } else {
      updatedClientes = [...clientes, { ...formData, id: Date.now(), personaContacto: formData.responsable }]
    }
    const finalClientes = updatedClientes.sort((a, b) => 
      (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' })
    )
    setClientes(finalClientes)
    storage.setClientes(finalClientes)
    closeModal()
  }

  const handleDelete = (id) => {
    const cliente = clientes.find(c => c.id === id)
    if (window.confirm(`¿Está seguro de que desea eliminar a "${cliente?.nombre || 'este cliente'}"?`)) {
      const updatedClientes = clientes.filter(c => c.id !== id)
      setClientes(updatedClientes)
      storage.setClientes(updatedClientes)
    }
  }

  const openModal = (cliente = null) => {
    if (cliente) {
      setEditingCliente(cliente)
      setFormData({ ...cliente, responsable: cliente.responsable || cliente.personaContacto || '' })
    } else {
      setEditingCliente(null)
      setFormData({
        nombre: '', responsable: '', movilResponsable: '', telefonoHogar: '',
        email: '', razonSocial: '', cif: '', direccion: '', cp: '',
        poblacion: '', provincia: '', pais: 'España', nSocios: '', bonificaciones: '',
      })
    }
    setShowModal(true)
  }

  const closeModal = () => { setShowModal(false); setEditingCliente(null); }

  const filteredClientes = clientes.filter(cliente =>
    [cliente.nombre, cliente.poblacion, cliente.responsable].some(f => (f || '').toLowerCase().includes(searchTerm.toLowerCase()))
  )

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <h1 className="text-2xl font-bold text-navy-900">Gestión de Clientes</h1>
        <button onClick={() => openModal()} className="w-full md:w-auto bg-blue-600 text-white px-6 py-3 rounded-lg font-bold flex items-center justify-center gap-2">
          <Plus size={20} /> Nuevo Cliente
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm mb-6 border border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input type="text" placeholder="Buscar por nombre, responsable..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 outline-none" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-gray-200 text-xs font-bold uppercase text-slate-700">
              <tr>
                <th className="px-6 py-4">Grupo / Cliente</th>
                <th className="px-6 py-4">Responsable</th>
                <th className="px-6 py-4 hidden md:table-cell">Población</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredClientes.map((cliente) => (
                <tr key={cliente.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-bold">{cliente.nombre}</td>
                  <td className="px-6 py-4 text-sm">{cliente.responsable || '-'}</td>
                  <td className="px-6 py-4 hidden md:table-cell text-sm">{cliente.poblacion || '-'}</td>
                  <td className="px-6 py-4 text-right flex justify-end gap-2">
                    <button onClick={() => openModal(cliente)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"><Edit2 size={18} /></button>
                    <button onClick={() => handleDelete(cliente.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-4xl my-auto shadow-2xl overflow-hidden">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-bold">{editingCliente ? 'Editar' : 'Nuevo'} Cliente</h2>
              <button onClick={closeModal} className="p-2 hover:bg-gray-200 rounded-full"><X size={24} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[75vh]">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="md:col-span-3 font-bold text-navy-700 border-b pb-1">Información General</div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold mb-1 uppercase">Nombre del Grupo *</label>
                  <input type="text" required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full p-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 uppercase">Responsable</label>
                  <input type="text" value={formData.responsable} onChange={e => setFormData({...formData, responsable: e.target.value})} className="w-full p-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 uppercase">Móvil</label>
                  <input type="tel" value={formData.movilResponsable} onChange={e => setFormData({...formData, movilResponsable: e.target.value})} className="w-full p-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 uppercase">Tel. Hogar</label>
                  <input type="tel" value={formData.telefonoHogar} onChange={e => setFormData({...formData, telefonoHogar: e.target.value})} className="w-full p-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 uppercase">Email</label>
                  <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-2 border rounded-lg text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="md:col-span-2 font-bold text-navy-700 border-b pb-1">Datos Fiscales</div>
                <input type="text" placeholder="Razón Social" value={formData.razonSocial} onChange={e => setFormData({...formData, razonSocial: e.target.value})} className="w-full p-2 border rounded-lg text-sm" />
                <input type="text" placeholder="CIF" value={formData.cif} onChange={e => setFormData({...formData, cif: e.target.value})} className="w-full p-2 border rounded-lg text-sm" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="md:col-span-3 font-bold text-navy-700 border-b pb-1">Dirección</div>
                <div className="md:col-span-2"><input type="text" placeholder="Dirección" value={formData.direccion} onChange={e => setFormData({...formData, direccion: e.target.value})} className="w-full p-2 border rounded-lg text-sm" /></div>
                <input type="text" placeholder="C.P." value={formData.cp} onChange={e => setFormData({...formData, cp: e.target.value})} className="w-full p-2 border rounded-lg text-sm" />
                <input type="text" placeholder="Población" value={formData.poblacion} onChange={e => setFormData({...formData, poblacion: e.target.value})} className="w-full p-2 border rounded-lg text-sm" />
                <input type="text" placeholder="Provincia" value={formData.provincia} onChange={e => setFormData({...formData, provincia: e.target.value})} className="w-full p-2 border rounded-lg text-sm" />
                <input type="text" placeholder="País" value={formData.pais} onChange={e => setFormData({...formData, pais: e.target.value})} className="w-full p-2 border rounded-lg text-sm" />
              </div>

              <div className="mb-6">
                <div className="font-bold text-navy-700 border-b pb-1 mb-2">Otros Datos</div>
                <label className="block text-xs font-bold mb-1 uppercase">Bonificaciones Pactadas</label>
                <textarea value={formData.bonificaciones} onChange={e => setFormData({...formData, bonificaciones: e.target.value})} className="w-full p-2 border rounded-lg text-sm" rows="3"></textarea>
              </div>

              <div className="flex gap-3 sticky bottom-0 bg-white pt-4">
                <button type="submit" className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg">
                  <Save size={20} /> Guardar Cambios
                </button>
                <button type="button" onClick={closeModal} className="flex-1 bg-gray-100 py-3 rounded-xl font-bold">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Clientes