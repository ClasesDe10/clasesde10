export const INTERNAL_AI_ASSISTANT_VERSION = 'internal-ai-assistant-2026-06-30';

const CLOSED_STATUSES = new Set(['closed', 'cerrada', 'cerrado', 'resolved', 'resuelta', 'done', 'archived', 'archivada', 'cancelada', 'cancelled', 'rechazada', 'rejected', 'suppressed']);
const ACTIVE_STATUSES = new Set(['', 'active', 'activa', 'activo', 'open', 'abierta', 'pending', 'pendiente', 'sent', 'enviada', 'review', 'revision', 'en_revision', 'en_proceso', 'verified', 'verificado', 'approved', 'aprobado']);
const PAID_STATUSES = new Set(['paid', 'pagado', 'validado', 'validated', 'succeeded', 'captured', 'completado']);
const COMPLETED_CLASS_STATUSES = new Set(['realizada', 'completed', 'completada', 'done', 'pagada', 'paid', 'pago_recibido', 'finalizada']);
const SCHEDULED_CLASS_STATUSES = new Set(['programada', 'scheduled', 'confirmada', 'confirmed', 'pendiente', 'pending']);
const DAY_MS = 86400000;

const CONFLICT_TERMS = Object.freeze([
  'conflicto',
  'enfado',
  'enfadado',
  'queja',
  'reclamacion',
  'problema',
  'mal',
  'fatal',
  'impago',
  'no pago',
  'no paga',
  'retraso',
  'cancelar',
  'cancelado',
  'no responde',
  'no contesta',
  'urgente',
  'no vino',
  'no ha venido',
  'falta',
  'error',
]);

const SCHEDULING_TERMS = Object.freeze([
  'hora',
  'horario',
  'disponibilidad',
  'franja',
  'manana',
  'tarde',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
  'quedamos',
  'clase',
]);

const TEACHER_REQUIRED_GROUPS = Object.freeze([
  { label: 'foto', keys: ['photoURL', 'photoUrl', 'foto', 'avatarUrl', 'profilePhotoUrl'] },
  { label: 'telefono', keys: ['telefono', 'phone', 'mobile', 'whatsapp'] },
  { label: 'direccion y ciudad', keys: ['direccion', 'address', 'calle', 'street', 'ciudad', 'city'] },
  { label: 'colegio', keys: ['colegio', 'school', 'highSchool', 'colegioBachillerato'] },
  { label: 'universidad y estudios', keys: ['universidad', 'university', 'grado', 'degree', 'estudios', 'studies', 'formacion'] },
  { label: 'materias o actividades', keys: ['materias', 'subjects', 'activities', 'actividades'] },
  { label: 'niveles', keys: ['niveles', 'levels', 'educationalLevels'] },
  { label: 'disponibilidad', keys: ['disponibilidad', 'availability', 'availabilitySlots', 'franjasDisponibles', 'weeklyAvailability'] },
  { label: 'Bizum', keys: ['hasBizum', 'bizumEnabled', 'bizumPhone', 'bizum'] },
]);

const FAMILY_REQUIRED_GROUPS = Object.freeze([
  { label: 'telefono', keys: ['telefono', 'phone', 'mobile', 'whatsapp'] },
  { label: 'direccion o zona', keys: ['direccion', 'address', 'calle', 'street', 'zona', 'city', 'ciudad'] },
  { label: 'dia habitual de pago', keys: ['weeklyPaymentDay', 'paymentDay', 'diaPagoSemanal', 'pagoSemanalDia'] },
]);

function clean(value, max = 800) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function normalize(value, max = 800) {
  return clean(value, max)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && clean(value) !== '');
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null);
  if (!value) return [];
  return clean(value)
    .split(/[,;/+|]|\sy\s/i)
    .map((item) => clean(item))
    .filter(Boolean);
}

function asNumber(value, fallback = 0) {
  if (clean(value) === '') return fallback;
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, asNumber(value, min)));
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.toMillis === 'function') return new Date(value.toMillis());
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value === 'number') return new Date(value);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hoursSince(value, nowMs) {
  const date = toDate(value);
  if (!date) return Infinity;
  return Math.max(0, (nowMs - date.getTime()) / 36e5);
}

function daysSince(value, nowMs) {
  const hours = hoursSince(value, nowMs);
  return Number.isFinite(hours) ? hours / 24 : Infinity;
}

function statusOf(item = {}) {
  return normalize(first(item.status, item.estado, item.lifecycleStatus, item.verificationStatus, item.estado_verificacion, item.reconciliationStatus), 120);
}

function isClosed(item = {}) {
  return CLOSED_STATUSES.has(statusOf(item));
}

function isActive(item = {}) {
  const status = statusOf(item);
  return ACTIVE_STATUSES.has(status) && !isClosed(item);
}

function priorityScore(priority) {
  return {
    critical: 96,
    high: 84,
    normal: 58,
    low: 34,
  }[priority] || 58;
}

function safeId(value) {
  return normalize(value, 260)
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 180) || 'unknown';
}

