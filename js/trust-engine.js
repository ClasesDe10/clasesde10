/**
 * ClasesDe10 trust and reputation engine.
 *
 * Pure deterministic scoring used by dashboards, matching and automation.
 * It never invents facts: every badge and public stat comes from profile data,
 * admin verification, documents or operational history.
 */

export const TRUST_VERSION = 'trust_reputation_v1';

const VERIFIED_STATUSES = new Set(['validado', 'verificado', 'aprobado', 'approved', 'verified']);
const PENDING_STATUSES = new Set(['pendiente', 'pending', 'en_revision', 'review']);
const COMPLETED_CLASS_STATUSES = new Set(['realizada', 'completed', 'completada', 'pagada', 'paid']);
const CANCELLED_CLASS_STATUSES = new Set(['cancelada', 'cancelled', 'canceled', 'no_realizada']);
const PAID_PAYMENT_STATUSES = new Set(['pagado', 'paid', 'validado', 'verified', 'succeeded', 'completado']);
const PENDING_PAYMENT_STATUSES = new Set(['pendiente', 'pending', 'vencido', 'overdue', 'review']);

export function cleanTrustText(value, max = 500) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function lower(value) {
  return cleanTrustText(value).toLowerCase();
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

function percent01(value) {
  const number = numberOrNull(value);
  if (number === null) return null;
  return number > 1 ? clamp(number / 100, 0, 1) : clamp(number, 0, 1);
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
  return values
    .map(asDate)
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;
}

function daysSince(value, now = new Date()) {
  const date = asDate(value);
  if (!date) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86400000));
}

function hoursBetween(start, end) {
  const startDate = asDate(start);
  const endDate = asDate(end);
  if (!startDate || !endDate) return null;
  return Math.max(0, (endDate.getTime() - startDate.getTime()) / 3600000);
}

function average(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function definedEntries(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null));
}

function idsFor(entity = {}, role = 'teacher') {
  const values = role === 'family'
    ? [
      entity.id,
      entity.familyUid,
      entity.familia_id,
      entity.userUid,
      entity.usuario_id,
      entity.uid,
    ]
    : [
      entity.id,
      entity.teacherUid,
      entity.profesor_id,
      entity.userUid,
      entity.usuario_id,
      entity.uid,
    ];
  return new Set(values.map((value) => cleanTrustText(value, 180)).filter(Boolean));
}

function itemMatchesAnyId(item = {}, ids, fields) {
  return fields.some((field) => ids.has(cleanTrustText(item[field], 180)));
}

function classStatus(item = {}) {
  return lower(first(item.status, item.estado, item.lifecycleStatus));
}

function paymentStatus(item = {}) {
  return lower(first(item.status, item.estado, item.paymentStatus, item.estado_pago, item.familyPaymentStatus, item.estado_pago_familia));
}

function documentStatus(item = {}) {
  return lower(first(item.estado, item.status, item.verificationStatus));
}

function documentType(item = {}) {
  return lower(first(item.tipo, item.documentType, item.category));
}

function activeStatus(entity = {}) {
  return lower(first(entity.estado_verificacion, entity.verificationStatus, entity.status, entity.estado));
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
  const text = lower(first(entity.experiencia, entity.bio, entity.presentacion));
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(anos|anios|years|a\u00f1os)/);
  return match ? Number(match[1].replace(',', '.')) : 0;
}

function hasText(value, min = 1) {
  return cleanTrustText(value).length >= min;
}

function badge(key, label, tone = 'neutral', detail = '', publicVisible = true) {
  return { key, label, tone, detail, public: publicVisible };
}

function signal(key, label, state, detail = '', publicVisible = true) {
  return { key, label, state, detail, public: publicVisible };
}

function trustLevel(score) {
  if (score >= 90) return 'destacado';
  if (score >= 78) return 'alto';
  if (score >= 60) return 'medio';
  return 'inicial';
}

function scoreComponent(key, label, points, max, detail = '') {
  return {
    key,
    label,
    points: round(clamp(points, 0, max), 1),
    max,
    detail,
  };
}

