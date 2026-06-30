export const PROACTIVE_ASSIST_VERSION = 'proactive-assist-2026-06-30';

const CLOSED_STATUSES = new Set(['resolved', 'resuelta', 'cerrada', 'closed', 'done', 'archived', 'archivada', 'cancelada', 'cancelled', 'rechazada', 'rejected', 'suppressed']);
const ACTIVE_ASSIGNMENT_STATUSES = new Set(['', 'activa', 'active', 'accepted', 'aceptada', 'asignada', 'assigned', 'confirmada', 'confirmed']);
const SCHEDULED_CLASS_STATUSES = new Set(['programada', 'scheduled', 'confirmada', 'confirmed', 'pendiente', 'pending']);
const PAID_CLASS_STATUSES = new Set(['pagada', 'paid', 'realizada_pagada']);
const PAID_PAYOUT_STATUSES = new Set(['pagado', 'paid', 'validado', 'validated', 'liquidado', 'settled', 'succeeded']);
const DAY_MS = 86400000;

function clean(value, max = 800) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function lower(value, max = 800) {
  return clean(value, max).toLowerCase();
}

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && clean(value) !== '');
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, number(value, min)));
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hoursSince(value, nowMs) {
  const date = toDate(value);
  if (!date) return Infinity;
  return Math.max(0, (nowMs - date.getTime()) / 36e5);
}

function hoursUntil(value, nowMs) {
  const date = toDate(value);
  if (!date) return Infinity;
  return (date.getTime() - nowMs) / 36e5;
}

function statusOf(item = {}) {
  return lower(first(item.status, item.estado, item.lifecycleStatus, item.followupStatus, item.verificationStatus, item.estado_verificacion), 120);
}

function isClosed(item = {}) {
  return CLOSED_STATUSES.has(statusOf(item));
}

function safeId(value) {
  return clean(value, 240).toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}

function cadenceBucket(nowMs, hours) {
  const span = Math.max(1, number(hours, 24)) * 36e5;
  return String(Math.floor(nowMs / span));
}

function priorityScore(priority) {
  return {
    critical: 96,
    high: 84,
    normal: 58,
    low: 34,
  }[priority] || 58;
}

function hasValue(item = {}, keys = []) {
  return keys.some((key) => {
    const value = key.split('.').reduce((acc, part) => acc?.[part], item);
    if (Array.isArray(value)) return value.filter(Boolean).length > 0;
    if (typeof value === 'boolean') return value === true;
    return clean(value) !== '';
  });
}

function idOf(item = {}, keys = []) {
  return clean(first(...keys.map((key) => item[key]), item.id, item.uid, item.userUid, item.email), 220);
}

function userUidOf(item = {}) {
  return clean(first(item.userUid, item.usuario_id, item.uid, item.id), 220);
}

function displayName(item = {}, fallback = 'Usuario') {
  return clean(first(
    item.displayName,
    item.nombreCompleto,
    [item.nombre, item.apellidos].filter(Boolean).join(' '),
    [item.usuarios?.nombre, item.usuarios?.apellidos].filter(Boolean).join(' '),
    item.name,
    item.email,
    item.usuarios?.email,
    fallback,
  ), 180);
}

function profilePercent(item = {}, requiredGroups = []) {
  const explicit = first(
    item.profileCompletionPercent,
    item.completionPercent,
    item.porcentajePerfil,
    item.reputationMetrics?.profileCompletionPercent,
    item.trustProfile?.metrics?.profileCompletionPercent,
    item.trust?.metrics?.profileCompletionPercent,
  );
  if (explicit !== undefined && explicit !== null && clean(explicit) !== '') return clamp(explicit, 0, 100);
  if (!requiredGroups.length) return 0;
  const completed = requiredGroups.filter((group) => hasValue(item, group.keys)).length;
  return Math.round((completed / requiredGroups.length) * 100);
}

const TEACHER_REQUIRED_GROUPS = Object.freeze([
  { label: 'foto', keys: ['photoURL', 'photoUrl', 'foto', 'avatarUrl', 'profilePhotoUrl'] },
  { label: 'telefono', keys: ['telefono', 'phone', 'whatsapp', 'mobile'] },
  { label: 'direccion y ciudad', keys: ['direccion', 'address', 'calle', 'street', 'ciudad', 'city'] },
  { label: 'colegio', keys: ['colegio', 'school', 'highSchool', 'colegioBachillerato'] },
  { label: 'universidad y estudios', keys: ['universidad', 'university', 'grado', 'degree', 'estudios', 'studies', 'formacion'] },
  { label: 'materias o actividades', keys: ['materias', 'subjects', 'activities', 'actividades'] },
  { label: 'niveles', keys: ['niveles', 'levels', 'educationalLevels'] },
  { label: 'disponibilidad', keys: ['disponibilidad', 'availability', 'availabilitySlots', 'franjasDisponibles', 'weeklyAvailability'] },
  { label: 'Bizum', keys: ['hasBizum', 'bizumEnabled', 'bizumPhone', 'bizum'] },
]);

