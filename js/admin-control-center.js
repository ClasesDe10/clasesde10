/**
 * ClasesDe10 - admin control center.
 *
 * Builds a high-signal operating cockpit from the Firebase compatibility data
 * client. The existing sections remain the source of detailed CRUD workflows.
 */

import {
  addDoc,
  collection,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { firebaseDb } from './firebase-client.js?v=20260627-domain-auth';
import {
  buildRelationshipsFromCollections,
  summarizeRelationships,
} from './relationship-engine.js?v=20260629-relations';
import { renderRelationshipDigest } from './relationship-ui.js?v=20260629-relations';

const instances = new WeakMap();
const CONTROL_CENTER_REFRESH_MS = 60 * 1000;
const LIVE_SIGNAL_COLLECTIONS = [
  { name: 'metricSnapshots', orderField: 'createdAt', limit: 8 },
  { name: 'opsAlerts', orderField: 'createdAt', limit: 20 },
  { name: 'platformHealthChecks', orderField: 'createdAt', limit: 12 },
  { name: 'systemJobs', orderField: 'updatedAt', limit: 20 },
  { name: 'automationEvents', orderField: 'createdAt', limit: 20 },
  { name: 'incidencias', orderField: 'updatedAt', limit: 20 },
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
  item = item || {};
  return first(item.fecha, item.date, item.created_at, item.createdAt);
}

function createdDate(item = {}) {
  item = item || {};
  return first(item.created_at, item.createdAt, item.fecha, item.date, item.updated_at, item.updatedAt);
}

function updatedDate(item = {}) {
  item = item || {};
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

async function safeRead(label, task, fallback = [], errors = null) {
  try {
    const result = await task();
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.data)) return result.data;
    if (result?.data && typeof result.data === 'object') return [result.data];
    return fallback;
  } catch (error) {
    console.warn(`Control center could not load ${label}`, error);
    if (Array.isArray(errors)) {
      errors.push({
        label,
        message: clean(error?.message || error, 500),
        code: clean(error?.code || error?.name, 120),
        at: new Date().toISOString(),
      });
    }
    return fallback;
  }
}

async function loadRows(db, table) {
  const result = await db.from(table).select('*');
  if (result.error) throw result.error;
  return result.data || [];
}

