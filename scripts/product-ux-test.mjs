#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assertIncludes(text, needle, message) {
  if (!text.includes(needle)) failures.push(message || `Missing ${needle}`);
}

function assertMatches(text, pattern, message) {
  if (!pattern.test(text)) failures.push(message || `Missing pattern ${pattern}`);
}

const pwa = read('js/pwa.js');
const sw = read('service-worker.js');
const dashboardCss = read('css/dashboard.css');
const packageJson = JSON.parse(read('package.json'));

for (const [needle, message] of [
  ['initProductUxLayer', 'PWA must initialize the product UX layer.'],
  ['initConnectionAwareness', 'Product UX must expose online/offline feedback.'],
  ['initSmartForms', 'Product UX must initialize smart forms.'],
  ['cd10:draft:', 'Smart forms must persist local drafts.'],
  ['requiredProgress', 'Smart forms must compute completion progress.'],
  ['openCommandPalette', 'Dashboards must expose a command palette.'],
  ['Ctrl K', 'Command palette trigger must advertise keyboard shortcut.'],
  ['rolePlaybookActions', 'Command palette must include role-specific playbooks.'],
  ['dynamicRecommendedActions', 'Command palette must surface contextual recommended actions.'],
  ['handleCommandPaletteKeydown', 'Command palette must support keyboard navigation.'],
  ['command_palette.action', 'Command palette actions must be tracked analytically.'],
  ['Centro de acciones', 'Command palette must be framed as an action center, not just search.'],
  ['initDashboardSearchAssist', 'Dashboards must include contextual search assist.'],
  ['initPageProgress', 'Product UX must expose screen and navigation progress feedback.'],
  ['initActionFeedback', 'Product UX must expose action-level loading feedback.'],
  ['pendingFormTimers', 'Product UX must track pending form submissions.'],
  ['cd10ActionLockUntil', 'Action feedback must lock repeated critical clicks briefly.'],
  ['cd10SubmitLockUntil', 'Action feedback must lock repeated form submissions briefly.'],
  ['isActionLocked', 'Action feedback must detect duplicate button actions.'],
  ['isSubmitLocked', 'Action feedback must detect duplicate form submissions.'],
  ['event.stopImmediatePropagation()', 'Duplicate actions must be stopped before reaching feature handlers.'],
  ['Accion ya en curso', 'Duplicate actions must announce that the current action is already running.'],
  ['enhanceFieldDetails', 'Product UX must add smart field feedback and hints.'],
  ['initMicroInteractions', 'Product UX must add polished microinteractions.'],
  ['cd10-live-region', 'Product UX must include an accessible live region.'],
  ['cd10-empty-polished', 'Empty states must receive visual polish.'],
  ['initTooltips', 'Product UX must add accessible tooltips.'],
  ['enhanceEmptyStates', 'Product UX must enhance empty states with contextual actions.'],
  ['type === \'password\'', 'Autosave must skip password fields.'],
  ['window.CD10ProductUX', 'Product UX helpers must be exposed for browser smoke checks.'],
]) {
  assertIncludes(pwa, needle, message);
}

const cacheVersion = sw.match(/CACHE_VERSION = 'clasesde10-pwa-v(\d+)'/);
if (!cacheVersion || Number(cacheVersion[1]) < 34) failures.push('Service worker cache version must be bumped after UX/data model changes.');
assertIncludes(pwa, 'platform-public-runtime.js', 'PWA must load public platform runtime configuration.');
assertIncludes(sw, '/js/scale-engine.js', 'PWA must precache the scale engine used by the data schema.');
assertMatches(dashboardCss, /\.upload-zone\s*\{\s*display:\s*flex;/, 'Upload zones must be block/flex elements so dashed borders do not split.');
assertIncludes(dashboardCss, '.upload-zone > .cd10-smart-hint { display: none !important; }', 'Upload zone hints must never render inside the dashed drop area.');
assertIncludes(pwa, "uploadZone.querySelectorAll('.cd10-smart-hint').forEach((item) => item.remove())", 'PWA must move file hints outside upload zones.');
assertIncludes(packageJson.scripts['check:quality'], 'test:product-ux', 'check:quality must run product UX validation.');
assertIncludes(packageJson.scripts['check:syntax'], 'scripts/product-ux-test.mjs', 'check:syntax must parse product UX validation.');

if (failures.length) {
  console.error('Product UX validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Product UX validation passed.');
