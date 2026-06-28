async (page) => {
  const baseUrl = /^https?:\/\//.test(page.url())
    ? page.url().replace(/^(https?:\/\/[^/]+).*/, '$1')
    : 'https://clasesde10.com';
  const failures = [];
  const currentPath = page.url().replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '') || '/';
  const paths = ['/', '/para-padres.html', '/para-profesores.html', '/contacto.html', '/pages/login.html', '/pages/registro.html'];
  if (currentPath.startsWith('/pages/dashboard/')) paths.push(currentPath);

  async function audit(path, width) {
    await page.setViewportSize({ width, height: width >= 768 ? 1024 : 844 });
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(900);
    return page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const visible = (el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0
          && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw;
      };
      const smallTargets = [];
      const smallFonts = [];
      const selector = 'button, input:not([type="hidden"]), select, textarea, [role="button"], .btn, .topbar-btn, .hamburger-btn, .modal-close';
      for (const el of Array.from(document.querySelectorAll(selector))) {
        if (!visible(el)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 40 || rect.height < 40) {
          smallTargets.push({
            tag: el.tagName.toLowerCase(),
            cls: String(el.className || '').slice(0, 60),
            text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').slice(0, 70),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      }
      for (const el of Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'))) {
        if (!visible(el)) continue;
        const fontSize = Number.parseFloat(getComputedStyle(el).fontSize);
        if (fontSize < 16) smallFonts.push({ tag: el.tagName.toLowerCase(), id: el.id || '', fontSize });
      }
      return {
        overflow: document.documentElement.scrollWidth > vw + 1,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: vw,
        smallTargets: smallTargets.slice(0, 6),
        smallFonts: smallFonts.slice(0, 6),
      };
    });
  }

  for (const width of [320, 390, 768]) {
    for (const path of paths) {
      const result = await audit(path, width);
      if (result.overflow) failures.push({ type: 'overflow', width, path, scrollWidth: result.scrollWidth, clientWidth: result.clientWidth });
      if (width <= 390 && result.smallTargets.length) failures.push({ type: 'small-touch-targets', width, path, details: result.smallTargets });
      if (width <= 390 && result.smallFonts.length) failures.push({ type: 'small-form-fonts', width, path, details: result.smallFonts });
    }
  }

  if (failures.length) throw new Error(JSON.stringify({ failures: failures.slice(0, 12) }, null, 2));
  return { ok: true, checked: paths.length * 3 };
}
