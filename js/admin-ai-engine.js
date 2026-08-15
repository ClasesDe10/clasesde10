/**
 * ClasesDe10 - Admin AI engine.
 *
 * Free, deterministic and evidence-first. The admin assistant answers from
 * structured platform data instead of inventing with a generic LLM.
 */

export const ADMIN_AI_VERSION = 'admin_ai_ops_v3_solution_finder';

export const ADMIN_AI_EXAMPLES = [
  'Ha pasado algo raro con un pago: cual es la mejor solucion?',
  'Una familia tiene un justificante rechazado, que hago?',
  'Una clase no aparece en el calendario, como lo arreglo?',
  'Sale missing or insufficient permissions, que solucion aplico?',
  'Que deberia revisar hoy?',
  'Como va el negocio?',
  'Que profesores llevan mas de un mes sin recibir alumnos?',
  'Que familias tienen pagos pendientes?',
  'Que procesos pueden automatizarse?',
];

const COMPLETED_STATUSES = new Set(['realizada', 'completada', 'completed', 'pagada', 'paid']);
const CANCELLED_STATUSES = new Set(['cancelada', 'cancelled', 'canceled']);
const ACTIVE_NEGATIVE_STATUSES = new Set(['rechazado', 'rejected', 'inactivo', 'inactive', 'bloqueado', 'blocked']);
const VERIFIED_STATUSES = new Set(['verificado', 'verified', 'activo', 'active', 'aprobado', 'approved']);
const PAYMENT_PENDING_STATUSES = new Set(['pendiente', 'pending', 'solicitado', 'procesando', 'vencido', 'overdue', 'needs_review', 'requiere_accion']);
const PAYMENT_DONE_STATUSES = new Set(['pagado', 'paid', 'validado', 'validated', 'succeeded', 'completado']);
const INCIDENT_OPEN_STATUSES = new Set(['abierta', 'open', 'pendiente', 'pending', 'en_proceso', 'review', 'en_revision']);
const DOCUMENT_REVIEW_STATUSES = new Set(['', 'pendiente', 'pending', 'pendiente_revision', 'pending_review', 'en_revision', 'revision', 'revisar', 'subido', 'uploaded', 'nuevo', 'new']);
const DOCUMENT_CLOSED_STATUSES = new Set(['validado', 'verificado', 'verified', 'aprobado', 'approved', 'rechazado', 'rejected', 'no_valido', 'invalid', 'caducado', 'expired']);

function clean(value, max = 4000) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function normalize(value) {
  return clean(value, 1000)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && clean(value) !== '');
}

function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item, 180)).filter(Boolean);
  return clean(value)
    .split(/[,;/+|]|\sy\s/i)
    .map((item) => clean(item, 180))
    .filter(Boolean);
}

function asNumber(value) {
  const raw = clean(value).replace(',', '.');
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function clamp(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.toMillis === 'function') return new Date(value.toMillis());
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value === 'number') return new Date(value);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function isoDate(value) {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : '';
}

function daysSince(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86400000));
}

function hoursBetween(startValue, endValue) {
  const start = toDate(startValue);
  const end = toDate(endValue);
  if (!start || !end) return null;
  const hours = (end.getTime() - start.getTime()) / 3600000;
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

function latestDate(values = []) {
  return values.map(toDate).filter(Boolean).sort((a, b) => b.getTime() - a.getTime())[0] || null;
}

function startOfWeek(date = new Date()) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return copy;
}

function inRange(value, start, end = new Date()) {
  const date = toDate(value);
  return Boolean(date && date >= start && date <= end);
}

function formatEuros(value) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(asNumber(value));
}

function formatPercent(value) {
  return `${round(value, 1)}%`;
}

function statusOf(item = {}) {
  return normalize(first(item.status, item.estado, item.estado_verificacion, item.verificationStatus, item.lifecycleStatus));
}

function paymentStatus(item = {}) {
  return normalize(first(item.familyPaymentStatus, item.estado_pago_familia, item.paymentStatus, item.estado, item.status, item.reconciliationStatus));
}

function createdAt(item = {}) {
  return first(item.createdAt, item.created_at, item.fecha, item.date, item.updatedAt, item.updated_at);
}

function updatedAt(item = {}) {
  return first(item.updatedAt, item.updated_at, item.lastSeenAt, item.lastLoginAt, item.createdAt, item.created_at);
}

function classDate(item = {}) {
  return first(item.fecha, item.date, item.scheduledStartAt, item.startAt, item.createdAt, item.created_at);
}

function isActive(item = {}) {
  return item.active !== false && item.activo !== false && !ACTIVE_NEGATIVE_STATUSES.has(statusOf(item));
}

function isVerified(item = {}) {
  return VERIFIED_STATUSES.has(statusOf(item)) || item.verified === true || item.verificado === true;
}

function isCompletedClass(item = {}) {
  return COMPLETED_STATUSES.has(statusOf(item));
}

function isCancelledClass(item = {}) {
  return CANCELLED_STATUSES.has(statusOf(item));
}

function isPendingPayment(item = {}) {
  return PAYMENT_PENDING_STATUSES.has(paymentStatus(item)) && !isTeacherPayout(item);
}

function isDonePayment(item = {}) {
  return PAYMENT_DONE_STATUSES.has(paymentStatus(item));
}

function isTeacherPayout(item = {}) {
  return ['teacher_payout', 'pago_profesor'].includes(clean(first(item.paymentType, item.tipo)).toLowerCase());
}

function isOpenIncident(item = {}) {
  return INCIDENT_OPEN_STATUSES.has(statusOf(item));
}

function isPendingDocumentReview(item = {}) {
  const status = statusOf(item);
  if (DOCUMENT_CLOSED_STATUSES.has(status)) return false;
  if (DOCUMENT_REVIEW_STATUSES.has(status)) return true;
  return /pendiente|pending|revision|review|subido|uploaded|nuevo/.test(status);
}

function isUnassignedRequest(item = {}) {
  return ['nueva', 'nuevo', 'pendiente', 'open', ''].includes(statusOf(item))
    && !first(item.assignedTeacherUid, item.profesor_asignado_id, item.teacherUid, item.profesor_id);
}

function isClassNeedingClosure(item = {}) {
  if (isCompletedClass(item) || isCancelledClass(item)) return false;
  const age = daysSince(classDate(item));
  return age !== null && age > 1;
}

function idFrom(item = {}, fields = []) {
  return clean(first(...fields.map((field) => item[field])), 180);
}

function teacherId(item = {}) {
  return idFrom(item, ['teacherUid', 'profesor_id', 'teacherUserUid', 'userUid', 'usuario_id', 'id', 'uid']);
}

function familyId(item = {}) {
  return idFrom(item, ['familyUid', 'familia_id', 'parentUid', 'userUid', 'usuario_id', 'id', 'uid']);
}

function studentId(item = {}) {
  return idFrom(item, ['studentId', 'studentUid', 'alumno_id', 'id']);
}

function requestId(item = {}) {
  return idFrom(item, ['requestId', 'solicitud_id', 'id']);
}

function displayName(item = {}, fallback = 'Sin nombre') {
  const nested = item.usuarios || {};
  return clean([
    first(item.nombre, nested.nombre, item.name, item.displayName),
    first(item.apellidos, nested.apellidos, item.lastName),
  ].filter(Boolean).join(' '), 180)
    || clean(first(item.email, nested.email, item.id), 180)
    || fallback;
}

function cityOf(item = {}) {
  return clean(first(item.ciudad, item.city, item.localidad, item.zona, item.zone, item.provincia), 120) || 'Sin ciudad';
}

function subjectOf(item = {}) {
  return clean(first(item.materia, item.subject, item.asignatura, item.metadata?.materia, item.asunto), 120) || 'Sin asignatura';
}

function normalizedSubjects(value) {
  return asArray(value).map(normalize).filter(Boolean);
}

function amountOf(item = {}) {
  return asNumber(first(item.monto, item.amount, item.precio_total, item.familyAmount, item.totalFamilia));
}

function teacherSubjects(teacher = {}) {
  return normalizedSubjects(first(teacher.materias, teacher.subjects, teacher.materiasTexto, teacher.especialidades));
}

function row(label, metric, detail, extra = {}) {
  return {
    label: clean(label, 180),
    metric: clean(metric, 120),
    detail: clean(detail, 500),
    ...extra,
  };
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items || []) {
    const key = clean(keyFn(item), 180);
    if (!key) continue;
    const current = map.get(key) || [];
    current.push(item);
    map.set(key, current);
  }
  return map;
}

