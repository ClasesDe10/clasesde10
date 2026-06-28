const admin = require('firebase-admin');
const Stripe = require('stripe');
const { defineSecret } = require('firebase-functions/params');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const {
  AUTOMATION_ORCHESTRATION_VERSION,
  buildAutomationPlan,
} = require('./platform-automation-engine');

admin.initializeApp();
const db = admin.firestore();

const REGION = 'europe-west1';
const ADMIN_EMAIL = 'contacto.clasesde10@gmail.com';
const MATCHING_TEACHER_SCAN_LIMIT = Number(process.env.MATCHING_TEACHER_SCAN_LIMIT || 1000);
const MATCHING_USER_SCAN_LIMIT = Number(process.env.MATCHING_USER_SCAN_LIMIT || 2000);
const MATCHING_ASSIGNMENT_SCAN_LIMIT = Number(process.env.MATCHING_ASSIGNMENT_SCAN_LIMIT || 5000);
const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
let adminUsersCache = { expiresAt: 0, users: [] };
let notificationSettingsCache = { expiresAt: 0, settings: null };
let automationRulesCache = { expiresAt: 0, rules: [] };
let platformConfigCache = { expiresAt: 0, config: {} };

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function lower(value) {
  return clean(value).toLowerCase();
}

function normalizePaymentStatus(status) {
  const raw = lower(status);
  if (!raw) return 'pendiente';
  if (raw === 'succeeded' || raw === 'paid' || raw === 'captured') return 'validado';
  if (raw === 'processing') return 'procesando';
  if (raw === 'requires_action' || raw === 'requires_payment_method') return 'requiere_accion';
  if (raw === 'failed') return 'fallido';
  if (raw === 'expired') return 'vencido';
  if (raw === 'refunded') return 'devuelto';
  if (raw === 'canceled' || raw === 'cancelled') return 'cancelado';
  return raw;
}

function isTeacherPayout(data = {}) {
  return ['teacher_payout', 'pago_profesor'].includes(data.paymentType || data.tipo);
}

function paymentAmount(data = {}) {
  const amount = Number(data.monto ?? data.amount ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function buildClassPaymentPatch(payment, nowValue = now()) {
  if (isTeacherPayout(payment)) {
    return {
      estado_pago_profesor: 'pagado',
      teacherPaymentStatus: 'pagado',
      teacherPayoutId: payment.id || payment.paymentId || '',
      teacherPayoutPaidAt: nowValue,
      updatedAt: nowValue,
    };
  }
  return {
    estado_pago: 'validado',
    estado_pago_familia: 'validado',
    paymentStatus: 'validado',
    familyPaymentStatus: 'validado',
    familyPaymentId: payment.id || payment.paymentId || '',
    familyPaymentValidatedAt: nowValue,
    updatedAt: nowValue,
  };
}

function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item)).filter(Boolean);
  return clean(value)
    .split(/[,;/+|]|\sy\s/i)
    .map((item) => clean(item))
    .filter(Boolean);
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function tokenize(value) {
  return lower(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((item) => item.length > 2);
}

function now() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function normalizeStatus(data) {
  return lower(data.status || data.estado || data.estado_verificacion || data.verificationStatus);
}

function getUserName(user) {
  return [user?.nombre, user?.apellidos].filter(Boolean).join(' ').trim() || user?.email || '';
}

async function getAdminUsers() {
  if (adminUsersCache.expiresAt > Date.now()) return adminUsersCache.users;
  const snap = await db.collection('users').where('role', '==', 'admin').get();
  const users = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  adminUsersCache = { expiresAt: Date.now() + 60 * 1000, users };
  return users;
}

const DEFAULT_NOTIFICATION_SETTINGS = {
  enabled: true,
  channels: {
    internal: true,
    browser: true,
    push: true,
    email: false,
  },
  eventTypes: {},
  roles: {
    admin: true,
    profesor: true,
    familia: true,
    alumno: true,
  },
};

const NOTIFICATION_DEFINITIONS = {
  admin_manual: { category: 'admin', priority: 'normal', channels: ['internal', 'browser', 'push'] },
  chat_message: { category: 'chat', priority: 'normal', channels: ['internal', 'browser', 'push'] },
  class_reminder: { category: 'clases', priority: 'normal', channels: ['internal', 'browser', 'push'] },
  class_confirmation_needed: { category: 'clases', priority: 'high', channels: ['internal', 'browser', 'push'] },
  class_unmarked_after_1h: { category: 'clases', priority: 'high', channels: ['internal', 'browser', 'push'] },
  class_schedule_change: { category: 'clases', priority: 'high', channels: ['internal', 'browser', 'push'] },
  class_incident: { category: 'incidencias', priority: 'critical', channels: ['internal', 'browser', 'push'] },
  weekly_payment_due: { category: 'pagos', priority: 'high', channels: ['internal', 'browser', 'push'] },
  family_payment_pending: { category: 'pagos', priority: 'high', channels: ['internal', 'browser', 'push'] },
  teacher_payout_pending: { category: 'pagos', priority: 'high', channels: ['internal', 'browser', 'push'] },
  payment_overdue: { category: 'pagos', priority: 'critical', channels: ['internal', 'browser', 'push'] },
  payment_verified: { category: 'pagos', priority: 'normal', channels: ['internal', 'browser', 'push'] },
  request_created: { category: 'solicitudes', priority: 'high', channels: ['internal', 'browser', 'push'] },
  request_stale: { category: 'solicitudes', priority: 'high', channels: ['internal', 'browser', 'push'] },
  matching_ready: { category: 'matching', priority: 'normal', channels: ['internal', 'browser', 'push'] },
  matching_no_match: { category: 'matching', priority: 'high', channels: ['internal', 'browser', 'push'] },
  assignment_created: { category: 'matching', priority: 'high', channels: ['internal', 'browser', 'push'] },
  verification_pending: { category: 'verificacion', priority: 'high', channels: ['internal', 'browser', 'push'] },
  document_review_pending: { category: 'verificacion', priority: 'high', channels: ['internal', 'browser', 'push'] },
  profile_updated: { category: 'perfil', priority: 'normal', channels: ['internal', 'browser'] },
  contact_lead: { category: 'leads', priority: 'normal', channels: ['internal', 'browser', 'push'] },
  teacher_lead: { category: 'leads', priority: 'high', channels: ['internal', 'browser', 'push'] },
  family_lead_request: { category: 'leads', priority: 'high', channels: ['internal', 'browser', 'push'] },
  monthly_summary: { category: 'finanzas', priority: 'normal', channels: ['internal', 'browser'] },
  automation: { category: 'sistema', priority: 'normal', channels: ['internal', 'browser'] },
};

function notificationDefinition(type) {
  return NOTIFICATION_DEFINITIONS[type] || NOTIFICATION_DEFINITIONS.automation;
}

function notificationChannels(type, explicitChannels) {
  const channels = Array.isArray(explicitChannels) && explicitChannels.length
    ? explicitChannels
    : notificationDefinition(type).channels;
  return [...new Set(channels.filter(Boolean))];
}

async function getNotificationSettings() {
  if (notificationSettingsCache.expiresAt > Date.now() && notificationSettingsCache.settings) {
    return notificationSettingsCache.settings;
  }
  const snap = await db.collection('configuracion').doc('notificaciones').get().catch(() => null);
  const data = snap?.exists ? snap.data() : {};
  const settings = {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...data,
    channels: {
      ...DEFAULT_NOTIFICATION_SETTINGS.channels,
      ...(data.channels || {}),
    },
    eventTypes: {
      ...(data.eventTypes || {}),
    },
    roles: {
      ...DEFAULT_NOTIFICATION_SETTINGS.roles,
      ...(data.roles || {}),
    },
  };
  notificationSettingsCache = { expiresAt: Date.now() + 60 * 1000, settings };
  return settings;
}

function isNotificationEnabled(settings, type, channel = 'internal', role = '') {
  if (settings.enabled === false) return false;
  if (settings.channels?.[channel] === false) return false;
  if (settings.eventTypes?.[type] === false) return false;
  if (role && settings.roles?.[role] === false) return false;
  return true;
}

function buildNotification(userUid, title, body, payload = {}, extra = {}) {
  const type = clean(payload.type || extra.type || 'automation', 80);
  const definition = notificationDefinition(type);
  const finalTitle = clean(title, 140) || 'ClasesDe10';
  const finalBody = clean(body, 1200);
  return {
    userUid,
    usuario_id: userUid,
    titulo: finalTitle,
    title: finalTitle,
    cuerpo: finalBody,
    body: finalBody,
    type,
    category: extra.category || definition.category,
    priority: extra.priority || definition.priority,
    channels: notificationChannels(type, extra.channels || payload.channels),
    payload: {
      ...payload,
      type,
    },
    actionUrl: clean(extra.actionUrl || payload.url || '/pages/login.html', 500) || '/pages/login.html',
    role: clean(extra.role, 40),
    readAt: null,
    leida: false,
    fromRole: clean(extra.fromRole || 'system', 80),
    fromAutomation: extra.fromAutomation !== false,
    createdByUid: clean(extra.createdByUid, 180),
    createdAt: now(),
    updatedAt: now(),
  };
}

async function writeNotification(userUid, title, body, payload = {}, extra = {}) {
  const targetUid = clean(userUid, 180);
  if (!targetUid) return null;
  const settings = await getNotificationSettings();
  const type = clean(payload.type || extra.type || 'automation', 80);
  if (!isNotificationEnabled(settings, type, 'internal', extra.role || '')) return null;
  return db.collection('notificaciones').add(buildNotification(targetUid, title, body, payload, extra));
}

async function writeNotificationOnce(userUid, title, body, payload = {}, key = '', extra = {}) {
  const targetUid = clean(userUid, 180);
  if (!targetUid) return false;
  const id = [key || payload.type || 'notification', targetUid]
    .map((part) => clean(part, 180).toLowerCase().replace(/[^a-z0-9_-]+/g, '_'))
    .filter(Boolean)
    .join('__')
    .slice(0, 900);
  const ref = db.collection('notificaciones').doc(id);
  if ((await ref.get()).exists) return false;

  const settings = await getNotificationSettings();
  const type = clean(payload.type || extra.type || 'automation', 80);
  if (!isNotificationEnabled(settings, type, 'internal', extra.role || '')) return false;
  await ref.set(buildNotification(targetUid, title, body, payload, extra), { merge: false });
  return true;
}

async function notifyAdmins(title, body, payload = {}) {
  const admins = await getAdminUsers();
  if (!admins.length) {
    await db.collection('automationEvents').add({
      type: 'admin_notification_missing_recipient',
      title,
      body,
      payload,
      adminEmail: ADMIN_EMAIL,
      createdAt: now(),
    });
    return;
  }

  await Promise.all(admins.map((user) => writeNotification(user.id, title, body, payload, {
    role: user.role || 'admin',
    fromRole: 'admin',
  })));
}

async function getPushTokensForUser(userUid) {
  const snap = await db.collection('notificationTokens')
    .where('userUid', '==', userUid)
    .where('active', '==', true)
    .limit(20)
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((item) => item.token);
}

async function deactivateInvalidTokens(tokens, responses = []) {
  const invalidCodes = new Set([
    'messaging/invalid-registration-token',
    'messaging/registration-token-not-registered',
    'messaging/invalid-argument',
  ]);
  const batch = db.batch();
  let count = 0;
  responses.forEach((response, index) => {
    if (response.success) return;
    if (!invalidCodes.has(response.error?.code)) return;
    const tokenDoc = tokens[index];
    if (!tokenDoc?.id) return;
    batch.set(db.collection('notificationTokens').doc(tokenDoc.id), {
      active: false,
      deactivatedAt: now(),
      deactivationReason: response.error.code,
      updatedAt: now(),
    }, { merge: true });
    count += 1;
  });
  if (count) await batch.commit();
}

async function sendPushForNotification(notificationId, notification) {
  const userUid = clean(notification.userUid, 180);
  if (!userUid) return { sent: 0, skipped: 'missing_user' };

  const channels = Array.isArray(notification.channels) ? notification.channels : [];
  if (!channels.includes('push')) return { sent: 0, skipped: 'push_channel_disabled' };

  const settings = await getNotificationSettings();
  if (!isNotificationEnabled(settings, notification.type || 'automation', 'push', notification.role || '')) {
    return { sent: 0, skipped: 'push_disabled_by_settings' };
  }

  const tokens = await getPushTokensForUser(userUid);
  if (!tokens.length) return { sent: 0, skipped: 'no_tokens' };

  const actionUrl = clean(notification.actionUrl || notification.payload?.url || '/pages/login.html', 500) || '/pages/login.html';
  const message = {
    tokens: tokens.map((item) => item.token),
    notification: {
      title: clean(notification.title || notification.titulo || 'ClasesDe10', 140),
      body: clean(notification.body || notification.cuerpo || '', 800),
    },
    data: {
      notificationId,
      type: clean(notification.type || 'automation', 80),
      url: actionUrl,
    },
    webpush: {
      fcmOptions: {
        link: actionUrl,
      },
      notification: {
        icon: 'https://clasesde10.com/assets/img/logo-192.png',
        badge: 'https://clasesde10.com/assets/img/logo-192.png',
        tag: notificationId,
        renotify: true,
        requireInteraction: notification.priority === 'critical',
      },
    },
  };

  const response = await admin.messaging().sendEachForMulticast(message);
  await deactivateInvalidTokens(tokens, response.responses);
  await db.collection('notificaciones').doc(notificationId).set({
    push: {
      attemptedAt: now(),
      successCount: response.successCount,
      failureCount: response.failureCount,
      tokenCount: tokens.length,
    },
    updatedAt: now(),
  }, { merge: true });
  return { sent: response.successCount, failed: response.failureCount };
}

function participantUidsFromChat(chat = {}) {
  if (chat.participantUids && typeof chat.participantUids === 'object') {
    return Object.keys(chat.participantUids).filter((uid) => chat.participantUids[uid] === true);
  }
  return uniq([
    chat.familyUid,
    chat.familia_id,
    chat.teacherUid,
    chat.profesor_id,
    chat.familyUserUid,
    chat.teacherUserUid,
  ].map((item) => clean(item, 180)).filter(Boolean));
}

async function recipientUidsForChat(chat = {}, senderUid = '') {
  const admins = await getAdminUsers();
  return uniq([
    ...participantUidsFromChat(chat),
    ...admins.map((user) => user.id),
  ]).filter((uid) => uid && uid !== senderUid);
}

function changedAny(before = {}, after = {}, fields = []) {
  return fields.some((field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null));
}

const SYSTEM_JOB_BATCH_LIMIT = 50;
const SYSTEM_JOB_LEASE_MS = 10 * 60 * 1000;
const SYSTEM_JOB_MAX_BACKOFF_MS = 60 * 60 * 1000;

function toTimestamp(value) {
  if (value?.toDate) return value;
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return admin.firestore.Timestamp.fromDate(Number.isNaN(date.getTime()) ? new Date() : date);
}

function timestampAfter(ms) {
  return admin.firestore.Timestamp.fromDate(new Date(Date.now() + ms));
}

function normalizeJobStatus(status) {
  const value = lower(status || 'queued');
  if (['queued', 'pending', 'retry'].includes(value)) return 'queued';
  if (['processing', 'running', 'leased'].includes(value)) return 'processing';
  if (['completed', 'done', 'success'].includes(value)) return 'completed';
  if (['dead_letter', 'dead-letter', 'failed_permanently'].includes(value)) return 'dead_letter';
  if (['cancelled', 'canceled'].includes(value)) return 'cancelled';
  return 'queued';
}

function jobPriority(priority) {
  const numeric = Number(priority);
  if (Number.isFinite(numeric)) return Math.max(0, Math.min(100, Math.round(numeric)));
  const value = lower(priority);
  if (value === 'critical') return 100;
  if (value === 'high') return 75;
  if (value === 'low') return 25;
  return 50;
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function idempotencyKey(type, payload = {}) {
  return hashString(`${clean(type, 120)}|${stableJson(payload)}`);
}

function systemJobId(type, key) {
  return [type, key]
    .map((part) => clean(part, 180).toLowerCase().replace(/[^a-z0-9_-]+/g, '_'))
    .filter(Boolean)
    .join('__')
    .slice(0, 900);
}

function traceContext(source, entityType, entityId, parentTraceId = '') {
  return {
    traceId: parentTraceId || `tr_${hashString(`${source}|${entityType}|${entityId}|${Date.now()}`)}`,
    parentTraceId: parentTraceId || null,
    source: clean(source, 120) || 'functions',
    entityType: clean(entityType, 80) || null,
    entityId: clean(entityId, 180) || null,
    sampledAt: new Date().toISOString(),
    version: 'scale-engine-2026-06-28',
  };
}

async function enqueueSystemJob(type, payload = {}, options = {}) {
  const key = clean(options.idempotencyKey || idempotencyKey(type, payload), 300);
  const ref = db.collection('systemJobs').doc(systemJobId(type, key));
  const existing = await ref.get();
  if (existing.exists && !['dead_letter', 'cancelled'].includes(normalizeJobStatus(existing.data().status))) {
    return { id: ref.id, created: false };
  }

  await ref.set({
    type: clean(type, 120),
    payload,
    status: 'queued',
    priority: jobPriority(options.priority),
    runAt: toTimestamp(options.runAt || new Date()),
    attempts: 0,
    maxAttempts: Math.max(1, Number(options.maxAttempts || 5)),
    idempotencyKey: key,
    trace: options.trace || traceContext(options.source || 'functions', 'systemJob', type, options.traceId),
    source: clean(options.source || 'functions', 120),
    createdAt: now(),
    updatedAt: now(),
    version: 'scale-engine-2026-06-28',
  }, { merge: false });
  return { id: ref.id, created: true };
}

function minutesFromNow(minutes) {
  const safeMinutes = Math.max(0, Number(minutes || 0));
  return new Date(Date.now() + safeMinutes * 60 * 1000);
}

async function setDocumentOnce(collectionName, id, payload) {
  const docId = clean(id, 900);
  if (!collectionName || !docId) return false;
  const ref = db.collection(collectionName).doc(docId);
  const snap = await ref.get();
  if (snap.exists) return false;
  await ref.set(payload, { merge: false });
  return true;
}

async function loadAutomationRules() {
  if (automationRulesCache.expiresAt > Date.now()) return automationRulesCache.rules;
  try {
    const snap = await db.collection('automationRules').limit(500).get();
    automationRulesCache = {
      expiresAt: Date.now() + 5 * 60 * 1000,
      rules: snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        source: 'firestore',
      })),
    };
  } catch (error) {
    logger.warn('Could not load automationRules; default rules will be used.', error);
    automationRulesCache = { expiresAt: Date.now() + 60 * 1000, rules: [] };
  }
  return automationRulesCache.rules;
}

