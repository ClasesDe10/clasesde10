export const ADMIN_OPS_ENGINE_VERSION = 'admin-ops-engine-2026-06-29';

const OPEN_STATUSES = new Set(['nueva', 'nuevo', 'pendiente', 'pending', 'open', 'abierta', 'en_proceso', 'revision', 'pendiente_revision']);
const CLOSED_STATUSES = new Set(['cerrada', 'cerrado', 'resuelta', 'resolved', 'done', 'completada', 'archivada', 'archived']);
const PAID_STATUSES = new Set(['pagado', 'paid', 'validado', 'validated', 'succeeded', 'cobrado']);
const CANCELLED_STATUSES = new Set(['cancelada', 'cancelled', 'rechazado', 'rejected']);
const COMPLETED_CLASS_STATUSES = new Set(['realizada', 'completed', 'completada', 'pagada']);
const HIGH_PRIORITIES = new Set(['urgente', 'critical', 'critica', 'alta', 'high']);

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && clean(value) !== '');
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDay(value) {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : '';
}

function hoursSince(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return 0;
  return Math.max(0, (now.getTime() - date.getTime()) / 36e5);
}

function daysSince(value, now = new Date()) {
  return hoursSince(value, now) / 24;
}

function statusOf(item = {}) {
  return clean(first(item.status, item.estado, item.estado_verificacion, item.verificationStatus, item.lifecycleStatus)).toLowerCase();
}

function isOpen(item = {}) {
  const status = statusOf(item);
  return !status || OPEN_STATUSES.has(status) || (!CLOSED_STATUSES.has(status) && !CANCELLED_STATUSES.has(status));
}

function isPaymentPending(item = {}) {
  const status = clean(first(item.status, item.estado, item.paymentStatus, item.familyPaymentStatus)).toLowerCase();
  return !PAID_STATUSES.has(status) && !CANCELLED_STATUSES.has(status);
}

function isClassPendingAttention(item = {}, now = new Date()) {
  const status = statusOf(item);
  if (COMPLETED_CLASS_STATUSES.has(status) || CANCELLED_STATUSES.has(status)) return false;
  const end = first(item.endAtIso, item.end_at, item.fecha_fin, item.dateEnd);
  const start = first(item.startAtIso, item.fecha, item.date, item.createdAt, item.created_at);
  const reference = end || start;
  return reference && hoursSince(reference, now) >= 1;
}

function amountOf(item = {}) {
  return asNumber(first(item.amount, item.monto, item.precio_total, item.familyAmount, item.totalFamilia));
}

function displayName(item = {}, fallback = 'Sin nombre') {
  return clean(first(
    item.displayName,
    item.nombreCompleto,
    [item.nombre, item.apellidos].filter(Boolean).join(' '),
    [item.usuarios?.nombre, item.usuarios?.apellidos].filter(Boolean).join(' '),
    item.name,
    item.email,
    item.usuarios?.email,
    fallback,
  ), 180);
}

function teacherName(item = {}) {
  return displayName(item, 'Profesor');
}

function familyName(item = {}) {
  return displayName(item, 'Familia');
}

function textBlob(...parts) {
  return parts
    .flatMap((part) => Array.isArray(part) ? part : [part])
    .map((part) => {
      if (part === null || part === undefined) return '';
      if (typeof part === 'object') {
        try { return JSON.stringify(part); } catch (_) { return ''; }
      }
      return String(part);
    })
    .join(' ')
    .toLowerCase();
}

function itemId(prefix, item = {}, fallback = '') {
  return `${prefix}:${clean(first(item.id, item.uid, item.userUid, item.email, fallback), 180)}`;
}

function makeItem({
  id,
  type,
  title,
  detail,
  section,
  priority = 50,
  tone = 'info',
  entityType = '',
  entityId = '',
  entityName = '',
  actionLabel = 'Abrir',
  automation = '',
  minutesSaved = 5,
  value = 0,
  createdAt = '',
  dueAt = '',
  source = '',
  metadata = {},
} = {}) {
  return {
    id: clean(id || `${type}:${title}:${entityId}`, 220),
    type: clean(type, 80),
    title: clean(title, 180),
    detail: clean(detail, 500),
    section: clean(section, 80),
    priority: Math.max(0, Math.min(100, Math.round(asNumber(priority)))),
    tone: clean(tone || 'info', 40),
    entityType: clean(entityType, 80),
    entityId: clean(entityId, 180),
    entityName: clean(entityName, 180),
    actionLabel: clean(actionLabel, 80),
    automation: clean(automation, 160),
    minutesSaved: Math.max(1, Math.min(60, Math.round(asNumber(minutesSaved) || 5))),
    value: asNumber(value),
    createdAt: clean(createdAt, 80),
    dueAt: clean(dueAt, 80),
    source: clean(source, 120),
    metadata,
  };
}

