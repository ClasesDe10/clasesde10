import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import admin from 'firebase-admin';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || '';
const firestoreHost = String(process.env.FIRESTORE_EMULATOR_HOST || '').trim();
const rawStorageHost = String(process.env.STORAGE_EMULATOR_HOST || process.env.FIREBASE_STORAGE_EMULATOR_HOST || '').trim();

assert(PROJECT_ID.startsWith('demo-'), 'The destructive integration test only runs against a demo-* project.');
assert(firestoreHost, 'FIRESTORE_EMULATOR_HOST is required.');
assert(rawStorageHost, 'A Storage emulator host is required.');

const storageHost = /^https?:\/\//i.test(rawStorageHost) ? rawStorageHost : `http://${rawStorageHost}`;
process.env.STORAGE_EMULATOR_HOST = storageHost;

const workspace = path.resolve(process.cwd());
const backupRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cd10-reset-emulator-'));

function initializeFirebase() {
  if (admin.apps.length) return admin.app();
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: PROJECT_ID,
    storageBucket: `${PROJECT_ID}.firebasestorage.app`,
  });
}

async function setDocument(db, documentPath, data) {
  await db.doc(documentPath).set(data);
}

async function documentExists(db, documentPath) {
  return (await db.doc(documentPath).get()).exists;
}

async function collectionSize(db, collectionPath) {
  return (await db.collection(collectionPath).get()).size;
}