async function loadPlatformConfig() {
  if (platformConfigCache.expiresAt > Date.now()) return platformConfigCache.config;
  try {
    const snap = await db.collection('configuracion').doc('platform').get();
    const config = snap.exists ? (snap.data().config || {}) : {};
    platformConfigCache = { expiresAt: Date.now() + 60 * 1000, config };
  } catch (error) {
    logger.warn('Could not load platform configuration; defaults will be used.', error);
    platformConfigCache = { expiresAt: Date.now() + 60 * 1000, config: {} };
  }
  return platformConfigCache.config;
}

function configNumber(config, path, fallback) {
  const value = String(path || '').split('.').reduce((current, key) => (
    current === undefined || current === null ? undefined : current[key]
  ), config);
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function writePlannedNotification(notification) {
  const payload = notification.payload || { type: notification.type || 'automation' };
  const extra = {
    role: notification.role || notification.targetRole || '',
    priority: notification.priority || '',
    channels: notification.channels || null,
    actionUrl: notification.actionUrl || payload.url || '/pages/login.html',
    fromRole: 'automation',
  };

  if (notification.userUid) {
    const created = await writeNotificationOnce(
      notification.userUid,
      notification.title,
      notification.body,
      payload,
      notification.id,
      extra,
    );
    return created ? 1 : 0;
  }

  if (notification.targetRole === 'admin' || notification.role === 'admin') {
    const admins = await getAdminUsers();
    if (!admins.length) {
      await db.collection('automationEvents').doc(`${notification.id}__missing_admin`).set({
        type: 'admin_notification_missing_recipient',
        title: notification.title,
        body: notification.body,
        payload,
        adminEmail: ADMIN_EMAIL,
        source: 'platform_automation',
        createdAt: now(),
        updatedAt: now(),
      }, { merge: true });
      return 0;
    }
    const results = await Promise.all(admins.map((user) => writeNotificationOnce(
      user.id,
      notification.title,
      notification.body,
      payload,
      `${notification.id}_${user.id}`,
      { ...extra, role: user.role || 'admin' },
    )));
    return results.filter(Boolean).length;
  }

  return 0;
}

async function materializeAutomationPlan(event, extra = {}) {
  const [rules, platformConfig] = await Promise.all([
    loadAutomationRules(),
    loadPlatformConfig(),
  ]);
  const plan = buildAutomationPlan({
    ...event,
    source: event.source || extra.source || 'functions',
  }, { rules, config: platformConfig });
  const counts = {
    automationEvents: 0,
    notifications: 0,
    systemJobs: 0,
    ruleRuns: 0,
    auditLogs: 0,
    crmTasks: 0,
    opsAlerts: 0,
    patches: 0,
  };

  await Promise.all(plan.automationEvents.map(async (item) => {
    const created = await setDocumentOnce('automationEvents', item.id, {
      ...item,
      trace: extra.trace || null,
      createdAt: now(),
      updatedAt: now(),
    });
    if (created) counts.automationEvents += 1;
  }));

  for (const notification of plan.notifications) {
    counts.notifications += await writePlannedNotification(notification);
  }

  for (const job of plan.systemJobs) {
    const result = await enqueueSystemJob(job.type, job.payload, {
      priority: job.priority,
      idempotencyKey: job.idempotencyKey || job.id,
      runAt: minutesFromNow(job.runAfterMinutes),
      maxAttempts: job.maxAttempts,
      source: `platform_automation.${plan.event.type}`,
      trace: extra.trace || traceContext('platform_automation', plan.event.entityType, plan.event.entityId),
    });
    if (result.created) counts.systemJobs += 1;
  }

  await Promise.all(plan.ruleRuns.map(async (item) => {
    const created = await setDocumentOnce('automationRuleRuns', item.id, {
      ...item,
      trace: extra.trace || null,
      source: 'platform_automation',
      createdAt: now(),
      updatedAt: now(),
    });
    if (created) counts.ruleRuns += 1;
  }));

  await Promise.all(plan.auditLogs.map(async (item) => {
    const created = await setDocumentOnce('auditLogs', item.id, {
      schemaVersion: item.schemaVersion || 'audit_log_v1',
      action: item.action,
      module: item.module || 'automation',
      entityType: item.entityType,
      entityId: item.entityId || null,
      actorUid: item.actorUid || 'system',
      actorEmail: item.actorEmail || '',
      actorRole: item.actorRole || 'system',
      actorType: item.actorType || 'automation',
      responsibleUid: item.responsibleUid || item.actorUid || 'system',
      responsibleEmail: item.responsibleEmail || '',
      origin: item.origin || 'automation',
      source: item.source || 'functions',
      severity: item.severity || 'info',
      description: item.description || item.action,
      before: item.before || null,
      after: item.after || null,
      changes: item.changes || [],
      metadata: item.metadata || {},
      context: item.context || {},
      error: item.error || null,
      trace: extra.trace || null,
      createdAt: now(),
      created_at: new Date().toISOString(),
      updatedAt: now(),
    });
    if (created) counts.auditLogs += 1;
  }));

  await Promise.all(plan.crmTasks.map(async (item) => {
    const created = await setDocumentOnce('crmTasks', item.id, {
      ...item,
      dueAt: timestampAfter(Math.max(0, Number(item.dueAfterMinutes || 0)) * 60 * 1000),
      source: 'platform_automation',
      version: AUTOMATION_ORCHESTRATION_VERSION,
      createdAt: now(),
      updatedAt: now(),
    });
    if (created) counts.crmTasks += 1;
  }));

  await Promise.all(plan.opsAlerts.map(async (item) => {
    const created = await setDocumentOnce('opsAlerts', item.id, {
      ...item,
      source: 'platform_automation',
      version: AUTOMATION_ORCHESTRATION_VERSION,
      createdAt: now(),
      updatedAt: now(),
    });
    if (created) counts.opsAlerts += 1;
  }));

  for (const patch of plan.patches) {
    await db.collection(patch.collection).doc(patch.docId).set({
      ...patch.data,
      updatedAt: now(),
    }, { merge: true });
    counts.patches += 1;
  }

  return { plan, counts };
}

function statusOf(data = {}) {
  return lower(data.status || data.estado || data.lifecycleStatus || data.attendanceStatus);
}

function dateFromUnknown(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function createdAtDate(data = {}) {
  return dateFromUnknown(data.createdAt || data.created_at || data.fecha_creacion || data.updatedAt);
}

function isOlderThan(data = {}, ms) {
  const date = createdAtDate(data);
  return Boolean(date && Date.now() - date.getTime() >= ms);
}

function classEndDate(data = {}) {
  const explicit = dateFromUnknown(data.endAt || data.endsAt || data.fecha_fin);
  if (explicit) return explicit;
  const date = clean(data.fecha || data.date, 20);
  if (!date) return null;
  const startTime = clean(data.hora_inicio || data.startTime || '23:59', 8).slice(0, 5);
  const endTime = clean(data.hora_fin || data.endTime || startTime || '23:59', 8).slice(0, 5);
  const end = new Date(`${date}T${endTime || '23:59'}:00`);
  if (Number.isNaN(end.getTime())) return null;
  if (!data.hora_fin && !data.endTime && Number(data.duracion_minutos || data.durationMinutes || 0) > 0) {
    end.setMinutes(end.getMinutes() + Number(data.duracion_minutos || data.durationMinutes || 0));
  }
  return end;
}

function classEndedMoreThanMinutes(data = {}, minutes) {
  const end = classEndDate(data);
  return Boolean(end && Date.now() - end.getTime() >= minutes * 60 * 1000);
}

function classNeedsConfirmation(data = {}) {
  const status = statusOf(data);
  if (!['programada', 'confirmada', 'pendiente_confirmacion', 'scheduled', 'confirmed'].includes(status)) return false;
  if (data.teacherConfirmedAt && data.familyConfirmedAt) return false;
  if (['realizada', 'completada', 'cancelada', 'reprogramada', 'pagada'].includes(lower(data.attendanceStatus))) return false;
  return classEndedMoreThanMinutes(data, 60);
}

function paymentDueDate(data = {}) {
  return dateFromUnknown(data.dueAt || data.fecha_vencimiento || data.vencimiento || data.payByAt);
}

function paymentIsOverdue(data = {}) {
  const status = normalizePaymentStatus(data.familyPaymentStatus || data.estado_pago_familia || data.paymentStatus || data.estado || data.status);
  if (!['pendiente', 'solicitado', 'procesando', 'requires_action', 'requiere_accion'].includes(status)) return false;
  const due = paymentDueDate(data);
  return Boolean(due && due.getTime() < Date.now());
}

function profileLastActivityDate(data = {}) {
  return dateFromUnknown(data.lastActivityAt || data.lastLoginAt || data.lastClassAt || data.updatedAt || data.createdAt);
}

function teacherIsInactive(data = {}) {
  if (data.active === false || data.activo === false) return false;
  const status = normalizeStatus(data);
  if (status && !['verificado', 'activo', 'active', 'verified'].includes(status)) return false;
  const lastActivity = profileLastActivityDate(data);
  return Boolean(lastActivity && Date.now() - lastActivity.getTime() >= 30 * 24 * 60 * 60 * 1000);
}

async function loadDocsByStatuses(collectionName, fields, statuses, perStatusLimit = 25) {
  const docs = new Map();
  for (const field of fields) {
    for (const status of statuses) {
      const snap = await db.collection(collectionName).where(field, '==', status).limit(perStatusLimit).get();
      snap.docs.forEach((doc) => docs.set(doc.id, doc));
    }
  }
  return [...docs.values()];
}

async function claimSystemJob(jobRef, workerId) {
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(jobRef);
    if (!snap.exists) return null;

    const data = snap.data();
    const status = normalizeJobStatus(data.status);
    const leaseUntil = data.leaseUntil?.toDate ? data.leaseUntil.toDate() : null;
    if (status === 'processing' && leaseUntil && leaseUntil.getTime() > Date.now()) return null;
    if (!['queued', 'processing'].includes(status)) return null;

    const attempts = Math.max(0, Number(data.attempts || 0)) + 1;
    transaction.set(jobRef, {
      status: 'processing',
      attempts,
      workerId,
      startedAt: now(),
      leaseUntil: timestampAfter(SYSTEM_JOB_LEASE_MS),
      updatedAt: now(),
    }, { merge: true });
    return { id: snap.id, ref: jobRef, data: { ...data, attempts } };
  });
}

