export const TEACHER_JOURNEY_ENGINE_VERSION = 'teacher-journey-2026-06-29';

const ACTIVE_VERIFICATION = new Set(['verificado', 'verified', 'aprobado', 'approved', 'activo', 'active']);
const PENDING_VERIFICATION = new Set(['pendiente', 'pending', 'revision', 'en_revision', 'pendiente_revision']);
const PROFILE_BLOCKED = new Set(['pendiente_perfil', 'profile_pending', 'incompleto', 'incomplete']);
const SCHEDULE_STAGES = new Set(['profesor_asignado', 'chat_pendiente', 'pendiente_horario', 'horario_propuesto']);
const CLASS_READY_STAGES = new Set(['clase_programada', 'clase_en_curso', 'relacion_activa']);
const CONFIRMATION_STAGES = new Set(['pendiente_confirmacion']);
const PAYMENT_STAGES = new Set(['pago_pendiente', 'pago_vencido']);
const INCIDENT_STAGES = new Set(['incidencia_abierta']);

function clean(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function lower(value, max = 1000) {
  return clean(value, max).toLowerCase();
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && clean(value) !== '');
}

function profilePercentFrom(input = {}) {
  const profileEvaluation = input.profileEvaluation || {};
  const profile = input.teacher || input.profile || {};
  const raw = first(
    profileEvaluation.percent,
    profileEvaluation.profileCompletionPercent,
    profile.profileCompletionPercent,
    profile.profileCompletion,
    profile.perfil_completo === true ? 100 : null,
    profile.profileComplete === true ? 100 : null,
  );
  return clamp(number(raw, 0));
}

function verificationStatusOf(input = {}) {
  const profile = input.teacher || input.profile || {};
  return lower(first(
    profile.verificationStatus,
    profile.estado_verificacion,
    profile.status,
    profile.estado,
  ), 100);
}

function hasUsefulDocument(doc = {}) {
  const status = lower(first(doc.status, doc.estado, doc.verificationStatus, doc.estado_verificacion), 80);
  return !['rechazado', 'rejected', 'cancelado', 'cancelled'].includes(status);
}

function hasVerifiedDocument(doc = {}) {
  const status = lower(first(doc.status, doc.estado, doc.verificationStatus, doc.estado_verificacion), 80);
  return ['verificado', 'validado', 'approved', 'verified'].includes(status);
}

function hasAvailability(input = {}) {
  const profile = input.teacher || input.profile || {};
  return toArray(input.availabilitySlots || input.disponibilidad).length > 0
    || clean(first(profile.disponibilidad_resumen, profile.availabilitySummary), 40).length >= 8;
}

function relationshipPriority(relationship = {}) {
  const stage = clean(relationship.stage, 80);
  const priorities = {
    incidencia_abierta: 1,
    pago_vencido: 2,
    pendiente_confirmacion: 3,
    pago_pendiente: 4,
    horario_propuesto: 5,
    pendiente_horario: 6,
    chat_pendiente: 7,
    profesor_asignado: 8,
    clase_en_curso: 9,
    clase_programada: 10,
    relacion_activa: 12,
    relacion_finalizada: 20,
  };
  return priorities[stage] || 14;
}

function chooseRelationship(relationships = []) {
  return toArray(relationships)
    .slice()
    .sort((a, b) => relationshipPriority(a) - relationshipPriority(b))[0] || null;
}

function hasStage(relationships, stages) {
  return toArray(relationships).some((item) => stages.has(clean(item.stage, 80)));
}

function hasAssignedStudent(relationships = []) {
  return toArray(relationships).some((item) => (
    item.assignment
    || item.student
    || item.participants?.studentId
    || item.counts?.classes
    || item.stage === 'relacion_activa'
  ));
}

function hasSchedule(relationships = []) {
  return toArray(relationships).some((item) => (
    CLASS_READY_STAGES.has(clean(item.stage, 80))
    || number(item.counts?.scheduledClasses) > 0
    || number(item.counts?.futureClasses) > 0
  ));
}

function hasClassHistory(relationships = []) {
  return toArray(relationships).some((item) => number(item.counts?.completedClasses) > 0 || number(item.counts?.classes) > 0);
}

function buildAction(id, label, detail, section, tone = 'primary') {
  return { id, label, detail, section, tone };
}

function checklistItem(id, label, done, actionId = '') {
  return { id, label, done: Boolean(done), actionId };
}

