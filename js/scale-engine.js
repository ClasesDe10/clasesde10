export const SCALE_ENGINE_VERSION = 'scale-engine-2026-06-29';

export const SYSTEM_JOB_STATUSES = Object.freeze({
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  DEAD_LETTER: 'dead_letter',
  CANCELLED: 'cancelled',
});

export const SYSTEM_JOB_PRIORITIES = Object.freeze({
  LOW: 25,
  NORMAL: 50,
  HIGH: 75,
  CRITICAL: 100,
});

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LEASE_MS = 10 * 60 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;
const SENSITIVE_KEY_PATTERN = /(password|secret|token|credential|authorization|cookie|iban|card|cvv|api[_-]?key)/i;

export const SCALE_COLLECTION_POLICIES = Object.freeze({
  users: { readLimit: 1000, realtimeLimit: 20, orderField: 'updatedAt', retentionDays: null, partition: 'none', ownerField: 'uid' },
  profesores: { readLimit: 1200, realtimeLimit: 20, orderField: 'updatedAt', retentionDays: null, partition: 'none', ownerField: 'userUid' },
  familias: { readLimit: 1200, realtimeLimit: 20, orderField: 'updatedAt', retentionDays: null, partition: 'none', ownerField: 'userUid' },
  alumnos: { readLimit: 1600, realtimeLimit: 20, orderField: 'updatedAt', retentionDays: null, partition: 'none', ownerField: 'familyUid' },
  solicitudes: { readLimit: 1200, realtimeLimit: 25, orderField: 'createdAt', retentionDays: 1095, partition: 'month', ownerField: 'familyUid' },
  asignaciones: { readLimit: 1600, realtimeLimit: 20, orderField: 'updatedAt', retentionDays: null, partition: 'none', ownerField: 'familyUid' },
  chats: { readLimit: 900, realtimeLimit: 20, orderField: 'updatedAt', retentionDays: null, partition: 'none', ownerField: 'participantUids' },
  mensajes: { readLimit: 250, realtimeLimit: 50, orderField: 'createdAt', retentionDays: 1095, partition: 'month', ownerField: 'chatId' },
  clases: { readLimit: 2000, realtimeLimit: 25, orderField: 'startAtIso', retentionDays: 1825, partition: 'month', ownerField: 'assignmentId' },
  pagos: { readLimit: 2000, realtimeLimit: 25, orderField: 'dueAt', retentionDays: 2555, partition: 'month', ownerField: 'familyUid' },
  documentos: { readLimit: 900, realtimeLimit: 20, orderField: 'updatedAt', retentionDays: null, partition: 'month', ownerField: 'ownerUid' },
  notificaciones: { readLimit: 300, realtimeLimit: 100, orderField: 'createdAt', retentionDays: 365, partition: 'month', ownerField: 'userUid' },
  notificationTokens: { readLimit: 200, realtimeLimit: 20, orderField: 'updatedAt', retentionDays: null, partition: 'none', ownerField: 'userUid' },
  incidencias: { readLimit: 1200, realtimeLimit: 25, orderField: 'updatedAt', retentionDays: 2555, partition: 'month', ownerField: 'ticketId' },
  auditLogs: { readLimit: 1500, realtimeLimit: 25, orderField: 'createdAt', retentionDays: 2555, partition: 'month', ownerField: 'actorUid' },
  analyticsEvents: { readLimit: 2500, realtimeLimit: 25, orderField: 'createdAt', retentionDays: 730, partition: 'day', ownerField: 'sessionId' },
  analyticsDailyRollups: { readLimit: 400, realtimeLimit: 20, orderField: 'createdAt', retentionDays: 2555, partition: 'month', ownerField: 'scope' },
  automationEvents: { readLimit: 1000, realtimeLimit: 25, orderField: 'createdAt', retentionDays: 1095, partition: 'month', ownerField: 'type' },
  automationRuleRuns: { readLimit: 1000, realtimeLimit: 25, orderField: 'createdAt', retentionDays: 1095, partition: 'month', ownerField: 'ruleId' },
  systemJobs: { readLimit: 500, realtimeLimit: 25, orderField: 'runAt', retentionDays: 90, partition: 'day', ownerField: 'type' },
  deadLetters: { readLimit: 500, realtimeLimit: 25, orderField: 'createdAt', retentionDays: 1095, partition: 'month', ownerField: 'type' },
  metricSnapshots: { readLimit: 400, realtimeLimit: 30, orderField: 'createdAt', retentionDays: 2555, partition: 'month', ownerField: 'scope' },
  opsAlerts: { readLimit: 500, realtimeLimit: 50, orderField: 'createdAt', retentionDays: 1095, partition: 'month', ownerField: 'type' },
  platformHealthChecks: { readLimit: 300, realtimeLimit: 30, orderField: 'createdAt', retentionDays: 1095, partition: 'month', ownerField: 'scope' },
});

