async (page) => {
  await page.evaluate(() => {
    window.location.hash = '#pagos';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await page.waitForFunction(() => {
    const section = document.querySelector('#section-pagos');
    const tbody = document.querySelector('#tbody-pagos');
    return section
      && section.offsetParent !== null
      && tbody
      && !tbody.textContent.includes('Cargando');
  }, null, { timeout: 20000 });

  const options = await page.locator('#filtro-pago-estado option').allTextContents();
  const rows = await page.locator('#tbody-pagos tr').count();
  const text = await page.locator('#tbody-pagos').textContent();
  const paidButtons = await page.locator('[data-pago-estado="pagado"]').count();
  const validateButtons = await page.locator('[data-pago-estado="validado"]').count();

  if (!options.some((option) => option.includes('Solicitudes Bizum'))) {
    throw new Error('Missing Bizum requests filter in admin payments.');
  }
  if (!options.some((option) => option.includes('Pagados'))) {
    throw new Error('Missing paid payments filter in admin payments.');
  }
  if (text.includes('Error:')) {
    throw new Error(`Admin payments table rendered an error: ${text.slice(0, 200)}`);
  }

  return {
    section: await page.locator('#topbar-title').textContent().catch(() => ''),
    rows,
    options,
    paidButtons,
    validateButtons,
    empty: text.includes('Sin pagos'),
  };
}
