/**
 * Finance ERP engine for ClasesDe10.
 *
 * Provider-neutral calculations used by the admin dashboard and automation
 * worker. It does not create money movements; it normalizes existing classes,
 * payments and teacher rate rules into decision-grade financial metrics.
 */

export const FINANCE_ERP_VERSION = 'finance-erp-2026-06-28';

export const FINANCE_ANOMALY_TYPES = Object.freeze([
  'missing_amount',
  'negative_margin',
  'low_margin',
  'payment_overdue',
  'teacher_payout_overdue',
  'unreconciled_payment',
  'orphan_payment',
]);

const PAID_STATUSES = Object.freeze(['validado', 'pagado', 'paid', 'validated', 'succeeded', 'captured']);
const OPEN_STATUSES = Object.freeze(['pendiente', 'solicitado', 'procesando', 'requiere_accion', 'pending', 'requested', 'processing']);
const COMPLETED_CLASS_STATUSES = Object.freeze(['realizada', 'completada', 'completed', 'dada']);
const SCHEDULED_CLASS_STATUSES = Object.freeze(['programada', 'confirmada', 'scheduled', 'confirmed', 'reprogramada']);
const CANCELLED_CLASS_STATUSES = Object.freeze(['cancelada', 'cancelled', 'anulada']);

function clean(value, max = 500) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function lower(value, max = 500) {
  return clean(value, max).toLowerCase();
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : null;
}

function durationFactor(durationMinutes = 60) {
  const minutes = Number(durationMinutes);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 60) / 60;
}

function amountFromHourly(hourlyRate, durationMinutes = 60) {
  const hourly = numberOrNull(hourlyRate);
  return hourly === null ? null : money(hourly * durationFactor(durationMinutes));
}

function hourlyFromAmount(amount, durationMinutes = 60) {
  const total = numberOrNull(amount);
  const factor = durationFactor(durationMinutes);
  return total === null || factor <= 0 ? null : money(total / factor);
}

function percent(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;
}

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function dateToIso(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function dateOnly(value) {
  const iso = dateToIso(value);
  return iso ? iso.slice(0, 10) : '';
}

function monthKey(value) {
  const date = dateOnly(value);
  return date ? date.slice(0, 7) : '';
}

function startOfMonth(month) {
  return `${month}-01`;
}

function endOfMonth(month) {
  const [year, rawMonth] = String(month || '').split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(rawMonth)) return '';
  return new Date(year, rawMonth, 0).toISOString().slice(0, 10);
}

function previousMonth(month) {
  const [year, rawMonth] = String(month || '').split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(rawMonth)) return '';
  const date = new Date(Date.UTC(year, rawMonth - 2, 1));
  return date.toISOString().slice(0, 7);
}

function daysInMonth(month) {
  const end = endOfMonth(month);
  return end ? Number(end.slice(8, 10)) : 30;
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
}

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value].filter(Boolean);
}

function normalizeStatus(value, fallback = 'pendiente') {
  const raw = lower(value, 80);
  if (!raw) return fallback;
  if (raw === 'pending') return 'pendiente';
  if (raw === 'requested') return 'solicitado';
  if (raw === 'processing') return 'procesando';
  if (raw === 'requires_action') return 'requiere_accion';
  if (raw === 'paid' || raw === 'succeeded' || raw === 'captured') return 'pagado';
  if (raw === 'validated' || raw === 'validada') return 'validado';
  if (raw === 'expired') return 'vencido';
  if (raw === 'failed') return 'fallido';
  if (raw === 'canceled' || raw === 'cancelled') return 'cancelado';
  return raw;
}

function statusIsPaid(value) {
  return PAID_STATUSES.includes(normalizeStatus(value));
}

function statusIsOpen(value) {
  return OPEN_STATUSES.includes(normalizeStatus(value));
}

function isBeforeToday(value, nowIso) {
  const day = dateOnly(value);
  const today = dateOnly(nowIso || new Date().toISOString());
  return Boolean(day && today && day < today);
}

function paymentDueDateFromClass(item, config = {}) {
  const base = dateOnly(item.date || item.fecha || item.createdAt || item.created_at);
  if (!base) return '';
  const dueDays = Number(config?.payments?.defaultPaymentDueDays ?? 7);
  const date = new Date(`${base}T12:00:00.000Z`);
  date.setDate(date.getDate() + (Number.isFinite(dueDays) ? dueDays : 7));
  return date.toISOString().slice(0, 10);
}

function compactName(...values) {
  return values.map((value) => clean(value, 120)).filter(Boolean).join(' ').trim();
}

function profileName(profile = {}, fallback = '') {
  return clean(
    firstPresent(
      profile.nombreCompleto,
      profile.fullName,
      compactName(profile.nombre, profile.apellidos),
      compactName(profile.usuarios?.nombre, profile.usuarios?.apellidos),
      profile.displayName,
      profile.name,
      fallback,
    ),
    180,
  );
}

function entityId(item = {}, type = '') {
  if (type === 'teacher') return clean(firstPresent(item.teacherUid, item.profesor_id, item.userUid, item.usuario_id, item.id), 140);
  if (type === 'family') return clean(firstPresent(item.familyUid, item.familia_id, item.userUid, item.usuario_id, item.id), 140);
  if (type === 'student') return clean(firstPresent(item.studentId, item.studentUid, item.alumno_id, item.id), 140);
  return clean(firstPresent(item.id, item.uid), 140);
}

