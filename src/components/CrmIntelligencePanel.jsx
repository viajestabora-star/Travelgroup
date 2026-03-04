import React, { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../supabase'

/**
 * CrmIntelligencePanel - Panel de Inteligencia CRM.
 * Fuente: view_crm_intelligence (Supabase).
 * Muestra: Ranking clientes, Media pasajeros, Estacionalidad, Destinos populares.
 */
const CrmIntelligencePanel = () => {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const cargar = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data: rows, error: err } = await supabase
          .from('view_crm_intelligence')
          .select('*')
        if (err) {
          setError(err.message || 'Error al cargar datos CRM')
          setData([])
          return
        }
        setData(Array.isArray(rows) ? rows : [])
      } catch (e) {
        setError(e?.message || 'Error inesperado al cargar datos.')
        setData([])
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
        </div>
        <div className="h-80 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 rounded-xl bg-red-50 border-2 border-red-200 text-red-700">
        <p className="font-semibold">Error al cargar datos</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    )
  }

  const filas = data || []

  // Ranking: nombre_cliente + total_viajes (agregar si viene por fila, o usar directo)
  const rankingMap = {}
  filas.forEach((r) => {
    const nombre = r.nombre_cliente || r.cliente_nombre || 'Sin nombre'
    if (!rankingMap[nombre]) rankingMap[nombre] = { nombre_cliente: nombre, total_viajes: 0 }
    rankingMap[nombre].total_viajes += Number(r.total_viajes) || 1
  })
  const ranking = Object.values(rankingMap)
    .sort((a, b) => (b.total_viajes || 0) - (a.total_viajes || 0))

  // Media general de pasajeros (media_pasajeros o total_pax)
  const valoresPasajeros = filas
    .map((r) => Number(r.media_pasajeros ?? r.total_pax ?? 0))
    .filter((v) => v > 0)
  const mediaPasajeros =
    valoresPasajeros.length > 0
      ? valoresPasajeros.reduce((a, b) => a + b, 0) / valoresPasajeros.length
      : 0

  // Estacionalidad: viajes por mes (mes_viaje)
  const mesMap = {}
  filas.forEach((r) => {
    const mes = r.mes_viaje || r.mes || ''
    if (!mes) return
    if (!mesMap[mes]) mesMap[mes] = 0
    mesMap[mes] += 1
  })
  const estacionalidad = Object.entries(mesMap)
    .map(([mes, count]) => ({ mes, viajes: count }))
    .sort((a, b) => String(a.mes).localeCompare(String(b.mes)))

  // Destinos más populares (top 5)
  const destinoMap = {}
  filas.forEach((r) => {
    const d = (r.destino || r.especificacion_destino || '').trim()
    if (!d) return
    const key = d
    if (!destinoMap[key]) destinoMap[key] = 0
    destinoMap[key] += 1
  })
  const destinosPopulares = Object.entries(destinoMap)
    .map(([destino, count]) => ({ destino, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Ranking de Clientes por Viajes */}
      <section className="card">
        <h3 className="text-lg font-bold text-navy-900 mb-4">Ranking de Clientes por Viajes</h3>
        {ranking.length === 0 ? (
          <p className="text-gray-500 text-sm">No hay datos de clientes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-navy-900">Nº</th>
                  <th className="text-left py-3 px-4 font-semibold text-navy-900">Cliente</th>
                  <th className="text-right py-3 px-4 font-semibold text-navy-900">Total Viajes</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr key={r.nombre_cliente || i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-600">{i + 1}</td>
                    <td className="py-3 px-4 font-medium text-navy-900">{r.nombre_cliente}</td>
                    <td className="py-3 px-4 text-right font-semibold">{r.total_viajes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Media General de Pasajeros */}
      <section className="card">
        <h3 className="text-lg font-bold text-navy-900 mb-4">Media General de Pasajeros</h3>
        <div className="p-6 rounded-xl bg-blue-50 border-2 border-blue-200">
          <p className="text-2xl font-bold text-blue-900">
            {mediaPasajeros.toFixed(1)}
          </p>
          <p className="text-sm text-blue-700 mt-1">pasajeros por viaje (media)</p>
        </div>
      </section>

      {/* Estacionalidad de Viajes */}
      <section className="card">
        <h3 className="text-lg font-bold text-navy-900 mb-4">Estacionalidad de Viajes</h3>
        {estacionalidad.length === 0 ? (
          <p className="text-gray-500 text-sm">No hay datos por mes.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={estacionalidad} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="viajes" fill="#1e3a5f" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Destinos Más Populares */}
      <section className="card">
        <h3 className="text-lg font-bold text-navy-900 mb-4">Destinos Más Populares (Top 5)</h3>
        {destinosPopulares.length === 0 ? (
          <p className="text-gray-500 text-sm">No hay datos de destinos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-navy-900">Nº</th>
                  <th className="text-left py-3 px-4 font-semibold text-navy-900">Destino</th>
                  <th className="text-right py-3 px-4 font-semibold text-navy-900">Viajes</th>
                </tr>
              </thead>
              <tbody>
                {destinosPopulares.map((d, i) => (
                  <tr key={d.destino || i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-600">{i + 1}</td>
                    <td className="py-3 px-4 font-medium text-navy-900">{d.destino}</td>
                    <td className="py-3 px-4 text-right font-semibold">{d.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default CrmIntelligencePanel
