import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyAction, renderEmptyState, renderTableEmptyState } from '../js/dashboard-empty-state.js';

const familyDashboard = readFileSync(new URL('../pages/dashboard/familia.html', import.meta.url), 'utf8');
const teacherDashboard = readFileSync(new URL('../pages/dashboard/profesor.html', import.meta.url), 'utf8');
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
  assert.match(html, /dashboard\.css\?v=20260629-chat-layout/, `${name} dashboard must bust CSS cache.`);
}

assert.match(familyDashboard, /Enviar solicitud y avisarme/);
assert.match(familyDashboard, /Guardar y continuar/);
assert.match(familyDashboard, /Enviar justificante a revisión/);
assert.match(familyDashboard, /data-action="abrir-modal-pago"/);
assert.match(familyDashboard, /modal-disponibilidad-hijo/);
assert.match(familyDashboard, /data-action="disponibilidad-hijo"/);
assert.match(familyDashboard, /Reportar incidencia/);
assert.doesNotMatch(familyDashboard, /Sin solicitudes enviadas\./);
assert.doesNotMatch(familyDashboard, /Sin clases\./);

assert.match(teacherDashboard, /Guardar estado/);
assert.match(teacherDashboard, /Guardar franja/);
assert.match(teacherDashboard, /data-action="abrir-modal-disponibilidad"/);
assert.match(teacherDashboard, /Aún no tienes alumnos asignados/);
assert.doesNotMatch(teacherDashboard, /No tienes alumnos asignados aún\./);
assert.doesNotMatch(teacherDashboard, /Sin datos de ingresos\./);

assert.match(dashboardCss, /\.dashboard-empty-state/);
assert.match(dashboardCss, /\.empty-actions/);
assert.match(dashboardCss, /\.empty-state-row td/);

console.log('Dashboard empty-state UX validation passed.');
