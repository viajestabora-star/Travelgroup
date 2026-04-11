/**
 * Lógica compartida del historial de cierres (consultas, dominio, ZIP helpers, cuaderno HTML).
 * Los helpers de formato viven en historialCierresFormat.js (hoisting / TDZ).
 */
import { categorizarPago } from './finanzasHelpers'
import { parsearFechaADate } from './dateNormalizer'
import { supabase } from '../supabase'
import {
  resolverUrlPublicaFacturaProveedor,
  descargarArrayBufferFacturaProveedor,
} from './facturaProveedorStorage'
import { n, esc, fmtEur, mesNumeroDesdeEstructura, normalizarProveedorEstructura } from './historialCierresFormat'

// ─── Helpers dominio (tras números / moneda / fechas de fila) ─────────────────

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

/** Estados incluidos en historial de cierre (misma lógica que la query Supabase). */
const ESTADOS_CIERRE_HISTORIAL = new Set(['cerrado', 'liquidado'])

const esEstadoHistorialCierre = (estadoRaw) =>
  ESTADOS_CIERRE_HISTORIAL.has(String(estadoRaw ?? '').trim().toLowerCase())

const estadoNormalizado = (exp) => String(exp?.estado ?? '').trim().toLowerCase()

const badgeEstadoProps = (exp) => {
  const s = estadoNormalizado(exp)
  if (s === 'cerrado') return { className: 'bg-emerald-500', label: 'Cerrado' }
  if (s === 'liquidado') return { className: 'bg-teal-600', label: 'Liquidado' }
  return { className: 'bg-slate-300', label: s || '—' }
}

/** Valores de fila alineados con `extraerFinanzas` (cierre_grupo) para que sumas coincidan con la vista. */
const ingresoMostradoHistorial = (c) => n(c.ingresoTotal ?? c.total_ingresos)
const beneficioMostradoHistorial = (c) => n(c.beneficioNeto ?? c.beneficio_neto_real)

/** Referencia verificación T1: deben listarse cuando el año del filtro coincide con su año contable/referencia. */
const NUMEROS_DIAGNOSTICO_HISTORIAL = ['2026-011', '2026-012', '2026-002', '2026-015']

const SELECT_EXPEDIENTES_HISTORIAL_MIN =
  'id, estado, numero_expediente, nombre_grupo, cliente_nombre, destino, fecha_inicio, total_ingresos, total_gastos_reales, beneficio_neto_real, liquidacion_final_beneficio, cierre_grupo, informe_gastos_hacienda'

const SELECT_EXPEDIENTES_HISTORIAL_EXT = `${SELECT_EXPEDIENTES_HISTORIAL_MIN}, created_at, fecha_creacion`

/** Orden: primero la tabla que pidas en Supabase; si no existe la relación, se usa `expedientes`. Sin `.limit()` ni `.range()`. */
const TABLAS_EXPEDIENTES_HISTORIAL = ['expedientes_nuevos', 'expedientes']

