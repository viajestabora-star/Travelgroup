import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Eye, TrendingUp, FileSpreadsheet, Filter, Loader2 } from 'lucide-react'
import { supabase } from '../supabase'
import { categorizarPago } from '../utils/finanzasHelpers'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const n = (v) => { const num = Number(v ?? 0); return Number.isFinite(num) ? num : 0 }

const esc = (str) => String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

const fmtEur = (v) => n(v).toFixed(2)

/**
 * Extrae finanzas canónicas de un expediente.
 * Cascade: cierre_grupo → columnas directas → 0
 */
const extraerFinanzas = (exp) => {
  const cg = exp.cierre_grupo || {}

  const ingresoTotal  = n(cg.ingresos_totales ?? cg.total_ingresos ?? exp.total_ingresos)
  const ivaPagado     = n(cg.iva_pagado)
  const beneficioNeto = n(cg.beneficio_limpio ?? cg.beneficio_neto ?? cg.beneficio ?? exp.beneficio_neto_real ?? exp.liquidacion_final_beneficio)

  // Gastos: gastos_totales → sum(costesReales) → total_gastos_reales
  let gastoTotal = n(cg.gastos_totales ?? cg.gastos_reales ?? exp.total_gastos_reales)
  const costesReales     = Array.isArray(cg.costesReales)      ? cg.costesReales      : []
  const gastosImprevistos = Array.isArray(cg.gastosImprevistos) ? cg.gastosImprevistos : []
  if (gastoTotal === 0 && costesReales.length > 0) {
    gastoTotal = costesReales.reduce((s, c) => s + n(c.coste_real), 0)
      + gastosImprevistos.reduce((s, g) => s + n(g.importe), 0)
  }

  const beneficioBruto = n(cg.beneficio_bruto ?? (beneficioNeto + ivaPagado))

  const fechaCierre = cg.fecha
    ? new Date(cg.fecha)
    : exp.fecha_inicio ? new Date(exp.fecha_inicio) : null

  return { ingresoTotal, gastoTotal, ivaPagado, beneficioBruto, beneficioNeto, fechaCierre, costesReales, gastosImprevistos }
}

// ─── Constantes UI ────────────────────────────────────────────────────────────

const getQuarter = (d) => d ? Math.floor(d.getMonth() / 3) + 1 : null
const CATEGORIAS = ['Bus', 'Hotel', 'Restaurante', 'Guía', 'Otros']

const TRIMESTRES = [
  { value: 'all', label: 'Todos los trimestres' },
  { value: '1',   label: 'Q1 — Ene / Feb / Mar'  },
  { value: '2',   label: 'Q2 — Abr / May / Jun'  },
  { value: '3',   label: 'Q3 — Jul / Ago / Sep'  },
  { value: '4',   label: 'Q4 — Oct / Nov / Dic'  },
]
const añoActual = new Date().getFullYear()
const AÑOS = Array.from({ length: 6 }, (_, i) => añoActual - i)

// ─── Generador del Cuaderno HTML-Excel ────────────────────────────────────────

/**
 * Construye el contenido HTML del Cuaderno de Cierres.
 * Excel y Numbers abren este formato respetando estilos inline.
 */
