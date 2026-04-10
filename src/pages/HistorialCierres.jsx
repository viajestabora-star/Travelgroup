import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Eye, TrendingUp, FileSpreadsheet, Filter, Loader2, ChevronDown, X, ExternalLink, Package } from 'lucide-react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { supabase } from '../supabase'
import { categorizarPago } from '../utils/finanzasHelpers'
import { parsearFechaADate } from '../utils/dateNormalizer'
import { esUsuarioGestoria } from '../utils/userRoles'
import { resolverUrlPublicaFacturaProveedor, abrirFacturaProveedorPorUrlGuardada } from '../utils/facturaProveedorStorage'
import { crearJsPdfInformeCierre, nombreArchivoInformeCierrePdf } from '../utils/informeCierreHaciendaPdf'
import { obtenerLineasInformeComoCierres, obtenerExpedienteParaPdfCierres } from '../utils/lineasInformeCierres'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const n = (v) => { const num = Number(v ?? 0); return Number.isFinite(num) ? num : 0 }

const esc = (str) => String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

const fmtEur = (v) => n(v).toFixed(2)

/** Convierte fecha_inicio (texto/ISO) a Date; sin valor válido → null. */
const fechaInicioADate = (raw) => {
  if (!raw) return null
  const d = parsearFechaADate(raw)
  if (d && !isNaN(d.getTime())) return d
  const d2 = new Date(raw)
  return !isNaN(d2.getTime()) ? d2 : null
}

/**
 * Trimestre T1–T4 a partir del mes de fecha_inicio (1–12).
 * Meses 1–3 → T1, 4–6 → T2, 7–9 → T3, 10–12 → T4.
 */
const trimestreDesdeMes = (mes) => {
  if (mes == null || mes < 1 || mes > 12) return null
  return Math.floor((mes - 1) / 3) + 1
}

/**
 * Fecha para trimestre/año: fecha_inicio → created_at → hoy (misma idea que Planning sin fecha).
 */
const fechaReferenciaTrimestreDesdeExp = (exp) => {
  const dIni = exp?.fechaInicioDate ?? fechaInicioADate(exp?.fecha_inicio)
  if (dIni && !isNaN(dIni.getTime())) return dIni
  const dCre = fechaInicioADate(exp?.created_at)
  if (dCre && !isNaN(dCre.getTime())) return dCre
  const dFc = fechaInicioADate(exp?.fecha_creacion)
  if (dFc && !isNaN(dFc.getTime())) return dFc
  return new Date()
}

/**
 * Clasifica por mes de fecha de referencia (nunca null: al menos trimestre actual).
 */
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

const CATEGORIAS = ['Bus', 'Hotel', 'Restaurante', 'Guía', 'Otros']

const TRIMESTRES = [
  { value: 'all', label: 'Todos (T1–T4)' },
  { value: '1',   label: 'T1 · Ene–Mar' },
  { value: '2',   label: 'T2 · Abr–Jun' },
  { value: '3',   label: 'T3 · Jul–Sep' },
  { value: '4',   label: 'T4 · Oct–Dic' },
]

/** Solo listamos estado Cerrado; badge coherente con la query. */
const estadoNormalizado = (exp) => String(exp?.estado ?? '').trim().toLowerCase()

const badgeEstadoProps = (exp) => {
  const s = estadoNormalizado(exp)
  if (s === 'cerrado') return { className: 'bg-emerald-500', label: 'Cerrado' }
  return { className: 'bg-slate-300', label: s || '—' }
}

const NUMEROS_DIAGNOSTICO_HISTORIAL = ['2026-011', '2026-012', '2026-002', '2026-015']

const SELECT_EXPEDIENTES_HISTORIAL_MIN =
  'id, estado, numero_expediente, nombre_grupo, cliente_nombre, destino, fecha_inicio, total_ingresos, total_gastos_reales, beneficio_neto_real, liquidacion_final_beneficio, cierre_grupo, informe_gastos_hacienda'

const SELECT_EXPEDIENTES_HISTORIAL_EXT = `${SELECT_EXPEDIENTES_HISTORIAL_MIN}, created_at, fecha_creacion`

/** Factura al cliente: en BD suele guardarse URL absoluta; si no, no forzamos bucket. */
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

/** Partición para ZIP: proveedores vs clientes (mismas URLs que pestañas). */
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

/** Lista plana para «Abrir todos en pestañas». */
const construirListaArchivosAuditoria = (exp, datos) => {
  const { proveedores, clientes } = particionarArchivosAuditoriaZip(exp, datos)
  return [...proveedores, ...clientes]
}
const añoActual = new Date().getFullYear()
const AÑOS = Array.from({ length: 6 }, (_, i) => añoActual - i)

