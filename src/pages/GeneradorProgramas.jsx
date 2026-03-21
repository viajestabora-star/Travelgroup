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
  KeyRound,
} from 'lucide-react'

const PROMPT_GEMINI =
  "Eres un redactor de lujo para Tabora. Estructura estas notas en bloques de Mañana y Tarde/Noche. REGLA DE ORO: No inventes nada, mantén la fidelidad total a los servicios descritos. Devuelve solo JSON: [{dia: 1, titulo: '...', manana: '...', tarde_noche: '...'}]"

/** 1) Vite env · 2) clave pegada en estado (Configurar API). */
function getApiKey(claveManual) {
  const env = import.meta.env.VITE_GEMINI_API_KEY
  if (env != null && String(env).trim() !== '') return String(env).trim()
  if (claveManual != null && String(claveManual).trim() !== '') return String(claveManual).trim()
  return ''
}

function parseJsonIA(texto) {
  const t = String(texto ?? '')
    .replace(/```json|```/g, '')
    .trim()
  try {
    return JSON.parse(t)
  } catch {
    const a = t.indexOf('[')
    const b = t.lastIndexOf(']')
    if (a < 0 || b <= a) throw new Error('La IA no devolvió JSON válido.')
    return JSON.parse(t.slice(a, b + 1).trim())
  }
}

function diaDesdeIA(raw, index) {
  const n = Number(raw?.dia) > 0 ? Number(raw.dia) : index + 1
  return {
    dia: n,
    titulo: String(raw?.titulo ?? `Día ${n}`),
    manana: String(raw?.manana ?? raw?.mañana ?? ''),
    tarde_noche: String(raw?.tarde_noche ?? ''),
  }
}

function crearDiaVacio(numero) {
  return { dia: numero, titulo: `Día ${numero}`, manana: '', tarde_noche: '' }
}

function maxDia(lista) {
  if (!lista.length) return 0
  return Math.max(...lista.map((d) => d.dia))
}

