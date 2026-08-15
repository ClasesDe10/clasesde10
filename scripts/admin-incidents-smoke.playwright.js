async (page) => {
  await page.locator('.sidebar-link[data-section="incidencias"]').click({ timeout: 20000 });
  await page.waitForFunction(() => {
    const section = document.querySelector('#section-incidencias');
    return section
      && section.offsetParent !== null
      && section.textContent.includes('Problemas por resolver')
      && document.querySelector('#incidents-summary-grid')
      && document.querySelector('#tbody-incidencias');
  }, null, { timeout: 30000 });
  await page.waitForFunction(() => (
    document.querySelectorAll('#incidents-summary-grid .stat-card').length >= 3
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
      hasPatterns: Boolean(document.querySelector('#incidents-patterns-card') && getComputedStyle(document.querySelector('#incidents-patterns-card')).display !== 'none'),
      hasTicketMeta: Boolean(document.querySelector('#inc-ticket-meta')),
      hasSimpleTable: text.includes('Motivo probable') && text.includes('Accion recomendada'),
      fixButtons: section?.querySelectorAll('[data-incident-fix-button="true"]').length || 0,
      text,
    };
  });

  if (result.topbar !== 'Incidencias') throw new Error(`Expected Incidencias topbar, got ${result.topbar}`);
  if (result.cards < 3) throw new Error(`Expected simplified incident KPI cards, got ${result.cards}`);
  if (result.filters < 5) throw new Error(`Expected incident filters, got ${result.filters}`);
  if (result.actions < 2) throw new Error(`Expected incident actions, got ${result.actions}`);
  if (result.hasPatterns) throw new Error('Incident center should keep patterns hidden in the simplified admin view.');
  if (!result.hasTicketMeta || !result.hasSimpleTable) throw new Error('Incident center missing simplified table or modal metadata nodes.');
  if (result.text.includes('Sin incidencias') === false && !result.fixButtons) {
    throw new Error('Open incidents must expose a direct fix button.');
  }

  await page.locator('#btn-nueva-incidencia').click();
  await page.locator('#modal-incidencia.open').waitFor({ state: 'visible', timeout: 10000 });
  const modalText = await page.locator('#modal-incidencia').innerText();
  if (!modalText.includes('Historial del ticket') || !modalText.includes('Responsable admin')) {
    throw new Error('Incident modal is missing professional ticket fields.');
  }
  const hasGuidedResolution = await page.evaluate(() => {
    const modal = document.querySelector('#modal-incidencia');
    return Boolean(
      modal?.classList.contains('modal-overlay')
      && modal.querySelector('.incident-modal')
      && modal.querySelector('#inc-ai-guide .incident-guide')
      && modal.textContent.includes('Guia rapida')
      && modal.textContent.includes('Posibles motivos')
      && modal.textContent.includes('Comprobacion minima')
      && modal.textContent.includes('Que hago ahora')
      && modal.textContent.includes('Resultado esperado')
      && modal.textContent.includes('Arreglar con este plan')
      && modal.querySelector('[data-incident-guide-action="apply-plan"]')
      && modal.querySelector('[data-incident-guide-action="resolve-now"]')
    );
  });
  if (!hasGuidedResolution) {
    throw new Error('Incident modal is missing guided resolution tools.');
  }
  await page.locator('#modal-incidencia [data-close-modal="modal-incidencia"]').click();

  return {
    topbar: result.topbar,
    cards: result.cards,
    filters: result.filters,
    actions: result.actions,
    fixButtons: result.fixButtons,
    firstText: result.text.replace(/\s+/g, ' ').trim().slice(0, 240),
  };
}