const FAMILY_REQUIRED_GROUPS = Object.freeze([
  { label: 'telefono', keys: ['telefono', 'phone', 'whatsapp', 'mobile'] },
  { label: 'direccion o zona', keys: ['direccion', 'address', 'calle', 'street', 'zona', 'city', 'ciudad'] },
  { label: 'dia habitual de pago', keys: ['weeklyPaymentDay', 'paymentDay', 'diaPagoSemanal', 'pagoSemanalDia'] },
]);

function missingLabels(item = {}, requiredGroups = []) {
  return requiredGroups.filter((group) => !hasValue(item, group.keys)).map((group) => group.label);
}

function hasAvailability(item = {}) {
  return hasValue(item, ['availability', 'disponibilidad', 'availabilitySlots', 'franjasDisponibles', 'weeklyAvailability', 'horariosDisponibles']);
}

function buildAliasMap(rows = [], aliases = []) {
  const map = new Map();
  for (const item of rows || []) {
    const keys = [
      item.id,
      item.uid,
      item.userUid,
      item.usuario_id,
      item.familyUid,
      item.familia_id,
      item.teacherUid,
      item.profesor_id,
      item.studentId,
      item.alumno_id,
      ...aliases.map((key) => item[key]),
    ].map((value) => clean(value, 220)).filter(Boolean);
    for (const key of keys) map.set(key, item);
  }
  return map;
}

function requestId(request = {}) {
  return idOf(request, ['requestId', 'solicitudId', 'solicitud_id']);
}

function assignmentId(assignment = {}) {
  return idOf(assignment, ['assignmentId', 'asignacion_id']);
}

function activeAssignment(assignment = {}) {
  return ACTIVE_ASSIGNMENT_STATUSES.has(statusOf(assignment));
}

function openRequest(request = {}) {
  const status = statusOf(request);
  const assigned = first(request.assignedTeacherUid, request.profesor_asignado_id, request.teacherUid, request.profesor_id);
  return !assigned && !CLOSED_STATUSES.has(status) && !['asignada', 'assigned', 'aceptada', 'accepted'].includes(status);
}

function verifiedTeacher(teacher = {}) {
  const status = statusOf(teacher);
  return teacher.verified === true
    || teacher.verificado === true
    || teacher.isVerified === true
    || ['verificado', 'verified', 'activo', 'activa', 'active'].includes(status);
}

function matchesByRequest(matches = []) {
  const map = new Map();
  for (const match of matches || []) {
    const id = clean(first(match.requestId, match.solicitudId, match.solicitud_id), 220);
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(match);
  }
  return map;
}

function classesByAssignment(classes = []) {
  const map = new Map();
  for (const klass of classes || []) {
    const id = clean(first(klass.assignmentId, klass.asignacion_id, klass.relationshipId), 220);
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(klass);
  }
  return map;
}

function classStartDate(klass = {}) {
  const explicit = first(klass.startAtIso, klass.startAt, klass.dateStart, klass.fecha_inicio);
  if (explicit) return toDate(explicit);
  const day = clean(first(klass.fecha, klass.date), 20);
  const time = clean(first(klass.hora_inicio, klass.startTime, klass.time), 12);
  if (day && time && /^\d{4}-\d{2}-\d{2}$/.test(day)) return toDate(`${day}T${time.length === 5 ? `${time}:00` : time}`);
  return toDate(day);
}

function scheduledUpcomingClass(klass = {}, nowMs, horizonHours) {
  const status = statusOf(klass);
  if (!SCHEDULED_CLASS_STATUSES.has(status) || PAID_CLASS_STATUSES.has(status)) return false;
  const until = hoursUntil(classStartDate(klass), nowMs);
  return until >= 0 && until <= horizonHours;
}

function completedClass(klass = {}) {
  const status = statusOf(klass);
  return ['realizada', 'completed', 'completada', 'done', 'pagada', 'paid'].includes(status)
    || Boolean(first(klass.completedAt, klass.completed_at, klass.confirmedAt, klass.confirmadaAt));
}

function hasClassFinancials(klass = {}) {
  const familyAmount = number(first(klass.familyAmount, klass.totalFamilia, klass.precioFamilia, klass.amount, klass.monto), 0);
  const teacherAmount = number(first(klass.teacherAmount, klass.importeProfesor, klass.profesorAmount, klass.teacherPayoutAmount), 0);
  return familyAmount > 0 && teacherAmount > 0;
}

function teacherAmountOf(klass = {}) {
  return number(first(klass.teacherAmount, klass.importeProfesor, klass.profesorAmount, klass.teacherPayoutAmount), 0);
}

function teacherPayoutPending(klass = {}) {
  if (!completedClass(klass)) return false;
  if (teacherAmountOf(klass) <= 0) return false;
  const status = lower(first(klass.teacherPayoutStatus, klass.payoutStatus, klass.estadoPagoProfesor, klass.professorPaymentStatus), 120);
  return !PAID_PAYOUT_STATUSES.has(status);
}

function teacherHasBizum(teacher = {}) {
  return hasValue(teacher, ['hasBizum', 'bizumEnabled', 'bizumPhone', 'bizum', 'telefonoBizum']);
}

