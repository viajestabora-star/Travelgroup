-- ============================================================================
-- Migración: Disponibilidad para visitas en CRM (prospectos y clientes)
-- ============================================================================
-- Añade columnas para gestionar horarios de visita preferidos.
-- dias_visita: TEXT con días separados por coma (ej. "L,M,X,J,V")
-- horario_visita_inicio / horario_visita_fin: TIME o TEXT en formato "HH:MM"
-- Ejecutar en Supabase SQL Editor.
-- ============================================================================

-- Prospectos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prospectos' AND column_name = 'dias_visita') THEN
    ALTER TABLE prospectos ADD COLUMN dias_visita TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prospectos' AND column_name = 'horario_visita_inicio') THEN
    ALTER TABLE prospectos ADD COLUMN horario_visita_inicio TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prospectos' AND column_name = 'horario_visita_fin') THEN
    ALTER TABLE prospectos ADD COLUMN horario_visita_fin TEXT;
  END IF;
END $$;

-- Clientes (para consistencia si la tabla existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clientes') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clientes' AND column_name = 'dias_visita') THEN
      ALTER TABLE clientes ADD COLUMN dias_visita TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clientes' AND column_name = 'horario_visita_inicio') THEN
      ALTER TABLE clientes ADD COLUMN horario_visita_inicio TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clientes' AND column_name = 'horario_visita_fin') THEN
      ALTER TABLE clientes ADD COLUMN horario_visita_fin TEXT;
    END IF;
  END IF;
END $$;
