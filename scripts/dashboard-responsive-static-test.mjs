#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];
const cssVersion = '20260816-teacher-attendance-lock';
const familyTeacherCssVersion = '20260821-chat-teacher-photo';
const adminCssVersion = '20260815-admin-person-context';

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

const dashboardCss = read('css/dashboard.css');
const utilsJs = read('js/utils.js');

for (const needle of [
  'cd10-responsive-guard-20260707',
  'cd10-mobile-drawer-crisp-20260707',
  'html.sidebar-open',
  'touch-action: pan-y',
  'z-index: 1200',
  'z-index: 1100',
  'background: var(--cream)',
  'backdrop-filter: none',
  'transform: none',
  'will-change: auto',
  'overscroll-behavior: contain',
  'overflow-x: auto',
  '.table-wrapper table:not(.responsive-card-table)',
  '.calendar-page-layout',
  '.calendar-day-panel',
  '.calendar-legend-item',
  '.dot-rose',
  '.dot-amber',
  '.dot-indigo',
  '.dot-emerald',
  '.dot-cyan',
  '.chat-layout',
  '.chat-compose',
  '.modal',
  '@media (max-width: 768px)',
  '@media (max-width: 640px)',
  '@media (max-width: 480px)',
]) {
  assert(dashboardCss.includes(needle), `dashboard.css missing responsive guard: ${needle}`);
}

for (const needle of [
  'lockPageScroll',
  'unlockPageScroll',
  'sidebarScrollLocked',
  "window.matchMedia?.('(max-width: 768px)')",
]) {
  assert(utilsJs.includes(needle), `utils.js missing mobile sidebar guard: ${needle}`);
}

const dashboards = [
  {
    role: 'admin',
    file: 'pages/dashboard/admin.html',
    sections: [
      'dashboard',
      'operaciones',
      'ia',
      'analitica',
      'experimentos',
      'configuracion',
      'clases',
      'calendario',
      'profesores',
      'familias',
      'alumnos',
      'solicitudes',
      'pagos',
      'finanzas',
      'leads',
      'documentos',
      'chats',
      'incidencias',
      'auditoria',
    ],
    calendarLayout: 'admin-calendar-layout',
  },
  {
    role: 'familia',
    file: 'pages/dashboard/familia.html',
    sections: ['inicio', 'calendario', 'clases', 'profesores', 'alumnos', 'solicitudes', 'pagos', 'chat', 'perfil'],
    calendarLayout: 'calendar-page-layout',
    needsCalendarCss: true,
  },
  {
    role: 'profesor',
    file: 'pages/dashboard/profesor.html',
    sections: ['inicio', 'calendario', 'clases', 'alumnos', 'ingresos', 'chat', 'perfil', 'documentos', 'disponibilidad'],
    calendarLayout: 'calendar-page-layout',
    needsCalendarCss: true,
  },
  {
    role: 'alumno',
    file: 'pages/dashboard/alumno.html',
    sections: ['inicio', 'calendario', 'clases', 'profesor'],
    calendarLayout: 'calendar-page-layout',
    needsCalendarCss: true,
  },
];

