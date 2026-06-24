#!/usr/bin/env node
/**
 * Attempts to create/link the default Cloud Storage for Firebase bucket.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECT_ID = 'clasesde10-50add';
const LOCATION = 'EUROPE-WEST1';
const URL = `https://firebasestorage.googleapis.com/v1alpha/projects/${PROJECT_ID}/defaultBucket`;

function readToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const token = config?.tokens?.access_token;
  if (!token) throw new Error('Firebase CLI access token not found.');
  return token;
}

async function main() {
  const response = await fetch(URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${readToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ location: LOCATION }),
  });
  const text = await response.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {}

  console.log(`status=${response.status} ok=${response.ok}`);
  console.log(JSON.stringify(body, null, 2));
  if (!response.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

