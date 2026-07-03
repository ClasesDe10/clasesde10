import {
  buildAdminClassPayload,
  buildClassIncidentPayload,
  buildFamilyConfirmationPayload,
  buildTeacherAttendancePayload,
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

const teacherPayload = buildTeacherAttendancePayload('realizada', 'Todo bien', '', 'teacher_1', '2026-06-30T18:05:00.000Z');
assert(teacherPayload.attendanceStatus === 'pendiente_familia', 'Teacher completion must wait for family confirmation.');
assert(teacherPayload.lifecycleStatus === 'pendiente_confirmacion', 'Teacher completion must enter pending confirmation lifecycle.');
const endedClass = { id: 'class_ended', estado: 'confirmada', fecha: '2026-06-30', hora_inicio: '17:00', hora_fin: '18:00' };
assert(classAttendanceState(endedClass, { nowMs: new Date('2026-06-30T18:10:00').getTime() }).canTeacherRegister, 'Ended classes must ask the teacher to register the result first.');
const pendingFamilyState = classAttendanceState({ ...endedClass, ...teacherPayload }, { nowMs: new Date('2026-06-30T18:10:00').getTime() });
assert(pendingFamilyState.canFamilyConfirm && pendingFamilyState.key === 'pending_family', 'Teacher-marked classes must ask family for confirmation.');

const familyPayload = buildFamilyConfirmationPayload('incidencia', 'No aparecio', 'family_1', '2026-06-30T18:10:00.000Z');
assert(familyPayload.incidentStatus === 'abierta', 'Family incidents must open incident status.');
assert(getClassAttendanceSummary({ ...teacherPayload, ...familyPayload }) === 'incidencia', 'Incident confirmations must summarize as incidencia.');
const confirmedPayload = buildFamilyConfirmationPayload('realizada', '', 'family_1', '2026-06-30T18:12:00.000Z', teacherPayload);
const confirmedState = classAttendanceState({ ...endedClass, ...teacherPayload, ...confirmedPayload }, { nowMs: new Date('2026-06-30T18:15:00').getTime() });
assert(confirmedState.key === 'confirmed_by_both' && !confirmedState.canFamilyConfirm, 'Classes confirmed by both parties must be closed for attendance.');

const incident = buildClassIncidentPayload('class_1', { familyUid: 'family_1', teacherUid: 'teacher_1' }, 'family_confirmation', 'No se dio', 'family_1');
assert(incident.estado === 'abierta' && incident.teacherUid === 'teacher_1', 'Incident payload must include participants and open status.');

const now24h = new Date('2026-06-29T17:30:00').getTime();
assert(classReminderWindows({ fecha: '2026-06-30', hora_inicio: '17:00', estado: 'confirmada' }, now24h).includes('24h'), '24h reminder window must be detected.');
const now2h = new Date('2026-06-30T15:05:00').getTime();
assert(classReminderWindows({ fecha: '2026-06-30', hora_inicio: '17:00', estado: 'confirmada' }, now2h).includes('2h'), '2h reminder window must be detected.');

const calendar = buildIcsCalendar([{ ...adminPayload, id: 'class_1', alumno_nombre: 'Alumno', profesor_nombre: 'Profesor' }], { now: '2026-06-28T10:00:00.000Z' });
assert(calendar.includes('BEGIN:VCALENDAR') && calendar.includes('BEGIN:VEVENT'), 'ICS calendar must include a valid event.');
assert(googleCalendarTemplateUrl(adminPayload).startsWith('https://calendar.google.com/calendar/render?'), 'Google Calendar template URL must be generated.');

console.log('Calendar engine validation passed.');
