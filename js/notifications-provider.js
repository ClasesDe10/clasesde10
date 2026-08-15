/**
 * ClasesDe10 - notifications provider.
 *
 * Uses Firestore directly for realtime notifications. Documents are created by
 * admins or trusted automation only; regular users can read and mark theirs.
 */

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { firebaseDb } from './firebase-client.js?v=20260627-domain-auth';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  buildNotificationDocument,
  mergeNotificationSettings,
  shouldDisplayNotification,
} from './notification-engine.js?v=20260815-debt-summary';

function normalizeDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value.seconds) return new Date(value.seconds * 1000).toISOString();
  return '';
}

function sortNotifications(items) {
  return items.sort((a, b) => String(normalizeDate(b.createdAt)).localeCompare(String(normalizeDate(a.createdAt))));
}

function isUnread(item) {
  return !item.readAt && item.leida !== true;
}

export async function watchUnreadNotifications(db, usuarioId, callback, role = '') {
  if (!db || !usuarioId || typeof callback !== 'function') return null;

  return onSnapshot(
    query(
      collection(firebaseDb, 'notificaciones'),
      where('userUid', '==', usuarioId),
      where('readAt', '==', null),
      limit(200),
    ),
    (snapshot) => callback(snapshot.docs.filter((item) => {
      const notification = item.data();
      return isUnread(notification) && shouldDisplayNotification(notification, role);
    }).length),
    () => callback(0),
  );
}

export function watchUserNotifications(usuarioId, callback) {
  if (!usuarioId || typeof callback !== 'function') return null;

  return onSnapshot(
    query(
      collection(firebaseDb, 'notificaciones'),
      where('userUid', '==', usuarioId),
      orderBy('createdAt', 'desc'),
      limit(100),
    ),
    (snapshot) => {
      const data = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      callback(sortNotifications(data).slice(0, 80));
    },
    () => callback([]),
  );
}

export async function markNotificationRead(notificationId) {
  if (!notificationId) return;
  await updateDoc(doc(firebaseDb, 'notificaciones', notificationId), {
    readAt: serverTimestamp(),
    leida: true,
    updatedAt: serverTimestamp(),
  });
}

export async function markAllNotificationsRead(notifications = []) {
  const unread = notifications.filter((item) => item?.id && isUnread(item));
  await Promise.all(unread.map((item) => markNotificationRead(item.id)));
}

export async function loadNotificationSettings() {
  const [privateSnap, publicSnap] = await Promise.all([
    getDoc(doc(firebaseDb, 'configuracion', 'notificaciones')).catch(() => null),
    getDoc(doc(firebaseDb, 'configuracionPublica', 'notificaciones')).catch(() => null),
  ]);

  return {
    settings: mergeNotificationSettings(privateSnap?.exists() ? privateSnap.data() : DEFAULT_NOTIFICATION_SETTINGS),
    publicConfig: publicSnap?.exists() ? publicSnap.data() : {},
  };
}

export async function saveNotificationSettings(settings = {}, publicConfig = {}) {
  const merged = mergeNotificationSettings(settings);
  await Promise.all([
    setDoc(doc(firebaseDb, 'configuracion', 'notificaciones'), {
      ...merged,
      updatedAt: serverTimestamp(),
    }, { merge: true }),
    setDoc(doc(firebaseDb, 'configuracionPublica', 'notificaciones'), {
      ...publicConfig,
      updatedAt: serverTimestamp(),
    }, { merge: true }),
  ]);
  return merged;
}

export async function createAdminNotification({ targetRole = 'todos', title, body, actionUrl = '', currentUid = '' } = {}) {
  const usersQuery = targetRole && targetRole !== 'todos'
    ? query(collection(firebaseDb, 'users'), where('role', '==', targetRole))
    : collection(firebaseDb, 'users');
  const snap = await getDocs(usersQuery);
  const recipients = snap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((user) => user.active !== false);

  await Promise.all(recipients.map((user) => addDoc(collection(firebaseDb, 'notificaciones'), {
    ...buildNotificationDocument({
      userUid: user.id,
      role: user.role || targetRole,
      title,
      body,
      type: 'admin_manual',
      source: 'admin',
      createdByUid: currentUid,
      payload: { targetRole, url: actionUrl || '/pages/login.html' },
    }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })));

  return recipients.length;
}

export async function requestBrowserNotificationPermission() {
  if (typeof Notification === 'undefined') {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

export async function showBrowserNotification(title, body, data = {}) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  try {
    const registration = 'serviceWorker' in navigator
      ? await navigator.serviceWorker.ready.catch(() => null)
      : null;
    if (registration?.showNotification) {
      await registration.showNotification(title, {
        body,
        icon: '/assets/img/logo-192.png',
        badge: '/assets/img/logo-192.png',
        tag: data.notificationId || data.type || 'clasesde10-notification',
        data,
      });
      return true;
    }
    new Notification(title, { body, data });
    return true;
  } catch (_) {
    return false;
  }
}