for (const config of dashboards) {
  const html = read(config.file);
  assert(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1.0">'), `${config.role}: missing viewport meta.`);
  const expectedCssVersion = config.role === 'admin'
    ? adminCssVersion
    : ['familia', 'profesor'].includes(config.role) ? familyTeacherCssVersion : cssVersion;
  assert(html.includes(`dashboard.css?v=${expectedCssVersion}`), `${config.role}: dashboard CSS cache version is stale.`);
  assert(html.includes('<div class="dash-layout">'), `${config.role}: missing dashboard layout shell.`);
  assert(html.includes('class="main-content"'), `${config.role}: missing main content container.`);
  assert(html.includes('class="topbar"'), `${config.role}: missing topbar.`);
  assert(html.includes('class="page-content"'), `${config.role}: missing page content wrapper.`);
  assert(html.includes('class="sidebar-overlay"'), `${config.role}: missing mobile sidebar overlay.`);
  assert(!html.includes('grid-template-columns:1fr 300px'), `${config.role}: calendar still uses fixed inline grid.`);
  assert(!/dashboard\.css\?v=2026070[0-6]/.test(html), `${config.role}: dashboard CSS references an older July cache key.`);
  assert(html.includes(config.calendarLayout), `${config.role}: calendar does not use the expected responsive layout.`);
  if (config.needsCalendarCss) {
    assert(html.includes('calendar-indicators.css'), `${config.role}: missing calendar indicator CSS.`);
    assert(html.includes('calendar-fit.css'), `${config.role}: missing calendar fit CSS.`);
  }

  for (const section of config.sections) {
    assert(html.includes(`data-section="${section}"`), `${config.role}: missing navigation entry for ${section}.`);
    assert(html.includes(`id="section-${section}"`), `${config.role}: missing section container for ${section}.`);
  }

  const tableCount = (html.match(/<table\b/g) || []).length;
  const wrapperCount = (html.match(/table-wrapper/g) || []).length;
  assert(wrapperCount >= tableCount, `${config.role}: every table must be inside a table-wrapper (${wrapperCount}/${tableCount}).`);

  if (html.includes('id="cal-clases-dia"')) {
    assert(html.includes('calendar-day-panel'), `${config.role}: day detail panel must use calendar-day-panel.`);
    assert(html.includes('dashboard-empty-state is-compact'), `${config.role}: calendar empty state must stay compact.`);
  }
}

const adminDashboard = read('pages/dashboard/admin.html');
const adminDailyNav = adminDashboard.slice(
  adminDashboard.indexOf("title: 'Trabajo diario'"),
  adminDashboard.indexOf("title: 'Personas'"),
);
assert(adminDailyNav.includes("['calendario', 'Calendario']"), 'admin: daily navigation must promote Calendario as the operations hub.');
assert(adminDailyNav.includes("['documentos', 'Documentos']"), 'admin: Documentos must appear in daily work because uploads need review.');
assert(!adminDailyNav.includes("['clases'"), 'admin: Clases must not appear in the daily navigation group.');
assert(!adminDailyNav.includes("['pagos'"), 'admin: Pagos must not appear in the daily navigation group.');
const adminSystemNav = adminDashboard.slice(
  adminDashboard.indexOf("title: 'Sistema'"),
  adminDashboard.indexOf('];', adminDashboard.indexOf("title: 'Sistema'")),
);
assert(adminSystemNav.includes("['ia', 'IA Admin']") && adminSystemNav.includes("['configuracion', 'Configuracion']"), 'admin: Sistema must keep only IA and Configuracion in the main sidebar.');
assert(!adminSystemNav.includes("['analitica'") && !adminSystemNav.includes("['auditoria'") && !adminSystemNav.includes("['experimentos'"), 'admin: advanced report tools must be contextual, not permanent sidebar entries.');
assert(adminDashboard.includes('badge-documentos'), 'admin: document review badge must exist in the sidebar.');
assert(adminDashboard.includes('ensureAdminDocumentReviewNotifications'), 'admin: uploaded documents must generate admin review notifications.');
assert(adminDashboard.includes('data-section="analitica"') && adminDashboard.includes('data-section="auditoria"') && adminDashboard.includes('data-section="experimentos"'), 'admin: contextual entry points must keep hidden advanced sections reachable.');
assert(adminDashboard.includes('admin-calendar-command-bar'), 'admin: calendar must expose the central command bar.');
assert(adminDashboard.includes('Detalle clases') && adminDashboard.includes('Detalle pagos'), 'admin: calendar must link to technical detail tables.');
assert(adminDashboard.includes('admin-technical-view-banner'), 'admin: technical class/payment views must explain they are secondary.');
assert(adminDashboard.includes('crm-directory-table'), 'admin: people sections must use the professional directory layout.');
assert(adminDashboard.includes('admin-directory-card'), 'admin: people sections must render compact profile cards.');
assert(adminDashboard.includes('modal-alumno-detalle'), 'admin: students must have a complete profile modal.');
assert(dashboardCss.includes('.admin-directory-avatar'), 'admin: directory profile photos must be styled.');

if (failures.length) {
  console.error('Dashboard responsive static test failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Dashboard responsive static test passed (${dashboards.length} panels checked).`);
