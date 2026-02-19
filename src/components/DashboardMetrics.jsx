import React, { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { TrendingUp, Banknote, AlertTriangle } from 'lucide-react'

/**
 * DashboardMetrics - Métricas financieras mensuales
 * Seguridad: Acceso exclusivo para Germán y Administrador. Marisa retorna null.
 * Datos: vista_estadisticas_mensuales (Supabase)
 */
const DashboardMetrics = ({ user = null }) => {
  const [metrics, setMetrics] = useState({
    volumenBruto: 0,
    ingresosReales: 0,
    pendiente: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Validación de acceso: Marisa sin acceso; Germán y Admin sí
  const tieneAcceso = () => {
    if (!user) return false
    const nombre = (user.nombre || user.name || '').trim()
    const rol = (user.rol || '').toUpperCase()
    if (nombre === 'Marisa') return false
    if (nombre === 'Germán' || nombre === 'German') return true
    if (rol === 'ADMIN') return true
    return false
  }

  useEffect(() => {
    if (!tieneAcceso()) {
      setLoading(false)
      return
    }

    const cargarMetricas = async () => {
      setLoading(true)
      setError(null)
      try {
        const hoy = new Date()
        const mesActual = hoy.getMonth() + 1
        const añoActual = hoy.getFullYear()

        const { data, error: err } = await supabase
          .from('vista_estadisticas_mensuales')
          .select('mes, año, volumen_bruto, ingresos_reales, pendiente')
          .eq('mes', mesActual)
          .eq('año', añoActual)
          .maybeSingle()

        if (err) {
          setError(err.message)
          setMetrics({ volumenBruto: 0, ingresosReales: 0, pendiente: 0 })
          return
        }

        const v = data || {}
        setMetrics({
          volumenBruto: Number(v.volumen_bruto) || 0,
          ingresosReales: Number(v.ingresos_reales) || 0,
          pendiente: Number(v.pendiente) ?? (Number(v.volumen_bruto) || 0) - (Number(v.ingresos_reales) || 0),
        })
      } catch (err) {
        setError(err?.message || 'Error al cargar métricas')
        setMetrics({ volumenBruto: 0, ingresosReales: 0, pendiente: 0 })
      } finally {
        setLoading(false)
      }
    }

    cargarMetricas()
  }, [user?.nombre, user?.rol])

  if (!tieneAcceso()) return null

  const formatearEuro = (valor) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* KPI 1: Volumen Bruto (Ventas) */}
      <div className="card bg-gradient-to-br from-slate-50 to-white border border-slate-200">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-slate-600 text-sm font-medium mb-1">Volumen Bruto (Ventas)</p>
            {loading ? (
              <p className="text-slate-400 text-lg">Cargando…</p>
            ) : (
              <h3 className="text-2xl font-bold text-navy-900">{formatearEuro(metrics.volumenBruto)}</h3>
            )}
            <p className="text-xs text-slate-500 mt-1">Suma presupuestos del mes actual</p>
          </div>
          <div className="p-3 bg-blue-500 rounded-lg">
            <TrendingUp className="text-white" size={24} />
          </div>
        </div>
      </div>

      {/* KPI 2: Ingresos Reales (Cobrado) */}
      <div className="card bg-gradient-to-br from-slate-50 to-white border border-slate-200">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-slate-600 text-sm font-medium mb-1">Ingresos Reales (Cobrado)</p>
            {loading ? (
              <p className="text-slate-400 text-lg">Cargando…</p>
            ) : (
              <h3 className="text-2xl font-bold text-navy-900">{formatearEuro(metrics.ingresosReales)}</h3>
            )}
            <p className="text-xs text-slate-500 mt-1">Total dinero ya ingresado</p>
          </div>
          <div className="p-3 bg-emerald-500 rounded-lg">
            <Banknote className="text-white" size={24} />
          </div>
        </div>
      </div>

      {/* KPI 3: Riesgo de Cobro (Pendiente) - Rojo neón si > 0 */}
      <div className={`card border-2 transition-colors ${
        metrics.pendiente > 0
          ? 'bg-red-50 border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
          : 'bg-gradient-to-br from-slate-50 to-white border-slate-200'
      }`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-slate-600 text-sm font-medium mb-1">Riesgo de Cobro (Pendiente)</p>
            {loading ? (
              <p className="text-slate-400 text-lg">Cargando…</p>
            ) : (
              <h3 className={`text-2xl font-bold ${metrics.pendiente > 0 ? 'text-red-600' : 'text-navy-900'}`}>
                {formatearEuro(metrics.pendiente)}
              </h3>
            )}
            <p className="text-xs text-slate-500 mt-1">Deuda pendiente global</p>
          </div>
          <div className={`p-3 rounded-lg ${metrics.pendiente > 0 ? 'bg-red-500' : 'bg-slate-400'}`}>
            <AlertTriangle className="text-white" size={24} />
          </div>
        </div>
      </div>

      {error && (
        <div className="col-span-full p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
          {error}
        </div>
      )}
    </div>
  )
}

export default DashboardMetrics
