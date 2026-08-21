#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectId = 'clasesde10-50add';
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `qa-public-family-${suffix}@example.com`;
let leadId = '';
let cleanupOk = false;

function firebaseCliToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(configPath)) return '';
  return JSON.parse(fs.readFileSync(configPath, 'utf8'))?.tokens?.access_token || '';
}

async function cleanup() {
  if (!leadId) return;
  const token = firebaseCliToken();
  assert(token, 'Firebase CLI OAuth token unavailable for smoke cleanup.');
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/leadsPublicos/${encodeURIComponent(leadId)}`,
    { method: 'DELETE', headers: { authorization: `Bearer ${token}` } },
  );
  cleanupOk = response.ok || response.status === 404;
  if (!cleanupOk) {
    const body = await response.text();
    throw new Error(`Could not clean temporary public lead (${response.status}): ${body}`);
  }
}

try {
  const output = execFileSync(process.execPath, [
    'scripts/run-playwright-cli-function.mjs',
    '--url',
    'https://clasesde10.com',
    '--session',
    `cd10-public-family-${suffix}`,
    'scripts/public-family-request-production.playwright.js',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, CD10_PUBLIC_FAMILY_SMOKE_EMAIL: email },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 180000,
  });
  const parsed = JSON.parse(output);
  const result = parsed?.results?.[0]?.result;
  assert.equal(parsed.ok, true, output);
  assert.equal(result?.accepted, true, output);
  assert(Number(result.longInputCharacters) > 300, 'The browser smoke did not cover the former overflow.');
  leadId = result.leadId;
} finally {
  await cleanup();
}

console.log(JSON.stringify({
  ok: true,
  productionBrowserLongRequestAccepted: true,
  rawPermissionErrorAbsent: true,
  temporaryLeadCleaned: cleanupOk,
}, null, 2));
