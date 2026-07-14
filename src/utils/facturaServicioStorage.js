import { supabase } from '../supabase'

/** Bucket vigente para nuevas facturas por servicio (microhito 3B). */
export const BUCKET_FACTURAS_SERVICIO = 'facturas'

/**
 * UUID v4: crypto.randomUUID si existe; si no, mismo algoritmo que ExpedienteDetalle/ServiciosCotizacionPanel.
 */
export const generarUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Ruta determinista en Storage: `{empresaId}/{expedienteId}/{servicioId}/{facturaId}.pdf`
 */
export const buildStoragePathFacturaServicio = (empresaId, expedienteId, servicioId, facturaId) => {
  const eid = String(empresaId ?? '').trim()
  const expId = String(expedienteId ?? '').trim()
  const sid = String(servicioId ?? '').trim()
  const fid = String(facturaId ?? '').trim()
  if (!eid || !expId || !sid || !fid) {
    throw new Error('empresaId, expedienteId, servicioId y facturaId son obligatorios para la ruta Storage.')
  }
  return `${eid}/${expId}/${sid}/${fid}.pdf`
}

/**
 * Sube PDF y persiste fila en facturas_servicio.
 * No conectado a UI en 3B — helper preparatorio para 3C+.
 *
 * @returns {Promise<{ id: string, bucket: string, storagePath: string }>}
 */
export const subirFacturaServicio = async (file, { empresaId, expedienteId, servicioId } = {}) => {
  if (!file) {
    throw new Error('No se proporcionó archivo PDF.')
  }

  const eid = Number(empresaId)
  if (!Number.isFinite(eid) || eid <= 0) {
    throw new Error('empresa_id no válido para subir la factura del servicio.')
  }

  const expId = String(expedienteId ?? '').trim()
  const sid = String(servicioId ?? '').trim()
  if (!expId || !sid) {
    throw new Error('expediente_id o servicio_id no disponibles para subir la factura.')
  }

  const facturaId = generarUUID()
  const storagePath = buildStoragePathFacturaServicio(eid, expId, sid, facturaId)

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET_FACTURAS_SERVICIO)
    .upload(storagePath, file, { upsert: false, contentType: 'application/pdf' })

  if (uploadErr) {
    throw new Error(
      `No se pudo subir el PDF al bucket '${BUCKET_FACTURAS_SERVICIO}': ${uploadErr.message}`
    )
  }

  const nombreArchivo = file.name ? String(file.name).trim() || null : null

  const { data: inserted, error: insertErr } = await supabase
    .from('facturas_servicio')
    .insert([
      {
        id: facturaId,
        empresa_id: Math.trunc(eid),
        expediente_id: expId,
        servicio_id: sid,
        bucket: BUCKET_FACTURAS_SERVICIO,
        storage_path: storagePath,
        nombre_archivo: nombreArchivo,
      },
    ])
    .select('id')
    .single()

  if (insertErr) {
    const { error: rollbackErr } = await supabase.storage
      .from(BUCKET_FACTURAS_SERVICIO)
      .remove([storagePath])

    const dbMsg = insertErr.message || String(insertErr)
    if (rollbackErr) {
      throw new Error(
        `Error al insertar en facturas_servicio: ${dbMsg}. ` +
          `Rollback Storage también falló (${rollbackErr.message || String(rollbackErr)}); ` +
          `puede quedar objeto huérfano en '${BUCKET_FACTURAS_SERVICIO}/${storagePath}'.`
      )
    }
    throw new Error(`Error al insertar en facturas_servicio: ${dbMsg}`)
  }

  if (!inserted?.id) {
    throw new Error('Insert en facturas_servicio no devolvió id.')
  }

  return {
    id: inserted.id,
    bucket: BUCKET_FACTURAS_SERVICIO,
    storagePath,
  }
}
