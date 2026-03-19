import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Eye, TrendingUp, FileSpreadsheet, Filter } from 'lucide-react'
import { supabase } from '../supabase'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const n = (v) => parseFloat(v ?? 0) || 0

const getQuarter = (date) => {
  if (!date) return null
  const month = date.getMonth() // 0-based
  return Math.floor(month / 3) + 1 // 1..4
}

const TRIMESTRES = [
  { value: 'all', label: 'Todos los trimestres' },
  { value: '1',   label: 'Q1 — Ene / Feb / Mar' },
  { value: '2',   label: 'Q2 — Abr / May / Jun' },
  { value: '3',   label: 'Q3 — Jul / Ago / Sep' },
  { value: '4',   label: 'Q4 — Oct / Nov / Dic' },
]

const añoActual = new Date().getFullYear()
const AÑOS_DISPONIBLES = Array.from({ length: 5 }, (_, i) => añoActual - i)

// ─── Component ────────────────────────────────────────────────────────────────

const HistorialCierres = () => {
  const navigate = useNavigate()

  const [cierres,   setCierres]   = useState([])
  const [cargando,  setCargando]  = useState(true)
  const [trimestre, setTrimestre] = useState('all')
  const [año,       setAño]       = useState(String(añoActual))

  useEffect(() => { cargarCierres() }, [])

  const cargarCierres = async () => {
    setCargando(true)
    try {
      const { data, error } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, nombre_grupo, cliente_nombre, destino, total_ingresos, fecha_inicio, cierre_grupo, informe_gastos_hacienda, total_gastos_reales, liquidacion_final_beneficio')
        .or('estado.eq.Cerrado,estado.ilike.cerrado,estado.ilike.finalizado')
        .order('fecha_inicio', { ascending: false, nullsFirst: false })

      if (error) { setCierres([]); return }

      const mapeados = (data || []).map((exp) => {
        const cg           = exp.cierre_grupo?.ingresos_totales ?? exp.cierre_grupo?.total_ingresos
        const ingresoTotal = n(cg ?? exp.total_ingresos)
        const res          = exp.informe_gastos_hacienda?.resumen
        const gastoReal    = n(res?.total_gastos_reales ?? exp.total_gastos_reales)
        const beneficioBruto = n(res?.liquidacion_final_beneficio ?? exp.liquidacion_final_beneficio ?? exp.cierre_grupo?.beneficio_limpio ?? exp.cierre_grupo?.beneficio)
        const ivaSobreBeneficio = res?.iva_sobre_beneficio ?? (beneficioBruto > 0 ? beneficioBruto * 0.21 : 0)
        const beneficioNeto  = n(res?.beneficio_neto_real ?? (beneficioBruto - ivaSobreBeneficio))
        const fechaCierre    = exp.cierre_grupo?.fecha
          ? new Date(exp.cierre_grupo.fecha)
          : res?.updated_at
            ? new Date(res.updated_at)
            : exp.fecha_inicio
              ? new Date(exp.fecha_inicio)
              : null

        return { ...exp, ingresoTotal, gastoReal, ivaSobreBeneficio, beneficioNeto, fechaCierre }
      })

      mapeados.sort((a, b) => (b.fechaCierre?.getTime() ?? 0) - (a.fechaCierre?.getTime() ?? 0))
      setCierres(mapeados)
    } catch {
      setCierres([])
    } finally {
      setCargando(false)
    }
  }

  // ── Filtrado por año y trimestre ──────────────────────────────────────────
  const cierresFiltrados = useMemo(() => {
    return cierres.filter((c) => {
      const fecha = c.fechaCierre
      if (!fecha) return true // sin fecha → siempre incluir (evitar pérdida de datos)

      const coincideAño = String(fecha.getFullYear()) === año
      if (!coincideAño) return false
      if (trimestre === 'all') return true
      return getQuarter(fecha) === parseInt(trimestre, 10)
    })
  }, [cierres, año, trimestre])

  // ── Totales del periodo filtrado ──────────────────────────────────────────
  const totales = useMemo(() => ({
    ingresos:   cierresFiltrados.reduce((s, c) => s + c.ingresoTotal, 0),
    gastos:     cierresFiltrados.reduce((s, c) => s + c.gastoReal,    0),
    beneficio:  cierresFiltrados.reduce((s, c) => s + c.beneficioNeto, 0),
  }), [cierresFiltrados])

  // ── Exportar Excel (CSV con BOM para Excel) ───────────────────────────────
  const exportarExcel = () => {
    if (cierresFiltrados.length === 0) return

    const labelPeriodo = trimestre === 'all'
      ? año
      : `${año}_Q${trimestre}`

    const BOM = '\uFEFF'
    const SEP = ';'

    const cabecera = [
      'ID Expediente',
      'Cliente',
      'Fecha de Cierre',
      'Total Ingresos (€)',
      'Total Gastos Proveedores (€)',
      'Beneficio Real (€)',
    ]

    const filas = cierresFiltrados.map((c) => [
      c.numero_expediente || c.id?.substring(0, 8) || '—',
      c.cliente_nombre || c.nombre_grupo || '—',
      c.fechaCierre ? c.fechaCierre.toLocaleDateString('es-ES') : '—',
      c.ingresoTotal.toFixed(2),
      c.gastoReal.toFixed(2),    // 0.00 si no hay gastos — nunca da error
      c.beneficioNeto.toFixed(2),
    ])

    // Fila de totales al final
    const filaTotales = [
      'TOTALES',
      '',
      '',
      totales.ingresos.toFixed(2),
      totales.gastos.toFixed(2),
      totales.beneficio.toFixed(2),
    ]

    const contenido = [
      cabecera.join(SEP),
      ...filas.map((f) => f.join(SEP)),
      '',
      filaTotales.join(SEP),
    ].join('\n')

    const blob = new Blob([BOM + contenido], { type: 'text/csv;charset=utf-8' })
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = `Historial_Cierres_${labelPeriodo}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const formatearFecha = (fecha) => {
    if (!fecha) return '—'
    return fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const verDetalle = (exp) => {
    navigate('/expedientes', { state: { abrirExpedienteId: exp.id, tabInicial: 'cierre' } })
  }

  const etiquetaPeriodo = trimestre === 'all'
    ? `Todo ${año}`
    : `${TRIMESTRES.find((t) => t.value === trimestre)?.label ?? ''} · ${año}`

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 sm:p-8 max-w-[1400px] mx-auto">

      {/* ── Cabecera ────────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Historial de Cierres
          </h1>
          <p className="text-slate-500 font-medium text-sm mt-1">
            Expedientes cerrados · {etiquetaPeriodo}
          </p>
        </div>

        {/* ── Controles de filtro + exportar ────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Selector de año */}
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-slate-400 shrink-0" />
            <select
              value={año}
              onChange={(e) => setAño(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {AÑOS_DISPONIBLES.map((a) => (
                <option key={a} value={String(a)}>{a}</option>
              ))}
            </select>
          </div>

          {/* Selector de trimestre */}
          <select
            value={trimestre}
            onChange={(e) => setTrimestre(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {TRIMESTRES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          {/* Botón exportar */}
          <button
            type="button"
            onClick={exportarExcel}
            disabled={cierresFiltrados.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold shadow-sm transition-colors text-sm"
          >
            <FileSpreadsheet size={16} />
            Exportar Excel
          </button>
        </div>
      </div>

      {/* ── Tarjetas de resumen del periodo ─────────────────────────────────── */}
      {!cargando && cierresFiltrados.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Ingresos',          value: totales.ingresos,  color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
            { label: 'Total Gastos Proveedores', value: totales.gastos,   color: 'text-red-700',     bg: 'bg-red-50 border-red-200'         },
            { label: 'Beneficio Real',           value: totales.beneficio, color: totales.beneficio >= 0 ? 'text-blue-700' : 'text-red-700', bg: totales.beneficio >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200' },
          ].map((card) => (
            <div key={card.label} className={`rounded-xl border p-4 ${card.bg}`}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{card.label}</p>
              <p className={`text-2xl font-extrabold ${card.color}`}>{card.value.toFixed(2)} €</p>
              <p className="text-xs text-slate-400 mt-0.5">{cierresFiltrados.length} expediente{cierresFiltrados.length !== 1 ? 's' : ''}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Contenido principal ─────────────────────────────────────────────── */}
      {cargando ? (
        <div className="py-16 text-center text-slate-500">
          <TrendingUp className="mx-auto text-slate-300 mb-4 animate-pulse" size={48} />
          <p>Cargando cierres...</p>
        </div>

      ) : cierresFiltrados.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-12 text-center">
          <FileText className="mx-auto text-slate-300 mb-4" size={56} />
          <h3 className="text-xl font-bold text-slate-800 mb-2">
            {cierres.length === 0
              ? 'No hay expedientes cerrados'
              : `Sin cierres en ${etiquetaPeriodo}`}
          </h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            {cierres.length === 0
              ? 'Los expedientes aparecerán aquí cuando tengan estado Cerrado.'
              : 'Prueba a cambiar el año o el trimestre para ver otros períodos.'}
          </p>
        </div>

      ) : (
        <>
          {/* ── Tabla desktop ───────────────────────────────────────────────── */}
          <div className="hidden md:block bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="px-4 py-3 text-left font-black uppercase tracking-[0.12em]">Nº Exp.</th>
                  <th className="px-4 py-3 text-left font-black uppercase tracking-[0.12em]">Cliente</th>
                  <th className="px-4 py-3 text-left font-black uppercase tracking-[0.12em]">Destino</th>
                  <th className="px-4 py-3 text-left font-black uppercase tracking-[0.12em]">Fecha Cierre</th>
                  <th className="px-4 py-3 text-right font-black uppercase tracking-[0.12em]">Ingresos</th>
                  <th className="px-4 py-3 text-right font-black uppercase tracking-[0.12em]">Gastos Prov.</th>
                  <th className="px-4 py-3 text-right font-black uppercase tracking-[0.12em]">Beneficio</th>
                  <th className="px-4 py-3 text-center font-black uppercase tracking-[0.12em]">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cierresFiltrados.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.numero_expediente || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{c.cliente_nombre || c.nombre_grupo || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{c.destino || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatearFecha(c.fechaCierre)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">
                      {c.ingresoTotal.toFixed(2)} €
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">
                      {c.gastoReal > 0
                        ? <span className="text-red-600 font-medium">{c.gastoReal.toFixed(2)} €</span>
                        : <span className="text-slate-400 text-xs italic">0,00 €</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                      <span className={c.beneficioNeto >= 0 ? 'text-blue-700' : 'text-red-600'}>
                        {c.beneficioNeto.toFixed(2)} €
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => verDetalle(c)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors"
                      >
                        <Eye size={14} />
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Fila de totales */}
              <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                <tr>
                  <td colSpan={4} className="px-4 py-3 font-black text-slate-700 uppercase text-xs tracking-widest">
                    TOTALES ({cierresFiltrados.length})
                  </td>
                  <td className="px-4 py-3 text-right font-black text-emerald-700">{totales.ingresos.toFixed(2)} €</td>
                  <td className="px-4 py-3 text-right font-black text-red-600">{totales.gastos.toFixed(2)} €</td>
                  <td className="px-4 py-3 text-right font-black">
                    <span className={totales.beneficio >= 0 ? 'text-blue-700' : 'text-red-600'}>
                      {totales.beneficio.toFixed(2)} €
                    </span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── Tarjetas móvil ──────────────────────────────────────────────── */}
          <div className="md:hidden space-y-4">
            {cierresFiltrados.map((c) => (
              <div key={c.id} className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="text-xs font-mono text-slate-400 mb-0.5">{c.numero_expediente || '—'}</p>
                      <h3 className="font-bold text-slate-900">{c.cliente_nombre || c.nombre_grupo || '—'}</h3>
                      <p className="text-sm text-slate-500">{c.destino || '—'}</p>
                    </div>
                    <span className="text-xs text-slate-500 whitespace-nowrap">{formatearFecha(c.fechaCierre)}</span>
                  </div>
                </div>
                <div className="p-4 grid grid-cols-3 gap-2 text-sm">
                  <div className="text-center">
                    <p className="text-xs text-slate-400 mb-0.5">Ingresos</p>
                    <p className="font-bold text-emerald-700">{c.ingresoTotal.toFixed(2)} €</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-400 mb-0.5">Gastos</p>
                    <p className={`font-bold ${c.gastoReal > 0 ? 'text-red-600' : 'text-slate-400'}`}>{c.gastoReal.toFixed(2)} €</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-400 mb-0.5">Beneficio</p>
                    <p className={`font-bold ${c.beneficioNeto >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{c.beneficioNeto.toFixed(2)} €</p>
                  </div>
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => verDetalle(c)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-colors"
                  >
                    <Eye size={18} />
                    Ver Detalle
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default HistorialCierres
