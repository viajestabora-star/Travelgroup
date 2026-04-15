/**
 * Fuente de verdad financiera cuando existe `expedientes.cierre_grupo` (cierre verificado).
 * Los totales canónicos viven en `cierre_grupo.totales` (nuevo); si falta, se derivan solo de claves
 * dentro del JSON `cierre_grupo`, sin usar columnas planas del expediente.
 */

export function n(v) {
  const num = Number(v)
  return Number.isFinite(num) ? num : 0
}

/** True si el JSON de cierre contiene datos financieros verificables (no solo metadatos). */
export function cierreGrupoTieneFinanzasVerificadas(cg) {
  if (!cg || typeof cg !== 'object') return false
  return !!(
    cg.totales ||
    cg.ingresos_totales != null ||
    cg.total_ingresos != null ||
    cg.gastos_totales != null ||
    cg.beneficio_limpio != null ||
    cg.beneficio != null ||
    (Array.isArray(cg.costesReales) && cg.costesReales.length > 0) ||
    (Array.isArray(cg.gastosImprevistos) && cg.gastosImprevistos.length > 0)
  )
}

/** Suma costes reales por línea + gastos imprevistos (desglose del cierre). */
export function sumarDesgloseGastosCierreGrupo(cierreGrupo) {
  if (!cierreGrupo || typeof cierreGrupo !== 'object') return 0
  const costesReales = Array.isArray(cierreGrupo.costesReales) ? cierreGrupo.costesReales : []
  const gastosImprevistos = Array.isArray(cierreGrupo.gastosImprevistos) ? cierreGrupo.gastosImprevistos : []
  return (
    costesReales.reduce((s, c) => s + n(c?.coste_real), 0) +
    gastosImprevistos.reduce((s, g) => s + n(g?.importe), 0)
  )
}

/**
 * Lee totales agregados: si existe `cierre_grupo.totales`, es la única fuente para esos campos.
 * Si no hay `totales`, se reconstruye únicamente desde el resto de claves del mismo JSON (legacy).
 */
export function leerTotalesCierreGrupo(cierreGrupo) {
  if (!cierreGrupo || typeof cierreGrupo !== 'object') return null

  const tRaw = cierreGrupo.totales
  const t = tRaw && typeof tRaw === 'object' ? tRaw : null
  const gastosDesdeLineas = sumarDesgloseGastosCierreGrupo(cierreGrupo)

  if (t) {
    const gastos_totales = n(t.gastos_totales ?? t.gastos_reales)
    const ingresos_totales = n(t.ingresos_totales ?? t.total_ingresos)
    const iva_pagado = n(t.iva_pagado)
    const beneficio_limpio = n(t.beneficio_limpio ?? t.beneficio_neto ?? t.beneficio)
    const beneficio_bruto = n(
      t.beneficio_bruto != null && t.beneficio_bruto !== ''
        ? t.beneficio_bruto
        : ingresos_totales - gastos_totales
    )
    return {
      ingresos_totales,
      gastos_totales,
      iva_pagado,
      beneficio_limpio,
      beneficio_bruto,
      gastos_desde_lineas: gastosDesdeLineas,
      fuente: 'totales',
    }
  }

  const ingresos_totales = n(cierreGrupo.ingresos_totales ?? cierreGrupo.total_ingresos)
  let gastos_totales = n(cierreGrupo.gastos_totales ?? cierreGrupo.gastos_reales)
  if (gastos_totales === 0 && gastosDesdeLineas > 0) gastos_totales = gastosDesdeLineas
  const iva_pagado = n(cierreGrupo.iva_pagado)
  const beneficio_limpio = n(
    cierreGrupo.beneficio_limpio ?? cierreGrupo.beneficio_neto ?? cierreGrupo.beneficio
  )
  const beneficio_bruto = n(
    cierreGrupo.beneficio_bruto != null && cierreGrupo.beneficio_bruto !== ''
      ? cierreGrupo.beneficio_bruto
      : ingresos_totales - gastos_totales
  )

  return {
    ingresos_totales,
    gastos_totales,
    iva_pagado,
    beneficio_limpio,
    beneficio_bruto,
    gastos_desde_lineas: gastosDesdeLineas,
    fuente: 'legacy',
  }
}

/** Finanzas solo desde JSON de cierre (sin columnas `expedientes.*`). */
export function leerFinanzasCierreDesdeSoloCierreGrupo(cierreGrupo) {
  const tot = leerTotalesCierreGrupo(cierreGrupo)
  if (!tot) {
    return {
      ingresos_totales: 0,
      gastos_totales: 0,
      iva_pagado: 0,
      beneficio_limpio: 0,
      beneficio_bruto: 0,
      costesReales: [],
      gastosImprevistos: [],
    }
  }
  return {
    ingresos_totales: tot.ingresos_totales,
    gastos_totales: tot.gastos_totales,
    iva_pagado: tot.iva_pagado,
    beneficio_limpio: tot.beneficio_limpio,
    beneficio_bruto: tot.beneficio_bruto,
    costesReales: Array.isArray(cierreGrupo.costesReales) ? cierreGrupo.costesReales : [],
    gastosImprevistos: Array.isArray(cierreGrupo.gastosImprevistos) ? cierreGrupo.gastosImprevistos : [],
  }
}

/**
 * Para listados / informes: si hay `cierre_grupo` con datos de cierre, ignora columnas planas.
 */
export function finanzasExpedienteParaInformes(exp) {
  const cg = exp?.cierre_grupo
  const tieneCierre = cierreGrupoTieneFinanzasVerificadas(cg)

  if (!tieneCierre) {
    return {
      desdeCierreGrupo: false,
      ingresos_totales: n(exp?.total_ingresos),
      gastos_totales: n(exp?.total_gastos_reales),
      iva_pagado: n(exp?.cuota_iva),
      beneficio_limpio: n(exp?.beneficio_neto_real ?? exp?.liquidacion_final_beneficio),
      beneficio_bruto: n(exp?.total_ingresos) - n(exp?.total_gastos_reales),
    }
  }

  const f = leerFinanzasCierreDesdeSoloCierreGrupo(cg)
  return { desdeCierreGrupo: true, ...f }
}

/**
 * Bloque `totales` persistido dentro de `cierre_grupo`.
 * `gastos_totales` prioriza la suma del desglose (varias líneas del mismo concepto) para alinear con la UI.
 */
export function construirBloqueTotalesCierre({
  ingresos_totales,
  gastos_totales_formulario,
  beneficio_bruto,
  iva_pagado,
  beneficio_limpio,
  costesReales,
  gastosImprevistos,
}) {
  const parcial = { costesReales: costesReales || [], gastosImprevistos: gastosImprevistos || [] }
  const sumaLineas = sumarDesgloseGastosCierreGrupo(parcial)
  const gastos_totales = sumaLineas > 0 ? sumaLineas : n(gastos_totales_formulario)
  const ing = n(ingresos_totales)
  const bb =
    beneficio_bruto != null && beneficio_bruto !== ''
      ? n(beneficio_bruto)
      : ing - gastos_totales
  const iva = n(iva_pagado)
  const bl =
    beneficio_limpio != null && beneficio_limpio !== ''
      ? n(beneficio_limpio)
      : bb - iva
  return {
    ingresos_totales: ing,
    gastos_totales,
    beneficio_bruto: bb,
    iva_pagado: iva,
    beneficio_limpio: bl,
  }
}
