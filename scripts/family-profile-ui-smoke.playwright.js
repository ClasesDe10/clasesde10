async (page) => {
  const baseUrl = page.url().replace(/^(https?:\/\/[^/]+).*/, '$1');
  const email = process.env.CD10_PROFILE_EMAIL;
  const password = process.env.CD10_PROFILE_PASSWORD;
  if (!email || !password) throw new Error('Missing temporary family credentials.');

  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle', timeout: 30000 });
  const setup = await page.evaluate(async ({ email, password }) => {
    const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js');
    const { doc, serverTimestamp, setDoc } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
    const { firebaseAuth, firebaseDb } = await import('/js/firebase-client.js');

    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    const uid = credential.user.uid;
    await setDoc(doc(firebaseDb, 'users', uid), {
      email,
      nombre: 'Familia Smoke',
      apellidos: 'Inicial',
      telefono: null,
      role: 'familia',
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(firebaseDb, 'familias', uid), {
      userUid: uid,
      email,
      nombre: 'Familia Smoke',
      apellidos: 'Inicial',
      telefono: null,
      active: true,
      status: 'activo',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { uid };
  }, { email, password });

  await page.goto(`${baseUrl}/pages/dashboard/familia.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#user-nombre')?.textContent.includes('Familia'), null, { timeout: 30000 });
  await page.waitForTimeout(3500);
  await page.locator('button.sidebar-link[data-section="perfil"]').click().catch(() => {});
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    if (document.querySelector('#form-perfil')?.offsetParent) return;
    document.querySelectorAll('.dash-section').forEach((section) => { section.style.display = 'none'; });
    document.getElementById('section-perfil').style.display = '';
  });
  await page.locator('#form-perfil').waitFor({ state: 'visible', timeout: 30000 });

  await page.locator('#p-nombre').fill('Familia Smoke');
  await page.locator('#p-apellidos').fill('Actualizada');
  await page.locator('#p-telefono').fill('600123456');
  await page.locator('#p-direccion').fill('Calle Perfil 10');
  await page.locator('#p-ciudad').fill('Madrid');
  await page.locator('#p-cp').fill('28010');
  await page.locator('#p-zona').fill('Chamberi');
  await page.locator('#p-contacto-preferido').selectOption('whatsapp');
  await page.locator('#p-emergencia-nombre').fill('Tutor Alternativo');
  await page.locator('#p-emergencia-telefono').fill('699123456');
  await page.locator('#p-idiomas').fill('Espanol, Ingles');
  await page.locator('#p-notas').fill('Preferimos clases presenciales por la tarde y seguimiento semanal de avances.');
  await page.locator('#form-perfil button[type="submit"]').click();
  await page.waitForTimeout(1500);

  const result = await page.evaluate(async () => {
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
    const { firebaseAuth, firebaseDb } = await import('/js/firebase-client.js');
    const uid = firebaseAuth.currentUser.uid;
    const userSnap = await getDoc(doc(firebaseDb, 'users', uid));
    const familySnap = await getDoc(doc(firebaseDb, 'familias', uid));
    return {
      uid,
      user: userSnap.exists() ? userSnap.data() : null,
      family: familySnap.exists() ? familySnap.data() : null,
      body: document.body.innerText,
    };
  });

  if (result.user?.telefono !== '600123456') {
    throw new Error(`Family user phone was not saved: ${JSON.stringify({ user: result.user, family: result.family })}`);
  }
  if (result.family?.direccion !== 'Calle Perfil 10') {
    throw new Error(`Family address was not saved: ${JSON.stringify({ user: result.user, family: result.family })}`);
  }
  if (result.family?.codigo_postal !== '28010') {
    throw new Error(`Family postal code was not saved: ${JSON.stringify({ user: result.user, family: result.family })}`);
  }
  if (result.family?.zona !== 'Chamberi' || result.family?.preferredContact !== 'whatsapp') {
    throw new Error(`Family matching fields were not saved: ${JSON.stringify({ family: result.family })}`);
  }
  if (!Array.isArray(result.family?.languages) || !result.family.languages.includes('Ingles')) {
    throw new Error(`Family languages were not saved: ${JSON.stringify({ family: result.family })}`);
  }
  if (typeof result.family?.profileCompletionPercent !== 'number') {
    throw new Error(`Family profile completion was not saved: ${JSON.stringify({ family: result.family })}`);
  }

  return {
    uid: setup.uid,
    saved: true,
    family: {
      nombre: result.family.nombre,
      direccion: result.family.direccion,
      ciudad: result.family.ciudad,
      codigo_postal: result.family.codigo_postal,
      zona: result.family.zona,
      profileCompletionPercent: result.family.profileCompletionPercent,
    },
  };
}
