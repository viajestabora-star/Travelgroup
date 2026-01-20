import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Plus, Phone, Trash2, X, Search, Navigation, ChevronLeft, ChevronRight, Edit3, UserPlus, Clock, Calendar as CalendarIcon, History } from 'lucide-react'

const SUPABASE_URL = 'https://gtwyqxfkpdwpakmgrkbu.supabase.co'
const SUPABASE_KEY = 'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const CRM = () => {
  const [prospectos, setProspectos] = useState([])
  const [activeTab, setActiveTab] = useState('agenda') // 'agenda' o 'historial'
  const [showModal, setShowModal] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date().toISOString().split('T')[0])
  const [nuevo, setNuevo] = useState({
    grupo: '', contacto: '', telefono: '', interes: 'Medio', notas: '', ubicacion: '', fecha: new Date().toISOString().split('T')[0]
  })

  const cargarDatos = async () => {
    const { data } = await supabase.from('prospectos').select('*').order('fecha', { ascending: false })
    if (data) setProspectos(data)
  }

  useEffect(() => { cargarDatos() }, [])

  const hoyStr = new Date().toISOString().split('T')[0]

  // Lógica de filtrado por pestañas
  const visitasAgenda = prospectos.filter(p => p.fecha === fechaSeleccionada)
  const visitasHistorial = prospectos.filter(p => p.fecha < hoyStr)
  
  const datosMostrar = busqueda 
    ? prospectos.filter(p => p.grupo.toLowerCase().includes(busqueda.toLowerCase()))
    : (activeTab === 'agenda' ? visitasAgenda : visitasHistorial)

  const esEnero2026 = currentDate.getMonth() === 0 && currentDate.getFullYear() === 2026

  const renderCalendar = () => {
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay()
    const offset = firstDay === 0 ? 6 : firstDay - 1
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < offset; i++) cells.push(<div key={`e-${i}`} className="h-10"></div>)
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const esSel = dateStr === fechaSeleccionada
      const tieneVisita = prospectos.some(p => p.fecha === dateStr)
      cells.push(
        <button key={day} onClick={() => {setFechaSeleccionada(dateStr); setBusqueda(''); setActiveTab('agenda')}}
          className={`h-11 w-full flex flex-col items-center justify-center rounded-2xl relative transition-all ${esSel ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-700'}`}>
          <span className="text-sm font-bold">{day}</span>
          {tieneVisita && <div className={`w-1 h-1 rounded-full mt-0.5 ${esSel ? 'bg-white' : 'bg-orange-500'}`}></div>}
        </button>
      )
    }
    return cells
  }

  const cerrarModal = () => {
    setNuevo({ grupo: '', contacto: '', telefono: '', interes: 'Medio', notas: '', ubicacion: '', fecha: new Date().toISOString().split('T')[0] })
    setEditandoId(null); setShowModal(false)
  }

  return (
    <div className="p-4 bg-[#F8FAFC] min-h-screen pb-32 font-sans text-slate-900">
      <div className="flex justify-between items-center mb-6 px-2">
        <h1 className="text-3xl font-[1000] italic tracking-tighter">TABORA</h1>
        <button onClick={() => setShowModal(true)} className="bg-slate-900 text-white p-4 rounded-[1.8rem] shadow-xl active:scale-90 transition-all"><Plus/></button>
      </div>

      {/* SELECTOR DE PESTAÑAS */}
      <div className="flex bg-slate-200/50 p-1 rounded-2xl mb-6">
        <button onClick={() => {setActiveTab('agenda'); setBusqueda('')}} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all ${activeTab === 'agenda' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>
          <CalendarIcon size={14}/> AGENDA
        </button>
        <button onClick={() => {setActiveTab('historial'); setBusqueda('')}} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all ${activeTab === 'historial' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>
          <History size={14}/> HISTORIAL
        </button>
      </div>

      {/* VISTA AGENDA: CALENDARIO */}
      {activeTab === 'agenda' && !busqueda && (
        <div className="bg-white rounded-[2.5rem] p-6 shadow-xl mb-8 border border-white">
          <div className="flex justify-between items-center mb-6 font-black text-slate-800 italic uppercase">
            <h2 className="text-sm">{currentDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}</h2>
            <div className="flex gap-4 text-slate-400">
              <button onClick={() => !esEnero2026 && setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className={esEnero2026 ? 'opacity-10' : ''}><ChevronLeft/></button>
              <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))}><ChevronRight/></button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-black text-slate-300 mb-3 uppercase">{['L','M','X','J','V','S','D'].map(d => <div key={d}>{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">{renderCalendar()}</div>
        </div>
      )}

      {/* BUSCADOR */}
      <div className="relative mb-6">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
        <input placeholder="Buscar grupo..." className="w-full bg-white p-5 pl-14 rounded-[2rem] shadow-sm outline-none font-medium" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      {/* LISTADO RESULTADOS */}
      <div className="space-y-4">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 italic">
          {busqueda ? 'Resultados de búsqueda' : (activeTab === 'agenda' ? `Visitas para el ${fechaSeleccionada}` : 'Archivo de visitas hechas')}
        </h3>
        
        {datosMostrar.length === 0 ? (
          <div className="text-center py-20 text-slate-300 italic">No hay registros que mostrar</div>
        ) : datosMostrar.map(p => (
          <VisitaCard key={p.id} p={p} 
            onEdit={() => {setEditandoId(p.id); setNuevo(p); setShowModal(true)}} 
            onDelete={async () => { if(window.confirm(`¿Borrar visita de ${p.grupo}?`)) { await supabase.from('prospectos').delete().eq('id', p.id); cargarDatos() } }}
            onPass={async () => { if(window.confirm(`¿Pasar ${p.grupo} a Clientes?`)) { await supabase.from('clientes').insert([{nombre: p.grupo, telefono: p.telefono, contacto: p.contacto}]); await supabase.from('prospectos').delete().eq('id', p.id); cargarDatos() } }}
          />
        ))}
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xl flex items-end z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-[3.5rem] p-10 shadow-2xl overflow-y-auto max-h-[90vh]">
             <form onSubmit={async (e) => {
               e.preventDefault()
               const res = editandoId ? await supabase.from('prospectos').update(nuevo).eq('id', editandoId) : await supabase.from('prospectos').insert([nuevo])
               if (!res.error) { cerrarModal(); cargarDatos() }
             }} className="space-y-4">
                <div className="flex justify-between items-center mb-4"><h2 className="text-2xl font-black italic uppercase tracking-tighter">Visita</h2><button type="button" onClick={cerrarModal} className="text-slate-300"><X/></button></div>
                <input type="date" className="w-full p-5 bg-slate-50 rounded-[1.5rem] font-bold" value={nuevo.fecha} onChange={e => setNuevo({...nuevo, fecha: e.target.value})} />
                <input placeholder="Grupo" required className="w-full p-5 bg-slate-50 rounded-[1.5rem] font-bold" value={nuevo.grupo} onChange={e => setNuevo({...nuevo, grupo: e.target.value})} />
                <textarea placeholder="Notas comerciales..." className="w-full p-5 bg-slate-50 rounded-[1.5rem] h-28" value={nuevo.notas} onChange={e => setNuevo({...nuevo, notas: e.target.value})} />
                <button type="submit" className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black uppercase italic tracking-widest shadow-xl">Guardar</button>
             </form>
          </div>
        </div>
      )}
    </div>
  )
}

