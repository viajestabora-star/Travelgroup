// ============================================================================
// NORMALIZADOR DE FECHAS - FORMATO ESPAÑOL DD/MM/AAAA
// ============================================================================
// REGLA DE ORO: Todas las fechas se guardan en formato DD/MM/AAAA
// ENTRADA: DD/MM/AAAA (formato español estándar)
// SALIDA: DD/MM/AAAA (formato español estándar)
// COMPARACIONES: Convertir a Date object para orden cronológico exacto
// ============================================================================

/**
 * Convierte cualquier formato de fecha a DD/MM/AAAA (español)
 * @param {string} fechaStr - Fecha en cualquier formato
 * @returns {string} Fecha en formato DD/MM/AAAA o string vacío
 */
export const normalizarFechaEspañola = (fechaStr) => {
  if (!fechaStr || fechaStr.trim() === '') return ''
  
  try {
    // Si ya es formato DD/MM/AAAA válido
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(fechaStr)) {
      const partes = fechaStr.split('/')
      const dia = partes[0].padStart(2, '0')
      const mes = partes[1].padStart(2, '0')
      const año = partes[2]
      
      // Validar que sea una fecha real
      const fecha = new Date(parseInt(año), parseInt(mes) - 1, parseInt(dia))
      if (!isNaN(fecha.getTime())) {
        return `${dia}/${mes}/${año}` // Formato español normalizado
      }
    }
    
    // Si es formato ISO (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
      const partes = fechaStr.split('-')
      const año = partes[0]
      const mes = partes[1].padStart(2, '0')
      const dia = partes[2].padStart(2, '0')
      
      // Validar que sea una fecha real
      const fecha = new Date(parseInt(año), parseInt(mes) - 1, parseInt(dia))
      if (!isNaN(fecha.getTime())) {
        return `${dia}/${mes}/${año}` // Convertir a formato español
      }
    }
    
    // Si es formato YYYY/MM/DD
    if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(fechaStr)) {
      const partes = fechaStr.split('/')
      const año = partes[0]
      const mes = partes[1].padStart(2, '0')
      const dia = partes[2].padStart(2, '0')
      return `${dia}/${mes}/${año}`
    }
    
    // Intentar parsear con Date (último recurso)
    const fecha = new Date(fechaStr)
    if (!isNaN(fecha.getTime())) {
      const dia = String(fecha.getDate()).padStart(2, '0')
      const mes = String(fecha.getMonth() + 1).padStart(2, '0')
      const año = fecha.getFullYear()
      return `${dia}/${mes}/${año}`
    }
    
    console.warn('⚠️ No se pudo normalizar la fecha:', fechaStr)
    return ''
    
  } catch (error) {
    console.error('❌ Error normalizando fecha:', fechaStr, error)
    return ''
  }
}

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
    // Normalizar primero
    const fechaNormalizada = normalizarFechaEspañola(fechaStr)
    if (!fechaNormalizada) return null
    
    // Extraer año (últimos 4 caracteres después del segundo /)
    const partes = fechaNormalizada.split('/')
    if (partes.length === 3) {
      return parseInt(partes[2])
    }
    
    return null
  } catch (error) {
    console.error('Error extrayendo año:', fechaStr, error)
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
    // Normalizar primero
    const fechaNormalizada = normalizarFechaEspañola(fechaStr)
    if (!fechaNormalizada) return ''
    
    // Parsear DD/MM/AAAA
    const partes = fechaNormalizada.split('/')
    if (partes.length !== 3) return ''
    
    const [dia, mes, año] = partes
    return `${año}-${mes}-${dia}` // YYYY-MM-DD
    
  } catch (error) {
    console.error('Error convirtiendo a ISO:', fechaStr, error)
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
    // Si ya es formato DD/MM/AAAA, devolverlo
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(fechaISO)) {
      return normalizarFechaEspañola(fechaISO)
    }
    
    // Parsear YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(fechaISO)) {
      const [año, mes, dia] = fechaISO.split('-')
      return `${dia}/${mes}/${año}` // DD/MM/AAAA
    }
    
    return ''
    
  } catch (error) {
    console.error('Error convirtiendo a español:', fechaISO, error)
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
  
  try {
    // Normalizar primero a formato español
    const fechaNormalizada = normalizarFechaEspañola(fechaStr)
    if (!fechaNormalizada) return null
    
    // Parsear DD/MM/AAAA → Date object
    const partes = fechaNormalizada.split('/')
    if (partes.length !== 3) return null
    
    const dia = parseInt(partes[0])
    const mes = parseInt(partes[1]) - 1  // Meses en JS son 0-11
    const año = parseInt(partes[2])
    
    const fecha = new Date(año, mes, dia, 0, 0, 0, 0)
    
    // Verificar que la fecha sea válida
    if (isNaN(fecha.getTime())) return null
    
    // Verificar que no haya overflow (ej: 31/02 se convierte en 03/03)
    if (fecha.getDate() !== dia || fecha.getMonth() !== mes || fecha.getFullYear() !== año) {
      return null
    }
    
    console.log(`📅 Parseando "${fechaStr}" → Date(${año}-${mes+1}-${dia}) → timestamp: ${fecha.getTime()}`)
    
    return fecha
    
  } catch (error) {
    console.error('Error parseando fecha:', fechaStr, error)
    return null
  }
}
