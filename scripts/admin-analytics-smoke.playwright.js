async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#hamburger').click();
  await page.waitForFunction(() => document.querySelector('#sidebar')?.classList.contains('open'), null, { timeout: 5000 });
  await page.evaluate(() => {
    const link = document.querySelector('.sidebar-link[data-section="analitica"]');
    const group = link?.closest('details');
    if (group) group.open = true;
    link?.click();
  });
  await page.waitForFunction(() => {
    const section = document.querySelector('#section-analitica');
    const stats = document.querySelector('#analytics-kpis');
    const pages = document.querySelector('#tbody-analytics-pages');
    const events = document.querySelector('#tbody-analytics-events');
    return section
      && section.offsetParent !== null
      && stats
      && pages
      && events
      && !stats.textContent.includes('Cargando')
      && !pages.textContent.includes('Cargando')
      && !events.textContent.includes('Cargando');
  }, null, { timeout: 30000 });

  const sectionText = await page.locator('#section-analitica').textContent().catch(() => '');
  if (/Error:/i.test(sectionText)) {
    throw new Error(`Analytics section rendered an error: ${sectionText.slice(0, 240)}`);
  }

  const overflow = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const root = document.querySelector('#section-analitica');
    const bad = [];
    for (const el of Array.from(root.querySelectorAll('*'))) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      if (rect.right > vw + 2 || rect.left < -2 || rect.width > vw + 2) {
        bad.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className || '').slice(0, 80),
          text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 120),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
      }
    }
    return { vw, scrollWidth: document.documentElement.scrollWidth, bad: bad.slice(0, 5) };
  });

  if (overflow.scrollWidth > overflow.vw + 1 || overflow.bad.length) {
    throw new Error(`Analytics mobile overflow: ${JSON.stringify(overflow)}`);
  }

  return {
    section: await page.locator('#topbar-title').textContent().catch(() => ''),
    cards: await page.locator('#analytics-kpis .stat-card').count().catch(() => 0),
    pageRows: await page.locator('#tbody-analytics-pages tr').count().catch(() => 0),
    eventRows: await page.locator('#tbody-analytics-events tr').count().catch(() => 0),
    version: await page.locator('#analytics-version').textContent().catch(() => ''),
  };
}
