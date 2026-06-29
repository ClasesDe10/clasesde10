#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

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

assertHas(overdueClassPlan.notifications, (item) => item.userUid === 'teacher_user_1' && item.type === 'class_unmarked_after_1h', 'overdue class must notify teacher');
assertHas(overdueClassPlan.notifications, (item) => item.userUid === 'family_user_1' && item.type === 'class_unmarked_after_1h', 'overdue class must notify family');
assertHas(overdueClassPlan.crmTasks, (item) => item.priority === 'high' && item.entityId === 'class_1', 'overdue class must create CRM task');
assertHas(overdueClassPlan.patches, (item) => item.collection === 'clases' && item.docId === 'class_1' && item.data.needsAttendanceConfirmation === true, 'overdue class must patch class state');
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
assertOnlySupportedJobs(paymentPlan);

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
    nombre: 'Titulo universitario',
    tipo: 'titulo',
  },
});
assertHas(documentVerifiedPlan.notifications, (item) => item.userUid === 'teacher_user_1' && item.type === 'document_verified', 'verified documents must notify owner');
assertHas(documentVerifiedPlan.automationEvents, (item) => item.type === 'trust.recalculation_requested', 'verified documents must request trust recalculation');
assertHas(documentVerifiedPlan.auditLogs, (item) => item.action === 'document.verified', 'verified documents must create audit log');
assertOnlySupportedJobs(documentVerifiedPlan);

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

const eventIds = new Set(requestPlan.automationEvents.map((item) => item.id));
assert.equal(eventIds.size, requestPlan.automationEvents.length, 'automation event IDs must be unique per plan');

const defaultRuleIds = DEFAULT_AUTOMATION_RULES.map((rule) => rule.id);
assert.equal(new Set(defaultRuleIds).size, defaultRuleIds.length, 'default automation rules must have stable unique IDs');

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
