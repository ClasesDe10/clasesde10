#!/usr/bin/env node

import admin from 'firebase-admin';
import { createRequire } from 'node:module';
import {
  CLASS_LIFECYCLE_VERSION,
  buildClassLifecycleTransition,
  buildRequestLifecyclePatch,
} from '../js/class-lifecycle-engine.js';
import {
  AI_FEATURES_VERSION,
  MATCHING_VERSION,
  buildActiveMatchingPlan,
  buildFamilyRequestBrief,
  buildMatchingAiPrompt,
  buildMatchingDecisionSupport,
  buildTeacherMatchingSignals,
  buildTeacherProfileRecommendations,
  classifyIncident,
  getRequestProfile as getMatchingRequestProfile,
  mergeAiRanking as mergeProfessionalAiRanking,
  moderateContent,
  rankTeachersForRequest,
} from '../js/ai-engine.js';
import {
  buildFamilyTrustProfile,
  buildTeacherTrustProfile,
  buildTrustSnapshotPatch,
} from '../js/trust-engine.js';
import { buildRelationshipsFromCollections } from '../js/relationship-engine.js';
import {
  RELATIONSHIP_FOLLOWUP_VERSION,
  buildRelationshipFollowupPlan,
} from '../js/relationship-followup-engine.js';
import {
  PROACTIVE_ASSIST_VERSION,
  buildProactiveAssistPlan,
} from '../js/proactive-assist-engine.js';
import {
  INTERNAL_AI_ASSISTANT_VERSION,
  buildInternalAiAssistantPlan,
} from '../js/internal-ai-assistant-engine.js';
import {
  SCHEDULED_CLASS_STATUSES,
  buildClassIncidentPayload,
  classEnded,
  classReminderWindows,
  getClassAttendanceSummary,
  isScheduledClassStatus,
  normalizeClassStatus,
} from '../js/calendar-engine.js';
import {
  buildAlertPriorityPlan,
  buildAutomaticIncidentPayload,
  buildPreventiveIncidentPlan,
  normalizeIncidentPriority,
  incidentPriorityMeta,
} from '../js/incident-engine.js';
import {
  buildPlatformSupervisionPlan,
  PLATFORM_SUPERVISION_VERSION,
} from '../js/platform-supervision-engine.js';
import {
  OPEN_PAYMENT_STATUSES,
  PAID_PAYMENT_STATUSES,
  buildClassPaymentPatch,
  buildFamilyPaymentAccessPatch,
  buildFamilyPaymentAccessState,
  buildPaymentValidationPayload,
  isFamilyPayment,
  isPaymentOverdue,
  isPaymentVerified,
  isTeacherPayout,
  classFamilyPaymentState,
  matchPaymentToClasses,
  normalizePaymentStatus,
  paymentAmount,
  weeklyPaymentDueAtForClass,
} from '../js/payment-engine.js';
import {
  FINANCE_ERP_VERSION,
  buildFinanceErpReport,
} from '../js/finance-erp-engine.js';
import {
  ANALYTICS_ENGINE_VERSION,
  buildAnalyticsReport,
} from '../js/analytics-engine.js';
import {
  EXPERIMENTATION_ENGINE_VERSION,
  buildExperimentResults,
} from '../js/experimentation-engine.js';
import {
  buildNotificationDocument,
  inferNotificationRole,
  isNotificationEnabled,
  minimalUserNotificationCopy,
  safeInternalActionUrl,
  shouldCreateUserFacingNotification,
  userFacingNotificationDedupeKey,
} from '../js/notification-engine.js';
import {
  buildDocumentExpiryPatch,
  normalizeDocumentRecord,
  shouldSendExpiryReminder,
} from '../js/document-center-engine.js';
import { normalizeEntityForWrite } from '../js/data-schema.js';
import {
  CLASS_RESET_GENERATION,
  classResetWriteFields,
  filterAfterClassReset,
  isAfterClassReset,
} from '../js/class-reset.js';

const require = createRequire(import.meta.url);
const {
  AUTOMATION_ORCHESTRATION_VERSION,
  buildAutomationPlan,
} = require('../functions/platform-automation-engine.js');

const DEFAULT_PROJECT_ID = 'clasesde10-50add';
const ADMIN_EMAIL = 'contacto.clasesde10@gmail.com';
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const selfTest = args.has('--self-test');
const trustOnly = args.has('--trust-only');
const criticalOnly = args.has('--critical') || lower(process.env.AUTOMATION_MODE) === 'critical';
const allowQuotaExhaustedExit = lower(process.env.ALLOW_QUOTA_EXHAUSTED) === 'true';
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = Number(limitArg?.split('=')[1] || process.env.AUTOMATION_LIMIT || 50);
const trustContextLimit = Math.max(1, Number(process.env.TRUST_CONTEXT_LIMIT || 2000));
const matchingTeacherScanLimit = Math.max(1, Number(process.env.MATCHING_TEACHER_SCAN_LIMIT || 1000));
const matchingUserScanLimit = Math.max(1, Number(process.env.MATCHING_USER_SCAN_LIMIT || 2000));
const matchingAssignmentScanLimit = Math.max(1, Number(process.env.MATCHING_ASSIGNMENT_SCAN_LIMIT || 5000));
const systemJobLimit = Math.max(1, Number(process.env.SYSTEM_JOB_LIMIT || 50));
const systemJobLeaseMs = 10 * 60 * 1000;
const systemJobMaxBackoffMs = 60 * 60 * 1000;
const MAINTENANCE_HEALTH_VERSION = 'maintenance-health-2026-07-01';
const CLASS_UNMARKED_PENALTY_POINTS = -2;
const PAYMENT_PROOF_OVERDUE_PENALTY_POINTS = -2;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PAYMENT_OVERDUE_ESCALATION_VERSION = 'payment-overdue-escalation-2026-07-05';
const PAYMENT_OVERDUE_ESCALATION_STEPS = Object.freeze([
  {
    key: 'due_48h',
    minDueDays: 2,
    noticeNumber: 1,
    type: 'payment_overdue',
    title: 'Justificante vencido',
    adminTitle: 'Justificante vencido',
    penaltyPoints: PAYMENT_PROOF_OVERDUE_PENALTY_POINTS,
    status: 'overdue_detected',
  },
  {
    key: 'reminder_day_5',
    minDueDays: 5,
    noticeNumber: 2,
    type: 'payment_overdue_reminder',
    title: 'Recordatorio de pago pendiente',
    adminTitle: 'Segundo aviso de pago pendiente',
    penaltyPoints: -1,
    status: 'reminder_sent',
  },
  {
    key: 'reminder_day_8',
    minDueDays: 8,
    noticeNumber: 3,
    type: 'payment_overdue_reminder',
    title: 'Seguimos pendientes del justificante',
    adminTitle: 'Tercer aviso de pago pendiente',
    penaltyPoints: -1,
    status: 'reminder_sent',
  },
  {
    key: 'reminder_day_11',
    minDueDays: 11,
    noticeNumber: 4,
    type: 'payment_overdue_reminder',
    title: 'Pago pendiente: revisalo cuando puedas',
    adminTitle: 'Cuarto aviso de pago pendiente',
    penaltyPoints: -1,
    status: 'reminder_sent',
  },
  {
    key: 'teacher_pause_risk_day_15',
    minDueDays: 15,
    noticeNumber: 5,
    type: 'payment_teacher_pause_warning',
    title: 'Aviso importante sobre tus clases',
    adminTitle: 'Riesgo de pausa por impago',
    penaltyPoints: -3,
    status: 'teacher_pause_warning_sent',
    finalWarning: true,
  },
]);
let automationRulesCache = { expiresAt: 0, rules: [] };
let platformConfigCache = { expiresAt: 0, config: {} };
let platformConfigRuntime = {};
let workerNotificationSettingsCache = { expiresAt: 0, settings: null };

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

const WORKER_GENERIC_PERSON_LABELS = new Set([
  'profesor',
  'profesora',
  'profesor/a',
  'profesor asignado',
  'profesor sin nombre',
  'docente',
  'alumno',
  'alumna',
  'alumno/a',
  'alumno sin nombre',
  'alumno/a sin nombre',
  'estudiante',
  'familia',
  'familia sin nombre',
  'sin nombre',
  'sin profesor',
  'contacto',
  'la otra persona',
  'el profesor',
  'la familia',
]);

function workerPersonKey(value) {
  return clean(value, 180)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function isGenericWorkerPersonLabel(value) {
  const key = workerPersonKey(value);
  if (!key || WORKER_GENERIC_PERSON_LABELS.has(key)) return true;
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

function workerPersonFallback(role, id = '') {
  const label = clean(role, 40) || 'Persona';
  return `${label} pendiente de nombre`;
}

function workerPersonName(role, id = '', ...values) {
  for (const value of values) {
    const candidate = clean(value, 180);
    if (candidate && !isGenericWorkerPersonLabel(candidate)) return candidate;
  }
  return workerPersonFallback(role, id);
}

function lower(value) {
  return clean(value).toLowerCase();
}

function configValue(config, path, fallback = undefined) {
  const value = String(path || '').split('.').reduce((current, key) => (
    current === undefined || current === null ? undefined : current[key]
  ), config);
  return value === undefined || value === null || value === '' ? fallback : value;
}

function runtimeNumber(path, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(configValue(platformConfigRuntime, path, fallback));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function runtimeBoolean(path, fallback = false) {
  const value = configValue(platformConfigRuntime, path, fallback);
  if (typeof value === 'boolean') return value;
  const normalized = lower(value);
  if (['true', '1', 'yes', 'si', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return Boolean(fallback);
}

function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item)).filter(Boolean);
  return clean(value)
    .split(/[,;/+|]|\sy\s/i)
    .map((item) => clean(item))
    .filter(Boolean);
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function tokenize(value) {
  return lower(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((item) => item.length > 2);
}

function textFromValues(...values) {
  return values.flatMap((value) => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.values(value);
    return [value];
  }).map((value) => clean(value, 1000)).filter(Boolean).join(' ');
}

function now() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function isoNow() {
  return new Date().toISOString();
}

function initFirebaseAdmin() {
  if (admin.apps.length) return;

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || DEFAULT_PROJECT_ID;
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const rawBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (rawJson || rawBase64) {
    try {
      const decoded = rawJson || Buffer.from(rawBase64, 'base64').toString('utf8');
      const credential = admin.credential.cert(JSON.parse(decoded));
      admin.initializeApp({ credential, projectId });
    } catch (error) {
      throw new Error(`Invalid Firebase service account configuration: ${error.message}`);
    }
    return;
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });
}

function normalizeStatus(data) {
  return lower(data.status || data.estado || data.estado_verificacion || data.verificationStatus);
}

function getUserName(user) {
  return [user?.nombre, user?.apellidos].filter(Boolean).join(' ').trim() || user?.email || '';
}

function calculateTeacherPrice(data) {
  let base = 15;
  const education = lower([data.titulacion, data.nivel_estudios, data.universidad, data.bio].join(' '));
  if (education.includes('doctor') || education.includes('master') || education.includes('master')) base += 8;
  else if (education.includes('grado') || education.includes('licenci') || education.includes('ingenier') || education.includes('universidad')) base += 5;
  else if (education.includes('fp') || education.includes('modulo')) base += 2;

  const experienceText = lower([data.experiencia, data.anios, data.bio].join(' '));
  const years = Number(experienceText.match(/\d+/)?.[0] || 0);
  if (years >= 5) base += 6;
  else if (years >= 3) base += 4;
  else if (years >= 1) base += 2;

  const subjects = lower([data.materias, data.materia].flat().join(' '));
  if (/(matematic|mates|fisica|quimica)/.test(subjects)) base += 3;
  return Math.round(base * 2) / 2;
}

function teacherDiagnostic(data, price) {
  const subjects = asArray(data.materias || data.materia).join(', ') || 'Sin materias';
  const levels = asArray(data.niveles_educativos || data.niveles || data.nivel).join(', ') || 'Sin niveles';
  const zone = clean(data.zona || data.ciudad || data.metadata?.zona) || 'Sin zona';
  const modality = clean(data.modalidad || data.metadata?.modalidad) || 'Sin modalidad';
  const warnings = [];
  if (subjects === 'Sin materias') warnings.push('Faltan materias.');
  if (levels === 'Sin niveles') warnings.push('Faltan niveles.');
  if (!clean(data.experiencia || data.bio || data.metadata?.anios)) warnings.push('Falta experiencia declarada.');
  return {
    summary: `Materias: ${subjects}. Niveles: ${levels}. Modalidad: ${modality}. Zona: ${zone}. Precio sugerido: ${price} EUR/h.`,
    warnings,
  };
}

function studentDiagnostic(data) {
  const subject = clean(data.materia || data.materias || data.metadata?.materia || data.metadata?.materias) || 'Sin materia';
  const level = clean(data.nivel || data.curso || data.metadata?.nivel) || 'Sin nivel';
  const modality = clean(data.modalidad || data.metadata?.modalidad) || 'Sin modalidad';
  const zone = clean(data.zona || data.metadata?.zona) || 'Sin zona';
  const studentName = workerPersonName('Alumno', data.studentId || data.alumno_id, data.alumno, data.metadata?.alumno, data.studentName);
  return {
    summary: `Alumno: ${studentName}. Nivel: ${level}. Materia: ${subject}. Modalidad: ${modality}. Zona: ${zone}.`,
    missing: [
      subject === 'Sin materia' ? 'materia' : '',
      level === 'Sin nivel' ? 'nivel' : '',
      zone === 'Sin zona' ? 'zona' : '',
    ].filter(Boolean),
  };
}

function leadToPublicRequest(leadId, lead) {
  const metadata = lead.metadata || {};
  const subject = clean(metadata.materia || metadata.materias || lead.asunto || lead.mensaje, 180);
  const studentName = clean(metadata.alumno || lead.alumno || '', 160);
  return {
    source: 'publicLead',
    publicLeadId: leadId,
    estado: 'nueva',
    status: 'nueva',
    materia: subject,
    nivel: clean(metadata.nivel || metadata.niveles, 120),
    modalidad: clean(metadata.modalidad, 120),
    zona: clean(metadata.zona, 180),
    preferencia_horario: clean(metadata.disponibilidad || metadata.frecuencia || metadata.inicio, 300),
    observaciones: clean(lead.mensaje, 2000),
    familySnapshot: {
      nombre: clean(lead.nombre, 160),
      email: clean(lead.email, 254).toLowerCase(),
      telefono: clean(lead.telefono, 40),
    },
    studentSnapshot: {
      nombre: studentName,
      nivel: clean(metadata.nivel || metadata.niveles, 120),
    },
    matchStatus: 'pending',
    lifecycleStatus: 'solicitud_enviada',
    lifecycleVersion: CLASS_LIFECYCLE_VERSION,
    lifecycleUpdatedAt: isoNow(),
    lifecycleTimestamps: {
      solicitud_enviada: isoNow(),
    },
    createdAt: now(),
    updatedAt: now(),
    created_at: isoNow(),
    updated_at: isoNow(),
  };
}

async function getAdminUsers(db) {
  const snap = await db.collection('users').where('role', '==', 'admin').get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function notifyAdmins(db, title, body, payload = {}) {
  const admins = await getAdminUsers(db);
  if (!admins.length) {
    await addAutomationEvent(db, {
      type: 'admin_notification_missing_recipient',
      title,
      body,
      payload,
      adminEmail: ADMIN_EMAIL,
    });
    return;
  }

  const key = adminNotificationDedupeKey(title, payload);
  await Promise.all(admins.map((user) => notifyUserOnce(db, user.id, title, body, payload, `${key}_${user.id}`)));
}

function notificationId(...parts) {
  return parts
    .map((part) => clean(part, 180).toLowerCase().replace(/[^a-z0-9_-]+/g, '_'))
    .filter(Boolean)
    .join('__')
    .slice(0, 900);
}

function adminNotificationDedupeKey(title, payload = {}) {
  const entity = payload.leadId
    || payload.requestId
    || payload.assignmentId
    || payload.classId
    || payload.paymentId
    || payload.documentId
    || payload.incidentId
    || payload.month
    || payload.runId
    || payload.id
    || new Date().toISOString().slice(0, 10);
  return notificationId(payload.type || 'admin_notification', entity, title);
}

async function notifyUserOnce(db, userUid, title, body, payload = {}, key = '', extra = {}) {
  const targetUid = clean(userUid, 180);
  if (!targetUid) return false;

  const type = payload.type || extra.type || 'automation';
  const role = inferNotificationRole({ role: extra.role, payload, key });
  const priority = extra.priority || payload.priority || '';
  if (!shouldCreateUserFacingNotification({ type, role, priority, payload })) return false;

  const copy = minimalUserNotificationCopy({ title, body, type, role, payload });
  const policyKey = userFacingNotificationDedupeKey({
    type,
    role,
    payload,
    key,
    nowIso: isoNow(),
  });
  const id = notificationId('auto', policyKey || key || payload.type || 'notification', targetUid);
  const ref = db.collection('notificaciones').doc(id);
  const existing = await ref.get();
  if (existing.exists) return false;

  await writeDoc(db.collection('notificaciones'), id, {
    ...buildNotificationDocument({
      userUid: targetUid,
      title: copy.title,
      body: copy.body,
      type,
      payload,
      role,
      priority,
      source: extra.source || 'admin',
    }),
    readAt: null,
    leida: false,
    fromRole: extra.fromRole || 'admin',
    fromAutomation: true,
    createdAt: now(),
    updatedAt: now(),
  }, { merge: false });
  return true;
}

async function notifyAdminsOnce(db, title, body, payload = {}, key = '') {
  const admins = await getAdminUsers(db);
  if (!admins.length) {
    await addAutomationEvent(db, {
      type: 'admin_notification_missing_recipient',
      title,
      body,
      payload,
      adminEmail: ADMIN_EMAIL,
    });
    return 0;
  }

  const writes = await Promise.all(admins.map((user) => notifyUserOnce(db, user.id, title, body, payload, `${key || payload.type}_${user.id}`)));
  return writes.filter(Boolean).length;
}

async function loadWorkerNotificationSettings(db) {
  if (workerNotificationSettingsCache.settings && workerNotificationSettingsCache.expiresAt > Date.now()) {
    return workerNotificationSettingsCache.settings;
  }
  const snap = await db.collection('configuracion').doc('notificaciones').get().catch(() => null);
  const settings = snap?.exists ? snap.data() : {};
  workerNotificationSettingsCache = { expiresAt: Date.now() + 5 * 60 * 1000, settings };
  return settings;
}

async function getPushTokensForUser(db, userUid) {
  const targetUid = clean(userUid, 180);
  if (!targetUid) return [];
  const snap = await db.collection('notificationTokens')
    .where('userUid', '==', targetUid)
    .where('active', '==', true)
    .limit(20)
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((item) => clean(item.token, 2000));
}

async function deactivateInvalidPushTokens(db, tokens, responses = []) {
  const invalidCodes = new Set([
    'messaging/invalid-registration-token',
    'messaging/registration-token-not-registered',
    'messaging/invalid-argument',
  ]);
  const batch = db.batch();
  let count = 0;
  responses.forEach((response, index) => {
    if (response.success) return;
    if (!invalidCodes.has(response.error?.code)) return;
    const tokenDoc = tokens[index];
    if (!tokenDoc?.id) return;
    batch.set(db.collection('notificationTokens').doc(tokenDoc.id), {
      active: false,
      deactivatedAt: now(),
      deactivationReason: response.error.code,
      updatedAt: now(),
    }, { merge: true });
    count += 1;
  });
  if (count && !dryRun) await batch.commit();
  return count;
}

function notificationNeedsPush(notification = {}) {
  const channels = Array.isArray(notification.channels) ? notification.channels : [];
  if (!channels.includes('push')) return false;
  if (notification.push?.attemptedAt || notification.push?.skippedAt) return false;
  if (notification.readAt || notification.leida === true) return false;
  return Boolean(clean(notification.userUid || notification.usuario_id, 180));
}

async function sendPushForNotificationWorker(db, notificationId, notification, stats = {}) {
  const userUid = clean(notification.userUid || notification.usuario_id, 180);
  if (!userUid) return { sent: 0, failed: 0, skipped: 'missing_user' };

  const settings = await loadWorkerNotificationSettings(db);
  const type = clean(notification.type || notification.payload?.type || 'automation', 80);
  const role = clean(notification.role || '', 40);
  if (!isNotificationEnabled(settings, type, 'push', role)) {
    await writeDoc(db.collection('notificaciones'), notificationId, {
      push: {
        skippedAt: now(),
        skippedReason: 'push_disabled_by_settings',
      },
      updatedAt: now(),
    });
    stats.pushNotificationsSkipped += 1;
    return { sent: 0, failed: 0, skipped: 'push_disabled_by_settings' };
  }

  const tokens = await getPushTokensForUser(db, userUid);
  if (!tokens.length) {
    await writeDoc(db.collection('notificaciones'), notificationId, {
      push: {
        skippedAt: now(),
        skippedReason: 'no_tokens',
      },
      updatedAt: now(),
    });
    stats.pushNotificationsSkipped += 1;
    return { sent: 0, failed: 0, skipped: 'no_tokens' };
  }

  const actionUrl = safeInternalActionUrl(notification.actionUrl || notification.payload?.url || '/pages/login.html');
  const message = {
    tokens: tokens.map((item) => item.token),
    notification: {
      title: clean(notification.title || notification.titulo || 'ClasesDe10', 140),
      body: clean(notification.body || notification.cuerpo || '', 800),
    },
    data: {
      notificationId,
      type,
      url: actionUrl,
    },
    webpush: {
      fcmOptions: { link: actionUrl },
      notification: {
        icon: 'https://clasesde10.com/assets/img/logo-192.png',
        badge: 'https://clasesde10.com/assets/img/logo-192.png',
        tag: notificationId,
        renotify: true,
        requireInteraction: clean(notification.priority, 40) === 'critical',
      },
    },
  };

  if (dryRun) {
    stats.pushNotificationsSent += tokens.length;
    return { sent: tokens.length, failed: 0, dryRun: true };
  }

  const response = await admin.messaging().sendEachForMulticast(message);
  await deactivateInvalidPushTokens(db, tokens, response.responses);
  await writeDoc(db.collection('notificaciones'), notificationId, {
    push: {
      attemptedAt: now(),
      successCount: response.successCount,
      failureCount: response.failureCount,
      tokenCount: tokens.length,
      delivery: 'github_actions_worker',
    },
    updatedAt: now(),
  });
  stats.pushNotificationsSent += response.successCount;
  stats.pushNotificationsFailed += response.failureCount;
  return { sent: response.successCount, failed: response.failureCount };
}

async function processPendingPushNotifications(db, stats) {
  const scanLimit = runtimeNumber('automation.pushNotificationBatchLimit', Number(process.env.PUSH_NOTIFICATION_LIMIT || 50), 1, 200);
  const notifications = await listRecentCollection(db, 'notificaciones', scanLimit, 'createdAt');
  for (const notification of notifications.filter(notificationNeedsPush)) {
    stats.pushNotificationsChecked += 1;
    try {
      await sendPushForNotificationWorker(db, notification.id, notification, stats);
    } catch (error) {
      stats.pushNotificationsFailed += 1;
      await writeDoc(db.collection('notificaciones'), notification.id, {
        push: {
          attemptedAt: now(),
          failureCount: 1,
          lastError: serializeJobError(error),
          delivery: 'github_actions_worker',
        },
        updatedAt: now(),
      });
    }
  }
}

async function addAutomationEvent(db, payload) {
  await writeDoc(db.collection('automationEvents'), null, {
    ...payload,
    worker: 'github-actions',
    dryRun,
    createdAt: now(),
  });
}

function workerJobPriority(priority) {
  const numeric = Number(priority);
  if (Number.isFinite(numeric)) return Math.max(0, Math.min(100, Math.round(numeric)));
  const value = lower(priority);
  if (value === 'critical') return 100;
  if (value === 'high') return 75;
  if (value === 'low') return 25;
  return 50;
}

function normalizeWorkerJobStatus(status) {
  const value = lower(status || 'queued');
  if (['dead_letter', 'dead-letter', 'failed_permanently'].includes(value)) return 'dead_letter';
  if (['cancelled', 'canceled'].includes(value)) return 'cancelled';
  if (['completed', 'done', 'success'].includes(value)) return 'completed';
  if (['processing', 'running', 'leased'].includes(value)) return 'processing';
  return 'queued';
}

function workerTimestampAfter(ms) {
  return admin.firestore.Timestamp.fromDate(new Date(Date.now() + ms));
}

function workerJobRunAt(data = {}) {
  return dateFromFirestore(data.runAt) || new Date(0);
}

function workerJobLeaseExpired(data = {}, nowMs = Date.now()) {
  const leaseUntil = dateFromFirestore(data.leaseUntil);
  if (leaseUntil) return leaseUntil.getTime() <= nowMs;
  const startedAt = dateFromFirestore(data.startedAt || data.updatedAt);
  return Boolean(startedAt && nowMs - startedAt.getTime() >= systemJobLeaseMs);
}

async function enqueueWorkerSystemJob(db, job, sourceEventType) {
  const id = notificationId('system_job', job.type, job.idempotencyKey || job.id);
  const ref = db.collection('systemJobs').doc(id);
  const existing = await ref.get();
  if (existing.exists && !['dead_letter', 'cancelled'].includes(normalizeWorkerJobStatus(existing.data().status))) {
    return false;
  }

  await writeDoc(db.collection('systemJobs'), id, {
    type: job.type,
    payload: job.payload || {},
    status: 'queued',
    priority: workerJobPriority(job.priority),
    runAt: workerTimestampAfter(Math.max(0, Number(job.runAfterMinutes || 0)) * 60 * 1000),
    attempts: 0,
    maxAttempts: Math.max(1, Number(job.maxAttempts || 5)),
    idempotencyKey: clean(job.idempotencyKey || job.id, 300),
    source: `github_actions.${sourceEventType || 'platform_automation'}`,
    version: AUTOMATION_ORCHESTRATION_VERSION,
    createdAt: now(),
    updatedAt: now(),
  }, { merge: false });
  return true;
}

async function loadWorkerAutomationRules(db) {
  if (Date.now() < automationRulesCache.expiresAt) return automationRulesCache.rules;
  try {
    const snap = await db.collection('automationRules').limit(500).get();
    automationRulesCache = {
      expiresAt: Date.now() + 5 * 60 * 1000,
      rules: snap.docs.map((doc) => ({ id: doc.id, ...doc.data(), source: 'firestore' })),
    };
  } catch (error) {
    console.warn('Could not load automationRules; default rules will be used.', error?.message || error);
    automationRulesCache = { expiresAt: Date.now() + 60 * 1000, rules: [] };
  }
  return automationRulesCache.rules;
}

async function loadWorkerPlatformConfig(db) {
  if (Date.now() < platformConfigCache.expiresAt) return platformConfigCache.config;
  try {
    const snap = await db.collection('configuracion').doc('platform').get();
    platformConfigCache = {
      expiresAt: Date.now() + 60 * 1000,
      config: snap.exists ? (snap.data().config || {}) : {},
    };
  } catch (error) {
    console.warn('Could not load platform configuration; defaults will be used.', error?.message || error);
    platformConfigCache = { expiresAt: Date.now() + 60 * 1000, config: {} };
  }
  return platformConfigCache.config;
}

async function materializeWorkerAutomationPlan(db, event, stats) {
  const [rules, platformConfig] = await Promise.all([
    loadWorkerAutomationRules(db),
    loadWorkerPlatformConfig(db),
  ]);
  const plan = buildAutomationPlan({
    ...event,
    source: event.source || 'github_actions_worker',
  }, { rules, config: platformConfig });
  stats.platformAutomationPlans += 1;
  stats.platformRuleRunsEvaluated += plan.ruleRuns.length;

  for (const item of plan.automationEvents) {
    const ref = db.collection('automationEvents').doc(item.id);
    const existing = await ref.get();
    if (existing.exists) continue;
    await writeDoc(db.collection('automationEvents'), item.id, {
      ...item,
      worker: 'github-actions',
      dryRun,
      createdAt: now(),
      updatedAt: now(),
    }, { merge: false });
    stats.platformAutomationEvents += 1;
  }

  for (const notification of plan.notifications) {
    const payload = notification.payload || { type: notification.type || 'automation' };
    if (notification.userUid) {
      const created = await notifyUserOnce(db, notification.userUid, notification.title, notification.body, payload, notification.id, {
        role: notification.role || notification.targetRole || '',
        priority: notification.priority || '',
        fromRole: 'automation',
        source: 'automation',
      });
      if (created) stats.platformNotificationsCreated += 1;
      continue;
    }
    if (notification.targetRole === 'admin' || notification.role === 'admin') {
      stats.platformNotificationsCreated += await notifyAdminsOnce(db, notification.title, notification.body, payload, notification.id);
    }
  }

  for (const job of plan.systemJobs) {
    const created = await enqueueWorkerSystemJob(db, job, plan.event.type);
    if (created) stats.platformSystemJobsQueued += 1;
  }

  for (const audit of plan.auditLogs) {
    const ref = db.collection('auditLogs').doc(audit.id);
    const existing = await ref.get();
    if (existing.exists) continue;
    await writeDoc(db.collection('auditLogs'), audit.id, {
      schemaVersion: audit.schemaVersion || 'audit_log_v1',
      module: audit.module || 'automation',
      severity: audit.severity || 'info',
      origin: audit.origin || 'github_actions_worker',
      source: audit.source || 'platform_automation',
      actorUid: audit.actorUid || 'system',
      actorEmail: audit.actorEmail || '',
      actorRole: audit.actorRole || 'system',
      actorType: audit.actorType || 'automation',
      responsibleUid: audit.responsibleUid || audit.actorUid || 'system',
      responsibleEmail: audit.responsibleEmail || audit.actorEmail || '',
      action: audit.action,
      entityType: audit.entityType,
      entityId: audit.entityId || null,
      description: audit.description || audit.action,
      before: audit.before || null,
      after: audit.after || null,
      changes: audit.changes || [],
      metadata: audit.metadata || {},
      context: audit.context || {},
      error: audit.error || null,
      createdAt: now(),
      created_at: isoNow(),
      updatedAt: now(),
    }, { merge: false });
    stats.platformAuditLogsCreated += 1;
  }

  for (const run of plan.ruleRuns) {
    const ref = db.collection('automationRuleRuns').doc(run.id);
    const existing = await ref.get();
    if (existing.exists) continue;
    await writeDoc(db.collection('automationRuleRuns'), run.id, {
      ...run,
      source: 'github_actions_platform_automation',
      createdAt: now(),
      updatedAt: now(),
    }, { merge: false });
    stats.platformRuleRunsCreated += 1;
  }

  for (const task of plan.crmTasks) {
    const ref = db.collection('crmTasks').doc(task.id);
    const existing = await ref.get();
    if (existing.exists) continue;
    await writeDoc(db.collection('crmTasks'), task.id, {
      ...task,
      dueAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + Math.max(0, Number(task.dueAfterMinutes || 0)) * 60 * 1000)),
      source: 'github_actions_platform_automation',
      version: AUTOMATION_ORCHESTRATION_VERSION,
      createdAt: now(),
      updatedAt: now(),
    }, { merge: false });
    stats.platformCrmTasksCreated += 1;
  }

  for (const alert of plan.opsAlerts) {
    const ref = db.collection('opsAlerts').doc(alert.id);
    const existing = await ref.get();
    if (existing.exists) continue;
    await writeDoc(db.collection('opsAlerts'), alert.id, {
      ...alert,
      source: 'github_actions_platform_automation',
      version: AUTOMATION_ORCHESTRATION_VERSION,
      createdAt: now(),
      updatedAt: now(),
    }, { merge: false });
    stats.platformOpsAlertsCreated += 1;
  }

  for (const patch of plan.patches) {
    await writeDoc(db.collection(patch.collection), patch.docId, {
      ...patch.data,
      updatedAt: now(),
    });
    stats.platformPatchesApplied += 1;
  }
}

async function listCollection(db, collectionName, maxDocs = trustContextLimit) {
  const ref = collectionName === 'clases'
    ? db.collection(collectionName).where('classResetGeneration', '==', CLASS_RESET_GENERATION)
    : db.collection(collectionName);
  const snap = await ref.limit(maxDocs).get();
  const rows = snap.docs.map((doc) => ({ id: doc.id, ...doc.data(), __ref: doc.ref }));
  return collectionName === 'clases' ? filterAfterClassReset(rows) : rows;
}

async function loadCompleteFamilyPaymentAccessContext(db) {
  const [classesSnap, schedulesSnap, lockedFamiliesSnap] = await Promise.all([
    db.collection('clases').where('classResetGeneration', '==', CLASS_RESET_GENERATION).get(),
    db.collection('paymentSchedules').get(),
    db.collection('familias').where('paymentAccessLocked', '==', true).get(),
  ]);
  const classes = filterAfterClassReset(classesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data(), __ref: doc.ref })));
  const paymentSchedules = schedulesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data(), __ref: doc.ref }));
  const lockedFamilies = lockedFamiliesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data(), __ref: doc.ref }));
  return { classes, paymentSchedules, lockedFamilies };
}

