#!/usr/bin/env node
/**
 * Initialize Firebase Auth / Identity Platform and enable Email/Password.
 *
 * This uses the local Firebase CLI OAuth session. It is intentionally small and
 * idempotent: if config already exists, it only patches the email provider.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECT_ID = 'clasesde10-50add';
const CONFIG_URL = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config`;
const INIT_URL = `https://identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/identityPlatform:initializeAuth`;

function readToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const token = config?.tokens?.access_token;
  if (!token) throw new Error('Firebase CLI access token not found.');
  return token;
}

async function api(url, options = {}) {
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

function logStep(name, result) {
  console.log(`\n${name}: status=${result.status} ok=${result.ok}`);
  if (!result.ok) console.log(JSON.stringify(result.body, null, 2).slice(0, 2000));
}

async function getConfig() {
  return api(CONFIG_URL);
}

async function initializeAuth() {
  return api(INIT_URL, { method: 'POST', body: JSON.stringify({}) });
}

async function enableEmailPassword() {
  return api(`${CONFIG_URL}?updateMask=signIn.email`, {
    method: 'PATCH',
    body: JSON.stringify({
      signIn: {
        email: {
          enabled: true,
          passwordRequired: true,
        },
      },
    }),
  });
}

async function main() {
  let config = await getConfig();
  logStep('Initial config read', config);

  if (!config.ok && config.body?.error?.message === 'CONFIGURATION_NOT_FOUND') {
    const init = await initializeAuth();
    logStep('Initialize Auth', init);
    config = await getConfig();
    logStep('Config read after initialize', config);
  }

  const enable = await enableEmailPassword();
  logStep('Enable Email/Password', enable);

  const finalConfig = await getConfig();
  logStep('Final config read', finalConfig);

  if (!finalConfig.ok) process.exit(1);
  const email = finalConfig.body?.signIn?.email;
  if (!email?.enabled || !email?.passwordRequired) {
    console.error('Email/Password is not enabled in final config.');
    process.exit(1);
  }

  console.log('\nEmail/Password enabled.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
