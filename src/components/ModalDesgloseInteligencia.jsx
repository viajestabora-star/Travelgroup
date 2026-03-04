import React, { useState, useEffect } from 'react'
import { X, TrendingUp, Users, AlertCircle, CreditCard } from 'lucide-react'

/**
 * ModalDesgloseInteligencia - Desgloses de Central de Inteligencia con pestañas.
 * MAPEO ESTRICTO: total_pax, beneficio_neto_real, total_ingresos, total_gastos_reales, total_cobrado, cliente_nombre.
 * null → 0 para no romper gráficas.
 *
 * Pestañas: General | Rentabilidad | Cobros | Pasajeros
 * - Ingresos KPI → abre en Cobros
 * - Beneficio Neto KPI → abre en Rentabilidad
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

const TABS = [
  { id: 'general', label: 'General', icon: null },
  { id: 'rentabilidad', label: 'Rentabilidad', icon: TrendingUp },
  { id: 'cobros', label: 'Cobros', icon: CreditCard },
  { id: 'pasajeros', label: 'Pasajeros', icon: Users },
]

const ModalDesgloseInteligencia = ({ isOpen, onClose, expedientes = [], tabInicial = 'general' }) => {
  const [tabActivo, setTabActivo] = useState(tabInicial)

  useEffect(() => {
    if (isOpen) setTabActivo(tabInicial)
  }, [isOpen, tabInicial])

  if (!isOpen) return null

  const lista = Array.isArray(expedientes) ? expedientes : []

  // a) Ranking por cliente_nombre - Null safety
  const rankingPorCliente = {}
  lista.forEach((e) => {
    const nombre = e?.cliente_nombre || e?.nombre_grupo || 'Sin asignar'
    const beneficio = toNum(e?.beneficio_neto_real ?? 0)
    if (!rankingPorCliente[nombre]) rankingPorCliente[nombre] = 0
    rankingPorCliente[nombre] += beneficio
  })
  const rankingOrdenado = Object.entries(rankingPorCliente)
    .map(([cliente_nombre, beneficio_neto_real]) => ({ cliente_nombre, beneficio_neto_real }))
    .sort((a, b) => b.beneficio_neto_real - a.beneficio_neto_real)

  // b) Análisis Pasajeros
  const totalPax = lista.reduce((acc, e) => acc + toNum(e?.total_pax ?? 0), 0)
  const mediaPax = lista.length > 0 ? totalPax / lista.length : 0
  const beneficioTotal = lista.reduce((acc, e) => acc + toNum(e?.beneficio_neto_real ?? 0), 0)
  const beneficioPorPax = totalPax > 0 ? beneficioTotal / totalPax : 0

  // c) Control Deuda global
  const totalIngresos = lista.reduce((acc, e) => acc + toNum(e?.total_ingresos ?? 0), 0)
  const totalCobrado = lista.reduce((acc, e) => acc + toNum(e?.total_cobrado ?? 0), 0)
  const deudaPendiente = Math.max(0, totalIngresos - totalCobrado)

  // d) Listado Cobros por expediente: Cliente, Expediente, Deuda Pendiente
  const getIngresos = (e) => toNum(e?.total_ingresos) || toNum(e?.cierre_grupo?.ingresos_totales ?? e?.cierre_grupo?.total_ingresos)
  const cobrosPorExpediente = lista.map((e) => ({
    id: e.id,
    cliente_nombre: e?.cliente_nombre || e?.nombre_grupo || 'Sin asignar',
    numero_expediente: e?.numero_expediente || e?.id || '—',
    deudaPendiente: Math.max(0, getIngresos(e) - toNum(e?.total_cobrado ?? 0)),
  }))

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

        {/* Barra de pestañas */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTabActivo(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                tabActivo === t.id
                  ? 'text-navy-700 border-b-2 border-navy-600 bg-white'
                  : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              {t.icon ? <t.icon size={16} /> : null}
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Pestaña General: resumen completo (contenido actual) */}
          {tabActivo === 'general' && (
            <div className="space-y-8">
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
                            <td className="px-3 py-2 text-slate-800" style={{ textTransform: 'capitalize' }}>{r.cliente_nombre}</td>
                            <td className="px-3 py-2 text-right font-medium">{formatEuro(r.beneficio_neto_real)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

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
          )}

          {/* Pestaña Rentabilidad: solo ranking */}
          {tabActivo === 'rentabilidad' && (
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
                          <td className="px-3 py-2 text-slate-800" style={{ textTransform: 'capitalize' }}>{r.cliente_nombre}</td>
                          <td className="px-3 py-2 text-right font-medium">{formatEuro(r.beneficio_neto_real)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Pestaña Cobros: Cliente, Expediente, Deuda Pendiente */}
          {tabActivo === 'cobros' && (
            <section>
              <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
                <CreditCard size={18} />
                Detalle de Cobros por Expediente
              </h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Cliente</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Expediente</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Deuda Pendiente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cobrosPorExpediente.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-center text-slate-500">Sin datos de cobros</td>
                      </tr>
                    ) : (
                      cobrosPorExpediente.map((c) => (
                        <tr key={c.id} className={`border-t border-slate-100 ${c.deudaPendiente > 0 ? 'bg-amber-50/50' : ''}`}>
                          <td className="px-3 py-2 text-slate-800" style={{ textTransform: 'capitalize' }}>{c.cliente_nombre}</td>
                          <td className="px-3 py-2 text-slate-700">{c.numero_expediente}</td>
                          <td className="px-3 py-2 text-right font-medium text-amber-800">{formatEuro(c.deudaPendiente)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Pestaña Pasajeros: solo análisis */}
          {tabActivo === 'pasajeros' && (
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
          )}
        </div>
      </div>
    </div>
  )
}

export default ModalDesgloseInteligencia
