import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

const [teacherDashboard, dashboardCss] = await Promise.all([
  read('pages/dashboard/profesor.html'),
  read('css/dashboard.css'),
]);

assert(
  teacherDashboard.includes('buildAssignedStudentsFromClasses(clasesMes)'),
  'Mis alumnos must include students inferred from materialized/recurrent classes.',
);
assert(
  teacherDashboard.includes('recurringSchedulesForStudent(clasesMes, item)'),
  'Mis alumnos must compute the weekly recurring schedule per student.',
);
assert(
  teacherDashboard.includes('renderStudentScheduleCell(alumno)'),
  'Mis alumnos must render notes and recurring schedule in the table.',
);
assert(
  teacherDashboard.includes('Notas / horario'),
  'Teacher students table must label the cell as notes/schedule, not only objective notes.',
);
assert(
  dashboardCss.includes('.student-schedule-list'),
  'Recurring schedule pills must have dedicated responsive styles.',
);

console.log('Teacher students recurring schedule checks passed.');
