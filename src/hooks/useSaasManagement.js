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

  /**
   * Crea un nuevo Tenant en la tabla `empresas`.
   * `empresas` no está en ERP_TABLES → el proxy de tenant NO añade filtros aquí.
   * Supabase asigna un id auto-incremental único → empresa_id exclusivo del nuevo Tenant.
   * @param {object} data — { nombre_comercial, plan_tipo, max_usuarios, saas_email_facturacion? }
   * @returns {object} la fila recién creada (con su id)
   * @throws {Error} si Supabase devuelve un error
   */
  const createEmpresa = useCallback(async (data) => {
    const payload = {
      nombre_comercial:          (data.nombre_comercial || '').trim(),
      plan_tipo:                 (data.plan_tipo        || 'basic').trim(),
      max_usuarios:              Math.max(1, Number(data.max_usuarios) || 3),
      suscripcion_activa:        true,
      saas_precio_pack_base:     60,
      saas_precio_usuario_extra: 12,
    }
    if (data.saas_email_facturacion && data.saas_email_facturacion.trim()) {
      payload.saas_email_facturacion = data.saas_email_facturacion.trim()
    }

    const { data: newRow, error: err } = await supabase
      .from('empresas')
      .insert(payload)
      .select()
      .single()

    if (err) throw err

    // Añadir la nueva empresa a la lista local para reflejar el cambio sin recargar
    setRows((prev) => [...prev, newRow])
    return newRow
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { rows, loading, error, reload, updateEmpresa, createEmpresa }
}
