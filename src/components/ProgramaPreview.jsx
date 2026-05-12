import React, { useEffect, useMemo, useState } from 'react'
import { Download, Map, Maximize2, RefreshCw, Upload, X } from 'lucide-react'
import {
  BUCKET_PROGRAMAS_VIAJE,
  crearSignedUrlProgramaViaje,
  resolverRutaProgramaDesdeBdFlexible,
} from '../utils/programaViajeStorage'

const BANNER_H = 220
const SIGNED_TTL = 3600

function esErrorObjetoAusenteStorage(err) {
  const m = String(err?.message ?? err ?? '').toLowerCase()
  return (
    m.includes('not found') ||
    m.includes('does not exist') ||
    m.includes('object not found') ||
    m.includes('no such file') ||
    m.includes('404')
  )
}

/**
 * Banner del itinerario (bucket `Programas`, privado): URL firmada 3600 s al cargar y al cambiar `url_programa_pdf`.
 * Estado `pdfUrl` alimenta el iframe. Sin PDF: «Subir Programa». Con PDF: banner + «Cambiar Programa».
 */
const ProgramaPreview = ({
  supabase,
  empresaId,
  empresaIdCarpetaEnBd,
  expedienteId,
  valorAlmacenadoBd,
  onSolicitarSubida,
  subiendoProgramaPdf = false,
}) => {
  const [pdfUrl, setPdfUrl] = useState(null)
  const [cargandoUrl, setCargandoUrl] = useState(false)
  const [errorUrl, setErrorUrl] = useState(null)
  const [modalFullscreen, setModalFullscreen] = useState(false)
  const [descargando, setDescargando] = useState(false)

  const storagePath = useMemo(
    () => resolverRutaProgramaDesdeBdFlexible(empresaId, expedienteId, valorAlmacenadoBd, empresaIdCarpetaEnBd),
    [empresaId, empresaIdCarpetaEnBd, expedienteId, valorAlmacenadoBd],
  )

  useEffect(() => {
    let cancelado = false

    const cargarUrlFirmada = async () => {
      if (!storagePath || !supabase) {
        setPdfUrl(null)
        setErrorUrl(null)
        setCargandoUrl(false)
        return
      }

      setCargandoUrl(true)
      setErrorUrl(null)
      setPdfUrl(null)

      try {
        const { data, error } = await supabase.storage
          .from(BUCKET_PROGRAMAS_VIAJE)
          .createSignedUrl(storagePath, SIGNED_TTL)

        if (cancelado) return

        if (error) {
          if (esErrorObjetoAusenteStorage(error)) {
            console.warn(
              '[ProgramaBanner] La ruta existe en url_programa_pdf pero el objeto no está en Storage (posible borrado).',
              { rutaResuelta: storagePath, valorBd: valorAlmacenadoBd, expedienteId },
            )
          } else {
            console.warn('[ProgramaBanner] createSignedUrl falló.', { rutaResuelta: storagePath, error })
          }
          setPdfUrl(null)
          setErrorUrl(error.message || String(error))
          return
        }

        const url = data?.signedUrl ? String(data.signedUrl).trim() : null
        if (!url) {
          setErrorUrl('No se obtuvo signedUrl')
          return
        }
        setPdfUrl(url)
      } catch (e) {
        if (cancelado) return
        if (esErrorObjetoAusenteStorage(e)) {
          console.warn(
            '[ProgramaBanner] La ruta existe en url_programa_pdf pero el objeto no está en Storage (posible borrado).',
            { rutaResuelta: storagePath, valorBd: valorAlmacenadoBd, expedienteId },
          )
        } else {
          console.warn('[ProgramaBanner] Error al generar URL firmada.', { rutaResuelta: storagePath, error: e })
        }
        setPdfUrl(null)
        setErrorUrl(e?.message || String(e))
      } finally {
        if (!cancelado) setCargandoUrl(false)
      }
    }

    void cargarUrlFirmada()
    return () => {
      cancelado = true
    }
  }, [supabase, storagePath, valorAlmacenadoBd, expedienteId])

  const nombreDescarga = useMemo(() => {
    if (!storagePath) return 'programa.pdf'
    const base = storagePath.split('/').pop()
    return base && base.endsWith('.pdf') ? base : 'programa.pdf'
  }, [storagePath])

  const descargarOriginal = async () => {
    if (!storagePath || !supabase) return
    setDescargando(true)
    try {
      const { data, error } = await supabase.storage.from(BUCKET_PROGRAMAS_VIAJE).download(storagePath)
      if (error) throw error
      if (!data || data.size === 0) throw new Error('Archivo vacío o no encontrado.')
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' })
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = nombreDescarga
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(href), 60_000)
    } catch (e) {
      if (esErrorObjetoAusenteStorage(e)) {
        console.warn(
          '[ProgramaBanner] Descarga: archivo ausente en Storage pero la ruta sigue en BD.',
          { rutaResuelta: storagePath, valorBd: valorAlmacenadoBd },
        )
      }
      window.alert(e?.message || 'No se pudo descargar el programa.')
    } finally {
      setDescargando(false)
    }
  }

  const abrirFullscreen = () => {
    if (pdfUrl) setModalFullscreen(true)
  }

  const solicitarSubida = () => {
    if (typeof onSolicitarSubida === 'function') onSolicitarSubida()
  }

  if (!storagePath) {
    return (
      <div className="w-full rounded-xl border-2 border-dashed border-blue-200 bg-gradient-to-br from-blue-50/90 to-white p-6 sm:p-8 text-center shadow-sm">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-700">
            <Map size={28} />
          </div>
          <div>
            <p className="text-sm font-bold text-navy-900">Programa de viaje (PDF)</p>
            <p className="mt-1 text-xs text-slate-600">Aún no hay itinerario. Sube un PDF para que aparezca aquí como banner en todo el expediente.</p>
          </div>
          <button
            type="button"
            onClick={solicitarSubida}
            disabled={subiendoProgramaPdf}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-md transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload size={18} />
            {subiendoProgramaPdf ? 'Subiendo…' : 'Subir Programa'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2 sm:px-4">
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-navy-900 sm:text-sm">
          <Map size={16} className="shrink-0 text-blue-600" />
          Itinerario
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => descargarOriginal()}
            disabled={descargando}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download size={14} />
            {descargando ? 'Descargando…' : 'Descargar'}
          </button>
          <button
            type="button"
            onClick={solicitarSubida}
            disabled={subiendoProgramaPdf}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50"
          >
            <RefreshCw size={14} className={subiendoProgramaPdf ? 'animate-spin' : ''} />
            {subiendoProgramaPdf ? 'Subiendo…' : 'Cambiar Programa'}
          </button>
          {cargandoUrl && <span className="text-[11px] text-slate-500">Preparando vista…</span>}
          {errorUrl && <span className="max-w-[200px] truncate text-[11px] text-red-600" title={errorUrl}>{errorUrl}</span>}
        </div>
      </div>

      <div className="p-2 sm:p-3">
        <button
          type="button"
          onClick={abrirFullscreen}
          disabled={!pdfUrl}
          className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-left outline-none ring-offset-2 transition-shadow hover:ring-2 hover:ring-blue-400/40 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ height: BANNER_H }}
          title={pdfUrl ? 'Pantalla completa' : 'Esperando URL firmada'}
        >
          {pdfUrl ? (
            <>
              <iframe
                key={pdfUrl}
                title="Itinerario (vista previa)"
                src={pdfUrl}
                className="pointer-events-none w-full border-0 bg-white"
                style={{ height: BANNER_H }}
              />
              <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-navy-900/85 px-2 py-1 text-[10px] font-semibold text-white">
                <Maximize2 size={12} />
                Ampliar
              </span>
            </>
          ) : (
            <div className="flex h-full items-center justify-center px-2 text-xs text-slate-500">
              {cargandoUrl ? 'Cargando PDF…' : 'No se pudo mostrar el PDF.'}
            </div>
          )}
        </button>
      </div>

      {modalFullscreen && pdfUrl && (
        <div
          className="fixed inset-0 z-[120] flex flex-col bg-black/90 p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Itinerario"
        >
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 pb-3">
            <button
              type="button"
              onClick={() => descargarOriginal()}
              disabled={descargando}
              className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-50"
            >
              <Download size={18} />
              Descargar
            </button>
            <button
              type="button"
              onClick={() => setModalFullscreen(false)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
            >
              <X size={18} />
              Cerrar
            </button>
          </div>
          <iframe title="Itinerario" src={pdfUrl} className="min-h-0 w-full flex-1 rounded-lg border-0 bg-white" />
        </div>
      )}
    </div>
  )
}

export default ProgramaPreview
