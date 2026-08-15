import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  RELATIONSHIP_FOLLOWUP_VERSION,
  buildRelationshipFollowupPlan,
} from '../js/relationship-followup-engine.js';
import { buildRelationshipsFromCollections } from '../js/relationship-engine.js';

const nowIso = '2026-06-30T12:00:00.000Z';

const relationships = [
  {
    id: 'rel_schedule',
    stage: 'pendiente_horario',
    title: 'Juan - Matematicas',
    subject: 'Matematicas',
    lastActivityAt: '2026-06-29T12:00:00.000Z',
    participants: { familyUid: 'family_1', teacherUid: 'teacher_1', studentId: 'student_1' },
    assignment: { id: 'rel_schedule' },
  },
  {
    id: 'rel_proposal',
    stage: 'horario_propuesto',
    title: 'Laura - Ingles',
    subject: 'Ingles',
    lastActivityAt: '2026-06-30T01:00:00.000Z',
    participants: { familyUid: 'family_2', teacherUid: 'teacher_2', studentId: 'student_2' },
    assignment: { id: 'rel_proposal' },
  },
  {
    id: 'rel_first_class',
    stage: 'clase_programada',
    title: 'Pablo - Fisica',
    subject: 'Fisica',
    nextClassAt: '2026-07-01T09:00:00.000Z',
    lastActivityAt: '2026-06-30T08:00:00.000Z',
    counts: { completedClasses: 0, futureClasses: 1, scheduledClasses: 1 },
    participants: { familyUid: 'family_3', teacherUid: 'teacher_3', studentId: 'student_3' },
    assignment: { id: 'rel_first_class' },
  },
  {
    id: 'rel_active_silent',
    stage: 'relacion_activa',
    title: 'Sara - Piano',
    subject: 'Piano',
    lastClassAt: '2026-06-18T17:00:00.000Z',
    lastActivityAt: '2026-06-18T17:00:00.000Z',
    counts: { completedClasses: 4, futureClasses: 0, scheduledClasses: 0 },
    participants: { familyUid: 'family_4', teacherUid: 'teacher_4', studentId: 'student_4' },
    assignment: { id: 'rel_active_silent' },
  },
  {
    id: 'rel_first_done',
    stage: 'relacion_activa',
    title: 'Marta - Quimica',
    subject: 'Quimica',
    lastCompletedClassAt: '2026-06-29T09:00:00.000Z',
    lastClassAt: '2026-06-29T09:00:00.000Z',
    lastActivityAt: '2026-06-29T09:00:00.000Z',
    counts: { completedClasses: 1, futureClasses: 0, scheduledClasses: 0, cancelledClasses: 0 },
    participants: { familyUid: 'family_7', teacherUid: 'teacher_7', studentId: 'student_7' },
    assignment: { id: 'rel_first_done' },
  },
  {
    id: 'rel_quality',
    stage: 'relacion_activa',
    title: 'Nora - Lengua',
    subject: 'Lengua',
    nextClassAt: '2026-07-02T09:00:00.000Z',
    lastCompletedClassAt: '2026-06-28T09:00:00.000Z',
    lastClassAt: '2026-06-28T09:00:00.000Z',
    lastActivityAt: '2026-06-29T09:00:00.000Z',
    counts: { completedClasses: 3, futureClasses: 1, scheduledClasses: 1, cancelledClasses: 0 },
    participants: { familyUid: 'family_8', teacherUid: 'teacher_8', studentId: 'student_8' },
    assignment: { id: 'rel_quality' },
  },
  {
    id: 'rel_cancel',
    stage: 'relacion_activa',
    title: 'Leo - Fisica',
    subject: 'Fisica',
    lastCancelledClassAt: '2026-06-29T18:00:00.000Z',
    lastActivityAt: '2026-06-29T18:00:00.000Z',
    counts: { completedClasses: 2, futureClasses: 0, scheduledClasses: 0, cancelledClasses: 3 },
    history: {
      cancelledClassDates: [
        '2026-06-29T18:00:00.000Z',
        '2026-06-21T18:00:00.000Z',
        '2026-06-05T18:00:00.000Z',
      ],
    },
    participants: { familyUid: 'family_9', teacherUid: 'teacher_9', studentId: 'student_9' },
    assignment: { id: 'rel_cancel' },
  },
  {
    id: 'rel_chat_pending',
    stage: 'chat_pendiente',
    title: 'Admin only',
    participants: { familyUid: 'family_5', teacherUid: 'teacher_5' },
    assignment: { id: 'rel_chat_pending' },
  },
  {
    id: 'rel_healthy',
    stage: 'relacion_activa',
    title: 'Todo bien',
    lastActivityAt: '2026-06-30T10:00:00.000Z',
    counts: { completedClasses: 3, futureClasses: 1, scheduledClasses: 1 },
    participants: { familyUid: 'family_6', teacherUid: 'teacher_6' },
    assignment: { id: 'rel_healthy' },
  },
];

