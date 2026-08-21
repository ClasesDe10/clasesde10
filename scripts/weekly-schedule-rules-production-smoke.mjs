#!/usr/bin/env node

import process from 'node:process';
import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { chromium } from 'playwright';

const projectId = 'clasesde10-50add';
const smokeUrl = process.env.CD10_SMOKE_URL || 'https://clasesde10.com';
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const familyEmail = `weekly-family-${suffix}@example.com`;
const teacherEmail = `weekly-teacher-${suffix}@example.com`;
const familyPassword = `Tmp-Family-${suffix}-A1!`;
const teacherPassword = `Tmp-Teacher-${suffix}-A1!`;
const chatWithFamilyProposalId = `weekly_rules_family_${suffix}`;
const chatWithoutFamilyProposalId = `weekly_rules_empty_${suffix}`;
const familyProposalId = `family_${suffix}`;
const teacherCounterId = `teacher_counter_${suffix}`;
const teacherInitialId = `teacher_initial_${suffix}`;

const app = initializeApp({ credential: applicationDefault(), projectId }, `weekly-schedule-rules-${suffix}`);
const auth = getAuth(app);
const db = getFirestore(app);
let browser;
let familyUid = '';
let teacherUid = '';

function chatPayload(chatId) {
  return {
    assignmentId: chatId,
    asignacion_id: chatId,
    familyUid,
    familia_id: familyUid,
    teacherUid,
    profesor_id: teacherUid,
    studentId: `student_${suffix}`,
    alumno_id: `student_${suffix}`,
    participantUids: { [familyUid]: true, [teacherUid]: true },
    active: true,
    schedulingStatus: 'pendiente_horario',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

async function cleanupChat(chatId) {
  const chatRef = db.collection('chats').doc(chatId);
  const proposals = await chatRef.collection('programaciones').get();
  await Promise.all(proposals.docs.map((item) => item.ref.delete()));
  await chatRef.delete();
}

try {
  const [familyUser, teacherUser] = await Promise.all([
    auth.createUser({ email: familyEmail, password: familyPassword, emailVerified: true }),
    auth.createUser({ email: teacherEmail, password: teacherPassword, emailVerified: true }),
  ]);
  familyUid = familyUser.uid;
  teacherUid = teacherUser.uid;

  await Promise.all([
    db.collection('users').doc(familyUid).set({
      email: familyEmail,
      nombre: 'Familia temporal',
      role: 'familia',
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }),
    db.collection('users').doc(teacherUid).set({
      email: teacherEmail,
      nombre: 'Profesor temporal',
      role: 'profesor',
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }),
  ]);
  await Promise.all([
    db.collection('chats').doc(chatWithFamilyProposalId).set(chatPayload(chatWithFamilyProposalId)),
    db.collection('chats').doc(chatWithoutFamilyProposalId).set(chatPayload(chatWithoutFamilyProposalId)),
  ]);

  browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage();
  await page.goto(smokeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const result = await page.evaluate(async (input) => {
    const { signInWithEmailAndPassword, signOut } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js');
    const { doc, serverTimestamp, setDoc } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
    const { firebaseAuth, firebaseDb } = await import('/js/firebase-client.js');

    const proposal = ({ chatId, uid, role, supersedesProposalId = '' }) => ({
      assignmentId: chatId,
      familyUid: input.familyUid,
      teacherUid: input.teacherUid,
      studentId: input.studentId,
      kind: 'weekly_recurring',
      scheduleKind: 'weekly_recurring',
      firstClassDate: '2026-09-01',
      fecha: '2026-09-01',
      hora_inicio: '17:00',
      hora_fin: '18:00',
      durationMinutes: 60,
      recurrence: {
        frequency: 'weekly',
        dayOfWeek: 1,
        startTime: '17:00',
        endTime: '18:00',
        timezone: 'Europe/Madrid',
      },
      recurrenceLabel: 'Todos los martes, 17:00-18:00',
      status: 'propuesta',
      proposedByUid: uid,
      proposedByRole: role,
      proposedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...(supersedesProposalId ? { supersedesProposalId } : {}),
    });

    await signInWithEmailAndPassword(firebaseAuth, input.familyEmail, input.familyPassword);
    await setDoc(
      doc(firebaseDb, 'chats', input.chatWithFamilyProposalId, 'programaciones', input.familyProposalId),
      proposal({ chatId: input.chatWithFamilyProposalId, uid: input.familyUid, role: 'familia' }),
    );
    await signOut(firebaseAuth);

    await signInWithEmailAndPassword(firebaseAuth, input.teacherEmail, input.teacherPassword);
    let teacherInitialDenied = false;
    try {
      await setDoc(
        doc(firebaseDb, 'chats', input.chatWithoutFamilyProposalId, 'programaciones', input.teacherInitialId),
        proposal({ chatId: input.chatWithoutFamilyProposalId, uid: input.teacherUid, role: 'profesor' }),
      );
    } catch (error) {
      teacherInitialDenied = String(error?.code || '').includes('permission-denied');
      if (!teacherInitialDenied) throw error;
    }
    if (!teacherInitialDenied) throw new Error('La propuesta semanal inicial del profesor fue permitida inesperadamente.');

    await setDoc(
      doc(firebaseDb, 'chats', input.chatWithFamilyProposalId, 'programaciones', input.teacherCounterId),
      proposal({
        chatId: input.chatWithFamilyProposalId,
        uid: input.teacherUid,
        role: 'profesor',
        supersedesProposalId: input.familyProposalId,
      }),
    );
    await signOut(firebaseAuth);

    return {
      familyInitialAllowed: true,
      teacherInitialDenied,
      teacherCounterAllowed: true,
    };
  }, {
    familyEmail,
    familyPassword,
    teacherEmail,
    teacherPassword,
    familyUid,
    teacherUid,
    studentId: `student_${suffix}`,
    chatWithFamilyProposalId,
    chatWithoutFamilyProposalId,
    familyProposalId,
    teacherCounterId,
    teacherInitialId,
  });

  console.log(JSON.stringify({ ok: true, projectId, ...result }, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  await Promise.all([
    cleanupChat(chatWithFamilyProposalId).catch(() => {}),
    cleanupChat(chatWithoutFamilyProposalId).catch(() => {}),
  ]);
  await Promise.all([
    familyUid ? db.collection('users').doc(familyUid).delete().catch(() => {}) : null,
    teacherUid ? db.collection('users').doc(teacherUid).delete().catch(() => {}) : null,
  ]);
  await Promise.all([
    familyUid ? auth.deleteUser(familyUid).catch(() => {}) : null,
    teacherUid ? auth.deleteUser(teacherUid).catch(() => {}) : null,
  ]);
  await deleteApp(app).catch(() => {});
}
