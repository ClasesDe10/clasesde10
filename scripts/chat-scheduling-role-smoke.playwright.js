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
  await page.waitForURL(/\/pages\/dashboard\/(admin|profesor|familia|alumno)(?:\.html)?(?:#.*)?$/, { timeout: 30000, waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForFunction(() => /\/pages\/dashboard\/(admin|profesor|familia|alumno)(?:\.html)?(?:#.*)?$/.test(window.location.pathname), null, { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => Boolean(window.CD10CurrentUser?.email), null, { timeout: 20000 });

  const currentUser = await page.evaluate(() => ({
    uid: window.CD10CurrentUser?.uid || '',
    id: window.CD10CurrentUser?.id || '',
    email: window.CD10CurrentUser?.email || '',
    role: window.CD10CurrentUser?.role || window.CD10CurrentUser?.rol || '',
  })).catch(() => null);
  if (!currentUser?.email || !currentUser?.role) {
    throw new Error(`Dashboard did not expose current user context: ${JSON.stringify(currentUser)}`);
  }

  await page.locator('[data-section="chats"], [data-section="chat"]').first().click();
  await page.waitForSelector('[data-chat-tab="chats"]', { timeout: 20000 });
  await page.locator('[data-chat-tab="chats"]').click();
  await page.waitForSelector('[data-chat-list]', { timeout: 20000 });
  await page.waitForTimeout(2500);

  const chatItems = await page.locator('[data-chat-id]').count();
  if (chatItems > 0) {
    await page.locator('[data-chat-id]').first().click();
    await page.waitForTimeout(1200);
  }
  const headerText = await page.locator('[data-chat-header]').textContent().catch(() => '');
  const chatListText = await page.locator('[data-chat-list]').textContent().catch(() => '');
  if (/Nombre real:\s*(Profesor|Familia)\b/i.test(`${headerText}\n${chatListText}`)) {
    throw new Error('El chat muestra un nombre real generico que no ayuda al usuario.');
  }

  return {
    url: page.url(),
    topbar: await page.locator('#topbar-title').textContent().catch(() => ''),
    currentUser,
    chatItems,
    chatListText,
    headerText,
    consoleErrors: consoleErrors.slice(-8),
    schedulePanelVisible: await page.locator('[data-chat-schedule-panel]').isVisible().catch(() => false),
    scheduleFormVisible: await page.locator('[data-schedule-form]').isVisible().catch(() => false),
    dateFieldVisible: await page.locator('[data-schedule-date]').isVisible().catch(() => false),
  };
}
