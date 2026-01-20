import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Plus, Phone, Trash2, X, Search, Navigation, ChevronLeft, ChevronRight, Edit3, Calendar, UserPlus } from 'lucide-react'

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

  const pasarACliente = async (prospecto) => {
    if (window.confirm(`¿Estás seguro de que quieres convertir a "${prospecto.grupo}" en Cliente oficial?`)) {
      try {
        const { error: errorIns } = await supabase.from('clientes').insert([{
          nombre: prospecto.grupo, contacto: prospecto.contacto, telefono: prospecto.telefono, notas: prospecto.notas
        }])
        if (errorIns) throw errorIns
        await supabase.from('prospectos').delete().eq('id', prospecto.id)
        alert("✅ Movido a Clientes"); cargarDatos()
      } catch (err) { alert("Error: " + err.message) }
    }
  }

  const eliminarVisita = async (id, nombre) => {
    if (window.confirm(`¿Estás seguro de que quieres eliminar la visita de "${nombre}"?`)) {
      const { error } = await supabase.from('prospectos').delete().eq('id', id)
      if (!error) cargarDatos()
    }
  }

  const prospectosFiltrados = prospectos.filter(p => {
    const coincideBusqueda = (p.grupo || "").toLowerCase().includes(busqueda.toLowerCase())
    const coincideFecha = p.fecha === fechaSeleccionada
    return busqueda ? coincideBusqueda : coincideFecha
  })

  const esEnero2026 = currentDate.getMonth() === 0 && currentDate.getFullYear() === 2026

  const renderCalendar = () => {
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay()
    const offset = firstDay === 0 ? 6 : firstDay - 1
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < offset; i++) cells.push(<div key={`e-${i}`} className="h-12"></div>)
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const esSel = dateStr === fechaSeleccionada
      const tieneVisita = prospectos.some(p => p.fecha === dateStr)
      cells.push(
        <button key={day} onClick={() => setFechaSeleccionada(dateStr)}
          className={`h-12 w-full flex flex-col items-center justify-center rounded-2xl relative ${esSel ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-700'}`}>
          <span className="text-sm font-bold">{day}</span>
          {tieneVisita && <div className={`w-1 h-1 rounded-full mt-1 ${esSel ? 'bg-white' : 'bg-orange-500'}`}></div>}
        </button>
      )
    }
    return cells
  }

  const guardarCambios = async (e) => {
    e.preventDefault()
    const res = editandoId ? await supabase.from('prospectos').update(nuevo).eq('id', editandoId) : await supabase.from('prospectos').insert([nuevo])
    if (!res.error) { cerrarModal(); cargarDatos() }
  }

  const cerrarModal = () => {
    setNuevo({ grupo: '', contacto: '', telefono: '', interes: 'Medio', notas: '', ubicacion: '', fecha: new Date().toISOString().split('T')[0] })
    setEditandoId(null); setShowModal(false)
  }

  return (
    <div className="p-4 bg-slate-50 min-h-screen pb-28 font-sans">
      <div className="flex justify-between items-center mb-6 px-2">
        <h1 className="text-3xl font-black italic text-slate-900">TABORA</h1>
        <button onClick={() => setShowModal(true)} className="bg-slate-900 text-white p-4 rounded-3xl shadow-xl"><Plus size={24}/></button>
      </div>

      <div className="bg-white rounded-[2.5rem] p-6 shadow-xl mb-6 border border-white">
        <div className="flex justify-between items-center mb-6 uppercase italic font-black text-slate-800">
          <h2>{currentDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}</h2>
          <div className="flex gap-2 text-slate-400">
            <button onClick={() => !esEnero2026 && setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className={esEnero2026 ? 'opacity-10' : ''}><ChevronLeft/></button>
            <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))}><ChevronRight/></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-slate-300 mb-2 uppercase">
          {['L','M','X','J','V','S','D'].map(d => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">{renderCalendar()}</div>
      </div>

      <div className="relative mb-6 text-slate-400">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2" size={18} />
        <input placeholder="Buscar grupo..." className="w-full bg-white p-5 pl-14 rounded-3xl shadow-sm outline-none font-medium text-slate-900" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      <div className="space-y-4">
        {prospectosFiltrados.map(p => (
          <div key={p.id} className="bg-white p-6 rounded-[2.5rem] shadow-lg border border-slate-50">
             <div className="flex justify-between mb-4">
                <span className="text-[10px] font-black px-3 py-1 rounded-full bg-blue-50 text-blue-600 uppercase italic">{p.interes}</span>
                <div className="flex gap-4 items-center">
                  <button onClick={() => pasarACliente(p)} className="text-emerald-500 font-bold text-[9px] uppercase bg-emerald-50 px-3 py-1.5 rounded-xl flex items-center gap-1"><UserPlus size={14}/> Alta</button>
                  <button onClick={() => {setEditandoId(p.id); setNuevo(p); setShowModal(true)}} className="text-slate-300"><Edit3 size={18}/></button>
                  <button onClick={() => eliminarVisita(p.id, p.grupo)} className="text-slate-200"><Trash2 size={18}/></button>
                </div>
             </div>
             <h3 className="font-bold text-xl mb-1">{p.grupo}</h3>
             <p className="text-sm text-slate-400 mb-6 font-medium leading-tight">{p.contacto || 'Sin contacto'}</p>
             <div className="grid grid-cols-2 gap-3">
                <a href={`tel:${p.telefono}`} className="bg-slate-900 text-white py-4 rounded-2xl flex justify-center gap-2 font-bold text-xs items-center italic uppercase shadow-md"><Phone size={14}/> Llamar</a>
                <a href={p.ubicacion} target="_blank" rel="noreferrer" className="bg-blue-600 text-white py-4 rounded-2xl flex justify-center gap-2 font-bold text-xs items-center italic uppercase shadow-md shadow-blue-100"><Navigation size={14}/> Mapa</a>
             </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xl flex items-end z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-[3.5rem] p-10 shadow-2xl overflow-y-auto max-h-[90vh]">
             <form onSubmit={guardarCambios} className="space-y-4">
                <div className="flex justify-between mb-4 items-center">
                  <h2 className="text-2xl font-black italic uppercase tracking-tighter">{editandoId ? 'Reprogramar' : 'Registrar'}</h2>
                  <button type="button" onClick={cerrarModal} className="bg-slate-100 p-2 rounded-full text-slate-400"><X size={20}/></button>
                </div>
                <input type="date" className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none" value={nuevo.fecha} onChange={e => setNuevo({...nuevo, fecha: e.target.value})} />
                <input placeholder="Nombre del Grupo" required className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none" value={nuevo.grupo} onChange={e => setNuevo({...nuevo, grupo: e.target.value})} />
                <input placeholder="Teléfono" className="w-full p-4 bg-slate-50 rounded-2xl" value={nuevo.telefono} onChange={e => setNuevo({...nuevo, telefono: e.target.value})} />
                <textarea placeholder="Notas..." className="w-full p-4 bg-slate-50 rounded-2xl h-24" value={nuevo.notas} onChange={e => setNuevo({...nuevo, notas: e.target.value})} />
                <button type="submit" className="w-full bg-slate-900 text-white py-5 rounded-3xl font-black shadow-xl uppercase italic">Guardar Visita</button>
             </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default CRM