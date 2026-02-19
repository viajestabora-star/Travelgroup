import React, { useEffect, useState } from 'react'
import { X, Users, TrendingUp, MapPin } from 'lucide-react'
import { supabase } from '../supabase'

/**
 * IntelligenceHub - Modal con sección CRM y Económica.
 * CRM: Cruza clientes con expedientes (veces viajado, total pasajeros, destinos favoritos).
 * Económica: Solo si email !== grupos@viajestabora.com. Beneficio = presupuesto_total - sum(coste_real_proveedor).
 * Filtro temporal: created_at.
 */
const IntelligenceHub = ({ user, isOpen, onClose }) => {
  const [crmData, setCrmData] = useState([])
  const [beneficioTotal, setBeneficioTotal] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const mostrarEconomica = String(user?.email || '').toLowerCase() !== 'grupos@viajestabora.com'

  useEffect(() => {
    if (!isOpen) return

    const cargar = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data: clientesData, error: errClientes } = await supabase
          .from('clientes')
          .select('id, nombre')
        if (errClientes) {
          setError(errClientes.message)
          return
        }
        const clientes = clientesData || []

        const { data: expedientesData, error: errExp } = await supabase
          .from('expedientes')
          .select('id, cliente_id, total_pax, presupuesto_total')
        if (errExp) {
          setError(errExp.message)
          return
        }
        const expedientes = expedientesData || []

        const idsExp = expedientes.map((e) => e.id).filter(Boolean)
        let serviciosData = []
        if (idsExp.length > 0) {
          const { data, error: errServ } = await supabase
            .from('servicios_cotizacion')
            .select('id_expediente, especificacion_destino, coste_real_proveedor')
            .in('id_expediente', idsExp)
          if (!errServ && data) serviciosData = data
        }

        const mapExpPorCliente = {}
        const mapServiciosPorExp = {}
        serviciosData.forEach((s) => {
          if (!mapServiciosPorExp[s.id_expediente]) mapServiciosPorExp[s.id_expediente] = []
          mapServiciosPorExp[s.id_expediente].push(s)
        })

        expedientes.forEach((exp) => {
          const cid = exp.cliente_id || exp.clienteId
          if (!cid) return
          if (!mapExpPorCliente[cid]) mapExpPorCliente[cid] = []
          mapExpPorCliente[cid].push({ ...exp, servicios: mapServiciosPorExp[exp.id] || [] })
        })

        const crm = clientes.map((c) => {
          const exps = mapExpPorCliente[c.id] || []
          const vecesViajado = exps.length
          let totalPasajeros = 0
          const destinosSet = new Set()
          exps.forEach((e) => {
            totalPasajeros += Number(e.total_pax) || 0
            ;(e.servicios || []).forEach((s) => {
              const d = (s.especificacion_destino || '').trim()
              if (d) destinosSet.add(d)
            })
          })
          const destinosFavoritos = [...destinosSet].filter(Boolean).slice(0, 5)
          return {
            id: c.id,
            nombre: c.nombre || 'Sin nombre',
            vecesViajado,
            totalPasajeros,
            destinosFavoritos,
          }
        }).filter((r) => r.vecesViajado > 0).sort((a, b) => b.vecesViajado - a.vecesViajado)

        setCrmData(crm)

        if (mostrarEconomica) {
          let presupuestoSum = 0
          const costePorExp = {}
          expedientes.forEach((e) => {
            presupuestoSum += Number(e.presupuesto_total) || 0
            costePorExp[e.id] = 0
          })
          serviciosData.forEach((s) => {
            const idExp = s.id_expediente
            if (costePorExp[idExp] != null) {
              const coste = s.coste_real_proveedor != null && Number(s.coste_real_proveedor) > 0
                ? Number(s.coste_real_proveedor)
                : 0
              costePorExp[idExp] += coste
            }
          })
          let costeTotal = 0
          Object.values(costePorExp).forEach((v) => { costeTotal += v })
          const beneficio = presupuestoSum - costeTotal
          setBeneficioTotal(beneficio)
        } else {
          setBeneficioTotal(null)
        }
      } catch (e) {
        setError(e?.message || 'Error cargando datos')
      } finally {
        setLoading(false)
      }
    }

    cargar()
  }, [isOpen, mostrarEconomica])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-navy-900">Globo de Inteligencia</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Cerrar"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-6">
              <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
              <div className="h-24 bg-gray-100 rounded-xl animate-pulse" />
            </div>
          ) : (
            <>
              {/* Sección CRM */}
              <section>
                <h3 className="text-lg font-bold text-navy-900 mb-4 flex items-center gap-2">
                  <Users size={20} />
                  CRM - Clientes y Expedientes
                </h3>
                {crmData.length === 0 ? (
                  <p className="text-gray-500 text-sm">No hay datos de clientes con expedientes.</p>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {crmData.map((c) => (
                      <div
                        key={c.id}
                        className="p-4 rounded-lg border border-gray-200 bg-gray-50"
                      >
                        <div className="font-semibold text-navy-900">{c.nombre}</div>
                        <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
                          <span>Viajes: <strong>{c.vecesViajado}</strong></span>
                          <span>Pasajeros: <strong>{c.totalPasajeros}</strong></span>
                          {c.destinosFavoritos.length > 0 && (
                            <span className="flex items-center gap-1">
                              <MapPin size={14} />
                              {c.destinosFavoritos.join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Sección Económica - solo si no es grupos@viajestabora.com */}
              {mostrarEconomica && (
                <section>
                  <h3 className="text-lg font-bold text-navy-900 mb-4 flex items-center gap-2">
                    <TrendingUp size={20} />
                    Económica - Beneficio Real
                  </h3>
                  <div className="p-4 rounded-lg border-2 border-emerald-200 bg-emerald-50">
                    <p className="text-gray-600 text-sm mb-1">Beneficio (presupuesto_total − coste_real_proveedor)</p>
                    <p className={`text-2xl font-bold ${beneficioTotal != null && beneficioTotal >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                      {beneficioTotal != null
                        ? `${beneficioTotal >= 0 ? '+' : ''}${Number(beneficioTotal).toFixed(2)} €`
                        : '—'}
                    </p>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default IntelligenceHub