async function loadData(db, leadsAdapter) {
  const loadErrors = [];
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
    chats,
    lifecycleEvents,
    platformConfig,
    platformConfigHistory,
    automationEvents,
    automationRules,
    automationRuleRuns,
    publicLeads,
    auditLogs,
    adminAiQueries,
    systemJobs,
    deadLetters,
    metricSnapshots,
    opsAlerts,
    healthChecks,
  ] = await Promise.all([
    safeRead('users', () => loadRows(db, 'usuarios'), [], loadErrors),
    safeRead('teachers', () => loadRows(db, 'profesores'), [], loadErrors),
    safeRead('families', () => loadRows(db, 'familias'), [], loadErrors),
    safeRead('students', () => loadRows(db, 'alumnos'), [], loadErrors),
    safeRead('classes', () => loadRows(db, 'v_clases_completas'), [], loadErrors),
    safeRead('requests', () => loadRows(db, 'solicitudes'), [], loadErrors),
    safeRead('payments', () => loadRows(db, 'pagos'), [], loadErrors),
    safeRead('documents', () => loadRows(db, 'documentos'), [], loadErrors),
    safeRead('incidents', () => loadRows(db, 'incidencias'), [], loadErrors),
    safeRead('notifications', () => loadRows(db, 'notificaciones'), [], loadErrors),
    safeRead('notificationTokens', () => loadRows(db, 'notificationTokens'), [], loadErrors),
    safeRead('assignments', () => loadRows(db, 'asignaciones'), [], loadErrors),
    safeRead('matchingRuns', () => loadRows(db, 'matchingRuns'), [], loadErrors),
    safeRead('requestMatches', () => loadRows(db, 'solicitudMatches'), [], loadErrors),
    safeRead('chats', () => loadRows(db, 'chats'), [], loadErrors),
    safeRead('lifecycleEvents', () => loadRows(db, 'classLifecycleEvents'), [], loadErrors),
    safeRead('platformConfig', () => loadRows(db, 'configuracion'), [], loadErrors),
    safeRead('platformConfigHistory', () => loadRows(db, 'platformConfigHistory'), [], loadErrors),
    safeRead('automationEvents', () => loadRows(db, 'automationEvents'), [], loadErrors),
    safeRead('automationRules', () => loadRows(db, 'automationRules'), [], loadErrors),
    safeRead('automationRuleRuns', () => loadRows(db, 'automationRuleRuns'), [], loadErrors),
    safeRead('publicLeads', async () => {
      const result = leadsAdapter?.listPublic
        ? await leadsAdapter.listPublic({ max: 300 })
        : await loadRows(db, 'leadsPublicos');
      if (result.error) throw result.error;
      return result.data || [];
    }, [], loadErrors),
    safeRead('auditLogs', () => loadRows(db, 'auditLogs'), [], loadErrors),
    safeRead('adminAiQueries', () => loadRows(db, 'adminAiQueries'), [], loadErrors),
    safeRead('systemJobs', () => loadRows(db, 'systemJobs'), [], loadErrors),
    safeRead('deadLetters', () => loadRows(db, 'deadLetters'), [], loadErrors),
    safeRead('metricSnapshots', () => loadRows(db, 'metricSnapshots'), [], loadErrors),
    safeRead('opsAlerts', () => loadRows(db, 'opsAlerts'), [], loadErrors),
    safeRead('platformHealthChecks', () => loadRows(db, 'platformHealthChecks'), [], loadErrors),
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
    chats,
    lifecycleEvents,
    platformConfig,
    platformConfigHistory,
    automationEvents,
    automationRules,
    automationRuleRuns,
    publicLeads,
    auditLogs,
    adminAiQueries,
    systemJobs,
    deadLetters,
    metricSnapshots,
    opsAlerts,
    healthChecks,
    loadErrors,
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

const MISSION_STATUS_WEIGHT = {
  operational: 100,
  attention: 75,
  degraded: 45,
  outage: 10,
};

function hoursAgo(value) {
  const date = normalizeDate(value);
  if (!date) return Infinity;
  return (Date.now() - date.getTime()) / (60 * 60 * 1000);
}

function latestItem(items = [], getter = createdDate) {
  return [...items]
    .filter((item) => normalizeDate(getter(item)))
    .sort((a, b) => normalizeDate(getter(b)).getTime() - normalizeDate(getter(a)).getTime())[0] || null;
}

function oldestDate(items = [], getter = createdDate) {
  const dates = items.map((item) => normalizeDate(getter(item))).filter(Boolean).sort((a, b) => a - b);
  return dates[0] ? dates[0].toISOString() : '';
}

function recentItems(items = [], hours = 24, getter = createdDate) {
  return items.filter((item) => hoursAgo(getter(item)) <= hours);
}

function missionTone(status) {
  if (status === 'outage') return 'danger';
  if (status === 'degraded') return 'danger';
  if (status === 'attention') return 'warning';
  return 'success';
}

function missionLabel(status) {
  if (status === 'outage') return 'Caido';
  if (status === 'degraded') return 'Degradado';
  if (status === 'attention') return 'Atencion';
  return 'Operativo';
}

function worstMissionStatus(statuses = []) {
  if (statuses.includes('outage')) return 'outage';
  if (statuses.includes('degraded')) return 'degraded';
  if (statuses.includes('attention')) return 'attention';
  return 'operational';
}

function missionScore(subsystems = []) {
  if (!subsystems.length) return 100;
  return Math.round(average(subsystems.map((item) => MISSION_STATUS_WEIGHT[item.status] ?? 60)));
}

function affectedUniqueUsers(items = [], fields = []) {
  const ids = new Set();
  items.forEach((item) => fields.forEach((field) => {
    const value = field.split('.').reduce((acc, key) => acc?.[key], item);
    if (value) ids.add(String(value));
  }));
  return ids.size;
}

function issue({
  status = 'attention',
  what,
  impact,
  cause,
  fix,
  affectedUsers = 0,
  startedAt = '',
  signals = [],
  section = 'incidencias',
} = {}) {
  return {
    status,
    what: clean(what, 220),
    impact: clean(impact, 260),
    cause: clean(cause, 260),
    fix: clean(fix, 260),
    affectedUsers: Math.max(0, Number(affectedUsers) || 0),
    startedAt: startedAt || '',
    signals: signals.filter(Boolean).map((item) => clean(item, 120)).slice(0, 4),
    section,
  };
}

function subsystem({ id, name, description, section = 'incidencias', issues = [], okSignals = [] }) {
  const status = worstMissionStatus(issues.map((item) => item.status));
  const primary = issues[0] || issue({
    status: 'operational',
    what: 'Sin incidencias detectadas',
    impact: 'Sin impacto operativo observado.',
    cause: 'Las senales monitorizadas estan dentro de rango.',
    fix: 'Mantener monitorizacion.',
    section,
  });
  return {
    id,
    name,
    description,
    section,
    status,
    score: MISSION_STATUS_WEIGHT[status] ?? 60,
    what: primary.what,
    startedAt: primary.startedAt,
    impact: primary.impact,
    affectedUsers: Math.max(...issues.map((item) => item.affectedUsers || 0), 0),
    cause: primary.cause,
    fix: primary.fix,
    signals: issues.length ? primary.signals : okSignals.slice(0, 4),
    issues,
  };
}

function browserRuntimeSignals() {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const win = typeof window !== 'undefined' ? window : {};
  const notificationPermission = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  return {
    online: nav.onLine !== false,
    serviceWorkerSupported: Boolean(nav.serviceWorker),
    serviceWorkerControlled: Boolean(nav.serviceWorker?.controller),
    cachesSupported: Boolean(win.caches),
    notificationPermission,
  };
}

function computeMissionControl(data, metrics) {
  const browser = browserRuntimeSignals();
  const totalUsers = Math.max(1, (data.users || []).length || metrics.teachersActive.length + metrics.familiesActive.length);
  const loadErrors = data.loadErrors || [];
  const coreLoadErrors = loadErrors.filter((item) => /users|teachers|families|students|classes|requests|payments/i.test(item.label));
  const recentSevereAudits = recentItems(data.auditLogs || [], 24)
    .filter((item) => ['critical', 'error', 'high'].includes(clean(item.severity).toLowerCase()));
  const authFailures = recentItems(data.auditLogs || [], 24)
    .filter((item) => /auth\..*(failed|blocked|error)/i.test(clean(item.action)));
  const authSuccesses = recentItems(data.auditLogs || [], 24)
    .filter((item) => /auth\..*success/i.test(clean(item.action)));
  const failedJobs = (data.systemJobs || []).filter((item) => ['dead_letter', 'failed_permanently'].includes(statusOf(item)));
  const deadLetters = data.deadLetters || [];
  const queuedJobs = (data.systemJobs || []).filter((item) => statusOf(item) === 'queued');
  const staleQueuedJobs = queuedJobs.filter((item) => hoursAgo(first(item.runAt, item.createdAt, item.created_at)) > 1);
  const stuckProcessingJobs = (data.systemJobs || []).filter((item) => statusOf(item) === 'processing' && hoursAgo(first(item.startedAt, item.updatedAt, item.updated_at)) > 0.5);
  const openOpsAlerts = (data.opsAlerts || []).filter((item) => ['open', 'abierta', 'active'].includes(statusOf(item)));
  const latestMetricSnapshot = latestItem(data.metricSnapshots || []);
  const latestHealthSnapshot = latestItem(data.healthChecks || []);
  const latestAutomation = latestItem(data.automationEvents || []);
  const apiErrors = recentItems(data.automationEvents || [], 48)
    .filter((item) => /(api|stripe|firebase|storage|openai|gemini|supabase|webhook|http|unauthorized|permission|quota|timeout|failed|error)/i.test(clean([item.type, item.status, item.error, item.message, item.source].join(' '))));
  const notificationFailures = apiErrors.filter((item) => /notification|push|fcm|token/i.test(clean([item.type, item.message, item.error].join(' '))));
  const matchingErrors = recentItems([...(data.matchingRuns || []), ...(data.automationEvents || [])], 48)
    .filter((item) => /matching|match/i.test(clean([item.type, item.status, item.error, item.message].join(' '))) && /(error|failed|empty|sin_profesor|no_match)/i.test(clean([item.status, item.error, item.message, item.result].join(' '))));
  const aiErrors = recentItems([...(data.auditLogs || []), ...(data.adminAiQueries || []), ...(data.automationEvents || [])], 48)
    .filter((item) => /ai|ia|admin_ai|rerank|semantic/i.test(clean([item.action, item.type, item.intent, item.source, item.error, item.message].join(' '))) && /(error|failed|timeout|quota|critical)/i.test(clean([item.severity, item.status, item.error, item.message].join(' '))));
  const paymentReview = (data.payments || []).filter((item) => ['needs_review', 'revision', 'en_revision'].includes(clean(first(item.reconciliationStatus, item.estado_conciliacion)).toLowerCase()));
  const activeAssignments = (data.assignments || []).filter(isActive);
  const chatIds = new Set((data.chats || []).map((item) => clean(first(item.assignmentId, item.asignacion_id, item.id), 180)).filter(Boolean));
  const assignmentsWithoutChat = activeAssignments.filter((item) => {
    const id = clean(first(item.id, item.assignmentId, item.asignacion_id), 180);
    return id && !chatIds.has(id);
  });
  const chatErrors = recentItems(data.auditLogs || [], 48)
    .filter((item) => /chat|message|mensaje|messaging/i.test(clean([item.module, item.action, item.entityType].join(' '))) && ['critical', 'error', 'high'].includes(clean(item.severity).toLowerCase()));
  const documentErrors = recentItems([...(data.auditLogs || []), ...(data.automationEvents || [])], 48)
    .filter((item) => /storage|document|documento|upload|bucket/i.test(clean([item.module, item.action, item.type, item.error, item.message].join(' '))) && /(error|failed|bucket|permission|unauthorized|critical)/i.test(clean([item.severity, item.status, item.error, item.message].join(' '))));
  const classesAtRisk = [...metrics.classesWithoutConfirmation, ...metrics.lifecycleBlocked];
  const noRecentSnapshot = !latestMetricSnapshot || hoursAgo(createdDate(latestMetricSnapshot)) > 12;
  const noRecentAutomation = !latestAutomation || hoursAgo(createdDate(latestAutomation)) > 12;

  const systems = [
    subsystem({
      id: 'firebase',
      name: 'Firebase',
      description: 'SDK, Firestore y permisos de lectura del panel.',
      section: 'auditoria',
      issues: [
        ...(loadErrors.length ? [issue({
          status: coreLoadErrors.length ? 'degraded' : 'attention',
          what: `${loadErrors.length} lectura(s) Firebase fallaron`,
          impact: coreLoadErrors.length ? 'El admin puede ver datos incompletos.' : 'Algunos modulos secundarios pueden aparecer incompletos.',
          affectedUsers: coreLoadErrors.length ? totalUsers : 0,
          cause: loadErrors.map((item) => item.label).slice(0, 3).join(', '),
          fix: 'Revisar reglas Firestore, nombres de colecciones e indices requeridos.',
          startedAt: oldestDate(loadErrors, (item) => item.at),
          signals: loadErrors.map((item) => `${item.label}: ${item.code || item.message}`),
          section: 'auditoria',
        })] : []),
        ...(recentSevereAudits.length ? [issue({
          status: 'attention',
          what: `${recentSevereAudits.length} evento(s) severos en auditoria`,
          impact: 'Puede haber operaciones recientes con errores o intervenciones criticas.',
          affectedUsers: affectedUniqueUsers(recentSevereAudits, ['actorUid', 'entityId']),
          cause: 'Audit logs con severidad high/error/critical en las ultimas 24h.',
          fix: 'Abrir Auditoria y filtrar por severidad para revisar el contexto exacto.',
          startedAt: oldestDate(recentSevereAudits),
          signals: recentSevereAudits.map((item) => item.action),
          section: 'auditoria',
        })] : []),
      ],
      okSignals: ['Firestore responde', 'Reglas permiten lectura admin', `${data.auditLogs?.length || 0} eventos auditados`],
    }),
    subsystem({
      id: 'database',
      name: 'Base de datos',
      description: 'Colecciones criticas, snapshots y consistencia de lectura.',
      section: 'auditoria',
      issues: [
        ...(coreLoadErrors.length ? [issue({
          status: 'degraded',
          what: 'Colecciones criticas incompletas',
          impact: 'Metricas, CRM y operaciones pueden calcularse con datos parciales.',
          affectedUsers: totalUsers,
          cause: coreLoadErrors.map((item) => item.label).join(', '),
          fix: 'Validar reglas, aliases y permisos de las colecciones criticas.',
          startedAt: oldestDate(coreLoadErrors, (item) => item.at),
          signals: coreLoadErrors.map((item) => item.message),
          section: 'auditoria',
        })] : []),
        ...(noRecentSnapshot ? [issue({
          status: latestMetricSnapshot ? 'attention' : 'degraded',
          what: latestMetricSnapshot ? 'Snapshot de metricas antiguo' : 'Sin snapshots de metricas',
          impact: 'La vision historica y las alertas programadas pierden precision.',
          affectedUsers: 0,
          cause: latestMetricSnapshot ? `Ultimo snapshot hace ${formatHours(hoursAgo(createdDate(latestMetricSnapshot)))}` : 'No hay documentos metricSnapshots.',
          fix: 'Ejecutar el worker programado o activar Functions cuando Blaze este disponible.',
          startedAt: createdDate(latestMetricSnapshot),
          signals: ['metricSnapshots'],
          section: 'auditoria',
        })] : []),
      ],
      okSignals: [`${data.metricSnapshots?.length || 0} snapshots`, `${data.opsAlerts?.length || 0} alertas ops`, `${data.systemJobs?.length || 0} jobs`],
    }),
    subsystem({
      id: 'auth',
      name: 'Autenticacion',
      description: 'Accesos, bloqueos, perfiles y continuidad de sesion.',
      section: 'auditoria',
      issues: [
        ...(authFailures.length >= 5 ? [issue({
          status: authFailures.length >= 15 ? 'degraded' : 'attention',
          what: `${authFailures.length} fallos/bloqueos de auth en 24h`,
          impact: 'Usuarios reales podrian estar sin acceso o con perfil incompatible.',
          affectedUsers: affectedUniqueUsers(authFailures, ['actorUid', 'entityId']),
          cause: 'Eventos auth.failed/auth.blocked en auditoria.',
          fix: 'Filtrar Auditoria por modulo Auth y revisar usuario, dominio y perfil Firestore.',
          startedAt: oldestDate(authFailures),
          signals: authFailures.map((item) => item.action),
          section: 'auditoria',
        })] : []),
      ],
      okSignals: [`${authSuccesses.length} accesos correctos 24h`, 'Email/Password activo', 'Google Auth preparado en cliente'],
    }),
    subsystem({
      id: 'functions',
      name: 'Cloud Functions',
      description: 'Triggers, scheduler, webhooks y cola de jobs.',
      section: 'auditoria',
      issues: [
        ...((failedJobs.length || deadLetters.length) ? [issue({
          status: 'outage',
          what: `${failedJobs.length + deadLetters.length} job(s) en dead letter`,
          impact: 'Procesos automaticos pueden haber quedado sin ejecutar.',
          affectedUsers: totalUsers,
          cause: 'Jobs agotaron reintentos o fallaron de forma permanente.',
          fix: 'Abrir deadLetters/systemJobs, corregir causa y reencolar el job afectado.',
          startedAt: oldestDate([...failedJobs, ...deadLetters]),
          signals: [...failedJobs, ...deadLetters].map((item) => first(item.type, item.id)),
          section: 'auditoria',
        })] : []),
        ...((staleQueuedJobs.length || stuckProcessingJobs.length) ? [issue({
          status: 'degraded',
          what: `${staleQueuedJobs.length + stuckProcessingJobs.length} job(s) atascados`,
          impact: 'Notificaciones, matching o pagos pueden retrasarse.',
          affectedUsers: affectedUniqueUsers([...staleQueuedJobs, ...stuckProcessingJobs], ['payload.userUid', 'payload.familyUid', 'payload.teacherUid']),
          cause: 'Cola systemJobs con runAt vencido o lease de procesamiento antiguo.',
          fix: 'Ejecutar worker, revisar logs y liberar/reintentar jobs atascados.',
          startedAt: oldestDate([...staleQueuedJobs, ...stuckProcessingJobs], (item) => first(item.runAt, item.startedAt, item.createdAt)),
          signals: [...staleQueuedJobs, ...stuckProcessingJobs].map((item) => first(item.type, item.id)),
          section: 'auditoria',
        })] : []),
        ...(noRecentAutomation ? [issue({
          status: 'attention',
          what: 'Sin actividad automatica reciente',
          impact: 'Recordatorios, snapshots y tareas programadas podrian no estar corriendo.',
          affectedUsers: 0,
          cause: latestAutomation ? 'Ultimo automationEvent demasiado antiguo.' : 'No hay automationEvents registrados.',
          fix: 'Verificar GitHub Actions worker y desplegar Functions cuando Blaze este disponible.',
          startedAt: createdDate(latestAutomation),
          signals: ['automationEvents', 'scheduled worker'],
          section: 'auditoria',
        })] : []),
      ],
      okSignals: [`${queuedJobs.length} jobs en cola`, `${data.automationEvents?.length || 0} eventos`, `${openOpsAlerts.length} alertas abiertas`],
    }),
    subsystem({
      id: 'apis',
      name: 'APIs externas',
      description: 'Stripe/Bizum, Firebase APIs, webhooks y servicios auxiliares.',
      section: 'incidencias',
      issues: apiErrors.length ? [issue({
        status: apiErrors.length > 3 ? 'degraded' : 'attention',
        what: `${apiErrors.length} error(es) de API en 48h`,
        impact: 'Integraciones externas pueden responder lento, fallar o requerir reintento.',
        affectedUsers: affectedUniqueUsers(apiErrors, ['userUid', 'actorUid', 'entityId']),
        cause: 'automationEvents/auditLogs contienen errores de API, timeout, permisos o cuota.',
        fix: 'Revisar origen, credenciales, cuotas y reintentos de la integracion afectada.',
        startedAt: oldestDate(apiErrors),
        signals: apiErrors.map((item) => first(item.type, item.action, item.source)),
        section: 'incidencias',
      })] : [],
      okSignals: ['Sin errores de API recientes', 'Webhooks aislados por cola', 'Auditoria activa'],
    }),
    subsystem({
      id: 'notifications',
      name: 'Notificaciones',
      description: 'Push, notificaciones internas y backlog no leido.',
      section: 'notificaciones',
      issues: [
        ...(notificationFailures.length ? [issue({
          status: 'degraded',
          what: `${notificationFailures.length} fallo(s) de notificacion`,
          impact: 'Usuarios pueden no enterarse de clases, pagos o mensajes.',
          affectedUsers: affectedUniqueUsers(notificationFailures, ['userUid', 'payload.userUid', 'actorUid']),
          cause: 'Errores push/FCM/token en automationEvents.',
          fix: 'Limpiar tokens invalidos y revisar permisos push del dispositivo.',
          startedAt: oldestDate(notificationFailures),
          signals: notificationFailures.map((item) => first(item.type, item.message)),
          section: 'notificaciones',
        })] : []),
        ...(data.tokens.length === 0 && totalUsers > 1 ? [issue({
          status: 'attention',
          what: 'No hay dispositivos push activos',
          impact: 'Los avisos dependen solo del centro interno de notificaciones.',
          affectedUsers: totalUsers,
          cause: 'notificationTokens no tiene tokens activos.',
          fix: 'Pedir permiso push desde PWA y validar VAPID/configuracion.',
          signals: ['notificationTokens'],
          section: 'notificaciones',
        })] : []),
      ],
      okSignals: [`${data.tokens.length} dispositivo(s) push`, `${data.notifications.length} notificaciones`, `${metrics.pushDevices.length} activas`],
    }),
    subsystem({
      id: 'ai',
      name: 'IA',
      description: 'Asistente admin, scoring, recomendaciones y reranking.',
      section: 'ia',
      issues: aiErrors.length ? [issue({
        status: aiErrors.length > 2 ? 'degraded' : 'attention',
        what: `${aiErrors.length} incidencia(s) IA en 48h`,
        impact: 'Respuestas o recomendaciones pueden degradarse a modo estructurado.',
        affectedUsers: affectedUniqueUsers(aiErrors, ['actorUid', 'entityId']),
        cause: 'Errores de IA, timeout, cuota o reranking detectados en logs.',
        fix: 'Usar modo estructurado gratuito, revisar prompts/coste y reintentar procesos fallidos.',
        startedAt: oldestDate(aiErrors),
        signals: aiErrors.map((item) => first(item.action, item.type, item.intent)),
        section: 'ia',
      })] : [],
      okSignals: [`${data.adminAiQueries?.length || 0} consultas admin registradas`, 'Modo estructurado disponible', 'Matching deterministic fallback activo'],
    }),
    subsystem({
      id: 'matching',
      name: 'Matching',
      description: 'Asignacion profesor-familia y calidad de candidatos.',
      section: 'solicitudes',
      issues: [
        ...(metrics.staleUnassigned.length ? [issue({
          status: metrics.staleUnassigned.length > 3 ? 'degraded' : 'attention',
          what: `${metrics.staleUnassigned.length} solicitud(es) sin profesor >24h`,
          impact: 'Familias esperan respuesta y baja la conversion.',
          affectedUsers: affectedUniqueUsers(metrics.staleUnassigned, ['familyUid', 'familia_id', 'userUid']),
          cause: 'Falta oferta compatible, disponibilidad incompleta o matching no ejecutado.',
          fix: 'Abrir Solicitudes, revisar matches y asignar/reentrenar criterios.',
          startedAt: oldestDate(metrics.staleUnassigned),
          signals: metrics.staleUnassigned.map(requestSubject),
          section: 'solicitudes',
        })] : []),
        ...(matchingErrors.length ? [issue({
          status: 'degraded',
          what: `${matchingErrors.length} error(es) de matching`,
          impact: 'Las sugerencias pueden no estar generandose para nuevas solicitudes.',
          affectedUsers: affectedUniqueUsers(matchingErrors, ['requestId', 'entityId', 'payload.requestId']),
          cause: 'matchingRuns o automationEvents reportan fallo/sin candidato.',
          fix: 'Revisar criterios, disponibilidad de profesores y jobs matching.request.',
          startedAt: oldestDate(matchingErrors),
          signals: matchingErrors.map((item) => first(item.type, item.status, item.id)),
          section: 'solicitudes',
        })] : []),
      ],
      okSignals: [`${data.requestMatches.length} matches`, `${data.matchingRuns.length} ejecuciones`, `${metrics.teachersVerified.length} profesores verificados`],
    }),
    subsystem({
      id: 'calendar',
      name: 'Calendario',
      description: 'Clases, confirmaciones, estados y recordatorios.',
      section: 'clases',
      issues: classesAtRisk.length ? [issue({
        status: classesAtRisk.length > 5 ? 'degraded' : 'attention',
        what: `${classesAtRisk.length} clase(s) requieren cierre`,
        impact: 'Puede retrasar pagos, valoraciones y comisiones.',
        affectedUsers: affectedUniqueUsers(classesAtRisk, ['teacherUid', 'profesor_id', 'familyUid', 'familia_id', 'studentId']),
        cause: 'Clases pasadas siguen programadas o lifecycle bloqueado.',
        fix: 'Abrir Clases y forzar confirmacion/asistencia/pago segun estado.',
        startedAt: oldestDate(classesAtRisk, classDate),
        signals: classesAtRisk.map((item) => first(item.status, item.to, item.id)),
        section: 'clases',
      })] : [],
      okSignals: [`${metrics.scheduledFuture.length} futuras`, `${metrics.completedMonth.length} completadas este mes`, `${formatPercent(metrics.completionRateMonth)} finalizacion`],
    }),
    subsystem({
      id: 'payments',
      name: 'Pagos',
      description: 'Cobros familia, pagos profesor y conciliacion.',
      section: 'pagos',
      issues: [
        ...(metrics.overduePayments.length ? [issue({
          status: metrics.overduePayments.length > 3 ? 'degraded' : 'attention',
          what: `${metrics.overduePayments.length} pago(s) vencidos`,
          impact: `${formatEuros(metrics.overduePaymentAmount)} pueden afectar caja y confianza.`,
          affectedUsers: affectedUniqueUsers(metrics.overduePayments, ['familyUid', 'familia_id', 'teacherUid', 'profesor_id', 'userUid']),
          cause: 'Pagos con estado vencido o fecha dueAt pasada.',
          fix: 'Enviar recordatorio, validar Bizum/Stripe y actualizar estado de clase.',
          startedAt: oldestDate(metrics.overduePayments, (item) => first(item.dueAt, item.due_at, item.createdAt)),
          signals: metrics.overduePayments.map((item) => `${formatEuros(first(item.monto, item.amount))} ${paymentStatus(item)}`),
          section: 'pagos',
        })] : []),
        ...(paymentReview.length ? [issue({
          status: 'attention',
          what: `${paymentReview.length} pago(s) necesitan conciliacion`,
          impact: 'La clase puede no cerrarse automaticamente como pagada.',
          affectedUsers: affectedUniqueUsers(paymentReview, ['familyUid', 'teacherUid', 'userUid']),
          cause: 'Estado reconciliationStatus necesita revision.',
          fix: 'Comparar justificante/referencia y marcar validado o rechazado.',
          startedAt: oldestDate(paymentReview),
          signals: paymentReview.map((item) => first(item.reference, item.referencia, item.id)),
          section: 'pagos',
        })] : []),
      ],
      okSignals: [`${formatEuros(metrics.pendingPaymentAmount)} pendiente`, `${formatPercent(metrics.classPaymentCoverage)} clases cobradas`, `${formatPercent(metrics.teacherPayoutCoverage)} profesores pagados`],
    }),
    subsystem({
      id: 'chat',
      name: 'Chat',
      description: 'Conversaciones por asignacion y avisos de mensajes.',
      section: 'chats',
      issues: [
        ...(assignmentsWithoutChat.length ? [issue({
          status: assignmentsWithoutChat.length > 3 ? 'degraded' : 'attention',
          what: `${assignmentsWithoutChat.length} asignacion(es) sin chat`,
          impact: 'Familias/profesores pueden no tener canal directo.',
          affectedUsers: affectedUniqueUsers(assignmentsWithoutChat, ['familyUid', 'familia_id', 'teacherUid', 'profesor_id']),
          cause: 'No existe documento chats para asignaciones activas.',
          fix: 'Abrir Chats o reasignar para crear el canal; revisar ensureChatForAssignment.',
          startedAt: oldestDate(assignmentsWithoutChat),
          signals: assignmentsWithoutChat.map((item) => first(item.id, item.assignmentId)),
          section: 'chats',
        })] : []),
        ...(chatErrors.length ? [issue({
          status: 'degraded',
          what: `${chatErrors.length} error(es) de mensajeria`,
          impact: 'Mensajes o notificaciones de chat pueden fallar.',
          affectedUsers: affectedUniqueUsers(chatErrors, ['actorUid', 'entityId']),
          cause: 'Audit logs de modulo messaging/chat con severidad alta.',
          fix: 'Revisar permisos de chats/mensajes y el evento concreto en Auditoria.',
          startedAt: oldestDate(chatErrors),
          signals: chatErrors.map((item) => item.action),
          section: 'chats',
        })] : []),
      ],
      okSignals: [`${data.chats.length} chats`, `${activeAssignments.length} asignaciones activas`, 'Admin incluido como supervisor'],
    }),
    subsystem({
      id: 'storage',
      name: 'Almacenamiento',
      description: 'Documentos, fotos, verificaciones y bucket Firebase Storage.',
      section: 'documentos',
      issues: [
        ...(documentErrors.length ? [issue({
          status: 'degraded',
          what: `${documentErrors.length} fallo(s) de almacenamiento`,
          impact: 'Subidas de documentos/fotos pueden fallar.',
          affectedUsers: affectedUniqueUsers(documentErrors, ['actorUid', 'ownerUid', 'entityId']),
          cause: 'Errores storage/bucket/upload detectados en logs.',
          fix: 'Verificar bucket Firebase Storage, reglas y permisos de subida.',
          startedAt: oldestDate(documentErrors),
          signals: documentErrors.map((item) => first(item.action, item.type, item.error?.message)),
          section: 'documentos',
        })] : []),
        ...(metrics.pendingDocs.length > 10 ? [issue({
          status: 'attention',
          what: `${metrics.pendingDocs.length} documentos pendientes`,
          impact: 'La verificacion de profesores puede retrasarse.',
          affectedUsers: affectedUniqueUsers(metrics.pendingDocs, ['ownerUid', 'userUid', 'teacherUid']),
          cause: 'Backlog de revision documental.',
          fix: 'Priorizar documentos pendientes y cerrar verificaciones.',
          startedAt: oldestDate(metrics.pendingDocs),
          signals: metrics.pendingDocs.map((item) => first(item.tipo, item.nombre, item.id)),
          section: 'documentos',
        })] : []),
      ],
      okSignals: [`${data.documents.length} documentos`, `${metrics.pendingDocs.length} pendientes`, 'Auditoria de cambios activa'],
    }),
    subsystem({
      id: 'pwa',
      name: 'PWA',
      description: 'Service worker, offline, instalacion y permisos del dispositivo.',
      section: 'dashboard',
      issues: [
        ...(!browser.online ? [issue({
          status: 'degraded',
          what: 'Navegador sin conexion',
          impact: 'El admin puede ver datos antiguos o no guardar cambios.',
          affectedUsers: 1,
          cause: 'navigator.onLine=false.',
          fix: 'Recuperar conexion antes de ejecutar acciones criticas.',
          signals: ['offline'],
          section: 'dashboard',
        })] : []),
        ...(!browser.serviceWorkerSupported ? [issue({
          status: 'degraded',
          what: 'Service worker no soportado',
          impact: 'La PWA no tendra cache/offline/push fiable.',
          affectedUsers: 1,
          cause: 'El navegador no expone navigator.serviceWorker.',
          fix: 'Usar Chrome/Safari moderno e instalar la PWA desde HTTPS.',
          signals: ['serviceWorker unsupported'],
          section: 'dashboard',
        })] : []),
        ...(browser.serviceWorkerSupported && !browser.serviceWorkerControlled ? [issue({
          status: 'attention',
          what: 'Service worker aun no controla esta pestana',
          impact: 'Cache/offline se activan tras recargar o reinstalar.',
          affectedUsers: 1,
          cause: 'La version nueva se acaba de publicar o la pestana se abrio antes del SW.',
          fix: 'Recargar la pagina una vez y comprobar instalacion PWA.',
          signals: ['serviceWorker controller=false'],
          section: 'dashboard',
        })] : []),
        ...(browser.notificationPermission === 'denied' ? [issue({
          status: 'attention',
          what: 'Permiso push denegado en este dispositivo',
          impact: 'Este admin no recibira avisos push.',
          affectedUsers: 1,
          cause: 'Notification.permission=denied.',
          fix: 'Activar notificaciones en ajustes del navegador/PWA.',
          signals: ['push denied'],
          section: 'notificaciones',
        })] : []),
      ],
      okSignals: [browser.serviceWorkerSupported ? 'SW soportado' : 'SW no soportado', browser.cachesSupported ? 'Cache API OK' : 'Cache API no disponible', `Push: ${browser.notificationPermission}`],
    }),
    subsystem({
      id: 'backups',
      name: 'Backups',
      description: 'Snapshots operativos y evidencia de recuperacion.',
      section: 'auditoria',
      issues: [
        ...(noRecentSnapshot ? [issue({
          status: latestMetricSnapshot ? 'attention' : 'degraded',
          what: latestMetricSnapshot ? 'Snapshot operativo antiguo' : 'Sin snapshot operativo',
          impact: 'Menos capacidad para reconstruir estado historico reciente.',
          affectedUsers: totalUsers,
          cause: latestMetricSnapshot ? 'metricSnapshots no se actualiza en rango.' : 'No hay metricSnapshots disponibles.',
          fix: 'Ejecutar worker programado y exportar backups periodicos de Firestore.',
          startedAt: createdDate(latestMetricSnapshot),
          signals: ['metricSnapshots', 'platformHealthChecks'],
          section: 'auditoria',
        })] : []),
      ],
      okSignals: [`Ultimo snapshot: ${formatShortDate(createdDate(latestMetricSnapshot)) || '-'}`, `Health checks: ${data.healthChecks?.length || 0}`, `Ultimo health: ${formatShortDate(createdDate(latestHealthSnapshot)) || '-'}`],
    }),
    subsystem({
      id: 'scheduled_tasks',
      name: 'Tareas programadas',
      description: 'Worker, recordatorios, reconciliacion y snapshots.',
      section: 'auditoria',
      issues: [
        ...((staleQueuedJobs.length || stuckProcessingJobs.length) ? [issue({
          status: 'degraded',
          what: 'Backlog de tareas programadas',
          impact: 'Recordatorios y automatizaciones pueden llegar tarde.',
          affectedUsers: affectedUniqueUsers([...staleQueuedJobs, ...stuckProcessingJobs], ['payload.userUid', 'payload.familyUid', 'payload.teacherUid']),
          cause: 'systemJobs con runAt vencido o lease antiguo.',
          fix: 'Ejecutar worker, revisar GitHub Actions y reintentar tareas fallidas.',
          startedAt: oldestDate([...staleQueuedJobs, ...stuckProcessingJobs], (item) => first(item.runAt, item.startedAt, item.createdAt)),
          signals: [...staleQueuedJobs, ...stuckProcessingJobs].map((item) => first(item.type, item.id)),
          section: 'auditoria',
        })] : []),
      ],
      okSignals: [`${queuedJobs.length} en cola`, `${stuckProcessingJobs.length} procesando antiguos`, `${formatShortDate(createdDate(latestAutomation)) || '-'} ultimo evento`],
    }),
    subsystem({
      id: 'automation',
      name: 'Procesos automaticos',
      description: 'Estados, alertas, reintentos, auditoria y autocorreccion.',
      section: 'auditoria',
      issues: [
        ...(metrics.automationErrors.length ? [issue({
          status: metrics.automationErrors.length > 5 ? 'degraded' : 'attention',
          what: `${metrics.automationErrors.length} error(es) de automatizacion`,
          impact: 'Algunas acciones automaticas pueden requerir intervencion admin.',
          affectedUsers: affectedUniqueUsers(metrics.automationErrors, ['actorUid', 'userUid', 'entityId', 'payload.userUid']),
          cause: 'automationEvents recientes contienen fallo/error/missing/unavailable.',
          fix: 'Abrir Auditoria/Incidencias, revisar traceId y reencolar si procede.',
          startedAt: oldestDate(metrics.automationErrors),
          signals: metrics.automationErrors.map((item) => first(item.type, item.status, item.id)),
          section: 'auditoria',
        })] : []),
        ...(openOpsAlerts.length ? [issue({
          status: openOpsAlerts.some((item) => ['critical', 'high'].includes(clean(first(item.level, item.severity)).toLowerCase())) ? 'degraded' : 'attention',
          what: `${openOpsAlerts.length} alerta(s) ops abiertas`,
          impact: 'Hay riesgos detectados por la plataforma que siguen abiertos.',
          affectedUsers: 0,
          cause: 'opsAlerts con status open.',
          fix: 'Resolver la causa y cerrar/actualizar la alerta operativa.',
          startedAt: oldestDate(openOpsAlerts),
          signals: openOpsAlerts.map((item) => first(item.type, item.title, item.id)),
          section: 'auditoria',
        })] : []),
      ],
      okSignals: [`${data.automationEvents.length} eventos`, `${openOpsAlerts.length} alertas abiertas`, 'Auditoria enlazada'],
    }),
  ];

  const score = missionScore(systems);
  const status = worstMissionStatus(systems.map((item) => item.status));
  const issues = systems
    .filter((item) => item.status !== 'operational')
    .sort((a, b) => (MISSION_STATUS_WEIGHT[a.status] || 0) - (MISSION_STATUS_WEIGHT[b.status] || 0));

  return {
    generatedAt: new Date().toISOString(),
    status,
    score,
    systems,
    issues,
    counts: {
      operational: systems.filter((item) => item.status === 'operational').length,
      attention: systems.filter((item) => item.status === 'attention').length,
      degraded: systems.filter((item) => item.status === 'degraded').length,
      outage: systems.filter((item) => item.status === 'outage').length,
    },
  };
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
  const relationships = buildRelationshipsFromCollections({
    requests: data.requests,
    assignments: data.assignments,
    chats: data.chats,
    classes: data.classes,
    payments: data.payments,
    incidents: data.incidents,
    documents: data.documents,
    teachers: data.teachers,
    families: data.families,
    students: data.students,
  }, { nowMs: Date.now() });
  const relationshipSummary = summarizeRelationships(relationships);

  const riskyClasses = data.classes.filter((item) => {
    if (!isCompletedClass(item)) return false;
    if (classTotal(item) <= 0 || teacherAmount(item) <= 0) return true;
    return classTotal(item) > 0 && percentage(platformFee(item), classTotal(item)) < 15;
  });

  const staleUnassigned = requestsUnassigned.filter((item) => daysAgo(createdDate(item)) > 1);
  const classesWithoutConfirmation = data.classes.filter((item) => isScheduledClass(item) && daysAgo(classDate(item)) > 0.05);
  const lifecycleBlocked = (data.lifecycleEvents || []).filter((item) => ['incidencia_abierta', 'pendiente_confirmacion', 'pendiente_pago', 'pago_en_revision'].includes(clean(item.to).toLowerCase()) && daysAgo(createdDate(item)) <= 14);
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
    relationships,
    relationshipSummary,
  };
  const anomalies = detectBusinessAnomalies(baseMetrics);
  const missionControl = computeMissionControl(data, {
    ...baseMetrics,
    anomalies,
  });

  const alerts = [
    ...relationshipSummary.priority.slice(0, 4).map((item) => ({
      tone: item.urgency === 'critical' ? 'danger' : 'warning',
      title: `Expediente: ${item.stageLabel}`,
      body: `${item.title || item.subject || 'Relacion'} - ${item.nextActions?.admin?.[0]?.detail || 'Revisar siguiente paso.'}`,
      section: item.nextActions?.admin?.[0]?.section || 'chat',
    })),
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
    { label: 'Expedientes con bloqueo operativo', value: relationshipSummary.blocked.length, section: 'chat' },
    { label: 'Relaciones sin chat operativo', value: relationshipSummary.withMissingChat.length, section: 'chat' },
    { label: 'Relaciones pendientes de horario', value: relationshipSummary.pendingSchedule.length, section: 'chat' },
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
    missionControl,
    inactiveTeachers: inactive.inactiveTeachers,
    inactiveFamilies: inactive.inactiveFamilies,
    teacherLeaderboard,
    relationships,
    relationshipSummary,
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

function renderMissionIssue(issueItem) {
  return `<article class="mission-incident ${escapeHtml(missionTone(issueItem.status))}">
    <div class="mission-incident-head">
      ${renderBadge(missionLabel(issueItem.status), missionTone(issueItem.status))}
      <span>${escapeHtml(issueItem.startedAt ? `Desde ${formatShortDate(issueItem.startedAt)}` : 'Detectado ahora')}</span>
    </div>
    <strong>${escapeHtml(issueItem.what)}</strong>
    <p>${escapeHtml(issueItem.impact)}</p>
    <div class="mission-incident-grid">
      <div><span>Afectados</span><strong>${escapeHtml(formatNumber(issueItem.affectedUsers || 0))}</strong></div>
      <div><span>Causa probable</span><strong>${escapeHtml(issueItem.cause || '-')}</strong></div>
      <div><span>Solucion</span><strong>${escapeHtml(issueItem.fix || '-')}</strong></div>
    </div>
    ${renderActionButton(issueItem.section, 'Abrir modulo')}
  </article>`;
}

function renderMissionSystem(item) {
  const tone = missionTone(item.status);
  return `<article class="mission-system ${escapeHtml(tone)}">
    <div class="mission-system-top">
      <div>
        <div class="mission-system-name">${escapeHtml(item.name)}</div>
        <div class="mission-system-desc">${escapeHtml(item.description)}</div>
      </div>
      ${renderBadge(missionLabel(item.status), tone)}
    </div>
    <div class="mission-system-what">${escapeHtml(item.what)}</div>
    <div class="mission-system-detail">
      <div>
        <span>Impacto</span>
        <strong>${escapeHtml(item.impact || '-')}</strong>
      </div>
      <div>
        <span>Afectados</span>
        <strong>${escapeHtml(formatNumber(item.affectedUsers || 0))}</strong>
      </div>
      <div>
        <span>Inicio</span>
        <strong>${escapeHtml(item.startedAt ? formatShortDate(item.startedAt) : 'Sin incidencia')}</strong>
      </div>
      <div>
        <span>Causa</span>
        <strong>${escapeHtml(item.cause || '-')}</strong>
      </div>
      <div class="mission-system-fix">
        <span>Como solucionarlo</span>
        <strong>${escapeHtml(item.fix || '-')}</strong>
      </div>
    </div>
    <div class="mission-signals">
      ${(item.signals || []).slice(0, 4).map((signal) => `<span>${escapeHtml(signal)}</span>`).join('')}
    </div>
    ${item.status !== 'operational' ? renderActionButton(item.section, 'Investigar') : ''}
  </article>`;
}

function renderMissionControl(mission) {
  if (!mission) return '';
  const tone = missionTone(mission.status);
  const priorityIssues = mission.issues.slice(0, 3);
  return `<section class="mission-control">
    <div class="mission-hero">
      <div>
        <div class="control-eyebrow">Mission Control</div>
        <h2>Estado tecnico de la plataforma</h2>
        <p>Firebase, base de datos, Auth, automatizaciones, IA, matching, calendario, pagos, chat, storage, PWA, backups y tareas programadas en una sola vista de operacion.</p>
      </div>
      <div class="control-health-score ${escapeHtml(tone)}" style="--score:${mission.score}">
        <strong>${escapeHtml(String(mission.score))}</strong>
        <span>salud sistema</span>
      </div>
      <div class="control-live">
        ${renderBadge(missionLabel(mission.status), tone)}
        <span>Actualizado ${escapeHtml(formatShortDate(mission.generatedAt) || '-')}</span>
        <button class="btn btn-outline btn-sm" type="button" data-control-refresh>Actualizar</button>
      </div>
    </div>

    <div class="mission-kpi-grid">
      ${renderKpi({ label: 'Sistemas operativos', value: mission.counts.operational, tone: 'green', sub: `${mission.systems.length} monitorizados` })}
      ${renderKpi({ label: 'Atencion', value: mission.counts.attention, tone: mission.counts.attention ? 'gold' : 'green', sub: 'requieren seguimiento' })}
      ${renderKpi({ label: 'Degradados', value: mission.counts.degraded, tone: mission.counts.degraded ? 'red' : 'green', sub: 'impacto parcial' })}
      ${renderKpi({ label: 'Caidos', value: mission.counts.outage, tone: mission.counts.outage ? 'red' : 'green', sub: 'impacto critico' })}
    </div>

    <div class="mission-priority-grid">
      <section class="card control-card">
        <div class="card-header">
          <span class="card-title">Incidencias prioritarias</span>
          ${renderBadge(`${mission.issues.length}`, mission.issues.length ? 'warning' : 'success')}
        </div>
        <div class="card-body control-stack">
          ${priorityIssues.length ? priorityIssues.map(renderMissionIssue).join('') : '<div class="empty-state"><div class="empty-title">Sin incidencias tecnicas</div><div class="empty-desc">Los subsistemas monitorizados no muestran sintomas relevantes.</div></div>'}
        </div>
      </section>
      <section class="card control-card">
        <div class="card-header">
          <span class="card-title">Mapa de subsistemas</span>
          ${renderBadge('Tiempo real', 'success')}
        </div>
        <div class="card-body">
          <div class="mission-mini-map">
            ${mission.systems.map((item) => `<button type="button" data-control-nav="${escapeHtml(item.section)}" class="${escapeHtml(missionTone(item.status))}">
              <span>${escapeHtml(item.name)}</span>
              <strong>${escapeHtml(missionLabel(item.status))}</strong>
            </button>`).join('')}
          </div>
        </div>
      </section>
    </div>

    <div class="mission-system-grid">
      ${mission.systems.map(renderMissionSystem).join('')}
    </div>
  </section>`;
}

function renderControlCenter(container, metrics, state) {
  const previousMonth = metrics.monthly.at(-2) || {};
  const currentMonth = metrics.monthly.at(-1) || {};
  const revenueTrend = trendFromPrevious(currentMonth.revenue || 0, previousMonth.revenue || 0);
  const classTrend = trendFromPrevious(currentMonth.classes || 0, previousMonth.classes || 0);
  const healthTone = metrics.healthScore >= 80 ? 'success' : metrics.healthScore >= 60 ? 'warning' : 'danger';

  container.innerHTML = `<div class="control-center">
    ${renderMissionControl(metrics.missionControl)}

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

    ${renderRelationshipDigest(metrics.relationships, 'admin', {
      title: 'Expedientes conectados',
      subtitle: 'Cada relacion agrupa solicitud, matching, chat, calendario, pagos, documentos, reputacion e incidencias.',
      navAttribute: 'data-control-nav',
      max: 7,
    })}

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

async function persistMissionControlSnapshot(state, mission) {
  if (!mission || mission.persisted === true) return;
  const now = Date.now();
  if (state.lastHealthWriteAt && now - state.lastHealthWriteAt < 60 * 1000) return;
  state.lastHealthWriteAt = now;
  await addDoc(collection(firebaseDb, 'platformHealthChecks'), {
    schemaVersion: 'mission_control_v1',
    scope: 'platform',
    source: 'admin_control_center',
    status: mission.status,
    score: mission.score,
    generated_at: mission.generatedAt,
    counts: mission.counts,
    impactedSubsystems: mission.issues.length,
    affectedUsers: mission.issues.reduce((sum, item) => sum + asNumber(item.affectedUsers), 0),
    subsystems: mission.systems.map((item) => ({
      id: item.id,
      name: item.name,
      status: item.status,
      score: item.score,
      what: item.what,
      impact: item.impact,
      affectedUsers: item.affectedUsers,
      cause: item.cause,
      fix: item.fix,
      startedAt: item.startedAt || null,
      section: item.section,
      signals: item.signals || [],
    })),
    actorUid: clean(first(state.actor?.uid, state.actor?.id), 180),
    actorEmail: clean(state.actor?.email, 220),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
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
  const fallbackSubscriptions = new Set();
  state.unsubscribes = LIVE_SIGNAL_COLLECTIONS.map(({ name, orderField, limit }) => {
    try {
      const liveQuery = query(
        collection(firebaseDb, name),
        orderBy(orderField, 'desc'),
        firestoreLimit(limit),
      );
      return onSnapshot(liveQuery, () => {
        state.live = true;
        window.clearTimeout(state.refreshTimeout);
        state.refreshTimeout = window.setTimeout(() => state.refresh(false), 900);
      }, () => {
        if (fallbackSubscriptions.has(name)) return;
        fallbackSubscriptions.add(name);
        const fallbackQuery = query(collection(firebaseDb, name), firestoreLimit(Math.min(limit, 5)));
        const unsubscribe = onSnapshot(fallbackQuery, () => {
          state.live = true;
          window.clearTimeout(state.refreshTimeout);
          state.refreshTimeout = window.setTimeout(() => state.refresh(false), 1400);
        }, () => {});
        state.unsubscribes.push(unsubscribe);
      });
    } catch (_) {
      return null;
    }
  }).filter(Boolean);

  state.refreshInterval = window.setInterval(() => state.refresh(false), CONTROL_CENTER_REFRESH_MS);
}

export async function initAdminControlCenter({
  container,
  db,
  leadsAdapter,
  navigate = () => {},
  showToast = () => {},
  actor = null,
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
      actor,
      live: false,
      loading: false,
      subscribed: false,
      refreshTimeout: null,
      lastHealthWriteAt: 0,
      refreshInterval: null,
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
        persistMissionControlSnapshot(state, metrics.missionControl)
          .catch((error) => console.warn('Mission Control snapshot failed', error));
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
    state.actor = actor;
  }

  await state.refresh(false);
  return state;
}

export default initAdminControlCenter;
