/**
 * Identificador de expediente para cotización / servicios_cotizacion.
 * Una sola fuente de verdad: fila `expediente`, coherencia con prop y (opcional) ruta.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function esUuidExpedienteId(value) {
  if (value == null) return false
  return UUID_RE.test(String(value).trim())
}

/**
 * @param {object} opts
 * @param {{ id?: string }|null|undefined} opts.expediente — Fila expediente abierta (prioridad con URL vacía).
 * @param {string|number|null|undefined} opts.expedienteIdProp — Prop explícita desde el padre (debe coincidir con `expediente.id`).
 * @param {string|null|undefined} opts.idDesdeRuta — `useParams().expedienteId` o `?expediente=`; si viene, debe alinear con la fila.
 * @returns {{ idExpediente: string|null, error: string|null }}
 */
export function resolverIdExpedienteFuenteVerdad({ expediente, expedienteIdProp, idDesdeRuta }) {
  const fromRow = expediente?.id != null ? String(expediente.id).trim() : ''
  const fromProp =
    expedienteIdProp != null && expedienteIdProp !== '' ? String(expedienteIdProp).trim() : ''
  const fromUrl = idDesdeRuta != null && String(idDesdeRuta).trim() !== '' ? String(idDesdeRuta).trim() : ''

  if (fromUrl) {
    if (!esUuidExpedienteId(fromUrl)) {
      return {
        idExpediente: null,
        error:
          'El expediente indicado en la URL no es un UUID válido. No se pueden cargar ni guardar servicios.',
      }
    }
    if (fromRow && fromRow !== fromUrl) {
      return {
        idExpediente: null,
        error:
          'El expediente de la URL no coincide con el expediente abierto. Cierra el modal y ábrelo de nuevo desde la lista.',
      }
    }
    if (fromProp && fromProp !== fromUrl) {
      return {
        idExpediente: null,
        error:
          'El identificador de cotización no coincide con la URL. Recarga o vuelve a abrir el expediente.',
      }
    }
  }

  if (fromRow && fromProp && fromRow !== fromProp) {
    return {
      idExpediente: null,
      error:
        'Conflicto: el expediente abierto no coincide con el id de cotización. Cierra y vuelve a abrir el expediente.',
    }
  }

  const chosen = fromUrl || fromRow || fromProp
  if (!chosen) {
    return { idExpediente: null, error: 'No hay expediente válido para vincular servicios.' }
  }
  if (!esUuidExpedienteId(chosen)) {
    return {
      idExpediente: null,
      error: 'El id del expediente no es un UUID válido. No se pueden guardar servicios en base de datos.',
    }
  }
  return { idExpediente: chosen, error: null }
}
