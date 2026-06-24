#!/usr/bin/env node
/**
 * Read-only Firebase Storage / Cloud Storage audit using Firebase CLI OAuth.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECT_ID = 'clasesde10-50add';
const PROJECT_NUMBER = '895894357385';
const EXPECTED_BUCKETS = [
  'clasesde10-50add.firebasestorage.app',
  'clasesde10-50add.appspot.com',
];

function readToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const token = config?.tokens?.access_token;
  if (!token) throw new Error('Firebase CLI access token not found.');
  return token;
}

async function api(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${readToken()}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: { error: error.message } };
  }
}

function print(label, result) {
  console.log(`\n${label}: status=${result.status} ok=${result.ok}`);
  console.log(JSON.stringify(result.body, null, 2).slice(0, 3000));
}

async function main() {
  print(
    'Service Usage firebasestorage',
    await api(`https://serviceusage.googleapis.com/v1/projects/${PROJECT_NUMBER}/services/firebasestorage.googleapis.com`),
  );
  print(
    'Service Usage storage',
    await api(`https://serviceusage.googleapis.com/v1/projects/${PROJECT_NUMBER}/services/storage.googleapis.com`),
  );
  print(
    'Cloud Storage buckets',
    await api(`https://storage.googleapis.com/storage/v1/b?project=${PROJECT_ID}`),
  );

  for (const bucket of EXPECTED_BUCKETS) {
    print(
      `Bucket ${bucket}`,
      await api(`https://storage.googleapis.com/storage/v1/b/${bucket}`),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
