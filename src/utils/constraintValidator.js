/**
 * Escáner de Constraints — detiene datos inválidos ANTES de llegar a Supabase.
 * Cada función devuelve { ok: true } o { ok: false, campo, valor, mensaje }.
 */

import { DURACION_VIAJE_VALORES, TIPO_COLECTIVO_VALORES, normalizarDuracion } from '../constants/viaje'

// ── Expediente ────────────────────────────────────────────────────────────────

/**
 * Valida y sanitiza el objeto expediente antes de enviarlo a Supabase.
 * @param {Object} datos - Objeto con los campos del expediente
 * @returns {{ ok: boolean, errores: Array, datosSanitizados: Object }}
 */
export const validarExpedienteParaDB = (datos) => {
  const errores = []
  const datosSanitizados = { ...datos }

  // ── duracion_viaje ──────────────────────────────────────────────────────────
  const durRaw = (datos.duracion_viaje || '').trim()
  if (durRaw !== '') {
    if (DURACION_VIAJE_VALORES.includes(durRaw)) {
      datosSanitizados.duracion_viaje = durRaw
    } else {
      const corregido = normalizarDuracion(durRaw)
      if (corregido) {
        datosSanitizados.duracion_viaje = corregido
        // No es error — fue auto-corregido
      } else {
        errores.push({
          campo: 'duracion_viaje',
          valor: durRaw,
          mensaje: `⛔ Duración inválida: "${durRaw}". Los valores permitidos son: ${DURACION_VIAJE_VALORES.join(', ')}.`,
        })
        datosSanitizados.duracion_viaje = null
      }
    }
  }

  // ── tipo_colectivo ──────────────────────────────────────────────────────────
  const colRaw = (datos.tipo_colectivo || '').trim()
  if (colRaw !== '' && !TIPO_COLECTIVO_VALORES.includes(colRaw)) {
    errores.push({
      campo: 'tipo_colectivo',
      valor: colRaw,
      mensaje: `⛔ Tipo de colectivo inválido: "${colRaw}". Los valores permitidos son: ${TIPO_COLECTIVO_VALORES.join(', ')}.`,
    })
    datosSanitizados.tipo_colectivo = null
  }

  // ── fecha_inicio obligatoria ────────────────────────────────────────────────
  if (!datos.fecha_inicio && !datos.fechaInicio) {
    errores.push({
      campo: 'fecha_inicio',
      valor: null,
      mensaje: '⛔ La fecha de inicio es obligatoria.',
    })
  }

  // ── cliente_nombre no vacío ─────────────────────────────────────────────────
  const nombre = (datos.cliente_nombre || datos.clienteNombre || '').trim()
  if (!nombre) {
    errores.push({
      campo: 'cliente_nombre',
      valor: null,
      mensaje: '⛔ El nombre del cliente es obligatorio.',
    })
  }

  return {
    ok: errores.length === 0,
    errores,
    datosSanitizados,
  }
}

/**
 * Formatea los errores de validación como texto legible para mostrar al usuario.
 */
export const formatearErroresValidacion = (errores) => {
  if (!errores || errores.length === 0) return ''
  return errores.map((e) => e.mensaje).join('\n')
}
