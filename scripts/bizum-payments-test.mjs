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
  familyDashboard,
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
  read('pages/dashboard/familia.html'),
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

assert(familyDashboard.includes('family-payment-workbench'), 'Family dashboard must show a payment confirmation workbench.');
assert(familyDashboard.includes('buildFamilyPaymentConfirmationGroups'), 'Family dashboard must group unpaid classes before payment confirmation.');
assert(familyDashboard.includes('buildFamilyClassPaymentConfirmationPayload'), 'Family dashboard must create class-linked payment payloads.');
assert(familyDashboard.includes('pago-class-ids'), 'Family payment modal must preserve linked class ids.');
assert(familyDashboard.includes('pago-clases-seleccionadas'), 'Family payment modal must show the classes linked to one proof.');
assert(familyDashboard.includes('payment-class-selection'), 'Family payment modal must let families mark which classes the proof pays.');
assert(familyDashboard.includes('Clases impagadas'), 'Family payments must separate overdue unpaid classes.');
assert(familyDashboard.includes('Pago que toca ahora'), 'Family payments must explain which payment is due now.');
assert(familyDashboard.includes('Próximos pagos'), 'Family payments must show future payment windows separately.');
assert(familyDashboard.includes('data-payment-select-bucket'), 'Families must be able to mark or unmark classes by payment window.');
assert(familyDashboard.includes('Clases incluidas'), 'Family payment history must show the classes linked to each proof.');
assert(familyDashboard.includes('Adjuntar justificante del pago'), 'Family proofs must be required so admin can validate one receipt linked to the selected classes.');
assert(!familyDashboard.includes('subir-justificante-clase'), 'Family dashboard must not expose a separate proof upload per class.');
assert(familyDashboard.includes('plan-pago-frecuencia'), 'Family payment plans must let families choose weekly or biweekly cadence.');
assert(familyDashboard.includes('family_payment_due'), 'Family calendar must render scheduled payment due days.');
assert(familyDashboard.includes('Pagar con Bizum ahora'), 'Family calendar must include a direct Bizum payment action.');
assert(familyDashboard.includes('Bizum a Miguel G. G. - 613016665'), 'Family payment modal must show the central ClasesDe10 Bizum recipient.');
assert(familyDashboard.includes('ClasesDe10 recibe el pago y despues liquida al profesor'), 'Family payment UI must explain that the platform pays the professor afterwards.');
assert(familyDashboard.includes('familyPaymentRecipient'), 'Family dashboard must read the central payment recipient from the payment engine.');
assert(adminDashboard.includes('abrirJustificantePagoAdmin'), 'Admin calendar must open the linked payment proof directly from the class.');
assert(adminDashboard.includes('Ver justificante'), 'Admin calendar class actions must name the linked proof, not a separate class receipt.');
assert(adminDashboard.includes('admin_family_payment_day'), 'Admin calendar must render family payment days as first-class events.');
assert(adminDashboard.includes('buildAdminFamilyPaymentCalendarEvents'), 'Admin calendar must build family payment-day events from saved payment schedules.');
assert(adminDashboard.includes('admin_teacher_payout_day'), 'Admin calendar must render teacher payout days as first-class events.');
assert(adminDashboard.includes('buildAdminTeacherPayoutCalendarEvents'), 'Admin calendar must show what is owed to each teacher on payout day.');
assert(adminDashboard.includes('adminAttendanceDoneValue(attendanceStatus)'), 'Admin teacher payouts must count classes confirmed through the shared attendance summary.');
assert(adminDashboard.includes('adminAttendanceBlockedValue(familyStatus)'), 'Admin teacher payouts must exclude attendance conflicts from either side.');

