async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => Boolean(document.querySelector('.sidebar-link[data-section="documentos"]')), null, { timeout: 10000 });

  await page.evaluate(() => {
    document.querySelector('.hamburger-btn')?.click();
    document.querySelector('.sidebar-link[data-section="documentos"]')?.click();
  });

  await page.waitForFunction(() => {
    const root = document.querySelector('#admin-document-center .doc-center');
    const section = document.querySelector('#section-documentos');
    const text = root?.textContent || '';
    return root
      && section
      && section.style.display !== 'none'
      && root.querySelectorAll('#doc-kpis .stat-card').length >= 6
      && text.includes('Centro documental')
      && text.includes('Expediente documental')
      && text.includes('Ficha documental')
      && text.includes('Riesgos y recordatorios');
  }, null, { timeout: 30000 });

  const result = await page.evaluate(() => {
    const root = document.querySelector('#section-documentos');
    const center = document.querySelector('#admin-document-center .doc-center');
    const vw = document.documentElement.clientWidth;
    const bad = Array.from(document.querySelectorAll('#section-documentos *'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > vw + 2 && !element.closest('.table-wrapper');
      })
      .slice(0, 8)
      .map((element) => ({
        tag: element.tagName,
        id: element.id || '',
        className: String(element.className || ''),
        width: Math.round(element.getBoundingClientRect().width),
      }));

    const required = [
      'Centro documental',
      'identidad',
      'certificados',
      'contratos',
      'facturas',
      'recibos',
      'versionado',
      'caducidad',
      'auditoria',
      'permisos',
      'Filtros documentales',
      'Expediente documental',
      'Ficha documental',
      'Riesgos y recordatorios',
    ];

    return {
      topbar: document.querySelector('#topbar-title')?.textContent || '',
      text: center?.textContent || '',
      kpis: root?.querySelectorAll('#doc-kpis .stat-card').length || 0,
      filters: ['doc-search', 'doc-filter-status', 'doc-filter-type', 'doc-filter-role', 'doc-filter-risk']
        .filter((id) => document.getElementById(id)).length,
      hasTable: Boolean(document.getElementById('doc-table')),
      hasDetail: Boolean(document.getElementById('doc-detail')),
      hasRisks: Boolean(document.getElementById('doc-risks')),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: vw,
      bad,
      missing: required.filter((item) => !(center?.textContent || '').includes(item)),
    };
  });

  if (result.missing.length) {
    throw new Error(`Centro documental incompleto: ${result.missing.join(', ')}`);
  }
  if (result.kpis < 6) throw new Error(`Expected 6 KPI cards, got ${result.kpis}`);
  if (result.filters < 5) throw new Error(`Expected all document filters, got ${result.filters}`);
  if (!result.hasTable || !result.hasDetail || !result.hasRisks) {
    throw new Error('Missing table, detail or risks panel.');
  }
  if (result.scrollWidth > result.clientWidth + 2 || result.bad.length) {
    throw new Error(`Mobile overflow in document center: ${JSON.stringify({ scrollWidth: result.scrollWidth, clientWidth: result.clientWidth, bad: result.bad })}`);
  }

  return result;
}
