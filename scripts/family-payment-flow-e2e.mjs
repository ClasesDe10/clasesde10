import { chromium } from 'playwright';

const {
  CD10_ADMIN_EMAIL: adminEmail,
  CD10_ADMIN_PASSWORD: adminPassword,
  CD10_FAMILY_EMAIL: familyEmail,
  CD10_FAMILY_PASSWORD: familyPassword,
  CD10_TEACHER_EMAIL: teacherEmail,
  CD10_E2E_URL: baseUrl = 'https://clasesde10.com',
} = process.env;

if (!adminEmail || !adminPassword || !familyEmail || !familyPassword || !teacherEmail) {
  throw new Error('CD10_ADMIN_EMAIL, CD10_ADMIN_PASSWORD, CD10_FAMILY_EMAIL, CD10_FAMILY_PASSWORD and CD10_TEACHER_EMAIL are required.');
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 820 } });
const consoleErrors = [];
page.on('console', (message) => {
  if (['error', 'warning'].includes(message.type())) consoleErrors.push(`${message.type()}: ${message.text()}`);
});
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

async function signOut() {
  await page.goto(`${baseUrl}/pages/login.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    const { firebaseAuth } = await import('/js/firebase-client.js?v=20260627-domain-auth');
    const { signOut } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js');
    await signOut(firebaseAuth).catch(() => {});
  });
}

async function login(email, password, expectedRole) {
  await signOut();
  await page.goto(`${baseUrl}/pages/login.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#form-login').evaluate((form) => form.requestSubmit());
  await page.waitForURL(new RegExp(`/pages/dashboard/${expectedRole}(?:\\.html)?(?:#.*)?$`), { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

async function createTestClass() {
  await login(adminEmail, adminPassword, 'admin');
  return page.evaluate(async ({ familyEmail, teacherEmail }) => {
    const { firebaseDb } = await import('/js/firebase-client.js?v=20260627-domain-auth');
    const {
      collection,
      deleteDoc,
      doc,
      getDocs,
      query,
      serverTimestamp,
      setDoc,
      where,
    } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');

    const [oldPayments, oldClasses] = await Promise.all([
      getDocs(collection(firebaseDb, 'pagos')),
      getDocs(collection(firebaseDb, 'clases')),
    ]);
    await Promise.all([
      ...oldPayments.docs
        .filter((item) => String(item.data().reference || item.data().referencia || '').startsWith('E2E-e2e_payment_'))
        .map((item) => deleteDoc(doc(firebaseDb, 'pagos', item.id)).catch(() => {})),
      ...oldClasses.docs
        .filter((item) => item.data().createdFrom === 'payment_e2e')
        .map((item) => deleteDoc(doc(firebaseDb, 'clases', item.id)).catch(() => {})),
    ]);

    async function userByEmail(email) {
      const snap = await getDocs(query(collection(firebaseDb, 'users'), where('email', '==', email)));
      if (snap.empty) throw new Error(`No user found for ${email}`);
      const item = snap.docs[0];
      return { uid: item.id, ...item.data() };
    }

    const family = await userByEmail(familyEmail);
    const teacher = await userByEmail(teacherEmail);
    let studentsSnap = await getDocs(query(collection(firebaseDb, 'alumnos'), where('familyUid', '==', family.uid)));
    if (studentsSnap.empty) studentsSnap = await getDocs(query(collection(firebaseDb, 'alumnos'), where('familia_id', '==', family.uid)));
    if (studentsSnap.empty) {
      const allStudents = await getDocs(collection(firebaseDb, 'alumnos'));
      const found = allStudents.docs.find((item) => {
        const data = item.data();
        return data.familyUid === family.uid || data.familia_id === family.uid || data.usuario_id === family.uid;
      });
      if (!found) throw new Error('No student found for payment e2e family.');
      studentsSnap = { docs: [found], empty: false };
    }

    const studentDoc = studentsSnap.docs[0];
    const student = { id: studentDoc.id, ...studentDoc.data() };
    const date = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const classId = `e2e_payment_${Date.now()}`;
    const studentName = [student.nombre, student.apellidos].filter(Boolean).join(' ') || 'Alumno prueba';
    const teacherName = [teacher.nombre, teacher.apellidos].filter(Boolean).join(' ') || 'Profesor prueba';
    await setDoc(doc(firebaseDb, 'clases', classId), {
      id: classId,
      testRun: true,
      createdFrom: 'payment_e2e',
      familyUid: family.uid,
      familia_id: family.uid,
      teacherUid: teacher.uid,
      profesor_id: teacher.uid,
      studentId: student.id,
      alumno_id: student.id,
      alumno_nombre: studentName,
      studentName,
      profesor_nombre: teacherName,
      teacherName,
      fecha: date,
      date,
      hora_inicio: '10:00',
      startTime: '10:00',
      hora_fin: '11:00',
      endTime: '11:00',
      duracion_minutos: 60,
      durationMinutes: 60,
      materia: 'Pago E2E',
      subject: 'Pago E2E',
      estado: 'realizada',
      status: 'realizada',
      lifecycleStatus: 'pendiente_pago',
      attendanceStatus: 'confirmada_por_ambas_partes',
      familyConfirmationStatus: 'realizada',
      teacherConfirmationStatus: 'realizada',
      precio_total: 1.23,
      amount: 1.23,
      familyAmount: 1.23,
      importe_profesor: 1,
      teacherAmount: 1,
      comision_clasesde10: 0.23,
      platformFee: 0.23,
      paymentStatus: 'pendiente',
      familyPaymentStatus: 'pendiente',
      estado_pago: 'pendiente',
      estado_pago_familia: 'pendiente',
      teacherPaymentStatus: 'pendiente',
      estado_pago_profesor: 'pendiente',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return { classId, familyUid: family.uid, teacherUid: teacher.uid, studentId: student.id };
  }, { familyEmail, teacherEmail });
}

async function confirmPaymentAsFamily(setup) {
  await login(familyEmail, familyPassword, 'familia');
  await page.goto(`${baseUrl}/pages/dashboard/familia.html#pagos`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#family-payment-workbench', { timeout: 30000 });
  await page.waitForTimeout(2500);
  const card = page.locator('.payment-confirm-card').filter({ hasText: '1,23' }).first();
  await card.waitFor({ state: 'visible', timeout: 30000 });
  await card.locator('[data-action="confirmar-pago-grupo"]').click();
  await page.waitForSelector('#modal-pago.open', { timeout: 10000 });
  await page.locator('#pago-referencia').fill(`E2E-${setup.classId}`);
  await page.locator('#btn-confirmar-pago').click();
  await page.waitForFunction(() => !document.querySelector('#modal-pago.open'), null, { timeout: 30000 });
  await page.waitForTimeout(1500);

  return page.evaluate(async ({ classId, familyUid }) => {
    const { firebaseDb } = await import('/js/firebase-client.js?v=20260627-domain-auth');
    const { collection, getDocs, query, where } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
    const snap = await getDocs(query(collection(firebaseDb, 'pagos'), where('familyUid', '==', familyUid)));
    const payment = snap.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .find((item) => Array.isArray(item.classIds) && item.classIds.includes(classId));
    if (!payment) throw new Error('Payment was not created with linked class ids.');
    if (payment.estado !== 'pendiente' || payment.status !== 'pendiente') throw new Error(`Unexpected payment status ${payment.estado}/${payment.status}`);
    return payment.id;
  }, setup);
}

async function validateAsAdmin(classId, paymentId) {
  await login(adminEmail, adminPassword, 'admin');
  await page.goto(`${baseUrl}/pages/dashboard/admin.html#pagos`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => typeof window.validarPago === 'function', null, { timeout: 30000 });
  await page.evaluate(async (id) => window.validarPago(id, 'validado'), paymentId);
  await page.waitForTimeout(2500);
  return page.evaluate(async ({ classId, paymentId }) => {
    const { firebaseDb } = await import('/js/firebase-client.js?v=20260627-domain-auth');
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
    const classSnap = await getDoc(doc(firebaseDb, 'clases', classId));
    const paymentSnap = await getDoc(doc(firebaseDb, 'pagos', paymentId));
    return {
      classData: classSnap.exists() ? classSnap.data() : null,
      paymentData: paymentSnap.exists() ? paymentSnap.data() : null,
    };
  }, { classId, paymentId });
}

async function cleanup(classId, paymentId) {
  await login(adminEmail, adminPassword, 'admin').catch(() => {});
  await page.evaluate(async ({ classId, paymentId }) => {
    const { firebaseDb } = await import('/js/firebase-client.js?v=20260627-domain-auth');
    const { collection, deleteDoc, doc, getDocs, query, where } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
    if (paymentId) {
      await deleteDoc(doc(firebaseDb, 'pagos', paymentId)).catch(() => {});
    } else if (classId) {
      const snap = await getDocs(query(collection(firebaseDb, 'pagos'), where('reference', '==', `E2E-${classId}`))).catch(() => null);
      await Promise.all((snap?.docs || []).map((item) => deleteDoc(doc(firebaseDb, 'pagos', item.id)).catch(() => {})));
    }
    if (classId) await deleteDoc(doc(firebaseDb, 'clases', classId)).catch(() => {});
  }, { classId, paymentId }).catch(() => {});
}

let setup;
let paymentId = '';
try {
  setup = await createTestClass();
  paymentId = await confirmPaymentAsFamily(setup);
  const finalState = await validateAsAdmin(setup.classId, paymentId);
  if (finalState.classData?.familyPaymentStatus !== 'validado') {
    throw new Error(`Class was not marked as paid. State: ${JSON.stringify(finalState.classData)}`);
  }
  if (finalState.paymentData?.estado !== 'validado') {
    throw new Error(`Payment was not validated. State: ${JSON.stringify(finalState.paymentData)}`);
  }
  console.log(JSON.stringify({
    ok: true,
    classId: setup.classId,
    paymentId,
    classPaymentStatus: finalState.classData.familyPaymentStatus,
    paymentStatus: finalState.paymentData.estado,
    consoleErrors: consoleErrors.slice(-8),
  }, null, 2));
} finally {
  await cleanup(setup?.classId, paymentId);
  await browser.close();
}
