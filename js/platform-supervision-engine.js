export const PLATFORM_SUPERVISION_VERSION = 'platform-supervision-2026-07-01-consistency';

const CLOSED_STATUSES = new Set(['cerrada', 'cerrado', 'resuelta', 'resolved', 'done', 'completada', 'archivada', 'archived', 'cancelada', 'cancelled', 'rechazada', 'rejected']);
const ACTIVE_STATUSES = new Set(['', 'active', 'activa', 'open', 'abierta', 'pendiente', 'pending', 'en_proceso', 'revision', 'asignada', 'assigned']);
const ASSIGNED_REQUEST_STATUSES = new Set(['asignada', 'assigned', 'aceptada', 'accepted', 'profesor_asignado', 'teacher_assigned']);
const COMPLETED_CLASS_STATUSES = new Set(['realizada', 'completed', 'completada', 'finalizada', 'done']);
const SCHEDULED_CLASS_STATUSES = new Set(['programada', 'scheduled', 'confirmada', 'confirmed', 'pendiente', 'pending']);
const PAID_STATUSES = new Set(['pagado', 'paid', 'validado', 'validated', 'succeeded', 'cobrado', 'liquidado']);
const PAYMENT_OPEN_STATUSES = new Set(['pendiente', 'pending', 'open', 'abierta', 'solicitado', 'requested', 'en_revision', 'needs_review', 'vencido', 'overdue']);
const CLASS_OPERATIONAL_STATUSES = new Set(['pendiente', 'confirmada', 'realizada', 'cancelada', 'reprogramada', 'pagada']);
const CLASS_OPERATIONAL_ALIASES = Object.freeze({
  scheduled: 'confirmada',
  programada: 'confirmada',
  confirmed: 'confirmada',
  completed: 'realizada',
  completada: 'realizada',
  finalizada: 'realizada',
  done: 'realizada',
  dada: 'realizada',
  paid: 'pagada',
  validado: 'pagada',
  validated: 'pagada',
  cancelled: 'cancelada',
  canceled: 'cancelada',
});
const CLASS_LIFECYCLE_STATES = new Set([
  'solicitud_enviada',
  'solicitud_aceptada',
  'clase_programada',
  'clase_proxima',
  'recordatorio_enviado',
  'clase_iniciada',
  'clase_finalizada',
  'pendiente_confirmacion',
  'pendiente_pago',
  'pago_en_revision',
  'pago_recibido',
  'comision_liquidada',
  'valoracion_pendiente',
  'clase_archivada',
  'cancelada',
  'reprogramada',
  'incidencia_abierta',
]);
const CLASS_LIFECYCLE_ALIASES = Object.freeze({
  nueva: 'solicitud_enviada',
  new: 'solicitud_enviada',
  asignada: 'solicitud_aceptada',
  assigned: 'solicitud_aceptada',
  pendiente: 'clase_programada',
  confirmada: 'clase_programada',
  programada: 'clase_programada',
  scheduled: 'clase_programada',
  proxima: 'clase_proxima',
  upcoming: 'clase_proxima',
  started: 'clase_iniciada',
  iniciada: 'clase_iniciada',
  finished: 'clase_finalizada',
  finalizada: 'clase_finalizada',
  realizada: 'pendiente_confirmacion',
  completada: 'pendiente_confirmacion',
  completed: 'pendiente_confirmacion',
  pagada: 'pago_recibido',
  pagado: 'pago_recibido',
  paid: 'pago_recibido',
  en_revision: 'pago_en_revision',
  revision: 'pago_en_revision',
  in_review: 'pago_en_revision',
  validado: 'pago_recibido',
  validated: 'pago_recibido',
  archived: 'clase_archivada',
  archivada: 'clase_archivada',
});
const PAYMENT_STATUSES = new Set(['pendiente', 'solicitado', 'procesando', 'requiere_accion', 'validado', 'pagado', 'vencido', 'rechazado', 'fallido', 'devuelto', 'disputado', 'cancelado']);
const PAYMENT_STATUS_ALIASES = Object.freeze({
  pending: 'pendiente',
  requested: 'solicitado',
  processing: 'procesando',
  requires_action: 'requiere_accion',
  requires_payment_method: 'requiere_accion',
  validated: 'validado',
  validada: 'validado',
  paid: 'pagado',
  succeeded: 'pagado',
  captured: 'pagado',
  overdue: 'vencido',
  expired: 'vencido',
  rejected: 'rechazado',
  failed: 'fallido',
  refunded: 'devuelto',
  cancelled: 'cancelado',
  canceled: 'cancelado',
});
const INCIDENT_STATUSES = new Set(['abierta', 'en_proceso', 'esperando_usuario', 'resuelta', 'cerrada']);
const INCIDENT_STATUS_ALIASES = Object.freeze({
  open: 'abierta',
  pendiente: 'abierta',
  nueva: 'abierta',
  nuevo: 'abierta',
  in_progress: 'en_proceso',
  progreso: 'en_proceso',
  waiting: 'esperando_usuario',
  waiting_user: 'esperando_usuario',
  resolved: 'resuelta',
  solucionada: 'resuelta',
  solucionado: 'resuelta',
  closed: 'cerrada',
  archived: 'cerrada',
  archivada: 'cerrada',
});
const USER_ROLE_ALIASES = Object.freeze({
  teacher: 'profesor',
  profesor: 'profesor',
  profe: 'profesor',
  family: 'familia',
  familia: 'familia',
  padre: 'familia',
  madre: 'familia',
  admin: 'admin',
  administrador: 'admin',
});

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function lower(value) {
  return clean(value).toLowerCase();
}

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && clean(value) !== '');
}

function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item)).filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return clean(value)
    .split(/[,;/|]+/)
    .map((item) => clean(item))
    .filter(Boolean);
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(value) {
  const date = toDate(value);
  return date ? date.toISOString() : '';
}

function hoursSince(value, now) {
  const date = toDate(value);
  if (!date) return 0;
  return Math.max(0, (now.getTime() - date.getTime()) / 36e5);
}

function statusOf(item = {}) {
  return lower(first(item.status, item.estado, item.lifecycleStatus, item.matchStatus, item.estado_verificacion, item.verificationStatus));
}

function priorityRank(severity) {
  return {
    critical: 1,
    high: 2,
    medium: 3,
    low: 4,
  }[severity] || 4;
}

function toneScore(severity) {
  return {
    critical: 96,
    high: 86,
    medium: 68,
    low: 42,
  }[severity] || 42;
}

function entityId(item = {}, keys = []) {
  return clean(first(...keys.map((key) => item[key]), item.id, item.uid, item.refId), 220);
}

function userId(item = {}) {
  return clean(first(item.userUid, item.uid, item.id, item.usuario_id, item.ownerUid, item.familyUid, item.teacherUid), 220);
}

function familyUid(item = {}) {
  return clean(first(item.familyUid, item.familia_id, item.parentUid, item.parentId, item.userUid), 220);
}

function teacherUid(item = {}) {
  return clean(first(item.teacherUid, item.profesor_id, item.profesorUid, item.userUid), 220);
}

function studentId(item = {}) {
  return clean(first(item.studentId, item.alumno_id, item.alumnoUid, item.childId), 220);
}

function requestId(item = {}) {
  return clean(first(item.requestId, item.solicitud_id, item.solicitudId, item.id), 220);
}

function assignmentId(item = {}) {
  return clean(first(item.assignmentId, item.asignacion_id, item.id), 220);
}

function classId(item = {}) {
  return clean(first(item.classId, item.clase_id, item.id), 220);
}

function paymentId(item = {}) {
  return clean(first(item.paymentId, item.pago_id, item.id), 220);
}

function amountOf(item = {}) {
  return asNumber(first(item.amount, item.monto, item.total, item.precio_total, item.familyAmount, item.totalFamilia));
}

function paymentStatus(item = {}) {
  return normalizedPaymentStatusValue(first(item.status, item.estado, item.paymentStatus, item.familyPaymentStatus, item.reconciliationStatus));
}

function normalizeWithAliases(value, aliases = {}, allowed = null) {
  const raw = lower(value);
  if (!raw) return '';
  const normalized = aliases[raw] || raw;
  if (!allowed) return normalized;
  return allowed.has(normalized) ? normalized : raw;
}

function rawClassStatus(item = {}) {
  return lower(first(item.status, item.estado));
}

