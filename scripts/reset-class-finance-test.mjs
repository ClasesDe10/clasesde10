import fs from 'node:fs';
import {
  derivedSearchText,
  derivedWords,
  normalizeStoragePath,
  paymentDocument,
  storagePathsFromData,
} from './reset-class-financial-data.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = fs.readFileSync(new URL('./reset-class-financial-data.mjs', import.meta.url), 'utf8');
const verifierSource = fs.readFileSync(new URL('./verify-class-financial-reset.mjs', import.meta.url), 'utf8');

assert(source.includes("const APPLY_TOKEN = 'DELETE_CLASS_FINANCE_DATA'"), 'Production reset must require an explicit confirmation token.');
assert(source.includes("const apply = args.has('--apply')"), 'Production reset must remain a dry-run by default.');
assert(source.includes('process.env.CLASS_FINANCE_BACKUP_ROOT'), 'The reset must support an isolated backup root for emulator verification.');
assert(source.indexOf('writeBackup(bucket, targets') < source.indexOf('deleteFirestoreTargets(db, targets)'), 'Backup must complete before any Firestore deletion.');
assert(source.indexOf('await writeResetState(preparedState)') < source.indexOf('const deletedFirestoreDocuments = await deleteFirestoreTargets'), 'A recoverable deletion plan must be persisted before Firestore deletion.');
assert(source.includes('loadResetState()') && source.includes('recoveredFromPreparedReset'), 'Interrupted resets must resume their original backed-up target plan.');
assert(source.includes('refusing to delete data created afterwards'), 'A completed reset must never delete classes created after its completion.');
for (const collection of [
  'clases',
  'pagos',
  'paymentSchedules',
  'classLifecycleEvents',
  'metricSnapshots',
  'analyticsDailyRollups',
  'resumenMensual',
  'resumenProfesorMes',
  'teacherMonthlySummaries',
  'dashboardStats',
  'adminStats',
  'classViews',
  'platformHealthChecks',
  'preventiveRiskSnapshots',
  'alertPrioritySnapshots',
  'platformSupervisionSnapshots',
  'relationshipFollowupSnapshots',
  'proactiveAssistSnapshots',
  'internalAiInsightSnapshots',
  'automationEvents',
  'automationRuleRuns',
  'auditLogs',
  'opsAlerts',
  'crmTasks',
  'systemJobs',
  'deadLetters',
  'preventiveRisks',
  'alertDecisions',
  'platformSupervisionFindings',
  'relationshipFollowups',
  'proactiveAssistSignals',
  'internalAiInsights',
  'adminAiQueries',
  'crmNotes',
  'importAudits',
  'legacyImports',
]) {
  assert(source.includes(`'${collection}'`), `Production reset must cover ${collection}.`);
}
assert(source.includes("prefix: 'pagos/'"), 'Production reset must remove payment receipts from Storage.');
assert(source.includes('storagePathsFromData(doc.data())'), 'Production reset must discover receipt files from payment and document records.');
assert(source.includes("parsed.pathname.match(/\\/o\\/([^/?]+)/i)"), 'Production reset must decode Firebase download URLs into Storage paths.');
assert(source.includes("file.download({ destination })"), 'Production reset must copy receipt binaries locally before deletion.');
assert(source.includes('remainingPaymentStoragePaths'), 'Production reset must verify every targeted receipt path after deletion.');
assert(source.includes("collectionGroup('programaciones')") && source.includes("collectionGroup('mensajes')"), 'Production reset must remove scheduled-class artifacts embedded in chats.');
assert(source.includes('derivedWords.test(searchable)') && source.includes('classFinanceMessageText'), 'Technical class and payment identifiers in chat messages must be removed.');
assert(source.includes('classFinanceMessageText(data.lastMessage)') && source.includes('lastMessageId: deletedField'), 'Production reset must clear chat previews that still expose deleted class or financial data.');
assert(source.includes('remainingChatClassFinancePreviews'), 'Production reset must verify that no class or financial preview remains in a chat document.');
assert(source.includes("collectionGroup('reacciones')") && source.includes('context.chatMessageIds.has(messageId)'), 'Production reset must remove reactions orphaned by deleted class/payment chat messages.');
assert(source.includes('data.attachment') && source.includes('storagePathsFromData(doc.data())'), 'Production reset must discover payment proofs attached inside chats.');
assert(source.includes('remainingDerivedTargets') && source.includes('remainingLockedFamilies'), 'Production reset must verify derived data and family locks are empty after deletion.');
assert(source.includes('for (const collectionName of wholeCollections)'), 'The reset must verify every whole derived collection, including historical aliases.');
assert(source.includes('if (!verification.clean) process.exitCode = 2'), 'Production reset must fail when final zero-state verification is not clean.');
assert(verifierSource.includes("mode: 'read_only_independent_verification'"), 'The independent verifier must identify its read-only mode.');
assert(verifierSource.includes("resetState.status !== 'completed'") && verifierSource.includes('resetState.verification?.clean !== true'), 'The independent verifier must refuse to run without a completed clean reset state.');
for (const mutation of ['.delete(', '.update(', '.set(', '.add(']) {
  assert(!verifierSource.includes(mutation), `The independent verifier must never mutate Firebase (${mutation}).`);
}
assert(verifierSource.includes('remainingTargetPaths') && verifierSource.includes('remainingPaymentStoragePaths'), 'The independent verifier must recheck every planned Firestore and Storage target.');
assert(verifierSource.includes('familyProfilesBeforeDerivedReset') && verifierSource.includes('preservedFamilyProfiles'), 'The independent verifier must compare preserved family CRM profiles with the pre-reset backup.');
assert(verifierSource.includes("!key.startsWith('trust')") && verifierSource.includes('familyResetFields'), 'The family CRM comparison may ignore only reset-owned trust/payment fields.');

