/**
 * Payment lifecycle engine for ClasesDe10.
 *
 * This module is intentionally provider-neutral. Bizum can arrive as a manual
 * proof, through Stripe, through Redsys/virtual POS, or through a bank import.
 */

export const PAYMENT_TYPES = Object.freeze([
  'family_payment',
  'teacher_payout',
  'refund',
  'adjustment',
]);

export const PAYMENT_METHODS = Object.freeze([
  'bizum',
  'card',
  'transferencia',
  'efectivo',
  'stripe_bizum',
  'redsys_bizum',
]);

export const PAYMENT_GATEWAYS = Object.freeze([
  'manual',
  'stripe',
  'redsys',
  'bank_import',
]);

export const PAYMENT_STATUSES = Object.freeze([
  'pendiente',
  'solicitado',
  'procesando',
  'requiere_accion',
  'validado',
  'pagado',
  'vencido',
  'rechazado',
  'fallido',
  'devuelto',
  'disputado',
  'cancelado',
]);

export const PAID_PAYMENT_STATUSES = Object.freeze(['validado', 'pagado', 'paid', 'succeeded']);
export const OPEN_PAYMENT_STATUSES = Object.freeze(['pendiente', 'solicitado', 'procesando', 'requiere_accion']);
export const REOPEN_FAMILY_PAYMENT_STATUSES = Object.freeze(['rechazado', 'fallido', 'devuelto', 'disputado', 'cancelado']);
export const DEFAULT_FAMILY_PAYMENT_GRACE_HOURS = 48;
export const FAMILY_PAYMENT_ACCESS_LOCK_DAYS = 30;
const PAYMENT_DAY_MS = 24 * 60 * 60 * 1000;
export const FAMILY_PAYMENT_RECIPIENT = Object.freeze({
  name: 'Miguel G. G.',
  phone: '613016665',
  label: 'ClasesDe10 - Miguel G. G.',
  role: 'platform_admin',
  fundsFlow: 'platform_collects_then_teacher_payout',
  explanation: 'ClasesDe10 recibe el pago de la familia y despues liquida al profesor correspondiente.',
});
export const WEEKLY_PAYMENT_DAY_LABELS = Object.freeze({
  1: 'Lunes',
  2: 'Martes',
  3: 'Miercoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sabado',
  7: 'Domingo',
});

export function cleanPaymentText(value, max = 500) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

export function familyPaymentRecipient() {
  return { ...FAMILY_PAYMENT_RECIPIENT };
}

const GENERIC_PAYMENT_PERSON_LABELS = new Set([
  'profesor',
  'profesora',
  'profesor/a',
  'profesor asignado',
  'profesor sin nombre',
  'profesor pendiente de nombre',
  'alumno',
  'alumna',
  'alumno/a',
  'alumno sin nombre',
  'alumno/a sin nombre',
  'familia',
  'familia sin nombre',
  'familia pendiente de nombre',
  'alumno pendiente de nombre',
  'nombre pendiente',
  'sin nombre',
  'contacto',
]);

function isGenericPaymentPersonLabel(value) {
  const text = cleanPaymentText(value, 180);
  const normalized = text.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!normalized || GENERIC_PAYMENT_PERSON_LABELS.has(normalized)) return true;
  const ascii = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  if (/^[a-z]$/i.test(ascii)) return true;
  const generated = ascii.match(/^(?:profesor(?:a|\/a)?|profesor asignado|docente|alumno(?:a|\/a)?|familia)\s+([A-Za-z0-9_-]{1,12})$/i);
  if (!generated) return false;
  const token = generated[1].replace(/[^A-Za-z0-9]/g, '');
  if (token.length <= 1) return true;
  return /\d/.test(token) || /^[A-Z]{2,8}$/.test(token) || /^[a-f0-9]{6,12}$/i.test(token);
}

function paymentPersonFallback(role, id = '') {
  return `${role} pendiente de nombre`;
}

function paymentPersonName(role, id = '', ...values) {
  const found = values.map((value) => cleanPaymentText(value, 180)).find((value) => value && !isGenericPaymentPersonLabel(value));
  return found || paymentPersonFallback(role, id);
}

export function normalizePaymentStatus(status) {
  const raw = cleanPaymentText(status, 40).toLowerCase();
  if (!raw) return 'pendiente';
  if (raw === 'requested') return 'solicitado';
  if (raw === 'pending') return 'pendiente';
  if (raw === 'processing') return 'procesando';
  if (raw === 'requires_action' || raw === 'requires_payment_method') return 'requiere_accion';
  if (raw === 'succeeded' || raw === 'paid' || raw === 'captured') return 'pagado';
  if (raw === 'validated' || raw === 'validada') return 'validado';
  if (raw === 'expired') return 'vencido';
  if (raw === 'failed') return 'fallido';
  if (raw === 'refunded') return 'devuelto';
  if (raw === 'canceled' || raw === 'cancelled') return 'cancelado';
  if (PAYMENT_STATUSES.includes(raw)) return raw;
  return raw;
}

export function storedPaymentStatus(status) {
  const normalized = normalizePaymentStatus(status);
  return PAYMENT_STATUSES.includes(normalized) ? normalized : 'pendiente';
}

export function paymentStatusForBadge(payment = {}) {
  const status = normalizePaymentStatus(payment.estado || payment.status || payment.providerPaymentStatus || payment.gatewayStatus);
  if (status === 'pagado' && payment.paymentType !== 'teacher_payout' && payment.tipo !== 'pago_profesor') return 'validado';
  if (isPaymentOverdue(payment)) return 'vencido';
  return status;
}

