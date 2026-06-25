#!/usr/bin/env node
/**
 * Read-only Firebase Auth audit.
 *
 * Uses Firebase CLI because the local OAuth session is accepted by CLI Auth
 * commands even when direct Identity Toolkit admin REST calls reject the token
 * type.
 */

import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECT_ID = 'clasesde10-50add';
const tmpFile = path.join(os.tmpdir(), `clasesde10-auth-${Date.now()}.json`);

function runFirebase(args) {
  if (process.platform === 'win32') {
    return execSync(['npx.cmd', '--yes', 'firebase-tools', ...args].join(' '), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  return execFileSync('npx', ['--yes', 'firebase-tools', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function main() {
  try {
    runFirebase([
      'auth:export',
      tmpFile,
      '--project',
      PROJECT_ID,
      '--format=json',
      '--non-interactive',
    ]);

    const data = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    const users = Array.isArray(data.users) ? data.users : [];
    const admin = users.find((user) => user.email === 'contacto.clasesde10@gmail.com');

    console.log(JSON.stringify({
      authAvailable: true,
      userCount: users.length,
      admin: admin ? {
        uid: admin.localId,
        email: admin.email,
        emailVerified: Boolean(admin.emailVerified),
        createdAt: admin.createdAt || null,
      } : null,
      providers: [...new Set(users.flatMap((user) => (
        user.providerUserInfo?.length
          ? user.providerUserInfo.map((provider) => provider.providerId)
          : ['password']
      )))].sort(),
    }, null, 2));
  } finally {
    if (fs.existsSync(tmpFile)) fs.rmSync(tmpFile, { force: true });
  }
}

main();
