#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import admin from 'firebase-admin';
import { buildFamilyPaymentAccessPatch } from '../js/payment-engine.js';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'clasesde10-50add';
const APPLY_TOKEN = 'DELETE_CLASS_FINANCE_DATA';
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const confirmed = process.argv.includes(`--confirm=${APPLY_TOKEN}`);
const simulateFailureAfterCoreDelete = args.has('--simulate-failure-after-core-delete');
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
const scheduleMessageNeedles = [
  'Horario semanal aceptado',
  'Horario semanal fijo propuesto',
  'Horario semanal propuesto',
  'Horario rechazado',
  'Clase puntual aceptada',
  'Clase puntual propuesta',
  'Clase puntual rechazada',
  'clase creada',
];
const derivedWords = /\b(class(?:es)?|clase(?:s)?|attendance|asistencia|schedule|horario|payment|pago(?:s)?|bizum|justificante(?:s)?|impago(?:s)?|cobro(?:s)?|economic(?:o|a|os|as)?|finance|financial|finanzas?|financier(?:o|a|os|as))\b/i;
const financialMessageWords = /(?:\b(?:payment|pago(?:s)?|bizum|justificante(?:s)?|comprobante(?:s)?|impago(?:s)?|cobro(?:s)?|dinero|importe(?:s)?|euro(?:s)?|transferencia(?:s)?|recibo(?:s)?|factura(?:s)?|liquidaci[oó]n(?:es)?|finance|financial|finanzas?|financier(?:o|a|os|as))\b|€)/i;
const trustSnapshotFields = [
  'trustScore', 'trustLevel', 'trustLevelKey', 'trustLevelRank', 'trustLevelLabel',
  'trustVersion', 'trustUpdatedAtIso', 'trustUpdatedAt', 'trustBadges', 'trustWarnings',
  'trustComponents', 'trustSignals', 'trustRiskFlags', 'trustEvidence', 'trustNextActions',
  'trustVisibility', 'reputationMetrics', 'publicTrustStats', 'adminTrustStats',
];

function initFirebase() {
  if (admin.apps.length) return admin.app();
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: PROJECT_ID,
    storageBucket: `${PROJECT_ID}.firebasestorage.app`,
  });
}

function stable(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function') return { __timestamp: value.toDate().toISOString() };
  if (Buffer.isBuffer(value)) return { __bufferBase64: value.toString('base64') };
  if (Array.isArray(value)) return value.map(stable);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stable(item)]));
}

function textOf(value) {
  return JSON.stringify(stable(value) || {}).slice(0, 100000);
}

function normalizeStoragePath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^gs:\/\//i.test(raw)) {
    return raw.replace(/^gs:\/\/[^/]+\//i, '').replace(/^\/+/, '');
  }
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const googleStorageHost = parsed.hostname === 'firebasestorage.googleapis.com'
        || parsed.hostname === 'storage.googleapis.com'
        || parsed.hostname.endsWith('.storage.googleapis.com');
      if (!googleStorageHost) return '';
      const firebaseObject = parsed.pathname.match(/\/o\/([^/?]+)/i);
      if (firebaseObject) return decodeURIComponent(firebaseObject[1]).replace(/^\/+/, '');
      const storageObject = parsed.hostname === 'storage.googleapis.com'
        ? parsed.pathname.replace(/^\/[^/]+\//, '')
        : parsed.pathname.replace(/^\/+/, '');
      return decodeURIComponent(storageObject).replace(/^\/+/, '');
    } catch {
      return '';
    }
  }
  return raw.replace(/^\/+/, '');
}