function notificationUnread(item = {}) {
  if (item.readAt || item.leidaAt || item.read_at) return false;
  if (item.read === true || item.leida === true || item.isRead === true) return false;
  const status = statusOf(item);
  return !['read', 'leida', 'leido', 'archived', 'archivada'].includes(status);
}

function highPriorityNotification(item = {}) {
  const priority = lower(first(item.priority, item.prioridad, item.severity, item.importance), 80);
  if (['critical', 'critica', 'urgente', 'high', 'alta'].includes(priority)) return true;
  return /(payment_overdue|pago_vencido|class_unmarked|incidencia|critical|urgente)/i.test(clean(first(item.type, item.eventType, item.category, item.title, item.titulo), 500));
}

function hasPreviousSignal(previous = [], dedupeKey = '', cooldownHours = 24, nowMs = Date.now()) {
  if (!dedupeKey) return false;
  return toArray(previous).some((item) => {
    if (clean(item.dedupeKey) !== dedupeKey) return false;
    if (CLOSED_STATUSES.has(statusOf(item))) return false;
    const last = first(item.lastSeenAt, item.sentAt, item.createdAt, item.updatedAt, item.created_at);
    return hoursSince(last, nowMs) < cooldownHours;
  });
}

function buildRecipient(role, userUid, title, body, actionLabel, section, priority = 'normal') {
  const target = clean(userUid, 220);
  if (!target) return null;
  return {
    role: clean(role, 60),
    userUid: target,
    title: clean(title, 120),
    body: clean(body, 500),
    actionLabel: clean(actionLabel, 80),
    section: clean(section, 80),
    priority,
  };
}

function proactiveSignal(input) {
  const priority = input.priority || 'normal';
  const cooldownHours = number(input.cooldownHours || 24);
  const entityId = clean(input.entityId, 220);
  const bucket = cadenceBucket(input.nowMs, cooldownHours);
  return {
    id: safeId(`proactive_${input.signalId}_${entityId}_${bucket}`),
    dedupeKey: safeId(`${input.signalId}_${entityId}`),
    signalId: clean(input.signalId, 120),
    category: clean(input.category || 'assistance', 80),
    priority,
    priorityScore: priorityScore(priority),
    title: clean(input.title, 160),
    description: clean(input.description, 800),
    reason: clean(input.reason, 700),
    expectedOutcome: clean(input.expectedOutcome, 700),
    recommendedAction: clean(input.recommendedAction, 700),
    section: clean(input.section || 'operaciones', 80),
    entityType: clean(input.entityType || '', 80),
    entityId,
    entityName: clean(input.entityName || '', 180),
    userUid: clean(input.userUid, 220),
    familyUid: clean(input.familyUid, 220),
    teacherUid: clean(input.teacherUid, 220),
    studentId: clean(input.studentId, 220),
    requestId: clean(input.requestId, 220),
    assignmentId: clean(input.assignmentId, 220),
    classId: clean(input.classId, 220),
    notificationId: clean(input.notificationId, 220),
    cadenceHours: cooldownHours,
    cooldownHours,
    recipients: toArray(input.recipients),
    createAdminTask: Boolean(input.createAdminTask),
    createOpsAlert: Boolean(input.createOpsAlert),
    intrusive: Boolean(input.intrusive),
    source: 'proactive_assist_engine',
    version: PROACTIVE_ASSIST_VERSION,
    generatedAt: new Date(input.nowMs).toISOString(),
  };
}

function pushSignal(signals, previousSignals, signal, nowMs, counters, maxUserNotifications) {
  if (!signal?.id) return;
  if (hasPreviousSignal(previousSignals, signal.dedupeKey, signal.cooldownHours, nowMs)) return;
  const nextRecipientCount = signal.recipients.length;
  if (nextRecipientCount && counters.userNotifications + nextRecipientCount > maxUserNotifications) {
    signal.recipients = [];
    if (!signal.createAdminTask && !signal.createOpsAlert) return;
  }
  counters.userNotifications += signal.recipients.length;
  signals.push(signal);
}

function buildTeacherProfileSignals(dataset, options, nowMs, push) {
  for (const teacher of dataset.profesores || []) {
    if (isClosed(teacher)) continue;
    const missing = missingLabels(teacher, TEACHER_REQUIRED_GROUPS);
    const percent = profilePercent(teacher, TEACHER_REQUIRED_GROUPS);
    if (percent >= options.profileNudgeMinCompletion || missing.length === 0) continue;
    const uid = userUidOf(teacher);
    const name = displayName(teacher, 'Profesor');
    const createdAge = hoursSince(first(teacher.createdAt, teacher.created_at, teacher.fechaAlta), nowMs);
    const priority = percent < 55 ? 'high' : 'normal';
    push(proactiveSignal({
      nowMs,
      signalId: 'teacher_profile_help',
      category: 'profile',
      priority,
      title: `Perfil de ${name} incompleto`,
      description: `Faltan ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '...' : ''}.`,
      reason: `El perfil esta al ${Math.round(percent)}% y ClasesDe10 necesita datos verificables antes de asignar con confianza.`,
      expectedOutcome: 'El profesor completa los datos clave y aumenta su probabilidad de recibir alumnos.',
      recommendedAction: 'Abrir Mi perfil y completar los campos destacados.',
      section: 'perfil',
      entityType: 'profesor',
      entityId: idOf(teacher, ['profesor_id']),
      entityName: name,
      teacherUid: uid,
      userUid: uid,
      cooldownHours: options.profileNudgeCooldownHours,
      createAdminTask: createdAge >= options.onboardingNudgeHours && percent < 65,
      recipients: [
        buildRecipient('profesor', uid, 'Completa tu perfil', `Te faltan ${missing.slice(0, 3).join(', ')} para que podamos proponerte mejor a las familias.`, 'Completar perfil', 'perfil', priority),
      ].filter(Boolean),
    }));
  }
}

