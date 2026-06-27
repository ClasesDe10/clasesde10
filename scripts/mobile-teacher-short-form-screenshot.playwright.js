async (page) => {
  const baseUrl = page.url().replace(/^(https?:\/\/[^/]+).*/, '$1');
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(`${baseUrl}/para-profesores.html#formulario`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('#form-profesor').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'output/playwright/para-profesores-short-form-320.png', fullPage: false, scale: 'css' });
  return await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    visibleLabels: Array.from(document.querySelectorAll('#form-profesor label'))
      .filter((label) => {
        const rect = label.getBoundingClientRect();
        const style = getComputedStyle(label.closest('.cf-field') || label);
        return style.display !== 'none' && rect.width > 0 && rect.height > 0;
      })
      .map((label) => label.textContent.trim()),
  }));
}
