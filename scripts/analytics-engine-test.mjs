import assert from 'node:assert/strict';
import {
  ANALYTICS_ENGINE_VERSION,
  buildAnalyticsCsvRows,
  buildAnalyticsReport,
} from '../js/analytics-engine.js';

const nowIso = '2026-06-28T10:00:00.000Z';
const events = [
  { id: 'e1', eventName: 'page.view', sessionId: 's1', anonymousId: 'a1', actorRole: 'anonimo', pagePath: '/', feature: 'home', category: 'navigation', created_at: '2026-06-28T09:00:00.000Z', month: '2026-06' },
  { id: 'e2', eventName: 'cta.click', sessionId: 's1', anonymousId: 'a1', actorRole: 'anonimo', pagePath: '/', feature: 'cta', category: 'conversion', created_at: '2026-06-28T09:01:00.000Z', month: '2026-06' },
  { id: 'e3', eventName: 'form.started', sessionId: 's1', anonymousId: 'a1', actorRole: 'anonimo', pagePath: '/familias', feature: 'lead_familia', category: 'forms', created_at: '2026-06-28T09:02:00.000Z', month: '2026-06' },
  { id: 'e4', eventName: 'form.submitted', sessionId: 's1', anonymousId: 'a1', actorRole: 'anonimo', pagePath: '/familias', feature: 'lead_familia', category: 'forms', created_at: '2026-06-28T09:03:00.000Z', month: '2026-06' },
  { id: 'e5', eventName: 'request.created', sessionId: 's1', anonymousId: 'a1', actorRole: 'familia', pagePath: '/familias', feature: 'solicitudes', category: 'matching', created_at: '2026-06-28T09:04:00.000Z', month: '2026-06' },
  { id: 'e6', eventName: 'assignment.created', sessionId: 's1', anonymousId: 'a1', actorRole: 'admin', pagePath: '/pages/dashboard/admin.html', feature: 'asignaciones', category: 'matching', created_at: '2026-06-28T09:05:00.000Z', month: '2026-06' },
  { id: 'e7', eventName: 'class.created', sessionId: 's1', anonymousId: 'a1', actorRole: 'admin', pagePath: '/pages/dashboard/admin.html', feature: 'clases', category: 'classes', created_at: '2026-06-28T09:06:00.000Z', month: '2026-06' },
  { id: 'e8', eventName: 'auth.login.failed', sessionId: 's2', anonymousId: 'a2', actorRole: 'anonimo', pagePath: '/pages/login.html', feature: 'auth', category: 'error', severity: 'error', created_at: '2026-06-28T09:07:00.000Z', month: '2026-06' },
  { id: 'e9', eventName: 'search.used', sessionId: 's3', anonymousId: 'a3', actorRole: 'familia', pagePath: '/profesores', feature: 'professor_search', category: 'search', metadata: { materia: 'Matematicas', zona: 'Madrid' }, created_at: '2026-06-28T09:08:00.000Z', month: '2026-06' },
];

const report = buildAnalyticsReport({
  events,
  leads: [{ id: 'lead1', tipo: 'familia', metadata: { materia: 'Matematicas', zona: 'Madrid' }, created_at: nowIso }],
  requests: [{ id: 'req1', materia: 'Matematicas', zona: 'Madrid', assignedTeacherUid: 'teacher1', created_at: nowIso }],
  teachers: [{ id: 'teacher1', nombre: 'Ana', materias: ['Matematicas'], created_at: nowIso }],
  families: [{ id: 'family1', created_at: nowIso }],
  students: [{ id: 'student1', created_at: nowIso }],
  assignments: [{ id: 'assign1', teacherUid: 'teacher1', created_at: nowIso }],
  classes: [{ id: 'class1', teacherUid: 'teacher1', status: 'realizada', amount: 30, created_at: nowIso }],
  payments: [{ id: 'pay1', status: 'validado', amount: 30, created_at: nowIso }],
  incidents: [{ id: 'inc1', created_at: nowIso }],
}, { nowIso, month: '2026-06' });

assert.equal(report.version, ANALYTICS_ENGINE_VERSION);
assert.equal(report.totals.events, events.length);
assert.equal(report.totals.sessions, 3);
assert.equal(report.totals.errors, 1);
assert.equal(report.funnels.family_acquisition.at(-1).count, 1);
assert.equal(report.demand.subjects[0].label, 'Matematicas');
assert.equal(report.teacherConversion[0].teacherUid, 'teacher1');
assert.equal(report.teacherConversion[0].completionPct, 100);
assert.ok(report.pageConversion.length >= 1);
assert.ok(report.insights.length >= 1);

const csv = buildAnalyticsCsvRows(events);
assert.equal(csv.length, events.length);
assert.equal(csv[0].evento, 'page.view');
assert.ok(csv.every((row) => row.fecha));

console.log('Analytics engine validation passed.');
