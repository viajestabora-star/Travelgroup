import React from 'react'
import InteligenciaEconomicaPanel from '../components/InteligenciaEconomicaPanel'

/**
 * Página dedicada a Inteligencia Económica (Finanzas).
 * Solo accesible para usuarios con rol ADMIN.
 * Protegida por AdminRouteGuard en App.jsx.
 */
const InteligenciaEconomica = ({ user }) => {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-navy-900 mb-6">Inteligencia Económica</h1>
      <InteligenciaEconomicaPanel user={user} />
    </div>
  )
}

export default InteligenciaEconomica
