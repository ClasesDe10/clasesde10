async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => window.__cd10AdminReady && typeof window.cd10AdminGoTo === 'function', null, { timeout: 20000 });
  await page.evaluate(() => window.cd10AdminGoTo('familias'));
  await page.waitForFunction(() => document.querySelector('#topbar-title')?.textContent?.includes('Familias'), null, { timeout: 15000 });
  await page.waitForFunction(() => {
    const tbody = document.querySelector('#tbody-familias');
    const text = tbody?.textContent || '';
    return Boolean(tbody?.querySelector('.admin-directory-card-familia'))
      || text.includes('Sin resultados.')
      || text.includes('No hay datos disponibles');
  }, null, { timeout: 15000 }).catch(() => {});

  const countText = await page.locator('#fam-count').textContent().catch(() => '');
  const tableText = await page.locator('#tbody-familias').textContent().catch(() => '');
  const rowCount = await page.locator('#tbody-familias tr').count().catch(() => 0);
  const profileButtons = await page.locator('[data-action="ver-familia"]').count().catch(() => 0);
  const hasBulkToolbar = await page.locator('#bulk-fam-action').count().catch(() => 0);
  const hasRiskFilter = await page.locator('#filtro-fam-riesgo').count().catch(() => 0);
  const hasSelectionColumn = await page.locator('.crm-fam-check').count().catch(() => 0);
  const directoryCards = await page.locator('#tbody-familias .admin-directory-card-familia').count().catch(() => 0);
  const directoryAvatars = await page.locator('#tbody-familias .admin-directory-avatar').count().catch(() => 0);

  if (!hasBulkToolbar || !hasRiskFilter) {
    throw new Error('Admin family CRM filters and bulk actions are not available.');
  }
  if (!profileButtons || !hasSelectionColumn) {
    throw new Error(`Admin family CRM rows are missing actions or selection controls. count="${countText}" rows=${rowCount} text="${tableText.replace(/\s+/g, ' ').trim().slice(0, 220)}"`);
  }
  if (!directoryCards || !directoryAvatars) {
    throw new Error('Admin family list is not using compact photo/name directory cards.');
  }
  if (tableText.includes('Invalid Date')) {
    throw new Error('Admin family CRM table renders an invalid date.');
  }

  await page.locator('[data-action="ver-familia"]').first().click();
  await page.locator('#modal-familia-detalle').waitFor({ state: 'visible', timeout: 12000 });
  const modalText = await page.locator('#familia-detalle-body').textContent().catch(() => '');
  if (!modalText.includes('Ficha CRM') || !modalText.includes('Cronologia operacional') || !modalText.includes('Notas privadas y tareas')) {
    throw new Error('Admin family CRM detail modal did not render the expected CRM sections.');
  }

  return {
    section: await page.locator('#topbar-title').textContent().catch(() => ''),
    countText,
    rowCount,
    profileButtons,
    directoryCards,
    directoryAvatars,
    hasBulkToolbar: Boolean(hasBulkToolbar),
    hasRiskFilter: Boolean(hasRiskFilter),
    hasSelectionColumn: Boolean(hasSelectionColumn),
    modalHasCrm: modalText.includes('Ficha CRM'),
    legacyUnavailable: tableText.includes('No hay datos disponibles para este modulo'),
    empty: tableText.includes('Sin resultados.'),
    firstRow: tableText.replace(/\s+/g, ' ').trim().slice(0, 180),
  };
}
