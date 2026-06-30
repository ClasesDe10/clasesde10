export const RELATIONSHIP_FOLLOWUP_VERSION = 'relationship-followup-2026-06-30';

const CLOSED_STATUSES = new Set(['resolved', 'resuelta', 'cerrada', 'closed', 'done', 'archived', 'archivada', 'suppressed']);
const ADMIN_ACTION_STAGES = new Set(['chat_pendiente', 'pago_vencido', 'incidencia_abierta']);
const DAY_MS = 86400000;

function clean(value, max = 600) {
  return String(value ?? '').trim().slice(0, max);
}

function lower(value, max = 600) {
  return clean(value, max).toLowerCase();
}

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && clean(value) !== '');
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function futureDate(items = [], getDate = (item) => item.startAtIso || item.fecha || item.date, nowMs = Date.now()) {
  return toArray(items)
    .map(getDate)
    .map(toDate)
    .filter((date) => date && date.getTime() >= nowMs)
    .sort((a, b) => a.getTime() - b.getTime())[0] || null;
}

function latestDate(items = [], getDate = (item) => item.updatedAt || item.updated_at || item.createdAt || item.created_at || item.lastActivityAt) {
  return toArray(items)
    .map(getDate)
    .map(toDate)
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;
}

function dateList(values = []) {
  return toArray(values)
    .map(toDate)
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime());
}

function statusOf(item = {}) {
  return lower(first(item.status, item.estado, item.followupStatus));
}

function safeId(value) {
  return clean(value, 220).toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}

function cadenceBucket(nowMs, hours) {
  const span = Math.max(1, number(hours, 24)) * 36e5;
  return String(Math.floor(nowMs / span));
}

function priorityScore(priority) {
  return {
    critical: 95,
    high: 84,
    normal: 58,
    low: 32,
  }[priority] || 58;
}

function relationshipId(relationship = {}) {
  return clean(first(relationship.id, relationship.assignment?.id, relationship.chat?.id, relationship.request?.id), 220);
}

function familyUid(relationship = {}) {
  return clean(first(
    relationship.participants?.familyUid,
    relationship.assignment?.familyUid,
    relationship.assignment?.familia_id,
    relationship.chat?.familyUid,
    relationship.request?.familyUid,
    relationship.request?.familia_id,
  ), 220);
}

function teacherUid(relationship = {}) {
  return clean(first(
    relationship.participants?.teacherUid,
    relationship.assignment?.teacherUid,
    relationship.assignment?.profesor_id,
    relationship.chat?.teacherUid,
    relationship.request?.teacherUid,
    relationship.request?.assignedTeacherUid,
    relationship.request?.profesor_asignado_id,
  ), 220);
}

function studentId(relationship = {}) {
  return clean(first(relationship.participants?.studentId, relationship.assignment?.studentId, relationship.assignment?.alumno_id, relationship.chat?.studentId), 220);
}

function relationshipTitle(relationship = {}) {
  return clean(first(relationship.title, relationship.subject, relationship.student?.nombre, 'Relacion'), 140);
}

function stageAgeHours(relationship = {}, nowMs) {
  const refs = [
    relationship.lastActivityAt,
    relationship.chat?.updatedAt,
    relationship.chat?.updated_at,
    relationship.assignment?.updatedAt,
    relationship.assignment?.createdAt,
    relationship.request?.updatedAt,
    relationship.request?.createdAt,
  ];
  return hoursSince(first(...refs), nowMs);
}

function hasPreviousFollowup(previous = [], dedupeKey = '', cooldownHours = 24, nowMs = Date.now()) {
  if (!dedupeKey) return false;
  return toArray(previous).some((item) => {
    if (clean(item.dedupeKey) !== dedupeKey) return false;
    if (CLOSED_STATUSES.has(statusOf(item))) return false;
    const last = first(item.sentAt, item.lastSentAt, item.createdAt, item.updatedAt, item.created_at);
    return hoursSince(last, nowMs) < cooldownHours;
  });
}

