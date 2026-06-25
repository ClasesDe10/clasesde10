import { makeFirestoreAdapter } from './firebase-firestore-adapter.js';
import { COLLECTIONS } from './contracts.js';

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

  validatePayment(paymentId, validatedByUid, extra = {}) {
    return base.update(paymentId, {
      ...extra,
      status: 'validado',
      validatedByUid,
      validatedAt: new Date().toISOString(),
    });
  },
};

export default pagosAdapter;