function buildMatchesMap(matches = []) {
  const map = new Map();
  for (const match of matches || []) {
    const requestId = clean(first(match.requestId, match.solicitud_id, match.solicitudId));
    if (!requestId) continue;
    if (!map.has(requestId)) map.set(requestId, []);
    map.get(requestId).push(match);
  }
  return map;
}

function buildEntityMaps(dataset = {}) {
  return {
    teachers: new Map((dataset.profesores || []).map((item) => [clean(first(item.id, item.userUid, item.profesor_id)), item])),
    families: new Map((dataset.familias || []).map((item) => [clean(first(item.id, item.userUid, item.familyUid, item.familia_id)), item])),
    students: new Map((dataset.alumnos || []).map((item) => [clean(first(item.id, item.studentUid, item.alumno_id)), item])),
  };
}

export function buildAdminOpsModel(dataset = {}, options = {}) {
  const now = toDate(options.now) || new Date();
  const hidden = new Set(options.hiddenIds || []);
  const items = [];
  const matchesByRequest = buildMatchesMap(dataset.solicitudMatches || []);
  const maps = buildEntityMaps(dataset);

  for (const request of dataset.solicitudes || []) {
    const status = statusOf(request);
    const assignedTeacher = first(request.assignedTeacherUid, request.profesor_asignado_id, request.teacherUid);
    const age = hoursSince(first(request.createdAt, request.created_at, request.fecha), now);
    const requestId = clean(first(request.id, request.requestId, request.solicitud_id));
    const matches = matchesByRequest.get(requestId) || [];
    const activePlan = request.activeMatchingPlan || {};
    const activeAction = Array.isArray(activePlan.actions) ? activePlan.actions[0] : null;
    const activePriority = Number(activePlan.priorityRank || 0);
    if (!assignedTeacher && (!status || OPEN_STATUSES.has(status) || ['nueva', 'nuevo'].includes(status))) {
      items.push(makeItem({
        id: itemId('request.assign', request),
        type: 'matching',
        title: activeAction?.title || (age >= 24 ? 'Solicitud sin profesor desde ayer' : 'Nueva solicitud para asignar'),
        detail: activePlan.summary || `${clean(first(request.subject, request.materia, 'Materia'))} - ${clean(first(request.level, request.nivel, 'nivel sin indicar'))}. ${matches.length ? `${matches.length} candidato(s) calculados.` : 'Sin candidatos guardados todavia.'}`,
        section: 'solicitudes',
        priority: activePriority || (age >= 24 ? 96 : 86),
        tone: activePlan.priority === 'critical' ? 'danger' : activePlan.priority === 'high' ? 'warning' : age >= 24 ? 'danger' : 'warning',
        entityType: 'solicitud',
        entityId: requestId,
        entityName: clean(first(request.familyName, request.familia_nombre, request.familias?.usuarios?.nombre, 'Familia')),
        actionLabel: activeAction?.actionLabel || 'Asignar profesor',
        automation: activeAction?.automation || (matches.length ? 'Usar ranking de matching' : 'Lanzar matching automatico'),
        minutesSaved: activeAction ? 18 : matches.length ? 12 : 18,
        createdAt: first(request.createdAt, request.created_at),
        source: 'solicitudes',
        metadata: { matches: matches.length, ageHours: Math.round(age), activeMatchingStatus: activePlan.status || '' },
      }));
    }
  }

  for (const payment of dataset.pagos || []) {
    if (!isPaymentPending(payment)) continue;
    const due = first(payment.dueAt, payment.fecha_vencimiento, payment.createdAt, payment.created_at);
    const overdue = due && toDate(due) && toDate(due).getTime() < now.getTime();
    items.push(makeItem({
      id: itemId('payment.pending', payment),
      type: 'payment',
      title: overdue ? 'Pago vencido' : 'Pago pendiente de validacion',
      detail: `${clean(first(payment.paymentType, payment.tipo, payment.method, payment.metodo, 'pago'))} - ${amountOf(payment).toFixed(2)} EUR`,
      section: 'pagos',
      priority: overdue ? 94 : 78,
      tone: overdue ? 'danger' : 'warning',
      entityType: 'pago',
      entityId: clean(first(payment.id, payment.paymentId)),
      entityName: clean(first(payment.familyName, payment.teacherName, payment.familia_nombre, payment.profesor_nombre, payment.email, 'Pago')),
      actionLabel: overdue ? 'Resolver pago' : 'Validar pago',
      automation: overdue ? 'Enviar recordatorio y crear incidencia si se repite' : 'Conciliar justificante',
      minutesSaved: overdue ? 14 : 8,
      value: amountOf(payment),
      dueAt: due,
      createdAt: first(payment.createdAt, payment.created_at),
      source: 'pagos',
    }));
  }

  for (const klass of dataset.clases || []) {
    if (!isClassPendingAttention(klass, now)) continue;
    items.push(makeItem({
      id: itemId('class.unconfirmed', klass),
      type: 'class',
      title: 'Clase finalizada sin confirmar',
      detail: `${clean(first(klass.subject, klass.materia, 'Clase'))} - ${clean(first(klass.studentName, klass.alumno_nombre, klass.studentId, 'Alumno'))}`,
      section: 'clases',
      priority: 84,
      tone: 'warning',
      entityType: 'clase',
      entityId: clean(first(klass.id, klass.classId)),
      entityName: clean(first(klass.teacherName, klass.profesor_nombre, klass.familyName, klass.familia_nombre, 'Clase')),
      actionLabel: 'Revisar clase',
      automation: 'Recordar confirmacion a profesor y familia',
      minutesSaved: 10,
      value: amountOf(klass),
      createdAt: first(klass.startAtIso, klass.fecha, klass.createdAt),
      source: 'clases',
    }));
  }

  for (const incident of dataset.incidencias || []) {
    if (!isOpen(incident)) continue;
    const priorityLabel = clean(first(incident.priority, incident.prioridad, incident.priorityLabel)).toLowerCase();
    const urgent = HIGH_PRIORITIES.has(priorityLabel) || asNumber(incident.priorityRank) <= 2;
    items.push(makeItem({
      id: itemId('incident.open', incident),
      type: 'incident',
      title: urgent ? 'Incidencia critica abierta' : 'Incidencia abierta',
      detail: clean(first(incident.title, incident.titulo, incident.category, incident.categoria, incident.description, incident.descripcion, 'Incidencia')),
      section: 'incidencias',
      priority: urgent ? 98 : 82,
      tone: urgent ? 'danger' : 'warning',
      entityType: 'incidencia',
      entityId: clean(first(incident.id, incident.ticketId)),
      entityName: clean(first(incident.entityName, incident.userName, incident.reportedByName, incident.email, 'Usuario')),
      actionLabel: 'Gestionar incidencia',
      automation: 'Asignar responsable y actualizar SLA',
      minutesSaved: urgent ? 16 : 8,
      createdAt: first(incident.createdAt, incident.created_at),
      source: 'incidencias',
    }));
  }

  for (const doc of dataset.documentos || []) {
    const status = statusOf(doc);
    const expiresAt = first(doc.expiresAt, doc.expirationDate, doc.fecha_caducidad);
    const daysToExpire = expiresAt && toDate(expiresAt) ? (toDate(expiresAt).getTime() - now.getTime()) / 864e5 : null;
    const pending = OPEN_STATUSES.has(status) || ['pendiente', 'en_revision'].includes(status);
    const expired = daysToExpire !== null && daysToExpire < 0;
    const expiring = daysToExpire !== null && daysToExpire <= 30;
    if (!pending && !expired && !expiring) continue;
    items.push(makeItem({
      id: itemId(expired ? 'document.expired' : 'document.pending', doc),
      type: 'document',
      title: expired ? 'Documento caducado' : expiring ? 'Documento caduca pronto' : 'Documento pendiente de revision',
      detail: `${clean(first(doc.type, doc.tipo, doc.documentType, 'documento'))} - ${clean(first(doc.ownerRole, doc.role, 'usuario'))}`,
      section: 'documentos',
      priority: expired ? 90 : pending ? 76 : 68,
      tone: expired ? 'danger' : 'warning',
      entityType: 'documento',
      entityId: clean(first(doc.id, doc.documentId)),
      entityName: clean(first(doc.ownerName, doc.userName, doc.email, doc.ownerUid, 'Usuario')),
      actionLabel: 'Revisar documento',
      automation: expired ? 'Pedir renovacion automatica' : 'Validar o solicitar correccion',
      minutesSaved: 7,
      dueAt: expiresAt,
      createdAt: first(doc.createdAt, doc.created_at),
      source: 'documentos',
    }));
  }

  for (const teacher of dataset.profesores || []) {
    const status = statusOf(teacher);
    const score = asNumber(first(teacher.profileCompletionPercent, teacher.reputationMetrics?.profileCompletionPercent, teacher.trustProfile?.metrics?.profileCompletionPercent));
    const inactiveDays = asNumber(first(teacher.reputationMetrics?.inactiveDays, teacher.trustProfile?.metrics?.inactiveDays));
    const entityId = clean(first(teacher.id, teacher.userUid, teacher.profesor_id));
    if (['pendiente', 'pendiente_revision', 'revision'].includes(status)) {
      items.push(makeItem({
        id: itemId('teacher.verify', teacher),
        type: 'teacher',
        title: score >= 85 ? 'Profesor listo para verificar' : 'Profesor pendiente de completar perfil',
        detail: `${teacherName(teacher)} - perfil ${Math.round(score || 0)}%`,
        section: 'profesores',
        priority: score >= 85 ? 80 : 62,
        tone: score >= 85 ? 'success' : 'warning',
        entityType: 'profesor',
        entityId,
        entityName: teacherName(teacher),
        actionLabel: score >= 85 ? 'Verificar' : 'Abrir CRM',
        automation: score >= 85 ? 'Validar documentos y activar' : 'Enviar checklist de perfil',
        minutesSaved: 9,
        createdAt: first(teacher.createdAt, teacher.created_at),
        source: 'profesores',
      }));
    }
    if (inactiveDays >= 45 && !CANCELLED_STATUSES.has(status)) {
      items.push(makeItem({
        id: itemId('teacher.inactive', teacher),
        type: 'teacher',
        title: 'Profesor inactivo',
        detail: `${teacherName(teacher)} lleva ${Math.round(inactiveDays)} dias sin actividad relevante.`,
        section: 'profesores',
        priority: 48,
        tone: 'info',
        entityType: 'profesor',
        entityId,
        entityName: teacherName(teacher),
        actionLabel: 'Reactivar',
        automation: 'Crear seguimiento de reactivacion',
        minutesSaved: 6,
        source: 'profesores',
      }));
    }
  }

  for (const family of dataset.familias || []) {
    const metrics = family.reputationMetrics || family.trustProfile?.metrics || {};
    const entityId = clean(first(family.id, family.userUid, family.familyUid, family.familia_id));
    if (asNumber(metrics.pendingPayments) > 0) {
      items.push(makeItem({
        id: itemId('family.payment-risk', family),
        type: 'family',
        title: 'Familia con pagos pendientes',
        detail: `${familyName(family)} - ${asNumber(metrics.pendingPayments)} pago(s) pendientes.`,
        section: 'familias',
        priority: 74,
        tone: 'warning',
        entityType: 'familia',
        entityId,
        entityName: familyName(family),
        actionLabel: 'Abrir CRM',
        automation: 'Seguimiento de cobro',
        minutesSaved: 7,
        source: 'familias',
      }));
    }
  }

  for (const lead of dataset.leadsPublicos || []) {
    const status = statusOf(lead);
    if (!['nuevo', 'nueva', ''].includes(status)) continue;
    const age = hoursSince(first(lead.createdAt, lead.created_at), now);
    items.push(makeItem({
      id: itemId('lead.new', lead),
      type: 'lead',
      title: age >= 24 ? 'Lead nuevo sin contactar' : 'Lead nuevo',
      detail: `${clean(first(lead.tipo, 'lead'))} - ${displayName(lead, 'Lead')} - ${clean(first(lead.asunto, lead.mensaje, lead.email, ''))}`,
      section: 'leads',
      priority: age >= 24 ? 82 : 65,
      tone: age >= 24 ? 'warning' : 'info',
      entityType: 'lead',
      entityId: clean(first(lead.id, lead.email)),
      entityName: displayName(lead, 'Lead'),
      actionLabel: 'Contactar',
      automation: 'Convertir en solicitud o cerrar',
      minutesSaved: 6,
      createdAt: first(lead.createdAt, lead.created_at),
      source: 'leadsPublicos',
    }));
  }

  for (const task of dataset.crmTasks || []) {
    const status = statusOf(task);
    if (CLOSED_STATUSES.has(status)) continue;
    const dueAt = first(task.dueAt, task.fecha_vencimiento);
    const overdue = dueAt && toDate(dueAt) && toDate(dueAt).getTime() < now.getTime();
    if (!overdue) continue;
    items.push(makeItem({
      id: itemId('crm-task.overdue', task),
      type: 'task',
      title: 'Tarea CRM vencida',
      detail: clean(first(task.title, task.body, 'Tarea pendiente')),
      section: first(task.entityType) === 'familia' ? 'familias' : 'profesores',
      priority: 79,
      tone: 'warning',
      entityType: clean(first(task.entityType, 'crmTask')),
      entityId: clean(first(task.entityId, task.id)),
      entityName: clean(first(task.entityName, 'CRM')),
      actionLabel: 'Abrir seguimiento',
      automation: 'Reprogramar o completar tarea',
      minutesSaved: 5,
      dueAt,
      createdAt: first(task.createdAt, task.created_at),
      source: 'crmTasks',
    }));
  }

  for (const chat of dataset.chats || []) {
    const schedulingStatus = clean(first(chat.schedulingStatus, chat.estado_programacion, chat.relationshipStage)).toLowerCase();
    const stale = hoursSince(first(chat.updatedAt, chat.updated_at, chat.createdAt, chat.created_at), now) >= 48;
    if (!stale || !['pendiente_horario', 'pending_schedule', 'pendiente'].includes(schedulingStatus)) continue;
    items.push(makeItem({
      id: itemId('chat.schedule-stale', chat),
      type: 'chat',
      title: 'Chat sin horario cerrado',
      detail: `${clean(first(chat.subject, chat.materia, 'Clase'))} - pendiente de decidir horas.`,
      section: 'chats',
      priority: 72,
      tone: 'warning',
      entityType: 'chat',
      entityId: clean(first(chat.id, chat.assignmentId)),
      entityName: clean(first(chat.familyName, chat.teacherName, 'Chat')),
      actionLabel: 'Abrir chat',
      automation: 'Recordar propuesta de horario',
      minutesSaved: 8,
      createdAt: first(chat.updatedAt, chat.createdAt),
      source: 'chats',
    }));
  }

  const visibleItems = items
    .filter((item) => !hidden.has(item.id))
    .sort((a, b) => (b.priority - a.priority) || (asNumber(b.value) - asNumber(a.value)) || a.title.localeCompare(b.title));

  const summary = {
    total: visibleItems.length,
    urgent: visibleItems.filter((item) => item.priority >= 85).length,
    revenueAtRisk: Math.round(visibleItems.filter((item) => item.type === 'payment').reduce((sum, item) => sum + asNumber(item.value), 0)),
    waitingMatching: visibleItems.filter((item) => item.type === 'matching').length,
    pendingDocuments: visibleItems.filter((item) => item.type === 'document').length,
    openIncidents: visibleItems.filter((item) => item.type === 'incident').length,
    overdueTasks: visibleItems.filter((item) => item.type === 'task').length,
    estimatedMinutesSaved: visibleItems.reduce((sum, item) => sum + asNumber(item.minutesSaved), 0),
  };

  const automationGroups = [
    { type: 'payment_reminder', label: 'Recordatorios de pago', section: 'pagos', count: visibleItems.filter((item) => item.type === 'payment' && item.priority >= 85).length },
    { type: 'matching_followup', label: 'Matching y asignacion', section: 'solicitudes', count: visibleItems.filter((item) => item.type === 'matching').length },
    { type: 'class_confirmation', label: 'Confirmacion de clases', section: 'clases', count: visibleItems.filter((item) => item.type === 'class').length },
    { type: 'document_review', label: 'Revision documental', section: 'documentos', count: visibleItems.filter((item) => item.type === 'document').length },
    { type: 'crm_followup', label: 'Seguimientos CRM', section: 'profesores', count: visibleItems.filter((item) => ['teacher', 'family', 'task'].includes(item.type)).length },
  ].filter((item) => item.count > 0);

  return {
    version: ADMIN_OPS_ENGINE_VERSION,
    generatedAt: now.toISOString(),
    summary,
    items: visibleItems,
    topItems: visibleItems.slice(0, 12),
    automationGroups,
    searchIndex: buildGlobalSearchIndex(dataset, visibleItems, maps),
  };
}

