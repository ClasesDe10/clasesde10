/**
 * ClasesDe10 - notification engine.
 *
 * Pure helpers shared by UI/tests to keep notification types, channels and
 * settings consistent across chat, automations and the GitHub Actions worker.
 */

export const NOTIFICATION_CHANNELS = Object.freeze({
  INTERNAL: 'internal',
  BROWSER: 'browser',
  PUSH: 'push',
  EMAIL: 'email',
});

export const NOTIFICATION_EVENTS = Object.freeze({
  ADMIN_MANUAL: 'admin_manual',
  CHAT_MESSAGE: 'chat_message',
  CLASS_REMINDER: 'class_reminder',
  CLASS_CONFIRMATION_NEEDED: 'class_confirmation_needed',
  CLASS_UNMARKED_AFTER_24H: 'class_unmarked_after_24h',
  CLASS_UNMARKED_AFTER_1H: 'class_unmarked_after_1h',
  CLASS_SCHEDULE_CHANGE: 'class_schedule_change',
  CLASS_INCIDENT: 'class_incident',
  WEEKLY_PAYMENT_DUE: 'weekly_payment_due',
  FAMILY_PAYMENT_PENDING: 'family_payment_pending',
  FAMILY_PAYMENT_REJECTED: 'family_payment_rejected',
  TEACHER_PAYOUT_PENDING: 'teacher_payout_pending',
  PAYMENT_OVERDUE: 'payment_overdue',
  PAYMENT_OVERDUE_REMINDER: 'payment_overdue_reminder',
  PAYMENT_TEACHER_PAUSE_WARNING: 'payment_teacher_pause_warning',
  PAYMENT_VERIFIED: 'payment_verified',
  REQUEST_CREATED: 'request_created',
  MATCHING_READY: 'matching_ready',
  MATCHING_NO_MATCH: 'matching_no_match',
  MATCHING_ACTIVE_INTERVENTION: 'matching_active_intervention',
  ALERT_PRIORITY: 'alert_priority',
  RELATIONSHIP_FOLLOWUP: 'relationship_followup',
  PROACTIVE_ASSIST: 'proactive_assist',
  ASSIGNMENT_CREATED: 'assignment_created',
  VERIFICATION_PENDING: 'verification_pending',
  DOCUMENT_REVIEW_PENDING: 'document_review_pending',
  DOCUMENT_VERIFIED: 'document_verified',
  DOCUMENT_REJECTED: 'document_rejected',
  DOCUMENT_EXPIRING_SOON: 'document_expiring_soon',
  DOCUMENT_EXPIRED: 'document_expired',
  TEACHER_VERIFIED: 'teacher_verified',
  SCHEDULE_PROPOSED: 'schedule_proposed',
  SCHEDULE_ACCEPTED: 'schedule_accepted',
  SCHEDULE_REJECTED: 'schedule_rejected',
  PROFILE_UPDATED: 'profile_updated',
  USER_REGISTERED: 'user_registered',
  CONTACT_LEAD: 'contact_lead',
  TEACHER_LEAD: 'teacher_lead',
  FAMILY_LEAD_REQUEST: 'family_lead_request',
  MONTHLY_SUMMARY: 'monthly_summary',
  AUTOMATION: 'automation',
});

