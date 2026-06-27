async (page) => {
  const baseUrl = page.url().replace(/^(https?:\/\/[^/]+).*/, '$1');
  const shots = [
    ['/pages/login.html', 'output/playwright/login-google-320.png'],
    ['/pages/registro.html?rol=profesor', 'output/playwright/registro-profesor-google-320.png'],
    ['/para-profesores.html#formulario', 'output/playwright/para-profesores-short-320.png'],
  ];
  const results = [];

  await page.setViewportSize({ width: 320, height: 844 });

  for (const [path, file] of shots) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: file, fullPage: false, scale: 'css' });
    results.push(await page.evaluate((currentPath) => ({
      path: currentPath,
      url: location.href,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      googleButton: Boolean(document.querySelector('[id^="btn-google"]')),
      teacherSignupLink: Boolean(document.querySelector('a[href*="registro.html?rol=profesor"]')),
      hiddenHeavyTeacherFields: [
        'prof-canal',
        'prof-niveles',
        'prof-anios',
        'prof-tarifa',
        'prof-experiencia',
        'prof-disponibilidad',
        'prof-verificacion',
      ].every((id) => {
        const el = document.getElementById(id);
        return !el || getComputedStyle(el.closest('.cf-field') || el).display === 'none';
      }),
    }), path));
  }

  return results;
}
