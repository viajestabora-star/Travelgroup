import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://gtwyqxfkpdwpakmgrkbu.supabase.co'
const SUPABASE_KEY = 'sb_publishable_xa3e-Jr_PtAhBSEU5BPnHg_tEPfQg-e'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
