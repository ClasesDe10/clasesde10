#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const failures = [];
const warnings = [];

function readText(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function readJson(file) {
  return JSON.parse(readText(file));
}

function exists(file) {
  return fs.existsSync(path.join(ROOT, file));
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

const firebaseConfig = readJson('firebase.json');
const packageJson = readJson('package.json');
const functionsPackage = readJson('functions/package.json');
const workflow = readText('.github/workflows/firebase-automation.yml');
const qualityWorkflow = exists('.github/workflows/quality.yml') ? readText('.github/workflows/quality.yml') : '';
const worker = readText('scripts/firebase-automation-worker.mjs');

assert(!Object.prototype.hasOwnProperty.call(firebaseConfig, 'functions'), 'firebase.json must not define a Cloud Functions deploy target.');
assert(firebaseConfig.firestore?.rules === 'firebase/firestore.rules', 'Firestore rules must remain deployed from the free Firebase project.');
assert(firebaseConfig.storage?.rules === 'firebase/storage.rules', 'Storage rules must remain deployed from the free Firebase project.');
assert(firebaseConfig.hosting?.public === '.', 'Firebase Hosting must remain a static hosting target.');
assert(firebaseConfig.hosting?.ignore?.includes('functions/**'), 'Hosting must ignore local automation-engine sources.');
assert(firebaseConfig.hosting?.ignore?.includes('scripts/**'), 'Hosting must ignore operational scripts.');

assert(!exists('functions/index.js'), 'functions/index.js must not exist; Cloud Functions entrypoints are not part of the free architecture.');
assert(!exists('functions/package-lock.json'), 'functions/package-lock.json must not exist; it reintroduced obsolete Cloud Functions dependencies.');
assert(functionsPackage.type === 'commonjs', 'functions/package.json must keep shared engines CommonJS-compatible.');
assert(functionsPackage.main === 'platform-automation-engine.js', 'functions/package.json main must point at the shared automation engine.');
for (const forbiddenDependency of ['firebase-functions', 'stripe']) {
  assert(!functionsPackage.dependencies?.[forbiddenDependency], `functions/package.json must not depend on ${forbiddenDependency}.`);
}

const scripts = packageJson.scripts || {};
assert(scripts['automation:matching'] === 'node scripts/firebase-automation-worker.mjs', 'automation:matching must run the GitHub-compatible worker.');
assert(scripts['audit:free-infrastructure'] === 'node scripts/free-infrastructure-audit.mjs', 'package.json must expose the free infrastructure audit.');
assert(scripts['check:quality']?.includes('audit:free-infrastructure'), 'check:quality must include the free infrastructure audit.');
assert(!scripts['check:functions'], 'package.json must not keep a Cloud Functions check script.');
for (const [name, command] of Object.entries(scripts)) {
  assert(!/firebase\s+deploy\s+--only\s+functions|--only\s+functions\b/i.test(command), `Script ${name} must not deploy Cloud Functions.`);
}

assert(/name:\s*Firebase automation worker without Blaze/.test(workflow), 'GitHub Actions workflow must document that it runs without Blaze.');
assert(/schedule:/.test(workflow), 'GitHub Actions workflow must include a scheduled trigger.');
assert(/workflow_dispatch:/.test(workflow), 'GitHub Actions workflow must allow manual recovery runs.');
assert(/npm run automation:matching/.test(workflow), 'GitHub Actions workflow must run automation:matching.');
assert(/FIREBASE_SERVICE_ACCOUNT_JSON/.test(workflow), 'GitHub Actions workflow must use a Firebase service account secret.');
assert(/timeout-minutes:\s*10/.test(workflow), 'GitHub Actions workflow must bound automation runtime.');
assert(!/firebase\s+deploy|gcloud\s+functions|cloudbuild\.googleapis\.com|artifactregistry\.googleapis\.com/i.test(workflow), 'GitHub Actions workflow must not enable Blaze-only deploy/build services.');
assert(!/working-directory:\s*functions|functions\/package-lock\.json|node --check index\.js|check:functions/i.test(qualityWorkflow), 'Quality workflow must validate shared automation engines, not obsolete Cloud Functions entrypoints.');
assert(/audit:free-infrastructure/.test(qualityWorkflow), 'Quality workflow must run the zero-cost infrastructure audit.');
assert(/check:automation/.test(qualityWorkflow), 'Quality workflow must syntax-check the shared automation worker path.');

for (const requiredWorkerNeedle of [
  'processQueuedSystemJobs',
  'processEntityAutomationBackfill',
  'processChatAutomationBackfill',
  'processPendingPushNotifications',
  'sendEachForMulticast',
  'loadWorkerPlatformConfig',
  'platformHealthChecks',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
]) {
  assert(worker.includes(requiredWorkerNeedle), `Automation worker missing free-runtime capability: ${requiredWorkerNeedle}.`);
}

const activeFiles = [
  'firebase.json',
  'package.json',
  'functions/package.json',
  '.github/workflows/firebase-automation.yml',
  'scripts/firebase-automation-worker.mjs',
];
for (const file of activeFiles) {
  const source = readText(file);
  if (/firebase-functions|onSchedule|onRequest|defineSecret|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/.test(source)) {
    fail(`${file} contains obsolete Cloud Functions/Stripe server integration markers.`);
  }
}

if (packageJson.dependencies?.['firebase-admin']) {
  warn('firebase-admin remains intentionally: it is used by the free GitHub Actions worker, not by Firebase Cloud Functions.');
}

for (const message of warnings) console.warn(`[WARN] ${message}`);

if (failures.length) {
  console.error('Free infrastructure audit failed:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  architecture: 'firebase_spark_static_plus_github_actions_worker',
  blazeDeployTargets: 0,
  cloudFunctionsEntrypoints: 0,
  cost: '0 EUR within free quotas',
}, null, 2));
