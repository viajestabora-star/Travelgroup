import React, { useState, useEffect, useRef } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import { supabase } from '../../supabase'

function normalizarDestinoParaDb(raw) {
  const t = String(raw ?? '').trim()
  return t === '' ? null : t
}

// ── Pagos a proveedores: misma fuente que el presupuesto (variante / servicios_cotizacion) ──

function normalizarClavePagos(text) {
  if (text == null) return ''
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/** Importe mostrado como «Presupuestado» en la pestaña Pagos (alineado con ExpedienteDetalle). */
export function importePresupuestadoServicioParaPagos(s) {
  if (!s) return 0
  const n = Number(s.total_servicio_manual || s.total_servicio || s.coste_unitario || 0)
  return Number.isFinite(n) ? n : 0
}

/** True si hay proveedor por id FK o por nombre (manual / temporal / resuelto). */
export function servicioTieneProveedorAsignadoParaPagos(s) {
  if (!s) return false
  const rawId = s.proveedor_id_int ?? s.proveedorId
  if (rawId != null && rawId !== '' && !Number.isNaN(Number(rawId)) && Number(rawId) > 0) return true
  const nom = String(
    s._proveedorNombre
      || s.nombre_proveedor_texto
      || s.nombre_proveedor_manual
      || s.proveedorNombreTemporal
      || ''
  ).trim()
  return nom.length > 0
}

/**
 * Descarta filas sin proveedor e importe 0 (ruido en la pestaña).
 * Debe aplicarse tras enriquecer `_proveedorNombre` si se usa resolución por id.
 */
export function filtrarServiciosParaTabPagosProveedores(servicios) {
  if (!Array.isArray(servicios)) return []
  return servicios.filter((s) => {
    if (!s) return false
    const tieneProv = servicioTieneProveedorAsignadoParaPagos(s)
    const imp = importePresupuestadoServicioParaPagos(s)
    if (!tieneProv && imp === 0) return false
    return true
  })
}

/**
 * Unifica filas con el mismo tipo+nombre de servicio y mismo proveedor (id o nombre resuelto).
 * Expone `_idsServiciosAgrupados` para enlazar pagos_proveedores.servicio_id con cualquier id del grupo.
 */
export function unificarServiciosPagosPorNombreYProveedor(servicios) {
  if (!Array.isArray(servicios)) return []
  const map = new Map()
  const order = []
  for (const raw of servicios) {
    if (!raw) continue
    const nombreKey = `${normalizarClavePagos(raw.tipo_servicio || raw.tipo)}|${normalizarClavePagos(raw.nombre_especifico || raw.nombreEspecifico || '')}`
    let provKey
    if (raw.proveedor_id_int != null && raw.proveedor_id_int !== '' && !Number.isNaN(Number(raw.proveedor_id_int))) {
      provKey = `id:${Number(raw.proveedor_id_int)}`
    } else {
      provKey = `nom:${normalizarClavePagos(raw._proveedorNombre)}`
    }
    const key = `${nombreKey}@@${provKey}`
    if (!map.has(key)) {
      map.set(key, { ...raw, _idsServiciosAgrupados: [raw.id] })
      order.push(key)
      continue
    }
    const prev = map.get(key)
    const prevIds = prev._idsServiciosAgrupados || [prev.id]
    const sumImp =
      importePresupuestadoServicioParaPagos(prev) + importePresupuestadoServicioParaPagos(raw)
    map.set(key, {
      ...prev,
      _idsServiciosAgrupados: [...prevIds, raw.id],
      total_servicio_manual: sumImp,
      total_servicio: sumImp,
    })
  }
  return order.map((k) => map.get(k))
}

/** Alinea campos snake/camel del presupuesto antes del pipeline de Pagos. */
export function normalizarServicioFuentePresupuestoParaPagos(s) {
  if (!s || typeof s !== 'object') return null
  const pid =
    s.proveedor_id_int != null && s.proveedor_id_int !== '' && !Number.isNaN(Number(s.proveedor_id_int))
      ? Number(s.proveedor_id_int)
      : (s.proveedorId != null && s.proveedorId !== '' && !Number.isNaN(Number(s.proveedorId))
        ? Number(s.proveedorId)
        : null)
  const manual = String(s.nombre_proveedor_manual || '').trim()
  const temp = String(s.proveedorNombreTemporal || '').trim()
  return {
    ...s,
    tipo_servicio: s.tipo_servicio || s.tipo || 'Hotel',
    nombre_especifico: s.nombre_especifico ?? s.nombreEspecifico ?? '',
    proveedor_id_int: pid,
    nombre_proveedor_manual: manual || temp || '',
  }
}

export function idsServicioFilaPagos(fila) {
  if (!fila) return []
  if (Array.isArray(fila._idsServiciosAgrupados) && fila._idsServiciosAgrupados.length > 0) {
    return [...new Set(fila._idsServiciosAgrupados.map((x) => String(x)))]
  }
  return fila.id != null ? [String(fila.id)] : []
}

/**
 * Limpia el array persistido en expedientes (columna real: desglose_grupos).
 * Elimina entradas nulas / no objeto y claves undefined/null antes de Supabase.
 */
export function limpiarDesgloseGruposParaSupabase(grupos) {
  if (!Array.isArray(grupos)) return []
  return grupos
    .filter((g) => g != null && typeof g === 'object' && !Array.isArray(g))
    .map((g) => {
      const out = { ...g }
      Object.keys(out).forEach((k) => {
        if (out[k] === undefined || out[k] === null) delete out[k]
      })
      out.nombre_grupo = String(out.nombre_grupo ?? '').trim()
      return out
    })
    .filter((g) => g.nombre_grupo || Number(g.pax) > 0)
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
