async (page) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    document.querySelector('.sidebar-link[data-section="solicitudes"]')?.click();
  });
  await page.waitForTimeout(1200);
  await page.locator('[data-action="abrir-asignar"]').first().click().catch(() => {});
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'output/playwright/local-admin-asignar-320-fixed.png', scale: 'css' });
  return await page.evaluate(() => {
    const modal = document.querySelector('#modal-asignar .modal');
    const rect = modal?.getBoundingClientRect();
    return {
      section: document.querySelector('#topbar-title')?.textContent || '',
      modalOpen: document.querySelector('#modal-asignar')?.classList.contains('open') || false,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      modalRect: rect ? {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
      } : null,
    };
  });
}
