#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PROACTIVE_ASSIST_VERSION,
  buildProactiveAssistPlan,
} from '../js/proactive-assist-engine.js';

const nowIso = '2026-06-30T12:00:00.000Z';

const dataset = {
  profesores: [
    {
      id: 'teacher_1',
      userUid: 'teacher_1',
      nombre: 'Miguel',
      profileCompletionPercent: 40,
      createdAt: '2026-06-28T08:00:00.000Z',
      materias: ['Matematicas'],
    },
    {
      id: 'teacher_2',
      userUid: 'teacher_2',
      nombre: 'Ana',
      profileCompletionPercent: 92,
      createdAt: '2026-06-27T08:00:00.000Z',
      materias: ['Fisica'],
    },
    {
      id: 'teacher_3',
      userUid: 'teacher_3',
      nombre: 'Carlos',
      profileCompletionPercent: 100,
      status: 'verified',
      hasBizum: true,
      availabilitySlots: [{ day: 'monday', start: '17:00', end: '19:00' }],
      createdAt: '2026-06-10T08:00:00.000Z',
      materias: ['Ingles'],
    },
  ],
  familias: [
    {
      id: 'family_1',
      userUid: 'family_1',
      nombre: 'Familia sin alumno',
      createdAt: '2026-06-28T08:00:00.000Z',
    },
    {
      id: 'family_2',
      userUid: 'family_2',
      nombre: 'Familia asignada',
      telefono: '600000000',
      direccion: 'Calle Mayor 1',
      weeklyPaymentDay: 'sunday',
      createdAt: '2026-06-27T08:00:00.000Z',
    },
  ],
  alumnos: [
    {
      id: 'student_2',
      familyUid: 'family_2',
      nombre: 'Leo',
      curso: '2 ESO',
    },
  ],
  asignaciones: [
    {
      id: 'assignment_1',
      familyUid: 'family_2',
      teacherUid: 'teacher_2',
      studentId: 'student_2',
      estado: 'activa',
      materia: 'Fisica',
      createdAt: '2026-06-27T08:00:00.000Z',
    },
  ],
  solicitudes: [
    {
      id: 'request_1',
      familyUid: 'family_2',
      materia: 'Quimica',
      nivel: 'Bachillerato',
      estado: 'nueva',
      createdAt: '2026-06-28T09:00:00.000Z',
    },
  ],
  solicitudMatches: [
    {
      id: 'match_1',
      requestId: 'request_1',
      score: 40,
      status: 'ready',
    },
  ],
  clases: [
    {
      id: 'class_1',
      assignmentId: 'assignment_2',
      familyUid: 'family_2',
      teacherUid: 'teacher_2',
      studentId: 'student_2',
      subject: 'Fisica',
      status: 'confirmada',
      fecha: '2026-07-01',
      hora_inicio: '10:00',
    },
    {
      id: 'class_payout',
      assignmentId: 'assignment_1',
      familyUid: 'family_2',
      teacherUid: 'teacher_2',
      studentId: 'student_2',
      subject: 'Fisica',
      status: 'realizada',
      teacherAmount: 80,
      endAtIso: '2026-06-30T08:00:00.000Z',
    },
  ],
  notificaciones: [
    {
      id: 'notif_1',
      userUid: 'family_2',
      priority: 'high',
      title: 'Pago vencido',
      createdAt: '2026-06-29T12:00:00.000Z',
      leida: false,
    },
  ],
  crmTasks: [
    {
      id: 'task_1',
      title: 'Revisar solicitud manual',
      status: 'open',
      dueAt: '2026-06-27T08:00:00.000Z',
    },
  ],
};

const plan = buildProactiveAssistPlan(dataset, {
  nowIso,
  onboardingNudgeHours: 24,
  profileNudgeMinCompletion: 85,
  profileNudgeCooldownHours: 72,
  missingAvailabilityHours: 24,
  requestAvailabilityNudgeHours: 12,
  upcomingClassReadinessHours: 36,
  teacherPayoutReadinessHours: 1,
  unreadCriticalNotificationHours: 12,
  lowSupplyRequestHours: 24,
  lowSupplyMinCandidates: 2,
  lowSupplyMinScore: 55,
  verifiedTeacherIdleDays: 7,
  staleAdminTaskHours: 48,
  userNotificationCooldownHours: 72,
  adminCooldownHours: 24,
  adminEscalationHours: 48,
  maxUserNotifications: 6,
});