function indexByManyIds(items = [], type = '') {
  const map = new Map();
  for (const item of items || []) {
    for (const id of [
      item.id,
      item.uid,
      item.userUid,
      item.usuario_id,
      type === 'teacher' ? item.teacherUid : '',
      type === 'teacher' ? item.profesor_id : '',
      type === 'family' ? item.familyUid : '',
      type === 'family' ? item.familia_id : '',
      type === 'student' ? item.studentId : '',
      type === 'student' ? item.alumno_id : '',
    ]) {
      const key = clean(id, 140);
      if (key) map.set(key, item);
    }
  }
  return map;
}

function normalizeListText(value) {
  return asArray(value)
    .flatMap((item) => String(item ?? '').split(','))
    .map((item) => lower(item, 120))
    .filter(Boolean);
}

function fieldMatches(ruleValue, classValue) {
  const ruleItems = normalizeListText(ruleValue);
  if (!ruleItems.length) return true;
  const classItems = normalizeListText(classValue);
  if (!classItems.length) return false;
  return ruleItems.some((ruleItem) => classItems.some((classItem) => classItem.includes(ruleItem) || ruleItem.includes(classItem)));
}

function rateRuleAmount(rule = {}, durationMinutes = 60) {
  const fixed = numberOrNull(firstPresent(rule.amount, rule.importe, rule.teacherAmount, rule.importe_profesor, rule.price, rule.precio));
  if (fixed !== null) return fixed;
  return amountFromHourly(firstPresent(rule.hourlyRate, rule.ratePerHour, rule.pricePerHour, rule.tarifaHora, rule.tarifa_hora), durationMinutes);
}

export function normalizeTeacherRateRule(raw = {}) {
  return {
    id: clean(firstPresent(raw.id, raw.ruleId, raw.nombre, raw.name), 120) || `rule_${Math.random().toString(36).slice(2, 8)}`,
    active: raw.active !== false && raw.activa !== false,
    subject: firstPresent(raw.subject, raw.materia, raw.subjects, raw.materias),
    level: firstPresent(raw.level, raw.nivel, raw.course, raw.curso),
    modality: firstPresent(raw.modality, raw.modalidad),
    studentId: clean(firstPresent(raw.studentId, raw.studentUid, raw.alumno_id), 140),
    city: firstPresent(raw.city, raw.ciudad, raw.zona),
    amount: numberOrNull(firstPresent(raw.amount, raw.importe, raw.teacherAmount, raw.importe_profesor, raw.price, raw.precio)),
    hourlyRate: numberOrNull(firstPresent(raw.hourlyRate, raw.ratePerHour, raw.pricePerHour, raw.tarifaHora, raw.tarifa_hora)),
    priority: Number(raw.priority ?? raw.prioridad ?? 0) || 0,
    raw,
  };
}

function teacherRateRules(profile = {}) {
  return [
    ...asArray(profile.rateRules),
    ...asArray(profile.teacherRateRules),
    ...asArray(profile.tarifas),
    ...asArray(profile.tarifasProfesor),
    ...asArray(profile.pricingRules),
  ].map(normalizeTeacherRateRule).filter((rule) => rule.active);
}

function subjectPremium(profile = {}, classData = {}) {
  const subject = lower(firstPresent(classData.subject, classData.materia, profile.subject, profile.materia), 180);
  const premiumSubjects = [
    [/piano|guitarra|violin|canto|musica|conservatorio/, 3],
    [/padel|tenis|deporte|entrenador/, 3],
    [/bachillerato|universidad|evau|selectividad|ingenier|fisica|quimica/, 2],
    [/matematic|programacion|informatica|idioma|ingles|frances|aleman/, 1],
  ];
  return premiumSubjects.find(([pattern]) => pattern.test(subject))?.[1] || 0;
}

export function estimateTeacherHourlyRate(profile = {}, classData = {}, config = {}) {
  const configured = Number(config?.business?.defaultTeacherHourlyRate ?? 18);
  const base = Number.isFinite(configured) ? configured : 18;
  const experience = Number(firstPresent(profile.experiencia_anios, profile.experienceYears, profile.yearsExperience, 0)) || 0;
  const trust = Number(firstPresent(profile.trustScore, profile.confianza, profile.reputationScore, 0)) || 0;
  const bach = Number(firstPresent(profile.nota_bachillerato, profile.bachilleratoGrade, 0)) || 0;
  const university = Number(firstPresent(profile.nota_media_universidad, profile.universityAverageGrade, 0)) || 0;
  const verified = ['verificado', 'verified', 'activo', 'active'].includes(lower(firstPresent(profile.verificationStatus, profile.estado_verificacion, profile.status), 40));
  const profileCompletion = Number(firstPresent(profile.profileCompletionPercent, profile.profileCompletion, 0)) || 0;
  const raw = base
    + clamp(experience, 0, 8) * 0.75
    + (trust >= 85 ? 2 : trust >= 70 ? 1 : trust > 0 && trust < 45 ? -1 : 0)
    + (bach >= 9 ? 1 : 0)
    + (university >= 8.5 ? 1.5 : university >= 7.5 ? 0.75 : 0)
    + (verified ? 1 : 0)
    + (profileCompletion >= 90 ? 1 : profileCompletion > 0 && profileCompletion < 65 ? -1 : 0)
    + subjectPremium(profile, classData);
  const minRate = Number(config?.business?.minimumTeacherHourlyRate ?? 14);
  const maxRate = Number(config?.business?.maximumTeacherHourlyRate ?? 35);
  return money(clamp(raw, Number.isFinite(minRate) ? minRate : 14, Number.isFinite(maxRate) ? maxRate : 35));
}