function serializeJobError(error) {
  return {
    message: clean(error?.message || error || 'unknown_error', 1000),
    code: clean(error?.code || error?.name || '', 120) || null,
    stack: clean(error?.stack || '', 2000) || null,
    at: new Date().toISOString(),
  };
}

function retryDelayMs(attempts) {
  const safeAttempts = Math.max(1, Number(attempts || 1));
  return Math.min(SYSTEM_JOB_MAX_BACKOFF_MS, Math.round((2 ** (safeAttempts - 1)) * 60 * 1000));
}

async function completeSystemJob(job, result = {}) {
  await job.ref.set({
    status: 'completed',
    completedAt: now(),
    leaseUntil: null,
    result,
    updatedAt: now(),
  }, { merge: true });
}

async function failSystemJob(job, error) {
  const attempts = Math.max(1, Number(job.data.attempts || 1));
  const maxAttempts = Math.max(1, Number(job.data.maxAttempts || 5));
  const lastError = serializeJobError(error);

  if (attempts >= maxAttempts) {
    await Promise.all([
      job.ref.set({
        status: 'dead_letter',
        deadLetterAt: now(),
        leaseUntil: null,
        lastError,
        updatedAt: now(),
      }, { merge: true }),
      db.collection('deadLetters').doc(job.id).set({
        jobId: job.id,
        type: job.data.type || '',
        payload: job.data.payload || {},
        attempts,
        maxAttempts,
        lastError,
        trace: job.data.trace || null,
        createdAt: now(),
        updatedAt: now(),
      }, { merge: true }),
    ]);
    return;
  }

  await job.ref.set({
    status: 'queued',
    runAt: timestampAfter(retryDelayMs(attempts)),
    leaseUntil: null,
    lastError,
    updatedAt: now(),
  }, { merge: true });
}

async function countQuery(queryRef, label) {
  try {
    const snap = await queryRef.count().get();
    return snap.data().count;
  } catch (error) {
    logger.warn('countQuery failed', { label, message: error.message });
    return null;
  }
}

function buildScaleAlerts(metrics) {
  const alerts = [];
  if ((metrics.jobs?.queued || 0) > 500) alerts.push({ level: 'high', type: 'job_backlog', message: 'System job backlog above 500 queued jobs.' });
  if ((metrics.jobs?.deadLetter || 0) > 0) alerts.push({ level: 'critical', type: 'dead_letters', message: 'Dead-letter jobs require admin review.' });
  if ((metrics.payments?.overdue || 0) > 0) alerts.push({ level: 'high', type: 'overdue_payments', message: 'There are overdue payments.' });
  if ((metrics.notifications?.unread || 0) > 10000) alerts.push({ level: 'medium', type: 'notification_backlog', message: 'Unread notification backlog is high.' });
  return alerts;
}

