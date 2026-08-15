import { buildIncidentCreatePayload } from './incident-engine.js?v=20260628-incidents';

/**
 * Shared calendar/class lifecycle engine for ClasesDe10.
 *
 * Stored data still contains legacy `programada` classes. The canonical
 * scheduled state for new writes is `confirmada`, while `programada` remains a
 * supported alias so old records keep working.
 */

export const CLASS_STATUSES = Object.freeze([
  'pendiente',
  'confirmada',
  'programada',
  'realizada',
  'cancelada',
  'reprogramada',
  'pagada',
]);

export const CANONICAL_CLASS_STATUSES = Object.freeze([
  'pendiente',
  'confirmada',
  'realizada',
  'cancelada',
  'reprogramada',
  'pagada',
]);

export const SCHEDULED_CLASS_STATUSES = Object.freeze(['pendiente', 'confirmada', 'programada', 'reprogramada']);
export const ATTENDANCE_STATUSES = Object.freeze(['pendiente', 'realizada', 'no_realizada', 'incidencia']);
export const PAID_STATUSES = Object.freeze(['pagado', 'paid', 'validado', 'validated']);

export function cleanCalendarText(value, max = 500) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

export function normalizeClassStatus(status) {
  const raw = cleanCalendarText(status, 40).toLowerCase();
  if (!raw) return 'pendiente';
  if (raw === 'scheduled' || raw === 'programada') return 'confirmada';
  if (raw === 'completed' || raw === 'completada' || raw === 'dada') return 'realizada';
  if (raw === 'paid' || raw === 'validado') return 'pagada';
  if (CANONICAL_CLASS_STATUSES.includes(raw)) return raw;
  return raw;
}

export function storedClassStatus(status) {
  const normalized = normalizeClassStatus(status);
  return CANONICAL_CLASS_STATUSES.includes(normalized) ? normalized : 'pendiente';
}

export function lifecycleStatusForClassStatus(status) {
  const normalized = normalizeClassStatus(status);
  if (normalized === 'cancelada') return 'cancelada';
  if (normalized === 'reprogramada') return 'reprogramada';
  if (normalized === 'realizada') return 'pendiente_confirmacion';
  if (normalized === 'pagada') return 'pago_recibido';
  return 'clase_programada';
}

export function classStatusForBadge(classData = {}) {
  const payment = cleanCalendarText(
    classData.familyPaymentStatus
    || classData.estado_pago_familia
    || classData.paymentStatus
    || classData.estado_pago,
    40,
  ).toLowerCase();
  if (normalizeClassStatus(classData.estado || classData.status) === 'realizada' && PAID_STATUSES.includes(payment)) {
    return 'pagada';
  }
  return normalizeClassStatus(classData.estado || classData.status);
}

export function isScheduledClassStatus(status) {
  return SCHEDULED_CLASS_STATUSES.includes(cleanCalendarText(status, 40).toLowerCase())
    || normalizeClassStatus(status) === 'confirmada';
}

export function normalizeDateString(value) {
  return cleanCalendarText(value, 20).slice(0, 10);
}

export function normalizeTimeString(value) {
  return cleanCalendarText(value, 8).slice(0, 5);
}

