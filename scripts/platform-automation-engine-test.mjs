#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const {
  AUTOMATION_ORCHESTRATION_VERSION,
  DEFAULT_AUTOMATION_RULES,
  EVENT_CATALOG,
  RULE_ENGINE_VERSION,
  buildAutomationPlan,
} = require('../functions/platform-automation-engine.js');

const SUPPORTED_SYSTEM_JOBS = new Set([
  'matching.request',
  'metrics.snapshot',
  'payment.request_for_class',
  'relationship.ensure_chat',
]);

const workerCode = readFileSync(new URL('./firebase-automation-worker.mjs', import.meta.url), 'utf8');

function assertHas(items, predicate, message) {
  assert.ok(items.some(predicate), message);
}

function assertOnlySupportedJobs(plan) {
  const unsupported = plan.systemJobs.filter((job) => !SUPPORTED_SYSTEM_JOBS.has(job.type));
  assert.deepEqual(unsupported, [], `Unsupported jobs emitted: ${unsupported.map((job) => job.type).join(', ')}`);
}

const requestPlan = buildAutomationPlan({
  type: 'request.created',
  entityType: 'solicitudes',
  entityId: 'req_1',
  data: {
    id: 'req_1',
    nombre: 'Familia Perez',
    materia: 'Matematicas',
    zona: 'Madrid',
    familyUid: 'family_user_1',
  },
  source: 'test',
});

assert.equal(requestPlan.version, AUTOMATION_ORCHESTRATION_VERSION);
assertHas(requestPlan.notifications, (item) => item.targetRole === 'admin' && item.type === 'request_created', 'request.created must notify admins');
assertHas(requestPlan.systemJobs, (item) => item.type === 'matching.request' && item.payload.requestId === 'req_1', 'request.created must enqueue matching');
assertHas(requestPlan.auditLogs, (item) => item.action === 'request.created', 'request.created must create audit log');
assertHas(requestPlan.ruleRuns, (item) => item.ruleId === 'request.created.core' && item.engineVersion === RULE_ENGINE_VERSION, 'request.created must record the rule that fired');
assertOnlySupportedJobs(requestPlan);

const userRegisteredPlan = buildAutomationPlan({
  type: 'user.registered',
  entityType: 'users',
  entityId: 'user_1',
  data: {
    id: 'user_1',
    nombre: 'Nuevo Usuario',
    role: 'familia',
  },
});
assertHas(userRegisteredPlan.notifications, (item) => item.targetRole === 'admin' && item.type === 'user_registered', 'registered users must notify admin');
assertHas(userRegisteredPlan.systemJobs, (item) => item.type === 'metrics.snapshot', 'registered users must refresh metrics');
assertHas(userRegisteredPlan.auditLogs, (item) => item.action === 'user.registered', 'registered users must create audit log');
assertOnlySupportedJobs(userRegisteredPlan);

const assignmentPlan = buildAutomationPlan({
  type: 'assignment.created',
  entityType: 'asignaciones',
  entityId: 'assignment_1',
  data: {
    teacherUserUid: 'teacher_user_1',
    familyUserUid: 'family_user_1',
    materia: 'Fisica',
    requestId: 'req_1',
  },
});

assertHas(assignmentPlan.notifications, (item) => item.userUid === 'teacher_user_1' && item.type === 'assignment_created', 'assignment.created must notify teacher');
assertHas(assignmentPlan.notifications, (item) => item.userUid === 'family_user_1' && item.type === 'assignment_created', 'assignment.created must notify family');
assertHas(assignmentPlan.notifications, (item) => item.targetRole === 'admin', 'assignment.created must notify admin');
assertHas(assignmentPlan.systemJobs, (item) => item.type === 'relationship.ensure_chat' && item.payload.assignmentId === 'assignment_1', 'assignment.created must enqueue chat repair/creation');
assertOnlySupportedJobs(assignmentPlan);

