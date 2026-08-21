#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const teacher = fs.readFileSync(new URL('../pages/dashboard/profesor.html', import.meta.url), 'utf8');
const family = fs.readFileSync(new URL('../pages/dashboard/familia.html', import.meta.url), 'utf8');
const dashboardCss = fs.readFileSync(new URL('../css/dashboard.css', import.meta.url), 'utf8');

function openingTag(html, id) {
  return html.match(new RegExp(`<[^>]+id="${id}"[^>]*>`))?.[0] || '';
}

const teacherNav = teacher.match(/<nav class="sidebar-nav">([\s\S]*?)<\/nav>/)?.[1] || '';
const teacherSections = [...teacherNav.matchAll(/<button class="sidebar-link[^>]*"[^>]*data-section="([^"]+)"([^>]*)>/g)]
  .map((match) => ({ section: match[1], extended: /data-professor-panel="extended"/.test(match[0]) }));
const simplifiedSections = teacherSections.filter((item) => !item.extended).map((item) => item.section);

assert.deepEqual(simplifiedSections, ['calendario', 'chat', 'notificaciones']);
assert.equal(teacherSections.length, 10);
assert.match(teacher, /id="btn-professor-panel-mode"[^>]*>\s*Panel simplificado/);
assert.match(teacher, /PROFESSOR_SIMPLIFIED_SECTIONS\s*=\s*new Set\(\['calendario', 'chat', 'notificaciones'\]\)/);
assert.match(teacher, /PROFESSOR_PANEL_MODE_STORAGE_KEY/);
assert.match(teacher, /window\.localStorage\.setItem\(PROFESSOR_PANEL_MODE_STORAGE_KEY, professorPanelMode\)/);
assert.match(teacher, /simplified \? 'Panel extendido' : 'Panel simplificado'/);
assert.match(teacher, /professorPanelMode === 'simplified' && !PROFESSOR_SIMPLIFIED_SECTIONS\.has\(sec\)/);
assert.match(teacher, /setProfessorPanelMode\('extended', \{ navigate: false, announce: false \}\)/);
assert.match(teacher, /data-professor-panel="simplified">Uso diario/);
assert.match(teacher, /id="verificacion-banner" data-professor-panel="extended"/);
assert.match(teacher, /dashboard\.css\?v=20260821-teacher-panel-mode/);

for (const section of ['inicio', 'clases', 'alumnos', 'ingresos', 'perfil', 'documentos', 'disponibilidad']) {
  assert.match(teacher, new RegExp(`data-section="${section}" data-professor-panel="extended"`));
}

const teacherLogout = openingTag(teacher, 'btn-logout');
const familyLogout = openingTag(family, 'btn-logout');
assert.match(teacherLogout, /data-panel-persistent="true"/);
assert.doesNotMatch(teacherLogout, /data-professor-panel=/);
assert.match(familyLogout, /data-panel-persistent="true"/);
assert.doesNotMatch(familyLogout, /data-family-panel=/);

assert.match(dashboardCss, /body\[data-professor-panel-mode="simplified"\] \[data-professor-panel="extended"\]/);
assert.match(dashboardCss, /body\[data-professor-panel-mode="simplified"\] \[data-professor-panel="simplified"\]/);
assert.match(dashboardCss, /\.professor-panel-mode-toggle/);

console.log(JSON.stringify({
  ok: true,
  simplifiedSections,
  preferencePersistence: true,
  actionableDeepLinksExpandPanel: true,
  teacherLogoutPersistent: true,
  familyLogoutPersistent: true,
  responsiveToggle: true,
}, null, 2));