function average(values = []) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function teacherResponseFromMessages(data) {
  const chatsById = new Map((data.chats || []).map((chat) => [clean(chat.id), chat]));
  const messagesByChat = groupBy(data.messages || [], (message) => first(message.chatId, message.threadId));
  const responseHoursByTeacher = new Map();

  for (const [chatId, messages] of messagesByChat.entries()) {
    const chat = chatsById.get(chatId) || {};
    const teacher = clean(first(chat.teacherUid, chat.profesor_id, chat.teacherUserUid));
    const family = clean(first(chat.familyUid, chat.familia_id, chat.parentUid));
    if (!teacher || !family) continue;

    const sorted = messages
      .map((message) => ({ ...message, date: toDate(first(message.createdAt, message.created_at, message.sentAt)) }))
      .filter((message) => message.date)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    let pendingFamilyMessage = null;
    for (const message of sorted) {
      const sender = clean(first(message.senderUid, message.userUid, message.fromUid));
      if (!sender) continue;
      if (sender === family) {
        pendingFamilyMessage = message;
      } else if (sender === teacher && pendingFamilyMessage) {
        const hours = hoursBetween(pendingFamilyMessage.date, message.date);
        if (hours !== null) {
          const current = responseHoursByTeacher.get(teacher) || [];
          current.push(hours);
          responseHoursByTeacher.set(teacher, current);
        }
        pendingFamilyMessage = null;
      }
    }
  }

  return responseHoursByTeacher;
}

function buildTeacherStats(data, now) {
  const classesByTeacher = groupBy(data.classes, teacherId);
  const assignmentsByTeacher = groupBy(data.assignments, teacherId);
  const requestsByTeacher = groupBy(data.requests, (item) => clean(first(item.assignedTeacherUid, item.profesor_asignado_id)));
  const matchesByTeacher = groupBy(data.requestMatches, teacherId);
  const messagesResponse = teacherResponseFromMessages(data);

  return (data.teachers || []).map((teacher) => {
    const id = teacherId(teacher);
    const classes = classesByTeacher.get(id) || [];
    const assignments = assignmentsByTeacher.get(id) || [];
    const requests = requestsByTeacher.get(id) || [];
    const matches = matchesByTeacher.get(id) || [];
    const completed = classes.filter(isCompletedClass);
    const cancelled = classes.filter(isCancelledClass);
    const activeAssignments = assignments.filter(isActive);
    const activeStudents = new Set(activeAssignments.map(studentId).filter(Boolean));
    const responseSamples = messagesResponse.get(id) || [];
    const measuredResponse = average(responseSamples);
    const responseHours = measuredResponse ?? asNumber(first(
      teacher.reputationMetrics?.averageResponseHours,
      teacher.trustProfile?.metrics?.averageResponseHours,
      teacher.responseTimeHours,
      teacher.tiempo_respuesta_horas,
      teacher.avgResponseHours,
    ));
    const acceptedMatches = matches.filter((item) => ['asignado', 'assigned', 'selected', 'aceptado', 'accepted'].includes(statusOf(item))).length;
    const acceptanceRate = matches.length ? (acceptedMatches / matches.length) * 100 : asNumber(first(teacher.acceptanceRate, teacher.ratio_aceptacion));
    const lastActivity = latestDate([
      updatedAt(teacher),
      ...classes.map(classDate),
      ...assignments.map(createdAt),
      ...requests.map(createdAt),
    ]);
    const lastStudentAt = latestDate([
      ...assignments.map(createdAt),
      ...classes.map(classDate),
    ]);
    const trustScore = asNumber(first(teacher.trustScore, teacher.trustProfile?.score, teacher.reputationMetrics?.trustScore));
    const profileCompletion = asNumber(first(teacher.profileCompletionPercent, teacher.reputationMetrics?.profileCompletionPercent));
    const paidClasses = completed.filter((item) => isDonePayment(item));
    const completionRate = classes.length ? (completed.length / Math.max(1, classes.length - cancelled.length)) * 100 : 0;
    const cancellationRate = classes.length ? (cancelled.length / classes.length) * 100 : 0;
    const highlightScore = Math.round(
      trustScore
      + Math.min(30, completed.filter((item) => (daysSince(classDate(item), now) ?? 999) <= 45).length * 5)
      + Math.min(18, activeStudents.size * 4)
      + Math.min(12, asNumber(first(teacher.valoracion_media, teacher.averageRating, teacher.rating)) * 2)
      + Math.min(10, acceptanceRate / 10)
      - Math.min(18, responseHours / 3)
      - Math.min(16, cancellationRate / 3)
    );

    return {
      id,
      teacher,
      name: displayName(teacher, 'Profesor'),
      email: clean(first(teacher.email, teacher.usuarios?.email), 180),
      city: cityOf(teacher),
      subjects: teacherSubjects(teacher),
      active: isActive(teacher),
      verified: isVerified(teacher),
      trustScore,
      profileCompletion,
      responseHours,
      responseSamples: responseSamples.length,
      acceptanceRate,
      classes,
      completed,
      cancelled,
      assignments,
      activeAssignments,
      activeStudents: activeStudents.size,
      lastActivity,
      lastStudentAt,
      inactiveDays: daysSince(lastActivity, now),
      noNewStudentDays: daysSince(lastStudentAt, now),
      completionRate,
      cancellationRate,
      paidCoverage: completed.length ? (paidClasses.length / completed.length) * 100 : 0,
      highlightScore: clamp(highlightScore, 0, 160),
      section: 'profesores',
    };
  });
}

function buildFamilyStats(data, now) {
  const classesByFamily = groupBy(data.classes, familyId);
  const studentsByFamily = groupBy(data.students, familyId);
  const paymentsByFamily = groupBy(data.payments, familyId);
  const incidentsByFamily = groupBy(data.incidents, familyId);
  const requestsByFamily = groupBy(data.requests, familyId);

  return (data.families || []).map((family) => {
    const id = familyId(family);
    const classes = classesByFamily.get(id) || [];
    const students = studentsByFamily.get(id) || [];
    const payments = paymentsByFamily.get(id) || [];
    const incidents = incidentsByFamily.get(id) || [];
    const requests = requestsByFamily.get(id) || [];
    const pendingPayments = payments.filter(isPendingPayment);
    const overduePayments = pendingPayments.filter((item) => paymentStatus(item) === 'vencido' || paymentStatus(item) === 'overdue' || ((daysSince(first(item.dueAt, item.due_at), now) ?? -1) > 0));
    const completed = classes.filter(isCompletedClass);
    const openIncidents = incidents.filter(isOpenIncident);
    const lastActivity = latestDate([
      updatedAt(family),
      ...classes.map(classDate),
      ...payments.map(createdAt),
      ...requests.map(createdAt),
    ]);
    const trustScore = asNumber(first(family.trustScore, family.trustProfile?.score, family.reputationMetrics?.trustScore));
    const churnScore = clamp(
      (overduePayments.length * 24)
      + (overduePayments.length * 8)
      + (pendingPayments.length * 12)
      + (openIncidents.length * 18)
      + Math.min(30, (daysSince(lastActivity, now) || 0) * 0.8)
      + (completed.length ? 0 : 12)
      - Math.min(18, trustScore / 5),
      0,
      100,
    );

    return {
      id,
      family,
      name: displayName(family, 'Familia'),
      email: clean(first(family.email, family.usuarios?.email), 180),
      city: cityOf(family),
      active: isActive(family),
      trustScore,
      classes,
      students,
      payments,
      pendingPayments,
      overduePayments,
      pendingAmount: pendingPayments.reduce((sum, item) => sum + amountOf(item), 0),
      incidents,
      openIncidents,
      requests,
      completed,
      lastActivity,
      inactiveDays: daysSince(lastActivity, now),
      churnScore,
      section: 'familias',
    };
  });
}

function buildSubjectDemand(data, teacherStats) {
  const verifiedSupply = teacherStats.filter((item) => item.active && item.verified);
  const supplyBySubject = new Map();
  verifiedSupply.forEach((teacher) => {
    teacher.subjects.forEach((subject) => {
      supplyBySubject.set(subject, (supplyBySubject.get(subject) || 0) + 1);
    });
  });

  const recentRequests = (data.requests || []).filter((item) => {
    const age = daysSince(createdAt(item));
    return age === null || age <= 60;
  });
  const openRequests = recentRequests.filter((item) => ['nueva', 'nuevo', 'pendiente', 'open', ''].includes(statusOf(item)) || !first(item.assignedTeacherUid, item.profesor_asignado_id));
  const demandBySubject = new Map();
  [...recentRequests, ...openRequests].forEach((request) => {
    const subject = normalize(subjectOf(request));
    demandBySubject.set(subject, (demandBySubject.get(subject) || 0) + (openRequests.includes(request) ? 2 : 1));
  });

  return [...demandBySubject.entries()].map(([subject, demand]) => {
    const supply = supplyBySubject.get(subject) || 0;
    const gap = Math.max(0, demand - supply * 2);
    return {
      subject,
      demand,
      supply,
      gap,
      urgency: gap + (supply === 0 ? 4 : 0),
    };
  }).sort((a, b) => b.urgency - a.urgency || b.demand - a.demand);
}

