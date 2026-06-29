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
  paymentEngine,
  pagosAdapter,
  contracts,
  utils,
  automationWorker,
] = await Promise.all([
  read('pages/dashboard/profesor.html'),
  read('pages/dashboard/admin.html'),
  read('firebase/firestore.rules'),
  read('js/firebase-data-client.js'),
  read('js/payment-engine.js'),
  read('js/adapters/pagos-adapter.js'),
  read('js/adapters/contracts.js'),
  read('js/utils.js'),
  read('scripts/firebase-automation-worker.mjs'),
]);

assert(professorDashboard.includes('btn-solicitar-bizum'), 'Professor dashboard must expose the Bizum request button.');
assert(professorDashboard.includes('tbody-bizum-pendientes'), 'Professor dashboard must list Bizum-eligible classes.');
assert(professorDashboard.includes('ing-por-cobrar'), 'Professor income cards must show outstanding teacher payouts.');
assert(professorDashboard.includes('Pago cada 2 semanas'), 'Professor income cards must explain the biweekly payout cadence.');
assert(professorDashboard.includes('Solicitar Bizum excepcional'), 'Bizum requests must be presented as exceptional payouts.');
assert(!professorDashboard.includes('ing-comision'), 'Professor dashboard must not expose internal commission cards.');
assert(!professorDashboard.includes('<th>Comisión</th>'), 'Professor income detail must not expose commission columns.');
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
assert(professorDashboard.includes('buildTeacherPayoutPayload'), 'Teacher payout must be built through the payment engine.');
assert(paymentEngine.includes("paymentType: 'teacher_payout'"), 'Payment engine must create teacher_payout payments.');
assert(professorDashboard.includes('classIds'), 'Teacher payout must store linked class ids.');

assert(adminDashboard.includes("data-pago-estado=\"pagado\""), 'Admin dashboard must allow marking teacher payouts as paid.');
assert(adminDashboard.includes('teacherPaymentStatus'), 'Admin paid action must update class teacher payment status.');
assert(paymentEngine.includes('teacherPayoutId'), 'Payment engine must link classes to the payout id.');
assert(adminDashboard.includes('Solicitudes Bizum'), 'Admin payment filters must include Bizum requests.');
assert(adminDashboard.includes('buildPaymentValidationPayload'), 'Admin validation must use payment engine validation payloads.');
assert(adminDashboard.includes('matchPaymentToClasses'), 'Admin validation must reconcile family payments to classes when safe.');
assert(adminDashboard.includes('buildClassPaymentPatch'), 'Admin validation must update class payment states through the payment engine.');
assert(adminDashboard.includes('paymentStatusForBadge'), 'Admin payment table must render normalized payment statuses.');

assert(rules.includes('validTeacherPayoutCreate'), 'Firestore rules must validate teacher payout creates.');
assert(rules.includes('validFamilyPaymentCreate'), 'Firestore rules must validate family payment creates.');
assert(rules.includes("request.resource.data.paymentType == 'teacher_payout'"), 'Rules must require teacher_payout type.');
assert(rules.includes("request.resource.data.paymentType == 'family_payment'"), 'Rules must require family_payment type.');
assert(rules.includes('isTeacherParticipant(resource.data)'), 'Teachers must be able to read their own payout requests.');

assert(compatClient.includes('documentId'), 'Firebase compat client must query document ids with documentId().');
assert(compatClient.includes("'procesando'") && compatClient.includes("'vencido'"), 'Dashboard pending counter must include processing and overdue payments.');
assert(compatClient.includes('buildFamilyPaymentPayload'), 'Firebase compat client must normalize family payments.');
assert(compatClient.includes('buildTeacherPayoutPayload'), 'Firebase compat client must normalize teacher payouts.');

assert(paymentEngine.includes('PAYMENT_GATEWAYS'), 'Payment engine must define provider-neutral gateways.');
assert(paymentEngine.includes('buildGatewayPaymentUpdate'), 'Payment engine must support gateway/webhook updates.');
assert(paymentEngine.includes('matchPaymentToClasses'), 'Payment engine must reconcile payments to classes.');
assert(paymentEngine.includes('isPaymentOverdue'), 'Payment engine must detect overdue payments.');
assert(pagosAdapter.includes('listByTeacher'), 'Payments adapter must expose listByTeacher.');
assert(pagosAdapter.includes('requestTeacherPayout'), 'Payments adapter must expose requestTeacherPayout.');
assert(pagosAdapter.includes('createFamilyPayment'), 'Payments adapter must expose createFamilyPayment.');
assert(pagosAdapter.includes('applyGatewayEvent'), 'Payments adapter must expose gateway event application.');
assert(contracts.includes("'requestTeacherPayout'"), 'Payment adapter contract must include requestTeacherPayout.');
assert(contracts.includes("'applyGatewayEvent'"), 'Payment adapter contract must include applyGatewayEvent.');
assert(utils.includes('solicitado') && utils.includes('pagado') && utils.includes('vencido'), 'UI badges must support requested, paid and overdue states.');
assert(automationWorker.includes('reconcileVerifiedPayments'), 'Automation worker must reconcile verified payments.');
assert(automationWorker.includes('paymentsMarkedOverdue'), 'Automation worker must mark overdue payments.');

console.log('Bizum payment flow static validation passed.');
