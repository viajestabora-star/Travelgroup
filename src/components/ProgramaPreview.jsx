import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Download, Map, Maximize2, X } from 'lucide-react'
import {
  BUCKET_PROGRAMAS_VIAJE,
  crearSignedUrlProgramaViaje,
  resolverRutaProgramaSeguraParaLectura,
} from '../utils/programaViajeStorage'

/**
 * Banner del programa de viaje (bucket privado): URL firmada ~1 h, descarga directa, modal pantalla completa.
 */
const ProgramaPreview = ({ supabase, empresaId, expedienteId, valorAlmacenadoBd }) => {
  const [open, setOpen] = useState(true)
  const [signedUrl, setSignedUrl] = useState(null)
  const [cargandoUrl, setCargandoUrl] = useState(false)
  const [errorUrl, setErrorUrl] = useState(null)
  const [modalFullscreen, setModalFullscreen] = useState(false)
  const [descargando, setDescargando] = useState(false)

  const storagePath = useMemo(
    () => resolverRutaProgramaSeguraParaLectura(empresaId, expedienteId, valorAlmacenadoBd),
    [empresaId, expedienteId, valorAlmacenadoBd],
  )

  const refrescarSignedUrl = useCallback(async () => {
    if (!storagePath || !supabase) {
      setSignedUrl(null)
      setErrorUrl(null)
      return
    }
    setCargandoUrl(true)
    setErrorUrl(null)
    try {
      const { url, error } = await crearSignedUrlProgramaViaje(supabase, storagePath)
      if (error) throw error
      setSignedUrl(url)
    } catch (e) {
      setSignedUrl(null)
      setErrorUrl(e?.message || String(e))
    } finally {
      setCargandoUrl(false)
    }
  }, [supabase, storagePath])

  useEffect(() => {
    refrescarSignedUrl()
  }, [refrescarSignedUrl])

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
      a.download = 'programa.pdf'
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(href), 60_000)
    } catch (e) {
      window.alert(e?.message || 'No se pudo descargar el programa.')
    } finally {
      setDescargando(false)
    }
  }

  const abrirFullscreen = () => {
    if (signedUrl) setModalFullscreen(true)
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left bg-white border-b border-slate-200 hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-navy-900">
          <Map size={18} className="text-blue-600 shrink-0" />
          Consultar Itinerario
        </span>
        {open ? <ChevronUp size={18} className="text-slate-500" /> : <ChevronDown size={18} className="text-slate-500" />}
      </button>
      {open && (
        <div className="p-3 bg-white space-y-2">
          {!storagePath ? (
            <p className="text-xs text-slate-500 text-center py-8 px-2">
              No hay programa de viaje cargado. Sube un PDF desde la cabecera del expediente.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => descargarOriginal()}
                  disabled={descargando}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Download size={14} />
                  {descargando ? 'Descargando…' : 'Descargar Programa'}
                </button>
                {cargandoUrl && <span className="text-[11px] text-slate-500">Preparando vista…</span>}
                {errorUrl && <span className="text-[11px] text-red-600">{errorUrl}</span>}
              </div>
              <button
                type="button"
                onClick={abrirFullscreen}
                disabled={!signedUrl}
                className="relative w-full rounded-lg border border-slate-200 overflow-hidden bg-slate-100 text-left group disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ height: 200 }}
                title={signedUrl ? 'Ver a pantalla completa' : 'Esperando URL firmada'}
              >
                {signedUrl ? (
                  <>
                    <iframe
                      key={signedUrl}
                      title="Programa de viaje (vista previa)"
                      src={signedUrl}
                      className="w-full h-[200px] border-0 pointer-events-none bg-white"
                    />
                    <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-navy-900/85 text-white text-[10px] font-semibold px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Maximize2 size={12} />
                      Pantalla completa
                    </span>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-500 px-2">
                    {cargandoUrl ? 'Cargando vista del PDF…' : 'No se pudo mostrar el PDF.'}
                  </div>
                )}
              </button>
            </>
          )}
        </div>
      )}

      {modalFullscreen && signedUrl && (
        <div
          className="fixed inset-0 z-[120] flex flex-col bg-black/90 p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Programa de viaje"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 pb-3">
            <button
              type="button"
              onClick={() => descargarOriginal()}
              disabled={descargando}
              className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-50"
            >
              <Download size={18} />
              Descargar Programa
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
          <iframe title="Programa de viaje" src={signedUrl} className="min-h-0 flex-1 w-full rounded-lg border-0 bg-white" />
        </div>
      )}
    </div>
  )
}

export default ProgramaPreview
