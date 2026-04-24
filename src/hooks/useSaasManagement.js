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

  useEffect(() => {
    reload()
  }, [reload])

  return { rows, loading, error, reload }
}
