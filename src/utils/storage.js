// LocalStorage utilities for data persistence

export const storage = {
  // Generic get/set
  get(key) {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : null
    } catch (error) {
      return null
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch (error) {
      return false
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key)
      return true
    } catch (error) {
      return false
    }
  },

  // Clientes
  getClientes() {
    return this.get('clientes') || []
  },

  setClientes(clientes) {
    return this.set('clientes', clientes)
  },

  // Cotizaciones
  getCotizaciones() {
    return this.get('cotizaciones') || []
  },

  setCotizaciones(cotizaciones) {
    return this.set('cotizaciones', cotizaciones)
  },

  // Planning
  getPlanning() {
    return this.get('planning') || []
  },

  setPlanning(planning) {
    return this.set('planning', planning)
  },

  // CRM Visitas
  getVisitas() {
    return this.get('visitas') || []
  },

  setVisitas(visitas) {
    return this.set('visitas', visitas)
  },

  // Cierres
  getCierres() {
    return this.get('cierres') || []
  },

  setCierres(cierres) {
    return this.set('cierres', cierres)
  },
}
