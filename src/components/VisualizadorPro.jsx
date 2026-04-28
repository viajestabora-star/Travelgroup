import React from 'react'
import { X, Download, Printer } from 'lucide-react'

const VisualizadorPro = ({
  open,
  src,
  title = 'Documento',
  downloadName = 'documento.pdf',
  onClose,
}) => {
  if (!open || !src) return null

  const imprimir = () => {
    const iframe = document.getElementById('visualizador-pro-iframe')
    const frameWindow = iframe?.contentWindow
    if (frameWindow && typeof frameWindow.print === 'function') {
      frameWindow.focus()
      frameWindow.print()
      return
    }
    window.open(src, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="fixed inset-0 z-[12000] bg-black/70 backdrop-blur-sm">
      <div className="h-full w-full bg-white flex flex-col">
        <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-slate-200 bg-slate-50">
          <h3 className="text-sm sm:text-base font-bold text-slate-800 truncate">{title}</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={imprimir}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs sm:text-sm font-semibold"
            >
              <Printer size={14} />
              Imprimir
            </button>
            <a
              href={src}
              download={downloadName}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs sm:text-sm font-semibold"
            >
              <Download size={14} />
              Descargar
            </a>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-700 text-xs sm:text-sm font-semibold"
            >
              <X size={14} />
              Cerrar
            </button>
          </div>
        </div>
        <div className="flex-1 bg-slate-100">
          <iframe
            id="visualizador-pro-iframe"
            title={title}
            src={src}
            className="h-full w-full border-0"
          />
        </div>
      </div>
    </div>
  )
}

export default VisualizadorPro
