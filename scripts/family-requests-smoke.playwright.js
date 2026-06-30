async (page) => {
  const email = process.env.CD10_PROFILE_EMAIL;
  const password = process.env.CD10_PROFILE_PASSWORD;
  if (!email || !password) throw new Error('CD10_PROFILE_EMAIL and CD10_PROFILE_PASSWORD are required.');

  const consoleErrors = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      consoleErrors.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(`pageerror: ${error.message}`);
  });

  const baseUrl = page.url().replace(/^(https?:\/\/[^/]+).*/, '$1');
  await page.goto(`${baseUrl}/pages/login.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#form-login').evaluate((form) => form.requestSubmit());
  await page.waitForURL(/\/pages\/dashboard\/familia(?:\.html)?(?:#.*)?$/, { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  await page.locator('[data-section="solicitudes"]').click();
  await page.locator('#section-solicitudes').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => {
    const text = document.querySelector('#tbody-solicitudes')?.textContent || '';
    return text && !text.includes('Cargando');
  }, { timeout: 20000 }).catch(() => {});

  const headerText = await page.locator('#section-solicitudes thead').textContent().catch(() => '');
  const tableText = await page.locator('#tbody-solicitudes').textContent().catch(() => '');
  if (!headerText.includes('Matching')) {
    throw new Error(`La tabla de solicitudes no muestra la columna Matching: ${headerText}`);
  }
  if (tableText.includes('undefined') || tableText.includes('[object Object]')) {
    throw new Error(`La tabla de solicitudes renderiza texto roto: ${tableText}`);
  }
  if (tableText.includes('Cargando')) {
    throw new Error('La tabla de solicitudes se queda cargando.');
  }

  return {
    url: page.url(),
    topbar: await page.locator('#topbar-title').textContent().catch(() => ''),
    headers: headerText.replace(/\s+/g, ' ').trim(),
    rowCount: await page.locator('#tbody-solicitudes tr').count().catch(() => 0),
    sample: tableText.replace(/\s+/g, ' ').trim().slice(0, 220),
    consoleErrors: consoleErrors.slice(-8),
  };
}
