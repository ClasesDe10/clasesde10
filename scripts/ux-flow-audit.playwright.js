async (page) => {
  const base = page.url().replace(/^(https?:\/\/[^/]+).*/, '$1');
  const failures = [];
  const checked = [];

  const auditTargets = () => page.evaluate(() => Array.from(document.querySelectorAll('button, .btn, .btn-primary, .btn-secondary, .btn-ghost, .tab-btn, .google-auth-btn, .hamburger-btn, .modal-close, input, select, textarea'))
    .filter((el) => {
      if (el.matches('.sidebar:not(.open), .sidebar:not(.open) *')) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0 && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
    })
    .map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || '').slice(0, 70),
        text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').slice(0, 70),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    })
    .filter((item) => item.w < 38 || item.h < 38)
    .slice(0, 10));

  const checkForm = async (path, selector) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.locator(selector).evaluate((form) => form.requestSubmit());
    await page.waitForTimeout(700);
    const result = await page.evaluate((sel) => {
      const form = document.querySelector(sel);
      const fields = Array.from(form?.elements || [])
        .filter((el) => el instanceof HTMLElement && el.matches('input, select, textarea') && el.type !== 'hidden' && !el.disabled);
      const invalid = fields.filter((el) => !el.checkValidity());
      const active = document.activeElement;
      const errors = Array.from(document.querySelectorAll('.field-error-message'))
        .filter((el) => getComputedStyle(el).display !== 'none' && el.textContent.trim())
        .map((el) => el.textContent.trim());
      return { invalid: invalid.length, activeInvalid: Boolean(active && invalid.includes(active)), errors };
    }, selector);
    const smallTargets = await auditTargets();
    checked.push({ path, selector });
    if (!result.invalid || (!result.activeInvalid && !result.errors.length)) failures.push({ type: 'form-feedback', path, result });
    if (smallTargets.length) failures.push({ type: 'touch-targets', path, smallTargets });
  };

  if (page.url().includes('/pages/dashboard/admin')) {
    await page.setViewportSize({ width: 390, height: 844 });
    const nav = await page.evaluate(() => {
      const button = document.querySelector('.hamburger-btn');
      const sidebar = document.querySelector('.sidebar');
      button?.click();
      const opened = sidebar?.classList.contains('open') && button?.getAttribute('aria-expanded') === 'true';
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const closed = !sidebar?.classList.contains('open') && button?.getAttribute('aria-expanded') === 'false';
      return { opened, closed };
    });
    await page.evaluate(() => document.querySelector('[data-section="chats"]')?.click());
    await page.waitForTimeout(800);
    const smallTargets = await auditTargets();
    checked.push({ section: 'admin-sidebar' }, { section: 'admin-chats' });
    if (!nav.opened || !nav.closed) failures.push({ type: 'admin-sidebar', nav });
    if (smallTargets.length) failures.push({ type: 'admin-touch-targets', smallTargets });
    return { mode: 'admin', checked, failures };
  }

  await checkForm('/pages/login.html', '#form-login');
  await checkForm('/pages/registro.html', '#form-registro');
  return { mode: 'public', checked, failures };
}
