/**
 * ClasesDe10 - Admin AI engine.
 *
 * Free, deterministic and evidence-first. The admin assistant answers from
 * structured platform data instead of inventing with a generic LLM.
 */

export const ADMIN_AI_VERSION = 'admin_ai_ops_v1';

export const ADMIN_AI_EXAMPLES = [
  'Que profesores llevan mas de un mes sin recibir alumnos?',
  'Que familias tienen pagos pendientes?',
  'Que profesores tienen peor tasa de respuesta?',
  'Que incidencias se repiten mas?',
  'Hazme un resumen de esta semana',
  'Que usuarios podrian abandonar?',
  'Que profesores deberia destacar?',
  'Que ciudades estan creciendo mas?',
  'Que asignaturas necesitan mas profesores?',
  'Que procesos pueden automatizarse?',
];

const COMPLETED_STATUSES = new Set(['realizada', 'completada', 'completed', 'pagada', 'paid']);
const CANCELLED_STATUSES = new Set(['cancelada', 'cancelled', 'canceled']);
const ACTIVE_NEGATIVE_STATUSES = new Set(['rechazado', 'rejected', 'inactivo', 'inactive', 'bloqueado', 'blocked']);
const VERIFIED_STATUSES = new Set(['verificado', 'verified', 'activo', 'active', 'aprobado', 'approved']);
const PAYMENT_PENDING_STATUSES = new Set(['pendiente', 'pending', 'solicitado', 'procesando', 'vencido', 'overdue', 'needs_review', 'requiere_accion']);
const PAYMENT_DONE_STATUSES = new Set(['pagado', 'paid', 'validado', 'validated', 'succeeded', 'completado']);
const INCIDENT_OPEN_STATUSES = new Set(['abierta', 'open', 'pendiente', 'pending', 'en_proceso', 'review', 'en_revision']);

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
    },
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

function answerGeneralHealth(context) {
  const activeInternalInsights = (context.data.internalAiInsights || [])
    .filter((item) => ['', 'active', 'activa', 'open', 'abierta', 'pending', 'pendiente'].includes(statusOf(item)));
  const rows = [
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
    'Puedo responder mejor si preguntas por pagos, profesores, familias, incidencias, ciudades, asignaturas o automatizaciones.',
    rows,
    { confidence: 'media' },
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
