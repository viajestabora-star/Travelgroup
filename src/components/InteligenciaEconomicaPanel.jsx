import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { TrendingUp, Receipt, Wallet, PiggyBank, BarChart3 } from 'lucide-react'
import ModalDesgloseInteligencia from './ModalDesgloseInteligencia'
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
          .select('total_ingresos, total_gastos_reales, total_cobrado, cuota_iva, beneficio_neto_real, total_pax, cliente_nombre, nombre_grupo, cierre_grupo')
          .or('estado.eq.Cerrado,estado.ilike.cerrado')

        if (dbError) throw dbError

        const lista = Array.isArray(data) ? data : []
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
  const getIngresos = (e) => toNum(e.total_ingresos) || toNum(e.cierre_grupo?.ingresos_totales ?? e.cierre_grupo?.total_ingresos)
  const getGastos = (e) => toNum(e.total_gastos_reales) || toNum(e.cierre_grupo?.gastos_totales ?? e.cierre_grupo?.total_gastos)
  const getIva = (e) => toNum(e.cuota_iva) || toNum(e.cierre_grupo?.iva_pagado)
  const getBeneficioNeto = (e) => toNum(e.beneficio_neto_real) || toNum(e.cierre_grupo?.beneficio_limpio ?? e.cierre_grupo?.beneficio)

  const ingresosTotales = expedientes.reduce((acc, e) => acc + getIngresos(e), 0)
  const gastosTotales = expedientes.reduce((acc, e) => acc + getGastos(e), 0)
  const ivaAcumulado = expedientes.reduce((acc, e) => acc + getIva(e), 0)
  const beneficioNeto = expedientes.reduce((acc, e) => acc + getBeneficioNeto(e), 0)
  const margenBruto = ingresosTotales - gastosTotales

  const datosSinPersistir = expedientes.length > 0 && ingresosTotales === 0

  /** Formato profesional: 1.234,56 € (punto miles, coma decimales, espacio + € al final) */
  const formatEuro = (val) => {
    const num = toNum(val)
    const abs = Math.abs(num)
    const [intPart, decPart] = abs.toFixed(2).split('.')
    const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    const sign = num < 0 ? '−' : ''
    return `${sign}${formatted},${decPart} €`
  }

  const [showDesgloseModal, setShowDesgloseModal] = useState(false)

  const chartData = [
    { name: 'Ingresos Totales', valor: ingresosTotales, fill: '#059669' },
    { name: 'Gastos Totales', valor: gastosTotales, fill: '#dc2626' },
    { name: 'Beneficio Neto', valor: beneficioNeto, fill: beneficioNeto >= 0 ? '#7c3aed' : '#dc2626' },
  ]

  const cards = [
    { title: 'Ingresos Totales', value: formatEuro(ingresosTotales), subtitle: 'Suma de total_ingresos', icon: TrendingUp, bg: 'bg-emerald-50', border: 'border-emerald-200', iconBg: 'bg-emerald-500', iconColor: 'text-white' },
    { title: 'Gastos Totales', value: formatEuro(gastosTotales), subtitle: 'Suma de total_gastos_reales', icon: Wallet, bg: 'bg-red-50', border: 'border-red-200', iconBg: 'bg-red-500', iconColor: 'text-white' },
    { title: 'Margen Bruto', value: formatEuro(margenBruto), subtitle: 'Ingresos - Gastos', icon: BarChart3, bg: 'bg-sky-50', border: 'border-sky-200', iconBg: 'bg-sky-500', iconColor: 'text-white' },
    { title: 'IVA Acumulado', value: formatEuro(ivaAcumulado), subtitle: 'Suma de cuota_iva', icon: Receipt, bg: 'bg-amber-50', border: 'border-amber-200', iconBg: 'bg-amber-500', iconColor: 'text-white' },
    { title: 'Beneficio Neto', value: formatEuro(beneficioNeto), subtitle: 'Suma de beneficio_neto_real', icon: PiggyBank, bg: beneficioNeto >= 0 ? 'bg-purple-50' : 'bg-red-50', border: beneficioNeto >= 0 ? 'border-purple-200' : 'border-red-300', iconBg: beneficioNeto >= 0 ? 'bg-purple-600' : 'bg-red-600', iconColor: 'text-white', valueClass: beneficioNeto < 0 ? 'text-red-700 font-black' : undefined },
  ]

  return (
    <div className="animate-in fade-in duration-500 space-y-8">
      {datosSinPersistir && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-amber-800">
          <p className="font-bold">⚠️ Validación: Los totales suman 0 €</p>
          <p className="text-sm mt-1">Hay {expedientes.length} expediente(s) cerrado(s) pero las columnas total_ingresos, total_gastos_reales, cuota_iva y beneficio_neto_real están vacías. Ejecuta la migración SQL y vuelve a guardar el cierre en cada expediente.</p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-navy-800">
          Resumen Financiero (Cerrado)
        </h2>
        <span className="text-sm text-slate-500 font-medium">{ejercicioActual}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <button
              type="button"
              key={card.title}
              onClick={() => setShowDesgloseModal(true)}
              className={`flex flex-col p-4 rounded-2xl border-2 ${card.bg} ${card.border} shadow-sm hover:shadow-md transition-shadow min-w-0 text-left cursor-pointer`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <p className="text-sm font-semibold text-slate-600 shrink-0">{card.title}</p>
                <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${card.iconBg} ${card.iconColor} flex items-center justify-center`}>
                  <Icon size={20} strokeWidth={2.5} />
                </div>
              </div>
              <p
                className={`font-black min-w-0 ${card.valueClass || 'text-slate-900'}`}
                style={{
                  fontSize: '1.25rem',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {card.value}
              </p>
              <p className="text-xs text-slate-500 mt-1">{card.subtitle}</p>
            </button>
          )
        })}
      </div>

      <ModalDesgloseInteligencia
        isOpen={showDesgloseModal}
        onClose={() => setShowDesgloseModal(false)}
        expedientes={expedientes}
      />

      <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
          <BarChart3 size={22} className="text-navy-600" />
          <h3 className="text-base font-bold text-slate-800">Comparativa: Ingresos vs Gastos vs Beneficio Neto</h3>
        </div>
        <div className="p-6">
          {expedientes.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
              No hay expedientes con estado Cerrado.
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