export function paymentAmount(payment = {}) {
  const amount = Number(payment.monto ?? payment.amount ?? payment.total ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : null;
}

function timeToMinutes(value) {
  const match = cleanPaymentText(value, 8).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function classTimeRangeDurationMinutes(classData = {}) {
  const start = timeToMinutes(classData.hora_inicio || classData.startTime);
  const end = timeToMinutes(classData.hora_fin || classData.endTime);
  if (start !== null && end !== null && end > start) return end - start;
  return null;
}

function classDurationMinutes(classData = {}) {
  const timeRange = classTimeRangeDurationMinutes(classData);
  if (timeRange !== null) return timeRange;
  const explicit = Number(classData.durationMinutes ?? classData.duracion_minutos ?? classData.duration);
  return Number.isFinite(explicit) && explicit > 0 ? explicit : 60;
}

function prorateHourlyAmount(hourlyRate, durationMinutes = 60) {
  const hourly = money(hourlyRate);
  const minutes = Number(durationMinutes) || 60;
  return hourly === null ? 0 : Math.round(((hourly * minutes / 60) + Number.EPSILON) * 100) / 100;
}

function classAmountFromHourlyOrLegacy(classData = {}, hourlyFields = [], legacyAmountFields = []) {
  const durationMinutes = classDurationMinutes(classData);
  for (const field of hourlyFields) {
    const hourly = money(classData[field]);
    if (hourly !== null && hourly > 0) return prorateHourlyAmount(hourly, durationMinutes);
  }
  const timeRangeDuration = classTimeRangeDurationMinutes(classData);
  for (const field of legacyAmountFields) {
    const amount = money(classData[field]);
    if (amount !== null && amount > 0) {
      return timeRangeDuration !== null && timeRangeDuration !== 60 ? prorateHourlyAmount(amount, durationMinutes) : amount;
    }
  }
  return 0;
}

export function isTeacherPayout(payment = {}) {
  return ['teacher_payout', 'pago_profesor'].includes(payment.paymentType || payment.tipo);
}

export function isFamilyPayment(payment = {}) {
  return !isTeacherPayout(payment) && ['family_payment', 'pago_familia', undefined, null, ''].includes(payment.paymentType || payment.tipo);
}

export function isPaymentVerified(payment = {}) {
  const status = normalizePaymentStatus(payment.estado || payment.status || payment.providerPaymentStatus || payment.gatewayStatus);
  return PAID_PAYMENT_STATUSES.includes(status) || payment.verified === true;
}

export function isAutomaticGateway(payment = {}) {
  return ['stripe', 'redsys', 'bank_import'].includes(cleanPaymentText(payment.gateway || payment.provider, 40).toLowerCase());
}

export function isPaymentOverdue(payment = {}, nowMs = Date.now()) {
  const status = normalizePaymentStatus(payment.estado || payment.status);
  if (!OPEN_PAYMENT_STATUSES.includes(status)) return false;
  const due = payment.dueAt || payment.due_at;
  if (!due) return false;
  const dueDate = new Date(due);
  if (Number.isNaN(dueDate.getTime())) return false;
  const teacherPayout = isTeacherPayout(payment);
  const graceHours = Number(payment.graceHours ?? payment.grace_hours ?? payment.overdueGraceHours ?? DEFAULT_FAMILY_PAYMENT_GRACE_HOURS);
  const safeGraceHours = teacherPayout
    ? 0
    : Number.isFinite(graceHours)
    ? Math.max(DEFAULT_FAMILY_PAYMENT_GRACE_HOURS, Math.min(168, graceHours))
    : DEFAULT_FAMILY_PAYMENT_GRACE_HOURS;
  return dueDate.getTime() + safeGraceHours * 3600000 < nowMs;
}

export function paymentDueAtFromDate(baseDate = new Date(), days = 7) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

function normalizePaymentScheduleDay(value) {
  const number = Number(value);
  if (Number.isFinite(number) && number >= 1 && number <= 7) return Math.round(number);
  return 5;
}

function normalizePaymentScheduleTime(value) {
  const raw = cleanPaymentText(value || '20:00', 8);
  return /^\d{2}:\d{2}$/.test(raw) ? raw : '20:00';
}

function normalizePaymentScheduleFrequency(value) {
  const raw = cleanPaymentText(value || 'semanal', 40).toLowerCase();
  if (['quincenal', 'biweekly', 'fortnightly', 'cada_15_dias', '15_dias', '15dias'].includes(raw)) return 'quincenal';
  return 'semanal';
}

function normalizePaymentScheduleAnchorDate(value) {
  const raw = cleanPaymentText(value, 20).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const [year, month, day] = raw.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return '';
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return raw;
}

function mondayBasedDay(date) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function biweeklyScheduleDateFromClassDate(baseDate, schedule = {}) {
  const classDate = new Date(baseDate);
  if (Number.isNaN(classDate.getTime())) return null;
  const anchorDate = normalizePaymentScheduleAnchorDate(
    schedule.anchorDate
    || schedule.paymentAnchorDate
    || schedule.fecha_inicio_pago
    || schedule.fecha_inicio_cobro
    || schedule.startDate,
  );
  if (!anchorDate) return null;
  const time = normalizePaymentScheduleTime(schedule.time ?? schedule.paymentTime ?? schedule.hora_pago);
  const [hours, minutes] = time.split(':').map(Number);
  const anchor = new Date(`${anchorDate}T00:00:00`);
  anchor.setHours(hours, minutes, 0, 0);
  if (Number.isNaN(anchor.getTime())) return null;
  let due = new Date(anchor);
  if (due.getTime() <= classDate.getTime()) {
    const elapsedDays = Math.max(0, Math.floor((classDate.getTime() - due.getTime()) / PAYMENT_DAY_MS));
    due.setDate(due.getDate() + Math.floor(elapsedDays / 14) * 14);
    while (due.getTime() <= classDate.getTime()) due.setDate(due.getDate() + 14);
  }
  return due;
}

function scheduleDateFromClassDate(baseDate, schedule = {}) {
  if (normalizePaymentScheduleFrequency(schedule.frequency ?? schedule.paymentFrequency ?? schedule.frecuencia_pago) === 'quincenal') {
    return biweeklyScheduleDateFromClassDate(baseDate, schedule);
  }
  const classDate = new Date(baseDate);
  if (Number.isNaN(classDate.getTime())) return null;
  const dayOfWeek = normalizePaymentScheduleDay(schedule.dayOfWeek ?? schedule.paymentDay ?? schedule.dia_semana_pago);
  const time = normalizePaymentScheduleTime(schedule.time ?? schedule.paymentTime ?? schedule.hora_pago);
  const [hours, minutes] = time.split(':').map(Number);
  const due = new Date(classDate);
  due.setHours(hours, minutes, 0, 0);
  let diff = dayOfWeek - mondayBasedDay(due);
  if (diff < 0) diff += 7;
  due.setDate(due.getDate() + diff);
  if (due.getTime() <= classDate.getTime()) due.setDate(due.getDate() + 7);
  return due;
}

export function paymentScheduleDocumentId(input = {}) {
  return [
    'weekly',
    input.ownerUid || input.familyUserUid || input.familyUid || input.familia_id || 'family',
    input.teacherUid || input.profesor_id || 'teacher',
    input.studentId || input.alumno_id || input.assignmentId || input.asignacion_id || 'relation',
  ].map((value) => cleanPaymentText(value, 120).toLowerCase().replace(/[^a-z0-9_-]+/g, '_')).join('__').slice(0, 900);
}

function pushPaymentScheduleKey(keys, key) {
  if (key && !keys.includes(key)) keys.push(key);
}

export function paymentScheduleKeysFor(item = {}) {
  const keys = [];
  const assignmentId = cleanPaymentText(item.assignmentId || item.asignacion_id, 180);
  const teacherUid = cleanPaymentText(item.teacherUid || item.profesor_id, 180);
  const familyUid = cleanPaymentText(item.familyUid || item.familia_id, 180);
  const studentId = cleanPaymentText(item.studentId || item.alumno_id, 180);

  pushPaymentScheduleKey(keys, assignmentId ? `assignment:${assignmentId}` : '');
  if (teacherUid && studentId) {
    pushPaymentScheduleKey(keys, `teacher-student:${teacherUid}:${studentId}`);
    pushPaymentScheduleKey(keys, `teacher_student:${teacherUid}:${studentId}`);
  }
  if (teacherUid && familyUid) {
    pushPaymentScheduleKey(keys, `teacher-family:${teacherUid}:${familyUid}`);
    pushPaymentScheduleKey(keys, `teacher_family:${teacherUid}:${familyUid}`);
  }
  pushPaymentScheduleKey(keys, teacherUid ? `teacher:${teacherUid}` : '');
  return keys;
}

export function paymentStrongRelationKeys(item = {}) {
  const strongPrefixes = ['assignment:', 'teacher-student:', 'teacher_student:', 'teacher-family:', 'teacher_family:'];
  return Array.from(new Set(
    paymentScheduleKeysFor(item)
      .map((key) => cleanPaymentText(key, 240).toLowerCase())
      .filter((key) => strongPrefixes.some((prefix) => key.startsWith(prefix))),
  ));
}

export function samePaymentRelation(left = {}, right = {}) {
  const leftKeys = paymentStrongRelationKeys(left);
  const rightKeys = new Set(paymentStrongRelationKeys(right));
  if (!leftKeys.length || !rightKeys.size) return false;
  return leftKeys.some((key) => rightKeys.has(key));
}

export function buildPaymentScheduleIndex(schedules = []) {
  const index = new Map();
  for (const schedule of schedules || []) {
    if (!schedule || schedule.active === false || schedule.status === 'inactive') continue;
    if (schedule.id) index.set(cleanPaymentText(schedule.id, 180), schedule);
    paymentScheduleKeysFor(schedule).forEach((key) => {
      if (!index.has(key)) index.set(key, schedule);
    });
  }
  return index;
}

export function paymentScheduleForClass(classData = {}, scheduleIndex = new Map()) {
  for (const key of paymentScheduleKeysFor(classData)) {
    const schedule = scheduleIndex.get(key);
    if (schedule) return schedule;
  }
  return null;
}

export function buildWeeklyPaymentSchedulePayload(input = {}, options = {}) {
  const nowIso = options.nowIso || new Date().toISOString();
  const frequency = normalizePaymentScheduleFrequency(input.frequency ?? input.paymentFrequency ?? input.frecuencia_pago);
  const dayOfWeek = normalizePaymentScheduleDay(input.dayOfWeek ?? input.paymentDay ?? input.dia_semana_pago);
  const time = normalizePaymentScheduleTime(input.time ?? input.paymentTime ?? input.hora_pago);
  const anchorDate = normalizePaymentScheduleAnchorDate(
    input.anchorDate
    || input.paymentAnchorDate
    || input.fecha_inicio_pago
    || input.fecha_inicio_cobro
    || input.startDate,
  );
  const graceHours = Number(input.graceHours ?? input.grace_hours ?? options.defaultGraceHours ?? DEFAULT_FAMILY_PAYMENT_GRACE_HOURS);
  const safeGraceHours = Number.isFinite(graceHours)
    ? Math.max(DEFAULT_FAMILY_PAYMENT_GRACE_HOURS, Math.min(168, graceHours))
    : DEFAULT_FAMILY_PAYMENT_GRACE_HOURS;
  const studentName = paymentPersonName('Alumno', input.studentId || input.alumno_id, input.studentName, input.alumno_nombre, input.studentDisplayName);
  const teacherName = paymentPersonName('Profesor', input.teacherUid || input.profesor_id, input.teacherName, input.profesor_nombre, input.teacherDisplayName);
  return {
    id: input.id || paymentScheduleDocumentId(input),
    type: 'weekly_family_teacher_payment',
    status: 'active',
    active: input.active !== false,
    ownerUid: input.ownerUid || input.familyUserUid || input.userUid || '',
    familyUid: input.familyUid || input.familia_id || '',
    familia_id: input.familia_id || input.familyUid || '',
    teacherUid: input.teacherUid || input.profesor_id || '',
    profesor_id: input.profesor_id || input.teacherUid || '',
    studentId: input.studentId || input.alumno_id || '',
    alumno_id: input.alumno_id || input.studentId || '',
    studentName: isGenericPaymentPersonLabel(studentName) ? '' : studentName,
    alumno_nombre: isGenericPaymentPersonLabel(studentName) ? '' : studentName,
    teacherName: isGenericPaymentPersonLabel(teacherName) ? '' : teacherName,
    profesor_nombre: isGenericPaymentPersonLabel(teacherName) ? '' : teacherName,
    assignmentId: input.assignmentId || input.asignacion_id || '',
    asignacion_id: input.asignacion_id || input.assignmentId || '',
    frequency,
    paymentFrequency: frequency,
    frecuencia_pago: frequency,
    recurrenceDays: frequency === 'quincenal' ? 14 : 7,
    dayOfWeek,
    paymentDay: dayOfWeek,
    dia_semana_pago: dayOfWeek,
    anchorDate,
    paymentAnchorDate: anchorDate,
    fecha_inicio_pago: anchorDate,
    time,
    paymentTime: time,
    hora_pago: time,
    graceHours: safeGraceHours,
    grace_hours: safeGraceHours,
    label: cleanPaymentText(input.label || (
      frequency === 'quincenal' && anchorDate
        ? `Cada 15 dias desde ${anchorDate} ${time}`
        : `${WEEKLY_PAYMENT_DAY_LABELS[dayOfWeek]} ${time}`
    ), 120),
    notes: cleanPaymentText(input.notes || input.notas, 500),
    source: input.source || 'family_dashboard',
    updatedAtIso: nowIso,
  };
}

export function paymentScheduleLabel(schedule = {}) {
  if (!schedule || schedule.active === false) return 'Sin plan de pago';
  const frequency = normalizePaymentScheduleFrequency(schedule.frequency ?? schedule.paymentFrequency ?? schedule.frecuencia_pago);
  const day = normalizePaymentScheduleDay(schedule.dayOfWeek ?? schedule.paymentDay ?? schedule.dia_semana_pago);
  const time = normalizePaymentScheduleTime(schedule.time ?? schedule.paymentTime ?? schedule.hora_pago);
  if (frequency === 'quincenal') {
    const anchorDate = normalizePaymentScheduleAnchorDate(schedule.anchorDate || schedule.paymentAnchorDate || schedule.fecha_inicio_pago);
    const anchorLabel = anchorDate
      ? `${anchorDate.slice(8, 10)}/${anchorDate.slice(5, 7)}`
      : 'fecha pendiente';
    return `Cada 15 dias - ${anchorLabel} ${time}`;
  }
  return `${WEEKLY_PAYMENT_DAY_LABELS[day]} ${time}`;
}

export function weeklyPaymentDueAtForClass(classData = {}, schedule = null, options = {}) {
  const explicit = classData.paymentDueAt || classData.familyPaymentDueAt || classData.dueAt || classData.due_at;
  if (explicit) {
    const parsed = new Date(explicit);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (!schedule || schedule.active === false) return '';
  const classEnd = options.classEndAt || classData.endAt || classData.endsAt
    || (classData.fecha || classData.date
      ? `${classData.fecha || classData.date}T${cleanPaymentText(classData.hora_fin || classData.endTime || classData.hora_inicio || classData.startTime || '23:59', 5)}:00`
      : '');
  const due = scheduleDateFromClassDate(classEnd, schedule);
  return due ? due.toISOString() : '';
}

export function isClassFamilyPaid(classData = {}) {
  const status = normalizePaymentStatus(
    classData.familyPaymentStatus
    || classData.estado_pago_familia
    || classData.paymentStatus
    || classData.estado_pago
    || classData.status_pago_familia,
  );
  return PAID_PAYMENT_STATUSES.includes(status);
}

export function classFamilyPaymentState(classData = {}, schedule = null, options = {}) {
  if (isClassFamilyPaid(classData)) {
    return {
      state: 'paid',
      label: 'Justificante validado',
      badge: 'Pagada',
      dotClass: 'dot-emerald',
      tone: 'success',
      dueAt: classData.familyPaymentValidatedAt || classData.paidAt || '',
      overdue: false,
    };
  }
  const linkedStatusSource = cleanPaymentText(
    classData.linkedFamilyPaymentRawStatus
    || classData.linkedFamilyPaymentStatus
    || classData.familyPaymentReviewStatus
    || classData.pendingFamilyPaymentStatus,
    40,
  );
  const linkedRawStatus = linkedStatusSource ? normalizePaymentStatus(linkedStatusSource) : '';
  if (PAID_PAYMENT_STATUSES.includes(linkedRawStatus)) {
    return {
      state: 'paid',
      label: 'Justificante validado',
      badge: 'Pagada',
      dotClass: 'dot-emerald',
      tone: 'success',
      dueAt: classData.linkedFamilyPaymentValidatedAt || classData.linkedFamilyPaymentUpdatedAt || '',
      overdue: false,
      paymentId: classData.linkedFamilyPaymentId || '',
    };
  }
  if (OPEN_PAYMENT_STATUSES.includes(linkedRawStatus) || linkedRawStatus === 'vencido') {
    return {
      state: 'review',
      label: linkedRawStatus === 'vencido' ? 'Justificante vencido en revision' : 'Justificante en revision',
      badge: linkedRawStatus === 'vencido' ? 'Revision vencida' : 'En revision',
      dotClass: linkedRawStatus === 'vencido' ? 'dot-red' : 'dot-blue',
      tone: linkedRawStatus === 'vencido' ? 'danger' : 'info',
      dueAt: classData.linkedFamilyPaymentDueAt || classData.familyPaymentDueAt || classData.dueAt || '',
      overdue: linkedRawStatus === 'vencido',
      paymentId: classData.linkedFamilyPaymentId || '',
    };
  }
  if (['rechazado', 'fallido', 'devuelto', 'cancelado'].includes(linkedRawStatus)) {
    return {
      state: 'rejected',
      label: 'Justificante rechazado',
      badge: 'Rechazada',
      dotClass: 'dot-red',
      tone: 'danger',
      dueAt: classData.linkedFamilyPaymentDueAt || classData.familyPaymentDueAt || classData.dueAt || '',
      overdue: true,
      paymentId: classData.linkedFamilyPaymentId || '',
    };
  }
  const dueAt = weeklyPaymentDueAtForClass(classData, schedule, options);
  const graceHours = Number(schedule?.graceHours ?? schedule?.grace_hours ?? options.defaultGraceHours ?? DEFAULT_FAMILY_PAYMENT_GRACE_HOURS);
  const safeGraceHours = Number.isFinite(graceHours)
    ? Math.max(DEFAULT_FAMILY_PAYMENT_GRACE_HOURS, Math.min(168, graceHours))
    : DEFAULT_FAMILY_PAYMENT_GRACE_HOURS;
  const safeGraceMs = safeGraceHours * 3600000;
  const dueMs = dueAt ? new Date(dueAt).getTime() : NaN;
  const nowMs = Number(options.nowMs ?? Date.now());
  const overdue = Number.isFinite(dueMs) && dueMs + safeGraceMs < nowMs;
  return {
    state: overdue ? 'overdue' : 'pending',
    label: overdue ? 'Justificante vencido' : 'Justificante pendiente',
    badge: overdue ? 'Vencida +48h' : 'Pendiente',
    dotClass: overdue ? 'dot-red' : 'dot-amber',
    tone: overdue ? 'danger' : 'warning',
    dueAt,
    overdue,
    graceHours: safeGraceHours,
  };
}

function comparableDateValue(value) {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (Number.isFinite(value?.seconds)) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function classIdForPaymentContext(classData = {}) {
  return cleanPaymentText(classData.id || classData.classId || classData.calendarUid, 180);
}

function familyPaymentContextPriority(payment = {}) {
  const status = normalizePaymentStatus(payment.estado || payment.status);
  if (PAID_PAYMENT_STATUSES.includes(status)) return 50;
  if (OPEN_PAYMENT_STATUSES.includes(status)) return 40;
  if (status === 'vencido') return 35;
  if (['rechazado', 'fallido', 'devuelto', 'cancelado'].includes(status)) return 10;
  return 20;
}

function isDiscardedFamilyPayment(payment = {}) {
  const status = normalizePaymentStatus(payment.estado || payment.status);
  return ['rechazado', 'fallido', 'devuelto', 'cancelado'].includes(status);
}

export function applyClassPaymentContext(classes = [], payments = []) {
  const byClassId = new Map();
  for (const payment of payments || []) {
    if (!isFamilyPayment(payment) || !Array.isArray(payment.classIds) || !payment.classIds.length) continue;
    if (isDiscardedFamilyPayment(payment)) continue;
    if (!paymentShouldEnrichFamilyClass(payment)) continue;
    const rawStatus = normalizePaymentStatus(payment.estado || payment.status);
    const priority = familyPaymentContextPriority(payment);
    const updatedAtMs = comparableDateValue(payment.updated_at || payment.updatedAt || payment.created_at || payment.createdAt);
    for (const classId of payment.classIds.map(String).filter(Boolean)) {
      const current = byClassId.get(classId);
      if (current && (current.priority > priority || (current.priority === priority && current.updatedAtMs >= updatedAtMs))) continue;
      byClassId.set(classId, {
        priority,
        updatedAtMs,
        payment,
        rawStatus,
        badgeStatus: paymentStatusForBadge(payment),
      });
    }
  }

  return (classes || []).map((classData) => {
    const classId = classIdForPaymentContext(classData);
    const context = classId ? byClassId.get(classId) : null;
    if (!context) return classData;
    const payment = context.payment;
    return {
      ...classData,
      linkedFamilyPaymentId: payment.id || payment.paymentId || payment.documento_id || '',
      linkedFamilyPaymentStatus: context.badgeStatus,
      linkedFamilyPaymentRawStatus: context.rawStatus,
      linkedFamilyPaymentAmount: paymentAmount(payment),
      linkedFamilyPaymentCreatedAt: payment.created_at || payment.createdAt || '',
      linkedFamilyPaymentUpdatedAt: payment.updated_at || payment.updatedAt || '',
      linkedFamilyPaymentDueAt: payment.dueAt || payment.due_at || '',
      linkedFamilyPaymentReference: payment.referencia || payment.reference || payment.concepto || '',
    };
  });
}

export function classTeacherPaymentAmount(classData = {}) {
  return classAmountFromHourlyOrLegacy(
    classData,
    ['teacherHourlyRate', 'importe_hora_profesor', 'teacherRatePerHour', 'tarifa_hora_profesor'],
    ['importe_profesor', 'teacherAmount', 'teacherPrice', 'teacher_amount'],
  );
}

export function classPlatformFeeAmount(classData = {}) {
  const familyAmount = classPaymentAmount(classData);
  const teacherAmount = classTeacherPaymentAmount(classData);
  if (familyAmount || teacherAmount) return Math.round((familyAmount - teacherAmount) * 100) / 100;
  const explicit = paymentAmount({ amount: classData.comision_clasesde10 ?? classData.platformFee ?? classData.marginAmount });
  return explicit;
}

export function classEconomicState(classData = {}, schedule = null, options = {}) {
  const familyState = classFamilyPaymentState(classData, schedule, options);
  const familyAmount = classPaymentAmount(classData);
  const teacherAmount = classTeacherPaymentAmount(classData);
  const platformFee = classPlatformFeeAmount(classData);
  const marginPct = familyAmount > 0 ? Math.round((platformFee / familyAmount) * 1000) / 10 : 0;
  const classStatus = cleanPaymentText(classData.estado || classData.status, 40).toLowerCase();
  const teacherStatus = normalizePaymentStatus(
    classData.teacherPaymentStatus
    || classData.estado_pago_profesor
    || classData.teacherPayoutStatus
    || classData.payoutStatus,
  );
  const teacherPaid = PAID_PAYMENT_STATUSES.includes(teacherStatus)
    || teacherStatus === 'pagado'
    || Boolean(classData.teacherPayoutPaidAt);

  let state = 'pending';
  let label = 'Pendiente de justificar';
  let badge = 'Pendiente';
  let dotClass = 'dot-amber';
  let tone = 'warning';
  let sortRank = 40;

  if (['cancelada', 'cancelado', 'no_realizada'].includes(classStatus)) {
    state = 'cancelled';
    label = 'Sin cobro activo';
    badge = 'Cancelada';
    dotClass = 'dot-gray';
    tone = 'gray';
    sortRank = 90;
  } else if (familyAmount <= 0) {
    state = 'missing_amount';
    label = 'Falta importe de familia';
    badge = 'Sin importe';
    dotClass = 'dot-rose';
    tone = 'danger';
    sortRank = 10;
  } else if (familyState.state === 'rejected') {
    state = 'rejected';
    label = 'Justificante rechazado';
    badge = 'Rechazada';
    dotClass = 'dot-red';
    tone = 'danger';
    sortRank = 12;
  } else if (familyState.state === 'overdue') {
    state = 'overdue';
    label = 'Pago familiar vencido';
    badge = 'Vencida';
    dotClass = 'dot-red';
    tone = 'danger';
    sortRank = 15;
  } else if (familyState.state === 'review') {
    state = 'in_review';
    label = 'Justificante pendiente de validar';
    badge = 'En revision';
    dotClass = familyState.dotClass || 'dot-blue';
    tone = familyState.tone || 'info';
    sortRank = 20;
  } else if (teacherAmount <= 0) {
    state = 'missing_teacher_amount';
    label = 'Falta importe del profesor';
    badge = 'Sin importe prof.';
    dotClass = 'dot-rose';
    tone = 'danger';
    sortRank = 21;
  } else if (familyState.state === 'paid' && teacherAmount > 0 && !teacherPaid) {
    state = 'payout_pending';
    label = 'Familia cobrada, profesor pendiente';
    badge = 'Liquidar profesor';
    dotClass = 'dot-indigo';
    tone = 'navy';
    sortRank = 25;
  } else if (familyState.state === 'paid') {
    state = 'settled';
    label = 'Cobrada y liquidada';
    badge = 'Liquidada';
    dotClass = 'dot-emerald';
    tone = 'success';
    sortRank = 80;
  }

  return {
    state,
    label,
    badge,
    dotClass,
    tone,
    sortRank,
    calendarClass: `economic-${state}`,
    familyState,
    familyPaymentStatus: normalizePaymentStatus(
      classData.familyPaymentStatus
      || classData.estado_pago_familia
      || classData.paymentStatus
      || classData.estado_pago
      || classData.status_pago_familia
      || classData.linkedFamilyPaymentRawStatus,
    ),
    teacherPaymentStatus: teacherStatus,
    teacherPaid,
    familyAmount,
    teacherAmount,
    platformFee,
    marginPct,
    dueAt: familyState.dueAt || '',
    linkedFamilyPaymentId: classData.linkedFamilyPaymentId || '',
  };
}

export function economicCalendarLegend() {
  return [
    { className: 'dot-rose', label: 'Falta importe' },
    { className: 'dot-red', label: 'Vencida/incidencia' },
    { className: 'dot-blue', label: 'En revision' },
    { className: 'dot-amber', label: 'Pendiente' },
    { className: 'dot-indigo', label: 'Liquidar profesor' },
    { className: 'dot-emerald', label: 'Liquidada' },
  ];
}

export function paymentReference(payment = {}) {
  return cleanPaymentText(
    payment.providerPaymentId
    || payment.paymentIntentId
    || payment.checkoutSessionId
    || payment.referencia
    || payment.reference
    || payment.concepto,
    180,
  );
}

export function paymentFingerprint(payment = {}) {
  const classIds = Array.isArray(payment.classIds || payment.claseIds)
    ? (payment.classIds || payment.claseIds).map(String).filter(Boolean).sort().join(',')
    : '';
  return [
    cleanPaymentText(payment.gateway || payment.provider || 'manual', 40).toLowerCase(),
    cleanPaymentText(payment.metodo || payment.method || 'bizum', 40).toLowerCase(),
    paymentReference(payment).toLowerCase(),
    paymentAmount(payment).toFixed(2),
    cleanPaymentText(payment.familyUid || payment.familia_id || payment.teacherUid || payment.profesor_id, 180).toLowerCase(),
    classIds,
  ].filter(Boolean).join('|');
}

export function buildFamilyPaymentPayload(input = {}, options = {}) {
  const amount = paymentAmount(input);
  const method = cleanPaymentText(input.metodo || input.method || 'bizum', 40).toLowerCase();
  const gateway = cleanPaymentText(input.gateway || input.provider || 'manual', 40).toLowerCase();
  const status = storedPaymentStatus(input.estado || input.status || (isAutomaticGateway({ gateway }) ? 'procesando' : 'pendiente'));
  const nowIso = options.nowIso || new Date().toISOString();
  const dueDays = Number(options.defaultPaymentDueDays ?? options.paymentDueDays ?? 7);
  const safeDueDays = Number.isFinite(dueDays) ? Math.max(0, dueDays) : 7;
  const classIds = Array.isArray(input.classIds) ? input.classIds.map(String).filter(Boolean) : [];
  const recipient = familyPaymentRecipient();

  return {
    tipo: 'pago_familia',
    paymentType: 'family_payment',
    familia_id: input.familia_id || input.familyUid,
    familyUid: input.familyUid || input.familia_id,
    documento_id: input.documento_id || input.documentId || null,
    documentId: input.documentId || input.documento_id || null,
    monto: amount,
    amount,
    metodo: method,
    method,
    gateway,
    provider: gateway,
    estado: status,
    status,
    referencia: cleanPaymentText(input.referencia || input.reference, 180),
    reference: cleanPaymentText(input.reference || input.referencia, 180),
    concepto: cleanPaymentText(input.concepto || input.notes || input.notas_familia, 240),
    notas_familia: cleanPaymentText(input.notas_familia || input.familyNotes, 1000),
    familyNotes: cleanPaymentText(input.familyNotes || input.notas_familia, 1000),
    paymentRecipientName: recipient.name,
    paymentRecipientPhone: recipient.phone,
    paymentRecipientLabel: recipient.label,
    paymentRecipientRole: recipient.role,
    platformCollectsPayment: true,
    fundsFlow: recipient.fundsFlow,
    fundsFlowExplanation: recipient.explanation,
    classIds,
    classCount: classIds.length,
    reconciliationStatus: input.reconciliationStatus || (classIds.length ? 'matched' : 'pending_match'),
    verificationSource: input.verificationSource || (isAutomaticGateway({ gateway }) ? gateway : 'manual_proof'),
    verified: input.verified === true || PAID_PAYMENT_STATUSES.includes(status),
    dueAt: input.dueAt || input.due_at || paymentDueAtFromDate(new Date(nowIso), safeDueDays),
    due_at: input.due_at || input.dueAt || paymentDueAtFromDate(new Date(nowIso), safeDueDays),
    idempotencyKey: input.idempotencyKey || paymentFingerprint({
      ...input,
      gateway,
      metodo: method,
      monto: amount,
    }),
  };
}

export function buildTeacherPayoutPayload(teacherUid, input = {}) {
  const amount = paymentAmount(input);
  const classIds = Array.isArray(input.classIds) ? input.classIds.map(String).filter(Boolean) : [];
  return {
    ...input,
    tipo: 'pago_profesor',
    paymentType: 'teacher_payout',
    teacherUid,
    profesor_id: teacherUid,
    userUid: input.userUid || teacherUid,
    requestedByUid: input.requestedByUid || teacherUid,
    monto: amount,
    amount,
    metodo: 'bizum',
    method: 'bizum',
    gateway: input.gateway || 'manual',
    provider: input.provider || input.gateway || 'manual',
    estado: 'solicitado',
    status: 'solicitado',
    concepto: cleanPaymentText(input.concepto || `Bizum profesor - ${classIds.length} clase(s)`, 240),
    notas_profesor: cleanPaymentText(input.notas_profesor || input.teacherNotes, 1000),
    telefono_bizum: cleanPaymentText(input.telefono_bizum || input.bizumPhone, 40),
    classIds,
    classCount: classIds.length,
    reconciliationStatus: 'matched',
    verificationSource: 'admin_payout',
    idempotencyKey: input.idempotencyKey || paymentFingerprint({ ...input, teacherUid, monto: amount, metodo: 'bizum' }),
  };
}

export function buildPaymentValidationPayload(payment = {}, nextStatus = 'validado', validatorUid = '', options = {}) {
  const status = storedPaymentStatus(nextStatus);
  const nowIso = options.nowIso || new Date().toISOString();
  const verified = PAID_PAYMENT_STATUSES.includes(status);
  return {
    estado: status,
    status,
    verified,
    verificationSource: options.source || payment.verificationSource || (isAutomaticGateway(payment) ? payment.gateway : 'admin_manual'),
    validado_por: validatorUid || payment.validado_por || null,
    validatedByUid: validatorUid || payment.validatedByUid || null,
    fecha_validacion: verified ? nowIso : payment.fecha_validacion || null,
    validatedAt: verified ? nowIso : payment.validatedAt || null,
    rejectedAt: status === 'rechazado' ? nowIso : payment.rejectedAt || null,
    failureReason: status === 'rechazado' || status === 'fallido' ? cleanPaymentText(options.reason || payment.failureReason, 500) : payment.failureReason || null,
    updated_at: nowIso,
  };
}

export function buildGatewayPaymentUpdate(event = {}, options = {}) {
  const gateway = cleanPaymentText(event.gateway || event.provider || 'stripe', 40).toLowerCase();
  const providerStatus = cleanPaymentText(event.providerPaymentStatus || event.status, 80).toLowerCase();
  const status = storedPaymentStatus(providerStatus);
  const verified = PAID_PAYMENT_STATUSES.includes(status);
  const nowIso = options.nowIso || new Date().toISOString();

  return {
    gateway,
    provider: gateway,
    providerPaymentId: cleanPaymentText(event.providerPaymentId || event.paymentIntentId || event.id, 180),
    paymentIntentId: cleanPaymentText(event.paymentIntentId || event.providerPaymentId, 180),
    checkoutSessionId: cleanPaymentText(event.checkoutSessionId, 180),
    providerPaymentStatus: providerStatus,
    gatewayStatus: providerStatus,
    estado: verified ? 'validado' : status,
    status: verified ? 'validado' : status,
    verified,
    verificationSource: gateway,
    gatewayEventId: cleanPaymentText(event.eventId || event.gatewayEventId, 180),
    gatewayEventType: cleanPaymentText(event.eventType || event.type, 120),
    gatewayVerifiedAt: verified ? nowIso : null,
    fecha_validacion: verified ? nowIso : null,
    validatedAt: verified ? nowIso : null,
    updated_at: nowIso,
  };
}

function familyAttendanceDecision(classData = {}) {
  return cleanPaymentText(
    classData.familyConfirmationStatus
    || classData.confirmacion_familia
    || classData.familyAttendanceStatus,
    40,
  ).toLowerCase();
}

export function hasFamilyAttendanceDecision(classData = {}) {
  return ['realizada', 'no_realizada', 'incidencia'].includes(familyAttendanceDecision(classData));
}

export function hasTeacherAttendanceDecision(classData = {}) {
  const explicit = cleanPaymentText(
    classData.teacherConfirmationStatus
    || classData.teacherAttendanceStatus
    || classData.confirmacion_profesor,
    40,
  ).toLowerCase();
  if (['realizada', 'no_realizada'].includes(explicit)) return true;
  const operational = cleanPaymentText(classData.estado || classData.status, 40).toLowerCase();
  return ['realizada', 'completada', 'completed', 'pagada', 'paid'].includes(operational);
}

export function isFamilyConfirmedGivenClass(classData = {}) {
  return hasTeacherAttendanceDecision(classData) && familyAttendanceDecision(classData) === 'realizada';
}

function classEndMsForPayment(classData = {}) {
  const explicit = classData.endAt || classData.endsAt || classData.end_at || classData.classEndAt;
  if (explicit?.toDate) return explicit.toDate().getTime();
  if (Number.isFinite(explicit?.seconds)) return explicit.seconds * 1000;
  if (explicit) {
    const parsed = new Date(explicit).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  const date = cleanPaymentText(classData.fecha || classData.date, 20).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const time = cleanPaymentText(classData.hora_fin || classData.endTime || classData.hora_inicio || classData.startTime || '23:59', 8).slice(0, 5);
  const parsed = new Date(`${date}T${/^\d{2}:\d{2}$/.test(time) ? time : '23:59'}:00`).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
}

function classIsCancelledForPayment(classData = {}) {
  const status = cleanPaymentText(classData.estado || classData.status || classData.lifecycleStatus, 60).toLowerCase();
  return ['cancelada', 'cancelado', 'no_realizada', 'reprogramada'].includes(status);
}

export function unpaidFamilyClasses(classes = []) {
  return classes.filter((item) => {
    const paymentStatus = normalizePaymentStatus(item.familyPaymentStatus || item.estado_pago_familia || item.estado_pago || item.paymentStatus);
    return isFamilyConfirmedGivenClass(item)
      && !classIsCancelledForPayment(item)
      && !PAID_PAYMENT_STATUSES.includes(paymentStatus)
      && classPaymentAmount(item) > 0;
  });
}

/**
 * Derives the family payment gate from class facts only. A proof that is still
 * being reviewed deliberately does not unlock access: the linked classes only
 * become paid after an administrator validates that proof.
 */
export function buildFamilyPaymentAccessState(classes = [], scheduleIndex = new Map(), options = {}) {
  const nowMs = Number(options.nowMs ?? Date.now());
  const lockDays = Math.max(1, Number(options.lockDays ?? FAMILY_PAYMENT_ACCESS_LOCK_DAYS) || FAMILY_PAYMENT_ACCESS_LOCK_DAYS);
  const lockAgeMs = lockDays * PAYMENT_DAY_MS;
  const activeClasses = (classes || []).filter((item) => !classIsCancelledForPayment(item));
  const unpaidClasses = unpaidFamilyClasses(activeClasses);
  const overdueDebtClasses = [];

  for (const classData of unpaidClasses) {
    const schedule = paymentScheduleForClass(classData, scheduleIndex);
    const dueAt = weeklyPaymentDueAtForClass(classData, schedule, options);
    const dueMs = dueAt ? new Date(dueAt).getTime() : classEndMsForPayment(classData);
    if (!Number.isFinite(dueMs) || nowMs - dueMs <= lockAgeMs) continue;
    overdueDebtClasses.push({
      ...classData,
      paymentDueAt: dueAt || new Date(dueMs).toISOString(),
      paymentOverdueDays: Math.floor((nowMs - dueMs) / PAYMENT_DAY_MS),
      paymentAmount: classPaymentAmount(classData),
    });
  }

  const unmarkedDueClasses = activeClasses.filter((classData) => {
    if (hasFamilyAttendanceDecision(classData)) return false;
    const endedMs = classEndMsForPayment(classData);
    if (!Number.isFinite(endedMs) || endedMs > nowMs) return false;
    const schedule = paymentScheduleForClass(classData, scheduleIndex);
    const dueAt = weeklyPaymentDueAtForClass(classData, schedule, options);
    const dueMs = dueAt ? new Date(dueAt).getTime() : endedMs;
    return Number.isFinite(dueMs) && dueMs <= nowMs;
  }).map((classData) => ({
    ...classData,
    paymentDueAt: weeklyPaymentDueAtForClass(classData, paymentScheduleForClass(classData, scheduleIndex), options),
  }));

  const oldestDebt = overdueDebtClasses
    .slice()
    .sort((a, b) => String(a.paymentDueAt || '').localeCompare(String(b.paymentDueAt || '')))[0] || null;
  const debtAmount = Math.round(overdueDebtClasses.reduce((sum, item) => sum + classPaymentAmount(item), 0) * 100) / 100;
  const waitingTeacherClasses = unmarkedDueClasses.filter((classData) => !hasTeacherAttendanceDecision(classData));
  const familyDecisionRequiredClasses = unmarkedDueClasses.filter((classData) => hasTeacherAttendanceDecision(classData));

  return {
    locked: overdueDebtClasses.length > 0,
    reason: overdueDebtClasses.length ? 'unpaid_classes_over_30_days' : '',
    lockDays,
    debtAmount,
    debtClassCount: overdueDebtClasses.length,
    debtClassIds: overdueDebtClasses.map((item) => String(item.id || '')).filter(Boolean),
    overdueDebtClasses,
    oldestDebtDueAt: oldestDebt?.paymentDueAt || '',
    oldestDebtDays: Number(oldestDebt?.paymentOverdueDays || 0),
    unmarkedDueClassCount: unmarkedDueClasses.length,
    unmarkedDueClassIds: unmarkedDueClasses.map((item) => String(item.id || '')).filter(Boolean),
    unmarkedDueClasses,
    waitingTeacherClassCount: waitingTeacherClasses.length,
    waitingTeacherClassIds: waitingTeacherClasses.map((item) => String(item.id || '')).filter(Boolean),
    familyDecisionRequiredClassCount: familyDecisionRequiredClasses.length,
    familyDecisionRequiredClassIds: familyDecisionRequiredClasses.map((item) => String(item.id || '')).filter(Boolean),
    paymentSubmissionBlocked: unmarkedDueClasses.length > 0,
  };
}

export function buildFamilyPaymentAccessPatch(access = {}, options = {}) {
  const nowIso = options.nowIso || new Date().toISOString();
  return {
    paymentAccessLocked: access.locked === true,
    paymentAccessStatus: access.locked === true ? 'blocked_overdue_payment' : 'active',
    paymentAccessReason: access.locked === true ? (access.reason || 'unpaid_classes_over_30_days') : null,
    paymentAccessDebtAmount: access.locked === true ? Math.round(Number(access.debtAmount || 0) * 100) / 100 : 0,
    paymentAccessDebtClassCount: access.locked === true ? Number(access.debtClassCount || 0) : 0,
    paymentAccessDebtClassIds: access.locked === true ? (access.debtClassIds || []).map(String).filter(Boolean).slice(0, 100) : [],
    paymentAccessOldestDebtDueAt: access.locked === true ? (access.oldestDebtDueAt || null) : null,
    paymentAccessLockedAt: access.locked === true ? (options.lockedAt || nowIso) : null,
    paymentAccessRestoredAt: access.locked === true ? null : nowIso,
    paymentAccessUpdatedAt: nowIso,
  };
}

function paymentHasReviewableProof(payment = {}) {
  return Boolean(
    payment.documentId
    || payment.documento_id
    || payment.storage_path
    || payment.storagePath
    || payment.proofUrl
    || payment.receiptUrl
  );
}

function paymentShouldEnrichFamilyClass(payment = {}) {
  const status = normalizePaymentStatus(payment.estado || payment.status);
  if (PAID_PAYMENT_STATUSES.includes(status)) return true;
  if (['rechazado', 'fallido', 'devuelto', 'disputado', 'cancelado'].includes(status)) return false;
  if (OPEN_PAYMENT_STATUSES.includes(status) || status === 'vencido') {
    return paymentHasReviewableProof(payment) || isAutomaticGateway(payment);
  }
  return true;
}

function paymentBlocksClassConfirmation(payment = {}) {
  const status = normalizePaymentStatus(payment.estado || payment.status);
  if (!isFamilyPayment(payment) || !Array.isArray(payment.classIds) || !payment.classIds.length) return false;
  if (['rechazado', 'fallido', 'devuelto', 'disputado', 'cancelado'].includes(status)) return false;
  if (PAID_PAYMENT_STATUSES.includes(status)) return true;
  if (OPEN_PAYMENT_STATUSES.includes(status) || status === 'vencido') {
    return paymentHasReviewableProof(payment) || isAutomaticGateway(payment);
  }
  return true;
}

export function classPaymentAmount(classData = {}) {
  return classAmountFromHourlyOrLegacy(
    classData,
    ['familyHourlyRate', 'precio_hora_familia', 'familyRatePerHour', 'tarifa_hora_familia'],
    ['precio_total', 'amount', 'familyAmount'],
  );
}

function familyCollectionBizumPhone() {
  return FAMILY_PAYMENT_RECIPIENT.phone;
}

function classPaymentGroupKey(classData = {}, state = {}) {
  const assignmentId = cleanPaymentText(classData.assignmentId || classData.asignacion_id, 180);
  const teacherUid = cleanPaymentText(classData.teacherUid || classData.profesor_id, 180);
  const studentId = cleanPaymentText(classData.studentId || classData.alumno_id, 180);
  const dueKey = state.dueAt ? String(state.dueAt).slice(0, 10) : 'sin-plan';
  return [assignmentId || `${teacherUid}:${studentId}`, dueKey].join('|');
}

function previousPaymentDueAtForSchedule(dueAt = '', schedule = null) {
  if (!dueAt || !schedule || schedule.active === false) return '';
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return '';
  const frequency = normalizePaymentScheduleFrequency(schedule.frequency ?? schedule.paymentFrequency ?? schedule.frecuencia_pago);
  date.setDate(date.getDate() - (frequency === 'quincenal' ? 14 : 7));
  return date.toISOString();
}

export function buildFamilyPaymentConfirmationGroups(classes = [], payments = [], scheduleIndex = new Map(), options = {}) {
  const blockedClassIds = new Set();
  for (const payment of payments || []) {
    if (!paymentBlocksClassConfirmation(payment)) continue;
    payment.classIds.map(String).filter(Boolean).forEach((classId) => blockedClassIds.add(classId));
  }

  const groups = new Map();
  for (const classData of unpaidFamilyClasses(classes)) {
    const classId = String(classData.id || '');
    if (!classId || blockedClassIds.has(classId)) continue;

    const schedule = paymentScheduleForClass(classData, scheduleIndex);
    const state = classFamilyPaymentState(classData, schedule, options);
    const key = classPaymentGroupKey(classData, state);
    const amount = classPaymentAmount(classData);
    const paymentPeriodEnd = state.dueAt || '';
    const paymentPeriodStart = previousPaymentDueAtForSchedule(paymentPeriodEnd, schedule);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        familyUid: classData.familyUid || classData.familia_id || '',
        familia_id: classData.familia_id || classData.familyUid || '',
        teacherUid: classData.teacherUid || classData.profesor_id || '',
        profesor_id: classData.profesor_id || classData.teacherUid || '',
        studentId: classData.studentId || classData.alumno_id || '',
        alumno_id: classData.alumno_id || classData.studentId || '',
        assignmentId: classData.assignmentId || classData.asignacion_id || '',
        asignacion_id: classData.asignacion_id || classData.assignmentId || '',
        studentName: paymentPersonName('Alumno', classData.studentId || classData.alumno_id, classData.studentName, classData.alumno_nombre, classData.alumnoNombre),
        teacherName: paymentPersonName('Profesor', classData.teacherUid || classData.profesor_id, classData.teacherName, classData.profesor_nombre, classData.profesorNombre),
        paymentRecipientName: FAMILY_PAYMENT_RECIPIENT.name,
        paymentRecipientPhone: familyCollectionBizumPhone(),
        paymentRecipientLabel: FAMILY_PAYMENT_RECIPIENT.label,
        paymentRecipientRole: FAMILY_PAYMENT_RECIPIENT.role,
        fundsFlow: FAMILY_PAYMENT_RECIPIENT.fundsFlow,
        fundsFlowExplanation: FAMILY_PAYMENT_RECIPIENT.explanation,
        teacherPhone: '',
        bizumPhone: familyCollectionBizumPhone(),
        dueAt: state.dueAt || '',
        paymentPeriodStart,
        paymentPeriodEnd,
        state: state.state,
        overdue: state.overdue === true,
        hasOverdueCarryover: false,
        overdueAmount: 0,
        currentPeriodAmount: 0,
        graceHours: state.graceHours || null,
        amount: 0,
        classIds: [],
        classes: [],
        currentPeriodClasses: [],
        overdueClasses: [],
        subjects: new Set(),
      });
    }

    const group = groups.get(key);
    group.amount = Math.round((group.amount + amount) * 100) / 100;
    group.currentPeriodAmount = Math.round((group.currentPeriodAmount + amount) * 100) / 100;
    group.classIds.push(classId);
    group.paymentRecipientName = FAMILY_PAYMENT_RECIPIENT.name;
    group.paymentRecipientPhone = familyCollectionBizumPhone();
    group.paymentRecipientLabel = FAMILY_PAYMENT_RECIPIENT.label;
    group.paymentRecipientRole = FAMILY_PAYMENT_RECIPIENT.role;
    group.fundsFlow = FAMILY_PAYMENT_RECIPIENT.fundsFlow;
    group.fundsFlowExplanation = FAMILY_PAYMENT_RECIPIENT.explanation;
    group.bizumPhone = familyCollectionBizumPhone();
    const dueMs = state.dueAt ? new Date(state.dueAt).getTime() : NaN;
    const dueNow = !state.overdue && (!Number.isFinite(dueMs) || dueMs <= Number(options.nowMs ?? Date.now()));
    const classLine = {
      id: classId,
      date: classData.fecha || classData.date || '',
      startTime: classData.hora_inicio || classData.startTime || '',
      endTime: classData.hora_fin || classData.endTime || '',
      subject: cleanPaymentText(classData.materia || classData.subject || '', 160),
      amount,
      paymentDueAt: state.dueAt || '',
      paymentPeriodStart,
      paymentPeriodEnd,
      paymentBucket: state.overdue ? 'overdue' : dueNow ? 'due' : 'upcoming',
    };
    group.classes.push(classLine);
    group.currentPeriodClasses.push(classLine);
    if (classData.materia || classData.subject) group.subjects.add(cleanPaymentText(classData.materia || classData.subject, 160));
    if (state.overdue) {
      group.state = 'overdue';
      group.overdue = true;
    }
    if (!group.dueAt && state.dueAt) group.dueAt = state.dueAt;
  }

  return Array.from(groups.values()).map((group) => {
    const dueMs = group.dueAt ? new Date(group.dueAt).getTime() : NaN;
    const dueNow = !group.overdue && (!Number.isFinite(dueMs) || dueMs <= Number(options.nowMs ?? Date.now()));
    const upcoming = !group.overdue && !dueNow;
    return {
      ...group,
      classCount: group.classIds.length,
      subjects: Array.from(group.subjects),
      dueNow,
      upcoming,
      paymentWindow: group.overdue ? 'overdue' : dueNow ? 'due_now' : 'upcoming',
      status: group.overdue ? 'vencido' : dueNow ? 'pendiente' : 'programado',
      label: `${group.classIds.length} clase(s) de ${group.studentName} con ${group.teacherName}`,
    };
  }).sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.dueNow !== b.dueNow) return a.dueNow ? -1 : 1;
    return String(a.dueAt || '9999').localeCompare(String(b.dueAt || '9999'));
  });
}

