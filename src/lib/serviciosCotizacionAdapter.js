/**
 * Adaptador canónico para el contrato de datos en memoria de servicios de cotización.
 * Fuente única de verdad para la conversión BD ↔ memoria.
 * No importa nada de componentes React. Solo lógica pura.
 */

const toNum = (v) => {
  if (v === null || v === undefined) return 0
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

const resolverProveedorIdBigint = (row, proveedores) => {
  const candidato = row.proveedor_id ?? row.proveedor_id_int
  if (candidato == null || candidato === '') return null
  const parsed = Number(candidato)
  return (!isNaN(parsed) && parsed > 0) ? parsed : null
}

export const servicioVacio = () => ({
  id: null,
  proveedor_id: null,
  proveedorNombre: '',
  mayorista_id: null,
  tipo: 'Hotel',
  tipo_servicio: 'Hotel',
  tipo_calculo: 'porPersona',
  nombreEspecifico: '',
  localizacion: '',
  especificacion_destino: '',
  coste_unitario: 0,
  margen: 0,
  noches: 1,
  dias_guia: 1,
  cantidad: 1,
  fechaRelease: '',
  releasePagado: false,
})

export const fromDb = (row, proveedores = []) => ({
  ...servicioVacio(),
  id: row.id ?? null,
  proveedor_id: resolverProveedorIdBigint(row, proveedores),
  proveedorNombre: row.nombre_proveedor_manual ?? '',
  mayorista_id: row.mayorista_id ?? null,
  tipo: row.tipo_servicio ?? row.tipo ?? 'Hotel',
  tipo_servicio: row.tipo_servicio ?? row.tipo ?? 'Hotel',
  tipo_calculo: (row.tipo_calculo === 'Total a dividir' || row.tipo_calculo === 'porGrupo') ? 'porGrupo' : 'porPersona',
  nombreEspecifico: row.nombre_especifico ?? '',
  localizacion: row.localizacion ?? '',
  especificacion_destino: row.especificacion_destino ?? '',
  coste_unitario: toNum(row.coste_unitario),
  margen: toNum(row.margen_pax),
  noches: Math.max(1, toNum(row.noches)),
  dias_guia: toNum(row.dias_guia),
  cantidad: Math.max(1, toNum(row.cantidad)),
  fechaRelease: row.fecha_release ? String(row.fecha_release).split('T')[0] : '',
  releasePagado: !!row.release_pagado,
})

export const toDb = (servicio, idExpediente, empresaId) => ({
  id: servicio.id ?? null,
  id_expediente: String(idExpediente).trim(),
  empresa_id: empresaId,
  proveedor_id: servicio.proveedor_id ?? null,
  nombre_proveedor_manual: servicio.proveedorNombre || null,
  mayorista_id: servicio.mayorista_id ?? null,
  tipo_servicio: servicio.tipo_servicio,
  tipo_calculo: servicio.tipo_calculo,
  nombre_especifico: servicio.nombreExplicit || servicio.nombreEspecifico,
  localizacion: servicio.localizacion,
  especificacion_destino: servicio.especificacion_destino,
  coste_unitario: servicio.coste_unitario,
  margen_pax: servicio.margen,
  noches: servicio.noches,
  dias_guia: servicio.dias_guia,
  cantidad: servicio.cantidad,
  fecha_release: servicio.fechaRelease || null,
  release_pagado: !!servicio.releasePagado,
})

/**
 * Reconstruye el coste cotizado total (visible) de una fila `servicios_cotizacion`.
 * Orden defensivo (sin depender de pax, que no está en la fila):
 *   a) total_servicio_manual > 0  → total explícito introducido a mano.
 *   b) total_servicio > 0         → fallback legacy (el adapter actual ya no lo escribe).
 *   c) coste_unitario × cantidad × (noches si es hotel) × (dias_guia si es guía).
 *   d) sin datos suficientes      → 0.
 */
const calcularCosteCotizadoVisible = (row) => {
  const manual = toNum(row.total_servicio_manual)
  if (manual > 0) return manual

  const legacy = toNum(row.total_servicio)
  if (legacy > 0) return legacy

  const base = toNum(row.coste_unitario)
  if (base <= 0) return 0

  const tipo = String(row.tipo_servicio ?? row.tipo ?? '').trim().toLowerCase()
  const esHotel = tipo.includes('hotel')
  const esGuia = tipo === 'g' || tipo.includes('guia') || tipo.includes('guía')

  const cantidad = toNum(row.cantidad)
  const noches = toNum(row.noches)
  const diasGuia = toNum(row.dias_guia)

  let total = base
  if (cantidad > 0) total *= cantidad
  if (esHotel && noches > 0) total *= noches
  if (esGuia && diasGuia > 0) total *= diasGuia

  return total
}

/** Para uso exclusivo de ExpedienteFinanzas — solo lectura, no escribe a BD */
export const fromDbParaFinanzas = (row, proveedoresDb = []) => {
  const provOficial = proveedoresDb.find(
    p => String(p.id) === String(row.proveedor_id)
  )
  const costeCotizadoVisible = calcularCosteCotizadoVisible(row)
  const sinCosteRealIntroducido = row.coste_real_proveedor === null || row.coste_real_proveedor === undefined
  const costeRealProveedorVisible = sinCosteRealIntroducido
    ? costeCotizadoVisible
    : toNum(row.coste_real_proveedor)
  return {
    servicioId: String(row.id).trim(),
    conceptoVisible: String(row.nombre_especifico || row.tipo_servicio || '').trim(),
    proveedorVisible: provOficial?.nombre_comercial || row.nombre_proveedor_manual || 'Sin proveedor',
    costeCotizadoVisible,
    costeRealProveedorVisible,
    facturaUrl: String(row.url_factura_pdf || '').trim() || null,
  }
}

export const validarServicio = (servicio) => {
  const errores = []
  if (servicio == null || typeof servicio !== 'object') {
    return { valido: false, errores: ['Servicio nulo o con tipo incorrecto'] }
  }
  if (!servicio.tipo_servicio || String(servicio.tipo_servicio).trim() === '') {
    errores.push('tipo_servicio es obligatorio')
  }
  const coste = Number(servicio.coste_unitario)
  if (isNaN(coste)) errores.push('coste_unitario no es un número válido')
  else if (coste < 0) errores.push('coste_unitario no puede ser negativo')
  if (isNaN(Number(servicio.margen))) errores.push('margen no es un número válido')
  const noches = Number(servicio.noches)
  if (!Number.isInteger(noches) || noches < 1) errores.push('noches debe ser un entero mayor que 0')
  const diasGuia = Number(servicio.dias_guia)
  if (isNaN(diasGuia) || diasGuia < 0) errores.push('dias_guia no puede ser negativo ni NaN')
  const cantidad = Number(servicio.cantidad)
  if (!Number.isInteger(cantidad) || cantidad < 1) errores.push('cantidad debe ser un entero mayor que 0')
  if (!['porPersona', 'porGrupo'].includes(servicio.tipo_calculo)) {
    errores.push('tipo_calculo debe ser porPersona o porGrupo')
  }
  if (servicio.fechaRelease && !/^\d{4}-\d{2}-\d{2}$/.test(servicio.fechaRelease)) {
    errores.push('fechaRelease debe tener formato YYYY-MM-DD')
  }
  return { valido: errores.length === 0, errores }
}

export const validarServicioCierre = (servicio) => {
  const { valido, errores } = validarServicio(servicio)
  const erroresCierre = [...errores]

  const tieneProveedorId = servicio.proveedor_id != null && Number(servicio.proveedor_id) > 0
  const tieneNombreProveedor = String(servicio.proveedorNombre ?? '').trim() !== ''

  if (!tieneProveedorId && !tieneNombreProveedor) {
    erroresCierre.push('El servicio debe tener proveedor_id o proveedorNombre para cerrar el expediente')
  }

  return { valido: erroresCierre.length === 0, errores: erroresCierre }
}
