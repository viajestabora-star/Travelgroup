import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { X, Phone, Navigation } from 'lucide-react'

// Nombres de prueba a eliminar (ajustar según datos a conservar)
const NOMBRES_PRUEBA_ELIMINAR = ['Rocafort', 'Alzira', 'Llombai']

const CRM = () => {
  // Estados principales
  const [activeTab, setActiveTab] = useState('calendario') // calendario | proximas | historial | estadisticas
  const [prospectos, setProspectos] = useState([])
  const [clientes, setClientes] = useState([])
  const [visitas, setVisitas] = useState([])
  const [loading, setLoading] = useState(true)

  // Estados del panel lateral
  const [prospectoSelected, setProspectoSelected] = useState(null)
  const [showPanel, setShowPanel] = useState(false)
  const [fichaTab, setFichaTab] = useState('datos') // datos | historial | programas
  
  // Estados del calendario
  const [currentDate, setCurrentDate] = useState(new Date())
  const [showAgendaModal, setShowAgendaModal] = useState(false)
  const [fechaSeleccionada, setFechaSeleccionada] = useState('')
  
  // Estados del modal de agenda
  const [agendaProspectoId, setAgendaProspectoId] = useState('')
  const [agendaComentario, setAgendaComentario] = useState('')
  
  // Estados para nueva visita en panel
  const [nuevaVisita, setNuevaVisita] = useState({
    fecha: new Date().toISOString().split('T')[0],
    comentario: ''
  })
  
  // Visitas del prospecto seleccionado
  const [visitasProspecto, setVisitasProspecto] = useState([])

  // Cargar datos iniciales
  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [prospectosRes, clientesRes, visitasRes] = await Promise.all([
        supabase.from('prospectos').select('*').order('grupo', { ascending: true }),
        supabase.from('clientes').select('*').order('nombre', { ascending: true }),
        supabase.from('visitas').select('*').order('fecha', { ascending: false })
      ])
      
      if (!prospectosRes.error) setProspectos(prospectosRes.data || [])
      if (!clientesRes.error) setClientes(clientesRes.data || [])
      if (!visitasRes.error) setVisitas(visitasRes.data || [])
    } catch (err) {
      console.error('Error cargando datos:', err)
    } finally {
      setLoading(false)
    }
  }

  // Comprobar si un prospecto existe ya como cliente (por nombre/grupo)
  const esCliente = useMemo(() => {
    const nombresClientes = new Set(
      (clientes || []).map(c => String(c.nombre || '').trim().toLowerCase()).filter(Boolean)
    )
    return (prospecto) => {
      const grupo = String(prospecto?.grupo || '').trim().toLowerCase()
      return grupo && nombresClientes.has(grupo)
    }
  }, [clientes])

  // Lista unificada para el desplegable: clientes + prospectos
  const listadoUnificado = useMemo(() => {
    const items = []
    ;(clientes || []).forEach(c => {
      items.push({
        tipo: 'cliente',
        id: c.id,
        value: `cliente-${c.id}`,
        nombre: c.nombre || 'Sin nombre',
        poblacion: c.poblacion || c.provincia || ''
      })
    })
    ;(prospectos || []).forEach(p => {
      items.push({
        tipo: 'prospecto',
        id: p.id,
        value: `prospecto-${p.id}`,
        nombre: p.grupo || 'Sin nombre',
        poblacion: p.poblacion || p.provincia || ''
      })
    })
    return items.sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [clientes, prospectos])

  const limpiarDatosPrueba = async () => {
    if (!window.confirm(`¿Borrar prospectos de prueba (${NOMBRES_PRUEBA_ELIMINAR.join(', ')})?`)) return
    try {
      const { data } = await supabase.from('prospectos').select('id, grupo')
      const aBorrar = (data || []).filter(p =>
        NOMBRES_PRUEBA_ELIMINAR.some(
          n => String(p.grupo || '').trim().toLowerCase() === n.trim().toLowerCase()
        )
      )
      if (aBorrar.length === 0) {
        alert('No hay prospectos de prueba que borrar.')
        return
      }
      for (const p of aBorrar) {
        await supabase.from('visitas').delete().eq('prospecto_id', p.id)
        await supabase.from('prospectos').delete().eq('id', p.id)
      }
      await fetchData()
      alert(`✅ ${aBorrar.length} prospecto(s) de prueba eliminados.`)
    } catch (err) {
      console.error('Error limpiando datos de prueba:', err)
      alert('Error al limpiar datos de prueba.')
    }
  }

  // Filtrar prospectos según pestaña activa
  const hoyStr = new Date().toISOString().split('T')[0]
  
  const prospectosFiltrados = useMemo(() => {
    if (activeTab === 'proximas') {
      return prospectos.filter(p => {
        const fecha = p.proxima_visita || p.fecha
        return fecha && fecha >= hoyStr
      }).sort((a, b) => {
        const fechaA = a.proxima_visita || a.fecha || ''
        const fechaB = b.proxima_visita || b.fecha || ''
        return fechaA.localeCompare(fechaB)
      })
    } else if (activeTab === 'historial') {
      return prospectos.filter(p => {
        const fecha = p.ultima_visita_realizada || p.fecha
        return fecha && fecha < hoyStr
      }).sort((a, b) => {
        const fechaA = a.ultima_visita_realizada || a.fecha || ''
        const fechaB = b.ultima_visita_realizada || b.fecha || ''
        return fechaB.localeCompare(fechaA)
      })
    }
    return []
  }, [prospectos, activeTab, hoyStr])

  // Abrir ficha del prospecto
  const abrirFicha = async (prospecto) => {
    if (!prospecto?.id) {
      alert('Error: Prospecto sin ID')
        return
      }

    const normalizado = {
      ...prospecto,
      programas_presentados: Array.isArray(prospecto.programas_presentados)
        ? prospecto.programas_presentados
        : []
    }

    setProspectoSelected(normalizado)
    setFichaTab('datos')
    setShowPanel(true)
    
    // Cargar visitas del prospecto
    const { data } = await supabase
      .from('visitas')
      .select('*')
      .eq('prospecto_id', prospecto.id)
      .order('fecha', { ascending: false })
    
    setVisitasProspecto(data || [])
  }

  const cerrarFicha = () => {
    setShowPanel(false)
    setProspectoSelected(null)
    setVisitasProspecto([])
  }

  // Guardar cambios del prospecto
  const handleSave = async () => {
    if (!prospectoSelected) {
      alert('Error: No hay prospecto seleccionado')
      return
    }

    // Si es un prospecto nuevo (sin ID), hacer INSERT
    if (!prospectoSelected.id) {
      const { data, error } = await supabase
        .from('prospectos')
        .insert(prospectoSelected)
        .select()
        .single()

      if (error) {
        alert('Error al crear prospecto: ' + error.message)
      } else {
        alert('¡Prospecto creado con éxito!')
        await fetchData()
        // Actualizar el prospecto seleccionado con el ID recién creado
        if (data) {
          setProspectoSelected({
            ...data,
            programas_presentados: Array.isArray(data.programas_presentados) ? data.programas_presentados : []
          })
        }
      }
    } else {
      // Si tiene ID, hacer UPDATE
      const { error } = await supabase
        .from('prospectos')
        .update(prospectoSelected)
        .eq('id', prospectoSelected.id)

      if (error) {
        alert('Error al guardar: ' + error.message)
      } else {
        alert('¡Guardado con éxito!')
        await fetchData()
        // Actualizar el prospecto seleccionado con los datos frescos
        const { data } = await supabase
          .from('prospectos')
          .select('*')
          .eq('id', prospectoSelected.id)
          .single()
        if (data) {
          setProspectoSelected({
            ...data,
            programas_presentados: Array.isArray(data.programas_presentados) ? data.programas_presentados : []
          })
        }
      }
    }
  }

  // Actualizar campo del prospecto
  const updateField = (field, value) => {
    setProspectoSelected(prev => prev ? { ...prev, [field]: value } : prev)
  }

  // Registrar nueva visita desde panel
  const registrarVisita = async () => {
    if (!prospectoSelected?.id) {
      alert('Error: No hay ID de prospecto')
        return
      }

    const { error } = await supabase.from('visitas').insert({
      prospecto_id: prospectoSelected.id,
      fecha: nuevaVisita.fecha,
      comentario: nuevaVisita.comentario
    })

      if (error) {
      alert('Error al registrar visita: ' + error.message)
    } else {
      await fetchData()
      const { data } = await supabase
        .from('visitas')
        .select('*')
        .eq('prospecto_id', prospectoSelected.id)
        .order('fecha', { ascending: false })
      setVisitasProspecto(data || [])
      setNuevaVisita({ fecha: new Date().toISOString().split('T')[0], comentario: '' })
      alert('Visita registrada con éxito')
    }
  }

  // Agendar visita desde calendario
  const abrirAgendaModal = (fecha) => {
    setFechaSeleccionada(fecha)
    setAgendaProspectoId('')
    setAgendaComentario('')
    setShowAgendaModal(true)
  }

  const handleProspectoChange = (value) => {
    if (value === 'nuevo') {
      setShowAgendaModal(false)
      setProspectoSelected({
        grupo: '',
        cif: '',
        telefono: '',
        responsable: '',
        direccion: '',
        poblacion: '',
        provincia: '',
        ubicacion: '',
        notas: '',
        notas_comerciales: '',
        estado_comercial: 'POTENCIAL',
        es_cliente: false,
        proxima_visita: fechaSeleccionada,
        fecha: fechaSeleccionada,
        programas_presentados: []
      })
      setFichaTab('datos')
      setShowPanel(true)
      setVisitasProspecto([])
    } else {
      setAgendaProspectoId(value)
    }
  }

  const guardarVisitaDesdeCalendario = async () => {
    if (!agendaProspectoId) {
      alert('Selecciona un prospecto, cliente o crea uno nuevo')
      return
    }

    let prospectoIdFinal = null

    if (agendaProspectoId.startsWith('cliente-')) {
      const clienteId = Number(agendaProspectoId.replace('cliente-', ''))
      const cliente = clientes.find(c => c.id === clienteId)
      if (!cliente) {
        alert('Cliente no encontrado')
        return
      }
      const nombreNorm = String(cliente.nombre || '').trim()
      const existente = prospectos.find(
        p => String(p.grupo || '').trim().toLowerCase() === nombreNorm.toLowerCase()
      )
      if (existente) {
        prospectoIdFinal = existente.id
      } else {
        const { data: nuevoPros, error: errPros } = await supabase
          .from('prospectos')
          .insert({
            grupo: nombreNorm,
            telefono: cliente.movil || cliente.telefono || '',
            poblacion: cliente.poblacion || '',
            provincia: cliente.provincia || '',
            estado_comercial: 'CLIENTE'
          })
          .select()
          .single()
        if (errPros || !nuevoPros) {
          alert('Error al crear prospecto desde cliente: ' + (errPros?.message || 'Error'))
          return
        }
        prospectoIdFinal = nuevoPros.id
      }
    } else if (agendaProspectoId.startsWith('prospecto-')) {
      prospectoIdFinal = Number(agendaProspectoId.replace('prospecto-', ''))
    } else {
      prospectoIdFinal = Number(agendaProspectoId)
    }

    const { error } = await supabase.from('visitas').insert({
      prospecto_id: prospectoIdFinal,
      fecha: fechaSeleccionada,
      comentario: agendaComentario
    })

    if (error) {
      alert('Error al agendar visita: ' + error.message)
    } else {
      await supabase
        .from('prospectos')
        .update({ proxima_visita: fechaSeleccionada })
        .eq('id', prospectoIdFinal)

      await fetchData()
      setShowAgendaModal(false)
      setAgendaProspectoId('')
      setAgendaComentario('')
      alert('Visita agendada con éxito')
    }
  }

  // CRUD de programas
  const addPrograma = () => {
    setProspectoSelected(prev => {
      if (!prev) return prev
      const programas = Array.isArray(prev.programas_presentados) ? [...prev.programas_presentados] : []
      programas.push({ destino: '', fechas: '', estado: 'Pendiente', imagen: '', explicacion: '' })
      return { ...prev, programas_presentados: programas }
    })
  }

  const updatePrograma = (index, field, value) => {
    setProspectoSelected(prev => {
      if (!prev) return prev
      const programas = [...(prev.programas_presentados || [])]
      programas[index] = { ...programas[index], [field]: value }
      return { ...prev, programas_presentados: programas }
    })
  }

  const removePrograma = (index) => {
    setProspectoSelected(prev => {
      if (!prev) return prev
      const programas = [...(prev.programas_presentados || [])]
      programas.splice(index, 1)
      return { ...prev, programas_presentados: programas }
    })
  }

  // Renderizar calendario
  const renderCalendar = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const offset = firstDay === 0 ? 6 : firstDay - 1
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const cells = []
    
    // Días vacíos al inicio
    for (let i = 0; i < offset; i++) {
      cells.push(<div key={`empty-${i}`} className="h-20" />)
    }

    // Días del mes
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const visitasDia = visitas.filter(v => v.fecha === dateStr)
      const prospectosDia = prospectos.filter(p => p.proxima_visita === dateStr || p.fecha === dateStr)

      cells.push(
        <div
          key={day}
          className="min-h-[80px] p-2 rounded-xl border border-slate-200 bg-white hover:border-slate-400 cursor-pointer transition"
          onClick={() => abrirAgendaModal(dateStr)}
        >
          <div className="text-xs font-bold text-slate-700 mb-1">{day}</div>
          <div className="space-y-1">
            {prospectosDia.slice(0, 2).map(p => {
              const esClie = esCliente(p)
              return (
                <div
                  key={p.id}
                  className={`text-[9px] px-1.5 py-0.5 rounded truncate ${
                    esClie ? 'bg-blue-50 border border-blue-200' : 'bg-[#fffbeb] border border-[#fef3c7]'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    abrirFicha(p)
                  }}
                >
                  {esClie ? '⭐ ' : '💼 '}{p.grupo || 'Sin nombre'}
                </div>
              )
            })}
            {prospectosDia.length > 2 && (
              <div className="text-[9px] text-slate-400">+{prospectosDia.length - 2}</div>
            )}
          </div>
        </div>
      )
    }

    return cells
  }

  // Estadísticas
  const estadisticas = useMemo(() => {
    const totalProspectos = prospectos.length
    const visitasRealizadas = visitas.filter(v => v.fecha < hoyStr).length
    const visitasPendientes = visitas.filter(v => v.fecha >= hoyStr).length
    
    return { totalProspectos, visitasRealizadas, visitasPendientes }
  }, [prospectos, visitas, hoyStr])

  // Borrar prospecto
  const borrarProspecto = async () => {
    if (!prospectoSelected?.id) return
    if (!window.confirm('¿Estás seguro de borrar este prospecto? Esta acción no se puede deshacer.')) return

    const { error } = await supabase
      .from('prospectos')
      .delete()
      .eq('id', prospectoSelected.id)

    if (error) {
      alert('Error al borrar: ' + error.message)
    } else {
      cerrarFicha()
      await fetchData()
      alert('Prospecto borrado con éxito')
    }
  }

  return (
    <div className="flex h-screen bg-slate-50">
      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* PESTAÑAS PRINCIPALES */}
        <div className="flex gap-2 mb-6 items-center">
          <div className="flex gap-2 flex-1 bg-white p-2 rounded-2xl shadow-sm border">
            {[
              { key: 'calendario', label: 'Calendario' },
              { key: 'proximas', label: 'Próximas' },
              { key: 'historial', label: 'Historial' },
              { key: 'estadisticas', label: 'Estadísticas' }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
                  activeTab === tab.key
                    ? 'bg-[#0f172a] text-white shadow-lg'
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            onClick={limpiarDatosPrueba}
            className="px-3 py-2 rounded-xl text-[10px] font-bold bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 border border-slate-200"
          >
            Limpiar pruebas
          </button>
        </div>

        {loading && (
          <div className="text-center py-12 text-slate-400">Cargando...</div>
        )}

        {/* VISTA: CALENDARIO */}
        {activeTab === 'calendario' && !loading && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border">
            <div className="flex items-center justify-between mb-4">
                <div>
                <div className="text-xs font-bold uppercase text-slate-400">Calendario de Visitas</div>
                <div className="text-sm text-slate-700">
                  {currentDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}
                  </div>
                  </div>
              <div className="flex gap-2">
                  <button
                  onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
                  className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50"
                  >
                    ‹
                  </button>
                  <button
                  onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
                  className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50"
                  >
                    ›
                  </button>
                </div>
              </div>
            <div className="grid grid-cols-7 gap-2 mb-2">
              {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                <div key={d} className="text-center text-xs font-bold text-slate-400 py-2">
                    {d}
                  </div>
                ))}
              </div>
            <div className="grid grid-cols-7 gap-2">{renderCalendar()}</div>
                </div>
              )}

        {/* VISTA: PRÓXIMAS */}
        {activeTab === 'proximas' && !loading && (
          <div className="space-y-3">
            {prospectosFiltrados.length === 0 ? (
              <div className="text-center py-12 text-slate-400">No hay visitas próximas</div>
            ) : (
              prospectosFiltrados.map(p => {
                const esClie = esCliente(p)
                return (
                  <button
                    key={p.id}
                    onClick={() => abrirFicha(p)}
                    className={`w-full text-left p-4 rounded-2xl hover:shadow-md transition flex items-center justify-between ${
                      esClie ? 'bg-blue-50 border border-blue-200' : 'bg-[#fffbeb] border border-[#fef3c7]'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-slate-900">
                        {esClie ? '⭐ ' : '💼 '}{p.grupo || 'Sin nombre'}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        {p.proxima_visita || p.fecha} • {p.poblacion || p.provincia || 'Localidad no definida'}
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${
                      esClie ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'
                    }`}>
                      {esClie ? 'CLIENTE' : (p.estado_comercial || 'POTENCIAL')}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        )}

        {/* VISTA: HISTORIAL */}
        {activeTab === 'historial' && !loading && (
          <div className="space-y-3">
            {prospectosFiltrados.length === 0 ? (
              <div className="text-center py-12 text-slate-400">No hay visitas en el historial</div>
            ) : (
              <>
                {prospectosFiltrados.map(p => {
                  const esClie = esCliente(p)
                  return (
                    <button
                      key={p.id}
                      onClick={() => abrirFicha(p)}
                      className={`w-full text-left p-4 rounded-2xl hover:shadow-md transition flex items-center justify-between ${
                        esClie ? 'bg-blue-50 border border-blue-200' : 'bg-[#fffbeb] border border-[#fef3c7]'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-slate-900">
                          {esClie ? '⭐ ' : '💼 '}{p.grupo || 'Sin nombre'}
                        </div>
                        <div className="text-xs text-slate-600 mt-1">
                          {p.ultima_visita_realizada || p.fecha} • {p.poblacion || p.provincia || 'Localidad no definida'}
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${
                        esClie ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'
                      }`}>
                        {esClie ? 'CLIENTE' : (p.estado_comercial || 'POTENCIAL')}
                      </span>
                    </button>
                  )
                })}
              </>
            )}
        </div>
        )}

        {/* VISTA: ESTADÍSTICAS */}
        {activeTab === 'estadisticas' && !loading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-2xl shadow-sm border">
              <div className="text-xs font-bold uppercase text-slate-400 mb-2">Total Prospectos</div>
              <div className="text-3xl font-black text-slate-900">{estadisticas.totalProspectos}</div>
                </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border">
              <div className="text-xs font-bold uppercase text-slate-400 mb-2">Visitas Realizadas</div>
              <div className="text-3xl font-black text-slate-900">{estadisticas.visitasRealizadas}</div>
              </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border">
              <div className="text-xs font-bold uppercase text-slate-400 mb-2">Visitas Pendientes</div>
              <div className="text-3xl font-black text-slate-900">{estadisticas.visitasPendientes}</div>
              </div>
            </div>
          )}
        </div>

      {/* PANEL LATERAL */}
      {showPanel && prospectoSelected && (
        <div className="w-full max-w-md border-l border-slate-200 bg-white h-full flex flex-col shadow-xl">
          {/* HEADER */}
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400 font-mono">
                {prospectoSelected.id ? `ID: ${prospectoSelected.id}` : 'NUEVO PROSPECTO'}
              </div>
              <h2 className="text-lg font-black text-slate-900">{prospectoSelected.grupo || 'Ficha de Prospecto'}</h2>
              </div>
            <div className="flex gap-2">
              {prospectoSelected.id && (
                <button
                  onClick={borrarProspecto}
                  className="p-2 rounded-full hover:bg-red-50 text-red-500 border border-red-100"
                >
                  🗑
                </button>
              )}
              <button onClick={cerrarFicha} className="p-2 rounded-full hover:bg-slate-100 text-slate-500">
                <X size={18} />
              </button>
                </div>
                </div>
                
          {/* SUB-PESTAÑAS */}
          <div className="flex gap-2 px-5 pt-4 border-b border-slate-200">
            {['datos', 'historial', 'programas'].map(tab => (
                        <button
                key={tab}
                onClick={() => setFichaTab(tab)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${
                  fichaTab === tab
                    ? 'bg-[#0f172a] text-white'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {tab === 'datos' ? 'Datos' : tab === 'historial' ? 'Historial' : 'Programas'}
                        </button>
            ))}
                </div>
                
          {/* CONTENIDO DEL PANEL */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
            {/* PESTAÑA: DATOS */}
            {fichaTab === 'datos' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Grupo / Cliente</label>
                  <input 
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    value={prospectoSelected.grupo || ''}
                    onChange={(e) => updateField('grupo', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">CIF / NIF</label>
                  <input 
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      value={prospectoSelected.cif || ''}
                      onChange={(e) => updateField('cif', e.target.value)}
                  />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Teléfono</label>
                  <input 
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      value={prospectoSelected.telefono || ''}
                      onChange={(e) => updateField('telefono', e.target.value)}
                  />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Responsable</label>
                  <input 
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      value={prospectoSelected.responsable || ''}
                      onChange={(e) => updateField('responsable', e.target.value)}
                    />
                  </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Dirección</label>
                  <input 
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    value={prospectoSelected.direccion || ''}
                    onChange={(e) => updateField('direccion', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Población</label>
                  <input 
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      value={prospectoSelected.poblacion || ''}
                      onChange={(e) => updateField('poblacion', e.target.value)}
                  />
          </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Provincia</label>
                  <input 
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      value={prospectoSelected.provincia || ''}
                      onChange={(e) => updateField('provincia', e.target.value)}
                    />
        </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Ubicación / Google Maps</label>
                  <input 
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    value={prospectoSelected.ubicacion || ''}
                    onChange={(e) => updateField('ubicacion', e.target.value)}
                  />
      </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Notas Comerciales</label>
                  <textarea 
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm min-h-[80px]"
                    value={prospectoSelected.notas || prospectoSelected.notas_comerciales || ''}
                    onChange={(e) => {
                      updateField('notas', e.target.value)
                      updateField('notas_comerciales', e.target.value)
                    }}
                  />
    </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Estado Comercial</label>
                  <select
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    value={prospectoSelected.estado_comercial || 'POTENCIAL'}
                    onChange={(e) => updateField('estado_comercial', e.target.value)}
                  >
                    <option value="CLIENTE">CLIENTE</option>
                    <option value="POTENCIAL">POTENCIAL</option>
                    <option value="DESCARTAR">DESCARTAR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Próxima Visita</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    value={prospectoSelected.proxima_visita || ''}
                    onChange={(e) => updateField('proxima_visita', e.target.value)}
                  />
                </div>
                {/* BOTONES DE ACCIÓN */}
                <div className="flex gap-2 pt-2">
                  {prospectoSelected.telefono && (
                    <a
                      href={`tel:${prospectoSelected.telefono}`}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[#0f172a] text-white text-xs font-bold"
                    >
                      <Phone size={14} /> Llamar
                    </a>
                  )}
                  {prospectoSelected.ubicacion && (
                    <button
                      onClick={() => {
                        const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(prospectoSelected.ubicacion)}`
                        window.open(url, '_blank')
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold"
                    >
                      <Navigation size={14} /> Mapa
                    </button>
                    )}
                  </div>
                </div>
            )}
    
            {/* PESTAÑA: HISTORIAL */}
            {fichaTab === 'historial' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">Registrar Nueva Visita</h3>
                    <button
                    onClick={registrarVisita}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#0f172a] text-white"
                  >
                    + Registrar
                    </button>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Fecha de Visita</label>
                    <input
                      type="date"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      value={nuevaVisita.fecha}
                    onChange={(e) => setNuevaVisita(prev => ({ ...prev, fecha: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Comentario</label>
                  <textarea 
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm min-h-[80px]"
                    value={nuevaVisita.comentario}
                    onChange={(e) => setNuevaVisita(prev => ({ ...prev, comentario: e.target.value }))}
                  />
                </div>
                <div className="border-t border-slate-200 pt-4">
                  <h4 className="text-xs font-bold uppercase text-slate-400 mb-3">Visitas Registradas</h4>
                  {visitasProspecto.length === 0 ? (
                    <div className="text-xs text-slate-400 italic">No hay visitas registradas</div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {visitasProspecto.map(v => (
                        <div key={v.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                          <div className="text-xs font-mono text-slate-500 mb-1">{v.fecha}</div>
                          <div className="text-xs text-slate-700 whitespace-pre-line">{v.comentario || 'Sin comentario'}</div>
    </div>
                      ))}
      </div>
                  )}
    </div>
              </div>
            )}
    
            {/* PESTAÑA: PROGRAMAS */}
            {fichaTab === 'programas' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">Programas Presentados</h3>
                <button
                  onClick={addPrograma}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 text-white"
                >
                    + Añadir
                </button>
        </div>
                {(!prospectoSelected.programas_presentados || prospectoSelected.programas_presentados.length === 0) && (
                  <div className="text-xs text-slate-400 italic">No hay programas registrados</div>
                )}
              <div className="space-y-3">
                {Array.isArray(prospectoSelected.programas_presentados) &&
                  prospectoSelected.programas_presentados.map((prog, idx) => (
                      <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-500">Programa #{idx + 1}</span>
                        <button
                          onClick={() => removePrograma(idx)}
                            className="text-xs text-red-500 hover:text-red-700"
                        >
                          Quitar
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
              <div>
                            <label className="block text-[10px] text-slate-500 mb-1">Destino</label>
                <input
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs"
                            value={prog.destino || ''}
                              onChange={(e) => updatePrograma(idx, 'destino', e.target.value)}
                />
              </div>
              <div>
                            <label className="block text-[10px] text-slate-500 mb-1">Fechas</label>
                <input
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs"
                            value={prog.fechas || ''}
                              onChange={(e) => updatePrograma(idx, 'fechas', e.target.value)}
                />
              </div>
                      </div>
              <div>
                          <label className="block text-[10px] text-slate-500 mb-1">Estado</label>
                <select
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs"
                            value={prog.estado || 'Pendiente'}
                            onChange={(e) => updatePrograma(idx, 'estado', e.target.value)}
                >
                  <option value="Pendiente">Pendiente</option>
                            <option value="Revisión">Revisión</option>
                  <option value="Confirmado">Confirmado</option>
                </select>
            </div>
            <div>
                          <label className="block text-[10px] text-slate-500 mb-1">URL Imagen</label>
                          <input
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs"
                            value={prog.imagen || ''}
                            onChange={(e) => updatePrograma(idx, 'imagen', e.target.value)}
                          />
            </div>
            <div>
                          <label className="block text-[10px] text-slate-500 mb-1">Explicación</label>
                        <textarea
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs min-h-[60px]"
                          value={prog.explicacion || ''}
                            onChange={(e) => updatePrograma(idx, 'explicacion', e.target.value)}
              />
            </div>
            </div>
                  ))}
        </div>
              </div>
            )}
              </div>

          {/* BOTÓN GUARDAR */}
          <div className="p-4 border-t border-slate-200">
        <button
              onClick={handleSave}
              className="w-full py-3 rounded-2xl bg-[#0f172a] text-white text-sm font-black tracking-wide"
        >
              Guardar Ficha Completa
        </button>
      </div>
        </div>
      )}

      {/* MODAL AGENDAR VISITA */}
      {showAgendaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900">Agendar Visita</h3>
              <button
                onClick={() => setShowAgendaModal(false)}
                className="p-1 rounded-full hover:bg-slate-100 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>
              <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Fecha</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                value={fechaSeleccionada}
                onChange={(e) => setFechaSeleccionada(e.target.value)}
                />
              </div>
              <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Prospecto / Cliente</label>
                <select
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  value={agendaProspectoId}
                  onChange={(e) => handleProspectoChange(e.target.value)}
                >
                <option value="">Selecciona prospecto o cliente...</option>
                <option value="nuevo" className="font-bold">+ Crear Nuevo Prospecto</option>
                {listadoUnificado.map(item => (
                  <option key={item.value} value={item.value}>
                    {item.tipo === 'cliente' ? '⭐ ' : '💼 '}
                    {item.nombre}
                    {item.poblacion ? ` • ${item.poblacion}` : ''}
                  </option>
                ))}
                </select>
              </div>
              <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Comentario</label>
                <textarea
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm min-h-[80px]"
                  value={agendaComentario}
                  onChange={(e) => setAgendaComentario(e.target.value)}
                />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAgendaModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-600"
              >
                Cancelar
              </button>
              <button
                onClick={guardarVisitaDesdeCalendario}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0f172a] text-white"
              >
                Guardar Visita
              </button>
            </div>
          </div>
        </div>
      )}
  </div>
)
}

export default CRM
