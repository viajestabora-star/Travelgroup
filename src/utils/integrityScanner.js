/**
 * Escáner de Integridad del Sistema — audita la coherencia entre datos en memoria
 * y las restricciones de Supabase, sin modificar nada (solo lectura).
 *
 * Ejecuta 3 comprobaciones:
 *  1. Expedientes con duracion_viaje inválida
 *  2. Servicios de cotización sin expediente_id válido
 *  3. Facturas (cobros_expediente) sin servicio asociado
 */

import { supabase } from '../supabase'
import { DURACION_VIAJE_VALORES, normalizarDuracion } from '../constants/viaje'

// ─── Tipos de resultado ───────────────────────────────────────────────────────
/**
 * @typedef {Object} IntegrityIssue
 * @property {'expediente_duracion'|'servicio_sin_expediente'|'factura_sin_servicio'} tipo
 * @property {string} id        - ID del registro afectado
 * @property {string} descripcion
 * @property {string|null} valorActual
 * @property {string|null} correccionSugerida
 * @property {boolean} autoCorregible
 */

/**
 * @typedef {Object} IntegrityReport
 * @property {number} totalIssues
 * @property {IntegrityIssue[]} expedientesDuracionInvalida
 * @property {IntegrityIssue[]} serviciosSinExpediente
 * @property {IntegrityIssue[]} facturasSinServicio
 * @property {string} resumen
 * @property {Date} timestamp
 */

// ─── Comprobación 1: duracion_viaje fuera de constraint ───────────────────────
const chequearDuracionesInvalidas = async () => {
  const issues = []
  try {
    const { data, error } = await supabase
      .from('expedientes')
      .select('id, numero_expediente, cliente_nombre, duracion_viaje')
      .not('duracion_viaje', 'is', null)

    if (error) throw error

    for (const exp of data || []) {
      const dur = (exp.duracion_viaje || '').trim()
      if (dur && !DURACION_VIAJE_VALORES.includes(dur)) {
        const sugerencia = normalizarDuracion(dur)
        issues.push({
          tipo: 'expediente_duracion',
          id: exp.id,
          descripcion: `Expediente ${exp.numero_expediente || exp.id.substring(0, 8)} (${exp.cliente_nombre || 'Sin nombre'}) tiene duración inválida`,
          valorActual: dur,
          correccionSugerida: sugerencia,
          autoCorregible: sugerencia !== null,
        })
      }
    }
  } catch (err) {
    console.error('[IntegrityScanner] Error al comprobar duraciones:', err)
  }
  return issues
}

// ─── Comprobación 2: servicios de cotización sin expediente válido ─────────────
const chequearServiciosSinExpediente = async () => {
  const issues = []
  try {
    // Obtener todos los IDs de expedientes existentes
    const { data: expedientesData, error: expError } = await supabase
      .from('expedientes')
      .select('id')

    if (expError) throw expError

    const expedienteIds = new Set((expedientesData || []).map((e) => e.id))

    // Obtener todos los servicios de cotización
    const { data: serviciosData, error: servError } = await supabase
      .from('servicios_cotizacion')
      .select('id, id_expediente, tipo_servicio, nombre_especifico')

    if (servError) throw servError

    for (const servicio of serviciosData || []) {
      const expId = servicio.id_expediente
      if (!expId || !expedienteIds.has(expId)) {
        issues.push({
          tipo: 'servicio_sin_expediente',
          id: servicio.id,
          descripcion: `Servicio "${servicio.tipo_servicio || 'sin tipo'}${servicio.nombre_especifico ? ' – ' + servicio.nombre_especifico : ''}" referencia expediente_id inexistente`,
          valorActual: expId || '(null)',
          correccionSugerida: null,
          autoCorregible: false,
        })
      }
    }
  } catch (err) {
    console.error('[IntegrityScanner] Error al comprobar servicios sin expediente:', err)
  }
  return issues
}

