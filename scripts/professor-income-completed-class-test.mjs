import { readFile } from 'node:fs/promises';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = await readFile(new URL('../pages/dashboard/profesor.html', import.meta.url), 'utf8');

assert(source.includes('function esClaseConIngresoProfesor'), 'Professor dashboard must centralize payable class detection.');
assert(source.includes('teacherConfirmationStatus'), 'Teacher-marked completed classes must count as professor income.');
assert(source.includes('teacherAttendanceStatus'), 'Legacy teacher attendance fields must count as professor income.');
assert(source.includes('attendanceBlockedValue'), 'Cancelled, disputed or incident classes must be excluded from professor income.');
assert(source.includes('attendanceDoneValue(profesor)'), 'Professor income must not depend only on attendanceStatus.');

console.log('Professor completed class income validation passed.');
