#!/usr/bin/env node
/**
 * Attempts to create/link the default Cloud Storage for Firebase bucket.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECT_ID = 'clasesde10-50add';
const LOCATION = 'EUROPE-WEST1';
const API_VERSIONS = ['v1alpha', 'v1beta'];

function readToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const token = config?.tokens?.access_token;
  if (!token) throw new Error('Firebase CLI access token not found.');
  return token;
}

async function main() {
  const token = readToken();
  const failures = [];

  for (const version of API_VERSIONS) {
    const url = `https://firebasestorage.googleapis.com/${version}/projects/${PROJECT_ID}/defaultBucket`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ location: LOCATION }),
    });
    const text = await response.text();
    let body = text;
    try {
      body = JSON.parse(text);
    } catch {}

    console.log(`[${version}] status=${response.status} ok=${response.ok}`);
    console.log(JSON.stringify(body, null, 2));
    if (response.ok) return;
    failures.push({ version, status: response.status, body });
  }

  const hasPermissionDenied = failures.some((failure) => failure.status === 403);
  console.error('Firebase Storage default bucket could not be initialized automatically.');
  if (hasPermissionDenied) {
    console.error('Current Firebase CLI credentials were rejected by the Firebasestorage defaultBucket API with 403 PERMISSION_DENIED.');
  }
  console.error('Next unblock: initialize Storage in Firebase Console or rerun with credentials that can create the default Firebase Storage bucket.');
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
