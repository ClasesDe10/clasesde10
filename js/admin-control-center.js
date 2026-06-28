/**
 * ClasesDe10 - admin control center.
 *
 * Builds a high-signal operating cockpit from the Firebase compatibility data
 * client. The existing sections remain the source of detailed CRUD workflows.
 */

import {
  collection,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { firebaseDb } from './firebase-client.js?v=20260627-domain-auth';

const instances = new WeakMap();
const LIVE_COLLECTIONS = [
  'leadsPublicos',
  'solicitudes',
  'profesores',
  'familias',
  'alumnos',
  'clases',
  'pagos',
  'documentos',
  'incidencias',
  'notificaciones',
  'notificationTokens',
  'asignaciones',
  'matchingRuns',
  'solicitudMatches',
  'classLifecycleEvents',
  'automationEvents',
];

function clean(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function escapeHtml(value) {
  return clean(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round((asNumber(value) + Number.EPSILON) * factor) / factor;
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

function formatNumber(value, decimals = 0) {
  return new Intl.NumberFormat('es-ES', {
    maximumFractionDigits: decimals,
  }).format(asNumber(value));
}

function formatHours(value) {
  const hours = asNumber(value);
  if (!Number.isFinite(hours) || hours <= 0) return '-';
  if (hours < 24) return `${round(hours, 1)}h`;
  return `${round(hours / 24, 1)}d`;
}

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value?.seconds) return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(value) {
  const date = normalizeDate(value);
  return date ? date.toISOString().slice(0, 10) : '';
}

function formatShortDate(value) {
  const date = normalizeDate(value);
  if (!date) return '';
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function nowIsoMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthKey(value) {
  const date = normalizeDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function lastMonths(count = 6) {
  const base = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(base.getFullYear(), base.getMonth() - (count - 1 - index), 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  });
}

function daysAgo(value) {
  const date = normalizeDate(value);
  if (!date) return Infinity;
  return (Date.now() - date.getTime()) / (24 * 60 * 60 * 1000);
}

function hoursBetween(startValue, endValue) {
  const start = normalizeDate(startValue);
  const end = normalizeDate(endValue);
  if (!start || !end) return null;
  const hours = (end.getTime() - start.getTime()) / (60 * 60 * 1000);
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

function average(values = []) {
  const cleanValues = values.filter((value) => Number.isFinite(value));
  if (!cleanValues.length) return 0;
  return cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length;
}

function median(values = []) {
  const cleanValues = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!cleanValues.length) return 0;
  const middle = Math.floor(cleanValues.length / 2);
  return cleanValues.length % 2 ? cleanValues[middle] : (cleanValues[middle - 1] + cleanValues[middle]) / 2;
}

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && clean(value) !== '');
}

function statusOf(item = {}) {
  return clean(first(item.estado, item.status, item.estado_verificacion, item.verificationStatus)).toLowerCase();
}

function paymentStatus(item = {}) {
  return clean(first(item.familyPaymentStatus, item.estado_pago_familia, item.paymentStatus, item.estado, item.status)).toLowerCase();
}

function teacherPaymentStatus(item = {}) {
  return clean(first(item.teacherPaymentStatus, item.estado_pago_profesor, item.payoutStatus)).toLowerCase();
}

function isActive(item = {}) {
  const status = statusOf(item);
  return item.active !== false && item.activo !== false && !['inactivo', 'inactive', 'rechazado', 'rejected'].includes(status);
}

function isVerifiedTeacher(item = {}) {
  const status = statusOf(item);
  return ['verificado', 'verified', 'activo', 'active'].includes(status);
}

function isCompletedClass(item = {}) {
  return ['realizada', 'completada', 'completed', 'pagada'].includes(statusOf(item));
}

function isScheduledClass(item = {}) {
  return ['programada', 'confirmada', 'pendiente', 'scheduled', 'confirmed'].includes(statusOf(item));
}

function isPaymentDone(status) {
  return ['pagado', 'paid', 'validado', 'validated', 'succeeded'].includes(clean(status).toLowerCase());
}

function classDate(item = {}) {
  return first(item.fecha, item.date, item.created_at, item.createdAt);
}

function createdDate(item = {}) {
  return first(item.created_at, item.createdAt, item.fecha, item.date, item.updated_at, item.updatedAt);
}

function updatedDate(item = {}) {
  return first(item.lastSeenAt, item.lastLoginAt, item.ultimo_acceso, item.updated_at, item.updatedAt, item.created_at, item.createdAt);
}

function classTotal(item = {}) {
  return asNumber(first(item.precio_total, item.amount, item.familyAmount, item.totalFamilia));
}

function teacherAmount(item = {}) {
  return asNumber(first(item.importe_profesor, item.teacherAmount, item.teacher_amount));
}

function platformFee(item = {}) {
  const explicit = first(item.comision_clasesde10, item.platformFee);
  if (explicit !== undefined) return asNumber(explicit);
  return classTotal(item) - teacherAmount(item);
}

function displayName(item = {}, fallback = 'Sin nombre') {
  const nested = item.usuarios || {};
  return clean([
    first(item.nombre, nested.nombre),
    first(item.apellidos, nested.apellidos),
  ].filter(Boolean).join(' '), 160)
    || clean(first(item.email, nested.email, item.id), 160)
    || fallback;
}

function requestSubject(item = {}) {
  return clean(first(item.materia, item.subject, item.metadata?.materia, item.asunto), 140) || 'Sin materia';
}

function renderBadge(label, tone = 'gray') {
  return `<span class="badge badge-${tone}">${escapeHtml(label)}</span>`;
}

function percentage(part, total) {
  return total > 0 ? (part / total) * 100 : 0;
}

function monthProgressPercent() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.min(100, Math.max(1, ((now.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100));
}

function trendFromPrevious(current, previous) {
  if (!previous) return '';
  const change = ((current - previous) / Math.max(1, Math.abs(previous))) * 100;
  return `${change >= 0 ? '+' : ''}${formatPercent(change)}`;
}

function teacherId(item = {}) {
  return clean(first(item.teacherUid, item.profesor_id, item.userUid, item.usuario_id, item.id), 180);
}

function familyId(item = {}) {
  return clean(first(item.familyUid, item.familia_id, item.userUid, item.usuario_id, item.id), 180);
}

function requestId(item = {}) {
  return clean(first(item.requestId, item.solicitud_id, item.id), 180);
}

function activityDate(item = {}) {
  return updatedDate(item);
}

async function safeRead(label, task, fallback = []) {
  try {
    const result = await task();
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.data)) return result.data;
    if (result?.data && typeof result.data === 'object') return [result.data];
    return fallback;
  } catch (error) {
    console.warn(`Control center could not load ${label}`, error);
    return fallback;
  }
}

async function loadRows(db, table) {
  const result = await db.from(table).select('*');
  if (result.error) throw result.error;
  return result.data || [];
}

async function loadData(db, leadsAdapter) {
  const [
    users,
    teachers,
    families,
    students,
    classes,
    requests,
    payments,
    documents,
    incidents,
    notifications,
    tokens,
    assignments,
    matchingRuns,
    requestMatches,
    lifecycleEvents,
    automationEvents,
    publicLeads,
  ] = await Promise.all([
    safeRead('users', () => loadRows(db, 'usuarios')),
    safeRead('teachers', () => loadRows(db, 'profesores')),
    safeRead('families', () => loadRows(db, 'familias')),
    safeRead('students', () => loadRows(db, 'alumnos')),
    safeRead('classes', () => loadRows(db, 'v_clases_completas')),
    safeRead('requests', () => loadRows(db, 'solicitudes')),
    safeRead('payments', () => loadRows(db, 'pagos')),
    safeRead('documents', () => loadRows(db, 'documentos')),
    safeRead('incidents', () => loadRows(db, 'incidencias')),
    safeRead('notifications', () => loadRows(db, 'notificaciones')),
    safeRead('notificationTokens', () => loadRows(db, 'notificationTokens')),
    safeRead('assignments', () => loadRows(db, 'asignaciones')),
    safeRead('matchingRuns', () => loadRows(db, 'matchingRuns')),
    safeRead('requestMatches', () => loadRows(db, 'solicitudMatches')),
    safeRead('lifecycleEvents', () => loadRows(db, 'classLifecycleEvents')),
    safeRead('automationEvents', () => loadRows(db, 'automationEvents')),
    safeRead('publicLeads', async () => {
      const result = leadsAdapter?.listPublic
        ? await leadsAdapter.listPublic({ max: 300 })
        : await loadRows(db, 'leadsPublicos');
      if (result.error) throw result.error;
      return result.data || [];
    }),
  ]);

  return {
    users,
    teachers,
    families,
    students,
    classes,
    requests,
    payments,
    documents,
    incidents,
    notifications,
    tokens,
    assignments,
    matchingRuns,
    requestMatches,
    lifecycleEvents,
    automationEvents,
    publicLeads,
  };
}

function computeMonthly(data) {
  const months = lastMonths(6);
  return months.map((month) => {
    const classes = data.classes.filter((item) => monthKey(classDate(item)) === month);
    const completed = classes.filter(isCompletedClass);
    const cancelled = classes.filter((item) => ['cancelada', 'cancelled'].includes(statusOf(item)));
    const payments = data.payments.filter((item) => monthKey(createdDate(item)) === month);
    const requests = data.requests.filter((item) => monthKey(createdDate(item)) === month);
    const leads = data.publicLeads.filter((item) => monthKey(createdDate(item)) === month);
    const families = data.families.filter((item) => monthKey(createdDate(item)) === month);
    const teachers = data.teachers.filter((item) => monthKey(createdDate(item)) === month);
    const incidents = data.incidents.filter((item) => monthKey(createdDate(item)) === month);
    const revenue = completed.reduce((sum, item) => sum + classTotal(item), 0);
    const margin = completed.reduce((sum, item) => sum + platformFee(item), 0);
    const cash = payments
      .filter((item) => !['teacher_payout', 'pago_profesor'].includes(item.paymentType || item.tipo) && isPaymentDone(paymentStatus(item)))
      .reduce((sum, item) => sum + asNumber(first(item.monto, item.amount)), 0);
    return {
      month,
      classes: classes.length,
      completed: completed.length,
      revenue,
      margin,
      cash,
      requests: requests.length,
      leads: leads.length,
      families: families.length,
      teachers: teachers.length,
      incidents: incidents.length,
      completionRate: percentage(completed.length, Math.max(1, classes.length - cancelled.length)),
    };
  });
}

function earliestBy(items, keyFn, dateFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const date = normalizeDate(dateFn(item));
    if (!key || !date) continue;
    const current = map.get(key);
    if (!current || date.getTime() < current.date.getTime()) {
      map.set(key, { item, date });
    }
  }
  return map;
}

