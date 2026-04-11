import React, { useEffect, useState, useMemo, useCallback, memo } from 'react'
import {
  FileText,
  Eye,
  TrendingUp,
  FileSpreadsheet,
  Filter,
  Loader2,
  ChevronDown,
  Plus,
  Package,
  Building2,
  ExternalLink,
  Trash2,
  Sparkles,
} from 'lucide-react'
import { supabase } from '../supabase'
import { resolverUrlPublicaFacturaProveedor, abrirFacturaProveedorPorUrlGuardada } from '../utils/facturaProveedorStorage'
import { parsearFechaADate } from '../utils/dateNormalizer'
import { esUsuarioGestoria, esUsuarioAdmin } from '../utils/userRoles'
import { useCierresLogic } from '../hooks/useCierresLogic'
import { useCierresModals, CierresModalsLayer } from '../components/cierres/CierresModals'
import {
  formatEuroAmount,
  formatearFecha,
  NOMBRES_MES,
  mesesDelTrimestre,
  inicialesProveedorEstructura,
  n,
  AÑOS,
  añoActual,
} from '../utils/historialCierresFormat'
import {
  TRIMESTRES,
  badgeEstadoProps,
  ingresoMostradoHistorial,
  beneficioMostradoHistorial,
  clasificarPorFechaInicio,
  construirHTMLCuaderno,
  NUMEROS_DIAGNOSTICO_HISTORIAL,
} from '../utils/historialCierresShared'

function importeGastoEstructuraPendiente(importe) {
  if (importe == null || importe === '') return true
  const x = Number(importe)
  return !Number.isFinite(x) || x === 0
}

