import React, { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Plus, Phone, Trash2, X, Search, Navigation, ChevronLeft, ChevronRight, Edit3, UserPlus, Calendar as CalendarIcon, History, Target, TrendingUp, Users, BarChart3, AlertCircle, MessageCircle, MapPin } from 'lucide-react'

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
    grupo: '',
    contacto: '',
    telefono: '',
    interes: 'Medio',
    notas: '',
    ubicacion: '',
    fecha: new Date().toISOString().split('T')[0],
    cliente_id: null,
    cif: '',
    direccion: '',
    poblacion: '',
    provincia: '',
    objeciones_competencia: '',
    proximo_contacto: '',
    latitude: null,
    longitude: null,
    check_in_at: null,
  })
  
  // Estados para autocomplete de clientes
  const [clientes, setClientes] = useState([])
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false)
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [checkinEstado, setCheckinEstado] = useState('idle') // 'idle' | 'locating' | 'captured' | 'error'

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

  // Convertir un prospecto en cliente oficial (acción manual)
  const convertirProspectoACliente = async (p) => {
    try {
      const nombre = (p.grupo || '').trim()
      if (!nombre) {
        alert('El nombre del grupo/cliente está vacío. No se puede crear el cliente.')
        return
      }

      // Comprobar si ya existe un cliente con ese nombre
      const { data: existentes, error: errorExistentes } = await supabase
        .from('clientes')
        .select('id')
        .ilike('nombre', nombre)
        .limit(1)

      if (!errorExistentes && Array.isArray(existentes) && existentes.length > 0) {
        alert('Ya existe un cliente oficial con este nombre. No se ha creado un duplicado.')
        return
      }

      // Intentar extraer CIF desde las notas (línea que empiece por "CIF:")
      let cifDesdeNotas = ''
      if (p.notas) {
        const lineaCif = String(p.notas)
          .split('\n')
          .find(linea => linea.trim().toUpperCase().startsWith('CIF:'))
        if (lineaCif) {
          cifDesdeNotas = lineaCif.split(':').slice(1).join(':').trim()
        }
      }

      const nuevoCliente = {
        nombre,
        cif_nif: cifDesdeNotas,
        telefono: p.telefono || '',
        email: '',
        direccion: p.ubicacion || '',
        poblacion: '',
        provincia: '',
        codigo_postal: '',
        observaciones: p.notas || '',
        responsable: p.contacto || '',
        movil: '',
        bonificaciones: '',
        gratuidades: '',
      }

      const { error } = await supabase
        .from('clientes')
        .insert([nuevoCliente])

      if (error) {
        console.error('Error convirtiendo a cliente:', error)
        alert('Error al crear el cliente: ' + (error.message || 'desconocido'))
        return
      }

      alert('¡Cliente creado con éxito!')
      // Recargar listado de clientes para que quede disponible en autocomplete y CRM
      cargarClientes()
    } catch (err) {
      console.error('Error inesperado convirtiendo a cliente:', err)
      alert('Error inesperado al crear el cliente.')
    }
  }

  // Crear un programa asociado a un prospecto (tabla programas_prospectos, IDs bigint)
  const crearProgramaParaProspecto = async (prospectoId, programa) => {
    try {
      const prospectoIdNum =
        typeof prospectoId === 'string' ? parseInt(prospectoId, 10) : prospectoId

      if (!prospectoIdNum || Number.isNaN(prospectoIdNum)) {
        alert('ID de prospecto inválido. No se puede guardar el programa.')
        return
      }

      const payload = {
        prospecto_id: prospectoIdNum,
        destino: programa.destino || '',
        fechas: programa.fechas || '',
        estado: programa.estado || 'Pendiente',
        explicacion: programa.explicacion || '',
        captura_url: programa.imagen || programa.captura_url || '',
      }

      const { data, error } = await supabase
        .from('programas_prospectos')
        .insert([payload])
        .select()
        .single()

      if (error) {
        console.error('Error guardando programa del prospecto:', error)
        alert('Error al guardar el programa del prospecto.')
        return
      }

      // Actualizar estado local: adjuntar el nuevo programa a programas_presentados
      setProspectos(prev =>
        prev.map(p => {
          const mismoId =
            (typeof p.id === 'string' ? parseInt(p.id, 10) : p.id) === prospectoIdNum
          if (!mismoId) return p

          const actuales = Array.isArray(p.programas_presentados) ? p.programas_presentados : []
          const nuevoPrograma = {
            destino: data.destino,
            fechas: data.fechas,
            estado: data.estado,
            explicacion: data.explicacion,
            imagen: data.captura_url,
          }

          return {
            ...p,
            programas_presentados: [...actuales, nuevoPrograma],
          }
        })
      )
    } catch (err) {
      console.error('Error inesperado guardando programa del prospecto:', err)
      alert('Error inesperado al guardar el programa.')
    }
  }

  // KPIs Estratégicos (Calculados para la pestaña Métricas)
  const stats = useMemo(() => {
    const mesActual = currentDate.getMonth()
    const añoActual = currentDate.getFullYear()
    const visitasMes = prospectos.filter(p => {
      const d = new Date(p.fecha); return d.getMonth() === mesActual && d.getFullYear() === añoActual
    }).length
    const interesAlto = prospectos.filter(p => (p.status || p.interes) === 'Alto').length
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
    setNuevo({
      grupo: '',
      contacto: '',
      telefono: '',
      interes: 'Medio',
      notas: '',
      ubicacion: '',
      fecha: new Date().toISOString().split('T')[0],
      cliente_id: null,
      cif: '',
      direccion: '',
      poblacion: '',
      provincia: '',
      objeciones_competencia: '',
      proximo_contacto: '',
      latitude: null,
      longitude: null,
      check_in_at: null,
    })
    setEditandoId(null)
    setShowModal(false)
    setBusquedaCliente('')
    setClienteSeleccionado(null)
    setMostrarSugerencias(false)
    setCheckinEstado('idle')
  }
  
  // Función para obtener geolocalización
  const obtenerGeolocalizacion = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalización no soportada'))
        return
      }
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          })
        },
        (error) => {
          console.warn('Error obteniendo geolocalización:', error)
          resolve({ latitude: null, longitude: null })
        },
        { timeout: 5000, enableHighAccuracy: false }
      )
    })
  }
  
  // Función para seleccionar cliente y auto-rellenar
  const seleccionarCliente = (cliente) => {
    setClienteSeleccionado(cliente)
    // El buscador y el campo grupo se unifican
    setBusquedaCliente(cliente.nombre || '')
    setMostrarSugerencias(false)
    
    // Auto-rellenar datos del cliente
    setNuevo((prev) => ({
      ...prev,
      grupo: cliente.nombre || '',
      cliente_id: cliente.id,
      cif: cliente.cif_nif || '',
      telefono: cliente.telefono || cliente.movil || '',
      direccion: cliente.direccion || '',
      poblacion: cliente.poblacion || '',
      provincia: cliente.provincia || '',
      ubicacion: `${cliente.direccion || ''}, ${cliente.poblacion || ''}, ${cliente.provincia || ''}`
        .replace(/^,\s*|,\s*$/g, '')
        .replace(/,\s*,/g, ','),
    }))
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
            {datosMostrar.map(p => {
              const esClienteOficial = clientes.some(
                c => (c.nombre || '').toLowerCase().trim() === (p.grupo || '').toLowerCase().trim()
              )

              return (
              <VisitaCard
                key={p.id}
                p={p} 
                esClienteOficial={esClienteOficial}
                onEdit={async () => {
                  setEditandoId(p.id)

                  // Extraer objeciones y próximo contacto desde columnas dedicadas (fallback a notas antiguas)
                  const notas = p.notas || ''
                  let objeciones = p.objeciones_competencia || ''
                  let proximoContacto = p.proximo_contacto || ''
                  
                  if (!objeciones && notas) {
                    const matchObjeciones = notas.match(/OBJECIONES Y COMPETENCIA:\s*(.+?)(?=\n(?:Próximo Contacto|GPS|$))/is)
                    if (matchObjeciones) {
                      objeciones = matchObjeciones[1].trim()
                    }
                  }
                  
                  if (!proximoContacto && notas) {
                    const matchProximo = notas.match(/Próximo Contacto:\s*(\d{4}-\d{2}-\d{2})/)
                    if (matchProximo) {
                      proximoContacto = matchProximo[1]
                    }
                  }

                  const estado = p.status || p.interes || 'Medio'
                  
                  setNuevo({
                    ...p,
                    interes: estado,
                    objeciones_competencia: objeciones,
                    proximo_contacto: proximoContacto,
                    latitude: p.latitud || null,
                    longitude: p.longitud || null
                  })
                  // Reset selección de cliente en edición (se puede vincular después)
                  setClienteSeleccionado(null)
                  setBusquedaCliente(p.grupo || '')
                  setShowModal(true)
                }} 
                onDelete={async () => { if(window.confirm(`¿Borrar visita?`)) { await supabase.from('prospectos').delete().eq('id', p.id); cargarDatos() } }}
                onConvert={async () => {
                  if (window.confirm(`¿Convertir "${p.grupo}" en cliente oficial?`)) {
                    await convertirProspectoACliente(p)
                  }
                }}
                onAddPrograma={(programa) => crearProgramaParaProspecto(p.id, programa)}
              />
            )})}
            {datosMostrar.length === 0 && <div className="text-center py-20 text-slate-300 italic">Sin registros</div>}
          </div>
        </>
      )}

      {/* MODAL COMPLETO CON TODOS LOS CAMPOS */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xl flex items-end z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-[3.5rem] p-10 shadow-2xl overflow-y-auto max-h-[90vh]">
             <form
               onSubmit={async (e) => {
               e.preventDefault();

                 if (guardando) return

                 // Validación: el buscador (campo unificado) no puede estar vacío
                 if (!busquedaCliente || !busquedaCliente.trim()) {
                   alert('Debes indicar el nombre del grupo/cliente en el buscador antes de sincronizar.')
                   return
                 }

                 // Guardado directo sin pop-ups adicionales: la ubicación solo se guarda
                 // si el usuario pulsó explícitamente el botón de "Fijar Ubicación".
                 setGuardando(true)

                // ========= MAPEO REAL A LA TABLA `prospectos` =========
                // Nos aseguramos de que:
                // - El texto de la visita se guarde en la columna `notas`
                // - El ID de la visita sea siempre numérico al actualizar
                
                const status = nuevo.interes || 'Medio'

                const basePayload = {
                  grupo: nuevo.grupo || busquedaCliente || '',
                  contacto: nuevo.contacto || '',
                  telefono: nuevo.telefono || '',
                  interes: status,
                  notas: nuevo.notas || '',
                  ubicacion: nuevo.ubicacion || '',
                  fecha: nuevo.fecha,
                  cliente_id: nuevo.cliente_id,
                  cif: nuevo.cif || '',
                  direccion: nuevo.direccion || '',
                  poblacion: nuevo.poblacion || '',
                  provincia: nuevo.provincia || '',
                }
                
                const datosCompletos = {
                  ...basePayload,
                  status, // extraído del semáforo
                  objeciones_competencia: nuevo.objeciones_competencia || '',
                  proximo_contacto: nuevo.proximo_contacto || null,
                  latitud: nuevo.latitude,
                  longitud: nuevo.longitude,
                  check_in_at: nuevo.check_in_at || new Date().toISOString(),
                }
                
                // ========= USAR .upsert() BASADO EN ID (NUMÉRICO) =========
                const idNumerico = editandoId != null ? Number(editandoId) : null
                
                if (editandoId != null && (idNumerico === null || Number.isNaN(idNumerico))) {
                  setGuardando(false)
                  alert('El ID de la visita es inválido y no se puede guardar.')
                  return
                }

                const datosParaUpsert = editandoId != null
                  ? { ...datosCompletos, id: idNumerico }
                  : datosCompletos

                 const res = await supabase
                   .from('prospectos')
                   .upsert(datosParaUpsert, { onConflict: 'id' })

                 setGuardando(false)

                 if (!res.error) {
                   cerrarModal()
                   cargarDatos()
                 } else {
                   alert('Error al guardar: ' + res.error.message)
                 }
               }}
               className="space-y-4"
             >
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
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">Cliente / Grupo *</label>
                  <input 
                    placeholder="🔍 Escribe para buscar (ej: Llombai)..." 
                    className="w-full p-5 bg-slate-50 rounded-[1.5rem] font-bold" 
                    value={busquedaCliente} 
                    onChange={e => {
                      const valor = e.target.value
                      setBusquedaCliente(valor)
                      // El buscador es el ÚNICO origen de grupo
                      setNuevo({...nuevo, grupo: valor})
                      setMostrarSugerencias(true)
                      if (!valor) {
                        setClienteSeleccionado(null)
                        setNuevo({
                          ...nuevo,
                          cliente_id: null,
                          cif: '',
                          direccion: '',
                          poblacion: '',
                          provincia: '',
                          ubicacion: ''
                        })
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
                
                {/* UBICACIÓN GPS (acepta links de Google Maps) */}
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">
                    Ubicación GPS / Link de Google Maps
                  </label>
                  <input 
                    placeholder="Pega el link de Google Maps o escribe la dirección..." 
                    className="w-full p-5 bg-slate-50 rounded-[1.5rem] font-bold" 
                    value={nuevo.ubicacion} 
                    onChange={e => setNuevo({...nuevo, ubicacion: e.target.value})} 
                  />
                  <p className="text-[10px] text-slate-400 mt-1 italic">
                    💡 Puedes pegar el link que te envía el cliente por WhatsApp (ej: https://maps.google.com/...)
                  </p>

                  {/* BOTÓN DE CHECK-IN: FIJAR UBICACIÓN ACTUAL */}
                  <div className="mt-3">
                    <button
                      type="button"
                      disabled={checkinEstado === 'locating'}
                      onClick={async () => {
                        if (checkinEstado === 'locating') return
                        setCheckinEstado('locating')
                        try {
                          const geo = await new Promise((resolve) => {
                            if (!navigator.geolocation) {
                              resolve({ latitude: null, longitude: null, timestamp: null })
                              return
                            }
                            navigator.geolocation.getCurrentPosition(
                              (position) => {
                                resolve({
                                  latitude: position.coords.latitude,
                                  longitude: position.coords.longitude,
                                  timestamp: position.timestamp || Date.now(),
                                })
                              },
                              (error) => {
                                console.warn('Error obteniendo geolocalización (check-in manual):', error)
                                resolve({ latitude: null, longitude: null, timestamp: null })
                              },
                              { timeout: 5000, enableHighAccuracy: false }
                            )
                          })

                          setNuevo((prev) => ({
                            ...prev,
                            latitude: geo.latitude,
                            longitude: geo.longitude,
                            check_in_at: geo.timestamp ? new Date(geo.timestamp).toISOString() : prev.check_in_at,
                          }))

                          if (geo.latitude && geo.longitude) {
                            setCheckinEstado('captured')
                          } else {
                            setCheckinEstado('error')
                          }
                        } catch (err) {
                          console.warn('Error inesperado en check-in manual:', err)
                          setCheckinEstado('error')
                        }
                      }}
                      className={`w-full min-h-[60px] rounded-[1.5rem] font-black uppercase italic text-[10px] tracking-[0.18em] flex items-center justify-center gap-2 transition-all ${
                        checkinEstado === 'captured'
                          ? 'bg-emerald-600 text-white shadow-lg'
                          : checkinEstado === 'locating'
                          ? 'bg-slate-400 text-slate-100 cursor-wait'
                          : checkinEstado === 'error'
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-900 text-white hover:bg-blue-600'
                      }`}
                    >
                      <MapPin size={16} />
                      {checkinEstado === 'captured'
                        ? 'Ubicación Capturada ✓'
                        : checkinEstado === 'locating'
                        ? 'Localizando...'
                        : checkinEstado === 'error'
                        ? 'Error al Capturar. Reintentar'
                        : 'Fijar Ubicación Actual'}
                    </button>
                    {nuevo.latitude && nuevo.longitude && (
                      <p className="mt-1 text-[10px] text-slate-500">
                        Lat: {nuevo.latitude.toFixed(5)} · Lng: {nuevo.longitude.toFixed(5)}
                      </p>
                    )}
                  </div>
                </div>
                
                {/* SEMÁFORO DE INTERÉS - 3 BOTONES GRANDES */}
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 block">Nivel de Interés</label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setNuevo({...nuevo, interes: 'Alto'})}
                      className={`min-h-[60px] rounded-2xl font-black text-sm uppercase tracking-wider transition-all ${
                        nuevo.interes === 'Alto' 
                          ? 'bg-green-600 text-white shadow-lg scale-105' 
                          : 'bg-green-50 text-green-700 border-2 border-green-200 hover:bg-green-100'
                      }`}
                    >
                      🔥 Caliente
                    </button>
                    <button
                      type="button"
                      onClick={() => setNuevo({...nuevo, interes: 'Medio'})}
                      className={`min-h-[60px] rounded-2xl font-black text-sm uppercase tracking-wider transition-all ${
                        nuevo.interes === 'Medio' 
                          ? 'bg-yellow-500 text-white shadow-lg scale-105' 
                          : 'bg-yellow-50 text-yellow-700 border-2 border-yellow-200 hover:bg-yellow-100'
                      }`}
                    >
                      ⚡ Tibio
                    </button>
                    <button
                      type="button"
                      onClick={() => setNuevo({...nuevo, interes: 'Bajo'})}
                      className={`min-h-[60px] rounded-2xl font-black text-sm uppercase tracking-wider transition-all ${
                        nuevo.interes === 'Bajo' 
                          ? 'bg-red-600 text-white shadow-lg scale-105' 
                          : 'bg-red-50 text-red-700 border-2 border-red-200 hover:bg-red-100'
                      }`}
                    >
                      ❄️ Frío
                    </button>
                  </div>
                </div>
                
                {/* OBJECIONES Y COMPETENCIA */}
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">Objeciones y Competencia</label>
                  <textarea 
                    placeholder="Anota objeciones del cliente, competencia mencionada, puntos clave de la conversación..." 
                    className="w-full p-5 bg-slate-50 rounded-[1.5rem] h-32 font-medium" 
                    value={nuevo.objeciones_competencia} 
                    onChange={e => setNuevo({...nuevo, objeciones_competencia: e.target.value})} 
                  />
                </div>
                
                {/* PRÓXIMO CONTACTO */}
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block flex items-center gap-2">
                    Próximo Contacto
                    {nuevo.proximo_contacto && new Date(nuevo.proximo_contacto) < new Date() && (
                      <span className="flex items-center gap-1 text-red-600 text-[10px]">
                        <AlertCircle size={12}/> Fecha pasada
                      </span>
                    )}
                  </label>
                  <input 
                    type="date" 
                    className={`w-full p-5 rounded-[1.5rem] font-bold ${
                      nuevo.proximo_contacto && new Date(nuevo.proximo_contacto) < new Date()
                        ? 'bg-red-50 border-2 border-red-300 text-red-700'
                        : 'bg-slate-50'
                    }`}
                    value={nuevo.proximo_contacto} 
                    onChange={e => setNuevo({...nuevo, proximo_contacto: e.target.value})} 
                  />
                  {nuevo.proximo_contacto && new Date(nuevo.proximo_contacto) < new Date() && (
                    <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                      <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5"/>
                      <p className="text-xs text-red-700 font-medium">
                        ⚠️ La fecha de próximo contacto es anterior a hoy. Revisa si es correcta.
                      </p>
                    </div>
                  )}
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
                
                <button
                  type="submit"
                  disabled={guardando}
                  className={`w-full py-6 rounded-[2rem] font-black uppercase italic shadow-xl transition-all min-h-[60px] ${
                    guardando
                      ? 'bg-slate-400 text-slate-100 cursor-wait'
                      : 'bg-slate-900 text-white hover:bg-blue-600'
                  }`}
                >
                  {guardando ? 'Obteniendo ubicación...' : 'Sincronizar'}
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

const VisitaCard = ({ p, esClienteOficial, onEdit, onDelete, onConvert, onAddPrograma }) => {
  // Obtener datos para acciones rápidas
  const rawTelefono = p.telefono || p.movil || p.telefono_contacto || ''
  const telefonoParaLlamar = String(rawTelefono).trim()
  
  // Construir texto de búsqueda para el mapa combinando nombre + localidad
  const partesDireccion = [
    p.grupo || '',
    p.poblacion || '',
    p.provincia || '',
  ]
    .map(x => (x || '').trim())
    .filter(Boolean)
  
  const textoLocalidad = partesDireccion.join(', ')
  const direccionLibre = p.ubicacion || p.direccion || ''
  
  const direccionParaMapa = direccionLibre || textoLocalidad
  
  // Detectar si es un link de Google Maps o una dirección normal
  const esLinkGoogleMaps = direccionParaMapa && (
    direccionParaMapa.startsWith('http://') || 
    direccionParaMapa.startsWith('https://') ||
    direccionParaMapa.includes('maps.google.com') ||
    direccionParaMapa.includes('goo.gl/maps') ||
    direccionParaMapa.includes('maps.app.goo.gl')
  )
  
  // Construir URL del mapa: si es link directo, usarlo; si no, buscar por query (ej: "Rocafort, Valencia")
  const urlMapa = direccionParaMapa 
    ? (esLinkGoogleMaps 
        ? direccionParaMapa 
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccionParaMapa)}`)
    : '#'
  
  // Programas presentados (CRM avanzado)
  const programas = Array.isArray(p.programas_presentados) ? p.programas_presentados : []
  const [nuevoPrograma, setNuevoPrograma] = useState({
    destino: '',
    fechas: '',
    estado: 'Pendiente',
    explicacion: '',
    imagen: '',
  })
  const [guardandoPrograma, setGuardandoPrograma] = useState(false)

  const handleGuardarPrograma = async (e) => {
    e.preventDefault()
    if (!onAddPrograma) return
    if (!nuevoPrograma.destino && !nuevoPrograma.explicacion) {
      alert('Añade al menos un destino o una explicación para guardar el programa.')
      return
    }
    setGuardandoPrograma(true)
    try {
      await onAddPrograma(nuevoPrograma)
      // Reset del formulario tras guardar
      setNuevoPrograma({
        destino: '',
        fechas: '',
        estado: 'Pendiente',
        explicacion: '',
        imagen: '',
      })
    } finally {
      setGuardandoPrograma(false)
    }
  }
  
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
      {esClienteOficial && (
        <span className="inline-block text-[9px] font-black px-3 py-1 rounded-full uppercase bg-green-50 text-green-600 tracking-tighter mb-2">
          Cliente Existente
        </span>
      )}
    <p className="text-sm text-slate-400 mb-6 font-medium leading-relaxed">{p.notas || 'Sin anotaciones'}</p>
    
      {/* PROGRAMAS PRESENTADOS */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
            Programas Presentados
          </h4>
          <span className="text-[10px] text-slate-400 font-medium">
            {programas.length === 0 ? 'Sin programas' : `${programas.length} programa(s)`}
          </span>
        </div>
        <div className="space-y-3">
          {programas.length === 0 && (
            <div className="border border-dashed border-slate-200 rounded-2xl p-4 text-[11px] text-slate-400 italic bg-slate-50">
              Aún no hay programas registrados para este prospecto. Añádelos desde el panel de edición.
            </div>
          )}
          {programas.map((prog, idx) => (
            <div
              key={idx}
              className="border border-slate-100 rounded-2xl p-4 bg-slate-50 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-slate-800">
                    {prog.destino || 'Destino sin definir'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {prog.fechas || 'Fechas pendientes'}
                  </p>
                </div>
                <span
                  className={
                    'inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ' +
                    (prog.estado === 'Confirmado'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : prog.estado === 'Revision'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-slate-50 text-slate-500 border border-slate-200')
                  }
                >
                  {prog.estado || 'Pendiente'}
                </span>
              </div>
              {prog.explicacion && (
                <p className="text-[11px] text-slate-600 leading-snug">
                  {prog.explicacion}
                </p>
              )}
              {prog.imagen && (
                <div className="mt-1">
                  <img
                    src={prog.imagen}
                    alt="Captura programa"
                    className="w-full rounded-xl border border-slate-200 object-cover max-h-40"
                  />
                </div>
              )}
            </div>
          ))}
          
          {/* Formulario rápido para añadir un nuevo programa */}
          <form
            onSubmit={handleGuardarPrograma}
            className="border border-slate-200 rounded-2xl p-4 bg-white space-y-3"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">
                  Destino
                </label>
                <input
                  type="text"
                  value={nuevoPrograma.destino}
                  onChange={(e) => setNuevoPrograma(prev => ({ ...prev, destino: e.target.value }))}
                  placeholder="Ej: Galicia"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">
                  Fechas
                </label>
                <input
                  type="text"
                  value={nuevoPrograma.fechas}
                  onChange={(e) => setNuevoPrograma(prev => ({ ...prev, fechas: e.target.value }))}
                  placeholder="Ej: 25-30 Octubre"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">
                  Estado
                </label>
                <select
                  value={nuevoPrograma.estado}
                  onChange={(e) => setNuevoPrograma(prev => ({ ...prev, estado: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="Pendiente">Pendiente</option>
                  <option value="Revision">Revisión</option>
                  <option value="Confirmado">Confirmado</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">
                Explicación del Viaje
              </label>
              <textarea
                value={nuevoPrograma.explicacion}
                onChange={(e) => setNuevoPrograma(prev => ({ ...prev, explicacion: e.target.value }))}
                placeholder="Describe brevemente el programa presentado al cliente..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs h-20 resize-vertical focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">
                URL de Captura / Imagen
              </label>
              <input
                type="text"
                value={nuevoPrograma.imagen}
                onChange={(e) => setNuevoPrograma(prev => ({ ...prev, imagen: e.target.value }))}
                placeholder="Pega aquí la URL de la captura o imagen del programa"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={guardandoPrograma}
                className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-[0.18em] ${
                  guardandoPrograma
                    ? 'bg-slate-300 text-slate-500 cursor-wait'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {guardandoPrograma ? 'Guardando...' : 'Añadir Programa'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* BOTÓN LLAMAR - enlace directo tel: sin condiciones que lo bloqueen */}
        <a 
          href={`tel:${telefonoParaLlamar}`}
          className="bg-slate-900 text-white py-4 rounded-2xl flex flex-col justify-center gap-1 font-black text-[9px] items-center italic uppercase tracking-widest hover:bg-slate-800 transition-all min-h-[60px]"
        >
          <Phone size={16}/> LLAMAR
        </a>
        
        {/* BOTÓN MAPA */}
        {direccionParaMapa ? (
          <button 
            onClick={() => window.open(urlMapa, '_blank')}
            className="bg-blue-600 text-white py-4 rounded-2xl flex flex-col justify-center gap-1 font-black text-[9px] items-center italic uppercase shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all min-h-[60px]"
          >
            <Navigation size={16}/> MAPA
          </button>
        ) : (
          <button disabled className="bg-slate-300 text-white py-4 rounded-2xl flex flex-col justify-center gap-1 font-black text-[9px] items-center italic uppercase min-h-[60px]">
            <Navigation size={16}/> MAPA
          </button>
        )}
      </div>
      {!esClienteOficial && (
        <button
          onClick={onConvert}
          className="mt-4 w-full bg-white text-blue-600 border border-blue-200 py-3 rounded-2xl flex justify-center gap-2 font-black text-[10px] items-center italic uppercase hover:bg-blue-50 transition-all"
        >
          <UserPlus size={14}/> Convertir a Cliente
        </button>
      )}
  </div>
)
}

export default CRM