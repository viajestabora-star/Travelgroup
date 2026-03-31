-- =============================================================================
-- Storage: bucket facturas_proveedores + RLS para la app (clave anon en cliente)
-- Ejecutar en Supabase → SQL Editor. Corrige errores tipo "new row violates
-- row-level security policy" al subir PDFs desde el ERP.
-- =============================================================================

-- Bucket público (lectura por URL pública). Si ya existe, no lo modifica.
INSERT INTO storage.buckets (id, name, public)
VALUES ('facturas_proveedores', 'facturas_proveedores', true)
ON CONFLICT (id) DO NOTHING;

-- Si el bucket ya existía como privado y quieres URL pública (getPublicUrl):
-- UPDATE storage.buckets SET public = true WHERE id = 'facturas_proveedores';

-- Políticas idempotentes en storage.objects
DROP POLICY IF EXISTS "facturas_proveedores_select_public" ON storage.objects;
CREATE POLICY "facturas_proveedores_select_public"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'facturas_proveedores');

DROP POLICY IF EXISTS "facturas_proveedores_insert_anon_auth" ON storage.objects;
CREATE POLICY "facturas_proveedores_insert_anon_auth"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'facturas_proveedores');

DROP POLICY IF EXISTS "facturas_proveedores_update_anon_auth" ON storage.objects;
CREATE POLICY "facturas_proveedores_update_anon_auth"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'facturas_proveedores')
  WITH CHECK (bucket_id = 'facturas_proveedores');

DROP POLICY IF EXISTS "facturas_proveedores_delete_anon_auth" ON storage.objects;
CREATE POLICY "facturas_proveedores_delete_anon_auth"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'facturas_proveedores');
