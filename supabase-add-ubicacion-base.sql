-- ============================================================================
-- Añadir columna ubicacion a tabla proveedores
-- ============================================================================
-- Ejecutar en Supabase SQL Editor para guardar Ubicación/Base
-- (ej. de dónde es la guía local). Si la columna ya existe, omitir.
-- ============================================================================

ALTER TABLE proveedores 
ADD COLUMN IF NOT EXISTS ubicacion TEXT DEFAULT '';
