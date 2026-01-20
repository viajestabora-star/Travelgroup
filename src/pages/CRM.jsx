import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Plus, Phone, Trash2, X, MapPin, Edit3, Navigation, RefreshCw } from 'lucide-react'

// CONFIGURACIÓN VERIFICADA
const SUPABASE_URL = 'https://gtwyqxfkpdwpakmgrkbu.supabase.co'
const SUPABASE_KEY = 'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const CRM = () => {
  const [prospectos, setProspectos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [nuevo, setNuevo] = useState({
    grupo: '', contacto: '', telefono: '', interes: 'Medio', notas: '', ubicacion: '', fecha: new Date().toLocaleDateString()
  })

  const cargarDatos = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('prospectos').select('*').order('id', { ascending: false })
    if (error) console.error("Error lectura:", error.message)
    else setProspectos(data || [])
    setLoading(false)
  }

  useEffect(() => { cargarDatos() }, [])

  const guardarCambios = async (e) => {
    e.preventDefault()
    // Limpieza de datos antes de enviar
    const datosBase = {
      grupo: nuevo.grupo,
      contacto: nuevo.contacto || '',
      telefono: nuevo.telefono.replace(/\s+/g, ''),
      interes: nuevo.interes,
      notas: nuevo.notas || '', 
      ubicacion: nuevo.ubicacion || '',
      fecha: nuevo.fecha
    }

    try {
      let resultado;
      if (editandoId) {
        resultado = await supabase.from('prospectos').update(datosBase).eq('id', editandoId)
      } else {
        resultado = await supabase.from('prospectos').insert([datosBase])
      }
      
      if (resultado.error) {
        // Esto te avisará si Supabase rechaza una columna
        alert("⚠️ Error en Supabase: " + resultado.error.message)
      } else {
        cerrarModal()
        cargarDatos()
      }
    } catch (err) {
      alert("Fallo crítico: " + err.message)
    }
  }

  const obtenerGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const url = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`
        setNuevo({...nuevo, ubicacion: url})
        alert("📍 Ubicación fijada")
      }, () => alert("Error: Activa el GPS del iPhone"))
    }
  }

  const cerrarModal = () => {
    setNuevo({ grupo: '', contacto: '', telefono: '', interes: 'Medio', notas: '', ubicacion: '', fecha: new Date().toLocaleDateString() })
    setEditandoId(null)
    setShowModal(false)
  }

  const eliminar = async (id) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar esta visita?')) {
      const { error } = await supabase.from('prospectos').delete().eq('id', id)
      if (error) alert("Error al eliminar")
      else cargarDatos()
    }
  }

  return (
    <div className="p-4 bg-gray-50 min-h-screen pb-24">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-black text-gray-800 tracking-tighter italic">TABORA CRM</h1>
        <div className="flex gap-2 text-gray-400">
          <button onClick={cargarDatos} className="p-2 active:rotate-180 transition-transform"><RefreshCw size={24}/></button>
          <button onClick={() => setShowModal(true)} className="bg-orange-500 text-white p-4 rounded-2xl shadow-lg"><Plus size={28} /></button>
        </div>
      </div>

      <div className="space-y-4">
        {loading ? <p className="text-center py-20 text-gray-400 animate-pulse">Sincronizando con la nube...</p> : 
          prospectos.map(p => (
          <div key={p.id} className="bg-white p-5 rounded-[2.5rem] shadow-sm border border-gray-100">
            <div className="flex justify-between mb-2">
              <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase ${
                p.interes === 'Alto' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
              }`}>{p.interes}</span>
              <div className="flex gap-4 text-gray-300">
                <button onClick={() => {setEditandoId(p.id); setNuevo(p); setShowModal(true)}} className="text-blue-500"><Edit3 size={18}/></button>
                <button onClick={() => eliminar(p.id)}><Trash2 size={18}/></button>
              </div>
            </div>
            <h3 className="font-bold text-xl leading-none mb-1">{p.grupo}</h3>
            <p className="text-xs text-gray-500 mb-4 font-medium">{p.contacto} • {p.fecha}</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <a href={`tel:${p.telefono}`} className="bg-green-600 text-white py-4 rounded-2xl flex justify-center gap-2 font-bold text-sm items-center shadow-md active:bg-green-700"><Phone size={16}/> LLAMAR</a>
              <a href={p.ubicacion} target="_blank" rel="noreferrer" className="bg-blue-600 text-white py-4 rounded-2xl flex justify-center gap-2 font-bold text-sm items-center shadow-md active:bg-blue-700"><Navigation size={16}/> MAPA</a>
            </div>
            {p.notas && <p className="text-xs text-gray-500 italic bg-gray-50 p-4 rounded-2xl border border-gray-100">"{p.notas}"</p>}
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-8 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-gray-800">{editandoId ? 'Editar' : 'Nueva'} Visita</h2>
              <button onClick={cerrarModal} className="text-gray-400 p-2 bg-gray-100 rounded-full"><X/></button>
            </div>
            <form onSubmit={guardarCambios} className="space-y-4">
              <input placeholder="Nombre Grupo / Empresa" required className="w-full p-5 bg-gray-50 rounded-2xl outline-none font-bold focus:bg-white border-2 border-transparent focus:border-orange-500 transition-all" value={nuevo.grupo} onChange={e => setNuevo({...nuevo, grupo: e.target.value})} />
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Contacto" className="p-5 bg-gray-50 rounded-2xl outline-none" value={nuevo.contacto} onChange={e => setNuevo({...nuevo, contacto: e.target.value})} />
                <input placeholder="Teléfono" className="p-5 bg-gray-50 rounded-2xl outline-none font-bold" value={nuevo.telefono} onChange={e => setNuevo({...nuevo, telefono: e.target.value})} />
              </div>
              <div className="flex gap-3">
                <select className="flex-1 p-5 bg-gray-50 rounded-2xl font-bold outline-none" value={nuevo.interes} onChange={e => setNuevo({...nuevo, interes: e.target.value})}>
                  <option value="Bajo">Bajo</option><option value="Medio">Medio</option><option value="Alto">Alto</option>
                </select>
                <button type="button" onClick={obtenerGPS} className={`flex-1 p-5 rounded-2xl font-bold transition-all ${nuevo.ubicacion ? 'bg-green-500 text-white shadow-lg' : 'bg-gray-200 text-gray-600'}`}>📍 GPS</button>
              </div>
              <textarea placeholder="Notas comerciales..." className="w-full p-5 bg-gray-50 rounded-2xl h-24 outline-none" value={nuevo.notas} onChange={e => setNuevo({...nuevo, notas: e.target.value})} />
              <button type="submit" className="w-full bg-blue-900 text-white py-5 rounded-3xl font-black text-lg shadow-xl active:scale-95 transition-all">GUARDAR EN LA NUBE</button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default CRM