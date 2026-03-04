import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../supabase'
import { getEjercicioActual, subscribeToEjercicioChanges } from '../utils/ejercicioGlobal'

/**
 * InteligenciaPredictivaPanel - Panel de ranking de rentabilidad por cliente.
 *
 * INTEGRACIÓN: En CentralDeInteligencia.jsx:
 *   - Import: import InteligenciaPredictivaPanel from './InteligenciaPredictivaPanel'
 *   - Añadir tab "Inteligencia Predictiva" y renderizar cuando panelActivo === 'predictiva'
 *
 * ModalDetalleRentabilidad se exporta para uso desde InteligenciaEconomicaPanel.jsx:
 *   import { ModalDetalleRentabilidad } from './InteligenciaPredictivaPanel'
 *
 * ============ DATA ENGINE - PROCESAMIENTO DE RANKING ============
 * - Beneficio Consolidado: Suma de beneficio_neto_real de expedientes cerrados
 * - Beneficio Proyectado: Suma de (ingresos_previstos - gastos_previstos) de expedientes abiertos
 * - Índice de Eficiencia Pax: beneficio_neto_real / pax (por cliente agregado)
 */
const toNum = (v) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : 0)

const esCerrado = (estado) => (estado || '').toString().trim().toLowerCase() === 'cerrado'

const procesarRankingClientes = (expedientes, gastosPrevistosPorExp) => {
  const porCliente = {}

  expedientes.forEach((exp) => {
    const clienteKey = exp.cliente_id || exp.cliente_nombre || 'Sin asignar'
    const clienteNombre = exp.cliente_nombre || exp.nombre_grupo || 'Sin asignar'
    if (!porCliente[clienteKey]) {
      porCliente[clienteKey] = {
        cliente_id: exp.cliente_id,
        cliente_nombre: clienteNombre,
        beneficioConsolidado: 0,
        beneficioProyectado: 0,
        paxTotal: 0,
        expedientesCerrados: [],
        expedientesAbiertos: [],
      }
    }
    const pax = Math.max(0, toNum(exp.total_pax) || toNum(exp.pax_pago) || 0)
    const c = porCliente[clienteKey]

    if (esCerrado(exp.estado)) {
      const beneficio = toNum(exp.beneficio_neto_real) || toNum(exp.cierre_grupo?.beneficio_limpio ?? exp.cierre_grupo?.beneficio)
      c.beneficioConsolidado += beneficio
      c.paxTotal += pax
      c.expedientesCerrados.push({ id: exp.id, numero_expediente: exp.numero_expediente, beneficio_neto_real: beneficio, pax })
    } else {
      const ingresosPrevistos = exp.presupuesto_total != null
        ? toNum(exp.presupuesto_total)
        : toNum(exp.precio_venta_cliente) * Math.max(1, toNum(exp.pax_pago) || toNum(exp.total_pax))
      const gastosPrevistos = gastosPrevistosPorExp[exp.id] ?? 0
      const beneficioProy = ingresosPrevistos - gastosPrevistos
      c.beneficioProyectado += beneficioProy
      c.paxTotal += pax
      c.expedientesAbiertos.push({
        id: exp.id,
        numero_expediente: exp.numero_expediente,
        ingresos_previstos: ingresosPrevistos,
        gastos_previstos: gastosPrevistos,
        beneficio_proyectado: beneficioProy,
        pax,
      })
    }
  })

  return Object.values(porCliente).map((c) => ({
    ...c,
    indiceEficienciaPax: c.paxTotal > 0 ? c.beneficioConsolidado / c.paxTotal : 0,
  })).sort((a, b) => (b.beneficioConsolidado + b.beneficioProyectado) - (a.beneficioConsolidado + a.beneficioProyectado))
}

/** Formato profesional: 1.234,56 € */
const formatEuro = (val) => {
  const num = toNum(val)
  const abs = Math.abs(num)
  const [intPart, decPart] = abs.toFixed(2).split('.')
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const sign = num < 0 ? '−' : ''
  return `${sign}${formatted},${decPart} €`
}

/**
 * ModalDetalleRentabilidad - Modal exportable para detalle de rentabilidad por cliente.
 * Estructura de datos: { cliente_nombre, beneficioConsolidado, beneficioProyectado, indiceEficienciaPax, expedientesCerrados, expedientesAbiertos }
 */
