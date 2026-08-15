import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildOneOffScheduleProposal,
  normalizeOneOffDateInput,
  normalizeOneOffTimeInput,
  oneOffDateBounds,
  validateOneOffClassDraft,
} from '../js/one-off-class-planner.js';
import {
  buildAcceptedOneOffClassPayload,
  isPendingOneOffScheduleProposal,
  oneOffClassId,
  oneOffProposalToClassRow,
} from '../js/one-off-proposal-actions.js';

assert.equal(normalizeOneOffDateInput('2026-07-10'), '2026-07-10');
assert.equal(normalizeOneOffDateInput('10/07/2026'), '2026-07-10');
assert.equal(normalizeOneOffDateInput('10-07-26'), '2026-07-10');
assert.equal(normalizeOneOffDateInput('2026-02-31'), '');

assert.equal(normalizeOneOffTimeInput('17'), '17:00');
assert.equal(normalizeOneOffTimeInput('17:5'), '17:05');
assert.equal(normalizeOneOffTimeInput('1735'), '17:35');
assert.equal(normalizeOneOffTimeInput('24:00'), '');

const valid = validateOneOffClassDraft({
  date: '2026-07-10',
  start: '17:30',
  end: '18:03',
}, {
  now: new Date('2026-07-07T10:00:00'),
});
assert.equal(valid.valid, true);
assert.equal(valid.durationMinutes, 33);

const past = validateOneOffClassDraft({
  date: '2026-07-06',
  start: '17:30',
  end: '18:03',
}, {
  now: new Date('2026-07-07T10:00:00'),
});
assert.equal(past.valid, false);
assert.equal(past.field, 'date');

const bounds = oneOffDateBounds(new Date('2026-07-07T10:00:00'), 30);
assert.equal(bounds.min, '2026-07-07');
assert.equal(bounds.max, '2026-08-06');

const { validation, proposal } = buildOneOffScheduleProposal({
  id: 'assignment_1',
  familyUid: 'family_1',
  teacherUid: 'teacher_1',
  studentId: 'student_1',
  materia: 'Matematicas',
}, {
  date: '10/07/2026',
  start: '17.30',
  end: '18:03',
  modality: 'online',
  notes: 'Recuperacion',
}, {
  now: new Date('2026-07-07T10:00:00'),
  currentUid: 'family_1',
  role: 'familia',
  serverTimestamp: () => 'SERVER_TS',
});
assert.equal(validation.valid, true);
assert.equal(proposal.kind, 'one_off');
assert.equal(proposal.source, 'classes_panel_one_off');
assert.equal(proposal.fecha, '2026-07-10');
assert.equal(proposal.hora_inicio, '17:30');
assert.equal(proposal.hora_fin, '18:03');
assert.equal(proposal.durationMinutes, 33);
assert.equal(proposal.duracion_minutos, 33);
assert.equal(proposal.asignacion_id, 'assignment_1');
assert.equal(proposal.familia_id, 'family_1');
assert.equal(proposal.profesor_id, 'teacher_1');
assert.equal(proposal.alumno_id, 'student_1');
assert.equal(isPendingOneOffScheduleProposal(proposal), true);

const visibleRow = oneOffProposalToClassRow({
  id: 'assignment_1',
  familyUid: 'family_1',
  teacherUid: 'teacher_1',
  studentId: 'student_1',
  familyName: 'Familia Garcia',
  teacherName: 'Miguel Gutierrez',
  studentName: 'Juan Pablo',
  materia: 'Matematicas',
  familyHourlyRate: 24,
  teacherHourlyRate: 18,
}, {
  id: 'proposal_1',
  ...proposal,
}, {
  familyName: 'Familia Garcia',
  teacherName: 'Miguel Gutierrez',
  studentName: 'Juan Pablo',
});
assert.equal(visibleRow.isOneOffProposal, true);
assert.equal(visibleRow.calendarEventType, 'one_off_proposal');
assert.equal(visibleRow.status, 'propuesta');
assert.equal(visibleRow.alumno_nombre, 'Juan Pablo');
assert.equal(visibleRow.profesor_nombre, 'Miguel Gutierrez');
assert.equal(visibleRow.durationMinutes, 33);
assert.equal(visibleRow.familyAmount, 13.2);
assert.equal(visibleRow.teacherAmount, 9.9);

const acceptedClassPayload = buildAcceptedOneOffClassPayload({
  id: 'assignment_1',
  familyUid: 'family_1',
  teacherUid: 'teacher_1',
  studentId: 'student_1',
  participantUids: { family_1: true, teacher_1: true },
  familyHourlyRate: 24,
  teacherHourlyRate: 18,
  materia: 'Matematicas',
}, {
  id: 'proposal_1',
  ...proposal,
}, {
  classId: oneOffClassId('assignment_1', 'proposal_1'),
  currentUid: 'teacher_1',
  currentRole: 'profesor',
  serverTimestamp: () => 'SERVER_TS',
  familyName: 'Familia Garcia',
  teacherName: 'Miguel Gutierrez',
  studentName: 'Juan Pablo',
});
assert.equal(acceptedClassPayload.createdFrom, 'chat_schedule_proposal');
assert.equal(acceptedClassPayload.assignmentId, 'assignment_1');
assert.equal(acceptedClassPayload.scheduleProposalId, 'proposal_1');
assert.equal(acceptedClassPayload.estado, 'confirmada');
assert.equal(acceptedClassPayload.lifecycleStatus, 'clase_programada');
assert.equal(acceptedClassPayload.durationMinutes, 33);
assert.equal(acceptedClassPayload.familyAmount, 13.2);
assert.equal(acceptedClassPayload.teacherAmount, 9.9);
assert.equal(acceptedClassPayload.participantUids.family_1, true);
assert.equal(acceptedClassPayload.participantUids.teacher_1, true);

