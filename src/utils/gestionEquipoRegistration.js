import { normalizarNivelAccesoParaServidor } from './nivelAcceso'
import { portalConsultarTieneAuth } from './portalAuthEmail'
import { obtenerResumenLicenciasEmpresa } from './licenciasEmpresa'

export const MENSAJE_SIN_LICENCIAS =
  'No tienes licencias disponibles. Contacta con soporte para ampliar tu plan.'

/**
 * Flujo lineal Auth → DB, sin Edge Function:
 *   1. Validaciones locales
 *   2. Check de licencias (empresas.licencias_max vs perfiles por empresa_id)
 *   3. supabase.auth.signUp
 *   4. INSERT en public.empleados { id, email, empresa_id, rol }
 *
 * @param {*} supabase  instancia @supabase/supabase-js
 * @param {{
 *   email: string
 *   password: string
 *   nivel_acceso: string   — 'ADMIN' | 'STAFF' | 'GESTORIA'
 *   rol_ui: string         — valor del desplegable: 'Admin' | 'Staff' | 'Gestoria'
 *   empresa_id: number
 *   permitirSinConteo?: boolean  — true para admins cuando el RPC no devuelve número
 * }} params
 */
export async function verificarLicenciasYRegistrarMiembro(
  supabase,
  { email, password, nivel_acceso, rol_ui, empresa_id, permitirSinConteo = false }
) {
  // ── 1. Validaciones ──────────────────────────────────────────────────────────
  const nivel = normalizarNivelAccesoParaServidor(nivel_acceso)
  if (!nivel) {
    return { ok: false, code: 'ROL_INVALIDO', message: 'Selecciona un rol válido (Admin, Staff o Gestoria).' }
  }

  const em = String(email || '').trim().toLowerCase()
  if (!em || !em.includes('@')) {
    return { ok: false, code: 'EMAIL', message: 'Introduce un correo válido.' }
  }

  if (!password || String(password).length < 6) {
    return { ok: false, code: 'PASSWORD', message: 'La contraseña debe tener al menos 6 caracteres.' }
  }

  const empresaIdNum = Number(empresa_id)
  if (!Number.isFinite(empresaIdNum) || empresaIdNum <= 0) {
    return { ok: false, code: 'EMPRESA_ID', message: 'No se pudo identificar la empresa activa.' }
  }

  // ── 2. Check de licencias ────────────────────────────────────────────────────
  const { ok: licOk, resumen, error: errLic } = await obtenerResumenLicenciasEmpresa(supabase, empresaIdNum)

  if (!licOk) {
    return {
      ok: false,
      code: 'RPC_LICENCIAS',
      message: errLic || 'No se pudo validar el cupo de licencias.',
    }
  }

  const disponibles = Number(resumen?.disponibles)
  if (!Number.isFinite(disponibles)) {
    if (!permitirSinConteo) {
      return {
        ok: false,
        code: 'LICENCIAS_INDETERMINADAS',
        message: 'No se pudo determinar el cupo de licencias. Contacta con soporte.',
      }
    }
    // Admin: se permite continuar aunque el número no sea determinable.
  } else if (disponibles <= 0) {
    return { ok: false, code: 'SIN_LICENCIAS', message: MENSAJE_SIN_LICENCIAS }
  }

  // ── 2b. Antes de signUp: evitar "User already registered" cuando el correo ya está en Auth
  const probeAuth = await portalConsultarTieneAuth(supabase, em)
  if (!probeAuth.ok) {
    return {
      ok: false,
      code: 'PORTAL_AUTH',
      message:
        probeAuth.error
        || 'No se pudo comprobar si el correo ya existe. Reintenta o contacta con soporte.',
    }
  }
  if (probeAuth.tieneAuth) {
    return {
      ok: false,
      code: 'EMAIL_YA_EN_AUTH',
      message:
        'Este correo ya tiene cuenta en el sistema. Usa otro email o pide al administrador que gestione el acceso desde el panel.',
    }
  }

  // ── 3. Crear usuario en Supabase Auth (empresa_id siempre en options.data) ───
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: em,
    password,
    options: {
      data: {
        empresa_id: empresaIdNum,
        // La columna real de profiles es nivel_acceso, no rol.
        // Se omite 'rol' de user_metadata para evitar inconsistencias con el esquema.
        nivel_acceso: nivel,
      },
    },
  })

  if (authError) {
    // Supabase devuelve status 422 cuando el email ya está registrado
    if (
      authError.status === 422 ||
      /already registered|user already exists|email.*exist|duplicate/i.test(authError.message || '')
    ) {
      return {
        ok: false,
        code: 'DUPLICADO',
        message: 'Este email ya está registrado. Usa otro correo o restablece el acceso.',
      }
    }
    return { ok: false, code: 'AUTH', message: authError.message || 'Error al crear el usuario.' }
  }

  const userId = authData?.user?.id
  if (!userId) {
    return {
      ok: false,
      code: 'AUTH_SIN_ID',
      message: 'El usuario se creó en Auth pero no se recibió su ID. Revisa la configuración de Supabase.',
    }
  }

  // ── 4. INSERT en public.empleados ────────────────────────────────────────────
  // Columnas reales de la tabla: id (uuid PK), email, empresa_id, rol
  const { error: errIns } = await supabase.from('empleados').insert([
    {
      id: userId,
      email: em,
      empresa_id: empresaIdNum,
      rol: rol_ui,
    },
  ])

  if (errIns) {
    if (errIns.code === '23505' || /duplicate|ya existe/i.test(errIns.message || '')) {
      // El email ya tiene fila en empleados: actualizamos rol y empresa.
      const { error: errUpd } = await supabase
        .from('empleados')
        .update({ rol: rol_ui, empresa_id: empresaIdNum })
        .eq('email', em)

      if (errUpd) {
        return {
          ok: false,
          code: 'EMPLEADO_UPDATE',
          message: `Usuario creado en Auth, pero error al actualizar empleados: ${errUpd.message}`,
        }
      }
    } else {
      return {
        ok: false,
        code: 'EMPLEADO_INSERT',
        message: `Usuario creado en Auth, pero error al registrar en empleados: ${errIns.message}`,
      }
    }
  }

  return { ok: true, code: 'OK', message: `Usuario ${em} creado correctamente.` }
}