function ruleScore(rule, classData = {}) {
  let score = Number(rule.priority || 0);
  const fields = [
    ['subject', 30, firstPresent(classData.subject, classData.materia)],
    ['level', 18, firstPresent(classData.level, classData.nivel, classData.curso)],
    ['modality', 16, firstPresent(classData.modality, classData.modalidad)],
    ['city', 8, firstPresent(classData.city, classData.ciudad, classData.zona)],
  ];
  for (const [field, weight, value] of fields) {
    if (!normalizeListText(rule[field]).length) continue;
    if (!fieldMatches(rule[field], value)) return -1;
    score += weight;
  }
  if (rule.studentId) {
    const classStudent = clean(firstPresent(classData.studentId, classData.studentUid, classData.alumno_id), 140);
    if (!classStudent || classStudent !== rule.studentId) return -1;
    score += 40;
  }
  if (rule.amount !== null || rule.hourlyRate !== null) score += 5;
  return score;
}

export function resolveTeacherRateForClass(classData = {}, teacherProfile = {}, rules = [], config = {}) {
  const durationMinutes = Number(classData.durationMinutes || classData.duracion_minutos || 60) || 60;
  const explicitHourly = amountFromHourly(firstPresent(
    classData.teacherHourlyRate,
    classData.importe_hora_profesor,
    classData.teacherRatePerHour,
    classData.tarifa_hora_profesor,
  ), durationMinutes);
  if (explicitHourly !== null) {
    return { amount: explicitHourly, source: 'class_teacher_hourly_rate', ruleId: '', score: 0 };
  }

  const allRules = [
    ...teacherRateRules(teacherProfile),
    ...asArray(rules).map(normalizeTeacherRateRule).filter((rule) => rule.active),
  ];
  const candidates = allRules
    .map((rule) => ({ rule, score: ruleScore(rule, classData), amount: rateRuleAmount(rule, durationMinutes) }))
    .filter((item) => item.score >= 0 && item.amount !== null)
    .sort((a, b) => b.score - a.score);

  if (candidates.length) {
    return {
      amount: money(candidates[0].amount),
      source: 'teacher_rate_rule',
      ruleId: candidates[0].rule.id,
      score: candidates[0].score,
    };
  }

  const explicit = numberOrNull(firstPresent(classData.importe_profesor, classData.teacherAmount, classData.teacher_amount));
  if (explicit !== null) {
    return { amount: explicit, source: 'class_amount', ruleId: '', score: 0 };
  }

  const hourly = estimateTeacherHourlyRate(teacherProfile, classData, config);
  const amount = money(hourly * durationMinutes / 60);
  return { amount, source: teacherProfile?.id || teacherProfile?.userUid ? 'profile_valuation' : 'default_teacher_hourly_rate', ruleId: '', score: 0 };
}

export function buildClassFinancialPatch(classData = {}, teacherProfile = {}, options = {}) {
  const config = options.config || {};
  const durationMinutes = Number(classData.durationMinutes || classData.duracion_minutos || 60) || 60;
  const familyHourlyRate = numberOrNull(firstPresent(
    classData.familyHourlyRate,
    classData.precio_hora_familia,
    classData.familyRatePerHour,
    classData.tarifa_hora_familia,
  ));
  const familyFromHourly = amountFromHourly(familyHourlyRate, durationMinutes);
  const familyExplicit = numberOrNull(firstPresent(classData.precio_total, classData.amount, classData.familyAmount));
  const defaultFamilyRate = Number(config?.business?.defaultFamilyHourlyRate ?? 24);
  const familyAmount = familyFromHourly !== null
    ? familyFromHourly
    : familyExplicit !== null
    ? familyExplicit
    : money((Number.isFinite(defaultFamilyRate) ? defaultFamilyRate : 24) * durationMinutes / 60);
  const rate = resolveTeacherRateForClass(classData, teacherProfile, options.rules || [], config);
  const teacherAmount = rate.amount;
  const teacherHourlyRate = numberOrNull(firstPresent(
    classData.teacherHourlyRate,
    classData.importe_hora_profesor,
    classData.teacherRatePerHour,
    classData.tarifa_hora_profesor,
  )) ?? hourlyFromAmount(teacherAmount, durationMinutes);
  const normalizedFamilyHourlyRate = familyHourlyRate ?? hourlyFromAmount(familyAmount, durationMinutes);
  const platformFee = money(familyAmount - teacherAmount);
  const marginPct = familyAmount > 0 ? percent((platformFee / familyAmount) * 100) : 0;
  const nowIso = options.nowIso || new Date().toISOString();

  return {
    precio_total: familyAmount,
    amount: familyAmount,
    familyAmount,
    importe_profesor: teacherAmount,
    teacherAmount,
    precio_hora_familia: normalizedFamilyHourlyRate,
    familyHourlyRate: normalizedFamilyHourlyRate,
    importe_hora_profesor: teacherHourlyRate,
    teacherHourlyRate,
    comision_clasesde10: platformFee,
    platformFee,
    marginPct,
    teacherRateRuleId: rate.ruleId || null,
    teacherRateApplied: teacherAmount,
    teacherRateSource: rate.source,
    financeStatus: platformFee < 0 ? 'negative_margin' : marginPct < Number(config?.finance?.lowMarginAlertPct ?? 15) ? 'low_margin' : 'ok',
    financialsUpdatedAt: nowIso,
  };
}

