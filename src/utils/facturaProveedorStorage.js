import { supabase } from '../supabase'

const BUCKET_FACTURAS_PROVEEDORES = 'facturas_proveedores'

/** Ruta relativa del objeto dentro del bucket (p. ej. para getPublicUrl). */
export const extraerRutaObjectoFacturaProveedor = (urlPdf) => {
  if (!urlPdf || typeof urlPdf !== 'string') return null
  const trimmed = urlPdf.trim()
  const marker = `/object/public/${BUCKET_FACTURAS_PROVEEDORES}/`
  const idx = trimmed.indexOf(marker)
  if (idx >= 0) {
    let path = trimmed.slice(idx + marker.length).split('?')[0]
    try {
      path = decodeURIComponent(path)
    } catch (_) {}
    return path
  }
  if (!/^https?:\/\//i.test(trimmed)) return trimmed.replace(/^\/+/, '')
  return null
}

/** URL pública lista para fetch o <a href>; null si no hay PDF utilizable. */
export const resolverUrlPublicaFacturaProveedor = (valorGuardado) => {
  if (!valorGuardado || typeof valorGuardado !== 'string') return null
  const nombreUnico =
    extraerRutaObjectoFacturaProveedor(valorGuardado) || valorGuardado.replace(/^\/+/, '').trim()
  if (nombreUnico && !/^https?:\/\//i.test(nombreUnico)) {
    const publicUrl = supabase.storage.from(BUCKET_FACTURAS_PROVEEDORES).getPublicUrl(nombreUnico).data
      ?.publicUrl
    return publicUrl || null
  }
  const t = valorGuardado.trim()
  return /^https?:\/\//i.test(t) ? t : null
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
