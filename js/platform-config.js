import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { firebaseDb } from './firebase-client.js?v=20260627-domain-auth';

export const PLATFORM_CONFIG_VERSION = 'platform-config-2026-06-28';
export const PLATFORM_CONFIG_DOC_ID = 'platform';
export const PLATFORM_CONFIG_COLLECTION = 'configuracion';
export const PLATFORM_CONFIG_HISTORY_COLLECTION = 'platformConfigHistory';
export const PLATFORM_PUBLIC_CONFIG_DOC_ID = 'platformRuntime';

export const PLATFORM_CONFIG_DEFAULTS = Object.freeze({
  business: {
    currency: 'EUR',
    defaultCommissionPercent: 25,
    minimumPlatformFee: 0,
    vatPercent: 21,
    defaultFamilyHourlyRate: 24,
    defaultTeacherHourlyRate: 18,
    cancellationWindowHours: 24,
    weeklyPayoutCutoffDay: 'friday',
  },
  payments: {
    defaultPaymentDueDays: 7,
    overdueGraceHours: 24,
    paymentReminderHours: 48,
    bizumEnabled: true,
    bizumReceiverName: 'ClasesDe10',
    bizumPhone: '',
    teacherPayoutRequiresBizum: true,
    autoMarkClassPaidOnVerifiedPayment: true,
    stripeEnabled: false,
    stripeMode: 'test',
    stripeBizumEnabled: false,
  },
  finance: {
    enabled: true,
    targetMarginPct: 25,
    lowMarginAlertPct: 15,
    minimumClassProfit: 0,
    defaultClassDurationMinutes: 60,
    forecastWeeks: 4,
    projectionMonths: 12,
    overdueGraceDays: 1,
    autoDetectAnomalies: true,
    autoCreateIncidentFromAnomalies: true,
    requireClassFinancials: true,
    exportEnabled: true,
  },
  automation: {
    metricsSnapshotDelayMinutes: 5,
    incompleteRequestReviewMinutes: 60,
    staleRequestReviewMinutes: 120,
    missingClassParticipantReviewMinutes: 60,
    unpaidClassFollowupMinutes: 1440,
    classConfirmationReviewMinutes: 180,
    classCancellationReviewMinutes: 1440,
    paymentReconciliationMinutes: 1440,
    overduePaymentReviewMinutes: 120,
    documentReviewSlaMinutes: 1440,
    staleDocumentReviewMinutes: 120,
    staleIncidentReviewMinutes: 60,
    profileVerificationReviewMinutes: 1440,
    teacherReactivationMinutes: 10080,
    classConfirmationGraceMinutes: 60,
    requestStaleHours: 24,
    documentStaleHours: 48,
    incidentStaleHours: 24,
    teacherInactiveDays: 30,
    systemJobBatchLimit: 50,
    systemJobMaxAttempts: 5,
  },
  incidents: {
    enabled: true,
    autoCreateFromPayments: true,
    autoCreateFromClasses: true,
    autoCreateFromDocuments: true,
    autoCreateFromAi: true,
    urgentSlaHours: 2,
    highSlaHours: 12,
    mediumSlaHours: 24,
    lowSlaHours: 48,
    duplicateWindowHours: 72,
    rootCauseRequiredOnResolve: true,
    defaultResponsibleEmail: 'contacto.clasesde10@gmail.com',
    maxConversationMessages: 120,
    preventiveRadarEnabled: true,
    preventiveScanLimit: 1000,
    teacherNonResponseHours: 8,
    staleRequestHours: 24,
    unscheduledAssignmentHours: 48,
    chatStalledHours: 48,
    repeatedCancellationWindowDays: 30,
    repeatedCancellationThreshold: 3,
    recurrentIncidentWindowDays: 30,
    recurrentIncidentThreshold: 3,
    familyInactiveDays: 14,
    unreadHighNotificationHours: 24,
    alertPriorityEnabled: true,
    alertPriorityScanLimit: 1000,
    alertTaskScore: 55,
    alertAdminNotificationScore: 82,
    alertMaxTopAlerts: 40,
  },
  supervision: {
    enabled: true,
    scanLimit: 1000,
    automationHeartbeatHours: 12,
    queuedJobStuckHours: 2,
    processingJobStuckMinutes: 45,
    staleIncidentHours: 24,
    staleRiskHours: 12,
    autoRepairSafeIssues: true,
    autoCreateTasks: true,
    autoCreateIncidents: true,
  },
  matching: {
    maxCandidates: 5,
    minScore: 25,
    includeZeroScoreForAdmin: true,
    teacherScanLimit: 1000,
    userScanLimit: 2000,
    assignmentScanLimit: 5000,
    recomputeReadyAfterHours: 24,
    staleRequestHours: 12,
    teacherResponseSlaHours: 8,
    lowSupplyThreshold: 2,
    minReadyScore: 70,
    weights: {
      subject: 22,
      level: 10,
      modality: 10,
      location: 11,
      availability: 13,
      experience: 8,
      reputation: 10,
      capacity: 6,
      fitConfidence: 7,
      profileQuality: 3,
    },
    aiRerankEnabled: true,
  },
  ai: {
    enabled: true,
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    maxOutputTokens: 900,
    temperature: 0.15,
    cacheTtlHours: 24,
    deterministicFallback: true,
    adminAssistantEnabled: true,
    moderationEnabled: true,
    profileAssistantEnabled: true,
  },
  notifications: {
    internalEnabled: true,
    browserEnabled: true,
    pushEnabled: true,
    emailEnabled: false,
    quietHoursEnabled: false,
    quietHoursStart: '22:30',
    quietHoursEnd: '08:00',
    classReminderTitle: 'Clase programada',
    classReminderBody: 'Tienes una clase programada.',
    paymentReminderTitle: 'Pago pendiente',
    paymentReminderBody: 'Hay un pago pendiente de revisar.',
  },
  profiles: {
    teacherVerificationRequired: true,
    requireCompleteProfileBeforeAssignment: true,
    requireTeacherPhoto: true,
    requireTeacherBizum: true,
    minTeacherProfilePercent: 85,
    requireDocumentReview: true,
    familyProfileRequiredBeforeClass: false,
  },
  storage: {
    defaultBucketMode: 'firebase_storage',
    maxPrivateFileMb: 10,
    maxAdminFileMb: 50,
    allowedDocumentTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    signedUrlTtlMinutes: 15,
  },
  publicSite: {
    maintenanceMode: false,
    maintenanceMessage: 'Estamos realizando mejoras. El acceso privado sigue disponible para administracion.',
    bannerEnabled: false,
    bannerText: '',
    bannerUrl: '',
    promotionEnabled: false,
    promotionText: '',
    primaryColor: '#0f1f3d',
    accentColor: '#e8a030',
    successColor: '#16a34a',
    dangerColor: '#dc2626',
    landingCta: 'Solicitar profesor',
    seoTitleSuffix: 'ClasesDe10',
    seoDescription: 'Clases particulares personalizadas con profesores verificados.',
  },
  featureFlags: {
    googleLoginEnabled: true,
    publicTeacherSignupEnabled: true,
    publicFamilySignupEnabled: true,
    adminAiEnabled: true,
    chatEnabled: true,
    paymentsEnabled: true,
    bizumRequestsEnabled: true,
    calendarEnabled: true,
    maintenanceBypassForAdmins: true,
  },
  experimentation: {
    enabled: true,
    publicRuntimeEnabled: true,
    defaultRolloutPercent: 100,
    minimumSampleSize: 20,
    exposureOncePerSession: true,
    assignmentTtlDays: 90,
    allowAdminPreview: true,
    autoPublishActiveExperiments: true,
    conversionWindowDays: 14,
  },
  integrations: {
    firebaseProjectId: 'clasesde10-50add',
    hostingPrimaryDomain: 'clasesde10.com',
    supabaseLegacyEnabled: false,
    netlifyLegacyEnabled: false,
    stripeDashboardUrl: 'https://dashboard.stripe.com/',
    googleCalendarFutureEnabled: false,
    icalExportEnabled: true,
  },
  security: {
    auditAllAdminWrites: true,
    auditConfigChanges: true,
    allowConfigExport: true,
    requireAdminRoleForConfig: true,
    maxPublicFormSubmissionsPerHour: 10,
    spamReviewThreshold: 0.7,
  },
});

