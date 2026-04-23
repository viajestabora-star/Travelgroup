import { normalizarNivelAccesoParaServidor } from './nivelAcceso'

export const MENSAJE_SIN_LICENCIAS =
  'No tienes licencias disponibles. Contacta con soporte para ampliar tu plan.'

/**
 * Crea un nuevo miembro del equipo usando supabase.auth.signUp (sin Edge Function).
 * Flujo: validar licencias → signUp en Auth → insert en public.empleados con rol y empresa_id.
 *
 * @param {*} supabase cliente @supabase/supabase-js
 * @param {{ email: string; password: string; nivel_acceso: string; rol_ui: string; empresa_id: number; permitirSinConteo?: boolean }} params
 */
export async function verificarLicenciasYRegistrarMiembro(
  supabase,
  { email, password, nivel_acceso, rol_ui, empresa_id, permitirSinConteo = false }
) {
  // ── Validaciones básicas ─────────────────────────────────────────────────────
  const nivel = normalizarNivelAccesoParaServidor(nivel_acceso)
  if (!nivel) {
    return { ok: false, code: 'ROL_INVALIDO', message: 'Selecciona un rol válido (Admin, Staff o Gestoria).' }
  }

  const em = String(email).trim().toLowerCase()
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

  // ── Check de licencias vía RPC ───────────────────────────────────────────────
  const { data: resumen, error: errResumen } = await supabase.rpc('licencias_equipo_resumen', {
    p_empresa_id: empresaIdNum,
  })

  if (errResumen) {
    return { ok: false, code: 'RPC_LICENCIAS', message: errResumen.message || 'No se pudo validar el cupo de licencias.' }
  }

  if (resumen?.error === 'sin_perfil') {
    return {
      ok: false,
      code: 'SIN_PERFIL',
      message: 'Tu usuario no tiene perfil en Supabase para esta empresa. Contacta con soporte.',
    }
  }

  const disponibles = Number(resumen?.disponibles)
  if (!Number.isFinite(disponibles)) {
    // La RPC respondió pero no devolvió un número: si el usuario es ADMIN, permitimos continuar.
    if (!permitirSinConteo) {
      return {
        ok: false,
        code: 'LICENCIAS_INDETERMINADAS',
        message: 'No se pudo determinar el cupo de licencias para esta agencia.',
      }
    }
  } else if (disponibles <= 0) {
    return { ok: false, code: 'SIN_LICENCIAS', message: MENSAJE_SIN_LICENCIAS }
  }

  // ── Crear usuario en Supabase Auth (sin Edge Function) ───────────────────────
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: em,
    password,
    options: {
      data: {
        empresa_id: empresaIdNum,
        nivel_acceso: nivel,
        rol: rol_ui || nivel,
      },
    },
  })

  if (authError) {
    if (/already registered|already exists|email.*exist|duplicate/i.test(authError.message || '')) {
      return {
        ok: false,
        code: 'DUPLICADO',
        message: 'El email ya existe en el sistema. Usa otro correo o restablece el acceso desde la pantalla de login.',
      }
    }
    return { ok: false, code: 'AUTH', message: authError.message || 'Error al crear el usuario en Auth.' }
  }

  if (!authData?.user?.id) {
    return { ok: false, code: 'AUTH_SIN_ID', message: 'El usuario fue creado pero no se obtuvo su ID. Revisa Supabase Auth.' }
  }

  // ── Insertar en public.empleados ─────────────────────────────────────────────
  const payloadEmpleado = {
    auth_user_id: authData.user.id,
    email: em,
    rol: rol_ui || nivel,
    empresa_id: empresaIdNum,
  }

  const { error: errIns } = await supabase.from('empleados').insert([payloadEmpleado])

  if (errIns) {
    if (errIns.code === '23505' || /duplicate|ya existe|email/i.test(errIns.message || '')) {
      // El usuario de Auth ya existe en empleados: actualizar rol y empresa.
      const { error: errUpd } = await supabase
        .from('empleados')
        .update({ rol: rol_ui || nivel, empresa_id: empresaIdNum, auth_user_id: authData.user.id })
        .eq('email', em)
      if (errUpd) {
        return {
          ok: false,
          code: 'EMPLEADO_UPDATE',
          message: `Usuario creado en Auth, pero no se pudo sincronizar en empleados: ${errUpd.message}`,
        }
      }
    } else {
      return {
        ok: false,
        code: 'EMPLEADO_INSERT',
        message: `Usuario creado en Auth, pero no se pudo registrar en empleados: ${errIns.message}`,
      }
    }
  }

  return { ok: true, code: 'OK', message: `Usuario ${em} creado correctamente.` }
}