const DEFAULT_COLLECTION_POLICY = Object.freeze({
  readLimit: 500,
  realtimeLimit: 20,
  orderField: 'createdAt',
  retentionDays: 1095,
  partition: 'month',
  ownerField: 'id',
});

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(value = new Date()) {
  const date = parseDate(value) || new Date();
  return date.toISOString();
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function hashString(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function buildIdempotencyKey(...parts) {
  const normalized = parts
    .flat()
    .filter((part) => part !== undefined && part !== null && part !== '')
    .map((part) => (typeof part === 'object' ? stableStringify(part) : clean(part, 300)))
    .join('|');
  return hashString(normalized || 'empty');
}

export function collectionScalePolicy(collectionName) {
  const key = clean(collectionName, 120);
  return {
    collection: key,
    ...DEFAULT_COLLECTION_POLICY,
    ...(SCALE_COLLECTION_POLICIES[key] || {}),
  };
}

export function defaultReadLimit(collectionName, requestedLimit = null) {
  const policy = collectionScalePolicy(collectionName);
  const requested = Number(requestedLimit);
  if (Number.isFinite(requested) && requested > 0) return Math.min(Math.round(requested), Math.max(policy.readLimit, 1));
  return policy.readLimit;
}

export function realtimeReadLimit(collectionName, requestedLimit = null) {
  const policy = collectionScalePolicy(collectionName);
  const requested = Number(requestedLimit);
  if (Number.isFinite(requested) && requested > 0) return Math.min(Math.round(requested), Math.max(policy.realtimeLimit, 1));
  return policy.realtimeLimit;
}

export function scalePartitionKeys(value = new Date(), seed = '') {
  const date = parseDate(value) || new Date();
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const month = `${yyyy}-${mm}`;
  const day = `${month}-${dd}`;
  const shard = parseInt(buildIdempotencyKey(seed || day).slice(0, 4), 36) % 16;
  return {
    day,
    month,
    partitionKey: month,
    dayPartitionKey: day,
    scaleShard: `s${String(shard).padStart(2, '0')}`,
  };
}

export function buildQueryBudget({
  collectionName,
  requestedLimit = null,
  realtime = false,
  filters = [],
  orderField = '',
  hasCursor = false,
  purpose = 'runtime',
} = {}) {
  const policy = collectionScalePolicy(collectionName);
  const effectiveLimit = realtime
    ? realtimeReadLimit(collectionName, requestedLimit)
    : defaultReadLimit(collectionName, requestedLimit);
  const filterFields = filters.map((item) => clean(item.field || item.fieldPath || item, 120)).filter(Boolean);
  const partitioned = policy.partition === 'none'
    || filterFields.includes('month')
    || filterFields.includes('day')
    || filterFields.includes('partitionKey')
    || filterFields.includes('dayPartitionKey');
  const ordered = !policy.orderField || clean(orderField, 120) === policy.orderField || filterFields.includes(policy.orderField);
  const risks = [];
  if (!Number.isFinite(Number(requestedLimit)) || Number(requestedLimit) <= 0) risks.push('missing_explicit_limit');
  if (!partitioned) risks.push('missing_time_partition');
  if (!ordered) risks.push(`missing_order_${policy.orderField}`);
  if (!hasCursor && effectiveLimit >= policy.readLimit && policy.readLimit >= 1000) risks.push('cursor_recommended');
  return {
    collection: policy.collection,
    purpose: clean(purpose, 120) || 'runtime',
    effectiveLimit,
    realtimeLimit: policy.realtimeLimit,
    recommendedOrderField: policy.orderField,
    partition: policy.partition,
    retentionDays: policy.retentionDays,
    risks,
    scalable: risks.length === 0 || risks.every((risk) => risk === 'cursor_recommended'),
    version: SCALE_ENGINE_VERSION,
  };
}

export function buildRetentionPlan(collectionName, now = new Date()) {
  const policy = collectionScalePolicy(collectionName);
  if (!policy.retentionDays) {
    return { collection: policy.collection, retentionDays: null, deleteBefore: null, action: 'retain' };
  }
  const current = parseDate(now) || new Date();
  const deleteBefore = new Date(current.getTime() - policy.retentionDays * 24 * 60 * 60 * 1000);
  return {
    collection: policy.collection,
    retentionDays: policy.retentionDays,
    deleteBefore: iso(deleteBefore),
    partition: policy.partition,
    action: 'archive_or_delete',
  };
}

export function buildAdminScaleChecklist(metrics = {}) {
  const queued = Number(metrics.jobs?.queued || 0);
  const deadLetter = Number(metrics.jobs?.deadLetter || 0);
  const unread = Number(metrics.notifications?.unread || 0);
  const openIncidents = Number(metrics.incidents?.open || 0);
  return [
    queued > 250 ? { type: 'jobs', priority: 'high', action: 'Increase worker frequency or split job types before backlog reaches 500.' } : null,
    deadLetter > 0 ? { type: 'dead_letters', priority: 'critical', action: 'Review dead letters and add retry-specific fixes.' } : null,
    unread > 5000 ? { type: 'notifications', priority: 'medium', action: 'Compact old notification inboxes and rely on monthly partitions.' } : null,
    openIncidents > 50 ? { type: 'incidents', priority: 'high', action: 'Assign incident owners and enforce SLA queues.' } : null,
  ].filter(Boolean);
}

export function normalizeJobStatus(status) {
  const value = clean(status, 40).toLowerCase();
  if (['queued', 'pending', 'retry'].includes(value)) return SYSTEM_JOB_STATUSES.QUEUED;
  if (['processing', 'running', 'leased'].includes(value)) return SYSTEM_JOB_STATUSES.PROCESSING;
  if (['completed', 'done', 'success'].includes(value)) return SYSTEM_JOB_STATUSES.COMPLETED;
  if (['dead_letter', 'dead-letter', 'failed_permanently'].includes(value)) return SYSTEM_JOB_STATUSES.DEAD_LETTER;
  if (['cancelled', 'canceled'].includes(value)) return SYSTEM_JOB_STATUSES.CANCELLED;
  return SYSTEM_JOB_STATUSES.QUEUED;
}

export function normalizePriority(priority) {
  if (typeof priority === 'number' && Number.isFinite(priority)) {
    return Math.max(0, Math.min(100, Math.round(priority)));
  }
  const value = clean(priority, 40).toLowerCase();
  if (value === 'critical') return SYSTEM_JOB_PRIORITIES.CRITICAL;
  if (value === 'high') return SYSTEM_JOB_PRIORITIES.HIGH;
  if (value === 'low') return SYSTEM_JOB_PRIORITIES.LOW;
  return SYSTEM_JOB_PRIORITIES.NORMAL;
}

export function buildTraceContext({
  source = 'system',
  entityType = '',
  entityId = '',
  parentTraceId = '',
  now = new Date(),
} = {}) {
  const seed = [source, entityType, entityId, parentTraceId, iso(now)].join('|');
  return {
    traceId: parentTraceId || `tr_${buildIdempotencyKey(seed)}`,
    parentTraceId: clean(parentTraceId, 180) || null,
    source: clean(source, 120) || 'system',
    entityType: clean(entityType, 80) || null,
    entityId: clean(entityId, 180) || null,
    sampledAt: iso(now),
    version: SCALE_ENGINE_VERSION,
  };
}

export function buildSystemJob({
  type,
  payload = {},
  runAt = new Date(),
  priority = SYSTEM_JOB_PRIORITIES.NORMAL,
  source = 'system',
  trace = null,
  traceId = '',
  idempotencyKey = '',
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  now = new Date(),
} = {}) {
  const jobType = clean(type, 120);
  if (!jobType) throw new Error('System job type is required.');
  const finalTrace = trace || buildTraceContext({ source, entityType: 'systemJob', entityId: jobType, parentTraceId: traceId, now });
  return {
    type: jobType,
    payload,
    status: SYSTEM_JOB_STATUSES.QUEUED,
    priority: normalizePriority(priority),
    runAt: iso(runAt),
    attempts: 0,
    maxAttempts: Math.max(1, Number(maxAttempts) || DEFAULT_MAX_ATTEMPTS),
    idempotencyKey: clean(idempotencyKey || buildIdempotencyKey(jobType, payload), 300),
    trace: finalTrace,
    source: clean(source, 120) || 'system',
    createdAt: iso(now),
    updatedAt: iso(now),
    version: SCALE_ENGINE_VERSION,
  };
}

export function leaseSystemJob(job, workerId, now = new Date(), leaseMs = DEFAULT_LEASE_MS) {
  const data = job || {};
  const currentStatus = normalizeJobStatus(data.status);
  const leaseUntil = parseDate(data.leaseUntil);
  const currentTime = parseDate(now) || new Date();
  if (currentStatus === SYSTEM_JOB_STATUSES.PROCESSING && leaseUntil && leaseUntil > currentTime) {
    return { leased: false, reason: 'active_lease' };
  }
  if (![SYSTEM_JOB_STATUSES.QUEUED, SYSTEM_JOB_STATUSES.PROCESSING].includes(currentStatus)) {
    return { leased: false, reason: `status_${currentStatus}` };
  }

  const attempts = Math.max(0, Number(data.attempts || 0)) + 1;
  return {
    leased: true,
    patch: {
      status: SYSTEM_JOB_STATUSES.PROCESSING,
      attempts,
      workerId: clean(workerId, 120) || 'worker',
      startedAt: iso(currentTime),
      leaseUntil: iso(new Date(currentTime.getTime() + leaseMs)),
      updatedAt: iso(currentTime),
    },
  };
}

export function completeSystemJob(job, result = {}, now = new Date()) {
  const currentTime = parseDate(now) || new Date();
  return {
    status: SYSTEM_JOB_STATUSES.COMPLETED,
    completedAt: iso(currentTime),
    leaseUntil: null,
    result,
    updatedAt: iso(currentTime),
  };
}

export function nextRetryDelayMs(attempts) {
  const safeAttempts = Math.max(1, Number(attempts) || 1);
  return Math.min(MAX_BACKOFF_MS, Math.round((2 ** (safeAttempts - 1)) * 60 * 1000));
}

export function failSystemJob(job, error, now = new Date()) {
  const currentTime = parseDate(now) || new Date();
  const attempts = Math.max(1, Number(job?.attempts || 1));
  const maxAttempts = Math.max(1, Number(job?.maxAttempts || DEFAULT_MAX_ATTEMPTS));
  const finalError = {
    message: clean(error?.message || error, 1000) || 'Unknown error',
    code: clean(error?.code || error?.name || '', 120) || null,
    stack: clean(error?.stack || '', 2000) || null,
    at: iso(currentTime),
  };

  if (attempts >= maxAttempts) {
    return {
      status: SYSTEM_JOB_STATUSES.DEAD_LETTER,
      deadLetterAt: iso(currentTime),
      leaseUntil: null,
      lastError: finalError,
      updatedAt: iso(currentTime),
    };
  }

  const delayMs = nextRetryDelayMs(attempts);
  return {
    status: SYSTEM_JOB_STATUSES.QUEUED,
    runAt: iso(new Date(currentTime.getTime() + delayMs)),
    leaseUntil: null,
    lastError: finalError,
    updatedAt: iso(currentTime),
  };
}

export function redactSensitive(value) {
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : redactSensitive(item),
  ]));
}

