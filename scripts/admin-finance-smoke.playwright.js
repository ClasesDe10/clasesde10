async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#hamburger').click();
  await page.waitForFunction(() => document.querySelector('#sidebar')?.classList.contains('open'), null, { timeout: 5000 });
  await page.locator('[data-section="finanzas"]').first().click();
  await page.waitForFunction(() => {
    const section = document.querySelector('#section-finanzas');
    const stats = document.querySelector('#finanzas-stats');
    const risks = document.querySelector('#tbody-finanzas-riesgos');
    const teachers = document.querySelector('#tbody-finanzas-profesores');
    return section
      && section.offsetParent !== null
      && stats
      && risks
      && teachers
      && !stats.textContent.includes('Cargando')
      && !risks.textContent.includes('Cargando')
      && !teachers.textContent.includes('Cargando');
  }, null, { timeout: 25000 });

  const sectionText = await page.locator('#section-finanzas').textContent().catch(() => '');
  if (/Error:/i.test(sectionText)) {
    throw new Error(`Finance section rendered an error: ${sectionText.slice(0, 240)}`);
  }

  const overflow = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const root = document.querySelector('#section-finanzas');
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
    throw new Error(`Finance mobile overflow: ${JSON.stringify(overflow)}`);
  }

  return {
    section: await page.locator('#topbar-title').textContent().catch(() => ''),
    cards: await page.locator('#finanzas-stats .stat-card').count().catch(() => 0),
    riskRows: await page.locator('#tbody-finanzas-riesgos tr').count().catch(() => 0),
    teacherRows: await page.locator('#tbody-finanzas-profesores tr').count().catch(() => 0),
    month: await page.locator('#finanzas-mes').inputValue().catch(() => ''),
  };
}
