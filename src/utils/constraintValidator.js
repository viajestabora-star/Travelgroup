/**
 * Sanitizador Elástico de Constraints — NUNCA bloquea al usuario.
 *
 * Regla de oro: el guardado siempre pasa. El sanitizador corrige silenciosamente
 * lo que puede y, lo que no puede corregir, lo pone a null para que la DB acepte el registro.
 * Las advertencias son solo informativas (para el panel de integridad), nunca bloquean.
 */

import { DURACION_VIAJE_VALORES, TIPO_COLECTIVO_VALORES, normalizarDuracion } from '../constants/viaje'

/**
 * Sanitiza un objeto expediente para que la DB siempre lo acepte.
 * - Valores legados conocidos → se traducen al canónico automáticamente.
 * - Valores completamente desconocidos → se ponen a null (DB acepta null).
 * - Campos vacíos/null → se dejan como null (nunca bloquean).
 *
 * @param {Object} datos - Objeto con los campos del expediente
 * @returns {{ datosSanitizados: Object, advertencias: string[] }}
 *   datosSanitizados: objeto listo para Supabase (siempre válido)
 *   advertencias: lista de avisos informativos (NO son errores bloqueantes)
 */
export const sanitizarExpedienteParaDB = (datos) => {
  const advertencias = []
  const datosSanitizados = { ...datos }

  // ── duracion_viaje ──────────────────────────────────────────────────────────
  const durRaw = (datos.duracion_viaje || '').trim()
  if (durRaw === '') {
    datosSanitizados.duracion_viaje = null
  } else if (DURACION_VIAJE_VALORES.includes(durRaw)) {
    datosSanitizados.duracion_viaje = durRaw
  } else {
    const corregido = normalizarDuracion(durRaw)
    if (corregido) {
      datosSanitizados.duracion_viaje = corregido
      advertencias.push(`Duración "${durRaw}" corregida automáticamente a "${corregido}"`)
    } else {
      // Valor desconocido: asignar 'Día completo' como valor por defecto seguro
      datosSanitizados.duracion_viaje = 'Día completo'
      advertencias.push(`Duración "${durRaw}" no reconocida — asignada "Día completo" por defecto`)
    }
  }

  // ── tipo_colectivo ──────────────────────────────────────────────────────────
  const colRaw = (datos.tipo_colectivo || '').trim()
  if (colRaw !== '' && !TIPO_COLECTIVO_VALORES.includes(colRaw)) {
    datosSanitizados.tipo_colectivo = null
    advertencias.push(`Tipo colectivo "${colRaw}" no reconocido — guardado como vacío`)
  }

  return { datosSanitizados, advertencias }
}

/**
 * Detecta qué campos opcionales del expediente están pendientes de completar.
 * Solo devuelve avisos visuales — no bloquea nada.
 *
 * @param {Object} expediente
 * @param {Array}  servicios  - Lista de servicios de cotización del expediente
 * @returns {string[]} Lista de nombres de campos pendientes
 */
export const detectarCamposPendientes = (expediente, servicios = []) => {
  const pendientes = []

  if (!expediente) return pendientes

  if (!expediente.duracion_viaje || String(expediente.duracion_viaje).trim() === '') {
    pendientes.push('Duración del viaje')
  }
  if (!expediente.destino || String(expediente.destino).trim() === '') {
    pendientes.push('Destino')
  }
  if (!expediente.tipo_colectivo || String(expediente.tipo_colectivo).trim() === '') {
    pendientes.push('Tipo de colectivo')
  }
  if (!expediente.responsable || String(expediente.responsable).trim() === '') {
    pendientes.push('Responsable')
  }

  const serviciosSinProveedor = (servicios || []).filter(
    (s) => !s.proveedor_id && !s.proveedorId && !s.proveedor_id_int && !s.proveedorNombreTemporal && !s.nombre_proveedor_texto
  )
  if (serviciosSinProveedor.length > 0) {
    pendientes.push(`${serviciosSinProveedor.length} proveedor${serviciosSinProveedor.length > 1 ? 'es' : ''} pendiente${serviciosSinProveedor.length > 1 ? 's' : ''} de asignar`)
  }

  return pendientes
}