export function buildAuditEvent({
  actorUid = 'system',
  action,
  entityType,
  entityId,
  before = null,
  after = null,
  trace = null,
  metadata = {},
  now = new Date(),
} = {}) {
  const finalAction = clean(action, 120);
  const finalEntityType = clean(entityType, 80);
  if (!finalAction || !finalEntityType) throw new Error('Audit action and entityType are required.');
  return {
    actorUid: clean(actorUid, 180) || 'system',
    action: finalAction,
    entityType: finalEntityType,
    entityId: clean(entityId, 180) || null,
    before: before === null ? null : redactSensitive(before),
    after: after === null ? null : redactSensitive(after),
    metadata: redactSensitive(metadata),
    trace: trace || buildTraceContext({ source: 'audit', entityType: finalEntityType, entityId, now }),
    createdAt: iso(now),
    version: SCALE_ENGINE_VERSION,
  };
}

function countBy(items, getter) {
  return items.reduce((acc, item) => {
    const key = clean(getter(item), 80) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

export function aggregateScaleMetrics(data = {}, now = new Date()) {
  const users = data.users || [];
  const classes = data.classes || data.clases || [];
  const payments = data.payments || data.pagos || [];
  const notifications = data.notifications || data.notificaciones || [];
  const jobs = data.jobs || data.systemJobs || [];
  const incidents = data.incidents || data.incidencias || [];

  return {
    generatedAt: iso(now),
    users: {
      total: users.length,
      active: users.filter((item) => item.active !== false && item.activo !== false).length,
      byRole: countBy(users, (item) => item.role || item.rol),
    },
    classes: {
      total: classes.length,
      byStatus: countBy(classes, (item) => item.lifecycleStatus || item.estado || item.status),
      pendingConfirmation: classes.filter((item) => /pendiente/i.test(clean(item.attendanceStatus || item.lifecycleStatus || item.status || item.estado))).length,
    },
    payments: {
      total: payments.length,
      byStatus: countBy(payments, (item) => item.estado || item.status || item.paymentStatus),
      pending: payments.filter((item) => ['pendiente', 'solicitado', 'procesando'].includes(clean(item.estado || item.status || item.paymentStatus).toLowerCase())).length,
      overdue: payments.filter((item) => ['vencido', 'overdue'].includes(clean(item.estado || item.status || item.paymentStatus).toLowerCase())).length,
    },
    notifications: {
      total: notifications.length,
      unread: notifications.filter((item) => item.readAt == null && item.leida !== true).length,
      byType: countBy(notifications, (item) => item.type || item.tipo),
    },
    jobs: {
      total: jobs.length,
      byStatus: countBy(jobs, (item) => normalizeJobStatus(item.status)),
      queued: jobs.filter((item) => normalizeJobStatus(item.status) === SYSTEM_JOB_STATUSES.QUEUED).length,
      deadLetter: jobs.filter((item) => normalizeJobStatus(item.status) === SYSTEM_JOB_STATUSES.DEAD_LETTER).length,
    },
    incidents: {
      total: incidents.length,
      open: incidents.filter((item) => !['cerrada', 'resuelta', 'closed', 'resolved'].includes(clean(item.estado || item.status).toLowerCase())).length,
      byPriority: countBy(incidents, (item) => item.priority || item.prioridad),
    },
    version: SCALE_ENGINE_VERSION,
  };
}

export function buildScaleAlerts(metrics = {}) {
  const alerts = [];
  if ((metrics.jobs?.queued || 0) > 500) {
    alerts.push({ level: 'high', type: 'job_backlog', message: 'System job backlog above 500 queued jobs.' });
  }
  if ((metrics.jobs?.deadLetter || 0) > 0) {
    alerts.push({ level: 'critical', type: 'dead_letters', message: 'Dead-letter jobs require admin review.' });
  }
  if ((metrics.payments?.overdue || 0) > 0) {
    alerts.push({ level: 'high', type: 'overdue_payments', message: 'There are overdue payments.' });
  }
  if ((metrics.notifications?.unread || 0) > 10000) {
    alerts.push({ level: 'medium', type: 'notification_backlog', message: 'Unread notification backlog is high.' });
  }
  return alerts;
}

export function shouldSampleTrace(rate = 0.05, key = '') {
  const safeRate = Math.max(0, Math.min(1, Number(rate) || 0));
  if (safeRate <= 0) return false;
  if (safeRate >= 1) return true;
  const bucket = parseInt(buildIdempotencyKey(key || Date.now()).slice(0, 6), 36) % 10000;
  return bucket < safeRate * 10000;
}
