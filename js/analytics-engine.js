/**
 * Product analytics engine for ClasesDe10.
 *
 * Pure functions that transform raw product events and platform records into
 * SaaS-grade metrics: funnels, conversion, feature adoption, errors, demand,
 * growth, cohorts and operational opportunities.
 */

export const ANALYTICS_ENGINE_VERSION = 'analytics-engine-2026-06-28';

export const ANALYTICS_EVENT_CATALOG = Object.freeze([
  'page.view',
  'cta.click',
  'form.started',
  'form.progress',
  'form.abandoned',
  'form.submitted',
  'form.error',
  'auth.login.started',
  'auth.login.succeeded',
  'auth.login.failed',
  'auth.logout',
  'auth.signup.started',
  'auth.signup.succeeded',
  'auth.signup.failed',
  'auth.password_reset.requested',
  'profile.updated',
  'search.used',
  'filter.used',
  'request.created',
  'request.accepted',
  'assignment.created',
  'class.created',
  'class.updated',
  'class.cancelled',
  'payment.created',
  'payment.verified',
  'message.sent',
  'incident.created',
  'review.created',
  'ai.used',
  'experiment.exposed',
  'error.captured',
]);

const FUNNELS = Object.freeze({
  family_acquisition: [
    'page.view',
    'cta.click',
    'form.started',
    'form.submitted',
    'request.created',
    'assignment.created',
    'class.created',
  ],
  teacher_acquisition: [
    'page.view',
    'cta.click',
    'form.started',
    'form.submitted',
    'auth.signup.succeeded',
    'profile.updated',
    'request.accepted',
  ],
  auth: [
    'auth.signup.started',
    'auth.signup.succeeded',
    'auth.login.started',
    'auth.login.succeeded',
  ],
  class_lifecycle: [
    'request.created',
    'assignment.created',
    'class.created',
    'class.updated',
    'payment.verified',
    'review.created',
  ],
});

function clean(value, max = 500) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function lower(value, max = 500) {
  return clean(value, max).toLowerCase();
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round((number(value) + Number.EPSILON) * factor) / factor;
}

function dateFrom(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(value) {
  const date = dateFrom(value);
  return date ? date.toISOString() : '';
}

function dayKey(value) {
  return iso(value).slice(0, 10);
}

function monthKey(value) {
  return iso(value).slice(0, 7);
}

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && clean(value) !== '');
}

function percentage(part, total) {
  return total > 0 ? round((number(part) / number(total)) * 100, 1) : 0;
}

