#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { chromium } from 'playwright';
import { normalizePublicLeadMetadata } from '../js/public-lead-metadata.js';

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'clasesde10-50add';
const firestoreEmulatorHost = String(process.env.FIRESTORE_EMULATOR_HOST || '').trim();
const authEmulatorHost = String(process.env.FIREBASE_AUTH_EMULATOR_HOST || '').trim();
const usingEmulators = Boolean(firestoreEmulatorHost && authEmulatorHost);
const smokeUrl = process.env.CD10_SMOKE_URL || (usingEmulators ? 'http://127.0.0.1:5000?firebase-emulator=1' : 'https://clasesde10.com');
const source = fs.readFileSync(new URL('../js/firebase-client.js', import.meta.url), 'utf8');
const apiKey = source.match(/apiKey:\s*'([^']+)'/)?.[1] || '';
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const leadId = `qa-assisted-family-${suffix}`;
const email = `qa-assisted-family-${suffix}@example.com`;
const password = `QA-Family-${suffix}-A1!`;
const studentId = `lead_${leadId}`;
const initialRequestId = `lead_${leadId}`;
const longNeed = [
  'Necesitamos apoyo intensivo y personalizado en Matemáticas para 3º de ESO,',
  'con especial atención a álgebra, ecuaciones, geometría, resolución de problemas,',
  'preparación de exámenes, organización del estudio y seguimiento semanal.',
  'Preferimos clases presenciales en Madrid los martes y jueves por la tarde,',
  'aunque también podemos valorar alguna sesión online de refuerzo cuando sea necesario.',
].join(' ');
const metadata = normalizePublicLeadMetadata({
  alumno: 'Alumno QA Flujo Completo',
  materia: longNeed,
  account_mode: 'assisted_parent_activation',
  canal: 'production_full_flow',
  consent_privacy: true,
});
const documentName = `projects/${projectId}/databases/(default)/documents/leadsPublicos/${leadId}`;
const firestoreOrigin = firestoreEmulatorHost ? `http://${firestoreEmulatorHost}` : 'https://firestore.googleapis.com';
const endpoint = `${firestoreOrigin}/v1/projects/${projectId}/databases/(default)/documents:commit?key=${encodeURIComponent(apiKey)}`;

const app = initializeApp({
  ...(usingEmulators ? {} : { credential: applicationDefault() }),
  projectId,
}, `assisted-family-${suffix}`);
const auth = getAuth(app);
const db = getFirestore(app);
let accountUid = '';

const stringValue = (value) => ({ stringValue: value });

async function deleteQuery(query) {
  const snapshot = await query.get().catch(() => null);
  if (!snapshot?.size) return;
  const commits = [];
  for (let index = 0; index < snapshot.docs.length; index += 400) {
    const batch = db.batch();
    snapshot.docs.slice(index, index + 400).forEach((item) => batch.delete(item.ref));
    commits.push(batch.commit());
  }
  await Promise.allSettled(commits);
}

async function cleanup() {
  if (!accountUid) accountUid = (await auth.getUserByEmail(email).catch(() => null))?.uid || '';

  if (accountUid) {
    const familyRequests = await db.collection('solicitudes').where('familyUid', '==', accountUid).get().catch(() => null);
    const requestIds = familyRequests?.docs.map((item) => item.id) || [];
    await Promise.allSettled([
      deleteQuery(db.collection('solicitudes').where('familyUid', '==', accountUid)),
      deleteQuery(db.collection('alumnos').where('familyUid', '==', accountUid)),
      deleteQuery(db.collection('auditLogs').where('actorUid', '==', accountUid)),
      deleteQuery(db.collection('analyticsEvents').where('userUid', '==', accountUid)),
      deleteQuery(db.collection('notificaciones').where('userUid', '==', accountUid)),
      ...requestIds.map((id) => deleteQuery(db.collection('automationEvents').where('entityId', '==', id))),
      db.doc(`familias/${accountUid}`).delete(),
      db.doc(`users/${accountUid}`).delete(),
    ]);
    await auth.deleteUser(accountUid).catch(() => null);
  }

  await Promise.allSettled([
    db.doc(`leadsPublicos/${leadId}`).delete(),
    db.doc(`solicitudes/${initialRequestId}`).delete(),
    db.doc(`alumnos/${studentId}`).delete(),
  ]);
  await deleteApp(app);
}

