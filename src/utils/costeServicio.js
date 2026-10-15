/**
 * Regla única de coste por servicio (la de Cotización).
 * La importan Cotización, Cierre y consolidación de gastos: no copiarla.
 * No usa total_servicio_manual: no tiene campo editable en la UI ni se guarda en BD.
 */

import { toNum, normalizarTipo } from './finanzasHelpers'

/**
 * - Guía: total = coste_unitario × cantidad → coste_pax = total / pasajeros_pago (sin redondeo)
 * - porGrupo (Total a dividir) / Autobús / Transporte: total = coste_unitario → coste_pax = total / pasajeros_pago
 * - porPersona: coste_pax = coste_unitario × noches (hotel) → total = coste_pax × totalPax
 * @returns {{ coste_pax: number, total_servicio: number }}
 */
export const calcularCosteServicio = (servicio, paxPago = 31, paxTotal = 35) => {
  const s = servicio || {}
  const pP = Math.max(1, toNum(paxPago))
  const pT = Math.max(1, toNum(paxTotal))
  const precio = toNum(s.coste_unitario)
  const tipoNorm = normalizarTipo(s.tipo || s.tipo_servicio || '')

  if (tipoNorm === 'guia' || tipoNorm === 'g') {
    const total = precio * Math.max(1, toNum(s.cantidad ?? s.dias_guia ?? 1))
    return { coste_pax: total / pP, total_servicio: total }
  }

  const esPorGrupo = s.tipo_calculo === 'porGrupo' || s.tipo_calculo === 'Total a dividir'
  const esAutobusOTransporte = tipoNorm === 'autobus' || tipoNorm === 'transporte'

  let totalFinal = 0
  let costePorPersona = 0
  if (esAutobusOTransporte || esPorGrupo) {
    totalFinal = precio
    costePorPersona = totalFinal / pP
  } else {
    const factor = tipoNorm === 'hotel' ? Math.max(1, toNum(s.noches)) : 1
    costePorPersona = precio * factor
    totalFinal = costePorPersona * pT
  }
  return { coste_pax: Number(costePorPersona.toFixed(2)), total_servicio: Number(totalFinal.toFixed(2)) }
}
