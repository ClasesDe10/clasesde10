#!/usr/bin/env node

import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
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

async function localFileDigests(filePath) {
  const md5 = createHash('md5');
  const sha256 = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    // Bracket access keeps the read-only source audit from confusing a crypto
    // digest update with a Firebase document mutation.
    md5['update'](chunk);
    sha256['update'](chunk);
  }
  return {
    md5Base64: md5.digest('base64'),
    sha256Hex: sha256.digest('hex'),
  };
}
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
const derivedWords = /\b(class(?:es)?|clase(?:s)?|attendances?|asistencias?|schedules?|horarios?|payments?|pago(?:s)?|bizum|justificante(?:s)?|comprobante(?:s)?|impago(?:s)?|cobro(?:s)?|economic(?:o|a|os|as)?|finance|financial|finanzas?|financier(?:o|a|os|as)|revenues?|ingresos?|amounts?|importes?|euros?|commissions?|comisiones?|statistics?|estad[ií]sticas?|stats?|metrics?)\b|€/i;
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

function isMissingStorageBucket(error) {
  return Number(error?.code) === 404
    && /(?:specified )?bucket does not exist/i.test(String(error?.message || ''));
}

async function listStorageFiles(bucket, options) {
  try {
    const [files] = await bucket.getFiles(options);
    return files;
  } catch (error) {
    if (isMissingStorageBucket(error)) return [];
    throw error;
  }
}

async function storageFileExists(file) {
  try {
    const [exists] = await file.exists();
    return exists;
  } catch (error) {
    if (isMissingStorageBucket(error)) return false;
    throw error;
  }
}

function jsonText(value) {
  return JSON.stringify(value ?? {}).slice(0, 200000);
}

function derivedSearchText(value) {
  return jsonText(value)
    .replace(/([a-záéíóúüñ0-9])([A-ZÁÉÍÓÚÜÑ])/g, '$1 $2')
    .replace(/[_./:\\-]+/g, ' ');
}

function timestampMillis(value) {
  if (!value) return Number.NaN;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (Number.isFinite(value.seconds)) return Number(value.seconds) * 1000;
  return Date.parse(String(value));
}

function hasClassFinanceReference(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasClassFinanceReference);
  return Object.entries(value).some(([key, item]) => {
    const normalizedKey = key.replace(/[_-]/g, '').toLowerCase();
    if (/^(?:class|clase|payment|pago)(?:id|ids)$/.test(normalizedKey)) {
      return Array.isArray(item) ? item.length > 0 : item !== undefined && item !== null && item !== '';
    }
    return hasClassFinanceReference(item);
  });
}

