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
  return !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < nowMs;
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

function mondayBasedDay(date) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function scheduleDateFromClassDate(baseDate, schedule = {}) {
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

export function buildWeeklyPaymentSchedulePayload(input = {}, options = {}) {
  const nowIso = options.nowIso || new Date().toISOString();
  const dayOfWeek = normalizePaymentScheduleDay(input.dayOfWeek ?? input.paymentDay ?? input.dia_semana_pago);
  const time = normalizePaymentScheduleTime(input.time ?? input.paymentTime ?? input.hora_pago);
  const graceHours = Number(input.graceHours ?? input.grace_hours ?? options.defaultGraceHours ?? 24);
  const safeGraceHours = Number.isFinite(graceHours) ? Math.max(1, Math.min(168, graceHours)) : 24;
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
    assignmentId: input.assignmentId || input.asignacion_id || '',
    asignacion_id: input.asignacion_id || input.assignmentId || '',
    dayOfWeek,
    paymentDay: dayOfWeek,
    dia_semana_pago: dayOfWeek,
    time,
    paymentTime: time,
    hora_pago: time,
    graceHours: safeGraceHours,
    grace_hours: safeGraceHours,
    label: cleanPaymentText(input.label || `${WEEKLY_PAYMENT_DAY_LABELS[dayOfWeek]} ${time}`, 120),
    notes: cleanPaymentText(input.notes || input.notas, 500),
    source: input.source || 'family_dashboard',
    updatedAtIso: nowIso,
  };
}

export function paymentScheduleLabel(schedule = {}) {
  if (!schedule || schedule.active === false) return 'Sin plan semanal';
  const day = normalizePaymentScheduleDay(schedule.dayOfWeek ?? schedule.paymentDay ?? schedule.dia_semana_pago);
  const time = normalizePaymentScheduleTime(schedule.time ?? schedule.paymentTime ?? schedule.hora_pago);
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
      dotClass: 'dot-teal',
      tone: 'success',
      dueAt: classData.familyPaymentValidatedAt || classData.paidAt || '',
      overdue: false,
    };
  }
  const dueAt = weeklyPaymentDueAtForClass(classData, schedule, options);
  const graceHours = Number(schedule?.graceHours ?? schedule?.grace_hours ?? options.defaultGraceHours ?? 24);
  const safeGraceMs = (Number.isFinite(graceHours) ? Math.max(1, graceHours) : 24) * 3600000;
  const dueMs = dueAt ? new Date(dueAt).getTime() : NaN;
  const nowMs = Number(options.nowMs ?? Date.now());
  const overdue = Number.isFinite(dueMs) && dueMs + safeGraceMs < nowMs;
  return {
    state: overdue ? 'overdue' : 'pending',
    label: overdue ? 'Justificante vencido' : 'Justificante pendiente',
    badge: overdue ? 'Vencida' : 'Pendiente',
    dotClass: overdue ? 'dot-red' : 'dot-gold',
    tone: overdue ? 'danger' : 'warning',
    dueAt,
    overdue,
    graceHours: Number.isFinite(graceHours) ? Math.max(1, graceHours) : 24,
  };
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
  return [
    cleanPaymentText(payment.gateway || payment.provider || 'manual', 40).toLowerCase(),
    cleanPaymentText(payment.metodo || payment.method || 'bizum', 40).toLowerCase(),
    paymentReference(payment).toLowerCase(),
    paymentAmount(payment).toFixed(2),
    cleanPaymentText(payment.familyUid || payment.familia_id || payment.teacherUid || payment.profesor_id, 180).toLowerCase(),
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

export function unpaidFamilyClasses(classes = []) {
  return classes.filter((item) => {
    const classStatus = cleanPaymentText(item.estado || item.status, 40).toLowerCase();
    const paymentStatus = normalizePaymentStatus(item.familyPaymentStatus || item.estado_pago_familia || item.estado_pago || item.paymentStatus);
    return ['realizada', 'completada', 'completed'].includes(classStatus)
      && !PAID_PAYMENT_STATUSES.includes(paymentStatus)
      && paymentAmount({ amount: item.precio_total ?? item.amount ?? item.familyAmount }) > 0;
  });
}

export function matchPaymentToClasses(payment = {}, classes = []) {
  const explicit = Array.isArray(payment.classIds) ? payment.classIds.map(String).filter(Boolean) : [];
  if (explicit.length) return { status: 'matched', classIds: explicit, confidence: 1, reason: 'explicit_class_ids' };

  const amount = paymentAmount(payment);
  const unpaid = unpaidFamilyClasses(classes);
  const exactSingle = unpaid.find((item) => paymentAmount({ amount: item.precio_total ?? item.amount ?? item.familyAmount }) === amount);
  if (exactSingle) return { status: 'matched', classIds: [String(exactSingle.id)], confidence: 0.96, reason: 'single_exact_amount' };

  const sorted = unpaid
    .map((item) => ({
      id: String(item.id),
      amount: paymentAmount({ amount: item.precio_total ?? item.amount ?? item.familyAmount }),
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
    updated_at: nowIso,
  };
}