assert(professorDashboard.includes('btn-solicitar-bizum'), 'Professor dashboard must expose the Bizum request button.');
assert(professorDashboard.includes('tbody-bizum-pendientes'), 'Professor dashboard must list Bizum-eligible classes.');
assert(professorDashboard.includes('ing-por-cobrar'), 'Professor income cards must show outstanding teacher payouts.');
assert(professorDashboard.includes('Próximo cobro'), 'Professor income cards must show the next configured payout date.');
assert(professorDashboard.includes('form-dia-cobro-profesor'), 'Professor income section must let teachers fix their payout day.');
assert(professorDashboard.includes('ing-cobro-frecuencia'), 'Professor income section must let teachers choose payout cadence.');
assert(professorDashboard.includes('ing-cobro-fecha-inicio'), 'Professor income section must let teachers choose the first payout date.');
assert(!professorDashboard.includes('p-cobro-frecuencia'), 'Professor payout cadence must not live in the profile form.');
assert(!professorDashboard.includes('p-cobro-fecha-inicio'), 'Professor payout date must not live in the profile form.');
assert(professorDashboard.includes('teacher_payout_day'), 'Professor calendar must render configured payout days.');
assert(professorDashboard.includes('Solicitar Bizum excepcional'), 'Bizum requests must be presented as exceptional payouts.');
assert(professorDashboard.includes('income-lab'), 'Professor income section must include the expandable income lab.');
assert(professorDashboard.includes('ing-chart-meses'), 'Professor income lab must include monthly charts.');
assert(professorDashboard.includes('teacherFinancialState'), 'Professor dashboard must use teacher-only payment state.');
assert(!professorDashboard.includes('classEconomicState'), 'Professor dashboard must not expose family/admin proof state helpers.');
assert(!professorDashboard.includes('Justificante en revision'), 'Professor dashboard must not show family proof review status.');
assert(!professorDashboard.includes('Justificante rechazado'), 'Professor dashboard must not show family proof rejection status.');
assert(!professorDashboard.includes('Familia pendiente'), 'Professor calendar legend must not mention family payment status.');
assert(professorDashboard.includes('ing-filter-student'), 'Professor income lab must filter by student.');
assert(professorDashboard.includes('tbody-ing-alumnos'), 'Professor income lab must break earnings down by student.');
assert(professorDashboard.includes('tbody-ing-materias'), 'Professor income lab must break earnings down by subject.');
assert(professorDashboard.includes('ing-simulator-classes'), 'Professor income lab must include an earnings simulator.');
assert(professorDashboard.includes('buildIncomeInsightsModel'), 'Professor income lab must build a normalized income model.');
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
assert(rules.includes('validTeacherPayoutPreferenceUpdate'), 'Firestore rules must lock teacher payout preference after first save.');
assert(rules.includes('payoutLockedAt'), 'Firestore rules must require a payout lock timestamp.');
assert(rules.includes('validFamilyPaymentCreate'), 'Firestore rules must validate family payment creates.');
assert(rules.includes("request.resource.data.paymentType == 'teacher_payout'"), 'Rules must require teacher_payout type.');
assert(rules.includes("request.resource.data.paymentType == 'family_payment'"), 'Rules must require family_payment type.');
assert(rules.includes("request.resource.data.canonicalCollection == 'pagos'"), 'Payment rules must accept normalized payment metadata safely.');
assert(rules.includes('isTeacherParticipant(resource.data)'), 'Teachers must be able to read their own payout requests.');
for (const field of ['frequency', 'paymentFrequency', 'frecuencia_pago', 'recurrenceDays', 'anchorDate', 'paymentAnchorDate', 'fecha_inicio_pago']) {
  assert(paymentEngine.includes(field), `Payment engine must write ${field} for family payment schedules.`);
  assert(rules.includes(`'${field}'`), `Firestore payment schedule rules must allow ${field}.`);
}
assert(rules.includes("data.frequency in ['semanal', 'quincenal']"), 'Rules must validate weekly/biweekly payment schedule frequency.');
assert(rules.includes("data.frequency == 'semanal' && data.recurrenceDays == 7"), 'Rules must validate weekly recurrence days.');
assert(rules.includes("data.frequency == 'quincenal' && data.recurrenceDays == 14"), 'Rules must validate biweekly recurrence days.');

assert(compatClient.includes('documentId'), 'Firebase compat client must query document ids with documentId().');
assert(compatClient.includes("'procesando'") && compatClient.includes("'vencido'"), 'Dashboard pending counter must include processing and overdue payments.');
assert(compatClient.includes('buildFamilyPaymentPayload'), 'Firebase compat client must normalize family payments.');
assert(compatClient.includes('buildTeacherPayoutPayload'), 'Firebase compat client must normalize teacher payouts.');

assert(paymentEngine.includes('PAYMENT_GATEWAYS'), 'Payment engine must define provider-neutral gateways.');
assert(paymentEngine.includes("phone: '613016665'"), 'Payment engine must centralize the ClasesDe10 Bizum phone.');
assert(paymentEngine.includes("name: 'Miguel G. G.'"), 'Payment engine must centralize the ClasesDe10 Bizum recipient name.');
assert(paymentEngine.includes('platform_collects_then_teacher_payout'), 'Payment engine must record the platform collection flow.');
assert(paymentEngine.includes('buildGatewayPaymentUpdate'), 'Payment engine must support gateway/webhook updates.');
assert(paymentEngine.includes('matchPaymentToClasses'), 'Payment engine must reconcile payments to classes.');
assert(paymentEngine.includes('isPaymentOverdue'), 'Payment engine must detect overdue payments.');
assert(paymentEngine.includes('paymentWindow'), 'Payment engine must classify each family payment as overdue, due now or upcoming.');
assert(paymentEngine.includes('paymentBucket'), 'Payment engine must classify every selectable class by its payment window.');
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
