#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const firebaseClientSource = fs.readFileSync('js/firebase-client.js', 'utf8');
const apiKey = firebaseClientSource.match(/apiKey:\s*'([^']+)'/)?.[1];
const projectId = firebaseClientSource.match(/projectId:\s*'([^']+)'/)?.[1] || 'clasesde10-50add';
const database = '(default)';
const baseUrl = (process.env.CD10_SMOKE_URL || 'https://clasesde10.com').replace(/\/$/, '');

if (!apiKey) throw new Error('Firebase apiKey not found in js/firebase-client.js.');

function readFirebaseCliToken() {
  const candidates = [
    path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json'),
    process.env.APPDATA ? path.join(process.env.APPDATA, 'configstore', 'firebase-tools.json') : '',
  ].filter(Boolean);
  const configPath = candidates.find((item) => fs.existsSync(item));
  if (!configPath) return null;
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return config?.tokens?.access_token || null;
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

function firestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  return { mapValue: { fields: firestoreFields(value) } };
}

function firestoreFields(data = {}) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, firestoreValue(value)]));
}

function docUrl(docPath) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${database}/documents/${docPath}`;
}

async function firestorePatch(token, docPath, data) {
  const response = await fetch(docUrl(docPath), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: firestoreFields(data) }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Firestore patch ${docPath} failed (${response.status}): ${body?.error?.message || JSON.stringify(body)}`);
}

async function firestoreDelete(token, docPath) {
  const response = await fetch(docUrl(docPath), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Firestore delete ${docPath} failed (${response.status}): ${body?.error?.message || JSON.stringify(body)}`);
}

async function firestoreGet(token, docPath) {
  const response = await fetch(docUrl(docPath), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore get ${docPath} failed (${response.status}): ${body?.error?.message || JSON.stringify(body)}`);
  return body;
}

