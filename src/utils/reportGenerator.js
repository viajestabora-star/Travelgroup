/**
 * Informes y PDF de cierre: totales alineados con `cierre_grupo.totales` y desglose línea a línea.
 * Reexporta helpers de dominio y de `informeCierreHaciendaPdf`.
 */

export {
  cierreGrupoTieneFinanzasVerificadas,
  finanzasExpedienteParaInformes,
  leerTotalesCierreGrupo,
  leerFinanzasCierreDesdeSoloCierreGrupo,
  sumarDesgloseGastosCierreGrupo,
  construirBloqueTotalesCierre,
  n as nCierreNum,
} from './cierreGrupoFuenteVerdad'

export {
  payloadDesdeCierreGrupo,
  payloadDesdeLineasHacienda,
  calcularTotalesInforme,
  crearJsPdfInformeCierreFinanciero,
  crearJsPdfInformeCierre,
  nombreArchivoInformeCierrePdf,
} from './informeCierreHaciendaPdf'
