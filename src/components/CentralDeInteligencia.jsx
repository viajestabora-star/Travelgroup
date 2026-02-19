import React, { useState } from 'react'
import { Users, TrendingUp } from 'lucide-react'
import CrmIntelligencePanel from './CrmIntelligencePanel'

/**
 * CentralDeInteligencia - Contenedor principal de la Central de Inteligencia.
 * Gestiona el estado para mostrar los paneles CRM y Económico.
 */
const CentralDeInteligencia = () => {
  const [panelActivo, setPanelActivo] = useState('crm')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setPanelActivo('crm')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-colors ${
            panelActivo === 'crm'
              ? 'bg-navy-700 text-white shadow-md'
              : 'bg-navy-100 text-navy-800 hover:bg-navy-200'
          }`}
        >
          <Users size={20} />
          Inteligencia de Clientes (CRM)
        </button>
        <button
          onClick={() => setPanelActivo('economica')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-colors ${
            panelActivo === 'economica'
              ? 'bg-navy-700 text-white shadow-md'
              : 'bg-navy-100 text-navy-800 hover:bg-navy-200'
          }`}
        >
          <TrendingUp size={20} />
          Inteligencia Económica (Finanzas)
        </button>
      </div>

      {panelActivo === 'crm' && <CrmIntelligencePanel />}
      {panelActivo === 'economica' && (
        <div className="p-6 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 text-gray-500 text-center">
          Panel de Inteligencia Económica — próximamente
        </div>
      )}
    </div>
  )
}

export default CentralDeInteligencia