function buildFamilyProfileSignals(dataset, options, nowMs, push) {
  const studentsByFamily = new Map();
  for (const student of dataset.alumnos || []) {
    const familyUid = clean(first(student.familyUid, student.familia_id, student.parentUid, student.parentId), 220);
    if (!familyUid) continue;
    if (!studentsByFamily.has(familyUid)) studentsByFamily.set(familyUid, []);
    studentsByFamily.get(familyUid).push(student);
  }
  const requestsByFamily = new Set((dataset.solicitudes || []).map((item) => clean(first(item.familyUid, item.familia_id), 220)).filter(Boolean));
  const assignmentsByFamily = new Set((dataset.asignaciones || []).filter(activeAssignment).map((item) => clean(first(item.familyUid, item.familia_id), 220)).filter(Boolean));

  for (const family of dataset.familias || []) {
    if (isClosed(family)) continue;
    const uid = userUidOf(family);
    const familyId = idOf(family, ['familyUid', 'familia_id']);
    const related = studentsByFamily.get(familyId)?.length || requestsByFamily.has(familyId) || assignmentsByFamily.has(familyId);
    const missing = missingLabels(family, FAMILY_REQUIRED_GROUPS);
    const percent = profilePercent(family, FAMILY_REQUIRED_GROUPS);
    const hasChildren = Boolean(studentsByFamily.get(familyId)?.length);
    const createdAge = hoursSince(first(family.createdAt, family.created_at, family.fechaAlta), nowMs);
    if (!hasChildren && createdAge >= options.onboardingNudgeHours) {
      push(proactiveSignal({
        nowMs,
        signalId: 'family_add_first_student',
        category: 'onboarding',
        priority: 'normal',
        title: 'Familia registrada sin alumno',
        description: `${displayName(family, 'Familia')} todavia no ha anadido ningun hijo/a.`,
        reason: `Han pasado ${Math.round(createdAge)} horas desde el alta y no puede solicitar profesor sin alumno.`,
        expectedOutcome: 'La familia anade el alumno y puede pedir profesor sin quedarse bloqueada.',
        recommendedAction: 'Guiar a Mis hijos para anadir alumno y disponibilidad.',
        section: 'alumnos',
        entityType: 'familia',
        entityId: familyId,
        entityName: displayName(family, 'Familia'),
        familyUid: uid,
        userUid: uid,
        cooldownHours: options.userNotificationCooldownHours,
        recipients: [
          buildRecipient('familia', uid, 'Te falta anadir alumno', 'Anade a tu hijo/a para poder solicitar profesor y marcar disponibilidad.', 'Anadir alumno', 'alumnos'),
        ].filter(Boolean),
      }));
      continue;
    }
    if (!related || percent >= 100 || missing.length === 0) continue;
    push(proactiveSignal({
      nowMs,
      signalId: 'family_profile_help',
      category: 'profile',
      priority: 'low',
      title: `Perfil familiar incompleto: ${displayName(family, 'Familia')}`,
      description: `Faltan ${missing.join(', ')}.`,
      reason: 'La familia ya tiene actividad y esos datos facilitan clases presenciales, pagos y avisos.',
      expectedOutcome: 'Menos preguntas manuales antes de cerrar horarios o pagos.',
      recommendedAction: 'Pedir completar los datos utiles desde Mi perfil.',
      section: 'perfil',
      entityType: 'familia',
      entityId: familyId,
      entityName: displayName(family, 'Familia'),
      familyUid: uid,
      userUid: uid,
      cooldownHours: options.profileNudgeCooldownHours,
      recipients: [
        buildRecipient('familia', uid, 'Completa datos utiles', `Faltan ${missing.slice(0, 2).join(' y ')} para que podamos organizar mejor las clases.`, 'Completar perfil', 'perfil', 'low'),
      ].filter(Boolean),
    }));
  }
}

