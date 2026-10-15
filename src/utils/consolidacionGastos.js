/**
 * Consolidación de gastos al cambiar estado a Finalizado/Cerrado (y al guardar la cotización
 * si el expediente ya tiene filas consolidadas).
 * - Detecta servicios sin proveedor para permitir aviso previo en UI.
 * - Calcula primero las filas nuevas; solo si el cálculo es válido, DELETE + INSERT.
 * - Coste por servicio: regla de Cotización (calcularCosteCotizadoVisible) con los pax de la variante.
 * - Inserta también servicios sin proveedor (proveedor_id null).
 */

import { supabase } from '../supabase'
import { calcularCosteCotizadoVisible } from '../lib/serviciosCotizacionAdapter'
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

/**
 * Normaliza fila de servicio (tabla relacional) al shape del validador.
 * costeCotizado: regla de Cotización sobre la fila de BD, con los pax totales de la variante.
 */
const normalizarServicioParaConsolidacion = (r, paxTotal) => {
  const provId = r.proveedor_id_int ?? r.proveedor_id ?? r.proveedorId
  return {
    ...r,
    proveedor_id: r.proveedor_id ?? provId,
    proveedorId: r.proveedorId ?? provId,
    proveedor_id_int: r.proveedor_id_int ?? provId,
    tipo_servicio: r.tipo_servicio ?? r.tipo,
    costeCotizado: calcularCosteCotizadoVisible(r, null, paxTotal),
  }
}

/**
 * Recoge servicios para validar/consolidar desde servicios_cotizacion.
 * Multicotización: solo la variante confirmada; sin confirmada, solo si no hay varias variantes.
 * @returns {Promise<{ ok: boolean, servicios?: object[], error?: string }>}
 */
const obtenerServiciosParaConsolidar = async (expedienteId) => {
  const idExp = String(expedienteId).trim()

  const { data: versiones, error: versionesError } = await supabase
    .from('versiones_cotizacion')
    .select('id, confirmada, total_pax')
    .eq('id_expediente', idExp)
  if (versionesError) {
    return { ok: false, error: versionesError?.message || 'Error al leer las variantes de cotización' }
  }

  const { data: expPax, error: expPaxError } = await supabase
    .from('expedientes')
    .select('total_pax')
    .eq('id', idExp)
    .single()
  if (expPaxError) {
    return { ok: false, error: expPaxError?.message || 'Error al leer los pasajeros del expediente' }
  }

  const { data, error: serviciosError } = await supabase
    .from('servicios_cotizacion')
    .select('*')
    .eq('id_expediente', idExp)
    .neq('id', SERVICIO_ANOMALO_ID)
  if (serviciosError) {
    return { ok: false, error: serviciosError?.message || 'Error al leer los servicios de cotización' }
  }

  const rows = Array.isArray(data) ? data : []
  const confirmadas = (Array.isArray(versiones) ? versiones : []).filter((v) => v?.confirmada === true)

  let seleccion = rows
  if (confirmadas.length > 1) {
    return { ok: false, error: 'Hay más de una variante confirmada. Deja solo la que se vendió antes de cerrar.' }
  }
  if (confirmadas.length === 1) {
    const idConfirmada = String(confirmadas[0].id)
    seleccion = rows.filter((r) => r.version_id != null && String(r.version_id) === idConfirmada)
    if (seleccion.length === 0) {
      // Legacy: servicios sin version_id (anteriores a multicotización) → todos.
      if (rows.every((r) => r.version_id == null)) {
        seleccion = rows
      } else {
        return { ok: false, error: 'La variante confirmada no tiene servicios.' }
      }
    }
  } else {
    const variantesConServicios = new Set(
      rows.filter((r) => r.version_id != null).map((r) => String(r.version_id))
    )
    if (variantesConServicios.size > 1) {
      return { ok: false, error: 'Este expediente tiene varias variantes. Confirma la variante vendida antes de consolidar los gastos.' }
    }
  }

  // Pax como en Cotización: cabecera de la variante si se guardó (total_pax > 0); si no, la del expediente.
  const listaVersiones = Array.isArray(versiones) ? versiones : []
  const idsVariante = new Set(seleccion.filter((r) => r.version_id != null).map((r) => String(r.version_id)))
  const variante =
    confirmadas[0] ||
    (idsVariante.size === 1 ? listaVersiones.find((v) => idsVariante.has(String(v.id))) : null) ||
    (listaVersiones.length === 1 ? listaVersiones[0] : null)
  const paxTotal = toNumSafe(variante?.total_pax) > 0
    ? toNumSafe(variante.total_pax)
    : (toNumSafe(expPax?.total_pax) || 1)

  return { ok: true, servicios: seleccion.map((r) => normalizarServicioParaConsolidacion(r, paxTotal)) }
}

/**
 * Detecta servicios sin proveedor para aviso no bloqueante.
 * @returns { { ok: boolean, bloqueante?: boolean, warning?: string, detalle?: string } }
 */
export const validarProveedoresServicios = async (expedienteId) => {
  const resultado = await obtenerServiciosParaConsolidar(expedienteId)
  if (!resultado.ok) {
    return { ok: false, bloqueante: true, warning: resultado.error }
  }
  const servicios = resultado.servicios
  const conDatos = servicios.filter((s) => {
    const coste = toNumSafe(s.costeCotizado)
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
 * Ejecuta consolidación: calcula filas → DELETE + INSERT (INSERT solo si debeConsolidar).
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

    // Leer antes de borrar: si la lectura falla o es ambigua, no se toca gastos_consolidados.
    let empresaIdInt
    let servicios = []
    if (debeConsolidar) {
      try {
        empresaIdInt = await resolverEmpresaIdConsolidacion(expediente)
      } catch (err) {
        const msg = err?.message || MSJ_OPERACION_SIN_EMPRESA_ID
        return { ok: false, error: msg }
      }

      const resultado = await obtenerServiciosParaConsolidar(expedienteId)
      if (!resultado.ok) return { ok: false, error: resultado.error }
      servicios = resultado.servicios
    }

    // Calcular las filas nuevas antes de borrar: si el cálculo falla, gastos_consolidados no se toca.
    const añoEjercicio = extraerAñoEjercicio(expediente?.numero_expediente)
    const filas = []
    for (const s of servicios) {
      const provId = obtenerProveedorIdValido(s)
      const costeTotal = s.costeCotizado
      if (typeof costeTotal !== 'number' || !Number.isFinite(costeTotal)) {
        const nombre = s.nombre_especifico || s.tipo_servicio || s.tipo || 'Servicio'
        return { ok: false, error: `No se pudo calcular el coste de «${nombre}». No se han modificado los gastos consolidados.` }
      }
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

/**
 * Re-consolida al guardar la cotización si el expediente ya tiene filas en gastos_consolidados
 * (Finalizado/Cerrado), para que no queden importes de una versión anterior de la cotización.
 * @returns {Promise<{ ok: boolean, reconsolidado?: boolean, error?: string }>}
 */
export const reconsolidarGastosSiExisten = async (expedienteId, expediente) => {
  if (!expedienteId) return { ok: true, reconsolidado: false }
  const { count, error } = await supabase
    .from('gastos_consolidados')
    .select('id', { count: 'exact', head: true })
    .eq('expediente_id', expedienteId)
  if (error) return { ok: false, error: error?.message || 'Error al leer gastos consolidados' }
  if (!count) return { ok: true, reconsolidado: false }
  const cons = await consolidarGastosExpediente(expedienteId, expediente, true)
  return cons.ok ? { ok: true, reconsolidado: true } : cons
}
