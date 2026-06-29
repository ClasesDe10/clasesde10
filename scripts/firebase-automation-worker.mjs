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
  buildFamilyRequestBrief,
  buildMatchingAiPrompt,
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
  buildAutomaticIncidentPayload,
  normalizeIncidentPriority,
  incidentPriorityMeta,
} from '../js/incident-engine.js';
import {
  PAID_PAYMENT_STATUSES,
  buildClassPaymentPatch,
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
import { buildNotificationDocument } from '../js/notification-engine.js';
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
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = Number(limitArg?.split('=')[1] || process.env.AUTOMATION_LIMIT || 50);
const trustContextLimit = Math.max(1, Number(process.env.TRUST_CONTEXT_LIMIT || 2000));
const matchingTeacherScanLimit = Math.max(1, Number(process.env.MATCHING_TEACHER_SCAN_LIMIT || 1000));
const matchingUserScanLimit = Math.max(1, Number(process.env.MATCHING_USER_SCAN_LIMIT || 2000));
const matchingAssignmentScanLimit = Math.max(1, Number(process.env.MATCHING_ASSIGNMENT_SCAN_LIMIT || 5000));
const systemJobLimit = Math.max(1, Number(process.env.SYSTEM_JOB_LIMIT || 50));
const systemJobMaxBackoffMs = 60 * 60 * 1000;
let automationRulesCache = { expiresAt: 0, rules: [] };
let platformConfigCache = { expiresAt: 0, config: {} };
let platformConfigRuntime = {};

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
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
  return {
    summary: `Alumno: ${clean(data.alumno || data.metadata?.alumno || data.studentName) || 'Sin nombre'}. Nivel: ${level}. Materia: ${subject}. Modalidad: ${modality}. Zona: ${zone}.`,
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

  await Promise.all(admins.map((user) => writeDoc(db.collection('notificaciones'), null, {
    ...buildNotificationDocument({
      userUid: user.id,
      role: user.role || 'admin',
      title,
      body,
      type: payload.type || 'automation',
      payload,
      source: 'admin',
    }),
    readAt: null,
    leida: false,
    fromRole: 'admin',
    fromAutomation: true,
    createdAt: now(),
    updatedAt: now(),
  })));
}

function notificationId(...parts) {
  return parts
    .map((part) => clean(part, 180).toLowerCase().replace(/[^a-z0-9_-]+/g, '_'))
    .filter(Boolean)
    .join('__')
    .slice(0, 900);
}

async function notifyUserOnce(db, userUid, title, body, payload = {}, key = '') {
  const targetUid = clean(userUid, 180);
  if (!targetUid) return false;

  const id = notificationId('auto', key || payload.type || 'notification', targetUid);
  const ref = db.collection('notificaciones').doc(id);
  const existing = await ref.get();
  if (existing.exists) return false;

  await writeDoc(db.collection('notificaciones'), id, {
    ...buildNotificationDocument({
      userUid: targetUid,
      title,
      body,
      type: payload.type || 'automation',
      payload,
      source: 'admin',
    }),
    readAt: null,
    leida: false,
    fromRole: 'admin',
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
    runAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + Math.max(0, Number(job.runAfterMinutes || 0)) * 60 * 1000)),
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
      const created = await notifyUserOnce(db, notification.userUid, notification.title, notification.body, payload, notification.id);
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
      await notifyAdmins(db, 'Nuevo profesor interesado', `${lead.nombre || lead.email || 'Profesor'} envio una solicitud publica. Precio sugerido: ${price} EUR/h.`, {
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
      await notifyAdmins(db, 'Nueva familia solicita profesor', `${lead.nombre || lead.email || 'Familia'} solicito ${requestPayload.materia || 'materia sin indicar'}.`, {
        type: 'family_lead_request',
        leadId: doc.id,
        requestId: requestRef.id,
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
    await notifyAdmins(db, 'Nuevo contacto publico', `${lead.nombre || lead.email || 'Contacto'} envio un mensaje.`, {
      type: 'contact_lead',
      leadId: doc.id,
    });
    stats.contactLeadsProcessed += 1;
  }
}

async function generateMatchesForRequest(db, requestId, request, stats, reason = 'worker_scan') {
  const profile = getMatchingRequestProfile({ id: requestId, ...request });
  const requestBrief = buildFamilyRequestBrief({ id: requestId, ...request });
  const teachers = await loadTeachers(db);
  const baseCandidates = rankTeachersForRequest({ id: requestId, ...request }, teachers, {
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
      matchRunId: runRef.id,
      matchComputedAt: now(),
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
    aiUsed,
    aiMode,
    aiError,
    matchingVersion: MATCHING_VERSION,
  });

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
    if (data.matchStatus === 'ready') continue;
    await generateMatchesForRequest(db, doc.id, data, stats);
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
    if (request.matchStatus === 'ready' && request.matchRunId) {
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
    runAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + retryDelayMs(attempts))),
    leaseUntil: null,
    lastError,
    updatedAt: now(),
  });
}

async function processQueuedSystemJobs(db, stats) {
  const snap = await db.collection('systemJobs')
    .where('status', '==', 'queued')
    .limit(runtimeNumber('automation.systemJobBatchLimit', systemJobLimit, 1, 500))
    .get()
    .catch(() => ({ docs: [] }));
  const dueJobs = snap.docs
    .map((doc) => ({ id: doc.id, ref: doc.ref, data: doc.data() }))
    .filter((job) => {
      const runAt = dateFromFirestore(job.data.runAt);
      return !runAt || runAt.getTime() <= Date.now();
    })
    .sort((a, b) => {
      const priority = Number(b.data.priority || 0) - Number(a.data.priority || 0);
      if (priority) return priority;
      return (dateFromFirestore(a.data.runAt)?.getTime() || 0) - (dateFromFirestore(b.data.runAt)?.getTime() || 0);
    });

  stats.systemJobsSeen += snap.docs.length;
  for (const job of dueJobs) {
    const attempts = Math.max(0, Number(job.data.attempts || 0)) + 1;
    await writeDoc(job.ref.parent, job.id, {
      status: 'processing',
      attempts,
      workerId: 'github-actions-worker',
      startedAt: now(),
      leaseUntil: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)),
      updatedAt: now(),
    });
    job.data.attempts = attempts;

    try {
      const result = await dispatchSystemJob(db, job, stats);
      await markSystemJobCompleted(job, result);
      stats.systemJobsProcessed += 1;
    } catch (error) {
      await markSystemJobFailed(db, job, error);
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

function classFamilyAmount(data = {}) {
  const amount = Number(data.precio_total ?? data.familyAmount ?? data.amount ?? data.total ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
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

  const teacherName = fullName(
    teacherProfile.data.nombre || teacherUser.data.nombre,
    teacherProfile.data.apellidos || teacherUser.data.apellidos,
  ) || teacherProfile.data.email || teacherUser.data.email || 'Profesor';
  const familyName = fullName(
    familyProfile.data.nombre || familyUser.data.nombre,
    familyProfile.data.apellidos || familyUser.data.apellidos,
  ) || familyProfile.data.email || familyUser.data.email || 'Familia';
  const studentName = fullName(studentProfile.data.nombre, studentProfile.data.apellidos);
  const subject = clean(assignment.materia || assignment.subject, 180);
  const introBody = `Profesor asignado: ${teacherName}. Usad este chat para acordar fecha y hora de la primera clase. Cuando una parte proponga un horario, la otra podra aceptarlo y se creara automaticamente la clase en el calendario.`;
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
      classId: doc.id,
      from: transition.from || null,
      to: transition.to,
      target: transition.target,
      lifecycleVersion: CLASS_LIFECYCLE_VERSION,
    });

    const recipients = await resolveClassRecipients(db, data);
    await notifyLifecycleRecipients(db, transition, recipients, stats);
    stats.lifecycleTransitionsApplied += 1;
  }
}

