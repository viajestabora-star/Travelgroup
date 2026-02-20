import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { Edit2, Trash2, X, Search, MapPin, Phone, Mail } from 'lucide-react'

const Proveedores = () => {
  const [proveedores, setProveedores] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [errorBusqueda, setErrorBusqueda] = useState(null)
  const [confirmarBorrado, setConfirmarBorrado] = useState(null) // { id, nombre } - Modal Regla 1.14
  
  const [formData, setFormData] = useState({
    nombre_comercial: '', servicio: 'hotel', ciudad: '', codigo_postal: '', cif: '', persona_contacto: '',
    telefono_fijo: '', telefono_movil: '', email: '', email_2: '', direccion: '', 
    poblacion: '', provincia: '', ubicacion: '', iban: '', entidad_bancaria: '', swift_bic: '',
    es_mayorista: false, observaciones: ''
  })

  // Servicios normalizados (minúsculas, sin tildes) para coincidir con la base de datos
  const servicios = [
    { value: 'hotel', label: 'Hotel', icon: '🏨' },
    { value: 'mayorista', label: 'Mayorista', icon: '🏢' },
    { value: 'guia', label: 'Guía', icon: '👤' },
    { value: 'restaurante', label: 'Restaurante', icon: '🍽️' },
    { value: 'autobus', label: 'Autobús', icon: '🚌' },
    { value: 'otros', label: 'Otros', icon: '📦' }
  ]
  
  // Función para normalizar tipo de servicio (minúsculas, sin tildes)
  const normalizarTipoServicio = (tipo) => {
    if (!tipo) return 'hotel'
    return String(tipo)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
  }

  // Búsqueda mediante RPC buscar_proveedores (nombre, provincia, poblacion, ciudad)
  const buscarProveedores = async (termino) => {
    setCargando(true)
    setErrorBusqueda(null)
    try {
      const { data, error } = await supabase.rpc('buscar_proveedores', {
        termino_busqueda: termino || ''
      })
      if (error) {
        setProveedores([])
        setErrorBusqueda(error.message)
        setCargando(false)
        return
      }
      setProveedores(Array.isArray(data) ? data : [])
    } catch (err) {
      setProveedores([])
      setErrorBusqueda(err?.message || 'Error al buscar proveedores')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    buscarProveedores(searchTerm)
  }, [searchTerm])

  // Sanitizar valores a texto para evitar errores uuid vs bigint en Supabase
  const sanitizarTexto = (v) => (v == null || v === '') ? '' : String(v).trim()

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Normalizar el tipo de servicio (minúsculas, sin tildes) para coincidir con la BD
    const servicioNormalizado = normalizarTipoServicio(formData.servicio)
    
    // Validar que el servicio normalizado esté en la lista válida
    const servicioValido = servicios.some(s => s.value === servicioNormalizado)
      ? servicioNormalizado
      : 'hotel'

    // IMPORTANTE: Columnas exactas de Supabase (telefono_fijo, telefono_movil, codigo_postal)
    const datosParaGuardar = {
      nombre_comercial: sanitizarTexto(formData.nombre_comercial),
      tipo: servicioValido,
      ciudad: sanitizarTexto(formData.ciudad),
      codigo_postal: sanitizarTexto(formData.codigo_postal),
      cif: sanitizarTexto(formData.cif),
      persona_contacto: sanitizarTexto(formData.persona_contacto),
      telefono_fijo: sanitizarTexto(formData.telefono_fijo),
      telefono_movil: sanitizarTexto(formData.telefono_movil),
      email: sanitizarTexto(formData.email),
      email_2: sanitizarTexto(formData.email_2),
      direccion: sanitizarTexto(formData.direccion),
      poblacion: sanitizarTexto(formData.poblacion),
      provincia: sanitizarTexto(formData.provincia),
      ubicacion: sanitizarTexto(formData.ubicacion),
      iban: sanitizarTexto(formData.iban),
      entidad_bancaria: sanitizarTexto(formData.entidad_bancaria),
      swift_bic: sanitizarTexto(formData.swift_bic),
      es_mayorista: Boolean(formData.es_mayorista),
      observaciones: sanitizarTexto(formData.observaciones)
    }
    
    const action = editingId 
      ? supabase.from('proveedores').update(datosParaGuardar).eq('id', editingId)
      : supabase.from('proveedores').insert([datosParaGuardar])
    
    const { error } = await action
    if (!error) { closeModal(); buscarProveedores(searchTerm); }
    else { alert("Error: " + error.message) }
  }

  // Regla 1.14: Modal de confirmación antes de borrar
  const solicitarBorradoProveedor = (id, nombre) => setConfirmarBorrado({ id, nombre })

  // Regla 1.14: Confirmación doble antes de borrar
  const ejecutarBorradoProveedor = async () => {
    if (!confirmarBorrado?.id) return
    if (!window.confirm('¿Estás seguro de que quieres borrar este registro definitivamente?')) return
    await supabase.from('proveedores').delete().eq('id', confirmarBorrado.id)
    buscarProveedores(searchTerm)
    setConfirmarBorrado(null)
  }

  const openModal = (p = null) => {
    if (p) {
      setEditingId(p.id)
      const tipoBD = p.tipo || p.servicio || 'hotel'
      const tipoNormalizado = normalizarTipoServicio(tipoBD)
      // Mapeo explícito desde columnas de Supabase para que los datos se muestren correctamente
      setFormData({
        nombre_comercial: p.nombre_comercial || '',
        servicio: tipoNormalizado,
        ciudad: p.ciudad || '',
        codigo_postal: p.codigo_postal || '',
        cif: p.cif || '',
        persona_contacto: p.persona_contacto || '',
        telefono_fijo: p.telefono_fijo || '',
        telefono_movil: p.telefono_movil || p.movil || '',
        email: p.email || '',
        email_2: p.email_2 || '',
        direccion: p.direccion || '',
        poblacion: p.poblacion || '',
        provincia: p.provincia || '',
        ubicacion: p.ubicacion || '',
        iban: p.iban || '',
        entidad_bancaria: p.entidad_bancaria || '',
        swift_bic: p.swift_bic || '',
        es_mayorista: !!p.es_mayorista,
        observaciones: p.observaciones || ''
      })
    } else {
      setEditingId(null)
      setFormData({
        nombre_comercial: '', servicio: 'hotel', ciudad: '', codigo_postal: '', cif: '', persona_contacto: '',
        telefono_fijo: '', telefono_movil: '', email: '', email_2: '', direccion: '', 
        poblacion: '', provincia: '', ubicacion: '', iban: '', entidad_bancaria: '', swift_bic: '',
        es_mayorista: false, observaciones: ''
      })
    }
    setShowModal(true)
  }

  const closeModal = () => { setShowModal(false); setEditingId(null); }

  // Control de errores: asegurar que proveedores sea siempre un array
  const proveedoresSeguros = Array.isArray(proveedores) ? proveedores : []

  // La búsqueda se realiza en Supabase via RPC buscar_proveedores (nombre, provincia, poblacion, ciudad)
  // Agrupar proveedores por tipo (servicio) y ordenar alfabéticamente dentro de cada grupo
  // IMPORTANTE: Usar 'tipo' de la BD, normalizado para comparación
  const proveedoresAgrupados = proveedoresSeguros.reduce((acc, proveedor) => {
    if (!proveedor) return acc // Saltar si el proveedor es null/undefined
    
    // Leer 'tipo' de la BD (o 'servicio' como fallback para compatibilidad)
    const tipoBD = proveedor.tipo || proveedor.servicio || 'otros'
    const tipoNormalizado = normalizarTipoServicio(tipoBD)
    
    // Mapear tipo normalizado a label para mostrar
    const servicioInfo = servicios.find(s => s.value === tipoNormalizado) || { value: tipoNormalizado, label: tipoNormalizado, icon: '📦' }
    const servicioLabel = servicioInfo.label || tipoNormalizado
    
    if (!acc[servicioLabel]) {
      acc[servicioLabel] = []
    }
    acc[servicioLabel].push(proveedor)
    return acc
  }, {})

  // Ordenar alfabéticamente dentro de cada grupo (Regla 1.14)
  Object.keys(proveedoresAgrupados).forEach(servicio => {
    proveedoresAgrupados[servicio].sort((a, b) =>
      (a.nombre_comercial || '').localeCompare(b.nombre_comercial || '', 'es')
    )
  })

  // Regla 1.14: Ordenación A-Z por Servicio de proveedores
  const ordenFinal = Object.keys(proveedoresAgrupados).sort((a, b) => a.localeCompare(b, 'es'))

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
            placeholder="Buscar por nombre, provincia, población o ciudad..." 
            className="w-full bg-slate-50 p-6 pl-16 rounded-2xl font-bold text-lg border-none outline-none focus:ring-4 focus:ring-slate-100" 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
          />
        </div>
      </div>

      {/* Renderizado agrupado por servicio */}
      {errorBusqueda ? (
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-red-200 p-12 text-center">
          <p className="text-red-600 font-bold text-lg">Error en la búsqueda: {errorBusqueda}</p>
        </div>
      ) : cargando ? (
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-12 text-center">
          <p className="text-slate-400 font-bold text-lg">Cargando proveedores...</p>
        </div>
      ) : ordenFinal.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-12 text-center">
          <p className="text-slate-400 font-bold text-lg">No se encontraron proveedores</p>
        </div>
      ) : (
        ordenFinal.map(servicioLabel => {
          const proveedoresDelServicio = proveedoresAgrupados[servicioLabel] || []
          // Buscar servicio por label (no por value)
          const servicioInfo = servicios.find(s => s.label === servicioLabel) || { value: servicioLabel.toLowerCase(), label: servicioLabel, icon: '📦' }
          
          // Control de errores: asegurar que proveedoresDelServicio sea un array
          if (!Array.isArray(proveedoresDelServicio) || proveedoresDelServicio.length === 0) {
            return null // No renderizar si no hay proveedores
          }
          
          return (
            <div key={servicioLabel} className="mb-8">
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
                          {p.ubicacion && (
                            <div className="text-[10px] font-bold text-blue-600 mt-1 uppercase">
                              📍 {p.ubicacion}
                            </div>
                          )}
                          <div className="text-[10px] font-black text-slate-400 mt-1 uppercase ml-4">
                            {p.provincia ? `(${p.provincia})` : ''}
                          </div>
                        </td>
                        <td className="px-6 py-6">
                          <div className="text-xs font-bold text-slate-600 flex items-center gap-2">
                            <Phone size={14}/> {p.telefono_fijo || p.telefono_movil || p.telefono || p.movil || '-'}
                          </div>
                          <div className="text-[10px] font-bold text-slate-400 flex items-center gap-2 mt-1">
                            <Mail size={14}/> {p.email || '-'}
                          </div>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => openModal(p)} className="p-3 text-slate-900 bg-slate-100 rounded-xl hover:bg-slate-900 hover:text-white transition-all" title="Editar">
                              <Edit2 size={18}/>
                            </button>
                            <button onClick={() => solicitarBorradoProveedor(p.id, p.nombre_comercial)} className="p-3 text-red-600 bg-red-50 rounded-xl hover:bg-red-600 hover:text-white transition-all" title="Eliminar">
                              <Trash2 size={18}/>
                            </button>
                          </div>
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
            
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-8 text-base" style={{ fontSize: '16px' }}>
              <div className="md:col-span-2 space-y-2">
                <label className="block text-base font-black text-slate-600 uppercase tracking-widest">Nombre Comercial *</label>
                <input 
                  required 
                  className="w-full p-6 bg-slate-50 rounded-2xl font-black border-none outline-none focus:ring-4 focus:ring-blue-100" 
                  style={{ fontSize: '16px' }}
                  value={formData.nombre_comercial} 
                  onChange={e=>setFormData({...formData, nombre_comercial:e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <label className="block text-base font-black text-slate-600 uppercase tracking-widest">Servicio *</label>
                <select 
                  required 
                  className="w-full p-6 bg-slate-50 rounded-2xl font-black border-none outline-none focus:ring-4 focus:ring-blue-100" 
                  style={{ fontSize: '16px' }}
                  value={formData.servicio} 
                  onChange={e=>setFormData({...formData, servicio:e.target.value})}
                >
                  {servicios.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-base font-black text-slate-600 uppercase tracking-widest">Ciudad</label>
                <input 
                  className="w-full p-6 bg-slate-50 rounded-2xl font-black text-base border-none outline-none focus:ring-4 focus:ring-blue-100" 
                  style={{ fontSize: '16px' }}
                  value={formData.ciudad} 
                  onChange={e=>setFormData({...formData, ciudad:e.target.value})} 
                  placeholder="Ej: Toledo, Madrid..." 
                />
              </div>
              <div className="space-y-2">
                <label className="block text-base font-black text-slate-600 uppercase tracking-widest">Ubicación/Base</label>
                <input 
                  className="w-full p-6 bg-slate-50 rounded-2xl font-black text-base border-none outline-none focus:ring-4 focus:ring-blue-100" 
                  style={{ fontSize: '16px' }}
                  value={formData.ubicacion || ''} 
                  onChange={e=>setFormData({...formData, ubicacion:e.target.value})} 
                  placeholder="Ej: Guía local de Santiago, Base Madrid..." 
                />
              </div>
              <div className="space-y-2">
                <label className="block text-base font-black text-slate-600 uppercase tracking-widest">Código Postal</label>
                <input 
                  className="w-full p-6 bg-slate-50 rounded-2xl font-bold text-base border-none outline-none focus:ring-4 focus:ring-blue-100" 
                  style={{ fontSize: '16px' }}
                  value={formData.codigo_postal || ''} 
                  onChange={e=>setFormData({...formData, codigo_postal:e.target.value})} 
                  placeholder="Ej: 45001" 
                />
              </div>

              <div className="space-y-2">
                <label className="block text-base font-black text-slate-600 uppercase">Persona Contacto</label>
                <input 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none text-base" 
                  style={{ fontSize: '16px' }}
                  value={formData.persona_contacto} 
                  onChange={e=>setFormData({...formData, persona_contacto:e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <label className="block text-base font-black text-slate-600 uppercase">Teléfono Fijo (principal)</label>
                <input 
                  type="tel"
                  className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none text-base" 
                  style={{ fontSize: '16px' }}
                  value={formData.telefono_fijo || ''} 
                  onChange={e=>setFormData({...formData, telefono_fijo:e.target.value})} 
                  placeholder="Ej: 925 123 456"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-base font-black text-slate-600 uppercase">Móvil / WhatsApp (secundario)</label>
                <input 
                  type="tel"
                  className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none text-base" 
                  style={{ fontSize: '16px' }}
                  value={formData.telefono_movil || ''} 
                  onChange={e=>setFormData({...formData, telefono_movil:e.target.value})} 
                  placeholder="Ej: 612 345 678"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-base font-black text-slate-600 uppercase">Email Reservas</label>
                <input 
                  type="email" 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none text-base" 
                  style={{ fontSize: '16px' }}
                  value={formData.email || ''} 
                  onChange={e=>setFormData({...formData, email:e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <label className="block text-base font-black text-slate-600 uppercase">Email 2 (Contabilidad)</label>
                <input 
                  type="email" 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none text-base" 
                  style={{ fontSize: '16px' }}
                  value={formData.email_2 || ''} 
                  onChange={e=>setFormData({...formData, email_2:e.target.value})} 
                  placeholder="Ej: contabilidad@proveedor.com"
                />
              </div>

              <div className="md:col-span-3 space-y-2">
                <label className="block text-base font-black text-slate-600 uppercase">Dirección</label>
                <input 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none" 
                  style={{ fontSize: '16px' }}
                  value={formData.direccion} 
                  onChange={e=>setFormData({...formData, direccion:e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <label className="block text-base font-black text-slate-600 uppercase">Población</label>
                <input 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none" 
                  style={{ fontSize: '16px' }}
                  value={formData.poblacion} 
                  onChange={e=>setFormData({...formData, poblacion:e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <label className="block text-base font-black text-slate-600 uppercase">Provincia</label>
                <input 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none" 
                  style={{ fontSize: '16px' }}
                  value={formData.provincia} 
                  onChange={e=>setFormData({...formData, provincia:e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <label className="block text-base font-black text-slate-600 uppercase">CIF</label>
                <input 
                  className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none" 
                  style={{ fontSize: '16px' }}
                  value={formData.cif} 
                  onChange={e=>setFormData({...formData, cif:e.target.value})} 
                />
              </div>

              {/* SECCIÓN: Información Bancaria (IBAN, Entidad, SWIFT, Es Mayorista) */}
              <div className="md:col-span-3 border-t border-slate-200 pt-8 mt-4">
                <h3 className="text-base font-black text-slate-600 uppercase tracking-widest mb-6">Información Bancaria</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2 space-y-2">
                    <label className="block text-base font-black text-slate-600 uppercase">IBAN</label>
                    <input 
                      className="w-full p-5 bg-slate-50 rounded-2xl font-mono border-none outline-none focus:ring-4 focus:ring-blue-100" 
                      style={{ fontSize: '16px' }}
                      value={formData.iban} 
                      onChange={e=>setFormData({...formData, iban:e.target.value})} 
                      placeholder="ES00 0000 0000 0000 0000 0000"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-base font-black text-slate-600 uppercase">Entidad Bancaria</label>
                    <input 
                      className="w-full p-5 bg-slate-50 rounded-2xl font-bold border-none outline-none focus:ring-4 focus:ring-blue-100" 
                      style={{ fontSize: '16px' }}
                      value={formData.entidad_bancaria || ''} 
                      onChange={e=>setFormData({...formData, entidad_bancaria:e.target.value})} 
                      placeholder="Ej: Banco Santander, BBVA..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-base font-black text-slate-600 uppercase">SWIFT/BIC</label>
                    <input 
                      className="w-full p-5 bg-slate-50 rounded-2xl font-mono border-none outline-none focus:ring-4 focus:ring-blue-100" 
                      style={{ fontSize: '16px' }}
                      value={formData.swift_bic || ''} 
                      onChange={e=>setFormData({...formData, swift_bic:e.target.value})} 
                      placeholder="Ej: BSCHESMMXXX"
                    />
                  </div>
                  <div className="md:col-span-3 flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
                    <input
                      type="checkbox"
                      id="es_mayorista_proveedores"
                      checked={!!formData.es_mayorista}
                      onChange={e=>setFormData({...formData, es_mayorista:e.target.checked})}
                      className="w-5 h-5 rounded border-slate-300 text-slate-900 focus:ring-slate-500 focus:ring-2"
                    />
                    <label htmlFor="es_mayorista_proveedores" className="text-base font-black text-slate-700 uppercase tracking-wide cursor-pointer">
                      Es Mayorista
                    </label>
                  </div>
                </div>
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

      {/* Modal Confirmación Borrado (Regla 1.14) */}
      {confirmarBorrado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-2">Confirmar eliminación</h2>
            <p className="text-gray-600 mb-4">
              ¿Estás seguro de que quieres borrar el proveedor <strong>"{confirmarBorrado.nombre}"</strong>?
            </p>
            <p className="text-sm text-red-600 mb-6">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button
                onClick={ejecutarBorradoProveedor}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
              >
                Confirmar
              </button>
              <button
                onClick={() => setConfirmarBorrado(null)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Proveedores
