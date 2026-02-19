import React, { useEffect, useState } from 'react'
import { TrendingUp, Wallet, AlertCircle } from 'lucide-react'
import { supabase } from '../supabase'
import { getEjercicioActual, subscribeToEjercicioChanges } from '../utils/ejercicioGlobal'

/**
 * DashboardMetrics - Widgets con suma real de expedientes.
 * Volumen Bruto = sum(presupuesto_total), Ingresos Reales = sum(total_cobrado), Riesgo = Volumen - Ingresos.
 * Filtro temporal: created_at (ejercicio = año).
 */
const DashboardMetrics = () => {
  const [ejercicioActual, setEjercicioActual] = useState(getEjercicioActual())
  const [volumenVentas, setVolumenVentas] = useState(0)
  const [totalIngresado, setTotalIngresado] = useState(0)
  const [deudaPendiente, setDeudaPendiente] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsubscribe = subscribeToEjercicioChanges((nuevoEjercicio) => {
      setEjercicioActual(nuevoEjercicio)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const cargar = async () => {
      setLoading(true)
      setError(null)
      try {
        const inicio = `${ejercicioActual}-01-01T00:00:00`
        const fin = `${ejercicioActual + 1}-01-01T00:00:00`
        const { data, error: err } = await supabase
          .from('expedientes')
          .select('presupuesto_total, total_cobrado')
          .gte('created_at', inicio)
          .lt('created_at', fin)

        if (err) {
          setError(err.message)
          setVolumenVentas(0)
          setTotalIngresado(0)
          setDeudaPendiente(0)
          return
        }

        let vol = 0
        let ing = 0
        ;(data || []).forEach((e) => {
          vol += Number(e.presupuesto_total) || 0
          ing += Number(e.total_cobrado) || 0
        })
        setVolumenVentas(vol)
        setTotalIngresado(ing)
        setDeudaPendiente(vol - ing)
      } catch (e) {
        setError(e?.message || 'Error cargando métricas')
        setVolumenVentas(0)
        setTotalIngresado(0)
        setDeudaPendiente(0)
      } finally {
        setLoading(false)
      }
    }

    cargar()
  }, [ejercicioActual])

  const formatEuro = (n) => (Number(n) || 0).toFixed(2)

  const widgets = [
    { title: 'Volumen Bruto', value: volumenVentas, icon: TrendingUp, color: 'bg-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    { title: 'Ingresos Reales', value: totalIngresado, icon: Wallet, color: 'bg-blue-500', bg: 'bg-blue-50', border: 'border-blue-200' },
    { title: 'Riesgo de Cobro', value: deudaPendiente, icon: AlertCircle, color: 'bg-amber-500', bg: 'bg-amber-50', border: 'border-amber-200' },
  ]

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-navy-900">Métricas en Vivo ({ejercicioActual})</h2>
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {widgets.map((w) => (
            <div key={w.title} className={`card border-2 ${w.border} ${w.bg}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm mb-1">{w.title}</p>
                  <p className="text-2xl font-bold text-navy-900">{formatEuro(w.value)} €</p>
                </div>
                <div className={`p-3 rounded-lg ${w.color}`}>
                  <w.icon className="text-white" size={24} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default DashboardMetrics
