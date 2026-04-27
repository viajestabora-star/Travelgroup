import { supabase } from '../supabase'

const DOMINIO_TABORA = '@viajestabora.com'

export const esDominioTabora = (email) => String(email || '').toLowerCase().endsWith(DOMINIO_TABORA)

const normalizarEmail = (email) => String(email || '').trim().toLowerCase()

export const resolverEmpresaIdActiva = ({ authUser = null, appUser = null } = {}) => {
  // Prioridad: sesión local → app_metadata (servidor) → null
  // NUNCA se hardcodea empresa_id=1: cada tenant opera exclusivamente con su propio ID.
  const byApp = Number(appUser?.empresa_id)
  if (byApp > 0) return byApp
  const byClaim = Number(authUser?.app_metadata?.empresa_id)
  if (byClaim > 0) return byClaim
  return null
}

export async function resolverActorCrm({ authUser = null } = {}) {
  const email = normalizarEmail(authUser?.email)
  if (!authUser?.id && !email) return { actorId: null, fuente: null }

  if (authUser?.id) {
    const { data: empByAuth } = await supabase
      .from('empleados')
      .select('id')
      .eq('id', authUser.id)
      .maybeSingle()
    if (empByAuth?.id) return { actorId: empByAuth.id, fuente: 'empleados' }
  }

  if (email) {
    const { data: empByEmail } = await supabase
      .from('empleados')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (empByEmail?.id) return { actorId: empByEmail.id, fuente: 'empleados' }
  }

  if (authUser?.id) {
    const { data: profileById } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', authUser.id)
      .maybeSingle()
    if (profileById?.id) return { actorId: profileById.id, fuente: 'profiles' }
  }

  if (email) {
    const { data: profileByEmail } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (profileByEmail?.id) return { actorId: profileByEmail.id, fuente: 'profiles' }
  }

  return { actorId: null, fuente: null }
}

export async function asegurarVinculacionEmpleado({ authUser = null, appUser = null } = {}) {
  if (!authUser?.id || !authUser?.email) return { ok: false, motivo: 'sin_sesion_auth' }

  // Si ya existe actor (empleado o profile), no crear duplicado.
  const actor = await resolverActorCrm({ authUser })
  if (actor.actorId) return { ok: true, creado: false, ...actor }

  // Resolver empresa_id del tenant activo. Si no se puede determinar, salir sin crear.
  // La restricción anterior (@viajestabora.com) se elimina: cualquier tenant puede tener
  // un actor en empleados para el sistema CRM.
  const empresaId = resolverEmpresaIdActiva({ authUser, appUser })
  if (!empresaId) return { ok: true, creado: false, actorId: null, fuente: null }

  const email = normalizarEmail(authUser.email)
  const nombre =
    String(appUser?.nombre || authUser?.user_metadata?.nombre || authUser?.user_metadata?.name || email.split('@')[0] || '').trim()

  const intentos = [
    { id: authUser.id, email, nombre, empresa_id: empresaId },
    { id: authUser.id, email, empresa_id: empresaId },
    { email, nombre, empresa_id: empresaId },
    { email, empresa_id: empresaId },
  ]

  for (const payload of intentos) {
    const { error } = await supabase.from('empleados').insert([payload])
    if (!error) {
      const nuevo = await resolverActorCrm({ authUser })
      return { ok: true, creado: true, ...nuevo }
    }
  }

  const finalActor = await resolverActorCrm({ authUser })
  return { ok: true, creado: false, ...finalActor }
}