function latestBy(items, keyFn, dateFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const date = normalizeDate(dateFn(item));
    if (!key || !date) continue;
    const current = map.get(key);
    if (!current || date.getTime() > current.date.getTime()) {
      map.set(key, { item, date });
    }
  }
  return map;
}

function computeOperationalTiming(data, requestsAssigned, requestsUnassigned) {
  const assignmentByRequest = earliestBy(data.assignments || [], requestId, createdDate);
  const selectedMatchByRequest = earliestBy(
    (data.requestMatches || []).filter((item) => ['asignado', 'selected', 'asignada'].includes(statusOf(item)) || first(item.selectedAt, item.selected_at)),
    requestId,
    (item) => first(item.selectedAt, item.selected_at, item.updatedAt, item.updated_at, item.createdAt, item.created_at),
  );
  const matchingRunByRequest = earliestBy(data.matchingRuns || [], requestId, createdDate);

  const assignmentDurations = requestsAssigned
    .map((item) => {
      const id = requestId(item);
      const assignedAt = first(
        item.assignedAt,
        item.assigned_at,
        item.selectedAt,
        item.matchSelectedAt,
        selectedMatchByRequest.get(id)?.date,
        assignmentByRequest.get(id)?.date,
        item.updatedAt,
        item.updated_at,
      );
      return hoursBetween(createdDate(item), assignedAt);
    })
    .filter((value) => value !== null);

  const firstMatchDurations = data.requests
    .map((item) => {
      const id = requestId(item);
      return hoursBetween(createdDate(item), first(item.matchComputedAt, item.matchComputed_at, matchingRunByRequest.get(id)?.date));
    })
    .filter((value) => value !== null);

  const teacherResponseHours = data.teachers
    .map((item) => asNumber(first(item.responseTimeHours, item.tiempo_respuesta_horas, item.avgResponseHours)))
    .filter((value) => value > 0);

  const staleHours = requestsUnassigned
    .map((item) => hoursBetween(createdDate(item), new Date()))
    .filter((value) => value !== null);

  return {
    avgTimeToAssignHours: average(assignmentDurations),
    medianTimeToAssignHours: median(assignmentDurations),
    avgTimeToFirstMatchHours: average(firstMatchDurations),
    avgTeacherResponseHours: average(teacherResponseHours),
    oldestUnassignedHours: Math.max(0, ...staleHours),
    assignmentsMeasured: assignmentDurations.length,
  };
}

function forecastMonthClose(metrics) {
  const progress = monthProgressPercent();
  const multiplier = 100 / progress;
  const currentMonthly = metrics.monthly.at(-1) || {};
  const previousMonthly = metrics.monthly.at(-2) || {};
  const projectedRevenue = metrics.revenueMonth * multiplier;
  const projectedMargin = metrics.marginMonth * multiplier;
  const projectedClasses = metrics.classesMonth.length * multiplier;
  const pipelineValue = metrics.scheduledFuture.reduce((sum, item) => {
    const month = monthKey(classDate(item));
    return month === nowIsoMonth() ? sum + classTotal(item) : sum;
  }, 0);

  return {
    progress,
    projectedRevenue,
    projectedMargin,
    projectedClasses,
    pipelineValue,
    projectedRevenueTrend: trendFromPrevious(projectedRevenue, previousMonthly.revenue),
    projectedClassesTrend: trendFromPrevious(projectedClasses, previousMonthly.classes),
    previousRevenue: previousMonthly.revenue || 0,
    currentCash: currentMonthly.cash || 0,
  };
}

