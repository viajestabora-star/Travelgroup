-- ============================================================================
-- SCRIPT SQL: Configuración RLS para tabla proveedores
-- ============================================================================
-- Este script activa Row Level Security (RLS) y crea políticas de acceso
-- para la tabla proveedores en Supabase.
--
-- INSTRUCCIONES:
-- 1. Abre el SQL Editor en Supabase Dashboard
-- 2. Ejecuta este script completo
-- 3. Verifica que las políticas se hayan creado correctamente
-- ============================================================================

-- 1. Habilitar Row Level Security (RLS) en la tabla proveedores
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;

-- 2. Política para SELECT (lectura) - Permite a todos leer proveedores
-- Esto es necesario para que la cotización pueda cargar y filtrar proveedores
CREATE POLICY "Allow all SELECT on proveedores"
ON proveedores
FOR SELECT
USING (true);

-- 3. Política para INSERT (creación) - Permite a todos crear proveedores
-- Esto permite crear proveedores desde el formulario y desde la cotización
CREATE POLICY "Allow all INSERT on proveedores"
ON proveedores
FOR INSERT
WITH CHECK (true);

-- 4. Política para UPDATE (actualización) - Permite a todos actualizar proveedores
CREATE POLICY "Allow all UPDATE on proveedores"
ON proveedores
FOR UPDATE
USING (true)
WITH CHECK (true);

-- 5. Política para DELETE (eliminación) - Permite a todos eliminar proveedores
CREATE POLICY "Allow all DELETE on proveedores"
ON proveedores
FOR DELETE
USING (true);

-- ============================================================================
-- VERIFICACIÓN (opcional - ejecutar después para verificar)
-- ============================================================================
-- SELECT * FROM pg_policies WHERE tablename = 'proveedores';
-- ============================================================================
