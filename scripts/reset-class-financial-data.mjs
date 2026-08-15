#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import admin from 'firebase-admin';
import { buildFamilyPaymentAccessPatch } from '../js/payment-engine.js';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'clasesde10-50add';
const APPLY_TOKEN = 'DELETE_CLASS_FINANCE_DATA';
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const confirmed = process.argv.includes(`--confirm=${APPLY_TOKEN}`);
const backupRoot = path.resolve(process.cwd(), '..', 'migration-private', 'backups');
const wholeCollections = [
  'clases',
  'pagos',
  'paymentSchedules',
  'classLifecycleEvents',
  'metricSnapshots',
  'analyticsDailyRollups',
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
];
const scheduleMessageNeedles = [
  'Horario semanal aceptado',
  'Horario semanal fijo propuesto',
  'Horario semanal propuesto',
  'Clase puntual aceptada',
  'Clase puntual propuesta',
  'clase creada',
];
const derivedWords = /(class|clase|attendance|asistencia|schedule|horario|payment|pago|bizum|justificante|impago|cobro|economic|financ)/i;
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

function paymentDocument(data = {}) {
  const type = String(data.type || data.tipo || data.documentType || '').toLowerCase();
  const source = String(data.source || data.origen || '').toLowerCase();
  const storagePath = String(data.storagePath || data.storage_path || data.path || data.url || '').toLowerCase();
  return ['justificante_pago', 'pago', 'payment_receipt', 'receipt'].includes(type)
    || source.includes('familia_pago')
    || storagePath.startsWith('pagos/')
    || storagePath.includes('/pagos/');
}

