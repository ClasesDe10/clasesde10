#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const domains = ['https://clasesde10.com', 'https://clasesde10-50add.web.app'];
const assets = [
  'pages/dashboard/familia.html',
  'pages/dashboard/profesor.html',
  'pages/dashboard/admin.html',
  'css/dashboard.css',
  'js/chat-widget.js',
  'js/weekly-schedule-engine.js',
  'js/notification-center.js',
  'js/pwa.js',
  'service-worker.js',
  'manifest.json',
];

function sha(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const bytes = {};
for (const domain of domains) {
  bytes[domain] = {};
  for (const asset of assets) {
    const local = fs.readFileSync(path.join(root, asset));
    const response = await fetch(`${domain}/${asset}?production_audit=${Date.now()}`, { cache: 'no-store' });
    assert.equal(response.status, 200, `${domain}/${asset} returned ${response.status}`);
    const remote = Buffer.from(await response.arrayBuffer());
    assert.equal(sha(remote), sha(local), `${asset} differs between local and ${domain}`);
    bytes[domain][asset] = remote.length;
  }
}

const familySource = fs.readFileSync(path.join(root, 'pages/dashboard/familia.html'), 'utf8');
const teacherSource = fs.readFileSync(path.join(root, 'pages/dashboard/profesor.html'), 'utf8');
const chatSource = fs.readFileSync(path.join(root, 'js/chat-widget.js'), 'utf8');
const swSource = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
assert.match(familySource, /section-profesores/);
assert.match(familySource, /Activar avisos en el móvil/);
assert.match(familySource, /modal-horario-semanal-familia/);
assert.match(teacherSource, /teacher-schedule-pending-alert/);
assert.match(teacherSource, /modal-horario-semanal-profesor/);
assert.match(chatSource, /schedulingEnabled = false/);
assert.match(chatSource, /scheduleOnly = false/);
assert.match(swSource, /clasesde10-pwa-v101/);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const screenshots = [];
try {
  const page = await browser.newPage();
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() === 'script') await route.abort();
    else await route.continue();
  });
  await page.goto(`${domains[0]}/pages/dashboard/familia.html?production_audit=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.evaluate(() => {
    document.querySelectorAll('.dash-section').forEach((section) => { section.style.display = 'none'; });
    const section = document.querySelector('#section-profesores');
    section.style.display = '';
    document.querySelector('#topbar-title').textContent = 'Mis profesores';
    document.querySelector('#family-teachers-grid').innerHTML = `
      <article class="family-teacher-card">
        <header class="family-teacher-card-header"><div class="family-teacher-avatar">LM</div><div><span>Profesor asignado</span><h3>Lucía Martínez Hernández</h3><p>Matemáticas · Alejandro</p></div></header>
        <div class="family-teacher-safe-note">Solo mostramos información académica y de experiencia. Los datos de contacto permanecen protegidos.</div>
        <div class="family-teacher-facts"><span>42,5 h impartidas</span><span>4 años de experiencia</span><span>24 años</span></div>
        <div class="family-teacher-studies"><span>Qué estudia o ha estudiado</span><strong>Ingeniería Aeroespacial · Universidad Politécnica de Madrid</strong></div>
        <section class="family-teacher-schedule schedule-tone-warning"><div><span>Clases y horario</span><strong>Falta proponer el horario semanal</strong><p>La familia debe enviar la primera propuesta para que el profesor pueda responder.</p></div><button class="btn btn-primary btn-sm">Proponer horario</button></section>
        <footer class="family-teacher-card-actions"><button class="btn btn-outline btn-sm">Abrir chat</button><button class="btn btn-ghost btn-sm">Ver calendario</button></footer>
      </article>`;
  });

  fs.mkdirSync(path.join(root, 'output', 'playwright'), { recursive: true });
  for (const viewport of [
    { name: 'desktop', width: 1366, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      cardRight: Math.round(document.querySelector('.family-teacher-card').getBoundingClientRect().right),
      cardLeft: Math.round(document.querySelector('.family-teacher-card').getBoundingClientRect().left),
    }));
    assert.ok(overflow.scroll <= overflow.viewport + 1, `${viewport.name} teacher space overflows: ${JSON.stringify(overflow)}`);
    assert.ok(overflow.cardLeft >= -1 && overflow.cardRight <= overflow.viewport + 1, `${viewport.name} teacher card leaves viewport`);
    const screenshot = path.join(root, 'output', 'playwright', `family-teachers-production-${viewport.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    screenshots.push(screenshot);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const overlay = document.querySelector('#modal-horario-semanal-familia');
    overlay.classList.add('open');
    const widget = document.querySelector('#family-weekly-schedule-widget');
    widget.classList.add('chat-schedule-workspace');
    widget.innerHTML = `<div class="chat-layout"><section class="chat-thread-panel"><section class="chat-schedule-panel" style="display:block"><div class="chat-schedule-summary"><div><div class="chat-thread-title">Horario de clases</div><div class="chat-thread-subtitle">Acordad un horario semanal fijo.</div></div></div><div class="chat-schedule-planner"><form class="chat-schedule-form"><select class="form-control"><option>Semanal fija</option></select><select class="form-control"><option>Martes</option></select><input class="form-control" value="17:00"><input class="form-control" value="18:30"><select class="form-control"><option>Presencial</option></select><input class="form-control" value="En el domicilio familiar"><button class="btn btn-primary btn-sm">Proponer</button></form></div></section></section></div>`;
  });
  await page.waitForTimeout(200);
  const modalOverflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    modal: document.querySelector('.weekly-schedule-modal-card').getBoundingClientRect().toJSON(),
  }));
  assert.ok(modalOverflow.scroll <= modalOverflow.viewport + 1, `Mobile schedule modal overflows: ${JSON.stringify(modalOverflow)}`);
  assert.ok(modalOverflow.modal.left >= -1 && modalOverflow.modal.right <= modalOverflow.viewport + 1, 'Mobile schedule modal leaves viewport');
  const modalScreenshot = path.join(root, 'output', 'playwright', 'family-weekly-schedule-production-mobile.png');
  await page.screenshot({ path: modalScreenshot, fullPage: true });
  screenshots.push(modalScreenshot);
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, domains, assets: assets.length, bytes, screenshots }, null, 2));
