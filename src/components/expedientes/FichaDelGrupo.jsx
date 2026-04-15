import React, { useState, useEffect, useRef } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import { supabase } from '../../supabase'

function normalizarDestinoParaDb(raw) {
  const t = String(raw ?? '').trim()
  return t === '' ? null : t
}

/** Persiste `expedientes.destino` (text / null). Devuelve cadena vacía o texto para estado local. */
export async function persistirDestinoExpediente(expedienteId, destinoRaw) {
  if (!expedienteId) throw new Error('Falta expediente')
  const dest = normalizarDestinoParaDb(destinoRaw)
  const { error } = await supabase.from('expedientes').update({ destino: dest }).eq('id', expedienteId)
  if (error) throw error
  return dest ?? ''
}

/**
 * Destino del expediente: en tarjeta/cabecera, clic en el texto → input; Enter o blur guardan.
 * Variante `form`: input siempre visible (pestaña Ficha del Grupo).
 */
export function DestinoExpedienteEditable({ expedienteId, value, onSaved, variant = 'card', className = '' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)
  const commitLockRef = useRef(false)

  useEffect(() => {
    setDraft(value ?? '')
  }, [value, expedienteId])

  useEffect(() => {
    if (editing && inputRef.current && variant !== 'form') {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing, variant])

  const commit = async () => {
    if (!expedienteId || commitLockRef.current) return
    const prev = String(value ?? '').trim()
    const next = String(draft ?? '').trim()
    if (prev === next) {
      if (variant !== 'form') setEditing(false)
      setDraft(value ?? '')
      return
    }
    commitLockRef.current = true
    setSaving(true)
    try {
      const normalized = await persistirDestinoExpediente(expedienteId, draft)
      onSaved?.(normalized)
      if (variant !== 'form') setEditing(false)
      setDraft(normalized)
    } catch (e) {
      console.error(e)
      alert(e?.message || 'No se pudo guardar el destino.')
      setDraft(value ?? '')
    } finally {
      setSaving(false)
      commitLockRef.current = false
    }
  }

  const cancelar = () => {
    setDraft(value ?? '')
    setEditing(false)
  }

  const inputBase =
    variant === 'card'
      ? 'flex-1 min-w-0 bg-blue-50/90 border border-blue-200 rounded-lg px-2 py-1 text-base font-bold text-blue-900 placeholder:text-blue-300/80 focus:outline-none focus:ring-2 focus:ring-blue-400/40'
      : variant === 'header'
        ? 'flex-1 min-w-0 bg-white/95 border border-blue-200 rounded-lg px-3 py-1.5 text-xl font-bold text-blue-900 placeholder:text-blue-300/80 focus:outline-none focus:ring-2 focus:ring-blue-400/40 shadow-sm'
        : 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-base font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/35 pr-10'

  if (variant === 'form') {
    return (
      <div className={`md:col-span-2 ${className}`}>
        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
          Destino del viaje
        </label>
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void commit()
              }
            }}
            disabled={saving}
            className={`${inputBase} ${saving ? 'opacity-75 bg-blue-50/50' : ''}`}
            placeholder="Ej. Roma, Costa Dorada…"
          />
          {saving ? (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-blue-600">
              <Loader2 className="animate-spin" size={18} aria-hidden />
            </span>
          ) : null}
        </div>
        <p className="text-xs text-slate-400 mt-1">Guardado al pulsar Enter o al salir del campo.</p>
      </div>
    )
  }

  const etiqueta = value ? String(value) : 'Sin destino'

  return (
    <div
      className={`${variant === 'card' ? 'flex items-center gap-2 text-xl text-blue-700 font-bold' : 'flex items-center gap-2 text-2xl font-bold text-blue-700'} ${className} ${saving && !editing ? 'text-blue-600/90' : ''}`}
      style={variant === 'card' ? { fontSize: '16px' } : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      <MapPin size={variant === 'header' ? 20 : 18} className="shrink-0 text-blue-700" aria-hidden />
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void commit()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              cancelar()
            }
          }}
          disabled={saving}
          className={`${inputBase} ${saving ? 'opacity-75' : ''}`}
          placeholder="Destino"
        />
      ) : (
        <button
          type="button"
          onClick={() => !saving && setEditing(true)}
          className={`text-left min-w-0 flex-1 rounded-md px-0.5 -mx-0.5 transition-colors ${saving ? 'cursor-wait text-blue-600' : 'cursor-text hover:bg-blue-50/60'}`}
          title="Clic para editar destino"
        >
          <span className={saving ? 'inline-flex items-center gap-2' : ''}>
            {saving ? (
              <>
                <Loader2 className="animate-spin shrink-0 inline" size={16} aria-hidden />
                <span>Guardando…</span>
              </>
            ) : (
              etiqueta
            )}
          </span>
        </button>
      )}
      {saving && editing ? (
        <Loader2 className="animate-spin text-blue-600 shrink-0" size={16} aria-hidden />
      ) : null}
    </div>
  )
}
