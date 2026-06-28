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

    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    const uid = credential.user.uid;
    await setDoc(doc(firebaseDb, 'users', uid), {
      email,
      nombre: 'Profesor Smoke',
      apellidos: 'Inicial',
      telefono: null,
      role: 'profesor',
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(firebaseDb, 'profesores', uid), {
      userUid: uid,
      email,
      nombre: 'Profesor Smoke',
      apellidos: 'Inicial',
      telefono: null,
      active: true,
      status: 'pendiente_perfil',
      perfil_completo: false,
      profileComplete: false,
      estado_verificacion: 'pendiente_perfil',
      verificationStatus: 'pendiente_perfil',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { uid };
  }, { email, password });

  await page.goto(`${baseUrl}/pages/dashboard/profesor.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#user-nombre')?.textContent.includes('Profesor'), null, { timeout: 30000 });
  await page.waitForTimeout(3500);
  await page.locator('button.sidebar-link[data-section="perfil"]').click().catch(() => {});
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    if (document.querySelector('#form-perfil')?.offsetParent) return;
    document.querySelectorAll('.dash-section').forEach((section) => { section.style.display = 'none'; });
    document.getElementById('section-perfil').style.display = '';
  });
  await page.locator('#form-perfil').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#niveles-check input[data-nivel]').first().waitFor({ state: 'attached', timeout: 30000 });

  await page.locator('#p-nombre').fill('Profesor Smoke');
  await page.locator('#p-apellidos').fill('Actualizado');
  await page.locator('#p-telefono').fill('611222333');
  await page.locator('#p-foto-file').setInputFiles('assets/img/logo-192.png');
  await page.waitForFunction(() => Boolean(document.querySelector('#p-foto-preview img')), null, { timeout: 30000 });
  await page.locator('#p-direccion').fill('Calle Profesor 10');
  await page.locator('#p-ciudad').fill('Madrid');
  await page.locator('#p-cp').fill('28020');
  await page.locator('#p-zona').fill('Madrid centro');
  await page.locator('#p-nivel').selectOption({ label: 'Grado universitario' });
  await page.locator('#p-estudio-exacto').fill('Grado en Matematicas');
  await page.locator('#p-centro-estudios').fill('Universidad Complutense de Madrid');
  await page.locator('#p-nota-bachillerato').fill('8.70');
  await page.locator('#p-nota-universidad').fill('8.10');
  await page.locator('#p-bio').fill('Profesor temporal para validar que el perfil completo guarda correctamente desde la interfaz real.');
  await page.locator('#p-experiencia').fill('3');
  await page.locator('#p-bizum').check();
  await page.locator('#p-disponibilidad').fill('Tardes entre semana y sabados por la manana');
  await page.locator('#nueva-materia').fill('Matematicas');
  await page.locator('#btn-add-materia').click();
  await page.locator('#nueva-materia').fill('Padel');
  await page.locator('#btn-add-materia').click();
  await page.locator('input[data-nivel="ESO"]').check();
  await page.locator('input[data-nivel="Deporte"]').check();
  await page.locator('#form-perfil button[type="submit"]').click();
  await page.waitForTimeout(1800);

  const result = await page.evaluate(async () => {
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
    const { firebaseAuth, firebaseDb } = await import('/js/firebase-client.js');
    const uid = firebaseAuth.currentUser.uid;
    const userSnap = await getDoc(doc(firebaseDb, 'users', uid));
    const teacherSnap = await getDoc(doc(firebaseDb, 'profesores', uid));
    return {
      uid,
      user: userSnap.exists() ? userSnap.data() : null,
      teacher: teacherSnap.exists() ? teacherSnap.data() : null,
      body: document.body.innerText,
    };
  });

  if (result.user?.telefono !== '611222333') throw new Error('Professor user phone was not saved.');
  if (!String(result.teacher?.foto_url || '').startsWith('data:image/jpeg')) throw new Error('Professor file photo was not compressed and saved.');
  if (result.teacher?.estudio_exacto !== 'Grado en Matematicas') throw new Error('Professor exact study was not saved.');
  if (result.teacher?.acepta_bizum !== true) throw new Error('Professor Bizum flag was not saved.');
  if (!Array.isArray(result.teacher?.materias) || !result.teacher.materias.includes('Padel')) throw new Error('Professor activities were not saved.');
  if (result.teacher?.perfil_completo !== true) throw new Error('Professor profileComplete flag was not saved.');

  return {
    uid: setup.uid,
    saved: true,
    teacher: {
      telefono: result.teacher.telefono,
      materias: result.teacher.materias,
      niveles_educativos: result.teacher.niveles_educativos,
      estudio_exacto: result.teacher.estudio_exacto,
      acepta_bizum: result.teacher.acepta_bizum,
      perfil_completo: result.teacher.perfil_completo,
    },
  };
}