function docsSummary(docs = []) {
  const identityDocs = docs.filter((doc) => ['dni', 'identidad', 'pasaporte', 'tutor'].includes(documentType(doc)));
  const academicDocs = docs.filter((doc) => ['titulo', 'certificado', 'certificacion', 'academic', 'cv', 'curriculum'].includes(documentType(doc)));
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
  };
}

function teacherOperationalMetrics(profile, context, now) {
  const ids = idsFor(profile, 'teacher');
  const classes = (context.classes || []).filter((item) => itemMatchesAnyId(item, ids, ['teacherUid', 'profesor_id', 'teacherUserUid', 'usuario_profesor_id']));
  const payments = (context.payments || []).filter((item) => itemMatchesAnyId(item, ids, ['teacherUid', 'profesor_id', 'userUid', 'usuario_id']));
  const matches = (context.matches || context.requestMatches || []).filter((item) => itemMatchesAnyId(item, ids, ['teacherUid', 'profesor_id', 'teacherUserUid']));
  const assignments = (context.assignments || []).filter((item) => itemMatchesAnyId(item, ids, ['teacherUid', 'profesor_id', 'teacherUserUid']));
  const requests = context.requests || [];
  const incidents = (context.incidents || []).filter((item) => itemMatchesAnyId(item, ids, ['teacherUid', 'profesor_id', 'reportedTeacherUid']));

  const completed = classes.filter((item) => COMPLETED_CLASS_STATUSES.has(classStatus(item)));
  const cancelled = classes.filter((item) => CANCELLED_CLASS_STATUSES.has(classStatus(item)));
  const evaluated = classes.filter((item) => COMPLETED_CLASS_STATUSES.has(classStatus(item)) || CANCELLED_CLASS_STATUSES.has(classStatus(item)));
  const completionRate = percent01(first(profile.completionRate, profile.classCompletionRate, profile.ratio_clases_realizadas))
    ?? (evaluated.length ? completed.length / evaluated.length : null);
  const cancellationRate = percent01(first(profile.cancellationRate, profile.cancelRate, profile.ratio_cancelacion))
    ?? (evaluated.length ? cancelled.length / evaluated.length : null);

  const responseFromProfile = numberOrNull(first(profile.responseTimeHours, profile.averageResponseHours, profile.tiempo_respuesta_horas));
  const responseDurations = matches
    .map((item) => hoursBetween(first(item.createdAt, item.created_at, item.offeredAt), first(item.respondedAt, item.acceptedAt, item.selectedAt, item.updatedAt)))
    .filter(Number.isFinite);
  const requestDurations = requests
    .filter((item) => itemMatchesAnyId(item, ids, ['assignedTeacherUid', 'profesor_asignado_id']))
    .map((item) => hoursBetween(first(item.createdAt, item.created_at), first(item.assignedAt, item.fecha_asignacion, item.updatedAt)))
    .filter(Number.isFinite);
  const averageResponseHours = responseFromProfile ?? average([...responseDurations, ...requestDurations]);

  const accepted = numberOrNull(first(profile.acceptedRequests, profile.solicitudesAceptadas, profile.acceptedAssignments))
    ?? matches.filter((item) => ['aceptado', 'accepted', 'asignado', 'selected', 'asignada'].includes(classStatus(item))).length;
  const offered = numberOrNull(first(profile.offeredRequests, profile.solicitudesOfrecidas, profile.totalRequests))
    ?? matches.length;
  const acceptanceRate = percent01(first(profile.acceptanceRate, profile.ratio_aceptacion))
    ?? (offered ? accepted / offered : null);

  const paid = payments.filter((item) => PAID_PAYMENT_STATUSES.has(paymentStatus(item)));
  const pendingPayments = payments.filter((item) => PENDING_PAYMENT_STATUSES.has(paymentStatus(item)));
  const lastActivityAt = latestDate([
    profile.lastLoginAt,
    profile.lastActiveAt,
    profile.updatedAt,
    profile.updated_at,
    ...classes.map((item) => first(item.fecha, item.date, item.createdAt, item.updatedAt)),
    ...assignments.map((item) => first(item.createdAt, item.updatedAt)),
    ...payments.map((item) => first(item.createdAt, item.updatedAt, item.paidAt)),
  ]);

  return {
    classes,
    payments,
    matches,
    assignments,
    requests,
    incidents,
    completedClasses: completed.length,
    cancelledClasses: cancelled.length,
    evaluatedClasses: evaluated.length,
    completionRate,
    cancellationRate,
    averageResponseHours,
    acceptanceRate,
    paidPayments: paid.length,
    pendingPayments: pendingPayments.length,
    openIncidents: incidents.filter((item) => !['cerrada', 'resuelta', 'closed', 'resolved'].includes(classStatus(item))).length,
    activeAssignments: assignments.filter((item) => item.active !== false && item.activa !== false).length,
    lastActivityAt,
    inactiveDays: daysSince(lastActivityAt, now),
  };
}

