import React from 'react'
import { X, TrendingUp, Users, AlertCircle } from 'lucide-react'

/**
 * ModalDesgloseInteligencia - Desgloses de Central de Inteligencia.
 * MAPEO ESTRICTO: total_pax, beneficio_neto_real, total_ingresos, total_gastos_reales, total_cobrado, cliente_nombre.
 * null → 0 para no romper gráficas.
 */
const toNum = (v) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : 0)

const formatEuro = (val) => {
  const num = toNum(val)
  const abs = Math.abs(num)
  const [intPart, decPart] = abs.toFixed(2).split('.')
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const sign = num < 0 ? '−' : ''
  return `${sign}${formatted},${decPart} €`
}

/**
 * a) Ranking de Rentabilidad: Agrupar por cliente_nombre sumando beneficio_neto_real
 * b) Análisis de Pasajeros: Media de total_pax y beneficio por pasajero
 * c) Control de Deuda: Comparativa total_ingresos vs total_cobrado
 */
const ModalDesgloseInteligencia = ({ isOpen, onClose, expedientes = [] }) => {
  if (!isOpen) return null

  const lista = Array.isArray(expedientes) ? expedientes : []

  // a) Ranking por cliente_nombre - MAPEO ESTRICTO: beneficio_neto_real (null → 0)
  const rankingPorCliente = {}
  lista.forEach((e) => {
    const nombre = e.cliente_nombre || e.nombre_grupo || 'Sin asignar'
    const beneficio = toNum(e.beneficio_neto_real)
    if (!rankingPorCliente[nombre]) rankingPorCliente[nombre] = 0
    rankingPorCliente[nombre] += beneficio
  })
  const rankingOrdenado = Object.entries(rankingPorCliente)
    .map(([cliente_nombre, beneficio_neto_real]) => ({ cliente_nombre, beneficio_neto_real }))
    .sort((a, b) => b.beneficio_neto_real - a.beneficio_neto_real)

  // b) Análisis Pasajeros: media total_pax, beneficio por pasajero - MAPEO ESTRICTO (null → 0)
  const totalPax = lista.reduce((acc, e) => acc + toNum(e.total_pax), 0)
  const mediaPax = lista.length > 0 ? totalPax / lista.length : 0
  const beneficioTotal = lista.reduce((acc, e) => acc + toNum(e.beneficio_neto_real), 0)
  const beneficioPorPax = totalPax > 0 ? beneficioTotal / totalPax : 0

  // c) Control Deuda: total_ingresos vs total_cobrado - MAPEO ESTRICTO (null → 0)
  const totalIngresos = lista.reduce((acc, e) => acc + toNum(e.total_ingresos), 0)
  const totalCobrado = lista.reduce((acc, e) => acc + toNum(e.total_cobrado), 0)
  const deudaPendiente = Math.max(0, totalIngresos - totalCobrado)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-navy-900">Desgloses de Inteligencia Económica</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* a) Ranking de Rentabilidad */}
          <section>
            <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
              <TrendingUp size={18} />
              Ranking de Rentabilidad (por cliente_nombre)
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Cliente</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600">beneficio_neto_real</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingOrdenado.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-3 py-4 text-center text-slate-500">Sin datos</td>
                    </tr>
                  ) : (
                    rankingOrdenado.map((r) => (
                      <tr key={r.cliente_nombre} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-800">{r.cliente_nombre}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatEuro(r.beneficio_neto_real)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* b) Análisis de Pasajeros */}
          <section>
            <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Users size={18} />
              Análisis de Pasajeros (total_pax)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-xs font-medium text-slate-500 uppercase">Media total_pax</p>
                <p className="text-xl font-bold text-slate-800 mt-1">{mediaPax.toFixed(2)}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-xs font-medium text-slate-500 uppercase">Total pasajeros</p>
                <p className="text-xl font-bold text-slate-800 mt-1">{totalPax}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-xs font-medium text-slate-500 uppercase">Beneficio por pasajero</p>
                <p className="text-xl font-bold text-slate-800 mt-1">{formatEuro(beneficioPorPax)}</p>
              </div>
            </div>
          </section>

          {/* c) Control de Deuda */}
          <section>
            <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
              <AlertCircle size={18} />
              Control de Deuda (total_ingresos vs total_cobrado)
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Concepto</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-800">total_ingresos</td>
                    <td className="px-3 py-2 text-right font-medium">{formatEuro(totalIngresos)}</td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-800">total_cobrado</td>
                    <td className="px-3 py-2 text-right font-medium">{formatEuro(totalCobrado)}</td>
                  </tr>
                  <tr className="border-t border-slate-100 bg-amber-50">
                    <td className="px-3 py-2 font-semibold text-slate-800">Deuda pendiente</td>
                    <td className="px-3 py-2 text-right font-bold text-amber-800">{formatEuro(deudaPendiente)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default ModalDesgloseInteligencia