function computeInactiveUsers(data, completedRecentClasses) {
  const recentTeacherIds = new Set(completedRecentClasses.map(teacherId).filter(Boolean));
  const recentFamilyIds = new Set(completedRecentClasses.map(familyId).filter(Boolean));
  const inactiveTeachers = data.teachers.filter((item) => {
    const id = teacherId(item);
    return isActive(item) && !recentTeacherIds.has(id) && daysAgo(activityDate(item)) > 30;
  });
  const inactiveFamilies = data.families.filter((item) => {
    const id = familyId(item);
    return isActive(item) && !recentFamilyIds.has(id) && daysAgo(activityDate(item)) > 30;
  });
  return { inactiveTeachers, inactiveFamilies };
}

function computeTeacherLeaderboard(data, completedRecentClasses) {
  const teachersById = new Map();
  data.teachers.forEach((item) => {
    const id = teacherId(item);
    if (id) teachersById.set(id, item);
  });

  const stats = new Map();
  completedRecentClasses.forEach((item) => {
    const id = teacherId(item);
    if (!id) return;
    const current = stats.get(id) || {
      teacher: teachersById.get(id) || { id },
      classes: 0,
      revenue: 0,
      margin: 0,
      paid: 0,
    };
    current.classes += 1;
    current.revenue += classTotal(item);
    current.margin += platformFee(item);
    if (isPaymentDone(paymentStatus(item))) current.paid += 1;
    stats.set(id, current);
  });

  return [...stats.values()].map((item) => {
    const rating = asNumber(first(item.teacher.valoracion_media, item.teacher.averageRating, item.teacher.rating));
    const response = asNumber(first(item.teacher.responseTimeHours, item.teacher.tiempo_respuesta_horas));
    const acceptance = asNumber(first(item.teacher.acceptanceRate, item.teacher.ratio_aceptacion));
    const paymentCoverage = percentage(item.paid, item.classes);
    const score = Math.round(
      item.classes * 12
      + Math.min(35, item.margin / 12)
      + rating * 8
      + paymentCoverage / 5
      + Math.min(10, acceptance <= 1 ? acceptance * 10 : acceptance / 10)
      - Math.min(12, response / 4),
    );
    return {
      ...item,
      rating,
      response,
      acceptance,
      paymentCoverage,
      score,
      name: displayName(item.teacher, 'Profesor'),
    };
  }).sort((a, b) => b.score - a.score).slice(0, 6);
}

function detectBusinessAnomalies(metrics) {
  const history = metrics.monthly.slice(0, -1);
  const avgRevenue = average(history.map((item) => item.revenue));
  const avgIncidents = average(history.map((item) => item.incidents));
  const avgCompletion = average(history.map((item) => item.completionRate).filter((value) => value > 0));
  const anomalies = [];

  if (avgRevenue > 0 && metrics.forecast.projectedRevenue < avgRevenue * 0.65) {
    anomalies.push({
      tone: 'danger',
      title: 'Ingresos proyectados por debajo de tendencia',
      body: `Prevision ${formatEuros(metrics.forecast.projectedRevenue)} frente a media ${formatEuros(avgRevenue)}.`,
      section: 'finanzas',
      metric: 'Revenue forecast',
    });
  }

  if (metrics.pendingPaymentAmount > Math.max(150, metrics.revenueMonth * 0.25)) {
    anomalies.push({
      tone: 'warning',
      title: 'Caja retenida por pagos pendientes',
      body: `${formatEuros(metrics.pendingPaymentAmount)} pendiente de validar o cobrar.`,
      section: 'pagos',
      metric: 'Payment backlog',
    });
  }

  if (metrics.completionRateMonth < Math.max(70, avgCompletion - 20) && metrics.classesMonth.length >= 3) {
    anomalies.push({
      tone: 'warning',
      title: 'Baja finalizacion de clases',
      body: `Solo ${formatPercent(metrics.completionRateMonth)} de clases del mes figuran completadas.`,
      section: 'clases',
      metric: 'Completion rate',
    });
  }

  if (metrics.timing.avgTimeToAssignHours > 24) {
    anomalies.push({
      tone: 'danger',
      title: 'Tiempo hasta profesor fuera de SLA',
      body: `Media ${formatHours(metrics.timing.avgTimeToAssignHours)}; objetivo recomendado inferior a 24h.`,
      section: 'solicitudes',
      metric: 'Time to teacher',
    });
  }

  if (metrics.openIncidents.length > Math.max(3, avgIncidents * 1.8)) {
    anomalies.push({
      tone: 'danger',
      title: 'Incidencias abiertas por encima de lo normal',
      body: `${metrics.openIncidents.length} incidencias abiertas; revisar antes de que afecten a confianza.`,
      section: 'incidencias',
      metric: 'Incident spike',
    });
  }

  if (percentage(metrics.inactiveTeachers.length, Math.max(1, metrics.teachersActive.length)) > 30) {
    anomalies.push({
      tone: 'warning',
      title: 'Oferta activa enfriandose',
      body: `${metrics.inactiveTeachers.length} profesor(es) activos sin actividad reciente.`,
      section: 'profesores',
      metric: 'Inactive supply',
    });
  }

  if (metrics.requestsUnassigned.length > Math.max(2, metrics.teachersVerified.length)) {
    anomalies.push({
      tone: 'danger',
      title: 'Demanda supera oferta asignable',
      body: `${metrics.requestsUnassigned.length} solicitudes sin profesor frente a ${metrics.teachersVerified.length} profesores verificados.`,
      section: 'solicitudes',
      metric: 'Supply demand imbalance',
    });
  }

  return anomalies.slice(0, 8);
}

