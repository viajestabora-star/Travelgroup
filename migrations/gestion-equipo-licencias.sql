-- =============================================================================
-- Gestión de equipo: empresas, profiles, límite de licencias (trigger),
-- RPCs listado / resumen de licencias. Creación de usuarios: Edge Function
-- invite-team-member (service_role + app_metadata.empresa_id del admin).
--
-- Antes de ejecutar: revisa si ya existe public.profiles (plantilla Supabase);
-- esta migración añade columnas que falten. Si ya tienes otro trigger en
-- auth.users que inserta en profiles, fusiona la lógica para no duplicar filas.
-- =============================================================================

BEGIN;

-- ── Empresas ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.empresas (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL DEFAULT '',
  limite_licencias INTEGER NOT NULL DEFAULT 25 CHECK (limite_licencias > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.empresas (id, nombre, limite_licencias)
VALUES (1, 'Viajes Tabora', 25)
ON CONFLICT (id) DO UPDATE
SET nombre = COALESCE(NULLIF(EXCLUDED.nombre, ''), empresas.nombre),
    limite_licencias = GREATEST(empresas.limite_licencias, EXCLUDED.limite_licencias);

-- ── Perfiles (miembros por empresa) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  email TEXT,
  nombre TEXT,
  nivel_acceso TEXT NOT NULL DEFAULT 'STAFF',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES public.empresas(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nombre TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nivel_acceso TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

UPDATE public.profiles SET nivel_acceso = 'STAFF' WHERE nivel_acceso IS NULL OR nivel_acceso = '';
UPDATE public.profiles SET empresa_id = 1 WHERE empresa_id IS NULL;

DO $$
BEGIN
  ALTER TABLE public.profiles ALTER COLUMN empresa_id SET NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_nivel_acceso_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_nivel_acceso_check
      CHECK (nivel_acceso IN ('ADMIN', 'STAFF', 'GESTORIA'));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Límite de licencias (disparador alineado con empresas.limite_licencias) ──
CREATE OR REPLACE FUNCTION public.tf_profiles_enforce_limite_licencias()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer;
  v_usados integer;
BEGIN
  SELECT e.limite_licencias INTO v_max
  FROM public.empresas e
  WHERE e.id = NEW.empresa_id;

  IF v_max IS NULL THEN
    RAISE EXCEPTION 'Empresa inválida';
  END IF;

  SELECT count(*)::integer INTO v_usados
  FROM public.profiles p
  WHERE p.empresa_id = NEW.empresa_id;

  IF TG_OP = 'INSERT' AND v_usados >= v_max THEN
    RAISE EXCEPTION 'LIMITE_USUARIOS_ALCANZADO' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_enforce_licencias ON public.profiles;
CREATE TRIGGER trg_profiles_enforce_licencias
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.tf_profiles_enforce_limite_licencias();

-- ── Alta automática de perfil tras registro en auth (empresa_id desde metadata) ──
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

DROP TRIGGER IF EXISTS trg_gestion_equipo_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_gestion_equipo_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user_profile();

-- ── RPC: resumen de licencias (invocador debe tener fila en profiles) ───────
CREATE OR REPLACE FUNCTION public.licencias_equipo_resumen()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_empresa_id integer;
  v_max integer;
  v_usados integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT p.empresa_id INTO v_empresa_id FROM public.profiles p WHERE p.id = v_uid;

  IF v_empresa_id IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'sin_perfil',
      'empresa_id', null,
      'usados', 0,
      'max', 0,
      'disponibles', 0
    );
  END IF;

  SELECT e.limite_licencias INTO v_max FROM public.empresas e WHERE e.id = v_empresa_id;
  SELECT count(*)::integer INTO v_usados FROM public.profiles p WHERE p.empresa_id = v_empresa_id;

  RETURN jsonb_build_object(
    'empresa_id', v_empresa_id,
    'usados', v_usados,
    'max', COALESCE(v_max, 0),
    'disponibles', GREATEST(COALESCE(v_max, 0) - v_usados, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.licencias_equipo_resumen() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.licencias_equipo_resumen() TO authenticated;

-- ── RPC: listado de equipo (solo ADMIN de la misma empresa) ────────────────
CREATE OR REPLACE FUNCTION public.listar_equipo_mi_empresa()
RETURNS TABLE (
  id uuid,
  email text,
  nombre text,
  nivel_acceso text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_empresa_id integer;
  v_es_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT p.empresa_id, (p.nivel_acceso = 'ADMIN')
  INTO v_empresa_id, v_es_admin
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF NOT COALESCE(v_es_admin, false) THEN
    RAISE EXCEPTION 'solo_admin' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.email, p.nombre, p.nivel_acceso, p.created_at
  FROM public.profiles p
  WHERE p.empresa_id = v_empresa_id
  ORDER BY p.created_at ASC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_equipo_mi_empresa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_equipo_mi_empresa() TO authenticated;

-- ── RLS mínima: cada usuario ve su propia fila (listado vía RPC definer) ────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

COMMIT;

-- Despliegue Edge Function (desde la raíz del repo, con Supabase CLI):
--   supabase functions deploy invite-team-member
