async (page) => {
  const baseUrl = page.url().replace(/^(https?:\/\/[^/]+).*/, '$1');
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.setContent(`
    <!doctype html>
    <html lang="es">
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Command Smoke</title></head>
    <body>
      <div class="dash-layout">
        <aside class="sidebar">
          <button class="sidebar-link active" data-section="inicio">Inicio</button>
          <button class="sidebar-link" data-section="alumnos">Mis hijos</button>
          <button class="sidebar-link" data-section="solicitudes">Solicitudes</button>
          <button class="sidebar-link" data-section="chat">Chat</button>
          <button class="sidebar-link" data-section="pagos">Pagos</button>
          <button class="sidebar-link" data-section="perfil">Mi perfil</button>
        </aside>
        <main class="main-content">
          <header class="topbar">
            <h1 id="topbar-title">Inicio</h1>
            <div class="topbar-actions"></div>
          </header>
          <section id="section-inicio" class="dash-section">
            <article class="family-journey-card">
              <button data-family-journey-action="request_teacher">Solicitar profesor</button>
            </article>
          </section>
          <section id="section-solicitudes" class="dash-section" style="display:none">
            <button id="btn-nueva-solicitud">Nueva solicitud</button>
          </section>
        </main>
      </div>
      <script>
        window.CD10CurrentUser = { role: 'familia', uid: 'smoke-family' };
        window.__cd10Actions = [];
        document.addEventListener('click', (event) => {
          if (event.target?.dataset?.section) {
            window.__cd10Actions.push('section:' + event.target.dataset.section);
            document.querySelectorAll('.dash-section').forEach((section) => { section.style.display = 'none'; });
            const target = document.getElementById('section-' + event.target.dataset.section);
            if (target) target.style.display = '';
          }
          if (event.target?.id === 'btn-nueva-solicitud') window.__cd10Actions.push('new-request');
          if (event.target?.dataset?.familyJourneyAction) window.__cd10Actions.push('journey:' + event.target.dataset.familyJourneyAction);
        });
      </script>
      <script src="/js/pwa.js"></script>
    </body>
    </html>
  `, { waitUntil: 'load' });

  await page.waitForFunction(() => Boolean(window.CD10ProductUX), null, { timeout: 15000 });
  const trigger = await page.locator('#cd10-command-trigger').textContent();
  if (!trigger.includes('Acciones') || !trigger.includes('Ctrl K')) {
    throw new Error(`Command trigger copy is not product-grade: ${trigger}`);
  }

  await page.keyboard.press('Control+K');
  await page.waitForSelector('#cd10-command-overlay.open', { timeout: 5000 });
  const title = await page.locator('.cd10-command-title').textContent();
  if (!title.includes('Centro de acciones')) throw new Error(`Missing action center title: ${title}`);

  await page.locator('.cd10-command-input').fill('solicitar profesor');
  await page.waitForFunction(() => document.querySelectorAll('.cd10-command-item').length > 0, null, { timeout: 5000 });
  const first = await page.locator('.cd10-command-item').first().textContent();
  if (!first.includes('Solicitar profesor')) throw new Error(`Expected family request action first, got: ${first}`);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__cd10Actions.some((item) => item.includes('request_teacher') || item === 'new-request'), null, { timeout: 5000 });
  const actions = await page.evaluate(() => window.__cd10Actions);
  if (!actions.some((item) => item.includes('request_teacher') || item === 'new-request')) {
    throw new Error(`Command action did not execute expected request flow: ${JSON.stringify(actions)}`);
  }

  return {
    trigger,
    title,
    first,
    actions,
  };
}
