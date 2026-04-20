-- =============================================================================
-- Panel Master Tabora: columnas empresas (limite_usuarios_staff, activa),
-- RPCs solo invocables con empresa_id = 1 en JWT, chequeo empresa activa,
-- y alineación del cupo de usuarios con limite_usuarios_staff.
-- =============================================================================

BEGIN;

-- ── Columnas nuevas en empresas ────────────────────────────────────────────
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS limite_usuarios_staff INTEGER;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS activa BOOLEAN DEFAULT true;

UPDATE public.empresas
SET limite_usuarios_staff = COALESCE(limite_usuarios_staff, licencias_max, 1)
WHERE limite_usuarios_staff IS NULL;

UPDATE public.empresas SET activa = true WHERE activa IS NULL;

ALTER TABLE public.empresas
  ALTER COLUMN limite_usuarios_staff SET DEFAULT 1,
  ALTER COLUMN limite_usuarios_staff SET NOT NULL;

ALTER TABLE public.empresas
  ALTER COLUMN activa SET DEFAULT true,
  ALTER COLUMN activa SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.empresas
    ADD CONSTRAINT empresas_limite_usuarios_staff_pos CHECK (limite_usuarios_staff >= 1);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Cupo efectivo por empresa (staff / licencias)
CREATE OR REPLACE FUNCTION public.empresa_limite_efectivo(p_empresa_id integer)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(e.limite_usuarios_staff, e.licencias_max, 1)::integer
  FROM public.empresas e
  WHERE e.id = p_empresa_id;
$$;

-- ── Trigger perfiles: usa límite staff ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tf_profiles_enforce_licencias_max()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer;
  v_usados integer;
BEGIN
  SELECT public.empresa_limite_efectivo(NEW.empresa_id) INTO v_max;

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

-- ── Resumen licencias equipo (usa mismo cupo) ─────────────────────────────
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

  SELECT public.empresa_limite_efectivo(v_empresa_id) INTO v_max;
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

-- ── ¿La empresa del usuario sigue activa? ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.mi_empresa_activa()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_act boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN true;
  END IF;
  SELECT e.activa INTO v_act
  FROM public.profiles p
  JOIN public.empresas e ON e.id = p.empresa_id
  WHERE p.id = auth.uid();
  RETURN COALESCE(v_act, true);
END;
$$;

REVOKE ALL ON FUNCTION public.mi_empresa_activa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mi_empresa_activa() TO authenticated;

-- ── Helper: JWT empresa_id ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.jwt_empresa_id()
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(trim(auth.jwt() -> 'app_metadata' ->> 'empresa_id'), '')::integer, 0);
$$;

-- Solo operadores cuyo claim (o perfil) es empresa Tabora id = 1
CREATE OR REPLACE FUNCTION public.es_operador_master_tabora()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_jwt integer;
BEGIN
  v_jwt := public.jwt_empresa_id();
  IF v_jwt = 1 THEN
    RETURN true;
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.empresa_id = 1 AND p.nivel_acceso = 'ADMIN'
  );
END;
$$;

-- ── RPC Master: listar ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.master_listar_empresas()
RETURNS TABLE (
  id integer,
  nombre text,
  limite_usuarios_staff integer,
  licencias_max integer,
  activa boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.es_operador_master_tabora() THEN
    RAISE EXCEPTION 'solo_master_tabora' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT e.id, e.nombre, e.limite_usuarios_staff, e.licencias_max, e.activa, e.created_at
  FROM public.empresas e
  ORDER BY e.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.master_listar_empresas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_listar_empresas() TO authenticated;

-- ── RPC Master: nueva agencia ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.master_crear_empresa(
  p_nombre text,
  p_limite_usuarios_staff integer DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lim integer;
  v_new_id integer;
BEGIN
  IF NOT public.es_operador_master_tabora() THEN
    RAISE EXCEPTION 'solo_master_tabora' USING ERRCODE = '42501';
  END IF;

  v_lim := COALESCE(p_limite_usuarios_staff, 1);
  IF v_lim < 1 THEN
    v_lim := 1;
  END IF;

  IF trim(COALESCE(p_nombre, '')) = '' THEN
    RAISE EXCEPTION 'nombre_obligatorio';
  END IF;

  INSERT INTO public.empresas (nombre, licencias_max, limite_usuarios_staff, activa)
  VALUES (
    trim(COALESCE(p_nombre, '')),
    v_lim,
    v_lim,
    true
  )
  RETURNING empresas.id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.master_crear_empresa(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_crear_empresa(text, integer) TO authenticated;

-- ── RPC Master: +/- límite staff ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.master_ajustar_limite_staff(
  p_empresa_id integer,
  p_delta integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actual integer;
  v_nuevo integer;
  v_usados integer;
BEGIN
  IF NOT public.es_operador_master_tabora() THEN
    RAISE EXCEPTION 'solo_master_tabora' USING ERRCODE = '42501';
  END IF;

  IF p_empresa_id IS NULL OR p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'parametros_invalidos';
  END IF;

  SELECT e.limite_usuarios_staff INTO v_actual
  FROM public.empresas e WHERE e.id = p_empresa_id FOR UPDATE;

  IF v_actual IS NULL THEN
    RAISE EXCEPTION 'empresa_no_encontrada';
  END IF;

  v_nuevo := v_actual + p_delta;
  IF v_nuevo < 1 THEN
    v_nuevo := 1;
  END IF;

  SELECT count(*)::integer INTO v_usados FROM public.profiles p WHERE p.empresa_id = p_empresa_id;

  IF v_nuevo < v_usados THEN
    RAISE EXCEPTION 'limite_inferior_a_usuarios_activos' USING ERRCODE = '23514';
  END IF;

  UPDATE public.empresas e
  SET limite_usuarios_staff = v_nuevo,
      licencias_max = GREATEST(e.licencias_max, v_nuevo)
  WHERE e.id = p_empresa_id;

  RETURN jsonb_build_object(
    'id', p_empresa_id,
    'limite_usuarios_staff', v_nuevo,
    'usados', v_usados
  );
END;
$$;

REVOKE ALL ON FUNCTION public.master_ajustar_limite_staff(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_ajustar_limite_staff(integer, integer) TO authenticated;

-- ── RPC Master: activa / inactiva ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.master_set_empresa_activa(
  p_empresa_id integer,
  p_activa boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.es_operador_master_tabora() THEN
    RAISE EXCEPTION 'solo_master_tabora' USING ERRCODE = '42501';
  END IF;

  IF p_empresa_id = 1 AND p_activa = false THEN
    RAISE EXCEPTION 'no_desactivar_tabora_raiz';
  END IF;

  UPDATE public.empresas e SET activa = p_activa WHERE e.id = p_empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'empresa_no_encontrada';
  END IF;

  RETURN p_activa;
END;
$$;

REVOKE ALL ON FUNCTION public.master_set_empresa_activa(integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_set_empresa_activa(integer, boolean) TO authenticated;

COMMIT;
