async (page) => {
  await page.locator('[data-section="incidencias"]').click({ timeout: 20000 });
  await page.waitForFunction(() => {
    const section = document.querySelector('#section-incidencias');
    return section
      && section.offsetParent !== null
      && section.textContent.includes('Centro de incidencias')
      && document.querySelector('#incidents-summary-grid')
      && document.querySelector('#tbody-incidencias');
  }, null, { timeout: 30000 });
  await page.waitForFunction(() => (
    document.querySelectorAll('#incidents-summary-grid .stat-card').length >= 5
  ), null, { timeout: 30000 });

  const result = await page.evaluate(() => {
    const section = document.querySelector('#section-incidencias');
    const text = section?.textContent || '';
    return {
      topbar: document.querySelector('#topbar-title')?.textContent || '',
      cards: section?.querySelectorAll('#incidents-summary-grid .stat-card').length || 0,
      filters: [
        '#filtro-inc-busqueda',
        '#filtro-inc-estado',
        '#filtro-inc-prioridad',
        '#filtro-inc-categoria',
        '#filtro-inc-responsable',
      ].filter((selector) => document.querySelector(selector)).length,
      actions: [
        '#btn-export-incidencias',
        '#btn-nueva-incidencia',
      ].filter((selector) => document.querySelector(selector)).length,
      hasPatterns: Boolean(document.querySelector('#incidents-patterns')),
      hasTicketMeta: Boolean(document.querySelector('#inc-ticket-meta')),
      text,
    };
  });

  if (result.topbar !== 'Incidencias') throw new Error(`Expected Incidencias topbar, got ${result.topbar}`);
  if (result.cards < 5) throw new Error(`Expected incident KPI cards, got ${result.cards}`);
  if (result.filters < 5) throw new Error(`Expected incident filters, got ${result.filters}`);
  if (result.actions < 2) throw new Error(`Expected incident actions, got ${result.actions}`);
  if (!result.hasPatterns || !result.hasTicketMeta) throw new Error('Incident center missing patterns or modal metadata nodes.');

  await page.locator('#btn-nueva-incidencia').click();
  await page.locator('#modal-incidencia.open').waitFor({ state: 'visible', timeout: 10000 });
  const modalText = await page.locator('#modal-incidencia').innerText();
  if (!modalText.includes('Historial del ticket') || !modalText.includes('Responsable admin')) {
    throw new Error('Incident modal is missing professional ticket fields.');
  }
  await page.locator('#modal-incidencia [data-close-modal="modal-incidencia"]').click();

  return {
    topbar: result.topbar,
    cards: result.cards,
    filters: result.filters,
    actions: result.actions,
    firstText: result.text.replace(/\s+/g, ' ').trim().slice(0, 240),
  };
}
