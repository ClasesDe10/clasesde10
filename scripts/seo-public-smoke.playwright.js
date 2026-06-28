async (page) => {
  const base = page.url().replace(/^(https?:\/\/[^/]+).*/, '$1');
  const paths = [
    '/clases-particulares',
    '/clases-particulares/madrid',
    '/clases-particulares/matematicas-madrid',
    '/clases-particulares/ingles-barcelona',
    '/clases-particulares/guitarra-valencia',
    '/clases-particulares/padel-malaga',
  ];
  const results = [];

  for (const path of paths) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

    const mobile = await page.evaluate(() => ({
      title: document.title,
      h1: document.querySelector('h1')?.innerText || '',
      canonical: document.querySelector('link[rel="canonical"]')?.href || '',
      description: document.querySelector('meta[name="description"]')?.content || '',
      schemaCount: document.querySelectorAll('script[type="application/ld+json"]').length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      badText: /Ã|Â|â€|ðŸ/.test(document.body.innerText || ''),
    }));

    if (!mobile.h1 || !mobile.canonical || !mobile.description || !mobile.schemaCount) {
      throw new Error(`SEO essentials missing on ${path}: ${JSON.stringify(mobile)}`);
    }
    if (mobile.canonical.endsWith('.html')) {
      throw new Error(`Canonical still uses .html on ${path}: ${mobile.canonical}`);
    }
    if (mobile.scrollWidth > mobile.clientWidth + 1) {
      throw new Error(`Mobile overflow on ${path}: ${JSON.stringify(mobile)}`);
    }
    if (mobile.badText) {
      throw new Error(`Broken encoding detected on ${path}`);
    }

    await page.setViewportSize({ width: 1366, height: 900 });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    const desktop = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      cards: document.querySelectorAll('.seo-card').length,
      ctas: document.querySelectorAll('.seo-button').length,
    }));
    if (desktop.scrollWidth > desktop.clientWidth + 1) {
      throw new Error(`Desktop overflow on ${path}: ${JSON.stringify(desktop)}`);
    }
    if (desktop.cards < 6 || desktop.ctas < 2) {
      throw new Error(`SEO page lacks internal-link density on ${path}: ${JSON.stringify(desktop)}`);
    }

    results.push({
      path,
      title: mobile.title,
      h1: mobile.h1,
      cards: desktop.cards,
    });
  }

  return { checked: results.length, results };
}
