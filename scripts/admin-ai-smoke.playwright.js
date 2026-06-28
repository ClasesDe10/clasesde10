async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.querySelector('[data-section="ia"]')?.click();
  });

  await page.locator('[data-admin-ai-root]').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('[data-admin-ai-input]').fill('Que familias tienen pagos pendientes?');
  await page.locator('[data-admin-ai-form]').evaluate((form) => form.requestSubmit());
  await page.locator('[data-admin-ai-answer]').waitFor({ state: 'visible', timeout: 30000 });

  const text = await page.locator('[data-admin-ai-answer]').textContent().catch(() => '');
  const rowCount = await page.locator('.admin-ai-row').count().catch(() => 0);
  const sourceCount = await page.locator('.admin-ai-sources .badge').count().catch(() => 0);

  if (!text.includes('Familias con pagos pendientes')) {
    throw new Error('Admin AI did not answer the payment question with the expected intent.');
  }
  if (!text.includes('Fuentes') || sourceCount < 2) {
    throw new Error('Admin AI answer does not expose structured sources.');
  }
  if (text.includes('No autorizado') || text.includes('FirebaseError')) {
    throw new Error('Admin AI rendered an authorization or Firebase error.');
  }

  return {
    section: await page.locator('#topbar-title').textContent().catch(() => ''),
    rowCount,
    sourceCount,
    answer: text.replace(/\s+/g, ' ').trim().slice(0, 260),
  };
}
