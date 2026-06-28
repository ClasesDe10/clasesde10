import { makeFirestoreAdapter } from './firebase-firestore-adapter.js';
import { COLLECTIONS } from './contracts.js';
import { lifecycleStatusForClassStatus } from '../calendar-engine.js';

const base = makeFirestoreAdapter(COLLECTIONS.clases);

function participantList(field, value, options = {}) {
  return base.list({
    ...options,
    filters: [
      ...(options.filters || []),
      { field, value },
    ],
    orderBy: options.orderBy || [{ field: 'date', direction: 'desc' }],
  });
}

export const clasesAdapter = {
  ...base,

  listByTeacher(teacherUid, options = {}) {
    return participantList('teacherUid', teacherUid, options);
  },

  listByFamily(familyUid, options = {}) {
    return participantList('familyUid', familyUid, options);
  },

  listByStudent(studentId, options = {}) {
    return participantList('studentId', studentId, options);
  },

  setStatus(classId, status, extra = {}) {
    return base.update(classId, {
      ...extra,
      status,
      estado: status,
      lifecycleStatus: lifecycleStatusForClassStatus(status),
    });
  },
};

export default clasesAdapter;
