import React, { useState } from 'react'
import { ChevronDown, ChevronUp, Map } from 'lucide-react'

/**
 * Vista embebida del PDF del programa de viaje (itinerario).
 * `key` en el iframe fuerza recarga al cambiar la URL sin F5.
 */
const ProgramaPreview = ({ pdfUrl }) => {
  const [open, setOpen] = useState(true)
  const url = String(pdfUrl || '').trim()

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
        <div className="p-3 bg-white">
          {!url ? (
            <p className="text-xs text-slate-500 text-center py-8 px-2">
              No hay programa de viaje cargado. Sube un PDF desde la cabecera del expediente.
            </p>
          ) : (
            <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-100" style={{ minHeight: 420 }}>
              <iframe
                key={url}
                title="Programa de viaje"
                src={url}
                className="w-full h-[min(70vh,560px)] border-0 bg-white"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ProgramaPreview
