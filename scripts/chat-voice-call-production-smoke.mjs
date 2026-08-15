#!/usr/bin/env node

import process from 'node:process';
import { chromium } from 'playwright';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const projectId = 'clasesde10-50add';
const baseUrl = (process.env.CD10_SMOKE_URL || 'https://clasesde10.com').replace(/\/$/, '');
const roundsArgument = process.argv.find((item) => item.startsWith('--rounds='))?.split('=')[1];
const rounds = Math.max(1, Math.min(8, Number.parseInt(roundsArgument || process.env.CD10_CALL_ROUNDS || '3', 10) || 3));
const forceRelay = process.argv.includes('--force-relay') || process.env.CD10_CALL_FORCE_RELAY === '1';
const forceFallback = process.argv.includes('--force-fallback') || process.env.CD10_CALL_FORCE_FALLBACK === '1';
const callKind = process.argv.includes('--video') || process.env.CD10_CALL_VIDEO === '1' ? 'video' : 'voice';
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = `Call-${suffix}-A1!`;
const familyEmail = `call-family-${suffix}@example.com`;
const teacherEmail = `call-teacher-${suffix}@example.com`;
const chatId = `call_smoke_${suffix}`.replace(/[^a-zA-Z0-9_-]/g, '_');
const studentId = `${chatId}_student`;

const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId });
const adminAuth = getAuth(app);
const adminDb = getFirestore(app);

let family = null;
let teacher = null;
const browsers = [];

function trackPageErrors(page, label) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`${label} pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label} console: ${message.text()}`);
  });
  return errors;
}

async function launchBrowser() {
  const options = {
    channel: 'chrome',
    headless: true,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
    ],
  };
  try {
    return await chromium.launch(options);
  } catch {
    return chromium.launch({ ...options, channel: undefined });
  }
}

async function createContextAndLogin({ email, role, browser }) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    permissions: ['microphone', 'camera'],
    serviceWorkers: 'block',
  });
  await context.grantPermissions(['microphone', 'camera'], { origin: baseUrl });
  const page = await context.newPage();
  const errors = trackPageErrors(page, role);
  await page.goto(`${baseUrl}/?call-smoke=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(async ({ loginEmail, loginPassword }) => {
    const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js');
    const { firebaseAuth } = await import('/js/firebase-client.js');
    await signInWithEmailAndPassword(firebaseAuth, loginEmail, loginPassword);
  }, { loginEmail: email, loginPassword: password });
  if (forceFallback) await page.evaluate(() => sessionStorage.setItem('cd10_call_transport', 'firestore'));
  else if (forceRelay) await page.evaluate(() => sessionStorage.setItem('cd10_call_transport', 'relay'));
  await page.goto(`${baseUrl}/pages/dashboard/${role}.html?call-smoke=${Date.now()}#chat`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForSelector('.sidebar-link[data-section="chat"]', { timeout: 30000 });
  await page.locator('.sidebar-link[data-section="chat"]').click();
  await page.waitForSelector('#section-chat', { state: 'visible', timeout: 20000 });
  await page.waitForSelector(`[data-chat-id="${chatId}"]`, { timeout: 30000 });
  await page.locator(`[data-chat-id="${chatId}"]`).click();
  await page.waitForSelector(`[data-chat-start-call="${callKind}"]`, { state: 'visible', timeout: 20000 });
  const cameraProbe = callKind === 'video' ? await page.evaluate(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      const result = stream.getTracks().map((track) => ({ kind: track.kind, state: track.readyState, label: track.label }));
      stream.getTracks().forEach((track) => track.stop());
      return { ok: true, tracks: result };
    } catch (error) {
      return { ok: false, name: error.name, message: error.message };
    }
  }) : null;
  return { context, page, errors, role, cameraProbe };
}

