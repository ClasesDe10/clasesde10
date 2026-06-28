#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

function readText(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(ROOT, file));
}

function walk(dir, matcher, acc = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (['.git', '.firebase', '.netlify', 'node_modules', 'output'].includes(entry.name)) continue;
    const relative = path.join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) walk(relative, matcher, acc);
    else if (matcher(relative)) acc.push(relative);
  }
  return acc;
}

function assertContains(text, needle, message) {
  if (!text.includes(needle)) fail(message);
}

function auditHosting() {
  const firebase = readJson('firebase.json');
  const hosting = firebase.hosting || {};
  if (hosting.public !== '.') fail('Firebase Hosting must publish the web root.');
  for (const ignored of ['**/*.md', 'scripts/**', 'functions/**', 'firebase/**', 'supabase/**', 'package.json']) {
    if (!hosting.ignore?.includes(ignored)) fail(`Firebase Hosting must ignore ${ignored}.`);
  }
  if (!hosting.headers?.some((item) => item.source === '/pages/dashboard/**')) {
    fail('Dashboards must have no-store/noindex headers.');
  }
  const csp = hosting.headers?.flatMap((item) => item.headers || [])
    .find((item) => item.key === 'Content-Security-Policy')?.value || '';
  for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'"]) {
    if (!csp.includes(directive)) fail(`CSP missing directive: ${directive}`);
  }
  if (exists('netlify.toml')) fail('netlify.toml must not exist: Firebase Hosting is the only production target.');
}

function auditPwaSeo() {
  const sw = readText('service-worker.js');
  assertContains(sw, "CACHE_VERSION = 'clasesde10-pwa-v", 'Service worker cache version missing.');
  for (const pattern of ['^\\/pages\\/dashboard\\/', '^\\/supabase\\/', '^\\/firebase\\.json$']) {
    assertContains(sw, pattern, `Service worker private deny pattern missing: ${pattern}`);
  }
  const manifest = readJson('manifest.json');
  if (manifest.display !== 'standalone') fail('PWA manifest must use standalone display.');
  if (!manifest.icons?.some((icon) => icon.sizes === '192x192')) fail('PWA manifest missing 192x192 icon.');
  if (!manifest.icons?.some((icon) => icon.sizes === '512x512')) fail('PWA manifest missing 512x512 icon.');
  const sitemap = readText('sitemap.xml');
  const urls = [...sitemap.matchAll(/<loc>/g)].length;
  if (urls < 150) fail(`SEO sitemap unexpectedly small: ${urls} URLs.`);
  if (!exists('robots.txt')) fail('robots.txt missing.');
}

function auditRuntimeLegacyAndSecrets() {
  const runtimeFiles = walk('.', (file) => (
    /^(js|pages|css|assets)\//.test(file) || /^[^/]+\.(html|js|css|json|txt|xml)$/.test(file)
  ) && /\.(html|js|css|json|txt|xml)$/.test(file));

  const realSupabase = [];
  const suspiciousSecrets = [];
  const tokenPatterns = [
    /\bsk_(live|test)_[A-Za-z0-9]{16,}/,
    /\bgh[pousr]_[A-Za-z0-9_]{30,}/,
    /\bxox[baprs]-[A-Za-z0-9-]{20,}/,
    /\bSUPABASE_SERVICE_ROLE_KEY\b/,
    /\bFIREBASE_PRIVATE_KEY\b/,
    /\bGOOGLE_APPLICATION_CREDENTIALS\b/,
  ];

  for (const file of runtimeFiles) {
    const text = readText(file);
    if (
      /@supabase\/supabase-js|window\.supabase|createClient\(/.test(text)
      && file !== 'js/supabase-client.js'
    ) {
      realSupabase.push(file);
    }
    if (tokenPatterns.some((pattern) => pattern.test(text))) suspiciousSecrets.push(file);
  }

  if (realSupabase.length) fail(`Real Supabase runtime dependency found: ${realSupabase.join(', ')}`);
  if (suspiciousSecrets.length) fail(`Potential runtime secret exposure found: ${suspiciousSecrets.join(', ')}`);
}

function auditProductSurface() {
  const packageJson = readJson('package.json');
  const requiredScripts = [
    'check:quality',
    'audit:centralization',
    'audit:production-readiness',
    'audit:mobile:admin',
    'audit:mobile:public',
    'audit:pwa:mobile',
    'audit:seo:public',
    'audit:admin:control',
    'audit:admin:ai',
    'audit:admin:documents',
    'test:automation-engine',
    'test:document-center',
  ];
  for (const script of requiredScripts) {
    if (!packageJson.scripts?.[script]) fail(`Missing package script: ${script}`);
  }

  const admin = readText('pages/dashboard/admin.html');
  for (const marker of [
    'admin-control-center',
    'admin-ai-assistant',
    'admin-document-center',
    'section-finanzas',
    'section-incidencias',
    'section-auditoria',
    'section-experimentos',
  ]) {
    if (!admin.includes(marker)) fail(`Admin surface missing marker: ${marker}`);
  }

  const indexes = readText('firebase/firestore.indexes.json');
  for (const field of ['expiresAt', 'documentType', 'ownerUid', 'status']) {
    if (!indexes.includes(`"fieldPath": "${field}"`)) fail(`Firestore indexes missing document field: ${field}`);
  }
}

function auditKnownExternalBlocks() {
  const config = readText('firebase.json');
  if (!config.includes('"functions"')) warn('Cloud Functions config missing.');
  const functionsPackage = exists('functions/package.json');
  if (!functionsPackage) warn('Functions package missing; backend deploy may be incomplete.');
}

auditHosting();
auditPwaSeo();
auditRuntimeLegacyAndSecrets();
auditProductSurface();
auditKnownExternalBlocks();

if (warnings.length) {
  console.log('Warnings:');
  for (const item of warnings) console.log(`- ${item}`);
}

if (failures.length) {
  console.error('Excellence audit failed:');
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  checked: 'excellence_audit',
  warnings: warnings.length,
}, null, 2));
