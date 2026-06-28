async (page) => {
  await page.waitForFunction(() => Boolean(window.CD10ProductUX), null, { timeout: 15000 });

  const initial = await page.evaluate(() => ({
    hasStyles: Boolean(document.querySelector('#cd10-product-ux-styles')),
    hasTrigger: Boolean(document.querySelector('#cd10-command-trigger')),
    hasSearch: Boolean(document.querySelector('#busqueda-global')),
    tooltipCount: document.querySelectorAll('.cd10-tooltip-anchor').length,
    emptyActions: document.querySelectorAll('.cd10-context-action').length,
  }));

  if (!initial.hasStyles) throw new Error('Product UX styles were not injected.');
  if (!initial.hasTrigger) throw new Error('Command palette trigger is missing.');
  if (!initial.hasSearch) throw new Error('Dashboard contextual search input is missing.');

  await page.keyboard.press('Control+K');
  await page.waitForSelector('#cd10-command-overlay.open', { timeout: 5000 });
  await page.locator('.cd10-command-input').fill('solicitudes');
  await page.waitForFunction(() => document.querySelectorAll('.cd10-command-item').length > 0, null, { timeout: 5000 });
  const palette = await page.evaluate(() => ({
    open: document.querySelector('#cd10-command-overlay')?.classList.contains('open') || false,
    items: document.querySelectorAll('.cd10-command-item').length,
    first: document.querySelector('.cd10-command-item')?.innerText || '',
  }));
  await page.keyboard.press('Escape');

  await page.locator('#busqueda-global').fill('matematicas');
  await page.waitForTimeout(350);
  const searchAssist = await page.evaluate(() => ({
    countLabel: document.querySelector('.cd10-global-search-count')?.textContent || '',
    hiddenRows: document.querySelectorAll('[data-cd10-hidden-by-search="true"]').length,
  }));

  if (!palette.open || palette.items < 1) {
    throw new Error('Command palette did not open with searchable actions.');
  }

  return {
    initial,
    palette,
    searchAssist,
  };
}
