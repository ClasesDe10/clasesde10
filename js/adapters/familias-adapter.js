import { makeFirestoreAdapter } from './firebase-firestore-adapter.js';
import { COLLECTIONS } from './contracts.js';

const base = makeFirestoreAdapter(COLLECTIONS.familias);

export const familiasAdapter = {
  ...base,

  getByUserUid(uid) {
    return base.getById(uid);
  },
};

export default familiasAdapter;
