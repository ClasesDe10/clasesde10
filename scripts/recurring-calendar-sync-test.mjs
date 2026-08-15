import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  ensureRecurringClassOccurrencesForRange,
  missingRecurringOccurrences,
  recurringScheduleSeedsFromAcceptedProposals,
  recurringOccurrenceId,
} from '../js/recurring-class-sync.js';

const root = process.cwd();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

const seed = {
  id: 'class_chat_abc_proposal_123',
  calendarUid: 'class_chat_abc_proposal_123',
  profesor_id: 'teacher-auth',
  teacherUid: 'teacher-auth',
  familia_id: 'family-auth',
  familyUid: 'family-auth',
  alumno_id: 'student-1',
  studentId: 'student-1',
  fecha: '2026-06-03',
  date: '2026-06-03',
  materia: 'Matematicas',
  subject: 'Matematicas',
  hora_inicio: '17:00',
  startTime: '17:00',
  hora_fin: '18:00',
  endTime: '18:00',
  duracion_minutos: 60,
  durationMinutes: 60,
  precio_total: 32,
  amount: 32,
  familyAmount: 32,
  importe_profesor: 24,
  teacherAmount: 24,
  precio_hora_familia: 32,
  familyHourlyRate: 32,
  importe_hora_profesor: 24,
  teacherHourlyRate: 24,
  comision_clasesde10: 8,
  platformFee: 8,
  marginPct: 25,
  estado: 'realizada',
  status: 'realizada',
  lifecycleStatus: 'pendiente_confirmacion',
  attendanceStatus: 'confirmada_por_ambas_partes',
  teacherConfirmationStatus: 'realizada',
  familyConfirmationStatus: 'realizada',
  confirmacion_familia: 'realizada',
  paymentStatus: 'pagado',
  familyPaymentStatus: 'pagado',
  estado_pago: 'pagado',
  estado_pago_familia: 'pagado',
  teacherPaymentStatus: 'pagado',
  estado_pago_profesor: 'pagado',
  assignmentId: 'chat_abc',
  asignacion_id: 'chat_abc',
  scheduleProposalId: 'proposal_123',
  classSeriesId: 'proposal_123',
  seriesId: 'proposal_123',
  seriesIndex: 0,
  seriesTotal: 5,
  seriesStartDate: '2026-06-03',
  seriesEndDate: '2026-06-30',
  isRecurring: true,
  recurrence: {
    frequency: 'weekly',
    dayOfWeek: 2,
    startTime: '17:00',
    endTime: '18:00',
    timezone: 'Europe/Madrid',
  },
  recurrenceLabel: 'Todos los miercoles 17:00-18:00',
  parentClassId: 'class_chat_abc_proposal_123',
  createdFrom: 'chat_schedule_proposal',
  schedulingStatus: 'confirmed',
  familyName: 'Familia Prueba',
  teacherName: 'Profesor Prueba',
  studentName: 'Alumno Prueba',
  familia_nombre: 'Familia Prueba',
  profesor_nombre: 'Profesor Prueba',
  alumno_nombre: 'Alumno Prueba',
  participantUids: {
    'teacher-auth': true,
    'family-auth': true,
  },
  createdByUid: 'family-auth',
  createdByRole: 'familia',
  createdAt: 'old',
  updatedAt: 'old',
  updated_at: 'old',
  cancelledAt: 'extra-field-that-must-not-be-written',
};

const missing = missingRecurringOccurrences([seed], '2026-07-01', '2026-07-31', {
  currentUid: 'teacher-auth',
  currentRole: 'profesor',
  serverTimestamp: () => 'SERVER_TIMESTAMP',
  bufferDays: 0,
});

assert(missing.length === 5, 'A weekly series ending in June must generate the missing July classes.');
assert(missing[0].fecha === '2026-07-01', 'The first generated July occurrence must keep the weekly cadence.');
assert(missing[0].seriesIndex === 4, 'Generated occurrences must preserve the series index.');
assert(missing[0].paymentStatus === 'pendiente', 'Generated occurrences must reset family payment state.');
assert(missing[0].teacherConfirmationStatus === null, 'Generated occurrences must reset teacher attendance state.');
assert(missing[0].participantUids['teacher-auth'] === true, 'Generated occurrences must include the active participant UID.');
assert(!('cancelledAt' in missing[0]), 'Generated write payloads must drop fields outside class create rules.');
assert(
  recurringOccurrenceId(seed, '2026-07-01', 4) === 'class_chat_abc_proposal_123_20260701',
  'Generated recurring class ids must be deterministic by date.',
);

