#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const projectId = 'clasesde10-50add';
const baseUrl = (process.env.CD10_SMOKE_URL || 'https://clasesde10.com').replace(/\/$/, '');
const screenshotDir = path.resolve(process.env.CD10_DOCUMENTS_SCREENSHOT_DIR || 'output/playwright');
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `documents-teacher-${suffix}@example.com`;
const password = `Docs-${suffix}-A1!`;
const fileName = `documento-prueba-${suffix}.pdf`;

const app = getApps()[0] || initializeApp({
  credential: applicationDefault(),
  projectId,
  storageBucket: 'clasesde10-50add.firebasestorage.app',
});
const adminAuth = getAuth(app);
const adminDb = getFirestore(app);
const adminBucket = getStorage(app).bucket();

let user = null;
let browser = null;
const browserErrors = [];

function trackErrors(page, label) {
  page.on('pageerror', (error) => browserErrors.push(`${label} pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`${label} console: ${message.text()}`);
  });
}

async function createSession(viewport, label) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await context.newPage();
  trackErrors(page, label);
  await page.goto(`${baseUrl}/?documents-smoke=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(async ({ loginEmail, loginPassword }) => {
    const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js');
    const { firebaseAuth } = await import('/js/firebase-client.js');
    await signInWithEmailAndPassword(firebaseAuth, loginEmail, loginPassword);
  }, { loginEmail: email, loginPassword: password });
  await page.goto(`${baseUrl}/pages/dashboard/profesor.html?documents-smoke=${Date.now()}#documentos`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForSelector('#section-documentos .section-action-header', { state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => !/Cargando/.test(document.querySelector('#tbody-mis-docs')?.textContent || ''), null, { timeout: 30000 });
  return { context, page, label };
}

async function auditDocumentsLayout(session, screenshotLabel) {
  const { page } = session;
  const metrics = await page.evaluate(() => {
    const section = document.querySelector('#section-documentos')?.getBoundingClientRect();
    const header = document.querySelector('#section-documentos .section-action-header')?.getBoundingClientRect();
    const uploadButton = document.querySelector('#btn-subir-documento-profesor')?.getBoundingClientRect();
    const card = document.querySelector('#section-documentos > .card')?.getBoundingClientRect();
    const wrapper = document.querySelector('#section-documentos .table-wrapper')?.getBoundingClientRect();
    return {
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      sectionLeft: section?.left || 0,
      sectionRight: section?.right || 0,
      headerWidth: header?.width || 0,
      headerHeight: header?.height || 0,
      uploadButtonWidth: uploadButton?.width || 0,
      cardWidth: card?.width || 0,
      wrapperWidth: wrapper?.width || 0,
    };
  });
  if (metrics.scrollWidth > metrics.viewportWidth + 1
    || metrics.sectionLeft < -1
    || metrics.sectionRight > metrics.viewportWidth + 1
    || metrics.headerWidth < Math.min(330, metrics.viewportWidth - 30)
    || metrics.headerHeight < 90
    || metrics.uploadButtonWidth < 110
    || metrics.cardWidth < Math.min(330, metrics.viewportWidth - 30)
    || metrics.wrapperWidth > metrics.cardWidth + 1) {
    throw new Error(`${session.label} documents layout is unstable: ${JSON.stringify(metrics)}`);
  }

  await page.screenshot({ path: path.join(screenshotDir, `documents-professor-${screenshotLabel}.png`), fullPage: true });
  await page.locator('#btn-subir-documento-profesor').click();
  await page.locator('#modal-documento-profesor.open').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(260);
  const modal = await page.locator('#modal-documento-profesor .modal').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  const mobileViewport = modal.viewportWidth <= 640;
  if (modal.left < (mobileViewport ? -1 : 8)
    || modal.right > modal.viewportWidth - (mobileViewport ? -1 : 8)
    || modal.top < (mobileViewport ? -1 : 8)
    || modal.bottom > modal.viewportHeight + (mobileViewport ? 1 : -8)
    || modal.width < 300) {
    throw new Error(`${session.label} document modal escapes viewport: ${JSON.stringify(modal)}`);
  }
  await page.screenshot({ path: path.join(screenshotDir, `documents-professor-${screenshotLabel}-modal.png`), fullPage: false });
  return { metrics, modal };
}

async function uploadedRecords() {
  if (!user?.uid) return [];
  const snapshot = await adminDb.collection('documentos').where('ownerUid', '==', user.uid).get();
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function cleanup() {
  if (!user?.uid) return;
  const [documents, blobs, chunks] = await Promise.all([
    adminDb.collection('documentos').where('ownerUid', '==', user.uid).get().catch(() => null),
    adminDb.collection('documentBlobs').where('ownerUid', '==', user.uid).get().catch(() => null),
    adminDb.collection('documentBlobChunks').where('ownerUid', '==', user.uid).get().catch(() => null),
  ]);
  const records = documents?.docs.map((item) => item.data()) || [];
  await Promise.all(records.map((record) => {
    const storagePath = String(record.storage_path || record.storagePath || '').replace(/^\/+/, '');
    return storagePath ? adminBucket.file(storagePath).delete({ ignoreNotFound: true }).catch(() => {}) : Promise.resolve();
  }));
  await Promise.all([documents, blobs, chunks].flatMap((snapshot) => snapshot?.docs?.map((item) => item.ref.delete().catch(() => {})) || []));
  await Promise.all([
    adminDb.doc(`profesores/${user.uid}`).delete().catch(() => {}),
    adminDb.doc(`users/${user.uid}`).delete().catch(() => {}),
    adminAuth.deleteUser(user.uid).catch(() => {}),
  ]);
}

try {
  await mkdir(screenshotDir, { recursive: true });
  user = await adminAuth.createUser({ email, password, emailVerified: true, displayName: 'Profesor Prueba Documentos' });
  const now = FieldValue.serverTimestamp();
  await Promise.all([
    adminDb.doc(`users/${user.uid}`).set({ email, nombre: 'Profesor Prueba', apellidos: 'Documentos', role: 'profesor', rol: 'profesor', active: true, createdAt: now, updatedAt: now }),
    adminDb.doc(`profesores/${user.uid}`).set({ id: user.uid, userUid: user.uid, usuario_id: user.uid, email, nombre: 'Profesor Prueba', apellidos: 'Documentos', status: 'activo', active: true, verificationStatus: 'verificado', estado_verificacion: 'verificado', createdAt: now, updatedAt: now }),
  ]);

  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  const desktop = await createSession({ width: 1440, height: 900 }, 'desktop');
  const desktopLayout = await auditDocumentsLayout(desktop, 'desktop');
  await desktop.page.locator('#doc-tipo').selectOption('dni');
  await desktop.page.locator('#doc-file').setInputFiles({
    name: fileName,
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'),
  });
  await desktop.page.evaluate(() => {
    window.__documentsSmokeToasts = [];
    const observer = new MutationObserver(() => {
      document.querySelectorAll('.toast').forEach((item) => {
        const text = item.textContent?.replace(/\s+/g, ' ').trim();
        if (text && !window.__documentsSmokeToasts.includes(text)) window.__documentsSmokeToasts.push(text);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  await desktop.page.locator('#btn-subir-doc').click();
  try {
    await desktop.page.locator('#modal-documento-profesor').waitFor({ state: 'hidden', timeout: 30000 });
  } catch (error) {
    const diagnostics = await desktop.page.evaluate(() => ({
      progress: document.querySelector('#upload-progress')?.textContent || '',
      toasts: [...document.querySelectorAll('.toast')].map((item) => item.textContent?.replace(/\s+/g, ' ').trim()).filter(Boolean),
      toastHistory: window.__documentsSmokeToasts || [],
      fileLabel: document.querySelector('#upload-zone .upload-zone-title')?.textContent || '',
    }));
    const [records, blobs] = await Promise.all([
      uploadedRecords(),
      adminDb.collection('documentBlobs').where('ownerUid', '==', user.uid).get().then((snap) => snap.docs.map((item) => ({ id: item.id, ...item.data(), dataBase64: item.data().dataBase64 ? '[present]' : '' }))),
    ]);
    throw new Error(`Document upload did not finish: ${JSON.stringify({ ...diagnostics, records, blobs })}; browser=${JSON.stringify(browserErrors)}; cause=${error.message}`);
  }
  await desktop.page.waitForFunction((expected) => document.querySelector('#tbody-mis-docs')?.textContent?.includes(expected), fileName, { timeout: 30000 });
  const records = await uploadedRecords();
  if (records.length !== 1 || !String(records[0].storage_path || records[0].storagePath || '').includes('profesor/dni_')) {
    throw new Error(`Uploaded document record is incomplete: ${JSON.stringify(records)}`);
  }
  await desktop.page.screenshot({ path: path.join(screenshotDir, 'documents-professor-desktop-uploaded.png'), fullPage: true });

  const popupPromise = desktop.page.waitForEvent('popup', { timeout: 15000 });
  await desktop.page.locator('[data-action="ver-doc-prof"]').click();
  const popup = await popupPromise;
  await popup.waitForURL((url) => url.href !== 'about:blank', { timeout: 15000 }).catch(() => {});
  await popup.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
  if (!popup.url() || popup.url() === 'about:blank') throw new Error('View document action did not open the uploaded file.');
  await popup.close().catch(() => {});

  const mobile = await createSession({ width: 390, height: 844 }, 'mobile');
  const mobileLayout = await auditDocumentsLayout(mobile, 'mobile');
  await mobile.page.locator('#modal-documento-profesor .modal-close').click();
  await mobile.page.locator('#modal-documento-profesor').waitFor({ state: 'hidden', timeout: 5000 });

  const errors = browserErrors.filter((message) => !/favicon|ERR_BLOCKED_BY_CLIENT/i.test(message));
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    projectId,
    teacherUid: user.uid,
    fileName,
    checks: ['desktop_layout', 'mobile_layout', 'desktop_modal', 'mobile_modal', 'upload', 'list_refresh', 'view_document'],
    desktopLayout,
    mobileLayout,
  }, null, 2));
} finally {
  await browser?.close().catch(() => {});
  await cleanup();
}
