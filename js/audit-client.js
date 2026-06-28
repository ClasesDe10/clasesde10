/**
 * ClasesDe10 - Audit client.
 *
 * Centralized browser-side audit writer. It records important user and admin
 * actions without blocking the product flow when Firestore rejects a write.
 */

import {
  addDoc,
  collection,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { firebaseAuth, firebaseDb } from './firebase-client.js?v=20260627-domain-auth';

export const AUDIT_SCHEMA_VERSION = 'audit_log_v1';

const SENSITIVE_KEY_PATTERN = /(password|contrasena|contraseña|token|secret|authorization|credential|api[_-]?key|iban|card|tarjeta|cvv|pin|cookie|session)/i;
const MAX_STRING = 1200;
const MAX_ARRAY_ITEMS = 30;
const MAX_OBJECT_KEYS = 80;
const MAX_CHANGES = 80;

function clean(value, max = MAX_STRING) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeKey(key) {
  return clean(key, 120);
}

function sessionId() {
  try {
    const key = 'cd10_audit_session_id';
    let value = window.sessionStorage?.getItem(key);
    if (!value) {
      value = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage?.setItem(key, value);
    }
    return value;
  } catch (_) {
    return '';
  }
}

function stablePreview(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  try {
    return JSON.stringify(value).slice(0, MAX_STRING);
  } catch (_) {
    return '[unserializable]';
  }
}

function sanitizeValue(value, key = '', depth = 0) {
  if (SENSITIVE_KEY_PATTERN.test(key)) return '[redacted]';
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return clean(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (key && /(createdAt|updatedAt|deletedAt|validatedAt|paidAt|runAt|dueAt)$/i.test(key) && typeof value === 'object') {
    return stablePreview(value) || '[timestamp]';
  }
  if (Array.isArray(value)) {
    if (depth >= 3) return `[array:${value.length}]`;
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, key, depth + 1));
  }
  if (typeof value === 'object') {
    if (depth >= 3) return '[object]';
    const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS);
    return Object.fromEntries(entries.map(([childKey, childValue]) => [
      normalizeKey(childKey),
      sanitizeValue(childValue, childKey, depth + 1),
    ]));
  }
  return clean(value);
}

export function sanitizeAuditPayload(value) {
  return sanitizeValue(value);
}

export function diffAuditObjects(before = {}, after = {}) {
  const safeBefore = sanitizeAuditPayload(before) || {};
  const safeAfter = sanitizeAuditPayload(after) || {};
  const keys = [...new Set([...Object.keys(safeBefore), ...Object.keys(safeAfter)])];
  return keys
    .filter((key) => JSON.stringify(safeBefore[key] ?? null) !== JSON.stringify(safeAfter[key] ?? null))
    .slice(0, MAX_CHANGES)
    .map((field) => ({
      field,
      before: safeBefore[field] ?? null,
      after: safeAfter[field] ?? null,
    }));
}

function moduleFromEntity(entityType = '', action = '') {
  const source = `${entityType}.${action}`.toLowerCase();
  if (/auth|login|logout|register|password/.test(source)) return 'auth';
  if (/profesor|familia|alumno|perfil|disponibilidad/.test(source)) return 'profiles';
  if (/clase|calendar|calendario/.test(source)) return 'classes';
  if (/pago|payment|bizum|precio|price|stripe/.test(source)) return 'payments';
  if (/document/.test(source)) return 'documents';
  if (/incidencia|incident/.test(source)) return 'incidents';
  if (/chat|mensaje|message/.test(source)) return 'messaging';
  if (/notificacion|notification/.test(source)) return 'notifications';
  if (/ai|ia|matching|automation|system/.test(source)) return 'automation';
  return 'admin';
}

function currentActor(overrides = {}) {
  const user = firebaseAuth.currentUser;
  return {
    actorUid: clean(overrides.actorUid || user?.uid || ''),
    actorEmail: clean(overrides.actorEmail || user?.email || ''),
    actorRole: clean(overrides.actorRole || overrides.role || ''),
    actorType: clean(overrides.actorType || (overrides.actorRole ? 'user' : 'client'), 80),
  };
}

