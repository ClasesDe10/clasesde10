import {
  applyClassPaymentContext,
  buildClassPaymentPatch,
  buildFamilyClassPaymentConfirmationPayload,
  buildFamilyPaymentConfirmationGroups,
  buildFamilyPaymentPayload,
  buildPaymentScheduleIndex,
  buildPaymentAiReviewPatch,
  buildWeeklyPaymentSchedulePayload,
  classFamilyPaymentState,
  buildGatewayPaymentUpdate,
  buildPaymentValidationPayload,
  buildTeacherPayoutPayload,
  classEconomicState,
  isPaymentOverdue,
  isPaymentVerified,
  matchPaymentToClasses,
  normalizePaymentStatus,
  paymentFingerprint,
  paymentScheduleForClass,
  paymentScheduleLabel,
  paymentStatusForBadge,
  reviewPaymentWithAssistant,
  shouldAutoValidatePaymentReview,
  economicCalendarLegend,
  weeklyPaymentDueAtForClass,
} from '../js/payment-engine.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(normalizePaymentStatus('succeeded') === 'pagado', 'Gateway succeeded must normalize to pagado.');
assert(normalizePaymentStatus('requires_action') === 'requiere_accion', 'Stripe action status must be supported.');

const familyPayment = buildFamilyPaymentPayload({
  familyUid: 'family_1',
  monto: 50,
  metodo: 'bizum',
  referencia: 'ABC123',
  notas_familia: 'Clases semana 1',
}, { nowIso: '2026-06-28T10:00:00.000Z' });
assert(familyPayment.paymentType === 'family_payment', 'Family payment payload must use family_payment type.');
assert(familyPayment.gateway === 'manual', 'Manual proofs must use manual gateway.');
assert(familyPayment.reconciliationStatus === 'pending_match', 'Unlinked family payments must wait for reconciliation.');
assert(Boolean(paymentFingerprint(familyPayment)), 'Payments must have deterministic fingerprints.');

const payout = buildTeacherPayoutPayload('teacher_1', {
  monto: 36,
  classIds: ['c1', 'c2'],
  telefono_bizum: '600111222',
});
assert(payout.paymentType === 'teacher_payout' && payout.estado === 'solicitado', 'Teacher payout must be requested.');
assert(payout.classCount === 2, 'Teacher payout must count linked classes.');

const gatewayUpdate = buildGatewayPaymentUpdate({
  gateway: 'stripe',
  providerPaymentStatus: 'succeeded',
  paymentIntentId: 'pi_123',
  eventId: 'evt_123',
}, { nowIso: '2026-06-28T11:00:00.000Z' });
assert(gatewayUpdate.estado === 'validado' && gatewayUpdate.verified === true, 'Successful gateway events must validate payments.');

const validation = buildPaymentValidationPayload(familyPayment, 'validado', 'admin_1', { nowIso: '2026-06-28T12:00:00.000Z' });
assert(validation.verified === true && validation.validatedByUid === 'admin_1', 'Manual validation must mark payment verified.');
assert(isPaymentVerified({ ...familyPayment, ...validation }), 'Validated payment must be verified.');

const classes = [
  { id: 'c1', estado: 'realizada', familyPaymentStatus: 'pendiente', precio_total: 20, fecha: '2026-06-20', teacherUid: 'teacher_1', studentId: 'student_1', studentName: 'Juan', teacherName: 'Miguel', materia: 'Matematicas' },
  { id: 'c2', estado: 'realizada', familyPaymentStatus: 'pendiente', precio_total: 30, fecha: '2026-06-21', teacherUid: 'teacher_1', studentId: 'student_1', studentName: 'Juan', teacherName: 'Miguel', materia: 'Fisica' },
  { id: 'c3', estado: 'realizada', familyPaymentStatus: 'pagado', precio_total: 20, fecha: '2026-06-22' },
];
const match = matchPaymentToClasses({ ...familyPayment, monto: 50 }, classes);
assert(match.status === 'matched' && match.classIds.length === 2, 'Exact payment amount must reconcile to unpaid classes.');

const classPatch = buildClassPaymentPatch({ ...familyPayment, id: 'pay_1' }, 'c1', { nowIso: '2026-06-28T12:00:00.000Z' });
assert(classPatch.familyPaymentStatus === 'validado' && classPatch.familyPaymentId === 'pay_1', 'Family payment patch must mark class as paid.');

