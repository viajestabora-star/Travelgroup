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
    const empresaId = Number(id)
    if (!Number.isInteger(empresaId) || empresaId < 1) {
      throw new Error('ID de empresa inválido para actualizar.')
    }

    // Fuente de verdad del cupo: max_usuarios (numérico).
    const maxUsuarios = Math.max(1, parseInt(changes?.max_usuarios, 10) || 1)

    const { error: err } = await supabase
      .from('empresas')
      .update({ max_usuarios: maxUsuarios })
      .eq('id', empresaId)

    if (err) throw err

    setRows((prev) =>
      prev.map((r) => (
        (r.id ?? r.empresa_id) === empresaId
          ? { ...r, max_usuarios: maxUsuarios, saas_max_usuarios: maxUsuarios }
          : r
      ))
    )

    // Fuerza sincronización con la vista fuente tras un update exitoso.
    await reload()
  }, [reload])

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
    const maxUsuariosPlan = Math.max(1, Number(data.max_usuarios) || 3)
    const payload = {
      nombre_comercial:          (data.nombre_comercial || '').trim(),
      plan_tipo:                 (data.plan_tipo        || 'basic').trim(),
      max_usuarios:              maxUsuariosPlan,
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

    // insert(payload) sin `id` manual → Postgres genera el id auto-incremental.
    // .select().single() devuelve la fila creada y confirma que el RLS permitió el INSERT.
    // Si hay error, JSON.stringify(err) expone el código Postgres real (p.ej. 42501, 401).
    const { data: newRow, error: err } = await supabase
      .from('empresas')
      .insert(payload)
      .select()
      .single()

    if (err) {
      console.error('[createEmpresa] Error completo Supabase:', JSON.stringify(err))
      throw err
    }

    if (!newRow) throw new Error('Supabase no devolvió la fila creada tras el INSERT. Verifica la política RLS de INSERT en la tabla "empresas".')

    // Refrescar sesión de forma forzada para sincronizar claims locales tras crear empresa.
    // Si el backend ya actualizó app_metadata, este refresh hace que el token local lo refleje.
    const { error: refreshErr } = await supabase.auth.refreshSession()
    if (refreshErr) {
      console.warn('[createEmpresa] refreshSession falló tras crear empresa:', refreshErr.message)
    }

    // Reflejar la nueva empresa en la lista local sin recargar la vista
    setRows((prev) => [...prev, newRow])
    return newRow
  }, [])

  /**
   * Elimina un Tenant de forma ordenada:
   *   1. Borra todos los perfiles (profiles) con empresa_id = id.
   *   2. Borra la fila de empresas con id = id.
   *   3. Elimina la empresa de la lista local (sin recargar la vista).
   *
   * Si el DELETE de profiles falla se lanza el error y NO se borra la empresa
   * para evitar dejar perfiles huérfanos. Si el DELETE de empresas falla tras
   * borrar los perfiles, se recarga la lista para reflejar el estado real.
   *
   * @param {number} id — id de la empresa a eliminar
   * @throws {Error} si Supabase devuelve un error en cualquiera de los dos pasos
   */
  const deleteEmpresa = useCallback(async (id) => {
    // Paso 1: eliminar perfiles asociados a la empresa
    const { error: profErr } = await supabase
      .from('profiles')
      .delete()
      .eq('empresa_id', id)

    if (profErr) {
      console.error('[deleteEmpresa] Error al borrar profiles:', JSON.stringify(profErr))
      throw new Error(`No se pudieron eliminar los perfiles: ${profErr.message}`)
    }

    // Paso 2: eliminar la empresa
    const { error: empErr } = await supabase
      .from('empresas')
      .delete()
      .eq('id', id)

    if (empErr) {
      console.error('[deleteEmpresa] Error al borrar empresa:', JSON.stringify(empErr))
      // Recargar para mostrar el estado real (profiles ya borrados)
      await reload()
      throw new Error(`Perfiles eliminados, pero la empresa no pudo borrarse: ${empErr.message}`)
    }

    // Actualizar lista local sin recargar la vista
    setRows((prev) => prev.filter((r) => (r.id ?? r.empresa_id) !== id))
  }, [reload])

  useEffect(() => {
    reload()
  }, [reload])

  return { rows, loading, error, reload, updateEmpresa, createEmpresa, deleteEmpresa }
}
