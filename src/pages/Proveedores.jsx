import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Edit2, Trash2, X, Search, MapPin, Phone, Mail } from 'lucide-react'

const SUPABASE_URL = 'https://gtwyqxfkpdwpakmgrkbu.supabase.co'
const SUPABASE_KEY = 'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const Proveedores = () => {
  const [proveedores, setProveedores] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  
  const [formData, setFormData] = useState({
    nombre_comercial: '', servicio: 'Hotel', ciudad: '', cif: '', persona_contacto: '',
    telefono: '', telefono_fijo: '', email: '', movil: '', direccion: '', 
    poblacion: '', provincia: '', iban: '', observaciones: ''
  })

  const servicios = [
    { value: 'Hotel', label: 'Hotel', icon: '🏨' },
    { value: 'Guía', label: 'Guía', icon: '👤' },
    { value: 'Restaurante', label: 'Restaurante', icon: '🍽️' },
    { value: 'Autobús', label: 'Autobús', icon: '🚌' },
    { value: 'Otros', label: 'Otros', icon: '📦' }
  ]

  useEffect(() => { fetchProveedores() }, [])

  const fetchProveedores = async () => {
    const { data, error } = await supabase
      .from('proveedores')
      .select('*')
      .order('nombre_comercial', { ascending: true })
    if (!error) setProveedores(data || [])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Forzar que el campo servicio tenga siempre un valor válido
    const servicioNormalizado = servicios.some(s => s.value === formData.servicio)
      ? formData.servicio
      : 'Hotel'

    const datosParaGuardar = { 
      ...formData,
      servicio: servicioNormalizado
    }
    
    const action = editingId 
      ? supabase.from('proveedores').update(datosParaGuardar).eq('id', editingId)
      : supabase.from('proveedores').insert([datosParaGuardar])
    
    const { error } = await action
    if (!error) { closeModal(); fetchProveedores(); }
    else { alert("Error: " + error.message) }
  }

  const deleteProveedor = async (id, nombre) => {
    if (window.confirm(`¿Seguro que quieres eliminar a ${nombre}?`)) {
      await supabase.from('proveedores').delete().eq('id', id)
      fetchProveedores()
    }
  }

  const openModal = (p = null) => {
    if (p) {
      setEditingId(p.id)
      setFormData({ 
        ...p,
        servicio: p.servicio || 'Hotel',
        ciudad: p.ciudad || ''
      })
    } else {
      setEditingId(null)
      setFormData({
        nombre_comercial: '', servicio: 'Hotel', ciudad: '', cif: '', persona_contacto: '',
        telefono: '', telefono_fijo: '', email: '', movil: '', direccion: '', 
        poblacion: '', provincia: '', iban: '', observaciones: ''
      })
    }
    setShowModal(true)
  }

  const closeModal = () => { setShowModal(false); setEditingId(null); }

  // Filtrar proveedores por búsqueda (nombre comercial o ciudad)
  const filtered = proveedores.filter(p => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      p.nombre_comercial?.toLowerCase().includes(term) ||
      p.ciudad?.toLowerCase().includes(term)
    )
  })

  // Agrupar proveedores por servicio y ordenar alfabéticamente dentro de cada grupo
  const proveedoresAgrupados = filtered.reduce((acc, proveedor) => {
    const servicio = proveedor.servicio || 'Otros'
    if (!acc[servicio]) {
      acc[servicio] = []
    }
    acc[servicio].push(proveedor)
    return acc
  }, {})

  // Ordenar alfabéticamente dentro de cada grupo
  Object.keys(proveedoresAgrupados).forEach(servicio => {
    proveedoresAgrupados[servicio].sort((a, b) => 
      (a.nombre_comercial || '').localeCompare(b.nombre_comercial || '')
    )
  })

  // Ordenar servicios según el orden definido
  const serviciosOrdenados = servicios.map(s => s.value).filter(s => proveedoresAgrupados[s])
  const otrosServicios = Object.keys(proveedoresAgrupados).filter(s => !serviciosOrdenados.includes(s))
  const ordenFinal = [...serviciosOrdenados, ...otrosServicios.sort()]

  return (
    <div className="p-10 max-w-[1700px] mx-auto bg-white min-h-screen text-left">
      <div className="flex justify-between items-end mb-10 border-b-4 border-slate-900 pb-6">
        <div>
          <h1 className="text-5xl font-[1000] italic tracking-tighter text-slate-900 uppercase">Proveedores</h1>
          <p className="text-slate-400 font-bold text-xs tracking-widest mt-2 uppercase">Logística y Bonos Cloud</p>
        </div>
        <button onClick={() => openModal()} className="bg-slate-900 text-white px-10 py-5 rounded-2xl font-black italic uppercase text-lg hover:bg-blue-600 transition-all shadow-xl active:scale-95">
          + Nuevo Proveedor
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="flex-1 relative">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
          <input 
            placeholder="Buscar por nombre comercial o ciudad..." 
            className="w-full bg-slate-50 p-6 pl-16 rounded-2xl font-bold text-lg border-none outline-none focus:ring-4 focus:ring-slate-100" 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
          />
        </div>
      </div>

      {/* Renderizado agrupado por servicio */}
      {ordenFinal.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-12 text-center">
          <p className="text-slate-400 font-bold text-lg">No se encontraron proveedores</p>
        </div>
      ) : (
        ordenFinal.map(servicio => {
          const proveedoresDelServicio = proveedoresAgrupados[servicio]
          const servicioInfo = servicios.find(s => s.value === servicio) || { value: servicio, label: servicio, icon: '📦' }
          
          return (
            <div key={servicio} className="mb-8">
              <div className="bg-slate-900 text-white px-8 py-4 rounded-t-[2.5rem] flex items-center gap-3">
                <span className="text-2xl">{servicioInfo.icon}</span>
                <h2 className="text-2xl font-black italic uppercase tracking-tighter">{servicioInfo.label}</h2>
                <span className="text-sm font-bold text-slate-400 ml-auto">({proveedoresDelServicio.length})</span>
              </div>
              <div className="bg-white rounded-b-[2.5rem] shadow-sm border border-slate-100 border-t-0 overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-8 py-4 text-xs font-black uppercase text-slate-600">Proveedor</th>
                      <th className="px-6 py-4 text-xs font-black uppercase text-slate-600">Ubicación</th>
                      <th className="px-6 py-4 text-xs font-black uppercase text-slate-600">Contacto</th>
                      <th className="px-8 py-4 text-xs font-black uppercase text-right text-slate-600">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {proveedoresDelServicio.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50 transition-all group">
                        <td className="px-8 py-6">
                          <div className="font-black text-slate-900 text-lg uppercase italic">{p.nombre_comercial}</div>
                          {p.ciudad && (
                            <div className="text-[10px] font-bold text-blue-600 flex items-center gap-1 uppercase tracking-widest mt-1">
                              <MapPin size={10} className="text-blue-400"/> {p.ciudad}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-6">
                          <div className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1">
                            <MapPin size={12} className="text-slate-400"/> {p.ciudad || p.poblacion || '-'}
                          </div>
                          <div className="text-[10px] font-black text-slate-400 mt-1 uppercase ml-4">
                            {p.provincia ? `(${p.provincia})` : ''}
                          </div>
                        </td>
                        <td className="px-6 py-6">
                          <div className="text-xs font-bold text-slate-600 flex items-center gap-2">
                            <Phone size={14}/> {p.telefono || p.movil || '-'}
                          </div>
                          <div className="text-[10px] font-bold text-slate-400 flex items-center gap-2 mt-1">
                            <Mail size={14}/> {p.email || '-'}
                          </div>
                        </td>
                        <td className="px-8 py-6 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openModal(p)} className="p-3 text-slate-900 bg-slate-100 rounded-xl hover:bg-slate-900 hover:text-white transition-all mr-2">
                            <Edit2 size={18}/>
                          </button>
                          <button onClick={() => deleteProveedor(p.id, p.nombre_comercial)} className="p-3 text-red-600 bg-red-50 rounded-xl hover:bg-red-600 hover:text-white transition-all">
                            <Trash2 size={18}/>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-50 p-6 text-left">
          <div className="bg-white rounded-[3rem] w-full max-w-5xl max-h-[95vh] overflow-y-auto shadow-2xl p-12 border-4 border-slate-900">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-4xl font-[1000] italic uppercase tracking-tighter text-slate-900">Ficha Técnica</h2>
              <button onClick={closeModal} className="p-4 bg-slate-100 rounded-full hover:bg-red-500 hover:text-white transition-all">
                <X size={32}/>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Nombre Comercial *</label>
                <input 
                  required 
                  className="w-full p-6 bg-slate-50 rounded-2xl font-black text-2xl border-none outline-none focus:ring-4 focus:ring-blue-100" 
                  value={formData.nombre_comercial} 
                  onChange={e=>setFormData({...formData, nombre_comercial:e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Servicio *</label>
                <select 
                  required 
                  className="w-full p-6 bg-slate-50 rounded-2xl font-black text-lg border-none outline-none focus:ring-4 focus:ring-blue-100" 
                  value={formData.servicio} 
                  onChange={e=>setFormData({...formData, servicio:e.target.value})}
                >
                  {servicios.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Ciudad</label>
                <input 
                  className="w-full p-6 bg-slate-50 rounded-2xl font-black text-lg border-none outline-none focus:ring-4 focus:ring-blue-100" 
                  value={formData.ciudad} 
                  onChange={e=>setFormData({...formData, ciudad:e.target.value})} 
                  placeholder="Ej: Toledo, Madrid..." 
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase">Persona Contacto</label>
                <input 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none" 
                  value={formData.persona_contacto} 
                  onChange={e=>setFormData({...formData, persona_contacto:e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase">Email Reservas</label>
                <input 
                  type="email" 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none" 
                  value={formData.email} 
                  onChange={e=>setFormData({...formData, email:e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase">Móvil WhatsApp</label>
                <input 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none" 
                  value={formData.movil} 
                  onChange={e=>setFormData({...formData, movil:e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase">Teléfono Fijo</label>
                <input 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none" 
                  value={formData.telefono_fijo || ''} 
                  onChange={e=>setFormData({...formData, telefono_fijo:e.target.value})} 
                />
              </div>

              <div className="md:col-span-3 space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase">Dirección</label>
                <input 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none" 
                  value={formData.direccion} 
                  onChange={e=>setFormData({...formData, direccion:e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase">Población</label>
                <input 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none" 
                  value={formData.poblacion} 
                  onChange={e=>setFormData({...formData, poblacion:e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase">Provincia</label>
                <input 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none" 
                  value={formData.provincia} 
                  onChange={e=>setFormData({...formData, provincia:e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase">CIF</label>
                <input 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none" 
                  value={formData.cif} 
                  onChange={e=>setFormData({...formData, cif:e.target.value})} 
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase">IBAN</label>
                <input 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-mono border-none outline-none" 
                  value={formData.iban} 
                  onChange={e=>setFormData({...formData, iban:e.target.value})} 
                />
              </div>

              <div className="md:col-span-3 flex gap-4 pt-10">
                <button type="submit" className="flex-[2] bg-slate-900 text-white py-8 rounded-[2rem] font-black italic uppercase text-2xl tracking-tighter shadow-2xl hover:bg-blue-600 transition-all">
                  Sincronizar Proveedor
                </button>
                <button type="button" onClick={closeModal} className="flex-1 bg-slate-100 text-slate-400 py-8 rounded-[2rem] font-black uppercase italic">
                  Descartar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Proveedores
