async (page) => {
  const baseUrl = page.url().replace(/^(https?:\/\/[^/]+).*/, '$1');
  const email = process.env.CD10_PROFILE_EMAIL;
  const password = process.env.CD10_PROFILE_PASSWORD;
  if (!email || !password) throw new Error('Missing temporary professor credentials.');

  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
  const setup = await page.evaluate(async ({ email, password }) => {
    const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js');
    const { doc, getDoc, serverTimestamp, setDoc } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
    const { firebaseAuth, firebaseDb } = await import('/js/firebase-client.js');
    const uid = (await signInWithEmailAndPassword(firebaseAuth, email, password)).user.uid;
    const userRef = doc(firebaseDb, 'users', uid);
    const teacherRef = doc(firebaseDb, 'profesores', uid);
    const [userSnap, teacherSnap] = await Promise.all([getDoc(userRef), getDoc(teacherRef)]);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        email, nombre: 'Profesor Smoke', apellidos: 'Inicial', role: 'profesor', active: true,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    }
    if (!teacherSnap.exists()) {
      await setDoc(teacherRef, {
        userUid: uid, email, nombre: 'Profesor Smoke', apellidos: 'Inicial', active: true,
        status: 'pendiente_perfil', perfil_completo: false, profileComplete: false,
        estado_verificacion: 'pendiente_perfil', verificationStatus: 'pendiente_perfil',
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    }
    return { uid };
  }, { email, password });

  await page.goto(`${baseUrl}/pages/dashboard/profesor.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#user-nombre')?.textContent.includes('Profesor'), null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.locator('button.sidebar-link[data-section="perfil"]').click().catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    if (document.querySelector('#section-perfil')?.offsetParent) return;
    document.querySelectorAll('.dash-section').forEach((section) => { section.style.display = 'none'; });
    document.getElementById('section-perfil').style.display = '';
  });
  await page.locator('#teacher-profile-overview').waitFor({ state: 'visible', timeout: 30000 });
  if (await page.locator('#form-perfil').isVisible()) throw new Error('Professor profile form should stay hidden until Editar perfil is selected.');
  await page.locator('#btn-editar-perfil-profesor').click();
  await page.locator('#modal-perfil-profesor').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#teaching-scope-builder input[data-scope-subject]').first().waitFor({ state: 'attached', timeout: 30000 });

  for (const [selector, value] of [
    ['#p-nombre', 'Profesor Smoke'],
    ['#p-apellidos', 'Actualizado'],
    ['#p-telefono', '611222333'],
    ['#p-direccion', 'Calle Profesor 10'],
    ['#p-ciudad', 'Madrid'],
    ['#p-cp', '28020'],
    ['#p-estudio-exacto', 'Grado en Matematicas'],
    ['#p-colegio', 'Colegio El Prado'],
    ['#p-centro-estudios', 'Universidad Complutense de Madrid'],
    ['#p-nota-bachillerato', '8.70'],
    ['#p-nota-universidad', '8.10'],
    ['#p-bio', 'Profesor temporal para validar que el perfil completo guarda correctamente desde la interfaz real.'],
    ['#p-especialidades', 'EVAU, alumnos con TDAH'],
    ['#p-idiomas', 'Espanol, Ingles'],
    ['#p-certificaciones', 'C1 Ingles'],
    ['#p-experiencia', '3'],
    ['#p-disponibilidad', 'Tardes entre semana y sabados por la manana'],
  ]) await page.locator(selector).fill(value);

  await page.locator('#p-foto-file').setInputFiles('assets/img/logo-192.png');
  await page.waitForFunction(() => Boolean(document.querySelector('#p-foto-preview img')), null, { timeout: 30000 });
  await page.locator('#p-coche').selectOption('si');
  await page.locator('#p-bizum').check();
  await page.locator('input[data-scope-subject="estudio"][value="Matematicas"]').check();
  await page.locator('input[data-scope-level="estudio"][value="ESO"]').check();
  await page.locator('input[data-scope-toggle="deporte"]').check();
  await page.locator('input[data-scope-subject="deporte"][value="Padel"]').check();
  await page.locator('input[data-scope-level="deporte"][value="Iniciacion"]').check();
  await page.locator('#form-perfil button[type="submit"]').click();
  await page.waitForTimeout(1800);
  if (await page.locator('#modal-perfil-profesor').isVisible()) throw new Error('Professor profile dialog did not close after saving.');

  const result = await page.evaluate(async () => {
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
    const { firebaseAuth, firebaseDb } = await import('/js/firebase-client.js');
    const uid = firebaseAuth.currentUser.uid;
    const user = (await getDoc(doc(firebaseDb, 'users', uid))).data();
    const teacher = (await getDoc(doc(firebaseDb, 'profesores', uid))).data();
    return { uid, user, teacher };
  });

  const t = result.teacher || {};
  if (result.user?.telefono !== '611222333') throw new Error('Professor user phone was not saved.');
  if (!String(t.foto_url || '').startsWith('data:image/jpeg')) throw new Error('Professor file photo was not saved.');
  if (t.estudio_exacto !== 'Grado en Matematicas' || t.acepta_bizum !== true || t.tiene_coche !== true) throw new Error('Professor core profile was not saved.');
  if (t.perfil_completo !== false) throw new Error('Professor profile should remain pending until payout day and validation steps are complete.');
  if (t.colegio !== 'Colegio El Prado') throw new Error('Professor school was not saved separately.');
  if (t.centro_estudios !== 'Universidad Complutense de Madrid') throw new Error('Professor higher education center was not saved.');
  if (!Array.isArray(t.materias) || !t.materias.includes('Padel')) throw new Error('Professor activities were not saved.');
  if (!t.ambitos_ensenanza?.deporte?.subjects?.includes('Padel')) throw new Error('Professor sport scope was not saved.');
  if (!Array.isArray(t.especialidades) || !t.especialidades.includes('EVAU')) throw new Error('Professor specialties were not saved.');
  if (!Array.isArray(t.idiomas) || !t.idiomas.includes('Ingles')) throw new Error('Professor languages were not saved.');

  return {
    uid: setup.uid,
    saved: true,
    teacher: {
      materias: t.materias,
      perfil_completo: t.perfil_completo,
      colegio: t.colegio,
      ambitos_ensenanza: t.ambitos_ensenanza,
    },
  };
}
