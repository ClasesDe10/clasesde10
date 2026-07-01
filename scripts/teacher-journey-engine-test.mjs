import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTeacherJourneyState } from '../js/teacher-journey-engine.js';
import { renderTeacherJourneyPanel } from '../js/teacher-journey-ui.js';

function state(input) {
  return buildTeacherJourneyState({
    teacher: {
      verificationStatus: 'verificado',
      profileCompletionPercent: 92,
      disponibilidad_resumen: 'Tardes de lunes a jueves',
    },
    documents: [{ id: 'doc_1', estado: 'validado' }],
    availabilitySlots: [{ id: 'slot_1' }],
    ...input,
  });
}

const profileNeeded = state({
  teacher: { verificationStatus: 'pendiente_perfil', profileCompletionPercent: 40 },
  documents: [],
  availabilitySlots: [],
});
assert.equal(profileNeeded.stage, 'profile_needed');
assert.equal(profileNeeded.primaryAction.id, 'complete_profile');

const docsNeeded = state({
  documents: [],
});
assert.equal(docsNeeded.stage, 'documents_needed');
assert.equal(docsNeeded.primaryAction.id, 'upload_documents');

const availabilityNeeded = state({
  teacher: { verificationStatus: 'verificado', profileCompletionPercent: 92, disponibilidad_resumen: '' },
  availabilitySlots: [],
});
assert.equal(availabilityNeeded.stage, 'availability_needed');
assert.equal(availabilityNeeded.primaryAction.id, 'set_availability');

const waiting = state({ relationships: [] });
assert.equal(waiting.stage, 'waiting_students');
assert.equal(waiting.primaryAction.id, 'open_profile');

const scheduleNeeded = state({
  relationships: [{ id: 'r1', stage: 'pendiente_horario', title: 'G', subject: 'Matematicas', assignment: { id: 'as1' }, chat: { id: 'as1' }, counts: {} }],
});
assert.equal(scheduleNeeded.stage, 'schedule_needed');
assert.equal(scheduleNeeded.primaryAction.id, 'open_chat');
assert.match(scheduleNeeded.body, /Matematicas/);
assert.doesNotMatch(scheduleNeeded.body, /para G/);

const confirmation = state({
  relationships: [{ id: 'r1', stage: 'pendiente_confirmacion', counts: { classes: 1, scheduledClasses: 1 } }],
});
assert.equal(confirmation.stage, 'confirm_class');
assert.equal(confirmation.primaryAction.id, 'confirm_class');

const payment = state({
  relationships: [{ id: 'r1', stage: 'pago_pendiente', counts: { classes: 2, completedClasses: 1 } }],
});
assert.equal(payment.stage, 'income_pending');
assert.equal(payment.primaryAction.id, 'open_income');

const incidentDominates = state({
  relationships: [
    { id: 'r1', stage: 'pago_pendiente', counts: { classes: 1 } },
    { id: 'r2', stage: 'incidencia_abierta', counts: { classes: 1 } },
  ],
});
assert.equal(incidentDominates.stage, 'incident_open');

const html = renderTeacherJourneyPanel(scheduleNeeded);
assert.match(html, /data-teacher-journey-stage="schedule_needed"/);
assert.match(html, /data-teacher-journey-action="open_chat"/);
assert.match(html, /Tu centro de trabajo/);

const professorDashboard = readFileSync(new URL('../pages/dashboard/profesor.html', import.meta.url), 'utf8');
assert.match(professorDashboard, /teacher-journey-panel/);
assert.match(professorDashboard, /teacher-journey-engine\.js/);
assert.match(professorDashboard, /renderTeacherJourneyPanel/);
assert.match(professorDashboard, /data-teacher-journey-action/);
assert.match(professorDashboard, /disponibilidadRelacion/);

const dashboardCss = readFileSync(new URL('../css/dashboard.css', import.meta.url), 'utf8');
assert.match(dashboardCss, /\.teacher-journey-card/);

console.log('teacher journey engine and integration OK');
