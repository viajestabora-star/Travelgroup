import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Plus, Phone, Trash2, X, Search, Navigation, RefreshCw, Calendar as CalendarIcon, Edit3 } from 'lucide-react'

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

  const prospectosFiltrados = prospectos.filter(p => {
    const coincideBusqueda = (p.grupo || "").toLowerCase().includes(busqueda.toLowerCase()) || 
                             (p.contacto || "").toLowerCase().includes(busqueda.toLowerCase())
    const coincideFecha = p.fecha === fechaSeleccionada
    return busqueda ? coincideBusqueda : coincideFecha
  })

  // Lógica para obtener solo Lunes a Viernes de la semana actual
  const obtenerSemanaLaboral = () => {
    const hoy = new Date()
    const diaSemana = hoy.getDay() // 0 (Dom) a 6 (Sab)
    const diferenciaAlLunes = diaSemana === 0 ? -6 : 1 - diaSemana
    
    const lunes = new Date(hoy)
    lunes.setDate(hoy.getDate() + diferenciaAlLunes)

    return Array.from({length: 5}, (_, i) => {
      const d = new Date(lunes)
      d.setDate(lunes.getDate() + i)
      return d.toISOString().split('T')[0]
    })
  }

  const guardarCambios = async (e) => {
    e.preventDefault()
    const datosParaEnviar = {
      grupo: nuevo.grupo,
      contacto: nuevo.contacto || '',
      telefono: nuevo.telefono || '',
      interes: nuevo.interes,
      notas: nuevo.notas || '',
      ubicacion: nuevo.ubicacion || '',
      fecha: nuevo.fecha
    }

    try {
      const res = editandoId 
        ? await supabase.from('prospectos').update(datosParaEnviar).eq('id', editandoId)
        : await supabase.from('prospectos').insert([datosParaEnviar])
      
      if (res.error) throw res.error
      cerrarModal()
      await cargarDatos() 
    } catch (err) { alert("Error: " + err.message) }
  }

  const cerrarModal = () => {
    setNuevo({ grupo: '', contacto: '', telefono: '', interes: 'Medio', notas: '', ubicacion: '', fecha: new Date().toISOString().split('T')[0] })
    setEditandoId(null); setShowModal(false)
  }

  const eliminar = async (id, nombre) => {
    if (window.confirm(`¿Seguro que quieres borrar a "${nombre}"?`)) {
      await supabase.from('prospectos').delete().eq('id', id)
      cargarDatos()
    }
  }

  return (
    <div className="p-4 bg-slate-50 min-h-screen pb-24 font-sans text-slate-900">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-black tracking-tighter italic text-blue-900 leading-none">TABORA CRM</h1>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Semana Laboral</span>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-blue-600 text-white p-4 rounded-2xl shadow-lg active:scale-95"><Plus size={24} /></button>
      </div>

      {/* CALENDARIO L-V */}
      <div className="bg-white p-3 rounded-[2rem] shadow-sm mb-6 flex justify-between gap-1 border border-slate-100">
        {obtenerSemanaLaboral().map(dateStr => {
          const d = new Date(dateStr)
          const esSeleccionado = dateStr === fechaSeleccionada
          const tieneVisita = prospectos.some(p => p.fecha === dateStr)
          return (
            <button key={dateStr} onClick={() => {setFechaSeleccionada(dateStr); setBusqueda('')}}
              className={`flex-1 py-3 rounded-2xl flex flex-col items-center transition-all ${esSeleccionado ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-50 text-slate-400'}`}>
              <span className="text-[10px] font-bold uppercase">{['D','L','M','X','J','V','S'][d.getDay()]}</span>
              <span className="text-sm font-black">{d.getDate()}</span>
              {tieneVisita && !esSeleccionado && <div className="w-1.5 h-1.5 bg-orange-500 rounded-full mt-1"></div>}
            </button>
          )
        })}
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input placeholder="Buscar grupo o contacto..." className="w-full bg-white p-4 pl-12 rounded-2xl shadow-sm outline-none border-none font-medium" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      <div className="space-y-4">
        {prospectosFiltrados.length === 0 ? (
          <div className="text-center py-10 text-slate-300 italic border-2 border-dashed border-slate-200 rounded-[2rem]">No hay visitas para este día.</div>
        ) : prospectosFiltrados.map(p => (
          <div key={p.id} className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100">
             <div className="flex justify-between mb-2 items-center">
                <span className={`text-[10px] font-black px-3 py-1 rounded-full ${p.interes === 'Alto' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>{p.interes}</span>
                <div className="flex gap-4">
                  <button onClick={() => {setEditandoId(p.id); setNuevo(p); setShowModal(true)}} className="text-blue-500"><Edit3 size={18}/></button>
                  <button onClick={() => eliminar(p.id, p.grupo)} className="text-slate-200 hover:text-red-500"><Trash2 size={18}/></button>
                </div>
             </div>
             <h3 className="font-bold text-lg leading-tight">{p.grupo}</h3>
             <p className="text-sm text-slate-400 mb-4">{p.contacto || 'Sin contacto'}</p>
             <div className="grid grid-cols-2 gap-3">
                <a href={`tel:${p.telefono}`} className="bg-emerald-600 text-white py-3 rounded-xl flex justify-center gap-2 font-bold text-xs items-center shadow-md"><Phone size={14}/> LLAMAR</a>
                <a href={p.ubicacion} target="_blank" rel="noreferrer" className="bg-blue-600 text-white py-3 rounded-xl flex justify-center gap-2 font-bold text-xs items-center shadow-md"><Navigation size={14}/> MAPA</a>
             </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl overflow-y-auto max-h-[85vh]">
             <form onSubmit={guardarCambios} className="space-y-4">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-black uppercase italic italic">{editandoId ? 'Editar' : 'Nuevo'} Grupo</h2>
                  <button type="button" onClick={cerrarModal} className="bg-slate-100 p-2 rounded-full"><X/></button>
                </div>
                <input type="date" className="w-full p-4 bg-slate-50 rounded-xl font-bold border-none" value={nuevo.fecha} onChange={e => setNuevo({...nuevo, fecha: e.target.value})} />
                <input placeholder="Nombre del Grupo" required className="w-full p-4 bg-slate-50 rounded-xl font-bold border-none" value={nuevo.grupo} onChange={e => setNuevo({...nuevo, grupo: e.target.value})} />
                <input placeholder="Teléfono" className="w-full p-4 bg-slate-50 rounded-xl border-none" value={nuevo.telefono} onChange={e => setNuevo({...nuevo, telefono: e.target.value})} />
                <textarea placeholder="Notas..." className="w-full p-4 bg-slate-50 rounded-xl h-24 border-none" value={nuevo.notas} onChange={e => setNuevo({...nuevo, notas: e.target.value})} />
                <button type="submit" className="w-full bg-blue-900 text-white py-4 rounded-2xl font-black shadow-xl uppercase">Guardar en CRM</button>
             </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default CRM