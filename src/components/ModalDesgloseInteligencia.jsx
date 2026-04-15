import React, { useState, useEffect } from 'react'
import { X, TrendingUp, Users, AlertCircle, CreditCard, Wallet } from 'lucide-react'
import { supabase } from '../supabase'
import { finanzasExpedienteParaInformes } from '../utils/cierreGrupoFuenteVerdad'

/**
 * ModalDesgloseInteligencia - Desgloses de Central de Inteligencia con pestañas.
 * MAPEO ESTRICTO: total_pax, beneficio_neto_real, total_ingresos, total_gastos_reales, total_cobrado, cliente_nombre.
 * null → 0 para no romper gráficas.
 *
 * Pestañas: General | Rentabilidad | Cobros | Gastos | Pasajeros
 * - Ingresos KPI → abre en Cobros
 * - Beneficio Neto KPI → abre en Rentabilidad
 * - Gastos Totales KPI → abre en Gastos (desglose desde gastos_consolidados)
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
  { id: 'gastos', label: 'Gastos', icon: Wallet },
  { id: 'pasajeros', label: 'Pasajeros', icon: Users },
]

const SUBTABS_GASTOS = [
  { id: 'por_proveedor', label: 'Por Proveedor' },
  { id: 'por_servicio', label: 'Por Servicio' },
]

const ModalDesgloseInteligencia = ({ isOpen, onClose, expedientes = [], tabInicial = 'general', ejercicioActual }) => {
  const [tabActivo, setTabActivo] = useState(tabInicial)
  const [subTabGastos, setSubTabGastos] = useState('por_proveedor')
  const [gastosConsolidados, setGastosConsolidados] = useState([])
  const [proveedoresMap, setProveedoresMap] = useState({})
  const [loadingGastos, setLoadingGastos] = useState(false)

  useEffect(() => {
    if (isOpen) setTabActivo(tabInicial)
  }, [isOpen, tabInicial])

  useEffect(() => {
    if (!isOpen || tabActivo !== 'gastos') return
    const año = parseInt(String(ejercicioActual || new Date().getFullYear()), 10) || new Date().getFullYear()
    const fetchGastos = async () => {
      setLoadingGastos(true)
      try {
        const { data: gastosData, error: gastosErr } = await supabase
          .from('gastos_consolidados')
          .select('id, expediente_id, proveedor_id, tipo_servicio, coste_total, año_ejercicio')
          .eq('año_ejercicio', año)

        if (gastosErr) {
          setGastosConsolidados([])
          setLoadingGastos(false)
          return
        }

        const gastos = Array.isArray(gastosData) ? gastosData : []
        setGastosConsolidados(gastos)

        const provIds = [...new Set(gastos.map((g) => g.proveedor_id).filter(Boolean))]
        if (provIds.length === 0) {
          setProveedoresMap({})
          setLoadingGastos(false)
          return
        }

        const { data: provData } = await supabase
          .from('proveedores')
          .select('id, nombre_comercial')
          .in('id', provIds)

        const map = {}
        ;(provData || []).forEach((p) => {
          map[String(p.id)] = p.nombre_comercial || p.nombreComercial || `Proveedor #${p.id}`
        })
        setProveedoresMap(map)
      } catch (_) {
        setGastosConsolidados([])
        setProveedoresMap({})
      } finally {
        setLoadingGastos(false)
      }
    }
    fetchGastos()
  }, [isOpen, tabActivo, ejercicioActual])

  if (!isOpen) return null

  const lista = Array.isArray(expedientes) ? expedientes : []

  // a) Lista por expediente: [CLIENTE | EXPEDIENTE | DESTINO | IMPORTE] - sin GRUPO. numero_expediente: S/N si null
  const fmtNumExp = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : 'S/N')
  const filasRentabilidad = lista.map((e) => ({
    id: e.id,
    cliente_nombre: (e?.cliente_nombre || e?.nombre_grupo || 'Sin asignar').toUpperCase(),
    numero_expediente: fmtNumExp(e?.numero_expediente ?? e?.numeroExpediente),
    destino: (e?.destino || '—').toUpperCase(),
    beneficio_neto_real: finanzasExpedienteParaInformes(e).beneficio_limpio,
  })).sort((a, b) => b.beneficio_neto_real - a.beneficio_neto_real)

  // b) Análisis Pasajeros
  const totalPax = lista.reduce((acc, e) => acc + toNum(e?.total_pax ?? 0), 0)
  const mediaPax = lista.length > 0 ? totalPax / lista.length : 0
  const beneficioTotal = lista.reduce((acc, e) => acc + finanzasExpedienteParaInformes(e).beneficio_limpio, 0)
  const beneficioPorPax = totalPax > 0 ? beneficioTotal / totalPax : 0

  // c) Control Deuda global
  const totalIngresos = lista.reduce((acc, e) => acc + finanzasExpedienteParaInformes(e).ingresos_totales, 0)
  const totalCobrado = lista.reduce((acc, e) => acc + toNum(e?.total_cobrado ?? 0), 0)
  const deudaPendiente = Math.max(0, totalIngresos - totalCobrado)

  // d) Listado Cobros: [CLIENTE | EXPEDIENTE | DESTINO | IMPORTE] - lógica de cobros preservada
  const getIngresos = (e) => finanzasExpedienteParaInformes(e).ingresos_totales
  const cobrosPorExpediente = lista.map((e) => ({
    id: e.id,
    cliente_nombre: (e?.cliente_nombre || e?.nombre_grupo || 'Sin asignar').toUpperCase(),
    numero_expediente: fmtNumExp(e?.numero_expediente ?? e?.numeroExpediente),
    destino: (e?.destino || '—').toUpperCase(),
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
                  Ranking de Rentabilidad
                </h3>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '40%' }} />
                      <col style={{ width: '20%' }} />
                      <col style={{ width: '20%' }} />
                      <col style={{ width: '20%' }} />
                    </colgroup>
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Cliente</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Expediente</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Destino</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Importe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filasRentabilidad.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-slate-500">Sin datos</td>
                        </tr>
                      ) : (
                        filasRentabilidad.map((r) => (
                          <tr key={r.id} className="border-t border-slate-100">
                            <td className="px-3 py-2 text-slate-800 truncate uppercase" title={r.cliente_nombre}>{r.cliente_nombre}</td>
                            <td className="px-3 py-2 text-slate-700 truncate font-mono" title={r.numero_expediente}>{r.numero_expediente}</td>
                            <td className="px-3 py-2 text-slate-700 truncate uppercase" title={r.destino}>{r.destino}</td>
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

          {/* Pestaña Rentabilidad: [CLIENTE | EXPEDIENTE | DESTINO | IMPORTE] */}
          {tabActivo === 'rentabilidad' && (
            <section>
              <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
                <TrendingUp size={18} />
                Ranking de Rentabilidad
              </h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '40%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '20%' }} />
                  </colgroup>
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Cliente</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Expediente</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Destino</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasRentabilidad.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-slate-500">Sin datos</td>
                      </tr>
                    ) : (
                      filasRentabilidad.map((r) => (
                        <tr key={r.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-800 truncate uppercase" title={r.cliente_nombre}>{r.cliente_nombre}</td>
                          <td className="px-3 py-2 text-slate-700 truncate font-mono" title={r.numero_expediente}>{r.numero_expediente}</td>
                          <td className="px-3 py-2 text-slate-700 truncate uppercase" title={r.destino}>{r.destino}</td>
                          <td className="px-3 py-2 text-right font-medium">{formatEuro(r.beneficio_neto_real)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Pestaña Cobros: [CLIENTE | EXPEDIENTE | DESTINO | IMPORTE] */}
          {tabActivo === 'cobros' && (
            <section>
              <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
                <CreditCard size={18} />
                Detalle de Cobros por Expediente
              </h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '40%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '20%' }} />
                  </colgroup>
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Cliente</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Expediente</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Destino</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cobrosPorExpediente.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-slate-500">Sin datos de cobros</td>
                      </tr>
                    ) : (
                      cobrosPorExpediente.map((c) => (
                        <tr key={c.id} className={`border-t border-slate-100 ${c.deudaPendiente > 0 ? 'bg-amber-50/50' : ''}`}>
                          <td className="px-3 py-2 text-slate-800 truncate uppercase" title={c.cliente_nombre}>{c.cliente_nombre}</td>
                          <td className="px-3 py-2 text-slate-700 truncate font-mono" title={c.numero_expediente}>{c.numero_expediente}</td>
                          <td className="px-3 py-2 text-slate-700 truncate uppercase" title={c.destino}>{c.destino}</td>
                          <td className="px-3 py-2 text-right font-medium text-amber-800">{formatEuro(c.deudaPendiente)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Pestaña Gastos: desglose desde gastos_consolidados (Por Proveedor | Por Servicio) */}
          {tabActivo === 'gastos' && (
            <section>
              <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
                <Wallet size={18} />
                Desglose de Gastos Totales
                {ejercicioActual && (
                  <span className="text-sm font-normal text-slate-500">(Año {ejercicioActual})</span>
                )}
              </h3>

              <div className="flex gap-2 mb-4 border-b border-slate-200 pb-2">
                {SUBTABS_GASTOS.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setSubTabGastos(st.id)}
                    className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      subTabGastos === st.id
                        ? 'bg-navy-100 text-navy-800 border border-navy-200'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-transparent'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {loadingGastos ? (
                <div className="py-8 text-center text-slate-500 text-sm">Cargando desglose...</div>
              ) : subTabGastos === 'por_proveedor' ? (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '50%' }} />
                      <col style={{ width: '25%' }} />
                      <col style={{ width: '25%' }} />
                    </colgroup>
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Proveedor</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Importe Total</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">% sobre total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const totalGastos = gastosConsolidados.reduce((acc, g) => acc + toNum(g.coste_total), 0)
                        const porProveedor = gastosConsolidados.reduce((acc, g) => {
                          const pid = String(g.proveedor_id)
                          if (!acc[pid]) acc[pid] = { proveedor_id: g.proveedor_id, total: 0 }
                          acc[pid].total += toNum(g.coste_total)
                          return acc
                        }, {})
                        const filas = Object.values(porProveedor)
                          .map((r) => ({
                            proveedor: proveedoresMap[String(r.proveedor_id)] || `Proveedor #${r.proveedor_id}`,
                            total: r.total,
                            pct: totalGastos > 0 ? (r.total / totalGastos) * 100 : 0,
                          }))
                          .sort((a, b) => b.total - a.total)
                        if (filas.length === 0) {
                          return (
                            <tr>
                              <td colSpan={3} className="px-3 py-4 text-center text-slate-500">
                                No hay datos de gastos consolidados para {ejercicioActual || 'este año'}.
                              </td>
                            </tr>
                          )
                        }
                        return filas.map((r, idx) => (
                          <tr key={idx} className="border-t border-slate-100">
                            <td className="px-3 py-2 text-slate-800 truncate" title={r.proveedor}>{r.proveedor}</td>
                            <td className="px-3 py-2 text-right font-medium">{formatEuro(r.total)}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{r.pct.toFixed(1)} %</td>
                          </tr>
                        ))
                      })()}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '50%' }} />
                      <col style={{ width: '50%' }} />
                    </colgroup>
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Tipo de Servicio</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Importe Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const porServicio = gastosConsolidados.reduce((acc, g) => {
                          const tipo = (g.tipo_servicio || 'Otros').toString().trim() || 'Otros'
                          if (!acc[tipo]) acc[tipo] = 0
                          acc[tipo] += toNum(g.coste_total)
                          return acc
                        }, {})
                        const filas = Object.entries(porServicio)
                          .map(([tipo, total]) => ({ tipo, total }))
                          .sort((a, b) => b.total - a.total)
                        if (filas.length === 0) {
                          return (
                            <tr>
                              <td colSpan={2} className="px-3 py-4 text-center text-slate-500">
                                No hay datos de gastos consolidados para {ejercicioActual || 'este año'}.
                              </td>
                            </tr>
                          )
                        }
                        return filas.map((r, idx) => (
                          <tr key={idx} className="border-t border-slate-100">
                            <td className="px-3 py-2 text-slate-800 truncate" title={r.tipo}>{r.tipo}</td>
                            <td className="px-3 py-2 text-right font-medium">{formatEuro(r.total)}</td>
                          </tr>
                        ))
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
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