const overdueClassPlan = buildAutomationPlan({
  type: 'class.confirmation_overdue',
  entityType: 'clases',
  entityId: 'class_1',
  data: {
    teacherUserUid: 'teacher_user_1',
    familyUserUid: 'family_user_1',
    materia: 'Ingles',
    fecha: '2026-06-28',
    hora_inicio: '18:00',
  },
});

assertHas(overdueClassPlan.notifications, (item) => item.userUid === 'teacher_user_1' && item.type === 'class_unmarked_after_24h', 'overdue class must notify teacher after 24h');
assertHas(overdueClassPlan.notifications, (item) => item.userUid === 'family_user_1' && item.type === 'class_unmarked_after_24h', 'overdue class must notify family after 24h');
assertHas(overdueClassPlan.crmTasks, (item) => item.priority === 'high' && item.entityId === 'class_1', 'overdue class must create CRM task');
assertHas(overdueClassPlan.patches, (item) => item.collection === 'clases' && item.docId === 'class_1' && item.data.needsAttendanceConfirmation === true, 'overdue class must patch class state');
assertHas(overdueClassPlan.patches, (item) => item.collection === 'clases' && item.data.trustPenaltyEvents?.class_unmarked_teacher?.points === -2, 'overdue class must penalize teacher responsibility');
assertHas(overdueClassPlan.patches, (item) => item.collection === 'clases' && item.data.trustPenaltyEvents?.class_unmarked_family?.points === -2, 'overdue class must penalize family responsibility');
assertOnlySupportedJobs(overdueClassPlan);

const completedClassPlan = buildAutomationPlan({
  type: 'class.completed',
  entityType: 'clases',
  entityId: 'class_done_1',
  data: {
    id: 'class_done_1',
    teacherUserUid: 'teacher_user_1',
    familyUserUid: 'family_user_1',
    materia: 'Matematicas',
    fecha: '2026-07-02',
    hora_inicio: '17:00',
    paymentStatus: 'pendiente',
  },
});
assertHas(completedClassPlan.systemJobs, (item) => item.type === 'payment.request_for_class' && item.payload.classId === 'class_done_1', 'completed unpaid class must request payment automatically');
assertHas(completedClassPlan.crmTasks, (item) => item.tags.includes('pagos'), 'completed unpaid class must keep payment follow-up task');
assertOnlySupportedJobs(completedClassPlan);

const paymentPlan = buildAutomationPlan({
  type: 'payment.overdue',
  entityType: 'pagos',
  entityId: 'pay_1',
  data: {
    familyUserUid: 'family_user_1',
    amount: 80,
    status: 'pendiente',
  },
});

assertHas(paymentPlan.notifications, (item) => item.userUid === 'family_user_1' && item.type === 'payment_overdue', 'payment.overdue must notify family');
assertHas(paymentPlan.notifications, (item) => item.targetRole === 'admin' && item.priority === 'critical', 'payment.overdue must notify admin critically');
assertHas(paymentPlan.opsAlerts, (item) => item.type === 'payment_overdue', 'payment.overdue must create ops alert');
assertHas(paymentPlan.patches, (item) => item.collection === 'pagos' && item.data.status === 'vencido', 'payment.overdue must patch payment status');
assertHas(paymentPlan.patches, (item) => item.collection === 'pagos' && item.data.trustPenaltyEvents?.payment_overdue_family?.points === -2, 'payment.overdue must penalize family trust');
assertOnlySupportedJobs(paymentPlan);

const paymentCreatedPlan = buildAutomationPlan({
  type: 'payment.created',
  entityType: 'pagos',
  entityId: 'pay_new_1',
  data: {
    id: 'pay_new_1',
    familyUserUid: 'family_user_1',
    familyUid: 'family_profile_1',
    amount: 45,
    paymentType: 'family_payment',
    status: 'pendiente',
  },
});
assertHas(paymentCreatedPlan.notifications, (item) => item.targetRole === 'admin' && item.type === 'family_payment_pending', 'new family payments must notify admin');
assertHas(paymentCreatedPlan.notifications, (item) => item.userUid === 'family_user_1' && item.type === 'family_payment_pending', 'new family payments must notify family');
assertHas(paymentCreatedPlan.auditLogs, (item) => item.action === 'payment.created', 'new payments must create audit log');
assertOnlySupportedJobs(paymentCreatedPlan);

