#!/usr/bin/env node
/**
 * Authenticated production smoke for the four dashboards.
 * Creates clearly named temporary users, verifies the real deployed UI and
 * removes Auth/Firestore test data in a finally block.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { chromium } from 'playwright';

const root = process.cwd();
const firebaseSource = fs.readFileSync(path.join(root, 'js/firebase-client.js'), 'utf8');
const apiKey = firebaseSource.match(/apiKey:\s*'([^']+)'/)?.[1];
const projectId = firebaseSource.match(/projectId:\s*'([^']+)'/)?.[1] || 'clasesde10-50add';
const baseUrl = (process.env.CD10_SMOKE_URL || 'https://clasesde10.com').replace(/\/$/, '');
const adminApp = initializeApp({ credential: applicationDefault(), projectId }, `dashboard-professional-${Date.now()}`);
const adminDb = getFirestore(adminApp);

if (!apiKey) throw new Error('Firebase apiKey not found.');

async function firestoreWrite(collection, id, data) {
  await adminDb.doc(`${collection}/${id}`).set(data, { merge: true });
}

async function firestoreDelete(collection, id) {
  await adminDb.doc(`${collection}/${id}`).delete();
}

async function identity(method, payload) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Identity ${method} failed: ${body?.error?.message || response.status}`);
  return body;
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

const cases = [
  { role: 'familia', path: '/pages/dashboard/familia.html', profileCollection: 'familias', chatSection: 'chat' },
  { role: 'profesor', path: '/pages/dashboard/profesor.html', profileCollection: 'profesores', chatSection: 'chat' },
  { role: 'alumno', path: '/pages/dashboard/alumno.html', profileCollection: 'alumnos', chatSection: '' },
  { role: 'admin', path: '/pages/dashboard/admin.html', profileCollection: '', chatSection: 'chats' },
];

async function seedRole(role, uid, email) {
  const now = new Date().toISOString();
  await firestoreWrite('users', uid, {
    email,
    nombre: `Prueba ${role}`,
    apellidos: 'Produccion',
    role,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  if (role === 'familia') {
    await firestoreWrite('familias', uid, {
      userUid: uid, usuario_id: uid, email, nombre: 'Familia Prueba', apellidos: 'Produccion', active: true, status: 'activo', createdAt: now, updatedAt: now,
    });
  } else if (role === 'profesor') {
    await firestoreWrite('profesores', uid, {
      userUid: uid, usuario_id: uid, email, nombre: 'Profesor Prueba', apellidos: 'Produccion', active: true, status: 'pendiente_perfil', verificationStatus: 'pendiente_perfil', createdAt: now, updatedAt: now,
    });
  } else if (role === 'alumno') {
    await firestoreWrite('alumnos', uid, {
      userUid: uid, usuario_id: uid, email, nombre: 'Alumno Prueba', apellidos: 'Produccion', active: true, status: 'activo', createdAt: now, updatedAt: now,
    });
  }
}

async function auditDashboard(browser, testCase, credentials) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(async ({ email, password }) => {
      const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js');
      const { firebaseAuth } = await import('/js/firebase-client.js');
      await signInWithEmailAndPassword(firebaseAuth, email, password);
    }, credentials);
    await page.goto(`${baseUrl}${testCase.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.sidebar-link[data-section="notificaciones"]', { timeout: 30000 });
    await page.waitForTimeout(1800);

    const auditedSections = [];
    if (['familia', 'profesor'].includes(testCase.role)) {
      const sectionNames = await page.locator('.sidebar-link[data-section]').evaluateAll((links) => (
        [...new Set(links.map((link) => link.dataset.section).filter(Boolean))]
      ));
      for (const section of sectionNames) {
        await page.locator(`.sidebar-link[data-section="${section}"]`).first().click();
        await page.waitForSelector(`#section-${section}`, { state: 'visible', timeout: 20000 });
        await page.waitForTimeout(120);
        const sectionAudit = await page.evaluate((sectionId) => {
          const root = document.getElementById(`section-${sectionId}`);
          const rect = root?.getBoundingClientRect();
          return {
            visible: Boolean(root?.offsetParent),
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            outsideViewport: Boolean(rect && (rect.left < -2 || rect.right > document.documentElement.clientWidth + 2)),
          };
        }, section);
        if (!sectionAudit.visible || sectionAudit.overflow || sectionAudit.outsideViewport) {
          throw new Error(`${testCase.role}: section ${section} has a visibility or horizontal overflow problem.`);
        }
        auditedSections.push(section);
      }

      await page.locator('.sidebar-link[data-section="perfil"]').click();
      const profileConfig = testCase.role === 'profesor'
        ? {
          overview: '#teacher-profile-overview', edit: '#btn-editar-perfil-profesor', modal: '#modal-perfil-profesor',
          fields: ['p-nombre', 'p-apellidos', 'p-telefono', 'p-foto-file', 'p-direccion', 'p-ciudad', 'p-cp', 'p-colegio', 'p-centro-estudios', 'p-estudio-exacto', 'p-nota-bachillerato', 'p-nota-universidad', 'p-bio', 'p-especialidades', 'p-idiomas', 'p-certificaciones', 'p-experiencia', 'p-coche', 'p-bizum', 'p-disponibilidad'],
        }
        : {
          overview: '#family-profile-overview', edit: '#btn-editar-perfil-familia', modal: '#modal-perfil-familia',
          fields: ['p-nombre', 'p-apellidos', 'p-telefono', 'p-contacto-preferido', 'p-direccion', 'p-ciudad', 'p-cp', 'p-zona', 'p-emergencia-nombre', 'p-emergencia-telefono', 'p-idiomas', 'p-notas'],
        };
      await page.waitForSelector(profileConfig.overview, { state: 'visible', timeout: 20000 });
      if (await page.locator('#form-perfil').isVisible()) throw new Error(`${testCase.role}: profile form is still exposed on the page.`);
      await page.locator(profileConfig.edit).click();
      await page.waitForSelector(profileConfig.modal, { state: 'visible', timeout: 10000 });
      const profileDialog = await page.evaluate(({ modal, fields }) => {
        const overlay = document.querySelector(modal);
        const panel = overlay?.querySelector('.modal');
        const rect = panel?.getBoundingClientRect();
        return {
          dialogRole: panel?.getAttribute('role') || '',
          missingFields: fields.filter((id) => !document.getElementById(id)),
          overflow: Boolean(rect && (rect.left < -2 || rect.right > document.documentElement.clientWidth + 2)),
        };
      }, profileConfig);
      if (profileDialog.dialogRole !== 'dialog' || profileDialog.missingFields.length || profileDialog.overflow) {
        throw new Error(`${testCase.role}: profile dialog audit failed ${JSON.stringify(profileDialog)}.`);
      }
      await page.locator(`${profileConfig.modal} .modal-close`).click();

      if (testCase.role === 'familia') {
        await page.locator('#btn-documentos-familia').click();
        await page.waitForSelector('#modal-documentos-familia', { state: 'visible', timeout: 10000 });
        if (!await page.locator('#fam-upload-zone').isVisible() || !await page.locator('#fam-doc-file').count()) throw new Error('familia: documents dialog did not open.');
        await page.locator('#modal-documentos-familia .modal-close').click();
      } else {
        await page.locator('.sidebar-link[data-section="documentos"]').click();
        await page.locator('#btn-subir-documento-profesor').click();
        await page.waitForSelector('#modal-documento-profesor', { state: 'visible', timeout: 10000 });
        if (!await page.locator('#upload-zone').isVisible() || !await page.locator('#doc-file').count()) throw new Error('profesor: document upload dialog did not open.');
        await page.locator('#modal-documento-profesor .modal-close').click();
        await page.locator('.sidebar-link[data-section="ingresos"]').click();
        if (await page.locator('#btn-configurar-dia-cobro').isVisible()) {
          await page.locator('#btn-configurar-dia-cobro').click();
          await page.waitForSelector('#modal-dia-cobro-profesor', { state: 'visible', timeout: 10000 });
          await page.locator('#modal-dia-cobro-profesor .modal-close').click();
        }
      }
    }

    await page.locator('.sidebar-link[data-section="notificaciones"]').click();
    await page.waitForSelector('#section-notificaciones .notification-center-shell', { state: 'visible', timeout: 15000 });
    const desktop = await page.evaluate(() => {
      const shell = document.querySelector('#section-notificaciones .notification-center-shell');
      const card = document.querySelector('.stat-card, .card');
      const icon = document.querySelector('.stat-card-icon');
      const shellStyle = shell ? getComputedStyle(shell) : null;
      const cardStyle = card ? getComputedStyle(card) : null;
      return {
        title: document.querySelector('#notification-center-title')?.textContent?.trim() || '',
        copy: shell?.textContent || '',
        topbar: document.querySelector('#topbar-title')?.textContent?.trim() || '',
        shellRadius: parseFloat(shellStyle?.borderRadius || '99'),
        cardRadius: parseFloat(cardStyle?.borderRadius || '99'),
        cardBackgroundImage: cardStyle?.backgroundImage || '',
        statIconDisplay: icon ? getComputedStyle(icon).display : 'none',
        separateFromChat: !document.querySelector('#section-notificaciones [data-chat-layout]'),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    if (desktop.title !== 'Centro de avisos' || desktop.topbar !== 'Centro de avisos') throw new Error(`${testCase.role}: notification centre did not open.`);
    if (!desktop.copy.includes('Los mensajes están en Chat')) throw new Error(`${testCase.role}: chat separation copy is missing.`);
    if (!desktop.separateFromChat) throw new Error(`${testCase.role}: notifications are still embedded in Chat.`);
    if (desktop.shellRadius > 4.1 || desktop.cardRadius > 4.1) throw new Error(`${testCase.role}: excessive rounding remains.`);
    if (desktop.cardBackgroundImage && desktop.cardBackgroundImage !== 'none') throw new Error(`${testCase.role}: card gradient remains.`);
    if (desktop.statIconDisplay !== 'none') throw new Error(`${testCase.role}: decorative stat icons remain visible.`);
    if (desktop.overflow) throw new Error(`${testCase.role}: desktop horizontal overflow.`);

    await page.locator('.sidebar-link[data-section="calendario"]').click();
    await page.waitForSelector('.calendar-wrapper', { state: 'visible', timeout: 20000 });
    const calendar = await page.evaluate(() => {
      const colors = [...document.querySelectorAll('.calendar-legend-dot')]
        .map((node) => getComputedStyle(node).backgroundColor)
        .filter(Boolean);
      return {
        labels: document.querySelectorAll('.calendar-legend-item').length,
        colors: new Set(colors).size,
        chipRadius: parseFloat(getComputedStyle(document.querySelector('.calendar-legend-item')).borderRadius || '99'),
      };
    });
    if (!calendar.labels || calendar.colors > 5 || calendar.chipRadius > 3.1) throw new Error(`${testCase.role}: calendar semantic palette is inconsistent.`);

    if (testCase.chatSection) {
      await page.locator(`.sidebar-link[data-section="${testCase.chatSection}"]`).click();
      await page.waitForSelector('.chat-title', { state: 'visible', timeout: 20000 });
      const chat = await page.evaluate(() => ({
        title: document.querySelector('.chat-title')?.textContent?.trim() || '',
        notificationTabVisible: Boolean(document.querySelector('[data-chat-tab="notificaciones"]')?.offsetParent),
      }));
      if (chat.title !== 'Mensajes' || chat.notificationTabVisible) throw new Error(`${testCase.role}: Chat and notifications are not separated: ${JSON.stringify(chat)}.`);
    }

    await page.locator('#btn-notificaciones').click();
    await page.waitForSelector('#section-notificaciones .notification-center-shell', { state: 'visible', timeout: 10000 });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    if (mobileOverflow) throw new Error(`${testCase.role}: notification centre overflows on mobile.`);
    if (['familia', 'profesor'].includes(testCase.role)) {
      await page.evaluate(() => document.querySelector('.sidebar-link[data-section="perfil"]')?.click());
      const editSelector = testCase.role === 'profesor' ? '#btn-editar-perfil-profesor' : '#btn-editar-perfil-familia';
      const modalSelector = testCase.role === 'profesor' ? '#modal-perfil-profesor' : '#modal-perfil-familia';
      await page.waitForSelector(editSelector, { state: 'visible', timeout: 10000 });
      await page.locator(editSelector).click();
      await page.waitForSelector(modalSelector, { state: 'visible', timeout: 10000 });
      const mobileProfile = await page.evaluate((selector) => {
        const panel = document.querySelector(`${selector} .modal`);
        const rect = panel?.getBoundingClientRect();
        return {
          viewport: document.documentElement.clientWidth,
          pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          dialogOverflow: Boolean(rect && (rect.left < -2 || rect.right > document.documentElement.clientWidth + 2)),
        };
      }, modalSelector);
      if (mobileProfile.pageOverflow || mobileProfile.dialogOverflow) {
        throw new Error(`${testCase.role}: profile dialog overflows on mobile ${JSON.stringify(mobileProfile)}.`);
      }
      await page.locator(`${modalSelector} .modal-close`).click();
    }
    if (pageErrors.length) throw new Error(`${testCase.role}: browser errors: ${pageErrors.join(' | ')}`);

    return {
      role: testCase.role,
      auditedSections,
      notificationCenter: true,
      chatSeparated: !testCase.chatSection || true,
      calendarLabels: calendar.labels,
      calendarColors: calendar.colors,
      responsive: true,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

const browser = await launchBrowser();
const results = [];
try {
  for (const testCase of cases) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `dashboard-smoke-${testCase.role}-${suffix}@example.com`;
    const password = `Tmp-${suffix}-A1!`;
    let auth = null;
    try {
      auth = await identity('signUp', { email, password, returnSecureToken: true });
      await seedRole(testCase.role, auth.localId, email);
      results.push(await auditDashboard(browser, testCase, { email, password }));
    } finally {
      if (auth?.localId && testCase.profileCollection) await firestoreDelete(testCase.profileCollection, auth.localId).catch(() => {});
      if (auth?.localId) await firestoreDelete('users', auth.localId).catch(() => {});
      if (auth?.idToken) await identity('delete', { idToken: auth.idToken }).catch(() => {});
    }
  }
} finally {
  await browser.close().catch(() => {});
  await deleteApp(adminApp).catch(() => {});
}

console.log(JSON.stringify({ ok: true, baseUrl, projectId, results }, null, 2));
