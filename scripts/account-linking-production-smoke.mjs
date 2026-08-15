#!/usr/bin/env node

import fs from 'node:fs';
import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'clasesde10-50add';
const firebaseClientSource = fs.readFileSync('js/firebase-client.js', 'utf8');
const API_KEY = firebaseClientSource.match(/apiKey:\s*'([^']+)'/)?.[1];
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const uid = `prod-link-smoke-${suffix}`;
const email = `prod-link-smoke-${suffix}@example.com`;
const password = `Tmp-Link-${suffix}-A1!`;

if (!API_KEY) throw new Error('Firebase API key not found.');

const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID }, `account-link-${suffix}`);
const auth = getAuth(app);
const db = getFirestore(app);
let userCreated = false;
let smokeResult = null;

async function identity(method, payload) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} failed (${response.status}): ${body?.error?.message || JSON.stringify(body)}`);
  }
  return body;
}

function actionCodeFromLink(rawLink) {
  let current = new URL(rawLink);
  for (let depth = 0; depth < 3; depth += 1) {
    const code = current.searchParams.get('oobCode');
    if (code) return code;
    const nested = current.searchParams.get('link');
    if (!nested) break;
    current = new URL(nested);
  }
  throw new Error('Generated email link does not contain an action code.');
}

try {
  const importResult = await auth.importUsers([{
    uid,
    email,
    emailVerified: true,
    displayName: 'Prueba Vinculacion Produccion',
    providerData: [{
      uid: `google-${suffix}`,
      email,
      displayName: 'Prueba Vinculacion Produccion',
      providerId: 'google.com',
    }],
  }]);
  if (importResult.failureCount) {
    throw new Error(`Could not create Google-only test identity: ${importResult.errors[0]?.error?.message || 'unknown error'}`);
  }
  userCreated = true;

  await Promise.all([
    db.doc(`users/${uid}`).set({
      email,
      nombre: 'Prueba',
      apellidos: 'Vinculacion Produccion',
      telefono: '+34600000000',
      role: 'familia',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    db.doc(`familias/${uid}`).set({
      userUid: uid,
      email,
      nombre: 'Prueba',
      apellidos: 'Vinculacion Produccion',
      telefono: '+34600000000',
      active: true,
      status: 'activo',
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  ]);

  const emailLink = await auth.generateSignInWithEmailLink(email, {
    url: 'https://clasesde10.com/pages/crear-contrasena.html',
    handleCodeInApp: true,
    linkDomain: 'clasesde10.com',
  });
  const emailLinkSignIn = await identity('signInWithEmailLink', {
    email,
    oobCode: actionCodeFromLink(emailLink),
  });
  if (emailLinkSignIn.localId !== uid) {
    throw new Error('Email-link verification did not preserve the original Google account UID.');
  }

  await identity('update', {
    idToken: emailLinkSignIn.idToken,
    password,
    returnSecureToken: true,
  });
  const passwordSignIn = await identity('signInWithPassword', {
    email,
    password,
    returnSecureToken: true,
  });
  if (passwordSignIn.localId !== uid) {
    throw new Error('Password sign-in did not return the original Google account UID.');
  }

  const finalUser = await auth.getUser(uid);
  const providers = finalUser.providerData.map((provider) => provider.providerId).sort();
  if (!providers.includes('google.com') || !providers.includes('password')) {
    throw new Error(`Expected Google and password providers, found: ${providers.join(', ')}`);
  }

  smokeResult = {
    ok: true,
    projectId: PROJECT_ID,
    originalUidPreserved: true,
    emailLinkVerified: true,
    passwordSignInVerified: true,
    providers,
  };
} finally {
  await Promise.allSettled([
    db.doc(`familias/${uid}`).delete(),
    db.doc(`users/${uid}`).delete(),
  ]);
  if (userCreated) await auth.deleteUser(uid).catch(() => {});
  await deleteApp(app);
}

console.log(JSON.stringify({ ...smokeResult, temporaryDataCleaned: true }, null, 2));