const profilePlan = buildAutomationPlan({
  type: 'profile.updated',
  entityType: 'profesores',
  entityId: 'teacher_1',
  data: {
    userType: 'profesores',
    nombre: 'Ana',
    verificationStatus: 'pendiente',
  },
});

assertHas(profilePlan.notifications, (item) => item.targetRole === 'admin' && item.type === 'verification_pending', 'pending profile updates must notify admin');
assertHas(profilePlan.crmTasks, (item) => item.tags.includes('verificacion'), 'pending profile updates must create verification task');
assertHas(profilePlan.automationEvents, (item) => item.type === 'trust.recalculation_requested', 'profile updates must request trust recalculation');
assertOnlySupportedJobs(profilePlan);

const documentExpiredPlan = buildAutomationPlan({
  type: 'document.expired',
  entityType: 'documentos',
  entityId: 'doc_1',
  data: {
    id: 'doc_1',
    ownerUid: 'teacher_user_1',
    role: 'profesor',
    nombre: 'DNI',
    tipo: 'dni',
  },
});

assertHas(documentExpiredPlan.notifications, (item) => item.userUid === 'teacher_user_1' && item.type === 'document_expired', 'expired documents must notify the owner');
assertHas(documentExpiredPlan.notifications, (item) => item.targetRole === 'admin' && item.type === 'document_expired', 'expired documents must notify admins');
assertHas(documentExpiredPlan.patches, (item) => item.collection === 'documentos' && item.data.status === 'caducado', 'expired documents must patch document status');
assertHas(documentExpiredPlan.crmTasks, (item) => item.tags.includes('caducado'), 'expired documents must create CRM follow-up task');
assertHas(documentExpiredPlan.opsAlerts, (item) => item.type === 'document_expired', 'expired documents must create ops alert');
assertOnlySupportedJobs(documentExpiredPlan);

const documentVerifiedPlan = buildAutomationPlan({
  type: 'document.verified',
  entityType: 'documentos',
  entityId: 'doc_verified_1',
  data: {
    id: 'doc_verified_1',
    ownerUid: 'teacher_user_1',
    role: 'profesor',
    nombre: 'Expediente universitario',
    tipo: 'notas_universidad',
  },
});
assertHas(documentVerifiedPlan.notifications, (item) => item.userUid === 'teacher_user_1' && item.type === 'document_verified', 'verified documents must notify owner');
assertHas(documentVerifiedPlan.automationEvents, (item) => item.type === 'trust.recalculation_requested', 'verified documents must request trust recalculation');
assertHas(documentVerifiedPlan.auditLogs, (item) => item.action === 'document.verified', 'verified documents must create audit log');
assertOnlySupportedJobs(documentVerifiedPlan);

const documentCreatedPlan = buildAutomationPlan({
  type: 'document.created',
  entityType: 'documentos',
  entityId: 'doc_new_1',
  data: {
    id: 'doc_new_1',
    ownerUid: 'teacher_user_1',
    role: 'profesor',
    nombre: 'DNI',
    tipo: 'dni',
  },
});
assertHas(documentCreatedPlan.notifications, (item) => item.targetRole === 'admin' && item.type === 'document_review_pending', 'new documents must notify admin for review');
assertHas(documentCreatedPlan.auditLogs, (item) => item.action === 'document.created', 'new documents must create audit log');
assertOnlySupportedJobs(documentCreatedPlan);

