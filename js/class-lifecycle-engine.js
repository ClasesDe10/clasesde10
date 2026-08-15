/**
 * Professional class lifecycle engine for ClasesDe10.
 *
 * The public dashboards can keep writing simple operational fields
 * (`estado`, `status`, attendance and payment flags). This module derives the
 * business lifecycle from those facts and produces idempotent transitions,
 * notifications, audit events and history entries for the automation worker.
 */

import {
  classEnded,
  classReminderWindows,
  classStartAt,
  cleanCalendarText,
  getClassAttendanceSummary,
  isScheduledClassStatus,
  normalizeClassStatus,
} from './calendar-engine.js';
import {
  PAID_PAYMENT_STATUSES,
  OPEN_PAYMENT_STATUSES,
  classPaymentAmount,
  normalizePaymentStatus,
} from './payment-engine.js';

export const CLASS_LIFECYCLE_VERSION = 'class_lifecycle_v2';

export const CLASS_LIFECYCLE_STATES = Object.freeze([
  'solicitud_enviada',
  'solicitud_aceptada',
  'clase_programada',
  'clase_proxima',
  'recordatorio_enviado',
  'clase_iniciada',
  'clase_finalizada',
  'pendiente_confirmacion',
  'pendiente_pago',
  'pago_en_revision',
  'pago_recibido',
  'comision_liquidada',
  'valoracion_pendiente',
  'clase_archivada',
  'cancelada',
  'reprogramada',
  'incidencia_abierta',
]);

export const CLASS_LIFECYCLE_TRANSITIONS = Object.freeze({
  solicitud_enviada: ['solicitud_aceptada', 'cancelada', 'incidencia_abierta'],
  solicitud_aceptada: ['clase_programada', 'cancelada', 'incidencia_abierta'],
  clase_programada: ['clase_proxima', 'recordatorio_enviado', 'clase_iniciada', 'clase_finalizada', 'cancelada', 'reprogramada', 'incidencia_abierta'],
  clase_proxima: ['recordatorio_enviado', 'clase_iniciada', 'clase_finalizada', 'cancelada', 'reprogramada', 'incidencia_abierta'],
  recordatorio_enviado: ['clase_proxima', 'clase_iniciada', 'clase_finalizada', 'cancelada', 'reprogramada', 'incidencia_abierta'],
  clase_iniciada: ['clase_finalizada', 'pendiente_confirmacion', 'cancelada', 'incidencia_abierta'],
  clase_finalizada: ['pendiente_confirmacion', 'cancelada', 'incidencia_abierta'],
  pendiente_confirmacion: ['pendiente_pago', 'pago_recibido', 'valoracion_pendiente', 'cancelada', 'reprogramada', 'incidencia_abierta'],
  pendiente_pago: ['pago_en_revision', 'pago_recibido', 'incidencia_abierta'],
  pago_en_revision: ['pendiente_pago', 'pago_recibido', 'incidencia_abierta'],
  pago_recibido: ['comision_liquidada', 'valoracion_pendiente', 'incidencia_abierta'],
  comision_liquidada: ['valoracion_pendiente', 'clase_archivada', 'incidencia_abierta'],
  valoracion_pendiente: ['clase_archivada', 'incidencia_abierta'],
  clase_archivada: ['incidencia_abierta'],
  cancelada: ['reprogramada', 'incidencia_abierta'],
  reprogramada: ['clase_programada', 'clase_proxima', 'recordatorio_enviado', 'clase_iniciada', 'clase_finalizada', 'cancelada', 'incidencia_abierta'],
  incidencia_abierta: ['reprogramada', 'cancelada', 'pendiente_confirmacion', 'pendiente_pago', 'clase_archivada'],
});

