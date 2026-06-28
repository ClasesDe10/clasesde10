async (page) => {
  const baseUrl = page.url().replace(/^(https?:\/\/[^/]+).*/, '$1');
  const email = process.env.CD10_PROFILE_EMAIL;
  const password = process.env.CD10_PROFILE_PASSWORD;
  if (!email || !password) throw new Error('Missing temporary professor credentials.');

  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle', timeout: 30000 });
  const setup = await page.evaluate(async ({ email, password }) => {
    const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js');
    const { doc, serverTimestamp, setDoc } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
    const { firebaseAuth, firebaseDb } = await import('/js/firebase-client.js');
    const uid = (await signInWithEmailAndPassword(firebaseAuth, email, password)).user.uid;
    await setDoc(doc(firebaseDb, 'users', uid), {
      email, nombre: 'Profesor Smoke', apellidos: 'Inicial', role: 'profesor', active: true,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await setDoc(doc(firebaseDb, 'profesores', uid), {
      userUid: uid, email, nombre: 'Profesor Smoke', apellidos: 'Inicial', active: true,
      status: 'pendiente_perfil', perfil_completo: false, profileComplete: false,
      estado_verificacion: 'pendiente_perfil', verificationStatus: 'pendiente_perfil',
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    return { uid };
  }, { email, password });

  await page.goto(`${baseUrl}/pages/dashboard/profesor.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#user-nombre')?.textContent.includes('Profesor'), null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.locator('button.sidebar-link[data-section="perfil"]').click().catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    if (document.querySelector('#niveles-check input[data-nivel]')) return;
    document.querySelectorAll('.dash-section').forEach((section) => { section.style.display = 'none'; });
    document.getElementById('section-perfil').style.display = '';
  });
  await page.locator('#niveles-check input[data-nivel]').first().waitFor({ state: 'attached', timeout: 30000 });

  for (const [selector, value] of [
    ['#p-nombre', 'Profesor Smoke'],
    ['#p-apellidos', 'Actualizado'],
    ['#p-telefono', '611222333'],
    ['#p-direccion', 'Calle Profesor 10'],
    ['#p-ciudad', 'Madrid'],
    ['#p-cp', '28020'],
    ['#p-zona', 'Madrid centro'],
    ['#p-estudio-exacto', 'Grado en Matematicas'],
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
  await page.locator('#p-nivel').selectOption({ label: 'Grado universitario' });
  await page.locator('#p-bizum').check();
  for (const item of ['Matematicas', 'Padel']) {
    await page.locator('#nueva-materia').fill(item);
    await page.locator('#btn-add-materia').click();
  }
  for (const nivel of ['ESO', 'Deporte']) await page.locator(`input[data-nivel="${nivel}"]`).check();
  await page.locator('#form-perfil button[type="submit"]').click();
  await page.waitForTimeout(1800);

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
  if (t.exactStudy !== 'Grado en Matematicas' || t.acepta_bizum !== true || t.perfil_completo !== true) throw new Error('Professor core profile was not saved.');
  if (!Array.isArray(t.materias) || !t.materias.includes('Padel')) throw new Error('Professor activities were not saved.');
  if (!Array.isArray(t.specialties) || !t.specialties.includes('EVAU')) throw new Error('Professor specialties were not saved.');
  if (!Array.isArray(t.languages) || !t.languages.includes('Ingles')) throw new Error('Professor languages were not saved.');
  if (typeof t.profileCompletionPercent !== 'number') throw new Error('Professor profile completion was not saved.');

  return {
    uid: setup.uid,
    saved: true,
    teacher: {
      materias: t.materias,
      perfil_completo: t.perfil_completo,
      profileCompletionPercent: t.profileCompletionPercent,
    },
  };
}