export function classStartAt(classData = {}) {
  const date = normalizeDateString(classData.fecha || classData.date);
  const start = normalizeTimeString(classData.hora_inicio || classData.startTime || '00:00');
  if (!date || !start) return null;
  const value = new Date(`${date}T${start}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

export function classEndAt(classData = {}) {
  const date = normalizeDateString(classData.fecha || classData.date);
  const start = normalizeTimeString(classData.hora_inicio || classData.startTime || '23:59');
  const end = normalizeTimeString(classData.hora_fin || classData.endTime || start || '23:59');
  if (!date || !end) return null;
  const value = new Date(`${date}T${end}:00`);
  if (Number.isNaN(value.getTime())) return null;
  if (!(classData.hora_fin || classData.endTime) && Number(classData.duracion_minutos || classData.durationMinutes || 0) > 0) {
    value.setMinutes(value.getMinutes() + Number(classData.duracion_minutos || classData.durationMinutes || 0));
  }
  return value;
}

export function classEnded(classData = {}, marginMinutes = 0, nowMs = Date.now()) {
  const end = classEndAt(classData);
  if (!end) return false;
  return end.getTime() + marginMinutes * 60 * 1000 <= nowMs;
}

function teacherAttendanceStatusOf(classData = {}) {
  const explicit = cleanCalendarText(
    classData.teacherConfirmationStatus
    || classData.teacherAttendanceStatus
    || classData.confirmacion_profesor
    || classData.teacherResult,
    40,
  ).toLowerCase();
  if (explicit) return explicit;
  const operationalStatus = normalizeClassStatus(classData.estado || classData.status);
  return ['realizada', 'pagada'].includes(operationalStatus) ? 'realizada' : '';
}

export function classAttendanceReminderState(classData = {}, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const graceHours = Number(options.graceHours ?? 24);
  const end = classEndAt(classData);
  const operationalStatus = normalizeClassStatus(classData.estado || classData.status);
  const teacherStatus = teacherAttendanceStatusOf(classData);
  const teacherMarked = ['realizada', 'cancelada', 'reprogramada', 'no_realizada', 'incidencia'].includes(teacherStatus);
  const statusCanNeedTeacherResult = isScheduledClassStatus(operationalStatus) || operationalStatus === 'realizada';
  const dueAtMs = end && Number.isFinite(graceHours) ? end.getTime() + Math.max(0, graceHours) * 60 * 60 * 1000 : null;
  const needsTeacherResult = Boolean(end && statusCanNeedTeacherResult && !teacherMarked);
  return {
    needsTeacherResult,
    isOverdue: Boolean(needsTeacherResult && dueAtMs !== null && nowMs >= dueAtMs),
    dueAtIso: dueAtMs === null ? '' : new Date(dueAtMs).toISOString(),
    hoursSinceEnd: end ? Math.max(0, Math.floor((nowMs - end.getTime()) / 3600000)) : null,
    hoursUntilDue: dueAtMs === null ? null : Math.ceil((dueAtMs - nowMs) / 3600000),
  };
}

export function minutesUntilClass(classData = {}, nowMs = Date.now()) {
  const start = classStartAt(classData);
  if (!start) return null;
  return Math.round((start.getTime() - nowMs) / 60000);
}

export function calculateDurationMinutes(startTime, endTime) {
  const start = normalizeTimeString(startTime);
  const end = normalizeTimeString(endTime);
  if (!start || !end) return 0;
  const startDate = new Date(`2000-01-01T${start}:00`);
  const endDate = new Date(`2000-01-01T${end}:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
}

function configValue(config, path, fallback) {
  const value = String(path || '').split('.').reduce((current, key) => (
    current === undefined || current === null ? undefined : current[key]
  ), config);
  return value === undefined || value === null || value === '' ? fallback : value;
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? roundMoney(n) : null;
}

function durationFactor(durationMinutes = 60) {
  const minutes = Number(durationMinutes);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 60) / 60;
}

function amountFromHourly(hourlyRate, durationMinutes = 60) {
  const hourly = numberOrNull(hourlyRate);
  return hourly === null ? null : roundMoney(hourly * durationFactor(durationMinutes));
}

function hourlyFromAmount(amount, durationMinutes = 60) {
  const total = numberOrNull(amount);
  const factor = durationFactor(durationMinutes);
  return total === null || factor <= 0 ? null : roundMoney(total / factor);
}

export function validateClassTimeRange(date, startTime, endTime) {
  const errors = [];
  if (!normalizeDateString(date)) errors.push('fecha');
  if (!normalizeTimeString(startTime)) errors.push('hora_inicio');
  if (!normalizeTimeString(endTime)) errors.push('hora_fin');
  const duration = calculateDurationMinutes(startTime, endTime);
  if (duration <= 0) errors.push('duracion');
  if (duration > 8 * 60) errors.push('duracion_maxima');
  return { valid: errors.length === 0, errors, durationMinutes: duration };
}

export function scheduleChanged(previous = {}, next = {}) {
  if (!previous?.id) return false;
  return normalizeDateString(previous.fecha || previous.date) !== normalizeDateString(next.fecha || next.date)
    || normalizeTimeString(previous.hora_inicio || previous.startTime) !== normalizeTimeString(next.hora_inicio || next.startTime)
    || normalizeTimeString(previous.hora_fin || previous.endTime) !== normalizeTimeString(next.hora_fin || next.endTime);
}