function countBy(items, getter) {
  const map = new Map();
  for (const item of items || []) {
    const key = clean(typeof getter === 'function' ? getter(item) : item?.[getter], 180) || 'sin dato';
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function sumBy(items, getter) {
  return (items || []).reduce((acc, item) => acc + number(typeof getter === 'function' ? getter(item) : item?.[getter]), 0);
}

function uniqueCount(items, getter) {
  const values = new Set();
  for (const item of items || []) {
    const value = clean(typeof getter === 'function' ? getter(item) : item?.[getter], 220);
    if (value) values.add(value);
  }
  return values.size;
}

function createdAt(item = {}) {
  return first(item.createdAt, item.created_at, item.timestamp, item.fecha, item.date, item.updatedAt, item.updated_at);
}

function eventDay(event = {}) {
  return event.day || dayKey(createdAt(event));
}

function eventMonth(event = {}) {
  return event.month || monthKey(createdAt(event));
}

function eventName(event = {}) {
  return clean(first(event.eventName, event.name, event.type), 120);
}

function eventCategory(event = {}) {
  return clean(first(event.category, event.module, event.area), 80) || 'general';
}

function eventFeature(event = {}) {
  return clean(first(event.feature, event.metadata?.feature, event.entityType, eventCategory(event)), 120) || 'general';
}

function eventPath(event = {}) {
  return clean(first(event.pagePath, event.path, event.context?.path, event.urlPath, event.metadata?.page_path), 240) || '/';
}

function sessionKey(event = {}) {
  return clean(first(event.sessionId, event.context?.sessionId, event.anonymousId, event.actorUid), 220) || `event_${event.id || Math.random()}`;
}

function userKey(event = {}) {
  return clean(first(event.actorUid, event.userUid, event.context?.uid, event.anonymousId, event.sessionId), 220);
}

function normalizeStatus(value) {
  const raw = lower(value, 80);
  if (!raw) return '';
  if (raw === 'pending') return 'pendiente';
  if (raw === 'completed') return 'realizada';
  if (raw === 'cancelled' || raw === 'canceled') return 'cancelada';
  if (raw === 'paid') return 'pagado';
  if (raw === 'validated') return 'validado';
  return raw;
}

function subjectOf(item = {}) {
  return clean(first(item.subject, item.materia, item.metadata?.materia, item.asunto, item.details?.subject), 160) || 'sin materia';
}

function cityOf(item = {}) {
  return clean(first(item.city, item.ciudad, item.zona, item.metadata?.zona, item.details?.city), 160) || 'sin ciudad';
}

function roleOf(item = {}) {
  return clean(first(item.role, item.rol, item.actorRole, item.userRole, item.metadata?.role), 80) || 'anonimo';
}

function classRevenue(item = {}) {
  return number(first(item.precio_total, item.amount, item.familyAmount, item.monto));
}

function isCompletedClass(item = {}) {
  return ['realizada', 'completada', 'pagada', 'completed'].includes(normalizeStatus(first(item.status, item.estado, item.lifecycleStatus)));
}

function isCancelledClass(item = {}) {
  return ['cancelada', 'cancelled', 'anulada'].includes(normalizeStatus(first(item.status, item.estado)));
}

function isPaymentVerified(item = {}) {
  return item.verified === true || ['pagado', 'validado', 'paid', 'validated', 'succeeded'].includes(normalizeStatus(first(item.status, item.estado)));
}

function rowsForMonths(items = [], months = []) {
  return months.map((month) => ({ month, count: items.filter((item) => monthKey(createdAt(item)) === month).length }));
}

function lastMonths(count = 6, nowIso = new Date().toISOString()) {
  const now = dateFrom(nowIso) || new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - index), 1));
    return date.toISOString().slice(0, 7);
  });
}

function buildFunnel(events = [], steps = [], keyGetter = sessionKey) {
  const byKey = new Map();
  for (const event of events || []) {
    const key = keyGetter(event);
    if (!key) continue;
    const current = byKey.get(key) || new Set();
    current.add(eventName(event));
    byKey.set(key, current);
  }
  const rows = steps.map((step, index) => {
    const count = Array.from(byKey.values()).filter((set) => steps.slice(0, index + 1).every((candidate) => set.has(candidate))).length;
    const previous = index === 0 ? count : null;
    return { step, count, previous };
  });
  return rows.map((row, index) => {
    const prev = index === 0 ? row.count : rows[index - 1].count;
    return {
      ...row,
      conversionFromStartPct: rows[0]?.count ? percentage(row.count, rows[0].count) : 0,
      conversionFromPreviousPct: index === 0 ? 100 : percentage(row.count, prev),
      dropoffFromPrevious: index === 0 ? 0 : Math.max(0, prev - row.count),
      dropoffFromPreviousPct: index === 0 ? 0 : percentage(Math.max(0, prev - row.count), prev),
    };
  });
}

function lowUsageFeatures(events = []) {
  const totalSessions = Math.max(1, uniqueCount(events, sessionKey));
  return countBy(events, eventFeature)
    .map((item) => ({
      ...item,
      adoptionPct: percentage(item.count, totalSessions),
    }))
    .filter((item) => item.count <= 3 || item.adoptionPct < 8)
    .slice(0, 12);
}

