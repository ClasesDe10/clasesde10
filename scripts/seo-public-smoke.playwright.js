async (page) => {
  const base = page.url().replace(/^(https?:\/\/[^/]+).*/, '$1');
  const expectedSocialImage = `${base}/assets/img/social-share.png`;
  const sitemapResponse = await page.context().request.get(`${base}/sitemap.xml`);
  if (!sitemapResponse.ok()) throw new Error(`Sitemap unavailable: ${sitemapResponse.status()}`);
  const sitemapText = await sitemapResponse.text();
  const urls = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
  if (urls.length !== 36 || new Set(urls).size !== urls.length) {
    throw new Error(`Unexpected sitemap architecture: ${urls.length} URLs`);
  }

  const robotsResponse = await page.context().request.get(`${base}/robots.txt`);
  const robotsText = await robotsResponse.text();
  if (!robotsResponse.ok() || !robotsText.includes(`Sitemap: ${base}/sitemap.xml`)) {
    throw new Error('robots.txt or sitemap declaration missing');
  }
  if (/Disallow:\s*\/pages\/(?:dashboard|login|registro|reset-password)/i.test(robotsText)) {
    throw new Error('robots.txt prevents crawlers from seeing private-page noindex');
  }

  const results = [];

  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of urls) {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!response || response.status() !== 200) {
      throw new Error(`Indexable URL returned ${response?.status() || 'no response'}: ${url}`);
    }
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    const mobile = await page.evaluate((socialImage) => {
      const internalCopy = /arquitectura seo|seo local|sin contenido duplicado|intenci[oó]n de b[uú]squeda|can[oó]nica limpia|datos estructurados|enlazado interno|sitemap a mano|landings? espec[ií]ficas?|generad[ao]s? autom[aá]ticamente|este hub|hubs? locales?|convierten? mejor/i;
      const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')].map((node) => {
        try {
          return JSON.parse(node.textContent || '');
        } catch {
          return null;
        }
      });
      const schemaItems = schemas.flatMap((schema) => schema
        ? (Array.isArray(schema['@graph']) ? schema['@graph'] : [schema])
        : []);
      const schemaTypes = schemaItems.flatMap((item) => Array.isArray(item?.['@type']) ? item['@type'] : [item?.['@type']]).filter(Boolean);
      return {
        lang: document.documentElement.lang,
        title: document.title,
        h1Count: document.querySelectorAll('h1').length,
        h1: document.querySelector('h1')?.innerText || '',
        canonical: document.querySelector('link[rel="canonical"]')?.href || '',
        description: document.querySelector('meta[name="description"]')?.content || '',
        robots: document.querySelector('meta[name="robots"]')?.content || '',
        ogUrl: document.querySelector('meta[property="og:url"]')?.content || '',
        ogImage: document.querySelector('meta[property="og:image"]')?.content || '',
        ogWidth: document.querySelector('meta[property="og:image:width"]')?.content || '',
        ogHeight: document.querySelector('meta[property="og:image:height"]')?.content || '',
        twitterCard: document.querySelector('meta[name="twitter:card"]')?.content || '',
        schemaCount: schemas.length,
        schemaParseOk: schemas.every(Boolean),
        forbiddenSchema: schemaTypes.some((type) => ['FAQPage', 'LocalBusiness', 'EducationalOrganization'].includes(type)),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        badText: /Ã|Â|â€|ðŸ/.test(document.body.innerText || ''),
        forbiddenCopy: internalCopy.test(document.body.innerText || ''),
        htmlLinks: [...document.querySelectorAll('a[href]')].map((anchor) => anchor.getAttribute('href') || '').filter((href) => /\.html(?:[?#]|$)/i.test(href)),
        cards: document.querySelectorAll('.seo-card').length,
        socialImageExpected: socialImage,
      };
    }, expectedSocialImage);

    if (mobile.lang !== 'es' || mobile.h1Count !== 1 || !mobile.description || !mobile.schemaCount || !mobile.schemaParseOk) {
      throw new Error(`SEO essentials missing on ${url}: ${JSON.stringify(mobile)}`);
    }
    if (mobile.canonical !== url || mobile.ogUrl !== url) {
      throw new Error(`Canonical/social URL mismatch on ${url}: ${JSON.stringify(mobile)}`);
    }
    if (mobile.ogImage !== expectedSocialImage || mobile.ogWidth !== '1200' || mobile.ogHeight !== '630' || mobile.twitterCard !== 'summary_large_image') {
      throw new Error(`Social preview metadata mismatch on ${url}: ${JSON.stringify(mobile)}`);
    }
    if (/noindex/i.test(mobile.robots) || mobile.forbiddenSchema || mobile.badText || mobile.forbiddenCopy || mobile.htmlLinks.length) {
      throw new Error(`SEO policy/content issue on ${url}: ${JSON.stringify(mobile)}`);
    }
    if (mobile.scrollWidth > mobile.clientWidth + 1) {
      throw new Error(`Mobile overflow on ${url}: ${JSON.stringify(mobile)}`);
    }
    if (new URL(url).pathname.startsWith('/clases-particulares') && mobile.cards < 6) {
      throw new Error(`Classes page lacks useful navigation on ${url}: ${mobile.cards} cards`);
    }
    results.push({ url, title: mobile.title, h1: mobile.h1, cards: mobile.cards });
  }

  const desktopSamples = [
    '/',
    '/para-padres',
    '/para-profesores',
    '/clases-particulares',
    '/clases-particulares/madrid',
    '/clases-particulares/matematicas',
  ];
  await page.setViewportSize({ width: 1366, height: 900 });
  for (const path of desktopSamples) {
    await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (dimensions.scrollWidth > dimensions.clientWidth + 1) {
      throw new Error(`Desktop overflow on ${path}: ${JSON.stringify(dimensions)}`);
    }
  }

  for (const privatePath of ['/pages/login', '/pages/registro', '/termina-tu-cuenta']) {
    const response = await page.context().request.get(`${base}${privatePath}`);
    const html = await response.text();
    const header = response.headers()['x-robots-tag'] || '';
    if (!response.ok() || !/noindex/i.test(header) || !/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html)) {
      throw new Error(`Private URL lacks layered noindex protection: ${privatePath}`);
    }
  }

  const removedDoorway = await page.context().request.get(`${base}/clases-particulares/matematicas-madrid`, { maxRedirects: 0 });
  if (removedDoorway.status() !== 301 || removedDoorway.headers().location !== '/clases-particulares/matematicas') {
    throw new Error(`Consolidated URL does not return the expected 301: ${removedDoorway.status()} ${removedDoorway.headers().location || ''}`);
  }

  return {
    checked: results.length,
    sitemapUrls: urls.length,
    privateNoindexChecked: 3,
    desktopSamples: desktopSamples.length,
    results,
  };
}
