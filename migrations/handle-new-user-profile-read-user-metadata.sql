-- Asegura que el alta en Auth (signUp options.data → raw_user_meta_data)
-- dispare el perfil correcto: empresa_id debe leerse de user_metadata si no
-- viene en app_metadata. Ejecutar en proyectos que solo tengan la versión
-- antigua de handle_new_user_profile (solo raw_app_meta_data).

BEGIN;

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
