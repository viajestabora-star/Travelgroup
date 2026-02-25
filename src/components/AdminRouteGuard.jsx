import React from 'react'
import { Navigate } from 'react-router-dom'

/**
 * AdminRouteGuard - Protege rutas que requieren nivel_acceso === 'ADMIN'.
 * Redirige a Expedientes si el usuario no tiene permiso.
 * Basado en roles_usuarios.nivel_acceso (o user.rol en sesión).
 */
const AdminRouteGuard = ({ user, children }) => {
  const esAdmin = user?.rol === 'ADMIN'
  if (!esAdmin) {
    return <Navigate to="/expedientes" replace />
  }
  return children
}

export default AdminRouteGuard
