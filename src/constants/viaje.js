// ============================================================================
// FUENTE ÚNICA DE VERDAD — Valores permitidos por la base de datos
// NUNCA escribir estos textos a mano en componentes. Importar siempre desde aquí.
// ============================================================================

/** Valores válidos para expedientes.duracion_viaje (CHECK constraint en DB). */
export const DURACION_VIAJE_OPTIONS = [
  { value: 'Día completo', label: 'Día completo' },
  { value: 'Finde',        label: 'Finde'        },
  { value: 'Gran viaje',   label: 'Gran viaje'   },
]

/** Solo los valores string permitidos (para validación rápida). */
export const DURACION_VIAJE_VALORES = DURACION_VIAJE_OPTIONS.map((o) => o.value)

/**
 * Mapeo de valores legacy → valor canónico más cercano.
 * Si el valor no es reconocible en absoluto, devuelve null (requiere revisión manual).
 */
export const DURACION_LEGADO_MAP = {
  // Variantes de "Día completo"
  'Dia completo':      'Día completo',
  'dia completo':      'Día completo',
  'DIA COMPLETO':      'Día completo',
  'Día Completo':      'Día completo',
  'Dia Completo':      'Día completo',
  'completo':          'Día completo',
  // Variantes de "Finde"
  'finde':             'Finde',
  'FINDE':             'Finde',
  'Fin de semana':     'Finde',
  'fin de semana':     'Finde',
  'Puente':            'Finde',   // "Puente" → más cercano a Finde
  'puente':            'Finde',
  'Weekend':           'Finde',
  'weekend':           'Finde',
  // Variantes de "Gran viaje"
  'gran viaje':        'Gran viaje',
  'GRAN VIAJE':        'Gran viaje',
  'Gran Viaje':        'Gran viaje',
  'gran_viaje':        'Gran viaje',
  'Viaje largo':       'Gran viaje',
  'viaje largo':       'Gran viaje',
  'Largo':             'Gran viaje',
}

/**
 * Normaliza un valor de duracion_viaje:
 * 1. Si ya es válido, lo devuelve tal cual.
 * 2. Si es un alias legado conocido, lo traduce.
 * 3. Si no se reconoce, devuelve null.
 */
export const normalizarDuracion = (valor) => {
  if (!valor || typeof valor !== 'string') return null
  const trimmed = valor.trim()
  if (DURACION_VIAJE_VALORES.includes(trimmed)) return trimmed
  return DURACION_LEGADO_MAP[trimmed] ?? null
}

/** Valores válidos para expedientes.tipo_colectivo. */
export const TIPO_COLECTIVO_OPTIONS = [
  { value: 'Jubilados',    label: 'Jubilados'    },
  { value: 'Amas de Casa', label: 'Amas de Casa' },
  { value: 'Otros',        label: 'Otros'        },
]

export const TIPO_COLECTIVO_VALORES = TIPO_COLECTIVO_OPTIONS.map((o) => o.value)