export const ModalDetalleRentabilidad = ({ isOpen, onClose, detalle }) => {
  if (!isOpen) return null

  const datos = detalle || {}
  const filas = [
    { label: 'Cliente', value: datos.cliente_nombre || '—' },
    { label: 'Beneficio Consolidado', value: formatEuro(datos.beneficioConsolidado) },
    { label: 'Beneficio Proyectado', value: formatEuro(datos.beneficioProyectado) },
    { label: 'Índice Eficiencia Pax', value: datos.paxTotal > 0 ? `${formatEuro(datos.indiceEficienciaPax)}/pax` : '—' },
    { label: 'Total Pax', value: datos.paxTotal ?? 0 },
  ]

  const cerrados = datos.expedientesCerrados || []
  const abiertos = datos.expedientesAbiertos || []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-navy-900">Detalle de Rentabilidad</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filas.map((f) => (
              <div key={f.label} className="flex flex-col">
                <span className="text-xs font-medium text-slate-500 uppercase">{f.label}</span>
                <span className="text-sm font-semibold text-slate-800">{f.value}</span>
              </div>
            ))}
          </div>

          {cerrados.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-2">Expedientes Cerrados</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Expediente</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Beneficio</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Pax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cerrados.map((ex) => (
                      <tr key={ex.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-800">{ex.numero_expediente || ex.id}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatEuro(ex.beneficio_neto_real)}</td>
                        <td className="px-3 py-2 text-right">{ex.pax}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {abiertos.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-2">Expedientes Abiertos (Proyectado)</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Expediente</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Ingresos Prev.</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Gastos Prev.</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Beneficio Proy.</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Pax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {abiertos.map((ex) => (
                      <tr key={ex.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-800">{ex.numero_expediente || ex.id}</td>
                        <td className="px-3 py-2 text-right">{formatEuro(ex.ingresos_previstos)}</td>
                        <td className="px-3 py-2 text-right">{formatEuro(ex.gastos_previstos)}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatEuro(ex.beneficio_proyectado)}</td>
                        <td className="px-3 py-2 text-right">{ex.pax}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * InteligenciaPredictivaPanel - Panel de ranking de clientes por rentabilidad.
 * Consulta TODOS los expedientes (Cerrado + Abierto/En Curso) y procesa con el data engine.
 */
const InteligenciaPredictivaPanel = ({ user }) => {
  const [ranking, setRanking] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [ejercicioActual, setEjercicioActual] = useState(getEjercicioActual())
  const [detalleModal, setDetalleModal] = useState({ open: false, data: null })
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
        const { data: expedientesData, error: errExp } = await supabase
          .from('expedientes')
          .select('id, numero_expediente, cliente_id, cliente_nombre, nombre_grupo, estado, total_pax, pax_pago, presupuesto_total, precio_venta_cliente, beneficio_neto_real, cierre_grupo')

        if (errExp) throw errExp

        const expedientes = Array.isArray(expedientesData) ? expedientesData : []
        const idsExp = expedientes.map((e) => e.id).filter(Boolean)

        let gastosPrevistosPorExp = {}
        if (idsExp.length > 0) {
          const { data: serviciosData, error: errServ } = await supabase
            .from('servicios_cotizacion')
            .select('id_expediente, total_servicio')
            .in('id_expediente', idsExp)

          if (!errServ && Array.isArray(serviciosData)) {
            serviciosData.forEach((s) => {
              const idExp = s.id_expediente
              const total = toNum(s.total_servicio)
              gastosPrevistosPorExp[idExp] = (gastosPrevistosPorExp[idExp] || 0) + total
            })
          }
        }

        const resultado = procesarRankingClientes(expedientes, gastosPrevistosPorExp)
        setRanking(resultado)
      } catch (err) {
        setError(err?.message || 'Error desconocido')
        setRanking([])
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
        <p className="mt-3 text-gray-500">Cargando Inteligencia Predictiva...</p>
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

  return (
    <div className="animate-in fade-in duration-500 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-navy-800">Ranking de Rentabilidad por Cliente</h2>
        <span className="text-sm text-slate-500 font-medium">{ejercicioActual}</span>
      </div>

      <div className="rounded-2xl border-2 border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Cliente</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Beneficio Consolidado</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Beneficio Proyectado</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Eficiencia €/pax</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Pax</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {ranking.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No hay expedientes para generar el ranking.
                  </td>
                </tr>
              ) : (
                ranking.map((r, idx) => (
                  <tr
                    key={r.cliente_id ? `c-${r.cliente_id}` : `n-${idx}-${r.cliente_nombre}`}
                    className="border-t border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">{r.cliente_nombre}</td>
                    <td className="px-4 py-3 text-right">{formatEuro(r.beneficioConsolidado)}</td>
                    <td className="px-4 py-3 text-right">{formatEuro(r.beneficioProyectado)}</td>
                    <td className="px-4 py-3 text-right">{r.paxTotal > 0 ? formatEuro(r.indiceEficienciaPax) : '—'}</td>
                    <td className="px-4 py-3 text-right">{r.paxTotal}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => setDetalleModal({ open: true, data: r })}
                        className="text-navy-600 hover:text-navy-800 font-medium text-xs"
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ModalDetalleRentabilidad
        isOpen={detalleModal.open}
        onClose={() => setDetalleModal({ open: false, data: null })}
        detalle={detalleModal.data}
      />
    </div>
  )
}

export default InteligenciaPredictivaPanel
