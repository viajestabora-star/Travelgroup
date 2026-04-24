import React, { createContext, useContext, useMemo } from 'react'
import { toSlug } from '../utils/slugify'

const EmpresaContext = createContext({
  empresaId: 1,
  empresaSlug: 'mi-agencia',
  withEmpresaId: (payload) => payload,
})

const esDominioTabora = (email) => String(email || '').toLowerCase().endsWith('@viajestabora.com')

const inyectarEmpresaId = (payload, empresaId) => {
  if (Array.isArray(payload)) return payload.map((item) => inyectarEmpresaId(item, empresaId))
  if (payload && typeof payload === 'object') {
    return { ...payload, empresa_id: Number(empresaId) > 0 ? Number(empresaId) : 1 }
  }
  return payload
}

export const EmpresaProvider = ({ user = null, children }) => {
  const empresaId = useMemo(() => {
    const byUser = Number(user?.empresa_id)
    if (byUser > 0) return byUser
    if (esDominioTabora(user?.email)) return 1
    return 1
  }, [user?.empresa_id, user?.email])

  // Slug URL-safe derivado del nombre de la app (marca blanca) o del empresa_id como fallback.
  // Ejemplo: "Viajes Tabora" → "viajes-tabora"
  const empresaSlug = useMemo(
    () => toSlug(user?.nombre_app || `empresa-${empresaId}`),
    [user?.nombre_app, empresaId],
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