async function firestoreList(token, collectionPath) {
  const response = await fetch(docUrl(collectionPath), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Firestore list ${collectionPath} failed (${response.status}): ${body?.error?.message || JSON.stringify(body)}`);
  return (body.documents || []).map((doc) => String(doc.name || '').split('/documents/')[1]).filter(Boolean);
}

async function waitForFirestoreDoc(token, docPath, timeoutMs = 30000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await firestoreGet(token, docPath).catch((error) => ({ error: error.message || String(error) }));
    if (last && !last.error) return last;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`Firestore document did not appear: ${docPath}. Last=${JSON.stringify(last)}`);
}

function safeIdPart(value = '') {
  return String(value ?? '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
}

function oneOffClassId(chatId = '', proposalId = '') {
  return `oneoff_${safeIdPart(chatId)}_${safeIdPart(proposalId)}`.slice(0, 180);
}

function oneOffBusySlotId(resourceType = '', resourceId = '', classId = '') {
  return [resourceType, resourceId, classId].map(safeIdPart).filter(Boolean).join('_').slice(0, 180);
}

async function launchChrome() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

async function login(page, email, password, role) {
  await page.evaluate(async () => {
    const { signOut } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js');
    const { firebaseAuth } = await import('/js/firebase-client.js');
    await signOut(firebaseAuth).catch(() => {});
    localStorage.clear();
    sessionStorage.clear();
  }).catch(() => {});
  await page.context().clearCookies().catch(() => {});
  await page.goto(`${baseUrl}/pages/login.html?smoke=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#form-login').evaluate((form) => form.requestSubmit());
  await page.waitForFunction((expectedRole) => (
    window.location.pathname === `/pages/dashboard/${expectedRole}`
    || window.location.pathname === `/pages/dashboard/${expectedRole}.html`
  ), role, { timeout: 30000 }).catch(async (error) => {
    const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    throw new Error(`Login did not reach ${role}. url=${page.url()} text=${text.slice(0, 500)} cause=${error.message}`);
  });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

async function verifyOneOffPanel(page, role, expectedTexts = []) {
  const email = role === 'familia' ? smoke.familyEmail : smoke.teacherEmail;
  await login(page, email, smoke.password, role);
  await page.locator('[data-section="clases"]').first().click();
  const tableSelector = role === 'familia' ? '#tbody-clases' : '#tbody-mis-clases';
  await page.waitForSelector(tableSelector, { timeout: 30000 });
  await page.waitForFunction(({ selector, expected }) => {
    const text = document.querySelector(selector)?.innerText || '';
    return expected.every((item) => text.includes(item));
  }, { selector: tableSelector, expected: expectedTexts }, { timeout: 45000 }).catch(async (error) => {
    const text = await page.locator(tableSelector).innerText({ timeout: 5000 }).catch(() => '');
    throw new Error(`One-off proposal not visible for ${role}. text=${text.slice(0, 1000)} cause=${error.message}`);
  });
  return (await page.locator(tableSelector).innerText({ timeout: 5000 })).replace(/\s+/g, ' ').trim();
}

async function waitForAcceptedOneOffInPage(page, chatId, proposalId, classId, timeoutMs = 30000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await page.evaluate(async ({ currentChatId, currentProposalId, currentClassId }) => {
      const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
      const { firebaseDb } = await import('/js/firebase-client.js');
      const [classSnap, proposalSnap] = await Promise.all([
        getDoc(doc(firebaseDb, 'clases', currentClassId)).catch((error) => ({ error: error.message || String(error), exists: () => false })),
        getDoc(doc(firebaseDb, 'chats', currentChatId, 'programaciones', currentProposalId)).catch((error) => ({ error: error.message || String(error), exists: () => false })),
      ]);
      return {
        classExists: classSnap.exists?.() === true,
        proposalExists: proposalSnap.exists?.() === true,
        classStatus: classSnap.exists?.() ? classSnap.data()?.status || classSnap.data()?.estado || '' : '',
        proposalStatus: proposalSnap.exists?.() ? proposalSnap.data()?.status || '' : '',
        classError: classSnap.error || '',
        proposalError: proposalSnap.error || '',
      };
    }, {
      currentChatId: chatId,
      currentProposalId: proposalId,
      currentClassId: classId,
    });
    if (last.classExists && last.proposalStatus === 'aceptada' && last.classStatus === 'confirmada') return last;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`Accepted one-off class did not become visible in browser. Last=${JSON.stringify(last)}`);
}

async function waitForRejectedOneOffInPage(page, chatId, proposalId, timeoutMs = 30000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await page.evaluate(async ({ currentChatId, currentProposalId }) => {
      const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
      const { firebaseDb } = await import('/js/firebase-client.js');
      const [chatSnap, proposalSnap] = await Promise.all([
        getDoc(doc(firebaseDb, 'chats', currentChatId)).catch((error) => ({ error: error.message || String(error), exists: () => false })),
        getDoc(doc(firebaseDb, 'chats', currentChatId, 'programaciones', currentProposalId)).catch((error) => ({ error: error.message || String(error), exists: () => false })),
      ]);
      return {
        chatExists: chatSnap.exists?.() === true,
        proposalExists: proposalSnap.exists?.() === true,
        schedulingStatus: chatSnap.exists?.() ? chatSnap.data()?.schedulingStatus || '' : '',
        lastRelationshipEvent: chatSnap.exists?.() ? chatSnap.data()?.lastRelationshipEvent || '' : '',
        proposalStatus: proposalSnap.exists?.() ? proposalSnap.data()?.status || '' : '',
        respondedByRole: proposalSnap.exists?.() ? proposalSnap.data()?.respondedByRole || '' : '',
        rejectionReason: proposalSnap.exists?.() ? proposalSnap.data()?.rejectionReason || '' : '',
        chatError: chatSnap.error || '',
        proposalError: proposalSnap.error || '',
      };
    }, {
      currentChatId: chatId,
      currentProposalId: proposalId,
    });
    if (
      last.proposalStatus === 'rechazada'
      && last.respondedByRole === 'profesor'
      && last.schedulingStatus === 'horario_rechazado'
      && last.lastRelationshipEvent === 'one_off_class_rejected_from_classes'
    ) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`Rejected one-off proposal did not become visible in browser. Last=${JSON.stringify(last)}`);
}

