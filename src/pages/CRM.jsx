import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Plus, Phone, Trash2, X, Search, Navigation, RefreshCw, ChevronLeft, ChevronRight, Edit3 } from 'lucide-react'

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

  // Lógica de Calendario Mensual
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate()
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay()
  const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth())
  
  // Ajuste para que la semana empiece en Lunes (0=Dom, 1=Lun...)
  const offset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1
  const diasLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

  const renderCalendar = () => {
    const cells = []
    for (let i = 0; i < offset; i++) cells.push(<div key={`empty-${i}`} className="h-10"></div>)
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const esSeleccionado = dateStr === fechaSeleccionada
      const tieneVisita = prospectos.some(p => p.fecha === dateStr)
      
      cells.push(
        <button 
          key={day} 
          onClick={() => {setFechaSeleccionada(dateStr); setBusqueda('')}}
          className={`h-10 w-full flex flex-col items-center justify-center rounded-xl transition-all relative ${esSeleccionado ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-100 text-slate-700'}`}
        >
          <span className="text-sm">{day}</span>
          {tieneVisita && !esSeleccionado && <div className="absolute bottom-1 w-1 h-1 bg-orange-500 rounded-full"></div>}
        </button>
      )
    }
    return cells
  }

  const changeMonth = (dir) => {
    const newDate = new Date(currentDate.setMonth(currentDate.getMonth() + dir))
    setCurrentDate(new Date(newDate))
  }

  const guardarCambios = async (e) => {
    e.preventDefault()
    try {
      const res = editandoId 
        ? await supabase.from('prospectos').update(nuevo).eq('id', editandoId)
        : await supabase.from('prospectos').insert([nuevo])
      if (res.error) throw res.error
      cerrarModal(); await cargarDatos()
    } catch (err) { alert(err.message) }
  }

  const cerrarModal = () => {
    setNuevo({ grupo: '', contacto: '', telefono: '', interes: 'Medio', notas: '', ubicacion: '', fecha: new Date().toISOString().split('T')[0] })
    setEditandoId(null); setShowModal(false)
  }

  return (
    <div className="p-4 bg-slate-50 min-h-screen pb-24 font-sans text-slate-900">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-black italic text-blue-900 uppercase leading-none">Tabora CRM</h1>
        <button onClick={() => setShowModal(true)} className="bg-blue-600 text-white p-4 rounded-2xl shadow-lg"><Plus size={24}/></button>
      </div>

      {/* CALENDARIO MENSUAL */}
      <div className="bg-white p-5 rounded-[2.5rem] shadow-sm mb-6 border border-slate-100">
        <div className="flex justify-between items-center mb-4 px-2">
          <h2 className="font-black text-slate-800 uppercase tracking-tighter">
            {currentDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}
          </h2>
          <div className="flex gap-2">
            <button onClick={() => changeMonth(-1)} className="p-2 bg-slate-50 rounded-full"><ChevronLeft size={18}/></button>
            <button onClick={() => changeMonth(1)} className="p-2 bg-slate-50 rounded-full"><ChevronRight size={18}/></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {diasLabels.map(d => <div key={d} className="text-center text-[10px] font-black text-slate-300">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {renderCalendar()}
        </div>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input placeholder="Buscar grupo o contacto..." className="w-full bg-white p-4 pl-12 rounded-2xl shadow-sm outline-none border-none font-medium" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      <div className="space-y-4">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Agenda del {new Date(fechaSeleccionada).toLocaleDateString()}</h3>
        {prospectosFiltrados.length === 0 ? (
          <div className="text-center py-10 text-slate-300 italic border-2 border-dashed border-slate-200 rounded-[2.5rem]">Sin visitas programadas</div>
        ) : prospectosFiltrados.map(p => (
          <div key={p.id} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
             <div className="flex justify-between items-start mb-3">
                <span className={`text-[10px] font-black px-3 py-1 rounded-full ${p.interes === 'Alto' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>{p.interes}</span>
                <button onClick={() => {setEditandoId(p.id); setNuevo(p); setShowModal(true)}} className="text-blue-500"><Edit3 size={18}/></button>
             </div>
             <h3 className="font-bold text-lg leading-tight">{p.grupo}</h3>
             <p className="text-sm text-slate-400 mb-4">{p.contacto || 'Sin contacto'}</p>
             <div className="grid grid-cols-2 gap-3">
                <a href={`tel:${p.telefono}`} className="bg-emerald-600 text-white py-3 rounded-xl flex justify-center gap-2 font-bold text-xs shadow-md"><Phone size={14}/> LLAMAR</a>
                <a href={p.ubicacion} target="_blank" rel="noreferrer" className="bg-blue-600 text-white py-3 rounded-xl flex justify-center gap-2 font-bold text-xs shadow-md"><Navigation size={14}/> MAPA</a>
             </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-8 shadow-2xl overflow-y-auto max-h-[85vh]">
             <form onSubmit={guardarCambios} className="space-y-4">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-black uppercase italic">Nueva Visita</h2>
                  <button type="button" onClick={cerrarModal} className="bg-slate-100 p-2 rounded-full"><X/></button>
                </div>
                <input type="date" className="w-full p-4 bg-slate-50 rounded-xl font-bold" value={nuevo.fecha} onChange={e => setNuevo({...nuevo, fecha: e.target.value})} />
                <input placeholder="Nombre del Grupo" required className="w-full p-4 bg-slate-50 rounded-xl font-bold" value={nuevo.grupo} onChange={e => setNuevo({...nuevo, grupo: e.target.value})} />
                <textarea placeholder="Notas..." className="w-full p-4 bg-slate-50 rounded-xl h-24" value={nuevo.notas} onChange={e => setNuevo({...nuevo, notas: e.target.value})} />
                <button type="submit" className="w-full bg-blue-900 text-white py-4 rounded-2xl font-black shadow-xl uppercase">Guardar en CRM</button>
             </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default CRM