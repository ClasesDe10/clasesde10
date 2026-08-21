import { chromium } from 'playwright';

const args = process.argv.slice(2);
const urlArgIndex = args.indexOf('--url');
const baseUrl = (urlArgIndex >= 0 ? args[urlArgIndex + 1] : 'https://clasesde10.com').replace(/\/$/, '');

const credentials = {
  adminEmail: process.env.CD10_ADMIN_EMAIL,
  adminPassword: process.env.CD10_ADMIN_PASSWORD,
  familyEmail: process.env.CD10_FAMILY_EMAIL,
  familyPassword: process.env.CD10_FAMILY_PASSWORD,
  teacherEmail: process.env.CD10_TEACHER_EMAIL,
  teacherPassword: process.env.CD10_TEACHER_PASSWORD,
};
const debug = {};
const smokeId = `cd10_class_flow_e2e_${Date.now()}`;
const cleanupTargets = { smokeId };
let cleanupDone = false;

for (const [key, value] of Object.entries(credentials)) {
  if (!value) throw new Error(`${key} is required through environment variables.`);
}

function classIdFromProposal(chatId, proposalId) {
  return `chat_${chatId}_${proposalId}`.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 900);
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function nextWeekdayDate(targetDay = 2, minimumDaysAhead = 14) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + minimumDaysAhead);
  const diff = (targetDay - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + diff);
  return isoDate(date);
}