/**
 * Builds the single mandatory payment that a family owes on one payment day.
 * It crosses student/teacher relations so no older debt can be left behind by
 * submitting only one of several otherwise independent payment groups.
 */
export function buildFamilyAllDuePaymentGroup(groups = [], dueDateIso = '', options = {}) {
  const targetDate = cleanPaymentText(dueDateIso, 10).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return null;
  const dateKey = typeof options.dateKey === 'function'
    ? options.dateKey
    : (group) => cleanPaymentText(group.dueDate || group.date || group.fecha || group.dueAt || group.due_at, 40).slice(0, 10);
  const eligible = (groups || []).filter((group) => {
    const dueDate = cleanPaymentText(dateKey(group), 10).slice(0, 10);
    return dueDate ? dueDate <= targetDate : options.includeUndated !== false;
  });
  if (!eligible.length) return null;

  const currentGroups = eligible.filter((group) => cleanPaymentText(dateKey(group), 10).slice(0, 10) === targetDate);
  const carryoverGroups = eligible.filter((group) => cleanPaymentText(dateKey(group), 10).slice(0, 10) !== targetDate);
  const mergeLines = (sourceGroups, bucket) => {
    const lines = new Map();
    sourceGroups.forEach((group) => {
      (group.classes || []).forEach((classData) => {
        const id = cleanPaymentText(classData.id || classData.classId || classData.calendarUid, 180);
        if (!id || lines.has(id)) return;
        lines.set(id, {
          ...classData,
          id,
          paymentBucket: bucket,
          paymentDueAt: classData.paymentDueAt || group.dueAt || group.due_at || '',
          originalDueAt: classData.originalDueAt || group.dueAt || group.due_at || '',
          amount: paymentAmount({ amount: classData.amount }),
        });
      });
    });
    return Array.from(lines.values()).sort((left, right) => (
      String(left.date || left.fecha || '').localeCompare(String(right.date || right.fecha || ''))
        || String(left.startTime || left.hora_inicio || '').localeCompare(String(right.startTime || right.hora_inicio || ''))
        || String(left.id).localeCompare(String(right.id))
    ));
  };
  const overdueClasses = mergeLines(carryoverGroups, 'overdue');
  const overdueClassIds = new Set(overdueClasses.map((item) => item.id));
  const currentPeriodClasses = mergeLines(currentGroups, 'due')
    .filter((item) => !overdueClassIds.has(item.id));
  const classes = [...overdueClasses, ...currentPeriodClasses];
  if (!classes.length && options.allowScheduleOnly !== true) return null;

  const sumLines = (lines) => Math.round(lines.reduce((sum, item) => sum + paymentAmount({ amount: item.amount }), 0) * 100) / 100;
  const currentPeriodAmount = sumLines(currentPeriodClasses);
  const overdueAmount = sumLines(overdueClasses);
  const amount = Math.round((currentPeriodAmount + overdueAmount) * 100) / 100;
  const sourceGroups = [...carryoverGroups, ...currentGroups];
  const first = sourceGroups[0] || {};
  const uniqueValues = (...keys) => Array.from(new Set(sourceGroups
    .flatMap((group) => keys.map((key) => cleanPaymentText(group[key], 180)))
    .filter(Boolean)));
  const studentNames = uniqueValues('studentName', 'alumno_nombre');
  const teacherNames = uniqueValues('teacherName', 'profesor_nombre');
  const studentIds = uniqueValues('studentId', 'alumno_id');
  const teacherIds = uniqueValues('teacherUid', 'profesor_id');
  const assignmentIds = uniqueValues('assignmentId', 'asignacion_id');
  const studentCount = studentIds.length || studentNames.length || 1;
  const teacherCount = teacherIds.length || teacherNames.length || 1;
  const studentLabel = studentCount === 1 && studentNames[0] ? studentNames[0] : `${studentCount} alumno${studentCount === 1 ? '' : 's'}`;
  const teacherLabel = teacherCount === 1 && teacherNames[0] ? teacherNames[0] : `${teacherCount} profesor${teacherCount === 1 ? '' : 'es'}`;
  const dueAt = options.dueAt
    || currentGroups.map((group) => group.dueAt || group.due_at).filter(Boolean).sort().at(-1)
    || `${targetDate}T23:59:59.999Z`;
  const dueMs = new Date(dueAt).getTime();
  const nowMs = Number(options.nowMs ?? Date.now());
  const overdue = overdueClasses.length > 0 || sourceGroups.some((group) => group.overdue === true);
  const dueNow = Number.isFinite(dueMs) ? dueMs <= nowMs : targetDate <= new Date(nowMs).toISOString().slice(0, 10);
  const subjects = Array.from(new Set(sourceGroups.flatMap((group) => group.subjects || []).map((item) => cleanPaymentText(item, 160)).filter(Boolean)));

  return {
    ...first,
    key: options.key || `family-all-due|${targetDate}`,
    familyUid: first.familyUid || first.familia_id || '',
    familia_id: first.familia_id || first.familyUid || '',
    teacherUid: teacherIds.length === 1 ? teacherIds[0] : '',
    profesor_id: teacherIds.length === 1 ? teacherIds[0] : '',
    studentId: studentIds.length === 1 ? studentIds[0] : '',
    alumno_id: studentIds.length === 1 ? studentIds[0] : '',
    assignmentId: assignmentIds.length === 1 ? assignmentIds[0] : '',
    asignacion_id: assignmentIds.length === 1 ? assignmentIds[0] : '',
    studentName: studentLabel,
    alumno_nombre: studentLabel,
    teacherName: teacherLabel,
    profesor_nombre: teacherLabel,
    dueAt,
    dueDate: targetDate,
    paymentPeriodStart: currentGroups.map((group) => group.paymentPeriodStart).filter(Boolean).sort()[0] || '',
    paymentPeriodEnd: dueAt,
    amount,
    currentPeriodAmount,
    overdueAmount,
    classIds: classes.map((item) => item.id),
    classes,
    currentPeriodClasses,
    overdueClasses,
    classCount: classes.length,
    currentPeriodClassCount: currentPeriodClasses.length,
    overdueClassCount: overdueClasses.length,
    overdue,
    hasOverdueCarryover: overdueClasses.length > 0,
    dueNow,
    upcoming: !dueNow,
    paymentWindow: overdue ? 'overdue' : dueNow ? 'due_now' : 'upcoming',
    status: overdue ? 'vencido' : dueNow ? 'pendiente' : 'programado',
    scheduleOnly: amount <= 0,
    subjects,
    sourceGroupKeys: Array.from(new Set(sourceGroups.map((group) => group.key).filter(Boolean))),
    relationCount: new Set(sourceGroups.map((group) => [
      group.assignmentId || group.asignacion_id || '',
      group.teacherUid || group.profesor_id || '',
      group.studentId || group.alumno_id || '',
    ].join('|'))).size,
  };
}

