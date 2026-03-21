import React, { useState, useCallback } from 'react'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabase } from '../supabase'
import {
  Wand2,
  Plus,
  Trash2,
  Save,
  Sparkles,
  Loader2,
  FileText,
  X,
  Check,
  AlertTriangle,
} from 'lucide-react'

/** Especificación: misma expresión que en obtenerApiKeyGemini() para lectura en caliente al pulsar OPTIMIZAR. */
// eslint-disable-next-line no-unused-vars
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || window.VITE_GEMINI_API_KEY

const PROMPT_SISTEMA =
  "Eres un redactor de viajes de lujo para Tabora. Toma las notas del usuario y estructúralas en MAÑANA y TARDE/NOCHE. REGLA DE ORO: No inventes nada. Mantén los servicios tal cual (comidas, traslados, hoteles). No añadas extras. Devuelve exclusivamente JSON: [{'dia': 1, 'titulo': '...', 'manana': '...', 'tarde_noche': '...'}]"

function obtenerApiKeyGemini() {
  const key = import.meta.env.VITE_GEMINI_API_KEY || window.VITE_GEMINI_API_KEY
  return key && String(key).trim() ? String(key).trim() : ''
}

function limpiarYParsearJSON(texto) {
  const limpio = String(texto ?? '')
    .replace(/```json|```/g, '')
    .trim()
  try {
    return JSON.parse(limpio)
  } catch {
    const i = limpio.indexOf('[')
    const j = limpio.lastIndexOf(']')
    if (i < 0 || j <= i) throw new Error('La respuesta no es un JSON válido.')
    return JSON.parse(limpio.slice(i, j + 1).trim())
  }
}

function nuevoIdDia() {
  return Date.now() + Math.floor(Math.random() * 1000)
}

function itemIaADia(item, index) {
  return {
    id: nuevoIdDia() + index,
    titulo: String(item?.titulo ?? `Día ${item?.dia ?? index + 1}`),
    manana: String(item?.manana ?? item?.mañana ?? ''),
    tarde_noche: String(item?.tarde_noche ?? ''),
  }
}

