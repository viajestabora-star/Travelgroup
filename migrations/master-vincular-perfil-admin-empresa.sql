-- Panel Master: vincular un usuario ya existente en auth.users a una empresa
-- (public.profiles + app_metadata + roles_usuarios). Invocable tras signUp
-- duplicado al crear un tenant nuevo.

BEGIN;

CREATE OR REPLACE FUNCTION public.master_vincular_perfil_admin_empresa(
  p_email text,
  p_empresa_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_uid uuid;
BEGIN
  IF NOT public.es_operador_master_tabora() THEN
    RAISE EXCEPTION 'solo_master_tabora' USING ERRCODE = '42501';
  END IF;

  IF v_email = '' OR position('@' IN v_email) = 0 THEN
    RAISE EXCEPTION 'email_invalido';
  END IF;

  IF p_empresa_id IS NULL OR p_empresa_id < 2 THEN
    RAISE EXCEPTION 'empresa_id_invalido';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = p_empresa_id) THEN
    RAISE EXCEPTION 'empresa_no_existe';
  END IF;

  SELECT u.id INTO v_uid FROM auth.users u WHERE lower(u.email) = v_email LIMIT 1;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'usuario_no_en_auth');
  END IF;

  INSERT INTO public.profiles (id, empresa_id, email, nombre, nivel_acceso)
  VALUES (
    v_uid,
    p_empresa_id,
    v_email,
    split_part(v_email, '@', 1),
    'ADMIN'
  )
  ON CONFLICT (id) DO UPDATE SET
    empresa_id = EXCLUDED.empresa_id,
    email = EXCLUDED.email,
    nivel_acceso = 'ADMIN',
    nombre = COALESCE(profiles.nombre, EXCLUDED.nombre);

  UPDATE auth.users u
  SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('empresa_id', p_empresa_id)
  WHERE u.id = v_uid;

  INSERT INTO public.roles_usuarios (email, rol, empresa_id)
  VALUES (v_email, 'ADMIN', p_empresa_id)
  ON CONFLICT (email) DO UPDATE
  SET rol = 'ADMIN',
      empresa_id = EXCLUDED.empresa_id;

  RETURN jsonb_build_object('ok', true, 'user_id', v_uid::text);
END;
$$;

REVOKE ALL ON FUNCTION public.master_vincular_perfil_admin_empresa(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_vincular_perfil_admin_empresa(text, integer) TO authenticated;

COMMIT;