function storagePathsFromData(data = {}) {
  const values = [
    data.storagePath, data.storage_path, data.path, data.url,
    data.proofPath, data.proof_path, data.receiptPath, data.receipt_path,
    data.proofUrl, data.receiptUrl, data.downloadUrl, data.download_url,
  ];
  for (const list of [data.versions, data.versiones, data.files, data.archivos]) {
    if (!Array.isArray(list)) continue;
    list.forEach((item) => {
      if (item && typeof item === 'object') values.push(...storagePathsFromData(item));
      else values.push(item);
    });
  }
  for (const nested of [data.attachment, data.adjunto, data.receipt, data.recibo, data.proof, data.justificante]) {
    if (nested && typeof nested === 'object') values.push(...storagePathsFromData(nested));
  }
  return Array.from(new Set(values.map(normalizeStoragePath).filter(Boolean)));
}

function paymentDocument(data = {}) {
  const type = String(data.type || data.tipo || data.documentType || '').toLowerCase();
  const source = String(data.source || data.origen || '').toLowerCase();
  const storagePaths = storagePathsFromData(data).map((item) => item.toLowerCase());
  return ['justificante_pago', 'pago', 'payment_receipt', 'receipt'].includes(type)
    || source.includes('familia_pago')
    || storagePaths.some((storagePath) => storagePath.startsWith('pagos/') || storagePath.includes('/pagos/'));
}

function directReferenceIds(data = {}) {
  return [
    data.classId, data.class_id, data.clase_id, data.paymentId, data.payment_id,
    data.pago_id, data.documentId, data.documento_id, data.scheduleProposalId,
  ].filter((value) => value !== undefined && value !== null && value !== '').map(String);
}

function scheduleMessageText(value) {
  const body = String(value || '').trim().toLowerCase();
  return Boolean(body) && scheduleMessageNeedles.some((needle) => body.includes(needle.toLowerCase()));
}

function classFinanceMessageText(value) {
  return scheduleMessageText(value) || financialMessageWords.test(String(value || ''));
}

function shouldDeleteFiltered(collectionName, doc, context) {
  const data = doc.data() || {};
  if (collectionName === 'documentos') return paymentDocument(data);
  if (collectionName === 'busySlots') {
    return Boolean(data.classId || data.class_id || data.clase_id || data.calendarUid)
      || derivedWords.test(String(data.source || data.type || data.kind || data.status || ''));
  }
  if (['documentBlobs', 'documentBlobChunks'].includes(collectionName)) {
    const documentId = String(data.documentId || data.documento_id || data.parentDocumentId || '');
    return context.paymentDocumentIds.has(documentId) || paymentDocument(data);
  }
  if (directReferenceIds(data).some((id) => context.classIds.has(id) || context.paymentIds.has(id) || context.paymentDocumentIds.has(id))) return true;
  return derivedWords.test(textOf(data));
}

async function listDocs(db, collectionName) {
  const snap = await db.collection(collectionName).get();
  return snap.docs;
}

function setFrom(values = []) {
  return new Set(Array.from(values || []).map(String).filter(Boolean));
}

function resetContext(seed = {}) {
  return {
    classIds: setFrom(seed.classIds),
    paymentIds: setFrom(seed.paymentIds),
    paymentDocumentIds: setFrom(seed.paymentDocumentIds),
    chatMessageIds: setFrom(seed.chatMessageIds),
    storagePaths: setFrom(seed.storagePaths),
  };
}

function serializableContext(context = {}) {
  return {
    classIds: Array.from(context.classIds || []).sort(),
    paymentIds: Array.from(context.paymentIds || []).sort(),
    paymentDocumentIds: Array.from(context.paymentDocumentIds || []).sort(),
    chatMessageIds: Array.from(context.chatMessageIds || []).sort(),
    storagePaths: Array.from(context.storagePaths || []).sort(),
  };
}

function safeFirestoreDocumentPath(value) {
  const documentPath = String(value || '').trim();
  const segments = documentPath.split('/').filter(Boolean);
  if (!documentPath || segments.length < 2 || segments.length % 2 !== 0 || segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`Unsafe Firestore recovery path: ${documentPath}`);
  }
  return segments.join('/');
}