const writes = [];
const written = await ensureRecurringClassOccurrencesForRange({
  firebaseDb: {},
  firestoreDoc: (_db, collection, id) => ({ collection, id }),
  setDoc: async (ref, payload) => writes.push({ ref, payload }),
  serverTimestamp: () => 'SERVER_TIMESTAMP',
  classes: [seed],
  rangeStart: '2026-07-01',
  rangeEnd: '2026-07-31',
  currentUid: 'teacher-auth',
  currentRole: 'profesor',
  bufferDays: 0,
});

assert(written.length === 5, 'Calendar sync must return the generated occurrences for immediate rendering.');
assert(writes.length === 5, 'Calendar sync must persist every missing occurrence.');
assert(writes[0].ref.id === 'class_chat_abc_proposal_123_20260701', 'Calendar sync must write the deterministic class id.');
assert(!('id' in writes[0].payload), 'Firestore class documents must not include the local id field.');
assert(writes[0].payload.createdAt === 'SERVER_TIMESTAMP', 'Generated occurrences must use server timestamps on create.');
assert(writes[0].payload.status === 'confirmada', 'Generated occurrences must be scheduled classes, not copied completed classes.');

const acceptedChat = {
  id: 'chat_legacy',
  teacherUid: 'teacher-auth',
  profesor_id: 'teacher-auth',
  familyUid: 'family-auth',
  familia_id: 'family-auth',
  studentId: 'student-1',
  alumno_id: 'student-1',
  materia: 'Matematicas',
  familyName: 'Esperanza Gonzalvo Cirac',
  teacherName: 'Miguel Gutierrez de Cabiedes Gonzalvo',
  studentName: 'Juan Pablo',
  participantUids: {
    'teacher-auth': true,
    'family-auth': true,
  },
};
const legacyWednesdayClass = {
  id: 'chat_chat_legacy_wed',
  calendarUid: 'chat_chat_legacy_wed',
  assignmentId: 'chat_legacy',
  asignacion_id: 'chat_legacy',
  teacherUid: 'teacher-auth',
  profesor_id: 'teacher-auth',
  familyUid: 'family-auth',
  familia_id: 'family-auth',
  studentId: 'student-1',
  alumno_id: 'student-1',
  fecha: '2026-07-01',
  date: '2026-07-01',
  hora_inicio: '17:00',
  startTime: '17:00',
  hora_fin: '18:00',
  endTime: '18:00',
  duracion_minutos: 60,
  durationMinutes: 60,
  materia: 'Matematicas',
  estado: 'confirmada',
  status: 'confirmada',
  participantUids: {
    'teacher-auth': true,
    'family-auth': true,
  },
};
const legacyMondayClass = {
  ...legacyWednesdayClass,
  id: 'chat_chat_legacy_mon',
  calendarUid: 'chat_chat_legacy_mon',
  fecha: '2026-07-06',
  date: '2026-07-06',
  hora_inicio: '17:30',
  startTime: '17:30',
  hora_fin: '18:03',
  endTime: '18:03',
  duracion_minutos: 33,
  durationMinutes: 33,
};
const legacyProposals = [
  {
    id: 'wed',
    chatId: 'chat_legacy',
    status: 'aceptada',
    scheduleKind: 'weekly_recurring',
    fecha: '2026-07-01',
    firstClassDate: '2026-07-01',
    hora_inicio: '17:00',
    hora_fin: '18:00',
    durationMinutes: 60,
    materia: 'Matematicas',
    recurrence: { frequency: 'weekly', dayOfWeek: 2, startTime: '17:00', endTime: '18:00', timezone: 'Europe/Madrid' },
    recurrenceLabel: 'Todos los miercoles 17:00-18:00',
  },
  {
    id: 'mon',
    chatId: 'chat_legacy',
    status: 'aceptada',
    scheduleKind: 'weekly_recurring',
    fecha: '2026-07-06',
    firstClassDate: '2026-07-06',
    hora_inicio: '17:30',
    hora_fin: '18:03',
    durationMinutes: 33,
    materia: 'Matematicas',
    recurrence: { frequency: 'weekly', dayOfWeek: 0, startTime: '17:30', endTime: '18:03', timezone: 'Europe/Madrid' },
    recurrenceLabel: 'Todos los lunes 17:30-18:03',
  },
];
const legacyClasses = [legacyWednesdayClass, legacyMondayClass];
const proposalSeeds = recurringScheduleSeedsFromAcceptedProposals([acceptedChat], legacyProposals, legacyClasses);
const legacyMissing = missingRecurringOccurrences(legacyClasses, '2026-07-01', '2026-07-31', {
  currentUid: 'teacher-auth',
  currentRole: 'profesor',
  serverTimestamp: () => 'SERVER_TIMESTAMP',
  bufferDays: 0,
  recurrenceSeeds: proposalSeeds,
});
const legacyDates = legacyMissing.map((item) => `${item.fecha} ${item.hora_inicio}-${item.hora_fin}`).sort();
assert(proposalSeeds.length === 2, 'Accepted weekly chat proposals must become recurring calendar seeds.');
assert(
  legacyDates.join('|') === [
    '2026-07-08 17:00-18:00',
    '2026-07-13 17:30-18:03',
    '2026-07-15 17:00-18:00',
    '2026-07-20 17:30-18:03',
    '2026-07-22 17:00-18:00',
    '2026-07-27 17:30-18:03',
    '2026-07-29 17:00-18:00',
  ].join('|'),
  'Legacy accepted weekly schedules must render every missing July occurrence without duplicating the first class.',
);

