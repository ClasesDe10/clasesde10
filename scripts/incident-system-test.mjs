import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildAlertPriorityPlan,
  buildAutomaticIncidentPayload,
  buildIncidentStats,
  buildIncidentUpdatePatch,
  buildPreventiveIncidentPlan,
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

const preventive = buildPreventiveIncidentPlan({
  requestMatches: [{
    id: 'match_1',
    requestId: 'req_1',
    teacherUid: 'teacher_1',
    status: 'propuesto',
    createdAt: '2026-06-29T22:00:00.000Z',
  }],
  solicitudes: [{
    id: 'req_2',
    familyUid: 'fam_1',
    studentId: 'student_1',
    status: 'pendiente',
    materia: 'Matematicas',
    createdAt: '2026-06-28T09:00:00.000Z',
  }, {
    id: 'req_3',
    familyUid: 'fam_2',
    studentId: 'student_2',
    status: 'pendiente',
    assignedTeacherUid: 'teacher_2',
    createdAt: '2026-06-29T09:00:00.000Z',
  }],
  asignaciones: [{
    id: 'assign_1',
    requestId: 'req_4',
    familyUid: 'fam_3',
    teacherUid: 'teacher_3',
    status: 'activa',
    createdAt: '2026-06-27T09:00:00.000Z',
  }],
  clases: [{
    id: 'class_broken',
    status: 'programada',
    fecha: '2026-06-30T18:00:00.000Z',
    teacherUid: 'teacher_1',
  }, {
    id: 'class_cancel_1',
    status: 'cancelada',
    teacherUid: 'teacher_4',
    familyUid: 'fam_4',
    fecha: '2026-06-25T18:00:00.000Z',
  }, {
    id: 'class_cancel_2',
    status: 'cancelada',
    teacherUid: 'teacher_4',
    familyUid: 'fam_4',
    fecha: '2026-06-26T18:00:00.000Z',
  }, {
    id: 'class_cancel_3',
    status: 'cancelada',
    teacherUid: 'teacher_4',
    familyUid: 'fam_4',
    fecha: '2026-06-27T18:00:00.000Z',
  }],
  pagos: [{
    id: 'pay_1',
    familyUid: 'fam_5',
    status: 'pendiente',
    amount: 30,
    dueAt: '2026-06-28T10:00:00.000Z',
  }],
  profesores: [{
    id: 'teacher_5',
    status: 'verificado',
    nombre: 'Profesor incompleto',
    materias: ['Matematicas'],
  }],
  familias: [{
    id: 'fam_1',
    status: 'active',
    lastActivityAt: '2026-06-01T10:00:00.000Z',
  }],
  incidencias: [{
    id: 'inc_a',
    familyUid: 'fam_6',
    categoria: 'pago',
    status: 'abierta',
    createdAt: '2026-06-20T10:00:00.000Z',
  }, {
    id: 'inc_b',
    familyUid: 'fam_6',
    categoria: 'pago',
    status: 'abierta',
    createdAt: '2026-06-21T10:00:00.000Z',
  }, {
    id: 'inc_c',
    familyUid: 'fam_6',
    categoria: 'pago',
    status: 'abierta',
    createdAt: '2026-06-22T10:00:00.000Z',
  }],
  deadLetters: [{
    id: 'job_dead',
    status: 'open',
    error: 'permission denied',
  }],
}, {
  nowIso: '2026-06-30T10:00:00.000Z',
  teacherNonResponseHours: 8,
  staleRequestHours: 24,
  unscheduledAssignmentHours: 48,
  paymentGraceHours: 24,
  repeatedCancellationThreshold: 3,
  recurrentIncidentThreshold: 3,
  incompleteProfilePercent: 85,
});
const preventiveTypes = new Set(preventive.risks.map((item) => item.type));
assert.ok(preventiveTypes.has('teacher_non_response'));
assert.ok(preventiveTypes.has('request_without_teacher'));
assert.ok(preventiveTypes.has('request_assigned_without_relationship'));
assert.ok(preventiveTypes.has('assignment_without_scheduled_class'));
assert.ok(preventiveTypes.has('payment_overdue_preventive'));
assert.ok(preventiveTypes.has('repeated_cancellations'));
assert.ok(preventiveTypes.has('recurrent_incident_pattern'));
assert.ok(preventiveTypes.has('incomplete_teacher_profile'));
assert.ok(preventiveTypes.has('class_missing_core_relation'));
assert.ok(preventiveTypes.has('automation_dead_letter'));
assert.equal(preventive.summary.critical >= 1, true);