function buildPlatformHealthCheck(metrics, alerts = [], source = 'system') {
  const jobs = metrics.jobs || {};
  const payments = metrics.payments || {};
  const notifications = metrics.notifications || {};
  const incidents = metrics.incidents || {};
  const systems = [
    {
      id: 'database',
      name: 'Base de datos',
      status: 'operational',
      what: 'Snapshot de metricas generado correctamente',
      impact: 'Sin impacto observado.',
      affectedUsers: 0,
      cause: 'Conteos Firestore completados.',
      fix: 'Mantener monitorizacion.',
    },
    {
      id: 'scheduled_tasks',
      name: 'Tareas programadas',
      status: jobs.deadLetter > 0 ? 'outage' : jobs.queued > 250 ? 'degraded' : jobs.queued > 50 ? 'attention' : 'operational',
      what: `${jobs.queued || 0} jobs en cola, ${jobs.deadLetter || 0} dead letters`,
      impact: jobs.deadLetter > 0 ? 'Procesos automaticos pueden haber fallado definitivamente.' : 'Backlog bajo control.',
      affectedUsers: 0,
      cause: 'Estado agregado de systemJobs.',
      fix: jobs.deadLetter > 0 ? 'Revisar deadLetters y reencolar tras corregir la causa.' : 'Mantener worker programado.',
    },
    {
      id: 'payments',
      name: 'Pagos',
      status: payments.overdue > 0 ? 'attention' : 'operational',
      what: `${payments.overdue || 0} pagos vencidos, ${payments.needsReview || 0} en revision`,
      impact: payments.overdue > 0 ? 'Caja y cierre de clases pueden retrasarse.' : 'Sin impacto observado.',
      affectedUsers: payments.overdue || 0,
      cause: 'Conteo de pagos vencidos/pendientes de conciliacion.',
      fix: payments.overdue > 0 ? 'Validar cobros y enviar recordatorios.' : 'Mantener conciliacion automatica.',
    },
    {
      id: 'notifications',
      name: 'Notificaciones',
      status: notifications.tokens > 0 ? 'operational' : 'attention',
      what: `${notifications.tokens || 0} tokens push activos`,
      impact: notifications.tokens > 0 ? 'Push disponible.' : 'Los avisos pueden depender del centro interno.',
      affectedUsers: 0,
      cause: 'Conteo de notificationTokens activos.',
      fix: notifications.tokens > 0 ? 'Mantener limpieza de tokens.' : 'Activar permisos push en la PWA.',
    },
    {
      id: 'automation',
      name: 'Procesos automaticos',
      status: alerts.length ? 'attention' : 'operational',
      what: `${alerts.length} alerta(s) operativas generadas`,
      impact: alerts.length ? 'Hay riesgos detectados por el motor de escala.' : 'Sin impacto observado.',
      affectedUsers: 0,
      cause: 'buildScaleAlerts sobre metricas agregadas.',
      fix: alerts.length ? 'Revisar opsAlerts abiertas.' : 'Mantener monitorizacion.',
    },
    {
      id: 'incidents',
      name: 'Incidencias',
      status: incidents.critical > 0 ? 'degraded' : incidents.open > 0 ? 'attention' : 'operational',
      what: `${incidents.open || 0} incidencias abiertas, ${incidents.critical || 0} criticas`,
      impact: incidents.critical > 0 ? 'Puede haber impacto directo en usuarios.' : 'Sin impacto critico observado.',
      affectedUsers: incidents.open || 0,
      cause: 'Conteo de incidencias abiertas.',
      fix: incidents.open > 0 ? 'Priorizar incidencias criticas y cerrar duplicadas.' : 'Mantener seguimiento.',
    },
  ];
  const statusOrder = { operational: 0, attention: 1, degraded: 2, outage: 3 };
  const status = systems.reduce((worst, item) => (statusOrder[item.status] > statusOrder[worst] ? item.status : worst), 'operational');
  const weights = { operational: 100, attention: 75, degraded: 45, outage: 10 };
  const score = Math.round(systems.reduce((sum, item) => sum + weights[item.status], 0) / systems.length);
  return {
    schemaVersion: 'mission_control_v1',
    scope: 'platform',
    source,
    status,
    score,
    generated_at: new Date().toISOString(),
    counts: {
      operational: systems.filter((item) => item.status === 'operational').length,
      attention: systems.filter((item) => item.status === 'attention').length,
      degraded: systems.filter((item) => item.status === 'degraded').length,
      outage: systems.filter((item) => item.status === 'outage').length,
    },
    impactedSubsystems: systems.filter((item) => item.status !== 'operational').length,
    affectedUsers: systems.reduce((sum, item) => sum + Number(item.affectedUsers || 0), 0),
    subsystems: systems,
  };
}

async function writeScaleMetricSnapshot(source = 'scheduled') {
  const metrics = {
    source,
    generatedAt: new Date().toISOString(),
    users: {
      total: await countQuery(db.collection('users'), 'users_total'),
      admins: await countQuery(db.collection('users').where('role', '==', 'admin'), 'users_admins'),
    },
    marketplace: {
      teachers: await countQuery(db.collection('profesores'), 'teachers_total'),
      families: await countQuery(db.collection('familias'), 'families_total'),
      students: await countQuery(db.collection('alumnos'), 'students_total'),
      requests: await countQuery(db.collection('solicitudes'), 'requests_total'),
      assignments: await countQuery(db.collection('asignaciones'), 'assignments_total'),
    },
    classes: {
      total: await countQuery(db.collection('clases'), 'classes_total'),
      scheduled: await countQuery(db.collection('clases').where('status', '==', 'programada'), 'classes_scheduled'),
      completed: await countQuery(db.collection('clases').where('status', '==', 'realizada'), 'classes_completed'),
    },
    payments: {
      total: await countQuery(db.collection('pagos'), 'payments_total'),
      pending: await countQuery(db.collection('pagos').where('status', '==', 'pendiente'), 'payments_pending'),
      overdue: await countQuery(db.collection('pagos').where('status', '==', 'vencido'), 'payments_overdue'),
      needsReview: await countQuery(db.collection('pagos').where('reconciliationStatus', '==', 'needs_review'), 'payments_needs_review'),
    },
    notifications: {
      total: await countQuery(db.collection('notificaciones'), 'notifications_total'),
      unread: await countQuery(db.collection('notificaciones').where('readAt', '==', null), 'notifications_unread'),
      tokens: await countQuery(db.collection('notificationTokens').where('active', '==', true), 'push_tokens_active'),
    },
    jobs: {
      queued: await countQuery(db.collection('systemJobs').where('status', '==', 'queued'), 'jobs_queued'),
      processing: await countQuery(db.collection('systemJobs').where('status', '==', 'processing'), 'jobs_processing'),
      deadLetter: await countQuery(db.collection('systemJobs').where('status', '==', 'dead_letter'), 'jobs_dead_letter'),
    },
    incidents: {
      open: await countQuery(db.collection('incidencias').where('status', '==', 'abierta'), 'incidents_open'),
      critical: await countQuery(db.collection('incidencias').where('priority', '==', 'critical'), 'incidents_critical'),
    },
    version: 'scale-engine-2026-06-28',
  };
  const alerts = buildScaleAlerts(metrics);
  const health = buildPlatformHealthCheck(metrics, alerts, source);
  const id = new Date().toISOString().slice(0, 16).replace(/[:]/g, '-');
  await db.collection('metricSnapshots').doc(`platform_${id}`).set({
    scope: 'platform',
    period: '15m',
    metrics,
    alerts,
    createdAt: now(),
    updatedAt: now(),
  }, { merge: true });

  await Promise.all(alerts.map((alert) => db.collection('opsAlerts').doc(`${alert.type}_${id}`).set({
    ...alert,
    status: 'open',
    source: 'scale_metrics',
    createdAt: now(),
    updatedAt: now(),
  }, { merge: true })));

  await db.collection('platformHealthChecks').doc(`platform_${id}`).set({
    ...health,
    createdAt: now(),
    updatedAt: now(),
  }, { merge: true });

  return { metrics, alerts };
}

async function resolveUserUidFromProfile(collectionName, profileId, fallback = '') {
  const id = clean(profileId, 180);
  if (!id) return clean(fallback, 180);
  const snap = await db.collection(collectionName).doc(id).get().catch(() => null);
  if (!snap?.exists) return clean(fallback || id, 180);
  const data = snap.data();
  return clean(data.userUid || data.firebase_uid || data.usuario_id || fallback || id, 180);
}

async function enrichClassAutomationData(data = {}) {
  const teacherProfileId = clean(data.teacherUid || data.profesor_id || data.teacherId, 180);
  const familyProfileId = clean(data.familyUid || data.familia_id || data.familyId, 180);
  const [teacherUserUid, familyUserUid] = await Promise.all([
    resolveUserUidFromProfile('profesores', teacherProfileId, data.teacherUserUid),
    resolveUserUidFromProfile('familias', familyProfileId, data.familyUserUid),
  ]);
  return {
    ...data,
    teacherUserUid,
    familyUserUid,
  };
}

async function enrichPaymentAutomationData(data = {}) {
  const teacherProfileId = clean(data.teacherUid || data.profesor_id || data.teacherId, 180);
  const familyProfileId = clean(data.familyUid || data.familia_id || data.familyId, 180);
  const [teacherUserUid, familyUserUid] = await Promise.all([
    resolveUserUidFromProfile('profesores', teacherProfileId, data.teacherUserUid),
    resolveUserUidFromProfile('familias', familyProfileId, data.familyUserUid),
  ]);
  return {
    ...data,
    teacherUserUid,
    familyUserUid,
  };
}

exports.sendPushOnNotificationCreated = onDocumentCreated({
  region: REGION,
  document: 'notificaciones/{notificationId}',
}, async (event) => {
  const notificationId = event.params.notificationId;
  const notification = event.data.data();
  try {
    const result = await sendPushForNotification(notificationId, notification);
    logger.info('sendPushOnNotificationCreated completed', { notificationId, result });
  } catch (error) {
    logger.warn('sendPushOnNotificationCreated failed', {
      notificationId,
      message: error.message,
      code: error.code,
    });
    await event.data.ref.set({
      push: {
        attemptedAt: now(),
        error: clean(error.message || error.code || 'unknown', 500),
      },
      updatedAt: now(),
    }, { merge: true });
  }
});

exports.notifyOnChatMessage = onDocumentCreated({
  region: REGION,
  document: 'chats/{chatId}/mensajes/{messageId}',
}, async (event) => {
  const { chatId, messageId } = event.params;
  const message = event.data.data();
  const senderUid = clean(message.senderUid, 180);
  const chatSnap = await db.collection('chats').doc(chatId).get();
  if (!chatSnap.exists) return;

  const chat = chatSnap.data();
  const recipients = await recipientUidsForChat(chat, senderUid);
  const senderLabel = clean(message.senderName || message.senderRole || 'ClasesDe10', 120);
  const body = clean(message.body, 180);

  await Promise.all(recipients.map((uid) => writeNotificationOnce(
    uid,
    `Nuevo mensaje de ${senderLabel}`,
    body,
    {
      type: 'chat_message',
      chatId,
      messageId,
      assignmentId: chat.assignmentId || chat.asignacion_id || '',
      url: '/pages/login.html',
    },
    `chat_message_${chatId}_${messageId}_${uid}`,
    { role: '', fromRole: message.senderRole || 'chat' },
  )));
});

exports.notifyOnDocumentCreated = onDocumentCreated({
  region: REGION,
  document: 'documentos/{documentId}',
}, async (event) => {
  const documentId = event.params.documentId;
  const data = event.data.data();
  await materializeAutomationPlan({
    type: 'document.created',
    entityType: 'documentos',
    entityId: documentId,
    data: { id: documentId, ...data },
    source: 'documentos.onCreate',
  });
});

exports.notifyOnIncidentCreated = onDocumentCreated({
  region: REGION,
  document: 'incidencias/{incidentId}',
}, async (event) => {
  const incidentId = event.params.incidentId;
  const data = event.data.data();
  await materializeAutomationPlan({
    type: 'incident.created',
    entityType: 'incidencias',
    entityId: incidentId,
    data: { id: incidentId, ...data },
    source: 'incidencias.onCreate',
  });
});

