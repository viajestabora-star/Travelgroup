// ============================================================================
// NORMALIZADOR DE FECHAS - FORMATO ESPAÑOL DD/MM/AAAA
// ============================================================================
// REGLA DE ORO: Todas las fechas se guardan en formato DD/MM/AAAA
// ENTRADA: DD/MM/AAAA (formato español estándar)
// SALIDA: DD/MM/AAAA (formato español estándar)
// COMPARACIONES: Convertir a Date object para orden cronológico exacto
// ============================================================================

export const normalizarFechaEspañola = (f) => (typeof f === 'string' && f ? f.trim() : '');

/**
 * Alias para compatibilidad (mismo comportamiento)
 * @param {string} fechaStr - Fecha en cualquier formato
 * @returns {string} Fecha en formato DD/MM/AAAA
 */
export const formatearFechaVisual = normalizarFechaEspañola

/**
 * Normaliza todos los expedientes a formato DD/MM/AAAA
 * @param {Array} expedientes - Array de expedientes
 * @returns {Array} Expedientes con fechas normalizadas
 */
export const normalizarExpedientes = (expedientes) => {
  if (!Array.isArray(expedientes)) return []
  
  return expedientes.map(exp => {
    const expedienteNormalizado = { ...exp }
    
    // Normalizar fecha_inicio / fechaInicio
    if (exp.fecha_inicio) {
      expedienteNormalizado.fechaInicio = normalizarFechaEspañola(exp.fecha_inicio)
      delete expedienteNormalizado.fecha_inicio // Eliminar formato antiguo
    } else if (exp.fechaInicio) {
      expedienteNormalizado.fechaInicio = normalizarFechaEspañola(exp.fechaInicio)
    }
    
    // Normalizar fecha_fin / fechaFin
    if (exp.fecha_fin) {
      expedienteNormalizado.fechaFin = normalizarFechaEspañola(exp.fecha_fin)
      delete expedienteNormalizado.fecha_fin // Eliminar formato antiguo
    } else if (exp.fechaFin) {
      expedienteNormalizado.fechaFin = normalizarFechaEspañola(exp.fechaFin)
    }
    
    return expedienteNormalizado
  })
}

/**
 * Extrae el año de una fecha en formato DD/MM/AAAA
 * @param {string} fechaStr - Fecha en formato DD/MM/AAAA
 * @returns {number|null} Año como número o null
 */
export const extraerAño = (fechaStr) => {
  if (!fechaStr) return null
  try {
    const f = normalizarFechaEspañola(fechaStr)
    if (!f) return null
    const partes = f.split('/')
    if (partes.length === 3) return parseInt(partes[2])
    if (/^\d{4}-\d{2}-\d{2}$/.test(f)) return parseInt(f.split('-')[0])
    return null
  } catch (error) {
    return null
  }
}

/**
 * Convierte DD/MM/AAAA a YYYY-MM-DD (formato ISO para inputs type="date")
 * @param {string} fechaStr - Fecha en formato DD/MM/AAAA
 * @returns {string} Fecha en formato YYYY-MM-DD o string vacío
 */
export const convertirEspañolAISO = (fechaStr) => {
  if (!fechaStr) return ''
  try {
    const f = normalizarFechaEspañola(fechaStr)
    if (!f) return ''
    if (/^\d{4}-\d{2}-\d{2}$/.test(f)) return f
    const partes = f.split('/')
    if (partes.length !== 3) return ''
    return `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`
  } catch (error) {
    return ''
  }
}

/**
 * Convierte YYYY-MM-DD (ISO) a DD/MM/AAAA (español)
 * @param {string} fechaISO - Fecha en formato YYYY-MM-DD
 * @returns {string} Fecha en formato DD/MM/AAAA o string vacío
 */
export const convertirISOAEspañol = (fechaISO) => {
  if (!fechaISO) return ''
  try {
    const f = normalizarFechaEspañola(fechaISO)
    if (!f) return ''
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(f)) return f
    if (/^\d{4}-\d{2}-\d{2}$/.test(f)) {
      const [año, mes, dia] = f.split('-')
      return `${dia}/${mes}/${año}`
    }
    return ''
  } catch (error) {
    return ''
  }
}

/**
 * Parsea una fecha a objeto Date (para comparaciones)
 * @param {string} fechaStr - Fecha en formato DD/MM/AAAA o cualquier formato
 * @returns {Date|null} Objeto Date o null
 */
export const parsearFechaADate = (fechaStr) => {
  if (!fechaStr) return null
  if (fechaStr instanceof Date && !isNaN(fechaStr.getTime())) return fechaStr
  try {
    const f = normalizarFechaEspañola(fechaStr)
    if (!f) return null
    let año, mes, dia
    if (/^\d{4}-\d{2}-\d{2}$/.test(f)) {
      [año, mes, dia] = f.split('-').map(Number)
      mes -= 1
    } else {
      const partes = f.split('/')
      if (partes.length !== 3) return null
      dia = parseInt(partes[0])
      mes = parseInt(partes[1]) - 1
      año = parseInt(partes[2])
    }
    const fecha = new Date(año, mes, dia, 0, 0, 0, 0)
    if (isNaN(fecha.getTime())) return null
    return fecha
  } catch (error) {
    return null
  }
}
