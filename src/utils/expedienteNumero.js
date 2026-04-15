/**
 * Utilidades para numero_expediente.
 * Formato: YYYY-XXX (ej: 2026-012). Regla de oro: ceros a la izquierda.
 */
import { supabase } from '../supabase'

const FORMATO_NUMERO_EXP = /^\d{4}-\d+$/

export const esNumeroExpedienteValido = (v) =>
  v && typeof v === 'string' && FORMATO_NUMERO_EXP.test(v.trim())

/**
 * Comprueba si un numero_expediente ya existe en Supabase.
 * @param {string} numero - Número a comprobar (ej: 2026-012)
 * @param {string|null} excluirExpedienteId - Al editar, excluir este expediente
 * @returns {Promise<boolean>}
 */
export const existeNumeroExpedienteEnSupabase = async (numero, excluirExpedienteId = null) => {
  if (!numero || !esNumeroExpedienteValido(numero)) return false
  try {
    let query = supabase
      .from('expedientes')
      .select('id')
      .eq('numero_expediente', String(numero).trim())
    if (excluirExpedienteId) {
      query = query.neq('id', excluirExpedienteId)
    }
    const { data, error } = await query.limit(1)
    if (error) return false
    return Array.isArray(data) && data.length > 0
  } catch {
    return false
  }
}

/**
 * Siguiente correlativo YYYY-NNN para un año de numeración (ej. ejercicio activo),
 * calculando el máximo real entre todos los expedientes con ese prefijo (no solo orden lexicográfico).
 */
export async function obtenerSiguienteNumeroExpedienteCorrelativo(año) {
  const añoNum = parseInt(String(año), 10) || new Date().getFullYear()
  const prefijo = `${añoNum}-`
  const limite = 10000
  try {
    const { data, error } = await supabase
      .from('expedientes')
      .select('numero_expediente')
      .ilike('numero_expediente', `${prefijo}%`)
      .limit(limite)

    if (error) return `${añoNum}-001`

    let maxSecuencia = 0
    const filas = Array.isArray(data) ? data : []
    for (const row of filas) {
      const num = String(row?.numero_expediente || '').trim()
      if (!esNumeroExpedienteValido(num)) continue
      const partes = num.split('-')
      if (partes.length !== 2 || partes[0] !== String(añoNum)) continue
      const seq = parseInt(partes[1], 10)
      if (!Number.isNaN(seq) && seq > maxSecuencia) maxSecuencia = seq
    }

    const siguiente = maxSecuencia + 1
    return `${añoNum}-${String(siguiente).padStart(3, '0')}`
  } catch {
    return `${añoNum}-001`
  }
}

/** 23505 por colisión del número de expediente (dos altas simultáneas). */
export const esErrorUnicidadNumeroExpediente = (error) => {
  if (!error) return false
  if (String(error.code) !== '23505') return false
  const blob = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase()
  return blob.includes('numero_expediente')
}
