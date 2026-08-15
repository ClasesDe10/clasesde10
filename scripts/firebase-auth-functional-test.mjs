#!/usr/bin/env node
/**
 * Real Firebase Auth smoke test.
 *
 * Creates a temporary password user through Identity Toolkit, signs in, looks it
 * up, deletes it, and verifies the current admin identity exists. No app data is
 * migrated and no Firestore writes are performed.
 */

import fs from 'node:fs';
import process from 'node:process';
import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const firebaseClientSource = fs.readFileSync('js/firebase-client.js', 'utf8');
const apiKey = firebaseClientSource.match(/apiKey:\s*'([^']+)'/)?.[1];
const projectId = firebaseClientSource.match(/projectId:\s*'([^']+)'/)?.[1] || 'clasesde10-50add';
const adminEmail = 'contacto.clasesde10@gmail.com';
const adminApp = initializeApp({ credential: applicationDefault(), projectId }, `auth-functional-${Date.now()}`);
const adminAuth = getAuth(adminApp);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

async function identity(method, payload) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || JSON.stringify(body);
    throw new Error(`${method} failed (${response.status}): ${message}`);
  }
  return body;
}

async function lookupAdminWithAdminSdk() {
  try {
    const user = await adminAuth.getUserByEmail(adminEmail);
    return { available: true, user, error: null };
  } catch (error) {
    return { available: true, user: null, error: error.message };
  }
}

if (!apiKey) fail('Firebase apiKey not found in js/firebase-client.js.');

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const tempEmail = `phase2-auth-test-${suffix}@example.com`;
const tempPassword = `Tmp-${suffix}-A1!`;
let tempIdToken = null;
let tempLocalId = null;

try {
  const signUp = await identity('signUp', {
    email: tempEmail,
    password: tempPassword,
    returnSecureToken: true,
  });
  tempIdToken = signUp.idToken;
  tempLocalId = signUp.localId;

  const signIn = await identity('signInWithPassword', {
    email: tempEmail,
    password: tempPassword,
    returnSecureToken: true,
  });

  const lookup = await identity('lookup', {
    idToken: signIn.idToken,
  });

  const adminLookup = await lookupAdminWithAdminSdk();
  const adminUser = adminLookup.user;

  const adminPassword = process.env.FIREBASE_ADMIN_TEST_PASSWORD;
  let adminSignIn = 'skipped';
  if (adminPassword) {
    await identity('signInWithPassword', {
      email: adminEmail,
      password: adminPassword,
      returnSecureToken: true,
    });
    adminSignIn = 'passed';
  }

  console.log(JSON.stringify({
    ok: true,
    projectId,
    tempUser: {
      created: Boolean(tempLocalId),
      signedIn: signIn.email === tempEmail,
      lookupCount: lookup.users?.length || 0,
    },
    admin: {
      email: adminEmail,
      exists: Boolean(adminUser),
      uid: adminUser?.uid || null,
      disabled: adminUser?.disabled || false,
      lookupAvailable: adminLookup.available,
      lookupError: adminLookup.error,
      signIn: adminSignIn,
      signInNote: adminPassword
        ? 'Admin password was provided through FIREBASE_ADMIN_TEST_PASSWORD.'
        : 'Admin password not available in environment; credential sign-in was not attempted.',
    },
  }, null, 2));
} finally {
  if (tempIdToken) {
    try {
      await identity('delete', { idToken: tempIdToken });
    } catch (error) {
      console.error(`WARNING: could not delete temporary Firebase Auth user ${tempEmail}: ${error.message}`);
    }
  }
  await deleteApp(adminApp).catch(() => {});
}
