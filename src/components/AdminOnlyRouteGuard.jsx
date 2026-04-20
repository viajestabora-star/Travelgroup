import React from 'react'
import { Navigate } from 'react-router-dom'
import { esUsuarioAdmin } from '../utils/userRoles'

/**
 * Solo usuarios con nivel ADMIN (no GESTORIA ni STAFF).
 */
const AdminOnlyRouteGuard = ({ user, children }) => {
  if (!esUsuarioAdmin(user)) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

export default AdminOnlyRouteGuard
