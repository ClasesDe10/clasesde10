import {
  buildAdminClassPayload,
  buildClassIncidentPayload,
  buildFamilyConfirmationPayload,
  buildParticipantClassIncidentCreatePayload,
  buildTeacherAttendancePayload,
  classAttendanceCalendarVisual,
  classAttendanceReminderState,
  classAttendanceState,
  classReminderWindows,
  classStatusForBadge,
  getClassAttendanceSummary,
  isScheduledClassStatus,
  normalizeClassStatus,
  validateClassTimeRange,
} from '../js/calendar-engine.js';
import {
  buildIcsCalendar,
  googleCalendarTemplateUrl,
} from '../js/calendar-sync.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(normalizeClassStatus('programada') === 'confirmada', 'Legacy programada status must normalize to confirmada.');
assert(isScheduledClassStatus('programada'), 'Legacy programada status must remain schedulable.');
assert(classStatusForBadge({ estado: 'realizada', familyPaymentStatus: 'pagado' }) === 'pagada', 'Paid completed classes must render as pagada.');

const validation = validateClassTimeRange('2026-06-29', '17:00', '18:30');
assert(validation.valid && validation.durationMinutes === 90, 'Valid class ranges must compute duration.');
assert(!validateClassTimeRange('2026-06-29', '18:30', '17:00').valid, 'Invalid ranges must be rejected.');

const previous = {
  id: 'class_1',
  fecha: '2026-06-29',
  hora_inicio: '17:00',
  hora_fin: '18:00',
  estado: 'confirmada',
};
const adminPayload = buildAdminClassPayload({
  profesor_id: 'teacher_1',
  familyUid: 'family_1',
  alumno_id: 'student_1',
  fecha: '2026-06-30',
  materia: 'Matematicas',
  hora_inicio: '17:00',
  hora_fin: '18:00',
  precio_total: 25,
  importe_profesor: 18,
  estado: 'confirmada',
}, previous, { nowIso: '2026-06-28T10:00:00.000Z', calendarUid: 'cal_1' });
assert(adminPayload.estado === 'reprogramada', 'Schedule changes must mark the class as reprogramada.');
assert(adminPayload.lifecycleStatus === 'reprogramada', 'Schedule changes must preserve lifecycle reprogramada state.');
assert(adminPayload.platformFee === 7, 'Admin payload must calculate platform fee.');
assert(adminPayload.previousSchedule?.fecha === '2026-06-29', 'Admin payload must preserve previous schedule metadata.');

const hourlyAdminPayload = buildAdminClassPayload({
  profesor_id: 'teacher_1',
  familyUid: 'family_1',
  alumno_id: 'student_1',
  fecha: '2026-06-30',
  materia: 'Matematicas',
  hora_inicio: '17:00',
  hora_fin: '18:30',
  familyHourlyRate: 30,
  teacherHourlyRate: 20,
  precio_total: 999,
  importe_profesor: 999,
  estado: 'confirmada',
}, {}, { nowIso: '2026-06-28T10:00:00.000Z', calendarUid: 'cal_hourly' });
assert(hourlyAdminPayload.durationMinutes === 90, 'Hourly class payload must compute duration from the time range.');
assert(hourlyAdminPayload.precio_total === 45, 'Hourly family rate must be prorated by real class duration.');
assert(hourlyAdminPayload.importe_profesor === 30, 'Hourly teacher rate must be prorated by real class duration.');
assert(hourlyAdminPayload.precio_hora_familia === 30, 'Class payload must preserve family hourly rate.');
assert(hourlyAdminPayload.importe_hora_profesor === 20, 'Class payload must preserve teacher hourly rate.');

