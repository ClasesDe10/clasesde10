import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  REOPEN_FAMILY_PAYMENT_STATUSES,
  buildClassFamilyPaymentReopenPatch,
  shouldReopenFamilyClassPayment,
} from '../js/payment-engine.js';
import {
  NOTIFICATION_EVENTS,
  buildNotificationDocument,
  notificationPriorityClass,
} from '../js/notification-engine.js';

const payment = {
  id: 'pay_rejected_1',
  estado: 'rechazado',
  amount: 64,
  dueAt: '2026-07-03T20:00:00.000Z',
  failureReason: 'Imagen ilegible',
};

const patch = buildClassFamilyPaymentReopenPatch(payment, 'class_1', {
  nowIso: '2026-07-05T10:00:00.000Z',
});

assert.deepEqual(REOPEN_FAMILY_PAYMENT_STATUSES.includes('rechazado'), true);
assert.equal(shouldReopenFamilyClassPayment('rechazado'), true);
assert.equal(shouldReopenFamilyClassPayment('cancelled'), true);
assert.equal(shouldReopenFamilyClassPayment({ estado: 'validado' }), false);
assert.equal(patch.estado_pago, 'vencido');
assert.equal(patch.familyPaymentStatus, 'vencido');
assert.equal(patch.familyPaymentId, null);
assert.equal(patch.rejectedFamilyPaymentId, 'pay_rejected_1');
assert.equal(patch.rejectedFamilyPaymentStatus, 'rechazado');
assert.equal(patch.paymentEscalationStatus, 'reopened_after_rejection');
assert.equal(patch.paymentEscalationStage, 'proof_rejected');
assert.equal(patch.paymentEscalationType, 'payment_rejected');
assert.equal(patch.familyPaymentRejectedReason, 'Imagen ilegible');

const cancelledPatch = buildClassFamilyPaymentReopenPatch({ id: 'pay_cancelled_1', status: 'cancelado' }, 'class_2');
assert.equal(cancelledPatch.paymentEscalationType, 'payment_cancelled');

const rejectedNotification = buildNotificationDocument({
  userUid: 'family_1',
  role: 'familia',
  title: 'Justificante no valido',
  body: 'El justificante no es valido. Por favor, envia ahora otro justificante valido desde Justificantes.',
  type: NOTIFICATION_EVENTS.FAMILY_PAYMENT_REJECTED,
  priority: 'high',
  category: 'pagos',
  payload: {
    paymentId: 'pay_rejected_1',
    url: '/pages/dashboard/familia.html#pagos',
    actionLabel: 'Enviar justificante valido',
    requiresNewProof: true,
  },
});

assert.equal(rejectedNotification.type, NOTIFICATION_EVENTS.FAMILY_PAYMENT_REJECTED);
assert.equal(rejectedNotification.category, 'pagos');
assert.equal(rejectedNotification.actionUrl, '/pages/dashboard/familia.html#pagos');
assert.equal(rejectedNotification.payload.requiresNewProof, true);
assert.equal(notificationPriorityClass(rejectedNotification), 'alta');
assert.equal(notificationPriorityClass({ type: NOTIFICATION_EVENTS.ADMIN_MANUAL, priority: 'medium' }), 'media');
assert.equal(notificationPriorityClass({ type: NOTIFICATION_EVENTS.CLASS_INCIDENT, priority: 'critical' }), 'critica');
assert.equal(notificationPriorityClass({ type: NOTIFICATION_EVENTS.ADMIN_MANUAL }), 'normal');

const adminHtml = await readFile(new URL('../pages/dashboard/admin.html', import.meta.url), 'utf8');
assert.match(adminHtml, /buildClassFamilyPaymentReopenPatch/);
assert.match(adminHtml, /shouldReopenFamilyClassPayment\(normalizedEstado\)/);
assert.match(adminHtml, /notifyFamilyPaymentRejected/);
assert.match(adminHtml, /FAMILY_PAYMENT_REJECTED/);
assert.match(adminHtml, /Justificante no valido/);
assert.match(adminHtml, /no es valido/);
assert.match(adminHtml, /envia ahora un justificante valido desde Justificantes/);
assert.match(adminHtml, /\/pages\/dashboard\/familia\.html#pagos/);
assert.match(adminHtml, /notification-engine\.js\?v=20260707-low-noise/);

const familyHtml = await readFile(new URL('../pages/dashboard/familia.html', import.meta.url), 'utf8');
assert.match(familyHtml, /isRejectedFamilyPayment/);
assert.match(familyHtml, /renderRejectedPaymentRequestCard/);
assert.match(familyHtml, /Justificante no valido/);
assert.match(familyHtml, /Enviar justificante valido/);
assert.match(familyHtml, /payment-review-row-danger/);

const chatWidget = await readFile(new URL('../js/chat-widget.js', import.meta.url), 'utf8');
assert.match(chatWidget, /cd10-notification-priority-styles/);
assert.match(chatWidget, /priority-normal/);
assert.match(chatWidget, /notification-engine\.js\?v=20260707-low-noise/);

console.log('Payment rejection reopen test passed.');