function buildAvailabilitySignals(dataset, options, nowMs, push) {
  const teachers = buildAliasMap(dataset.profesores || [], ['profesor_id']);
  const families = buildAliasMap(dataset.familias || [], ['familia_id']);
  const students = buildAliasMap(dataset.alumnos || [], ['alumno_id']);
  const classesByAssign = classesByAssignment(dataset.clases || []);
  for (const assignment of dataset.asignaciones || []) {
    if (!activeAssignment(assignment)) continue;
    const id = assignmentId(assignment);
    const relatedClasses = classesByAssign.get(id) || [];
    const hasFutureClass = relatedClasses.some((klass) => scheduledUpcomingClass(klass, nowMs, 365 * 24));
    if (hasFutureClass) continue;
    const age = hoursSince(first(assignment.createdAt, assignment.created_at, assignment.updatedAt), nowMs);
    if (age < options.missingAvailabilityHours) continue;
    const teacherKey = clean(first(assignment.teacherUid, assignment.profesor_id), 220);
    const familyKey = clean(first(assignment.familyUid, assignment.familia_id), 220);
    const studentKey = clean(first(assignment.studentId, assignment.alumno_id), 220);
    const teacher = teachers.get(teacherKey) || {};
    const family = families.get(familyKey) || {};
    const student = students.get(studentKey) || {};
    const recipients = [];
    const missing = [];
    if (teacherKey && !hasAvailability(teacher)) {
      missing.push('profesor');
      recipients.push(buildRecipient('profesor', userUidOf(teacher) || teacherKey, 'Marca tus franjas disponibles', 'Asi la familia solo propondra horas que realmente puedas aceptar.', 'Abrir disponibilidad', 'disponibilidad', 'normal'));
    }
    if (familyKey && !hasAvailability(student)) {
      missing.push('alumno');
      recipients.push(buildRecipient('familia', userUidOf(family) || familyKey, 'Marca disponibilidad del alumno', 'Asi el profesor podra proponer clases dentro de vuestras franjas reales.', 'Abrir alumno', 'alumnos', 'normal'));
    }
    if (!missing.length) continue;
    push(proactiveSignal({
      nowMs,
      signalId: 'missing_availability_before_schedule',
      category: 'scheduling',
      priority: age >= options.adminEscalationHours ? 'high' : 'normal',
      title: 'Relacion sin franjas para cerrar horario',
      description: `Falta disponibilidad de ${missing.join(' y ')} antes de programar la primera clase.`,
      reason: `La asignacion lleva ${Math.round(age)} horas activa sin clase futura y sin franjas suficientes.`,
      expectedOutcome: 'Ambas partes proponen horarios compatibles y se evita negociar a ciegas en el chat.',
      recommendedAction: 'Completar disponibilidad y cerrar una clase desde el chat.',
      section: 'disponibilidad',
      entityType: 'asignacion',
      entityId: id,
      entityName: clean(first(student.nombre, assignment.studentName, assignment.materia, 'Asignacion'), 180),
      assignmentId: id,
      familyUid: userUidOf(family) || familyKey,
      teacherUid: userUidOf(teacher) || teacherKey,
      studentId: studentKey,
      cooldownHours: options.userNotificationCooldownHours,
      createAdminTask: age >= options.adminEscalationHours,
      recipients: recipients.filter(Boolean),
    }));
  }
}

function buildRequestReadinessSignals(dataset, options, nowMs, push) {
  const families = buildAliasMap(dataset.familias || [], ['familia_id']);
  const students = buildAliasMap(dataset.alumnos || [], ['alumno_id']);
  const studentsByFamily = new Map();
  for (const student of dataset.alumnos || []) {
    const familyId = clean(first(student.familyUid, student.familia_id, student.parentUid, student.parentId), 220);
    if (!familyId) continue;
    if (!studentsByFamily.has(familyId)) studentsByFamily.set(familyId, []);
    studentsByFamily.get(familyId).push(student);
  }

  for (const request of dataset.solicitudes || []) {
    if (!openRequest(request)) continue;
    const age = hoursSince(first(request.createdAt, request.created_at, request.fecha), nowMs);
    if (age < options.requestAvailabilityNudgeHours) continue;
    const id = requestId(request);
    const familyKey = clean(first(request.familyUid, request.familia_id), 220);
    const studentKey = clean(first(request.studentId, request.alumno_id, request.studentUid), 220);
    const family = families.get(familyKey) || {};
    const candidates = [
      students.get(studentKey),
      ...(studentsByFamily.get(familyKey) || []),
    ].filter(Boolean);
    const student = candidates[0] || {};
    if (studentKey && hasAvailability(student)) continue;
    if (!studentKey && candidates.some(hasAvailability)) continue;
    push(proactiveSignal({
      nowMs,
      signalId: 'request_missing_student_availability',
      category: 'request_readiness',
      priority: age >= options.adminEscalationHours ? 'high' : 'normal',
      title: 'Solicitud sin disponibilidad del alumno',
      description: `${clean(first(request.materia, request.subject, 'Solicitud'))} puede tardar mas porque no hay franjas disponibles del alumno.`,
      reason: `La solicitud lleva ${Math.round(age)} horas abierta y el matching no puede cruzar horarios reales.`,
      expectedOutcome: 'La familia marca franjas y el sistema recomienda profesores compatibles de verdad.',
      recommendedAction: 'Pedir a la familia que anada disponibilidad del alumno antes de proponer profesor.',
      section: 'alumnos',
      entityType: 'solicitud',
      entityId: id,
      entityName: clean(first(student.nombre, request.studentName, request.familyName, 'Solicitud'), 180),
      requestId: id,
      familyUid: userUidOf(family) || familyKey,
      studentId: clean(first(student.id, studentKey), 220),
      cooldownHours: options.userNotificationCooldownHours,
      createAdminTask: age >= options.adminEscalationHours,
      recipients: [
        buildRecipient('familia', userUidOf(family) || familyKey, 'Marca las franjas del alumno', 'Asi podremos proponerte profesores que encajen con vuestro horario real.', 'Abrir alumno', 'alumnos', 'normal'),
      ].filter(Boolean),
    }));
  }
}

