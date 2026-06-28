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
  engine,
  client,
  adminModule,
  analyticsClient,
  analyticsEngine,
  platformConfig,
  pwa,
  worker,
  rules,
  indexes,
  packageJson,
] = await Promise.all([
  read('pages/dashboard/admin.html'),
  read('js/experimentation-engine.js'),
  read('js/experimentation-client.js'),
  read('js/admin-experimentation.js'),
  read('js/analytics-client.js'),
  read('js/analytics-engine.js'),
  read('js/platform-config.js'),
  read('js/pwa.js'),
  read('scripts/firebase-automation-worker.mjs'),
  read('firebase/firestore.rules'),
  read('firebase/firestore.indexes.json'),
  read('package.json'),
]);

assert(adminDashboard.includes('data-section="experimentos"'), 'Admin sidebar must expose experimentation.');
assert(adminDashboard.includes('id="section-experimentos"'), 'Admin dashboard must render experimentation section.');
assert(adminDashboard.includes('initAdminExperimentation'), 'Admin dashboard must initialize experimentation module.');

assert(engine.includes('evaluateExperiment'), 'Experimentation engine must evaluate experiments.');
assert(engine.includes('buildExperimentResults'), 'Experimentation engine must compare experiment results.');
assert(engine.includes('stableHash'), 'Experimentation engine must use deterministic hashing.');
assert(engine.includes('rolloutPercent'), 'Experimentation engine must support rollout percentages.');
assert(engine.includes('usersNewerThanDays'), 'Experimentation engine must target new users.');
assert(engine.includes('usersOlderThanDays'), 'Experimentation engine must target old users.');
assert(engine.includes('publicExperimentDefinition'), 'Experimentation engine must sanitize public definitions.');

assert(client.includes("collection(firebaseDb, 'experimentsPublic')"), 'Runtime client must read public experiments.');
assert(client.includes('data-feature-flag'), 'Runtime client must support declarative feature gates.');
assert(client.includes('data-experiment-key'), 'Runtime client must support declarative experiment variants.');
assert(client.includes("trackAnalyticsEvent('experiment.exposed'"), 'Runtime client must track exposures.');
assert(client.includes('CD10ExperimentAssignments'), 'Runtime client must expose active assignments.');

assert(adminModule.includes("setDoc(doc(firebaseDb, 'experiments'"), 'Admin module must write private experiments.');
assert(adminModule.includes("setDoc(doc(firebaseDb, 'experimentsPublic'"), 'Admin module must publish public experiments.');
assert(adminModule.includes('buildExperimentResults'), 'Admin module must compare results with analytics.');
assert(adminModule.includes('data-exp-action="activate"') || adminModule.includes("data-exp-action=\"${definition.status === 'active' ? 'pause' : 'activate'}\""), 'Admin module must expose activation controls.');

assert(analyticsClient.includes('experimentKey'), 'Analytics client must persist experiment keys.');
assert(analyticsClient.includes('variant'), 'Analytics client must persist variants.');
assert(analyticsClient.includes('CD10ExperimentAssignments'), 'Analytics client must attach active assignments.');
assert(analyticsEngine.includes('experiment.exposed'), 'Analytics catalog must include experiment exposure.');
assert(platformConfig.includes('experimentation'), 'Platform config must expose experimentation settings.');
assert(pwa.includes('experimentation-client.js'), 'PWA runtime must initialize experimentation client.');
assert(worker.includes('buildExperimentResults'), 'Automation worker must include experiment results in rollups.');
assert(worker.includes('experimentsEvaluated'), 'Automation worker must report evaluated experiments.');

assert(rules.includes('match /experiments/{experimentId}'), 'Rules must protect private experiments.');
assert(rules.includes('match /experimentsPublic/{experimentId}'), 'Rules must expose public experiment definitions.');
assert(rules.includes("optionalAnalyticsString('experimentKey'"), 'Rules must validate analytics experiment fields.');
assert(indexes.includes('"collectionGroup": "experiments"'), 'Indexes must include experiments.');
assert(indexes.includes('"collectionGroup": "experimentsPublic"'), 'Indexes must include experimentsPublic.');
assert(indexes.includes('"fieldPath": "experimentKey"'), 'Indexes must include analytics experimentKey.');

assert(packageJson.includes('"test:experimentation-engine"'), 'Package scripts must run experimentation engine tests.');
assert(packageJson.includes('"test:experimentation-system"'), 'Package scripts must run experimentation integration tests.');
assert(packageJson.includes('"audit:admin:experiments"'), 'Package scripts must expose admin experimentation smoke.');

console.log('Experimentation system static validation passed.');
