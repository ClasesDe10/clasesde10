#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const family = fs.readFileSync(new URL('../pages/dashboard/familia.html', import.meta.url), 'utf8');
const dashboardCss = fs.readFileSync(new URL('../css/dashboard.css', import.meta.url), 'utf8');

assert.match(family, /id="btn-family-panel-mode"[^>]*>\s*Panel simplificado/);
assert.match(family, /FAMILY_SIMPLIFIED_SECTIONS\s*=\s*new Set\(\['calendario', 'chat', 'notificaciones'\]\)/);
assert.match(family, /FAMILY_PANEL_MODE_STORAGE_KEY/);
assert.match(family, /window\.localStorage\.setItem\(FAMILY_PANEL_MODE_STORAGE_KEY, familyPanelMode\)/);
assert.match(family, /simplified \? 'Panel extendido' : 'Panel simplificado'/);
assert.match(family, /familyPanelMode === 'simplified' && !FAMILY_SIMPLIFIED_SECTIONS\.has\(sec\)/);
assert.match(family, /setFamilyPanelMode\('extended', \{ navigate: false, announce: false \}\)/);
assert.match(family, /data-section="inicio" data-family-panel="extended"/);
assert.match(family, /data-section="clases" data-family-panel="extended"/);
assert.match(family, /data-section="profesores" data-family-panel="extended"/);
assert.match(family, /data-section="alumnos" data-family-panel="extended"/);
assert.match(family, /data-section="solicitudes" data-family-panel="extended"/);
assert.match(family, /data-section="pagos" data-family-panel="extended"/);
assert.match(family, /data-section="perfil" data-family-panel="extended"/);
for (const section of ['calendario', 'chat', 'notificaciones']) {
  assert.match(family, new RegExp(`data-section="${section}"`));
}
assert.match(dashboardCss, /body\[data-family-panel-mode="simplified"\] \[data-family-panel="extended"\]/);
assert.match(dashboardCss, /body\[data-family-panel-mode="simplified"\] \[data-family-panel="simplified"\]/);
assert.match(dashboardCss, /\.family-panel-mode-toggle/);

console.log(JSON.stringify({
  ok: true,
  simplifiedSections: ['calendario', 'chat', 'notificaciones'],
  preferencePersistence: true,
  actionableDeepLinksExpandPanel: true,
  responsiveToggle: true,
}, null, 2));
