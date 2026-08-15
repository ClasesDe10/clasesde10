#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { chromium } from 'playwright';
import {
  isoDateLocal,
  normalizeTeacherPayoutPreference,
  payoutDatesForMonth,
} from '../js/teacher-payout-schedule.js';

const firebaseClientSource = fs.readFileSync('js/firebase-client.js', 'utf8');
const projectId = firebaseClientSource.match(/projectId:\s*'([^']+)'/)?.[1] || 'clasesde10-50add';
const baseUrl = (process.env.CD10_SMOKE_URL || 'https://clasesde10.com').replace(/\/$/, '');
const screenshotDir = path.resolve('output', 'playwright');

async function launchChrome() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

async function login(page, email, password) {
  await page.goto(`${baseUrl}/pages/login.html?teacher-calendar-smoke=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#form-login').evaluate((form) => form.requestSubmit());
  await page.waitForFunction(() => (
    window.location.pathname === '/pages/dashboard/profesor'
    || window.location.pathname === '/pages/dashboard/profesor.html'
  ), { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function dateInMonth(year, monthIndex, day) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function rgbTuple(value) {
  return String(value || '').replace(/\s+/g, '');
}

async function dayChip(page, date) {
  const day = page.locator(`.calendar-day[data-fecha="${date}"]`);
  await day.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction((targetDate) => (
    Boolean(document.querySelector(`.calendar-day[data-fecha="${targetDate}"] .day-chip`))
  ), date, { timeout: 30000 });
  return day.locator('.day-chip').evaluate((node) => ({
    className: node.className,
    label: node.textContent.trim(),
    color: getComputedStyle(node).backgroundColor,
  }));
}

async function selectedDayText(page, date) {
  await page.locator(`.calendar-day[data-fecha="${date}"]`).click();
  await page.waitForTimeout(150);
  return (await page.locator('#cal-clases-dia').innerText()).replace(/\s+/g, ' ').trim();
}

async function navigateSection(page, section) {
  await page.locator(`[data-section="${section}"]`).first().evaluate((node) => node.click());
  await page.locator(`#section-${section}`).waitFor({ state: 'visible', timeout: 10000 });
}

const now = new Date();
const year = now.getFullYear();
const monthIndex = now.getMonth();
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `teacher-payout-${suffix}@example.com`;
const password = `Tmp-${suffix}-A1!`;
const classPrefix = `teacher_payout_smoke_${suffix}`.replace(/[^a-zA-Z0-9_-]/g, '_');
const datesByState = {
  scheduled: dateInMonth(year, monthIndex, 3),
  pending: dateInMonth(year, monthIndex, 5),
  paid: dateInMonth(year, monthIndex, 7),
  missing: dateInMonth(year, monthIndex, 9),
  cancelled: dateInMonth(year, monthIndex, 11),
};
const anchorDate = dateInMonth(year, monthIndex, 1);
const preference = normalizeTeacherPayoutPreference({ payoutFrequency: 'quincenal', payoutAnchorDate: anchorDate });
const currentPayoutDates = payoutDatesForMonth(preference, year, monthIndex).map(isoDateLocal);
const payoutDate = currentPayoutDates.find((date) => Number(date.slice(-2)) > 11);
const nextMonth = new Date(year, monthIndex + 1, 1);
const nextMonthPayoutDates = payoutDatesForMonth(preference, nextMonth.getFullYear(), nextMonth.getMonth()).map(isoDateLocal);

if (!payoutDate || !nextMonthPayoutDates.length) throw new Error('Could not build deterministic payout dates for the production smoke.');

let teacher = null;
const classIds = Object.fromEntries(Object.keys(datesByState).map((state) => [state, `${classPrefix}_${state}`]));
const adminApp = initializeApp({ credential: applicationDefault(), projectId }, `teacher-payout-${suffix}`);
const adminAuth = getAuth(adminApp);
const adminDb = getFirestore(adminApp);

try {
  teacher = await adminAuth.createUser({
    email,
    password,
    emailVerified: true,
    displayName: 'Profesor Calendario Temporal',
  });
  const nowIso = new Date().toISOString();
  await adminDb.doc(`users/${teacher.uid}`).set({
    email,
    nombre: 'Profesor',
    apellidos: 'Calendario Temporal',
    role: 'profesor',
    rol: 'profesor',
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await adminDb.doc(`profesores/${teacher.uid}`).set({
    id: teacher.uid,
    userUid: teacher.uid,
    usuario_id: teacher.uid,
    email,
    nombre: 'Profesor',
    apellidos: 'Calendario Temporal',
    estado_verificacion: 'verificado',
    verificationStatus: 'verificado',
    status: 'activo',
    active: true,
    payoutFrequency: 'quincenal',
    frecuencia_cobro_profesor: 'quincenal',
    payoutAnchorDate: anchorDate,
    fecha_inicio_cobro_profesor: anchorDate,
    payoutDayOfMonth: 1,
    dia_cobro_profesor: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const baseClass = {
    teacherUid: teacher.uid,
    profesor_id: teacher.uid,
    studentId: `${classPrefix}_student`,
    alumno_id: `${classPrefix}_student`,
    studentName: 'Alumno Temporal',
    alumno_nombre: 'Alumno Temporal',
    materia: 'Matemáticas',
    subject: 'Matemáticas',
    hora_inicio: '17:00',
    startTime: '17:00',
    hora_fin: '18:00',
    endTime: '18:00',
    duracion_minutos: 60,
    durationMinutes: 60,
    participantUids: { [teacher.uid]: true },
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const fixtures = {
    scheduled: { estado: 'confirmada', status: 'confirmada', teacherPaymentStatus: '', teacherAmount: 24, importe_profesor: 24 },
    pending: { estado: 'realizada', status: 'realizada', teacherPaymentStatus: 'por_cobrar', teacherAmount: 24, importe_profesor: 24 },
    paid: { estado: 'realizada', status: 'realizada', teacherPaymentStatus: 'pagado', teacherAmount: 22, importe_profesor: 22 },
    missing: { estado: 'realizada', status: 'realizada', teacherPaymentStatus: 'por_cobrar', teacherAmount: 0, importe_profesor: 0 },
    cancelled: { estado: 'cancelada', status: 'cancelada', teacherPaymentStatus: '', teacherAmount: 20, importe_profesor: 20 },
  };
  for (const [state, fixture] of Object.entries(fixtures)) {
    await adminDb.doc(`clases/${classIds[state]}`).set({
      ...baseClass,
      ...fixture,
      id: classIds[state],
      calendarUid: classIds[state],
      fecha: datesByState[state],
      date: datesByState[state],
    });
  }

  const browser = await launchChrome();
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await login(page, email, password);
    await navigateSection(page, 'calendario');
    await page.locator(`.calendar-day[data-fecha="${datesByState.pending}"]`).waitFor({ state: 'visible', timeout: 30000 });

    const legend = await page.locator('.calendar-legend-item').evaluateAll((nodes) => nodes.map((node) => ({
      label: node.textContent.trim(),
      color: getComputedStyle(node.querySelector('.calendar-legend-dot')).backgroundColor,
    })));
    const expectedLegend = ['Clase o propuesta', 'Cobro pendiente', 'Fecha de cobro', 'Cobrado', 'Cancelada o revisar'];
    if (JSON.stringify(legend.map((item) => item.label)) !== JSON.stringify(expectedLegend)) {
      throw new Error(`Unexpected teacher calendar legend: ${JSON.stringify(legend)}`);
    }
    if (new Set(legend.map((item) => rgbTuple(item.color))).size !== 5) {
      throw new Error(`Teacher calendar legend colors are not distinct: ${JSON.stringify(legend)}`);
    }

    const expectedChips = {
      scheduled: ['dot-navy', 'rgb(36,90,130)'],
      pending: ['dot-amber', 'rgb(176,109,8)'],
      paid: ['dot-emerald', 'rgb(36,117,95)'],
      missing: ['dot-rose', 'rgb(168,63,54)'],
      cancelled: ['dot-red', 'rgb(168,63,54)'],
    };
    const chips = {};
    for (const [state, date] of Object.entries(datesByState)) {
      chips[state] = await dayChip(page, date);
      const [expectedClass, expectedColor] = expectedChips[state];
      if (!chips[state].className.includes(expectedClass) || rgbTuple(chips[state].color) !== expectedColor) {
        throw new Error(`${state} chip is inconsistent: ${JSON.stringify(chips[state])}`);
      }
    }
    const payoutChip = await dayChip(page, payoutDate);
    if (!payoutChip.className.includes('dot-purple') || payoutChip.label !== 'Cobro' || rgbTuple(payoutChip.color) !== 'rgb(109,40,217)') {
      throw new Error(`Payout date chip is inconsistent: ${JSON.stringify(payoutChip)}`);
    }

    const panels = {
      scheduled: await selectedDayText(page, datesByState.scheduled),
      pending: await selectedDayText(page, datesByState.pending),
      paid: await selectedDayText(page, datesByState.paid),
      missing: await selectedDayText(page, datesByState.missing),
      cancelled: await selectedDayText(page, datesByState.cancelled),
      payout: await selectedDayText(page, payoutDate),
    };
    const panelExpectations = {
      scheduled: ['Programada', 'El cobro se activa al registrar la clase como realizada'],
      pending: ['Cobro pendiente', 'Previsto para el'],
      paid: ['Cobrado', 'Cobro recibido'],
      missing: ['Sin importe', 'Falta importe del profesor'],
      cancelled: ['Cancelada', 'Esta clase no genera ningún cobro'],
      payout: ['Fecha de cobro', 'Cobro pendiente', '24,00'],
    };
    for (const [state, required] of Object.entries(panelExpectations)) {
      if (!required.every((text) => panels[state].includes(text))) {
        throw new Error(`${state} panel is missing clear financial wording: ${panels[state]}`);
      }
    }

    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, 'teacher-payout-calendar-production-desktop.png'), fullPage: true });

    await navigateSection(page, 'clases');
    await page.locator('.teacher-classes-table tbody tr').first().waitFor({ state: 'visible', timeout: 30000 });
    const classHeaders = await page.locator('.teacher-classes-table thead th').allTextContents();
    if (JSON.stringify(classHeaders.map((item) => item.trim())) !== JSON.stringify(['Cuándo', 'Alumno', 'Estado', 'Acción'])) {
      throw new Error(`Teacher classes list is not compact: ${JSON.stringify(classHeaders)}`);
    }
    const pendingDateLabel = new Date(`${datesByState.pending}T00:00:00`).toLocaleDateString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    const pendingRow = page.locator('.teacher-classes-table tbody tr').filter({ hasText: pendingDateLabel }).first();
    await pendingRow.waitFor({ state: 'visible', timeout: 30000 });
    await page.screenshot({ path: path.join(screenshotDir, 'teacher-classes-list-production-desktop.png'), fullPage: true });
    await pendingRow.locator('[data-action="ver-detalle-clase-profesor"]').click();
    await page.locator('#modal-clase-detalle-profesor.open').waitFor({ state: 'visible', timeout: 10000 });
    const classDetail = (await page.locator('#modal-clase-detalle-profesor').innerText()).replace(/\s+/g, ' ').trim();
    const classDetailLower = classDetail.toLocaleLowerCase('es');
    for (const text of ['Detalle de la clase', 'Alumno Temporal', 'Materia', 'Duración', 'Ingreso', 'Seguimiento', 'Cobro', 'Cobro pendiente']) {
      if (!classDetailLower.includes(text.toLocaleLowerCase('es'))) throw new Error(`Teacher class detail dialog is missing “${text}”: ${classDetail}`);
    }
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(screenshotDir, 'teacher-classes-production-desktop.png') });
    await page.locator('#modal-clase-detalle-profesor [data-close-modal]').click();

    await navigateSection(page, 'calendario');
    await dayChip(page, payoutDate);

    await page.locator('#cal-next').click();
    for (const date of nextMonthPayoutDates) {
      const chip = await dayChip(page, date);
      if (!chip.className.includes('dot-purple') || chip.label !== 'Cobro') {
        throw new Error(`The 15-day payout schedule did not continue in the next month at ${date}: ${JSON.stringify(chip)}`);
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await navigateSection(page, 'clases');
    await pendingRow.waitFor({ state: 'visible', timeout: 30000 });
    await page.screenshot({ path: path.join(screenshotDir, 'teacher-classes-list-production-mobile.png') });
    await pendingRow.locator('[data-action="ver-detalle-clase-profesor"]').click();
    await page.locator('#modal-clase-detalle-profesor.open').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    if (overflow > 1) throw new Error(`Teacher calendar creates ${overflow}px horizontal overflow on mobile.`);
    await page.screenshot({ path: path.join(screenshotDir, 'teacher-classes-production-mobile.png') });
    if (pageErrors.length) throw new Error(`Teacher dashboard page errors: ${pageErrors.join(' | ')}`);

    console.log(JSON.stringify({
      ok: true,
      baseUrl,
      projectId,
      teacherUid: teacher.uid,
      anchorDate,
      currentPayoutDates,
      nextMonthPayoutDates,
      legend,
      chips: { ...chips, payout: payoutChip },
      screenshots: [
        path.join(screenshotDir, 'teacher-payout-calendar-production-desktop.png'),
        path.join(screenshotDir, 'teacher-classes-list-production-desktop.png'),
        path.join(screenshotDir, 'teacher-classes-production-desktop.png'),
        path.join(screenshotDir, 'teacher-classes-list-production-mobile.png'),
        path.join(screenshotDir, 'teacher-classes-production-mobile.png'),
      ],
    }, null, 2));
  } finally {
    await browser.close().catch(() => {});
  }
} finally {
  await Promise.all([
    ...Object.values(classIds).map((id) => adminDb.doc(`clases/${id}`).delete().catch(() => {})),
    teacher?.uid ? adminDb.doc(`profesores/${teacher.uid}`).delete().catch(() => {}) : null,
    teacher?.uid ? adminDb.doc(`users/${teacher.uid}`).delete().catch(() => {}) : null,
  ].filter(Boolean));
  if (teacher?.uid) await adminAuth.deleteUser(teacher.uid).catch(() => {});
  await deleteApp(adminApp).catch(() => {});
}