function buildLowSupplySignals(dataset, options, nowMs, push) {
  const byRequest = matchesByRequest(dataset.solicitudMatches || []);
  for (const request of dataset.solicitudes || []) {
    if (!openRequest(request)) continue;
    const id = requestId(request);
    const age = hoursSince(first(request.createdAt, request.created_at, request.fecha), nowMs);
    if (age < options.lowSupplyRequestHours) continue;
    const matches = byRequest.get(id) || [];
    const ready = matches.filter((match) => !CLOSED_STATUSES.has(statusOf(match)) && number(first(match.score, match.matchScore, match.compatibilityScore), 0) >= options.lowSupplyMinScore);
    if (ready.length >= options.lowSupplyMinCandidates) continue;
    push(proactiveSignal({
      nowMs,
      signalId: 'request_low_supply',
      category: 'matching',
      priority: ready.length ? 'high' : 'critical',
      title: 'Solicitud con poca oferta real',
      description: `${clean(first(request.materia, request.subject, 'Materia'))} - ${clean(first(request.nivel, request.level, 'nivel sin indicar'))}: ${ready.length} candidato(s) listos.`,
      reason: `La solicitud lleva ${Math.round(age)} horas abierta y el matching no tiene suficiente oferta.`,
      expectedOutcome: 'El admin amplia criterios, activa busqueda o contacta profesores antes de que la familia espere demasiado.',
      recommendedAction: 'Revisar ranking, ubicacion, modalidad y materias compatibles; ampliar criterios si hace falta.',
      section: 'solicitudes',
      entityType: 'solicitud',
      entityId: id,
      entityName: clean(first(request.familyName, request.familia_nombre, request.nombreFamilia, 'Familia'), 180),
      requestId: id,
      familyUid: clean(first(request.familyUid, request.familia_id), 220),
      cooldownHours: options.adminCooldownHours,
      createAdminTask: true,
      createOpsAlert: ready.length === 0,
    }));
  }
}

function buildTeacherPayoutReadinessSignals(dataset, options, nowMs, push) {
  const teachers = buildAliasMap(dataset.profesores || [], ['profesor_id']);
  const pendingByTeacher = new Map();
  for (const klass of dataset.clases || []) {
    if (!teacherPayoutPending(klass)) continue;
    const teacherKey = clean(first(klass.teacherUid, klass.profesor_id), 220);
    if (!teacherKey) continue;
    const age = hoursSince(first(klass.endAtIso, klass.fecha_fin, klass.completedAt, klass.fecha, klass.createdAt), nowMs);
    if (age < options.teacherPayoutReadinessHours) continue;
    const bucket = pendingByTeacher.get(teacherKey) || { count: 0, amount: 0, latest: null, classIds: [] };
    bucket.count += 1;
    bucket.amount += teacherAmountOf(klass);
    bucket.latest = bucket.latest || first(klass.endAtIso, klass.fecha_fin, klass.completedAt, klass.fecha, klass.createdAt);
    bucket.classIds.push(idOf(klass, ['classId', 'clase_id']));
    pendingByTeacher.set(teacherKey, bucket);
  }

  for (const [teacherKey, bucket] of pendingByTeacher.entries()) {
    const teacher = teachers.get(teacherKey) || {};
    if (teacherHasBizum(teacher)) continue;
    const uid = userUidOf(teacher) || teacherKey;
    const name = displayName(teacher, 'Profesor');
    push(proactiveSignal({
      nowMs,
      signalId: 'teacher_missing_bizum_before_payout',
      category: 'payment_readiness',
      priority: bucket.count >= 2 ? 'high' : 'normal',
      title: `Falta Bizum para pagar a ${name}`,
      description: `${bucket.count} clase(s) completadas tienen ${Math.round(bucket.amount)} EUR pendientes para el profesor, pero no hay Bizum operativo.`,
      reason: 'Si no se pide antes, el cierre quincenal exigira gestion manual y retrasara el pago al profesor.',
      expectedOutcome: 'El profesor anade Bizum y el admin puede pagar sin perseguir datos.',
      recommendedAction: 'Pedir Bizum al profesor y completar su perfil antes del proximo cierre.',
      section: 'ingresos',
      entityType: 'profesor',
      entityId: teacherKey,
      entityName: name,
      teacherUid: uid,
      classId: bucket.classIds[0] || '',
      cooldownHours: options.userNotificationCooldownHours,
      createAdminTask: true,
      recipients: [
        buildRecipient('profesor', uid, 'Falta tu Bizum', 'Anade Bizum en tu perfil para que podamos pagarte las clases sin retrasos.', 'Abrir perfil', 'perfil', 'normal'),
      ].filter(Boolean),
    }));
  }
}