async function remoteAudioState(page) {
  return page.locator('[data-chat-voice-call-bar]').evaluate((bar) => {
    const audio = bar.querySelector('[data-chat-remote-audio]');
    const stream = audio.srcObject;
    const tracks = stream?.getAudioTracks?.() || [];
    const videoTracks = stream?.getVideoTracks?.() || [];
    return {
      trackCount: tracks.length,
      liveTracks: tracks.filter((track) => track.readyState === 'live').length,
      paused: audio.paused,
      muted: audio.muted,
      transport: bar.dataset.callTransport || '',
      fallbackLive: bar.dataset.callTransport === 'firestore' && bar.dataset.remoteAudio === 'live',
      videoTracks: videoTracks.length,
      liveVideoTracks: videoTracks.filter((track) => track.readyState === 'live').length,
      callKind: bar.dataset.callKind || '',
      localVideoTracks: bar.parentElement?.querySelector('[data-chat-local-video]')?.srcObject?.getVideoTracks?.().filter((track) => track.readyState === 'live').length || 0,
    };
  });
}

async function runCallRound(caller, answerer, round) {
  await caller.page.locator(`[data-chat-start-call="${callKind}"]`).click();
  await caller.page.waitForFunction(() => {
    const bar = document.querySelector('[data-chat-voice-call-bar]');
    return bar && !bar.hidden && /Llamando|Conectando/.test(bar.textContent || '');
  }, null, { timeout: 20000 });

  const join = answerer.page.locator('[data-chat-voice-call-bar] [data-chat-join-call]');
  await join.waitFor({ state: 'visible', timeout: 30000 });
  const callId = await join.getAttribute('data-chat-join-call');
  if (!callId) throw new Error(`Round ${round}: incoming call did not expose a call id.`);
  await join.click();
  await answerer.page.waitForTimeout(1200);
  const earlyAnswererState = await answerer.page.evaluate(() => ({
    bar: document.querySelector('[data-chat-voice-call-bar]')?.innerText || '',
    toasts: [...document.querySelectorAll('.toast')].map((item) => item.innerText).filter(Boolean),
  }));

  try {
    await Promise.all([caller.page, answerer.page].map((page) => page.waitForFunction(() => {
      const bar = document.querySelector('[data-chat-voice-call-bar]');
      return bar && !bar.hidden && /Conectada/.test(bar.textContent || '');
    }, null, { timeout: 30000 })));
  } catch (error) {
    const diagnostics = await Promise.all([caller, answerer].map(async (session) => ({
      role: session.role,
      cameraProbe: session.cameraProbe,
      devices: callKind === 'video' ? await session.page.evaluate(async () => (await navigator.mediaDevices.enumerateDevices()).map((device) => ({ kind: device.kind, label: device.label }))).catch(() => []) : [],
      bar: await session.page.locator('[data-chat-voice-call-bar]').innerText().catch(() => ''),
      callState: await session.page.locator('[data-chat-voice-call-bar]').getAttribute('data-call-state').catch(() => ''),
      visibleJoinButtons: await session.page.locator('[data-chat-join-call]:visible').count().catch(() => 0),
      toasts: await session.page.locator('.toast').allInnerTexts().catch(() => []),
    })));
    throw new Error(`Round ${round}: peers did not connect. Early answerer state: ${JSON.stringify(earlyAnswererState)} Final: ${JSON.stringify(diagnostics)} Cause: ${error.message}`);
  }

  await Promise.all([caller.page, answerer.page].map((page) => page.waitForFunction(() => {
    const bar = document.querySelector('[data-chat-voice-call-bar]');
    const audio = document.querySelector('[data-chat-remote-audio]');
    const webRtcLive = Boolean(audio?.srcObject?.getAudioTracks?.().some((track) => track.readyState === 'live'));
    const fallbackLive = bar?.dataset.callTransport === 'firestore' && bar?.dataset.remoteAudio === 'live';
    return webRtcLive || fallbackLive;
  }, null, { timeout: 20000 })));

  if (callKind === 'video') {
    try {
      await Promise.all([caller.page, answerer.page].map((page) => page.waitForFunction(() => {
        const audio = document.querySelector('[data-chat-remote-audio]');
        return Boolean(audio?.srcObject?.getVideoTracks?.().some((track) => track.readyState === 'live'));
      }, null, { timeout: 20000 })));
    } catch (error) {
      const [callerState, answererState, callSnapshot] = await Promise.all([
        remoteAudioState(caller.page),
        remoteAudioState(answerer.page),
        adminDb.doc(`chats/${chatId}/calls/${callId}`).get(),
      ]);
      throw new Error(`Round ${round}: video track timeout; probes=${JSON.stringify({ caller: caller.cameraProbe, answerer: answerer.cameraProbe })} caller=${JSON.stringify(callerState)} answerer=${JSON.stringify(answererState)} call=${JSON.stringify(callSnapshot.data() || {})}; cause=${error.message}`);
    }
  }

  const callerAudio = await remoteAudioState(caller.page);
  const answererAudio = await remoteAudioState(answerer.page);
  if ((!callerAudio.liveTracks && !callerAudio.fallbackLive) || (!answererAudio.liveTracks && !answererAudio.fallbackLive)) {
    throw new Error(`Round ${round}: remote audio is not live (${JSON.stringify({ callerAudio, answererAudio })}).`);
  }
  if (callKind === 'video' && (!callerAudio.liveVideoTracks || !answererAudio.liveVideoTracks)) {
    throw new Error(`Round ${round}: remote video is not live (${JSON.stringify({ callerAudio, answererAudio })}).`);
  }

  if (callKind === 'video') {
    const cameraButton = caller.page.locator('[data-chat-toggle-camera]');
    await cameraButton.click();
    await caller.page.waitForFunction(() => document.querySelector('[data-chat-toggle-camera]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5000 });
    await cameraButton.click();
    await caller.page.waitForFunction(() => document.querySelector('[data-chat-toggle-camera]')?.getAttribute('aria-pressed') === 'false', null, { timeout: 5000 });
  }

  const muteButton = caller.page.locator('[data-chat-toggle-mute]');
  await muteButton.click();
  await caller.page.waitForFunction(() => {
    const button = document.querySelector('[data-chat-toggle-mute]');
    return button?.getAttribute('aria-pressed') === 'true' && /Activar micro/.test(button.textContent || '');
  }, null, { timeout: 5000 });
  await muteButton.click();
  await caller.page.waitForFunction(() => {
    const button = document.querySelector('[data-chat-toggle-mute]');
    return button?.getAttribute('aria-pressed') === 'false' && /Silenciar/.test(button.textContent || '');
  }, null, { timeout: 5000 });

  await caller.page.locator('[data-chat-end-call]').click();
  await Promise.all([caller.page, answerer.page].map((page) => page.waitForFunction(() => {
    const bar = document.querySelector('[data-chat-voice-call-bar]');
    return !bar || bar.hidden;
  }, null, { timeout: 20000 })));

  return { round, callId, callKind, caller: caller.role, answerer: answerer.role, callerAudio, answererAudio, muteToggle: 'ok', cameraToggle: callKind === 'video' ? 'ok' : 'not_applicable', hangupSync: 'ok' };
}

async function seedProductionData() {
  family = await adminAuth.createUser({ email: familyEmail, password, emailVerified: true, displayName: 'Familia Prueba Llamadas' });
  teacher = await adminAuth.createUser({ email: teacherEmail, password, emailVerified: true, displayName: 'Profesor Prueba Llamadas' });
  const now = FieldValue.serverTimestamp();
  const participantUids = { [family.uid]: true, [teacher.uid]: true };
  const batch = adminDb.batch();
  batch.set(adminDb.doc(`users/${family.uid}`), {
    email: familyEmail, nombre: 'Familia Prueba', apellidos: 'Llamadas', role: 'familia', rol: 'familia', active: true, createdAt: now, updatedAt: now,
  });
  batch.set(adminDb.doc(`familias/${family.uid}`), {
    id: family.uid, userUid: family.uid, usuario_id: family.uid, email: familyEmail, nombre: 'Familia Prueba', apellidos: 'Llamadas', status: 'activo', active: true, createdAt: now, updatedAt: now,
  });
  batch.set(adminDb.doc(`users/${teacher.uid}`), {
    email: teacherEmail, nombre: 'Profesor Prueba', apellidos: 'Llamadas', role: 'profesor', rol: 'profesor', active: true, createdAt: now, updatedAt: now,
  });
  batch.set(adminDb.doc(`profesores/${teacher.uid}`), {
    id: teacher.uid, userUid: teacher.uid, usuario_id: teacher.uid, email: teacherEmail, nombre: 'Profesor Prueba', apellidos: 'Llamadas', estado_verificacion: 'verificado', verificationStatus: 'verificado', status: 'activo', active: true, createdAt: now, updatedAt: now,
  });
  batch.set(adminDb.doc(`alumnos/${studentId}`), {
    id: studentId, familia_id: family.uid, familyUid: family.uid, nombre: 'Alumno Prueba', apellidos: 'Llamadas', activo: true, active: true, createdAt: now, updatedAt: now,
  });
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
    materia: 'Matematicas',
    subject: 'Matematicas',
    familyName: 'Familia Prueba Llamadas',
    familia_nombre: 'Familia Prueba Llamadas',
    teacherName: 'Profesor Prueba Llamadas',
    profesor_nombre: 'Profesor Prueba Llamadas',
    studentName: 'Alumno Prueba Llamadas',
    alumno_nombre: 'Alumno Prueba Llamadas',
    participantUids,
    active: true,
    relationshipStatus: 'active',
    createdAt: now,
    updatedAt: now,
  });
  await batch.commit();
}

