import React from 'react'
import { Navigate } from 'react-router-dom'

/**
 * ProtectedRoute - Bloquea el acceso sin sesión.
 * Si !user, redirige a login. Solo permite contenido tras Login exitoso.
 */
const ProtectedRoute = ({ user, children }) => {
  if (!user || !user.email) {
    return <Navigate to="/" replace />
  }
  return children
}

export default ProtectedRoute
