import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Plus, Phone, Trash2, X, Search, Navigation, RefreshCw, Calendar, Edit3 } from 'lucide-react'

const SUPABASE_URL = 'https://gtwyqxfkpdwpakmgrkbu.supabase.co'
const SUPABASE_KEY = 'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const CRM = () => {
  const [prospectos, setProspectos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [nuevo, setNuevo] = useState({
    grupo: '', contacto: '', telefono: '', interes: 'Medio', notas: '', ubicacion: '', fecha: new Date().toISOString().split('T')[0]
  })

  const cargarDatos = async () => {
    setLoading(true)
    // CRM: Orden por fecha descendente (lo último primero)
    const { data, error } = await supabase
      .from('prospectos')
      .select('*')
      .order('id', { ascending: false })
    
    if (!error) setProspectos(data || [])
    setLoading(false)
  }

  useEffect(() => { cargarDatos() }, [])

  // Filtrado en tiempo real (Buscador)
  const prospectosFiltrados = prospectos.filter(p => 
    p.grupo.toLowerCase().includes(busqueda.toLowerCase()) || 
    p.contacto.toLowerCase().includes(busqueda.toLowerCase())
  )

  const guardarCambios = async (e) => {
    e.preventDefault()
    try {
      const res = editandoId 
        ? await supabase.from('prospectos').update(nuevo).eq('id', editandoId)
        : await supabase.from('prospectos').insert([nuevo])
      
      if (res.error) throw res.error
      cerrarModal()
      cargarDatos()
    } catch (err) { alert("Error: " + err.message) }
  }

  const eliminar = async (id, nombre) => {
    if (window.confirm(`¿Seguro que quieres borrar a ${nombre}?`)) {
      await supabase.from('prospectos').delete().eq('id', id)
      cargarDatos()
    }
  }

  const cerrarModal = () => {
    setNuevo({ grupo: '', contacto: '', telefono: '', interes: 'Medio', notas: '', ubicacion: '', fecha: new Date().toISOString().split('T')[0] })
    setEditandoId(null)
    setShowModal(false)
  }

  return (
    <div className="p-4 bg-slate-50 min-h-screen pb-24 font-sans text-slate-900">
      {/* HEADER TIPO STUDIO */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-black tracking-tighter italic text-blue-900 uppercase">Tabora CRM</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Control de Visitas</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-blue-600 text-white p-4 rounded-2xl shadow-lg active:scale-95 transition-all">
          <Plus size={24} />
        </button>
      </div>

      {/* BARRA DE BÚSQUEDA */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input 
          type="text" 
          placeholder="Buscar empresa o contacto..." 
          className="w-full bg-white p-4 pl-12 rounded-2xl shadow-sm border-none outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {/* LISTADO CRONOLÓGICO */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-20"><RefreshCw className="animate-spin text-slate-300" size={32}/></div>
        ) : prospectosFiltrados.map(p => (
          <div key={p.id} className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100">
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-full text-[10px] font-bold text-slate-500">
                <Calendar size={12}/> {p.fecha}
              </div>
              <div className="flex gap-3">
                <button onClick={() => {setEditandoId(p.id); setNuevo(p); setShowModal(true)}} className="text-slate-300 hover:text-blue-500"><Edit3 size={18}/></button>
                <button onClick={() => eliminar(p.id, p.grupo)} className="text-slate-300 hover:text-red-500"><Trash2 size={18}/></button>
              </div>
            </div>
            
            <h3 className="font-bold text-lg mb-1">{p.grupo}</h3>
            <p className="text-sm text-slate-500 font-medium mb-4">{p.contacto || 'Sin contacto'}</p>
            
            <div className="grid grid-cols-2 gap-3">
              <a href={`tel:${p.telefono}`} className="bg-emerald-50 text-emerald-700 py-3 rounded-xl flex justify-center gap-2 font-bold text-xs">
                <Phone size={14}/> LLAMAR
              </a>
              <a href={p.ubicacion} target="_blank" rel="noreferrer" className="bg-blue-50 text-blue-700 py-3 rounded-xl flex justify-center gap-2 font-bold text-xs">
                <Navigation size={14}/> MAPA
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* MODAL (MISMO DISEÑO) */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl overflow-y-auto max-h-[85vh]">
             <form onSubmit={guardarCambios} className="space-y-4">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-black uppercase italic italic">{editandoId ? 'Editar' : 'Nueva'} Visita</h2>
                  <button type="button" onClick={cerrarModal} className="bg-slate-100 p-2 rounded-full"><X/></button>
                </div>
                <input placeholder="Empresa" required className="w-full p-4 bg-slate-50 rounded-xl outline-none border-none font-bold" value={nuevo.grupo} onChange={e => setNuevo({...nuevo, grupo: e.target.value})} />
                <input placeholder="Teléfono" className="w-full p-4 bg-slate-50 rounded-xl outline-none border-none font-bold" value={nuevo.telefono} onChange={e => setNuevo({...nuevo, telefono: e.target.value})} />
                <textarea placeholder="Notas de la visita..." className="w-full p-4 bg-slate-50 rounded-xl h-24 outline-none border-none" value={nuevo.notas} onChange={e => setNuevo({...nuevo, notas: e.target.value})} />
                <button type="submit" className="w-full bg-blue-900 text-white py-4 rounded-2xl font-black text-sm shadow-xl uppercase">Guardar en CRM</button>
             </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default CRM