async function loadResetState() {
  try {
    const state = JSON.parse(await fs.readFile(resetStatePath, 'utf8'));
    if (state.projectId !== PROJECT_ID || !['prepared', 'completed'].includes(state.status)) return null;
    return {
      ...state,
      targetPaths: Array.from(new Set((state.targetPaths || []).map(safeFirestoreDocumentPath))),
      storagePaths: Array.from(new Set((state.storagePaths || []).map(normalizeStoragePath).filter(Boolean))),
      context: serializableContext(resetContext(state.context)),
      backupPaths: Array.from(new Set((state.backupPaths || []).map(String).filter(Boolean))),
      backupDirectories: Array.from(new Set((state.backupDirectories || []).map(String).filter(Boolean))),
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeResetState(state) {
  await fs.mkdir(backupRoot, { recursive: true });
  await fs.writeFile(resetStatePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function collectTargets(db, seedContext = {}) {
  const targets = new Map();
  const context = resetContext(seedContext);
  const add = (doc) => targets.set(doc.ref.path, doc);

  for (const collectionName of wholeCollections) {
    const docs = await listDocs(db, collectionName);
    docs.forEach(add);
    if (collectionName === 'clases') docs.forEach((doc) => context.classIds.add(doc.id));
    if (collectionName === 'pagos') docs.forEach((doc) => {
      context.paymentIds.add(doc.id);
      storagePathsFromData(doc.data()).forEach((storagePath) => context.storagePaths.add(storagePath));
    });
  }

  const paymentDocs = await listDocs(db, 'documentos');
  paymentDocs.filter((doc) => paymentDocument(doc.data())).forEach((doc) => {
    add(doc);
    context.paymentDocumentIds.add(doc.id);
    storagePathsFromData(doc.data()).forEach((storagePath) => context.storagePaths.add(storagePath));
  });

  for (const collectionName of filteredCollections.filter((name) => name !== 'documentos')) {
    const docs = await listDocs(db, collectionName);
    docs.filter((doc) => shouldDeleteFiltered(collectionName, doc, context)).forEach(add);
  }

  const proposals = await db.collectionGroup('programaciones').get();
  proposals.docs.forEach(add);
  const messages = await db.collectionGroup('mensajes').get();
  const derivedMessages = messages.docs.filter((doc) => {
    const data = doc.data() || {};
    return classFinanceMessageText(textOf(data))
      || directReferenceIds(data).some((id) => context.classIds.has(id) || context.paymentIds.has(id));
  });
  derivedMessages.forEach((doc) => {
    add(doc);
    context.chatMessageIds.add(doc.id);
    storagePathsFromData(doc.data()).forEach((storagePath) => context.storagePaths.add(storagePath));
  });
  const reactions = await db.collectionGroup('reacciones').get();
  reactions.docs.filter((doc) => {
    const data = doc.data() || {};
    const messageId = String(data.messageId || data.message_id || '');
    return context.chatMessageIds.has(messageId)
      || Array.from(context.chatMessageIds).some((id) => doc.id === id || doc.id.startsWith(`${id}_`));
  }).forEach(add);

  return { targets: Array.from(targets.values()), context };
}

async function storageTargets(bucket, explicitPaths) {
  const paths = new Set(explicitPaths);
  const [files] = await bucket.getFiles({ prefix: 'pagos/' });
  files.forEach((file) => paths.add(file.name));
  return Array.from(paths).filter(Boolean).sort();
}

async function writeBackup(bucket, targets, storagePaths, chatDocs, familyDocs, professorDocs) {
  await fs.mkdir(backupRoot, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDirectory = path.join(backupRoot, `class-finance-reset-${stamp}`);
  const storageBackupDirectory = path.join(backupDirectory, 'storage');
  const backupPath = path.join(backupDirectory, 'firestore-and-storage-manifest.json');
  await fs.mkdir(storageBackupDirectory, { recursive: true });
  const storageFiles = [];
  for (const storagePath of storagePaths) {
    const destination = path.resolve(storageBackupDirectory, ...storagePath.split('/').filter(Boolean));
    const expectedRoot = `${path.resolve(storageBackupDirectory)}${path.sep}`;
    if (!destination.startsWith(expectedRoot)) throw new Error(`Unsafe Storage backup path: ${storagePath}`);
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      storageFiles.push({ path: storagePath, existed: false });
      continue;
    }
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await file.download({ destination });
    const [metadata] = await file.getMetadata();
    storageFiles.push({
      path: storagePath,
      existed: true,
      localRelativePath: path.relative(backupDirectory, destination),
      size: Number(metadata.size || 0),
      contentType: metadata.contentType || '',
      md5Hash: metadata.md5Hash || '',
    });
  }
  const payload = {
    projectId: PROJECT_ID,
    createdAt: new Date().toISOString(),
    scope: 'classes, payments, payment receipts, schedules, class/payment derived data',
    firestoreDocuments: targets.map((doc) => ({ path: doc.ref.path, data: stable(doc.data()) })),
    storagePaths,
    storageFiles,
    chatDocumentsBeforeReset: chatDocs.map((doc) => ({ path: doc.ref.path, data: stable(doc.data()) })),
    familyProfilesBeforeDerivedReset: familyDocs.map((doc) => ({ path: doc.ref.path, data: stable(doc.data()) })),
    professorProfilesBeforeDerivedReset: professorDocs.map((doc) => ({ path: doc.ref.path, data: stable(doc.data()) })),
  };
  await fs.writeFile(backupPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return {
    backupPath,
    backupDirectory,
    backedUpStorageFiles: storageFiles.filter((file) => file.existed).length,
  };
}

async function deleteFirestoreTargets(db, targets) {
  const writer = db.bulkWriter();
  let deleted = 0;
  writer.onWriteError((error) => error.failedAttempts < 4);
  targets.forEach((doc) => {
    writer.delete(doc.ref);
    deleted += 1;
  });
  await writer.close();
  return deleted;
}

async function resetProfilesAndChats(db, chatDocs, familyDocs, professorDocs) {
  const writer = db.bulkWriter();
  writer.onWriteError((error) => error.failedAttempts < 4);
  const deletedField = admin.firestore.FieldValue.delete();
  const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();
  chatDocs.forEach((doc) => {
    const data = doc.data() || {};
    const previewReset = classFinanceMessageText(data.lastMessage) ? {
      lastMessage: deletedField,
      lastMessageAt: deletedField,
      lastMessageByUid: deletedField,
      lastMessageId: deletedField,
      lastMessageType: deletedField,
    } : {};
    writer.set(doc.ref, {
      ...previewReset,
      activeClassId: null,
      activeClassIds: [],
      classSeriesId: null,
      seriesEndDate: null,
      schedulingStatus: 'pendiente_horario',
      relationshipStage: 'pendiente_horario',
      lastRelationshipEvent: 'class_finance_data_reset',
      relationshipUpdatedAt: serverTimestamp,
      updatedAt: serverTimestamp,
    }, { merge: true });
  });
  familyDocs.forEach((doc) => {
    const trustReset = Object.fromEntries(trustSnapshotFields.map((field) => [field, deletedField]));
    writer.set(doc.ref, {
      ...trustReset,
      ...buildFamilyPaymentAccessPatch({ locked: false }),
      updatedAt: serverTimestamp,
    }, { merge: true });
  });
  professorDocs.forEach((doc) => {
    const trustReset = Object.fromEntries(trustSnapshotFields.map((field) => [field, deletedField]));
    writer.set(doc.ref, { ...trustReset, updatedAt: serverTimestamp }, { merge: true });
  });
  await writer.close();
  return { chatsReset: chatDocs.length, familiesReset: familyDocs.length, professorsReset: professorDocs.length };
}

async function deleteStorageFiles(bucket, paths) {
  const results = await Promise.all(paths.map(async (filePath) => {
    await bucket.file(filePath).delete({ ignoreNotFound: true });
    return filePath;
  }));
  return results.length;
}

async function verify(db, bucket, deletedStoragePaths = []) {
  const remaining = {};
  for (const collectionName of wholeCollections) {
    const snap = await db.collection(collectionName).limit(1).get();
    remaining[collectionName] = snap.size;
  }
  const remainingPaymentDocs = (await listDocs(db, 'documentos')).filter((doc) => paymentDocument(doc.data())).length;
  const { targets: remainingDerivedTargets } = await collectTargets(db);
  const remainingChatDocs = await listDocs(db, 'chats');
  const remainingChatClassState = remainingChatDocs.filter((doc) => {
    const data = doc.data() || {};
    return Boolean(data.activeClassId || data.classSeriesId || data.seriesEndDate)
      || (Array.isArray(data.activeClassIds) && data.activeClassIds.length > 0);
  });
  const remainingChatClassFinancePreviews = remainingChatDocs.filter((doc) => classFinanceMessageText(doc.data()?.lastMessage));
  const remainingLockedFamilies = (await listDocs(db, 'familias')).filter((doc) => doc.data()?.paymentAccessLocked === true);
  const [remainingPaymentPrefixStorage] = await bucket.getFiles({ prefix: 'pagos/' });
  const explicitlyRemainingStorage = [];
  for (const storagePath of deletedStoragePaths) {
    const [exists] = await bucket.file(storagePath).exists();
    if (exists) explicitlyRemainingStorage.push(storagePath);
  }
  const remainingStoragePaths = Array.from(new Set([
    ...remainingPaymentPrefixStorage.map((file) => file.name),
    ...explicitlyRemainingStorage,
  ])).sort();
  return {
    remaining,
    remainingPaymentDocuments: remainingPaymentDocs,
    remainingDerivedTargets: remainingDerivedTargets.map((doc) => doc.ref.path),
    remainingChatClassState: remainingChatClassState.map((doc) => doc.ref.path),
    remainingChatClassFinancePreviews: remainingChatClassFinancePreviews.map((doc) => doc.ref.path),
    remainingLockedFamilies: remainingLockedFamilies.map((doc) => doc.ref.path),
    remainingPaymentStorageFiles: remainingStoragePaths.length,
    remainingPaymentStoragePaths: remainingStoragePaths,
    clean: Object.values(remaining).every((count) => count === 0)
      && remainingPaymentDocs === 0
      && remainingDerivedTargets.length === 0
      && remainingChatClassState.length === 0
      && remainingChatClassFinancePreviews.length === 0
      && remainingLockedFamilies.length === 0
      && remainingStoragePaths.length === 0,
  };
}

async function main() {
  if (apply && !confirmed) throw new Error(`Apply mode requires --confirm=${APPLY_TOKEN}`);
  if (simulateFailureAfterCoreDelete && (!process.env.FIRESTORE_EMULATOR_HOST || !PROJECT_ID.startsWith('demo-'))) {
    throw new Error('Failure simulation is restricted to a demo-* Firestore emulator project.');
  }
  initFirebase();
  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  const existingState = apply ? await loadResetState() : null;
  if (existingState?.status === 'completed') {
    const verification = await verify(db, bucket, existingState.storagePaths);
    if (!verification.clean) {
      throw new Error('The class/finance reset was already completed; refusing to delete data created afterwards.');
    }
    console.log(JSON.stringify({
      ok: true,
      mode: 'apply',
      projectId: PROJECT_ID,
      alreadyCompleted: true,
      resetStatePath,
      backupPaths: existingState.backupPaths,
      backupDirectories: existingState.backupDirectories,
      verification,
    }, null, 2));
    return;
  }
  const recoveryState = existingState?.status === 'prepared' ? existingState : null;
  const recoveredContext = resetContext(recoveryState?.context);
  (recoveryState?.storagePaths || []).forEach((storagePath) => recoveredContext.storagePaths.add(storagePath));
  const [{ targets, context }, chatDocs, familyDocs, professorDocs] = await Promise.all([
    collectTargets(db, recoveredContext),
    listDocs(db, 'chats'),
    listDocs(db, 'familias'),
    listDocs(db, 'profesores'),
  ]);
  const storagePaths = await storageTargets(bucket, context.storagePaths);
  const plannedTargets = new Map();
  (recoveryState?.targetPaths || []).forEach((documentPath) => {
    const safePath = safeFirestoreDocumentPath(documentPath);
    plannedTargets.set(safePath, { ref: db.doc(safePath), data: () => ({}) });
  });
  targets.forEach((doc) => plannedTargets.set(doc.ref.path, doc));
  const targetsToDelete = Array.from(plannedTargets.values());
  const countsByCollection = targets.reduce((counts, doc) => {
    const collection = doc.ref.parent.id;
    counts[collection] = (counts[collection] || 0) + 1;
    return counts;
  }, {});
  const inventory = {
    ok: true,
    mode: apply ? 'apply' : 'dry-run',
    projectId: PROJECT_ID,
    firestoreTargets: targets.length,
    plannedFirestoreTargets: targetsToDelete.length,
    recoveredFromPreparedReset: Boolean(recoveryState),
    countsByCollection,
    paymentStorageTargets: storagePaths.length,
    chatsToReset: chatDocs.length,
    familyProfilesToReset: familyDocs.length,
    professorProfilesToReset: professorDocs.length,
  };
  if (!apply) {
    console.log(JSON.stringify(inventory, null, 2));
    return;
  }
  const backup = await writeBackup(bucket, targets, storagePaths, chatDocs, familyDocs, professorDocs);
  const preparedState = {
    version: 1,
    projectId: PROJECT_ID,
    status: 'prepared',
    startedAt: recoveryState?.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attempts: Number(recoveryState?.attempts || 0) + 1,
    targetPaths: Array.from(plannedTargets.keys()).sort(),
    storagePaths,
    context: serializableContext(context),
    backupPaths: Array.from(new Set([...(recoveryState?.backupPaths || []), backup.backupPath])),
    backupDirectories: Array.from(new Set([...(recoveryState?.backupDirectories || []), backup.backupDirectory])),
  };
  await writeResetState(preparedState);
  if (simulateFailureAfterCoreDelete) {
    const coreCollections = new Set(['clases', 'pagos', 'paymentSchedules', 'classLifecycleEvents', 'metricSnapshots', 'analyticsDailyRollups', 'resumenMensual']);
    const coreTargets = targetsToDelete.filter((doc) => coreCollections.has(doc.ref.parent.id));
    await deleteFirestoreTargets(db, coreTargets);
    throw new Error('Simulated failure after core Firestore deletion.');
  }
  const deletedFirestoreDocuments = await deleteFirestoreTargets(db, targetsToDelete);
  const profileReset = await resetProfilesAndChats(db, chatDocs, familyDocs, professorDocs);
  const deletedStorageFiles = await deleteStorageFiles(bucket, storagePaths);
  const verification = await verify(db, bucket, storagePaths);
  if (verification.clean) {
    await writeResetState({
      ...preparedState,
      status: 'completed',
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      verification,
    });
  }
  console.log(JSON.stringify({
    ...inventory,
    ...backup,
    backupPaths: preparedState.backupPaths,
    backupDirectories: preparedState.backupDirectories,
    resetStatePath,
    deletedFirestoreDocuments,
    deletedStorageFiles,
    ...profileReset,
    verification,
  }, null, 2));
  if (!verification.clean) process.exitCode = 2;
}

export { derivedWords, normalizeStoragePath, paymentDocument, storagePathsFromData };

const launchedDirectly = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (launchedDirectly) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || error);
    if (error?.code || error?.details || error?.metadata) {
      console.error(JSON.stringify({
        code: error.code,
        details: error.details,
        metadata: error.metadata?.getMap ? error.metadata.getMap() : error.metadata,
      }, null, 2));
    }
    process.exit(1);
  });
}