function computeControlCenter(data) {
  const currentMonth = nowIsoMonth();
  const teachersActive = data.teachers.filter(isActive);
  const teachersVerified = data.teachers.filter((item) => isActive(item) && isVerifiedTeacher(item));
  const familiesActive = data.families.filter(isActive);
  const studentsActive = data.students.filter(isActive);
  const requestsOpen = data.requests.filter((item) => ['nueva', 'nuevo', 'pendiente', 'open'].includes(statusOf(item)));
  const requestsAssigned = data.requests.filter((item) => ['asignada', 'asignado', 'assigned'].includes(statusOf(item)) || first(item.assignedTeacherUid, item.profesor_asignado_id));
  const requestsUnassigned = requestsOpen.filter((item) => !first(item.assignedTeacherUid, item.profesor_asignado_id));
  const classesMonth = data.classes.filter((item) => monthKey(classDate(item)) === currentMonth);
  const completedMonth = classesMonth.filter(isCompletedClass);
  const scheduledFuture = data.classes.filter((item) => isScheduledClass(item) && String(isoDate(classDate(item))) >= String(new Date().toISOString().slice(0, 10)));
  const revenueMonth = completedMonth.reduce((sum, item) => sum + classTotal(item), 0);
  const teacherCostMonth = completedMonth.reduce((sum, item) => sum + teacherAmount(item), 0);
  const marginMonth = completedMonth.reduce((sum, item) => sum + platformFee(item), 0);
  const marginPct = percentage(marginMonth, revenueMonth);
  const pendingPayments = data.payments.filter((item) => ['pendiente', 'solicitado', 'procesando'].includes(paymentStatus(item)));
  const overduePayments = data.payments.filter((item) => ['vencido', 'overdue'].includes(paymentStatus(item)) || (item.dueAt && !isPaymentDone(paymentStatus(item)) && daysAgo(item.dueAt) > 0));
  const openIncidents = data.incidents.filter((item) => ['abierta', 'open', 'en_proceso'].includes(statusOf(item)));
  const pendingDocs = data.documents.filter((item) => ['pendiente', 'pending', 'revision', 'en_revision'].includes(statusOf(item)));
  const pendingTeachers = data.teachers.filter((item) => ['pendiente', 'pending'].includes(statusOf(item)));
  const newLeads = data.publicLeads.filter((item) => ['nuevo', 'nueva', 'new'].includes(statusOf(item)));
  const pushDevices = data.tokens.filter((item) => item.active !== false);
  const paidClasses = completedMonth.filter((item) => isPaymentDone(paymentStatus(item)));
  const teacherPaidClasses = completedMonth.filter((item) => isPaymentDone(teacherPaymentStatus(item)));
  const classPaymentCoverage = percentage(paidClasses.length, completedMonth.length);
  const teacherPayoutCoverage = percentage(teacherPaidClasses.length, completedMonth.length);
  const completionRateMonth = percentage(completedMonth.length, Math.max(1, classesMonth.filter((item) => !['cancelada', 'cancelled'].includes(statusOf(item))).length));
  const assignedConversion = percentage(requestsAssigned.length, data.requests.length);
  const leadToRequestConversion = percentage(data.requests.length, data.publicLeads.length);
  const requestToClassConversion = percentage(data.classes.length, requestsAssigned.length);
  const supplyDemandRatio = requestsOpen.length ? teachersVerified.length / requestsOpen.length : teachersVerified.length;
  const monthly = computeMonthly(data);
  const completedRecentClasses = data.classes.filter((item) => isCompletedClass(item) && daysAgo(classDate(item)) <= 45);
  const timing = computeOperationalTiming(data, requestsAssigned, requestsUnassigned);
  const inactive = computeInactiveUsers(data, completedRecentClasses);
  const teacherLeaderboard = computeTeacherLeaderboard(data, completedRecentClasses);

  const riskyClasses = data.classes.filter((item) => {
    if (!isCompletedClass(item)) return false;
    if (classTotal(item) <= 0 || teacherAmount(item) <= 0) return true;
    return classTotal(item) > 0 && percentage(platformFee(item), classTotal(item)) < 15;
  });

  const staleUnassigned = requestsUnassigned.filter((item) => daysAgo(createdDate(item)) > 1);
  const classesWithoutConfirmation = data.classes.filter((item) => isScheduledClass(item) && daysAgo(classDate(item)) > 0.05);
  const lifecycleBlocked = (data.lifecycleEvents || []).filter((item) => ['incidencia_abierta', 'pendiente_confirmacion', 'pendiente_pago'].includes(clean(item.to).toLowerCase()) && daysAgo(createdDate(item)) <= 14);
  const automationErrors = (data.automationEvents || []).filter((item) => {
    const text = clean([item.type, item.status, item.error, item.message].join(' ')).toLowerCase();
    return /(error|failed|fallo|exception|missing|unavailable)/.test(text) && daysAgo(createdDate(item)) <= 14;
  });
  const pendingPaymentAmount = pendingPayments.reduce((sum, item) => sum + asNumber(first(item.monto, item.amount)), 0);
  const overduePaymentAmount = overduePayments.reduce((sum, item) => sum + asNumber(first(item.monto, item.amount)), 0);
  const averageTicket = completedMonth.length ? revenueMonth / completedMonth.length : 0;
  const completionHealth = classesMonth.length ? completionRateMonth : 100;
  const forecastBase = {
    monthly,
    revenueMonth,
    marginMonth,
    classesMonth,
    scheduledFuture,
  };
  const forecast = forecastMonthClose(forecastBase);
  const healthScore = Math.max(0, Math.min(100, Math.round(
    100
    - Math.min(25, overduePayments.length * 5)
    - Math.min(18, staleUnassigned.length * 4)
    - Math.min(18, openIncidents.length * 4)
    - Math.max(0, 90 - completionHealth) * 0.25
    - Math.min(18, Math.max(0, timing.avgTimeToAssignHours - 24) * 0.6)
    - Math.min(12, riskyClasses.length * 2)
  )));

  const baseMetrics = {
    teachersActive,
    teachersVerified,
    familiesActive,
    studentsActive,
    requestsOpen,
    requestsAssigned,
    requestsUnassigned,
    classesMonth,
    completedMonth,
    scheduledFuture,
    revenueMonth,
    teacherCostMonth,
    marginMonth,
    marginPct,
    pendingPayments,
    overduePayments,
    openIncidents,
    pendingDocs,
    pendingTeachers,
    newLeads,
    pushDevices,
    classPaymentCoverage,
    teacherPayoutCoverage,
    completionRateMonth,
    assignedConversion,
    leadToRequestConversion,
    requestToClassConversion,
    supplyDemandRatio,
    monthly,
    riskyClasses,
    staleUnassigned,
    classesWithoutConfirmation,
    lifecycleBlocked,
    automationErrors,
    pendingPaymentAmount,
    overduePaymentAmount,
    averageTicket,
    timing,
    forecast,
    healthScore,
    inactiveTeachers: inactive.inactiveTeachers,
    inactiveFamilies: inactive.inactiveFamilies,
    teacherLeaderboard,
  };
  const anomalies = detectBusinessAnomalies(baseMetrics);

  const alerts = [
    ...anomalies,
    ...overduePayments.map((item) => ({
      tone: 'danger',
      title: 'Pago vencido',
      body: `${formatEuros(first(item.monto, item.amount))} pendiente desde ${formatShortDate(first(item.dueAt, item.due_at, item.createdAt, item.created_at))}`,
      section: 'pagos',
    })),
    ...openIncidents.filter((item) => ['alta', 'urgente', 'critical'].includes(clean(first(item.prioridad, item.priority)).toLowerCase())).map((item) => ({
      tone: 'danger',
      title: 'Incidencia prioritaria',
      body: clean(first(item.titulo, item.descripcion, item.description), 180) || 'Revisar incidencia abierta.',
      section: 'incidencias',
    })),
    ...(staleUnassigned.length ? [{
      tone: 'warning',
      title: 'Solicitudes sin asignar',
      body: `${staleUnassigned.length} solicitud(es) llevan mas de 24h sin profesor.`,
      section: 'solicitudes',
    }] : []),
    ...(pendingTeachers.length ? [{
      tone: 'warning',
      title: 'Profesores pendientes',
      body: `${pendingTeachers.length} profesor(es) esperan validacion o moderacion.`,
      section: 'profesores',
    }] : []),
    ...(pendingDocs.length ? [{
      tone: 'warning',
      title: 'Documentos pendientes',
      body: `${pendingDocs.length} documento(s) necesitan revision.`,
      section: 'documentos',
    }] : []),
    ...(riskyClasses.length ? [{
      tone: 'warning',
      title: 'Margen o precio incompleto',
      body: `${riskyClasses.length} clase(s) tienen importes incompletos o margen bajo.`,
      section: 'finanzas',
    }] : []),
    ...(classesWithoutConfirmation.length ? [{
      tone: 'warning',
      title: 'Clases sin cerrar',
      body: `${classesWithoutConfirmation.length} clase(s) pasadas siguen programadas/pendientes.`,
      section: 'clases',
    }] : []),
    ...(automationErrors.length ? [{
      tone: 'danger',
      title: 'Automatizacion con errores',
      body: `${automationErrors.length} evento(s) recientes indican fallos o destinatarios ausentes.`,
      section: 'incidencias',
    }] : []),
  ].slice(0, 10);

  const activity = [
    ...data.publicLeads.map((item) => ({
      date: createdDate(item),
      title: `Lead ${first(item.tipo, 'contacto')}`,
      body: first(item.nombre, item.email, item.asunto, 'Entrada publica'),
      section: 'leads',
      tone: 'info',
    })),
    ...data.requests.map((item) => ({
      date: createdDate(item),
      title: `Solicitud ${statusOf(item) || 'nueva'}`,
      body: requestSubject(item),
      section: 'solicitudes',
      tone: 'gold',
    })),
    ...data.payments.map((item) => ({
      date: createdDate(item),
      title: `Pago ${paymentStatus(item) || 'pendiente'}`,
      body: `${formatEuros(first(item.monto, item.amount))} - ${first(item.metodo, item.method, item.provider, 'manual')}`,
      section: 'pagos',
      tone: 'success',
    })),
    ...data.incidents.map((item) => ({
      date: createdDate(item),
      title: `Incidencia ${statusOf(item) || 'abierta'}`,
      body: first(item.titulo, item.descripcion, item.description, 'Revision operativa'),
      section: 'incidencias',
      tone: 'danger',
    })),
    ...data.documents.map((item) => ({
      date: createdDate(item),
      title: `Documento ${statusOf(item) || 'pendiente'}`,
      body: first(item.nombre, item.tipo, item.fileName, 'Documento'),
      section: 'documentos',
      tone: 'info',
    })),
  ]
    .filter((item) => normalizeDate(item.date))
    .sort((a, b) => normalizeDate(b.date).getTime() - normalizeDate(a.date).getTime())
    .slice(0, 14);

  const moderation = [
    ...pendingTeachers.slice(0, 4).map((item) => ({
      title: displayName(item, 'Profesor'),
      body: 'Pendiente de verificacion',
      section: 'profesores',
      tone: 'warning',
    })),
    ...pendingDocs.slice(0, 4).map((item) => ({
      title: first(item.nombre, item.tipo, 'Documento'),
      body: 'Documento pendiente de revision',
      section: 'documentos',
      tone: 'info',
    })),
    ...openIncidents.slice(0, 4).map((item) => ({
      title: first(item.titulo, item.tipo, 'Incidencia'),
      body: first(item.descripcion, item.description, 'Incidencia abierta'),
      section: 'incidencias',
      tone: ['alta', 'urgente'].includes(clean(first(item.prioridad, item.priority)).toLowerCase()) ? 'danger' : 'warning',
    })),
  ].slice(0, 10);

  const dataQuality = [
    { label: 'Clases con precio/margen incompleto', value: riskyClasses.length, section: 'finanzas' },
    { label: 'Solicitudes antiguas sin asignar', value: staleUnassigned.length, section: 'solicitudes' },
    { label: 'Pagos vencidos', value: overduePayments.length, section: 'pagos' },
    { label: 'Documentos pendientes', value: pendingDocs.length, section: 'documentos' },
    { label: 'Profesores pendientes', value: pendingTeachers.length, section: 'profesores' },
    { label: 'Usuarios inactivos', value: inactive.inactiveTeachers.length + inactive.inactiveFamilies.length, section: 'profesores' },
  ];

  return {
    ...baseMetrics,
    teachersActive,
    teachersVerified,
    familiesActive,
    studentsActive,
    requestsOpen,
    requestsAssigned,
    requestsUnassigned,
    classesMonth,
    completedMonth,
    scheduledFuture,
    revenueMonth,
    teacherCostMonth,
    marginMonth,
    marginPct,
    pendingPayments,
    overduePayments,
    openIncidents,
    pendingDocs,
    pendingTeachers,
    newLeads,
    pushDevices,
    classPaymentCoverage,
    teacherPayoutCoverage,
    completionRateMonth,
    assignedConversion,
    leadToRequestConversion,
    requestToClassConversion,
    supplyDemandRatio,
    monthly,
    anomalies,
    riskyClasses,
    staleUnassigned,
    classesWithoutConfirmation,
    lifecycleBlocked,
    automationErrors,
    pendingPaymentAmount,
    overduePaymentAmount,
    averageTicket,
    timing,
    forecast,
    healthScore,
    inactiveTeachers: inactive.inactiveTeachers,
    inactiveFamilies: inactive.inactiveFamilies,
    teacherLeaderboard,
    alerts,
    activity,
    moderation,
    dataQuality,
  };
}

