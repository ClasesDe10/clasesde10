import { makeFirestoreAdapter } from './firebase-firestore-adapter.js';
import { COLLECTIONS } from './contracts.js';

const base = makeFirestoreAdapter(COLLECTIONS.asignaciones);

function activeFilter(active) {
  return active === undefined ? [] : [{ field: 'active', value: active === true }];
}

export const asignacionesAdapter = {
  ...base,

  listByTeacher(teacherUid, options = {}) {
    return base.list({
      ...options,
      filters: [
        ...(options.filters || []),
        { field: 'teacherUid', value: teacherUid },
        ...activeFilter(options.active),
      ],
      orderBy: options.orderBy || [{ field: 'createdAt', direction: 'desc' }],
    });
  },

  listByFamily(familyUid, options = {}) {
    return base.list({
      ...options,
      filters: [
        ...(options.filters || []),
        { field: 'familyUid', value: familyUid },
        ...activeFilter(options.active),
      ],
      orderBy: options.orderBy || [{ field: 'createdAt', direction: 'desc' }],
    });
  },

  listByStudent(studentId, options = {}) {
    return base.list({
      ...options,
      filters: [
        ...(options.filters || []),
        { field: 'studentId', value: studentId },
        ...activeFilter(options.active),
      ],
      orderBy: options.orderBy || [{ field: 'createdAt', direction: 'desc' }],
    });
  },
};

export default asignacionesAdapter;
