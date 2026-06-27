async (page) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    document.querySelector('.sidebar-link[data-section="calendario"]')?.click();
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'output/playwright/local-calendar-320-fixed.png', scale: 'css' });
  return await page.evaluate(() => ({
    section: document.querySelector('#topbar-title')?.textContent || '',
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
}