export function buildGlobalSearchIndex(dataset = {}, opsItems = [], maps = buildEntityMaps(dataset)) {
  const rows = [];
  const push = (row) => rows.push({
    id: clean(row.id, 220),
    type: clean(row.type, 80),
    title: clean(row.title, 180),
    subtitle: clean(row.subtitle, 300),
    section: clean(row.section, 80),
    entityId: clean(row.entityId, 180),
    entityType: clean(row.entityType, 80),
    score: asNumber(row.score),
    keywords: textBlob(row.title, row.subtitle, row.keywords),
  });

  for (const teacher of dataset.profesores || []) {
    push({
      id: itemId('search.teacher', teacher),
      type: 'profesor',
      title: teacherName(teacher),
      subtitle: `${clean(first(teacher.email, teacher.usuarios?.email, ''))} - ${asArray(first(teacher.materias, teacher.subjects)).slice(0, 4).join(', ')}`,
      section: 'profesores',
      entityId: clean(first(teacher.id, teacher.userUid, teacher.profesor_id)),
      entityType: 'profesor',
      score: asNumber(first(teacher.trustScore, teacher.trustProfile?.score)),
      keywords: teacher,
    });
  }

  for (const family of dataset.familias || []) {
    push({
      id: itemId('search.family', family),
      type: 'familia',
      title: familyName(family),
      subtitle: `${clean(first(family.email, family.usuarios?.email, ''))} - ${clean(first(family.city, family.ciudad, family.zone, family.zona, ''))}`,
      section: 'familias',
      entityId: clean(first(family.id, family.userUid, family.familyUid, family.familia_id)),
      entityType: 'familia',
      score: asNumber(first(family.trustScore, family.trustProfile?.score)),
      keywords: family,
    });
  }

  for (const student of dataset.alumnos || []) {
    push({
      id: itemId('search.student', student),
      type: 'alumno',
      title: displayName(student, 'Alumno'),
      subtitle: `${clean(first(student.level, student.nivel, student.course, student.curso, ''))} - ${clean(first(student.school, student.colegio, ''))}`,
      section: 'alumnos',
      entityId: clean(first(student.id, student.studentUid, student.alumno_id)),
      entityType: 'alumno',
      score: 40,
      keywords: student,
    });
  }

  for (const request of dataset.solicitudes || []) {
    const teacher = maps.teachers.get(clean(first(request.assignedTeacherUid, request.teacherUid, request.profesor_asignado_id)));
    push({
      id: itemId('search.request', request),
      type: 'solicitud',
      title: clean(first(request.subject, request.materia, 'Solicitud')),
      subtitle: `${clean(first(request.level, request.nivel, ''))} - ${teacher ? teacherName(teacher) : clean(first(request.status, request.estado, 'sin asignar'))}`,
      section: 'solicitudes',
      entityId: clean(first(request.id, request.requestId, request.solicitud_id)),
      entityType: 'solicitud',
      score: 55,
      keywords: request,
    });
  }

  for (const item of opsItems || []) {
    push({
      id: `ops:${item.id}`,
      type: `accion_${item.type}`,
      title: item.title,
      subtitle: item.detail,
      section: item.section,
      entityId: item.entityId,
      entityType: item.entityType,
      score: item.priority,
      keywords: item,
    });
  }

  return rows.sort((a, b) => b.score - a.score);
}

