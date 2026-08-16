import {
  CLASS_LIFECYCLE_STATES,
  buildClassLifecycleTransition,
  buildLifecycleNotifications,
  canTransitionClassLifecycle,
  deriveLifecycleTargetState,
  nextLifecycleState,
  normalizeLifecycleState,
} from '../js/class-lifecycle-engine.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const now = new Date('2026-06-30T18:15:00').getTime();

assert(CLASS_LIFECYCLE_STATES.includes('clase_programada'), 'Lifecycle states must include scheduled classes.');
assert(normalizeLifecycleState('confirmada') === 'clase_programada', 'Legacy scheduled status must map to lifecycle state.');
assert(canTransitionClassLifecycle('clase_programada', 'clase_iniciada'), 'Scheduled classes must be able to start.');
assert(nextLifecycleState('clase_programada', 'pendiente_pago') === 'clase_finalizada', 'Long jumps must move through the first valid transition.');

assert(deriveLifecycleTargetState({
  estado: 'confirmada',
  fecha: '2026-07-02',
  hora_inicio: '17:00',
  hora_fin: '18:00',
}, { nowMs: now }) === 'clase_programada', 'Future classes must stay scheduled.');

assert(deriveLifecycleTargetState({
  estado: 'confirmada',
  fecha: '2026-07-01',
  hora_inicio: '17:00',
  hora_fin: '18:00',
}, { nowMs: now }) === 'clase_proxima', 'Classes inside the next 24 hours must become upcoming when no reminder window is active.');

assert(deriveLifecycleTargetState({
  estado: 'confirmada',
  fecha: '2026-07-01',
  hora_inicio: '17:00',
  hora_fin: '18:00',
}, { nowMs: new Date('2026-06-30T17:30:00').getTime() }) === 'recordatorio_enviado', 'Reminder windows must enter reminder state.');

assert(deriveLifecycleTargetState({
  estado: 'confirmada',
  fecha: '2026-06-30',
  hora_inicio: '18:00',
  hora_fin: '19:00',
}, { nowMs: now }) === 'clase_iniciada', 'Classes currently in progress must enter started state.');

assert(deriveLifecycleTargetState({
  lifecycleStatus: 'recordatorio_enviado',
  estado: 'confirmada',
  fecha: '2026-06-30',
  hora_inicio: '18:00',
  hora_fin: '19:00',
}, { nowMs: now }) === 'clase_iniciada', 'Reminder state must advance when the class starts.');

assert(deriveLifecycleTargetState({
  estado: 'confirmada',
  fecha: '2026-06-30',
  hora_inicio: '17:00',
  hora_fin: '18:00',
}, { nowMs: now }) === 'clase_finalizada', 'Recently ended scheduled classes must enter finished state.');

assert(deriveLifecycleTargetState({
  estado: 'confirmada',
  fecha: '2026-06-30',
  hora_inicio: '16:00',
  hora_fin: '17:00',
}, { nowMs: now }) === 'pendiente_confirmacion', 'Stale ended scheduled classes must request confirmation.');
const unmarkedLifecycleNotifications = buildLifecycleNotifications('class_waiting_teacher', 'pendiente_confirmacion', {
  estado: 'confirmada',
  fecha: '2026-06-30',
  hora_inicio: '16:00',
});
assert(unmarkedLifecycleNotifications.some((item) => item.role === 'teacher'), 'An unmarked ended class must remind the teacher.');
assert(!unmarkedLifecycleNotifications.some((item) => item.role === 'family'), 'A family must not be prompted before the teacher marks attendance.');

const confirmedClass = {
  estado: 'realizada',
  teacherConfirmationStatus: 'realizada',
  familyConfirmationStatus: 'realizada',
  precio_total: 25,
  importe_profesor: 18,
  familyPaymentStatus: 'pendiente',
  teacherPaymentStatus: 'pendiente',
};