export const PLATFORM_CONFIG_SECTIONS = Object.freeze([
  {
    id: 'business',
    title: 'Negocio y precios',
    description: 'Comisiones, impuestos, tarifas de referencia y ventanas comerciales.',
    fields: [
      field('business.currency', 'Moneda', 'select', { options: ['EUR'], required: true }),
      field('business.defaultCommissionPercent', 'Comision por defecto (%)', 'number', { min: 0, max: 80, step: 0.5 }),
      field('business.minimumPlatformFee', 'Comision minima por clase', 'number', { min: 0, max: 200, step: 0.5 }),
      field('business.vatPercent', 'IVA (%)', 'number', { min: 0, max: 30, step: 0.5 }),
      field('business.defaultFamilyHourlyRate', 'Precio familia orientativo/hora', 'number', { min: 0, max: 200, step: 0.5 }),
      field('business.defaultTeacherHourlyRate', 'Importe profesor orientativo/hora', 'number', { min: 0, max: 200, step: 0.5 }),
      field('business.cancellationWindowHours', 'Ventana de cancelacion sin incidencia (h)', 'number', { min: 0, max: 168, step: 1 }),
      field('business.weeklyPayoutCutoffDay', 'Dia de cierre semanal', 'select', { options: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] }),
    ],
  },
  {
    id: 'payments',
    title: 'Pagos, Bizum y Stripe',
    description: 'Vencimientos, conciliacion, Bizum, payouts y pasarelas futuras.',
    fields: [
      field('payments.defaultPaymentDueDays', 'Dias para pagar por defecto', 'number', { min: 0, max: 60, step: 1 }),
      field('payments.overdueGraceHours', 'Margen antes de vencido (h)', 'number', { min: 0, max: 168, step: 1 }),
      field('payments.paymentReminderHours', 'Recordatorio antes de vencimiento (h)', 'number', { min: 1, max: 336, step: 1 }),
      field('payments.bizumEnabled', 'Bizum activo', 'boolean'),
      field('payments.bizumReceiverName', 'Nombre receptor Bizum', 'text', { max: 120 }),
      field('payments.bizumPhone', 'Telefono Bizum operativo', 'text', { max: 40 }),
      field('payments.teacherPayoutRequiresBizum', 'Exigir Bizum a profesores', 'boolean'),
      field('payments.autoMarkClassPaidOnVerifiedPayment', 'Marcar clase pagada al validar pago', 'boolean'),
      field('payments.stripeEnabled', 'Stripe activo', 'boolean'),
      field('payments.stripeMode', 'Modo Stripe', 'select', { options: ['test', 'live'] }),
      field('payments.stripeBizumEnabled', 'Bizum por Stripe preparado', 'boolean'),
    ],
  },
  {
    id: 'finance',
    title: 'ERP financiero',
    description: 'Margenes, previsiones, anomalías, exportacion y disciplina economica por clase.',
    fields: [
      field('finance.enabled', 'Centro financiero activo', 'boolean'),
      field('finance.targetMarginPct', 'Margen objetivo (%)', 'number', { min: 0, max: 80, step: 0.5 }),
      field('finance.lowMarginAlertPct', 'Alerta margen bajo (%)', 'number', { min: 0, max: 80, step: 0.5 }),
      field('finance.minimumClassProfit', 'Beneficio minimo por clase', 'number', { min: -200, max: 500, step: 0.5 }),
      field('finance.defaultClassDurationMinutes', 'Duracion clase por defecto (min)', 'number', { min: 15, max: 240, step: 5 }),
      field('finance.forecastWeeks', 'Semanas para prevision', 'number', { min: 1, max: 26, step: 1 }),
      field('finance.projectionMonths', 'Meses para proyeccion anual', 'number', { min: 1, max: 24, step: 1 }),
      field('finance.overdueGraceDays', 'Margen antes de vencido (dias)', 'number', { min: 0, max: 30, step: 1 }),
      field('finance.autoDetectAnomalies', 'Detectar anomalias automaticamente', 'boolean'),
      field('finance.autoCreateIncidentFromAnomalies', 'Crear incidencias por anomalias', 'boolean'),
      field('finance.requireClassFinancials', 'Exigir importes por clase', 'boolean'),
      field('finance.exportEnabled', 'Permitir exportacion financiera', 'boolean'),
    ],
  },
  {
    id: 'automation',
    title: 'Automatizaciones y SLAs',
    description: 'Tiempos de espera, recordatorios, tareas automaticas y colas.',
    fields: [
      field('automation.metricsSnapshotDelayMinutes', 'Retraso snapshot metricas (min)', 'number', { min: 0, max: 240, step: 1 }),
      field('automation.incompleteRequestReviewMinutes', 'Revisar solicitud incompleta (min)', 'number', { min: 5, max: 10080, step: 5 }),
      field('automation.staleRequestReviewMinutes', 'Resolver solicitud atascada (min)', 'number', { min: 5, max: 10080, step: 5 }),
      field('automation.unpaidClassFollowupMinutes', 'Seguimiento clase no pagada (min)', 'number', { min: 5, max: 43200, step: 5 }),
      field('automation.classConfirmationGraceMinutes', 'Margen para marcar clase (min)', 'number', { min: 0, max: 1440, step: 5 }),
      field('automation.classConfirmationReviewMinutes', 'Tarea clase sin cerrar (min)', 'number', { min: 5, max: 10080, step: 5 }),
      field('automation.paymentReconciliationMinutes', 'Conciliar pago sin clase (min)', 'number', { min: 5, max: 43200, step: 5 }),
      field('automation.overduePaymentReviewMinutes', 'Resolver pago vencido (min)', 'number', { min: 5, max: 10080, step: 5 }),
      field('automation.documentReviewSlaMinutes', 'SLA revision documento (min)', 'number', { min: 5, max: 43200, step: 5 }),
      field('automation.incidentStaleHours', 'Incidencia atascada tras (h)', 'number', { min: 1, max: 720, step: 1 }),
      field('automation.teacherInactiveDays', 'Profesor inactivo tras (dias)', 'number', { min: 1, max: 365, step: 1 }),
      field('automation.systemJobBatchLimit', 'Jobs por lote', 'number', { min: 1, max: 500, step: 1 }),
      field('automation.systemJobMaxAttempts', 'Reintentos por job', 'number', { min: 1, max: 20, step: 1 }),
    ],
  },
  {
    id: 'incidents',
    title: 'Incidencias y soporte',
    description: 'Tickets, SLAs, creacion automatica y disciplina de resolucion.',
    fields: [
      field('incidents.enabled', 'Centro de incidencias activo', 'boolean'),
      field('incidents.autoCreateFromPayments', 'Crear tickets por pagos vencidos', 'boolean'),
      field('incidents.autoCreateFromClasses', 'Crear tickets por clases sin confirmar', 'boolean'),
      field('incidents.autoCreateFromDocuments', 'Crear tickets por documentos atascados', 'boolean'),
      field('incidents.autoCreateFromAi', 'Crear tickets por errores de IA', 'boolean'),
      field('incidents.urgentSlaHours', 'SLA urgente (h)', 'number', { min: 1, max: 72, step: 1 }),
      field('incidents.highSlaHours', 'SLA alta (h)', 'number', { min: 1, max: 168, step: 1 }),
      field('incidents.mediumSlaHours', 'SLA media (h)', 'number', { min: 1, max: 336, step: 1 }),
      field('incidents.lowSlaHours', 'SLA baja (h)', 'number', { min: 1, max: 720, step: 1 }),
      field('incidents.duplicateWindowHours', 'Ventana anti duplicados (h)', 'number', { min: 1, max: 720, step: 1 }),
      field('incidents.rootCauseRequiredOnResolve', 'Exigir causa al resolver', 'boolean'),
      field('incidents.defaultResponsibleEmail', 'Responsable por defecto', 'text', { maxLength: 180 }),
      field('incidents.maxConversationMessages', 'Mensajes por ticket', 'number', { min: 10, max: 500, step: 10 }),
      field('incidents.preventiveRadarEnabled', 'Radar preventivo activo', 'boolean'),
      field('incidents.preventiveScanLimit', 'Elementos escaneados por radar', 'number', { min: 10, max: 5000, step: 10 }),
      field('incidents.teacherNonResponseHours', 'Profesor sin responder tras (h)', 'number', { min: 1, max: 720, step: 1 }),
      field('incidents.staleRequestHours', 'Solicitud sin profesor tras (h)', 'number', { min: 1, max: 1440, step: 1 }),
      field('incidents.unscheduledAssignmentHours', 'Relacion sin primera clase tras (h)', 'number', { min: 1, max: 1440, step: 1 }),
      field('incidents.chatStalledHours', 'Chat parado antes de clase tras (h)', 'number', { min: 1, max: 1440, step: 1 }),
      field('incidents.repeatedCancellationWindowDays', 'Ventana cancelaciones repetidas (dias)', 'number', { min: 1, max: 365, step: 1 }),
      field('incidents.repeatedCancellationThreshold', 'Umbral cancelaciones repetidas', 'number', { min: 2, max: 50, step: 1 }),
      field('incidents.recurrentIncidentWindowDays', 'Ventana incidencias recurrentes (dias)', 'number', { min: 1, max: 365, step: 1 }),
      field('incidents.recurrentIncidentThreshold', 'Umbral incidencias recurrentes', 'number', { min: 2, max: 50, step: 1 }),
      field('incidents.familyInactiveDays', 'Familia inactiva con solicitud (dias)', 'number', { min: 1, max: 365, step: 1 }),
      field('incidents.unreadHighNotificationHours', 'Aviso prioritario sin leer (h)', 'number', { min: 1, max: 720, step: 1 }),
      field('incidents.alertPriorityEnabled', 'Motor inteligente de prioridades', 'boolean'),
      field('incidents.alertPriorityScanLimit', 'Alertas escaneadas por motor', 'number', { min: 10, max: 5000, step: 10 }),
      field('incidents.alertTaskScore', 'Score minimo para tarea CRM', 'number', { min: 1, max: 100, step: 1 }),
      field('incidents.alertAdminNotificationScore', 'Score minimo para avisar admin', 'number', { min: 1, max: 100, step: 1 }),
      field('incidents.alertMaxTopAlerts', 'Alertas principales maximas', 'number', { min: 1, max: 200, step: 1 }),
    ],
  },
  {
    id: 'supervision',
    title: 'Autosupervision',
    description: 'Comprobaciones cruzadas entre clases, pagos, chats, jobs y automatizaciones.',
    fields: [
      field('supervision.enabled', 'Autosupervision activa', 'boolean'),
      field('supervision.scanLimit', 'Documentos escaneados por barrido', 'number', { min: 10, max: 5000, step: 10 }),
      field('supervision.automationHeartbeatHours', 'Latido maximo sin worker (h)', 'number', { min: 1, max: 168, step: 1 }),
      field('supervision.queuedJobStuckHours', 'Job en cola atascado tras (h)', 'number', { min: 1, max: 168, step: 1 }),
      field('supervision.processingJobStuckMinutes', 'Job procesando atascado tras (min)', 'number', { min: 5, max: 1440, step: 5 }),
      field('supervision.staleIncidentHours', 'Incidencia sin prioridad tras (h)', 'number', { min: 1, max: 720, step: 1 }),
      field('supervision.staleRiskHours', 'Riesgo sin prioridad tras (h)', 'number', { min: 1, max: 720, step: 1 }),
      field('supervision.autoRepairSafeIssues', 'Aplicar reparaciones seguras', 'boolean'),
      field('supervision.autoCreateTasks', 'Crear tareas CRM automaticas', 'boolean'),
      field('supervision.autoCreateIncidents', 'Crear incidencias automaticas', 'boolean'),
    ],
  },
  {
    id: 'matching',
    title: 'Matching',
    description: 'Limites, puntuacion minima y pesos del algoritmo de asignacion.',
    fields: [
      field('matching.maxCandidates', 'Candidatos maximos', 'number', { min: 1, max: 50, step: 1 }),
      field('matching.minScore', 'Score minimo automatico', 'number', { min: 0, max: 100, step: 1 }),
      field('matching.includeZeroScoreForAdmin', 'Mostrar candidatos de score bajo al admin', 'boolean'),
      field('matching.teacherScanLimit', 'Profesores escaneados', 'number', { min: 10, max: 10000, step: 10 }),
      field('matching.userScanLimit', 'Usuarios escaneados', 'number', { min: 10, max: 20000, step: 10 }),
      field('matching.assignmentScanLimit', 'Asignaciones escaneadas', 'number', { min: 10, max: 50000, step: 10 }),
      field('matching.recomputeReadyAfterHours', 'Recalcular matches listos tras horas', 'number', { min: 1, max: 168, step: 1 }),
      field('matching.staleRequestHours', 'Solicitud atascada tras horas', 'number', { min: 1, max: 720, step: 1 }),
      field('matching.teacherResponseSlaHours', 'Esperar respuesta profesor (h)', 'number', { min: 1, max: 168, step: 1 }),
      field('matching.lowSupplyThreshold', 'Umbral poca oferta', 'number', { min: 1, max: 100, step: 1 }),
      field('matching.minReadyScore', 'Score minimo listo', 'number', { min: 1, max: 100, step: 1 }),
      field('matching.aiRerankEnabled', 'Reordenacion asistida por IA', 'boolean'),
      field('matching.weights', 'Pesos del scoring', 'json'),
    ],
  },
  {
    id: 'ai',
    title: 'IA',
    description: 'Proveedor, modelo, coste, cache y usos permitidos.',
    fields: [
      field('ai.enabled', 'IA activa', 'boolean'),
      field('ai.provider', 'Proveedor IA', 'select', { options: ['gemini', 'openai', 'anthropic', 'local', 'disabled'] }),
      field('ai.model', 'Modelo', 'text', { max: 120 }),
      field('ai.maxOutputTokens', 'Tokens maximos salida', 'number', { min: 50, max: 8000, step: 50 }),
      field('ai.temperature', 'Temperatura', 'number', { min: 0, max: 2, step: 0.05 }),
      field('ai.cacheTtlHours', 'Cache respuestas (h)', 'number', { min: 0, max: 720, step: 1 }),
      field('ai.deterministicFallback', 'Fallback determinista gratuito', 'boolean'),
      field('ai.adminAssistantEnabled', 'IA admin activa', 'boolean'),
      field('ai.moderationEnabled', 'Moderacion automatica', 'boolean'),
      field('ai.profileAssistantEnabled', 'Asistente de perfiles', 'boolean'),
    ],
  },
  {
    id: 'notifications',
    title: 'Notificaciones y plantillas',
    description: 'Canales, horas silenciosas y textos automaticos editables.',
    fields: [
      field('notifications.internalEnabled', 'Notificaciones internas', 'boolean'),
      field('notifications.browserEnabled', 'Avisos navegador', 'boolean'),
      field('notifications.pushEnabled', 'Push PWA', 'boolean'),
      field('notifications.emailEnabled', 'Correo electronico', 'boolean'),
      field('notifications.quietHoursEnabled', 'Horas silenciosas', 'boolean'),
      field('notifications.quietHoursStart', 'Inicio silencio', 'time'),
      field('notifications.quietHoursEnd', 'Fin silencio', 'time'),
      field('notifications.classReminderTitle', 'Titulo recordatorio clase', 'text', { max: 120 }),
      field('notifications.classReminderBody', 'Texto recordatorio clase', 'textarea', { max: 600 }),
      field('notifications.paymentReminderTitle', 'Titulo recordatorio pago', 'text', { max: 120 }),
      field('notifications.paymentReminderBody', 'Texto recordatorio pago', 'textarea', { max: 600 }),
    ],
  },
  {
    id: 'profiles',
    title: 'Perfiles y verificacion',
    description: 'Requisitos antes de asignar profesores o activar operaciones.',
    fields: [
      field('profiles.teacherVerificationRequired', 'Verificacion obligatoria profesor', 'boolean'),
      field('profiles.requireCompleteProfileBeforeAssignment', 'Perfil completo antes de asignar', 'boolean'),
      field('profiles.requireTeacherPhoto', 'Foto obligatoria profesor', 'boolean'),
      field('profiles.requireTeacherBizum', 'Bizum obligatorio profesor', 'boolean'),
      field('profiles.minTeacherProfilePercent', 'Perfil minimo asignable (%)', 'number', { min: 0, max: 100, step: 1 }),
      field('profiles.requireDocumentReview', 'Revision documental obligatoria', 'boolean'),
      field('profiles.familyProfileRequiredBeforeClass', 'Perfil familia antes de clase', 'boolean'),
    ],
  },
  {
    id: 'storage',
    title: 'Almacenamiento',
    description: 'Tamanos, tipos permitidos y estrategia de documentos.',
    fields: [
      field('storage.defaultBucketMode', 'Proveedor documentos', 'select', { options: ['firebase_storage', 'external_private', 'disabled'] }),
      field('storage.maxPrivateFileMb', 'Maximo archivo usuario (MB)', 'number', { min: 1, max: 100, step: 1 }),
      field('storage.maxAdminFileMb', 'Maximo archivo admin (MB)', 'number', { min: 1, max: 200, step: 1 }),
      field('storage.allowedDocumentTypes', 'MIME permitidos', 'array'),
      field('storage.signedUrlTtlMinutes', 'Caducidad enlace firmado (min)', 'number', { min: 1, max: 1440, step: 1 }),
    ],
  },
  {
    id: 'publicSite',
    title: 'Web publica, SEO y marca',
    description: 'Mantenimiento visual, banners, promociones, CTA y colores.',
    fields: [
      field('publicSite.maintenanceMode', 'Modo mantenimiento publico', 'boolean'),
      field('publicSite.maintenanceMessage', 'Mensaje mantenimiento', 'textarea', { max: 500 }),
      field('publicSite.bannerEnabled', 'Banner publico activo', 'boolean'),
      field('publicSite.bannerText', 'Texto banner publico', 'textarea', { max: 300 }),
      field('publicSite.bannerUrl', 'URL banner', 'url', { max: 500 }),
      field('publicSite.promotionEnabled', 'Promocion activa', 'boolean'),
      field('publicSite.promotionText', 'Texto promocion', 'textarea', { max: 300 }),
      field('publicSite.primaryColor', 'Color principal', 'color'),
      field('publicSite.accentColor', 'Color acento', 'color'),
      field('publicSite.successColor', 'Color exito', 'color'),
      field('publicSite.dangerColor', 'Color alerta', 'color'),
      field('publicSite.landingCta', 'CTA principal', 'text', { max: 80 }),
      field('publicSite.seoTitleSuffix', 'Sufijo SEO', 'text', { max: 80 }),
      field('publicSite.seoDescription', 'Descripcion SEO base', 'textarea', { max: 320 }),
    ],
  },
  {
    id: 'featureFlags',
    title: 'Feature flags',
    description: 'Encendido o apagado operativo de modulos sin redeploy.',
    fields: [
      field('featureFlags.googleLoginEnabled', 'Login con Google', 'boolean'),
      field('featureFlags.publicTeacherSignupEnabled', 'Alta publica profesores', 'boolean'),
      field('featureFlags.publicFamilySignupEnabled', 'Alta publica familias', 'boolean'),
      field('featureFlags.adminAiEnabled', 'IA admin', 'boolean'),
      field('featureFlags.chatEnabled', 'Chat', 'boolean'),
      field('featureFlags.paymentsEnabled', 'Pagos', 'boolean'),
      field('featureFlags.bizumRequestsEnabled', 'Solicitudes Bizum', 'boolean'),
      field('featureFlags.calendarEnabled', 'Calendario', 'boolean'),
      field('featureFlags.maintenanceBypassForAdmins', 'Admins saltan mantenimiento', 'boolean'),
    ],
  },
  {
    id: 'experimentation',
    title: 'Experimentacion continua',
    description: 'Infraestructura de feature flags, A/B testing, rollouts y medicion automatica.',
    fields: [
      field('experimentation.enabled', 'Sistema de experimentacion activo', 'boolean'),
      field('experimentation.publicRuntimeEnabled', 'Runtime publico de experimentos', 'boolean'),
      field('experimentation.defaultRolloutPercent', 'Rollout por defecto (%)', 'number', { min: 0, max: 100, step: 1 }),
      field('experimentation.minimumSampleSize', 'Muestra minima por variante', 'number', { min: 1, max: 100000, step: 1 }),
      field('experimentation.exposureOncePerSession', 'Registrar exposicion una vez por sesion', 'boolean'),
      field('experimentation.assignmentTtlDays', 'Duracion asignacion sticky (dias)', 'number', { min: 1, max: 365, step: 1 }),
      field('experimentation.allowAdminPreview', 'Permitir preview a administradores', 'boolean'),
      field('experimentation.autoPublishActiveExperiments', 'Publicar automaticamente activos', 'boolean'),
      field('experimentation.conversionWindowDays', 'Ventana de conversion (dias)', 'number', { min: 1, max: 90, step: 1 }),
    ],
  },
  {
    id: 'integrations',
    title: 'Integraciones',
    description: 'Estado operativo de proveedores externos y legado.',
    fields: [
      field('integrations.firebaseProjectId', 'Firebase project id', 'text', { max: 120, readonly: true }),
      field('integrations.hostingPrimaryDomain', 'Dominio principal', 'text', { max: 180 }),
      field('integrations.supabaseLegacyEnabled', 'Supabase legado activo', 'boolean'),
      field('integrations.netlifyLegacyEnabled', 'Netlify legado activo', 'boolean'),
      field('integrations.stripeDashboardUrl', 'URL dashboard Stripe', 'url', { max: 500 }),
      field('integrations.googleCalendarFutureEnabled', 'Google Calendar preparado', 'boolean'),
      field('integrations.icalExportEnabled', 'Export iCalendar', 'boolean'),
    ],
  },
  {
    id: 'security',
    title: 'Seguridad y auditoria',
    description: 'Auditoria, limites antispam y controles de cambios.',
    fields: [
      field('security.auditAllAdminWrites', 'Auditar cambios admin', 'boolean'),
      field('security.auditConfigChanges', 'Auditar configuracion', 'boolean'),
      field('security.allowConfigExport', 'Permitir exportar JSON', 'boolean'),
      field('security.requireAdminRoleForConfig', 'Solo admin configura', 'boolean'),
      field('security.maxPublicFormSubmissionsPerHour', 'Formularios publicos/hora', 'number', { min: 1, max: 500, step: 1 }),
      field('security.spamReviewThreshold', 'Umbral revision spam', 'number', { min: 0, max: 1, step: 0.05 }),
    ],
  },
]);

