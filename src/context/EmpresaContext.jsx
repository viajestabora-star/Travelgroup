import React, { createContext, useContext, useMemo } from 'react'
import { toSlug } from '../utils/slugify'

const EmpresaContext = createContext({
  empresaId: 1,
  empresaSlug: 'mi-agencia',
  withEmpresaId: (payload) => payload,
})

const inyectarEmpresaId = (payload, empresaId) => {
  if (Array.isArray(payload)) return payload.map((item) => inyectarEmpresaId(item, empresaId))
  if (payload && typeof payload === 'object') {
    return { ...payload, empresa_id: Number(empresaId) > 0 ? Number(empresaId) : null }
  }
  return payload
}

export const EmpresaProvider = ({ user = null, children }) => {
  const empresaId = useMemo(() => {
    const byUser = Number(user?.empresa_id)
    return byUser > 0 ? byUser : null
  }, [user?.empresa_id])

  // Slug URL-safe: prioriza empresa_slug guardado en sesión (LoginPortal) → nombre_app → fallback id
  const empresaSlug = useMemo(
    () => user?.empresa_slug || toSlug(user?.nombre_app || `empresa-${empresaId}`),
    [user?.empresa_slug, user?.nombre_app, empresaId],
  )

  const value = useMemo(
    () => ({
      empresaId,
      empresaSlug,
      withEmpresaId: (payload) => inyectarEmpresaId(payload, empresaId),
    }),
    [empresaId, empresaSlug],
  )

  return <EmpresaContext.Provider value={value}>{children}</EmpresaContext.Provider>
}

export const useEmpresa = () => useContext(EmpresaContext)
