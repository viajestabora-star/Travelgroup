import React from 'react'
import { Navigate } from 'react-router-dom'
import { puedeAccederAdminMaster } from '../utils/adminMasterAccess'

/**
 * Solo sesión con empresa_id = 1 (Tabora). Las acciones en BD siguen validadas por RPC.
 */
const AdminMasterRouteGuard = ({ user, children }) => {
  if (!puedeAccederAdminMaster(user)) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

export default AdminMasterRouteGuard