/** Solo fallback a `expedientes` si falla la relación `expedientes_nuevos`, no por columnas erróneas. */
const esErrorTablaInexistenteHistorial = (err) => {
  const c = String(err?.code ?? '')
  if (c === '42P01') return true
  const m = String(err?.message ?? err ?? '')
  return /relation\s+["']?[\w.]+\s+does not exist/i.test(m)
}

/**
 * Rango [inicio, fin] inclusive en fechas YYYY-MM-DD para filtrar en BD (sin `.limit()` en expedientes).
 * `trimestreVal` === 'all' → año completo del selector.
 */
const rangoFechasConsultaExpedientes = (anioStr, trimestreVal) => {
  const year = parseInt(anioStr, 10)
  if (!Number.isFinite(year)) return null
  if (trimestreVal === 'all') {
    return { inicio: `${year}-01-01`, fin: `${year}-12-31` }
  }
  const q = parseInt(trimestreVal, 10)
  if (!Number.isFinite(q) || q < 1 || q > 4) return { inicio: `${year}-01-01`, fin: `${year}-12-31` }
  const mesIni = (q - 1) * 3 + 1
  const mesFin = mesIni + 2
  const pad = (m) => String(m).padStart(2, '0')
  const ultimoDia = (y, mes) => String(new Date(y, mes, 0).getDate()).padStart(2, '0')
  return {
    inicio: `${year}-${pad(mesIni)}-01`,
    fin: `${year}-${pad(mesFin)}-${ultimoDia(year, mesFin)}`,
  }
}

const mergeExpedientesPorId = (listaA, listaB) => {
  const mapa = new Map()
  for (const fila of [...(listaA || []), ...(listaB || [])]) {
    if (fila && fila.id != null) mapa.set(fila.id, fila)
  }
  return [...mapa.values()]
}

/**
 * Carga universal: todos los expedientes Cerrado/Liquidado cuya fecha_inicio cae en el rango
 * O (fecha_inicio nula y created_at en el rango). Sin tope de filas. Reintenta tablas en orden.
 */
const fetchExpedientesCierrePorRango = async (supabaseClient, columnasSelect, anioStr, trimestreVal) => {
  const rango = rangoFechasConsultaExpedientes(anioStr, trimestreVal)
  if (!rango) return { data: [], error: null }
  const inicioIso = `${rango.inicio}T00:00:00.000Z`
  const finIso = `${rango.fin}T23:59:59.999Z`

  for (const nombreTabla of TABLAS_EXPEDIENTES_HISTORIAL) {
    const base = () =>
      supabaseClient
        .from(nombreTabla)
        .select(columnasSelect)
        .or('estado.ilike.cerrado,estado.ilike.liquidado')

    const resConFecha = await base().gte('fecha_inicio', rango.inicio).lte('fecha_inicio', rango.fin)
    if (resConFecha.error) {
      if (nombreTabla === 'expedientes_nuevos' && esErrorTablaInexistenteHistorial(resConFecha.error)) continue
      return { data: [], error: resConFecha.error }
    }

    const resSinFecha = await base()
      .is('fecha_inicio', null)
      .gte('created_at', inicioIso)
      .lte('created_at', finIso)

    let crudos = resConFecha.data || []
    if (!resSinFecha.error && Array.isArray(resSinFecha.data)) {
      crudos = mergeExpedientesPorId(crudos, resSinFecha.data)
    } else if (resSinFecha.error && !/fecha_inicio|created_at|42703|column/i.test(String(resSinFecha.error.message || ''))) {
      console.warn('[HistorialCierres] fetchExpedientes: rama fecha_inicio null omitida:', resSinFecha.error.message)
    }

    // Año completo: incorporar filas con created_at en el ejercicio aunque fecha_inicio caiga fuera (sin duplicar id).
    if (trimestreVal === 'all') {
      const resPorCreacion = await base().gte('created_at', inicioIso).lte('created_at', finIso)
      if (!resPorCreacion.error && Array.isArray(resPorCreacion.data)) {
        crudos = mergeExpedientesPorId(crudos, resPorCreacion.data)
      }
    }

    return { data: crudos, error: null }
  }
  return { data: [], error: new Error('No hay tabla de expedientes disponible') }
}

const cederAlNavegadorParaZip = () =>
  new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 40 })
    } else {
      window.setTimeout(resolve, 0)
    }
  })

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

/** Columnas de `gastos_estructura` (mes TEXT, anio INTEGER, importe monetario en `importe_iva`). */
const GASTOS_ESTRUCTURA_SELECT =
  'id, proveedor, importe_iva, url_pdf, mes, anio, created_at, es_extra, plantilla_id'

const GASTOS_ESTRUCTURA_SELECT_SIN_CREATED =
  'id, proveedor, importe_iva, url_pdf, mes, anio, es_extra, plantilla_id'

const GASTOS_ESTRUCTURA_SELECT_MINIMAL = 'id, proveedor, importe_iva, url_pdf, mes, anio'

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

/**
 * Nombre de objeto en `facturas_proveedores` para gastos de estructura:
 * `fac-{proveedor}-{MM}-{YYYY}-{id8}.pdf` (id8 = fragmento UUID, garantiza unicidad por fila).
 */