export function searchOpsIndex(index = [], query = '', limit = 8) {
  const tokens = clean(query, 160).toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  return (index || [])
    .map((row) => {
      const haystack = `${row.title} ${row.subtitle} ${row.keywords}`.toLowerCase();
      const matches = tokens.filter((token) => haystack.includes(token)).length;
      const starts = tokens.some((token) => row.title.toLowerCase().startsWith(token)) ? 20 : 0;
      return { ...row, matchScore: matches * 30 + starts + asNumber(row.score) / 5 };
    })
    .filter((row) => row.matchScore >= 30)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
}

export function summarizeOpsForClipboard(model = {}) {
  const s = model.summary || {};
  const lines = [
    `Bandeja operativa ClasesDe10 (${(model.generatedAt || '').slice(0, 16)})`,
    `Urgentes: ${s.urgent || 0}`,
    `Solicitudes sin profesor: ${s.waitingMatching || 0}`,
    `Pagos en riesgo: ${s.revenueAtRisk || 0} EUR`,
    `Documentos pendientes: ${s.pendingDocuments || 0}`,
    `Incidencias abiertas: ${s.openIncidents || 0}`,
    '',
    'Siguientes acciones:',
    ...(model.topItems || []).slice(0, 8).map((item, index) => `${index + 1}. [${item.priority}] ${item.title} - ${item.detail}`),
  ];
  return lines.join('\n');
}
