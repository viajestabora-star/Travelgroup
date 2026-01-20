import React, { useState, useEffect } from 'react'
import { Plus, Phone, UserPlus, Trash2, X, MapPin, Edit3, ExternalLink } from 'lucide-react'

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
        const url = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`
        setNuevo({...nuevo, ubicacion: url})
        alert("📍 Ubicación capturada correctamente")
      }, () => alert("Error: Activa el GPS de tu móvil"))
    }
  }

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
    <div className="p-4 bg-gray-50 min-h-screen pb-20">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold text-gray-800">CRM - Captación</h1>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-orange-500 text-white p-3 rounded-full shadow-lg active:scale-95"
        >
          <Plus size={24} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {prospectos.length === 0 && (
          <div className="text-center py-20 text-gray-400 italic">No hay visitas registradas hoy.</div>
        )}
        {prospectos.map(p => (
          <div key={p.id} onClick={() => abrirEditor(p)} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 relative active:bg-gray-50 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${
                p.interes === 'Alto' ? 'bg-red-100 text-red-600' : 
                p.interes === 'Medio' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
              }`}>
                {p.interes === 'Alto' ? '🔥 Alto' : p.interes === 'Medio' ? '⚡ Medio' : '🧊 Bajo'}
              </span>
              <div className="flex gap-2">
                <button onClick={(e) => {e.stopPropagation(); abrirEditor(p)}} className="text-gray-400 p-1"><Edit3 size={16} /></button>
                <button onClick={(e) => eliminarProspecto(p.id, e)} className="text-gray-300 p-1"><Trash2 size={16} /></button>
              </div>
            </div>
            
            <h3 className="font-bold text-lg text-gray-900 leading-tight">{p.grupo}</h3>
            <p className="text-sm text-gray-600 mb-3">{p.contacto}</p>
            
            <div className="flex gap-2 mb-3">
              <a href={`tel:${p.telefono}`} onClick={(e) => e.stopPropagation()} className="flex-1 bg-green-50 text-green-700 py-2 rounded-xl flex justify-center items-center gap-2 font-bold text-sm border border-green-200">
                <Phone size={16} /> Llamar
              </a>
              {p.ubicacion && (
                <a href={p.ubicacion} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex-1 bg-blue-50 text-blue-700 py-2 rounded-xl flex justify-center items-center gap-2 font-bold text-sm border border-blue-200">
                  <MapPin size={16} /> Mapa
                </a>
              )}
            </div>

            <div className="bg-gray-50 p-3 rounded-lg text-xs text-gray-500 italic">
              "{p.notas || 'Sin notas adicionales'}"
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-t-3xl p-6 shadow-2xl animate-in slide-in-from-bottom max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">{editandoId ? 'Editar Visita' : 'Nueva Visita'}</h2>
              <button onClick={cerrarModal} className="p-2 text-gray-400"><X size={24} /></button>
            </div>
            
            <form onSubmit={guardarCambios} className="space-y-4">
              <input 
                placeholder="Nombre del Grupo" 
                required 
                className="w-full p-4 bg-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500"
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
                  className="flex-1 p-4 bg-gray-100 rounded-2xl outline-none appearance-none"
                  value={nuevo.interes}
                  onChange={e => setNuevo({...nuevo, interes: e.target.value})}
                >
                  <option value="Bajo">Interés Bajo</option>
                  <option value="Medio">Interés Medio</option>
                  <option value="Alto">Interés Alto</option>
                </select>
                <button 
                  type="button" 
                  onClick={obtenerGPS}
                  className={`flex-1 p-4 rounded-2xl font-bold flex items-center justify-center gap-2 border transition-colors ${nuevo.ubicacion ? 'bg-green-100 border-green-500 text-green-700' : 'bg-gray-100 border-gray-300 text-gray-600'}`}
                >
                  <MapPin size={20} /> {nuevo.ubicacion ? 'Ubicación OK' : 'GPS'}
                </button>
              </div>

              <textarea 
                placeholder="Notas de la visita..." 
                className="w-full p-4 bg-gray-100 rounded-2xl outline-none h-24"
                value={nuevo.notas}
                onChange={e => setNuevo({...nuevo, notas: e.target.value})}
              ></textarea>

              <button type="submit" className="w-full bg-blue-900 text-white py-4 rounded-2xl font-bold shadow-lg">
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