async function identity(method, payload) {
  const identityOrigin = authEmulatorHost
    ? `http://${authEmulatorHost}/identitytoolkit.googleapis.com`
    : 'https://identitytoolkit.googleapis.com';
  const response = await fetch(`${identityOrigin}/v1/accounts:${method}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  assert.equal(response.ok, true, `${method} failed: ${JSON.stringify(body)}`);
  return body;
}

try {
  assert(apiKey, 'No se pudo localizar la clave pública de Firebase.');
  assert(longNeed.length > 300, 'The smoke input must cover the former metadata overflow.');
  assert.equal(metadata.materia.length, 180, 'The auxiliary subject must respect Firestore rules.');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      writes: [{
        update: {
          name: documentName,
          fields: {
            tipo: stringValue('familia'),
            nombre: stringValue('Familia QA Flujo Completo'),
            email: stringValue(email),
            telefono: stringValue('+34600000000'),
            perfil: { nullValue: null },
            asunto: stringValue(`Profesor para ${longNeed.slice(0, 140)}`),
            mensaje: stringValue(longNeed),
            metadata: {
              mapValue: {
                fields: {
                  alumno: stringValue(metadata.alumno),
                  materia: stringValue(metadata.materia),
                  account_mode: stringValue(metadata.account_mode),
                  canal: stringValue(metadata.canal),
                  consent_privacy: { booleanValue: true },
                },
              },
            },
            estado: stringValue('nuevo'),
            accountStatus: stringValue('pending_activation'),
          },
        },
        updateTransforms: [
          { fieldPath: 'activationRequestedAt', setToServerValue: 'REQUEST_TIME' },
          { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
          { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
        ],
        currentDocument: { exists: false },
      }],
    }),
  });
  const result = await response.json().catch(() => ({}));
  assert.equal(response.ok, true, `Firestore rechazó el formulario largo: ${JSON.stringify(result)}`);

  const storedLead = await db.doc(`leadsPublicos/${leadId}`).get();
  assert.equal(storedLead.exists, true, 'The public family lead was not stored.');
  assert.equal(storedLead.get('metadata.materia').length, 180);
  assert.equal(storedLead.get('mensaje'), longNeed, 'The complete family explanation must be preserved.');

  const passwordPageUrl = new URL('/pages/crear-contrasena.html', smokeUrl);
  passwordPageUrl.searchParams.set('solicitud_asistida', leadId);
  if (usingEmulators) passwordPageUrl.searchParams.set('firebase-emulator', '1');
  const emailLink = await auth.generateSignInWithEmailLink(email, {
    url: passwordPageUrl.href,
    handleCodeInApp: true,
    ...(!usingEmulators ? { linkDomain: 'clasesde10.com' } : {}),
  });

  process.env.ASSISTED_FAMILY_EMAIL = email;
  process.env.ASSISTED_FAMILY_LINK = emailLink;
  process.env.ASSISTED_FAMILY_PASSWORD = password;
  const flowSource = fs.readFileSync(
    new URL('./assisted-family-full-flow.playwright.js', import.meta.url),
    'utf8',
  ).trim();
  const runFlow = Function(`"use strict"; return (${flowSource});`)();
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
    .catch(() => chromium.launch({ headless: true }));
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  let playwrightResult;
  try {
    await page.goto(smokeUrl, { waitUntil: 'domcontentloaded' });
    playwrightResult = await runFlow(page);
  } finally {
    await browser.close();
  }
  const playwrightOutput = JSON.stringify(playwrightResult);
  assert.doesNotMatch(playwrightOutput, /missing or insufficient permissions/i);

  const activatedLead = await db.doc(`leadsPublicos/${leadId}`).get();
  accountUid = activatedLead.get('accountUid') || '';
  assert(accountUid, 'The assisted lead was not linked to an account UID.');
  assert.equal(activatedLead.get('accountStatus'), 'activated');

  const [userSnap, familySnap, studentSnap, requestSnap, familyRequestsSnap] = await Promise.all([
    db.doc(`users/${accountUid}`).get(),
    db.doc(`familias/${accountUid}`).get(),
    db.doc(`alumnos/${studentId}`).get(),
    db.doc(`solicitudes/${initialRequestId}`).get(),
    db.collection('solicitudes').where('familyUid', '==', accountUid).get(),
  ]);
  assert.equal(userSnap.exists, true, 'The users profile was not created.');
  assert.equal(familySnap.exists, true, 'The family profile was not created.');
  assert.equal(studentSnap.exists, true, 'The student was not created.');
  assert.equal(requestSnap.exists, true, 'The initial request was not created.');
  assert.equal(userSnap.get('role'), 'familia');
  assert.equal(userSnap.get('passwordSetupRequired'), false, 'Password setup was not completed.');
  assert.equal(userSnap.get('profileCompletionRequired'), false, 'Family profile completion was not completed.');
  assert.equal(familySnap.get('profileComplete'), true, 'The family profile was not saved as complete.');
  assert.equal(studentSnap.get('familyUid'), accountUid);
  assert.equal(requestSnap.get('familyUid'), accountUid);
  assert.equal(requestSnap.get('publicLeadId'), leadId);

  const dashboardRequest = familyRequestsSnap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .find((item) => item.subject === 'Física y Química' && item.course === '3º ESO');
  assert(dashboardRequest, 'The authenticated dashboard request was not stored.');
  assert.equal(dashboardRequest.familyUid, accountUid);
  assert.equal(dashboardRequest.studentId, studentId);

  const passwordLogin = await identity('signInWithPassword', {
    email,
    password,
    returnSecureToken: true,
  });
  assert.equal(passwordLogin.localId, accountUid, 'Password login returned a different account.');

  const finalUser = await auth.getUser(accountUid);
  assert.equal(finalUser.emailVerified, true);
  assert(finalUser.providerData.some((provider) => provider.providerId === 'password'));

  console.log(JSON.stringify({
    ok: true,
    environment: usingEmulators ? 'firebase_emulators' : 'production',
    longPublicRequestAccepted: true,
    oneTimeEmailLinkVerified: true,
    passwordCreated: true,
    passwordLoginVerified: true,
    userFamilyStudentAndInitialRequestCreated: true,
    familyProfileCompleted: true,
    authenticatedDashboardRequestCreated: true,
    simplifiedPanelLimitedToDailySections: playwrightResult.simplifiedPanelLimitedToDailySections,
    panelPreferencePersisted: playwrightResult.panelPreferencePersisted,
    occasionalActionExpandedPanel: playwrightResult.occasionalActionExpandedPanel,
    mobilePanelValidated: playwrightResult.mobilePanelValidated,
    temporaryDataCleaned: true,
  }, null, 2));
} finally {
  await cleanup();
}