export function nombreStoragePdfGastoEstructura(proveedor, mesRaw, anioNum, rowId) {
  const prov = normalizarProveedorEstructura(String(proveedor || ''))
  const rawSlug = nombreArchivoSeguro(prov.replace(/\s+/g, '-'))
  const slug = String(rawSlug || 'proveedor')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/_+/g, '-')
    .slice(0, 40)
  const mn = mesNumeroDesdeEstructura(mesRaw)
  const mesFile = String(mn >= 1 && mn <= 12 ? mn : 1).padStart(2, '0')
  const anio = Number(anioNum)
  const anioS = Number.isFinite(anio) ? String(anio) : '0'
  const idPart = rowId
    ? String(rowId).replace(/-/g, '').slice(0, 8)
    : `n${Date.now()}`
  return `fac-${slug}-${mesFile}-${anioS}-${idPart}.pdf`
}

/** Sube PDF de gasto de estructura al bucket estándar con nombre convencionado. */
export async function subirPdfGastoEstructuraFacturaProveedor(file, proveedor, mesRaw, anioNum, rowId) {
  if (!file || file.type !== 'application/pdf') {
    throw new Error('Selecciona un archivo PDF.')
  }
  const nombre = nombreStoragePdfGastoEstructura(proveedor, mesRaw, anioNum, rowId)
  const { error } = await supabase.storage.from('facturas_proveedores').upload(nombre, file, { upsert: true })
  if (error) {
    const hint =
      /rls|row-level security|policy/i.test(String(error.message))
        ? '\n\nSi el error menciona RLS, ejecuta migrations/storage-rls-facturas-proveedores.sql en Supabase.'
        : ''
    throw new Error(String(error.message) + hint)
  }
  return nombre
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
      .select('id, numero_factura, fecha_pago, importe_pagado, url_pdf, proveedor_nombre')
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
    const base = `${i}_${p.proveedor_nombre || 'proveedor'}_${p.numero_factura || p.id || 'factura'}`
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

const BUCKET_FACTURAS_PROVEEDORES = 'facturas_proveedores'

const sinDiacriticos = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')

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
  <tr><td colspan="4" class="periodo-meta">Generado el ${new Date().toLocaleDateString('es-ES', { day:'2-digit', month:'long', year:'numeric' })} · ${cierresEnriquecidos.length} expediente${cierresEnriquecidos.length !== 1 ? 's' : ''} (Cerrado / Liquidado)</td></tr>
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
export {
  fechaInicioADate,
  trimestreDesdeMes,
  fechaReferenciaTrimestreDesdeExp,
  clasificarPorFechaInicio,
  extraerFinanzas,
  CATEGORIAS,
  TRIMESTRES,
  ESTADOS_CIERRE_HISTORIAL,
  esEstadoHistorialCierre,
  estadoNormalizado,
  badgeEstadoProps,
  ingresoMostradoHistorial,
  beneficioMostradoHistorial,
  NUMEROS_DIAGNOSTICO_HISTORIAL,
  SELECT_EXPEDIENTES_HISTORIAL_MIN,
  SELECT_EXPEDIENTES_HISTORIAL_EXT,
  TABLAS_EXPEDIENTES_HISTORIAL,
  esErrorTablaInexistenteHistorial,
  rangoFechasConsultaExpedientes,
  mergeExpedientesPorId,
  fetchExpedientesCierrePorRango,
  cederAlNavegadorParaZip,
  resolverUrlFacturaCliente,
  nombreArchivoSeguro,
  GASTOS_ESTRUCTURA_SELECT,
  GASTOS_ESTRUCTURA_SELECT_SIN_CREATED,
  GASTOS_ESTRUCTURA_SELECT_MINIMAL,
  esErrorColumnaSql,
  GASTOS_FIJOS_QUERY_TIMEOUT_MS,
  withTimeout,
  logErrorSupabase,
  PROVEEDORES_FIJOS_MENSUALES,
  subirPdfFacturaProveedorComoExpediente,
  fusionarFacturasClientePorExpediente,
  cargarDatosAuditoriaExpediente,
  particionarArchivosAuditoriaZip,
  construirListaArchivosAuditoria,
  BUCKET_FACTURAS_PROVEEDORES,
  sinDiacriticos,
  nombrePdfEnZipEstructura,
  construirHTMLCuaderno,
}