function stageCopy(stage, context = {}) {
  const subject = clean(context.relationship?.subject || context.relationship?.title || '', 120);
  const suffix = subject ? ` para ${subject}` : '';
  const copy = {
    profile_needed: {
      title: 'Completa tu perfil profesional',
      body: 'Antes de recibir buenos alumnos necesitamos una ficha completa: foto, estudios, zona, materias, niveles, disponibilidad y Bizum.',
      primary: buildAction('complete_profile', 'Completar perfil', 'Abre tu perfil y termina los campos obligatorios.', 'perfil'),
    },
    documents_needed: {
      title: 'Sube la documentacion necesaria',
      body: 'La confianza empieza antes de la primera clase. Sube tu DNI y tus notas principales para que el equipo pueda validar tu perfil sin pedirte datos innecesarios.',
      primary: buildAction('upload_documents', 'Subir documentos', 'DNI, notas del curso anterior, expediente o curriculum opcional.', 'documentos'),
    },
    verification_pending: {
      title: 'Perfil listo para revision',
      body: 'Tu parte principal esta hecha. Mientras el equipo valida tu perfil, puedes ajustar disponibilidad y preparar tus materias.',
      primary: buildAction('set_availability', 'Revisar disponibilidad', 'Cuanto mas clara sea, mas rapido podremos asignarte.', 'disponibilidad'),
    },
    availability_needed: {
      title: 'Define tu disponibilidad real',
      body: 'Para asignarte alumnos sin idas y vueltas necesitamos franjas claras. Esto reduce trabajo manual y mejora el matching.',
      primary: buildAction('set_availability', 'Anadir disponibilidad', 'Indica dias y horas en los que puedes dar clase.', 'disponibilidad'),
    },
    waiting_students: {
      title: 'Listo para recibir alumnos',
      body: 'No tienes alumnos activos ahora mismo. Mantener perfil, documentos y disponibilidad al dia ayuda a que el equipo te asigne antes.',
      primary: buildAction('open_profile', 'Revisar mi perfil', 'Comprueba que tus materias y zona siguen actualizadas.', 'perfil', 'secondary'),
    },
    schedule_needed: {
      title: 'Cierra el horario de la primera clase',
      body: `Ya hay una relacion activa${suffix}. Entra al chat, proponed fecha y al aceptarla se creara la clase automaticamente.`,
      primary: buildAction('open_chat', 'Abrir chat', 'Coordina el horario desde el chat.', 'chat'),
    },
    class_scheduled: {
      title: 'Prepara tu proxima clase',
      body: `Tienes clase programada${suffix}. Revisa el calendario y ten claro que, al terminar, debes confirmar asistencia.`,
      primary: buildAction('open_calendar', 'Ver calendario', 'Consulta proximas clases y horarios.', 'calendario'),
    },
    confirm_class: {
      title: 'Confirma la clase terminada',
      body: 'Hay una clase que ya ha pasado. Confirma si se realizo o reporta incidencia para que pagos, reputacion y seguimiento se actualicen.',
      primary: buildAction('confirm_class', 'Confirmar asistencia', 'Abre tus clases pendientes.', 'clases'),
    },
    income_pending: {
      title: 'Revisa tus cobros',
      body: 'Hay pagos o liquidaciones pendientes. Si la clase esta realizada y tiene importe, solicita Bizum desde ingresos.',
      primary: buildAction('open_income', 'Ver ingresos', 'Comprueba cobros y solicitudes Bizum.', 'ingresos'),
    },
    incident_open: {
      title: 'Hay una incidencia abierta',
      body: 'Prioriza resolver la incidencia antes de avanzar con nuevas clases. El chat mantiene el contexto de la relacion.',
      primary: buildAction('open_chat', 'Abrir chat', 'Revisa mensajes y notificaciones.', 'chat'),
    },
    active: {
      title: 'Tu trabajo esta encaminado',
      body: 'Tus relaciones activas no tienen bloqueos urgentes. Sigue usando chat, calendario e ingresos como centro de trabajo diario.',
      primary: buildAction('open_chat', 'Abrir chat', 'Continua con tus familias asignadas.', 'chat'),
    },
  };
  return copy[stage] || copy.active;
}