async function cleanupProductionData() {
  const jobs = [];
  jobs.push(adminDb.recursiveDelete(adminDb.doc(`chats/${chatId}`)).catch(() => {}));
  jobs.push(adminDb.doc(`alumnos/${studentId}`).delete().catch(() => {}));
  if (family?.uid) {
    jobs.push(adminDb.doc(`familias/${family.uid}`).delete().catch(() => {}));
    jobs.push(adminDb.doc(`users/${family.uid}`).delete().catch(() => {}));
    jobs.push(adminAuth.deleteUser(family.uid).catch(() => {}));
  }
  if (teacher?.uid) {
    jobs.push(adminDb.doc(`profesores/${teacher.uid}`).delete().catch(() => {}));
    jobs.push(adminDb.doc(`users/${teacher.uid}`).delete().catch(() => {}));
    jobs.push(adminAuth.deleteUser(teacher.uid).catch(() => {}));
  }
  await Promise.all(jobs);
}

try {
  await seedProductionData();
  const results = [];
  const browserErrors = [];
  let familySession = null;
  let teacherSession = null;
  for (let index = 0; index < rounds; index += 1) {
    if (!familySession || callKind === 'video') {
      const familyBrowser = await launchBrowser();
      browsers.push(familyBrowser);
      const teacherBrowser = callKind === 'video' ? await launchBrowser() : familyBrowser;
      if (teacherBrowser !== familyBrowser) browsers.push(teacherBrowser);
      familySession = await createContextAndLogin({ email: familyEmail, role: 'familia', browser: familyBrowser });
      teacherSession = await createContextAndLogin({ email: teacherEmail, role: 'profesor', browser: teacherBrowser });
    }
    const caller = index % 2 === 0 ? familySession : teacherSession;
    const answerer = index % 2 === 0 ? teacherSession : familySession;
    results.push(await runCallRound(caller, answerer, index + 1));
    if (callKind === 'video') {
      browserErrors.push(...familySession.errors, ...teacherSession.errors);
      await Promise.all([familySession.context.close(), teacherSession.context.close()]);
      familySession = null;
      teacherSession = null;
    }
  }
  if (familySession && teacherSession) browserErrors.push(...familySession.errors, ...teacherSession.errors);
  const relevantBrowserErrors = browserErrors
    .filter((message) => !/ERR_BLOCKED_BY_CLIENT|favicon/i.test(message));
  if (relevantBrowserErrors.length) throw new Error(`Browser errors during call smoke: ${relevantBrowserErrors.join(' | ')}`);
  console.log(JSON.stringify({ ok: true, baseUrl, projectId, chatId, rounds, callKind, forceRelay, forceFallback, results }, null, 2));
} finally {
  await Promise.all(browsers.map((item) => item.close().catch(() => {})));
  await cleanupProductionData();
}
