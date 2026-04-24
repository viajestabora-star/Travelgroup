/**
 * Convierte un nombre de empresa en un slug URL-safe.
 * "Viajes Tabora S.L." → "viajes-tabora-sl"
 * "Agencia Demo"       → "agencia-demo"
 */
export const toSlug = (text) =>
  String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // elimina diacríticos (á→a, ñ→n, etc.)
    .replace(/[^a-z0-9\s]/g, '')      // elimina caracteres no alfanuméricos
    .trim()
    .replace(/\s+/g, '-')             // espacios → guiones
    .replace(/-+/g, '-')              // colapsa múltiples guiones
    || 'mi-agencia'
