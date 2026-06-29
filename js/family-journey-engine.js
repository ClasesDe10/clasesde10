export const FAMILY_JOURNEY_ENGINE_VERSION = 'family-journey-2026-06-29';

const EARLY_RELATIONSHIP_STAGES = new Set(['solicitud_recibida', 'matching_en_proceso']);
const TEACHER_ASSIGNED_STAGES = new Set([
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
const SCHEDULE_READY_STAGES = new Set([
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
const CLASS_READY_STAGES = new Set([
  'clase_programada',
  'clase_en_curso',
  'pendiente_confirmacion',
  'pago_pendiente',
  'pago_vencido',
  'incidencia_abierta',
  'relacion_activa',
  'relacion_finalizada',
]);
const PAYMENT_RISK_STAGES = new Set(['pago_pendiente', 'pago_vencido']);
const CONFIRMATION_STAGES = new Set(['pendiente_confirmacion']);
const WAITING_STAGES = new Set(['solicitud_recibida', 'matching_en_proceso']);
const ACTIVE_STUDENT_STATUSES = new Set(['', 'activo', 'activa', 'active', 'true']);

function clean(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function lower(value, max = 1000) {
  return clean(value, max).toLowerCase();
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function studentIsActive(student = {}) {
  if (student.activo === false || student.active === false) return false;
  const status = lower(student.estado || student.status, 80);
  return ACTIVE_STUDENT_STATUSES.has(status) || !status;
}

function relationshipPriority(relationship = {}) {
  const stage = clean(relationship.stage, 80);
  const priorities = {
    incidencia_abierta: 1,
    pago_vencido: 2,
    pendiente_confirmacion: 3,
    pago_pendiente: 4,
    chat_pendiente: 5,
    pendiente_horario: 6,
    horario_propuesto: 7,
    profesor_asignado: 8,
    matching_en_proceso: 9,
    solicitud_recibida: 10,
    clase_en_curso: 11,
    clase_programada: 12,
    relacion_activa: 13,
    relacion_finalizada: 20,
  };
  return priorities[stage] || 15;
}

function chooseRelationship(relationships = []) {
  return toArray(relationships)
    .slice()
    .sort((a, b) => relationshipPriority(a) - relationshipPriority(b))[0] || null;
}

function hasAssignedTeacher(relationships = []) {
  return toArray(relationships).some((item) => {
    const stage = clean(item.stage, 80);
    return Boolean(item.assignment || item.teacher || item.participants?.teacherUid || TEACHER_ASSIGNED_STAGES.has(stage));
  });
}

function hasOperationalChat(relationships = []) {
  return toArray(relationships).some((item) => Boolean(item.chat || item.modules?.chat));
}

function hasSchedule(relationships = []) {
  return toArray(relationships).some((item) => SCHEDULE_READY_STAGES.has(clean(item.stage, 80)) || number(item.counts?.scheduledClasses) > 0 || number(item.counts?.futureClasses) > 0);
}

function hasClassHistory(relationships = []) {
  return toArray(relationships).some((item) => CLASS_READY_STAGES.has(clean(item.stage, 80)) || number(item.counts?.classes) > 0);
}

function hasCompletedClass(relationships = []) {
  return toArray(relationships).some((item) => number(item.counts?.completedClasses) > 0 || clean(item.stage, 80) === 'relacion_activa');
}

function hasOpenPaymentRisk(relationships = [], payments = []) {
  return toArray(relationships).some((item) => PAYMENT_RISK_STAGES.has(clean(item.stage, 80)))
    || toArray(payments).some((item) => ['pendiente', 'vencido', 'overdue', 'pending', 'solicitado'].includes(lower(item.estado || item.status, 80)));
}

function hasPendingConfirmation(relationships = []) {
  return toArray(relationships).some((item) => CONFIRMATION_STAGES.has(clean(item.stage, 80)) || number(item.flags?.confirmationPendingCount) > 0);
}

function hasOpenRequest(relationships = [], requests = []) {
  return toArray(relationships).length > 0 || toArray(requests).length > 0;
}

function profilePercentFrom(input = {}) {
  const profileEvaluation = input.profileEvaluation || {};
  const raw = profileEvaluation.percent
    ?? profileEvaluation.profileCompletionPercent
    ?? input.family?.profileCompletionPercent
    ?? input.family?.profileCompletion
    ?? input.family?.perfil_completo;
  if (raw === true) return 100;
  if (raw === false) return 0;
  return clamp(number(raw, 0));
}

function buildAction(id, label, detail, section, tone = 'primary') {
  return { id, label, detail, section, tone };
}

function checklistItem(id, label, done, actionId = '') {
  return { id, label, done: Boolean(done), actionId };
}

function stageCopy(stage, context = {}) {
  const relationshipTitle = clean(context.relationship?.title || context.relationship?.subject || '', 120);
  const suffix = relationshipTitle ? ` para ${relationshipTitle}` : '';
  const copy = {
    no_student: {
      title: 'Anade el primer alumno',
      body: 'Necesitamos saber para quien buscas profesor. Con ese dato podremos pedir materia, nivel y horario sin hacerte repetir informacion.',
      primary: buildAction('add_student', 'Anadir hijo/a', 'Son solo los datos necesarios para iniciar la busqueda.', 'alumnos'),
    },
    no_request: {
      title: 'Solicita el profesor que necesitas',
      body: 'Ya hay alumno registrado. Ahora indica materia, nivel y disponibilidad para que el equipo pueda asignar el profesor adecuado.',
      primary: buildAction('request_teacher', 'Solicitar profesor', 'Abre la solicitud con tu hijo/a ya preparado.', 'solicitudes'),
    },
    waiting_assignment: {
      title: 'Solicitud recibida',
      body: 'El equipo esta revisando el matching. Cuando haya profesor asignado, veras el chat, el calendario y los siguientes pasos aqui.',
      primary: buildAction('open_requests', 'Ver solicitud', 'Comprueba el estado sin perder el hilo.', 'solicitudes', 'secondary'),
    },
    chat_needed: {
      title: 'Abre el chat y acuerda el primer horario',
      body: `Ya hay profesor asignado${suffix}. El siguiente paso es concretar la primera clase desde el chat.`,
      primary: buildAction('open_chat', 'Abrir chat', 'Es el punto unico para mensajes, horarios y avisos.', 'chat'),
    },
    schedule_needed: {
      title: 'Falta cerrar la hora de la clase',
      body: `Usa el chat${suffix} para proponer o confirmar el horario. En cuanto se cierre, aparecera en calendario.`,
      primary: buildAction('open_chat', 'Coordinar horario', 'Abre el chat con el profesor.', 'chat'),
    },
    class_scheduled: {
      title: 'La clase ya esta programada',
      body: 'Revisa calendario y, cuando termine la clase, confirma si se ha realizado correctamente. Si ocurre algo, avisa desde la misma pantalla.',
      primary: buildAction('open_calendar', 'Ver calendario', 'Consulta fecha, hora y profesor.', 'calendario'),
    },
    confirm_class: {
      title: 'Confirma la clase terminada',
      body: 'Hay una clase pendiente de confirmacion. Marcarla como realizada ayuda a cerrar el seguimiento sin trabajo manual.',
      primary: buildAction('open_classes', 'Confirmar clase', 'Abre la tabla de clases.', 'clases'),
    },
    payment_due: {
      title: 'Revisa el justificante pendiente',
      body: 'Hay un justificante pendiente o vencido. Sube el comprobante o revisa su estado para que el expediente quede cerrado.',
      primary: buildAction('open_payments', 'Ver justificantes', 'Abre justificantes y estado.', 'pagos'),
    },
    active: {
      title: 'Todo esta encaminado',
      body: 'Tu relacion esta activa. Desde aqui puedes continuar por chat, consultar calendario o actualizar datos cuando cambie algo.',
      primary: buildAction('open_chat', 'Abrir chat', 'Continua con el profesor asignado.', 'chat'),
    },
  };
  return copy[stage] || copy.active;
}

export function buildFamilyJourneyState(input = {}) {
  const students = toArray(input.students || input.hijos || input.alumnos).filter(studentIsActive);
  const relationships = toArray(input.relationships);
  const requests = toArray(input.requests || input.solicitudes);
  const payments = toArray(input.payments || input.pagos);
  const profilePercent = profilePercentFrom(input);
  const primaryRelationship = chooseRelationship(relationships);
  const currentStage = clean(primaryRelationship?.stage, 80);

  const hasStudents = students.length > 0;
  const requested = hasOpenRequest(relationships, requests);
  const assigned = hasAssignedTeacher(relationships);
  const chatReady = hasOperationalChat(relationships);
  const scheduleReady = hasSchedule(relationships);
  const classReady = hasClassHistory(relationships);
  const completedClass = hasCompletedClass(relationships);
  const paymentRisk = hasOpenPaymentRisk(relationships, payments);
  const confirmationPending = hasPendingConfirmation(relationships);
  const profileReady = profilePercent >= 70;

  let stage = 'active';
  if (!hasStudents) stage = 'no_student';
  else if (!requested) stage = 'no_request';
  else if (WAITING_STAGES.has(currentStage) || (!assigned && requested)) stage = 'waiting_assignment';
  else if (!chatReady || currentStage === 'chat_pendiente' || currentStage === 'profesor_asignado') stage = 'chat_needed';
  else if (currentStage === 'pendiente_horario' || currentStage === 'horario_propuesto' || !scheduleReady) stage = 'schedule_needed';
  else if (confirmationPending) stage = 'confirm_class';
  else if (paymentRisk) stage = 'payment_due';
  else if (classReady && !completedClass) stage = 'class_scheduled';

  const copy = stageCopy(stage, { relationship: primaryRelationship });
  const secondaryActions = [];
  if (stage !== 'no_student') secondaryActions.push(buildAction('add_student', 'Gestionar hijos', 'Anade o edita alumnos.', 'alumnos', 'secondary'));
  if (!profileReady) secondaryActions.push(buildAction('complete_profile', 'Completar perfil', 'Mejora la asignacion y la comunicacion.', 'perfil', 'secondary'));
  if (assigned && stage !== 'chat_needed') secondaryActions.push(buildAction('open_chat', 'Chat', 'Mensajes y notificaciones.', 'chat', 'secondary'));
  if (scheduleReady && stage !== 'class_scheduled') secondaryActions.push(buildAction('open_calendar', 'Calendario', 'Proximas clases.', 'calendario', 'secondary'));
  if (paymentRisk && stage !== 'payment_due') secondaryActions.push(buildAction('open_payments', 'Justificantes', 'Justificantes y estado.', 'pagos', 'secondary'));

  const checklist = [
    checklistItem('account', 'Cuenta creada', true),
    checklistItem('profile', 'Datos basicos completos', profileReady, 'complete_profile'),
    checklistItem('student', 'Alumno registrado', hasStudents, 'add_student'),
    checklistItem('request', 'Solicitud enviada', requested, 'request_teacher'),
    checklistItem('assignment', 'Profesor asignado', assigned, 'open_requests'),
    checklistItem('chat', 'Chat abierto', chatReady, 'open_chat'),
    checklistItem('schedule', 'Primera clase programada', scheduleReady || classReady, 'open_calendar'),
    checklistItem('closure', 'Clase confirmada y seguimiento al dia', completedClass && !paymentRisk && !confirmationPending, paymentRisk ? 'open_payments' : 'open_classes'),
  ];
  const completed = checklist.filter((item) => item.done).length;
  const progress = Math.round((completed / checklist.length) * 100);

  return {
    version: FAMILY_JOURNEY_ENGINE_VERSION,
    stage,
    title: copy.title,
    body: copy.body,
    primaryAction: copy.primary,
    secondaryActions: secondaryActions.slice(0, 3),
    checklist,
    progress,
    context: {
      students: students.length,
      requests: requests.length,
      relationships: relationships.length,
      profilePercent,
      currentRelationshipStage: currentStage || '',
      relationshipTitle: clean(primaryRelationship?.title || primaryRelationship?.subject || '', 120),
    },
    reassurance: stage === 'waiting_assignment'
      ? 'No tienes que repetir la solicitud. Te avisaremos cuando haya profesor.'
      : 'Este panel se actualiza automaticamente segun avances.',
  };
}

export default {
  FAMILY_JOURNEY_ENGINE_VERSION,
  buildFamilyJourneyState,
};
