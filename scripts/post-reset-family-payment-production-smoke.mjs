#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import admin from 'firebase-admin';
import { chromium } from 'playwright';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'clasesde10-50add';
const APPLY_TOKEN = 'POST_RESET_FAMILY_PAYMENT_ACCEPTANCE';
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const confirmed = process.argv.includes(`--confirm=${APPLY_TOKEN}`);
const baseUrl = (process.env.CD10_SMOKE_URL || 'https://clasesde10.com').replace(/\/$/, '');
const workspace = path.resolve(process.cwd());
const privateRoot = path.resolve(workspace, '..', 'migration-private');
const resetMarkerPath = path.join(privateRoot, 'scheduled-reset', 'completed.json');
const verificationMarkerPath = path.join(privateRoot, 'scheduled-reset-verification', 'completed.json');
const resetStatePath = path.join(privateRoot, 'backups', 'class-finance-reset-state.json');
const verifierPath = path.join(workspace, 'scripts', 'verify-class-financial-reset.mjs');
const firebaseClientSource = await fs.readFile(path.join(workspace, 'js', 'firebase-client.js'), 'utf8');
const apiKey = firebaseClientSource.match(/apiKey:\s*'([^']+)'/)?.[1];
const DAY_MS = 24 * 60 * 60 * 1000;
const ACCEPTANCE_PREFIX = 'post_reset_acceptance_';
const identityCollections = ['users', 'familias', 'profesores', 'alumnos'];
const cleanupCollections = [
  'clases',
  'pagos',
  'paymentSchedules',
  'documentos',
  'documentBlobs',
  'documentBlobChunks',
  'incidencias',
  'notificaciones',
  'auditLogs',
  'analyticsEvents',
  'automationEvents',
  'automationRuleRuns',
  'classLifecycleEvents',
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
];

if (!apply || !confirmed) throw new Error(`Production acceptance requires --apply --confirm=${APPLY_TOKEN}.`);
if (PROJECT_ID !== 'clasesde10-50add') throw new Error(`Unexpected Firebase project: ${PROJECT_ID}.`);
if (!['clasesde10.com', 'clasesde10-50add.web.app'].includes(new URL(baseUrl).hostname)) {
  throw new Error(`Unexpected production host: ${baseUrl}.`);
}
if (!apiKey) throw new Error('Firebase apiKey not found in js/firebase-client.js.');

function initializeFirebase() {
  if (admin.apps.length) return admin.app();
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: PROJECT_ID,
    storageBucket: `${PROJECT_ID}.firebasestorage.app`,
  });
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function assertResetPreconditions() {
  const [resetMarker, verificationMarker, resetState] = await Promise.all([
    readJson(resetMarkerPath),
    readJson(verificationMarkerPath),
    readJson(resetStatePath),
  ]);
  assert.equal(resetMarker.completed, true, 'The scheduled reset marker is not complete.');
  assert.equal(resetMarker.projectId, PROJECT_ID, 'The scheduled reset marker belongs to another project.');
  assert.equal(resetMarker.verification?.clean, true, 'The scheduled reset marker is not clean.');
  assert.equal(verificationMarker.completed, true, 'Independent reset verification is not complete.');
  assert.equal(verificationMarker.projectId, PROJECT_ID, 'Independent verification belongs to another project.');
  assert.equal(verificationMarker.verification?.clean, true, 'Independent reset verification is not clean.');
  assert.equal(verificationMarker.verification?.mode, 'read_only_independent_verification');
  assert.equal(resetState.status, 'completed', 'The durable reset state is not complete.');
  assert.equal(resetState.projectId, PROJECT_ID, 'The durable reset state belongs to another project.');
  assert.equal(resetState.verification?.clean, true, 'The durable reset state is not clean.');
  return {
    resetCompletedAt: resetMarker.completedAt || resetState.completedAt || '',
    independentlyVerifiedAt: verificationMarker.completedAt || verificationMarker.verification?.verifiedAt || '',
  };
}

