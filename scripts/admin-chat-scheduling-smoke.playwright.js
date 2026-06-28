async (page) => {
  const consoleErrors = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      consoleErrors.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(`pageerror: ${error.message}`);
  });

  await page.locator('[data-section="chats"]').click();
  await page.waitForSelector('[data-chat-tab="chats"]', { timeout: 20000 });
  await page.locator('[data-chat-tab="chats"]').click();
  await page.waitForSelector('[data-chat-list]', { timeout: 20000 });
  await page.waitForTimeout(2500);

  const chatItems = await page.locator('[data-chat-id]').count();
  if (chatItems > 0) {
    await page.locator('[data-chat-id]').first().click();
  }
  await page.waitForTimeout(1200);

  return {
    topbar: await page.locator('#topbar-title').textContent().catch(() => ''),
    currentUser: await page.evaluate(() => ({
      uid: window.CD10CurrentUser?.uid || '',
      id: window.CD10CurrentUser?.id || '',
      email: window.CD10CurrentUser?.email || '',
      role: window.CD10CurrentUser?.role || window.CD10CurrentUser?.rol || '',
    })).catch(() => null),
    chatItems,
    chatListText: await page.locator('[data-chat-list]').textContent().catch(() => ''),
    headerText: await page.locator('[data-chat-header]').textContent().catch(() => ''),
    consoleErrors: consoleErrors.slice(-8),
    schedulePanelVisible: await page.locator('[data-chat-schedule-panel]').isVisible().catch(() => false),
    scheduleFormVisible: await page.locator('[data-schedule-form]').isVisible().catch(() => false),
    dateFieldVisible: await page.locator('[data-schedule-date]').isVisible().catch(() => false),
    acceptButtons: await page.locator('[data-accept-schedule]').count(),
    proposalRows: await page.locator('[data-schedule-proposal-id]').count(),
  };
}
