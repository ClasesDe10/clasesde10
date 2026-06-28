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

const [
  professorDashboard,
  adminDashboard,
  rules,
  compatClient,
  pagosAdapter,
  contracts,
  utils,
] = await Promise.all([
  read('pages/dashboard/profesor.html'),
  read('pages/dashboard/admin.html'),
  read('firebase/firestore.rules'),
  read('js/supabase-client.js'),
  read('js/adapters/pagos-adapter.js'),
  read('js/adapters/contracts.js'),
  read('js/utils.js'),
]);

assert(professorDashboard.includes('btn-solicitar-bizum'), 'Professor dashboard must expose the Bizum request button.');
assert(professorDashboard.includes('tbody-bizum-pendientes'), 'Professor dashboard must list Bizum-eligible classes.');
assert(
  professorDashboard.indexOf('section-ingresos') < professorDashboard.indexOf('btn-solicitar-bizum'),
  'Bizum request UI must live in the professor income section.',
);
assert(
  professorDashboard.indexOf('section-clases') < professorDashboard.indexOf('section-ingresos')
    && !professorDashboard.slice(
      professorDashboard.indexOf('section-clases'),
      professorDashboard.indexOf('section-ingresos'),
    ).includes('btn-solicitar-bizum'),
  'Bizum request UI must not be rendered in the professor classes section.',
);
assert(professorDashboard.includes("paymentType: 'teacher_payout'"), 'Professor Bizum request must create teacher_payout payments.');
assert(professorDashboard.includes('teacherUid: profesorFirestoreId'), 'Teacher payout must be keyed by Firebase Auth uid.');
assert(professorDashboard.includes('classIds'), 'Teacher payout must store linked class ids.');

assert(adminDashboard.includes("data-pago-estado=\"pagado\""), 'Admin dashboard must allow marking teacher payouts as paid.');
assert(adminDashboard.includes('teacherPaymentStatus'), 'Admin paid action must update class teacher payment status.');
assert(adminDashboard.includes('teacherPayoutId'), 'Admin paid action must link classes to the payout id.');
assert(adminDashboard.includes('Solicitudes Bizum'), 'Admin payment filters must include Bizum requests.');

assert(rules.includes('validTeacherPayoutCreate'), 'Firestore rules must validate teacher payout creates.');
assert(rules.includes("request.resource.data.paymentType == 'teacher_payout'"), 'Rules must require teacher_payout type.');
assert(rules.includes('isTeacherParticipant(resource.data)'), 'Teachers must be able to read their own payout requests.');

assert(compatClient.includes('documentId'), 'Firebase compat client must query document ids with documentId().');
assert(compatClient.includes("['pendiente', 'solicitado'].includes"), 'Dashboard pending counter must include Bizum requests.');

assert(pagosAdapter.includes('listByTeacher'), 'Payments adapter must expose listByTeacher.');
assert(pagosAdapter.includes('requestTeacherPayout'), 'Payments adapter must expose requestTeacherPayout.');
assert(contracts.includes("'requestTeacherPayout'"), 'Payment adapter contract must include requestTeacherPayout.');
assert(utils.includes('solicitado') && utils.includes('pagado'), 'UI badges must support requested and paid states.');

console.log('Bizum payment flow static validation passed.');