async function seed(db, bucket) {
  const targetDocuments = {
    'clases/class_past': {
      familyUid: 'family_1',
      teacherUid: 'teacher_1',
      studentId: 'student_1',
      date: '2026-07-10',
      amount: 40,
      status: 'realizada',
    },
    'clases/class_future': {
      familyUid: 'family_1',
      teacherUid: 'teacher_1',
      studentId: 'student_1',
      date: '2026-09-10',
      amount: 45,
      status: 'confirmada',
    },
    'pagos/payment_1': {
      paymentType: 'family_payment',
      classIds: ['class_past'],
      amount: 40,
      status: 'pendiente',
      storagePath: 'pagos/family_1/receipt.txt',
    },
    'paymentSchedules/schedule_1': {
      familyUid: 'family_1',
      teacherUid: 'teacher_1',
      frequency: 'semanal',
      active: true,
    },
    'classLifecycleEvents/event_1': { classId: 'class_past', type: 'class.completed' },
    'metricSnapshots/snapshot_1': { payments: { pending: 1 }, classes: { total: 2 } },
    'analyticsDailyRollups/2026-07-10': { payments: 1, classes: 2, revenue: 40 },
    'resumenMensual/2026-07': { ingresos: 40, clases: 2 },
    'platformHealthChecks/health_1': { what: '1 pago pendiente', status: 'attention' },
    'preventiveRiskSnapshots/risk_snapshot_1': { classes: 2 },
    'alertPrioritySnapshots/alert_snapshot_1': { payments: 1 },
    'platformSupervisionSnapshots/supervision_snapshot_1': { classes: 2 },
    'relationshipFollowupSnapshots/followup_snapshot_1': { classId: 'class_past' },
    'proactiveAssistSnapshots/assist_snapshot_1': { paymentReadiness: 1 },
    'internalAiInsightSnapshots/ai_snapshot_1': { paymentIssues: 1 },
    'documentos/payment_receipt': {
      type: 'justificante_pago',
      paymentId: 'payment_1',
      storagePath: 'pagos/family_1/receipt.txt',
      versions: [{ storagePath: 'receipts/historical-proof.txt' }],
    },
    'documentBlobs/payment_blob': { documentId: 'payment_receipt', bytes: 'receipt' },
    'documentBlobChunks/payment_chunk': { documentId: 'payment_receipt', index: 0, bytes: 'receipt' },
    'busySlots/class_slot': { classId: 'class_future', source: 'class' },
    'notificaciones/payment_notice': { type: 'family_payment_pending', message: 'Pago pendiente' },
    'incidencias/payment_incident': { classId: 'class_past', description: 'Revisar cobro' },
    'analyticsEvents/payment_event': { event: 'payment.created', paymentId: 'payment_1' },
    'automationEvents/payment_automation': { type: 'payment.reminder', paymentId: 'payment_1' },
    'automationRuleRuns/payment_rule': { trigger: 'payment.overdue', paymentId: 'payment_1' },
    'auditLogs/payment_audit': { module: 'payments', entityId: 'payment_1' },
    'opsAlerts/payment_alert': { type: 'overdue_payments', paymentId: 'payment_1' },
    'crmTasks/payment_task': { title: 'Revisar pago familiar', paymentId: 'payment_1' },
    'systemJobs/payment_job': { type: 'payment.request_for_class', classId: 'class_past' },
    'deadLetters/payment_dead_letter': { type: 'payment.request_for_class', classId: 'class_past' },
    'preventiveRisks/payment_risk': { type: 'payment_overdue', paymentId: 'payment_1' },
    'alertDecisions/payment_decision': { category: 'payment', paymentId: 'payment_1' },
    'platformSupervisionFindings/payment_finding': { type: 'payment_missing', classId: 'class_past' },
    'relationshipFollowups/class_followup': { type: 'prepare_first_class', classId: 'class_future' },
    'proactiveAssistSignals/payment_signal': { type: 'payment_readiness', paymentId: 'payment_1' },
    'internalAiInsights/payment_insight': { category: 'payment', paymentId: 'payment_1' },
    'adminAiQueries/payment_query': { query: 'Pagos pendientes', paymentId: 'payment_1' },
    'crmNotes/payment_note': { body: 'Seguimiento del pago pendiente', paymentId: 'payment_1' },
    'importAudits/class_import': { description: 'Importacion de clases y pagos historicos' },
    'legacyImports/payment_legacy': { classId: 'class_past', source: 'legacy' },
    'chats/chat_1/programaciones/proposal_1': {
      type: 'weekly_schedule',
      classResetGeneration: 'old-generation',
    },
    'chats/chat_1/mensajes/schedule_message': { body: 'Horario semanal aceptado', classId: 'class_future' },
    'chats/chat_1/mensajes/payment_attachment': {
      body: 'Justificante de pago adjunto',
      attachment: {
        kind: 'file',
        name: 'justificante-bizum.pdf',
        mimeType: 'application/pdf',
        storagePath: 'chats/chat_1/family_1/justificante-bizum.pdf',
      },
    },
    'chats/chat_1/reacciones/payment_attachment_family_1': {
      messageId: 'payment_attachment',
      uid: 'family_1',
      emoji: '👍',
    },
  };
  const preservedDocuments = {
    'documentos/identity_document': { type: 'dni', storagePath: 'documents/identity.txt' },
    'documentBlobs/identity_blob': { documentId: 'identity_document', bytes: 'identity' },
    'documentBlobChunks/identity_chunk': { documentId: 'identity_document', index: 0, bytes: 'identity' },
    'busySlots/manual_slot': { source: 'manual_availability', weekday: 2 },
    'notificaciones/profile_notice': { type: 'profile_complete', message: 'Todo correcto' },
    'incidencias/login_incident': { category: 'login', description: 'No puedo entrar' },
    'importAudits/contact_import': { description: 'Contactos importados' },
    'legacyImports/user_legacy': { source: 'usuarios', rows: 1 },
    'chats/chat_1/mensajes/hello_message': { body: 'Hola, encantado' },
    'chats/chat_2/mensajes/normal_attachment': {
      body: 'Archivo: apuntes.pdf',
      attachment: {
        kind: 'file',
        name: 'apuntes.pdf',
        mimeType: 'application/pdf',
        storagePath: 'chats/chat_2/family_1/apuntes.pdf',
      },
    },
  };

  await Promise.all([
    ...Object.entries(targetDocuments).map(([documentPath, data]) => setDocument(db, documentPath, data)),
    ...Object.entries(preservedDocuments).map(([documentPath, data]) => setDocument(db, documentPath, data)),
    setDocument(db, 'chats/chat_1', {
      familyUid: 'family_1',
      teacherUid: 'teacher_1',
      activeClassId: 'class_future',
      activeClassIds: ['class_past', 'class_future'],
      classSeriesId: 'series_1',
      seriesEndDate: '2026-09-30',
      lastMessage: 'Horario semanal aceptado. Se han creado 2 clases hasta septiembre.',
      lastMessageId: 'schedule_message',
      lastMessageByUid: 'family_1',
      lastMessageType: 'text',
      lastMessageAt: '2026-08-15T12:00:00.000Z',
      crmLabel: 'Relacion conservada',
    }),
    setDocument(db, 'chats/chat_2', {
      familyUid: 'family_1',
      teacherUid: 'teacher_1',
      lastMessage: 'Hola, este mensaje normal debe conservarse.',
      lastMessageId: 'normal_message',
      lastMessageByUid: 'family_1',
      lastMessageType: 'text',
      lastMessageAt: '2026-08-15T11:00:00.000Z',
      crmLabel: 'Otra relacion conservada',
    }),
    setDocument(db, 'chats/chat_2/mensajes/normal_message', {
      body: 'Hola, este mensaje normal debe conservarse.',
      senderUid: 'family_1',
      createdAt: '2026-08-15T11:00:00.000Z',
    }),
    setDocument(db, 'familias/family_1', {
      nombre: 'Maria',
      apellidos: 'Garcia Lopez',
      childIds: ['student_1'],
      crmStatus: 'seguimiento',
      trustScore: 82,
      trustBadges: ['puntual'],
      reputationMetrics: { overdueClassPayments: 1 },
      paymentAccessLocked: true,
      paymentAccessStatus: 'blocked_overdue_payment',
      paymentAccessDebtAmount: 40,
      paymentAccessDebtClassIds: ['class_past'],
    }),
    setDocument(db, 'profesores/teacher_1', {
      nombre: 'Luis',
      apellidos: 'Perez Martin',
      subjects: ['Matematicas'],
      trustScore: 91,
      trustWarnings: ['class_payment_pending'],
    }),
  ]);

  await Promise.all([
    bucket.file('pagos/family_1/receipt.txt').save('current receipt'),
    bucket.file('receipts/historical-proof.txt').save('historical receipt'),
    bucket.file('chats/chat_1/family_1/justificante-bizum.pdf').save('chat payment receipt'),
    bucket.file('chats/chat_2/family_1/apuntes.pdf').save('normal chat attachment'),
    bucket.file('documents/identity.txt').save('identity document'),
  ]);
}

