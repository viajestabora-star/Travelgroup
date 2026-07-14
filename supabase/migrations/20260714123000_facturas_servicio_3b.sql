-- Microhito 3B: tabla relacional facturas_servicio (uno-a-muchos servicio → facturas)
-- Solo DDL. Backfill/auditoría en sql/manual/facturas_servicio_3b/ (ejecución manual).

CREATE TABLE public.facturas_servicio (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        integer NOT NULL REFERENCES public.empresas(id),
  expediente_id     uuid NOT NULL REFERENCES public.expedientes(id),
  servicio_id       uuid NOT NULL REFERENCES public.servicios_cotizacion(id),
  bucket            text NOT NULL DEFAULT 'facturas',
  storage_path      text NOT NULL,
  nombre_archivo    text,
  numero_factura    text,
  concepto          text,
  fecha_factura     date,
  importe_factura   numeric(12,2),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_facturas_servicio_servicio_id   ON public.facturas_servicio (servicio_id);
CREATE INDEX idx_facturas_servicio_expediente_id ON public.facturas_servicio (expediente_id);
CREATE UNIQUE INDEX uq_facturas_servicio_servicio_path
  ON public.facturas_servicio (servicio_id, bucket, storage_path);

ALTER TABLE public.facturas_servicio ENABLE ROW LEVEL SECURITY;

CREATE POLICY facturas_servicio_select ON public.facturas_servicio
  FOR SELECT TO authenticated
  USING (empresa_id = (SELECT p.empresa_id FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY facturas_servicio_insert ON public.facturas_servicio
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id = (SELECT p.empresa_id FROM public.profiles p WHERE p.id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.id = facturas_servicio.expediente_id
        AND e.empresa_id = facturas_servicio.empresa_id
    )
    AND EXISTS (
      SELECT 1 FROM public.servicios_cotizacion sc
      WHERE sc.id = facturas_servicio.servicio_id
        AND sc.empresa_id = facturas_servicio.empresa_id
        AND sc.id_expediente = facturas_servicio.expediente_id
    )
  );

CREATE POLICY facturas_servicio_update ON public.facturas_servicio
  FOR UPDATE TO authenticated
  USING (
    empresa_id = (SELECT p.empresa_id FROM public.profiles p WHERE p.id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.id = facturas_servicio.expediente_id AND e.empresa_id = facturas_servicio.empresa_id
    )
    AND EXISTS (
      SELECT 1 FROM public.servicios_cotizacion sc
      WHERE sc.id = facturas_servicio.servicio_id
        AND sc.empresa_id = facturas_servicio.empresa_id
        AND sc.id_expediente = facturas_servicio.expediente_id
    )
  )
  WITH CHECK (
    empresa_id = (SELECT p.empresa_id FROM public.profiles p WHERE p.id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.id = facturas_servicio.expediente_id AND e.empresa_id = facturas_servicio.empresa_id
    )
    AND EXISTS (
      SELECT 1 FROM public.servicios_cotizacion sc
      WHERE sc.id = facturas_servicio.servicio_id
        AND sc.empresa_id = facturas_servicio.empresa_id
        AND sc.id_expediente = facturas_servicio.expediente_id
    )
  );

CREATE POLICY facturas_servicio_delete ON public.facturas_servicio
  FOR DELETE TO authenticated
  USING (empresa_id = (SELECT p.empresa_id FROM public.profiles p WHERE p.id = auth.uid()));