const token = readFirebaseCliToken();
if (!token) throw new Error('Firebase CLI OAuth token unavailable.');

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const responseMode = String(process.env.CD10_ONE_OFF_RESPONSE || 'accept').trim().toLowerCase();
const smoke = {
  familyEmail: `oneoff-family-${suffix}@example.com`,
  teacherEmail: `oneoff-teacher-${suffix}@example.com`,
  password: `Tmp-${suffix}-A1!`,
  chatId: `one_off_class_smoke_${suffix}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
};
const studentId = `${smoke.chatId}_student`;
let family = null;
let teacher = null;
let proposalId = '';
let createdClassId = '';

try {
  family = await identity('signUp', {
    email: smoke.familyEmail,
    password: smoke.password,
    returnSecureToken: true,
  });
  teacher = await identity('signUp', {
    email: smoke.teacherEmail,
    password: smoke.password,
    returnSecureToken: true,
  });

  const nowIso = new Date().toISOString();
  const participantUids = { [family.localId]: true, [teacher.localId]: true };
  await firestorePatch(token, `users/${family.localId}`, {
    email: smoke.familyEmail,
    nombre: 'Familia Smoke',
    apellidos: 'Puntual',
    role: 'familia',
    rol: 'familia',
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await firestorePatch(token, `familias/${family.localId}`, {
    id: family.localId,
    userUid: family.localId,
    usuario_id: family.localId,
    email: smoke.familyEmail,
    nombre: 'Familia Smoke',
    apellidos: 'Puntual',
    status: 'activo',
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await firestorePatch(token, `users/${teacher.localId}`, {
    email: smoke.teacherEmail,
    nombre: 'Profesor Smoke',
    apellidos: 'Puntual',
    role: 'profesor',
    rol: 'profesor',
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await firestorePatch(token, `profesores/${teacher.localId}`, {
    id: teacher.localId,
    userUid: teacher.localId,
    usuario_id: teacher.localId,
    email: smoke.teacherEmail,
    nombre: 'Profesor Smoke',
    apellidos: 'Puntual',
    status: 'activo',
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await firestorePatch(token, `alumnos/${studentId}`, {
    id: studentId,
    familyUid: family.localId,
    familia_id: family.localId,
    nombre: 'Alumno Smoke',
    apellidos: 'Puntual',
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await firestorePatch(token, `chats/${smoke.chatId}`, {
    assignmentId: smoke.chatId,
    asignacion_id: smoke.chatId,
    familyUid: family.localId,
    familia_id: family.localId,
    teacherUid: teacher.localId,
    profesor_id: teacher.localId,
    studentId,
    alumno_id: studentId,
    familyName: 'Familia Smoke Puntual',
    teacherName: 'Profesor Smoke Puntual',
    studentName: 'Alumno Smoke Puntual',
    materia: 'Matematicas',
    participantUids,
    active: true,
    schedulingStatus: 'pendiente_horario',
    relationshipStage: 'pendiente_horario',
    relationshipStatus: 'active',
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const browser = await launchChrome();
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const consoleEvents = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) consoleEvents.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => consoleEvents.push(`pageerror: ${error.message}`));
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const result = await page.evaluate(async ({ email, password, chatId, familyUid, teacherUid, studentId: student }) => {
      const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js');
      const {
        addDoc,
        collection,
        doc,
        getDoc,
        serverTimestamp,
        updateDoc,
      } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
      const { firebaseAuth, firebaseDb } = await import('/js/firebase-client.js');

      await signInWithEmailAndPassword(firebaseAuth, email, password);
      const chatRef = doc(firebaseDb, 'chats', chatId);
      const proposalRef = await addDoc(collection(chatRef, 'programaciones'), {
        assignmentId: chatId,
        asignacion_id: chatId,
        familyUid,
        familia_id: familyUid,
        teacherUid,
        profesor_id: teacherUid,
        studentId: student,
        alumno_id: student,
        materia: 'Matematicas',
        subject: 'Matematicas',
        kind: 'one_off',
        scheduleKind: 'one_off',
        firstClassDate: '2026-07-10',
        fecha: '2026-07-10',
        hora_inicio: '17:30',
        hora_fin: '18:03',
        durationMinutes: 33,
        duracion_minutos: 33,
        modalidad: 'por_acordar',
        notas: 'Smoke clase puntual fuera de disponibilidad',
        status: 'propuesta',
        availabilityStatus: 'outside_counterparty_availability',
        availabilityValidation: {
          checkedByRole: 'familia',
          checkedAt: new Date().toISOString(),
          requiredScope: 'teacher',
          message: 'El horario no encaja con las franjas disponibles del profesor.',
          overrideConfirmed: true,
          overrideReason: 'outside_counterparty_availability',
        },
        availabilityOverrideRequested: true,
        availabilityOverrideConfirmed: true,
        availabilityOverrideReason: 'outside_counterparty_availability',
        availabilityOverrideMessage: 'El horario no encaja con las franjas disponibles del profesor.',
        source: 'classes_panel_one_off',
        proposedByUid: familyUid,
        proposedByRole: 'familia',
        proposedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(chatRef, {
        schedulingStatus: 'horario_propuesto',
        relationshipStage: 'horario_propuesto',
        relationshipStatus: 'active',
        lastRelationshipEvent: 'one_off_class_proposed_from_classes',
        relationshipUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const proposalSnap = await getDoc(proposalRef);
      return {
        proposalId: proposalRef.id,
        proposalExists: proposalSnap.exists(),
        schedulingStatus: (await getDoc(chatRef)).data()?.schedulingStatus || '',
      };
    }, {
      email: smoke.familyEmail,
      password: smoke.password,
      chatId: smoke.chatId,
      familyUid: family.localId,
      teacherUid: teacher.localId,
      studentId,
    });
    proposalId = result.proposalId;
    if (!result.proposalExists || result.schedulingStatus !== 'horario_propuesto') {
      throw new Error(`Unexpected smoke result: ${JSON.stringify(result)}`);
    }
    const familyPanel = await verifyOneOffPanel(page, 'familia', [
      'Propuesta pendiente',
      'Alumno Smoke',
      'Profesor Smoke',
      'Esperando respuesta',
    ]);
    const teacherPanel = await verifyOneOffPanel(page, 'profesor', [
      'Propuesta pendiente',
      'Alumno Smoke',
      'Pendiente de tu respuesta',
      'Aceptar',
    ]);
    if (responseMode === 'reject') {
      page.once('dialog', async (dialog) => {
        await dialog.accept('Rechazo smoke automatizado de clase puntual.');
      });
      await page.locator('[data-action="rechazar-propuesta-puntual-profesor"]').first().click();
      const rejectedState = await waitForRejectedOneOffInPage(page, smoke.chatId, proposalId, 30000);
      console.log(JSON.stringify({
        ok: true,
        mode: responseMode,
        projectId,
        baseUrl,
        familyUid: family.localId,
        teacherUid: teacher.localId,
        chatId: smoke.chatId,
        proposalId,
        familyPanel,
        teacherPanel,
        rejectedState,
        consoleEvents: consoleEvents.slice(-10),
        result,
      }, null, 2));
    } else {
      await page.locator('[data-action="aceptar-propuesta-puntual-profesor"]').first().click();
      createdClassId = oneOffClassId(smoke.chatId, proposalId);
      const acceptedState = await waitForAcceptedOneOffInPage(page, smoke.chatId, proposalId, createdClassId, 30000);
      console.log(JSON.stringify({
        ok: true,
        mode: responseMode,
        projectId,
        baseUrl,
        familyUid: family.localId,
        teacherUid: teacher.localId,
        chatId: smoke.chatId,
        proposalId,
        classId: createdClassId,
        familyPanel,
        teacherPanel,
        acceptedState,
        consoleEvents: consoleEvents.slice(-10),
        result,
      }, null, 2));
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
} finally {
  const chatMessagePaths = await firestoreList(token, `chats/${smoke.chatId}/mensajes`).catch(() => []);
  const deletePaths = [
    ...chatMessagePaths,
    createdClassId ? `busySlots/${oneOffBusySlotId('teacher', teacher?.localId || '', createdClassId)}` : '',
    createdClassId ? `busySlots/${oneOffBusySlotId('student', studentId, createdClassId)}` : '',
    createdClassId ? `clases/${createdClassId}` : '',
    proposalId ? `chats/${smoke.chatId}/programaciones/${proposalId}` : '',
    `chats/${smoke.chatId}`,
    `alumnos/${studentId}`,
    family?.localId ? `familias/${family.localId}` : '',
    family?.localId ? `users/${family.localId}` : '',
    teacher?.localId ? `profesores/${teacher.localId}` : '',
    teacher?.localId ? `users/${teacher.localId}` : '',
  ].filter(Boolean);
  await Promise.all(deletePaths.map((item) => firestoreDelete(token, item).catch(() => {})));
  if (family?.idToken) await identity('delete', { idToken: family.idToken }).catch(() => {});
  if (teacher?.idToken) await identity('delete', { idToken: teacher.idToken }).catch(() => {});
}
