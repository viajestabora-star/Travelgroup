/**
 * Carga los datos fiscales/contacto de la empresa actual para usar como emisor en PDFs.
 *
 * Prioridad de campos:
 *   saas_razon_social || nombre_comercial → nombre
 *   saas_nif          || cif             → cif
 *   saas_direccion                       → direccion
 *   saas_email        || email           → email
 *   logo_url                             → logo_url (imagen de cabecera)
 *
 * Si la BD no devuelve datos, se retorna DATOS_EMISOR (Tabora) como fallback.
 */
import { supabase } from '../supabase'
import { DATOS_EMISOR } from '../config/empresa'

/**
 * @param {number|null} empresaId
 * @returns {Promise<Object>}  Objeto compatible con DATOS_EMISOR + logo_url
 */
export const cargarDatosEmisorEmpresa = async (empresaId) => {
  if (!empresaId || Number(empresaId) <= 0) return { ...DATOS_EMISOR, logo_url: null }

  try {
    const { data } = await supabase
      .from('empresas')
      .select('nombre_comercial, cif, saas_razon_social, saas_nif, saas_direccion, saas_email, logo_url')
      .eq('id', Number(empresaId))
      .maybeSingle()

    if (!data) return { ...DATOS_EMISOR, logo_url: null }

    return {
      nombre:    data.saas_razon_social || data.nombre_comercial || DATOS_EMISOR.nombre,
      cif:       data.saas_nif          || data.cif              || DATOS_EMISOR.cif,
      licencia:  '',
      direccion: data.saas_direccion    || '',
      email:     data.saas_email        || '',
      banco1:    '',
      banco2:    '',
      logo_url:  data.logo_url          || null,
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
