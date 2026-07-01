async (page) => {
  const email = process.env.CD10_PROFILE_EMAIL;
  const password = process.env.CD10_PROFILE_PASSWORD;
  if (!email || !password) throw new Error('CD10_PROFILE_EMAIL and CD10_PROFILE_PASSWORD are required.');

  const consoleErrors = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) consoleErrors.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  const baseUrl = page.url().replace(/^(https?:\/\/[^/]+).*/, '$1');
  await page.goto(`${baseUrl}/pages/login.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#form-login').evaluate((form) => form.requestSubmit());
  await page.waitForURL(/\/pages\/dashboard\/(profesor|familia)(?:\.html)?(?:#.*)?$/, { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => Boolean(window.CD10CurrentUser?.email), null, { timeout: 20000 });

  const role = await page.evaluate(() => window.CD10CurrentUser?.role || window.CD10CurrentUser?.rol || '');
  const sections = await page.evaluate(() => [...new Set(
    Array.from(document.querySelectorAll('.sidebar-link[data-section]'))
      .map((button) => button.dataset.section)
      .filter(Boolean),
  )]);

  const inspectSection = (selector) => page.evaluate((rootSelector) => {
    const root = document.querySelector(rootSelector);
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const visibleText = (root?.innerText || '').replace(/\s+/g, ' ').trim();
    const bad = [];
    if (!root) return { missing: true, visibleText, overflow: false, bad, scrollWidth: document.documentElement.scrollWidth, clientWidth: vw };
    for (const element of Array.from(root.querySelectorAll('*'))) {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1 || rect.bottom < 0 || rect.top > vh) continue;
      if (rect.right > vw + 2 || rect.left < -2 || rect.width > vw + 2) {
        bad.push({
          tag: element.tagName.toLowerCase(),
          cls: String(element.className || '').slice(0, 80),
          text: (element.innerText || element.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 120),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
      }
    }
    return {
      missing: false,
      visibleText,
      overflow: document.documentElement.scrollWidth > vw + 1,
      bad: bad.slice(0, 6),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: vw,
    };
  }, selector);

  const failures = [];
  const widths = [390, 360, 320];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    for (const section of sections) {
      await page.evaluate((name) => {
        document.querySelector(`.sidebar-link[data-section="${name}"]`)?.click();
      }, section);
      await page.waitForTimeout(section === 'chat' ? 1300 : 800);
      const data = await inspectSection(`#section-${section}`);
      const brokenText = /\bundefined\b|\[object Object\]|Programada legacy|Nombre real:\s*(Profesor|Familia)\b/i.test(data.visibleText);
      if (data.missing || data.overflow || data.bad.length || brokenText) {
        failures.push({
          width,
          section,
          missing: data.missing,
          overflow: data.overflow,
          scrollWidth: data.scrollWidth,
          clientWidth: data.clientWidth,
          brokenText,
          bad: data.bad,
          sample: data.visibleText.slice(0, 220),
        });
      }
    }
  }

  if (failures.length) {
    throw new Error(`Role dashboard UX issues: ${JSON.stringify(failures.slice(0, 5))}`);
  }

  return {
    role,
    sections,
    checks: widths.length * sections.length,
    consoleErrors: consoleErrors.slice(-8),
  };
}
