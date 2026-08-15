import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = fs.readFileSync(new URL('./reset-class-financial-data.mjs', import.meta.url), 'utf8');

assert(source.includes("const APPLY_TOKEN = 'DELETE_CLASS_FINANCE_DATA'"), 'Production reset must require an explicit confirmation token.');
assert(source.includes("const apply = args.has('--apply')"), 'Production reset must remain a dry-run by default.');
assert(source.indexOf('writeBackup(targets') < source.indexOf('deleteFirestoreTargets(db, targets)'), 'Backup must complete before any Firestore deletion.');
for (const collection of ['clases', 'pagos', 'paymentSchedules', 'classLifecycleEvents', 'metricSnapshots', 'analyticsDailyRollups']) {
  assert(source.includes(`'${collection}'`), `Production reset must cover ${collection}.`);
}
assert(source.includes("prefix: 'pagos/'"), 'Production reset must remove payment receipts from Storage.');
assert(source.includes("collectionGroup('programaciones')") && source.includes("collectionGroup('mensajes')"), 'Production reset must remove scheduled-class artifacts embedded in chats.');
assert(source.includes('remainingDerivedTargets') && source.includes('remainingLockedFamilies'), 'Production reset must verify derived data and family locks are empty after deletion.');
assert(source.includes('if (!verification.clean) process.exitCode = 2'), 'Production reset must fail when final zero-state verification is not clean.');

console.log('Class and finance reset safety validation passed.');
