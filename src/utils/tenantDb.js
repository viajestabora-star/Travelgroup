/**
 * Motor de aislamiento multi-tenant para Supabase.
 *
 * Inyecta automáticamente .eq('empresa_id', tenantId) en todas las consultas
 * SELECT / UPDATE / DELETE de las tablas ERP declaradas en ERP_TABLES.
 * En INSERT / UPSERT añade empresa_id al payload si no viene ya incluido.
 *
 * Activar al iniciar sesión:  setTenantEmpresaId(user.empresa_id)
 * Desactivar al cerrar:       clearTenantEmpresaId()
 */

let _tenantId = null

/** Tablas de negocio que deben filtrarse por empresa_id. */
export const ERP_TABLES = new Set([
  'clientes',
  'expedientes',
  'prospectos',
  'notas_trabajo',
  'planning',
  'proveedores',
  'facturas',
  'facturas_lineas',
  'facturas_emitidas',
  'facturas_emitidas_global',
  'cierres',
  'cierres_economicos',
  'gastos_estructura',
  'pagos_proveedores',
  'servicios_cotizacion',
  'control_horario',
  'empleados',
])

export const setTenantEmpresaId = (id) => {
  const n = Number(id)
  _tenantId = n > 0 ? n : null
}

export const clearTenantEmpresaId = () => {
  _tenantId = null
}

export const getTenantEmpresaId = () => _tenantId

/**
 * Envuelve un QueryBuilder de Supabase mediante un Proxy.
 * Si la tabla pertenece a ERP_TABLES y hay un _tenantId activo,
 * todos los métodos de consulta llevarán el filtro empresa_id automáticamente.
 */
export const applyTenantFilter = (table, builder) => {
  if (!ERP_TABLES.has(table)) return builder

  return new Proxy(builder, {
    get(target, prop) {
      // SELECT → añade .eq('empresa_id', _tenantId) al FilterBuilder devuelto
      if (prop === 'select') {
        return (...args) => {
          const fb = target.select(...args)
          if (_tenantId) return fb.eq('empresa_id', _tenantId)
          return fb
        }
      }

      // UPDATE → añade .eq('empresa_id', _tenantId) al FilterBuilder devuelto
      if (prop === 'update') {
        return (payload, opts) => {
          const fb = target.update(payload, opts)
          if (_tenantId) return fb.eq('empresa_id', _tenantId)
          return fb
        }
      }

      // DELETE → añade .eq('empresa_id', _tenantId) al FilterBuilder devuelto
      if (prop === 'delete') {
        return (...args) => {
          const fb = target.delete(...args)
          if (_tenantId) return fb.eq('empresa_id', _tenantId)
          return fb
        }
      }

      // INSERT → inyecta empresa_id en el payload
      if (prop === 'insert') {
        return (payload, opts) => {
          if (_tenantId) {
            if (Array.isArray(payload)) {
              payload = payload.map((item) => ({
                ...item,
                empresa_id: item.empresa_id != null ? item.empresa_id : _tenantId,
              }))
            } else if (payload && typeof payload === 'object') {
              payload = {
                ...payload,
                empresa_id: payload.empresa_id != null ? payload.empresa_id : _tenantId,
              }
            }
          }
          return target.insert(payload, opts)
        }
      }

      // UPSERT → inyecta empresa_id en el payload
      if (prop === 'upsert') {
        return (payload, opts) => {
          if (_tenantId) {
            if (Array.isArray(payload)) {
              payload = payload.map((item) => ({
                ...item,
                empresa_id: item.empresa_id != null ? item.empresa_id : _tenantId,
              }))
            } else if (payload && typeof payload === 'object') {
              payload = {
                ...payload,
                empresa_id: payload.empresa_id != null ? payload.empresa_id : _tenantId,
              }
            }
          }
          return target.upsert(payload, opts)
        }
      }

      // Resto de métodos → pass-through
      const val = target[prop]
      if (typeof val === 'function') return val.bind(target)
      return val
    },
  })
}
