import React from 'react'
import { Navigate } from 'react-router-dom'
import { puedeAccederAdminMaster } from '../utils/adminMasterAccess'

/**
 * Guard de ruta para /admin-master.
 * Permite el acceso solo si Number(user.empresa_id) === 1 (empresa raíz) y
 * user.nivel_acceso === 'ADMIN'. No depende del CIF ni de datos string variables.
 * Las operaciones en BD siguen protegidas por RLS en el servidor.
 */
const AdminMasterRouteGuard = ({ user, children }) => {
  if (!puedeAccederAdminMaster(user)) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

export default AdminMasterRouteGuard
