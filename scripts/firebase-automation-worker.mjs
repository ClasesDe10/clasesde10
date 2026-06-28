#!/usr/bin/env node

import admin from 'firebase-admin';
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
  PAID_PAYMENT_STATUSES,
  buildClassPaymentPatch,
  buildPaymentValidationPayload,
  isFamilyPayment,
  isPaymentOverdue,
  isPaymentVerified,
  isTeacherPayout,
  matchPaymentToClasses,
  normalizePaymentStatus,
  paymentAmount,
} from '../js/payment-engine.js';
import { buildNotificationDocument } from '../js/notification-engine.js';

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

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function lower(value) {
  return clean(value).toLowerCase();
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

async function listCollection(db, collectionName, maxDocs = trustContextLimit) {
  const snap = await db.collection(collectionName).limit(maxDocs).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data(), __ref: doc.ref }));
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
  ] = await Promise.all([
    listCollection(db, 'clases'),
    listCollection(db, 'pagos'),
    listCollection(db, 'documentos'),
    listCollection(db, 'solicitudes'),
    listCollection(db, 'solicitudMatches'),
    listCollection(db, 'asignaciones'),
    listCollection(db, 'incidencias'),
    listCollection(db, 'alumnos'),
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
  };
}

async function writeDoc(collectionRef, id, payload, options = {}) {
  if (dryRun) return { id: id || `dry_${Date.now()}` };
  if (id) {
    const ref = collectionRef.doc(id);
    await ref.set(payload, options.merge === false ? undefined : { merge: true });
    return ref;
  }
  return collectionRef.add(payload);
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

function buildScaleAlerts(metrics) {
  const alerts = [];
  if ((metrics.jobs?.queued || 0) > 500) alerts.push({ level: 'high', type: 'job_backlog', message: 'System job backlog above 500 queued jobs.' });
  if ((metrics.jobs?.deadLetter || 0) > 0) alerts.push({ level: 'critical', type: 'dead_letters', message: 'Dead-letter jobs require admin review.' });
  if ((metrics.payments?.overdue || 0) > 0) alerts.push({ level: 'high', type: 'overdue_payments', message: 'There are overdue payments.' });
  if ((metrics.notifications?.unread || 0) > 10000) alerts.push({ level: 'medium', type: 'notification_backlog', message: 'Unread notification backlog is high.' });
  return alerts;
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
      total: await countQuery(db.collection('clases')),
      scheduled: await countQuery(db.collection('clases').where('status', '==', 'programada')),
      completed: await countQuery(db.collection('clases').where('status', '==', 'realizada')),
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

  return { alerts };
}

async function countActiveAssignmentsByTeacher(db) {
  const snap = await db.collection('asignaciones')
    .where('active', '==', true)
    .limit(matchingAssignmentScanLimit)
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
    const snap = await db.collection('disponibilidad').limit(matchingTeacherScanLimit * 5).get();
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
    db.collection('profesores').limit(matchingTeacherScanLimit).get(),
    db.collection('users').limit(matchingUserScanLimit).get(),
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
      actorUid: clean(payload.actorUid || 'system', 180),
      action,
      entityType,
      entityId: clean(payload.entityId, 180) || null,
      metadata: payload.metadata || {},
      trace: job.data.trace || null,
      createdAt: now(),
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
    .limit(systemJobLimit)
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

function classLabel(data) {
  const date = clean(data.fecha || data.date);
  const time = clean(data.hora_inicio || data.startTime).slice(0, 5);
  const subject = clean(data.materia || data.subject || 'clase');
  return [subject, date, time].filter(Boolean).join(' · ');
}

async function loadClassDocsByStatuses(db, statuses, perStatusLimit = limit) {
  const docs = new Map();
  for (const field of ['estado', 'status']) {
    for (const status of statuses) {
      const snap = await db.collection('clases').where(field, '==', status).limit(perStatusLimit).get();
      snap.docs.forEach((doc) => docs.set(doc.id, doc));
    }
  }
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
  const snap = await db.collection('clases').limit(limit).get();
  for (const doc of snap.docs) {
    const data = doc.data();
    const transition = buildClassLifecycleTransition(doc.id, data);
    stats.lifecycleClassesEvaluated += 1;
    if (!transition.changed) continue;

    await updateRef(doc.ref, {
      ...transition.patch,
      lifecycleTransitionCount: admin.firestore.FieldValue.increment(1),
      updatedAt: now(),
    });

    const historyCreated = await writeLifecycleHistoryOnce(db, transition);
    if (historyCreated) stats.lifecycleHistoryEventsCreated += 1;

    await writeDoc(db.collection('auditLogs'), `audit_${transition.transitionId}`, {
      ...transition.auditEvent,
      createdAt: now(),
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

  await writeDoc(db.collection('incidencias'), id, {
    ...buildClassIncidentPayload(classId, classData, source, notes, 'automation'),
    aiClassification,
    aiVersion: AI_FEATURES_VERSION,
    categoria: aiClassification.category,
    priority: aiClassification.priority,
    prioridad: aiClassification.priority,
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

    await updateRef(doc.ref, {
      aiClassification,
      aiVersion: AI_FEATURES_VERSION,
      categoria: data.categoria || aiClassification.category,
      priority: data.priority || aiClassification.priority,
      prioridad: data.prioridad || aiClassification.priority,
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

  if (!isEndOfWeekWindow()) return;

  const classesSnap = await db.collection('clases').limit(limit).get();
  for (const doc of classesSnap.docs) {
    const data = doc.data();
    if (!['realizada', 'completada'].includes(classStatus(data))) continue;
    if (!classHasPrice(data)) continue;
    if (['pagado', 'paid', 'validado'].includes(paymentStatus(data))) continue;

    const { familyUid } = await resolveClassRecipients(db, data);
    const label = classLabel(data);
    const payload = {
      type: 'weekly_payment_due',
      classId: doc.id,
      url: '/pages/login.html',
    };
    let created = 0;
    created += await notifyUserOnce(
      db,
      familyUid,
      'Pago semanal pendiente',
      `Revisa el pago de la clase ${label}. Los pagos se revisan al cierre de la semana.`,
      payload,
      `weekly_payment_due_${doc.id}_family`,
    ) ? 1 : 0;
    created += await notifyAdminsOnce(
      db,
      'Pago semanal pendiente',
      `Revisar cobro de la clase ${label}.`,
      payload,
      `weekly_payment_due_${doc.id}_admin`,
    );
    stats.weeklyPaymentRemindersCreated += created;
  }
}

async function loadFamilyClassesForPayment(db, payment) {
  const familyUid = clean(payment.familyUid || payment.familia_id);
  if (!familyUid) return [];
  const snap = await db.collection('clases').where('familyUid', '==', familyUid).limit(80).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
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
    metricSnapshotsCreated: 0,
    opsAlertsCreated: 0,
    scaleLimits: {
      trustContextLimit,
      matchingTeacherScanLimit,
      matchingUserScanLimit,
      matchingAssignmentScanLimit,
      systemJobLimit,
    },
  };

  if (trustOnly) {
    await processTrustReputation(db, stats);
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

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
