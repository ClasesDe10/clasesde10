async (page) => {
  await page.locator('#btn-notificaciones').click();
  await page.waitForFunction(() => {
    const panel = document.querySelector('[data-chat-panel="notificaciones"]');
    return panel && getComputedStyle(panel).display !== 'none';
  }, null, { timeout: 20000 });

  const tabs = await page.locator('[data-chat-tab]').allTextContents();
  const formVisible = await page.locator('[data-admin-notification-form]').isVisible();
  const notificationListText = await page.locator('[data-notifications-list]').textContent().catch(() => '');
  const enableButton = await page.locator('[data-enable-browser-notifications]').count();

  if (!tabs.some((tab) => tab.includes('Notificaciones'))) {
    throw new Error('Notifications tab is missing.');
  }
  if (!formVisible) {
    throw new Error('Admin notification form is not visible for admin.');
  }
  if (!enableButton) {
    throw new Error('Browser notification permission button is missing.');
  }

  return {
    topbar: await page.locator('#topbar-title').textContent().catch(() => ''),
    tabs,
    formVisible,
    notificationListText: notificationListText.trim().slice(0, 180),
  };
}
