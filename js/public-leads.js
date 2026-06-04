/**
 * ClasesDe10 - Public lead forms.
 * Persists public contact/family/teacher forms in Supabase.
 */

const SUPABASE_URL = 'https://hxxajibgmtvcbeqguaqr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4eGFqaWJnbXR2Y2JlcWd1YXFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMTUzMzUsImV4cCI6MjA5NTc5MTMzNX0.48TwvcT-pwGNuHc3uFrg1NH_ysu-kACcIPJpN31vL-w';

let dbPromise;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      if (window.supabase) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('No se pudo cargar Supabase.'));
    document.head.appendChild(script);
  });
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      if (!window.supabase) {
        await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js');
      }
      return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          autoRefreshToken: true,
          persistSession: false,
          detectSessionInUrl: false,
        },
      });
    })();
  }
  return dbPromise;
}

function clean(value) {
  return String(value || '').trim();
}

function validateLead(lead) {
  if (!clean(lead.nombre)) return 'Introduce tu nombre.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(lead.email))) return 'Introduce un email valido.';
  if (!clean(lead.mensaje) && !clean(lead.asunto)) return 'Completa la informacion principal.';
  return null;
}

export async function submitLead(lead) {
  const payload = {
    tipo: clean(lead.tipo),
    nombre: clean(lead.nombre),
    email: clean(lead.email).toLowerCase(),
    telefono: clean(lead.telefono) || null,
    perfil: clean(lead.perfil) || null,
    asunto: clean(lead.asunto) || null,
    mensaje: clean(lead.mensaje) || null,
    metadata: {
      ...(lead.metadata || {}),
      user_agent: navigator.userAgent,
    },
    estado: 'nuevo',
  };

  const validationError = validateLead(payload);
  if (validationError) return { error: { message: validationError } };

  const db = await getDb();
  const { error } = await db
    .from('leads_publicos')
    .insert(payload);

  return { data: error ? null : { ok: true }, error };
}

export function setButtonState(button, state, text) {
  if (!button) return;
  button.textContent = text;
  button.disabled = state === 'loading' || state === 'success';
  button.style.background = state === 'error'
    ? '#c0392b'
    : state === 'success'
      ? 'var(--teal, #1d7a6b)'
      : '';
}
