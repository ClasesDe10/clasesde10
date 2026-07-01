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
    return page.waitForFunction(async ({ currentClassId, predicateSource }) => {
      const predicateFn = new Function('data', `return (${predicateSource})(data);`);
      const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
      const { firebaseDb } = await import('/js/firebase-client.js');
      const snap = await getDoc(doc(firebaseDb, 'clases', currentClassId));
      if (!snap.exists()) return false;
      return predicateFn(snap.data());
    }, {
      currentClassId: classId,
      predicateSource: predicate.toString(),
    }, { timeout: 25000 }).catch(async () => {
      throw new Error(`No se actualizo la clase ${classId}: ${label}. Estado actual: ${JSON.stringify(await readClassDoc(classId))}`);
    });
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
    const chatId = await openChatById(smokeId);
    debug.chatId = chatId;
    const date = nextWeekdayDate(2, 49);
    const proposal = await page.evaluate(async ({ chatId: currentChatId, date: classDate }) => {
      const {
        addDoc,
        collection,
        doc,
        getDoc,
        serverTimestamp,
        updateDoc,
      } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
      const { firebaseAuth, firebaseDb } = await import('/js/firebase-client.js');
      const chatRef = doc(firebaseDb, 'chats', currentChatId);
      const chatSnap = await getDoc(chatRef);
      if (!chatSnap.exists()) throw new Error(`Chat no encontrado: ${currentChatId}`);
      const chat = chatSnap.data();
      const proposalRef = await addDoc(collection(chatRef, 'programaciones'), {
        assignmentId: currentChatId,
        familyUid: chat.familyUid || chat.familia_id,
        teacherUid: chat.teacherUid || chat.profesor_id,
        studentId: chat.studentId || chat.alumno_id,
        materia: chat.materia || 'Prueba automatica',
        fecha: classDate,
        hora_inicio: '21:00',
        hora_fin: '22:00',
        durationMinutes: 60,
        modalidad: 'online',
        notas: `Prueba automatica Codex ${Date.now()}`,
        status: 'propuesta',
        availabilityStatus: 'smoke_test',
        availabilityValidation: {
          checkedByRole: 'familia',
          checkedAt: new Date().toISOString(),
          requiredScope: 'smoke',
        },
        proposedByUid: firebaseAuth.currentUser.uid,
        proposedByRole: 'familia',
        proposedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(chatRef, {
        schedulingStatus: 'horario_propuesto',
        relationshipStage: 'horario_propuesto',
        relationshipStatus: 'active',
        lastRelationshipEvent: 'schedule_proposed',
        relationshipUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return {
        proposalId: proposalRef.id,
        materia: chat.materia || 'Prueba automatica',
      };
    }, { chatId, date });

    const classId = classIdFromProposal(chatId, proposal.proposalId);
    debug.proposalId = proposal.proposalId;
    debug.classId = classId;
    cleanupTargets.proposalId = proposal.proposalId;
    cleanupTargets.classId = classId;

    await login(credentials.teacherEmail, credentials.teacherPassword, 'profesor');
    await page.locator('[data-section="chat"], [data-section="chats"]').first().click();
    await page.waitForSelector('[data-chat-id]', { timeout: 25000 });
    const teacherChat = page.locator(`[data-chat-id="${chatId}"]`).first();
    if (!(await teacherChat.count())) throw new Error(`El profesor no ve el chat ${chatId}.`);
    await teacherChat.click();
    const proposalCard = page.locator(`[data-schedule-proposal-id="${proposal.proposalId}"]`).first();
    await proposalCard.waitFor({ state: 'visible', timeout: 25000 });
    await proposalCard.locator('[data-accept-schedule]').click();
    await page.waitForTimeout(2500);
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
        } : null;
      } catch (error) {
        result.classReadError = error.message || String(error);
      }
      return result;
    }, { currentChatId: chatId, currentProposalId: proposal.proposalId, expectedClassId: classId });
    debug.visibleTextAfterAccept = (await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')).slice(-2000);
    debug.consoleEvents = consoleEvents.slice(-20);

    const classDoc = await page.waitForFunction(async ({ expectedClassId }) => {
      const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
      const { firebaseDb } = await import('/js/firebase-client.js');
      const snap = await getDoc(doc(firebaseDb, 'clases', expectedClassId)).catch(() => null);
      if (!snap || !snap.exists()) return null;
      const data = snap.data();
      return {
        id: snap.id,
        status: data.status,
        fecha: data.fecha || data.date,
        amount: data.familyAmount || data.precio_total || data.amount || 0,
        teacherAmount: data.teacherAmount || data.importe_profesor || 0,
        platformFee: data.platformFee || data.comision_clasesde10 || 0,
      };
    }, { expectedClassId: classId }, { timeout: 25000 }).then((handle) => handle.jsonValue());

    if (!classDoc || classDoc.status !== 'confirmada') throw new Error(`Clase no confirmada: ${JSON.stringify(classDoc)}`);
    if (!(Number(classDoc.amount) > Number(classDoc.teacherAmount) && Number(classDoc.teacherAmount) > 0)) {
      throw new Error(`Importes incorrectos en clase: ${JSON.stringify(classDoc)}`);
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
        professorCalendar: true,
        professorClasses: true,
        familyCalendar: true,
        familyClasses: true,
        teacherMarksClassGiven: true,
        familyConfirmsClassGiven: true,
        familyReportsClassNotGiven: true,
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
