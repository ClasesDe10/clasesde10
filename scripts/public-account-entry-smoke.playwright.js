async (page) => {
  const baseUrl = page.url().replace(/^(https?:\/\/[^/]+).*/, '$1');
  const paths = [
    { key: 'familias', path: '/para-padres.html', role: 'familia' },
    { key: 'profesores', path: '/para-profesores.html', role: 'profesor' },
  ];
  const result = {};

  for (const item of paths) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}${item.path}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(500);

    const text = await page.locator('body').textContent().catch(() => '');
    const createLink = page.locator(`.contact-form-card a[href="pages/registro.html?rol=${item.role}"]`).first();
    const loginLink = page.locator('.contact-form-card a[href="pages/login.html"]').first();

    const itemResult = {
      formCount: await page.locator('form').count().catch(() => 0),
      publicLeadImports: text.includes('submitLead') || text.includes('public-leads'),
      hasAccountCopy: text.includes('Empieza desde tu cuenta'),
      createVisible: await createLink.isVisible().catch(() => false),
      loginVisible: await loginLink.isVisible().catch(() => false),
      createHref: await createLink.getAttribute('href').catch(() => ''),
      loginHref: await loginLink.getAttribute('href').catch(() => ''),
      title: await page.title(),
    };

    await page.goto(`${baseUrl}/pages/registro.html?rol=${item.role}`, { waitUntil: 'networkidle', timeout: 30000 });
    itemResult.registerSelectedRole = await page
      .locator('.rol-card.selected input[name="rol"]')
      .evaluate((el) => el.value)
      .catch(() => '');

    result[item.key] = itemResult;
  }

  return result;
}