function buildCityGrowth(data, now) {
  const currentStart = new Date(now.getTime() - 30 * 86400000);
  const previousStart = new Date(now.getTime() - 60 * 86400000);
  const cityRows = [
    ...(data.families || []).map((item) => ({ item, type: 'familia' })),
    ...(data.requests || []).map((item) => ({ item, type: 'solicitud' })),
    ...(data.publicLeads || []).map((item) => ({ item, type: 'lead' })),
    ...(data.classes || []).map((item) => ({ item, type: 'clase' })),
  ];
  const map = new Map();
  for (const entry of cityRows) {
    const date = toDate(createdAt(entry.item));
    if (!date) continue;
    const city = cityOf(entry.item);
    const current = map.get(city) || { city, current: 0, previous: 0, families: 0, requests: 0, leads: 0, classes: 0 };
    if (date >= currentStart && date <= now) {
      current.current += 1;
      if (entry.type === 'familia') current.families += 1;
      if (entry.type === 'solicitud') current.requests += 1;
      if (entry.type === 'lead') current.leads += 1;
      if (entry.type === 'clase') current.classes += 1;
    } else if (date >= previousStart && date < currentStart) {
      current.previous += 1;
    }
    map.set(city, current);
  }
  return [...map.values()]
    .map((item) => ({ ...item, delta: item.current - item.previous, growth: item.previous ? ((item.current - item.previous) / item.previous) * 100 : item.current ? 100 : 0 }))
    .filter((item) => item.current > 0 || item.previous > 0)
    .sort((a, b) => b.delta - a.delta || b.current - a.current);
}

function buildIncidentGroups(data) {
  const groups = groupBy(data.incidents || [], (item) => normalize(first(item.tipo, item.category, item.categoria, item.titulo, item.title, statusOf(item))) || 'sin_categoria');
  return [...groups.entries()].map(([key, items]) => ({
    key,
    label: clean(first(items[0]?.tipo, items[0]?.category, items[0]?.categoria, items[0]?.titulo, key), 120),
    count: items.length,
    open: items.filter(isOpenIncident).length,
    critical: items.filter((item) => ['alta', 'urgente', 'critical'].includes(normalize(first(item.priority, item.prioridad)))).length,
    lastAt: latestDate(items.map(createdAt)),
  })).sort((a, b) => b.count - a.count || b.open - a.open);
}

export function buildAdminAiContext(rawData = {}, options = {}) {
  const now = options.now ? toDate(options.now) || new Date() : new Date();
  const data = {
    users: rawData.users || rawData.usuarios || [],
    teachers: rawData.teachers || rawData.profesores || [],
    families: rawData.families || rawData.familias || [],
    students: rawData.students || rawData.alumnos || [],
    classes: rawData.classes || rawData.clases || [],
    requests: rawData.requests || rawData.solicitudes || [],
    payments: rawData.payments || rawData.pagos || [],
    incidents: rawData.incidents || rawData.incidencias || [],
    documents: rawData.documents || rawData.documentos || [],
    assignments: rawData.assignments || rawData.asignaciones || [],
    requestMatches: rawData.requestMatches || rawData.solicitudMatches || [],
    matchingRuns: rawData.matchingRuns || [],
    chats: rawData.chats || [],
    messages: rawData.messages || rawData.mensajes || [],
    notifications: rawData.notifications || rawData.notificaciones || [],
    publicLeads: rawData.publicLeads || rawData.leadsPublicos || [],
    automationEvents: rawData.automationEvents || [],
    lifecycleEvents: rawData.lifecycleEvents || rawData.classLifecycleEvents || [],
    internalAiInsights: rawData.internalAiInsights || [],
    documentsPending: [],
  };

  const teacherStats = buildTeacherStats(data, now);
  const familyStats = buildFamilyStats(data, now);
  const subjectDemand = buildSubjectDemand(data, teacherStats);
  const cityGrowth = buildCityGrowth(data, now);
  const incidentGroups = buildIncidentGroups(data);
  const pendingDocuments = data.documents.filter(isPendingDocumentReview);
  const unassignedRequests = data.requests.filter(isUnassignedRequest);
  const classesNeedingClosure = data.classes.filter(isClassNeedingClosure);
  const weekStart = startOfWeek(now);
  const weekClasses = data.classes.filter((item) => inRange(classDate(item), weekStart, now));
  const weekPayments = data.payments.filter((item) => inRange(createdAt(item), weekStart, now));
  const weekRequests = data.requests.filter((item) => inRange(createdAt(item), weekStart, now));
  const weekIncidents = data.incidents.filter((item) => inRange(createdAt(item), weekStart, now));
  const weekLeads = data.publicLeads.filter((item) => inRange(createdAt(item), weekStart, now));
  const weekRevenue = weekClasses.filter(isCompletedClass).reduce((sum, item) => sum + amountOf(item), 0);

  return {
    version: ADMIN_AI_VERSION,
    generatedAt: now.toISOString(),
    data,
    counts: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0])),
    teacherStats,
    familyStats,
    subjectDemand,
    cityGrowth,
    incidentGroups,
    week: {
      start: weekStart.toISOString(),
      classes: weekClasses,
      completedClasses: weekClasses.filter(isCompletedClass),
      cancelledClasses: weekClasses.filter(isCancelledClass),
      payments: weekPayments,
      pendingPayments: data.payments.filter(isPendingPayment),
      requests: weekRequests,
      leads: weekLeads,
      incidents: weekIncidents,
      openIncidents: data.incidents.filter(isOpenIncident),
      revenue: weekRevenue,
      pendingDocuments,
      unassignedRequests,
      classesNeedingClosure,
    },
    pendingDocuments,
    unassignedRequests,
    classesNeedingClosure,
  };
}

function detectIntent(question) {
  const q = normalize(question);
  if (/profesor/.test(q) && /(mes|30|sin recibir|sin alumnos|inactiv|actividad|recibir alumnos)/.test(q)) return 'inactive_teachers';
  if (/(familia|padres|usuarios)/.test(q) && /(pago|pagos|pendiente|vencid)/.test(q)) return 'pending_family_payments';
  if (/profesor/.test(q) && /(respuesta|responder|tasa|tiempo)/.test(q)) return 'teacher_response_risk';
  if (/(incidencia|problema|reclamacion)/.test(q) && /(repite|repiten|frecuente|mas|comun)/.test(q)) return 'incident_patterns';
  if (/(resumen|semana|semanal|esta semana)/.test(q)) return 'weekly_summary';
  if (/(abandon|baja|churn|irse|perder|riesgo)/.test(q)) return 'churn_risk';
  if (/profesor/.test(q) && /(destacar|mejores|recomendar|top|publicar)/.test(q)) return 'teacher_highlights';
  if (/(ciudad|zona|localidad|creciendo|crecen|crecimiento)/.test(q)) return 'city_growth';
  if (/(asignatura|materia|profesores|oferta|demanda)/.test(q) && /(necesita|faltan|mas|demanda)/.test(q)) return 'subject_supply_gap';
  if (/(automat|proceso|ahorrar|manual|operacion)/.test(q)) return 'automation_opportunities';
  if (/(negocio|empresa|dinero|finanza|ingreso|factura|facturacion|margen|rentab|caja|economia|como va|estamos bien)/.test(q)) return 'business_health';
  if (/(confianza|calidad|perfil|documento|verificacion|verificado|profesional|real|fiable|seguridad|reputacion)/.test(q)) return 'trust_quality';
  if (solutionQuestionLooksLikeIncident(question)) return 'solution_finder';
  if (/(prioridad|prioridades|urgente|importante|revisar|mirar|atencion|preocupa|raro|mal|peor|bloque|que hago|por donde empiezo|hoy|ahora|que pasa|que esta pasando|diagnostico|situacion)/.test(q)) return 'today_priorities';
  return 'general_health';
}

function answerPayload(context, intent, title, summary, rows = [], options = {}) {
  return {
    version: ADMIN_AI_VERSION,
    intent,
    title,
    summary,
    rows: rows.slice(0, options.limit || 8),
    actions: options.actions || [],
    evidence: options.evidence || [],
    warnings: options.warnings || [],
    confidence: options.confidence || (rows.length ? 'alta' : 'media'),
    sourceCollections: options.sourceCollections || inferSources(intent),
    generatedAt: context.generatedAt,
    counts: context.counts,
  };
}

function inferSources(intent) {
  const base = {
    inactive_teachers: ['profesores', 'asignaciones', 'clases'],
    pending_family_payments: ['familias', 'pagos', 'clases'],
    teacher_response_risk: ['profesores', 'chats', 'mensajes'],
    incident_patterns: ['incidencias'],
    weekly_summary: ['clases', 'pagos', 'solicitudes', 'leadsPublicos', 'incidencias'],
    churn_risk: ['profesores', 'familias', 'clases', 'pagos', 'incidencias'],
    teacher_highlights: ['profesores', 'clases', 'asignaciones', 'pagos'],
    city_growth: ['familias', 'solicitudes', 'leadsPublicos', 'clases'],
    subject_supply_gap: ['solicitudes', 'profesores', 'solicitudMatches'],
    automation_opportunities: ['pagos', 'solicitudes', 'documentos', 'incidencias', 'clases', 'automationEvents', 'internalAiInsights'],
    solution_finder: ['clases', 'pagos', 'incidencias', 'documentos', 'solicitudes', 'profesores', 'familias', 'chats'],
    today_priorities: ['pagos', 'incidencias', 'solicitudes', 'documentos', 'clases', 'profesores', 'chats'],
    business_health: ['clases', 'pagos', 'solicitudes', 'familias', 'profesores', 'leadsPublicos'],
    trust_quality: ['profesores', 'familias', 'documentos', 'pagos', 'incidencias', 'chats'],
    general_health: ['clases', 'pagos', 'solicitudes', 'profesores', 'familias', 'internalAiInsights'],
  };
  return base[intent] || base.general_health;
}

