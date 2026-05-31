/**
 * ClasesDe10 — Supabase Client
 * Punto único de inicialización. Importar este módulo en todas las páginas.
 */

const SUPABASE_URL     = 'https://hxxajibgmtvcbeqguaqr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4eGFqaWJnbXR2Y2JlcWd1YXFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMTUzMzUsImV4cCI6MjA5NTc5MTMzNX0.48TwvcT-pwGNuHc3uFrg1NH_ysu-kACcIPJpN31vL-w';

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