const plan = buildRelationshipFollowupPlan({
  relationships,
  previousFollowups: [{
    id: 'old_recent',
    dedupeKey: 'schedule_first_class_rel_schedule',
    status: 'sent',
    sentAt: '2026-06-30T10:00:00.000Z',
  }],
}, {
  nowIso,
  scheduleNudgeHours: 12,
  proposedScheduleNudgeHours: 8,
  firstClassPrepHours: 24,
  confirmationNudgeHours: 2,
  activeSilenceDays: 7,
  firstClassCheckinHours: 24,
  qualityCheckCompletedClasses: 3,
  qualityCheckCooldownDays: 45,
  repeatedCancellationWindowDays: 30,
  repeatedCancellationThreshold: 3,
  teacherActivityDropDays: 21,
  adminEscalationHours: 48,
  adminEscalationDays: 14,
  userNotificationCooldownHours: 24,
  maxUserNotifications: 6,
});

const actions = new Map(plan.actions.map((item) => [item.actionId, item]));
assert.equal(plan.version, RELATIONSHIP_FOLLOWUP_VERSION);
assert.equal(actions.has('schedule_first_class'), false, 'recent previous followup must suppress repeated schedule nudge');
assert.equal(actions.has('answer_schedule_proposal'), true);
assert.equal(actions.has('prepare_first_class'), true);
assert.equal(actions.has('plan_next_regular_class'), true);
assert.equal(actions.has('first_class_checkin'), true);
assert.equal(actions.has('relationship_quality_check'), true);
assert.equal(actions.has('review_repeated_cancellations'), true);
assert.equal(actions.has('admin_chat_pendiente'), true);
assert.equal(plan.actions.some((item) => item.relationshipId === 'rel_healthy'), false, 'healthy relationships must not be notified');
assert.equal(actions.get('answer_schedule_proposal').recipients.length, 2);
assert.equal(actions.get('admin_chat_pendiente').recipients.length, 0);
assert.equal(actions.get('admin_chat_pendiente').createAdminTask, true);
assert.equal(actions.get('review_repeated_cancellations').createAdminTask, true);
assert.equal(actions.get('relationship_quality_check').recipients.length, 0);
assert.equal(plan.summary.userNotifications >= 4, true);
assert.equal(plan.summary.userNotifications <= 6, true);
assert.equal(plan.summary.adminTasks >= 1, true);
assert.equal(plan.summary.qualityChecks >= 2, true);
assert.equal(plan.summary.cancellationRisks, 1);

const integrated = buildRelationshipsFromCollections({
  assignments: [{
    id: 'assignment_integrated',
    familyUid: 'family_i',
    teacherUid: 'teacher_i',
    studentId: 'student_i',
    materia: 'Matematicas',
    status: 'activa',
    createdAt: '2026-06-28T10:00:00.000Z',
  }],
  chats: [{
    id: 'assignment_integrated',
    assignmentId: 'assignment_integrated',
    familyUid: 'family_i',
    teacherUid: 'teacher_i',
    studentId: 'student_i',
    schedulingStatus: 'pendiente_horario',
    createdAt: '2026-06-28T10:00:00.000Z',
  }],
  classes: [{
    id: 'class_future',
    assignmentId: 'assignment_integrated',
    familyUid: 'family_i',
    teacherUid: 'teacher_i',
    studentId: 'student_i',
    status: 'confirmada',
    fecha: '2026-07-01',
    hora_inicio: '10:00',
    hora_fin: '11:00',
  }, {
    id: 'class_cancelled',
    assignmentId: 'assignment_integrated',
    familyUid: 'family_i',
    teacherUid: 'teacher_i',
    studentId: 'student_i',
    status: 'cancelada',
    fecha: '2026-06-20',
    hora_inicio: '10:00',
    updatedAt: '2026-06-20T10:00:00.000Z',
  }],
}, { nowMs: new Date(nowIso).getTime() });

assert.ok(integrated[0].nextClassAt, 'Relationship engine must expose nextClassAt for follow-up prep.');
assert.equal(integrated[0].counts.cancelledClasses, 1, 'Relationship engine must expose cancelled classes for preventive follow-up.');
assert.equal(integrated[0].history.cancelledClassDates.length, 1, 'Relationship history must expose cancellation dates.');

const worker = fs.readFileSync('scripts/firebase-automation-worker.mjs', 'utf8');
const notifications = fs.readFileSync('js/notification-engine.js', 'utf8');
const config = fs.readFileSync('js/platform-config.js', 'utf8');
const rules = fs.readFileSync('firebase/firestore.rules', 'utf8');
const opsEngine = fs.readFileSync('js/admin-ops-engine.js', 'utf8');
const controlCenter = fs.readFileSync('js/admin-control-center.js', 'utf8');

assert.match(worker, /processRelationshipFollowups/);
assert.match(worker, /relationshipFollowups/);
assert.match(worker, /buildRelationshipFollowupPlan/);
assert.match(notifications, /RELATIONSHIP_FOLLOWUP/);
assert.match(config, /followup\.scheduleNudgeHours/);
assert.match(config, /followup\.qualityCheckCompletedClasses/);
assert.match(config, /followup\.repeatedCancellationThreshold/);
assert.match(config, /Seguimiento inteligente/);
assert.match(rules, /relationshipFollowups/);
assert.match(rules, /relationshipFollowupSnapshots/);
assert.match(opsEngine, /relationshipFollowups/);
assert.match(controlCenter, /seguimiento\(s\) post-match prioritarios/);

console.log(JSON.stringify({
  ok: true,
  checked: 'relationship_followup_engine',
  version: plan.version,
  actions: plan.actions.map((item) => item.actionId),
  summary: plan.summary,
}, null, 2));
