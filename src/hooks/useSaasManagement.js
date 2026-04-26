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
   * @param {object} data — campos del formulario de nueva empresa
   * @returns {object} la fila recién creada (con su id asignado por Postgres)
   * @throws {Error} si Supabase devuelve un error
   */
  const createEmpresa = useCallback(async (data) => {
    // Campos obligatorios
    const payload = {
      nombre_comercial:          (data.nombre_comercial || '').trim(),
      plan_tipo:                 (data.plan_tipo        || 'basic').trim(),
      max_usuarios:              Math.max(1, Number(data.max_usuarios) || 3),
      suscripcion_activa:        true,
      saas_precio_pack_base:     Number(data.saas_precio_pack_base)     || 60,
      saas_precio_usuario_extra: Number(data.saas_precio_usuario_extra) || 12,
    }

    // Campos opcionales: solo incluir si tienen valor
    const opcionales = [
      'saas_razon_social', 'saas_nif', 'saas_email_facturacion',
      'saas_telefono', 'saas_direccion',
    ]
    opcionales.forEach((key) => {
      if (data[key] && String(data[key]).trim()) payload[key] = String(data[key]).trim()
    })

    // Payload como array: forma canónica de PostgREST.
    // .select() al final es mandatorio: confirma que el RLS permitió el INSERT
    // y devuelve la fila con el id auto-incremental asignado por Postgres.
    const { data, error: err } = await supabase
      .from('empresas')
      .insert([payload])
      .select()

    if (err) throw err

    const newRow = Array.isArray(data) ? data[0] : data
    if (!newRow) throw new Error('Supabase no devolvió la fila creada. Verifica la política RLS de INSERT en "empresas".')

    // Reflejar la nueva empresa en la lista local sin recargar la vista
    setRows((prev) => [...prev, newRow])
    return newRow
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { rows, loading, error, reload, updateEmpresa, createEmpresa }
}
