/**
 * Carga los datos fiscales/contacto de la empresa actual para usar como emisor en PDFs.
 *
 * Campos mínimos usados:
 *   nombre_comercial → nombre
 *   cif              → cif
 *   logo_url         → logo_url (imagen de cabecera)
 *
 * Si la BD no devuelve datos, se retorna DATOS_EMISOR (Tabora) como fallback.
 */
import { supabase } from '../supabase'
import { DATOS_EMISOR } from '../config/empresa'

const parseStoragePublicUrl = (url) => {
  const value = String(url || '').trim()
  if (!value) return null
  const marker = '/storage/v1/object/public/'
  const idx = value.indexOf(marker)
  if (idx < 0) return null
  const rest = value.slice(idx + marker.length)
  const [bucket, ...pathParts] = rest.split('?')[0].split('/').filter(Boolean)
  const path = pathParts.join('/')
  if (!bucket || !path) return null
  return { bucket, path }
}

const resolverLogoAccesible = async (logoUrl) => {
  const raw = String(logoUrl || '').trim()
  if (!raw) return null
  const parsed = parseStoragePublicUrl(raw)
  if (!parsed) return raw
  const { data: signedData, error: signedErr } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, 60 * 60)
  if (!signedErr && signedData?.signedUrl) return signedData.signedUrl
  return raw
}

/**
 * @param {number|null} empresaId
 * @returns {Promise<Object>}  Objeto compatible con DATOS_EMISOR + logo_url
 */
export const cargarDatosEmisorEmpresa = async (empresaId) => {
  if (!empresaId || Number(empresaId) <= 0) return { ...DATOS_EMISOR, logo_url: null }

  try {
    const { data } = await supabase
      .from('empresas')
      .select('id, nombre_comercial, cif, logo_url')
      .eq('id', Number(empresaId))
      .maybeSingle()

    if (!data) return { ...DATOS_EMISOR, logo_url: null }

    const logoAccesible = await resolverLogoAccesible(data.logo_url)

    return {
      nombre:    data.nombre_comercial || DATOS_EMISOR.nombre,
      cif:       data.cif || DATOS_EMISOR.cif,
      licencia:  '',
      direccion: DATOS_EMISOR.direccion || '',
      email:     DATOS_EMISOR.email || '',
      banco1:    '',
      banco2:    '',
      logo_url:  logoAccesible || null,
    }
  } catch (_) {
    return { ...DATOS_EMISOR, logo_url: null }
  }
}

/**
 * Helper sincrónico para cargar logo en un <Image> de jsPDF.
 * Llama a crearDocumento(logoImg) o crearDocumento(null) si falla o no hay URL.
 */
export const cargarLogoParaPDF = (logoSrc, crearDocumento) => {
  if (!logoSrc) {
    crearDocumento(null)
    return
  }
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = logoSrc
  img.onload  = () => crearDocumento(img)
  img.onerror = () => crearDocumento(null)
}