const LEGACY_STATE_ALIASES = Object.freeze({
  nueva: 'solicitud_enviada',
  new: 'solicitud_enviada',
  asignada: 'solicitud_aceptada',
  assigned: 'solicitud_aceptada',
  pendiente: 'clase_programada',
  confirmada: 'clase_programada',
  programada: 'clase_programada',
  scheduled: 'clase_programada',
  proxima: 'clase_proxima',
  próxima: 'clase_proxima',
  upcoming: 'clase_proxima',
  started: 'clase_iniciada',
  iniciada: 'clase_iniciada',
  finished: 'clase_finalizada',
  finalizada: 'clase_finalizada',
  realizada: 'pendiente_confirmacion',
  completada: 'pendiente_confirmacion',
  completed: 'pendiente_confirmacion',
  pagada: 'pago_recibido',
  pagado: 'pago_recibido',
  paid: 'pago_recibido',
  en_revision: 'pago_en_revision',
  revision: 'pago_en_revision',
  in_review: 'pago_en_revision',
  validado: 'pago_recibido',
  validated: 'pago_recibido',
  archivada: 'clase_archivada',
  archived: 'clase_archivada',
});

export function normalizeLifecycleState(value) {
  const raw = cleanCalendarText(value, 80).toLowerCase();
  if (!raw) return '';
  if (CLASS_LIFECYCLE_STATES.includes(raw)) return raw;
  return LEGACY_STATE_ALIASES[raw] || raw;
}

export function lifecycleStateForOperationalStatus(status) {
  return normalizeLifecycleState(normalizeClassStatus(status));
}

export function lifecycleStatusForScheduledClass(status = 'confirmada') {
  const normalized = normalizeClassStatus(status);
  if (normalized === 'cancelada') return 'cancelada';
  if (normalized === 'reprogramada') return 'reprogramada';
  if (normalized === 'realizada') return 'pendiente_confirmacion';
  if (normalized === 'pagada') return 'pago_recibido';
  return 'clase_programada';
}

export function buildRequestLifecyclePatch(state, nowIso = new Date().toISOString()) {
  const lifecycleStatus = normalizeLifecycleState(state);
  return {
    lifecycleStatus,
    lifecycleVersion: CLASS_LIFECYCLE_VERSION,
    lifecycleUpdatedAt: nowIso,
    [`lifecycleTimestamps.${lifecycleStatus}`]: nowIso,
    updated_at: nowIso,
  };
}

export function canTransitionClassLifecycle(from, to) {
  const source = normalizeLifecycleState(from);
  const target = normalizeLifecycleState(to);
  if (!source || !target || source === target) return true;
  return (CLASS_LIFECYCLE_TRANSITIONS[source] || []).includes(target);
}

export function nextLifecycleState(from, target) {
  const source = normalizeLifecycleState(from);
  const desired = normalizeLifecycleState(target);
  if (!desired || source === desired) return source || desired;
  if (!source) return desired;
  if (canTransitionClassLifecycle(source, desired)) return desired;

  const chronologicalNext = {
    clase_programada: 'clase_finalizada',
    clase_proxima: 'clase_finalizada',
    recordatorio_enviado: 'clase_finalizada',
    clase_iniciada: 'clase_finalizada',
    clase_finalizada: 'pendiente_confirmacion',
    pago_recibido: 'comision_liquidada',
    comision_liquidada: 'valoracion_pendiente',
    valoracion_pendiente: 'clase_archivada',
  };
  if (chronologicalNext[source]) return chronologicalNext[source];

  const visited = new Set([source]);
  const queue = [[source, []]];
  while (queue.length) {
    const [state, path] = queue.shift();
    for (const next of CLASS_LIFECYCLE_TRANSITIONS[state] || []) {
      if (visited.has(next)) continue;
      const nextPath = [...path, next];
      if (next === desired) return nextPath[0];
      visited.add(next);
      queue.push([next, nextPath]);
    }
  }
  return desired;
}

