import { chromium } from 'playwright';

const args = process.argv.slice(2);
const urlArgIndex = args.indexOf('--url');
const baseUrl = (urlArgIndex >= 0 ? args[urlArgIndex + 1] : 'https://clasesde10.com').replace(/\/$/, '');

const credentials = {
  familyEmail: process.env.CD10_FAMILY_EMAIL,
  familyPassword: process.env.CD10_FAMILY_PASSWORD,
  teacherEmail: process.env.CD10_TEACHER_EMAIL,
  teacherPassword: process.env.CD10_TEACHER_PASSWORD,
};
const debug = {};

for (const [key, value] of Object.entries(credentials)) {
  if (!value) throw new Error(`${key} is required through environment variables.`);
}

function classIdFromProposal(chatId, proposalId) {
  return `chat_${chatId}_${proposalId}`.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 900);
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

  async function openFirstChat() {
    await page.locator('[data-section="chat"], [data-section="chats"]').first().click();
    await page.waitForSelector('[data-chat-tab="chats"]', { timeout: 25000 });
    await page.locator('[data-chat-tab="chats"]').click();
    await page.waitForSelector('[data-chat-list]', { timeout: 25000 });
    await page.waitForTimeout(1500);
    const count = await page.locator('[data-chat-id]').count();
    if (!count) throw new Error('No hay chats activos para esta cuenta.');
    const first = page.locator('[data-chat-id]').first();
    const chatId = await first.getAttribute('data-chat-id');
    await first.click();
    await page.waitForSelector('[data-chat-schedule-panel]', { timeout: 25000 });
    return chatId;
  }

  try {
    await login(credentials.familyEmail, credentials.familyPassword, 'familia');
    const chatId = await openFirstChat();
    debug.chatId = chatId;
    const date = '2026-06-30';
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
        hora_inicio: '18:00',
        hora_fin: '19:00',
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
          teacherUid: chatSnap.data().teacherUid,
          profesor_id: chatSnap.data().profesor_id,
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
          participantUids: classSnap.data().participantUids || null,
          status: classSnap.data().status,
        } : null;
      } catch (error) {
        result.classReadError = error.message || String(error);
      }
      return result;
    }, { currentChatId: chatId, currentProposalId: proposal.proposalId, expectedClassId: classId });
    debug.visibleTextAfterAccept = (await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')).slice(-2000);

    const classDoc = await page.waitForFunction(async ({ expectedClassId }) => {
      const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
      const { firebaseDb } = await import('/js/firebase-client.js');
      const snap = await getDoc(doc(firebaseDb, 'clases', expectedClassId));
      if (!snap.exists()) return null;
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
    await page.waitForSelector(`[data-fecha="${date}"]`, { timeout: 25000 });
    await page.locator(`[data-fecha="${date}"]`).click();
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
    await page.waitForSelector(`[data-fecha="${date}"]`, { timeout: 25000 });
    await page.locator(`[data-fecha="${date}"]`).click();
    await page.waitForTimeout(800);
    const familyCalendarText = await page.locator('#cal-clases-dia').textContent();
    if (!familyCalendarText.includes(proposal.materia) || !familyCalendarText.includes('€')) {
      throw new Error('La clase aceptada no aparece con precio en el calendario de familia.');
    }

    await page.locator('[data-section="clases"]').first().click();
    await page.waitForSelector('#tbody-clases', { timeout: 25000 });
    await page.waitForFunction(({ materia }) => {
      const text = document.querySelector('#tbody-clases')?.textContent || '';
      return text.includes(materia) && text.includes('€');
    }, { materia: proposal.materia }, { timeout: 25000 }).catch(() => {});
    const familyClassesText = await page.locator('#tbody-clases').textContent();
    debug.familyClassesText = familyClassesText;
    if (!familyClassesText.includes(proposal.materia) || !familyClassesText.includes('€')) {
      throw new Error('La clase aceptada no aparece con precio en Clases de familia.');
    }

    console.log(JSON.stringify({
      ok: true,
      baseUrl,
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
      debug,
    }, null, 2));
    process.exit(1);
  });