// ─── Generador del Cuaderno HTML-Excel ────────────────────────────────────────

/**
 * Construye el contenido HTML del Cuaderno de Cierres.
 * Excel y Numbers abren este formato respetando estilos inline.
 */
const construirHTMLCuaderno = (cierresEnriquecidos, etiquetaPeriodo, pdfLinksByExpedienteId = null) => {
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

  if (pdfLinksByExpedienteId && typeof pdfLinksByExpedienteId === 'object') {
    const conAnexo = cierresEnriquecidos.filter((c) => (pdfLinksByExpedienteId[c.id] || []).length > 0)
    if (conAnexo.length > 0) {
      html += `
<table class="separador"><tr><td colspan="2"></td></tr></table>
<table>
  <tr><td colspan="2" class="periodo-title">Anexo — Enlaces a PDFs de proveedores</td></tr>
  <tr><td colspan="2" class="periodo-meta">Documentación adjunta en pagos a proveedores (abrir en el navegador). No se incrustan binarios en el Excel.</td></tr>
</table>`
      for (const c of conAnexo) {
        const grupo = esc(c.nombre_grupo || c.cliente_nombre || 'Sin grupo')
        const links = pdfLinksByExpedienteId[c.id] || []
        html += `
<table>
  <tr><td colspan="2" class="exp-title">📎 ${grupo} — Nº ${esc(c.numero_expediente || '—')}</td></tr>`
        for (const link of links) {
          html += `
  <tr>
    <td class="cat-label" style="width:42%">${esc(link.label)}</td>
    <td><a href="${esc(link.url)}">Abrir PDF</a></td>
  </tr>`
        }
        html += `
</table>`
      }
    }
  }

  html += `</body></html>`
  return html
}