const legacyShortPayload = buildAdminClassPayload({
  profesor_id: 'teacher_1',
  familyUid: 'family_1',
  alumno_id: 'student_1',
  fecha: '2026-07-10',
  materia: 'Matematicas',
  hora_inicio: '17:30',
  hora_fin: '18:03',
  precio_total: 32,
  importe_profesor: 24,
  estado: 'confirmada',
}, {}, { nowIso: '2026-07-04T10:00:00.000Z', calendarUid: 'cal_short_legacy' });
assert(legacyShortPayload.durationMinutes === 33, 'Legacy short class payload must use the real time range.');
assert(legacyShortPayload.precio_total === 17.6, 'Legacy short class family amount must be prorated from hourly price.');
assert(legacyShortPayload.importe_profesor === 13.2, 'Legacy short class teacher amount must be prorated from hourly price.');
assert(legacyShortPayload.precio_hora_familia === 32, 'Legacy short class must infer family hourly rate.');
assert(legacyShortPayload.importe_hora_profesor === 24, 'Legacy short class must infer teacher hourly rate.');

const teacherPayload = buildTeacherAttendancePayload('realizada', 'Todo bien', '', 'teacher_1', '2026-06-30T18:05:00.000Z');
assert(teacherPayload.attendanceStatus === 'pendiente_familia', 'Teacher completion must wait for family confirmation.');
assert(teacherPayload.lifecycleStatus === 'pendiente_confirmacion', 'Teacher completion must enter pending confirmation lifecycle.');
const notGivenPayload = buildTeacherAttendancePayload('no_realizada', '', 'No se conecto', 'teacher_1', '2026-06-30T18:06:00.000Z');
assert(notGivenPayload.estado === 'cancelada' && notGivenPayload.teacherConfirmationStatus === 'no_realizada', 'Teacher no-show marking must cancel the class with no_realizada attendance.');
assert(notGivenPayload.incidentStatus === 'abierta' && notGivenPayload.cancelacion_motivo === 'No se conecto', 'Teacher no-show marking must open a traceable incident.');
const endedClass = { id: 'class_ended', estado: 'confirmada', fecha: '2026-06-30', hora_inicio: '17:00', hora_fin: '18:00' };
const endedClassNow = new Date('2026-06-30T18:10:00').getTime();
const endedClassState = classAttendanceState(endedClass, { nowMs: endedClassNow });
const endedClassVisual = classAttendanceCalendarVisual(endedClass, { nowMs: endedClassNow });
assert(endedClassState.canTeacherRegister, 'Ended classes must ask the teacher to register the result first.');
assert(endedClassState.key === 'pending_teacher' && endedClassState.tone === 'danger', 'An ended unmarked class must immediately become a review state.');
assert(endedClassVisual.dotClass === 'dot-red' && endedClassVisual.calendarLabel === 'Revisar', 'An ended unmarked class must be red and explicitly labelled Revisar.');
const futureClassVisual = classAttendanceCalendarVisual(endedClass, { nowMs: new Date('2026-06-30T17:30:00').getTime() });
assert(futureClassVisual.dotClass === 'dot-blue' && futureClassVisual.key === 'scheduled', 'A class that has not ended must remain blue and scheduled.');
const legacyCompletedVisual = classAttendanceCalendarVisual({ ...endedClass, estado: 'realizada' }, { nowMs: endedClassNow });
assert(legacyCompletedVisual.key === 'pending_family' && legacyCompletedVisual.dotClass === 'dot-amber', 'A legacy realizada status must count as a teacher result instead of becoming a false red review.');
const legacyTeacherFieldVisual = classAttendanceCalendarVisual({ ...endedClass, confirmacion_profesor: 'realizada' }, { nowMs: endedClassNow });
assert(legacyTeacherFieldVisual.key === 'pending_family', 'Legacy teacher confirmation fields must avoid false unmarked alerts.');
const cancelledVisual = classAttendanceCalendarVisual({ ...endedClass, estado: 'cancelada' }, { nowMs: endedClassNow });
assert(cancelledVisual.dotClass === 'dot-gray' && cancelledVisual.key === 'cancelled', 'A closed cancellation must be gray, not red, because it needs no action.');
assert(classAttendanceReminderState(endedClass, { nowMs: new Date('2026-07-01T18:01:00').getTime() }).isOverdue, 'Teacher attendance reminder must become overdue 24h after class end.');
assert(!classAttendanceReminderState({ ...endedClass, ...teacherPayload }, { nowMs: new Date('2026-07-01T18:01:00').getTime() }).needsTeacherResult, 'Teacher-marked classes must not keep asking for teacher result.');
const pendingFamilyState = classAttendanceState({ ...endedClass, ...teacherPayload }, { nowMs: new Date('2026-06-30T18:10:00').getTime() });
assert(pendingFamilyState.canFamilyConfirm && pendingFamilyState.key === 'pending_family', 'Teacher-marked classes must ask family for confirmation.');
assert(classAttendanceCalendarVisual({ ...endedClass, ...teacherPayload }, { nowMs: endedClassNow }).dotClass === 'dot-amber', 'Family confirmation pending must use amber.');

