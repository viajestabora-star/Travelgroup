import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { desgloseIvaBeneficioBruto } from '../utils/finanzasHelpers'
import { Plus, Edit2, Trash2, X, Search, User, MapPin, Mail, Phone, Users, Navigation } from 'lucide-react'
import { useEmpresa } from '../context/EmpresaContext'

const Clientes = ({ user = null }) => {
  const { empresaId } = useEmpresa()
  const getMensajeErrorBd = (error, accion) => {
    const detalle = error?.message || 'No se pudo completar la operación.'
    return `No ha sido posible ${accion}. Revisa los datos e inténtalo de nuevo. Detalle: ${detalle}`
  }
  const [clientes, setClientes] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [expedientesCliente, setExpedientesCliente] = useState([])
  const [cargandoExpedientes, setCargandoExpedientes] = useState(false)
  
  const [formData, setFormData] = useState({
    nombre: '', 
    cif_nif: '', 
    telefono: '', 
    email: '',
    direccion: '', 
    poblacion: '', 
    provincia: '',
    codigo_postal: '', 
    observaciones: '',
    responsable: '',
    movil: '',
    bonificaciones: '',
    gratuidades: ''
  })

  useEffect(() => { fetchClientesData() }, [])

  // Función maestra de refresco: obtiene clientes de la empresa en sesión
  const fetchClientesData = async () => {
    if (!empresaId) return
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('empresa_id', empresaId)           // AISLAMIENTO: solo clientes de esta empresa
      .order('nombre', { ascending: true })  // Regla 1.14: Clientes A-Z por nombre
    if (!error) setClientes(data || [])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Detección de duplicados por CIF antes de guardar
    const cifValor = (formData.cif_nif || '').trim()
    if (cifValor) {
      const { data: isDuplicate, error: dupError } = await supabase.rpc('check_for_duplicate', {
        table_name: 'clientes',
        column_name: 'cif_nif',
        value: cifValor,
        record_id: editingId || null
      })
      if (!dupError && isDuplicate === true) {
        const userConfirmed = window.confirm('⚠️ Ya existe un cliente con este CIF. ¿Desea guardarlo de todas formas?')
        if (!userConfirmed) return
      }
    }

    // INSERT: empresa_id la fija el trigger en BD (fn_set_empresa_id_global); no enviar manualmente.
    // UPDATE: el proxy tenant añade .eq('empresa_id', sesión) — no incluir empresa_id en formData.
    const action = editingId
      ? supabase.from('clientes').update(formData).eq('id', editingId)
      : supabase.from('clientes').insert([{ ...formData }])
    
    const { error } = await action
    if (!error) {
      closeModal()
      await fetchClientesData()
    } else {
      alert(getMensajeErrorBd(error, 'guardar el cliente'))
    }
  }

  // Regla 1.14: Confirmación doble antes de borrar (evita pérdidas accidentales)
  const deleteCliente = async (id, nombre) => {
    if (!window.confirm(`¿Estás seguro de que quieres borrar al cliente "${nombre}"?\n\nEsta acción no se puede deshacer.`)) return
    if (!window.confirm('¿Estás seguro de que quieres borrar este registro definitivamente?')) return
    const { error } = await supabase.from('clientes').delete().eq('id', id)
    if (!error) {
      await fetchClientesData()
    } else {
      alert('Error al eliminar cliente: ' + (error?.message || 'Error desconocido'))
    }
  }

  const cargarExpedientesCliente = async (nombreCliente) => {
    if (!nombreCliente || nombreCliente.trim() === '') {
      setExpedientesCliente([])
      return
    }

    // Normalizar nombre: eliminar espacios extra y trim
    const nombreNormalizado = nombreCliente.trim().replace(/\s+/g, ' ')
    setCargandoExpedientes(true)
    try {
      const { data, error } = await supabase
        .from('expedientes')
        .select('*')
        .eq('empresa_id', empresaId)           // AISLAMIENTO: solo expedientes de esta empresa
        .ilike('cliente_nombre', nombreNormalizado)
        .order('fecha_inicio', { ascending: true, nullsFirst: false })

      if (error) {
        setExpedientesCliente([])
        return
      }

      if (!data || data.length === 0) {
        setExpedientesCliente([])
        setCargandoExpedientes(false)
        return
      }

      // Para cada expediente, calcular el beneficio neto consultando los servicios
      const expedientesConBeneficio = await Promise.all(
        data.map(async (exp) => {
          try {
            // Consultar servicios del expediente para calcular coste total
            const { data: servicios } = await supabase
              .from('servicios_cotizacion')
              .select('coste_unitario, tipo_servicio, noches')
              .eq('id_expediente', exp.id)

            let costeTotal = 0
            if (servicios && servicios.length > 0) {
              servicios.forEach(servicio => {
                const coste = parseFloat(servicio.coste_unitario) || 0
                const cantidad = servicio.tipo_servicio === 'Hotel' || servicio.tipo_servicio === 'Guía' 
                  ? (parseInt(servicio.noches) || 1)
                  : 1
                costeTotal += coste * cantidad
              })
            }

            // Calcular beneficio neto
            const precioVenta = parseFloat(exp.precio_venta_cliente) || 0
            const paxPago = parseInt(exp.pax_pago) || parseInt(exp.total_pax) || 0
            const precioVentaTotal = precioVenta * paxPago
            const beneficioTotal = precioVentaTotal - costeTotal
            const { beneficioNeto } = desgloseIvaBeneficioBruto(beneficioTotal)

            return {
              ...exp,
              beneficioNeto: isNaN(beneficioNeto) ? null : beneficioNeto
            }
          } catch (err) {
            return { ...exp, beneficioNeto: null }
          }
        })
      )

      setExpedientesCliente(expedientesConBeneficio)
    } catch (err) {
      setExpedientesCliente([])
    } finally {
      setCargandoExpedientes(false)
    }
  }

  const openModal = (c = null) => {
    if (c) {
      setEditingId(c.id); setFormData({ 
        nombre: c.nombre || '', 
        cif_nif: c.cif_nif || c.cif || '', 
        telefono: c.telefono || '', 
        email: c.email || '', 
        direccion: c.direccion || '', 
        poblacion: c.poblacion || '', 
        provincia: c.provincia || '', 
        codigo_postal: c.codigo_postal || c.cp || '', 
        observaciones: c.observaciones || '',
        responsable: c.responsable || c.personaContacto || '',
        movil: c.movil || '',
        bonificaciones: c.bonificaciones || c.comisiones || '',
        gratuidades: c.gratuidades || ''
      })
      // Cargar expedientes del cliente
      cargarExpedientesCliente(c.nombre)
    } else {
      setEditingId(null); setFormData({ 
        nombre: '', 
        cif_nif: '', 
        telefono: '', 
        email: '', 
        direccion: '', 
        poblacion: '', 
        provincia: '', 
        codigo_postal: '', 
        observaciones: '',
        responsable: '',
        movil: '',
        bonificaciones: '',
        gratuidades: ''
      })
      setExpedientesCliente([])
    }
    setShowModal(true)
  }

  const closeModal = () => { setShowModal(false); setEditingId(null); }

  const filtered = clientes.filter(c => c.nombre?.toLowerCase().includes(searchTerm.toLowerCase()))

  return (
    <div className="p-10 max-w-[1700px] mx-auto bg-white min-h-screen font-sans">
      <div className="flex justify-between items-end mb-10 border-b-4 border-slate-900 pb-6">
        <div>
          <h1 className="text-6xl font-[1000] italic tracking-tighter text-slate-900 uppercase text-left">Cartera de Clientes</h1>
          <p className="text-slate-400 font-bold text-xs tracking-[0.2em] mt-2 uppercase text-left">Base de Datos de Expedientes y Grupos</p>
        </div>
        <button onClick={() => openModal()} className="bg-slate-900 text-white px-10 py-5 rounded-2xl font-black italic uppercase text-lg hover:bg-green-600 transition-all shadow-2xl active:scale-95">
          + Nuevo Cliente
        </button>
      </div>

      <div className="relative mb-8">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
        <input placeholder="Buscar por nombre de cliente o grupo..." className="w-full bg-slate-50 p-6 pl-16 rounded-2xl font-bold text-lg border-none outline-none focus:ring-4 focus:ring-slate-100 text-left" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden text-left">
        <table className="w-full">
          <thead className="bg-slate-900 text-white">
            <tr>
              <th className="px-8 py-6 text-xs font-black uppercase tracking-widest">Nombre / Entidad</th>
              <th className="px-6 py-6 text-xs font-black uppercase tracking-widest">Contacto Directo</th>
              <th className="px-6 py-6 text-xs font-black uppercase tracking-widest">Ubicación</th>
              <th className="px-8 py-6 text-xs font-black uppercase tracking-widest text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(c => (
              <tr key={c.id} className="hover:bg-green-50/30 transition-all group">
                <td className="px-8 py-6">
                  <div className="font-[1000] text-slate-900 text-xl italic uppercase leading-tight">{c.nombre}</div>
                  <div className="text-[10px] font-black text-slate-400 mt-1 uppercase italic tracking-widest">{c.cif_nif || 'Sin CIF'}</div>
                </td>
                <td className="px-6 py-6">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-2"><Phone size={14} className="text-green-600"/> {c.movil || c.telefono || '-'}</div>
                  <div className="text-xs font-medium text-slate-400 flex items-center gap-2 mt-1"><Mail size={14}/> {c.email || '-'}</div>
                  {c.responsable && (
                    <div className="text-xs font-medium text-slate-500 flex items-center gap-2 mt-1">👤 {c.responsable}</div>
                  )}
                </td>
                <td className="px-6 py-6">
                  <div className="text-xs font-bold text-slate-800 uppercase leading-relaxed"><MapPin size={14} className="inline mr-1 text-slate-400"/> {c.poblacion}</div>
                  <div className="text-[10px] font-black text-slate-400 mt-1 ml-5 uppercase">{c.provincia}</div>
                </td>
                <td className="px-8 py-6 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openModal(c)} className="p-4 bg-slate-100 text-slate-900 rounded-2xl hover:bg-slate-900 hover:text-white transition-all mr-2"><Edit2 size={20}/></button>
                  <button onClick={() => deleteCliente(c.id, c.nombre)} className="p-4 bg-red-50 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition-all"><Trash2 size={20}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-50 p-6 text-left">
          <div 
            className="w-full max-w-5xl max-h-[95vh] overflow-y-auto"
            style={{ 
              backgroundColor: 'white', 
              padding: '32px', 
              borderRadius: '24px', 
              boxShadow: '0 10px 25px rgba(0,0,0,0.05), 0 5px 10px rgba(0,0,0,0.05)', 
              border: '1px solid #f3f4f6' 
            }}
          >
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-full">
                  <Users className="text-blue-600" size={24} />
                </div>
                <h2 className="text-3xl font-bold text-slate-900">Ficha de Cliente</h2>
              </div>
              <button onClick={closeModal} className="p-2 bg-gray-100 rounded-full hover:bg-red-500 hover:text-white transition-all"><X size={24}/></button>
            </div>
            
            {/* Detección de campos faltantes */}
            {(() => {
              const camposFaltantes = []
              
              // Email
              if (!formData.email || formData.email.trim() === '') camposFaltantes.push('Email')
              
              // Teléfono
              if (!formData.telefono || formData.telefono.trim() === '') camposFaltantes.push('Teléfono')
              
              // Móvil
              if (!formData.movil || formData.movil.trim() === '') camposFaltantes.push('Móvil')
              
              // Responsable
              if (!formData.responsable || formData.responsable.trim() === '') camposFaltantes.push('Responsable')
              
              // Dirección
              if (!formData.direccion || formData.direccion.trim() === '') camposFaltantes.push('Dirección')
              
              // Población
              if (!formData.poblacion || formData.poblacion.trim() === '') camposFaltantes.push('Población')
              
              // Provincia
              if (!formData.provincia || formData.provincia.trim() === '') camposFaltantes.push('Provincia')
              
              const hayCamposFaltantes = camposFaltantes.length > 0
              
              return (
                <>
                  {/* Banner de Aviso */}
                  {hayCamposFaltantes && (
                    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm font-medium text-amber-800">
                        ⚠️ Faltan datos: {camposFaltantes.join(', ')}
                      </p>
                    </div>
                  )}
                  
                  <div 
                    style={{ 
                      background: 'white', 
                      padding: '32px', 
                      borderRadius: '24px', 
                      boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.04)',
                      border: '1px solid #f1f5f9'
                    }}
                  >
                    <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                      Nombre o Razón Social *
                    </label>
                    <input 
                      required 
                      className="w-full p-4 transition-all"
                      style={{ 
                        backgroundColor: '#f8fafc', 
                        color: '#0f172a', 
                        fontSize: '16px', 
                        fontWeight: '600',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        marginTop: '4px'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#3b82f6'
                        e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0'
                        e.target.style.boxShadow = 'none'
                      }}
                      value={formData.nombre} 
                      onChange={e=>setFormData({...formData, nombre:e.target.value})} 
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                      CIF / NIF
                      {(!formData.cif_nif || formData.cif_nif.trim() === '') && (
                        <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                      )}
                    </label>
                    <input 
                      className="w-full p-4 transition-all"
                      style={{ 
                        backgroundColor: '#f8fafc', 
                        color: '#0f172a', 
                        fontSize: '16px', 
                        fontWeight: '600',
                        borderRadius: '12px',
                        border: (!formData.cif_nif || formData.cif_nif.trim() === '') ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                        marginTop: '4px'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#3b82f6'
                        e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = (!formData.cif_nif || formData.cif_nif.trim() === '') ? '#f59e0b' : '#e2e8f0'
                        e.target.style.boxShadow = 'none'
                      }}
                      value={formData.cif_nif} 
                      onChange={e=>setFormData({...formData, cif_nif:e.target.value})} 
                    />
                    {(!formData.cif_nif || formData.cif_nif.trim() === '') && (
                      <p className="text-xs text-amber-600 mt-1">Dato pendiente</p>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                      Teléfono de Contacto
                      {(!formData.telefono || formData.telefono.trim() === '') && (
                        <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                      )}
                    </label>
                    <input 
                      className="w-full p-4 transition-all"
                      style={{ 
                        backgroundColor: '#f8fafc', 
                        color: '#0f172a', 
                        fontSize: '16px', 
                        fontWeight: '600',
                        borderRadius: '12px',
                        border: (!formData.telefono || formData.telefono.trim() === '') ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                        marginTop: '4px'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#3b82f6'
                        e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = (!formData.telefono || formData.telefono.trim() === '') ? '#f59e0b' : '#e2e8f0'
                        e.target.style.boxShadow = 'none'
                      }}
                      value={formData.telefono} 
                      onChange={e=>setFormData({...formData, telefono:e.target.value})} 
                    />
                    {(!formData.telefono || formData.telefono.trim() === '') && (
                      <p className="text-xs text-amber-600 mt-1">Dato pendiente</p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                      Email de Facturación / Envío
                      {(!formData.email || formData.email.trim() === '') && (
                        <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                      )}
                    </label>
                    <input 
                      type="email"
                      className="w-full p-4 transition-all"
                      style={{ 
                        backgroundColor: '#f8fafc', 
                        color: '#0f172a', 
                        fontSize: '16px', 
                        fontWeight: '600',
                        borderRadius: '12px',
                        border: (!formData.email || formData.email.trim() === '') ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                        marginTop: '4px'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#3b82f6'
                        e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = (!formData.email || formData.email.trim() === '') ? '#f59e0b' : '#e2e8f0'
                        e.target.style.boxShadow = 'none'
                      }}
                      value={formData.email} 
                      onChange={e=>setFormData({...formData, email:e.target.value})} 
                    />
                    {(!formData.email || formData.email.trim() === '') && (
                      <p className="text-xs text-amber-600 mt-1">Dato pendiente</p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                      Dirección
                      {(!formData.direccion || formData.direccion.trim() === '') && (
                        <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                      )}
                    </label>
                    <input 
                      className="w-full p-4 transition-all"
                      style={{ 
                        backgroundColor: '#f8fafc', 
                        color: '#0f172a', 
                        fontSize: '16px', 
                        fontWeight: '600',
                        borderRadius: '12px',
                        border: (!formData.direccion || formData.direccion.trim() === '') ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                        marginTop: '4px'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#3b82f6'
                        e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = (!formData.direccion || formData.direccion.trim() === '') ? '#f59e0b' : '#e2e8f0'
                        e.target.style.boxShadow = 'none'
                      }}
                      value={formData.direccion} 
                      onChange={e=>setFormData({...formData, direccion:e.target.value})} 
                    />
                    {(!formData.direccion || formData.direccion.trim() === '') && (
                      <p className="text-xs text-amber-600 mt-1">Dato pendiente</p>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                      Población
                      {(!formData.poblacion || formData.poblacion.trim() === '') && (
                        <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                      )}
                    </label>
                    <input 
                      className="w-full p-4 transition-all"
                      style={{ 
                        backgroundColor: '#f8fafc', 
                        color: '#0f172a', 
                        fontSize: '16px', 
                        fontWeight: '600',
                        borderRadius: '12px',
                        border: (!formData.poblacion || formData.poblacion.trim() === '') ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                        marginTop: '4px'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#3b82f6'
                        e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = (!formData.poblacion || formData.poblacion.trim() === '') ? '#f59e0b' : '#e2e8f0'
                        e.target.style.boxShadow = 'none'
                      }}
                      value={formData.poblacion} 
                      onChange={e=>setFormData({...formData, poblacion:e.target.value})} 
                    />
                    {(!formData.poblacion || formData.poblacion.trim() === '') && (
                      <p className="text-xs text-amber-600 mt-1">Dato pendiente</p>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                      Provincia
                      {(!formData.provincia || formData.provincia.trim() === '') && (
                        <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                      )}
                    </label>
                    <input 
                      className="w-full p-4 transition-all"
                      style={{ 
                        backgroundColor: '#f8fafc', 
                        color: '#0f172a', 
                        fontSize: '16px', 
                        fontWeight: '600',
                        borderRadius: '12px',
                        border: (!formData.provincia || formData.provincia.trim() === '') ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                        marginTop: '4px'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#3b82f6'
                        e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = (!formData.provincia || formData.provincia.trim() === '') ? '#f59e0b' : '#e2e8f0'
                        e.target.style.boxShadow = 'none'
                      }}
                      value={formData.provincia} 
                      onChange={e=>setFormData({...formData, provincia:e.target.value})} 
                    />
                    {(!formData.provincia || formData.provincia.trim() === '') && (
                      <p className="text-xs text-amber-600 mt-1">Dato pendiente</p>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                      Responsable
                      {(!formData.responsable || formData.responsable.trim() === '') && (
                        <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                      )}
                    </label>
                    <input 
                      className="w-full p-4 transition-all"
                      style={{ 
                        backgroundColor: '#f8fafc', 
                        color: '#0f172a', 
                        fontSize: '16px', 
                        fontWeight: '600',
                        borderRadius: '12px',
                        border: (!formData.responsable || formData.responsable.trim() === '') ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                        marginTop: '4px'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#3b82f6'
                        e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = (!formData.responsable || formData.responsable.trim() === '') ? '#f59e0b' : '#e2e8f0'
                        e.target.style.boxShadow = 'none'
                      }}
                      value={formData.responsable} 
                      onChange={e=>setFormData({...formData, responsable:e.target.value})} 
                    />
                    {(!formData.responsable || formData.responsable.trim() === '') && (
                      <p className="text-xs text-amber-600 mt-1">Dato pendiente</p>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                      Móvil
                      {(!formData.movil || formData.movil.trim() === '') && (
                        <span className="ml-2 text-xs font-normal text-amber-600">(pendiente)</span>
                      )}
                    </label>
                    <input 
                      className="w-full p-4 transition-all"
                      style={{ 
                        backgroundColor: '#f8fafc', 
                        color: '#0f172a', 
                        fontSize: '16px', 
                        fontWeight: '600',
                        borderRadius: '12px',
                        border: (!formData.movil || formData.movil.trim() === '') ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                        marginTop: '4px'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#3b82f6'
                        e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = (!formData.movil || formData.movil.trim() === '') ? '#f59e0b' : '#e2e8f0'
                        e.target.style.boxShadow = 'none'
                      }}
                      value={formData.movil} 
                      onChange={e=>setFormData({...formData, movil:e.target.value})} 
                    />
                    {(!formData.movil || formData.movil.trim() === '') && (
                      <p className="text-xs text-amber-600 mt-1">Dato pendiente</p>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                      Bonificaciones
                    </label>
                    <input 
                      className="w-full p-4 transition-all"
                      style={{ 
                        backgroundColor: '#f8fafc', 
                        color: '#0f172a', 
                        fontSize: '16px', 
                        fontWeight: '600',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        marginTop: '4px'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#3b82f6'
                        e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0'
                        e.target.style.boxShadow = 'none'
                      }}
                      value={formData.bonificaciones} 
                      onChange={e=>setFormData({...formData, bonificaciones:e.target.value})} 
                      placeholder="Ej: 15€" 
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                      Gratuidades
                    </label>
                    <input 
                      className="w-full p-4 transition-all"
                      style={{ 
                        backgroundColor: '#f8fafc', 
                        color: '#0f172a', 
                        fontSize: '16px', 
                        fontWeight: '600',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        marginTop: '4px'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#3b82f6'
                        e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0'
                        e.target.style.boxShadow = 'none'
                      }}
                      value={formData.gratuidades} 
                      onChange={e=>setFormData({...formData, gratuidades:e.target.value})} 
                      placeholder="Ej: 1 plaza gratis por cada 25 de pago" 
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>
                      Observaciones del Cliente
                    </label>
                    <textarea 
                      className="w-full p-4 transition-all"
                      style={{ 
                        backgroundColor: '#f8fafc', 
                        color: '#0f172a', 
                        fontSize: '16px', 
                        fontWeight: '600',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        minHeight: '100px',
                        marginTop: '4px'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#3b82f6'
                        e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0'
                        e.target.style.boxShadow = 'none'
                      }}
                      rows="3" 
                      value={formData.observaciones} 
                      onChange={e=>setFormData({...formData, observaciones:e.target.value})} 
                    />
                  </div>
                </div>

                {/* Botones de Acción: Llamar, Mapa y Guardar */}
                <div className="flex justify-between items-center mt-8 pt-6 border-t" style={{ borderColor: '#f1f5f9' }}>
                  <div className="flex gap-3">
                    {/* Botón LLAMAR */}
                    {(formData.telefono || formData.movil) && (
                      <button 
                        type="button"
                        onClick={() => {
                          const telefono = formData.telefono || formData.movil
                          window.open(`tel:${telefono}`, '_blank')
                        }}
                        className="bg-green-600 hover:bg-green-700 text-white py-3 px-6 rounded-lg font-semibold transition-colors shadow-md flex items-center gap-2"
                      >
                        <Phone size={18}/> LLAMAR
                      </button>
                    )}
                    {/* Botón MAPA */}
                    {(formData.direccion || formData.poblacion) && (
                      <button 
                        type="button"
                        onClick={() => {
                          const direccion = `${formData.direccion || ''}, ${formData.poblacion || ''}, ${formData.provincia || ''}`.replace(/^,\s*|,\s*$/g, '').replace(/,\s*,/g, ',')
                          if (direccion) {
                            window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`, '_blank')
                          }
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-semibold transition-colors shadow-md flex items-center gap-2"
                      >
                        <Navigation size={18}/> MAPA
                      </button>
                    )}
                  </div>
                  <button 
                    type="submit" 
                    className="bg-slate-900 hover:bg-slate-800 text-white py-3 px-6 rounded-lg font-semibold transition-colors shadow-md"
                  >
                    Guardar Cliente
                  </button>
                </div>
              </form>
              
              {/* Historial de Expedientes - Fuera del formulario, siempre visible */}
              {editingId && (
                <div className="mt-8 border-t pt-8" style={{ borderColor: '#f1f5f9' }}>
                  <h2 className="text-2xl font-bold text-slate-900 mb-6">📂 Historial de Expedientes</h2>
                  
                  {cargandoExpedientes ? (
                    <div className="text-center py-8 text-slate-500">
                      <p>Cargando expedientes...</p>
                    </div>
                  ) : expedientesCliente.length === 0 ? (
                    <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                      <p className="text-slate-600 text-center">No hay expedientes registrados para este nombre.</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-slate-900 text-white">
                          <tr>
                            <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-left">Nombre del Viaje</th>
                            <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-left">Destino</th>
                            <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-left">Estado</th>
                            <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-right">Beneficio Neto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {expedientesCliente.map((exp) => (
                            <tr key={exp.id} className="hover:bg-green-50/30 transition-all">
                              <td className="px-6 py-4">
                                <div className="font-bold text-slate-900">{exp.cliente_nombre || 'Sin nombre'}</div>
                                {exp.fecha_viaje && (
                                  <div className="text-xs text-slate-500 mt-1">
                                    {new Date(exp.fecha_viaje).toLocaleDateString('es-ES')}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                <div className="text-sm text-slate-700 font-medium">
                                  {(() => {
                                    const destinoMostrar = exp.poblacion_destino || exp.destino || 'Sin destino'
                                    return destinoMostrar
                                  })()}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`inline-block px-3 py-1.5 rounded-full text-sm font-bold ${
                                  exp.estado === 'cerrado' ? 'bg-green-100 text-green-800' :
                                  exp.estado === 'confirmado' ? 'bg-blue-100 text-blue-800' :
                                  exp.estado === 'peticion' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-slate-100 text-slate-800'
                                }`}>
                                  {exp.estado || 'Sin estado'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className={`font-bold ${
                                  exp.beneficioNeto !== null 
                                    ? (exp.beneficioNeto >= 0 ? 'text-green-700' : 'text-red-700')
                                    : 'text-slate-500'
                                }`}>
                                  {exp.beneficioNeto !== null 
                                    ? `${exp.beneficioNeto >= 0 ? '+' : ''}${exp.beneficioNeto.toFixed(2)}€`
                                    : 'N/A'
                                  }
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
                    </div>
                  </>
                )
              })()}
          </div>
        </div>
      )}
    </div>
  )
}

export default Clientes