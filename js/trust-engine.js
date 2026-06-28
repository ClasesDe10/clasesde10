/**
 * ClasesDe10 reputation engine.
 *
 * Version 2 is an automatic, explainable trust system inspired by the way
 * high-quality marketplaces separate public confidence from internal risk.
 * Users can improve the inputs through real activity and verification, but the
 * score itself is calculated from platform records, not from manual claims.
 */

export const TRUST_VERSION = 'trust_reputation_v2';

const VERIFIED_STATUSES = new Set(['validado', 'verificado', 'aprobado', 'approved', 'verified', 'activo', 'active']);
const PENDING_STATUSES = new Set(['pendiente', 'pending', 'en_revision', 'review', 'pendiente_revision']);
const COMPLETED_CLASS_STATUSES = new Set(['realizada', 'completed', 'completada', 'pagada', 'paid']);
const CANCELLED_CLASS_STATUSES = new Set(['cancelada', 'cancelled', 'canceled']);
const NO_SHOW_CLASS_STATUSES = new Set(['no_realizada', 'no_show', 'noshow', 'ausente']);
const OPEN_INCIDENT_STATUSES = new Set(['abierta', 'open', 'pendiente', 'pending', 'en_revision', 'review']);
const PAID_PAYMENT_STATUSES = new Set(['pagado', 'paid', 'validado', 'validated', 'verified', 'succeeded', 'completado']);
const PENDING_PAYMENT_STATUSES = new Set(['pendiente', 'pending', 'vencido', 'overdue', 'review', 'needs_review']);

export function cleanTrustText(value, max = 500) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function normalize(value) {
  return cleanTrustText(value, 1000)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function first(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function round(value, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function rate01(value) {
  const number = numberOrNull(value);
  if (number === null) return null;
  return number > 1 ? clamp(number / 100, 0, 1) : clamp(number, 0, 1);
}

function asDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.toMillis === 'function') return new Date(value.toMillis());
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value === 'number') return new Date(value);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function latestDate(values) {
  return values.map(asDate).filter(Boolean).sort((a, b) => b.getTime() - a.getTime())[0] || null;
}

function earliestDate(values) {
  return values.map(asDate).filter(Boolean).sort((a, b) => a.getTime() - b.getTime())[0] || null;
}

function daysBetween(startValue, endValue) {
  const start = asDate(startValue);
  const end = asDate(endValue);
  if (!start || !end) return null;
  return Math.max(0, (end.getTime() - start.getTime()) / 86400000);
}

function daysSince(value, now = new Date()) {
  const date = asDate(value);
  if (!date) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86400000));
}

function hoursBetween(startValue, endValue) {
  const start = asDate(startValue);
  const end = asDate(endValue);
  if (!start || !end) return null;
  const hours = (end.getTime() - start.getTime()) / 3600000;
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

function minutesBetween(startValue, endValue) {
  const hours = hoursBetween(startValue, endValue);
  return hours === null ? null : hours * 60;
}

function average(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function safeRatio(part, total) {
  return total > 0 ? clamp(part / total, 0, 1) : null;
}

function confidence(count, fullAt = 12, floor = 0.35) {
  const safeCount = Math.max(0, Number(count || 0));
  return clamp(floor + (1 - floor) * Math.min(1, safeCount / fullAt), 0, 1);
}

function bayesianRate(successes, total, neutral = 0.7, fullAt = 12) {
  if (!total) return neutral;
  const raw = safeRatio(successes, total) ?? neutral;
  const c = confidence(total, fullAt, 0.25);
  return raw * c + neutral * (1 - c);
}

function hasText(value, min = 1) {
  return cleanTrustText(value).length >= min;
}

function unique(values) {
  return [...new Set(values.map((value) => cleanTrustText(value, 180)).filter(Boolean))];
}

function definedEntries(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ''));
}

function idsFor(entity = {}, role = 'teacher') {
  const values = role === 'family'
    ? [entity.id, entity.familyUid, entity.familia_id, entity.userUid, entity.usuario_id, entity.uid]
    : [entity.id, entity.teacherUid, entity.profesor_id, entity.userUid, entity.usuario_id, entity.uid];
  return new Set(values.map((value) => cleanTrustText(value, 180)).filter(Boolean));
}

function itemMatchesAnyId(item = {}, ids, fields) {
  return fields.some((field) => ids.has(cleanTrustText(item[field], 180)));
}

function classStatus(item = {}) {
  return normalize(first(item.status, item.estado, item.lifecycleStatus, item.classStatus));
}

function paymentStatus(item = {}) {
  return normalize(first(
    item.status,
    item.estado,
    item.paymentStatus,
    item.estado_pago,
    item.familyPaymentStatus,
    item.estado_pago_familia,
    item.reconciliationStatus,
  ));
}

function documentStatus(item = {}) {
  return normalize(first(item.estado, item.status, item.verificationStatus));
}

function documentType(item = {}) {
  return normalize(first(item.tipo, item.documentType, item.category));
}

function activeStatus(entity = {}) {
  return normalize(first(entity.estado_verificacion, entity.verificationStatus, entity.status, entity.estado));
}

function profilePercent(entity = {}) {
  const value = numberOrNull(first(entity.profileCompletionPercent, entity.profileCompletion, entity.perfil_completado));
  if (value !== null) return clamp(value, 0, 100);
  if (entity.profileComplete === true || entity.perfil_completo === true) return 100;
  return 0;
}

function experienceYears(entity = {}) {
  const explicit = numberOrNull(first(entity.experiencia_anios, entity.experienceYears, entity.anios_experiencia));
  if (explicit !== null) return Math.max(0, explicit);
  const text = normalize(first(entity.experiencia, entity.bio, entity.presentacion));
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(anos|anios|years)/);
  return match ? Number(match[1].replace(',', '.')) : 0;
}

function dateWithTime(dateValue, timeValue) {
  const dateText = cleanTrustText(dateValue, 40);
  const timeText = cleanTrustText(timeValue, 20);
  if (!dateText) return null;
  if (!timeText) return asDate(dateText);
  return asDate(`${dateText}T${timeText.length <= 5 ? `${timeText}:00` : timeText}`);
}

function classStart(item = {}) {
  return asDate(first(item.scheduledStartAt, item.startAt, item.startsAt, item.fecha_inicio, item.dateTime))
    || dateWithTime(first(item.fecha, item.date), first(item.hora_inicio, item.startTime));
}

function classEnd(item = {}) {
  return asDate(first(item.scheduledEndAt, item.endAt, item.endsAt, item.fecha_fin))
    || dateWithTime(first(item.fecha, item.date), first(item.hora_fin, item.endTime));
}

function actualClassStart(item = {}) {
  return asDate(first(item.actualStartAt, item.startedAt, item.teacherStartedAt, item.checkInAt, item.teacherCheckInAt));
}

