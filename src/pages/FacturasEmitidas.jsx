import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, RefreshCw, Search } from 'lucide-react'
import { supabase } from '../supabase'
import { getEjercicioActual, getAñosDisponibles, subscribeToEjercicioChanges } from '../utils/ejercicioGlobal'

const SELECT_FACTURAS =
  'id, numero_factura, fecha_emision, cliente_nombre, importe_total, url_pdf, expediente_id, tipo_factura, expedientes(nombre_grupo)'

const REF_FACTURA_DIRECTA = 'Factura Directa / Pasajero'

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
 * No altera el flujo de emisión desde expedientes.
 */
const FacturasEmitidas = () => {
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [busquedaNumero, setBusquedaNumero] = useState('')
  const [añoEjercicio, setAñoEjercicio] = useState(() => getEjercicioActual())

  useEffect(() => {
    const unsub = subscribeToEjercicioChanges((y) => {
      if (typeof y === 'number' && Number.isFinite(y)) setAñoEjercicio(y)
    })
    return unsub
  }, [])

  const cargar = useCallback(async () => {
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
    cargar()
  }, [cargar])

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

  const abrirPdf = (row) => {
    const raw = row?.url_pdf
    if (raw == null || String(raw).trim() === '') {
      window.alert('Esta factura no tiene PDF asociado en la base de datos.')
      return
    }
    window.open(String(raw).trim(), '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
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
          onClick={() => cargar()}
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
                <th className="px-4 py-3 font-semibold text-slate-700 text-right">Base</th>
                <th className="px-4 py-3 font-semibold text-slate-700 text-right">IVA</th>
                <th className="px-4 py-3 font-semibold text-slate-700 text-right">Total</th>
                <th className="px-4 py-3 font-semibold text-slate-700 text-center">PDF</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    Cargando facturas…
                  </td>
                </tr>
              ) : filasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
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
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatEuro(base)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatEuro(iva)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-navy-900">
                        {formatEuro(row.importe_total ?? total)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => abrirPdf(row)}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          title="Ver factura PDF"
                        >
                          <FileText size={14} />
                          Ver PDF
                        </button>
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