function answerInactiveTeachers(context) {
  const rows = context.teacherStats
    .filter((item) => item.active && (item.noNewStudentDays === null || item.noNewStudentDays > 30))
    .sort((a, b) => (b.noNewStudentDays ?? 999) - (a.noNewStudentDays ?? 999))
    .map((item) => row(
      item.name,
      item.noNewStudentDays === null ? 'Sin alumnos registrados' : `${item.noNewStudentDays} dias`,
      `${item.city}. ${item.activeStudents} alumno(s) activos, ${item.completed.length} clase(s) realizadas, confianza ${round(item.trustScore, 0)}/100.`,
      { id: item.id, section: 'profesores', tone: (item.noNewStudentDays ?? 999) > 60 ? 'danger' : 'warning' },
    ));
  return answerPayload(
    context,
    'inactive_teachers',
    'Profesores sin alumnos recientes',
    rows.length
      ? `${rows.length} profesor(es) activos llevan mas de 30 dias sin recibir alumno o actividad equivalente.`
      : 'No detecto profesores activos con mas de 30 dias sin alumnos nuevos.',
    rows,
    { actions: [{ label: 'Revisar profesores', section: 'profesores' }] },
  );
}

function answerPendingFamilyPayments(context) {
  const rows = context.familyStats
    .filter((item) => item.pendingPayments.length)
    .sort((a, b) => b.pendingAmount - a.pendingAmount || b.overduePayments.length - a.overduePayments.length)
    .map((item) => row(
      item.name,
      `${formatEuros(item.pendingAmount)} pendientes`,
      `${item.pendingPayments.length} pago(s), ${item.overduePayments.length} vencido(s), ${item.students.length} alumno(s), ultima actividad ${isoDate(item.lastActivity) || 'sin fecha'}.`,
      { id: item.id, section: 'familias', tone: item.overduePayments.length ? 'danger' : 'warning' },
    ));
  return answerPayload(
    context,
    'pending_family_payments',
    'Familias con pagos pendientes',
    rows.length
      ? `${rows.length} familia(s) tienen pagos pendientes por un total de ${formatEuros(context.familyStats.reduce((sum, item) => sum + item.pendingAmount, 0))}.`
      : 'No detecto familias con pagos pendientes en los datos cargados.',
    rows,
    { actions: [{ label: 'Abrir pagos', section: 'pagos' }, { label: 'Abrir familias', section: 'familias' }] },
  );
}

function answerTeacherResponseRisk(context) {
  const rows = context.teacherStats
    .filter((item) => item.active && item.responseHours > 0)
    .sort((a, b) => b.responseHours - a.responseHours)
    .map((item) => row(
      item.name,
      `${round(item.responseHours, 1)}h respuesta media`,
      `${item.responseSamples ? `${item.responseSamples} respuesta(s) medidas en chat` : 'Dato de perfil/reputacion'}. Aceptacion ${formatPercent(item.acceptanceRate || 0)}, confianza ${round(item.trustScore, 0)}/100.`,
      { id: item.id, section: 'profesores', tone: item.responseHours > 24 ? 'danger' : item.responseHours > 8 ? 'warning' : 'info' },
    ));
  return answerPayload(
    context,
    'teacher_response_risk',
    'Profesores con peor respuesta',
    rows.length
      ? `Estos son los profesores con tiempos de respuesta mas altos medidos por chat o reputacion.`
      : 'No hay suficientes datos de respuesta para ordenar profesores de forma fiable.',
    rows,
    { warnings: rows.length ? [] : ['Faltan muestras de mensajes o campos de respuesta en perfiles.'] },
  );
}

function answerIncidentPatterns(context) {
  const rows = context.incidentGroups.map((item) => row(
    item.label,
    `${item.count} incidencia(s)`,
    `${item.open} abierta(s), ${item.critical} critica(s), ultima: ${isoDate(item.lastAt) || 'sin fecha'}.`,
    { section: 'incidencias', tone: item.critical ? 'danger' : item.open ? 'warning' : 'info' },
  ));
  return answerPayload(
    context,
    'incident_patterns',
    'Incidencias que mas se repiten',
    rows.length
      ? `La categoria mas repetida es "${rows[0].label}" con ${rows[0].metric}.`
      : 'No hay incidencias registradas para detectar patrones.',
    rows,
    { actions: [{ label: 'Abrir incidencias', section: 'incidencias' }] },
  );
}

function answerWeeklySummary(context) {
  const week = context.week;
  const rows = [
    row('Clases esta semana', `${week.classes.length}`, `${week.completedClasses.length} realizadas, ${week.cancelledClasses.length} canceladas.`, { section: 'clases', tone: 'info' }),
    row('Ingresos realizados', formatEuros(week.revenue), 'Calculado sobre clases realizadas de la semana.', { section: 'finanzas', tone: 'success' }),
    row('Solicitudes nuevas', `${week.requests.length}`, `${week.leads.length} lead(s) publico(s) adicionales.`, { section: 'solicitudes', tone: week.requests.length ? 'info' : 'gray' }),
    row('Pagos pendientes actuales', `${week.pendingPayments.length}`, `${formatEuros(week.pendingPayments.reduce((sum, item) => sum + amountOf(item), 0))} pendiente en total.`, { section: 'pagos', tone: week.pendingPayments.length ? 'warning' : 'success' }),
    row('Incidencias abiertas', `${week.openIncidents.length}`, `${week.incidents.length} incidencia(s) creadas esta semana.`, { section: 'incidencias', tone: week.openIncidents.length ? 'warning' : 'success' }),
  ];
  return answerPayload(
    context,
    'weekly_summary',
    'Resumen operativo de esta semana',
    `Desde ${isoDate(week.start)}: ${week.classes.length} clase(s), ${week.requests.length} solicitud(es), ${formatEuros(week.revenue)} en clases realizadas y ${week.openIncidents.length} incidencia(s) abierta(s).`,
    rows,
  );
}

function answerChurnRisk(context) {
  const familyRows = context.familyStats
    .filter((item) => item.churnScore >= 40)
    .map((item) => row(
      item.name,
      `Riesgo ${round(item.churnScore, 0)}/100`,
      `${item.pendingPayments.length} pago(s) pendiente(s), ${item.openIncidents.length} incidencia(s), ${item.inactiveDays ?? '-'} dias sin actividad.`,
      { id: item.id, section: 'familias', tone: item.churnScore > 75 ? 'danger' : 'warning' },
    ));
  const teacherRows = context.teacherStats
    .filter((item) => item.active && ((item.inactiveDays ?? 0) > 45 || item.trustScore < 45 || item.responseHours > 24))
    .map((item) => row(
      item.name,
      `Riesgo ${round(Math.min(100, (item.inactiveDays || 0) + (item.responseHours || 0) - item.trustScore / 4), 0)}/100`,
      `${item.inactiveDays ?? '-'} dias sin actividad, respuesta ${round(item.responseHours, 1)}h, confianza ${round(item.trustScore, 0)}/100.`,
      { id: item.id, section: 'profesores', tone: 'warning' },
    ));
  const rows = [...familyRows, ...teacherRows].slice(0, 8);
  return answerPayload(
    context,
    'churn_risk',
    'Usuarios con riesgo de abandono',
    rows.length
      ? `${rows.length} usuario(s) aparecen con riesgo por pagos, incidencias, inactividad o baja confianza.`
      : 'No detecto usuarios con riesgo alto de abandono en los datos cargados.',
    rows,
    { actions: [{ label: 'Revisar familias', section: 'familias' }, { label: 'Revisar profesores', section: 'profesores' }] },
  );
}

function answerTeacherHighlights(context) {
  const rows = context.teacherStats
    .filter((item) => item.active && item.verified)
    .sort((a, b) => b.highlightScore - a.highlightScore)
    .map((item) => row(
      item.name,
      `Score ${round(item.highlightScore, 0)}`,
      `${item.completed.length} clase(s), ${item.activeStudents} alumno(s) activos, confianza ${round(item.trustScore, 0)}/100, respuesta ${round(item.responseHours, 1)}h.`,
      { id: item.id, section: 'profesores', tone: item.highlightScore >= 90 ? 'success' : 'info' },
    ));
  return answerPayload(
    context,
    'teacher_highlights',
    'Profesores recomendados para destacar',
    rows.length
      ? 'Priorizo profesores verificados con buena actividad, confianza, alumnos activos y baja friccion operativa.'
      : 'No hay profesores verificados con datos suficientes para destacar todavia.',
    rows,
    { actions: [{ label: 'Abrir profesores', section: 'profesores' }] },
  );
}

