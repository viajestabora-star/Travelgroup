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

/** Para uso exclusivo de ExpedienteFinanzas — solo lectura, no escribe a BD */
export const fromDbParaFinanzas = (row, proveedoresDb = []) => {
  const provOficial = proveedoresDb.find(
    p => String(p.id) === String(row.proveedor_id)
  )
  return {
    servicioId: String(row.id).trim(),
    conceptoVisible: String(row.nombre_especifico || row.tipo_servicio || '').trim(),
    proveedorVisible: provOficial?.nombre_comercial || row.nombre_proveedor_manual || 'Sin proveedor',
    costeCotizadoVisible: toNum(row.total_servicio ?? row.coste_unitario),
    costeRealProveedorVisible: toNum(row.coste_real_proveedor ?? 0),
    facturaUrl: String(row.url_factura_pdf || '').trim() || null,
  }
}
