async (page) => {
  await page.waitForFunction(() => {
    const root = document.querySelector('#admin-control-center .control-center');
    return root
      && root.textContent.includes('Mission Control')
      && root.textContent.includes('Inteligencia empresarial')
      && !root.textContent.includes('Centro de control no disponible');
  }, null, { timeout: 30000 });

  const result = await page.evaluate(() => {
    const root = document.querySelector('#section-dashboard');
    const text = root?.textContent || '';
    const cards = root?.querySelectorAll('.control-kpi').length || 0;
    const missionSystems = root?.querySelectorAll('.mission-system').length || 0;
    const chartBars = root?.querySelectorAll('.control-chart-bar').length || 0;
    const actionButtons = root?.querySelectorAll('[data-control-nav]').length || 0;
    const required = [
      'Mission Control',
      'Estado tecnico de la plataforma',
      'Incidencias prioritarias',
      'Mapa de subsistemas',
      'Firebase',
      'Cloud Functions',
      'Backups',
      'Inteligencia empresarial',
      'Prevision de cierre',
      'Deteccion de anomalias',
      'Expedientes conectados',
      'Producto integrado',
      'SLA operativo',
      'Profesores destacados',
      'Salud del marketplace',
      'Evolucion mensual',
      'Alertas automaticas',
      'Actividad reciente',
      'Moderacion y auditorias',
      'Calidad de datos',
    ];
    return {
      text,
      cards,
      missionSystems,
      chartBars,
      actionButtons,
      missing: required.filter((item) => !text.includes(item)),
    };
  });

  const healthChecks = await page.evaluate(async () => {
    const firestore = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
    const client = await import('/js/firebase-client.js?v=20260627-domain-auth');
    const snapshot = await firestore.getDocs(firestore.query(
      firestore.collection(client.firebaseDb, 'platformHealthChecks'),
      firestore.limit(5),
    ));
    return snapshot.size;
  });

  if (result.missing.length) {
    throw new Error(`Control center missing sections: ${result.missing.join(', ')}`);
  }
  if (result.cards < 6) {
    throw new Error(`Expected at least 6 KPI cards, got ${result.cards}`);
  }
  if (result.missionSystems < 15) {
    throw new Error(`Expected all Mission Control subsystems, got ${result.missionSystems}`);
  }
  if (result.chartBars < 6) {
    throw new Error(`Expected 6 monthly chart bars, got ${result.chartBars}`);
  }
  if (result.actionButtons < 3) {
    throw new Error(`Expected actionable controls, got ${result.actionButtons}`);
  }
  if (healthChecks < 1) {
    throw new Error('Mission Control did not persist platformHealthChecks snapshots.');
  }

  return {
    topbar: await page.locator('#topbar-title').textContent().catch(() => ''),
    cards: result.cards,
    missionSystems: result.missionSystems,
    chartBars: result.chartBars,
    actionButtons: result.actionButtons,
    healthChecks,
    firstText: result.text.replace(/\s+/g, ' ').trim().slice(0, 260),
  };
}
