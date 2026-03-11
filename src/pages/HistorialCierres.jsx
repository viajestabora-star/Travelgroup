import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Eye, TrendingUp, FileSpreadsheet } from 'lucide-react'
import { supabase } from '../supabase'

const HistorialCierres = () => {
  const navigate = useNavigate()
  const [cierres, setCierres] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    cargarCierres()
  }, [])

  const cargarCierres = async () => {
    setCargando(true)
    try {
      const { data, error } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, nombre_grupo, cliente_nombre, destino, total_ingresos, fecha_inicio, cierre_grupo, informe_gastos_hacienda, total_gastos_reales, liquidacion_final_beneficio')
        .or('estado.eq.Cerrado,estado.ilike.cerrado')
        .order('fecha_inicio', { ascending: false, nullsFirst: false })

      if (error) {
        setCierres([])
        return
      }

      const mapeados = (data || []).map((exp) => {
        const cg = exp.cierre_grupo?.ingresos_totales ?? exp.cierre_grupo?.total_ingresos
        const ingresoTotal = parseFloat(cg ?? exp.total_ingresos ?? 0)
        const res = exp.informe_gastos_hacienda?.resumen
        const gastoReal = parseFloat(res?.total_gastos_reales ?? exp.total_gastos_reales ?? 0)
        const beneficioBruto = parseFloat(res?.liquidacion_final_beneficio ?? exp.liquidacion_final_beneficio ?? exp.cierre_grupo?.beneficio_limpio ?? exp.cierre_grupo?.beneficio ?? 0)
        const ivaSobreBeneficio = res?.iva_sobre_beneficio ?? (beneficioBruto > 0 ? beneficioBruto * 0.21 : 0)
        const beneficioNeto = res?.beneficio_neto_real ?? (beneficioBruto - ivaSobreBeneficio)
        const fechaCierre = exp.cierre_grupo?.fecha ? new Date(exp.cierre_grupo.fecha) : (res?.updated_at ? new Date(res.updated_at) : (exp.fecha_inicio ? new Date(exp.fecha_inicio) : null))

        return {
          ...exp,
          ingresoTotal,
          gastoReal,
          ivaSobreBeneficio,
          beneficioNeto,
          fechaCierre,
        }
      })

      mapeados.sort((a, b) => {
        const fa = a.fechaCierre ? a.fechaCierre.getTime() : 0
        const fb = b.fechaCierre ? b.fechaCierre.getTime() : 0
        return fb - fa
      })

      setCierres(mapeados)
    } catch (err) {
      setCierres([])
    } finally {
      setCargando(false)
    }
  }

  const exportarExcel = () => {
    if (cierres.length === 0) return
    const BOM = '\uFEFF'
    const headers = ['Fecha', 'Cliente', 'Destino', 'Ingresos (€)', 'Expediente']
    const filas = cierres.map((c) => [
      c.fechaCierre ? c.fechaCierre.toLocaleDateString('es-ES') : '—',
      c.cliente_nombre || c.nombre_grupo || '—',
      c.destino || '—',
      c.ingresoTotal.toFixed(2),
      c.numero_expediente || '—',
    ])
    const csv = [headers.join(';'), ...filas.map((f) => f.join(';'))].join('\n')
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `Historial_Cierres_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const formatearFecha = (fecha) => {
    if (!fecha) return '—'
    return fecha.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const verDetalle = (exp) => {
    navigate('/expedientes', {
      state: { abrirExpedienteId: exp.id, tabInicial: 'cierre' },
    })
  }

  return (
    <div className="p-6 sm:p-8 max-w-[1400px] mx-auto">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Historial de Cierres
          </h1>
          <p className="text-slate-500 font-medium text-sm mt-1">
            Expedientes con estado Cerrado
          </p>
        </div>
        {cierres.length > 0 && (
          <button
            type="button"
            onClick={exportarExcel}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm transition-colors"
          >
            <FileSpreadsheet size={18} />
            Exportar Excel
          </button>
        )}
      </div>

      {cargando ? (
        <div className="py-16 text-center text-slate-500">
          <TrendingUp className="mx-auto text-slate-300 mb-4 animate-pulse" size={48} />
          <p>Cargando cierres...</p>
        </div>
      ) : cierres.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-12 text-center">
          <FileText className="mx-auto text-slate-300 mb-4" size={56} />
          <h3 className="text-xl font-bold text-slate-800 mb-2">No hay expedientes cerrados</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            Los expedientes aparecerán aquí cuando tengan estado Cerrado (Liquidación de Beneficios o Informe Hacienda).
          </p>
        </div>
      ) : (
        <>
          {/* Tabla desktop */}
          <div className="hidden md:block bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="px-4 py-3 text-left font-black uppercase tracking-[0.12em]">Fecha</th>
                  <th className="px-4 py-3 text-left font-black uppercase tracking-[0.12em]">Cliente</th>
                  <th className="px-4 py-3 text-left font-black uppercase tracking-[0.12em]">Destino</th>
                  <th className="px-4 py-3 text-right font-black uppercase tracking-[0.12em]">Ingresos</th>
                  <th className="px-4 py-3 text-center font-black uppercase tracking-[0.12em]">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(cierres || []).map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-700">{formatearFecha(c.fechaCierre)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {c.cliente_nombre || c.nombre_grupo || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{c.destino || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                      {c.ingresoTotal.toFixed(2)} €
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => verDetalle(c)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors"
                      >
                        <Eye size={14} />
                        Ver Detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tarjetas móvil (responsive) */}
          <div className="md:hidden space-y-4">
            {cierres.map((c) => (
              <div
                key={c.id}
                className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden"
              >
                <div className="p-4 border-b border-slate-100">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h3 className="font-bold text-slate-900">
                        {c.cliente_nombre || c.nombre_grupo || '—'}
                      </h3>
                      <p className="text-sm text-slate-500">{c.destino || '—'}</p>
                    </div>
                    <span className="text-xs text-slate-500">{formatearFecha(c.fechaCierre)}</span>
                  </div>
                </div>
                <div className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Ingresos</span>
                    <span className="font-semibold text-emerald-700">{c.ingresoTotal.toFixed(2)} €</span>
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