const VisitaCard = ({ p, onEdit, onDelete, onPass }) => (
  <div className="bg-white p-6 rounded-[2.5rem] shadow-lg border border-slate-50 group">
    <div className="flex justify-between mb-4">
      <span className={`text-[9px] font-black px-4 py-1.5 rounded-full uppercase ${p.interes === 'Alto' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>{p.fecha}</span>
      <div className="flex gap-4">
        <button onClick={onEdit} className="text-slate-300"><Edit3 size={18}/></button>
        <button onClick={onDelete} className="text-slate-100 hover:text-red-500"><Trash2 size={18}/></button>
      </div>
    </div>
    <h3 className="font-bold text-xl text-slate-800 mb-1">{p.grupo}</h3>
    <p className="text-sm text-slate-400 mb-6 font-medium leading-tight">{p.notas || 'Sin notas'}</p>
    <div className="grid grid-cols-2 gap-4">
      <a href={`tel:${p.telefono}`} className="bg-slate-900 text-white py-4 rounded-2xl flex justify-center gap-2 font-black text-[10px] items-center italic uppercase tracking-widest"><Phone size={14}/> LLAMAR</a>
      <button onClick={onPass} className="bg-blue-600 text-white py-4 rounded-2xl flex justify-center gap-2 font-black text-[10px] items-center italic uppercase shadow-lg shadow-blue-100"><UserPlus size={14}/> CLIENTE</button>
    </div>
  </div>
)

export default CRM