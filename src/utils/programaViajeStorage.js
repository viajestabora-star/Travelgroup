/** Bucket privado Supabase: nombre exacto `Programas`. Rutas `{empresa_id}/{expediente_id}/itinerario.pdf`. */
export const BUCKET_PROGRAMAS_VIAJE = 'Programas'

const SIGNED_URL_TTL_SEG = 3600 // 1 h

const NOMBRE_ARCHIVO = 'itinerario.pdf'
/** Compatibilidad con subidas anteriores al mismo prefijo de carpeta. */
const NOMBRE_ARCHIVO_LEGACY = 'programa.pdf'

/**
 * Ruta canónica del itinerario dentro del bucket (sin barra inicial).
 * @param {number|string} empresaId
 * @param {string} expedienteId UUID o id del expediente
 */
export function rutaStorageProgramaViaje(empresaId, expedienteId) {
  const e = Number(empresaId)
  const x = String(expedienteId ?? '').trim()
  if (!Number.isFinite(e) || e <= 0 || !x) return null
  return `${e}/${x}/${NOMBRE_ARCHIVO}`
}

export function rutaStorageProgramaLegacy(empresaId, expedienteId) {
  const e = Number(empresaId)
  const x = String(expedienteId ?? '').trim()
  if (!Number.isFinite(e) || e <= 0 || !x) return null
  return `${e}/${x}/${NOMBRE_ARCHIVO_LEGACY}`
}

/**
 * Comprueba que la ruta pertenezca al tenant y expediente indicados (evita path traversal).
 */
export function rutaProgramaValidaParaTenant(storagePath, empresaId, expedienteId) {
  const p = String(storagePath || '').trim().replace(/^\/+/, '')
  const okItin = rutaStorageProgramaViaje(empresaId, expedienteId)
  const okLeg = rutaStorageProgramaLegacy(empresaId, expedienteId)
  return (okItin != null && p === okItin) || (okLeg != null && p === okLeg)
}

/**
 * Si en BD hay una URL antigua, extrae la ruta relativa al bucket `Programas` (mayúscula) o `programas`.
 * @returns {string|null}
 */
export function resolverRutaProgramaDesdeValorAlmacenado(valor) {
  const raw = String(valor ?? '').trim()
  if (!raw) return null
  if (!/^https?:\/\//i.test(raw)) {
    return raw.replace(/^\/+/, '')
  }
  const m = raw.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/i)
  if (m && m[1] && m[2] && String(m[1]).toLowerCase() === 'programas') {
    return decodeURIComponent(String(m[2]).replace(/^\/+/, ''))
  }
  const lower = raw.toLowerCase()
  const needlePub = '/object/public/programas/'
  const needleSign = '/object/sign/programas/'
  let idx = lower.indexOf(needlePub)
  let prefixLen = needlePub.length
  if (idx < 0) {
    idx = lower.indexOf(needleSign)
    prefixLen = needleSign.length
  }
  if (idx >= 0) {
    const rest = raw.slice(idx + prefixLen)
    return rest.split('?')[0].replace(/^\/+/, '')
  }
  return null
}

/**
 * URL firmada para visualizar el PDF (bucket privado).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function crearSignedUrlProgramaViaje(supabase, storagePath) {
  const path = String(storagePath || '').trim().replace(/^\/+/, '')
  if (!path) return { url: null, error: new Error('Ruta de programa vacía') }
  const { data, error } = await supabase.storage
    .from(BUCKET_PROGRAMAS_VIAJE)
    .createSignedUrl(path, SIGNED_URL_TTL_SEG)
  if (error) return { url: null, error }
  const url = data?.signedUrl ? String(data.signedUrl).trim() : null
  if (!url) return { url: null, error: new Error('No se obtuvo signedUrl') }
  return { url, error: null }
}

/**
 * Ruta segura para leer: solo `{empresa_id}/{expediente_id}/itinerario.pdf` o legacy `programa.pdf` en esa carpeta.
 */
export function resolverRutaProgramaSeguraParaLectura(empresaId, expedienteId, valorBd) {
  const canonItin = rutaStorageProgramaViaje(empresaId, expedienteId)
  const canonLeg = rutaStorageProgramaLegacy(empresaId, expedienteId)
  const raw = String(valorBd ?? '').trim()
  if (!raw || !canonItin) return null
  const normalized = raw.replace(/^\/+/, '')
  if (normalized === canonItin || normalized === canonLeg) return normalized
  const resolved = resolverRutaProgramaDesdeValorAlmacenado(raw) || (!/^https?:\/\//i.test(raw) ? normalized : null)
  if (resolved === canonItin || resolved === canonLeg) return resolved
  return null
}
