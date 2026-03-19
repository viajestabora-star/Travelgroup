import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabase'
import {
  Wand2, Search, RefreshCw, Save, ExternalLink,
  CheckCircle, AlertCircle, ChevronRight, X, FileText,
  MapPin, Users, Calendar, Loader2,
} from 'lucide-react'

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmt = (n) => (n != null ? Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')

const TIPO_LABELS = {
  hotel: 'Hotel', restaurante: 'Restaurante', autobus: 'Autobús',
  guia: 'Guía', guialocal: 'Guía Local', entradas: 'Entradas/Tickets',
  seguro: 'Seguro', barco: 'Barco', mayorista: 'Mayorista', otros: 'Otros',
}

// ─── subcomponent: tarjeta de expediente seleccionado ────────────────────────

const ExpedienteCard = ({ exp, onClear }) => (
  <div className="flex items-start justify-between gap-4 p-4 bg-sky-50 border border-sky-200 rounded-xl">
    <div className="flex items-start gap-3 min-w-0">
      <div className="mt-0.5 shrink-0 w-9 h-9 rounded-lg bg-sky-600 flex items-center justify-center">
        <FileText size={18} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="font-bold text-navy-900 text-sm leading-tight truncate">{exp.nombre_grupo || 'Sin nombre'}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
          {exp.destino && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <MapPin size={11} /> {exp.destino}
            </span>
          )}
          {exp.num_participantes && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Users size={11} /> {exp.num_participantes} pax
            </span>
          )}
          {exp.fecha_salida && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Calendar size={11} /> {exp.fecha_salida}
            </span>
          )}
        </div>
      </div>
    </div>
    <button
      type="button"
      onClick={onClear}
      className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:bg-sky-100 hover:text-slate-600 transition-colors"
      title="Cambiar expediente"
    >
      <X size={16} />
    </button>
  </div>
)

// ─── subcomponent: fila de servicio sincronizado ──────────────────────────────

const ServicioSyncRow = ({ s }) => (
  <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all">
    <div className="flex items-center gap-2 min-w-0">
      <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 uppercase tracking-wide">
        {TIPO_LABELS[s.tipo_servicio?.toLowerCase()] || s.tipo_servicio || '—'}
      </span>
      <span className="text-sm text-slate-700 font-medium truncate">
        {s.nombre_especifico || s.especificacion_destino || 'Sin detalle'}
      </span>
      {s.nombre_proveedor_manual && (
        <span className="text-xs text-slate-400 truncate hidden sm:inline">· {s.nombre_proveedor_manual}</span>
      )}
    </div>
    <span className="shrink-0 text-sm font-semibold text-navy-900 tabular-nums">
      {fmt(s.coste_unitario)}€
    </span>
  </div>
)

// ─── main component ───────────────────────────────────────────────────────────