export function buildTeacherJourneyState(input = {}) {
  const relationships = toArray(input.relationships);
  const documents = toArray(input.documents || input.documentos);
  const profilePercent = profilePercentFrom(input);
  const verificationStatus = verificationStatusOf(input);
  const profileBlocked = PROFILE_BLOCKED.has(verificationStatus);
  const profileReady = profilePercent >= 85 && !profileBlocked;
  const documentReady = documents.some(hasUsefulDocument) || documents.some(hasVerifiedDocument);
  const verified = ACTIVE_VERIFICATION.has(verificationStatus);
  const verificationPending = PENDING_VERIFICATION.has(verificationStatus) || (profileReady && !verified);
  const availabilityReady = hasAvailability(input);
  const primaryRelationship = chooseRelationship(relationships);

  let stage = 'active';
  if (hasStage(relationships, INCIDENT_STAGES)) stage = 'incident_open';
  else if (hasStage(relationships, CONFIRMATION_STAGES)) stage = 'confirm_class';
  else if (hasStage(relationships, PAYMENT_STAGES)) stage = 'income_pending';
  else if (hasStage(relationships, SCHEDULE_STAGES)) stage = 'schedule_needed';
  else if (hasStage(relationships, CLASS_READY_STAGES) || hasSchedule(relationships)) stage = 'class_scheduled';
  else if (!profileReady) stage = 'profile_needed';
  else if (!documentReady) stage = 'documents_needed';
  else if (verificationPending && !verified) stage = 'verification_pending';
  else if (!availabilityReady) stage = 'availability_needed';
  else if (!hasAssignedStudent(relationships)) stage = 'waiting_students';

  const copy = stageCopy(stage, { relationship: primaryRelationship });
  const secondaryActions = [];
  if (stage !== 'profile_needed' && !profileReady) secondaryActions.push(buildAction('complete_profile', 'Completar perfil', 'Mejora asignaciones futuras.', 'perfil', 'secondary'));
  if (stage !== 'documents_needed' && !documentReady) secondaryActions.push(buildAction('upload_documents', 'Documentos', 'Sube validaciones.', 'documentos', 'secondary'));
  if (stage !== 'availability_needed' && !availabilityReady) secondaryActions.push(buildAction('set_availability', 'Disponibilidad', 'Actualiza franjas reales.', 'disponibilidad', 'secondary'));
  if (relationships.length && stage !== 'schedule_needed' && stage !== 'incident_open') secondaryActions.push(buildAction('open_chat', 'Chat', 'Mensajes y horarios.', 'chat', 'secondary'));
  if (hasSchedule(relationships) && stage !== 'class_scheduled') secondaryActions.push(buildAction('open_calendar', 'Calendario', 'Proximas clases.', 'calendario', 'secondary'));
  if (hasStage(relationships, PAYMENT_STAGES) && stage !== 'income_pending') secondaryActions.push(buildAction('open_income', 'Ingresos', 'Cobros y Bizum.', 'ingresos', 'secondary'));

  const checklist = [
    checklistItem('account', 'Cuenta creada', true),
    checklistItem('profile', 'Perfil profesional completo', profileReady, 'complete_profile'),
    checklistItem('documents', 'Documentacion subida', documentReady, 'upload_documents'),
    checklistItem('verification', 'Validacion administrativa', verified, documentReady ? 'upload_documents' : 'upload_documents'),
    checklistItem('availability', 'Disponibilidad real definida', availabilityReady, 'set_availability'),
    checklistItem('students', 'Alumno asignado', hasAssignedStudent(relationships), 'open_chat'),
    checklistItem('schedule', 'Primera clase programada', hasSchedule(relationships), 'open_calendar'),
    checklistItem('closure', 'Clases confirmadas y cobros controlados', hasClassHistory(relationships) && !hasStage(relationships, CONFIRMATION_STAGES) && !hasStage(relationships, PAYMENT_STAGES), 'confirm_class'),
  ];
  const completed = checklist.filter((item) => item.done).length;
  const progress = Math.round((completed / checklist.length) * 100);

  return {
    version: TEACHER_JOURNEY_ENGINE_VERSION,
    stage,
    title: copy.title,
    body: copy.body,
    primaryAction: copy.primary,
    secondaryActions: secondaryActions.slice(0, 3),
    checklist,
    progress,
    context: {
      relationships: relationships.length,
      profilePercent,
      verificationStatus,
      documents: documents.length,
      availabilityReady,
      currentRelationshipStage: clean(primaryRelationship?.stage, 80),
      relationshipTitle: clean(primaryRelationship?.title || primaryRelationship?.subject || '', 120),
    },
    reassurance: verified
      ? 'Este panel prioriza lo que evita bloqueos: horarios, confirmaciones, incidencias y cobros.'
      : 'Te guiaremos hasta estar listo para recibir alumnos sin trabajo manual extra.',
  };
}

export default {
  TEACHER_JOURNEY_ENGINE_VERSION,
  buildTeacherJourneyState,
};
