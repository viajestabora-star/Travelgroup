/**
 * Consolidación de gastos al cambiar estado a Finalizado/Cerrado.
 * - Detecta servicios sin proveedor para permitir aviso previo en UI.
 * - DELETE previo, INSERT solo si estado es Finalizado/Cerrado.
 * - Inserta también servicios sin proveedor (proveedor_id null).
 */

import { supabase } from '../supabase'
import { toNum } from './finanzasHelpers'

const toNumSafe = (v) => {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number' && !isNaN(v)) return v
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

/** Extrae año_ejercicio (4 dígitos) del numero_expediente (formato YYYY-NNN) */
const extraerAñoEjercicio = (numeroExpediente) => {
  if (!numeroExpediente || typeof numeroExpediente !== 'string') return new Date().getFullYear()
  const match = String(numeroExpediente).trim().match(/^(\d{4})/)
  return match ? parseInt(match[1], 10) : new Date().getFullYear()
}

/** Coste total: total_servicio_manual o (cantidad * coste_unitario) */
const calcularCosteTotal = (s) => {
  const manual = toNumSafe(s.total_servicio_manual)
  if (manual > 0) return manual
  const cant = Math.max(1, toNumSafe(s.cantidad))
  const unit = toNumSafe(s.coste_unitario)
  return cant * unit
}

/** Obtiene proveedorId válido (BIGINT) de un servicio. null si inválido. */
const obtenerProveedorIdValido = (s) => {
  const raw = s.proveedorId ?? s.proveedor_id ?? s.proveedor_id_int
  if (raw == null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (isNaN(n) || n <= 0) return null
  return Math.floor(n)
}

const esErrorNotNullProveedorId = (error) => {
  const code = String(error?.code ?? '')
  const msg = String(error?.message ?? '').toLowerCase()
  return code === '23502' && msg.includes('proveedor_id')
}

/**
 * Recoge todos los servicios a consolidar:
 * - versiones_json: usa la versión CONFIRMADA o la primera
 * - Si no hay versiones_json: carga desde servicios_cotizacion
 */
const obtenerServiciosParaConsolidar = async (expedienteId, versionesJson) => {
  const versiones = Array.isArray(versionesJson?.versiones) ? versionesJson.versiones : []
  if (versiones.length > 0) {
    const confirmada = versiones.find((v) => v.confirmada)
    const v = confirmada ?? versiones[0]
    const servs = Array.isArray(v?.servicios) ? v.servicios : []
    return servs
  }
  const { data } = await supabase
    .from('servicios_cotizacion')
    .select('*')
    .eq('id_expediente', String(expedienteId).trim())
  const rows = Array.isArray(data) ? data : []
  return rows.map((r) => ({
    ...r,
    proveedorId: r.proveedor_id_int ?? r.proveedor_id,
    tipo_servicio: r.tipo_servicio ?? r.tipo,
    total_servicio_manual: r.total_servicio ?? r.total_servicio_manual ?? r.coste_unitario * (r.cantidad ?? 1),
    coste_unitario: r.coste_unitario ?? r.precio_venta,
    cantidad: r.cantidad ?? r.dias_guia ?? r.noches ?? 1,
  }))
}

/**
 * Detecta servicios sin proveedor para aviso no bloqueante.
 * @returns { { ok: boolean, warning?: string, detalle?: string } }
 */
export const validarProveedoresServicios = async (expedienteId, versionesJson) => {
  const servicios = await obtenerServiciosParaConsolidar(expedienteId, versionesJson)
  const conDatos = servicios.filter((s) => {
    const coste = calcularCosteTotal(s)
    const tipo = (s.tipo_servicio || s.tipo || '').trim()
    return coste > 0 || tipo !== ''
  })
  for (const s of conDatos) {
    const provId = obtenerProveedorIdValido(s)
    if (provId == null) {
      const nombre = s.nombreEspecifico || s.nombre_especifico || s.tipo_servicio || s.tipo || 'Servicio'
      return {
        ok: false,
        warning: 'Falta proveedor por asignar. ¿Deseas consolidar de todas formas?',
        detalle: nombre,
      }
    }
  }
  return { ok: true }
}

/**
 * Ejecuta consolidación: DELETE + INSERT (solo si debeConsolidar).
 * @param {string} expedienteId - UUID del expediente
 * @param {object} expediente - { numero_expediente, versiones_json }
 * @param {boolean} debeConsolidar - true si estado es Finalizado o Cerrado
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export const consolidarGastosExpediente = async (expedienteId, expediente, debeConsolidar) => {
  if (!expedienteId) return { ok: false, error: 'Expediente sin ID' }

  try {
    const { error: delError } = await supabase
      .from('gastos_consolidados')
      .delete()
      .eq('expediente_id', expedienteId)

    if (delError) return { ok: false, error: delError?.message || 'Error al limpiar gastos consolidados' }

    if (!debeConsolidar) return { ok: true }

    const servicios = await obtenerServiciosParaConsolidar(expedienteId, expediente?.versiones_json)
    const añoEjercicio = extraerAñoEjercicio(expediente?.numero_expediente)

    const filas = []
    for (const s of servicios) {
      const provId = obtenerProveedorIdValido(s)
      const costeTotal = calcularCosteTotal(s)
      if (costeTotal <= 0) continue
      const tipoServicio = (
        s.tipo_servicio ??
        s.tipo ??
        s.nombre_servicio ??
        s.nombreEspecifico ??
        s.nombre_especifico ??
        'Otros'
      )
      filas.push({
        expediente_id: expedienteId,
        proveedor_id: provId ?? null,
        tipo_servicio: String(tipoServicio).trim() || 'Otros',
        coste_total: costeTotal,
        año_ejercicio: añoEjercicio,
      })
    }

    if (filas.length === 0) return { ok: true }

    const { error: insError } = await supabase.from('gastos_consolidados').insert(filas)
    if (insError) {
      // En algunos entornos la columna proveedor_id sigue en NOT NULL.
      // Se envía null explícito, y si el esquema lo bloquea se reintenta sin esas filas.
      const filasConProveedor = filas.filter((f) => f.proveedor_id != null)
      if (!esErrorNotNullProveedorId(insError) || filasConProveedor.length === filas.length) {
        return { ok: false, error: insError?.message || 'Error al insertar gastos consolidados' }
      }
      if (filasConProveedor.length === 0) return { ok: true }
      const { error: insRetryError } = await supabase.from('gastos_consolidados').insert(filasConProveedor)
      if (insRetryError) {
        return { ok: false, error: insRetryError?.message || 'Error al insertar gastos consolidados' }
      }
      return { ok: true }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}
