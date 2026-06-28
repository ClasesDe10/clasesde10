#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  AUTOMATION_ORCHESTRATION_VERSION,
  buildAutomationPlan,
} = require('../functions/platform-automation-engine.js');

const SUPPORTED_SYSTEM_JOBS = new Set([
  'matching.request',
  'metrics.snapshot',
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

const eventIds = new Set(requestPlan.automationEvents.map((item) => item.id));
assert.equal(eventIds.size, requestPlan.automationEvents.length, 'automation event IDs must be unique per plan');

console.log(JSON.stringify({
  ok: true,
  version: AUTOMATION_ORCHESTRATION_VERSION,
  coveredEvents: ['request.created', 'assignment.created', 'class.confirmation_overdue', 'payment.overdue', 'profile.updated'],
}, null, 2));