const construirHTMLCuaderno = (cierresEnriquecidos, etiquetaPeriodo) => {
  const totPeriodo = {
    ingresos:  cierresEnriquecidos.reduce((s, c) => s + c.ingresoTotal,  0),
    gastos:    cierresEnriquecidos.reduce((s, c) => s + c.gastoTotal,    0),
    beneficio: cierresEnriquecidos.reduce((s, c) => s + c.beneficioNeto, 0),
  }

  const CSS = `
    body  { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1e293b; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 4pt; }
    td, th { padding: 5pt 8pt; border: 1px solid #cbd5e1; vertical-align: middle; }
    .periodo-title { font-size: 16pt; font-weight: bold; background: #0f172a; color: #ffffff; }
    .periodo-meta  { font-size: 10pt; background: #1e293b; color: #94a3b8; }
    .resumen-head  { font-size: 10pt; font-weight: bold; background: #334155; color: #f8fafc; }
    .resumen-val   { font-size: 11pt; font-weight: bold; text-align: right; }
    .exp-title     { font-size: 13pt; font-weight: bold; background: #1d4ed8; color: #ffffff; }
    .exp-meta      { font-size: 9pt; background: #eff6ff; color: #1e3a8a; }
    .section-head  { font-size: 9pt; font-weight: bold; background: #475569; color: #f8fafc; }
    .col-head      { font-size: 9pt; font-weight: bold; background: #64748b; color: #ffffff; text-align: center; }
    .cat-label     { font-size: 9pt; font-weight: bold; color: #475569; background: #f1f5f9; }
    .num           { text-align: right; font-variant-numeric: tabular-nums; }
    .total-gastos  { font-weight: bold; background: #fef2f2; }
    .num-neg       { text-align: right; color: #b91c1c; }
    .row-ing       { background: #f0fdf4; }
    .row-gas       { background: #fef2f2; }
    .row-bruto     { font-weight: bold; background: #eff6ff; }
    .row-iva       { background: #fff7ed; color: #92400e; }
    .row-neto      { font-size: 13pt; font-weight: bold; background: #dcfce7; color: #15803d; }
    .separador td  { border: none; background: transparent; height: 16pt; }
    .linea-sep td  { border: none; border-top: 2px solid #94a3b8; height: 4pt; background: transparent; }
  `

  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:x="urn:schemas-microsoft-com:office:excel"
    xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="application/vnd.ms-excel; charset=UTF-8">
  <style>${CSS}</style>
</head>
<body>`

  // ── Portada / Resumen del periodo ─────────────────────────────────────────
  html += `
<table>
  <tr><td colspan="4" class="periodo-title">Cuaderno de Cierres — ${esc(etiquetaPeriodo)}</td></tr>
  <tr><td colspan="4" class="periodo-meta">Generado el ${new Date().toLocaleDateString('es-ES', { day:'2-digit', month:'long', year:'numeric' })} · ${cierresEnriquecidos.length} expediente${cierresEnriquecidos.length !== 1 ? 's' : ''} cerrado${cierresEnriquecidos.length !== 1 ? 's' : ''}</td></tr>
</table>
<table>
  <tr>
    <th class="resumen-head">Total Ingresos (€)</th>
    <th class="resumen-head">Total Gastos Prov. (€)</th>
    <th class="resumen-head">Beneficio Neto (€)</th>
  </tr>
  <tr>
    <td class="resumen-val" style="color:#15803d">${fmtEur(totPeriodo.ingresos)}</td>
    <td class="resumen-val" style="color:#b91c1c">${fmtEur(totPeriodo.gastos)}</td>
    <td class="resumen-val" style="color:${totPeriodo.beneficio >= 0 ? '#1d4ed8' : '#b91c1c'}">${fmtEur(totPeriodo.beneficio)}</td>
  </tr>
</table>`

  // ── Bloque por expediente ─────────────────────────────────────────────────
  for (const c of cierresEnriquecidos) {
    const grupo  = esc(c.nombre_grupo || c.cliente_nombre || 'Sin grupo')
    const viaje  = esc(c.destino || 'Sin destino')
    const numExp = esc(c.numero_expediente || '—')
    const fecha  = c.fechaCierre
      ? c.fechaCierre.toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric' })
      : '—'

    // Agrupar costesReales por categoría
    const porCat = Object.fromEntries(CATEGORIAS.map(cat => [cat, []]))
    for (const d of c.detalle) {
      const cat = categorizarPago(d.concepto)
      ;(porCat[cat] || porCat.Otros).push(d)
    }

    html += `
<table class="separador"><tr><td colspan="4"></td></tr></table>
<table class="linea-sep"><tr><td colspan="4"></td></tr></table>

<table>
  <tr><td colspan="4" class="exp-title">📋 ${grupo} — ${viaje}</td></tr>
  <tr>
    <td class="exp-meta"><b>Nº Expediente:</b> ${numExp}</td>
    <td class="exp-meta"><b>Fecha de Cierre:</b> ${fecha}</td>
    <td class="exp-meta"><b>Ingresos:</b> ${fmtEur(c.ingresoTotal)} €</td>
    <td class="exp-meta"><b>Gastos:</b> ${fmtEur(c.gastoTotal)} €</td>
  </tr>
</table>

<table>
  <tr><td colspan="4" class="section-head">DESGLOSE DE PAGOS A PROVEEDORES</td></tr>
  <tr>
    <th class="col-head" style="width:12%">Categoría</th>
    <th class="col-head" style="width:36%">Concepto</th>
    <th class="col-head" style="width:32%">Proveedor</th>
    <th class="col-head" style="width:20%">Importe (€)</th>
  </tr>`

    let hayFilas = false
    for (const cat of CATEGORIAS) {
      for (const d of porCat[cat]) {
        hayFilas = true
        html += `  <tr>
    <td class="cat-label">${esc(cat)}</td>
    <td>${esc(d.concepto || '—')}</td>
    <td>${esc(d.proveedor || 'Pendiente de asignar')}</td>
    <td class="num">${fmtEur(d.coste_real)}</td>
  </tr>`
      }
    }

    // Imprevistos
    for (const g of c.gastosImprevistos || []) {
      hayFilas = true
      html += `  <tr>
    <td class="cat-label">Imprevisto</td>
    <td colspan="2">${esc(g.concepto || '—')}</td>
    <td class="num">${fmtEur(g.importe)}</td>
  </tr>`
    }

    if (!hayFilas) {
      html += `  <tr><td colspan="4" style="text-align:center; color:#94a3b8; font-style:italic">Sin desglose de proveedores registrado</td></tr>`
    }

    html += `  <tr class="total-gastos">
    <td colspan="3"><b>TOTAL GASTOS PROVEEDORES</b></td>
    <td class="num"><b>${fmtEur(c.gastoTotal)}</b></td>
  </tr>
</table>

<table>
  <tr><td colspan="2" class="section-head">RESUMEN DE RESULTADOS</td></tr>
  <tr class="row-ing">
    <td>Total Ingresos</td>
    <td class="num" style="color:#15803d; font-weight:bold">${fmtEur(c.ingresoTotal)} €</td>
  </tr>
  <tr class="row-gas">
    <td>Total Gastos Proveedores</td>
    <td class="num" style="color:#b91c1c; font-weight:bold">${fmtEur(c.gastoTotal)} €</td>
  </tr>
  <tr class="row-bruto">
    <td>Beneficio Bruto</td>
    <td class="num">${fmtEur(c.beneficioBruto)} €</td>
  </tr>
  <tr class="row-iva">
    <td>IVA sobre Beneficio (21%)</td>
    <td class="num-neg">− ${fmtEur(c.ivaPagado)} €</td>
  </tr>
  <tr class="row-neto">
    <td><b>BENEFICIO NETO</b></td>
    <td class="num"><b>${fmtEur(c.beneficioNeto)} €</b></td>
  </tr>
</table>`
  }

  html += `</body></html>`
  return html
}

// ─── Componente ───────────────────────────────────────────────────────────────

const HistorialCierres = () => {
  const navigate = useNavigate()
  const [cierres,    setCierres]    = useState([])
  const [cargando,   setCargando]   = useState(true)
  const [exportando, setExportando] = useState(false)
  const [trimestre,  setTrimestre]  = useState('all')
  const [año,        setAño]        = useState(String(añoActual))

  useEffect(() => { cargarCierres() }, [])

  const cargarCierres = async () => {
    setCargando(true)
    try {
      const { data, error } = await supabase
        .from('expedientes')
        .select(`id, numero_expediente, nombre_grupo, cliente_nombre, destino, fecha_inicio,
                 total_ingresos, total_gastos_reales, beneficio_neto_real,
                 liquidacion_final_beneficio, cierre_grupo, informe_gastos_hacienda`)
        .or('estado.eq.Cerrado,estado.ilike.cerrado,estado.ilike.finalizado')
        .order('fecha_inicio', { ascending: false, nullsFirst: false })

      if (error) { setCierres([]); return }

      const mapeados = (data || []).map((exp) => ({ ...exp, ...extraerFinanzas(exp) }))
      mapeados.sort((a, b) => (b.fechaCierre?.getTime() ?? 0) - (a.fechaCierre?.getTime() ?? 0))
      setCierres(mapeados)
    } catch { setCierres([]) }
    finally   { setCargando(false) }
  }

  const cierresFiltrados = useMemo(() => cierres.filter((c) => {
    const f = c.fechaCierre
    if (!f) return true
    if (String(f.getFullYear()) !== año) return false
    return trimestre === 'all' || getQuarter(f) === parseInt(trimestre, 10)
  }), [cierres, año, trimestre])

  const totales = useMemo(() => ({
    ingresos:  cierresFiltrados.reduce((s, c) => s + c.ingresoTotal,  0),
    gastos:    cierresFiltrados.reduce((s, c) => s + c.gastoTotal,    0),
    beneficio: cierresFiltrados.reduce((s, c) => s + c.beneficioNeto, 0),
  }), [cierresFiltrados])

  // ── Exportar Cuaderno de Cierres ──────────────────────────────────────────
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

      const etiquetaPeriodo = trimestre === 'all'
        ? `Todo ${año}`
        : `${TRIMESTRES.find(t => t.value === trimestre)?.label ?? ''} · ${año}`

      const htmlContent = construirHTMLCuaderno(cierresEnriquecidos, etiquetaPeriodo)
      const fileName    = `Cuaderno_Cierres_${trimestre === 'all' ? año : `${año}_Q${trimestre}`}.xls`

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

  const formatearFecha = (f) => f
    ? f.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—'

  const verDetalle = (exp) => navigate('/expedientes', { state: { abrirExpedienteId: exp.id, tabInicial: 'cierre' } })

  const etiquetaPeriodo = trimestre === 'all'
    ? `Todo ${año}`
    : `${TRIMESTRES.find(t => t.value === trimestre)?.label ?? ''} · ${año}`

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 sm:p-8 max-w-[1400px] mx-auto">

      {/* Cabecera */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Historial de Cierres
          </h1>
          <p className="text-slate-500 font-medium text-sm mt-1">
            Expedientes cerrados · {etiquetaPeriodo}
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
          <select value={trimestre} onChange={e => setTrimestre(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400">
            {TRIMESTRES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
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

      {/* Tarjetas de resumen */}
      {!cargando && cierresFiltrados.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label:'Total Ingresos',          value:totales.ingresos,  color:'text-emerald-700', bg:'bg-emerald-50 border-emerald-200' },
            { label:'Total Gastos Proveedores', value:totales.gastos,   color:'text-red-700',     bg:'bg-red-50 border-red-200'         },
            { label:'Beneficio Neto',           value:totales.beneficio, color:totales.beneficio>=0?'text-blue-700':'text-red-700', bg:totales.beneficio>=0?'bg-blue-50 border-blue-200':'bg-red-50 border-red-200' },
          ].map(card => (
            <div key={card.label} className={`rounded-xl border p-4 ${card.bg}`}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{card.label}</p>
              <p className={`text-2xl font-extrabold ${card.color}`}>{card.value.toFixed(2)} €</p>
              <p className="text-xs text-slate-400 mt-0.5">{cierresFiltrados.length} expediente{cierresFiltrados.length !== 1 ? 's' : ''}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabla / estado */}
      {cargando ? (
        <div className="py-16 text-center text-slate-500">
          <TrendingUp className="mx-auto text-slate-300 mb-4 animate-pulse" size={48} />
          <p>Cargando cierres...</p>
        </div>
      ) : cierresFiltrados.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-12 text-center">
          <FileText className="mx-auto text-slate-300 mb-4" size={56} />
          <h3 className="text-xl font-bold text-slate-800 mb-2">
            {cierres.length === 0 ? 'No hay expedientes cerrados' : `Sin cierres en ${etiquetaPeriodo}`}
          </h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            {cierres.length === 0
              ? 'Los expedientes aparecerán aquí cuando tengan estado Cerrado.'
              : 'Prueba a cambiar el año o el trimestre.'}
          </p>
        </div>
      ) : (
        <>
          {/* Tabla desktop */}
          <div className="hidden md:block bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-white">
                <tr>
                  {['Nº Exp.','Cliente','Destino','Fecha Cierre','Ingresos','Gastos Prov.','Beneficio',''].map((h,i) => (
                    <th key={i} className={`px-4 py-3 font-black uppercase tracking-[0.12em] text-xs ${i>=4?'text-right':''} ${i===7?'text-center':''}`}>{h||'Acción'}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cierresFiltrados.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.numero_expediente||'—'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{c.cliente_nombre||c.nombre_grupo||'—'}</td>
                    <td className="px-4 py-3 text-slate-600">{c.destino||'—'}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatearFecha(c.fechaCierre)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">{c.ingresoTotal.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {c.gastoTotal > 0
                        ? <span className="font-medium text-red-600">{c.gastoTotal.toFixed(2)} €</span>
                        : <span className="text-slate-300 text-xs italic">sin datos</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                      <span className={c.beneficioNeto>=0?'text-blue-700':'text-red-600'}>{c.beneficioNeto.toFixed(2)} €</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button type="button" onClick={() => verDetalle(c)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors">
                        <Eye size={14} />Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                <tr>
                  <td colSpan={4} className="px-4 py-3 font-black text-slate-700 uppercase text-xs tracking-widest">TOTALES ({cierresFiltrados.length})</td>
                  <td className="px-4 py-3 text-right font-black text-emerald-700">{totales.ingresos.toFixed(2)} €</td>
                  <td className="px-4 py-3 text-right font-black text-red-600">{totales.gastos.toFixed(2)} €</td>
                  <td className="px-4 py-3 text-right font-black">
                    <span className={totales.beneficio>=0?'text-blue-700':'text-red-600'}>{totales.beneficio.toFixed(2)} €</span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Tarjetas móvil */}
          <div className="md:hidden space-y-4">
            {cierresFiltrados.map((c) => (
              <div key={c.id} className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="text-xs font-mono text-slate-400 mb-0.5">{c.numero_expediente||'—'}</p>
                      <h3 className="font-bold text-slate-900">{c.cliente_nombre||c.nombre_grupo||'—'}</h3>
                      <p className="text-sm text-slate-500">{c.destino||'—'}</p>
                    </div>
                    <span className="text-xs text-slate-500 whitespace-nowrap">{formatearFecha(c.fechaCierre)}</span>
                  </div>
                </div>
                <div className="p-4 grid grid-cols-3 gap-2 text-sm">
                  {[['Ingresos',c.ingresoTotal,'text-emerald-700'],['Gastos',c.gastoTotal,c.gastoTotal>0?'text-red-600':'text-slate-400'],['Beneficio',c.beneficioNeto,c.beneficioNeto>=0?'text-blue-700':'text-red-600']].map(([l,v,col])=>(
                    <div key={l} className="text-center">
                      <p className="text-xs text-slate-400 mb-0.5">{l}</p>
                      <p className={`font-bold ${col}`}>{v.toFixed(2)} €</p>
                    </div>
                  ))}
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-100">
                  <button type="button" onClick={() => verDetalle(c)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-colors">
                    <Eye size={18} />Ver Detalle
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!cargando && cierresFiltrados.length > 0 && (
        <p className="mt-4 text-xs text-slate-400 text-center">
          El cuaderno trimestral incluye un bloque por expediente con cabecera, desglose por proveedor y resumen financiero.
          Categorías: Bus · Hotel · Restaurante · Guía · Otros · Imprevistos.
        </p>
      )}
    </div>
  )
}

export default HistorialCierres
