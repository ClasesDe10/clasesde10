import {
  classEnded,
  classStartAt,
  classStatusForBadge,
  isScheduledClassStatus,
  normalizeClassStatus,
} from './calendar-engine.js';
import {
  isFamilyPayment,
  isPaymentOverdue,
  isPaymentVerified,
  isTeacherPayout,
  normalizePaymentStatus,
  paymentAmount,
} from './payment-engine.js';

export const RELATIONSHIP_ENGINE_VERSION = 'relationship-engine-2026-06-29';

export const RELATIONSHIP_STAGES = Object.freeze([
  'solicitud_recibida',
  'matching_en_proceso',
  'profesor_asignado',
  'chat_pendiente',
  'pendiente_horario',
  'horario_propuesto',
  'clase_programada',
  'clase_en_curso',
  'pendiente_confirmacion',
  'pago_pendiente',
  'pago_vencido',
  'incidencia_abierta',
  'relacion_activa',
  'relacion_finalizada',
]);

const STAGE_META = Object.freeze({
  solicitud_recibida: { label: 'Solicitud recibida', tone: 'info', progress: 8 },
  matching_en_proceso: { label: 'Buscando profesor', tone: 'warning', progress: 18 },
  profesor_asignado: { label: 'Profesor asignado', tone: 'navy', progress: 30 },
  chat_pendiente: { label: 'Chat pendiente', tone: 'warning', progress: 36 },
  pendiente_horario: { label: 'Pendiente de horario', tone: 'warning', progress: 45 },
  horario_propuesto: { label: 'Horario propuesto', tone: 'info', progress: 55 },
  clase_programada: { label: 'Clase programada', tone: 'success', progress: 68 },
  clase_en_curso: { label: 'Clase en curso', tone: 'success', progress: 74 },
  pendiente_confirmacion: { label: 'Pendiente de confirmar', tone: 'warning', progress: 78 },
  pago_pendiente: { label: 'Pago pendiente', tone: 'warning', progress: 84 },
  pago_vencido: { label: 'Pago vencido', tone: 'danger', progress: 84 },
  incidencia_abierta: { label: 'Incidencia abierta', tone: 'danger', progress: 50 },
  relacion_activa: { label: 'Relacion activa', tone: 'success', progress: 92 },
  relacion_finalizada: { label: 'Relacion finalizada', tone: 'gray', progress: 100 },
});

const ACTIVE_STATUSES = new Set(['activo', 'activa', 'active', 'confirmada', 'asignada', 'asignado']);
const FINAL_STATUSES = new Set(['finalizada', 'finalizado', 'cerrada', 'cerrado', 'inactive', 'inactiva', 'cancelada', 'cancelado']);
const OPEN_INCIDENT_STATUSES = new Set(['abierta', 'open', 'en_proceso', 'pending', 'pendiente']);
const CONFIRMED_ATTENDANCE = new Set(['realizada', 'confirmada', 'confirmed', 'done']);
const OPEN_PAYMENT_STATUSES = new Set(['pendiente', 'solicitado', 'procesando', 'requiere_accion', 'pending', 'requested', 'processing']);

function clean(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function lower(value, max = 1000) {
  return clean(value, max).toLowerCase();
}

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && clean(value) !== '');
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toMillis(value) {
  return toDate(value)?.getTime() || 0;
}

function daysSince(value, nowMs = Date.now()) {
  const ms = toMillis(value);
  if (!ms) return Infinity;
  return Math.max(0, (nowMs - ms) / 86400000);
}

function isTruthyActive(item = {}) {
  const status = lower(first(item.status, item.estado, item.estado_asignacion, item.assignmentStatus), 80);
  if (item.active === false || item.activa === false || item.activo === false) return false;
  if (FINAL_STATUSES.has(status)) return false;
  if (!status) return true;
  return ACTIVE_STATUSES.has(status) || !FINAL_STATUSES.has(status);
}

function itemStatus(item = {}) {
  return lower(first(item.status, item.estado, item.verificationStatus, item.estado_verificacion), 80);
}

function profileCompletion(item = {}) {
  const value = Number(first(
    item.profileCompletionPercent,
    item.profileCompletion,
    item.perfil_completo === true ? 100 : null,
    item.profileComplete === true ? 100 : null,
  ));
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
}

function idOf(item = {}) {
  return clean(first(item.id, item.uid, item.userUid, item.usuario_id), 180);
}

function requestIdOf(item = {}) {
  return clean(first(item.requestId, item.solicitud_id, item.solicitudId, item.id), 180);
}

function assignmentIdOf(item = {}) {
  return clean(first(item.assignmentId, item.asignacion_id, item.assignment_id, item.id), 180);
}

function teacherUidOf(item = {}) {
  return clean(first(
    item.teacherUid,
    item.teacherUserUid,
    item.profesor_uid,
    item.profesor_id,
    item.assignedTeacherUid,
    item.profesor_asignado_id,
    item.profesores?.userUid,
    item.profesores?.usuario_id,
    item.profesores?.id,
  ), 180);
}