async function assertReset(db, bucket, result, manifests) {
  for (const collectionName of [
    'clases',
    'pagos',
    'paymentSchedules',
    'classLifecycleEvents',
    'metricSnapshots',
    'analyticsDailyRollups',
    'resumenMensual',
    'platformHealthChecks',
    'preventiveRiskSnapshots',
    'alertPrioritySnapshots',
    'platformSupervisionSnapshots',
    'relationshipFollowupSnapshots',
    'proactiveAssistSnapshots',
    'internalAiInsightSnapshots',
  ]) {
    assert.equal(await collectionSize(db, collectionName), 0, `${collectionName} must be empty.`);
  }

  for (const deletedPath of [
    'documentos/payment_receipt',
    'documentBlobs/payment_blob',
    'documentBlobChunks/payment_chunk',
    'busySlots/class_slot',
    'notificaciones/payment_notice',
    'incidencias/payment_incident',
    'importAudits/class_import',
    'legacyImports/payment_legacy',
    'chats/chat_1/programaciones/proposal_1',
    'chats/chat_1/mensajes/schedule_message',
    'chats/chat_1/mensajes/payment_attachment',
    'chats/chat_1/reacciones/payment_attachment_family_1',
  ]) {
    assert.equal(await documentExists(db, deletedPath), false, `${deletedPath} must be deleted.`);
  }

  for (const preservedPath of [
    'documentos/identity_document',
    'documentBlobs/identity_blob',
    'documentBlobChunks/identity_chunk',
    'busySlots/manual_slot',
    'notificaciones/profile_notice',
    'incidencias/login_incident',
    'importAudits/contact_import',
    'legacyImports/user_legacy',
    'chats/chat_1/mensajes/hello_message',
    'chats/chat_2/mensajes/normal_attachment',
  ]) {
    assert.equal(await documentExists(db, preservedPath), true, `${preservedPath} must be preserved.`);
  }

  const chat = (await db.doc('chats/chat_1').get()).data();
  assert.equal(chat.crmLabel, 'Relacion conservada');
  assert.equal(chat.activeClassId, null);
  assert.deepEqual(chat.activeClassIds, []);
  assert.equal(chat.classSeriesId, null);
  assert.equal(chat.seriesEndDate, null);
  assert.equal(chat.relationshipStage, 'pendiente_horario');
  assert.equal('lastMessage' in chat, false);
  assert.equal('lastMessageId' in chat, false);
  assert.equal('lastMessageAt' in chat, false);

  const normalChat = (await db.doc('chats/chat_2').get()).data();
  assert.equal(normalChat.crmLabel, 'Otra relacion conservada');
  assert.equal(normalChat.lastMessage, 'Hola, este mensaje normal debe conservarse.');
  assert.equal(normalChat.lastMessageId, 'normal_message');
  assert.equal(await documentExists(db, 'chats/chat_2/mensajes/normal_message'), true);

  const family = (await db.doc('familias/family_1').get()).data();
  assert.equal(family.nombre, 'Maria');
  assert.equal(family.apellidos, 'Garcia Lopez');
  assert.deepEqual(family.childIds, ['student_1']);
  assert.equal(family.crmStatus, 'seguimiento');
  assert.equal(family.paymentAccessLocked, false);
  assert.equal(family.paymentAccessStatus, 'active');
  assert.equal(family.paymentAccessDebtAmount, 0);
  assert.equal('trustScore' in family, false);
  assert.equal('trustBadges' in family, false);
  assert.equal('reputationMetrics' in family, false);

  const professor = (await db.doc('profesores/teacher_1').get()).data();
  assert.equal(professor.nombre, 'Luis');
  assert.deepEqual(professor.subjects, ['Matematicas']);
  assert.equal('trustScore' in professor, false);
  assert.equal('trustWarnings' in professor, false);

  assert.equal((await bucket.file('pagos/family_1/receipt.txt').exists())[0], false);
  assert.equal((await bucket.file('receipts/historical-proof.txt').exists())[0], false);
  assert.equal((await bucket.file('chats/chat_1/family_1/justificante-bizum.pdf').exists())[0], false);
  assert.equal((await bucket.file('chats/chat_2/family_1/apuntes.pdf').exists())[0], true);
  assert.equal((await bucket.file('documents/identity.txt').exists())[0], true);

  assert.equal(result.verification.clean, true);
  assert.deepEqual(result.verification.remainingChatClassFinancePreviews, []);
  assert.equal(result.verification.remainingPaymentStorageFiles, 0);
  assert(result.deletedFirestoreDocuments >= 30);
  assert.equal(result.deletedStorageFiles, 3);

  const backedUpPaths = new Set(manifests.flatMap((manifest) => manifest.firestoreDocuments.map((item) => item.path)));
  assert(backedUpPaths.has('clases/class_past'));
  assert(backedUpPaths.has('clases/class_future'));
  assert(backedUpPaths.has('pagos/payment_1'));
  assert(backedUpPaths.has('resumenMensual/2026-07'));
  assert(backedUpPaths.has('documentos/payment_receipt'));
  assert.equal(backedUpPaths.has('documentos/identity_document'), false);
  const backedUpStoragePaths = new Set(manifests.flatMap((manifest) => manifest.storageFiles
    .filter((item) => item.existed)
    .map((item) => item.path)));
  assert.deepEqual(Array.from(backedUpStoragePaths).sort(), [
    'chats/chat_1/family_1/justificante-bizum.pdf',
    'pagos/family_1/receipt.txt',
    'receipts/historical-proof.txt',
  ]);
  assert(manifests.some((manifest) => manifest.familyProfilesBeforeDerivedReset[0].data.crmStatus === 'seguimiento'));
}