export function buildClassPricingQuote(classData = {}, teacherProfile = {}, options = {}) {
  const config = options.config || {};
  const durationMinutes = Number(classData.durationMinutes || classData.duracion_minutos || 60) || 60;
  const rate = resolveTeacherRateForClass(classData, teacherProfile, options.rules || [], config);
  const teacherAmount = money(rate.amount);
  const explicitFamilyHourly = numberOrNull(firstPresent(
    classData.familyHourlyRate,
    classData.precio_hora_familia,
    classData.familyRatePerHour,
    classData.tarifa_hora_familia,
  ));
  const familyFromHourly = amountFromHourly(explicitFamilyHourly, durationMinutes);
  const explicitFamily = numberOrNull(firstPresent(classData.precio_total, classData.amount, classData.familyAmount));
  const defaultFamilyHourly = Number(config?.business?.defaultFamilyHourlyRate ?? 24);
  const defaultFamilyAmount = money((Number.isFinite(defaultFamilyHourly) ? defaultFamilyHourly : 24) * durationMinutes / 60);
  const commissionPct = Number(config?.business?.defaultCommissionPercent ?? config?.finance?.targetMarginPct ?? 25);
  const targetMargin = clamp((Number.isFinite(commissionPct) ? commissionPct : 25) / 100, 0, 0.8);
  const minimumFee = Math.max(0, Number(config?.business?.minimumPlatformFee ?? 0) || 0);
  const familyFromMargin = targetMargin > 0 && targetMargin < 1
    ? money(teacherAmount / (1 - targetMargin))
    : teacherAmount;
  const familyFromMinimumFee = money(teacherAmount + minimumFee);
  const familyAmount = familyFromHourly !== null
    ? familyFromHourly
    : explicitFamily !== null
    ? money(explicitFamily)
    : money(Math.max(defaultFamilyAmount, familyFromMargin, familyFromMinimumFee));
  const normalizedFamilyHourlyRate = explicitFamilyHourly ?? hourlyFromAmount(familyAmount, durationMinutes);
  const normalizedTeacherHourlyRate = numberOrNull(firstPresent(
    classData.teacherHourlyRate,
    classData.importe_hora_profesor,
    classData.teacherRatePerHour,
    classData.tarifa_hora_profesor,
  )) ?? hourlyFromAmount(teacherAmount, durationMinutes);
  const platformFee = money(familyAmount - teacherAmount);
  const marginPct = familyAmount > 0 ? percent((platformFee / familyAmount) * 100) : 0;
  return {
    precio_total: familyAmount,
    amount: familyAmount,
    familyAmount,
    importe_profesor: teacherAmount,
    teacherAmount,
    precio_hora_familia: normalizedFamilyHourlyRate,
    familyHourlyRate: normalizedFamilyHourlyRate,
    importe_hora_profesor: normalizedTeacherHourlyRate,
    teacherHourlyRate: normalizedTeacherHourlyRate,
    comision_clasesde10: platformFee,
    platformFee,
    marginPct,
    teacherRateRuleId: rate.ruleId || null,
    teacherRateSource: rate.source,
    pricingRule: rate.ruleId || rate.source || 'default_teacher_hourly_rate',
  };
}

