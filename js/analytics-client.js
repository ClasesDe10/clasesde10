import { addDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { firebaseAuth, firebaseDb } from './firebase-client.js?v=20260627-domain-auth';
import { ANALYTICS_ENGINE_VERSION } from './analytics-engine.js?v=20260628-analytics';

export const ANALYTICS_EVENT_SCHEMA_VERSION = 'analytics_event_v1';

const SESSION_KEY = 'cd10:analytics:session';
const ANON_KEY = 'cd10:analytics:anonymous';
const MAX_EVENT_NAME = 120;
const MAX_METADATA_KEYS = 36;
const MAX_CONTEXT_KEYS = 28;
const SENSITIVE_KEY_RE = /(password|passwd|contrasena|contraseña|token|secret|cookie|authorization|auth|iban|card|tarjeta|cvv|email|mail|telefono|teléfono|phone|direccion|dirección|address|dni|nif|documento)/i;
let installedGlobalListeners = false;

function clean(value, max = 500) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function randomId(prefix) {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${token}`;
}

function storageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (_) {
    return '';
  }
}

function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (_) {}
}

export function analyticsAnonymousId() {
  let id = storageGet(ANON_KEY);
  if (!id) {
    id = randomId('anon');
    storageSet(ANON_KEY, id);
  }
  return id;
}

export function analyticsSessionId() {
  const now = Date.now();
  const raw = storageGet(SESSION_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.id && now - Number(parsed.updatedAt || 0) < 30 * 60 * 1000) {
        storageSet(SESSION_KEY, JSON.stringify({ id: parsed.id, updatedAt: now }));
        return parsed.id;
      }
    } catch (_) {}
  }
  const id = randomId('sess');
  storageSet(SESSION_KEY, JSON.stringify({ id, updatedAt: now }));
  return id;
}

function safeObject(value, maxKeys = MAX_METADATA_KEYS, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 2) return {};
  return Object.entries(value).slice(0, maxKeys).reduce((acc, [key, rawValue]) => {
    const safeKey = clean(key, 80);
    if (!safeKey) return acc;
    if (SENSITIVE_KEY_RE.test(safeKey)) {
      acc[safeKey] = '[redacted]';
      return acc;
    }
    if (rawValue === null || rawValue === undefined) return acc;
    if (typeof rawValue === 'boolean') {
      acc[safeKey] = rawValue;
      return acc;
    }
    if (typeof rawValue === 'number') {
      acc[safeKey] = Number.isFinite(rawValue) ? rawValue : 0;
      return acc;
    }
    if (Array.isArray(rawValue)) {
      acc[safeKey] = rawValue.slice(0, 12).map((item) => clean(item, 160)).filter(Boolean);
      return acc;
    }
    if (typeof rawValue === 'object') {
      acc[safeKey] = safeObject(rawValue, 12, depth + 1);
      return acc;
    }
    acc[safeKey] = clean(rawValue, 260);
    return acc;
  }, {});
}

function pageContext() {
  const viewport = {
    width: Math.round(window.innerWidth || document.documentElement.clientWidth || 0),
    height: Math.round(window.innerHeight || document.documentElement.clientHeight || 0),
  };
  return {
    pagePath: window.location.pathname,
    pageUrl: window.location.href,
    referrer: document.referrer || '',
    userAgent: navigator.userAgent || '',
    language: navigator.language || '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    viewport,
    standalone: window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true,
  };
}

function inferCategory(eventName, payload = {}) {
  if (payload.category) return payload.category;
  if (eventName.startsWith('auth.')) return 'auth';
  if (eventName.startsWith('form.')) return 'forms';
  if (eventName.startsWith('payment.')) return 'payments';
  if (eventName.startsWith('class.')) return 'classes';
  if (eventName.startsWith('request.') || eventName.startsWith('assignment.')) return 'matching';
  if (eventName.startsWith('message.')) return 'messaging';
  if (eventName.startsWith('incident.')) return 'incidents';
  if (eventName.startsWith('ai.')) return 'ai';
  if (eventName.includes('error') || eventName.includes('failed')) return 'error';
  return 'product';
}

function inferEventType(eventName, payload = {}) {
  if (payload.eventType) return payload.eventType;
  return clean(eventName.split('.')[0] || 'interaction', 80);
}

function inferFeature(eventName, payload = {}) {
  if (payload.feature) return payload.feature;
  if (payload.entityType) return payload.entityType;
  return inferCategory(eventName, payload);
}

function currentActor(payload = {}) {
  const user = firebaseAuth.currentUser;
  return {
    actorUid: clean(payload.actorUid || user?.uid || '', 180),
    actorRole: clean(payload.actorRole || globalThis.CD10CurrentUser?.role || globalThis.CD10CurrentUser?.rol || payload.role || 'anonimo', 80),
  };
}

function experimentContext(payload = {}) {
  const active = globalThis.CD10ExperimentAssignments || {};
  const experiments = {
    ...(active && typeof active === 'object' ? active : {}),
    ...(payload.experiments && typeof payload.experiments === 'object' ? payload.experiments : {}),
    ...(payload.metadata?.experiments && typeof payload.metadata.experiments === 'object' ? payload.metadata.experiments : {}),
  };
  const firstKey = clean(payload.experimentKey || payload.metadata?.experimentKey || Object.keys(experiments)[0] || '', 120);
  const firstVariant = clean(payload.variant || payload.metadata?.variant || (firstKey ? experiments[firstKey] : '') || '', 80);
  return {
    experimentId: clean(payload.experimentId || payload.metadata?.experimentId || '', 180),
    experimentKey: firstKey,
    variant: firstVariant,
    experiments,
  };
}

function canonicalEventName(eventName) {
  return clean(eventName, MAX_EVENT_NAME).toLowerCase().replace(/[^a-z0-9_.:-]/g, '_') || 'event.unknown';
}

export async function trackAnalyticsEvent(eventName, payload = {}) {
  try {
    if (!firebaseDb || typeof window === 'undefined') return null;
    const name = canonicalEventName(eventName);
    const now = new Date();
    const ctx = pageContext();
    const actor = currentActor(payload);
    const experiment = experimentContext(payload);
    const event = {
      schemaVersion: ANALYTICS_EVENT_SCHEMA_VERSION,
      analyticsVersion: ANALYTICS_ENGINE_VERSION,
      eventName: name,
      eventType: inferEventType(name, payload),
      category: clean(inferCategory(name, payload), 80),
      feature: clean(inferFeature(name, payload), 120),
      actorUid: actor.actorUid,
      actorRole: actor.actorRole,
      anonymousId: analyticsAnonymousId(),
      sessionId: analyticsSessionId(),
      entityType: clean(payload.entityType || '', 80),
      entityId: clean(payload.entityId || '', 180),
      experimentId: experiment.experimentId,
      experimentKey: experiment.experimentKey,
      variant: experiment.variant,
      pagePath: clean(payload.pagePath || ctx.pagePath, 240),
      pageUrl: clean(payload.pageUrl || ctx.pageUrl, 500),
      referrer: clean(payload.referrer || ctx.referrer, 500),
      userAgent: clean(ctx.userAgent, 500),
      language: clean(ctx.language, 40),
      timezone: clean(ctx.timezone, 80),
      viewport: ctx.viewport,
      source: clean(payload.source || 'web', 80),
      severity: clean(payload.severity || (name.includes('error') || name.includes('failed') ? 'error' : 'info'), 20),
      durationMs: Number.isFinite(Number(payload.durationMs)) ? Math.max(0, Math.round(Number(payload.durationMs))) : 0,
      value: Number.isFinite(Number(payload.value)) ? Number(payload.value) : 0,
      metadata: safeObject({
        ...(payload.metadata || {}),
        experiments: experiment.experiments,
      }, MAX_METADATA_KEYS),
      context: safeObject({
        standalone: ctx.standalone,
        path: ctx.pagePath,
        experiments: experiment.experiments,
        ...payload.context,
      }, MAX_CONTEXT_KEYS),
      day: now.toISOString().slice(0, 10),
      month: now.toISOString().slice(0, 7),
      createdAt: serverTimestamp(),
      created_at: now.toISOString(),
    };
    return await addDoc(collection(firebaseDb, 'analyticsEvents'), event);
  } catch (error) {
    console.warn('Analytics event skipped', eventName, error);
    return null;
  }
}

export function trackPageView(metadata = {}) {
  return trackAnalyticsEvent('page.view', {
    category: 'navigation',
    feature: 'page',
    metadata,
  });
}

export function trackCtaClick(label, metadata = {}) {
  return trackAnalyticsEvent('cta.click', {
    category: 'conversion',
    feature: metadata.feature || 'cta',
    metadata: {
      label,
      ...metadata,
    },
  });
}

export function trackFormEvent(eventName, formName, metadata = {}) {
  return trackAnalyticsEvent(eventName, {
    category: eventName.includes('error') ? 'error' : 'forms',
    feature: formName || 'form',
    entityType: 'form',
    entityId: formName || '',
    metadata,
  });
}

export function trackAuthEvent(eventName, metadata = {}) {
  return trackAnalyticsEvent(eventName, {
    category: eventName.includes('failed') ? 'error' : 'auth',
    feature: 'auth',
    metadata,
  });
}

function statusFrom(record = {}) {
  return clean(record.status || record.estado || record.lifecycleStatus || '', 80).toLowerCase();
}

function eventForMutation(table, mode, record = {}) {
  const target = clean(table, 80);
  const status = statusFrom(record.after || record);
  if (mode === 'insert') {
    if (target === 'solicitudes') return 'request.created';
    if (target === 'asignaciones') return 'assignment.created';
    if (target === 'clases') return 'class.created';
    if (target === 'pagos') return 'payment.created';
    if (['mensajes', 'chats'].includes(target)) return 'message.sent';
    if (target === 'incidencias') return 'incident.created';
    if (target === 'documentos') return 'document.uploaded';
  }
  if (mode === 'update') {
    if (target === 'solicitudes' && ['aceptada', 'accepted', 'asignada'].includes(status)) return 'request.accepted';
    if (target === 'clases' && ['cancelada', 'cancelled', 'canceled'].includes(status)) return 'class.cancelled';
    if (target === 'clases') return 'class.updated';
    if (target === 'pagos' && ['pagado', 'validado', 'paid', 'validated', 'succeeded'].includes(status)) return 'payment.verified';
    if (['users', 'usuarios', 'profesores', 'familias', 'alumnos', 'disponibilidad'].includes(target)) return 'profile.updated';
  }
  return `${target}.${mode || 'changed'}`;
}

export async function trackDataMutation(table, mode, records = [], context = {}) {
  const items = Array.isArray(records) ? records : [records];
  await Promise.all(items.filter(Boolean).slice(0, 10).map((record) => trackAnalyticsEvent(eventForMutation(table, mode, record), {
    category: inferCategory(eventForMutation(table, mode, record), { entityType: table }),
    feature: table,
    entityType: table,
    entityId: record.id || record.after?.id || record.before?.id || '',
    metadata: {
      mode,
      table,
      count: items.length,
      status: statusFrom(record.after || record),
      source: 'firebase_data_client',
      ...context,
    },
  })));
}

export function installGlobalAnalyticsListeners() {
  if (installedGlobalListeners || typeof window === 'undefined') return;
  installedGlobalListeners = true;
  trackPageView();
  window.addEventListener('error', (event) => {
    trackAnalyticsEvent('error.captured', {
      category: 'error',
      feature: 'runtime',
      severity: 'error',
      metadata: {
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
      },
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    trackAnalyticsEvent('error.captured', {
      category: 'error',
      feature: 'promise',
      severity: 'error',
      metadata: {
        message: event.reason?.message || event.reason || 'Unhandled promise rejection',
      },
    });
  });
}

export default {
  trackAnalyticsEvent,
  trackPageView,
  trackCtaClick,
  trackFormEvent,
  trackAuthEvent,
  trackDataMutation,
  installGlobalAnalyticsListeners,
  analyticsAnonymousId,
  analyticsSessionId,
};