function normalizedClassStatus(item = {}) {
  return normalizeWithAliases(rawClassStatus(item), CLASS_OPERATIONAL_ALIASES, CLASS_OPERATIONAL_STATUSES);
}

function rawClassLifecycleStatus(item = {}) {
  return lower(first(item.lifecycleStatus, item.lifecycleState));
}

function normalizedClassLifecycleStatus(item = {}) {
  return normalizeWithAliases(rawClassLifecycleStatus(item), CLASS_LIFECYCLE_ALIASES, CLASS_LIFECYCLE_STATES);
}

function normalizedPaymentStatusValue(value) {
  return normalizeWithAliases(value, PAYMENT_STATUS_ALIASES, PAYMENT_STATUSES);
}

function normalizedIncidentStatusValue(item = {}) {
  return normalizeWithAliases(first(item.status, item.estado), INCIDENT_STATUS_ALIASES, INCIDENT_STATUSES);
}

function normalizedUserRole(item = {}) {
  return normalizeWithAliases(first(item.role, item.rol, item.tipo), USER_ROLE_ALIASES);
}

function isFamilyPaymentRecord(payment = {}) {
  const type = lower(first(payment.paymentType, payment.tipo, payment.type));
  return !['teacher_payout', 'pago_profesor', 'refund', 'adjustment'].includes(type);
}

function participantUidSet(chat = {}) {
  return new Set(asArray(first(chat.participantUids, chat.participants, chat.usuarios, chat.miembros)));
}

function lifecycleCompatibleWithClassStatus(status, lifecycle) {
  if (!status || !lifecycle) return true;
  if (status === 'cancelada') return ['cancelada', 'incidencia_abierta'].includes(lifecycle);
  if (status === 'reprogramada') return ['reprogramada', 'clase_programada', 'clase_proxima', 'recordatorio_enviado', 'incidencia_abierta'].includes(lifecycle);
  if (status === 'pagada') return ['pago_recibido', 'comision_liquidada', 'valoracion_pendiente', 'clase_archivada', 'incidencia_abierta'].includes(lifecycle);
  if (status === 'realizada') return [
    'pendiente_confirmacion',
    'pendiente_pago',
    'pago_en_revision',
    'pago_recibido',
    'comision_liquidada',
    'valoracion_pendiente',
    'clase_archivada',
    'incidencia_abierta',
  ].includes(lifecycle);
  if (['pendiente', 'confirmada'].includes(status)) {
    return [
      'solicitud_aceptada',
      'clase_programada',
      'clase_proxima',
      'recordatorio_enviado',
      'clase_iniciada',
      'clase_finalizada',
      'reprogramada',
      'incidencia_abierta',
    ].includes(lifecycle);
  }
  return true;
}

