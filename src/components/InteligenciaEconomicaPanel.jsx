import React, { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const InteligenciaEconomicaPanel = ({ userEmail: userEmailProp }) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [userEmail, setUserEmail] = useState(userEmailProp)

  useEffect(() => {
    const resolveEmail = async () => {
      if (userEmailProp) {
        setUserEmail(userEmailProp)
        return
      }
      const { data: { user } } = await supabase.auth.getUser()
      setUserEmail(user?.email || '')
    }
    resolveEmail()
  }, [userEmailProp])

  useEffect(() => {
    if (userEmail === 'grupos@viajestabora.com') return

    const fetchData = async () => {
      try {
        const { data: result, error: dbError } = await supabase
          .from('vista_global_financiera')
          .select('*')
          .single()

        if (dbError) throw dbError
        setData(result)
      } catch (err) {
        setError(err?.message || 'Error desconocido')
      } finally {
        setLoading(false)
      }
    }

    if (userEmail !== undefined) fetchData()
  }, [userEmail])

  // Seguridad: Sin permisos para grupos@viajestabora.com
  if (userEmail === 'grupos@viajestabora.com') {
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

  if (!data) {
    return (
      <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-700">
        No hay datos disponibles. Cierra expedientes para ver estadísticas.
      </div>
    )
  }

  const formatEuro = (val) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(val || 0)

  return (
    <div className="animate-in fade-in duration-500">
      <h2 className="text-lg font-bold text-navy-800 mb-6">
        Resumen Financiero (Expedientes Cerrados)
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="p-5 shadow-md border border-gray-200 rounded-xl bg-white">
          <p className="text-sm font-medium text-gray-600 mb-1">Ingresos Brutos</p>
          <p className="text-2xl font-bold text-navy-900">{formatEuro(data.ingresos_brutos_totales)}</p>
        </div>

        <div className="p-5 shadow-md border border-gray-200 rounded-xl bg-white">
          <p className="text-sm font-medium text-gray-600 mb-1">Costes Variables (Proveedores)</p>
          <p className="text-2xl font-bold text-navy-900">{formatEuro(data.costes_variables_totales)}</p>
        </div>

        <div className="p-5 shadow-md border border-navy-200 rounded-xl bg-blue-50">
          <p className="text-sm font-bold text-navy-700 mb-1">Beneficio Bruto Viajes</p>
          <p className="text-2xl font-bold text-navy-800">{formatEuro(data.beneficio_bruto_expedientes)}</p>
        </div>

        <div className="p-5 shadow-md border border-gray-200 rounded-xl bg-white">
          <p className="text-sm font-medium text-gray-600 mb-1">Costes Fijos</p>
          <p className="text-2xl font-bold text-navy-900">{formatEuro(data.costes_fijos_totales)}</p>
        </div>

        <div className="p-5 shadow-md border border-gray-200 rounded-xl bg-white">
          <p className="text-sm font-medium text-gray-600 mb-1">IVA Estimado (21%)</p>
          <p className="text-2xl font-bold text-navy-900">{formatEuro(data.iva_estimado)}</p>
        </div>

        <div className="p-5 shadow-lg border-2 border-purple-500 rounded-xl bg-purple-50">
          <p className="text-sm font-bold text-purple-800 mb-1">BENEFICIO NETO FINAL</p>
          <p className="text-3xl font-bold text-purple-700">{formatEuro(data.beneficio_neto_final)}</p>
          <p className="text-xs text-purple-600 mt-1">Libre de impuestos y costes fijos</p>
        </div>
      </div>
    </div>
  )
}

export default InteligenciaEconomicaPanel
