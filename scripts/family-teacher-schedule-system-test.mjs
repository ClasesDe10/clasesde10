import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [family, teacher, chat, notifications, worker, pwa, css, rules] = await Promise.all([
  readFile('pages/dashboard/familia.html', 'utf8'),
  readFile('pages/dashboard/profesor.html', 'utf8'),
  readFile('js/chat-widget.js', 'utf8'),
  readFile('js/notification-center.js', 'utf8'),
  readFile('scripts/firebase-automation-worker.mjs', 'utf8'),
  readFile('js/pwa.js', 'utf8'),
  readFile('css/dashboard.css', 'utf8'),
  readFile('firebase/firestore.rules', 'utf8'),
]);

for (const marker of [
  'section-profesores',
  'family-teachers-grid',
  'Mis profesores',
  'family-teacher-assignment-alert',
  'gestionar-horario-familia',
  'abrir-chat-relacion-familia',
  'Activar avisos en el móvil',
  'Instalar en el móvil',
  'modal-horario-semanal-familia',
]) assert.ok(family.includes(marker), `Missing family teacher-space marker: ${marker}`);

const teacherCardSource = family.slice(
  family.indexOf('function renderFamilyTeacherCard'),
  family.indexOf('async function cargarMisProfesores'),
);
assert.match(teacherCardSource, /h impartidas/);
assert.match(teacherCardSource, /años de experiencia/);
assert.match(teacherCardSource, /Edad no indicada/);
assert.match(teacherCardSource, /datos de contacto permanecen protegidos/i);
assert.doesNotMatch(teacherCardSource, /profile\.(email|telefono|phone|direccion|address)/);
assert.ok(family.includes("classStatusForBadge(clase)"), 'Completed teacher hours must normalize the whole class record.');
assert.ok(family.includes("fecha_nacimiento || profile.birthDate"), 'Family cards must derive age from a private birth date.');

for (const marker of [
  'teacher-schedule-pending-alert',
  'gestionar-horario-profesor',
  'modal-horario-semanal-profesor',
  'requireFamilyFirstProposal: true',
  'p-fecha-nacimiento',
  'Las familias solo verán tu edad',
]) assert.ok(teacher.includes(marker), `Missing teacher schedule marker: ${marker}`);

assert.ok(chat.includes('schedulingEnabled = false'), 'Ordinary chat must not expose the schedule planner.');
assert.ok(chat.includes('scheduleOnly = false'), 'The schedule planner must have a dedicated workspace mode.');
assert.ok(chat.includes('requireFamilyFirstProposal = true'), 'Family must make the initial weekly proposal.');
assert.ok(chat.includes('pendingFamilyWeeklyProposal') && chat.includes('acceptedWeeklyProposal'), 'Teacher planning must reopen only for a family proposal or an already accepted schedule.');
assert.ok(chat.includes("status: 'sustituida'"), 'Counterproposals must supersede the previous pending proposal.');
assert.ok(chat.includes('supersedesProposalId') && chat.includes('supersededByProposalId'), 'Counterproposal history must stay traceable.');
assert.ok(chat.includes("container.dataset.scheduleMessagesEnabled === 'true'"), 'Schedule movements must not leak into chat unless explicitly enabled.');

assert.ok(notifications.includes("section: 'profesores', label: 'Proponer horario'"), 'Assignment notice must take families to the solution.');
assert.ok(notifications.includes("section: 'alumnos', label: 'Responder horario'"), 'Schedule notice must take teachers to the exact solution.');
assert.ok(worker.includes('actionableNotificationUrl'), 'Mobile push must resolve role-specific actionable URLs.');
assert.ok(worker.includes("notificationId('assignment_created', payload.assignmentId, role, targetUid)"), 'Delayed automation must not duplicate the immediate assignment notification.');
assert.ok(worker.includes("#profesores") && worker.includes("#alumnos"), 'Push destinations must target the correct dashboard section.');

assert.ok(pwa.includes('cd10:request-install') && pwa.includes('requestPanelInstall'), 'The family panel must be able to request PWA installation directly.');
assert.ok(css.includes('.family-teacher-card') && css.includes('.weekly-schedule-widget.chat-schedule-workspace'), 'Teacher cards and dedicated schedule workspace must be responsive and styled.');
assert.ok(rules.includes("'supersedesProposalId'") && rules.includes("'supersededByProposalId'"), 'Rules must permit traceable counterproposals.');
assert.ok(rules.includes("'sustituida'"), 'Rules must validate superseded schedule state.');
assert.ok(rules.includes("data.proposedByRole == 'familia'"), 'Firestore must enforce that a teacher counterproposal follows a pending family proposal.');
assert.ok(rules.includes('documents/clases/$(chatData.activeClassId)'), 'Firestore must only let teachers initiate later weekly changes after a real class exists.');
assert.ok(rules.includes("'fecha_nacimiento'"), 'Rules must allow teachers to save the private date used to derive age.');

console.log('Family teacher and weekly schedule system validation passed.');
