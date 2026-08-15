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

const ROLE_SECTIONS = {
  admin: [
    'dashboard',
    'operaciones',
    'clases',
    'calendario',
    'solicitudes',
    'pagos',
    'chats',
    'incidencias',
    'profesores',
    'familias',
    'alumnos',
    'finanzas',
    'leads',
    'ia',
    'analitica',
    'experimentos',
    'configuracion',
    'documentos',
    'auditoria',
  ],
  familia: ['inicio', 'calendario', 'clases', 'alumnos', 'solicitudes', 'pagos', 'chat', 'perfil'],
  profesor: ['inicio', 'calendario', 'clases', 'alumnos', 'ingresos', 'chat', 'perfil', 'documentos', 'disponibilidad'],
};

const SCREENSHOT_CASES = new Set([
  'admin:operaciones',
  'admin:clases',
  'profesor:calendario',
  'familia:chat',
]);

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

async function launchChrome() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

async function createRoleUser(token, role, suffix) {
  const email = `drawer-${role}-${suffix}@example.com`;
  const password = `Tmp-${suffix}-A1!`;
  const account = await identity('signUp', { email, password, returnSecureToken: true });
  const nowIso = new Date().toISOString();
  const uid = account.localId;
  const name = role === 'admin' ? 'Admin Drawer' : role === 'familia' ? 'Familia Drawer' : 'Profesor Drawer';

  await firestorePatch(token, `users/${uid}`, {
    email,
    nombre: name,
    apellidos: 'Smoke',
    role,
    rol: role,
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  if (role === 'familia') {
    await firestorePatch(token, `familias/${uid}`, {
      id: uid,
      userUid: uid,
      usuario_id: uid,
      email,
      nombre: name,
      apellidos: 'Smoke',
      status: 'activo',
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  if (role === 'profesor') {
    await firestorePatch(token, `profesores/${uid}`, {
      id: uid,
      userUid: uid,
      usuario_id: uid,
      email,
      nombre: name,
      apellidos: 'Smoke',
      status: 'activo',
      estado_verificacion: 'verificado',
      verificationStatus: 'verificado',
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  return { uid, email, password, idToken: account.idToken, role };
}

async function login(page, user) {
  await page.goto(`${baseUrl}/pages/login.html?drawer=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('#email').fill(user.email);
  await page.locator('#password').fill(user.password);
  await page.locator('#form-login').evaluate((form) => form.requestSubmit());
  await page.waitForFunction((role) => (
    window.location.pathname === `/pages/dashboard/${role}`
    || window.location.pathname === `/pages/dashboard/${role}.html`
  ), user.role, { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForSelector('.hamburger-btn', { timeout: 20000 });
}

function bgLooksOpaque(backgroundColor = '') {
  const raw = String(backgroundColor || '');
  if (/^rgb\(/i.test(raw)) return true;
  const match = raw.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\s*\)$/i);
  return match ? Number(match[1]) >= 0.98 : false;
}

async function openSection(page, section) {
  await page.evaluate((targetSection) => {
    const link = document.querySelector(`.sidebar-link[data-section="${targetSection}"]`);
    if (link) link.click();
    const sectionNode = document.getElementById(`section-${targetSection}`);
    if (sectionNode && getComputedStyle(sectionNode).display === 'none') {
      document.querySelectorAll('.dash-section[id]').forEach((item) => {
        item.style.display = item.id === `section-${targetSection}` ? '' : 'none';
      });
    }
    window.scrollTo(0, 0);
  }, section);
  await page.waitForTimeout(650);
}

async function auditDrawer(page, role, section) {
  await openSection(page, section);
  await page.locator('.hamburger-btn').click();
  await page.waitForTimeout(460);

  const state = await page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const topbar = document.querySelector('.topbar');
    const main = document.querySelector('.main-content');
    const sidebarStyle = sidebar ? getComputedStyle(sidebar) : null;
    const overlayStyle = overlay ? getComputedStyle(overlay) : null;
    const topbarStyle = topbar ? getComputedStyle(topbar) : null;
    const mainStyle = main ? getComputedStyle(main) : null;
    const rect = sidebar?.getBoundingClientRect();
    const visibleLinks = Array.from(document.querySelectorAll('.sidebar-link')).filter((link) => {
      const box = link.getBoundingClientRect();
      const style = getComputedStyle(link);
      return style.display !== 'none' && box.width > 1 && box.height > 1 && box.bottom > 0 && box.top < window.innerHeight;
    }).length;
    return {
      url: location.href,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      sidebarOpen: sidebar?.classList.contains('open') || false,
      htmlOpen: document.documentElement.classList.contains('sidebar-open'),
      bodyOpen: document.body.classList.contains('sidebar-open'),
      hamburgerExpanded: document.querySelector('.hamburger-btn')?.getAttribute('aria-expanded') || '',
      sidebarRect: rect ? {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      } : null,
      sidebarZ: Number(sidebarStyle?.zIndex || 0),
      overlayZ: Number(overlayStyle?.zIndex || 0),
      topbarZ: Number(topbarStyle?.zIndex || 0),
      overlayDisplay: overlayStyle?.display || '',
      overlayBg: overlayStyle?.backgroundColor || '',
      overlayOpacity: Number(overlayStyle?.opacity || 0),
      overlayBackdropFilter: overlayStyle?.backdropFilter || overlayStyle?.webkitBackdropFilter || '',
      sidebarWillChange: sidebarStyle?.willChange || '',
      sidebarTransform: sidebarStyle?.transform || '',
      mainFilter: mainStyle?.filter || '',
      topbarFilter: topbarStyle?.filter || '',
      bodyOverflow: getComputedStyle(document.body).overflow,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      visibleLinks,
    };
  });

  const failures = [];
  if (state.scrollWidth > state.clientWidth + 1) failures.push(`horizontal overflow ${state.scrollWidth}/${state.clientWidth}`);
  if (!state.sidebarOpen || !state.htmlOpen || !state.bodyOpen) failures.push('sidebar open classes missing');
  if (state.hamburgerExpanded !== 'true') failures.push('hamburger aria-expanded not true');
  if (!state.sidebarRect || Math.abs(state.sidebarRect.left) > 1 || state.sidebarRect.right < 240 || state.sidebarRect.right > state.clientWidth - 40) failures.push(`bad sidebar rect ${JSON.stringify(state.sidebarRect)}`);
  if (state.sidebarZ <= state.overlayZ || state.sidebarZ <= state.topbarZ) failures.push('sidebar z-index is not above overlay/topbar');
  if (state.overlayDisplay === 'none') failures.push('overlay hidden');
  if (state.overlayOpacity < 0.98 || !bgLooksOpaque(state.overlayBg)) failures.push(`overlay not opaque ${state.overlayBg} opacity=${state.overlayOpacity}`);
  if (!['none', ''].includes(state.overlayBackdropFilter)) failures.push(`overlay has backdrop filter ${state.overlayBackdropFilter}`);
  if (state.sidebarWillChange !== 'auto') failures.push(`sidebar will-change ${state.sidebarWillChange}`);
  if (state.sidebarTransform.includes('matrix3d')) failures.push(`sidebar transform ${state.sidebarTransform}`);
  if (state.mainFilter !== 'none' || state.topbarFilter !== 'none') failures.push(`unexpected page filter main=${state.mainFilter} topbar=${state.topbarFilter}`);
  if (state.visibleLinks < 3) failures.push(`too few visible links ${state.visibleLinks}`);

  const key = `${role}:${section}`;
  let screenshot = '';
  if (SCREENSHOT_CASES.has(key)) {
    fs.mkdirSync('output/playwright', { recursive: true });
    screenshot = `output/playwright/production-drawer-${role}-${section}.png`;
    await page.screenshot({ path: screenshot, fullPage: false });
  }

  await page.mouse.click(Math.min(state.clientWidth - 8, 382), 28);
  await page.waitForTimeout(180);
  const closed = await page.evaluate(() => ({
    sidebarOpen: document.querySelector('.sidebar')?.classList.contains('open') || false,
    htmlOpen: document.documentElement.classList.contains('sidebar-open'),
    bodyOpen: document.body.classList.contains('sidebar-open'),
    hamburgerExpanded: document.querySelector('.hamburger-btn')?.getAttribute('aria-expanded') || '',
  }));
  if (closed.sidebarOpen || closed.htmlOpen || closed.bodyOpen || closed.hamburgerExpanded !== 'false') {
    failures.push(`drawer did not close cleanly ${JSON.stringify(closed)}`);
  }

  return { role, section, ok: failures.length === 0, failures, state, screenshot };
}

const token = readFirebaseCliToken();
if (!token) throw new Error('Firebase CLI OAuth token unavailable.');

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.replace(/[^a-zA-Z0-9_-]/g, '_');
const created = [];
const results = [];
let browser = null;

try {
  for (const role of Object.keys(ROLE_SECTIONS)) {
    created.push(await createRoleUser(token, role, suffix));
  }

  browser = await launchChrome();
  for (const user of created) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36',
    });
    const page = await context.newPage();
    await login(page, user);
    for (const section of ROLE_SECTIONS[user.role]) {
      results.push(await auditDrawer(page, user.role, section));
    }
    await context.close();
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  await Promise.all(created.flatMap((user) => [
    firestoreDelete(token, `users/${user.uid}`).catch(() => {}),
    firestoreDelete(token, `familias/${user.uid}`).catch(() => {}),
    firestoreDelete(token, `profesores/${user.uid}`).catch(() => {}),
  ]));
  await Promise.all(created.map((user) => identity('delete', { idToken: user.idToken }).catch(() => {})));
}

const failures = results.filter((item) => !item.ok);
console.log(JSON.stringify({
  ok: failures.length === 0,
  baseUrl,
  projectId,
  checked: results.length,
  screenshots: results.map((item) => item.screenshot).filter(Boolean),
  failures,
}, null, 2));

if (failures.length) process.exit(1);
