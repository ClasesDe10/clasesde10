import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildAutomaticIncidentPayload,
  buildIncidentStats,
  buildIncidentUpdatePatch,
  incidentPriorityMeta,
  normalizeIncident,
} from '../js/incident-engine.js';

const config = {
  incidents: {
    urgentSlaHours: 2,
    highSlaHours: 12,
    mediumSlaHours: 24,
    lowSlaHours: 48,
  },
};

const created = normalizeIncident({
  id: 'abc123',
  titulo: 'Pago Bizum vencido',
  descripcion: 'La familia no ha pagado la clase.',
  prioridad: 'alta',
  estado: 'abierta',
  createdAt: '2026-06-28T10:00:00.000Z',
}, { config, nowIso: '2026-06-28T11:00:00.000Z' });

assert.equal(created.ticketId, 'INC-20260628-ABC123');
assert.equal(created.categoria, 'pago');
assert.equal(created.prioridad, 'alta');
assert.equal(created.priority, 'high');
assert.equal(created.slaDueAt, '2026-06-28T22:00:00.000Z');
assert.equal(incidentPriorityMeta('urgente').severity, 'critical');

const resolved = buildIncidentUpdatePatch(created, {
  estado: 'resuelta',
  resolution: 'Pago conciliado.',
  rootCause: 'Bizum sin referencia.',
  actionTaken: 'Validado justificante.',
  message: 'Familia contactada.',
  attachmentName: 'Justificante Bizum',
  attachmentUrl: 'https://example.com/bizum.pdf',
}, { uid: 'admin_1', email: 'admin@example.com', role: 'admin' }, {
  config,
  nowIso: '2026-06-28T12:30:00.000Z',
});

assert.equal(resolved.estado, 'resuelta');
assert.equal(resolved.resolutionTimeMinutes, 150);
assert.equal(resolved.history.length >= 1, true);
assert.equal(resolved.conversations.length, 1);
assert.equal(resolved.attachments.length, 1);
assert.equal(resolved.actionsTaken.length, 1);

const auto = buildAutomaticIncidentPayload('document_stale', {
  id: 'doc_1',
  documentId: 'doc_1',
  descripcion: 'Documento pendiente demasiado tiempo.',
}, { config, nowIso: '2026-06-28T09:00:00.000Z' });
assert.equal(auto.categoria, 'documentacion');
assert.equal(auto.automatic, true);
assert.equal(auto.documentId, 'doc_1');

const stats = buildIncidentStats([created, resolved, auto], {
  config,
  nowIso: '2026-06-30T10:00:00.000Z',
});
assert.equal(stats.total, 3);
assert.equal(stats.open, 2);
assert.equal(stats.resolved, 1);
assert.equal(stats.overdue >= 1, true);
assert.ok(stats.patterns.length >= 1);

const adminHtml = fs.readFileSync('pages/dashboard/admin.html', 'utf8');
const adminModule = fs.readFileSync('js/admin-incidents.js', 'utf8');
const worker = fs.readFileSync('scripts/firebase-automation-worker.mjs', 'utf8');
const rules = fs.readFileSync('firebase/firestore.rules', 'utf8');
const indexes = fs.readFileSync('firebase/firestore.indexes.json', 'utf8');
const platformConfig = fs.readFileSync('js/platform-config.js', 'utf8');

assert.match(adminHtml, /initAdminIncidents/);
assert.match(adminHtml, /incidents-summary-grid/);
assert.match(adminModule, /Centro de incidencias|buildIncidentUpdatePatch|btn-guardar-inc/s);
assert.match(worker, /createOperationalIncidentOnce/);
assert.match(worker, /payment_overdue/);
assert.match(worker, /document_stale/);
assert.match(worker, /class_unconfirmed/);
assert.match(rules, /ticketId/);
assert.match(rules, /history/);
assert.match(indexes, /priorityRank/);
assert.match(indexes, /assignedAdminEmail/);
assert.match(platformConfig, /incidents\.urgentSlaHours/);

console.log(JSON.stringify({
  ok: true,
  checked: 'incident_ticket_center',
  ticketId: created.ticketId,
  autoCategory: auto.categoria,
  stats,
}, null, 2));
