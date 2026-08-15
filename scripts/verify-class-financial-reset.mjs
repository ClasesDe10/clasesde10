#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'clasesde10-50add';
const backupRoot = path.resolve(
  process.env.CLASS_FINANCE_BACKUP_ROOT
    || path.resolve(process.cwd(), '..', 'migration-private', 'backups'),
);
const resetStatePath = path.join(backupRoot, 'class-finance-reset-state.json');
const wholeCollections = [
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
];
const filteredCollections = [
  'busySlots',
  'documentos',
  'documentBlobs',
  'documentBlobChunks',
  'notificaciones',
  'incidencias',
  'analyticsEvents',
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
];
const derivedWords = /\b(class(?:es)?|clase(?:s)?|attendances?|asistencias?|schedules?|horarios?|payments?|pago(?:s)?|bizum|justificante(?:s)?|comprobante(?:s)?|impago(?:s)?|cobro(?:s)?|economic(?:o|a|os|as)?|finance|financial|finanzas?|financier(?:o|a|os|as)|revenues?|ingresos?|amounts?|importes?|euros?|commissions?|comisiones?|statistics?|estad[ií]sticas?|stats?|metrics?|analytics?)\b|€/i;
const paymentDocumentWords = /(?:justificante|comprobante|receipt|recibo|payment|pago|bizum|transferencia|factura)/i;
const familyResetFields = new Set([
  'updatedAt',
  'updated_at',
  'paymentAccessLocked',
  'paymentAccessStatus',
  'paymentAccessReason',
  'paymentAccessDebtAmount',
  'paymentAccessDebtClassCount',
  'paymentAccessDebtClassIds',
  'paymentAccessOldestDebtDueAt',
  'paymentAccessLockedAt',
  'paymentAccessRestoredAt',
  'paymentAccessUpdatedAt',
  'reputationMetrics',
  'publicTrustStats',
  'adminTrustStats',
]);

function initFirebase() {
  if (admin.apps.length) return admin.app();
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: PROJECT_ID,
    storageBucket: `${PROJECT_ID}.firebasestorage.app`,
  });
}

function jsonText(value) {
  return JSON.stringify(value ?? {}).slice(0, 200000);
}

function derivedSearchText(value) {
  return jsonText(value)
    .replace(/([a-záéíóúüñ0-9])([A-ZÁÉÍÓÚÜÑ])/g, '$1 $2')
    .replace(/[_./:\\-]+/g, ' ');
}

function stable(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function') return { __timestamp: value.toDate().toISOString() };
  if (Number.isFinite(value.seconds)) return { __timestamp: new Date(value.seconds * 1000).toISOString() };
  if (Buffer.isBuffer(value)) return { __bufferBase64: value.toString('base64') };
  if (Array.isArray(value)) return value.map(stable);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stable(item)]));
}

function familyCrmData(data = {}) {
  return Object.fromEntries(Object.entries(stable(data) || {})
    .filter(([key]) => !familyResetFields.has(key) && !key.startsWith('trust'))
    .sort(([left], [right]) => left.localeCompare(right)));
}

function changedKeys(expected = {}, actual = {}) {
  return Array.from(new Set([...Object.keys(expected), ...Object.keys(actual)]))
    .filter((key) => JSON.stringify(expected[key]) !== JSON.stringify(actual[key]))
    .sort();
}

function paymentDocument(data = {}) {
  const type = [data.type, data.tipo, data.documentType, data.category, data.categoria].filter(Boolean).join(' ');
  const paths = [data.storagePath, data.storage_path, data.path, data.url, data.proofUrl, data.receiptUrl].filter(Boolean).join(' ');
  return paymentDocumentWords.test(type) || /(?:^|[\/])pagos[\/]/i.test(paths);
}

function chatHasClassState(data = {}) {
  return Boolean(data.activeClassId || data.classSeriesId || data.seriesEndDate)
    || (Array.isArray(data.activeClassIds) && data.activeClassIds.length > 0);
}

async function listDocs(db, collectionName) {
  const snap = await db.collection(collectionName).get();
  return snap.docs.map((doc) => ({ id: doc.id, path: doc.ref.path, data: doc.data() || {} }));
}

