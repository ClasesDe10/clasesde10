/**
 * ClasesDe10 availability engine.
 *
 * Shared pure helpers for teacher and student weekly availability. The same
 * logic is used by dashboards, chat scheduling and tests so proposals are
 * validated consistently.
 */

export const WEEKDAY_LABELS = Object.freeze([
  'Lunes',
  'Martes',
  'Miercoles',
  'Jueves',
  'Viernes',
  'Sabado',
  'Domingo',
]);

export function cleanAvailabilityText(value, max = 500) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

export function normalizeTimeString(value) {
  const raw = cleanAvailabilityText(value, 8);
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function minutesFromTime(value) {
  const time = normalizeTimeString(value);
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function weekdayIndexFromDate(value) {
  const dateText = cleanAvailabilityText(value, 20).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return (date.getDay() + 6) % 7;
}

export function normalizeAvailabilitySlot(slot = {}) {
  const dayIndex = Number(slot.dayIndex ?? slot.weekday ?? slot.dia_semana);
  const startTime = normalizeTimeString(slot.startTime || slot.hora_inicio);
  const endTime = normalizeTimeString(slot.endTime || slot.hora_fin);
  const teacherUid = cleanAvailabilityText(slot.teacherUid || slot.profesor_id, 180);
  const familyUid = cleanAvailabilityText(slot.familyUid || slot.familia_id, 180);
  const studentId = cleanAvailabilityText(slot.studentId || slot.alumno_id, 180);
  const scope = studentId ? 'student' : 'teacher';

  return {
    ...slot,
    id: cleanAvailabilityText(slot.id, 180),
    scope,
    teacherUid,
    profesor_id: teacherUid || slot.profesor_id,
    familyUid,
    familia_id: familyUid || slot.familia_id,
    studentId,
    alumno_id: studentId || slot.alumno_id,
    dayIndex,
    dia_semana: dayIndex,
    startTime,
    hora_inicio: startTime,
    endTime,
    hora_fin: endTime,
    valid: Number.isInteger(dayIndex)
      && dayIndex >= 0
      && dayIndex <= 6
      && startTime
      && endTime
      && minutesFromTime(startTime) < minutesFromTime(endTime),
  };
}

export function normalizeAvailabilitySlots(slots = []) {
  return (Array.isArray(slots) ? slots : [])
    .map(normalizeAvailabilitySlot)
    .filter((slot) => slot.valid)
    .sort((a, b) => (a.dayIndex - b.dayIndex) || minutesFromTime(a.startTime) - minutesFromTime(b.startTime));
}

export function availabilitySlotLabel(slot = {}) {
  const normalized = normalizeAvailabilitySlot(slot);
  if (!normalized.valid) return '';
  return `${WEEKDAY_LABELS[normalized.dayIndex]} ${normalized.startTime}-${normalized.endTime}`;
}

export function summarizeAvailabilitySlots(slots = [], max = 4) {
  const normalized = normalizeAvailabilitySlots(slots);
  if (!normalized.length) return '';
  const labels = normalized.slice(0, max).map(availabilitySlotLabel).filter(Boolean);
  const remaining = normalized.length - labels.length;
  return `${labels.join(', ')}${remaining > 0 ? ` y ${remaining} mas` : ''}`;
}

const INACTIVE_BUSY_STATUSES = new Set([
  'cancelada',
  'cancelado',
  'cancelled',
  'canceled',
  'rechazada',
  'realizada',
  'completada',
  'completed',
  'pagada',
  'paid',
  'archivada',
  'archived',
]);

export function normalizeDateText(value) {
  const raw = cleanAvailabilityText(value, 30);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

export function normalizeBusyStatus(slot = {}) {
  const raw = cleanAvailabilityText(slot.status || slot.estado || slot.lifecycleStatus || slot.attendanceStatus || 'ocupada', 80).toLowerCase();
  return raw || 'ocupada';
}

export function isBusySlotActive(slot = {}) {
  const status = normalizeBusyStatus(slot);
  const attendance = cleanAvailabilityText(slot.attendanceStatus || slot.estado_asistencia, 80).toLowerCase();
  return !INACTIVE_BUSY_STATUSES.has(status) && !INACTIVE_BUSY_STATUSES.has(attendance);
}

export function normalizeBusySlot(slot = {}) {
  const date = normalizeDateText(slot.date || slot.fecha);
  const startTime = normalizeTimeString(slot.startTime || slot.hora_inicio);
  const endTime = normalizeTimeString(slot.endTime || slot.hora_fin);
  const resourceType = cleanAvailabilityText(slot.resourceType || slot.scope, 40).toLowerCase();
  const resourceId = cleanAvailabilityText(slot.resourceId, 180);
  const teacherUid = cleanAvailabilityText(slot.teacherUid || slot.profesor_id, 180);
  const studentId = cleanAvailabilityText(slot.studentId || slot.alumno_id, 180);
  const resourceKey = cleanAvailabilityText(
    slot.resourceKey || (resourceType && resourceId ? `${resourceType}:${resourceId}` : ''),
    240,
  );

  return {
    ...slot,
    id: cleanAvailabilityText(slot.id, 180),
    classId: cleanAvailabilityText(slot.classId || slot.clase_id, 180),
    assignmentId: cleanAvailabilityText(slot.assignmentId || slot.asignacion_id, 180),
    resourceType,
    resourceId,
    resourceKey,
    teacherUid,
    profesor_id: teacherUid || slot.profesor_id,
    studentId,
    alumno_id: studentId || slot.alumno_id,
    date,
    fecha: date,
    startTime,
    hora_inicio: startTime,
    endTime,
    hora_fin: endTime,
    status: normalizeBusyStatus(slot),
    active: isBusySlotActive(slot),
    valid: Boolean(date)
      && /^\d{4}-\d{2}-\d{2}$/.test(date)
      && startTime
      && endTime
      && minutesFromTime(startTime) < minutesFromTime(endTime),
  };
}

export function normalizeBusySlots(slots = []) {
  return (Array.isArray(slots) ? slots : [])
    .map(normalizeBusySlot)
    .filter((slot) => slot.valid && slot.active)
    .sort((a, b) => a.date.localeCompare(b.date) || minutesFromTime(a.startTime) - minutesFromTime(b.startTime));
}

export function rangesOverlap(startA = '', endA = '', startB = '', endB = '') {
  const aStart = minutesFromTime(startA);
  const aEnd = minutesFromTime(endA);
  const bStart = minutesFromTime(startB);
  const bEnd = minutesFromTime(endB);
  if (aStart === null || aEnd === null || bStart === null || bEnd === null) return false;
  return aStart < bEnd && bStart < aEnd;
}

export function busySlotMatchesResource(slot = {}, resources = {}) {
  const normalized = normalizeBusySlot(slot);
  if (!normalized.valid) return false;
  const teacherUid = cleanAvailabilityText(resources.teacherUid || resources.profesor_id, 180);
  const studentId = cleanAvailabilityText(resources.studentId || resources.alumno_id, 180);
  if (!teacherUid && !studentId) return true;
  return (teacherUid && (
    normalized.resourceKey === `teacher:${teacherUid}`
    || (normalized.resourceType === 'teacher' && normalized.resourceId === teacherUid)
    || normalized.teacherUid === teacherUid
  )) || (studentId && (
    normalized.resourceKey === `student:${studentId}`
    || (normalized.resourceType === 'student' && normalized.resourceId === studentId)
    || normalized.studentId === studentId
  ));
}

export function findBusySlotConflict(slots = [], fecha = '', start = '', end = '', resources = {}) {
  const date = normalizeDateText(fecha);
  if (!date) return null;
  return normalizeBusySlots(slots)
    .find((slot) => slot.date === date
      && busySlotMatchesResource(slot, resources)
      && rangesOverlap(slot.startTime, slot.endTime, start, end)) || null;
}

export function busySlotLabel(slot = {}) {
  const normalized = normalizeBusySlot(slot);
  if (!normalized.valid) return '';
  const [year, month, day] = normalized.date.split('-');
  const dateLabel = year && month && day ? `${day}/${month}/${year}` : normalized.date;
  const type = normalized.resourceType === 'teacher' ? 'profesor' : normalized.resourceType === 'student' ? 'alumno' : 'agenda';
  return `${dateLabel} ${normalized.startTime}-${normalized.endTime} (${type})`;
}

export function summarizeBusySlots(slots = [], max = 4) {
  const normalized = normalizeBusySlots(slots);
  if (!normalized.length) return '';
  const labels = normalized.slice(0, max).map(busySlotLabel).filter(Boolean);
  const remaining = normalized.length - labels.length;
  return `${labels.join(', ')}${remaining > 0 ? ` y ${remaining} mas` : ''}`;
}

export function slotCoversRange(slot = {}, fecha = '', start = '', end = '') {
  const normalized = normalizeAvailabilitySlot(slot);
  if (!normalized.valid) return false;
  const dayIndex = weekdayIndexFromDate(fecha);
  const startMinutes = minutesFromTime(start);
  const endMinutes = minutesFromTime(end);
  if (dayIndex === null || startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return false;
  return normalized.dayIndex === dayIndex
    && minutesFromTime(normalized.startTime) <= startMinutes
    && minutesFromTime(normalized.endTime) >= endMinutes;
}

export function findCoveringAvailabilitySlot(slots = [], fecha = '', start = '', end = '') {
  return normalizeAvailabilitySlots(slots).find((slot) => slotCoversRange(slot, fecha, start, end)) || null;
}

export function availabilityRequirementForRole(role) {
  if (role === 'familia') return {
    counterparty: 'teacher',
    own: 'student',
    missing: 'El profesor aun no ha definido franjas disponibles.',
    outside: 'El horario no encaja con las franjas disponibles del profesor.',
  };
  if (role === 'profesor') return {
    counterparty: 'student',
    own: 'teacher',
    missing: 'La familia aun no ha definido franjas disponibles para este alumno.',
    outside: 'El horario no encaja con las franjas disponibles del alumno.',
  };
  return {
    counterparty: '',
    own: '',
    missing: '',
    outside: '',
  };
}

export function validateScheduleAvailability({
  role = '',
  fecha = '',
  horaInicio = '',
  horaFin = '',
  teacherSlots = [],
  studentSlots = [],
  busySlots = [],
  teacherUid = '',
  studentId = '',
} = {}) {
  const normalizedTeacherSlots = normalizeAvailabilitySlots(teacherSlots);
  const normalizedStudentSlots = normalizeAvailabilitySlots(studentSlots);
  const dayIndex = weekdayIndexFromDate(fecha);
  const startMinutes = minutesFromTime(horaInicio);
  const endMinutes = minutesFromTime(horaFin);

  if (dayIndex === null || startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return { valid: false, reason: 'time_invalid', message: 'La fecha y la hora de fin deben ser correctas.' };
  }

  const teacherSlot = findCoveringAvailabilitySlot(normalizedTeacherSlots, fecha, horaInicio, horaFin);
  const studentSlot = findCoveringAvailabilitySlot(normalizedStudentSlots, fecha, horaInicio, horaFin);
  const busyConflict = findBusySlotConflict(busySlots, fecha, horaInicio, horaFin, { teacherUid, studentId });

  if (busyConflict) {
    return {
      valid: false,
      reason: 'time_conflict',
      requiredScope: busyConflict.resourceType || 'busy',
      teacherSlot,
      studentSlot,
      busySlot: busyConflict,
      message: 'Ese horario ya esta ocupado por una clase confirmada. Elige otra franja disponible.',
    };
  }

  if (role === 'admin') {
    return {
      valid: true,
      reason: 'admin_override',
      teacherSlot,
      studentSlot,
      requiredScope: 'admin',
      message: 'Admin puede coordinar horario revisando ambas agendas.',
    };
  }

  const requirement = availabilityRequirementForRole(role);
  const requiredSlots = requirement.counterparty === 'teacher' ? normalizedTeacherSlots : normalizedStudentSlots;
  const requiredMatch = requirement.counterparty === 'teacher' ? teacherSlot : studentSlot;
  const ownSlots = requirement.own === 'teacher' ? normalizedTeacherSlots : normalizedStudentSlots;
  const ownMatch = requirement.own === 'teacher' ? teacherSlot : studentSlot;

  if (!requiredSlots.length) {
    return {
      valid: false,
      reason: 'counterparty_availability_missing',
      requiredScope: requirement.counterparty,
      teacherSlot,
      studentSlot,
      message: requirement.missing,
    };
  }
  if (!requiredMatch) {
    return {
      valid: false,
      reason: 'outside_counterparty_availability',
      requiredScope: requirement.counterparty,
      teacherSlot,
      studentSlot,
      message: requirement.outside,
    };
  }
  if (ownSlots.length && !ownMatch) {
    return {
      valid: false,
      reason: 'outside_own_availability',
      requiredScope: requirement.own,
      teacherSlot,
      studentSlot,
      message: role === 'familia'
        ? 'El horario tambien debe encajar con las franjas del alumno.'
        : 'El horario tambien debe encajar con tus propias franjas.',
    };
  }

  return {
    valid: true,
    reason: 'matched',
    requiredScope: requirement.counterparty,
    teacherSlot,
    studentSlot,
    message: 'El horario encaja con la disponibilidad marcada.',
  };
}
