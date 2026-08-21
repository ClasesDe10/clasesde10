async (page) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  const origin = await page.evaluate(() => location.origin);
  await page.goto(`${origin}/pages/login.html?google-routes-matching=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.addStyleTag({ url: `${origin}/css/dashboard.css?v=20260821-google-routes-v2` });

  const result = await page.evaluate(async () => {
    const engine = await import('/js/ai-engine.js?v=20260821-google-routes-v2');
    const request = {
      materia: 'Matematicas',
      curso: '4º ESO',
      modalidad: 'presencial',
      direccion: 'Calle Mayor 1',
      codigo_postal: '28013',
      ciudad: 'Madrid',
      preferencia_horario: 'martes tarde',
    };
    const baseTeacher = {
      id: 'teacher_exact',
      nombre: 'Profesora de prueba',
      email: 'teacher@example.com',
      telefono: '600111222',
      foto_url: 'https://example.com/photo.jpg',
      direccion: 'Calle Serrano 1',
      codigo_postal: '28001',
      ciudad: 'Madrid',
      modalidad: 'presencial',
      materias: ['Matematicas'],
      niveles_educativos: ['ESO'],
      nivel_estudios: 'Grado universitario',
      estudio_exacto: 'Grado en Matematicas',
      colegio: 'Colegio de prueba',
      centro_estudios: 'Universidad de prueba',
      nota_bachillerato: 9,
      nota_media_universidad: 8.5,
      disponibilidad_resumen: 'martes tarde',
      acepta_bizum: true,
      tiene_coche: true,
      status: 'verificado',
      active: true,
      routeEstimate: {
        provider: 'google_routes',
        exact: true,
        computedAt: '2026-08-21T12:00:00.000Z',
        confidence: 'google_routes_full_address',
        routes: {
          walking: { distanceMeters: 850, durationSeconds: 480 },
          transit: { distanceMeters: 1500, durationSeconds: 720 },
          driving: { distanceMeters: 1300, durationSeconds: 300 },
        },
      },
    };
    const exact = engine.scoreTeacherForRequest(request, baseTeacher).locationEstimate;
    const noCar = engine.scoreTeacherForRequest(request, {
      ...baseTeacher,
      id: 'teacher_no_car',
      tiene_coche: false,
    }).locationEstimate;
    const estimated = engine.scoreTeacherForRequest(request, {
      ...baseTeacher,
      id: 'teacher_estimated',
      routeEstimate: null,
    }).locationEstimate;
    const adminSource = await fetch('/pages/dashboard/admin.html?verify=google-routes-v100').then((response) => response.text());
    const serviceWorkerSource = await fetch('/service-worker.js?verify=google-routes-v100').then((response) => response.text());

    const renderOptions = (estimate) => estimate.displayOptions.map((option) => (
      `<span class="badge ${option.withinLimit ? 'badge-gray' : 'badge-warning'}">${option.label}: ${option.km} km / ${option.minutes} min</span>`
    )).join('');
    document.body.innerHTML = `
      <main style="max-width:920px;margin:24px auto;padding:20px">
        <span class="section-eyebrow">Matching presencial</span>
        <h1>Comparación de desplazamiento</h1>
        <section class="card" style="margin-top:18px"><div class="card-body">
          <h2 style="margin-top:0">Ruta exacta</h2>
          <div style="display:flex;gap:7px;flex-wrap:wrap">${renderOptions(exact)}</div>
          <p><strong>Mejor opción:</strong> ${exact.recommendedMode}</p>
          <span class="badge badge-success">Ruta exacta</span>
          <span translate="no" style="font-family:Roboto,Arial,sans-serif;font-weight:400;font-size:.75rem;color:#5e5e5e">Google Maps</span>
        </div></section>
        <section class="card" style="margin-top:18px"><div class="card-body">
          <h2 style="margin-top:0">Fallback transparente</h2>
          <div style="display:flex;gap:7px;flex-wrap:wrap">${renderOptions(estimated)}</div>
          <span class="badge badge-warning">Ruta estimada · Maps pendiente</span>
        </div></section>
      </main>`;
    return {
      version: engine.MATCHING_VERSION,
      exact: exact.exact,
      provider: exact.provider,
      recommendedMode: exact.recommendedMode,
      exactModes: exact.displayOptions.map((option) => option.mode),
      noCarModes: noCar.displayOptions.map((option) => option.mode),
      estimatedExact: estimated.exact,
      estimatedModes: estimated.displayOptions.map((option) => option.mode),
      adminMarkers: ['Ruta exacta', 'GMP-attribution', 'Ruta estimada · Maps pendiente', 'MATCHING_VERSION'].every((marker) => adminSource.includes(marker)),
      pwaV100: serviceWorkerSource.includes('clasesde10-pwa-v100'),
    };
  });

  if (result.version !== 'professional_matching_v6_google_routes') throw new Error(`Unexpected matching version: ${result.version}`);
  if (!result.exact || result.provider !== 'google_routes') throw new Error('Exact Google route was not consumed by the matching engine.');
  if (result.recommendedMode !== 'walking') throw new Error(`Walking should win the close-route comparison, got ${result.recommendedMode}.`);
  if (result.exactModes.join(',') !== 'walking,transit,driving') throw new Error(`Unexpected exact modes: ${result.exactModes.join(',')}`);
  if (result.noCarModes.includes('driving')) throw new Error('Driving must be excluded when the teacher has no car.');
  if (result.estimatedExact || !result.estimatedModes.includes('walking')) throw new Error('Fallback must remain estimated and include walking.');
  if (!result.adminMarkers || !result.pwaV100) throw new Error('Published admin/PWA markers are incomplete.');

  const desktopScreenshot = 'output/playwright/google-routes-matching-production.png';
  await page.screenshot({ path: desktopScreenshot, scale: 'css', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (mobileOverflow) throw new Error('Google routes matching fixture overflows on mobile.');
  const mobileScreenshot = 'output/playwright/google-routes-matching-production-mobile.png';
  await page.screenshot({ path: mobileScreenshot, scale: 'css', fullPage: true });
  return { ...result, desktopScreenshot, mobileScreenshot, mobileOverflow };
}
