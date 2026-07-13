import { supabase } from '../supabase'

/** Bucket vigente para nuevas subidas de facturas de proveedor. */
export const BUCKET_FACTURAS_ACTIVO = 'facturas'

/** Bucket legado: solo lectura/borrado de documentos antiguos (no usar para escritura nueva). */
const BUCKET_FACTURAS_PROVEEDORES = 'facturas_proveedores'

const BUCKETS_CONOCIDOS = [BUCKET_FACTURAS_PROVEEDORES, BUCKET_FACTURAS_ACTIVO]

/**
 * Quita comillas JSON/espacios y el prefijo duplicado `bucket/` en rutas guardadas.
 */
const normalizarRutaInternaBucket = (rutaCruda, bucketId) => {
  let p = String(rutaCruda || '')
    .trim()
    .replace(/^["']|["']$/g, '')
  if (!p) return null
  const pref = `${bucketId}/`
  if (p.startsWith(pref)) p = p.slice(pref.length)
  return p.replace(/^\/+/, '') || null
}

const extraerDesdeMarcadoresUrl = (trimmed, tipoObjeto) => {
  for (const bucket of BUCKETS_CONOCIDOS) {
    const marcadores = [
      `/object/${tipoObjeto}/${bucket}/`,
      `/storage/v1/object/${tipoObjeto}/${bucket}/`,
    ]
    for (const marker of marcadores) {
      const idx = trimmed.indexOf(marker)
      if (idx < 0) continue
      let path = trimmed.slice(idx + marker.length).split('?')[0]
      try {
        path = decodeURIComponent(path)
      } catch (_) {}
      const pathNorm = normalizarRutaInternaBucket(path, bucket)
      if (pathNorm) return { bucket, path: pathNorm }
    }
  }
  return null
}

const esRutaLegadaFacturasProveedores = (rutaRelativa) => {
  const p = String(rutaRelativa || '').replace(/^\/+/, '')
  if (!p) return false
  if (/^fac-\d+\.pdf$/i.test(p)) return true
  if (/^\d+\/fac-\d+\.pdf$/i.test(p)) return true
  return false
}

const esRutaConvencionFacturasActivo = (rutaRelativa) => {
  const p = String(rutaRelativa || '').replace(/^\/+/, '')
  if (!p) return false
  // Convención vigente: {empresa_id}/{expediente_uuid}/…
  return /^\d+\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\//i.test(p)
}

/**
 * Determina de forma determinista bucket + ruta interna a partir del valor guardado en BD.
 * @returns {{ bucket: string, path: string } | null}
 */
export const resolverUbicacionStorageFacturaProveedor = (valorGuardado) => {
  if (!valorGuardado || typeof valorGuardado !== 'string') return null
  const trimmed = valorGuardado.trim().replace(/^["']|["']$/g, '')
  if (!trimmed) return null

  const desdePublic = extraerDesdeMarcadoresUrl(trimmed, 'public')
  if (desdePublic) return desdePublic

  const desdeSign = extraerDesdeMarcadoresUrl(trimmed, 'sign')
  if (desdeSign) return desdeSign

  if (/^https?:\/\//i.test(trimmed)) return null

  let rutaRel = trimmed.replace(/^\/+/, '')

  // Histórico Flujo A: prefijo redundante facturas/ dentro del bucket facturas
  if (rutaRel.startsWith(`${BUCKET_FACTURAS_ACTIVO}/`)) {
    rutaRel = rutaRel.slice(BUCKET_FACTURAS_ACTIVO.length + 1)
    const pathNorm = normalizarRutaInternaBucket(rutaRel, BUCKET_FACTURAS_ACTIVO)
    if (pathNorm) return { bucket: BUCKET_FACTURAS_ACTIVO, path: pathNorm }
  }

  if (esRutaConvencionFacturasActivo(rutaRel)) {
    const pathNorm = normalizarRutaInternaBucket(rutaRel, BUCKET_FACTURAS_ACTIVO)
    if (pathNorm) return { bucket: BUCKET_FACTURAS_ACTIVO, path: pathNorm }
  }

  if (esRutaLegadaFacturasProveedores(rutaRel)) {
    const pathNorm = normalizarRutaInternaBucket(rutaRel, BUCKET_FACTURAS_PROVEEDORES)
    if (pathNorm) return { bucket: BUCKET_FACTURAS_PROVEEDORES, path: pathNorm }
  }

  const pathLegado = normalizarRutaInternaBucket(rutaRel, BUCKET_FACTURAS_PROVEEDORES)
  if (pathLegado) return { bucket: BUCKET_FACTURAS_PROVEEDORES, path: pathLegado }

  return null
}

/**
 * Extrae la ruta del objeto dentro del bucket (sin identificar bucket).
 * Preferir resolverUbicacionStorageFacturaProveedor cuando se necesite borrar o descargar.
 */
export const extraerRutaObjectoFacturaProveedor = (urlPdf) => {
  const ubicacion = resolverUbicacionStorageFacturaProveedor(urlPdf)
  return ubicacion?.path ?? null
}

/**
 * Convención vigente de subida: `{empresa_id}/{expediente_id}/{nombre}.pdf` en bucket `facturas`.
 * - Cierre (servicioId): `{servicio_id}.pdf`, upsert true
 * - Pagos (sin servicioId): `{timestamp}_factura.pdf`, upsert false
 */
export const subirPdfFacturaProveedor = async (file, { empresaId, expedienteId, servicioId = null } = {}) => {
  if (!file) return null
  const eid = String(empresaId ?? '').trim()
  const expId = String(expedienteId ?? '').trim()
  if (!eid || !expId) {
    throw new Error('empresa_id o expediente_id no disponibles para subir el PDF.')
  }

  const sid = servicioId != null ? String(servicioId).trim() : ''
  const ruta = sid
    ? `${eid}/${expId}/${sid}.pdf`
    : `${eid}/${expId}/${Date.now()}_factura.pdf`
  const upsert = Boolean(sid)

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET_FACTURAS_ACTIVO)
    .upload(ruta, file, { upsert, contentType: 'application/pdf' })
  if (uploadErr) {
    throw new Error(`No se pudo subir el PDF al bucket '${BUCKET_FACTURAS_ACTIVO}': ${uploadErr.message}`)
  }

  const { data: urlData } = supabase.storage.from(BUCKET_FACTURAS_ACTIVO).getPublicUrl(ruta)
  const publicUrl = urlData?.publicUrl || null
  if (!publicUrl) throw new Error('PDF subido pero no se pudo obtener la URL pública.')
  return publicUrl
}

/**
 * URL lista para fetch, window.open o <a href>.
 * Soporta bucket vigente `facturas`, legado `facturas_proveedores`, URL firmada y https externa.
 */
export const resolverUrlPublicaFacturaProveedor = (valorGuardado) => {
  if (!valorGuardado || typeof valorGuardado !== 'string') return null
  const trimmed = valorGuardado.trim().replace(/^["']|["']$/g, '')
  if (!trimmed) return null

  if (
    /^https?:\/\//i.test(trimmed) &&
    BUCKETS_CONOCIDOS.some((b) => trimmed.includes(`/object/sign/${b}/`))
  ) {
    return trimmed
  }

  const ubicacion = resolverUbicacionStorageFacturaProveedor(trimmed)
  if (ubicacion?.path) {
    const { data } = supabase.storage.from(ubicacion.bucket).getPublicUrl(ubicacion.path)
    return data?.publicUrl || null
  }

  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return null
}

/**
 * Descarga el PDF usando la API de Storage (útil si la URL pública devuelve 400/403 por RLS o path raro).
 * @returns {Promise<ArrayBuffer|null>}
 */
export const descargarArrayBufferFacturaProveedor = async (valorGuardado) => {
  if (!valorGuardado || typeof valorGuardado !== 'string') return null
  const ubicacion = resolverUbicacionStorageFacturaProveedor(valorGuardado)
  if (!ubicacion?.path) return null
  try {
    const { data, error } = await supabase.storage.from(ubicacion.bucket).download(ubicacion.path)
    if (error || !data) return null
    return await data.arrayBuffer()
  } catch {
    return null
  }
}

export const abrirFacturaProveedorPorUrlGuardada = (valorGuardado) => {
  const publicUrl = resolverUrlPublicaFacturaProveedor(valorGuardado)
  if (publicUrl) {
    window.open(publicUrl, '_blank', 'noopener,noreferrer')
    return
  }
  const t = String(valorGuardado || '').trim()
  if (/^https?:\/\//i.test(t)) window.open(t, '_blank', 'noopener,noreferrer')
}

/** Borra del bucket determinado por la URL guardada (un solo bucket, sin best-effort). */
export const eliminarObjetoStorageFacturaProveedor = async (urlPdf) => {
  const ubicacion = resolverUbicacionStorageFacturaProveedor(urlPdf)
  if (!ubicacion?.path) return { ok: true }
  const { error } = await supabase.storage.from(ubicacion.bucket).remove([ubicacion.path])
  if (error) return { ok: false, error }
  return { ok: true }
}
