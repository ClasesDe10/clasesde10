/**
 * ClasesDe10 - Public lead forms.
 * Persists public contact/family/teacher forms in Supabase.
 */

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';

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

function clean(value, max = 3000) {
  return String(value || '').trim().slice(0, max);
}

function validateLead(lead) {
  if (!['contacto', 'familia', 'profesor'].includes(clean(lead.tipo))) return 'Tipo de formulario no valido.';
  if (!clean(lead.nombre)) return 'Introduce tu nombre.';
  if (clean(lead.nombre).length < 2) return 'Introduce un nombre valido.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(lead.email))) return 'Introduce un email valido.';
  if (clean(lead.email).length > 254) return 'El email es demasiado largo.';
  if (!clean(lead.mensaje) && !clean(lead.asunto)) return 'Completa la informacion principal.';
  return null;
}

export async function submitLead(lead) {
  const payload = {
    tipo: clean(lead.tipo, 30),
    nombre: clean(lead.nombre, 160),
    email: clean(lead.email, 254).toLowerCase(),
    telefono: clean(lead.telefono, 40) || null,
    perfil: clean(lead.perfil, 80) || null,
    asunto: clean(lead.asunto, 180) || null,
    mensaje: clean(lead.mensaje, 3000) || null,
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

function getStatusElement(button) {
  const form = button?.closest('form');
  if (!form) return null;

  let status = form.querySelector('[data-form-status]');
  if (!status) {
    status = document.createElement('p');
    status.className = 'cf-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.dataset.formStatus = '';
    button.insertAdjacentElement('beforebegin', status);
  }
  return status;
}

export function setButtonState(button, state, text) {
  if (!button) return;
  const status = getStatusElement(button);

  button.textContent = text;
  button.disabled = state === 'loading';
  button.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
  button.dataset.state = state;
  button.style.background = state === 'error'
    ? '#c0392b'
    : state === 'success'
      ? 'var(--teal, #1d7a6b)'
      : '';

  if (status) {
    if (state === 'success' || state === 'error') {
      status.textContent = text;
      status.dataset.state = state;
    } else {
      status.textContent = '';
      status.dataset.state = 'idle';
    }
  }
}
