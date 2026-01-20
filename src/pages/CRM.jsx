import React, { useState, useEffect } from 'react'
import { Plus, Phone, MessageSquare, UserPlus, Trash2, X, Save, Star } from 'lucide-react'

const CRM = () => {
  const [prospectos, setProspectos] = useState(() => {
    const saved = localStorage.getItem('tabora_crm_prospectos')
    return saved ? JSON.parse(saved) : []
  })
  
  const [showModal, setShowModal] = useState(false)
  const [nuevo, setNuevo] = useState({
    grupo: '', contacto: '', telefono: '', interes: 'Medio', notas: '', fechaVisita: new Date().toLocaleDateString()
  })

  useEffect(() => {
    localStorage.setItem('tabora_crm_prospectos', JSON.stringify(prospectos))
  }, [prospectos])

  const agregarProspecto = (e) => {
    e.preventDefault()
    setProspectos([{ ...nuevo, id: Date.now() }, ...prospectos])
    setNuevo({ grupo: '', contacto: '', telefono: '', interes: 'Medio', notas: '', fechaVisita: new Date().toLocaleDateString() })
    setShowModal(false)
  }

  const eliminarProspecto = (id) => {
    if (window.confirm('¿Eliminar esta visita comercial?')) {
      setProspectos(prospectos.filter(p => p.id !== id))
    }
  }

  return (
    <div className="p-4 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold text-navy-900">CRM - Captación</h1>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-orange-500 text-white p-3 rounded-full shadow-lg hover:bg-orange-600 transition-transform active:scale-95"
        >
          <Plus size={24} />
        </button>
      </div>

      {/* Lista de Prospectos en Tarjetas (Ideal Móvil) */}
      <div className="grid grid-cols-1 gap-4">
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
                🔥 {p.interes}
              </span>
              <button onClick={() => eliminarProspecto(p.id)} className="text-gray-300"><Trash2 size={16} /></button>
            </div>
            
            <h3 className="font-bold text-lg text-navy-900 leading-tight">{p.grupo}</h3>
            <p className="text-sm text-gray-600 mb-3">{p.contacto}</p>
            
            <div className="flex gap-2 mb-3">
              <a href={`tel:${p.telefono}`} className="flex-1 bg-green-50 text-green-700 py-2 rounded-xl flex justify-center items-center gap-2 font-bold text-sm border border-green-200">
                <Phone size={16} /> Llamar
              </a>
              <button className="flex-1 bg-blue-50 text-blue-700 py-2 rounded-xl flex justify-center items-center gap-2 font-bold text-sm border border-blue-200">
                <UserPlus size={16} /> Convertir
              </button>
            </div>

            <div className="bg-gray-50 p-3 rounded-lg text-xs text-gray-500 italic">
              "{p.notas || 'Sin notas adicionales'}"
            </div>
          </div>
        ))}
      </div>

      {/* Modal Rápido de Captura */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white w-full max-w-md rounded-t-3xl md:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Nueva Visita</h2>
              <button onClick={() => setShowModal(false)} className="p-2"><X size={24} /></button>
            </div>
            
            <form onSubmit={agregarProspecto} className="space-y-4">
              <input 
                placeholder="Nombre del Grupo (ej: Jubilados X)" 
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
              
              <select 
                className="w-full p-4 bg-gray-100 rounded-2xl outline-none appearance-none"
                value={nuevo.interes}
                onChange={e => setNuevo({...nuevo, interes: e.target.value})}
              >
                <option value="Bajo">Interés Bajo 🧊</option>
                <option value="Medio">Interés Medio ⚡</option>
                <option value="Alto">Interés Alto 🔥</option>
              </select>

              <textarea 
                placeholder="Notas rápidas..." 
                className="w-full p-4 bg-gray-100 rounded-2xl outline-none h-24"
                value={nuevo.notas}
                onChange={e => setNuevo({...nuevo, notas: e.target.value})}
              ></textarea>

              <button type="submit" className="w-full bg-navy-900 text-white py-4 rounded-2xl font-bold shadow-lg shadow-navy-200">
                Guardar Captación
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default CRM