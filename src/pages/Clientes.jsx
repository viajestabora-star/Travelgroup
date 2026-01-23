import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Plus, Edit2, Trash2, X, Search, User, MapPin, Mail, Phone } from 'lucide-react'

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
    personaContacto: '', // Responsable
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
        personaContacto: c.personaContacto || c.responsable || '',
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
        personaContacto: '',
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
                  {c.personaContacto && (
                    <div className="text-xs font-medium text-slate-500 flex items-center gap-2 mt-1">👤 {c.personaContacto}</div>
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
          <div className="bg-white rounded-[3rem] w-full max-w-5xl max-h-[95vh] overflow-y-auto shadow-2xl p-12 border-4 border-slate-900">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-4xl font-[1000] italic uppercase tracking-tighter text-slate-900 text-left">Ficha de Cliente</h2>
              <button onClick={closeModal} className="p-4 bg-slate-100 rounded-full hover:bg-red-500 hover:text-white transition-all"><X size={32}/></button>
            </div>
            
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Nombre o Razón Social *</label>
                  <input required className="w-full p-6 bg-slate-50 rounded-2xl font-black text-2xl border-none outline-none focus:ring-4 focus:ring-green-100" value={formData.nombre} onChange={e=>setFormData({...formData, nombre:e.target.value})} />
               </div>
               <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase ml-2">CIF / NIF *</label>
                  <input required className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none" value={formData.cif_nif} onChange={e=>setFormData({...formData, cif_nif:e.target.value})} />
               </div>
               <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase ml-2">Teléfono de Contacto</label>
                  <input className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none" value={formData.telefono} onChange={e=>setFormData({...formData, telefono:e.target.value})} />
               </div>
               <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase ml-2">Email de Facturación / Envío</label>
                  <input className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none" value={formData.email} onChange={e=>setFormData({...formData, email:e.target.value})} />
               </div>
               <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase ml-2">Dirección *</label>
                  <input required className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none" value={formData.direccion} onChange={e=>setFormData({...formData, direccion:e.target.value})} />
               </div>
               <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase ml-2">Responsable *</label>
                  <input required className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none" value={formData.personaContacto} onChange={e=>setFormData({...formData, personaContacto:e.target.value})} />
               </div>
               <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase ml-2">Móvil *</label>
                  <input required className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none" value={formData.movil} onChange={e=>setFormData({...formData, movil:e.target.value})} />
               </div>
               <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase ml-2">Bonificaciones</label>
                  <input className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none" value={formData.bonificaciones} onChange={e=>setFormData({...formData, bonificaciones:e.target.value})} placeholder="Ej: 15€" />
               </div>
               <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase ml-2">Gratuidades</label>
                  <input className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none" value={formData.gratuidades} onChange={e=>setFormData({...formData, gratuidades:e.target.value})} placeholder="Ej: 1 plaza gratis por cada 25 de pago" />
               </div>
               <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase ml-2">Población</label>
                  <input className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none" value={formData.poblacion} onChange={e=>setFormData({...formData, poblacion:e.target.value})} />
               </div>
               <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase ml-2">Provincia</label>
                  <input className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none" value={formData.provincia} onChange={e=>setFormData({...formData, provincia:e.target.value})} />
               </div>
               <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase ml-2">Observaciones del Cliente</label>
                  <textarea className="w-full p-5 bg-slate-50 rounded-2xl font-medium border-none" rows="3" value={formData.observaciones} onChange={e=>setFormData({...formData, observaciones:e.target.value})} />
               </div>

               <div className="md:col-span-2 flex gap-4 pt-10">
                  <button type="submit" className="flex-[2] bg-slate-900 text-white py-8 rounded-[2rem] font-[1000] italic uppercase text-2xl tracking-tighter shadow-2xl hover:bg-green-600 transition-all">Guardar Cliente Cloud</button>
                  <button type="button" onClick={closeModal} className="flex-1 bg-slate-100 text-slate-400 py-8 rounded-[2rem] font-black uppercase italic">Descartar</button>
               </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Clientes