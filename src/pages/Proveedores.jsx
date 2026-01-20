import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Plus, Edit2, Trash2, X, Save, Search, Database, MapPin } from 'lucide-react'

// CREDENCIALES INTEGRADAS
const SUPABASE_URL = 'https://gtwyqxfkpdwpakmgrkbu.supabase.co'
const SUPABASE_KEY = 'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const Proveedores = () => {
  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [tipoFilter, setTipoFilter] = useState('todos')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  
  // Mapeo exacto a las columnas de tu Supabase
  const [formData, setFormData] = useState({
    nombre_comercial: '', tipo: 'hotel', cif: '', movil: '', 
    poblacion: '', iban: '', observaciones: ''
  })

  const tipos = [
    { id: 'hotel', label: 'Hotel', icon: '🏨' },
    { id: 'restaurante', label: 'Restaurante', icon: '🍽️' },
    { id: 'autobus', label: 'Autobús', icon: '🚌' },
    { id: 'guia', label: 'Guía', icon: '👤' },
    { id: 'entradas', label: 'Tickets', icon: '🎫' },
    { id: 'otro', label: 'Otro', icon: '📦' }
  ]

  useEffect(() => { fetchProveedores() }, [])

  const fetchProveedores = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('proveedores')
      .select('*')
      .order('nombre_comercial', { ascending: true })
    if (!error) setProveedores(data)
    setLoading(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const action = editingId 
      ? supabase.from('proveedores').update(formData).eq('id', editingId)
      : supabase.from('proveedores').insert([formData])
    
    const { error } = await action
    if (error) {
      alert("Error de conexión: " + error.message)
    } else {
      closeModal()
      fetchProveedores()
    }
  }

  const deleteProveedor = async (id, nombre) => {
    if (window.confirm(`¿Seguro que quieres eliminar a ${nombre}?`)) {
      await supabase.from('proveedores').delete().eq('id', id)
      fetchProveedores()
    }
  }

  const openModal = (p = null) => {
    if (p) {
      setEditingId(p.id)
      setFormData({ 
        nombre_comercial: p.nombre_comercial, tipo: p.tipo, cif: p.cif, 
        movil: p.movil, poblacion: p.poblacion, iban: p.iban, observaciones: p.observaciones 
      })
    } else {
      setEditingId(null)
      setFormData({ nombre_comercial: '', tipo: 'hotel', cif: '', movil: '', poblacion: '', iban: '', observaciones: '' })
    }
    setShowModal(true)
  }

  const closeModal = () => { setShowModal(false); setEditingId(null); }

  const filtered = proveedores.filter(p => 
    (tipoFilter === 'todos' || p.tipo === tipoFilter) &&
    (p.nombre_comercial?.toLowerCase().includes(searchTerm.toLowerCase()) || p.cif?.includes(searchTerm))
  )

  return (
    <div className="p-8 max-w-[1600px] mx-auto bg-white min-h-screen">
      <div className="flex justify-between items-end mb-10 border-b border-slate-100 pb-6">
        <div>
          <h1 className="text-4xl font-[1000] italic tracking-tighter text-slate-900 uppercase">Partner ERP</h1>
          <p className="text-slate-400 font-bold text-[10px] tracking-widest mt-2 uppercase">Desktop Management System • Cloud Synchronized</p>
        </div>
        <button onClick={() => openModal()} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black italic uppercase text-sm hover:bg-blue-600 transition-all shadow-xl">
          + Registrar Socio
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-8">
        <div className="lg:col-span-3 flex overflow-x-auto gap-2 no-scrollbar">
          <button onClick={() => setTipoFilter('todos')} className={`px-6 py-3 rounded-xl text-[10px] font-black transition-all ${tipoFilter === 'todos' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>TODOS</button>
          {tipos.map(t => (
            <button key={t.id} onClick={() => setTipoFilter(t.id)} className={`px-6 py-3 rounded-xl text-[10px] font-black transition-all flex items-center gap-2 whitespace-nowrap ${tipoFilter === t.id ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>
              {t.icon} {t.label.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
          <input placeholder="Filtrar por nombre o CIF..." className="w-full bg-slate-50 p-4 pl-12 rounded-xl border-none font-bold text-xs" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-400">
            <tr>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Nombre Comercial</th>
              <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest">Tipo</th>
              <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest">CIF</th>
              <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest">Ubicación</th>
              <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest">IBAN</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map(p => (
              <tr key={p.id} className="hover:bg-slate-50/50 transition-all group">
                <td className="px-8 py-5 font-black text-slate-900 text-sm italic uppercase">{p.nombre_comercial}</td>
                <td className="px-6 py-5">
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-lg">
                    {tipos.find(t=>t.id===p.tipo)?.label.toUpperCase()}
                  </span>
                </td>
                <td className="px-6 py-5 text-xs font-mono text-slate-400">{p.cif || '-'}</td>
                <td className="px-6 py-5 text-xs font-bold text-slate-500">{p.poblacion || '-'}</td>
                <td className="px-6 py-5 text-[10px] font-mono text-slate-400">{p.iban || 'PENDIENTE'}</td>
                <td className="px-8 py-5 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openModal(p)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg mr-2"><Edit2 size={16}/></button>
                  <button onClick={() => deleteProveedor(p.id, p.nombre_comercial)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-[3rem] w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl p-10">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-[1000] italic uppercase tracking-tighter">Ficha de Partner</h2>
              <button onClick={closeModal} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X/></button>
            </div>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nombre Comercial *</label>
                  <input required className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none focus:ring-2 focus:ring-slate-900" value={formData.nombre_comercial} onChange={e=>setFormData({...formData, nombre_comercial:e.target.value})} />
               </div>
               <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Tipo</label>
                  <select className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none" value={formData.tipo} onChange={e=>setFormData({...formData, tipo:e.target.value})}>
                    {tipos.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
               </div>
               <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">CIF/NIF</label>
                  <input className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none" value={formData.cif} onChange={e=>setFormData({...formData, cif:e.target.value})} />
               </div>
               <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">IBAN</label>
                  <input className="w-full p-5 bg-slate-50 rounded-2xl font-mono text-sm border-none" value={formData.iban} onChange={e=>setFormData({...formData, iban:e.target.value})} />
               </div>
               <div className="md:col-span-2 flex gap-4 pt-6">
                  <button type="submit" className="flex-[2] bg-slate-900 text-white py-6 rounded-[2rem] font-black italic uppercase shadow-xl hover:bg-blue-600 transition-all">Sincronizar Datos</button>
                  <button type="button" onClick={closeModal} className="flex-1 bg-slate-100 text-slate-400 py-6 rounded-[2rem] font-black uppercase italic">Cancelar</button>
               </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Proveedores