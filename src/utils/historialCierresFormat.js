/**
 * Formato y constantes de calendario para Historial de Cierres.
 * Módulo separado para hoisting estable (evita TDZ / error «ft» en minificación).
 */

/** Número finito seguro. */
export function parseToFiniteNumber(value) {
  const num = Number(value ?? 0)
  return Number.isFinite(num) ? num : 0
}

export const n = parseToFiniteNumber

export function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

var __historialCierresIntlEuro = null

/** Formato moneda EUR con Intl (caché en var de módulo). */
export function formatEuroAmount(value) {
  var amount = parseToFiniteNumber(value)
  try {
    if (!__historialCierresIntlEuro) {
      __historialCierresIntlEuro = new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    }
    return __historialCierresIntlEuro.format(amount)
  } catch (_e) {
    return amount.toFixed(2).replace('.', ',') + ' €'
  }
}

/** Cuaderno HTML/Excel: solo cifra + coma decimal. */
export function fmtEur(v) {
  return formatEuroAmount(v)
    .replace(/\s?€\s?$/u, '')
    .trim()
}

/** Nombres de mes (1-based index al usar [mesNum - 1]). */
export const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/** Meses 1–12 del trimestre T1–T4 */
export const mesesDelTrimestre = (q) => {
  const qn = Number(q)
  if (qn < 1 || qn > 4) return []
  const base = (qn - 1) * 3
  return [base + 1, base + 2, base + 3]
}

/** Iniciales para “marca” junto al nombre. */
/** Corrige erratas conocidas en nombres de proveedor (plantilla / estructura). */
export function normalizarProveedorEstructura(nombre) {
  return String(nombre ?? '')
    .trim()
    .replace(/Aixarenting/gi, 'Caixarenting')
}

export const inicialesProveedorEstructura = (nombre) => {
  const t = normalizarProveedorEstructura(nombre)
  if (!t) return '??'
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return t.slice(0, 2).toUpperCase()
}

export function getYearContext() {
  return new Date().getFullYear()
}

export const añoActual = getYearContext()
export const AÑOS = Array.from({ length: 6 }, (_, i) => añoActual - i)

export function formatearFecha(f) {
  return f ? f.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
}

export function estadoInicialAcordeon(añoSeleccionado) {
  const y = parseInt(String(añoSeleccionado), 10)
  const añoRef = getYearContext()
  if (y !== añoRef) {
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

export function formInicialGastoMensual(añoStr, mesNum) {
  return {
    categoria: 'arsys',
    proveedorOtro: '',
    fecha: `${añoStr}-${String(mesNum).padStart(2, '0')}-01`,
  }
}

/** Valor de `gastos_estructura.mes` (TEXT) desde el mes de pantalla 1–12. */
export function mesEstructuraDesdeNumero(mesNum) {
  if (!Number.isFinite(mesNum) || mesNum < 1 || mesNum > 12) return null
  return String(mesNum)
}

/** Interpreta `gastos_estructura.mes` (TEXT) como número de mes 1–12 para filtros y orden. */
export function mesNumeroDesdeEstructura(mesRaw) {
  if (mesRaw == null || mesRaw === '') return null
  const s = String(mesRaw).trim()
  const n = parseInt(s, 10)
  if (Number.isFinite(n) && n >= 1 && n <= 12) return n
  const i = NOMBRES_MES.findIndex((nm) => nm.toLowerCase() === s.toLowerCase())
  return i >= 0 ? i + 1 : null
}
