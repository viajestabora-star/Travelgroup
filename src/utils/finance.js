/**
 * Cálculos financieros canónicos del ERP (IVA 21% incluido en el total, beneficio neto = base imponible).
 * Centralizar aquí evita divergencias entre cierre, informes y columnas planas.
 */

const IVA_SOBRE_BENEFICIO_INCLUIDO = 1.21

/** Redondeo monetario a 2 decimales (coherente con persistencia e informes). */
export function roundEur2(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

/**
 * Beneficio neto (base imponible) cuando el importe lleva IVA 21% incluido: Total / 1,21.
 * Si el total es ≤ 0, se devuelve el mismo total redondeado (sin cuota de liquidación positiva).
 */
export function beneficioNetoDesdeTotalConIvaIncluido(totalConIva) {
  const t = roundEur2(totalConIva)
  if (t <= 0) return t
  return roundEur2(t / IVA_SOBRE_BENEFICIO_INCLUIDO)
}

/**
 * Cuota de IVA correspondiente a un total con IVA incluido: Total − (Total / 1,21), en 2 decimales.
 */
export function cuotaIvaDesdeTotalConIvaIncluido(totalConIva) {
  const t = roundEur2(totalConIva)
  if (t <= 0) return 0
  const neto = beneficioNetoDesdeTotalConIvaIncluido(t)
  return roundEur2(t - neto)
}

/**
 * Desglose del margen bruto (ingresos − gastos) tratado como importe con IVA 21% incluido.
 * @returns {{ beneficioBruto: number, beneficioNeto: number, beneficioLimpio: number, ivaPagado: number }}
 */
export function desgloseIvaBeneficioBruto(beneficioBrutoRaw) {
  const bruto = roundEur2(beneficioBrutoRaw)
  if (bruto <= 0) {
    return {
      beneficioBruto: bruto,
      beneficioNeto: bruto,
      beneficioLimpio: bruto,
      ivaPagado: 0,
    }
  }
  const beneficioNeto = beneficioNetoDesdeTotalConIvaIncluido(bruto)
  const ivaPagado = roundEur2(bruto - beneficioNeto)
  return {
    beneficioBruto: bruto,
    beneficioNeto,
    beneficioLimpio: beneficioNeto,
    ivaPagado,
  }
}
