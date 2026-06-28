async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.evaluate(() => document.querySelector('[data-section="profesores"]')?.click());
  await page.waitForTimeout(2500);
  const professorHeader = await page.locator('#section-profesores').textContent().catch(() => '');
  const professorRows = await page.locator('#tbody-profesores tr').count().catch(() => 0);
  const professorTrustBadges = await page.locator('#tbody-profesores .trust-badges, #tbody-profesores .badge').count().catch(() => 0);
  const firstProfile = page.locator('[data-action="ver-profesor"]').first();
  if (await firstProfile.count()) {
    await firstProfile.click();
    await page.waitForTimeout(800);
  }
  const professorModalText = await page.locator('#profesor-detalle-body').textContent().catch(() => '');

  await page.evaluate(() => {
    document.querySelector('[data-close-modal="modal-profesor-detalle"]')?.click();
    document.querySelector('[data-section="familias"]')?.click();
  });
  await page.waitForTimeout(2500);
  const familyHeader = await page.locator('#section-familias').textContent().catch(() => '');
  const familyRows = await page.locator('#tbody-familias tr').count().catch(() => 0);
  const familyDetailButtons = await page.locator('[data-action="ver-familia"]').count().catch(() => 0);
  if (familyDetailButtons) {
    await page.locator('[data-action="ver-familia"]').first().click();
    await page.waitForTimeout(800);
  }
  const familyModalText = await page.locator('#familia-detalle-body').textContent().catch(() => '');

  return {
    professorRows,
    professorTrustBadges,
    professorHasTrustColumn: professorHeader.includes('Confianza'),
    professorModalHasTrust: professorRows ? professorModalText.includes('Confianza y reputacion') : true,
    familyRows,
    familyDetailButtons,
    familyHasTrustColumn: familyHeader.includes('Confianza'),
    familyModalHasTrust: familyDetailButtons ? familyModalText.includes('Confianza y reputacion') : true,
    firstProfessorModal: professorModalText.replace(/\s+/g, ' ').trim().slice(0, 220),
    firstFamilyModal: familyModalText.replace(/\s+/g, ' ').trim().slice(0, 220),
  };
}