function familyOperationalMetrics(profile, context, now) {
  const ids = idsFor(profile, 'family');
  const students = Array.isArray(context.studentsForOwner)
    ? context.studentsForOwner
    : (context.students || context.alumnos || []).filter((item) => itemMatchesAnyId(item, ids, ['familyUid', 'familia_id', 'parentUid']));
  const classes = (context.classes || []).filter((item) => itemMatchesAnyId(item, ids, ['familyUid', 'familia_id', 'parentUid']));
  const payments = (context.payments || []).filter((item) => itemMatchesAnyId(item, ids, ['familyUid', 'familia_id', 'userUid', 'usuario_id']));
  const requests = (context.requests || []).filter((item) => itemMatchesAnyId(item, ids, ['familyUid', 'familia_id', 'userUid', 'usuario_id']));
  const assignments = (context.assignments || []).filter((item) => itemMatchesAnyId(item, ids, ['familyUid', 'familia_id']));
  const incidents = (context.incidents || []).filter((item) => itemMatchesAnyId(item, ids, ['familyUid', 'familia_id', 'reportedFamilyUid']));

  const completed = classes.filter((item) => COMPLETED_CLASS_STATUSES.has(classStatus(item)));
  const cancelled = classes.filter((item) => CANCELLED_CLASS_STATUSES.has(classStatus(item)));
  const evaluated = classes.filter((item) => COMPLETED_CLASS_STATUSES.has(classStatus(item)) || CANCELLED_CLASS_STATUSES.has(classStatus(item)));
  const paid = payments.filter((item) => PAID_PAYMENT_STATUSES.has(paymentStatus(item)));
  const pendingPayments = payments.filter((item) => PENDING_PAYMENT_STATUSES.has(paymentStatus(item)));
  const paymentReliability = payments.length ? paid.length / payments.length : null;
  const completionRate = evaluated.length ? completed.length / evaluated.length : null;
  const cancellationRate = evaluated.length ? cancelled.length / evaluated.length : null;
  const lastActivityAt = latestDate([
    profile.lastLoginAt,
    profile.lastActiveAt,
    profile.updatedAt,
    profile.updated_at,
    ...students.map((item) => first(item.createdAt, item.updatedAt)),
    ...classes.map((item) => first(item.fecha, item.date, item.createdAt, item.updatedAt)),
    ...requests.map((item) => first(item.createdAt, item.updatedAt)),
    ...payments.map((item) => first(item.createdAt, item.updatedAt, item.paidAt)),
  ]);

  return {
    students,
    classes,
    payments,
    requests,
    assignments,
    incidents,
    activeStudents: students.filter((item) => item.active !== false && item.activo !== false).length,
    completedClasses: completed.length,
    cancelledClasses: cancelled.length,
    evaluatedClasses: evaluated.length,
    completionRate,
    cancellationRate,
    paidPayments: paid.length,
    pendingPayments: pendingPayments.length,
    paymentReliability,
    openIncidents: incidents.filter((item) => !['cerrada', 'resuelta', 'closed', 'resolved'].includes(classStatus(item))).length,
    lastActivityAt,
    inactiveDays: daysSince(lastActivityAt, now),
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

export function buildTeacherTrustProfile(profile = {}, context = {}) {
  const now = asDate(context.now) || new Date();
  const docs = docsSummary(filteredDocuments(profile, context, 'teacher'));
  const metrics = {
    ...teacherOperationalMetrics(profile, context, now),
    ...definedEntries(context.stats || {}),
  };
  const status = activeStatus(profile);
  const adminVerified = ['verificado', 'verified', 'activo', 'active'].includes(status);
  const completion = profilePercent(profile);
  const years = experienceYears(profile);
  const rating = numberOrNull(first(profile.valoracion_media, profile.averageRating, profile.rating));
  const reviewsCount = numberOrNull(first(profile.reviewsCount, profile.valoraciones_count, profile.totalReviews)) || 0;
  const availability = hasText(first(profile.disponibilidad_resumen, profile.availabilitySummary, profile.disponibilidad), 10)
    || Array.isArray(profile.disponibilidad) && profile.disponibilidad.length > 0
    || Array.isArray(profile.availabilitySlots) && profile.availabilitySlots.length > 0;
  const hasPhoto = hasText(first(profile.foto_url, profile.photoUrl), 20);
  const hasContact = hasText(first(profile.telefono, profile.phone, profile.usuarios?.telefono), 6) || hasText(first(profile.email, profile.usuarios?.email), 6);
  const active = profile.active !== false && profile.activo !== false;

  const reliabilityRatio = metrics.completionRate ?? (metrics.completedClasses ? 0.82 : 0.68);
  const cancellationRatio = metrics.cancellationRate ?? 0.08;
  const responseRatio = metrics.averageResponseHours === null || metrics.averageResponseHours === undefined
    ? 0.72
    : metrics.averageResponseHours <= 2
      ? 1
      : metrics.averageResponseHours <= 8
        ? 0.78
        : metrics.averageResponseHours <= 24
          ? 0.48
          : 0.18;
  const acceptanceRatio = metrics.acceptanceRate ?? 0.72;
  const recentRatio = metrics.inactiveDays === null || metrics.inactiveDays === undefined
    ? 0.6
    : metrics.inactiveDays <= 7
      ? 1
      : metrics.inactiveDays <= 30
        ? 0.72
        : metrics.inactiveDays <= 90
          ? 0.35
          : 0.12;

  const components = [
    scoreComponent('profile', 'Perfil completo', completion * 0.29, 29, `${round(completion)}% completado`),
    scoreComponent('verification', 'Verificaciones', (adminVerified ? 8 : 0) + (docs.identityVerified ? 6 : docs.identityUploaded ? 2 : 0) + (docs.academicVerified ? 6 : docs.academicUploaded ? 3 : 0) + (hasPhoto ? 3 : 0) + (hasContact ? 3 : 0), 24, `${docs.verifiedCount} documento(s) validados`),
    scoreComponent('reliability', 'Clases realizadas', reliabilityRatio * 16 + (1 - clamp(cancellationRatio, 0, 1)) * 7 - Math.min(5, metrics.openIncidents * 2), 23, `${metrics.completedClasses} clase(s), ${round((metrics.completionRate ?? 0) * 100)}% realizadas`),
    scoreComponent('response', 'Respuesta y disponibilidad', responseRatio * 8 + acceptanceRatio * 6 + (availability ? 4 : 0), 18, metrics.averageResponseHours === null || metrics.averageResponseHours === undefined ? 'Sin historico de respuesta' : `${round(metrics.averageResponseHours, 1)}h respuesta media`),
    scoreComponent('experience', 'Experiencia y valoraciones', Math.min(6, years * 1.2) + (rating !== null ? clamp(rating, 0, 5) : 3) + Math.min(4, reviewsCount / 3) + Math.min(4, metrics.completedClasses / 10), 18, `${years} anio(s), ${reviewsCount} valoracion(es)`),
    scoreComponent('activity', 'Actividad reciente', recentRatio * 7 + (active ? 4 : 0) + (hasContact ? 3 : 0), 14, metrics.inactiveDays === null || metrics.inactiveDays === undefined ? 'Actividad no registrada' : `Activo hace ${metrics.inactiveDays} dia(s)`),
  ];

  const score = Math.max(0, Math.min(100, Math.round(components.reduce((sum, item) => sum + item.points, 0))));
  const badges = [
    adminVerified ? badge('admin_verified', 'Verificado por ClasesDe10', 'success', 'Perfil revisado por administracion') : null,
    docs.identityVerified ? badge('identity_verified', 'Identidad validada', 'success', 'Documento de identidad validado') : docs.identityUploaded ? badge('identity_pending', 'Identidad pendiente', 'warning', 'Documento subido pendiente de validacion') : null,
    docs.academicVerified ? badge('academic_verified', 'Formacion validada', 'success', 'Titulo/certificado validado') : docs.academicUploaded ? badge('academic_pending', 'Formacion pendiente', 'warning', 'Documento academico pendiente') : null,
    completion >= 95 ? badge('profile_complete', 'Perfil completo', 'success', 'Datos completos para decision rapida') : null,
    years >= 5 ? badge('experienced', `${round(years, 1)} anios de experiencia`, 'info', 'Experiencia declarada') : null,
    metrics.completedClasses >= 20 ? badge('track_record', 'Historial contrastado', 'success', `${metrics.completedClasses} clases registradas`) : null,
    (metrics.completionRate ?? 0) >= 0.9 && metrics.completedClasses >= 5 ? badge('reliable_attendance', 'Alta asistencia', 'success', 'Porcentaje alto de clases realizadas') : null,
    (metrics.cancellationRate ?? 1) <= 0.08 && metrics.evaluatedClasses >= 5 ? badge('low_cancellation', 'Pocas cancelaciones', 'success', 'Tasa de cancelacion baja') : null,
    metrics.averageResponseHours !== null && metrics.averageResponseHours !== undefined && metrics.averageResponseHours <= 4 ? badge('fast_response', 'Responde rapido', 'success', `${round(metrics.averageResponseHours, 1)}h de media`) : null,
    profile.destacado === true || profile.featured === true || score >= 90 ? badge('featured', 'Perfil destacado', 'gold', 'Score de confianza sobresaliente') : null,
    profile.acepta_bizum === true || profile.hasBizum === true ? badge('bizum_ready', 'Bizum confirmado', 'info', 'Preparado para cobros por Bizum', false) : null,
  ].filter(Boolean);

  const warnings = [
    !adminVerified ? 'Pendiente de verificacion administrativa.' : '',
    !docs.identityUploaded ? 'Falta documento de identidad.' : '',
    !docs.academicUploaded ? 'Falta documentacion academica o profesional.' : '',
    completion < 85 ? 'Perfil incompleto para generar confianza publica.' : '',
    metrics.openIncidents > 0 ? `${metrics.openIncidents} incidencia(s) abierta(s).` : '',
    metrics.inactiveDays !== null && metrics.inactiveDays > 45 ? 'Actividad reciente baja.' : '',
    (metrics.cancellationRate ?? 0) > 0.2 ? 'Tasa de cancelacion alta.' : '',
  ].filter(Boolean);

  return {
    version: TRUST_VERSION,
    role: 'profesor',
    score,
    trustScore: score,
    level: trustLevel(score),
    trustLevel: trustLevel(score),
    components,
    badges,
    warnings,
    signals: [
      signal('admin_verified', 'Verificacion administrativa', adminVerified ? 'positive' : 'warning', adminVerified ? 'Validado' : 'Pendiente'),
      signal('identity', 'Identidad', docs.identityVerified ? 'positive' : docs.identityUploaded ? 'warning' : 'neutral', docs.identityVerified ? 'Validada' : docs.identityUploaded ? 'Pendiente' : 'No subida'),
      signal('academic', 'Formacion', docs.academicVerified ? 'positive' : docs.academicUploaded ? 'warning' : 'neutral', docs.academicVerified ? 'Validada' : docs.academicUploaded ? 'Pendiente' : 'No subida'),
      signal('history', 'Historial de clases', metrics.completedClasses > 0 ? 'positive' : 'neutral', `${metrics.completedClasses} clase(s) realizadas`),
      signal('response', 'Tiempo medio de respuesta', metrics.averageResponseHours !== null && metrics.averageResponseHours !== undefined ? 'positive' : 'neutral', metrics.averageResponseHours !== null && metrics.averageResponseHours !== undefined ? `${round(metrics.averageResponseHours, 1)}h` : 'Sin historico'),
      signal('cancellation', 'Tasa de cancelacion', (metrics.cancellationRate ?? 0) <= 0.1 ? 'positive' : 'warning', `${round((metrics.cancellationRate ?? 0) * 100)}%`),
    ],
    metrics: {
      profileCompletionPercent: completion,
      completedClasses: metrics.completedClasses,
      evaluatedClasses: metrics.evaluatedClasses,
      completionRate: metrics.completionRate,
      cancellationRate: metrics.cancellationRate,
      averageResponseHours: metrics.averageResponseHours,
      acceptanceRate: metrics.acceptanceRate,
      activeAssignments: metrics.activeAssignments,
      pendingPayments: metrics.pendingPayments,
      openIncidents: metrics.openIncidents,
      inactiveDays: metrics.inactiveDays,
      experienceYears: years,
      rating,
      reviewsCount,
      verifiedDocuments: docs.verifiedCount,
      pendingDocuments: docs.pendingCount,
      lastActivityAt: metrics.lastActivityAt ? metrics.lastActivityAt.toISOString() : '',
    },
    publicStats: {
      experienceYears: years,
      completedClasses: metrics.completedClasses,
      completionRate: metrics.completionRate,
      cancellationRate: metrics.cancellationRate,
      averageResponseHours: metrics.averageResponseHours,
      acceptanceRate: metrics.acceptanceRate,
      rating,
      reviewsCount,
      profileCompletionPercent: completion,
      verifiedDocuments: docs.verifiedCount,
      lastActivityDays: metrics.inactiveDays,
    },
    updatedAtIso: now.toISOString(),
  };
}

export function buildFamilyTrustProfile(profile = {}, context = {}) {
  const now = asDate(context.now) || new Date();
  const docs = docsSummary(filteredDocuments(profile, context, 'family'));
  const metrics = {
    ...familyOperationalMetrics(profile, context, now),
    ...definedEntries(context.stats || {}),
  };
  const status = activeStatus(profile);
  const adminVerified = ['verificado', 'verified', 'activo', 'active'].includes(status);
  const completion = profilePercent(profile);
  const hasContact = hasText(first(profile.telefono, profile.phone, profile.usuarios?.telefono), 6) || hasText(first(profile.email, profile.usuarios?.email), 6);
  const hasAddress = hasText(first(profile.direccion, profile.address), 5) && hasText(first(profile.codigo_postal, profile.postalCode), 5);
  const active = profile.active !== false && profile.activo !== false;
  const paymentRatio = metrics.paymentReliability ?? (metrics.payments.length ? 0.45 : 0.68);
  const completionRatio = metrics.completionRate ?? (metrics.completedClasses ? 0.82 : 0.6);
  const cancellationRatio = metrics.cancellationRate ?? 0.06;
  const recentRatio = metrics.inactiveDays === null || metrics.inactiveDays === undefined
    ? 0.45
    : metrics.inactiveDays <= 7
      ? 1
      : metrics.inactiveDays <= 30
        ? 0.72
        : metrics.inactiveDays <= 90
          ? 0.35
          : 0.12;

  const components = [
    scoreComponent('profile', 'Perfil familiar', completion * 0.22, 22, `${round(completion)}% completado`),
    scoreComponent('identity', 'Contacto e identidad', (hasContact ? 8 : 0) + (hasAddress ? 6 : 0) + (docs.identityVerified ? 6 : docs.identityUploaded ? 3 : 0) + (adminVerified ? 4 : 0), 24, `${docs.verifiedCount} documento(s) validados`),
    scoreComponent('students', 'Alumnos y solicitudes', Math.min(10, metrics.activeStudents * 8) + Math.min(6, metrics.requests.length * 1.5), 16, `${metrics.activeStudents} alumno(s), ${metrics.requests.length} solicitud(es)`),
    scoreComponent('payment', 'Fiabilidad de pagos', paymentRatio * 18 - Math.min(5, metrics.pendingPayments * 1.5), 18, `${metrics.paidPayments} pago(s) validados`),
    scoreComponent('class_history', 'Historial de clases', completionRatio * 10 + (1 - clamp(cancellationRatio, 0, 1)) * 4 - Math.min(4, metrics.openIncidents * 1.5), 14, `${metrics.completedClasses} clase(s) realizadas`),
    scoreComponent('activity', 'Actividad reciente', recentRatio * 4 + (active ? 2 : 0), 6, metrics.inactiveDays === null || metrics.inactiveDays === undefined ? 'Actividad no registrada' : `Activo hace ${metrics.inactiveDays} dia(s)`),
  ];

  const score = Math.max(0, Math.min(100, Math.round(components.reduce((sum, item) => sum + item.points, 0))));
  const badges = [
    adminVerified ? badge('admin_verified', 'Familia validada', 'success', 'Perfil revisado por administracion') : null,
    docs.identityVerified ? badge('identity_verified', 'Tutor validado', 'success', 'Documento del tutor validado') : docs.identityUploaded ? badge('identity_pending', 'Tutor pendiente', 'warning', 'Documento pendiente de validacion') : null,
    completion >= 90 ? badge('profile_complete', 'Perfil completo', 'success', 'Datos suficientes para asignaciones precisas') : null,
    metrics.activeStudents > 0 ? badge('students_ready', 'Alumno registrado', 'info', `${metrics.activeStudents} alumno(s) activo(s)`) : null,
    paymentRatio >= 0.9 && metrics.payments.length >= 2 ? badge('payment_reliable', 'Pagos fiables', 'success', 'Historial de pagos positivo') : null,
    (metrics.cancellationRate ?? 0) <= 0.1 && metrics.evaluatedClasses >= 3 ? badge('low_cancellation', 'Buena asistencia', 'success', 'Baja cancelacion') : null,
  ].filter(Boolean);

  const warnings = [
    !hasContact ? 'Falta contacto operativo.' : '',
    !hasAddress ? 'Falta direccion o codigo postal para matching presencial.' : '',
    !metrics.activeStudents ? 'Sin alumnos activos.' : '',
    metrics.pendingPayments > 0 ? `${metrics.pendingPayments} pago(s) pendiente(s).` : '',
    metrics.openIncidents > 0 ? `${metrics.openIncidents} incidencia(s) abierta(s).` : '',
    completion < 80 ? 'Perfil familiar incompleto.' : '',
  ].filter(Boolean);

  return {
    version: TRUST_VERSION,
    role: 'familia',
    score,
    trustScore: score,
    level: trustLevel(score),
    trustLevel: trustLevel(score),
    components,
    badges,
    warnings,
    signals: [
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
      evaluatedClasses: metrics.evaluatedClasses,
      completionRate: metrics.completionRate,
      cancellationRate: metrics.cancellationRate,
      paidPayments: metrics.paidPayments,
      pendingPayments: metrics.pendingPayments,
      paymentReliability: metrics.paymentReliability,
      openIncidents: metrics.openIncidents,
      inactiveDays: metrics.inactiveDays,
      verifiedDocuments: docs.verifiedCount,
      pendingDocuments: docs.pendingCount,
      lastActivityAt: metrics.lastActivityAt ? metrics.lastActivityAt.toISOString() : '',
    },
    publicStats: {
      activeStudents: metrics.activeStudents,
      completedClasses: metrics.completedClasses,
      paymentReliability: metrics.paymentReliability,
      cancellationRate: metrics.cancellationRate,
      profileCompletionPercent: completion,
      verifiedDocuments: docs.verifiedCount,
      lastActivityDays: metrics.inactiveDays,
    },
    updatedAtIso: now.toISOString(),
  };
}

export function buildTrustSnapshotPatch(trustProfile) {
  return {
    trustScore: trustProfile.score,
    trustLevel: trustProfile.level,
    trustVersion: trustProfile.version,
    trustUpdatedAtIso: trustProfile.updatedAtIso,
    trustBadges: trustProfile.badges,
    trustWarnings: trustProfile.warnings,
    trustComponents: trustProfile.components,
    reputationMetrics: trustProfile.metrics,
    publicTrustStats: trustProfile.publicStats,
  };
}

export function summarizeTrustForDisplay(trustProfile) {
  return {
    score: trustProfile.score,
    level: trustProfile.level,
    topBadges: trustProfile.badges.filter((item) => item.public !== false).slice(0, 5),
    publicStats: trustProfile.publicStats,
    warnings: trustProfile.warnings.slice(0, 4),
  };
}