function buildRecipient(role, userUid, title, body, actionLabel, section, priority = 'normal') {
  const target = clean(userUid, 220);
  if (!target) return null;
  return {
    role,
    userUid: target,
    title: clean(title, 120),
    body: clean(body, 500),
    actionLabel: clean(actionLabel, 80),
    section: clean(section, 80),
    priority,
  };
}

function followupAction(input) {
  const priority = input.priority || 'normal';
  const bucket = cadenceBucket(input.nowMs, input.cooldownHours || 24);
  const id = safeId(`relationship_followup_${input.actionId}_${input.relationshipId}_${bucket}`);
  return {
    id,
    dedupeKey: safeId(`${input.actionId}_${input.relationshipId}`),
    actionId: clean(input.actionId, 120),
    relationshipId: clean(input.relationshipId, 220),
    stage: clean(input.stage, 80),
    category: clean(input.category || 'relationship', 80),
    priority,
    priorityScore: priorityScore(priority),
    title: clean(input.title, 160),
    description: clean(input.description, 700),
    reason: clean(input.reason, 500),
    expectedOutcome: clean(input.expectedOutcome, 500),
    recommendedAction: clean(input.recommendedAction, 500),
    section: clean(input.section || 'chat', 80),
    cadenceHours: number(input.cooldownHours || 24),
    cooldownHours: number(input.cooldownHours || 24),
    recipients: toArray(input.recipients),
    createAdminTask: Boolean(input.createAdminTask),
    createOpsAlert: Boolean(input.createOpsAlert),
    intrusive: Boolean(input.intrusive),
    familyUid: clean(input.familyUid, 220),
    teacherUid: clean(input.teacherUid, 220),
    studentId: clean(input.studentId, 220),
    subject: clean(input.subject, 160),
    relationshipTitle: clean(input.relationshipTitle, 180),
    source: 'relationship_followup_engine',
    version: RELATIONSHIP_FOLLOWUP_VERSION,
    generatedAt: new Date(input.nowMs).toISOString(),
  };
}

function shouldSkipRelationship(relationship = {}) {
  const stage = clean(relationship.stage, 80);
  if (stage === 'relacion_finalizada') return true;
  if (!relationship.assignment && !relationship.chat && !relationship.request) return true;
  return false;
}

function classContext(relationship = {}, nowMs) {
  const classes = toArray(relationship.classes || relationship._classes || relationship.classList);
  const future = toDate(relationship.nextClassAt) || futureDate(classes, (item) => first(item.startAtIso, item.fecha, item.date, item.startAt), nowMs);
  const latest = toDate(relationship.lastClassAt) || latestDate(classes, (item) => first(item.endAtIso, item.fecha_fin, item.startAtIso, item.fecha, item.date, item.updatedAt, item.createdAt));
  const lastCompleted = toDate(relationship.lastCompletedClassAt) || latestDate(classes, (item) => first(item.completedAt, item.completed_at, item.endAtIso, item.fecha_fin, item.startAtIso, item.fecha, item.date, item.updatedAt, item.createdAt));
  const lastCancelled = toDate(relationship.lastCancelledClassAt) || latestDate(classes, (item) => first(item.cancelledAt, item.cancelled_at, item.cancelacion_fecha, item.updatedAt, item.fecha, item.date));
  const cancelledDates = dateList(relationship.history?.cancelledClassDates);
  const completed = number(relationship.counts?.completedClasses);
  const cancelled = number(relationship.counts?.cancelledClasses);
  const futureCount = number(relationship.counts?.futureClasses);
  const scheduledCount = number(relationship.counts?.scheduledClasses);
  return { classes, future, latest, lastCompleted, lastCancelled, cancelledDates, completed, cancelled, futureCount, scheduledCount };
}

