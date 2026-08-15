import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const familyHtml = fs.readFileSync(new URL('../pages/dashboard/familia.html', import.meta.url), 'utf8');
const adminHtml = fs.readFileSync(new URL('../pages/dashboard/admin.html', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('./firebase-automation-worker.mjs', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/dashboard.css', import.meta.url), 'utf8');

assert(familyHtml.includes('family-payment-access-banner'), 'Family dashboard must explain the overdue-payment access lock.');
assert(familyHtml.includes("new Set(['calendario', 'pagos'])"), 'Locked families must only keep calendar and proof sections available.');
assert(familyHtml.includes('buildFamilyPaymentAccessState'), 'Family dashboard must derive payment access from class facts.');
assert(familyHtml.includes('Primero marca las clases'), 'Payment submission must explain the attendance decision prerequisite.');
assert(familyHtml.includes('Incluidas obligatoriamente'), 'The payment modal must make every due class mandatory.');
assert(familyHtml.includes('exactClasses') && familyHtml.includes('exactAmount'), 'The submission handler must reject partial class or amount payloads.');
assert(familyHtml.includes('onSnapshot') && familyHtml.includes('wasPersistedLocked || familyPaymentAccessLocked'), 'Admin access restoration must reach an open family dashboard without requiring a manual reload.');
assert(adminHtml.includes('buildFamilyPaymentAccessPatch(access'), 'Admin payment validation must recalculate and restore family access.');
assert(adminHtml.includes('everyLinkedClassWasGiven') && adminHtml.includes('validateFamilyPaymentCompleteness'), 'Admin validation must reject unmarked classes, partial debt and incorrect receipt totals.');
assert(worker.includes('familyPaymentAccessLocksApplied'), 'Scheduled automation must materialize overdue family access locks.');
assert(css.includes('.family-payment-access-locked'), 'The dashboard must hide unavailable navigation while payment-locked.');

console.log('Family payment access UI validation passed.');
