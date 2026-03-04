/**
 * Helpers compartidos para cálculos financieros (ExpedienteFinanzas, Cierres, etc.)
 * NO simplificar: lógica crítica de IVA, márgenes y cierre.
 */

export const toNum = (v) => {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number' && !isNaN(v)) return v
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

export const generarUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export const normalizarTipo = (tipo) => {
  if (!tipo) return ''
  return tipo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

export const limpiarNumero = (valor) => {
  if (valor === null || valor === undefined || valor === '') return 0
  if (typeof valor === 'number') return isNaN(valor) ? 0 : valor
  let limpio = String(valor).trim()
  const tienePunto = limpio.includes('.')
  const tieneComa = limpio.includes(',')
  if (tienePunto && tieneComa) {
    limpio = limpio.replace(/\./g, '').replace(/,/g, '.')
  } else if (tieneComa && !tienePunto) {
    limpio = limpio.replace(/,/g, '.')
  }
  limpio = limpio.replace(/[^0-9.-]+/g, '')
  const resultado = parseFloat(limpio)
  return isNaN(resultado) ? 0 : resultado
}

/**
 * Normaliza metodo_pago para coincidir con el Check Constraint de cobros_expediente:
 * ANY (ARRAY['Transferencia', 'Efectivo', 'Tarjeta', 'Talon', 'Mixto'])
 * Elimina acentos (Talón → Talon) y mapea a valores válidos.
 */
export const normalizarMetodoPago = (valor) => {
  if (valor == null || valor === '') return 'Transferencia'
  const sinAcentos = String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  const validos = ['Transferencia', 'Efectivo', 'Tarjeta', 'Talon', 'Mixto']
  const encontrado = validos.find((v) => v.toLowerCase() === sinAcentos.toLowerCase())
  return encontrado || 'Transferencia'
}

export const categorizarPago = (concepto) => {
  const c = String(concepto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/bus|autobus|transporte/.test(c)) return 'Bus'
  if (/hotel|alojamiento|habitacion/.test(c)) return 'Hotel'
  if (/guia|guía/.test(c)) return 'Guía'
  if (/restaurante/.test(c)) return 'Restaurante'
  return 'Otros'
}

export const numeroATexto = (numero) => {
  const unidades = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve']
  const decenas = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
  const especiales = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve']
  const centenas = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos']
  const num = Math.floor(numero)
  if (num === 0) return 'cero'
  if (num === 1) return 'un'
  if (num === 100) return 'cien'
  if (num < 10) return unidades[num]
  if (num < 20) return especiales[num - 10]
  if (num < 100) {
    const decena = Math.floor(num / 10)
    const unidad = num % 10
    if (unidad === 0) return decenas[decena]
    return decenas[decena] + ' y ' + unidades[unidad]
  }
  if (num < 1000) {
    const centena = Math.floor(num / 100)
    const resto = num % 100
    if (resto === 0) return centenas[centena]
    return centenas[centena] + ' ' + numeroATexto(resto)
  }
  if (num < 1000000) {
    const miles = Math.floor(num / 1000)
    const resto = num % 1000
    let texto = miles === 1 ? 'mil' : numeroATexto(miles) + ' mil'
    if (resto > 0) texto += ' ' + numeroATexto(resto)
    return texto
  }
  return numero.toString()
}
