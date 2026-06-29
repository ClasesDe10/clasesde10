async (page) => {
  const baseUrl = page.url().replace(/^(https?:\/\/[^/]+).*/, '$1');
  const email = process.env.CD10_PROFILE_EMAIL;
  const password = process.env.CD10_PROFILE_PASSWORD;
  if (!email || !password) throw new Error('Missing temporary family credentials.');

  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const setup = await page.evaluate(async ({ email, password }) => {
    const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js');
    const { doc, serverTimestamp, setDoc } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
    const { firebaseAuth, firebaseDb } = await import('/js/firebase-client.js');

    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    const uid = credential.user.uid;
    await setDoc(doc(firebaseDb, 'users', uid), {
      email,
      nombre: 'Familia Journey',
      apellidos: 'Smoke',
      role: 'familia',
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(firebaseDb, 'familias', uid), {
      userUid: uid,
      email,
      nombre: 'Familia Journey',
      apellidos: 'Smoke',
      active: true,
      status: 'activo',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { uid };
  }, { email, password });

  await page.goto(`${baseUrl}/pages/dashboard/familia.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('.family-journey-card[data-family-journey-stage="no_student"]').waitFor({ state: 'visible', timeout: 30000 });
  const text = await page.locator('.family-journey-card').textContent();
  if (!text.includes('Anade el primer alumno') || !text.includes('Progreso')) {
    throw new Error(`Family journey initial guidance is incomplete: ${text}`);
  }

  await page.locator('.family-journey-card [data-family-journey-action="add_student"]').first().click();
  await page.locator('#modal-hijo.open').waitFor({ state: 'visible', timeout: 15000 });
  const modalText = await page.locator('#modal-hijo').textContent();
  if (!modalText.includes('te guiaremos directamente para pedir profesor')) {
    throw new Error(`Family child modal does not explain the next step: ${modalText}`);
  }

  await page.locator('[data-close-modal="modal-hijo"]').click();
  await page.locator('button.sidebar-link[data-section="inicio"]').click();
  await page.locator('.family-journey-card').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('.family-journey-card [data-family-journey-action="complete_profile"]').first().click();
  await page.locator('#section-perfil').waitFor({ state: 'visible', timeout: 15000 });

  return {
    uid: setup.uid,
    stage: await page.locator('.family-journey-card').getAttribute('data-family-journey-stage'),
    topbar: await page.locator('#topbar-title').textContent().catch(() => ''),
  };
}
