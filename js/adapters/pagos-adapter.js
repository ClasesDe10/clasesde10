import { makeFirestoreAdapter } from './firebase-firestore-adapter.js';
import { COLLECTIONS } from './contracts.js';
import {
  buildFamilyPaymentPayload,
  buildGatewayPaymentUpdate,
  buildPaymentValidationPayload,
  buildTeacherPayoutPayload,
} from '../payment-engine.js';

const base = makeFirestoreAdapter(COLLECTIONS.pagos);

export const pagosAdapter = {
  ...base,

  listByFamily(familyUid, options = {}) {
    return base.list({
      ...options,
      filters: [
        ...(options.filters || []),
        { field: 'familyUid', value: familyUid },
      ],
      orderBy: options.orderBy || [{ field: 'createdAt', direction: 'desc' }],
    });
  },

  listByTeacher(teacherUid, options = {}) {
    return base.list({
      ...options,
      filters: [
        ...(options.filters || []),
        { field: 'teacherUid', value: teacherUid },
      ],
      orderBy: options.orderBy || [{ field: 'createdAt', direction: 'desc' }],
    });
  },

  listByStatus(status, options = {}) {
    return base.list({
      ...options,
      filters: [
        ...(options.filters || []),
        { field: 'status', value: status },
      ],
      orderBy: options.orderBy || [{ field: 'createdAt', direction: 'desc' }],
    });
  },

  createFamilyPayment(payload = {}) {
    return base.create(buildFamilyPaymentPayload(payload));
  },

  requestTeacherPayout(teacherUid, payload = {}) {
    return base.create(buildTeacherPayoutPayload(teacherUid, payload));
  },

  validatePayment(paymentId, validatedByUid, extra = {}) {
    return base.update(paymentId, buildPaymentValidationPayload(extra.payment || {}, extra.status || 'validado', validatedByUid, extra));
  },

  applyGatewayEvent(paymentId, event = {}) {
    return base.update(paymentId, buildGatewayPaymentUpdate(event));
  },
};

export default pagosAdapter;
