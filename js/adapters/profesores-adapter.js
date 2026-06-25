import { makeFirestoreAdapter } from './firebase-firestore-adapter.js';
import { COLLECTIONS } from './contracts.js';

const base = makeFirestoreAdapter(COLLECTIONS.profesores);

export const profesoresAdapter = {
  ...base,

  getByUserUid(uid) {
    return base.getById(uid);
  },

  listByVerificationStatus(verificationStatus, options = {}) {
    return base.list({
      ...options,
      filters: [
        ...(options.filters || []),
        { field: 'verificationStatus', value: verificationStatus },
      ],
      orderBy: options.orderBy || [{ field: 'createdAt', direction: 'desc' }],
    });
  },
};

export default profesoresAdapter;