const schedulePlan = buildAutomationPlan({
  type: 'schedule.proposed',
  entityType: 'chats.programaciones',
  entityId: 'chat_1_prop_1',
  data: {
    id: 'prop_1',
    chatId: 'chat_1',
    recipientUid: 'family_user_1',
    recipientRole: 'familia',
    proposedByUid: 'teacher_user_1',
    materia: 'Matematicas',
    fecha: '2026-07-01',
    hora_inicio: '18:00',
    hora_fin: '19:00',
  },
});
assertHas(schedulePlan.notifications, (item) => item.userUid === 'family_user_1' && item.type === 'schedule_proposed', 'schedule proposals must notify the other participant');
assertHas(schedulePlan.crmTasks, (item) => item.tags.includes('calendario'), 'schedule proposals must create follow-up task');
assertHas(schedulePlan.auditLogs, (item) => item.action === 'schedule.proposed', 'schedule proposals must create audit log');
assertOnlySupportedJobs(schedulePlan);

const scheduleAcceptedPlan = buildAutomationPlan({
  type: 'schedule.accepted',
  entityType: 'chats.programaciones',
  entityId: 'chat_1_prop_1',
  data: {
    id: 'prop_1',
    chatId: 'chat_1',
    classId: 'class_1',
    proposedByUid: 'family_user_1',
    proposedByRole: 'familia',
    materia: 'Matematicas',
    fecha: '2026-07-01',
    hora_inicio: '18:00',
    hora_fin: '19:00',
  },
});
assertHas(scheduleAcceptedPlan.notifications, (item) => item.userUid === 'family_user_1' && item.type === 'schedule_accepted', 'accepted schedules must notify the proposer');
assertHas(scheduleAcceptedPlan.notifications, (item) => item.targetRole === 'admin' && item.type === 'schedule_accepted', 'accepted schedules must notify admin');
assertHas(scheduleAcceptedPlan.auditLogs, (item) => item.action === 'schedule.accepted', 'accepted schedules must create audit log');
assertOnlySupportedJobs(scheduleAcceptedPlan);

const scheduleRejectedPlan = buildAutomationPlan({
  type: 'schedule.rejected',
  entityType: 'chats.programaciones',
  entityId: 'chat_1_prop_2',
  data: {
    id: 'prop_2',
    chatId: 'chat_1',
    proposedByUid: 'teacher_user_1',
    proposedByRole: 'profesor',
    materia: 'Fisica',
    fecha: '2026-07-02',
    hora_inicio: '17:00',
    hora_fin: '18:00',
  },
});
assertHas(scheduleRejectedPlan.notifications, (item) => item.userUid === 'teacher_user_1' && item.type === 'schedule_rejected', 'rejected schedules must notify the proposer');
assertHas(scheduleRejectedPlan.crmTasks, (item) => item.tags.includes('calendario'), 'rejected schedules must create calendar follow-up task');
assertHas(scheduleRejectedPlan.auditLogs, (item) => item.action === 'schedule.rejected', 'rejected schedules must create audit log');
assertOnlySupportedJobs(scheduleRejectedPlan);

const incidentCreatedPlan = buildAutomationPlan({
  type: 'incident.created',
  entityType: 'incidencias',
  entityId: 'inc_new_1',
  data: {
    id: 'inc_new_1',
    titulo: 'Problema de pago',
    priority: 'high',
    status: 'abierta',
  },
});
assertHas(incidentCreatedPlan.notifications, (item) => item.targetRole === 'admin' && item.type === 'class_incident', 'new incidents must notify admin');
assertHas(incidentCreatedPlan.crmTasks, (item) => item.tags.includes('incidencias'), 'new incidents must create CRM follow-up');
assertHas(incidentCreatedPlan.auditLogs, (item) => item.action === 'incident.created', 'new incidents must create audit log');
assertOnlySupportedJobs(incidentCreatedPlan);

const incidentResolvedPlan = buildAutomationPlan({
  type: 'incident.resolved',
  entityType: 'incidencias',
  entityId: 'inc_1',
  data: {
    id: 'inc_1',
    titulo: 'Pago aclarado',
    status: 'resuelta',
  },
});
assertHas(incidentResolvedPlan.notifications, (item) => item.targetRole === 'admin' && item.type === 'incident_resolved', 'resolved incidents must notify admin');
assertHas(incidentResolvedPlan.auditLogs, (item) => item.action === 'incident.resolved', 'resolved incidents must create audit log');
assertOnlySupportedJobs(incidentResolvedPlan);

