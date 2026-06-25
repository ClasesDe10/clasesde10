import { makeFirestoreAdapter } from './firebase-firestore-adapter.js';
import { COLLECTIONS } from './contracts.js';

const base = makeFirestoreAdapter(COLLECTIONS.users);

export const usersAdapter = {
  ...base,

  getCurrentProfile(uid) {
    return base.getById(uid);
  },

  listByRole(role, options = {}) {
    return base.list({
      ...options,
      filters: [
        ...(options.filters || []),
        { field: 'role', value: role },
      ],
      orderBy: options.orderBy || [{ field: 'createdAt', direction: 'desc' }],
    });
  },

  setActive(uid, active) {
    return base.update(uid, { active: active === true });
  },
};

export default usersAdapter;