export function getClassAttendanceSummary(classData = {}) {
  const teacher = teacherAttendanceStatusOf(classData);
  const family = cleanCalendarText(classData.familyConfirmationStatus || classData.confirmacion_familia || '', 40).toLowerCase();
  const incident = cleanCalendarText(classData.incidentStatus || classData.estado_incidencia || '', 40).toLowerCase();

  if (incident === 'abierta' || teacher === 'incidencia' || family === 'incidencia') return 'incidencia';
  if (teacher === 'realizada' && family === 'realizada') return 'confirmada_por_ambas_partes';
  if (teacher === 'realizada' && !family) return 'pendiente_familia';
  if (!teacher && family === 'realizada') return 'pendiente_profesor';
  if (teacher === 'no_realizada' || family === 'no_realizada') return 'discrepancia';
  return 'pendiente';
}

export function classAttendanceState(classData = {}, options = {}) {
  const operationalStatus = normalizeClassStatus(classData.estado || classData.status);
  const teacherStatus = teacherAttendanceStatusOf(classData);
  const familyStatus = cleanCalendarText(classData.familyConfirmationStatus || classData.confirmacion_familia || classData.familyAttendanceStatus || '', 40).toLowerCase();
  const incidentStatus = cleanCalendarText(classData.incidentStatus || classData.estado_incidencia || '', 40).toLowerCase();
  const attendanceStatus = getClassAttendanceSummary(classData);
  const ended = classEnded(classData, Number(options.marginMinutes || 0), options.nowMs ?? Date.now());
  const hasFamilyConfirmation = ['realizada', 'no_realizada', 'incidencia'].includes(familyStatus);
  const teacherMarked = ['realizada', 'cancelada', 'reprogramada', 'no_realizada', 'incidencia'].includes(teacherStatus);
  const scheduled = isScheduledClassStatus(operationalStatus);

  const base = {
    key: 'scheduled',
    label: 'Programada',
    tone: 'info',
    attendanceStatus,
    operationalStatus,
    teacherStatus,
    familyStatus,
    incidentStatus,
    ended,
    hasFamilyConfirmation,
    teacherMarked,
    canTeacherRegister: false,
    canFamilyConfirm: false,
    canFamilyReportIssue: false,
    teacherNextStep: ended ? 'Registra el resultado cuando termine la clase.' : 'La clase todavia no ha terminado.',
    familyNextStep: ended ? 'El profesor debe registrar primero el resultado.' : 'Cuando termine, el profesor registrara el resultado.',
  };

  if (incidentStatus === 'abierta' || attendanceStatus === 'incidencia' || attendanceStatus === 'discrepancia') {
    return {
      ...base,
      key: 'incident',
      label: 'Revisar incidencia',
      tone: 'danger',
      teacherNextStep: 'Hay una incidencia abierta que debe revisarse.',
      familyNextStep: 'La clase tiene una incidencia abierta en revisión.',
    };
  }

  if (operationalStatus === 'cancelada') {
    return {
      ...base,
      key: 'cancelled',
      label: 'Cancelada',
      tone: 'neutral',
      teacherNextStep: 'La clase está cancelada y no requiere ninguna acción.',
      familyNextStep: 'La clase está cancelada y no requiere ninguna acción.',
    };
  }

  if (operationalStatus === 'reprogramada' && (!ended || teacherMarked)) {
    return {
      ...base,
      key: 'rescheduled',
      label: 'Reprogramada',
      tone: 'info',
      canTeacherRegister: false,
      canFamilyReportIssue: false,
      teacherNextStep: 'Revisa el nuevo horario acordado.',
      familyNextStep: 'Revisa el nuevo horario acordado.',
    };
  }

  if (attendanceStatus === 'confirmada_por_ambas_partes') {
    return {
      ...base,
      key: 'confirmed_by_both',
      label: 'Confirmada por ambas partes',
      tone: 'success',
      teacherNextStep: 'Asistencia cerrada. El siguiente paso es el pago si queda pendiente.',
      familyNextStep: 'Asistencia cerrada. Revisa pagos si corresponde.',
    };
  }

  if (teacherStatus === 'realizada' && !hasFamilyConfirmation) {
    return {
      ...base,
      key: 'pending_family',
      label: 'Falta confirmar familia',
      tone: 'warning',
      canFamilyConfirm: ended,
      canFamilyReportIssue: ended,
      teacherNextStep: 'Esperando confirmacion de la familia.',
      familyNextStep: 'El profesor la marco como impartida. Confirma si todo fue correcto.',
    };
  }

  if (familyStatus === 'realizada' && teacherStatus !== 'realizada') {
    return {
      ...base,
      key: 'pending_teacher',
      label: 'Revisar: falta marcar',
      tone: 'danger',
      canTeacherRegister: ended,
      teacherNextStep: 'La familia ya confirmó. Marca ahora si la clase se dio o no.',
      familyNextStep: 'El profesor todavía no ha marcado si la clase se dio o no.',
    };
  }

  if (ended && !teacherMarked && (scheduled || operationalStatus === 'realizada')) {
    return {
      ...base,
      key: 'pending_teacher',
      label: 'Revisar: falta marcar',
      tone: 'danger',
      canTeacherRegister: true,
      canFamilyReportIssue: !hasFamilyConfirmation,
      teacherNextStep: 'La clase ya terminó. Marca ahora si se dio o no.',
      familyNextStep: 'El profesor todavía no ha marcado si se dio o no. Puedes avisar si no se dio.',
    };
  }

  return base;
}