function renderKpi({ label, value, trend = '', tone = 'navy', sub = '' }) {
  return `<div class="stat-card control-kpi">
    <div class="stat-card-header">
      <div class="stat-card-icon ${escapeHtml(tone)}"></div>
      ${trend ? `<span class="stat-card-trend ${trend.startsWith('-') ? 'trend-down' : 'trend-up'}">${escapeHtml(trend)}</span>` : ''}
    </div>
    <div class="stat-card-value">${escapeHtml(value)}</div>
    <div class="stat-card-label">${escapeHtml(label)}</div>
    ${sub ? `<div class="control-kpi-sub">${escapeHtml(sub)}</div>` : ''}
  </div>`;
}

function renderProgress(label, value, maxValue, tone = 'navy') {
  const percent = maxValue > 0 ? Math.min(100, Math.max(0, (value / maxValue) * 100)) : 0;
  return `<div class="control-progress-row">
    <div class="control-progress-top">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(formatPercent(percent))}</strong>
    </div>
    <div class="control-progress-track"><div class="control-progress-fill ${escapeHtml(tone)}" style="width:${percent}%"></div></div>
  </div>`;
}

function renderActionButton(section, label = 'Abrir') {
  return `<button class="btn btn-ghost btn-sm" type="button" data-control-nav="${escapeHtml(section)}">${escapeHtml(label)}</button>`;
}

function renderAlert(item) {
  const alertClass = item.tone === 'danger' ? 'alert-danger' : item.tone === 'success' ? 'alert-success' : 'alert-warning';
  return `<article class="alert ${alertClass} control-alert">
    <span class="alert-icon">${item.tone === 'danger' ? '!' : 'i'}</span>
    <div class="alert-body">
      <div class="alert-title">${escapeHtml(item.title)}</div>
      <div>${escapeHtml(item.body)}</div>
    </div>
    ${renderActionButton(item.section)}
  </article>`;
}

function renderTimeline(items) {
  if (!items.length) {
    return '<div class="empty-state"><div class="empty-title">Sin actividad reciente</div><div class="empty-desc">Aparecera aqui cuando entren leads, pagos, solicitudes o incidencias.</div></div>';
  }
  return items.map((item) => `<article class="control-activity-item">
    <div class="control-activity-dot ${escapeHtml(item.tone)}"></div>
    <div class="control-activity-body">
      <div class="control-activity-title">${escapeHtml(item.title)}</div>
      <div class="control-activity-text">${escapeHtml(item.body)}</div>
      <div class="control-activity-meta">${escapeHtml(formatShortDate(item.date))}</div>
    </div>
    ${renderActionButton(item.section)}
  </article>`).join('');
}