function field(path, label, type, options = {}) {
  return Object.freeze({
    path,
    label,
    type,
    description: options.description || '',
    options: options.options || [],
    min: options.min,
    max: options.max,
    step: options.step,
    maxLength: options.max,
    required: options.required === true,
    readonly: options.readonly === true,
  });
}

export function cloneConfig(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function deepMerge(base = {}, override = {}) {
  const result = cloneConfig(base);
  Object.entries(override || {}).forEach(([key, value]) => {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key], value);
    } else if (value !== undefined) {
      result[key] = cloneConfig(value);
    }
  });
  return result;
}

export function getConfigValue(config, path, fallback = undefined) {
  const value = String(path || '').split('.').reduce((current, key) => (
    current === undefined || current === null ? undefined : current[key]
  ), config);
  return value === undefined || value === null || value === '' ? fallback : value;
}

export function setConfigValue(config, path, value) {
  const keys = String(path || '').split('.').filter(Boolean);
  if (!keys.length) return config;
  let current = config;
  keys.slice(0, -1).forEach((key) => {
    if (!isPlainObject(current[key])) current[key] = {};
    current = current[key];
  });
  current[keys.at(-1)] = value;
  return config;
}

export function normalizePlatformConfig(input = {}) {
  const source = input?.config && isPlainObject(input.config) ? input.config : input;
  return deepMerge(PLATFORM_CONFIG_DEFAULTS, source || {});
}

