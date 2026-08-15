#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const root = process.cwd();
const widths = [
  { name: 'desktop', width: 1366, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'narrow', width: 360, height: 844 },
  { name: 'small', width: 320, height: 780 },
];

const dashboards = [
  { role: 'admin', file: 'pages/dashboard/admin.html' },
  { role: 'familia', file: 'pages/dashboard/familia.html' },
  { role: 'profesor', file: 'pages/dashboard/profesor.html' },
  { role: 'alumno', file: 'pages/dashboard/alumno.html' },
];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exportedFunctionSource(file, name) {
  const source = read(file);
  const startToken = `export function ${name}(`;
  const start = source.indexOf(startToken);
  if (start === -1) throw new Error(`Missing exported function ${name} in ${file}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(start, index + 1).replace('export function', 'function');
    }
  }
  throw new Error(`Could not parse exported function ${name} in ${file}`);
}

const initSidebarSource = exportedFunctionSource('js/utils.js', 'initSidebar');

function stylesheetTag(href) {
  const normalized = href
    .replace(/^\.\.\//, '')
    .replace(/^\.\.\//, '')
    .replace(/\?.*$/, '');
  const file = normalized.startsWith('/') ? normalized.slice(1) : normalized;
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) return '';
  return `<style data-inline-css="${file}">\n${read(file)}\n</style>`;
}

function buildStaticDashboardHtml(file) {
  let html = read(file);
  html = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<link\b[^>]+rel=["']stylesheet["'][^>]*>/gi, (tag) => {
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1] || '';
    return href ? stylesheetTag(href) : '';
  });
  html = html.replace('</body>', `
    <script>
      ${initSidebarSource}
      document.querySelectorAll('.dash-section').forEach((section, index) => {
        section.style.display = index === 0 ? '' : 'none';
      });
      initSidebar();
    </script>
  </body>`);
  return html;
}

async function auditRoot(page, selector) {
  return page.evaluate((rootSelector) => {
    const root = document.querySelector(rootSelector);
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const bad = [];
    if (!root) return { missing: true, overflow: false, bad };

    const insideManagedScroll = (element) => {
      let current = element.parentElement;
      while (current && current !== document.body) {
        const style = getComputedStyle(current);
        const rect = current.getBoundingClientRect();
        const canScrollX = /(auto|scroll)/.test(style.overflowX) && current.scrollWidth > current.clientWidth + 1;
        const withinViewport = rect.left >= -2 && rect.right <= viewportWidth + 2;
        if (canScrollX && withinViewport) return true;
        current = current.parentElement;
      }
      return false;
    };

    for (const element of Array.from(root.querySelectorAll('*'))) {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1 || rect.bottom < 0 || rect.top > viewportHeight) continue;
      if (rect.right <= 0 || rect.left >= viewportWidth) continue;
      if ((rect.right > viewportWidth + 2 || rect.left < -2 || rect.width > viewportWidth + 2) && !insideManagedScroll(element)) {
        bad.push({
          tag: element.tagName.toLowerCase(),
          cls: String(element.className || '').slice(0, 90),
          text: (element.innerText || element.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 120),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
      }
    }

    return {
      missing: false,
      overflow: document.documentElement.scrollWidth > viewportWidth + 1,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: viewportWidth,
      bad: bad.slice(0, 8),
    };
  }, selector);
}

async function auditMobileSidebar(page, sectionId) {
  await page.evaluate((id) => {
    document.querySelectorAll('.dash-section[id]').forEach((section) => {
      section.style.display = section.id === id ? '' : 'none';
    });
    document.documentElement.classList.remove('sidebar-open');
    document.body.classList.remove('sidebar-open');
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.querySelector('.sidebar')?.classList.remove('open');
    document.querySelector('.sidebar-overlay')?.classList.remove('open');
    window.scrollTo(0, 0);
  }, sectionId);
  await page.locator('.hamburger-btn').click();
  await page.waitForTimeout(420);

  const sidebarAudit = await auditRoot(page, '.sidebar');
  const state = await page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const main = document.querySelector('.main-content');
    const topbar = document.querySelector('.topbar');
    const linkCount = Array.from(document.querySelectorAll('.sidebar-link')).filter((link) => {
      const rect = link.getBoundingClientRect();
      const style = getComputedStyle(link);
      return style.display !== 'none' && rect.width > 1 && rect.height > 1;
    }).length;
    const sidebarStyle = sidebar ? getComputedStyle(sidebar) : null;
    const overlayStyle = overlay ? getComputedStyle(overlay) : null;
    const mainStyle = main ? getComputedStyle(main) : null;
    const topbarStyle = topbar ? getComputedStyle(topbar) : null;
    const sidebarRect = sidebar?.getBoundingClientRect();
    const overlayBg = overlayStyle?.backgroundColor || '';
    const overlayOpacity = Number(overlayStyle?.opacity || 0);
    return {
      sidebarVisible: Boolean(sidebarRect && sidebarRect.left >= -1 && sidebarRect.right > 120 && sidebarRect.right <= window.innerWidth + 2),
      htmlOpen: document.documentElement.classList.contains('sidebar-open'),
      bodyOpen: document.body.classList.contains('sidebar-open'),
      bodyPosition: getComputedStyle(document.body).position,
      bodyTop: document.body.style.top || '',
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      bodyOverflow: getComputedStyle(document.body).overflow,
      hamburgerExpanded: document.querySelector('.hamburger-btn')?.getAttribute('aria-expanded') || '',
      sidebarZ: Number(sidebarStyle?.zIndex || 0),
      overlayZ: Number(overlayStyle?.zIndex || 0),
      topbarZ: Number(topbarStyle?.zIndex || 0),
      overlayDisplay: overlayStyle?.display || '',
      overlayBg,
      overlayOpacity,
      overlayBackdropFilter: overlayStyle?.backdropFilter || overlayStyle?.webkitBackdropFilter || '',
      sidebarTransform: sidebarStyle?.transform || '',
      sidebarWillChange: sidebarStyle?.willChange || '',
      mainFilter: mainStyle?.filter || '',
      topbarFilter: topbarStyle?.filter || '',
      mainPointerEvents: mainStyle?.pointerEvents || '',
      linkCount,
    };
  });

  await page.mouse.click(Math.min(350, page.viewportSize().width - 8), 24);
  await page.waitForTimeout(180);
  const closeState = await page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar');
    return {
      sidebarOpen: sidebar?.classList.contains('open') || false,
      htmlOpen: document.documentElement.classList.contains('sidebar-open'),
      bodyOpen: document.body.classList.contains('sidebar-open'),
      hamburgerExpanded: document.querySelector('.hamburger-btn')?.getAttribute('aria-expanded') || '',
    };
  });

  return { sidebarAudit, state, closeState };
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

const failures = [];
const browser = await launchBrowser();

try {
  for (const dashboard of dashboards) {
    const page = await browser.newPage();
    const html = buildStaticDashboardHtml(dashboard.file);
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const sections = await page.$$eval('.dash-section[id]', (items) => items.map((item) => item.id));
    const misplacedSections = await page.$$eval('.dash-section[id]', (items) => items
      .filter((item) => !item.parentElement?.classList.contains('page-content'))
      .map((item) => ({ id: item.id, parent: item.parentElement?.className || item.parentElement?.tagName || '' })));
    if (misplacedSections.length) {
      failures.push({ role: dashboard.role, type: 'dashboard-section-hierarchy', misplacedSections });
    }

    for (const viewport of widths) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const sectionId of sections) {
        await page.evaluate((id) => {
          document.querySelectorAll('.dash-section[id]').forEach((section) => {
            section.style.display = section.id === id ? '' : 'none';
          });
          window.scrollTo(0, 0);
        }, sectionId);
        await page.waitForTimeout(80);
        const data = await auditRoot(page, `#${sectionId}`);
        if (data.missing || data.overflow || data.bad.length) {
          failures.push({
            role: dashboard.role,
            viewport: viewport.name,
            width: viewport.width,
            section: sectionId,
            ...data,
          });
        }
        if (viewport.width <= 390) {
          const menu = await auditMobileSidebar(page, sectionId);
          if (
            menu.sidebarAudit.missing
            || menu.sidebarAudit.bad.length
            || !menu.state.sidebarVisible
            || !menu.state.htmlOpen
            || !menu.state.bodyOpen
            || menu.state.bodyPosition === 'fixed'
            || menu.state.bodyTop
            || menu.state.hamburgerExpanded !== 'true'
            || menu.state.linkCount < 3
            || menu.state.sidebarZ <= menu.state.overlayZ
            || menu.state.sidebarZ <= menu.state.topbarZ
            || menu.state.overlayDisplay === 'none'
            || menu.state.overlayOpacity !== 1
            || /rgba\([^)]*,\s*0\.[0-9]+\)/i.test(menu.state.overlayBg)
            || !['none', ''].includes(menu.state.overlayBackdropFilter)
            || menu.state.sidebarTransform.includes('matrix3d')
            || !['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(menu.state.sidebarTransform)
            || menu.state.sidebarWillChange !== 'auto'
            || menu.state.mainFilter !== 'none'
            || menu.state.topbarFilter !== 'none'
            || menu.closeState.sidebarOpen
            || menu.closeState.htmlOpen
            || menu.closeState.bodyOpen
            || menu.closeState.hamburgerExpanded !== 'false'
          ) {
            failures.push({
              role: dashboard.role,
              viewport: viewport.name,
              width: viewport.width,
              section: sectionId,
              type: 'mobile-sidebar-drawer',
              menu,
            });
          }
        }
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error('Dashboard responsive render test failed:');
  for (const failure of failures.slice(0, 12)) {
    console.error(JSON.stringify(failure));
  }
  process.exit(1);
}

console.log(`Dashboard responsive render test passed (${dashboards.length} panels, ${widths.length} viewport groups).`);
