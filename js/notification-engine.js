/**
 * ClasesDe10 - notification engine.
 *
 * Pure helpers shared by UI/tests to keep notification types, channels and
 * settings consistent across chat, automations and Cloud Functions.
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
  CLASS_UNMARKED_AFTER_1H: 'class_unmarked_after_1h',
  CLASS_SCHEDULE_CHANGE: 'class_schedule_change',
  CLASS_INCIDENT: 'class_incident',
  WEEKLY_PAYMENT_DUE: 'weekly_payment_due',
  FAMILY_PAYMENT_PENDING: 'family_payment_pending',
  TEACHER_PAYOUT_PENDING: 'teacher_payout_pending',
  PAYMENT_OVERDUE: 'payment_overdue',
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
  PROFILE_UPDATED: 'profile_updated',
  CONTACT_LEAD: 'contact_lead',
  TEACHER_LEAD: 'teacher_lead',
  FAMILY_LEAD_REQUEST: 'family_lead_request',
  MONTHLY_SUMMARY: 'monthly_summary',
  AUTOMATION: 'automation',
});

export const NOTIFICATION_EVENT_DEFINITIONS = Object.freeze({
  [NOTIFICATION_EVENTS.ADMIN_MANUAL]: {
    label: 'Aviso admin',
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
  [NOTIFICATION_EVENTS.REQUEST_CREATED]: {
    label: 'Solicitud',
    category: 'solicitudes',
    priority: 'high',
    channels: ['internal', 'browser', 'push'],
  },
  [NOTIFICATION_EVENTS.MATCHING_READY]: {
    label: 'Matching',
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
    label: 'Matching activo',
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
  [NOTIFICATION_EVENTS.PROFILE_UPDATED]: {
    label: 'Perfil',
    category: 'perfil',
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
  const priority = notificationPriority(notification.type, notification.priority);
  if (priority === 'critical') return 'critica';
  if (priority === 'high') return 'alta';
  return 'normal';
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
