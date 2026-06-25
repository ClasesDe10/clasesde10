import {
  collection,
  getCountFromServer,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { firebaseDb } from '../firebase-client.js';
import { makeFirestoreAdapter } from './firebase-firestore-adapter.js';
import { adapterError, adapterResult, COLLECTIONS } from './contracts.js';

const base = makeFirestoreAdapter(COLLECTIONS.notificaciones);

function userNotificationsQuery(userUid, unreadOnly = false) {
  const constraints = [
    where('userUid', '==', userUid),
    orderBy('createdAt', 'desc'),
  ];
  if (unreadOnly) constraints.unshift(where('readAt', '==', null));
  return query(collection(firebaseDb, COLLECTIONS.notificaciones), ...constraints);
}

export const notificacionesAdapter = {
  ...base,

  listByUser(userUid, options = {}) {
    return base.list({
      ...options,
      filters: [
        ...(options.filters || []),
        { field: 'userUid', value: userUid },
      ],
      orderBy: options.orderBy || [{ field: 'createdAt', direction: 'desc' }],
    });
  },

  watchUnread(userUid, callback) {
    if (!userUid || typeof callback !== 'function') return null;

    return onSnapshot(
      userNotificationsQuery(userUid, true),
      (snapshot) => callback(snapshot.size),
      () => callback(0),
    );
  },

  async countUnread(userUid) {
    try {
      const snap = await getCountFromServer(userNotificationsQuery(userUid, true));
      return adapterResult(snap.data().count || 0, null);
    } catch (error) {
      return adapterResult(0, adapterError(error));
    }
  },

  markAsRead(notificationId) {
    return base.update(notificationId, {
      readAt: serverTimestamp(),
    });
  },
};

export default notificacionesAdapter;