function pageConversion(events = []) {
  const pageViews = events.filter((event) => eventName(event) === 'page.view');
  const conversions = events.filter((event) => [
    'form.submitted',
    'request.created',
    'auth.signup.succeeded',
    'payment.verified',
  ].includes(eventName(event)));
  const pages = countBy(pageViews, eventPath);
  return pages.map((page) => {
    const converted = conversions.filter((event) => eventPath(event) === page.key).length;
    return {
      ...page,
      conversions: converted,
      conversionPct: percentage(converted, page.count),
    };
  }).sort((a, b) => a.conversionPct - b.conversionPct || b.count - a.count);
}

function errorHotspots(events = []) {
  return countBy(events.filter((event) => (
    eventCategory(event) === 'error'
    || eventName(event).includes('failed')
    || eventName(event).includes('error')
    || event.severity === 'error'
  )), (event) => `${eventName(event)} / ${eventFeature(event)} / ${eventPath(event)}`).slice(0, 12);
}

function durationStats(events = []) {
  const values = events.map((event) => number(first(event.durationMs, event.metadata?.durationMs, event.performance?.durationMs))).filter((value) => value > 0);
  if (!values.length) return { avgMs: 0, p50Ms: 0, p90Ms: 0, samples: 0 };
  const sorted = values.slice().sort((a, b) => a - b);
  const quantile = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return {
    avgMs: Math.round(sumBy(values, (item) => item) / values.length),
    p50Ms: Math.round(quantile(0.5)),
    p90Ms: Math.round(quantile(0.9)),
    samples: values.length,
  };
}

function teacherConversion(records = {}) {
  const classes = records.classes || records.clases || [];
  const requests = records.requests || records.solicitudes || [];
  const assignments = records.assignments || records.asignaciones || [];
  const teachers = records.teachers || records.profesores || [];
  return teachers.map((teacher) => {
    const teacherUid = clean(first(teacher.id, teacher.uid, teacher.userUid, teacher.profesor_id, teacher.teacherUid), 160);
    const assigned = assignments.filter((item) => clean(first(item.teacherUid, item.profesor_id, item.assignedTeacherUid), 160) === teacherUid);
    const teacherClasses = classes.filter((item) => clean(first(item.teacherUid, item.profesor_id), 160) === teacherUid);
    const completed = teacherClasses.filter(isCompletedClass);
    const cancelled = teacherClasses.filter(isCancelledClass);
    const offered = requests.filter((item) => clean(first(item.assignedTeacherUid, item.profesor_asignado_id), 160) === teacherUid).length || assigned.length;
    return {
      teacherUid,
      teacherName: clean([first(teacher.nombre, teacher.usuarios?.nombre), first(teacher.apellidos, teacher.usuarios?.apellidos)].filter(Boolean).join(' '), 180) || teacherUid || 'Sin profesor',
      offered,
      assignments: assigned.length,
      classes: teacherClasses.length,
      completed: completed.length,
      cancelled: cancelled.length,
      revenue: sumBy(completed, classRevenue),
      assignmentConversionPct: percentage(assigned.length, Math.max(1, offered)),
      completionPct: percentage(completed.length, Math.max(1, teacherClasses.length)),
      cancellationPct: percentage(cancelled.length, Math.max(1, teacherClasses.length)),
    };
  }).filter((item) => item.teacherUid || item.classes || item.assignments)
    .sort((a, b) => b.assignmentConversionPct - a.assignmentConversionPct || b.completed - a.completed)
    .slice(0, 20);
}

