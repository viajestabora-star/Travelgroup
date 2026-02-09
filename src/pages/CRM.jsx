import React, { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Plus, Phone, Trash2, X, Search, Navigation, ChevronLeft, ChevronRight, Edit3, UserPlus, Calendar as CalendarIcon, History, Target, TrendingUp, Users, BarChart3 } from 'lucide-react'

const SUPABASE_URL = 'https://gtwyqxfkpdwpakmgrkbu.supabase.co'
const SUPABASE_KEY = 'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const CRM = () => {
  const [prospectos, setProspectos] = useState([])
  const [totalClientes, setTotalClientes] = useState(0)
  const [activeTab, setActiveTab] = useState('agenda') // agenda, historial, metricas
  const [showModal, setShowModal] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date().toISOString().split('T')[0])
  const [nuevo, setNuevo] = useState({
    grupo: '', contacto: '', telefono: '', interes: 'Medio', notas: '', ubicacion: '', fecha: new Date().toISOString().split('T')[0],
    cliente_id: null, cif: '', direccion: '', poblacion: '', provincia: ''
  })
  
  // Estados para autocomplete de clientes
  const [clientes, setClientes] = useState([])
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false)
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)

  const cargarDatos = async () => {
    const { data: pros } = await supabase.from('prospectos').select('*').order('fecha', { ascending: false })
    const { count: countCli } = await supabase.from('clientes').select('*', { count: 'exact', head: true })
    if (pros) setProspectos(pros)
    if (countCli !== null) setTotalClientes(countCli)
  }
  
  const cargarClientes = async () => {
    const { data, error } = await supabase
      .from('clientes')
      .select('id, nombre, cif_nif, telefono, direccion, poblacion, provincia, movil')
      .order('nombre', { ascending: true })
    if (!error && data) setClientes(data || [])
  }

  useEffect(() => { 
    cargarDatos()
    cargarClientes()
  }, [])

  // KPIs Estratégicos (Calculados para la pestaña Métricas)
  const stats = useMemo(() => {
    const mesActual = currentDate.getMonth()
    const añoActual = currentDate.getFullYear()
    const visitasMes = prospectos.filter(p => {
      const d = new Date(p.fecha); return d.getMonth() === mesActual && d.getFullYear() === añoActual
    }).length
    const interesAlto = prospectos.filter(p => p.interes === 'Alto').length
    const ratio = totalClientes > 0 ? ((totalClientes / (prospectos.length + totalClientes)) * 100).toFixed(0) : 0
    return { visitasMes, interesAlto, ratio }
  }, [prospectos, totalClientes, currentDate])

  const hoyStr = new Date().toISOString().split('T')[0]
  const visitasAgenda = prospectos.filter(p => p.fecha === fechaSeleccionada)
  const visitasHistorial = prospectos.filter(p => p.fecha < hoyStr)
  
  // Filtrar y ordenar datos para mostrar (orden alfabético en historial)
  const datosMostrar = useMemo(() => {
    let datos = busqueda 
      ? prospectos.filter(p => p.grupo.toLowerCase().includes(busqueda.toLowerCase()))
      : (activeTab === 'agenda' ? visitasAgenda : visitasHistorial)
    
    // Orden alfabético en historial
    if (activeTab === 'historial' && !busqueda) {
      datos = [...datos].sort((a, b) => (a.grupo || '').localeCompare(b.grupo || ''))
    }
    
    return datos
  }, [busqueda, activeTab, prospectos, visitasAgenda, visitasHistorial])

  const renderCalendar = () => {
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay()
    const offset = firstDay === 0 ? 6 : firstDay - 1
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < offset; i++) cells.push(<div key={`e-${i}`} className="h-10"></div>)
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const esSel = dateStr === fechaSeleccionada
      const tieneVisita = prospectos.some(p => p.fecha === dateStr)
      cells.push(
        <button key={day} onClick={() => {setFechaSeleccionada(dateStr); setActiveTab('agenda')}}
          className={`h-11 w-full flex flex-col items-center justify-center rounded-2xl relative transition-all ${esSel ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-700'}`}>
          <span className="text-sm font-bold">{day}</span>
          {tieneVisita && <div className={`w-1 h-1 rounded-full mt-0.5 ${esSel ? 'bg-white' : 'bg-orange-500'}`}></div>}
        </button>
      )
    }
    return cells
  }

  const cerrarModal = () => {
    setNuevo({ grupo: '', contacto: '', telefono: '', interes: 'Medio', notas: '', ubicacion: '', fecha: new Date().toISOString().split('T')[0],
      cliente_id: null, cif: '', direccion: '', poblacion: '', provincia: '' })
    setEditandoId(null)
    setShowModal(false)
    setBusquedaCliente('')
    setClienteSeleccionado(null)
    setMostrarSugerencias(false)
  }
  
  // Función para seleccionar cliente y auto-rellenar
  const seleccionarCliente = (cliente) => {
    setClienteSeleccionado(cliente)
    setBusquedaCliente(cliente.nombre)
    setMostrarSugerencias(false)
    
    // Auto-rellenar datos del cliente
    setNuevo({
      ...nuevo,
      grupo: cliente.nombre,
      cliente_id: cliente.id,
      cif: cliente.cif_nif || '',
      telefono: cliente.telefono || cliente.movil || '',
      direccion: cliente.direccion || '',
      poblacion: cliente.poblacion || '',
      provincia: cliente.provincia || '',
      ubicacion: `${cliente.direccion || ''}, ${cliente.poblacion || ''}, ${cliente.provincia || ''}`.replace(/^,\s*|,\s*$/g, '').replace(/,\s*,/g, ',')
    })
  }
  
  // Filtrar clientes para autocomplete
  const clientesFiltrados = clientes.filter(c => 
    !busquedaCliente || c.nombre.toLowerCase().includes(busquedaCliente.toLowerCase())
  ).slice(0, 10) // Limitar a 10 resultados

  return (
    <div className="p-4 bg-[#F8FAFC] min-h-screen pb-32 font-sans text-slate-900">
      <div className="flex justify-between items-center mb-6 px-2">
        <h1 className="text-3xl font-[1000] italic tracking-tighter text-slate-900 leading-none">TABORA</h1>
        <button onClick={() => setShowModal(true)} className="bg-slate-900 text-white p-4 rounded-[1.8rem] shadow-xl"><Plus/></button>
      </div>

      {/* SELECTOR DE PESTAÑAS - 3 OPCIONES */}
      <div className="flex bg-slate-200/50 p-1.5 rounded-2xl mb-8">
        {[
          { id: 'agenda', icon: <CalendarIcon size={14}/>, label: 'AGENDA' },
          { id: 'historial', icon: <History size={14}/>, label: 'HISTORIAL' },
          { id: 'metricas', icon: <BarChart3 size={14}/>, label: 'MÉTRICAS' }
        ].map(tab => (
          <button key={tab.id} onClick={() => {setActiveTab(tab.id); setBusqueda('')}} 
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black transition-all ${activeTab === tab.id ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* CONTENIDO SEGÚN PESTAÑA */}
      {activeTab === 'metricas' ? (
        <div className="space-y-4 animate-in fade-in duration-500">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 italic mb-2">Rendimiento Comercial</h3>
          <div className="grid grid-cols-1 gap-4">
            <MetricCard icon={<Target className="text-blue-500"/>} label="Visitas este mes" value={stats.visitasMes} color="blue" />
            <MetricCard icon={<TrendingUp className="text-emerald-500"/>} label="Tasa de éxito" value={`${stats.ratio}%`} color="emerald" />
            <MetricCard icon={<Users className="text-orange-500"/>} label="Prospectos de Interés Alto" value={stats.interesAlto} color="orange" />
          </div>
        </div>
      ) : (
        <>
          {activeTab === 'agenda' && !busqueda && (
            <div className="bg-white rounded-[2.5rem] p-6 shadow-xl mb-8 border border-white">
              <div className="flex justify-between items-center mb-6 font-black text-slate-800 italic uppercase">
                <h2 className="text-xs">{currentDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}</h2>
                <div className="flex gap-4 text-slate-400">
                  <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))}><ChevronLeft size={20}/></button>
                  <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))}><ChevronRight size={20}/></button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-black text-slate-300 mb-3 uppercase">{['L','M','X','J','V','S','D'].map(d => <div key={d}>{d}</div>)}</div>
              <div className="grid grid-cols-7 gap-1">{renderCalendar()}</div>
            </div>
          )}

          <div className="relative mb-6">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
            <input placeholder="Buscar grupo..." className="w-full bg-white p-5 pl-14 rounded-[2rem] shadow-sm outline-none font-medium" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 italic">
              {busqueda ? 'Resultados de búsqueda' : (activeTab === 'agenda' ? `Visitas: ${fechaSeleccionada}` : 'Archivo de visitas')}
            </h3>
            {datosMostrar.map(p => (
              <VisitaCard key={p.id} p={p} 
                onEdit={async () => {
                  setEditandoId(p.id)
                  setNuevo(p)
                  // Si tiene cliente_id, cargar datos del cliente
                  if (p.cliente_id) {
                    const { data: cliente } = await supabase
                      .from('clientes')
                      .select('*')
                      .eq('id', p.cliente_id)
                      .single()
                    if (cliente) {
                      setClienteSeleccionado(cliente)
                      setBusquedaCliente(cliente.nombre)
                    }
                  } else {
                    setClienteSeleccionado(null)
                    setBusquedaCliente('')
                  }
                  setShowModal(true)
                }} 
                onDelete={async () => { if(window.confirm(`¿Borrar visita?`)) { await supabase.from('prospectos').delete().eq('id', p.id); cargarDatos() } }}
                onPass={async () => { if(window.confirm(`¿Convertir a cliente?`)) { await supabase.from('clientes').insert([{nombre: p.grupo, telefono: p.telefono, contacto: p.contacto, notas: p.notas}]); await supabase.from('prospectos').delete().eq('id', p.id); cargarDatos() } }}
              />
            ))}
            {datosMostrar.length === 0 && <div className="text-center py-20 text-slate-300 italic">Sin registros</div>}
          </div>
        </>
      )}

      {/* MODAL COMPLETO CON TODOS LOS CAMPOS */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xl flex items-end z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-[3.5rem] p-10 shadow-2xl overflow-y-auto max-h-[90vh]">
             <form onSubmit={async (e) => {
               e.preventDefault();

               // ========= MAPEO REAL A LA TABLA `prospectos` =========
               // La tabla solo acepta: grupo, contacto, telefono, interes, notas, ubicacion, fecha
               // CIF / Población / Provincia se inyectan temporalmente dentro de "notas"

               // Construir notas extendidas sin enviar columnas inexistentes
               let notasExtendidas = nuevo.notas || ''

               if (nuevo.cif) {
                 notasExtendidas += (notasExtendidas ? '\n' : '') + `CIF: ${nuevo.cif}`
               }

               if (nuevo.poblacion || nuevo.provincia) {
                 const zona = `${nuevo.poblacion || ''}${nuevo.provincia ? ` (${nuevo.provincia})` : ''}`.trim()
                 if (zona) {
                   notasExtendidas += (notasExtendidas ? '\n' : '') + `Zona: ${zona}`
                 }
               }

               if (nuevo.direccion) {
                 notasExtendidas += (notasExtendidas ? '\n' : '') + `Dirección: ${nuevo.direccion}`
               }

               const datosCompletos = {
                 fecha: nuevo.fecha,
                 grupo: nuevo.grupo,
                 contacto: nuevo.contacto || '',
                 telefono: nuevo.telefono || '',
                 interes: nuevo.interes || 'Medio',
                 notas: notasExtendidas.trim(),
                 ubicacion: nuevo.ubicacion || '',
               }

               // INSERT / UPDATE usando los campos reales de la tabla
               const res = editandoId 
                 ? await supabase.from('prospectos').update(datosCompletos).eq('id', editandoId)
                 : await supabase.from('prospectos').insert([datosCompletos])

               if (!res.error) { 
                 cerrarModal()
                 cargarDatos()
               } else {
                 alert('Error al guardar: ' + res.error.message)
               }
             }} className="space-y-4">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-black italic uppercase tracking-tighter">
                    {editandoId ? 'Editar Visita' : 'Nueva Visita'}
                  </h2>
                  <button type="button" onClick={cerrarModal}><X/></button>
                </div>
                
                {/* FECHA */}
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">Fecha</label>
                  <input 
                    type="date" 
                    className="w-full p-5 bg-slate-50 rounded-[1.5rem] font-bold" 
                    value={nuevo.fecha} 
                    onChange={e => setNuevo({...nuevo, fecha: e.target.value})} 
                  />
                </div>
                
                {/* AUTCOMPLETE DE CLIENTES */}
                <div className="relative">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">Buscar Cliente Existente</label>
                  <input 
                    placeholder="🔍 Escribe para buscar (ej: Llombai)..." 
                    className="w-full p-5 bg-slate-50 rounded-[1.5rem] font-bold" 
                    value={busquedaCliente} 
                    onChange={e => {
                      setBusquedaCliente(e.target.value)
                      setMostrarSugerencias(true)
                      if (!e.target.value) {
                        setClienteSeleccionado(null)
                        setNuevo({...nuevo, cliente_id: null, cif: '', direccion: '', poblacion: '', provincia: '', ubicacion: ''})
                      }
                    }}
                    onFocus={() => setMostrarSugerencias(true)}
                    onBlur={() => setTimeout(() => setMostrarSugerencias(false), 200)}
                  />
                  {mostrarSugerencias && busquedaCliente && clientesFiltrados.length > 0 && (
                    <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-48 overflow-y-auto">
                      {clientesFiltrados.map(cliente => (
                        <button
                          key={cliente.id}
                          type="button"
                          onClick={() => seleccionarCliente(cliente)}
                          onMouseDown={(e) => e.preventDefault()}
                          className="w-full text-left px-5 py-4 hover:bg-blue-50 border-b border-slate-100 transition-colors"
                        >
                          <div className="font-bold text-slate-900">{cliente.nombre}</div>
                          {cliente.poblacion && (
                            <div className="text-xs text-slate-500">{cliente.poblacion}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {mostrarSugerencias && busquedaCliente && clientesFiltrados.length === 0 && (
                    <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 text-center text-slate-400 text-sm">
                      No se encontraron clientes
                    </div>
                  )}
                </div>
                
                {/* NOMBRE DEL GRUPO */}
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">Nombre del Grupo *</label>
                  <input 
                    placeholder="Nombre del Grupo" 
                    required 
                    className="w-full p-5 bg-slate-50 rounded-[1.5rem] font-bold" 
                    value={nuevo.grupo} 
                    onChange={e => setNuevo({...nuevo, grupo: e.target.value})} 
                  />
                </div>
                
                {/* CIF */}
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">CIF/NIF</label>
                  <input 
                    placeholder="CIF/NIF" 
                    className="w-full p-5 bg-slate-50 rounded-[1.5rem] font-bold" 
                    value={nuevo.cif} 
                    onChange={e => setNuevo({...nuevo, cif: e.target.value})} 
                  />
                </div>
                
                {/* TELÉFONO */}
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">Teléfono</label>
                  <input 
                    placeholder="Teléfono" 
                    className="w-full p-5 bg-slate-50 rounded-[1.5rem] font-bold" 
                    value={nuevo.telefono} 
                    onChange={e => setNuevo({...nuevo, telefono: e.target.value})} 
                  />
                </div>
                
                {/* CONTACTO */}
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">Persona de Contacto</label>
                  <input 
                    placeholder="Persona de Contacto" 
                    className="w-full p-5 bg-slate-50 rounded-[1.5rem] font-bold" 
                    value={nuevo.contacto} 
                    onChange={e => setNuevo({...nuevo, contacto: e.target.value})} 
                  />
                </div>
                
                {/* DIRECCIÓN */}
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">Dirección</label>
                  <input 
                    placeholder="Dirección" 
                    className="w-full p-5 bg-slate-50 rounded-[1.5rem] font-bold" 
                    value={nuevo.direccion} 
                    onChange={e => setNuevo({...nuevo, direccion: e.target.value})} 
                  />
                </div>
                
                {/* POBLACIÓN */}
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">Población</label>
                  <input 
                    placeholder="Población" 
                    className="w-full p-5 bg-slate-50 rounded-[1.5rem] font-bold" 
                    value={nuevo.poblacion} 
                    onChange={e => setNuevo({...nuevo, poblacion: e.target.value})} 
                  />
                </div>
                
                {/* PROVINCIA */}
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">Provincia</label>
                  <input 
                    placeholder="Provincia" 
                    className="w-full p-5 bg-slate-50 rounded-[1.5rem] font-bold" 
                    value={nuevo.provincia} 
                    onChange={e => setNuevo({...nuevo, provincia: e.target.value})} 
                  />
                </div>
                
                {/* UBICACIÓN (para mapa) */}
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">Ubicación Completa (para mapa)</label>
                  <input 
                    placeholder="Ubicación completa..." 
                    className="w-full p-5 bg-slate-50 rounded-[1.5rem] font-bold" 
                    value={nuevo.ubicacion} 
                    onChange={e => setNuevo({...nuevo, ubicacion: e.target.value})} 
                  />
                </div>
                
                {/* INTERÉS */}
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">Nivel de Interés</label>
                  <select 
                    className="w-full p-5 bg-slate-50 rounded-[1.5rem] font-bold" 
                    value={nuevo.interes} 
                    onChange={e => setNuevo({...nuevo, interes: e.target.value})}
                  >
                    <option value="Alto">Alto</option>
                    <option value="Medio">Medio</option>
                    <option value="Bajo">Bajo</option>
                  </select>
                </div>
                
                {/* NOTAS COMERCIALES */}
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">Notas Comerciales</label>
                  <textarea 
                    placeholder="Notas comerciales..." 
                    className="w-full p-5 bg-slate-50 rounded-[1.5rem] h-28 font-medium" 
                    value={nuevo.notas} 
                    onChange={e => setNuevo({...nuevo, notas: e.target.value})} 
                  />
                </div>
                
                {/* Indicador si es cliente existente */}
                {clienteSeleccionado && (
                  <div className="p-4 bg-green-50 rounded-[1.5rem] border border-green-200">
                    <div className="text-xs font-black text-green-600 uppercase tracking-widest mb-1">✓ Cliente Existente Vinculado</div>
                    <div className="text-sm text-green-700">Los datos se han rellenado automáticamente. Puedes editarlos si es necesario.</div>
                  </div>
                )}
                
                <button type="submit" className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black uppercase italic shadow-xl hover:bg-blue-600 transition-all">
                  Sincronizar
                </button>
             </form>
          </div>
        </div>
      )}
    </div>
  )
}

const MetricCard = ({ icon, label, value, color }) => (
  <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-50 flex items-center justify-between">
    <div className="flex items-center gap-4">
      <div className={`p-4 rounded-2xl bg-${color}-50`}>{icon}</div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{label}</p>
        <p className="text-3xl font-[1000] text-slate-900">{value}</p>
      </div>
    </div>
  </div>
)

const VisitaCard = ({ p, onEdit, onDelete, onPass }) => {
  // Obtener datos del cliente si está vinculado
  const telefonoParaLlamar = p.telefono || ''
  const direccionParaMapa = p.ubicacion || p.direccion || ''
  const urlMapa = direccionParaMapa ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccionParaMapa)}` : '#'
  
  return (
    <div className="bg-white p-6 rounded-[2.5rem] shadow-lg border border-slate-50 relative group">
      <div className="flex justify-between mb-4">
        <span className="text-[9px] font-black px-4 py-1.5 rounded-full uppercase bg-blue-50 text-blue-500 tracking-tighter">{p.fecha}</span>
        <div className="flex gap-4">
          <button onClick={onEdit} className="text-slate-300"><Edit3 size={18}/></button>
          <button onClick={onDelete} className="text-slate-100 hover:text-red-500"><Trash2 size={18}/></button>
        </div>
      </div>
      <h3 className="font-bold text-xl text-slate-800 mb-1 leading-tight">{p.grupo}</h3>
      {p.cliente_id && (
        <span className="inline-block text-[9px] font-black px-3 py-1 rounded-full uppercase bg-green-50 text-green-600 tracking-tighter mb-2">
          Cliente Existente
        </span>
      )}
      <p className="text-sm text-slate-400 mb-6 font-medium leading-relaxed">{p.notas || 'Sin anotaciones'}</p>
      <div className="grid grid-cols-2 gap-4">
        {telefonoParaLlamar ? (
          <a href={`tel:${telefonoParaLlamar}`} className="bg-slate-900 text-white py-4 rounded-2xl flex justify-center gap-2 font-black text-[10px] items-center italic uppercase tracking-widest"><Phone size={14}/> LLAMAR</a>
        ) : (
          <button disabled className="bg-slate-300 text-white py-4 rounded-2xl flex justify-center gap-2 font-black text-[10px] items-center italic uppercase"><Phone size={14}/> LLAMAR</button>
        )}
        {direccionParaMapa ? (
          <a href={urlMapa} target="_blank" rel="noopener noreferrer" className="bg-blue-600 text-white py-4 rounded-2xl flex justify-center gap-2 font-black text-[10px] items-center italic uppercase shadow-lg shadow-blue-100"><Navigation size={14}/> MAPA</a>
        ) : (
          <button onClick={onPass} className="bg-blue-600 text-white py-4 rounded-2xl flex justify-center gap-2 font-black text-[10px] items-center italic uppercase shadow-lg shadow-blue-100"><UserPlus size={14}/> CLIENTE</button>
        )}
      </div>
    </div>
  )
}

export default CRM