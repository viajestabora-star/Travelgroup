-- Lista global de public.profiles para operador Master Tabora (empresa_id = 1 en JWT/perfil).
-- Permite ver y gestionar usuarios de todas las agencias (p. ej. Gestoría) desde Gestión de equipo.
-- Requiere public.es_operador_master_tabora() definido en admin-master-empresas.sql

CREATE OR REPLACE FUNCTION public.listar_equipo_superadmin()
RETURNS TABLE (
  id uuid,
  email text,
  nombre text,
  nivel_acceso text,
  created_at timestamptz,
  empresa_id integer
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
  SELECT p.id, p.email, p.nombre, p.nivel_acceso, p.created_at, p.empresa_id
  FROM public.profiles p
  ORDER BY p.empresa_id ASC NULLS LAST, p.created_at ASC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_equipo_superadmin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_equipo_superadmin() TO authenticated;
