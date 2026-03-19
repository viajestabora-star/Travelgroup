import React, { useState, useCallback } from 'react'
import { ShieldCheck, ShieldAlert, RefreshCw, Wrench, ChevronDown, ChevronUp, X } from 'lucide-react'
import { checkSystemIntegrity, autoCorregirDuraciones } from '../utils/integrityScanner'

// ─── Sub-sección de issues ────────────────────────────────────────────────────
const IssueSection = ({ titulo, issues, accentColor }) => {
  const [expanded, setExpanded] = useState(false)
  if (!issues || issues.length === 0) return null
  return (
    <div className={`rounded-lg border ${accentColor.border} bg-white overflow-hidden`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`w-full flex items-center justify-between px-4 py-3 ${accentColor.bg} hover:opacity-90 transition-opacity`}
      >
        <span className={`font-semibold text-sm ${accentColor.text}`}>
          {titulo} <span className="font-bold">({issues.length})</span>
        </span>
        {expanded ? <ChevronUp size={16} className={accentColor.text} /> : <ChevronDown size={16} className={accentColor.text} />}
      </button>
      {expanded && (
        <ul className="divide-y divide-gray-100 max-h-56 overflow-y-auto">
          {issues.map((issue) => (
            <li key={issue.id} className="px-4 py-2.5 text-xs text-gray-700">
              <p className="font-medium text-gray-900 mb-0.5">{issue.descripcion}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-gray-500">
                <span>Valor actual: <code className="bg-red-50 text-red-700 px-1 rounded">{issue.valorActual ?? '—'}</code></span>
                {issue.correccionSugerida && (
                  <span>Corrección: <code className="bg-green-50 text-green-700 px-1 rounded">{issue.correccionSugerida}</code></span>
                )}
                {!issue.correccionSugerida && (
                  <span className="text-amber-600 font-medium">Requiere revisión manual</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Panel principal ──────────────────────────────────────────────────────────
const IntegrityPanel = ({ onClose }) => {
  const [loading, setLoading]     = useState(false)
  const [fixing, setFixing]       = useState(false)
  const [report, setReport]       = useState(null)
  const [fixResult, setFixResult] = useState(null)

  const runScan = useCallback(async () => {
    setLoading(true)
    setFixResult(null)
    try {
      const result = await checkSystemIntegrity()
      setReport(result)
    } finally {
      setLoading(false)
    }
  }, [])

  const runAutoFix = useCallback(async () => {
    if (!report) return
    const corregibles = report.expedientesDuracionInvalida.filter((i) => i.autoCorregible)
    if (corregibles.length === 0) return
    if (!window.confirm(`¿Corregir automáticamente ${corregibles.length} duración(es) legacy? Esta acción actualiza Supabase.`)) return
    setFixing(true)
    try {
      const result = await autoCorregirDuraciones(report.expedientesDuracionInvalida)
      setFixResult(result)
      // Re-escanear para reflejar los cambios
      const nuevoReport = await checkSystemIntegrity()
      setReport(nuevoReport)
    } finally {
      setFixing(false)
    }
  }, [report])

  const tieneCorregibles = report?.expedientesDuracionInvalida?.some((i) => i.autoCorregible)
  const sistemaLimpio    = report?.totalIssues === 0

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <ShieldCheck size={24} className="text-blue-600" />
            <div>
              <h2 className="text-lg font-bold text-gray-900">Escáner de Integridad</h2>
              <p className="text-xs text-gray-500">Auditoría de datos vs. constraints de Supabase</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Botón escanear */}
          <div className="flex gap-3">
            <button
              onClick={runScan}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl font-semibold text-sm transition-colors"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Escaneando…' : report ? 'Re-escanear' : 'Iniciar escaneo'}
            </button>
            {tieneCorregibles && !fixing && (
              <button
                onClick={runAutoFix}
                disabled={fixing}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold text-sm transition-colors"
              >
                <Wrench size={16} />
                Auto-corregir duraciones ({report.expedientesDuracionInvalida.filter((i) => i.autoCorregible).length})
              </button>
            )}
            {fixing && (
              <div className="flex items-center gap-2 text-amber-600 text-sm font-medium">
                <RefreshCw size={14} className="animate-spin" /> Corrigiendo…
              </div>
            )}
          </div>

          {/* Resultado auto-fix */}
          {fixResult && (
            <div className={`flex items-start gap-3 p-4 rounded-xl border ${fixResult.errores.length === 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
              <ShieldCheck size={18} className={fixResult.errores.length === 0 ? 'text-green-600 shrink-0 mt-0.5' : 'text-amber-600 shrink-0 mt-0.5'} />
              <div className="text-sm">
                <p className="font-semibold text-gray-800">
                  {fixResult.corregidos} expediente{fixResult.corregidos !== 1 ? 's' : ''} corregido{fixResult.corregidos !== 1 ? 's' : ''} automáticamente.
                </p>
                {fixResult.errores.length > 0 && (
                  <ul className="mt-1 text-red-700 space-y-0.5">
                    {fixResult.errores.map((e, i) => <li key={i} className="text-xs">{e}</li>)}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Sin datos aún */}
          {!report && !loading && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <ShieldCheck size={48} className="mb-3 text-gray-200" />
              <p className="text-sm">Pulsa "Iniciar escaneo" para auditar el sistema</p>
            </div>
          )}

          {/* Resumen */}
          {report && (
            <>
              <div className={`flex items-center gap-3 p-4 rounded-xl border ${sistemaLimpio ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                {sistemaLimpio
                  ? <ShieldCheck size={20} className="text-green-600 shrink-0" />
                  : <ShieldAlert size={20} className="text-red-600 shrink-0" />
                }
                <div>
                  <p className={`font-bold text-sm ${sistemaLimpio ? 'text-green-800' : 'text-red-800'}`}>
                    {report.resumen}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Escaneado el {report.timestamp.toLocaleTimeString('es-ES')}
                  </p>
                </div>
              </div>

              <IssueSection
                titulo="Expedientes con duración inválida"
                issues={report.expedientesDuracionInvalida}
                accentColor={{ bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800' }}
              />
              <IssueSection
                titulo="Servicios de cotización sin expediente"
                issues={report.serviciosSinExpediente}
                accentColor={{ bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800' }}
              />
              <IssueSection
                titulo="Cobros sin expediente asociado"
                issues={report.facturasSinServicio}
                accentColor={{ bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800' }}
              />

              {sistemaLimpio && (
                <div className="flex flex-col items-center py-6 text-green-700">
                  <ShieldCheck size={40} className="mb-2 text-green-400" />
                  <p className="font-semibold text-sm">Todos los datos cumplen los constraints</p>
                  <p className="text-xs text-gray-400 mt-1">No se detectaron anomalías</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <p className="text-xs text-gray-400">
            Valores permitidos: <strong>duracion_viaje</strong> → Día completo · Finde · Gran viaje
          </p>
        </div>
      </div>
    </div>
  )
}

export default IntegrityPanel
