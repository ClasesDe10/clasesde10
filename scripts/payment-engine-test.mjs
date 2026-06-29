import {
  buildClassPaymentPatch,
  buildFamilyPaymentPayload,
  buildPaymentScheduleIndex,
  buildWeeklyPaymentSchedulePayload,
  classFamilyPaymentState,
  buildGatewayPaymentUpdate,
  buildPaymentValidationPayload,
  buildTeacherPayoutPayload,
  isPaymentOverdue,
  isPaymentVerified,
  matchPaymentToClasses,
  normalizePaymentStatus,
  paymentFingerprint,
  paymentScheduleForClass,
  paymentScheduleLabel,
  paymentStatusForBadge,
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
  { id: 'c1', estado: 'realizada', familyPaymentStatus: 'pendiente', precio_total: 20, fecha: '2026-06-20' },
  { id: 'c2', estado: 'realizada', familyPaymentStatus: 'pendiente', precio_total: 30, fecha: '2026-06-21' },
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