assert(isPaymentOverdue({ estado: 'pendiente', dueAt: '2026-06-20T23:59:59.999Z' }, new Date('2026-06-28').getTime()), 'Pending past due payments must be overdue.');
assert(paymentStatusForBadge({ estado: 'pendiente', dueAt: '2026-06-20T23:59:59.999Z' }) === 'vencido', 'Overdue payments must render as vencido.');

const weeklySchedule = buildWeeklyPaymentSchedulePayload({
  ownerUid: 'family_user_1',
  familyUid: 'family_1',
  teacherUid: 'teacher_1',
  studentId: 'student_1',
  dayOfWeek: 5,
  time: '20:00',
});
assert(paymentScheduleLabel(weeklySchedule) === 'Viernes 20:00', 'Weekly payment schedule must render a clear label.');
const scheduleIndex = buildPaymentScheduleIndex([weeklySchedule]);
assert(
  paymentScheduleForClass({ teacherUid: 'teacher_1', studentId: 'student_1' }, scheduleIndex)?.id === weeklySchedule.id,
  'Weekly payment schedule must be found from teacher/student class data.',
);
assert(
  scheduleIndex.get('teacher_student:teacher_1:student_1')?.id === weeklySchedule.id,
  'Weekly payment schedules must keep compatibility with underscore cache keys.',
);
const confirmationGroups = buildFamilyPaymentConfirmationGroups(classes, [], scheduleIndex, {
  nowMs: new Date('2026-06-22T12:00:00').getTime(),
});
assert(confirmationGroups.length === 1, 'Family payment confirmation must group unpaid classes by relation and due date.');
assert(confirmationGroups[0].amount === 50 && confirmationGroups[0].classCount === 2, 'Family confirmation group must total linked class amounts.');
const blockedGroups = buildFamilyPaymentConfirmationGroups(classes, [{ paymentType: 'family_payment', estado: 'pendiente', classIds: ['c1', 'c2'] }], scheduleIndex);
assert(blockedGroups.length === 0, 'Open payment proofs must block duplicate family confirmation for the same classes.');
const reviewContextClasses = applyClassPaymentContext(classes, [{
  id: 'pay_review',
  paymentType: 'family_payment',
  estado: 'pendiente',
  monto: 20,
  classIds: ['c1'],
  created_at: '2026-06-28T10:00:00.000Z',
}]);
assert(reviewContextClasses[0].linkedFamilyPaymentId === 'pay_review', 'Linked payment proofs must enrich classes.');
assert(classFamilyPaymentState(reviewContextClasses[0], weeklySchedule).state === 'review', 'Open linked proofs must render classes as in review.');
assert(classEconomicState(reviewContextClasses[0], weeklySchedule).state === 'in_review', 'Admin economic state must surface payment review.');
const payoutPendingClass = applyClassPaymentContext([{ ...classes[0], importe_profesor: 15, teacherPaymentStatus: 'pendiente' }], [{
  id: 'pay_validated',
  paymentType: 'family_payment',
  estado: 'validado',
  monto: 20,
  classIds: ['c1'],
  created_at: '2026-06-28T10:00:00.000Z',
}])[0];
assert(classEconomicState(payoutPendingClass, weeklySchedule).state === 'payout_pending', 'Family paid classes must show pending teacher payout until liquidated.');
assert(economicCalendarLegend().some((item) => item.className === 'dot-blue'), 'Economic calendar legend must include payment review.');
const confirmationPayload = buildFamilyClassPaymentConfirmationPayload(confirmationGroups[0], {
  familyUid: 'family_1',
  metodo: 'bizum',
  referencia: 'BIZ-42',
}, { nowIso: '2026-06-28T10:00:00.000Z' });
assert(confirmationPayload.classIds.length === 2, 'Family confirmation payload must keep explicit class ids.');
assert(confirmationPayload.reconciliationStatus === 'matched', 'Family confirmation payload must be reconciled from creation.');
assert(confirmationPayload.verificationSource === 'family_dashboard_confirmation', 'Family confirmation payload must expose its source.');
const automaticReview = reviewPaymentWithAssistant({
  id: 'pay_auto',
  paymentType: 'family_payment',
  familyUid: 'family_1',
  estado: 'validado',
  status: 'validado',
  gateway: 'bank_import',
  verified: true,
  monto: 50,
  classIds: ['c1', 'c2'],
  referencia: 'BANK-1',
}, classes, []);
assert(automaticReview.recommendation === 'ignore', 'Already validated payments must not be processed twice.');
const pendingGatewayReview = reviewPaymentWithAssistant({
  id: 'pay_gateway',
  paymentType: 'family_payment',
  familyUid: 'family_1',
  estado: 'procesando',
  status: 'validado',
  gateway: 'bank_import',
  verified: true,
  monto: 50,
  classIds: ['c1', 'c2'],
  referencia: 'BANK-2',
}, classes, []);
assert(pendingGatewayReview.recommendation === 'auto_validate', 'Verified bank/gateway payments with exact class match must be auto-validatable.');
assert(shouldAutoValidatePaymentReview(pendingGatewayReview, {
  gateway: 'bank_import',
  estado: 'validado',
  status: 'validado',
  verified: true,
}), 'High-confidence verified gateway reviews must be eligible for automation.');
const manualReview = reviewPaymentWithAssistant({
  id: 'pay_manual',
  paymentType: 'family_payment',
  familyUid: 'family_1',
  estado: 'pendiente',
  gateway: 'manual',
  monto: 50,
  classIds: ['c1', 'c2'],
  referencia: 'BIZUM-1',
}, classes, []);
assert(manualReview.recommendation === 'admin_review', 'Manual Bizum proofs must remain assisted admin reviews.');
assert(!shouldAutoValidatePaymentReview(manualReview, { gateway: 'manual', estado: 'pendiente' }), 'Manual proofs must not auto-validate.');
const duplicateReview = reviewPaymentWithAssistant({
  id: 'pay_duplicate_new',
  paymentType: 'family_payment',
  familyUid: 'family_1',
  estado: 'pendiente',
  gateway: 'manual',
  monto: 20,
  classIds: ['c1'],
  referencia: 'DUP-1',
}, classes, [{
  id: 'pay_duplicate_old',
  paymentType: 'family_payment',
  familyUid: 'family_1',
  estado: 'pendiente',
  monto: 20,
  classIds: ['c1'],
  referencia: 'DUP-2',
}]);
assert(duplicateReview.duplicatePaymentIds.includes('pay_duplicate_old'), 'Payment assistant must detect overlapping class duplicates.');
assert(buildPaymentAiReviewPatch(manualReview, 'admin_1').requiresAdminReview === true, 'AI review patch must flag manual review payments.');
const scheduledDueAt = weeklyPaymentDueAtForClass(
  { fecha: '2026-06-25', hora_fin: '18:00', familyPaymentStatus: 'pendiente' },
  weeklySchedule,
);
const scheduledDueAtDate = new Date(scheduledDueAt);
assert(
  scheduledDueAtDate.getFullYear() === 2026
    && scheduledDueAtDate.getMonth() === 5
    && scheduledDueAtDate.getDate() === 26
    && scheduledDueAtDate.getHours() === 20
    && scheduledDueAtDate.getMinutes() === 0,
  `Expected Friday 20:00 local due date, got ${scheduledDueAt}`,
);
assert(classFamilyPaymentState(
  { fecha: '2026-06-25', hora_fin: '18:00', familyPaymentStatus: 'pendiente' },
  weeklySchedule,
  { nowMs: new Date('2026-06-27T19:00:00').getTime() },
).state === 'pending', 'Unpaid classes must stay pending before the 24h grace expires.');
assert(classFamilyPaymentState(
  { fecha: '2026-06-25', hora_fin: '18:00', familyPaymentStatus: 'pendiente' },
  weeklySchedule,
  { nowMs: new Date('2026-06-27T21:01:00').getTime() },
).state === 'overdue', 'Unpaid classes must become overdue after the weekly due date plus 24h.');
assert(classFamilyPaymentState(
  { fecha: '2026-06-25', hora_fin: '18:00', familyPaymentStatus: 'validado' },
  weeklySchedule,
).state === 'paid', 'Validated classes must render as paid.');

console.log('Payment engine validation passed.');
