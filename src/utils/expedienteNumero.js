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
