import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Eye, Filter, Loader2, ChevronDown, X, ExternalLink } from 'lucide-react'
import { supabase } from '../supabase'
import { parsearFechaADate } from '../utils/dateNormalizer'
import { esUsuarioGestoria } from '../utils/userRoles'
import { resolverUrlPublicaFacturaProveedor, abrirFacturaProveedorPorUrlGuardada } from '../utils/facturaProveedorStorage'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const n = (v) => {
  const num = Number(v ?? 0)
  return Number.isFinite(num) ? num : 0
}

const eurFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const formatEur = (v) => eurFormatter.format(n(v))

const fechaInicioADate = (raw) => {
  if (!raw) return null
  const d = parsearFechaADate(raw)
  if (d && !isNaN(d.getTime())) return d
  const d2 = new Date(raw)
  return !isNaN(d2.getTime()) ? d2 : null
}

const trimestreDesdeMes = (mes) => {
  if (mes == null || mes < 1 || mes > 12) return null
  return Math.floor((mes - 1) / 3) + 1
}

const fechaReferenciaTrimestreDesdeExp = (exp) => {
  const dIni = exp?.fechaInicioDate ?? fechaInicioADate(exp?.fecha_inicio)
  if (dIni && !isNaN(dIni.getTime())) return dIni
  const dCre = fechaInicioADate(exp?.created_at)
  if (dCre && !isNaN(dCre.getTime())) return dCre
  const dFc = fechaInicioADate(exp?.fecha_creacion)
  if (dFc && !isNaN(dFc.getTime())) return dFc
  return new Date()
}

const clasificarPorFechaInicio = (exp) => {
  const d = exp.fechaReferenciaTrimestre ?? fechaReferenciaTrimestreDesdeExp(exp)
  if (!d || isNaN(d.getTime())) {
    const h = new Date()
    const mes = h.getMonth() + 1
    return { trimestre: trimestreDesdeMes(mes), fechaInicio: h }
  }
  const mes = d.getMonth() + 1
  return { trimestre: trimestreDesdeMes(mes), fechaInicio: d }
}

const extraerFinanzas = (exp) => {
  const cg = exp.cierre_grupo || {}
  const ingresoTotal = n(cg.ingresos_totales ?? cg.total_ingresos ?? exp.total_ingresos)
  const ivaPagado = n(cg.iva_pagado)
  const beneficioNeto = n(
    cg.beneficio_limpio ?? cg.beneficio_neto ?? cg.beneficio ?? exp.beneficio_neto_real ?? exp.liquidacion_final_beneficio
  )
  let gastoTotal = n(cg.gastos_totales ?? cg.gastos_reales ?? exp.total_gastos_reales)
  const costesReales = Array.isArray(cg.costesReales) ? cg.costesReales : []
  const gastosImprevistos = Array.isArray(cg.gastosImprevistos) ? cg.gastosImprevistos : []
  if (gastoTotal === 0 && costesReales.length > 0) {
    gastoTotal =
      costesReales.reduce((s, c) => s + n(c.coste_real), 0) +
      gastosImprevistos.reduce((s, g) => s + n(g.importe), 0)
  }
  const beneficioBruto = n(cg.beneficio_bruto ?? beneficioNeto + ivaPagado)
  const fechaCierre = cg.fecha ? new Date(cg.fecha) : exp.fecha_inicio ? new Date(exp.fecha_inicio) : null
  return { ingresoTotal, gastoTotal, ivaPagado, beneficioBruto, beneficioNeto, fechaCierre, costesReales, gastosImprevistos }
}

const TRIMESTRES = [
  { value: 'all', label: 'Todos (T1–T4)' },
  { value: '1', label: 'T1 · Ene–Mar' },
  { value: '2', label: 'T2 · Abr–Jun' },
  { value: '3', label: 'T3 · Jul–Sep' },
  { value: '4', label: 'T4 · Oct–Dic' },
]

const estadoNormalizado = (exp) => String(exp?.estado ?? '').trim().toLowerCase()

const badgeEstadoProps = (exp) => {
  const s = estadoNormalizado(exp)
  if (s === 'cerrado') return { className: 'bg-emerald-500', label: 'Cerrado' }
  return { className: 'bg-slate-300', label: s || '—' }
}

