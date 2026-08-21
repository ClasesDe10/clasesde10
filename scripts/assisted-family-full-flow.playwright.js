async (page) => {
  const email = process.env.ASSISTED_FAMILY_EMAIL;
  const emailLink = process.env.ASSISTED_FAMILY_LINK;
  const password = process.env.ASSISTED_FAMILY_PASSWORD;
  const permissionErrors = [];

  page.on('console', (message) => {
    if (/missing or insufficient permissions/i.test(message.text())) permissionErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    if (/missing or insufficient permissions/i.test(error.message)) permissionErrors.push(error.message);
  });

  await page.goto(emailLink, { waitUntil: 'domcontentloaded' });
  const emailForm = page.locator('#form-email');
  if (await emailForm.isVisible().catch(() => false)) {
    await page.locator('#email').fill(email);
    await emailForm.locator('button[type="submit"]').click();
  }

  await page.locator('#form-password').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#password').fill(password);
  await page.locator('#password-confirm').fill(password);
  await page.locator('#btn-save').click();
  await page.waitForURL(/\/pages\/dashboard\/familia(?:\.html)?/, { timeout: 45000 });
  await page.waitForLoadState('domcontentloaded');

  const profileModal = page.locator('#modal-perfil-familia');
  await profileModal.waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#p-apellidos').fill('QA Operativa');
  await page.locator('#p-telefono').fill('+34600000000');
  await page.locator('#p-direccion').fill('Calle de Alcalá 100');
  await page.locator('#p-ciudad').fill('Madrid');
  await page.locator('#p-cp').fill('28009');
  await page.locator('#p-zona').fill('Retiro');
  await page.locator('#p-contacto-preferido').selectOption('chat');
  await page.locator('#p-emergencia-nombre').fill('Contacto QA Alternativo');
  await page.locator('#p-emergencia-telefono').fill('+34600000001');
  await page.locator('#p-idiomas').fill('Español');
  await page.locator('#p-notas').fill('Preferimos clases presenciales por la tarde con seguimiento semanal del progreso.');
  await page.locator('#form-perfil button[type="submit"]').click();
  await page.waitForFunction(() => !document.querySelector('#modal-perfil-familia')?.classList.contains('open'), null, { timeout: 30000 });

  await page.evaluate(() => document.querySelector('#btn-nueva-solicitud-top')?.click());
  await page.locator('#modal-solicitud').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('#sol-alumno option').length > 1, null, { timeout: 30000 });
  const studentValue = await page.locator('#sol-alumno option').evaluateAll((options) => options.map((option) => option.value).find(Boolean) || '');
  if (!studentValue) throw new Error('No assisted student available in the family request form.');
  await page.locator('#sol-alumno').selectOption(studentValue);
  await page.locator('#sol-materia').fill('Física y Química');
  await page.locator('#sol-curso').selectOption({ label: '3º ESO' });
  await page.locator('#sol-horario').fill('Martes y jueves de 17:00 a 19:00');
  await page.locator('#sol-observaciones').fill('Segunda solicitud temporal para validar permisos autenticados.');
  await page.locator('#btn-enviar-solicitud').click();
  await page.waitForFunction(() => !document.querySelector('#modal-solicitud')?.classList.contains('open'), null, { timeout: 30000 });

  const bodyText = await page.locator('body').textContent();
  if (/missing or insufficient permissions/i.test(bodyText)) permissionErrors.push('Raw permission error rendered in the UI.');
  if (permissionErrors.length) throw new Error(permissionErrors.join(' | '));

  const modeToggle = page.locator('#btn-family-panel-mode');
  if ((await modeToggle.textContent()).trim() !== 'Panel simplificado') {
    throw new Error('The extended family panel does not offer the simplified view.');
  }
  await modeToggle.click();
  await page.waitForFunction(() => document.body.dataset.familyPanelMode === 'simplified');
  const simplifiedSections = await page.locator('.sidebar-link').evaluateAll((links) => links
    .filter((link) => getComputedStyle(link).display !== 'none')
    .map((link) => link.dataset.section));
  if (JSON.stringify(simplifiedSections) !== JSON.stringify(['calendario', 'chat', 'notificaciones'])) {
    throw new Error(`Unexpected simplified navigation: ${simplifiedSections.join(', ')}`);
  }
  if ((await modeToggle.textContent()).trim() !== 'Panel extendido') {
    throw new Error('The simplified family panel does not offer the extended view.');
  }
  if (await page.locator('#btn-nueva-solicitud-top').isVisible()) {
    throw new Error('The occasional teacher request action remains visible in simplified mode.');
  }
  if (new URL(page.url()).hash !== '#calendario') {
    throw new Error('Simplified mode did not move from an extended area to the calendar.');
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.familyPanelMode === 'simplified', null, { timeout: 30000 });
  if ((await page.locator('#btn-family-panel-mode').textContent()).trim() !== 'Panel extendido') {
    throw new Error('The simplified preference was not restored after reload.');
  }
  await page.evaluate(() => { window.location.hash = '#profesores'; });
  await page.waitForFunction(() => document.body.dataset.familyPanelMode === 'extended');
  if (!await page.locator('#section-profesores').isVisible()) {
    throw new Error('A direct action to an occasional area did not expand the family panel.');
  }
  const extendedSections = await page.locator('.sidebar-link').evaluateAll((links) => links
    .filter((link) => getComputedStyle(link).display !== 'none')
    .map((link) => link.dataset.section));
  if (extendedSections.length !== 10 || !extendedSections.includes('inicio') || !extendedSections.includes('perfil')) {
    throw new Error(`The extended navigation is incomplete: ${extendedSections.join(', ')}`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#btn-family-panel-mode').click();
  await page.waitForFunction(() => document.body.dataset.familyPanelMode === 'simplified');
  const mobileToggleBox = await page.locator('#btn-family-panel-mode').boundingBox();
  if (!mobileToggleBox || mobileToggleBox.x < 0 || mobileToggleBox.x + mobileToggleBox.width > 390) {
    throw new Error('The family panel toggle overflows the mobile topbar.');
  }
  const mobileMetrics = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  if (mobileMetrics.scrollWidth > mobileMetrics.viewportWidth) {
    throw new Error(`The simplified mobile panel overflows horizontally: ${JSON.stringify(mobileMetrics)}`);
  }
  await page.locator('#hamburger').click();
  await page.waitForFunction(() => document.querySelector('#sidebar')?.classList.contains('open'));
  const mobileSections = await page.locator('.sidebar-link').evaluateAll((links) => links
    .filter((link) => getComputedStyle(link).display !== 'none')
    .map((link) => link.dataset.section));
  if (JSON.stringify(mobileSections) !== JSON.stringify(['calendario', 'chat', 'notificaciones'])) {
    throw new Error(`Unexpected mobile simplified navigation: ${mobileSections.join(', ')}`);
  }

  return {
    emailLinkVerified: true,
    passwordSaved: true,
    familyDashboardReached: true,
    profileCompleted: true,
    authenticatedRequestSubmitted: true,
    simplifiedPanelLimitedToDailySections: true,
    panelPreferencePersisted: true,
    extendedPanelRestored: true,
    occasionalActionExpandedPanel: true,
    mobilePanelValidated: true,
    rawPermissionErrors: 0,
  };
}
