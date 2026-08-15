import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const dashboard = fs.readFileSync('pages/dashboard/profesor.html', 'utf8');
const css = fs.readFileSync('css/dashboard.css', 'utf8');
const section = dashboard.slice(
  dashboard.indexOf('<section id="section-clases"'),
  dashboard.indexOf('<section id="section-alumnos"'),
);

for (const heading of ['<th>Cuándo</th>', '<th>Alumno</th>', '<th>Estado</th>', '<th>Acción</th>']) {
  assert(section.includes(heading), `Teacher class list is missing the compact heading ${heading}.`);
}
for (const removedHeading of ['<th>Materia</th>', '<th>Duración</th>', '<th>Ingreso</th>', '<th>Seguimiento</th>']) {
  assert(!section.includes(removedHeading), `Teacher class list must move ${removedHeading} into the detail dialog.`);
}
for (const detailLabel of ['Detalle de la clase', '<span>Materia</span>', '<span>Duración</span>', '<span>Ingreso</span>', '<h3>Seguimiento</h3>', '<h3>Cobro</h3>']) {
  assert(dashboard.includes(detailLabel), `Teacher class detail dialog is missing ${detailLabel}.`);
}
assert(dashboard.includes('data-action="ver-detalle-clase-profesor"'), 'Each teacher class must expose a detail action.');
assert(dashboard.includes("openModal('modal-clase-detalle-profesor')"), 'Teacher class details must use the accessible modal flow.');
assert(dashboard.includes('sortTeacherClassesForList'), 'Teacher classes must be ordered for quick scanning.');
assert(css.includes('.teacher-classes-table tbody tr:hover { background: transparent; }'), 'Non-clickable class rows must not use a misleading hover effect.');
assert(css.includes('.modal.teacher-class-detail-modal'), 'Teacher class detail dialog must have a restrained responsive layout.');

console.log('Teacher classes compact UI test passed.');