function browserContext(extra = {}) {
  return sanitizeAuditPayload({
    url: window.location.href,
    path: window.location.pathname,
    referrer: document.referrer || '',
    userAgent: navigator.userAgent,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    sessionId: sessionId(),
    ...extra,
  });
}

export async function recordAuditLog({
  action,
  module,
  entityType = '',
  entityId = '',
  description = '',
  severity = 'info',
  origin = 'client',
  source = '',
  actor = {},
  responsibleUid = '',
  responsibleEmail = '',
  before = null,
  after = null,
  changes = null,
  metadata = {},
  context = {},
  error = null,
} = {}) {
  const finalAction = clean(action, 140);
  if (!finalAction) return { ok: false, skipped: 'missing_action' };

  const actorInfo = currentActor(actor);
  if (!actorInfo.actorUid) return { ok: false, skipped: 'unauthenticated' };

  const finalEntityType = clean(entityType || module || 'platform', 80);
  const finalModule = clean(module || moduleFromEntity(finalEntityType, finalAction), 80);
  const safeBefore = before ? sanitizeAuditPayload(before) : null;
  const safeAfter = after ? sanitizeAuditPayload(after) : null;
  const finalChanges = Array.isArray(changes)
    ? sanitizeAuditPayload(changes).slice(0, MAX_CHANGES)
    : (safeBefore || safeAfter ? diffAuditObjects(safeBefore || {}, safeAfter || {}) : []);

  const payload = {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    action: finalAction,
    module: finalModule,
    entityType: finalEntityType,
    entityId: clean(entityId, 180) || 'unknown',
    actorUid: actorInfo.actorUid,
    actorEmail: actorInfo.actorEmail,
    actorRole: actorInfo.actorRole,
    actorType: actorInfo.actorType,
    responsibleUid: clean(responsibleUid || actorInfo.actorUid, 180),
    responsibleEmail: clean(responsibleEmail || actorInfo.actorEmail, 254),
    origin: clean(origin, 80),
    source: clean(source || window.location.pathname, 180),
    severity: clean(severity, 40),
    description: clean(description || finalAction, 500),
    before: safeBefore,
    after: safeAfter,
    changes: finalChanges,
    metadata: sanitizeAuditPayload(metadata || {}),
    context: browserContext(context),
    error: error ? sanitizeAuditPayload({
      message: error.message || error,
      code: error.code || error.name || '',
    }) : null,
    createdAt: serverTimestamp(),
    created_at: new Date().toISOString(),
  };

  try {
    const ref = await addDoc(collection(firebaseDb, 'auditLogs'), payload);
    return { ok: true, id: ref.id };
  } catch (writeError) {
    console.warn('Audit log write failed', finalAction, writeError);
    return { ok: false, error: writeError };
  }
}

export function recordAuthAudit(action, details = {}) {
  return recordAuditLog({
    action,
    module: 'auth',
    entityType: 'auth',
    entityId: details.entityId || details.actorUid || firebaseAuth.currentUser?.uid || 'current_user',
    origin: 'client_auth',
    source: 'auth-provider',
    ...details,
  });
}

export function recordDataAudit(action, details = {}) {
  return recordAuditLog({
    action,
    origin: 'client_data',
    source: 'firebase-data-client',
    ...details,
  });
}

export function recordAdminAudit(action, details = {}) {
  return recordAuditLog({
    action,
    origin: 'admin_panel',
    source: 'admin-dashboard',
    actor: details.actor,
    ...details,
  });
}

export default {
  AUDIT_SCHEMA_VERSION,
  diffAuditObjects,
  recordAdminAudit,
  recordAuditLog,
  recordAuthAudit,
  recordDataAudit,
  sanitizeAuditPayload,
};