/**
 * Calendar-only visual semantics. Text remains mandatory so colour is never
 * the only way to understand a class state.
 */
export function classAttendanceCalendarVisual(classData = {}, options = {}) {
  const state = classAttendanceState(classData, options);
  const visualByState = {
    incident: {
      dotClass: 'dot-red',
      cardClass: 'attendance-incident',
      calendarLabel: 'Revisar incidencia',
      priority: 120,
    },
    pending_teacher: {
      dotClass: 'dot-red',
      cardClass: 'attendance-review',
      calendarLabel: 'Revisar',
      priority: 110,
    },
    pending_family: {
      dotClass: 'dot-amber',
      cardClass: 'attendance-pending',
      calendarLabel: 'Confirmar',
      priority: 80,
    },
    rescheduled: {
      dotClass: 'dot-blue',
      cardClass: 'attendance-rescheduled',
      calendarLabel: 'Reprogramada',
      priority: 55,
    },
    scheduled: {
      dotClass: 'dot-blue',
      cardClass: 'attendance-scheduled',
      calendarLabel: 'Clase',
      priority: 50,
    },
    confirmed_by_both: {
      dotClass: 'dot-emerald',
      cardClass: 'attendance-complete',
      calendarLabel: 'Confirmada',
      priority: 30,
    },
    cancelled: {
      dotClass: 'dot-gray',
      cardClass: 'attendance-cancelled',
      calendarLabel: 'Cancelada',
      priority: 10,
    },
  };
  return {
    ...state,
    ...(visualByState[state.key] || visualByState.scheduled),
  };
}

export function buildClassLifecycleFields(classData = {}, nowIso = new Date().toISOString()) {
  const status = storedClassStatus(classData.estado || classData.status);
  const attendanceStatus = getClassAttendanceSummary(classData);
  return {
    estado: status,
    status,
    lifecycleStatus: lifecycleStatusForClassStatus(status),
    attendanceStatus,
    updated_at: nowIso,
  };
}

