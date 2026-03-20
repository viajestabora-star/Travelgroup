import React, { useState } from 'react'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabase } from '../supabase'
import { Wand2, Plus, Trash2, Save, Sparkles, Loader2 } from 'lucide-react'

/** Quita cercos ```json ... ``` que a veces devuelve el modelo. */
const limpiarJSONMarkdown = (raw) => {
  let t = String(raw ?? '').trim()
  const bloque = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/im
  const m = t.match(bloque)
  if (m) return m[1].trim()
  return t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
}

/** Intenta aislar el array si hubo texto extra. */
const extraerJSONArray = (text) => {
  const s = text.indexOf('[')
  const e = text.lastIndexOf(']')
  if (s >= 0 && e > s) return text.slice(s, e + 1).trim()
  return text
}

const SYSTEM_ITINERARIO = `Eres un redactor de viajes de lujo. Tu objetivo es transformar las notas del usuario en un itinerario fascinante. Responde ÚNICAMENTE con un array JSON con este formato: [{"titulo": "...", "contenido": "..."}]. No añadas texto de bienvenida ni despedida, solo el JSON puro.`

const GeneradorProgramas = ({ user }) => {
  const [titulo,       setTitulo]       = useState('')
  const [notasGemini,  setNotasGemini]  = useState('')
  const [dias,         setDias]         = useState([{ id: 1, titulo: 'Día 1', contenido: '' }])
  const [guardando,    setGuardando]    = useState(false)
  const [cargandoIA,   setCargandoIA]   = useState(false)
  const [msg,          setMsg]          = useState(null)

  const agregarDia = () =>
    setDias(prev => [...prev, { id: Date.now(), titulo: `Día ${prev.length + 1}`, contenido: '' }])

  const eliminarDia = (id) =>
    setDias(prev => prev.filter(d => d.id !== id))

  const actualizarDia = (id, campo, valor) =>
    setDias(prev => prev.map(d => d.id === id ? { ...d, [campo]: valor } : d))

  const redactarConIA = async () => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!String(apiKey || '').trim()) {
      setMsg({ ok: false, text: 'Define VITE_GEMINI_API_KEY en tu .env (raíz del proyecto).' })
      setTimeout(() => setMsg(null), 5000)
      return
    }
    if (!notasGemini.trim()) {
      setMsg({ ok: false, text: 'Escribe notas para Gemini antes de redactar.' })
      setTimeout(() => setMsg(null), 4000)
      return
    }

    setCargandoIA(true)
    try {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        systemInstruction: SYSTEM_ITINERARIO,
      })
      const result = await model.generateContent(notasGemini.trim())
      const raw = result.response.text()

      let jsonStr = limpiarJSONMarkdown(raw)
      let parsed
      try {
        parsed = JSON.parse(jsonStr)
      } catch {
        parsed = JSON.parse(extraerJSONArray(jsonStr))
      }

      if (!Array.isArray(parsed)) throw new Error('La respuesta no es un array JSON válido.')

      const base = Date.now()
      setDias(
        parsed.map((item, i) => ({
          id: base + i,
          titulo: String(item?.titulo ?? `Día ${i + 1}`),
          contenido: String(item?.contenido ?? ''),
        }))
      )
      setMsg({ ok: true, text: '✨ Itinerario generado con IA.' })
      setTimeout(() => setMsg(null), 4000)
    } catch (e) {
      setMsg({ ok: false, text: e?.message ? `IA: ${e.message}` : 'No se pudo interpretar la respuesta de la IA.' })
      setTimeout(() => setMsg(null), 6000)
    } finally {
      setCargandoIA(false)
    }
  }

  const handleGuardar = async () => {
    if (!titulo.trim()) { setMsg({ ok: false, text: 'Añade un título al programa.' }); return }
    setGuardando(true)

    const payload = {
      nombre_grupo:    titulo,
      notas_ia:        notasGemini,
      itinerario_json: JSON.stringify(dias),
      user_email:      user?.email ?? null,
      updated_at:      new Date().toISOString(),
    }

    // Buscar si ya existe un programa con ese título para hacer update
    const { data: existing } = await supabase
      .from('programas_viaje')
      .select('id')
      .eq('nombre_grupo', titulo)
      .maybeSingle()

    const { error } = existing?.id
      ? await supabase.from('programas_viaje').update(payload).eq('id', existing.id)
      : await supabase.from('programas_viaje').insert([{ ...payload, created_at: new Date().toISOString() }])

    setGuardando(false)
    setMsg(error
      ? { ok: false, text: `Error: ${error.message}` }
      : { ok: true,  text: '✅ Programa guardado.' }
    )
    setTimeout(() => setMsg(null), 4000)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-10">

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 bg-violet-100 rounded-xl">
          <Wand2 size={22} className="text-violet-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800">Diseñador de Programas</h1>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">

        {/* ── Columna izquierda: Configuración (30%) ── */}
        <aside className="lg:w-[30%] space-y-4">

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Configuración</h2>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Título del viaje</label>
              <input
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                placeholder="Ej: Ruta por Galicia 2025"
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                <Sparkles size={11} className="inline mr-1 text-violet-400" />
                Notas para Gemini
              </label>
              <textarea
                value={notasGemini}
                onChange={e => setNotasGemini(e.target.value)}
                rows={5}
                placeholder={'Ej: "Itinerario romántico, tono cercano, incluye gastronomía local y tiempos libres."'}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-all resize-none leading-relaxed"
              />
              <button
                type="button"
                onClick={redactarConIA}
                disabled={cargandoIA || guardando || !notasGemini.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-all shadow-sm"
              >
                {cargandoIA
                  ? <><Loader2 size={16} className="animate-spin" /> Generando…</>
                  : <><Sparkles size={16} /> ✨ Redactar con IA</>}
              </button>
            </div>

            <button
              type="button"
              onClick={agregarDia}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-violet-300 text-violet-600 hover:bg-violet-50 text-sm font-semibold transition-colors"
            >
              <Plus size={16} /> Añadir Día
            </button>

            <button
              type="button"
              onClick={handleGuardar}
              disabled={guardando}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 text-white text-sm font-bold transition-colors"
            >
              {guardando
                ? <><Loader2 size={15} className="animate-spin" /> Guardando…</>
                : <><Save size={15} /> Guardar Programa</>}
            </button>

            {msg && (
              <p className={`text-xs font-medium text-center rounded-lg py-2 px-3 ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {msg.text}
              </p>
            )}
          </div>

        </aside>

        {/* ── Columna derecha: Itinerario (70%) ── */}
        <main className="flex-1 space-y-4">

          {dias.length === 0 && (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 flex items-center justify-center py-24 text-slate-400 text-sm">
              Pulsa «Añadir Día» para empezar el itinerario
            </div>
          )}

          {dias.map((dia, idx) => (
            <div key={dia.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
              <div className="flex items-center gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center">
                  {idx + 1}
                </span>
                <input
                  value={dia.titulo}
                  onChange={e => actualizarDia(dia.id, 'titulo', e.target.value)}
                  placeholder={`Día ${idx + 1} – Título`}
                  className="flex-1 text-sm font-semibold text-slate-800 bg-transparent border-b border-slate-200 focus:outline-none focus:border-violet-400 pb-1 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => eliminarDia(dia.id)}
                  className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                  title="Eliminar día"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <textarea
                value={dia.contenido}
                onChange={e => actualizarDia(dia.id, 'contenido', e.target.value)}
                rows={5}
                placeholder="Describe las actividades, alojamiento, restaurantes y experiencias de este día…"
                className="w-full px-3 py-2.5 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 transition-all resize-none leading-relaxed"
              />
            </div>
          ))}

        </main>
      </div>
    </div>
  )
}

export default GeneradorProgramas
