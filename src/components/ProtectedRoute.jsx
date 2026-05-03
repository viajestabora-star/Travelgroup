import React from 'react'
import { Navigate } from 'react-router-dom'

/**
 * ProtectedRoute - Bloquea el acceso sin sesión o sin tenant (empresa_id).
 * Sin empresa_id no hay aislamiento multi-tenant: se fuerza vuelta al login.
 */
const ProtectedRoute = ({ user, children }) => {
  if (!user || !user.email) {
    return <Navigate to="/" replace />
  }
  if (!(Number(user.empresa_id) > 0)) {
    return <Navigate to="/" replace />
  }
  return children
}

export default ProtectedRoute