function buildUpcomingClassReadinessSignals(dataset, options, nowMs, push) {
  for (const klass of dataset.clases || []) {
    if (!scheduledUpcomingClass(klass, nowMs, options.upcomingClassReadinessHours)) continue;
    if (hasClassFinancials(klass)) continue;
    const id = idOf(klass, ['classId', 'clase_id']);
    push(proactiveSignal({
      nowMs,
      signalId: 'upcoming_class_missing_financials',
      category: 'readiness',
      priority: 'high',
      title: 'Clase proxima sin importes cerrados',
      description: `${clean(first(klass.subject, klass.materia, 'Clase'))} empieza pronto pero no tiene precio familia e importe profesor completos.`,
      reason: 'Si la clase se imparte sin importes, pagos, ingresos del profesor y margen admin quedaran inconsistentes.',
      expectedOutcome: 'El admin completa los importes antes de que la clase ocurra.',
      recommendedAction: 'Abrir la clase y fijar precio familia, importe profesor y margen.',
      section: 'calendario',
      entityType: 'clase',
      entityId: id,
      entityName: clean(first(klass.studentName, klass.alumno_nombre, klass.subject, klass.materia, 'Clase'), 180),
      classId: id,
      familyUid: clean(first(klass.familyUid, klass.familia_id), 220),
      teacherUid: clean(first(klass.teacherUid, klass.profesor_id), 220),
      studentId: clean(first(klass.studentId, klass.alumno_id), 220),
      cooldownHours: options.adminCooldownHours,
      createAdminTask: true,
    }));
  }
}

function buildTeacherSupplyActivationSignals(dataset, options, nowMs, push) {
  const activeAssignments = new Set((dataset.asignaciones || [])
    .filter(activeAssignment)
    .map((assignment) => clean(first(assignment.teacherUid, assignment.profesor_id), 220))
    .filter(Boolean));
  for (const teacher of dataset.profesores || []) {
    if (!verifiedTeacher(teacher) || isClosed(teacher)) continue;
    const teacherKey = idOf(teacher, ['profesor_id']);
    if (!teacherKey || activeAssignments.has(teacherKey) || activeAssignments.has(userUidOf(teacher))) continue;
    const ageDays = hoursSince(first(teacher.verifiedAt, teacher.verificadoAt, teacher.createdAt, teacher.created_at), nowMs) / 24;
    if (ageDays < options.verifiedTeacherIdleDays) continue;
    push(proactiveSignal({
      nowMs,
      signalId: 'verified_teacher_without_students',
      category: 'supply_activation',
      priority: ageDays >= options.verifiedTeacherIdleDays * 2 ? 'normal' : 'low',
      title: `Profesor verificado sin alumnos: ${displayName(teacher, 'Profesor')}`,
      description: 'El profesor ya esta listo, pero no tiene ninguna asignacion activa.',
      reason: `Lleva ${Math.round(ageDays)} dias disponible sin alumnos; puede perder motivacion o abandonar.`,
      expectedOutcome: 'El admin lo revisa para destacarlo, usarlo en matching o reactivar su disponibilidad.',
      recommendedAction: 'Comparar con solicitudes abiertas y marcarlo como candidato destacado si encaja.',
      section: 'profesores',
      entityType: 'profesor',
      entityId: teacherKey,
      entityName: displayName(teacher, 'Profesor'),
      teacherUid: userUidOf(teacher) || teacherKey,
      cooldownHours: options.adminCooldownHours,
      createAdminTask: true,
    }));
  }
}

function buildUnreadNotificationSignals(dataset, options, nowMs, push) {
  for (const notification of dataset.notificaciones || []) {
    if (!notificationUnread(notification) || !highPriorityNotification(notification)) continue;
    const age = hoursSince(first(notification.createdAt, notification.created_at, notification.sentAt), nowMs);
    if (age < options.unreadCriticalNotificationHours) continue;
    const id = idOf(notification, ['notificationId', 'notificacion_id']);
    push(proactiveSignal({
      nowMs,
      signalId: 'unread_priority_notification',
      category: 'attention',
      priority: 'high',
      title: 'Aviso prioritario sin leer',
      description: clean(first(notification.title, notification.titulo, notification.body, notification.mensaje, 'Notificacion prioritaria pendiente'), 240),
      reason: `Lleva ${Math.round(age)} horas sin leerse y puede requerir seguimiento humano.`,
      expectedOutcome: 'El admin decide si hace falta contactar o resolver la causa.',
      recommendedAction: 'Revisar destinatario, contexto y si la accion sigue pendiente.',
      section: 'notificaciones',
      entityType: 'notificacion',
      entityId: id,
      entityName: clean(first(notification.recipientName, notification.userName, notification.userUid, 'Notificacion'), 180),
      userUid: clean(first(notification.userUid, notification.recipientUid, notification.toUid), 220),
      notificationId: id,
      cooldownHours: options.adminCooldownHours,
      createAdminTask: true,
    }));
  }
}

