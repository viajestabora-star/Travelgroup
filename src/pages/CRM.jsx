import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { X, Phone, Navigation } from 'lucide-react'

const SUPABASE_URL = 'https://gtwyqxfkpdwpakmgrkbu.supabase.co'
const SUPABASE_KEY = 'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const CRM = () => {
  const [prospectos, setProspectos] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [fechaSeleccionada, setFechaSeleccionada] = useState(null)
  const [homeTab, setHomeTab] = useState('calendario') // calendario | estadisticas

  // Fuente de verdad única para la ficha
  const [prospectoSelected, setProspectoSelected] = useState(null) // estado inicial seguro: null
  const [showPanel, setShowPanel] = useState(false)
  const [fichaTab, setFichaTab] = useState('datos') // datos | historial | programas
  const [visitas, setVisitas] = useState([])
  const [nuevaVisita, setNuevaVisita] = useState({
    fecha: new Date().toISOString().split('T')[0],
    comentario: '',
  })

  const fetchProspectos = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('prospectos')
      .select('*')
      .order('fecha', { ascending: false })
    if (!error && data) {
      setProspectos(data)
    }
    setLoading(false)
  }

  const fetchVisitasForProspecto = async (prospectoId) => {
    if (!prospectoId) {
      setVisitas([])
      return
    }
    const { data, error } = await supabase
      .from('visitas')
      .select('*')
      .eq('prospecto_id', Number(prospectoId))
      .order('fecha', { ascending: false })
    if (!error && Array.isArray(data)) {
      setVisitas(data)
    } else {
      setVisitas([])
    }
  }

  useEffect(() => { 
    fetchProspectos()
  }, [])

  // Al hacer clic en un prospecto, cargamos el objeto COMPLETO (incluyendo id) en prospectoSelected
  const abrirFicha = (prospecto) => {
    if (!prospecto || !prospecto.id) {
      console.error('Prospecto sin ID al abrir ficha:', prospecto)
      alert('ERROR: Este prospecto no tiene ID en la base de datos.')
        return
      }

    const normalizado = {
      ...prospecto,
      programas_presentados: Array.isArray(prospecto.programas_presentados)
        ? prospecto.programas_presentados
        : [],
    }

    setProspectoSelected(normalizado)
    setFichaTab('datos')
    setNuevaVisita({
      fecha: new Date().toISOString().split('T')[0],
      comentario: '',
    })
    fetchVisitasForProspecto(prospecto.id)
    setShowPanel(true)
  }

  const cerrarFicha = () => {
    setShowPanel(false)
    setProspectoSelected(null)
    setVisitas([])
  }

  // Guardado atómico sobre la tabla `prospectos` usando el estado único `prospectoSelected`
  const handleSave = async () => {
    if (!prospectoSelected?.id) {
      console.error('Intento de guardar sin ID. Estado actual:', prospectoSelected)
      return alert('ERROR: No hay ID detectado.')
    }

    const payload = {
      ...prospectoSelected,
      id: Number(prospectoSelected.id),
    }

    const { error } = await supabase.from('prospectos').upsert(payload)

    if (!error) {
      alert('¡Rocafort actualizado con éxito!')
      setShowPanel(false)
      await fetchProspectos()
    } else {
      console.error('Error Supabase al guardar:', error)
      alert('Error Supabase: ' + error.message)
    }
  }

  // Helpers de binding seguro
  const updateField = (field, value) => {
    setProspectoSelected((prev) =>
      prev ? { ...prev, [field]: value } : prev
    )
  }

  const updateProgramaField = (index, field, value) => {
    setProspectoSelected((prev) => {
      if (!prev) return prev
      const actuales = Array.isArray(prev.programas_presentados)
        ? [...prev.programas_presentados]
        : []
      const programa = actuales[index] || { destino: '', fechas: '', estado: 'Pendiente', explicacion: '', imagen: '' }
      actuales[index] = { ...programa, [field]: value }
      return { ...prev, programas_presentados: actuales }
    })
  }

  const addPrograma = () => {
    setProspectoSelected((prev) => {
      if (!prev) return prev
      const actuales = Array.isArray(prev.programas_presentados)
        ? [...prev.programas_presentados]
        : []
      actuales.push({
        destino: '',
        fechas: '',
        estado: 'Pendiente',
        explicacion: '',
        imagen: '',
      })
      return { ...prev, programas_presentados: actuales }
    })
  }

  const registrarVisita = async () => {
    if (!prospectoSelected?.id) {
      alert('No se puede registrar la visita: falta ID de prospecto.')
      return
    }
    const fecha = nuevaVisita.fecha || new Date().toISOString().split('T')[0]
    const comentario = nuevaVisita.comentario || ''

    const { data, error } = await supabase
      .from('visitas')
      .insert({
        prospecto_id: Number(prospectoSelected.id),
        fecha,
        comentario,
      })
      .select()
      .single()

    if (error) {
      alert('Error al registrar la visita: ' + error.message)
      return
    }

    // Actualizar lista local de visitas e información de última visita
    setVisitas((prev) => [data, ...prev])
    setProspectoSelected((prev) =>
      prev ? { ...prev, ultima_visita_realizada: fecha } : prev
    )

    // Reflejar última visita en la tabla de prospectos sin duplicar registros
    await supabase
      .from('prospectos')
      .update({ ultima_visita_realizada: fecha })
      .eq('id', Number(prospectoSelected.id))

    setNuevaVisita({
      fecha: new Date().toISOString().split('T')[0],
      comentario: '',
    })
  }

  const removePrograma = (index) => {
    setProspectoSelected((prev) => {
      if (!prev) return prev
      const actuales = Array.isArray(prev.programas_presentados)
        ? [...prev.programas_presentados]
        : []
      actuales.splice(index, 1)
      return { ...prev, programas_presentados: actuales }
    })
  }

  const renderCalendar = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const offset = firstDay === 0 ? 6 : firstDay - 1
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const cells = []
    for (let i = 0; i < offset; i++) {
      cells.push(<div key={`e-${i}`} className="h-7" />)
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(
        day
      ).padStart(2, '0')}`
      const hasVisit = prospectos.some((p) => p.fecha === dateStr)
      const isSelected = fechaSeleccionada === dateStr
      cells.push(
        <button
          key={day}
          type="button"
          onClick={() => setFechaSeleccionada(isSelected ? null : dateStr)}
          className={`h-7 w-7 flex flex-col items-center justify-center rounded-full text-[11px] ${
            isSelected ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'
          }`}
        >
          <span>{day}</span>
          {hasVisit && (
            <span
              className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                isSelected ? 'bg-emerald-300' : 'bg-emerald-500'
              }`}
            />
          )}
        </button>
      )
    }
    return cells
  }

  const prospectosFiltrados = fechaSeleccionada
    ? prospectos.filter(
        (p) => p.fecha === fechaSeleccionada || p.proxima_visita === fechaSeleccionada
      )
    : prospectos

  return (
    <div className="flex h-screen bg-slate-100">
      {/* LISTA PRINCIPAL DE PROSPECTOS */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-black tracking-tight">CRM Comercial</h1>
          <button
            onClick={fetchProspectos}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold"
          >
            Recargar
          </button>
      </div>

        {loading && prospectos.length === 0 && (
          <div className="text-sm text-slate-500 mb-4">Cargando prospectos...</div>
        )}

        {/* Historial general de últimas visitas */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xs font-black uppercase text-slate-400 tracking-widest">
              Últimas visitas realizadas
            </h2>
          </div>
          <div className="space-y-1">
            {prospectos.slice(0, 5).map((p) => (
              <div
                key={`last-${p.id}`}
                className="flex items-center justify-between text-[11px] text-slate-600"
              >
                <span className="truncate max-w-[70%]">
                  {p.grupo || '(Sin nombre)'}
                </span>
                <span className="font-mono text-slate-400">{p.fecha}</span>
        </div>
            ))}
            {prospectos.length === 0 && (
              <div className="text-[11px] text-slate-400 italic">
                Aún no hay visitas registradas.
            </div>
          )}
          </div>
          </div>

        {/* Calendario / Estadísticas */}
        <div className="mb-6 bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-2">
              <button
                type="button"
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold ${
                  homeTab === 'calendario'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
                onClick={() => setHomeTab('calendario')}
              >
                Calendario
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold ${
                  homeTab === 'estadisticas'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
                onClick={() => setHomeTab('estadisticas')}
              >
                Estadísticas
              </button>
            </div>
                </div>
                
          {homeTab === 'calendario' ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-[11px] font-bold uppercase text-slate-400">
                    Calendario de Visitas
                </div>
                  <div className="text-xs text-slate-600">
                    {currentDate.toLocaleString('es-ES', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="px-2 py-1 text-xs rounded-lg border border-slate-200"
                    onClick={() =>
                      setCurrentDate(
                        (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
                      )
                    }
                  >
                    ‹
                  </button>
                        <button
                          type="button"
                    className="px-2 py-1 text-xs rounded-lg border border-slate-200"
                    onClick={() =>
                      setCurrentDate(
                        (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                      )
                    }
                  >
                    ›
                        </button>
          </div>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-1 text-[10px] text-slate-400 font-bold">
                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
                  <div key={d} className="text-center">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">{renderCalendar()}</div>
              {fechaSeleccionada && (
                <div className="mt-2 text-[11px] text-slate-500">
                  Filtrando por fecha:{' '}
                  <span className="font-mono">{fechaSeleccionada}</span>
                    </div>
                  )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50 border border-blue-100">
                <div className="text-[11px] text-slate-500 font-bold uppercase">
                  Total Clientes
                </div>
                <div className="text-lg font-black text-blue-700">{totalClientes}</div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-100">
                <div className="text-[11px] text-slate-500 font-bold uppercase">
                  Total Prospecciones
                </div>
                <div className="text-lg font-black text-amber-700">
                  {totalProspecciones}
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                <div className="text-[11px] text-slate-500 font-bold uppercase">
                  Ratio de Conversión
                </div>
                <div className="text-lg font-black text-emerald-700">
                  {ratioConversion}%
                </div>
              </div>
                    </div>
                  )}
                </div>
                
        {prospectosFiltrados.length === 0 && !loading && (
          <div className="text-slate-400 italic">No hay prospectos para mostrar.</div>
        )}

        <div className="space-y-3">
          {prospectosFiltrados.map((p) => {
            const estado = p.estado_comercial || 'POTENCIAL'
            let colorClasses = 'bg-white border-slate-200'
            if (estado === 'CLIENTE') {
              colorClasses = 'bg-emerald-50 border-emerald-200'
            } else if (estado === 'POTENCIAL') {
              colorClasses = 'bg-amber-50 border-amber-200'
            } else if (estado === 'DESCARTAR') {
              colorClasses = 'bg-slate-50 border-slate-200 opacity-70'
            }

          return (
            <button
              key={p.id}
              onClick={() => abrirFicha(p)}
              className={`w-full text-left rounded-2xl px-4 py-3 shadow-sm border hover:border-slate-400 transition flex items-center justify-between ${colorClasses}`}
            >
                <div>
                <div className="text-sm font-bold text-slate-900">
                  {p.grupo || '(Sin nombre)'}
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-2">
                  <span>
                    {p.fecha} · {p.poblacion || p.provincia || 'Localidad no definida'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-slate-300 bg-white/70">
                    {estado}
                  </span>
                </div>
                </div>
              <div className="text-xs text-slate-400">
                ID: {p.id ?? '—'}
              </div>
            </button>
          )})}
        </div>
                </div>
                
      {/* PANEL LATERAL UNIFICADO */}
      {showPanel && prospectoSelected && (
        <div className="w-full max-w-md border-l border-slate-200 bg-white h-full flex flex-col shadow-xl">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <div className="flex-1">
              <div className="text-xs text-slate-400 font-mono">
                ID: {String(prospectoSelected.id)}
              </div>
              <h2 className="text-lg font-black text-slate-900">
                {prospectoSelected.grupo || 'Ficha de Visita'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                  if (!prospectoSelected?.id) {
                    alert('No se puede borrar: falta ID de prospecto.')
                              return
                            }
                  if (
                    !window.confirm(
                      '¿Estás seguro de que quieres borrar este registro?'
                    )
                  ) {
                    return
                  }
                  const { error } = await supabase
                    .from('prospectos')
                    .delete()
                    .eq('id', prospectoSelected.id)
                  if (error) {
                    alert('Error al borrar: ' + error.message)
                          } else {
                    cerrarFicha()
                    fetchProspectos()
                  }
                }}
                className="p-2 rounded-full hover:bg-red-50 text-red-500 border border-red-100"
              >
                🗑
                    </button>
              <button
                onClick={cerrarFicha}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-500"
              >
                <X size={18} />
              </button>
                  </div>
                </div>
                
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
            {/* PESTAÑAS DENTRO DE LA FICHA */}
            <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                onClick={() => setFichaTab('datos')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold ${
                  fichaTab === 'datos'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                Datos
                    </button>
                    <button
                      type="button"
                onClick={() => setFichaTab('historial')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold ${
                  fichaTab === 'historial'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                Historial
                    </button>
                    <button
                      type="button"
                onClick={() => setFichaTab('programas')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold ${
                  fichaTab === 'programas'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                Programas
                    </button>
                </div>
                
            {/* DATOS DE VISITA */}
            {fichaTab === 'datos' && (
            <section id="tab-datos">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-3">
                Datos de Visita
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    Grupo / Cliente
                  </label>
                  <input 
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    value={prospectoSelected.grupo || ''}
                    onChange={(e) => updateField('grupo', e.target.value)}
                  />
                </div>
                
                <div className="grid grid-cols-3 gap-3">
                <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      CIF / NIF
                  </label>
                  <input 
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      value={prospectoSelected.cif || ''}
                      onChange={(e) => updateField('cif', e.target.value)}
                  />
                    </div>
                <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Teléfono
                    </label>
                  <input 
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      value={prospectoSelected.telefono || ''}
                      onChange={(e) => updateField('telefono', e.target.value)}
                  />
                </div>
                <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Responsable
                    </label>
                  <input 
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      value={prospectoSelected.responsable || ''}
                      onChange={(e) => updateField('responsable', e.target.value)}
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    Dirección
                  </label>
                  <input 
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    value={prospectoSelected.direccion || ''}
                    onChange={(e) => updateField('direccion', e.target.value)}
                  />
                  </div>
                
                <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Población
                    </label>
                  <input 
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      value={prospectoSelected.poblacion || ''}
                      onChange={(e) => updateField('poblacion', e.target.value)}
                  />
          </div>
                <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Provincia
                  </label>
                  <input 
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      value={prospectoSelected.provincia || ''}
                      onChange={(e) => updateField('provincia', e.target.value)}
                    />
        </div>
    </div>

      <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    Ubicación / Google Maps
                  </label>
                  <input 
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    value={prospectoSelected.ubicacion || ''}
                    onChange={(e) => updateField('ubicacion', e.target.value)}
                  />
      </div>
                
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    Notas Comerciales
                  </label>
                  <textarea 
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm min-h-[80px]"
                    value={prospectoSelected.notas_comerciales || prospectoSelected.notas || ''}
                    onChange={(e) => {
                      updateField('notas_comerciales', e.target.value)
                      updateField('notas', e.target.value)
                    }}
                  />
    </div>
                
                {/* Acciones rápidas */}
                <div className="flex gap-2 pt-2">
                  {prospectoSelected.telefono && (
                    <a
                      href={`tel:${prospectoSelected.telefono}`}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold"
                    >
                      <Phone size={14} /> Llamar
                    </a>
                  )}
                  {prospectoSelected.ubicacion && (
                <button
                      type="button"
                      onClick={() => {
                        const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          prospectoSelected.ubicacion
                        )}`
                        window.open(url, '_blank')
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold"
                    >
                      <Navigation size={14} /> Mapa
                </button>
      )}
      </div>
    </div>
            </section>
            )}
    
            {/* HISTORIAL */}
            {fichaTab === 'historial' && (
              <section id="tab-historial" className="space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">
                    Historial de Visitas
                  </h3>
                  <button
                    type="button"
                    onClick={registrarVisita}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-slate-900 text-white"
                  >
                    + Registrar Visita
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Fecha de Visita
                    </label>
                    <input
                      type="date"
                      className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs"
                      value={nuevaVisita.fecha}
                      onChange={(e) =>
                        setNuevaVisita((prev) => ({ ...prev, fecha: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Próxima Visita
                    </label>
                    <input
                      type="date"
                      className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs"
                      value={prospectoSelected.proxima_visita || ''}
                      onChange={(e) => updateField('proxima_visita', e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    Comentario de la Visita
                  </label>
                  <textarea
                    className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs min-h-[60px]"
                    value={nuevaVisita.comentario}
                    onChange={(e) =>
                      setNuevaVisita((prev) => ({ ...prev, comentario: e.target.value }))
                    }
                  />
                </div>

                <div className="border-t border-slate-200 pt-2">
                  <h4 className="text-[11px] font-bold uppercase text-slate-400 mb-1">
                    Visitas registradas
                  </h4>
                  {visitas.length === 0 ? (
                    <div className="text-xs text-slate-400 italic">
                      Aún no hay visitas registradas para este cliente.
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {visitas.map((v) => (
                        <div
                          key={v.id}
                          className="flex items-start justify-between text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-slate-50"
                        >
                          <div className="font-mono text-slate-500 mr-2">
                            {v.fecha}
                          </div>
                          <div className="flex-1 text-slate-700 whitespace-pre-line">
                            {v.comentario || 'Sin comentario'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}
    
      {/* PROGRAMAS PRESENTADOS */}
            {fichaTab === 'programas' && (
            <section id="tab-programas">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">
            Programas Presentados
                </h3>
                <button
                  type="button"
                  onClick={addPrograma}
                  className="text-xs font-bold text-blue-600"
                >
                  + Añadir programa
                </button>
        </div>

              {(!prospectoSelected.programas_presentados ||
                prospectoSelected.programas_presentados.length === 0) && (
                <div className="text-xs text-slate-400 italic mb-2">
                  No hay programas registrados para este prospecto.
            </div>
          )}

              <div className="space-y-3">
                {Array.isArray(prospectoSelected.programas_presentados) &&
                  prospectoSelected.programas_presentados.map((prog, idx) => (
            <div
              key={idx}
                      className="border border-slate-200 rounded-xl p-3 space-y-2 bg-slate-50"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-slate-500">
                          Programa #{idx + 1}
                </span>
                        <button
                          type="button"
                          onClick={() => removePrograma(idx)}
                          className="text-[11px] text-red-500"
                        >
                          Quitar
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
              <div>
                          <label className="block text-[10px] text-slate-500 mb-1">
                  Destino
                </label>
                <input
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs"
                            value={prog.destino || ''}
                            onChange={(e) =>
                              updateProgramaField(idx, 'destino', e.target.value)
                            }
                />
              </div>
              <div>
                          <label className="block text-[10px] text-slate-500 mb-1">
                  Fechas
                </label>
                <input
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs"
                            value={prog.fechas || ''}
                            onChange={(e) =>
                              updateProgramaField(idx, 'fechas', e.target.value)
                            }
                />
              </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
              <div>
                          <label className="block text-[10px] text-slate-500 mb-1">
                  Estado
                </label>
                <select
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs"
                            value={prog.estado || 'Pendiente'}
                            onChange={(e) =>
                              updateProgramaField(idx, 'estado', e.target.value)
                            }
                >
                  <option value="Pendiente">Pendiente</option>
                  <option value="Revision">Revisión</option>
                  <option value="Confirmado">Confirmado</option>
                </select>
            </div>
            <div>
                          <label className="block text-[10px] text-slate-500 mb-1">
                            URL imagen / captura
              </label>
                          <input
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs"
                            value={prog.imagen || ''}
                            onChange={(e) =>
                              updateProgramaField(idx, 'imagen', e.target.value)
                            }
                          />
                        </div>
            </div>
            <div>
                        <label className="block text-[10px] text-slate-500 mb-1">
                          Explicación
              </label>
                        <textarea
                          className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs min-h-[50px]"
                          value={prog.explicacion || ''}
                          onChange={(e) =>
                            updateProgramaField(idx, 'explicacion', e.target.value)
                          }
              />
            </div>
            </div>
                  ))}
        </div>
            </section>
            )}

            {/* ESTADO COMERCIAL */}
            <section>
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2">
                Estado Comercial
              </h3>
              <div className="grid grid-cols-2 gap-2 mb-2">
          <button 
                  type="button"
            onClick={() => {
                    updateField('es_cliente', true)
                    updateField('estado_comercial', 'CLIENTE')
            }}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white"
          >
                  Hacer Cliente
          </button>
          <button
                  type="button"
                  onClick={() => {
                    updateField('es_cliente', false)
                    updateField('estado_comercial', 'POTENCIAL')
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-600"
                >
                  Marcar como Prospección
          </button>
              </div>
              <select
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                value={prospectoSelected.estado_comercial || 'POTENCIAL'}
                onChange={(e) => updateField('estado_comercial', e.target.value)}
              >
                <option value="CLIENTE">CLIENTE</option>
                <option value="POTENCIAL">POTENCIAL</option>
                <option value="DESCARTAR">DESCARTAR</option>
              </select>
              <div className="mt-3">
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  Próxima Visita
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  value={prospectoSelected.proxima_visita || ''}
                  onChange={(e) => updateField('proxima_visita', e.target.value)}
                />
              </div>
            </section>

            {/* ESTADO COMERCIAL */}
            <section>
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2">
                Estado Comercial
              </h3>
              <select
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                value={prospectoSelected.estado_comercial || 'POTENCIAL'}
                onChange={(e) => updateField('estado_comercial', e.target.value)}
              >
                <option value="CLIENTE">CLIENTE</option>
                <option value="POTENCIAL">POTENCIAL</option>
                <option value="DESCARTAR">DESCARTAR</option>
              </select>
            </section>
      </div>

          {/* BOTÓN ÚNICO DE GUARDADO */}
          <div className="p-4 border-t border-slate-200">
        <button
              type="button"
              onClick={handleSave}
              className="w-full py-3 rounded-2xl bg-slate-900 text-white text-sm font-black tracking-wide"
        >
              Guardar ficha completa
        </button>
      </div>
        </div>
      )}
  </div>
)
}

export default CRM
