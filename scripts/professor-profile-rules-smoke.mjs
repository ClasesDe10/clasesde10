#!/usr/bin/env node
/**
 * Production Firestore rules smoke for the teacher profile flow.
 *
 * Creates a temporary Firebase Auth professor, writes users/{uid} and
 * profesores/{uid} using the same fields as the dashboard, then removes the
 * temporary Auth user and documents. This intentionally does not approve the
 * teacher or touch legacy Supabase data.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const firebaseClientSource = fs.readFileSync('js/firebase-client.js', 'utf8');
const apiKey = firebaseClientSource.match(/apiKey:\s*'([^']+)'/)?.[1];
const projectId = firebaseClientSource.match(/projectId:\s*'([^']+)'/)?.[1] || 'clasesde10-50add';
const database = '(default)';

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
    throw new Error(`${method} failed (${response.status}): ${body?.error?.message || JSON.stringify(body)}`);
  }
  return body;
}

function readFirebaseCliToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(configPath)) return null;
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return config?.tokens?.access_token || null;
}

async function firestoreDeleteWithCliToken(collection, uid) {
  const token = readFirebaseCliToken();
  if (!token) return { ok: false, error: 'Firebase CLI OAuth token unavailable.' };

  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${database}/documents/${collection}/${uid}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (response.status === 404) return { ok: true, missing: true };
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: body?.error?.message || JSON.stringify(body) };
  return { ok: true };
}

function runBrowserWrite(email, password) {
  const output = execFileSync(process.execPath, [
    'scripts/run-playwright-cli-function.mjs',
    '--url',
    process.env.CD10_SMOKE_URL || 'https://clasesde10.com',
    '--session',
    `cd10-teacher-profile-rules-${Date.now()}`,
    'scripts/professor-profile-rules-smoke.playwright.js',
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CD10_TEMP_TEACHER_EMAIL: email,
      CD10_TEMP_TEACHER_PASSWORD: password,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 240000,
  });

  const parsed = JSON.parse(output);
  const result = parsed?.results?.[0]?.result;
  if (!parsed.ok || result?.error) {
    throw new Error(result?.error || output);
  }
  return result;
}

if (!apiKey) fail('Firebase apiKey not found in js/firebase-client.js.');

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const tempEmail = `teacher-profile-rules-${suffix}@example.com`;
const tempPassword = `Tmp-${suffix}-A1!`;
let idToken = null;
let uid = null;
const cleanup = [];

try {
  const signUp = await identity('signUp', {
    email: tempEmail,
    password: tempPassword,
    returnSecureToken: true,
  });
  idToken = signUp.idToken;
  uid = signUp.localId;

  const browserResult = runBrowserWrite(tempEmail, tempPassword);

  cleanup.push(await firestoreDeleteWithCliToken('profesores', uid));
  cleanup.push(await firestoreDeleteWithCliToken('users', uid));

  console.log(JSON.stringify({
    ok: true,
    projectId,
    uid,
    browserResult: {
      wroteUser: browserResult.wroteUser,
      wroteTeacher: browserResult.wroteTeacher,
    },
    writes: ['users', 'profesores'],
    cleanup,
  }, null, 2));
} finally {
  if (uid && cleanup.length === 0) {
    try {
      cleanup.push(await firestoreDeleteWithCliToken('profesores', uid));
      cleanup.push(await firestoreDeleteWithCliToken('users', uid));
    } catch {}
  }
  if (idToken) {
    try {
      await identity('delete', { idToken });
    } catch (error) {
      console.error(`WARNING: could not delete temporary Firebase Auth user ${tempEmail}: ${error.message}`);
    }
  }
}
