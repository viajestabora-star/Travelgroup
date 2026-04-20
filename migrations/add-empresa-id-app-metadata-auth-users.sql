-- Garantiza empresa_id en app_metadata para JWT y sincroniza perfiles.
-- 1) RPC invocable por usuarios autenticados para asegurar su claim empresa_id.
-- 2) Backfill en auth.users para empleados actuales de Tabora.
-- 3) Trigger opcional en public.profiles (si existe y tiene empresa_id).

BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_empresa_id_claim(p_empresa_id integer DEFAULT 1)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  UPDATE auth.users u
  SET raw_app_meta_data =
    COALESCE(u.raw_app_meta_data, '{}'::jsonb) ||
    jsonb_build_object('empresa_id', p_empresa_id)
  WHERE u.id = v_uid
    AND (u.raw_app_meta_data ->> 'empresa_id') IS DISTINCT FROM p_empresa_id::text;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_empresa_id_claim(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_empresa_id_claim(integer) TO authenticated;

-- Backfill: empleados actuales de Tabora
UPDATE auth.users u
SET raw_app_meta_data =
  COALESCE(u.raw_app_meta_data, '{}'::jsonb) ||
  '{"empresa_id": 1}'::jsonb
WHERE lower(COALESCE(u.email, '')) IN (
  'andres@viajestabora.com',
  'info@viajestabora.com',
  'grupos@viajestabora.com'
)
AND (u.raw_app_meta_data ->> 'empresa_id') IS DISTINCT FROM '1';

-- Trigger opcional: si existe public.profiles con columna empresa_id.
CREATE OR REPLACE FUNCTION public.sync_auth_user_empresa_id_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.empresa_id IS NOT NULL THEN
    UPDATE auth.users u
    SET raw_app_meta_data =
      COALESCE(u.raw_app_meta_data, '{}'::jsonb) ||
      jsonb_build_object('empresa_id', NEW.empresa_id)
    WHERE u.id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'profiles'
         AND column_name = 'empresa_id'
     ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_sync_auth_user_empresa_id_from_profile ON public.profiles';
    EXECUTE '
      CREATE TRIGGER trg_sync_auth_user_empresa_id_from_profile
      AFTER INSERT OR UPDATE OF empresa_id
      ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_auth_user_empresa_id_from_profile()
    ';
  END IF;
END;
$$;

COMMIT;