exports.notifyOnTeacherProfileUpdated = onDocumentUpdated({
  region: REGION,
  document: 'profesores/{teacherId}',
}, async (event) => {
  const teacherId = event.params.teacherId;
  const before = event.data.before.data();
  const after = event.data.after.data();
  const fields = [
    'nombre',
    'email',
    'telefono',
    'materias',
    'niveles_educativos',
    'modalidad',
    'zona',
    'availabilitySlots',
    'estado_verificacion',
    'verificationStatus',
    'profileCompletion',
  ];
  if (!changedAny(before, after, fields)) return;
  await materializeAutomationPlan({
    type: 'profile.updated',
    entityType: 'profesores',
    entityId: teacherId,
    data: { id: teacherId, userType: 'profesores', ...after },
    source: 'profesores.onUpdate',
  });
});

exports.notifyOnFamilyProfileUpdated = onDocumentUpdated({
  region: REGION,
  document: 'familias/{familyId}',
}, async (event) => {
  const familyId = event.params.familyId;
  const before = event.data.before.data();
  const after = event.data.after.data();
  const fields = ['nombre', 'email', 'telefono', 'direccion', 'zona', 'preferencias', 'profileCompletion'];
  if (!changedAny(before, after, fields)) return;
  await materializeAutomationPlan({
    type: 'profile.updated',
    entityType: 'familias',
    entityId: familyId,
    data: { id: familyId, userType: 'familias', ...after },
    source: 'familias.onUpdate',
  });
});

async function findPaymentRefByStripeObject(object = {}) {
  const metadataPaymentId = clean(object.metadata?.paymentId || object.metadata?.pagoId);
  if (metadataPaymentId) return db.collection('pagos').doc(metadataPaymentId);

  const checkoutSessionId = clean(object.object === 'checkout.session' ? object.id : object.checkout_session);
  const paymentIntentId = clean(
    object.payment_intent
    || (object.object === 'payment_intent' ? object.id : '')
    || object.paymentIntentId,
  );

  if (checkoutSessionId) {
    const snap = await db.collection('pagos').where('checkoutSessionId', '==', checkoutSessionId).limit(1).get();
    if (!snap.empty) return snap.docs[0].ref;
  }
  if (paymentIntentId) {
    const snap = await db.collection('pagos').where('paymentIntentId', '==', paymentIntentId).limit(1).get();
    if (!snap.empty) return snap.docs[0].ref;
  }

  const fallbackId = paymentIntentId || checkoutSessionId || clean(object.id);
  return fallbackId ? db.collection('pagos').doc(`stripe_${fallbackId}`) : null;
}

function stripePaymentUpdate(event) {
  const object = event.data.object || {};
  const paymentIntentId = clean(
    object.payment_intent
    || (object.object === 'payment_intent' ? object.id : '')
    || object.paymentIntentId,
  );
  const checkoutSessionId = clean(object.object === 'checkout.session' ? object.id : object.checkout_session);
  const providerStatus = clean(object.payment_status || object.status || event.type, 80);
  const status = normalizePaymentStatus(providerStatus);
  const verified = ['validado', 'pagado'].includes(status)
    || event.type === 'checkout.session.completed'
    || event.type === 'checkout.session.async_payment_succeeded'
    || event.type === 'payment_intent.succeeded';

  return {
    gateway: 'stripe',
    provider: 'stripe',
    providerPaymentId: paymentIntentId || checkoutSessionId || clean(object.id),
    paymentIntentId,
    checkoutSessionId,
    providerPaymentStatus: providerStatus,
    gatewayStatus: providerStatus,
    estado: verified ? 'validado' : status,
    status: verified ? 'validado' : status,
    verified,
    verificationSource: 'stripe',
    gatewayEventId: event.id,
    gatewayEventType: event.type,
    gatewayVerifiedAt: verified ? now() : null,
    fecha_validacion: verified ? new Date().toISOString() : null,
    validatedAt: verified ? new Date().toISOString() : null,
    updatedAt: now(),
    updated_at: new Date().toISOString(),
  };
}

async function reconcilePaymentRef(paymentRef) {
  const snap = await paymentRef.get();
  if (!snap.exists) return { applied: false, reason: 'payment_not_found' };
  const payment = { id: snap.id, ...snap.data() };
  if (payment.reconciliationStatus === 'applied') return { applied: false, reason: 'already_applied' };
  if (!['validado', 'pagado'].includes(normalizePaymentStatus(payment.estado || payment.status))) return { applied: false, reason: 'not_verified' };

  const classIds = Array.isArray(payment.classIds) ? payment.classIds.map(String).filter(Boolean) : [];
  if (!classIds.length) {
    await paymentRef.update({
      reconciliationStatus: 'needs_review',
      reconciliationReason: 'missing_class_ids',
      updatedAt: now(),
    });
    return { applied: false, reason: 'missing_class_ids' };
  }

  const batch = db.batch();
  classIds.forEach((classId) => batch.set(
    db.collection('clases').doc(classId),
    buildClassPaymentPatch(payment),
    { merge: true },
  ));
  batch.set(paymentRef, {
    reconciliationStatus: 'applied',
    reconciliationReason: 'stripe_verified_explicit_class_ids',
    reconciliationConfidence: 1,
    reconciledAt: now(),
    updatedAt: now(),
  }, { merge: true });
  await batch.commit();
  return { applied: true, classIds };
}

function calculateTeacherPrice(data) {
  let base = 15;
  const education = lower([data.titulacion, data.nivel_estudios, data.universidad, data.bio].join(' '));
  if (education.includes('doctor') || education.includes('master') || education.includes('máster')) base += 8;
  else if (education.includes('grado') || education.includes('licenci') || education.includes('ingenier') || education.includes('universidad')) base += 5;
  else if (education.includes('fp') || education.includes('modulo') || education.includes('módulo')) base += 2;

  const experienceText = lower([data.experiencia, data.anios, data.bio].join(' '));
  const years = Number(experienceText.match(/\d+/)?.[0] || 0);
  if (years >= 5) base += 6;
  else if (years >= 3) base += 4;
  else if (years >= 1) base += 2;

  const subjects = lower([data.materias, data.materia].flat().join(' '));
  if (/(matematic|mates|fisica|física|quimica|química)/.test(subjects)) base += 3;
  return Math.round(base * 2) / 2;
}

function teacherDiagnostic(data, price) {
  const subjects = asArray(data.materias || data.materia).join(', ') || 'Sin materias';
  const levels = asArray(data.niveles_educativos || data.niveles || data.nivel).join(', ') || 'Sin niveles';
  const zone = clean(data.zona || data.ciudad || data.metadata?.zona) || 'Sin zona';
  const modality = clean(data.modalidad || data.metadata?.modalidad) || 'Sin modalidad';
  const warnings = [];
  if (!subjects || subjects === 'Sin materias') warnings.push('Faltan materias.');
  if (!levels || levels === 'Sin niveles') warnings.push('Faltan niveles.');
  if (!clean(data.experiencia || data.bio || data.metadata?.anios)) warnings.push('Falta experiencia declarada.');
  return {
    summary: `Materias: ${subjects}. Niveles: ${levels}. Modalidad: ${modality}. Zona: ${zone}. Precio sugerido: ${price} EUR/h.`,
    warnings,
  };
}

function studentDiagnostic(data) {
  const subject = clean(data.materia || data.materias || data.metadata?.materia || data.metadata?.materias) || 'Sin materia';
  const level = clean(data.nivel || data.curso || data.metadata?.nivel) || 'Sin nivel';
  const modality = clean(data.modalidad || data.metadata?.modalidad) || 'Sin modalidad';
  const zone = clean(data.zona || data.metadata?.zona) || 'Sin zona';
  return {
    summary: `Alumno: ${clean(data.alumno || data.metadata?.alumno || data.studentName) || 'Sin nombre'}. Nivel: ${level}. Materia: ${subject}. Modalidad: ${modality}. Zona: ${zone}.`,
    missing: [
      subject === 'Sin materia' ? 'materia' : '',
      level === 'Sin nivel' ? 'nivel' : '',
      zone === 'Sin zona' ? 'zona' : '',
    ].filter(Boolean),
  };
}

function leadToPublicRequest(leadId, lead) {
  const metadata = lead.metadata || {};
  const subject = clean(metadata.materia || metadata.materias || lead.asunto || lead.mensaje, 180);
  const studentName = clean(metadata.alumno || lead.alumno || '', 160);
  return {
    source: 'publicLead',
    publicLeadId: leadId,
    estado: 'nueva',
    status: 'nueva',
    materia: subject,
    nivel: clean(metadata.nivel || metadata.niveles, 120),
    modalidad: clean(metadata.modalidad, 120),
    zona: clean(metadata.zona, 180),
    preferencia_horario: clean(metadata.disponibilidad || metadata.frecuencia || metadata.inicio, 300),
    observaciones: clean(lead.mensaje, 2000),
    familySnapshot: {
      nombre: clean(lead.nombre, 160),
      email: clean(lead.email, 254).toLowerCase(),
      telefono: clean(lead.telefono, 40),
    },
    studentSnapshot: {
      nombre: studentName,
      nivel: clean(metadata.nivel || metadata.niveles, 120),
    },
    matchStatus: 'pending',
    createdAt: now(),
    updatedAt: now(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function countActiveAssignmentsByTeacher() {
  const snap = await db.collection('asignaciones')
    .where('active', '==', true)
    .limit(MATCHING_ASSIGNMENT_SCAN_LIMIT)
    .get();
  const counts = new Map();
  snap.docs.forEach((doc) => {
    const data = doc.data();
    const teacherUid = data.teacherUid || data.profesor_id;
    if (teacherUid) counts.set(teacherUid, (counts.get(teacherUid) || 0) + 1);
  });
  return counts;
}

async function loadTeachers() {
  const [teachersSnap, usersSnap, assignmentCounts] = await Promise.all([
    db.collection('profesores').limit(MATCHING_TEACHER_SCAN_LIMIT).get(),
    db.collection('users').limit(MATCHING_USER_SCAN_LIMIT).get(),
    countActiveAssignmentsByTeacher(),
  ]);
  const users = new Map(usersSnap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }]));

  return teachersSnap.docs
    .map((doc) => {
      const data = doc.data();
      const userUid = data.userUid || data.usuario_id || doc.id;
      const user = users.get(userUid) || {};
      const status = normalizeStatus(data);
      return {
        id: doc.id,
        teacherUid: doc.id,
        userUid,
        nombre: getUserName(user) || getUserName(data) || doc.id,
        email: user.email || data.email || '',
        status,
        active: data.active !== false && data.activo !== false,
        materias: asArray(data.materias || data.subjects || data.materia),
        niveles: asArray(data.niveles_educativos || data.levels || data.niveles || data.nivel),
        modalidad: clean(data.modalidad || data.tipo_clase || data.formato),
        zona: clean(data.zona || data.ciudad || data.barrio),
        bio: clean(data.bio || data.experiencia, 1000),
        maxStudents: Number(data.maxStudents || data.max_alumnos || 5),
        activeAssignments: assignmentCounts.get(doc.id) || assignmentCounts.get(userUid) || 0,
        trustScore: Number(data.trustScore || data.reputationScore || 0),
        trustLevel: data.trustLevel || '',
        reputationMetrics: data.reputationMetrics || {},
        publicTrustStats: data.publicTrustStats || {},
        trustWarnings: Array.isArray(data.trustWarnings) ? data.trustWarnings : [],
        raw: data,
      };
    })
    .filter((teacher) => teacher.active && ['verificado', 'activo', 'pendiente_revision', 'pendiente', ''].includes(teacher.status));
}