export function allPlatformConfigFields() {
  return PLATFORM_CONFIG_SECTIONS.flatMap((section) => (
    section.fields.map((item) => ({ ...item, sectionId: section.id, sectionTitle: section.title }))
  ));
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

export function flattenConfig(value = {}, prefix = '') {
  const rows = {};
  Object.entries(value || {}).forEach(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(child)) Object.assign(rows, flattenConfig(child, path));
    else rows[path] = child;
  });
  return rows;
}

export function diffPlatformConfig(before = {}, after = {}) {
  const left = flattenConfig(before);
  const right = flattenConfig(after);
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.filter((key) => stableJson(left[key]) !== stableJson(right[key])).map((key) => ({
    path: key,
    before: left[key] ?? null,
    after: right[key] ?? null,
  }));
}

export function validatePlatformConfig(config = {}) {
  const normalized = normalizePlatformConfig(config);
  const errors = [];
  allPlatformConfigFields().forEach((item) => {
    const value = getConfigValue(normalized, item.path);
    if (item.required && (value === undefined || value === null || value === '')) {
      errors.push({ path: item.path, message: `${item.label} es obligatorio.` });
    }
    if (item.type === 'number') {
      const number = Number(value);
      if (!Number.isFinite(number)) errors.push({ path: item.path, message: `${item.label} debe ser numerico.` });
      if (Number.isFinite(number) && item.min !== undefined && number < item.min) errors.push({ path: item.path, message: `${item.label} no puede ser menor que ${item.min}.` });
      if (Number.isFinite(number) && item.max !== undefined && number > item.max) errors.push({ path: item.path, message: `${item.label} no puede ser mayor que ${item.max}.` });
    }
    if (item.type === 'url' && value) {
      try {
        const parsed = new URL(String(value));
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad_protocol');
      } catch {
        errors.push({ path: item.path, message: `${item.label} debe ser una URL http(s) valida.` });
      }
    }
    if (item.type === 'color' && value && !/^#[0-9a-f]{6}$/i.test(String(value))) {
      errors.push({ path: item.path, message: `${item.label} debe ser un color hexadecimal #RRGGBB.` });
    }
    if (item.options?.length && value && !item.options.includes(value)) {
      errors.push({ path: item.path, message: `${item.label} debe ser uno de: ${item.options.join(', ')}.` });
    }
  });
  return {
    valid: errors.length === 0,
    errors,
    config: normalized,
  };
}

