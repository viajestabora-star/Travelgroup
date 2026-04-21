-- Blindaje multitenant para recibos_oficiales:
-- si empresa_id llega null desde frontend/backend, se hereda automáticamente
-- del cobro, del expediente, del perfil auth o del dominio @viajestabora.com.

CREATE OR REPLACE FUNCTION public.resolver_empresa_id_activa()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_claim integer;
  v_uid uuid;
  v_profile integer;
  v_email text;
BEGIN
  v_claim := NULLIF(trim(auth.jwt() -> 'app_metadata' ->> 'empresa_id'), '')::integer;
  IF v_claim IS NOT NULL AND v_claim > 0 THEN
    RETURN v_claim;
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NOT NULL THEN
    SELECT p.empresa_id INTO v_profile
    FROM public.profiles p
    WHERE p.id = v_uid
    LIMIT 1;

    IF v_profile IS NOT NULL AND v_profile > 0 THEN
      RETURN v_profile;
    END IF;
  END IF;

  v_email := lower(trim(COALESCE(auth.jwt() ->> 'email', '')));
  IF right(v_email, length('@viajestabora.com')) = '@viajestabora.com' THEN
    RETURN 1;
  END IF;

  RETURN 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.tf_recibos_oficiales_inherit_empresa_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa integer;
BEGIN
  IF NEW.empresa_id IS NOT NULL AND NEW.empresa_id > 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.cobro_id IS NOT NULL THEN
    SELECT c.empresa_id INTO v_empresa
    FROM public.cobros_expediente c
    WHERE c.id = NEW.cobro_id
    LIMIT 1;

    IF v_empresa IS NOT NULL AND v_empresa > 0 THEN
      NEW.empresa_id := v_empresa;
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.expediente_id IS NOT NULL THEN
    SELECT e.empresa_id INTO v_empresa
    FROM public.expedientes e
    WHERE e.id = NEW.expediente_id
    LIMIT 1;

    IF v_empresa IS NOT NULL AND v_empresa > 0 THEN
      NEW.empresa_id := v_empresa;
      RETURN NEW;
    END IF;
  END IF;

  NEW.empresa_id := public.resolver_empresa_id_activa();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recibos_oficiales_inherit_empresa_id ON public.recibos_oficiales;
CREATE TRIGGER trg_recibos_oficiales_inherit_empresa_id
BEFORE INSERT OR UPDATE ON public.recibos_oficiales
FOR EACH ROW
EXECUTE FUNCTION public.tf_recibos_oficiales_inherit_empresa_id();
