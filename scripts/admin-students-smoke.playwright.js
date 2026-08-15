async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => window.__cd10AdminReady && typeof window.cd10AdminGoTo === 'function', null, { timeout: 20000 });
  await page.evaluate(() => window.cd10AdminGoTo('alumnos'));
  await page.waitForFunction(() => document.querySelector('#topbar-title')?.textContent?.includes('Alumnos'), null, { timeout: 15000 });
  await page.waitForFunction(() => {
    const tbody = document.querySelector('#tbody-alumnos');
    const text = tbody?.textContent || '';
    return Boolean(tbody?.querySelector('.admin-directory-card-alumno'))
      || text.includes('Sin resultados.')
      || text.includes('No hay datos disponibles');
  }, null, { timeout: 15000 }).catch(() => {});

  const countText = await page.locator('#alum-count').textContent().catch(() => '');
  const tableText = await page.locator('#tbody-alumnos').textContent().catch(() => '');
  const rowCount = await page.locator('#tbody-alumnos tr').count().catch(() => 0);
  const profileButtons = await page.locator('#tbody-alumnos [data-action="ver-alumno"]').count().catch(() => 0);
  const directoryCards = await page.locator('#tbody-alumnos .admin-directory-card-alumno').count().catch(() => 0);
  const directoryAvatars = await page.locator('#tbody-alumnos .admin-directory-avatar').count().catch(() => 0);

  if (!directoryCards && !tableText.includes('Sin resultados.')) {
    throw new Error('Admin students section did not render students or a valid empty state.');
  }
  if (directoryCards && (!profileButtons || !directoryAvatars)) {
    throw new Error(`Admin students list is not using compact photo/name directory cards. count="${countText}" rows=${rowCount} text="${tableText.replace(/\s+/g, ' ').trim().slice(0, 220)}"`);
  }
  if (tableText.includes('Invalid Date')) {
    throw new Error('Admin students list renders an invalid date.');
  }

  let modalHasProfile = false;
  let editModalOpens = false;
  if (profileButtons) {
    await page.locator('#tbody-alumnos [data-action="ver-alumno"]').first().click();
    await page.locator('#modal-alumno-detalle').waitFor({ state: 'visible', timeout: 12000 });
    const modalText = await page.locator('#alumno-detalle-body').textContent().catch(() => '');
    modalHasProfile = modalText.includes('Alumno') && modalText.includes('Familia') && modalText.includes('Nivel / curso');
    if (!modalHasProfile) {
      throw new Error('Admin student detail modal did not render the expected profile sections.');
    }

    await page.locator('#btn-editar-alumno-desde-detalle').click();
    await page.locator('#modal-editar-alumno').waitFor({ state: 'visible', timeout: 12000 });
    editModalOpens = await page.locator('#modal-editar-alumno').isVisible().catch(() => false);
    if (!editModalOpens) {
      throw new Error('Admin student profile did not open the edit modal.');
    }
  }

  return {
    section: await page.locator('#topbar-title').textContent().catch(() => ''),
    countText,
    rowCount,
    profileButtons,
    directoryCards,
    directoryAvatars,
    modalHasProfile,
    editModalOpens,
    empty: tableText.includes('Sin resultados.'),
    firstRow: tableText.replace(/\s+/g, ' ').trim().slice(0, 180),
  };
}
