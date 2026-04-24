import React from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { useEmpresa } from '../context/EmpresaContext'

/**
 * SlugGuard — valida que el :slug en la URL corresponda al slug real de la empresa
 * del usuario autenticado.
 *
 * Si el slug es incorrecto (intento de acceder a la URL de otra agencia),
 * redirige a la URL correcta del usuario, previniendo suplantación de ruta.
 */
const SlugGuard = ({ children }) => {
  const { slug }        = useParams()
  const { empresaSlug } = useEmpresa()

  // Mientras no hay datos suficientes (carga inicial), dejar pasar.
  // ProtectedRoute ya se encarga de la autenticación.
  if (!slug || !empresaSlug) return children

  if (slug !== empresaSlug) {
    // Redirige a la raíz del slug correcto → el index route llevará al dashboard
    return <Navigate to={`/${empresaSlug}`} replace />
  }

  return children
}

export default SlugGuard