function demandGrowth(records = {}, events = [], nowIso = new Date().toISOString()) {
  const requests = records.requests || records.solicitudes || [];
  const leads = records.leads || records.publicLeads || [];
  const classes = records.classes || records.clases || [];
  const months = lastMonths(6, nowIso);
  const demandItems = [
    ...requests.map((item) => ({ ...item, demandType: 'request' })),
    ...leads.map((item) => ({ ...item, demandType: 'lead' })),
    ...events.filter((event) => ['search.used', 'filter.used'].includes(eventName(event))).map((event) => ({
      ...event,
      materia: first(event.metadata?.subject, event.metadata?.materia, event.searchTerm, event.query),
      zona: first(event.metadata?.city, event.metadata?.zona),
      demandType: 'search',
    })),
  ];
  return {
    subjects: countBy(demandItems, subjectOf).slice(0, 15),
    cities: countBy(demandItems, cityOf).slice(0, 15),
    monthlyDemand: months.map((month) => ({
      month,
      leads: leads.filter((item) => monthKey(createdAt(item)) === month).length,
      requests: requests.filter((item) => monthKey(createdAt(item)) === month).length,
      classes: classes.filter((item) => monthKey(createdAt(item)) === month).length,
    })),
  };
}

function adoptionByRole(events = []) {
  const roles = countBy(events, roleOf);
  return roles.map((role) => {
    const roleEvents = events.filter((event) => roleOf(event) === role.key);
    return {
      ...role,
      sessions: uniqueCount(roleEvents, sessionKey),
      users: uniqueCount(roleEvents, userKey),
      topFeatures: countBy(roleEvents, eventFeature).slice(0, 5),
    };
  });
}

function buildInsights(report = {}) {
  const insights = [];
  const familyFunnel = report.funnels.family_acquisition || [];
  const largestDrop = familyFunnel.slice(1).sort((a, b) => b.dropoffFromPreviousPct - a.dropoffFromPreviousPct)[0];
  if (largestDrop && largestDrop.dropoffFromPrevious > 0) {
    insights.push({
      type: 'funnel_dropoff',
      priority: largestDrop.dropoffFromPreviousPct >= 50 ? 'high' : 'medium',
      title: 'Mayor abandono del embudo',
      body: `${largestDrop.step} pierde ${largestDrop.dropoffFromPrevious} sesion(es), ${largestDrop.dropoffFromPreviousPct}% frente al paso anterior.`,
    });
  }
  const topError = report.errors[0];
  if (topError) {
    insights.push({
      type: 'error_hotspot',
      priority: topError.count >= 5 ? 'high' : 'medium',
      title: 'Paso con mas errores',
      body: `${topError.label} acumula ${topError.count} error(es).`,
    });
  }
  const weakestPage = report.pageConversion.find((item) => item.count >= 3 && item.conversionPct < 5);
  if (weakestPage) {
    insights.push({
      type: 'weak_page_conversion',
      priority: 'medium',
      title: 'Pagina con baja conversion',
      body: `${weakestPage.label} convierte ${weakestPage.conversionPct}% con ${weakestPage.count} visita(s).`,
    });
  }
  const lowFeature = report.lowUsageFeatures[0];
  if (lowFeature) {
    insights.push({
      type: 'low_feature_usage',
      priority: 'low',
      title: 'Funcionalidad poco usada',
      body: `${lowFeature.label} tiene ${lowFeature.count} uso(s), ${lowFeature.adoptionPct}% de adopcion por sesion.`,
    });
  }
  return insights.slice(0, 12);
}

export function normalizeAnalyticsEvent(raw = {}) {
  const name = eventName(raw);
  const created = createdAt(raw) || new Date().toISOString();
  return {
    ...raw,
    id: clean(raw.id, 180),
    schemaVersion: clean(raw.schemaVersion || 'analytics_event_v1', 80),
    eventName: name,
    eventType: clean(first(raw.eventType, name.split('.')[0], 'interaction'), 80),
    category: eventCategory(raw),
    feature: eventFeature(raw),
    actorUid: clean(first(raw.actorUid, raw.userUid), 180),
    actorRole: roleOf(raw),
    anonymousId: clean(raw.anonymousId, 180),
    sessionId: clean(first(raw.sessionId, raw.context?.sessionId), 220),
    pagePath: eventPath(raw),
    pageUrl: clean(first(raw.pageUrl, raw.url, raw.context?.url), 500),
    referrer: clean(first(raw.referrer, raw.context?.referrer), 500),
    day: raw.day || dayKey(created),
    month: raw.month || monthKey(created),
    createdAt: created,
    created_at: raw.created_at || iso(created),
    metadata: raw.metadata || {},
  };
}

