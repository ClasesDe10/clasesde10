async (page) => {
  await page.locator('[data-section="configuracion"]').click({ timeout: 20000 });
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-platform-config-root]');
    return root
      && root.textContent.includes('Centro de Configuracion')
      && root.textContent.includes('Comportamiento completo de ClasesDe10')
      && root.textContent.includes('Historial y control de versiones');
  }, null, { timeout: 30000 });

  const result = await page.evaluate(() => {
    const root = document.querySelector('[data-platform-config-root]');
    const text = root?.textContent || '';
    const fields = root?.querySelectorAll('[data-config-path]').length || 0;
    const sections = root?.querySelectorAll('[data-config-section]').length || 0;
    const actions = root?.querySelectorAll('[data-config-action]').length || 0;
    const required = [
      'Negocio y precios',
      'Pagos, Bizum y Stripe',
      'Automatizaciones y SLAs',
      'Matching',
      'IA',
      'Notificaciones y plantillas',
      'Web publica, SEO y marca',
      'Feature flags',
      'Integraciones',
      'Seguridad y auditoria',
    ];
    return {
      topbar: document.querySelector('#topbar-title')?.textContent || '',
      text,
      fields,
      sections,
      actions,
      hasSave: Boolean(root?.querySelector('[data-config-action="save"]')),
      hasExport: Boolean(root?.querySelector('[data-config-action="export"]')),
      hasDefaults: Boolean(root?.querySelector('[data-config-action="defaults"]')),
      missing: required.filter((item) => !text.includes(item)),
    };
  });

  if (result.missing.length) {
    throw new Error(`Configuration center missing sections: ${result.missing.join(', ')}`);
  }
  if (result.fields < 60) {
    throw new Error(`Expected at least 60 configurable fields, got ${result.fields}`);
  }
  if (result.sections < 10) {
    throw new Error(`Expected at least 10 configuration sections, got ${result.sections}`);
  }
  if (result.actions < 3 || !result.hasSave || !result.hasExport || !result.hasDefaults) {
    throw new Error('Configuration center is missing save/export/default controls.');
  }

  await page.locator('[data-config-search]').fill('Bizum');
  await page.waitForTimeout(300);
  const filtered = await page.locator('[data-config-path]').count();
  if (filtered < 1 || filtered >= result.fields) {
    throw new Error(`Configuration search did not filter fields correctly: ${filtered}/${result.fields}`);
  }

  return {
    topbar: result.topbar,
    fields: result.fields,
    sections: result.sections,
    actions: result.actions,
    filteredFields: filtered,
    firstText: result.text.replace(/\s+/g, ' ').trim().slice(0, 260),
  };
}