function familyPaymentAccessProfileUid(profile = {}) {
  return clean(profile.userUid || profile.usuario_id || profile.uid || profile.id, 180);
}

function sameStringSet(left = [], right = []) {
  const normalize = (values) => Array.from(new Set((values || []).map(String).filter(Boolean))).sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function familyPaymentAccessFactsMatch(profile = {}, access = {}) {
  return profile.paymentAccessLocked === true
    && clean(profile.paymentAccessReason, 120) === clean(access.reason || 'unpaid_classes_over_30_days', 120)
    && Number(profile.paymentAccessDebtClassCount || 0) === Number(access.debtClassCount || 0)
    && Math.abs(Number(profile.paymentAccessDebtAmount || 0) - Number(access.debtAmount || 0)) < 0.01
    && sameStringSet(profile.paymentAccessDebtClassIds, access.debtClassIds);
}

async function resolveFamilyPaymentAccessProfile(db, familyUid, knownProfiles = new Map()) {
  const known = knownProfiles.get(familyUid);
  if (known?.__ref) return known;
  const direct = await db.collection('familias').doc(familyUid).get();
  if (direct.exists) return { id: direct.id, ...direct.data(), __ref: direct.ref };
  for (const field of ['userUid', 'usuario_id']) {
    const snap = await db.collection('familias').where(field, '==', familyUid).limit(1).get();
    if (!snap.empty) {
      const doc = snap.docs[0];
      return { id: doc.id, ...doc.data(), __ref: doc.ref };
    }
  }
  return { id: familyUid, userUid: familyUid, __ref: db.collection('familias').doc(familyUid) };
}

async function listRecentCollection(db, collectionName, maxDocs = trustContextLimit, orderField = 'updatedAt') {
  const ref = collectionName === 'clases'
    ? db.collection(collectionName).where('classResetGeneration', '==', CLASS_RESET_GENERATION)
    : db.collection(collectionName);
  try {
    const snap = await ref.orderBy(orderField, 'desc').limit(maxDocs).get();
    const rows = snap.docs.map((doc) => ({ id: doc.id, ...doc.data(), __ref: doc.ref }));
    return collectionName === 'clases' ? filterAfterClassReset(rows) : rows;
  } catch (error) {
    await addAutomationEvent(db, {
      type: 'maintenance.recent_collection_fallback',
      collectionName,
      orderField,
      error: serializeJobError(error),
    });
    return listCollection(db, collectionName, maxDocs);
  }
}

async function listCollectionGroup(db, groupName, maxDocs = trustContextLimit) {
  const snap = await db.collectionGroup(groupName).limit(maxDocs).get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    chatId: clean(doc.data().chatId || doc.data().threadId || doc.ref.parent.parent?.id || doc.ref.parent.path),
    __ref: doc.ref,
  }));
}

async function loadTrustContext(db) {
  const [
    classes,
    payments,
    documents,
    requests,
    matches,
    assignments,
    incidents,
    students,
    paymentSchedules,
  ] = await Promise.all([
    listCollection(db, 'clases'),
    listCollection(db, 'pagos'),
    listCollection(db, 'documentos'),
    listCollection(db, 'solicitudes'),
    listCollection(db, 'solicitudMatches'),
    listCollection(db, 'asignaciones'),
    listCollection(db, 'incidencias'),
    listCollection(db, 'alumnos'),
    listCollection(db, 'paymentSchedules'),
  ]);

  return {
    classes,
    payments,
    documents,
    requests,
    matches,
    requestMatches: matches,
    assignments,
    incidents,
    students,
    alumnos: students,
    paymentSchedules,
  };
}

async function writeDoc(collectionRef, id, payload, options = {}) {
  const collectionName = collectionRef?.id || '';
  const normalizedPayload = collectionName === 'clases'
    ? { ...payload, ...classResetWriteFields() }
    : payload;
  const data = collectionRef?.parent
    ? normalizedPayload
    : normalizeEntityForWrite(collectionName, normalizedPayload, { isCreate: !id || options.merge === false });
  if (dryRun) return { id: id || `dry_${Date.now()}` };
  if (id) {
    const ref = collectionRef.doc(id);
    await ref.set(data, options.merge === false ? undefined : { merge: true });
    return ref;
  }
  return collectionRef.add(data);
}

async function updateRef(ref, payload) {
  if (dryRun) return;
  await ref.update(payload);
}

function trustPenaltyEventId(...parts) {
  return `p_${parts
    .map((part) => clean(part, 120).toLowerCase().replace(/[^a-z0-9_-]+/g, '_'))
    .filter(Boolean)
    .join('_')}`.slice(0, 180);
}

function trustPenaltyPatch({ classId, notificationType, role, userUid, points, reason }) {
  const id = trustPenaltyEventId(notificationType, classId, role, userUid);
  const safePoints = Number.isFinite(Number(points)) ? Number(points) : 0;
  return {
    [`trustPenaltyEvents.${id}`]: {
      id,
      type: 'notification_responsibility_penalty',
      notificationType,
      classId: clean(classId, 180),
      appliedToRole: role,
      role,
      appliedToUid: clean(userUid, 180),
      userUid: clean(userUid, 180),
      points: safePoints,
      reason: clean(reason, 300),
      source: 'automation_worker',
      createdAt: now(),
      createdAtIso: isoNow(),
    },
    lastTrustPenaltyAt: now(),
    lastTrustPenaltyAtIso: isoNow(),
    updatedAt: now(),
  };
}

async function applyClassTrustPenalty(ref, params = {}) {
  if (!ref || !params.userUid || !params.notificationType || !params.role) return false;
  await updateRef(ref, trustPenaltyPatch(params));
  return true;
}

function dateFromFirestore(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function createdAtFromData(data = {}) {
  return dateFromFirestore(data.createdAt || data.created_at || data.fecha_creacion || data.updatedAt);
}

function isOlderThanMs(data = {}, ms) {
  const createdAt = createdAtFromData(data);
  return Boolean(createdAt && Date.now() - createdAt.getTime() >= ms);
}

function profileActivityDate(data = {}) {
  return dateFromFirestore(data.lastActivityAt || data.lastLoginAt || data.lastClassAt || data.updatedAt || data.createdAt);
}

function isInactiveTeacher(data = {}) {
  if (data.active === false || data.activo === false) return false;
  const status = normalizeStatus(data);
  if (status && !['verificado', 'activo', 'active', 'verified'].includes(status)) return false;
  const lastActivity = profileActivityDate(data);
  return Boolean(lastActivity && Date.now() - lastActivity.getTime() >= 30 * 24 * 60 * 60 * 1000);
}

function retryDelayMs(attempts) {
  const safeAttempts = Math.max(1, Number(attempts || 1));
  return Math.min(systemJobMaxBackoffMs, Math.round((2 ** (safeAttempts - 1)) * 60 * 1000));
}

function serializeJobError(error) {
  return {
    message: clean(error?.message || error || 'unknown_error', 1000),
    code: clean(error?.code || error?.name || '', 120) || null,
    stack: clean(error?.stack || '', 2000) || null,
    at: isoNow(),
  };
}

async function countQuery(queryRef) {
  try {
    const snap = await queryRef.count().get();
    return snap.data().count;
  } catch {
    return null;
  }
}

async function countActiveClasses(db, statuses = null) {
  try {
    const rows = await listCollection(db, 'clases', 20000);
    if (!Array.isArray(statuses) || !statuses.length) return rows.length;
    return rows.filter((item) => statuses.includes(item.status) || statuses.includes(item.estado)).length;
  } catch {
    return null;
  }
}

function buildScaleAlerts(metrics) {
  const alerts = [];
  if ((metrics.jobs?.queued || 0) > 500) alerts.push({ level: 'high', type: 'job_backlog', message: 'System job backlog above 500 queued jobs.' });
  if ((metrics.jobs?.deadLetter || 0) > 0) alerts.push({ level: 'critical', type: 'dead_letters', message: 'Dead-letter jobs require admin review.' });
  if ((metrics.payments?.overdue || 0) > 0) alerts.push({ level: 'high', type: 'overdue_payments', message: 'There are overdue payments.' });
  if ((metrics.notifications?.unread || 0) > 10000) alerts.push({ level: 'medium', type: 'notification_backlog', message: 'Unread notification backlog is high.' });
  return alerts;
}

function buildPlatformHealthCheck(metrics, alerts = [], source = 'github_actions_worker') {
  const jobs = metrics.jobs || {};
  const payments = metrics.payments || {};
  const notifications = metrics.notifications || {};
  const incidents = metrics.incidents || {};
  const systems = [
    {
      id: 'database',
      name: 'Base de datos',
      status: 'operational',
      what: 'Snapshot de metricas generado correctamente',
      impact: 'Sin impacto observado.',
      affectedUsers: 0,
      cause: 'Conteos Firestore completados.',
      fix: 'Mantener monitorizacion.',
    },
    {
      id: 'scheduled_tasks',
      name: 'Tareas programadas',
      status: jobs.deadLetter > 0 ? 'outage' : jobs.queued > 250 ? 'degraded' : jobs.queued > 50 ? 'attention' : 'operational',
      what: `${jobs.queued || 0} jobs en cola, ${jobs.deadLetter || 0} dead letters`,
      impact: jobs.deadLetter > 0 ? 'Procesos automaticos pueden haber fallado definitivamente.' : 'Backlog bajo control.',
      affectedUsers: 0,
      cause: 'Estado agregado de systemJobs.',
      fix: jobs.deadLetter > 0 ? 'Revisar deadLetters y reencolar tras corregir la causa.' : 'Mantener worker programado.',
    },
    {
      id: 'payments',
      name: 'Pagos',
      status: payments.overdue > 0 ? 'attention' : 'operational',
      what: `${payments.overdue || 0} pagos vencidos, ${payments.needsReview || 0} en revision`,
      impact: payments.overdue > 0 ? 'Caja y cierre de clases pueden retrasarse.' : 'Sin impacto observado.',
      affectedUsers: payments.overdue || 0,
      cause: 'Conteo de pagos vencidos/pendientes de conciliacion.',
      fix: payments.overdue > 0 ? 'Validar cobros y enviar recordatorios.' : 'Mantener conciliacion automatica.',
    },
    {
      id: 'notifications',
      name: 'Notificaciones',
      status: notifications.tokens > 0 ? 'operational' : 'attention',
      what: `${notifications.tokens || 0} tokens push activos`,
      impact: notifications.tokens > 0 ? 'Push disponible.' : 'Los avisos pueden depender del centro interno.',
      affectedUsers: 0,
      cause: 'Conteo de notificationTokens activos.',
      fix: notifications.tokens > 0 ? 'Mantener limpieza de tokens.' : 'Activar permisos push en la PWA.',
    },
    {
      id: 'automation',
      name: 'Procesos automaticos',
      status: alerts.length ? 'attention' : 'operational',
      what: `${alerts.length} alerta(s) operativas generadas`,
      impact: alerts.length ? 'Hay riesgos detectados por el motor de escala.' : 'Sin impacto observado.',
      affectedUsers: 0,
      cause: 'buildScaleAlerts sobre metricas agregadas.',
      fix: alerts.length ? 'Revisar opsAlerts abiertas.' : 'Mantener monitorizacion.',
    },
    {
      id: 'incidents',
      name: 'Incidencias',
      status: incidents.critical > 0 ? 'degraded' : incidents.open > 0 ? 'attention' : 'operational',
      what: `${incidents.open || 0} incidencias abiertas, ${incidents.critical || 0} criticas`,
      impact: incidents.critical > 0 ? 'Puede haber impacto directo en usuarios.' : 'Sin impacto critico observado.',
      affectedUsers: incidents.open || 0,
      cause: 'Conteo de incidencias abiertas.',
      fix: incidents.open > 0 ? 'Priorizar incidencias criticas y cerrar duplicadas.' : 'Mantener seguimiento.',
    },
  ];
  const statusOrder = { operational: 0, attention: 1, degraded: 2, outage: 3 };
  const status = systems.reduce((worst, item) => (statusOrder[item.status] > statusOrder[worst] ? item.status : worst), 'operational');
  const weights = { operational: 100, attention: 75, degraded: 45, outage: 10 };
  const score = Math.round(systems.reduce((sum, item) => sum + weights[item.status], 0) / systems.length);
  return {
    schemaVersion: 'mission_control_v1',
    scope: 'platform',
    source,
    status,
    score,
    generated_at: isoNow(),
    counts: {
      operational: systems.filter((item) => item.status === 'operational').length,
      attention: systems.filter((item) => item.status === 'attention').length,
      degraded: systems.filter((item) => item.status === 'degraded').length,
      outage: systems.filter((item) => item.status === 'outage').length,
    },
    impactedSubsystems: systems.filter((item) => item.status !== 'operational').length,
    affectedUsers: systems.reduce((sum, item) => sum + Number(item.affectedUsers || 0), 0),
    subsystems: systems,
  };
}

function maintenanceSubsystem({
  id,
  name,
  status = 'operational',
  what = '',
  impact = 'Sin impacto observado.',
  affectedUsers = 0,
  cause = '',
  fix = 'Mantener autoc comprobacion programada.',
  signals = [],
} = {}) {
  return {
    id,
    name,
    status,
    what,
    impact,
    affectedUsers,
    cause,
    fix,
    signals: signals.filter(Boolean).slice(0, 12),
  };
}

function worstMaintenanceStatus(systems = []) {
  const order = { operational: 0, attention: 1, degraded: 2, outage: 3 };
  return systems.reduce((worst, item) => (
    (order[item.status] || 0) > (order[worst] || 0) ? item.status : worst
  ), 'operational');
}

function buildMaintenanceHealthCheck(stats = {}, source = 'github_actions_worker') {
  const critical = Number(stats.selfSupervisionCriticalFindings || 0);
  const high = Number(stats.selfSupervisionHighFindings || 0);
  const findings = Number(stats.selfSupervisionFindingsDetected || 0);
  const failedJobs = Number(stats.systemJobsFailed || 0);
  const recoveredJobs = Number(stats.systemJobsRecoveredLeases || 0);
  const queuedJobs = Number(stats.selfSupervisionJobsQueued || 0);
  const autoRepairable = Number(stats.selfSupervisionAutoRepairable || 0);
  const repaired = Number(stats.selfSupervisionAutoRepairsApplied || 0);
  const openedAlerts = Number(stats.selfSupervisionOpsAlertsCreated || 0)
    + Number(stats.preventiveOpsAlertsCreated || 0)
    + Number(stats.relationshipFollowupOpsAlertsCreated || 0)
    + Number(stats.proactiveAssistOpsAlertsCreated || 0)
    + Number(stats.internalAiOpsAlertsCreated || 0);
  const createdIncidents = Number(stats.selfSupervisionIncidentsCreated || 0)
    + Number(stats.preventiveIncidentsCreated || 0)
    + Number(stats.operationalIncidentsCreated || 0);

  const systems = [
    maintenanceSubsystem({
      id: 'worker_heartbeat',
      name: 'Latido del worker',
      status: 'operational',
      what: `Worker ejecutado en modo ${stats.criticalOnly ? 'critico' : 'completo'}.`,
      cause: 'GitHub Actions o ejecucion CLI llego a inicializar Firebase y cargar configuracion.',
      fix: 'Mantener el workflow programado cada 10 minutos.',
      signals: [
        `dryRun=${Boolean(stats.dryRun)}`,
        `version=${MAINTENANCE_HEALTH_VERSION}`,
      ],
    }),
    maintenanceSubsystem({
      id: 'data_integrity',
      name: 'Integridad de datos',
      status: critical ? 'outage' : high ? 'degraded' : findings ? 'attention' : 'operational',
      what: `${findings} hallazgo(s): ${critical} critico(s), ${high} alto(s).`,
      impact: critical
        ? 'Puede haber datos cruzados, relaciones huerfanas o estados que afecten a usuarios.'
        : high
          ? 'Hay inconsistencias importantes que conviene resolver antes de que bloqueen flujos.'
          : findings
            ? 'Hay detalles menores o preventivos detectados.'
            : 'No se detectaron inconsistencias en el barrido.',
      cause: 'Motor platform_self_supervision sobre clases, pagos, usuarios, chats, solicitudes y jobs.',
      fix: critical || high
        ? 'Abrir Mission Control/Operaciones y resolver hallazgos de autosupervision por prioridad.'
        : 'Mantener el barrido programado.',
      signals: [
        `consistency=${Number(stats.selfSupervisionConsistencyIssues || 0)}`,
        `blocked=${Number(stats.selfSupervisionBlockedProcesses || 0)}`,
        `automation=${Number(stats.selfSupervisionAutomationIssues || 0)}`,
      ],
    }),
    maintenanceSubsystem({
      id: 'automation_jobs',
      name: 'Cola y automatizaciones',
      status: failedJobs ? 'degraded' : recoveredJobs ? 'attention' : 'operational',
      what: `${Number(stats.systemJobsSeen || 0)} job(s) revisados, ${recoveredJobs} lease(s) recuperados, ${failedJobs} fallo(s).`,
      impact: failedJobs
        ? 'Una automatizacion no se completo y puede necesitar reintento.'
        : recoveredJobs
          ? 'Se recuperaron procesos que habian quedado procesando.'
          : 'La cola no muestra bloqueo en este ciclo.',
      cause: 'Worker procesa systemJobs vencidos y recupera leases expirados antes de autosupervisar.',
      fix: failedJobs ? 'Revisar deadLetters/systemJobs y corregir la causa del job fallido.' : 'Mantener reintentos automaticos.',
      signals: [
        `processed=${Number(stats.systemJobsProcessed || 0)}`,
        `failed=${failedJobs}`,
        `recovered=${recoveredJobs}`,
      ],
    }),
    maintenanceSubsystem({
      id: 'auto_repair',
      name: 'Autocorreccion segura',
      status: autoRepairable > repaired + queuedJobs ? 'attention' : 'operational',
      what: `${autoRepairable} hallazgo(s) reparables; ${repaired} reparacion(es) aplicadas y ${queuedJobs} job(s) encolados.`,
      impact: autoRepairable > repaired + queuedJobs
        ? 'Algunas reparaciones requieren siguiente ciclo o revision humana.'
        : 'Las reparaciones seguras disponibles fueron aplicadas o encoladas.',
      cause: 'Solo se autocorrigen acciones idempotentes: chat faltante, peticion de pago y notificaciones huerfanas.',
      fix: 'Para el resto, mantener tarea/alerta admin y no modificar datos sensibles automaticamente.',
      signals: [
        `autoRepairable=${autoRepairable}`,
        `applied=${repaired}`,
        `queued=${queuedJobs}`,
      ],
    }),
    maintenanceSubsystem({
      id: 'noise_control',
      name: 'Ruido operativo',
      status: openedAlerts || createdIncidents ? 'attention' : 'operational',
      what: `${openedAlerts} alerta(s) nueva(s), ${createdIncidents} incidencia(s) creada(s).`,
      impact: openedAlerts || createdIncidents
        ? 'El administrador vera solo avisos con prioridad real o cambio de estado.'
        : 'No se genero ruido operativo nuevo.',
      cause: 'Deduplicacion por findingId/idempotencyKey y cierre automatico de hallazgos resueltos.',
      fix: 'Cerrar la causa raiz; el siguiente barrido resolvera hallazgos desaparecidos.',
      signals: [
        `opsAlertsCreated=${openedAlerts}`,
        `incidentsCreated=${createdIncidents}`,
        `opsAlertsResolved=${Number(stats.selfSupervisionOpsAlertsResolved || 0)}`,
      ],
    }),
  ];

  const status = worstMaintenanceStatus(systems);
  const penalty = critical * 18 + high * 8 + failedJobs * 12 + Math.max(0, autoRepairable - repaired - queuedJobs) * 3;
  const score = Math.max(5, Math.min(100, Math.round(100 - penalty)));

  return {
    schemaVersion: 'maintenance_health_v1',
    version: MAINTENANCE_HEALTH_VERSION,
    scope: 'maintenance',
    source,
    status,
    score,
    generated_at: isoNow(),
    summary: {
      findings,
      critical,
      high,
      autoRepairable,
      repaired,
      queuedJobs,
      failedJobs,
      recoveredJobs,
      openedAlerts,
      createdIncidents,
    },
    counts: {
      operational: systems.filter((item) => item.status === 'operational').length,
      attention: systems.filter((item) => item.status === 'attention').length,
      degraded: systems.filter((item) => item.status === 'degraded').length,
      outage: systems.filter((item) => item.status === 'outage').length,
    },
    impactedSubsystems: systems.filter((item) => item.status !== 'operational').length,
    affectedUsers: systems.reduce((sum, item) => sum + Number(item.affectedUsers || 0), 0),
    subsystems: systems,
  };
}

async function writeMaintenanceHealthSnapshot(db, stats, source = 'github_actions_worker') {
  if (!runtimeBoolean('supervision.healthSnapshotEveryRun', true)) return null;
  const health = buildMaintenanceHealthCheck(stats, source);
  const id = `maintenance_${isoNow().slice(0, 16).replace(/[:]/g, '-')}`;
  await writeDoc(db.collection('platformHealthChecks'), id, {
    ...health,
    createdAt: now(),
    updatedAt: now(),
  });
  stats.maintenanceHealthSnapshotsCreated += 1;
  return health;
}

async function writeWorkerHeartbeat(db, status, stats = {}, extra = {}) {
  if (!runtimeBoolean('supervision.heartbeatEveryRun', true)) return;
  await addAutomationEvent(db, {
    type: 'worker.heartbeat',
    status,
    mode: stats.criticalOnly ? 'critical' : 'full',
    version: MAINTENANCE_HEALTH_VERSION,
    stats: {
      systemJobsSeen: Number(stats.systemJobsSeen || 0),
      selfSupervisionFindingsDetected: Number(stats.selfSupervisionFindingsDetected || 0),
      selfSupervisionCriticalFindings: Number(stats.selfSupervisionCriticalFindings || 0),
      selfSupervisionHighFindings: Number(stats.selfSupervisionHighFindings || 0),
      maintenanceHealthSnapshotsCreated: Number(stats.maintenanceHealthSnapshotsCreated || 0),
    },
    ...extra,
  });
  stats.workerHeartbeatsCreated += 1;
}

async function writeScaleMetricSnapshot(db, source = 'github_actions_worker') {
  const metrics = {
    source,
    generatedAt: isoNow(),
    users: {
      total: await countQuery(db.collection('users')),
      admins: await countQuery(db.collection('users').where('role', '==', 'admin')),
    },
    marketplace: {
      teachers: await countQuery(db.collection('profesores')),
      families: await countQuery(db.collection('familias')),
      students: await countQuery(db.collection('alumnos')),
      requests: await countQuery(db.collection('solicitudes')),
      assignments: await countQuery(db.collection('asignaciones')),
    },
    classes: {
      total: await countActiveClasses(db),
      scheduled: await countActiveClasses(db, ['programada']),
      completed: await countActiveClasses(db, ['realizada']),
    },
    payments: {
      total: await countQuery(db.collection('pagos')),
      pending: await countQuery(db.collection('pagos').where('status', '==', 'pendiente')),
      overdue: await countQuery(db.collection('pagos').where('status', '==', 'vencido')),
      needsReview: await countQuery(db.collection('pagos').where('reconciliationStatus', '==', 'needs_review')),
    },
    notifications: {
      total: await countQuery(db.collection('notificaciones')),
      unread: await countQuery(db.collection('notificaciones').where('readAt', '==', null)),
      tokens: await countQuery(db.collection('notificationTokens').where('active', '==', true)),
    },
    jobs: {
      queued: await countQuery(db.collection('systemJobs').where('status', '==', 'queued')),
      processing: await countQuery(db.collection('systemJobs').where('status', '==', 'processing')),
      deadLetter: await countQuery(db.collection('systemJobs').where('status', '==', 'dead_letter')),
    },
    incidents: {
      open: await countQuery(db.collection('incidencias').where('status', '==', 'abierta')),
      critical: await countQuery(db.collection('incidencias').where('priority', '==', 'critical')),
    },
    version: 'scale-engine-2026-06-28',
  };
  const alerts = buildScaleAlerts(metrics);
  const health = buildPlatformHealthCheck(metrics, alerts, source);
  const id = isoNow().slice(0, 16).replace(/[:]/g, '-');

  await writeDoc(db.collection('metricSnapshots'), `platform_${id}`, {
    scope: 'platform',
    period: '10m',
    metrics,
    alerts,
    createdAt: now(),
    updatedAt: now(),
  });

  for (const alert of alerts) {
    await writeDoc(db.collection('opsAlerts'), `${alert.type}_${id}`, {
      ...alert,
      status: 'open',
      source: 'github_actions_worker',
      createdAt: now(),
      updatedAt: now(),
    });
  }

  await writeDoc(db.collection('platformHealthChecks'), `platform_${id}`, {
    ...health,
    createdAt: now(),
    updatedAt: now(),
  });

  return { alerts };
}

async function writeAnalyticsRollup(db, stats) {
  const [
    events,
    leads,
    requests,
    teachers,
    families,
    students,
    assignments,
    classes,
    payments,
    incidents,
    experiments,
  ] = await Promise.all([
    listCollection(db, 'analyticsEvents', Math.max(limit * 20, 1000)),
    listCollection(db, 'leadsPublicos', limit * 4),
    listCollection(db, 'solicitudes', limit * 4),
    listCollection(db, 'profesores', limit * 4),
    listCollection(db, 'familias', limit * 4),
    listCollection(db, 'alumnos', limit * 4),
    listCollection(db, 'asignaciones', limit * 4),
    listCollection(db, 'clases', limit * 6),
    listCollection(db, 'pagos', limit * 6),
    listCollection(db, 'incidencias', limit * 4),
    listCollection(db, 'experiments', limit * 2),
  ]);

  const generatedAt = isoNow();
  const report = buildAnalyticsReport({
    events,
    leads,
    requests,
    teachers,
    families,
    students,
    assignments,
    classes,
    payments,
    incidents,
  }, {
    month: generatedAt.slice(0, 7),
    nowIso: generatedAt,
  });
  const experimentResults = buildExperimentResults(experiments, events, {
    minSampleSize: runtimeNumber('experimentation.minimumSampleSize', 20, 1, 100000),
  });

  await writeDoc(db.collection('analyticsDailyRollups'), generatedAt.slice(0, 10), {
    scope: 'product_analytics',
    period: 'daily',
    day: generatedAt.slice(0, 10),
    month: generatedAt.slice(0, 7),
    analyticsVersion: ANALYTICS_ENGINE_VERSION,
    experimentationVersion: EXPERIMENTATION_ENGINE_VERSION,
    generatedAt,
    metrics: report.totals,
    funnels: report.funnels,
    insights: report.insights,
    demand: report.demand,
    monthly: report.monthly,
    experiments: experimentResults,
    createdAt: now(),
    updatedAt: now(),
  });

  stats.analyticsEventsEvaluated = events.length;
  stats.analyticsRollupsCreated += 1;
  stats.analyticsEngineVersion = ANALYTICS_ENGINE_VERSION;
  stats.experimentationEngineVersion = EXPERIMENTATION_ENGINE_VERSION;
  stats.experimentsEvaluated = experimentResults.length;
  return report;
}

async function countActiveAssignmentsByTeacher(db) {
  const snap = await db.collection('asignaciones')
    .where('active', '==', true)
    .limit(runtimeNumber('matching.assignmentScanLimit', matchingAssignmentScanLimit, 1, 50000))
    .get();
  const counts = new Map();
  snap.docs.forEach((doc) => {
    const data = doc.data();
    const teacherUid = data.teacherUid || data.profesor_id;
    if (teacherUid) counts.set(teacherUid, (counts.get(teacherUid) || 0) + 1);
  });
  return counts;
}

async function loadAvailabilityByTeacher(db) {
  try {
    const snap = await db.collection('disponibilidad').limit(runtimeNumber('matching.teacherScanLimit', matchingTeacherScanLimit, 1, 10000) * 5).get();
    const slots = new Map();
    snap.docs.forEach((doc) => {
      const data = { id: doc.id, ...doc.data() };
      const teacherUid = clean(data.teacherUid || data.profesor_id || data.userUid || data.usuario_id);
      if (!teacherUid) return;
      if (!slots.has(teacherUid)) slots.set(teacherUid, []);
      slots.get(teacherUid).push(data);
    });
    return slots;
  } catch {
    return new Map();
  }
}

async function loadMatchingContextForRequest(db) {
  const limit = runtimeNumber('matching.assignmentScanLimit', matchingAssignmentScanLimit, 1, 50000);
  const [assignments, classes, requestMatches] = await Promise.all([
    listCollection(db, 'asignaciones', limit),
    listCollection(db, 'clases', limit),
    listCollection(db, 'solicitudMatches', limit),
  ]);
  return { assignments, classes, requestMatches, matches: requestMatches };
}

function activeMatchingOptions() {
  return {
    nowIso: isoNow(),
    teacherResponseSlaHours: runtimeNumber('matching.teacherResponseSlaHours', 8, 1, 168),
    staleRequestHours: runtimeNumber('matching.staleRequestHours', 12, 1, 720),
    lowSupplyThreshold: runtimeNumber('matching.lowSupplyThreshold', 2, 1, 100),
    minReadyScore: runtimeNumber('matching.minReadyScore', 70, 1, 100),
  };
}

function matchesByRequestId(matches = []) {
  const map = new Map();
  for (const item of matches || []) {
    const requestId = clean(item.requestId || item.solicitud_id || item.solicitudId, 180);
    if (!requestId) continue;
    if (!map.has(requestId)) map.set(requestId, []);
    map.get(requestId).push(item);
  }
  for (const rows of map.values()) rows.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  return map;
}

async function materializeActiveMatchingPlan(db, requestId, request, plan, stats) {
  if (!requestId || !plan) return;
  stats.activeMatchingPlansCreated += 1;
  const payload = {
    requestId,
    solicitud_id: requestId,
    familyUid: request.familyUid || request.familia_id || '',
    studentId: request.studentId || request.alumno_id || '',
    subject: request.subject || request.materia || '',
    status: plan.status,
    priority: plan.priority,
    priorityRank: plan.priorityRank,
    summary: plan.summary,
    publicSummary: plan.publicSummary,
    fingerprint: plan.fingerprint,
    plan,
    matchingVersion: MATCHING_VERSION,
    activeMatchingVersion: plan.version,
    updatedAt: now(),
    updated_at: isoNow(),
  };
  await writeDoc(db.collection('matchingInterventions'), requestId, {
    ...payload,
    createdAt: now(),
    created_at: isoNow(),
  });
  await updateRef(db.collection('solicitudes').doc(requestId), {
    activeMatchingPlan: plan,
    activeMatchingStatus: plan.status,
    activeMatchingPriority: plan.priority,
    activeMatchingFingerprint: plan.fingerprint,
    activeMatchingUpdatedAt: now(),
    activeMatchingUpdated_at: isoNow(),
    updatedAt: now(),
    updated_at: isoNow(),
  });

  if (['on_track', 'assigned', 'closed', 'ready_with_recommendation'].includes(plan.status)) return;
  const notifyKey = `active_matching_${requestId}_${plan.fingerprint}`;
  const createdNotifications = await notifyAdminsOnce(
    db,
    plan.priority === 'critical' ? 'Matching bloqueado' : 'Matching necesita ayuda',
    plan.summary,
    {
      type: 'matching_active_intervention',
      requestId,
      activeMatchingStatus: plan.status,
      priority: plan.priority,
      url: '/pages/login.html',
    },
    notifyKey,
  );
  stats.activeMatchingNotificationsCreated += createdNotifications;

  const taskId = notificationId('crm_active_matching', requestId, plan.fingerprint);
  await writeDoc(db.collection('crmTasks'), taskId, {
    title: plan.actions?.[0]?.title || 'Resolver matching',
    description: plan.summary,
    priority: plan.priority,
    status: 'open',
    estado: 'abierta',
    entityType: 'solicitudes',
    entityId: requestId,
    requestId,
    tags: ['matching', 'activo', plan.status],
    dueAfterMinutes: runtimeNumber('automation.staleRequestReviewMinutes', 120, 5, 10080),
    source: 'active_matching',
    activeMatchingFingerprint: plan.fingerprint,
    createdAt: now(),
    updatedAt: now(),
  }, { merge: false });
  stats.activeMatchingTasksCreated += 1;

  for (const job of plan.automationJobs || []) {
    const created = await enqueueWorkerSystemJob(db, job, 'active_matching');
    if (created) stats.activeMatchingJobsQueued += 1;
  }

  const familyAction = (plan.actions || []).find((item) => item.targetRole === 'familia');
  const familyUid = clean(request.familyUid || request.familia_id || request.familyUserUid, 180);
  if (familyAction && familyUid) {
    const created = await notifyUserOnce(
      db,
      familyUid,
      familyAction.title,
      familyAction.body,
      {
        type: 'matching_active_intervention',
        requestId,
        action: familyAction.type,
        url: '/pages/login.html',
      },
      `${notifyKey}_family`,
    );
    if (created) stats.activeMatchingNotificationsCreated += 1;
  }

  const teacherAction = (plan.actions || []).find((item) => item.targetRole === 'profesor' && item.payload?.teacherUid);
  if (teacherAction?.payload?.teacherUid) {
    const created = await notifyUserOnce(
      db,
      teacherAction.payload.teacherUid,
      teacherAction.title,
      teacherAction.body,
      {
        type: 'matching_active_intervention',
        requestId,
        action: teacherAction.type,
        url: '/pages/login.html',
      },
      `${notifyKey}_teacher_${teacherAction.payload.teacherUid}`,
    );
    if (created) stats.activeMatchingNotificationsCreated += 1;
  }

  if (plan.priority === 'critical' || plan.status === 'blocked_no_candidates') {
    await createOperationalIncidentOnce(db, 'matching_blocked', {
      id: requestId,
      requestId,
      familyUid: request.familyUid || request.familia_id,
      studentId: request.studentId || request.alumno_id,
      descripcion: plan.summary,
      suggestedActions: (plan.actions || []).slice(0, 4).map((item) => item.title),
    }, stats);
  }
}

async function loadTeachers(db) {
  const [teachersSnap, usersSnap, assignmentCounts, availabilitySlots] = await Promise.all([
    db.collection('profesores').limit(runtimeNumber('matching.teacherScanLimit', matchingTeacherScanLimit, 1, 10000)).get(),
    db.collection('users').limit(runtimeNumber('matching.userScanLimit', matchingUserScanLimit, 1, 20000)).get(),
    countActiveAssignmentsByTeacher(db),
    loadAvailabilityByTeacher(db),
  ]);
  const users = new Map(usersSnap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }]));

  return teachersSnap.docs
    .map((doc) => {
      const data = doc.data();
      const userUid = data.userUid || data.usuario_id || doc.id;
      const user = users.get(userUid) || {};
      const status = normalizeStatus(data);
      const slots = [
        ...(availabilitySlots.get(doc.id) || []),
        ...(availabilitySlots.get(userUid) || []),
      ];
      return {
        ...data,
        id: doc.id,
        teacherUid: doc.id,
        userUid,
        usuarios: user,
        nombre: getUserName(user) || getUserName(data) || doc.id,
        email: user.email || data.email || '',
        status,
        active: data.active !== false && data.activo !== false,
        materias: asArray(data.materias || data.materia),
        subjects: asArray(data.subjects || data.materias || data.materia),
        niveles: asArray(data.niveles_educativos || data.niveles || data.nivel),
        niveles_educativos: asArray(data.niveles_educativos || data.levels || data.niveles || data.nivel),
        levels: asArray(data.levels || data.niveles_educativos || data.niveles || data.nivel),
        modalidad: clean(data.modalidad || data.tipo_clase || data.formato),
        modality: clean(data.modality || data.modalidad || data.tipo_clase || data.formato),
        zona: clean(data.zona || data.ciudad || data.barrio),
        zone: clean(data.zone || data.zona || data.ciudad || data.barrio),
        bio: clean(data.bio || data.experiencia, 1000),
        maxStudents: Number(data.maxStudents || data.max_alumnos || 5),
        activeAssignments: assignmentCounts.get(doc.id) || assignmentCounts.get(userUid) || 0,
        availabilitySlots: slots,
      };
    })
    .filter((teacher) => teacher.active && ['verificado', 'activo', 'pendiente_revision', 'pendiente', ''].includes(teacher.status));
}

