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
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
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

async function verifyRoleCalendar(page, role, expectedDates) {
  const email = role === 'familia' ? smoke.familyEmail : smoke.profesorEmail;
  await login(page, email, smoke.password, role);
  await page.locator('[data-section="calendario"]').first().click();
  await page.waitForSelector('#calendario-wrapper .calendar-day[data-fecha="2026-07-01"]', { timeout: 30000 });
  await page.waitForFunction((dates) => dates.every((date) => {
    const day = document.querySelector(`.calendar-day[data-fecha="${date}"]`);
    return day && day.classList.contains('has-events');
  }), expectedDates, { timeout: 45000 });

  const panels = {};
  for (const date of expectedDates) {
    await page.locator(`.calendar-day[data-fecha="${date}"]`).click();
    await page.waitForTimeout(250);
    panels[date] = (await page.locator('#cal-clases-dia').innerText({ timeout: 5000 })).replace(/\s+/g, ' ').trim();
  }
  return panels;
}

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const smoke = {
  familyEmail: `recurring-family-${suffix}@example.com`,
  profesorEmail: `recurring-teacher-${suffix}@example.com`,
  password: `Tmp-${suffix}-A1!`,
  chatId: `recurring_calendar_smoke_${suffix}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
};
const studentId = `${smoke.chatId}_student`;
const classIds = {
  wed: `chat_${smoke.chatId}_wed`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 900),
  mon: `chat_${smoke.chatId}_mon`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 900),
};
const expectedTeacherDates = [
  '2026-07-01',
  '2026-07-06',
  '2026-07-08',
  '2026-07-13',
  '2026-07-15',
  '2026-07-20',
  '2026-07-22',
  '2026-07-27',
  '2026-07-29',
];
const generatedClassIds = [
  `${classIds.wed}_20260708`,
  `${classIds.wed}_20260715`,
  `${classIds.wed}_20260722`,
  `${classIds.wed}_20260729`,
  `${classIds.mon}_20260713`,
  `${classIds.mon}_20260720`,
  `${classIds.mon}_20260727`,
];

let family = null;
let teacher = null;
const token = readFirebaseCliToken();
if (!token) throw new Error('Firebase CLI OAuth token unavailable.');

try {
  family = await identity('signUp', {
    email: smoke.familyEmail,
    password: smoke.password,
    returnSecureToken: true,
  });
  teacher = await identity('signUp', {
    email: smoke.profesorEmail,
    password: smoke.password,
    returnSecureToken: true,
  });

  const nowIso = new Date().toISOString();
  const participantUids = { [family.localId]: true, [teacher.localId]: true };
  await firestorePatch(token, `users/${family.localId}`, {
    email: smoke.familyEmail,
    nombre: 'Familia Smoke',
    apellidos: 'Recurrente',
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
    apellidos: 'Recurrente',
    status: 'activo',
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await firestorePatch(token, `users/${teacher.localId}`, {
    email: smoke.profesorEmail,
    nombre: 'Profesor Smoke',
    apellidos: 'Recurrente',
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
    nombre: 'Profesor Smoke',
    apellidos: 'Recurrente',
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
    apellidos: 'Smoke Recurrente',
    activo: true,
    active: true,
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
    familyName: 'Familia Smoke Recurrente',
    familia_nombre: 'Familia Smoke Recurrente',
    teacherName: 'Profesor Smoke Recurrente',
    profesor_nombre: 'Profesor Smoke Recurrente',
    studentName: 'Juan Pablo Smoke',
    alumno_nombre: 'Juan Pablo Smoke',
    participantUids,
    active: true,
    schedulingStatus: 'clase_programada',
    relationshipStage: 'clase_programada',
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
    estado: 'confirmada',
    status: 'confirmada',
    lifecycleStatus: 'clase_programada',
    attendanceStatus: 'pendiente',
    paymentStatus: 'pendiente',
    familyPaymentStatus: 'pendiente',
    teacherPaymentStatus: 'pendiente',
    familyName: 'Familia Smoke Recurrente',
    teacherName: 'Profesor Smoke Recurrente',
    studentName: 'Juan Pablo Smoke',
    familia_nombre: 'Familia Smoke Recurrente',
    profesor_nombre: 'Profesor Smoke Recurrente',
    alumno_nombre: 'Juan Pablo Smoke',
    participantUids,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await firestorePatch(token, `clases/${classIds.wed}`, {
    ...baseClass,
    id: classIds.wed,
    calendarUid: classIds.wed,
    scheduleProposalId: 'wed',
    fecha: '2026-07-01',
    date: '2026-07-01',
    hora_inicio: '17:00',
    startTime: '17:00',
    hora_fin: '18:00',
    endTime: '18:00',
    duracion_minutos: 60,
    durationMinutes: 60,
    precio_total: 32,
    familyAmount: 32,
    importe_profesor: 24,
    teacherAmount: 24,
    precio_hora_familia: 32,
    familyHourlyRate: 32,
    importe_hora_profesor: 24,
    teacherHourlyRate: 24,
  });
  await firestorePatch(token, `clases/${classIds.mon}`, {
    ...baseClass,
    id: classIds.mon,
    calendarUid: classIds.mon,
    scheduleProposalId: 'mon',
    fecha: '2026-07-06',
    date: '2026-07-06',
    hora_inicio: '17:30',
    startTime: '17:30',
    hora_fin: '18:03',
    endTime: '18:03',
    duracion_minutos: 33,
    durationMinutes: 33,
    precio_total: 17.6,
    familyAmount: 17.6,
    importe_profesor: 13.2,
    teacherAmount: 13.2,
    precio_hora_familia: 32,
    familyHourlyRate: 32,
    importe_hora_profesor: 24,
    teacherHourlyRate: 24,
  });
  await firestorePatch(token, `chats/${smoke.chatId}/programaciones/wed`, {
    id: 'wed',
    assignmentId: smoke.chatId,
    familyUid: family.localId,
    teacherUid: teacher.localId,
    studentId,
    materia: 'Matematicas',
    kind: 'weekly_recurring',
    scheduleKind: 'weekly_recurring',
    firstClassDate: '2026-07-01',
    fecha: '2026-07-01',
    hora_inicio: '17:00',
    hora_fin: '18:00',
    durationMinutes: 60,
    recurrence: { frequency: 'weekly', dayOfWeek: 2, startTime: '17:00', endTime: '18:00', timezone: 'Europe/Madrid' },
    recurrenceLabel: 'Todos los miercoles 17:00-18:00',
    status: 'aceptada',
    classId: classIds.wed,
    classIds: [classIds.wed],
    classCount: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await firestorePatch(token, `chats/${smoke.chatId}/programaciones/mon`, {
    id: 'mon',
    assignmentId: smoke.chatId,
    familyUid: family.localId,
    teacherUid: teacher.localId,
    studentId,
    materia: 'Matematicas',
    kind: 'weekly_recurring',
    scheduleKind: 'weekly_recurring',
    firstClassDate: '2026-07-06',
    fecha: '2026-07-06',
    hora_inicio: '17:30',
    hora_fin: '18:03',
    durationMinutes: 33,
    recurrence: { frequency: 'weekly', dayOfWeek: 0, startTime: '17:30', endTime: '18:03', timezone: 'Europe/Madrid' },
    recurrenceLabel: 'Todos los lunes 17:30-18:03',
    status: 'aceptada',
    classId: classIds.mon,
    classIds: [classIds.mon],
    classCount: 1,
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
    const teacherPanels = await verifyRoleCalendar(page, 'profesor', expectedTeacherDates);
    const familyPanels = await verifyRoleCalendar(page, 'familia', expectedTeacherDates);
    for (const [date, text] of Object.entries(teacherPanels)) {
      const requiredText = ['Juan', 'Profesor Smoke', 'Hora', 'Cobras', 'Se ha dado?'];
      if (!requiredText.every((item) => text.includes(item))) {
        throw new Error(`Teacher calendar panel for ${date} does not include the minimal class card text: ${text}`);
      }
      if (text.includes('Matematicas')) {
        throw new Error(`Teacher calendar panel for ${date} still exposes the subject in the minimal card: ${text}`);
      }
    }
    for (const [date, text] of Object.entries(familyPanels)) {
      const requiredText = ['Juan', 'Profesor Smoke', 'Hora', 'Justificante', 'Subir justificante', 'Se ha dado?'];
      if (!requiredText.every((item) => text.includes(item))) {
        throw new Error(`Family calendar panel for ${date} does not include the minimal class card text: ${text}`);
      }
      if (text.includes('Matematicas')) {
        throw new Error(`Family calendar panel for ${date} still exposes the subject in the minimal card: ${text}`);
      }
    }
    console.log(JSON.stringify({
      ok: true,
      baseUrl,
      projectId,
      teacherUid: teacher.localId,
      familyUid: family.localId,
      chatId: smoke.chatId,
      expectedDates: expectedTeacherDates,
      consoleEvents: consoleEvents.slice(-10),
    }, null, 2));
  } finally {
    await browser.close().catch(() => {});
  }
} finally {
  const deletePaths = [
    ...generatedClassIds.map((id) => `clases/${id}`),
    `clases/${classIds.wed}`,
    `clases/${classIds.mon}`,
    `chats/${smoke.chatId}/programaciones/wed`,
    `chats/${smoke.chatId}/programaciones/mon`,
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