export function buildAnalyticsReport(input = {}, options = {}) {
  const nowIso = options.nowIso || new Date().toISOString();
  const events = (input.events || input.analyticsEvents || []).map(normalizeAnalyticsEvent);
  const records = {
    leads: input.leads || input.publicLeads || [],
    requests: input.requests || input.solicitudes || [],
    teachers: input.teachers || input.profesores || [],
    families: input.families || input.familias || [],
    students: input.students || input.alumnos || [],
    assignments: input.assignments || input.asignaciones || [],
    classes: input.classes || input.clases || [],
    payments: input.payments || input.pagos || [],
    incidents: input.incidents || input.incidencias || [],
  };
  const activeEvents = options.month ? events.filter((event) => event.month === options.month) : events;
  const months = lastMonths(6, nowIso);
  const report = {
    version: ANALYTICS_ENGINE_VERSION,
    generatedAt: nowIso,
    totals: {
      events: activeEvents.length,
      sessions: uniqueCount(activeEvents, sessionKey),
      users: uniqueCount(activeEvents, userKey),
      pageViews: activeEvents.filter((event) => event.eventName === 'page.view').length,
      conversions: activeEvents.filter((event) => ['form.submitted', 'request.created', 'auth.signup.succeeded', 'payment.verified'].includes(event.eventName)).length,
      errors: activeEvents.filter((event) => event.category === 'error' || event.eventName.includes('failed') || event.eventName.includes('error')).length,
      records: Object.fromEntries(Object.entries(records).map(([key, value]) => [key, value.length])),
    },
    funnels: Object.fromEntries(Object.entries(FUNNELS).map(([key, steps]) => [key, buildFunnel(activeEvents, steps)])),
    pageConversion: pageConversion(activeEvents),
    errors: errorHotspots(activeEvents),
    lowUsageFeatures: lowUsageFeatures(activeEvents),
    featureUsage: countBy(activeEvents, eventFeature).slice(0, 20),
    eventTypes: countBy(activeEvents, eventName).slice(0, 30),
    adoptionByRole: adoptionByRole(activeEvents),
    duration: durationStats(activeEvents),
    teacherConversion: teacherConversion(records),
    demand: demandGrowth(records, activeEvents, nowIso),
    monthly: {
      events: rowsForMonths(events, months),
      signups: rowsForMonths(events.filter((event) => event.eventName === 'auth.signup.succeeded'), months),
      requests: rowsForMonths(records.requests, months),
      classes: rowsForMonths(records.classes, months),
      payments: rowsForMonths(records.payments.filter(isPaymentVerified), months),
    },
    experiments: countBy(activeEvents.filter((event) => event.variant || event.metadata?.variant), (event) => `${first(event.experiment, event.metadata?.experiment, 'sin experimento')} / ${first(event.variant, event.metadata?.variant)}`).slice(0, 12),
  };
  report.insights = buildInsights(report);
  return report;
}

export function buildAnalyticsCsvRows(events = []) {
  return (events || []).map(normalizeAnalyticsEvent).map((event) => ({
    fecha: event.created_at || event.createdAt,
    dia: event.day,
    mes: event.month,
    evento: event.eventName,
    categoria: event.category,
    feature: event.feature,
    rol: event.actorRole,
    pagina: event.pagePath,
    sesion: event.sessionId,
    usuario: event.actorUid || event.anonymousId,
    entidad_tipo: event.entityType || '',
    entidad_id: event.entityId || '',
  }));
}
