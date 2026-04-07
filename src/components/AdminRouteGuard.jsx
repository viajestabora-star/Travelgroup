import React from 'react'
import { Navigate } from 'react-router-dom'
import { esUsuarioGestoria } from '../utils/userRoles'

/**
 * AdminRouteGuard — Permite acceso a ADMIN y GESTORIA.
 * Cualquier otro rol es redirigido a /expedientes.
 */
const AdminRouteGuard = ({ user, children }) => {
  const tieneAcceso = user?.rol === 'ADMIN' || esUsuarioGestoria(user)
  if (!tieneAcceso) {
    return <Navigate to="/expedientes" replace />
  }
  return children
}

export default AdminRouteGuard
