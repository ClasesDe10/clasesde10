async (page) => {
  const baseUrl = page.url().replace(/^(https?:\/\/[^/]+).*/, '$1');
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.setContent(`
    <div class="dash-layout">
      <main class="dash-content">
        <article class="card" id="card">Seguimiento</article>
        <div class="empty-state" id="empty"></div>
        <form id="form">
          <div class="form-group">
            <label for="email">Correo de contacto</label>
            <input id="email" name="email" type="email" required placeholder="correo@email.com">
          </div>
          <button id="submit" type="submit">Guardar datos</button>
        </form>
      </main>
    </div>
    <script>
      window.__submitted = false;
      document.getElementById('form').addEventListener('submit', (event) => {
        event.preventDefault();
        window.__submitted = true;
      });
    </script>
    <script src="/js/pwa.js"></script>
  `, { waitUntil: 'load' });

  await page.waitForFunction(() => Boolean(window.CD10ProductUX), null, { timeout: 15000 });
  await page.locator('#email').fill('contacto@clasesde10.com');
  await page.locator('#submit').click();
  await page.waitForTimeout(150);

  const result = await page.evaluate(() => ({
    styles: Boolean(document.querySelector('#cd10-product-ux-styles')),
    liveRegion: Boolean(document.querySelector('#cd10-live-region')),
    progress: Boolean(document.querySelector('#cd10-page-progress')),
    hint: document.querySelector('#form .cd10-smart-hint')?.textContent || '',
    complete: document.querySelector('#email')?.classList.contains('cd10-field-complete') || false,
    loading: document.querySelector('#submit')?.classList.contains('cd10-is-loading') || false,
    empty: document.querySelector('#empty')?.classList.contains('cd10-empty-polished') || false,
    card: document.querySelector('#card')?.classList.contains('cd10-polish-target') || false,
    submitted: window.__submitted,
  }));

  if (!result.styles || !result.liveRegion || !result.progress) throw new Error(`Missing global polish primitives: ${JSON.stringify(result)}`);
  if (!result.hint.includes('correo')) throw new Error(`Missing contextual hint: ${JSON.stringify(result)}`);
  if (!result.complete || !result.loading || !result.submitted) throw new Error(`Missing form feedback: ${JSON.stringify(result)}`);
  if (!result.empty || !result.card) throw new Error(`Missing empty/card polish: ${JSON.stringify(result)}`);
  return result;
}
