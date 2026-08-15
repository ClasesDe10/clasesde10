#!/usr/bin/env node
import { chromium } from 'playwright';

const url = process.env.SEO_AUDIT_URL || 'https://clasesde10.com/';

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

const browser = await launchBrowser();
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    locale: 'es-ES',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__seoVitals = { lcp: 0, cls: 0, longTask: 0 };
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      window.__seoVitals.lcp = entries.at(-1)?.startTime || window.__seoVitals.lcp;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__seoVitals.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__seoVitals.longTask += Math.max(0, entry.duration - 50);
      }
    }).observe({ type: 'longtask', buffered: true });
  });

  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0;
    const resources = performance.getEntriesByType('resource');
    return {
      status: 0,
      ttfbMs: Math.round(navigation?.responseStart || 0),
      fcpMs: Math.round(fcp),
      lcpMs: Math.round(window.__seoVitals?.lcp || 0),
      cls: Number((window.__seoVitals?.cls || 0).toFixed(4)),
      blockingTimeMs: Math.round(window.__seoVitals?.longTask || 0),
      domContentLoadedMs: Math.round(navigation?.domContentLoadedEventEnd || 0),
      loadMs: Math.round(navigation?.loadEventEnd || 0),
      resources: resources.length,
      transferredKb: Math.round(resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0) / 1024),
    };
  });
  metrics.status = response?.status() || 0;

  const assessments = {
    ttfb: metrics.ttfbMs <= 800 ? 'good' : metrics.ttfbMs <= 1800 ? 'needs-improvement' : 'poor',
    fcp: metrics.fcpMs <= 1800 ? 'good' : metrics.fcpMs <= 3000 ? 'needs-improvement' : 'poor',
    lcp: metrics.lcpMs <= 2500 ? 'good' : metrics.lcpMs <= 4000 ? 'needs-improvement' : 'poor',
    cls: metrics.cls <= 0.1 ? 'good' : metrics.cls <= 0.25 ? 'needs-improvement' : 'poor',
    blockingTime: metrics.blockingTimeMs <= 200 ? 'good' : metrics.blockingTimeMs <= 600 ? 'needs-improvement' : 'poor',
  };

  console.log(JSON.stringify({
    ok: metrics.status === 200,
    mode: 'Playwright mobile lab (sin throttling; no sustituye CrUX)',
    url,
    metrics,
    assessments,
  }, null, 2));
  await context.close();
} finally {
  await browser.close();
}
