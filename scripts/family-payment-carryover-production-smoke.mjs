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
  const response = await fetch(docUrl(docPath), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404) return;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Firestore delete ${docPath} failed (${response.status}): ${body?.error?.message || JSON.stringify(body)}`);
}

async function launchChrome() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

async function loginFamily(page, email, password) {
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
  await page.waitForFunction(() => (
    window.location.pathname === '/pages/dashboard/familia'
    || window.location.pathname === '/pages/dashboard/familia.html'
  ), null, { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const smoke = {
  familyEmail: `payment-family-${suffix}@example.com`,
  profesorEmail: `payment-teacher-${suffix}@example.com`,
  password: `Tmp-${suffix}-A1!`,
  chatId: `payment_carryover_smoke_${suffix}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
};
const studentId = `${smoke.chatId}_student`;
const scheduleId = `${smoke.chatId}_schedule`;
const oldClassId = `${smoke.chatId}_old`;
const currentClassId = `${smoke.chatId}_current`;
const token = readFirebaseCliToken();
if (!token) throw new Error('Firebase CLI OAuth token unavailable.');

let family = null;
let teacher = null;
try {
  family = await identity('signUp', { email: smoke.familyEmail, password: smoke.password, returnSecureToken: true });
  teacher = await identity('signUp', { email: smoke.profesorEmail, password: smoke.password, returnSecureToken: true });
  const nowIso = new Date().toISOString();
  const participantUids = { [family.localId]: true, [teacher.localId]: true };
  await firestorePatch(token, `users/${family.localId}`, {
    email: smoke.familyEmail,
    nombre: 'Familia Pago',
    apellidos: 'Smoke',
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
    nombre: 'Familia Pago',
    apellidos: 'Smoke',
    status: 'activo',
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await firestorePatch(token, `users/${teacher.localId}`, {
    email: smoke.profesorEmail,
    nombre: 'Profesor Pago',
    apellidos: 'Smoke',
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
    email: smoke.profesorEmail,
    nombre: 'Profesor Pago',
    apellidos: 'Smoke',
    estado_verificacion: 'verificado',
    verificationStatus: 'verificado',
    status: 'activo',
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await firestorePatch(token, `alumnos/${studentId}`, {
    id: studentId,
    familia_id: family.localId,
    familyUid: family.localId,
    nombre: 'Juan Pablo',
    apellidos: 'Pago Smoke',
    activo: true,
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await firestorePatch(token, `paymentSchedules/${scheduleId}`, {
    id: scheduleId,
    type: 'weekly_family_teacher_payment',
    status: 'active',
    active: true,
    ownerUid: family.localId,
    familyUid: family.localId,
    familia_id: family.localId,
    teacherUid: teacher.localId,
    profesor_id: teacher.localId,
    studentId,
    alumno_id: studentId,
    assignmentId: smoke.chatId,
    asignacion_id: smoke.chatId,
    studentName: 'Juan Pablo Pago',
    teacherName: 'Profesor Pago Smoke',
    frequency: 'semanal',
    paymentFrequency: 'semanal',
    frecuencia_pago: 'semanal',
    dayOfWeek: 5,
    paymentDay: 5,
    dia_semana_pago: 5,
    time: '20:00',
    paymentTime: '20:00',
    hora_pago: '20:00',
    graceHours: 48,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await firestorePatch(token, `chats/${smoke.chatId}`, {
    id: smoke.chatId,
    assignmentId: smoke.chatId,
    asignacion_id: smoke.chatId,
    familyUid: family.localId,
    familia_id: family.localId,
    teacherUid: teacher.localId,
    profesor_id: teacher.localId,
    studentId,
    alumno_id: studentId,
    materia: 'Matematicas',
    subject: 'Matematicas',
    familyName: 'Familia Pago Smoke',
    teacherName: 'Profesor Pago Smoke',
    studentName: 'Juan Pablo Pago',
    participantUids,
    active: true,
    relationshipStatus: 'active',
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const baseClass = {
    assignmentId: smoke.chatId,
    asignacion_id: smoke.chatId,
    familyUid: family.localId,
    familia_id: family.localId,
    teacherUid: teacher.localId,
    profesor_id: teacher.localId,
    studentId,
    alumno_id: studentId,
    materia: 'Matematicas',
    subject: 'Matematicas',
    estado: 'realizada',
    status: 'realizada',
    lifecycleStatus: 'clase_realizada',
    attendanceStatus: 'realizada',
    familyPaymentStatus: 'pendiente',
    teacherPaymentStatus: 'pendiente',
    familyName: 'Familia Pago Smoke',
    teacherName: 'Profesor Pago Smoke',
    studentName: 'Juan Pablo Pago',
    familia_nombre: 'Familia Pago Smoke',
    profesor_nombre: 'Profesor Pago Smoke',
    alumno_nombre: 'Juan Pablo Pago',
    participantUids,
    duracion_minutos: 60,
    durationMinutes: 60,
    precio_total: 32,
    familyAmount: 32,
    precio_hora_familia: 32,
    familyHourlyRate: 32,
    importe_profesor: 24,
    teacherAmount: 24,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await firestorePatch(token, `clases/${oldClassId}`, {
    ...baseClass,
    id: oldClassId,
    calendarUid: oldClassId,
    fecha: '2026-07-01',
    date: '2026-07-01',
    hora_inicio: '17:00',
    startTime: '17:00',
    hora_fin: '18:00',
    endTime: '18:00',
  });
  await firestorePatch(token, `clases/${currentClassId}`, {
    ...baseClass,
    id: currentClassId,
    calendarUid: currentClassId,
    fecha: '2026-07-07',
    date: '2026-07-07',
    hora_inicio: '18:00',
    startTime: '18:00',
    hora_fin: '19:00',
    endTime: '19:00',
  });

  const browser = await launchChrome();
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  try {
    await loginFamily(page, smoke.familyEmail, smoke.password);
    await page.locator('[data-section="calendario"]').first().click();
    await page.waitForSelector('#calendario-wrapper .calendar-day[data-fecha="2026-07-10"]', { timeout: 30000 });
    await page.waitForFunction(() => {
      const day = document.querySelector('.calendar-day[data-fecha="2026-07-10"]');
      return day && day.classList.contains('has-events');
    }, null, { timeout: 45000 });
    await page.locator('.calendar-day[data-fecha="2026-07-10"]').click();
    await page.waitForTimeout(250);
    const text = (await page.locator('#cal-clases-dia').innerText({ timeout: 5000 })).replace(/\s+/g, ' ').trim();
    const required = ['Impagos', 'Impagado anterior', '01/07', '07/07', 'Enviar justificante', '64,00'];
    for (const item of required) {
      if (!text.includes(item)) throw new Error(`Payment carryover panel missing "${item}": ${text}`);
    }
    console.log(JSON.stringify({ ok: true, baseUrl, projectId, familyUid: family.localId, teacherUid: teacher.localId, scheduleId, panelText: text }, null, 2));
  } finally {
    await browser.close().catch(() => {});
  }
} finally {
  const deletePaths = [
    `clases/${oldClassId}`,
    `clases/${currentClassId}`,
    `paymentSchedules/${scheduleId}`,
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
