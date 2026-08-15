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
assert(adminHtml.includes('loadAdminFamilyClassesExact') && adminHtml.includes("where(field, '==', cleanFamilyUid)"), 'Admin approval must rebuild the complete family debt without a global read limit.');
const atomicApproval = adminHtml.slice(adminHtml.indexOf('if (isFamilyApproval)'), adminHtml.indexOf('} else if (isFamilyRejection'));
assert(
  atomicApproval.includes('writeBatch(firebaseDb)')
    && atomicApproval.includes("firestoreDoc(firebaseDb, 'pagos', id)")
    && atomicApproval.includes("firestoreDoc(firebaseDb, 'clases', classId)")
    && atomicApproval.includes("firestoreDoc(firebaseDb, 'familias', familyUid)")
    && atomicApproval.includes('await batch.commit()'),
  'Family proof approval must atomically update the payment, every class and the family access lock.',
);
const atomicRejection = adminHtml.slice(adminHtml.indexOf('} else if (isFamilyRejection'), adminHtml.indexOf('if (!paymentUpdatedAtomically)'));
assert(atomicRejection.includes('ownedClassIds.has') && atomicRejection.includes('await batch.commit()'), 'Rejected proofs must only reopen classes owned by that family and update atomically.');
assert(worker.includes('familyPaymentAccessLocksApplied'), 'Scheduled automation must materialize overdue family access locks.');
const workerPaymentSweep = worker.slice(worker.indexOf('async function processPaymentReminders'), worker.indexOf('async function createPaymentRequestForClassWorker'));
const workerCompleteAccessContext = worker.slice(worker.indexOf('async function loadCompleteFamilyPaymentAccessContext'), worker.indexOf('function familyPaymentAccessProfileUid'));
assert(worker.includes('loadCompleteFamilyPaymentAccessContext') && workerPaymentSweep.includes('paymentAccessClasses'), 'The access-lock sweep must inspect every class in the current reset generation.');
assert(!workerCompleteAccessContext.includes('.limit(') && workerCompleteAccessContext.includes("db.collection('paymentSchedules').get()"), 'The access-lock context must not inherit the notification batch limit.');
assert(workerPaymentSweep.indexOf('loadCompleteFamilyPaymentAccessContext') < workerPaymentSweep.indexOf("listCollection(db, 'clases', limit)"), 'The exhaustive access decision must run before the intentionally limited notification batch.');
assert(workerPaymentSweep.includes('familyPaymentAccessLocksRestored') && workerPaymentSweep.includes('profile.paymentAccessLockedAt || isoNow()'), 'The worker must restore stale locks and preserve the original lock timestamp.');
assert(css.includes('.family-payment-access-locked'), 'The dashboard must hide unavailable navigation while payment-locked.');

console.log('Family payment access UI validation passed.');