async function enrichRequestForMatching(db, requestId, request = {}) {
  const studentId = clean(request.studentId || request.alumno_id || request.studentUid, 180);
  const familyUid = clean(request.familyUid || request.familia_id || request.familyId, 180);
  const [studentSnap, familySnap] = await Promise.all([
    studentId ? db.collection('alumnos').doc(studentId).get().catch(() => null) : null,
    familyUid ? db.collection('familias').doc(familyUid).get().catch(() => null) : null,
  ]);
  const student = studentSnap?.exists ? { id: studentSnap.id, ...studentSnap.data() } : {};
  const family = familySnap?.exists ? { id: familySnap.id, ...familySnap.data() } : {};
  const requestStudent = request.studentSnapshot || request.alumnos || {};
  const requestFamily = request.familySnapshot || request.familias?.usuarios || request.familias || {};
  const studentAvailability = request.availabilitySlots
    || request.disponibilidadSlots
    || request.studentAvailabilitySlots
    || requestStudent.availabilitySlots
    || requestStudent.disponibilidadSlots
    || student.availabilitySlots
    || student.disponibilidadSlots
    || student.disponibilidad_slots
    || student.franjasDisponibles
    || [];

  return {
    ...request,
    id: requestId,
    studentSnapshot: {
      ...student,
      ...requestStudent,
      availabilitySlots: requestStudent.availabilitySlots || requestStudent.disponibilidadSlots || studentAvailability,
      disponibilidadSlots: requestStudent.disponibilidadSlots || requestStudent.availabilitySlots || studentAvailability,
    },
    familySnapshot: {
      ...family,
      ...requestFamily,
    },
    availabilitySlots: studentAvailability,
    disponibilidadSlots: studentAvailability,
  };
}

function shouldRegenerateMatching(request = {}) {
  if (request.assignedTeacherUid || request.profesor_asignado_id) return false;
  const status = lower(request.status || request.estado);
  if (!['nueva', 'pendiente', 'pending', ''].includes(status)) return false;
  if (request.matchStatus !== 'ready' || !request.matchRunId) return true;
  if (request.matchingVersion !== MATCHING_VERSION) return true;
  const maxAgeHours = runtimeNumber('matching.recomputeReadyAfterHours', 24, 1, 168);
  const computedAt = dateFromFirestore(request.matchComputedAt || request.matchComputed_at);
  if (!computedAt) return true;
  return Date.now() - computedAt.getTime() >= maxAgeHours * 60 * 60 * 1000;
}

