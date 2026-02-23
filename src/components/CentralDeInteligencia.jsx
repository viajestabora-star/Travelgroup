import React, { useState } from 'react'
import { Users, TrendingUp } from 'lucide-react'
import CrmIntelligencePanel from './CrmIntelligencePanel'
import InteligenciaEconomicaPanel from './InteligenciaEconomicaPanel'

/**
 * CentralDeInteligencia - Contenedor principal de la Central de Inteligencia.
 */
const CentralDeInteligencia = ({ userEmail }) => {
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

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        {panelActivo === 'crm' && <CrmIntelligencePanel />}
        {panelActivo === 'economica' && <InteligenciaEconomicaPanel userEmail={userEmail} />}
      </div>
    </div>
  )
}

export default CentralDeInteligencia
