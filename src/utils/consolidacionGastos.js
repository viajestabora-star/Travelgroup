/**
 * Consolidación de gastos al cambiar estado a Finalizado/Cerrado.
 * - Detecta servicios sin proveedor para permitir aviso previo en UI.
 * - DELETE previo, INSERT solo si estado es Finalizado/Cerrado.
 * - Inserta también servicios sin proveedor (proveedor_id null).
 */

import { supabase } from '../supabase'
import { toNum } from './finanzasHelpers'
import {
  MSJ_OPERACION_SIN_EMPRESA_ID,
  resolverEmpresaIdEscrituraObligatorio,
} from './tenantEmpresa'

const SERVICIO_ANOMALO_ID = 'b97fbcff-eb61-4443-b4a0-77352f794d9c'

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

/** Campos de ID de proveedor que usa el frontend (camelCase, BD, legacy). */
const CAMPOS_PROVEEDOR_ID = ['proveedor_id', 'proveedorId', 'proveedor_id_int']

/** Campos de nombre de proveedor cuando no hay ID numérico (texto manual / UI). */
const CAMPOS_PROVEEDOR_NOMBRE = [
  'proveedor_nombre',
  'proveedorNombreTemporal',
  'nombre_proveedor_texto',
  'nombre_proveedor_manual',
]

/** Obtiene proveedorId válido (BIGINT) de un servicio. null si inválido. */
const obtenerProveedorIdValido = (s) => {
  for (const campo of CAMPOS_PROVEEDOR_ID) {
    const raw = s?.[campo]
    if (raw == null || raw === '') continue
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!isNaN(n) && n > 0) return Math.floor(n)
  }
  return null
}

/**
 * ¿El servicio tiene proveedor asignado en memoria / BD?
 * Tolerante a nomenclaturas temporales del frontend (no solo BIGINT).
 */
export const servicioTieneProveedorAsignado = (s) => {
  if (!s) return false
  if (obtenerProveedorIdValido(s) != null) return true
  return CAMPOS_PROVEEDOR_NOMBRE.some((campo) => {
    const t = s[campo]
    return t != null && String(t).trim() !== ''
  })
}

const esErrorNotNullProveedorId = (error) => {
  const code = String(error?.code ?? '')
  const msg = String(error?.message ?? '').toLowerCase()
  return code === '23502' && msg.includes('proveedor_id')
}

/**
 * empresa_id obligatorio para gastos_consolidados (NOT NULL + RLS).
 * Orden: expediente actual → sesión Supabase (JWT / profiles).
 * @returns {Promise<number>}
 */
const resolverEmpresaIdConsolidacion = async (expediente) => {
  const raw = expediente?.empresa_id ?? expediente?.empresa_id_int
  const desdeExpediente = Number(raw)
  if (Number.isFinite(desdeExpediente) && desdeExpediente > 0) {
    return Math.trunc(desdeExpediente)
  }
  return resolverEmpresaIdEscrituraObligatorio(supabase)
}

/** Normaliza fila de servicio (tabla relacional) al shape del validador. */
const normalizarServicioParaConsolidacion = (r) => {
  const provId = r.proveedor_id_int ?? r.proveedor_id ?? r.proveedorId
  return {
    ...r,
    proveedor_id: r.proveedor_id ?? provId,
    proveedorId: r.proveedorId ?? provId,
    proveedor_id_int: r.proveedor_id_int ?? provId,
    tipo_servicio: r.tipo_servicio ?? r.tipo,
    total_servicio_manual:
      r.total_servicio_manual ??
      r.total_servicio ??
      (toNumSafe(r.coste_unitario) * Math.max(1, toNumSafe(r.cantidad ?? r.dias_guia ?? r.noches ?? 1))),
    coste_unitario: r.coste_unitario ?? r.precio_venta,
    cantidad: r.cantidad ?? r.dias_guia ?? r.noches ?? 1,
  }
}

/** Recoge servicios para validar/consolidar desde servicios_cotizacion. */
const obtenerServiciosParaConsolidar = async (expedienteId) => {
  const { data } = await supabase
    .from('servicios_cotizacion')
    .select('*')
    .eq('id_expediente', String(expedienteId).trim())
    .neq('id', SERVICIO_ANOMALO_ID)

  const rows = Array.isArray(data) ? data : []
  return rows.map(normalizarServicioParaConsolidacion)
}

/**
 * Detecta servicios sin proveedor para aviso no bloqueante.
 * @returns { { ok: boolean, warning?: string, detalle?: string } }
 */
export const validarProveedoresServicios = async (expedienteId) => {
  const servicios = await obtenerServiciosParaConsolidar(expedienteId)
  const conDatos = servicios.filter((s) => {
    const coste = calcularCosteTotal(s)
    const tipo = (s.tipo_servicio || s.tipo || '').trim()
    return coste > 0 || tipo !== ''
  })
  for (const s of conDatos) {
    if (!servicioTieneProveedorAsignado(s)) {
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
 * @param {object} expediente - { numero_expediente, empresa_id }
 * @param {boolean} debeConsolidar - true si estado es Finalizado o Cerrado
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export const consolidarGastosExpediente = async (expedienteId, expediente, debeConsolidar) => {
  if (!expedienteId) return { ok: false, error: 'Expediente sin ID' }

  try {
    const { data: ses } = await supabase.auth.getSession()
    if (!ses?.session?.access_token) {
      return { ok: false, error: 'Sesión no válida para consolidar gastos (RLS).' }
    }

    const { error: delError } = await supabase
      .from('gastos_consolidados')
      .delete()
      .eq('expediente_id', expedienteId)

    if (delError) {
      const msg = String(delError?.message || '')
      if (/row-level security|rls|permission denied/i.test(msg) || String(delError?.code || '') === '42501') {
        return { ok: false, error: 'RLS bloqueó DELETE en gastos_consolidados. Revisa la política para el usuario autenticado y su empresa_id.' }
      }
      return { ok: false, error: delError?.message || 'Error al limpiar gastos consolidados' }
    }

    if (!debeConsolidar) return { ok: true }

    let empresaIdInt
    try {
      empresaIdInt = await resolverEmpresaIdConsolidacion(expediente)
    } catch (err) {
      const msg = err?.message || MSJ_OPERACION_SIN_EMPRESA_ID
      return { ok: false, error: msg }
    }

    const servicios = await obtenerServiciosParaConsolidar(expedienteId)
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
        empresa_id: empresaIdInt,
        proveedor_id: provId ?? null,
        tipo_servicio: String(tipoServicio).trim() || 'Otros',
        coste_total: costeTotal,
        año_ejercicio: añoEjercicio,
      })
    }

    if (filas.length === 0) return { ok: true }

    const { error: insError } = await supabase.from('gastos_consolidados').insert(filas)
    if (insError) {
      const msg = String(insError?.message || '')
      if (/row-level security|rls|permission denied/i.test(msg) || String(insError?.code || '') === '42501') {
        return { ok: false, error: 'RLS bloqueó INSERT en gastos_consolidados. Verifica política INSERT y asignación de empresa_id en BD.' }
      }
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