const familyPayload = buildFamilyConfirmationPayload('incidencia', 'No aparecio', 'family_1', '2026-06-30T18:10:00.000Z');
assert(familyPayload.incidentStatus === 'abierta', 'Family incidents must open incident status.');
assert(getClassAttendanceSummary({ ...teacherPayload, ...familyPayload }) === 'incidencia', 'Incident confirmations must summarize as incidencia.');
const confirmedPayload = buildFamilyConfirmationPayload('realizada', '', 'family_1', '2026-06-30T18:12:00.000Z', teacherPayload);
const confirmedState = classAttendanceState({ ...endedClass, ...teacherPayload, ...confirmedPayload }, { nowMs: new Date('2026-06-30T18:15:00').getTime() });
assert(confirmedState.key === 'confirmed_by_both' && !confirmedState.canFamilyConfirm, 'Classes confirmed by both parties must be closed for attendance.');
assert(classAttendanceCalendarVisual({ ...endedClass, ...teacherPayload, ...confirmedPayload }, { nowMs: endedClassNow }).dotClass === 'dot-emerald', 'Closed attendance must use green.');

const incident = buildClassIncidentPayload('class_1', { familyUid: 'family_1', teacherUid: 'teacher_1' }, 'family_confirmation', 'No se dio', 'family_1');
assert(incident.estado === 'abierta' && incident.teacherUid === 'teacher_1', 'Incident payload must include participants and open status.');
const participantIncident = buildParticipantClassIncidentCreatePayload(
  'class_1',
  { familyUid: 'family_1', teacherUid: 'teacher_1', studentId: 'student_1' },
  'teacher_update',
  'No se conecto',
  { uid: 'teacher_1', email: 'teacher@example.com' },
);
assert(participantIncident.estado === 'abierta' && participantIncident.createdByUid === 'teacher_1', 'Participant incident payload must be Firestore-rules compatible.');
assert(!Object.prototype.hasOwnProperty.call(participantIncident, 'id'), 'Participant incident payload must not include client-side document ids.');

const now24h = new Date('2026-06-29T17:30:00').getTime();
assert(classReminderWindows({ fecha: '2026-06-30', hora_inicio: '17:00', estado: 'confirmada' }, now24h).includes('24h'), '24h reminder window must be detected.');
const now2h = new Date('2026-06-30T15:05:00').getTime();
assert(classReminderWindows({ fecha: '2026-06-30', hora_inicio: '17:00', estado: 'confirmada' }, now2h).includes('2h'), '2h reminder window must be detected.');

const calendar = buildIcsCalendar([{ ...adminPayload, id: 'class_1', alumno_nombre: 'Alumno', profesor_nombre: 'Profesor' }], { now: '2026-06-28T10:00:00.000Z' });
assert(calendar.includes('BEGIN:VCALENDAR') && calendar.includes('BEGIN:VEVENT'), 'ICS calendar must include a valid event.');
assert(googleCalendarTemplateUrl(adminPayload).startsWith('https://calendar.google.com/calendar/render?'), 'Google Calendar template URL must be generated.');

console.log('Calendar engine validation passed.');