export function normalizeFinanceClass(raw = {}, context = {}) {
  const teachersById = context.teachersById || new Map();
  const familiesById = context.familiesById || new Map();
  const studentsById = context.studentsById || new Map();
  const teacherUid = clean(firstPresent(raw.teacherUid, raw.profesor_id, raw.profesor?.id), 140);
  const familyUid = clean(firstPresent(raw.familyUid, raw.familia_id), 140);
  const studentUid = clean(firstPresent(raw.studentId, raw.studentUid, raw.alumno_id), 140);
  const teacher = teachersById.get(teacherUid) || raw.profesores || raw.profesor || {};
  const family = familiesById.get(familyUid) || raw.familias || raw.familia || {};
  const student = studentsById.get(studentUid) || raw.alumnos || raw.alumno || {};
  const financialPatch = buildClassFinancialPatch(raw, teacher, {
    config: context.config || {},
    rules: context.teacherRateRules || [],
    nowIso: context.nowIso,
  });
  const usesHourlyPricing = numberOrNull(firstPresent(raw.familyHourlyRate, raw.precio_hora_familia, raw.teacherHourlyRate, raw.importe_hora_profesor)) !== null;
  const familyAmount = usesHourlyPricing
    ? financialPatch.familyAmount
    : numberOrNull(firstPresent(raw.precio_total, raw.amount, raw.familyAmount)) ?? financialPatch.familyAmount;
  const teacherAmount = usesHourlyPricing
    ? financialPatch.teacherAmount
    : numberOrNull(firstPresent(raw.importe_profesor, raw.teacherAmount, raw.teacher_amount)) ?? financialPatch.teacherAmount;
  const platformFee = usesHourlyPricing
    ? financialPatch.platformFee
    : numberOrNull(firstPresent(raw.comision_clasesde10, raw.platformFee)) ?? money(familyAmount - teacherAmount);
  const date = dateOnly(firstPresent(raw.fecha, raw.date, raw.startAt, raw.createdAt, raw.created_at));
  const status = normalizeStatus(firstPresent(raw.estado, raw.status), '');
  const familyPaymentStatus = normalizeStatus(firstPresent(raw.familyPaymentStatus, raw.estado_pago_familia, raw.paymentStatus, raw.estado_pago), 'pendiente');
  const teacherPaymentStatus = normalizeStatus(firstPresent(raw.teacherPaymentStatus, raw.estado_pago_profesor), 'pendiente');
  const dueAt = dateOnly(firstPresent(raw.paymentDueAt, raw.dueAt, raw.due_at)) || paymentDueDateFromClass({ ...raw, date }, context.config);
  const isCompleted = COMPLETED_CLASS_STATUSES.includes(status);
  const isScheduled = SCHEDULED_CLASS_STATUSES.includes(status);
  const isCancelled = CANCELLED_CLASS_STATUSES.includes(status);

  return {
    ...raw,
    id: clean(raw.id, 140),
    date,
    month: monthKey(date),
    status,
    lifecycleStatus: normalizeStatus(raw.lifecycleStatus, ''),
    subject: clean(firstPresent(raw.subject, raw.materia), 180),
    level: clean(firstPresent(raw.level, raw.nivel, raw.curso, student.curso), 120),
    modality: clean(firstPresent(raw.modality, raw.modalidad, raw.tipoClase), 80) || 'sin modalidad',
    city: clean(firstPresent(raw.city, raw.ciudad, raw.zona, teacher.city, teacher.ciudad, family.city, family.ciudad), 120) || 'sin ciudad',
    teacherUid,
    familyUid,
    studentUid,
    teacherName: profileName(teacher, firstPresent(raw.profesor_nombre, raw.teacherName, teacherUid) || 'Sin profesor'),
    familyName: profileName(family, firstPresent(raw.familia_nombre, raw.familyName, familyUid) || 'Sin familia'),
    studentName: profileName(student, firstPresent(raw.alumno_nombre, raw.studentName, studentUid) || 'Sin alumno'),
    durationMinutes: Number(raw.durationMinutes || raw.duracion_minutos || 60) || 60,
    familyAmount,
    teacherAmount,
    familyHourlyRate: financialPatch.familyHourlyRate,
    teacherHourlyRate: financialPatch.teacherHourlyRate,
    precio_hora_familia: financialPatch.precio_hora_familia,
    importe_hora_profesor: financialPatch.importe_hora_profesor,
    platformFee,
    marginPct: familyAmount > 0 ? percent((platformFee / familyAmount) * 100) : 0,
    teacherRateRuleId: raw.teacherRateRuleId || financialPatch.teacherRateRuleId,
    teacherRateSource: raw.teacherRateSource || financialPatch.teacherRateSource,
    familyPaymentStatus,
    teacherPaymentStatus,
    familyPaid: statusIsPaid(familyPaymentStatus),
    teacherPaid: statusIsPaid(teacherPaymentStatus),
    dueAt,
    familyPaymentOverdue: familyAmount > 0 && !statusIsPaid(familyPaymentStatus) && isBeforeToday(dueAt, context.nowIso),
    teacherPayoutOverdue: teacherAmount > 0 && statusIsPaid(familyPaymentStatus) && !statusIsPaid(teacherPaymentStatus) && isBeforeToday(dueAt, context.nowIso),
    isCompleted,
    isScheduled,
    isCancelled,
    isRevenueClass: !isCancelled && (isCompleted || statusIsPaid(familyPaymentStatus)),
  };
}

export function normalizeFinancePayment(raw = {}, context = {}) {
  const type = ['teacher_payout', 'pago_profesor'].includes(raw.paymentType || raw.tipo) ? 'teacher_payout' : 'family_payment';
  const createdAt = dateToIso(firstPresent(raw.createdAt, raw.created_at, raw.fecha, raw.paidAt, raw.validatedAt));
  const dueAt = dateToIso(firstPresent(raw.dueAt, raw.due_at, raw.paymentDueAt));
  const status = normalizeStatus(firstPresent(raw.estado, raw.status, raw.providerPaymentStatus, raw.gatewayStatus), 'pendiente');
  const amount = money(firstPresent(raw.monto, raw.amount, raw.total));
  const verified = raw.verified === true || statusIsPaid(status);
  return {
    ...raw,
    id: clean(raw.id, 140),
    type,
    amount,
    status,
    verified,
    method: clean(firstPresent(raw.method, raw.metodo), 80) || 'bizum',
    gateway: clean(firstPresent(raw.gateway, raw.provider), 80) || 'manual',
    createdAt,
    createdDate: dateOnly(createdAt),
    month: monthKey(createdAt),
    dueAt: dateOnly(dueAt),
    familyUid: clean(firstPresent(raw.familyUid, raw.familia_id), 140),
    teacherUid: clean(firstPresent(raw.teacherUid, raw.profesor_id), 140),
    classIds: asArray(raw.classIds || raw.claseIds || raw.clases).map((item) => clean(item, 140)).filter(Boolean),
    reconciliationStatus: clean(raw.reconciliationStatus || raw.conciliationStatus, 120) || '',
    overdue: statusIsOpen(status) && isBeforeToday(dueAt, context.nowIso),
  };
}