function familyUidOf(item = {}) {
  return clean(first(
    item.familyUid,
    item.familyUserUid,
    item.familia_uid,
    item.familia_id,
    item.families?.userUid,
    item.familias?.userUid,
    item.familias?.usuario_id,
    item.familias?.id,
  ), 180);
}

function studentIdOf(item = {}) {
  return clean(first(item.studentId, item.alumno_id, item.student_id, item.alumnoId, item.alumnos?.id), 180);
}

function subjectOf(item = {}) {
  return clean(first(item.materia, item.subject, item.asignatura, item.metadata?.materia, item.asunto), 160);
}

function createdAt(item = {}) {
  item = item || {};
  return first(item.createdAt, item.created_at, item.fecha_creacion, item.fecha, item.date);
}

function updatedAt(item = {}) {
  item = item || {};
  return first(item.updatedAt, item.updated_at, item.lastMessageAt, item.createdAt, item.created_at, item.fecha, item.date);
}

const GENERIC_RELATIONSHIP_PERSON_LABELS = new Set([
  'profesor',
  'profesora',
  'profesor/a',
  'profesor asignado',
  'docente',
  'alumno',
  'alumna',
  'alumno/a',
  'estudiante',
  'familia',
  'sin nombre',
  'sin profesor',
  'contacto',
]);

