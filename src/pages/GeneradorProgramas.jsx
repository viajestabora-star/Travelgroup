import React, { useState, useCallback } from 'react'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabase } from '../supabase'
import { Wand2, Plus, Trash2, Save, Sparkles, Loader2, FileText } from 'lucide-react'

/** Solo desde .env (Vite). No incluir claves en el código: quedan públicas en el bundle. Usa .env.local en desarrollo. */
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY ?? ''

const PROMPT =
  "Eres redactor de Tabora. Divide estas notas en 'manana' y 'tarde_noche'. No inventes NADA. Responde SOLO JSON: [{dia, titulo, manana, tarde_noche}]"

function parseJsonGemini(texto) {
  const limpio = String(texto ?? '')
    .replace(/```json|```/g, '')
    .trim()
  try {
    return JSON.parse(limpio)
  } catch (e) {
    const i = limpio.indexOf('[')
    const j = limpio.lastIndexOf(']')
    if (i < 0 || j <= i) throw e
    return JSON.parse(limpio.slice(i, j + 1).trim())
  }
}

function filaDesdeIA(item, index) {
  const d = Number(item?.dia) > 0 ? Number(item.dia) : index + 1
  return {
    id: Date.now() + index,
    titulo: String(item?.titulo ?? `Día ${d}`),
    manana: String(item?.manana ?? item?.mañana ?? ''),
    tarde_noche: String(item?.tarde_noche ?? ''),
  }
}

function siguienteId(dias) {
  if (!dias.length) return Date.now()
  return Math.max(...dias.map((x) => x.id)) + 1
}

export default function GeneradorProgramas() {
  const [tituloViaje, setTituloViaje] = useState('')
  const [notas, setNotas] = useState('')
  const [dias, setDias] = useState([{ id: Date.now(), titulo: 'Día 1', manana: '', tarde_noche: '' }])
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [toast, setToast] = useState(null)

  const aviso = useCallback((texto, ok = true, ms = 5000) => {
    setToast({ ok, texto })
    if (ms > 0) setTimeout(() => setToast(null), ms)
  }, [])

  const optimizar = async () => {
    if (!notas.trim()) {
      aviso('Añade notas antes de optimizar.', false)
      return
    }

    setCargando(true)
    try {
      const key = String(API_KEY).trim()
      if (!key) throw new Error('No se pudo conectar con el servicio de IA.')

      const genAI = new GoogleGenerativeAI(key)
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        systemInstruction: PROMPT,
      })
      const out = await model.generateContent(notas.trim())
      const parsed = parseJsonGemini(out.response.text())

      if (!Array.isArray(parsed) || !parsed.length) {
        throw new Error('La respuesta no es una lista de días.')
      }

      setDias(parsed.map((item, idx) => filaDesdeIA(item, idx)))
      aviso('Itinerario generado.')
    } catch (e) {
      console.error('[GeneradorProgramas]', e)
      aviso(e?.message || 'Error al optimizar.', false, 7000)
    } finally {
      setCargando(false)
    }
  }

  const anadirDia = () => {
    setDias((prev) => [
      ...prev,
      { id: siguienteId(prev), titulo: `Día ${prev.length + 1}`, manana: '', tarde_noche: '' },
    ])
  }

  const quitarDia = (id) => setDias((prev) => prev.filter((d) => d.id !== id))

  const actualizar = (id, campo, valor) => {
    if (!['titulo', 'manana', 'tarde_noche'].includes(campo)) return
    setDias((prev) => prev.map((d) => (d.id === id ? { ...d, [campo]: valor } : d)))
  }

  const guardar = async () => {
    setGuardando(true)
    try {
      const nombre = tituloViaje.trim() || 'Itinerario sin título'
      const itinerario_json = JSON.stringify(dias)

      const { error } = await supabase.from('programas_viaje').upsert(
        { nombre_grupo: nombre, notas_ia: notas, itinerario_json },
        { onConflict: 'nombre_grupo' }
      )

      if (error) throw error
      aviso('Guardado en Supabase.')
    } catch (e) {
      console.error('[GeneradorProgramas] guardar', e)
      aviso(e?.message || 'Error al guardar.', false, 8000)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-10">
      <header className="mb-6 flex items-center gap-3">
        <div className="rounded-2xl bg-violet-100 p-2.5">
          <Wand2 size={22} className="text-violet-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Diseñador de Programas</h1>
          <p className="text-sm text-slate-500">Tabora · Mañana / Tarde-noche</p>
        </div>
      </header>

      {toast && (
        <div
          className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${
            toast.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-800'
          }`}
        >
          {toast.texto}
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Izquierda: notas */}
        <aside className="w-full shrink-0 lg:w-[min(100%,340px)] lg:sticky lg:top-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <FileText size={14} /> Notas
            </h2>
            <label className="mb-1 block text-xs font-medium text-slate-600">Título del viaje</label>
            <input
              value={tituloViaje}
              onChange={(e) => setTituloViaje(e.target.value)}
              className="mb-4 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
              placeholder="Nombre del programa"
            />
            <label className="mb-1 block text-xs font-medium text-slate-600">Texto base</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={14}
              className="min-h-[200px] w-full resize-y rounded-2xl border border-slate-200 px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-200"
              placeholder="Pega las notas del proveedor…"
            />
            <button
              type="button"
              onClick={optimizar}
              disabled={cargando || !notas.trim()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 py-3 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-40"
            >
              {cargando ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              OPTIMIZAR
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white disabled:bg-slate-400"
            >
              {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              GUARDAR
            </button>
          </div>
        </aside>

        {/* Derecha: itinerario */}
        <main className="min-w-0 flex-1 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-700">Itinerario</h2>
            <button
              type="button"
              onClick={anadirDia}
              className="inline-flex items-center gap-1 rounded-2xl border border-violet-200 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50"
            >
              <Plus size={14} /> Añadir día
            </button>
          </div>

          {dias.map((d) => (
            <section key={d.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <input
                  value={d.titulo}
                  onChange={(e) => actualizar(d.id, 'titulo', e.target.value)}
                  className="min-w-0 flex-1 border-b border-slate-200 bg-transparent pb-1 text-sm font-semibold focus:border-violet-400 focus:outline-none"
                  placeholder="Título del día"
                />
                <button
                  type="button"
                  onClick={() => quitarDia(d.id)}
                  className="shrink-0 rounded-xl p-2 text-slate-300 hover:bg-red-50 hover:text-red-500"
                  aria-label="Quitar día"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-3">
                  <label className="mb-2 block text-xs font-semibold text-amber-900">Mañana</label>
                  <textarea
                    value={d.manana}
                    onChange={(e) => actualizar(d.id, 'manana', e.target.value)}
                    rows={5}
                    className="w-full resize-y rounded-xl border border-amber-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
                  />
                </div>
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3">
                  <label className="mb-2 block text-xs font-semibold text-indigo-900">Tarde / Noche</label>
                  <textarea
                    value={d.tarde_noche}
                    onChange={(e) => actualizar(d.id, 'tarde_noche', e.target.value)}
                    rows={5}
                    className="w-full resize-y rounded-xl border border-indigo-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
              </div>
            </section>
          ))}
        </main>
      </div>
    </div>
  )
}
