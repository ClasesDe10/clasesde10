/**
 * ClasesDe10 - Public lead forms.
 * Persists public contact/family/teacher forms in Firebase Firestore.
 */

import { addDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { firebaseDb } from './firebase-client.js';
import { trackFormEvent } from './analytics-client.js?v=20260628-analytics';

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

function isLikelySpam(lead) {
  return Boolean(clean(lead.website_url || lead.websiteUrl, 500));
}

function cleanMetadata(metadata = {}) {
  const allowedKeys = [
    'alumno',
    'account_mode',
    'anios',
    'canal',
    'consent_privacy',
    'disponibilidad',
    'frecuencia',
    'inicio',
    'materia',
    'materias',
    'modalidad',
    'nivel',
    'niveles',
    'objetivo',
    'origen',
    'page_path',
    'page_url',
    'presupuesto',
    'referrer',
    'user_agent',
    'utm_campaign',
    'utm_content',
    'utm_medium',
    'utm_source',
    'utm_term',
    'verificacion',
    'zona',
  ];

  return allowedKeys.reduce((acc, key) => {
    if (!Object.prototype.hasOwnProperty.call(metadata, key)) return acc;
    if (typeof metadata[key] === 'boolean') {
      acc[key] = metadata[key];
      return acc;
    }
    const value = clean(metadata[key], key === 'user_agent' || key === 'page_url' || key === 'referrer' ? 500 : 300);
    if (value) acc[key] = value;
    return acc;
  }, {});
}

function getUtmMetadata() {
  const params = new URLSearchParams(window.location.search);
  return ['source', 'medium', 'campaign', 'term', 'content'].reduce((acc, key) => {
    const value = clean(params.get(`utm_${key}`), 160);
    if (value) acc[`utm_${key}`] = value;
    return acc;
  }, {});
}

export async function submitLead(lead) {
  if (isLikelySpam(lead)) {
    trackFormEvent('form.error', 'lead_publico', {
      reason: 'spam_honeypot',
      tipo: clean(lead.tipo, 30),
      source: 'public_leads',
    });
    return { data: { id: null, ok: true, spam: true }, error: null };
  }

  const payload = {
    tipo: clean(lead.tipo, 30),
    nombre: clean(lead.nombre, 160),
    email: clean(lead.email, 254).toLowerCase(),
    telefono: clean(lead.telefono, 40) || null,
    perfil: clean(lead.perfil, 80) || null,
    asunto: clean(lead.asunto, 180) || null,
    mensaje: clean(lead.mensaje, 3000) || null,
    metadata: cleanMetadata({
      ...(lead.metadata || {}),
      ...getUtmMetadata(),
      page_path: window.location.pathname,
      page_url: window.location.href,
      referrer: document.referrer,
      user_agent: navigator.userAgent,
    }),
    estado: 'nuevo',
    ...(clean(lead.accountStatus, 40) === 'pending_activation'
      ? {
          accountStatus: 'pending_activation',
          activationRequestedAt: serverTimestamp(),
        }
      : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const validationError = validateLead(payload);
  if (validationError) {
    trackFormEvent('form.error', `lead_${payload.tipo || 'publico'}`, {
      reason: validationError,
      tipo: payload.tipo,
      perfil: payload.perfil,
      materia: payload.metadata.materia || payload.metadata.materias || '',
      zona: payload.metadata.zona || '',
      modalidad: payload.metadata.modalidad || '',
      source: 'public_leads',
    });
    return { error: { message: validationError } };
  }

  try {
    const docRef = await addDoc(collection(firebaseDb, 'leadsPublicos'), payload);
    trackFormEvent('form.submitted', `lead_${payload.tipo}`, {
      tipo: payload.tipo,
      perfil: payload.perfil,
      materia: payload.metadata.materia || payload.metadata.materias || '',
      zona: payload.metadata.zona || '',
      modalidad: payload.metadata.modalidad || '',
      utm_source: payload.metadata.utm_source || '',
      utm_campaign: payload.metadata.utm_campaign || '',
      leadId: docRef.id,
      source: 'public_leads',
    });
    return { data: { id: docRef.id, ok: true }, error: null };
  } catch (error) {
    trackFormEvent('form.error', `lead_${payload.tipo}`, {
      reason: error?.message || 'firestore_write_failed',
      tipo: payload.tipo,
      source: 'public_leads',
    });
    return {
      data: null,
      error: { message: error?.message || 'No se pudo guardar el formulario.' },
    };
  }
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