/**
 * Rebuilds the debt that existed when a family submitted a proof and verifies
 * that the proof covers that debt exactly. Pending proofs are deliberately not
 * subtracted here: accepting two partial proofs must never be an alternative to
 * the one complete payment required from the family.
 */
export function validateFamilyPaymentCompleteness(payment = {}, classes = [], scheduleIndex = new Map(), options = {}) {
  const submittedAtMs = Number(options.nowMs ?? (
    comparableDateValue(
      payment.created_at
      || payment.createdAt
      || payment.submittedAt
      || payment.submitted_at,
    ) || Date.now()
  ));
  const submittedDateIso = cleanPaymentText(
    options.dateIso || new Date(submittedAtMs).toISOString().slice(0, 10),
    10,
  ).slice(0, 10);
  const rawClassIds = Array.isArray(payment.classIds) && payment.classIds.length
    ? payment.classIds.map(String).filter(Boolean)
    : [payment.classId, payment.class_id, payment.clase_id].map((id) => cleanPaymentText(id, 180)).filter(Boolean);
  const submittedClassIds = Array.from(new Set(rawClassIds)).sort();
  const access = buildFamilyPaymentAccessState(classes, scheduleIndex, { ...options, nowMs: submittedAtMs });
  const groups = buildFamilyPaymentConfirmationGroups(classes, [], scheduleIndex, { ...options, nowMs: submittedAtMs });
  const expectedGroup = buildFamilyAllDuePaymentGroup(groups, submittedDateIso, {
    dateKey: options.dateKey,
    dueAt: options.dueAt,
    includeUndated: true,
    key: `family-all-due-validation-${submittedDateIso}`,
    nowMs: submittedAtMs,
  });
  const expectedClassIds = Array.from(new Set((expectedGroup?.classIds || []).map(String).filter(Boolean))).sort();
  const submittedAmount = paymentAmount(payment);
  const expectedAmount = paymentAmount({ amount: expectedGroup?.amount || 0 });
  const sameClassIds = expectedClassIds.length === submittedClassIds.length
    && expectedClassIds.every((id, index) => id === submittedClassIds[index]);
  const exactAmount = Math.abs(expectedAmount - submittedAmount) < 0.01;
  const duplicateClassIds = rawClassIds.length !== submittedClassIds.length;

  let reason = 'matched_all_due_classes';
  if (access.paymentSubmissionBlocked) reason = 'attendance_decision_required';
  else if (!expectedClassIds.length) reason = 'no_due_classes';
  else if (duplicateClassIds) reason = 'duplicate_class_ids';
  else if (!sameClassIds) reason = 'class_set_mismatch';
  else if (!exactAmount) reason = 'amount_mismatch';

  return {
    valid: reason === 'matched_all_due_classes',
    reason,
    submittedAtMs,
    submittedDateIso,
    submittedAmount,
    expectedAmount,
    submittedClassIds,
    expectedClassIds,
    missingClassIds: expectedClassIds.filter((id) => !submittedClassIds.includes(id)),
    unexpectedClassIds: submittedClassIds.filter((id) => !expectedClassIds.includes(id)),
    duplicateClassIds,
    access,
    expectedGroup,
  };
}

