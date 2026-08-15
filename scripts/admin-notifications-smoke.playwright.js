async (page) => {
  await page.locator('#btn-notificaciones').click();
  await page.waitForFunction(() => {
    const panel = document.querySelector('[data-chat-panel="notificaciones"]');
    return panel && getComputedStyle(panel).display !== 'none';
  }, null, { timeout: 20000 });
  await page.waitForFunction(() => {
    const text = document.querySelector('[data-notifications-list]')?.textContent || '';
    return !/Cargando notificaciones/i.test(text);
  }, null, { timeout: 20000 });

  const tabs = await page.locator('[data-chat-tab]').allTextContents();
  const formCount = await page.locator('[data-admin-notification-form]').count();
  const formVisible = formCount ? await page.locator('[data-admin-notification-form]').isVisible() : false;
  const advancedTools = await page.locator('[data-notification-admin-tools]').count();
  const advancedOpen = advancedTools ? await page.locator('[data-notification-admin-tools]').evaluate((node) => node.open === true).catch(() => false) : false;
  const notificationListText = await page.locator('[data-notifications-list]').textContent().catch(() => '');
  const enableButton = await page.locator('[data-enable-browser-notifications]').count();

  if (!tabs.some((tab) => tab.includes('Notificaciones'))) {
    throw new Error('Notifications tab is missing.');
  }
  if (!advancedTools || !formCount) {
    throw new Error('Admin notification tools must remain available in the advanced block.');
  }
  if (advancedOpen || formVisible) {
    throw new Error('Admin notification form must stay collapsed by default in the simplified panel.');
  }
  if (!enableButton) {
    throw new Error('Browser notification permission button is missing.');
  }
  if (/Cargando notificaciones/i.test(notificationListText)) {
    throw new Error('Notifications list stayed in loading state.');
  }

  return {
    topbar: await page.locator('#topbar-title').textContent().catch(() => ''),
    tabs,
    formVisible,
    advancedOpen,
    notificationListText: notificationListText.trim().slice(0, 180),
  };
}