const SELECT_EXPEDIENTES_HISTORIAL_MIN =
  'id, estado, numero_expediente, nombre_grupo, cliente_nombre, destino, fecha_inicio, total_ingresos, total_gastos_reales, beneficio_neto_real, liquidacion_final_beneficio, cierre_grupo, informe_gastos_hacienda'

const SELECT_EXPEDIENTES_HISTORIAL_EXT = `${SELECT_EXPEDIENTES_HISTORIAL_MIN}, created_at, fecha_creacion`

const resolverUrlFacturaCliente = (url) => {
  if (!url || typeof url !== 'string') return null
  const t = url.trim()
  return /^https?:\/\//i.test(t) ? t : null
}

const nombreArchivoSeguro = (s, maxLen = 80) => {
  const base = String(s || 'doc')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, maxLen)
  return base || 'doc'
}

const logErrorSupabase = (contexto, err, extra = {}) => {
  const o = err && typeof err === 'object' ? err : {}
  console.error(`[HistorialCierres] ${contexto}`, {
    message: o.message ?? String(err),
    code: o.code,
    details: o.details,
    hint: o.hint,
    ...extra,
    objetoCompleto: err,
  })
}

const fusionarFacturasClientePorExpediente = (rowsEmitidas, rowsGlobal) => {
  const map = new Map()
  for (const row of [...(rowsEmitidas || []), ...(rowsGlobal || [])]) {
    const key = String(row.numero_factura || `__id_${row.id}`)
    const prev = map.get(key)
    if (!prev) {
      map.set(key, row)
      continue
    }
    const prefNuevo = !prev.url_pdf && row.url_pdf
    const prefFecha = row.fecha_emision && prev.fecha_emision && new Date(row.fecha_emision) > new Date(prev.fecha_emision)
    if (prefNuevo || prefFecha) map.set(key, { ...prev, ...row, url_pdf: row.url_pdf || prev.url_pdf })
  }
  return [...map.values()].sort((a, b) => {
    const da = a.fecha_emision ? new Date(a.fecha_emision).getTime() : 0
    const db = b.fecha_emision ? new Date(b.fecha_emision).getTime() : 0
    return db - da
  })
}

const particionarArchivosAuditoriaZip = (exp, datos) => {
  if (!exp) return { proveedores: [], clientes: [] }
  const proveedores = []
  const clientes = []
  let i = 0
  for (const p of datos.pagos || []) {
    const u = resolverUrlPublicaFacturaProveedor(p.url_pdf)
    if (!u) continue
    i += 1
    const base = `${i}_${p.proveedor_nombre || 'proveedor'}_${p.numero_factura || p.concepto || 'factura'}`
    const fn = nombreArchivoSeguro(base)
    proveedores.push({ url: u, filename: fn.toLowerCase().endsWith('.pdf') ? fn : `${fn}.pdf` })
  }
  let j = 0
  for (const f of datos.facturasCliente || []) {
    const u = resolverUrlFacturaCliente(f.url_pdf)
    if (!u) continue
    j += 1
    const base = `${j}_${f.numero_factura || 'factura'}`
    const fn = nombreArchivoSeguro(base)
    clientes.push({ url: u, filename: fn.toLowerCase().endsWith('.pdf') ? fn : `${fn}.pdf` })
  }
  return { proveedores, clientes }
}

const construirListaArchivosAuditoria = (exp, datos) => {
  const { proveedores, clientes } = particionarArchivosAuditoriaZip(exp, datos)
  return [...proveedores, ...clientes]
}

const añoActual = new Date().getFullYear()
const AÑOS = Array.from({ length: 6 }, (_, i) => añoActual - i)

const estadoInicialAcordeon = (añoSeleccionado) => {
  const y = parseInt(añoSeleccionado, 10)
  if (y !== añoActual) {
    return { 1: true, 2: false, 3: false, 4: false, 0: false }
  }
  const q = Math.floor(new Date().getMonth() / 3) + 1
  return {
    1: q === 1,
    2: q === 2,
    3: q === 3,
    4: q === 4,
    0: false,
  }
}

