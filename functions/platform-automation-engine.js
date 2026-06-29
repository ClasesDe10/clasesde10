'use strict';

const {
  EVENT_CATALOG,
  RULE_ENGINE_VERSION,
  applyAutomationRules,
  mergeRuleSets,
} = require('./rules-engine.js');

const AUTOMATION_ORCHESTRATION_VERSION = 'platform-automation-2026-06-28';

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function lower(value) {
  return clean(value).toLowerCase();
}

function slug(...parts) {
  return parts
    .flat()
    .map((part) => clean(part, 180).toLowerCase().replace(/[^a-z0-9_-]+/g, '_'))
    .filter(Boolean)
    .join('__')
    .slice(0, 900);
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    const id = item.id || slug(item.type, item.entityType, item.entityId, item.title);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    item.id = id;
    return true;
  });
}

function createPlan(event) {
  return {
    version: AUTOMATION_ORCHESTRATION_VERSION,
    event: {
      type: clean(event.type, 120),
      entityType: clean(event.entityType, 80),
      entityId: clean(event.entityId || event.data?.id, 180),
      source: clean(event.source || 'platform', 120),
    },
    automationEvents: [],
    notifications: [],
    systemJobs: [],
    auditLogs: [],
    crmTasks: [],
    opsAlerts: [],
    patches: [],
    ruleRuns: [],
  };
}

function finalizePlan(plan) {
  plan.automationEvents = uniqueById(plan.automationEvents);
  plan.notifications = uniqueById(plan.notifications);
  plan.systemJobs = uniqueById(plan.systemJobs);
  plan.auditLogs = uniqueById(plan.auditLogs);
  plan.crmTasks = uniqueById(plan.crmTasks);
  plan.opsAlerts = uniqueById(plan.opsAlerts);
  plan.patches = uniqueById(plan.patches);
  plan.ruleRuns = uniqueById(plan.ruleRuns.map((item) => ({
    id: slug('rule_run', item.ruleId, item.eventType, item.entityType, item.entityId),
    ...item,
  })));
  return plan;
}

function dataId(event) {
  return clean(event.entityId || event.data?.id || event.data?.uid || event.data?.requestId || event.data?.classId || event.data?.paymentId, 180);
}

function eventBase(event) {
  return slug('evt', event.type, event.entityType, dataId(event));
}

function notificationType(type) {
  return clean(type, 80).replace(/\./g, '_');
}

function addAutomationEvent(plan, event, summary, severity = 'info', payload = {}) {
  const entityId = dataId(event);
  plan.automationEvents.push({
    id: eventBase(event),
    type: clean(event.type, 120),
    entityType: clean(event.entityType, 80),
    entityId,
    source: clean(event.source || 'platform', 120),
    summary: clean(summary, 500),
    severity,
    payload,
    version: AUTOMATION_ORCHESTRATION_VERSION,
  });
}

function addNotification(plan, event, target, title, body, payload = {}, options = {}) {
  const type = notificationType(options.type || payload.type || event.type);
  plan.notifications.push({
    id: slug('ntf', type, dataId(event), target.userUid || target.role || target.targetRole, options.key || ''),
    userUid: clean(target.userUid, 180) || null,
    targetRole: clean(target.targetRole || target.role, 60) || null,
    role: clean(target.role, 60) || null,
    title: clean(title, 140),
    body: clean(body, 1200),
    type,
    priority: clean(options.priority || 'normal', 40),
    channels: options.channels || ['internal', 'browser', 'push'],
    actionUrl: clean(options.actionUrl || payload.url || '/pages/login.html', 500) || '/pages/login.html',
    payload: {
      ...payload,
      type,
      entityType: clean(event.entityType, 80),
      entityId: dataId(event),
    },
  });
}

function addSystemJob(plan, event, type, payload = {}, options = {}) {
  plan.systemJobs.push({
    id: slug('job', type, dataId(event), options.key || ''),
    type: clean(type, 120),
    payload,
    priority: clean(options.priority || 'normal', 40),
    runAfterMinutes: Number(options.runAfterMinutes || 0),
    idempotencyKey: clean(options.idempotencyKey || slug(type, dataId(event), options.key || ''), 300),
    maxAttempts: Math.max(1, Number(options.maxAttempts || 5)),
  });
}

function addAudit(plan, event, action, metadata = {}, actorUid = 'system') {
  const module = (() => {
    const entity = clean(event.entityType, 80);
    const combined = `${entity}.${action}`.toLowerCase();
    if (/auth|login|register|password/.test(combined)) return 'auth';
    if (/profesor|familia|alumno|profile|perfil/.test(combined)) return 'profiles';
    if (/clase|class/.test(combined)) return 'classes';
    if (/pago|payment/.test(combined)) return 'payments';
    if (/solicitud|matching|assignment|asignacion/.test(combined)) return 'matching';
    if (/document/.test(combined)) return 'documents';
    if (/incident|incidencia/.test(combined)) return 'incidents';
    return 'automation';
  })();
  plan.auditLogs.push({
    id: slug('audit', action, event.entityType, dataId(event)),
    schemaVersion: 'audit_log_v1',
    actorUid: clean(actorUid || 'system', 180),
    actorEmail: '',
    actorRole: actorUid === 'system' ? 'system' : '',
    actorType: actorUid === 'system' ? 'automation' : 'user',
    responsibleUid: clean(actorUid || 'system', 180),
    responsibleEmail: '',
    action: clean(action, 120),
    module,
    entityType: clean(event.entityType, 80),
    entityId: dataId(event),
    origin: 'automation',
    source: clean(event.source || 'platform_automation', 120),
    severity: 'info',
    description: clean(action.replaceAll('.', ' '), 300),
    metadata: {
      ...metadata,
      sourceEventType: clean(event.type, 120),
      automationVersion: AUTOMATION_ORCHESTRATION_VERSION,
    },
  });
}

function addCrmTask(plan, event, title, description, options = {}) {
  plan.crmTasks.push({
    id: slug('task', options.type || event.type, event.entityType, dataId(event), options.key || ''),
    title: clean(title, 180),
    description: clean(description, 1200),
    status: 'open',
    priority: clean(options.priority || 'normal', 40),
    ownerRole: clean(options.ownerRole || 'admin', 60),
    entityType: clean(event.entityType, 80),
    entityId: dataId(event),
    tags: Array.isArray(options.tags) ? options.tags.map((tag) => clean(tag, 60)).filter(Boolean) : [],
    dueAfterMinutes: Number(options.dueAfterMinutes || 24 * 60),
    sourceEventType: clean(event.type, 120),
  });
}

function addOpsAlert(plan, event, type, level, message, options = {}) {
  plan.opsAlerts.push({
    id: slug('alert', type, dataId(event), options.key || ''),
    type: clean(type, 120),
    level: clean(level || 'medium', 40),
    status: 'open',
    message: clean(message, 500),
    entityType: clean(event.entityType, 80),
    entityId: dataId(event),
    sourceEventType: clean(event.type, 120),
  });
}

function addPatch(plan, event, collection, id, data, options = {}) {
  const docId = clean(id || dataId(event), 180);
  if (!collection || !docId || !data || typeof data !== 'object') return;
  plan.patches.push({
    id: slug('patch', collection, docId, options.key || event.type),
    collection: clean(collection, 80),
    docId,
    data: {
      ...data,
      automationVersion: AUTOMATION_ORCHESTRATION_VERSION,
    },
  });
}

