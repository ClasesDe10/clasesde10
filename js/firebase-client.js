/**
 * ClasesDe10 - Firebase client.
 *
 * Static Netlify build: use Firebase browser modules from the official CDN
 * instead of npm/bundler imports.
 */

import { getApp, getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-analytics.js';
import { connectAuthEmulator, getAuth } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js';
import { connectFirestoreEmulator, getFirestore } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-storage.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyAmxd60aRYpOrrORXpNJbsnwVaJf2S77E8',
  authDomain: 'clasesde10-50add.firebaseapp.com',
  projectId: 'clasesde10-50add',
  storageBucket: 'clasesde10-50add.firebasestorage.app',
  messagingSenderId: '895894357385',
  appId: '1:895894357385:web:0c111a81b31f404a094d58',
  measurementId: 'G-5B8GTQJQQW',
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firebaseDb = getFirestore(firebaseApp);
export const firebaseStorage = getStorage(firebaseApp);

function useLocalFirebaseEmulators() {
  const hostname = String(globalThis.location?.hostname || '').toLowerCase();
  if (!['127.0.0.1', 'localhost'].includes(hostname)) return false;
  try {
    const requested = new URLSearchParams(globalThis.location?.search || '').get('firebase-emulator') === '1';
    if (requested) globalThis.localStorage?.setItem('cd10_use_firebase_emulators', '1');
    return requested || globalThis.localStorage?.getItem('cd10_use_firebase_emulators') === '1';
  } catch (_) {
    return false;
  }
}

if (useLocalFirebaseEmulators()) {
  connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(firebaseDb, '127.0.0.1', 8080);
}

let analyticsPromise;

export function getFirebaseAnalytics() {
  if (!analyticsPromise) {
    analyticsPromise = isAnalyticsSupported()
      .then((supported) => (supported ? getAnalytics(firebaseApp) : null))
      .catch(() => null);
  }

  return analyticsPromise;
}

export default {
  app: firebaseApp,
  auth: firebaseAuth,
  db: firebaseDb,
  storage: firebaseStorage,
  getAnalytics: getFirebaseAnalytics,
};