export function publicRuntimeFromConfig(config = {}) {
  const normalized = normalizePlatformConfig(config);
  return {
    version: PLATFORM_CONFIG_VERSION,
    maintenance: {
      enabled: normalized.publicSite.maintenanceMode === true,
      message: normalized.publicSite.maintenanceMessage || '',
      bypassForAdmins: normalized.featureFlags.maintenanceBypassForAdmins === true,
    },
    banner: {
      enabled: normalized.publicSite.bannerEnabled === true,
      text: normalized.publicSite.bannerText || '',
      url: normalized.publicSite.bannerUrl || '',
    },
    promotion: {
      enabled: normalized.publicSite.promotionEnabled === true,
      text: normalized.publicSite.promotionText || '',
    },
    brand: {
      primaryColor: normalized.publicSite.primaryColor,
      accentColor: normalized.publicSite.accentColor,
      successColor: normalized.publicSite.successColor,
      dangerColor: normalized.publicSite.dangerColor,
      landingCta: normalized.publicSite.landingCta,
    },
    featureFlags: {
      googleLoginEnabled: normalized.featureFlags.googleLoginEnabled === true,
      publicTeacherSignupEnabled: normalized.featureFlags.publicTeacherSignupEnabled === true,
      publicFamilySignupEnabled: normalized.featureFlags.publicFamilySignupEnabled === true,
      chatEnabled: normalized.featureFlags.chatEnabled === true,
      paymentsEnabled: normalized.featureFlags.paymentsEnabled === true,
      calendarEnabled: normalized.featureFlags.calendarEnabled === true,
    },
    experimentation: {
      enabled: normalized.experimentation.enabled === true,
      publicRuntimeEnabled: normalized.experimentation.publicRuntimeEnabled === true,
      defaultRolloutPercent: normalized.experimentation.defaultRolloutPercent,
      minimumSampleSize: normalized.experimentation.minimumSampleSize,
      exposureOncePerSession: normalized.experimentation.exposureOncePerSession === true,
      assignmentTtlDays: normalized.experimentation.assignmentTtlDays,
      conversionWindowDays: normalized.experimentation.conversionWindowDays,
    },
    seo: {
      titleSuffix: normalized.publicSite.seoTitleSuffix,
      description: normalized.publicSite.seoDescription,
    },
  };
}