function directReferenceIds(data = {}) {
  return [
    data.classId, data.class_id, data.clase_id, data.paymentId, data.payment_id,
    data.pago_id, data.documentId, data.documento_id, data.scheduleProposalId,
  ].filter((value) => value !== undefined && value !== null && value !== '').map(String);
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

async function collectTargets(db) {
  const targets = new Map();
  const context = {
    classIds: new Set(),
    paymentIds: new Set(),
    paymentDocumentIds: new Set(),
    storagePaths: new Set(),
  };
  const add = (doc) => targets.set(doc.ref.path, doc);

  for (const collectionName of wholeCollections) {
    const docs = await listDocs(db, collectionName);
    docs.forEach(add);
    if (collectionName === 'clases') docs.forEach((doc) => context.classIds.add(doc.id));
    if (collectionName === 'pagos') docs.forEach((doc) => context.paymentIds.add(doc.id));
  }

  const paymentDocs = await listDocs(db, 'documentos');
  paymentDocs.filter((doc) => paymentDocument(doc.data())).forEach((doc) => {
    add(doc);
    context.paymentDocumentIds.add(doc.id);
    const data = doc.data() || {};
    const storagePath = data.storagePath || data.storage_path || data.path || data.url;
    if (storagePath && !/^https?:/i.test(String(storagePath))) {
      const normalizedPath = String(storagePath)
        .replace(/^gs:\/\/[^/]+\//i, '')
        .replace(/^\/+/, '');
      if (normalizedPath) context.storagePaths.add(normalizedPath);
    }
  });

  for (const collectionName of filteredCollections.filter((name) => name !== 'documentos')) {
    const docs = await listDocs(db, collectionName);
    docs.filter((doc) => shouldDeleteFiltered(collectionName, doc, context)).forEach(add);
  }

  const proposals = await db.collectionGroup('programaciones').get();
  proposals.docs.forEach(add);
  const messages = await db.collectionGroup('mensajes').get();
  messages.docs.filter((doc) => {
    const data = doc.data() || {};
    const body = String(data.body || data.text || data.message || '');
    return scheduleMessageNeedles.some((needle) => body.includes(needle))
      || directReferenceIds(data).some((id) => context.classIds.has(id) || context.paymentIds.has(id));
  }).forEach(add);

  return { targets: Array.from(targets.values()), context };
}

async function storageTargets(bucket, explicitPaths) {
  const paths = new Set(explicitPaths);
  const [files] = await bucket.getFiles({ prefix: 'pagos/' }).catch(() => [[]]);
  files.forEach((file) => paths.add(file.name));
  return Array.from(paths).filter(Boolean).sort();
}

async function writeBackup(targets, storagePaths, chatDocs, familyDocs, professorDocs) {
  await fs.mkdir(backupRoot, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupRoot, `class-finance-reset-${stamp}.json`);
  const payload = {
    projectId: PROJECT_ID,
    createdAt: new Date().toISOString(),
    scope: 'classes, payments, payment receipts, schedules, class/payment derived data',
    firestoreDocuments: targets.map((doc) => ({ path: doc.ref.path, data: stable(doc.data()) })),
    storagePaths,
    chatDocumentsBeforeReset: chatDocs.map((doc) => ({ path: doc.ref.path, data: stable(doc.data()) })),
    familyProfilesBeforeDerivedReset: familyDocs.map((doc) => ({ path: doc.ref.path, data: stable(doc.data()) })),
    professorProfilesBeforeDerivedReset: professorDocs.map((doc) => ({ path: doc.ref.path, data: stable(doc.data()) })),
  };
  await fs.writeFile(backupPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return backupPath;
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
  chatDocs.forEach((doc) => writer.set(doc.ref, {
    activeClassId: null,
    activeClassIds: [],
    classSeriesId: null,
    seriesEndDate: null,
    schedulingStatus: 'pendiente_horario',
    relationshipStage: 'pendiente_horario',
    lastRelationshipEvent: 'class_finance_data_reset',
    relationshipUpdatedAt: serverTimestamp,
    updatedAt: serverTimestamp,
  }, { merge: true }));
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

async function verify(db, bucket) {
  const remaining = {};
  for (const collectionName of ['clases', 'pagos', 'paymentSchedules', 'classLifecycleEvents', 'metricSnapshots', 'analyticsDailyRollups']) {
    const snap = await db.collection(collectionName).limit(1).get();
    remaining[collectionName] = snap.size;
  }
  const remainingPaymentDocs = (await listDocs(db, 'documentos')).filter((doc) => paymentDocument(doc.data())).length;
  const { targets: remainingDerivedTargets } = await collectTargets(db);
  const remainingChatClassState = (await listDocs(db, 'chats')).filter((doc) => {
    const data = doc.data() || {};
    return Boolean(data.activeClassId || data.classSeriesId || data.seriesEndDate)
      || (Array.isArray(data.activeClassIds) && data.activeClassIds.length > 0);
  });
  const remainingLockedFamilies = (await listDocs(db, 'familias')).filter((doc) => doc.data()?.paymentAccessLocked === true);
  const [remainingStorage] = await bucket.getFiles({ prefix: 'pagos/', maxResults: 1 }).catch(() => [[]]);
  return {
    remaining,
    remainingPaymentDocuments: remainingPaymentDocs,
    remainingDerivedTargets: remainingDerivedTargets.map((doc) => doc.ref.path),
    remainingChatClassState: remainingChatClassState.map((doc) => doc.ref.path),
    remainingLockedFamilies: remainingLockedFamilies.map((doc) => doc.ref.path),
    remainingPaymentStorageFiles: remainingStorage.length,
    clean: Object.values(remaining).every((count) => count === 0)
      && remainingPaymentDocs === 0
      && remainingDerivedTargets.length === 0
      && remainingChatClassState.length === 0
      && remainingLockedFamilies.length === 0
      && remainingStorage.length === 0,
  };
}

async function main() {
  if (apply && !confirmed) throw new Error(`Apply mode requires --confirm=${APPLY_TOKEN}`);
  initFirebase();
  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  const [{ targets, context }, chatDocs, familyDocs, professorDocs] = await Promise.all([
    collectTargets(db),
    listDocs(db, 'chats'),
    listDocs(db, 'familias'),
    listDocs(db, 'profesores'),
  ]);
  const storagePaths = await storageTargets(bucket, context.storagePaths);
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
  const backupPath = await writeBackup(targets, storagePaths, chatDocs, familyDocs, professorDocs);
  const deletedFirestoreDocuments = await deleteFirestoreTargets(db, targets);
  const profileReset = await resetProfilesAndChats(db, chatDocs, familyDocs, professorDocs);
  const deletedStorageFiles = await deleteStorageFiles(bucket, storagePaths);
  const verification = await verify(db, bucket);
  console.log(JSON.stringify({
    ...inventory,
    backupPath,
    deletedFirestoreDocuments,
    deletedStorageFiles,
    ...profileReset,
    verification,
  }, null, 2));
  if (!verification.clean) process.exitCode = 2;
}

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
