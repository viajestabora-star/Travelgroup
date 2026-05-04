-- Columna contractual: empresas.limite_licencias (Blueprint Tabora).
-- Idempotente en bases que ya crearon la columna en migraciones base.

ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS limite_licencias integer;

UPDATE public.empresas
SET limite_licencias = COALESCE(limite_licencias, 25)
WHERE limite_licencias IS NULL;

UPDATE public.empresas
SET limite_licencias = GREATEST(limite_licencias, 1)
WHERE limite_licencias IS NOT NULL AND limite_licencias < 1;

ALTER TABLE public.empresas
  ALTER COLUMN limite_licencias SET DEFAULT 25;

ALTER TABLE public.empresas
  ALTER COLUMN limite_licencias SET NOT NULL;

-- Cupo efectivo: contractual primero, límite operativo staff
CREATE OR REPLACE FUNCTION public.empresa_limite_efectivo(p_empresa_id integer)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(e.limite_licencias, e.limite_usuarios_staff, 1)::integer
  FROM public.empresas e
  WHERE e.id = p_empresa_id;
$$;
