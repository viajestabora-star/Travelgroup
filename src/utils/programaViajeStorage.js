/** Bucket privado: rutas aisladas por tenant `{empresa_id}/{expediente_id}/programa.pdf`. */
export const BUCKET_PROGRAMAS_VIAJE = 'programas'

const SIGNED_URL_TTL_SEG = 3600 // 1 h

/**
 * Ruta canónica del objeto dentro del bucket (sin prefijo de bucket).
 * @param {number|string} empresaId
 * @param {string} expedienteId UUID o id del expediente
 */
export function rutaStorageProgramaViaje(empresaId, expedienteId) {
  const e = Number(empresaId)
  const x = String(expedienteId ?? '').trim()
  if (!Number.isFinite(e) || e <= 0 || !x) return null
  return `${e}/${x}/programa.pdf`
}

/**
 * Comprueba que la ruta pertenezca al tenant y expediente indicados (evita path traversal).
 */
export function rutaProgramaValidaParaTenant(storagePath, empresaId, expedienteId) {
  const esperada = rutaStorageProgramaViaje(empresaId, expedienteId)
  const p = String(storagePath || '').trim().replace(/^\/+/, '')
  return esperada != null && p === esperada
}

/**
 * Si en BD hay una URL pública antigua, extrae la ruta relativa al bucket `programas`.
 * @returns {string|null}
 */
export function resolverRutaProgramaDesdeValorAlmacenado(valor) {
  const raw = String(valor ?? '').trim()
  if (!raw) return null
  if (!/^https?:\/\//i.test(raw)) {
    return raw.replace(/^\/+/, '')
  }
  const m = raw.match(/\/storage\/v1\/object\/(?:public|sign)\/programas\/(.+?)(?:\?|$)/i)
  if (m && m[1]) return decodeURIComponent(m[1].replace(/^\/+/, ''))
  const idx = raw.indexOf('/programas/')
  if (idx >= 0) {
    const rest = raw.slice(idx + '/programas/'.length)
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
 * Ruta segura para leer el PDF: solo la canónica `{empresa_id}/{expediente_id}/programa.pdf`
 * si el valor en BD indica que existe programa (no vacío) y coincide con la canónica o resuelve a ella.
 */
export function resolverRutaProgramaSeguraParaLectura(empresaId, expedienteId, valorBd) {
  const canon = rutaStorageProgramaViaje(empresaId, expedienteId)
  const raw = String(valorBd ?? '').trim()
  if (!raw || !canon) return null
  const resolved = resolverRutaProgramaDesdeValorAlmacenado(raw) || (!/^https?:\/\//i.test(raw) ? raw.replace(/^\/+/, '') : null)
  if (resolved === canon || raw === canon) return canon
  return null
}
