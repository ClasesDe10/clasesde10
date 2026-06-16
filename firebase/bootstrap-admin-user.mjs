#!/usr/bin/env node
/**
 * Bootstrap the first Firebase admin profile in Firestore.
 *
 * Usage:
 *   node firebase/bootstrap-admin-user.mjs <uid> <email> "<nombre>"
 *
 * Requirements:
 * - Run `firebase login` first.
 * - The logged-in Google account must have Firestore IAM permissions.
 * - Firebase Auth user must already exist.
 *
 * This script uses the local Firebase CLI access token in memory only.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECT_ID = 'clasesde10-50add';
const [, , uidArg, emailArg, nombreArg] = process.argv;

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function validateUid(uid) {
  return typeof uid === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(uid);
}

function validateEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function firestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === 'number') return { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, firestoreValue(item)]),
        ),
      },
    };
  }
  return { stringValue: String(value) };
}

function readFirebaseCliToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(configPath)) {
    fail('No Firebase CLI session found. Run `firebase login` first.');
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const token = config?.tokens?.access_token;
  const expiresAt = Number(config?.tokens?.expires_at || 0);

  if (!token) fail('Firebase CLI access token missing. Run `firebase login` again.');
  if (expiresAt && Date.now() >= expiresAt) {
    fail('Firebase CLI access token expired. Run `firebase login` again.');
  }

  return token;
}

async function main() {
  const uid = String(uidArg || '').trim();
  const email = String(emailArg || '').trim().toLowerCase();
  const nombre = String(nombreArg || '').trim() || 'Administrador';

  if (!validateUid(uid)) fail('Invalid UID. Copy the UID from Firebase Auth users.');
  if (!validateEmail(email)) fail('Invalid email.');

  const now = new Date().toISOString();
  const payload = {
    email,
    nombre,
    apellidos: null,
    telefono: null,
    role: 'admin',
    active: true,
    createdAt: now,
    updatedAt: now,
    bootstrap: {
      source: 'firebase/bootstrap-admin-user.mjs',
      createdAt: now,
    },
  };

  const body = {
    fields: Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [key, firestoreValue(value)]),
    ),
  };

  const token = readFirebaseCliToken();
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    fail(`Firestore write failed (${response.status}): ${text.slice(0, 500)}`);
  }

  console.log(`Admin profile created: users/${uid}`);
}

main().catch((error) => fail(error?.message || String(error)));