function answerCityGrowth(context) {
  const rows = context.cityGrowth.map((item) => row(
    item.city,
    `${item.delta >= 0 ? '+' : ''}${item.delta} actividad neta`,
    `${item.current} evento(s) ultimos 30 dias vs ${item.previous} anteriores. Familias ${item.families}, solicitudes ${item.requests}, leads ${item.leads}, clases ${item.classes}.`,
    { section: 'solicitudes', tone: item.delta > 0 ? 'success' : 'gray' },
  ));
  return answerPayload(
    context,
    'city_growth',
    'Ciudades con mas crecimiento',
    rows.length
      ? `La zona con mayor crecimiento es ${rows[0].label}.`
      : 'No hay suficientes datos con ciudad para calcular crecimiento.',
    rows,
  );
}

function answerSubjectSupplyGap(context) {
  const rows = context.subjectDemand.map((item) => row(
    item.subject,
    `${item.gap} hueco(s) estimado(s)`,
    `Demanda ponderada ${item.demand}, profesores verificados ${item.supply}. ${item.supply === 0 ? 'No hay oferta verificada.' : 'Oferta insuficiente si la demanda sigue.'}`,
    { section: 'solicitudes', tone: item.gap > 4 || item.supply === 0 ? 'danger' : item.gap > 1 ? 'warning' : 'info' },
  ));
  return answerPayload(
    context,
    'subject_supply_gap',
    'Asignaturas que necesitan mas profesores',
    rows.length
      ? `La mayor brecha actual es ${rows[0].label}: ${rows[0].metric}.`
      : 'No hay solicitudes recientes suficientes para detectar brechas de asignaturas.',
    rows,
    { actions: [{ label: 'Abrir solicitudes', section: 'solicitudes' }, { label: 'Abrir profesores', section: 'profesores' }] },
  );
}

function answerAutomationOpportunities(context) {
  const pendingPayments = context.familyStats.filter((item) => item.pendingPayments.length).length;
  const inactiveTeachers = context.teacherStats.filter((item) => item.active && (item.noNewStudentDays ?? 0) > 30).length;
  const openIncidents = context.incidentGroups.reduce((sum, item) => sum + item.open, 0);
  const docsPending = (context.data.documents || []).filter((item) => ['pendiente', 'pending', 'revision', 'en_revision'].includes(statusOf(item))).length;
  const unassigned = (context.data.requests || []).filter((item) => ['nueva', 'nuevo', 'pendiente', 'open', ''].includes(statusOf(item)) && !first(item.assignedTeacherUid, item.profesor_asignado_id)).length;
  const classNotClosed = (context.data.classes || []).filter((item) => !isCompletedClass(item) && !isCancelledClass(item) && (daysSince(classDate(item)) ?? 0) > 1).length;
  const internalInsights = (context.data.internalAiInsights || [])
    .filter((item) => isOpenIncident(item) || ['', 'active', 'activa', 'open', 'abierta'].includes(statusOf(item)))
    .sort((a, b) => asNumber(b.priorityScore) - asNumber(a.priorityScore))
    .slice(0, 4);
  const rows = [
    ...internalInsights.map((item) => row(
      first(item.title, 'IA interna'),
      `Score ${round(first(item.priorityScore, 0), 0)}`,
      first(item.recommendedAction, item.summary, 'Revisar insight operativo calculado automaticamente.'),
      { section: first(item.section, 'operaciones'), tone: asNumber(item.priorityScore) >= 84 ? 'warning' : 'info' },
    )),
    pendingPayments ? row('Recordatorios de pagos', `${pendingPayments} familia(s)`, 'Enviar notificacion interna/push y crear tarea CRM si el pago sigue pendiente.', { section: 'pagos', tone: 'warning' }) : null,
    unassigned ? row('Asignacion de solicitudes', `${unassigned} solicitud(es)`, 'Ejecutar matching y avisar al admin cuando no haya profesor con score suficiente.', { section: 'solicitudes', tone: 'danger' }) : null,
    inactiveTeachers ? row('Reactivacion de profesores', `${inactiveTeachers} profesor(es)`, 'Crear campana de disponibilidad y pedir actualizacion de perfil a oferta fria.', { section: 'profesores', tone: 'warning' }) : null,
    docsPending ? row('Revision documental', `${docsPending} documento(s)`, 'Agrupar documentos pendientes y priorizar los perfiles con solicitudes activas.', { section: 'documentos', tone: 'info' }) : null,
    classNotClosed ? row('Cierre de clases', `${classNotClosed} clase(s)`, 'Recordar confirmacion a ambas partes y abrir incidencia si pasan 24h.', { section: 'clases', tone: 'warning' }) : null,
    openIncidents ? row('Clasificacion de incidencias', `${openIncidents} abierta(s)`, 'Etiquetar automaticamente incidencias repetidas y sugerir respuesta operativa.', { section: 'incidencias', tone: 'warning' }) : null,
  ].filter(Boolean);
  return answerPayload(
    context,
    'automation_opportunities',
    'Procesos con mas retorno para automatizar',
    rows.length
      ? 'Priorizo primero los insights internos ya calculados y despues los cuellos de botella clasicos.'
      : 'No veo cuellos de botella claros para automatizar con los datos actuales.',
    rows,
  );
}

function solutionQuestionLooksLikeIncident(question) {
  const q = normalize(question);
  return /(solucion|resolver|resuelv|arregl|que hago|como lo hago|como arreglo|como soluciono|ha pasado|pasa que|fall|error|no funciona|funcionando peor|va mal|esta mal|se ve mal|no aparece|no deja|bloque|raro|problema|incidencia|conflicto|missing|permission|permiso|insufficient)/.test(q);
}

function solutionSignals(context) {
  const pendingFamilyAmount = context.familyStats.reduce((sum, item) => sum + item.pendingAmount, 0);
  return {
    pendingFamilies: context.familyStats.filter((item) => item.pendingPayments.length).length,
    overdueFamilies: context.familyStats.filter((item) => item.overduePayments.length).length,
    pendingFamilyAmount,
    openIncidents: context.incidentGroups.reduce((sum, item) => sum + item.open, 0),
    criticalIncidents: context.incidentGroups.reduce((sum, item) => sum + item.critical, 0),
    unassignedRequests: context.unassignedRequests.length,
    pendingDocuments: context.pendingDocuments.length,
    classesNeedingClosure: context.classesNeedingClosure.length,
    slowTeachers: context.teacherStats.filter((item) => item.active && item.responseHours > 24).length,
    inactiveTeachers: context.teacherStats.filter((item) => item.active && (item.noNewStudentDays === null || item.noNewStudentDays > 30)).length,
  };
}

