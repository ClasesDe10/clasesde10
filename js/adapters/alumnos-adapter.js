import { makeFirestoreAdapter } from './firebase-firestore-adapter.js';
import { COLLECTIONS } from './contracts.js';

const base = makeFirestoreAdapter(COLLECTIONS.alumnos);

export const alumnosAdapter = {
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

  listByStudentUid(studentUid, options = {}) {
    return base.list({
      ...options,
      filters: [
        ...(options.filters || []),
        { field: 'studentUid', value: studentUid },
      ],
      orderBy: options.orderBy || [{ field: 'createdAt', direction: 'desc' }],
    });
  },
};

export default alumnosAdapter;