export function buildFinanceDataset(input = {}, options = {}) {
  const teachers = input.teachers || input.profesores || [];
  const families = input.families || input.familias || [];
  const students = input.students || input.alumnos || [];
  const teachersById = indexByManyIds(teachers, 'teacher');
  const familiesById = indexByManyIds(families, 'family');
  const studentsById = indexByManyIds(students, 'student');
  const context = {
    config: options.config || {},
    nowIso: options.nowIso || new Date().toISOString(),
    teachersById,
    familiesById,
    studentsById,
    teacherRateRules: options.teacherRateRules || [],
  };
  const classes = (input.classes || input.clases || []).map((item) => normalizeFinanceClass(item, context));
  const payments = (input.payments || input.pagos || []).map((item) => normalizeFinancePayment(item, context));
  return {
    version: FINANCE_ERP_VERSION,
    classes,
    payments,
    teachers,
    families,
    students,
    generatedAt: context.nowIso,
  };
}

function sum(items, getter) {
  return money((items || []).reduce((acc, item) => acc + money(getter(item)), 0));
}

function average(items, getter) {
  const values = (items || []).map((item) => Number(getter(item))).filter(Number.isFinite);
  if (!values.length) return 0;
  return percent(values.reduce((acc, item) => acc + item, 0) / values.length);
}

function group(items, keyGetter, seed = {}) {
  const result = new Map();
  for (const item of items || []) {
    const key = clean(keyGetter(item) || 'Sin dato', 180);
    const current = result.get(key) || { key, label: key, classes: 0, revenue: 0, teacherCost: 0, profit: 0, pendingRevenue: 0 };
    current.classes += 1;
    current.revenue = money(current.revenue + item.familyAmount);
    current.teacherCost = money(current.teacherCost + item.teacherAmount);
    current.profit = money(current.revenue - current.teacherCost);
    if (!item.familyPaid) current.pendingRevenue = money(current.pendingRevenue + item.familyAmount);
    Object.assign(current, seed[key] || {});
    result.set(key, current);
  }
  return Array.from(result.values()).map((item) => ({
    ...item,
    marginPct: item.revenue > 0 ? percent((item.profit / item.revenue) * 100) : 0,
  })).sort((a, b) => b.revenue - a.revenue);
}

function groupPayments(items, keyGetter) {
  const result = new Map();
  for (const item of items || []) {
    const key = clean(keyGetter(item) || 'Sin dato', 180);
    const current = result.get(key) || { key, label: key, payments: 0, amount: 0, verifiedAmount: 0, overdueAmount: 0 };
    current.payments += 1;
    current.amount = money(current.amount + item.amount);
    if (item.verified) current.verifiedAmount = money(current.verifiedAmount + item.amount);
    if (item.overdue) current.overdueAmount = money(current.overdueAmount + item.amount);
    result.set(key, current);
  }
  return Array.from(result.values()).sort((a, b) => b.amount - a.amount);
}