function solutionPlaybookForQuestion(question, context) {
  const q = normalize(question);
  const signals = solutionSignals(context);
  const includes = (...patterns) => patterns.some((pattern) => pattern.test(q));
  if (includes(/permission|permiso|insufficient|missing|no autorizado|no tienes permiso|rules|reglas/)) {
    return {
      key: 'permissions',
      title: 'Permisos o reglas bloqueando una accion',
      section: 'configuracion',
      risk: 'Puede ser un fallo de reglas, rol incorrecto o usuario con perfil incompleto.',
      diagnosis: 'Primero hay que distinguir si la accion deberia estar permitida para ese rol. Si si, el problema suele estar en userUid/profileUid, rol duplicado o regla de Firestore/Storage demasiado estricta.',
      solution: 'Validar rol y perfil del usuario, reproducir con esa cuenta, localizar coleccion/escritura exacta y ajustar reglas o payload para que use el owner correcto.',
      steps: [
        'Reproducir la accion con la cuenta afectada y anotar pantalla, coleccion y boton exacto.',
        'Comprobar users/{uid}: role/rol, active y que exista perfil en familias/profesores segun corresponda.',
        'Revisar que el documento que se escribe lleva familyUid/teacherUid/userUid correcto, no un id generico ni vacio.',
        'Si el dato es correcto y falla, ajustar regla de seguridad o ruta de escritura; si el dato es incorrecto, corregir el payload.',
      ],
      verify: 'Repetir la misma accion con la misma cuenta y confirmar que no sale el toast de permisos.',
      fallback: 'Si afecta a pagos, clases o documentos reales, crear incidencia tecnica y resolver antes de pedir al usuario que reintente.',
    };
  }
  if (includes(/justificante|bizum|pago|impago|cobro|pagad|rechazad|validar|dinero|deuda/)) {
    return {
      key: 'payments',
      title: 'Pago, impago o justificante',
      section: 'calendario',
      risk: `${signals.pendingFamilies} familia(s) con pagos pendientes; ${signals.overdueFamilies} vencida(s); ${formatEuros(signals.pendingFamilyAmount)} pendiente.`,
      diagnosis: 'El problema suele ser una de estas tres cosas: justificante rechazado, pago sin asociar al dia de pago correcto o clases pendientes arrastradas al siguiente vencimiento.',
      solution: 'Dejar un unico flujo: dia de pago -> justificante -> clases cubiertas -> validacion admin. Si se rechaza, reabrir subida y pedir justificante valido con motivo claro.',
      steps: [
        'Abrir el calendario del admin en el dia de pago de la familia y revisar las clases incluidas desde el vencimiento anterior.',
        'Si el justificante existe pero no es valido, marcarlo como rechazado con motivo concreto y reabrir subida para la familia.',
        'Si falta asociacion, enlazar el pago a las clases correctas o moverlo a revision manual.',
        'Si hay impago acumulado, incluirlo en el siguiente dia de pago con desglose de fechas e importe.',
      ],
      verify: 'La familia debe ver posibilidad de subir justificante; el admin debe ver el justificante en el dia de pago; el profesor no debe ver estados de justificante.',
      fallback: 'Si supera dos semanas o varios avisos, mandar aviso cordial de continuidad del profesor antes de pausar nuevas clases.',
    };
  }
  if (includes(/calendario|clase|recurrente|semanal|asistencia|no dada|dada|horario|fecha|no aparece|aparece/)) {
    return {
      key: 'classes_calendar',
      title: 'Clase, recurrencia o calendario',
      section: 'calendario',
      risk: `${signals.classesNeedingClosure} clase(s) antiguas sin cierre claro.`,
      diagnosis: 'Si una clase no aparece, casi siempre falta sincronizar la recurrencia, la relacion profesor-familia, o la fecha/hora quedo fuera del rango que carga el calendario.',
      solution: 'Normalizar la clase como evento unico con teacherUid, familyUid, studentId, fecha, inicio, fin, precio proporcional y estado; despues regenerar o sincronizar recurrencias.',
      steps: [
        'Comprobar que la relacion profesor-familia-alumno esta activa y sin ids genericos.',
        'Verificar fecha, hora_inicio, hora_fin, teacherUid, familyUid y studentId en la clase.',
        'Si viene de una recurrencia, regenerar instancias semanales futuras desde la regla aceptada.',
        'Si una parte marca dada y otra no dada, abrir incidencia de asistencia para que admin decida antes de mover pagos.',
      ],
      verify: 'Debe aparecer en calendario de familia y profesor con hora, alumno, profesor y datos minimos de pago/asistencia.',
      fallback: 'Si no se puede reconstruir con seguridad, archivar la instancia defectuosa y crear una nueva desde calendario.',
    };
  }
  if (includes(/chat|mensaje|llamada|audio|foto|archivo|adjuntar|telefono|videollamada/)) {
    return {
      key: 'chat_calls',
      title: 'Chat, adjuntos o llamadas',
      section: 'chats',
      risk: 'Puede afectar confianza porque familia y profesor no coordinan bien si el chat falla.',
      diagnosis: 'El origen suele ser chat sin participantes correctos, asignacion no enlazada o permisos de microfono/archivo.',
      solution: 'Reenlazar chat a la relacion activa, asegurar participantUids correctos y mantener llamada por canal interno/WebRTC sin exponer telefonos reales.',
      steps: [
        'Abrir la conversacion y comprobar familyUid, teacherUid, studentId y participantUids.',
        'Si falta profesor/familia, reconstruir el chat desde la asignacion activa.',
        'Para llamada, usar sala interna y permiso de microfono; nunca telefonos reales de usuarios.',
        'Si falla adjunto/audio, comprobar storagePath, permisos de Storage y tamano/tipo de archivo.',
      ],
      verify: 'Ambas partes ven el mismo chat, pueden enviar mensaje y el boton de llamada abre la llamada interna esperada.',
      fallback: 'Si la llamada no conecta, dejar mensaje automatico con siguiente hora propuesta y crear incidencia tecnica.',
    };
  }
  if (includes(/disponibilidad|franja|horario profesor|no puedo anadir|no deja anadir/)) {
    return {
      key: 'availability',
      title: 'Disponibilidad del profesor',
      section: 'profesores',
      risk: 'Sin disponibilidad fiable, el matching y las clases puntuales se vuelven confusos.',
      diagnosis: 'Suele fallar por formato de horas, solape/duplicado, perfil de profesor no enlazado o permisos de escritura.',
      solution: 'Guardar franjas simples con dia, inicio, fin y teacherUid correcto; validar que fin sea posterior a inicio y no duplicar.',
      steps: [
        'Comprobar que el usuario tiene perfil de profesor y teacherUid estable.',
        'Validar dia_semana, hora_inicio y hora_fin antes de guardar.',
        'Evitar duplicados exactos y mostrar error claro si la franja ya existe.',
        'Probar despues desde ordenador y movil para confirmar que no hay bloqueo visual.',
      ],
      verify: 'La franja nueva aparece inmediatamente en Disponibilidad y el chat/clases puntuales la reconocen.',
      fallback: 'Si falla por reglas, aplicar el playbook de permisos con la coleccion disponibilidad.',
    };
  }
  if (includes(/solicitud|matching|asignar|profesor adecuado|sin profesor|candidato|proponer profesor/)) {
    return {
      key: 'matching',
      title: 'Solicitud o matching sin cerrar',
      section: 'solicitudes',
      risk: `${signals.unassignedRequests} solicitud(es) sin profesor cerrado.`,
      diagnosis: 'Puede faltar disponibilidad, materia compatible, distancia correcta, perfil verificado o decision admin.',
      solution: 'Comparar candidatos por compatibilidad real y dejar siguiente paso: asignar, pedir mas datos o ampliar busqueda.',
      steps: [
        'Abrir solicitud y revisar materia, nivel, modalidad, ubicacion y disponibilidad.',
        'Ordenar profesores por distancia, materia, nivel, confianza, respuesta y disponibilidad.',
        'Si no hay candidato fuerte, ampliar criterios o pedir dato que falta a la familia.',
        'Si hay candidato fuerte, asignarlo y crear chat/calendario con siguiente paso claro.',
      ],
      verify: 'Familia y profesor deben ver chat y propuesta; admin debe ver solicitud con estado cerrado o siguiente accion definida.',
      fallback: 'Si el matching automatico no decide, crear tarea manual con los tres mejores candidatos y motivo de descarte.',
    };
  }
  if (includes(/documento|dni|titulo|certificado|revision|verificacion|perfil real|confianza/)) {
    return {
      key: 'documents',
      title: 'Documento o verificacion de confianza',
      section: 'documentos',
      risk: `${signals.pendingDocuments} documento(s) pendiente(s) de revision.`,
      diagnosis: 'Normalmente falta revisar el archivo, enlazarlo al usuario correcto o pedir una version legible/valida.',
      solution: 'Revisar documento desde admin, validar si es correcto o rechazar con motivo concreto y solicitud de nueva subida.',
      steps: [
        'Abrir Documentos y localizar el usuario/documento pendiente.',
        'Comprobar legibilidad, tipo de documento, fecha y que pertenece al usuario correcto.',
        'Validar si cumple; si no, rechazar con motivo claro y reabrir subida.',
        'Actualizar confianza del perfil solo cuando el documento quede validado.',
      ],
      verify: 'El badge de Documentos baja y el usuario queda con estado documental coherente.',
      fallback: 'Si el documento esta huerfano o mal enlazado, reasignarlo o archivarlo antes de validar.',
    };
  }
  if (includes(/importe|precio|margen|profesor cobra|comision|duracion|minutos|tarifa|finanza/)) {
    return {
      key: 'finance_amounts',
      title: 'Importes, duracion o margen',
      section: 'finanzas',
      risk: 'Si el total no es proporcional a la duracion, se descuadra admin, familia y profesor.',
      diagnosis: 'El fallo suele venir de guardar total fijo en vez de precio/hora y duracion real.',
      solution: 'Mantener precio por hora y calcular siempre total familia, cobra profesor y margen segun minutos reales de la clase.',
      steps: [
        'Comprobar hora_inicio y hora_fin para calcular duracion en minutos.',
        'Aplicar total = precioHora * duracionHoras y profesor = tarifaProfesorHora * duracionHoras.',
        'Recalcular margen y porcentaje en admin, familia y profesor.',
        'Buscar clases antiguas con duracion rara y totales no proporcionales.',
      ],
      verify: 'Una clase de menos de una hora debe mostrar menos total, menos cobra profesor y margen proporcional.',
      fallback: 'Si faltan tarifas, marcar como falta importe y no liquidar hasta corregir.',
    };
  }
  if (includes(/movil|responsive|tres rayitas|hamburger|se ve mal|borroso|cuadro|sale del recuadro|overflow/)) {
    return {
      key: 'responsive',
      title: 'Problema visual o responsive',
      section: 'operaciones',
      risk: 'Si el panel se rompe en movil, el usuario pierde confianza aunque la logica este bien.',
      diagnosis: 'Normalmente hay ancho fijo, texto sin wrap, overlay con filtro/backdrop o panel que no respeta min-width:0.',
      solution: 'Reproducir en viewport movil, localizar el elemento con overflow y corregir layout con grid flexible, wrap y sin filtros en el drawer.',
      steps: [
        'Reproducir en movil instalado y navegador con la misma seccion.',
        'Medir scrollWidth vs clientWidth y localizar el elemento que se sale.',
        'Eliminar anchos fijos problematicos y asegurar min-width:0/overflow-wrap:anywhere.',
        'Probar las tres rayitas en admin, familia y profesor despues de corregir.',
      ],
      verify: 'No debe haber scroll horizontal, blur raro ni elementos saliendo del recuadro.',
      fallback: 'Si solo falla instalada como PWA, revisar service worker/cache y manifest antes de tocar layout.',
    };
  }
  if (includes(/worker|automatizacion|github actions|recordatorio|notificacion|no salta|tarea|reintento|job/)) {
    return {
      key: 'automation',
      title: 'Automatizacion, aviso o tarea que no se ejecuta',
      section: 'operaciones',
      risk: 'Recordatorios, pagos, matching o reputacion pueden quedarse parados.',
      diagnosis: 'Puede fallar el worker gratuito, el job atascado, la idempotencia o la condicion que dispara la notificacion.',
      solution: 'Revisar latido de automatizacion, jobs pendientes/deadLetters y reencolar solo tras confirmar idempotencia.',
      steps: [
        'Comprobar ultimo automationEvent o ejecucion de GitHub Actions.',
        'Revisar systemJobs/deadLetters si hay tareas atascadas.',
        'Verificar la condicion concreta que deberia disparar el aviso.',
        'Reencolar o ejecutar worker y confirmar que crea una sola notificacion.',
      ],
      verify: 'Debe aparecer el aviso/tarea esperado una vez, sin duplicados.',
      fallback: 'Si afecta a pagos vencidos o clases sin cerrar, crear incidencia manual y resolver sin esperar al worker.',
    };
  }
  return {
    key: 'general',
    title: 'Situacion operativa no clasificada',
    section: 'incidencias',
    risk: `${signals.openIncidents} incidencia(s) abierta(s), ${signals.pendingFamilies} familia(s) con pagos pendientes y ${signals.unassignedRequests} solicitud(es) sin cerrar.`,
    diagnosis: 'Cuando el caso es ambiguo, hay que reducirlo a: que usuario afecta, que flujo bloquea, que dato esta incoherente y que siguiente paso deja el caso resuelto.',
    solution: 'Crear un diagnostico corto, identificar el flujo afectado y aplicar el playbook mas cercano sin tocar datos que no entiendas.',
    steps: [
      'Anotar quien esta afectado: familia, profesor, alumno o admin.',
      'Ubicar el flujo: calendario, pago, chat, documentos, solicitud, perfil o automatizacion.',
      'Buscar el dato que no cuadra y compararlo en los paneles afectados.',
      'Resolver con el minimo cambio verificable y dejar registro de causa y solucion.',
    ],
    verify: 'Repetir el flujo como el usuario afectado y comprobar que el estado queda claro.',
    fallback: 'Si no hay seguridad, no inventar: abrir incidencia con evidencias y decidir manualmente.',
  };
}