function renderModeration(items) {
  if (!items.length) {
    return '<div class="empty-state"><div class="empty-title">Moderacion al dia</div><div class="empty-desc">No hay verificaciones, documentos o incidencias pendientes.</div></div>';
  }
  return items.map((item) => `<article class="control-list-item">
    <div>
      <div class="control-list-title">${escapeHtml(item.title)}</div>
      <div class="control-list-meta">${escapeHtml(item.body)}</div>
    </div>
    <div class="control-list-actions">
      ${renderBadge(item.tone === 'danger' ? 'Urgente' : item.tone === 'warning' ? 'Revisar' : 'Pendiente', item.tone)}
      ${renderActionButton(item.section)}
    </div>
  </article>`).join('');
}

function renderMonthlyChart(monthly) {
  const maxRevenue = Math.max(1, ...monthly.map((item) => item.revenue));
  return `<div class="control-chart">
    ${monthly.map((item) => {
      const height = Math.max(6, Math.round((item.revenue / maxRevenue) * 100));
      return `<div class="control-chart-col">
        <div class="control-chart-bar" style="height:${height}%"></div>
        <div class="control-chart-label">${escapeHtml(item.month.slice(5))}</div>
        <div class="control-chart-value">${escapeHtml(formatEuros(item.revenue))}</div>
        <div class="control-chart-sub">${escapeHtml(String(item.completed))} clases</div>
      </div>`;
    }).join('')}
  </div>`;
}

function renderForecast(metrics) {
  const forecast = metrics.forecast;
  return `<div class="control-forecast-grid">
    <div class="control-forecast-item">
      <span>Prevision de cierre</span>
      <strong>${escapeHtml(formatEuros(forecast.projectedRevenue))}</strong>
      <em>${escapeHtml(forecast.projectedRevenueTrend || 'Sin historico')}</em>
    </div>
    <div class="control-forecast-item">
      <span>Clases proyectadas</span>
      <strong>${escapeHtml(formatNumber(forecast.projectedClasses, 0))}</strong>
      <em>${escapeHtml(forecast.projectedClassesTrend || 'Sin historico')}</em>
    </div>
    <div class="control-forecast-item">
      <span>Pipeline mes</span>
      <strong>${escapeHtml(formatEuros(forecast.pipelineValue))}</strong>
      <em>clases futuras con importe</em>
    </div>
    <div class="control-forecast-item">
      <span>Progreso del mes</span>
      <strong>${escapeHtml(formatPercent(forecast.progress))}</strong>
      <em>${escapeHtml(formatEuros(forecast.currentCash))} caja validada</em>
    </div>
  </div>`;
}

function renderInsightCards(metrics) {
  const insights = [
    {
      label: 'Tiempo medio hasta profesor',
      value: formatHours(metrics.timing.avgTimeToAssignHours),
      sub: `${metrics.timing.assignmentsMeasured} asignaciones medidas`,
      tone: metrics.timing.avgTimeToAssignHours > 24 ? 'danger' : 'success',
      section: 'solicitudes',
    },
    {
      label: 'Tiempo medio de matching',
      value: formatHours(metrics.timing.avgTimeToFirstMatchHours),
      sub: 'desde solicitud hasta ranking',
      tone: metrics.timing.avgTimeToFirstMatchHours > 4 ? 'warning' : 'success',
      section: 'solicitudes',
    },
    {
      label: 'Clase media',
      value: formatEuros(metrics.averageTicket),
      sub: `${formatPercent(metrics.marginPct)} margen`,
      tone: metrics.marginPct < 15 ? 'warning' : 'success',
      section: 'finanzas',
    },
    {
      label: 'Backlog de caja',
      value: formatEuros(metrics.pendingPaymentAmount),
      sub: `${formatEuros(metrics.overduePaymentAmount)} vencido`,
      tone: metrics.overduePaymentAmount ? 'danger' : metrics.pendingPaymentAmount ? 'warning' : 'success',
      section: 'pagos',
    },
  ];

  return `<div class="control-insight-grid">
    ${insights.map((item) => `<button class="control-insight-card ${escapeHtml(item.tone)}" type="button" data-control-nav="${escapeHtml(item.section)}">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <em>${escapeHtml(item.sub)}</em>
    </button>`).join('')}
  </div>`;
}

function renderAnomalies(items) {
  if (!items.length) {
    return '<div class="empty-state"><div class="empty-title">Sin anomalías detectadas</div><div class="empty-desc">Los indicadores principales estan dentro de rango.</div></div>';
  }
  return items.map((item) => `<article class="control-anomaly-card ${escapeHtml(item.tone)}">
    <div>
      <div class="control-anomaly-metric">${escapeHtml(item.metric || 'Anomalia')}</div>
      <div class="control-anomaly-title">${escapeHtml(item.title)}</div>
      <div class="control-anomaly-body">${escapeHtml(item.body)}</div>
    </div>
    ${renderActionButton(item.section, 'Revisar')}
  </article>`).join('');
}

function renderTeacherLeaderboard(items) {
  if (!items.length) {
    return '<div class="empty-state"><div class="empty-title">Sin profesores destacados todavia</div><div class="empty-desc">Apareceran cuando haya clases completadas recientes.</div></div>';
  }
  return items.map((item, index) => `<article class="control-rank-row">
    <div class="control-rank-position">${index + 1}</div>
    <div>
      <div class="control-rank-title">${escapeHtml(item.name)}</div>
      <div class="control-rank-meta">${escapeHtml(String(item.classes))} clases · ${escapeHtml(formatEuros(item.revenue))} facturado · ${escapeHtml(formatPercent(item.paymentCoverage))} cobrado</div>
    </div>
    <div class="control-rank-score">${escapeHtml(String(item.score))}</div>
  </article>`).join('');
}

function renderInactiveUsers(metrics) {
  const total = metrics.inactiveTeachers.length + metrics.inactiveFamilies.length;
  if (!total) {
    return '<div class="empty-state"><div class="empty-title">Actividad sana</div><div class="empty-desc">No hay bolsas relevantes de usuarios inactivos.</div></div>';
  }
  const rows = [
    { label: 'Profesores activos sin actividad reciente', value: metrics.inactiveTeachers.length, section: 'profesores' },
    { label: 'Familias activas sin actividad reciente', value: metrics.inactiveFamilies.length, section: 'familias' },
  ];
  return rows.map((item) => `<button class="control-audit-row" type="button" data-control-nav="${escapeHtml(item.section)}">
    <span>${escapeHtml(item.label)}</span>
    <strong>${escapeHtml(String(item.value))}</strong>
  </button>`).join('');
}

