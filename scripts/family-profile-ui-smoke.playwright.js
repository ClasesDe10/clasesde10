async (page) => {
  const baseUrl = page.url().replace(/^(https?:\/\/[^/]+).*/, '$1');
  const email = process.env.CD10_PROFILE_EMAIL;
  const password = process.env.CD10_PROFILE_PASSWORD;
  if (!email || !password) throw new Error('Missing temporary family credentials.');

  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
  const setup = await page.evaluate(async ({ email, password }) => {
    const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js');
    const { doc, getDoc, serverTimestamp, setDoc } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
    const { firebaseAuth, firebaseDb } = await import('/js/firebase-client.js');

    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    const uid = credential.user.uid;
    const userRef = doc(firebaseDb, 'users', uid);
    const familyRef = doc(firebaseDb, 'familias', uid);
    const [userSnap, familySnap] = await Promise.all([getDoc(userRef), getDoc(familyRef)]);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        email,
        nombre: 'Familia Smoke',
        apellidos: 'Inicial',
        telefono: null,
        role: 'familia',
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    if (!familySnap.exists()) {
      await setDoc(familyRef, {
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
    }
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
  await page.waitForFunction(() => document.querySelector('#form-perfil')?.dataset.loaded === 'true', null, { timeout: 30000 }).catch(() => {});

  const expected = await page.evaluate(() => ({
    nombre: document.querySelector('#p-nombre')?.value || 'Familia',
    apellidos: document.querySelector('#p-apellidos')?.value || 'Smoke',
    telefono: document.querySelector('#p-telefono')?.value || '600123456',
    direccion: document.querySelector('#p-direccion')?.value || 'Calle Perfil 10',
    ciudad: document.querySelector('#p-ciudad')?.value || 'Madrid',
    codigoPostal: document.querySelector('#p-cp')?.value || '28010',
    zona: document.querySelector('#p-zona')?.value || 'Chamberi',
    contactoPreferido: document.querySelector('#p-contacto-preferido')?.value || 'chat',
    emergenciaNombre: document.querySelector('#p-emergencia-nombre')?.value || '',
    emergenciaTelefono: document.querySelector('#p-emergencia-telefono')?.value || '',
    idiomas: document.querySelector('#p-idiomas')?.value || '',
    notas: document.querySelector('#p-notas')?.value || '',
  }));

  await page.locator('#p-nombre').fill(expected.nombre);
  await page.locator('#p-apellidos').fill(expected.apellidos);
  await page.locator('#p-telefono').fill(expected.telefono);
  await page.locator('#p-direccion').fill(expected.direccion);
  await page.locator('#p-ciudad').fill(expected.ciudad);
  await page.locator('#p-cp').fill(expected.codigoPostal);
  await page.locator('#p-zona').fill(expected.zona);
  await page.locator('#p-contacto-preferido').selectOption(expected.contactoPreferido || 'chat');
  await page.locator('#p-emergencia-nombre').fill(expected.emergenciaNombre);
  await page.locator('#p-emergencia-telefono').fill(expected.emergenciaTelefono);
  await page.locator('#p-idiomas').fill(expected.idiomas);
  await page.locator('#p-notas').fill(expected.notas);
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

  if (result.user?.telefono !== expected.telefono) {
    throw new Error(`Family user phone was not saved: ${JSON.stringify({ user: result.user, family: result.family })}`);
  }
  if (result.family?.direccion !== expected.direccion) {
    throw new Error(`Family address was not saved: ${JSON.stringify({ user: result.user, family: result.family })}`);
  }
  if (result.family?.codigo_postal !== expected.codigoPostal) {
    throw new Error(`Family postal code was not saved: ${JSON.stringify({ user: result.user, family: result.family })}`);
  }
  if (result.family?.zona !== expected.zona || result.family?.preferredContact !== (expected.contactoPreferido || 'chat')) {
    throw new Error(`Family matching fields were not saved: ${JSON.stringify({ family: result.family })}`);
  }
  if (!Array.isArray(result.family?.languages)) {
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
