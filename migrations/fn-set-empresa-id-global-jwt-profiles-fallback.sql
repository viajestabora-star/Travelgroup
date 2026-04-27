-- Robustecer fn_set_empresa_id_global para modelo SaaS multi-tenant:
-- 1) Prioriza empresa_id desde JWT app_metadata.
-- 2) Si no existe (token desactualizado), resuelve empresa_id desde public.profiles con auth.uid().
-- 3) Asigna NEW.empresa_id siempre desde contexto autenticado para evitar manipulaciones del payload.

CREATE OR REPLACE FUNCTION public.fn_set_empresa_id_global()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_empresa_jwt integer;
  v_empresa_profile integer;
  v_empresa_final integer;
BEGIN
  -- Usuario autenticado actual
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No hay usuario autenticado en la sesión'
      USING ERRCODE = '42501';
  END IF;

  -- 1) empresa_id desde JWT (app_metadata)
  BEGIN
    v_empresa_jwt := NULLIF(trim(auth.jwt() -> 'app_metadata' ->> 'empresa_id'), '')::integer;
  EXCEPTION WHEN OTHERS THEN
    v_empresa_jwt := NULL;
  END;

  -- 2) fallback obligatorio a profiles cuando JWT no trae empresa_id válido
  IF v_empresa_jwt IS NULL OR v_empresa_jwt <= 0 THEN
    SELECT p.empresa_id
      INTO v_empresa_profile
      FROM public.profiles p
     WHERE p.id = v_uid
     LIMIT 1;
  END IF;

  v_empresa_final := COALESCE(
    CASE WHEN v_empresa_jwt IS NOT NULL AND v_empresa_jwt > 0 THEN v_empresa_jwt END,
    CASE WHEN v_empresa_profile IS NOT NULL AND v_empresa_profile > 0 THEN v_empresa_profile END
  );

  IF v_empresa_final IS NULL OR v_empresa_final <= 0 THEN
    RAISE EXCEPTION 'No se pudo resolver empresa_id para el usuario autenticado'
      USING ERRCODE = '42501';
  END IF;

  -- Siempre forzar empresa_id desde contexto de sesión.
  NEW.empresa_id := v_empresa_final;
  RETURN NEW;
END;
$$;