assert(deriveLifecycleTargetState(confirmedClass, { nowMs: now }) === 'pendiente_pago', 'Confirmed unpaid classes must wait for family payment.');

assert(deriveLifecycleTargetState({
  ...confirmedClass,
  linkedFamilyPaymentId: 'pay_pending',
  linkedFamilyPaymentRawStatus: 'pendiente',
}, { nowMs: now }) === 'pago_en_revision', 'Linked open payment proofs must move classes into payment review.');

assert(deriveLifecycleTargetState({
  estado: 'pagada',
  precio_total: 25,
  importe_profesor: 18,
  teacherPaymentStatus: 'pendiente',
}, { nowMs: now }) === 'pago_recibido', 'Legacy paid classes must not reopen confirmation when attendance fields are missing.');

const paidClass = {
  ...confirmedClass,
  lifecycleStatus: 'pendiente_pago',
  familyPaymentStatus: 'validado',
};
assert(deriveLifecycleTargetState(paidClass, { nowMs: now }) === 'pago_recibido', 'Validated family payments must enter received-payment state.');

const teacherPaidClass = {
  ...paidClass,
  lifecycleStatus: 'pago_recibido',
  teacherPaymentStatus: 'pagado',
};
assert(deriveLifecycleTargetState(teacherPaidClass, { nowMs: now }) === 'comision_liquidada', 'Paid teacher payouts must liquidate commission.');

const reviewPendingClass = {
  ...teacherPaidClass,
  lifecycleStatus: 'comision_liquidada',
};
assert(deriveLifecycleTargetState(reviewPendingClass, { nowMs: now }) === 'valoracion_pendiente', 'Liquidated classes must request review.');

const archivedClass = {
  ...reviewPendingClass,
  lifecycleStatus: 'valoracion_pendiente',
  rating: 5,
  lifecycleCompletedAt: '2026-06-01T18:00:00.000Z',
};
assert(deriveLifecycleTargetState(archivedClass, { nowMs: now }) === 'clase_archivada', 'Old reviewed classes must archive automatically.');

const incidentClass = {
  ...confirmedClass,
  incidentStatus: 'abierta',
};
assert(deriveLifecycleTargetState(incidentClass, { nowMs: now }) === 'incidencia_abierta', 'Open incidents must dominate lifecycle.');

const transition = buildClassLifecycleTransition('class_1', {
  ...confirmedClass,
  lifecycleStatus: 'pendiente_confirmacion',
}, { nowMs: now, nowIso: '2026-06-30T18:15:00.000Z' });

assert(transition.changed, 'Transition builder must detect pending payment transition.');
assert(transition.from === 'pendiente_confirmacion', 'Transition must preserve previous state.');
assert(transition.to === 'pendiente_pago', 'Transition must apply the next lifecycle state.');
assert(transition.patch.lifecycleStatus === 'pendiente_pago', 'Transition patch must update lifecycle status.');
assert(transition.historyEvent.classId === 'class_1', 'Transition must include history event.');
assert(transition.auditEvent.type === 'class_lifecycle_transition', 'Transition must include audit event.');
assert(transition.notifications.some((item) => item.role === 'family'), 'Pending payment must notify family.');

const reviewTransition = buildClassLifecycleTransition('class_review', {
  ...confirmedClass,
  lifecycleStatus: 'pendiente_pago',
  linkedFamilyPaymentId: 'pay_pending',
  linkedFamilyPaymentRawStatus: 'procesando',
}, { nowMs: now, nowIso: '2026-06-30T18:15:00.000Z' });

assert(reviewTransition.to === 'pago_en_revision', 'Transition builder must apply payment review state.');
assert(reviewTransition.patch.paymentReviewStartedAt, 'Payment review transitions must timestamp review start.');
assert(reviewTransition.notifications.some((item) => item.type === 'family_payment_review'), 'Payment review transitions must notify admin.');

console.log('Class lifecycle engine validation passed.');
