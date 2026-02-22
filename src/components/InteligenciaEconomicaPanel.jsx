import React, { useState, useEffect } from 'react'
import { TrendingUp, DollarSign, Percent, BarChart3 } from 'lucide-react'
import { supabase } from '../supabase'

const formatearMoneda = (valor) => {
  const n = Number(valor)
  if (isNaN(n)) return '—'
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

const formatearPorcentaje = (valor) => {
  const n = Number(valor)
  if (isNaN(n)) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)} %`
}

const InteligenciaEconomicaPanel = () => {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const cargarDatos = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data: rentabilidadData, error: err } = await supabase
          .from('vista_expedientes_rentabilidad')
          .select('*')
        if (err) {
          setError(err.message)
          setData([])
          return
        }
        setData(Array.isArray(rentabilidadData) ? rentabilidadData : [])
      } catch (e) {
        setError(e?.message || 'Error al cargar datos')
        setData([])
      } finally {
        setLoading(false)
      }
    }
    cargarDatos()
  }, [])

  const kpis = React.useMemo(() => {
    const filas = data || []
    const ingresosTotales = filas.reduce((sum, r) => sum + (Number(r.ingresos_totales_expediente) || 0), 0)
    const costesTotales = filas.reduce((sum, r) => sum + (Number(r.costes_totales_reales_expediente) || 0), 0)
    const beneficioBrutoTotal = filas.reduce((sum, r) => sum + (Number(r.beneficio_bruto_expediente) || 0), 0)
    const margenes = filas.filter(r => r.margen_beneficio_expediente_porcentaje != null).map(r => Number(r.margen_beneficio_expediente_porcentaje))
    const margenPromedio = margenes.length > 0 ? margenes.reduce((a, b) => a + b, 0) / margenes.length : null
    return { ingresosTotales, costesTotales, beneficioBrutoTotal, margenPromedio }
  }, [data])

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-navy-200 border-t-navy-600 rounded-full animate-spin" />
            <p className="text-gray-500 font-medium">Cargando datos de rentabilidad...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="p-4 rounded-xl bg-red-50 border-2 border-red-200 text-red-700">
          <p className="font-semibold">Error al cargar la Central de Inteligencia Financiera</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-navy-900 flex items-center gap-2">
          <BarChart3 size={24} />
          Central de Inteligencia Financiera
        </h2>
      </div>

      {/* Tarjetas de KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl border-2 border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-slate-500 mb-2">
            <DollarSign size={18} />
            <span className="text-sm font-bold uppercase tracking-wider">Ingresos Totales</span>
          </div>
          <p className="text-2xl font-bold text-navy-900">{formatearMoneda(kpis.ingresosTotales)}</p>
        </div>
        <div className="p-5 rounded-xl border-2 border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-slate-500 mb-2">
            <DollarSign size={18} />
            <span className="text-sm font-bold uppercase tracking-wider">Costes Totales</span>
          </div>
          <p className="text-2xl font-bold text-navy-900">{formatearMoneda(kpis.costesTotales)}</p>
        </div>
        <div className="p-5 rounded-xl border-2 border-emerald-200 bg-emerald-50 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-emerald-700 mb-2">
            <TrendingUp size={18} />
            <span className="text-sm font-bold uppercase tracking-wider">Beneficio Bruto Total</span>
          </div>
          <p className={`text-2xl font-bold ${kpis.beneficioBrutoTotal >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
            {formatearMoneda(kpis.beneficioBrutoTotal)}
          </p>
        </div>
        <div className="p-5 rounded-xl border-2 border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-slate-500 mb-2">
            <Percent size={18} />
            <span className="text-sm font-bold uppercase tracking-wider">Margen Promedio</span>
          </div>
          <p className="text-2xl font-bold text-navy-900">{formatearPorcentaje(kpis.margenPromedio)}</p>
        </div>
      </div>

      {/* Tabla de detalle */}
      <div className="rounded-xl border-2 border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
          <h3 className="text-base font-bold text-navy-900">Detalle por expediente</h3>
        </div>
        {data.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <p className="font-medium">No hay datos de rentabilidad disponibles</p>
            <p className="text-sm mt-1">La vista vista_expedientes_rentabilidad no contiene datos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-600 tracking-wider">Nº Expediente</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-600 tracking-wider">Grupo</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-600 tracking-wider">Destino</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-600 tracking-wider">Ingresos</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-600 tracking-wider">Costes</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-600 tracking-wider">Beneficio Bruto</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-600 tracking-wider">Margen %</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, idx) => {
                  const beneficio = Number(row.beneficio_bruto_expediente) || 0
                  return (
                    <tr
                      key={row.id || idx}
                      className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-navy-900">{row.numero_expediente || '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{row.nombre_grupo || '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{row.destino || '—'}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium">{formatearMoneda(row.ingresos_totales_expediente)}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium">{formatearMoneda(row.costes_totales_reales_expediente)}</td>
                      <td className={`px-4 py-3 text-sm text-right font-bold ${beneficio >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {formatearMoneda(row.beneficio_bruto_expediente)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium">{formatearPorcentaje(row.margen_beneficio_expediente_porcentaje)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default InteligenciaEconomicaPanel