function pushAction(actions, previousFollowups, action, nowMs) {
  if (!action?.id) return;
  if (hasPreviousFollowup(previousFollowups, action.dedupeKey, action.cooldownHours, nowMs)) return;
  actions.push(action);
}

function buildScheduleNeededAction(relationship, options, nowMs) {
  const age = stageAgeHours(relationship, nowMs);
  if (age < options.scheduleNudgeHours) return null;
  const id = relationshipId(relationship);
  const title = relationshipTitle(relationship);
  const family = familyUid(relationship);
  const teacher = teacherUid(relationship);
  return followupAction({
    nowMs,
    relationshipId: id,
    actionId: 'schedule_first_class',
    stage: relationship.stage,
    category: 'next_step',
    priority: age >= options.adminEscalationHours ? 'high' : 'normal',
    title: `Cerrar horario para ${title}`,
    description: 'La relacion ya existe, pero todavia no hay una primera clase programada.',
    reason: `Lleva ${Math.round(age)} horas sin horario cerrado desde la ultima actividad relevante.`,
    expectedOutcome: 'Familia y profesor proponen o aceptan una franja y la clase aparece en calendario.',
    recommendedAction: 'Abrir el chat y acordar la primera clase desde las franjas disponibles.',
    section: 'chat',
    cooldownHours: options.userNotificationCooldownHours,
    familyUid: family,
    teacherUid: teacher,
    studentId: studentId(relationship),
    subject: relationship.subject,
    relationshipTitle: title,
    createAdminTask: age >= options.adminEscalationHours,
    recipients: [
      buildRecipient('familia', family, 'Falta cerrar la primera clase', `Ya tienes profesor para ${title}. Acordad el horario desde el chat.`, 'Abrir chat', 'chat', 'normal'),
      buildRecipient('profesor', teacher, 'Falta cerrar la primera clase', `La familia de ${title} ya esta asignada. Propon una hora desde el chat.`, 'Abrir chat', 'chat', 'normal'),
    ].filter(Boolean),
  });
}

function buildProposalPendingAction(relationship, options, nowMs) {
  const age = stageAgeHours(relationship, nowMs);
  if (age < options.proposedScheduleNudgeHours) return null;
  const id = relationshipId(relationship);
  const title = relationshipTitle(relationship);
  const family = familyUid(relationship);
  const teacher = teacherUid(relationship);
  return followupAction({
    nowMs,
    relationshipId: id,
    actionId: 'answer_schedule_proposal',
    stage: relationship.stage,
    category: 'next_step',
    priority: age >= options.adminEscalationHours ? 'high' : 'normal',
    title: `Responder propuesta de horario para ${title}`,
    description: 'Hay una propuesta de clase pendiente y conviene cerrarla antes de que se enfrie la relacion.',
    reason: `La propuesta lleva ${Math.round(age)} horas sin cierre visible.`,
    expectedOutcome: 'Una parte acepta o propone alternativa y se evita bloqueo.',
    recommendedAction: 'Responder la propuesta en el chat.',
    section: 'chat',
    cooldownHours: options.userNotificationCooldownHours,
    familyUid: family,
    teacherUid: teacher,
    studentId: studentId(relationship),
    subject: relationship.subject,
    relationshipTitle: title,
    createAdminTask: age >= options.adminEscalationHours,
    recipients: [
      buildRecipient('familia', family, 'Hay una propuesta de horario pendiente', `Revisa el chat de ${title} y acepta o propon otra hora.`, 'Responder horario', 'chat', 'normal'),
      buildRecipient('profesor', teacher, 'Hay una propuesta de horario pendiente', `Revisa el chat de ${title} para cerrar la clase.`, 'Responder horario', 'chat', 'normal'),
    ].filter(Boolean),
  });
}

