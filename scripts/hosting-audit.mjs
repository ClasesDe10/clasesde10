#!/usr/bin/env node
/**
 * Firebase Hosting / PWA audit for the currently deployed Firebase URL.
 */

import fs from 'node:fs';

const BASE = 'https://clasesde10-50add.web.app';
const CHECKS = [
  { path: '/', expect: 200 },
  { path: '/manifest.json', expect: 200, header: ['cache-control', /max-age=3600/] },
  { path: '/service-worker.js', expect: 200, header: ['service-worker-allowed', /\//] },
  { path: '/offline.html', expect: 200, header: ['x-robots-tag', /noindex/] },
  { path: '/robots.txt', expect: 200 },
  { path: '/sitemap.xml', expect: 200 },
  { path: '/pages/login.html', expect: 200, header: ['cache-control', /no-cache/] },
  { path: '/pages/dashboard/admin.html', expect: 200, header: ['cache-control', /no-store/] },
  { path: '/dashboard', expect: 302, location: /\/pages\/login\.html/, manual: true },
  { path: '/entrar', expect: 301, location: /\/pages\/login\.html/, manual: true },
  { path: '/registro', expect: 301, location: /\/pages\/registro\.html/, manual: true },
  { path: '/supabase/migrations/001_schema_completo.sql', expect: 404 },
  { path: '/firebase.json', expect: 404 },
  { path: '/package.json', expect: 404 },
  { path: '/scripts/check-centralization.mjs', expect: 404 },
];
const REQUIRED_SECURITY_HEADERS = [
  ['x-frame-options', /^DENY$/i],
  ['x-content-type-options', /^nosniff$/i],
  ['referrer-policy', /strict-origin-when-cross-origin/i],
  ['permissions-policy', /camera=\(\), microphone=\(\), geolocation=\(\)/i],
  ['content-security-policy', /frame-ancestors 'none'/i],
  ['content-security-policy', /object-src 'none'/i],
];

function assertConfig() {
  const config = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
  const hosting = config.hosting;
  const failures = [];

  if (hosting.public !== '.') failures.push('hosting.public must be "."');
  if (!hosting.ignore?.includes('scripts/**')) failures.push('scripts/** must be ignored');
  if (!hosting.ignore?.includes('package.json')) failures.push('package.json must be ignored');
  if (!hosting.headers?.some((item) => item.source === '/pages/dashboard/**')) {
    failures.push('dashboard no-store/noindex header missing');
  }
  if (!hosting.redirects?.some((item) => item.source === '/dashboard' && item.destination === '/pages/login.html')) {
    failures.push('/dashboard redirect missing');
  }

  const sw = fs.readFileSync('service-worker.js', 'utf8');
  for (const pattern of [
    '^\\/pages\\/dashboard\\/',
    '^\\/offline',
    '^\\/supabase\\/',
    '^\\/firebase\\/',
    '^\\/firebase\\.json$',
  ]) {
    if (!sw.includes(pattern)) failures.push(`service-worker private pattern missing: ${pattern}`);
  }
  for (const appShellPath of [
    '/pages/login.html',
    '/pages/registro.html',
    '/pages/reset-password.html',
  ]) {
    if (!sw.includes(`'${appShellPath}'`)) failures.push(`auth app shell not precached: ${appShellPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  if (!manifest.start_url) failures.push('manifest.start_url missing');
  if (!manifest.icons?.length) failures.push('manifest.icons missing');

  return failures;
}

async function head(path, manual = false) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${BASE}${path}`, { method: 'HEAD', redirect: manual ? 'manual' : 'follow' });
      return {
        status: response.status,
        location: response.headers.get('location') || '',
        headers: response.headers,
      };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError;
}

async function main() {
  const configFailures = assertConfig();
  if (configFailures.length) {
    console.log('Local config failures:');
    for (const failure of configFailures) console.log(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('Local config: OK');
  }

  for (const check of CHECKS) {
    const result = await head(check.path, check.manual);
    const errors = [];
    if (result.status !== check.expect) errors.push(`expected ${check.expect}, got ${result.status}`);
    if (check.location && !check.location.test(result.location)) {
      errors.push(`location mismatch: ${result.location}`);
    }
    if (check.header) {
      const [name, pattern] = check.header;
      const value = result.headers.get(name) || '';
      if (!pattern.test(value)) errors.push(`${name} mismatch: ${value}`);
    }
    if (check.expect === 200) {
      for (const [name, pattern] of REQUIRED_SECURITY_HEADERS) {
        const value = result.headers.get(name) || '';
        if (!pattern.test(value)) errors.push(`${name} security mismatch: ${value}`);
      }
    }

    if (errors.length) {
      console.log(`[FAIL] ${check.path}: ${errors.join('; ')}`);
      process.exitCode = 1;
    } else {
      console.log(`[OK] ${check.path}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
