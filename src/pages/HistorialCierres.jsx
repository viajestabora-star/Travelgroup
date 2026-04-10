import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Eye, TrendingUp, FileSpreadsheet, Filter, Loader2, ChevronDown, X, ExternalLink, Package, Trash2, Upload, Building2, Plus } from 'lucide-react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { supabase } from '../supabase'
import { categorizarPago } from '../utils/finanzasHelpers'
import { parsearFechaADate } from '../utils/dateNormalizer'
import { esUsuarioGestoria, esUsuarioAdmin } from '../utils/userRoles'
import {
  resolverUrlPublicaFacturaProveedor,
  abrirFacturaProveedorPorUrlGuardada,
  eliminarObjetoStorageFacturaProveedor,
  descargarArrayBufferFacturaProveedor,
} from '../utils/facturaProveedorStorage'
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

/** Referencia verificación T1: deben listarse cuando el año del filtro coincide con su año contable/referencia. */
const NUMEROS_DIAGNOSTICO_HISTORIAL = ['2026-011', '2026-012', '2026-002', '2026-015']

const SELECT_EXPEDIENTES_HISTORIAL_MIN =
  'id, estado, numero_expediente, nombre_grupo, cliente_nombre, destino, fecha_inicio, total_ingresos, total_gastos_reales, beneficio_neto_real, liquidacion_final_beneficio, cierre_grupo, informe_gastos_hacienda'

const SELECT_EXPEDIENTES_HISTORIAL_EXT = `${SELECT_EXPEDIENTES_HISTORIAL_MIN}, created_at, fecha_creacion`

/**
 * Factura al cliente: URL absoluta o la misma convención de Storage que proveedores (fac-….pdf en facturas_proveedores).
 */
