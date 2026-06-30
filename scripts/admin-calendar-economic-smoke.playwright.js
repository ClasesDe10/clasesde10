async (page) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('[data-section="calendario"]').first().click();
  await page.waitForFunction(() => {
    const section = document.querySelector('#section-calendario');
    const calendar = document.querySelector('#calendario-wrapper .calendar-wrapper');
    return section && section.offsetParent !== null && calendar;
  }, null, { timeout: 20000 });

  const legend = await page.locator('.calendar-legend').textContent().catch(() => '');
  if (!/En revision/i.test(legend) || !/Liquidar profesor/i.test(legend) || !/Liquidada/i.test(legend)) {
    throw new Error(`Economic calendar legend is incomplete: ${legend}`);
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

  return {
    section: await page.locator('#topbar-title').textContent().catch(() => ''),
    legend,
    clickedDate,
    kpis,
  };
}
