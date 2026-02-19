import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, CheckCircle, Flag } from 'lucide-react'
import { supabase } from '../supabase'
import { getEjercicioActual, subscribeToEjercicioChanges } from '../utils/ejercicioGlobal'

/**
 * ResumenPipeline - Resumen del pipeline de expedientes (Petición, Confirmado, Finalizado).
 * Una única consulta a Supabase; conteo en cliente. Redirige a /expedientes?tab=X al hacer clic.
 */
const ResumenPipeline = () => {
  const navigate = useNavigate()
  const [ejercicioActual, setEjercicioActual] = useState(getEjercicioActual())
  const [conteos, setConteos] = useState({ peticion: 0, confirmado: 0, finalizado: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = subscribeToEjercicioChanges((nuevoEjercicio) => {
      setEjercicioActual(nuevoEjercicio)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const cargar = async () => {
      setLoading(true)
      try {
        const inicio = `${ejercicioActual}-01-01T00:00:00`
        const fin = `${ejercicioActual + 1}-01-01T00:00:00`
        const { data, error } = await supabase
          .from('expedientes')
          .select('estado')
          .gte('created_at', inicio)
          .lt('created_at', fin)

        if (error) {
          setConteos({ peticion: 0, confirmado: 0, finalizado: 0 })
          return
        }

        let peticion = 0
        let confirmado = 0
        let finalizado = 0
        ;(data || []).forEach((e) => {
          const est = (e.estado || '').toLowerCase()
          if (est === 'peticion' || est === 'confirmado') peticion += 1
          else if (est === 'en_curso') confirmado += 1
          else if (est === 'finalizado') finalizado += 1
        })
        setConteos({ peticion, confirmado, finalizado })
      } catch {
        setConteos({ peticion: 0, confirmado: 0, finalizado: 0 })
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [ejercicioActual])

  const cards = [
    { label: 'Petición', count: conteos.peticion, tab: 'pendientes', icon: FileText, color: 'from-amber-50 to-yellow-50', border: 'border-amber-200', shadow: 'shadow-amber-100' },
    { label: 'Confirmado', count: conteos.confirmado, tab: 'confirmados', icon: CheckCircle, color: 'from-emerald-50 to-green-50', border: 'border-emerald-200', shadow: 'shadow-emerald-100' },
    { label: 'Finalizado', count: conteos.finalizado, tab: 'finalizado', icon: Flag, color: 'from-blue-50 to-sky-50', border: 'border-blue-200', shadow: 'shadow-blue-100' },
  ]

  const handleClick = (tab) => {
    navigate(`/expedientes?tab=${tab}`)
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-navy-900">Pipeline de Expedientes ({ejercicioActual})</h2>
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse shadow-sm" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {cards.map((c) => (
            <button
              key={c.tab}
              type="button"
              onClick={() => handleClick(c.tab)}
              className={`group relative p-6 rounded-xl border-2 ${c.border} bg-gradient-to-br ${c.color} shadow-md hover:shadow-lg transition-all duration-300 text-left hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-navy-500 focus:ring-offset-2`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">{c.label}</p>
                  <p className="text-3xl font-bold text-navy-900">{c.count}</p>
                  <p className="text-xs text-gray-500 mt-2">Clic para ver</p>
                </div>
                <div className="p-3 rounded-lg bg-white/80 shadow-sm group-hover:bg-white transition-colors">
                  <c.icon className="text-navy-700" size={24} />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default ResumenPipeline