const GeneradorProgramas = ({ user }) => {
  // Buscador de expedientes
  const [query, setQuery]                   = useState('')
  const [sugerencias, setSugerencias]       = useState([])
  const [buscando, setBuscando]             = useState(false)
  const [mostrarLista, setMostrarLista]     = useState(false)
  const searchRef                           = useRef(null)
  const debounceRef                         = useRef(null)

  // Expediente seleccionado
  const [expediente, setExpediente]         = useState(null)

  // Servicios sincronizados desde cotización
  const [servicios, setServicios]           = useState([])
  const [sincronizando, setSincronizando]   = useState(false)
  const [sincronizado, setSincronizado]     = useState(false)

  // Campos del programa
  const [instrucciones, setInstrucciones]   = useState('')
  const [contenido, setContenido]           = useState('')
  const [canvaUrl, setCanvaUrl]             = useState('')

  // Estado de guardado
  const [guardando, setGuardando]           = useState(false)
  const [toast, setToast]                   = useState(null) // { tipo: 'ok'|'error', msg }

  // ── cerrar lista al clic fuera ──────────────────────────────────────────────
  useEffect(() => {
    const onClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setMostrarLista(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // ── toast auto-dismiss ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // ── cargar programa existente cuando cambia el expediente ───────────────────
  useEffect(() => {
    if (!expediente?.id) return
    const cargar = async () => {
      const { data } = await supabase
        .from('programas_viaje')
        .select('*')
        .eq('expediente_id', String(expediente.id))
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data) {
        setInstrucciones(data.instrucciones_ia || '')
        setContenido(data.contenido_programa || '')
        setCanvaUrl(data.canva_url || '')
      } else {
        setInstrucciones('')
        setContenido('')
        setCanvaUrl('')
      }
      setSincronizado(false)
      setServicios([])
    }
    cargar()
  }, [expediente?.id])

  // ── buscador con debounce ───────────────────────────────────────────────────
  const buscarExpedientes = useCallback(async (texto) => {
    if (!texto || texto.trim().length < 2) {
      setSugerencias([])
      setMostrarLista(false)
      return
    }
    setBuscando(true)
    const termino = texto.trim()
    const { data } = await supabase
      .from('expedientes')
      .select('id, nombre_grupo, destino, fecha_salida, num_participantes, estado')
      .or(`nombre_grupo.ilike.%${termino}%,destino.ilike.%${termino}%`)
      .order('created_at', { ascending: false })
      .limit(12)

    setSugerencias(data || [])
    setMostrarLista(true)
    setBuscando(false)
  }, [])

  const handleQueryChange = (e) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => buscarExpedientes(val), 280)
  }

  const seleccionarExpediente = (exp) => {
    setExpediente(exp)
    setQuery(exp.nombre_grupo || '')
    setMostrarLista(false)
    setSugerencias([])
  }

  const limpiarExpediente = () => {
    setExpediente(null)
    setQuery('')
    setServicios([])
    setSincronizado(false)
    setInstrucciones('')
    setContenido('')
    setCanvaUrl('')
  }

  // ── sincronizar con cotización ──────────────────────────────────────────────
  const sincronizarCotizacion = async () => {
    if (!expediente?.id) return
    setSincronizando(true)
    const { data, error } = await supabase
      .from('servicios_cotizacion')
      .select('*')
      .eq('id_expediente', String(expediente.id))
      .order('orden', { ascending: true })

    if (error) {
      setToast({ tipo: 'error', msg: 'No se pudieron cargar los servicios de cotización.' })
    } else {
      setServicios(data || [])
      setSincronizado(true)
      // Pre-rellenar contenido si está vacío
      if (!contenido && data?.length) {
        const lineas = data.map(s => {
          const tipo  = TIPO_LABELS[s.tipo_servicio?.toLowerCase()] || s.tipo_servicio || ''
          const det   = s.nombre_especifico || s.especificacion_destino || ''
          const prov  = s.nombre_proveedor_manual ? ` (${s.nombre_proveedor_manual})` : ''
          return `• ${tipo}${det ? ': ' + det : ''}${prov}`
        })
        setContenido(lineas.join('\n'))
      }
    }
    setSincronizando(false)
  }

  // ── guardar programa ────────────────────────────────────────────────────────
  const guardarPrograma = async () => {
    if (!expediente?.id) return
    setGuardando(true)

    const payload = {
      expediente_id:      String(expediente.id),
      nombre_grupo:       expediente.nombre_grupo || '',
      instrucciones_ia:   instrucciones,
      contenido_programa: contenido,
      canva_url:          canvaUrl || null,
      user_email:         user?.email || null,
      updated_at:         new Date().toISOString(),
    }

    // Buscar registro existente para decidir upsert
    const { data: existing } = await supabase
      .from('programas_viaje')
      .select('id')
      .eq('expediente_id', String(expediente.id))
      .maybeSingle()

    let error
    if (existing?.id) {
      ;({ error } = await supabase
        .from('programas_viaje')
        .update(payload)
        .eq('id', existing.id))
    } else {
      ;({ error } = await supabase
        .from('programas_viaje')
        .insert([{ ...payload, created_at: new Date().toISOString() }]))
    }

    setGuardando(false)
    if (error) {
      setToast({ tipo: 'error', msg: `Error al guardar: ${error.message}` })
    } else {
      setToast({ tipo: 'ok', msg: '✅ Programa guardado correctamente.' })
    }
  }

  // ── abrir canva ─────────────────────────────────────────────────────────────
  const conectarCanva = () => {
    if (canvaUrl) {
      window.open(canvaUrl, '_blank', 'noopener,noreferrer')
    } else {
      window.open('https://www.canva.com/create/travel-itineraries/', '_blank', 'noopener,noreferrer')
    }
  }

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-gray-50 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-violet-100">
          <Wand2 size={24} className="text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Diseñador de Programas</h1>
          <p className="text-sm text-slate-500 mt-0.5">Genera el programa de viaje a partir de la cotización del expediente</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Columna izquierda: buscador + expediente ── */}
        <div className="xl:col-span-1 space-y-4">

          {/* Buscador */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Expediente</h2>

            {expediente ? (
              <ExpedienteCard exp={expediente} onClear={limpiarExpediente} />
            ) : (
              <div ref={searchRef} className="relative">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={handleQueryChange}
                    onFocus={() => query.length >= 2 && setMostrarLista(true)}
                    placeholder="Buscar por nombre o destino…"
                    className="w-full pl-9 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 transition-all"
                  />
                  {buscando && (
                    <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
                  )}
                </div>

                {mostrarLista && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto z-50">
                    {sugerencias.length === 0 && !buscando && (
                      <p className="px-4 py-3 text-sm text-slate-500 text-center">Sin resultados para «{query}»</p>
                    )}
                    {sugerencias.map((exp) => (
                      <button
                        key={exp.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); seleccionarExpediente(exp) }}
                        className="w-full text-left px-4 py-3 hover:bg-violet-50 border-b border-slate-100 last:border-0 transition-colors"
                      >
                        <p className="text-sm font-semibold text-slate-800 leading-tight">
                          {exp.nombre_grupo || 'Sin nombre'}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                          {exp.destino && <span>{exp.destino}</span>}
                          {exp.fecha_salida && <span>· {exp.fecha_salida}</span>}
                          {exp.num_participantes && <span>· {exp.num_participantes} pax</span>}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Botón sincronizar */}
            {expediente && (
              <button
                type="button"
                onClick={sincronizarCotizacion}
                disabled={sincronizando}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white text-sm font-semibold transition-colors shadow-sm"
              >
                {sincronizando
                  ? <><Loader2 size={15} className="animate-spin" /> Sincronizando…</>
                  : <><RefreshCw size={15} /> ✨ Sincronizar con Cotización</>
                }
              </button>
            )}
          </div>

          {/* Servicios sincronizados */}
          {sincronizado && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Servicios Cotizados
                </h2>
                <span className="text-xs text-violet-600 font-semibold bg-violet-50 px-2 py-0.5 rounded-full">
                  {servicios.length} ítems
                </span>
              </div>

              {servicios.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No hay servicios en la cotización</p>
              ) : (
                <div className="space-y-0.5 max-h-72 overflow-y-auto pr-1">
                  {servicios.map((s, i) => (
                    <ServicioSyncRow key={s.id || i} s={s} />
                  ))}
                </div>
              )}

              {servicios.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-500 uppercase">Total coste</span>
                  <span className="text-sm font-bold text-navy-900">
                    {fmt(servicios.reduce((acc, s) => acc + (Number(s.coste_unitario) || 0), 0))}€
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Botón Canva */}
          {expediente && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Diseño Visual</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                    URL de Canva <span className="font-normal text-slate-400">(opcional)</span>
                  </label>
                  <input
                    type="url"
                    value={canvaUrl}
                    onChange={(e) => setCanvaUrl(e.target.value)}
                    placeholder="https://www.canva.com/design/…"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-300 transition-all"
                  />
                </div>
                <button
                  type="button"
                  onClick={conectarCanva}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white text-sm font-semibold transition-all shadow-sm"
                >
                  <ExternalLink size={15} />
                  🎨 {canvaUrl ? 'Abrir en Canva' : 'Conectar con Canva'}
                </button>
                <p className="text-[11px] text-slate-400 text-center leading-snug">
                  Pega la URL de tu diseño de Canva para vincularlo al programa
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Columna derecha: editor del programa ── */}
        <div className="xl:col-span-2 space-y-4">

          {!expediente ? (
            <div className="bg-white rounded-2xl shadow-sm border border-dashed border-slate-300 flex flex-col items-center justify-center py-24 gap-4">
              <div className="p-4 rounded-full bg-slate-100">
                <Wand2 size={32} className="text-slate-400" />
              </div>
              <p className="text-slate-500 font-medium">Selecciona un expediente para empezar</p>
              <p className="text-sm text-slate-400">Busca por nombre de grupo o destino</p>
            </div>
          ) : (
            <>
              {/* Instrucciones para la IA */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">Instrucciones para la IA</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Describe el tono, formato o aspectos especiales que debe tener el programa
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                    Próximamente ✦
                  </span>
                </div>
                <textarea
                  value={instrucciones}
                  onChange={(e) => setInstrucciones(e.target.value)}
                  rows={4}
                  placeholder={`Ejemplo: "Redacta el programa en un tono cercano y entusiasta. Destaca las experiencias gastronómicas y los tiempos libres. Incluye consejos prácticos al final de cada día."`}
                  className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 transition-all resize-none"
                />
              </div>

              {/* Contenido del programa */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">Contenido del Programa</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Puedes editar libremente este texto. Se rellena automáticamente al sincronizar.
                    </p>
                  </div>
                  {sincronizado && (
                    <span className="shrink-0 flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg">
                      <CheckCircle size={12} /> Sincronizado
                    </span>
                  )}
                </div>
                <textarea
                  value={contenido}
                  onChange={(e) => setContenido(e.target.value)}
                  rows={18}
                  placeholder={`DÍA 1 – LLEGADA\n• Hotel: ...\n• Restaurante: ...\n\nDÍA 2 – ...\n• Visita: ...`}
                  className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 transition-all resize-none font-mono leading-relaxed"
                />
                <div className="flex justify-end mt-1">
                  <span className="text-[11px] text-slate-400">
                    {contenido.length} caracteres
                  </span>
                </div>
              </div>

              {/* Barra inferior: guardar */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className="text-xs text-slate-400 text-center sm:text-left">
                  Los cambios se guardan en la tabla <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">programas_viaje</code> de Supabase
                </p>
                <button
                  type="button"
                  onClick={guardarPrograma}
                  disabled={guardando}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 text-white text-sm font-semibold transition-colors shadow-sm whitespace-nowrap"
                >
                  {guardando
                    ? <><Loader2 size={15} className="animate-spin" /> Guardando…</>
                    : <><Save size={15} /> Guardar Programa</>
                  }
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Toast de notificación */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-sm font-semibold transition-all ${
            toast.tipo === 'ok'
              ? 'bg-emerald-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toast.tipo === 'ok'
            ? <CheckCircle size={18} />
            : <AlertCircle size={18} />
          }
          {toast.msg}
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-2 opacity-70 hover:opacity-100 transition-opacity"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

export default GeneradorProgramas