function dateFromDateAndTime(dateValue, timeValue) {
  const date = clean(dateValue, 20).slice(0, 10);
  const time = clean(timeValue, 8).slice(0, 5);
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function classTimeWindow(item = {}) {
  const explicitStart = toDate(first(item.startAtIso, item.startAt, item.start_at));
  let explicitEnd = toDate(first(item.endAtIso, item.endAt, item.end_at));
  const start = explicitStart || dateFromDateAndTime(first(item.fecha, item.date), first(item.hora_inicio, item.startTime));
  const duration = asNumber(first(item.durationMinutes, item.duracion_minutos));
  if (!explicitEnd && start && duration > 0) {
    explicitEnd = new Date(start.getTime() + duration * 60000);
  }
  const end = explicitEnd || dateFromDateAndTime(first(item.fecha, item.date), first(item.hora_fin, item.endTime));
  return {
    start,
    end,
    hasAnyTimeField: Boolean(first(item.startAtIso, item.startAt, item.fecha, item.date, item.hora_inicio, item.startTime, item.hora_fin, item.endTime)),
    durationMinutes: start && end ? Math.round((end.getTime() - start.getTime()) / 60000) : duration,
  };
}

function firstPayloadRef(item = {}, ...fields) {
  const payload = item.payload && typeof item.payload === 'object' ? item.payload : {};
  const data = item.data && typeof item.data === 'object' ? item.data : {};
  return clean(first(
    ...fields.map((field) => item[field]),
    ...fields.map((field) => payload[field]),
    ...fields.map((field) => data[field]),
  ), 220);
}

function isOpenStatus(item = {}) {
  const status = statusOf(item);
  return !CLOSED_STATUSES.has(status) && (ACTIVE_STATUSES.has(status) || status !== '');
}

function isActiveAssignment(item = {}) {
  const status = statusOf(item);
  return !CLOSED_STATUSES.has(status) && !['inactiva', 'inactive', 'finalizada', 'finished'].includes(status);
}

function isAssignedRequest(item = {}) {
  const assigned = teacherUid(item) || clean(first(item.assignedTeacherUid, item.profesor_asignado_id, item.teacherId), 220);
  if (!assigned) return false;
  const status = statusOf(item);
  return !CLOSED_STATUSES.has(status) && (!status || ASSIGNED_REQUEST_STATUSES.has(status) || ACTIVE_STATUSES.has(status));
}

function isClassCompleted(item = {}) {
  const status = statusOf(item);
  return COMPLETED_CLASS_STATUSES.has(status) || Boolean(item.completedAt || item.finishedAt || item.realizadaAt);
}

function isClassScheduled(item = {}) {
  const status = statusOf(item);
  return SCHEDULED_CLASS_STATUSES.has(status) || Boolean(first(item.startAtIso, item.fecha, item.date, item.startAt));
}

function isPaymentPaid(item = {}) {
  return PAID_STATUSES.has(paymentStatus(item)) || Boolean(item.paidAt || item.validatedAt || item.confirmedAt);
}

function isPaymentOpen(item = {}) {
  const status = paymentStatus(item);
  return !PAID_STATUSES.has(status) && !CLOSED_STATUSES.has(status) && (!status || PAYMENT_OPEN_STATUSES.has(status) || status !== '');
}

function mapById(rows = [], idGetter = (item) => item.id) {
  const map = new Map();
  for (const row of rows) {
    const id = clean(idGetter(row), 220);
    if (id) map.set(id, row);
  }
  return map;
}

function makeFinding(input) {
  const severity = input.severity || 'medium';
  const entity = clean(input.entityType || 'platform', 80);
  const id = clean(input.id || `supervision__${input.type}__${entity}__${input.entityId || input.classId || input.paymentId || input.requestId || input.assignmentId || 'global'}`, 260);
  return {
    id,
    type: clean(input.type, 100),
    category: clean(input.category || 'consistency', 80),
    severity,
    priorityRank: priorityRank(severity),
    priorityScore: toneScore(severity),
    entityType: entity,
    entityId: clean(input.entityId || input.classId || input.paymentId || input.requestId || input.assignmentId || '', 220),
    title: clean(input.title, 180),
    description: clean(input.description, 800),
    whyDetected: Array.isArray(input.whyDetected) ? input.whyDetected.map((item) => clean(item, 240)).filter(Boolean) : [],
    consequence: clean(input.consequence, 500),
    recommendedAction: clean(input.recommendedAction, 500),
    autoRepairable: Boolean(input.autoRepairable),
    autoAction: clean(input.autoAction || '', 120),
    familyUid: clean(input.familyUid || '', 220),
    teacherUid: clean(input.teacherUid || '', 220),
    studentId: clean(input.studentId || '', 220),
    classId: clean(input.classId || '', 220),
    paymentId: clean(input.paymentId || '', 220),
    requestId: clean(input.requestId || '', 220),
    assignmentId: clean(input.assignmentId || '', 220),
    chatId: clean(input.chatId || '', 220),
    related: input.related || {},
    source: 'platform_self_supervision',
    version: PLATFORM_SUPERVISION_VERSION,
    detectedAt: input.detectedAt || new Date().toISOString(),
  };
}

function addUnique(findings, seen, finding) {
  if (!finding.id || seen.has(finding.id)) return;
  seen.add(finding.id);
  findings.push(finding);
}

function chatMatchesAssignment(chat = {}, assignment = {}) {
  const chatFamily = familyUid(chat);
  const chatTeacher = teacherUid(chat);
  const assignmentFamily = familyUid(assignment);
  const assignmentTeacher = teacherUid(assignment);
  if (chatFamily && assignmentFamily && chatFamily !== assignmentFamily) return false;
  if (chatTeacher && assignmentTeacher && chatTeacher !== assignmentTeacher) return false;
  return true;
}

function paymentClassIds(payment = {}) {
  return [
    ...asArray(payment.classIds),
    ...asArray(payment.claseIds),
    clean(first(payment.classId, payment.clase_id), 220),
  ].filter(Boolean);
}

function hasPaymentForClass(classRef, paymentsByClass) {
  const id = classId(classRef);
  return Boolean(id && (paymentsByClass.get(id) || []).some((payment) => isPaymentPaid(payment) || isPaymentOpen(payment)));
}

function hasPaidPaymentForClass(classRef, paymentsByClass) {
  const id = classId(classRef);
  return Boolean(id && (paymentsByClass.get(id) || []).some(isPaymentPaid));
}

function hasUser(usersById, id) {
  return Boolean(id && usersById.has(id));
}

function latestDate(rows = [], fields = ['createdAt', 'updatedAt', 'created_at', 'updated_at']) {
  let latest = null;
  for (const row of rows) {
    for (const field of fields) {
      const date = toDate(row[field]);
      if (date && (!latest || date.getTime() > latest.getTime())) latest = date;
    }
  }
  return latest;
}

function buildPaymentIndexes(payments = []) {
  const byId = mapById(payments, paymentId);
  const byClass = new Map();
  for (const payment of payments) {
    for (const id of paymentClassIds(payment)) {
      if (!byClass.has(id)) byClass.set(id, []);
      byClass.get(id).push(payment);
    }
  }
  return { byId, byClass };
}

function findingSummary(findings = []) {
  return {
    total: findings.length,
    critical: findings.filter((item) => item.severity === 'critical').length,
    high: findings.filter((item) => item.severity === 'high').length,
    medium: findings.filter((item) => item.severity === 'medium').length,
    low: findings.filter((item) => item.severity === 'low').length,
    autoRepairable: findings.filter((item) => item.autoRepairable).length,
    blockedProcesses: findings.filter((item) => item.category === 'blocked_process').length,
    consistencyIssues: findings.filter((item) => item.category === 'consistency').length,
    automationIssues: findings.filter((item) => item.category === 'automation').length,
  };
}

export function buildPlatformSupervisionPlan(dataset = {}, options = {}) {
  const nowDate = toDate(options.nowIso || options.now) || new Date();
  const nowIso = nowDate.toISOString();
  const findings = [];
  const seen = new Set();
  const scanLimit = Math.max(1, asNumber(options.scanLimit || 2000));
  const classes = (dataset.clases || dataset.classes || []).slice(0, scanLimit);
  const payments = (dataset.pagos || dataset.payments || []).slice(0, scanLimit);
  const requests = (dataset.solicitudes || dataset.requests || []).slice(0, scanLimit);
  const assignments = (dataset.asignaciones || dataset.assignments || []).slice(0, scanLimit);
  const chats = (dataset.chats || []).slice(0, scanLimit);
  const notifications = (dataset.notificaciones || dataset.notifications || []).slice(0, scanLimit);
  const systemJobs = (dataset.systemJobs || []).slice(0, scanLimit);
  const automationEvents = (dataset.automationEvents || []).slice(0, scanLimit);
  const deadLetters = (dataset.deadLetters || []).slice(0, scanLimit);
  const incidents = (dataset.incidencias || dataset.incidents || []).slice(0, scanLimit);
  const preventiveRisks = (dataset.preventiveRisks || []).slice(0, scanLimit);
  const alertDecisions = (dataset.alertDecisions || []).slice(0, scanLimit);
  const teachers = (dataset.profesores || dataset.teachers || []).slice(0, scanLimit);
  const families = (dataset.familias || dataset.families || []).slice(0, scanLimit);
  const students = (dataset.alumnos || dataset.students || []).slice(0, scanLimit);
  const documents = (dataset.documentos || dataset.documents || []).slice(0, scanLimit);
  const rawUsers = [
    ...(dataset.users || []),
    ...(dataset.usuarios || []),
  ].slice(0, scanLimit * 2);

  const usersById = mapById(rawUsers, userId);
  const teachersById = mapById(teachers, (item) => clean(first(item.userUid, item.uid, item.id, item.profesor_id), 220));
  const familiesById = mapById(families, (item) => clean(first(item.userUid, item.uid, item.id, item.familyUid, item.familia_id), 220));
  const studentsById = mapById(students, studentId);
  const classesById = mapById(classes, classId);
  const requestsById = mapById(requests, requestId);
  const assignmentsById = mapById(assignments, assignmentId);
  const chatsByAssignment = new Map();
  const chatsById = mapById(chats, (item) => clean(first(item.id, item.chatId), 220));
  for (const chat of chats) {
    const key = assignmentId(chat);
    if (key && !chatsByAssignment.has(key)) chatsByAssignment.set(key, chat);
  }
  const { byId: paymentsById, byClass: paymentsByClass } = buildPaymentIndexes(payments);
  const assignmentsByRequest = new Map();
  for (const assignment of assignments) {
    const key = requestId(assignment);
    if (key && isActiveAssignment(assignment)) assignmentsByRequest.set(key, assignment);
  }
  const assignmentsByPair = new Map();
  const activeAssignmentGroups = new Map();
  for (const assignment of assignments) {
    if (!isActiveAssignment(assignment)) continue;
    const key = `${familyUid(assignment)}__${teacherUid(assignment)}__${studentId(assignment)}`;
    if (key.replaceAll('_', '') && !assignmentsByPair.has(key)) assignmentsByPair.set(key, assignment);
    const groupedKey = `${familyUid(assignment)}__${teacherUid(assignment)}__${studentId(assignment)}__${lower(first(assignment.subject, assignment.materia))}`;
    if (groupedKey.replaceAll('_', '')) {
      if (!activeAssignmentGroups.has(groupedKey)) activeAssignmentGroups.set(groupedKey, []);
      activeAssignmentGroups.get(groupedKey).push(assignment);
    }
  }

  for (const group of activeAssignmentGroups.values()) {
    if (group.length <= 1) continue;
    const primary = group[0];
    const ids = group.map((item) => assignmentId(item)).filter(Boolean);
    addUnique(findings, seen, makeFinding({
      type: 'duplicate_active_assignment',
      category: 'consistency',
      severity: 'high',
      entityType: 'asignaciones',
      entityId: ids[0],
      assignmentId: ids[0],
      familyUid: familyUid(primary),
      teacherUid: teacherUid(primary),
      studentId: studentId(primary),
      title: 'Relacion familia-profesor duplicada',
      description: 'Hay mas de una asignacion activa para la misma familia, profesor, alumno y materia.',
      whyDetected: [`Asignaciones activas duplicadas: ${ids.join(', ')}`],
      consequence: 'Chat, calendario, pagos y metricas pueden duplicarse o apuntar a la relacion incorrecta.',
      recommendedAction: 'Conservar una relacion activa y archivar las duplicadas desde el CRM.',
      related: { assignmentIds: ids },
      detectedAt: nowIso,
    }));
  }

  for (const request of requests) {
    const id = requestId(request);
    if (!id || !isAssignedRequest(request)) continue;
    const assignedTeacher = teacherUid(request) || clean(first(request.assignedTeacherUid, request.profesor_asignado_id, request.teacherId), 220);
    const assignment = assignmentsByRequest.get(id)
      || assignmentsByPair.get(`${familyUid(request)}__${assignedTeacher}__${studentId(request)}`);
    if (!assignment) {
      addUnique(findings, seen, makeFinding({
        type: 'request_assigned_without_assignment',
        category: 'consistency',
        severity: 'high',
        entityType: 'solicitudes',
        entityId: id,
        requestId: id,
        familyUid: familyUid(request),
        teacherUid: assignedTeacher,
        studentId: studentId(request),
        title: 'Solicitud asignada sin relacion operativa',
        description: 'La solicitud tiene profesor asignado, pero no existe una asignacion activa equivalente.',
        whyDetected: ['assignedTeacherUid/profesor_asignado_id tiene valor', 'No hay asignacion activa con la misma solicitud o pareja familia-profesor-alumno'],
        consequence: 'El chat, calendario y pagos pueden no arrancar correctamente para esta familia.',
        recommendedAction: 'Crear o reconstruir la asignacion desde Solicitudes antes de proponer clases.',
        related: { assignedTeacher },
        detectedAt: nowIso,
      }));
    }
  }

  for (const assignment of assignments) {
    if (!isActiveAssignment(assignment)) continue;
    const id = assignmentId(assignment);
    const linkedChatId = clean(first(assignment.chatId, assignment.chat_id), 220);
    const chat = linkedChatId ? chatsById.get(linkedChatId) : chatsByAssignment.get(id);
    if (id && !chat) {
      addUnique(findings, seen, makeFinding({
        type: 'assignment_without_chat',
        category: 'consistency',
        severity: 'high',
        entityType: 'asignaciones',
        entityId: id,
        assignmentId: id,
        requestId: requestId(assignment),
        familyUid: familyUid(assignment),
        teacherUid: teacherUid(assignment),
        studentId: studentId(assignment),
        title: 'Asignacion activa sin chat',
        description: 'Existe una relacion familia-profesor activa, pero no hay canal de chat enlazado.',
        whyDetected: ['Asignacion activa', 'No existe chatId valido ni chat con assignmentId'],
        consequence: 'Familia y profesor pueden quedarse sin canal para acordar horarios.',
        recommendedAction: 'Encolar la reparacion de chat o abrir la asignacion desde el CRM.',
        autoRepairable: true,
        autoAction: 'enqueue_relationship_ensure_chat',
        detectedAt: nowIso,
      }));
    }
    if (chat && !chatMatchesAssignment(chat, assignment)) {
      addUnique(findings, seen, makeFinding({
        type: 'chat_participant_mismatch',
        category: 'consistency',
        severity: 'critical',
        entityType: 'chats',
        entityId: clean(first(chat.id, chat.chatId), 220),
        chatId: clean(first(chat.id, chat.chatId), 220),
        assignmentId: id,
        familyUid: familyUid(assignment),
        teacherUid: teacherUid(assignment),
        studentId: studentId(assignment),
        title: 'Chat con participantes incompatibles',
        description: 'El chat enlazado no coincide con la familia o profesor de la asignacion.',
        whyDetected: ['assignment.familyUid/teacherUid difiere de chat.familyUid/teacherUid'],
        consequence: 'Riesgo de mostrar conversaciones o clases a usuarios incorrectos.',
        recommendedAction: 'Bloquear el chat afectado y reconstruir la relacion desde admin antes de continuar.',
        detectedAt: nowIso,
      }));
    }
  }

  for (const chat of chats) {
    const id = clean(first(chat.id, chat.chatId), 220);
    const linkedAssignmentId = assignmentId(chat);
    if (id && linkedAssignmentId && assignmentsById.size && !assignmentsById.has(linkedAssignmentId)) {
      addUnique(findings, seen, makeFinding({
        type: 'chat_references_missing_assignment',
        category: 'consistency',
        severity: 'high',
        entityType: 'chats',
        entityId: id,
        chatId: id,
        assignmentId: linkedAssignmentId,
        familyUid: familyUid(chat),
        teacherUid: teacherUid(chat),
        studentId: studentId(chat),
        title: 'Chat enlazado a una asignacion inexistente',
        description: 'El chat tiene assignmentId, pero esa asignacion ya no existe en el conjunto activo.',
        whyDetected: [`assignmentId=${linkedAssignmentId}`, 'No existe documento asignaciones equivalente'],
        consequence: 'Los mensajes pueden quedar separados del calendario, pagos y seguimiento de relacion.',
        recommendedAction: 'Reenlazar el chat a la asignacion correcta o archivar el chat huerfano.',
        detectedAt: nowIso,
      }));
    }

    const participants = participantUidSet(chat);
    const missingParticipants = [
      familyUid(chat) && participants.size && !participants.has(familyUid(chat)) ? 'familia' : '',
      teacherUid(chat) && participants.size && !participants.has(teacherUid(chat)) ? 'profesor' : '',
    ].filter(Boolean);
    if (id && missingParticipants.length) {
      addUnique(findings, seen, makeFinding({
        type: 'chat_missing_participant_uid',
        category: 'consistency',
        severity: 'critical',
        entityType: 'chats',
        entityId: id,
        chatId: id,
        assignmentId: linkedAssignmentId,
        familyUid: familyUid(chat),
        teacherUid: teacherUid(chat),
        studentId: studentId(chat),
        title: 'Chat con lista de participantes incompleta',
        description: `El chat conoce la relacion, pero participantUids no incluye a: ${missingParticipants.join(', ')}.`,
        whyDetected: ['participantUids no contiene todos los UIDs operativos'],
        consequence: 'Puede bloquear lectura/escritura del chat o dejar fuera a una de las partes.',
        recommendedAction: 'Reparar participantUids con familia y profesor antes de seguir usando el chat.',
        detectedAt: nowIso,
      }));
    }
  }

  for (const klass of classes) {
    const id = classId(klass);
    const status = statusOf(klass);
    const rawOperationalStatus = rawClassStatus(klass);
    const classStatus = normalizedClassStatus(klass);
    const rawLifecycleStatus = rawClassLifecycleStatus(klass);
    const lifecycleStatus = normalizedClassLifecycleStatus(klass);
    const amount = amountOf(klass);
    const missing = [
      !teacherUid(klass) ? 'profesor' : '',
      !familyUid(klass) ? 'familia' : '',
      !studentId(klass) ? 'alumno' : '',
      !first(klass.startAtIso, klass.fecha, klass.date, klass.startAt) ? 'fecha' : '',
    ].filter(Boolean);

    if (id && rawOperationalStatus && !CLASS_OPERATIONAL_STATUSES.has(classStatus)) {
      addUnique(findings, seen, makeFinding({
        type: 'class_invalid_status',
        category: 'consistency',
        severity: 'high',
        entityType: 'clases',
        entityId: id,
        classId: id,
        familyUid: familyUid(klass),
        teacherUid: teacherUid(klass),
        studentId: studentId(klass),
        title: 'Clase con estado operativo no reconocido',
        description: `La clase usa un estado que no pertenece al modelo canonico: ${rawOperationalStatus}.`,
        whyDetected: ['status/estado fuera del catalogo de clases'],
        consequence: 'Calendario, pagos y lifecycle pueden interpretar la clase de forma distinta.',
        recommendedAction: 'Normalizar el estado a pendiente, confirmada, realizada, cancelada, reprogramada o pagada.',
        related: { rawStatus: rawOperationalStatus },
        detectedAt: nowIso,
      }));
    }

    if (id && rawLifecycleStatus && !CLASS_LIFECYCLE_STATES.has(lifecycleStatus)) {
      addUnique(findings, seen, makeFinding({
        type: 'class_invalid_lifecycle_status',
        category: 'consistency',
        severity: 'high',
        entityType: 'clases',
        entityId: id,
        classId: id,
        familyUid: familyUid(klass),
        teacherUid: teacherUid(klass),
        studentId: studentId(klass),
        title: 'Clase con lifecycle no reconocido',
        description: `El estado interno de ciclo de vida no pertenece al flujo soportado: ${rawLifecycleStatus}.`,
        whyDetected: ['lifecycleStatus fuera del catalogo de lifecycle'],
        consequence: 'Las automatizaciones pueden saltarse recordatorios, confirmaciones o pagos.',
        recommendedAction: 'Recalcular lifecycleStatus desde el estado operativo y el estado economico.',
        related: { rawLifecycleStatus },
        detectedAt: nowIso,
      }));
    }

    if (
      id
      && CLASS_OPERATIONAL_STATUSES.has(classStatus)
      && CLASS_LIFECYCLE_STATES.has(lifecycleStatus)
      && !lifecycleCompatibleWithClassStatus(classStatus, lifecycleStatus)
    ) {
      addUnique(findings, seen, makeFinding({
        type: 'class_status_lifecycle_mismatch',
        category: 'consistency',
        severity: 'medium',
        entityType: 'clases',
        entityId: id,
        classId: id,
        familyUid: familyUid(klass),
        teacherUid: teacherUid(klass),
        studentId: studentId(klass),
        title: 'Estado de clase y lifecycle no coinciden',
        description: `La clase esta en estado ${classStatus}, pero su lifecycle indica ${lifecycleStatus}.`,
        whyDetected: ['status/estado y lifecycleStatus representan fases incompatibles'],
        consequence: 'Puede aparecer en un panel como pendiente y en otro como cerrada o pagada.',
        recommendedAction: 'Recalcular lifecycleStatus y sincronizar calendarios, pagos y auditoria.',
        related: { status: classStatus, lifecycleStatus },
        detectedAt: nowIso,
      }));
    }

    const timeWindow = classTimeWindow(klass);
    if (id && timeWindow.hasAnyTimeField && (!timeWindow.start || !timeWindow.end || timeWindow.durationMinutes <= 0 || timeWindow.durationMinutes > 8 * 60)) {
      addUnique(findings, seen, makeFinding({
        type: 'class_invalid_time_range',
        category: 'consistency',
        severity: 'high',
        entityType: 'clases',
        entityId: id,
        classId: id,
        familyUid: familyUid(klass),
        teacherUid: teacherUid(klass),
        studentId: studentId(klass),
        title: 'Clase con horario imposible',
        description: 'La clase tiene fecha u horas incoherentes: falta inicio/fin valido, dura cero minutos o supera ocho horas.',
        whyDetected: ['Rango horario invalido en fecha/start/end/duration'],
        consequence: 'Puede no bloquear disponibilidad, no aparecer en calendario o generar pagos erroneos.',
        recommendedAction: 'Corregir fecha, hora de inicio y hora de fin desde calendario o recrear la clase.',
        related: { durationMinutes: timeWindow.durationMinutes },
        detectedAt: nowIso,
      }));
    }

    const orphanRelations = [
      teacherUid(klass) && teachersById.size && !teachersById.has(teacherUid(klass)) ? 'profesor' : '',
      familyUid(klass) && familiesById.size && !familiesById.has(familyUid(klass)) ? 'familia' : '',
      studentId(klass) && studentsById.size && !studentsById.has(studentId(klass)) ? 'alumno' : '',
    ].filter(Boolean);
    if (id && orphanRelations.length) {
      addUnique(findings, seen, makeFinding({
        type: 'class_relation_orphan',
        category: 'consistency',
        severity: orphanRelations.includes('profesor') || orphanRelations.includes('familia') ? 'critical' : 'high',
        entityType: 'clases',
        entityId: id,
        classId: id,
        familyUid: familyUid(klass),
        teacherUid: teacherUid(klass),
        studentId: studentId(klass),
        title: 'Clase con relacion huerfana',
        description: `La clase apunta a documentos inexistentes: ${orphanRelations.join(', ')}.`,
        whyDetected: ['UIDs de clase sin perfil equivalente en profesores/familias/alumnos'],
        consequence: 'Calendario, chat, pagos o reputacion pueden no propagarse a la persona correcta.',
        recommendedAction: 'Reenlazar la clase a la relacion activa correcta o archivarla si era de prueba.',
        detectedAt: nowIso,
      }));
    }

    if (id && isClassScheduled(klass) && missing.length) {
      addUnique(findings, seen, makeFinding({
        type: 'class_missing_core_relation',
        category: 'consistency',
        severity: missing.includes('profesor') || missing.includes('familia') ? 'critical' : 'high',
        entityType: 'clases',
        entityId: id,
        classId: id,
        familyUid: familyUid(klass),
        teacherUid: teacherUid(klass),
        studentId: studentId(klass),
        title: 'Clase con datos esenciales incompletos',
        description: `Faltan datos obligatorios para que calendario, chat y pagos sean fiables: ${missing.join(', ')}.`,
        whyDetected: missing.map((item) => `Falta ${item}`),
        consequence: 'La clase puede no aparecer correctamente o no generar recordatorios/pagos.',
        recommendedAction: 'Completar la clase o recrearla desde la relacion correcta.',
        detectedAt: nowIso,
      }));
    }

    const classPaymentState = normalizedPaymentStatusValue(first(klass.familyPaymentStatus, klass.estado_pago_familia, klass.paymentStatus, klass.estado_pago));
    if (id && hasPaidPaymentForClass(klass, paymentsByClass) && !PAID_STATUSES.has(classPaymentState) && classStatus !== 'pagada') {
      addUnique(findings, seen, makeFinding({
        type: 'class_paid_payment_not_propagated',
        category: 'consistency',
        severity: 'high',
        entityType: 'clases',
        entityId: id,
        classId: id,
        familyUid: familyUid(klass),
        teacherUid: teacherUid(klass),
        studentId: studentId(klass),
        title: 'Pago validado no propagado a la clase',
        description: 'Existe un pago validado para la clase, pero la clase no refleja estado economico pagado.',
        whyDetected: ['Pago enlazado pagado/validado', 'familyPaymentStatus/estado_pago_familia no pagado'],
        consequence: 'El calendario puede seguir amarillo/rojo y el profesor o admin ver deuda inexistente.',
        recommendedAction: 'Ejecutar conciliacion de pago o sincronizar linkedFamilyPaymentStatus en la clase.',
        detectedAt: nowIso,
      }));
    }

    if (id && isClassCompleted(klass) && amount > 0 && !hasPaymentForClass(klass, paymentsByClass) && !isPaymentPaid(klass)) {
      addUnique(findings, seen, makeFinding({
        type: 'completed_class_without_payment_request',
        category: 'blocked_process',
        severity: 'high',
        entityType: 'clases',
        entityId: id,
        classId: id,
        familyUid: familyUid(klass),
        teacherUid: teacherUid(klass),
        studentId: studentId(klass),
        title: 'Clase realizada sin pago enlazado',
        description: 'La clase esta marcada como realizada y tiene importe, pero no existe pago ni solicitud de pago relacionada.',
        whyDetected: ['Estado de clase completado/realizado', 'Importe mayor que cero', 'No hay pago con classId/classIds ni estado de pago pagado'],
        consequence: 'Puede no cobrarse a la familia y no cuadrar el panel financiero.',
        recommendedAction: 'Crear automaticamente una solicitud de pago para esa clase.',
        autoRepairable: true,
        autoAction: 'enqueue_payment_request_for_class',
        detectedAt: nowIso,
      }));
    }

    if (id && CLOSED_STATUSES.has(status) && hasPaidPaymentForClass(klass, paymentsByClass) && /cancel/.test(status)) {
      addUnique(findings, seen, makeFinding({
        type: 'cancelled_class_with_paid_payment',
        category: 'consistency',
        severity: 'medium',
        entityType: 'clases',
        entityId: id,
        classId: id,
        familyUid: familyUid(klass),
        teacherUid: teacherUid(klass),
        studentId: studentId(klass),
        title: 'Clase cancelada con pago confirmado',
        description: 'Una clase cancelada aparece asociada a un pago validado.',
        whyDetected: ['Estado de clase cancelado', 'Existe pago enlazado y pagado/validado'],
        consequence: 'Puede inflar ingresos, reputacion o pagos al profesor.',
        recommendedAction: 'Revisar si debe reembolsarse, mover el pago a otra clase o reabrir la clase.',
        detectedAt: nowIso,
      }));
    }
  }

  for (const payment of payments) {
    const id = paymentId(payment);
    const classRefs = paymentClassIds(payment);
    const rawStatus = lower(first(payment.status, payment.estado, payment.paymentStatus, payment.familyPaymentStatus, payment.providerPaymentStatus, payment.gatewayStatus));
    const normalizedStatus = normalizedPaymentStatusValue(rawStatus);
    if (id && rawStatus && !PAYMENT_STATUSES.has(normalizedStatus)) {
      addUnique(findings, seen, makeFinding({
        type: 'payment_invalid_status',
        category: 'consistency',
        severity: 'high',
        entityType: 'pagos',
        entityId: id,
        paymentId: id,
        familyUid: familyUid(payment),
        teacherUid: teacherUid(payment),
        studentId: studentId(payment),
        title: 'Pago con estado no reconocido',
        description: `El pago usa un estado que no pertenece al modelo economico canonico: ${rawStatus}.`,
        whyDetected: ['status/estado/paymentStatus fuera del catalogo de pagos'],
        consequence: 'Conciliacion, calendario financiero y panel de ingresos pueden no interpretarlo bien.',
        recommendedAction: 'Normalizar el pago a pendiente, solicitado, procesando, validado, pagado, vencido, rechazado, fallido, devuelto, disputado o cancelado.',
        related: { rawStatus },
        detectedAt: nowIso,
      }));
    }

    const orphanRelations = [
      familyUid(payment) && familiesById.size && !familiesById.has(familyUid(payment)) ? 'familia' : '',
      teacherUid(payment) && teachersById.size && !teachersById.has(teacherUid(payment)) ? 'profesor' : '',
      studentId(payment) && studentsById.size && !studentsById.has(studentId(payment)) ? 'alumno' : '',
    ].filter(Boolean);
    if (id && orphanRelations.length) {
      addUnique(findings, seen, makeFinding({
        type: 'payment_relation_orphan',
        category: 'consistency',
        severity: orphanRelations.includes('familia') ? 'critical' : 'high',
        entityType: 'pagos',
        entityId: id,
        paymentId: id,
        familyUid: familyUid(payment),
        teacherUid: teacherUid(payment),
        studentId: studentId(payment),
        title: 'Pago con relacion huerfana',
        description: `El pago apunta a documentos inexistentes: ${orphanRelations.join(', ')}.`,
        whyDetected: ['UIDs de pago sin perfil equivalente en familias/profesores/alumnos'],
        consequence: 'Puede bloquear conciliacion, avisos de deuda o ingresos del profesor.',
        recommendedAction: 'Reenlazar el pago a la relacion correcta o moverlo a revision manual.',
        detectedAt: nowIso,
      }));
    }

    if (id && isPaymentOpen(payment) && amountOf(payment) > 0 && !classRefs.length && !studentId(payment)) {
      addUnique(findings, seen, makeFinding({
        type: 'payment_without_class_link',
        category: 'blocked_process',
        severity: 'medium',
        entityType: 'pagos',
        entityId: id,
        paymentId: id,
        familyUid: familyUid(payment),
        teacherUid: teacherUid(payment),
        title: 'Pago sin clase enlazada',
        description: 'El pago esta abierto y tiene importe, pero no apunta a ninguna clase ni alumno.',
        whyDetected: ['Pago abierto', 'Importe mayor que cero', 'classId/classIds vacio'],
        consequence: 'La conciliacion automatica no puede cerrar la clase correcta.',
        recommendedAction: 'Relacionar el pago con una clase o marcarlo como revision manual.',
        detectedAt: nowIso,
      }));
    }
    for (const ref of classRefs) {
      if (!classesById.has(ref)) {
        addUnique(findings, seen, makeFinding({
          type: 'payment_references_missing_class',
          category: 'consistency',
          severity: 'high',
          entityType: 'pagos',
          entityId: id,
          paymentId: id,
          classId: ref,
          familyUid: familyUid(payment),
          teacherUid: teacherUid(payment),
          title: 'Pago enlazado a una clase inexistente',
          description: 'El pago referencia una clase que no existe en la coleccion de clases activa.',
          whyDetected: [`classId/classIds contiene ${ref}`, 'No existe documento clases equivalente'],
          consequence: 'La conciliacion puede quedar bloqueada y el calendario no reflejara el cobro.',
          recommendedAction: 'Corregir el enlace del pago o restaurar la clase correspondiente.',
          detectedAt: nowIso,
        }));
      }
    }
  }

  for (const [ref, relatedPayments] of paymentsByClass.entries()) {
    const familyPayments = relatedPayments.filter(isFamilyPaymentRecord);
    const open = familyPayments.filter(isPaymentOpen);
    const paid = familyPayments.filter(isPaymentPaid);
    if (open.length > 1) {
      addUnique(findings, seen, makeFinding({
        type: 'duplicate_open_payments_for_class',
        category: 'consistency',
        severity: 'high',
        entityType: 'pagos',
        entityId: ref,
        classId: ref,
        title: 'Clase con varias solicitudes de pago abiertas',
        description: 'Hay mas de un pago familiar abierto enlazado a la misma clase.',
        whyDetected: [`Pagos abiertos: ${open.map((item) => paymentId(item)).filter(Boolean).join(', ')}`],
        consequence: 'La familia puede recibir cobros duplicados o el calendario mostrar deuda duplicada.',
        recommendedAction: 'Dejar un unico pago abierto y cancelar o archivar los duplicados.',
        related: { paymentIds: open.map((item) => paymentId(item)).filter(Boolean) },
        detectedAt: nowIso,
      }));
    }
    if (paid.length > 1) {
      addUnique(findings, seen, makeFinding({
        type: 'duplicate_paid_payments_for_class',
        category: 'consistency',
        severity: 'critical',
        entityType: 'pagos',
        entityId: ref,
        classId: ref,
        title: 'Clase con varios pagos familiares validados',
        description: 'Hay mas de un pago familiar pagado o validado para la misma clase.',
        whyDetected: [`Pagos validados: ${paid.map((item) => paymentId(item)).filter(Boolean).join(', ')}`],
        consequence: 'Los ingresos pueden inflarse y la familia puede aparecer como si hubiera pagado dos veces.',
        recommendedAction: 'Conciliar manualmente y marcar los duplicados como devueltos/cancelados si procede.',
        related: { paymentIds: paid.map((item) => paymentId(item)).filter(Boolean) },
        detectedAt: nowIso,
      }));
    }
  }

  const latestAutomation = latestDate(automationEvents, ['createdAt', 'updatedAt', 'created_at', 'updated_at']);
  const heartbeatHours = Math.max(1, asNumber(options.automationHeartbeatHours || 12));
  if (!latestAutomation || hoursSince(latestAutomation, nowDate) > heartbeatHours) {
    addUnique(findings, seen, makeFinding({
      type: 'automation_heartbeat_missing',
      category: 'automation',
      severity: latestAutomation ? 'high' : 'critical',
      entityType: 'automationEvents',
      entityId: 'heartbeat',
      title: latestAutomation ? 'Automatizaciones sin latido reciente' : 'No hay latido de automatizaciones',
      description: latestAutomation
        ? `El ultimo automationEvent tiene mas de ${heartbeatHours} horas.`
        : 'No se ha encontrado ningun automationEvent reciente para demostrar que el worker esta ejecutandose.',
      whyDetected: ['automationEvents sin documento reciente'],
      consequence: 'Recordatorios, matching, pagos, reputacion y snapshots pueden dejar de actualizarse.',
      recommendedAction: 'Ejecutar el worker programado y revisar GitHub Actions/credenciales si no vuelve a registrar eventos.',
      detectedAt: nowIso,
      related: { latestAutomationAt: iso(latestAutomation) },
    }));
  }

  const queuedJobHours = Math.max(0.25, asNumber(options.queuedJobStuckHours || 2));
  const processingJobMinutes = Math.max(5, asNumber(options.processingJobStuckMinutes || 45));
  for (const job of systemJobs) {
    const status = statusOf(job);
    const id = entityId(job, ['id']);
    if (status === 'queued' && hoursSince(first(job.runAt, job.createdAt, job.created_at), nowDate) > queuedJobHours) {
      addUnique(findings, seen, makeFinding({
        type: 'queued_system_job_stuck',
        category: 'automation',
        severity: 'high',
        entityType: 'systemJobs',
        entityId: id,
        title: 'Job en cola atascado',
        description: `El job ${clean(job.type || id)} sigue en cola despues del SLA configurado.`,
        whyDetected: ['status=queued', `runAt/createdAt hace mas de ${queuedJobHours} horas`],
        consequence: 'Una automatizacion esperada no se ha ejecutado a tiempo.',
        recommendedAction: 'Revisar el worker y reencolar o ejecutar el job si procede.',
        related: { jobType: clean(job.type, 120) },
        detectedAt: nowIso,
      }));
    }
    if (status === 'processing' && hoursSince(first(job.startedAt, job.updatedAt, job.updated_at), nowDate) * 60 > processingJobMinutes) {
      addUnique(findings, seen, makeFinding({
        type: 'processing_system_job_stuck',
        category: 'automation',
        severity: 'critical',
        entityType: 'systemJobs',
        entityId: id,
        title: 'Job procesando demasiado tiempo',
        description: `El job ${clean(job.type || id)} mantiene estado processing mas alla del lease esperado.`,
        whyDetected: ['status=processing', `startedAt/updatedAt supera ${processingJobMinutes} minutos`],
        consequence: 'El proceso puede haber quedado bloqueado y no reintentarse solo.',
        recommendedAction: 'Liberar el lease, revisar deadLetters y reintentar tras confirmar idempotencia.',
        related: { jobType: clean(job.type, 120) },
        detectedAt: nowIso,
      }));
    }
  }

  for (const item of deadLetters) {
    const id = entityId(item, ['id']);
    if (!id || CLOSED_STATUSES.has(statusOf(item))) continue;
    addUnique(findings, seen, makeFinding({
      type: 'dead_letter_open',
      category: 'automation',
      severity: 'critical',
      entityType: 'deadLetters',
      entityId: id,
      title: 'Dead letter abierta',
      description: 'Un proceso automatico agoto reintentos y requiere revision.',
      whyDetected: ['Documento en deadLetters sin estado cerrado'],
      consequence: 'Una accion relevante no se ha completado y puede afectar a usuarios.',
      recommendedAction: 'Revisar error, corregir causa y reencolar el job original.',
      related: { error: clean(first(item.error, item.message), 400), jobType: clean(first(item.type, item.jobType), 120) },
      detectedAt: nowIso,
    }));
  }

  const userCheckEnabled = rawUsers.length > 0;
  if (userCheckEnabled) {
    const emailsById = new Map();
    for (const user of rawUsers) {
      const id = userId(user);
      const role = normalizedUserRole(user);
      const email = lower(first(user.email, user.correo));
      if (email && id) {
        if (!emailsById.has(email)) emailsById.set(email, new Set());
        emailsById.get(email).add(id);
      }
      if (id && role === 'profesor' && teachersById.size && !teachersById.has(id)) {
        addUnique(findings, seen, makeFinding({
          type: 'user_teacher_role_without_profile',
          category: 'consistency',
          severity: 'high',
          entityType: 'users',
          entityId: id,
          teacherUid: id,
          title: 'Usuario profesor sin perfil de profesor',
          description: 'El usuario tiene rol de profesor, pero no existe perfil operativo en profesores.',
          whyDetected: ['users.role=profesor', 'No existe profesores/{uid} equivalente'],
          consequence: 'Puede iniciar sesion pero no completar disponibilidad, clases, documentos o ingresos.',
          recommendedAction: 'Crear el perfil de profesor desde el onboarding o corregir el rol del usuario.',
          detectedAt: nowIso,
        }));
      }
      if (id && role === 'familia' && familiesById.size && !familiesById.has(id)) {
        addUnique(findings, seen, makeFinding({
          type: 'user_family_role_without_profile',
          category: 'consistency',
          severity: 'high',
          entityType: 'users',
          entityId: id,
          familyUid: id,
          title: 'Usuario familia sin perfil familiar',
          description: 'El usuario tiene rol de familia, pero no existe perfil operativo en familias.',
          whyDetected: ['users.role=familia', 'No existe familias/{uid} equivalente'],
          consequence: 'Puede iniciar sesion pero no ver hijos, solicitudes, calendario o pagos.',
          recommendedAction: 'Crear el perfil familiar desde el onboarding o corregir el rol del usuario.',
          detectedAt: nowIso,
        }));
      }
    }

    for (const [email, ids] of emailsById.entries()) {
      if (ids.size <= 1) continue;
      addUnique(findings, seen, makeFinding({
        type: 'duplicate_user_email',
        category: 'consistency',
        severity: 'medium',
        entityType: 'users',
        entityId: email,
        title: 'Email duplicado en usuarios',
        description: 'El mismo email aparece asociado a mas de un UID.',
        whyDetected: [`Email ${email} aparece en ${ids.size} usuarios`],
        consequence: 'Puede provocar confusion en login, permisos, CRM o comunicacion.',
        recommendedAction: 'Unificar identidades o confirmar manualmente que son cuentas separadas.',
        related: { userUids: Array.from(ids) },
        detectedAt: nowIso,
      }));
    }

    for (const teacher of teachers) {
      const id = userId(teacher);
      if (id && !hasUser(usersById, id)) {
        addUnique(findings, seen, makeFinding({
          type: 'teacher_profile_without_user',
          category: 'consistency',
          severity: 'high',
          entityType: 'profesores',
          entityId: id,
          teacherUid: id,
          title: 'Perfil de profesor sin usuario base',
          description: 'Existe perfil de profesor, pero no documento de usuario equivalente.',
          whyDetected: ['profesores.userUid/id no aparece en users/usuarios'],
          consequence: 'Puede fallar login, permisos o notificaciones.',
          recommendedAction: 'Crear o reparar users/{uid} antes de asignar nuevas clases.',
          detectedAt: nowIso,
        }));
      }
    }

    for (const family of families) {
      const id = userId(family);
      if (id && !hasUser(usersById, id)) {
        addUnique(findings, seen, makeFinding({
          type: 'family_profile_without_user',
          category: 'consistency',
          severity: 'high',
          entityType: 'familias',
          entityId: id,
          familyUid: id,
          title: 'Perfil familiar sin usuario base',
          description: 'Existe perfil familiar, pero no documento de usuario equivalente.',
          whyDetected: ['familias.userUid/id no aparece en users/usuarios'],
          consequence: 'Puede fallar login, permisos, pagos o notificaciones.',
          recommendedAction: 'Crear o reparar users/{uid} antes de continuar el flujo familiar.',
          detectedAt: nowIso,
        }));
      }
    }
  }

  for (const student of students) {
    const id = studentId(student);
    const family = familyUid(student);
    if (id && family && familiesById.size && !familiesById.has(family)) {
      addUnique(findings, seen, makeFinding({
        type: 'student_without_family',
        category: 'consistency',
        severity: 'high',
        entityType: 'alumnos',
        entityId: id,
        studentId: id,
        familyUid: family,
        title: 'Alumno sin familia enlazada',
        description: 'El alumno referencia una familia que no existe en la coleccion de familias.',
        whyDetected: ['alumnos.familyUid/familia_id sin documento familias equivalente'],
        consequence: 'La familia puede no ver calendario, chat o solicitudes del alumno.',
        recommendedAction: 'Reparar el owner familiar o mover el alumno al perfil correcto.',
        detectedAt: nowIso,
      }));
    }
  }

  for (const notification of notifications) {
    const id = entityId(notification, ['id', 'notificationId']);
    const target = clean(first(notification.userUid, notification.usuario_id, notification.toUid, notification.targetUid), 220);
    if (!target) {
      addUnique(findings, seen, makeFinding({
        type: 'notification_without_target',
        category: 'consistency',
        severity: 'medium',
        entityType: 'notificaciones',
        entityId: id,
        title: 'Notificacion sin destinatario',
        description: 'Existe una notificacion interna sin userUid/toUid.',
        whyDetected: ['userUid/toUid vacio'],
        consequence: 'El aviso no llegara a nadie y puede ensuciar metricas.',
        recommendedAction: 'Marcarla como huerfana y revisar el origen que la creo.',
        autoRepairable: true,
        autoAction: 'mark_notification_orphaned',
        detectedAt: nowIso,
      }));
      continue;
    }
    if (userCheckEnabled && !usersById.has(target) && !teachersById.has(target) && !familiesById.has(target)) {
      addUnique(findings, seen, makeFinding({
        type: 'notification_orphan_user',
        category: 'consistency',
        severity: 'medium',
        entityType: 'notificaciones',
        entityId: id,
        title: 'Notificacion a usuario inexistente',
        description: 'La notificacion apunta a un usuario que no existe como usuario, profesor ni familia.',
        whyDetected: [`Destinatario ${target} no encontrado`],
        consequence: 'El aviso nunca sera leido y puede ocultar fallos de automatizacion.',
        recommendedAction: 'Marcarla como huerfana y revisar el evento que la genero.',
        autoRepairable: true,
        autoAction: 'mark_notification_orphaned',
        related: { targetUid: target },
        detectedAt: nowIso,
      }));
    }

    const referencedClass = firstPayloadRef(notification, 'classId', 'clase_id');
    const referencedPayment = firstPayloadRef(notification, 'paymentId', 'pago_id');
    const referencedChat = firstPayloadRef(notification, 'chatId');
    if (referencedClass && classesById.size && !classesById.has(referencedClass)) {
      addUnique(findings, seen, makeFinding({
        type: 'notification_references_missing_class',
        category: 'consistency',
        severity: 'medium',
        entityType: 'notificaciones',
        entityId: id,
        classId: referencedClass,
        title: 'Notificacion enlazada a clase inexistente',
        description: 'La notificacion contiene classId, pero esa clase no existe en el conjunto auditado.',
        whyDetected: [`classId=${referencedClass}`, 'No existe documento clases equivalente'],
        consequence: 'El boton de abrir puede llevar a una pantalla vacia o a un estado imposible.',
        recommendedAction: 'Actualizar el payload de la notificacion o marcarla como obsoleta.',
        detectedAt: nowIso,
      }));
    }
    if (referencedPayment && paymentsById.size && !paymentsById.has(referencedPayment)) {
      addUnique(findings, seen, makeFinding({
        type: 'notification_references_missing_payment',
        category: 'consistency',
        severity: 'medium',
        entityType: 'notificaciones',
        entityId: id,
        paymentId: referencedPayment,
        title: 'Notificacion enlazada a pago inexistente',
        description: 'La notificacion contiene paymentId, pero ese pago no existe en el conjunto auditado.',
        whyDetected: [`paymentId=${referencedPayment}`, 'No existe documento pagos equivalente'],
        consequence: 'El usuario puede intentar revisar un pago que ya no existe o fue recreado.',
        recommendedAction: 'Actualizar el payload de la notificacion o marcarla como obsoleta.',
        detectedAt: nowIso,
      }));
    }
    if (referencedChat && chatsById.size && !chatsById.has(referencedChat)) {
      addUnique(findings, seen, makeFinding({
        type: 'notification_references_missing_chat',
        category: 'consistency',
        severity: 'medium',
        entityType: 'notificaciones',
        entityId: id,
        chatId: referencedChat,
        title: 'Notificacion enlazada a chat inexistente',
        description: 'La notificacion contiene chatId, pero ese chat no existe en el conjunto auditado.',
        whyDetected: [`chatId=${referencedChat}`, 'No existe documento chats equivalente'],
        consequence: 'El acceso desde notificaciones puede fallar o abrir un chat incorrecto.',
        recommendedAction: 'Actualizar el payload de la notificacion o marcarla como obsoleta.',
        detectedAt: nowIso,
      }));
    }
  }

  for (const document of documents) {
    const id = entityId(document, ['id', 'documentId']);
    const owner = clean(first(document.ownerUid, document.userUid, document.teacherUid, document.familyUid), 220);
    if (id && owner && userCheckEnabled && !usersById.has(owner) && !teachersById.has(owner) && !familiesById.has(owner)) {
      addUnique(findings, seen, makeFinding({
        type: 'document_without_owner',
        category: 'consistency',
        severity: 'medium',
        entityType: 'documentos',
        entityId: id,
        title: 'Documento sin propietario valido',
        description: 'El documento referencia un usuario que no existe en perfiles activos.',
        whyDetected: [`ownerUid/userUid ${owner} no encontrado`],
        consequence: 'Puede quedar informacion sensible sin trazabilidad operativa.',
        recommendedAction: 'Reasignar el documento o archivarlo desde el centro documental.',
        related: { ownerUid: owner },
        detectedAt: nowIso,
      }));
    }
  }

  const staleIncidentHours = Math.max(1, asNumber(options.staleIncidentHours || 24));
  const alertDecisionIds = new Set(alertDecisions.map((item) => clean(first(item.signalId, item.entityId, item.incidentId), 220)).filter(Boolean));
  for (const incident of incidents) {
    const id = entityId(incident, ['id', 'ticketId']);
    if (!id) continue;
    const rawIncidentStatus = lower(first(incident.status, incident.estado));
    const normalizedIncidentStatus = normalizedIncidentStatusValue(incident);
    if (rawIncidentStatus && !INCIDENT_STATUSES.has(normalizedIncidentStatus)) {
      addUnique(findings, seen, makeFinding({
        type: 'incident_invalid_status',
        category: 'consistency',
        severity: 'medium',
        entityType: 'incidencias',
        entityId: id,
        title: 'Incidencia con estado no reconocido',
        description: `La incidencia usa un estado que no pertenece al flujo de tickets: ${rawIncidentStatus}.`,
        whyDetected: ['status/estado fuera del catalogo de incidencias'],
        consequence: 'Puede no aparecer en filtros, SLA o cierre automatico.',
        recommendedAction: 'Normalizarla a abierta, en_proceso, esperando_usuario, resuelta o cerrada.',
        related: { rawStatus: rawIncidentStatus },
        detectedAt: nowIso,
      }));
    }

    const incidentClass = classId(incident);
    const incidentPayment = paymentId(incident);
    if (incidentClass && classesById.size && !classesById.has(incidentClass)) {
      addUnique(findings, seen, makeFinding({
        type: 'incident_references_missing_class',
        category: 'consistency',
        severity: 'high',
        entityType: 'incidencias',
        entityId: id,
        classId: incidentClass,
        title: 'Incidencia enlazada a clase inexistente',
        description: 'La incidencia referencia una clase que no existe en el conjunto activo.',
        whyDetected: [`classId=${incidentClass}`, 'No existe documento clases equivalente'],
        consequence: 'El administrador no puede reconstruir el problema desde calendario/pagos.',
        recommendedAction: 'Reenlazar la incidencia a la clase correcta o cerrarla como obsoleta.',
        detectedAt: nowIso,
      }));
    }
    if (incidentPayment && paymentsById.size && !paymentsById.has(incidentPayment)) {
      addUnique(findings, seen, makeFinding({
        type: 'incident_references_missing_payment',
        category: 'consistency',
        severity: 'high',
        entityType: 'incidencias',
        entityId: id,
        paymentId: incidentPayment,
        title: 'Incidencia enlazada a pago inexistente',
        description: 'La incidencia referencia un pago que no existe en el conjunto activo.',
        whyDetected: [`paymentId=${incidentPayment}`, 'No existe documento pagos equivalente'],
        consequence: 'El administrador no puede conciliar o resolver el ticket financiero con seguridad.',
        recommendedAction: 'Reenlazar la incidencia al pago correcto o cerrarla como obsoleta.',
        detectedAt: nowIso,
      }));
    }

    if (!isOpenStatus(incident)) continue;
    if (!incident.alertPriorityScore && !alertDecisionIds.has(id) && hoursSince(first(incident.createdAt, incident.updatedAt, incident.created_at), nowDate) > staleIncidentHours) {
      addUnique(findings, seen, makeFinding({
        type: 'incident_without_priority_decision',
        category: 'automation',
        severity: 'medium',
        entityType: 'incidencias',
        entityId: id,
        title: 'Incidencia abierta sin priorizacion reciente',
        description: 'Una incidencia abierta no tiene score del motor de prioridades tras el SLA configurado.',
        whyDetected: ['Incidencia abierta', 'alertPriorityScore vacio', `edad mayor de ${staleIncidentHours} horas`],
        consequence: 'El administrador puede no verla con la prioridad correcta.',
        recommendedAction: 'Verificar que el motor de prioridades se ejecuta y recalcular alertas.',
        detectedAt: nowIso,
      }));
    }
  }

  const staleRiskHours = Math.max(1, asNumber(options.staleRiskHours || 12));
  for (const risk of preventiveRisks) {
    const id = entityId(risk, ['id', 'riskId']);
    if (!id || CLOSED_STATUSES.has(statusOf(risk))) continue;
    if (!risk.alertPriorityScore && hoursSince(first(risk.detectedAt, risk.lastSeenAt, risk.createdAt), nowDate) > staleRiskHours) {
      addUnique(findings, seen, makeFinding({
        type: 'preventive_risk_without_priority_decision',
        category: 'automation',
        severity: 'low',
        entityType: 'preventiveRisks',
        entityId: id,
        title: 'Riesgo preventivo sin score de prioridad',
        description: 'Un riesgo activo todavia no tiene decision del motor de prioridades.',
        whyDetected: ['preventiveRisk activo', 'alertPriorityScore vacio'],
        consequence: 'Puede aparecer como ruido no priorizado en operaciones.',
        recommendedAction: 'Dejar que el motor de prioridades lo procese o revisar errores del worker.',
        detectedAt: nowIso,
      }));
    }
  }

  findings.sort((a, b) => (a.priorityRank - b.priorityRank) || (b.priorityScore - a.priorityScore) || a.title.localeCompare(b.title));

  return {
    version: PLATFORM_SUPERVISION_VERSION,
    generatedAt: nowIso,
    thresholds: {
      automationHeartbeatHours: heartbeatHours,
      queuedJobStuckHours: queuedJobHours,
      processingJobStuckMinutes: processingJobMinutes,
      staleIncidentHours,
      staleRiskHours,
      scanLimit,
    },
    summary: findingSummary(findings),
    findings,
    total: findings.length,
  };
}