function buildFirstClassPrepAction(relationship, options, nowMs) {
  const ctx = classContext(relationship, nowMs);
  if (!ctx.future || ctx.completed > 0) return null;
  const hoursToClass = Math.max(0, (ctx.future.getTime() - nowMs) / 36e5);
  if (hoursToClass > options.firstClassPrepHours) return null;
  const id = relationshipId(relationship);
  const title = relationshipTitle(relationship);
  const family = familyUid(relationship);
  const teacher = teacherUid(relationship);
  return followupAction({
    nowMs,
    relationshipId: id,
    actionId: 'prepare_first_class',
    stage: relationship.stage,
    category: 'preparation',
    priority: 'low',
    title: `Preparar primera clase de ${title}`,
    description: 'La primera clase esta cerca. Un aviso breve reduce dudas sin interrumpir el flujo.',
    reason: `Quedan ${Math.round(hoursToClass)} horas para la primera clase programada.`,
    expectedOutcome: 'Ambas partes llegan con la hora clara y saben que despues deben confirmar asistencia.',
    recommendedAction: 'Revisar calendario y mantener el chat abierto para dudas concretas.',
    section: 'calendario',
    cooldownHours: Math.max(options.userNotificationCooldownHours, 48),
    familyUid: family,
    teacherUid: teacher,
    studentId: studentId(relationship),
    subject: relationship.subject,
    relationshipTitle: title,
    recipients: [
      buildRecipient('familia', family, 'Primera clase preparada', `La primera clase de ${title} esta cerca. Revisa calendario y usa el chat solo si necesitas ajustar algo.`, 'Ver calendario', 'calendario', 'low'),
      buildRecipient('profesor', teacher, 'Prepara la primera clase', `La primera clase de ${title} esta cerca. Al terminar, marca si se ha realizado.`, 'Ver calendario', 'calendario', 'low'),
    ].filter(Boolean),
  });
}

function buildConfirmationAction(relationship, options, nowMs) {
  const age = stageAgeHours(relationship, nowMs);
  if (age < options.confirmationNudgeHours) return null;
  const id = relationshipId(relationship);
  const title = relationshipTitle(relationship);
  const family = familyUid(relationship);
  const teacher = teacherUid(relationship);
  return followupAction({
    nowMs,
    relationshipId: id,
    actionId: 'confirm_finished_class',
    stage: relationship.stage,
    category: 'closure',
    priority: age >= 24 ? 'high' : 'normal',
    title: `Confirmar clase de ${title}`,
    description: 'Una clase terminada sigue pendiente de confirmacion.',
    reason: `La relacion lleva ${Math.round(age)} horas en estado pendiente de confirmacion.`,
    expectedOutcome: 'Asistencia cerrada, pagos y reputacion actualizados.',
    recommendedAction: 'Marcar la clase como realizada o abrir incidencia si no se dio.',
    section: 'clases',
    cooldownHours: options.userNotificationCooldownHours,
    familyUid: family,
    teacherUid: teacher,
    studentId: studentId(relationship),
    subject: relationship.subject,
    relationshipTitle: title,
    createAdminTask: age >= 24,
    recipients: [
      buildRecipient('familia', family, 'Confirma la clase terminada', `Indica si la clase de ${title} se realizo correctamente.`, 'Confirmar clase', 'clases', 'normal'),
      buildRecipient('profesor', teacher, 'Confirma la clase terminada', `Marca si la clase de ${title} se realizo o reporta incidencia.`, 'Confirmar asistencia', 'clases', 'normal'),
    ].filter(Boolean),
  });
}

