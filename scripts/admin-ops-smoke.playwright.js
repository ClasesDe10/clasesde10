async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#hamburger').click();
  await page.waitForFunction(() => document.querySelector('#sidebar')?.classList.contains('open'), null, { timeout: 5000 });
  await page.locator('[data-section="operaciones"]').first().click();
  await page.waitForFunction(() => {
    const section = document.querySelector('#section-operaciones');
    const workbench = document.querySelector('[data-admin-ops-workbench]');
    return section
      && section.offsetParent !== null
      && workbench
      && /Bandeja operativa|Calculando prioridades|No se pudo cargar/.test(workbench.textContent || '');
  }, null, { timeout: 5000 });
  await page.waitForFunction(() => {
    const text = document.querySelector('[data-admin-ops-workbench]')?.textContent || '';
    return !/Calculando prioridades/.test(text);
  }, null, { timeout: 30000 });

  const sectionText = await page.locator('#section-operaciones').textContent().catch(() => '');
  if (/No se pudo cargar/i.test(sectionText)) {
    throw new Error(`Ops workbench rendered an error: ${sectionText.slice(0, 240)}`);
  }

  await page.locator('[data-ops-search]').fill('pago').catch(() => {});
  await page.waitForTimeout(250);

  const overflow = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const root = document.querySelector('#section-operaciones');
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
    throw new Error(`Ops workbench mobile overflow: ${JSON.stringify(overflow)}`);
  }

  await page.locator('#busqueda-global').fill('matematicas').catch(() => {});
  await page.waitForTimeout(500);

  return {
    section: await page.locator('#topbar-title').textContent().catch(() => ''),
    kpis: await page.locator('#section-operaciones .ops-kpi').count().catch(() => 0),
    items: await page.locator('#section-operaciones .ops-item').count().catch(() => 0),
    automations: await page.locator('#section-operaciones .ops-automation').count().catch(() => 0),
    globalPanelPresent: await page.locator('#admin-global-search-panel').count().catch(() => 0),
  };
}
