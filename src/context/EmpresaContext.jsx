import React, { createContext, useContext, useMemo } from 'react'

const EmpresaContext = createContext({
  empresaId: 1,
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

  const value = useMemo(
    () => ({
      empresaId,
      withEmpresaId: (payload) => inyectarEmpresaId(payload, empresaId),
    }),
    [empresaId]
  )

  return <EmpresaContext.Provider value={value}>{children}</EmpresaContext.Provider>
}

export const useEmpresa = () => useContext(EmpresaContext)
