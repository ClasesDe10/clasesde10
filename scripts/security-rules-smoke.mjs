#!/usr/bin/env node
/**
 * Production Firestore security smoke.
 *
 * Creates a temporary Firebase Auth user, executes real client-side Firestore
 * writes against the deployed rules, verifies sensitive operations are denied,
 * and removes temporary Auth/Firestore data afterwards.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const firebaseClientSource = fs.readFileSync('js/firebase-client.js', 'utf8');
const apiKey = firebaseClientSource.match(/apiKey:\s*'([^']+)'/)?.[1];
const projectId = firebaseClientSource.match(/projectId:\s*'([^']+)'/)?.[1] || 'clasesde10-50add';
const database = '(default)';
const smokeUrl = process.env.CD10_SMOKE_URL || 'https://clasesde10.com';

if (!apiKey) {
  console.error('ERROR: Firebase apiKey not found in js/firebase-client.js.');
  process.exit(1);
}

async function identity(method, payload) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} failed (${response.status}): ${body?.error?.message || JSON.stringify(body)}`);
  }
  return body;
}

function readFirebaseCliToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(configPath)) return null;
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return config?.tokens?.access_token || null;
}

async function firestoreDeleteWithCliToken(collection, id) {
  const token = readFirebaseCliToken();
  if (!token) return { ok: false, error: 'Firebase CLI OAuth token unavailable.' };

  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${database}/documents/${collection}/${id}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (response.status === 404) return { ok: true, missing: true };
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: body?.error?.message || JSON.stringify(body) };
  return { ok: true };
}

async function launchChrome() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

async function runBrowserSecuritySmoke(email, password) {
  const browser = await launchChrome();
  const page = await browser.newPage();
  try {
    await page.goto(smokeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    return await page.evaluate(async ({ email: loginEmail, password: loginPassword }) => {
      const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js');
      const {
        addDoc,
        collection,
        doc,
        getDoc,
        serverTimestamp,
        setDoc,
        updateDoc,
      } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
      const { firebaseAuth, firebaseDb } = await import('/js/firebase-client.js');

      const credential = await signInWithEmailAndPassword(firebaseAuth, loginEmail, loginPassword);
      const uid = credential.user.uid;
      const results = [];
      const temporaryDocumentIds = [];
      const temporaryPaymentScheduleIds = [];

      function isPermissionDenied(error) {
        return String(error?.code || '').includes('permission-denied')
          || /missing or insufficient permissions|permission-denied|PERMISSION_DENIED/i.test(String(error?.message || error || ''));
      }

      async function expectAllowed(name, action) {
        try {
          await action();
          results.push({ name, ok: true, allowed: true });
        } catch (error) {
          throw new Error(`${name} should be allowed but failed: ${error?.code || ''} ${error?.message || error}`);
        }
      }

      async function expectDenied(name, action) {
        try {
          await action();
        } catch (error) {
          if (isPermissionDenied(error)) {
            results.push({ name, ok: true, denied: true, code: error.code || 'permission-denied' });
            return;
          }
          throw new Error(`${name} failed with unexpected error: ${error?.code || ''} ${error?.message || error}`);
        }
        throw new Error(`${name} was unexpectedly allowed.`);
      }

      await expectAllowed('self user profile create', () => setDoc(doc(firebaseDb, 'users', uid), {
        email: loginEmail,
        nombre: 'Security Smoke',
        apellidos: 'Temporal',
        telefono: '600000000',
        role: 'familia',
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }));

      const paymentScheduleId = `security_schedule_${uid}_${Date.now()}`;
      temporaryPaymentScheduleIds.push(paymentScheduleId);
      const paymentScheduleRef = doc(firebaseDb, 'paymentSchedules', paymentScheduleId);
      const paymentScheduleIso = new Date().toISOString();
      const validPaymentSchedule = {
        id: paymentScheduleId,
        type: 'weekly_family_teacher_payment',
        status: 'active',
        active: true,
        ownerUid: uid,
        familyUid: uid,
        familia_id: uid,
        teacherUid: `teacher_${uid}`,
        profesor_id: `teacher_${uid}`,
        studentId: `student_${uid}`,
        alumno_id: `student_${uid}`,
        assignmentId: `assignment_${uid}`,
        asignacion_id: `assignment_${uid}`,
        frequency: 'quincenal',
        paymentFrequency: 'quincenal',
        frecuencia_pago: 'quincenal',
        recurrenceDays: 14,
        anchorDate: '2026-07-05',
        paymentAnchorDate: '2026-07-05',
        fecha_inicio_pago: '2026-07-05',
        dayOfWeek: 5,
        paymentDay: 5,
        dia_semana_pago: 5,
        time: '20:00',
        paymentTime: '20:00',
        hora_pago: '20:00',
        graceHours: 48,
        grace_hours: 48,
        label: 'Cada 15 dias desde 2026-07-05 20:00',
        notes: 'Security smoke payment schedule.',
        source: 'family_dashboard',
        updatedAtIso: paymentScheduleIso,
        createdAt: serverTimestamp(),
        created_at: paymentScheduleIso,
        updatedAt: serverTimestamp(),
        updated_at: paymentScheduleIso,
      };

      await expectAllowed('family can create own payment schedule', () => setDoc(paymentScheduleRef, validPaymentSchedule));

      await expectAllowed('family can update own payment schedule', () => setDoc(paymentScheduleRef, {
        notes: 'Security smoke payment schedule updated.',
        updatedAt: serverTimestamp(),
        updated_at: new Date().toISOString(),
        updatedAtIso: new Date().toISOString(),
      }, { merge: true }));

      await expectDenied('family cannot spoof payment schedule owner', () => setDoc(doc(firebaseDb, 'paymentSchedules', `${paymentScheduleId}_spoof`), {
        ...validPaymentSchedule,
        id: `${paymentScheduleId}_spoof`,
        ownerUid: 'another_user',
        familyUid: 'another_user',
        familia_id: 'another_user',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }));

      await expectDenied('non-admin cannot read another user profile', () => getDoc(doc(firebaseDb, 'users', 'security_other_user')));

      await expectDenied('self role escalation to admin', () => setDoc(doc(firebaseDb, 'users', uid), {
        role: 'admin',
        updatedAt: serverTimestamp(),
      }, { merge: true }));

      const nowIso = new Date().toISOString();
      const storagePath = `users/${uid}/documentos/security-smoke.pdf`;
      const documentId = `security_smoke_${uid}_${Date.now()}`;
      temporaryDocumentIds.push(documentId);
      const validDocument = {
        ownerUid: uid,
        usuario_id: uid,
        userUid: uid,
        profileId: uid,
        role: 'familia',
        ownerRole: 'familia',
        documentType: 'justificante_pago',
        tipo: 'justificante_pago',
        typeLabel: 'Justificante de pago',
        category: 'pagos',
        name: 'security-smoke.pdf',
        nombre: 'security-smoke.pdf',
        status: 'pendiente',
        estado: 'pendiente',
        storedStatus: 'pendiente',
        rawStatus: 'pendiente',
        verificationStatus: 'pendiente',
        verificationLevel: 'metadata_validada',
        version: 1,
        versions: [{
          version: 1,
          storagePath,
          uploadedAt: nowIso,
          uploadedByUid: uid,
          fileName: 'security-smoke.pdf',
          sizeBytes: 123,
          mimeType: 'application/pdf',
        }],
        history: [{
          at: nowIso,
          action: 'subido',
          actorUid: uid,
          note: 'Security smoke upload metadata.',
          metadata: { source: 'security_smoke' },
        }],
        storagePath,
        storage_path: storagePath,
        url: storagePath,
        sizeBytes: 123,
        tamano_bytes: 123,
        mimeType: 'application/pdf',
        mime_type: 'application/pdf',
        uploadedAt: nowIso,
        createdAt: nowIso,
        created_at: nowIso,
        updatedAt: nowIso,
        updated_at: nowIso,
        expiresAt: '',
        permissions: {
          visibility: 'owner',
          ownerUid: uid,
          ownerRole: 'familia',
          allowedRoles: ['familia'],
          allowedUids: [],
          adminCanRead: true,
          ownerCanRead: true,
          ownerCanReplace: true,
          publicVisible: false,
        },
        autoChecks: {
          hasPath: true,
          mimeAllowed: true,
          extensionAllowed: true,
          sizeAllowed: true,
          valid: true,
          checkedAt: nowIso,
          checksVersion: 'security-smoke',
        },
        automationFlags: {
          expired: false,
          expiresSoon: false,
          metadataValid: true,
          canAutoValidateMetadata: false,
        },
        documentCenterVersion: 'security-smoke',
      };

      await expectAllowed('owner can create pending document metadata', () => setDoc(doc(firebaseDb, 'documentos', documentId), validDocument));

      await expectDenied('owner cannot self-validate document', () => updateDoc(doc(firebaseDb, 'documentos', documentId), {
        status: 'validado',
        estado: 'validado',
        verificationStatus: 'validado',
        verificationLevel: 'validado_admin',
        updatedAt: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      await expectDenied('owner cannot create prevalidated document metadata', () => setDoc(doc(firebaseDb, 'documentos', `${documentId}_validated`), {
        ...validDocument,
        storagePath: `users/${uid}/documentos/security-smoke-validated.pdf`,
        storage_path: `users/${uid}/documentos/security-smoke-validated.pdf`,
        url: `users/${uid}/documentos/security-smoke-validated.pdf`,
        status: 'validado',
        estado: 'validado',
        verificationStatus: 'validado',
        verificationLevel: 'validado_admin',
      }));

      await expectDenied('owner cannot spoof another document owner', () => setDoc(doc(firebaseDb, 'documentos', `${documentId}_spoof`), {
        ...validDocument,
        ownerUid: 'another_user',
        usuario_id: 'another_user',
        userUid: 'another_user',
        storagePath: 'users/another_user/documentos/security-smoke.pdf',
        storage_path: 'users/another_user/documentos/security-smoke.pdf',
        url: 'users/another_user/documentos/security-smoke.pdf',
      }));

      await expectDenied('owner cannot create document metadata with external path', () => setDoc(doc(firebaseDb, 'documentos', `${documentId}_external`), {
        ...validDocument,
        storagePath: 'https://evil.example/security-smoke.pdf',
        storage_path: 'https://evil.example/security-smoke.pdf',
        url: 'https://evil.example/security-smoke.pdf',
      }));

      await expectDenied('non-admin cannot write platform configuration', () => setDoc(doc(firebaseDb, 'configuracion', 'security_smoke'), {
        enabled: true,
        updatedAt: serverTimestamp(),
      }, { merge: true }));

      await expectDenied('non-admin cannot spoof manual notification with external action', () => addDoc(collection(firebaseDb, 'notificaciones'), {
        userUid: uid,
        usuario_id: uid,
        title: 'Security Smoke',
        titulo: 'Security Smoke',
        body: 'External link spoof.',
        cuerpo: 'External link spoof.',
        type: 'admin_manual',
        category: 'admin',
        priority: 'normal',
        channels: ['internal'],
        payload: { type: 'admin_manual', url: 'https://evil.example/phishing' },
        actionUrl: 'https://evil.example/phishing',
        role: 'familia',
        readAt: null,
        leida: false,
        createdByUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }));

      return {
        uid,
        temporaryDocumentIds,
        temporaryPaymentScheduleIds,
        results,
      };
    }, { email, password });
  } finally {
    await browser.close().catch(() => {});
  }
}

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const tempEmail = `security-rules-${suffix}@example.com`;
const tempPassword = `Tmp-${suffix}-A1!`;
let idToken = null;
let uid = null;
let browserResult = null;
const cleanup = [];

try {
  const signUp = await identity('signUp', {
    email: tempEmail,
    password: tempPassword,
    returnSecureToken: true,
  });
  idToken = signUp.idToken;
  uid = signUp.localId;

  browserResult = await runBrowserSecuritySmoke(tempEmail, tempPassword);
  uid = browserResult.uid || uid;

  for (const documentId of browserResult.temporaryDocumentIds || []) {
    cleanup.push({ collection: 'documentos', id: documentId, ...(await firestoreDeleteWithCliToken('documentos', documentId)) });
  }
  for (const scheduleId of browserResult.temporaryPaymentScheduleIds || []) {
    cleanup.push({ collection: 'paymentSchedules', id: scheduleId, ...(await firestoreDeleteWithCliToken('paymentSchedules', scheduleId)) });
  }
  cleanup.push({ collection: 'users', id: uid, ...(await firestoreDeleteWithCliToken('users', uid)) });

  console.log(JSON.stringify({
    ok: true,
    projectId,
    smokeUrl,
    checked: browserResult.results.length,
    results: browserResult.results,
    cleanup,
  }, null, 2));
} finally {
  if (uid && !cleanup.some((item) => item.collection === 'users')) {
    try {
      cleanup.push({ collection: 'users', id: uid, ...(await firestoreDeleteWithCliToken('users', uid)) });
    } catch {}
  }
  if (browserResult?.temporaryDocumentIds?.length && !cleanup.some((item) => item.collection === 'documentos')) {
    for (const documentId of browserResult.temporaryDocumentIds) {
      try {
        cleanup.push({ collection: 'documentos', id: documentId, ...(await firestoreDeleteWithCliToken('documentos', documentId)) });
      } catch {}
    }
  }
  if (browserResult?.temporaryPaymentScheduleIds?.length && !cleanup.some((item) => item.collection === 'paymentSchedules')) {
    for (const scheduleId of browserResult.temporaryPaymentScheduleIds) {
      try {
        cleanup.push({ collection: 'paymentSchedules', id: scheduleId, ...(await firestoreDeleteWithCliToken('paymentSchedules', scheduleId)) });
      } catch {}
    }
  }
  if (idToken) {
    try {
      await identity('delete', { idToken });
    } catch (error) {
      console.error(`WARNING: could not delete temporary Firebase Auth user ${tempEmail}: ${error.message}`);
    }
  }
}
