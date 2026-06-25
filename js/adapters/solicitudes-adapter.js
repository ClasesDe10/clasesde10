import { makeFirestoreAdapter } from './firebase-firestore-adapter.js';
import { COLLECTIONS } from './contracts.js';

const base = makeFirestoreAdapter(COLLECTIONS.solicitudes);

export const solicitudesAdapter = {
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

  assignTeacher(requestId, teacherUid) {
    return base.update(requestId, {
      assignedTeacherUid: teacherUid,
      status: 'asignada',
    });
  },
};

export default solicitudesAdapter;