export default function GeneradorProgramas() {
  const [tituloViaje, setTituloViaje] = useState('')
  const [notas, setNotas] = useState('')
  const [dias, setDias] = useState(() => [crearDiaVacio(1)])
  const [claveManual, setClaveManual] = useState('')
  const [mostrarApi, setMostrarApi] = useState(false)
  const [inputClave, setInputClave] = useState('')
  const [propuestaIA, setPropuestaIA] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [toast, setToast] = useState(null)

  const toastMsg = useCallback((texto, ok = true, ms = 5500) => {
    setToast({ ok, texto })
    if (ms > 0) setTimeout(() => setToast(null), ms)
  }, [])

  const aplicarClave = () => {
    const k = inputClave.trim()
    if (!k) {
      toastMsg('Pega una clave válida.', false)
      return
    }
    setClaveManual(k)
    setInputClave('')
    setMostrarApi(false)
    toastMsg('Clave aplicada. Ya puedes optimizar.')
  }

  const optimizar = async () => {
    const key = getApiKey(claveManual)
    if (!key) {
      setMostrarApi(true)
      toastMsg('Configura la API: pulsa «Configurar API» y pega tu clave, o usa VITE_GEMINI_API_KEY en .env.', false, 8000)
      return
    }
    if (!notas.trim()) {
      toastMsg('Añade notas antes de optimizar.', false)
      return
    }

    setCargando(true)
    try {
      const genAI = new GoogleGenerativeAI(key)
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        systemInstruction: PROMPT_GEMINI,
      })
      const out = await model.generateContent(notas.trim())
      const arr = parseJsonIA(out.response.text())
      if (!Array.isArray(arr) || !arr.length) throw new Error('Respuesta vacía o inválida.')
      setPropuestaIA(arr.map((item, i) => diaDesdeIA(item, i)))
      toastMsg('Revisa el panel y pulsa Aplicar si te encaja.')
    } catch (e) {
      console.error('[GeneradorProgramas]', e)
      toastMsg(e?.message || 'Error con Gemini.', false, 8000)
    } finally {
      setCargando(false)
    }
  }

  const aplicarRevision = () => {
    if (!propuestaIA?.length) {
      toastMsg('No hay propuesta.', false)
      return
    }
    setDias(propuestaIA.map((d, i) => ({ ...d, dia: i + 1 })))
    setPropuestaIA(null)
    toastMsg('Cambios aplicados al itinerario.')
  }

  const cerrarRevision = () => setPropuestaIA(null)

  const anadirDia = () => {
    setDias((prev) => [...prev, crearDiaVacio(maxDia(prev) + 1)])
  }

  const quitarDia = (diaNum) => {
    setDias((prev) => {
      const rest = prev.filter((d) => d.dia !== diaNum)
      return rest.map((d, i) => ({ ...d, dia: i + 1 }))
    })
  }

  const patchDia = (diaNum, campo, valor) => {
    if (!['titulo', 'manana', 'tarde_noche'].includes(campo)) return
    setDias((prev) => prev.map((d) => (d.dia === diaNum ? { ...d, [campo]: valor } : d)))
  }

  const guardar = async () => {
    setGuardando(true)
    const nombre = tituloViaje.trim() || 'Itinerario sin título'
    const itinerario_json = JSON.stringify(
      dias.map((d) => ({
        dia: d.dia,
        titulo: d.titulo,
        manana: d.manana,
        tarde_noche: d.tarde_noche,
      }))
    )

    const { error } = await supabase.from('programas_viaje').upsert(
      { nombre_grupo: nombre, notas_ia: notas, itinerario_json },
      { onConflict: 'nombre_grupo' }
    )

    setGuardando(false)
    if (error) {
      console.error('[GeneradorProgramas] guardar', error)
      toastMsg(error.message, false, 8000)
    } else {
      toastMsg('Guardado en Supabase.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-10">
      <header className="mb-8 flex items-start gap-4">
        <div className="rounded-2xl bg-violet-100 p-3">
          <Wand2 size={24} className="text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Diseñador de Programas</h1>
          <p className="text-sm text-slate-500">Tabora · Mañana / Tarde-noche · Revisión · Guardar</p>
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

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6 lg:flex-row">
          <aside className="shrink-0 lg:w-[280px]">
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <FileText size={14} /> Datos
              </h2>

              <div>
                <button
                  type="button"
                  onClick={() => setMostrarApi((v) => !v)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <KeyRound size={15} />
                  Configurar API
                </button>
                {mostrarApi && (
                  <div className="mt-3 space-y-2">
                    <input
                      type="password"
                      autoComplete="off"
                      value={inputClave}
                      onChange={(e) => setInputClave(e.target.value)}
                      placeholder="Pegar clave Gemini…"
                      className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
                    />
                    <button
                      type="button"
                      onClick={aplicarClave}
                      className="w-full rounded-2xl bg-violet-600 py-2 text-xs font-bold text-white hover:bg-violet-700"
                    >
                      Usar esta clave
                    </button>
                  </div>
                )}
                {claveManual ? (
                  <p className="mt-2 text-[10px] text-slate-500">Clave manual en uso (solo esta sesión).</p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Título del viaje</label>
                <input
                  value={tituloViaje}
                  onChange={(e) => setTituloViaje(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Notas</label>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows={9}
                  className="min-h-[140px] w-full resize-y rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-100"
                  placeholder="Notas del proveedor…"
                />
                <button
                  type="button"
                  onClick={optimizar}
                  disabled={cargando || !notas.trim()}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 py-3 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-40"
                >
                  {cargando ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  OPTIMIZAR
                </button>
              </div>

              <button
                type="button"
                onClick={anadirDia}
                className="w-full rounded-2xl border-2 border-dashed border-violet-200 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50/60"
              >
                <Plus size={16} className="mr-1 inline" /> Añadir día
              </button>

              <button
                type="button"
                onClick={guardar}
                disabled={guardando}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white disabled:bg-slate-400"
              >
                {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                GUARDAR
              </button>
            </div>
          </aside>

          <main className="min-w-0 flex-1 space-y-4">
            {dias.map((d) => (
              <section key={d.dia} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-100 text-xs font-bold text-violet-700">
                    {d.dia}
                  </span>
                  <input
                    value={d.titulo}
                    onChange={(e) => patchDia(d.dia, 'titulo', e.target.value)}
                    className="min-w-0 flex-1 border-b border-slate-200 bg-transparent pb-1 text-sm font-semibold focus:border-violet-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => quitarDia(d.dia)}
                    className="rounded-xl p-2 text-slate-300 hover:bg-red-50 hover:text-red-500"
                    aria-label="Quitar día"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border-2 border-amber-100 bg-amber-50/40 p-3">
                    <label className="mb-2 block text-[10px] font-bold uppercase text-amber-900">MAÑANA</label>
                    <textarea
                      value={d.manana}
                      onChange={(e) => patchDia(d.dia, 'manana', e.target.value)}
                      rows={4}
                      className="w-full resize-y rounded-xl border border-amber-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
                    />
                  </div>
                  <div className="rounded-2xl border-2 border-indigo-100 bg-indigo-50/40 p-3">
                    <label className="mb-2 block text-[10px] font-bold uppercase text-indigo-900">TARDE / NOCHE</label>
                    <textarea
                      value={d.tarde_noche}
                      onChange={(e) => patchDia(d.dia, 'tarde_noche', e.target.value)}
                      rows={4}
                      className="w-full resize-y rounded-xl border border-indigo-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </div>
                </div>
              </section>
            ))}
          </main>
        </div>

        {propuestaIA && (
          <aside className="w-full shrink-0 xl:sticky xl:top-6 xl:w-[360px]">
            <div className="flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg xl:max-h-[calc(100vh-2rem)]">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Revisión</h2>
                <button type="button" onClick={cerrarRevision} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {propuestaIA.map((item, idx) => (
                  <div key={`${item.dia}-${idx}`} className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs">
                    <p className="mb-2 font-bold text-slate-900">
                      Día {item.dia} · {item.titulo}
                    </p>
                    <p className="mb-1 font-bold uppercase text-amber-900">MAÑANA</p>
                    <p className="mb-2 whitespace-pre-wrap text-slate-700">{item.manana || '—'}</p>
                    <p className="mb-1 font-bold uppercase text-indigo-900">TARDE / NOCHE</p>
                    <p className="whitespace-pre-wrap text-slate-700">{item.tarde_noche || '—'}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2 border-t border-slate-100 p-4">
                <button
                  type="button"
                  onClick={aplicarRevision}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  <Check size={18} /> Aplicar
                </button>
                <button
                  type="button"
                  onClick={cerrarRevision}
                  className="w-full rounded-2xl border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
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
