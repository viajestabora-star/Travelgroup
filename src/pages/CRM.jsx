import React, { useState, useEffect } from 'react'
import { Plus, Phone, Trash2, X, MapPin, Edit3, Navigation } from 'lucide-react'

const CRM = () => {
  const [prospectos, setProspectos] = useState(() => {
    const saved = localStorage.getItem('tabora_crm_prospectos')
    return saved ? JSON.parse(saved) : []
  })
  
  const [showModal, setShowModal] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [nuevo, setNuevo] = useState({
    grupo: '', contacto: '', telefono: '', interes: 'Medio', notas: '', ubicacion: '', fechaVisita: new Date().toLocaleDateString()
  })

  useEffect(() => {
    localStorage.setItem('tabora_crm_prospectos', JSON.stringify(prospectos))
  }, [prospectos])

  const abrirEditor = (p) => {
    setEditandoId(p.id)
    setNuevo(p)
    setShowModal(true)
  }

  const obtenerGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        // Formato universal que abre la App de Google Maps o pregunta por Waze
        const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
        setNuevo({...nuevo, ubicacion: url})
        alert("📍 Ubicación fijada para Google Maps / Waze");
      }, () => alert("Error: Activa el GPS de tu móvil"));
    }
  };

  const guardarCambios = (e) => {
    e.preventDefault()
    if (editandoId) {
      setProspectos(prospectos.map(p => p.id === editandoId ? { ...nuevo } : p))
    } else {
      setProspectos([{ ...nuevo, id: Date.now() }, ...prospectos])
    }
    cerrarModal()
  }

  const cerrarModal = () => {
    setNuevo({ grupo: '', contacto: '', telefono: '', interes: 'Medio', notas: '', ubicacion: '', fechaVisita: new Date().toLocaleDateString() })
    setEditandoId(null)
    setShowModal(false)
  }

  const eliminarProspecto = (id, e) => {
    e.stopPropagation()
    if (window.confirm('¿Eliminar esta visita comercial?')) {
      setProspectos(prospectos.filter(p => p.id !== id))
    }
  }

  return (
    <div className="p-4 bg-gray-50 min-h-screen pb-24">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold text-gray-800">CRM - Captación</h1>
        {/* Botón Naranja Forzado */}
        <button 
          onClick={() => setShowModal(true)}
          className="text-white p-4 rounded-full shadow-xl active:scale-95 transition-transform"
          style={{ backgroundColor: '#f97316' }} 
        >
          <Plus size={28} />
        </button>
      </div>

      <div className="space-y-4">
        {prospectos.length === 0 && (
          <div className="text-center py-20 text-gray-400 italic">No hay visitas registradas hoy.</div>
        )}
        {prospectos.map(p => (
          <div key={p.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 relative">
            <div className="flex justify-between items-start mb-2">
              <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${
                p.interes === 'Alto' ? 'bg-red-100 text-red-600' : 
                p.interes === 'Medio' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
              }`}>
                {p.interes === 'Alto' ? '🔥 Alto' : p.interes === 'Medio' ? '⚡ Medio' : '🧊 Bajo'}
              </span>
              <div className="flex gap-3">
                <button onClick={() => abrirEditor(p)} className="text-blue-500 p-1"><Edit3 size={18} /></button>
                <button onClick={(e) => eliminarProspecto(p.id, e)} className="text-gray-300 p-1"><Trash2 size={18} /></button>
              </div>
            </div>
            
            <h3 className="font-bold text-lg text-gray-900 leading-tight">{p.grupo}</h3>
            <p className="text-sm text-gray-600 mb-3">{p.contacto} • {p.fechaVisita}</p>
            
            <div className="grid grid-cols-2 gap-2 mb-3">
              <a href={`tel:${p.telefono}`} className="bg-green-50 text-green-700 py-3 rounded-xl flex justify-center items-center gap-2 font-bold text-xs border border-green-200">
                <Phone size={14} /> Llamar
              </a>
              {p.ubicacion ? (
                <a 
                  href={p.ubicacion} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="bg-blue-600 text-white py-3 rounded-xl flex justify-center items-center gap-2 font-bold text-xs shadow-md active:bg-blue-700"
                >
                  <Navigation size={14} /> Ir con GPS
                </a>
              ) : (
                <button disabled className="bg-gray-100 text-gray-400 py-3 rounded-xl flex justify-center items-center gap-2 font-bold text-xs border border-gray-200">
                  <MapPin size={14} /> Sin GPS
                </button>
              )}
            </div>

            <div className="bg-gray-50 p-3 rounded-lg text-xs text-gray-500 italic">
              "{p.notas || 'Sin notas adicionales'}"
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-t-3xl p-6 shadow-2xl animate-in slide-in-from-bottom max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800">{editandoId ? 'Editar Visita' : 'Nueva Visita'}</h2>
              <button onClick={cerrarModal} className="p-2 text-gray-400"><X size={24} /></button>
            </div>
            
            <form onSubmit={guardarCambios} className="space-y-4">
              <input 
                placeholder="Nombre del Grupo" 
                required 
                className="w-full p-4 bg-gray-100 rounded-2xl outline-none border-2 border-transparent focus:border-orange-500"
                value={nuevo.grupo}
                onChange={e => setNuevo({...nuevo, grupo: e.target.value})}
              />
              <div className="flex gap-2">
                <input 
                  placeholder="Contacto" 
                  className="flex-1 p-4 bg-gray-100 rounded-2xl outline-none"
                  value={nuevo.contacto}
                  onChange={e => setNuevo({...nuevo, contacto: e.target.value})}
                />
                <input 
                  placeholder="Móvil" 
                  type="tel"
                  className="flex-1 p-4 bg-gray-100 rounded-2xl outline-none"
                  value={nuevo.telefono}
                  onChange={e => setNuevo({...nuevo, telefono: e.target.value})}
                />
              </div>
              
              <div className="flex gap-2">
                <select 
                  className="flex-1 p-4 bg-gray-100 rounded-2xl outline-none appearance-none font-bold"
                  value={nuevo.interes}
                  onChange={e => setNuevo({...nuevo, interes: e.target.value})}
                >
                  <option value="Bajo">🧊 Bajo</option>
                  <option value="Medio">⚡ Medio</option>
                  <option value="Alto">🔥 Alto</option>
                </select>
                <button 
                  type="button" 
                  onClick={obtenerGPS}
                  className={`flex-1 p-4 rounded-2xl font-bold flex items-center justify-center gap-2 border transition-all ${nuevo.ubicacion ? 'bg-green-500 text-white border-green-600' : 'bg-gray-200 text-gray-700 border-gray-300'}`}
                >
                  <MapPin size={20} /> {nuevo.ubicacion ? 'GPS OK' : 'Captar GPS'}
                </button>
              </div>

              <textarea 
                placeholder="Notas de la visita..." 
                className="w-full p-4 bg-gray-100 rounded-2xl outline-none h-28"
                value={nuevo.notas}
                onChange={e => setNuevo({...nuevo, notas: e.target.value})}
              ></textarea>

              <button type="submit" className="w-full bg-blue-900 text-white py-4 rounded-2xl font-bold shadow-lg active:bg-blue-950">
                {editandoId ? 'Guardar Cambios' : 'Registrar Visita'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default CRM