export function buildAdminClassPayload(input = {}, previous = {}, options = {}) {
  const validation = validateClassTimeRange(input.fecha, input.hora_inicio, input.hora_fin);
  const durationMinutes = validation.durationMinutes
    || Number(input.durationMinutes || input.duracion_minutos || previous.durationMinutes || previous.duracion_minutos || 60)
    || 60;
  const requestedStatus = storedClassStatus(input.estado || input.status || 'confirmada');
  const changedSchedule = scheduleChanged(previous, input);
  const nextStatus = changedSchedule && isScheduledClassStatus(requestedStatus) ? 'reprogramada' : requestedStatus;
  const nowIso = options.nowIso || new Date().toISOString();
  const familyHourlyRate = numberOrNull(
    input.familyHourlyRate
    ?? input.precio_hora_familia
    ?? input.familyRatePerHour
    ?? input.tarifa_hora_familia
    ?? previous.familyHourlyRate
    ?? previous.precio_hora_familia,
  );
  const teacherHourlyRate = numberOrNull(
    input.teacherHourlyRate
    ?? input.importe_hora_profesor
    ?? input.teacherRatePerHour
    ?? input.tarifa_hora_profesor
    ?? previous.teacherHourlyRate
    ?? previous.importe_hora_profesor,
  );
  const explicitPrice = numberOrNull(input.precio_total ?? input.amount ?? input.familyAmount);
  const useLegacyHourlyAmount = validation.valid && durationMinutes !== 60;
  const inferredFamilyHourlyRate = familyHourlyRate ?? (useLegacyHourlyAmount ? explicitPrice : null);
  const price = inferredFamilyHourlyRate !== null ? amountFromHourly(inferredFamilyHourlyRate, durationMinutes) : explicitPrice;
  const explicitTeacherAmount = numberOrNull(input.importe_profesor ?? input.teacherAmount ?? input.teacher_amount);
  const inferredTeacherHourlyRate = teacherHourlyRate ?? (useLegacyHourlyAmount ? explicitTeacherAmount : null);
  let teacherAmount = teacherHourlyRate !== null
    ? amountFromHourly(teacherHourlyRate, durationMinutes)
    : inferredTeacherHourlyRate !== null
    ? amountFromHourly(inferredTeacherHourlyRate, durationMinutes)
    : explicitTeacherAmount;
  const numericPrice = price === null ? null : Number(price);
  if ((teacherAmount === null || teacherAmount === '' || teacherAmount === undefined) && Number.isFinite(numericPrice)) {
    const commissionPercent = Number(configValue(options.config, 'business.defaultCommissionPercent', 25));
    const minimumFee = Number(configValue(options.config, 'business.minimumPlatformFee', 0));
    const configuredFee = Math.max(Number.isFinite(minimumFee) ? minimumFee : 0, numericPrice * (Number.isFinite(commissionPercent) ? commissionPercent : 25) / 100);
    teacherAmount = roundMoney(Math.max(0, numericPrice - configuredFee));
  }
  const platformFee = price !== null && teacherAmount !== null
    ? roundMoney(Number(price || 0) - Number(teacherAmount || 0))
    : null;
  const normalizedFamilyHourlyRate = inferredFamilyHourlyRate ?? hourlyFromAmount(price, durationMinutes);
  const normalizedTeacherHourlyRate = inferredTeacherHourlyRate ?? hourlyFromAmount(teacherAmount, durationMinutes);

  return {
    profesor_id: input.profesor_id || input.teacherUid,
    teacherUid: input.teacherUid || input.profesor_id,
    familia_id: input.familia_id || input.familyUid || null,
    familyUid: input.familyUid || input.familia_id || null,
    alumno_id: input.alumno_id || input.studentId,
    studentId: input.studentId || input.alumno_id,
    fecha: normalizeDateString(input.fecha || input.date),
    date: normalizeDateString(input.fecha || input.date),
    materia: cleanCalendarText(input.materia || input.subject, 180),
    subject: cleanCalendarText(input.subject || input.materia, 180),
    hora_inicio: normalizeTimeString(input.hora_inicio || input.startTime),
    startTime: normalizeTimeString(input.startTime || input.hora_inicio),
    hora_fin: normalizeTimeString(input.hora_fin || input.endTime),
    endTime: normalizeTimeString(input.endTime || input.hora_fin),
    duracion_minutos: durationMinutes || null,
    durationMinutes: durationMinutes || null,
    precio_total: price,
    amount: price,
    familyAmount: price,
    importe_profesor: teacherAmount,
    teacherAmount,
    precio_hora_familia: normalizedFamilyHourlyRate,
    familyHourlyRate: normalizedFamilyHourlyRate,
    importe_hora_profesor: normalizedTeacherHourlyRate,
    teacherHourlyRate: normalizedTeacherHourlyRate,
    comision_clasesde10: platformFee,
    platformFee,
    marginPct: numericPrice ? Math.round((Number(platformFee || 0) / numericPrice) * 10000) / 100 : null,
    estado: nextStatus,
    status: nextStatus,
    lifecycleStatus: lifecycleStatusForClassStatus(nextStatus),
    attendanceStatus: previous.attendanceStatus || 'pendiente',
    teacherConfirmationStatus: previous.teacherConfirmationStatus || null,
    familyConfirmationStatus: previous.familyConfirmationStatus || null,
    confirmacion_familia: previous.confirmacion_familia || null,
    paymentStatus: input.paymentStatus || input.estado_pago || 'pendiente',
    familyPaymentStatus: input.familyPaymentStatus || input.estado_pago_familia || input.estado_pago || 'pendiente',
    estado_pago: input.estado_pago || input.familyPaymentStatus || 'pendiente',
    estado_pago_familia: input.estado_pago_familia || input.familyPaymentStatus || 'pendiente',
    teacherPaymentStatus: input.teacherPaymentStatus || input.estado_pago_profesor || 'pendiente',
    estado_pago_profesor: input.estado_pago_profesor || input.teacherPaymentStatus || 'pendiente',
    observaciones: cleanCalendarText(input.observaciones, 2000),
    calendarUid: input.calendarUid || previous.calendarUid || options.calendarUid || '',
    calendarSync: previous.calendarSync || {
      version: 1,
      google: { status: 'not_configured' },
      ical: { status: 'ready' },
    },
    previousSchedule: changedSchedule
      ? {
          fecha: previous.fecha || previous.date || null,
          hora_inicio: previous.hora_inicio || previous.startTime || null,
          hora_fin: previous.hora_fin || previous.endTime || null,
          changedAt: nowIso,
        }
      : previous.previousSchedule || null,
    lastScheduleChangeAt: changedSchedule ? nowIso : previous.lastScheduleChangeAt || null,
    updated_at: nowIso,
  };
}

