import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPlatformSupervisionPlan, PLATFORM_SUPERVISION_VERSION } from '../js/platform-supervision-engine.js';

const plan = buildPlatformSupervisionPlan({
  users: [
    { id: 'teacher_1', role: 'profesor', email: 'teacher@example.com' },
    { id: 'teacher_2', role: 'profesor', email: 'teacher2@example.com' },
    { id: 'family_1', role: 'familia', email: 'family@example.com' },
    { id: 'admin_1', role: 'admin', email: 'admin@example.com' },
    { id: 'teacher_without_profile', role: 'profesor', email: 'duplicate@example.com' },
    { id: 'family_without_profile', role: 'familia', email: 'duplicate@example.com' },
  ],
  profesores: [{ id: 'teacher_1', userUid: 'teacher_1' }, { id: 'teacher_2', userUid: 'teacher_2' }],
  familias: [{ id: 'family_1', userUid: 'family_1' }],
  alumnos: [{ id: 'student_1', familyUid: 'family_1' }],
  solicitudes: [{
    id: 'req_assigned_no_assignment',
    familyUid: 'family_1',
    studentId: 'student_1',
    assignedTeacherUid: 'teacher_2',
    status: 'asignada',
    createdAt: '2026-06-29T08:00:00.000Z',
  }, {
    id: 'req_ok',
    familyUid: 'family_1',
    studentId: 'student_1',
    assignedTeacherUid: 'teacher_1',
    status: 'asignada',
  }],
  asignaciones: [{
    id: 'assignment_without_chat',
    requestId: 'req_ok',
    familyUid: 'family_1',
    teacherUid: 'teacher_1',
    studentId: 'student_1',
    status: 'activa',
    createdAt: '2026-06-29T08:00:00.000Z',
  }, {
    id: 'assignment_duplicate',
    requestId: 'req_ok_duplicate',
    familyUid: 'family_1',
    teacherUid: 'teacher_1',
    studentId: 'student_1',
    subject: 'Matematicas',
    status: 'activa',
  }, {
    id: 'assignment_duplicate_2',
    requestId: 'req_ok_duplicate_2',
    familyUid: 'family_1',
    teacherUid: 'teacher_1',
    studentId: 'student_1',
    subject: 'Matematicas',
    status: 'activa',
  }],
  chats: [{
    id: 'chat_mismatch',
    assignmentId: 'assignment_without_chat',
    familyUid: 'other_family',
    teacherUid: 'teacher_1',
  }, {
    id: 'chat_missing_participant',
    assignmentId: 'assignment_duplicate',
    familyUid: 'family_1',
    teacherUid: 'teacher_1',
    participantUids: ['teacher_1'],
  }, {
    id: 'chat_orphan_assignment',
    assignmentId: 'assignment_deleted',
    familyUid: 'family_1',
    teacherUid: 'teacher_1',
  }],
  clases: [{
    id: 'class_completed_unpaid',
    status: 'realizada',
    familyUid: 'family_1',
    teacherUid: 'teacher_1',
    studentId: 'student_1',
    amount: 32,
    startAtIso: '2026-06-29T17:00:00.000Z',
  }, {
    id: 'class_invalid_status',
    status: 'teletransportada',
    familyUid: 'family_1',
    teacherUid: 'teacher_1',
    studentId: 'student_1',
    date: '2026-06-30',
    startTime: '18:00',
    endTime: '19:00',
  }, {
    id: 'class_invalid_lifecycle',
    status: 'confirmada',
    lifecycleStatus: 'estado_inventado',
    familyUid: 'family_1',
    teacherUid: 'teacher_1',
    studentId: 'student_1',
    date: '2026-06-30',
    startTime: '18:00',
    endTime: '19:00',
  }, {
    id: 'class_lifecycle_mismatch',
    status: 'pagada',
    lifecycleStatus: 'clase_programada',
    familyUid: 'family_1',
    teacherUid: 'teacher_1',
    studentId: 'student_1',
    date: '2026-06-30',
    startTime: '18:00',
    endTime: '19:00',
  }, {
    id: 'class_bad_time',
    status: 'confirmada',
    familyUid: 'family_1',
    teacherUid: 'teacher_1',
    studentId: 'student_1',
    date: '2026-06-30',
    startTime: '19:00',
    endTime: '18:00',
  }, {
    id: 'class_orphan_relation',
    status: 'confirmada',
    familyUid: 'family_missing',
    teacherUid: 'teacher_1',
    studentId: 'student_1',
    date: '2026-06-30',
    startTime: '18:00',
    endTime: '19:00',
  }, {
    id: 'class_paid_not_propagated',
    status: 'realizada',
    familyPaymentStatus: 'pendiente',
    familyUid: 'family_1',
    teacherUid: 'teacher_1',
    studentId: 'student_1',
    amount: 30,
    date: '2026-06-30',
    startTime: '18:00',
    endTime: '19:00',
  }, {
    id: 'class_duplicate_payment',
    status: 'realizada',
    familyUid: 'family_1',
    teacherUid: 'teacher_1',
    studentId: 'student_1',
    amount: 25,
    date: '2026-06-30',
    startTime: '18:00',
    endTime: '19:00',
  }, {
    id: 'class_missing_family',
    status: 'programada',
    teacherUid: 'teacher_1',
    studentId: 'student_1',
    startAtIso: '2026-06-30T17:00:00.000Z',
  }],
  pagos: [{
    id: 'payment_bad_class',
    status: 'pendiente',
    amount: 32,
    classIds: ['class_missing_from_db'],
    familyUid: 'family_1',
  }, {
    id: 'payment_without_link',
    status: 'pendiente',
    amount: 25,
    familyUid: 'family_1',
  }, {
    id: 'payment_invalid_status',
    status: 'casi_pagado',
    amount: 20,
    familyUid: 'family_1',
  }, {
    id: 'payment_orphan_relation',
    status: 'pendiente',
    amount: 20,
    classIds: ['class_duplicate_payment'],
    familyUid: 'family_missing',
  }, {
    id: 'payment_paid_for_class',
    status: 'validado',
    amount: 30,
    classIds: ['class_paid_not_propagated'],
    familyUid: 'family_1',
  }, {
    id: 'payment_duplicate_1',
    status: 'pendiente',
    amount: 25,
    classIds: ['class_duplicate_payment'],
    familyUid: 'family_1',
  }, {
    id: 'payment_duplicate_2',
    status: 'solicitado',
    amount: 25,
    classIds: ['class_duplicate_payment'],
    familyUid: 'family_1',
  }],
  systemJobs: [{
    id: 'job_queued_stuck',
    type: 'payment.request_for_class',
    status: 'queued',
    runAt: '2026-06-30T06:00:00.000Z',
  }, {
    id: 'job_processing_stuck',
    type: 'relationship.ensure_chat',
    status: 'processing',
    startedAt: '2026-06-30T08:00:00.000Z',
  }],
  automationEvents: [{
    id: 'old_event',
    type: 'worker.finished',
    createdAt: '2026-06-29T08:00:00.000Z',
  }],
  deadLetters: [{
    id: 'dead_1',
    type: 'matching.request',
    status: 'open',
    error: 'permission denied',
  }],
  notificaciones: [{
    id: 'notif_orphan',
    userUid: 'missing_user',
    title: 'Pago pendiente',
    payload: { classId: 'class_missing_from_notification' },
  }, {
    id: 'notif_no_target',
    title: 'Sin destino',
  }, {
    id: 'notif_bad_chat',
    userUid: 'family_1',
    title: 'Chat roto',
    payload: { chatId: 'chat_missing_from_db', paymentId: 'payment_missing_from_db' },
  }],
  incidencias: [{
    id: 'incident_without_priority',
    status: 'abierta',
    createdAt: '2026-06-28T08:00:00.000Z',
  }, {
    id: 'incident_bad_status',
    status: 'en_el_limbo',
    createdAt: '2026-06-30T08:00:00.000Z',
  }, {
    id: 'incident_bad_refs',
    status: 'abierta',
    classId: 'class_deleted',
    paymentId: 'payment_deleted',
    createdAt: '2026-06-30T08:00:00.000Z',
  }],
  preventiveRisks: [{
    id: 'risk_without_priority',
    status: 'active',
    detectedAt: '2026-06-29T08:00:00.000Z',
  }],
}, {
  nowIso: '2026-06-30T12:00:00.000Z',
  automationHeartbeatHours: 12,
  queuedJobStuckHours: 2,
  processingJobStuckMinutes: 45,
  staleIncidentHours: 24,
  staleRiskHours: 12,
  scanLimit: 100,
});

