import {
  applyClassPaymentContext,
  buildClassPaymentPatch,
  buildFamilyPaymentAccessPatch,
  buildFamilyPaymentAccessState,
  buildFamilyAllDuePaymentGroup,
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
  familyPaymentRecipient,
  isPaymentOverdue,
  isPaymentVerified,
  matchPaymentToClasses,
  normalizePaymentStatus,
  paymentFingerprint,
  paymentStrongRelationKeys,
  paymentScheduleForClass,
  paymentScheduleLabel,
  paymentStatusForBadge,
  reviewPaymentWithAssistant,
  samePaymentRelation,
  shouldAutoValidatePaymentReview,
  unpaidFamilyClasses,
  validateFamilyPaymentCompleteness,
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
assert(familyPayment.paymentRecipientPhone === '613016665', 'Family payments must go to the central ClasesDe10 Bizum phone.');
assert(familyPayment.paymentRecipientName === 'Miguel G. G.', 'Family payments must name the platform recipient.');
assert(familyPayment.platformCollectsPayment === true, 'Family payments must record that ClasesDe10 collects before teacher payout.');
assert(familyPayment.fundsFlow === 'platform_collects_then_teacher_payout', 'Family payments must record the platform collection flow.');
assert(familyPaymentRecipient().phone === '613016665', 'Payment recipient helper must expose the central Bizum phone.');
assert(Boolean(paymentFingerprint(familyPayment)), 'Payments must have deterministic fingerprints.');

const payout = buildTeacherPayoutPayload('teacher_1', {
  monto: 36,
  classIds: ['c1', 'c2'],
  telefono_bizum: '600111222',
});
assert(payout.paymentType === 'teacher_payout' && payout.estado === 'solicitado', 'Teacher payout must be requested.');
assert(payout.classCount === 2, 'Teacher payout must count linked classes.');

const shortLegacyClassEconomic = classEconomicState({
  id: 'legacy_short_class',
  estado: 'confirmada',
  fecha: '2026-07-10',
  hora_inicio: '17:30',
  hora_fin: '18:03',
  precio_total: 32,
  importe_profesor: 24,
});
assert(shortLegacyClassEconomic.familyAmount === 17.6, 'Legacy hourly family amount must be prorated by real duration.');
assert(shortLegacyClassEconomic.teacherAmount === 13.2, 'Legacy hourly teacher amount must be prorated by real duration.');
assert(shortLegacyClassEconomic.platformFee === 4.4, 'Legacy hourly margin must be prorated by real duration.');

const shortLegacyClassWithStaleMargin = classEconomicState({
  id: 'legacy_short_class_stale_margin',
  estado: 'confirmada',
  fecha: '2026-07-10',
  hora_inicio: '17:30',
  hora_fin: '18:03',
  precio_total: 32,
  importe_profesor: 24,
  comision_clasesde10: 8,
  platformFee: 8,
});
assert(shortLegacyClassWithStaleMargin.platformFee === 4.4, 'Stored legacy margin must be recalculated from prorated class totals.');
assert(shortLegacyClassWithStaleMargin.marginPct === 25, 'Stored legacy margin percent must remain consistent with prorated totals.');

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
  { id: 'c1', estado: 'realizada', familyConfirmationStatus: 'realizada', familyPaymentStatus: 'pendiente', precio_total: 20, fecha: '2026-06-20', teacherUid: 'teacher_1', studentId: 'student_1', studentName: 'Juan', teacherName: 'Miguel', materia: 'Matematicas' },
  { id: 'c2', estado: 'realizada', familyConfirmationStatus: 'realizada', familyPaymentStatus: 'pendiente', precio_total: 30, fecha: '2026-06-21', teacherUid: 'teacher_1', studentId: 'student_1', studentName: 'Juan', teacherName: 'Miguel', materia: 'Fisica' },
  { id: 'c3', estado: 'realizada', familyConfirmationStatus: 'realizada', familyPaymentStatus: 'pagado', precio_total: 20, fecha: '2026-06-22' },
];
const match = matchPaymentToClasses({ ...familyPayment, monto: 50 }, classes);
assert(match.status === 'matched' && match.classIds.length === 2, 'Exact payment amount must reconcile to unpaid classes.');