function runReset(extraArgs = []) {
  return spawnSync(process.execPath, [
    path.join(workspace, 'scripts', 'reset-class-financial-data.mjs'),
    '--apply',
    '--confirm=DELETE_CLASS_FINANCE_DATA',
    ...extraArgs,
  ], {
    cwd: workspace,
    env: {
      ...process.env,
      FIREBASE_PROJECT_ID: PROJECT_ID,
      GCLOUD_PROJECT: PROJECT_ID,
      CLASS_FINANCE_BACKUP_ROOT: backupRoot,
      STORAGE_EMULATOR_HOST: storageHost,
    },
    encoding: 'utf8',
    timeout: 120000,
  });
}

function runIndependentVerification() {
  return spawnSync(process.execPath, [
    path.join(workspace, 'scripts', 'verify-class-financial-reset.mjs'),
  ], {
    cwd: workspace,
    env: {
      ...process.env,
      FIREBASE_PROJECT_ID: PROJECT_ID,
      GCLOUD_PROJECT: PROJECT_ID,
      CLASS_FINANCE_BACKUP_ROOT: backupRoot,
      STORAGE_EMULATOR_HOST: storageHost,
    },
    encoding: 'utf8',
    timeout: 120000,
  });
}

initializeFirebase();
const db = admin.firestore();
const bucket = admin.storage().bucket();

