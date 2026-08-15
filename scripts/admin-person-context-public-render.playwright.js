async (page) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  const origin = await page.evaluate(() => location.origin);
  await page.goto(`${origin}/pages/login.html?admin-person-render=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.addStyleTag({ url: `${origin}/css/dashboard.css?v=20260815-admin-person-context` });

  const result = await page.evaluate(async () => {
    const { AdminPersonDirectory, renderAdminPersonReference } = await import('/js/admin-person-context.js?v=20260815-admin-person-context');
    const directory = new AdminPersonDirectory().register({
      users: [
        { id: 'family-user', role: 'familia', nombre: 'María Elena', apellidos: 'García López' },
        { id: 'teacher-user', role: 'profesor', nombre: 'Francisco Javier', apellidos: 'Martín Fernández' },
      ],
      families: [{ id: 'family-profile', userUid: 'family-user', nombre: 'María Elena' }],
      teachers: [{ id: 'teacher-profile', userUid: 'teacher-user', nombre: 'Francisco Javier' }],
      students: [
        { id: 'student-one', nombre: 'Lucía', apellidos: 'García Pérez', familyUid: 'family-profile' },
        { id: 'student-two', nombre: 'Alejandro', apellidos: 'García Pérez', familyUid: 'family-profile' },
      ],
      classes: [
        { id: 'class-one', familyUid: 'family-user', teacherUid: 'teacher-user', studentId: 'student-one' },
      ],
    });
    document.body.innerHTML = `
      <main style="max-width:920px;margin:24px auto;padding:20px">
        <span class="section-eyebrow">Comprobación productiva</span>
        <h1>Identidad y acceso administrativo</h1>
        <section class="card"><div class="card-body" style="display:grid;gap:18px">
          ${renderAdminPersonReference({ role: 'familia', id: 'family-user' }, directory)}
          ${renderAdminPersonReference({ role: 'profesor', id: 'teacher-user', studentId: 'student-one' }, directory)}
          ${renderAdminPersonReference({ role: 'alumno', id: 'student-one' }, directory)}
        </div></section>
      </main>`;
    return {
      text: document.body.innerText,
      buttons: [...document.querySelectorAll('[data-action="ver-persona-admin"]')].map((button) => ({
        label: button.textContent.trim(),
        role: button.dataset.personRole,
        id: button.dataset.personId,
      })),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });

  for (const text of [
    'María Elena García López',
    'Hijos: Lucía García Pérez, Alejandro García Pérez',
    'Francisco Javier Martín Fernández',
    'Alumno/a: Lucía García Pérez',
    'Familia: María Elena García López',
  ]) {
    if (!result.text.includes(text)) throw new Error(`Missing admin identity text: ${text}`);
  }
  if (result.buttons.length !== 3) throw new Error(`Expected 3 profile buttons, got ${result.buttons.length}`);
  if (!result.buttons.some((button) => button.role === 'familia' && button.id === 'family-profile')) throw new Error('Family account alias did not resolve to CRM profile');
  if (!result.buttons.some((button) => button.role === 'profesor' && button.id === 'teacher-profile')) throw new Error('Teacher account alias did not resolve to CRM profile');
  if (result.overflow) throw new Error('Desktop identity fixture overflows horizontally');

  const desktopScreenshot = 'output/playwright/admin-person-context-production-fixture.png';
  await page.screenshot({ path: desktopScreenshot, scale: 'css', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (mobileOverflow) throw new Error('Mobile identity fixture overflows horizontally');
  const mobileScreenshot = 'output/playwright/admin-person-context-production-mobile.png';
  await page.screenshot({ path: mobileScreenshot, scale: 'css', fullPage: true });
  return { ...result, desktopScreenshot, mobileScreenshot, mobileOverflow };
}
