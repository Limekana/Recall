import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim();

export const syncConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = syncConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        storageKey: 'recall-auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;
