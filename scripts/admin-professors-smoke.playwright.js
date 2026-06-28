async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.querySelector('[data-section="profesores"]')?.click();
  });
  await page.waitForTimeout(2500);

  const countText = await page.locator('#prof-count').textContent().catch(() => '');
  const tableText = await page.locator('#tbody-profesores').textContent().catch(() => '');
  const rowCount = await page.locator('#tbody-profesores tr').count().catch(() => 0);
  const profileButtons = await page.locator('[data-action="ver-profesor"]').count().catch(() => 0);
  const hasBulkToolbar = await page.locator('#bulk-prof-action').count().catch(() => 0);
  const hasRiskFilter = await page.locator('#filtro-prof-riesgo').count().catch(() => 0);
  const hasSelectionColumn = await page.locator('.crm-prof-check').count().catch(() => 0);
  if (!hasBulkToolbar || !hasRiskFilter) {
    throw new Error('Admin professor CRM filters and bulk actions are not available.');
  }
  if (!profileButtons || !hasSelectionColumn) {
    throw new Error('Admin professor CRM rows are missing actions or selection controls.');
  }

  await page.locator('[data-action="ver-profesor"]').first().click();
  await page.locator('#modal-profesor-detalle').waitFor({ state: 'visible', timeout: 12000 });
  const modalText = await page.locator('#profesor-detalle-body').textContent().catch(() => '');
  if (!modalText.includes('Ficha CRM') || !modalText.includes('Cronologia operacional') || !modalText.includes('Notas privadas y tareas')) {
    throw new Error('Admin professor CRM detail modal did not render the expected CRM sections.');
  }

  return {
    section: await page.locator('#topbar-title').textContent().catch(() => ''),
    countText,
    rowCount,
    profileButtons,
    hasBulkToolbar: Boolean(hasBulkToolbar),
    hasRiskFilter: Boolean(hasRiskFilter),
    hasSelectionColumn: Boolean(hasSelectionColumn),
    modalHasCrm: modalText.includes('Ficha CRM'),
    hasAiProfileStatus: tableText.includes('IA perfil:'),
    legacyUnavailable: tableText.includes('No hay datos disponibles para este modulo'),
    empty: tableText.includes('Sin resultados.'),
    firstRow: tableText.replace(/\s+/g, ' ').trim().slice(0, 180),
  };
}
