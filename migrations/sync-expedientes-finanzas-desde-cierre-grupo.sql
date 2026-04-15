-- Sincroniza columnas planas de expedientes con el JSON de cierre verificado.
-- Prioridad: cierre_grupo.totales → claves legacy en la raíz de cierre_grupo.

CREATE OR REPLACE FUNCTION public.expedientes_sync_finanzas_desde_cierre_grupo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  t jsonb;
BEGIN
  IF NEW.cierre_grupo IS NULL OR jsonb_typeof(NEW.cierre_grupo) <> 'object' THEN
    RETURN NEW;
  END IF;

  t := NEW.cierre_grupo->'totales';

  IF t IS NOT NULL AND jsonb_typeof(t) = 'object' THEN
    IF t ? 'gastos_totales' AND length(trim(t->>'gastos_totales')) > 0 THEN
      NEW.total_gastos_reales := trim(t->>'gastos_totales')::numeric;
    END IF;
    IF t ? 'beneficio_limpio' AND length(trim(t->>'beneficio_limpio')) > 0 THEN
      NEW.beneficio_neto_real := trim(t->>'beneficio_limpio')::numeric;
    ELSIF t ? 'beneficio_neto' AND length(trim(t->>'beneficio_neto')) > 0 THEN
      NEW.beneficio_neto_real := trim(t->>'beneficio_neto')::numeric;
    ELSIF t ? 'beneficio' AND length(trim(t->>'beneficio')) > 0 THEN
      NEW.beneficio_neto_real := trim(t->>'beneficio')::numeric;
    END IF;
    IF t ? 'ingresos_totales' AND length(trim(t->>'ingresos_totales')) > 0 THEN
      NEW.total_ingresos := trim(t->>'ingresos_totales')::numeric;
    ELSIF t ? 'total_ingresos' AND length(trim(t->>'total_ingresos')) > 0 THEN
      NEW.total_ingresos := trim(t->>'total_ingresos')::numeric;
    END IF;
    IF t ? 'iva_pagado' AND length(trim(t->>'iva_pagado')) > 0 THEN
      NEW.cuota_iva := trim(t->>'iva_pagado')::numeric;
    END IF;
  ELSE
    IF NEW.cierre_grupo ? 'gastos_totales' AND length(trim(NEW.cierre_grupo->>'gastos_totales')) > 0 THEN
      NEW.total_gastos_reales := trim(NEW.cierre_grupo->>'gastos_totales')::numeric;
    ELSIF NEW.cierre_grupo ? 'gastos_reales' AND length(trim(NEW.cierre_grupo->>'gastos_reales')) > 0 THEN
      NEW.total_gastos_reales := trim(NEW.cierre_grupo->>'gastos_reales')::numeric;
    END IF;
    IF NEW.cierre_grupo ? 'beneficio_limpio' AND length(trim(NEW.cierre_grupo->>'beneficio_limpio')) > 0 THEN
      NEW.beneficio_neto_real := trim(NEW.cierre_grupo->>'beneficio_limpio')::numeric;
    ELSIF NEW.cierre_grupo ? 'beneficio_neto' AND length(trim(NEW.cierre_grupo->>'beneficio_neto')) > 0 THEN
      NEW.beneficio_neto_real := trim(NEW.cierre_grupo->>'beneficio_neto')::numeric;
    ELSIF NEW.cierre_grupo ? 'beneficio' AND length(trim(NEW.cierre_grupo->>'beneficio')) > 0 THEN
      NEW.beneficio_neto_real := trim(NEW.cierre_grupo->>'beneficio')::numeric;
    END IF;
    IF NEW.cierre_grupo ? 'ingresos_totales' AND length(trim(NEW.cierre_grupo->>'ingresos_totales')) > 0 THEN
      NEW.total_ingresos := trim(NEW.cierre_grupo->>'ingresos_totales')::numeric;
    ELSIF NEW.cierre_grupo ? 'total_ingresos' AND length(trim(NEW.cierre_grupo->>'total_ingresos')) > 0 THEN
      NEW.total_ingresos := trim(NEW.cierre_grupo->>'total_ingresos')::numeric;
    END IF;
    IF NEW.cierre_grupo ? 'iva_pagado' AND length(trim(NEW.cierre_grupo->>'iva_pagado')) > 0 THEN
      NEW.cuota_iva := trim(NEW.cierre_grupo->>'iva_pagado')::numeric;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expedientes_sync_finanzas_cierre_grupo ON public.expedientes;
CREATE TRIGGER trg_expedientes_sync_finanzas_cierre_grupo
  BEFORE INSERT OR UPDATE OF cierre_grupo ON public.expedientes
  FOR EACH ROW
  EXECUTE PROCEDURE public.expedientes_sync_finanzas_desde_cierre_grupo();