assert(normalizeStoragePath('gs://clasesde10-50add.firebasestorage.app/pagos/family/receipt.png') === 'pagos/family/receipt.png', 'gs:// receipt paths must normalize.');
assert(
  normalizeStoragePath('https://firebasestorage.googleapis.com/v0/b/clasesde10-50add.firebasestorage.app/o/pagos%2Ffamily%2Freceipt.png?alt=media&token=x') === 'pagos/family/receipt.png',
  'Firebase download URLs must normalize.',
);
assert(normalizeStoragePath('https://evil.example/receipt.png') === '', 'External URLs must never become local bucket deletion targets.');
assert(
  JSON.stringify(storagePathsFromData({ storagePath: 'pagos/a/current.png', versions: [{ storage_path: 'pagos/a/old.png' }] }).sort())
    === JSON.stringify(['pagos/a/current.png', 'pagos/a/old.png']),
  'Current and historical receipt paths must be collected.',
);
assert(paymentDocument({ type: 'justificante_pago', receiptUrl: 'https://evil.example/a.png' }) === true, 'Receipt document types must be detected.');
assert(paymentDocument({ category: 'pagos', name: 'Comprobante bancario' }) === true, 'Historical payment document categories must be detected.');
assert(paymentDocument({ url: 'https://firebasestorage.googleapis.com/v0/b/x/o/pagos%2Fa%2Fproof.png?alt=media' }) === true, 'Receipt download URLs must be detected.');
assert(derivedWords.test('classification result') === false, 'Derived-data matching must not delete unrelated classification records.');
assert(derivedWords.test('Pago de clases pendiente') === true, 'Payment and class-derived data must be detected.');
assert(derivedWords.test(derivedSearchText({ eventType: 'overdue_payments', monthlyRevenue: 85, pendingPayments: 2 })) === true, 'Snake-case and camel-case financial metrics must be detected.');
assert(derivedWords.test(derivedSearchText({ type: 'weekly_schedule', proposalStatus: 'accepted' })) === true, 'Technical chat scheduling identifiers must be detected.');
assert(derivedWords.test(derivedSearchText({ eventType: 'profile_completed', section: 'contact_details' })) === false, 'Unrelated profile events must remain outside the reset.');
assert(derivedWords.test(derivedSearchText({ analyticsVersion: 'analytics-v1', eventName: 'page.view', category: 'navigation' })) === false, 'Anonymous page telemetry must not be mistaken for class or financial statistics.');

console.log('Class and finance reset safety validation passed.');