function buildActiveSilenceAction(relationship, options, nowMs) {
  const ctx = classContext(relationship, nowMs);
  const lastClassHours = hoursSince(ctx.latest, nowMs);
  const inactiveDays = Math.min(stageAgeHours(relationship, nowMs), lastClassHours) / 24;
  if (relationship.stage !== 'relacion_activa') return null;
  if (ctx.futureCount > 0 || ctx.scheduledCount > 0) return null;
  if (ctx.completed <= 0) return null;
  if (inactiveDays < options.activeSilenceDays) return null;
  const id = relationshipId(relationship);
  const title = relationshipTitle(relationship);
  const family = familyUid(relationship);
  const teacher = teacherUid(relationship);
  return followupAction({
    nowMs,
    relationshipId: id,
    actionId: 'plan_next_regular_class',
    stage: relationship.stage,
    category: 'continuity',
    priority: inactiveDays >= options.teacherActivityDropDays ? 'high' : 'normal',
    title: `Planificar siguientes clases de ${title}`,
    description: 'La relacion tuvo clases, pero no hay futuras sesiones programadas.',
    reason: `Han pasado ${Math.round(inactiveDays)} dias sin clase futura ni actividad suficiente.`,
    expectedOutcome: 'Se acuerda una clase puntual o una rutina semanal recurrente.',
    recommendedAction: 'Usar el chat para dejar cerrada la siguiente clase o una franja semanal fija.',
    section: 'chat',
    cooldownHours: Math.max(options.userNotificationCooldownHours, 72),
    familyUid: family,
    teacherUid: teacher,
    studentId: studentId(relationship),
    subject: relationship.subject,
    relationshipTitle: title,
    createAdminTask: inactiveDays >= options.adminEscalationDays || inactiveDays >= options.teacherActivityDropDays,
    recipients: [
      buildRecipient('familia', family, 'Seguimos con la proxima clase', `No hay nuevas clases de ${title} programadas. Si vais a continuar, dejad una hora cerrada en el chat.`, 'Abrir chat', 'chat', 'normal'),
      buildRecipient('profesor', teacher, 'Planifica la proxima clase', `No hay proximas clases de ${title}. Propon una franja si vais a seguir.`, 'Abrir chat', 'chat', 'normal'),
    ].filter(Boolean),
  });
}

function buildFirstClassCheckinAction(relationship, options, nowMs) {
  if (relationship.stage !== 'relacion_activa') return null;
  const ctx = classContext(relationship, nowMs);
  if (ctx.completed !== 1 || !ctx.lastCompleted) return null;
  const age = hoursSince(ctx.lastCompleted, nowMs);
  if (age < options.firstClassCheckinHours) return null;
  const id = relationshipId(relationship);
  const title = relationshipTitle(relationship);
  const family = familyUid(relationship);
  const teacher = teacherUid(relationship);
  return followupAction({
    nowMs,
    relationshipId: id,
    actionId: 'first_class_checkin',
    stage: relationship.stage,
    category: 'quality_check',
    priority: 'low',
    title: `Revisar primera clase de ${title}`,
    description: 'La primera clase ya termino y conviene comprobar si ambas partes saben como continuar.',
    reason: `Han pasado ${Math.round(age)} horas desde la primera clase completada.`,
    expectedOutcome: 'Familia y profesor corrigen cualquier ajuste temprano y dejan clara la siguiente clase.',
    recommendedAction: 'Abrir el chat solo si hay que ajustar horarios, expectativas o material.',
    section: 'chat',
    cooldownHours: 24 * 365,
    familyUid: family,
    teacherUid: teacher,
    studentId: studentId(relationship),
    subject: relationship.subject,
    relationshipTitle: title,
    recipients: [
      buildRecipient('familia', family, 'Como fue la primera clase', `Si hay algo que ajustar en ${title}, deja un mensaje en el chat. Si todo va bien, programa la siguiente clase.`, 'Abrir chat', 'chat', 'low'),
      buildRecipient('profesor', teacher, 'Seguimiento de primera clase', `Si necesitas ajustar algo de ${title}, dejalo cerrado en el chat antes de la siguiente clase.`, 'Abrir chat', 'chat', 'low'),
    ].filter(Boolean),
  });
}