const types = new Set(plan.findings.map((item) => item.type));
assert.equal(plan.version, PLATFORM_SUPERVISION_VERSION);
assert.ok(types.has('request_assigned_without_assignment'));
assert.ok(types.has('chat_participant_mismatch'));
assert.ok(types.has('chat_missing_participant_uid'));
assert.ok(types.has('chat_references_missing_assignment'));
assert.ok(types.has('duplicate_active_assignment'));
assert.ok(types.has('user_teacher_role_without_profile'));
assert.ok(types.has('user_family_role_without_profile'));
assert.ok(types.has('duplicate_user_email'));
assert.ok(types.has('class_invalid_status'));
assert.ok(types.has('class_invalid_lifecycle_status'));
assert.ok(types.has('class_status_lifecycle_mismatch'));
assert.ok(types.has('class_invalid_time_range'));
assert.ok(types.has('class_relation_orphan'));
assert.ok(types.has('class_paid_payment_not_propagated'));
assert.ok(types.has('class_missing_core_relation'));
assert.ok(types.has('completed_class_without_payment_request'));
assert.ok(types.has('payment_invalid_status'));
assert.ok(types.has('payment_relation_orphan'));
assert.ok(types.has('payment_references_missing_class'));
assert.ok(types.has('payment_without_class_link'));
assert.ok(types.has('duplicate_open_payments_for_class'));
assert.ok(types.has('automation_heartbeat_missing'));
assert.ok(types.has('queued_system_job_stuck'));
assert.ok(types.has('processing_system_job_stuck'));
assert.ok(types.has('dead_letter_open'));
assert.ok(types.has('notification_orphan_user'));
assert.ok(types.has('notification_without_target'));
assert.ok(types.has('notification_references_missing_class'));
assert.ok(types.has('notification_references_missing_payment'));
assert.ok(types.has('notification_references_missing_chat'));
assert.ok(types.has('incident_invalid_status'));
assert.ok(types.has('incident_references_missing_class'));
assert.ok(types.has('incident_references_missing_payment'));
assert.ok(types.has('incident_without_priority_decision'));
assert.ok(types.has('preventive_risk_without_priority_decision'));
assert.equal(plan.summary.critical >= 3, true);
assert.equal(plan.summary.autoRepairable >= 3, true);
assert.equal(plan.findings.some((item) => item.autoAction === 'enqueue_payment_request_for_class'), true);
assert.equal(plan.findings.some((item) => item.autoAction === 'mark_notification_orphaned'), true);
assert.equal(plan.findings.every((item) => item.recommendedAction && item.consequence && item.whyDetected.length), true);