function classDurationHours(item = {}) {
  const explicitHours = numberOrNull(first(item.durationHours, item.duracion_horas));
  if (explicitHours !== null && explicitHours > 0) return Math.min(explicitHours, 8);
  const explicitMinutes = numberOrNull(first(item.durationMinutes, item.duracion_minutos));
  if (explicitMinutes !== null && explicitMinutes > 0) return Math.min(explicitMinutes / 60, 8);
  const between = hoursBetween(classStart(item), classEnd(item));
  if (between !== null && between > 0) return Math.min(between, 8);
  return 1;
}

function weekKey(value) {
  const date = asDate(value);
  if (!date) return '';
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((copy - yearStart) / 86400000) + 1) / 7);
  return `${copy.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function scoreComponent(key, label, points, max, detail = '', visibility = 'public') {
  return {
    key,
    label,
    points: round(clamp(points, 0, max), 1),
    max,
    detail,
    visibility,
  };
}

function badge(key, label, tone = 'neutral', detail = '', criteria = '', publicVisible = true, category = 'trust') {
  return {
    key,
    label,
    tone,
    detail,
    criteria,
    public: publicVisible,
    visibility: publicVisible ? 'public' : 'admin',
    category,
    source: 'automatic',
  };
}

function signal(key, label, state, detail = '', publicVisible = true) {
  return {
    key,
    label,
    state,
    detail,
    public: publicVisible,
    visibility: publicVisible ? 'public' : 'admin',
  };
}

function docsSummary(docs = []) {
  const identityDocs = docs.filter((doc) => ['dni', 'identidad', 'pasaporte', 'tutor'].includes(documentType(doc)));
  const academicDocs = docs.filter((doc) => ['titulo', 'certificado', 'certificacion', 'academic', 'cv', 'curriculum'].includes(documentType(doc)));
  const cvDocs = docs.filter((doc) => ['cv', 'curriculum'].includes(documentType(doc)));
  const verifiedDocs = docs.filter((doc) => VERIFIED_STATUSES.has(documentStatus(doc)));
  const pendingDocs = docs.filter((doc) => PENDING_STATUSES.has(documentStatus(doc)));
  return {
    count: docs.length,
    verifiedCount: verifiedDocs.length,
    pendingCount: pendingDocs.length,
    identityUploaded: identityDocs.length > 0,
    identityVerified: identityDocs.some((doc) => VERIFIED_STATUSES.has(documentStatus(doc))),
    academicUploaded: academicDocs.length > 0,
    academicVerified: academicDocs.some((doc) => VERIFIED_STATUSES.has(documentStatus(doc))),
    cvUploaded: cvDocs.length > 0,
    cvVerified: cvDocs.some((doc) => VERIFIED_STATUSES.has(documentStatus(doc))),
  };
}

function filteredDocuments(profile, context, role) {
  if (Array.isArray(context.documentsForOwner)) return context.documentsForOwner;
  const ids = idsFor(profile, role);
  return (context.documents || []).filter((item) => itemMatchesAnyId(item, ids, [
    'ownerUid',
    'userUid',
    'usuario_id',
    'teacherUid',
    'profesor_id',
    'familyUid',
    'familia_id',
  ]));
}

function reviewsSummary(profile, context, role) {
  const ids = idsFor(profile, role);
  const reviews = (context.reviews || context.valoraciones || []).filter((item) => itemMatchesAnyId(item, ids, role === 'family'
    ? ['familyUid', 'familia_id', 'reviewedUid', 'userUid']
    : ['teacherUid', 'profesor_id', 'reviewedUid', 'userUid']));
  const explicitRating = numberOrNull(first(profile.valoracion_media, profile.averageRating, profile.rating));
  const explicitCount = numberOrNull(first(profile.reviewsCount, profile.valoraciones_count, profile.totalReviews));
  const reviewRatings = reviews.map((item) => numberOrNull(first(item.rating, item.valoracion, item.score))).filter(Number.isFinite);
  const count = explicitCount ?? reviewRatings.length;
  const rating = explicitRating ?? average(reviewRatings);
  const ratingConfidence = confidence(count || 0, 20, 0.2);
  return {
    rating,
    count: count || 0,
    ratingConfidence,
    verifiedReviewCount: reviews.filter((item) => item.verified !== false && item.verificada !== false).length,
  };
}

function classCollectionsFor(profile, context, role) {
  const ids = idsFor(profile, role);
  const fields = role === 'family'
    ? ['familyUid', 'familia_id', 'parentUid', 'userUid', 'usuario_id']
    : ['teacherUid', 'profesor_id', 'teacherUserUid', 'usuario_profesor_id', 'userUid', 'usuario_id'];
  const classes = (context.classes || []).filter((item) => itemMatchesAnyId(item, ids, fields));
  const completed = classes.filter((item) => COMPLETED_CLASS_STATUSES.has(classStatus(item)));
  const cancelled = classes.filter((item) => CANCELLED_CLASS_STATUSES.has(classStatus(item)));
  const noShow = classes.filter((item) => NO_SHOW_CLASS_STATUSES.has(classStatus(item)));
  const evaluated = classes.filter((item) => (
    COMPLETED_CLASS_STATUSES.has(classStatus(item))
    || CANCELLED_CLASS_STATUSES.has(classStatus(item))
    || NO_SHOW_CLASS_STATUSES.has(classStatus(item))
  ));
  return { ids, classes, completed, cancelled, noShow, evaluated };
}

function punctualitySummary(classes = []) {
  const measured = classes.map((item) => {
    const scheduled = classStart(item);
    const actual = actualClassStart(item);
    const delay = minutesBetween(scheduled, actual);
    return delay === null ? null : delay;
  }).filter(Number.isFinite);
  const punctual = measured.filter((delay) => delay <= 10).length;
  return {
    samples: measured.length,
    averageDelayMinutes: average(measured),
    punctualClasses: punctual,
    punctualityRate: safeRatio(punctual, measured.length),
  };
}

function regularitySummary(completed = [], now = new Date()) {
  const dates = completed.map((item) => classStart(item) || asDate(first(item.fecha, item.date, item.createdAt, item.updatedAt))).filter(Boolean);
  const firstClass = earliestDate(dates);
  const activeWeeks = new Set(dates.map(weekKey).filter(Boolean)).size;
  const weeksSinceFirst = firstClass ? Math.max(1, Math.ceil(daysBetween(firstClass, now) / 7)) : 0;
  const measuredWeeks = Math.min(12, weeksSinceFirst || 0);
  const regularityRate = measuredWeeks ? clamp(activeWeeks / measuredWeeks, 0, 1) : null;
  return { activeWeeks, weeksSinceFirst, regularityRate };
}

function responseSummaryForTeacher(profile, context, ids) {
  const matches = (context.matches || context.requestMatches || []).filter((item) => itemMatchesAnyId(item, ids, ['teacherUid', 'profesor_id', 'teacherUserUid', 'userUid']));
  const requests = context.requests || [];
  const responseDurations = matches
    .map((item) => hoursBetween(first(item.createdAt, item.created_at, item.offeredAt), first(item.respondedAt, item.acceptedAt, item.selectedAt, item.updatedAt, item.updated_at)))
    .filter(Number.isFinite);
  const requestDurations = requests
    .filter((item) => itemMatchesAnyId(item, ids, ['assignedTeacherUid', 'profesor_asignado_id']))
    .map((item) => hoursBetween(first(item.createdAt, item.created_at), first(item.assignedAt, item.fecha_asignacion, item.updatedAt, item.updated_at)))
    .filter(Number.isFinite);
  const explicit = numberOrNull(first(profile.responseTimeHours, profile.averageResponseHours, profile.tiempo_respuesta_horas));
  const averageResponseHours = explicit ?? average([...responseDurations, ...requestDurations]);
  const accepted = numberOrNull(first(profile.acceptedRequests, profile.solicitudesAceptadas, profile.acceptedAssignments))
    ?? matches.filter((item) => ['aceptado', 'accepted', 'asignado', 'selected', 'asignada'].includes(classStatus(item))).length;
  const offered = numberOrNull(first(profile.offeredRequests, profile.solicitudesOfrecidas, profile.totalRequests))
    ?? matches.length;
  const acceptanceRate = rate01(first(profile.acceptanceRate, profile.ratio_aceptacion)) ?? (offered ? accepted / offered : null);
  return {
    matches,
    responseSamples: responseDurations.length + requestDurations.length + (explicit !== null ? 1 : 0),
    averageResponseHours,
    acceptedRequests: accepted || 0,
    offeredRequests: offered || 0,
    acceptanceRate,
  };
}

function incidentsFor(profile, context, role) {
  const ids = idsFor(profile, role);
  const fields = role === 'family'
    ? ['familyUid', 'familia_id', 'reportedFamilyUid', 'userUid']
    : ['teacherUid', 'profesor_id', 'reportedTeacherUid', 'userUid'];
  const incidents = (context.incidents || []).filter((item) => itemMatchesAnyId(item, ids, fields));
  const open = incidents.filter((item) => OPEN_INCIDENT_STATUSES.has(classStatus(item)) || OPEN_INCIDENT_STATUSES.has(normalize(first(item.status, item.estado))));
  const critical = incidents.filter((item) => ['critica', 'critical', 'alta', 'high'].includes(normalize(first(item.priority, item.prioridad))));
  const claims = incidents.filter((item) => ['reclamacion', 'claim', 'queja'].includes(normalize(first(item.tipo, item.type, item.category))));
  return { incidents, open, critical, claims };
}

function teacherOperationalMetrics(profile, context, now) {
  const { ids, classes, completed, cancelled, noShow, evaluated } = classCollectionsFor(profile, context, 'teacher');
  const payments = (context.payments || []).filter((item) => itemMatchesAnyId(item, ids, ['teacherUid', 'profesor_id', 'userUid', 'usuario_id']));
  const assignments = (context.assignments || []).filter((item) => itemMatchesAnyId(item, ids, ['teacherUid', 'profesor_id', 'teacherUserUid']));
  const response = responseSummaryForTeacher(profile, context, ids);
  const punctuality = punctualitySummary(completed);
  const regularity = regularitySummary(completed, now);
  const incidents = incidentsFor(profile, context, 'teacher');
  const paid = payments.filter((item) => PAID_PAYMENT_STATUSES.has(paymentStatus(item)));
  const pendingPayments = payments.filter((item) => PENDING_PAYMENT_STATUSES.has(paymentStatus(item)));
  const activeAssignments = assignments.filter((item) => item.active !== false && item.activa !== false);
  const studentIds = unique([
    ...activeAssignments.map((item) => first(item.studentUid, item.alumno_id, item.studentId)),
    ...completed.map((item) => first(item.studentUid, item.alumno_id, item.studentId)),
  ]);
  const lastActivityAt = latestDate([
    profile.lastLoginAt,
    profile.lastActiveAt,
    profile.updatedAt,
    profile.updated_at,
    ...classes.map((item) => first(classStart(item), item.fecha, item.date, item.createdAt, item.updatedAt)),
    ...assignments.map((item) => first(item.createdAt, item.updatedAt)),
    ...payments.map((item) => first(item.createdAt, item.updatedAt, item.paidAt)),
  ]);
  const firstActivityAt = earliestDate([
    profile.createdAt,
    profile.created_at,
    profile.importedAt,
    ...classes.map((item) => first(classStart(item), item.fecha, item.date, item.createdAt)),
  ]);

  const rawCompletionRate = safeRatio(completed.length, evaluated.length);
  const rawCancellationRate = safeRatio(cancelled.length, evaluated.length);
  const rawNoShowRate = safeRatio(noShow.length, evaluated.length);
  return {
    classes,
    completedClasses: completed.length,
    cancelledClasses: cancelled.length,
    noShowClasses: noShow.length,
    evaluatedClasses: evaluated.length,
    completionRate: rate01(first(profile.completionRate, profile.classCompletionRate, profile.ratio_clases_realizadas)) ?? rawCompletionRate,
    cancellationRate: rate01(first(profile.cancellationRate, profile.cancelRate, profile.ratio_cancelacion)) ?? rawCancellationRate,
    noShowRate: rawNoShowRate,
    adjustedCompletionRate: bayesianRate(completed.length, evaluated.length, 0.78, 16),
    adjustedCancellationRate: bayesianRate(cancelled.length + noShow.length, evaluated.length, 0.08, 16),
    completedHours: round(completed.reduce((sum, item) => sum + classDurationHours(item), 0), 1),
    activeAssignments: activeAssignments.length,
    activeStudents: studentIds.length,
    ...response,
    ...punctuality,
    ...regularity,
    paidPayments: paid.length,
    pendingPayments: pendingPayments.length,
    openIncidents: incidents.open.length,
    totalIncidents: incidents.incidents.length,
    criticalIncidents: incidents.critical.length,
    claims: incidents.claims.length,
    lastActivityAt,
    firstActivityAt,
    inactiveDays: daysSince(lastActivityAt, now),
    tenureDays: daysSince(firstActivityAt, now),
  };
}

function familyOperationalMetrics(profile, context, now) {
  const { ids, classes, completed, cancelled, noShow, evaluated } = classCollectionsFor(profile, context, 'family');
  const students = Array.isArray(context.studentsForOwner)
    ? context.studentsForOwner
    : (context.students || context.alumnos || []).filter((item) => itemMatchesAnyId(item, ids, ['familyUid', 'familia_id', 'parentUid', 'userUid']));
  const payments = (context.payments || []).filter((item) => itemMatchesAnyId(item, ids, ['familyUid', 'familia_id', 'userUid', 'usuario_id']));
  const requests = (context.requests || []).filter((item) => itemMatchesAnyId(item, ids, ['familyUid', 'familia_id', 'userUid', 'usuario_id']));
  const assignments = (context.assignments || []).filter((item) => itemMatchesAnyId(item, ids, ['familyUid', 'familia_id', 'userUid']));
  const incidents = incidentsFor(profile, context, 'family');
  const paid = payments.filter((item) => PAID_PAYMENT_STATUSES.has(paymentStatus(item)));
  const pendingPayments = payments.filter((item) => PENDING_PAYMENT_STATUSES.has(paymentStatus(item)));
  const activeStudents = students.filter((item) => item.active !== false && item.activo !== false);
  const lastActivityAt = latestDate([
    profile.lastLoginAt,
    profile.lastActiveAt,
    profile.updatedAt,
    profile.updated_at,
    ...students.map((item) => first(item.createdAt, item.updatedAt)),
    ...classes.map((item) => first(classStart(item), item.fecha, item.date, item.createdAt, item.updatedAt)),
    ...requests.map((item) => first(item.createdAt, item.updatedAt)),
    ...payments.map((item) => first(item.createdAt, item.updatedAt, item.paidAt)),
  ]);
  const firstActivityAt = earliestDate([profile.createdAt, profile.created_at, ...requests.map((item) => first(item.createdAt, item.created_at)), ...classes.map(classStart)]);
  const paymentReliability = payments.length ? paid.length / payments.length : null;
  const completionRate = safeRatio(completed.length, evaluated.length);
  const cancellationRate = safeRatio(cancelled.length + noShow.length, evaluated.length);
  return {
    students,
    classes,
    payments,
    requests,
    assignments,
    activeStudents: activeStudents.length,
    completedClasses: completed.length,
    cancelledClasses: cancelled.length,
    noShowClasses: noShow.length,
    evaluatedClasses: evaluated.length,
    completionRate,
    cancellationRate,
    adjustedCompletionRate: bayesianRate(completed.length, evaluated.length, 0.75, 12),
    adjustedCancellationRate: bayesianRate(cancelled.length + noShow.length, evaluated.length, 0.08, 12),
    completedHours: round(completed.reduce((sum, item) => sum + classDurationHours(item), 0), 1),
    paidPayments: paid.length,
    pendingPayments: pendingPayments.length,
    paymentReliability,
    adjustedPaymentReliability: bayesianRate(paid.length, payments.length, 0.72, 10),
    openIncidents: incidents.open.length,
    totalIncidents: incidents.incidents.length,
    criticalIncidents: incidents.critical.length,
    claims: incidents.claims.length,
    lastActivityAt,
    firstActivityAt,
    inactiveDays: daysSince(lastActivityAt, now),
    tenureDays: daysSince(firstActivityAt, now),
  };
}

function responseRatio(hours) {
  if (hours === null || hours === undefined) return 0.62;
  if (hours <= 2) return 1;
  if (hours <= 6) return 0.86;
  if (hours <= 12) return 0.68;
  if (hours <= 24) return 0.45;
  return 0.18;
}

function recentActivityRatio(days) {
  if (days === null || days === undefined) return 0.48;
  if (days <= 7) return 1;
  if (days <= 30) return 0.76;
  if (days <= 90) return 0.38;
  return 0.12;
}

function ratingRatio(summary) {
  if (summary.rating === null || summary.rating === undefined) return 0.55;
  const raw = clamp(summary.rating / 5, 0, 1);
  return raw * summary.ratingConfidence + 0.68 * (1 - summary.ratingConfidence);
}

function statusFlags(profile = {}) {
  const status = activeStatus(profile);
  const active = profile.active !== false && profile.activo !== false;
  return {
    status,
    active,
    adminVerified: active && ['verificado', 'verified', 'activo', 'active', 'aprobado', 'approved'].includes(status),
    pendingReview: PENDING_STATUSES.has(status) || !status,
    blocked: ['rechazado', 'rejected', 'bloqueado', 'blocked', 'suspendido', 'suspended', 'inactivo', 'inactive'].includes(status) || !active,
  };
}

function levelForTeacher(score, metrics, docs, flags) {
  if (flags.blocked) return { key: 'bronce', label: 'Bronce', rank: 1, publicLabel: 'Profesor Bronce' };
  if (score >= 90 && docs.identityVerified && docs.academicVerified && metrics.completedClasses >= 20 && metrics.openIncidents === 0) {
    return { key: 'platino', label: 'Platino', rank: 4, publicLabel: 'Profesor Platino' };
  }
  if (score >= 78 && docs.identityUploaded && metrics.completedClasses >= 8 && metrics.openIncidents === 0) {
    return { key: 'oro', label: 'Oro', rank: 3, publicLabel: 'Profesor Oro' };
  }
  if (score >= 62 && (docs.identityUploaded || flags.adminVerified) && metrics.evaluatedClasses >= 2) {
    return { key: 'plata', label: 'Plata', rank: 2, publicLabel: 'Profesor Plata' };
  }
  return { key: 'bronce', label: 'Bronce', rank: 1, publicLabel: 'Profesor Bronce' };
}

function levelForFamily(score, metrics, docs, flags) {
  if (flags.blocked) return { key: 'bronce', label: 'Bronce', rank: 1, publicLabel: 'Familia Bronce' };
  if (score >= 90 && docs.identityVerified && metrics.completedClasses >= 12 && metrics.pendingPayments === 0 && metrics.openIncidents === 0) {
    return { key: 'platino', label: 'Platino', rank: 4, publicLabel: 'Familia Platino' };
  }
  if (score >= 78 && metrics.completedClasses >= 5 && metrics.pendingPayments === 0) {
    return { key: 'oro', label: 'Oro', rank: 3, publicLabel: 'Familia Oro' };
  }
  if (score >= 62 && metrics.activeStudents > 0) {
    return { key: 'plata', label: 'Plata', rank: 2, publicLabel: 'Familia Plata' };
  }
  return { key: 'bronce', label: 'Bronce', rank: 1, publicLabel: 'Familia Bronce' };
}

function teacherRiskFlags(metrics, docs, flags, reviews) {
  return [
    flags.blocked ? 'profile_blocked_or_inactive' : '',
    !flags.adminVerified ? 'admin_verification_missing' : '',
    !docs.identityVerified ? 'identity_not_verified' : '',
    !docs.academicVerified ? 'academic_not_verified' : '',
    metrics.evaluatedClasses < 3 ? 'low_activity_sample' : '',
    reviews.count > 0 && reviews.count < 3 ? 'low_review_sample' : '',
    metrics.openIncidents > 0 ? 'open_incidents' : '',
    (metrics.cancellationRate ?? 0) > 0.2 && metrics.evaluatedClasses >= 5 ? 'high_cancellation_rate' : '',
    metrics.pendingPayments > 0 ? 'payment_or_payout_backlog' : '',
    metrics.inactiveDays !== null && metrics.inactiveDays > 45 ? 'low_recent_activity' : '',
  ].filter(Boolean);
}

function familyRiskFlags(metrics, docs, flags) {
  return [
    flags.blocked ? 'profile_blocked_or_inactive' : '',
    !flags.adminVerified ? 'admin_verification_missing' : '',
    !docs.identityUploaded ? 'guardian_identity_missing' : '',
    metrics.activeStudents < 1 ? 'no_active_students' : '',
    metrics.pendingPayments > 0 ? 'pending_payments' : '',
    metrics.openIncidents > 0 ? 'open_incidents' : '',
    (metrics.cancellationRate ?? 0) > 0.2 && metrics.evaluatedClasses >= 5 ? 'high_cancellation_rate' : '',
  ].filter(Boolean);
}

function buildTrustVisibility(role) {
  return {
    role,
    public: [
      'trustScore',
      'trustLevel',
      'trustLevelLabel',
      'trustBadges[public=true]',
      'publicTrustStats',
    ],
    adminOnly: [
      'trustWarnings',
      'trustComponents',
      'adminTrustStats',
      'trustRiskFlags',
      'pendingPayments',
      'openIncidents',
      'documentPendingCount',
    ],
  };
}

export function buildTeacherTrustProfile(profile = {}, context = {}) {
  const now = asDate(context.now) || new Date();
  const docs = docsSummary(filteredDocuments(profile, context, 'teacher'));
  const flags = statusFlags(profile);
  const completion = profilePercent(profile);
  const years = experienceYears(profile);
  const review = reviewsSummary(profile, context, 'teacher');
  const baseMetrics = teacherOperationalMetrics(profile, context, now);
  const metrics = {
    ...baseMetrics,
    ...definedEntries(context.stats || {}),
  };
  const hasPhoto = hasText(first(profile.foto_url, profile.photoUrl), 20);
  const hasContact = hasText(first(profile.telefono, profile.phone, profile.usuarios?.telefono), 6) || hasText(first(profile.email, profile.usuarios?.email), 6);
  const availability = hasText(first(profile.disponibilidad_resumen, profile.availabilitySummary, profile.disponibilidad), 10)
    || Array.isArray(profile.disponibilidad) && profile.disponibilidad.length > 0
    || Array.isArray(profile.availabilitySlots) && profile.availabilitySlots.length > 0;

  const reliability = (metrics.adjustedCompletionRate ?? 0.78) * 0.72 + (1 - (metrics.adjustedCancellationRate ?? 0.08)) * 0.28;
  const punctuality = metrics.punctualityRate === null || metrics.punctualityRate === undefined
    ? 0.68
    : metrics.punctualityRate * confidence(metrics.punctualitySamples, 10, 0.35) + 0.68 * (1 - confidence(metrics.punctualitySamples, 10, 0.35));
  const regularity = metrics.regularityRate === null || metrics.regularityRate === undefined
    ? 0.58
    : metrics.regularityRate;
  const acceptance = metrics.acceptanceRate === null || metrics.acceptanceRate === undefined ? 0.62 : metrics.acceptanceRate;
  const verificationPoints = (flags.adminVerified ? 5 : 0)
    + (docs.identityVerified ? 5 : docs.identityUploaded ? 2 : 0)
    + (docs.academicVerified ? 4 : docs.academicUploaded ? 2 : 0)
    + (docs.cvUploaded ? 1 : 0)
    + (hasPhoto ? 1.5 : 0)
    + (hasContact ? 1.5 : 0);

  const components = [
    scoreComponent('verification', 'Verificacion objetiva', verificationPoints, 18, `${docs.verifiedCount} documento(s) validados`),
    scoreComponent('profile', 'Perfil profesional', completion * 0.12 + (availability ? 2 : 0) + (hasPhoto ? 1 : 0), 15, `${round(completion)}% completado`),
    scoreComponent('reliability', 'Fiabilidad de clases', reliability * 21 - Math.min(5, metrics.openIncidents * 2) - Math.min(3, metrics.claims), 21, `${metrics.completedClasses} realizadas de ${metrics.evaluatedClasses} evaluadas`),
    scoreComponent('response', 'Respuesta y aceptacion', responseRatio(metrics.averageResponseHours) * 7 + acceptance * 5, 12, metrics.averageResponseHours === null || metrics.averageResponseHours === undefined ? 'Sin historico suficiente' : `${round(metrics.averageResponseHours, 1)}h respuesta media`),
    scoreComponent('track_record', 'Historial real', Math.min(5, metrics.completedClasses / 4) + Math.min(4, metrics.completedHours / 12) + Math.min(3, metrics.activeStudents * 1.5) + regularity * 4, 16, `${metrics.completedHours}h impartidas, ${metrics.activeStudents} alumno(s) activos`),
    scoreComponent('punctuality', 'Puntualidad y compromiso', punctuality * 7 + recentActivityRatio(metrics.inactiveDays) * 3, 10, metrics.punctualitySamples ? `${round((metrics.punctualityRate ?? 0) * 100)}% puntual` : 'Sin check-ins suficientes'),
    scoreComponent('experience', 'Experiencia y valoraciones', Math.min(4, years * 0.8) + ratingRatio(review) * 4 + Math.min(4, review.count / 5), 8, `${years} anio(s), ${review.count} valoracion(es)`),
  ];

  let score = Math.round(components.reduce((sum, item) => sum + item.points, 0));
  if (flags.blocked) score = Math.min(score, 30);
  if (!flags.adminVerified) score = Math.min(score, 82);
  if (!docs.identityUploaded) score = Math.min(score, 74);
  if (metrics.openIncidents > 0) score = Math.min(score, 84);
  score = clamp(score, 0, 100);
  const level = levelForTeacher(score, metrics, docs, flags);
  const riskFlags = teacherRiskFlags(metrics, docs, flags, review);

  const badges = [
    flags.adminVerified ? badge('admin_verified', 'Verificado por ClasesDe10', 'success', 'Perfil revisado por administracion', 'estado verificado') : null,
    docs.identityVerified ? badge('identity_verified', 'Identidad validada', 'success', 'Documento de identidad validado', 'documento identidad validado') : null,
    docs.academicVerified ? badge('academic_verified', 'Formacion validada', 'success', 'Titulo/certificado validado', 'documento academico validado') : null,
    completion >= 95 ? badge('profile_complete', 'Perfil completo', 'success', 'Perfil con datos suficientes para decidir rapido', 'perfil >= 95%') : null,
    metrics.averageResponseHours !== null && metrics.averageResponseHours !== undefined && metrics.averageResponseHours <= 4 && metrics.responseSamples >= 2 ? badge('fast_response', 'Responde rapido', 'success', `${round(metrics.averageResponseHours, 1)}h de media`, 'respuesta media <= 4h') : null,
    (metrics.acceptanceRate ?? 0) >= 0.8 && metrics.offeredRequests >= 3 ? badge('high_acceptance', 'Alta aceptacion', 'success', `${round((metrics.acceptanceRate ?? 0) * 100)}% de solicitudes aceptadas`, 'aceptacion >= 80% con muestra') : null,
    (metrics.completionRate ?? 0) >= 0.9 && metrics.evaluatedClasses >= 8 ? badge('reliable_attendance', 'Alta asistencia', 'success', 'Completa la mayoria de clases programadas', 'realizacion >= 90% con 8 clases') : null,
    (metrics.cancellationRate ?? 1) <= 0.08 && metrics.evaluatedClasses >= 8 ? badge('low_cancellation', 'Pocas cancelaciones', 'success', 'Tasa de cancelacion baja', 'cancelacion <= 8% con 8 clases') : null,
    (metrics.punctualityRate ?? 0) >= 0.9 && metrics.punctualitySamples >= 5 ? badge('punctual', 'Puntualidad contrastada', 'success', 'Check-ins dentro de margen', 'puntualidad >= 90%') : null,
    metrics.completedClasses >= 20 ? badge('track_record', 'Historial contrastado', 'gold', `${metrics.completedClasses} clases registradas`, '20+ clases realizadas') : null,
    metrics.completedHours >= 30 ? badge('hours_verified', '30h+ impartidas', 'info', `${metrics.completedHours} horas registradas`, '30+ horas realizadas') : null,
    regularity >= 0.55 && metrics.activeWeeks >= 4 ? badge('steady_activity', 'Actividad regular', 'info', `${metrics.activeWeeks} semanas activas`, 'actividad semanal sostenida') : null,
    years >= 5 ? badge('experienced', `${round(years, 1)} anios de experiencia`, 'info', 'Experiencia declarada y visible', '5+ anios declarados') : null,
    metrics.openIncidents === 0 && metrics.completedClasses >= 5 ? badge('clean_record', 'Sin incidencias abiertas', 'success', 'No hay incidencias abiertas registradas', '0 incidencias abiertas', false, 'admin') : null,
    profile.acepta_bizum === true || profile.hasBizum === true ? badge('bizum_ready', 'Bizum confirmado', 'info', 'Preparado para cobros por Bizum', 'campo Bizum confirmado', false, 'payments') : null,
  ].filter(Boolean);

  const warnings = [
    flags.pendingReview ? 'Pendiente de verificacion administrativa.' : '',
    !docs.identityUploaded ? 'Falta documento de identidad.' : '',
    docs.identityUploaded && !docs.identityVerified ? 'Identidad subida pendiente de validacion.' : '',
    !docs.academicUploaded ? 'Falta documentacion academica o profesional.' : '',
    docs.academicUploaded && !docs.academicVerified ? 'Formacion subida pendiente de validacion.' : '',
    completion < 85 ? 'Perfil incompleto para generar confianza publica.' : '',
    metrics.evaluatedClasses < 3 ? 'Historico operativo insuficiente: se aplica puntuacion neutra.' : '',
    metrics.openIncidents > 0 ? `${metrics.openIncidents} incidencia(s) abierta(s).` : '',
    metrics.inactiveDays !== null && metrics.inactiveDays > 45 ? 'Actividad reciente baja.' : '',
    (metrics.cancellationRate ?? 0) > 0.2 && metrics.evaluatedClasses >= 5 ? 'Tasa de cancelacion alta.' : '',
  ].filter(Boolean);

  return {
    version: TRUST_VERSION,
    role: 'profesor',
    score,
    trustScore: score,
    level: level.label,
    trustLevel: level.label,
    levelKey: level.key,
    trustLevelKey: level.key,
    levelRank: level.rank,
    publicLevelLabel: level.publicLabel,
    components,
    badges,
    warnings,
    riskFlags,
    signals: [
      signal('level', 'Nivel de reputacion', 'info', level.publicLabel),
      signal('admin_verified', 'Verificacion administrativa', flags.adminVerified ? 'positive' : 'warning', flags.adminVerified ? 'Validado' : 'Pendiente'),
      signal('identity', 'Identidad', docs.identityVerified ? 'positive' : docs.identityUploaded ? 'warning' : 'neutral', docs.identityVerified ? 'Validada' : docs.identityUploaded ? 'Pendiente' : 'No subida'),
      signal('academic', 'Formacion', docs.academicVerified ? 'positive' : docs.academicUploaded ? 'warning' : 'neutral', docs.academicVerified ? 'Validada' : docs.academicUploaded ? 'Pendiente' : 'No subida'),
      signal('history', 'Historial de clases', metrics.completedClasses > 0 ? 'positive' : 'neutral', `${metrics.completedClasses} clase(s), ${metrics.completedHours}h`),
      signal('response', 'Tiempo medio de respuesta', metrics.averageResponseHours !== null && metrics.averageResponseHours !== undefined ? 'positive' : 'neutral', metrics.averageResponseHours !== null && metrics.averageResponseHours !== undefined ? `${round(metrics.averageResponseHours, 1)}h` : 'Sin historico'),
      signal('punctuality', 'Puntualidad', metrics.punctualitySamples ? 'positive' : 'neutral', metrics.punctualitySamples ? `${round((metrics.punctualityRate ?? 0) * 100)}%` : 'Sin muestra suficiente'),
    ],
    metrics: {
      profileCompletionPercent: completion,
      completedClasses: metrics.completedClasses,
      cancelledClasses: metrics.cancelledClasses,
      noShowClasses: metrics.noShowClasses,
      evaluatedClasses: metrics.evaluatedClasses,
      completionRate: metrics.completionRate,
      cancellationRate: metrics.cancellationRate,
      noShowRate: metrics.noShowRate,
      adjustedCompletionRate: metrics.adjustedCompletionRate,
      adjustedCancellationRate: metrics.adjustedCancellationRate,
      completedHours: metrics.completedHours,
      averageResponseHours: metrics.averageResponseHours,
      responseSamples: metrics.responseSamples,
      acceptanceRate: metrics.acceptanceRate,
      acceptedRequests: metrics.acceptedRequests,
      offeredRequests: metrics.offeredRequests,
      activeAssignments: metrics.activeAssignments,
      activeStudents: metrics.activeStudents,
      punctualityRate: metrics.punctualityRate,
      punctualitySamples: metrics.punctualitySamples,
      averageDelayMinutes: metrics.averageDelayMinutes,
      activeWeeks: metrics.activeWeeks,
      regularityRate: metrics.regularityRate,
      paidPayments: metrics.paidPayments,
      pendingPayments: metrics.pendingPayments,
      openIncidents: metrics.openIncidents,
      totalIncidents: metrics.totalIncidents,
      criticalIncidents: metrics.criticalIncidents,
      claims: metrics.claims,
      inactiveDays: metrics.inactiveDays,
      tenureDays: metrics.tenureDays,
      experienceYears: years,
      rating: review.rating,
      reviewsCount: review.count,
      ratingConfidence: review.ratingConfidence,
      verifiedDocuments: docs.verifiedCount,
      pendingDocuments: docs.pendingCount,
      lastActivityAt: metrics.lastActivityAt ? metrics.lastActivityAt.toISOString() : '',
      firstActivityAt: metrics.firstActivityAt ? metrics.firstActivityAt.toISOString() : '',
    },
    publicStats: {
      level: level.publicLabel,
      experienceYears: years,
      completedClasses: metrics.completedClasses,
      completedHours: metrics.completedHours,
      activeStudents: metrics.activeStudents,
      completionRate: metrics.evaluatedClasses >= 3 ? metrics.completionRate : null,
      cancellationRate: metrics.evaluatedClasses >= 3 ? metrics.cancellationRate : null,
      punctualityRate: metrics.punctualitySamples >= 3 ? metrics.punctualityRate : null,
      averageResponseHours: metrics.responseSamples >= 2 ? metrics.averageResponseHours : null,
      acceptanceRate: metrics.offeredRequests >= 3 ? metrics.acceptanceRate : null,
      rating: review.rating,
      reviewsCount: review.count,
      profileCompletionPercent: completion,
      verifiedDocuments: docs.verifiedCount,
      tenureMonths: metrics.tenureDays === null || metrics.tenureDays === undefined ? null : Math.floor(metrics.tenureDays / 30),
      recentlyActive: metrics.inactiveDays === null ? false : metrics.inactiveDays <= 30,
    },
    adminStats: {
      sampleConfidence: confidence(metrics.evaluatedClasses, 16, 0.25),
      reputationCanBeManipulatedByProfileOnly: false,
      sourceCollections: ['profesores', 'documentos', 'clases', 'pagos', 'solicitudes', 'solicitudMatches', 'asignaciones', 'incidencias'],
      riskFlags,
      pendingPayments: metrics.pendingPayments,
      openIncidents: metrics.openIncidents,
      pendingDocuments: docs.pendingCount,
    },
    visibility: buildTrustVisibility('profesor'),
    updatedAtIso: now.toISOString(),
  };
}

export function buildFamilyTrustProfile(profile = {}, context = {}) {
  const now = asDate(context.now) || new Date();
  const docs = docsSummary(filteredDocuments(profile, context, 'family'));
  const flags = statusFlags(profile);
  const completion = profilePercent(profile);
  const metrics = {
    ...familyOperationalMetrics(profile, context, now),
    ...definedEntries(context.stats || {}),
  };
  const hasContact = hasText(first(profile.telefono, profile.phone, profile.usuarios?.telefono), 6) || hasText(first(profile.email, profile.usuarios?.email), 6);
  const hasAddress = hasText(first(profile.direccion, profile.address), 5) && hasText(first(profile.codigo_postal, profile.postalCode), 5);
  const paymentReliability = metrics.adjustedPaymentReliability ?? 0.72;
  const classReliability = (metrics.adjustedCompletionRate ?? 0.75) * 0.72 + (1 - (metrics.adjustedCancellationRate ?? 0.08)) * 0.28;

  const components = [
    scoreComponent('profile', 'Perfil familiar', completion * 0.17 + (hasContact ? 2 : 0) + (hasAddress ? 1 : 0), 20, `${round(completion)}% completado`),
    scoreComponent('identity', 'Contacto e identidad', (hasContact ? 5 : 0) + (hasAddress ? 4 : 0) + (docs.identityVerified ? 5 : docs.identityUploaded ? 2 : 0) + (flags.adminVerified ? 2 : 0), 16, `${docs.verifiedCount} documento(s) validados`),
    scoreComponent('students', 'Alumnos y solicitudes', Math.min(8, metrics.activeStudents * 6) + Math.min(4, metrics.requests.length * 1.2), 12, `${metrics.activeStudents} alumno(s), ${metrics.requests.length} solicitud(es)`),
    scoreComponent('payment', 'Fiabilidad de pagos', paymentReliability * 22 - Math.min(7, metrics.pendingPayments * 2), 22, `${metrics.paidPayments} pago(s) validados`),
    scoreComponent('class_history', 'Compromiso con clases', classReliability * 16 - Math.min(5, metrics.openIncidents * 2), 16, `${metrics.completedClasses} clase(s) realizadas`),
    scoreComponent('activity', 'Actividad y antiguedad', recentActivityRatio(metrics.inactiveDays) * 6 + Math.min(4, (metrics.tenureDays || 0) / 45), 10, metrics.inactiveDays === null || metrics.inactiveDays === undefined ? 'Actividad no registrada' : `Activo hace ${metrics.inactiveDays} dia(s)`),
    scoreComponent('safety', 'Incidencias y calidad', 4 - Math.min(4, metrics.criticalIncidents * 2 + metrics.claims), 4, `${metrics.openIncidents} incidencia(s) abiertas`, 'admin'),
  ];

  let score = Math.round(components.reduce((sum, item) => sum + item.points, 0));
  if (flags.blocked) score = Math.min(score, 30);
  if (metrics.pendingPayments > 0) score = Math.min(score, 86);
  if (metrics.openIncidents > 0) score = Math.min(score, 84);
  score = clamp(score, 0, 100);
  const level = levelForFamily(score, metrics, docs, flags);
  const riskFlags = familyRiskFlags(metrics, docs, flags);

  const badges = [
    flags.adminVerified ? badge('admin_verified', 'Familia validada', 'success', 'Perfil revisado por administracion', 'estado validado') : null,
    docs.identityVerified ? badge('identity_verified', 'Tutor validado', 'success', 'Documento del tutor validado', 'identidad tutor validada') : null,
    completion >= 90 ? badge('profile_complete', 'Perfil completo', 'success', 'Datos suficientes para asignaciones precisas', 'perfil >= 90%') : null,
    metrics.activeStudents > 0 ? badge('students_ready', 'Alumno registrado', 'info', `${metrics.activeStudents} alumno(s) activo(s)`, 'alumno activo') : null,
    (metrics.paymentReliability ?? 0) >= 0.9 && metrics.payments.length >= 2 ? badge('payment_reliable', 'Pagos fiables', 'success', 'Historial de pagos positivo', 'pagos >= 90%') : null,
    (metrics.cancellationRate ?? 0) <= 0.1 && metrics.evaluatedClasses >= 3 ? badge('low_cancellation', 'Buena asistencia', 'success', 'Baja cancelacion', 'cancelacion <= 10%') : null,
    metrics.openIncidents === 0 && metrics.completedClasses >= 3 ? badge('clean_record', 'Sin incidencias abiertas', 'success', 'No hay incidencias abiertas registradas', '0 incidencias abiertas', false, 'admin') : null,
  ].filter(Boolean);

  const warnings = [
    !hasContact ? 'Falta contacto operativo.' : '',
    !hasAddress ? 'Falta direccion o codigo postal para matching presencial.' : '',
    !metrics.activeStudents ? 'Sin alumnos activos.' : '',
    !docs.identityUploaded ? 'Documento de tutor no subido.' : '',
    metrics.pendingPayments > 0 ? `${metrics.pendingPayments} pago(s) pendiente(s).` : '',
    metrics.openIncidents > 0 ? `${metrics.openIncidents} incidencia(s) abierta(s).` : '',
    completion < 80 ? 'Perfil familiar incompleto.' : '',
  ].filter(Boolean);

  return {
    version: TRUST_VERSION,
    role: 'familia',
    score,
    trustScore: score,
    level: level.label,
    trustLevel: level.label,
    levelKey: level.key,
    trustLevelKey: level.key,
    levelRank: level.rank,
    publicLevelLabel: level.publicLabel,
    components,
    badges,
    warnings,
    riskFlags,
    signals: [
      signal('level', 'Nivel de reputacion', 'info', level.publicLabel),
      signal('contact', 'Contacto operativo', hasContact ? 'positive' : 'warning', hasContact ? 'Completo' : 'Pendiente'),
      signal('identity', 'Identidad tutor', docs.identityVerified ? 'positive' : docs.identityUploaded ? 'warning' : 'neutral', docs.identityVerified ? 'Validada' : docs.identityUploaded ? 'Pendiente' : 'No subida'),
      signal('students', 'Alumno registrado', metrics.activeStudents > 0 ? 'positive' : 'warning', `${metrics.activeStudents} activo(s)`),
      signal('payments', 'Pagos', metrics.pendingPayments ? 'warning' : 'positive', metrics.pendingPayments ? `${metrics.pendingPayments} pendiente(s)` : 'Sin pagos pendientes'),
      signal('classes', 'Historial de clases', metrics.completedClasses > 0 ? 'positive' : 'neutral', `${metrics.completedClasses} clase(s)`),
    ],
    metrics: {
      profileCompletionPercent: completion,
      activeStudents: metrics.activeStudents,
      completedClasses: metrics.completedClasses,
      cancelledClasses: metrics.cancelledClasses,
      noShowClasses: metrics.noShowClasses,
      evaluatedClasses: metrics.evaluatedClasses,
      completionRate: metrics.completionRate,
      cancellationRate: metrics.cancellationRate,
      adjustedCompletionRate: metrics.adjustedCompletionRate,
      adjustedCancellationRate: metrics.adjustedCancellationRate,
      completedHours: metrics.completedHours,
      paidPayments: metrics.paidPayments,
      pendingPayments: metrics.pendingPayments,
      paymentReliability: metrics.paymentReliability,
      adjustedPaymentReliability: metrics.adjustedPaymentReliability,
      openIncidents: metrics.openIncidents,
      totalIncidents: metrics.totalIncidents,
      criticalIncidents: metrics.criticalIncidents,
      claims: metrics.claims,
      inactiveDays: metrics.inactiveDays,
      tenureDays: metrics.tenureDays,
      verifiedDocuments: docs.verifiedCount,
      pendingDocuments: docs.pendingCount,
      lastActivityAt: metrics.lastActivityAt ? metrics.lastActivityAt.toISOString() : '',
      firstActivityAt: metrics.firstActivityAt ? metrics.firstActivityAt.toISOString() : '',
    },
    publicStats: {
      level: level.publicLabel,
      activeStudents: metrics.activeStudents,
      completedClasses: metrics.completedClasses,
      completedHours: metrics.completedHours,
      paymentReliability: metrics.payments.length >= 2 ? metrics.paymentReliability : null,
      cancellationRate: metrics.evaluatedClasses >= 3 ? metrics.cancellationRate : null,
      profileCompletionPercent: completion,
      verifiedDocuments: docs.verifiedCount,
      tenureMonths: metrics.tenureDays === null || metrics.tenureDays === undefined ? null : Math.floor(metrics.tenureDays / 30),
      recentlyActive: metrics.inactiveDays === null ? false : metrics.inactiveDays <= 30,
    },
    adminStats: {
      sampleConfidence: confidence(metrics.evaluatedClasses, 12, 0.25),
      reputationCanBeManipulatedByProfileOnly: false,
      sourceCollections: ['familias', 'documentos', 'alumnos', 'clases', 'pagos', 'solicitudes', 'asignaciones', 'incidencias'],
      riskFlags,
      pendingPayments: metrics.pendingPayments,
      openIncidents: metrics.openIncidents,
      pendingDocuments: docs.pendingCount,
    },
    visibility: buildTrustVisibility('familia'),
    updatedAtIso: now.toISOString(),
  };
}

export function buildTrustSnapshotPatch(trustProfile) {
  return {
    trustScore: trustProfile.score,
    trustLevel: trustProfile.level,
    trustLevelKey: trustProfile.levelKey,
    trustLevelRank: trustProfile.levelRank,
    trustLevelLabel: trustProfile.publicLevelLabel,
    trustVersion: trustProfile.version,
    trustUpdatedAtIso: trustProfile.updatedAtIso,
    trustBadges: trustProfile.badges,
    trustWarnings: trustProfile.warnings,
    trustComponents: trustProfile.components,
    trustSignals: trustProfile.signals,
    trustRiskFlags: trustProfile.riskFlags,
    trustVisibility: trustProfile.visibility,
    reputationMetrics: trustProfile.metrics,
    publicTrustStats: trustProfile.publicStats,
    adminTrustStats: trustProfile.adminStats,
  };
}

export function summarizeTrustForDisplay(trustProfile) {
  return {
    score: trustProfile.score,
    level: trustProfile.level,
    levelKey: trustProfile.levelKey,
    levelLabel: trustProfile.publicLevelLabel,
    topBadges: trustProfile.badges.filter((item) => item.public !== false).slice(0, 6),
    publicStats: trustProfile.publicStats,
    warnings: trustProfile.warnings.slice(0, 4),
    riskFlags: trustProfile.riskFlags.slice(0, 6),
  };
}
