// ============ GESTIÓN GLOBAL DEL EJERCICIO (AÑO) ============
// Estado global persistente en localStorage

const EJERCICIO_KEY = 'ejercicioActual'
const EJERCICIO_POR_DEFECTO = 2026
const EJERCICIO_MIN = 2026
const EJERCICIO_MAX = 2036

/**
 * Obtener el ejercicio actual desde localStorage
 * @returns {number} Año actual (2026-2036)
 */
export const getEjercicioActual = () => {
  try {
    const stored = localStorage.getItem(EJERCICIO_KEY)
    if (stored) {
      const ejercicio = parseInt(stored)
      // Validar rango
      if (ejercicio >= EJERCICIO_MIN && ejercicio <= EJERCICIO_MAX) {
        return ejercicio
      }
    }
  } catch (error) {
    console.error('Error leyendo ejercicio de localStorage:', error)
  }
  return EJERCICIO_POR_DEFECTO
}

/**
 * Guardar el ejercicio actual en localStorage
 * @param {number} ejercicio - Año a guardar (2026-2036)
 */
export const setEjercicioActual = (ejercicio) => {
  try {
    const year = parseInt(ejercicio)
    // Validar rango
    if (year >= EJERCICIO_MIN && year <= EJERCICIO_MAX) {
      localStorage.setItem(EJERCICIO_KEY, year.toString())
      console.log('✅ Ejercicio guardado:', year)
      
      // Disparar evento personalizado para notificar a todos los componentes
      window.dispatchEvent(new CustomEvent('ejercicioChanged', { detail: year }))
      
      return true
    } else {
      console.warn('⚠️ Ejercicio fuera de rango:', year)
      return false
    }
  } catch (error) {
    console.error('Error guardando ejercicio en localStorage:', error)
    return false
  }
}

/**
 * Obtener array de años disponibles (2026-2036)
 * @returns {number[]} Array de años en orden descendente
 */
export const getAñosDisponibles = () => {
  return Array.from({ length: 11 }, (_, i) => EJERCICIO_MAX - i)
}

/**
 * Obtener etiqueta para un año
 * @param {number} año - Año a etiquetar
 * @returns {string} Etiqueta descriptiva
 */
export const getEtiquetaAño = (año) => {
  if (año === 2026) return `${año} (Actual)`
  if (año < 2026) return `${año} (Archivado)`
  return `${año} (Futuro)`
}

/**
 * Hook personalizado para escuchar cambios en el ejercicio
 * Usar en componentes funcionales con useEffect
 */
export const subscribeToEjercicioChanges = (callback) => {
  const handler = (event) => {
    callback(event.detail)
  }
  
  window.addEventListener('ejercicioChanged', handler)
  
  return () => {
    window.removeEventListener('ejercicioChanged', handler)
  }
}