const reviewPlan = buildAutomationPlan({
  type: 'review.created',
  entityType: 'valoraciones',
  entityId: 'review_1',
  data: {
    id: 'review_1',
    teacherUid: 'teacher_user_1',
    rating: 5,
  },
});
assertHas(reviewPlan.automationEvents, (item) => item.type === 'trust.recalculation_requested', 'new reviews must request trust recalculation');
assertHas(reviewPlan.systemJobs, (item) => item.type === 'metrics.snapshot', 'new reviews must refresh metrics');
assertHas(reviewPlan.auditLogs, (item) => item.action === 'review.created', 'new reviews must create audit log');
assertOnlySupportedJobs(reviewPlan);

const eventIds = new Set(requestPlan.automationEvents.map((item) => item.id));
assert.equal(eventIds.size, requestPlan.automationEvents.length, 'automation event IDs must be unique per plan');

const defaultRuleIds = DEFAULT_AUTOMATION_RULES.map((rule) => rule.id);
assert.equal(new Set(defaultRuleIds).size, defaultRuleIds.length, 'default automation rules must have stable unique IDs');

assert.match(workerCode, /claimWorkerSystemJob/, 'GitHub worker must claim queued jobs transactionally.');
assert.match(workerCode, /runTransaction/, 'GitHub worker job claims must use Firestore transactions.');
assert.match(workerCode, /where\('runAt', '<=', admin\.firestore\.Timestamp\.now\(\)\)/, 'GitHub worker must query due jobs directly instead of scanning arbitrary queued jobs.');
assert.match(workerCode, /listExpiredProcessingSystemJobs/, 'GitHub worker must recover expired processing leases.');
assert.match(workerCode, /systemJobsRecoveredLeases/, 'GitHub worker must expose recovered lease counts.');
assert.match(workerCode, /systemJobsSkippedClaims/, 'GitHub worker must expose skipped concurrent claim counts.');
assert.match(workerCode, /adminNotificationDedupeKey/, 'GitHub worker admin notifications must use stable dedupe keys.');
assert.doesNotMatch(workerCode, /admins\.map\(\(user\) => writeDoc\(db\.collection\('notificaciones'\), null/, 'GitHub worker admin notifications must not use random IDs.');
assert.match(workerCode, /workerJobLeaseExpired/, 'GitHub worker must detect expired processing leases.');
assert.match(workerCode, /claimWorkerSystemJob\(db, job, workerId\)/, 'GitHub worker must claim each job through the transaction helper.');
assert.match(workerCode, /adminNotificationDedupeKey/, 'GitHub worker admin notifications must use stable dedupe keys.');
assert.match(workerCode, /notifyUserOnce\(db, user\.id/, 'GitHub worker admin notifications must be idempotent.');
assert.match(workerCode, /processPendingPushNotifications/, 'GitHub worker must deliver pending push notifications without Cloud Functions.');

for (const eventType of [
  'user.registered',
  'teacher.verified',
  'request.created',
  'class.scheduled',
  'class.rescheduled',
  'class.cancelled',
  'class.completed',
  'payment.verified',
  'payment.overdue',
  'message.received',
  'schedule.proposed',
  'schedule.accepted',
  'schedule.rejected',
  'profile.updated',
  'incident.created',
  'incident.resolved',
  'document.created',
  'document.verified',
  'document.rejected',
  'document.expiring_soon',
  'document.expired',
  'document.stale',
  'review.created',
]) {
  assertHas(EVENT_CATALOG, (item) => item.type === eventType, `Event catalog must include ${eventType}`);
}

console.log(JSON.stringify({
  ok: true,
  version: AUTOMATION_ORCHESTRATION_VERSION,
  ruleEngineVersion: RULE_ENGINE_VERSION,
  rules: DEFAULT_AUTOMATION_RULES.length,
  coveredEvents: ['request.created', 'assignment.created', 'class.confirmation_overdue', 'payment.overdue', 'profile.updated'],
}, null, 2));