const alertPlan = buildAlertPriorityPlan({
  incidencias: [{
    id: 'inc_critical',
    source: 'payment_overdue',
    categoria: 'pago',
    priority: 'critical',
    status: 'abierta',
    automatic: true,
    paymentId: 'pay_critical',
    amount: 180,
    titulo: 'Pago vencido critico',
    descripcion: 'Pago vencido con importe alto.',
    createdAt: '2026-06-28T10:00:00.000Z',
  }, {
    id: 'inc_duplicate',
    source: 'payment_overdue',
    categoria: 'pago',
    priority: 'critical',
    status: 'abierta',
    automatic: true,
    paymentId: 'pay_critical',
    amount: 180,
    titulo: 'Pago vencido critico duplicado',
    descripcion: 'Pago vencido con importe alto.',
    createdAt: '2026-06-28T11:00:00.000Z',
  }],
  preventiveRisks: [{
    id: 'risk_task',
    type: 'incomplete_teacher_profile',
    severity: 'medium',
    status: 'active',
    entityType: 'profesores',
    entityId: 'teacher_profile',
    title: 'Perfil incompleto',
    description: 'Faltan campos de confianza.',
  }],
  notificaciones: [{
    id: 'notif_1',
    type: 'payment_overdue',
    priority: 'high',
    userUid: 'admin_1',
    title: 'Pago pendiente',
    body: 'Aviso repetido de pago.',
    createdAt: '2026-06-30T08:00:00.000Z',
    readAt: null,
  }],
}, {
  nowIso: '2026-06-30T10:00:00.000Z',
  adminNotificationScore: 82,
  taskScore: 55,
});
assert.equal(alertPlan.summary.critical >= 1, true);
assert.equal(alertPlan.summary.autoResolvable >= 1, true);
assert.ok(alertPlan.decisions.some((item) => item.autoAction === 'close_duplicate_automatic_incident'));
assert.ok(alertPlan.topAlerts[0].priorityScore >= alertPlan.topAlerts.at(-1).priorityScore);
assert.ok(alertPlan.decisions.every((item) => item.recommendedAction && item.consequence && item.whyDetected.length));

const adminHtml = fs.readFileSync('pages/dashboard/admin.html', 'utf8');
const adminModule = fs.readFileSync('js/admin-incidents.js', 'utf8');
const worker = fs.readFileSync('scripts/firebase-automation-worker.mjs', 'utf8');
const rules = fs.readFileSync('firebase/firestore.rules', 'utf8');
const indexes = fs.readFileSync('firebase/firestore.indexes.json', 'utf8');
const platformConfig = fs.readFileSync('js/platform-config.js', 'utf8');
const dataClient = fs.readFileSync('js/firebase-data-client.js', 'utf8');

assert.match(adminHtml, /initAdminIncidents/);
assert.match(adminHtml, /incidents-summary-grid/);
assert.match(adminModule, /Centro de incidencias|buildIncidentUpdatePatch|btn-guardar-inc/s);
assert.match(worker, /createOperationalIncidentOnce/);
assert.match(worker, /payment_overdue/);
assert.match(worker, /document_stale/);
assert.match(worker, /class_unconfirmed/);
assert.match(worker, /processPreventiveIncidentRadar/);
assert.match(worker, /processAlertPriorityEngine/);
assert.match(worker, /preventiveRisks/);
assert.match(worker, /alertDecisions/);
assert.match(rules, /ticketId/);
assert.match(rules, /history/);
assert.match(rules, /preventiveRisks/);
assert.match(rules, /alertDecisions/);
assert.match(indexes, /priorityRank/);
assert.match(indexes, /assignedAdminEmail/);
assert.match(platformConfig, /incidents\.urgentSlaHours/);
assert.match(platformConfig, /incidents\.preventiveRadarEnabled/);
assert.match(platformConfig, /incidents\.alertPriorityEnabled/);
assert.match(dataClient, /if \(!data\.id\) delete data\.id;/);

console.log(JSON.stringify({
  ok: true,
  checked: 'incident_ticket_center',
  ticketId: created.ticketId,
  autoCategory: auto.categoria,
  stats,
}, null, 2));
