async (page) => {
  await page.evaluate(() => {
    const link = document.querySelector('.sidebar-link[data-section="auditoria"]');
    const group = link?.closest('details');
    if (group) group.open = true;
    link?.click();
  });

  await page.waitForFunction(() => {
    const root = document.querySelector('#section-auditoria');
    return root
      && getComputedStyle(root).display !== 'none'
      && root.textContent.includes('Historial de auditoria');
  }, null, { timeout: 30000 });

  await page.waitForTimeout(1000);

  const result = await page.evaluate(() => {
    const root = document.querySelector('#section-auditoria');
    const visible = root && getComputedStyle(root).display !== 'none';
    const filterIds = [
      'audit-filter-search',
      'audit-filter-module',
      'audit-filter-severity',
      'audit-filter-action',
      'audit-filter-entity',
      'audit-filter-from',
      'audit-filter-to',
    ];
    const headers = Array.from(root?.querySelectorAll('thead th') || []).map((item) => item.textContent.trim());
    const summaryCards = root?.querySelectorAll('#audit-summary-grid .stat-card, #audit-summary-grid > *').length || 0;
    const rows = root?.querySelectorAll('#tbody-auditoria tr').length || 0;
    const countText = document.querySelector('#audit-count')?.textContent?.trim() || '';

    return {
      visible,
      title: root?.querySelector('.card-title')?.textContent?.trim() || '',
      filtersPresent: filterIds.every((id) => Boolean(document.getElementById(id))),
      headers,
      summaryCards,
      rows,
      countText,
      exportButton: Boolean(document.getElementById('btn-export-auditoria')),
    };
  });

  const requiredHeaders = ['Fecha', 'Modulo', 'Accion', 'Usuario', 'Entidad', 'Severidad', 'Contexto'];
  const missingHeaders = requiredHeaders.filter((item) => !result.headers.includes(item));
  if (!result.visible) throw new Error('Audit section is not visible after navigation.');
  if (result.title !== 'Historial de auditoria') throw new Error(`Unexpected audit title: ${result.title}`);
  if (!result.filtersPresent) throw new Error('Audit filters are incomplete.');
  if (!result.exportButton) throw new Error('Audit CSV export button is missing.');
  if (missingHeaders.length) throw new Error(`Audit table missing headers: ${missingHeaders.join(', ')}`);
  if (!result.rows) throw new Error('Audit table did not render any state row.');

  return result;
}
