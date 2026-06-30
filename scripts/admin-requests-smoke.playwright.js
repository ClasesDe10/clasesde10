async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.querySelector('[data-section="solicitudes"]')?.click();
  });
  await page.waitForTimeout(2500);

  const countText = await page.locator('#sol-count').textContent().catch(() => '');
  const tableText = await page.locator('#tbody-solicitudes').textContent().catch(() => '');
  const rowCount = await page.locator('#tbody-solicitudes tr').count().catch(() => 0);
  const assignButtons = await page.locator('[data-action="abrir-asignar"]').count().catch(() => 0);

  let modal = null;
  if (assignButtons > 0) {
    await page.evaluate(() => {
      document.querySelector('[data-action="abrir-asignar"]')?.click();
    });
    await page.waitForTimeout(2500);
    const modalText = await page.locator('#modal-asignar').textContent().catch(() => '');
    modal = {
      open: await page.locator('#modal-asignar.open').count().then((count) => count > 0).catch(() => false),
      hasTeacherSelect: await page.locator('#asignar-profesor').count().then((count) => count > 0).catch(() => false),
      noAssignableTeachers: modalText.includes('No hay profesores asignables'),
      aiMatchCards: await page.locator('[data-ai-match="teacher"]').count().catch(() => 0),
      disabledAiMatchButtons: await page.locator('[data-ai-match="teacher"] button[disabled]').count().catch(() => 0),
      hasAiScoring: /IA|\d+%|compatibilidad|Perfil/i.test(modalText),
      hasActiveMatchingPlan: /Matching activo/i.test(modalText),
      recommendationText: modalText.replace(/\s+/g, ' ').trim().slice(0, 220),
    };
    if (!modal.hasActiveMatchingPlan) {
      throw new Error(`No aparece el bloque de Matching activo en el modal: ${modal.recommendationText}`);
    }
  }

  return {
    section: await page.locator('#topbar-title').textContent().catch(() => ''),
    countText,
    rowCount,
    assignButtons,
    legacyUnavailable: tableText.includes('No hay datos disponibles para este modulo'),
    empty: tableText.includes('Sin solicitudes.'),
    firstRow: tableText.replace(/\s+/g, ' ').trim().slice(0, 180),
    modal,
  };
}