function firstPresent(data, fields) {
  for (const field of fields) {
    const value = clean(data?.[field], 180);
    if (value) return value;
  }
  return '';
}

function personLabel(data, fallback) {
  return firstPresent(data, ['nombre', 'name', 'displayName', 'email']) || fallback;
}

function subjectLabel(data) {
  return firstPresent(data, ['materia', 'subject', 'asignatura', 'category']) || 'la solicitud';
}

function classLabel(data) {
  const subject = firstPresent(data, ['materia', 'subject', 'asignatura']) || 'clase';
  const date = firstPresent(data, ['fecha', 'date']);
  const time = firstPresent(data, ['hora_inicio', 'startTime', 'hora']);
  return [subject, date, time].filter(Boolean).join(' - ') || subject;
}

function paymentAmountLabel(data) {
  const amount = Number(data?.monto ?? data?.amount ?? data?.importe ?? data?.total ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return 'importe pendiente';
  return `${Math.round(amount * 100) / 100} EUR`;
}

function scheduleLabel(data) {
  const subject = firstPresent(data, ['materia', 'subject', 'asignatura']) || 'Clase';
  const date = firstPresent(data, ['fecha', 'date']);
  const start = firstPresent(data, ['hora_inicio', 'startTime', 'hora']);
  const end = firstPresent(data, ['hora_fin', 'endTime']);
  const time = [start, end].filter(Boolean).join(' - ');
  return [subject, date, time].filter(Boolean).join(' · ') || subject;
}

function userUid(data, fields) {
  return firstPresent(data, fields);
}

function isVerifiedPaymentStatus(data) {
  const status = lower(data?.status || data?.estado || data?.paymentStatus || data?.familyPaymentStatus);
  return ['validado', 'pagado', 'paid', 'succeeded'].includes(status);
}

function isTeacherPayout(data) {
  return ['teacher_payout', 'pago_profesor'].includes(clean(data?.paymentType || data?.tipo, 80));
}

function classHasPaidStatus(data) {
  const status = lower(data?.paymentStatus || data?.familyPaymentStatus || data?.estado_pago || data?.estado_pago_familia);
  return ['validado', 'pagado', 'paid', 'succeeded'].includes(status);
}

function configNumber(path, fallback) {
  return { number: { firstOf: [`config.${path}`, { const: fallback }] } };
}

function configDirectNumber(config, path, fallback) {
  const value = String(path || '').split('.').reduce((current, key) => (
    current === undefined || current === null ? undefined : current[key]
  ), config || {});
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

const DEFAULT_AUTOMATION_RULES = [
  {
    id: 'request.created.core',
    name: 'Nueva solicitud: matching, admin y auditoria',
    eventTypes: ['request.created'],
    priority: 10,
    actions: [
      { type: 'automationEvent', summary: 'Nueva solicitud capturada y enviada a matching.', severity: 'info', payload: { subject: { path: 'computed.subject' } } },
      { type: 'notification', target: { targetRole: 'admin', role: 'admin' }, title: 'Nueva solicitud recibida', body: '{{computed.person}} solicita {{computed.subject}}.', payload: { requestId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'request_created', priority: 'high' } },
      { type: 'systemJob', jobType: 'matching.request', payload: { requestId: { path: 'computed.id' }, reason: 'request_created' }, options: { priority: 'high', key: 'matching' } },
      { type: 'systemJob', jobType: 'metrics.snapshot', payload: { source: 'request.created' }, options: { priority: 'low', key: 'metrics', runAfterMinutes: configNumber('automation.metricsSnapshotDelayMinutes', 5) } },
      { type: 'audit', action: 'request.created', metadata: { subject: { path: 'computed.subject' }, familyUid: { path: 'computed.familyUid' } } },
    ],
  },
  {
    id: 'request.created.incomplete-data',
    eventTypes: ['request.created'],
    priority: 11,
    when: { any: [{ path: 'computed.subjectMissing', operator: 'truthy' }, { path: 'computed.locationMissing', operator: 'truthy' }] },
    actions: [
      { type: 'crmTask', title: 'Completar datos de solicitud', description: 'La solicitud ha llegado con materia o zona incompleta. Revisarla antes de asignar profesor.', options: { priority: 'high', tags: ['solicitud', 'datos_incompletos'], dueAfterMinutes: configNumber('automation.incompleteRequestReviewMinutes', 60) } },
    ],
  },
  {
    id: 'request.stale.core',
    eventTypes: ['request.stale'],
    priority: 20,
    actions: [
      { type: 'automationEvent', summary: 'Solicitud sin avance detectada por barrido automatico.', severity: 'warning' },
      { type: 'notification', target: { targetRole: 'admin', role: 'admin' }, title: 'Solicitud atascada', body: 'La solicitud {{computed.subject}} sigue sin profesor asignado.', payload: { requestId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'request_stale', priority: 'high' } },
      { type: 'systemJob', jobType: 'matching.request', payload: { requestId: { path: 'computed.id' }, reason: 'stale_request' }, options: { priority: 'high', key: 'matching_retry' } },
      { type: 'crmTask', title: 'Resolver solicitud sin asignar', description: 'Revisar candidatos, disponibilidad y datos de contacto para desbloquear la solicitud.', options: { priority: 'high', tags: ['matching', 'solicitud'], dueAfterMinutes: configNumber('automation.staleRequestReviewMinutes', 120) } },
      { type: 'audit', action: 'request.stale_detected', metadata: { status: { firstOf: ['data.status', 'data.estado'] } } },
    ],
  },
  {
    id: 'assignment.created.core',
    eventTypes: ['assignment.created'],
    priority: 30,
    actions: [
      { type: 'automationEvent', summary: 'Asignacion creada y comunicada a las partes.', severity: 'info', payload: { teacherUid: { path: 'computed.teacherUid' }, familyUid: { path: 'computed.familyUid' } } },
      { type: 'notification', target: { userUid: { path: 'computed.teacherUid' }, role: 'profesor' }, title: 'Nueva asignacion', body: 'Tienes una nueva solicitud asignada de {{computed.subject}}.', payload: { requestId: { firstOf: ['data.requestId', 'data.solicitud_id'] }, assignmentId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'assignment_created', priority: 'high', key: 'teacher' } },
      { type: 'notification', target: { userUid: { path: 'computed.familyUid' }, role: 'familia' }, title: 'Profesor asignado', body: 'Ya hay profesor asignado para {{computed.subject}}.', payload: { requestId: { firstOf: ['data.requestId', 'data.solicitud_id'] }, assignmentId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'assignment_created', priority: 'high', key: 'family' } },
      { type: 'notification', target: { targetRole: 'admin', role: 'admin' }, title: 'Asignacion creada', body: 'Se ha asignado profesor para {{computed.subject}}.', payload: { requestId: { firstOf: ['data.requestId', 'data.solicitud_id'] }, assignmentId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'assignment_created', priority: 'normal', key: 'admin' } },
      { type: 'systemJob', jobType: 'relationship.ensure_chat', payload: { assignmentId: { path: 'computed.id' }, reason: 'assignment_created' }, options: { priority: 'high', key: 'chat' } },
      { type: 'systemJob', jobType: 'metrics.snapshot', payload: { source: 'assignment.created' }, options: { priority: 'low', key: 'metrics', runAfterMinutes: configNumber('automation.metricsSnapshotDelayMinutes', 5) } },
      { type: 'audit', action: 'assignment.created', metadata: { teacherUid: { path: 'computed.teacherUid' }, familyUid: { path: 'computed.familyUid' } } },
    ],
  },
  {
    id: 'class.scheduled.core',
    eventTypes: ['class.scheduled'],
    priority: 40,
    actions: [
      { type: 'automationEvent', summary: 'Clase programada y comunicada.', severity: 'info' },
      { type: 'notification', target: { userUid: { path: 'computed.teacherUid' }, role: 'profesor' }, title: 'Clase programada', body: 'Tienes programada la {{computed.classLabel}}.', payload: { classId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'class_reminder', priority: 'normal', key: 'teacher' } },
      { type: 'notification', target: { userUid: { path: 'computed.familyUid' }, role: 'familia' }, title: 'Clase programada', body: 'La clase queda programada: {{computed.classLabel}}.', payload: { classId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'class_reminder', priority: 'normal', key: 'family' } },
      { type: 'audit', action: 'class.scheduled', metadata: { teacherUid: { path: 'computed.teacherUid' }, familyUid: { path: 'computed.familyUid' }, label: { path: 'computed.classLabel' } } },
    ],
  },
  {
    id: 'class.rescheduled.core',
    eventTypes: ['class.rescheduled'],
    priority: 41,
    actions: [
      { type: 'automationEvent', summary: 'Cambio de horario comunicado.', severity: 'info' },
      { type: 'notification', target: { userUid: { path: 'computed.teacherUid' }, role: 'profesor' }, title: 'Clase reprogramada', body: 'Nuevo horario para la {{computed.classLabel}}.', payload: { classId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'class_schedule_change', priority: 'high', key: 'teacher' } },
      { type: 'notification', target: { userUid: { path: 'computed.familyUid' }, role: 'familia' }, title: 'Clase reprogramada', body: 'Nuevo horario para {{computed.classLabel}}.', payload: { classId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'class_schedule_change', priority: 'high', key: 'family' } },
      { type: 'audit', action: 'class.rescheduled', metadata: { teacherUid: { path: 'computed.teacherUid' }, familyUid: { path: 'computed.familyUid' }, label: { path: 'computed.classLabel' } } },
    ],
  },
  {
    id: 'class.participants-required',
    eventTypes: ['class.scheduled', 'class.rescheduled'],
    priority: 42,
    when: { any: [{ path: 'computed.teacherUid', operator: 'empty' }, { path: 'computed.familyUid', operator: 'empty' }] },
    actions: [
      { type: 'crmTask', title: 'Clase sin participantes completos', description: 'La clase no tiene profesor o familia resoluble para notificaciones automaticas.', options: { priority: 'high', tags: ['clase', 'datos_incompletos'], dueAfterMinutes: configNumber('automation.missingClassParticipantReviewMinutes', 60) } },
    ],
  },
  {
    id: 'class.completed.core',
    eventTypes: ['class.completed'],
    priority: 50,
    actions: [
      { type: 'automationEvent', summary: 'Clase finalizada; se disparan confirmacion, pagos y reputacion.', severity: 'info' },
      { type: 'notification', target: { userUid: { path: 'computed.familyUid' }, role: 'familia' }, title: 'Confirma la clase', body: 'Confirma si la {{computed.classLabel}} se realizo correctamente.', payload: { classId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'class_confirmation_needed', priority: 'high', key: 'family' } },
      { type: 'notification', target: { userUid: { path: 'computed.teacherUid' }, role: 'profesor' }, title: 'Clase finalizada', body: 'Revisa y confirma la {{computed.classLabel}} para mantener pagos y reputacion al dia.', payload: { classId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'class_confirmation_needed', priority: 'high', key: 'teacher' } },
      { type: 'systemJob', jobType: 'metrics.snapshot', payload: { source: 'class.completed' }, options: { priority: 'low', key: 'metrics', runAfterMinutes: configNumber('automation.metricsSnapshotDelayMinutes', 5) } },
      { type: 'audit', action: 'class.completed', metadata: { teacherUid: { path: 'computed.teacherUid' }, familyUid: { path: 'computed.familyUid' }, paid: { path: 'computed.classPaid' } } },
    ],
  },
  {
    id: 'class.completed.unpaid-followup',
    eventTypes: ['class.completed'],
    priority: 51,
    when: { path: 'computed.classPaid', operator: 'falsy' },
    actions: [
      { type: 'systemJob', jobType: 'payment.request_for_class', payload: { classId: { path: 'computed.id' }, reason: 'class_completed_unpaid' }, options: { priority: 'high', key: 'payment_request' } },
      { type: 'crmTask', title: 'Seguimiento de pago de clase', description: 'La {{computed.classLabel}} esta finalizada y no consta como pagada.', options: { priority: 'high', tags: ['pagos', 'clase'], dueAfterMinutes: configNumber('automation.unpaidClassFollowupMinutes', 1440) } },
    ],
  },
  {
    id: 'class.confirmation-overdue.core',
    eventTypes: ['class.confirmation_overdue'],
    priority: 60,
    actions: [
      { type: 'automationEvent', summary: 'Clase terminada sin confirmacion de asistencia.', severity: 'warning' },
      { type: 'notification', target: { userUid: { path: 'computed.teacherUid' }, role: 'profesor' }, title: 'Clase pendiente de marcar', body: 'La {{computed.classLabel}} termino y sigue sin cierre completo.', payload: { classId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'class_unmarked_after_1h', priority: 'high', key: 'teacher' } },
      { type: 'notification', target: { userUid: { path: 'computed.familyUid' }, role: 'familia' }, title: 'Confirma si la clase se dio', body: 'La {{computed.classLabel}} termino y necesitamos confirmar si se realizo.', payload: { classId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'class_unmarked_after_1h', priority: 'high', key: 'family' } },
      { type: 'notification', target: { targetRole: 'admin', role: 'admin' }, title: 'Clase sin cerrar', body: 'La {{computed.classLabel}} sigue pendiente de confirmacion.', payload: { classId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'class_unmarked_after_1h', priority: 'high', key: 'admin' } },
      { type: 'patch', collection: 'clases', docId: { path: 'computed.id' }, data: { needsAttendanceConfirmation: true, lifecycleStatus: { firstOf: ['data.lifecycleStatus', { const: 'pendiente_confirmacion' }] }, lastUnmarkedReminderSource: 'platform_automation' } },
      { type: 'crmTask', title: 'Cerrar clase pendiente', description: 'Confirmar asistencia y resolver pago de la {{computed.classLabel}}.', options: { priority: 'high', tags: ['clase', 'confirmacion'], dueAfterMinutes: configNumber('automation.classConfirmationReviewMinutes', 180) } },
      { type: 'audit', action: 'class.confirmation_overdue', metadata: { teacherUid: { path: 'computed.teacherUid' }, familyUid: { path: 'computed.familyUid' } } },
    ],
  },
  {
    id: 'class.cancelled.core',
    eventTypes: ['class.cancelled'],
    priority: 70,
    actions: [
      { type: 'automationEvent', summary: 'Clase cancelada; se comunica y queda trazada.', severity: 'warning' },
      { type: 'notification', target: { userUid: { path: 'computed.teacherUid' }, role: 'profesor' }, title: 'Clase cancelada', body: 'Se ha cancelado la {{computed.classLabel}}.', payload: { classId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'class_schedule_change', priority: 'high', key: 'teacher' } },
      { type: 'notification', target: { userUid: { path: 'computed.familyUid' }, role: 'familia' }, title: 'Clase cancelada', body: 'Se ha cancelado la {{computed.classLabel}}.', payload: { classId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'class_schedule_change', priority: 'high', key: 'family' } },
      { type: 'crmTask', title: 'Revisar cancelacion de clase', description: 'Comprobar si hay que reprogramar, devolver pago o registrar incidencia.', options: { priority: 'normal', tags: ['clase', 'cancelacion'], dueAfterMinutes: configNumber('automation.classCancellationReviewMinutes', 1440) } },
      { type: 'audit', action: 'class.cancelled', metadata: { teacherUid: { path: 'computed.teacherUid' }, familyUid: { path: 'computed.familyUid' } } },
    ],
  },
  {
    id: 'payment.created.core',
    eventTypes: ['payment.created'],
    priority: 80,
    actions: [
      { type: 'automationEvent', summary: 'Pago o solicitud de Bizum registrada.', severity: 'info', payload: { amount: { path: 'computed.paymentAmount' } } },
      { type: 'audit', action: 'payment.created', metadata: { amount: { path: 'computed.paymentAmount' }, payout: { path: 'computed.payout' } } },
    ],
  },
  {
    id: 'payment.created.family',
    eventTypes: ['payment.created'],
    priority: 81,
    when: { path: 'computed.payout', operator: 'falsy' },
    actions: [
      { type: 'notification', target: { targetRole: 'admin', role: 'admin' }, title: 'Pago pendiente', body: 'Pago familiar registrado por {{computed.paymentAmount}}.', payload: { paymentId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'family_payment_pending', priority: 'high', key: 'admin' } },
      { type: 'notification', target: { userUid: { path: 'computed.familyUid' }, role: 'familia' }, title: 'Pago registrado', body: 'Hemos registrado un pago pendiente de validar por {{computed.paymentAmount}}.', payload: { paymentId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'family_payment_pending', priority: 'normal', key: 'family' } },
    ],
  },
  {
    id: 'payment.created.payout',
    eventTypes: ['payment.created'],
    priority: 82,
    when: { path: 'computed.payout', operator: 'truthy' },
    actions: [
      { type: 'notification', target: { targetRole: 'admin', role: 'admin' }, title: 'Bizum de profesor pendiente', body: 'Profesor solicita Bizum por {{computed.paymentAmount}}.', payload: { paymentId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'teacher_payout_pending', priority: 'high', key: 'admin' } },
      { type: 'notification', target: { userUid: { path: 'computed.teacherUid' }, role: 'profesor' }, title: 'Solicitud de Bizum registrada', body: 'Tu solicitud de Bizum por {{computed.paymentAmount}} queda pendiente de revision.', payload: { paymentId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'teacher_payout_pending', priority: 'normal', key: 'teacher' } },
    ],
  },
  {
    id: 'payment.created.needs-class-link',
    eventTypes: ['payment.created'],
    priority: 83,
    when: { path: 'computed.hasClassIds', operator: 'falsy' },
    actions: [
      { type: 'crmTask', title: 'Conciliar pago con clase', description: 'El pago no tiene clases asociadas explicitamente. Revisar conciliacion automatica o manual.', options: { priority: 'high', tags: ['pagos', 'conciliacion'], dueAfterMinutes: configNumber('automation.paymentReconciliationMinutes', 1440) } },
    ],
  },
  {
    id: 'payment.overdue.core',
    eventTypes: ['payment.overdue'],
    priority: 90,
    actions: [
      { type: 'automationEvent', summary: 'Pago vencido detectado automaticamente.', severity: 'warning', payload: { amount: { path: 'computed.paymentAmount' } } },
      { type: 'notification', target: { userUid: { path: 'computed.familyUid' }, role: 'familia' }, title: 'Pago pendiente vencido', body: 'Hay un pago pendiente de {{computed.paymentAmount}}.', payload: { paymentId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'payment_overdue', priority: 'critical', key: 'family' } },
      { type: 'notification', target: { targetRole: 'admin', role: 'admin' }, title: 'Pago vencido', body: 'Revisar pago vencido por {{computed.paymentAmount}}.', payload: { paymentId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'payment_overdue', priority: 'critical', key: 'admin' } },
      { type: 'patch', collection: 'pagos', docId: { path: 'computed.id' }, data: { status: 'vencido', estado: 'vencido', overdueDetectedBy: 'platform_automation' } },
      { type: 'crmTask', title: 'Resolver pago vencido', description: 'Contactar o revisar el pago pendiente por {{computed.paymentAmount}}.', options: { priority: 'critical', tags: ['pagos', 'vencido'], dueAfterMinutes: configNumber('automation.overduePaymentReviewMinutes', 120) } },
      { type: 'opsAlert', alertType: 'payment_overdue', level: 'high', message: 'Pago vencido por {{computed.paymentAmount}}.' },
      { type: 'audit', action: 'payment.overdue', metadata: { amount: { path: 'computed.paymentAmount' } } },
    ],
  },
  {
    id: 'payment.verified.core',
    eventTypes: ['payment.verified'],
    priority: 100,
    actions: [
      { type: 'automationEvent', summary: 'Pago validado; se actualizan metricas y partes implicadas.', severity: 'info', payload: { amount: { path: 'computed.paymentAmount' } } },
      { type: 'notification', target: { userUid: { path: 'computed.familyUid' }, role: 'familia' }, title: 'Pago confirmado', body: 'El pago de {{computed.paymentAmount}} queda confirmado.', payload: { paymentId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'payment_verified', priority: 'normal', key: 'family' } },
      { type: 'notification', when: { path: 'computed.teacherUid', operator: 'not_empty' }, target: { userUid: { path: 'computed.teacherUid' }, role: 'profesor' }, title: 'Pago de clase confirmado', body: 'Se ha confirmado un pago asociado por {{computed.paymentAmount}}.', payload: { paymentId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'payment_verified', priority: 'normal', key: 'teacher' } },
      { type: 'systemJob', jobType: 'metrics.snapshot', payload: { source: 'payment.verified' }, options: { priority: 'low', key: 'metrics', runAfterMinutes: configNumber('automation.metricsSnapshotDelayMinutes', 5) } },
      { type: 'audit', action: 'payment.verified', metadata: { amount: { path: 'computed.paymentAmount' }, verified: { path: 'computed.paymentVerified' } } },
    ],
  },
  {
    id: 'document.created.core',
    eventTypes: ['document.created'],
    priority: 110,
    actions: [
      { type: 'automationEvent', summary: 'Documento pendiente de revision.', severity: 'info' },
      { type: 'notification', target: { targetRole: 'admin', role: 'admin' }, title: 'Documento pendiente de revision', body: '{{computed.documentLabel}} necesita revision.', payload: { documentId: { path: 'computed.id' }, ownerUid: { path: 'computed.ownerUid' }, url: '/pages/login.html' }, options: { type: 'document_review_pending', priority: 'normal', key: 'admin' } },
      { type: 'crmTask', title: 'Revisar documento', description: 'Validar, rechazar o pedir correccion del documento subido.', options: { priority: 'normal', tags: ['documentos', 'verificacion'], dueAfterMinutes: configNumber('automation.documentReviewSlaMinutes', 1440) } },
      { type: 'audit', action: 'document.created', metadata: { ownerUid: { path: 'computed.ownerUid' }, documentType: { firstOf: ['data.tipo', 'data.type'] } } },
    ],
  },
  {
    id: 'document.verified.core',
    eventTypes: ['document.verified'],
    priority: 110,
    actions: [
      { type: 'automationEvent', summary: 'Documento validado; se actualiza confianza y trazabilidad.', severity: 'info' },
      { type: 'notification', target: { userUid: { path: 'computed.ownerUid' }, role: { firstOf: ['data.role', 'data.ownerRole'] } }, title: 'Documento validado', body: '{{computed.documentLabel}} ya esta validado.', payload: { documentId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'document_verified', priority: 'normal', key: 'owner' } },
      { type: 'automationEvent', eventType: 'trust.recalculation_requested', summary: 'Recalculo de reputacion solicitado por documento validado.', severity: 'info', payload: { profileId: { path: 'computed.ownerUid' }, userType: { firstOf: ['data.ownerCollection', 'data.userType', 'data.role'] } } },
      { type: 'audit', action: 'document.verified', metadata: { ownerUid: { path: 'computed.ownerUid' }, documentType: { firstOf: ['data.tipo', 'data.type', 'data.documentType'] } } },
    ],
  },
  {
    id: 'document.rejected.core',
    eventTypes: ['document.rejected'],
    priority: 110,
    actions: [
      { type: 'automationEvent', summary: 'Documento rechazado o requiere correccion.', severity: 'warning' },
      { type: 'notification', target: { userUid: { path: 'computed.ownerUid' }, role: { firstOf: ['data.role', 'data.ownerRole'] } }, title: 'Documento requiere correccion', body: '{{computed.documentLabel}} no ha podido validarse. Revisa la observacion y sube una version correcta.', payload: { documentId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'document_rejected', priority: 'high', key: 'owner' } },
      { type: 'notification', target: { targetRole: 'admin', role: 'admin' }, title: 'Documento rechazado', body: '{{computed.documentLabel}} queda pendiente de nueva version.', payload: { documentId: { path: 'computed.id' }, ownerUid: { path: 'computed.ownerUid' }, url: '/pages/login.html' }, options: { type: 'document_rejected', priority: 'normal', key: 'admin' } },
      { type: 'crmTask', title: 'Seguimiento de documento rechazado', description: 'Comprobar que el usuario sube una version valida y cerrar la verificacion.', options: { priority: 'normal', tags: ['documentos', 'correccion'], dueAfterMinutes: configNumber('automation.rejectedDocumentFollowUpMinutes', 2880) } },
      { type: 'audit', action: 'document.rejected', metadata: { ownerUid: { path: 'computed.ownerUid' }, documentType: { firstOf: ['data.tipo', 'data.type', 'data.documentType'] } } },
    ],
  },
  {
    id: 'document.expiring_soon.core',
    eventTypes: ['document.expiring_soon'],
    priority: 111,
    actions: [
      { type: 'automationEvent', summary: 'Documento validado proximo a caducar.', severity: 'warning', payload: { daysToExpiry: { path: 'computed.documentDaysToExpiry' } } },
      { type: 'notification', target: { userUid: { path: 'computed.ownerUid' }, role: { firstOf: ['data.role', 'data.ownerRole'] } }, title: 'Documento próximo a caducar', body: '{{computed.documentLabel}} caduca pronto. Sube una version actualizada para mantener tu verificacion.', payload: { documentId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'document_expiring_soon', priority: 'high', key: 'owner' } },
      { type: 'notification', target: { targetRole: 'admin', role: 'admin' }, title: 'Documento próximo a caducar', body: '{{computed.documentLabel}} caduca en {{computed.documentDaysToExpiry}} dias.', payload: { documentId: { path: 'computed.id' }, ownerUid: { path: 'computed.ownerUid' }, url: '/pages/login.html' }, options: { type: 'document_expiring_soon', priority: 'normal', key: 'admin' } },
      { type: 'crmTask', title: 'Seguimiento de documento próximo a caducar', description: 'Contactar si el usuario no sube una version actualizada.', options: { priority: 'normal', tags: ['documentos', 'caducidad'], dueAfterMinutes: configNumber('automation.documentExpiryFollowUpMinutes', 10080) } },
      { type: 'audit', action: 'document.expiring_soon', metadata: { ownerUid: { path: 'computed.ownerUid' }, daysToExpiry: { path: 'computed.documentDaysToExpiry' } } },
    ],
  },
  {
    id: 'document.expired.core',
    eventTypes: ['document.expired'],
    priority: 112,
    actions: [
      { type: 'automationEvent', summary: 'Documento caducado; confianza y verificacion deben actualizarse.', severity: 'warning', payload: { documentType: { firstOf: ['data.tipo', 'data.documentType'] } } },
      { type: 'notification', target: { userUid: { path: 'computed.ownerUid' }, role: { firstOf: ['data.role', 'data.ownerRole'] } }, title: 'Documento caducado', body: '{{computed.documentLabel}} ha caducado. Sube una version nueva para recuperar la verificacion.', payload: { documentId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'document_expired', priority: 'critical', key: 'owner' } },
      { type: 'notification', target: { targetRole: 'admin', role: 'admin' }, title: 'Documento caducado', body: '{{computed.documentLabel}} requiere sustitucion o revision.', payload: { documentId: { path: 'computed.id' }, ownerUid: { path: 'computed.ownerUid' }, url: '/pages/login.html' }, options: { type: 'document_expired', priority: 'high', key: 'admin' } },
      { type: 'patch', collection: 'documentos', docId: { path: 'computed.id' }, data: { status: 'caducado', estado: 'caducado', verificationStatus: 'caducado', expiredDetectedBy: 'platform_automation' } },
      { type: 'crmTask', title: 'Resolver documento caducado', description: 'Pedir nueva version, verificarla y actualizar el perfil/reputacion.', options: { priority: 'high', tags: ['documentos', 'caducado'], dueAfterMinutes: configNumber('automation.expiredDocumentReviewMinutes', 1440) } },
      { type: 'opsAlert', alertType: 'document_expired', level: 'medium', message: 'Documento verificado caducado.' },
      { type: 'audit', action: 'document.expired', metadata: { ownerUid: { path: 'computed.ownerUid' }, documentType: { firstOf: ['data.tipo', 'data.documentType'] } } },
    ],
  },
  {
    id: 'document.stale.core',
    eventTypes: ['document.stale'],
    priority: 111,
    actions: [
      { type: 'automationEvent', summary: 'Documento pendiente demasiado tiempo.', severity: 'warning' },
      { type: 'notification', target: { targetRole: 'admin', role: 'admin' }, title: 'Documento atascado', body: '{{computed.documentLabel}} necesita revision.', payload: { documentId: { path: 'computed.id' }, ownerUid: { path: 'computed.ownerUid' }, url: '/pages/login.html' }, options: { type: 'document_review_pending', priority: 'high', key: 'admin' } },
      { type: 'crmTask', title: 'Resolver documento pendiente', description: 'Validar, rechazar o pedir correccion del documento subido.', options: { priority: 'high', tags: ['documentos', 'verificacion'], dueAfterMinutes: configNumber('automation.staleDocumentReviewMinutes', 120) } },
      { type: 'opsAlert', alertType: 'document_review_stale', level: 'medium', message: 'Documento pendiente de revision por demasiado tiempo.' },
      { type: 'audit', action: 'document.stale_detected', metadata: { ownerUid: { path: 'computed.ownerUid' }, documentType: { firstOf: ['data.tipo', 'data.type'] } } },
    ],
  },
  {
    id: 'incident.created.core',
    eventTypes: ['incident.created'],
    priority: 120,
    actions: [
      { type: 'automationEvent', summary: 'Incidencia registrada.', severity: { path: 'computed.incidentSeverity' } },
      { type: 'notification', target: { targetRole: 'admin', role: 'admin' }, title: 'Nueva incidencia', body: '{{computed.incidentLabel}}', payload: { incidentId: { path: 'computed.id' }, classId: { firstOf: ['data.classId', 'data.clase_id'] }, url: '/pages/login.html' }, options: { type: 'class_incident', priority: { path: 'computed.incidentNotificationPriority' }, key: 'admin' } },
      { type: 'crmTask', title: 'Gestionar incidencia', description: 'Clasificar, contactar a las partes y cerrar con resultado trazado.', options: { priority: { path: 'computed.incidentTaskPriority' }, tags: ['incidencias'], dueAfterMinutes: { path: 'computed.incidentDueMinutes' } } },
      { type: 'opsAlert', when: { path: 'computed.incidentCritical', operator: 'truthy' }, alertType: 'incident_attention_required', level: 'medium', message: 'Incidencia requiere atencion administrativa.' },
      { type: 'audit', action: 'incident.created', metadata: { priority: { path: 'computed.incidentPriority' } } },
    ],
  },
  {
    id: 'incident.stale.core',
    eventTypes: ['incident.stale'],
    priority: 121,
    actions: [
      { type: 'automationEvent', summary: 'Incidencia abierta sin resolver.', severity: 'warning' },
      { type: 'notification', target: { targetRole: 'admin', role: 'admin' }, title: 'Incidencia atascada', body: '{{computed.incidentLabel}}', payload: { incidentId: { path: 'computed.id' }, classId: { firstOf: ['data.classId', 'data.clase_id'] }, url: '/pages/login.html' }, options: { type: 'class_incident', priority: 'critical', key: 'admin' } },
      { type: 'crmTask', title: 'Resolver incidencia atascada', description: 'Clasificar, contactar a las partes y cerrar con resultado trazado.', options: { priority: 'critical', tags: ['incidencias'], dueAfterMinutes: configNumber('automation.staleIncidentReviewMinutes', 60) } },
      { type: 'opsAlert', alertType: 'incident_attention_required', level: 'high', message: 'Incidencia requiere atencion administrativa.' },
      { type: 'audit', action: 'incident.stale_detected', metadata: { priority: { path: 'computed.incidentPriority' } } },
    ],
  },
  {
    id: 'incident.resolved.core',
    eventTypes: ['incident.resolved'],
    priority: 122,
    actions: [
      { type: 'automationEvent', summary: 'Incidencia resuelta y archivada para analitica operacional.', severity: 'info' },
      { type: 'notification', target: { targetRole: 'admin', role: 'admin' }, title: 'Incidencia resuelta', body: '{{computed.incidentLabel}}', payload: { incidentId: { path: 'computed.id' }, classId: { firstOf: ['data.classId', 'data.clase_id'] }, url: '/pages/login.html' }, options: { type: 'incident_resolved', priority: 'normal', key: 'admin' } },
      { type: 'systemJob', jobType: 'metrics.snapshot', payload: { source: 'incident.resolved' }, options: { priority: 'low', key: 'metrics', runAfterMinutes: configNumber('automation.metricsSnapshotDelayMinutes', 5) } },
      { type: 'audit', action: 'incident.resolved', metadata: { priority: { path: 'computed.incidentPriority' }, resolution: { firstOf: ['data.resolution', 'data.resolucion'] } } },
    ],
  },
  {
    id: 'profile.updated.core',
    eventTypes: ['profile.updated'],
    priority: 130,
    actions: [
      { type: 'automationEvent', summary: 'Perfil actualizado; se solicita revision y recalculo reputacional.', severity: 'info', payload: { userType: { path: 'computed.userType' } } },
      { type: 'notification', target: { targetRole: 'admin', role: 'admin' }, title: 'Perfil actualizado', body: '{{computed.userLabel}} modifico datos relevantes del perfil.', payload: { profileId: { path: 'computed.id' }, userType: { path: 'computed.userType' }, url: '/pages/login.html' }, options: { type: { path: 'computed.profileNotificationType' }, priority: { path: 'computed.profileNotificationPriority' }, key: 'admin' } },
      { type: 'automationEvent', eventType: 'trust.recalculation_requested', summary: 'Recalculo de reputacion solicitado por cambio de perfil.', severity: 'info', payload: { profileId: { path: 'computed.id' }, userType: { path: 'computed.userType' } } },
      { type: 'audit', action: 'profile.updated', metadata: { userType: { path: 'computed.userType' }, verificationStatus: { path: 'computed.profileStatus' } } },
    ],
  },
  {
    id: 'profile.updated.pending-verification',
    eventTypes: ['profile.updated'],
    priority: 131,
    when: { path: 'computed.profileStatus', operator: 'eq', value: 'pendiente' },
    actions: [
      { type: 'crmTask', title: 'Verificar perfil actualizado', description: 'Revisar cambios, documentos y nivel de confianza antes de destacarlo.', options: { priority: 'high', tags: ['perfil', 'verificacion'], dueAfterMinutes: configNumber('automation.profileVerificationReviewMinutes', 1440) } },
    ],
  },
  {
    id: 'teacher.inactive.core',
    eventTypes: ['teacher.inactive'],
    priority: 140,
    actions: [
      { type: 'automationEvent', summary: 'Profesor activo sin actividad reciente.', severity: 'warning' },
      { type: 'notification', target: { targetRole: 'admin', role: 'admin' }, title: 'Profesor sin actividad reciente', body: '{{computed.person}} lleva tiempo sin actividad o alumnos nuevos.', payload: { teacherId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'profile_updated', priority: 'normal', key: 'admin' } },
      { type: 'crmTask', title: 'Reactivar profesor', description: 'Comprobar disponibilidad, actualizar perfil o pausar visibilidad si no responde.', options: { priority: 'normal', tags: ['profesores', 'reactivacion'], dueAfterMinutes: configNumber('automation.teacherReactivationMinutes', 10080) } },
      { type: 'audit', action: 'teacher.inactive_detected', metadata: { lastActivityAt: { firstOf: ['data.lastActivityAt', 'data.updatedAt'] } } },
    ],
  },
  {
    id: 'user.registered.core',
    eventTypes: ['user.registered'],
    priority: 150,
    actions: [
      { type: 'automationEvent', summary: 'Usuario registrado y enviado a seguimiento operativo.', severity: 'info', payload: { role: { firstOf: ['data.role', 'data.rol'] } } },
      { type: 'notification', target: { targetRole: 'admin', role: 'admin' }, title: 'Nuevo usuario registrado', body: '{{computed.person}} se ha registrado como {{computed.userType}}.', payload: { userId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'user_registered', priority: 'normal', key: 'admin' } },
      { type: 'systemJob', jobType: 'metrics.snapshot', payload: { source: 'user.registered' }, options: { priority: 'low', key: 'metrics', runAfterMinutes: configNumber('automation.metricsSnapshotDelayMinutes', 5) } },
      { type: 'audit', action: 'user.registered', metadata: { role: { firstOf: ['data.role', 'data.rol'] } } },
    ],
  },
  {
    id: 'teacher.verified.core',
    eventTypes: ['teacher.verified'],
    priority: 160,
    actions: [
      { type: 'automationEvent', summary: 'Profesor verificado; reputacion y metricas deben actualizarse.', severity: 'info' },
      { type: 'notification', target: { userUid: { path: 'computed.teacherUid' }, role: 'profesor' }, title: 'Perfil verificado', body: 'Tu perfil de profesor ya esta verificado.', payload: { teacherId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'teacher_verified', priority: 'normal', key: 'teacher' } },
      { type: 'notification', target: { targetRole: 'admin', role: 'admin' }, title: 'Profesor verificado', body: '{{computed.person}} ya puede recibir asignaciones con confianza alta.', payload: { teacherId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'teacher_verified', priority: 'normal', key: 'admin' } },
      { type: 'automationEvent', eventType: 'trust.recalculation_requested', summary: 'Recalculo de reputacion solicitado por verificacion de profesor.', severity: 'info', payload: { profileId: { path: 'computed.id' }, userType: 'profesores' } },
      { type: 'systemJob', jobType: 'metrics.snapshot', payload: { source: 'teacher.verified' }, options: { priority: 'low', key: 'metrics', runAfterMinutes: configNumber('automation.metricsSnapshotDelayMinutes', 5) } },
      { type: 'audit', action: 'teacher.verified', metadata: { teacherUid: { path: 'computed.teacherUid' } } },
    ],
  },
  {
    id: 'message.received.core',
    eventTypes: ['message.received'],
    priority: 170,
    actions: [
      { type: 'automationEvent', summary: 'Mensaje recibido y canalizado a notificacion interna.', severity: 'info' },
      { type: 'notification', target: { userUid: { firstOf: ['data.recipientUid', 'data.toUid', 'data.userUid'] }, role: { firstOf: ['data.recipientRole', 'data.role'] } }, title: 'Nuevo mensaje de {{data.senderName}}', body: '{{computed.messagePreview}}', payload: { chatId: { firstOf: ['data.chatId', 'data.threadId', 'data.id'] }, messageId: { path: 'data.messageId' }, url: '/pages/login.html' }, options: { type: 'chat_message', priority: 'normal', key: 'recipient' } },
      { type: 'audit', action: 'message.received', metadata: { chatId: { firstOf: ['data.chatId', 'data.threadId'] } } },
    ],
  },
  {
    id: 'schedule.proposed.core',
    eventTypes: ['schedule.proposed'],
    priority: 171,
    actions: [
      { type: 'automationEvent', summary: 'Horario propuesto desde chat.', severity: 'info' },
      { type: 'notification', target: { userUid: { firstOf: ['data.recipientUid', 'data.toUid'] }, role: { firstOf: ['data.recipientRole', 'data.role'] } }, title: 'Horario propuesto', body: '{{computed.scheduleLabel}}. Puedes aceptarlo desde el chat.', payload: { chatId: { path: 'data.chatId' }, proposalId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'schedule_proposed', priority: 'high', key: 'recipient' } },
      { type: 'crmTask', title: 'Horario pendiente de respuesta', description: 'Hay una propuesta de clase esperando aceptacion o alternativa.', options: { priority: 'normal', tags: ['chat', 'calendario'], dueAfterMinutes: configNumber('automation.scheduleProposalFollowUpMinutes', 1440) } },
      { type: 'audit', action: 'schedule.proposed', metadata: { chatId: { path: 'data.chatId' }, proposedByUid: { firstOf: ['data.proposedByUid', 'data.createdByUid'] }, label: { path: 'computed.scheduleLabel' } } },
    ],
  },
  {
    id: 'schedule.accepted.core',
    eventTypes: ['schedule.accepted'],
    priority: 172,
    actions: [
      { type: 'automationEvent', summary: 'Horario aceptado; clase y calendario deben quedar sincronizados.', severity: 'info' },
      { type: 'notification', target: { userUid: { firstOf: ['data.proposedByUid', 'data.createdByUid'] }, role: { firstOf: ['data.proposedByRole', 'data.role'] } }, title: 'Horario aceptado', body: '{{computed.scheduleLabel}} queda aceptado.', payload: { chatId: { path: 'data.chatId' }, proposalId: { path: 'computed.id' }, classId: { firstOf: ['data.classId', 'data.clase_id'] }, url: '/pages/login.html' }, options: { type: 'schedule_accepted', priority: 'normal', key: 'proposer' } },
      { type: 'notification', target: { targetRole: 'admin', role: 'admin' }, title: 'Clase coordinada', body: 'Horario aceptado: {{computed.scheduleLabel}}.', payload: { chatId: { path: 'data.chatId' }, proposalId: { path: 'computed.id' }, classId: { firstOf: ['data.classId', 'data.clase_id'] }, url: '/pages/login.html' }, options: { type: 'schedule_accepted', priority: 'normal', key: 'admin' } },
      { type: 'audit', action: 'schedule.accepted', metadata: { chatId: { path: 'data.chatId' }, classId: { firstOf: ['data.classId', 'data.clase_id'] }, label: { path: 'computed.scheduleLabel' } } },
    ],
  },
  {
    id: 'schedule.rejected.core',
    eventTypes: ['schedule.rejected'],
    priority: 173,
    actions: [
      { type: 'automationEvent', summary: 'Horario rechazado; vuelve a quedar pendiente de propuesta.', severity: 'warning' },
      { type: 'notification', target: { userUid: { firstOf: ['data.proposedByUid', 'data.createdByUid'] }, role: { firstOf: ['data.proposedByRole', 'data.role'] } }, title: 'Horario rechazado', body: '{{computed.scheduleLabel}} se ha rechazado. Propón otra alternativa desde el chat.', payload: { chatId: { path: 'data.chatId' }, proposalId: { path: 'computed.id' }, url: '/pages/login.html' }, options: { type: 'schedule_rejected', priority: 'high', key: 'proposer' } },
      { type: 'crmTask', title: 'Recoordinar horario', description: 'Una propuesta de horario ha sido rechazada. Si no hay nueva propuesta, intervenir.', options: { priority: 'normal', tags: ['chat', 'calendario'], dueAfterMinutes: configNumber('automation.rejectedScheduleFollowUpMinutes', 1440) } },
      { type: 'audit', action: 'schedule.rejected', metadata: { chatId: { path: 'data.chatId' }, label: { path: 'computed.scheduleLabel' } } },
    ],
  },
  {
    id: 'review.created.core',
    eventTypes: ['review.created'],
    priority: 180,
    actions: [
      { type: 'automationEvent', summary: 'Valoracion registrada; se recalcula reputacion.', severity: 'info' },
      { type: 'automationEvent', eventType: 'trust.recalculation_requested', summary: 'Recalculo de reputacion solicitado por nueva valoracion.', severity: 'info', payload: { profileId: { firstOf: ['data.teacherUid', 'data.profesor_id', 'data.reviewedUid'] }, userType: 'profesores' } },
      { type: 'systemJob', jobType: 'metrics.snapshot', payload: { source: 'review.created' }, options: { priority: 'low', key: 'metrics', runAfterMinutes: configNumber('automation.metricsSnapshotDelayMinutes', 5) } },
      { type: 'audit', action: 'review.created', metadata: { rating: { firstOf: ['data.rating', 'data.valoracion'] } } },
    ],
  },
  {
    id: 'automation.fallback',
    eventTypes: ['*'],
    priority: 10000,
    fallback: true,
    actions: [
      { type: 'automationEvent', summary: 'Evento {{event.type}} registrado sin reglas especificas.', severity: 'info' },
      { type: 'audit', action: 'automation.event_recorded', metadata: { sourceEventType: { path: 'event.type' } } },
    ],
  },
];

function buildRuleContext(normalizedEvent, config = {}) {
  const data = normalizedEvent.data || {};
  const userType = clean(data.userType || normalizedEvent.entityType, 40);
  const profileStatus = lower(data.verificationStatus || data.estado_verificacion || data.status || data.estado);
  const incidentPriority = lower(data.prioridad || data.priorityLabel || data.priority || '');
  const incidentCritical = ['critical', 'critica', 'urgente', 'alta', 'high', '1', '2'].includes(incidentPriority);
  const incidentDueMinutes = incidentPriority === 'urgente' || incidentPriority === 'critical'
    ? configDirectNumber(config, 'incidents.urgentSlaHours', 2) * 60
    : incidentPriority === 'alta' || incidentPriority === 'high'
      ? configDirectNumber(config, 'incidents.highSlaHours', 12) * 60
      : incidentPriority === 'baja' || incidentPriority === 'low'
        ? configDirectNumber(config, 'incidents.lowSlaHours', 48) * 60
        : configDirectNumber(config, 'incidents.mediumSlaHours', 24) * 60;
  const teacherUid = userUid(data, ['teacherUserUid', 'teacherUid', 'profesor_id', 'userUid', 'usuario_id']);
  const familyUid = userUid(data, ['familyUserUid', 'familyUid', 'familia_id', 'userUid', 'usuario_id']);
  return {
    event: normalizedEvent,
    data,
    config: config || {},
    computed: {
      id: dataId(normalizedEvent),
      subject: subjectLabel(data),
      subjectMissing: !firstPresent(data, ['materia', 'subject']),
      locationMissing: !firstPresent(data, ['zona', 'city', 'ciudad']),
      person: personLabel(data, 'Una familia'),
      classLabel: classLabel(data),
      paymentAmount: paymentAmountLabel(data),
      paymentVerified: isVerifiedPaymentStatus(data),
      payout: isTeacherPayout(data),
      hasClassIds: Array.isArray(data.classIds) && data.classIds.length > 0,
      classPaid: classHasPaidStatus(data),
      teacherUid,
      familyUid,
      ownerUid: firstPresent(data, ['ownerUid', 'userUid', 'usuario_id']),
      documentLabel: firstPresent(data, ['nombre', 'tipo', 'type']) || 'Documento',
      documentDaysToExpiry: firstPresent(data, ['daysToExpiry', 'dias_caducidad']) || '',
      scheduleLabel: scheduleLabel(data),
      userType,
      userLabel: personLabel(data, userType === 'profesores' ? 'Profesor' : 'Familia'),
      profileStatus,
      profileNotificationType: profileStatus === 'pendiente' ? 'verification_pending' : 'profile_updated',
      profileNotificationPriority: profileStatus === 'pendiente' ? 'high' : 'normal',
      incidentPriority,
      incidentCritical,
      incidentSeverity: incidentCritical ? 'warning' : 'info',
      incidentNotificationPriority: incidentCritical ? 'critical' : 'high',
      incidentTaskPriority: incidentCritical ? 'critical' : 'high',
      incidentDueMinutes,
      incidentLabel: clean(data.titulo || data.title || data.descripcion || data.description || 'Incidencia pendiente de revision.', 240),
      messagePreview: clean(data.preview || data.text || data.message || data.body || 'Tienes un nuevo mensaje.', 240),
    },
  };
}

function buildActionHandlers(plan) {
  return {
    automationEvent(action, { event }) {
      const eventForAction = action.eventType ? { ...event, type: action.eventType } : event;
      addAutomationEvent(plan, eventForAction, action.summary, action.severity || 'info', action.payload || {});
    },
    notification(action, { event }) {
      addNotification(plan, event, action.target || {}, action.title, action.body, action.payload || {}, action.options || {});
    },
    systemJob(action, { event }) {
      addSystemJob(plan, event, action.jobType || action.typeName, action.payload || {}, action.options || {});
    },
    audit(action, { event }) {
      addAudit(plan, event, action.action, action.metadata || {}, action.actorUid || 'system');
    },
    crmTask(action, { event }) {
      addCrmTask(plan, event, action.title, action.description, action.options || {});
    },
    opsAlert(action, { event }) {
      addOpsAlert(plan, event, action.alertType || action.typeName, action.level || 'medium', action.message, action.options || {});
    },
    patch(action, { event }) {
      addPatch(plan, event, action.collection, action.docId, action.data, action.options || {});
    },
  };
}

function buildAutomationPlan(event, options = {}) {
  const normalizedEvent = {
    ...event,
    type: clean(event.type, 120),
    entityType: clean(event.entityType, 80),
    entityId: dataId(event),
    data: event.data || {},
  };
  const plan = createPlan(normalizedEvent);
  const context = buildRuleContext(normalizedEvent, options.config || options.platformConfig || {});
  const rules = mergeRuleSets(
    options.replaceDefaultRules ? [] : DEFAULT_AUTOMATION_RULES,
    options.rules || options.externalRules || [],
  );
  const matches = applyAutomationRules({
    event: normalizedEvent,
    context,
    plan,
    rules,
    handlers: buildActionHandlers(plan),
  });

  plan.ruleRuns.push(...matches.map((match) => ({
    ...match,
    engineVersion: RULE_ENGINE_VERSION,
    orchestrationVersion: AUTOMATION_ORCHESTRATION_VERSION,
  })));
  return finalizePlan(plan);
}

module.exports = {
  AUTOMATION_ORCHESTRATION_VERSION,
  DEFAULT_AUTOMATION_RULES,
  EVENT_CATALOG,
  RULE_ENGINE_VERSION,
  buildAutomationPlan,
};
