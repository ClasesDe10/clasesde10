async (page) => {
  const email = process.env.CD10_ADMIN_EMAIL;
  const password = process.env.CD10_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('CD10_ADMIN_EMAIL and CD10_ADMIN_PASSWORD are required.');
  }

  const baseUrl = page.url().replace(/^(https?:\/\/[^/]+).*/, '$1');
  await page.goto(`${baseUrl}/pages/login.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#form-login').evaluate((form) => form.requestSubmit());
  await page.waitForURL(/\/pages\/dashboard\/admin(?:\.html)?(?:#.*)?$/, { timeout: 20000, waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForFunction(() => {
    return /\/pages\/dashboard\/admin(?:\.html)?(?:#.*)?$/.test(window.location.pathname)
      && Boolean(document.querySelector('#topbar-title'));
  }, null, { timeout: 20000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

  return {
    url: page.url(),
    title: await page.title(),
    topbar: await page.locator('#topbar-title').textContent().catch(() => ''),
  };
}
