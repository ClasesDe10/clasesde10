import assert from 'node:assert/strict';
import {
  availabilitySlotLabel,
  findCoveringAvailabilitySlot,
  summarizeAvailabilitySlots,
  validateScheduleAvailability,
  weekdayIndexFromDate,
} from '../js/availability-engine.js';

const teacherSlots = [
  { id: 'teacher_monday', teacherUid: 'teacher_1', profesor_id: 'teacher_1', dia_semana: 0, hora_inicio: '17:00', hora_fin: '19:00' },
  { id: 'teacher_thursday', teacherUid: 'teacher_1', profesor_id: 'teacher_1', dia_semana: 3, hora_inicio: '18:00', hora_fin: '20:00' },
];
const studentSlots = [
  { id: 'student_monday', familyUid: 'family_1', familia_id: 'family_1', studentId: 'student_1', alumno_id: 'student_1', dia_semana: 0, hora_inicio: '16:30', hora_fin: '18:30' },
];

assert.equal(weekdayIndexFromDate('2026-06-29'), 0, 'Monday must be stored as 0.');
assert.equal(weekdayIndexFromDate('2026-07-05'), 6, 'Sunday must be stored as 6.');
assert.equal(availabilitySlotLabel(teacherSlots[0]), 'Lunes 17:00-19:00');
assert.match(summarizeAvailabilitySlots(teacherSlots), /Lunes 17:00-19:00/);

assert.equal(findCoveringAvailabilitySlot(teacherSlots, '2026-06-29', '17:30', '18:00')?.id, 'teacher_monday');
assert.equal(findCoveringAvailabilitySlot(teacherSlots, '2026-06-29', '16:30', '17:30'), null);

const familyOk = validateScheduleAvailability({
  role: 'familia',
  fecha: '2026-06-29',
  horaInicio: '17:30',
  horaFin: '18:00',
  teacherSlots,
  studentSlots,
});
assert.equal(familyOk.valid, true);
assert.equal(familyOk.reason, 'matched');
assert.equal(familyOk.teacherSlot.id, 'teacher_monday');
assert.equal(familyOk.studentSlot.id, 'student_monday');

const teacherMissingStudent = validateScheduleAvailability({
  role: 'profesor',
  fecha: '2026-06-29',
  horaInicio: '17:30',
  horaFin: '18:00',
  teacherSlots,
  studentSlots: [],
});
assert.equal(teacherMissingStudent.valid, false);
assert.equal(teacherMissingStudent.reason, 'counterparty_availability_missing');

const outsideTeacher = validateScheduleAvailability({
  role: 'familia',
  fecha: '2026-06-29',
  horaInicio: '19:00',
  horaFin: '20:00',
  teacherSlots,
  studentSlots,
});
assert.equal(outsideTeacher.valid, false);
assert.equal(outsideTeacher.reason, 'outside_counterparty_availability');

const outsideOwn = validateScheduleAvailability({
  role: 'familia',
  fecha: '2026-06-29',
  horaInicio: '18:30',
  horaFin: '19:00',
  teacherSlots,
  studentSlots,
});
assert.equal(outsideOwn.valid, false);
assert.equal(outsideOwn.reason, 'outside_own_availability');

console.log('Availability engine validation passed.');