function answerSolutionFinder(context, question) {
  const playbook = solutionPlaybookForQuestion(question, context);
  const rows = [
    row('Diagnostico probable', 'Causa', playbook.diagnosis, { section: playbook.section, tone: playbook.key === 'permissions' ? 'danger' : 'info' }),
    row('Mejor solucion concreta', 'Solucion', playbook.solution, { section: playbook.section, tone: 'success' }),
    ...playbook.steps.slice(0, 4).map((step, index) => row(`Paso ${index + 1}`, 'Accion', step, { section: playbook.section, tone: index === 0 ? 'warning' : 'info' })),
    row('Comprobacion final', 'Verificar', playbook.verify, { section: playbook.section, tone: 'success' }),
    row('Si no se resuelve', 'Escalar', playbook.fallback, { section: 'incidencias', tone: 'warning' }),
  ];
  return answerPayload(
    context,
    'solution_finder',
    `Mejor solucion operativa: ${playbook.title}`,
    `${playbook.risk} Mi recomendacion es: ${playbook.solution}`,
    rows,
    {
      confidence: playbook.key === 'general' ? 'media' : 'alta',
      actions: [
        { label: 'Abrir area relacionada', section: playbook.section },
        { label: 'Abrir incidencias', section: 'incidencias' },
      ],
      sourceCollections: ['clases', 'pagos', 'incidencias', 'documentos', 'solicitudes', 'profesores', 'familias', 'chats'],
    },
  );
}

