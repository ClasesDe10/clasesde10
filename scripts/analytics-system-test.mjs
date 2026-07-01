import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

const [
  adminDashboard,
  analyticsClient,
  analyticsModule,
  analyticsEngine,
  dataClient,
  authModule,
  publicLeads,
  pwa,
  worker,
  rules,
  indexes,
  css,
  packageJson,
] = await Promise.all([
  read('pages/dashboard/admin.html'),
  read('js/analytics-client.js'),
  read('js/analytics.js'),
  read('js/analytics-engine.js'),
  read('js/firebase-data-client.js'),
  read('js/auth.js'),
  read('js/public-leads.js'),
  read('js/pwa.js'),
  read('scripts/firebase-automation-worker.mjs'),
  read('firebase/firestore.rules'),
  read('firebase/firestore.indexes.json'),
  read('css/dashboard.css'),
  read('package.json'),
]);

assert(adminDashboard.includes('data-section="analitica"'), 'Admin sidebar must expose the analytics section.');
assert(adminDashboard.includes('id="section-analitica"'), 'Admin dashboard must render the analytics section.');
assert(adminDashboard.includes('initAdminAnalytics'), 'Admin dashboard must initialize the analytics module.');
assert(adminDashboard.includes('id="analytics-kpis"'), 'Analytics center must render KPI cards.');
assert(adminDashboard.includes('id="analytics-funnels"'), 'Analytics center must render funnels.');
assert(adminDashboard.includes('tbody-analytics-pages'), 'Analytics center must render page conversion.');
assert(adminDashboard.includes('tbody-analytics-errors'), 'Analytics center must render errors.');
assert(adminDashboard.includes('tbody-analytics-teachers'), 'Analytics center must render teacher conversion.');
assert(adminDashboard.includes('tbody-analytics-events'), 'Analytics center must render recent events.');

assert(analyticsClient.includes("collection(firebaseDb, 'analyticsEvents')"), 'Analytics client must write to analyticsEvents.');
assert(analyticsClient.includes('SENSITIVE_KEY_RE'), 'Analytics client must redact sensitive metadata.');
assert(analyticsClient.includes('trackDataMutation'), 'Analytics client must expose data mutation tracking.');
assert(analyticsClient.includes('installGlobalAnalyticsListeners'), 'Analytics client must expose global listeners.');
assert(analyticsModule.includes("auth.signup.succeeded"), 'Legacy analytics bridge must map signup events.');
assert(analyticsModule.includes("request.created"), 'Legacy analytics bridge must map request conversion.');
assert(analyticsEngine.includes('buildAnalyticsReport'), 'Analytics engine must build reports.');
assert(analyticsEngine.includes('family_acquisition'), 'Analytics engine must define acquisition funnels.');
assert(analyticsEngine.includes('pageConversion'), 'Analytics engine must calculate page conversion.');
assert(analyticsEngine.includes('teacherConversion'), 'Analytics engine must calculate teacher conversion.');

assert(dataClient.includes("import { trackDataMutation }"), 'Firebase data client must import analytics mutation tracker.');
assert(dataClient.includes('trackCompatDataMutation'), 'Firebase data client must wrap analytics mutation tracking safely.');
assert(dataClient.includes("trackCompatDataMutation(this.table, 'insert'"), 'Firebase data client must track inserts.');
assert(dataClient.includes("trackCompatDataMutation(this.table, 'update'"), 'Firebase data client must track updates.');
assert(dataClient.includes("trackCompatDataMutation(this.table, 'delete'"), 'Firebase data client must track deletes.');
assert(dataClient.includes("console.warn('Data mutation tracking failed'"), 'Firebase data client must handle analytics tracking failures.');
assert(authModule.includes("auth.login.started"), 'Auth module must track login start.');
assert(authModule.includes("auth.login.failed"), 'Auth module must track login failures.');
assert(authModule.includes("auth.signup.succeeded"), 'Auth module must track signup success.');
assert(publicLeads.includes("trackFormEvent('form.submitted'"), 'Public leads must track successful submissions.');
assert(publicLeads.includes("trackFormEvent('form.error'"), 'Public leads must track validation and write errors.');
assert(pwa.includes('initProductAnalyticsLayer'), 'PWA layer must install product analytics listeners.');
assert(pwa.includes("trackProductEvent('search.used'"), 'PWA layer must track search usage.');
assert(pwa.includes("trackProductEvent('form.abandoned'"), 'PWA layer must track form abandonment.');

assert(worker.includes('writeAnalyticsRollup'), 'Automation worker must generate analytics rollups.');
assert(worker.includes('analyticsDailyRollups'), 'Automation worker must persist analytics rollups.');
assert(rules.includes('validAnalyticsEventCreate'), 'Firestore rules must validate analytics event creation.');
assert(rules.includes('match /analyticsEvents/{eventId}'), 'Firestore rules must protect analyticsEvents.');
assert(rules.includes('allow create: if validAnalyticsEventCreate();'), 'Firestore rules must allow sanitized public analytics creates.');
assert(rules.includes('allow read, update, delete: if isAdmin();'), 'Firestore rules must keep analytics reads admin-only.');
assert(indexes.includes('"collectionGroup": "analyticsEvents"'), 'Firestore indexes must include analyticsEvents.');
assert(indexes.includes('"collectionGroup": "analyticsDailyRollups"'), 'Firestore indexes must include analyticsDailyRollups.');
assert(css.includes('.analytics-mini-bar'), 'Dashboard CSS must style analytics bars.');

assert(packageJson.includes('"test:analytics-engine"'), 'Package scripts must run analytics engine tests.');
assert(packageJson.includes('"test:analytics-system"'), 'Package scripts must run analytics integration tests.');
assert(packageJson.includes('"audit:admin:analytics"'), 'Package scripts must expose analytics admin smoke.');

console.log('Analytics system static validation passed.');