function getRequestProfile(request) {
  const metadata = request.metadata || {};
  const student = request.studentSnapshot || {};
  return {
    subject: clean(request.materia || request.subject || metadata.materia || metadata.materias),
    level: clean(request.nivel || request.nivel_educativo || request.curso || student.nivel || metadata.nivel),
    modality: clean(request.modalidad || metadata.modalidad),
    zone: clean(request.zona || metadata.zona),
    schedule: clean(request.preferencia_horario || request.disponibilidad || metadata.disponibilidad),
    studentName: clean(student.nombre || request.alumno_nombre || metadata.alumno),
  };
}

function scoreTeacher(profile, teacher) {
  let score = 0;
  const reasons = [];
  const risks = [];
  const subjectTokens = tokenize(profile.subject);
  const teacherSubjectText = lower(teacher.materias.join(' '));
  const subjectMatches = subjectTokens.filter((token) => teacherSubjectText.includes(token));
  if (subjectTokens.length && subjectMatches.length) {
    score += Math.min(45, 25 + subjectMatches.length * 10);
    reasons.push(`Cubre la materia (${profile.subject}).`);
  } else if (subjectTokens.length) {
    risks.push(`No hay coincidencia clara de materia (${profile.subject}).`);
    score -= 20;
  } else {
    score += 10;
    risks.push('La solicitud no indica materia clara.');
  }

  const level = lower(profile.level);
  const levels = lower(teacher.niveles.join(' '));
  if (level && (levels.includes(level) || levels.includes('todos') || levels.includes('eso') && level.includes('eso'))) {
    score += 25;
    reasons.push(`Nivel compatible (${profile.level}).`);
  } else if (level) {
    risks.push(`Nivel no confirmado (${profile.level}).`);
  }

  const modality = lower(profile.modality);
  const teacherModality = lower(teacher.modalidad);
  if (!modality || !teacherModality || teacherModality.includes('ambas') || modality.includes('ambas') || teacherModality.includes(modality)) {
    score += 10;
    if (profile.modality) reasons.push(`Modalidad compatible (${profile.modality}).`);
  } else {
    risks.push(`Modalidad pendiente de validar (${profile.modality} vs ${teacher.modalidad}).`);
  }

  const zone = lower(profile.zone);
  const teacherZone = lower(teacher.zona);
  if (zone && teacherZone && (teacherZone.includes(zone) || zone.includes(teacherZone) || teacherModality.includes('online'))) {
    score += 10;
    reasons.push(`Zona/modalidad compatible (${profile.zone}).`);
  } else if (zone) {
    risks.push(`Zona no confirmada (${profile.zone}).`);
  }

  const remaining = Math.max(0, teacher.maxStudents - teacher.activeAssignments);
  if (remaining > 0) {
    score += Math.min(10, remaining * 2);
    reasons.push(`${remaining} plaza(s) estimadas disponibles.`);
  } else {
    score -= 30;
    risks.push('Carga actual completa.');
  }

  if (teacher.status === 'verificado' || teacher.status === 'activo') score += 8;
  else risks.push('Profesor pendiente de revision/verificacion.');

  if (teacher.trustScore >= 85) {
    score += 10;
    reasons.push(`Confianza operativa alta (${teacher.trustScore}/100).`);
  } else if (teacher.trustScore >= 65) {
    score += 5;
    reasons.push(`Confianza operativa media (${teacher.trustScore}/100).`);
  } else if (teacher.trustScore > 0) {
    risks.push(`Confianza operativa baja (${teacher.trustScore}/100).`);
  }

  const reputation = teacher.reputationMetrics || {};
  const publicTrust = teacher.publicTrustStats || {};
  const completionRate = Number(reputation.adjustedCompletionRate ?? reputation.completionRate ?? publicTrust.completionRate);
  const cancellationRate = Number(reputation.adjustedCancellationRate ?? reputation.cancellationRate ?? publicTrust.cancellationRate);
  const punctualityRate = Number(reputation.punctualityRate ?? publicTrust.punctualityRate);
  const completedHours = Number(reputation.completedHours ?? publicTrust.completedHours);
  const activeStudents = Number(reputation.activeStudents ?? publicTrust.activeStudents);

  if (Number.isFinite(completionRate) && completionRate >= 0.9) {
    score += 4;
    reasons.push('Historial de clases realizadas muy alto.');
  }
  if (Number.isFinite(cancellationRate) && cancellationRate > 0.18) {
    score -= 8;
    risks.push('Tasa de cancelacion elevada.');
  }
  if (Number.isFinite(punctualityRate) && punctualityRate >= 0.9) {
    score += 3;
    reasons.push('Puntualidad contrastada.');
  }
  if (Number.isFinite(completedHours) && completedHours >= 30) {
    score += 3;
    reasons.push(`${Math.round(completedHours)}h impartidas registradas.`);
  }
  if (Number.isFinite(activeStudents) && activeStudents >= 2) {
    score += 2;
    reasons.push(`${Math.round(activeStudents)} alumno(s) activo(s).`);
  }
  if (teacher.trustWarnings.length) risks.push(...teacher.trustWarnings.slice(0, 2));

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
    risks,
  };
}