const signalIds = new Set(plan.signals.map((item) => item.signalId));
assert.equal(plan.version, PROACTIVE_ASSIST_VERSION);
assert.equal(signalIds.has('teacher_profile_help'), true, 'Teacher profile help must be detected.');
assert.equal(signalIds.has('family_add_first_student'), true, 'Family onboarding must be detected before the user gets stuck.');
assert.equal(signalIds.has('missing_availability_before_schedule'), true, 'Missing availability must be detected before scheduling.');
assert.equal(signalIds.has('request_missing_student_availability'), true, 'Request readiness must ask for student availability before matching stalls.');
assert.equal(signalIds.has('request_low_supply'), true, 'Low supply matching requests must be detected.');
assert.equal(signalIds.has('teacher_missing_bizum_before_payout'), true, 'Teacher payout readiness must be detected before payment day.');
assert.equal(signalIds.has('upcoming_class_missing_financials'), true, 'Upcoming class financial readiness must be detected.');
assert.equal(signalIds.has('verified_teacher_without_students'), true, 'Verified teachers without students must be surfaced for activation.');
assert.equal(signalIds.has('unread_priority_notification'), true, 'Unread priority notifications must be escalated.');
assert.equal(signalIds.has('stale_admin_task'), true, 'Stale admin tasks must be detected.');
assert.equal(plan.summary.profileHelp >= 1, true);
assert.equal(plan.summary.schedulingHelp, 1);
assert.equal(plan.summary.requestReadiness, 1);
assert.equal(plan.summary.matchingHelp, 1);
assert.equal(plan.summary.paymentReadiness, 1);
assert.equal(plan.summary.readinessChecks, 1);
assert.equal(plan.summary.supplyActivation, 1);
assert.equal(plan.summary.userNotifications >= 6, true);
assert.equal(plan.summary.userNotifications <= 6, true);
assert.equal(plan.summary.adminTasks >= 6, true);
assert.equal(plan.summary.opsAlerts >= 2, true);
assert.equal(plan.signals[0].priorityScore >= plan.signals.at(-1).priorityScore, true, 'Signals must be sorted by urgency.');

const suppressed = buildProactiveAssistPlan({
  ...dataset,
  previousSignals: [{
    id: 'old_teacher_profile',
    dedupeKey: 'teacher_profile_help_teacher_1',
    status: 'sent',
    lastSeenAt: '2026-06-30T11:00:00.000Z',
  }],
}, {
  nowIso,
  profileNudgeCooldownHours: 72,
});
assert.equal(suppressed.signals.some((item) => item.signalId === 'teacher_profile_help' && item.entityId === 'teacher_1'), false, 'Recent proactive signal must suppress repeated nudges.');

const worker = fs.readFileSync('scripts/firebase-automation-worker.mjs', 'utf8');
const notifications = fs.readFileSync('js/notification-engine.js', 'utf8');
const config = fs.readFileSync('js/platform-config.js', 'utf8');
const rules = fs.readFileSync('firebase/firestore.rules', 'utf8');
const opsEngine = fs.readFileSync('js/admin-ops-engine.js', 'utf8');
const workbench = fs.readFileSync('js/admin-ops-workbench.js', 'utf8');
const controlCenter = fs.readFileSync('js/admin-control-center.js', 'utf8');

assert.match(worker, /buildProactiveAssistPlan/);
assert.match(worker, /processProactiveAssist/);
assert.match(worker, /proactiveAssistSignals/);
assert.match(notifications, /PROACTIVE_ASSIST/);
assert.match(config, /Asistencia proactiva/);
assert.match(config, /proactiveAssist\.lowSupplyRequestHours/);
assert.match(rules, /proactiveAssistSignals/);
assert.match(rules, /proactiveAssistSnapshots/);
assert.match(opsEngine, /proactiveAssistSignals/);
assert.match(workbench, /proactiveAssistSignals/);
assert.match(controlCenter, /senal\(es\) proactivas prioritarias/);

console.log(JSON.stringify({
  ok: true,
  checked: 'proactive_assist_engine',
  version: plan.version,
  signals: plan.signals.map((item) => item.signalId),
  summary: plan.summary,
}, null, 2));