function buildOperationalPriorityRows(context) {
  const pendingFamilyAmount = context.familyStats.reduce((sum, item) => sum + item.pendingAmount, 0);
  const overdueFamilies = context.familyStats.filter((item) => item.overduePayments.length);
  const pendingFamilies = context.familyStats.filter((item) => item.pendingPayments.length);
  const criticalIncidents = context.incidentGroups.reduce((sum, item) => sum + item.critical, 0);
  const openIncidents = context.incidentGroups.reduce((sum, item) => sum + item.open, 0);
  const slowTeachers = context.teacherStats.filter((item) => item.active && item.responseHours > 24);
  const inactiveTeachers = context.teacherStats.filter((item) => item.active && (item.noNewStudentDays === null || item.noNewStudentDays > 30));

  return [
    pendingFamilies.length ? row(
      'Cobros familiares',
      `${formatEuros(pendingFamilyAmount)} pendiente`,
      `${pendingFamilies.length} familia(s) con pagos pendientes; ${overdueFamilies.length} ya vencida(s). Prioridad: desbloquear caja y evitar impagos largos.`,
      { section: 'calendario', tone: overdueFamilies.length ? 'danger' : 'warning', priority: overdueFamilies.length ? 100 : 82 },
    ) : null,
    openIncidents ? row(
      'Incidencias abiertas',
      `${openIncidents} abierta(s)`,
      `${criticalIncidents} critica(s). Lo importante es resolver las que bloquean clase, pago o confianza de una familia/profesor.`,
      { section: 'incidencias', tone: criticalIncidents ? 'danger' : 'warning', priority: criticalIncidents ? 96 : 78 },
    ) : null,
    context.unassignedRequests.length ? row(
      'Solicitudes sin profesor cerrado',
      `${context.unassignedRequests.length} solicitud(es)`,
      'Hay demanda sin asignacion final. Conviene entrar, elegir profesor y dejar el siguiente paso cerrado.',
      { section: 'solicitudes', tone: 'warning', priority: 76 },
    ) : null,
    context.pendingDocuments.length ? row(
      'Documentos por revisar',
      `${context.pendingDocuments.length} documento(s)`,
      'Validar documentos reduce friccion de confianza y evita perfiles a medias.',
      { section: 'documentos', tone: 'info', priority: 68 },
    ) : null,
    context.classesNeedingClosure.length ? row(
      'Clases sin cierre claro',
      `${context.classesNeedingClosure.length} clase(s)`,
      'Son clases antiguas que no estan cerradas como realizadas o canceladas. Revisa asistencia y pago asociado.',
      { section: 'calendario', tone: 'warning', priority: 66 },
    ) : null,
    slowTeachers.length ? row(
      'Profesores lentos respondiendo',
      `${slowTeachers.length} profesor(es)`,
      'Si tardan mas de 24h, pueden enfriar familias o solicitudes. Revisa chat o reemplazo si hay bloqueo.',
      { section: 'profesores', tone: 'warning', priority: 58 },
    ) : null,
    inactiveTeachers.length ? row(
      'Profesores sin alumnos recientes',
      `${inactiveTeachers.length} profesor(es)`,
      'Puede haber oferta buena parada. Revisa si conviene reactivar, pedir disponibilidad o no mostrarlos tanto.',
      { section: 'profesores', tone: 'info', priority: 44 },
    ) : null,
  ].filter(Boolean).sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

function answerTodayPriorities(context) {
  const rows = buildOperationalPriorityRows(context);
  const top = rows[0];
  return answerPayload(
    context,
    'today_priorities',
    'Prioridades operativas de hoy',
    top
      ? `Lo primero que revisaria es ${top.label.toLowerCase()}: ${top.metric}. Despues seguiria el orden de esta lista.`
      : 'No veo bloqueos claros ahora mismo. Mantendria una revision rapida de calendario, solicitudes y documentos.',
    rows,
    {
      actions: [
        { label: 'Abrir calendario', section: 'calendario' },
        { label: 'Abrir incidencias', section: 'incidencias' },
        { label: 'Abrir documentos', section: 'documentos' },
      ],
    },
  );
}

function answerBusinessHealth(context) {
  const pendingAmount = context.familyStats.reduce((sum, item) => sum + item.pendingAmount, 0);
  const completedLast30 = context.data.classes
    .filter(isCompletedClass)
    .filter((item) => {
      const age = daysSince(classDate(item));
      return age !== null && age <= 30;
    });
  const revenueLast30 = completedLast30.reduce((sum, item) => sum + amountOf(item), 0);
  const activeFamilies = context.familyStats.filter((item) => item.active).length;
  const activeTeachers = context.teacherStats.filter((item) => item.active).length;
  const activeVerifiedTeachers = context.teacherStats.filter((item) => item.active && item.verified).length;
  const rows = [
    row('Caja pendiente', formatEuros(pendingAmount), `${context.familyStats.filter((item) => item.pendingPayments.length).length} familia(s) tienen pagos pendientes.`, { section: 'calendario', tone: pendingAmount > 0 ? 'warning' : 'success' }),
    row('Ingresos ultimos 30 dias', formatEuros(revenueLast30), `${completedLast30.length} clase(s) realizadas/completadas detectadas en el periodo.`, { section: 'finanzas', tone: revenueLast30 > 0 ? 'success' : 'warning' }),
    row('Demanda nueva esta semana', `${context.week.requests.length + context.week.leads.length}`, `${context.week.requests.length} solicitud(es) y ${context.week.leads.length} lead(s) publico(s).`, { section: 'solicitudes', tone: (context.week.requests.length + context.week.leads.length) ? 'success' : 'info' }),
    row('Solicitudes sin cerrar', `${context.unassignedRequests.length}`, 'Demanda que todavia no tiene profesor asignado de forma clara.', { section: 'solicitudes', tone: context.unassignedRequests.length ? 'warning' : 'success' }),
    row('Base activa', `${activeFamilies} familias / ${activeTeachers} profesores`, `${activeVerifiedTeachers} profesor(es) activos verificados disponibles como oferta de confianza.`, { section: 'profesores', tone: activeVerifiedTeachers ? 'info' : 'warning' }),
    row('Riesgo de abandono', `${context.familyStats.filter((item) => item.churnScore >= 40).length} usuario(s)`, 'Calculado por pagos, incidencias, inactividad y confianza.', { section: 'familias', tone: context.familyStats.some((item) => item.churnScore >= 70) ? 'danger' : 'info' }),
  ];
  return answerPayload(
    context,
    'business_health',
    'Salud del negocio',
    `Lectura rapida: ${formatEuros(revenueLast30)} realizados en los ultimos 30 dias, ${formatEuros(pendingAmount)} pendiente de cobro y ${context.unassignedRequests.length} solicitud(es) sin cerrar.`,
    rows,
    {
      actions: [
        { label: 'Abrir finanzas', section: 'finanzas' },
        { label: 'Abrir calendario', section: 'calendario' },
        { label: 'Abrir solicitudes', section: 'solicitudes' },
      ],
    },
  );
}

function answerTrustQuality(context) {
  const activeTeachers = context.teacherStats.filter((item) => item.active);
  const verifiedTeachers = activeTeachers.filter((item) => item.verified);
  const slowTeachers = activeTeachers.filter((item) => item.responseHours > 24);
  const lowTrustTeachers = activeTeachers.filter((item) => item.trustScore > 0 && item.trustScore < 55);
  const pendingPaymentFamilies = context.familyStats.filter((item) => item.pendingPayments.length);
  const rows = [
    row('Profesores verificados', `${verifiedTeachers.length}/${activeTeachers.length}`, 'Oferta activa con validacion suficiente para asignar con confianza.', { section: 'profesores', tone: activeTeachers.length && verifiedTeachers.length / activeTeachers.length < 0.7 ? 'warning' : 'success' }),
    row('Documentos pendientes', `${context.pendingDocuments.length}`, 'Archivos que necesitan revision admin antes de subir confianza del perfil.', { section: 'documentos', tone: context.pendingDocuments.length ? 'warning' : 'success' }),
    row('Respuesta lenta', `${slowTeachers.length} profesor(es)`, 'Mas de 24h de respuesta media o señal equivalente. Afecta mucho a sensacion de confianza.', { section: 'profesores', tone: slowTeachers.length ? 'warning' : 'success' }),
    row('Perfiles con baja confianza', `${lowTrustTeachers.length} profesor(es)`, 'Confianza inferior a 55/100 en profesores activos.', { section: 'profesores', tone: lowTrustTeachers.length ? 'warning' : 'success' }),
    row('Familias con friccion de pago', `${pendingPaymentFamilies.length}`, 'Pagos pendientes reducen confianza operativa y pueden acabar en incidencia.', { section: 'familias', tone: pendingPaymentFamilies.length ? 'warning' : 'success' }),
    row('Incidencias abiertas', `${context.week.openIncidents.length}`, 'Problemas vivos que pueden afectar la percepcion de calidad.', { section: 'incidencias', tone: context.week.openIncidents.length ? 'warning' : 'success' }),
  ];
  return answerPayload(
    context,
    'trust_quality',
    'Confianza y calidad de la plataforma',
    `La confianza depende sobre todo de perfiles verificados, documentos revisados, respuesta rapida y pagos sin friccion. Ahora hay ${context.pendingDocuments.length} documento(s) pendiente(s) y ${slowTeachers.length} profesor(es) lentos respondiendo.`,
    rows,
    {
      actions: [
        { label: 'Abrir documentos', section: 'documentos' },
        { label: 'Abrir profesores', section: 'profesores' },
        { label: 'Abrir incidencias', section: 'incidencias' },
      ],
    },
  );
}

function answerGeneralHealth(context) {
  const activeInternalInsights = (context.data.internalAiInsights || [])
    .filter((item) => ['', 'active', 'activa', 'open', 'abierta', 'pending', 'pendiente'].includes(statusOf(item)));
  const priorityRows = buildOperationalPriorityRows(context).slice(0, 3);
  const rows = [
    ...priorityRows,
    row('Profesores activos', `${context.teacherStats.filter((item) => item.active).length}`, `${context.teacherStats.filter((item) => item.verified).length} verificados.`, { section: 'profesores', tone: 'info' }),
    row('Familias activas', `${context.familyStats.filter((item) => item.active).length}`, `${context.familyStats.filter((item) => item.pendingPayments.length).length} con pagos pendientes.`, { section: 'familias', tone: 'info' }),
    row('Clases esta semana', `${context.week.classes.length}`, `${context.week.completedClasses.length} completadas, ${formatEuros(context.week.revenue)} realizado.`, { section: 'clases', tone: 'success' }),
    row('Incidencias abiertas', `${context.week.openIncidents.length}`, 'Usa "Que incidencias se repiten mas?" para ver patrones.', { section: 'incidencias', tone: context.week.openIncidents.length ? 'warning' : 'success' }),
    row('IA interna activa', `${activeInternalInsights.length}`, 'Insights automaticos sobre chats, perfiles, documentos, datos y prioridades.', { section: 'operaciones', tone: activeInternalInsights.length ? 'warning' : 'success' }),
  ];
  return answerPayload(
    context,
    'general_health',
    'Estado general interpretado',
    priorityRows.length
      ? `Lectura general: hay ${priorityRows.length} foco(s) claros. El primero es ${priorityRows[0].label.toLowerCase()}: ${priorityRows[0].metric}.`
      : 'Lectura general: no veo bloqueos fuertes; revisaria calendario, solicitudes y documentos como rutina.',
    rows,
    {
      confidence: 'media',
      actions: [
        { label: 'Prioridades de hoy', section: 'operaciones' },
        { label: 'Abrir calendario', section: 'calendario' },
      ],
    },
  );
}

export function answerAdminQuestion(question, rawData = {}, options = {}) {
  const context = buildAdminAiContext(rawData, options);
  const intent = detectIntent(question);
  if (intent === 'inactive_teachers') return answerInactiveTeachers(context);
  if (intent === 'pending_family_payments') return answerPendingFamilyPayments(context);
  if (intent === 'teacher_response_risk') return answerTeacherResponseRisk(context);
  if (intent === 'incident_patterns') return answerIncidentPatterns(context);
  if (intent === 'weekly_summary') return answerWeeklySummary(context);
  if (intent === 'churn_risk') return answerChurnRisk(context);
  if (intent === 'teacher_highlights') return answerTeacherHighlights(context);
  if (intent === 'city_growth') return answerCityGrowth(context);
  if (intent === 'subject_supply_gap') return answerSubjectSupplyGap(context);
  if (intent === 'automation_opportunities') return answerAutomationOpportunities(context);
  if (intent === 'solution_finder') return answerSolutionFinder(context, question);
  if (intent === 'today_priorities') return answerTodayPriorities(context);
  if (intent === 'business_health') return answerBusinessHealth(context);
  if (intent === 'trust_quality') return answerTrustQuality(context);
  return answerGeneralHealth(context);
}

export const __adminAiTest = {
  clean,
  normalize,
  teacherId,
  familyId,
  subjectOf,
  cityOf,
  detectIntent,
  buildTeacherStats,
  buildFamilyStats,
};