async function createClassIncidentOnce(db, classId, classData, source, notes, stats) {
  const id = notificationId('class_incident', source, classId);
  const ref = db.collection('incidencias').doc(id);
  const existing = await ref.get();
  if (existing.exists) return false;
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
  const prioridad = normalizeIncidentPriority(aiClassification.priority, aiClassification.category);
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
  for (const doc of docs) {
    const data = doc.data();
    if (!isScheduledClassStatus(data.estado || data.status)) continue;
    if (!classEndedMoreThan(data, 60)) continue;

    const { teacherUid, familyUid } = await resolveClassRecipients(db, data);
    const label = classLabel(data);
    const payload = {
      type: 'class_unmarked_after_1h',
      classId: doc.id,
      url: '/pages/login.html',
    };
    const key = `class_unmarked_after_1h_${doc.id}`;
    let created = 0;

    created += await notifyUserOnce(
      db,
      teacherUid,
      'Clase pendiente de marcar',
      `La clase ${label} termino hace mas de una hora y sigue sin registrarse como realizada, cancelada o reprogramada.`,
      payload,
      `${key}_teacher`,
    ) ? 1 : 0;
    created += await notifyUserOnce(
      db,
      familyUid,
      'Confirma si la clase se dio',
      `La clase ${label} termino hace mas de una hora. Confirma desde tu panel si se realizo o si hubo incidencia.`,
      payload,
      `${key}_family`,
    ) ? 1 : 0;
    created += await notifyAdminsOnce(
      db,
      'Clase sin registrar',
      `La clase ${label} sigue programada una hora despues de terminar.`,
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
      const created = await createClassIncidentOnce(
        db,
        doc.id,
        data,
        source,
        `Revisar incidencia de clase: ${label}. Estado asistencia: ${summary}.`,
        stats,
      );
      if (created) {
        await notifyAdminsOnce(
          db,
          'Incidencia de clase',
          `Revisar la clase ${label}. Estado: ${summary}.`,
          { type: 'class_incident', classId: doc.id, source, url: '/pages/login.html' },
          `class_incident_${source}_${doc.id}_admin`,
        );
      }
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

function isEndOfWeekWindow() {
  const day = new Date().getDay();
  return day === 5 || day === 6 || day === 0;
}

function classHasPrice(data) {
  return Number(data.precio_total || data.amount || data.familyAmount || 0) > 0;
}

async function processPaymentReminders(db, stats) {
  const paymentsSnap = await db.collection('pagos').limit(limit).get();
  const paymentSchedules = await listCollection(db, 'paymentSchedules', limit);
  const scheduleIndex = buildPaymentScheduleIndex(paymentSchedules);
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

  const classes = await listCollection(db, 'clases', limit);
  for (const data of classes) {
    const doc = data.__ref ? { id: data.id, ref: data.__ref } : null;
    if (!doc) continue;
    if (!['realizada', 'completada'].includes(classStatus(data))) continue;
    if (!classHasPrice(data)) continue;
    if (['pagado', 'paid', 'validado'].includes(paymentStatus(data))) continue;

    const { familyUid } = await resolveClassRecipients(db, data);
    const label = classLabel(data);
    const familyName = clean(data.familyName || data.familia_nombre || data.parentName || data.familyUid || data.familia_id || 'familia sin nombre', 120);
    const studentName = clean(data.studentName || data.alumno_nombre || data.alumnoName || data.studentId || data.alumno_id || 'alumno/a sin nombre', 120);
    const teacherName = clean(data.teacherName || data.profesor_nombre || data.teacherName || data.teacherUid || data.profesor_id || 'profesor sin nombre', 120);
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
    const payload = {
      type: paymentState.overdue ? 'payment_overdue' : 'weekly_payment_due',
      classId: doc.id,
      dueAt: paymentState.dueAt || '',
      familyName,
      studentName,
      teacherName,
      amount,
      url: '/pages/login.html',
    };
    let created = 0;
    created += await notifyUserOnce(
      db,
      familyUid,
      paymentState.overdue ? 'Justificante vencido' : 'Justificante pendiente',
      paymentState.overdue
        ? `Ha pasado el margen de 24h para enviar el justificante de la clase ${label}.`
        : `Ya puedes enviar el justificante de la clase ${label}.`,
      payload,
      `${paymentState.overdue ? 'payment_overdue' : 'weekly_payment_due'}_${doc.id}_family`,
    ) ? 1 : 0;
    created += await notifyAdminsOnce(
      db,
      paymentState.overdue ? 'Justificante vencido' : 'Justificante pendiente',
      paymentState.overdue
        ? `La familia ${familyName} falta por pagar/justificar la clase ${label} de ${studentName} con ${teacherName}. Importe familia: ${amount ? `${amount.toFixed(2)} EUR` : 'sin importe'}.`
        : `Revisar justificante pendiente de ${familyName}: clase ${label}${amount ? ` (${amount.toFixed(2)} EUR)` : ''}.`,
      payload,
      `${paymentState.overdue ? 'payment_overdue' : 'weekly_payment_due'}_${doc.id}_admin`,
    );
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
    if (!classEnded(item, 60)) continue;
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

    console.log(JSON.stringify({ selfTest: 'passed', matchingVersion: MATCHING_VERSION, best: aiMerged[0] }, null, 2));
    return;
  }

  initFirebaseAdmin();
  const db = admin.firestore();
  platformConfigRuntime = await loadWorkerPlatformConfig(db);
  const stats = {
    dryRun,
    trustOnly,
    leadsSeen: 0,
    leadsFlaggedForReview: 0,
    familyLeadsProcessed: 0,
    teacherLeadsProcessed: 0,
    contactLeadsProcessed: 0,
    requestsSeen: 0,
    matchesGenerated: 0,
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
    lifecycleClassesEvaluated: 0,
    lifecycleTransitionsApplied: 0,
    lifecycleHistoryEventsCreated: 0,
    lifecycleNotificationsCreated: 0,
    trustProfilesUpdated: 0,
    systemJobsSeen: 0,
    systemJobsProcessed: 0,
    systemJobsFailed: 0,
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
    platformFinanceEvents: 0,
    financeAnomaliesDetected: 0,
    financeIncidentsCreated: 0,
    financeErpVersion: FINANCE_ERP_VERSION,
    scaleLimits: {
      trustContextLimit,
      matchingTeacherScanLimit: runtimeNumber('matching.teacherScanLimit', matchingTeacherScanLimit, 1, 10000),
      matchingUserScanLimit: runtimeNumber('matching.userScanLimit', matchingUserScanLimit, 1, 20000),
      matchingAssignmentScanLimit: runtimeNumber('matching.assignmentScanLimit', matchingAssignmentScanLimit, 1, 50000),
      systemJobLimit: runtimeNumber('automation.systemJobBatchLimit', systemJobLimit, 1, 500),
    },
  };

  if (trustOnly) {
    await processTrustReputation(db, stats);
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  await processPlatformAutomationSweep(db, stats);
  await processQueuedSystemJobs(db, stats);
  await processPublicLeads(db, stats);
  await processTrustReputation(db, stats);
  await processPendingRequests(db, stats);
  await processAssignedRequests(db, stats);
  await processClassLifecycle(db, stats);
  await processUpcomingClassReminders(db, stats);
  await processUnmarkedClasses(db, stats);
  await processAttendanceConfirmations(db, stats);
  await processClassLifecycle(db, stats);
  await processIncidentClassification(db, stats);
  await reconcileVerifiedPayments(db, stats);
  await processClassLifecycle(db, stats);
  await processPaymentReminders(db, stats);
  await writeAnalyticsRollup(db, stats);
  const snapshot = await writeScaleMetricSnapshot(db, 'github_actions_worker');
  stats.metricSnapshotsCreated += 1;
  stats.opsAlertsCreated += snapshot.alerts.length;

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
  console.error(stack);
  process.exit(1);
});
