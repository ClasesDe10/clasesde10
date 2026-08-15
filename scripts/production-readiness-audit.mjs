#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readText(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function readJson(file) {
  return JSON.parse(readText(file));
}

function headerBlock(config, source) {
  return config.hosting.headers.find((item) => item.source === source)?.headers || [];
}

function headerValue(config, source, key) {
  return headerBlock(config, source).find((item) => item.key.toLowerCase() === key.toLowerCase())?.value || '';
}

function hasCompositeIndex(indexes, collectionGroup, fields) {
  return indexes.indexes.some((index) => (
    index.collectionGroup === collectionGroup
    && fields.every((field, position) => {
      const current = index.fields[position];
      return current?.fieldPath === field.fieldPath && current?.order === field.order;
    })
  ));
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', '.firebase', '.netlify', 'node_modules', 'output'].includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (['.html', '.js', '.mjs'].includes(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function checkHosting() {
  const config = readJson('firebase.json');
  const hosting = config.hosting || {};
  if (hosting.public !== '.') fail('Firebase Hosting public directory must stay at project root ".".');

  for (const ignored of ['**/*.md', 'scripts/**', 'functions/**', 'supabase/**', 'firebase/**', 'package.json', '.firebaserc']) {
    if (!hosting.ignore?.includes(ignored)) fail(`Firebase Hosting must ignore ${ignored}.`);
  }

  const globalHeaders = Object.fromEntries(headerBlock(config, '**').map((item) => [item.key.toLowerCase(), item.value]));
  for (const key of ['x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'content-security-policy']) {
    if (!globalHeaders[key]) fail(`Global hosting security header missing: ${key}.`);
  }
  if (!/frame-ancestors 'none'/.test(globalHeaders['content-security-policy'] || '')) {
    fail('Content-Security-Policy must block framing with frame-ancestors none.');
  }
  if (!/object-src 'none'/.test(globalHeaders['content-security-policy'] || '')) {
    fail('Content-Security-Policy must block object/embed content.');
  }

  for (const source of ['/pages/dashboard/**', '/js/auth-provider.js', '/js/firebase-auth.js', '/js/firebase-client.js', '/js/firebase-data-client.js']) {
    if (!/no-store|no-cache/.test(headerValue(config, source, 'Cache-Control'))) {
      fail(`${source} must not be cached aggressively.`);
    }
  }
  if (!/Service-Worker-Allowed/i.test(JSON.stringify(headerBlock(config, '/service-worker.js')))) {
    fail('service-worker.js must define Service-Worker-Allowed.');
  }
}

function checkPwa() {
  const sw = readText('service-worker.js');
  for (const needle of [
    '^\\/pages\\/dashboard\\/',
    '^\\/supabase\\/',
    '^\\/firebase\\/',
    '^\\/firebase\\.json$',
    'networkOnlyPrivatePage',
    'networkFirstAuthShell',
  ]) {
    if (!sw.includes(needle)) fail(`Service worker production guard missing: ${needle}.`);
  }
  for (const cachedAuthShell of ['/pages/login.html', '/pages/registro.html', '/pages/reset-password.html']) {
    if (!sw.includes(`'${cachedAuthShell}'`)) fail(`Auth shell must be precached for PWA resilience: ${cachedAuthShell}.`);
  }

  const manifest = readJson('manifest.json');
  if (manifest.display !== 'standalone') fail('PWA manifest display must be standalone.');
  if (manifest.scope !== '/') fail('PWA manifest scope must be root.');
  if (!manifest.icons?.some((icon) => icon.sizes === '512x512')) fail('PWA manifest must include a 512 icon.');
}

function checkRules() {
  const firestoreRules = readText('firebase/firestore.rules');
  for (const needle of [
    'allow read, write: if false;',
    'function isAdmin()',
    'validPublicLead()',
    'validNotificationTokenWrite()',
    'validFamilyPaymentCreate()',
    'validTeacherPayoutCreate()',
    'match /classLifecycleEvents/{eventId}',
    'match /platformConfigHistory/{historyId}',
    'match /automationRules/{ruleId}',
    'match /automationRuleRuns/{runId}',
    'match /systemJobs/{jobId}',
    'match /metricSnapshots/{snapshotId}',
    'match /opsAlerts/{alertId}',
    'match /platformHealthChecks/{checkId}',
  ]) {
    if (!firestoreRules.includes(needle)) fail(`Firestore rules guard missing: ${needle}.`);
  }

  const storageRules = readText('firebase/storage.rules');
  for (const needle of [
    'allow read, write: if false;',
    'validFileSize(10)',
    'validFileSize(50)',
    'validPrivateContentType()',
    'validPublicContentType()',
    'request.resource.contentType is string',
  ]) {
    if (!storageRules.includes(needle)) fail(`Storage rules guard missing: ${needle}.`);
  }
}

function checkIndexes() {
  const indexes = readJson('firebase/firestore.indexes.json');
  const required = [
    ['leadsPublicos', [
      { fieldPath: 'tipo', order: 'ASCENDING' },
      { fieldPath: 'estado', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ]],
    ['notificaciones', [
      { fieldPath: 'userUid', order: 'ASCENDING' },
      { fieldPath: 'readAt', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ]],
    ['solicitudes', [
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ]],
    ['solicitudMatches', [
      { fieldPath: 'requestId', order: 'ASCENDING' },
      { fieldPath: 'rank', order: 'ASCENDING' },
    ]],
    ['pagos', [
      { fieldPath: 'familyUid', order: 'ASCENDING' },
      { fieldPath: 'estado', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ]],
    ['incidencias', [
      { fieldPath: 'estado', order: 'ASCENDING' },
      { fieldPath: 'priority', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ]],
    ['incidencias', [
      { fieldPath: 'estado', order: 'ASCENDING' },
      { fieldPath: 'priorityRank', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ]],
    ['incidencias', [
      { fieldPath: 'categoria', order: 'ASCENDING' },
      { fieldPath: 'estado', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ]],
    ['incidencias', [
      { fieldPath: 'assignedAdminEmail', order: 'ASCENDING' },
      { fieldPath: 'estado', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ]],
    ['clases', [
      { fieldPath: 'lifecycleStatus', order: 'ASCENDING' },
      { fieldPath: 'fecha', order: 'ASCENDING' },
    ]],
    ['classLifecycleEvents', [
      { fieldPath: 'classId', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ]],
    ['systemJobs', [
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'runAt', order: 'ASCENDING' },
      { fieldPath: 'priority', order: 'DESCENDING' },
    ]],
    ['automationRules', [
      { fieldPath: 'active', order: 'ASCENDING' },
      { fieldPath: 'priority', order: 'ASCENDING' },
    ]],
    ['automationRuleRuns', [
      { fieldPath: 'ruleId', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ]],
    ['platformConfigHistory', [
      { fieldPath: 'configId', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ]],
    ['metricSnapshots', [
      { fieldPath: 'scope', order: 'ASCENDING' },
      { fieldPath: 'period', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ]],
    ['opsAlerts', [
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'level', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ]],
    ['platformHealthChecks', [
      { fieldPath: 'scope', order: 'ASCENDING' },
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ]],
    ['clases', [
      { fieldPath: 'month', order: 'ASCENDING' },
      { fieldPath: 'teacherUid', order: 'ASCENDING' },
      { fieldPath: 'startAtIso', order: 'ASCENDING' },
    ]],
    ['clases', [
      { fieldPath: 'teacherUid', order: 'ASCENDING' },
      { fieldPath: 'fecha', order: 'DESCENDING' },
    ]],
    ['pagos', [
      { fieldPath: 'month', order: 'ASCENDING' },
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'dueAt', order: 'ASCENDING' },
    ]],
    ['notificaciones', [
      { fieldPath: 'userUid', order: 'ASCENDING' },
      { fieldPath: 'month', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ]],
    ['analyticsEvents', [
      { fieldPath: 'day', order: 'ASCENDING' },
      { fieldPath: 'scaleShard', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ]],
    ['systemJobs', [
      { fieldPath: 'day', order: 'ASCENDING' },
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'runAt', order: 'ASCENDING' },
      { fieldPath: 'priority', order: 'DESCENDING' },
    ]],
  ];

  for (const [collectionGroup, fields] of required) {
    if (!hasCompositeIndex(indexes, collectionGroup, fields)) {
      fail(`Missing Firestore composite index for ${collectionGroup}: ${fields.map((field) => field.fieldPath).join(', ')}.`);
    }
  }
}

function checkFutureScaleGuards() {
  const scaleEngine = readText('js/scale-engine.js');
  for (const needle of [
    'SCALE_COLLECTION_POLICIES',
    'buildQueryBudget',
    'scalePartitionKeys',
    'buildRetentionPlan',
    'buildAdminScaleChecklist',
  ]) {
    if (!scaleEngine.includes(needle)) fail(`Future scale engine guard missing: ${needle}.`);
  }

  const dataSchema = readText('js/data-schema.js');
  for (const needle of ['scalePartitionKeys', 'partitionKey', 'scaleShard']) {
    if (!dataSchema.includes(needle)) fail(`Data schema must derive scale field: ${needle}.`);
  }

  const adminControl = readText('js/admin-control-center.js');
  if (/onSnapshot\(collection\(firebaseDb,\s*name\)/.test(adminControl)) {
    fail('Admin Mission Control must not subscribe to whole collections in realtime.');
  }
  if (!adminControl.includes('LIVE_SIGNAL_COLLECTIONS') || !adminControl.includes('firestoreLimit')) {
    fail('Admin Mission Control must use limited realtime signal queries.');
  }

  const runtimeFiles = walk(root).filter((file) => {
    const relative = rel(file);
    return !relative.startsWith('scripts/') && !relative.startsWith('functions/') && !relative.startsWith('supabase/');
  });
  const unboundedReads = runtimeFiles
    .map((file) => ({ file: rel(file), text: fs.readFileSync(file, 'utf8') }))
    .filter(({ text }) => /getDocs\(\s*collection\(/.test(text))
    .map(({ file }) => file);
  if (unboundedReads.length) {
    fail(`Runtime Firestore reads must not call getDocs(collection(...)) without query limits: ${unboundedReads.join(', ')}.`);
  }
}

function checkFreeAutomation() {
  const config = readJson('firebase.json');
  if (config.functions) fail('firebase.json must not define Cloud Functions; automation runs through the free GitHub Actions worker.');

  const functionsPackage = readJson('functions/package.json');
  if (functionsPackage.engines?.node !== '20') fail('functions/package.json must pin Node 20 for shared automation engines.');
  if (functionsPackage.type !== 'commonjs') fail('Shared automation engines must remain CommonJS-compatible.');
  if (functionsPackage.main !== 'platform-automation-engine.js') fail('functions/package.json must point at the shared automation engine.');
  for (const forbidden of ['firebase-functions', 'stripe']) {
    if (functionsPackage.dependencies?.[forbidden]) fail(`functions/package.json must not depend on ${forbidden}.`);
  }
  if (fs.existsSync(path.join(root, 'functions/index.js'))) fail('functions/index.js must not exist in the zero-Blaze architecture.');
  if (fs.existsSync(path.join(root, 'functions/package-lock.json'))) fail('functions/package-lock.json must not reintroduce old Cloud Functions dependencies.');

  const workerCode = readText('scripts/firebase-automation-worker.mjs');
  for (const needle of ['processQueuedSystemJobs', 'writeScaleMetricSnapshot', 'systemJobsProcessed', 'metricSnapshotsCreated', 'automationRules', 'automationRuleRuns', 'loadWorkerPlatformConfig', 'createOperationalIncidentOnce']) {
    if (!workerCode.includes(needle)) fail(`GitHub automation worker scalability path missing: ${needle}.`);
  }
  if (!workerCode.includes('platformHealthChecks')) fail('GitHub automation worker must write platform health checks.');
  if (!workerCode.includes('processEntityAutomationBackfill')) fail('GitHub automation worker must materialize entity automation events without Functions.');
  if (!workerCode.includes('processChatAutomationBackfill')) fail('GitHub automation worker must materialize chat automation events without Functions.');
  if (!workerCode.includes('processPendingPushNotifications')) fail('GitHub automation worker must deliver push notifications without Functions.');
  if (!workerCode.includes('sendEachForMulticast')) fail('GitHub automation worker must send FCM pushes through firebase-admin.');

  const workflow = readText('.github/workflows/firebase-automation.yml');
  for (const needle of ['schedule:', 'workflow_dispatch:', 'npm run automation:matching', 'FIREBASE_SERVICE_ACCOUNT_JSON']) {
    if (!workflow.includes(needle)) fail(`Free automation workflow missing: ${needle}.`);
  }
  if (/firebase\s+deploy|gcloud\s+functions|cloudbuild\.googleapis\.com|artifactregistry\.googleapis\.com/i.test(workflow)) {
    fail('Free automation workflow must not deploy or enable Blaze-only infrastructure.');
  }

  const qualityWorkflow = fs.existsSync(path.join(root, '.github/workflows/quality.yml'))
    ? readText('.github/workflows/quality.yml')
    : '';
  if (/working-directory:\s*functions|functions\/package-lock\.json|node --check index\.js|check:functions/i.test(qualityWorkflow)) {
    fail('Quality workflow must not validate obsolete Cloud Functions entrypoints.');
  }
  for (const needle of ['audit:free-infrastructure', 'check:automation']) {
    if (!qualityWorkflow.includes(needle)) fail(`Quality workflow missing zero-cost guard: ${needle}.`);
  }

  const adminDashboard = readText('pages/dashboard/admin.html');
  for (const needle of ['data-section="configuracion"', 'initAdminPlatformConfig', 'loadPlatformConfig']) {
    if (!adminDashboard.includes(needle)) fail(`Admin configuration center missing: ${needle}.`);
  }
  for (const needle of ['data-section="incidencias"', 'initAdminIncidents', 'incidents-summary-grid']) {
    if (!adminDashboard.includes(needle)) fail(`Admin incident center missing: ${needle}.`);
  }
  const incidentEngine = readText('js/incident-engine.js');
  for (const needle of ['buildIncidentUpdatePatch', 'buildAutomaticIncidentPayload', 'buildIncidentStats']) {
    if (!incidentEngine.includes(needle)) fail(`Incident engine missing: ${needle}.`);
  }

  const pwa = readText('js/pwa.js');
  if (!pwa.includes('platform-public-runtime.js')) fail('PWA must load public platform runtime configuration.');
}

function checkSupabaseBoundary() {
  const allowedRuntimeFiles = new Set([
    'pages/dashboard/admin.html',
    'pages/dashboard/alumno.html',
    'pages/dashboard/familia.html',
    'pages/dashboard/profesor.html',
    'js/admin-control-center.js',
    'js/admin-incidents.js',
    'js/chat-widget.js',
    'js/document-storage-provider.js',
    'js/firebase-data-client.js',
    'js/supabase-client.js',
  ]);
  const offenders = [];
  let queryCount = 0;
  let storageCount = 0;

  for (const file of walk(root)) {
    const relative = rel(file);
    if (relative.startsWith('scripts/') || relative.startsWith('supabase/')) continue;
    const text = fs.readFileSync(file, 'utf8');
    const hasRuntimeSupabase = /supabase-client\.js|@supabase\/supabase-js|window\.supabase|db\.from\(|db\.storage\.from\(/.test(text);
    if (hasRuntimeSupabase && !allowedRuntimeFiles.has(relative)) offenders.push(relative);
    queryCount += [...text.matchAll(/db\.from\(/g)].length;
    storageCount += [...text.matchAll(/db\.storage\.from\(/g)].length;
  }

  if (offenders.length) fail(`Unexpected new runtime Supabase dependencies: ${offenders.join(', ')}.`);
  if (queryCount > 93) fail(`Firebase compatibility query count increased above migration baseline: ${queryCount}.`);
  if (storageCount > 2) fail(`Firebase compatibility storage call count increased above migration baseline: ${storageCount}.`);
  if (queryCount > 0) warn(`Firebase compatibility API still present by design: ${queryCount} db.from calls, ${storageCount} storage calls routed by the Firebase data client.`);
}

checkHosting();
checkPwa();
checkRules();
checkIndexes();
checkFutureScaleGuards();
checkFreeAutomation();
checkSupabaseBoundary();

for (const message of warnings) console.warn(`[WARN] ${message}`);

if (failures.length) {
  console.error('Production readiness audit failed:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log('Production readiness audit OK.');
