-- Blindaje para public.empleados:
-- hereda empresa_id del usuario activo y fuerza empresa_id=1 para @viajestabora.com.

CREATE OR REPLACE FUNCTION public.tf_empleados_resolver_empresa_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_claim integer;
  v_profile integer;
  v_uid uuid;
  v_email text;
BEGIN
  IF NEW.empresa_id IS NOT NULL AND NEW.empresa_id > 0 THEN
    RETURN NEW;
  END IF;

  v_claim := NULLIF(trim(auth.jwt() -> 'app_metadata' ->> 'empresa_id'), '')::integer;
  IF v_claim IS NOT NULL AND v_claim > 0 THEN
    NEW.empresa_id := v_claim;
    RETURN NEW;
  END IF;

  v_uid := COALESCE(NEW.auth_user_id, auth.uid());
  IF v_uid IS NOT NULL THEN
    SELECT p.empresa_id INTO v_profile
    FROM public.profiles p
    WHERE p.id = v_uid
    LIMIT 1;
    IF v_profile IS NOT NULL AND v_profile > 0 THEN
      NEW.empresa_id := v_profile;
      RETURN NEW;
    END IF;
  END IF;

  v_email := lower(trim(COALESCE(NEW.email, auth.jwt() ->> 'email', '')));
  IF right(v_email, length('@viajestabora.com')) = '@viajestabora.com' THEN
    NEW.empresa_id := 1;
    RETURN NEW;
  END IF;

  NEW.empresa_id := 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_empleados_resolver_empresa_id ON public.empleados;
CREATE TRIGGER trg_empleados_resolver_empresa_id
BEFORE INSERT OR UPDATE ON public.empleados
FOR EACH ROW
EXECUTE FUNCTION public.tf_empleados_resolver_empresa_id();
