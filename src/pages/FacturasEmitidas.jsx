import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, Pencil, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { supabase } from '../supabase'
import { getEjercicioActual, getAñosDisponibles, subscribeToEjercicioChanges } from '../utils/ejercicioGlobal'
import {
  abrirPdfFacturaEmitida,
  EVENTO_REFRESCO_FACTURAS_EMITIDAS,
} from '../utils/facturaEmitidaPdf'

const SELECT_FACTURAS =
  'id, numero_factura, fecha_emision, cliente_nombre, importe_total, url_pdf, expediente_id, tipo_factura, datos_factura, expedientes(nombre_grupo)'

const REF_FACTURA_DIRECTA = 'Factura Directa / Pasajero'

const MSJ_BORRADO_CORRELATIVIDAD =
  'Atención: Al borrar esta factura, el sistema podrá reutilizar este número en la próxima emisión para mantener la correlatividad fiscal (huecos).'

const formatEuro = (value) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(
    Number.isFinite(Number(value)) ? Number(value) : 0,
  )

/** Fecha de emisión (columna `fecha_emision`). */
const fechaReferenciaFactura = (row) => {
  const raw = row?.fecha_emision ?? null
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Base e IVA a partir de `importe_total` (21 % por defecto si no hay desglose en BD). */
const baseIvaTotalDesdeFila = (row) => {
  let total = Number(row?.importe_total ?? 0)
  if (!Number.isFinite(total)) total = 0
  const tipoIVA = 21
  const base = Math.round((total / (1 + tipoIVA / 100)) * 100) / 100
  const iva = Math.round((total - base) * 100) / 100
  return { base, iva, total }
}

const nombreGrupoDesdeFila = (row) => {
  const ex = row?.expedientes
  if (ex && typeof ex === 'object' && !Array.isArray(ex)) {
    const ng = ex.nombre_grupo
    if (ng != null && String(ng).trim()) return String(ng).trim()
  }
  return null
}

const textoReferencia = (row, nombreGrupoResolved) => {
  const sinExpediente = row?.expediente_id == null || row?.expediente_id === ''
  const nombre = nombreGrupoResolved
  if (sinExpediente || nombre == null) return REF_FACTURA_DIRECTA
  return nombre
}

/**
 * Ventana maestra: todas las facturas de venta en `facturas_emitidas`.
 * Ruta activa: `/:slug/cierres` (véase App.jsx).
 */
const FacturasEmitidas = () => {
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [busquedaNumero, setBusquedaNumero] = useState('')
  const [añoEjercicio, setAñoEjercicio] = useState(() => getEjercicioActual())
  const [borrandoId, setBorrandoId] = useState(null)

  // Estados para edición de concepto
  const [facturaEditando, setFacturaEditando] = useState(null)
  const [conceptoEditado, setConceptoEditado] = useState('')
  const [guardandoConcepto, setGuardandoConcepto] = useState(false)

  useEffect(() => {
    const unsub = subscribeToEjercicioChanges((y) => {
      if (typeof y === 'number' && Number.isFinite(y)) setAñoEjercicio(y)
    })
    return unsub
  }, [])

  const fetchFacturas = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const res = await supabase
        .from('facturas_emitidas')
        .select(SELECT_FACTURAS)
        .order('fecha_emision', { ascending: false })

      if (res.error) {
        console.error('[FacturasEmitidas]', res.error.message, res.error)
        setError(res.error.message || 'No se pudieron cargar las facturas.')
        setFilas([])
        return
      }

      setFilas(Array.isArray(res.data) ? res.data : [])
    } catch (e) {
      console.error('[FacturasEmitidas]', e)
      setError(String(e?.message || e) || 'Error inesperado.')
      setFilas([])
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    fetchFacturas()
  }, [fetchFacturas])

  useEffect(() => {
    const handler = () => {
      fetchFacturas()
    }
    window.addEventListener(EVENTO_REFRESCO_FACTURAS_EMITIDAS, handler)
    return () => window.removeEventListener(EVENTO_REFRESCO_FACTURAS_EMITIDAS, handler)
  }, [fetchFacturas])

  const añosOpciones = useMemo(() => getAñosDisponibles(), [])

  const filasFiltradas = useMemo(() => {
    const q = busquedaNumero.trim().toLowerCase()
    return filas.filter((row) => {
      const fd = fechaReferenciaFactura(row)
      const y = fd ? fd.getFullYear() : null
      if (y !== null && y !== añoEjercicio) return false
      if (!q) return true
      const num = String(row.numero_factura ?? '').toLowerCase()
      return num.includes(q)
    })
  }, [filas, busquedaNumero, añoEjercicio])

  const handleVerPdf = async (row) => {
    await abrirPdfFacturaEmitida(supabase, row)
  }

  const handleBorrarFactura = async (row) => {
    const id = row?.id
    if (id == null || id === '') return

    const refNum =
      row.numero_factura != null && String(row.numero_factura).trim() !== ''
        ? String(row.numero_factura).trim()
        : '—'

    if (!window.confirm(`¿Eliminar la factura ${refNum} del listado? Esta acción no se puede deshacer.`)) {
      return
    }
    if (!window.confirm(MSJ_BORRADO_CORRELATIVIDAD)) {
      return
    }

    setBorrandoId(id)
    try {
      const { error: delErr } = await supabase.from('facturas_emitidas').delete().eq('id', id)
      if (delErr) {
        window.alert(delErr.message || 'No se pudo borrar la factura.')
        return
      }
      await fetchFacturas()
    } finally {
      setBorrandoId(null)
    }
  }

  const handleAbrirEdicionConcepto = (row) => {
    setFacturaEditando(row)
    setConceptoEditado(row?.datos_factura?.concepto ?? '')
  }

  const handleCerrarEdicionConcepto = () => {
    setFacturaEditando(null)
    setConceptoEditado('')
  }

  const handleGuardarConcepto = async () => {
    if (!facturaEditando?.id) return
    setGuardandoConcepto(true)
    try {
      // Merge seguro: leemos datos_factura actual → sobreescribimos solo el campo concepto
      const datosActuales = facturaEditando.datos_factura ?? {}
      const datosMergeados = { ...datosActuales, concepto: conceptoEditado.trim() }

      const { error: updErr } = await supabase
        .from('facturas_emitidas')
        .update({ datos_factura: datosMergeados })
        .eq('id', facturaEditando.id)

      if (updErr) {
        window.alert(updErr.message || 'No se pudo guardar el concepto.')
        return
      }

      // Actualizar estado local para reflejar el cambio sin recargar toda la lista
      setFilas((prev) =>
        prev.map((r) =>
          r.id === facturaEditando.id ? { ...r, datos_factura: datosMergeados } : r,
        ),
      )
      handleCerrarEdicionConcepto()
    } finally {
      setGuardandoConcepto(false)
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
      {/* ── Modal edición concepto ───────────────────────────────────────── */}
      {facturaEditando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)' }}
          onClick={(e) => { if (e.target === e.currentTarget) handleCerrarEdicionConcepto() }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Editar concepto de factura</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Factura <span className="font-semibold">{facturaEditando.numero_factura || '—'}</span>
                  {facturaEditando.cliente_nombre ? ` · ${facturaEditando.cliente_nombre}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCerrarEdicionConcepto}
                className="shrink-0 rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
                Concepto
              </label>
              <textarea
                rows={3}
                value={conceptoEditado}
                onChange={(e) => setConceptoEditado(e.target.value)}
                className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-slate-900 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                placeholder="Describe el concepto de esta factura…"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleCerrarEdicionConcepto}
                disabled={guardandoConcepto}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarConcepto}
                disabled={guardandoConcepto}
                className="px-4 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {guardandoConcepto ? 'Guardando…' : 'Guardar concepto'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 tracking-tight">Facturas emitidas</h1>
          <p className="text-sm text-slate-600 mt-1">
            Listado de facturas de venta registradas en la base de datos (origen: tabla{' '}
            <code className="text-xs bg-slate-100 px-1 rounded">facturas_emitidas</code>
            ).
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchFacturas()}
          disabled={cargando}
          className="inline-flex items-center gap-2 self-start px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="search"
            placeholder="Buscar por número de factura…"
            value={busquedaNumero}
            onChange={(e) => setBusquedaNumero(e.target.value)}
            className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="facturas-anio" className="text-sm font-medium text-slate-600 whitespace-nowrap">
            Ejercicio (año)
          </label>
          <select
            id="facturas-anio"
            value={añoEjercicio}
            onChange={(e) => setAñoEjercicio(Number(e.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium shadow-sm focus:ring-2 focus:ring-blue-500"
          >
            {añosOpciones.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="px-4 py-3 font-semibold text-slate-700">Nº Factura</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Fecha emisión</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Cliente</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Referencia</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Concepto</th>
                <th className="px-4 py-3 font-semibold text-slate-700 text-right">Base</th>
                <th className="px-4 py-3 font-semibold text-slate-700 text-right">IVA</th>
                <th className="px-4 py-3 font-semibold text-slate-700 text-right">Total</th>
                <th className="px-4 py-3 font-semibold text-slate-700 text-center">PDF</th>
                <th className="px-4 py-3 font-semibold text-slate-700 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                    Cargando facturas…
                  </td>
                </tr>
              ) : filasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                    No hay facturas para este ejercicio
                    {busquedaNumero.trim() ? ' o para el filtro indicado' : ''}.
                  </td>
                </tr>
              ) : (
                filasFiltradas.map((row) => {
                  const fd = fechaReferenciaFactura(row)
                  const fechaTxt = fd
                    ? fd.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—'
                  const { base, iva, total } = baseIvaTotalDesdeFila(row)
                  const referencia = textoReferencia(row, nombreGrupoDesdeFila(row))
                  const concepto = row?.datos_factura?.concepto ?? '—'
                  const busy = borrandoId === row.id

                  return (
                    <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-medium text-navy-900 whitespace-nowrap">{row.numero_factura || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fechaTxt}</td>
                      <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate" title={row.cliente_nombre || ''}>
                        {row.cliente_nombre || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-[220px]" title={referencia}>
                        {referencia}
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-[240px] truncate" title={concepto !== '—' ? concepto : ''}>
                        {concepto}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatEuro(base)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatEuro(iva)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-navy-900">
                        {formatEuro(row.importe_total ?? total)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleVerPdf(row)}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          title="Ver factura PDF"
                        >
                          <FileText size={14} />
                          Ver PDF
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleAbrirEdicionConcepto(row)}
                            className="inline-flex items-center justify-center rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-700 hover:bg-amber-100"
                            title="Editar concepto de la factura"
                            aria-label="Editar concepto"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBorrarFactura(row)}
                            disabled={busy}
                            className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-2 text-red-700 hover:bg-red-100 disabled:opacity-40 disabled:pointer-events-none"
                            title="Eliminar factura del registro"
                            aria-label="Eliminar factura"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default FacturasEmitidas