export function buildTeacherAttendancePayload(status, notes = '', reason = '', userUid = '', nowIso = new Date().toISOString()) {
  const normalized = cleanCalendarText(status, 40).toLowerCase();
  const nextStatus = normalized === 'realizada' ? 'realizada'
    : normalized === 'cancelada' ? 'cancelada'
    : normalized === 'no_realizada' ? 'cancelada'
    : normalized === 'incidencia' ? 'cancelada'
    : normalized === 'reprogramada' ? 'reprogramada'
    : 'realizada';
  const teacherStatus = normalized === 'realizada' ? 'realizada'
    : normalized === 'no_realizada' ? 'no_realizada'
    : normalized === 'incidencia' ? 'incidencia'
    : normalized;
  return {
    estado: nextStatus,
    status: nextStatus,
    lifecycleStatus: lifecycleStatusForClassStatus(nextStatus),
    teacherConfirmationStatus: teacherStatus,
    teacherAttendanceStatus: teacherStatus,
    attendanceStatus: normalized === 'realizada' ? 'pendiente_familia' : 'incidencia',
    incidentStatus: ['cancelada', 'reprogramada'].includes(nextStatus) ? 'abierta' : null,
    notas_profesor: cleanCalendarText(notes, 2000),
    notasProfesor: cleanCalendarText(notes, 2000),
    cancelacion_motivo: nextStatus === 'cancelada' ? cleanCalendarText(reason, 800) || null : null,
    reprogramacion_motivo: nextStatus === 'reprogramada' ? cleanCalendarText(reason, 800) || null : null,
    teacherMarkedAt: nowIso,
    teacherMarkedByUid: userUid,
    updated_at: nowIso,
  };
}