export const NOTIFICATION_EVENT_DEFINITIONS = Object.freeze({
  [NOTIFICATION_EVENTS.ADMIN_MANUAL]: {
    label: 'Aviso del equipo',
    category: 'admin',
    priority: 'normal',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.CHAT_MESSAGE]: {
    label: 'Mensaje',
    category: 'chat',
    priority: 'normal',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.CLASS_REMINDER]: {
    label: 'Recordatorio',
    category: 'clases',
    priority: 'normal',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.CLASS_CONFIRMATION_NEEDED]: {
    label: 'Confirmacion',
    category: 'clases',
    priority: 'high',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.CLASS_UNMARKED_AFTER_24H]: {
    label: 'Clase sin marcar 24h',
    category: 'clases',
    priority: 'high',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.CLASS_UNMARKED_AFTER_1H]: {
    label: 'Clase sin marcar',
    category: 'clases',
    priority: 'high',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.CLASS_SCHEDULE_CHANGE]: {
    label: 'Cambio horario',
    category: 'clases',
    priority: 'high',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.CLASS_INCIDENT]: {
    label: 'Incidencia',
    category: 'incidencias',
    priority: 'critical',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.WEEKLY_PAYMENT_DUE]: {
    label: 'Pago semanal',
    category: 'pagos',
    priority: 'high',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.FAMILY_PAYMENT_PENDING]: {
    label: 'Cobro pendiente',
    category: 'pagos',
    priority: 'high',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.FAMILY_PAYMENT_REJECTED]: {
    label: 'Justificante no valido',
    category: 'pagos',
    priority: 'high',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.TEACHER_PAYOUT_PENDING]: {
    label: 'Bizum profesor',
    category: 'pagos',
    priority: 'high',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.PAYMENT_OVERDUE]: {
    label: 'Pago vencido',
    category: 'pagos',
    priority: 'critical',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.PAYMENT_OVERDUE_REMINDER]: {
    label: 'Recordatorio de pago',
    category: 'pagos',
    priority: 'high',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.PAYMENT_TEACHER_PAUSE_WARNING]: {
    label: 'Aviso de continuidad',
    category: 'pagos',
    priority: 'critical',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.PAYMENT_VERIFIED]: {
    label: 'Pago validado',
    category: 'pagos',
    priority: 'normal',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.REQUEST_CREATED]: {
    label: 'Solicitud',
    category: 'solicitudes',
    priority: 'high',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.MATCHING_READY]: {
    label: 'Búsqueda',
    category: 'matching',
    priority: 'normal',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.MATCHING_NO_MATCH]: {
    label: 'Sin match',
    category: 'matching',
    priority: 'high',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.MATCHING_ACTIVE_INTERVENTION]: {
    label: 'Búsqueda activa',
    category: 'matching',
    priority: 'high',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.ALERT_PRIORITY]: {
    label: 'Alerta priorizada',
    category: 'incidencias',
    priority: 'critical',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.RELATIONSHIP_FOLLOWUP]: {
    label: 'Seguimiento',
    category: 'relaciones',
    priority: 'normal',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.PROACTIVE_ASSIST]: {
    label: 'Ayuda proactiva',
    category: 'sistema',
    priority: 'normal',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.ASSIGNMENT_CREATED]: {
    label: 'Asignacion',
    category: 'matching',
    priority: 'high',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.VERIFICATION_PENDING]: {
    label: 'Verificacion',
    category: 'verificacion',
    priority: 'high',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.DOCUMENT_REVIEW_PENDING]: {
    label: 'Documento',
    category: 'verificacion',
    priority: 'high',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.DOCUMENT_VERIFIED]: {
    label: 'Documento validado',
    category: 'verificacion',
    priority: 'normal',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.DOCUMENT_REJECTED]: {
    label: 'Documento rechazado',
    category: 'verificacion',
    priority: 'high',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.DOCUMENT_EXPIRING_SOON]: {
    label: 'Documento caduca pronto',
    category: 'verificacion',
    priority: 'high',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.DOCUMENT_EXPIRED]: {
    label: 'Documento caducado',
    category: 'verificacion',
    priority: 'critical',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.TEACHER_VERIFIED]: {
    label: 'Perfil verificado',
    category: 'verificacion',
    priority: 'normal',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.SCHEDULE_PROPOSED]: {
    label: 'Horario propuesto',
    category: 'clases',
    priority: 'high',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.SCHEDULE_ACCEPTED]: {
    label: 'Horario aceptado',
    category: 'clases',
    priority: 'normal',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.SCHEDULE_REJECTED]: {
    label: 'Horario rechazado',
    category: 'clases',
    priority: 'high',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.PROFILE_UPDATED]: {
    label: 'Perfil',
    category: 'perfil',
    priority: 'normal',
    channels: ['internal', 'browser'],
  },
  [NOTIFICATION_EVENTS.USER_REGISTERED]: {
    label: 'Usuario',
    category: 'usuarios',
    priority: 'normal',
    channels: ['internal', 'browser'],
  },
  [NOTIFICATION_EVENTS.CONTACT_LEAD]: {
    label: 'Contacto',
    category: 'leads',
    priority: 'normal',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.TEACHER_LEAD]: {
    label: 'Profesor interesado',
    category: 'leads',
    priority: 'high',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.FAMILY_LEAD_REQUEST]: {
    label: 'Familia interesada',
    category: 'leads',
    priority: 'high',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.MONTHLY_SUMMARY]: {
    label: 'Resumen',
    category: 'finanzas',
    priority: 'normal',
    channels: ['internal', 'browser'],
  },
  [NOTIFICATION_EVENTS.AUTOMATION]: {
    label: 'Automatizacion',
    category: 'sistema',
    priority: 'normal',
    channels: ['internal', 'browser'],
  },
});

