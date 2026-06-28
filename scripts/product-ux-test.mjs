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

const pwa = read('js/pwa.js');
const sw = read('service-worker.js');
const packageJson = JSON.parse(read('package.json'));

for (const [needle, message] of [
  ['initProductUxLayer', 'PWA must initialize the product UX layer.'],
  ['initConnectionAwareness', 'Product UX must expose online/offline feedback.'],
  ['initSmartForms', 'Product UX must initialize smart forms.'],
  ['cd10:draft:', 'Smart forms must persist local drafts.'],
  ['requiredProgress', 'Smart forms must compute completion progress.'],
  ['openCommandPalette', 'Dashboards must expose a command palette.'],
  ['Ctrl K', 'Command palette trigger must advertise keyboard shortcut.'],
  ['initDashboardSearchAssist', 'Dashboards must include contextual search assist.'],
  ['initTooltips', 'Product UX must add accessible tooltips.'],
  ['enhanceEmptyStates', 'Product UX must enhance empty states with contextual actions.'],
  ['type === \'password\'', 'Autosave must skip password fields.'],
  ['window.CD10ProductUX', 'Product UX helpers must be exposed for browser smoke checks.'],
]) {
  assertIncludes(pwa, needle, message);
}

assertIncludes(sw, "CACHE_VERSION = 'clasesde10-pwa-v24'", 'Service worker cache version must be bumped after SEO architecture changes.');
assertIncludes(pwa, 'platform-public-runtime.js', 'PWA must load public platform runtime configuration.');
assertIncludes(packageJson.scripts['check:quality'], 'test:product-ux', 'check:quality must run product UX validation.');
assertIncludes(packageJson.scripts['check:syntax'], 'scripts/product-ux-test.mjs', 'check:syntax must parse product UX validation.');

if (failures.length) {
  console.error('Product UX validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Product UX validation passed.');
