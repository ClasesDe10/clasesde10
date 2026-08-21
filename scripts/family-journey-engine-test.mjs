import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFamilyJourneyState } from '../js/family-journey-engine.js';

function state(input) {
  return buildFamilyJourneyState({
    profileEvaluation: { percent: 80 },
    ...input,
  });
}

const empty = state({});
assert.equal(empty.stage, 'no_student');
assert.equal(empty.primaryAction.id, 'add_student');
assert.equal(empty.progress, 25);

const withStudent = state({ students: [{ id: 'a1', activo: true }] });
assert.equal(withStudent.stage, 'no_request');
assert.equal(withStudent.primaryAction.id, 'request_teacher');

const waiting = state({
  students: [{ id: 'a1', activo: true }],
  relationships: [{ id: 'r1', stage: 'matching_en_proceso', counts: {} }],
});
assert.equal(waiting.stage, 'waiting_assignment');
assert.equal(waiting.primaryAction.id, 'open_requests');

const chatNeeded = state({
  students: [{ id: 'a1', activo: true }],
  relationships: [{ id: 'r1', stage: 'profesor_asignado', assignment: { id: 'as1' }, counts: {} }],
});
assert.equal(chatNeeded.stage, 'chat_needed');
assert.equal(chatNeeded.primaryAction.id, 'open_teachers');

const scheduleNeeded = state({
  students: [{ id: 'a1', activo: true }],
  relationships: [{ id: 'r1', stage: 'pendiente_horario', title: 'G', subject: 'Matematicas', assignment: { id: 'as1' }, chat: { id: 'c1' }, modules: { chat: true }, counts: {} }],
});
assert.equal(scheduleNeeded.stage, 'schedule_needed');
assert.equal(scheduleNeeded.primaryAction.id, 'open_teachers');
assert.match(scheduleNeeded.body, /Mis profesores/);
assert.doesNotMatch(scheduleNeeded.body, /para G/);

const paymentDue = state({
  students: [{ id: 'a1', activo: true }],
  relationships: [{
    id: 'r1',
    stage: 'pago_pendiente',
    assignment: { id: 'as1' },
    chat: { id: 'c1' },
    modules: { chat: true },
    counts: { scheduledClasses: 1, classes: 1, completedClasses: 1 },
  }],
});
assert.equal(paymentDue.stage, 'payment_due');
assert.equal(paymentDue.primaryAction.id, 'open_payments');

const active = state({
  students: [{ id: 'a1', activo: true }],
  relationships: [{
    id: 'r1',
    stage: 'relacion_activa',
    assignment: { id: 'as1' },
    chat: { id: 'c1' },
    modules: { chat: true },
    counts: { scheduledClasses: 1, classes: 2, completedClasses: 2 },
  }],
});
assert.equal(active.stage, 'active');
assert.equal(active.progress, 100);

const familyDashboard = readFileSync(new URL('../pages/dashboard/familia.html', import.meta.url), 'utf8');
assert.match(familyDashboard, /family-journey-panel/);
assert.match(familyDashboard, /family-journey-engine\.js/);
assert.match(familyDashboard, /data-family-journey-action/);
assert.match(familyDashboard, /Ahora indica materia y horario/);

const registerPage = readFileSync(new URL('../pages/registro.html', import.meta.url), 'utf8');
assert.match(registerPage, /auth-next-steps/);
assert.match(registerPage, /Despues de crear la cuenta/);

const loginPage = readFileSync(new URL('../pages/login.html', import.meta.url), 'utf8');
assert.doesNotMatch(loginPage, /auth-guide-note/);
assert.doesNotMatch(loginPage, /siguiente paso exacto/);

const dashboardCss = readFileSync(new URL('../css/dashboard.css', import.meta.url), 'utf8');
assert.match(dashboardCss, /\.family-journey-actions \.family-journey-secondary/);

console.log('family journey engine and integration OK');