const [family, teacher, student, rules] = await Promise.all([
  read('pages/dashboard/familia.html'),
  read('pages/dashboard/profesor.html'),
  read('pages/dashboard/alumno.html'),
  read('firebase/firestore.rules'),
]);

for (const [name, html] of [['family', family], ['teacher', teacher]]) {
  assert(html.includes('recurring-class-sync.js?v=20260706-recurring-chat-seeds'), `${name} dashboard must import recurring calendar sync.`);
  assert(html.includes('loadParticipantClasses'), `${name} dashboard must read classes through participantUids.`);
  assert(html.includes('loadAcceptedRecurringScheduleSeeds'), `${name} dashboard must use accepted weekly chat proposals as recurring seeds.`);
  assert(html.includes('ensureRecurringClassOccurrencesForRange'), `${name} dashboard must materialize missing recurring occurrences.`);
  assert(html.includes('missingRecurringOccurrences(rows, options.desde, options.hasta'), `${name} dashboard must display recurring occurrences even if persistence is blocked.`);
  assert(html.includes('recurrenceSeeds'), `${name} dashboard must pass chat-derived recurrence seeds into calendar expansion.`);
  assert(html.includes("currentRole: 'familia'") || html.includes("currentRole: 'profesor'"), `${name} dashboard must write occurrences with the active role.`);
}

assert(student.includes('recurring-class-sync.js?v=20260706-recurring-calendar-sync'), 'student dashboard must import recurring calendar sync.');
assert(student.includes('missingRecurringOccurrences(rows, options.desde, options.hasta'), 'student dashboard must expand weekly recurring classes locally.');
assert(student.includes('cargarClasesAlumno({ desde: desdeCalculo, hasta'), 'student calendar must load a seed range before the visible month.');
assert(student.includes("currentRole: 'alumno'"), 'student recurring expansion must identify the active role.');

assert(rules.includes("get(proposalPath).data.status == 'aceptada'"), 'Rules must allow extending an already accepted weekly series.');
assert(rules.includes("get(proposalPath).data.scheduleKind == 'weekly_recurring'"), 'Rules must limit accepted proposal extensions to weekly recurring series.');
assert(rules.includes('request.resource.data.seriesIndex < 260'), 'Rules must allow multi-year recurring indexes without opening unbounded writes.');
assert(rules.includes('request.resource.data.seriesTotal <= 260'), 'Rules must cap recurring class extension writes.');

console.log('Recurring calendar sync checks passed.');
