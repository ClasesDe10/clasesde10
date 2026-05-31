/**
 * ClasesDe10 — Supabase Client
 * Punto único de inicialización. Importar este módulo en todas las páginas.
 */

const SUPABASE_URL = 'https://TU_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'TU_ANON_KEY';

const { createClient } = window.supabase;
export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

export default db;
