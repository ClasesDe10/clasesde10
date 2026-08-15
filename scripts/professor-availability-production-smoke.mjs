#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const firebaseClientSource = fs.readFileSync('js/firebase-client.js', 'utf8');
const apiKey = firebaseClientSource.match(/apiKey:\s*'([^']+)'/)?.[1];
const projectId = firebaseClientSource.match(/projectId:\s*'([^']+)'/)?.[1] || 'clasesde10-50add';
const database = '(default)';
const baseUrl = (process.env.CD10_SMOKE_URL || 'https://clasesde10.com').replace(/\/$/, '');
const adminApp = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId });
const adminDb = getFirestore(adminApp);

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
  await adminDb.doc(docPath).set(data, { merge: true });
}

async function firestoreDelete(token, docPath) {
  await adminDb.doc(docPath).delete();
}

async function launchChrome() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

async function login(page, email, password) {
  await page.goto(`${baseUrl}/pages/login.html?smoke=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#form-login').evaluate((form) => form.requestSubmit());
  await page.waitForURL(/\/pages\/dashboard\/profesor(?:\.html)?(?:#.*)?$/, { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

const token = 'application-default';

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const smoke = {
  email: `availability-teacher-${suffix}@example.com`,
  password: `Tmp-${suffix}-A1!`,
};
let teacher = null;
let availabilityId = '';

try {
  teacher = await identity('signUp', {
    email: smoke.email,
    password: smoke.password,
    returnSecureToken: true,
  });

  const nowIso = new Date().toISOString();
  await firestorePatch(token, `users/${teacher.localId}`, {
    email: smoke.email,
    nombre: 'Profesor Smoke',
    apellidos: 'Disponibilidad',
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
    email: smoke.email,
    nombre: 'Profesor Smoke',
    apellidos: 'Disponibilidad',
    status: 'activo',
    verificationStatus: 'verificado',
    estado_verificacion: 'verificado',
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const browser = await launchChrome();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('dialog', (dialog) => dialog.accept());
  try {
    await login(page, smoke.email, smoke.password);
    await page.goto(`${baseUrl}/pages/dashboard/profesor.html?smoke=${Date.now()}#disponibilidad`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#section-disponibilidad .teacher-availability-hero', { timeout: 30000 });
    await page.waitForFunction(() => {
      const section = document.querySelector('#section-disponibilidad');
      const style = section ? getComputedStyle(section) : null;
      return section && style && style.display !== 'none';
    }, null, { timeout: 15000 });
    await page.waitForTimeout(220);

    const layout = await page.evaluate(() => {
      const main = document.querySelector('.main-content')?.getBoundingClientRect();
      const shell = document.querySelector('#section-disponibilidad .teacher-availability-shell')?.getBoundingClientRect();
      const hero = document.querySelector('#section-disponibilidad .teacher-availability-hero')?.getBoundingClientRect();
      const topbar = document.querySelector('.topbar')?.getBoundingClientRect();
      const addButton = document.querySelector('#btn-add-disponibilidad')?.getBoundingClientRect();
      return {
        viewportWidth: window.innerWidth,
        mainLeft: main?.left || 0,
        mainWidth: main?.width || 0,
        shellLeft: shell?.left || 0,
        shellWidth: shell?.width || 0,
        topbarBottom: topbar?.bottom || 0,
        heroTop: hero?.top || 0,
        heroHeight: hero?.height || 0,
        addButtonWidth: addButton?.width || 0,
      };
    });

    if (layout.shellLeft - layout.mainLeft > 72) {
      throw new Error(`Availability panel is shifted right: ${JSON.stringify(layout)}`);
    }
    if (layout.shellWidth < Math.min(760, Math.max(0, layout.viewportWidth - layout.mainLeft - 360))) {
      throw new Error(`Availability panel is too narrow: ${JSON.stringify(layout)}`);
    }
    if (layout.heroHeight < 64 || layout.addButtonWidth < 90) {
      throw new Error(`Availability header/action is not visible enough: ${JSON.stringify(layout)}`);
    }
    if (layout.heroTop < layout.topbarBottom + 8) {
      throw new Error(`Availability header is hidden under topbar: ${JSON.stringify(layout)}`);
    }

    await page.locator('#btn-add-disponibilidad').click();
    await page.locator('#modal-disponibilidad.open').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#disp-dia').selectOption('4');
    await page.locator('#disp-inicio').fill('10:00');
    await page.locator('#disp-fin').fill('11:30');
    await page.locator('#btn-guardar-disponibilidad').click();
    await page.locator('#modal-disponibilidad').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    await page.waitForFunction(() => {
      const text = document.querySelector('#tabla-disponibilidad')?.textContent || '';
      return /Viernes/.test(text) && /10:00\s*-\s*11:30/.test(text);
    }, null, { timeout: 20000 });

    const listLayout = await page.evaluate(() => {
      const list = document.querySelector('#tabla-disponibilidad .teacher-availability-list');
      const card = document.querySelector('#tabla-disponibilidad .teacher-availability-card');
      const shell = document.querySelector('#section-disponibilidad .teacher-availability-shell');
      const summaryText = document.querySelector('#teacher-availability-summary')?.textContent || '';
      const listRect = list?.getBoundingClientRect();
      const cardRect = card?.getBoundingClientRect();
      const shellRect = shell?.getBoundingClientRect();
      const style = list ? getComputedStyle(list) : null;
      return {
        listColumns: style?.gridTemplateColumns || '',
        listLeft: listRect?.left || 0,
        listWidth: listRect?.width || 0,
        cardLeft: cardRect?.left || 0,
        cardWidth: cardRect?.width || 0,
        cardHeight: cardRect?.height || 0,
        shellLeft: shellRect?.left || 0,
        shellWidth: shellRect?.width || 0,
        summaryText: summaryText.replace(/\s+/g, ' ').trim(),
      };
    });

    if (listLayout.cardLeft < listLayout.shellLeft - 1 || listLayout.cardWidth > listLayout.shellWidth + 1) {
      throw new Error(`Availability row overflows shell: ${JSON.stringify(listLayout)}`);
    }
    if (listLayout.cardHeight < 52 || listLayout.cardHeight > 104) {
      throw new Error(`Availability row height looks broken: ${JSON.stringify(listLayout)}`);
    }
    if (!/1\s*franja guardada/.test(listLayout.summaryText) || !/1\s*dia con disponibilidad/.test(listLayout.summaryText) || !/1\.5\s*h/.test(listLayout.summaryText)) {
      throw new Error(`Availability summary counters are not visible: ${JSON.stringify(listLayout)}`);
    }

    if (process.env.CD10_AVAILABILITY_SCREENSHOT) {
      const screenshotPath = path.resolve(process.env.CD10_AVAILABILITY_SCREENSHOT);
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }

    availabilityId = await page.locator('[data-action="eliminar-disponibilidad"]').first().getAttribute('data-id') || '';
    if (!availabilityId) throw new Error('Saved availability row did not expose a delete id.');

    const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await login(mobilePage, smoke.email, smoke.password);
      await mobilePage.goto(`${baseUrl}/pages/dashboard/profesor.html?smoke=${Date.now()}#disponibilidad`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await mobilePage.waitForSelector('#section-disponibilidad .teacher-availability-card', { state: 'visible', timeout: 30000 });
      const mobileLayout = await mobilePage.evaluate(() => {
        const shell = document.querySelector('#section-disponibilidad .teacher-availability-shell')?.getBoundingClientRect();
        const hero = document.querySelector('#section-disponibilidad .teacher-availability-hero')?.getBoundingClientRect();
        const addButton = document.querySelector('#btn-add-disponibilidad')?.getBoundingClientRect();
        const card = document.querySelector('#section-disponibilidad .teacher-availability-card')?.getBoundingClientRect();
        return {
          viewportWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          shellLeft: shell?.left || 0,
          shellRight: shell?.right || 0,
          heroWidth: hero?.width || 0,
          addButtonWidth: addButton?.width || 0,
          cardWidth: card?.width || 0,
        };
      });
      if (mobileLayout.scrollWidth > mobileLayout.viewportWidth + 1
        || mobileLayout.shellLeft < -1
        || mobileLayout.shellRight > mobileLayout.viewportWidth + 1
        || mobileLayout.addButtonWidth < 250
        || mobileLayout.cardWidth < 320) {
        throw new Error(`Mobile availability layout is unstable: ${JSON.stringify(mobileLayout)}`);
      }
      if (process.env.CD10_AVAILABILITY_MOBILE_SCREENSHOT) {
        const screenshotPath = path.resolve(process.env.CD10_AVAILABILITY_MOBILE_SCREENSHOT);
        fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
        await mobilePage.screenshot({ path: screenshotPath, fullPage: true });
      }
      await mobilePage.locator('#btn-add-disponibilidad').click();
      await mobilePage.locator('#modal-disponibilidad.open').waitFor({ state: 'visible', timeout: 10000 });
      await mobilePage.waitForTimeout(260);
      const modalLayout = await mobilePage.locator('#modal-disponibilidad .modal').evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
      });
      if (modalLayout.left < -1 || modalLayout.right > modalLayout.viewportWidth + 1 || modalLayout.top < -1 || modalLayout.bottom > modalLayout.viewportHeight + 1) {
        throw new Error(`Mobile availability modal escapes viewport: ${JSON.stringify(modalLayout)}`);
      }
      await mobilePage.locator('#modal-disponibilidad .modal-close').click();
    } finally {
      await mobilePage.close().catch(() => {});
    }

    await page.locator('[data-action="eliminar-disponibilidad"]').first().click();
    await page.locator('.action-dialog-overlay.open [data-action-dialog-confirm]').click();
    await page.waitForFunction(() => {
      const text = document.querySelector('#tabla-disponibilidad')?.textContent || '';
      return !/10:00\s*-\s*11:30/.test(text);
    }, null, { timeout: 20000 });

    console.log(JSON.stringify({
      ok: true,
      projectId,
      baseUrl,
      teacherUid: teacher.localId,
      availabilityId,
      layout,
      listLayout,
      mobile: 'passed',
    }, null, 2));
  } finally {
    await browser.close().catch(() => {});
  }
} finally {
  const deletePaths = [
    availabilityId ? `disponibilidad/${availabilityId}` : '',
    teacher?.localId ? `profesores/${teacher.localId}` : '',
    teacher?.localId ? `users/${teacher.localId}` : '',
  ].filter(Boolean);
  await Promise.all(deletePaths.map((item) => firestoreDelete(token, item).catch(() => {})));
  if (teacher?.idToken) await identity('delete', { idToken: teacher.idToken }).catch(() => {});
}