function relationshipPersonKey(value) {
  return clean(value, 180)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function relationshipPersonFallback(role, item = {}) {
  const label = clean(role, 40);
  if (!label) return '';
  return `${label} pendiente de nombre`;
}

function isGeneratedRelationshipPersonLabel(value) {
  const text = clean(value, 180)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  if (/^[a-z]$/i.test(text)) return true;
  const generated = text.match(/^(?:profesor(?:a|\/a)?|profesor asignado|docente|alumno(?:a|\/a)?|familia)\s+([A-Za-z0-9_-]{1,12})$/i);
  if (!generated) return false;
  const token = generated[1].replace(/[^A-Za-z0-9]/g, '');
  if (token.length <= 1) return true;
  return /\d/.test(token) || /^[A-Z]{2,8}$/.test(token) || /^[a-f0-9]{6,12}$/i.test(token);
}

function nameOf(item = {}, fallback = '') {
  const values = [
    item.displayName,
    item.name,
    [item.nombre, item.apellidos].filter(Boolean).join(' '),
    [item.usuarios?.nombre, item.usuarios?.apellidos].filter(Boolean).join(' '),
    item.email,
    item.usuarios?.email,
    fallback,
  ];
  for (const value of values) {
    const candidate = clean(value, 180);
    if (candidate && !GENERIC_RELATIONSHIP_PERSON_LABELS.has(relationshipPersonKey(candidate)) && !isGeneratedRelationshipPersonLabel(candidate)) return candidate;
  }
  return relationshipPersonFallback(fallback, item);
}

function classRelationId(item = {}) {
  return clean(first(
    item.assignmentId,
    item.asignacion_id,
    item.chatId,
    item.requestId,
    item.solicitud_id,
  ), 180);
}

function paymentClassIds(payment = {}) {
  return [
    ...toArray(payment.classIds),
    ...toArray(payment.claseIds),
    first(payment.classId, payment.clase_id),
  ].map((item) => clean(item, 180)).filter(Boolean);
}

function relationSignature(item = {}) {
  return [
    familyUidOf(item),
    teacherUidOf(item),
    studentIdOf(item),
  ].filter(Boolean).join('|');
}

function addUnique(target, items) {
  for (const item of toArray(items)) {
    if (!item?.id || !target.some((entry) => entry.id === item.id)) target.push(item);
  }
}

function stageMeta(stage) {
  return STAGE_META[stage] || STAGE_META.solicitud_recibida;
}

function classIsInProgress(item = {}, nowMs = Date.now()) {
  const start = classStartAt(item);
  const end = toDate(first(item.hora_fin || item.endTime ? `${first(item.fecha, item.date)}T${first(item.hora_fin, item.endTime)}:00` : null));
  if (!start) return false;
  const endMs = end?.getTime() || start.getTime() + Number(first(item.duracion_minutos, item.durationMinutes, 60)) * 60000;
  return start.getTime() <= nowMs && nowMs <= endMs;
}

function classNeedsConfirmation(item = {}, nowMs = Date.now()) {
  const status = normalizeClassStatus(first(item.estado, item.status));
  if (['cancelada', 'pagada'].includes(status)) return false;
  if (status === 'realizada') {
    const teacher = lower(first(item.teacherConfirmationStatus, item.teacherAttendanceStatus, item.confirmacion_profesor), 80);
    const family = lower(first(item.familyConfirmationStatus, item.familyAttendanceStatus, item.confirmacion_familia), 80);
    return !CONFIRMED_ATTENDANCE.has(teacher) || !CONFIRMED_ATTENDANCE.has(family);
  }
  return isScheduledClassStatus(status) && classEnded(item, 60, nowMs);
}

function classHasOpenPayment(item = {}) {
  const status = classStatusForBadge(item);
  const payment = lower(first(item.familyPaymentStatus, item.estado_pago_familia, item.paymentStatus, item.estado_pago), 80);
  return ['realizada', 'pagada'].includes(status)
    && !['pagada'].includes(status)
    && !['pagado', 'validado', 'paid', 'validated', 'succeeded'].includes(payment);
}

function paymentIsOpen(item = {}) {
  return OPEN_PAYMENT_STATUSES.has(normalizePaymentStatus(first(item.estado, item.status, item.providerPaymentStatus, item.gatewayStatus)));
}

function paymentIsOverdue(item = {}, nowMs = Date.now()) {
  return isPaymentOverdue(item, nowMs)
    || ['vencido', 'overdue'].includes(normalizePaymentStatus(first(item.estado, item.status, item.providerPaymentStatus, item.gatewayStatus)));
}

function latestDate(items = []) {
  return items
    .map((item) => toMillis(updatedAt(item)))
    .filter(Boolean)
    .sort((a, b) => b - a)[0] || 0;
}

function buildAction(id, role, label, detail, section, priority = 'normal') {
  return { id, role, label, detail, section, module: section, priority };
}

function actionForStage(stage, role, relationship) {
  const subject = relationship.subject || 'la solicitud';
  const admin = {
    solicitud_recibida: buildAction('assign_teacher', 'admin', 'Asignar profesor', `Selecciona profesor para ${subject}.`, 'solicitudes', 'high'),
    matching_en_proceso: buildAction('review_matching', 'admin', 'Revisar matching', `Comprueba candidatos y asigna profesor para ${subject}.`, 'solicitudes', 'high'),
    profesor_asignado: buildAction('open_chat', 'admin', 'Abrir chat', 'Comprueba que familia y profesor tienen canal abierto.', 'chat', 'normal'),
    chat_pendiente: buildAction('repair_chat', 'admin', 'Crear o reparar chat', 'La asignacion existe pero falta el canal operativo.', 'chat', 'high'),
    pendiente_horario: buildAction('push_schedule', 'admin', 'Impulsar horario', 'Falta concretar fecha y hora de la primera clase.', 'chat', 'high'),
    horario_propuesto: buildAction('monitor_schedule', 'admin', 'Esperar aceptacion', 'Hay una propuesta de horario pendiente de respuesta.', 'chat', 'normal'),
    clase_programada: buildAction('monitor_class', 'admin', 'Supervisar clase', 'La siguiente clase ya esta en calendario.', 'clases', 'low'),
    clase_en_curso: buildAction('monitor_live_class', 'admin', 'Clase en curso', 'Revisar solo si aparece una incidencia.', 'clases', 'low'),
    pendiente_confirmacion: buildAction('close_attendance', 'admin', 'Cerrar asistencia', 'Falta confirmacion de una clase terminada.', 'clases', 'high'),
    pago_pendiente: buildAction('review_payment', 'admin', 'Revisar pago', 'Hay un pago pendiente de validar o solicitar.', 'pagos', 'high'),
    pago_vencido: buildAction('collect_payment', 'admin', 'Reclamar pago vencido', 'El pago esta vencido y bloquea el cierre.', 'pagos', 'critical'),
    incidencia_abierta: buildAction('resolve_incident', 'admin', 'Resolver incidencia', 'Existe una incidencia abierta en esta relacion.', 'incidencias', 'critical'),
    relacion_activa: buildAction('monitor_relation', 'admin', 'Monitorizar relacion', 'Relacion operativa sin bloqueos criticos.', 'chat', 'low'),
    relacion_finalizada: buildAction('archive_relation', 'admin', 'Archivar expediente', 'Relacion cerrada; conservar trazabilidad.', 'auditoria', 'low'),
  };
  const family = {
    solicitud_recibida: buildAction('wait_assignment', 'familia', 'Solicitud enviada', 'Estamos revisando el profesor adecuado.', 'solicitudes', 'normal'),
    matching_en_proceso: buildAction('wait_matching', 'familia', 'Esperar profesor', 'Te avisaremos cuando haya un profesor asignado.', 'solicitudes', 'normal'),
    profesor_asignado: buildAction('open_teachers_family', 'familia', 'Mis profesores', 'Revisa la ficha y propón el primer horario.', 'profesores', 'high'),
    chat_pendiente: buildAction('contact_admin_chat', 'familia', 'Chat pendiente', 'El equipo debe activar el canal.', 'chat', 'normal'),
    pendiente_horario: buildAction('propose_schedule_family', 'familia', 'Proponer horario', 'Propón una franja desde Mis profesores.', 'profesores', 'high'),
    horario_propuesto: buildAction('answer_schedule_family', 'familia', 'Responder horario', 'Acepta o modifica la propuesta desde Mis profesores.', 'profesores', 'high'),
    clase_programada: buildAction('prepare_class_family', 'familia', 'Preparar clase', 'La clase esta en el calendario.', 'calendario', 'low'),
    clase_en_curso: buildAction('class_live_family', 'familia', 'Clase en curso', 'Marca incidencias solo si hay problema.', 'clases', 'low'),
    pendiente_confirmacion: buildAction('confirm_attendance_family', 'familia', 'Confirmar clase', 'Indica si la clase se realizo correctamente.', 'clases', 'high'),
    pago_pendiente: buildAction('pay_family', 'familia', 'Revisar justificante', 'Hay un justificante pendiente asociado.', 'pagos', 'high'),
    pago_vencido: buildAction('pay_overdue_family', 'familia', 'Justificante vencido', 'Sube el comprobante pendiente para cerrar el expediente.', 'pagos', 'critical'),
    incidencia_abierta: buildAction('follow_incident_family', 'familia', 'Incidencia abierta', 'Sigue el estado desde chat o notificaciones.', 'chat', 'high'),
    relacion_activa: buildAction('continue_family', 'familia', 'Continuar relacion', 'Usa chat y calendario para coordinar las clases.', 'chat', 'low'),
    relacion_finalizada: buildAction('review_family', 'familia', 'Relacion finalizada', 'Puedes consultar el historial cuando lo necesites.', 'clases', 'low'),
  };
  const teacher = {
    solicitud_recibida: buildAction('wait_assignment_teacher', 'profesor', 'Sin accion', 'Aun no se ha confirmado la asignacion.', 'inicio', 'low'),
    matching_en_proceso: buildAction('wait_matching_teacher', 'profesor', 'Sin accion', 'El matching sigue en proceso.', 'inicio', 'low'),
    profesor_asignado: buildAction('open_students_teacher', 'profesor', 'Mis alumnos', 'Revisa la asignación y espera la propuesta familiar.', 'alumnos', 'high'),
    chat_pendiente: buildAction('contact_admin_chat_teacher', 'profesor', 'Chat pendiente', 'El equipo debe activar el canal.', 'chat', 'normal'),
    pendiente_horario: buildAction('wait_schedule_teacher', 'profesor', 'Ver asignación', 'La familia envía la primera propuesta.', 'alumnos', 'high'),
    horario_propuesto: buildAction('answer_schedule_teacher', 'profesor', 'Responder horario', 'Acepta o modifica la propuesta desde Mis alumnos.', 'alumnos', 'high'),
    clase_programada: buildAction('prepare_class_teacher', 'profesor', 'Preparar clase', 'La clase esta en tu calendario.', 'calendario', 'low'),
    clase_en_curso: buildAction('class_live_teacher', 'profesor', 'Clase en curso', 'Despues marca si se ha realizado.', 'clases', 'normal'),
    pendiente_confirmacion: buildAction('confirm_attendance_teacher', 'profesor', 'Confirmar asistencia', 'Marca la clase como realizada o reporta incidencia.', 'clases', 'high'),
    pago_pendiente: buildAction('wait_payment_teacher', 'profesor', 'Pago pendiente', 'Hay pago pendiente de familia o liquidacion.', 'ingresos', 'normal'),
    pago_vencido: buildAction('payment_overdue_teacher', 'profesor', 'Pago vencido', 'El equipo debe revisar este pago.', 'ingresos', 'high'),
    incidencia_abierta: buildAction('follow_incident_teacher', 'profesor', 'Incidencia abierta', 'Sigue el estado desde chat o notificaciones.', 'chat', 'high'),
    relacion_activa: buildAction('continue_teacher', 'profesor', 'Continuar relacion', 'Usa chat y calendario para coordinar las clases.', 'chat', 'low'),
    relacion_finalizada: buildAction('review_teacher', 'profesor', 'Relacion finalizada', 'El historial queda disponible.', 'clases', 'low'),
  };
  return { admin, familia: family, profesor: teacher }[role]?.[stage] || admin[stage];
}

function computeFlags(input, nowMs) {
  const classes = input.classes || [];
  const payments = input.payments || [];
  const incidents = input.incidents || [];
  const documents = input.documents || [];
  const proposals = input.scheduleProposals || [];
  const teacherProfile = input.teacher || {};
  const familyProfile = input.family || {};
  const openIncidents = incidents.filter((item) => OPEN_INCIDENT_STATUSES.has(itemStatus(item)));
  const overduePayments = payments.filter((item) => paymentIsOverdue(item, nowMs));
  const openFamilyPayments = payments.filter((item) => isFamilyPayment(item) && paymentIsOpen(item));
  const openTeacherPayouts = payments.filter((item) => isTeacherPayout(item) && paymentIsOpen(item));
  const scheduledClasses = classes.filter((item) => isScheduledClassStatus(first(item.estado, item.status)));
  const futureClasses = scheduledClasses
    .filter((item) => (classStartAt(item)?.getTime() || 0) >= nowMs)
    .sort((a, b) => (classStartAt(a)?.getTime() || 0) - (classStartAt(b)?.getTime() || 0));
  const currentClasses = classes.filter((item) => classIsInProgress(item, nowMs));
  const confirmationPending = classes.filter((item) => classNeedsConfirmation(item, nowMs));
  const completedClasses = classes.filter((item) => ['realizada', 'pagada'].includes(classStatusForBadge(item)));
  const cancelledClasses = classes.filter((item) => normalizeClassStatus(first(item.estado, item.status, item.lifecycleStatus)) === 'cancelada');
  const unpaidClasses = classes.filter(classHasOpenPayment);
  const pendingProposals = proposals.filter((item) => ['propuesta', 'pending', 'pendiente'].includes(itemStatus(item)));
  const acceptedProposals = proposals.filter((item) => ['aceptada', 'accepted'].includes(itemStatus(item)));
  const pendingDocuments = documents.filter((item) => ['pendiente', 'revision', 'en_revision', 'pending'].includes(itemStatus(item)));
  const expiredDocuments = documents.filter((item) => {
    const expires = first(item.expiresAt, item.expires_at, item.fecha_caducidad);
    return expires && toMillis(expires) < nowMs;
  });
  const teacherCompletion = profileCompletion(teacherProfile);
  const familyCompletion = profileCompletion(familyProfile);

  return {
    openIncidents,
    overduePayments,
    openFamilyPayments,
    openTeacherPayouts,
    scheduledClasses,
    futureClasses,
    currentClasses,
    confirmationPending,
    completedClasses,
    cancelledClasses,
    unpaidClasses,
    pendingProposals,
    acceptedProposals,
    pendingDocuments,
    expiredDocuments,
    teacherProfileIncomplete: teacherCompletion !== null && teacherCompletion < 80,
    familyProfileIncomplete: familyCompletion !== null && familyCompletion < 80,
  };
}

function determineStage(input, flags, nowMs) {
  const assignment = input.assignment;
  const request = input.request;
  const chat = input.chat;
  const status = lower(first(assignment?.status, assignment?.estado, request?.status, request?.estado), 80);

  if (status && FINAL_STATUSES.has(status)) return 'relacion_finalizada';
  if (flags.openIncidents.length) return 'incidencia_abierta';
  if (flags.overduePayments.length) return 'pago_vencido';
  if (flags.confirmationPending.length) return 'pendiente_confirmacion';
  if (flags.openFamilyPayments.length || flags.openTeacherPayouts.length || flags.unpaidClasses.length) return 'pago_pendiente';
  if (flags.currentClasses.length) return 'clase_en_curso';
  if (flags.futureClasses.length) return 'clase_programada';
  if (flags.pendingProposals.length || lower(first(chat?.schedulingStatus, chat?.relationshipStage), 80) === 'horario_propuesto') return 'horario_propuesto';
  if (assignment && !chat) return 'chat_pendiente';
  if (assignment && chat && !flags.completedClasses.length) return 'pendiente_horario';
  if (assignment) return flags.completedClasses.length ? 'relacion_activa' : 'profesor_asignado';
  if (request && daysSince(createdAt(request), nowMs) > 0.5) return 'matching_en_proceso';
  if (request) return 'solicitud_recibida';
  return 'solicitud_recibida';
}

function computeHealth(stage, input, flags, nowMs) {
  let score = 100;
  if (stage === 'incidencia_abierta') score -= 35;
  if (stage === 'pago_vencido') score -= 30;
  if (stage === 'pendiente_confirmacion') score -= 18;
  if (stage === 'chat_pendiente') score -= 22;
  if (stage === 'pendiente_horario' && daysSince(createdAt(input.assignment || input.request), nowMs) > 2) score -= 18;
  if (stage === 'matching_en_proceso' && daysSince(createdAt(input.request), nowMs) > 1) score -= 20;
  if (flags.pendingDocuments.length) score -= Math.min(12, flags.pendingDocuments.length * 4);
  if (flags.expiredDocuments.length) score -= Math.min(20, flags.expiredDocuments.length * 8);
  if (flags.teacherProfileIncomplete) score -= 8;
  if (flags.familyProfileIncomplete) score -= 6;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function urgencyFrom(stage, healthScore) {
  if (['incidencia_abierta', 'pago_vencido'].includes(stage) || healthScore < 45) return 'critical';
  if (['matching_en_proceso', 'chat_pendiente', 'pendiente_horario', 'pendiente_confirmacion', 'pago_pendiente'].includes(stage) || healthScore < 70) return 'high';
  if (stage === 'horario_propuesto') return 'normal';
  return 'low';
}

export function relationshipStageLabel(stage) {
  return stageMeta(stage).label;
}

export function relationshipStageTone(stage) {
  return stageMeta(stage).tone;
}

export function relationshipProgress(stage) {
  return stageMeta(stage).progress;
}

export function relationshipKeyFromRecord(record = {}) {
  return clean(first(
    assignmentIdOf(record),
    record.chatId,
    record.threadId,
    classRelationId(record),
    requestIdOf(record),
    relationSignature(record),
    idOf(record),
  ), 220);
}

export function buildRelationshipRecord(input = {}, options = {}) {
  const nowMs = Number(options.nowMs || Date.now());
  const request = input.request || null;
  const assignment = input.assignment || null;
  const chat = input.chat || null;
  const classes = toArray(input.classes);
  const payments = toArray(input.payments);
  const incidents = toArray(input.incidents);
  const documents = toArray(input.documents);
  const scheduleProposals = toArray(input.scheduleProposals);
  const teacher = input.teacher || null;
  const family = input.family || null;
  const student = input.student || null;
  const id = clean(first(
    input.id,
    assignmentIdOf(assignment || {}),
    assignmentIdOf(chat || {}),
    classRelationId(classes[0] || {}),
    requestIdOf(request || {}),
    relationSignature(assignment || chat || classes[0] || request || {}),
  ), 220) || `rel_${Math.abs(JSON.stringify(input).length)}`;

  const participants = {
    familyUid: familyUidOf(assignment || chat || request || classes[0] || {}),
    teacherUid: teacherUidOf(assignment || chat || request || classes[0] || {}),
    studentId: studentIdOf(assignment || chat || request || classes[0] || {}),
  };
  const subject = clean(first(
    subjectOf(assignment || {}),
    subjectOf(chat || {}),
    subjectOf(request || {}),
    subjectOf(classes[0] || {}),
    subjectOf(student || {}),
  ), 160) || 'Sin materia';
  const title = clean(first(
    input.title,
    chat?.studentName,
    nameOf(student || {}, ''),
    request?.alumno_nombre,
    request?.studentName,
    subject,
  ), 180) || subject;
  const flags = computeFlags({ ...input, classes, payments, incidents, documents, scheduleProposals, teacher, family }, nowMs);
  const stage = determineStage({ request, assignment, chat }, flags, nowMs);
  const healthScore = computeHealth(stage, { request, assignment }, flags, nowMs);
  const urgency = urgencyFrom(stage, healthScore);
  const totalFamilyAmount = payments.filter(isFamilyPayment).reduce((sum, item) => sum + paymentAmount(item), 0);
  const totalTeacherAmount = payments.filter(isTeacherPayout).reduce((sum, item) => sum + paymentAmount(item), 0);
  const nextClassDate = flags.futureClasses[0] ? classStartAt(flags.futureClasses[0]) : null;
  const lastClassMs = latestDate(classes);
  const lastCompletedClassMs = latestDate(flags.completedClasses);
  const lastCancelledClassMs = latestDate(flags.cancelledClasses);
  const lastActivityAt = latestDate([
    request,
    assignment,
    chat,
    ...classes,
    ...payments,
    ...incidents,
    ...documents,
    ...scheduleProposals,
  ]);

  const relationship = {
    id,
    engineVersion: RELATIONSHIP_ENGINE_VERSION,
    stage,
    stageLabel: relationshipStageLabel(stage),
    stageTone: relationshipStageTone(stage),
    progress: relationshipProgress(stage),
    healthScore,
    urgency,
    title,
    subject,
    subtitle: [
      nameOf(family || {}, chat?.familyName || 'Familia'),
      nameOf(teacher || {}, chat?.teacherName || 'Profesor'),
    ].filter(Boolean).join(' / '),
    participants,
    request,
    assignment,
    chat,
    teacher,
    family,
    student,
    counts: {
      classes: classes.length,
      completedClasses: flags.completedClasses.length,
      cancelledClasses: flags.cancelledClasses.length,
      scheduledClasses: flags.scheduledClasses.length,
      futureClasses: flags.futureClasses.length,
      payments: payments.length,
      incidents: incidents.length,
      documents: documents.length,
      pendingDocuments: flags.pendingDocuments.length,
      pendingProposals: flags.pendingProposals.length,
    },
    modules: {
      matching: Boolean(request),
      assignment: Boolean(assignment),
      chat: Boolean(chat),
      calendar: classes.length > 0,
      payments: payments.length > 0,
      notifications: Boolean(chat) || payments.length > 0 || flags.openIncidents.length > 0,
      documents: documents.length > 0,
      incidents: flags.openIncidents.length > 0,
      ai: Boolean(request?.matchScore || request?.aiScore || assignment?.matchScore),
      reputation: Boolean(teacher?.trustScore || family?.trustScore),
    },
    flags: {
      openIncidentCount: flags.openIncidents.length,
      overduePaymentCount: flags.overduePayments.length,
      confirmationPendingCount: flags.confirmationPending.length,
      openFamilyPaymentCount: flags.openFamilyPayments.length,
      openTeacherPayoutCount: flags.openTeacherPayouts.length,
      pendingProposalCount: flags.pendingProposals.length,
      teacherProfileIncomplete: flags.teacherProfileIncomplete,
      familyProfileIncomplete: flags.familyProfileIncomplete,
    },
    money: {
      totalFamilyAmount,
      totalTeacherAmount,
      verifiedFamilyAmount: payments.filter((item) => isFamilyPayment(item) && isPaymentVerified(item)).reduce((sum, item) => sum + paymentAmount(item), 0),
      verifiedTeacherAmount: payments.filter((item) => isTeacherPayout(item) && isPaymentVerified(item)).reduce((sum, item) => sum + paymentAmount(item), 0),
    },
    nextActions: {
      admin: [actionForStage(stage, 'admin', { subject })].filter(Boolean),
      familia: [actionForStage(stage, 'familia', { subject })].filter(Boolean),
      profesor: [actionForStage(stage, 'profesor', { subject })].filter(Boolean),
    },
    automations: [
      flags.openIncidents.length ? 'incident.follow_up' : '',
      flags.overduePayments.length ? 'payment.overdue_follow_up' : '',
      flags.confirmationPending.length ? 'class.confirmation_reminder' : '',
      flags.cancelledClasses.length >= 3 ? 'relationship.cancellation_pattern_review' : '',
      stage === 'pendiente_horario' ? 'relationship.schedule_reminder' : '',
      stage === 'chat_pendiente' ? 'relationship.chat_repair' : '',
    ].filter(Boolean),
    history: {
      completedClassDates: flags.completedClasses
        .map((item) => updatedAt(item))
        .map(toDate)
        .filter(Boolean)
        .sort((a, b) => b.getTime() - a.getTime())
        .slice(0, 12)
        .map((date) => date.toISOString()),
      cancelledClassDates: flags.cancelledClasses
        .map((item) => updatedAt(item))
        .map(toDate)
        .filter(Boolean)
        .sort((a, b) => b.getTime() - a.getTime())
        .slice(0, 12)
        .map((date) => date.toISOString()),
    },
    nextClassAt: nextClassDate ? nextClassDate.toISOString() : null,
    lastClassAt: lastClassMs ? new Date(lastClassMs).toISOString() : null,
    lastCompletedClassAt: lastCompletedClassMs ? new Date(lastCompletedClassMs).toISOString() : null,
    lastCancelledClassAt: lastCancelledClassMs ? new Date(lastCancelledClassMs).toISOString() : null,
    lastActivityAt: lastActivityAt ? new Date(lastActivityAt).toISOString() : null,
  };

  return relationship;
}

function ensureBucket(map, id) {
  const key = clean(id, 220) || `rel_${map.size + 1}`;
  if (!map.has(key)) {
    map.set(key, {
      id: key,
      request: null,
      assignment: null,
      chat: null,
      classes: [],
      payments: [],
      incidents: [],
      documents: [],
      scheduleProposals: [],
      teacher: null,
      family: null,
      student: null,
    });
  }
  return map.get(key);
}

function findAssignmentForRecord(assignments, record = {}) {
  const direct = assignmentIdOf(record);
  if (direct) {
    const match = assignments.find((item) => assignmentIdOf(item) === direct || item.id === direct);
    if (match) return match;
  }
  const signature = relationSignature(record);
  if (signature) {
    const match = assignments.find((item) => relationSignature(item) === signature)
      || assignments.find((item) => studentIdOf(item) && studentIdOf(item) === studentIdOf(record) && teacherUidOf(item) === teacherUidOf(record));
    if (match) return match;
  }
  const requestId = requestIdOf(record);
  if (requestId) return assignments.find((item) => requestIdOf(item) === requestId || clean(item.solicitud_id, 180) === requestId);
  return null;
}

function attachProfiles(bucket, maps) {
  const teacherId = teacherUidOf(bucket.assignment || bucket.chat || bucket.request || bucket.classes[0] || {});
  const familyId = familyUidOf(bucket.assignment || bucket.chat || bucket.request || bucket.classes[0] || {});
  const studentId = studentIdOf(bucket.assignment || bucket.chat || bucket.request || bucket.classes[0] || {});
  bucket.teacher = bucket.teacher || maps.teachers.get(teacherId) || null;
  bucket.family = bucket.family || maps.families.get(familyId) || null;
  bucket.student = bucket.student || maps.students.get(studentId) || null;
}

export function buildRelationshipsFromCollections(collections = {}, options = {}) {
  const requests = toArray(collections.requests || collections.solicitudes);
  const assignments = toArray(collections.assignments || collections.asignaciones);
  const chats = toArray(collections.chats);
  const classes = toArray(collections.classes || collections.clases);
  const payments = toArray(collections.payments || collections.pagos);
  const incidents = toArray(collections.incidents || collections.incidencias);
  const documents = toArray(collections.documents || collections.documentos);
  const scheduleProposals = toArray(collections.scheduleProposals || collections.programaciones);
  const maps = {
    teachers: new Map(toArray(collections.teachers || collections.profesores).map((item) => [idOf(item), item])),
    families: new Map(toArray(collections.families || collections.familias).map((item) => [idOf(item), item])),
    students: new Map(toArray(collections.students || collections.alumnos).map((item) => [idOf(item), item])),
  };
  const buckets = new Map();
  const bucketByClass = new Map();

  for (const assignment of assignments.filter(isTruthyActive)) {
    const bucket = ensureBucket(buckets, assignmentIdOf(assignment) || relationSignature(assignment));
    bucket.assignment = assignment;
  }

  for (const request of requests) {
    const assignment = findAssignmentForRecord(assignments, request);
    const bucket = ensureBucket(buckets, assignment ? assignmentIdOf(assignment) : requestIdOf(request) || relationSignature(request));
    bucket.request = bucket.request || request;
    bucket.assignment = bucket.assignment || assignment || null;
  }

  for (const chat of chats) {
    const assignment = findAssignmentForRecord(assignments, chat);
    const bucket = ensureBucket(buckets, assignment ? assignmentIdOf(assignment) : assignmentIdOf(chat) || chat.id || relationSignature(chat));
    bucket.chat = chat;
    bucket.assignment = bucket.assignment || assignment || null;
  }

  for (const item of classes) {
    const assignment = findAssignmentForRecord(assignments, item);
    const bucket = ensureBucket(buckets, assignment ? assignmentIdOf(assignment) : classRelationId(item) || relationSignature(item));
    addUnique(bucket.classes, item);
    bucket.assignment = bucket.assignment || assignment || null;
    if (item.id) bucketByClass.set(item.id, bucket);
  }

  for (const proposal of scheduleProposals) {
    const assignment = findAssignmentForRecord(assignments, proposal);
    const bucket = ensureBucket(buckets, assignment ? assignmentIdOf(assignment) : assignmentIdOf(proposal) || relationSignature(proposal));
    addUnique(bucket.scheduleProposals, proposal);
    bucket.assignment = bucket.assignment || assignment || null;
  }

  for (const payment of payments) {
    const classBucket = paymentClassIds(payment).map((id) => bucketByClass.get(id)).find(Boolean);
    const assignment = classBucket ? null : findAssignmentForRecord(assignments, payment);
    const bucket = classBucket || ensureBucket(buckets, assignment ? assignmentIdOf(assignment) : relationshipKeyFromRecord(payment));
    addUnique(bucket.payments, payment);
    bucket.assignment = bucket.assignment || assignment || null;
  }

  for (const incident of incidents) {
    const classBucket = clean(first(incident.classId, incident.clase_id), 180) ? bucketByClass.get(clean(first(incident.classId, incident.clase_id), 180)) : null;
    const assignment = classBucket ? null : findAssignmentForRecord(assignments, incident);
    const bucket = classBucket || ensureBucket(buckets, assignment ? assignmentIdOf(assignment) : relationshipKeyFromRecord(incident));
    addUnique(bucket.incidents, incident);
    bucket.assignment = bucket.assignment || assignment || null;
  }

  for (const document of documents) {
    const owner = clean(first(document.ownerUid, document.userUid, document.usuario_id, document.profesor_id, document.familia_id), 180);
    if (!owner) continue;
    for (const bucket of buckets.values()) {
      const ids = [
        teacherUidOf(bucket.assignment || bucket.chat || {}),
        familyUidOf(bucket.assignment || bucket.chat || {}),
      ];
      if (ids.includes(owner)) addUnique(bucket.documents, document);
    }
  }

  for (const bucket of buckets.values()) attachProfiles(bucket, maps);

  return Array.from(buckets.values())
    .map((bucket) => buildRelationshipRecord(bucket, options))
    .sort((a, b) => {
      const urgencyWeight = { critical: 0, high: 1, normal: 2, low: 3 };
      const urgent = (urgencyWeight[a.urgency] ?? 9) - (urgencyWeight[b.urgency] ?? 9);
      if (urgent) return urgent;
      return (toMillis(b.lastActivityAt) || 0) - (toMillis(a.lastActivityAt) || 0);
    });
}

export function summarizeRelationships(relationships = []) {
  const rows = toArray(relationships);
  const byStage = rows.reduce((acc, item) => {
    acc[item.stage] = (acc[item.stage] || 0) + 1;
    return acc;
  }, {});
  const blocked = rows.filter((item) => ['critical', 'high'].includes(item.urgency));
  const withMissingChat = rows.filter((item) => item.stage === 'chat_pendiente');
  const pendingSchedule = rows.filter((item) => ['pendiente_horario', 'horario_propuesto'].includes(item.stage));
  const paymentRisk = rows.filter((item) => ['pago_pendiente', 'pago_vencido'].includes(item.stage));
  const confirmationRisk = rows.filter((item) => item.stage === 'pendiente_confirmacion');
  const active = rows.filter((item) => ['clase_programada', 'clase_en_curso', 'relacion_activa'].includes(item.stage));
  const avgHealth = rows.length ? Math.round(rows.reduce((sum, item) => sum + item.healthScore, 0) / rows.length) : 100;
  return {
    total: rows.length,
    byStage,
    blocked,
    active,
    withMissingChat,
    pendingSchedule,
    paymentRisk,
    confirmationRisk,
    avgHealth,
    priority: blocked.slice(0, 8),
  };
}

export default {
  RELATIONSHIP_ENGINE_VERSION,
  RELATIONSHIP_STAGES,
  buildRelationshipRecord,
  buildRelationshipsFromCollections,
  relationshipKeyFromRecord,
  relationshipProgress,
  relationshipStageLabel,
  relationshipStageTone,
  summarizeRelationships,
};