try {
  await seed(db, bucket);
  const interrupted = runReset(['--simulate-failure-after-core-delete']);
  assert.equal(interrupted.status, 1, `Expected a simulated interruption.\nSTDOUT:\n${interrupted.stdout}\nSTDERR:\n${interrupted.stderr}`);
  assert.match(interrupted.stderr, /Simulated failure after core Firestore deletion/);
  assert.equal(await collectionSize(db, 'clases'), 0);
  assert.equal(await collectionSize(db, 'pagos'), 0);
  assert.equal(await documentExists(db, 'documentBlobs/payment_blob'), true);
  assert.equal((await db.doc('familias/family_1').get()).data().paymentAccessLocked, true);
  assert.equal((await bucket.file('pagos/family_1/receipt.txt').exists())[0], true);
  const preparedState = JSON.parse(await fs.readFile(path.join(backupRoot, 'class-finance-reset-state.json'), 'utf8'));
  assert.equal(preparedState.status, 'prepared');
  assert(preparedState.targetPaths.includes('documentBlobs/payment_blob'));
  assert(preparedState.context.paymentDocumentIds.includes('payment_receipt'));

  const reset = runReset();
  assert.equal(reset.status, 0, `Reset failed.\nSTDOUT:\n${reset.stdout}\nSTDERR:\n${reset.stderr}`);
  const result = JSON.parse(reset.stdout.trim());
  assert.equal(result.recoveredFromPreparedReset, true);
  assert(result.plannedFirestoreTargets >= 40);
  assert(result.backupPaths.length >= 2);
  const manifests = await Promise.all(result.backupPaths.map(async (backupPath) => JSON.parse(await fs.readFile(backupPath, 'utf8'))));
  await assertReset(db, bucket, result, manifests);
  const completedState = JSON.parse(await fs.readFile(result.resetStatePath, 'utf8'));
  assert.equal(completedState.status, 'completed');
  assert.equal(completedState.verification.clean, true);
  const independentVerification = runIndependentVerification();
  assert.equal(independentVerification.status, 0, `Independent verification failed.\nSTDOUT:\n${independentVerification.stdout}\nSTDERR:\n${independentVerification.stderr}`);
  const independentResult = JSON.parse(independentVerification.stdout.trim());
  assert.equal(independentResult.mode, 'read_only_independent_verification');
  assert.equal(independentResult.clean, true);
  assert.deepEqual(independentResult.remainingTargetPaths, []);
  assert.deepEqual(independentResult.remainingPaymentStoragePaths, []);
  assert.equal(independentResult.preservedFamilyProfiles.expectedCount, 1);
  assert.equal(independentResult.preservedFamilyProfiles.preservedCount, 1);
  assert.deepEqual(independentResult.preservedFamilyProfiles.missingPaths, []);
  assert.deepEqual(independentResult.preservedFamilyProfiles.mismatches, []);
  const idempotent = runReset();
  assert.equal(idempotent.status, 0, `Completed reset verification failed.\n${idempotent.stderr}`);
  const idempotentResult = JSON.parse(idempotent.stdout.trim());
  assert.equal(idempotentResult.alreadyCompleted, true);
  assert.deepEqual(idempotentResult.backupPaths, result.backupPaths);
  await setDocument(db, 'clases/post_reset_class', {
    classResetGeneration: 'class-reset-20260816',
    createdAfterClassReset: true,
    date: '2026-08-17',
  });
  const protectedRerun = runReset();
  assert.equal(protectedRerun.status, 1);
  assert.match(protectedRerun.stderr, /refusing to delete data created afterwards/);
  assert.equal(await documentExists(db, 'clases/post_reset_class'), true);
  console.log(JSON.stringify({
    ok: true,
    checked: 'class_finance_reset_emulator',
    recoveredFromPreparedReset: result.recoveredFromPreparedReset,
    completedResetIsIdempotent: idempotentResult.alreadyCompleted,
    postResetClassProtected: true,
    resetAttempts: completedState.attempts,
    deletedFirestoreDocuments: result.deletedFirestoreDocuments,
    deletedStorageFiles: result.deletedStorageFiles,
    independentVerification: independentResult.clean,
    verification: result.verification,
  }, null, 2));
} finally {
  await admin.app().delete().catch(() => {});
  const safeTempRoot = path.resolve(os.tmpdir());
  const resolvedBackupRoot = path.resolve(backupRoot);
  assert(resolvedBackupRoot.startsWith(`${safeTempRoot}${path.sep}`), 'Refusing to remove a non-temporary backup directory.');
  await fs.rm(resolvedBackupRoot, { recursive: true, force: true });
}
