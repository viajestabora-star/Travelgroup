import React from 'react'
import HistorialCierres from './HistorialCierres'

/**
 * Vista «Cierres económicos» (ruta `/historial-cierres`).
 * Los totales consolidados deben leerse desde `expedientes.cierre_grupo` / `cierre_grupo.totales`
 * (ver `src/utils/cierreGrupoFuenteVerdad.js` y `src/utils/reportGenerator.js`).
 */
export default function CierresEconomicos(props) {
  return <HistorialCierres {...props} />
}
