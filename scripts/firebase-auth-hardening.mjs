#!/usr/bin/env node
/**
 * Harden Firebase Auth provider configuration for ClasesDe10.
 *
 * Keeps Email/Password and passwordless email links enabled, and disables Phone
 * Auth, which is not used by the product flows. Google Sign-In is handled by
 * Firebase's Google provider configuration and verified through the runtime.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECT_ID = 'clasesde10-50add';
const CONFIG_URL = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config`;
const REQUIRED_AUTH_DOMAINS = new Set([
  'localhost',
  'clasesde10-50add.firebaseapp.com',
  'clasesde10-50add.web.app',
  'clasesde10.com',
  'www.clasesde10.com',
]);

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

async function main() {
  const before = await api(CONFIG_URL);
  if (!before.ok) {
    console.error(JSON.stringify(before.body, null, 2));
    process.exit(1);
  }

  const authorizedDomainsPatch = [...REQUIRED_AUTH_DOMAINS].sort();
  const update = await api(`${CONFIG_URL}?updateMask=signIn.email,signIn.phoneNumber,authorizedDomains`, {
    method: 'PATCH',
    body: JSON.stringify({
      signIn: {
        email: {
          enabled: true,
          passwordRequired: false,
        },
        phoneNumber: {
          enabled: false,
        },
      },
      authorizedDomains: authorizedDomainsPatch,
    }),
  });
  if (!update.ok) {
    console.error(JSON.stringify(update.body, null, 2));
    process.exit(1);
  }

  const after = await api(CONFIG_URL);
  const signIn = after.body?.signIn || {};
  const authorizedDomains = new Set(after.body?.authorizedDomains || []);
  const missingDomains = [...REQUIRED_AUTH_DOMAINS].filter((domain) => !authorizedDomains.has(domain));

  if (!signIn.email?.enabled || signIn.email?.passwordRequired === true) {
    console.error('Email/Password and email-link sign-in are not enabled after hardening.');
    process.exit(1);
  }
  if (signIn.phoneNumber?.enabled === true) {
    console.error('Phone Auth is still enabled after hardening.');
    process.exit(1);
  }
  if (missingDomains.length) {
    console.error(`Missing authorized Auth domains: ${missingDomains.join(', ')}`);
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    emailPassword: 'enabled',
    emailLink: 'enabled',
    phoneAuth: 'disabled',
    removedExtraAuthorizedDomains: [...authorizedDomains].filter((domain) => !REQUIRED_AUTH_DOMAINS.has(domain)),
    authorizedDomains: [...authorizedDomains].sort(),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
