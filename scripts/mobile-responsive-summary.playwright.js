async (page) => {
  const auditWidths = [390, 360, 320];

  const visibleOverflow = (rootSelector = 'body') => page.evaluate((selector) => {
    const root = document.querySelector(selector) || document.body;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const bad = [];

    for (const el of Array.from(root.querySelectorAll('*'))) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1 || rect.bottom < 0 || rect.top > vh) continue;
      if (rect.right <= 0 || rect.left >= vw) continue;

      if (rect.right > vw + 2 || rect.left < -2 || rect.width > vw + 2) {
        bad.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className || '').slice(0, 80),
          text: (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 120),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
      }
    }

    return {
      url: location.href,
      title: document.title,
      clientWidth: vw,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      overflow: document.documentElement.scrollWidth > vw + 1,
      bad: bad.slice(0, 5),
    };
  }, rootSelector);

  const failures = [];
  let total = 0;
  const baseUrl = page.url().replace(/^(https?:\/\/[^/]+).*/, '$1');

  if (page.url().includes('/pages/dashboard/admin')) {
    const sections = [
      'dashboard',
      'clases',
      'calendario',
      'profesores',
      'familias',
      'alumnos',
      'solicitudes',
      'pagos',
      'finanzas',
      'leads',
      'documentos',
      'chats',
      'incidencias',
    ];

    for (const width of auditWidths) {
      await page.setViewportSize({ width, height: 844 });
      for (const section of sections) {
        await page.evaluate((name) => {
          document.querySelector(`.sidebar-link[data-section="${name}"]`)?.click();
        }, section);
        await page.waitForTimeout(900);
        const data = await visibleOverflow(`#section-${section}`);
        total += 1;
        if (data.overflow || data.bad.length) {
          failures.push({
            width,
            section,
            url: data.url,
            scrollWidth: data.scrollWidth,
            clientWidth: data.clientWidth,
            bad: data.bad,
          });
        }
      }
    }
    return { mode: 'admin', total, failures };
  }

  const paths = [
    '/',
    '/como-funciona.html',
    '/para-padres.html',
    '/para-profesores.html',
    '/contacto.html',
    '/clases-particulares/',
    '/pages/login.html',
    '/pages/registro.html',
    '/pages/reset-password.html',
  ];

  for (const width of auditWidths) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of paths) {
      await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(700);
      const data = await visibleOverflow('body');
      total += 1;
      if (data.overflow || data.bad.length) {
        failures.push({
          width,
          path,
          url: data.url,
          scrollWidth: data.scrollWidth,
          clientWidth: data.clientWidth,
          bad: data.bad,
        });
      }
    }
  }

  return { mode: 'public', total, failures };
}