const HistorialCierres = ({ user }) => {
  const navigate = useNavigate()
  const esGestoria = esUsuarioGestoria(user)

  const [cierres, setCierres] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [año, setAño] = useState(String(añoActual))
  const [trimestreFiltro, setTrimestreFiltro] = useState('1')
  const [abiertoTrim, setAbiertoTrim] = useState(() => estadoInicialAcordeon(String(añoActual)))

  const [modalAuditoria, setModalAuditoria] = useState(null)
  const [cargandoAuditoria, setCargandoAuditoria] = useState(false)
  const [datosAuditoria, setDatosAuditoria] = useState({ pagos: [], facturasCliente: [] })

  const cierreLoadSeqRef = useRef(0)

  const TIMEOUT_CARGA_CIERRES_MS = 50000

  const cargarCierres = useCallback(async () => {
    const seq = ++cierreLoadSeqRef.current
    let timeoutId = null
    setIsLoading(true)
    try {
      timeoutId = window.setTimeout(() => {
        if (seq !== cierreLoadSeqRef.current) return
        setCierres([])
        setIsLoading(false)
      }, TIMEOUT_CARGA_CIERRES_MS)

      const fetchCerrados = async (cols) => {
        try {
          return await supabase
            .from('expedientes')
            .select(cols)
            .ilike('estado', 'cerrado')
            .order('fecha_inicio', { ascending: false, nullsFirst: true })
        } catch (e) {
          logErrorSupabase(`expedientes select (${cols.slice(0, 40)}…)`, e)
          return { data: null, error: e }
        }
      }

      const esErrorColumna = (err) => /column|schema|does not exist|42703/i.test(String(err?.message || ''))

      let { data, error } = await fetchCerrados(SELECT_EXPEDIENTES_HISTORIAL_EXT)

      if (error && esErrorColumna(error)) {
        const msg = String(error.message || '')
        if (/fecha_creacion/i.test(msg)) {
          const rMid = await fetchCerrados(`${SELECT_EXPEDIENTES_HISTORIAL_MIN}, created_at`)
          data = rMid.data
          error = rMid.error
        } else {
          const r2 = await fetchCerrados(SELECT_EXPEDIENTES_HISTORIAL_MIN)
          data = r2.data
          error = r2.error
        }
      }

      if (error && esErrorColumna(error)) {
        const r3 = await fetchCerrados(SELECT_EXPEDIENTES_HISTORIAL_MIN)
        data = r3.data
        error = r3.error
      }

      if (seq !== cierreLoadSeqRef.current) return

      if (error) {
        console.error('[HistorialCierres] Error Supabase expedientes:', error.message, error)
        setCierres([])
        return
      }

      const crudos = Array.isArray(data) ? data : []
      const soloCerrado = crudos.filter((e) => String(e.estado ?? '').trim().toLowerCase() === 'cerrado')

      const mapeados = soloCerrado.map((exp) => {
        const fechaInicioDate = fechaInicioADate(exp.fecha_inicio)
        const fechaReferenciaTrimestre = fechaReferenciaTrimestreDesdeExp({
          ...exp,
          fechaInicioDate,
        })
        let fin
        try {
          fin = extraerFinanzas(exp)
        } catch (mapErr) {
          console.error('[HistorialCierres] extraerFinanzas falló', exp?.numero_expediente, mapErr)
          fin = {
            ingresoTotal: n(exp.total_ingresos),
            gastoTotal: n(exp.total_gastos_reales),
            ivaPagado: 0,
            beneficioBruto: n(exp.beneficio_neto_real),
            beneficioNeto: n(exp.beneficio_neto_real),
            fechaCierre: null,
            costesReales: [],
            gastosImprevistos: [],
          }
        }
        return { ...exp, ...fin, fechaInicioDate, fechaReferenciaTrimestre }
      })
      mapeados.sort((a, b) => {
        const ta = a.fechaReferenciaTrimestre?.getTime() ?? 0
        const tb = b.fechaReferenciaTrimestre?.getTime() ?? 0
        if (tb !== ta) return tb - ta
        return String(a.numero_expediente || '').localeCompare(String(b.numero_expediente || ''), 'es', { numeric: true })
      })

      if (seq === cierreLoadSeqRef.current) setCierres(mapeados)
    } catch (err) {
      console.error('[HistorialCierres] cargarCierres:', err)
      if (seq === cierreLoadSeqRef.current) setCierres([])
    } finally {
      if (timeoutId != null) window.clearTimeout(timeoutId)
      if (seq === cierreLoadSeqRef.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void cargarCierres()
  }, [cargarCierres])

  useEffect(() => {
    if (trimestreFiltro === 'all') {
      setAbiertoTrim(estadoInicialAcordeon(año))
    } else {
      const q = parseInt(trimestreFiltro, 10)
      setAbiertoTrim({ 1: q === 1, 2: q === 2, 3: q === 3, 4: q === 4, 0: false })
    }
  }, [año, trimestreFiltro])

  const expedientesDelAño = useMemo(
    () =>
      cierres.filter((c) => {
        const y = c.fechaReferenciaTrimestre?.getFullYear?.()
        return String(y) === año
      }),
    [cierres, año]
  )

  const { bucketsTrimestre, bucketSinFecha } = useMemo(() => {
    const conF = expedientesDelAño
    const ordenarEnBloque = (arr) =>
      [...arr].sort((a, b) => {
        const ta = a.fechaReferenciaTrimestre?.getTime() ?? 0
        const tb = b.fechaReferenciaTrimestre?.getTime() ?? 0
        if (ta !== tb) return ta - tb
        return String(a.numero_expediente || '').localeCompare(String(b.numero_expediente || ''), 'es', { numeric: true })
      })
    const buckets = [1, 2, 3, 4].map((q) => {
      const items = ordenarEnBloque(conF.filter((c) => clasificarPorFechaInicio(c).trimestre === q))
      const sumIngresos = items.reduce((s, c) => s + n(c.total_ingresos), 0)
      const sumBenefReal = items.reduce((s, c) => s + n(c.beneficio_neto_real), 0)
      const info = TRIMESTRES.find((t) => t.value === String(q))
      return {
        key: `T${q}`,
        q,
        titulo: info?.label ?? `Trimestre ${q}`,
        items,
        sumIngresos,
        sumBenefReal,
      }
    })
    return { bucketsTrimestre: buckets, bucketSinFecha: null }
  }, [expedientesDelAño])

  const { bucketsVisibles, bucketSinFechaVisible } = useMemo(() => {
    if (trimestreFiltro === 'all') {
      return { bucketsVisibles: bucketsTrimestre, bucketSinFechaVisible: bucketSinFecha }
    }
    const q = parseInt(trimestreFiltro, 10)
    return {
      bucketsVisibles: bucketsTrimestre.filter((b) => b.q === q),
      bucketSinFechaVisible: null,
    }
  }, [bucketsTrimestre, bucketSinFecha, trimestreFiltro])

  const cierresFiltrados = useMemo(
    () => [...bucketsVisibles.flatMap((b) => b.items), ...(bucketSinFechaVisible?.items ?? [])],
    [bucketsVisibles, bucketSinFechaVisible]
  )

  const totales = useMemo(
    () => ({
      ingresos: cierresFiltrados.reduce((s, c) => s + n(c.total_ingresos), 0),
      gastos: cierresFiltrados.reduce((s, c) => s + n(c.gastoTotal), 0),
      beneficio: cierresFiltrados.reduce((s, c) => s + n(c.beneficio_neto_real), 0),
    }),
    [cierresFiltrados]
  )

  const cerrarModalAuditoria = useCallback(() => {
    setModalAuditoria(null)
    setDatosAuditoria({ pagos: [], facturasCliente: [] })
  }, [])

  const abrirModalAuditoria = useCallback(async (exp) => {
    setModalAuditoria(exp)
    setCargandoAuditoria(true)
    setDatosAuditoria({ pagos: [], facturasCliente: [] })
    const expedienteId = exp.id
    let pagosRes = { data: [], error: null }
    let emRes = { data: [], error: null }
    let glRes = { data: [], error: null }
    try {
      try {
        pagosRes = await supabase
          .from('pagos_proveedores')
          .select('id, concepto, numero_factura, fecha_pago, importe_pagado, url_pdf, proveedor_nombre')
          .eq('expediente_id', expedienteId)
          .order('fecha_pago', { ascending: false })
      } catch (e) {
        logErrorSupabase('modal auditoría pagos_proveedores', e, { expedienteId })
        pagosRes = { data: [], error: e }
      }
      try {
        emRes = await supabase
          .from('facturas_emitidas')
          .select('id, numero_factura, fecha_emision, url_pdf, cliente_nombre, importe_total')
          .eq('expediente_id', expedienteId)
      } catch (e) {
        logErrorSupabase('modal auditoría facturas_emitidas', e, { expedienteId })
        emRes = { data: [], error: e }
      }
      try {
        glRes = await supabase
          .from('facturas_emitidas_global')
          .select('id, numero_factura, fecha_emision, url_pdf, cliente_nombre, importe_total')
          .eq('expediente_id', expedienteId)
      } catch (e) {
        logErrorSupabase('modal auditoría facturas_emitidas_global', e, { expedienteId })
        glRes = { data: [], error: e }
      }
      const pagos = pagosRes.error ? [] : pagosRes.data || []
      const facturasCliente = fusionarFacturasClientePorExpediente(
        emRes.error ? [] : emRes.data,
        glRes.error ? [] : glRes.data
      )
      setDatosAuditoria({ pagos, facturasCliente })
    } catch (e) {
      console.error('[Auditoría]', e)
      setDatosAuditoria({ pagos: [], facturasCliente: [] })
    } finally {
      setCargandoAuditoria(false)
    }
  }, [])

  const abrirTodosDocumentosPestanas = useCallback(() => {
    const items = construirListaArchivosAuditoria(modalAuditoria, datosAuditoria)
    items.forEach((item, idx) => {
      setTimeout(() => window.open(item.url, '_blank', 'noopener,noreferrer'), idx * 400)
    })
    if (items.length === 0) {
      alert('No hay documentos con URL disponible para este expediente.')
    }
  }, [modalAuditoria, datosAuditoria])

  useEffect(() => {
    if (!modalAuditoria) return
    const onKey = (e) => {
      if (e.key === 'Escape') cerrarModalAuditoria()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalAuditoria, cerrarModalAuditoria])

  const formatearFecha = (f) =>
    f ? f.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

  const irAlExpedienteEdicion = () => {
    if (!modalAuditoria) return
    navigate('/expedientes', { state: { abrirExpedienteId: modalAuditoria.id, tabInicial: 'cierre' } })
    cerrarModalAuditoria()
  }

  const etiquetaPeriodo = `Ejercicio ${año}`

  const toggleAcordeon = (q) => {
    setAbiertoTrim((s) => ({ ...s, [q]: !s[q] }))
  }

  const renderFila = (c) => {
    const badge = badgeEstadoProps(c)
    return (
      <tr key={c.id} className="hover:bg-slate-50 transition-colors">
        <td className="px-4 py-3 font-mono text-xs text-slate-700 font-semibold">
          <span className="inline-flex items-center gap-2">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white shadow-sm ${badge.className}`}
              title={badge.label}
              aria-label={`Estado: ${badge.label}`}
            />
            <span>{c.numero_expediente ?? '—'}</span>
          </span>
        </td>
        <td className="px-4 py-3 text-slate-800">{c.cliente_nombre ?? '—'}</td>
        <td className="px-4 py-3 text-slate-600">{c.destino ?? '—'}</td>
        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatearFecha(c.fechaInicioDate)}</td>
        <td className="px-4 py-3 text-right font-medium text-emerald-800 whitespace-nowrap tabular-nums">
          {formatEur(c.total_ingresos)}
        </td>
        <td className="px-4 py-3 text-right font-medium whitespace-nowrap tabular-nums">
          <span className={n(c.beneficio_neto_real) >= 0 ? 'text-blue-700' : 'text-red-600'}>
            {formatEur(c.beneficio_neto_real)}
          </span>
        </td>
        <td className="px-4 py-3 text-center">
          <button
            type="button"
            onClick={() => abrirModalAuditoria(c)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Eye size={14} />
            Ver
          </button>
        </td>
      </tr>
    )
  }

  const renderBloqueTrimestre = (bucket) => {
    const q = bucket.q
    const abierto = abiertoTrim[q] ?? false
    return (
      <div key={bucket.key} className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-md overflow-hidden">
        <button
          type="button"
          onClick={() => toggleAcordeon(q)}
          className="w-full text-left px-4 py-4 sm:px-6 sm:py-4 flex items-start justify-between gap-4 hover:bg-slate-50/90 transition-colors border-b border-slate-100"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">Trimestre {q}</p>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span className="text-blue-600">T{q}</span>
              <span className="text-slate-600 font-bold text-lg sm:text-xl">{bucket.titulo}</span>
            </h2>
            {bucket.items.length > 0 && (
              <p className="text-xs text-slate-500 mt-2">
                {bucket.items.length} expediente{bucket.items.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:block text-right rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Σ ingresos · Σ benef. neto real</p>
              <p className="text-sm font-black text-slate-800 tabular-nums">
                {formatEur(bucket.sumIngresos)} ·{' '}
                <span className={bucket.sumBenefReal >= 0 ? 'text-blue-700' : 'text-red-600'}>
                  {formatEur(bucket.sumBenefReal)}
                </span>
              </p>
            </div>
            <ChevronDown size={22} className={`text-slate-400 transition-transform shrink-0 ${abierto ? 'rotate-180' : ''}`} />
          </div>
        </button>
        {abierto && (
          <div className="bg-white">
            {bucket.items.length === 0 ? (
              <p className="text-sm text-slate-400 italic py-10 text-center px-4">
                Ningún expediente en este trimestre (según mes de fecha de referencia).
              </p>
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800 text-white">
                      <tr>
                        {[
                          ['Nº expediente', 'text-left'],
                          ['Cliente', 'text-left'],
                          ['Destino', 'text-left'],
                          ['Fecha inicio', 'text-left'],
                          ['Total ingresos', 'text-right'],
                          ['Beneficio neto real', 'text-right'],
                          ['', 'text-center'],
                        ].map(([label, al], idx) => (
                          <th key={idx} className={`px-4 py-3 font-black uppercase tracking-[0.1em] text-[10px] sm:text-xs ${al}`}>
                            {label || 'Acción'}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">{bucket.items.map(renderFila)}</tbody>
                    <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                      <tr>
                        <td colSpan={4} className="px-4 py-3 font-black text-slate-700 uppercase text-xs tracking-widest">
                          Resumen del periodo ({bucket.items.length})
                        </td>
                        <td className="px-4 py-3 text-right font-black text-emerald-800 tabular-nums">{formatEur(bucket.sumIngresos)}</td>
                        <td className="px-4 py-3 text-right font-black tabular-nums">
                          <span className={bucket.sumBenefReal >= 0 ? 'text-blue-700' : 'text-red-600'}>
                            {formatEur(bucket.sumBenefReal)}
                          </span>
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="md:hidden p-4 space-y-4">
                  {bucket.items.map((c) => {
                    const badge = badgeEstadoProps(c)
                    return (
                      <div key={c.id} className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
                        <p className="text-xs text-slate-500 inline-flex items-center gap-2">
                          <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${badge.className}`} title={badge.label} />
                          {c.numero_expediente ?? '—'}
                        </p>
                        <p className="font-bold text-slate-900">{c.cliente_nombre ?? '—'}</p>
                        <p className="text-sm text-slate-600">{c.destino ?? '—'}</p>
                        <p className="text-xs text-slate-500 mt-1">Inicio: {formatearFecha(c.fechaInicioDate)}</p>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-[10px] uppercase text-slate-400">Total ingresos</p>
                            <p className="font-bold text-emerald-800 tabular-nums">{formatEur(c.total_ingresos)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase text-slate-400">Benef. neto real</p>
                            <p
                              className={`font-bold tabular-nums ${n(c.beneficio_neto_real) >= 0 ? 'text-blue-700' : 'text-red-600'}`}
                            >
                              {formatEur(c.beneficio_neto_real)}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => abrirModalAuditoria(c)}
                          className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold"
                        >
                          <Eye size={16} />
                          Ver
                        </button>
                      </div>
                    )
                  })}
                  <div className="rounded-xl border border-slate-300 bg-slate-100 p-4 text-sm">
                    <p className="font-black text-slate-700 uppercase text-xs mb-2">Resumen del periodo</p>
                    <p className="flex justify-between tabular-nums">
                      <span>Σ Total ingresos</span>
                      <span className="font-bold text-emerald-800">{formatEur(bucket.sumIngresos)}</span>
                    </p>
                    <p className="flex justify-between mt-1 tabular-nums">
                      <span>Σ Beneficio neto real</span>
                      <span className={`font-bold ${bucket.sumBenefReal >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                        {formatEur(bucket.sumBenefReal)}
                      </span>
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-6 sm:p-8 max-w-[1400px] mx-auto flex flex-col items-center justify-center min-h-[40vh] gap-4 text-slate-600">
        <Loader2 className="animate-spin" size={48} />
        <p className="text-sm font-medium">Cargando expedientes cerrados…</p>
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 max-w-[1400px] mx-auto">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">Historial de Cierres</h1>
          <p className="text-slate-500 font-medium text-sm mt-1">
            Solo estado <strong>Cerrado</strong> · T1–T4 por mes de fecha de referencia (inicio; si falta, creación) · {etiquetaPeriodo}
            {esGestoria && (
              <span className="block mt-1 text-amber-700 font-semibold">
                Perfil gestoría/auditoría: lectura desde esta vista; sin edición del cierre aquí.
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-slate-400 shrink-0" />
            <select
              value={año}
              onChange={(e) => setAño(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {AÑOS.map((a) => (
                <option key={a} value={String(a)}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <select
            value={trimestreFiltro}
            onChange={(e) => setTrimestreFiltro(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {TRIMESTRES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {expedientesDelAño.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total ingresos', value: totales.ingresos, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
            { label: 'Gastos', value: totales.gastos, color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
            {
              label: 'Beneficio neto real',
              value: totales.beneficio,
              color: totales.beneficio >= 0 ? 'text-blue-700' : 'text-red-700',
              bg: totales.beneficio >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200',
            },
          ].map((card) => (
            <div key={card.label} className={`rounded-xl border p-4 ${card.bg}`}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{card.label}</p>
              <p className={`text-2xl font-extrabold tabular-nums ${card.color}`}>{formatEur(card.value)}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {cierresFiltrados.length} expediente{cierresFiltrados.length !== 1 ? 's' : ''} en vista ·{' '}
                {TRIMESTRES.find((t) => t.value === trimestreFiltro)?.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {cierres.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-12 text-center">
          <FileText className="mx-auto text-slate-300 mb-4" size={56} />
          <h3 className="text-xl font-bold text-slate-800 mb-2">No hay expedientes cerrados</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            Esta vista lista solo registros con estado <code className="text-xs bg-slate-100 px-1 rounded">Cerrado</code>.
          </p>
        </div>
      ) : expedientesDelAño.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-12 text-center">
          <FileText className="mx-auto text-slate-300 mb-4" size={56} />
          <h3 className="text-xl font-bold text-slate-800 mb-2">Sin expedientes en {año}</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            No hay cerrados cuyo año de referencia coincida con {año}.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 mb-2">
            Por defecto se muestra <strong>T1</strong>. Cambia el trimestre arriba para ver T2–T4 o todos.
          </p>
          {bucketsVisibles.map(renderBloqueTrimestre)}
          {bucketSinFechaVisible && renderBloqueTrimestre(bucketSinFechaVisible)}
        </div>
      )}

      {modalAuditoria && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-auditoria-titulo"
          onClick={(e) => e.target === e.currentTarget && cerrarModalAuditoria()}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="min-w-0">
                <h2 id="modal-auditoria-titulo" className="text-lg font-black text-slate-900 tracking-tight">
                  Auditoría de expediente
                </h2>
                <p className="text-sm text-slate-600 mt-1 font-mono">
                  {modalAuditoria.numero_expediente ?? '—'} · {modalAuditoria.nombre_grupo || modalAuditoria.cliente_nombre || '—'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{modalAuditoria.destino || 'Sin destino'}</p>
              </div>
              <button
                type="button"
                onClick={cerrarModalAuditoria}
                className="p-2 rounded-xl hover:bg-slate-200 text-slate-600 transition-colors shrink-0"
                aria-label="Cerrar"
              >
                <X size={22} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6">
              {cargandoAuditoria ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
                  <Loader2 className="animate-spin" size={40} />
                  <p className="text-sm font-medium">Cargando documentación…</p>
                </div>
              ) : (
                <>
                  {(() => {
                    const fin = extraerFinanzas(modalAuditoria)
                    return (
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Resumen financiero</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {[
                            { label: 'Ingresos', value: fin.ingresoTotal, color: 'text-emerald-800', bg: 'bg-emerald-50 border-emerald-100' },
                            { label: 'Gastos (proveedores)', value: fin.gastoTotal, color: 'text-red-800', bg: 'bg-red-50 border-red-100' },
                            {
                              label: 'Beneficio neto',
                              value: fin.beneficioNeto,
                              color: fin.beneficioNeto >= 0 ? 'text-blue-800' : 'text-red-800',
                              bg: fin.beneficioNeto >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100',
                            },
                          ].map((card) => (
                            <div key={card.label} className={`rounded-xl border p-4 ${card.bg}`}>
                              <p className="text-[10px] font-bold uppercase text-slate-500">{card.label}</p>
                              <p className={`text-xl font-black tabular-nums ${card.color}`}>{formatEur(card.value)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}

                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Facturas de proveedores</h3>
                    {datosAuditoria.pagos.length === 0 ? (
                      <p className="text-sm text-slate-400 italic">No hay pagos registrados en este expediente.</p>
                    ) : (
                      <ul className="space-y-2 text-sm border border-slate-100 rounded-xl divide-y divide-slate-100 max-h-48 overflow-y-auto">
                        {datosAuditoria.pagos.map((p) => {
                          const tienePdf = !!resolverUrlPublicaFacturaProveedor(p.url_pdf)
                          return (
                            <li key={p.id} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 truncate">{p.proveedor_nombre || 'Proveedor'}</p>
                                <p className="text-xs text-slate-500">
                                  {p.concepto || p.numero_factura || '—'} · {formatEur(p.importe_pagado)}
                                </p>
                              </div>
                              {tienePdf ? (
                                <button
                                  type="button"
                                  onClick={() => abrirFacturaProveedorPorUrlGuardada(p.url_pdf)}
                                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 shrink-0"
                                >
                                  <ExternalLink size={14} /> PDF
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400">Sin PDF</span>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>

                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Factura al cliente</h3>
                    {datosAuditoria.facturasCliente.length === 0 ? (
                      <p className="text-sm text-slate-400 italic">No consta factura emitida vinculada al expediente.</p>
                    ) : (
                      <ul className="space-y-2">
                        {datosAuditoria.facturasCliente.map((f) => {
                          const url = resolverUrlFacturaCliente(f.url_pdf)
                          return (
                            <li
                              key={f.id ?? f.numero_factura}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2 bg-slate-50/80"
                            >
                              <div>
                                <p className="font-bold text-slate-800">{f.numero_factura || '—'}</p>
                                <p className="text-xs text-slate-600">
                                  {f.cliente_nombre || 'Cliente'} · {formatEur(f.importe_total)}
                                </p>
                              </div>
                              {url ? (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800"
                                >
                                  <ExternalLink size={14} /> PDF
                                </a>
                              ) : (
                                <span className="text-xs text-slate-400">PDF no enlazado</span>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 space-y-3">
              <button
                type="button"
                onClick={abrirTodosDocumentosPestanas}
                disabled={cargandoAuditoria}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-sm font-bold transition-colors"
              >
                <ExternalLink size={16} />
                Abrir todos los PDFs en pestañas nuevas
              </button>
              {!esGestoria && (
                <button
                  type="button"
                  onClick={irAlExpedienteEdicion}
                  className="w-full text-center text-xs font-semibold text-slate-500 hover:text-blue-600 underline"
                >
                  Ir al expediente (edición avanzada)
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HistorialCierres