// ─── Componente ───────────────────────────────────────────────────────────────

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
  const [cierres,    setCierres]    = useState([])
  const [cargando,   setCargando]   = useState(true)
  const [exportando, setExportando] = useState(false)
  const [año,           setAño]           = useState(String(añoActual))
  const [trimestreFiltro, setTrimestreFiltro] = useState('all')
  const [abiertoTrim,   setAbiertoTrim]   = useState(() => estadoInicialAcordeon(String(añoActual)))
  const [cuadernoIncluirPdfs, setCuadernoIncluirPdfs] = useState(false)

  const [modalAuditoria, setModalAuditoria] = useState(null)
  const [cargandoAuditoria, setCargandoAuditoria] = useState(false)
  const [datosAuditoria, setDatosAuditoria] = useState({ pagos: [], facturasCliente: [] })
  const [descargandoZip, setDescargandoZip] = useState(false)

  useEffect(() => { cargarCierres() }, [])

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
  useEffect(() => {
    if (trimestreFiltro === 'all') {
      setAbiertoTrim(estadoInicialAcordeon(año))
    } else {
      const q = parseInt(trimestreFiltro, 10)
      setAbiertoTrim({ 1: q === 1, 2: q === 2, 3: q === 3, 4: q === 4, 0: false })
    }
  }, [año, trimestreFiltro])

  const cargarCierres = async () => {
    setCargando(true)
    try {
      const fetchCerrados = async (cols) =>
        supabase
          .from('expedientes')
          .select(cols)
          .ilike('estado', 'cerrado')
          .order('fecha_inicio', { ascending: false, nullsFirst: true })

      const esErrorColumna = (err) => /column|schema|does not exist|42703/i.test(String(err?.message || ''))

      let { data, error } = await fetchCerrados(SELECT_EXPEDIENTES_HISTORIAL_EXT)

      if (error && esErrorColumna(error)) {
        const msg = String(error.message || '')
        if (/fecha_creacion/i.test(msg)) {
          console.warn('[HistorialCierres] fecha_creacion ausente en esquema, reintento con created_at:', msg)
          const rMid = await fetchCerrados(`${SELECT_EXPEDIENTES_HISTORIAL_MIN}, created_at`)
          data = rMid.data
          error = rMid.error
        } else {
          console.warn('[HistorialCierres] Select extendido rechazado, reintento columnas mínimas:', msg)
          const r2 = await fetchCerrados(SELECT_EXPEDIENTES_HISTORIAL_MIN)
          data = r2.data
          error = r2.error
        }
      }

      if (error && esErrorColumna(error)) {
        console.warn('[HistorialCierres] Último reintento solo columnas mínimas:', error.message)
        const r3 = await fetchCerrados(SELECT_EXPEDIENTES_HISTORIAL_MIN)
        data = r3.data
        error = r3.error
      }

      if (error) {
        console.error('[HistorialCierres] Error Supabase expedientes:', error.message, error)
        setCierres([])
        return
      }

      const crudos = Array.isArray(data) ? data : []
      const soloCerrado = crudos.filter((e) => String(e.estado ?? '').trim().toLowerCase() === 'cerrado')
      if (soloCerrado.length !== crudos.length) {
        const rechazados = crudos.filter((e) => String(e.estado ?? '').trim().toLowerCase() !== 'cerrado')
        console.warn(
          '[HistorialCierres] Filas excluidas: estado no es exactamente «cerrado» tras ilike:',
          rechazados.map((e) => ({ numero_expediente: e.numero_expediente, estado: e.estado }))
        )
      }

      const numsApi = new Set(soloCerrado.map((e) => String(e.numero_expediente ?? '').trim()))
      NUMEROS_DIAGNOSTICO_HISTORIAL.forEach((num) => {
        if (!numsApi.has(num)) {
          console.warn('[HistorialCierres] No devuelto por API (filtro Cerrado / query):', num)
        }
      })
      console.info(
        '[HistorialCierres] Expedientes cerrados cargados:',
        soloCerrado.length,
        soloCerrado.map((e) => e.numero_expediente)
      )

      const mapeados = soloCerrado.map((exp) => {
        const fin = extraerFinanzas(exp)
        const fechaInicioDate = fechaInicioADate(exp.fecha_inicio)
        const fechaReferenciaTrimestre = fechaReferenciaTrimestreDesdeExp({
          ...exp,
          fechaInicioDate,
        })
        return { ...exp, ...fin, fechaInicioDate, fechaReferenciaTrimestre }
      })
      mapeados.sort((a, b) => {
        const ta = a.fechaReferenciaTrimestre?.getTime() ?? 0
        const tb = b.fechaReferenciaTrimestre?.getTime() ?? 0
        if (tb !== ta) return tb - ta
        return String(a.numero_expediente || '').localeCompare(String(b.numero_expediente || ''), 'es', { numeric: true })
      })

      NUMEROS_DIAGNOSTICO_HISTORIAL.forEach((num) => {
        const row = mapeados.find((e) => String(e.numero_expediente ?? '').trim() === num)
        if (row) {
          const { trimestre } = clasificarPorFechaInicio(row)
          const y = row.fechaReferenciaTrimestre?.getFullYear?.()
          console.info('[HistorialCierres] Diagnóstico referencia trimestre/año:', num, {
            añoReferencia: y,
            trimestre: trimestre != null ? `T${trimestre}` : null,
          })
        }
      })

      setCierres(mapeados)
    } catch (err) {
      console.error('[HistorialCierres] cargarCierres:', err)
      setCierres([])
    } finally {
      setCargando(false)
    }
  }

  /** Año según fecha de referencia (inicio, creación o hoy), alineado con Planning. */
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

  /** Bloques visibles según desplegable T1–T4 / Todos (todos los cerrados van a un T1–T4 vía fecha de referencia). */
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

  /** Totales dinámicos: solo filas visibles (mismo criterio que columnas de la tabla + gastos del modelo de finanzas). */
  const totales = useMemo(() => ({
    ingresos:  cierresFiltrados.reduce((s, c) => s + n(c.total_ingresos), 0),
    gastos:    cierresFiltrados.reduce((s, c) => s + n(c.gastoTotal), 0),
    beneficio: cierresFiltrados.reduce((s, c) => s + n(c.beneficio_neto_real), 0),
  }), [cierresFiltrados])

  const cerrarModalAuditoria = useCallback(() => {
    setModalAuditoria(null)
    setDatosAuditoria({ pagos: [], facturasCliente: [] })
  }, [])

  const abrirModalAuditoria = useCallback(async (exp) => {
    setModalAuditoria(exp)
    setCargandoAuditoria(true)
    setDatosAuditoria({ pagos: [], facturasCliente: [] })
    const expedienteId = exp.id
    try {
      const [pagosRes, emRes, glRes] = await Promise.all([
        supabase
          .from('pagos_proveedores')
          .select('id, concepto, numero_factura, fecha_pago, importe_pagado, url_pdf, proveedor_nombre')
          .eq('expediente_id', expedienteId)
          .order('fecha_pago', { ascending: false }),
        supabase
          .from('facturas_emitidas')
          .select('id, numero_factura, fecha_emision, url_pdf, cliente_nombre, importe_total')
          .eq('expediente_id', expedienteId),
        supabase
          .from('facturas_emitidas_global')
          .select('id, numero_factura, fecha_emision, url_pdf, cliente_nombre, importe_total')
          .eq('expediente_id', expedienteId),
      ])
      const pagos = pagosRes.error ? [] : (pagosRes.data || [])
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

  const descargarExpedienteZip = useCallback(async () => {
    const exp = modalAuditoria
    if (!exp) return
    setDescargandoZip(true)
    try {
      const zip = new JSZip()
      const zipNombreBase = nombreArchivoSeguro(`Expediente_${exp.numero_expediente || exp.id}`)

      const expPdf = (await obtenerExpedienteParaPdfCierres(exp.id)) || exp
      const lineasInforme = await obtenerLineasInformeComoCierres(supabase, expPdf, {
        preferPagosPrimero: true,
      })
      const docPdf = crearJsPdfInformeCierre(expPdf, lineasInforme)
      const pdfBuf = docPdf.output('arraybuffer')
      zip.file(nombreArchivoInformeCierrePdf(exp.numero_expediente || exp.id), pdfBuf)

      const { proveedores, clientes } = particionarArchivosAuditoriaZip(exp, datosAuditoria)

      let fetched = 0
      const pullInto = async (folder, items) => {
        for (const { url, filename } of items) {
          try {
            const res = await fetch(url, { mode: 'cors' })
            if (!res.ok) continue
            folder.file(filename, await res.arrayBuffer())
            fetched += 1
          } catch (err) {
            console.warn('[ZIP] omitido', filename, err)
          }
        }
      }

      if (proveedores.length > 0) {
        await pullInto(zip.folder('Facturas_Proveedores'), proveedores)
      }
      if (clientes.length > 0) {
        await pullInto(zip.folder('Facturas_Clientes'), clientes)
      }

      if (fetched === 0 && proveedores.length + clientes.length > 0) {
        alert(
          'El informe de cierre se ha incluido en el ZIP, pero no se pudieron descargar los PDFs adjuntos (CORS o red). Usa «Abrir todos en pestañas» para los documentos.'
        )
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      saveAs(blob, `${zipNombreBase}.zip`)
    } catch (e) {
      console.error(e)
      alert('Error al generar el ZIP. Prueba «Abrir todos en pestañas».')
    } finally {
      setDescargandoZip(false)
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
          ? `${año} · Todos los trimestres (estado Cerrado)`
          : `${año} · ${TRIMESTRES.find((t) => t.value === trimestreFiltro)?.label ?? `T${trimestreFiltro}`} (estado Cerrado)`

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

  const formatearFecha = (f) => f
    ? f.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—'

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
      <td className="px-4 py-3 text-right font-medium text-emerald-800 whitespace-nowrap">{n(c.total_ingresos).toFixed(2)} €</td>
      <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
        <span className={n(c.beneficio_neto_real) >= 0 ? 'text-blue-700' : 'text-red-600'}>{n(c.beneficio_neto_real).toFixed(2)} €</span>
      </td>
      <td className="px-4 py-3 text-center">
        <button type="button" onClick={() => abrirModalAuditoria(c)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors">
          <Eye size={14} />Ver
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
                {bucket.sumIngresos.toFixed(2)} € · <span className={bucket.sumBenefReal >= 0 ? 'text-blue-700' : 'text-red-600'}>{bucket.sumBenefReal.toFixed(2)} €</span>
              </p>
            </div>
            <ChevronDown size={22} className={`text-slate-400 transition-transform shrink-0 ${abierto ? 'rotate-180' : ''}`} />
          </div>
        </button>
        {abierto && (
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
                        <td className="px-4 py-3 text-right font-black text-emerald-800 tabular-nums">{bucket.sumIngresos.toFixed(2)} €</td>
                        <td className="px-4 py-3 text-right font-black tabular-nums">
                          <span className={bucket.sumBenefReal >= 0 ? 'text-blue-700' : 'text-red-600'}>{bucket.sumBenefReal.toFixed(2)} €</span>
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
                          <p className="font-bold text-emerald-800">{n(c.total_ingresos).toFixed(2)} €</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-slate-400">Benef. neto real</p>
                          <p className={`font-bold ${n(c.beneficio_neto_real) >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{n(c.beneficio_neto_real).toFixed(2)} €</p>
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
                    <p className="flex justify-between"><span>Σ Total ingresos</span><span className="font-bold text-emerald-800">{bucket.sumIngresos.toFixed(2)} €</span></p>
                    <p className="flex justify-between mt-1"><span>Σ Beneficio neto real</span><span className={`font-bold ${bucket.sumBenefReal >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{bucket.sumBenefReal.toFixed(2)} €</span></p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

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
            Solo estado <strong>Cerrado</strong> · T1–T4 por <strong>mes de fecha de referencia</strong> (inicio; si falta, creación; si falta, hoy) · {etiquetaPeriodo}
            {esGestoria && (
              <span className="block mt-1 text-amber-700 font-semibold">
                Perfil gestoría/auditoría: solo lectura en este historial (sin edición del cierre desde aquí).
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

      {/* Totales dinámicos (solo filas visibles; pueden ser 0 € si el trimestre filtrado está vacío) */}
      {!cargando && expedientesDelAño.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total ingresos', value: totales.ingresos, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
            { label: 'Gastos', value: totales.gastos, color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
            { label: 'Beneficio neto real', value: totales.beneficio, color: totales.beneficio >= 0 ? 'text-blue-700' : 'text-red-700', bg: totales.beneficio >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200' },
          ].map((card) => (
            <div key={card.label} className={`rounded-xl border p-4 ${card.bg}`}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{card.label}</p>
              <p className={`text-2xl font-extrabold ${card.color}`}>{card.value.toFixed(2)} €</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {cierresFiltrados.length} expediente{cierresFiltrados.length !== 1 ? 's' : ''} en vista · {TRIMESTRES.find((t) => t.value === trimestreFiltro)?.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Acordeones T1–T4 */}
      {cargando ? (
        <div className="py-16 text-center text-slate-500">
          <TrendingUp className="mx-auto text-slate-300 mb-4 animate-pulse" size={48} />
          <p>Cargando cierres...</p>
        </div>
      ) : cierres.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-12 text-center">
          <FileText className="mx-auto text-slate-300 mb-4" size={56} />
          <h3 className="text-xl font-bold text-slate-800 mb-2">No hay expedientes cerrados</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            Esta vista lista solo registros con estado <code className="text-xs bg-slate-100 px-1 rounded">Cerrado</code> (sin distinguir mayúsculas en base de datos).
          </p>
        </div>
      ) : expedientesDelAño.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-12 text-center">
          <FileText className="mx-auto text-slate-300 mb-4" size={56} />
          <h3 className="text-xl font-bold text-slate-800 mb-2">Sin expedientes en {año}</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            No hay cerrados cuyo año de referencia (inicio, creación o fecha actual como último recurso) coincida con {año}.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 mb-2">
            El trimestre filtra qué bloque T1–T4 se muestra. La columna «Fecha inicio» sigue mostrando solo la fecha de viaje si existe; el reparto por trimestre usa la fecha de referencia descrita arriba. El punto verde indica estado Cerrado.
          </p>
          {bucketsVisibles.map(renderBloqueTrimestre)}
          {bucketSinFechaVisible && renderBloqueTrimestre(bucketSinFechaVisible)}
        </div>
      )}

      {!cargando && expedientesDelAño.length > 0 && (
        <p className="mt-4 text-xs text-slate-400 text-center">
          Cuaderno trimestral exporta solo los expedientes del filtro activo (vacío si no hay filas). Desglose: Bus, Hotel, Restaurante, Guía, Otros, Imprevistos.
          {' '}Con «Incl. enlaces PDF proveedores» se añade un anexo con hipervínculos a la documentación en <code className="text-[10px] bg-slate-100 px-1 rounded">pagos_proveedores</code>.
        </p>
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
                            { label: 'Beneficio neto', value: fin.beneficioNeto, color: fin.beneficioNeto >= 0 ? 'text-blue-800' : 'text-red-800', bg: fin.beneficioNeto >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100' },
                          ].map((card) => (
                            <div key={card.label} className={`rounded-xl border p-4 ${card.bg}`}>
                              <p className="text-[10px] font-bold uppercase text-slate-500">{card.label}</p>
                              <p className={`text-xl font-black tabular-nums ${card.color}`}>{fmtEur(card.value)} €</p>
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
                                <p className="text-xs text-slate-500">{p.concepto || p.numero_factura || '—'} · {fmtEur(p.importe_pagado)} €</p>
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
                                <p className="text-xs text-slate-600">{f.cliente_nombre || 'Cliente'} · {fmtEur(f.importe_total)} €</p>
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
                                <span className="text-xs text-slate-400">PDF no enlazado (regenerar desde expediente si aplica)</span>
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
                onClick={descargarExpedienteZip}
                disabled={descargandoZip || cargandoAuditoria}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white text-xs sm:text-sm font-black uppercase tracking-[0.12em] shadow-md transition-colors"
              >
                {descargandoZip ? <Loader2 size={18} className="animate-spin" /> : <Package size={18} />}
                Descargar expediente completo
              </button>
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
