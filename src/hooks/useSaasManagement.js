import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'

export const useSaasManagement = () => {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')

    const { data, error: err } = await supabase
      .from('vista_gestion_saas')
      .select('*')

    if (err) {
      setRows([])
      setError(err.message || 'No se pudo cargar la vista de gestión SaaS.')
    } else {
      setRows(Array.isArray(data) ? data : [])
    }

    setLoading(false)
  }, [])

  /**
   * Actualiza un registro en la tabla `empresas` y refleja el cambio localmente
   * sin necesidad de recargar toda la vista.
   * @param {number} id  — id de la empresa a actualizar
   * @param {object} changes — campos a modificar (snake_case, coinciden con columnas de empresas)
   * @throws {Error} si Supabase devuelve un error
   */
  const updateEmpresa = useCallback(async (id, changes) => {
    const { error: err } = await supabase
      .from('empresas')
      .update(changes)
      .eq('id', id)

    if (err) throw err

    setRows((prev) =>
      prev.map((r) => ((r.id ?? r.empresa_id) === id ? { ...r, ...changes } : r))
    )
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { rows, loading, error, reload, updateEmpresa }
}
