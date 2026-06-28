async (page) => {
  const baseUrl = /^https?:\/\//.test(page.url())
    ? page.url().replace(/^(https?:\/\/[^/]+).*/, '$1')
    : 'https://clasesde10.com';
  const failures = [];
  const fail = (type, detail = {}) => failures.push({ type, ...detail });

  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle', timeout: 30000 });

  const manifest = await page.evaluate(async () => {
    const response = await fetch('/manifest.json', { cache: 'reload' });
    const json = await response.json();
    const icons = await Promise.all((json.icons || []).map(async (icon) => {
      const iconResponse = await fetch(icon.src, { cache: 'reload' });
      return { src: icon.src, sizes: icon.sizes, ok: iconResponse.ok, status: iconResponse.status };
    }));
    return {
      hasLink: Boolean(document.querySelector('link[rel="manifest"]')),
      status: response.status,
      name: json.name,
      display: json.display,
      scope: json.scope,
      startUrl: json.start_url,
      shortcuts: json.shortcuts?.length || 0,
      icons,
      notification: 'Notification' in window,
      pushManager: 'PushManager' in window,
    };
  });

  if (!manifest.hasLink) fail('manifest-link-missing');
  if (manifest.status !== 200) fail('manifest-fetch-failed', { status: manifest.status });
  if (manifest.name !== 'ClasesDe10') fail('manifest-name', { name: manifest.name });
  if (manifest.display !== 'standalone') fail('manifest-display', { display: manifest.display });
  if (manifest.scope !== '/') fail('manifest-scope', { scope: manifest.scope });
  if (!manifest.startUrl) fail('manifest-start-url-missing');
  if (!manifest.icons.some((icon) => icon.ok && icon.sizes === '192x192')) fail('manifest-icon-192', { icons: manifest.icons });
  if (!manifest.icons.some((icon) => icon.ok && icon.sizes === '512x512')) fail('manifest-icon-512', { icons: manifest.icons });
  if (!manifest.pushManager) fail('push-manager-missing');

  const serviceWorker = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const registration = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return {
      supported: true,
      scope: registration.scope,
      active: Boolean(registration.active),
      controller: Boolean(navigator.serviceWorker.controller),
    };
  });

  if (!serviceWorker.supported) fail('service-worker-unsupported');
  if (!serviceWorker.active) fail('service-worker-not-active', serviceWorker);
  if (!serviceWorker.controller) {
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    serviceWorker.controllerAfterReload = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  }
  if (!serviceWorker.controller && !serviceWorker.controllerAfterReload) {
    fail('service-worker-not-controlling', serviceWorker);
  }

  async function offlineNavigation(path) {
    await page.context().setOffline(false);
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(700);
    await page.context().setOffline(true);
    try {
      const url = path === '/pages/login.html'
        ? `${baseUrl}${path}`
        : `${baseUrl}${path}?offlineAudit=${Date.now()}`;
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      const title = await page.title();
      const h1 = await page.locator('h1').first().textContent().catch(() => '');
      return {
        path,
        status: response?.status() || null,
        title,
        h1,
        ok: response?.ok() || /Sin conexion/i.test(`${title} ${h1}`),
      };
    } catch (error) {
      return { path, ok: false, error: error.message };
    } finally {
      await page.context().setOffline(false);
    }
  }

  const offline = [];
  for (const path of ['/', '/pages/login.html']) {
    const result = await offlineNavigation(path);
    offline.push(result);
    if (!result.ok) fail('offline-navigation', result);
  }

  if (failures.length) throw new Error(JSON.stringify({ failures }, null, 2));
  return { ok: true, manifest, serviceWorker, offline };
}
