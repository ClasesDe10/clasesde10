import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [admin, documents, incidents, operations, control, notifications, chat, css] = await Promise.all([
  read('pages/dashboard/admin.html'),
  read('js/admin-documents.js'),
  read('js/admin-incidents.js'),
  read('js/admin-ops-workbench.js'),
  read('js/admin-control-center.js'),
  read('js/notification-center.js'),
  read('js/chat-widget.js'),
  read('css/dashboard.css'),
]);

assert.match(admin, /admin-person-context\.js/);
assert.match(admin, /data-action="ver-persona-admin"/);
assert.match(admin, /abrirFichaPersonaAdmin/);

for (const marker of [
  "adminPersonOptions('alumno', c",
  "adminPersonOptions('profesor', c",
  "adminPersonOptions('familia', s",
  "adminPersonOptions('alumno', s",
  "esPagoProfesor(p) ? 'profesor' : 'familia'",
  "renderAdminFamilyPaymentCalendarCard",
  "renderAdminTeacherPayoutCalendarCard",
  "renderFinanceBreakdown('Profesores rentables'",
  'clase-personas-contexto',
  'renderPerson: renderAdminPerson',
]) {
  assert.ok(admin.includes(marker), `Falta cobertura de identidad admin: ${marker}`);
}

assert.match(documents, /renderOwner\(doc/);
assert.match(documents, /registerPeople\?\.\(\{ users, teachers, families, students \}\)/);
assert.match(incidents, /incident-related-people/);
assert.match(operations, /ops-item-people/);
assert.match(operations, /state\.registerPeople/);
assert.match(control, /state\.renderPerson/);
assert.match(notifications, /notification-center-people/);
assert.match(chat, /chat-admin-person-links/);
assert.match(css, /\.admin-person-reference/);

assert.doesNotMatch(control, /first\(item\.email, nested\.email, item\.id\)/, 'El centro de control no puede usar correo o ID como nombre visible');

console.log('admin-person-coverage-test: OK');