async function collectionGroupDocs(db, collectionName) {
  const snap = await db.collectionGroup(collectionName).get();
  return snap.docs.map((doc) => ({ id: doc.id, path: doc.ref.path, data: doc.data() || {} }));
}

async function remainingPlannedTargets(db, targetPaths = []) {
  const remaining = [];
  for (let index = 0; index < targetPaths.length; index += 200) {
    const chunk = targetPaths.slice(index, index + 200).map((documentPath) => db.doc(documentPath));
    if (!chunk.length) continue;
    const snapshots = await db.getAll(...chunk);
    snapshots.forEach((snapshot) => {
      if (snapshot.exists) remaining.push(snapshot.ref.path);
    });
  }
  return remaining.sort();
}

async function existingStoragePaths(bucket, storagePaths = []) {
  const existing = [];
  for (const storagePath of Array.from(new Set(storagePaths.map(String).filter(Boolean))).sort()) {
    const [exists] = await bucket.file(storagePath).exists();
    if (exists) existing.push(storagePath);
  }
  return existing;
}

async function fileEvidence(resetState) {
  const backupPaths = Array.from(new Set((resetState.backupPaths || []).map(String).filter(Boolean)));
  const backupDirectories = Array.from(new Set((resetState.backupDirectories || []).map(String).filter(Boolean)));
  const missingBackupPaths = [];
  const invalidBackupPaths = [];
  const expectedFamilyProfiles = {};
  for (const backupPath of backupPaths) {
    try {
      const manifest = JSON.parse(await fs.readFile(backupPath, 'utf8'));
      if (manifest.projectId !== PROJECT_ID
        || !Array.isArray(manifest.firestoreDocuments)
        || !Array.isArray(manifest.storageFiles)
        || !Array.isArray(manifest.familyProfilesBeforeDerivedReset)) {
        invalidBackupPaths.push(backupPath);
        continue;
      }
      manifest.familyProfilesBeforeDerivedReset.forEach((profile) => {
        if (!profile?.path || Object.hasOwn(expectedFamilyProfiles, profile.path)) return;
        expectedFamilyProfiles[profile.path] = familyCrmData(profile.data || {});
      });
    } catch {
      missingBackupPaths.push(backupPath);
    }
  }
  const missingBackupDirectories = [];
  for (const backupDirectory of backupDirectories) {
    try {
      if (!(await fs.stat(backupDirectory)).isDirectory()) missingBackupDirectories.push(backupDirectory);
    } catch {
      missingBackupDirectories.push(backupDirectory);
    }
  }
  return {
    backupPaths,
    backupDirectories,
    missingBackupPaths,
    invalidBackupPaths,
    missingBackupDirectories,
    expectedFamilyProfiles,
  };
}

async function preservedFamilyProfileEvidence(db, expectedProfiles = {}) {
  const missingPaths = [];
  const mismatches = [];
  const entries = Object.entries(expectedProfiles).sort(([left], [right]) => left.localeCompare(right));
  for (let index = 0; index < entries.length; index += 200) {
    const chunk = entries.slice(index, index + 200);
    const snapshots = await db.getAll(...chunk.map(([documentPath]) => db.doc(documentPath)));
    snapshots.forEach((snapshot, snapshotIndex) => {
      const [documentPath, expected] = chunk[snapshotIndex];
      if (!snapshot.exists) {
        missingPaths.push(documentPath);
        return;
      }
      const actual = familyCrmData(snapshot.data() || {});
      const fields = changedKeys(expected, actual);
      if (fields.length) mismatches.push({ path: documentPath, changedFields: fields });
    });
  }
  return {
    expectedCount: entries.length,
    preservedCount: entries.length - missingPaths.length - mismatches.length,
    missingPaths,
    mismatches,
  };
}

