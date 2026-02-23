import React, { useState, useEffect } from 'react'
import { TrendingUp, DollarSign, BarChart3 } from 'lucide-react'
import { supabase } from '../supabase'

const formatearMoneda = (valor) => {
  const n = Number(valor)
  if (isNaN(n)) return '—'
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

const InteligenciaEconomicaPanel = () => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [ocultarPorEmail, setOcultarPorEmail] = useState(false)

  useEffect(() => {
    const cargarDatos = async () => {
      setLoading(true)
      setError(null)
      setOcultarPorEmail(false)

      try {
        // Seguridad: si el email es grupos@viajestabora.com, no mostrar el panel
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.email?.toLowerCase?.() === 'grupos@viajestabora.com') {
          setOcultarPorEmail(true)
          setLoading(false)
          return
        }

        const { data: vistaData, error: err } = await supabase
          .from('vista_global_financiera')
          .select('*')
          .single()

        if (err) {
          setError(err.message)
          setData(null)
          return
        }
        setData(vistaData)
      } catch (e) {
        setError(e?.message || 'Error al cargar datos')
        setData(null)
      } finally {
        setLoading(false)
      }
    }
    cargarDatos()
  }, [])

  // Seguridad: no mostrar nada si el email es grupos@viajestabora.com
  if (ocultarPorEmail) return null

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-navy-200 border-t-navy-600 rounded-full animate-spin" />
            <p className="text-gray-500 font-medium">Cargando KPIs financieros...</p>
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

  const kpis = data || {}

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-navy-900 flex items-center gap-2">
          <BarChart3 size={24} />
          Central de Inteligencia Financiera
        </h2>
      </div>

      {/* Tarjetas de KPIs desde vista_global_financiera */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl border-2 border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-slate-500 mb-2">
            <DollarSign size={18} />
            <span className="text-sm font-bold uppercase tracking-wider">Ingresos Brutos Totales</span>
          </div>
          <p className="text-2xl font-bold text-navy-900">{formatearMoneda(kpis.ingresos_brutos_totales)}</p>
        </div>

        <div className="p-5 rounded-xl border-2 border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-slate-500 mb-2">
            <DollarSign size={18} />
            <span className="text-sm font-bold uppercase tracking-wider">Costes Variables Totales</span>
          </div>
          <p className="text-2xl font-bold text-navy-900">{formatearMoneda(kpis.costes_variables_totales)}</p>
        </div>

        <div className="p-5 rounded-xl border-2 border-emerald-200 bg-emerald-50 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-emerald-700 mb-2">
            <TrendingUp size={18} />
            <span className="text-sm font-bold uppercase tracking-wider">Beneficio Bruto de Viajes</span>
          </div>
          <p className={`text-2xl font-bold ${(Number(kpis.beneficio_bruto_expedientes) || 0) >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
            {formatearMoneda(kpis.beneficio_bruto_expedientes)}
          </p>
        </div>

        <div className="p-5 rounded-xl border-2 border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-slate-500 mb-2">
            <DollarSign size={18} />
            <span className="text-sm font-bold uppercase tracking-wider">Costes Fijos Totales</span>
          </div>
          <p className="text-2xl font-bold text-navy-900">{formatearMoneda(kpis.costes_fijos_totales)}</p>
        </div>

        <div className="p-5 rounded-xl border-2 border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-slate-500 mb-2">
            <DollarSign size={18} />
            <span className="text-sm font-bold uppercase tracking-wider">Beneficio Neto antes de Impuestos</span>
          </div>
          <p className={`text-2xl font-bold ${(Number(kpis.beneficio_neto_antes_impuestos) || 0) >= 0 ? 'text-navy-900' : 'text-red-800'}`}>
            {formatearMoneda(kpis.beneficio_neto_antes_impuestos)}
          </p>
        </div>

        <div className="p-5 rounded-xl border-2 border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-slate-500 mb-2">
            <DollarSign size={18} />
            <span className="text-sm font-bold uppercase tracking-wider">IVA Estimado</span>
          </div>
          <p className="text-2xl font-bold text-navy-900">{formatearMoneda(kpis.iva_estimado)}</p>
        </div>
      </div>

      {/* Beneficio Neto Final - diseño destacado */}
      <div className="p-6 rounded-xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 to-green-50 shadow-md">
        <div className="flex items-center gap-2 text-emerald-700 mb-2">
          <TrendingUp size={22} />
          <span className="text-sm font-bold uppercase tracking-wider">Beneficio Neto Final</span>
        </div>
        <p className={`text-3xl sm:text-4xl font-black ${(Number(kpis.beneficio_neto_final) || 0) >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
          {formatearMoneda(kpis.beneficio_neto_final)}
        </p>
      </div>
    </div>
  )
}

export default InteligenciaEconomicaPanel
