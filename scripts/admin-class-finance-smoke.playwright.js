async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.location.hash = '#clases';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await page.waitForFunction(() => {
    const section = document.querySelector('#section-clases');
    const tbody = document.querySelector('#tbody-clases');
    return section
      && section.offsetParent !== null
      && tbody
      && !tbody.textContent.includes('Cargando');
  }, null, { timeout: 20000 });

  await page.locator('#btn-nueva-clase').click();
  await page.waitForFunction(() => document.querySelector('#modal-clase')?.classList.contains('open'), null, { timeout: 10000 });

  await page.locator('#clase-precio').fill('30');
  await page.locator('#clase-importe-profesor').fill('22.5');
  await page.waitForFunction(() => document.querySelector('#clase-comision-preview')?.value.includes('25'), null, { timeout: 5000 });

  const modalText = await page.locator('#modal-clase').textContent().catch(() => '');
  const preview = await page.locator('#clase-comision-preview').inputValue().catch(() => '');
  const fields = {
    familyTotal: await page.locator('#clase-precio').count().then((count) => count > 0),
    teacherAmount: await page.locator('#clase-importe-profesor').count().then((count) => count > 0),
    platformFee: await page.locator('#clase-comision-preview').count().then((count) => count > 0),
  };

  if (!fields.familyTotal || !fields.teacherAmount || !fields.platformFee) {
    throw new Error(`Class finance fields missing: ${JSON.stringify(fields)}`);
  }
  if (!/Cobra profesor/i.test(modalText) || !/Margen ClasesDe10/i.test(modalText)) {
    throw new Error('Class modal is missing finance labels.');
  }

  return {
    section: await page.locator('#topbar-title').textContent().catch(() => ''),
    fields,
    preview,
  };
}
