async (page) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForFunction(() => window.__cd10AdminReady && typeof window.cd10AdminGoTo === 'function', null, { timeout: 20000 });
  await page.evaluate(() => window.cd10AdminGoTo('calendario'));
  await page.waitForFunction(() => document.querySelector('#topbar-title')?.textContent?.includes('Calendario'), null, { timeout: 15000 });
  await page.waitForFunction(() => {
    const section = document.querySelector('#section-calendario');
    const calendar = document.querySelector('#calendario-wrapper .calendar-wrapper');
    return section && section.offsetParent !== null && calendar;
  }, null, { timeout: 20000 });

  const legend = await page.locator('.calendar-legend').textContent().catch(() => '');
  for (const label of ['Falta importe', 'Vencida/incidencia', 'En revision', 'Pendiente', 'Liquidar profesor', 'Liquidada', 'Dia pago familia', 'Cobro profesor']) {
    if (!legend.includes(label)) {
      throw new Error(`Economic calendar legend is missing "${label}": ${legend}`);
    }
  }
  const legendClassCount = await page.locator('.calendar-legend .calendar-legend-item').count();
  if (legendClassCount < 8) {
    throw new Error(`Economic calendar legend is incomplete: ${legend}`);
  }
  const commandBar = await page.locator('.admin-calendar-command-bar').textContent().catch(() => '');
  if (!/Detalle clases/i.test(commandBar) || !/Detalle pagos/i.test(commandBar)) {
    throw new Error(`Admin calendar command bar is incomplete: ${commandBar.slice(0, 220)}`);
  }
  const monthKpis = await page.locator('#admin-calendar-month-summary .admin-calendar-kpi').count();
  const monthSummary = await page.locator('#admin-calendar-month-summary').textContent().catch(() => '');
  if (monthKpis < 5 || !/Facturacion/i.test(monthSummary) || !/Pendiente cobro/i.test(monthSummary)) {
    throw new Error(`Economic month summary did not render: ${monthSummary.slice(0, 220)}`);
  }

  const clickedDate = await page.evaluate(() => {
    const day = Array.from(document.querySelectorAll('.calendar-day[data-fecha]'))
      .find((item) => item.querySelector('.day-dot'));
    if (!day) return '';
    day.click();
    return day.dataset.fecha || '';
  });

  let detailText = '';
  let kpis = monthKpis;
  if (clickedDate) {
    await page.waitForFunction(() => {
      const panel = document.querySelector('#cal-clases-dia');
      return panel && (
        panel.querySelector('.admin-calendar-day-summary')
        || panel.textContent.includes('Sin clases')
      );
    }, null, { timeout: 10000 });
    detailText = await page.locator('#cal-clases-dia').textContent().catch(() => '');
    kpis = await page.locator('.admin-calendar-kpi').count();
    if (!/Facturacion/i.test(detailText) || !/Margen/i.test(detailText)) {
      throw new Error(`Economic day summary did not render: ${detailText.slice(0, 220)}`);
    }
  }
  const screenshotPath = 'output/playwright/admin-calendar-economic-polish.png';
  await page.screenshot({ path: screenshotPath, scale: 'css' });

  return {
    section: await page.locator('#topbar-title').textContent().catch(() => ''),
    legend,
    clickedDate,
    kpis,
    screenshotPath,
  };
}
