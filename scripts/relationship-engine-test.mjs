import {
  buildRelationshipRecord,
  buildRelationshipsFromCollections,
  relationshipStageLabel,
  summarizeRelationships,
} from '../js/relationship-engine.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const nowMs = new Date('2026-06-30T18:30:00.000Z').getTime();

const request = {
  id: 'req_1',
  familia_id: 'fam_1',
  alumno_id: 'stu_1',
  materia: 'Matematicas',
  estado: 'pendiente',
  createdAt: '2026-06-28T10:00:00.000Z',
};
const assignment = {
  id: 'asig_1',
  solicitud_id: 'req_1',
  familia_id: 'fam_1',
  profesor_id: 'prof_1',
  alumno_id: 'stu_1',
  materia: 'Matematicas',
  activa: true,
  createdAt: '2026-06-29T10:00:00.000Z',
};
const chat = {
  id: 'asig_1',
  assignmentId: 'asig_1',
  familyUid: 'fam_1',
  teacherUid: 'prof_1',
  studentId: 'stu_1',
  schedulingStatus: 'pendiente_horario',
  active: true,
  updatedAt: '2026-06-29T11:00:00.000Z',
};

assert(buildRelationshipRecord({ request }, { nowMs }).stage === 'matching_en_proceso', 'Old unassigned requests must stay in matching.');
assert(buildRelationshipRecord({ request, assignment }, { nowMs }).stage === 'chat_pendiente', 'Assignments without chat must ask for chat repair.');
assert(buildRelationshipRecord({ request, assignment, chat }, { nowMs }).stage === 'pendiente_horario', 'Assignments with chat but no class must ask for schedule.');
assert(buildRelationshipRecord({
  request,
  assignment,
  chat,
  scheduleProposals: [{ id: 'prop_1', assignmentId: 'asig_1', status: 'propuesta' }],
}, { nowMs }).stage === 'horario_propuesto', 'Pending schedule proposals must be explicit.');

assert(buildRelationshipRecord({
  request,
  assignment,
  chat,
  classes: [{ id: 'class_1', assignmentId: 'asig_1', estado: 'confirmada', fecha: '2026-07-01', hora_inicio: '17:00', hora_fin: '18:00' }],
}, { nowMs }).stage === 'clase_programada', 'Future confirmed classes must be scheduled.');

assert(buildRelationshipRecord({
  request,
  assignment,
  chat,
  classes: [{ id: 'class_2', assignmentId: 'asig_1', estado: 'confirmada', fecha: '2026-06-30', hora_inicio: '15:00', hora_fin: '16:00' }],
}, { nowMs }).stage === 'pendiente_confirmacion', 'Ended scheduled classes must request confirmation.');

assert(buildRelationshipRecord({
  request,
  assignment,
  chat,
  classes: [{
    id: 'class_3',
    assignmentId: 'asig_1',
    estado: 'realizada',
    fecha: '2026-06-30',
    hora_inicio: '15:00',
    hora_fin: '16:00',
    teacherConfirmationStatus: 'realizada',
    familyConfirmationStatus: 'realizada',
    familyPaymentStatus: 'pendiente',
  }],
}, { nowMs }).stage === 'pago_pendiente', 'Confirmed unpaid classes must move to payment pending.');

assert(buildRelationshipRecord({
  request,
  assignment,
  chat,
  payments: [{ id: 'pay_1', assignmentId: 'asig_1', paymentType: 'family_payment', estado: 'pendiente', dueAt: '2026-06-01T00:00:00.000Z' }],
}, { nowMs }).stage === 'pago_vencido', 'Overdue payments must dominate payment pending.');

assert(buildRelationshipRecord({
  request,
  assignment,
  chat,
  incidents: [{ id: 'inc_1', assignmentId: 'asig_1', estado: 'abierta' }],
}, { nowMs }).stage === 'incidencia_abierta', 'Open incidents must dominate the relationship stage.');

const relationships = buildRelationshipsFromCollections({
  requests: [request],
  assignments: [assignment],
  chats: [chat],
  classes: [{ id: 'class_4', assignmentId: 'asig_1', estado: 'confirmada', fecha: '2026-07-01', hora_inicio: '17:00', hora_fin: '18:00' }],
  payments: [{ id: 'pay_2', classId: 'class_4', paymentType: 'family_payment', estado: 'pendiente' }],
  documents: [{ id: 'doc_1', ownerUid: 'prof_1', estado: 'pendiente' }],
  teachers: [{ id: 'prof_1', nombre: 'Ana', profileCompletionPercent: 70 }],
  families: [{ id: 'fam_1', nombre: 'Familia Garcia', profileCompletionPercent: 90 }],
  students: [{ id: 'stu_1', nombre: 'Lucas' }],
}, { nowMs });

assert(relationships.length === 1, 'Collections must collapse linked modules into one relationship.');
assert(relationships[0].counts.documents === 1, 'User documents must attach to participant relationships.');
assert(relationships[0].modules.chat === true && relationships[0].modules.calendar === true && relationships[0].modules.payments === true, 'Relationship modules must report connected surfaces.');
assert(relationships[0].nextActions.admin.length === 1, 'Admin must receive one primary next action.');
assert(relationshipStageLabel(relationships[0].stage), 'Stage labels must be available for UI.');

const relationshipWithCancellations = buildRelationshipRecord({
  request,
  assignment,
  chat,
  classes: [
    { id: 'class_done', assignmentId: 'asig_1', estado: 'pagada', fecha: '2026-06-20', hora_inicio: '17:00', updatedAt: '2026-06-20T18:00:00.000Z' },
    { id: 'class_cancelled', assignmentId: 'asig_1', estado: 'cancelada', fecha: '2026-06-24', hora_inicio: '17:00', updatedAt: '2026-06-24T17:00:00.000Z' },
  ],
}, { nowMs });

assert(relationshipWithCancellations.counts.completedClasses === 1, 'Completed class count must be exposed for relationship follow-up.');
assert(relationshipWithCancellations.counts.cancelledClasses === 1, 'Cancelled class count must be exposed for preventive relationship follow-up.');
assert(relationshipWithCancellations.lastCompletedClassAt, 'Last completed class date must be exposed.');
assert(relationshipWithCancellations.lastCancelledClassAt, 'Last cancelled class date must be exposed.');
assert(relationshipWithCancellations.history.cancelledClassDates.length === 1, 'Cancellation history must be compact and queryable.');

const summary = summarizeRelationships(relationships);
assert(summary.total === 1, 'Summary must count relationships.');
assert(summary.avgHealth <= 100 && summary.avgHealth >= 0, 'Summary health must stay bounded.');

console.log('Relationship engine validation passed.');
