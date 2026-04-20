-- =============================================================================
-- Flowtrix: marca blanca (nombre_app, favicon_url), portal de acceso y
-- master_crear_empresa(nombre comercial, límite, email cliente).
-- Ejecutar después de empresas / roles_usuarios / admin-master.
-- =============================================================================

BEGIN;

ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS nombre_app text;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS favicon_url text;

UPDATE public.empresas SET nombre_app = COALESCE(nullif(trim(nombre_app), ''), 'Flowtrix') WHERE nombre_app IS NULL;
UPDATE public.empresas SET nombre_app = 'Flowtrix' WHERE id = 1 AND (nombre_app IS NULL OR nombre_app = '');

-- Marca pública (empresa raíz id = 1) para login sin sesión
CREATE OR REPLACE FUNCTION public.portal_marca_portada()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'nombre_app', COALESCE(nullif(trim(e.nombre_app), ''), 'Flowtrix'),
        'favicon_url', nullif(trim(e.favicon_url), '')
      )
      FROM public.empresas e
      WHERE e.id = 1
      LIMIT 1
    ),
    '{"nombre_app":"Flowtrix","favicon_url":null}'::jsonb
  );
$$;

REVOKE ALL ON FUNCTION public.portal_marca_portada() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_marca_portada() TO anon, authenticated;

-- Estado de email para flujo primer acceso / login Supabase / interno
CREATE OR REPLACE FUNCTION public.portal_estado_primer_acceso(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_norm text := lower(trim(COALESCE(p_email, '')));
  v_en_roles boolean;
  v_en_auth boolean;
BEGIN
  IF v_norm = '' OR position('@' IN v_norm) = 0 THEN
    RETURN jsonb_build_object(
      'valido', false,
      'puede_primer_acceso', false,
      'tiene_auth', false,
      'en_roles', false
    );
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.roles_usuarios r WHERE lower(r.email) = v_norm) INTO v_en_roles;
  SELECT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = v_norm) INTO v_en_auth;

  RETURN jsonb_build_object(
    'valido', true,
    'en_roles', v_en_roles,
    'tiene_auth', v_en_auth,
    'puede_primer_acceso', v_en_roles AND NOT v_en_auth
  );
END;
$$;

REVOKE ALL ON FUNCTION public.portal_estado_primer_acceso(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_estado_primer_acceso(text) TO anon, authenticated;

-- Datos de roles para metadata en signUp (empresa_id / rol)
CREATE OR REPLACE FUNCTION public.portal_datos_roles_para_signup(p_email text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'empresa_id', r.empresa_id,
    'rol', upper(COALESCE(nullif(trim(r.rol), ''), 'STAFF'))
  )
  FROM public.roles_usuarios r
  WHERE lower(r.email) = lower(trim(COALESCE(p_email, '')))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.portal_datos_roles_para_signup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_datos_roles_para_signup(text) TO anon, authenticated;

-- Sesión UI post-login Supabase (JWT)
CREATE OR REPLACE FUNCTION public.sesion_usuario_ui()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT jsonb_build_object(
    'email', u.email,
    'nombre', COALESCE(p.nombre, split_part(u.email, '@', 1)),
    'nivel_acceso', COALESCE(p.nivel_acceso, 'STAFF'),
    'empresa_id', p.empresa_id,
    'id', u.id::text,
    'nombre_app', COALESCE(nullif(trim(e.nombre_app), ''), 'Flowtrix'),
    'favicon_url', nullif(trim(e.favicon_url), '')
  )
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.empresas e ON e.id = p.empresa_id
  WHERE u.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.sesion_usuario_ui() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sesion_usuario_ui() TO authenticated;

-- Reemplazar master_crear_empresa: 3 parámetros + alta en roles_usuarios
DROP FUNCTION IF EXISTS public.master_crear_empresa(text, integer);

CREATE OR REPLACE FUNCTION public.master_crear_empresa(
  p_nombre_comercial text,
  p_limite_usuarios_staff integer,
  p_email_cliente text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lim integer;
  v_new_id integer;
  v_mail text := lower(trim(COALESCE(p_email_cliente, '')));
BEGIN
  IF NOT public.es_operador_master_tabora() THEN
    RAISE EXCEPTION 'solo_master_tabora' USING ERRCODE = '42501';
  END IF;

  v_lim := COALESCE(p_limite_usuarios_staff, 1);
  IF v_lim < 1 THEN
    v_lim := 1;
  END IF;

  IF trim(COALESCE(p_nombre_comercial, '')) = '' THEN
    RAISE EXCEPTION 'nombre_obligatorio';
  END IF;

  IF v_mail = '' OR position('@' IN v_mail) = 0 THEN
    RAISE EXCEPTION 'email_cliente_obligatorio';
  END IF;

  INSERT INTO public.empresas (nombre, licencias_max, limite_usuarios_staff, activa, nombre_app)
  VALUES (
    trim(COALESCE(p_nombre_comercial, '')),
    v_lim,
    v_lim,
    true,
    trim(COALESCE(p_nombre_comercial, ''))
  )
  RETURNING empresas.id INTO v_new_id;

  INSERT INTO public.roles_usuarios (email, rol, empresa_id)
  VALUES (v_mail, 'ADMIN', v_new_id)
  ON CONFLICT (email) DO UPDATE
  SET rol = 'ADMIN',
      empresa_id = EXCLUDED.empresa_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.master_crear_empresa(text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_crear_empresa(text, integer, text) TO authenticated;

-- Perfil nuevo: empresa_id puede venir en user_metadata (signUp cliente)
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa integer;
  v_nivel text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_empresa := COALESCE(
    NULLIF(trim(NEW.raw_app_meta_data->>'empresa_id'), '')::integer,
    NULLIF(trim(NEW.raw_user_meta_data->>'empresa_id'), '')::integer,
    1
  );

  v_nivel := upper(COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'nivel_acceso'), ''), 'STAFF'));
  IF v_nivel NOT IN ('ADMIN', 'STAFF', 'GESTORIA') THEN
    v_nivel := 'STAFF';
  END IF;

  INSERT INTO public.profiles (id, empresa_id, email, nombre, nivel_acceso)
  VALUES (
    NEW.id,
    v_empresa,
    NEW.email,
    COALESCE(
      NULLIF(trim(NEW.raw_user_meta_data->>'nombre'), ''),
      split_part(NEW.email, '@', 1)
    ),
    v_nivel
  );

  RETURN NEW;
END;
$$;

COMMIT;
