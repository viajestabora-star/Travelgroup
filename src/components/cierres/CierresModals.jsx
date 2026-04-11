import React, { useCallback, useEffect, useMemo, useState, memo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Loader2, ExternalLink, Package, Upload } from 'lucide-react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { supabase } from '../../supabase'
import {
  resolverUrlPublicaFacturaProveedor,
  descargarArrayBufferFacturaProveedor,
  eliminarObjetoStorageFacturaProveedor,
} from '../../utils/facturaProveedorStorage'
import { crearJsPdfInformeCierre, nombreArchivoInformeCierrePdf } from '../../utils/informeCierreHaciendaPdf'
import { obtenerLineasInformeComoCierres, obtenerExpedienteParaPdfCierres } from '../../utils/lineasInformeCierres'
import {
  NOMBRES_MES,
  n,
  formatEuroAmount,
  formInicialGastoMensual,
  mesEstructuraDesdeNumero,
  mesNumeroDesdeEstructura,
} from '../../utils/historialCierresFormat'
import {
  fusionarFacturasClientePorExpediente,
  particionarArchivosAuditoriaZip,
  construirListaArchivosAuditoria,
  nombreArchivoSeguro,
  cederAlNavegadorParaZip,
  cargarDatosAuditoriaExpediente,
  subirPdfFacturaProveedorComoExpediente,
  resolverUrlFacturaCliente,
  extraerFinanzas,
  nombrePdfEnZipEstructura,
  PROVEEDORES_FIJOS_MENSUALES,
  BUCKET_FACTURAS_PROVEEDORES,
  esErrorTablaInexistenteHistorial,
} from '../../utils/historialCierresShared'

