/**
 * ClasesDe10 - notifications provider.
 *
 * Uses Firestore directly for realtime notifications. Documents are created by
 * admins or trusted automation only; regular users can read and mark theirs.
 */

import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { firebaseDb } from './firebase-client.js?v=20260627-domain-auth';

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

export async function watchUnreadNotifications(db, usuarioId, callback) {
  if (!db || !usuarioId || typeof callback !== 'function') return null;

  return onSnapshot(
    query(collection(firebaseDb, 'notificaciones'), where('userUid', '==', usuarioId)),
    (snapshot) => callback(snapshot.docs.filter((item) => isUnread(item.data())).length),
    () => callback(0),
  );
}

export function watchUserNotifications(usuarioId, callback) {
  if (!usuarioId || typeof callback !== 'function') return null;

  return onSnapshot(
    query(collection(firebaseDb, 'notificaciones'), where('userUid', '==', usuarioId)),
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