function buildRelationshipQualityAction(relationship, options, nowMs) {
  if (relationship.stage !== 'relacion_activa') return null;
  const ctx = classContext(relationship, nowMs);
  if (ctx.completed < options.qualityCheckCompletedClasses) return null;
  if (ctx.futureCount <= 0 && ctx.scheduledCount <= 0) return null;
  if (!ctx.lastCompleted || hoursSince(ctx.lastCompleted, nowMs) < 24) return null;
  const id = relationshipId(relationship);
  const title = relationshipTitle(relationship);
  const family = familyUid(relationship);
  return followupAction({
    nowMs,
    relationshipId: id,
    actionId: 'relationship_quality_check',
    stage: relationship.stage,
    category: 'quality_check',
    priority: 'low',
    title: `Pedir valoracion ligera de ${title}`,
    description: 'La relacion ya tiene varias clases y sigue activa; es buen momento para recoger una senal de calidad sin interrumpir.',
    reason: `Hay ${ctx.completed} clase(s) completadas y proximas clases programadas.`,
    expectedOutcome: 'La familia deja una senal temprana de satisfaccion o avisa si algo debe corregirse.',
    recommendedAction: 'Pedir una valoracion breve desde el chat y revisar solo si aparece una respuesta negativa.',
    section: 'chat',
    cooldownHours: Math.max(24, options.qualityCheckCooldownDays * 24),
    familyUid: family,
    teacherUid: teacherUid(relationship),
    studentId: studentId(relationship),
    subject: relationship.subject,
    relationshipTitle: title,
    recipients: [
      buildRecipient('familia', family, 'Valora como van las clases', `Si las clases de ${title} van bien, deja una valoracion breve en el chat. Si algo no encaja, lo revisamos.`, 'Abrir chat', 'chat', 'low'),
    ].filter(Boolean),
  });
}

function buildCancellationPatternAction(relationship, options, nowMs) {
  const ctx = classContext(relationship, nowMs);
  if (ctx.cancelled < options.repeatedCancellationThreshold) return null;
  const windowStart = nowMs - options.repeatedCancellationWindowDays * DAY_MS;
  const recentCancelled = ctx.cancelledDates.length
    ? ctx.cancelledDates.filter((date) => date.getTime() >= windowStart).length
    : (ctx.lastCancelled && ctx.lastCancelled.getTime() >= windowStart ? ctx.cancelled : 0);
  if (recentCancelled < options.repeatedCancellationThreshold) return null;
  const id = relationshipId(relationship);
  const title = relationshipTitle(relationship);
  const priority = recentCancelled >= options.repeatedCancellationThreshold + 2 ? 'critical' : 'high';
  return followupAction({
    nowMs,
    relationshipId: id,
    actionId: 'review_repeated_cancellations',
    stage: relationship.stage,
    category: 'risk',
    priority,
    title: `Cancelaciones repetidas en ${title}`,
    description: 'La relacion acumula demasiadas cancelaciones recientes y puede deteriorar la confianza.',
    reason: `${recentCancelled} cancelacion(es) dentro de los ultimos ${options.repeatedCancellationWindowDays} dias.`,
    expectedOutcome: 'El administrador revisa causa, disponibilidad real y si conviene reprogramar o reasignar.',
    recommendedAction: 'Revisar calendario, chat y disponibilidad antes de enviar mas avisos a las partes.',
    section: 'clases',
    cooldownHours: options.adminCooldownHours,
    familyUid: familyUid(relationship),
    teacherUid: teacherUid(relationship),
    studentId: studentId(relationship),
    subject: relationship.subject,
    relationshipTitle: title,
    createAdminTask: true,
    createOpsAlert: priority === 'critical',
    recipients: [],
  });
}

