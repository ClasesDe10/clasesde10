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

  await page.locator('#btn-nueva-solicitud-top').click();
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

  return {
    emailLinkVerified: true,
    passwordSaved: true,
    familyDashboardReached: true,
    profileCompleted: true,
    authenticatedRequestSubmitted: true,
    rawPermissionErrors: 0,
  };
}
