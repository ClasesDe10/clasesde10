#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  SCALE_ENGINE_VERSION,
  SYSTEM_JOB_STATUSES,
  aggregateScaleMetrics,
  buildAuditEvent,
  buildAdminScaleChecklist,
  buildIdempotencyKey,
  buildQueryBudget,
  buildRetentionPlan,
  buildScaleAlerts,
  buildSystemJob,
  buildTraceContext,
  collectionScalePolicy,
  completeSystemJob,
  defaultReadLimit,
  failSystemJob,
  leaseSystemJob,
  nextRetryDelayMs,
  realtimeReadLimit,
  scalePartitionKeys,
  shouldSampleTrace,
} from '../js/scale-engine.js';

const now = new Date('2026-06-28T10:00:00.000Z');

const trace = buildTraceContext({
  source: 'test',
  entityType: 'payment',
  entityId: 'pay_1',
  now,
});
assert.equal(trace.version, SCALE_ENGINE_VERSION);
assert.ok(trace.traceId.startsWith('tr_'));

const keyA = buildIdempotencyKey('notification.internal', { userUid: 'u1', classId: 'c1' });
const keyB = buildIdempotencyKey('notification.internal', { classId: 'c1', userUid: 'u1' });
assert.equal(keyA, keyB, 'Idempotency keys must be stable regardless of object key order.');

const classPolicy = collectionScalePolicy('clases');
assert.equal(classPolicy.partition, 'month');
assert.equal(defaultReadLimit('clases', 999999), classPolicy.readLimit);
assert.equal(realtimeReadLimit('notificaciones', 999999), collectionScalePolicy('notificaciones').realtimeLimit);

const partition = scalePartitionKeys('2026-07-01T17:00:00.000Z', 'class_1');
assert.equal(partition.month, '2026-07');
assert.equal(partition.day, '2026-07-01');
assert.ok(/^s\d{2}$/.test(partition.scaleShard));

const riskyQuery = buildQueryBudget({ collectionName: 'clases', requestedLimit: null, filters: [], orderField: 'fecha' });
assert.ok(riskyQuery.risks.includes('missing_explicit_limit'));
assert.ok(riskyQuery.risks.includes('missing_time_partition'));

const scalableQuery = buildQueryBudget({
  collectionName: 'clases',
  requestedLimit: 100,
  filters: [{ field: 'month' }, { field: 'teacherUid' }],
  orderField: 'startAtIso',
  hasCursor: true,
});
assert.equal(scalableQuery.scalable, true);

const retention = buildRetentionPlan('analyticsEvents', now);
assert.equal(retention.action, 'archive_or_delete');
assert.ok(retention.deleteBefore);

const job = buildSystemJob({
  type: 'notification.internal',
  payload: { userUid: 'u1', title: 'Clase pendiente' },
  priority: 'high',
  trace,
  now,
});
assert.equal(job.status, SYSTEM_JOB_STATUSES.QUEUED);
assert.equal(job.priority, 75);
assert.equal(job.attempts, 0);

const lease = leaseSystemJob(job, 'worker-a', now, 60000);
assert.equal(lease.leased, true);
assert.equal(lease.patch.status, SYSTEM_JOB_STATUSES.PROCESSING);
assert.equal(lease.patch.attempts, 1);

const blockedLease = leaseSystemJob({ ...job, ...lease.patch }, 'worker-b', new Date('2026-06-28T10:00:10.000Z'), 60000);
assert.equal(blockedLease.leased, false);
assert.equal(blockedLease.reason, 'active_lease');

const completed = completeSystemJob({ ...job, ...lease.patch }, { sent: 1 }, now);
assert.equal(completed.status, SYSTEM_JOB_STATUSES.COMPLETED);
assert.equal(completed.result.sent, 1);

assert.equal(nextRetryDelayMs(1), 60000);
assert.equal(nextRetryDelayMs(2), 120000);

const retry = failSystemJob({ ...job, attempts: 2, maxAttempts: 4 }, new Error('Temporary outage'), now);
assert.equal(retry.status, SYSTEM_JOB_STATUSES.QUEUED);
assert.ok(retry.runAt.endsWith('10:02:00.000Z'));
assert.equal(retry.lastError.message, 'Temporary outage');

const dead = failSystemJob({ ...job, attempts: 4, maxAttempts: 4 }, new Error('Permanent outage'), now);
assert.equal(dead.status, SYSTEM_JOB_STATUSES.DEAD_LETTER);
assert.equal(dead.lastError.message, 'Permanent outage');

const audit = buildAuditEvent({
  actorUid: 'admin',
  action: 'payment.update',
  entityType: 'payment',
  entityId: 'pay_1',
  before: { status: 'pendiente', token: 'secret-token' },
  after: { status: 'validado', cardNumber: '4111111111111111' },
  now,
});
assert.equal(audit.before.token, '[redacted]');
assert.equal(audit.after.cardNumber, '[redacted]');

const metrics = aggregateScaleMetrics({
  users: [{ role: 'admin' }, { role: 'familia' }, { role: 'profesor', active: false }],
  classes: [{ estado: 'programada' }, { lifecycleStatus: 'pendiente_confirmacion' }],
  payments: [{ status: 'pendiente' }, { status: 'vencido' }],
  notifications: [{ type: 'chat', readAt: null }, { type: 'chat', leida: true }],
  jobs: [{ status: 'queued' }, { status: 'dead_letter' }],
  incidents: [{ status: 'abierta', priority: 'critical' }, { status: 'cerrada' }],
}, now);
assert.equal(metrics.users.total, 3);
assert.equal(metrics.users.active, 2);
assert.equal(metrics.payments.pending, 1);
assert.equal(metrics.payments.overdue, 1);
assert.equal(metrics.jobs.deadLetter, 1);

const alerts = buildScaleAlerts({ ...metrics, jobs: { ...metrics.jobs, queued: 501 } });
assert.ok(alerts.some((alert) => alert.type === 'job_backlog'));
assert.ok(alerts.some((alert) => alert.type === 'dead_letters'));
const checklist = buildAdminScaleChecklist({ ...metrics, jobs: { ...metrics.jobs, queued: 300 } });
assert.ok(checklist.some((item) => item.type === 'jobs'));
assert.ok(shouldSampleTrace(1, 'any-key'));
assert.equal(shouldSampleTrace(0, 'any-key'), false);

console.log(JSON.stringify({
  ok: true,
  version: SCALE_ENGINE_VERSION,
  alerts: alerts.map((alert) => alert.type),
}, null, 2));