export default function GeneradorProgramas() {
  const [tituloViaje, setTituloViaje] = useState('')
  const [notas, setNotas] = useState('')
  const [dias, setDias] = useState(() => [
    { id: Date.now(), titulo: 'Día 1', manana: '', tarde_noche: '' },
  ])
  const [propuestaIA, setPropuestaIA] = useState(null)
  const [cargandoIA, setCargandoIA] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [feedback, setFeedback] = useState(null)

  /** Se recalcula en cada render: si el usuario define window.VITE_GEMINI_API_KEY y re-renderiza la vista, desaparece el aviso. */
  const claveDisponibleRender = Boolean(obtenerApiKeyGemini())

  const mostrarFeedback = useCallback((ok, text, ms = 5500) => {
    setFeedback({ ok, text })
    if (ms > 0) setTimeout(() => setFeedback(null), ms)
  }, [])

  const optimizarConIA = async () => {
    const keyEnCaliente = obtenerApiKeyGemini()
    if (!keyEnCaliente) {
      mostrarFeedback(false, 'Error Crítico: VITE_GEMINI_API_KEY no encontrada en .env', 8000)
      return
    }
    if (!notas.trim()) {
      mostrarFeedback(false, 'Escribe o pega las notas antes de optimizar.')
      return
    }

    setCargandoIA(true)
    try {
      const genAI = new GoogleGenerativeAI(keyEnCaliente)
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        systemInstruction: PROMPT_SISTEMA,
      })
      const result = await model.generateContent(notas.trim())
      const texto = result.response.text()
      const parsed = limpiarYParsearJSON(texto)

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('La IA no devolvió una lista de días.')
      }

      setPropuestaIA(parsed)
      mostrarFeedback(true, 'Revisa la propuesta en el panel ámbar y pulsa APLICAR si te encaja.', 6500)
    } catch (e) {
      console.error('[GeneradorProgramas] optimizarConIA', e)
      mostrarFeedback(false, e?.message || 'Error al llamar a Gemini.', 8000)
    } finally {
      setCargandoIA(false)
    }
  }

  const aplicarPropuesta = () => {
    if (!propuestaIA?.length) {
      mostrarFeedback(false, 'No hay propuesta para aplicar.')
      return
    }
    setDias(propuestaIA.map((item, i) => itemIaADia(item, i)))
    setPropuestaIA(null)
    mostrarFeedback(true, 'Propuesta aplicada. Edita si hace falta y guarda en Supabase.', 5000)
  }

  const descartarPropuesta = () => {
    setPropuestaIA(null)
    mostrarFeedback(true, 'Propuesta descartada.', 3500)
  }

  const anadirDia = () => {
    setDias((prev) => [
      ...prev,
      { id: nuevoIdDia(), titulo: `Día ${prev.length + 1}`, manana: '', tarde_noche: '' },
    ])
  }

  const eliminarDia = (id) => setDias((prev) => prev.filter((d) => d.id !== id))

  const actualizarDia = (id, campo, valor) => {
    setDias((prev) => prev.map((d) => (d.id === id ? { ...d, [campo]: valor } : d)))
  }

  const guardar = async () => {
    setGuardando(true)
    const nombre = tituloViaje.trim() || 'Itinerario sin título'
    const itinerario_json = JSON.stringify(dias)

    const { error } = await supabase.from('programas_viaje').upsert(
      {
        nombre_grupo: nombre,
        notas_ia: notas,
        itinerario_json,
      },
      { onConflict: 'nombre_grupo' }
    )

    setGuardando(false)
    if (error) {
      console.error('[GeneradorProgramas] guardar', error)
      mostrarFeedback(false, error.message, 8000)
    } else {
      mostrarFeedback(true, 'Guardado correctamente en programas_viaje.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 font-sans text-slate-800 sm:p-6 lg:p-10">
      {!claveDisponibleRender && (
        <div
          className="mb-6 rounded-2xl border-2 border-red-400 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900 shadow-sm"
          role="alert"
        >
          Error Crítico: VITE_GEMINI_API_KEY no encontrada en .env
        </div>
      )}

      <header className="mb-8 flex items-start gap-4">
        <div className="rounded-2xl bg-violet-100 p-3 shadow-sm">
          <Wand2 size={24} className="text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Diseñador de Programas</h1>
          <p className="mt-1 text-sm text-slate-500">Medios días claros · Revisión antes de aplicar · Supabase</p>
        </div>
      </header>

      {feedback && (
        <div
          className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-medium ${
            feedback.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-slate-200 bg-white text-slate-800'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6 lg:flex-row">
          <aside className="shrink-0 lg:w-[min(100%,300px)]">
            <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                <FileText size={15} strokeWidth={2} /> Datos
              </h2>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Título del viaje</label>
                <input
                  value={tituloViaje}
                  onChange={(e) => setTituloViaje(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-sm transition focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
                  placeholder="Nombre del programa"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Notas</label>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows={10}
                  className="min-h-[168px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm leading-relaxed transition focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
                  placeholder="Notas del proveedor…"
                />
                <button
                  type="button"
                  onClick={optimizarConIA}
                  disabled={cargandoIA || !notas.trim()}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {cargandoIA ? (
                    <>
                      <Loader2 size={17} className="animate-spin" /> Optimizando…
                    </>
                  ) : (
                    <>
                      <Sparkles size={17} /> OPTIMIZAR
                    </>
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={anadirDia}
                className="w-full rounded-2xl border-2 border-dashed border-violet-200 py-2.5 text-sm font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50/50"
              >
                <Plus size={17} className="mr-1 inline" /> Añadir día
              </button>
              <button
                type="button"
                onClick={guardar}
                disabled={guardando}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:bg-slate-400"
              >
                {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                GUARDAR
              </button>
            </div>
          </aside>

          <main className="min-w-0 flex-1 space-y-4">
            {dias.map((dia, idx) => (
              <article
                key={dia.id}
                className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm ring-1 ring-slate-100/80"
              >
                <div className="mb-5 flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-xs font-bold text-violet-700">
                    {idx + 1}
                  </span>
                  <input
                    value={dia.titulo}
                    onChange={(e) => actualizarDia(dia.id, 'titulo', e.target.value)}
                    className="min-w-0 flex-1 border-b-2 border-slate-100 bg-transparent pb-2 text-sm font-semibold text-slate-900 transition focus:border-violet-400 focus:outline-none"
                    placeholder="Título del día"
                  />
                  <button
                    type="button"
                    onClick={() => eliminarDia(dia.id)}
                    className="shrink-0 rounded-xl p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
                    aria-label="Eliminar día"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div className="rounded-2xl border-2 border-amber-200/90 bg-gradient-to-b from-amber-50 to-amber-50/30 p-4 shadow-sm">
                    <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-amber-900">
                      MAÑANA
                    </label>
                    <textarea
                      value={dia.manana}
                      onChange={(e) => actualizarDia(dia.id, 'manana', e.target.value)}
                      rows={5}
                      className="w-full resize-y rounded-xl border border-amber-100/80 bg-white/90 px-3 py-2.5 text-sm text-slate-800 shadow-inner focus:outline-none focus:ring-2 focus:ring-amber-200/80"
                      placeholder="Contenido de la mañana…"
                    />
                  </div>
                  <div className="rounded-2xl border-2 border-indigo-200/90 bg-gradient-to-b from-indigo-50 to-indigo-50/30 p-4 shadow-sm">
                    <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-900">
                      TARDE / NOCHE
                    </label>
                    <textarea
                      value={dia.tarde_noche}
                      onChange={(e) => actualizarDia(dia.id, 'tarde_noche', e.target.value)}
                      rows={5}
                      className="w-full resize-y rounded-xl border border-indigo-100/80 bg-white/90 px-3 py-2.5 text-sm text-slate-800 shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-200/80"
                      placeholder="Tarde y noche…"
                    />
                  </div>
                </div>
              </article>
            ))}
          </main>
        </div>

        {propuestaIA && (
          <aside className="w-full shrink-0 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:w-[380px] xl:overflow-hidden xl:rounded-2xl">
            <div className="flex max-h-[min(70vh,520px)] flex-col overflow-hidden rounded-2xl border-2 border-amber-400/70 bg-amber-50 shadow-md ring-4 ring-amber-100/50 xl:max-h-[calc(100vh-3rem)]">
              <div className="flex items-center justify-between gap-2 border-b border-amber-200/80 bg-amber-100/80 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2 text-amber-950">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" strokeWidth={2.25} />
                  <h2 className="truncate text-sm font-bold uppercase tracking-wide">Revisión de propuesta</h2>
                </div>
                <button
                  type="button"
                  onClick={descartarPropuesta}
                  className="shrink-0 rounded-xl p-2 text-amber-800/70 transition hover:bg-amber-200/50 hover:text-amber-950"
                  aria-label="Cerrar"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {propuestaIA.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-amber-200/90 bg-white/90 p-4 text-xs shadow-sm"
                  >
                    <p className="mb-2 font-bold text-slate-900">{item?.titulo || `Día ${item?.dia ?? idx + 1}`}</p>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-900">MAÑANA</p>
                    <p className="mb-3 whitespace-pre-wrap leading-relaxed text-slate-700">
                      {item?.manana ?? item?.mañana ?? '—'}
                    </p>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-indigo-900">TARDE / NOCHE</p>
                    <p className="whitespace-pre-wrap leading-relaxed text-slate-700">{item?.tarde_noche ?? '—'}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2 border-t border-amber-200/80 bg-amber-100/40 p-4">
                <button
                  type="button"
                  onClick={aplicarPropuesta}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  <Check size={18} strokeWidth={2.5} /> APLICAR
                </button>
                <button
                  type="button"
                  onClick={descartarPropuesta}
                  className="w-full rounded-2xl border border-amber-300/80 bg-white/80 py-2.5 text-sm font-semibold text-amber-950/80 transition hover:bg-white"
                >
                  Descartar
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
