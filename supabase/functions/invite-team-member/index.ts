/**
 * Invita / crea un usuario en la misma empresa que el ADMIN autenticado.
 * empresa_id NUNCA se toma del body: solo de app_metadata del JWT del invitador.
 *
 * Despliegue: supabase functions deploy invite-team-member --no-verify-jwt
 * (o verify_jwt en config y validar igualmente con getUser).
 *
 * Variables automáticas en Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const NIVELES = new Set(['ADMIN', 'STAFF', 'GESTORIA'])

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: 'missing_env' }, 500)
  }

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) {
    return json({ ok: false, error: 'no_authorization' }, 401)
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const {
    data: { user },
    error: userErr,
  } = await adminClient.auth.getUser(token)

  if (userErr || !user) {
    return json({ ok: false, error: 'invalid_token' }, 401)
  }

  const empresaIdJwt = Number(user.app_metadata?.empresa_id)
  if (!Number.isInteger(empresaIdJwt) || empresaIdJwt < 1) {
    return json({ ok: false, error: 'sin_empresa_en_sesion' }, 403)
  }

  const { data: prof, error: profErr } = await adminClient
    .from('profiles')
    .select('nivel_acceso, empresa_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profErr) {
    return json({ ok: false, error: profErr.message }, 500)
  }
  if (String(prof?.nivel_acceso) !== 'ADMIN') {
    return json({ ok: false, error: 'solo_admin' }, 403)
  }
  if (prof?.empresa_id != null && Number(prof.empresa_id) !== empresaIdJwt) {
    return json({ ok: false, error: 'empresa_inconsistente' }, 403)
  }

  let body: { email?: string; password?: string; nivel_acceso?: string; nombre?: string }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'json_invalido' }, 400)
  }

  const email = String(body.email || '')
    .trim()
    .toLowerCase()
  const password = String(body.password || '')
  const nivelRaw = String(body.nivel_acceso || '').trim().toUpperCase()

  if (!email || !email.includes('@')) {
    return json({ ok: false, error: 'email_invalido' }, 400)
  }
  if (password.length < 6) {
    return json({ ok: false, error: 'password_corta' }, 400)
  }
  if (!NIVELES.has(nivelRaw)) {
    return json({ ok: false, error: 'rol_invalido' }, 400)
  }

  const { data: empRow, error: empErr } = await adminClient
    .from('empresas')
    .select('licencias_max, limite_usuarios_staff')
    .eq('id', empresaIdJwt)
    .maybeSingle()

  if (empErr || !empRow) {
    return json({ ok: false, error: 'empresa_no_encontrada' }, 400)
  }

  const { count, error: countErr } = await adminClient
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaIdJwt)

  if (countErr) {
    return json({ ok: false, error: countErr.message }, 500)
  }

  const limStaff = Number(empRow.limite_usuarios_staff)
  const licMax = Number(empRow.licencias_max)
  const max =
    Math.max(
      Number.isFinite(limStaff) && limStaff > 0 ? limStaff : 0,
      Number.isFinite(licMax) && licMax > 0 ? licMax : 0,
    ) || 1
  const usados = count ?? 0
  if (usados >= max) {
    return json({ ok: false, error: 'LIMITE_USUARIOS_ALCANZADO' }, 400)
  }

  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { empresa_id: empresaIdJwt },
    user_metadata: {
      nivel_acceso: nivelRaw,
      nombre: String(body.nombre || '').trim() || email.split('@')[0],
    },
  })

  if (createErr) {
    const msg = createErr.message || ''
    if (/LIMITE_USUARIOS_ALCANZADO/i.test(msg)) {
      return json({ ok: false, error: 'LIMITE_USUARIOS_ALCANZADO' }, 400)
    }
    return json({ ok: false, error: msg }, 400)
  }

  return json({ ok: true, user_id: created.user?.id ?? null })
})
