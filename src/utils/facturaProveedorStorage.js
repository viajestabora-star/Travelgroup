import { supabase } from '../supabase'

const BUCKET_FACTURAS_PROVEEDORES = 'facturas_proveedores'

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

/**
 * Extrae la ruta del objeto dentro del bucket a partir de URL pública, firmada o ruta suelta.
 * Devuelve null si no se puede interpretar como objeto de este bucket.
 */
export const extraerRutaObjectoFacturaProveedor = (urlPdf) => {
  if (!urlPdf || typeof urlPdf !== 'string') return null
  const trimmed = urlPdf.trim().replace(/^["']|["']$/g, '')

  const marcadoresPublicos = [
    `/object/public/${BUCKET_FACTURAS_PROVEEDORES}/`,
    `/storage/v1/object/public/${BUCKET_FACTURAS_PROVEEDORES}/`,
  ]

  for (const marker of marcadoresPublicos) {
    const idx = trimmed.indexOf(marker)
    if (idx >= 0) {
      let path = trimmed.slice(idx + marker.length).split('?')[0]
      try {
        path = decodeURIComponent(path)
      } catch (_) {}
      return normalizarRutaInternaBucket(path, BUCKET_FACTURAS_PROVEEDORES)
    }
  }

  // URL firmada: devolver null aquí; resolverUrlPublicaFacturaProveedor devolverá la URL completa (incl. token).
  if (trimmed.includes(`/object/sign/${BUCKET_FACTURAS_PROVEEDORES}/`) && /^https?:\/\//i.test(trimmed)) {
    return null
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return normalizarRutaInternaBucket(trimmed, BUCKET_FACTURAS_PROVEEDORES)
  }

  return null
}

/**
 * URL lista para fetch, window.open o <a href>.
 * Soporta: ruta `fac-….pdf`, URL pública Supabase, URL firmada, https externa.
 */
export const resolverUrlPublicaFacturaProveedor = (valorGuardado) => {
  if (!valorGuardado || typeof valorGuardado !== 'string') return null
  const trimmed = valorGuardado.trim().replace(/^["']|["']$/g, '')

  // URL firmada del bucket: usar tal cual (el token va en la query).
  if (
    /^https?:\/\//i.test(trimmed) &&
    trimmed.includes(`/object/sign/${BUCKET_FACTURAS_PROVEEDORES}/`)
  ) {
    return trimmed
  }

  const rutaExtraida = extraerRutaObjectoFacturaProveedor(trimmed)
  const nombreUnico =
    rutaExtraida ||
    (!/^https?:\/\//i.test(trimmed) ? normalizarRutaInternaBucket(trimmed, BUCKET_FACTURAS_PROVEEDORES) : null)

  if (nombreUnico && !/^https?:\/\//i.test(nombreUnico)) {
    const { data } = supabase.storage.from(BUCKET_FACTURAS_PROVEEDORES).getPublicUrl(nombreUnico)
    const publicUrl = data?.publicUrl
    return publicUrl || null
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
  const path = extraerRutaObjectoFacturaProveedor(valorGuardado)
  const pathNorm =
    path ||
    (!/^https?:\/\//i.test(valorGuardado.trim())
      ? normalizarRutaInternaBucket(valorGuardado, BUCKET_FACTURAS_PROVEEDORES)
      : null)
  if (!pathNorm) return null
  try {
    const { data, error } = await supabase.storage.from(BUCKET_FACTURAS_PROVEEDORES).download(pathNorm)
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

export const eliminarObjetoStorageFacturaProveedor = async (urlPdf) => {
  const path = extraerRutaObjectoFacturaProveedor(urlPdf)
  if (!path) return { ok: true }
  const { error } = await supabase.storage.from(BUCKET_FACTURAS_PROVEEDORES).remove([path])
  if (error) return { ok: false, error }
  return { ok: true }
}