function renderSlaPanel(metrics) {
  return `<div class="control-sla-grid">
    ${renderProgress('Asignacion < 24h', Math.max(0, 100 - percentage(metrics.staleUnassigned.length, Math.max(1, metrics.requestsOpen.length))), 100, metrics.staleUnassigned.length ? 'gold' : 'green')}
    ${renderProgress('Clases completadas', metrics.completionRateMonth, 100, metrics.completionRateMonth < 80 ? 'gold' : 'green')}
    ${renderProgress('Cobertura pago familias', metrics.classPaymentCoverage, 100, metrics.classPaymentCoverage < 80 ? 'gold' : 'green')}
    ${renderProgress('Liquidacion profesores', metrics.teacherPayoutCoverage, 100, metrics.teacherPayoutCoverage < 80 ? 'gold' : 'green')}
    <div class="control-market-grid control-market-grid-compact">
      <div><strong>${escapeHtml(formatHours(metrics.timing.oldestUnassignedHours))}</strong><span>Solicitud mas antigua sin profesor</span></div>
      <div><strong>${metrics.classesWithoutConfirmation.length}</strong><span>Clases sin confirmar</span></div>
      <div><strong>${metrics.lifecycleBlocked.length}</strong><span>Eventos lifecycle bloqueados</span></div>
      <div><strong>${metrics.automationErrors.length}</strong><span>Alertas de automatizacion</span></div>
    </div>
  </div>`;
}

function renderDataQuality(items) {
  return items.map((item) => `<button class="control-audit-row" type="button" data-control-nav="${escapeHtml(item.section)}">
    <span>${escapeHtml(item.label)}</span>
    <strong>${escapeHtml(String(item.value))}</strong>
  </button>`).join('');
}

function renderControlCenter(container, metrics, state) {
  const previousMonth = metrics.monthly.at(-2) || {};
  const currentMonth = metrics.monthly.at(-1) || {};
  const revenueTrend = trendFromPrevious(currentMonth.revenue || 0, previousMonth.revenue || 0);
  const classTrend = trendFromPrevious(currentMonth.classes || 0, previousMonth.classes || 0);
  const healthTone = metrics.healthScore >= 80 ? 'success' : metrics.healthScore >= 60 ? 'warning' : 'danger';

  container.innerHTML = `<div class="control-center">
    <div class="control-hero">
      <div>
        <div class="control-eyebrow">Inteligencia empresarial</div>
        <h2>Estado completo de ClasesDe10</h2>
        <p>KPIs, prevision de cierre, anomalias, SLA operativo, caja, crecimiento y riesgos en una sola vista accionable.</p>
      </div>
      <div class="control-health-score ${escapeHtml(healthTone)}" style="--score:${metrics.healthScore}">
        <strong>${escapeHtml(String(metrics.healthScore))}</strong>
        <span>salud operativa</span>
      </div>
      <div class="control-live">
        ${renderBadge(state.live ? 'En vivo' : 'Manual', state.live ? 'success' : 'gray')}
        <span>Actualizado ${escapeHtml(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))}</span>
        <button class="btn btn-outline btn-sm" type="button" data-control-refresh>Actualizar</button>
      </div>
    </div>

    <div class="stats-grid control-kpi-grid">
      ${renderKpi({ label: 'Profesores activos', value: metrics.teachersActive.length, tone: 'navy', sub: `${metrics.teachersVerified.length} verificados` })}
      ${renderKpi({ label: 'Solicitudes sin profesor', value: metrics.requestsUnassigned.length, tone: metrics.requestsUnassigned.length ? 'red' : 'green', sub: `${metrics.requestsOpen.length} abiertas` })}
      ${renderKpi({ label: 'Clases este mes', value: metrics.classesMonth.length, trend: classTrend, tone: 'teal', sub: `${metrics.completedMonth.length} realizadas` })}
      ${renderKpi({ label: 'Finalizacion clases', value: formatPercent(metrics.completionRateMonth), tone: metrics.completionRateMonth < 80 ? 'gold' : 'green', sub: 'mes actual' })}
      ${renderKpi({ label: 'Ingresos devengados', value: formatEuros(metrics.revenueMonth), trend: revenueTrend, tone: 'green', sub: `${formatEuros(metrics.marginMonth)} margen` })}
      ${renderKpi({ label: 'Prevision cierre', value: formatEuros(metrics.forecast.projectedRevenue), trend: metrics.forecast.projectedRevenueTrend, tone: 'navy', sub: `${formatEuros(metrics.forecast.pipelineValue)} pipeline` })}
      ${renderKpi({ label: 'Pagos pendientes', value: metrics.pendingPayments.length, tone: metrics.overduePayments.length ? 'red' : 'gold', sub: `${formatEuros(metrics.pendingPaymentAmount)} backlog` })}
      ${renderKpi({ label: 'Tiempo hasta profesor', value: formatHours(metrics.timing.avgTimeToAssignHours), tone: metrics.timing.avgTimeToAssignHours > 24 ? 'red' : 'green', sub: `mediana ${formatHours(metrics.timing.medianTimeToAssignHours)}` })}
      ${renderKpi({ label: 'Anomalias activas', value: metrics.anomalies.length, tone: metrics.anomalies.some((item) => item.tone === 'danger') ? 'red' : metrics.anomalies.length ? 'gold' : 'green', sub: `${metrics.alerts.length} alertas totales` })}
    </div>

    <div class="control-grid-main">
      <section class="card control-card">
        <div class="card-header">
          <span class="card-title">Prevision de cierre</span>
          ${renderBadge('Run-rate', 'navy')}
        </div>
        <div class="card-body control-stack">
          ${renderForecast(metrics)}
          ${renderInsightCards(metrics)}
        </div>
      </section>

      <section class="card control-card">
        <div class="card-header">
          <span class="card-title">Deteccion de anomalias</span>
          ${renderBadge(`${metrics.anomalies.length}`, metrics.anomalies.length ? 'warning' : 'success')}
        </div>
        <div class="card-body control-stack">
          ${renderAnomalies(metrics.anomalies)}
        </div>
      </section>
    </div>

    <div class="control-grid-main">
      <section class="card control-card">
        <div class="card-header">
          <span class="card-title">Salud del marketplace</span>
          ${renderBadge(metrics.supplyDemandRatio >= 1 ? 'Oferta suficiente' : 'Falta oferta', metrics.supplyDemandRatio >= 1 ? 'success' : 'warning')}
        </div>
        <div class="card-body control-stack">
          ${renderProgress('Leads -> solicitudes', metrics.leadToRequestConversion, 100, 'teal')}
          ${renderProgress('Solicitudes asignadas', metrics.assignedConversion, 100, 'navy')}
          ${renderProgress('Solicitudes -> clases', metrics.requestToClassConversion, 100, 'gold')}
          <div class="control-market-grid">
            <div><strong>${metrics.requestsOpen.length}</strong><span>Solicitudes abiertas</span></div>
            <div><strong>${metrics.requestsUnassigned.length}</strong><span>Sin profesor</span></div>
            <div><strong>${round(metrics.supplyDemandRatio, 2)}x</strong><span>Oferta/demanda</span></div>
            <div><strong>${metrics.scheduledFuture.length}</strong><span>Clases futuras</span></div>
            <div><strong>${metrics.familiesActive.length}</strong><span>Familias activas</span></div>
            <div><strong>${metrics.studentsActive.length}</strong><span>Alumnos activos</span></div>
          </div>
        </div>
      </section>

      <section class="card control-card">
        <div class="card-header">
          <span class="card-title">Evolucion mensual</span>
          ${renderBadge('6 meses', 'navy')}
        </div>
        <div class="card-body">
          ${renderMonthlyChart(metrics.monthly)}
        </div>
      </section>
    </div>

    <div class="control-grid-main">
      <section class="card control-card">
        <div class="card-header">
          <span class="card-title">SLA operativo</span>
          ${renderBadge(metrics.timing.avgTimeToAssignHours > 24 ? 'Fuera de objetivo' : 'En objetivo', metrics.timing.avgTimeToAssignHours > 24 ? 'warning' : 'success')}
        </div>
        <div class="card-body control-stack">
          ${renderSlaPanel(metrics)}
        </div>
      </section>

      <section class="card control-card">
        <div class="card-header">
          <span class="card-title">Profesores destacados</span>
          ${renderBadge('45 dias', 'teal')}
        </div>
        <div class="card-body control-stack">
          ${renderTeacherLeaderboard(metrics.teacherLeaderboard)}
        </div>
      </section>
    </div>

    <div class="control-grid-main">
      <section class="card control-card">
        <div class="card-header">
          <span class="card-title">Alertas automaticas</span>
          ${renderBadge(`${metrics.alerts.length}`, metrics.alerts.length ? 'warning' : 'success')}
        </div>
        <div class="card-body control-stack">
          ${metrics.alerts.length ? metrics.alerts.map(renderAlert).join('') : '<div class="empty-state"><div class="empty-title">Sin alertas criticas</div><div class="empty-desc">Pagos, clases, solicitudes y moderacion estan en rango.</div></div>'}
        </div>
      </section>

      <section class="card control-card">
        <div class="card-header">
          <span class="card-title">Funnel operativo</span>
          ${renderBadge('Conversion', 'teal')}
        </div>
        <div class="card-body control-stack">
          ${renderProgress('Leads captados', metrics.newLeads.length, Math.max(1, metrics.newLeads.length), 'teal')}
          ${renderProgress('Solicitudes abiertas', metrics.requestsOpen.length, Math.max(1, metrics.newLeads.length || metrics.requestsOpen.length), 'gold')}
          ${renderProgress('Solicitudes asignadas', metrics.requestsAssigned.length, Math.max(1, metrics.requestsOpen.length + metrics.requestsAssigned.length), 'navy')}
          ${renderProgress('Clases pagadas familia', metrics.classPaymentCoverage, 100, 'green')}
          ${renderProgress('Profesores pagados', metrics.teacherPayoutCoverage, 100, 'gold')}
          <div class="control-market-grid">
            <div><strong>${metrics.pushDevices.length}</strong><span>Dispositivos push</span></div>
            <div><strong>${formatPercent(metrics.marginPct)}</strong><span>Margen mes</span></div>
            <div><strong>${formatEuros(metrics.pendingPaymentAmount)}</strong><span>Backlog pagos</span></div>
            <div><strong>${formatHours(metrics.timing.avgTeacherResponseHours)}</strong><span>Respuesta profes.</span></div>
          </div>
        </div>
      </section>
    </div>

    <div class="control-grid-main">
      <section class="card control-card">
        <div class="card-header">
          <span class="card-title">Actividad reciente</span>
          ${renderBadge('Tiempo real', 'success')}
        </div>
        <div class="card-body control-timeline">
          ${renderTimeline(metrics.activity)}
        </div>
      </section>

      <section class="card control-card">
        <div class="card-header">
          <span class="card-title">Moderacion y auditorias</span>
          ${renderBadge(`${metrics.moderation.length} pendientes`, metrics.moderation.length ? 'warning' : 'success')}
        </div>
        <div class="card-body control-stack">
          ${renderModeration(metrics.moderation)}
          <div class="control-audit-box">
            <div class="control-audit-title">Usuarios inactivos</div>
            ${renderInactiveUsers(metrics)}
          </div>
          <div class="control-audit-box">
            <div class="control-audit-title">Calidad de datos</div>
            ${renderDataQuality(metrics.dataQuality)}
          </div>
        </div>
      </section>
    </div>
  </div>`;
}

