#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

function fail(message, detail = '') {
  failures.push(detail ? `${message}: ${detail}` : message);
}

function readText(filePath) {
  return fs.readFileSync(path.join(root, filePath), 'utf8');
}

function walkHtml(dir = root) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relative = path.relative(root, fullPath);
    if (entry.isDirectory()) {
      if (['.git', 'node_modules', 'output', '.firebase', '.netlify'].includes(entry.name)) continue;
      files.push(...walkHtml(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(relative);
    }
  }
  return files;
}

function pngSize(filePath) {
  const buffer = fs.readFileSync(path.join(root, filePath));
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

const manifest = JSON.parse(readText('manifest.json'));
if (manifest.name !== 'ClasesDe10') fail('manifest name must be ClasesDe10');
if (!manifest.short_name) fail('manifest short_name missing');
if (manifest.scope !== '/') fail('manifest scope must be /', manifest.scope);
if (!manifest.start_url) fail('manifest start_url missing');
if (manifest.display !== 'standalone') fail('manifest display must be standalone', manifest.display);
if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) fail('manifest must include 192 and 512 icons');

for (const size of [192, 512]) {
  const icon = manifest.icons?.find((item) => item.sizes === `${size}x${size}`);
  if (!icon) {
    fail(`manifest icon ${size} missing`);
    continue;
  }
  const iconPath = icon.src.replace(/^\//, '');
  if (!fs.existsSync(path.join(root, iconPath))) {
    fail(`manifest icon file missing`, icon.src);
    continue;
  }
  const dimensions = pngSize(iconPath);
  if (!dimensions || dimensions.width !== size || dimensions.height !== size) {
    fail(`manifest icon ${size} has wrong dimensions`, `${icon.src} => ${JSON.stringify(dimensions)}`);
  }
}

const serviceWorker = readText('service-worker.js');
if (!/CACHE_VERSION\s*=\s*['"]clasesde10-pwa-v\d+['"]/.test(serviceWorker)) {
  fail('service worker cache version missing');
}
if (!serviceWorker.includes('networkOnlyPrivatePage')) {
  fail('service worker must fallback private navigations without caching private pages');
}
if (!serviceWorker.includes("event.data?.type === 'SKIP_WAITING'")) {
  fail('service worker must handle SKIP_WAITING messages');
}
if (!serviceWorker.includes("caches.match('/offline.html'")) {
  fail('service worker must serve offline fallback');
}

const pwa = readText('js/pwa.js');
for (const expected of ['--app-vh', '--keyboard-inset', 'visualViewport', 'cd10:pwa-status']) {
  if (!pwa.includes(expected)) fail('pwa.js missing mobile/PWA runtime support', expected);
}

const publicCss = readText('css/style.css');
const dashboardCss = readText('css/dashboard.css');
for (const [file, css] of [['css/style.css', publicCss], ['css/dashboard.css', dashboardCss]]) {
  if (!css.includes('font-size: 16px')) fail(`${file} must keep mobile form controls at 16px`);
  if (!css.includes('touch-action: manipulation')) fail(`${file} must include touch-action hardening`);
}
if (!dashboardCss.includes('--keyboard-inset')) fail('dashboard CSS must adapt modals to mobile keyboard');
if (!dashboardCss.includes('max(20px, calc(20px + var(--keyboard-inset')) {
  fail('dashboard modals must leave room for mobile keyboard');
}

for (const htmlFile of walkHtml()) {
  const html = readText(htmlFile);
  if (!html.includes('rel="manifest"')) fail('HTML missing manifest link', htmlFile);
  if (!html.includes('name="theme-color"')) fail('HTML missing theme-color', htmlFile);
  if (!html.includes('/js/pwa.js')) fail('HTML missing pwa.js', htmlFile);
  if (htmlFile !== 'offline.html' && !html.includes('apple-mobile-web-app-capable')) {
    fail('HTML missing iOS app capable meta', htmlFile);
  }
}

if (failures.length) {
  console.error('PWA static audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`PWA static audit OK (${walkHtml().length} HTML files checked).`);