async function main() {
  const resetState = JSON.parse(await fs.readFile(resetStatePath, 'utf8'));
  if (resetState.projectId !== PROJECT_ID || resetState.status !== 'completed' || resetState.verification?.clean !== true) {
    throw new Error(`Reset state does not prove a completed clean reset for ${PROJECT_ID}.`);
  }

  initFirebase();
  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  const remainingWholeCollections = {};
  for (const collectionName of wholeCollections) {
    remainingWholeCollections[collectionName] = (await db.collection(collectionName).limit(1).get()).size;
  }

  const filteredRows = (await Promise.all(filteredCollections.map((collectionName) => listDocs(db, collectionName))))
    .flat();
  const remainingPaymentDocuments = filteredRows
    .filter((item) => item.path.startsWith('documentos/') && paymentDocument(item.data))
    .map((item) => item.path)
    .sort();
  const remainingDerivedDocuments = filteredRows
    .filter((item) => derivedWords.test(derivedSearchText(item.data)))
    .map((item) => item.path)
    .filter((documentPath) => !remainingPaymentDocuments.includes(documentPath))
    .sort();

  const chats = await listDocs(db, 'chats');
  const remainingChatClassState = chats.filter((item) => chatHasClassState(item.data)).map((item) => item.path).sort();
  const remainingChatClassFinancePreviews = chats
    .filter((item) => derivedWords.test(derivedSearchText(item.data.lastMessage)))
    .map((item) => item.path)
    .sort();
  const scheduleRows = await collectionGroupDocs(db, 'programaciones');
  const messageRows = await collectionGroupDocs(db, 'mensajes');
  const remainingClassFinanceMessages = messageRows
    .filter((item) => derivedWords.test(derivedSearchText(item.data)))
    .map((item) => item.path)
    .sort();
  const lockedFamilies = await db.collection('familias').where('paymentAccessLocked', '==', true).get();
  const remainingLockedFamilies = lockedFamilies.docs.map((doc) => doc.ref.path).sort();

  const remainingTargetPaths = await remainingPlannedTargets(db, resetState.targetPaths || []);
  const [paymentPrefixFiles] = await bucket.getFiles({ prefix: 'pagos/' });
  const explicitStoragePaths = await existingStoragePaths(bucket, resetState.storagePaths || []);
  const remainingPaymentStoragePaths = Array.from(new Set([
    ...paymentPrefixFiles.map((file) => file.name),
    ...explicitStoragePaths,
  ])).sort();
  const backupEvidence = await fileEvidence(resetState);
  const preservedFamilyProfiles = await preservedFamilyProfileEvidence(db, backupEvidence.expectedFamilyProfiles);
  const { expectedFamilyProfiles: _expectedFamilyProfiles, ...backups } = backupEvidence;

  const clean = Object.values(remainingWholeCollections).every((count) => count === 0)
    && remainingPaymentDocuments.length === 0
    && remainingDerivedDocuments.length === 0
    && remainingChatClassState.length === 0
    && remainingChatClassFinancePreviews.length === 0
    && scheduleRows.length === 0
    && remainingClassFinanceMessages.length === 0
    && remainingLockedFamilies.length === 0
    && remainingTargetPaths.length === 0
    && remainingPaymentStoragePaths.length === 0
    && backups.backupPaths.length > 0
    && backups.missingBackupPaths.length === 0
    && backups.invalidBackupPaths.length === 0
    && backups.missingBackupDirectories.length === 0
    && preservedFamilyProfiles.missingPaths.length === 0
    && preservedFamilyProfiles.mismatches.length === 0;

  const result = {
    ok: clean,
    mode: 'read_only_independent_verification',
    projectId: PROJECT_ID,
    verifiedAt: new Date().toISOString(),
    resetStatePath,
    resetCompletedAt: resetState.completedAt || '',
    resetAttempts: Number(resetState.attempts || 0),
    remainingWholeCollections,
    remainingPaymentDocuments,
    remainingDerivedDocuments,
    remainingChatClassState,
    remainingChatClassFinancePreviews,
    remainingScheduleProposals: scheduleRows.map((item) => item.path).sort(),
    remainingClassFinanceMessages,
    remainingLockedFamilies,
    remainingTargetPaths,
    remainingPaymentStoragePaths,
    backups,
    preservedFamilyProfiles,
    clean,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!clean) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