function renderLoading(container) {
  container.innerHTML = `<div class="control-center">
    <div class="control-hero">
      <div>
        <div class="skeleton skeleton-text" style="width:130px"></div>
        <div class="skeleton skeleton-title" style="width:260px"></div>
        <div class="skeleton skeleton-text" style="width:340px;max-width:100%"></div>
      </div>
    </div>
    <div class="stats-grid control-kpi-grid">
      ${Array.from({ length: 6 }, () => '<div class="stat-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div>').join('')}
    </div>
  </div>`;
}

function setSidebarBadge(id, value) {
  const badge = document.getElementById(id);
  if (!badge) return;
  badge.textContent = value > 99 ? '99+' : String(value || '');
  badge.style.display = value > 0 ? '' : 'none';
}

function updateSidebarBadges(metrics) {
  setSidebarBadge('badge-solicitudes', metrics.requestsOpen.length);
  setSidebarBadge('badge-pagos', metrics.pendingPayments.length + metrics.overduePayments.length);
  setSidebarBadge('badge-incidencias', metrics.openIncidents.length);
  setSidebarBadge('badge-leads', metrics.newLeads.length);
}

function bindEvents(state) {
  state.container.addEventListener('click', (event) => {
    const refresh = event.target.closest('[data-control-refresh]');
    if (refresh) {
      state.refresh(true);
      return;
    }
    const nav = event.target.closest('[data-control-nav]');
    if (nav) {
      state.navigate(nav.dataset.controlNav);
    }
  });
}

function subscribeLive(state) {
  if (state.subscribed) return;
  state.subscribed = true;
  state.unsubscribes = LIVE_COLLECTIONS.map((name) => {
    try {
      return onSnapshot(collection(firebaseDb, name), () => {
        state.live = true;
        window.clearTimeout(state.refreshTimeout);
        state.refreshTimeout = window.setTimeout(() => state.refresh(false), 900);
      }, () => {});
    } catch (_) {
      return null;
    }
  }).filter(Boolean);
}

export async function initAdminControlCenter({
  container,
  db,
  leadsAdapter,
  navigate = () => {},
  showToast = () => {},
}) {
  if (!container || !db) return null;

  let state = instances.get(container);
  if (!state) {
    state = {
      container,
      db,
      leadsAdapter,
      navigate,
      showToast,
      live: false,
      loading: false,
      subscribed: false,
      refreshTimeout: null,
      refresh: null,
    };
    state.refresh = async (manual = false) => {
      if (state.loading) return;
      state.loading = true;
      if (manual) renderLoading(container);
      try {
        const data = await loadData(db, leadsAdapter);
        const metrics = computeControlCenter(data);
        updateSidebarBadges(metrics);
        renderControlCenter(container, metrics, state);
      } catch (error) {
        console.error('No se pudo cargar el centro de control', error);
        container.innerHTML = `<div class="alert alert-danger">
          <span class="alert-icon">!</span>
          <div class="alert-body">
            <div class="alert-title">Centro de control no disponible</div>
            ${escapeHtml(error.message || 'No se pudieron cargar metricas operativas.')}
          </div>
        </div>`;
        showToast('Centro de control no disponible', error.message || 'No se pudieron cargar metricas.', 'error');
      } finally {
        state.loading = false;
      }
    };
    renderLoading(container);
    bindEvents(state);
    subscribeLive(state);
    window.setInterval(() => state.refresh(false), 60000);
    instances.set(container, state);
  } else {
    state.navigate = navigate;
    state.showToast = showToast;
  }

  await state.refresh(false);
  return state;
}

export default initAdminControlCenter;
