import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyAction, renderEmptyState, renderTableEmptyState } from '../js/dashboard-empty-state.js';

const familyDashboard = readFileSync(new URL('../pages/dashboard/familia.html', import.meta.url), 'utf8');
const teacherDashboard = readFileSync(new URL('../pages/dashboard/profesor.html', import.meta.url), 'utf8');
const studentDashboard = readFileSync(new URL('../pages/dashboard/alumno.html', import.meta.url), 'utf8');
const dashboardCss = readFileSync(new URL('../css/dashboard.css', import.meta.url), 'utf8');

const sample = renderTableEmptyState(7, {
  icon: 'i',
  title: 'Sin datos',
  description: 'Explica el siguiente paso.',
  actions: [emptyAction('Continuar', { 'data-section': 'inicio' }, 'primary')],
});
assert.match(sample, /colspan="7"/);
assert.match(sample, /dashboard-empty-state/);
assert.match(sample, /data-section="inicio"/);
assert.match(sample, /Continuar/);

const plain = renderEmptyState({
  title: '<script>',
  description: 'A & B',
});
assert.match(plain, /&lt;script&gt;/);
assert.match(plain, /A &amp; B/);

for (const [name, html] of [
  ['familia', familyDashboard],
  ['profesor', teacherDashboard],
]) {
  assert.match(html, /dashboard-empty-state\.js\?v=20260629-ux-empty-states/, `${name} dashboard must import contextual empty-state helpers.`);
  assert.match(html, /renderTableEmptyState\(/, `${name} dashboard must use table empty states.`);
  assert.match(html, /renderEmptyState\(/, `${name} dashboard must use panel empty states.`);
  assert.match(html, /dashboard\.css\?v=20260629-notifications-polish/, `${name} dashboard must bust CSS cache.`);
}

assert.match(familyDashboard, /Enviar solicitud y avisarme/);
assert.match(familyDashboard, /Guardar y continuar/);
assert.match(familyDashboard, /Enviar justificante a revisión/);
assert.match(familyDashboard, /data-action="abrir-modal-pago"/);
assert.match(familyDashboard, /modal-disponibilidad-hijo/);
assert.match(familyDashboard, /data-action="disponibilidad-hijo"/);
assert.match(familyDashboard, /modal-plan-pago/);
assert.match(familyDashboard, /data-action="plan-pago"/);
assert.match(familyDashboard, /Plan semanal/);
assert.match(familyDashboard, /No dada/);
assert.match(familyDashboard, /Dada/);
assert.match(familyDashboard, /Justificantes pendientes/);
assert.match(familyDashboard, /Aún no hay justificantes registrados/);
assert.doesNotMatch(familyDashboard, /Precio familia/);
assert.doesNotMatch(familyDashboard, /<th>Precio<\/th>/);
assert.doesNotMatch(familyDashboard, /formatEuros\(c\.familyAmount/);
assert.doesNotMatch(familyDashboard, /formatEuros\(p\.monto\)/);
assert.doesNotMatch(familyDashboard, /Sin solicitudes enviadas\./);
assert.doesNotMatch(familyDashboard, /Sin clases\./);

assert.match(teacherDashboard, /Guardar estado/);
assert.match(teacherDashboard, /Guardar franja/);
assert.match(teacherDashboard, /modal-alumno-detalle/);
assert.match(teacherDashboard, /data-action="ver-alumno-profesor"/);
assert.match(teacherDashboard, /student-workbench-summary/);
assert.match(teacherDashboard, /Datos academicos/);
assert.match(teacherDashboard, /Ubicacion/);
assert.match(teacherDashboard, /Notas utiles para preparar clase/);
assert.match(teacherDashboard, /data-action="abrir-modal-disponibilidad"/);
assert.match(teacherDashboard, /formatEuros\(importeProfesorClase\(c\)\)/);
assert.match(teacherDashboard, /Aún no tienes alumnos asignados/);
assert.doesNotMatch(teacherDashboard, /No tienes alumnos asignados aún\./);
assert.doesNotMatch(teacherDashboard, /Sin datos de ingresos\./);

assert.match(dashboardCss, /\.dashboard-empty-state/);
assert.match(dashboardCss, /\.empty-actions/);
assert.match(dashboardCss, /\.empty-state-row td/);
assert.match(dashboardCss, /\.student-detail-grid/);
assert.match(dashboardCss, /\.student-workbench-summary/);
assert.match(dashboardCss, /\.topbar-btn \.topbar-notification-badge[\s\S]*min-width: 18px/);
assert.match(dashboardCss, /\.topbar-btn \.topbar-notification-badge[\s\S]*align-items: center/);
assert.match(teacherDashboard, /topbar-notification-badge/);
assert.match(familyDashboard, /topbar-notification-badge/);
assert.match(studentDashboard, /id="btn-notificaciones"/);
assert.match(studentDashboard, /initNotificacionesBadge/);

console.log('Dashboard empty-state UX validation passed.');
