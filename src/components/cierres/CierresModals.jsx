import React, { useCallback, useEffect, useState } from 'react'
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
import { NOMBRES_MES, n, formatEuroAmount, formInicialGastoMensual } from '../../utils/historialCierresFormat'
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
} from '../../utils/historialCierresShared'

export function useCierresModals({ esAdmin, esGestoria, año, cierres, gastosEstructura, recargarGastosEstructura }) {
  const navigate = useNavigate()
  const [modalAuditoria, setModalAuditoria] = useState(null)
  const [cargandoAuditoria, setCargandoAuditoria] = useState(false)
  const [datosAuditoria, setDatosAuditoria] = useState({ pagos: [], facturasCliente: [] })
  const [descargandoZip, setDescargandoZip] = useState(false)
  const [subiendoGastoMensual, setSubiendoGastoMensual] = useState(false)
  const [descargandoPackMes, setDescargandoPackMes] = useState(null)
  const [modalGastoMensual, setModalGastoMensual] = useState(null)
  const [formGastoMensual, setFormGastoMensual] = useState({
    categoria: 'arsys',
    proveedorOtro: '',
    concepto: '',
    importeConIva: '',
    fecha: '',
  })
  const [archivoGastoMensual, setArchivoGastoMensual] = useState(null)

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
    setArchivoGastoMensual(null)
  }, [])

  const abrirModalGastoMensual = useCallback(
    (mesNum) => {
      const y = parseInt(año, 10)
      if (!Number.isFinite(y)) return
      setFormGastoMensual(formInicialGastoMensual(String(y), mesNum))
      setArchivoGastoMensual(null)
      setModalGastoMensual({ mesNum })
    },
    [año]
  )

  const guardarGastoMensualDesdeModal = useCallback(async () => {
    if (!esAdmin || !modalGastoMensual) return
    const anioEjercicio = parseInt(año, 10)
    const cat = String(formGastoMensual.categoria || 'arsys')
    const proveedorOtro = String(formGastoMensual.proveedorOtro || '').trim()
    const proveedor =
      cat === 'otro'
        ? proveedorOtro
        : (PROVEEDORES_FIJOS_MENSUALES.find((c) => c.id === cat)?.label || '').trim()
    const mesNumModal = modalGastoMensual.mesNum
    const nombreMesModal = NOMBRES_MES[mesNumModal - 1] || ''
    let concepto = String(formGastoMensual.concepto || '').trim()
    const importeConIva = parseFloat(String(formGastoMensual.importeConIva || '').replace(',', '.'))
    const fechaStr = String(formGastoMensual.fecha || '').trim()
    const file = archivoGastoMensual

    if (!proveedor) {
      alert(cat === 'otro' ? 'Indica el nombre del proveedor (Otro).' : 'Selecciona un proveedor.')
      return
    }
    if (!concepto) {
      concepto = `${proveedor} — ${nombreMesModal} ${anioEjercicio}`.trim()
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
    const mesContable = fd.getMonth() + 1
    const anioContable = fd.getFullYear()
    if (anioContable !== anioEjercicio) {
      alert(`La fecha debe pertenecer al ejercicio ${anioEjercicio} (año del selector superior).`)
      return
    }
    if (!file || file.type !== 'application/pdf') {
      alert('Selecciona un archivo PDF.')
      return
    }

    setSubiendoGastoMensual(true)
    let pathStorage = null
    try {
      pathStorage = await subirPdfFacturaProveedorComoExpediente(file)
      const { error: insErr } = await supabase.from('gastos_fijos').insert({
        concepto,
        proveedor,
        importe: importeConIva,
        importe_iva: 0,
        url_pdf: pathStorage,
        mes: mesContable,
        anio: anioContable,
        fecha_factura: fechaStr,
        activo: true,
        periodicidad: 'mensual',
      })
      if (insErr) {
        if (pathStorage) await supabase.storage.from(BUCKET_FACTURAS_PROVEEDORES).remove([pathStorage])
        alert(
          `${insErr.message}\n\nEjecuta en Supabase: add-gastos-fijos-estructura-mensual.sql, add-gastos-fijos-fecha-factura.sql, add-gastos-fijos-importe-iva.sql`
        )
        return
      }
      cerrarModalGastoMensual()
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
  }, [esAdmin, modalGastoMensual, año, formGastoMensual, archivoGastoMensual, recargarGastosEstructura, cerrarModalGastoMensual])

  const borrarFacturaEstructura = useCallback(
    async (row) => {
      if (!esAdmin) return
      if (!window.confirm('¿Eliminar esta factura de estructura y su PDF?')) return
      try {
        if (row.url_pdf) await eliminarObjetoStorageFacturaProveedor(row.url_pdf)
        const { error } = await supabase.from('gastos_fijos').delete().eq('id', row.id)
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
    [esAdmin, recargarGastosEstructura]
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
        (g) => Number(g.mes) === mesNum && Number(g.anio) === anioNum && g.url_pdf
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
              const deseado = nombrePdfEnZipEstructura(nombreMes, f.proveedor, f.importe)
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

  const CierresModalsLayer = useCallback(
    function CierresModalsLayer() {
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
                            { label: 'Beneficio neto', value: fin.beneficioNeto, color: fin.beneficioNeto >= 0 ? 'text-blue-800' : 'text-red-800', bg: fin.beneficioNeto >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100' },
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
                                <p className="text-xs text-slate-500">{p.concepto || p.numero_factura || '—'} · {formatEuroAmount(p.importe_pagado)}</p>
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
                                <p className="text-xs text-slate-600">{f.cliente_nombre || 'Cliente'} · {formatEuroAmount(f.importe_total)}</p>
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
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div>
                <h2 id="modal-gasto-mensual-titulo" className="text-lg font-black text-slate-900 tracking-tight">
                  Añadir Gasto de Estructura
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Bloque sugerido: {NOMBRES_MES[modalGastoMensual.mesNum - 1]} · Ejercicio {año}
                </p>
              </div>
              <button
                type="button"
                disabled={subiendoGastoMensual}
                onClick={cerrarModalGastoMensual}
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
                Concepto <span className="font-normal text-slate-400">(opcional)</span>
                <input
                  type="text"
                  value={formGastoMensual.concepto || ''}
                  onChange={(e) => setFormGastoMensual((p) => ({ ...p, concepto: e.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="Si lo dejas vacío, se genera a partir del proveedor y el mes"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Importe (con IVA)
                <input
                  type="text"
                  inputMode="decimal"
                  value={formGastoMensual.importeConIva || ''}
                  onChange={(e) => setFormGastoMensual((p) => ({ ...p, importeConIva: e.target.value }))}
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
              {(() => {
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
              })()}
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
                El PDF se sube al bucket <code className="bg-slate-100 px-1 rounded">facturas_proveedores</code> con el mismo
                criterio que en expedientes (<code className="bg-slate-100 px-1 rounded">fac-{'{timestamp}'}.pdf</code>).
              </p>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                disabled={subiendoGastoMensual}
                onClick={cerrarModalGastoMensual}
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
          </div>
        </div>
      )}
        </>
      )
    },
    [
      modalAuditoria,
      modalGastoMensual,
      esAdmin,
      esGestoria,
      año,
      cargandoAuditoria,
      datosAuditoria,
      descargandoZip,
      subiendoGastoMensual,
      formGastoMensual,
      archivoGastoMensual,
      cerrarModalAuditoria,
      cerrarModalGastoMensual,
      descargarExpedienteZip,
      abrirTodosDocumentosPestanas,
      irAlExpedienteEdicion,
      guardarGastoMensualDesdeModal,
    ]
  )

  return {
    abrirModalAuditoria,
    abrirModalGastoMensual,
    borrarFacturaEstructura,
    descargarPackEstructuraMes,
    descargandoPackMes,
    CierresModalsLayer,
  }
}
