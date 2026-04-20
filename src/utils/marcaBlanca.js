/** Marca por defecto cuando no hay sesión ni dato en BD. */
export const NOMBRE_APP_DEFAULT = 'Flowtrix'

/**
 * Actualiza título del documento y favicon (profesional, sin flash de marca antigua).
 * @param {string} [nombreApp]
 * @param {string|null|undefined} [faviconUrl] URL absoluta o relativa; vacío → /flowtrix-icon.svg
 */
export function aplicarMarcaDocumento(nombreApp, faviconUrl) {
  const name = (nombreApp && String(nombreApp).trim()) || NOMBRE_APP_DEFAULT
  document.title = `${name} — ERP`

  let link = document.querySelector("link[rel='icon']")
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  const href = faviconUrl && String(faviconUrl).trim() ? String(faviconUrl).trim() : '/flowtrix-icon.svg'
  link.href = href
  link.type = href.toLowerCase().endsWith('.png') ? 'image/png' : 'image/svg+xml'

  const apple = document.querySelector("link[rel='apple-touch-icon']")
  if (apple && href) apple.href = href
}