async function identity(method, payload) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} failed (${response.status}): ${body?.error?.message || JSON.stringify(body)}`);
  return body;
}

function isoDateDaysAgo(days) {
  return new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
}

function containsFixtureMarker(data, markers) {
  const text = JSON.stringify(data ?? {});
  return text.includes(ACCEPTANCE_PREFIX) || markers.some((marker) => marker && text.includes(marker));
}

function storagePathsFromFixtureData(data = {}) {
  const paths = new Set();
  const visit = (value, key = '') => {
    if (typeof value === 'string') {
      const clean = value.trim().replace(/^\/+/, '');
      if (/(?:storage|file|document|proof|receipt).*path|^(?:path|ruta)$/i.test(key)
        && clean
        && !/^https?:\/\//i.test(clean)
        && !/^gs:\/\//i.test(clean)) {
        paths.add(clean);
      }
      if (/^gs:\/\//i.test(clean)) paths.add(clean.replace(/^gs:\/\/[^/]+\//i, ''));
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, key));
      return;
    }
    Object.entries(value).forEach(([childKey, child]) => visit(child, childKey));
  };
  visit(data);
  return Array.from(paths);
}

async function deleteReferences(db, references = []) {
  if (!references.length) return 0;
  const writer = db.bulkWriter();
  writer.onWriteError((error) => error.failedAttempts < 4);
  references.forEach((reference) => writer.delete(reference));
  await writer.close();
  return references.length;
}

async function listAcceptanceAuthUsers() {
  const matches = [];
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    page.users.forEach((user) => {
      if (String(user.email || '').startsWith(ACCEPTANCE_PREFIX)) matches.push(user);
    });
    pageToken = page.pageToken;
  } while (pageToken);
  return matches;
}

async function cleanupAcceptanceArtifacts(db, bucket, fixture = {}) {
  const currentMarkers = Array.from(new Set([
    fixture.prefix,
    fixture.family?.localId,
    fixture.teacher?.localId,
    fixture.adminUser?.localId,
    fixture.studentId,
    fixture.assignmentId,
    fixture.scheduleId,
    ...fixture.classIds,
    fixture.paymentId,
    fixture.documentId,
  ].filter(Boolean)));
  const fixtureUids = new Set([fixture.family?.localId, fixture.teacher?.localId, fixture.adminUser?.localId].filter(Boolean));
  const identityReferences = [];
  for (const collectionName of identityCollections) {
    const snapshot = await db.collection(collectionName).get();
    snapshot.docs.forEach((document) => {
      if (!document.id.startsWith(ACCEPTANCE_PREFIX) && !containsFixtureMarker(document.data(), currentMarkers)) return;
      identityReferences.push(document.ref);
      fixtureUids.add(document.id);
      const data = document.data() || {};
      [data.userUid, data.usuario_id, data.familyUid, data.familia_id].filter(Boolean).forEach((uid) => fixtureUids.add(String(uid)));
    });
  }
  const authUsers = await listAcceptanceAuthUsers();
  authUsers.forEach((user) => fixtureUids.add(user.uid));
  const markers = Array.from(new Set([...currentMarkers, ...fixtureUids]));
  let deletedDocuments = 0;
  const explicitStoragePaths = new Set();
  for (const collectionName of cleanupCollections) {
    const snapshot = await db.collection(collectionName).get();
    const references = [];
    snapshot.docs.forEach((document) => {
      if (!document.id.startsWith(ACCEPTANCE_PREFIX) && !containsFixtureMarker(document.data(), markers)) return;
      references.push(document.ref);
      storagePathsFromFixtureData(document.data() || {}).forEach((storagePath) => explicitStoragePaths.add(storagePath));
    });
    deletedDocuments += await deleteReferences(db, references);
  }
  deletedDocuments += await deleteReferences(db, identityReferences);

  let deletedStorageFiles = 0;
  for (const uid of fixtureUids) {
    const prefix = `pagos/${uid}/`;
    const [files] = await bucket.getFiles({ prefix });
    for (const file of files) {
      await file.delete({ ignoreNotFound: true });
      deletedStorageFiles += 1;
    }
  }
  for (const storagePath of explicitStoragePaths) {
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) continue;
    await file.delete({ ignoreNotFound: true });
    deletedStorageFiles += 1;
  }

  for (let index = 0; index < authUsers.length; index += 1000) {
    await admin.auth().deleteUsers(authUsers.slice(index, index + 1000).map((user) => user.uid));
  }
  for (const account of [fixture.family, fixture.teacher, fixture.adminUser]) {
    if (account?.idToken) await identity('delete', { idToken: account.idToken }).catch(() => {});
  }
  const remainingAuthUsers = await listAcceptanceAuthUsers();
  assert.equal(remainingAuthUsers.length, 0, 'Temporary acceptance Auth users remain after cleanup.');
  return {
    deletedDocuments,
    deletedStorageFiles,
    deletedAuthUsers: authUsers.length,
    remainingAuthUsers: remainingAuthUsers.length,
    recoveredFixtureUids: fixtureUids.size,
  };
}

function runIndependentVerification() {
  const result = spawnSync(process.execPath, [verifierPath], {
    cwd: workspace,
    env: process.env,
    encoding: 'utf8',
    timeout: 10 * 60 * 1000,
  });
  if (result.status !== 0) {
    throw new Error(`Post-cleanup independent verification failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  const verification = JSON.parse(result.stdout.trim());
  assert.equal(verification.mode, 'read_only_independent_verification');
  assert.equal(verification.projectId, PROJECT_ID);
  assert.equal(verification.clean, true);
  return verification;
}

async function waitFor(label, callback, options = {}) {
  const timeoutMs = options.timeoutMs || 30000;
  const intervalMs = options.intervalMs || 500;
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await callback();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`${label} did not become true within ${timeoutMs} ms.${lastError ? ` Last error: ${lastError.message}` : ''}`);
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