function pastClassDate(daysAgo = 2) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return isoDate(date);
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  const consoleEvents = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) consoleEvents.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => consoleEvents.push(`pageerror: ${error.message}`));

  async function logout() {
    await page.evaluate(async () => {
      const { signOut } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js');
      const { firebaseAuth } = await import('/js/firebase-client.js');
      await signOut(firebaseAuth).catch(() => {});
      localStorage.clear();
      sessionStorage.clear();
    }).catch(() => {});
  }

  async function login(email, password, expectedRole) {
    await logout();
    await page.goto(`${baseUrl}/pages/login.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('#form-login').evaluate((form) => form.requestSubmit());
    await page.waitForURL(new RegExp(`/pages/dashboard/${expectedRole}(?:\\.html)?(?:#.*)?$`), { timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  }

  async function currentUserInfo() {
    return page.evaluate(() => ({
      uid: window.CD10CurrentUser?.uid || window.CD10CurrentUser?.id || '',
      email: window.CD10CurrentUser?.email || '',
      role: window.CD10CurrentUser?.role || window.CD10CurrentUser?.rol || '',
    }));
  }

  async function openChatById(chatId) {
    await page.locator('[data-section="chat"], [data-section="chats"]').first().click();
    await page.waitForSelector('[data-chat-tab="chats"]', { timeout: 25000 });
    await page.locator('[data-chat-tab="chats"]').click();
    await page.waitForSelector('[data-chat-list]', { timeout: 25000 });
    const chat = page.locator(`[data-chat-id="${chatId}"]`).first();
    await chat.waitFor({ state: 'visible', timeout: 25000 }).catch(async () => {
      debug.chatListText = (await page.locator('[data-chat-list]').textContent().catch(() => '')).slice(0, 2000);
      throw new Error(`No aparece el chat temporal ${chatId} para esta cuenta.`);
    });
    await chat.click();
    await page.waitForSelector('[data-chat-schedule-panel]', { timeout: 25000 });
    return chatId;
  }

  async function createSmokeRelationship(familyUid, teacherUid, adminUid) {
    await page.evaluate(async ({ smokeId: currentSmokeId, familyUid: currentFamilyUid, teacherUid: currentTeacherUid, adminUid: currentAdminUid }) => {
      const {
        doc,
        serverTimestamp,
        setDoc,
      } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
      const { firebaseDb } = await import('/js/firebase-client.js');
      const studentId = `${currentSmokeId}_student`;
      const teacherAvailabilityId = `${currentSmokeId}_teacher_availability`;
      const studentAvailabilityId = `${currentSmokeId}_student_availability`;
      const participantUids = {
        [currentAdminUid]: true,
        [currentFamilyUid]: true,
        [currentTeacherUid]: true,
      };
      const base = {
        id: currentSmokeId,
        requestId: currentSmokeId,
        solicitud_id: currentSmokeId,
        familyUid: currentFamilyUid,
        familia_id: currentFamilyUid,
        teacherUid: currentTeacherUid,
        profesor_id: currentTeacherUid,
        studentId,
        alumno_id: studentId,
        materia: 'Matematicas E2E',
        subject: 'Matematicas E2E',
        active: true,
        activa: true,
        status: 'activa',
        estado: 'activa',
        schedulingStatus: 'pendiente_horario',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(firebaseDb, 'asignaciones', currentSmokeId), base);
      await setDoc(doc(firebaseDb, 'chats', currentSmokeId), {
        ...base,
        assignmentId: currentSmokeId,
        asignacion_id: currentSmokeId,
        familyName: 'Familia E2E',
        teacherName: 'Profesor E2E',
        studentName: 'Alumno E2E',
        participantUids,
        lastMessage: 'Chat temporal para prueba automatica de flujo de clase',
        lastMessageAt: serverTimestamp(),
      });
      await setDoc(doc(firebaseDb, 'disponibilidad', teacherAvailabilityId), {
        id: teacherAvailabilityId,
        assignmentId: currentSmokeId,
        scope: 'teacher',
        teacherUid: currentTeacherUid,
        profesor_id: currentTeacherUid,
        dayIndex: 1,
        dia_semana: 1,
        startTime: '21:00',
        hora_inicio: '21:00',
        endTime: '22:00',
        hora_fin: '22:00',
        active: true,
        source: 'class_flow_e2e',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(firebaseDb, 'disponibilidad', studentAvailabilityId), {
        id: studentAvailabilityId,
        assignmentId: currentSmokeId,
        scope: 'student',
        familyUid: currentFamilyUid,
        familia_id: currentFamilyUid,
        studentId,
        alumno_id: studentId,
        dayIndex: 1,
        dia_semana: 1,
        startTime: '21:00',
        hora_inicio: '21:00',
        endTime: '22:00',
        hora_fin: '22:00',
        active: true,
        source: 'class_flow_e2e',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }, { smokeId, familyUid, teacherUid, adminUid });
  }

  async function createPastClass(classId, subject, classDate) {
    await page.evaluate(async ({ smokeId: currentSmokeId, classId: currentClassId, subject: currentSubject, classDate: currentClassDate }) => {
      const {
        doc,
        getDoc,
        serverTimestamp,
        setDoc,
      } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
      const { firebaseDb } = await import('/js/firebase-client.js');
      const chatSnap = await getDoc(doc(firebaseDb, 'chats', currentSmokeId));
      if (!chatSnap.exists()) throw new Error(`Chat no encontrado para clase pasada: ${currentSmokeId}`);
      const chat = chatSnap.data();
      const participantUids = chat.participantUids || {
        [chat.familyUid || chat.familia_id]: true,
        [chat.teacherUid || chat.profesor_id]: true,
      };
      await setDoc(doc(firebaseDb, 'clases', currentClassId), {
        id: currentClassId,
        assignmentId: currentSmokeId,
        asignacion_id: currentSmokeId,
        chatId: currentSmokeId,
        familyUid: chat.familyUid || chat.familia_id,
        familia_id: chat.familia_id || chat.familyUid,
        teacherUid: chat.teacherUid || chat.profesor_id,
        profesor_id: chat.profesor_id || chat.teacherUid,
        studentId: chat.studentId || chat.alumno_id,
        alumno_id: chat.alumno_id || chat.studentId,
        studentName: chat.studentName || 'Alumno E2E',
        alumno_nombre: chat.studentName || 'Alumno E2E',
        teacherName: chat.teacherName || 'Profesor E2E',
        profesor_nombre: chat.teacherName || 'Profesor E2E',
        familyName: chat.familyName || 'Familia E2E',
        materia: currentSubject,
        subject: currentSubject,
        fecha: currentClassDate,
        date: currentClassDate,
        hora_inicio: '09:00',
        startTime: '09:00',
        hora_fin: '10:00',
        endTime: '10:00',
        duracion_minutos: 60,
        durationMinutes: 60,
        precio_total: 30,
        amount: 30,
        familyAmount: 30,
        importe_profesor: 22,
        teacherAmount: 22,
        comision_clasesde10: 8,
        platformFee: 8,
        estado: 'confirmada',
        status: 'confirmada',
        lifecycleStatus: 'clase_programada',
        attendanceStatus: 'pendiente',
        familyPaymentStatus: 'pendiente',
        paymentStatus: 'pendiente',
        teacherPaymentStatus: 'pendiente',
        participantUids,
        source: 'class_flow_attendance_e2e',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }, { smokeId, classId, subject, classDate });
  }

  async function cleanupTestArtifacts() {
    if (cleanupDone || !cleanupTargets.smokeId) return;
    await login(credentials.adminEmail, credentials.adminPassword, 'admin');
    await page.evaluate(async ({ targets }) => {
      const {
        collection,
        deleteDoc,
        doc,
        getDocs,
        query,
        where,
      } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
      const { firebaseDb } = await import('/js/firebase-client.js');
      const chatRef = doc(firebaseDb, 'chats', targets.smokeId);
      const proposalSnap = await getDocs(collection(chatRef, 'programaciones')).catch(() => ({ docs: [] }));
      const messageSnap = await getDocs(collection(chatRef, 'mensajes')).catch(() => ({ docs: [] }));
      const classQueries = [
        getDocs(query(collection(firebaseDb, 'clases'), where('assignmentId', '==', targets.smokeId))).catch(() => ({ docs: [] })),
      ];
      if (targets.classId) {
        classQueries.push(getDocs(query(collection(firebaseDb, 'clases'), where('classId', '==', targets.classId))).catch(() => ({ docs: [] })));
      }
      const busyQueries = [
        getDocs(query(collection(firebaseDb, 'busySlots'), where('assignmentId', '==', targets.smokeId))).catch(() => ({ docs: [] })),
      ];
      const availabilityQueries = [
        getDocs(query(collection(firebaseDb, 'disponibilidad'), where('assignmentId', '==', targets.smokeId))).catch(() => ({ docs: [] })),
      ];
      if (targets.classId) {
        busyQueries.push(getDocs(query(collection(firebaseDb, 'busySlots'), where('classId', '==', targets.classId))).catch(() => ({ docs: [] })));
      }
      if (targets.proposalId) {
        busyQueries.push(getDocs(query(collection(firebaseDb, 'busySlots'), where('scheduleProposalId', '==', targets.proposalId))).catch(() => ({ docs: [] })));
      }
      const notificationQueries = [
        getDocs(query(collection(firebaseDb, 'notificaciones'), where('payload.chatId', '==', targets.smokeId))).catch(() => ({ docs: [] })),
        getDocs(query(collection(firebaseDb, 'notificaciones'), where('payload.assignmentId', '==', targets.smokeId))).catch(() => ({ docs: [] })),
      ];
      const incidentQueries = [
        getDocs(query(collection(firebaseDb, 'incidencias'), where('assignmentId', '==', targets.smokeId))).catch(() => ({ docs: [] })),
        getDocs(query(collection(firebaseDb, 'incidencias'), where('asignacion_id', '==', targets.smokeId))).catch(() => ({ docs: [] })),
      ];
      if (targets.classId) {
        incidentQueries.push(getDocs(query(collection(firebaseDb, 'incidencias'), where('classId', '==', targets.classId))).catch(() => ({ docs: [] })));
      }
      if (targets.givenClassId) {
        incidentQueries.push(getDocs(query(collection(firebaseDb, 'incidencias'), where('classId', '==', targets.givenClassId))).catch(() => ({ docs: [] })));
      }
      if (targets.issueClassId) {
        incidentQueries.push(getDocs(query(collection(firebaseDb, 'incidencias'), where('classId', '==', targets.issueClassId))).catch(() => ({ docs: [] })));
      }
      const [classSnaps, busySnaps, availabilitySnaps, notificationSnaps, incidentSnaps] = await Promise.all([
        Promise.all(classQueries),
        Promise.all(busyQueries),
        Promise.all(availabilityQueries),
        Promise.all(notificationQueries),
        Promise.all(incidentQueries),
      ]);
      const refs = new Map();
      [
        ...(proposalSnap.docs || []),
        ...(messageSnap.docs || []),
        ...classSnaps.flatMap((snap) => snap.docs || []),
        ...busySnaps.flatMap((snap) => snap.docs || []),
        ...availabilitySnaps.flatMap((snap) => snap.docs || []),
        ...notificationSnaps.flatMap((snap) => snap.docs || []),
        ...incidentSnaps.flatMap((snap) => snap.docs || []),
      ].forEach((item) => refs.set(item.ref.path, item.ref));
      await Promise.all([...refs.values()].map((ref) => deleteDoc(ref).catch(() => {})));
      await deleteDoc(chatRef).catch(() => {});
      await deleteDoc(doc(firebaseDb, 'asignaciones', targets.smokeId)).catch(() => {});
    }, { targets: cleanupTargets });
    cleanupDone = true;
  }

  async function selectCalendarDate(date) {
    await page.waitForSelector('#calendario-wrapper .calendar-day[data-fecha]', { timeout: 25000 });
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const dateButton = page.locator(`[data-fecha="${date}"]`).first();
      if (await dateButton.count()) {
        await dateButton.click();
        return;
      }
      const range = await page.locator('#calendario-wrapper .calendar-day[data-fecha]').evaluateAll((nodes) => ({
        first: nodes[0]?.getAttribute('data-fecha') || '',
        last: nodes[nodes.length - 1]?.getAttribute('data-fecha') || '',
      }));
      if (range.first && date < range.first) await page.locator('#cal-prev').click();
      else await page.locator('#cal-next').click();
      await page.waitForTimeout(700);
    }
    throw new Error(`No se pudo navegar hasta la fecha ${date} en el calendario.`);
  }

  async function openSection(section, tableSelector) {
    await page.locator(`[data-section="${section}"]`).first().click();
    if (tableSelector) await page.waitForSelector(tableSelector, { timeout: 25000 });
    await page.waitForTimeout(500);
  }

  async function readClassDoc(classId) {
    return page.evaluate(async ({ currentClassId }) => {
      const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
      const { firebaseDb } = await import('/js/firebase-client.js');
      const snap = await getDoc(doc(firebaseDb, 'clases', currentClassId));
      if (!snap.exists()) return null;
      const data = snap.data();
      return {
        id: snap.id,
        status: data.status,
        estado: data.estado,
        lifecycleStatus: data.lifecycleStatus,
        attendanceStatus: data.attendanceStatus,
        teacherConfirmationStatus: data.teacherConfirmationStatus || null,
        familyConfirmationStatus: data.familyConfirmationStatus || null,
        incidentStatus: data.incidentStatus || null,
      };
    }, { currentClassId: classId });
  }

  async function waitForClassField(classId, predicate, label) {
    const deadline = Date.now() + 30000;
    const predicateSource = predicate.toString();
    let lastState = null;
    while (Date.now() < deadline) {
      const result = await page.evaluate(async ({ currentClassId, source }) => {
        const predicateFn = new Function('data', `return (${source})(data);`);
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
        const { firebaseDb } = await import('/js/firebase-client.js');
        const snap = await getDoc(doc(firebaseDb, 'clases', currentClassId)).catch((error) => ({ error: error.message || String(error), exists: () => false }));
        if (!snap.exists()) return { ok: false, data: null, error: snap.error || null };
        const data = snap.data();
        return { ok: Boolean(predicateFn(data)), data: {
          status: data.status,
          estado: data.estado,
          lifecycleStatus: data.lifecycleStatus,
          attendanceStatus: data.attendanceStatus,
          teacherConfirmationStatus: data.teacherConfirmationStatus || null,
          familyConfirmationStatus: data.familyConfirmationStatus || null,
          incidentStatus: data.incidentStatus || null,
          cancelledByRole: data.cancelledByRole || null,
          responsibilityPenalty: data.responsibilityPenalty || null,
        } };
      }, { currentClassId: classId, source: predicateSource });
      lastState = result;
      if (result.ok) return result;
      await page.waitForTimeout(1000);
    }
    throw new Error(`No se actualizo la clase ${classId}: ${label}. Estado actual: ${JSON.stringify(lastState || await readClassDoc(classId))}`);
  }

  async function teacherMarksClassGiven(classId, subject) {
    await login(credentials.teacherEmail, credentials.teacherPassword, 'profesor');
    await openSection('clases', '#tbody-mis-clases');
    const row = page.locator('#tbody-mis-clases tr').filter({ hasText: subject }).first();
    await row.waitFor({ state: 'visible', timeout: 25000 });
    const beforeText = await row.innerText();
    if (!beforeText.includes('Falta registrar profesor')) throw new Error(`El profesor no ve el siguiente paso correcto antes de registrar: ${beforeText}`);
    await row.locator('[data-action="registrar-clase"]').click();
    await page.waitForSelector('#modal-registrar-clase.open', { timeout: 10000 });
    await page.locator('#rc-estado').selectOption('realizada');
    await page.locator('#rc-notas').fill(`Clase impartida en prueba automatica ${Date.now()}`);
    await page.locator('#btn-confirmar-registro').click();
    await waitForClassField(classId, (data) => data.attendanceStatus === 'pendiente_familia' && data.teacherConfirmationStatus === 'realizada', 'profesor marca realizada');
  }

  async function familyConfirmsClassGiven(classId, subject) {
    await login(credentials.familyEmail, credentials.familyPassword, 'familia');
    await openSection('clases', '#tbody-clases');
    const row = page.locator('#tbody-clases tr').filter({ hasText: subject }).first();
    await row.waitFor({ state: 'visible', timeout: 25000 });
    const beforeText = await row.innerText();
    if (!beforeText.includes('Falta confirmar familia')) throw new Error(`La familia no ve el siguiente paso correcto antes de confirmar: ${beforeText}`);
    await row.locator('[data-status="realizada"]').click();
    await waitForClassField(classId, (data) => data.attendanceStatus === 'confirmada_por_ambas_partes' && data.familyConfirmationStatus === 'realizada', 'familia confirma realizada');
  }

  async function familyReportsClassNotGiven(classId, subject) {
    await login(credentials.familyEmail, credentials.familyPassword, 'familia');
    await openSection('clases', '#tbody-clases');
    const row = page.locator('#tbody-clases tr').filter({ hasText: subject }).first();
    await row.waitFor({ state: 'visible', timeout: 25000 });
    page.once('dialog', async (dialog) => {
      await dialog.accept('La clase no se dio durante la prueba automatica de Codex.');
    });
    await row.locator('[data-status="no_realizada"]').click();
    await waitForClassField(classId, (data) => data.attendanceStatus === 'incidencia' && data.familyConfirmationStatus === 'no_realizada' && data.incidentStatus === 'abierta', 'familia avisa no realizada');
  }

  try {
    await login(credentials.familyEmail, credentials.familyPassword, 'familia');
    const familyUser = await currentUserInfo();
    await login(credentials.teacherEmail, credentials.teacherPassword, 'profesor');
    const teacherUser = await currentUserInfo();
    await login(credentials.adminEmail, credentials.adminPassword, 'admin');
    const adminUser = await currentUserInfo();
    if (!familyUser.uid || !teacherUser.uid || !adminUser.uid) throw new Error('No se pudieron resolver los UID de familia, profesor y admin para la prueba.');
    await createSmokeRelationship(familyUser.uid, teacherUser.uid, adminUser.uid);

    await login(credentials.familyEmail, credentials.familyPassword, 'familia');
    await openSection('chat', '#chat-familia [data-chat-layout]');
    if (await page.locator('#chat-familia [data-chat-toggle-schedule], #chat-familia [data-chat-schedule-panel]').count()) throw new Error('El horario sigue apareciendo en el chat normal de la familia.');
    await openSection('profesores', '#family-teachers-grid');
    const familyTeacherCard = page.locator(`[data-assignment-card="${smokeId}"]`).first();
    await familyTeacherCard.waitFor({ state: 'visible', timeout: 30000 });
    await familyTeacherCard.locator('[data-action="gestionar-horario-familia"]').click();
    await page.waitForSelector('#modal-horario-semanal-familia.open [data-chat-schedule-panel]', { timeout: 30000 });
    const familySchedulePanel = page.locator('#modal-horario-semanal-familia [data-chat-schedule-panel]');
    await familySchedulePanel.locator('[data-open-schedule-planner]').click();
    const familyScheduleForm = familySchedulePanel.locator('[data-schedule-form]');
    await familyScheduleForm.locator('[data-schedule-weekday]').selectOption('1');
    await familyScheduleForm.locator('[data-schedule-start]').fill('21:00');
    await familyScheduleForm.locator('[data-schedule-end]').fill('22:00');
    await familyScheduleForm.locator('[data-schedule-modality]').selectOption('online');
    await familyScheduleForm.locator('[data-schedule-notes]').fill(`Prueba automatica Codex ${Date.now()}`);
    await familyScheduleForm.locator('button[type="submit"]').click();
    const familyProposalCard = familySchedulePanel.locator('[data-schedule-proposal-id].active').first();
    await familyProposalCard.waitFor({ state: 'visible', timeout: 30000 });
    const proposal = {
      proposalId: await familyProposalCard.getAttribute('data-schedule-proposal-id'),
      materia: 'Matematicas E2E',
    };
    const chatId = smokeId;
    debug.chatId = chatId;

    const classId = classIdFromProposal(chatId, proposal.proposalId);
    debug.proposalId = proposal.proposalId;
    debug.classId = classId;
    cleanupTargets.proposalId = proposal.proposalId;
    cleanupTargets.classId = classId;

    await login(credentials.teacherEmail, credentials.teacherPassword, 'profesor');
    await openSection('chat', '#chat-profesor [data-chat-layout]');
    if (await page.locator('#chat-profesor [data-chat-toggle-schedule], #chat-profesor [data-chat-schedule-panel]').count()) throw new Error('El horario sigue apareciendo en el chat normal del profesor.');
    await openSection('alumnos', '#tbody-mis-alumnos');
    const teacherStudentRow = page.locator('#tbody-mis-alumnos tr').filter({ hasText: 'Matematicas E2E' }).first();
    await teacherStudentRow.waitFor({ state: 'visible', timeout: 30000 });
    await teacherStudentRow.locator('[data-action="gestionar-horario-profesor"]').click();
    await page.waitForSelector('#modal-horario-semanal-profesor.open [data-chat-schedule-panel]', { timeout: 30000 });
    const proposalCard = page.locator(`#modal-horario-semanal-profesor [data-schedule-proposal-id="${proposal.proposalId}"]`).first();
    await proposalCard.waitFor({ state: 'visible', timeout: 25000 });
    await proposalCard.locator('[data-accept-schedule]').click();
    const acceptDeadline = Date.now() + 80000;
    let proposalAcceptState = null;
    while (Date.now() < acceptDeadline) {
      proposalAcceptState = await page.evaluate(async ({ currentChatId, currentProposalId }) => {
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
        const { firebaseDb } = await import('/js/firebase-client.js');
        const snap = await getDoc(doc(firebaseDb, 'chats', currentChatId, 'programaciones', currentProposalId)).catch((error) => ({ error: error.message || String(error), exists: () => false }));
        if (!snap.exists()) return { ok: false, error: snap.error || 'proposal_missing' };
        const data = snap.data();
        return {
          ok: data.status === 'aceptada' && Array.isArray(data.classIds) && data.classIds.length > 1,
          status: data.status,
          classCount: data.classCount || 0,
          classIdsLength: Array.isArray(data.classIds) ? data.classIds.length : 0,
        };
      }, { currentChatId: chatId, currentProposalId: proposal.proposalId });
      if (proposalAcceptState.ok) break;
      await page.waitForTimeout(1500);
    }
    if (!proposalAcceptState?.ok) throw new Error(`La propuesta semanal no termino de aceptarse: ${JSON.stringify(proposalAcceptState)}`);
    debug.afterAccept = await page.evaluate(async ({ currentChatId, currentProposalId, expectedClassId }) => {
      const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
      const { firebaseDb } = await import('/js/firebase-client.js');
      const result = {};
      try {
        const chatSnap = await getDoc(doc(firebaseDb, 'chats', currentChatId));
        result.chat = chatSnap.exists() ? {
          id: chatSnap.id,
          assignmentId: chatSnap.data().assignmentId,
          familyUid: chatSnap.data().familyUid,
          familia_id: chatSnap.data().familia_id,
          teacherUid: chatSnap.data().teacherUid,
          profesor_id: chatSnap.data().profesor_id,
          studentId: chatSnap.data().studentId,
          alumno_id: chatSnap.data().alumno_id,
          participantUids: chatSnap.data().participantUids || null,
          schedulingStatus: chatSnap.data().schedulingStatus,
          activeClassId: chatSnap.data().activeClassId || null,
          activeClassIds: chatSnap.data().activeClassIds || [],
          classSeriesId: chatSnap.data().classSeriesId || null,
          seriesEndDate: chatSnap.data().seriesEndDate || null,
        } : null;
      } catch (error) {
        result.chatError = error.message || String(error);
      }
      try {
        const proposalSnap = await getDoc(doc(firebaseDb, 'chats', currentChatId, 'programaciones', currentProposalId));
        result.proposal = proposalSnap.exists() ? {
          id: proposalSnap.id,
          assignmentId: proposalSnap.data().assignmentId,
          status: proposalSnap.data().status,
          classId: proposalSnap.data().classId || null,
          classIds: proposalSnap.data().classIds || [],
          classCount: proposalSnap.data().classCount || 0,
          classSeriesId: proposalSnap.data().classSeriesId || null,
          seriesEndDate: proposalSnap.data().seriesEndDate || null,
          proposedByUid: proposalSnap.data().proposedByUid,
          proposedByRole: proposalSnap.data().proposedByRole,
          respondedByUid: proposalSnap.data().respondedByUid || null,
          respondedByRole: proposalSnap.data().respondedByRole || null,
        } : null;
      } catch (error) {
        result.proposalError = error.message || String(error);
      }
      try {
        const classSnap = await getDoc(doc(firebaseDb, 'clases', expectedClassId));
        result.classRead = classSnap.exists() ? {
          id: classSnap.id,
          teacherUid: classSnap.data().teacherUid,
          profesor_id: classSnap.data().profesor_id,
          familyUid: classSnap.data().familyUid,
          familia_id: classSnap.data().familia_id,
          studentId: classSnap.data().studentId,
          alumno_id: classSnap.data().alumno_id,
          participantUids: classSnap.data().participantUids || null,
          status: classSnap.data().status,
          classSeriesId: classSnap.data().classSeriesId || null,
          seriesIndex: classSnap.data().seriesIndex ?? null,
          seriesTotal: classSnap.data().seriesTotal ?? null,
          seriesEndDate: classSnap.data().seriesEndDate || null,
        } : null;
      } catch (error) {
        result.classReadError = error.message || String(error);
      }
      return result;
    }, { currentChatId: chatId, currentProposalId: proposal.proposalId, expectedClassId: classId });
    debug.visibleTextAfterAccept = (await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')).slice(-2000);
    debug.consoleEvents = consoleEvents.slice(-20);

    let classDoc = null;
    const classDeadline = Date.now() + 30000;
    while (Date.now() < classDeadline) {
      classDoc = await page.evaluate(async ({ expectedClassId }) => {
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
        const { firebaseDb } = await import('/js/firebase-client.js');
        const snap = await getDoc(doc(firebaseDb, 'clases', expectedClassId)).catch(() => null);
        if (!snap || !snap.exists()) return null;
        const data = snap.data();
        return {
          id: snap.id,
          status: data.status,
          fecha: data.fecha || data.date,
          classSeriesId: data.classSeriesId || null,
          seriesIndex: data.seriesIndex ?? null,
          seriesTotal: data.seriesTotal ?? null,
          seriesEndDate: data.seriesEndDate || null,
          amount: data.familyAmount || data.precio_total || data.amount || 0,
          teacherAmount: data.teacherAmount || data.importe_profesor || 0,
          platformFee: data.platformFee || data.comision_clasesde10 || 0,
        };
      }, { expectedClassId: classId });
      if (classDoc?.status === 'confirmada') break;
      await page.waitForTimeout(1000);
    }

    if (!classDoc || classDoc.status !== 'confirmada') throw new Error(`Clase no confirmada: ${JSON.stringify(classDoc)}`);
    if (!(Number(classDoc.amount) > Number(classDoc.teacherAmount) && Number(classDoc.teacherAmount) > 0)) {
      throw new Error(`Importes incorrectos en clase: ${JSON.stringify(classDoc)}`);
    }
    if (classDoc.classSeriesId !== proposal.proposalId || !(Number(classDoc.seriesTotal) > 1) || !String(classDoc.seriesEndDate || '').endsWith('-06-30')) {
      throw new Error(`Serie semanal no creada correctamente: ${JSON.stringify({ classDoc, afterAccept: debug.afterAccept })}`);
    }
    if (!Array.isArray(debug.afterAccept?.proposal?.classIds) || debug.afterAccept.proposal.classIds.length !== Number(classDoc.seriesTotal)) {
      throw new Error(`La propuesta aceptada no conserva todos los ids de la serie: ${JSON.stringify(debug.afterAccept?.proposal)}`);
    }

    await page.locator('[data-section="calendario"]').first().click();
    await selectCalendarDate(date);
    await page.waitForTimeout(800);
    const professorCalendarText = await page.locator('#cal-clases-dia').textContent();
    if (!professorCalendarText.includes(proposal.materia)) throw new Error('La clase aceptada no aparece en el calendario del profesor.');

    await page.locator('[data-section="clases"]').first().click();
    await page.waitForSelector('#tbody-mis-clases', { timeout: 25000 });
    await page.waitForFunction(({ materia }) => {
      const text = document.querySelector('#tbody-mis-clases')?.textContent || '';
      return text.includes(materia) && text.includes('€');
    }, { materia: proposal.materia }, { timeout: 25000 }).catch(() => {});
    const professorClassesText = await page.locator('#tbody-mis-clases').textContent();
    debug.professorClassesText = professorClassesText;
    if (!professorClassesText.includes(proposal.materia) || !professorClassesText.includes('€')) {
      throw new Error('La clase aceptada no aparece con ingreso en Mis clases del profesor.');
    }

    await login(credentials.familyEmail, credentials.familyPassword, 'familia');
    await page.locator('[data-section="calendario"]').first().click();
    await selectCalendarDate(date);
    await page.waitForTimeout(800);
    const familyCalendarText = await page.locator('#cal-clases-dia').textContent();
    if (!familyCalendarText.includes(proposal.materia)) {
      throw new Error('La clase aceptada no aparece en el calendario de familia.');
    }
    const cancelButton = page.locator('#cal-clases-dia [data-action="cancelar-clase-calendario"]').first();
    if (!(await cancelButton.count())) throw new Error('La familia no ve la opcion de cancelar clase desde calendario.');
    const dialogHandler = async (dialog) => {
      if (dialog.type() === 'prompt') {
        await dialog.accept('Cancelada por prueba automatica de Codex.');
      } else {
        await dialog.accept();
      }
    };
    page.on('dialog', dialogHandler);
    await cancelButton.click();
    await waitForClassField(classId, (data) => data.status === 'cancelada' && data.cancelledByRole === 'familia' && data.responsibilityPenalty?.points === -3, 'familia cancela desde calendario');
    page.off('dialog', dialogHandler);
    debug.cancelledClass = await readClassDoc(classId);

    await login(credentials.teacherEmail, credentials.teacherPassword, 'profesor');
    const notificationDeadline = Date.now() + 30000;
    debug.teacherCancellationNotification = null;
    while (Date.now() < notificationDeadline && !debug.teacherCancellationNotification) {
      debug.teacherCancellationNotification = await page.evaluate(async ({ currentClassId }) => {
        const { collection, getDocs, limit, query, where } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
        const { firebaseAuth, firebaseDb } = await import('/js/firebase-client.js');
        const uid = firebaseAuth.currentUser?.uid;
        if (!uid) return null;
        const snap = await getDocs(query(collection(firebaseDb, 'notificaciones'), where('userUid', '==', uid), limit(80))).catch(() => null);
        const found = snap?.docs?.map((item) => ({ id: item.id, ...item.data() })).find((item) => item.payload?.classId === currentClassId && item.type === 'class_cancelled');
        return found ? { id: found.id, type: found.type, title: found.title, body: found.body, userUid: found.userUid } : null;
      }, { currentClassId: classId });
      if (!debug.teacherCancellationNotification) await page.waitForTimeout(1000);
    }
    if (!debug.teacherCancellationNotification) {
      throw new Error('El profesor no recibe notificacion interna de clase cancelada.');
    }

    await login(credentials.familyEmail, credentials.familyPassword, 'familia');
    await page.locator('[data-section="clases"]').first().click();
    await page.waitForSelector('#tbody-clases', { timeout: 25000 });
    await page.waitForFunction(({ materia }) => {
      const text = document.querySelector('#tbody-clases')?.textContent || '';
      return text.includes(materia);
    }, { materia: proposal.materia }, { timeout: 25000 }).catch(() => {});
    const familyClassesText = await page.locator('#tbody-clases').textContent();
    debug.familyClassesText = familyClassesText;
    if (!familyClassesText.includes(proposal.materia)) {
      throw new Error('La clase aceptada no aparece en Clases de familia.');
    }

    const givenClassId = `${smokeId}_attendance_given`;
    const issueClassId = `${smokeId}_attendance_issue`;
    const givenSubject = 'Asistencia dada E2E';
    const issueSubject = 'Asistencia no dada E2E';
    cleanupTargets.givenClassId = givenClassId;
    cleanupTargets.issueClassId = issueClassId;

    await login(credentials.adminEmail, credentials.adminPassword, 'admin');
    await createPastClass(givenClassId, givenSubject, pastClassDate(2));
    await createPastClass(issueClassId, issueSubject, pastClassDate(3));

    await teacherMarksClassGiven(givenClassId, givenSubject);
    await familyConfirmsClassGiven(givenClassId, givenSubject);

    await teacherMarksClassGiven(issueClassId, issueSubject);
    await familyReportsClassNotGiven(issueClassId, issueSubject);

    debug.attendanceGiven = await readClassDoc(givenClassId);
    debug.attendanceIssue = await readClassDoc(issueClassId);

    await cleanupTestArtifacts();

    console.log(JSON.stringify({
      ok: true,
      baseUrl,
      smokeId,
      chatId,
      proposalId: proposal.proposalId,
      classId,
      classDoc,
      checks: {
        weeklySeriesCreated: true,
        professorCalendar: true,
        professorClasses: true,
        familyCalendar: true,
        familyClasses: true,
        familyCancelsFromCalendar: true,
        teacherReceivesCancellationNotification: true,
        teacherMarksClassGiven: true,
        familyConfirmsClassGiven: true,
        familyReportsClassNotGiven: true,
      },
      cancellation: {
        class: debug.cancelledClass,
        notification: debug.teacherCancellationNotification,
      },
      attendance: {
        given: debug.attendanceGiven,
        issue: debug.attendanceIssue,
      },
      consoleEvents: consoleEvents.slice(-10),
    }, null, 2));
  } finally {
    if (!cleanupDone) {
      await cleanupTestArtifacts().catch((error) => {
        consoleEvents.push(`cleanup: ${error?.message || String(error)}`);
      });
    }
    await context.close();
    await browser.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error?.message || String(error),
      stack: error?.stack || '',
      consoleEvents: debug.consoleEvents || [],
      debug,
    }, null, 2));
    process.exit(1);
  });