export function buildFamilyClassPaymentConfirmationPayload(group = {}, input = {}, options = {}) {
  const classIds = Array.isArray(input.classIds) && input.classIds.length
    ? input.classIds.map(String).filter(Boolean)
    : (Array.isArray(group.classIds) ? group.classIds.map(String).filter(Boolean) : []);
  const amount = paymentAmount({ amount: input.monto ?? input.amount ?? group.amount });
  const concept = cleanPaymentText(
    input.concepto
      || `Justificante ${classIds.length || group.classCount || 1} clase(s) - ${paymentPersonName('Alumno', group.studentId || group.alumno_id, group.studentName)}`,
    240,
  );

  return buildFamilyPaymentPayload({
    ...input,
    familyUid: input.familyUid || input.familia_id || group.familyUid || group.familia_id,
    familia_id: input.familia_id || input.familyUid || group.familia_id || group.familyUid,
    teacherUid: input.teacherUid || input.profesor_id || group.teacherUid || group.profesor_id,
    profesor_id: input.profesor_id || input.teacherUid || group.profesor_id || group.teacherUid,
    studentId: input.studentId || input.alumno_id || group.studentId || group.alumno_id,
    alumno_id: input.alumno_id || input.studentId || group.alumno_id || group.studentId,
    assignmentId: input.assignmentId || input.asignacion_id || group.assignmentId || group.asignacion_id,
    asignacion_id: input.asignacion_id || input.assignmentId || group.asignacion_id || group.assignmentId,
    monto: amount,
    amount,
    classIds,
    dueAt: input.dueAt || input.due_at || group.dueAt,
    due_at: input.due_at || input.dueAt || group.dueAt,
    concepto: concept,
    notas_familia: input.notas_familia || input.familyNotes || concept,
    familyNotes: input.familyNotes || input.notas_familia || concept,
    verificationSource: input.verificationSource || 'family_dashboard_confirmation',
  }, options);
}

