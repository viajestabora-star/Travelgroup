import { createClient } from '@supabase/supabase-js'

// Variables de producción: VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Vercel
// Fallback para desarrollo local sin .env
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://gtwyqxfkpdwpakmgrkbu.supabase.co'
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
