import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Plus, Phone, Trash2, X, MapPin, Edit3, Navigation, RefreshCw } from 'lucide-react'

// CONFIGURACIÓN SUPABASE - VERIFICADA
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

  // Carga de datos desde la nube
  const cargarDatos = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('prospectos')
        .select('*')
        .order('id', { ascending: false })
      
      if (error) throw error
      setProspectos(data || [])
    } catch (err) {
      console.error("Error cargando datos:", err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarDatos()
  }, [])

  const abrirEditor = (p) => {
    setEditandoId(p.id)
    setNuevo(p)
    setShowModal(true)
  }

  const obtenerGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        // CORRECCIÓN: Sintaxis de variables corregida para que funcione el mapa
        const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
        setNuevo({...nuevo, ubicacion: url})
        alert("📍 Ubicación fijada correctamente");
      }, () => alert("Error: Activa el GPS de tu móvil"));
    }
  };

  const guardarCambios = async (e) => {
    e.preventDefault()
    try {
      const telefonoLimpio = nuevo.telefono.replace(/\s+/g, '')
      const datosBase = {
        grupo: nuevo.grupo,
        contacto: nuevo.contacto,
        telefono: telefonoLimpio,
        interes: nuevo.interes,
        notes: nuevo.notas, // Asegúrate de que en Supabase se llame 'notas' o 'notes'
        ubicacion: nuevo.ubicacion,
        fecha: nuevo.fecha
      }

      let error;
      if (editandoId) {
        const res = await supabase.from('prospectos').update(datosBase).eq('id', editandoId)
        error = res.error
      } else {
        const res = await supabase.from('prospectos').insert([datosBase])
        error = res.error
      }
      
      if (error) throw error

      cerrarModal()
      await cargarDatos()
    } catch (err) {
      alert("❌ Error al guardar en Supabase: " + err.message)
    }
  }

  const cerrarModal = () => {
    setNuevo({ grupo: '', contacto: '', telefono: '', interes: 'Medio', notas: '', ubicacion: '', fecha: new Date().toLocaleDateString() })
    setEditandoId(null)
    setShowModal(false)
  }

  const eliminarProspecto = async (id, e) => {
    e.stopPropagation()
    if (window.confirm('¿Eliminar esta visita de la nube?')) {
      const { error } = await supabase.from('prospectos').delete().eq('id', id)
      if (!error) cargarDatos()
      else alert("Error al eliminar: " + error.message)
    }
  }

  return (
    <div className="p-4 bg-gray-50 min-h-screen pb-24 font-sans">
      <div className="flex justify-between items-center mb-6">
        <div>
            <h1 className="text-2xl font-black text-gray-900">TABORA CRM</h1>
            <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Nube Sincronizada</p>
        </div>
        <div className="flex gap-2">
            <button onClick={cargarDatos} className="p-3 text-gray-400 active:rotate-180 transition-transform">
                <RefreshCw size={24}/>
            </button>
            <button 
                onClick={() => setShowModal(true)}
                className="text-white p-4 rounded-2xl shadow-lg active:scale-95 transition-all"
                style={{ backgroundColor: '#f97316' }} 
            >
                <Plus size={28} />
            </button>
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
            <div className="text-center py-20 text-gray-400 animate-pulse font-medium">Conectando...</div>
        ) : prospectos.length === 0 ? (
            <div className="text-center py-20 text-gray-400 italic bg-white rounded-3xl border border-dashed border-gray-200">
                No hay visitas registradas.
            </div>
        ) : prospectos.map(p => (
          <div key={p.id} className="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-100 relative">
            <div className="flex justify-between items-start mb-3">
              <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase ${
                p.interes === 'Alto' ? 'bg-red-100 text-red-600' : 
                p.interes === 'Medio' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
              }`}>
                {p.interes}
              </span>
              <div className="flex gap-4">
                <button onClick={() => abrirEditor(p)} className="text-blue-500"><Edit3 size={20} /></button>
                <button onClick={(e) => eliminarProspecto(p.id, e)} className="text-gray-300"><Trash2 size={20} /></button>
              </div>
            </div>
            
            <h3 className="font-bold text-xl text-gray-900 mb-1 leading-tight">{p.grupo}</h3>
            <p className="text-sm text-gray-500 mb-4 font-medium">{p.contacto} • {p.fecha}</p>
            
            <div className="grid grid-cols-2 gap-3 mb-4">
              <a href={`tel:${p.telefono}`} className="bg-green-600 text-white py-4 rounded-2xl flex justify-center items-center gap-2 font-bold text-sm shadow-md active:bg-green-700">
                <Phone size={18} /> LLAMAR
              </a>
              {p.ubicacion ? (
                <a href={p.ubicacion} target="_blank" rel="noopener noreferrer" className="bg-blue-600 text-white py-4 rounded-2xl flex justify-center items-center gap-2 font-bold text-sm shadow-md active:bg-blue-700">
                  <Navigation size={18} /> MAPA
                </a>
              ) : (
                <button onClick={() => abrirEditor(p)} className="bg-gray-100 text-gray-400 py-4 rounded-2xl flex justify-center items-center gap-2 font-bold text-sm">
                  <MapPin size={18} /> SIN GPS
                </button>
              )}
            </div>

            {p.notas && (
                <div className="bg-gray-50 p-4 rounded-2xl text-xs text-gray-600 leading-relaxed border border-gray-100">
                    {p.notas}
                </div>
            )}
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-t-[2.5rem] p-8 shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-gray-800">{editandoId ? 'Editar' : 'Nueva'} Visita</h2>
              <button onClick={cerrarModal} className="bg-gray-100 p-2 rounded-full text-gray-400"><X size={24} /></button>
            </div>
            
            <form onSubmit={guardarCambios} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 ml-2 uppercase">Cliente / Grupo</label>
                <input required className="w-full p-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-orange-500 outline-none font-bold" value={nuevo.grupo} onChange={e => setNuevo({...nuevo, grupo: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 ml-2 uppercase">Contacto</label>
                    <input className="w-full p-4 bg-gray-50 rounded-2xl outline-none font-semibold" value={nuevo.contacto} onChange={e => setNuevo({...nuevo, contacto: e.target.value})} />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 ml-2 uppercase">Móvil</label>
                    <input type="tel" className="w-full p-4 bg-gray-100 rounded-2xl outline-none font-bold" value={nuevo.telefono} onChange={e => setNuevo({...nuevo, telefono: e.target.value})} />
                </div>
              </div>
              
              <div className="flex gap-3">
                <select className="flex-1 p-4 bg-gray-50 rounded-2xl font-bold outline-none" value={nuevo.interes} onChange={e => setNuevo({...nuevo, interes: e.target.value})}>
                  <option value="Bajo">🧊 BAJO</option>
                  <option value="Medio">⚡ MEDIO</option>
                  <option value="Alto">🔥 ALTO</option>
                </select>
                <button type="button" onClick={obtenerGPS} className={`flex-1 p-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all ${nuevo.ubicacion ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                  <MapPin size={20} /> {nuevo.ubicacion ? 'GPS OK' : 'GPS'}
                </button>
              </div>

              <textarea placeholder="Notas de la visita..." className="w-full p-4 bg-gray-50 rounded-2xl h-28 outline-none border-2 border-transparent focus:border-blue-500 transition-all text-sm" value={nuevo.notas} onChange={e => setNuevo({...nuevo, notas: e.target.value})} />

              <button type="submit" className="w-full bg-blue-900 text-white py-5 rounded-[1.5rem] font-black text-lg shadow-xl active:scale-95 transition-all uppercase tracking-tight">
                {editandoId ? 'Actualizar Registro' : 'Guardar en la Nube'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default CRM