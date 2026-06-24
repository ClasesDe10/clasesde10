#!/usr/bin/env node
/**
 * Tests the current Firebase CLI principal permissions on the project.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECT_ID = 'clasesde10-50add';
const PERMISSIONS = [
  'firebase.projects.get',
  'firebasestorage.defaultBucket.get',
  'firebasestorage.defaultBucket.create',
  'firebasestorage.buckets.list',
  'firebasestorage.buckets.get',
  'firebaserules.releases.create',
  'firebasehosting.sites.get',
  'serviceusage.services.get',
  'serviceusage.services.enable',
];

function readToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const token = config?.tokens?.access_token;
  if (!token) throw new Error('Firebase CLI access token not found.');
  return token;
}

async function main() {
  const response = await fetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT_ID}:testIamPermissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${readToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ permissions: PERMISSIONS }),
  });
  const body = await response.json();
  console.log(`status=${response.status} ok=${response.ok}`);
  console.log(JSON.stringify(body, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
