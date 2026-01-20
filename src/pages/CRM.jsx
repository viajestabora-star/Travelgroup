import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Plus, Phone, Trash2, X, Search, Navigation, RefreshCw, ChevronLeft, ChevronRight, Edit3, Calendar } from 'lucide-react'

const SUPABASE_URL = 'https://gtwyqxfkpdwpakmgrkbu.supabase.co'
const SUPABASE_KEY = 'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const CRM = () => {
  const [prospectos, setProspectos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [currentDate, setCurrentDate] = useState(new Date())
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

  const prospectosFiltrados = prospectos.filter(p => {
    const coincideBusqueda = (p.grupo || "").toLowerCase().includes(busqueda.toLowerCase()) || 
                             (p.contacto || "").toLowerCase().includes(busqueda.toLowerCase())
    const coincideFecha = p.fecha === fechaSeleccionada
    return busqueda ? coincideBusqueda : coincideFecha
  })

  const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate()
  const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay()
  const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth())
  const offset = firstDay === 0 ? 6 : firstDay - 1
  const diasLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

  const changeMonth = (dir) => {
    const newDate = new Date(currentDate.setMonth(currentDate.getMonth() + dir))
    setCurrentDate(new Date(newDate))
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

  const renderCalendar = () => {
    const cells = []
    const hoyStr = new Date().toISOString().split('T')[0]
    for (let i = 0; i < offset; i++) cells.push(<div key={`empty-${i}`} className="h-12"></div>)
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const esSel = dateStr === fechaSeleccionada
      const esHoy = dateStr === hoyStr
      const tieneVisita = prospectos.some(p => p.fecha === dateStr)
      
      cells.push(
        <button key={day} onClick={() => {setFechaSeleccionada(dateStr); setBusqueda('')}}
          className={`h-12 w-full flex flex-col items-center justify-center rounded-2xl transition-all relative
          ${esSel ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 scale-105 z-10' : 'hover:bg-slate-50 text-slate-700'}
          ${esHoy && !esSel ? 'border border-blue-200 text-blue-600' : ''}`}>
          <span className={`text-sm ${esSel ? 'font-black' : 'font-medium'}`}>{day}</span>
          {tieneVisita && <div className={`absolute bottom-2 w-1 h-1 rounded-full ${esSel ? 'bg-white' : 'bg-orange-500'}`}></div>}
        </button>
      )
    }
    return cells
  }

  return (
    <div className="p-4 bg-[#F8FAFC] min-h-screen pb-28 font-sans text-slate-900">
      {/* HEADER PREMIUM */}
      <div className="flex justify-between items-center mb-8 px-2">
        <div>
          <h1 className="text-3xl font-[1000] tracking-tight text-slate-900 leading-none">TABORA</h1>
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-[0.2em]">Intelligence CRM</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-slate-900 text-white p-4 rounded-3xl shadow-xl active:scale-90 transition-transform">
          <Plus size={24} strokeWidth={3} />
        </button>
      </div>

      {/* CALENDARIO MODERNO */}
      <div className="bg-white rounded-[2.5rem] p-6 shadow-xl shadow-slate-200/50 mb-8 border border-white">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-black text-slate-800 capitalize italic">
            {currentDate.toLocaleString('es-ES', { month: 'long' })} <span className="text-slate-300 font-light text-sm">{currentDate.getFullYear()}</span>
          </h2>
          <div className="flex gap-1 bg-slate-50 p-1 rounded-2xl">
            <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all"><ChevronLeft size={18}/></button>
            <button onClick={() => changeMonth(1)} className="p-2 hover:bg-white hover:shadow-sm rounded-xl transition-all"><ChevronRight size={18}/></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-3">
          {diasLabels.map(d => <div key={d} className="text-center text-[10px] font-black text-slate-300 uppercase">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">{renderCalendar()}</div>
      </div>

      {/* BUSCADOR GLASS */}
      <div className="relative mb-8 group">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
        <input placeholder="Buscar visitas..." className="w-full bg-white/80 backdrop-blur-md p-5 pl-14 rounded-[2rem] shadow-sm border border-slate-100 outline-none focus:ring-4 focus:ring-blue-500/5 transition-all font-medium" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      {/* LISTA DE VISITAS */}
      <div className="space-y-6">
        <div className="flex items-center justify-between px-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Agenda del día</h3>
            {!busqueda && <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-bold">{fechaSeleccionada}</span>}
        </div>
        
        {prospectosFiltrados.length === 0 ? (
          <div className="bg-white/50 border-2 border-dashed border-slate-200 rounded-[3rem] py-16 flex flex-col items-center justify-center text-slate-400 italic">
            <Calendar size={40} className="mb-2 opacity-20"/>
            <p className="text-sm font-medium">No hay nada planeado</p>
          </div>
        ) : prospectosFiltrados.map(p => (
          <div key={p.id} className="bg-white p-6 rounded-[2.5rem] shadow-lg shadow-slate-100 border border-slate-50 relative overflow-hidden group">
             <div className="absolute top-0 left-0 w-2 h-full bg-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
             <div className="flex justify-between items-start mb-4">
                <span className={`text-[9px] font-black px-4 py-1.5 rounded-full tracking-widest uppercase ${p.interes === 'Alto' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>{p.interes}</span>
                <div className="flex gap-2">
                    <button onClick={() => {setEditandoId(p.id); setNuevo(p); setShowModal(true)}} className="p-2 text-slate-400 hover:text-blue-500"><Edit3 size={18}/></button>
                    <button onClick={() => {if(window.confirm('¿Borrar?')) supabase.from('prospectos').delete().eq('id', p.id).then(cargarDatos)}} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={18}/></button>
                </div>
             </div>
             <h3 className="font-bold text-xl text-slate-800 mb-1">{p.grupo}</h3>
             <p className="text-sm text-slate-500 font-medium mb-6 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-slate-300 rounded-full"></span> {p.contacto || 'Sin contacto'}
             </p>
             <div className="grid grid-cols-2 gap-4">
                <a href={`tel:${p.telefono}`} className="bg-slate-900 text-white py-4 rounded-[1.5rem] flex justify-center gap-2 font-bold text-xs items-center hover:bg-slate-800 transition-colors tracking-widest italic uppercase">
                    <Phone size={14}/> LLAMAR
                </a>
                <a href={p.ubicacion} target="_blank" rel="noreferrer" className="bg-blue-600 text-white py-4 rounded-[1.5rem] flex justify-center gap-2 font-bold text-xs items-center hover:bg-blue-700 transition-colors tracking-widest italic uppercase shadow-lg shadow-blue-100">
                    <Navigation size={14}/> MAPA
                </a>
             </div>
          </div>
        ))}
      </div>

      {/* MODAL REDISEÑADO */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xl flex items-end z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-[3.5rem] p-10 shadow-2xl overflow-y-auto max-h-[90vh]">
             <form onSubmit={guardarCambios} className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-[1000] italic uppercase text-slate-900 tracking-tighter">Nueva Visita</h2>
                  <button type="button" onClick={cerrarModal} className="bg-slate-50 p-3 rounded-full text-slate-400"><X/></button>
                </div>
                <div className="space-y-4">
                    <input type="date" className="w-full p-5 bg-slate-50 rounded-[1.5rem] font-bold border-none outline-none focus:ring-2 focus:ring-blue-500/20 transition-all" value={nuevo.fecha} onChange={e => setNuevo({...nuevo, fecha: e.target.value})} />
                    <input placeholder="Nombre del Grupo" required className="w-full p-5 bg-slate-50 rounded-[1.5rem] font-bold border-none outline-none" value={nuevo.grupo} onChange={e => setNuevo({...nuevo, grupo: e.target.value})} />
                    <input placeholder="Teléfono" className="w-full p-5 bg-slate-50 rounded-[1.5rem] font-bold border-none outline-none" value={nuevo.telefono} onChange={e => setNuevo({...nuevo, telefono: e.target.value})} />
                    <textarea placeholder="Notas estratégicas..." className="w-full p-5 bg-slate-50 rounded-[1.5rem] h-32 border-none outline-none" value={nuevo.notas} onChange={e => setNuevo({...nuevo, notas: e.target.value})} />
                </div>
                <button type="submit" className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black text-sm shadow-2xl uppercase tracking-widest active:scale-95 transition-transform italic">Confirmar en Nube</button>
             </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default CRM