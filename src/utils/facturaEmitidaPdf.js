import { resolverUrlFacturaCliente } from './historialCierresShared'

/** Evento para que la pantalla maestra recargue sin F5 tras alta/baja en otro flujo. */
export const EVENTO_REFRESCO_FACTURAS_EMITIDAS = 'facturasEmitidasRefresh'

export function solicitarRefrescoFacturasEmitidas() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO_REFRESCO_FACTURAS_EMITIDAS))
  }
}

function urlsCandidatasDesdeFila(row) {
  const datos = row?.datos_factura && typeof row.datos_factura === 'object' ? row.datos_factura : {}
  const raw = [row?.url_pdf, datos.url_pdf, datos.pdf_url, datos.url_factura_pdf].filter(
    (x) => x != null && String(x).trim() !== '',
  )
  return raw.map((x) => String(x).trim())
}

/**
 * Intenta abrir el PDF de una fila de `facturas_emitidas`:
 * columnas / JSON interno → URLs resueltas → objeto en bucket `facturas` (`YYYY-XXX.pdf`).
 */
export async function abrirPdfFacturaEmitida(supabase, row) {
  for (const raw of urlsCandidatasDesdeFila(row)) {
    const resolved = resolverUrlFacturaCliente(raw)
    if (resolved) {
      window.open(resolved, '_blank', 'noopener,noreferrer')
      return true
    }
  }

  const num = String(row?.numero_factura ?? '').trim()
  if (!num) {
    window.alert('Esta factura no tiene número ni PDF asociado.')
    return false
  }

  const storagePaths = [`${num}.pdf`, `${num.replace(/-/g, '_')}.pdf`]

  for (const path of storagePaths) {
    const { data: blob, error } = await supabase.storage.from('facturas').download(path)
    if (!error && blob && blob.size > 0) {
      const u = URL.createObjectURL(blob)
      window.open(u, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(u), 120_000)
      return true
    }
  }

  const { data: carpetas, error: listErr } = await supabase.storage.from('facturas').list('', { limit: 300 })
  if (!listErr && Array.isArray(carpetas)) {
    for (const entry of carpetas) {
      const nombre = String(entry?.name ?? '')
      if (!nombre || nombre.includes('.')) continue
      const sub = `${nombre}/${num}.pdf`
      const { data: blob2, error: e2 } = await supabase.storage.from('facturas').download(sub)
      if (!e2 && blob2 && blob2.size > 0) {
        const u = URL.createObjectURL(blob2)
        window.open(u, '_blank', 'noopener,noreferrer')
        window.setTimeout(() => URL.revokeObjectURL(u), 120_000)
        return true
      }
    }
  }

  window.alert(
    'No se encontró PDF: ni URL en base de datos ni archivo en el bucket «facturas» con el nombre esperado (' +
      num +
      '.pdf).',
  )
  return false
}