function buildStaleAdminTaskSignals(dataset, options, nowMs, push) {
  for (const task of dataset.crmTasks || []) {
    if (isClosed(task)) continue;
    const due = first(task.dueAt, task.fecha_vencimiento, task.deadlineAt);
    if (!due) continue;
    const overdueHours = hoursSince(due, nowMs);
    if (overdueHours < options.staleAdminTaskHours) continue;
    const id = idOf(task, ['taskId']);
    push(proactiveSignal({
      nowMs,
      signalId: 'stale_admin_task',
      category: 'operations',
      priority: overdueHours >= options.staleAdminTaskHours * 2 ? 'high' : 'normal',
      title: 'Tarea admin atascada',
      description: clean(first(task.title, task.description, 'Tarea CRM vencida'), 260),
      reason: `La tarea vencio hace ${Math.round(overdueHours)} horas y puede estar frenando una automatizacion.`,
      expectedOutcome: 'El admin completa, reprograma o descarta la tarea para mantener limpia la bandeja operativa.',
      recommendedAction: 'Abrir Operaciones y resolver la tarea vencida.',
      section: clean(first(task.section, task.entityType, 'operaciones'), 80),
      entityType: 'crmTask',
      entityId: id,
      entityName: clean(first(task.entityName, task.title, 'CRM'), 180),
      cooldownHours: options.adminCooldownHours,
      createOpsAlert: true,
    }));
  }
}

export function buildProactiveAssistPlan(dataset = {}, options = {}) {
  const nowDate = toDate(options.nowIso) || new Date();
  const nowMs = nowDate.getTime();
  const thresholds = {
    onboardingNudgeHours: number(options.onboardingNudgeHours, 24),
    profileNudgeMinCompletion: number(options.profileNudgeMinCompletion, 85),
    profileNudgeCooldownHours: number(options.profileNudgeCooldownHours, 72),
    missingAvailabilityHours: number(options.missingAvailabilityHours, 24),
    requestAvailabilityNudgeHours: number(options.requestAvailabilityNudgeHours, 12),
    upcomingClassReadinessHours: number(options.upcomingClassReadinessHours, 36),
    teacherPayoutReadinessHours: number(options.teacherPayoutReadinessHours, 1),
    unreadCriticalNotificationHours: number(options.unreadCriticalNotificationHours, 12),
    lowSupplyRequestHours: number(options.lowSupplyRequestHours, 24),
    lowSupplyMinCandidates: number(options.lowSupplyMinCandidates, 2),
    lowSupplyMinScore: number(options.lowSupplyMinScore, 55),
    verifiedTeacherIdleDays: number(options.verifiedTeacherIdleDays, 7),
    staleAdminTaskHours: number(options.staleAdminTaskHours, 48),
    userNotificationCooldownHours: number(options.userNotificationCooldownHours, 72),
    adminCooldownHours: number(options.adminCooldownHours, 24),
    adminEscalationHours: number(options.adminEscalationHours, 48),
    maxUserNotifications: number(options.maxUserNotifications, 30),
  };
  const previousSignals = dataset.previousSignals || dataset.proactiveAssistSignals || [];
  const signals = [];
  const counters = { userNotifications: 0 };
  const push = (signal) => pushSignal(signals, previousSignals, signal, nowMs, counters, thresholds.maxUserNotifications);

  buildTeacherProfileSignals(dataset, thresholds, nowMs, push);
  buildFamilyProfileSignals(dataset, thresholds, nowMs, push);
  buildAvailabilitySignals(dataset, thresholds, nowMs, push);
  buildRequestReadinessSignals(dataset, thresholds, nowMs, push);
  buildLowSupplySignals(dataset, thresholds, nowMs, push);
  buildTeacherPayoutReadinessSignals(dataset, thresholds, nowMs, push);
  buildUpcomingClassReadinessSignals(dataset, thresholds, nowMs, push);
  buildTeacherSupplyActivationSignals(dataset, thresholds, nowMs, push);
  buildUnreadNotificationSignals(dataset, thresholds, nowMs, push);
  buildStaleAdminTaskSignals(dataset, thresholds, nowMs, push);

  const sorted = signals.sort((a, b) => (b.priorityScore - a.priorityScore) || a.title.localeCompare(b.title));
  const summary = {
    total: sorted.length,
    userNotifications: sorted.reduce((sum, item) => sum + item.recipients.length, 0),
    adminTasks: sorted.filter((item) => item.createAdminTask).length,
    opsAlerts: sorted.filter((item) => item.createOpsAlert).length,
    onboarding: sorted.filter((item) => item.category === 'onboarding').length,
    profileHelp: sorted.filter((item) => item.category === 'profile').length,
    schedulingHelp: sorted.filter((item) => item.category === 'scheduling').length,
    requestReadiness: sorted.filter((item) => item.category === 'request_readiness').length,
    matchingHelp: sorted.filter((item) => item.category === 'matching').length,
    paymentReadiness: sorted.filter((item) => item.category === 'payment_readiness').length,
    readinessChecks: sorted.filter((item) => item.category === 'readiness').length,
    supplyActivation: sorted.filter((item) => item.category === 'supply_activation').length,
    attentionChecks: sorted.filter((item) => item.category === 'attention').length,
  };

  return {
    version: PROACTIVE_ASSIST_VERSION,
    generatedAt: nowDate.toISOString(),
    thresholds,
    total: sorted.length,
    summary,
    signals: sorted,
  };
}