const familyDashboard = fs.readFileSync(new URL('../pages/dashboard/familia.html', import.meta.url), 'utf8');
const teacherDashboard = fs.readFileSync(new URL('../pages/dashboard/profesor.html', import.meta.url), 'utf8');
const chatWidget = fs.readFileSync(new URL('../js/chat-widget.js', import.meta.url), 'utf8');
const firestoreRules = fs.readFileSync(new URL('../firebase/firestore.rules', import.meta.url), 'utf8');

assert(familyDashboard.includes('modal-clase-puntual'), 'Family dashboard must expose the one-off class modal in Classes.');
assert(teacherDashboard.includes('modal-clase-puntual'), 'Teacher dashboard must expose the one-off class modal in Classes.');
assert(familyDashboard.includes('id="puntual-fin" step="60"'), 'Family one-off time inputs must allow any minute.');
assert(teacherDashboard.includes('id="puntual-fin" step="60"'), 'Teacher one-off time inputs must allow any minute.');
assert(familyDashboard.includes('validateScheduleAvailability'), 'Family one-off proposals must check teacher availability before saving.');
assert(familyDashboard.includes('Enviar igualmente'), 'Family one-off proposals outside availability must offer an explicit override action.');
assert(familyDashboard.includes("button.dataset.originalText = 'Enviar igualmente'"), 'Family one-off override button must survive the busy-state restore.');
assert(familyDashboard.includes('availabilityOverrideConfirmed'), 'Family one-off proposals must record when a family asks outside availability anyway.');
assert(familyDashboard.includes('Fuera de disponibilidad'), 'Family one-off override warning must use the clear outside-availability label.');
assert(familyDashboard.includes('abrirModalClasePuntualFamilia();'), 'Family one-off button must open the Classes modal.');
assert(teacherDashboard.includes('abrirModalClasePuntualProfesor();'), 'Teacher one-off button must open the Classes modal.');
assert(familyDashboard.includes('cargarPropuestasPuntualesFamilia'), 'Family dashboard must load pending one-off proposals outside chat.');
assert(teacherDashboard.includes('cargarPropuestasPuntualesProfesor'), 'Teacher dashboard must load pending one-off proposals outside chat.');
assert(familyDashboard.includes('Propuesta pendiente'), 'Family dashboard must render pending one-off proposal status.');
assert(teacherDashboard.includes('Propuesta pendiente'), 'Teacher dashboard must render pending one-off proposal status.');
assert(familyDashboard.includes('aceptar-propuesta-puntual-familia'), 'Family dashboard must let families accept a teacher one-off proposal from Classes/Calendar.');
assert(teacherDashboard.includes('aceptar-propuesta-puntual-profesor'), 'Teacher dashboard must let teachers accept a family one-off proposal from Classes/Calendar.');
assert(familyDashboard.includes('buildAcceptedOneOffClassPayload'), 'Family dashboard must create the accepted one-off class directly from the proposal.');
assert(teacherDashboard.includes('buildAcceptedOneOffClassPayload'), 'Teacher dashboard must create the accepted one-off class directly from the proposal.');
assert(!familyDashboard.includes("irA('chat');\n  setTimeout(() => {\n    window.dispatchEvent(new CustomEvent('cd10:open-chat-planner'"), 'Family one-off class button must not route to chat.');
assert(!teacherDashboard.includes("irA('chat');\n  setTimeout(() => {\n    window.dispatchEvent(new CustomEvent('cd10:open-chat-planner'"), 'Teacher one-off class button must not route to chat.');
assert(!chatWidget.includes('data-open-schedule-planner="${SCHEDULE_KIND_ONE_OFF}"'), 'Chat must not expose a one-off class launcher.');
assert(!chatWidget.includes('<option value="${SCHEDULE_KIND_ONE_OFF}"'), 'Chat schedule form must not offer one-off classes.');
assert(chatWidget.includes('const selectedKind = requestedKind === SCHEDULE_KIND_ONE_OFF ? SCHEDULE_KIND_WEEKLY : requestedKind;'), 'Chat must force old one-off planner events back to weekly scheduling.');
[
  'asignacion_id',
  'familia_id',
  'profesor_id',
  'alumno_id',
  'subject',
  'duracion_minutos',
  'source',
  'availabilityOverrideRequested',
  'availabilityOverrideConfirmed',
  'availabilityOverrideReason',
  'availabilityOverrideMessage',
  'one_off_class_proposed_from_classes',
  'one_off_class_accepted_from_classes',
  'one_off_class_rejected_from_classes',
  'horario_rechazado',
].forEach((token) => {
  assert(firestoreRules.includes(token), `Firestore rules must allow one-off class field/event: ${token}.`);
});

console.log('One-off class planner validation passed.');
