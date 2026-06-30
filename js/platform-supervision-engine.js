export const PLATFORM_SUPERVISION_VERSION = 'platform-supervision-2026-06-30';

const CLOSED_STATUSES = new Set(['cerrada', 'cerrado', 'resuelta', 'resolved', 'done', 'completada', 'archivada', 'archived', 'cancelada', 'cancelled', 'rechazada', 'rejected']);
const ACTIVE_STATUSES = new Set(['', 'active', 'activa', 'open', 'abierta', 'pendiente', 'pending', 'en_proceso', 'revision', 'asignada', 'assigned']);
const ASSIGNED_REQUEST_STATUSES = new Set(['asignada', 'assigned', 'aceptada', 'accepted', 'profesor_asignado', 'teacher_assigned']);
const COMPLETED_CLASS_STATUSES = new Set(['realizada', 'completed', 'completada', 'finalizada', 'done']);
const SCHEDULED_CLASS_STATUSES = new Set(['programada', 'scheduled', 'confirmada', 'confirmed', 'pendiente', 'pending']);
const PAID_STATUSES = new Set(['pagado', 'paid', 'validado', 'validated', 'succeeded', 'cobrado', 'liquidado']);
const PAYMENT_OPEN_STATUSES = new Set(['pendiente', 'pending', 'open', 'abierta', 'solicitado', 'requested', 'en_revision', 'needs_review', 'vencido', 'overdue']);

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
  return lower(first(item.status, item.estado, item.paymentStatus, item.familyPaymentStatus, item.reconciliationStatus));
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
  for (const assignment of assignments) {
    if (!isActiveAssignment(assignment)) continue;
    const key = `${familyUid(assignment)}__${teacherUid(assignment)}__${studentId(assignment)}`;
    if (key.replaceAll('_', '')) assignmentsByPair.set(key, assignment);
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

  for (const klass of classes) {
    const id = classId(klass);
    const status = statusOf(klass);
    const amount = amountOf(klass);
    const missing = [
      !teacherUid(klass) ? 'profesor' : '',
      !familyUid(klass) ? 'familia' : '',
      !studentId(klass) ? 'alumno' : '',
      !first(klass.startAtIso, klass.fecha, klass.date, klass.startAt) ? 'fecha' : '',
    ].filter(Boolean);
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
    if (!id || !isOpenStatus(incident)) continue;
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
