/**
 * ClasesDe10 - Web Push / FCM registration.
 *
 * Stores one token per browser/device in Firestore. Cloud Functions use those
 * tokens to send push notifications when a notification document is created.
 */

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import {
  getMessaging,
  getToken,
  isSupported as isMessagingSupported,
  onMessage,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging.js';
import { firebaseApp, firebaseDb } from './firebase-client.js?v=20260627-domain-auth';

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

async function sha256(value) {
  const input = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function tokenDocumentId(userUid, token) {
  const hash = await sha256(`${userUid}:${token}`);
  return `${clean(userUid, 80)}_${hash.slice(0, 32)}`;
}

export async function loadNotificationPublicConfig() {
  const snap = await getDoc(doc(firebaseDb, 'configuracionPublica', 'notificaciones')).catch(() => null);
  return snap?.exists() ? snap.data() : {};
}

export async function browserSupportsPush() {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;
  return isMessagingSupported().catch(() => false);
}

export async function registerPushNotifications({ userUid, role = '', vapidKey = '' } = {}) {
  const uid = clean(userUid, 180);
  if (!uid) return { ok: false, status: 'missing_user' };

  const supported = await browserSupportsPush();
  if (!supported) return { ok: false, status: 'unsupported' };

  const publicConfig = await loadNotificationPublicConfig();
  const finalVapidKey = clean(vapidKey || publicConfig.fcmVapidKey || publicConfig.vapidKey, 300);
  if (!finalVapidKey) return { ok: false, status: 'missing_vapid_key' };

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, status: permission || 'permission_denied' };

  const registration = await navigator.serviceWorker.ready.catch(async () => (
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
  ));
  const messaging = getMessaging(firebaseApp);
  const token = await getToken(messaging, {
    vapidKey: finalVapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) return { ok: false, status: 'empty_token' };

  const tokenId = await tokenDocumentId(uid, token);
  await setDoc(doc(firebaseDb, 'notificationTokens', tokenId), {
    userUid: uid,
    role: clean(role, 40),
    token,
    platform: 'web',
    active: true,
    permission,
    origin: window.location.origin,
    userAgent: clean(navigator.userAgent, 500),
    lastSeenAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  }, { merge: true });

  return { ok: true, status: 'registered', tokenId };
}

export async function watchForegroundPushMessages(callback) {
  if (typeof callback !== 'function') return null;
  const supported = await browserSupportsPush();
  if (!supported) return null;

  const messaging = getMessaging(firebaseApp);
  return onMessage(messaging, (payload) => callback(payload));
}