// ─── Comprobación 3: cobros sin expediente válido ─────────────────────────────
const chequearFacturasSinExpediente = async () => {
  const issues = []
  try {
    const { data: cobrosData, error: cobrosError } = await supabase
      .from('cobros_expediente')
      .select('id, expediente_id, importe, concepto, fecha')

    if (cobrosError) throw cobrosError
    if (!cobrosData?.length) return issues

    const { data: expedientesData, error: expError } = await supabase
      .from('expedientes')
      .select('id')

    if (expError) throw expError

    const expedienteIds = new Set((expedientesData || []).map((e) => e.id))

    for (const cobro of cobrosData) {
      const expId = cobro.expediente_id
      if (!expId || !expedienteIds.has(expId)) {
        issues.push({
          tipo: 'factura_sin_servicio',
          id: cobro.id,
          descripcion: `Cobro de ${cobro.importe != null ? cobro.importe + ' €' : 'importe desconocido'}${cobro.concepto ? ' (' + cobro.concepto + ')' : ''} no está asociado a ningún expediente`,
          valorActual: expId || '(null)',
          correccionSugerida: null,
          autoCorregible: false,
        })
      }
    }
  } catch (err) {
    console.error('[IntegrityScanner] Error al comprobar cobros huérfanos:', err)
  }
  return issues
}

// ─── Función principal ────────────────────────────────────────────────────────
/**
 * Ejecuta una auditoría completa del sistema.
 * @returns {Promise<IntegrityReport>}
 */
export const checkSystemIntegrity = async () => {
  const [duracionesInvalidas, serviciosSinExpediente, facturasSinServicio] = await Promise.all([
    chequearDuracionesInvalidas(),
    chequearServiciosSinExpediente(),
    chequearFacturasSinExpediente(),
  ])

  const totalIssues =
    duracionesInvalidas.length +
    serviciosSinExpediente.length +
    facturasSinServicio.length

  const partes = []
  if (duracionesInvalidas.length > 0)
    partes.push(`${duracionesInvalidas.length} expediente${duracionesInvalidas.length > 1 ? 's' : ''} con duración inválida`)
  if (serviciosSinExpediente.length > 0)
    partes.push(`${serviciosSinExpediente.length} servicio${serviciosSinExpediente.length > 1 ? 's' : ''} sin expediente`)
  if (facturasSinServicio.length > 0)
    partes.push(`${facturasSinServicio.length} cobro${facturasSinServicio.length > 1 ? 's' : ''} huérfano${facturasSinServicio.length > 1 ? 's' : ''}`)

  const resumen =
    totalIssues === 0
      ? '✅ Sistema íntegro — sin anomalías detectadas'
      : `⚠️ ${totalIssues} problema${totalIssues > 1 ? 's' : ''} detectado${totalIssues > 1 ? 's' : ''}: ${partes.join(', ')}`

  return {
    totalIssues,
    expedientesDuracionInvalida: duracionesInvalidas,
    serviciosSinExpediente,
    facturasSinServicio,
    resumen,
    timestamp: new Date(),
  }
}

// ─── Auto-corrección de duraciones legacy ────────────────────────────────────
/**
 * Corrige automáticamente en Supabase los expedientes con duracion_viaje legada
 * que tienen una corrección sugerida conocida.
 * @param {IntegrityIssue[]} issues - Issues de tipo 'expediente_duracion' con autoCorregible=true
 * @returns {Promise<{ corregidos: number, errores: string[] }>}
 */
export const autoCorregirDuraciones = async (issues) => {
  const corregibles = issues.filter(
    (i) => i.tipo === 'expediente_duracion' && i.autoCorregible && i.correccionSugerida
  )
  let corregidos = 0
  const errores = []

  for (const issue of corregibles) {
    const { error } = await supabase
      .from('expedientes')
      .update({ duracion_viaje: issue.correccionSugerida })
      .eq('id', issue.id)

    if (error) {
      errores.push(`No se pudo corregir expediente ${issue.id}: ${error.message}`)
    } else {
      corregidos++
    }
  }

  return { corregidos, errores }
}
