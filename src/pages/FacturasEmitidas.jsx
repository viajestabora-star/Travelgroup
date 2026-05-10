import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, RefreshCw, Search } from 'lucide-react'
import { supabase } from '../supabase'
import { resolverUrlFacturaCliente } from '../utils/historialCierresShared'
import { getEjercicioActual, getAñosDisponibles, subscribeToEjercicioChanges } from '../utils/ejercicioGlobal'

/** Sin columnas opcionales no uniformes en todos los proyectos; fechas también vienen en `datos_factura`. */
const SELECT_FACTURAS_EMBED =
  'id, expediente_id, cliente_nombre, importe_total, numero_factura, url_pdf, datos_factura, created_at, expedientes(nombre_grupo)'

const SELECT_FACTURAS_PLANO =
  'id, expediente_id, cliente_nombre, importe_total, numero_factura, url_pdf, datos_factura, created_at'

/** Fecha de emisión efectiva (columna o JSON o alta). */
const fechaReferenciaFactura = (row) => {
  const datos = row?.datos_factura && typeof row.datos_factura === 'object' ? row.datos_factura : {}
  const raw = row?.fecha_emision ?? datos.fecha_emision ?? row?.created_at ?? null
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

const baseIvaTotalDesdeFila = (row) => {
  const datos = row?.datos_factura && typeof row.datos_factura === 'object' ? row.datos_factura : {}
  const calc = datos.calcularBaseFactura && typeof datos.calcularBaseFactura === 'object' ? datos.calcularBaseFactura : {}
  let total = Number(row?.importe_total ?? calc.totalFactura ?? datos.importe_total ?? 0)
  if (!Number.isFinite(total)) total = 0
  let base = Number(calc.baseImponible ?? 0)
  let iva = Number(calc.iva ?? 0)
  if (total > 0 && base === 0 && iva === 0) {
    const tipoIVA = Number(calc.tipoIVA ?? datos.tipoIVA ?? 21)
    const t = Number.isFinite(tipoIVA) && tipoIVA > 0 ? tipoIVA : 21
    base = Math.round((total / (1 + t / 100)) * 100) / 100
    iva = Math.round((total - base) * 100) / 100
  }
  return { base, iva, total }
}

const textoReferencia = (row, nombreGrupoJoin) => {
  if (row?.expediente_id == null || row?.expediente_id === '') {
    return 'Venta Directa / Cliente Final'
  }
  const nombre =
    nombreGrupoJoin ||
    (row.expedientes && typeof row.expedientes === 'object' && !Array.isArray(row.expedientes)
      ? row.expedientes.nombre_grupo
      : null) ||
    datosNombreGrupo(row?.datos_factura)
  return nombre && String(nombre).trim() ? String(nombre).trim() : '—'
}

const datosNombreGrupo = (datos) => {
  if (!datos || typeof datos !== 'object') return null
  return datos.expediente?.nombre_grupo ?? datos.expediente?.nombreGrupo ?? null
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
      let res = await supabase
        .from('facturas_emitidas')
        .select(SELECT_FACTURAS_EMBED)
        .order('created_at', { ascending: false })

      let lista = []

      if (!res.error) {
        lista = Array.isArray(res.data) ? res.data : []
      } else {
        const msg = String(res.error.message || '')
        const esCol = /column|schema|42703|does not exist|relationship/i.test(msg)
        if (!esCol) {
          console.error('[FacturasEmitidas] Supabase:', res.error.message, res.error)
          setError(res.error.message || 'No se pudieron cargar las facturas.')
          setFilas([])
          return
        }
        console.warn('[FacturasEmitidas] Reintento lectura plana + LEFT JOIN manual (expedientes):', msg)
        res = await supabase
          .from('facturas_emitidas')
          .select(SELECT_FACTURAS_PLANO)
          .order('created_at', { ascending: false })
        if (res.error) {
          console.error('[FacturasEmitidas] Supabase:', res.error.message, res.error)
          setError(res.error.message || 'No se pudieron cargar las facturas.')
          setFilas([])
          return
        }
        lista = Array.isArray(res.data) ? res.data : []
        const ids = [...new Set(lista.map((r) => r.expediente_id).filter(Boolean))]
        const mapaGrupo = {}
        if (ids.length > 0) {
          const ex = await supabase.from('expedientes').select('id, nombre_grupo').in('id', ids)
          if (!ex.error && Array.isArray(ex.data)) {
            for (const e of ex.data) {
              mapaGrupo[String(e.id)] = e.nombre_grupo ?? ''
            }
          }
        }
        lista = lista.map((r) => ({
          ...r,
          _nombre_grupo_lookup: r.expediente_id != null ? mapaGrupo[String(r.expediente_id)] : null,
        }))
      }

      setFilas(lista)
    } catch (e) {
      console.error('[FacturasEmitidas] Excepción:', e)
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
    const url = resolverUrlFacturaCliente(String(raw).trim())
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
    else window.alert('No se pudo resolver la URL del PDF.')
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
                  const nombreJoin =
                    row._nombre_grupo_lookup != null
                      ? row._nombre_grupo_lookup
                      : row.expedientes && typeof row.expedientes === 'object' && !Array.isArray(row.expedientes)
                        ? row.expedientes.nombre_grupo
                        : null
                  const referencia = textoReferencia(row, nombreJoin)

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
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{base.toFixed(2)} €</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{iva.toFixed(2)} €</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-navy-900">{total.toFixed(2)} €</td>
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