function buildAdminOnlyAction(relationship, options, nowMs) {
  const stage = clean(relationship.stage, 80);
  if (!ADMIN_ACTION_STAGES.has(stage)) return null;
  const id = relationshipId(relationship);
  const title = relationshipTitle(relationship);
  const priority = stage === 'incidencia_abierta' || stage === 'pago_vencido' ? 'critical' : 'high';
  const copy = {
    chat_pendiente: ['Chat pendiente tras asignacion', 'Existe asignacion pero el canal no esta operativo.', 'Reparar o crear el chat desde la asignacion.'],
    pago_vencido: ['Pago vencido en relacion activa', 'El pago vencido puede afectar confianza y continuidad.', 'Resolver pago, justificante o incidencia asociada.'],
    incidencia_abierta: ['Incidencia abierta en relacion activa', 'La relacion no deberia avanzar sin resolver el problema.', 'Gestionar incidencia y dejar trazabilidad.'],
  }[stage] || ['Relacion requiere revision', 'Hay un bloqueo operativo.', 'Abrir Operaciones.'];
  return followupAction({
    nowMs,
    relationshipId: id,
    actionId: `admin_${stage}`,
    stage,
    category: 'admin_attention',
    priority,
    title: `${copy[0]}: ${title}`,
    description: copy[1],
    reason: `La etapa actual es ${stage}.`,
    expectedOutcome: 'Eliminar el bloqueo sin generar ruido a familia/profesor.',
    recommendedAction: copy[2],
    section: stage === 'chat_pendiente' ? 'chat' : stage === 'pago_vencido' ? 'pagos' : 'incidencias',
    cooldownHours: options.adminCooldownHours,
    familyUid: familyUid(relationship),
    teacherUid: teacherUid(relationship),
    studentId: studentId(relationship),
    subject: relationship.subject,
    relationshipTitle: title,
    createAdminTask: true,
    createOpsAlert: priority === 'critical',
    recipients: [],
  });
}

function buildRelationshipActions(relationship, options, nowMs) {
  if (shouldSkipRelationship(relationship)) return [];
  const stage = clean(relationship.stage, 80);
  const actions = [];
  if (stage === 'profesor_asignado' || stage === 'pendiente_horario') actions.push(buildScheduleNeededAction(relationship, options, nowMs));
  if (stage === 'horario_propuesto') actions.push(buildProposalPendingAction(relationship, options, nowMs));
  if (stage === 'clase_programada') actions.push(buildFirstClassPrepAction(relationship, options, nowMs));
  if (stage === 'pendiente_confirmacion') actions.push(buildConfirmationAction(relationship, options, nowMs));
  if (stage === 'relacion_activa') {
    actions.push(buildFirstClassCheckinAction(relationship, options, nowMs));
    actions.push(buildRelationshipQualityAction(relationship, options, nowMs));
    actions.push(buildActiveSilenceAction(relationship, options, nowMs));
  }
  actions.push(buildCancellationPatternAction(relationship, options, nowMs));
  if (ADMIN_ACTION_STAGES.has(stage)) actions.push(buildAdminOnlyAction(relationship, options, nowMs));
  return actions.filter(Boolean).filter((action) => (
    action.createAdminTask || action.createOpsAlert || action.recipients.length > 0
  ));
}

function defaultOptions(options = {}) {
  return {
    nowIso: options.nowIso || new Date().toISOString(),
    scanLimit: Math.max(1, number(options.scanLimit, 1000)),
    scheduleNudgeHours: Math.max(1, number(options.scheduleNudgeHours, 12)),
    proposedScheduleNudgeHours: Math.max(1, number(options.proposedScheduleNudgeHours, 8)),
    firstClassPrepHours: Math.max(1, number(options.firstClassPrepHours, 24)),
    firstClassCheckinHours: Math.max(1, number(options.firstClassCheckinHours, 24)),
    confirmationNudgeHours: Math.max(1, number(options.confirmationNudgeHours, 2)),
    activeSilenceDays: Math.max(1, number(options.activeSilenceDays, 7)),
    qualityCheckCompletedClasses: Math.max(1, number(options.qualityCheckCompletedClasses, 3)),
    qualityCheckCooldownDays: Math.max(1, number(options.qualityCheckCooldownDays, 45)),
    repeatedCancellationWindowDays: Math.max(1, number(options.repeatedCancellationWindowDays, 30)),
    repeatedCancellationThreshold: Math.max(2, number(options.repeatedCancellationThreshold, 3)),
    teacherActivityDropDays: Math.max(1, number(options.teacherActivityDropDays, 21)),
    adminEscalationHours: Math.max(1, number(options.adminEscalationHours, 48)),
    adminEscalationDays: Math.max(1, number(options.adminEscalationDays, 14)),
    userNotificationCooldownHours: Math.max(1, number(options.userNotificationCooldownHours, 24)),
    adminCooldownHours: Math.max(1, number(options.adminCooldownHours, 24)),
    maxUserNotifications: Math.max(0, number(options.maxUserNotifications, 40)),
  };
}

