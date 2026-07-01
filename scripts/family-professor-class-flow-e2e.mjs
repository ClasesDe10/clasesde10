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
      const [classSnaps, busySnaps, availabilitySnaps, notificationSnaps] = await Promise.all([
        Promise.all(classQueries),
        Promise.all(busyQueries),
        Promise.all(availabilityQueries),
        Promise.all(notificationQueries),
      ]);
      const refs = new Map();
      [
        ...(proposalSnap.docs || []),
        ...(messageSnap.docs || []),
        ...classSnaps.flatMap((snap) => snap.docs || []),
        ...busySnaps.flatMap((snap) => snap.docs || []),
        ...availabilitySnaps.flatMap((snap) => snap.docs || []),
        ...notificationSnaps.flatMap((snap) => snap.docs || []),
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
    const date = nextWeekdayDate(2, 14);
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
