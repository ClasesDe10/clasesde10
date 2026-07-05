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

const pwa = await read('js/pwa.js');

assert(pwa.includes('function isCompactFieldContext'), 'PWA smart hints must detect compact/filter contexts.');
assert(pwa.includes("'.income-lab-toolbar'"), 'Income filters must be excluded from smart hints.');
assert(pwa.includes("'.student-section-toolbar'"), 'Student toolbars must be excluded from smart hints.');
assert(pwa.includes("'.ops-toolbar'"), 'Operational toolbars must be excluded from smart hints.');
assert(pwa.includes("'[data-no-smart-hints]'"), 'Specific UI regions must be able to opt out of smart hints.');
assert(pwa.includes('if (!group && !uploadZone) return;'), 'Smart hints must not be inserted after standalone filter controls.');
assert(!pwa.includes("field.insertAdjacentElement('afterend', node)"), 'Smart hints must not be appended directly after arbitrary fields.');
assert(pwa.includes('.form-row,') && pwa.includes('.form-row-3,') && pwa.includes('align-items: start'), 'Form grids must align from the top to avoid lifted controls.');
assert(pwa.includes('.income-payout-form .btn') && pwa.includes('margin-top: 28px'), 'Payout form button must align with controls, not hints.');
assert(pwa.includes('.income-lab-toolbar .cd10-smart-hint') && pwa.includes('display: none !important'), 'Existing compact hints must be hidden defensively.');

console.log('Form layout stability checks passed.');
