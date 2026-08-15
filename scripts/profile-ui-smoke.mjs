#!/usr/bin/env node
/**
 * End-to-end profile smoke tests against the deployed UI.
 *
 * Creates temporary Firebase Auth users, drives the real dashboards in Chrome,
 * verifies Firestore writes, and removes temporary Auth/Firestore data.
 */

import fs from 'node:fs';
import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { chromium } from 'playwright';

const firebaseClientSource = fs.readFileSync('js/firebase-client.js', 'utf8');
const apiKey = firebaseClientSource.match(/apiKey:\s*'([^']+)'/)?.[1];
const projectId = firebaseClientSource.match(/projectId:\s*'([^']+)'/)?.[1] || 'clasesde10-50add';
const database = '(default)';
const smokeUrl = process.env.CD10_SMOKE_URL || 'https://clasesde10.com';
const adminApp = initializeApp({ credential: applicationDefault(), projectId }, `profile-ui-smoke-${Date.now()}`);
const adminDb = getFirestore(adminApp);

if (!apiKey) {
  console.error('ERROR: Firebase apiKey not found in js/firebase-client.js.');
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
    throw new Error(`${method} failed (${response.status}): ${body?.error?.message || JSON.stringify(body)}`);
  }
  return body;
}

async function firestoreDeleteWithAdmin(collection, uid) {
  await adminDb.doc(`${collection}/${uid}`).delete();
  return { ok: true };
}

async function launchChrome() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

async function runBrowserScript(script, email, password) {
  const source = fs.readFileSync(script, 'utf8').trim();
  const testFn = (0, eval)(`(${source})`);
  const previousEmail = process.env.CD10_PROFILE_EMAIL;
  const previousPassword = process.env.CD10_PROFILE_PASSWORD;
  process.env.CD10_PROFILE_EMAIL = email;
  process.env.CD10_PROFILE_PASSWORD = password;

  const browser = await launchChrome();
  const page = await browser.newPage();
  try {
    await page.goto(smokeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    return await testFn(page);
  } finally {
    await browser.close().catch(() => {});
    if (previousEmail === undefined) delete process.env.CD10_PROFILE_EMAIL;
    else process.env.CD10_PROFILE_EMAIL = previousEmail;
    if (previousPassword === undefined) delete process.env.CD10_PROFILE_PASSWORD;
    else process.env.CD10_PROFILE_PASSWORD = previousPassword;
  }
}

async function runCase({ role, collection, script }) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `profile-ui-${role}-${suffix}@example.com`;
  const password = `Tmp-${suffix}-A1!`;
  let idToken = null;
  let uid = null;
  const cleanup = [];

  try {
    const signUp = await identity('signUp', {
      email,
      password,
      returnSecureToken: true,
    });
    idToken = signUp.idToken;
    uid = signUp.localId;

    const result = await runBrowserScript(script, email, password);
    uid = result.uid || uid;
    cleanup.push(await firestoreDeleteWithAdmin(collection, uid));
    cleanup.push(await firestoreDeleteWithAdmin('users', uid));

    return { role, uid, ok: true, result, cleanup };
  } finally {
    if (uid && cleanup.length === 0) {
      try {
        cleanup.push(await firestoreDeleteWithAdmin(collection, uid));
        cleanup.push(await firestoreDeleteWithAdmin('users', uid));
      } catch {}
    }
    if (idToken) {
      try {
        await identity('delete', { idToken });
      } catch (error) {
        console.error(`WARNING: could not delete temporary Firebase Auth user ${email}: ${error.message}`);
      }
    }
  }
}

const cases = [
  {
    role: 'familia-journey',
    collection: 'familias',
    script: 'scripts/family-journey-ui-smoke.playwright.js',
  },
  {
    role: 'familia',
    collection: 'familias',
    script: 'scripts/family-profile-ui-smoke.playwright.js',
  },
  {
    role: 'profesor',
    collection: 'profesores',
    script: 'scripts/professor-profile-ui-smoke.playwright.js',
  },
];

const requestedCases = new Set(
  String(process.env.CD10_PROFILE_CASES || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const selectedCases = requestedCases.size
  ? cases.filter((item) => requestedCases.has(item.role))
  : cases;

const results = [];
for (const item of selectedCases) {
  results.push(await runCase(item));
}

console.log(JSON.stringify({
  ok: true,
  projectId,
  smokeUrl,
  results,
}, null, 2));
await deleteApp(adminApp);