export const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  enabled: true,
  channels: {
    internal: true,
    browser: true,
    push: true,
    email: false,
  },
  eventTypes: Object.freeze(Object.keys(NOTIFICATION_EVENT_DEFINITIONS).reduce((acc, type) => {
    acc[type] = true;
    return acc;
  }, {})),
  roles: {
    admin: true,
    profesor: true,
    familia: true,
    alumno: true,
  },
  quietHours: {
    enabled: false,
    start: '22:30',
    end: '08:00',
  },
});

export function cleanNotificationText(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

export function safeInternalActionUrl(value, fallback = '/pages/login.html') {
  const candidate = cleanNotificationText(value, 500);
  if (!candidate) return fallback;
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return fallback;
  if (!/^\/[A-Za-z0-9/_.,~#?&=%:+-]*$/.test(candidate)) return fallback;
  return candidate;
}

export function notificationDefinition(type) {
  return NOTIFICATION_EVENT_DEFINITIONS[type] || NOTIFICATION_EVENT_DEFINITIONS[NOTIFICATION_EVENTS.AUTOMATION];
}

export function notificationCategoryLabel(type) {
  return notificationDefinition(type).label;
}

export function notificationPriority(type, explicitPriority = '') {
  return cleanNotificationText(explicitPriority, 30) || notificationDefinition(type).priority || 'normal';
}

export function notificationPriorityClass(notification = {}) {
  const priority = notificationPriority(notification.type, notification.priority)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (['critical', 'critica', 'urgent', 'urgente', 'red', 'rojo'].includes(priority)) return 'critica';
  if (['high', 'alta', 'orange', 'naranja'].includes(priority)) return 'alta';
  if (['medium', 'media', 'warning', 'warn', 'yellow', 'amarillo'].includes(priority)) return 'media';
  return 'normal';
}

const USER_NOTIFICATION_ROLE_ALIASES = Object.freeze({
  familia: 'familia',
  family: 'familia',
  familias: 'familia',
  parent: 'familia',
  padre: 'familia',
  madre: 'familia',
  profesor: 'profesor',
  profesora: 'profesor',
  teacher: 'profesor',
  profesores: 'profesor',
  alumno: 'alumno',
  alumna: 'alumno',
  student: 'alumno',
});

const ESSENTIAL_USER_NOTIFICATION_TYPES = Object.freeze([
  NOTIFICATION_EVENTS.CHAT_MESSAGE,
  NOTIFICATION_EVENTS.CLASS_REMINDER,
  NOTIFICATION_EVENTS.CLASS_CONFIRMATION_NEEDED,
  NOTIFICATION_EVENTS.CLASS_UNMARKED_AFTER_24H,
  NOTIFICATION_EVENTS.CLASS_UNMARKED_AFTER_1H,
  NOTIFICATION_EVENTS.CLASS_SCHEDULE_CHANGE,
  NOTIFICATION_EVENTS.CLASS_INCIDENT,
  NOTIFICATION_EVENTS.WEEKLY_PAYMENT_DUE,
  NOTIFICATION_EVENTS.FAMILY_PAYMENT_PENDING,
  NOTIFICATION_EVENTS.FAMILY_PAYMENT_REJECTED,
  NOTIFICATION_EVENTS.PAYMENT_OVERDUE,
  NOTIFICATION_EVENTS.PAYMENT_OVERDUE_REMINDER,
  NOTIFICATION_EVENTS.PAYMENT_TEACHER_PAUSE_WARNING,
  NOTIFICATION_EVENTS.ASSIGNMENT_CREATED,
  NOTIFICATION_EVENTS.VERIFICATION_PENDING,
  NOTIFICATION_EVENTS.DOCUMENT_VERIFIED,
  NOTIFICATION_EVENTS.DOCUMENT_REJECTED,
  NOTIFICATION_EVENTS.DOCUMENT_EXPIRING_SOON,
  NOTIFICATION_EVENTS.DOCUMENT_EXPIRED,
  NOTIFICATION_EVENTS.TEACHER_VERIFIED,
  NOTIFICATION_EVENTS.SCHEDULE_PROPOSED,
  NOTIFICATION_EVENTS.SCHEDULE_ACCEPTED,
  NOTIFICATION_EVENTS.SCHEDULE_REJECTED,
  NOTIFICATION_EVENTS.PAYMENT_VERIFIED,
]);

const ASSISTIVE_USER_NOTIFICATION_TYPES = Object.freeze([
  NOTIFICATION_EVENTS.RELATIONSHIP_FOLLOWUP,
  NOTIFICATION_EVENTS.PROACTIVE_ASSIST,
]);

const SUPPRESSED_USER_NOTIFICATION_TYPES = Object.freeze([
  NOTIFICATION_EVENTS.PROFILE_UPDATED,
  NOTIFICATION_EVENTS.MATCHING_READY,
  NOTIFICATION_EVENTS.MONTHLY_SUMMARY,
  NOTIFICATION_EVENTS.AUTOMATION,
]);

const NOTIFICATION_CENTER_HIDDEN_TYPES = Object.freeze([
  NOTIFICATION_EVENTS.CHAT_MESSAGE,
  NOTIFICATION_EVENTS.PROFILE_UPDATED,
  NOTIFICATION_EVENTS.MATCHING_READY,
  NOTIFICATION_EVENTS.MONTHLY_SUMMARY,
  NOTIFICATION_EVENTS.AUTOMATION,
]);

const NOTIFICATION_CENTER_ACTIONABLE_TYPES = Object.freeze([
  NOTIFICATION_EVENTS.ADMIN_MANUAL,
  NOTIFICATION_EVENTS.CLASS_CONFIRMATION_NEEDED,
  NOTIFICATION_EVENTS.CLASS_UNMARKED_AFTER_24H,
  NOTIFICATION_EVENTS.CLASS_UNMARKED_AFTER_1H,
  NOTIFICATION_EVENTS.CLASS_SCHEDULE_CHANGE,
  NOTIFICATION_EVENTS.CLASS_INCIDENT,
  NOTIFICATION_EVENTS.WEEKLY_PAYMENT_DUE,
  NOTIFICATION_EVENTS.FAMILY_PAYMENT_REJECTED,
  NOTIFICATION_EVENTS.TEACHER_PAYOUT_PENDING,
  NOTIFICATION_EVENTS.PAYMENT_OVERDUE,
  NOTIFICATION_EVENTS.PAYMENT_OVERDUE_REMINDER,
  NOTIFICATION_EVENTS.PAYMENT_TEACHER_PAUSE_WARNING,
  NOTIFICATION_EVENTS.REQUEST_CREATED,
  NOTIFICATION_EVENTS.MATCHING_NO_MATCH,
  NOTIFICATION_EVENTS.MATCHING_ACTIVE_INTERVENTION,
  NOTIFICATION_EVENTS.ALERT_PRIORITY,
  NOTIFICATION_EVENTS.ASSIGNMENT_CREATED,
  NOTIFICATION_EVENTS.VERIFICATION_PENDING,
  NOTIFICATION_EVENTS.DOCUMENT_REVIEW_PENDING,
  NOTIFICATION_EVENTS.DOCUMENT_REJECTED,
  NOTIFICATION_EVENTS.DOCUMENT_EXPIRING_SOON,
  NOTIFICATION_EVENTS.DOCUMENT_EXPIRED,
  NOTIFICATION_EVENTS.SCHEDULE_PROPOSED,
  NOTIFICATION_EVENTS.SCHEDULE_REJECTED,
]);

const ACTIONABLE_RELATIONSHIP_FOLLOWUPS = Object.freeze([
  'schedule_first_class',
  'answer_schedule_proposal',
  'confirm_finished_class',
  'plan_next_regular_class',
]);

const ACTIONABLE_PROACTIVE_CATEGORIES = Object.freeze([
  'onboarding',
  'scheduling',
  'request_readiness',
  'payment_readiness',
  'profile',
]);

function notificationPolicyKey(value) {
  return cleanNotificationText(value, 180)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function notificationDateBucket(value, nowIso = '') {
  const candidate = cleanNotificationText(value || nowIso || new Date().toISOString(), 80);
  const match = candidate.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : new Date().toISOString().slice(0, 10);
}

function notificationPriorityLevel(type, priority = '') {
  const value = notificationPriority(type, priority)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (['critical', 'critica', 'urgent', 'urgente', 'red', 'rojo'].includes(value)) return 'critical';
  if (['high', 'alta', 'orange', 'naranja'].includes(value)) return 'high';
  if (['medium', 'media', 'warning', 'warn', 'yellow', 'amarillo'].includes(value)) return 'medium';
  if (['low', 'baja'].includes(value)) return 'low';
  return 'normal';
}

function notificationCreatedAtMs(value) {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (Number.isFinite(value?.seconds)) return Number(value.seconds) * 1000;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function notificationHasEntityAction(notification = {}) {
  const payload = notification.payload || {};
  return [
    payload.chatId,
    payload.classId,
    payload.paymentId,
    payload.documentId,
    payload.requestId,
    payload.assignmentId,
    payload.incidentId,
    payload.profileId,
    payload.teacherId,
  ].some(Boolean);
}

export function isNotificationUnread(notification = {}) {
  return !notification.readAt && notification.leida !== true;
}

/**
 * Low-noise policy for the visible notification centre.
 * Chat messages live in Chat, not in the action inbox. High/critical items stay
 * visible for 30 days; normal confirmations expire after 3 days once read.
 */
export function shouldDisplayNotification(notification = {}, role = '', nowMs = Date.now()) {
  const type = normalizeNotificationType(notification.type || notification.payload?.type);
  const normalizedRole = normalizeNotificationRole(role || notification.role);
  const level = notificationPriorityLevel(type, notification.priority);
  const unread = isNotificationUnread(notification);

  if (type === NOTIFICATION_EVENTS.CHAT_MESSAGE) return false;
  if (NOTIFICATION_CENTER_HIDDEN_TYPES.includes(type) && !['critical', 'high'].includes(level)) return false;
  if (isUserFacingNotificationRole(normalizedRole)
    && !shouldCreateUserFacingNotification({ type, role: normalizedRole, priority: notification.priority, payload: notification.payload || {} })) {
    return false;
  }

  const actionable = NOTIFICATION_CENTER_ACTIONABLE_TYPES.includes(type)
    || notificationHasEntityAction(notification)
    || notificationActionUrl(notification) !== '/pages/login.html';
  if (!actionable && !unread && !['critical', 'high'].includes(level)) return false;

  const createdAt = notificationCreatedAtMs(notification.createdAt);
  if (!createdAt || unread) return true;
  const ageMs = Math.max(0, Number(nowMs) - createdAt);
  const retentionDays = ['critical', 'high'].includes(level) ? 30 : 3;
  return ageMs <= retentionDays * 24 * 60 * 60 * 1000;
}

export function visibleNotificationsForRole(notifications = [], role = '', nowMs = Date.now()) {
  return notifications
    .filter((notification) => shouldDisplayNotification(notification, role, nowMs))
    .sort((a, b) => {
      const unreadDelta = Number(isNotificationUnread(b)) - Number(isNotificationUnread(a));
      if (unreadDelta) return unreadDelta;
      const rank = { critical: 4, high: 3, medium: 2, normal: 1, low: 0 };
      const priorityDelta = (rank[notificationPriorityLevel(b.type, b.priority)] || 0)
        - (rank[notificationPriorityLevel(a.type, a.priority)] || 0);
      if (priorityDelta) return priorityDelta;
      return notificationCreatedAtMs(b.createdAt) - notificationCreatedAtMs(a.createdAt);
    })
    .slice(0, 40);
}

export function normalizeNotificationRole(role = '') {
  const key = notificationPolicyKey(role);
  return USER_NOTIFICATION_ROLE_ALIASES[key] || key;
}

export function inferNotificationRole({ role = '', payload = {}, key = '' } = {}) {
  const direct = normalizeNotificationRole(role || payload.role || payload.targetRole || payload.recipientRole || payload.userRole);
  if (direct) return direct;
  const normalizedKey = notificationPolicyKey(key);
  if (/(^|_)admin($|_)/.test(normalizedKey)) return 'admin';
  if (/(^|_)(family|familia)($|_)/.test(normalizedKey)) return 'familia';
  if (/(^|_)(teacher|profesor)($|_)/.test(normalizedKey)) return 'profesor';
  if (/(^|_)(student|alumno)($|_)/.test(normalizedKey)) return 'alumno';
  return '';
}

export function isUserFacingNotificationRole(role = '') {
  return ['familia', 'profesor', 'alumno'].includes(normalizeNotificationRole(role));
}

export function shouldCreateUserFacingNotification({
  type = NOTIFICATION_EVENTS.AUTOMATION,
  role = '',
  priority = '',
  payload = {},
} = {}) {
  const normalizedType = normalizeNotificationType(type || payload.type);
  const normalizedRole = normalizeNotificationRole(role);
  if (!isUserFacingNotificationRole(normalizedRole)) return true;
  if (ESSENTIAL_USER_NOTIFICATION_TYPES.includes(normalizedType)) return true;
  if (SUPPRESSED_USER_NOTIFICATION_TYPES.includes(normalizedType)) return false;

  const level = notificationPriorityLevel(normalizedType, priority || payload.priority);
  if (normalizedType === NOTIFICATION_EVENTS.RELATIONSHIP_FOLLOWUP) {
    const actionId = notificationPolicyKey(payload.actionId || payload.followupActionId);
    return ACTIONABLE_RELATIONSHIP_FOLLOWUPS.includes(actionId) && level !== 'low';
  }

  if (normalizedType === NOTIFICATION_EVENTS.PROACTIVE_ASSIST) {
    const category = notificationPolicyKey(payload.category || payload.signalCategory);
    if (!ACTIONABLE_PROACTIVE_CATEGORIES.includes(category)) return false;
    if (category === 'profile') return ['critical', 'high'].includes(level);
    return level !== 'low';
  }

  if (ASSISTIVE_USER_NOTIFICATION_TYPES.includes(normalizedType)) return ['critical', 'high'].includes(level);
  return ['critical', 'high'].includes(level);
}

export function userFacingNotificationDedupeKey({
  type = NOTIFICATION_EVENTS.AUTOMATION,
  role = '',
  payload = {},
  key = '',
  nowIso = '',
} = {}) {
  const normalizedType = normalizeNotificationType(type || payload.type);
  const normalizedRole = normalizeNotificationRole(role);
  const baseKey = notificationPolicyKey(key || payload.id || normalizedType);
  if (!isUserFacingNotificationRole(normalizedRole)) return baseKey;

  if ([
    NOTIFICATION_EVENTS.WEEKLY_PAYMENT_DUE,
    NOTIFICATION_EVENTS.PAYMENT_OVERDUE,
    NOTIFICATION_EVENTS.PAYMENT_OVERDUE_REMINDER,
    NOTIFICATION_EVENTS.PAYMENT_TEACHER_PAUSE_WARNING,
  ].includes(normalizedType)) {
    const dueDay = notificationDateBucket(payload.dueAt || payload.paymentDueAt || payload.overdueAt || payload.createdAt, nowIso);
    const stage = notificationPolicyKey(payload.overdueStage || payload.noticeNumber || normalizedType);
    return ['user_payment_notice', normalizedRole, normalizedType, stage, dueDay].filter(Boolean).join('_');
  }

  if (normalizedType === NOTIFICATION_EVENTS.FAMILY_PAYMENT_PENDING) {
    const dueDay = notificationDateBucket(payload.dueAt || payload.paymentDueAt || payload.createdAt, nowIso);
    return ['user_payment_pending', normalizedRole, dueDay].join('_');
  }

  if (normalizedType === NOTIFICATION_EVENTS.RELATIONSHIP_FOLLOWUP) {
    const actionId = notificationPolicyKey(payload.actionId || payload.followupActionId || 'followup');
    const day = notificationDateBucket(payload.createdAt, nowIso);
    return ['user_relationship_followup', normalizedRole, actionId, day].join('_');
  }

  if (normalizedType === NOTIFICATION_EVENTS.PROACTIVE_ASSIST) {
    const category = notificationPolicyKey(payload.category || payload.signalCategory || 'assist');
    const day = notificationDateBucket(payload.createdAt, nowIso);
    return ['user_proactive_assist', normalizedRole, category, day].join('_');
  }

  return baseKey;
}

export function minimalUserNotificationCopy({
  title = '',
  body = '',
  type = NOTIFICATION_EVENTS.AUTOMATION,
  role = '',
  payload = {},
} = {}) {
  const normalizedType = normalizeNotificationType(type || payload.type);
  const normalizedRole = normalizeNotificationRole(role);
  if (!isUserFacingNotificationRole(normalizedRole)) return { title, body };

  if (normalizedRole === 'familia' && normalizedType === NOTIFICATION_EVENTS.WEEKLY_PAYMENT_DUE) {
    return {
      title: 'Justificante pendiente',
      body: 'Tienes clases pendientes de justificar. Revisa el dia de pago y sube un justificante valido desde Justificantes.',
    };
  }

  if (normalizedRole === 'familia' && [
    NOTIFICATION_EVENTS.PAYMENT_OVERDUE,
    NOTIFICATION_EVENTS.PAYMENT_OVERDUE_REMINDER,
    NOTIFICATION_EVENTS.PAYMENT_TEACHER_PAUSE_WARNING,
  ].includes(normalizedType)) {
    return {
      title,
      body: cleanNotificationText(body, 1200) || 'Hay un pago pendiente. Revisa el dia de pago y envia un justificante valido desde Justificantes.',
    };
  }

  if (normalizedRole === 'familia' && normalizedType === NOTIFICATION_EVENTS.FAMILY_PAYMENT_PENDING) {
    return {
      title: 'Justificante en revision',
      body: 'Hemos recibido el justificante y lo revisaremos cuanto antes.',
    };
  }

  return { title, body };
}

export function notificationChannels(type, explicitChannels = null) {
  const channels = Array.isArray(explicitChannels) && explicitChannels.length
    ? explicitChannels
    : notificationDefinition(type).channels;
  return [...new Set(channels.filter(Boolean))];
}

export function normalizeNotificationType(type) {
  const normalized = cleanNotificationText(type, 80);
  return NOTIFICATION_EVENT_DEFINITIONS[normalized] ? normalized : NOTIFICATION_EVENTS.AUTOMATION;
}

export function notificationActionUrl(notification = {}) {
  const payload = notification.payload || {};
  return safeInternalActionUrl(notification.actionUrl || payload.url || '/pages/login.html');
}

export function mergeNotificationSettings(settings = {}) {
  return {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...settings,
    channels: {
      ...DEFAULT_NOTIFICATION_SETTINGS.channels,
      ...(settings.channels || {}),
    },
    eventTypes: {
      ...DEFAULT_NOTIFICATION_SETTINGS.eventTypes,
      ...(settings.eventTypes || {}),
    },
    roles: {
      ...DEFAULT_NOTIFICATION_SETTINGS.roles,
      ...(settings.roles || {}),
    },
    quietHours: {
      ...DEFAULT_NOTIFICATION_SETTINGS.quietHours,
      ...(settings.quietHours || {}),
    },
  };
}

export function isNotificationEnabled(settings, type, channel = 'internal', role = '') {
  const merged = mergeNotificationSettings(settings);
  const normalizedType = normalizeNotificationType(type);
  if (merged.enabled === false) return false;
  if (merged.channels?.[channel] === false) return false;
  if (merged.eventTypes?.[normalizedType] === false) return false;
  if (role && merged.roles?.[role] === false) return false;
  return true;
}

export function buildNotificationDocument({
  userUid,
  title,
  body,
  type = NOTIFICATION_EVENTS.AUTOMATION,
  payload = {},
  role = '',
  channels = null,
  priority = '',
  category = '',
  source = '',
  createdByUid = '',
}) {
  const normalizedType = normalizeNotificationType(type);
  const finalTitle = cleanNotificationText(title, 140) || notificationCategoryLabel(normalizedType);
  const finalBody = cleanNotificationText(body, 1200);
  const actionUrl = safeInternalActionUrl(payload.url || '/pages/login.html');

  return {
    userUid: cleanNotificationText(userUid, 180),
    usuario_id: cleanNotificationText(userUid, 180),
    title: finalTitle,
    titulo: finalTitle,
    body: finalBody,
    cuerpo: finalBody,
    type: normalizedType,
    category: cleanNotificationText(category, 80) || notificationDefinition(normalizedType).category,
    priority: notificationPriority(normalizedType, priority),
    channels: notificationChannels(normalizedType, channels),
    payload: {
      ...payload,
      type: normalizedType,
      url: actionUrl,
    },
    actionUrl,
    role: cleanNotificationText(role, 40),
    readAt: null,
    leida: false,
    fromRole: cleanNotificationText(source || 'system', 80),
    createdByUid: cleanNotificationText(createdByUid, 180),
  };
}
