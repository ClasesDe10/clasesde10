async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.querySelector('[data-section="profesores"]')?.click();
  });
  await page.waitForTimeout(2500);

  const countText = await page.locator('#prof-count').textContent().catch(() => '');
  const tableText = await page.locator('#tbody-profesores').textContent().catch(() => '');
  const rowCount = await page.locator('#tbody-profesores tr').count().catch(() => 0);
  const profileButtons = await page.locator('[data-action="ver-profesor"]').count().catch(() => 0);

  return {
    section: await page.locator('#topbar-title').textContent().catch(() => ''),
    countText,
    rowCount,
    profileButtons,
    legacyUnavailable: tableText.includes('No hay datos disponibles para este modulo'),
    empty: tableText.includes('Sin resultados.'),
    firstRow: tableText.replace(/\s+/g, ' ').trim().slice(0, 180),
  };
}
