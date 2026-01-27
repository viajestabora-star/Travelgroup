import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Plus, Edit2, Trash2, X, Search, User, MapPin, Mail, Phone, Users } from 'lucide-react'

const SUPABASE_URL = 'https://gtwyqxfkpdwpakmgrkbu.supabase.co'
const SUPABASE_KEY = 'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const Clientes = () => {
  const [clientes, setClientes] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  
  const [formData, setFormData] = useState({
    nombre: '', 
    cif_nif: '', 
    telefono: '', 
    email: '',
    direccion: '', 
    poblacion: '', 
    provincia: '',
    codigo_postal: '', 
    observaciones: '',
    responsable: '', // Responsable
    movil: '', // Móvil
    bonificaciones: '', // Bonificaciones (en lugar de comisiones)
    gratuidades: '' // Gratuidades
  })

  useEffect(() => { fetchClientes() }, [])

  const fetchClientes = async () => {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('nombre', { ascending: true }) // Orden alfabético obligatorio
    if (!error) setClientes(data)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const action = editingId 
      ? supabase.from('clientes').update(formData).eq('id', editingId)
      : supabase.from('clientes').insert([formData])
    
    const { error } = await action
    if (!error) { closeModal(); fetchClientes(); }
    else { alert("Error al guardar cliente: " + error.message) }
  }

  const deleteCliente = async (id, nombre) => {
    if (window.confirm(`¿Estás seguro de que quieres eliminar al cliente ${nombre}?`)) {
      const { error } = await supabase.from('clientes').delete().eq('id', id)
      if (!error) fetchClientes()
    }
  }

  const openModal = (c = null) => {
    if (c) {
      setEditingId(c.id); setFormData({ 
        nombre: c.nombre || '', 
        cif_nif: c.cif_nif || c.cif || '', 
        telefono: c.telefono || '', 
        email: c.email || '', 
        direccion: c.direccion || '', 
        poblacion: c.poblacion || '', 
        provincia: c.provincia || '', 
        codigo_postal: c.codigo_postal || c.cp || '', 
        observaciones: c.observaciones || '',
        responsable: c.responsable || c.personaContacto || '',
        movil: c.movil || '',
        bonificaciones: c.bonificaciones || c.comisiones || '',
        gratuidades: c.gratuidades || ''
      })
    } else {
      setEditingId(null); setFormData({ 
        nombre: '', 
        cif_nif: '', 
        telefono: '', 
        email: '', 
        direccion: '', 
        poblacion: '', 
        provincia: '', 
        codigo_postal: '', 
        observaciones: '',
        responsable: '',
        movil: '',
        bonificaciones: '',
        gratuidades: ''
      })
    }
    setShowModal(true)
  }

  const closeModal = () => { setShowModal(false); setEditingId(null); }

  const filtered = clientes.filter(c => c.nombre?.toLowerCase().includes(searchTerm.toLowerCase()))

  return (
    <div className="p-10 max-w-[1700px] mx-auto bg-white min-h-screen font-sans">
      <div className="flex justify-between items-end mb-10 border-b-4 border-slate-900 pb-6">
        <div>
          <h1 className="text-6xl font-[1000] italic tracking-tighter text-slate-900 uppercase text-left">Cartera de Clientes</h1>
          <p className="text-slate-400 font-bold text-xs tracking-[0.2em] mt-2 uppercase text-left">Base de Datos de Expedientes y Grupos</p>
        </div>
        <button onClick={() => openModal()} className="bg-slate-900 text-white px-10 py-5 rounded-2xl font-black italic uppercase text-lg hover:bg-green-600 transition-all shadow-2xl active:scale-95">
          + Nuevo Cliente
        </button>
      </div>

      <div className="relative mb-8">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
        <input placeholder="Buscar por nombre de cliente o grupo..." className="w-full bg-slate-50 p-6 pl-16 rounded-2xl font-bold text-lg border-none outline-none focus:ring-4 focus:ring-slate-100 text-left" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden text-left">
        <table className="w-full">
          <thead className="bg-slate-900 text-white">
            <tr>
              <th className="px-8 py-6 text-xs font-black uppercase tracking-widest">Nombre / Entidad</th>
              <th className="px-6 py-6 text-xs font-black uppercase tracking-widest">Contacto Directo</th>
              <th className="px-6 py-6 text-xs font-black uppercase tracking-widest">Ubicación</th>
              <th className="px-8 py-6 text-xs font-black uppercase tracking-widest text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(c => (
              <tr key={c.id} className="hover:bg-green-50/30 transition-all group">
                <td className="px-8 py-6">
                  <div className="font-[1000] text-slate-900 text-xl italic uppercase leading-tight">{c.nombre}</div>
                  <div className="text-[10px] font-black text-slate-400 mt-1 uppercase italic tracking-widest">{c.cif_nif || 'Sin CIF'}</div>
                </td>
                <td className="px-6 py-6">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-2"><Phone size={14} className="text-green-600"/> {c.movil || c.telefono || '-'}</div>
                  <div className="text-xs font-medium text-slate-400 flex items-center gap-2 mt-1"><Mail size={14}/> {c.email || '-'}</div>
                  {c.responsable && (
                    <div className="text-xs font-medium text-slate-500 flex items-center gap-2 mt-1">👤 {c.responsable}</div>
                  )}
                </td>
                <td className="px-6 py-6">
                  <div className="text-xs font-bold text-slate-800 uppercase leading-relaxed"><MapPin size={14} className="inline mr-1 text-slate-400"/> {c.poblacion}</div>
                  <div className="text-[10px] font-black text-slate-400 mt-1 ml-5 uppercase">{c.provincia}</div>
                </td>
                <td className="px-8 py-6 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openModal(c)} className="p-4 bg-slate-100 text-slate-900 rounded-2xl hover:bg-slate-900 hover:text-white transition-all mr-2"><Edit2 size={20}/></button>
                  <button onClick={() => deleteCliente(c.id, c.nombre)} className="p-4 bg-red-50 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition-all"><Trash2 size={20}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-50 p-6 text-left">
          <div 
            className="w-full max-w-5xl max-h-[95vh] overflow-y-auto"
            style={{ 
              backgroundColor: 'white', 
              padding: '32px', 
              borderRadius: '24px', 
              boxShadow: '0 10px 25px rgba(0,0,0,0.05), 0 5px 10px rgba(0,0,0,0.05)', 
              border: '1px solid #f3f4f6' 
            }}
          >
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-full">
                  <Users className="text-blue-600" size={24} />
                </div>
                <h2 className="text-3xl font-bold text-slate-900">Ficha de Cliente</h2>
              </div>
              <button onClick={closeModal} className="p-2 bg-gray-100 rounded-full hover:bg-red-500 hover:text-white transition-all"><X size={24}/></button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Nombre o Razón Social */}
                <div className="md:col-span-2">
                  <label className="block mb-2" style={{ color: '#6B7280', fontSize: '12px', fontWeight: '500' }}>
                    Nombre o Razón Social *
                  </label>
                  <input 
                    required 
                    className="w-full p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    style={{ 
                      backgroundColor: 'white', 
                      color: '#111827', 
                      fontSize: '16px', 
                      fontWeight: '600',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb'
                    }}
                    value={formData.nombre} 
                    onChange={e=>setFormData({...formData, nombre:e.target.value})} 
                  />
                </div>

                {/* CIF / NIF */}
                <div>
                  <label className="block mb-2" style={{ color: '#6B7280', fontSize: '12px', fontWeight: '500' }}>
                    CIF / NIF
                  </label>
                  <input 
                    className="w-full p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    style={{ 
                      backgroundColor: 'white', 
                      color: '#111827', 
                      fontSize: '16px', 
                      fontWeight: '600',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb'
                    }}
                    value={formData.cif_nif} 
                    onChange={e=>setFormData({...formData, cif_nif:e.target.value})} 
                  />
                </div>

                {/* Teléfono de Contacto */}
                <div>
                  <label className="block mb-2" style={{ color: '#6B7280', fontSize: '12px', fontWeight: '500' }}>
                    Teléfono de Contacto
                  </label>
                  <input 
                    className="w-full p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    style={{ 
                      backgroundColor: 'white', 
                      color: '#111827', 
                      fontSize: '16px', 
                      fontWeight: '600',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb'
                    }}
                    value={formData.telefono} 
                    onChange={e=>setFormData({...formData, telefono:e.target.value})} 
                  />
                </div>

                {/* Email de Facturación / Envío */}
                <div className="md:col-span-2">
                  <label className="block mb-2" style={{ color: '#6B7280', fontSize: '12px', fontWeight: '500' }}>
                    Email de Facturación / Envío
                  </label>
                  <input 
                    type="email"
                    className="w-full p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    style={{ 
                      backgroundColor: 'white', 
                      color: '#111827', 
                      fontSize: '16px', 
                      fontWeight: '600',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb'
                    }}
                    value={formData.email} 
                    onChange={e=>setFormData({...formData, email:e.target.value})} 
                  />
                </div>

                {/* Dirección */}
                <div className="md:col-span-2">
                  <label className="block mb-2" style={{ color: '#6B7280', fontSize: '12px', fontWeight: '500' }}>
                    Dirección
                  </label>
                  <input 
                    className="w-full p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    style={{ 
                      backgroundColor: 'white', 
                      color: '#111827', 
                      fontSize: '16px', 
                      fontWeight: '600',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb'
                    }}
                    value={formData.direccion} 
                    onChange={e=>setFormData({...formData, direccion:e.target.value})} 
                  />
                </div>

                {/* Responsable */}
                <div>
                  <label className="block mb-2" style={{ color: '#6B7280', fontSize: '12px', fontWeight: '500' }}>
                    Responsable
                  </label>
                  <input 
                    className="w-full p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    style={{ 
                      backgroundColor: 'white', 
                      color: '#111827', 
                      fontSize: '16px', 
                      fontWeight: '600',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb'
                    }}
                    value={formData.responsable} 
                    onChange={e=>setFormData({...formData, responsable:e.target.value})} 
                  />
                </div>

                {/* Móvil */}
                <div>
                  <label className="block mb-2" style={{ color: '#6B7280', fontSize: '12px', fontWeight: '500' }}>
                    Móvil
                  </label>
                  <input 
                    className="w-full p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    style={{ 
                      backgroundColor: 'white', 
                      color: '#111827', 
                      fontSize: '16px', 
                      fontWeight: '600',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb'
                    }}
                    value={formData.movil} 
                    onChange={e=>setFormData({...formData, movil:e.target.value})} 
                  />
                </div>

                {/* Bonificaciones */}
                <div>
                  <label className="block mb-2" style={{ color: '#6B7280', fontSize: '12px', fontWeight: '500' }}>
                    Bonificaciones
                  </label>
                  <input 
                    className="w-full p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    style={{ 
                      backgroundColor: 'white', 
                      color: '#111827', 
                      fontSize: '16px', 
                      fontWeight: '600',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb'
                    }}
                    value={formData.bonificaciones} 
                    onChange={e=>setFormData({...formData, bonificaciones:e.target.value})} 
                    placeholder="Ej: 15€" 
                  />
                </div>

                {/* Gratuidades */}
                <div>
                  <label className="block mb-2" style={{ color: '#6B7280', fontSize: '12px', fontWeight: '500' }}>
                    Gratuidades
                  </label>
                  <input 
                    className="w-full p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    style={{ 
                      backgroundColor: 'white', 
                      color: '#111827', 
                      fontSize: '16px', 
                      fontWeight: '600',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb'
                    }}
                    value={formData.gratuidades} 
                    onChange={e=>setFormData({...formData, gratuidades:e.target.value})} 
                    placeholder="Ej: 1 plaza gratis por cada 25 de pago" 
                  />
                </div>

                {/* Población */}
                <div>
                  <label className="block mb-2" style={{ color: '#6B7280', fontSize: '12px', fontWeight: '500' }}>
                    Población
                  </label>
                  <input 
                    className="w-full p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    style={{ 
                      backgroundColor: 'white', 
                      color: '#111827', 
                      fontSize: '16px', 
                      fontWeight: '600',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb'
                    }}
                    value={formData.poblacion} 
                    onChange={e=>setFormData({...formData, poblacion:e.target.value})} 
                  />
                </div>

                {/* Provincia */}
                <div>
                  <label className="block mb-2" style={{ color: '#6B7280', fontSize: '12px', fontWeight: '500' }}>
                    Provincia
                  </label>
                  <input 
                    className="w-full p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    style={{ 
                      backgroundColor: 'white', 
                      color: '#111827', 
                      fontSize: '16px', 
                      fontWeight: '600',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb'
                    }}
                    value={formData.provincia} 
                    onChange={e=>setFormData({...formData, provincia:e.target.value})} 
                  />
                </div>

                {/* Observaciones del Cliente */}
                <div className="md:col-span-2">
                  <label className="block mb-2" style={{ color: '#6B7280', fontSize: '12px', fontWeight: '500' }}>
                    Observaciones del Cliente
                  </label>
                  <textarea 
                    className="w-full p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    style={{ 
                      backgroundColor: 'white', 
                      color: '#111827', 
                      fontSize: '16px', 
                      fontWeight: '600',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb',
                      minHeight: '100px'
                    }}
                    rows="3" 
                    value={formData.observaciones} 
                    onChange={e=>setFormData({...formData, observaciones:e.target.value})} 
                  />
                </div>
              </div>

              {/* Botón Guardar abajo a la derecha */}
              <div className="flex justify-end mt-8 pt-6 border-t border-gray-200">
                <button 
                  type="submit" 
                  className="bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-semibold transition-colors shadow-md"
                >
                  Guardar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Clientes