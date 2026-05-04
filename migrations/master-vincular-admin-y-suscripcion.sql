-- =============================================================================
-- Panel Master: vincular admin en roles_usuarios + suscripción por fecha.
-- Ejecutar después de admin-master-empresas.sql y add-roles-usuarios.sql
-- =============================================================================

BEGIN;

-- Fecha de fin de suscripción (NULL = sin caducidad)
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS fecha_expiracion date;

UPDATE public.empresas SET fecha_expiracion = NULL WHERE id = 1;

-- roles_usuarios: empresa asignada al rol por email
ALTER TABLE public.roles_usuarios ADD COLUMN IF NOT EXISTS empresa_id integer REFERENCES public.empresas(id);

CREATE INDEX IF NOT EXISTS idx_roles_usuarios_empresa_id ON public.roles_usuarios(empresa_id);

-- Suscripción vigente (por empresa del perfil)
CREATE OR REPLACE FUNCTION public.mi_empresa_suscripcion_vigente()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN true;
  END IF;
  SELECT
    CASE
      WHEN e.fecha_expiracion IS NULL THEN true
      WHEN e.fecha_expiracion >= CURRENT_DATE THEN true
      ELSE false
    END
  INTO v_ok
  FROM public.profiles p
  JOIN public.empresas e ON e.id = p.empresa_id
  WHERE p.id = auth.uid();
  RETURN COALESCE(v_ok, true);
END;
$$;

REVOKE ALL ON FUNCTION public.mi_empresa_suscripcion_vigente() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mi_empresa_suscripcion_vigente() TO authenticated;

-- Master: vincular email como ADMIN de una agencia (id >= 2)
CREATE OR REPLACE FUNCTION public.master_vincular_admin_empresa(
  p_email text,
  p_empresa_id integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(COALESCE(p_email, '')));
BEGIN
  IF NOT public.es_operador_master_tabora() THEN
    RAISE EXCEPTION 'solo_master_tabora' USING ERRCODE = '42501';
  END IF;

  IF v_email = '' OR position('@' IN v_email) = 0 THEN
    RAISE EXCEPTION 'email_invalido';
  END IF;

  IF p_empresa_id IS NULL OR p_empresa_id < 2 THEN
    RAISE EXCEPTION 'empresa_id_invalido_use_agencia_cliente';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = p_empresa_id) THEN
    RAISE EXCEPTION 'empresa_no_existe';
  END IF;

  INSERT INTO public.roles_usuarios (email, rol, empresa_id)
  VALUES (v_email, 'ADMIN', p_empresa_id)
  ON CONFLICT (email) DO UPDATE
  SET rol = 'ADMIN',
      empresa_id = EXCLUDED.empresa_id;
END;
$$;

REVOKE ALL ON FUNCTION public.master_vincular_admin_empresa(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_vincular_admin_empresa(text, integer) TO authenticated;

-- Listado master incluye fecha de suscripción
CREATE OR REPLACE FUNCTION public.master_listar_empresas()
RETURNS TABLE (
  id integer,
  nombre text,
  limite_usuarios_staff integer,
  limite_licencias integer,
  activa boolean,
  fecha_expiracion date,
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
  SELECT e.id, e.nombre, e.limite_usuarios_staff, e.limite_licencias, e.activa, e.fecha_expiracion, e.created_at
  FROM public.empresas e
  ORDER BY e.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.master_listar_empresas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.master_listar_empresas() TO authenticated;

COMMIT;