function idOf(item = {}, keys = []) {
  return clean(first(...keys.map((key) => item[key]), item.id, item.uid, item.userUid, item.email), 220);
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

function textFrom(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(textFrom).join(' ');
  if (typeof value === 'object') {
    try {
      return Object.values(value).map(textFrom).join(' ');
    } catch (_) {
      return '';
    }
  }
  return clean(value, 1200);
}

function hasValue(item = {}, keys = []) {
  return keys.some((key) => {
    const value = key.split('.').reduce((current, part) => current?.[part], item);
    if (Array.isArray(value)) return value.filter(Boolean).length > 0;
    if (typeof value === 'boolean') return value === true;
    return clean(value) !== '';
  });
}

function profilePercent(item = {}, groups = []) {
  const explicit = first(
    item.profileCompletionPercent,
    item.completionPercent,
    item.porcentajePerfil,
    item.reputationMetrics?.profileCompletionPercent,
    item.trustProfile?.metrics?.profileCompletionPercent,
    item.trust?.metrics?.profileCompletionPercent,
  );
  if (explicit !== undefined && explicit !== null && clean(explicit) !== '') return clamp(explicit, 0, 100);
  if (!groups.length) return 0;
  const completed = groups.filter((group) => hasValue(item, group.keys)).length;
  return Math.round((completed / groups.length) * 100);
}

function missingLabels(item = {}, groups = []) {
  return groups.filter((group) => !hasValue(item, group.keys)).map((group) => group.label);
}

function teacherId(item = {}) {
  return idOf(item, ['teacherUid', 'profesor_id', 'teacherUserUid', 'profesorUid', 'userUid']);
}

function familyId(item = {}) {
  return idOf(item, ['familyUid', 'familia_id', 'parentUid', 'familyUserUid', 'userUid']);
}

function studentId(item = {}) {
  return idOf(item, ['studentId', 'studentUid', 'alumno_id']);
}

function chatId(item = {}) {
  return idOf(item, ['chatId', 'threadId', 'conversationId', 'parentChatId']);
}

function classId(item = {}) {
  return idOf(item, ['classId', 'claseId', 'clase_id']);
}

function classStart(item = {}) {
  const explicit = first(item.startAtIso, item.startAt, item.dateStart, item.fecha_inicio);
  if (explicit) return explicit;
  const day = clean(first(item.fecha, item.date), 20);
  const time = clean(first(item.hora_inicio, item.startTime, item.time), 12);
  if (day && time && /^\d{4}-\d{2}-\d{2}$/.test(day)) return `${day}T${time.length === 5 ? `${time}:00` : time}`;
  return day || first(item.createdAt, item.created_at);
}

function isCompletedClass(item = {}) {
  const status = statusOf(item);
  return COMPLETED_CLASS_STATUSES.has(status) || Boolean(first(item.completedAt, item.completed_at, item.confirmedAt, item.confirmadaAt));
}

function isScheduledClass(item = {}) {
  return SCHEDULED_CLASS_STATUSES.has(statusOf(item));
}

function paymentStatus(item = {}) {
  return normalize(first(item.familyPaymentStatus, item.paymentStatus, item.estado_pago_familia, item.estado, item.status, item.reconciliationStatus), 120);
}

function isPaid(item = {}) {
  return PAID_STATUSES.has(paymentStatus(item)) || item.paid === true || item.verified === true;
}

function amountOf(item = {}, keys = ['familyAmount', 'totalFamilia', 'precioFamilia', 'precio_total', 'amount', 'monto']) {
  return asNumber(first(...keys.map((key) => item[key])), 0);
}

function groupBy(items = [], keyFn = () => '') {
  const map = new Map();
  for (const item of items || []) {
    const key = clean(keyFn(item), 220);
    if (!key) continue;
    const current = map.get(key) || [];
    current.push(item);
    map.set(key, current);
  }
  return map;
}

function latestDate(values = []) {
  return values.map(toDate).filter(Boolean).sort((a, b) => b.getTime() - a.getTime())[0] || null;
}

function messageText(message = {}) {
  return clean(first(message.text, message.body, message.message, message.mensaje, message.contenido, message.content, message.description), 1200);
}

function messageDate(message = {}) {
  return first(message.createdAt, message.created_at, message.sentAt, message.timestamp, message.fecha);
}

function collectChatMessages(chat = {}, messagesByChat = new Map()) {
  const embedded = [
    ...asArray(chat.messages),
    ...asArray(chat.mensajes),
    ...asArray(chat.history),
  ].filter((item) => item && typeof item === 'object');
  const nested = messagesByChat.get(idOf(chat, ['id', 'chatId'])) || [];
  return [...embedded, ...nested]
    .map((message) => ({
      ...message,
      text: messageText(message),
      date: toDate(messageDate(message)),
    }))
    .filter((message) => message.text)
    .sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
}

function countTerms(text, terms) {
  const normalized = normalize(text, 6000);
  return terms.reduce((sum, term) => sum + (normalized.includes(normalize(term)) ? 1 : 0), 0);
}

function summarizeSnippets(messages = []) {
  return messages.slice(-3).map((message) => clean(message.text, 140)).filter(Boolean);
}

function documentChecklist(document = {}) {
  const type = normalize(first(document.type, document.tipo, document.documentType, document.category), 120);
  if (/dni|pasaporte|identidad/.test(type)) {
    return [
      'Comprobar que nombre y apellidos coinciden con el perfil.',
      'Comprobar que el documento es legible y no esta caducado.',
      'Validar que la foto o escaneo no parece manipulado.',
    ];
  }
  if (/nota|calificacion|bachiller|universidad|expediente/.test(type)) {
    return [
      'Comprobar curso, centro, fecha y nota media visible.',
      'Contrastar que el nivel declarado en el perfil coincide.',
      'Marcar observacion si el archivo no identifica claramente al profesor.',
    ];
  }
  if (/cv|curriculum|experiencia/.test(type)) {
    return [
      'Revisar experiencia docente, estudios y fechas.',
      'Extraer especialidades utiles para matching.',
      'Comprobar coherencia con materias y niveles del perfil.',
    ];
  }
  if (/idioma|ingles|frances|aleman|certificado/.test(type)) {
    return [
      'Comprobar idioma, nivel, entidad emisora y fecha.',
      'Registrar certificacion verificable en el perfil.',
      'Usar solo como insignia si el documento es claro.',
    ];
  }
  return [
    'Comprobar legibilidad, titular y relacion con el perfil.',
    'Clasificar el documento si el tipo no es suficientemente preciso.',
    'Aprobar, pedir correccion o escalar al administrador.',
  ];
}

function makeInsight(raw = {}) {
  const dedupeKey = clean(raw.dedupeKey || `${raw.category}:${raw.entityType}:${raw.entityId}:${raw.title}`, 260);
  const priority = clean(raw.priority || 'normal', 40);
  return {
    id: `internal_ai_${safeId(dedupeKey)}`,
    dedupeKey,
    insightId: clean(raw.insightId || raw.category || 'internal_ai_assist', 120),
    category: clean(raw.category || 'operations', 80),
    priority,
    priorityScore: asNumber(raw.priorityScore, priorityScore(priority)),
    title: clean(raw.title, 180),
    summary: clean(raw.summary, 900),
    recommendedAction: clean(raw.recommendedAction, 300),
    confidence: clean(raw.confidence || 'media', 40),
    confidenceScore: clamp(raw.confidenceScore ?? (raw.confidence === 'alta' ? 90 : raw.confidence === 'baja' ? 45 : 70), 0, 100),
    requiresHumanReview: raw.requiresHumanReview !== false,
    entityType: clean(raw.entityType, 80),
    entityId: clean(raw.entityId, 180),
    entityName: clean(raw.entityName, 180),
    section: clean(raw.section || 'operaciones', 80),
    familyUid: clean(raw.familyUid, 180),
    teacherUid: clean(raw.teacherUid, 180),
    studentId: clean(raw.studentId, 180),
    evidence: asArray(raw.evidence).map((item) => clean(item, 220)).slice(0, 8),
    suggestedActions: asArray(raw.suggestedActions).map((item) => clean(item, 220)).slice(0, 6),
    assistantMode: 'deterministic_structured',
    externalModelRequired: false,
    source: 'internal_ai_assistant_engine',
    version: INTERNAL_AI_ASSISTANT_VERSION,
    generatedAt: clean(raw.generatedAt || new Date().toISOString(), 80),
  };
}

function addInsight(insights, raw) {
  const insight = makeInsight(raw);
  if (!insight.title || !insight.summary) return;
  if (insights.some((item) => item.id === insight.id)) return;
  insights.push(insight);
}

function buildChatInsights(data, options, insights) {
  const nowMs = options.nowMs;
  const messagesByChat = groupBy(data.messages, (message) => first(message.chatId, message.threadId, message.parentChatId));
  for (const chat of data.chats) {
    if (isClosed(chat)) continue;
    const id = idOf(chat, ['id', 'chatId']);
    if (!id) continue;
    const messages = collectChatMessages(chat, messagesByChat);
    const text = messages.map((message) => message.text).join(' ');
    const conflictScore = countTerms(text, CONFLICT_TERMS);
    const scheduleScore = countTerms(text, SCHEDULING_TERMS);
    const lastAt = latestDate([first(chat.updatedAt, chat.updated_at, chat.lastMessageAt, chat.createdAt), ...messages.map((message) => message.date)]);
    const staleHours = hoursSince(lastAt, nowMs);
    const longChat = messages.length >= options.longConversationMessageThreshold;
    const unresolvedSchedule = scheduleScore >= 3 && staleHours >= options.staleChatHours;
    const conflictRisk = conflictScore >= options.conflictKeywordThreshold;
    if (!longChat && !unresolvedSchedule && !conflictRisk) continue;

    const snippets = summarizeSnippets(messages);
    addInsight(insights, {
      dedupeKey: conflictRisk ? `chat_conflict_risk:${id}` : `chat_summary_needed:${id}`,
      insightId: conflictRisk ? 'chat_conflict_risk' : 'chat_summary_needed',
      category: 'chat',
      priority: conflictRisk ? 'high' : unresolvedSchedule ? 'high' : 'normal',
      priorityScore: conflictRisk ? 88 : unresolvedSchedule ? 82 : 64,
      title: conflictRisk ? 'Posible conflicto detectado en un chat' : 'Chat largo que conviene resumir',
      summary: `${displayName(chat, 'Chat')} acumula ${messages.length} mensaje(s). ${conflictRisk ? `Hay ${conflictScore} senal(es) de conflicto o friccion. ` : ''}${unresolvedSchedule ? 'Parece haber dudas de horario sin cierre claro. ' : ''}${snippets.length ? `Ultimos puntos: ${snippets.join(' / ')}` : ''}`,
      recommendedAction: conflictRisk ? 'Abrir el chat, revisar los ultimos mensajes y decidir si crear incidencia o intervenir con una respuesta clara.' : 'Generar resumen interno antes de intervenir y dejar el siguiente paso visible para familia y profesor.',
      confidence: conflictRisk ? 'media' : 'alta',
      confidenceScore: conflictRisk ? 74 : 86,
      requiresHumanReview: true,
      entityType: 'chat',
      entityId: id,
      entityName: displayName(chat, 'Chat'),
      section: 'chat',
      familyUid: familyId(chat),
      teacherUid: teacherId(chat),
      studentId: studentId(chat),
      evidence: [
        `${messages.length} mensajes analizados`,
        `Ultima actividad hace ${Number.isFinite(staleHours) ? Math.round(staleHours) : '?'} h`,
        conflictRisk ? `${conflictScore} terminos de friccion` : '',
        unresolvedSchedule ? `${scheduleScore} menciones de horario` : '',
      ].filter(Boolean),
      suggestedActions: conflictRisk ? ['Revisar tono y contexto', 'Crear incidencia si hay riesgo real', 'Responder con siguiente paso concreto'] : ['Resumir conversacion', 'Fijar siguiente accion', 'Cerrar dudas de horario'],
    });
  }
}

function buildIncidentInsights(data, options, insights) {
  for (const incident of data.incidents) {
    if (isClosed(incident)) continue;
    const id = idOf(incident, ['id', 'incidentId', 'incidenciaId']);
    if (!id) continue;
    const history = [
      ...asArray(incident.messages),
      ...asArray(incident.conversation),
      ...asArray(incident.historial),
      ...asArray(incident.history),
      ...asArray(incident.comments),
    ].filter(Boolean);
    const age = hoursSince(first(incident.updatedAt, incident.updated_at, incident.createdAt, incident.created_at), options.nowMs);
    const priority = normalize(first(incident.priority, incident.prioridad, incident.severity), 80);
    const needsSummary = history.length >= options.incidentSummaryMinEntries || age >= options.staleIncidentHours || ['critical', 'urgente', 'alta', 'high'].includes(priority);
    if (!needsSummary) continue;
    addInsight(insights, {
      dedupeKey: `incident_summary:${id}`,
      insightId: 'incident_summary',
      category: 'incidents',
      priority: ['critical', 'urgente'].includes(priority) ? 'critical' : ['alta', 'high'].includes(priority) ? 'high' : 'normal',
      title: 'Resumen operativo de incidencia',
      summary: `${clean(first(incident.title, incident.titulo, incident.category, incident.tipo, 'Incidencia abierta'), 160)}. Estado: ${statusOf(incident) || 'abierta'}. ${history.length ? `Hay ${history.length} entrada(s) de historial/conversacion.` : ''} ${Number.isFinite(age) ? `Sin cierre actualizado desde hace ${Math.round(age)} h.` : ''}`,
      recommendedAction: first(incident.alertRecommendedAction, incident.recommendedAction, 'Revisar causa, responsable, siguiente accion y plazo de resolucion.'),
      confidence: 'alta',
      confidenceScore: 88,
      requiresHumanReview: true,
      entityType: 'incidencia',
      entityId: id,
      entityName: clean(first(incident.title, incident.titulo, incident.category, incident.tipo, 'Incidencia'), 160),
      section: 'incidencias',
      familyUid: familyId(incident),
      teacherUid: teacherId(incident),
      studentId: studentId(incident),
      evidence: [
        `Estado ${statusOf(incident) || 'abierta'}`,
        history.length ? `${history.length} entradas` : '',
        Number.isFinite(age) ? `${Math.round(age)} h desde ultima actualizacion` : '',
      ].filter(Boolean),
      suggestedActions: ['Asignar responsable', 'Registrar causa probable', 'Definir siguiente accion', 'Actualizar SLA'],
    });
  }
}

function buildDocumentInsights(data, options, insights) {
  for (const document of data.documents) {
    if (isClosed(document)) continue;
    const status = statusOf(document);
    const pending = !status || ['pendiente', 'pending', 'revision', 'en_revision', 'uploaded', 'subido'].includes(status);
    if (!pending) continue;
    const id = idOf(document, ['id', 'documentId', 'docId']);
    if (!id) continue;
    const age = hoursSince(first(document.updatedAt, document.updated_at, document.createdAt, document.created_at, document.uploadedAt), options.nowMs);
    const checklist = documentChecklist(document);
    addInsight(insights, {
      dedupeKey: `document_review_assist:${id}`,
      insightId: 'document_review_assist',
      category: 'documents',
      priority: age >= options.documentReviewHours ? 'high' : 'normal',
      priorityScore: age >= options.documentReviewHours ? 82 : 58,
      title: 'Documento pendiente de revision asistida',
      summary: `${clean(first(document.type, document.tipo, document.documentType, 'Documento'), 120)} de ${clean(first(document.ownerRole, document.role, document.userRole, 'usuario'), 80)} pendiente. La IA interna prepara una checklist; la validacion final sigue siendo humana.`,
      recommendedAction: checklist[0],
      confidence: 'alta',
      confidenceScore: 90,
      requiresHumanReview: true,
      entityType: 'documento',
      entityId: id,
      entityName: clean(first(document.fileName, document.nombre, document.type, document.tipo, 'Documento'), 160),
      section: 'documentos',
      familyUid: familyId(document),
      teacherUid: teacherId(document),
      studentId: studentId(document),
      evidence: [
        `Estado ${status || 'pendiente'}`,
        Number.isFinite(age) ? `${Math.round(age)} h desde subida/actualizacion` : '',
        `Checklist: ${checklist.join(' | ')}`,
      ].filter(Boolean),
      suggestedActions: checklist,
    });
  }
}

function buildProfileInsights(data, options, insights) {
  for (const teacher of data.teachers) {
    if (!isActive(teacher)) continue;
    const id = teacherId(teacher);
    if (!id) continue;
    const completion = profilePercent(teacher, TEACHER_REQUIRED_GROUPS);
    if (completion >= options.profileCompletionMinPercent) continue;
    const missing = missingLabels(teacher, TEACHER_REQUIRED_GROUPS).slice(0, 5);
    addInsight(insights, {
      dedupeKey: `profile_completion_assist:teacher:${id}`,
      insightId: 'profile_completion_assist',
      category: 'profiles',
      priority: completion < 55 ? 'high' : 'normal',
      title: 'Perfil de profesor necesita ayuda inteligente',
      summary: `${displayName(teacher, 'Profesor')} tiene el perfil al ${completion}%. Faltan: ${missing.join(', ') || 'datos clave'}.`,
      recommendedAction: `Pedir completar ${missing.slice(0, 3).join(', ') || 'datos del perfil'} antes de nuevas asignaciones.`,
      confidence: 'alta',
      confidenceScore: 92,
      requiresHumanReview: false,
      entityType: 'profesor',
      entityId: id,
      entityName: displayName(teacher, 'Profesor'),
      section: 'profesores',
      teacherUid: id,
      evidence: [`Perfil ${completion}%`, missing.length ? `Faltan ${missing.join(', ')}` : 'Campos incompletos'],
      suggestedActions: ['Mostrar checklist en perfil', 'Bloquear asignaciones si procede', 'Validar documentos despues de completar datos'],
    });
  }

  for (const family of data.families) {
    if (!isActive(family)) continue;
    const id = familyId(family);
    if (!id) continue;
    const completion = profilePercent(family, FAMILY_REQUIRED_GROUPS);
    if (completion >= options.profileCompletionMinPercent) continue;
    const missing = missingLabels(family, FAMILY_REQUIRED_GROUPS).slice(0, 4);
    addInsight(insights, {
      dedupeKey: `profile_completion_assist:family:${id}`,
      insightId: 'profile_completion_assist',
      category: 'profiles',
      priority: completion < 50 ? 'high' : 'normal',
      title: 'Perfil familiar incompleto',
      summary: `${displayName(family, 'Familia')} tiene el perfil al ${completion}%. Faltan: ${missing.join(', ') || 'datos operativos'}.`,
      recommendedAction: `Solicitar solo los datos necesarios: ${missing.slice(0, 3).join(', ') || 'telefono, zona o dia de pago'}.`,
      confidence: 'alta',
      confidenceScore: 90,
      requiresHumanReview: false,
      entityType: 'familia',
      entityId: id,
      entityName: displayName(family, 'Familia'),
      section: 'familias',
      familyUid: id,
      evidence: [`Perfil ${completion}%`, missing.length ? `Faltan ${missing.join(', ')}` : 'Campos incompletos'],
      suggestedActions: ['Pedir dato minimo necesario', 'Evitar formularios largos', 'Revisar antes de programar clase'],
    });
  }
}

function buildDataQualityInsights(data, options, insights) {
  const paymentsByClass = groupBy(data.payments, classId);
  const chatsByAssignment = new Set(data.chats.map((chat) => clean(first(chat.assignmentId, chat.asignacion_id, chat.relationshipId, chat.id), 220)).filter(Boolean));

  for (const klass of data.classes) {
    const id = idOf(klass, ['id', 'classId', 'claseId']);
    if (!id) continue;
    const completed = isCompletedClass(klass);
    const scheduledPast = isScheduledClass(klass) && hoursSince(classStart(klass), options.nowMs) >= 2;
    const familyAmount = amountOf(klass);
    const teacherAmount = amountOf(klass, ['teacherAmount', 'importeProfesor', 'importe_profesor', 'profesorAmount', 'teacherPayoutAmount']);
    if ((completed || scheduledPast) && (familyAmount <= 0 || teacherAmount <= 0)) {
      addInsight(insights, {
        dedupeKey: `class_missing_financials:${id}`,
        insightId: 'class_missing_financials',
        category: 'data_quality',
        priority: 'high',
        title: 'Clase sin importes completos',
        summary: `La clase ${clean(first(klass.subject, klass.materia, id), 120)} esta ${completed ? 'realizada' : 'pasada'} pero no tiene importes completos para familia y profesor.`,
        recommendedAction: 'Completar precio familia e importe profesor antes de cerrar pagos o estadisticas.',
        confidence: 'alta',
        confidenceScore: 94,
        requiresHumanReview: true,
        entityType: 'clase',
        entityId: id,
        entityName: clean(first(klass.subject, klass.materia, id), 160),
        section: 'clases',
        familyUid: familyId(klass),
        teacherUid: teacherId(klass),
        studentId: studentId(klass),
        evidence: [`Importe familia ${familyAmount}`, `Importe profesor ${teacherAmount}`, `Estado ${statusOf(klass) || 'sin estado'}`],
        suggestedActions: ['Calcular importes', 'Actualizar calendario financiero', 'Reconciliar pago si existe'],
      });
    }

    const classPayments = paymentsByClass.get(id) || [];
    if (isPaid(klass) && !classPayments.length) {
      addInsight(insights, {
        dedupeKey: `class_paid_without_payment:${id}`,
        insightId: 'class_paid_without_payment',
        category: 'data_quality',
        priority: 'normal',
        title: 'Clase marcada como pagada sin pago enlazado',
        summary: `La clase ${clean(first(klass.subject, klass.materia, id), 120)} figura como pagada, pero no hay documento de pago enlazado por classId.`,
        recommendedAction: 'Enlazar el pago real o corregir el estado economico de la clase.',
        confidence: 'media',
        confidenceScore: 72,
        requiresHumanReview: true,
        entityType: 'clase',
        entityId: id,
        section: 'pagos',
        familyUid: familyId(klass),
        teacherUid: teacherId(klass),
        studentId: studentId(klass),
        evidence: [`Estado pago ${paymentStatus(klass) || statusOf(klass)}`, 'Sin pago con classId detectado'],
        suggestedActions: ['Buscar pago por familia', 'Enlazar classIds', 'Corregir estado si fue un error'],
      });
    }
  }

  for (const assignment of data.assignments) {
    if (!isActive(assignment)) continue;
    const id = idOf(assignment, ['id', 'assignmentId', 'asignacion_id', 'relationshipId']);
    if (!id || chatsByAssignment.has(id)) continue;
    addInsight(insights, {
      dedupeKey: `assignment_without_chat:${id}`,
      insightId: 'assignment_without_chat',
      category: 'data_quality',
      priority: 'high',
      title: 'Asignacion activa sin chat conectado',
      summary: 'Hay una relacion familia-profesor activa sin chat operativo detectado, lo que puede bloquear horarios y clases.',
      recommendedAction: 'Crear o reparar el chat de la asignacion y registrar auditoria.',
      confidence: 'alta',
      confidenceScore: 92,
      requiresHumanReview: true,
      entityType: 'asignacion',
      entityId: id,
      section: 'chat',
      familyUid: familyId(assignment),
      teacherUid: teacherId(assignment),
      studentId: studentId(assignment),
      evidence: [`Asignacion ${id}`, 'No aparece chat con assignmentId/relationshipId compatible'],
      suggestedActions: ['Reparar chat', 'Avisar admin', 'Comprobar permisos de mensajes'],
    });
  }
}

function buildPatternInsights(data, options, insights) {
  const recentIncidents = data.incidents.filter((incident) => {
    const age = daysSince(first(incident.createdAt, incident.created_at, incident.updatedAt, incident.updated_at), options.nowMs);
    return !Number.isFinite(age) || age <= options.patternWindowDays;
  });
  const incidentGroups = groupBy(recentIncidents, (incident) => {
    const category = first(
      incident.category,
      incident.categoria,
      incident.tipo,
      incident.incidentType,
      incident.title,
      incident.titulo,
      'sin_categoria',
    );
    return normalize(category, 140);
  });
  for (const [key, items] of incidentGroups.entries()) {
    if (items.length < options.recurrentPatternThreshold) continue;
    const open = items.filter((item) => !isClosed(item)).length;
    addInsight(insights, {
      dedupeKey: `incident_pattern:${key}`,
      insightId: 'incident_pattern',
      category: 'patterns',
      priority: open >= options.recurrentPatternThreshold ? 'high' : 'normal',
      title: 'Patron repetido de incidencias',
      summary: `${items.length} incidencia(s) de tipo ${clean(first(items[0]?.category, items[0]?.tipo, key), 120)} en los ultimos ${options.patternWindowDays} dias; ${open} siguen abiertas.`,
      recommendedAction: 'Analizar causa raiz y crear una regla/automatizacion para evitar recurrencia.',
      confidence: 'alta',
      confidenceScore: 90,
      requiresHumanReview: true,
      entityType: 'incidencias',
      entityId: key,
      entityName: clean(first(items[0]?.category, items[0]?.tipo, key), 120),
      section: 'incidencias',
      evidence: [`${items.length} incidencias`, `${open} abiertas`, `Ventana ${options.patternWindowDays} dias`],
      suggestedActions: ['Agrupar causa raiz', 'Crear regla preventiva', 'Actualizar copy o flujo que genera friccion'],
    });
  }
}

function buildAdminBrief(data, options, insights) {
  const sources = [
    ...data.alertDecisions.map((item) => ({ ...item, sourceName: 'alertDecisions', label: first(item.title, item.attentionLabel, item.category), score: asNumber(first(item.priorityScore, item.score), 0), section: 'incidencias' })),
    ...data.platformSupervisionFindings.map((item) => ({ ...item, sourceName: 'platformSupervisionFindings', label: first(item.title, item.type), score: asNumber(first(item.priorityScore, item.score), 0), section: 'auditoria' })),
    ...data.preventiveRisks.map((item) => ({ ...item, sourceName: 'preventiveRisks', label: first(item.title, item.type), score: asNumber(first(item.priorityScore, item.alertPriorityScore), 0), section: 'incidencias' })),
    ...data.relationshipFollowups.map((item) => ({ ...item, sourceName: 'relationshipFollowups', label: first(item.title, item.actionId), score: asNumber(first(item.priorityScore, item.score), 0), section: first(item.section, 'chat') })),
    ...data.proactiveAssistSignals.map((item) => ({ ...item, sourceName: 'proactiveAssistSignals', label: first(item.title, item.signalId), score: asNumber(first(item.priorityScore, item.score), 0), section: first(item.section, 'operaciones') })),
    ...data.opsAlerts.map((item) => ({ ...item, sourceName: 'opsAlerts', label: first(item.title, item.message, item.type), score: asNumber(first(item.priorityScore, item.score), 0), section: first(item.section, 'operaciones') })),
    ...data.crmTasks.map((item) => ({ ...item, sourceName: 'crmTasks', label: first(item.title, item.description), score: asNumber(first(item.priorityScore, item.score), 0), section: first(item.section, 'operaciones') })),
  ].filter((item) => !isClosed(item));

  const ranked = sources
    .map((item) => {
      const priority = normalize(first(item.priority, item.severity, item.prioridad), 80);
      const base = item.score || (['critical', 'critica', 'urgente'].includes(priority) ? 96 : ['high', 'alta'].includes(priority) ? 84 : ['low', 'baja'].includes(priority) ? 34 : 58);
      return { ...item, computedScore: base };
    })
    .filter((item) => item.computedScore >= options.dailyBriefMinScore)
    .sort((a, b) => b.computedScore - a.computedScore)
    .slice(0, options.dailyBriefMaxItems);

  if (!ranked.length) return;
  const day = new Date(options.nowMs).toISOString().slice(0, 10);
  const top = ranked.slice(0, 3).map((item) => clean(first(item.label, item.type, item.id), 120)).join(' | ');
  addInsight(insights, {
    dedupeKey: `admin_daily_brief:${day}`,
    insightId: 'admin_daily_brief',
    category: 'operations',
    priority: ranked.some((item) => item.computedScore >= 92) ? 'critical' : 'high',
    priorityScore: Math.max(...ranked.map((item) => item.computedScore)),
    title: 'Resumen interno de prioridades del dia',
    summary: `La IA interna ha consolidado ${ranked.length} senal(es) relevantes. Prioridad: ${top}.`,
    recommendedAction: `Empezar por: ${clean(first(ranked[0]?.recommendedAction, ranked[0]?.alertRecommendedAction, ranked[0]?.label, 'abrir Operaciones'), 180)}.`,
    confidence: 'alta',
    confidenceScore: 91,
    requiresHumanReview: true,
    entityType: 'daily_brief',
    entityId: day,
    entityName: 'Resumen diario',
    section: 'operaciones',
    evidence: ranked.map((item) => `${item.sourceName}: ${clean(first(item.label, item.type, item.id), 120)} (${item.computedScore})`),
    suggestedActions: ['Resolver la primera prioridad', 'Cerrar senales obsoletas', 'Revisar Operaciones al inicio del dia'],
  });
}

function normalizeData(raw = {}) {
  return {
    users: raw.users || raw.usuarios || [],
    teachers: raw.teachers || raw.profesores || [],
    families: raw.families || raw.familias || [],
    students: raw.students || raw.alumnos || [],
    classes: raw.classes || raw.clases || [],
    payments: raw.payments || raw.pagos || [],
    requests: raw.requests || raw.solicitudes || [],
    assignments: raw.assignments || raw.asignaciones || [],
    chats: raw.chats || [],
    messages: raw.messages || raw.mensajes || [],
    incidents: raw.incidents || raw.incidencias || [],
    documents: raw.documents || raw.documentos || [],
    notifications: raw.notifications || raw.notificaciones || [],
    alertDecisions: raw.alertDecisions || [],
    preventiveRisks: raw.preventiveRisks || [],
    platformSupervisionFindings: raw.platformSupervisionFindings || [],
    relationshipFollowups: raw.relationshipFollowups || [],
    proactiveAssistSignals: raw.proactiveAssistSignals || [],
    crmTasks: raw.crmTasks || [],
    opsAlerts: raw.opsAlerts || [],
    previousInsights: raw.previousInsights || raw.internalAiInsights || [],
  };
}

function normalizeOptions(options = {}) {
  const now = toDate(options.nowIso || options.now || options.generatedAt) || new Date();
  return {
    nowMs: now.getTime(),
    nowIso: now.toISOString(),
    scanLimit: Math.max(10, asNumber(options.scanLimit, 1000)),
    longConversationMessageThreshold: Math.max(5, asNumber(options.longConversationMessageThreshold, 20)),
    conflictKeywordThreshold: Math.max(1, asNumber(options.conflictKeywordThreshold, 2)),
    staleChatHours: Math.max(1, asNumber(options.staleChatHours, 24)),
    staleIncidentHours: Math.max(1, asNumber(options.staleIncidentHours, 24)),
    incidentSummaryMinEntries: Math.max(2, asNumber(options.incidentSummaryMinEntries, 4)),
    documentReviewHours: Math.max(1, asNumber(options.documentReviewHours, 24)),
    profileCompletionMinPercent: clamp(options.profileCompletionMinPercent ?? 85, 1, 100),
    patternWindowDays: Math.max(1, asNumber(options.patternWindowDays, 30)),
    recurrentPatternThreshold: Math.max(2, asNumber(options.recurrentPatternThreshold, 3)),
    dailyBriefMinScore: clamp(options.dailyBriefMinScore ?? 58, 1, 100),
    dailyBriefMaxItems: Math.max(3, asNumber(options.dailyBriefMaxItems, 8)),
  };
}

function summarizeInsights(insights = []) {
  const byCategory = (category) => insights.filter((item) => item.category === category).length;
  return {
    total: insights.length,
    critical: insights.filter((item) => item.priority === 'critical').length,
    high: insights.filter((item) => item.priority === 'high').length,
    humanReview: insights.filter((item) => item.requiresHumanReview).length,
    adminBriefs: insights.filter((item) => item.insightId === 'admin_daily_brief').length,
    chatInsights: byCategory('chat'),
    incidentInsights: byCategory('incidents'),
    documentInsights: byCategory('documents'),
    profileInsights: byCategory('profiles'),
    dataQualityInsights: byCategory('data_quality'),
    patternInsights: byCategory('patterns'),
    operationsInsights: byCategory('operations'),
  };
}

export function buildInternalAiAssistantPlan(rawData = {}, rawOptions = {}) {
  const data = normalizeData(rawData);
  const options = normalizeOptions(rawOptions);
  const insights = [];

  buildChatInsights(data, options, insights);
  buildIncidentInsights(data, options, insights);
  buildDocumentInsights(data, options, insights);
  buildProfileInsights(data, options, insights);
  buildDataQualityInsights(data, options, insights);
  buildPatternInsights(data, options, insights);
  buildAdminBrief(data, options, insights);

  const sorted = insights
    .sort((a, b) => (b.priorityScore - a.priorityScore) || a.title.localeCompare(b.title))
    .slice(0, options.scanLimit);

  return {
    version: INTERNAL_AI_ASSISTANT_VERSION,
    generatedAt: options.nowIso,
    thresholds: {
      scanLimit: options.scanLimit,
      longConversationMessageThreshold: options.longConversationMessageThreshold,
      conflictKeywordThreshold: options.conflictKeywordThreshold,
      staleChatHours: options.staleChatHours,
      staleIncidentHours: options.staleIncidentHours,
      documentReviewHours: options.documentReviewHours,
      profileCompletionMinPercent: options.profileCompletionMinPercent,
      recurrentPatternThreshold: options.recurrentPatternThreshold,
      dailyBriefMinScore: options.dailyBriefMinScore,
      dailyBriefMaxItems: options.dailyBriefMaxItems,
    },
    total: sorted.length,
    insights: sorted,
    summary: summarizeInsights(sorted),
  };
}

export const __internalAiAssistantTest = {
  normalizeData,
  normalizeOptions,
  daysSince,
  groupBy,
  normalize,
  statusOf,
};
