async (page) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('https://clasesde10.com/pages/login.html?economic-calendar-render=1', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await Promise.all([
    page.addStyleTag({ url: 'https://clasesde10.com/css/dashboard.css?v=20260815-family-payment-lock' }),
    page.addStyleTag({ url: 'https://clasesde10.com/css/calendar-indicators.css?v=20260815-admin-debt' }),
    page.addStyleTag({ url: 'https://clasesde10.com/css/calendar-fit.css?v=20260815-admin-debt' }),
  ]);

  const result = await page.evaluate(async () => {
    const [{ Calendario }, { buildAdminFinancialDaySummaries }] = await Promise.all([
      import('/js/calendario.js?v=20260815-economic-summaries'),
      import('/js/admin-economic-calendar.js?v=20260815-admin-debt'),
    ]);
    document.body.innerHTML = `
      <main style="max-width:980px;margin:24px auto;padding:20px">
        <div class="admin-calendar-command-bar">
          <div><span class="section-eyebrow">Comprobacion productiva</span><h1>Calendario economico del administrador</h1></div>
        </div>
        <div id="economic-calendar"></div>
      </main>`;
    const formatMoney = (value) => new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
    }).format(Number(value || 0));
    const calendar = new Calendario({
      contenedor: document.getElementById('economic-calendar'),
      dayIndicatorMode: 'summary',
      classDotClass: (item) => item.calendarEventType === 'admin_family_debt_alert'
        ? 'dot-red'
        : item.calendarEventType === 'admin_teacher_payout_day'
          ? 'dot-purple'
          : 'dot-navy',
      daySummaryItems: (items) => buildAdminFinancialDaySummaries(items, { formatMoney }),
      legendItems: [
        { className: 'dot-red', label: 'Familia debe dinero' },
        { className: 'dot-navy', label: 'Cobro de familia' },
        { className: 'dot-purple', label: 'Pago a profesor' },
      ],
    });
    calendar.anio = 2026;
    calendar.mes = 7;
    calendar.setClases([
      { id: 'debt', fecha: '2026-08-15', calendarEventType: 'admin_family_debt_alert', amount: 75, paymentGroup: { familyUid: 'family-1', amount: 75 } },
      { id: 'collect', fecha: '2026-08-15', calendarEventType: 'admin_family_payment_day', amount: 45, dueDate: '2026-08-15', paymentGroup: { familyUid: 'family-2', amount: 45 } },
      { id: 'payout', fecha: '2026-08-15', calendarEventType: 'admin_teacher_payout_day', payoutAmount: 50, payoutDate: '2026-08-15', teacherUid: 'teacher-1' },
    ]);
    return {
      chips: [...document.querySelectorAll('[data-fecha="2026-08-15"] .day-chip')].map((item) => item.textContent.trim()),
      legend: document.querySelector('.calendar-legend')?.textContent || '',
    };
  });

  const normalizedChips = result.chips.map((label) => label.replace(/\s/g, ' '));
  const expected = ['Deben 75,00 €', 'Cobrar 45,00 €', 'Pagar 50,00 €'];
  for (const label of expected) {
    if (!normalizedChips.includes(label)) throw new Error(`Missing exact production chip "${label}": ${result.chips.join(' | ')}`);
  }
  for (const label of ['Familia debe dinero', 'Cobro de familia', 'Pago a profesor']) {
    if (!result.legend.includes(label)) throw new Error(`Missing production legend "${label}": ${result.legend}`);
  }

  const screenshotPath = 'output/playwright/admin-economic-calendar-production-fixture.png';
  await page.screenshot({ path: screenshotPath, scale: 'css', fullPage: true });
  return { ...result, screenshotPath };
}