const worker = fs.readFileSync('scripts/firebase-automation-worker.mjs', 'utf8');
const controlCenter = fs.readFileSync('js/admin-control-center.js', 'utf8');
const opsEngine = fs.readFileSync('js/admin-ops-engine.js', 'utf8');
const opsWorkbench = fs.readFileSync('js/admin-ops-workbench.js', 'utf8');
const rules = fs.readFileSync('firebase/firestore.rules', 'utf8');
const config = fs.readFileSync('js/platform-config.js', 'utf8');

assert.match(worker, /processPlatformSelfSupervision/);
assert.match(worker, /platformSupervisionFindings/);
assert.match(worker, /enqueue_payment_request_for_class/);
assert.match(worker, /enqueue_relationship_ensure_chat/);
assert.match(worker, /MAINTENANCE_HEALTH_VERSION/);
assert.match(worker, /buildMaintenanceHealthCheck/);
assert.match(worker, /writeMaintenanceHealthSnapshot/);
assert.match(worker, /writeWorkerHeartbeat/);
assert.match(worker, /listRecentCollection\(db, 'automationEvents'/);
assert.match(worker, /closeResolvedSupervisionWorkItems/);
assert.match(controlCenter, /platformSupervisionFindings/);
assert.match(controlCenter, /hallazgo\(s\) de autosupervision/);
assert.match(opsEngine, /type: 'supervision'/);
assert.match(opsWorkbench, /platformSupervisionFindings/);
assert.match(rules, /platformSupervisionFindings/);
assert.match(rules, /platformSupervisionSnapshots/);
assert.match(config, /supervision\.automationHeartbeatHours/);
assert.match(config, /supervision\.heartbeatEveryRun/);
assert.match(config, /supervision\.healthSnapshotEveryRun/);
assert.match(config, /supervision\.autoCloseResolvedAlerts/);
assert.match(config, /Autosupervision/);

console.log(JSON.stringify({
  ok: true,
  checked: 'platform_self_supervision',
  version: plan.version,
  summary: plan.summary,
}, null, 2));
