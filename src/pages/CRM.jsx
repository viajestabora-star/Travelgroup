import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Plus, Phone, Trash2, X, Search, Navigation, RefreshCw, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Edit3 } from 'lucide-react'

const SUPABASE_URL = 'https://gtwyqxfkpdwpakmgrkbu.supabase.co'
const SUPABASE_KEY = 'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const CRM = () => {
  const [prospectos, setProspectos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date().toISOString().split('T')[0])
  const [nuevo, setNuevo] = useState({
    grupo: '', contacto: '', telefono: '', interes: 'Medio', notas: '', ubicacion: '', fecha: new Date().toISOString().split('T')[0]
  })

  const cargarDatos = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('prospectos').select('*').order('id', { ascending: false })
    if (!error) setProspectos(data || [])
    setLoading(false)
  }

  useEffect(() => { cargarDatos() }, [])

  // Filtrado por buscador Y por fecha del calendario
  const prospectosFiltrados = prospectos.filter(p => {
    const coincideBusqueda = p.grupo.toLowerCase().includes(busqueda.toLowerCase()) || p.contacto.toLowerCase().includes(busqueda.toLowerCase())
    const coincideFecha = p.fecha === fechaSeleccionada
    return busqueda ? coincideBusqueda : coincideFecha
  })

  // Lógica simple de calendario para móvil
  const diasSemana = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
  const obtenerDiasMes = () => {
    const hoy = new Date()
    return Array.from({length: 7}, (_, i) => {
      const d = new Date()
      d.setDate(hoy.getDate() + i - 3) // Muestra 7 días alrededor de hoy
      return d.toISOString().split('T')[0]
    })
  }

  const guardarCambios = async (e) => {
    e.preventDefault()
    try {
      const res = editandoId ? await supabase.from('prospectos').update(nuevo).eq('id', editandoId) : await supabase.from('prospectos').insert([nuevo])
      if (res.error) throw res.error
      cerrarModal(); cargarDatos()
    } catch (err) { alert(err.message) }
  }

  const cerrarModal = () => {
    setNuevo({ grupo: '', contacto: '', telefono: '', interes: 'Medio', notas: '', ubicacion: '', fecha: new Date().toISOString().split('T')[0] })
    setEditandoId(null); setShowModal(false)
  }

  return (
    <div className="p-4 bg-slate-50 min-h-screen pb-24 font-sans text-slate-900">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-black tracking-tighter italic text-blue-900">TABORA CRM</h1>
        <button onClick={() => setShowModal(true)} className="bg-blue-600 text-white p-4 rounded-2xl shadow-lg"><Plus/></button>
      </div>

      {/* MINI CALENDARIO INTERACTIVO */}
      <div className="bg-white p-4 rounded-[2rem] shadow-sm mb-6 overflow-x-auto">
        <div className="flex justify-between gap-2">
          {obtenerDiasMes().map(dateStr => {
            const d = new Date(dateStr)
            const esHoy = dateStr === fechaSeleccionada
            const tieneVisita = prospectos.some(p => p.fecha === dateStr)
            return (
              <button 
                key={dateStr}
                onClick={() => {setFechaSeleccionada(dateStr); setBusqueda('')}}
                className={`flex-1 min-w-[45px] py-3 rounded-2xl flex flex-col items-center transition-all ${esHoy ? 'bg-blue-600 text-white shadow-md scale-110' : 'bg-slate-50 text-slate-400'}`}
              >
                <span className="text-[10px] font-bold uppercase">{diasSemana[d.getDay()]}</span>
                <span className="text-sm font-black">{d.getDate()}</span>
                {tieneVisita && !esHoy && <div className="w-1 h-1 bg-orange-500 rounded-full mt-1"></div>}
              </button>
            )
          })}
        </div>
      </div>

      {/* BUSCADOR */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input placeholder="Buscar en todos los registros..." className="w-full bg-white p-4 pl-12 rounded-2xl shadow-sm outline-none" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      <div className="space-y-4">
        <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">
          {busqueda ? 'Resultados de búsqueda' : `Visitas para el ${new Date(fechaSeleccionada).toLocaleDateString()}`}
        </h2>
        {prospectosFiltrados.length === 0 ? (
          <div className="text-center py-10 text-slate-300 italic">No hay visitas programadas.</div>
        ) : prospectosFiltrados.map(p => (
          <div key={p.id} className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100">
             <div className="flex justify-between mb-2">
                <span className={`text-[10px] font-black px-3 py-1 rounded-full ${p.interes === 'Alto' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>{p.interes}</span>
                <button onClick={() => {setEditandoId(p.id); setNuevo(p); setShowModal(true)}} className="text-slate-300"><Edit3 size={18}/></button>
             </div>
             <h3 className="font-bold text-lg leading-tight">{p.grupo}</h3>
             <p className="text-sm text-slate-500 mb-4">{p.contacto}</p>
             <div className="grid grid-cols-2 gap-3">
                <a href={`tel:${p.telefono}`} className="bg-emerald-600 text-white py-3 rounded-xl flex justify-center gap-2 font-bold text-xs items-center"><Phone size={14}/> LLAMAR</a>
                <a href={p.ubicacion} target="_blank" rel="noreferrer" className="bg-blue-600 text-white py-3 rounded-xl flex justify-center gap-2 font-bold text-xs items-center"><Navigation size={14}/> MAPA</a>
             </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl overflow-y-auto max-h-[85vh]">
             <form onSubmit={guardarCambios} className="space-y-4">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-black uppercase italic">{editandoId ? 'Editar' : 'Nueva'} Visita</h2>
                  <button type="button" onClick={cerrarModal} className="bg-slate-100 p-2 rounded-full"><X/></button>
                </div>
                <input type="date" className="w-full p-4 bg-slate-50 rounded-xl font-bold" value={nuevo.fecha} onChange={e => setNuevo({...nuevo, fecha: e.target.value})} />
                <input placeholder="Empresa" required className="w-full p-4 bg-slate-50 rounded-xl font-bold" value={nuevo.grupo} onChange={e => setNuevo({...nuevo, grupo: e.target.value})} />
                <input placeholder="Teléfono" className="w-full p-4 bg-slate-50 rounded-xl" value={nuevo.telefono} onChange={e => setNuevo({...nuevo, telefono: e.target.value})} />
                <textarea placeholder="Notas..." className="w-full p-4 bg-slate-50 rounded-xl h-24" value={nuevo.notas} onChange={e => setNuevo({...nuevo, notas: e.target.value})} />
                <button type="submit" className="w-full bg-blue-900 text-white py-4 rounded-2xl font-black shadow-xl">GUARDAR VISITA</button>
             </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default CRM