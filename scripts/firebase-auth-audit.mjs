#!/usr/bin/env node
/**
 * Read-only Firebase Auth audit using the local Firebase CLI OAuth session.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECT_ID = 'clasesde10-50add';
const PROJECT_NUMBER = '895894357385';

function readToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const token = config?.tokens?.access_token;
  if (!token) throw new Error('Firebase CLI access token not found.');
  return token;
}

async function requestJson(url, options = {}) {
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
}

function printResult(label, result) {
  console.log(`\n${label}`);
  console.log(`status=${result.status} ok=${result.ok}`);
  if (!result.ok) {
    console.log(JSON.stringify(result.body, null, 2).slice(0, 2000));
    return;
  }
  console.log(JSON.stringify(result.body, null, 2).slice(0, 4000));
}

async function main() {
  printResult(
    'Identity Toolkit config v2',
    await requestJson(`https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config`),
  );

  printResult(
    'Identity Toolkit config v1',
    await requestJson(`https://identitytoolkit.googleapis.com/admin/v1/projects/${PROJECT_ID}/config`),
  );

  printResult(
    'Firebase Auth downloadAccount probe',
    await requestJson('https://identitytoolkit.googleapis.com/v3/relyingparty/downloadAccount', {
      method: 'POST',
      body: JSON.stringify({ targetProjectId: PROJECT_ID, maxResults: 1 }),
    }),
  );

  printResult(
    'Cloud Resource Manager project',
    await requestJson(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT_ID}`),
  );

  printResult(
    'Service Usage identitytoolkit',
    await requestJson(`https://serviceusage.googleapis.com/v1/projects/${PROJECT_NUMBER}/services/identitytoolkit.googleapis.com`),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

