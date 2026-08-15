#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [auth, firebaseAuth, login, admin, professor, family, css, serviceWorker] = await Promise.all([
  readFile(new URL('../js/auth.js', import.meta.url), 'utf8'),
  readFile(new URL('../js/firebase-auth.js', import.meta.url), 'utf8'),
  readFile(new URL('../pages/login.html', import.meta.url), 'utf8'),
  readFile(new URL('../pages/dashboard/admin.html', import.meta.url), 'utf8'),
  readFile(new URL('../pages/dashboard/profesor.html', import.meta.url), 'utf8'),
  readFile(new URL('../pages/dashboard/familia.html', import.meta.url), 'utf8'),
  readFile(new URL('../css/dashboard.css', import.meta.url), 'utf8'),
  readFile(new URL('../service-worker.js', import.meta.url), 'utf8'),
]);

for (const [role, dashboard] of [['admin', admin], ['profesor', professor], ['familia', family]]) {
  assert.match(dashboard, /<button class="sidebar-logout" id="btn-logout">[\s\S]*?Cerrar sesión[\s\S]*?<\/button>/, `${role}: the logout button must remain visible and semantic.`);
  assert.match(dashboard, /auth-provider\.js\?v=20260815-logout-r1/, `${role}: the dashboard must load the hardened auth revision.`);
  assert.match(dashboard, /getElementById\('btn-logout'\)\.addEventListener\('click', async \(event\) => \{[\s\S]*?await logout\(event\);/, `${role}: the button must await the shared logout flow.`);
  assert.match(dashboard, /No se pudo cerrar la sesión/, `${role}: a failed sign-out must provide visible feedback.`);
}

assert.match(auth, /void trackAuthEvent\('auth\.logout'/, 'Analytics must not block sign-out.');
assert.doesNotMatch(auth, /await trackAuthEvent\('auth\.logout'/, 'Logout must never await analytics.');
assert.match(firebaseAuth, /const LOGOUT_AUDIT_TIMEOUT_MS = 600;/, 'Audit must have a bounded wait during logout.');
assert.match(firebaseAuth, /await Promise\.race\(\[[\s\S]*?recordAuthAudit\('auth\.logout'[\s\S]*?window\.setTimeout\(resolve, LOGOUT_AUDIT_TIMEOUT_MS\)/, 'Audit must remain best effort without blocking Firebase Auth.');
const logoutImplementation = firebaseAuth.slice(firebaseAuth.indexOf('export async function logout(options = {})'));
assert.ok(logoutImplementation.indexOf('await Promise.race([') < logoutImplementation.indexOf('await signOut(firebaseAuth);'), 'Firebase sign-out must run immediately after the bounded audit attempt.');
assert.match(firebaseAuth, /trigger\.disabled = true;[\s\S]*?trigger\.setAttribute\('aria-busy', 'true'\);/, 'The clicked button must expose a pending state and reject duplicate clicks.');
assert.match(firebaseAuth, /window\.location\.replace\(logoutOptions\.redirectTo \|\| '\/pages\/login\.html\?logout=1'\);/, 'Successful logout must replace history with the login page.');

assert.match(login, /const logoutCompleted = loginParams\.get\('logout'\) === '1';/, 'Login must recognize a completed logout.');
assert.match(login, /showSuccess\('Has cerrado sesión correctamente\.'\);/, 'Login must confirm the completed logout.');
assert.match(css, /\.sidebar-logout:disabled,[\s\S]*?cursor: wait;[\s\S]*?opacity: \.7;/, 'The pending logout state must be visually clear.');
const pwaCacheRevision = Number(serviceWorker.match(/clasesde10-pwa-v(\d+)/)?.[1] || 0);
assert.ok(pwaCacheRevision >= 87, 'The hardened logout must keep its PWA cache revision or a newer one.');

console.log('Logout system: OK (admin, professor and family).');
