/** Número fiscal ventas: `YYYY-XXX` (tres dígitos correlativos, ceros a la izquierda). */
const REGEX_NUMERO_FACTURA = /^(\d{4})-(\d+)$/

const TABLAS_NUMERACION = ['facturas_emitidas_global', 'facturas', 'facturas_emitidas']

/**
 * Parsea `numero_factura` si coincide con año-correlativo (acepta correlativos legacy con más dígitos).
 * @returns {{ year: number, seq: number } | null}
 */
export function parseNumeroFacturaVenta(raw) {
  const s = String(raw ?? '').trim()
  const m = s.match(REGEX_NUMERO_FACTURA)
  if (!m) return null
  const year = parseInt(m[1], 10)
  const seq = parseInt(m[2], 10)
  if (!Number.isFinite(year) || !Number.isFinite(seq) || seq < 1) return null
  return { year, seq }
}

/**
 * Formato estricto de numeración: `YYYY-XXX`.
 */
export function formatNumeroFacturaVenta(year, sequenceInt) {
  const y = Number(year)
  if (!Number.isFinite(y)) throw new Error('Año de factura inválido')
  const seq = Math.max(1, Math.floor(Number(sequenceInt)))
  return `${y}-${String(seq).padStart(3, '0')}`
}

/**
 * Correlativo fiscal: primer entero ≥ 1 que no está ocupado (huecos reutilizables).
 * Ej.: ocupados {1,2,5} → 3.
 */
export function siguienteCorrelativoDesdeSecuencias(sequences) {
  const used = new Set()
  for (const n of sequences) {
    const k = Number(n)
    if (Number.isFinite(k) && k >= 1) used.add(k)
  }
  let k = 1
  while (used.has(k)) k += 1
  return k
}

/**
 * Lee todos los `numero_factura` con prefijo del ejercicio (p. ej. `2026-%`) en las tablas de venta.
 * El correlativo siguiente es el **primer hueco libre** en 1…n (sin saltos deliberados).
 */
async function coleccionarNumerosEjercicio(supabase, year) {
  const prefijo = `${year}-`
  const peticiones = TABLAS_NUMERACION.map((tabla) =>
    supabase.from(tabla).select('numero_factura').like('numero_factura', `${prefijo}%`),
  )
  const respuestas = await Promise.all(peticiones)
  const fallos = respuestas.filter((r) => r.error)
  if (fallos.length === respuestas.length) {
    const msg = fallos.map((r) => r.error?.message).filter(Boolean).join('; ')
    throw new Error(msg || 'No se pudieron leer números de factura')
  }

  const seqs = []
  for (const r of respuestas) {
    if (r.error || !Array.isArray(r.data)) continue
    for (const row of r.data) {
      const p = parseNumeroFacturaVenta(row?.numero_factura)
      if (p && p.year === year) seqs.push(p.seq)
    }
  }
  return seqs
}

/**
 * Siguiente número de factura de venta para el ejercicio (huecos primero, luego max+1 implícito).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} [year] - Año del serie fiscal (prefijo `YYYY-`); por defecto año calendario actual.
 */
export async function getNextInvoiceNumber(supabase, year = new Date().getFullYear()) {
  const y = Number(year)
  if (!Number.isFinite(y)) throw new Error('Ejercicio inválido para numeración')
  const seqs = await coleccionarNumerosEjercicio(supabase, y)
  const nextSeq = siguienteCorrelativoDesdeSecuencias(seqs)
  return formatNumeroFacturaVenta(y, nextSeq)
}