const classPatch = buildClassPaymentPatch({ ...familyPayment, id: 'pay_1' }, 'c1', { nowIso: '2026-06-28T12:00:00.000Z' });
assert(classPatch.familyPaymentStatus === 'validado' && classPatch.familyPaymentId === 'pay_1', 'Family payment patch must mark class as paid.');
assert(classPatch.paymentEscalationStatus === 'resolved_paid', 'Validated payments must resolve any active overdue escalation.');

assert(isPaymentOverdue({ estado: 'pendiente', dueAt: '2026-06-20T23:59:59.999Z' }, new Date('2026-06-28').getTime()), 'Pending past due payments must be overdue.');
assert(!isPaymentOverdue({ estado: 'pendiente', dueAt: '2026-06-26T20:00:00.000Z' }, new Date('2026-06-28T19:00:00.000Z').getTime()), 'Family proof payments must keep the 48h grace window.');
assert(isPaymentOverdue({ estado: 'pendiente', dueAt: '2026-06-26T20:00:00.000Z' }, new Date('2026-06-28T21:00:00.000Z').getTime()), 'Family proof payments must become overdue after the 48h grace window.');
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
assert(weeklySchedule.graceHours === 48, 'Weekly payment schedules must default to a 48h proof grace period.');
const biweeklySchedule = buildWeeklyPaymentSchedulePayload({
  ownerUid: 'family_user_1',
  familyUid: 'family_1',
  teacherUid: 'teacher_1',
  studentId: 'student_1',
  frequency: 'quincenal',
  anchorDate: '2026-06-10',
  time: '19:30',
});
assert(biweeklySchedule.paymentFrequency === 'quincenal' && biweeklySchedule.recurrenceDays === 14, 'Family payment schedules must support biweekly cadence.');
assert(paymentScheduleLabel(biweeklySchedule) === 'Cada 15 dias - 10/06 19:30', 'Biweekly payment schedule must render a clear label.');
const firstBiweeklyDue = new Date(weeklyPaymentDueAtForClass({ fecha: '2026-06-08', hora_fin: '18:00' }, biweeklySchedule));
assert(
  firstBiweeklyDue.getFullYear() === 2026
    && firstBiweeklyDue.getMonth() === 5
    && firstBiweeklyDue.getDate() === 10
    && firstBiweeklyDue.getHours() === 19
    && firstBiweeklyDue.getMinutes() === 30,
  'Biweekly schedule must use the first anchor date after the class.',
);
const secondBiweeklyDue = new Date(weeklyPaymentDueAtForClass({ fecha: '2026-06-11', hora_fin: '18:00' }, biweeklySchedule));
assert(
  secondBiweeklyDue.getFullYear() === 2026
    && secondBiweeklyDue.getMonth() === 5
    && secondBiweeklyDue.getDate() === 24
    && secondBiweeklyDue.getHours() === 19
    && secondBiweeklyDue.getMinutes() === 30,
  'Biweekly schedule must repeat every 14 days after the anchor date.',
);
const scheduleIndex = buildPaymentScheduleIndex([weeklySchedule]);
assert(
  paymentScheduleForClass({ teacherUid: 'teacher_1', studentId: 'student_1' }, scheduleIndex)?.id === weeklySchedule.id,
  'Weekly payment schedule must be found from teacher/student class data.',
);
assert(
  scheduleIndex.get('teacher_student:teacher_1:student_1')?.id === weeklySchedule.id,
  'Weekly payment schedules must keep compatibility with underscore cache keys.',
);
assert(
  paymentStrongRelationKeys(weeklySchedule).includes('teacher-student:teacher_1:student_1'),
  'Payment relation keys must include teacher/student as a strong relation key.',
);
assert(
  samePaymentRelation(
    { assignmentId: 'assignment_1', teacherUid: 'teacher_1', studentId: 'student_1' },
    { teacherUid: 'teacher_1', studentId: 'student_1' },
  ),
  'Payment carryover must match a scheduled relation even if only one side has assignmentId.',
);
assert(
  !samePaymentRelation(
    { assignmentId: 'assignment_1', teacherUid: 'teacher_1', studentId: 'student_1' },
    { teacherUid: 'teacher_1', studentId: 'student_2' },
  ),
  'Payment carryover must not mix students from the same teacher.',
);
const confirmationGroups = buildFamilyPaymentConfirmationGroups(classes, [], scheduleIndex, {
  nowMs: new Date('2026-06-22T12:00:00').getTime(),
});
assert(confirmationGroups.length === 1, 'Family payment confirmation must group unpaid classes by relation and due date.');
assert(confirmationGroups[0].amount === 50 && confirmationGroups[0].classCount === 2, 'Family confirmation group must total linked class amounts.');
assert(confirmationGroups[0].paymentPeriodStart && confirmationGroups[0].paymentPeriodEnd, 'Family confirmation groups must expose the payment period covered.');
assert(confirmationGroups[0].currentPeriodClasses.length === 2, 'Family confirmation groups must classify classes from the current payment period.');
assert(confirmationGroups[0].dueNow === false && confirmationGroups[0].upcoming === true, 'Future scheduled classes must be labelled as an upcoming payment.');
assert(confirmationGroups[0].classes.every((item) => item.paymentBucket === 'upcoming'), 'Each class must expose its payment-window bucket.');
assert(confirmationGroups[0].bizumPhone === '613016665', 'Family confirmation groups must use ClasesDe10 central Bizum phone.');
assert(confirmationGroups[0].teacherPhone === '', 'Family confirmation groups must not expose the teacher real phone for payment.');
assert(unpaidFamilyClasses([{
  id: 'family_marked_before_worker',
  estado: 'confirmada',
  familyConfirmationStatus: 'realizada',
  familyPaymentStatus: 'pendiente',
  precio_total: 25,
}]).length === 1, 'A class marked as given by the family must become payable without waiting for a background lifecycle worker.');
const dueNowConfirmationGroups = buildFamilyPaymentConfirmationGroups(classes, [], scheduleIndex, {
  nowMs: new Date('2026-06-27T10:00:00').getTime(),
});
assert(dueNowConfirmationGroups[0].paymentWindow === 'due_now', 'A payment whose scheduled date has arrived must be labelled as due now.');
assert(dueNowConfirmationGroups[0].classes.every((item) => item.paymentBucket === 'due'), 'Due-now groups must mark every selectable class as part of the current payment.');
const blockedGroups = buildFamilyPaymentConfirmationGroups(classes, [{ paymentType: 'family_payment', estado: 'pendiente', documentId: 'doc_1', classIds: ['c1', 'c2'] }], scheduleIndex);
assert(blockedGroups.length === 0, 'Open payment proofs with an uploaded file must block duplicate family confirmation for the same classes.');
const orphanOpenPaymentGroups = buildFamilyPaymentConfirmationGroups(classes, [{ paymentType: 'family_payment', estado: 'vencido', classIds: ['c1', 'c2'] }], scheduleIndex);
assert(orphanOpenPaymentGroups.length === 1, 'Expired payment records without a real proof must not hide unpaid classes from the next payment day.');
const overdueConfirmationGroups = buildFamilyPaymentConfirmationGroups(classes, [], scheduleIndex, {
  nowMs: new Date('2026-07-01T12:00:00').getTime(),
});
assert(overdueConfirmationGroups[0].paymentWindow === 'overdue', 'Past payment windows must be labelled as overdue.');
assert(overdueConfirmationGroups[0].classes.every((item) => item.paymentBucket === 'overdue'), 'Overdue groups must mark every selectable class as unpaid.');
const allFamilyDebt = buildFamilyAllDuePaymentGroup([
  {
    key: 'relation_1_old', familyUid: 'family_1', teacherUid: 'teacher_1', studentId: 'student_1',
    studentName: 'Juan', teacherName: 'Miguel', dueAt: '2026-06-20T20:00:00.000Z', overdue: true,
    subjects: ['Matematicas'], classes: [{ id: 'all_c1', date: '2026-06-18', amount: 20 }],
  },
  {
    key: 'relation_1_current', familyUid: 'family_1', teacherUid: 'teacher_1', studentId: 'student_1',
    studentName: 'Juan', teacherName: 'Miguel', dueAt: '2026-06-27T20:00:00.000Z',
    subjects: ['Fisica'], classes: [{ id: 'all_c2', date: '2026-06-25', amount: 30 }, { id: 'all_c1', date: '2026-06-18', amount: 20 }],
  },
  {
    key: 'relation_2_old', familyUid: 'family_1', teacherUid: 'teacher_2', studentId: 'student_2',
    studentName: 'Ana', teacherName: 'Lucia', dueAt: '2026-06-25T20:00:00.000Z', overdue: true,
    subjects: ['Ingles'], classes: [{ id: 'all_c3', date: '2026-06-24', amount: 40 }],
  },
  {
    key: 'relation_2_future', familyUid: 'family_1', teacherUid: 'teacher_2', studentId: 'student_2',
    studentName: 'Ana', teacherName: 'Lucia', dueAt: '2026-07-02T20:00:00.000Z',
    subjects: ['Ingles'], classes: [{ id: 'all_c4', date: '2026-07-01', amount: 50 }],
  },
  {
    key: 'undated_debt', familyUid: 'family_1', teacherUid: 'teacher_3', studentId: 'student_3',
    studentName: 'Pablo', teacherName: 'Marta', dueNow: true,
    subjects: ['Lengua'], classes: [{ id: 'all_c5', date: '2026-06-10', amount: 10 }],
  },
], '2026-06-27', {
  nowMs: new Date('2026-06-27T21:00:00.000Z').getTime(),
});
assert(allFamilyDebt.amount === 100, 'A payment day must total every older family debt plus the current period across all relations.');
assert(allFamilyDebt.currentPeriodAmount === 30 && allFamilyDebt.overdueAmount === 70, 'The family-wide payment must separate current classes from all carryover.');
assert(JSON.stringify(allFamilyDebt.classIds.slice().sort()) === JSON.stringify(['all_c1', 'all_c2', 'all_c3', 'all_c5']), 'The mandatory payment must include every due class and exclude future classes.');
assert(allFamilyDebt.classIds.length === new Set(allFamilyDebt.classIds).size, 'A class repeated by overlapping schedule groups must only be charged once.');
assert(allFamilyDebt.studentName === '3 alumnos' && allFamilyDebt.teacherName === '3 profesores', 'Multi-relation payments must not mislabel one child or teacher as the only relation.');
assert(allFamilyDebt.relationCount === 3 && allFamilyDebt.hasOverdueCarryover, 'Family-wide payment metadata must expose all covered relations and debt carryover.');
const completenessClasses = [
  {
    id: 'complete_old', estado: 'realizada', familyConfirmationStatus: 'realizada', familyPaymentStatus: 'pendiente',
    precio_total: 25, fecha: '2026-06-10', hora_fin: '18:00', familyPaymentDueAt: '2026-06-20T20:00:00.000Z',
    familyUid: 'family_complete', teacherUid: 'teacher_1', studentId: 'student_1',
  },
  {
    id: 'complete_current', estado: 'realizada', familyConfirmationStatus: 'realizada', familyPaymentStatus: 'pendiente',
    precio_total: 35, fecha: '2026-06-25', hora_fin: '18:00', familyPaymentDueAt: '2026-06-27T20:00:00.000Z',
    familyUid: 'family_complete', teacherUid: 'teacher_2', studentId: 'student_2',
  },
  {
    id: 'complete_future', estado: 'realizada', familyConfirmationStatus: 'realizada', familyPaymentStatus: 'pendiente',
    precio_total: 50, fecha: '2026-07-01', hora_fin: '18:00', familyPaymentDueAt: '2026-07-02T20:00:00.000Z',
    familyUid: 'family_complete', teacherUid: 'teacher_2', studentId: 'student_2',
  },
];
const completePayment = {
  id: 'payment_complete', paymentType: 'family_payment', familyUid: 'family_complete',
  classIds: ['complete_old', 'complete_current'], amount: 60, created_at: '2026-06-27T21:00:00.000Z',
};
const completeValidation = validateFamilyPaymentCompleteness(completePayment, completenessClasses, new Map(), {
  nowMs: new Date('2026-06-27T21:00:00.000Z').getTime(),
  dateIso: '2026-06-27',
});
assert(completeValidation.valid && completeValidation.expectedAmount === 60, 'Admin validation must accept the exact complete family debt at submission time.');
assert(JSON.stringify(completeValidation.expectedClassIds) === JSON.stringify(['complete_current', 'complete_old']), 'Completeness validation must include old and current debt but not future classes.');
const partialValidation = validateFamilyPaymentCompleteness({ ...completePayment, classIds: ['complete_current'], amount: 35 }, completenessClasses, new Map(), {
  nowMs: new Date('2026-06-27T21:00:00.000Z').getTime(),
  dateIso: '2026-06-27',
});
assert(!partialValidation.valid && partialValidation.reason === 'class_set_mismatch' && partialValidation.missingClassIds.includes('complete_old'), 'Admin validation must reject a proof that omits older family debt.');
const alteredAmountValidation = validateFamilyPaymentCompleteness({ ...completePayment, amount: 59 }, completenessClasses, new Map(), {
  nowMs: new Date('2026-06-27T21:00:00.000Z').getTime(),
  dateIso: '2026-06-27',
});
assert(!alteredAmountValidation.valid && alteredAmountValidation.reason === 'amount_mismatch', 'Admin validation must reject an altered total even when class IDs are complete.');
const unmarkedValidation = validateFamilyPaymentCompleteness(completePayment, [
  ...completenessClasses,
  {
    id: 'complete_unmarked', estado: 'confirmada', familyPaymentStatus: 'pendiente', precio_total: 20,
    fecha: '2026-06-24', hora_fin: '18:00', familyPaymentDueAt: '2026-06-27T20:00:00.000Z',
    familyUid: 'family_complete', teacherUid: 'teacher_3', studentId: 'student_3',
  },
], new Map(), {
  nowMs: new Date('2026-06-27T21:00:00.000Z').getTime(),
  dateIso: '2026-06-27',
});
assert(!unmarkedValidation.valid && unmarkedValidation.reason === 'attendance_decision_required', 'Admin validation must reject payment while a due class still lacks the family attendance decision.');
const paymentAccessClasses = [
  {
    id: 'old_debt',
    estado: 'realizada',
    familyConfirmationStatus: 'realizada',
    familyPaymentStatus: 'pendiente',
    precio_total: 40,
    fecha: '2026-05-01',
    hora_fin: '18:00',
    teacherUid: 'teacher_1',
    studentId: 'student_1',
  },
  {
    id: 'unmarked_due',
    estado: 'realizada',
    familyPaymentStatus: 'pendiente',
    precio_total: 30,
    fecha: '2026-06-19',
    hora_fin: '18:00',
    teacherUid: 'teacher_1',
    studentId: 'student_1',
  },
];
const lockedAccess = buildFamilyPaymentAccessState(paymentAccessClasses, scheduleIndex, {
  nowMs: new Date('2026-07-10T21:00:00').getTime(),
});
assert(lockedAccess.locked === true && lockedAccess.debtClassIds.includes('old_debt'), 'A family must be locked when a confirmed given class remains unpaid for more than 30 days.');
assert(lockedAccess.paymentSubmissionBlocked === true && lockedAccess.unmarkedDueClassIds.includes('unmarked_due'), 'Due payments must wait until the family marks every past class as given or not given.');
assert(lockedAccess.debtAmount === 40, 'The access lock must expose the exact outstanding accepted-class amount.');
const lockedPatch = buildFamilyPaymentAccessPatch(lockedAccess, { nowIso: '2026-07-10T21:00:00.000Z' });
assert(lockedPatch.paymentAccessLocked === true && lockedPatch.paymentAccessStatus === 'blocked_overdue_payment', 'The stored family gate must record a blocked payment status.');
const restoredAccess = buildFamilyPaymentAccessState(paymentAccessClasses.map((item) => (
  item.id === 'old_debt' ? { ...item, familyPaymentStatus: 'validado' } : { ...item, familyConfirmationStatus: 'no_realizada' }
)), scheduleIndex, {
  nowMs: new Date('2026-07-10T21:00:00').getTime(),
});
assert(restoredAccess.locked === false && restoredAccess.paymentSubmissionBlocked === false, 'Admin validation plus an attendance decision must restore normal family access.');
assert(buildFamilyPaymentAccessPatch(restoredAccess).paymentAccessStatus === 'active', 'The restored family gate must return to active.');
const orphanContextClasses = applyClassPaymentContext(classes, [{
  id: 'pay_orphan',
  paymentType: 'family_payment',
  estado: 'vencido',
  classIds: ['c1'],
  created_at: '2026-06-28T10:00:00.000Z',
}]);
assert(!orphanContextClasses[0].linkedFamilyPaymentId, 'Expired payment records without a real proof must not render classes as in review.');
const reviewContextClasses = applyClassPaymentContext(classes, [{
  id: 'pay_review',
  paymentType: 'family_payment',
  estado: 'pendiente',
  monto: 20,
  documentId: 'doc_review',
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
const economicLegendClasses = new Map(economicCalendarLegend().map((item) => [item.label, item.className]));
assert(economicLegendClasses.get('Falta importe') === 'dot-rose', 'Economic calendar legend must distinguish missing amounts.');
assert(economicLegendClasses.get('En revision') === 'dot-blue', 'Economic calendar legend must include payment review.');
assert(economicLegendClasses.get('Pendiente') === 'dot-amber', 'Economic calendar legend must distinguish pending items.');
assert(economicLegendClasses.get('Liquidar profesor') === 'dot-indigo', 'Economic calendar legend must distinguish teacher payout actions.');
assert(economicLegendClasses.get('Liquidada') === 'dot-emerald', 'Economic calendar legend must distinguish settled classes.');
const confirmationPayload = buildFamilyClassPaymentConfirmationPayload(confirmationGroups[0], {
  familyUid: 'family_1',
  metodo: 'bizum',
  referencia: 'BIZ-42',
}, { nowIso: '2026-06-28T10:00:00.000Z' });
assert(confirmationPayload.classIds.length === 2, 'Family confirmation payload must keep explicit class ids.');
assert(confirmationPayload.reconciliationStatus === 'matched', 'Family confirmation payload must be reconciled from creation.');
assert(confirmationPayload.verificationSource === 'family_dashboard_confirmation', 'Family confirmation payload must expose its source.');
assert(confirmationPayload.paymentRecipientPhone === '613016665', 'Class-linked family payments must keep the central Bizum phone.');
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
  { nowMs: new Date('2026-06-28T19:00:00').getTime() },
).state === 'pending', 'Unpaid classes must stay pending before the 48h grace expires.');
assert(classFamilyPaymentState(
  { fecha: '2026-06-25', hora_fin: '18:00', familyPaymentStatus: 'pendiente' },
  weeklySchedule,
  { nowMs: new Date('2026-06-28T21:01:00').getTime() },
).state === 'overdue', 'Unpaid classes must become overdue after the weekly due date plus 48h.');
assert(classFamilyPaymentState(
  { fecha: '2026-06-25', hora_fin: '18:00', familyPaymentStatus: 'validado' },
  weeklySchedule,
).state === 'paid', 'Validated classes must render as paid.');

console.log('Payment engine validation passed.');