function summarize(actions = []) {
  return {
    total: actions.length,
    critical: actions.filter((item) => item.priority === 'critical').length,
    high: actions.filter((item) => item.priority === 'high').length,
    normal: actions.filter((item) => item.priority === 'normal').length,
    low: actions.filter((item) => item.priority === 'low').length,
    userNotifications: actions.reduce((sum, item) => sum + item.recipients.length, 0),
    adminTasks: actions.filter((item) => item.createAdminTask).length,
    opsAlerts: actions.filter((item) => item.createOpsAlert).length,
    scheduleBlocked: actions.filter((item) => ['schedule_first_class', 'answer_schedule_proposal'].includes(item.actionId)).length,
    continuity: actions.filter((item) => item.category === 'continuity').length,
    qualityChecks: actions.filter((item) => item.category === 'quality_check').length,
    cancellationRisks: actions.filter((item) => item.actionId === 'review_repeated_cancellations').length,
  };
}

export function buildRelationshipFollowupPlan(dataset = {}, options = {}) {
  const config = defaultOptions(options);
  const nowMs = toDate(config.nowIso)?.getTime() || Date.now();
  const previousFollowups = toArray(dataset.previousFollowups || dataset.relationshipFollowups);
  const actions = [];
  for (const relationship of toArray(dataset.relationships).slice(0, config.scanLimit)) {
    for (const action of buildRelationshipActions(relationship, config, nowMs)) {
      pushAction(actions, previousFollowups, action, nowMs);
    }
  }

  const sorted = actions
    .sort((a, b) => (b.priorityScore - a.priorityScore) || a.title.localeCompare(b.title))
    .slice(0, config.scanLimit);

  let notificationBudget = config.maxUserNotifications;
  const budgeted = sorted.map((action) => {
    if (!action.recipients.length || notificationBudget <= 0) return { ...action, recipients: [] };
    const recipients = action.recipients.slice(0, notificationBudget);
    notificationBudget -= recipients.length;
    return { ...action, recipients };
  });

  return {
    version: RELATIONSHIP_FOLLOWUP_VERSION,
    generatedAt: config.nowIso,
    thresholds: {
      scheduleNudgeHours: config.scheduleNudgeHours,
      proposedScheduleNudgeHours: config.proposedScheduleNudgeHours,
      firstClassPrepHours: config.firstClassPrepHours,
      firstClassCheckinHours: config.firstClassCheckinHours,
      confirmationNudgeHours: config.confirmationNudgeHours,
      activeSilenceDays: config.activeSilenceDays,
      qualityCheckCompletedClasses: config.qualityCheckCompletedClasses,
      qualityCheckCooldownDays: config.qualityCheckCooldownDays,
      repeatedCancellationWindowDays: config.repeatedCancellationWindowDays,
      repeatedCancellationThreshold: config.repeatedCancellationThreshold,
      teacherActivityDropDays: config.teacherActivityDropDays,
      adminEscalationHours: config.adminEscalationHours,
      adminEscalationDays: config.adminEscalationDays,
      userNotificationCooldownHours: config.userNotificationCooldownHours,
      adminCooldownHours: config.adminCooldownHours,
      maxUserNotifications: config.maxUserNotifications,
    },
    summary: summarize(budgeted),
    actions: budgeted,
    total: budgeted.length,
  };
}