const GastoEstructuraEditor = memo(function GastoEstructuraEditor({
  r,
  esAdmin,
  fmtFechaFact,
  url,
  onAbrirPdf,
  onBorrar,
  onGuardarEdicion,
  layout,
}) {
  const [proveedor, setProveedor] = useState(() => r.proveedor ?? '')
  const [concepto, setConcepto] = useState(() => r.concepto ?? '')
  const [importeStr, setImporteStr] = useState(() => (r.importe != null && r.importe !== '' ? String(r.importe) : ''))
  const [fecha, setFecha] = useState(() => (r.fecha_factura ? String(r.fecha_factura).slice(0, 10) : ''))
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    setProveedor(r.proveedor ?? '')
    setConcepto(r.concepto ?? '')
    setImporteStr(r.importe != null && r.importe !== '' ? String(r.importe) : '')
    setFecha(r.fecha_factura ? String(r.fecha_factura).slice(0, 10) : '')
  }, [r.id, r.proveedor, r.concepto, r.importe, r.fecha_factura])

  const importePend = importeGastoEstructuraPendiente(r.importe)

  const aplicarGuardado = async () => {
    const importeNum = parseFloat(String(importeStr).replace(',', '.'))
    if (!Number.isFinite(importeNum) || importeNum < 0) {
      alert('Importe no válido.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      alert('Indica la fecha de factura (YYYY-MM-DD).')
      return
    }
    const fd = new Date(`${fecha}T12:00:00`)
    if (isNaN(fd.getTime())) {
      alert('Fecha no válida.')
      return
    }
    setGuardando(true)
    const res = await onGuardarEdicion(r, {
      proveedor: proveedor.trim(),
      concepto: concepto.trim(),
      importe: importeNum,
      fecha_factura: fecha,
      mes: fd.getMonth() + 1,
      anio: fd.getFullYear(),
    })
    setGuardando(false)
    if (!res.ok) alert(res.mensaje || 'No se pudo guardar.')
  }

  if (!esAdmin) {
    if (layout === 'table') {
      return (
        <tr>
          <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{fmtFechaFact(r.fecha_factura)}</td>
          <td className="px-3 py-2 text-slate-800">
            <span className="inline-flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-200 text-[9px] font-black text-slate-700 shrink-0">
                {inicialesProveedorEstructura(r.proveedor)}
              </span>
              {r.proveedor ?? '—'}
            </span>
          </td>
          <td className="px-3 py-2 text-slate-700 max-w-[220px] truncate" title={r.concepto || ''}>
            {r.concepto ?? '—'}
          </td>
          <td className={`px-3 py-2 text-right tabular-nums ${importePend ? 'text-red-600 font-bold' : 'text-slate-900'}`}>
            <div className="font-semibold">{formatEuroAmount(r.importe)}</div>
            {n(r.importe_iva) > 0 && (
              <div className="text-[11px] text-slate-500 font-normal">IVA {formatEuroAmount(r.importe_iva)}</div>
            )}
          </td>
          <td className="px-3 py-2">
            {url ? (
              <button
                type="button"
                onClick={() => onAbrirPdf(r.url_pdf)}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
              >
                <ExternalLink size={14} /> Abrir
              </button>
            ) : (
              <span className="text-xs text-slate-400">—</span>
            )}
          </td>
        </tr>
      )
    }
    return (
      <div className="rounded-lg border border-slate-100 p-3 bg-slate-50/80">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-200 text-[10px] font-black text-slate-700">
            {inicialesProveedorEstructura(r.proveedor)}
          </span>
          <p className="font-bold text-slate-900 text-sm flex-1">{r.proveedor ?? '—'}</p>
        </div>
        <p className="text-xs text-slate-600">{r.concepto ?? '—'}</p>
        <p className="text-xs text-slate-500 mt-1">Fecha: {fmtFechaFact(r.fecha_factura)}</p>
        <p className={`text-sm font-bold mt-1 ${importePend ? 'text-red-600' : 'text-slate-900'}`}>
          {formatEuroAmount(r.importe)}
          {n(r.importe_iva) > 0 && (
            <span className="text-xs font-normal text-slate-500"> · IVA {formatEuroAmount(r.importe_iva)}</span>
          )}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {url && (
            <button type="button" onClick={() => onAbrirPdf(r.url_pdf)} className="text-xs font-bold text-blue-600">
              Abrir PDF
            </button>
          )}
        </div>
      </div>
    )
  }

  if (layout === 'table') {
    return (
      <tr>
        <td className="px-3 py-2 align-top">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full min-w-[9.5rem] border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
          />
        </td>
        <td className="px-3 py-2 align-top">
          <input
            type="text"
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            className="w-full min-w-[120px] border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
          />
        </td>
        <td className="px-3 py-2 align-top">
          <input
            type="text"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            className="w-full min-w-[140px] border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
          />
        </td>
        <td className="px-3 py-2 align-top text-right">
          <input
            type="text"
            inputMode="decimal"
            value={importeStr}
            onChange={(e) => setImporteStr(e.target.value)}
            className={`w-full max-w-[7rem] ml-auto border rounded-lg px-2 py-1.5 text-sm tabular-nums text-right ${
              importeGastoEstructuraPendiente(importeStr === '' ? null : parseFloat(String(importeStr).replace(',', '.')))
                ? 'border-red-300 bg-red-50/50 text-red-700'
                : 'border-slate-200'
            }`}
          />
          {n(r.importe_iva) > 0 && (
            <div className="text-[11px] text-slate-500 font-normal mt-1">IVA {formatEuroAmount(r.importe_iva)}</div>
          )}
        </td>
        <td className="px-3 py-2 align-top">
          {url ? (
            <button
              type="button"
              onClick={() => onAbrirPdf(r.url_pdf)}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
            >
              <ExternalLink size={14} /> Abrir
            </button>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </td>
        <td className="px-3 py-2 align-top text-right whitespace-nowrap">
          <button
            type="button"
            disabled={guardando}
            onClick={() => aplicarGuardado()}
            className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-900 mr-2"
          >
            {guardando ? <Loader2 size={14} className="animate-spin" /> : null}
            Guardar
          </button>
          <button
            type="button"
            onClick={() => onBorrar(r)}
            className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-800"
          >
            <Trash2 size={14} /> Eliminar
          </button>
        </td>
      </tr>
    )
  }

  return (
    <div className="rounded-lg border border-slate-100 p-3 bg-slate-50/80 space-y-2">
      <p className="text-[10px] font-black uppercase text-slate-400">Edición gasto estructura</p>
      <label className="block text-xs text-slate-600">
        Proveedor
        <input
          type="text"
          value={proveedor}
          onChange={(e) => setProveedor(e.target.value)}
          className="mt-0.5 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
        />
      </label>
      <label className="block text-xs text-slate-600">
        Concepto
        <input
          type="text"
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          className="mt-0.5 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
        />
      </label>
      <label className="block text-xs text-slate-600">
        Importe (c/IVA)
        <input
          type="text"
          inputMode="decimal"
          value={importeStr}
          onChange={(e) => setImporteStr(e.target.value)}
          className={`mt-0.5 w-full border rounded-lg px-2 py-1.5 text-sm ${
            importeGastoEstructuraPendiente(importeStr === '' ? null : parseFloat(String(importeStr).replace(',', '.')))
              ? 'border-red-300 bg-red-50/50 text-red-700'
              : 'border-slate-200'
          }`}
        />
      </label>
      <label className="block text-xs text-slate-600">
        Fecha factura
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="mt-0.5 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white"
        />
      </label>
      <div className="flex flex-wrap gap-2 pt-1">
        {url && (
          <button type="button" onClick={() => onAbrirPdf(r.url_pdf)} className="text-xs font-bold text-blue-600">
            Abrir PDF
          </button>
        )}
        <button
          type="button"
          disabled={guardando}
          onClick={() => aplicarGuardado()}
          className="text-xs font-bold text-emerald-700"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={() => onBorrar(r)} className="text-xs font-bold text-red-600">
          Eliminar
        </button>
      </div>
    </div>
  )
})

const TrimestreAcordeonPanel = memo(function TrimestreAcordeonPanel({
  bucket,
  q,
  renderFila,
  renderGastosEstructuraTrimestre,
  abrirModalAuditoria,
}) {
  return (
    <div className="bg-white">
      {bucket.items.length === 0 ? (
        <p className="text-sm text-slate-400 italic py-10 text-center px-4">Ningún expediente en este trimestre (según mes de fecha de referencia: inicio o creación).</p>
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
                  <td className="px-4 py-3 text-right font-black text-emerald-800 tabular-nums">{formatEuroAmount(bucket.sumIngresos)}</td>
                  <td className="px-4 py-3 text-right font-black tabular-nums">
                    <span className={bucket.sumBenefReal >= 0 ? 'text-blue-700' : 'text-red-600'}>{formatEuroAmount(bucket.sumBenefReal)}</span>
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
                  <p className="text-xs font-mono text-slate-500 inline-flex items-center gap-2">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${badge.className}`} title={badge.label} />
                    {c.numero_expediente ?? '—'}
                  </p>
                  <p className="font-bold text-slate-900">{c.cliente_nombre ?? '—'}</p>
                  <p className="text-sm text-slate-600">{c.destino ?? '—'}</p>
                  <p className="text-xs text-slate-500 mt-1">Inicio: {formatearFecha(c.fechaInicioDate)}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-[10px] uppercase text-slate-400">Total ingresos</p>
                      <p className="font-bold text-emerald-800">{formatEuroAmount(ingresoMostradoHistorial(c))}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-400">Benef. neto real</p>
                      <p className={`font-bold ${beneficioMostradoHistorial(c) >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{formatEuroAmount(beneficioMostradoHistorial(c))}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => abrirModalAuditoria(c)}
                    className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold">
                    <Eye size={16} />Ver
                  </button>
                </div>
              )
            })}
            <div className="rounded-xl border border-slate-300 bg-slate-100 p-4 text-sm">
              <p className="font-black text-slate-700 uppercase text-xs mb-2">Resumen del periodo</p>
              <p className="flex justify-between"><span>Σ Total ingresos</span><span className="font-bold text-emerald-800">{formatEuroAmount(bucket.sumIngresos)}</span></p>
              <p className="flex justify-between mt-1"><span>Σ Beneficio neto real</span><span className={`font-bold ${bucket.sumBenefReal >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{formatEuroAmount(bucket.sumBenefReal)}</span></p>
            </div>
          </div>
        </>
      )}
      {q >= 1 && q <= 4
        ? (() => {
            try {
              return renderGastosEstructuraTrimestre(q)
            } catch (renderErr) {
              console.error(
                '[HistorialCierres] Error renderizando bloque gastos_fijos (trimestre)',
                {
                  trimestre: q,
                  mensaje: renderErr?.message || String(renderErr),
                  stack: renderErr?.stack,
                  objeto: renderErr,
                }
              )
              return (
                <div className="border-t-2 border-red-200 bg-red-50/80 px-4 py-4 text-xs text-red-900">
                  No se pudo mostrar el bloque de gastos de estructura. Revisa la consola para el detalle. Los
                  expedientes de arriba no se ven afectados.
                </div>
              )
            }
          })()
        : null}
    </div>
  )
})

const HistorialCierres = ({ user }) => {
  const esGestoria = user ? esUsuarioGestoria(user) : false
  const esAdmin = user ? esUsuarioAdmin(user) : false

  const [exportando, setExportando] = useState(false)
  const [año, setAño] = useState(String(añoActual))
  const [trimestreFiltro, setTrimestreFiltro] = useState('all')
  const [abiertoTrim, setAbiertoTrim] = useState({ 1: true, 2: false, 3: false, 4: false, 0: false })
  const [cuadernoIncluirPdfs, setCuadernoIncluirPdfs] = useState(false)

  const {
    cierres,
    isLoading,
    errorCargaHistorial,
    setErrorCargaHistorial,
    gastosEstructura,
    cargandoGastosEstructura,
    errorGastosEstructura,
    setErrorGastosEstructura,
    recargarGastosEstructura,
    fuenteGastosEstructura,
  } = useCierresLogic(año, trimestreFiltro, setAbiertoTrim)

  const {
    abrirModalAuditoria,
    abrirModalGastoMensual,
    borrarFacturaEstructura,
    descargarPackEstructuraMes,
    descargandoPackMes,
    cierresModalsLayerProps,
    generarGastosMensualesPlantilla,
    generandoGastosMes,
    guardarEdicionGastoEstructura,
  } = useCierresModals({
    esAdmin,
    esGestoria,
    año,
    cierres,
    gastosEstructura,
    recargarGastosEstructura,
    fuenteGastosEstructura,
  })

  useEffect(() => {
    const ySel = año
    cierres.forEach((c) => {
      const num = String(c.numero_expediente ?? '').trim()
      if (!NUMEROS_DIAGNOSTICO_HISTORIAL.includes(num)) return
      const yr = c.fechaReferenciaTrimestre?.getFullYear?.()
      if (String(yr) !== ySel) {
        console.warn('[HistorialCierres] Expediente diagnóstico cargado pero oculto por año del filtro:', num, {
          añoSeleccionado: ySel,
          añoReferencia: yr,
        })
      }
    })
  }, [cierres, año])

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
      const sumIngresos = items.reduce((s, c) => s + ingresoMostradoHistorial(c), 0)
      const sumBenefReal = items.reduce((s, c) => s + beneficioMostradoHistorial(c), 0)
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
      ingresos: cierresFiltrados.reduce((s, c) => s + ingresoMostradoHistorial(c), 0),
      gastos: cierresFiltrados.reduce((s, c) => s + n(c.gastoTotal), 0),
      beneficio: cierresFiltrados.reduce((s, c) => s + beneficioMostradoHistorial(c), 0),
    }),
    [cierresFiltrados]
  )

  const exportarCuaderno = async () => {
    if (cierresFiltrados.length === 0) return
    setExportando(true)
    try {
      // Deep-fetch: obtener costesReales de servicios_cotizacion para expedientes sin cierre_grupo
      const idsNecesitanFetch = cierresFiltrados
        .filter((c) => c.costesReales.length === 0)
        .map((c) => c.id)

      const detallesPorExpediente = {}

      if (idsNecesitanFetch.length > 0) {
        const { data: serviciosDB } = await supabase
          .from('servicios_cotizacion')
          .select('id, id_expediente, tipo_servicio, nombre_especifico, coste_real_proveedor, coste_unitario, total_servicio_manual, proveedor_id_int, nombre_proveedor_texto')
          .in('id_expediente', idsNecesitanFetch)

        const provIds = [...new Set((serviciosDB || []).map(s => s.proveedor_id_int).filter(Boolean))]
        let provNombres = {}
        if (provIds.length > 0) {
          const { data: provsDB } = await supabase
            .from('proveedores').select('id, nombre_comercial').in('id', provIds)
          ;(provsDB || []).forEach(p => { provNombres[p.id] = p.nombre_comercial })
        }

        ;(serviciosDB || []).forEach(s => {
          if (!detallesPorExpediente[s.id_expediente]) detallesPorExpediente[s.id_expediente] = []
          const proveedor = (s.proveedor_id_int && provNombres[s.proveedor_id_int]) || s.nombre_proveedor_texto || 'Pendiente de asignar'
          const tipo      = s.tipo_servicio || 'Servicio'
          const concepto  = s.nombre_especifico ? `${tipo} – ${s.nombre_especifico}` : tipo
          detallesPorExpediente[s.id_expediente].push({
            concepto,
            proveedor,
            coste_cotizado: n(s.total_servicio_manual ?? s.coste_unitario),
            coste_real:     n(s.coste_real_proveedor ?? s.total_servicio_manual ?? s.coste_unitario),
          })
        })
      }

      // Enriquecer: fusionar costesReales con deep-fetch
      const cierresEnriquecidos = cierresFiltrados.map(c => {
        const detalle = c.costesReales.length > 0
          ? c.costesReales
          : (detallesPorExpediente[c.id] || [])

        const gastoReal = c.gastoTotal > 0
          ? c.gastoTotal
          : detalle.reduce((s, d) => s + n(d.coste_real), 0)
            + (c.gastosImprevistos || []).reduce((s, g) => s + n(g.importe), 0)

        const beneficioNeto = c.ingresoTotal - gastoReal
        const beneficioBruto = beneficioNeto > 0 ? beneficioNeto + c.ivaPagado : beneficioNeto

        return {
          ...c,
          detalle,
          gastoTotal:    gastoReal,
          beneficioNeto,
          beneficioBruto,
        }
      })

      let pdfLinksByExpedienteId = null
      if (cuadernoIncluirPdfs) {
        const ids = cierresFiltrados.map((c) => c.id)
        pdfLinksByExpedienteId = {}
        if (ids.length > 0) {
          const { data: pagosRows } = await supabase
            .from('pagos_proveedores')
            .select('expediente_id, concepto, numero_factura, proveedor_nombre, url_pdf')
            .in('expediente_id', ids)
          for (const p of pagosRows || []) {
            const url = resolverUrlPublicaFacturaProveedor(p.url_pdf)
            if (!url) continue
            const eid = p.expediente_id
            if (!pdfLinksByExpedienteId[eid]) pdfLinksByExpedienteId[eid] = []
            pdfLinksByExpedienteId[eid].push({
              label: `${p.proveedor_nombre || 'Proveedor'} — ${p.concepto || p.numero_factura || 'Factura'}`,
              url,
            })
          }
        }
      }

      const etiquetaCuaderno =
        trimestreFiltro === 'all'
          ? `${año} · Todos los trimestres (Cerrado / Liquidado)`
          : `${año} · ${TRIMESTRES.find((t) => t.value === trimestreFiltro)?.label ?? `T${trimestreFiltro}`} (Cerrado / Liquidado)`

      const htmlContent = construirHTMLCuaderno(cierresEnriquecidos, etiquetaCuaderno, pdfLinksByExpedienteId)
      const fileName =
        trimestreFiltro === 'all'
          ? `Cuaderno_Cierres_${año}_Todos.xls`
          : `Cuaderno_Cierres_${año}_T${trimestreFiltro}.xls`

      const blob = new Blob(['\uFEFF' + htmlContent], { type: 'application/vnd.ms-excel;charset=utf-8' })
      const a    = document.createElement('a')
      a.href     = URL.createObjectURL(blob)
      a.download = fileName
      a.click()
      URL.revokeObjectURL(a.href)

    } catch (err) {
      console.error('[Cuaderno] Error al generar:', err)
      alert('Error al generar el cuaderno. Revisa la consola.')
    } finally {
      setExportando(false)
    }
  }

  const etiquetaPeriodo = `Ejercicio ${año}`

  const toggleAcordeon = (q) => {
    setAbiertoTrim((s) => ({ ...s, [q]: !s[q] }))
  }

  const renderGastosEstructuraTrimestre = useCallback((qTrim) => {
    const anioNum = parseInt(año, 10)
    if (!Number.isFinite(anioNum) || qTrim < 1 || qTrim > 4) return null
    const meses = mesesDelTrimestre(qTrim)
    return (
      <div className="border-t-2 border-slate-200 bg-gradient-to-b from-slate-50/95 to-slate-100/80 px-4 py-5 sm:px-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
            Gastos mensuales (estructura)
          </p>
          {cargandoGastosEstructura && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <Loader2 size={14} className="animate-spin" /> Actualizando facturas…
            </span>
          )}
        </div>
        {esAdmin && meses.length > 0 && (
          <div className="flex flex-col gap-2 rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-900/90">
              Gastos de estructura por mes
            </span>
            <div className="flex flex-wrap gap-2">
              {meses.map((mesNum) => {
                const generando = generandoGastosMes === `${anioNum}-${mesNum}`
                return (
                  <div
                    key={mesNum}
                    className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-amber-200/90 bg-white/90 px-2 py-1.5"
                  >
                    <span className="text-[10px] font-black text-amber-950 pr-1">{NOMBRES_MES[mesNum - 1]}</span>
                    <button
                      type="button"
                      disabled={generando}
                      onClick={() => generarGastosMensualesPlantilla(mesNum)}
                      className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md bg-violet-600 hover:bg-violet-700 disabled:bg-slate-400 text-white text-[10px] font-black uppercase tracking-wide"
                      title="Inserta filas desde gastos_plantilla (mensual + Seguro coche en noviembre)"
                    >
                      {generando ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                      Generar
                    </button>
                    <button
                      type="button"
                      onClick={() => abrirModalGastoMensual(mesNum, { esExtra: true })}
                      className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md bg-amber-700 hover:bg-amber-800 text-white text-[10px] font-black uppercase tracking-wide"
                    >
                      <Plus size={11} /> Extra
                    </button>
                    <button
                      type="button"
                      onClick={() => abrirModalGastoMensual(mesNum, { esExtra: false })}
                      className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md border border-amber-300 bg-amber-50 text-amber-950 text-[10px] font-bold hover:bg-amber-100"
                    >
                      Factura
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {meses.map((mesNum) => {
          const nombreMes = NOMBRES_MES[mesNum - 1]
          const rows = gastosEstructura.filter(
            (g) => Number(g.mes) === mesNum && Number(g.anio) === anioNum
          )
          const expedientesMesCalendario = cierres.filter((c) => {
            const d = c.fechaReferenciaTrimestre
            if (!d || isNaN(d.getTime())) return false
            return d.getFullYear() === anioNum && d.getMonth() + 1 === mesNum
          })
          const descargando = descargandoPackMes === `${anioNum}-${mesNum}`
          const conPdf = rows.filter((r) => r.url_pdf)
          const puedePackMes = expedientesMesCalendario.length > 0 || conPdf.length > 0
          const fmtFechaFact = (raw) => {
            if (!raw) return '—'
            const d = parsearFechaADate(raw) || new Date(raw)
            return !isNaN(d.getTime())
              ? d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
              : '—'
          }
          const colSpanTabla = esAdmin ? 6 : 5
          const filaVaciaListado = (
            <tr>
              <td colSpan={colSpanTabla} className="px-4 py-8 text-center bg-gradient-to-b from-slate-50/80 to-white border-t border-slate-100">
                <p className="text-sm font-medium text-slate-600">Sin gastos de estructura este mes</p>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Los registros que subas con el botón superior aparecerán aquí. La vista de expedientes no se ve afectada si esta tabla falla.
                </p>
              </td>
            </tr>
          )
          return (
            <div
              key={mesNum}
              className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-800 text-white flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <h3 className="text-sm font-black uppercase tracking-wide shrink-0">
                  Gastos mensuales — {nombreMes}
                </h3>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-1 sm:justify-end sm:gap-4 min-w-0">
                  {rows.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end flex-1 min-w-0">
                      {rows.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center gap-2 rounded-lg bg-slate-700/90 px-2.5 py-1.5 text-white text-xs border border-slate-600/80"
                        >
                          <span
                            className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-600 font-black text-[10px] shrink-0"
                            title={r.proveedor || ''}
                          >
                            {inicialesProveedorEstructura(r.proveedor)}
                          </span>
                          <Building2 size={14} className="text-slate-400 shrink-0 hidden md:block" aria-hidden />
                          <span className="font-semibold truncate max-w-[130px] sm:max-w-[160px]">{r.proveedor ?? '—'}</span>
                          <span
                            className={`tabular-nums font-bold shrink-0 ${
                              importeGastoEstructuraPendiente(r.importe) ? 'text-red-300' : 'text-emerald-300'
                            }`}
                          >
                            {formatEuroAmount(r.importe)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {esAdmin && (
                      <>
                        <button
                          type="button"
                          disabled={generandoGastosMes === `${anioNum}-${mesNum}`}
                          onClick={() => generarGastosMensualesPlantilla(mesNum)}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-slate-500 text-white text-[10px] sm:text-xs font-black uppercase tracking-[0.08em] shadow-md transition-colors"
                        >
                          {generandoGastosMes === `${anioNum}-${mesNum}` ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Sparkles size={14} />
                          )}
                          Generar gastos mensuales
                        </button>
                        <button
                          type="button"
                          onClick={() => abrirModalGastoMensual(mesNum, { esExtra: true })}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase tracking-[0.12em] shadow-md transition-colors"
                        >
                          <Plus size={16} />+ AÑADIR GASTO
                        </button>
                        <button
                          type="button"
                          onClick={() => abrirModalGastoMensual(mesNum, { esExtra: false })}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border-2 border-amber-400/80 bg-amber-50 hover:bg-amber-100 text-amber-950 text-[10px] sm:text-xs font-black uppercase tracking-[0.08em] shadow-sm transition-colors"
                        >
                          Factura estructura
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={descargando || !puedePackMes}
                      onClick={() => descargarPackEstructuraMes(mesNum, nombreMes)}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-500 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-[0.12em] shadow-md transition-colors"
                    >
                      {descargando ? <Loader2 size={16} className="animate-spin" /> : <Package size={16} />}
                      DESCARGAR PACK {nombreMes.toUpperCase()}
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <div className="hidden sm:block overflow-x-auto mb-4">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        {['Fecha', 'Proveedor', 'Concepto', 'Importe (c/IVA)', 'PDF', ...(esAdmin ? ['Acciones'] : [])].map(
                          (lab) => (
                            <th
                              key={lab}
                              className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider ${
                                String(lab).includes('Importe') ? 'text-right' : 'text-left'
                              }`}
                            >
                              {lab}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.length === 0
                        ? filaVaciaListado
                        : rows.map((r) => {
                            const url = resolverUrlPublicaFacturaProveedor(r.url_pdf)
                            return (
                              <GastoEstructuraEditor
                                key={r.id}
                                r={r}
                                esAdmin={esAdmin}
                                fmtFechaFact={fmtFechaFact}
                                url={url}
                                onAbrirPdf={abrirFacturaProveedorPorUrlGuardada}
                                onBorrar={borrarFacturaEstructura}
                                onGuardarEdicion={guardarEdicionGastoEstructura}
                                layout="table"
                              />
                            )
                          })}
                    </tbody>
                  </table>
                </div>
                <div className="sm:hidden space-y-2 mb-4">
                  {rows.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
                      <p className="text-sm font-medium text-slate-600">Sin gastos de estructura este mes</p>
                      <p className="text-xs text-slate-400 mt-1">Usa «Añadir Gasto de Estructura» para registrar facturas.</p>
                    </div>
                  ) : (
                    rows.map((r) => {
                      const url = resolverUrlPublicaFacturaProveedor(r.url_pdf)
                      return (
                        <GastoEstructuraEditor
                          key={r.id}
                          r={r}
                          esAdmin={esAdmin}
                          fmtFechaFact={fmtFechaFact}
                          url={url}
                          onAbrirPdf={abrirFacturaProveedorPorUrlGuardada}
                          onBorrar={borrarFacturaEstructura}
                          onGuardarEdicion={guardarEdicionGastoEstructura}
                          layout="card"
                        />
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }, [
    año,
    gastosEstructura,
    cargandoGastosEstructura,
    esAdmin,
    cierres,
    descargandoPackMes,
    abrirModalGastoMensual,
    descargarPackEstructuraMes,
    borrarFacturaEstructura,
    generarGastosMensualesPlantilla,
    generandoGastosMes,
    guardarEdicionGastoEstructura,
  ])

  const renderFila = useCallback((c) => {
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
      <td className="px-4 py-3 text-right font-medium text-emerald-800 whitespace-nowrap">{formatEuroAmount(ingresoMostradoHistorial(c))}</td>
      <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
        <span className={beneficioMostradoHistorial(c) >= 0 ? 'text-blue-700' : 'text-red-600'}>{formatEuroAmount(beneficioMostradoHistorial(c))}</span>
      </td>
      <td className="px-4 py-3 text-center">
        <button type="button" onClick={() => abrirModalAuditoria(c)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors">
          <Eye size={14} />Ver
        </button>
      </td>
    </tr>
    )
  }, [abrirModalAuditoria])

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
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">
              {q === 0 ? 'Fuera de T1–T4' : `Trimestre ${q}`}
            </p>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span className="text-blue-600">T{q === 0 ? '—' : q}</span>
              <span className="text-slate-600 font-bold text-lg sm:text-xl">{bucket.titulo}</span>
            </h2>
            {bucket.items.length > 0 && (
              <p className="text-xs text-slate-500 mt-2">{bucket.items.length} expediente{bucket.items.length !== 1 ? 's' : ''}</p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:block text-right rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase">Σ ingresos · Σ benef. neto real</p>
              <p className="text-sm font-black text-slate-800 tabular-nums">
                {formatEuroAmount(bucket.sumIngresos)} · <span className={bucket.sumBenefReal >= 0 ? 'text-blue-700' : 'text-red-600'}>{formatEuroAmount(bucket.sumBenefReal)}</span>
              </p>
            </div>
            <ChevronDown size={22} className={`text-slate-400 transition-transform shrink-0 ${abierto ? 'rotate-180' : ''}`} />
          </div>
        </button>
        {abierto && (
          <TrimestreAcordeonPanel
            bucket={bucket}
            q={q}
            renderFila={renderFila}
            renderGastosEstructuraTrimestre={renderGastosEstructuraTrimestre}
            abrirModalAuditoria={abrirModalAuditoria}
          />
        )}
      </div>
    )
  }

  return (
    <>
    <div className="p-6 sm:p-8 max-w-[1400px] mx-auto">

      {/* Cabecera */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Cierres Económicos
          </h1>
          <p className="text-slate-500 font-medium text-sm mt-1">
            Estados <strong>Cerrado</strong> y <strong>Liquidado</strong> · datos desde <code className="text-[10px] bg-slate-100 px-1 rounded">expedientes_nuevos</code> (si existe) o <code className="text-[10px] bg-slate-100 px-1 rounded">expedientes</code> · sin límite de filas en la consulta · T1–T4 por mes de fecha de referencia · {etiquetaPeriodo}
            {esGestoria && (
              <span className="block mt-1 text-amber-700 font-semibold">
                Perfil gestoría/auditoría: lectura y descarga de packs de estructura; sin subida ni borrado de facturas de estructura ni edición del cierre desde aquí.
              </span>
            )}
          </p>
        </div>

        {/* Controles */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-slate-400 shrink-0" />
            <select value={año} onChange={e => setAño(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400">
              {AÑOS.map(a => <option key={a} value={String(a)}>{a}</option>)}
            </select>
          </div>
          <select
            value={trimestreFiltro}
            onChange={(e) => setTrimestreFiltro(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {TRIMESTRES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none border border-slate-200 rounded-lg px-3 py-2 bg-white">
            <input
              type="checkbox"
              checked={cuadernoIncluirPdfs}
              onChange={(e) => setCuadernoIncluirPdfs(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            Incl. enlaces PDF proveedores
          </label>
          <button type="button" onClick={exportarCuaderno}
            disabled={cierresFiltrados.length === 0 || exportando}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold shadow-sm transition-colors text-sm"
          >
            {exportando
              ? <><Loader2 size={16} className="animate-spin" />Generando…</>
              : <><FileSpreadsheet size={16} />Cuaderno Trimestral</>
            }
          </button>
        </div>
      </div>

      {(errorCargaHistorial || errorGastosEstructura) && (
        <div className="mb-4 space-y-2" role="alert">
          {errorCargaHistorial && (
            <div className="flex flex-col sm:flex-row sm:items-start gap-2 rounded-xl border border-red-200 bg-red-50/95 px-4 py-3 text-sm text-red-900 shadow-sm">
              <p className="flex-1 font-medium whitespace-pre-wrap break-words">
                <span className="font-black">Expedientes de cierre: </span>
                {errorCargaHistorial}
              </p>
              <button
                type="button"
                onClick={() => setErrorCargaHistorial(null)}
                className="shrink-0 self-end sm:self-start text-xs font-bold uppercase tracking-wide text-red-800 underline decoration-red-300 hover:text-red-950"
              >
                Cerrar aviso
              </button>
            </div>
          )}
          {errorGastosEstructura && (
            <div className="flex flex-col sm:flex-row sm:items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm text-amber-950 shadow-sm">
              <p className="flex-1 font-medium whitespace-pre-wrap break-words">
                <span className="font-black">Gastos de estructura: </span>
                {errorGastosEstructura}
              </p>
              <button
                type="button"
                onClick={() => setErrorGastosEstructura(null)}
                className="shrink-0 self-end sm:self-start text-xs font-bold uppercase tracking-wide text-amber-900 underline decoration-amber-300 hover:text-amber-950"
              >
                Cerrar aviso
              </button>
            </div>
          )}
        </div>
      )}

      {/* Totales dinámicos (solo filas visibles; pueden ser 0 € si el trimestre filtrado está vacío) */}
      {!isLoading && expedientesDelAño.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total ingresos', value: totales.ingresos, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
            { label: 'Gastos', value: totales.gastos, color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
            { label: 'Beneficio neto real', value: totales.beneficio, color: totales.beneficio >= 0 ? 'text-blue-700' : 'text-red-700', bg: totales.beneficio >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200' },
          ].map((card) => (
            <div key={card.label} className={`rounded-xl border p-4 ${card.bg}`}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{card.label}</p>
              <p className={`text-2xl font-extrabold ${card.color}`}>{formatEuroAmount(card.value)}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {cierresFiltrados.length} expediente{cierresFiltrados.length !== 1 ? 's' : ''} en vista · {TRIMESTRES.find((t) => t.value === trimestreFiltro)?.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Acordeones T1–T4 */}
      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm py-14 px-6 text-center text-slate-500">
          <TrendingUp className="mx-auto text-slate-300 mb-4 animate-pulse" size={48} />
          <p className="font-semibold text-slate-700">Cargando expedientes (Cerrado / Liquidado)…</p>
          <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto">
            Si la red tarda demasiado, la vista se liberará sola; los gastos de estructura se cargan aparte y no bloquean esta lista.
          </p>
        </div>
      ) : cierres.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-12 text-center">
          <FileText className="mx-auto text-slate-300 mb-4" size={56} />
          <h3 className="text-xl font-bold text-slate-800 mb-2">No hay expedientes en cierre</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            Esta vista lista registros con estado <code className="text-xs bg-slate-100 px-1 rounded">Cerrado</code> o{' '}
            <code className="text-xs bg-slate-100 px-1 rounded">Liquidado</code> (sin distinguir mayúsculas).
          </p>
        </div>
      ) : expedientesDelAño.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-12 text-center">
          <FileText className="mx-auto text-slate-300 mb-4" size={56} />
          <h3 className="text-xl font-bold text-slate-800 mb-2">Sin expedientes en {año}</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            No hay expedientes Cerrado/Liquidado cuyo año de referencia (inicio, creación o fecha actual como último recurso) coincida con {año}.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 mb-2">
            El trimestre filtra qué bloque T1–T4 se muestra. La columna «Fecha inicio» muestra la fecha de viaje si existe; el reparto por trimestre usa la fecha de referencia descrita arriba. Verde: Cerrado · teal: Liquidado. La suma de beneficio usa el mismo criterio que el desglose (<code className="text-[10px] bg-slate-100 px-1 rounded">cierre_grupo</code> cuando existe).
          </p>
          {bucketsVisibles.map(renderBloqueTrimestre)}
          {bucketSinFechaVisible && renderBloqueTrimestre(bucketSinFechaVisible)}
        </div>
      )}

      {!isLoading && expedientesDelAño.length > 0 && (
        <p className="mt-4 text-xs text-slate-400 text-center">
          Cuaderno trimestral exporta solo los expedientes del filtro activo (vacío si no hay filas). Desglose: Bus, Hotel, Restaurante, Guía, Otros, Imprevistos.
          {' '}Con «Incl. enlaces PDF proveedores» se añade un anexo con hipervínculos a la documentación en <code className="text-[10px] bg-slate-100 px-1 rounded">pagos_proveedores</code>.
        </p>
      )}
    </div>
    <CierresModalsLayer {...cierresModalsLayerProps} />
    </>
  )
}

export default HistorialCierres