export function buildFamilyConfirmationPayload(status, notes = '', userUid = '', nowIso = new Date().toISOString(), previous = {}) {
  const normalized = cleanCalendarText(status, 40).toLowerCase();
  const familyStatus = ATTENDANCE_STATUSES.includes(normalized) ? normalized : 'realizada';
  const teacherStatus = cleanCalendarText(previous.teacherConfirmationStatus || previous.teacherAttendanceStatus || '', 40).toLowerCase();
  const attendanceStatus = familyStatus === 'realizada' && teacherStatus === 'realizada'
    ? 'confirmada_por_ambas_partes'
    : familyStatus === 'realizada' ? 'pendiente_profesor' : 'incidencia';
  return {
    confirmacion_familia: familyStatus,
    familyConfirmationStatus: familyStatus,
    familyAttendanceStatus: familyStatus,
    attendanceStatus,
    lifecycleStatus: attendanceStatus === 'confirmada_por_ambas_partes'
      ? 'pendiente_pago'
      : attendanceStatus === 'pendiente_profesor' ? 'pendiente_confirmacion' : 'incidencia',
    incidentStatus: familyStatus === 'incidencia' || familyStatus === 'no_realizada' ? 'abierta' : null,
    familyConfirmedAt: nowIso,
    familyConfirmedByUid: userUid,
    notas_familia: cleanCalendarText(notes, 2000),
    familyNotes: cleanCalendarText(notes, 2000),
    updated_at: nowIso,
  };
}

export function buildClassIncidentPayload(classId, classData = {}, source = 'automation', notes = '', reporterUid = '') {
  const title = source === 'family_confirmation'
    ? 'Incidencia comunicada por familia'
    : source === 'teacher_update'
      ? 'Incidencia comunicada por profesor'
      : source === 'attendance_mismatch'
        ? 'Discrepancia de asistencia'
      : 'Incidencia detectada automaticamente';
  return buildIncidentCreatePayload({
    classId,
    clase_id: classId,
    familyUid: classData.familyUid || classData.familia_id || null,
    familia_id: classData.familia_id || classData.familyUid || null,
    teacherUid: classData.teacherUid || classData.profesor_id || null,
    profesor_id: classData.profesor_id || classData.teacherUid || null,
    studentId: classData.studentId || classData.alumno_id || null,
    alumno_id: classData.alumno_id || classData.studentId || null,
    tipo: source,
    titulo: title,
    descripcion: cleanCalendarText(notes || classData.familyNotes || classData.notas_familia || classData.cancelacion_motivo || title, 2000),
    estado: 'abierta',
    status: 'abierta',
    prioridad: source === 'automation' ? 'media' : 'alta',
    reportado_por: reporterUid || null,
    source,
  }, { uid: reporterUid || 'automation', role: reporterUid ? 'user' : 'system' });
}

export function buildParticipantClassIncidentCreatePayload(classId, classData = {}, source = 'family_confirmation', notes = '', reporter = {}) {
  const reporterUid = typeof reporter === 'string'
    ? reporter
    : cleanCalendarText(reporter.uid || reporter.id || reporter.userUid, 120);
  const reporterEmail = typeof reporter === 'string'
    ? ''
    : cleanCalendarText(reporter.email || reporter.createdByEmail, 180);
  const title = source === 'teacher_update'
    ? 'Clase marcada como no dada por profesor'
    : source === 'attendance_mismatch'
      ? 'Discrepancia de asistencia'
      : 'Clase marcada como no dada por familia';
  const description = cleanCalendarText(notes || title, 2000);

  return {
    classId,
    clase_id: classId,
    familyUid: classData.familyUid || classData.familia_id || '',
    familia_id: classData.familia_id || classData.familyUid || '',
    teacherUid: classData.teacherUid || classData.profesor_id || '',
    profesor_id: classData.profesor_id || classData.teacherUid || '',
    studentId: classData.studentId || classData.alumno_id || '',
    alumno_id: classData.alumno_id || classData.studentId || '',
    tipo: source,
    titulo: title,
    title,
    descripcion: description,
    description,
    estado: 'abierta',
    status: 'abierta',
    prioridad: 'alta',
    priority: 'high',
    categoria: 'clase',
    category: 'clase',
    reportado_por: reporterUid,
    userUid: reporterUid,
    createdByUid: reporterUid,
    createdByEmail: reporterEmail,
    source,
    automatic: false,
  };
}

export function classReminderWindows(classData = {}, nowMs = Date.now()) {
  const minutes = minutesUntilClass(classData, nowMs);
  if (minutes === null || !isScheduledClassStatus(classData.estado || classData.status)) return [];
  const windows = [];
  if (minutes <= 24 * 60 && minutes > 23 * 60) windows.push('24h');
  if (minutes <= 2 * 60 && minutes > 90) windows.push('2h');
  return windows;
}
