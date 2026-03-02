import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { TrendingUp, Receipt, Wallet, PiggyBank, BarChart3 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts'
import { getEjercicioActual, subscribeToEjercicioChanges } from '../utils/ejercicioGlobal'

/**
 * InteligenciaEconomicaPanel - Panel financiero dinámico desde Supabase.
 * Fetch directo a expedientes. Suma en frontend.
 */
const InteligenciaEconomicaPanel = ({ user }) => {
  const [expedientes, setExpedientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [ejercicioActual, setEjercicioActual] = useState(getEjercicioActual())
  const esAdmin = user?.rol === 'ADMIN'

  useEffect(() => {
    const unsubscribe = subscribeToEjercicioChanges((nuevoEjercicio) => {
      setEjercicioActual(nuevoEjercicio)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!esAdmin) {
      setLoading(false)
      return
    }

    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data, error: dbError } = await supabase
          .from('expedientes')
          .select('presupuesto_total, cuota_iva, beneficio_total, total_gastos_reales')
          .or('estado.ilike.cerrado,estado.ilike.finalizado')

        if (dbError) throw dbError

        const lista = Array.isArray(data) ? data : []
        console.log('Datos recibidos:', lista)

        setExpedientes(lista)
      } catch (err) {
        setError(err?.message || 'Error desconocido')
        setExpedientes([])
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [esAdmin])

  if (!esAdmin) {
    return (
      <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-medium">
        Sin permisos para ver este panel.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="w-12 h-12 border-4 border-navy-200 border-t-navy-600 rounded-full animate-spin mx-auto" />
        <p className="mt-3 text-gray-500">Cargando datos financieros...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
        <span className="font-bold">Error al cargar datos:</span> {error}
      </div>
    )
  }

  const toNum = (v) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : 0)

  const beneficioBruto = expedientes.reduce((acc, e) => acc + toNum(e.presupuesto_total), 0)
  const ivaAcumulado = expedientes.reduce((acc, e) => acc + toNum(e.cuota_iva), 0)
  const beneficioNeto = expedientes.reduce((acc, e) => acc + toNum(e.beneficio_total), 0)
  const gastosReales = expedientes.reduce((acc, e) => acc + toNum(e.total_gastos_reales), 0)

  const formatEuro = (val) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(toNum(val))

  const chartData = [
    { name: 'Ingresos Brutos', valor: beneficioBruto, fill: '#059669' },
    { name: 'Gastos', valor: gastosReales, fill: '#dc2626' },
    { name: 'Beneficio Neto', valor: beneficioNeto, fill: '#7c3aed' },
  ]

  const cards = [
    {
      title: 'Beneficio Bruto Total',
      value: formatEuro(beneficioBruto),
      subtitle: 'Suma de presupuesto_total',
      icon: TrendingUp,
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      iconBg: 'bg-emerald-500',
      iconColor: 'text-white',
    },
    {
      title: 'IVA Acumulado',
      value: formatEuro(ivaAcumulado),
      subtitle: 'Suma de cuota_iva',
      icon: Receipt,
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      iconBg: 'bg-amber-500',
      iconColor: 'text-white',
    },
    {
      title: 'Gastos Totales',
      value: formatEuro(gastosReales),
      subtitle: 'Suma de total_gastos_reales',
      icon: Wallet,
      bg: 'bg-red-50',
      border: 'border-red-200',
      iconBg: 'bg-red-500',
      iconColor: 'text-white',
    },
    {
      title: 'Beneficio Neto',
      value: formatEuro(beneficioNeto),
      subtitle: 'Suma de beneficio_total',
      icon: PiggyBank,
      bg: 'bg-purple-50',
      border: 'border-purple-200',
      iconBg: 'bg-purple-600',
      iconColor: 'text-white',
    },
  ]

  return (
    <div className="animate-in fade-in duration-500 space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-navy-800">
          Resumen Financiero (Cerrado / Finalizado)
        </h2>
        <span className="text-sm text-slate-500 font-medium">{ejercicioActual}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.title}
              className={`p-6 rounded-2xl border-2 ${card.bg} ${card.border} shadow-sm hover:shadow-md transition-shadow`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-600 mb-1">{card.title}</p>
                  <p className="text-2xl font-black text-slate-900 truncate">{card.value}</p>
                  <p className="text-xs text-slate-500 mt-1">{card.subtitle}</p>
                </div>
                <div className={`flex-shrink-0 w-12 h-12 rounded-xl ${card.iconBg} ${card.iconColor} flex items-center justify-center`}>
                  <Icon size={24} strokeWidth={2.5} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
          <BarChart3 size={22} className="text-navy-600" />
          <h3 className="text-base font-bold text-slate-800">Comparativa: Ingresos vs Gastos vs Beneficio Neto</h3>
        </div>
        <div className="p-6">
          {expedientes.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
              No hay expedientes cerrados o finalizados.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k €`} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  formatter={(value) => [formatEuro(value), '']}
                  labelFormatter={(label) => label}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }}
                />
                <Legend />
                <Bar dataKey="valor" name="Importe" radius={[8, 8, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}

export default InteligenciaEconomicaPanel