function numberFromClass(classData = {}, ...fields) {
  for (const field of fields) {
    const value = Number(classData[field]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

export function hasClassPrice(classData = {}) {
  return numberFromClass(classData, 'precio_total', 'amount', 'familyAmount') > 0;
}

export function hasTeacherPayoutAmount(classData = {}) {
  return numberFromClass(classData, 'importe_profesor', 'teacherAmount') > 0;
}

export function isFamilyPaymentReceived(classData = {}) {
  if (normalizeClassStatus(classData.estado || classData.status) === 'pagada') return true;
  const status = normalizePaymentStatus(
    classData.familyPaymentStatus
    || classData.estado_pago_familia
    || classData.paymentStatus
    || classData.estado_pago
    || classData.estado_cobro,
  );
  if (PAID_PAYMENT_STATUSES.includes(status)) return true;
  const linkedStatus = normalizePaymentStatus(
    classData.linkedFamilyPaymentRawStatus
    || classData.linkedFamilyPaymentStatus
    || classData.familyPaymentReviewStatus
    || classData.pendingFamilyPaymentStatus,
  );
  return PAID_PAYMENT_STATUSES.includes(linkedStatus);
}

export function familyPaymentReviewStatus(classData = {}) {
  const status = normalizePaymentStatus(
    classData.linkedFamilyPaymentRawStatus
    || classData.linkedFamilyPaymentStatus
    || classData.familyPaymentReviewStatus
    || classData.pendingFamilyPaymentStatus
    || classData.reconciliationStatus,
  );
  return status === 'pendiente' && !(
    classData.linkedFamilyPaymentId
    || classData.familyPaymentReviewStatus
    || classData.pendingFamilyPaymentStatus
  ) ? '' : status;
}

export function isFamilyPaymentInReview(classData = {}) {
  const status = familyPaymentReviewStatus(classData);
  return OPEN_PAYMENT_STATUSES.includes(status) || status === 'vencido';
}

export function isTeacherPayoutPaid(classData = {}) {
  const status = normalizePaymentStatus(
    classData.teacherPaymentStatus
    || classData.estado_pago_profesor
    || classData.teacherPayoutStatus,
  );
  return PAID_PAYMENT_STATUSES.includes(status);
}

export function hasClassReview(classData = {}) {
  return Boolean(
    classData.reviewStatus === 'completed'
    || classData.valoracionStatus === 'completada'
    || classData.rating
    || classData.valoracion
    || classData.familyRating
    || classData.teacherRating
  );
}

function classAgeDays(classData = {}, nowMs = Date.now()) {
  const end = classData.lifecycleCompletedAt
    ? new Date(classData.lifecycleCompletedAt)
    : null;
  const endAt = end && !Number.isNaN(end.getTime()) ? end : null;
  const date = endAt || classStartAt(classData);
  if (!date) return 0;
  return Math.floor((nowMs - date.getTime()) / (24 * 60 * 60 * 1000));
}

function hasOpenIncident(classData = {}) {
  const incident = cleanCalendarText(classData.incidentStatus || classData.estado_incidencia, 40).toLowerCase();
  const attendance = getClassAttendanceSummary(classData);
  return ['abierta', 'open', 'pendiente'].includes(incident)
    || ['incidencia', 'discrepancia'].includes(attendance);
}

function paymentTargetState(classData = {}, current = '') {
  const hasPrice = hasClassPrice(classData);
  const familyPaid = isFamilyPaymentReceived(classData);
  const teacherAmount = hasTeacherPayoutAmount(classData);
  const teacherPaid = isTeacherPayoutPaid(classData);

  if (hasPrice && !familyPaid) {
    if (isFamilyPaymentInReview(classData)) return 'pago_en_revision';
    return 'pendiente_pago';
  }
  if (familyPaid && teacherAmount && !teacherPaid) return 'pago_recibido';
  if ((familyPaid || !hasPrice) && (!teacherAmount || teacherPaid)) {
    if (!hasClassReview(classData)) {
      if (current === 'pago_recibido') return 'comision_liquidada';
      if (current === 'comision_liquidada') return 'valoracion_pendiente';
      return teacherAmount ? 'comision_liquidada' : 'valoracion_pendiente';
    }
    return classAgeDays(classData) >= 14 ? 'clase_archivada' : 'valoracion_pendiente';
  }
  return 'pendiente_pago';
}

export function deriveLifecycleTargetState(classData = {}, options = {}) {
  const nowMs = options.nowMs || Date.now();
  const current = normalizeLifecycleState(classData.lifecycleStatus || classData.lifecycleTargetStatus);
  const operationalStatus = normalizeClassStatus(classData.estado || classData.status);
  const attendance = getClassAttendanceSummary(classData);

  if (hasOpenIncident(classData)) return 'incidencia_abierta';
  if (operationalStatus === 'cancelada') return 'cancelada';

  if (operationalStatus === 'reprogramada') {
    if (classEnded(classData, 60, nowMs)) return 'pendiente_confirmacion';
    if (classEnded(classData, 0, nowMs)) return 'clase_finalizada';
    if (classReminderWindows(classData, nowMs).length) return 'recordatorio_enviado';
    const start = classStartAt(classData);
    if (start && start.getTime() <= nowMs) return 'clase_iniciada';
    if (start && start.getTime() - nowMs <= 24 * 60 * 60 * 1000) {
      if (current === 'recordatorio_enviado') return 'recordatorio_enviado';
      return 'clase_proxima';
    }
    if (current === 'recordatorio_enviado') return 'recordatorio_enviado';
    return 'reprogramada';
  }

  if (isScheduledClassStatus(operationalStatus)) {
    if (classEnded(classData, 60, nowMs)) return 'pendiente_confirmacion';
    if (classEnded(classData, 0, nowMs)) return 'clase_finalizada';
    if (classReminderWindows(classData, nowMs).length) return 'recordatorio_enviado';
    const start = classStartAt(classData);
    if (start && start.getTime() <= nowMs) return 'clase_iniciada';
    if (start && start.getTime() - nowMs <= 24 * 60 * 60 * 1000) {
      if (current === 'recordatorio_enviado') return 'recordatorio_enviado';
      return 'clase_proxima';
    }
    if (current === 'recordatorio_enviado') return 'recordatorio_enviado';
    return 'clase_programada';
  }

  // `pagada` is a legacy terminal attendance/payment marker. Older records do
  // not always contain the newer two-party confirmation fields, so payment
  // reconciliation must take precedence instead of reopening attendance.
  if (operationalStatus === 'pagada') {
    return paymentTargetState(classData, current);
  }

  if (operationalStatus === 'realizada') {
    if (attendance !== 'confirmada_por_ambas_partes') return 'pendiente_confirmacion';
    return paymentTargetState(classData, current);
  }

  if (current === 'pago_recibido' || current === 'comision_liquidada' || current === 'valoracion_pendiente') {
    return paymentTargetState(classData, current);
  }

  if (current === 'pago_en_revision') {
    return paymentTargetState(classData, current);
  }

  return lifecycleStatusForScheduledClass(operationalStatus || 'confirmada');
}

function labelForClass(classData = {}) {
  return [
    cleanCalendarText(classData.materia || classData.subject || 'clase', 120),
    cleanCalendarText(classData.fecha || classData.date, 20),
    cleanCalendarText(classData.hora_inicio || classData.startTime, 8).slice(0, 5),
  ].filter(Boolean).join(' - ');
}

function lifecycleNotification(to, classId, classData, role, title, body, type = 'class_lifecycle') {
  return {
    role,
    title,
    body,
    type,
    key: `class_lifecycle_${to}_${classId}_${role}`,
    payload: {
      type,
      classId,
      lifecycleStatus: to,
      url: '/pages/login.html',
    },
  };
}

export function buildLifecycleNotifications(classId, to, classData = {}) {
  const label = labelForClass(classData);
  const notifications = [];

  if (to === 'clase_programada') {
    notifications.push(lifecycleNotification(to, classId, classData, 'teacher', 'Clase programada', `Tienes una clase programada: ${label}.`));
    notifications.push(lifecycleNotification(to, classId, classData, 'family', 'Clase programada', `Se ha programado la clase: ${label}.`));
  }
  if (to === 'clase_proxima') {
    notifications.push(lifecycleNotification(to, classId, classData, 'teacher', 'Clase proxima', `La clase ${label} esta dentro de las proximas 24 horas.`, 'class_upcoming'));
    notifications.push(lifecycleNotification(to, classId, classData, 'family', 'Clase proxima', `La clase ${label} esta dentro de las proximas 24 horas.`, 'class_upcoming'));
  }
  if (to === 'clase_finalizada' || to === 'pendiente_confirmacion') {
    notifications.push(lifecycleNotification(to, classId, classData, 'teacher', 'Clase pendiente de confirmar', `Confirma el resultado de ${label}.`, 'class_confirmation_needed'));
    notifications.push(lifecycleNotification(to, classId, classData, 'family', 'Clase pendiente de confirmar', `Confirma si la clase ${label} se dio correctamente.`, 'class_confirmation_needed'));
  }
  if (to === 'pendiente_pago') {
    notifications.push(lifecycleNotification(to, classId, classData, 'family', 'Pago pendiente', `Queda pendiente el pago de ${label}.`, 'family_payment_pending'));
    notifications.push(lifecycleNotification(to, classId, classData, 'admin', 'Pago pendiente', `Revisar cobro pendiente de ${label}.`, 'family_payment_pending'));
  }
  if (to === 'pago_en_revision') {
    notifications.push(lifecycleNotification(to, classId, classData, 'admin', 'Pago en revision', `Hay un justificante pendiente de revisar para ${label}.`, 'family_payment_review'));
  }
  if (to === 'pago_recibido') {
    notifications.push(lifecycleNotification(to, classId, classData, 'admin', 'Pago recibido', `Preparar liquidacion del profesor para ${label}.`, 'teacher_payout_pending'));
  }
  if (to === 'comision_liquidada') {
    notifications.push(lifecycleNotification(to, classId, classData, 'admin', 'Comision liquidada', `La clase ${label} ya tiene cobro y pago de profesor conciliados.`));
  }
  if (to === 'valoracion_pendiente') {
    notifications.push(lifecycleNotification(to, classId, classData, 'teacher', 'Valoracion pendiente', `Puedes pedir o revisar la valoracion de ${label}.`));
    notifications.push(lifecycleNotification(to, classId, classData, 'family', 'Valora la clase', `Ayudanos valorando la clase ${label}.`));
  }
  if (to === 'incidencia_abierta') {
    notifications.push(lifecycleNotification(to, classId, classData, 'admin', 'Incidencia abierta', `Revisar incidencia de ${label}.`, 'class_incident'));
  }

  return notifications;
}

export function buildClassLifecycleTransition(classId, classData = {}, options = {}) {
  const nowIso = options.nowIso || new Date().toISOString();
  const target = deriveLifecycleTargetState(classData, options);
  const from = normalizeLifecycleState(classData.lifecycleStatus || classData.estado || classData.status);
  const to = nextLifecycleState(from, target);
  const changed = Boolean(to && to !== from);
  if (!changed) {
    return {
      changed: false,
      from,
      to,
      target,
      reason: 'already_current',
      notifications: [],
    };
  }

  const scheduleKey = [
    classData.fecha || classData.date || 'sin_fecha',
    classData.hora_inicio || classData.startTime || 'sin_hora',
    classData.hora_fin || classData.endTime || '',
  ].map((part) => cleanCalendarText(part, 80).toLowerCase().replace(/[^a-z0-9_-]+/g, '_')).filter(Boolean).join('_');
  const transitionId = ['class_lifecycle', classId, scheduleKey, from || 'none', to].filter(Boolean).join('__').slice(0, 900);
  const patch = {
    lifecycleStatus: to,
    lifecycleTargetStatus: target,
    lifecyclePreviousStatus: from || null,
    lifecycleVersion: CLASS_LIFECYCLE_VERSION,
    lifecycleUpdatedAt: nowIso,
    lifecycleChangedAt: nowIso,
    [`lifecycleTimestamps.${to}`]: nowIso,
    updated_at: nowIso,
  };

  if (to === 'clase_finalizada') patch.lifecycleCompletedAt = nowIso;
  if (to === 'pago_en_revision') patch.paymentReviewStartedAt = classData.paymentReviewStartedAt || nowIso;
  if (to === 'clase_archivada') patch.archivedAt = nowIso;

  const historyEvent = {
    id: transitionId,
    classId,
    clase_id: classId,
    from: from || null,
    to,
    target,
    reason: options.reason || 'automation_derived_state',
    lifecycleVersion: CLASS_LIFECYCLE_VERSION,
    operationalStatus: normalizeClassStatus(classData.estado || classData.status),
    attendanceStatus: getClassAttendanceSummary(classData),
    familyPaymentStatus: normalizePaymentStatus(classData.familyPaymentStatus || classData.estado_pago_familia || classData.paymentStatus || classData.estado_pago),
    teacherPaymentStatus: normalizePaymentStatus(classData.teacherPaymentStatus || classData.estado_pago_profesor),
    amount: classPaymentAmount(classData),
    created_at: nowIso,
  };

  return {
    changed: true,
    from,
    to,
    target,
    transitionId,
    reason: historyEvent.reason,
    patch,
    historyEvent,
    auditEvent: {
      ...historyEvent,
      type: 'class_lifecycle_transition',
    },
    notifications: buildLifecycleNotifications(classId, to, classData),
  };
}