export function matchPaymentToClasses(payment = {}, classes = []) {
  const explicit = Array.isArray(payment.classIds) ? payment.classIds.map(String).filter(Boolean) : [];
  if (explicit.length) return { status: 'matched', classIds: explicit, confidence: 1, reason: 'explicit_class_ids' };

  const amount = paymentAmount(payment);
  const unpaid = unpaidFamilyClasses(classes);
  const exactSingle = unpaid.find((item) => classPaymentAmount(item) === amount);
  if (exactSingle) return { status: 'matched', classIds: [String(exactSingle.id)], confidence: 0.96, reason: 'single_exact_amount' };

  const sorted = unpaid
    .map((item) => ({
      id: String(item.id),
      amount: classPaymentAmount(item),
      date: item.fecha || item.date || '',
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const matched = [];
  let sum = 0;
  for (const item of sorted) {
    if (sum + item.amount > amount + 0.001) continue;
    matched.push(item.id);
    sum = Math.round((sum + item.amount) * 100) / 100;
    if (sum === amount) break;
  }

  if (matched.length && sum === amount) return { status: 'matched', classIds: matched, confidence: 0.9, reason: 'oldest_open_sum_exact' };
  return { status: 'unmatched', classIds: [], confidence: 0, reason: 'no_exact_amount_match' };
}

export const PAYMENT_AI_REVIEW_VERSION = 'payment_ai_review_v1';

function clampPaymentConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(0.99, Math.round(number * 100) / 100));
}

function paymentId(payment = {}) {
  return cleanPaymentText(payment.id || payment.paymentId || payment.uid, 180);
}

function paymentFamilyKey(payment = {}) {
  return cleanPaymentText(payment.familyUid || payment.familia_id || payment.usuario_id || payment.userUid, 180).toLowerCase();
}

function paymentClassIds(payment = {}) {
  return Array.isArray(payment.classIds) ? payment.classIds.map(String).filter(Boolean) : [];
}

function classByIds(classes = [], classIds = []) {
  const wanted = new Set((classIds || []).map(String));
  return (classes || []).filter((classData) => wanted.has(String(classData.id || classData.classId || '')));
}

function hasPaymentProof(payment = {}) {
  return Boolean(
    payment.documentId
    || payment.documento_id
    || payment.storage_path
    || payment.proofUrl
    || payment.receiptUrl
    || paymentReference(payment),
  );
}

function paymentDuplicateCandidates(payment = {}, payments = []) {
  const id = paymentId(payment);
  const currentFamily = paymentFamilyKey(payment);
  const currentReference = paymentReference(payment).toLowerCase();
  const currentIdempotency = cleanPaymentText(payment.idempotencyKey, 240).toLowerCase();
  const currentAmount = paymentAmount(payment);
  const currentClasses = new Set(paymentClassIds(payment));

  return (payments || []).filter((candidate) => {
    const candidateId = paymentId(candidate);
    if (!candidate || !candidateId || candidateId === id) return false;
    if (!isFamilyPayment(candidate)) return false;
    const status = normalizePaymentStatus(candidate.estado || candidate.status);
    if (['rechazado', 'fallido', 'devuelto', 'cancelado'].includes(status)) return false;
    const candidateFamily = paymentFamilyKey(candidate);
    if (currentFamily && candidateFamily && currentFamily !== candidateFamily) return false;

    const candidateIdempotency = cleanPaymentText(candidate.idempotencyKey, 240).toLowerCase();
    if (currentIdempotency && candidateIdempotency && currentIdempotency === candidateIdempotency) return true;

    const candidateReference = paymentReference(candidate).toLowerCase();
    if (currentReference && candidateReference && currentReference === candidateReference && paymentAmount(candidate) === currentAmount) return true;

    const candidateClasses = paymentClassIds(candidate);
    return currentClasses.size > 0 && candidateClasses.some((classId) => currentClasses.has(String(classId)));
  });
}

function paymentReviewFingerprint(payment = {}, reviewBits = {}) {
  return [
    PAYMENT_AI_REVIEW_VERSION,
    paymentId(payment),
    normalizePaymentStatus(payment.estado || payment.status),
    paymentAmount(payment).toFixed(2),
    paymentReference(payment).toLowerCase(),
    paymentClassIds(payment).sort().join(','),
    (reviewBits.matchedClassIds || []).map(String).sort().join(','),
    (reviewBits.duplicatePaymentIds || []).map(String).sort().join(','),
    Number(reviewBits.amountDelta || 0).toFixed(2),
  ].join('|').slice(0, 900);
}

function confidenceLabel(confidence) {
  if (confidence >= 0.9) return 'alta';
  if (confidence >= 0.65) return 'media';
  return 'baja';
}

export function reviewPaymentWithAssistant(payment = {}, classes = [], payments = [], options = {}) {
  const nowIso = options.nowIso || new Date().toISOString();
  const status = normalizePaymentStatus(payment.estado || payment.status);
  const paidAmount = paymentAmount(payment);
  const familyPayment = isFamilyPayment(payment);
  const teacherPayout = isTeacherPayout(payment);
  const automaticGateway = isAutomaticGateway(payment);
  const verifiedGateway = automaticGateway && isPaymentVerified(payment);
  const checks = [];
  const reasons = [];
  const risks = [];

  function addCheck(id, label, state, detail = '') {
    checks.push({ id, label, state, detail: cleanPaymentText(detail, 300) });
  }

  if (teacherPayout) {
    addCheck('payment_type', 'Tipo de pago', 'manual_review', 'Los Bizum a profesores requieren confirmacion administrativa.');
    const confidence = status === 'solicitado' ? 0.74 : 0.82;
    const review = {
      version: PAYMENT_AI_REVIEW_VERSION,
      recommendation: PAID_PAYMENT_STATUSES.includes(status) ? 'ignore' : 'admin_review',
      autoAction: 'none',
      confidence,
      confidenceLabel: confidenceLabel(confidence),
      status: 'teacher_payout_manual',
      summary: PAID_PAYMENT_STATUSES.includes(status)
        ? 'Pago a profesor ya marcado como pagado.'
        : 'Solicitud de Bizum a profesor pendiente de confirmacion por el administrador.',
      reasons: ['Pago de profesor: se mantiene supervision humana para evitar liquidaciones indebidas.'],
      risks: PAID_PAYMENT_STATUSES.includes(status) ? [] : ['No existe confirmacion bancaria automatica del Bizum saliente.'],
      checks,
      paidAmount,
      expectedAmount: paidAmount,
      amountDelta: 0,
      matchedClassIds: paymentClassIds(payment),
      duplicatePaymentIds: [],
      reconciliationStatus: payment.reconciliationStatus || 'manual_payout',
      reviewedAt: nowIso,
    };
    return { ...review, fingerprint: paymentReviewFingerprint(payment, review) };
  }

  if (!familyPayment) {
    addCheck('payment_type', 'Tipo de pago', 'warning', 'Tipo de pago no reconocido por el flujo familiar.');
    const review = {
      version: PAYMENT_AI_REVIEW_VERSION,
      recommendation: 'admin_review',
      autoAction: 'none',
      confidence: 0.35,
      confidenceLabel: 'baja',
      status: 'unknown_payment_type',
      summary: 'Pago con tipo no reconocido: necesita revision manual.',
      reasons: ['El sistema no puede asegurar si este pago corresponde a una familia.'],
      risks: ['Validarlo automaticamente podria asociar dinero al flujo incorrecto.'],
      checks,
      paidAmount,
      expectedAmount: 0,
      amountDelta: paidAmount,
      matchedClassIds: [],
      duplicatePaymentIds: [],
      reconciliationStatus: 'unknown_type',
      reviewedAt: nowIso,
    };
    return { ...review, fingerprint: paymentReviewFingerprint(payment, review) };
  }

  if (['rechazado', 'fallido', 'devuelto', 'cancelado'].includes(status)) {
    addCheck('payment_status', 'Estado', 'ignored', `El pago esta ${status}.`);
    const review = {
      version: PAYMENT_AI_REVIEW_VERSION,
      recommendation: 'ignore',
      autoAction: 'none',
      confidence: 0.98,
      confidenceLabel: 'alta',
      status: 'closed_payment',
      summary: 'Pago cerrado; no requiere automatizacion.',
      reasons: [`Estado cerrado: ${status}.`],
      risks: [],
      checks,
      paidAmount,
      expectedAmount: paidAmount,
      amountDelta: 0,
      matchedClassIds: paymentClassIds(payment),
      duplicatePaymentIds: [],
      reconciliationStatus: payment.reconciliationStatus || 'closed',
      reviewedAt: nowIso,
    };
    return { ...review, fingerprint: paymentReviewFingerprint(payment, review) };
  }

  if (PAID_PAYMENT_STATUSES.includes(status)) {
    addCheck('payment_status', 'Estado', 'ok', 'El pago ya esta validado.');
    const review = {
      version: PAYMENT_AI_REVIEW_VERSION,
      recommendation: 'ignore',
      autoAction: 'none',
      confidence: 0.99,
      confidenceLabel: 'alta',
      status: 'already_validated',
      summary: 'Pago ya validado; no se aplica ninguna accion.',
      reasons: ['El estado actual ya consta como pagado/validado.'],
      risks: [],
      checks,
      paidAmount,
      expectedAmount: paidAmount,
      amountDelta: 0,
      matchedClassIds: paymentClassIds(payment),
      duplicatePaymentIds: [],
      reconciliationStatus: payment.reconciliationStatus || 'already_validated',
      reviewedAt: nowIso,
    };
    return { ...review, fingerprint: paymentReviewFingerprint(payment, review) };
  }

  const familyUid = payment.familyUid || payment.familia_id;
  const familyClasses = familyUid
    ? (classes || []).filter((classData) => {
      const classFamily = cleanPaymentText(classData.familyUid || classData.familia_id || classData.usuario_id, 180);
      return !classFamily || classFamily === familyUid;
    })
    : classes;
  const match = matchPaymentToClasses(payment, familyClasses);
  const matchedClassIds = match.classIds || [];
  const matchedClasses = classByIds(familyClasses, matchedClassIds);
  const expectedAmount = Math.round(matchedClasses.reduce((sum, classData) => sum + classPaymentAmount(classData), 0) * 100) / 100;
  const amountDelta = Math.round((paidAmount - expectedAmount) * 100) / 100;
  const duplicates = paymentDuplicateCandidates(payment, payments);
  const duplicatePaymentIds = duplicates.map((item) => paymentId(item)).filter(Boolean);
  const proofPresent = hasPaymentProof(payment);

  addCheck(
    'classes',
    'Clases enlazadas',
    matchedClassIds.length ? 'ok' : 'warning',
    matchedClassIds.length
      ? `${matchedClassIds.length} clase(s) reconciliada(s): ${match.reason}.`
      : 'No se ha encontrado una combinacion exacta de clases pendientes.',
  );
  addCheck(
    'amount',
    'Importe',
    expectedAmount > 0 && Math.abs(amountDelta) <= 0.01 ? 'ok' : 'warning',
    expectedAmount > 0
      ? `Pagado ${paidAmount.toFixed(2)} EUR; esperado ${expectedAmount.toFixed(2)} EUR.`
      : `Pagado ${paidAmount.toFixed(2)} EUR; no hay importe esperado calculable.`,
  );
  addCheck(
    'duplicate',
    'Duplicados',
    duplicatePaymentIds.length ? 'danger' : 'ok',
    duplicatePaymentIds.length ? `Posibles duplicados: ${duplicatePaymentIds.join(', ')}.` : 'No se detectan pagos solapados.',
  );
  addCheck(
    'source',
    'Origen',
    verifiedGateway ? 'ok' : (automaticGateway ? 'warning' : 'manual_review'),
    verifiedGateway
      ? `Pasarela ${payment.gateway || payment.provider} verificada.`
      : (automaticGateway ? `Pasarela ${payment.gateway || payment.provider} aun sin confirmacion final.` : 'Justificante manual/Bizum: requiere prudencia.'),
  );
  addCheck(
    'proof',
    'Justificante',
    proofPresent ? 'ok' : 'warning',
    proofPresent ? 'Existe referencia o documento asociado.' : 'No hay documento ni referencia suficiente.',
  );

  if (!matchedClassIds.length) risks.push('No hay clases reconciliadas para aplicar el pago.');
  if (expectedAmount <= 0) risks.push('No se puede calcular importe esperado.');
  if (paidAmount <= 0) risks.push('El importe pagado no es valido.');
  if (Math.abs(amountDelta) > 0.01) risks.push(`El importe no cuadra: diferencia ${amountDelta.toFixed(2)} EUR.`);
  if (duplicatePaymentIds.length) risks.push('Hay pagos duplicados o solapados que deben revisarse.');
  if (!proofPresent) risks.push('Falta justificante o referencia rastreable.');

  if (matchedClassIds.length) reasons.push(`Reconciliado con ${matchedClassIds.length} clase(s).`);
  if (expectedAmount > 0 && Math.abs(amountDelta) <= 0.01) reasons.push('Importe exacto frente a las clases pendientes.');
  if (verifiedGateway) reasons.push('Confirmacion recibida desde pasarela/banco.');
  if (!automaticGateway) reasons.push('Bizum/manual: se prepara revision asistida para el administrador.');

  let confidence = 0.35;
  if (matchedClassIds.length) confidence += match.confidence >= 1 ? 0.28 : 0.22;
  if (expectedAmount > 0 && Math.abs(amountDelta) <= 0.01) confidence += 0.25;
  if (!duplicatePaymentIds.length) confidence += 0.1;
  if (verifiedGateway) confidence += 0.18;
  else if (isPaymentVerified(payment)) confidence += 0.14;
  else if (proofPresent) confidence += 0.06;
  if (risks.length) confidence -= Math.min(0.45, risks.length * 0.11);
  confidence = clampPaymentConfidence(confidence);

  const canAutoValidate = verifiedGateway
    && matchedClassIds.length > 0
    && expectedAmount > 0
    && Math.abs(amountDelta) <= 0.01
    && duplicatePaymentIds.length === 0
    && paidAmount > 0
    && confidence >= 0.9;
  const recommendation = canAutoValidate ? 'auto_validate' : 'admin_review';
  const review = {
    version: PAYMENT_AI_REVIEW_VERSION,
    recommendation,
    autoAction: canAutoValidate ? 'validate_payment' : 'none',
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    status: canAutoValidate ? 'ready_for_auto_validation' : 'requires_admin_review',
    summary: canAutoValidate
      ? 'Pago verificado automaticamente: importe, clases y origen cuadran.'
      : (risks.length ? `Revision necesaria: ${risks[0]}` : 'Revision asistida lista para validar manualmente.'),
    reasons,
    risks,
    checks,
    paidAmount,
    expectedAmount,
    amountDelta,
    matchedClassIds,
    duplicatePaymentIds,
    reconciliationStatus: match.status,
    reconciliationReason: match.reason,
    reviewedAt: nowIso,
  };
  return { ...review, fingerprint: paymentReviewFingerprint(payment, review) };
}

export function shouldAutoValidatePaymentReview(review = {}, payment = {}) {
  return review.recommendation === 'auto_validate'
    && review.confidence >= 0.9
    && review.autoAction === 'validate_payment'
    && isAutomaticGateway(payment)
    && isPaymentVerified(payment)
    && Array.isArray(review.matchedClassIds)
    && review.matchedClassIds.length > 0
    && (!Array.isArray(review.risks) || review.risks.length === 0);
}

export function buildPaymentAiReviewPatch(review = {}, reviewerUid = '', options = {}) {
  const nowIso = options.nowIso || review.reviewedAt || new Date().toISOString();
  return {
    aiReviewVersion: review.version || PAYMENT_AI_REVIEW_VERSION,
    aiReviewStatus: review.status || '',
    aiRecommendation: review.recommendation || '',
    aiConfidence: Number(review.confidence || 0),
    aiConfidenceLabel: review.confidenceLabel || confidenceLabel(review.confidence || 0),
    aiReviewSummary: cleanPaymentText(review.summary, 500),
    aiReviewReasons: Array.isArray(review.reasons) ? review.reasons.map((item) => cleanPaymentText(item, 300)).filter(Boolean).slice(0, 8) : [],
    aiReviewRisks: Array.isArray(review.risks) ? review.risks.map((item) => cleanPaymentText(item, 300)).filter(Boolean).slice(0, 8) : [],
    aiReviewChecks: Array.isArray(review.checks) ? review.checks.slice(0, 8) : [],
    aiReviewFingerprint: cleanPaymentText(review.fingerprint, 900),
    aiReviewedAt: nowIso,
    aiReviewedByUid: reviewerUid || 'system',
    requiresAdminReview: review.recommendation === 'admin_review',
    automationEligible: review.recommendation === 'auto_validate',
    matchedClassIds: Array.isArray(review.matchedClassIds) ? review.matchedClassIds.map(String).filter(Boolean) : [],
    duplicatePaymentIds: Array.isArray(review.duplicatePaymentIds) ? review.duplicatePaymentIds.map(String).filter(Boolean) : [],
    expectedAmount: Number(review.expectedAmount || 0),
    amountDelta: Number(review.amountDelta || 0),
    updated_at: nowIso,
  };
}

export function buildClassPaymentPatch(payment = {}, classId = '', options = {}) {
  const status = isTeacherPayout(payment) ? 'pagado' : 'validado';
  const nowIso = options.nowIso || new Date().toISOString();
  if (isTeacherPayout(payment)) {
    return {
      estado_pago_profesor: status,
      teacherPaymentStatus: status,
      teacherPayoutId: payment.id || payment.paymentId || '',
      teacherPayoutPaidAt: nowIso,
      updated_at: nowIso,
    };
  }
  return {
    estado_pago: status,
    estado_pago_familia: status,
    paymentStatus: status,
    familyPaymentStatus: status,
    familyPaymentId: payment.id || payment.paymentId || '',
    familyPaymentValidatedAt: nowIso,
    paymentEscalationStatus: 'resolved_paid',
    paymentEscalationResolvedAt: nowIso,
    teacherPauseRiskResolvedAt: nowIso,
    updated_at: nowIso,
  };
}

export function shouldReopenFamilyClassPayment(paymentOrStatus = {}) {
  const status = typeof paymentOrStatus === 'string'
    ? normalizePaymentStatus(paymentOrStatus)
    : normalizePaymentStatus(paymentOrStatus.estado || paymentOrStatus.status || paymentOrStatus.providerPaymentStatus || paymentOrStatus.gatewayStatus);
  return REOPEN_FAMILY_PAYMENT_STATUSES.includes(status);
}

export function buildClassFamilyPaymentReopenPatch(payment = {}, classId = '', options = {}) {
  const nowIso = options.nowIso || new Date().toISOString();
  const status = normalizePaymentStatus(options.status || payment.estado || payment.status || payment.providerPaymentStatus || payment.gatewayStatus);
  const paymentId = cleanPaymentText(payment.id || payment.paymentId || payment.payment_id, 180);
  const reason = cleanPaymentText(
    options.reason
    || payment.failureReason
    || payment.rejectionReason
    || payment.rejectedReason
    || payment.reviewNotes
    || payment.notas
    || '',
    500,
  );
  const dueAt = cleanPaymentText(payment.dueAt || payment.due_at || payment.fecha_vencimiento || payment.paymentDueAt || '', 60);
  const escalationType = status === 'cancelado' ? 'payment_cancelled' : 'payment_rejected';
  return {
    estado_pago: 'vencido',
    estado_pago_familia: 'vencido',
    paymentStatus: 'vencido',
    familyPaymentStatus: 'vencido',
    familyPaymentId: null,
    familyPaymentValidatedAt: null,
    familyPaymentReviewStatus: status,
    familyPaymentRejectedAt: nowIso,
    familyPaymentRejectedReason: reason,
    rejectedFamilyPaymentId: paymentId,
    rejectedFamilyPaymentStatus: status,
    rejectedFamilyPaymentAt: nowIso,
    rejectedFamilyPaymentReason: reason,
    lastRejectedFamilyPaymentId: paymentId,
    linkedFamilyPaymentId: paymentId,
    linkedFamilyPaymentStatus: status,
    linkedFamilyPaymentRawStatus: status,
    linkedFamilyPaymentAt: nowIso,
    paymentDueAt: dueAt || null,
    familyPaymentDueAt: dueAt || null,
    paymentEscalationStatus: 'reopened_after_rejection',
    paymentEscalationStage: 'proof_rejected',
    paymentEscalationType: escalationType,
    updated_at: nowIso,
  };
}
