/**
 * ClasesDe10 — Supabase Client
 * Punto único de inicialización. Importar este módulo en todas las páginas.
 */

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';

const { createClient } = window.supabase;
export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken:    true,
    persistSession:      true,
    detectSessionInUrl:  true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

export default db;