async function login(page, email, password, expectedRole) {
  await page.goto(`${baseUrl}/pages/login.html?postResetSmoke=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#form-login').evaluate((form) => form.requestSubmit());
  await page.waitForURL(new RegExp(`/pages/dashboard/${expectedRole}(?:\\.html)?(?:#.*)?$`), { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

async function seedFixture(db, fixture) {
  fixture.family = await identity('signUp', { email: fixture.familyEmail, password: fixture.password, returnSecureToken: true });
  fixture.teacher = await identity('signUp', { email: fixture.teacherEmail, password: fixture.password, returnSecureToken: true });
  fixture.adminUser = await identity('signUp', { email: fixture.adminEmail, password: fixture.password, returnSecureToken: true });
  const nowIso = new Date().toISOString();
  const currentDueAt = new Date(`${fixture.currentDate}T20:00:00`).toISOString();
  const oldDueAt = new Date(Date.now() - 40 * DAY_MS).toISOString();
  const familyUid = fixture.family.localId;
  const teacherUid = fixture.teacher.localId;
  const adminUid = fixture.adminUser.localId;
  const participantUids = { [familyUid]: true, [teacherUid]: true };
  const batch = db.batch();
  batch.set(db.doc(`users/${familyUid}`), {
    email: fixture.familyEmail,
    nombre: 'Familia Aceptacion',
    apellidos: fixture.label,
    telefono: '600123456',
    role: 'familia',
    rol: 'familia',
    active: true,
    activo: true,
    profileComplete: true,
    perfil_completo: true,
    profileCompletionPercent: 100,
    passwordSetupRequired: false,
    testRun: fixture.prefix,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  batch.set(db.doc(`familias/${familyUid}`), {
    id: familyUid,
    userUid: familyUid,
    usuario_id: familyUid,
    email: fixture.familyEmail,
    nombre: 'Familia Aceptacion',
    apellidos: fixture.label,
    telefono: '600123456',
    direccion: 'Calle Verificacion 10',
    ciudad: 'Madrid',
    codigo_postal: '28010',
    zona: 'Chamberi',
    preferredContact: 'chat',
    languages: ['es'],
    crmStatus: 'seguimiento',
    adminNotes: `CRM preservado ${fixture.prefix}`,
    profileComplete: true,
    perfil_completo: true,
    profileCompletionPercent: 100,
    status: 'activo',
    active: true,
    paymentAccessLocked: true,
    paymentAccessStatus: 'blocked_overdue_payment',
    paymentAccessReason: 'unpaid_classes_over_30_days',
    paymentAccessDebtAmount: 25,
    paymentAccessDebtClassCount: 1,
    paymentAccessDebtClassIds: [fixture.oldClassId],
    paymentAccessOldestDebtDueAt: oldDueAt,
    paymentAccessLockedAt: nowIso,
    testRun: fixture.prefix,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  batch.set(db.doc(`users/${teacherUid}`), {
    email: fixture.teacherEmail,
    nombre: 'Profesor Aceptacion',
    apellidos: fixture.label,
    role: 'profesor',
    rol: 'profesor',
    active: true,
    activo: true,
    profileComplete: true,
    testRun: fixture.prefix,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  batch.set(db.doc(`profesores/${teacherUid}`), {
    id: teacherUid,
    userUid: teacherUid,
    usuario_id: teacherUid,
    email: fixture.teacherEmail,
    nombre: 'Profesor Aceptacion',
    apellidos: fixture.label,
    estado_verificacion: 'verificado',
    verificationStatus: 'verificado',
    payoutFrequency: 'quincenal',
    frecuencia_cobro_profesor: 'quincenal',
    payoutAnchorDate: fixture.currentDate,
    fecha_inicio_cobro_profesor: fixture.currentDate,
    status: 'activo',
    active: true,
    testRun: fixture.prefix,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  batch.set(db.doc(`users/${adminUid}`), {
    email: fixture.adminEmail,
    nombre: 'Admin Aceptacion',
    apellidos: fixture.label,
    role: 'admin',
    rol: 'admin',
    active: true,
    activo: true,
    passwordSetupRequired: false,
    testRun: fixture.prefix,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  batch.set(db.doc(`alumnos/${fixture.studentId}`), {
    id: fixture.studentId,
    familyUid,
    familia_id: familyUid,
    nombre: 'Hijo Aceptacion',
    apellidos: fixture.label,
    active: true,
    activo: true,
    testRun: fixture.prefix,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  batch.set(db.doc(`paymentSchedules/${fixture.scheduleId}`), {
    id: fixture.scheduleId,
    ownerUid: familyUid,
    familyUid,
    familia_id: familyUid,
    teacherUid,
    profesor_id: teacherUid,
    studentId: fixture.studentId,
    alumno_id: fixture.studentId,
    assignmentId: fixture.assignmentId,
    asignacion_id: fixture.assignmentId,
    familyName: `Familia Aceptacion ${fixture.label}`,
    familia_nombre: `Familia Aceptacion ${fixture.label}`,
    teacherName: `Profesor Aceptacion ${fixture.label}`,
    profesor_nombre: `Profesor Aceptacion ${fixture.label}`,
    studentName: `Hijo Aceptacion ${fixture.label}`,
    alumno_nombre: `Hijo Aceptacion ${fixture.label}`,
    frequency: 'quincenal',
    paymentFrequency: 'quincenal',
    frecuencia_pago: 'quincenal',
    recurrenceDays: 14,
    anchorDate: fixture.currentDate,
    paymentAnchorDate: fixture.currentDate,
    fecha_inicio_pago: fixture.currentDate,
    time: '20:00',
    paymentTime: '20:00',
    hora_pago: '20:00',
    active: true,
    status: 'active',
    testRun: fixture.prefix,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const commonClass = {
    familyUid,
    familia_id: familyUid,
    teacherUid,
    profesor_id: teacherUid,
    studentId: fixture.studentId,
    alumno_id: fixture.studentId,
    assignmentId: fixture.assignmentId,
    asignacion_id: fixture.assignmentId,
    familyName: `Familia Aceptacion ${fixture.label}`,
    familia_nombre: `Familia Aceptacion ${fixture.label}`,
    teacherName: `Profesor Aceptacion ${fixture.label}`,
    profesor_nombre: `Profesor Aceptacion ${fixture.label}`,
    studentName: `Hijo Aceptacion ${fixture.label}`,
    alumno_nombre: `Hijo Aceptacion ${fixture.label}`,
    participantUids,
    materia: 'Matematicas',
    subject: 'Matematicas',
    estado: 'realizada',
    status: 'realizada',
    lifecycleStatus: 'pendiente_pago',
    teacherConfirmationStatus: 'realizada',
    teacherAttendanceStatus: 'realizada',
    confirmacion_profesor: 'realizada',
    familyPaymentStatus: 'pendiente',
    estado_pago_familia: 'pendiente',
    estado_pago: 'pendiente',
    teacherPaymentStatus: 'pendiente',
    estado_pago_profesor: 'pendiente',
    duracion_minutos: 60,
    durationMinutes: 60,
    importe_profesor: 20,
    teacherAmount: 20,
    testRun: fixture.prefix,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  batch.set(db.doc(`clases/${fixture.oldClassId}`), {
    ...commonClass,
    id: fixture.oldClassId,
    calendarUid: fixture.oldClassId,
    fecha: fixture.oldDate,
    date: fixture.oldDate,
    hora_inicio: '17:00',
    startTime: '17:00',
    hora_fin: '18:00',
    endTime: '18:00',
    familyConfirmationStatus: 'realizada',
    familyAttendanceStatus: 'realizada',
    confirmacion_familia: 'realizada',
    precio_total: 25,
    familyAmount: 25,
    familyPaymentDueAt: oldDueAt,
    paymentDueAt: oldDueAt,
  });
  batch.set(db.doc(`clases/${fixture.currentClassId}`), {
    ...commonClass,
    id: fixture.currentClassId,
    calendarUid: fixture.currentClassId,
    fecha: fixture.currentDate,
    date: fixture.currentDate,
    hora_inicio: '18:00',
    startTime: '18:00',
    hora_fin: '19:00',
    endTime: '19:00',
    familyConfirmationStatus: 'realizada',
    familyAttendanceStatus: 'realizada',
    confirmacion_familia: 'realizada',
    precio_total: 35,
    familyAmount: 35,
    familyPaymentDueAt: currentDueAt,
    paymentDueAt: currentDueAt,
  });
  batch.set(db.doc(`clases/${fixture.unmarkedClassId}`), {
    ...commonClass,
    id: fixture.unmarkedClassId,
    calendarUid: fixture.unmarkedClassId,
    fecha: fixture.currentDate,
    date: fixture.currentDate,
    hora_inicio: '19:00',
    startTime: '19:00',
    hora_fin: '20:00',
    endTime: '20:00',
    precio_total: 20,
    familyAmount: 20,
    familyPaymentDueAt: currentDueAt,
    paymentDueAt: currentDueAt,
  });
  await batch.commit();
}

async function verifyFamilyLockedAndMarkAttendance(page, fixture) {
  await login(page, fixture.familyEmail, fixture.password, 'familia');
  await page.waitForSelector('#family-payment-access-banner:not([hidden])', { timeout: 30000 });
  const lockText = (await page.locator('#family-payment-access-copy').innerText()).replace(/\s+/g, ' ').trim();
  assert.match(lockText, /mas de 30 dias de impago/i);
  assert.match(lockText, /25,00|25\.00/);

  await page.evaluate(() => document.querySelector('[data-section="perfil"]')?.click());
  await page.waitForTimeout(300);
  assert.equal((await page.locator('#topbar-title').innerText()).trim(), 'Calendario', 'Locked family reached a forbidden section.');

  await page.evaluate(() => document.querySelector('[data-section="pagos"]')?.click());
  await page.waitForSelector('#family-payment-workbench', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#family-payment-workbench')?.textContent?.includes('Marcar clases antes de pagar'), null, { timeout: 30000 });

  await page.evaluate(() => document.querySelector('[data-section="calendario"]')?.click());
  await page.waitForSelector(`.calendar-day[data-fecha="${fixture.currentDate}"]`, { timeout: 30000 });
  await page.locator(`.calendar-day[data-fecha="${fixture.currentDate}"]`).click();
  const scheduledPaymentCard = page.locator('#cal-clases-dia .calendar-payment-due-item').filter({ hasText: 'Cada 15 dias' }).first();
  await scheduledPaymentCard.waitFor({ state: 'visible', timeout: 30000 });
  const scheduledPaymentText = (await scheduledPaymentCard.innerText()).replace(/\s+/g, ' ').trim();
  assert.match(scheduledPaymentText, /60,00|60\.00/, 'Fortnightly payment day does not show the exact full family debt.');
  assert.match(scheduledPaymentText, /Este periodo:\s*(?:35,00|35\.00)/i, 'Fortnightly payment day does not separate the current period.');
  assert.match(scheduledPaymentText, /Impagado anterior:\s*(?:25,00|25\.00)/i, 'Fortnightly payment day does not carry older debt.');
  const attendance = page.locator(`select[data-action="actualizar-asistencia-familia"][data-id="${fixture.unmarkedClassId}"]`);
  await attendance.waitFor({ state: 'visible', timeout: 30000 });
  await attendance.selectOption('no_realizada');
  const dialog = page.locator('.action-dialog-overlay.open');
  await dialog.waitFor({ state: 'visible', timeout: 10000 });
  await dialog.locator('textarea').fill(`No se impartio - ${fixture.prefix}`);
  await dialog.locator('[data-action-dialog-confirm]').click();
  await dialog.waitFor({ state: 'detached', timeout: 30000 });

  await waitFor('family no-show attendance write', async () => {
    const snapshot = await fixture.db.doc(`clases/${fixture.unmarkedClassId}`).get();
    return snapshot.data()?.familyConfirmationStatus === 'no_realizada';
  });
  return { lockText, scheduledPaymentText };
}

async function submitExactFamilyPayment(page, fixture) {
  await page.evaluate(() => document.querySelector('[data-section="pagos"]')?.click());
  await page.waitForFunction(() => document.querySelector('#family-payment-workbench')?.textContent?.includes('60,00'), null, { timeout: 30000 });
  const workbenchText = (await page.locator('#family-payment-workbench').innerText()).replace(/\s+/g, ' ').trim();
  for (const expected of ['Clases impagadas', 'Incluye impagos anteriores', '60,00', 'Pagar todas y subir justificante']) {
    assert.ok(workbenchText.includes(expected), `Family payment workbench is missing "${expected}".`);
  }
  await page.locator('[data-action="confirmar-pago-grupo"]').first().click();
  await page.locator('#modal-pago.open').waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(Number(await page.locator('#pago-monto').inputValue()), 60);
  const requiredClassIds = (await page.locator('#pago-class-ids').inputValue()).split(',').filter(Boolean).sort();
  assert.deepEqual(requiredClassIds, [fixture.currentClassId, fixture.oldClassId].sort());

  await page.evaluate(({ currentClassId }) => {
    document.getElementById('pago-class-ids').value = currentClassId;
    const amount = document.getElementById('pago-monto');
    amount.readOnly = false;
    amount.value = '35.00';
  }, { currentClassId: fixture.currentClassId });
  await page.locator('#btn-confirmar-pago').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#modal-pago').evaluate((element) => element.classList.contains('open')), true, 'Partial family payment was accepted.');

  await page.evaluate(({ classIds }) => {
    document.getElementById('pago-class-ids').value = classIds.join(',');
    document.getElementById('pago-monto').value = '59.00';
  }, { classIds: [fixture.oldClassId, fixture.currentClassId] });
  await page.locator('#btn-confirmar-pago').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#modal-pago').evaluate((element) => element.classList.contains('open')), true, 'Altered family payment amount was accepted.');

  const prematurePayments = await fixture.db.collection('pagos').where('familyUid', '==', fixture.family.localId).get();
  assert.equal(prematurePayments.empty, true, 'A rejected partial/manipulated payment created a Firestore document.');

  await page.evaluate(({ classIds }) => {
    document.getElementById('pago-class-ids').value = classIds.join(',');
    document.getElementById('pago-monto').value = '60.00';
  }, { classIds: [fixture.oldClassId, fixture.currentClassId] });
  await page.locator('#pago-referencia').fill(`POST-RESET-${fixture.prefix}`);
  await page.locator('#pago-file').setInputFiles({
    name: `${fixture.prefix}-justificante.png`,
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  });
  await page.locator('#btn-confirmar-pago').click();
  await page.locator('#modal-pago.open').waitFor({ state: 'detached', timeout: 45000 });

  const payment = await waitFor('exact family payment', async () => {
    const snapshot = await fixture.db.collection('pagos').where('familyUid', '==', fixture.family.localId).get();
    const document = snapshot.docs.find((item) => item.data().reference === `POST-RESET-${fixture.prefix}`);
    return document ? { id: document.id, ...document.data() } : null;
  }, { timeoutMs: 45000 });
  fixture.paymentId = payment.id;
  fixture.documentId = payment.documentId || payment.documento_id || '';
  assert.equal(Number(payment.amount || payment.monto), 60);
  assert.deepEqual((payment.classIds || []).map(String).sort(), [fixture.currentClassId, fixture.oldClassId].sort());
  assert.equal(payment.status, 'pendiente');
  assert.ok(fixture.documentId, 'Payment proof document is missing.');
  assert.equal(await page.locator('#family-payment-access-banner').isHidden(), false, 'A proof under review unlocked the family before admin approval.');
  return { paymentId: payment.id, documentId: fixture.documentId, workbenchText };
}

async function verifyAdminIdentityAndApprove(page, fixture) {
  await login(page, fixture.adminEmail, fixture.password, 'admin');
  await page.waitForFunction(() => window.__cd10AdminReady && typeof window.cd10AdminGoTo === 'function' && typeof window.validarPago === 'function', null, { timeout: 45000 });
  await page.evaluate(() => window.cd10AdminGoTo('familias'));
  await page.locator('#filtro-fam-busqueda').fill(fixture.label);
  await page.locator('#filtro-fam-busqueda').dispatchEvent('input');
  const familyCard = page.locator(`#tbody-familias [data-admin-directory-card="familia"][data-id="${fixture.family.localId}"]`);
  await familyCard.waitFor({ state: 'visible', timeout: 30000 });
  const familyCardText = (await familyCard.innerText()).replace(/\s+/g, ' ').trim();
  assert.ok(familyCardText.includes(`Familia Aceptacion ${fixture.label}`), 'Admin family directory does not show the full family name.');
  assert.ok(familyCardText.includes('Ver ficha'), 'Admin family directory does not expose the profile action.');
  await familyCard.locator('[data-action="ver-familia"]').click();
  await page.locator('#modal-familia-detalle.open').waitFor({ state: 'visible', timeout: 20000 });
  const crmText = (await page.locator('#familia-detalle-body').innerText()).replace(/\s+/g, ' ').trim();
  for (const expected of [
    `Familia Aceptacion ${fixture.label}`,
    `Hijo Aceptacion ${fixture.label}`,
    'Ficha CRM familiar',
    'Alumnos y servicio contratado',
    'Documentos y justificantes',
  ]) {
    assert.ok(crmText.includes(expected), `Admin CRM profile is missing "${expected}".`);
  }
  await page.locator('#modal-familia-detalle .modal-close').click();

  await page.evaluate(() => window.cd10AdminGoTo('calendario'));
  await page.waitForSelector(`.calendar-day[data-fecha="${fixture.currentDate}"]`, { timeout: 30000 });
  await page.locator(`.calendar-day[data-fecha="${fixture.currentDate}"]`).click();
  const familyCollectionCard = page.locator('#cal-clases-dia .admin-family-payment-event').filter({ hasText: `Familia Aceptacion ${fixture.label}` }).first();
  await familyCollectionCard.waitFor({ state: 'visible', timeout: 30000 });
  const familyCollectionText = (await familyCollectionCard.innerText()).replace(/\s+/g, ' ').trim();
  assert.match(familyCollectionText, /60,00|60\.00/, 'Admin calendar does not show the exact scheduled family collection.');
  assert.match(familyCollectionText, /Impagado anterior:\s*(?:25,00|25\.00)/i, 'Admin calendar does not explain the older family debt carryover.');
  for (const expected of [`Familia Aceptacion ${fixture.label}`, `Hijo Aceptacion ${fixture.label}`, `Profesor Aceptacion ${fixture.label}`]) {
    assert.ok(familyCollectionText.includes(expected), `Admin family collection card is missing "${expected}".`);
  }
  assert.ok(await familyCollectionCard.locator('[data-action="ver-persona-admin"]').count() >= 3, 'Admin family collection card does not expose every related profile action.');

  const teacherPayoutCard = page.locator('#cal-clases-dia .admin-teacher-payout-event').filter({ hasText: `Profesor Aceptacion ${fixture.label}` }).first();
  await teacherPayoutCard.waitFor({ state: 'visible', timeout: 30000 });
  const teacherPayoutText = (await teacherPayoutCard.innerText()).replace(/\s+/g, ' ').trim();
  assert.match(teacherPayoutText, /debes pagar exactamente\s+(?:40,00|40\.00)/i, 'Admin calendar does not state the exact teacher payout.');
  assert.ok(teacherPayoutText.includes(`Hijo Aceptacion ${fixture.label}`), 'Teacher payout card is missing the related child.');
  assert.ok(await teacherPayoutCard.locator('[data-action="ver-persona-admin"]').count() >= 2, 'Teacher payout card does not expose teacher and child profile actions.');

  await page.locator(`.calendar-day[data-fecha="${fixture.todayDate}"]`).click();
  const familyDebtCard = page.locator('#cal-clases-dia .admin-family-payment-event').filter({ hasText: `Familia Aceptacion ${fixture.label}` }).first();
  await familyDebtCard.waitFor({ state: 'visible', timeout: 30000 });
  const familyDebtText = (await familyDebtCard.innerText()).replace(/\s+/g, ' ').trim();
  assert.match(familyDebtText, /debe exactamente\s+(?:25,00|25\.00)/i, 'Admin calendar does not state the exact overdue family debt.');
  assert.ok(familyDebtText.includes(`Familia Aceptacion ${fixture.label}`), 'Admin debt card is missing the full family name.');
  assert.ok(familyDebtText.includes(`Hijo Aceptacion ${fixture.label}`), 'Admin debt card is missing the related child.');
  assert.ok(familyDebtText.includes(`Profesor Aceptacion ${fixture.label}`), 'Admin debt card is missing the related teacher.');
  assert.ok(await familyDebtCard.locator('[data-action="ver-persona-admin"]').count() >= 3, 'Admin debt card does not expose every related profile action.');

  await page.evaluate(() => window.cd10AdminGoTo('notificaciones'));
  const debtNoticeCards = page.locator('#notification-center-admin .notification-center-item').filter({ hasText: `Familia Aceptacion ${fixture.label}` });
  await debtNoticeCards.first().waitFor({ state: 'visible', timeout: 30000 });
  await waitFor('one grouped admin family debt notice', async () => (await debtNoticeCards.count()) === 1);
  const debtNotice = debtNoticeCards.first();
  const debtNoticeText = (await debtNotice.innerText()).replace(/\s+/g, ' ').trim();
  assert.match(debtNoticeText, /debe\s+(?:25,00|25\.00)/i, 'Admin debt notice does not state the exact amount.');
  assert.match(debtNoticeText, /1 clase/i, 'Admin debt notice does not state the exact class count.');
  assert.match(debtNoticeText, /pago mas antiguo vencio/i, 'Admin debt notice is not a complete explanatory sentence.');
  assert.doesNotMatch(debtNoticeText, /payment_overdue|fingerprint|classId|familyUid|source\s*:/i, 'Admin debt notice exposes internal codes.');
  for (const expected of [`Familia Aceptacion ${fixture.label}`, `Hijo Aceptacion ${fixture.label}`, `Profesor Aceptacion ${fixture.label}`]) {
    assert.ok(debtNoticeText.includes(expected), `Admin debt notice is missing "${expected}".`);
  }
  assert.ok(await debtNotice.locator('[data-action="ver-persona-admin"]').count() >= 3, 'Admin debt notice does not expose every related profile action.');

  await page.evaluate(async (paymentId) => {
    await window.validarPago(paymentId, 'validado', { silent: true, refresh: false, source: 'post_reset_acceptance' });
  }, fixture.paymentId);
  const finalState = await waitFor('atomic admin payment approval', async () => {
    const [payment, oldClass, currentClass, family] = await Promise.all([
      fixture.db.doc(`pagos/${fixture.paymentId}`).get(),
      fixture.db.doc(`clases/${fixture.oldClassId}`).get(),
      fixture.db.doc(`clases/${fixture.currentClassId}`).get(),
      fixture.db.doc(`familias/${fixture.family.localId}`).get(),
    ]);
    const state = {
      payment: payment.data() || {},
      oldClass: oldClass.data() || {},
      currentClass: currentClass.data() || {},
      family: family.data() || {},
    };
    return state.payment.status === 'validado'
      && state.oldClass.familyPaymentStatus === 'validado'
      && state.currentClass.familyPaymentStatus === 'validado'
      && state.family.paymentAccessLocked === false
      ? state
      : null;
  }, { timeoutMs: 45000 });
  await page.waitForFunction((familyLabel) => ![...document.querySelectorAll('#notification-center-admin .notification-center-item')]
    .some((item) => item.textContent?.includes(familyLabel)), `Familia Aceptacion ${fixture.label}`, { timeout: 30000 });
  return {
    familyCardText,
    crmText,
    familyCollectionText,
    familyDebtText,
    teacherPayoutText,
    debtNoticeText,
    groupedDebtNoticeCount: 1,
    debtNoticeResolvedAfterApproval: true,
    finalState,
  };
}

async function verifyLiveUnlockAndGreenCalendar(page, fixture) {
  await page.waitForFunction(() => (
    document.getElementById('family-payment-access-banner')?.hidden === true
      && !document.body.classList.contains('family-payment-access-locked')
  ), null, { timeout: 45000 });
  await page.evaluate(() => document.querySelector('[data-section="perfil"]')?.click());
  await page.waitForFunction(() => document.querySelector('#topbar-title')?.textContent?.trim() === 'Mi perfil', null, { timeout: 15000 });
  await page.evaluate(() => document.querySelector('[data-section="calendario"]')?.click());
  await page.waitForSelector(`.calendar-day[data-fecha="${fixture.currentDate}"]`, { timeout: 30000 });
  await page.locator(`.calendar-day[data-fecha="${fixture.currentDate}"]`).click();
  await page.waitForFunction(({ currentClassId }) => {
    const selected = document.querySelector(`select[data-id="${CSS.escape(currentClassId)}"]`);
    return selected?.closest('.calendar-class-item')?.classList.contains('payment-paid') === true;
  }, { currentClassId: fixture.currentClassId }, { timeout: 30000 });
  const paidCard = page.locator(`select[data-id="${fixture.currentClassId}"]`).locator('xpath=ancestor::*[contains(@class,"calendar-class-item")]');
  const paidText = (await paidCard.innerText()).replace(/\s+/g, ' ').trim();
  assert.match(paidText, /Justificante validado|Pagada/i);
  return { paidText };
}

const preconditions = await assertResetPreconditions();
initializeFirebase();
const db = admin.firestore();
const bucket = admin.storage().bucket();
const preflightCleanup = await cleanupAcceptanceArtifacts(db, bucket);
const preFixtureVerification = runIndependentVerification();
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const prefix = `${ACCEPTANCE_PREFIX}${suffix}`.replace(/[^a-zA-Z0-9_-]/g, '_');
const fixture = {
  db,
  prefix,
  label: `Smoke ${suffix}`,
  password: `Tmp-${suffix}-A1!`,
  familyEmail: `${prefix}-family@example.com`,
  teacherEmail: `${prefix}-teacher@example.com`,
  adminEmail: `${prefix}-admin@example.com`,
  studentId: `${prefix}_student`,
  assignmentId: `${prefix}_assignment`,
  scheduleId: `${prefix}_schedule`,
  oldClassId: `${prefix}_old`,
  currentClassId: `${prefix}_current`,
  unmarkedClassId: `${prefix}_unmarked`,
  oldDate: isoDateDaysAgo(1),
  currentDate: isoDateDaysAgo(1),
  todayDate: isoDateDaysAgo(0),
  classIds: [],
  paymentId: '',
  documentId: '',
  family: null,
  teacher: null,
  adminUser: null,
};
fixture.classIds = [fixture.oldClassId, fixture.currentClassId, fixture.unmarkedClassId];

let browser = null;
let familyContext = null;
let adminContext = null;
let flowResult = null;
let flowError = null;
let cleanup = null;
let postCleanupVerification = null;
try {
  await seedFixture(db, fixture);
  browser = await launchBrowser();
  familyContext = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block' });
  adminContext = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block' });
  const familyPage = await familyContext.newPage();
  const adminPage = await adminContext.newPage();
  const locked = await verifyFamilyLockedAndMarkAttendance(familyPage, fixture);
  const submitted = await submitExactFamilyPayment(familyPage, fixture);
  const approved = await verifyAdminIdentityAndApprove(adminPage, fixture);
  const unlocked = await verifyLiveUnlockAndGreenCalendar(familyPage, fixture);
  flowResult = {
    lockedAccessVerified: /30 dias/i.test(locked.lockText),
    fortnightlyPaymentDayVerified: /Cada 15 dias/i.test(locked.scheduledPaymentText),
    attendanceRequiredAndNoShowExcluded: true,
    partialPaymentRejected: true,
    alteredAmountRejected: true,
    exactAmount: 60,
    exactClassIds: [fixture.oldClassId, fixture.currentClassId].sort(),
    proofDocumentCreated: Boolean(submitted.documentId),
    adminFullIdentityAndChildVerified: approved.crmText.includes(`Hijo Aceptacion ${fixture.label}`),
    adminFamilyCollectionCalendarVerified: /60,00|60\.00/.test(approved.familyCollectionText),
    adminFamilyDebtCalendarVerified: /debe exactamente\s+(?:25,00|25\.00)/i.test(approved.familyDebtText),
    adminTeacherPayoutCalendarVerified: /debes pagar exactamente\s+(?:40,00|40\.00)/i.test(approved.teacherPayoutText),
    adminCalendarFullIdentityVerified: approved.familyCollectionText.includes(`Hijo Aceptacion ${fixture.label}`)
      && approved.teacherPayoutText.includes(`Hijo Aceptacion ${fixture.label}`),
    conciseGroupedAdminDebtNoticeVerified: approved.groupedDebtNoticeCount === 1
      && /pago mas antiguo vencio/i.test(approved.debtNoticeText),
    adminDebtNoticeFullIdentityVerified: approved.debtNoticeText.includes(`Hijo Aceptacion ${fixture.label}`)
      && approved.debtNoticeText.includes(`Profesor Aceptacion ${fixture.label}`),
    adminDebtNoticeResolvedAfterApproval: approved.debtNoticeResolvedAfterApproval === true,
    exactScheduledFamilyCollectionAmount: 60,
    exactAdminDebtAmount: 25,
    exactTeacherPayoutAmount: 40,
    atomicApprovalVerified: approved.finalState.family.paymentAccessLocked === false,
    liveUnlockWithoutReload: true,
    paidCalendarGreen: /Justificante validado|Pagada/i.test(unlocked.paidText),
  };
} catch (error) {
  flowError = error;
} finally {
  await Promise.all([
    familyContext?.close().catch(() => {}),
    adminContext?.close().catch(() => {}),
  ]);
  await browser?.close().catch(() => {});
  try {
    cleanup = await cleanupAcceptanceArtifacts(db, bucket, fixture);
    postCleanupVerification = runIndependentVerification();
  } catch (error) {
    flowError ||= error;
  }
}

if (flowError) throw flowError;
console.log(JSON.stringify({
  ok: true,
  mode: 'post_reset_family_payment_production_acceptance',
  projectId: PROJECT_ID,
  baseUrl,
  verifiedAt: new Date().toISOString(),
  preconditions,
  preflightCleanup,
  preFixtureVerification: {
    mode: preFixtureVerification.mode,
    clean: preFixtureVerification.clean,
    verifiedAt: preFixtureVerification.verifiedAt,
    preservedFamilyProfiles: preFixtureVerification.preservedFamilyProfiles,
  },
  flow: flowResult,
  cleanup,
  postCleanupVerification: {
    mode: postCleanupVerification.mode,
    clean: postCleanupVerification.clean,
    verifiedAt: postCleanupVerification.verifiedAt,
    preservedFamilyProfiles: postCleanupVerification.preservedFamilyProfiles,
  },
}, null, 2));