const resolverUrlFacturaCliente = (url) => {
  if (!url || typeof url !== 'string') return null
  const t = url.trim().replace(/^["']|["']$/g, '')
  if (/^https?:\/\//i.test(t)) return t
  return resolverUrlPublicaFacturaProveedor(t)
}

const nombreArchivoSeguro = (s, maxLen = 80) => {
  const base = String(s || 'doc')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, maxLen)
  return base || 'doc'
}

/**
 * Columnas esperadas en `gastos_fijos` para gastos mensuales (mes, anio contables).
 * Si Supabase devuelve error de columna, ejecuta en orden:
 * add-desglose-gastos-gastos-fijos.sql, add-gastos-fijos-estructura-mensual.sql,
 * add-gastos-fijos-fecha-factura.sql, add-gastos-fijos-importe-iva.sql
 */
const GASTOS_FIJOS_SELECT =
  'id, concepto, proveedor, importe, importe_iva, url_pdf, mes, anio, fecha_factura, created_at'

/** Si faltan columnas opcionales en Supabase, se reintenta con selects más pequeños (mes + anio siempre en filtros). */
const GASTOS_FIJOS_SELECT_SIN_CREATED =
  'id, concepto, proveedor, importe, importe_iva, url_pdf, mes, anio, fecha_factura'

const GASTOS_FIJOS_SELECT_MINIMAL = 'id, concepto, proveedor, importe, url_pdf, mes, anio'

const esErrorColumnaSql = (err) => /column|42703|does not exist|schema cache/i.test(String(err?.message || err || ''))

const GASTOS_FIJOS_QUERY_TIMEOUT_MS = 25000

/** PostgREST / Supabase: evita que una consulta colgada bloquee el estado de la página. */
const withTimeout = (thenable, ms, etiqueta) => {
  let id
  const to = new Promise((_, reject) => {
    id = window.setTimeout(
      () => reject(new Error(`[HistorialCierres] Timeout ${etiqueta} (${ms}ms)`)),
      ms
    )
  })
  return Promise.race([Promise.resolve(thenable), to]).finally(() => window.clearTimeout(id))
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

const PROVEEDORES_FIJOS_MENSUALES = [
  { id: 'arsys', label: 'Arsys' },
  { id: 'copimar', label: 'Copimar' },
  { id: 'arval', label: 'Arval' },
  { id: 'ayvens', label: 'Ayvens' },
  { id: 'intermundial', label: 'Intermundial' },
  { id: 'vodafone', label: 'Vodafone' },
  { id: 'gasolina', label: 'Gasolina' },
  { id: 'segurcaixa', label: 'Segurcaixa' },
  { id: 'otro', label: 'Otro' },
]

const formInicialGastoMensual = (añoStr, mesNum) => ({
  categoria: 'arsys',
  proveedorOtro: '',
  concepto: '',
  importeConIva: '',
  fecha: `${añoStr}-${String(mesNum).padStart(2, '0')}-01`,
})

/** Misma política que ExpedienteDetalle.subirPdfFacturaCot: bucket facturas_proveedores, nombre fac-{timestamp}.pdf */
const subirPdfFacturaProveedorComoExpediente = async (file) => {
  const nombreUnico = `fac-${Date.now()}.pdf`
  const { error } = await supabase.storage.from('facturas_proveedores').upload(nombreUnico, file)
  if (error) {
    const hint =
      /rls|row-level security|policy/i.test(String(error.message))
        ? '\n\nSi el error menciona RLS, ejecuta migrations/storage-rls-facturas-proveedores.sql en Supabase.'
        : ''
    throw new Error(String(error.message) + hint)
  }
  return nombreUnico
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

/** Pagos + facturas cliente para ZIP / modal (misma consulta que abrir auditoría). */
const cargarDatosAuditoriaExpediente = async (supabaseClient, expedienteId) => {
  const [pagosRes, emRes, glRes] = await Promise.all([
    supabaseClient
      .from('pagos_proveedores')
      .select('id, concepto, numero_factura, fecha_pago, importe_pagado, url_pdf, proveedor_nombre')
      .eq('expediente_id', expedienteId)
      .order('fecha_pago', { ascending: false }),
    supabaseClient
      .from('facturas_emitidas')
      .select('id, numero_factura, fecha_emision, url_pdf, cliente_nombre, importe_total')
      .eq('expediente_id', expedienteId),
    supabaseClient
      .from('facturas_emitidas_global')
      .select('id, numero_factura, fecha_emision, url_pdf, cliente_nombre, importe_total')
      .eq('expediente_id', expedienteId),
  ])
  const pagos = pagosRes.error ? [] : (pagosRes.data || [])
  const facturasCliente = fusionarFacturasClientePorExpediente(
    emRes.error ? [] : emRes.data,
    glRes.error ? [] : glRes.data
  )
  return { pagos, facturasCliente }
}

/** Partición para ZIP: proveedores vs clientes (mismas URLs que pestañas). Incluye sourceRaw para fallback Storage.download. */
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
    proveedores.push({
      url: u,
      filename: fn.toLowerCase().endsWith('.pdf') ? fn : `${fn}.pdf`,
      sourceRaw: p.url_pdf,
    })
  }
  let j = 0
  for (const f of datos.facturasCliente || []) {
    const u = resolverUrlFacturaCliente(f.url_pdf)
    if (!u) continue
    j += 1
    const base = `${j}_${f.numero_factura || 'factura'}`
    const fn = nombreArchivoSeguro(base)
    clientes.push({
      url: u,
      filename: fn.toLowerCase().endsWith('.pdf') ? fn : `${fn}.pdf`,
      sourceRaw: f.url_pdf,
    })
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

const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/** Meses 1–12 del trimestre T1–T4 */
const mesesDelTrimestre = (q) => {
  const qn = Number(q)
  if (qn < 1 || qn > 4) return []
  const base = (qn - 1) * 3
  return [base + 1, base + 2, base + 3]
}

const BUCKET_FACTURAS_PROVEEDORES = 'facturas_proveedores'

const sinDiacriticos = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')

/** Iniciales para “marca” junto al nombre (no hay logos en BD). */
const inicialesProveedorEstructura = (nombre) => {
  const t = String(nombre || '').trim()
  if (!t) return '??'
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return t.slice(0, 2).toUpperCase()
}

/**
 * Nombre de PDF dentro del ZIP: [MES]_[PROVEEDOR]_[IMPORTE]€.pdf
 * Colisiones (p. ej. varias Gasolina mismo importe) se resuelven al añadir al ZIP con sufijo _2, _3…
 */
const nombrePdfEnZipEstructura = (nombreMes, proveedor, importe) => {
  const mesTok = sinDiacriticos(nombreMes).toUpperCase().replace(/[^A-Z0-9]/g, '')
  const provTok = nombreArchivoSeguro(String(proveedor || 'proveedor').replace(/\s+/g, '_')).replace(/_+/g, '_')
  const impStr = n(importe).toFixed(2)
  return `${mesTok}_${provTok}_${impStr}€.pdf`
}

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
  const esAdmin = esUsuarioAdmin(user)
  const [cierres,    setCierres]    = useState([])
  /** Vista principal: expedientes + gastos_fijos en un solo ciclo; siempre se apaga en .finally del efecto. */
  const [isLoading, setIsLoading] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [año,           setAño]           = useState(String(añoActual))
  const [trimestreFiltro, setTrimestreFiltro] = useState('all')
  const [abiertoTrim,   setAbiertoTrim]   = useState(() => estadoInicialAcordeon(String(añoActual)))
  const [cuadernoIncluirPdfs, setCuadernoIncluirPdfs] = useState(false)

  const [modalAuditoria, setModalAuditoria] = useState(null)
  const [cargandoAuditoria, setCargandoAuditoria] = useState(false)
  const [datosAuditoria, setDatosAuditoria] = useState({ pagos: [], facturasCliente: [] })
  const [descargandoZip, setDescargandoZip] = useState(false)

  const [gastosEstructura, setGastosEstructura] = useState([])
  const [cargandoGastosEstructura, setCargandoGastosEstructura] = useState(false)
  const [errorGastosEstructura, setErrorGastosEstructura] = useState(null)
  const [subiendoGastoMensual, setSubiendoGastoMensual] = useState(false)
  const [descargandoPackMes, setDescargandoPackMes] = useState(null)
  const [modalGastoMensual, setModalGastoMensual] = useState(null)
  const [formGastoMensual, setFormGastoMensual] = useState(() => formInicialGastoMensual(String(añoActual), 1))
  const [archivoGastoMensual, setArchivoGastoMensual] = useState(null)

  /** Evita que una carga antigua pise estado tras remount / Strict Mode o re-ejecución. */
  const cierreLoadSeqRef = useRef(0)
  /** Coherencia con el efecto principal: solo el último ciclo puede hacer setIsLoading(false). */
  const historialCargaIdRef = useRef(0)
  /** Failsafe 2s (orden directa): isLoading se apaga sí o sí; un solo timeout por periodo en carga. */
  const isLoadingFailsafe2sRef = useRef(null)

  if (isLoading) {
    if (isLoadingFailsafe2sRef.current == null) {
      isLoadingFailsafe2sRef.current = window.setTimeout(() => {
        setIsLoading(false)
        isLoadingFailsafe2sRef.current = null
      }, 2000)
    }
  } else if (isLoadingFailsafe2sRef.current != null) {
    window.clearTimeout(isLoadingFailsafe2sRef.current)
    isLoadingFailsafe2sRef.current = null
  }

  const recargarGastosEstructura = useCallback(async () => {
    const y = parseInt(año, 10)
    if (!Number.isFinite(y)) {
      setGastosEstructura([])
      setErrorGastosEstructura(null)
      setCargandoGastosEstructura(false)
      return
    }
    setCargandoGastosEstructura(true)
    setErrorGastosEstructura(null)
    try {
      const mapRow = (r) => ({
        ...r,
        proveedor: r.proveedor ?? '',
        url_pdf: r.url_pdf ?? null,
        fecha_factura: r.fecha_factura ?? null,
        importe_iva: r.importe_iva != null ? n(r.importe_iva) : 0,
        mes: r.mes != null ? Number(r.mes) : null,
        anio: r.anio != null ? Number(r.anio) : null,
      })

      /**
       * `select('*')` evita 400 por columnas opcionales ausentes (PostgREST solo devuelve las que existen).
       * Fallback: intentos explícitos por si algún entorno restringe `*`.
       */
      const ejecutarSelect = (columnas) => {
        let q = supabase.from('gastos_fijos').select(columnas).eq('anio', y).not('mes', 'is', null)
        q = q.order('mes', { ascending: true })
        // No añadir order(created_at) con select('*'): si la columna no existe en BD, PostgREST responde 400.
        if (columnas !== '*' && /\bcreated_at\b/.test(String(columnas))) {
          q = q.order('created_at', { ascending: true })
        }
        return q
      }

      const intentos = ['*', GASTOS_FIJOS_SELECT, GASTOS_FIJOS_SELECT_SIN_CREATED, GASTOS_FIJOS_SELECT_MINIMAL]
      let ultimoError = null
      for (const columnas of intentos) {
        try {
          let data
          let error
          try {
            const res = await withTimeout(
              ejecutarSelect(columnas),
              GASTOS_FIJOS_QUERY_TIMEOUT_MS,
              `gastos_fijos select anio=${y}`
            )
            data = res.data
            error = res.error
          } catch (timeoutOrNet) {
            ultimoError = timeoutOrNet
            logErrorSupabase(
              `gastos_fijos — consulta abortada o timeout (columnas solicitadas: ${columnas})`,
              timeoutOrNet,
              { anio: y, columnas }
            )
            setGastosEstructura([])
            setErrorGastosEstructura(null)
            return
          }

          if (error) {
            ultimoError = error
            logErrorSupabase(`gastos_fijos — error Supabase (SELECT: ${columnas})`, error, { anio: y })
            if (esErrorColumnaSql(error)) continue
            setGastosEstructura([])
            setErrorGastosEstructura(null)
            return
          }

          const raw = Array.isArray(data) ? data : []
          const rows = []
          for (let i = 0; i < raw.length; i += 1) {
            try {
              rows.push(mapRow(raw[i]))
            } catch (rowErr) {
              console.error(
                '[HistorialCierres] gastos_fijos — fallo al mapear una fila (revisa tipos/columnas en esta fila)',
                {
                  indice: i,
                  filaCruda: raw[i],
                  columnasUsadas: columnas,
                  error: rowErr?.message || rowErr,
                  stack: rowErr?.stack,
                }
              )
            }
          }
          setGastosEstructura(rows)
          setErrorGastosEstructura(null)
          return
        } catch (e) {
          ultimoError = e
          logErrorSupabase(`gastos_fijos — excepción en intento de lectura (columnas: ${columnas})`, e, { anio: y })
          if (esErrorColumnaSql(e)) continue
          setErrorGastosEstructura(null)
          setGastosEstructura([])
          return
        }
      }
      logErrorSupabase('gastos_fijos — ningún SELECT compatible con el esquema (ignorado para no bloquear Historial)', ultimoError, {
        anio: y,
        intentos: intentos.join(' | '),
      })
      setGastosEstructura([])
      setErrorGastosEstructura(null)
    } catch (e) {
      logErrorSupabase('gastos_fijos — bloque try/catch externo (ignorado para no bloquear Historial)', e, { anio: parseInt(año, 10) })
      setErrorGastosEstructura(null)
      setGastosEstructura([])
    } finally {
      setCargandoGastosEstructura(false)
    }
  }, [año])

  /** Último recurso: nunca más de 15s en estado de carga de la vista principal. */
  useEffect(() => {
    const tid = window.setTimeout(() => {
      setIsLoading((prev) => {
        if (!prev) return prev
        console.error(
          '[HistorialCierres] FAILSAFE: isLoading superó 15s — se libera la UI. Revisa la consulta a expedientes o la red.'
        )
        return false
      })
    }, 15000)
    return () => window.clearTimeout(tid)
  }, [])

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

  const TIMEOUT_CARGA_CIERRES_MS = 50000

  const cargarCierres = useCallback(async () => {
    const seq = ++cierreLoadSeqRef.current
    let timeoutId = null
    try {
      timeoutId = window.setTimeout(() => {
        console.warn('[HistorialCierres] Tiempo de espera agotado cargando expedientes; se muestra la interfaz sin datos de cierre.')
        if (seq !== cierreLoadSeqRef.current) return
        setCierres([])
      }, TIMEOUT_CARGA_CIERRES_MS)

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

      if (seq !== cierreLoadSeqRef.current) return

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

      if (seq === cierreLoadSeqRef.current) setCierres(mapeados)
    } catch (err) {
      console.error('[HistorialCierres] cargarCierres:', err)
      if (seq === cierreLoadSeqRef.current) setCierres([])
    } finally {
      if (timeoutId != null) window.clearTimeout(timeoutId)
    }
  }, [])

  /**
   * Efecto principal: expedientes + gastos_fijos en paralelo.
   * Cada promesa lleva .finally → setIsLoading(false) vía contador (solo cuando ambas terminaron).
   */
  useEffect(() => {
    const cargaId = ++historialCargaIdRef.current
    setIsLoading(true)
    let pendientes = 2
    const alTerminarUnaPromesa = () => {
      pendientes -= 1
      if (pendientes <= 0 && historialCargaIdRef.current === cargaId) {
        setIsLoading(false)
      }
    }

    cargarCierres().finally(() => {
      alTerminarUnaPromesa()
    })

    Promise.resolve()
      .then(() => recargarGastosEstructura())
      .catch((fatal) => {
        console.error('[HistorialCierres] gastos_fijos — fallo total; estado [] (no bloquea expedientes)', {
          mensaje: fatal?.message || String(fatal),
          stack: fatal?.stack,
          objeto: fatal,
        })
        setGastosEstructura([])
        setErrorGastosEstructura(null)
        setCargandoGastosEstructura(false)
      })
      .finally(() => {
        alTerminarUnaPromesa()
      })
  }, [año, cargarCierres, recargarGastosEstructura])

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
    const conUrl = items.filter((it) => it?.url && /^https?:\/\//i.test(String(it.url)))
    conUrl.forEach((item, idx) => {
      setTimeout(() => window.open(item.url, '_blank', 'noopener,noreferrer'), idx * 400)
    })
    if (conUrl.length === 0) {
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
        for (const item of items) {
          const { url, filename, sourceRaw } = item
          const raw = sourceRaw ?? url
          try {
            let buffer = null
            const res = await fetch(url, { mode: 'cors' })
            if (res.ok) buffer = await res.arrayBuffer()
            if (!buffer && raw) buffer = await descargarArrayBufferFacturaProveedor(raw)
            if (buffer) {
              folder.file(filename, buffer)
              fetched += 1
            }
          } catch (err) {
            try {
              const buffer = raw ? await descargarArrayBufferFacturaProveedor(raw) : null
              if (buffer) {
                folder.file(filename, buffer)
                fetched += 1
              } else {
                console.warn('[ZIP] omitido', filename, err)
              }
            } catch (e2) {
              console.warn('[ZIP] omitido', filename, err || e2)
            }
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

  useEffect(() => {
    if (!modalGastoMensual) return
    const onKey = (e) => {
      if (e.key === 'Escape') cerrarModalGastoMensual()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalGastoMensual, cerrarModalGastoMensual])

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

  const cerrarModalGastoMensual = useCallback(() => {
    setModalGastoMensual(null)
    setArchivoGastoMensual(null)
  }, [])

  const abrirModalGastoMensual = useCallback(
    (mesNum) => {
      const y = parseInt(año, 10)
      if (!Number.isFinite(y)) return
      setFormGastoMensual(formInicialGastoMensual(String(y), mesNum))
      setArchivoGastoMensual(null)
      setModalGastoMensual({ mesNum })
    },
    [año]
  )

  const guardarGastoMensualDesdeModal = useCallback(async () => {
    if (!esAdmin || !modalGastoMensual) return
    const anioEjercicio = parseInt(año, 10)
    const cat = String(formGastoMensual.categoria || 'arsys')
    const proveedorOtro = String(formGastoMensual.proveedorOtro || '').trim()
    const proveedor =
      cat === 'otro'
        ? proveedorOtro
        : (PROVEEDORES_FIJOS_MENSUALES.find((c) => c.id === cat)?.label || '').trim()
    const mesNumModal = modalGastoMensual.mesNum
    const nombreMesModal = NOMBRES_MES[mesNumModal - 1] || ''
    let concepto = String(formGastoMensual.concepto || '').trim()
    const importeConIva = parseFloat(String(formGastoMensual.importeConIva || '').replace(',', '.'))
    const fechaStr = String(formGastoMensual.fecha || '').trim()
    const file = archivoGastoMensual

    if (!proveedor) {
      alert(cat === 'otro' ? 'Indica el nombre del proveedor (Otro).' : 'Selecciona un proveedor.')
      return
    }
    if (!concepto) {
      concepto = `${proveedor} — ${nombreMesModal} ${anioEjercicio}`.trim()
    }
    if (!Number.isFinite(importeConIva) || importeConIva < 0) {
      alert('Indica un importe válido (con IVA).')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
      alert('Indica la fecha de la factura.')
      return
    }
    const fd = new Date(`${fechaStr}T12:00:00`)
    if (isNaN(fd.getTime())) {
      alert('Fecha no válida.')
      return
    }
    const mesContable = fd.getMonth() + 1
    const anioContable = fd.getFullYear()
    if (anioContable !== anioEjercicio) {
      alert(`La fecha debe pertenecer al ejercicio ${anioEjercicio} (año del selector superior).`)
      return
    }
    if (!file || file.type !== 'application/pdf') {
      alert('Selecciona un archivo PDF.')
      return
    }

    setSubiendoGastoMensual(true)
    let pathStorage = null
    try {
      pathStorage = await subirPdfFacturaProveedorComoExpediente(file)
      const { error: insErr } = await supabase.from('gastos_fijos').insert({
        concepto,
        proveedor,
        importe: importeConIva,
        importe_iva: 0,
        url_pdf: pathStorage,
        mes: mesContable,
        anio: anioContable,
        fecha_factura: fechaStr,
        activo: true,
        periodicidad: 'mensual',
      })
      if (insErr) {
        if (pathStorage) await supabase.storage.from(BUCKET_FACTURAS_PROVEEDORES).remove([pathStorage])
        alert(
          `${insErr.message}\n\nEjecuta en Supabase: add-gastos-fijos-estructura-mensual.sql, add-gastos-fijos-fecha-factura.sql, add-gastos-fijos-importe-iva.sql`
        )
        return
      }
      cerrarModalGastoMensual()
      await recargarGastosEstructura()
    } catch (e) {
      console.error(e)
      if (pathStorage) {
        try {
          await supabase.storage.from(BUCKET_FACTURAS_PROVEEDORES).remove([pathStorage])
        } catch (_) {}
      }
      alert(e?.message || 'Error al guardar el gasto.')
    } finally {
      setSubiendoGastoMensual(false)
    }
  }, [esAdmin, modalGastoMensual, año, formGastoMensual, archivoGastoMensual, recargarGastosEstructura, cerrarModalGastoMensual])

  const borrarFacturaEstructura = useCallback(
    async (row) => {
      if (!esAdmin) return
      if (!window.confirm('¿Eliminar esta factura de estructura y su PDF?')) return
      try {
        if (row.url_pdf) await eliminarObjetoStorageFacturaProveedor(row.url_pdf)
        const { error } = await supabase.from('gastos_fijos').delete().eq('id', row.id)
        if (error) {
          alert(`No se pudo eliminar: ${error.message}`)
          return
        }
        await recargarGastosEstructura()
      } catch (e) {
        console.error(e)
        alert('Error al eliminar.')
      }
    },
    [esAdmin, recargarGastosEstructura]
  )

  const descargarPackEstructuraMes = useCallback(
    async (mesNum, nombreMes) => {
      const anioNum = parseInt(año, 10)
      if (!Number.isFinite(anioNum)) return

      const expedientesMes = cierres.filter((c) => {
        const d = c.fechaReferenciaTrimestre
        if (!d || isNaN(d.getTime())) return false
        return d.getFullYear() === anioNum && d.getMonth() + 1 === mesNum
      })

      const filasEstructura = gastosEstructura.filter(
        (g) => Number(g.mes) === mesNum && Number(g.anio) === anioNum && g.url_pdf
      )

      if (expedientesMes.length === 0 && filasEstructura.length === 0) {
        alert('No hay expedientes cerrados ni facturas de estructura para este mes.')
        return
      }

      const key = `${anioNum}-${mesNum}`
      setDescargandoPackMes(key)
      try {
        const zip = new JSZip()
        const prefExp = 'Expedientes_cerrados'
        const prefEst = 'Facturas_estructura'

        const nombreUnicoRuta = (rutaCompleta) => {
          if (!zip.files[rutaCompleta]) return rutaCompleta
          const base = rutaCompleta.replace(/\.pdf$/i, '')
          let n = 2
          while (zip.files[`${base}_${n}.pdf`]) n += 1
          return `${base}_${n}.pdf`
        }

        let entradasZip = 0

        for (const exp of expedientesMes) {
          const carpetaExp = `${prefExp}/${nombreArchivoSeguro(exp.numero_expediente || String(exp.id))}`
          try {
            const datos = await cargarDatosAuditoriaExpediente(supabase, exp.id)
            const expPdf = (await obtenerExpedienteParaPdfCierres(exp.id)) || exp
            const lineasInforme = await obtenerLineasInformeComoCierres(supabase, expPdf, {
              preferPagosPrimero: true,
            })
            const docPdf = crearJsPdfInformeCierre(expPdf, lineasInforme)
            const pdfBuf = docPdf.output('arraybuffer')
            const nomInf = nombreArchivoInformeCierrePdf(exp.numero_expediente || exp.id)
            zip.file(nombreUnicoRuta(`${carpetaExp}/${nomInf}`), pdfBuf)
            entradasZip += 1

            const { proveedores, clientes } = particionarArchivosAuditoriaZip(exp, datos)
            for (const item of proveedores) {
              const { url, filename, sourceRaw } = item
              const raw = sourceRaw ?? url
              try {
                let buffer = null
                const res = await fetch(url, { mode: 'cors' })
                if (res.ok) buffer = await res.arrayBuffer()
                if (!buffer && raw) buffer = await descargarArrayBufferFacturaProveedor(raw)
                if (buffer) {
                  const ruta = nombreUnicoRuta(`${carpetaExp}/Facturas_Proveedores/${filename}`)
                  zip.file(ruta, buffer)
                  entradasZip += 1
                }
              } catch (err) {
                try {
                  const buffer = raw ? await descargarArrayBufferFacturaProveedor(raw) : null
                  if (buffer) {
                    const ruta = nombreUnicoRuta(`${carpetaExp}/Facturas_Proveedores/${filename}`)
                    zip.file(ruta, buffer)
                    entradasZip += 1
                  } else {
                    console.warn('[ZIP pack mes] proveedor omitido', filename, err)
                  }
                } catch (e2) {
                  console.warn('[ZIP pack mes] proveedor omitido', filename, err || e2)
                }
              }
            }
            for (const item of clientes) {
              const { url, filename, sourceRaw } = item
              const raw = sourceRaw ?? url
              try {
                let buffer = null
                const res = await fetch(url, { mode: 'cors' })
                if (res.ok) buffer = await res.arrayBuffer()
                if (!buffer && raw) buffer = await descargarArrayBufferFacturaProveedor(raw)
                if (buffer) {
                  const ruta = nombreUnicoRuta(`${carpetaExp}/Facturas_Clientes/${filename}`)
                  zip.file(ruta, buffer)
                  entradasZip += 1
                }
              } catch (err) {
                try {
                  const buffer = raw ? await descargarArrayBufferFacturaProveedor(raw) : null
                  if (buffer) {
                    const ruta = nombreUnicoRuta(`${carpetaExp}/Facturas_Clientes/${filename}`)
                    zip.file(ruta, buffer)
                    entradasZip += 1
                  } else {
                    console.warn('[ZIP pack mes] cliente omitido', filename, err)
                  }
                } catch (e2) {
                  console.warn('[ZIP pack mes] cliente omitido', filename, err || e2)
                }
              }
            }
          } catch (err) {
            console.warn('[ZIP pack mes] expediente omitido', exp.id, err)
          }
        }

        for (let i = 0; i < filasEstructura.length; i += 1) {
          const f = filasEstructura[i]
          if (!f.url_pdf) continue
          const url = resolverUrlPublicaFacturaProveedor(f.url_pdf)
          try {
            let buf = null
            if (url) {
              try {
                const res = await fetch(url, { mode: 'cors' })
                if (res.ok) buf = await res.arrayBuffer()
              } catch (_) {}
            }
            if (!buf) buf = await descargarArrayBufferFacturaProveedor(f.url_pdf)
            if (buf) {
              const deseado = nombrePdfEnZipEstructura(nombreMes, f.proveedor, f.importe)
              const ruta = nombreUnicoRuta(`${prefEst}/${deseado}`)
              zip.file(ruta, buf)
              entradasZip += 1
            }
          } catch (err) {
            console.warn('[ZIP estructura] omitido', f.id, err)
          }
        }

        if (entradasZip === 0) {
          alert(
            'No se pudo incluir ningún archivo en el ZIP (sin informes ni PDFs descargables; revisa CORS o red).'
          )
          return
        }

        const blob = await zip.generateAsync({ type: 'blob' })
        saveAs(blob, `Pack_${nombreMes}_${anioNum}.zip`)
      } catch (e) {
        console.error(e)
        alert('Error al generar el ZIP del mes.')
      } finally {
        setDescargandoPackMes(null)
      }
    },
    [año, gastosEstructura, cierres]
  )

  const renderGastosEstructuraTrimestre = (qTrim) => {
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
        {errorGastosEstructura && (
          <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {errorGastosEstructura}
          </p>
        )}
        {esAdmin && meses.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-900/90 shrink-0">
              Añadir gasto de estructura
            </span>
            <span className="text-[11px] text-amber-800/80 hidden sm:inline">(visible aunque la tabla esté vacía)</span>
            <div className="flex flex-wrap gap-2">
              {meses.map((mesNum) => (
                <button
                  key={mesNum}
                  type="button"
                  onClick={() => abrirModalGastoMensual(mesNum)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold shadow-sm"
                >
                  <Plus size={12} />
                  {NOMBRES_MES[mesNum - 1]}
                </button>
              ))}
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
                          <span className="tabular-nums font-bold text-emerald-300 shrink-0">{n(r.importe).toFixed(2)} €</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {esAdmin && (
                      <button
                        type="button"
                        onClick={() => abrirModalGastoMensual(mesNum)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase tracking-[0.1em] shadow-md transition-colors"
                      >
                        <Plus size={16} />
                        Añadir Gasto de Estructura
                      </button>
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
                              <tr key={r.id}>
                                <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                                  {fmtFechaFact(r.fecha_factura)}
                                </td>
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
                                <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                                  <div className="font-semibold">{n(r.importe).toFixed(2)} €</div>
                                  {n(r.importe_iva) > 0 && (
                                    <div className="text-[11px] text-slate-500 font-normal">IVA {n(r.importe_iva).toFixed(2)} €</div>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {url ? (
                                    <button
                                      type="button"
                                      onClick={() => abrirFacturaProveedorPorUrlGuardada(r.url_pdf)}
                                      className="text-xs font-bold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                                    >
                                      <ExternalLink size={14} /> Abrir
                                    </button>
                                  ) : (
                                    <span className="text-xs text-slate-400">—</span>
                                  )}
                                </td>
                                {esAdmin && (
                                  <td className="px-3 py-2 text-right">
                                    <button
                                      type="button"
                                      onClick={() => borrarFacturaEstructura(r)}
                                      className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-800"
                                    >
                                      <Trash2 size={14} /> Eliminar
                                    </button>
                                  </td>
                                )}
                              </tr>
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
                        <div key={r.id} className="rounded-lg border border-slate-100 p-3 bg-slate-50/80">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-200 text-[10px] font-black text-slate-700">
                              {inicialesProveedorEstructura(r.proveedor)}
                            </span>
                            <p className="font-bold text-slate-900 text-sm flex-1">{r.proveedor ?? '—'}</p>
                          </div>
                          <p className="text-xs text-slate-600">{r.concepto ?? '—'}</p>
                          <p className="text-xs text-slate-500 mt-1">Fecha: {fmtFechaFact(r.fecha_factura)}</p>
                          <p className="text-sm font-bold text-slate-900 mt-1">
                            {n(r.importe).toFixed(2)} €
                            {n(r.importe_iva) > 0 && (
                              <span className="text-xs font-normal text-slate-500"> · IVA {n(r.importe_iva).toFixed(2)} €</span>
                            )}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {url && (
                              <button
                                type="button"
                                onClick={() => abrirFacturaProveedorPorUrlGuardada(r.url_pdf)}
                                className="text-xs font-bold text-blue-600"
                              >
                                Abrir PDF
                              </button>
                            )}
                            {esAdmin && (
                              <button type="button" onClick={() => borrarFacturaEstructura(r)} className="text-xs font-bold text-red-600">
                                Eliminar
                              </button>
                            )}
                          </div>
                        </div>
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
              <p className={`text-2xl font-extrabold ${card.color}`}>{card.value.toFixed(2)} €</p>
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
          <p className="font-semibold text-slate-700">Cargando expedientes cerrados…</p>
          <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto">
            Si la red tarda demasiado, la vista se liberará sola; los gastos de estructura se cargan aparte y no bloquean esta lista.
          </p>
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

      {!isLoading && expedientesDelAño.length > 0 && (
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
                    let fin
                    try {
                      fin = extraerFinanzas(modalAuditoria)
                    } catch {
                      fin = {
                        ingresoTotal: n(modalAuditoria.total_ingresos),
                        gastoTotal: n(modalAuditoria.total_gastos_reales),
                        beneficioNeto: n(modalAuditoria.beneficio_neto_real),
                      }
                    }
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
                          const pdfUrl = resolverUrlPublicaFacturaProveedor(p.url_pdf)
                          const tienePdf = !!pdfUrl
                          return (
                            <li key={p.id} className="px-3 py-2 flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-slate-800 truncate">{p.proveedor_nombre || 'Proveedor'}</p>
                                <p className="text-xs text-slate-500">{p.concepto || p.numero_factura || '—'} · {fmtEur(p.importe_pagado)} €</p>
                                {tienePdf && (
                                  <p className="mt-1 text-[10px] font-mono text-slate-500 break-all" title={pdfUrl}>
                                    {pdfUrl}
                                  </p>
                                )}
                              </div>
                              {tienePdf ? (
                                <a
                                  href={pdfUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 shrink-0"
                                >
                                  <ExternalLink size={14} /> Abrir PDF
                                </a>
                              ) : (
                                <span className="text-xs text-slate-400 shrink-0">Sin PDF</span>
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
                                <div className="flex flex-col items-end gap-1 max-w-[min(100%,280px)]">
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800"
                                  >
                                    <ExternalLink size={14} /> Abrir PDF
                                  </a>
                                  <span className="text-[10px] text-slate-500 break-all text-right">{url}</span>
                                </div>
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

      {modalGastoMensual && esAdmin && (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-gasto-mensual-titulo"
          onClick={(e) => e.target === e.currentTarget && !subiendoGastoMensual && cerrarModalGastoMensual()}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div>
                <h2 id="modal-gasto-mensual-titulo" className="text-lg font-black text-slate-900 tracking-tight">
                  Añadir Gasto de Estructura
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Bloque sugerido: {NOMBRES_MES[modalGastoMensual.mesNum - 1]} · Ejercicio {año}
                </p>
              </div>
              <button
                type="button"
                disabled={subiendoGastoMensual}
                onClick={cerrarModalGastoMensual}
                className="p-2 rounded-xl hover:bg-slate-200 text-slate-600 transition-colors shrink-0"
                aria-label="Cerrar"
              >
                <X size={22} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              <label className="block text-xs font-semibold text-slate-600">
                Proveedor
                <select
                  value={formGastoMensual.categoria || 'arsys'}
                  onChange={(e) => {
                    const v = e.target.value
                    setFormGastoMensual((prev) => ({
                      ...prev,
                      categoria: v,
                      proveedorOtro: v === 'otro' ? prev.proveedorOtro : '',
                    }))
                  }}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  {PROVEEDORES_FIJOS_MENSUALES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              {formGastoMensual.categoria === 'otro' && (
                <label className="block text-xs font-semibold text-slate-600">
                  Nombre del proveedor (manual)
                  <input
                    type="text"
                    value={formGastoMensual.proveedorOtro || ''}
                    onChange={(e) => setFormGastoMensual((p) => ({ ...p, proveedorOtro: e.target.value }))}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="Proveedor"
                  />
                </label>
              )}
              <label className="block text-xs font-semibold text-slate-600">
                Concepto <span className="font-normal text-slate-400">(opcional)</span>
                <input
                  type="text"
                  value={formGastoMensual.concepto || ''}
                  onChange={(e) => setFormGastoMensual((p) => ({ ...p, concepto: e.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="Si lo dejas vacío, se genera a partir del proveedor y el mes"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Importe (con IVA)
                <input
                  type="text"
                  inputMode="decimal"
                  value={formGastoMensual.importeConIva || ''}
                  onChange={(e) => setFormGastoMensual((p) => ({ ...p, importeConIva: e.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="0,00"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Fecha de la factura
                <input
                  type="date"
                  value={formGastoMensual.fecha || ''}
                  onChange={(e) => setFormGastoMensual((p) => ({ ...p, fecha: e.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                />
              </label>
              {(() => {
                const f = formGastoMensual.fecha
                if (!/^\d{4}-\d{2}-\d{2}$/.test(f || '')) return null
                const d = new Date(`${f}T12:00:00`)
                if (isNaN(d.getTime())) return null
                return (
                  <p className="text-xs font-medium text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                    Mes y año contables automáticos:{' '}
                    <strong>
                      {NOMBRES_MES[d.getMonth()]} {d.getFullYear()}
                    </strong>
                  </p>
                )
              })()}
              <label className="block text-xs font-semibold text-slate-600">
                Archivo PDF
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setArchivoGastoMensual(e.target.files?.[0] || null)}
                  className="mt-1 block w-full text-sm text-slate-600"
                />
              </label>
              <p className="text-[11px] text-slate-500">
                El PDF se sube al bucket <code className="bg-slate-100 px-1 rounded">facturas_proveedores</code> con el mismo
                criterio que en expedientes (<code className="bg-slate-100 px-1 rounded">fac-{'{timestamp}'}.pdf</code>).
              </p>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                disabled={subiendoGastoMensual}
                onClick={cerrarModalGastoMensual}
                className="px-4 py-2.5 rounded-xl border-2 border-slate-300 bg-white text-slate-800 text-sm font-bold hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={subiendoGastoMensual}
                onClick={() => guardarGastoMensualDesdeModal()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white text-sm font-black uppercase tracking-wide shadow-md"
              >
                {subiendoGastoMensual ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                Guardar gasto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HistorialCierres