function configRef() {
  return doc(firebaseDb, PLATFORM_CONFIG_COLLECTION, PLATFORM_CONFIG_DOC_ID);
}

export async function loadPlatformConfig() {
  const snap = await getDoc(configRef());
  const raw = snap.exists() ? snap.data() : {};
  const config = normalizePlatformConfig(raw);
  return {
    exists: snap.exists(),
    id: PLATFORM_CONFIG_DOC_ID,
    config,
    raw,
    versionNumber: Number(raw.versionNumber || 0),
    updatedAt: raw.updatedAt || null,
    updatedByEmail: raw.updatedByEmail || '',
  };
}

export async function savePlatformConfig(nextConfig, actor = {}, options = {}) {
  const current = await loadPlatformConfig().catch(() => ({
    exists: false,
    raw: {},
    config: normalizePlatformConfig(),
    versionNumber: 0,
  }));
  const normalized = normalizePlatformConfig(nextConfig);
  const validation = validatePlatformConfig(normalized);
  if (!validation.valid) {
    const error = new Error('Configuracion no valida.');
    error.validation = validation;
    throw error;
  }

  const changes = diffPlatformConfig(current.config, normalized);
  const nextVersion = Number(current.versionNumber || 0) + 1;
  const publicRuntime = publicRuntimeFromConfig(normalized);
  const actorUid = actor.uid || actor.id || actor.userUid || '';
  const actorEmail = actor.email || actor.correo || '';
  const payload = {
    id: PLATFORM_CONFIG_DOC_ID,
    schemaVersion: PLATFORM_CONFIG_VERSION,
    versionNumber: nextVersion,
    config: normalized,
    publicRuntime,
    changedFields: changes.map((item) => item.path),
    updatedByUid: actorUid,
    updatedByEmail: actorEmail,
    updatedAt: serverTimestamp(),
    updated_at: new Date().toISOString(),
  };

  await setDoc(configRef(), payload, { merge: false });
  await setDoc(doc(firebaseDb, 'configuracionPublica', PLATFORM_PUBLIC_CONFIG_DOC_ID), {
    id: PLATFORM_PUBLIC_CONFIG_DOC_ID,
    ...publicRuntime,
    sourceConfigVersion: nextVersion,
    updatedAt: serverTimestamp(),
    updated_at: new Date().toISOString(),
  }, { merge: false });

  await addDoc(collection(firebaseDb, PLATFORM_CONFIG_HISTORY_COLLECTION), {
    configId: PLATFORM_CONFIG_DOC_ID,
    schemaVersion: PLATFORM_CONFIG_VERSION,
    versionNumber: nextVersion,
    changedFields: changes.map((item) => item.path),
    changes,
    before: options.includeSnapshots === false ? null : current.config,
    after: options.includeSnapshots === false ? null : normalized,
    actorUid,
    actorEmail,
    reason: options.reason || '',
    createdAt: serverTimestamp(),
    created_at: new Date().toISOString(),
  });

  return {
    config: normalized,
    versionNumber: nextVersion,
    changes,
    publicRuntime,
  };
}

export function configSummary(config = {}) {
  const normalized = normalizePlatformConfig(config);
  const flat = flattenConfig(normalized);
  const enabledFlags = Object.entries(normalized.featureFlags || {}).filter(([, value]) => value === true).length;
  return {
    sections: PLATFORM_CONFIG_SECTIONS.length,
    fields: allPlatformConfigFields().length,
    enabledFlags,
    maintenanceMode: normalized.publicSite.maintenanceMode === true,
    commissionPercent: normalized.business.defaultCommissionPercent,
    paymentDueDays: normalized.payments.defaultPaymentDueDays,
    maxCandidates: normalized.matching.maxCandidates,
    aiEnabled: normalized.ai.enabled === true,
    configuredValues: Object.keys(flat).length,
  };
}