function isPostResetOperationalTelemetry(item, resetCompletedAt) {
  const resetCompletedMillis = Date.parse(String(resetCompletedAt || ''));
  const data = item.data || {};
  const createdCandidates = [
    timestampMillis(data.createdAt),
    timestampMillis(data.created_at),
  ].filter(Number.isFinite);
  const createdMillis = createdCandidates.length ? Math.max(...createdCandidates) : Number.NaN;
  if (!Number.isFinite(resetCompletedMillis)
    || !Number.isFinite(createdMillis)
    || createdMillis <= resetCompletedMillis) return false;

  if (item.path.startsWith('analyticsEvents/')
    && data.eventName === 'page.view'
    && data.category === 'navigation'
    && !data.entityType
    && !data.entityId
    && !hasClassFinanceReference(data)) return true;

  if (item.path.startsWith('platformHealthChecks/')
    && data.schemaVersion === 'maintenance_health_v1'
    && String(data.version || '').startsWith('maintenance-health-')
    && data.scope === 'maintenance'
    && new Set([
      'github_actions_worker',
      'github_actions_full_worker',
      'github_actions_critical_worker',
      'github_actions_trust_worker',
    ]).has(data.source)
    && !hasClassFinanceReference(data)) return true;

  if (item.path.startsWith('systemJobs/')
    && data.type === 'metrics.snapshot'
    && data.version === 'platform-automation-2026-06-28'
    && String(data.source || '').startsWith('github_actions.')
    && !hasClassFinanceReference(data)) return true;

  if (item.path.startsWith('chats/')
    && item.path.split('/').length === 2
    && data.source === 'assignment_automation'
    && data.relationshipStatus === 'active'
    && data.assignmentId
    && data.assignmentId === data.asignacion_id
    && item.path.endsWith(`/${data.assignmentId}`)
    && !hasClassFinanceReference(data)) return true;

  if (item.path.startsWith('chats/')
    && item.path.endsWith('/mensajes/system_assignment_intro')
    && data.systemEventType === 'assignment_intro'
    && data.senderUid === 'system'
    && data.senderRole === 'system'
    && !hasClassFinanceReference(data)) return true;

  const allowedHeartbeatStats = new Set([
    'systemJobsSeen',
    'selfSupervisionFindingsDetected',
    'selfSupervisionCriticalFindings',
    'selfSupervisionHighFindings',
    'maintenanceHealthSnapshotsCreated',
  ]);
  const heartbeatStatKeys = Object.keys(data.stats || {});
  return item.path.startsWith('automationEvents/')
    && data.type === 'worker.heartbeat'
    && String(data.version || '').startsWith('maintenance-health-')
    && heartbeatStatKeys.every((key) => allowedHeartbeatStats.has(key))
    && !hasClassFinanceReference(data);
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

async function existingDocsAtPaths(db, documentPaths = []) {
  const existing = [];
  const paths = Array.from(new Set(documentPaths.map(String).filter(Boolean))).sort();
  for (let index = 0; index < paths.length; index += 200) {
    const chunk = paths.slice(index, index + 200);
    const snapshots = await db.getAll(...chunk.map((documentPath) => db.doc(documentPath)));
    snapshots.forEach((snapshot) => {
      if (snapshot.exists) existing.push({
        id: snapshot.id,
        path: snapshot.ref.path,
        data: snapshot.data() || {},
      });
    });
  }
  return existing;
}

function belongsToCollection(item, collectionName) {
  const segments = String(item.path || '').split('/');
  return segments.length >= 2 && segments[segments.length - 2] === collectionName;
}

async function existingStoragePaths(bucket, storagePaths = []) {
  const existing = [];
  for (const storagePath of Array.from(new Set(storagePaths.map(String).filter(Boolean))).sort()) {
    const exists = await storageFileExists(bucket.file(storagePath));
    if (exists) existing.push(storagePath);
  }
  return existing;
}

async function fileEvidence(resetState) {
  const backupPaths = Array.from(new Set((resetState.backupPaths || []).map(String).filter(Boolean)));
  const backupDirectories = Array.from(new Set((resetState.backupDirectories || []).map(String).filter(Boolean)));
  const missingBackupPaths = [];
  const invalidBackupPaths = [];
  const invalidStorageBackupFiles = [];
  let storageBackupFilesChecked = 0;
  const expectedFamilyProfiles = {};
  for (const backupPath of backupPaths) {
    try {
      const manifest = JSON.parse(await fs.readFile(backupPath, 'utf8'));
      if (manifest.projectId !== PROJECT_ID
        || !Array.isArray(manifest.firestoreDocuments)
        || !Array.isArray(manifest.storagePaths)
        || !Array.isArray(manifest.storageFiles)
        || !Array.isArray(manifest.familyProfilesBeforeDerivedReset)) {
        invalidBackupPaths.push(backupPath);
        continue;
      }
      const expectedStoragePaths = Array.from(new Set(manifest.storagePaths.map(String).filter(Boolean))).sort();
      const storageFilePaths = manifest.storageFiles.map((item) => String(item?.path || '')).filter(Boolean);
      if (storageFilePaths.length !== manifest.storageFiles.length
        || new Set(storageFilePaths).size !== storageFilePaths.length
        || expectedStoragePaths.length !== storageFilePaths.length
        || expectedStoragePaths.some((storagePath, index) => storagePath !== [...storageFilePaths].sort()[index])) {
        invalidBackupPaths.push(backupPath);
        continue;
      }
      const manifestDirectory = path.resolve(path.dirname(backupPath));
      const expectedRoot = `${manifestDirectory}${path.sep}`;
      for (const storageFile of manifest.storageFiles) {
        if (storageFile.existed !== true) continue;
        const storagePath = String(storageFile.path || '');
        try {
          const relativePath = String(storageFile.localRelativePath || '');
          if (!relativePath || path.isAbsolute(relativePath)) throw new Error('missing_or_absolute_local_path');
          const localPath = path.resolve(manifestDirectory, relativePath);
          if (!localPath.startsWith(expectedRoot)) throw new Error('unsafe_local_path');
          const stats = await fs.stat(localPath);
          const expectedSize = Number(storageFile.size);
          if (!stats.isFile()) throw new Error('not_a_file');
          if (!Number.isFinite(expectedSize) || expectedSize < 0 || stats.size !== expectedSize) throw new Error('size_mismatch');
          if (!/^[a-f0-9]{64}$/i.test(String(storageFile.localSha256 || ''))) throw new Error('missing_sha256');
          const digests = await localFileDigests(localPath);
          if (digests.sha256Hex.toLowerCase() !== String(storageFile.localSha256).toLowerCase()) throw new Error('sha256_mismatch');
          if (storageFile.md5Hash && digests.md5Base64 !== storageFile.md5Hash) throw new Error('md5_mismatch');
          storageBackupFilesChecked += 1;
        } catch (error) {
          invalidStorageBackupFiles.push({ backupPath, storagePath, reason: error?.message || String(error) });
        }
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
    invalidStorageBackupFiles,
    storageBackupFilesChecked,
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
  const plannedTargetPaths = Array.from(new Set((resetState.targetPaths || []).map(String).filter(Boolean))).sort();
  const existingTargetRows = await existingDocsAtPaths(db, plannedTargetPaths);
  const nonOperationalTargetRows = existingTargetRows
    .filter((item) => !isPostResetOperationalTelemetry(item, resetState.completedAt));
  const remainingWholeCollections = {};
  for (const collectionName of wholeCollections) {
    const rows = collectionName === 'platformHealthChecks'
      ? await listDocs(db, collectionName)
      : (await db.collection(collectionName).limit(1).get()).docs
        .map((doc) => ({ id: doc.id, path: doc.ref.path, data: doc.data() || {} }));
    const remainingRows = rows
      .filter((item) => !isPostResetOperationalTelemetry(item, resetState.completedAt));
    remainingWholeCollections[collectionName] = remainingRows.length;
  }

  const filteredCollectionSet = new Set(filteredCollections);
  const filteredRows = existingTargetRows
    .filter((item) => filteredCollectionSet.has(item.path.split('/')[0]));
  const nonOperationalFilteredRows = filteredRows
    .filter((item) => !isPostResetOperationalTelemetry(item, resetState.completedAt));
  const remainingPaymentDocuments = filteredRows
    .filter((item) => item.path.startsWith('documentos/') && paymentDocument(item.data))
    .map((item) => item.path)
    .sort();
  const remainingDerivedDocuments = nonOperationalFilteredRows
    .filter((item) => derivedWords.test(derivedSearchText(item.data)))
    .map((item) => item.path)
    .filter((documentPath) => !remainingPaymentDocuments.includes(documentPath))
    .sort();

  const chats = await listDocs(db, 'chats');
  const remainingChatClassState = chats.filter((item) => chatHasClassState(item.data)).map((item) => item.path).sort();
  const remainingChatClassFinancePreviews = chats
    .filter((item) => !isPostResetOperationalTelemetry(item, resetState.completedAt))
    .filter((item) => derivedWords.test(derivedSearchText(item.data.lastMessage)))
    .map((item) => item.path)
    .sort();
  const scheduleRows = nonOperationalTargetRows.filter((item) => belongsToCollection(item, 'programaciones'));
  const messageRows = existingTargetRows.filter((item) => belongsToCollection(item, 'mensajes'));
  const reactionRows = nonOperationalTargetRows.filter((item) => belongsToCollection(item, 'reacciones'));
  const remainingClassFinanceMessages = messageRows
    .filter((item) => !isPostResetOperationalTelemetry(item, resetState.completedAt))
    .filter((item) => derivedWords.test(derivedSearchText(item.data)))
    .map((item) => item.path)
    .sort();
  const lockedFamilies = await db.collection('familias').where('paymentAccessLocked', '==', true).get();
  const remainingLockedFamilies = lockedFamilies.docs.map((doc) => doc.ref.path).sort();

  // The durable plan is the exact deletion set. Batch-getting only those paths
  // avoids rereading unrelated operational collections while independently
  // proving that every planned target is absent.
  const remainingTargetPaths = nonOperationalTargetRows
    .map((item) => item.path)
    .sort();
  const paymentPrefixFiles = await listStorageFiles(bucket, { prefix: 'pagos/' });
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
    && backups.invalidStorageBackupFiles.length === 0
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
    plannedTargetPathsChecked: plannedTargetPaths.length,
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
