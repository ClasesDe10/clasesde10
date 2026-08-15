#!/usr/bin/env node

import process from 'node:process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const projectId = 'clasesde10-50add';
const baseUrl = (process.env.CD10_SMOKE_URL || 'https://clasesde10.com').replace(/\/$/, '');
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = `Chat-${suffix}-A1!`;
const familyEmail = `chat-family-${suffix}@example.com`;
const teacherEmail = `chat-teacher-${suffix}@example.com`;
const chatId = `chat_message_smoke_${suffix}`.replace(/[^a-zA-Z0-9_-]/g, '_');
const studentId = `${chatId}_student`;
const firstMessage = `Mensaje de prueba ${suffix}`;
const replyMessage = `Respuesta de prueba ${suffix}`;

const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId });
const adminAuth = getAuth(app);
const adminDb = getFirestore(app);
let family = null;
let teacher = null;
let browser = null;

function trackErrors(page, label) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`${label} pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label} console: ${message.text()}`);
  });
  return errors;
}

async function createSession(email, role, viewport = { width: 1366, height: 900 }) {
  const context = await browser.newContext({
    viewport,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors = trackErrors(page, role);
  await page.goto(`${baseUrl}/?chat-message-smoke=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(async ({ loginEmail, loginPassword }) => {
    const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js');
    const { firebaseAuth } = await import('/js/firebase-client.js');
    await signInWithEmailAndPassword(firebaseAuth, loginEmail, loginPassword);
  }, { loginEmail: email, loginPassword: password });
  await page.goto(`${baseUrl}/pages/dashboard/${role}.html?chat-message-smoke=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForSelector('.sidebar-link[data-section="chat"]', { timeout: 30000 });
  try {
    await page.waitForSelector(`[data-chat-id="${chatId}"]`, { state: 'attached', timeout: 30000 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      url: location.href,
      chatHtml: document.querySelector('[data-chat-list]')?.innerHTML || '',
      toasts: [...document.querySelectorAll('.toast')].map((item) => item.textContent?.trim()).filter(Boolean),
      user: document.body?.dataset?.userRole || '',
    })).catch(() => ({}));
    throw new Error(`${role} did not load seeded chat: ${error.message}; browserErrors=${JSON.stringify(errors)}; diagnostics=${JSON.stringify(diagnostics)}`);
  }
  return { context, page, errors, role };
}

async function openChat(session) {
  if ((session.page.viewportSize()?.width || 1366) <= 720) {
    await session.page.locator('.hamburger-btn').click();
    await session.page.waitForSelector('.sidebar.open', { state: 'visible', timeout: 5000 });
  }
  await session.page.locator('.sidebar-link[data-section="chat"]').click();
  await session.page.waitForSelector('#section-chat', { state: 'visible', timeout: 15000 });
  await session.page.locator(`[data-chat-id="${chatId}"]`).click();
  await session.page.waitForSelector('[data-chat-input]', { state: 'visible', timeout: 15000 });
}

async function seed() {
  family = await adminAuth.createUser({ email: familyEmail, password, emailVerified: true, displayName: 'Familia Prueba Mensajes' });
  teacher = await adminAuth.createUser({ email: teacherEmail, password, emailVerified: true, displayName: 'Profesor Prueba Mensajes' });
  const now = FieldValue.serverTimestamp();
  const participantUids = { [family.uid]: true, [teacher.uid]: true };
  const batch = adminDb.batch();
  batch.set(adminDb.doc(`users/${family.uid}`), { email: familyEmail, nombre: 'Familia Prueba', apellidos: 'Mensajes', role: 'familia', rol: 'familia', active: true, createdAt: now, updatedAt: now });
  batch.set(adminDb.doc(`familias/${family.uid}`), { id: family.uid, userUid: family.uid, usuario_id: family.uid, email: familyEmail, nombre: 'Familia Prueba', apellidos: 'Mensajes', status: 'activo', active: true, createdAt: now, updatedAt: now });
  batch.set(adminDb.doc(`users/${teacher.uid}`), { email: teacherEmail, nombre: 'Profesor Prueba', apellidos: 'Mensajes', role: 'profesor', rol: 'profesor', active: true, createdAt: now, updatedAt: now });
  batch.set(adminDb.doc(`profesores/${teacher.uid}`), { id: teacher.uid, userUid: teacher.uid, usuario_id: teacher.uid, email: teacherEmail, nombre: 'Profesor Prueba', apellidos: 'Mensajes', estado_verificacion: 'verificado', verificationStatus: 'verificado', status: 'activo', active: true, createdAt: now, updatedAt: now });
  batch.set(adminDb.doc(`alumnos/${studentId}`), { id: studentId, familia_id: family.uid, familyUid: family.uid, nombre: 'Alumno Prueba', apellidos: 'Mensajes', activo: true, active: true, createdAt: now, updatedAt: now });
  batch.set(adminDb.doc(`chats/${chatId}`), {
    id: chatId,
    assignmentId: chatId,
    asignacion_id: chatId,
    familyUid: family.uid,
    familia_id: family.uid,
    teacherUid: teacher.uid,
    profesor_id: teacher.uid,
    studentId,
    alumno_id: studentId,
    materia: 'Matemáticas',
    familyName: 'Familia Prueba Mensajes',
    familia_nombre: 'Familia Prueba Mensajes',
    teacherName: 'Profesor Prueba Mensajes',
    profesor_nombre: 'Profesor Prueba Mensajes',
    studentName: 'Alumno Prueba Mensajes',
    alumno_nombre: 'Alumno Prueba Mensajes',
    participantUids,
    unreadBy: { [family.uid]: 0, [teacher.uid]: 0 },
    deliveredAtBy: {},
    readAtBy: {},
    lastMessage: '',
    lastMessageAt: null,
    active: true,
    relationshipStatus: 'active',
    createdAt: now,
    updatedAt: now,
  });
  await batch.commit();
}

async function cleanup() {
  const jobs = [
    adminDb.recursiveDelete(adminDb.doc(`chats/${chatId}`)).catch(() => {}),
    adminDb.doc(`alumnos/${studentId}`).delete().catch(() => {}),
  ];
  if (family?.uid) jobs.push(adminDb.doc(`familias/${family.uid}`).delete().catch(() => {}), adminDb.doc(`users/${family.uid}`).delete().catch(() => {}), adminAuth.deleteUser(family.uid).catch(() => {}));
  if (teacher?.uid) jobs.push(adminDb.doc(`profesores/${teacher.uid}`).delete().catch(() => {}), adminDb.doc(`users/${teacher.uid}`).delete().catch(() => {}), adminAuth.deleteUser(teacher.uid).catch(() => {}));
  await Promise.all(jobs);
}

try {
  await seed();
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  const familySession = await createSession(familyEmail, 'familia');
  const teacherSession = await createSession(teacherEmail, 'profesor');
  await openChat(familySession);

  const familyInput = familySession.page.locator('[data-chat-input]');
  await familyInput.fill(firstMessage);
  await teacherSession.page.waitForFunction(() => {
    const indicator = document.querySelector('[data-chat-typing-indicator]');
    return indicator && !indicator.hidden && /escribiendo/.test(indicator.textContent || '');
  }, null, { timeout: 10000 });
  await familyInput.press('Enter');

  await teacherSession.page.waitForFunction((expected) => {
    const badge = document.querySelector('.sidebar-link[data-section="chat"] [data-chat-nav-unread]');
    const item = document.querySelector('[data-chat-id]');
    return Number(badge?.textContent || 0) >= 1 && item?.textContent?.includes(expected);
  }, firstMessage, { timeout: 15000 });
  await familySession.page.waitForSelector('.chat-message.mine .chat-message-receipt.delivered', { timeout: 15000 });

  await openChat(teacherSession);
  await teacherSession.page.waitForFunction((expected) => document.querySelector('[data-chat-messages]')?.textContent?.includes(expected), firstMessage, { timeout: 15000 });
  await teacherSession.page.waitForFunction(() => !document.querySelector('.sidebar-link[data-section="chat"] [data-chat-nav-unread]')?.textContent, null, { timeout: 15000 });
  await familySession.page.waitForSelector('.chat-message.mine .chat-message-receipt.read', { timeout: 15000 });

  const teacherInput = teacherSession.page.locator('[data-chat-input]');
  await teacherInput.fill(replyMessage);
  await familySession.page.waitForFunction(() => {
    const indicator = document.querySelector('[data-chat-typing-indicator]');
    return indicator && !indicator.hidden && /escribiendo/.test(indicator.textContent || '');
  }, null, { timeout: 10000 });
  await teacherInput.press('Enter');
  await familySession.page.waitForFunction((expected) => document.querySelector('[data-chat-messages]')?.textContent?.includes(expected), replyMessage, { timeout: 15000 });
  await teacherSession.page.waitForSelector('.chat-message.mine .chat-message-receipt.read', { timeout: 15000 });

  await mkdir('output/playwright', { recursive: true });
  await teacherSession.page.screenshot({ path: 'output/playwright/chat-professional-desktop.png', fullPage: false });

  const search = teacherSession.page.locator('[data-chat-search]');
  await search.fill('Familia Prueba');
  if (await teacherSession.page.locator(`[data-chat-id="${chatId}"]`).count() !== 1) throw new Error('Conversation search did not preserve the matching chat.');
  await search.fill('No existe');
  await teacherSession.page.waitForSelector('.chat-list .chat-empty-state', { state: 'visible', timeout: 5000 });

  const mobileSession = await createSession(familyEmail, 'familia', { width: 390, height: 844 });
  await openChat(mobileSession);
  await mobileSession.page.waitForFunction((expected) => document.querySelector('[data-chat-messages]')?.textContent?.includes(expected), replyMessage, { timeout: 15000 });
  await mobileSession.page.screenshot({ path: 'output/playwright/chat-professional-mobile.png', fullPage: false });
  await mobileSession.page.locator('[data-chat-mobile-back]').click();
  await mobileSession.page.waitForFunction(() => !document.querySelector('[data-chat-shell]')?.classList.contains('chat-mobile-thread-open'), null, { timeout: 5000 });

  const errors = [...familySession.errors, ...teacherSession.errors, ...mobileSession.errors].filter((message) => !/favicon|ERR_BLOCKED_BY_CLIENT/i.test(message));
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    projectId,
    chatId,
    checks: ['typing_both_directions', 'unread_sidebar_badge', 'delivered_receipt', 'read_receipt', 'real_time_preview', 'conversation_search', 'desktop_visual', 'mobile_thread_navigation'],
  }, null, 2));
} finally {
  await browser?.close().catch(() => {});
  await cleanup();
}
