#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import {
  aggregateScaleMetrics,
  buildQueryBudget,
  buildScaleAlerts,
  buildSystemJob,
  scalePartitionKeys,
} from '../js/scale-engine.js';
import {
  buildFamilyClassPaymentConfirmationPayload,
  buildFamilyPaymentConfirmationGroups,
  buildTeacherPayoutPayload,
  reviewPaymentWithAssistant,
} from '../js/payment-engine.js';
import { buildAdminClassPayload } from '../js/calendar-engine.js';
import { validateScheduleAvailability } from '../js/availability-engine.js';

const require = createRequire(import.meta.url);
const { buildAutomationPlan } = require('../functions/platform-automation-engine.js');

const nowIso = '2026-07-01T10:00:00.000Z';
const nowMs = new Date(nowIso).getTime();

function pad(value, size = 4) {
  return String(value).padStart(size, '0');
}

function assertUnique(items, label) {
  const set = new Set(items);
  assert.equal(set.size, items.length, `${label} must not collide.`);
}

function generateUsers(count, role) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${role}_${pad(index)}`,
    uid: `${role}_user_${pad(index)}`,
    role,
    rol: role,
    active: index % 29 !== 0,
    updatedAt: nowIso,
  }));
}

function generateClasses({ families, teachers, students, count }) {
  return Array.from({ length: count }, (_, index) => {
    const teacher = teachers[index % teachers.length];
    const family = families[index % families.length];
    const student = students[index % students.length];
    const day = (index % 28) + 1;
    const hour = 15 + (index % 6);
    return {
      id: `class_${pad(index, 5)}`,
      teacherUid: teacher.uid,
      profesor_id: teacher.uid,
      familyUid: family.uid,
      familia_id: family.uid,
      studentId: student.id,
      alumno_id: student.id,
      materia: ['Matematicas', 'Fisica', 'Ingles', 'Padel'][index % 4],
      subject: ['Matematicas', 'Fisica', 'Ingles', 'Padel'][index % 4],
      fecha: `2026-07-${pad(day, 2)}`,
      date: `2026-07-${pad(day, 2)}`,
      hora_inicio: `${pad(hour, 2)}:00`,
      startTime: `${pad(hour, 2)}:00`,
      hora_fin: `${pad(hour + 1, 2)}:00`,
      endTime: `${pad(hour + 1, 2)}:00`,
      estado: index % 9 === 0 ? 'realizada' : 'confirmada',
      status: index % 9 === 0 ? 'realizada' : 'confirmada',
      familyPaymentStatus: index % 13 === 0 ? 'vencido' : index % 7 === 0 ? 'validado' : 'pendiente',
      precio_total: 32,
      amount: 32,
      importe_profesor: 24,
      teacherAmount: 24,
      ...scalePartitionKeys(`2026-07-${pad(day, 2)}T${pad(hour, 2)}:00:00.000Z`, `class_${index}`),
    };
  });
}

function generateNotifications(users, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `notif_${pad(index, 5)}`,
    userUid: users[index % users.length].uid,
    role: users[index % users.length].role,
    type: ['chat_message', 'class_confirmation_needed', 'payment_overdue', 'matching_ready'][index % 4],
    title: `Aviso ${index}`,
    body: 'Simulacion de carga',
    readAt: index % 5 === 0 ? nowIso : null,
    createdAt: nowIso,
    ...scalePartitionKeys(nowIso, `notif_${index}`),
  }));
}

function generateIncidents(families, teachers, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `incident_${pad(index, 4)}`,
    familyUid: families[index % families.length].uid,
    teacherUid: teachers[index % teachers.length].uid,
    status: index % 4 === 0 ? 'cerrada' : 'abierta',
    priority: index % 11 === 0 ? 'critical' : 'alta',
    createdAt: nowIso,
    ...scalePartitionKeys(nowIso, `incident_${index}`),
  }));
}

function generateJobs(count) {
  return Array.from({ length: count }, (_, index) => buildSystemJob({
    type: ['matching.request', 'payment.request_for_class', 'metrics.snapshot', 'relationship.ensure_chat'][index % 4],
    payload: { entityId: `entity_${index % 240}`, index },
    priority: index % 7 === 0 ? 'high' : 'normal',
    now: new Date(nowIso),
  })).map((job, index) => ({
    ...job,
    id: `job_${pad(index, 5)}`,
    status: index % 37 === 0 ? 'dead_letter' : 'queued',
  }));
}

const families = generateUsers(850, 'familia');
const teachers = generateUsers(650, 'profesor');
const admins = generateUsers(8, 'admin');
const users = [...families, ...teachers, ...admins];
const students = Array.from({ length: 2400 }, (_, index) => ({
  id: `student_${pad(index, 5)}`,
  familyUid: families[index % families.length].uid,
  active: true,
}));
const classes = generateClasses({ families, teachers, students, count: 18000 });
const notifications = generateNotifications(users, 24000);
const incidents = generateIncidents(families, teachers, 900);
const jobs = generateJobs(1800);

const paymentGroups = Array.from({ length: 900 }, (_, index) => {
  const family = families[index % families.length];
  const teacher = teachers[index % teachers.length];
  const student = students[index % students.length];
  const classIds = [`payclass_${pad(index)}_a`, `payclass_${pad(index)}_b`];
  return {
    familyUid: family.uid,
    teacherUid: teacher.uid,
    studentId: student.id,
    studentName: `Alumno ${index}`,
    teacherName: `Profesor ${index}`,
    classIds,
    classCount: classIds.length,
    amount: 64,
    dueAt: '2026-07-05T20:00:00.000Z',
  };
});

const familyPayments = paymentGroups.map((group, index) => {
  const payload = buildFamilyClassPaymentConfirmationPayload(group, {
  metodo: 'bizum',
  }, { nowIso });
  return index % 19 === 0
    ? { ...payload, estado: 'vencido', status: 'vencido' }
    : payload;
});
const duplicateBurst = Array.from({ length: 80 }, () => buildFamilyClassPaymentConfirmationPayload(paymentGroups[0], {
  metodo: 'bizum',
}, { nowIso }));
const teacherPayouts = Array.from({ length: 350 }, (_, index) => buildTeacherPayoutPayload(teachers[index % teachers.length].uid, {
  monto: 48,
  classIds: [`payout_${pad(index)}_a`, `payout_${pad(index)}_b`],
}));

assertUnique(familyPayments.map((payment) => payment.idempotencyKey), 'linked family payment idempotency keys');
assert.equal(new Set(duplicateBurst.map((payment) => payment.idempotencyKey)).size, 1, 'same class-payment burst must collapse to one idempotency key');
assertUnique(teacherPayouts.map((payment) => payment.idempotencyKey), 'teacher payout idempotency keys');

const paymentConfirmationGroups = buildFamilyPaymentConfirmationGroups(classes.slice(0, 2000), familyPayments.slice(0, 120), new Map(), { nowMs });
assert.ok(paymentConfirmationGroups.length < 2000, 'payment grouping must compact many classes into relation-level payment groups');

const review = reviewPaymentWithAssistant({
  id: 'pay_duplicate_probe',
  paymentType: 'family_payment',
  familyUid: paymentGroups[3].familyUid,
  estado: 'pendiente',
  gateway: 'manual',
  monto: 64,
  classIds: paymentGroups[3].classIds,
}, classes, [{ id: 'pay_existing', paymentType: 'family_payment', familyUid: paymentGroups[3].familyUid, estado: 'pendiente', monto: 64, classIds: paymentGroups[3].classIds }]);
assert.ok(review.duplicatePaymentIds.includes('pay_existing'), 'payment assistant must detect overlapping concurrent proofs');

const teacherSlots = Array.from({ length: 7 }, (_, dayIndex) => ({ dayIndex, startTime: '15:00', endTime: '22:00', teacherUid: 'teacher_user_0001' }));
const studentSlots = Array.from({ length: 7 }, (_, dayIndex) => ({ dayIndex, startTime: '16:00', endTime: '21:00', studentId: 'student_00001' }));
const busySlots = Array.from({ length: 6000 }, (_, index) => ({
  date: `2026-07-${pad((index % 28) + 1, 2)}`,
  startTime: `${pad(16 + (index % 4), 2)}:00`,
  endTime: `${pad(17 + (index % 4), 2)}:00`,
  resourceType: index % 2 ? 'teacher' : 'student',
  resourceId: index % 2 ? 'teacher_user_0001' : 'student_00001',
  teacherUid: 'teacher_user_0001',
  studentId: 'student_00001',
  status: 'ocupada',
}));
const availabilityStart = performance.now();
const availability = validateScheduleAvailability({
  role: 'familia',
  fecha: '2026-07-06',
  horaInicio: '17:00',
  horaFin: '18:00',
  teacherSlots,
  studentSlots,
  busySlots,
  teacherUid: 'teacher_user_0001',
  studentId: 'student_00001',
});
const availabilityMs = performance.now() - availabilityStart;
assert.equal(availability.valid, false, 'busy schedule conflicts must block class proposals under large calendars');
assert.equal(availability.reason, 'time_conflict');
assert.ok(availabilityMs < 750, `availability conflict scan must stay responsive, got ${Math.round(availabilityMs)}ms`);

const builtClass = buildAdminClassPayload({
  profesor_id: teachers[0].uid,
  familia_id: families[0].uid,
  alumno_id: students[0].id,
  fecha: '2026-07-08',
  hora_inicio: '18:00',
  hora_fin: '19:00',
  materia: 'Matematicas',
  precio_total: 35,
}, {}, { nowIso });
assert.equal(builtClass.status, 'confirmada');
assert.equal(builtClass.durationMinutes, 60);

const automationStart = performance.now();
const automationPlans = [
  ...Array.from({ length: 500 }, (_, index) => buildAutomationPlan({
    type: 'request.created',
    entityType: 'solicitudes',
    entityId: `req_${index}`,
    data: { id: `req_${index}`, familyUid: families[index % families.length].uid, subject: 'Matematicas' },
  })),
  ...Array.from({ length: 500 }, (_, index) => buildAutomationPlan({
    type: 'class.scheduled',
    entityType: 'clases',
    entityId: `class_auto_${index}`,
    data: { id: `class_auto_${index}`, teacherUid: teachers[index % teachers.length].uid, familyUid: families[index % families.length].uid, classLabel: 'Matematicas' },
  })),
  ...Array.from({ length: 500 }, (_, index) => buildAutomationPlan({
    type: 'payment.created',
    entityType: 'pagos',
    entityId: `pay_auto_${index}`,
    data: { id: `pay_auto_${index}`, familyUid: families[index % families.length].uid, amount: 64 },
  })),
];
const automationMs = performance.now() - automationStart;
assert.ok(automationPlans.every((plan) => Array.isArray(plan.ruleRuns)), 'automation plans must be generated for all simulated events');
assert.ok(automationMs < 1200, `automation planning must stay responsive, got ${Math.round(automationMs)}ms`);

const metrics = aggregateScaleMetrics({
  users,
  classes,
  payments: [...familyPayments, ...teacherPayouts],
  notifications,
  jobs,
  incidents,
}, new Date(nowIso));
assert.equal(metrics.users.total, users.length);
assert.equal(metrics.classes.total, classes.length);
assert.equal(metrics.payments.total, familyPayments.length + teacherPayouts.length);
assert.ok(metrics.notifications.unread > 10000, 'simulation must produce notification backlog pressure');
assert.ok(metrics.jobs.queued > 500, 'simulation must produce job backlog pressure');

const alerts = buildScaleAlerts(metrics);
for (const type of ['job_backlog', 'dead_letters', 'overdue_payments', 'notification_backlog']) {
  assert.ok(alerts.some((alert) => alert.type === type), `scale alert ${type} must be raised`);
}

const runtimeQuery = buildQueryBudget({
  collectionName: 'clases',
  requestedLimit: 200,
  filters: [{ field: 'month' }, { field: 'teacherUid' }],
  orderField: 'startAtIso',
  hasCursor: true,
  purpose: 'teacher_calendar_runtime',
});
assert.equal(runtimeQuery.scalable, true, 'partitioned runtime class queries must stay scalable');
const unsafeQuery = buildQueryBudget({ collectionName: 'clases', requestedLimit: null, filters: [], orderField: 'fecha' });
assert.ok(unsafeQuery.risks.includes('missing_explicit_limit'));
assert.ok(unsafeQuery.risks.includes('missing_time_partition'));

const compatClient = await readFile(new URL('../js/firebase-data-client.js', import.meta.url), 'utf8');
assert.match(compatClient, /cached\?\.promise/, 'compat data client must dedupe concurrent hydration map loads.');
assert.match(compatClient, /deterministicPaymentDocId/, 'compat data client must use deterministic ids for idempotent linked payments.');
assert.match(compatClient, /pay_\$\{buildIdempotencyKey\('pagos', key\)\}/, 'payment deterministic ids must be hashed from idempotency keys.');

console.log(JSON.stringify({
  ok: true,
  scenario: {
    users: users.length,
    students: students.length,
    classes: classes.length,
    payments: familyPayments.length + teacherPayouts.length,
    notifications: notifications.length,
    incidents: incidents.length,
    jobs: jobs.length,
    automationEvents: automationPlans.length,
  },
  timingMs: {
    availability: Math.round(availabilityMs),
    automation: Math.round(automationMs),
  },
  alerts: alerts.map((alert) => alert.type),
}, null, 2));