async function callGeminiIfConfigured(profile, candidates) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !candidates.length) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  const teacherBlock = candidates.slice(0, 8).map((candidate, index) => (
    `P${index + 1}: id="${candidate.teacherUid}" nombre="${candidate.nombre}" scoreBase=${candidate.score} materias="${candidate.materias.join(', ')}" niveles="${candidate.niveles.join(', ')}" modalidad="${candidate.modalidad}" zona="${candidate.zona}" riesgos="${candidate.risks.join('; ')}"`
  )).join('\n');

  const prompt = `Eres el motor de matching de ClasesDe10. Ordena los mejores profesores para esta solicitud. Responde solo JSON valido.\nSOLICITUD: materia="${profile.subject}" nivel="${profile.level}" modalidad="${profile.modality}" zona="${profile.zone}" horario="${profile.schedule}"\nCANDIDATOS:\n${teacherBlock}\nJSON requerido: {"matches":[{"teacherUid":"...","score":90,"reason":"frase breve","risks":["..."]}]}`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.15, maxOutputTokens: 700 },
    }),
  });
  const raw = await response.json();
  if (!response.ok || raw.error) throw new Error(raw.error?.message || `Gemini ${response.status}`);
  const text = raw.candidates?.[0]?.content?.parts?.[0]?.text
    ?.replace(/^```json\s*/i, '')
    ?.replace(/^```\s*/i, '')
    ?.replace(/```\s*$/i, '')
    ?.trim();
  return text ? JSON.parse(text) : null;
}

async function generateMatchesForRequest(requestId, request, reason = 'trigger') {
  const profile = getRequestProfile(request);
  const teachers = await loadTeachers();
  const baseCandidates = teachers
    .map((teacher) => {
      const scored = scoreTeacher(profile, teacher);
      return { ...teacher, ...scored };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  let aiResult = null;
  let aiError = null;
  try {
    aiResult = await callGeminiIfConfigured(profile, baseCandidates);
  } catch (error) {
    aiError = error.message;
    logger.warn('Gemini matching failed, using deterministic ranking', { requestId, error: error.message });
  }

  const aiByTeacher = new Map((aiResult?.matches || []).map((match) => [match.teacherUid, match]));
  const candidates = baseCandidates
    .map((candidate) => {
      const ai = aiByTeacher.get(candidate.teacherUid);
      return {
        ...candidate,
        score: Math.max(candidate.score, Number(ai?.score || 0)),
        aiReason: clean(ai?.reason, 500),
        aiRisks: Array.isArray(ai?.risks) ? ai.risks.map((item) => clean(item, 180)).filter(Boolean) : [],
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const runRef = await db.collection('matchingRuns').add({
    requestId,
    reason,
    status: candidates.length ? 'completed' : 'no_match',
    profile,
    candidatesCount: candidates.length,
    aiUsed: Boolean(aiResult),
    aiError,
    createdAt: now(),
  });

  const batch = db.batch();
  candidates.forEach((candidate, index) => {
    const ref = db.collection('solicitudMatches').doc(`${requestId}_${candidate.teacherUid}`);
    batch.set(ref, {
      requestId,
      solicitud_id: requestId,
      runId: runRef.id,
      teacherUid: candidate.teacherUid,
      profesor_id: candidate.teacherUid,
      teacherUserUid: candidate.userUid,
      teacherName: candidate.nombre,
      nombreProfesor: candidate.nombre,
      teacherEmail: candidate.email,
      score: candidate.score,
      rank: index + 1,
      reasons: candidate.aiReason ? [candidate.aiReason, ...candidate.reasons] : candidate.reasons,
      risks: uniq([...(candidate.aiRisks || []), ...candidate.risks]),
      subjectMatch: profile.subject,
      levelMatch: profile.level,
      status: 'propuesto',
      estado: 'propuesto',
      createdAt: now(),
      updatedAt: now(),
    }, { merge: true });
  });

  batch.update(db.collection('solicitudes').doc(requestId), {
    matchStatus: candidates.length ? 'ready' : 'no_match',
    bestTeacherUid: candidates[0]?.teacherUid || null,
    bestScore: candidates[0]?.score || 0,
    matchRunId: runRef.id,
    matchComputedAt: now(),
    updatedAt: now(),
    updated_at: new Date().toISOString(),
  });
  await batch.commit();

  await db.collection('automationEvents').add({
    type: 'matching_generated',
    requestId,
    runId: runRef.id,
    candidatesCount: candidates.length,
    bestTeacherUid: candidates[0]?.teacherUid || null,
    bestScore: candidates[0]?.score || 0,
    aiUsed: Boolean(aiResult),
    aiError,
    createdAt: now(),
  });

  if (!candidates.length) {
    await notifyAdmins('Solicitud sin match automatico', `No hay candidatos claros para ${profile.subject || 'la solicitud'} (${profile.level || 'nivel sin indicar'}).`, {
      type: 'matching_no_match',
      requestId,
    });
  }

  return { runId: runRef.id, candidates };
}

async function dispatchSystemJob(job) {
  const type = clean(job.data.type, 120);
  const payload = job.data.payload || {};

  if (type === 'noop') return { skipped: true, reason: 'noop' };

  if (type === 'notification.admin') {
    await notifyAdmins(
      payload.title || 'ClasesDe10',
      payload.body || '',
      payload.payload || { type: 'automation' },
    );
    return { notified: 'admin' };
  }

  if (type === 'notification.internal') {
    const userUid = clean(payload.userUid || payload.usuario_id, 180);
    const notificationPayload = payload.payload || { type: payload.type || 'automation' };
    const key = payload.idempotencyKey || job.data.idempotencyKey || `job_${job.id}`;
    const created = await writeNotificationOnce(
      userUid,
      payload.title || payload.titulo || 'ClasesDe10',
      payload.body || payload.cuerpo || '',
      notificationPayload,
      key,
      payload.extra || {},
    );
    return { notified: userUid, created };
  }

  if (type === 'matching.request') {
    const requestId = clean(payload.requestId || payload.solicitud_id, 180);
    if (!requestId) throw new Error('matching.request requires requestId.');
    const requestSnap = await db.collection('solicitudes').doc(requestId).get();
    if (!requestSnap.exists) return { skipped: true, reason: 'request_not_found', requestId };
    const request = requestSnap.data();
    if (request.matchStatus === 'ready' && request.matchRunId) {
      return { skipped: true, reason: 'already_matched', requestId };
    }

    const result = await generateMatchesForRequest(requestId, request, payload.reason || 'system_job');
    if (result?.candidates?.length) {
      await notifyAdmins('Matching listo', `${result.candidates.length} candidato(s) para ${request.materia || request.subject || 'la solicitud'}.`, {
        type: 'matching_ready',
        requestId,
        url: '/pages/login.html',
      });
    }
    return { requestId, candidatesCount: result?.candidates?.length || 0, runId: result?.runId || null };
  }

  if (type === 'metrics.snapshot') {
    const snapshot = await writeScaleMetricSnapshot(payload.source || 'system_job');
    return { alerts: snapshot.alerts.length };
  }

  if (type === 'audit.event') {
    const entityType = clean(payload.entityType, 80);
    const action = clean(payload.action, 120);
    if (!entityType || !action) throw new Error('audit.event requires entityType and action.');
    await db.collection('auditLogs').add({
      schemaVersion: 'audit_log_v1',
      module: clean(payload.module || 'automation', 80),
      severity: clean(payload.severity || 'info', 40),
      origin: clean(payload.origin || 'system_job', 80),
      source: clean(payload.source || type, 180),
      actorUid: clean(payload.actorUid || 'system', 180),
      actorEmail: clean(payload.actorEmail || '', 254),
      actorRole: clean(payload.actorRole || 'system', 80),
      actorType: clean(payload.actorType || 'automation', 80),
      responsibleUid: clean(payload.responsibleUid || payload.actorUid || 'system', 180),
      responsibleEmail: clean(payload.responsibleEmail || payload.actorEmail || '', 254),
      action,
      entityType,
      entityId: clean(payload.entityId, 180) || null,
      description: clean(payload.description || action, 500),
      before: payload.before || null,
      after: payload.after || null,
      changes: Array.isArray(payload.changes) ? payload.changes.slice(0, 80) : [],
      metadata: payload.metadata || {},
      context: payload.context || {},
      error: payload.error || null,
      trace: job.data.trace || null,
      createdAt: now(),
      created_at: new Date().toISOString(),
      updatedAt: now(),
    });
    return { audited: true, entityType, action };
  }

  throw new Error(`Unsupported system job type: ${type}`);
}

exports.processSystemJobs = onSchedule({
  region: REGION,
  schedule: 'every 5 minutes',
  timeZone: 'Europe/Madrid',
}, async () => {
  const workerId = `systemJobs-${Date.now().toString(36)}`;
  const platformConfig = await loadPlatformConfig();
  const batchLimit = Math.max(1, Math.min(500, configNumber(platformConfig, 'automation.systemJobBatchLimit', SYSTEM_JOB_BATCH_LIMIT)));
  let snap;
  try {
    snap = await db.collection('systemJobs')
      .where('status', '==', 'queued')
      .where('runAt', '<=', admin.firestore.Timestamp.now())
      .orderBy('runAt', 'asc')
      .orderBy('priority', 'desc')
      .limit(batchLimit)
      .get();
  } catch (error) {
    logger.error('processSystemJobs query failed', { message: error.message });
    await db.collection('automationEvents').add({
      type: 'system_jobs_query_failed',
      error: serializeJobError(error),
      createdAt: now(),
    });
    return;
  }

  let processed = 0;
  let failed = 0;
  for (const doc of snap.docs) {
    const claimed = await claimSystemJob(doc.ref, workerId);
    if (!claimed) continue;

    try {
      const result = await dispatchSystemJob(claimed);
      await completeSystemJob(claimed, result);
      processed += 1;
    } catch (error) {
      logger.warn('processSystemJobs job failed', { jobId: claimed.id, type: claimed.data.type, message: error.message });
      await failSystemJob(claimed, error);
      failed += 1;
    }
  }

  await db.collection('automationEvents').add({
    type: 'system_jobs_processed',
    workerId,
    scanned: snap.size,
    processed,
    failed,
    createdAt: now(),
  });
  logger.info('processSystemJobs completed', { workerId, scanned: snap.size, processed, failed });
});

exports.rollupScaleMetrics = onSchedule({
  region: REGION,
  schedule: 'every 15 minutes',
  timeZone: 'Europe/Madrid',
}, async () => {
  const snapshot = await writeScaleMetricSnapshot('scheduled_rollup');
  if (snapshot.alerts.some((alert) => alert.level === 'critical')) {
    await notifyAdmins('Alerta operativa critica', 'Hay alertas criticas en el snapshot de escalabilidad.', {
      type: 'automation',
      alertTypes: snapshot.alerts.map((alert) => alert.type),
      url: '/pages/login.html',
    });
  }
  logger.info('rollupScaleMetrics completed', { alerts: snapshot.alerts.length });
});

exports.processPublicLead = onDocumentCreated({
  region: REGION,
  document: 'leadsPublicos/{leadId}',
}, async (event) => {
  const leadId = event.params.leadId;
  const lead = event.data.data();
  const type = clean(lead.tipo, 30);

  await db.collection('automationEvents').add({
    type: 'lead_received',
    leadId,
    leadType: type,
    createdAt: now(),
  });

  if (type === 'profesor') {
    const price = calculateTeacherPrice({ ...lead, ...(lead.metadata || {}) });
    const diagnostic = teacherDiagnostic({ ...lead, ...(lead.metadata || {}) }, price);
    await event.data.ref.update({
      suggestedHourlyRate: price,
      diagnostico: diagnostic,
      automationStatus: 'review_teacher_lead',
      updatedAt: now(),
    });
    await notifyAdmins('Nuevo profesor interesado', `${lead.nombre || lead.email || 'Profesor'} envio una solicitud publica. Precio sugerido: ${price} EUR/h.`, {
      type: 'teacher_lead',
      leadId,
    });
    return;
  }

  if (type === 'familia') {
    const requestRef = db.collection('solicitudes').doc(`lead_${leadId}`);
    const requestPayload = leadToPublicRequest(leadId, lead);
    await requestRef.set(requestPayload, { merge: true });
    await event.data.ref.update({
      automationStatus: 'request_created',
      solicitudId: requestRef.id,
      diagnostico: studentDiagnostic({ ...lead, ...(lead.metadata || {}) }),
      updatedAt: now(),
    });
    await notifyAdmins('Nueva familia solicita profesor', `${lead.nombre || lead.email || 'Familia'} solicito ${requestPayload.materia || 'materia sin indicar'}.`, {
      type: 'family_lead_request',
      leadId,
      requestId: requestRef.id,
    });
    return;
  }

  await notifyAdmins('Nuevo contacto publico', `${lead.nombre || lead.email || 'Contacto'} envio un mensaje.`, {
    type: 'contact_lead',
    leadId,
  });
});

exports.stripeWebhook = onRequest({
  region: REGION,
  secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET],
}, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const signature = req.headers['stripe-signature'];
  if (!signature) {
    res.status(400).send('Missing Stripe signature');
    return;
  }

  let event;
  try {
    const stripe = Stripe(STRIPE_SECRET_KEY.value());
    event = stripe.webhooks.constructEvent(req.rawBody, signature, STRIPE_WEBHOOK_SECRET.value());
  } catch (error) {
    logger.warn('Stripe webhook signature failed', { message: error.message });
    res.status(400).send(`Webhook Error: ${error.message}`);
    return;
  }

  const relevant = [
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'charge.dispute.created',
  ];
  if (!relevant.includes(event.type)) {
    res.json({ received: true, ignored: true });
    return;
  }

  const paymentRef = await findPaymentRefByStripeObject(event.data.object);
  if (!paymentRef) {
    await db.collection('automationEvents').add({
      type: 'stripe_webhook_unmatched',
      gatewayEventId: event.id,
      gatewayEventType: event.type,
      createdAt: now(),
    });
    res.json({ received: true, matched: false });
    return;
  }

  const update = stripePaymentUpdate(event);
  await paymentRef.set(update, { merge: true });
  const reconciliation = await reconcilePaymentRef(paymentRef);
  await db.collection('automationEvents').doc(`stripe_${event.id}`).set({
    type: 'stripe_webhook_processed',
    paymentId: paymentRef.id,
    gatewayEventId: event.id,
    gatewayEventType: event.type,
    reconciliation,
    createdAt: now(),
  }, { merge: true });

  res.json({ received: true, paymentId: paymentRef.id, reconciliation });
});

exports.generateRequestMatching = onDocumentCreated({
  region: REGION,
  document: 'solicitudes/{requestId}',
}, async (event) => {
  const requestId = event.params.requestId;
  const request = event.data.data();
  if ((request.matchStatus || '') === 'ready') return;
  await materializeAutomationPlan({
    type: 'request.created',
    entityType: 'solicitudes',
    entityId: requestId,
    data: { id: requestId, ...request },
    source: 'solicitudes.onCreate',
  });
});

exports.createAssignmentOnRequestAssigned = onDocumentUpdated({
  region: REGION,
  document: 'solicitudes/{requestId}',
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const requestId = event.params.requestId;
  const beforeTeacher = before.assignedTeacherUid || before.profesor_asignado_id;
  const teacherUid = after.assignedTeacherUid || after.profesor_asignado_id;
  const status = after.status || after.estado;

  if (!teacherUid || beforeTeacher === teacherUid || !['asignada', 'asignado'].includes(status)) return;

  const studentId = after.studentId || after.alumno_id;
  const familyUid = after.familyUid || after.familia_id || null;
  const assignmentId = `${requestId}_${teacherUid}`;
  await db.collection('asignaciones').doc(assignmentId).set({
    requestId,
    solicitud_id: requestId,
    teacherUid,
    profesor_id: teacherUid,
    studentId: studentId || null,
    alumno_id: studentId || null,
    familyUid,
    familia_id: familyUid,
    materia: after.materia || after.subject || '',
    active: true,
    activa: true,
    source: 'request_assignment',
    createdAt: now(),
    updatedAt: now(),
  }, { merge: true });

  await db.collection('solicitudMatches').doc(`${requestId}_${teacherUid}`).set({
    status: 'asignado',
    estado: 'asignado',
    selectedAt: now(),
    updatedAt: now(),
  }, { merge: true });

  const [teacherUserUid, familyUserUid] = await Promise.all([
    resolveUserUidFromProfile('profesores', teacherUid, after.teacherUserUid),
    resolveUserUidFromProfile('familias', familyUid, after.familyUserUid),
  ]);
  await materializeAutomationPlan({
    type: 'assignment.created',
    entityType: 'asignaciones',
    entityId: assignmentId,
    data: {
      id: assignmentId,
      requestId,
      solicitud_id: requestId,
      teacherUid,
      profesor_id: teacherUid,
      teacherUserUid,
      familyUid,
      familia_id: familyUid,
      familyUserUid,
      studentId: studentId || '',
      alumno_id: studentId || '',
      materia: after.materia || after.subject || '',
    },
    source: 'solicitudes.onAssigned',
  });
});

exports.automateClassCreated = onDocumentCreated({
  region: REGION,
  document: 'clases/{classId}',
}, async (event) => {
  const classId = event.params.classId;
  const data = event.data.data();
  const enriched = await enrichClassAutomationData(data);
  await materializeAutomationPlan({
    type: 'class.scheduled',
    entityType: 'clases',
    entityId: classId,
    data: { id: classId, ...enriched },
    source: 'clases.onCreate',
  });
});

exports.automateClassUpdated = onDocumentUpdated({
  region: REGION,
  document: 'clases/{classId}',
}, async (event) => {
  const classId = event.params.classId;
  const before = event.data.before.data();
  const after = event.data.after.data();
  const beforeStatus = statusOf(before);
  const afterStatus = statusOf(after);
  const scheduleChanged = changedAny(before, after, ['fecha', 'date', 'hora_inicio', 'startTime', 'hora_fin', 'endTime']);

  if (scheduleChanged && !['realizada', 'completada', 'cancelada'].includes(afterStatus)) {
    const enriched = await enrichClassAutomationData(after);
    await materializeAutomationPlan({
      type: 'class.rescheduled',
      entityType: 'clases',
      entityId: classId,
      data: { id: classId, ...enriched },
      source: 'clases.onUpdate',
    });
  }

  if (beforeStatus !== afterStatus && ['realizada', 'completada', 'completed'].includes(afterStatus)) {
    const enriched = await enrichClassAutomationData(after);
    await materializeAutomationPlan({
      type: 'class.completed',
      entityType: 'clases',
      entityId: classId,
      data: { id: classId, ...enriched },
      source: 'clases.onCompleted',
    });
  }

  if (beforeStatus !== afterStatus && ['cancelada', 'cancelled', 'canceled'].includes(afterStatus)) {
    const enriched = await enrichClassAutomationData(after);
    await materializeAutomationPlan({
      type: 'class.cancelled',
      entityType: 'clases',
      entityId: classId,
      data: { id: classId, ...enriched },
      source: 'clases.onCancelled',
    });
  }
});

exports.automatePaymentCreated = onDocumentCreated({
  region: REGION,
  document: 'pagos/{paymentId}',
}, async (event) => {
  const paymentId = event.params.paymentId;
  const data = event.data.data();
  const enriched = await enrichPaymentAutomationData(data);
  await materializeAutomationPlan({
    type: ['validado', 'pagado'].includes(normalizePaymentStatus(data.familyPaymentStatus || data.estado_pago_familia || data.paymentStatus || data.estado || data.status))
      ? 'payment.verified'
      : paymentIsOverdue(data) ? 'payment.overdue' : 'payment.created',
    entityType: 'pagos',
    entityId: paymentId,
    data: { id: paymentId, ...enriched },
    source: 'pagos.onCreate',
  });
});

exports.automatePaymentUpdated = onDocumentUpdated({
  region: REGION,
  document: 'pagos/{paymentId}',
}, async (event) => {
  const paymentId = event.params.paymentId;
  const before = event.data.before.data();
  const after = event.data.after.data();
  const beforeStatus = normalizePaymentStatus(before.familyPaymentStatus || before.estado_pago_familia || before.paymentStatus || before.estado || before.status);
  const afterStatus = normalizePaymentStatus(after.familyPaymentStatus || after.estado_pago_familia || after.paymentStatus || after.estado || after.status);

  if (beforeStatus !== afterStatus && ['validado', 'pagado'].includes(afterStatus)) {
    const enriched = await enrichPaymentAutomationData(after);
    await materializeAutomationPlan({
      type: 'payment.verified',
      entityType: 'pagos',
      entityId: paymentId,
      data: { id: paymentId, ...enriched },
      source: 'pagos.onVerified',
    });
  }

  if (beforeStatus !== afterStatus && afterStatus === 'vencido') {
    const enriched = await enrichPaymentAutomationData(after);
    await materializeAutomationPlan({
      type: 'payment.overdue',
      entityType: 'pagos',
      entityId: paymentId,
      data: { id: paymentId, ...enriched },
      source: 'pagos.onOverdue',
    });
  }
});

exports.scanPendingMatching = onSchedule({
  region: REGION,
  schedule: 'every 60 minutes',
  timeZone: 'Europe/Madrid',
}, async () => {
  const snap = await db.collection('solicitudes')
    .where('status', '==', 'nueva')
    .limit(25)
    .get();

  let processed = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.matchStatus === 'ready') continue;
    await enqueueSystemJob('matching.request', {
      requestId: doc.id,
      reason: 'scheduled_scan',
    }, {
      priority: 'normal',
      idempotencyKey: `matching_request_${doc.id}`,
      source: 'scanPendingMatching',
    });
    processed += 1;
  }
  logger.info('scanPendingMatching queued jobs', { processed });
});

exports.runPlatformAutomationSweep = onSchedule({
  region: REGION,
  schedule: 'every 15 minutes',
  timeZone: 'Europe/Madrid',
}, async () => {
  const stats = {
    classesChecked: 0,
    classEvents: 0,
    paymentsChecked: 0,
    paymentEvents: 0,
    requestsChecked: 0,
    requestEvents: 0,
    documentsChecked: 0,
    documentEvents: 0,
    incidentsChecked: 0,
    incidentEvents: 0,
    teachersChecked: 0,
    teacherEvents: 0,
    startedAt: new Date().toISOString(),
  };

  const classDocs = await loadDocsByStatuses('clases', ['status', 'estado'], ['programada', 'confirmada', 'pendiente_confirmacion', 'scheduled', 'confirmed'], 30);
  for (const doc of classDocs) {
    const data = doc.data();
    stats.classesChecked += 1;
    if (!classNeedsConfirmation(data)) continue;
    const enriched = await enrichClassAutomationData(data);
    await materializeAutomationPlan({
      type: 'class.confirmation_overdue',
      entityType: 'clases',
      entityId: doc.id,
      data: { id: doc.id, ...enriched },
      source: 'platformAutomationSweep',
    });
    stats.classEvents += 1;
  }

  const paymentDocs = await loadDocsByStatuses('pagos', ['status', 'estado'], ['pendiente', 'solicitado', 'procesando', 'requiere_accion'], 30);
  for (const doc of paymentDocs) {
    const data = doc.data();
    stats.paymentsChecked += 1;
    if (!paymentIsOverdue(data)) continue;
    const enriched = await enrichPaymentAutomationData(data);
    await materializeAutomationPlan({
      type: 'payment.overdue',
      entityType: 'pagos',
      entityId: doc.id,
      data: { id: doc.id, ...enriched },
      source: 'platformAutomationSweep',
    });
    stats.paymentEvents += 1;
  }

  const requestDocs = await loadDocsByStatuses('solicitudes', ['status', 'estado'], ['nueva', 'pendiente', 'pending'], 30);
  for (const doc of requestDocs) {
    const data = doc.data();
    stats.requestsChecked += 1;
    if (data.matchStatus === 'ready' || data.assignedTeacherUid || data.profesor_asignado_id) continue;
    if (!isOlderThan(data, 12 * 60 * 60 * 1000)) continue;
    await materializeAutomationPlan({
      type: 'request.stale',
      entityType: 'solicitudes',
      entityId: doc.id,
      data: { id: doc.id, ...data },
      source: 'platformAutomationSweep',
    });
    stats.requestEvents += 1;
  }

  const documentDocs = await loadDocsByStatuses('documentos', ['status', 'estado'], ['pendiente', 'pending', 'revision'], 25);
  for (const doc of documentDocs) {
    const data = doc.data();
    stats.documentsChecked += 1;
    if (!isOlderThan(data, 24 * 60 * 60 * 1000)) continue;
    await materializeAutomationPlan({
      type: 'document.stale',
      entityType: 'documentos',
      entityId: doc.id,
      data: { id: doc.id, ...data },
      source: 'platformAutomationSweep',
    });
    stats.documentEvents += 1;
  }

  const incidentDocs = await loadDocsByStatuses('incidencias', ['status', 'estado'], ['abierta', 'open', 'pendiente'], 25);
  for (const doc of incidentDocs) {
    const data = doc.data();
    stats.incidentsChecked += 1;
    if (!isOlderThan(data, 48 * 60 * 60 * 1000)) continue;
    await materializeAutomationPlan({
      type: 'incident.stale',
      entityType: 'incidencias',
      entityId: doc.id,
      data: { id: doc.id, ...data },
      source: 'platformAutomationSweep',
    });
    stats.incidentEvents += 1;
  }

  const teacherSnap = await db.collection('profesores').where('active', '==', true).limit(75).get();
  for (const doc of teacherSnap.docs) {
    const data = doc.data();
    stats.teachersChecked += 1;
    if (!teacherIsInactive(data)) continue;
    await materializeAutomationPlan({
      type: 'teacher.inactive',
      entityType: 'profesores',
      entityId: doc.id,
      data: { id: doc.id, ...data },
      source: 'platformAutomationSweep',
    });
    stats.teacherEvents += 1;
  }

  await db.collection('automationEvents').doc(`platform_sweep_${Date.now().toString(36)}`).set({
    type: 'platform_automation_sweep_completed',
    stats,
    version: AUTOMATION_ORCHESTRATION_VERSION,
    createdAt: now(),
    updatedAt: now(),
  });
  logger.info('runPlatformAutomationSweep completed', stats);
});

exports.generateMonthlySummary = onSchedule({
  region: REGION,
  schedule: '0 8 1 * *',
  timeZone: 'Europe/Madrid',
}, async () => {
  const nowDate = new Date();
  const previousMonthDate = new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 1);
  const month = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const nextMonthDate = new Date(previousMonthDate.getFullYear(), previousMonthDate.getMonth() + 1, 1);
  const monthStart = `${month}-01`;
  const nextMonth = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
  const classesSnap = await db.collection('clases')
    .where('fecha', '>=', monthStart)
    .where('fecha', '<', nextMonth)
    .limit(20000)
    .get();
  const summary = {
    month,
    classes: 0,
    teacherTotals: {},
    familyTotals: {},
    createdAt: now(),
  };

  classesSnap.docs.forEach((doc) => {
    const data = doc.data();
    const date = clean(data.fecha || data.date);
    if (!date.startsWith(month)) return;
    if (!['realizada', 'completada'].includes(data.estado || data.status)) return;
    summary.classes += 1;
    const teacherUid = data.teacherUid || data.profesor_id || 'sin_profesor';
    const familyUid = data.familyUid || data.familia_id || 'sin_familia';
    summary.teacherTotals[teacherUid] = (summary.teacherTotals[teacherUid] || 0) + Number(data.importe_profesor || data.teacherAmount || 0);
    summary.familyTotals[familyUid] = (summary.familyTotals[familyUid] || 0) + Number(data.precio_total || data.amount || 0);
  });

  await db.collection('resumenMensual').doc(month).set(summary, { merge: true });
  await notifyAdmins('Resumen mensual generado', `Resumen ${month}: ${summary.classes} clase(s) procesadas.`, {
    type: 'monthly_summary',
    month,
  });
});