async function callGeminiForMatching(profile, baseCandidates) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  if (!apiKey || !baseCandidates.length) return null;

  const prompt = buildMatchingAiPrompt(profile, baseCandidates);

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 900,
        responseMimeType: 'application/json',
      },
    }),
  });

  const raw = await response.json();
  if (!response.ok || raw.error) throw new Error(raw.error?.message || `Gemini ${response.status}`);

  const text = raw.candidates?.[0]?.content?.parts?.[0]?.text
    ?.replace(/^```json\s*/i, '')
    ?.replace(/^```\s*/i, '')
    ?.replace(/```\s*$/i, '')
    ?.trim();
  if (!text) return null;

  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed.matches)) return null;
  return parsed;
}

async function processPublicLeads(db, stats) {
  const snap = await db.collection('leadsPublicos')
    .where('estado', '==', 'nuevo')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  for (const doc of snap.docs) {
    const lead = doc.data();
    const type = clean(lead.tipo, 30);
    stats.leadsSeen += 1;

    if (lead.automationStatus === 'request_created' || lead.automationStatus === 'review_teacher_lead') continue;

    const leadContext = { channel: 'public_lead', role: type };
    const aiModeration = moderateContent(textFromValues(lead.nombre, lead.email, lead.telefono, lead.asunto, lead.mensaje, lead.metadata), leadContext);
    const aiPatch = {
      aiModeration,
      aiPolicy: aiModeration.policy,
      aiVersion: AI_FEATURES_VERSION,
    };
    if (aiModeration.action === 'review') stats.leadsFlaggedForReview += 1;

    await addAutomationEvent(db, { type: 'lead_received', leadId: doc.id, leadType: type });

    if (type === 'profesor') {
      const price = calculateTeacherPrice({ ...lead, ...(lead.metadata || {}) });
      const diagnostic = teacherDiagnostic({ ...lead, ...(lead.metadata || {}) }, price);
      const profileAssistant = buildTeacherProfileRecommendations({
        ...lead,
        ...(lead.metadata || {}),
        nombre: lead.nombre,
        email: lead.email,
        telefono: lead.telefono,
        status: 'pendiente_revision',
      });
      await updateRef(doc.ref, {
        ...aiPatch,
        suggestedHourlyRate: price,
        diagnostico: {
          ...diagnostic,
          profileAssistant,
          moderation: aiModeration,
        },
        automationStatus: 'review_teacher_lead',
        estado: 'procesado',
        updatedAt: now(),
      });
      await notifyAdmins(db, 'Nuevo profesor interesado', `${lead.nombre || lead.email || 'Un profesor interesado'} envio una solicitud publica. Precio sugerido: ${price} EUR/h.`, {
        type: 'teacher_lead',
        leadId: doc.id,
      });
      stats.teacherLeadsProcessed += 1;
      continue;
    }

    if (type === 'familia') {
      const requestRef = db.collection('solicitudes').doc(`lead_${doc.id}`);
      const requestPayload = leadToPublicRequest(doc.id, lead);
      const requestBrief = buildFamilyRequestBrief(requestPayload);
      await writeDoc(db.collection('solicitudes'), requestRef.id, {
        ...requestPayload,
        aiBrief: requestBrief,
        aiModeration,
        aiVersion: AI_FEATURES_VERSION,
      });
      await updateRef(doc.ref, {
        ...aiPatch,
        automationStatus: 'request_created',
        estado: 'procesado',
        solicitudId: requestRef.id,
        diagnostico: {
          ...studentDiagnostic({ ...lead, ...(lead.metadata || {}) }),
          requestBrief,
          moderation: aiModeration,
        },
        updatedAt: now(),
      });
      const assistedAccount = clean(lead.metadata?.account_mode, 80) === 'assisted_parent_activation';
      await notifyAdmins(db, assistedAccount ? 'Nuevo formulario de familia' : 'Nueva familia solicita profesor', `${lead.nombre || lead.email || 'Una familia'} solicito ${requestPayload.materia || 'materia sin indicar'}${lead.metadata?.alumno ? ` para ${lead.metadata.alumno}` : ''}.`, {
        type: 'family_lead_request',
        subtype: assistedAccount ? 'assisted_family_form' : 'direct_family_request',
        leadId: doc.id,
        requestId: requestRef.id,
        section: 'leads',
        accountStatus: lead.accountStatus || '',
      });
      stats.familyLeadsProcessed += 1;
      continue;
    }

    await updateRef(doc.ref, {
      ...aiPatch,
      automationStatus: 'contact_notified',
      estado: 'procesado',
      updatedAt: now(),
    });
    await notifyAdmins(db, 'Nuevo contacto publico', `${lead.nombre || lead.email || 'Un contacto publico'} envio un mensaje.`, {
      type: 'contact_lead',
      leadId: doc.id,
    });
    stats.contactLeadsProcessed += 1;
  }
}

async function processActivatedAssistedFamilyLeads(db, stats) {
  const snap = await db.collection('leadsPublicos')
    .where('accountStatus', '==', 'activated')
    .limit(limit * 2)
    .get();

  for (const doc of snap.docs) {
    const lead = doc.data() || {};
    if (lead.accountLinkedAt || lead.tipo !== 'familia') continue;
    if (clean(lead.metadata?.account_mode, 80) !== 'assisted_parent_activation') continue;

    const familyUid = clean(lead.accountUid, 180);
    if (!familyUid) continue;
    const studentName = clean(lead.metadata?.alumno, 160);
    const studentId = clean(lead.studentId, 180) || `lead_${doc.id}`;
    const requestId = clean(lead.solicitudId, 180) || `lead_${doc.id}`;
    const subject = clean(lead.metadata?.materia || lead.asunto || lead.mensaje, 180);

    if (studentName) {
      const studentRef = db.collection('alumnos').doc(studentId);
      const studentSnap = await studentRef.get();
      await studentRef.set({
        familyUid,
        familia_id: familyUid,
        nombre: studentName,
        materias: subject ? [subject] : [],
        materias_necesita: subject ? [subject] : [],
        active: true,
        activo: true,
        source: 'assisted_parent_form',
        publicLeadId: doc.id,
        ...(studentSnap.exists ? {} : { createdAt: now() }),
        updatedAt: now(),
      }, { merge: true });
    }

    const requestRef = db.collection('solicitudes').doc(requestId);
    const requestSnap = await requestRef.get();
    const linkPatch = {
      familyUid,
      familia_id: familyUid,
      studentId: studentName ? studentId : null,
      alumno_id: studentName ? studentId : null,
      familySnapshot: {
        nombre: clean(lead.nombre, 160),
        email: clean(lead.email, 254).toLowerCase(),
        telefono: clean(lead.telefono, 40),
      },
      studentSnapshot: {
        nombre: studentName,
        nivel: clean(lead.metadata?.nivel, 120),
      },
      updatedAt: now(),
      updated_at: isoNow(),
    };
    if (requestSnap.exists) {
      await requestRef.set(linkPatch, { merge: true });
    } else {
      await requestRef.set({ ...leadToPublicRequest(doc.id, lead), ...linkPatch }, { merge: true });
    }

    await updateRef(doc.ref, {
      accountLinkedAt: now(),
      studentId,
      solicitudId: requestId,
      updatedAt: now(),
    });
    await notifyAdminsOnce(
      db,
      'Cuenta familiar activada',
      `${lead.nombre || lead.email || 'Una familia'} ya verifico el correo y activo su cuenta.`,
      { type: 'family_lead_request', subtype: 'assisted_family_activated', leadId: doc.id, requestId, familyUid },
      `assisted_family_activated_${doc.id}`,
    );
    stats.assistedFamilyAccountsLinked += 1;
  }
}

async function generateMatchesForRequest(db, requestId, request, stats, reason = 'worker_scan') {
  const enrichedRequest = await enrichRequestForMatching(db, requestId, request);
  const profile = getMatchingRequestProfile(enrichedRequest);
  const requestBrief = buildFamilyRequestBrief(enrichedRequest);
  const [teachers, matchingContext] = await Promise.all([
    loadTeachers(db),
    loadMatchingContextForRequest(db),
  ]);
  const teachersWithSignals = teachers.map((teacher) => ({
    ...teacher,
    ...buildTeacherMatchingSignals(teacher, enrichedRequest, matchingContext),
  }));
  const baseCandidates = rankTeachersForRequest(enrichedRequest, teachersWithSignals, {
    limit: 10,
    minScore: 25,
  });

  let aiResult = null;
  let aiError = null;
  try {
    aiResult = await callGeminiForMatching(profile, baseCandidates);
  } catch (error) {
    aiError = error.message || String(error);
  }

  const candidates = mergeProfessionalAiRanking(baseCandidates, aiResult).slice(0, 5);
  const decisionSupport = buildMatchingDecisionSupport(enrichedRequest, candidates);
  const activeMatchingPlan = buildActiveMatchingPlan(enrichedRequest, candidates, matchingContext, activeMatchingOptions());
  const aiUsed = Boolean(aiResult?.matches?.length);
  const aiMode = process.env.GEMINI_API_KEY
    ? (aiUsed ? 'gemini_assisted' : 'gemini_attempted_fallback_deterministic')
    : 'deterministic_no_api_key';

  const runRef = dryRun
    ? { id: `dry_run_${requestId}` }
    : await db.collection('matchingRuns').add({
      requestId,
      reason,
      status: candidates.length ? 'completed' : 'no_match',
      profile,
      requestBrief,
      decisionSupport,
      activeMatchingPlan,
      matchQuality: decisionSupport.quality,
      matchConfidenceScore: decisionSupport.confidenceScore,
      activeMatchingStatus: activeMatchingPlan.status,
      activeMatchingPriority: activeMatchingPlan.priority,
      candidatesCount: candidates.length,
      matchingVersion: MATCHING_VERSION,
      aiUsed,
      aiMode,
      aiError,
      createdAt: now(),
    });

  if (!dryRun) {
    const batch = db.batch();
    candidates.forEach((candidate, index) => {
      const ref = db.collection('solicitudMatches').doc(`${requestId}_${candidate.teacherUid}`);
      batch.set(ref, {
        requestId,
        solicitud_id: requestId,
        runId: runRef.id,
        teacherUid: candidate.teacherUid,
        profesor_id: candidate.teacherUid,
        teacherUserUid: candidate.userUid || candidate.teacherUserUid,
        teacherName: candidate.teacherName,
        nombreProfesor: candidate.teacherName,
        teacherEmail: candidate.teacherEmail || '',
        score: candidate.score,
        scoreBreakdown: candidate.scoreBreakdown || {},
        locationEstimate: candidate.locationEstimate || candidate.scoreBreakdown?.location?.locationEstimate || null,
        profileScore: candidate.profileScore || 0,
        assignable: candidate.assignable === true,
        matchingVersion: candidate.matchingVersion || MATCHING_VERSION,
        source: candidate.source || MATCHING_VERSION,
        aiAdjustment: candidate.aiAdjustment || 0,
        rank: index + 1,
        reasons: candidate.aiReason ? [candidate.aiReason, ...candidate.reasons] : candidate.reasons,
        risks: uniq([...(candidate.aiRisks || []), ...candidate.risks]),
        subjectMatch: profile.subject,
        levelMatch: profile.level,
        aiUsed,
        aiMode,
        decisionQuality: decisionSupport.quality,
        decisionConfidenceScore: decisionSupport.confidenceScore,
        status: 'propuesto',
        estado: 'propuesto',
        createdAt: now(),
        updatedAt: now(),
      }, { merge: true });
    });
    batch.update(db.collection('solicitudes').doc(requestId), {
      matchStatus: candidates.length ? 'ready' : 'no_match',
      bestTeacherUid: candidates[0]?.teacherUid || null,
      bestScore: candidates[0]?.score || 0,
      matchingVersion: MATCHING_VERSION,
      matchRunId: runRef.id,
      matchComputedAt: now(),
      matchDecision: decisionSupport,
      matchQuality: decisionSupport.quality,
      matchConfidenceScore: decisionSupport.confidenceScore,
      matchNeedsReview: decisionSupport.quality !== 'listo_para_asignar',
      activeMatchingPlan,
      activeMatchingStatus: activeMatchingPlan.status,
      activeMatchingPriority: activeMatchingPlan.priority,
      activeMatchingFingerprint: activeMatchingPlan.fingerprint,
      activeMatchingUpdatedAt: now(),
      aiBrief: requestBrief,
      aiVersion: AI_FEATURES_VERSION,
      updatedAt: now(),
      updated_at: isoNow(),
    });
    await batch.commit();
  }

  await addAutomationEvent(db, {
    type: 'matching_generated',
    requestId,
    runId: runRef.id,
    candidatesCount: candidates.length,
    bestTeacherUid: candidates[0]?.teacherUid || null,
    bestScore: candidates[0]?.score || 0,
    matchQuality: decisionSupport.quality,
    matchConfidenceScore: decisionSupport.confidenceScore,
    aiUsed,
    aiMode,
    aiError,
    matchingVersion: MATCHING_VERSION,
    activeMatchingStatus: activeMatchingPlan.status,
    activeMatchingPriority: activeMatchingPlan.priority,
  });

  await materializeActiveMatchingPlan(db, requestId, enrichedRequest, activeMatchingPlan, stats);

  if (!candidates.length) {
    await notifyAdmins(db, 'Solicitud sin match automatico', `No hay candidatos claros para ${profile.subject || 'la solicitud'} (${profile.level || 'nivel sin indicar'}).`, {
      type: 'matching_no_match',
      requestId,
    });
  }

  stats.matchesGenerated += 1;
}

async function processPendingRequests(db, stats) {
  const snap = await db.collection('solicitudes')
    .where('status', '==', 'nueva')
    .limit(limit)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data();
    stats.requestsSeen += 1;
    if (!shouldRegenerateMatching(data)) continue;
    await generateMatchesForRequest(db, doc.id, data, stats);
  }
}

async function processActiveMatchingInterventions(db, stats) {
  const requests = await listCollection(db, 'solicitudes', limit * 2);
  const openRequests = requests.filter((item) => {
    const status = lower(item.status || item.estado || 'nueva');
    if (item.assignedTeacherUid || item.profesor_asignado_id) return false;
    if (/(asign|cancel|cerrad|archiv|finaliz|complet)/.test(status)) return false;
    return ['nueva', 'pendiente', 'pending', ''].includes(status) || item.matchStatus;
  }).slice(0, limit);
  if (!openRequests.length) return;

  const [teachers, matchingContext] = await Promise.all([
    loadTeachers(db),
    loadMatchingContextForRequest(db),
  ]);
  const matchesMap = matchesByRequestId(matchingContext.requestMatches || []);

  for (const request of openRequests) {
    stats.activeMatchingRequestsChecked += 1;
    const requestId = clean(request.id || request.requestId || request.solicitud_id, 180);
    if (!requestId) continue;
    const enrichedRequest = await enrichRequestForMatching(db, requestId, request);
    const existingMatches = matchesMap.get(requestId) || [];
    let candidates = existingMatches;
    if (!candidates.length || request.matchingVersion !== MATCHING_VERSION) {
      const teachersWithSignals = teachers.map((teacher) => ({
        ...teacher,
        ...buildTeacherMatchingSignals(teacher, enrichedRequest, matchingContext),
      }));
      candidates = rankTeachersForRequest(enrichedRequest, teachersWithSignals, {
        limit: 5,
        minScore: runtimeNumber('matching.minScore', 25, 0, 100),
        includeZeroScore: true,
      });
    }
    const plan = buildActiveMatchingPlan(enrichedRequest, candidates, matchingContext, activeMatchingOptions());
    await materializeActiveMatchingPlan(db, requestId, enrichedRequest, plan, stats);
  }
}

async function dispatchSystemJob(db, job, stats) {
  const type = clean(job.data.type, 120);
  const payload = job.data.payload || {};

  if (type === 'noop') return { skipped: true, reason: 'noop' };

  if (type === 'matching.request') {
    const requestId = clean(payload.requestId || payload.solicitud_id, 180);
    if (!requestId) throw new Error('matching.request requires requestId.');
    const requestSnap = await db.collection('solicitudes').doc(requestId).get();
    if (!requestSnap.exists) return { skipped: true, reason: 'request_not_found', requestId };
    const request = requestSnap.data();
    if (request.matchStatus === 'ready' && request.matchRunId && payload.force !== true && !shouldRegenerateMatching(request)) {
      return { skipped: true, reason: 'already_matched', requestId };
    }
    await generateMatchesForRequest(db, requestId, request, stats, payload.reason || 'system_job');
    return { requestId };
  }

  if (type === 'notification.admin') {
    await notifyAdmins(
      db,
      payload.title || 'ClasesDe10',
      payload.body || '',
      payload.payload || { type: 'automation' },
    );
    return { notified: 'admin' };
  }

  if (type === 'notification.internal') {
    const userUid = clean(payload.userUid || payload.usuario_id, 180);
    const created = await notifyUserOnce(
      db,
      userUid,
      payload.title || payload.titulo || 'ClasesDe10',
      payload.body || payload.cuerpo || '',
      payload.payload || { type: payload.type || 'automation' },
      payload.idempotencyKey || job.data.idempotencyKey || `system_job_${job.id}`,
    );
    return { notified: userUid, created };
  }

  if (type === 'relationship.ensure_chat') {
    const assignmentId = clean(payload.assignmentId || payload.asignacion_id, 180);
    if (!assignmentId) throw new Error('relationship.ensure_chat requires assignmentId.');
    const result = await ensureChatForAssignmentWorker(db, assignmentId, payload.reason || 'system_job');
    if (result.created || result.introSent) stats.assignmentChatsEnsured += 1;
    return result;
  }

  if (type === 'payment.request_for_class') {
    const classId = clean(payload.classId || payload.clase_id, 180);
    if (!classId) throw new Error('payment.request_for_class requires classId.');
    const result = await createPaymentRequestForClassWorker(db, classId, payload.reason || 'system_job');
    if (result.created) stats.paymentRequestsCreated += 1;
    return result;
  }

  if (type === 'metrics.snapshot') {
    const snapshot = await writeScaleMetricSnapshot(db, payload.source || 'system_job');
    stats.metricSnapshotsCreated += 1;
    stats.opsAlertsCreated += snapshot.alerts.length;
    return { alerts: snapshot.alerts.length };
  }

  if (type === 'audit.event') {
    const entityType = clean(payload.entityType, 80);
    const action = clean(payload.action, 120);
    if (!entityType || !action) throw new Error('audit.event requires entityType and action.');
    await writeDoc(db.collection('auditLogs'), null, {
      schemaVersion: 'audit_log_v1',
      module: clean(payload.module || 'automation', 80),
      severity: clean(payload.severity || 'info', 40),
      origin: clean(payload.origin || 'github_actions_job', 80),
      source: clean(payload.source || type, 180),
      actorUid: clean(payload.actorUid || 'system', 180),
      actorEmail: clean(payload.actorEmail || '', 254),
      actorRole: clean(payload.actorRole || 'system', 80),
      actorType: clean(payload.actorType || 'automation', 80),
      responsibleUid: clean(payload.responsibleUid || payload.actorUid || 'system', 180),
      responsibleEmail: clean(payload.responsibleEmail || payload.actorEmail || '', 254),
      action,
      entityType,
      entityId: clean(payload.entityId, 180) || null,
      description: clean(payload.description || action, 500),
      before: payload.before || null,
      after: payload.after || null,
      changes: Array.isArray(payload.changes) ? payload.changes.slice(0, 80) : [],
      metadata: payload.metadata || {},
      context: payload.context || {},
      error: payload.error || null,
      trace: job.data.trace || null,
      createdAt: now(),
      created_at: isoNow(),
      updatedAt: now(),
    });
    return { audited: true, entityType, action };
  }

  throw new Error(`Unsupported system job type: ${type}`);
}

async function markSystemJobCompleted(job, result) {
  await writeDoc(job.ref.parent, job.id, {
    status: 'completed',
    completedAt: now(),
    leaseUntil: null,
    result,
    updatedAt: now(),
  });
}

async function claimWorkerSystemJob(db, job, workerId) {
  if (dryRun) {
    const attempts = Math.max(0, Number(job.data.attempts || 0)) + 1;
    return { ...job, data: { ...job.data, attempts }, recovered: normalizeWorkerJobStatus(job.data.status) === 'processing' };
  }

  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(job.ref);
    if (!snap.exists) return null;

    const data = snap.data();
    const status = normalizeWorkerJobStatus(data.status);
    const runAt = workerJobRunAt(data);
    if (status === 'queued' && runAt.getTime() > Date.now()) return null;
    if (status === 'processing' && !workerJobLeaseExpired(data)) return null;
    if (!['queued', 'processing'].includes(status)) return null;

    const attempts = Math.max(0, Number(data.attempts || 0)) + 1;
    transaction.set(job.ref, {
      status: 'processing',
      attempts,
      workerId,
      startedAt: now(),
      leaseUntil: workerTimestampAfter(systemJobLeaseMs),
      updatedAt: now(),
    }, { merge: true });

    return {
      id: snap.id,
      ref: job.ref,
      data: { ...data, attempts },
      recovered: status === 'processing',
    };
  });
}

async function markSystemJobFailed(db, job, error) {
  const attempts = Math.max(1, Number(job.data.attempts || 1));
  const maxAttempts = Math.max(1, Number(job.data.maxAttempts || 5));
  const lastError = serializeJobError(error);

  if (attempts >= maxAttempts) {
    await writeDoc(job.ref.parent, job.id, {
      status: 'dead_letter',
      deadLetterAt: now(),
      leaseUntil: null,
      lastError,
      updatedAt: now(),
    });
    await writeDoc(db.collection('deadLetters'), job.id, {
      jobId: job.id,
      type: job.data.type || '',
      payload: job.data.payload || {},
      attempts,
      maxAttempts,
      lastError,
      trace: job.data.trace || null,
      createdAt: now(),
      updatedAt: now(),
    });
    return;
  }

  await writeDoc(job.ref.parent, job.id, {
    status: 'queued',
    runAt: workerTimestampAfter(retryDelayMs(attempts)),
    leaseUntil: null,
    lastError,
    updatedAt: now(),
  });
}

async function listDueQueuedSystemJobs(db, batchLimit) {
  try {
    const [snap, legacySnap] = await Promise.all([
      db.collection('systemJobs')
        .where('status', '==', 'queued')
        .where('runAt', '<=', admin.firestore.Timestamp.now())
        .orderBy('runAt', 'asc')
        .orderBy('priority', 'desc')
        .limit(batchLimit)
        .get(),
      db.collection('systemJobs')
        .where('status', '==', 'queued')
        .limit(Math.min(batchLimit, 100))
        .get()
        .catch(() => ({ docs: [] })),
    ]);
    const jobsById = new Map();
    snap.docs.forEach((doc) => jobsById.set(doc.id, { id: doc.id, ref: doc.ref, data: doc.data() }));
    legacySnap.docs
      .filter((doc) => !dateFromFirestore(doc.data().runAt))
      .forEach((doc) => jobsById.set(doc.id, { id: doc.id, ref: doc.ref, data: doc.data() }));
    return [...jobsById.values()];
  } catch (error) {
    await addAutomationEvent(db, {
      type: 'system_jobs_due_query_fallback',
      error: serializeJobError(error),
      reason: 'direct_due_query_failed',
    });
    const snap = await db.collection('systemJobs')
      .where('status', '==', 'queued')
      .limit(batchLimit)
      .get()
      .catch(() => ({ docs: [] }));
    return snap.docs
      .map((doc) => ({ id: doc.id, ref: doc.ref, data: doc.data() }))
      .filter((job) => workerJobRunAt(job.data).getTime() <= Date.now());
  }
}

async function listExpiredProcessingSystemJobs(db, batchLimit) {
  const snap = await db.collection('systemJobs')
    .where('status', '==', 'processing')
    .limit(batchLimit)
    .get()
    .catch(() => ({ docs: [] }));
  return snap.docs
    .map((doc) => ({ id: doc.id, ref: doc.ref, data: doc.data() }))
    .filter((job) => workerJobLeaseExpired(job.data));
}

async function processQueuedSystemJobs(db, stats) {
  const batchLimit = runtimeNumber('automation.systemJobBatchLimit', systemJobLimit, 1, 500);
  const workerId = `github-actions-worker-${Date.now().toString(36)}`;
  const [queuedJobs, expiredProcessingJobs] = await Promise.all([
    listDueQueuedSystemJobs(db, batchLimit),
    listExpiredProcessingSystemJobs(db, Math.min(batchLimit, 100)),
  ]);
  const jobsById = new Map([...queuedJobs, ...expiredProcessingJobs].map((job) => [job.id, job]));
  const dueJobs = [...jobsById.values()]
    .sort((a, b) => {
      const priority = Number(b.data.priority || 0) - Number(a.data.priority || 0);
      if (priority) return priority;
      return workerJobRunAt(a.data).getTime() - workerJobRunAt(b.data).getTime();
    });

  stats.systemJobsSeen += dueJobs.length;
  for (const job of dueJobs) {
    const claimed = await claimWorkerSystemJob(db, job, workerId);
    if (!claimed) {
      stats.systemJobsSkippedClaims += 1;
      continue;
    }
    if (claimed.recovered) stats.systemJobsRecoveredLeases += 1;

    try {
      const result = await dispatchSystemJob(db, claimed, stats);
      await markSystemJobCompleted(claimed, result);
      stats.systemJobsProcessed += 1;
    } catch (error) {
      await markSystemJobFailed(db, claimed, error);
      stats.systemJobsFailed += 1;
    }
  }
}

async function processAssignedRequests(db, stats) {
  const snap = await db.collection('solicitudes')
    .where('status', '==', 'asignada')
    .limit(limit)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data();
    const teacherUid = data.assignedTeacherUid || data.profesor_asignado_id;
    if (!teacherUid) continue;

    const assignmentId = `${doc.id}_${teacherUid}`;
    const assignmentRef = db.collection('asignaciones').doc(assignmentId);
    const existing = await assignmentRef.get();
    if (existing.exists) continue;

    const studentId = data.studentId || data.alumno_id || null;
    const familyUid = data.familyUid || data.familia_id || null;
    await writeDoc(db.collection('asignaciones'), assignmentId, {
      requestId: doc.id,
      solicitud_id: doc.id,
      teacherUid,
      profesor_id: teacherUid,
      studentId,
      alumno_id: studentId,
      familyUid,
      familia_id: familyUid,
      materia: data.materia || data.subject || '',
      active: true,
      activa: true,
      lifecycleStatus: 'solicitud_aceptada',
      lifecycleVersion: CLASS_LIFECYCLE_VERSION,
      lifecycleUpdatedAt: isoNow(),
      lifecycleTimestamps: {
        solicitud_aceptada: isoNow(),
      },
      source: 'request_assignment_worker',
      createdAt: now(),
      updatedAt: now(),
    });
    await updateRef(doc.ref, {
      ...buildRequestLifecyclePatch('solicitud_aceptada', isoNow()),
      updatedAt: now(),
    });
    await writeDoc(db.collection('solicitudMatches'), `${doc.id}_${teacherUid}`, {
      status: 'asignado',
      estado: 'asignado',
      selectedAt: now(),
      updatedAt: now(),
    });
    await addAutomationEvent(db, {
      type: 'assignment_created',
      requestId: doc.id,
      assignmentId,
      teacherUid,
      studentId,
    });
    stats.assignmentsCreated += 1;
  }
}

function classStatus(data) {
  return normalizeClassStatus(data.estado || data.status || '');
}

function timeToMinutes(value) {
  const match = clean(value, 8).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function classTimeRangeDurationMinutes(data = {}) {
  const start = timeToMinutes(data.hora_inicio || data.startTime);
  const end = timeToMinutes(data.hora_fin || data.endTime);
  return start !== null && end !== null && end > start ? end - start : null;
}

function classDurationMinutes(data = {}) {
  const timeRange = classTimeRangeDurationMinutes(data);
  if (timeRange !== null) return timeRange;
  const explicit = Number(data.durationMinutes ?? data.duracion_minutos ?? data.duration);
  return Number.isFinite(explicit) && explicit > 0 ? explicit : 60;
}

function proratedClassAmount(data = {}, hourlyFields = [], amountFields = []) {
  const duration = classDurationMinutes(data);
  for (const field of hourlyFields) {
    const hourly = Number(data[field]);
    if (Number.isFinite(hourly) && hourly > 0) return Math.round(((hourly * duration / 60) + Number.EPSILON) * 100) / 100;
  }
  const timeRange = classTimeRangeDurationMinutes(data);
  for (const field of amountFields) {
    const amount = Number(data[field]);
    if (Number.isFinite(amount) && amount > 0) {
      return timeRange !== null && timeRange !== 60
        ? Math.round(((amount * duration / 60) + Number.EPSILON) * 100) / 100
        : Math.round((amount + Number.EPSILON) * 100) / 100;
    }
  }
  return 0;
}

function classFamilyAmount(data = {}) {
  return proratedClassAmount(
    data,
    ['familyHourlyRate', 'precio_hora_familia', 'familyRatePerHour', 'tarifa_hora_familia'],
    ['precio_total', 'familyAmount', 'amount', 'total'],
  );
}

function classHasPaidStatus(data = {}) {
  const status = normalizePaymentStatus(data.paymentStatus || data.familyPaymentStatus || data.estado_pago || data.estado_pago_familia);
  return PAID_PAYMENT_STATUSES.includes(status);
}

function paymentScheduleKeysFor(data = {}) {
  const assignmentId = clean(data.assignmentId || data.asignacion_id || data.id, 180);
  const teacherUid = clean(data.teacherUid || data.profesor_id, 180);
  const studentId = clean(data.studentId || data.alumno_id, 180);
  return [
    assignmentId ? `assignment:${assignmentId}` : '',
    teacherUid && studentId ? `teacher-student:${teacherUid}:${studentId}` : '',
    teacherUid ? `teacher:${teacherUid}` : '',
  ].filter(Boolean);
}

function buildPaymentScheduleIndex(schedules = []) {
  const index = new Map();
  for (const schedule of schedules) {
    index.set(schedule.id, schedule);
    paymentScheduleKeysFor(schedule).forEach((key) => index.set(key, schedule));
  }
  return index;
}

function paymentScheduleForClass(data = {}, scheduleIndex = new Map()) {
  for (const key of paymentScheduleKeysFor(data)) {
    const schedule = scheduleIndex.get(key);
    if (schedule) return schedule;
  }
  return null;
}

function classEndAt(data) {
  const date = clean(data.fecha || data.date, 20);
  if (!date) return null;
  const startTime = clean(data.hora_inicio || data.startTime || '23:59', 8).slice(0, 5);
  const endTime = clean(data.hora_fin || data.endTime || startTime || '23:59', 8).slice(0, 5);
  const end = new Date(`${date}T${endTime || '23:59'}:00`);
  if (Number.isNaN(end.getTime())) return null;

  if (!data.hora_fin && !data.endTime && Number(data.duracion_minutos || data.durationMinutes || 0) > 0) {
    end.setMinutes(end.getMinutes() + Number(data.duracion_minutos || data.durationMinutes || 0));
  }
  return end;
}

function classEndedMoreThan(data, minutes) {
  return classEnded(data, minutes);
}

async function resolveClassRecipients(db, data) {
  const teacherUid = clean(data.teacherUid || data.profesor_id || data.teacherUserUid);
  let familyUid = clean(data.familyUid || data.familia_id || data.familyUserUid);
  const studentId = clean(data.studentId || data.alumno_id || data.studentUid);

  if (!familyUid && studentId) {
    const studentDoc = await db.collection('alumnos').doc(studentId).get();
    const student = studentDoc.exists ? studentDoc.data() : {};
    familyUid = clean(student.familyUid || student.familia_id || student.userUid || student.usuario_id);
  }

  if (familyUid) {
    const familyDoc = await db.collection('familias').doc(familyUid).get();
    if (familyDoc.exists) {
      const family = familyDoc.data();
      familyUid = clean(family.userUid || family.usuario_id || familyUid);
    }
  }

  return { teacherUid, familyUid, studentId };
}

function participantUidsFromChat(chat = {}) {
  const map = chat.participantUids && typeof chat.participantUids === 'object'
    ? Object.keys(chat.participantUids).filter((uid) => chat.participantUids[uid] !== false)
    : [];
  return uniq([
    ...map,
    chat.familyUserUid,
    chat.familyUid,
    chat.familia_user_uid,
    chat.familia_id,
    chat.teacherUserUid,
    chat.teacherUid,
    chat.profesor_user_uid,
    chat.profesor_id,
    chat.adminUid,
  ].map((uid) => clean(uid, 180)).filter(Boolean));
}

async function recipientUidsForChat(db, chat = {}, senderUid = '') {
  const admins = await getAdminUsers(db).catch(() => []);
  return uniq([
    ...participantUidsFromChat(chat),
    ...admins.map((user) => user.id),
  ]).filter((uid) => uid && uid !== clean(senderUid, 180));
}

async function roleForChatParticipant(db, uid, chat = {}) {
  const target = clean(uid, 180);
  if (!target) return '';
  const familyIds = new Set([
    chat.familyUserUid,
    chat.familyUid,
    chat.familia_user_uid,
    chat.familia_id,
    chat.ownerUid,
  ].map((item) => clean(item, 180)).filter(Boolean));
  const teacherIds = new Set([
    chat.teacherUserUid,
    chat.teacherUid,
    chat.profesor_user_uid,
    chat.profesor_id,
  ].map((item) => clean(item, 180)).filter(Boolean));
  if (familyIds.has(target)) return 'familia';
  if (teacherIds.has(target)) return 'profesor';

  const userSnap = await db.collection('users').doc(target).get().catch(() => null);
  if (userSnap?.exists) {
    const user = userSnap.data();
    return clean(user.role || user.rol || '', 40);
  }
  return '';
}

function scheduleProposalLabel(data = {}) {
  const date = clean(data.fecha || data.date, 20);
  const start = clean(data.hora_inicio || data.startTime || data.hora, 8);
  const end = clean(data.hora_fin || data.endTime, 8);
  return [clean(data.materia || data.subject || 'Clase', 120), date, [start, end].filter(Boolean).join(' - ')].filter(Boolean).join(' - ');
}

function scheduleProposalPayload(chatId, proposalId, proposal = {}, chat = {}) {
  return {
    id: proposalId,
    chatId,
    proposalId,
    assignmentId: chat.assignmentId || chat.asignacion_id || proposal.assignmentId || proposal.asignacion_id || chatId,
    familyUid: chat.familyUid || chat.familia_id || proposal.familyUid || proposal.familia_id || '',
    familyUserUid: chat.familyUserUid || '',
    teacherUid: chat.teacherUid || chat.profesor_id || proposal.teacherUid || proposal.profesor_id || '',
    teacherUserUid: chat.teacherUserUid || '',
    studentId: chat.studentId || chat.alumno_id || proposal.studentId || proposal.alumno_id || '',
    classId: proposal.classId || proposal.clase_id || '',
    proposedByUid: proposal.proposedByUid || proposal.createdByUid || '',
    proposedByRole: proposal.proposedByRole || proposal.createdByRole || '',
    respondedByUid: proposal.respondedByUid || '',
    respondedByRole: proposal.respondedByRole || '',
    status: proposal.status || proposal.estado || '',
    materia: proposal.materia || proposal.subject || chat.materia || chat.subject || '',
    subject: proposal.subject || proposal.materia || chat.subject || chat.materia || '',
    fecha: proposal.fecha || proposal.date || '',
    date: proposal.date || proposal.fecha || '',
    hora_inicio: proposal.hora_inicio || proposal.startTime || '',
    startTime: proposal.startTime || proposal.hora_inicio || '',
    hora_fin: proposal.hora_fin || proposal.endTime || '',
    endTime: proposal.endTime || proposal.hora_fin || '',
    scheduleKind: proposal.scheduleKind || proposal.kind || '',
    recurrenceLabel: proposal.recurrenceLabel || '',
    preview: scheduleProposalLabel({ ...chat, ...proposal }),
  };
}

async function chatById(db, chatCache, chatId) {
  const id = clean(chatId, 180);
  if (!id) return null;
  if (chatCache.has(id)) return chatCache.get(id);
  const snap = await db.collection('chats').doc(id).get().catch(() => null);
  const chat = snap?.exists ? { id: snap.id, ...snap.data() } : null;
  chatCache.set(id, chat);
  return chat;
}

function isSystemChatMessage(message = {}) {
  const role = lower(message.senderRole || message.role);
  const uid = clean(message.senderUid || message.createdByUid, 180);
  return role === 'system' || uid === 'system' || message.fromAutomation === true;
}

function chatEventBackfillDate(data = {}, fields = []) {
  for (const field of fields) {
    const date = dateFromFirestore(data[field]);
    if (date) return date;
  }
  return null;
}

function isRecentChatEventForBackfill(data = {}, fields = [], lookbackMs = 48 * 60 * 60 * 1000) {
  const date = chatEventBackfillDate(data, fields);
  if (!date) return true;
  return Date.now() - date.getTime() <= lookbackMs;
}

function recentEntityDate(data = {}) {
  return dateFromFirestore(data.updatedAt || data.updated_at || data.createdAt || data.created_at || data.fecha || data.date);
}

function isRecentEntityForBackfill(data = {}, lookbackMs = 72 * 60 * 60 * 1000) {
  const date = recentEntityDate(data);
  if (!date) return true;
  return Date.now() - date.getTime() <= lookbackMs;
}

function documentAutomationStatus(data = {}) {
  return lower(data.status || data.estado || data.verificationStatus || data.estado_verificacion);
}

function documentStatusAutomationType(data = {}) {
  const status = documentAutomationStatus(data);
  if (['verified', 'verificado', 'validado', 'aprobado', 'approved'].includes(status)) return 'document.verified';
  if (['rejected', 'rechazado', 'denegado', 'corregir', 'needs_correction'].includes(status)) return 'document.rejected';
  if (['expired', 'caducado'].includes(status)) return 'document.expired';
  return '';
}

function incidentResolved(data = {}) {
  const status = lower(data.status || data.estado);
  return ['resolved', 'resuelta', 'cerrada', 'closed', 'archived', 'archivada'].includes(status);
}

function paymentBackfillType(data = {}) {
  const status = normalizePaymentStatus(data.familyPaymentStatus || data.estado_pago_familia || data.paymentStatus || data.estado || data.status);
  if (['validado', 'pagado'].includes(status) || isPaymentVerified(data)) return 'payment.verified';
  if (isPaymentOverdue(data) || status === 'vencido') return 'payment.overdue';
  return 'payment.created';
}

function classBackfillType(data = {}) {
  const status = normalizeClassStatus(data.estado || data.status || data.lifecycleStatus || '');
  if (['realizada', 'completada', 'completed'].includes(status)) return 'class.completed';
  if (['cancelada', 'cancelled', 'canceled'].includes(status)) return 'class.cancelled';
  if (isScheduledClassStatus(status)) return 'class.scheduled';
  return '';
}

function requestBackfillShouldRun(data = {}) {
  const status = lower(data.status || data.estado || 'nueva');
  if (data.matchStatus === 'ready') return false;
  if (data.assignedTeacherUid || data.profesor_asignado_id) return false;
  return ['nueva', 'pendiente', 'pending', ''].includes(status);
}

function profileBackfillShouldRun(data = {}) {
  if (data.active === false || data.activo === false) return false;
  return true;
}

function profileIsVerified(data = {}) {
  const status = normalizeStatus(data);
  return ['verificado', 'validado', 'verified', 'active', 'activo'].includes(status);
}

async function processEntityAutomationBackfill(db, stats) {
  if (!runtimeBoolean('automation.entityBackfillEnabled', true)) return;
  const scanLimit = runtimeNumber('automation.entityBackfillScanLimit', limit, 10, 1000);
  const lookbackHours = runtimeNumber('automation.entityBackfillLookbackHours', 72, 1, 720);
  const lookbackMs = lookbackHours * 60 * 60 * 1000;
  const [
    users,
    teachers,
    families,
    requests,
    assignments,
    classes,
    payments,
    documents,
    incidents,
    reviews,
  ] = await Promise.all([
    listCollection(db, 'users', scanLimit).catch(() => []),
    listCollection(db, 'profesores', scanLimit).catch(() => []),
    listCollection(db, 'familias', scanLimit).catch(() => []),
    listCollection(db, 'solicitudes', scanLimit).catch(() => []),
    listCollection(db, 'asignaciones', scanLimit).catch(() => []),
    listCollection(db, 'clases', scanLimit).catch(() => []),
    listCollection(db, 'pagos', scanLimit).catch(() => []),
    listCollection(db, 'documentos', scanLimit).catch(() => []),
    listCollection(db, 'incidencias', scanLimit).catch(() => []),
    listCollection(db, 'valoraciones', scanLimit).catch(() => []),
  ]);

  const materializeRecent = async (event) => {
    stats.entityBackfillEventsChecked += 1;
    if (!isRecentEntityForBackfill(event.data || {}, lookbackMs)) {
      stats.entityBackfillSkippedOld += 1;
      return false;
    }
    await materializeWorkerAutomationPlan(db, event, stats);
    stats.entityBackfillEventsMaterialized += 1;
    return true;
  };

  for (const user of users) {
    await materializeRecent({
      type: 'user.registered',
      entityType: 'users',
      entityId: user.id,
      data: { id: user.id, ...user },
      source: 'github_actions_worker.users_backfill',
    });
  }

  for (const teacher of teachers) {
    if (!profileBackfillShouldRun(teacher)) continue;
    await materializeRecent({
      type: 'profile.updated',
      entityType: 'profesores',
      entityId: teacher.id,
      data: { id: teacher.id, userType: 'profesores', ...teacher },
      source: 'github_actions_worker.professors_profile_backfill',
    });
    if (profileIsVerified(teacher)) {
      await materializeRecent({
        type: 'teacher.verified',
        entityType: 'profesores',
        entityId: teacher.id,
        data: { id: teacher.id, userType: 'profesores', ...teacher },
        source: 'github_actions_worker.professors_verified_backfill',
      });
    }
  }

  for (const family of families) {
    if (!profileBackfillShouldRun(family)) continue;
    await materializeRecent({
      type: 'profile.updated',
      entityType: 'familias',
      entityId: family.id,
      data: { id: family.id, userType: 'familias', ...family },
      source: 'github_actions_worker.families_profile_backfill',
    });
  }

  for (const request of requests) {
    if (!requestBackfillShouldRun(request)) continue;
    await materializeRecent({
      type: 'request.created',
      entityType: 'solicitudes',
      entityId: request.id,
      data: { id: request.id, ...request },
      source: 'github_actions_worker.requests_backfill',
    });
  }

  for (const assignment of assignments) {
    const [teacherUserUid, familyUserUid] = await Promise.all([
      resolveProfileUserUid(db, 'profesores', assignment.teacherUid || assignment.profesor_id, assignment.teacherUserUid),
      resolveProfileUserUid(db, 'familias', assignment.familyUid || assignment.familia_id, assignment.familyUserUid),
    ]);
    await materializeRecent({
      type: 'assignment.created',
      entityType: 'asignaciones',
      entityId: assignment.id,
      data: { id: assignment.id, ...assignment, teacherUserUid, familyUserUid },
      source: 'github_actions_worker.assignments_backfill',
    });
  }

  for (const classData of classes) {
    if (!isAfterClassReset(classData)) continue;
    const type = classBackfillType(classData);
    if (!type) continue;
    const enriched = await enrichWorkerClassData(db, classData);
    await materializeRecent({
      type,
      entityType: 'clases',
      entityId: classData.id,
      data: { id: classData.id, ...enriched },
      source: 'github_actions_worker.classes_backfill',
    });
  }

  for (const payment of payments) {
    const enriched = await enrichWorkerPaymentData(db, payment);
    await materializeRecent({
      type: paymentBackfillType(payment),
      entityType: 'pagos',
      entityId: payment.id,
      data: { id: payment.id, ...enriched },
      source: 'github_actions_worker.payments_backfill',
    });
  }

  for (const document of documents) {
    const normalized = normalizeDocumentRecord({ id: document.id, ...document });
    await materializeRecent({
      type: 'document.created',
      entityType: 'documentos',
      entityId: document.id,
      data: { id: document.id, ...normalized, ...document },
      source: 'github_actions_worker.documents_backfill',
    });
    const statusType = documentStatusAutomationType(document);
    if (statusType) {
      await materializeRecent({
        type: statusType,
        entityType: 'documentos',
        entityId: document.id,
        data: { id: document.id, ...normalized, ...document },
        source: 'github_actions_worker.documents_status_backfill',
      });
    }
  }

  for (const incident of incidents) {
    await materializeRecent({
      type: incidentResolved(incident) ? 'incident.resolved' : 'incident.created',
      entityType: 'incidencias',
      entityId: incident.id,
      data: { id: incident.id, ...incident },
      source: 'github_actions_worker.incidents_backfill',
    });
  }

  for (const review of reviews) {
    await materializeRecent({
      type: 'review.created',
      entityType: 'valoraciones',
      entityId: review.id,
      data: { id: review.id, ...review },
      source: 'github_actions_worker.reviews_backfill',
    });
  }
}

async function processChatAutomationBackfill(db, stats) {
  const scanLimit = runtimeNumber('automation.chatBackfillScanLimit', limit, 10, 2000);
  const lookbackHours = runtimeNumber('automation.chatBackfillLookbackHours', 48, 1, 720);
  const lookbackMs = lookbackHours * 60 * 60 * 1000;
  const [messages, proposals] = await Promise.all([
    listCollectionGroup(db, 'mensajes', scanLimit).catch(() => []),
    listCollectionGroup(db, 'programaciones', scanLimit).catch(() => []),
  ]);
  const chatCache = new Map();

  for (const message of messages) {
    if (!message.__ref || isSystemChatMessage(message)) continue;
    if (!isRecentChatEventForBackfill(message, ['createdAt', 'created_at', 'sentAt', 'updatedAt'], lookbackMs)) {
      stats.chatBackfillSkippedOld += 1;
      continue;
    }
    const chat = await chatById(db, chatCache, message.chatId);
    if (!chat) continue;
    const senderUid = clean(message.senderUid || message.createdByUid, 180);
    const recipients = await recipientUidsForChat(db, chat, senderUid);
    stats.chatMessagesChecked += 1;
    for (const uid of recipients) {
      const eventId = `${message.chatId}_${message.id}`;
      await materializeWorkerAutomationPlan(db, {
        type: 'message.received',
        entityType: 'chats',
        entityId: eventId,
        data: {
          id: eventId,
          chatId: message.chatId,
          messageId: message.id,
          assignmentId: chat.assignmentId || chat.asignacion_id || '',
          recipientUid: uid,
          recipientRole: await roleForChatParticipant(db, uid, chat),
          senderUid,
          senderRole: message.senderRole || '',
          senderName: message.senderName || message.senderRole || 'ClasesDe10',
          body: message.body || message.text || '',
          preview: clean(message.body || message.text, 240),
        },
        source: 'github_actions_worker.chat_message_backfill',
      }, stats);
      stats.chatMessageEventsBackfilled += 1;
    }
  }

  for (const proposal of proposals) {
    if (!proposal.__ref) continue;
    if (!isRecentChatEventForBackfill(proposal, ['respondedAt', 'updatedAt', 'proposedAt', 'createdAt', 'created_at'], lookbackMs)) {
      stats.chatBackfillSkippedOld += 1;
      continue;
    }
    const chat = await chatById(db, chatCache, proposal.chatId);
    if (!chat) continue;
    const status = lower(proposal.status || proposal.estado);
    const base = scheduleProposalPayload(proposal.chatId, proposal.id, proposal, chat);
    const actorUid = clean(base.proposedByUid, 180);
    stats.chatScheduleProposalsChecked += 1;

    if (!status || status === 'propuesta' || status === 'pending' || status === 'proposed') {
      const recipients = participantUidsFromChat(chat).filter((uid) => uid && uid !== actorUid);
      for (const uid of recipients) {
        const eventId = `${proposal.chatId}_${proposal.id}`;
        await materializeWorkerAutomationPlan(db, {
          type: 'schedule.proposed',
          entityType: 'chats.programaciones',
          entityId: eventId,
          data: {
            ...base,
            recipientUid: uid,
            recipientRole: await roleForChatParticipant(db, uid, chat),
          },
          source: 'github_actions_worker.schedule_proposed_backfill',
        }, stats);
        stats.chatScheduleEventsBackfilled += 1;
      }
      continue;
    }

    const type = ['aceptada', 'accepted', 'confirmada', 'confirmed'].includes(status)
      ? 'schedule.accepted'
      : ['rechazada', 'rejected', 'cancelada', 'cancelled', 'canceled'].includes(status)
        ? 'schedule.rejected'
        : '';
    if (!type) continue;

    await materializeWorkerAutomationPlan(db, {
      type,
      entityType: 'chats.programaciones',
      entityId: `${proposal.chatId}_${proposal.id}`,
      data: base,
      source: 'github_actions_worker.schedule_status_backfill',
    }, stats);
    stats.chatScheduleEventsBackfilled += 1;
  }
}

async function resolveProfileUserUid(db, collectionName, profileId, fallback = '') {
  const id = clean(profileId, 180);
  if (!id) return clean(fallback, 180);
  const snap = await db.collection(collectionName).doc(id).get().catch(() => null);
  if (!snap?.exists) return clean(fallback || id, 180);
  const data = snap.data();
  return clean(data.userUid || data.firebase_uid || data.usuario_id || fallback || id, 180);
}

function fullName(...parts) {
  return parts.map((part) => clean(part, 120)).filter(Boolean).join(' ').trim();
}

function participantMap(values = []) {
  return values
    .map((value) => clean(value, 180))
    .filter(Boolean)
    .reduce((acc, uid) => ({ ...acc, [uid]: true }), {});
}

async function profileRecord(db, collectionName, profileId) {
  const id = clean(profileId, 180);
  if (!id) return { id: '', exists: false, data: {} };
  const snap = await db.collection(collectionName).doc(id).get().catch(() => null);
  return {
    id,
    exists: Boolean(snap?.exists),
    data: snap?.exists ? snap.data() : {},
  };
}

async function userRecord(db, uid) {
  const id = clean(uid, 180);
  if (!id) return { id: '', exists: false, data: {} };
  const snap = await db.collection('users').doc(id).get().catch(() => null);
  return {
    id,
    exists: Boolean(snap?.exists),
    data: snap?.exists ? snap.data() : {},
  };
}

async function ensureChatForAssignmentWorker(db, assignmentId, reason = 'automation') {
  const id = clean(assignmentId, 180);
  if (!id) return { created: false, reason: 'missing_assignment_id' };
  const assignmentSnap = await db.collection('asignaciones').doc(id).get();
  if (!assignmentSnap.exists) return { created: false, reason: 'assignment_not_found', assignmentId: id };

  const assignment = { id, ...assignmentSnap.data() };
  const teacherProfileId = clean(assignment.teacherUid || assignment.profesor_id, 180);
  const familyProfileId = clean(assignment.familyUid || assignment.familia_id, 180);
  const studentId = clean(assignment.studentId || assignment.alumno_id, 180);

  const [teacherProfile, familyProfile, studentProfile] = await Promise.all([
    profileRecord(db, 'profesores', teacherProfileId),
    profileRecord(db, 'familias', familyProfileId),
    profileRecord(db, 'alumnos', studentId),
  ]);
  const teacherUserUid = clean(assignment.teacherUserUid || teacherProfile.data.userUid || teacherProfile.data.firebase_uid || teacherProfile.data.usuario_id || teacherProfileId, 180);
  const familyUserUid = clean(assignment.familyUserUid || familyProfile.data.userUid || familyProfile.data.firebase_uid || familyProfile.data.usuario_id || familyProfileId, 180);
  const [teacherUser, familyUser] = await Promise.all([
    userRecord(db, teacherUserUid),
    userRecord(db, familyUserUid),
  ]);

  const teacherName = workerPersonName(
    'Profesor',
    teacherProfileId,
    fullName(teacherProfile.data.nombre || teacherUser.data.nombre, teacherProfile.data.apellidos || teacherUser.data.apellidos),
    teacherProfile.data.displayName,
    teacherUser.data.displayName,
    teacherProfile.data.email,
    teacherUser.data.email,
  );
  const familyName = workerPersonName(
    'Familia',
    familyProfileId,
    fullName(familyProfile.data.nombre || familyUser.data.nombre, familyProfile.data.apellidos || familyUser.data.apellidos),
    familyProfile.data.displayName,
    familyUser.data.displayName,
    familyProfile.data.email,
    familyUser.data.email,
  );
  const studentName = workerPersonName(
    'Alumno',
    studentId,
    fullName(studentProfile.data.nombre, studentProfile.data.apellidos),
    studentProfile.data.displayName,
    studentProfile.data.email,
  );
  const subject = clean(assignment.materia || assignment.subject, 180);
  const introBody = `${teacherName} ya esta asignado. Usad este chat para acordar fecha y hora de la primera clase. Cuando una parte proponga un horario, la otra podra aceptarlo y se creara automaticamente la clase en el calendario.`;
  const chatRef = db.collection('chats').doc(id);
  const chatSnap = await chatRef.get();
  const chatData = chatSnap.exists ? chatSnap.data() : {};
  const introAlreadySent = Boolean(chatSnap.exists && chatData.assignmentIntroSentAt);

  await writeDoc(db.collection('chats'), id, {
    assignmentId: id,
    asignacion_id: id,
    familyUid: familyProfileId,
    familia_id: familyProfileId,
    familyUserUid,
    teacherUid: teacherProfileId,
    profesor_id: teacherProfileId,
    teacherUserUid,
    studentId: studentId || null,
    alumno_id: studentId || null,
    materia: subject,
    subject,
    familyName,
    teacherName,
    studentName,
    participantUids: participantMap([familyProfileId, teacherProfileId, familyUserUid, teacherUserUid]),
    active: true,
    schedulingStatus: chatData.schedulingStatus || assignment.schedulingStatus || assignment.estado_programacion || 'pendiente_horario',
    relationshipStage: chatData.relationshipStage || 'pendiente_horario',
    relationshipStatus: 'active',
    source: chatData.source || 'assignment_automation',
    lastRelationshipEvent: chatData.lastRelationshipEvent || 'assignment_chat_ready',
    relationshipUpdatedAt: now(),
    createdAt: chatSnap.exists ? (chatData.createdAt || now()) : now(),
    updatedAt: now(),
    ...(introAlreadySent ? {} : {
      lastMessage: introBody,
      lastMessageAt: now(),
      assignmentIntroSentAt: now(),
    }),
  });

  if (!introAlreadySent && !dryRun) {
    const introRef = chatRef.collection('mensajes').doc('system_assignment_intro');
    const introSnap = await introRef.get().catch(() => null);
    if (!introSnap?.exists) {
      await introRef.create({
        senderUid: 'system',
        senderRole: 'system',
        senderName: 'ClasesDe10',
        body: introBody,
        systemEventType: 'assignment_intro',
        createdAt: now(),
        readBy: {},
      }).catch((error) => {
        if (error.code !== 6 && error.code !== 'already-exists') throw error;
      });
    }
  }

  await writeDoc(db.collection('asignaciones'), id, {
    chatId: id,
    schedulingStatus: 'pendiente_horario',
    estado_programacion: 'pendiente_horario',
    relationshipStage: 'pendiente_horario',
    teacherUserUid,
    familyUserUid,
    updatedAt: now(),
  });

  return {
    created: !chatSnap.exists,
    introSent: !introAlreadySent,
    assignmentId: id,
    teacherUserUid,
    familyUserUid,
    reason,
  };
}

async function enrichWorkerClassData(db, data = {}) {
  const recipients = await resolveClassRecipients(db, data);
  const teacherUserUid = await resolveProfileUserUid(db, 'profesores', recipients.teacherUid, data.teacherUserUid || recipients.teacherUid);
  return {
    ...data,
    teacherUserUid,
    familyUserUid: recipients.familyUid || data.familyUserUid || '',
  };
}

async function enrichWorkerPaymentData(db, data = {}) {
  const teacherProfileId = clean(data.teacherUid || data.profesor_id || data.teacherId, 180);
  const familyProfileId = clean(data.familyUid || data.familia_id || data.familyId, 180);
  const [teacherUserUid, familyUserUid] = await Promise.all([
    resolveProfileUserUid(db, 'profesores', teacherProfileId, data.teacherUserUid || teacherProfileId),
    resolveProfileUserUid(db, 'familias', familyProfileId, data.familyUserUid || familyProfileId),
  ]);
  return {
    ...data,
    teacherUserUid,
    familyUserUid,
  };
}

function classLabel(data) {
  const date = clean(data.fecha || data.date);
  const time = clean(data.hora_inicio || data.startTime).slice(0, 5);
  const subject = clean(data.materia || data.subject || 'clase');
  return [subject, date, time].filter(Boolean).join(' · ');
}

async function loadClassDocsByStatuses(db, statuses, perStatusLimit = limit) {
  const docs = new Map();
  const snap = await db.collection('clases')
    .where('classResetGeneration', '==', CLASS_RESET_GENERATION)
    .limit(Math.max(perStatusLimit * statuses.length, perStatusLimit))
    .get();
  snap.docs.forEach((doc) => {
    const data = doc.data();
    if (!isAfterClassReset(data)) return;
    if (statuses.includes(data.estado) || statuses.includes(data.status)) docs.set(doc.id, doc);
  });
  return [...docs.values()];
}

async function loadScheduledClassDocs(db) {
  return loadClassDocsByStatuses(db, SCHEDULED_CLASS_STATUSES);
}

async function writeLifecycleHistoryOnce(db, transition) {
  const id = transition.transitionId;
  if (!id) return false;
  const ref = db.collection('classLifecycleEvents').doc(id);
  const existing = await ref.get();
  if (existing.exists) return false;
  await writeDoc(db.collection('classLifecycleEvents'), id, {
    ...transition.historyEvent,
    createdAt: now(),
    updatedAt: now(),
  }, { merge: false });
  return true;
}

async function notifyLifecycleRecipients(db, transition, recipients, stats) {
  for (const notification of transition.notifications || []) {
    if (notification.role === 'admin') {
      stats.lifecycleNotificationsCreated += await notifyAdminsOnce(
        db,
        notification.title,
        notification.body,
        notification.payload,
        notification.key,
      );
      continue;
    }

    const targetUid = notification.role === 'teacher' ? recipients.teacherUid : recipients.familyUid;
    const created = await notifyUserOnce(
      db,
      targetUid,
      notification.title,
      notification.body,
      notification.payload,
      notification.key,
    );
    if (created) stats.lifecycleNotificationsCreated += 1;
  }
}

async function processClassLifecycle(db, stats) {
  const classes = await listCollection(db, 'clases', limit);
  for (const data of classes) {
    if (!data.__ref) continue;
    const transition = buildClassLifecycleTransition(data.id, data);
    stats.lifecycleClassesEvaluated += 1;
    if (!transition.changed) continue;

    await updateRef(data.__ref, {
      ...transition.patch,
      lifecycleTransitionCount: admin.firestore.FieldValue.increment(1),
      updatedAt: now(),
    });

    const historyCreated = await writeLifecycleHistoryOnce(db, transition);
    if (historyCreated) stats.lifecycleHistoryEventsCreated += 1;

    await writeDoc(db.collection('auditLogs'), `audit_${transition.transitionId}`, {
      ...transition.auditEvent,
      schemaVersion: 'audit_log_v1',
      module: 'classes',
      severity: 'info',
      origin: 'github_actions_worker',
      source: 'class_lifecycle_engine',
      actorUid: 'system',
      actorEmail: '',
      actorRole: 'system',
      actorType: 'automation',
      responsibleUid: 'system',
      responsibleEmail: '',
      action: transition.auditEvent.action || transition.auditEvent.type || 'class.lifecycle_transition',
      description: transition.auditEvent.reason || `Clase transicionada a ${transition.to}`,
      before: { lifecycleStatus: transition.from || null },
      after: { lifecycleStatus: transition.to },
      changes: [{ field: 'lifecycleStatus', before: transition.from || null, after: transition.to }],
      context: {},
      error: null,
      createdAt: now(),
      created_at: isoNow(),
      updatedAt: now(),
    }, { merge: false });

    await addAutomationEvent(db, {
      type: 'class_lifecycle_transition',
      classId: data.id,
      from: transition.from || null,
      to: transition.to,
      target: transition.target,
      lifecycleVersion: CLASS_LIFECYCLE_VERSION,
    });
    if (transition.to === 'pago_en_revision') {
      await addAutomationEvent(db, {
        type: 'class.payment_review_started',
        classId: data.id,
        paymentId: clean(data.linkedFamilyPaymentId || data.familyPaymentId || data.paymentId, 180),
        lifecycleVersion: CLASS_LIFECYCLE_VERSION,
      });
      stats.lifecyclePaymentReviewEventsCreated += 1;
    }

    const recipients = await resolveClassRecipients(db, data);
    await notifyLifecycleRecipients(db, transition, recipients, stats);
    stats.lifecycleTransitionsApplied += 1;
  }
}

async function findOpenClassIncident(db, classId) {
  const targetClassId = clean(classId, 180);
  if (!targetClassId) return null;
  const isOpenIncident = (item) => {
    const data = item.data();
    const status = lower(data.estado || data.status);
    return !['cerrada', 'resuelta', 'closed', 'resolved'].includes(status);
  };

  const byClassId = await db.collection('incidencias').where('classId', '==', targetClassId).limit(10).get().catch(() => null);
  const existingByClassId = byClassId?.docs?.find(isOpenIncident);
  if (existingByClassId) return { id: existingByClassId.id, ...existingByClassId.data() };

  const byLegacyClassId = await db.collection('incidencias').where('clase_id', '==', targetClassId).limit(10).get().catch(() => null);
  const existingByLegacyClassId = byLegacyClassId?.docs?.find(isOpenIncident);
  return existingByLegacyClassId ? { id: existingByLegacyClassId.id, ...existingByLegacyClassId.data() } : null;
}

async function createClassIncidentOnce(db, classId, classData, source, notes, stats) {
  const id = notificationId('class_incident', source, classId);
  const ref = db.collection('incidencias').doc(id);
  const existing = await ref.get();
  if (existing.exists) return false;
  const existingOpenIncident = await findOpenClassIncident(db, classId);
  if (existingOpenIncident) return false;
  const aiClassification = classifyIncident(textFromValues(source, notes, classLabel(classData), classData), {
    source,
    classId,
    status: classStatus(classData),
  });
  const prioridad = normalizeIncidentPriority(aiClassification.priority, aiClassification.category);
  const meta = incidentPriorityMeta(prioridad);

  await writeDoc(db.collection('incidencias'), id, {
    ...buildClassIncidentPayload(classId, classData, source, notes, 'automation'),
    aiClassification,
    aiVersion: AI_FEATURES_VERSION,
    categoria: aiClassification.category,
    category: aiClassification.category,
    priority: meta.severity,
    prioridad,
    priorityRank: meta.rank,
    suggestedActions: aiClassification.suggestedActions,
    reportado_por: 'automation',
    createdByUid: 'automation',
    createdAt: now(),
    created_at: isoNow(),
    updatedAt: now(),
    updated_at: isoNow(),
  }, { merge: false });
  stats.incidentsCreated += 1;
  return true;
}

async function createOperationalIncidentOnce(db, kind, sourceData = {}, stats) {
  const payload = buildAutomaticIncidentPayload(kind, sourceData, { config: platformConfigRuntime });
  const id = clean(payload.id || notificationId('operational_incident', kind, sourceData.id || sourceData.classId || sourceData.paymentId || sourceData.documentId), 160);
  const ref = db.collection('incidencias').doc(id);
  const existing = await ref.get();
  if (existing.exists) return false;
  const aiClassification = classifyIncident(textFromValues(payload.titulo, payload.descripcion, kind, sourceData), {
    source: kind,
    ...sourceData,
  });
  const prioridad = normalizeIncidentPriority(payload.prioridad || payload.priority || aiClassification.priority, aiClassification.category);
  const meta = incidentPriorityMeta(prioridad);
  await writeDoc(db.collection('incidencias'), id, {
    ...payload,
    id,
    ticketId: payload.ticketId || `AUTO-${id.slice(-10).toUpperCase()}`,
    aiClassification,
    aiVersion: AI_FEATURES_VERSION,
    categoria: payload.categoria || aiClassification.category,
    category: payload.category || payload.categoria || aiClassification.category,
    prioridad,
    priority: meta.severity,
    priorityRank: meta.rank,
    suggestedActions: payload.suggestedActions?.length ? payload.suggestedActions : aiClassification.suggestedActions,
    reportado_por: 'automation',
    createdByUid: 'automation',
    updatedAt: now(),
    updated_at: isoNow(),
  }, { merge: false });
  stats.incidentsCreated += 1;
  stats.operationalIncidentsCreated = (stats.operationalIncidentsCreated || 0) + 1;
  await addAutomationEvent(db, {
    type: 'incident.auto_created',
    incidentId: id,
    kind,
    entityId: sourceData.id || sourceData.classId || sourceData.paymentId || sourceData.documentId || '',
  });
  return true;
}

async function processUpcomingClassReminders(db, stats) {
  const docs = await loadScheduledClassDocs(db);
  for (const doc of docs) {
    const data = doc.data();
    if (!isScheduledClassStatus(data.estado || data.status)) continue;

    const windows = classReminderWindows(data);
    if (!windows.length) continue;

    const { teacherUid, familyUid } = await resolveClassRecipients(db, data);
    const label = classLabel(data);
    for (const window of windows) {
      const payload = {
        type: 'class_reminder',
        window,
        classId: doc.id,
        url: '/pages/login.html',
      };
      const minutesText = window === '24h' ? 'manana' : 'en unas 2 horas';
      let created = 0;
      created += await notifyUserOnce(
        db,
        teacherUid,
        'Recordatorio de clase',
        `Tienes la clase ${label} ${minutesText}.`,
        payload,
        `class_reminder_${window}_${doc.id}_teacher`,
      ) ? 1 : 0;
      created += await notifyUserOnce(
        db,
        familyUid,
        'Recordatorio de clase',
        `La clase ${label} esta prevista ${minutesText}.`,
        payload,
        `class_reminder_${window}_${doc.id}_family`,
      ) ? 1 : 0;

      if (created > 0) stats.upcomingClassRemindersCreated += created;
    }
  }
}

async function processUnmarkedClasses(db, stats) {
  const docs = await loadScheduledClassDocs(db);
  const confirmationGraceMinutes = Math.max(24 * 60, runtimeNumber('automation.classConfirmationGraceMinutes', 24 * 60, 0, 43200));
  for (const doc of docs) {
    const data = doc.data();
    if (!isScheduledClassStatus(data.estado || data.status)) continue;
    if (!classEndedMoreThan(data, confirmationGraceMinutes)) continue;

    const { teacherUid, familyUid } = await resolveClassRecipients(db, data);
    const label = classLabel(data);
    const payload = {
      type: 'class_unmarked_after_24h',
      classId: doc.id,
      url: '/pages/login.html',
    };
    const key = `class_unmarked_after_24h_${doc.id}`;
    let created = 0;

    const teacherCreated = await notifyUserOnce(
      db,
      teacherUid,
      'Clase pendiente de marcar',
      `Han pasado 24h desde la clase ${label}. Marca si se dio o no desde tu panel.`,
      payload,
      `${key}_teacher`,
    );
    created += teacherCreated ? 1 : 0;
    if (teacherCreated) {
      await applyClassTrustPenalty(doc.ref, {
        classId: doc.id,
        notificationType: 'class_unmarked_after_24h',
        role: 'profesor',
        userUid: teacherUid,
        points: CLASS_UNMARKED_PENALTY_POINTS,
        reason: 'No marco si la clase se dio o no dentro de las 24h posteriores.',
      });
    }

    const familyCreated = await notifyUserOnce(
      db,
      familyUid,
      'Confirma si la clase se dio',
      `Han pasado 24h desde la clase ${label}. Confirma desde tu panel si se realizo o si hubo incidencia.`,
      payload,
      `${key}_family`,
    );
    created += familyCreated ? 1 : 0;
    if (familyCreated) {
      await applyClassTrustPenalty(doc.ref, {
        classId: doc.id,
        notificationType: 'class_unmarked_after_24h',
        role: 'familia',
        userUid: familyUid,
        points: CLASS_UNMARKED_PENALTY_POINTS,
        reason: 'No confirmo la asistencia de la clase dentro de las 24h posteriores.',
      });
    }

    created += await notifyAdminsOnce(
      db,
      'Clase sin registrar',
      `La clase ${label} sigue sin marcar 24h despues de terminar.`,
      payload,
      `${key}_admin`,
    );

    if (created > 0) {
      await updateRef(doc.ref, {
        lastUnmarkedReminderAt: now(),
        updatedAt: now(),
      });
      stats.classRemindersCreated += created;
    }
    if (classEndedMoreThan(data, 24 * 60)) {
      await createClassIncidentOnce(
        db,
        doc.id,
        data,
        'unmarked_after_24h',
        `La clase ${label} sigue sin marcar 24 horas despues de finalizar.`,
        stats,
      );
    }
    stats.classesChecked += 1;
  }
}

async function processAttendanceConfirmations(db, stats) {
  const docs = await loadClassDocsByStatuses(db, ['realizada', 'cancelada', 'reprogramada']);
  for (const doc of docs) {
    const data = doc.data();
    if (!classEnded(data, 60) && !['cancelada', 'reprogramada'].includes(classStatus(data))) continue;

    const summary = getClassAttendanceSummary(data);
    if (summary && summary !== data.attendanceStatus) {
      await updateRef(doc.ref, {
        attendanceStatus: summary,
        updatedAt: now(),
      });
    }

    const { teacherUid, familyUid } = await resolveClassRecipients(db, data);
    const label = classLabel(data);

    if (summary === 'pendiente_familia') {
      const created = await notifyUserOnce(
        db,
        familyUid,
        'Confirma la clase',
        `El profesor marco como realizada la clase ${label}. Confirma desde tu panel si se dio correctamente.`,
        { type: 'class_confirmation_needed', classId: doc.id, url: '/pages/login.html' },
        `class_confirmation_needed_${doc.id}_family`,
      );
      if (created) stats.attendanceRemindersCreated += 1;
    }

    if (summary === 'pendiente_profesor') {
      const created = await notifyUserOnce(
        db,
        teacherUid,
        'Confirma la clase',
        `La familia confirmo la clase ${label}. Revisa y marca la clase desde tu panel.`,
        { type: 'class_confirmation_needed', classId: doc.id, url: '/pages/login.html' },
        `class_confirmation_needed_${doc.id}_teacher`,
      );
      if (created) stats.attendanceRemindersCreated += 1;
    }

    if (['incidencia', 'discrepancia'].includes(summary) || ['cancelada', 'reprogramada'].includes(classStatus(data))) {
      const source = summary === 'discrepancia' ? 'attendance_mismatch' : `class_${classStatus(data) || 'incident'}`;
      await createClassIncidentOnce(
        db,
        doc.id,
        data,
        source,
        `Revisar incidencia de clase: ${label}. Estado asistencia: ${summary}.`,
        stats,
      );
      const adminNotifications = await notifyAdminsOnce(
        db,
        'Incidencia de clase',
        `Revisar la clase ${label}. Estado: ${summary}.`,
        { type: 'class_incident', classId: doc.id, source, url: '/pages/login.html' },
        `class_incident_${source}_${doc.id}_admin`,
      );
      if (adminNotifications) stats.attendanceRemindersCreated += adminNotifications;
    }
  }
}

async function processIncidentClassification(db, stats) {
  const snap = await db.collection('incidencias').limit(limit).get();
  for (const doc of snap.docs) {
    const data = doc.data();
    const status = lower(data.estado || data.status);
    if (['cerrada', 'resuelta', 'closed', 'resolved'].includes(status)) continue;
    if (data.aiClassification?.version === AI_FEATURES_VERSION) continue;

    const aiClassification = classifyIncident(textFromValues(
      data.titulo,
      data.title,
      data.descripcion,
      data.description,
      data.notas,
      data.notes,
      data.source,
      data.tipo,
      data.type,
    ), data);
    const prioridad = normalizeIncidentPriority(data.prioridad || data.priority || aiClassification.priority, aiClassification.category);
    const meta = incidentPriorityMeta(prioridad);

    await updateRef(doc.ref, {
      aiClassification,
      aiVersion: AI_FEATURES_VERSION,
      categoria: data.categoria || aiClassification.category,
      category: data.category || data.categoria || aiClassification.category,
      priority: meta.severity,
      prioridad,
      priorityRank: meta.rank,
      suggestedActions: data.suggestedActions || aiClassification.suggestedActions,
      updatedAt: now(),
    });
    stats.incidentsClassified += 1;

    if (aiClassification.priority <= 2) {
      const title = aiClassification.category === 'seguridad'
        ? 'Incidencia critica pendiente'
        : 'Incidencia prioritaria pendiente';
      await notifyAdminsOnce(
        db,
        title,
        `Revisar incidencia ${doc.id}: categoria ${aiClassification.category}, prioridad ${aiClassification.priority}.`,
        { type: 'incident_priority', incidentId: doc.id, category: aiClassification.category, url: '/pages/login.html' },
        `incident_priority_${doc.id}`,
      );
    }
  }
}

function paymentStatus(data) {
  return normalizePaymentStatus(data.familyPaymentStatus || data.estado_pago_familia || data.paymentStatus || data.estado || data.status);
}

function isoFromPaymentValue(value) {
  const date = dateFromFirestore(value);
  return date ? date.toISOString() : clean(value, 120);
}

function linkedFamilyPaymentContextPatch(payment = {}) {
  const status = isPaymentOverdue(payment) && !isPaymentVerified(payment)
    ? 'vencido'
    : paymentStatus(payment);
  const reviewStatus = [...OPEN_PAYMENT_STATUSES, 'vencido'].includes(status) ? status : '';
  return {
    linkedFamilyPaymentId: clean(payment.id || payment.paymentId, 180),
    linkedFamilyPaymentStatus: status,
    linkedFamilyPaymentRawStatus: status,
    linkedFamilyPaymentAmount: paymentAmount(payment),
    linkedFamilyPaymentCreatedAt: isoFromPaymentValue(payment.createdAt || payment.created_at),
    linkedFamilyPaymentUpdatedAt: isoFromPaymentValue(payment.updatedAt || payment.updated_at) || isoNow(),
    linkedFamilyPaymentDueAt: isoFromPaymentValue(payment.dueAt || payment.due_at || payment.fecha_vencimiento),
    linkedFamilyPaymentReference: clean(payment.referencia || payment.reference || payment.concepto, 240),
    familyPaymentReviewStatus: reviewStatus,
    pendingFamilyPaymentStatus: reviewStatus,
    updated_at: isoNow(),
  };
}

function classNeedsLinkedPaymentPatch(classData = {}, patch = {}) {
  return Object.entries(patch)
    .filter(([key]) => key !== 'updated_at')
    .some(([key, value]) => String(classData[key] ?? '') !== String(value ?? ''));
}

async function processLinkedFamilyPaymentContext(db, stats) {
  const snap = await db.collection('pagos').limit(limit).get();
  for (const doc of snap.docs) {
    const data = { id: doc.id, ...doc.data() };
    if (!isFamilyPayment(data)) continue;
    const classIds = Array.isArray(data.classIds) ? data.classIds.map(String).filter(Boolean) : [];
    if (!classIds.length) continue;

    const status = paymentStatus(data);
    const syncable = [
      ...OPEN_PAYMENT_STATUSES,
      ...PAID_PAYMENT_STATUSES,
      'vencido',
      'rechazado',
      'fallido',
      'devuelto',
      'disputado',
      'cancelado',
    ].includes(status) || isPaymentOverdue(data) || isPaymentVerified(data);
    if (!syncable) continue;

    const patch = linkedFamilyPaymentContextPatch(data);
    for (const classId of classIds) {
      const ref = db.collection('clases').doc(classId);
      const classSnap = await ref.get().catch(() => null);
      if (!classSnap?.exists) continue;
      const classData = classSnap.data() || {};
      if (!classNeedsLinkedPaymentPatch(classData, patch)) continue;
      await updateRef(ref, {
        ...patch,
        updatedAt: now(),
      });
      stats.classPaymentContextsUpdated += 1;
    }
  }
}

function isEndOfWeekWindow() {
  const day = new Date().getDay();
  return day === 5 || day === 6 || day === 0;
}

function classHasPrice(data) {
  return classFamilyAmount(data) > 0;
}

function paymentOverdueTiming(paymentState = {}) {
  const dueMs = paymentState.dueAt ? new Date(paymentState.dueAt).getTime() : NaN;
  if (!Number.isFinite(dueMs)) {
    return { dueMs: NaN, daysSinceDue: 0, daysSinceOverdue: 0, graceHours: 48 };
  }
  const graceHours = Number.isFinite(Number(paymentState.graceHours)) ? Number(paymentState.graceHours) : 48;
  const overdueStartMs = dueMs + graceHours * 60 * 60 * 1000;
  const currentMs = Date.now();
  return {
    dueMs,
    graceHours,
    daysSinceDue: Math.max(0, Math.floor((currentMs - dueMs) / MS_PER_DAY)),
    daysSinceOverdue: Math.max(0, Math.floor((currentMs - overdueStartMs) / MS_PER_DAY)),
  };
}

function paymentOverdueNotificationKey(step = {}, classId = '', target = 'family') {
  const id = clean(classId, 180);
  if (step.key === 'due_48h') return `payment_overdue_${id}_${target}`;
  return `${step.type}_${step.key}_${id}_${target}`;
}

async function notificationExists(db, userUid, key) {
  const targetUid = clean(userUid, 180);
  if (!targetUid || !key) return false;
  const id = notificationId('auto', key, targetUid);
  const snap = await db.collection('notificaciones').doc(id).get().catch(() => null);
  return Boolean(snap?.exists);
}

async function nextPaymentOverdueEscalationStep(db, { familyUid, classId, daysSinceDue }) {
  const eligibleSteps = PAYMENT_OVERDUE_ESCALATION_STEPS
    .filter((step) => daysSinceDue >= step.minDueDays);
  for (const step of eligibleSteps) {
    const key = paymentOverdueNotificationKey(step, classId, 'family');
    if (!(await notificationExists(db, familyUid, key))) return step;
  }
  return null;
}

function paymentOverdueAmountText(amount) {
  return amount > 0 ? ` de ${amount.toFixed(2)} EUR` : '';
}

function paymentOverdueFamilyBody(step, context = {}) {
  const amountText = paymentOverdueAmountText(context.amount);
  if (step.key === 'due_48h') {
    return `Ha pasado el margen de 48h para enviar el justificante de la clase ${context.label}. Puedes subirlo desde Pagos cuando lo tengas.`;
  }
  if (step.key === 'reminder_day_5') {
    return `Te lo recordamos con calma: sigue pendiente el justificante${amountText} de la clase ${context.label}. Cuando puedas, subelo para dejarlo al dia.`;
  }
  if (step.key === 'reminder_day_8') {
    return `Seguimos pendientes del justificante${amountText} de la clase ${context.label}. Si ya has hecho el Bizum, solo falta subir el comprobante para que podamos revisarlo.`;
  }
  if (step.key === 'reminder_day_11') {
    return `Nos gustaria ayudarte a cerrar este pago${amountText} cuanto antes. Dejarlo al dia evita avisos nuevos y mantiene las clases funcionando con normalidad.`;
  }
  return `Te avisamos con mucho cuidado: este pago${amountText} lleva mas de dos semanas pendiente. Si no queda regularizado pronto, tendremos que valorar pausar las clases con el profesor para proteger su trabajo y evitar que la deuda siga creciendo. Si ya has pagado, sube el justificante y lo revisamos.`;
}

function paymentOverdueAdminBody(step, context = {}) {
  const amountText = paymentOverdueAmountText(context.amount) || ' pendiente';
  if (step.finalWarning) {
    return `La familia ${context.familyName} acumula ${step.noticeNumber} avisos y mas de dos semanas sin justificar el pago${amountText} de ${context.studentName} con ${context.teacherName}. Preparar seguimiento cordial y posible pausa del profesor.`;
  }
  return `Aviso ${step.noticeNumber} de impago para ${context.familyName}: clase ${context.label} de ${context.studentName} con ${context.teacherName}${amountText}.`;
}

function paymentOverduePenaltyReason(step) {
  if (step.finalWarning) {
    return 'Impago sin regularizar tras mas de dos semanas y varios avisos cordiales.';
  }
  return `Aviso ${step.noticeNumber} por justificante de pago pendiente.`;
}

async function processPaymentReminders(db, stats) {
  const paymentsSnap = await db.collection('pagos').limit(limit).get();
  for (const doc of paymentsSnap.docs) {
    const data = doc.data();
    const status = paymentStatus(data);
    if (!['pendiente', 'solicitado', 'procesando'].includes(status)) continue;
    const title = isTeacherPayout(data) ? 'Bizum de profesor pendiente' : 'Pago pendiente de revisar';
    const body = isTeacherPayout(data)
      ? `Hay una solicitud de Bizum de profesor por ${paymentAmount(data).toFixed(2)} EUR pendiente.`
      : `Hay un pago familiar por ${paymentAmount(data).toFixed(2)} EUR pendiente de validacion.`;
    const created = await notifyAdminsOnce(db, title, body, {
      type: isTeacherPayout(data) ? 'teacher_payout_pending' : 'family_payment_pending',
      paymentId: doc.id,
      url: '/pages/login.html',
    }, `payment_pending_${doc.id}`);
    stats.paymentRemindersCreated += created;

    if (isPaymentOverdue(data)) {
      await updateRef(doc.ref, {
        estado: 'vencido',
        status: 'vencido',
        overdueAt: now(),
        updatedAt: now(),
      });
      stats.paymentsMarkedOverdue += 1;
    }
  }

  // Access restriction is a correctness gate, not a notification batch. It
  // must inspect the complete post-reset generation regardless of --limit.
  const {
    classes: paymentAccessClasses,
    paymentSchedules,
    lockedFamilies,
  } = await loadCompleteFamilyPaymentAccessContext(db);
  const scheduleIndex = buildPaymentScheduleIndex(paymentSchedules);
  const classesByFamily = new Map();
  paymentAccessClasses.forEach((classData) => {
    const familyUid = clean(classData.familyUid || classData.familia_id, 180);
    if (!familyUid) return;
    if (!classesByFamily.has(familyUid)) classesByFamily.set(familyUid, []);
    classesByFamily.get(familyUid).push(classData);
  });
  const lockedProfilesByUid = new Map();
  lockedFamilies.forEach((profile) => {
    [profile.id, profile.userUid, profile.usuario_id, profile.uid].map((value) => clean(value, 180)).filter(Boolean)
      .forEach((uid) => lockedProfilesByUid.set(uid, profile));
  });
  const familiesToEvaluate = new Set([
    ...classesByFamily.keys(),
    ...lockedFamilies.map((profile) => familyPaymentAccessProfileUid(profile)).filter(Boolean),
  ]);
  for (const familyUid of familiesToEvaluate) {
    const familyClasses = classesByFamily.get(familyUid) || [];
    const access = buildFamilyPaymentAccessState(familyClasses, scheduleIndex);
    const lockedProfile = lockedProfilesByUid.get(familyUid) || null;
    if (access.locked) {
      const profile = lockedProfile || await resolveFamilyPaymentAccessProfile(db, familyUid, lockedProfilesByUid);
      const wasLocked = profile.paymentAccessLocked === true;
      if (!familyPaymentAccessFactsMatch(profile, access)) {
        const patch = buildFamilyPaymentAccessPatch(access, {
          lockedAt: profile.paymentAccessLockedAt || isoNow(),
        });
        patch.paymentAccessDebtClassIds = Array.from(new Set(patch.paymentAccessDebtClassIds.map(String))).sort();
        await writeDoc(db.collection('familias'), profile.id || familyUid, {
          ...patch,
          updatedAt: now(),
          updated_at: isoNow(),
        });
        stats.familyPaymentAccessLocksApplied += 1;
      }
      if (!wasLocked) {
        await notifyUserOnce(
          db,
          familyUid,
          'Acceso limitado por pagos pendientes',
          `Hay ${access.debtClassCount} clase(s) con mas de 30 dias de impago. Puedes entrar al calendario y subir el justificante; el acceso completo volvera cuando el administrador lo valide.`,
          {
            type: 'family_payment_access_locked',
            debtClassCount: access.debtClassCount,
            debtAmount: access.debtAmount,
            classIds: access.debtClassIds,
            url: '/pages/dashboard/familia.html#calendario',
          },
          `family_payment_access_locked_${familyUid}_${access.debtClassIds.slice().sort()[0] || 'debt'}`,
        );
      }
    } else if (lockedProfile?.paymentAccessLocked === true) {
      await writeDoc(db.collection('familias'), lockedProfile.id || familyUid, {
        ...buildFamilyPaymentAccessPatch(access),
        updatedAt: now(),
        updated_at: isoNow(),
      });
      stats.familyPaymentAccessLocksRestored += 1;
    }
  }

  // Reminder volume remains deliberately batched; only the access decision is
  // exhaustive. Notification keys keep later runs concise and idempotent.
  const classes = await listCollection(db, 'clases', limit);
  for (const data of classes) {
    const doc = data.__ref ? { id: data.id, ref: data.__ref } : null;
    if (!doc) continue;
    if (!['realizada', 'completada'].includes(classStatus(data))) continue;
    if (!classHasPrice(data)) continue;
    if (['pagado', 'paid', 'validado'].includes(paymentStatus(data))) continue;

    const { familyUid } = await resolveClassRecipients(db, data);
    const label = classLabel(data);
    const familyId = clean(data.familyUid || data.familia_id || familyUid, 180);
    const studentId = clean(data.studentId || data.alumno_id, 180);
    const teacherId = clean(data.teacherUid || data.profesor_id, 180);
    const familyName = workerPersonName('Familia', familyId, data.familyName, data.familia_nombre, data.parentName, data.familyDisplayName);
    const studentName = workerPersonName('Alumno', studentId, data.studentName, data.alumno_nombre, data.alumnoName);
    const teacherName = workerPersonName('Profesor', teacherId, data.teacherName, data.profesor_nombre, data.teacherDisplayName);
    const amount = classFamilyAmount(data);
    const schedule = paymentScheduleForClass(data, scheduleIndex);
    const paymentState = classFamilyPaymentState(data, schedule, {
      classEndAt: classEndAt(data),
      nowMs: Date.now(),
    });
    const dueAt = paymentState.dueAt ? new Date(paymentState.dueAt) : null;
    if (!paymentState.overdue && (!dueAt || dueAt.getTime() > Date.now())) {
      if (!isEndOfWeekWindow()) continue;
    }
    if (paymentState.overdue) {
      await writeDoc(db.collection('clases'), doc.id, {
        paymentStatus: 'vencido',
        familyPaymentStatus: 'vencido',
        estado_pago: 'vencido',
        estado_pago_familia: 'vencido',
        familyPaymentDueAt: paymentState.dueAt || null,
        paymentDueAt: paymentState.dueAt || null,
        familyPaymentOverdueAt: now(),
        updatedAt: now(),
        updated_at: isoNow(),
      });
    }
    const timing = paymentOverdueTiming(paymentState);
    const overdueStep = paymentState.overdue
      ? await nextPaymentOverdueEscalationStep(db, {
          familyUid,
          classId: doc.id,
          daysSinceDue: timing.daysSinceDue,
        })
      : null;
    if (paymentState.overdue && !overdueStep) {
      stats.paymentsMarkedOverdue += 1;
      continue;
    }

    const context = {
      label,
      familyName,
      studentName,
      teacherName,
      amount,
    };
    const payload = {
      type: paymentState.overdue ? overdueStep.type : 'weekly_payment_due',
      classId: doc.id,
      dueAt: paymentState.dueAt || '',
      familyName,
      studentName,
      teacherName,
      amount,
      noticeNumber: overdueStep?.noticeNumber || 0,
      overdueStage: overdueStep?.key || '',
      daysSinceDue: timing.daysSinceDue,
      daysSinceOverdue: timing.daysSinceOverdue,
      escalationVersion: paymentState.overdue ? PAYMENT_OVERDUE_ESCALATION_VERSION : '',
      url: '/pages/login.html',
    };
    const familyKey = paymentState.overdue
      ? paymentOverdueNotificationKey(overdueStep, doc.id, 'family')
      : `weekly_payment_due_${doc.id}_family`;
    const adminKey = paymentState.overdue
      ? paymentOverdueNotificationKey(overdueStep, doc.id, 'admin')
      : `weekly_payment_due_${doc.id}_admin`;
    let created = 0;
    const familyPaymentCreated = await notifyUserOnce(
      db,
      familyUid,
      paymentState.overdue ? overdueStep.title : 'Justificante pendiente',
      paymentState.overdue
        ? paymentOverdueFamilyBody(overdueStep, context)
        : `Ya puedes enviar el justificante de la clase ${label}.`,
      payload,
      familyKey,
    );
    created += familyPaymentCreated ? 1 : 0;
    if (paymentState.overdue && familyPaymentCreated) {
      await applyClassTrustPenalty(doc.ref, {
        classId: doc.id,
        notificationType: overdueStep.type,
        role: 'familia',
        userUid: familyUid,
        points: overdueStep.penaltyPoints,
        reason: paymentOverduePenaltyReason(overdueStep),
      });
    }
    const adminCreated = await notifyAdminsOnce(
      db,
      paymentState.overdue ? overdueStep.adminTitle : 'Justificante pendiente',
      paymentState.overdue
        ? paymentOverdueAdminBody(overdueStep, context)
        : `Revisar justificante pendiente de ${familyName}: clase ${label}${amount ? ` (${amount.toFixed(2)} EUR)` : ''}.`,
      payload,
      adminKey,
    );
    created += adminCreated;
    if (paymentState.overdue && overdueStep && (familyPaymentCreated || adminCreated)) {
      await writeDoc(db.collection('clases'), doc.id, {
        paymentEscalationStatus: overdueStep.status,
        paymentEscalationStage: overdueStep.key,
        paymentEscalationType: overdueStep.type,
        paymentEscalationNoticeCount: overdueStep.noticeNumber,
        paymentEscalationLastSentAt: now(),
        paymentEscalationLastSentAtIso: isoNow(),
        paymentOverdueDays: timing.daysSinceDue,
        paymentOverdueDaysAfterGrace: timing.daysSinceOverdue,
        paymentEscalationVersion: PAYMENT_OVERDUE_ESCALATION_VERSION,
        ...(overdueStep.finalWarning ? {
          teacherPauseRiskAt: now(),
          teacherPauseRiskAtIso: isoNow(),
        } : {}),
        updatedAt: now(),
        updated_at: isoNow(),
      });
      stats.paymentEscalationNoticesCreated += familyPaymentCreated ? 1 : 0;
    }
    stats.weeklyPaymentRemindersCreated += created;
    if (paymentState.overdue) stats.paymentsMarkedOverdue += 1;
  }
}

async function createPaymentRequestForClassWorker(db, classId, reason = 'automation') {
  const id = clean(classId, 180);
  if (!id) return { created: false, reason: 'missing_class_id' };
  const classSnap = await db.collection('clases').doc(id).get();
  if (!classSnap.exists) return { created: false, reason: 'class_not_found', classId: id };
  const classData = { id, ...classSnap.data() };
  if (!isAfterClassReset(classData)) return { created: false, reason: 'class_reset_ignored', classId: id };

  if (classHasPaidStatus(classData)) {
    return { created: false, reason: 'class_already_paid', classId: id };
  }

  const existingByClass = await db.collection('pagos').where('classIds', 'array-contains', id).limit(1).get().catch(() => null);
  if (existingByClass && !existingByClass.empty) {
    return { created: false, reason: 'payment_already_exists', classId: id, paymentId: existingByClass.docs[0].id };
  }

  const paymentId = `class_${id}_family_payment`.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 900);
  const existingPayment = await db.collection('pagos').doc(paymentId).get().catch(() => null);
  if (existingPayment?.exists) {
    return { created: false, reason: 'payment_already_exists', classId: id, paymentId };
  }

  const amount = classFamilyAmount(classData);
  const recipients = await resolveClassRecipients(db, classData);
  const familyUid = clean(classData.familyUid || classData.familia_id || recipients.familyUid, 180);
  const teacherUid = clean(classData.teacherUid || classData.profesor_id || recipients.teacherUid, 180);
  if (!familyUid || amount <= 0) {
    await writeDoc(db.collection('automationEvents'), `payment_request_skipped_${id}`, {
      type: 'payment_request_skipped',
      classId: id,
      reason: !familyUid ? 'missing_family' : 'missing_amount',
      source: 'payment.request_for_class',
      worker: 'github-actions',
      dryRun,
      createdAt: now(),
      updatedAt: now(),
    });
    return { created: false, reason: !familyUid ? 'missing_family' : 'missing_amount', classId: id };
  }

  const schedules = await listCollection(db, 'paymentSchedules', limit);
  const schedule = paymentScheduleForClass(classData, buildPaymentScheduleIndex(schedules));
  const scheduledDueAt = weeklyPaymentDueAtForClass(classData, schedule, { classEndAt: classEndAt(classData) });
  const dueDays = runtimeNumber('payments.defaultPaymentDueDays', 7, 0, 60);
  const dueAtDate = scheduledDueAt ? new Date(scheduledDueAt) : new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000);
  const dueAt = admin.firestore.Timestamp.fromDate(dueAtDate);
  await writeDoc(db.collection('pagos'), paymentId, {
    paymentType: 'family_payment',
    tipo: 'family_payment',
    classIds: [id],
    clase_id: id,
    familyUid,
    familia_id: familyUid,
    teacherUid,
    profesor_id: teacherUid,
    studentId: clean(classData.studentId || classData.alumno_id, 180),
    alumno_id: clean(classData.studentId || classData.alumno_id, 180),
    materia: clean(classData.materia || classData.subject, 180),
    amount,
    monto: amount,
    estado: 'pendiente',
    status: 'pendiente',
    familyPaymentStatus: 'pendiente',
    estado_pago_familia: 'pendiente',
    gateway: 'bizum',
    provider: 'bizum',
    source: 'class_completed_automation',
    reason,
    dueAt,
    fecha_vencimiento: dueAt,
    reconciliationStatus: 'pending_payment',
    createdAt: now(),
    updatedAt: now(),
    created_at: isoNow(),
    updated_at: isoNow(),
  }, { merge: false });

  await writeDoc(db.collection('clases'), id, {
    paymentId,
    familyPaymentId: paymentId,
    paymentStatus: 'pendiente',
    familyPaymentStatus: 'pendiente',
    estado_pago: 'pendiente',
    estado_pago_familia: 'pendiente',
    updatedAt: now(),
  });

  return { created: true, paymentId, classId: id, amount };
}

async function processPlatformAutomationSweep(db, stats) {
  const [classes, payments, requests, documents, incidents, teachers, families, students, deadLetters, opsAlerts] = await Promise.all([
    listCollection(db, 'clases', limit),
    listCollection(db, 'pagos', limit),
    listCollection(db, 'solicitudes', limit),
    listCollection(db, 'documentos', limit),
    listCollection(db, 'incidencias', limit),
    listCollection(db, 'profesores', limit),
    listCollection(db, 'familias', limit),
    listCollection(db, 'alumnos', limit),
    listCollection(db, 'deadLetters', limit),
    listCollection(db, 'opsAlerts', limit),
  ]);

  if (runtimeBoolean('finance.autoDetectAnomalies', true)) {
    const financeReport = buildFinanceErpReport({
      classes,
      payments,
      teachers,
      families,
      students,
    }, {
      month: isoNow().slice(0, 7),
      config: platformConfigRuntime,
      nowIso: isoNow(),
    });
    stats.financeAnomaliesDetected = financeReport.anomalies.length;
    stats.financeErpVersion = FINANCE_ERP_VERSION;
    const shouldCreateIncidents = runtimeBoolean('finance.autoCreateIncidentFromAnomalies', true);
    for (const item of financeReport.anomalies.slice(0, 20)) {
      const eventId = item.classId || item.paymentId || item.id;
      await materializeWorkerAutomationPlan(db, {
        type: 'finance.anomaly_detected',
        entityType: item.paymentId ? 'pagos' : 'clases',
        entityId: eventId,
        data: { id: eventId, ...item, financeErpVersion: FINANCE_ERP_VERSION },
        source: 'githubActionsSweep',
      }, stats);
      if (shouldCreateIncidents && ['critical', 'high'].includes(item.severity)) {
        await createOperationalIncidentOnce(db, 'finance_anomaly', {
          id: item.id,
          classId: item.classId,
          paymentId: item.paymentId,
          teacherUid: item.teacherUid,
          familyUid: item.familyUid,
          prioridad: item.severity === 'critical' ? 'urgente' : 'alta',
          descripcion: `${item.title}: ${item.description}`,
          suggestedActions: item.suggestedActions || [],
        }, stats);
        stats.financeIncidentsCreated = (stats.financeIncidentsCreated || 0) + 1;
      }
      stats.platformFinanceEvents = (stats.platformFinanceEvents || 0) + 1;
    }
  }

  for (const item of classes) {
    stats.platformClassesChecked += 1;
    if (!isScheduledClassStatus(item.estado || item.status)) continue;
    if (!classEnded(item, Math.max(24 * 60, runtimeNumber('automation.classConfirmationGraceMinutes', 24 * 60, 0, 43200)))) continue;
    const enriched = await enrichWorkerClassData(db, item);
    await materializeWorkerAutomationPlan(db, {
      type: 'class.confirmation_overdue',
      entityType: 'clases',
      entityId: item.id,
      data: { id: item.id, ...enriched },
      source: 'githubActionsSweep',
    }, stats);
    await createOperationalIncidentOnce(db, 'class_unconfirmed', {
      id: item.id,
      classId: item.id,
      teacherUid: item.teacherUid || item.profesor_id,
      familyUid: item.familyUid || item.familia_id,
      descripcion: `Clase sin confirmar tras el margen operativo: ${classLabel(item)}.`,
    }, stats);
    stats.platformClassEvents += 1;
  }

  for (const item of payments) {
    stats.platformPaymentsChecked += 1;
    if (!isPaymentOverdue(item)) continue;
    const enriched = await enrichWorkerPaymentData(db, item);
    await materializeWorkerAutomationPlan(db, {
      type: 'payment.overdue',
      entityType: 'pagos',
      entityId: item.id,
      data: { id: item.id, ...enriched },
      source: 'githubActionsSweep',
    }, stats);
    await createOperationalIncidentOnce(db, 'payment_overdue', {
      id: item.id,
      paymentId: item.id,
      familyUid: item.familyUid || item.familia_id,
      teacherUid: item.teacherUid || item.profesor_id,
      descripcion: `Pago vencido pendiente de resolver por ${paymentAmount(item).toFixed(2)} EUR.`,
    }, stats);
    stats.platformPaymentEvents += 1;
  }

  for (const item of requests) {
    stats.platformRequestsChecked += 1;
    const status = lower(item.status || item.estado);
    if (!['nueva', 'pendiente', 'pending'].includes(status)) continue;
    if (item.matchStatus === 'ready' || item.assignedTeacherUid || item.profesor_asignado_id) continue;
    if (!isOlderThanMs(item, 12 * 60 * 60 * 1000)) continue;
    await materializeWorkerAutomationPlan(db, {
      type: 'request.stale',
      entityType: 'solicitudes',
      entityId: item.id,
      data: { id: item.id, ...item },
      source: 'githubActionsSweep',
    }, stats);
    stats.platformRequestEvents += 1;
  }

  for (const item of documents) {
    stats.platformDocumentsChecked += 1;
    const normalizedDocument = normalizeDocumentRecord({ id: item.id, ...item });
    const expiryPatch = buildDocumentExpiryPatch({ id: item.id, ...item });
    if (expiryPatch) {
      await writeDoc(db.collection('documentos'), item.id, expiryPatch);
      await materializeWorkerAutomationPlan(db, {
        type: 'document.expired',
        entityType: 'documentos',
        entityId: item.id,
        data: { id: item.id, ...normalizedDocument, ...expiryPatch },
        source: 'githubActionsSweep',
      }, stats);
      await createOperationalIncidentOnce(db, 'document_expired', {
        id: item.id,
        documentId: item.id,
        relatedUserUid: normalizedDocument.ownerUid,
        descripcion: `Documento caducado: ${clean(normalizedDocument.name || normalizedDocument.typeLabel || item.id, 180)}.`,
      }, stats);
      stats.platformDocumentEvents += 1;
      continue;
    }

    if (shouldSendExpiryReminder(normalizedDocument, new Date(), runtimeNumber('documents.expiryReminderDays', 30, 1, 180))) {
      await materializeWorkerAutomationPlan(db, {
        type: 'document.expiring_soon',
        entityType: 'documentos',
        entityId: item.id,
        data: { id: item.id, ...normalizedDocument },
        source: 'githubActionsSweep',
      }, stats);
      await writeDoc(db.collection('documentos'), item.id, {
        lastExpiryReminderAt: now(),
        ultimo_recordatorio_caducidad: isoNow(),
        updatedAt: now(),
        updated_at: isoNow(),
      });
      stats.platformDocumentEvents += 1;
      continue;
    }

    if (!['pendiente', 'pending', 'revision', 'en_revision'].includes(normalizedDocument.status)) continue;
    if (!isOlderThanMs(item, 24 * 60 * 60 * 1000)) continue;
    await materializeWorkerAutomationPlan(db, {
      type: 'document.stale',
      entityType: 'documentos',
      entityId: item.id,
      data: { id: item.id, ...normalizedDocument },
      source: 'githubActionsSweep',
    }, stats);
    await createOperationalIncidentOnce(db, 'document_stale', {
      id: item.id,
      documentId: item.id,
      relatedUserUid: normalizedDocument.ownerUid,
      descripcion: `Documento pendiente demasiado tiempo: ${clean(normalizedDocument.name || normalizedDocument.typeLabel || item.id, 180)}.`,
    }, stats);
    stats.platformDocumentEvents += 1;
  }

  for (const item of incidents) {
    stats.platformIncidentsChecked += 1;
    const status = lower(item.status || item.estado);
    if (!['abierta', 'open', 'pendiente'].includes(status)) continue;
    if (!isOlderThanMs(item, 48 * 60 * 60 * 1000)) continue;
    await materializeWorkerAutomationPlan(db, {
      type: 'incident.stale',
      entityType: 'incidencias',
      entityId: item.id,
      data: { id: item.id, ...item },
      source: 'githubActionsSweep',
    }, stats);
    stats.platformIncidentEvents += 1;
  }

  for (const item of teachers) {
    stats.platformTeachersChecked += 1;
    if (!isInactiveTeacher(item)) continue;
    await materializeWorkerAutomationPlan(db, {
      type: 'teacher.inactive',
      entityType: 'profesores',
      entityId: item.id,
      data: { id: item.id, ...item },
      source: 'githubActionsSweep',
    }, stats);
    stats.platformTeacherEvents += 1;
  }

  for (const item of deadLetters) {
    const status = lower(item.status || item.estado || 'open');
    if (['resolved', 'resuelta', 'closed', 'cerrada'].includes(status)) continue;
    await createOperationalIncidentOnce(db, 'system_error', {
      id: item.id,
      descripcion: `Job en dead letter: ${clean(item.type || item.error || item.id, 300)}.`,
      relatedUserUid: item.userUid || '',
    }, stats);
  }

  for (const item of opsAlerts) {
    const status = lower(item.status || item.estado || 'open');
    if (!['open', 'abierta', 'active', 'activo'].includes(status)) continue;
    const alertType = lower(item.alertType || item.type || '');
    await createOperationalIncidentOnce(db, alertType.includes('ai') ? 'ai_error' : 'system_error', {
      id: item.id,
      descripcion: clean(item.message || item.description || item.alertType || item.type || 'Alerta operativa abierta.', 500),
    }, stats);
  }
}

function preventiveIncidentOptions() {
  return {
    nowIso: isoNow(),
    teacherNonResponseHours: runtimeNumber('incidents.teacherNonResponseHours', runtimeNumber('matching.teacherResponseSlaHours', 8, 1, 168), 1, 720),
    staleRequestHours: runtimeNumber('incidents.staleRequestHours', runtimeNumber('matching.staleRequestHours', 12, 1, 720), 1, 1440),
    unscheduledAssignmentHours: runtimeNumber('incidents.unscheduledAssignmentHours', 48, 1, 1440),
    chatStalledHours: runtimeNumber('incidents.chatStalledHours', 48, 1, 1440),
    paymentGraceHours: runtimeNumber('payments.overdueGraceHours', 48, 48, 720),
    repeatedCancellationWindowDays: runtimeNumber('incidents.repeatedCancellationWindowDays', 30, 1, 365),
    repeatedCancellationThreshold: runtimeNumber('incidents.repeatedCancellationThreshold', 3, 2, 50),
    recurrentIncidentWindowDays: runtimeNumber('incidents.recurrentIncidentWindowDays', 30, 1, 365),
    recurrentIncidentThreshold: runtimeNumber('incidents.recurrentIncidentThreshold', 3, 2, 50),
    incompleteProfilePercent: runtimeNumber('profiles.minTeacherProfilePercent', 85, 1, 100),
    familyInactiveDays: runtimeNumber('incidents.familyInactiveDays', 14, 1, 365),
    unreadHighNotificationHours: runtimeNumber('incidents.unreadHighNotificationHours', 24, 1, 720),
  };
}

async function materializePreventiveRisk(db, risk, stats) {
  if (!risk?.id) return;

  const riskRef = db.collection('preventiveRisks').doc(risk.id);
  const existingRisk = await riskRef.get();
  const existingData = existingRisk.exists ? existingRisk.data() : {};
  const riskChanged = !existingRisk.exists
    || existingData.severity !== risk.severity
    || existingData.type !== risk.type
    || existingData.description !== risk.description;
  await writeDoc(db.collection('preventiveRisks'), risk.id, {
    ...risk,
    status: 'active',
    estado: 'activa',
    firstSeenAt: existingRisk.exists ? (existingRisk.data().firstSeenAt || now()) : now(),
    lastSeenAt: now(),
    updatedAt: now(),
    updated_at: isoNow(),
    createdAt: existingRisk.exists ? (existingRisk.data().createdAt || now()) : now(),
    created_at: existingRisk.exists ? (existingRisk.data().created_at || isoNow()) : isoNow(),
  });
  stats.preventiveRisksDetected += existingRisk.exists ? 0 : 1;
  stats.preventiveRisksActive += 1;

  if (riskChanged) {
    await addAutomationEvent(db, {
      type: 'preventive.risk_detected',
      riskId: risk.id,
      riskType: risk.type,
      severity: risk.severity,
      entityType: risk.entityType,
      entityId: risk.entityId,
      preventiveVersion: risk.version,
    });
    stats.preventiveAutomationEventsCreated += 1;

    await materializeWorkerAutomationPlan(db, {
      type: 'preventive.risk_detected',
      entityType: risk.entityType,
      entityId: risk.entityId,
      data: risk,
      source: 'preventiveIncidentRadar',
    }, stats);
  }

  if (risk.shouldCreateTask) {
    const taskId = notificationId('crm_preventive', risk.id);
    const taskRef = db.collection('crmTasks').doc(taskId);
    const existingTask = await taskRef.get();
    if (!existingTask.exists) {
      const dueMinutes = risk.severity === 'critical' ? 30 : risk.severity === 'high' ? 90 : 240;
      await writeDoc(db.collection('crmTasks'), taskId, {
        title: risk.title,
        description: risk.description,
        priority: risk.severity,
        status: 'open',
        estado: 'abierta',
        entityType: risk.entityType,
        entityId: risk.entityId,
        riskId: risk.id,
        riskType: risk.type,
        familyUid: risk.familyUid || '',
        teacherUid: risk.teacherUid || '',
        requestId: risk.requestId || '',
        assignmentId: risk.assignmentId || '',
        classId: risk.classId || '',
        paymentId: risk.paymentId || '',
        tags: ['preventivo', risk.type, risk.severity],
        suggestedActions: risk.suggestedActions || [],
        dueAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + dueMinutes * 60 * 1000)),
        source: 'preventive_incident_radar',
        createdAt: now(),
        updatedAt: now(),
      }, { merge: false });
      stats.preventiveTasksCreated += 1;
    }
  }

  if (risk.shouldNotifyAdmin) {
    const created = await notifyAdminsOnce(
      db,
      risk.severity === 'critical' ? 'Riesgo critico detectado' : 'Riesgo operativo detectado',
      `${risk.title}: ${risk.description}`,
      {
        type: 'preventive_risk',
        riskId: risk.id,
        riskType: risk.type,
        severity: risk.severity,
        entityType: risk.entityType,
        entityId: risk.entityId,
        url: '/pages/login.html',
      },
      `preventive_risk_${risk.id}`,
    );
    stats.preventiveNotificationsCreated += created;
  }

  if (risk.shouldCreateIncident) {
    const created = await createOperationalIncidentOnce(db, 'preventive_risk', {
      id: risk.id,
      eventId: risk.id,
      classId: risk.classId,
      paymentId: risk.paymentId,
      teacherUid: risk.teacherUid,
      familyUid: risk.familyUid,
      relatedUserUid: risk.teacherUid || risk.familyUid || '',
      titulo: risk.title,
      descripcion: risk.description,
      priority: risk.prioridad,
      suggestedActions: risk.suggestedActions || [],
    }, stats);
    if (created) stats.preventiveIncidentsCreated += 1;
  }

  if (['critical', 'high'].includes(risk.severity)) {
    const alertId = notificationId('ops_preventive', risk.id);
    const alertRef = db.collection('opsAlerts').doc(alertId);
    const existingAlert = await alertRef.get();
    if (!existingAlert.exists) {
      await writeDoc(db.collection('opsAlerts'), alertId, {
        alertType: 'preventive_risk',
        type: 'preventive_risk',
        title: risk.title,
        message: risk.description,
        severity: risk.severity,
        status: 'open',
        estado: 'abierta',
        entityType: risk.entityType,
        entityId: risk.entityId,
        riskId: risk.id,
        suggestedActions: risk.suggestedActions || [],
        source: 'preventive_incident_radar',
        createdAt: now(),
        updatedAt: now(),
      }, { merge: false });
      stats.preventiveOpsAlertsCreated += 1;
    }
  }
}

async function processPreventiveIncidentRadar(db, stats) {
  if (!runtimeBoolean('incidents.preventiveRadarEnabled', true)) return;
  const scanLimit = runtimeNumber('incidents.preventiveScanLimit', limit, 10, 5000);
  const [
    classes,
    payments,
    requests,
    requestMatches,
    assignments,
    incidents,
    teachers,
    families,
    chats,
    notifications,
    deadLetters,
    opsAlerts,
    automationEvents,
  ] = await Promise.all([
    listCollection(db, 'clases', scanLimit),
    listCollection(db, 'pagos', scanLimit),
    listCollection(db, 'solicitudes', scanLimit),
    listCollection(db, 'solicitudMatches', scanLimit),
    listCollection(db, 'asignaciones', scanLimit),
    listCollection(db, 'incidencias', scanLimit),
    listCollection(db, 'profesores', scanLimit),
    listCollection(db, 'familias', scanLimit),
    listCollection(db, 'chats', scanLimit).catch(() => []),
    listCollection(db, 'notificaciones', scanLimit),
    listCollection(db, 'deadLetters', scanLimit),
    listCollection(db, 'opsAlerts', scanLimit),
    listCollection(db, 'automationEvents', scanLimit),
  ]);

  const plan = buildPreventiveIncidentPlan({
    classes,
    payments,
    requests,
    requestMatches,
    assignments,
    incidents,
    teachers,
    families,
    chats,
    notifications,
    deadLetters,
    opsAlerts,
    automationEvents,
  }, preventiveIncidentOptions());

  stats.preventiveRadarVersion = plan.version;
  stats.preventiveRisksEvaluated = plan.total;
  stats.preventiveCriticalRisks = plan.summary.critical;
  stats.preventiveHighRisks = plan.summary.high;

  await writeDoc(db.collection('preventiveRiskSnapshots'), notificationId('preventive_snapshot', plan.generatedAt.slice(0, 16)), {
    ...plan.summary,
    thresholds: plan.thresholds,
    version: plan.version,
    generatedAt: plan.generatedAt,
    createdAt: now(),
    updatedAt: now(),
  }, { merge: false });

  for (const risk of plan.risks.slice(0, scanLimit)) {
    await materializePreventiveRisk(db, risk, stats);
  }
}

function alertPriorityOptions() {
  return {
    nowIso: isoNow(),
    adminNotificationScore: runtimeNumber('incidents.alertAdminNotificationScore', 82, 1, 100),
    taskScore: runtimeNumber('incidents.alertTaskScore', 55, 1, 100),
    maxTopAlerts: runtimeNumber('incidents.alertMaxTopAlerts', 40, 1, 200),
  };
}

function alertSignalCollection(source) {
  return {
    incidencias: 'incidencias',
    preventiveRisks: 'preventiveRisks',
    opsAlerts: 'opsAlerts',
    notificaciones: 'notificaciones',
  }[source] || '';
}

async function patchAlertSource(db, decision, patch) {
  const collectionName = alertSignalCollection(decision.signalSource);
  if (!collectionName || !decision.signalId) return false;
  const ref = db.collection(collectionName).doc(decision.signalId);
  const snap = await ref.get().catch(() => null);
  if (!snap?.exists) return false;
  await updateRef(ref, {
    ...patch,
    updatedAt: now(),
    updated_at: isoNow(),
  });
  return true;
}

async function materializeAlertPriorityDecision(db, decision, stats) {
  const ref = db.collection('alertDecisions').doc(decision.id);
  const existing = await ref.get();
  const existingData = existing.exists ? existing.data() : {};
  const changed = !existing.exists || existingData.fingerprint !== decision.fingerprint;

  await writeDoc(db.collection('alertDecisions'), decision.id, {
    ...decision,
    status: decision.suppressedAsNoise ? 'suppressed' : 'active',
    estado: decision.suppressedAsNoise ? 'suprimida' : 'activa',
    firstSeenAt: existing.exists ? (existingData.firstSeenAt || now()) : now(),
    lastSeenAt: now(),
    createdAt: existing.exists ? (existingData.createdAt || now()) : now(),
    updatedAt: now(),
  });
  if (!existing.exists) stats.alertDecisionsCreated += 1;
  stats.alertDecisionsEvaluated += 1;

  const sourcePatch = {
    alertPriorityEngineVersion: decision.version,
    alertPriorityScore: decision.priorityScore,
    alertAttentionLevel: decision.attentionLevel,
    alertAttentionLabel: decision.attentionLabel,
    alertPriority: decision.priority,
    alertPrioridad: decision.prioridad,
    alertPriorityRank: decision.priorityRank,
    alertRecommendedAction: decision.recommendedAction,
    alertConsequence: decision.consequence,
    alertWhyDetected: decision.whyDetected,
    alertDedupeKey: decision.dedupeKey,
    alertDuplicateCount: decision.duplicateCount,
    alertSuppressedAsNoise: decision.suppressedAsNoise,
    alertLastDecisionAt: isoNow(),
  };
  const patched = await patchAlertSource(db, decision, sourcePatch);
  if (patched) stats.alertSourcesUpdated += 1;

  if (decision.autoAction === 'close_duplicate_automatic_incident' && decision.signalSource === 'incidencias') {
    await patchAlertSource(db, decision, {
      estado: 'cerrada',
      status: 'cerrada',
      resolvedAt: now(),
      fecha_resolucion: isoNow(),
      resolution: 'Cerrada automaticamente como duplicado de una alerta principal.',
      resolucion: 'Cerrada automaticamente como duplicado de una alerta principal.',
      rootCause: 'duplicado_automatico',
      causa: 'duplicado_automatico',
      suppressedByPriorityEngine: true,
      alertAutoResolvedAt: now(),
    });
    stats.alertAutoResolutionsApplied += 1;
  }

  if (decision.autoAction === 'suppress_duplicate_notification' && decision.signalSource === 'notificaciones') {
    await patchAlertSource(db, decision, {
      suppressedByPriorityEngine: true,
      suppressedAt: now(),
      suppressionReason: 'Duplicado agrupado por el motor de prioridades.',
    });
    stats.alertNotificationsSuppressed += 1;
  }

  if (decision.shouldCreateTask) {
    const taskId = notificationId('crm_alert_priority', decision.id);
    const taskRef = db.collection('crmTasks').doc(taskId);
    const taskSnap = await taskRef.get();
    if (!taskSnap.exists) {
      const dueMinutes = decision.attentionLevel === 'critical_incident'
        ? 20
        : decision.attentionLevel === 'important_incident'
          ? 90
          : 240;
      await writeDoc(db.collection('crmTasks'), taskId, {
        title: decision.title,
        description: `${decision.description} Mejor accion: ${decision.recommendedAction}`,
        priority: decision.priority,
        status: 'open',
        estado: 'abierta',
        entityType: decision.entityType,
        entityId: decision.entityId,
        alertDecisionId: decision.id,
        alertScore: decision.priorityScore,
        alertLevel: decision.attentionLevel,
        familyUid: decision.familyUid || '',
        teacherUid: decision.teacherUid || '',
        tags: ['alerta_inteligente', decision.category, decision.attentionLevel],
        dueAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + dueMinutes * 60 * 1000)),
        source: 'alert_priority_engine',
        createdAt: now(),
        updatedAt: now(),
      }, { merge: false });
      stats.alertTasksCreated += 1;
    }
  }

  if (decision.shouldNotifyAdmin && changed) {
    const created = await notifyAdminsOnce(
      db,
      decision.attentionLevel === 'critical_incident' ? 'Alerta critica priorizada' : 'Alerta importante priorizada',
      `${decision.title}. ${decision.consequence} Accion recomendada: ${decision.recommendedAction}`,
      {
        type: 'alert_priority',
        alertDecisionId: decision.id,
        signalSource: decision.signalSource,
        signalId: decision.signalId,
        priorityScore: decision.priorityScore,
        attentionLevel: decision.attentionLevel,
        url: '/pages/login.html',
      },
      `alert_priority_${decision.id}`,
    );
    stats.alertNotificationsCreated += created;
  }
}

async function processAlertPriorityEngine(db, stats) {
  if (!runtimeBoolean('incidents.alertPriorityEnabled', true)) return;
  const scanLimit = runtimeNumber('incidents.alertPriorityScanLimit', limit, 10, 5000);
  const [incidents, preventiveRisks, notifications, opsAlerts] = await Promise.all([
    listCollection(db, 'incidencias', scanLimit),
    listCollection(db, 'preventiveRisks', scanLimit).catch(() => []),
    listCollection(db, 'notificaciones', scanLimit),
    listCollection(db, 'opsAlerts', scanLimit),
  ]);
  const plan = buildAlertPriorityPlan({
    incidents,
    preventiveRisks,
    notifications,
    opsAlerts,
  }, alertPriorityOptions());

  stats.alertPriorityVersion = plan.version;
  stats.alertSignalsEvaluated = plan.totalSignals;
  stats.alertCritical = plan.summary.critical;
  stats.alertImportant = plan.summary.important;
  stats.alertSuppressedNoise = plan.summary.suppressedNoise;
  stats.alertAutoResolvable = plan.summary.autoResolvable;

  await writeDoc(db.collection('alertPrioritySnapshots'), notificationId('alert_priority_snapshot', plan.generatedAt.slice(0, 16)), {
    ...plan.summary,
    version: plan.version,
    totalSignals: plan.totalSignals,
    generatedAt: plan.generatedAt,
    createdAt: now(),
    updatedAt: now(),
  }, { merge: false });

  for (const decision of plan.decisions.slice(0, scanLimit)) {
    await materializeAlertPriorityDecision(db, decision, stats);
  }
}

function platformSupervisionOptions() {
  return {
    nowIso: isoNow(),
    scanLimit: runtimeNumber('supervision.scanLimit', limit, 10, 5000),
    automationHeartbeatHours: runtimeNumber('supervision.automationHeartbeatHours', 12, 1, 168),
    queuedJobStuckHours: runtimeNumber('supervision.queuedJobStuckHours', 2, 1, 168),
    processingJobStuckMinutes: runtimeNumber('supervision.processingJobStuckMinutes', 45, 5, 1440),
    staleIncidentHours: runtimeNumber('supervision.staleIncidentHours', 24, 1, 720),
    staleRiskHours: runtimeNumber('supervision.staleRiskHours', 12, 1, 720),
  };
}

function platformSupervisionIncidentKind(finding = {}) {
  if (finding.category === 'automation') return 'system_error';
  if (finding.category === 'blocked_process' && finding.type?.includes('payment')) return 'payment_overdue';
  if (finding.category === 'blocked_process' && finding.type?.includes('matching')) return 'matching_blocked';
  return 'sync_error';
}

async function applyPlatformSupervisionAutoAction(db, finding, stats) {
  if (!finding.autoRepairable || !runtimeBoolean('supervision.autoRepairSafeIssues', true)) return false;
  if (finding.autoAction === 'enqueue_relationship_ensure_chat' && finding.assignmentId) {
    const created = await enqueueWorkerSystemJob(db, {
      type: 'relationship.ensure_chat',
      payload: {
        assignmentId: finding.assignmentId,
        reason: 'platform_self_supervision',
      },
      priority: finding.severity === 'critical' ? 'critical' : 'high',
      idempotencyKey: `supervision_ensure_chat_${finding.assignmentId}`,
      maxAttempts: 5,
    }, 'platform_self_supervision');
    if (created) {
      stats.selfSupervisionJobsQueued += 1;
      stats.selfSupervisionAutoRepairsApplied += 1;
    }
    return created;
  }

  if (finding.autoAction === 'enqueue_payment_request_for_class' && finding.classId) {
    const created = await enqueueWorkerSystemJob(db, {
      type: 'payment.request_for_class',
      payload: {
        classId: finding.classId,
        reason: 'platform_self_supervision',
      },
      priority: finding.severity === 'critical' ? 'critical' : 'high',
      idempotencyKey: `supervision_payment_request_${finding.classId}`,
      maxAttempts: 5,
    }, 'platform_self_supervision');
    if (created) {
      stats.selfSupervisionJobsQueued += 1;
      stats.selfSupervisionAutoRepairsApplied += 1;
    }
    return created;
  }

  if (finding.autoAction === 'mark_notification_orphaned' && finding.entityId) {
    await writeDoc(db.collection('notificaciones'), finding.entityId, {
      deliveryStatus: 'orphaned',
      estado_entrega: 'huerfana',
      suppressedBySupervision: true,
      supervisionFindingId: finding.id,
      supervisionMarkedAt: now(),
      updatedAt: now(),
      updated_at: isoNow(),
    });
    stats.selfSupervisionAutoRepairsApplied += 1;
    return true;
  }

  return false;
}

async function materializePlatformSupervisionFinding(db, finding, stats) {
  const ref = db.collection('platformSupervisionFindings').doc(finding.id);
  const existing = await ref.get();
  const existingData = existing.exists ? existing.data() : {};
  const changed = !existing.exists || existingData.fingerprint !== JSON.stringify([
    finding.severity,
    finding.type,
    finding.entityType,
    finding.entityId,
    finding.description,
    finding.recommendedAction,
  ]);

  await writeDoc(db.collection('platformSupervisionFindings'), finding.id, {
    ...finding,
    status: 'active',
    estado: 'activa',
    fingerprint: JSON.stringify([
      finding.severity,
      finding.type,
      finding.entityType,
      finding.entityId,
      finding.description,
      finding.recommendedAction,
    ]),
    firstSeenAt: existing.exists ? (existingData.firstSeenAt || now()) : now(),
    lastSeenAt: now(),
    createdAt: existing.exists ? (existingData.createdAt || now()) : now(),
    updatedAt: now(),
    updated_at: isoNow(),
  });

  stats.selfSupervisionFindingsEvaluated += 1;
  if (!existing.exists) stats.selfSupervisionFindingsCreated += 1;

  if (finding.autoRepairable) {
    await applyPlatformSupervisionAutoAction(db, finding, stats);
  }

  if (finding.severity === 'critical' || finding.severity === 'high') {
    const alertId = notificationId('ops_supervision', finding.id);
    const alertRef = db.collection('opsAlerts').doc(alertId);
    const alertSnap = await alertRef.get();
    if (!alertSnap.exists) {
      await writeDoc(db.collection('opsAlerts'), alertId, {
        alertType: 'platform_self_supervision',
        type: 'platform_self_supervision',
        title: finding.title,
        message: `${finding.description} Accion: ${finding.recommendedAction}`,
        severity: finding.severity,
        status: 'open',
        estado: 'abierta',
        entityType: finding.entityType,
        entityId: finding.entityId,
        findingId: finding.id,
        source: 'platform_self_supervision',
        createdAt: now(),
        updatedAt: now(),
      }, { merge: false });
      stats.selfSupervisionOpsAlertsCreated += 1;
    }
  }

  if (['critical', 'high', 'medium'].includes(finding.severity) && runtimeBoolean('supervision.autoCreateTasks', true)) {
    const taskId = notificationId('crm_self_supervision', finding.id);
    const taskRef = db.collection('crmTasks').doc(taskId);
    const taskSnap = await taskRef.get();
    if (!taskSnap.exists) {
      const dueMinutes = finding.severity === 'critical' ? 20 : finding.severity === 'high' ? 90 : 360;
      await writeDoc(db.collection('crmTasks'), taskId, {
        title: finding.title,
        description: `${finding.description} Accion recomendada: ${finding.recommendedAction}`,
        priority: finding.severity,
        status: 'open',
        estado: 'abierta',
        entityType: finding.entityType,
        entityId: finding.entityId,
        familyUid: finding.familyUid || '',
        teacherUid: finding.teacherUid || '',
        studentId: finding.studentId || '',
        classId: finding.classId || '',
        paymentId: finding.paymentId || '',
        requestId: finding.requestId || '',
        assignmentId: finding.assignmentId || '',
        platformSupervisionFindingId: finding.id,
        tags: ['autosupervision', finding.category, finding.type],
        dueAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + dueMinutes * 60 * 1000)),
        source: 'platform_self_supervision',
        createdAt: now(),
        updatedAt: now(),
      }, { merge: false });
      stats.selfSupervisionTasksCreated += 1;
    }
  }

  if (runtimeBoolean('supervision.autoCreateIncidents', true) && ['critical', 'high'].includes(finding.severity)) {
    const created = await createOperationalIncidentOnce(db, platformSupervisionIncidentKind(finding), {
      id: finding.id,
      title: finding.title,
      description: `${finding.description} Accion recomendada: ${finding.recommendedAction}`,
      reason: finding.consequence,
      classId: finding.classId,
      paymentId: finding.paymentId,
      teacherUid: finding.teacherUid,
      familyUid: finding.familyUid,
      userUid: finding.familyUid || finding.teacherUid,
      priority: finding.severity === 'critical' ? 'urgente' : 'alta',
      platformSupervisionFindingId: finding.id,
    }, stats);
    if (created) stats.selfSupervisionIncidentsCreated += 1;
  }

  if (changed && ['critical', 'high'].includes(finding.severity)) {
    const created = await notifyAdminsOnce(
      db,
      finding.severity === 'critical' ? 'Autosupervision critica' : 'Autosupervision requiere atencion',
      `${finding.title}. ${finding.consequence} Accion: ${finding.recommendedAction}`,
      {
        type: 'platform_self_supervision',
        findingId: finding.id,
        entityType: finding.entityType,
        entityId: finding.entityId,
        url: '/pages/login.html',
      },
      `platform_self_supervision_${finding.id}`,
    );
    stats.selfSupervisionNotificationsCreated += created;
  }
}

async function closeResolvedSupervisionWorkItems(db, findingId, stats) {
  if (!runtimeBoolean('supervision.autoCloseResolvedAlerts', true)) return;
  const [alertsSnap, tasksSnap] = await Promise.all([
    db.collection('opsAlerts').where('findingId', '==', findingId).limit(20).get().catch(() => null),
    db.collection('crmTasks').where('platformSupervisionFindingId', '==', findingId).limit(20).get().catch(() => null),
  ]);

  if (alertsSnap) {
    for (const doc of alertsSnap.docs) {
      const status = normalizeStatus(doc.data());
      if (!['open', 'abierta', 'active', 'activa', ''].includes(status)) continue;
      await updateRef(doc.ref, {
        status: 'resolved',
        estado: 'resuelta',
        resolvedAt: now(),
        resolved_at: isoNow(),
        resolution: 'El hallazgo de autosupervision asociado dejo de detectarse.',
        updatedAt: now(),
        updated_at: isoNow(),
      });
      stats.selfSupervisionOpsAlertsResolved += 1;
    }
  }

  if (tasksSnap) {
    for (const doc of tasksSnap.docs) {
      const status = normalizeStatus(doc.data());
      if (!['open', 'abierta', 'active', 'activa', 'pending', 'pendiente', ''].includes(status)) continue;
      await updateRef(doc.ref, {
        status: 'resolved',
        estado: 'resuelta',
        resolvedAt: now(),
        resolved_at: isoNow(),
        resolution: 'La autosupervision dejo de detectar este problema.',
        updatedAt: now(),
        updated_at: isoNow(),
      });
      stats.selfSupervisionTasksResolved += 1;
    }
  }
}

async function closeResolvedPlatformSupervisionFindings(db, activeIds, stats, scanLimit) {
  const snap = await db.collection('platformSupervisionFindings')
    .where('status', '==', 'active')
    .limit(scanLimit)
    .get()
    .catch(() => null);
  if (!snap) return;
  for (const doc of snap.docs) {
    if (activeIds.has(doc.id)) continue;
    await updateRef(doc.ref, {
      status: 'resolved',
      estado: 'resuelta',
      resolvedAt: now(),
      resolved_at: isoNow(),
      resolution: 'La autosupervision dejo de detectar este problema en el ultimo barrido.',
      updatedAt: now(),
      updated_at: isoNow(),
    });
    await closeResolvedSupervisionWorkItems(db, doc.id, stats);
    stats.selfSupervisionResolvedFindings += 1;
  }
}

async function processPlatformSelfSupervision(db, stats) {
  if (!runtimeBoolean('supervision.enabled', true)) return;
  const options = platformSupervisionOptions();
  const scanLimit = options.scanLimit;
  const [
    classes,
    payments,
    requests,
    assignments,
    chats,
    notifications,
    systemJobs,
    automationEvents,
    deadLetters,
    incidents,
    preventiveRisks,
    alertDecisions,
    teachers,
    families,
    students,
    documents,
    users,
    legacyUsers,
  ] = await Promise.all([
    listCollection(db, 'clases', scanLimit),
    listCollection(db, 'pagos', scanLimit),
    listCollection(db, 'solicitudes', scanLimit),
    listCollection(db, 'asignaciones', scanLimit),
    listCollection(db, 'chats', scanLimit).catch(() => []),
    listCollection(db, 'notificaciones', scanLimit),
    listRecentCollection(db, 'systemJobs', scanLimit, 'updatedAt'),
    listRecentCollection(db, 'automationEvents', scanLimit, 'createdAt'),
    listRecentCollection(db, 'deadLetters', scanLimit, 'updatedAt'),
    listRecentCollection(db, 'incidencias', scanLimit, 'updatedAt'),
    listRecentCollection(db, 'preventiveRisks', scanLimit, 'lastSeenAt').catch(() => []),
    listRecentCollection(db, 'alertDecisions', scanLimit, 'lastSeenAt').catch(() => []),
    listCollection(db, 'profesores', scanLimit),
    listCollection(db, 'familias', scanLimit),
    listCollection(db, 'alumnos', scanLimit),
    listCollection(db, 'documentos', scanLimit),
    listCollection(db, 'users', scanLimit).catch(() => []),
    listCollection(db, 'usuarios', scanLimit).catch(() => []),
  ]);

  const plan = buildPlatformSupervisionPlan({
    clases: classes,
    pagos: payments,
    solicitudes: requests,
    asignaciones: assignments,
    chats,
    notificaciones: notifications,
    systemJobs,
    automationEvents,
    deadLetters,
    incidencias: incidents,
    preventiveRisks,
    alertDecisions,
    profesores: teachers,
    familias: families,
    alumnos: students,
    documentos: documents,
    users,
    usuarios: legacyUsers,
  }, options);

  stats.selfSupervisionVersion = plan.version;
  stats.selfSupervisionFindingsDetected = plan.total;
  stats.selfSupervisionCriticalFindings = plan.summary.critical;
  stats.selfSupervisionHighFindings = plan.summary.high;
  stats.selfSupervisionAutoRepairable = plan.summary.autoRepairable;
  stats.selfSupervisionBlockedProcesses = plan.summary.blockedProcesses;
  stats.selfSupervisionConsistencyIssues = plan.summary.consistencyIssues;
  stats.selfSupervisionAutomationIssues = plan.summary.automationIssues;

  await writeDoc(db.collection('platformSupervisionSnapshots'), notificationId('platform_supervision_snapshot', plan.generatedAt.slice(0, 16)), {
    ...plan.summary,
    version: plan.version,
    thresholds: plan.thresholds,
    generatedAt: plan.generatedAt,
    createdAt: now(),
    updatedAt: now(),
  }, { merge: false });

  const activeIds = new Set(plan.findings.map((finding) => finding.id));
  for (const finding of plan.findings.slice(0, scanLimit)) {
    await materializePlatformSupervisionFinding(db, finding, stats);
  }
  await closeResolvedPlatformSupervisionFindings(db, activeIds, stats, scanLimit);
}

function relationshipFollowupOptions() {
  return {
    nowIso: isoNow(),
    scanLimit: runtimeNumber('followup.scanLimit', limit, 10, 5000),
    scheduleNudgeHours: runtimeNumber('followup.scheduleNudgeHours', 12, 1, 720),
    proposedScheduleNudgeHours: runtimeNumber('followup.proposedScheduleNudgeHours', 8, 1, 720),
    firstClassPrepHours: runtimeNumber('followup.firstClassPrepHours', 24, 1, 168),
    firstClassCheckinHours: runtimeNumber('followup.firstClassCheckinHours', 24, 1, 720),
    confirmationNudgeHours: runtimeNumber('followup.confirmationNudgeHours', 2, 1, 168),
    activeSilenceDays: runtimeNumber('followup.activeSilenceDays', 7, 1, 365),
    qualityCheckCompletedClasses: runtimeNumber('followup.qualityCheckCompletedClasses', 3, 1, 50),
    qualityCheckCooldownDays: runtimeNumber('followup.qualityCheckCooldownDays', 45, 1, 365),
    repeatedCancellationWindowDays: runtimeNumber('followup.repeatedCancellationWindowDays', 30, 1, 365),
    repeatedCancellationThreshold: runtimeNumber('followup.repeatedCancellationThreshold', 3, 2, 50),
    teacherActivityDropDays: runtimeNumber('followup.teacherActivityDropDays', 21, 1, 365),
    adminEscalationHours: runtimeNumber('followup.adminEscalationHours', 48, 1, 1440),
    adminEscalationDays: runtimeNumber('followup.adminEscalationDays', 14, 1, 365),
    userNotificationCooldownHours: runtimeNumber('followup.userNotificationCooldownHours', 24, 1, 720),
    adminCooldownHours: runtimeNumber('followup.adminCooldownHours', 24, 1, 720),
    maxUserNotifications: runtimeNumber('followup.maxUserNotifications', 6, 0, 50),
  };
}

async function materializeRelationshipFollowupAction(db, action, stats) {
  const ref = db.collection('relationshipFollowups').doc(action.id);
  const existing = await ref.get();
  const existingData = existing.exists ? existing.data() : {};
  const fingerprint = JSON.stringify([
    action.actionId,
    action.relationshipId,
    action.stage,
    action.priority,
    action.description,
    action.recommendedAction,
    action.recipients.map((item) => `${item.role}:${item.userUid}`).join('|'),
  ]);
  const changed = !existing.exists || existingData.fingerprint !== fingerprint;

  await writeDoc(db.collection('relationshipFollowups'), action.id, {
    ...action,
    status: action.recipients.length ? 'sent' : 'active',
    estado: action.recipients.length ? 'enviada' : 'activa',
    fingerprint,
    firstSeenAt: existing.exists ? (existingData.firstSeenAt || now()) : now(),
    lastSeenAt: now(),
    sentAt: action.recipients.length ? now() : (existingData.sentAt || null),
    createdAt: existing.exists ? (existingData.createdAt || now()) : now(),
    updatedAt: now(),
    updated_at: isoNow(),
  });
  stats.relationshipFollowupsEvaluated += 1;
  if (!existing.exists) stats.relationshipFollowupsCreated += 1;

  for (const recipient of action.recipients) {
    const created = await notifyUserOnce(
      db,
      recipient.userUid,
      recipient.title,
      recipient.body,
      {
        type: 'relationship_followup',
        role: recipient.role,
        priority: recipient.priority || action.priority,
        followupId: action.id,
        actionId: action.actionId,
        relationshipId: action.relationshipId,
        stage: action.stage,
        category: action.category,
        section: recipient.section || action.section,
        url: '/pages/login.html',
      },
      `relationship_followup_${action.id}_${recipient.role}_${recipient.userUid}`,
    );
    if (created) stats.relationshipFollowupNotificationsCreated += 1;
  }

  if (action.createAdminTask && runtimeBoolean('followup.autoCreateAdminTasks', true)) {
    const taskId = notificationId('crm_relationship_followup', action.dedupeKey);
    const taskRef = db.collection('crmTasks').doc(taskId);
    const taskSnap = await taskRef.get();
    if (!taskSnap.exists) {
      const dueMinutes = action.priority === 'critical' ? 30 : action.priority === 'high' ? 180 : 720;
      await writeDoc(db.collection('crmTasks'), taskId, {
        title: action.title,
        description: `${action.description} Accion recomendada: ${action.recommendedAction}`,
        priority: action.priority,
        status: 'open',
        estado: 'abierta',
        entityType: 'relationship',
        entityId: action.relationshipId,
        relationshipId: action.relationshipId,
        relationshipFollowupId: action.id,
        familyUid: action.familyUid || '',
        teacherUid: action.teacherUid || '',
        studentId: action.studentId || '',
        tags: ['seguimiento_relacion', action.category, action.actionId],
        dueAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + dueMinutes * 60 * 1000)),
        source: 'relationship_followup_engine',
        createdAt: now(),
        updatedAt: now(),
      }, { merge: false });
      stats.relationshipFollowupTasksCreated += 1;
    }
  }

  if (action.createOpsAlert && changed) {
    const alertId = notificationId('ops_relationship_followup', action.id);
    const alertRef = db.collection('opsAlerts').doc(alertId);
    const alertSnap = await alertRef.get();
    if (!alertSnap.exists) {
      await writeDoc(db.collection('opsAlerts'), alertId, {
        alertType: 'relationship_followup',
        type: 'relationship_followup',
        title: action.title,
        message: `${action.description} Accion: ${action.recommendedAction}`,
        severity: action.priority,
        status: 'open',
        estado: 'abierta',
        entityType: 'relationship',
        entityId: action.relationshipId,
        relationshipFollowupId: action.id,
        source: 'relationship_followup_engine',
        createdAt: now(),
        updatedAt: now(),
      }, { merge: false });
      stats.relationshipFollowupOpsAlertsCreated += 1;
    }
  }
}

async function closeResolvedRelationshipFollowups(db, activeIds, stats, scanLimit) {
  const snap = await db.collection('relationshipFollowups')
    .limit(scanLimit)
    .get()
    .catch(() => null);
  if (!snap) return;
  for (const doc of snap.docs) {
    if (activeIds.has(doc.id)) continue;
    const status = normalizeStatus(doc.data());
    if (['resolved', 'resuelta', 'cerrada', 'archived', 'archivada'].includes(status)) continue;
    await updateRef(doc.ref, {
      status: 'resolved',
      estado: 'resuelta',
      resolvedAt: now(),
      resolved_at: isoNow(),
      resolution: 'El seguimiento dejo de ser necesario en el ultimo barrido.',
      updatedAt: now(),
      updated_at: isoNow(),
    });
    stats.relationshipFollowupsResolved += 1;
  }
}

async function processRelationshipFollowups(db, stats) {
  if (!runtimeBoolean('followup.enabled', true)) return;
  const options = relationshipFollowupOptions();
  const scanLimit = options.scanLimit;
  const [
    classes,
    payments,
    requests,
    assignments,
    chats,
    incidents,
    documents,
    teachers,
    families,
    students,
    previousFollowups,
  ] = await Promise.all([
    listCollection(db, 'clases', scanLimit),
    listCollection(db, 'pagos', scanLimit),
    listCollection(db, 'solicitudes', scanLimit),
    listCollection(db, 'asignaciones', scanLimit),
    listCollection(db, 'chats', scanLimit).catch(() => []),
    listCollection(db, 'incidencias', scanLimit),
    listCollection(db, 'documentos', scanLimit),
    listCollection(db, 'profesores', scanLimit),
    listCollection(db, 'familias', scanLimit),
    listCollection(db, 'alumnos', scanLimit),
    listCollection(db, 'relationshipFollowups', scanLimit).catch(() => []),
  ]);

  const relationships = buildRelationshipsFromCollections({
    classes,
    payments,
    requests,
    assignments,
    chats,
    incidents,
    documents,
    teachers,
    families,
    students,
  }, { nowMs: Date.now() });

  const plan = buildRelationshipFollowupPlan({
    relationships,
    previousFollowups,
  }, options);

  stats.relationshipFollowupVersion = plan.version;
  stats.relationshipFollowupsDetected = plan.total;
  stats.relationshipFollowupUserNotifications = plan.summary.userNotifications;
  stats.relationshipFollowupAdminTasks = plan.summary.adminTasks;
  stats.relationshipFollowupScheduleBlocked = plan.summary.scheduleBlocked;
  stats.relationshipFollowupQualityChecks = plan.summary.qualityChecks;
  stats.relationshipFollowupCancellationRisks = plan.summary.cancellationRisks;

  await writeDoc(db.collection('relationshipFollowupSnapshots'), notificationId('relationship_followup_snapshot', plan.generatedAt.slice(0, 16)), {
    ...plan.summary,
    version: plan.version,
    thresholds: plan.thresholds,
    generatedAt: plan.generatedAt,
    relationshipsEvaluated: relationships.length,
    createdAt: now(),
    updatedAt: now(),
  }, { merge: false });

  const activeIds = new Set(plan.actions.map((action) => action.id));
  for (const action of plan.actions.slice(0, scanLimit)) {
    await materializeRelationshipFollowupAction(db, action, stats);
  }
  await closeResolvedRelationshipFollowups(db, activeIds, stats, scanLimit);
}

function proactiveAssistOptions() {
  return {
    nowIso: isoNow(),
    scanLimit: runtimeNumber('proactiveAssist.scanLimit', limit, 10, 5000),
    onboardingNudgeHours: runtimeNumber('proactiveAssist.onboardingNudgeHours', 24, 1, 720),
    profileNudgeMinCompletion: runtimeNumber('proactiveAssist.profileNudgeMinCompletion', 85, 1, 100),
    profileNudgeCooldownHours: runtimeNumber('proactiveAssist.profileNudgeCooldownHours', 72, 1, 1440),
    missingAvailabilityHours: runtimeNumber('proactiveAssist.missingAvailabilityHours', 24, 1, 1440),
    requestAvailabilityNudgeHours: runtimeNumber('proactiveAssist.requestAvailabilityNudgeHours', 12, 1, 1440),
    upcomingClassReadinessHours: runtimeNumber('proactiveAssist.upcomingClassReadinessHours', 36, 1, 720),
    teacherPayoutReadinessHours: runtimeNumber('proactiveAssist.teacherPayoutReadinessHours', 1, 1, 720),
    unreadCriticalNotificationHours: runtimeNumber('proactiveAssist.unreadCriticalNotificationHours', 12, 1, 720),
    lowSupplyRequestHours: runtimeNumber('proactiveAssist.lowSupplyRequestHours', 24, 1, 1440),
    lowSupplyMinCandidates: runtimeNumber('proactiveAssist.lowSupplyMinCandidates', 2, 1, 50),
    lowSupplyMinScore: runtimeNumber('proactiveAssist.lowSupplyMinScore', 55, 0, 100),
    verifiedTeacherIdleDays: runtimeNumber('proactiveAssist.verifiedTeacherIdleDays', 7, 1, 365),
    staleAdminTaskHours: runtimeNumber('proactiveAssist.staleAdminTaskHours', 48, 1, 1440),
    userNotificationCooldownHours: runtimeNumber('proactiveAssist.userNotificationCooldownHours', 72, 1, 1440),
    adminCooldownHours: runtimeNumber('proactiveAssist.adminCooldownHours', 24, 1, 1440),
    adminEscalationHours: runtimeNumber('proactiveAssist.adminEscalationHours', 48, 1, 1440),
    maxUserNotifications: runtimeNumber('proactiveAssist.maxUserNotifications', 6, 0, 50),
  };
}

async function materializeProactiveAssistSignal(db, signal, stats) {
  const ref = db.collection('proactiveAssistSignals').doc(signal.id);
  const existing = await ref.get();
  const existingData = existing.exists ? existing.data() : {};
  const fingerprint = JSON.stringify([
    signal.signalId,
    signal.entityType,
    signal.entityId,
    signal.priority,
    signal.description,
    signal.recommendedAction,
    signal.recipients.map((item) => `${item.role}:${item.userUid}`).join('|'),
  ]);
  const changed = !existing.exists || existingData.fingerprint !== fingerprint;

  await writeDoc(db.collection('proactiveAssistSignals'), signal.id, {
    ...signal,
    status: signal.recipients.length ? 'sent' : 'active',
    estado: signal.recipients.length ? 'enviada' : 'activa',
    fingerprint,
    firstSeenAt: existing.exists ? (existingData.firstSeenAt || now()) : now(),
    lastSeenAt: now(),
    sentAt: signal.recipients.length ? now() : (existingData.sentAt || null),
    createdAt: existing.exists ? (existingData.createdAt || now()) : now(),
    updatedAt: now(),
    updated_at: isoNow(),
  });
  stats.proactiveAssistSignalsEvaluated += 1;
  if (!existing.exists) stats.proactiveAssistSignalsCreated += 1;

  for (const recipient of signal.recipients) {
    const created = await notifyUserOnce(
      db,
      recipient.userUid,
      recipient.title,
      recipient.body,
      {
        type: 'proactive_assist',
        role: recipient.role,
        priority: recipient.priority || signal.priority,
        signalId: signal.id,
        proactiveSignalId: signal.signalId,
        category: signal.category,
        entityType: signal.entityType,
        entityId: signal.entityId,
        section: recipient.section || signal.section,
        url: '/pages/login.html',
      },
      `proactive_assist_${signal.id}_${recipient.role}_${recipient.userUid}`,
    );
    if (created) stats.proactiveAssistNotificationsCreated += 1;
  }

  if (signal.createAdminTask && runtimeBoolean('proactiveAssist.autoCreateAdminTasks', true)) {
    const taskId = notificationId('crm_proactive_assist', signal.dedupeKey);
    const taskRef = db.collection('crmTasks').doc(taskId);
    const taskSnap = await taskRef.get();
    if (!taskSnap.exists) {
      const dueMinutes = signal.priority === 'critical' ? 30 : signal.priority === 'high' ? 180 : 720;
      await writeDoc(db.collection('crmTasks'), taskId, {
        title: signal.title,
        description: `${signal.description} Accion recomendada: ${signal.recommendedAction}`,
        priority: signal.priority,
        status: 'open',
        estado: 'abierta',
        entityType: signal.entityType || 'proactiveAssist',
        entityId: signal.entityId,
        proactiveAssistSignalId: signal.id,
        familyUid: signal.familyUid || '',
        teacherUid: signal.teacherUid || '',
        studentId: signal.studentId || '',
        tags: ['asistencia_proactiva', signal.category, signal.signalId],
        dueAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + dueMinutes * 60 * 1000)),
        source: 'proactive_assist_engine',
        createdAt: now(),
        updatedAt: now(),
      }, { merge: false });
      stats.proactiveAssistTasksCreated += 1;
    }
  }

  if (signal.createOpsAlert && changed) {
    const alertId = notificationId('ops_proactive_assist', signal.id);
    const alertRef = db.collection('opsAlerts').doc(alertId);
    const alertSnap = await alertRef.get();
    if (!alertSnap.exists) {
      await writeDoc(db.collection('opsAlerts'), alertId, {
        alertType: 'proactive_assist',
        type: 'proactive_assist',
        title: signal.title,
        message: `${signal.description} Accion: ${signal.recommendedAction}`,
        severity: signal.priority,
        status: 'open',
        estado: 'abierta',
        entityType: signal.entityType || 'proactiveAssist',
        entityId: signal.entityId,
        proactiveAssistSignalId: signal.id,
        source: 'proactive_assist_engine',
        createdAt: now(),
        updatedAt: now(),
      }, { merge: false });
      stats.proactiveAssistOpsAlertsCreated += 1;
    }
  }
}

async function closeResolvedProactiveAssistSignals(db, activeIds, stats, scanLimit) {
  const snap = await db.collection('proactiveAssistSignals')
    .limit(scanLimit)
    .get()
    .catch(() => null);
  if (!snap) return;
  for (const doc of snap.docs) {
    if (activeIds.has(doc.id)) continue;
    const status = normalizeStatus(doc.data());
    if (['resolved', 'resuelta', 'cerrada', 'archived', 'archivada'].includes(status)) continue;
    await updateRef(doc.ref, {
      status: 'resolved',
      estado: 'resuelta',
      resolvedAt: now(),
      resolved_at: isoNow(),
      resolution: 'La ayuda proactiva dejo de ser necesaria en el ultimo barrido.',
      updatedAt: now(),
      updated_at: isoNow(),
    });
    stats.proactiveAssistSignalsResolved += 1;
  }
}

async function processProactiveAssist(db, stats) {
  if (!runtimeBoolean('proactiveAssist.enabled', true)) return;
  const options = proactiveAssistOptions();
  const scanLimit = options.scanLimit;
  const [
    users,
    legacyUsers,
    teachers,
    families,
    students,
    requests,
    matches,
    assignments,
    classes,
    notifications,
    crmTasks,
    previousSignals,
  ] = await Promise.all([
    listCollection(db, 'users', scanLimit).catch(() => []),
    listCollection(db, 'usuarios', scanLimit).catch(() => []),
    listCollection(db, 'profesores', scanLimit),
    listCollection(db, 'familias', scanLimit),
    listCollection(db, 'alumnos', scanLimit),
    listCollection(db, 'solicitudes', scanLimit),
    listCollection(db, 'solicitudMatches', scanLimit).catch(() => []),
    listCollection(db, 'asignaciones', scanLimit),
    listCollection(db, 'clases', scanLimit),
    listCollection(db, 'notificaciones', scanLimit),
    listCollection(db, 'crmTasks', scanLimit).catch(() => []),
    listCollection(db, 'proactiveAssistSignals', scanLimit).catch(() => []),
  ]);

  const plan = buildProactiveAssistPlan({
    users,
    usuarios: legacyUsers,
    profesores: teachers,
    familias: families,
    alumnos: students,
    solicitudes: requests,
    solicitudMatches: matches,
    asignaciones: assignments,
    clases: classes,
    notificaciones: notifications,
    crmTasks,
    previousSignals,
  }, options);

  stats.proactiveAssistVersion = plan.version;
  stats.proactiveAssistSignalsDetected = plan.total;
  stats.proactiveAssistUserNotifications = plan.summary.userNotifications;
  stats.proactiveAssistAdminTasks = plan.summary.adminTasks;
  stats.proactiveAssistOpsAlerts = plan.summary.opsAlerts;
  stats.proactiveAssistProfileHelp = plan.summary.profileHelp;
  stats.proactiveAssistSchedulingHelp = plan.summary.schedulingHelp;
  stats.proactiveAssistRequestReadiness = plan.summary.requestReadiness;
  stats.proactiveAssistMatchingHelp = plan.summary.matchingHelp;
  stats.proactiveAssistPaymentReadiness = plan.summary.paymentReadiness;
  stats.proactiveAssistReadinessChecks = plan.summary.readinessChecks;
  stats.proactiveAssistSupplyActivation = plan.summary.supplyActivation;
  stats.proactiveAssistAttentionChecks = plan.summary.attentionChecks;

  await writeDoc(db.collection('proactiveAssistSnapshots'), notificationId('proactive_assist_snapshot', plan.generatedAt.slice(0, 16)), {
    ...plan.summary,
    version: plan.version,
    thresholds: plan.thresholds,
    generatedAt: plan.generatedAt,
    createdAt: now(),
    updatedAt: now(),
  }, { merge: false });

  const activeIds = new Set(plan.signals.map((signal) => signal.id));
  for (const signal of plan.signals.slice(0, scanLimit)) {
    await materializeProactiveAssistSignal(db, signal, stats);
  }
  await closeResolvedProactiveAssistSignals(db, activeIds, stats, scanLimit);
}

function internalAiAssistantOptions() {
  return {
    nowIso: isoNow(),
    scanLimit: runtimeNumber('ai.internalAssistantScanLimit', limit, 10, 5000),
    longConversationMessageThreshold: runtimeNumber('ai.internalAssistantLongChatMessages', 20, 5, 500),
    conflictKeywordThreshold: runtimeNumber('ai.internalAssistantConflictKeywordThreshold', 2, 1, 20),
    staleChatHours: runtimeNumber('ai.internalAssistantStaleChatHours', 24, 1, 1440),
    staleIncidentHours: runtimeNumber('ai.internalAssistantStaleIncidentHours', 24, 1, 1440),
    incidentSummaryMinEntries: runtimeNumber('ai.internalAssistantIncidentSummaryEntries', 4, 2, 100),
    documentReviewHours: runtimeNumber('ai.internalAssistantDocumentReviewHours', 24, 1, 1440),
    profileCompletionMinPercent: runtimeNumber('ai.internalAssistantProfileMinPercent', 85, 1, 100),
    patternWindowDays: runtimeNumber('ai.internalAssistantPatternWindowDays', 30, 1, 365),
    recurrentPatternThreshold: runtimeNumber('ai.internalAssistantPatternThreshold', 3, 2, 100),
    dailyBriefMinScore: runtimeNumber('ai.internalAssistantDailyBriefMinScore', 58, 1, 100),
    dailyBriefMaxItems: runtimeNumber('ai.internalAssistantDailyBriefMaxItems', 8, 3, 50),
  };
}

async function materializeInternalAiInsight(db, insight, stats) {
  const ref = db.collection('internalAiInsights').doc(insight.id);
  const existing = await ref.get();
  const existingData = existing.exists ? existing.data() : {};
  const fingerprint = JSON.stringify([
    insight.insightId,
    insight.category,
    insight.priority,
    insight.priorityScore,
    insight.summary,
    insight.recommendedAction,
    insight.evidence.join('|'),
  ]);
  const changed = !existing.exists || existingData.fingerprint !== fingerprint;

  await writeDoc(db.collection('internalAiInsights'), insight.id, {
    ...insight,
    status: 'active',
    estado: 'activa',
    fingerprint,
    firstSeenAt: existing.exists ? (existingData.firstSeenAt || now()) : now(),
    lastSeenAt: now(),
    createdAt: existing.exists ? (existingData.createdAt || now()) : now(),
    updatedAt: now(),
    updated_at: isoNow(),
  });
  stats.internalAiInsightsEvaluated += 1;
  if (!existing.exists) stats.internalAiInsightsCreated += 1;

  const shouldCreateTask = insight.requiresHumanReview
    && insight.priorityScore >= 70
    && runtimeBoolean('ai.internalAssistantAutoCreateTasks', true);
  if (shouldCreateTask) {
    const taskId = notificationId('crm_internal_ai', insight.dedupeKey);
    const taskRef = db.collection('crmTasks').doc(taskId);
    const taskSnap = await taskRef.get();
    if (!taskSnap.exists) {
      const dueMinutes = insight.priority === 'critical' ? 30 : insight.priority === 'high' ? 180 : 720;
      await writeDoc(db.collection('crmTasks'), taskId, {
        title: insight.title,
        description: `${insight.summary} Accion recomendada: ${insight.recommendedAction}`,
        priority: insight.priority,
        status: 'open',
        estado: 'abierta',
        entityType: insight.entityType || 'internalAiInsight',
        entityId: insight.entityId || insight.id,
        entityName: insight.entityName || '',
        internalAiInsightId: insight.id,
        familyUid: insight.familyUid || '',
        teacherUid: insight.teacherUid || '',
        studentId: insight.studentId || '',
        tags: ['ia_interna', insight.category, insight.insightId],
        dueAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + dueMinutes * 60 * 1000)),
        source: 'internal_ai_assistant_engine',
        createdAt: now(),
        updatedAt: now(),
      }, { merge: false });
      stats.internalAiTasksCreated += 1;
    }
  }

  const shouldCreateAlert = changed
    && (insight.priority === 'critical' || insight.priority === 'high' || insight.category === 'data_quality')
    && runtimeBoolean('ai.internalAssistantAutoCreateOpsAlerts', true);
  if (shouldCreateAlert) {
    const alertId = notificationId('ops_internal_ai', insight.id);
    const alertRef = db.collection('opsAlerts').doc(alertId);
    const alertSnap = await alertRef.get();
    if (!alertSnap.exists) {
      await writeDoc(db.collection('opsAlerts'), alertId, {
        alertType: 'internal_ai_assistant',
        type: 'internal_ai_assistant',
        title: insight.title,
        message: `${insight.summary} Accion: ${insight.recommendedAction}`,
        severity: insight.priority,
        status: 'open',
        estado: 'abierta',
        entityType: insight.entityType || 'internalAiInsight',
        entityId: insight.entityId || insight.id,
        internalAiInsightId: insight.id,
        source: 'internal_ai_assistant_engine',
        createdAt: now(),
        updatedAt: now(),
      }, { merge: false });
      stats.internalAiOpsAlertsCreated += 1;
    }
  }
}

async function closeResolvedInternalAiInsights(db, activeIds, stats, scanLimit) {
  const snap = await db.collection('internalAiInsights')
    .limit(scanLimit)
    .get()
    .catch(() => null);
  if (!snap) return;
  for (const doc of snap.docs) {
    if (activeIds.has(doc.id)) continue;
    const status = normalizeStatus(doc.data());
    if (['resolved', 'resuelta', 'cerrada', 'archived', 'archivada'].includes(status)) continue;
    await updateRef(doc.ref, {
      status: 'resolved',
      estado: 'resuelta',
      resolvedAt: now(),
      resolved_at: isoNow(),
      resolution: 'La IA interna dejo de detectar esta oportunidad en el ultimo barrido.',
      updatedAt: now(),
      updated_at: isoNow(),
    });
    stats.internalAiInsightsResolved += 1;
  }
}

async function processInternalAiAssistant(db, stats) {
  if (!runtimeBoolean('ai.enabled', true) || !runtimeBoolean('ai.internalAssistantEnabled', true)) return;
  const options = internalAiAssistantOptions();
  const scanLimit = options.scanLimit;
  const [
    users,
    legacyUsers,
    teachers,
    families,
    students,
    classes,
    payments,
    requests,
    assignments,
    chats,
    messages,
    incidents,
    documents,
    notifications,
    alertDecisions,
    preventiveRisks,
    platformSupervisionFindings,
    relationshipFollowups,
    proactiveAssistSignals,
    crmTasks,
    opsAlerts,
    previousInsights,
  ] = await Promise.all([
    listCollection(db, 'users', scanLimit).catch(() => []),
    listCollection(db, 'usuarios', scanLimit).catch(() => []),
    listCollection(db, 'profesores', scanLimit),
    listCollection(db, 'familias', scanLimit),
    listCollection(db, 'alumnos', scanLimit),
    listCollection(db, 'clases', scanLimit),
    listCollection(db, 'pagos', scanLimit),
    listCollection(db, 'solicitudes', scanLimit),
    listCollection(db, 'asignaciones', scanLimit),
    listCollection(db, 'chats', scanLimit),
    listCollectionGroup(db, 'mensajes', scanLimit).catch(() => []),
    listCollection(db, 'incidencias', scanLimit),
    listCollection(db, 'documentos', scanLimit),
    listCollection(db, 'notificaciones', scanLimit).catch(() => []),
    listCollection(db, 'alertDecisions', scanLimit).catch(() => []),
    listCollection(db, 'preventiveRisks', scanLimit).catch(() => []),
    listCollection(db, 'platformSupervisionFindings', scanLimit).catch(() => []),
    listCollection(db, 'relationshipFollowups', scanLimit).catch(() => []),
    listCollection(db, 'proactiveAssistSignals', scanLimit).catch(() => []),
    listCollection(db, 'crmTasks', scanLimit).catch(() => []),
    listCollection(db, 'opsAlerts', scanLimit).catch(() => []),
    listCollection(db, 'internalAiInsights', scanLimit).catch(() => []),
  ]);

  const plan = buildInternalAiAssistantPlan({
    users,
    usuarios: legacyUsers,
    profesores: teachers,
    familias: families,
    alumnos: students,
    clases: classes,
    pagos: payments,
    solicitudes: requests,
    asignaciones: assignments,
    chats,
    mensajes: messages,
    incidencias: incidents,
    documentos: documents,
    notificaciones: notifications,
    alertDecisions,
    preventiveRisks,
    platformSupervisionFindings,
    relationshipFollowups,
    proactiveAssistSignals,
    crmTasks,
    opsAlerts,
    previousInsights,
  }, options);

  stats.internalAiAssistantVersion = plan.version;
  stats.internalAiInsightsDetected = plan.total;
  stats.internalAiCritical = plan.summary.critical;
  stats.internalAiHigh = plan.summary.high;
  stats.internalAiHumanReview = plan.summary.humanReview;
  stats.internalAiChatInsights = plan.summary.chatInsights;
  stats.internalAiIncidentInsights = plan.summary.incidentInsights;
  stats.internalAiDocumentInsights = plan.summary.documentInsights;
  stats.internalAiProfileInsights = plan.summary.profileInsights;
  stats.internalAiDataQualityInsights = plan.summary.dataQualityInsights;
  stats.internalAiPatternInsights = plan.summary.patternInsights;
  stats.internalAiOperationsInsights = plan.summary.operationsInsights;

  await writeDoc(db.collection('internalAiInsightSnapshots'), notificationId('internal_ai_snapshot', plan.generatedAt.slice(0, 16)), {
    ...plan.summary,
    version: plan.version,
    thresholds: plan.thresholds,
    generatedAt: plan.generatedAt,
    createdAt: now(),
    updatedAt: now(),
  }, { merge: false });

  const activeIds = new Set(plan.insights.map((insight) => insight.id));
  for (const insight of plan.insights.slice(0, scanLimit)) {
    await materializeInternalAiInsight(db, insight, stats);
  }
  await closeResolvedInternalAiInsights(db, activeIds, stats, scanLimit);
}

async function loadFamilyClassesForPayment(db, payment) {
  const familyUid = clean(payment.familyUid || payment.familia_id);
  if (!familyUid) return [];
  const rows = await listCollection(db, 'clases', 2000);
  return rows.filter((item) => clean(item.familyUid || item.familia_id) === familyUid);
}

async function reconcileVerifiedPayments(db, stats) {
  const snap = await db.collection('pagos').limit(limit).get();
  for (const doc of snap.docs) {
    const data = { id: doc.id, ...doc.data() };
    const status = paymentStatus(data);
    if (!isPaymentVerified(data) && !PAID_PAYMENT_STATUSES.includes(status)) continue;
    if (data.reconciliationStatus === 'applied') continue;

    const classIds = Array.isArray(data.classIds) ? data.classIds.map(String).filter(Boolean) : [];
    let match = { status: classIds.length ? 'matched' : 'unmatched', classIds, confidence: classIds.length ? 1 : 0, reason: 'explicit_class_ids' };
    if (isFamilyPayment(data) && !classIds.length) {
      const classes = await loadFamilyClassesForPayment(db, data);
      match = matchPaymentToClasses(data, classes);
    }

    if (!match.classIds.length) {
      await updateRef(doc.ref, {
        reconciliationStatus: 'needs_review',
        reconciliationReason: match.reason,
        updatedAt: now(),
      });
      stats.paymentsNeedingReview += 1;
      continue;
    }

    await Promise.all(match.classIds.map((classId) => updateRef(
      db.collection('clases').doc(classId),
      {
        ...buildClassPaymentPatch(data, classId),
        updatedAt: now(),
      },
    )));

    await updateRef(doc.ref, {
      ...buildPaymentValidationPayload(data, isTeacherPayout(data) ? 'pagado' : 'validado', data.validatedByUid || 'automation', { source: data.verificationSource || data.gateway || 'automation' }),
      classIds: match.classIds,
      classCount: match.classIds.length,
      reconciliationStatus: 'applied',
      reconciliationReason: match.reason,
      reconciliationConfidence: match.confidence,
      reconciledAt: now(),
      updatedAt: now(),
    });
    stats.paymentsReconciled += 1;
  }
}

async function processTrustReputation(db, stats) {
  const [teachersSnap, familiesSnap, usersSnap, trustContext] = await Promise.all([
    db.collection('profesores').limit(limit).get(),
    db.collection('familias').limit(limit).get(),
    db.collection('users').get(),
    loadTrustContext(db),
  ]);
  const users = new Map(usersSnap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }]));
  const batch = db.batch();
  let writes = 0;

  teachersSnap.docs.forEach((doc) => {
    const data = doc.data();
    const userUid = data.userUid || data.usuario_id || doc.id;
    const profile = {
      ...data,
      id: doc.id,
      teacherUid: doc.id,
      userUid,
      usuarios: users.get(userUid) || users.get(doc.id) || {},
    };
    const trust = buildTeacherTrustProfile(profile, trustContext);
    batch.set(doc.ref, {
      ...buildTrustSnapshotPatch(trust),
      trustUpdatedAt: now(),
      updatedAt: now(),
    }, { merge: true });
    writes += 1;
  });

  familiesSnap.docs.forEach((doc) => {
    const data = doc.data();
    const userUid = data.userUid || data.usuario_id || doc.id;
    const profile = {
      ...data,
      id: doc.id,
      familyUid: doc.id,
      userUid,
      usuarios: users.get(userUid) || users.get(doc.id) || {},
    };
    const trust = buildFamilyTrustProfile(profile, trustContext);
    batch.set(doc.ref, {
      ...buildTrustSnapshotPatch(trust),
      trustUpdatedAt: now(),
      updatedAt: now(),
    }, { merge: true });
    writes += 1;
  });

  if (writes && !dryRun) await batch.commit();
  stats.trustProfilesUpdated += writes;

  if (writes) {
    await addAutomationEvent(db, {
      type: 'trust_reputation_recalculated',
      profilesUpdated: writes,
      teachers: teachersSnap.size,
      families: familiesSnap.size,
    });
  }
}

async function main() {
  if (selfTest) {
    const request = {
      materia: 'Matematicas',
      nivel: '2 ESO',
      modalidad: 'online',
      zona: 'Madrid',
      preferencia_horario: 'martes tarde',
    };
    const candidates = [
      {
        teacherUid: 'prof_ok',
        nombre: 'Ana',
        email: 'ana@example.com',
        telefono: '600111222',
        foto_url: 'https://example.com/ana.jpg',
        direccion: 'Calle Mayor 1',
        ciudad: 'Madrid',
        codigo_postal: '28001',
        materias: ['Matematicas', 'Fisica'],
        niveles_educativos: ['ESO', 'Bachillerato'],
        modalidad: 'online',
        zona: 'Madrid',
        nivel_estudios: 'Grado universitario',
        estudio_exacto: 'Grado en Matematicas',
        colegio: 'Colegio El Prado',
        schoolName: 'Colegio El Prado',
        centro_estudios: 'Universidad Complutense de Madrid',
        nota_bachillerato: 8.7,
        nota_media_universidad: 8.1,
        disponibilidad_resumen: 'Martes y jueves tarde',
        bio: 'Profesora universitaria con experiencia preparando alumnos de ESO y Bachillerato.',
        acepta_bizum: true,
        rating: 4.8,
        acceptanceRate: 0.92,
        responseTimeHours: 2,
        maxStudents: 5,
        activeAssignments: 1,
        status: 'verificado',
        active: true,
      },
      {
        teacherUid: 'prof_low',
        nombre: 'Luis',
        email: 'luis@example.com',
        materias: ['Ingles'],
        niveles_educativos: ['Primaria'],
        modalidad: 'presencial',
        zona: 'Sevilla',
        maxStudents: 1,
        activeAssignments: 1,
        status: 'pendiente',
        active: true,
      },
    ];

    const ranking = rankTeachersForRequest(request, candidates, { limit: 2, includeZeroScore: true });
    if (ranking[0].teacherUid !== 'prof_ok' || ranking[0].score <= ranking[1].score) {
      throw new Error('Self-test failed: deterministic matching did not rank the expected teacher first.');
    }

    const aiMerged = mergeProfessionalAiRanking(ranking, {
      matches: [{ teacherUid: 'prof_ok', score: 99, reason: 'Encaje IA validado.', risks: ['Confirmar horario.'] }],
    });
    if (aiMerged[0].teacherUid !== 'prof_ok' || !aiMerged[0].aiReason) {
      throw new Error('Self-test failed: AI ranking merge did not preserve the expected teacher.');
    }

    const maintenanceHealth = buildMaintenanceHealthCheck({
      criticalOnly: true,
      selfSupervisionFindingsDetected: 3,
      selfSupervisionCriticalFindings: 1,
      selfSupervisionHighFindings: 1,
      selfSupervisionConsistencyIssues: 2,
      selfSupervisionAutomationIssues: 1,
      selfSupervisionAutoRepairable: 1,
      selfSupervisionAutoRepairsApplied: 1,
      systemJobsSeen: 2,
      systemJobsProcessed: 2,
    }, 'self_test');
    if (maintenanceHealth.status !== 'outage' || maintenanceHealth.score >= 100 || !maintenanceHealth.subsystems.some((item) => item.id === 'data_integrity')) {
      throw new Error('Self-test failed: maintenance health did not classify critical supervision correctly.');
    }

    const paymentAccessFixture = {
      locked: true,
      reason: 'unpaid_classes_over_30_days',
      debtClassCount: 2,
      debtAmount: 60,
      debtClassIds: ['class_old', 'class_current'],
    };
    if (!familyPaymentAccessFactsMatch({
      paymentAccessLocked: true,
      paymentAccessReason: 'unpaid_classes_over_30_days',
      paymentAccessDebtClassCount: 2,
      paymentAccessDebtAmount: 60,
      paymentAccessDebtClassIds: ['class_current', 'class_old'],
    }, paymentAccessFixture)) {
      throw new Error('Self-test failed: equivalent family payment access facts were not stable.');
    }
    if (familyPaymentAccessFactsMatch({
      paymentAccessLocked: true,
      paymentAccessReason: 'unpaid_classes_over_30_days',
      paymentAccessDebtClassCount: 1,
      paymentAccessDebtAmount: 25,
      paymentAccessDebtClassIds: ['class_old'],
    }, paymentAccessFixture)) {
      throw new Error('Self-test failed: changed family payment debt was incorrectly treated as stable.');
    }

    console.log(JSON.stringify({
      selfTest: 'passed',
      matchingVersion: MATCHING_VERSION,
      maintenanceHealthVersion: MAINTENANCE_HEALTH_VERSION,
      maintenanceStatus: maintenanceHealth.status,
      familyPaymentAccessSweep: 'passed',
      best: aiMerged[0],
    }, null, 2));
    return;
  }

  initFirebaseAdmin();
  const db = admin.firestore();
  platformConfigRuntime = await loadWorkerPlatformConfig(db);
  const stats = {
    dryRun,
    trustOnly,
    criticalOnly,
    leadsSeen: 0,
    leadsFlaggedForReview: 0,
    familyLeadsProcessed: 0,
    assistedFamilyAccountsLinked: 0,
    teacherLeadsProcessed: 0,
    contactLeadsProcessed: 0,
    requestsSeen: 0,
    matchesGenerated: 0,
    activeMatchingRequestsChecked: 0,
    activeMatchingPlansCreated: 0,
    activeMatchingNotificationsCreated: 0,
    activeMatchingTasksCreated: 0,
    activeMatchingJobsQueued: 0,
    assignmentsCreated: 0,
    classesChecked: 0,
    classRemindersCreated: 0,
    upcomingClassRemindersCreated: 0,
    attendanceRemindersCreated: 0,
    incidentsCreated: 0,
    operationalIncidentsCreated: 0,
    incidentsClassified: 0,
    paymentRemindersCreated: 0,
    paymentsMarkedOverdue: 0,
    paymentsReconciled: 0,
    paymentsNeedingReview: 0,
    weeklyPaymentRemindersCreated: 0,
    paymentEscalationNoticesCreated: 0,
    familyPaymentAccessLocksApplied: 0,
    familyPaymentAccessLocksRestored: 0,
    classPaymentContextsUpdated: 0,
    lifecycleClassesEvaluated: 0,
    lifecycleTransitionsApplied: 0,
    lifecycleHistoryEventsCreated: 0,
    lifecycleNotificationsCreated: 0,
    lifecyclePaymentReviewEventsCreated: 0,
    trustProfilesUpdated: 0,
    systemJobsSeen: 0,
    systemJobsProcessed: 0,
    systemJobsFailed: 0,
    systemJobsRecoveredLeases: 0,
    systemJobsSkippedClaims: 0,
    assignmentChatsEnsured: 0,
    paymentRequestsCreated: 0,
    metricSnapshotsCreated: 0,
    analyticsEventsEvaluated: 0,
    analyticsRollupsCreated: 0,
    analyticsEngineVersion: ANALYTICS_ENGINE_VERSION,
    experimentsEvaluated: 0,
    experimentationEngineVersion: EXPERIMENTATION_ENGINE_VERSION,
    opsAlertsCreated: 0,
    platformAutomationPlans: 0,
    platformRuleRunsEvaluated: 0,
    platformRuleRunsCreated: 0,
    platformAutomationEvents: 0,
    platformNotificationsCreated: 0,
    pushNotificationsChecked: 0,
    pushNotificationsSent: 0,
    pushNotificationsFailed: 0,
    pushNotificationsSkipped: 0,
    platformSystemJobsQueued: 0,
    platformAuditLogsCreated: 0,
    platformCrmTasksCreated: 0,
    platformOpsAlertsCreated: 0,
    platformPatchesApplied: 0,
    platformClassesChecked: 0,
    platformClassEvents: 0,
    platformPaymentsChecked: 0,
    platformPaymentEvents: 0,
    platformRequestsChecked: 0,
    platformRequestEvents: 0,
    platformDocumentsChecked: 0,
    platformDocumentEvents: 0,
    platformIncidentsChecked: 0,
    platformIncidentEvents: 0,
    platformTeachersChecked: 0,
    platformTeacherEvents: 0,
    chatMessagesChecked: 0,
    chatMessageEventsBackfilled: 0,
    chatScheduleProposalsChecked: 0,
    chatScheduleEventsBackfilled: 0,
    chatBackfillSkippedOld: 0,
    entityBackfillEventsChecked: 0,
    entityBackfillEventsMaterialized: 0,
    entityBackfillSkippedOld: 0,
    platformFinanceEvents: 0,
    financeAnomaliesDetected: 0,
    financeIncidentsCreated: 0,
    financeErpVersion: FINANCE_ERP_VERSION,
    preventiveRisksEvaluated: 0,
    preventiveRisksDetected: 0,
    preventiveRisksActive: 0,
    preventiveCriticalRisks: 0,
    preventiveHighRisks: 0,
    preventiveTasksCreated: 0,
    preventiveNotificationsCreated: 0,
    preventiveIncidentsCreated: 0,
    preventiveOpsAlertsCreated: 0,
    preventiveAutomationEventsCreated: 0,
    preventiveRadarVersion: '',
    alertPriorityVersion: '',
    alertSignalsEvaluated: 0,
    alertDecisionsEvaluated: 0,
    alertDecisionsCreated: 0,
    alertSourcesUpdated: 0,
    alertCritical: 0,
    alertImportant: 0,
    alertSuppressedNoise: 0,
    alertAutoResolvable: 0,
    alertAutoResolutionsApplied: 0,
    alertNotificationsSuppressed: 0,
    alertNotificationsCreated: 0,
    alertTasksCreated: 0,
    selfSupervisionVersion: PLATFORM_SUPERVISION_VERSION,
    selfSupervisionFindingsDetected: 0,
    selfSupervisionFindingsEvaluated: 0,
    selfSupervisionFindingsCreated: 0,
    selfSupervisionResolvedFindings: 0,
    selfSupervisionCriticalFindings: 0,
    selfSupervisionHighFindings: 0,
    selfSupervisionBlockedProcesses: 0,
    selfSupervisionConsistencyIssues: 0,
    selfSupervisionAutomationIssues: 0,
    selfSupervisionAutoRepairable: 0,
    selfSupervisionAutoRepairsApplied: 0,
    selfSupervisionJobsQueued: 0,
    selfSupervisionTasksCreated: 0,
    selfSupervisionTasksResolved: 0,
    selfSupervisionIncidentsCreated: 0,
    selfSupervisionOpsAlertsCreated: 0,
    selfSupervisionOpsAlertsResolved: 0,
    selfSupervisionNotificationsCreated: 0,
    maintenanceHealthSnapshotsCreated: 0,
    workerHeartbeatsCreated: 0,
    relationshipFollowupVersion: RELATIONSHIP_FOLLOWUP_VERSION,
    relationshipFollowupsDetected: 0,
    relationshipFollowupsEvaluated: 0,
    relationshipFollowupsCreated: 0,
    relationshipFollowupsResolved: 0,
    relationshipFollowupNotificationsCreated: 0,
    relationshipFollowupTasksCreated: 0,
    relationshipFollowupOpsAlertsCreated: 0,
    relationshipFollowupUserNotifications: 0,
    relationshipFollowupAdminTasks: 0,
    relationshipFollowupScheduleBlocked: 0,
    relationshipFollowupQualityChecks: 0,
    relationshipFollowupCancellationRisks: 0,
    proactiveAssistVersion: PROACTIVE_ASSIST_VERSION,
    proactiveAssistSignalsDetected: 0,
    proactiveAssistSignalsEvaluated: 0,
    proactiveAssistSignalsCreated: 0,
    proactiveAssistSignalsResolved: 0,
    proactiveAssistNotificationsCreated: 0,
    proactiveAssistTasksCreated: 0,
    proactiveAssistOpsAlertsCreated: 0,
    proactiveAssistUserNotifications: 0,
    proactiveAssistAdminTasks: 0,
    proactiveAssistOpsAlerts: 0,
    proactiveAssistProfileHelp: 0,
    proactiveAssistSchedulingHelp: 0,
    proactiveAssistRequestReadiness: 0,
    proactiveAssistMatchingHelp: 0,
    proactiveAssistPaymentReadiness: 0,
    proactiveAssistReadinessChecks: 0,
    proactiveAssistSupplyActivation: 0,
    proactiveAssistAttentionChecks: 0,
    internalAiAssistantVersion: INTERNAL_AI_ASSISTANT_VERSION,
    internalAiInsightsDetected: 0,
    internalAiInsightsEvaluated: 0,
    internalAiInsightsCreated: 0,
    internalAiInsightsResolved: 0,
    internalAiTasksCreated: 0,
    internalAiOpsAlertsCreated: 0,
    internalAiCritical: 0,
    internalAiHigh: 0,
    internalAiHumanReview: 0,
    internalAiChatInsights: 0,
    internalAiIncidentInsights: 0,
    internalAiDocumentInsights: 0,
    internalAiProfileInsights: 0,
    internalAiDataQualityInsights: 0,
    internalAiPatternInsights: 0,
    internalAiOperationsInsights: 0,
    scaleLimits: {
      trustContextLimit,
      matchingTeacherScanLimit: runtimeNumber('matching.teacherScanLimit', matchingTeacherScanLimit, 1, 10000),
      matchingUserScanLimit: runtimeNumber('matching.userScanLimit', matchingUserScanLimit, 1, 20000),
      matchingAssignmentScanLimit: runtimeNumber('matching.assignmentScanLimit', matchingAssignmentScanLimit, 1, 50000),
      systemJobLimit: runtimeNumber('automation.systemJobBatchLimit', systemJobLimit, 1, 500),
    },
  };

  await writeWorkerHeartbeat(db, 'started', stats, {
    trigger: trustOnly ? 'trust_only' : criticalOnly ? 'critical_schedule' : 'full_schedule',
    limit,
  });

  if (trustOnly) {
    await processTrustReputation(db, stats);
    await writeMaintenanceHealthSnapshot(db, stats, 'github_actions_trust_worker');
    await writeWorkerHeartbeat(db, 'finished', stats, { trigger: 'trust_only' });
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  await processQueuedSystemJobs(db, stats);
  await processActivatedAssistedFamilyLeads(db, stats);
  await processPublicLeads(db, stats);
  await processPendingRequests(db, stats);
  await processActiveMatchingInterventions(db, stats);
  await processAssignedRequests(db, stats);
  await processEntityAutomationBackfill(db, stats);
  await processChatAutomationBackfill(db, stats);
  await processLinkedFamilyPaymentContext(db, stats);
  await processClassLifecycle(db, stats);
  await processUpcomingClassReminders(db, stats);
  await processUnmarkedClasses(db, stats);
  await processAttendanceConfirmations(db, stats);
  await processClassLifecycle(db, stats);
  await processIncidentClassification(db, stats);
  await reconcileVerifiedPayments(db, stats);
  await processLinkedFamilyPaymentContext(db, stats);
  await processClassLifecycle(db, stats);
  await processPaymentReminders(db, stats);
  if (criticalOnly) {
    await processPendingPushNotifications(db, stats);
    await writeMaintenanceHealthSnapshot(db, stats, 'github_actions_critical_worker');
    await writeWorkerHeartbeat(db, 'finished', stats, { trigger: 'critical_schedule' });
    console.log(JSON.stringify(stats, null, 2));
    return;
  }
  await processPlatformSelfSupervision(db, stats);
  await processRelationshipFollowups(db, stats);
  await processProactiveAssist(db, stats);
  await processInternalAiAssistant(db, stats);
  await processPendingPushNotifications(db, stats);

  await processPlatformAutomationSweep(db, stats);
  await processPreventiveIncidentRadar(db, stats);
  await processAlertPriorityEngine(db, stats);
  await processTrustReputation(db, stats);
  await processPendingPushNotifications(db, stats);
  await writeAnalyticsRollup(db, stats);
  const snapshot = await writeScaleMetricSnapshot(db, 'github_actions_worker');
  stats.metricSnapshotsCreated += 1;
  stats.opsAlertsCreated += snapshot.alerts.length;
  await writeMaintenanceHealthSnapshot(db, stats, 'github_actions_full_worker');
  await writeWorkerHeartbeat(db, 'finished', stats, { trigger: 'full_schedule' });

  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  const message = error?.message || String(error);
  const stack = error?.stack || message;
  if (/default credentials|applicationDefault|GOOGLE_APPLICATION_CREDENTIALS/i.test(stack)) {
    console.error(
      'Firebase credentials unavailable. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_BASE64, ' +
      'or configure GOOGLE_APPLICATION_CREDENTIALS for local dry-runs.',
    );
  }
  if (allowQuotaExhaustedExit && /RESOURCE_EXHAUSTED|Quota exceeded/i.test(stack)) {
    console.warn('Firestore quota exhausted; automation will retry on the next GitHub Actions schedule.');
    console.log(JSON.stringify({
      status: 'quota_exhausted',
      retry: 'next_schedule',
      criticalOnly,
      limit,
      timestamp: isoNow(),
    }, null, 2));
    process.exit(0);
  }
  console.error(stack);
  process.exit(1);
});
