-- Configuración fiscal y marca del tenant (empresas). No confundir con clientes del ERP.
-- IVA por defecto para presupuestos / referencia interna del agencia.

ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS config_iva_repercutido NUMERIC(5, 2) DEFAULT 21;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS config_iva_soportado NUMERIC(5, 2) DEFAULT 21;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS logo_url TEXT;

UPDATE public.empresas
SET
  config_iva_repercutido = COALESCE(config_iva_repercutido, 21),
  config_iva_soportado = COALESCE(config_iva_soportado, 21)
WHERE config_iva_repercutido IS NULL OR config_iva_soportado IS NULL;

-- Snapshot al crear expediente (opcional en UI; viene de la empresa del tenant, no del cliente)
ALTER TABLE public.expedientes ADD COLUMN IF NOT EXISTS config_iva_repercutido NUMERIC(5, 2);
ALTER TABLE public.expedientes ADD COLUMN IF NOT EXISTS config_iva_soportado NUMERIC(5, 2);
