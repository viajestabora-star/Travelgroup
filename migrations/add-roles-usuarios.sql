-- Migración: Tabla roles_usuarios para control de visibilidad (beneficio neto, etc.)
-- email: correo del usuario
-- rol: ADMIN | STAFF | etc.
-- ============================================================================

CREATE TABLE IF NOT EXISTS roles_usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  rol TEXT NOT NULL DEFAULT 'STAFF',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para búsqueda rápida por email y rol
CREATE INDEX IF NOT EXISTS idx_roles_usuarios_email_rol ON roles_usuarios(email, rol);

-- Ejemplo de inserción (ajustar según necesidad):
-- INSERT INTO roles_usuarios (email, rol) VALUES 
--   ('andres@viajestabora.com', 'ADMIN'),
--   ('info@viajestabora.com', 'ADMIN'),
--   ('grupos@viajestabora.com', 'STAFF')
-- ON CONFLICT (email) DO UPDATE SET rol = EXCLUDED.rol;
