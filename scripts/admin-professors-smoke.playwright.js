async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const browserLogs = [];
  page.on('console', (message) => {
    browserLogs.push(`${message.type()}: ${message.text()}`.slice(0, 260));
  });
  page.on('pageerror', (error) => {
    browserLogs.push(`pageerror: ${error.message}`.slice(0, 260));
  });
  await page.waitForFunction(() => window.__cd10AdminReady && typeof window.cd10AdminGoTo === 'function', null, { timeout: 20000 });
  await page.evaluate(() => window.cd10AdminGoTo('profesores'));
  await page.waitForFunction(() => document.querySelector('#topbar-title')?.textContent?.includes('Profesores'), null, { timeout: 15000 });
  await page.waitForFunction(() => {
    const tbody = document.querySelector('#tbody-profesores');
    const text = tbody?.textContent || '';
    return Boolean(tbody?.querySelector('.admin-directory-card-profesor'))
      || text.includes('Sin resultados.')
      || text.includes('No hay datos disponibles');
  }, null, { timeout: 15000 }).catch(() => {});

  const countText = await page.locator('#prof-count').textContent().catch(() => '');
  const tableText = await page.locator('#tbody-profesores').textContent().catch(() => '');
  const rowCount = await page.locator('#tbody-profesores tr').count().catch(() => 0);
  const profileButtons = await page.locator('[data-action="ver-profesor"]').count().catch(() => 0);
  const hasBulkToolbar = await page.locator('#bulk-prof-action').count().catch(() => 0);
  const hasRiskFilter = await page.locator('#filtro-prof-riesgo').count().catch(() => 0);
  const hasSelectionColumn = await page.locator('.crm-prof-check').count().catch(() => 0);
  const directoryCards = await page.locator('#tbody-profesores .admin-directory-card-profesor').count().catch(() => 0);
  const directoryAvatars = await page.locator('#tbody-profesores .admin-directory-avatar').count().catch(() => 0);
  if (!hasBulkToolbar || !hasRiskFilter) {
    throw new Error('Admin professor CRM filters and bulk actions are not available.');
  }
  if (!profileButtons || !hasSelectionColumn) {
    throw new Error(`Admin professor CRM rows are missing actions or selection controls. count="${countText}" rows=${rowCount} text="${tableText.replace(/\s+/g, ' ').trim().slice(0, 220)}" logs="${browserLogs.slice(-8).join(' | ')}"`);
  }
  if (!directoryCards || !directoryAvatars) {
    throw new Error('Admin professor list is not using compact photo/name directory cards.');
  }

  await page.locator('[data-action="ver-profesor"]').first().click();
  await page.locator('#modal-profesor-detalle').waitFor({ state: 'visible', timeout: 12000 });
  const modalText = await page.locator('#profesor-detalle-body').textContent().catch(() => '');
  if (!modalText.includes('Ficha CRM') || !modalText.includes('Cronologia operacional') || !modalText.includes('Notas privadas y tareas') || !modalText.includes('Ficha completa / auditoria')) {
    throw new Error('Admin professor CRM detail modal did not render the expected CRM sections.');
  }
  const completeProfile = page.locator('#profesor-detalle-body .admin-complete-profile');
  if (!(await completeProfile.count().catch(() => 0))) {
    throw new Error('Admin professor detail modal is missing the complete audit profile.');
  }
  await completeProfile.locator('summary').click();
  const completeText = await completeProfile.textContent().catch(() => '');
  if (!completeText.includes('JSON completo del perfil') || !completeText.includes('Identidad y contacto')) {
    throw new Error('Admin professor complete profile did not expand with raw profile data.');
  }
  const screenshotPath = 'output/playwright/admin-professor-complete-profile.png';
  await page.screenshot({ path: screenshotPath, scale: 'css' });

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
    modalHasCompleteProfile: completeText.includes('JSON completo del perfil'),
    screenshotPath,
    hasAiProfileStatus: tableText.includes('IA perfil:'),
    logs: browserLogs.slice(-8),
    legacyUnavailable: tableText.includes('No hay datos disponibles para este modulo'),
    empty: tableText.includes('Sin resultados.'),
    firstRow: tableText.replace(/\s+/g, ' ').trim().slice(0, 180),
  };
}