function monthSeries(classes = [], selectedMonth = '') {
  const result = new Map();
  for (const item of classes) {
    const month = item.month || selectedMonth || 'sin mes';
    const current = result.get(month) || { month, revenue: 0, teacherCost: 0, profit: 0, classes: 0 };
    current.classes += 1;
    current.revenue = money(current.revenue + item.familyAmount);
    current.teacherCost = money(current.teacherCost + item.teacherAmount);
    current.profit = money(current.revenue - current.teacherCost);
    result.set(month, current);
  }
  return Array.from(result.values())
    .map((item) => ({ ...item, marginPct: item.revenue > 0 ? percent((item.profit / item.revenue) * 100) : 0 }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function periodClasses(dataset, month) {
  if (!month) return dataset.classes || [];
  return (dataset.classes || []).filter((item) => item.month === month);
}

function periodPayments(dataset, month) {
  if (!month) return dataset.payments || [];
  return (dataset.payments || []).filter((item) => item.month === month);
}

export function calculateFinanceErpMetrics(dataset = {}, options = {}) {
  const month = options.month || monthKey(options.nowIso || new Date().toISOString());
  const previous = previousMonth(month);
  const nowIso = options.nowIso || new Date().toISOString();
  const selectedClasses = periodClasses(dataset, month);
  const selectedPayments = periodPayments(dataset, month);
  const prevClasses = periodClasses(dataset, previous);
  const revenueClasses = selectedClasses.filter((item) => item.isRevenueClass || item.isCompleted);
  const scheduledFuture = selectedClasses.filter((item) => item.isScheduled && item.date >= dateOnly(nowIso));
  const paidFamilyPayments = selectedPayments.filter((item) => item.type === 'family_payment' && item.verified);
  const paidTeacherPayments = selectedPayments.filter((item) => item.type === 'teacher_payout' && item.verified);
  const pendingFamilyClasses = revenueClasses.filter((item) => item.familyAmount > 0 && !item.familyPaid);
  const pendingTeacherClasses = revenueClasses.filter((item) => item.teacherAmount > 0 && !item.teacherPaid);
  const overdueFamilyClasses = pendingFamilyClasses.filter((item) => item.familyPaymentOverdue);
  const overdueTeacherClasses = pendingTeacherClasses.filter((item) => item.teacherPayoutOverdue);

  const earnedRevenue = sum(revenueClasses, (item) => item.familyAmount);
  const teacherCost = sum(revenueClasses, (item) => item.teacherAmount);
  const grossProfit = money(earnedRevenue - teacherCost);
  const marginPct = earnedRevenue > 0 ? percent((grossProfit / earnedRevenue) * 100) : 0;
  const collectedRevenue = sum(paidFamilyPayments, (item) => item.amount);
  const teacherPayoutsPaid = sum(paidTeacherPayments, (item) => item.amount);
  const netCash = money(collectedRevenue - teacherPayoutsPaid);
  const pendingRevenue = sum(pendingFamilyClasses, (item) => item.familyAmount);
  const overdueRevenue = sum(overdueFamilyClasses, (item) => item.familyAmount);
  const pendingTeacherPayouts = sum(pendingTeacherClasses, (item) => item.teacherAmount);
  const overdueTeacherPayouts = sum(overdueTeacherClasses, (item) => item.teacherAmount);
  const futureRevenue = sum(scheduledFuture, (item) => item.familyAmount);
  const futureTeacherCost = sum(scheduledFuture, (item) => item.teacherAmount);
  const prevRevenue = sum(prevClasses.filter((item) => item.isRevenueClass || item.isCompleted), (item) => item.familyAmount);
  const revenueGrowthPct = prevRevenue > 0 ? percent(((earnedRevenue - prevRevenue) / prevRevenue) * 100) : (earnedRevenue > 0 ? 100 : 0);

  const today = dateOnly(nowIso);
  const dayNumber = month === monthKey(nowIso) ? Math.max(1, Number(today.slice(8, 10)) || 1) : daysInMonth(month);
  const monthlyForecast = money(Math.max((earnedRevenue / dayNumber) * daysInMonth(month), earnedRevenue + futureRevenue));
  const weeklyForecast = money(monthlyForecast / 4.345);
  const annualForecast = money(monthlyForecast * 12);
  const forecastProfit = earnedRevenue > 0 ? money(monthlyForecast * marginPct / 100) : money(monthlyForecast - futureTeacherCost);
  const estimatedCashFlow = money(collectedRevenue + pendingRevenue - teacherPayoutsPaid - pendingTeacherPayouts);

  const byTeacher = group(revenueClasses, (item) => item.teacherName || item.teacherUid);
  const byCity = group(revenueClasses, (item) => item.city);
  const bySubject = group(revenueClasses, (item) => item.subject || 'Sin materia');
  const byModality = group(revenueClasses, (item) => item.modality || 'Sin modalidad');
  const byFamily = group(revenueClasses, (item) => item.familyName || item.familyUid);

  return {
    month,
    previousMonth: previous,
    generatedAt: dataset.generatedAt || nowIso,
    classes: {
      total: selectedClasses.length,
      revenue: revenueClasses.length,
      scheduledFuture: scheduledFuture.length,
      completed: selectedClasses.filter((item) => item.isCompleted).length,
      cancelled: selectedClasses.filter((item) => item.isCancelled).length,
      missingFinancials: selectedClasses.filter((item) => item.familyAmount <= 0 || item.teacherAmount <= 0).length,
    },
    revenue: {
      earned: earnedRevenue,
      collected: collectedRevenue,
      pending: pendingRevenue,
      overdue: overdueRevenue,
      future: futureRevenue,
      growthPct: revenueGrowthPct,
    },
    costs: {
      teacherAccrued: teacherCost,
      teacherPaid: teacherPayoutsPaid,
      teacherPending: pendingTeacherPayouts,
      teacherOverdue: overdueTeacherPayouts,
    },
    profit: {
      gross: grossProfit,
      marginPct,
      forecastGross: forecastProfit,
    },
    forecast: {
      weekly: weeklyForecast,
      monthly: monthlyForecast,
      annual: annualForecast,
      futureRevenue,
      futureTeacherCost,
      estimatedCashFlow,
    },
    payments: {
      total: selectedPayments.length,
      family: selectedPayments.filter((item) => item.type === 'family_payment').length,
      teacher: selectedPayments.filter((item) => item.type === 'teacher_payout').length,
      overdue: selectedPayments.filter((item) => item.overdue).length,
      unreconciled: selectedPayments.filter((item) => item.reconciliationStatus === 'needs_review' || item.reconciliationStatus === 'pending_match').length,
      byMethod: groupPayments(selectedPayments, (item) => item.method),
      byGateway: groupPayments(selectedPayments, (item) => item.gateway),
    },
    breakdowns: {
      byTeacher,
      byCity,
      bySubject,
      byModality,
      byFamily,
      monthly: monthSeries((dataset.classes || []).filter((item) => item.isRevenueClass || item.isCompleted), month),
      topProfitableTeachers: byTeacher.slice().sort((a, b) => b.profit - a.profit).slice(0, 12),
      activeFamilies: byFamily.slice().sort((a, b) => b.classes - a.classes).slice(0, 12),
    },
    operational: {
      averageMarginPct: average(revenueClasses, (item) => item.marginPct),
      averageClassValue: revenueClasses.length ? money(earnedRevenue / revenueClasses.length) : 0,
      collectionRatePct: earnedRevenue > 0 ? percent((collectedRevenue / earnedRevenue) * 100) : 0,
      payoutCoveragePct: teacherCost > 0 ? percent((teacherPayoutsPaid / teacherCost) * 100) : 0,
      estimatedCashFlow,
    },
  };
}

function anomaly(type, severity, title, description, entity = {}, amount = 0, suggestedActions = []) {
  return {
    id: clean(`${type}_${entity.id || entity.paymentId || entity.classId || entity.key || Math.random().toString(36).slice(2, 8)}`, 180).replace(/[^a-z0-9_-]/gi, '_'),
    type,
    severity,
    title,
    description,
    amount: money(amount),
    classId: entity.classId || entity.id || '',
    paymentId: entity.paymentId || '',
    teacherUid: entity.teacherUid || '',
    familyUid: entity.familyUid || '',
    date: entity.date || entity.createdDate || '',
    suggestedActions,
  };
}

export function detectFinanceAnomalies(dataset = {}, metrics = {}, options = {}) {
  const config = options.config || {};
  const lowMarginPct = Number(config?.finance?.lowMarginAlertPct ?? 15);
  const anomalies = [];
  for (const item of dataset.classes || []) {
    if (item.isCancelled) continue;
    if ((item.isRevenueClass || item.isCompleted) && (item.familyAmount <= 0 || item.teacherAmount <= 0)) {
      anomalies.push(anomaly(
        'missing_amount',
        'high',
        'Clase sin importes completos',
        `${item.studentName || item.id} no tiene total familia y cobra profesor completos.`,
        item,
        item.familyAmount,
        ['Completar precio de familia y cobra profesor.', 'Revisar tarifa aplicada antes del cierre.'],
      ));
    }
    if (item.familyAmount > 0 && item.teacherAmount > item.familyAmount) {
      anomalies.push(anomaly(
        'negative_margin',
        'critical',
        'Margen negativo',
        `${item.teacherName || 'Profesor'} cobra mas que el importe de familia.`,
        item,
        item.platformFee,
        ['Ajustar tarifa de la clase.', 'Revisar si existe beca o ajuste manual autorizado.'],
      ));
    } else if (item.familyAmount > 0 && item.teacherAmount > 0 && item.marginPct < lowMarginPct) {
      anomalies.push(anomaly(
        'low_margin',
        'medium',
        'Margen bajo',
        `${item.teacherName || 'Profesor'} deja un margen del ${item.marginPct}%.`,
        item,
        item.platformFee,
        ['Revisar precio de familia.', 'Revisar tarifa de profesor para futuras clases.'],
      ));
    }
    if (item.familyPaymentOverdue) {
      anomalies.push(anomaly(
        'payment_overdue',
        'high',
        'Cobro familiar vencido',
        `${item.familyName || 'Familia'} tiene una clase vencida pendiente de cobro.`,
        item,
        item.familyAmount,
        ['Enviar recordatorio de pago.', 'Verificar Bizum o justificante.'],
      ));
    }
    if (item.teacherPayoutOverdue) {
      anomalies.push(anomaly(
        'teacher_payout_overdue',
        'medium',
        'Pago a profesor pendiente',
        `${item.teacherName || 'Profesor'} tiene un pago pendiente tras cobro familiar.`,
        item,
        item.teacherAmount,
        ['Preparar Bizum al profesor.', 'Conciliar clase antes del cierre semanal.'],
      ));
    }
  }

  for (const item of dataset.payments || []) {
    const needsReview = item.reconciliationStatus === 'needs_review' || item.reconciliationStatus === 'pending_match';
    if (needsReview) {
      anomalies.push(anomaly(
        'unreconciled_payment',
        'medium',
        'Pago sin conciliacion completa',
        `Pago ${item.id || ''} por ${item.amount.toFixed(2)} EUR requiere asociar clase(s).`,
        { ...item, paymentId: item.id },
        item.amount,
        ['Asociar pago con clases.', 'Marcar como revisado si es ajuste manual.'],
      ));
    }
    if (item.verified && !item.classIds.length && item.type === 'family_payment') {
      anomalies.push(anomaly(
        'orphan_payment',
        'medium',
        'Cobro validado sin clases',
        `Cobro familiar ${item.id || ''} esta validado pero no enlaza clases.`,
        { ...item, paymentId: item.id },
        item.amount,
        ['Relacionar cobro con la clase correcta.', 'Comprobar si es anticipo o ajuste.'],
      ));
    }
  }

  return anomalies.sort((a, b) => {
    const rank = { critical: 1, high: 2, medium: 3, low: 4 };
    return (rank[a.severity] || 5) - (rank[b.severity] || 5) || Math.abs(b.amount) - Math.abs(a.amount);
  });
}

export function buildFinanceErpReport(input = {}, options = {}) {
  const dataset = buildFinanceDataset(input, options);
  const metrics = calculateFinanceErpMetrics(dataset, options);
  const anomalies = detectFinanceAnomalies(dataset, metrics, options);
  return {
    version: FINANCE_ERP_VERSION,
    dataset,
    metrics,
    anomalies,
    csvRows: buildFinanceCsvRows(dataset, metrics, anomalies, options),
  };
}

export function groupFinanceBy(dataset = {}, field = 'teacherName') {
  return group((dataset.classes || []).filter((item) => item.isRevenueClass || item.isCompleted), (item) => item[field] || item[field.replace(/^by/, '').toLowerCase()]);
}

export function buildFinanceCsvRows(dataset = {}, _metrics = {}, _anomalies = [], _options = {}) {
  return (dataset.classes || []).map((item) => ({
    fecha: item.date,
    mes: item.month,
    alumno: item.studentName,
    familia: item.familyName,
    profesor: item.teacherName,
    ciudad: item.city,
    materia: item.subject,
    nivel: item.level,
    modalidad: item.modality,
    estado: item.status,
    precio_hora_familia: item.familyHourlyRate,
    importe_hora_profesor: item.teacherHourlyRate,
    total_familia: item.familyAmount,
    cobra_profesor: item.teacherAmount,
    margen_clasesde10: item.platformFee,
    margen_porcentaje: item.marginPct,
    pago_familia: item.familyPaymentStatus,
    pago_profesor: item.teacherPaymentStatus,
    vencimiento: item.dueAt,
    tarifa_origen: item.teacherRateSource,
    tarifa_regla: item.teacherRateRuleId || '',
  }));
}