const GastoMensualModalContent = memo(function GastoMensualModalContent({
  mesNum,
  esExtra,
  añoStr,
  onClose,
  subiendoGastoMensual,
  setSubiendoGastoMensual,
  recargarGastosEstructura,
  fuenteGastosEstructura,
}) {
  const [formGastoMensual, setFormGastoMensual] = useState(() => formInicialGastoMensual(añoStr, mesNum))
  const [archivoGastoMensual, setArchivoGastoMensual] = useState(null)
  const importeRef = useRef(null)

  useEffect(() => {
    setFormGastoMensual(formInicialGastoMensual(añoStr, mesNum))
    setArchivoGastoMensual(null)
    if (importeRef.current) importeRef.current.value = ''
  }, [mesNum, añoStr, esExtra])

  const guardarGastoMensualDesdeModal = async () => {
    const anioEjercicio = parseInt(añoStr, 10)
    const cat = String(formGastoMensual.categoria || 'arsys')
    const proveedorOtro = String(formGastoMensual.proveedorOtro || '').trim()
    const proveedor =
      cat === 'otro'
        ? proveedorOtro
        : (PROVEEDORES_FIJOS_MENSUALES.find((c) => c.id === cat)?.label || '').trim()
    const importeConIva = parseFloat(String(importeRef.current?.value ?? '').replace(',', '.'))
    const fechaStr = String(formGastoMensual.fecha || '').trim()
    const file = archivoGastoMensual

    if (!proveedor) {
      alert(cat === 'otro' ? 'Indica el nombre del proveedor (Otro).' : 'Selecciona un proveedor.')
      return
    }
    if (!Number.isFinite(importeConIva) || importeConIva < 0) {
      alert('Indica un importe válido (con IVA).')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
      alert('Indica la fecha de la factura.')
      return
    }
    const fd = new Date(`${fechaStr}T12:00:00`)
    if (isNaN(fd.getTime())) {
      alert('Fecha no válida.')
      return
    }
    const anioContable = fd.getFullYear()
    if (anioContable !== anioEjercicio) {
      alert(`La fecha debe pertenecer al ejercicio ${anioEjercicio} (año del selector superior).`)
      return
    }
    if (!file || file.type !== 'application/pdf') {
      alert('Selecciona un archivo PDF.')
      return
    }
    if (fuenteGastosEstructura !== 'gastos_estructura') {
      alert('Los gastos de estructura aún se están cargando. Espera unos segundos y vuelve a intentarlo.')
      return
    }

    setSubiendoGastoMensual(true)
    let pathStorage = null
    try {
      pathStorage = await subirPdfFacturaProveedorComoExpediente(file)
      const mesTxt = mesEstructuraDesdeNumero(mesNum)
      const row = {
        proveedor,
        importe_iva: importeConIva,
        url_pdf: pathStorage,
        mes: mesTxt,
        anio: anioEjercicio,
        fecha_factura: fechaStr,
        activo: true,
        periodicidad: 'mensual',
        es_extra: !!esExtra,
        plantilla_id: null,
      }
      const { error: insErr } = await supabase.from('gastos_estructura').insert(row)
      if (insErr) {
        if (pathStorage) await supabase.storage.from(BUCKET_FACTURAS_PROVEEDORES).remove([pathStorage])
        alert(`${insErr.message}\n\nRevisa el esquema de gastos_estructura en Supabase (mes TEXT, anio, importe_iva).`)
        return
      }
      onClose()
      await recargarGastosEstructura()
    } catch (e) {
      console.error(e)
      if (pathStorage) {
        try {
          await supabase.storage.from(BUCKET_FACTURAS_PROVEEDORES).remove([pathStorage])
        } catch (_) {}
      }
      alert(e?.message || 'Error al guardar el gasto.')
    } finally {
      setSubiendoGastoMensual(false)
    }
  }

  const fechaHint = (() => {
    const f = formGastoMensual.fecha
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f || '')) return null
    const d = new Date(`${f}T12:00:00`)
    if (isNaN(d.getTime())) return null
    return (
      <p className="text-xs font-medium text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
        Mes y año contables automáticos:{' '}
        <strong>
          {NOMBRES_MES[d.getMonth()]} {d.getFullYear()}
        </strong>
      </p>
    )
  })()

  return (
    <>
      <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-100 bg-slate-50">
        <div>
          <h2 id="modal-gasto-mensual-titulo" className="text-lg font-black text-slate-900 tracking-tight">
            {esExtra ? 'Añadir gasto extra' : 'Añadir Gasto de Estructura'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Bloque sugerido: {NOMBRES_MES[mesNum - 1]} · Ejercicio {añoStr}
            {esExtra && (
              <span className="block mt-1 text-amber-800 font-semibold">
                Gasto manual fuera de plantilla (se marca como extra).
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          disabled={subiendoGastoMensual}
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-slate-200 text-slate-600 transition-colors shrink-0"
          aria-label="Cerrar"
        >
          <X size={22} />
        </button>
      </div>
      <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
        <label className="block text-xs font-semibold text-slate-600">
          Proveedor
          <select
            value={formGastoMensual.categoria || 'arsys'}
            onChange={(e) => {
              const v = e.target.value
              setFormGastoMensual((prev) => ({
                ...prev,
                categoria: v,
                proveedorOtro: v === 'otro' ? prev.proveedorOtro : '',
              }))
            }}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {PROVEEDORES_FIJOS_MENSUALES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {formGastoMensual.categoria === 'otro' && (
          <label className="block text-xs font-semibold text-slate-600">
            Nombre del proveedor (manual)
            <input
              type="text"
              value={formGastoMensual.proveedorOtro || ''}
              onChange={(e) => setFormGastoMensual((p) => ({ ...p, proveedorOtro: e.target.value }))}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Proveedor"
            />
          </label>
        )}
        <label className="block text-xs font-semibold text-slate-600">
          Importe (con IVA)
          <input
            ref={importeRef}
            type="text"
            name="importe_gasto_estructura"
            autoComplete="off"
            inputMode="decimal"
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            placeholder="0,00"
          />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Fecha de la factura
          <input
            type="date"
            value={formGastoMensual.fecha || ''}
            onChange={(e) => setFormGastoMensual((p) => ({ ...p, fecha: e.target.value }))}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
          />
        </label>
        {fechaHint}
        <label className="block text-xs font-semibold text-slate-600">
          Archivo PDF
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setArchivoGastoMensual(e.target.files?.[0] || null)}
            className="mt-1 block w-full text-sm text-slate-600"
          />
        </label>
        <p className="text-[11px] text-slate-500">
          El PDF se sube al bucket <code className="bg-slate-100 px-1 rounded">facturas_proveedores</code> con el mismo criterio
          que en expedientes (<code className="bg-slate-100 px-1 rounded">fac-{'{timestamp}'}.pdf</code>).
        </p>
      </div>
      <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex flex-wrap gap-2 justify-end">
        <button
          type="button"
          disabled={subiendoGastoMensual}
          onClick={onClose}
          className="px-4 py-2.5 rounded-xl border-2 border-slate-300 bg-white text-slate-800 text-sm font-bold hover:bg-slate-100"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={subiendoGastoMensual}
          onClick={() => guardarGastoMensualDesdeModal()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white text-sm font-black uppercase tracking-wide shadow-md"
        >
          {subiendoGastoMensual ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
          Guardar gasto
        </button>
      </div>
    </>
  )
})

export const CierresModalsLayer = memo(function CierresModalsLayer({
  modalAuditoria,
  cargandoAuditoria,
  datosAuditoria,
  descargandoZip,
  cerrarModalAuditoria,
  descargarExpedienteZip,
  abrirTodosDocumentosPestanas,
  irAlExpedienteEdicion,
  esGestoria,
  modalGastoMensual,
  esAdmin,
  año,
  subiendoGastoMensual,
  setSubiendoGastoMensual,
  recargarGastosEstructura,
  fuenteGastosEstructura,
  cerrarModalGastoMensual,
}) {
  return (
    <>
      {modalAuditoria && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-auditoria-titulo"
          onClick={(e) => e.target === e.currentTarget && cerrarModalAuditoria()}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="min-w-0">
                <h2 id="modal-auditoria-titulo" className="text-lg font-black text-slate-900 tracking-tight">
                  Auditoría de expediente
                </h2>
                <p className="text-sm text-slate-600 mt-1 font-mono">
                  {modalAuditoria.numero_expediente ?? '—'} · {modalAuditoria.nombre_grupo || modalAuditoria.cliente_nombre || '—'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{modalAuditoria.destino || 'Sin destino'}</p>
              </div>
              <button
                type="button"
                onClick={cerrarModalAuditoria}
                className="p-2 rounded-xl hover:bg-slate-200 text-slate-600 transition-colors shrink-0"
                aria-label="Cerrar"
              >
                <X size={22} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6">
              {cargandoAuditoria ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
                  <Loader2 className="animate-spin" size={40} />
                  <p className="text-sm font-medium">Cargando documentación…</p>
                </div>
              ) : (
                <>
                  {(() => {
                    let fin
                    try {
                      fin = extraerFinanzas(modalAuditoria)
                    } catch {
                      fin = {
                        ingresoTotal: n(modalAuditoria.total_ingresos),
                        gastoTotal: n(modalAuditoria.total_gastos_reales),
                        beneficioNeto: n(modalAuditoria.beneficio_neto_real),
                      }
                    }
                    return (
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Resumen financiero</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {[
                            { label: 'Ingresos', value: fin.ingresoTotal, color: 'text-emerald-800', bg: 'bg-emerald-50 border-emerald-100' },
                            { label: 'Gastos (proveedores)', value: fin.gastoTotal, color: 'text-red-800', bg: 'bg-red-50 border-red-100' },
                            {
                              label: 'Beneficio neto',
                              value: fin.beneficioNeto,
                              color: fin.beneficioNeto >= 0 ? 'text-blue-800' : 'text-red-800',
                              bg: fin.beneficioNeto >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100',
                            },
                          ].map((card) => (
                            <div key={card.label} className={`rounded-xl border p-4 ${card.bg}`}>
                              <p className="text-[10px] font-bold uppercase text-slate-500">{card.label}</p>
                              <p className={`text-xl font-black tabular-nums ${card.color}`}>{formatEuroAmount(card.value)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}

                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Facturas de proveedores</h3>
                    {datosAuditoria.pagos.length === 0 ? (
                      <p className="text-sm text-slate-400 italic">No hay pagos registrados en este expediente.</p>
                    ) : (
                      <ul className="space-y-2 text-sm border border-slate-100 rounded-xl divide-y divide-slate-100 max-h-48 overflow-y-auto">
                        {datosAuditoria.pagos.map((p) => {
                          const pdfUrl = resolverUrlPublicaFacturaProveedor(p.url_pdf)
                          const tienePdf = !!pdfUrl
                          return (
                            <li key={p.id} className="px-3 py-2 flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-slate-800 truncate">{p.proveedor_nombre || 'Proveedor'}</p>
                                <p className="text-xs text-slate-500">
                                  {p.concepto || p.numero_factura || '—'} · {formatEuroAmount(p.importe_pagado)}
                                </p>
                                {tienePdf && (
                                  <p className="mt-1 text-[10px] font-mono text-slate-500 break-all" title={pdfUrl}>
                                    {pdfUrl}
                                  </p>
                                )}
                              </div>
                              {tienePdf ? (
                                <a
                                  href={pdfUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 shrink-0"
                                >
                                  <ExternalLink size={14} /> Abrir PDF
                                </a>
                              ) : (
                                <span className="text-xs text-slate-400 shrink-0">Sin PDF</span>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>

                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Factura al cliente</h3>
                    {datosAuditoria.facturasCliente.length === 0 ? (
                      <p className="text-sm text-slate-400 italic">No consta factura emitida vinculada al expediente.</p>
                    ) : (
                      <ul className="space-y-2">
                        {datosAuditoria.facturasCliente.map((f) => {
                          const url = resolverUrlFacturaCliente(f.url_pdf)
                          return (
                            <li
                              key={f.id ?? f.numero_factura}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2 bg-slate-50/80"
                            >
                              <div>
                                <p className="font-bold text-slate-800">{f.numero_factura || '—'}</p>
                                <p className="text-xs text-slate-600">
                                  {f.cliente_nombre || 'Cliente'} · {formatEuroAmount(f.importe_total)}
                                </p>
                              </div>
                              {url ? (
                                <div className="flex flex-col items-end gap-1 max-w-[min(100%,280px)]">
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800"
                                  >
                                    <ExternalLink size={14} /> Abrir PDF
                                  </a>
                                  <span className="text-[10px] text-slate-500 break-all text-right">{url}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400">PDF no enlazado (regenerar desde expediente si aplica)</span>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 space-y-3">
              <button
                type="button"
                onClick={descargarExpedienteZip}
                disabled={descargandoZip || cargandoAuditoria}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white text-xs sm:text-sm font-black uppercase tracking-[0.12em] shadow-md transition-colors"
              >
                {descargandoZip ? <Loader2 size={18} className="animate-spin" /> : <Package size={18} />}
                Descargar expediente completo
              </button>
              <button
                type="button"
                onClick={abrirTodosDocumentosPestanas}
                disabled={cargandoAuditoria}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-sm font-bold transition-colors"
              >
                <ExternalLink size={16} />
                Abrir todos los PDFs en pestañas nuevas
              </button>
              {!esGestoria && (
                <button
                  type="button"
                  onClick={irAlExpedienteEdicion}
                  className="w-full text-center text-xs font-semibold text-slate-500 hover:text-blue-600 underline"
                >
                  Ir al expediente (edición avanzada)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {modalGastoMensual && esAdmin && (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-gasto-mensual-titulo"
          onClick={(e) => e.target === e.currentTarget && !subiendoGastoMensual && cerrarModalGastoMensual()}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
            <GastoMensualModalContent
              key={`${modalGastoMensual.mesNum}-${modalGastoMensual.esExtra ? 'x' : 'n'}`}
              mesNum={modalGastoMensual.mesNum}
              esExtra={!!modalGastoMensual.esExtra}
              añoStr={año}
              onClose={cerrarModalGastoMensual}
              subiendoGastoMensual={subiendoGastoMensual}
              setSubiendoGastoMensual={setSubiendoGastoMensual}
              recargarGastosEstructura={recargarGastosEstructura}
              fuenteGastosEstructura={fuenteGastosEstructura}
            />
          </div>
        </div>
      )}
    </>
  )
})

export function useCierresModals({
  esAdmin,
  esGestoria,
  año,
  cierres,
  gastosEstructura,
  recargarGastosEstructura,
  fuenteGastosEstructura,
}) {
  const navigate = useNavigate()
  const [modalAuditoria, setModalAuditoria] = useState(null)
  const [cargandoAuditoria, setCargandoAuditoria] = useState(false)
  const [datosAuditoria, setDatosAuditoria] = useState({ pagos: [], facturasCliente: [] })
  const [descargandoZip, setDescargandoZip] = useState(false)
  const [subiendoGastoMensual, setSubiendoGastoMensual] = useState(false)
  const [descargandoPackMes, setDescargandoPackMes] = useState(null)
  const [modalGastoMensual, setModalGastoMensual] = useState(null)

  const cerrarModalAuditoria = useCallback(() => {
    setModalAuditoria(null)
    setDatosAuditoria({ pagos: [], facturasCliente: [] })
  }, [])

  const abrirModalAuditoria = useCallback(async (exp) => {
    setModalAuditoria(exp)
    setCargandoAuditoria(true)
    setDatosAuditoria({ pagos: [], facturasCliente: [] })
    const expedienteId = exp.id
    try {
      const [pagosRes, emRes, glRes] = await Promise.all([
        supabase
          .from('pagos_proveedores')
          .select('id, concepto, numero_factura, fecha_pago, importe_pagado, url_pdf, proveedor_nombre')
          .eq('expediente_id', expedienteId)
          .order('fecha_pago', { ascending: false }),
        supabase
          .from('facturas_emitidas')
          .select('id, numero_factura, fecha_emision, url_pdf, cliente_nombre, importe_total')
          .eq('expediente_id', expedienteId),
        supabase
          .from('facturas_emitidas_global')
          .select('id, numero_factura, fecha_emision, url_pdf, cliente_nombre, importe_total')
          .eq('expediente_id', expedienteId),
      ])
      const pagos = pagosRes.error ? [] : (pagosRes.data || [])
      const facturasCliente = fusionarFacturasClientePorExpediente(
        emRes.error ? [] : emRes.data,
        glRes.error ? [] : glRes.data
      )
      setDatosAuditoria({ pagos, facturasCliente })
    } catch (e) {
      console.error('[Auditoría]', e)
      setDatosAuditoria({ pagos: [], facturasCliente: [] })
    } finally {
      setCargandoAuditoria(false)
    }
  }, [])

  const abrirTodosDocumentosPestanas = useCallback(() => {
    const items = construirListaArchivosAuditoria(modalAuditoria, datosAuditoria)
    const conUrl = items.filter((it) => it?.url && /^https?:\/\//i.test(String(it.url)))
    conUrl.forEach((item, idx) => {
      setTimeout(() => window.open(item.url, '_blank', 'noopener,noreferrer'), idx * 400)
    })
    if (conUrl.length === 0) {
      alert('No hay documentos con URL disponible para este expediente.')
    }
  }, [modalAuditoria, datosAuditoria])

  const descargarExpedienteZip = useCallback(async () => {
    const exp = modalAuditoria
    if (!exp) return
    setDescargandoZip(true)
    try {
      const zip = new JSZip()
      const zipNombreBase = nombreArchivoSeguro(`Expediente_${exp.numero_expediente || exp.id}`)

      const expPdf = (await obtenerExpedienteParaPdfCierres(exp.id)) || exp
      const lineasInforme = await obtenerLineasInformeComoCierres(supabase, expPdf, {
        preferPagosPrimero: true,
      })
      const docPdf = crearJsPdfInformeCierre(expPdf, lineasInforme)
      const pdfBuf = docPdf.output('arraybuffer')
      zip.file(nombreArchivoInformeCierrePdf(exp.numero_expediente || exp.id), pdfBuf, { compression: 'STORE' })

      const { proveedores, clientes } = particionarArchivosAuditoriaZip(exp, datosAuditoria)

      let fetched = 0

      const pullInto = async (folder, items) => {
        let indice = 0
        for (const item of items) {
          indice += 1
          if (indice % 8 === 0) await cederAlNavegadorParaZip()
          const { url, filename, sourceRaw } = item
          const raw = sourceRaw ?? url
          try {
            let buffer = null
            const res = await fetch(url, { mode: 'cors' })
            if (res.ok) buffer = await res.arrayBuffer()
            if (!buffer && raw) buffer = await descargarArrayBufferFacturaProveedor(raw)
            if (buffer) {
              folder.file(filename, buffer, { compression: 'STORE' })
              fetched += 1
            }
          } catch (err) {
            try {
              const buffer = raw ? await descargarArrayBufferFacturaProveedor(raw) : null
              if (buffer) {
                folder.file(filename, buffer, { compression: 'STORE' })
                fetched += 1
              } else {
                console.warn('[ZIP] omitido', filename, err)
              }
            } catch (e2) {
              console.warn('[ZIP] omitido', filename, err || e2)
            }
          }
        }
      }

      if (proveedores.length > 0) {
        await pullInto(zip.folder('Facturas_Proveedores'), proveedores)
      }
      if (clientes.length > 0) {
        await pullInto(zip.folder('Facturas_Clientes'), clientes)
      }

      if (fetched === 0 && proveedores.length + clientes.length > 0) {
        alert(
          'El informe de cierre se ha incluido en el ZIP, pero no se pudieron descargar los PDFs adjuntos (CORS o red). Usa «Abrir todos en pestañas» para los documentos.'
        )
      }

      const blob = await zip.generateAsync({
        type: 'blob',
        streamFiles: true,
        compression: 'DEFLATE',
        compressionOptions: { level: 3 },
      })
      saveAs(blob, `${zipNombreBase}.zip`)
    } catch (e) {
      console.error(e)
      alert('Error al generar el ZIP. Prueba «Abrir todos en pestañas».')
    } finally {
      setDescargandoZip(false)
    }
  }, [modalAuditoria, datosAuditoria])

  const irAlExpedienteEdicion = () => {
    if (!modalAuditoria) return
    navigate('/expedientes', { state: { abrirExpedienteId: modalAuditoria.id, tabInicial: 'cierre' } })
    cerrarModalAuditoria()
  }
  const cerrarModalGastoMensual = useCallback(() => {
    setModalGastoMensual(null)
  }, [])

  const abrirModalGastoMensual = useCallback(
    (mesNum, opts = {}) => {
      const y = parseInt(año, 10)
      if (!Number.isFinite(y)) return
      setModalGastoMensual({ mesNum, esExtra: !!opts.esExtra })
    },
    [año]
  )

  const borrarFacturaEstructura = useCallback(
    async (row) => {
      if (!esAdmin) return
      if (fuenteGastosEstructura !== 'gastos_estructura') {
        alert('Los gastos de estructura aún se están cargando.')
        return
      }
      if (!window.confirm('¿Eliminar esta factura de estructura y su PDF?')) return
      try {
        if (row.url_pdf) await eliminarObjetoStorageFacturaProveedor(row.url_pdf)
        const { error } = await supabase.from('gastos_estructura').delete().eq('id', row.id)
        if (error) {
          alert(`No se pudo eliminar: ${error.message}`)
          return
        }
        await recargarGastosEstructura()
      } catch (e) {
        console.error(e)
        alert('Error al eliminar.')
      }
    },
    [esAdmin, recargarGastosEstructura, fuenteGastosEstructura]
  )

  const guardarEdicionGastoEstructura = useCallback(
    async (row, campos) => {
      if (!esAdmin) return { ok: false, mensaje: 'Sin permiso' }
      if (fuenteGastosEstructura !== 'gastos_estructura') {
        return { ok: false, mensaje: 'Los gastos de estructura aún se están cargando.' }
      }
      const payload = { ...campos }
      const { error } = await supabase.from('gastos_estructura').update(payload).eq('id', row.id)
      if (error) {
        return { ok: false, mensaje: error.message }
      }
      await recargarGastosEstructura()
      return { ok: true }
    },
    [esAdmin, recargarGastosEstructura, fuenteGastosEstructura]
  )

  const [generandoGastosMes, setGenerandoGastosMes] = useState(null)

  const generarGastosMensualesPlantilla = useCallback(
    async (mesNum) => {
      if (!esAdmin) return
      const anioNum = parseInt(año, 10)
      if (!Number.isFinite(anioNum) || mesNum < 1 || mesNum > 12) return
      if (fuenteGastosEstructura !== 'gastos_estructura') {
        alert('Los gastos de estructura aún se están cargando. Espera unos segundos y vuelve a intentarlo.')
        return
      }
      const key = `${anioNum}-${mesNum}`
      setGenerandoGastosMes(key)
      try {
        const { data: mensuales, error: ePlant } = await supabase
          .from('gastos_plantilla')
          .select('id, proveedor, periodicidad, importe_base, activo')
          .eq('periodicidad', 'mensual')
          .eq('activo', true)
        if (ePlant) {
          if (esErrorTablaInexistenteHistorial(ePlant)) {
            alert(
              'La tabla gastos_plantilla no existe. Ejecuta en Supabase la migración add-gastos-plantilla-gastos-estructura.sql.'
            )
            return
          }
          alert(`No se pudo leer la plantilla: ${ePlant.message}`)
          return
        }
        const porId = new Map()
        ;(mensuales || []).forEach((p) => porId.set(p.id, p))
        if (mesNum === 11) {
          const { data: anuales, error: eSeg } = await supabase
            .from('gastos_plantilla')
            .select('id, proveedor, periodicidad, importe_base, activo')
            .eq('periodicidad', 'anual')
            .eq('activo', true)
          if (!eSeg && anuales?.length) {
            const seguroRows = anuales.filter((p) => /seguro\s*coche|coche.*seguro/i.test(String(p.proveedor || '')))
            seguroRows.forEach((p) => porId.set(p.id, p))
          }
        }
        const plantillas = [...porId.values()]
        if (plantillas.length === 0) {
          alert('No hay filas en gastos_plantilla (periodicidad mensual). Revisa activo=true e importe_base en Supabase.')
          return
        }

        const mesTxt = mesEstructuraDesdeNumero(mesNum)
        const { data: existentesRaw, error: eEx } = await supabase
          .from('gastos_estructura')
          .select('id, plantilla_id, proveedor')
          .eq('anio', anioNum)
          .eq('mes', mesTxt)
        if (eEx) {
          alert(`No se pudieron comprobar duplicados: ${eEx.message}`)
          return
        }
        const existentes = Array.isArray(existentesRaw) ? existentesRaw : []

        const yaInsertada = (p) =>
          existentes.some((e) => {
            if (e.plantilla_id && p.id === e.plantilla_id) return true
            return String(e.proveedor || '').trim() === String(p.proveedor || '').trim()
          })

        const fechaDefault = `${anioNum}-${String(mesNum).padStart(2, '0')}-01`
        let insertadas = 0
        for (const p of plantillas) {
          if (yaInsertada(p)) continue
          const importeIva = p.importe_base != null ? Number(p.importe_base) : 0
          const row = {
            proveedor: String(p.proveedor || '').trim(),
            importe_iva: Number.isFinite(importeIva) ? importeIva : 0,
            url_pdf: null,
            mes: mesTxt,
            anio: anioNum,
            fecha_factura: fechaDefault,
            activo: true,
            periodicidad: String(p.periodicidad || 'mensual'),
            es_extra: false,
            plantilla_id: p.id,
          }
          const { error: insErr } = await supabase.from('gastos_estructura').insert(row)
          if (insErr) {
            alert(`Error al insertar «${p.proveedor || '—'}»: ${insErr.message}`)
            return
          }
          insertadas += 1
        }
        await recargarGastosEstructura()
        if (insertadas === 0) {
          alert('No se añadió ninguna fila nueva (todas coincidían con registros ya existentes para ese mes).')
        }
      } catch (e) {
        console.error(e)
        alert(e?.message || 'Error al generar gastos desde plantilla.')
      } finally {
        setGenerandoGastosMes(null)
      }
    },
    [esAdmin, año, fuenteGastosEstructura, recargarGastosEstructura]
  )

  const descargarPackEstructuraMes = useCallback(
    async (mesNum, nombreMes) => {
      const anioNum = parseInt(año, 10)
      if (!Number.isFinite(anioNum)) return

      const expedientesMes = cierres.filter((c) => {
        const d = c.fechaReferenciaTrimestre
        if (!d || isNaN(d.getTime())) return false
        return d.getFullYear() === anioNum && d.getMonth() + 1 === mesNum
      })

      const filasEstructura = gastosEstructura.filter(
        (g) => mesNumeroDesdeEstructura(g.mes) === mesNum && Number(g.anio) === anioNum && g.url_pdf
      )

      if (expedientesMes.length === 0 && filasEstructura.length === 0) {
        alert('No hay expedientes cerrados ni facturas de estructura para este mes.')
        return
      }

      const key = `${anioNum}-${mesNum}`
      setDescargandoPackMes(key)
      try {
        const zip = new JSZip()
        const prefExp = 'Expedientes_cerrados'
        const prefEst = 'Facturas_estructura'

        const nombreUnicoRuta = (rutaCompleta) => {
          if (!zip.files[rutaCompleta]) return rutaCompleta
          const base = rutaCompleta.replace(/\.pdf$/i, '')
          let sufixIdx = 2
          while (zip.files[`${base}_${sufixIdx}.pdf`]) sufixIdx += 1
          return `${base}_${sufixIdx}.pdf`
        }

        let entradasZip = 0
        let contadorPdfPack = 0

        for (const exp of expedientesMes) {
          const carpetaExp = `${prefExp}/${nombreArchivoSeguro(exp.numero_expediente || String(exp.id))}`
          try {
            const datos = await cargarDatosAuditoriaExpediente(supabase, exp.id)
            const expPdf = (await obtenerExpedienteParaPdfCierres(exp.id)) || exp
            const lineasInforme = await obtenerLineasInformeComoCierres(supabase, expPdf, {
              preferPagosPrimero: true,
            })
            const docPdf = crearJsPdfInformeCierre(expPdf, lineasInforme)
            const pdfBuf = docPdf.output('arraybuffer')
            const nomInf = nombreArchivoInformeCierrePdf(exp.numero_expediente || exp.id)
            zip.file(nombreUnicoRuta(`${carpetaExp}/${nomInf}`), pdfBuf, { compression: 'STORE' })
            entradasZip += 1

            const { proveedores, clientes } = particionarArchivosAuditoriaZip(exp, datos)
            for (const item of proveedores) {
              contadorPdfPack += 1
              if (contadorPdfPack % 8 === 0) await cederAlNavegadorParaZip()
              const { url, filename, sourceRaw } = item
              const raw = sourceRaw ?? url
              try {
                let buffer = null
                const res = await fetch(url, { mode: 'cors' })
                if (res.ok) buffer = await res.arrayBuffer()
                if (!buffer && raw) buffer = await descargarArrayBufferFacturaProveedor(raw)
                if (buffer) {
                  const ruta = nombreUnicoRuta(`${carpetaExp}/Facturas_Proveedores/${filename}`)
                  zip.file(ruta, buffer, { compression: 'STORE' })
                  entradasZip += 1
                }
              } catch (err) {
                try {
                  const buffer = raw ? await descargarArrayBufferFacturaProveedor(raw) : null
                  if (buffer) {
                    const ruta = nombreUnicoRuta(`${carpetaExp}/Facturas_Proveedores/${filename}`)
                    zip.file(ruta, buffer, { compression: 'STORE' })
                    entradasZip += 1
                  } else {
                    console.warn('[ZIP pack mes] proveedor omitido', filename, err)
                  }
                } catch (e2) {
                  console.warn('[ZIP pack mes] proveedor omitido', filename, err || e2)
                }
              }
            }
            for (const item of clientes) {
              contadorPdfPack += 1
              if (contadorPdfPack % 8 === 0) await cederAlNavegadorParaZip()
              const { url, filename, sourceRaw } = item
              const raw = sourceRaw ?? url
              try {
                let buffer = null
                const res = await fetch(url, { mode: 'cors' })
                if (res.ok) buffer = await res.arrayBuffer()
                if (!buffer && raw) buffer = await descargarArrayBufferFacturaProveedor(raw)
                if (buffer) {
                  const ruta = nombreUnicoRuta(`${carpetaExp}/Facturas_Clientes/${filename}`)
                  zip.file(ruta, buffer, { compression: 'STORE' })
                  entradasZip += 1
                }
              } catch (err) {
                try {
                  const buffer = raw ? await descargarArrayBufferFacturaProveedor(raw) : null
                  if (buffer) {
                    const ruta = nombreUnicoRuta(`${carpetaExp}/Facturas_Clientes/${filename}`)
                    zip.file(ruta, buffer, { compression: 'STORE' })
                    entradasZip += 1
                  } else {
                    console.warn('[ZIP pack mes] cliente omitido', filename, err)
                  }
                } catch (e2) {
                  console.warn('[ZIP pack mes] cliente omitido', filename, err || e2)
                }
              }
            }
          } catch (err) {
            console.warn('[ZIP pack mes] expediente omitido', exp.id, err)
          }
        }

        for (let i = 0; i < filasEstructura.length; i += 1) {
          contadorPdfPack += 1
          if (contadorPdfPack % 8 === 0) await cederAlNavegadorParaZip()
          const f = filasEstructura[i]
          if (!f.url_pdf) continue
          const url = resolverUrlPublicaFacturaProveedor(f.url_pdf)
          try {
            let buf = null
            if (url) {
              try {
                const res = await fetch(url, { mode: 'cors' })
                if (res.ok) buf = await res.arrayBuffer()
              } catch (_) {}
            }
            if (!buf) buf = await descargarArrayBufferFacturaProveedor(f.url_pdf)
            if (buf) {
              const deseado = nombrePdfEnZipEstructura(nombreMes, f.proveedor, f.importe_iva)
              const ruta = nombreUnicoRuta(`${prefEst}/${deseado}`)
              zip.file(ruta, buf, { compression: 'STORE' })
              entradasZip += 1
            }
          } catch (err) {
            console.warn('[ZIP estructura] omitido', f.id, err)
          }
        }

        if (entradasZip === 0) {
          alert(
            'No se pudo incluir ningún archivo en el ZIP (sin informes ni PDFs descargables; revisa CORS o red).'
          )
          return
        }

        const blob = await zip.generateAsync({
          type: 'blob',
          streamFiles: true,
          compression: 'DEFLATE',
          compressionOptions: { level: 3 },
        })
        saveAs(blob, `Pack_${nombreMes}_${anioNum}.zip`)
      } catch (e) {
        console.error(e)
        alert('Error al generar el ZIP del mes.')
      } finally {
        setDescargandoPackMes(null)
      }
    },
    [año, gastosEstructura, cierres]
  )

  useEffect(() => {
    if (!modalAuditoria) return
    const onKey = (e) => {
      if (e.key === 'Escape') cerrarModalAuditoria()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalAuditoria, cerrarModalAuditoria])

  useEffect(() => {
    if (!modalGastoMensual) return
    const onKey = (e) => {
      if (e.key === 'Escape') cerrarModalGastoMensual()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalGastoMensual, cerrarModalGastoMensual])

  const cierresModalsLayerProps = useMemo(
    () => ({
      modalAuditoria,
      cargandoAuditoria,
      datosAuditoria,
      descargandoZip,
      cerrarModalAuditoria,
      descargarExpedienteZip,
      abrirTodosDocumentosPestanas,
      irAlExpedienteEdicion,
      esGestoria,
      modalGastoMensual,
      esAdmin,
      año,
      subiendoGastoMensual,
      setSubiendoGastoMensual,
      recargarGastosEstructura,
      fuenteGastosEstructura,
      cerrarModalGastoMensual,
    }),
    [
      modalAuditoria,
      cargandoAuditoria,
      datosAuditoria,
      descargandoZip,
      cerrarModalAuditoria,
      descargarExpedienteZip,
      abrirTodosDocumentosPestanas,
      irAlExpedienteEdicion,
      esGestoria,
      modalGastoMensual,
      esAdmin,
      año,
      subiendoGastoMensual,
      recargarGastosEstructura,
      fuenteGastosEstructura,
      cerrarModalGastoMensual,
    ]
  )

  return {
    abrirModalAuditoria,
    abrirModalGastoMensual,
    borrarFacturaEstructura,
    descargarPackEstructuraMes,
    descargandoPackMes,
    cierresModalsLayerProps,
    generarGastosMensualesPlantilla,
    generandoGastosMes,
    guardarEdicionGastoEstructura,
  }
}
