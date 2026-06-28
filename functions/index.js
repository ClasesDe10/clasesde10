const admin = require('firebase-admin');
const Stripe = require('stripe');
const { defineSecret } = require('firebase-functions/params');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');

admin.initializeApp();
const db = admin.firestore();

const REGION = 'europe-west1';
const ADMIN_EMAIL = 'contacto.clasesde10@gmail.com';
const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function lower(value) {
  return clean(value).toLowerCase();
}

function normalizePaymentStatus(status) {
  const raw = lower(status);
  if (!raw) return 'pendiente';
  if (raw === 'succeeded' || raw === 'paid' || raw === 'captured') return 'validado';
  if (raw === 'processing') return 'procesando';
  if (raw === 'requires_action' || raw === 'requires_payment_method') return 'requiere_accion';
  if (raw === 'failed') return 'fallido';
  if (raw === 'expired') return 'vencido';
  if (raw === 'refunded') return 'devuelto';
  if (raw === 'canceled' || raw === 'cancelled') return 'cancelado';
  return raw;
}

function isTeacherPayout(data = {}) {
  return ['teacher_payout', 'pago_profesor'].includes(data.paymentType || data.tipo);
}

function paymentAmount(data = {}) {
  const amount = Number(data.monto ?? data.amount ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function buildClassPaymentPatch(payment, nowValue = now()) {
  if (isTeacherPayout(payment)) {
    return {
      estado_pago_profesor: 'pagado',
      teacherPaymentStatus: 'pagado',
      teacherPayoutId: payment.id || payment.paymentId || '',
      teacherPayoutPaidAt: nowValue,
      updatedAt: nowValue,
    };
  }
  return {
    estado_pago: 'validado',
    estado_pago_familia: 'validado',
    paymentStatus: 'validado',
    familyPaymentStatus: 'validado',
    familyPaymentId: payment.id || payment.paymentId || '',
    familyPaymentValidatedAt: nowValue,
    updatedAt: nowValue,
  };
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

function now() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function normalizeStatus(data) {
  return lower(data.status || data.estado || data.estado_verificacion || data.verificationStatus);
}

function getUserName(user) {
  return [user?.nombre, user?.apellidos].filter(Boolean).join(' ').trim() || user?.email || '';
}

async function getAdminUsers() {
  const snap = await db.collection('users').where('role', '==', 'admin').get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

const DEFAULT_NOTIFICATION_SETTINGS = {
  enabled: true,
  channels: {
    internal: true,
    browser: true,
    push: true,
    email_future: false,
    whatsapp_future: false,
  },
  eventTypes: {},
  roles: {
    admin: true,
    profesor: true,
    familia: true,
    alumno: true,
  },
};

const NOTIFICATION_DEFINITIONS = {
  admin_manual: { category: 'admin', priority: 'normal', channels: ['internal', 'browser', 'push'] },
  chat_message: { category: 'chat', priority: 'normal', channels: ['internal', 'browser', 'push'] },
  class_reminder: { category: 'clases', priority: 'normal', channels: ['internal', 'browser', 'push'] },
  class_confirmation_needed: { category: 'clases', priority: 'high', channels: ['internal', 'browser', 'push'] },
  class_unmarked_after_1h: { category: 'clases', priority: 'high', channels: ['internal', 'browser', 'push'] },
  class_schedule_change: { category: 'clases', priority: 'high', channels: ['internal', 'browser', 'push'] },
  class_incident: { category: 'incidencias', priority: 'critical', channels: ['internal', 'browser', 'push'] },
  weekly_payment_due: { category: 'pagos', priority: 'high', channels: ['internal', 'browser', 'push'] },
  family_payment_pending: { category: 'pagos', priority: 'high', channels: ['internal', 'browser', 'push'] },
  teacher_payout_pending: { category: 'pagos', priority: 'high', channels: ['internal', 'browser', 'push'] },
  payment_overdue: { category: 'pagos', priority: 'critical', channels: ['internal', 'browser', 'push'] },
  request_created: { category: 'solicitudes', priority: 'high', channels: ['internal', 'browser', 'push'] },
  matching_ready: { category: 'matching', priority: 'normal', channels: ['internal', 'browser', 'push'] },
  matching_no_match: { category: 'matching', priority: 'high', channels: ['internal', 'browser', 'push'] },
  assignment_created: { category: 'matching', priority: 'high', channels: ['internal', 'browser', 'push'] },
  verification_pending: { category: 'verificacion', priority: 'high', channels: ['internal', 'browser', 'push'] },
  document_review_pending: { category: 'verificacion', priority: 'high', channels: ['internal', 'browser', 'push'] },
  profile_updated: { category: 'perfil', priority: 'normal', channels: ['internal', 'browser'] },
  contact_lead: { category: 'leads', priority: 'normal', channels: ['internal', 'browser', 'push'] },
  teacher_lead: { category: 'leads', priority: 'high', channels: ['internal', 'browser', 'push'] },
  family_lead_request: { category: 'leads', priority: 'high', channels: ['internal', 'browser', 'push'] },
  monthly_summary: { category: 'finanzas', priority: 'normal', channels: ['internal', 'browser'] },
  automation: { category: 'sistema', priority: 'normal', channels: ['internal', 'browser'] },
};

function notificationDefinition(type) {
  return NOTIFICATION_DEFINITIONS[type] || NOTIFICATION_DEFINITIONS.automation;
}

function notificationChannels(type, explicitChannels) {
  const channels = Array.isArray(explicitChannels) && explicitChannels.length
    ? explicitChannels
    : notificationDefinition(type).channels;
  return [...new Set(channels.filter(Boolean))];
}

async function getNotificationSettings() {
  const snap = await db.collection('configuracion').doc('notificaciones').get().catch(() => null);
  const data = snap?.exists ? snap.data() : {};
  return {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...data,
    channels: {
      ...DEFAULT_NOTIFICATION_SETTINGS.channels,
      ...(data.channels || {}),
    },
    eventTypes: {
      ...(data.eventTypes || {}),
    },
    roles: {
      ...DEFAULT_NOTIFICATION_SETTINGS.roles,
      ...(data.roles || {}),
    },
  };
}

function isNotificationEnabled(settings, type, channel = 'internal', role = '') {
  if (settings.enabled === false) return false;
  if (settings.channels?.[channel] === false) return false;
  if (settings.eventTypes?.[type] === false) return false;
  if (role && settings.roles?.[role] === false) return false;
  return true;
}

function buildNotification(userUid, title, body, payload = {}, extra = {}) {
  const type = clean(payload.type || extra.type || 'automation', 80);
  const definition = notificationDefinition(type);
  const finalTitle = clean(title, 140) || 'ClasesDe10';
  const finalBody = clean(body, 1200);
  return {
    userUid,
    usuario_id: userUid,
    titulo: finalTitle,
    title: finalTitle,
    cuerpo: finalBody,
    body: finalBody,
    type,
    category: extra.category || definition.category,
    priority: extra.priority || definition.priority,
    channels: notificationChannels(type, extra.channels || payload.channels),
    payload: {
      ...payload,
      type,
    },
    actionUrl: clean(extra.actionUrl || payload.url || '/pages/login.html', 500) || '/pages/login.html',
    role: clean(extra.role, 40),
    readAt: null,
    leida: false,
    fromRole: clean(extra.fromRole || 'system', 80),
    fromAutomation: extra.fromAutomation !== false,
    createdByUid: clean(extra.createdByUid, 180),
    createdAt: now(),
    updatedAt: now(),
  };
}

async function writeNotification(userUid, title, body, payload = {}, extra = {}) {
  const targetUid = clean(userUid, 180);
  if (!targetUid) return null;
  const settings = await getNotificationSettings();
  const type = clean(payload.type || extra.type || 'automation', 80);
  if (!isNotificationEnabled(settings, type, 'internal', extra.role || '')) return null;
  return db.collection('notificaciones').add(buildNotification(targetUid, title, body, payload, extra));
}

async function writeNotificationOnce(userUid, title, body, payload = {}, key = '', extra = {}) {
  const targetUid = clean(userUid, 180);
  if (!targetUid) return false;
  const id = [key || payload.type || 'notification', targetUid]
    .map((part) => clean(part, 180).toLowerCase().replace(/[^a-z0-9_-]+/g, '_'))
    .filter(Boolean)
    .join('__')
    .slice(0, 900);
  const ref = db.collection('notificaciones').doc(id);
  if ((await ref.get()).exists) return false;

  const settings = await getNotificationSettings();
  const type = clean(payload.type || extra.type || 'automation', 80);
  if (!isNotificationEnabled(settings, type, 'internal', extra.role || '')) return false;
  await ref.set(buildNotification(targetUid, title, body, payload, extra), { merge: false });
  return true;
}

async function notifyAdmins(title, body, payload = {}) {
  const admins = await getAdminUsers();
  if (!admins.length) {
    await db.collection('automationEvents').add({
      type: 'admin_notification_missing_recipient',
      title,
      body,
      payload,
      adminEmail: ADMIN_EMAIL,
      createdAt: now(),
    });
    return;
  }

  await Promise.all(admins.map((user) => writeNotification(user.id, title, body, payload, {
    role: user.role || 'admin',
    fromRole: 'admin',
  })));
}

async function getPushTokensForUser(userUid) {
  const snap = await db.collection('notificationTokens')
    .where('userUid', '==', userUid)
    .where('active', '==', true)
    .limit(20)
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((item) => item.token);
}

async function deactivateInvalidTokens(tokens, responses = []) {
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
  if (count) await batch.commit();
}

async function sendPushForNotification(notificationId, notification) {
  const userUid = clean(notification.userUid, 180);
  if (!userUid) return { sent: 0, skipped: 'missing_user' };

  const channels = Array.isArray(notification.channels) ? notification.channels : [];
  if (!channels.includes('push')) return { sent: 0, skipped: 'push_channel_disabled' };

  const settings = await getNotificationSettings();
  if (!isNotificationEnabled(settings, notification.type || 'automation', 'push', notification.role || '')) {
    return { sent: 0, skipped: 'push_disabled_by_settings' };
  }

  const tokens = await getPushTokensForUser(userUid);
  if (!tokens.length) return { sent: 0, skipped: 'no_tokens' };

  const actionUrl = clean(notification.actionUrl || notification.payload?.url || '/pages/login.html', 500) || '/pages/login.html';
  const message = {
    tokens: tokens.map((item) => item.token),
    notification: {
      title: clean(notification.title || notification.titulo || 'ClasesDe10', 140),
      body: clean(notification.body || notification.cuerpo || '', 800),
    },
    data: {
      notificationId,
      type: clean(notification.type || 'automation', 80),
      url: actionUrl,
    },
    webpush: {
      fcmOptions: {
        link: actionUrl,
      },
      notification: {
        icon: 'https://clasesde10.com/assets/img/logo-192.png',
        badge: 'https://clasesde10.com/assets/img/logo-192.png',
        tag: notificationId,
        renotify: true,
        requireInteraction: notification.priority === 'critical',
      },
    },
  };

  const response = await admin.messaging().sendEachForMulticast(message);
  await deactivateInvalidTokens(tokens, response.responses);
  await db.collection('notificaciones').doc(notificationId).set({
    push: {
      attemptedAt: now(),
      successCount: response.successCount,
      failureCount: response.failureCount,
      tokenCount: tokens.length,
    },
    updatedAt: now(),
  }, { merge: true });
  return { sent: response.successCount, failed: response.failureCount };
}

function participantUidsFromChat(chat = {}) {
  if (chat.participantUids && typeof chat.participantUids === 'object') {
    return Object.keys(chat.participantUids).filter((uid) => chat.participantUids[uid] === true);
  }
  return uniq([
    chat.familyUid,
    chat.familia_id,
    chat.teacherUid,
    chat.profesor_id,
    chat.familyUserUid,
    chat.teacherUserUid,
  ].map((item) => clean(item, 180)).filter(Boolean));
}

async function recipientUidsForChat(chat = {}, senderUid = '') {
  const admins = await getAdminUsers();
  return uniq([
    ...participantUidsFromChat(chat),
    ...admins.map((user) => user.id),
  ]).filter((uid) => uid && uid !== senderUid);
}

function changedAny(before = {}, after = {}, fields = []) {
  return fields.some((field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null));
}

async function resolveUserUidFromProfile(collectionName, profileId, fallback = '') {
  const id = clean(profileId, 180);
  if (!id) return clean(fallback, 180);
  const snap = await db.collection(collectionName).doc(id).get().catch(() => null);
  if (!snap?.exists) return clean(fallback || id, 180);
  const data = snap.data();
  return clean(data.userUid || data.firebase_uid || data.usuario_id || fallback || id, 180);
}

exports.sendPushOnNotificationCreated = onDocumentCreated({
  region: REGION,
  document: 'notificaciones/{notificationId}',
}, async (event) => {
  const notificationId = event.params.notificationId;
  const notification = event.data.data();
  try {
    const result = await sendPushForNotification(notificationId, notification);
    logger.info('sendPushOnNotificationCreated completed', { notificationId, result });
  } catch (error) {
    logger.warn('sendPushOnNotificationCreated failed', {
      notificationId,
      message: error.message,
      code: error.code,
    });
    await event.data.ref.set({
      push: {
        attemptedAt: now(),
        error: clean(error.message || error.code || 'unknown', 500),
      },
      updatedAt: now(),
    }, { merge: true });
  }
});

exports.notifyOnChatMessage = onDocumentCreated({
  region: REGION,
  document: 'chats/{chatId}/mensajes/{messageId}',
}, async (event) => {
  const { chatId, messageId } = event.params;
  const message = event.data.data();
  const senderUid = clean(message.senderUid, 180);
  const chatSnap = await db.collection('chats').doc(chatId).get();
  if (!chatSnap.exists) return;

  const chat = chatSnap.data();
  const recipients = await recipientUidsForChat(chat, senderUid);
  const senderLabel = clean(message.senderName || message.senderRole || 'ClasesDe10', 120);
  const body = clean(message.body, 180);

  await Promise.all(recipients.map((uid) => writeNotificationOnce(
    uid,
    `Nuevo mensaje de ${senderLabel}`,
    body,
    {
      type: 'chat_message',
      chatId,
      messageId,
      assignmentId: chat.assignmentId || chat.asignacion_id || '',
      url: '/pages/login.html',
    },
    `chat_message_${chatId}_${messageId}_${uid}`,
    { role: '', fromRole: message.senderRole || 'chat' },
  )));
});

exports.notifyOnDocumentCreated = onDocumentCreated({
  region: REGION,
  document: 'documentos/{documentId}',
}, async (event) => {
  const documentId = event.params.documentId;
  const data = event.data.data();
  const ownerUid = clean(data.ownerUid || data.userUid || data.usuario_id, 180);
  await notifyAdmins('Documento pendiente de revision', `${data.nombre || data.tipo || 'Documento'} necesita revision.`, {
    type: 'document_review_pending',
    documentId,
    ownerUid,
    url: '/pages/login.html',
  });
});

exports.notifyOnIncidentCreated = onDocumentCreated({
  region: REGION,
  document: 'incidencias/{incidentId}',
}, async (event) => {
  const incidentId = event.params.incidentId;
  const data = event.data.data();
  await notifyAdmins('Nueva incidencia', clean(data.titulo || data.descripcion || 'Incidencia pendiente de revision.', 240), {
    type: 'class_incident',
    incidentId,
    classId: data.classId || data.clase_id || '',
    url: '/pages/login.html',
  });
});

exports.notifyOnTeacherProfileUpdated = onDocumentUpdated({
  region: REGION,
  document: 'profesores/{teacherId}',
}, async (event) => {
  const teacherId = event.params.teacherId;
  const before = event.data.before.data();
  const after = event.data.after.data();
  const fields = [
    'nombre',
    'email',
    'telefono',
    'materias',
    'niveles_educativos',
    'modalidad',
    'zona',
    'availabilitySlots',
    'estado_verificacion',
    'verificationStatus',
    'profileCompletion',
  ];
  if (!changedAny(before, after, fields)) return;
  await notifyAdmins('Perfil de profesor actualizado', `${after.nombre || after.email || teacherId} modifico datos relevantes de su perfil.`, {
    type: normalizeStatus(after) === 'pendiente' ? 'verification_pending' : 'profile_updated',
    teacherId,
    url: '/pages/login.html',
  });
});

exports.notifyOnFamilyProfileUpdated = onDocumentUpdated({
  region: REGION,
  document: 'familias/{familyId}',
}, async (event) => {
  const familyId = event.params.familyId;
  const before = event.data.before.data();
  const after = event.data.after.data();
  const fields = ['nombre', 'email', 'telefono', 'direccion', 'zona', 'preferencias', 'profileCompletion'];
  if (!changedAny(before, after, fields)) return;
  await notifyAdmins('Perfil de familia actualizado', `${after.nombre || after.email || familyId} modifico datos relevantes de su perfil.`, {
    type: 'profile_updated',
    familyId,
    url: '/pages/login.html',
  });
});

async function findPaymentRefByStripeObject(object = {}) {
  const metadataPaymentId = clean(object.metadata?.paymentId || object.metadata?.pagoId);
  if (metadataPaymentId) return db.collection('pagos').doc(metadataPaymentId);

  const checkoutSessionId = clean(object.object === 'checkout.session' ? object.id : object.checkout_session);
  const paymentIntentId = clean(
    object.payment_intent
    || (object.object === 'payment_intent' ? object.id : '')
    || object.paymentIntentId,
  );

  if (checkoutSessionId) {
    const snap = await db.collection('pagos').where('checkoutSessionId', '==', checkoutSessionId).limit(1).get();
    if (!snap.empty) return snap.docs[0].ref;
  }
  if (paymentIntentId) {
    const snap = await db.collection('pagos').where('paymentIntentId', '==', paymentIntentId).limit(1).get();
    if (!snap.empty) return snap.docs[0].ref;
  }

  const fallbackId = paymentIntentId || checkoutSessionId || clean(object.id);
  return fallbackId ? db.collection('pagos').doc(`stripe_${fallbackId}`) : null;
}

function stripePaymentUpdate(event) {
  const object = event.data.object || {};
  const paymentIntentId = clean(
    object.payment_intent
    || (object.object === 'payment_intent' ? object.id : '')
    || object.paymentIntentId,
  );
  const checkoutSessionId = clean(object.object === 'checkout.session' ? object.id : object.checkout_session);
  const providerStatus = clean(object.payment_status || object.status || event.type, 80);
  const status = normalizePaymentStatus(providerStatus);
  const verified = ['validado', 'pagado'].includes(status)
    || event.type === 'checkout.session.completed'
    || event.type === 'checkout.session.async_payment_succeeded'
    || event.type === 'payment_intent.succeeded';

  return {
    gateway: 'stripe',
    provider: 'stripe',
    providerPaymentId: paymentIntentId || checkoutSessionId || clean(object.id),
    paymentIntentId,
    checkoutSessionId,
    providerPaymentStatus: providerStatus,
    gatewayStatus: providerStatus,
    estado: verified ? 'validado' : status,
    status: verified ? 'validado' : status,
    verified,
    verificationSource: 'stripe',
    gatewayEventId: event.id,
    gatewayEventType: event.type,
    gatewayVerifiedAt: verified ? now() : null,
    fecha_validacion: verified ? new Date().toISOString() : null,
    validatedAt: verified ? new Date().toISOString() : null,
    updatedAt: now(),
    updated_at: new Date().toISOString(),
  };
}

async function reconcilePaymentRef(paymentRef) {
  const snap = await paymentRef.get();
  if (!snap.exists) return { applied: false, reason: 'payment_not_found' };
  const payment = { id: snap.id, ...snap.data() };
  if (payment.reconciliationStatus === 'applied') return { applied: false, reason: 'already_applied' };
  if (!['validado', 'pagado'].includes(normalizePaymentStatus(payment.estado || payment.status))) return { applied: false, reason: 'not_verified' };

  const classIds = Array.isArray(payment.classIds) ? payment.classIds.map(String).filter(Boolean) : [];
  if (!classIds.length) {
    await paymentRef.update({
      reconciliationStatus: 'needs_review',
      reconciliationReason: 'missing_class_ids',
      updatedAt: now(),
    });
    return { applied: false, reason: 'missing_class_ids' };
  }

  const batch = db.batch();
  classIds.forEach((classId) => batch.set(
    db.collection('clases').doc(classId),
    buildClassPaymentPatch(payment),
    { merge: true },
  ));
  batch.set(paymentRef, {
    reconciliationStatus: 'applied',
    reconciliationReason: 'stripe_verified_explicit_class_ids',
    reconciliationConfidence: 1,
    reconciledAt: now(),
    updatedAt: now(),
  }, { merge: true });
  await batch.commit();
  return { applied: true, classIds };
}

function calculateTeacherPrice(data) {
  let base = 15;
  const education = lower([data.titulacion, data.nivel_estudios, data.universidad, data.bio].join(' '));
  if (education.includes('doctor') || education.includes('master') || education.includes('máster')) base += 8;
  else if (education.includes('grado') || education.includes('licenci') || education.includes('ingenier') || education.includes('universidad')) base += 5;
  else if (education.includes('fp') || education.includes('modulo') || education.includes('módulo')) base += 2;

  const experienceText = lower([data.experiencia, data.anios, data.bio].join(' '));
  const years = Number(experienceText.match(/\d+/)?.[0] || 0);
  if (years >= 5) base += 6;
  else if (years >= 3) base += 4;
  else if (years >= 1) base += 2;

  const subjects = lower([data.materias, data.materia].flat().join(' '));
  if (/(matematic|mates|fisica|física|quimica|química)/.test(subjects)) base += 3;
  return Math.round(base * 2) / 2;
}

function teacherDiagnostic(data, price) {
  const subjects = asArray(data.materias || data.materia).join(', ') || 'Sin materias';
  const levels = asArray(data.niveles_educativos || data.niveles || data.nivel).join(', ') || 'Sin niveles';
  const zone = clean(data.zona || data.ciudad || data.metadata?.zona) || 'Sin zona';
  const modality = clean(data.modalidad || data.metadata?.modalidad) || 'Sin modalidad';
  const warnings = [];
  if (!subjects || subjects === 'Sin materias') warnings.push('Faltan materias.');
  if (!levels || levels === 'Sin niveles') warnings.push('Faltan niveles.');
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
    createdAt: now(),
    updatedAt: now(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function countActiveAssignmentsByTeacher() {
  const snap = await db.collection('asignaciones').where('active', '==', true).get();
  const counts = new Map();
  snap.docs.forEach((doc) => {
    const data = doc.data();
    const teacherUid = data.teacherUid || data.profesor_id;
    if (teacherUid) counts.set(teacherUid, (counts.get(teacherUid) || 0) + 1);
  });
  return counts;
}

async function loadTeachers() {
  const [teachersSnap, usersSnap, assignmentCounts] = await Promise.all([
    db.collection('profesores').get(),
    db.collection('users').get(),
    countActiveAssignmentsByTeacher(),
  ]);
  const users = new Map(usersSnap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }]));

  return teachersSnap.docs
    .map((doc) => {
      const data = doc.data();
      const userUid = data.userUid || data.usuario_id || doc.id;
      const user = users.get(userUid) || {};
      const status = normalizeStatus(data);
      return {
        id: doc.id,
        teacherUid: doc.id,
        userUid,
        nombre: getUserName(user) || getUserName(data) || doc.id,
        email: user.email || data.email || '',
        status,
        active: data.active !== false && data.activo !== false,
        materias: asArray(data.materias || data.subjects || data.materia),
        niveles: asArray(data.niveles_educativos || data.levels || data.niveles || data.nivel),
        modalidad: clean(data.modalidad || data.tipo_clase || data.formato),
        zona: clean(data.zona || data.ciudad || data.barrio),
        bio: clean(data.bio || data.experiencia, 1000),
        maxStudents: Number(data.maxStudents || data.max_alumnos || 5),
        activeAssignments: assignmentCounts.get(doc.id) || assignmentCounts.get(userUid) || 0,
        raw: data,
      };
    })
    .filter((teacher) => teacher.active && ['verificado', 'activo', 'pendiente_revision', 'pendiente', ''].includes(teacher.status));
}

function getRequestProfile(request) {
  const metadata = request.metadata || {};
  const student = request.studentSnapshot || {};
  return {
    subject: clean(request.materia || request.subject || metadata.materia || metadata.materias),
    level: clean(request.nivel || request.nivel_educativo || request.curso || student.nivel || metadata.nivel),
    modality: clean(request.modalidad || metadata.modalidad),
    zone: clean(request.zona || metadata.zona),
    schedule: clean(request.preferencia_horario || request.disponibilidad || metadata.disponibilidad),
    studentName: clean(student.nombre || request.alumno_nombre || metadata.alumno),
  };
}

function scoreTeacher(profile, teacher) {
  let score = 0;
  const reasons = [];
  const risks = [];
  const subjectTokens = tokenize(profile.subject);
  const teacherSubjectText = lower(teacher.materias.join(' '));
  const subjectMatches = subjectTokens.filter((token) => teacherSubjectText.includes(token));
  if (subjectTokens.length && subjectMatches.length) {
    score += Math.min(45, 25 + subjectMatches.length * 10);
    reasons.push(`Cubre la materia (${profile.subject}).`);
  } else if (subjectTokens.length) {
    risks.push(`No hay coincidencia clara de materia (${profile.subject}).`);
    score -= 20;
  } else {
    score += 10;
    risks.push('La solicitud no indica materia clara.');
  }

  const level = lower(profile.level);
  const levels = lower(teacher.niveles.join(' '));
  if (level && (levels.includes(level) || levels.includes('todos') || levels.includes('eso') && level.includes('eso'))) {
    score += 25;
    reasons.push(`Nivel compatible (${profile.level}).`);
  } else if (level) {
    risks.push(`Nivel no confirmado (${profile.level}).`);
  }

  const modality = lower(profile.modality);
  const teacherModality = lower(teacher.modalidad);
  if (!modality || !teacherModality || teacherModality.includes('ambas') || modality.includes('ambas') || teacherModality.includes(modality)) {
    score += 10;
    if (profile.modality) reasons.push(`Modalidad compatible (${profile.modality}).`);
  } else {
    risks.push(`Modalidad pendiente de validar (${profile.modality} vs ${teacher.modalidad}).`);
  }

  const zone = lower(profile.zone);
  const teacherZone = lower(teacher.zona);
  if (zone && teacherZone && (teacherZone.includes(zone) || zone.includes(teacherZone) || teacherModality.includes('online'))) {
    score += 10;
    reasons.push(`Zona/modalidad compatible (${profile.zone}).`);
  } else if (zone) {
    risks.push(`Zona no confirmada (${profile.zone}).`);
  }

  const remaining = Math.max(0, teacher.maxStudents - teacher.activeAssignments);
  if (remaining > 0) {
    score += Math.min(10, remaining * 2);
    reasons.push(`${remaining} plaza(s) estimadas disponibles.`);
  } else {
    score -= 30;
    risks.push('Carga actual completa.');
  }

  if (teacher.status === 'verificado' || teacher.status === 'activo') score += 8;
  else risks.push('Profesor pendiente de revision/verificacion.');

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
    risks,
  };
}

async function callGeminiIfConfigured(profile, candidates) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !candidates.length) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  const teacherBlock = candidates.slice(0, 8).map((candidate, index) => (
    `P${index + 1}: id="${candidate.teacherUid}" nombre="${candidate.nombre}" scoreBase=${candidate.score} materias="${candidate.materias.join(', ')}" niveles="${candidate.niveles.join(', ')}" modalidad="${candidate.modalidad}" zona="${candidate.zona}" riesgos="${candidate.risks.join('; ')}"`
  )).join('\n');

  const prompt = `Eres el motor de matching de ClasesDe10. Ordena los mejores profesores para esta solicitud. Responde solo JSON valido.\nSOLICITUD: materia="${profile.subject}" nivel="${profile.level}" modalidad="${profile.modality}" zona="${profile.zone}" horario="${profile.schedule}"\nCANDIDATOS:\n${teacherBlock}\nJSON requerido: {"matches":[{"teacherUid":"...","score":90,"reason":"frase breve","risks":["..."]}]}`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.15, maxOutputTokens: 700 },
    }),
  });
  const raw = await response.json();
  if (!response.ok || raw.error) throw new Error(raw.error?.message || `Gemini ${response.status}`);
  const text = raw.candidates?.[0]?.content?.parts?.[0]?.text
    ?.replace(/^```json\s*/i, '')
    ?.replace(/^```\s*/i, '')
    ?.replace(/```\s*$/i, '')
    ?.trim();
  return text ? JSON.parse(text) : null;
}

async function generateMatchesForRequest(requestId, request, reason = 'trigger') {
  const profile = getRequestProfile(request);
  const teachers = await loadTeachers();
  const baseCandidates = teachers
    .map((teacher) => {
      const scored = scoreTeacher(profile, teacher);
      return { ...teacher, ...scored };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  let aiResult = null;
  let aiError = null;
  try {
    aiResult = await callGeminiIfConfigured(profile, baseCandidates);
  } catch (error) {
    aiError = error.message;
    logger.warn('Gemini matching failed, using deterministic ranking', { requestId, error: error.message });
  }

  const aiByTeacher = new Map((aiResult?.matches || []).map((match) => [match.teacherUid, match]));
  const candidates = baseCandidates
    .map((candidate) => {
      const ai = aiByTeacher.get(candidate.teacherUid);
      return {
        ...candidate,
        score: Math.max(candidate.score, Number(ai?.score || 0)),
        aiReason: clean(ai?.reason, 500),
        aiRisks: Array.isArray(ai?.risks) ? ai.risks.map((item) => clean(item, 180)).filter(Boolean) : [],
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const runRef = await db.collection('matchingRuns').add({
    requestId,
    reason,
    status: candidates.length ? 'completed' : 'no_match',
    profile,
    candidatesCount: candidates.length,
    aiUsed: Boolean(aiResult),
    aiError,
    createdAt: now(),
  });

  const batch = db.batch();
  candidates.forEach((candidate, index) => {
    const ref = db.collection('solicitudMatches').doc(`${requestId}_${candidate.teacherUid}`);
    batch.set(ref, {
      requestId,
      solicitud_id: requestId,
      runId: runRef.id,
      teacherUid: candidate.teacherUid,
      profesor_id: candidate.teacherUid,
      teacherUserUid: candidate.userUid,
      teacherName: candidate.nombre,
      nombreProfesor: candidate.nombre,
      teacherEmail: candidate.email,
      score: candidate.score,
      rank: index + 1,
      reasons: candidate.aiReason ? [candidate.aiReason, ...candidate.reasons] : candidate.reasons,
      risks: uniq([...(candidate.aiRisks || []), ...candidate.risks]),
      subjectMatch: profile.subject,
      levelMatch: profile.level,
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
    updatedAt: now(),
    updated_at: new Date().toISOString(),
  });
  await batch.commit();

  await db.collection('automationEvents').add({
    type: 'matching_generated',
    requestId,
    runId: runRef.id,
    candidatesCount: candidates.length,
    bestTeacherUid: candidates[0]?.teacherUid || null,
    bestScore: candidates[0]?.score || 0,
    aiUsed: Boolean(aiResult),
    aiError,
    createdAt: now(),
  });

  if (!candidates.length) {
    await notifyAdmins('Solicitud sin match automatico', `No hay candidatos claros para ${profile.subject || 'la solicitud'} (${profile.level || 'nivel sin indicar'}).`, {
      type: 'matching_no_match',
      requestId,
    });
  }

  return { runId: runRef.id, candidates };
}

exports.processPublicLead = onDocumentCreated({
  region: REGION,
  document: 'leadsPublicos/{leadId}',
}, async (event) => {
  const leadId = event.params.leadId;
  const lead = event.data.data();
  const type = clean(lead.tipo, 30);

  await db.collection('automationEvents').add({
    type: 'lead_received',
    leadId,
    leadType: type,
    createdAt: now(),
  });

  if (type === 'profesor') {
    const price = calculateTeacherPrice({ ...lead, ...(lead.metadata || {}) });
    const diagnostic = teacherDiagnostic({ ...lead, ...(lead.metadata || {}) }, price);
    await event.data.ref.update({
      suggestedHourlyRate: price,
      diagnostico: diagnostic,
      automationStatus: 'review_teacher_lead',
      updatedAt: now(),
    });
    await notifyAdmins('Nuevo profesor interesado', `${lead.nombre || lead.email || 'Profesor'} envio una solicitud publica. Precio sugerido: ${price} EUR/h.`, {
      type: 'teacher_lead',
      leadId,
    });
    return;
  }

  if (type === 'familia') {
    const requestRef = db.collection('solicitudes').doc(`lead_${leadId}`);
    const requestPayload = leadToPublicRequest(leadId, lead);
    await requestRef.set(requestPayload, { merge: true });
    await event.data.ref.update({
      automationStatus: 'request_created',
      solicitudId: requestRef.id,
      diagnostico: studentDiagnostic({ ...lead, ...(lead.metadata || {}) }),
      updatedAt: now(),
    });
    await notifyAdmins('Nueva familia solicita profesor', `${lead.nombre || lead.email || 'Familia'} solicito ${requestPayload.materia || 'materia sin indicar'}.`, {
      type: 'family_lead_request',
      leadId,
      requestId: requestRef.id,
    });
    return;
  }

  await notifyAdmins('Nuevo contacto publico', `${lead.nombre || lead.email || 'Contacto'} envio un mensaje.`, {
    type: 'contact_lead',
    leadId,
  });
});

exports.stripeWebhook = onRequest({
  region: REGION,
  secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET],
}, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const signature = req.headers['stripe-signature'];
  if (!signature) {
    res.status(400).send('Missing Stripe signature');
    return;
  }

  let event;
  try {
    const stripe = Stripe(STRIPE_SECRET_KEY.value());
    event = stripe.webhooks.constructEvent(req.rawBody, signature, STRIPE_WEBHOOK_SECRET.value());
  } catch (error) {
    logger.warn('Stripe webhook signature failed', { message: error.message });
    res.status(400).send(`Webhook Error: ${error.message}`);
    return;
  }

  const relevant = [
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'charge.dispute.created',
  ];
  if (!relevant.includes(event.type)) {
    res.json({ received: true, ignored: true });
    return;
  }

  const paymentRef = await findPaymentRefByStripeObject(event.data.object);
  if (!paymentRef) {
    await db.collection('automationEvents').add({
      type: 'stripe_webhook_unmatched',
      gatewayEventId: event.id,
      gatewayEventType: event.type,
      createdAt: now(),
    });
    res.json({ received: true, matched: false });
    return;
  }

  const update = stripePaymentUpdate(event);
  await paymentRef.set(update, { merge: true });
  const reconciliation = await reconcilePaymentRef(paymentRef);
  await db.collection('automationEvents').doc(`stripe_${event.id}`).set({
    type: 'stripe_webhook_processed',
    paymentId: paymentRef.id,
    gatewayEventId: event.id,
    gatewayEventType: event.type,
    reconciliation,
    createdAt: now(),
  }, { merge: true });

  res.json({ received: true, paymentId: paymentRef.id, reconciliation });
});

exports.generateRequestMatching = onDocumentCreated({
  region: REGION,
  document: 'solicitudes/{requestId}',
}, async (event) => {
  const requestId = event.params.requestId;
  const request = event.data.data();
  if ((request.matchStatus || '') === 'ready') return;
  if (!request.leadId && !request.lead_id && request.source !== 'public_lead') {
    await notifyAdmins('Nueva solicitud recibida', `${request.nombre || request.email || 'Familia'} solicita ${request.materia || request.subject || 'profesor'}.`, {
      type: 'request_created',
      requestId,
      url: '/pages/login.html',
    });
  }
  const result = await generateMatchesForRequest(requestId, request, 'request_created');
  if (result?.candidates?.length) {
    await notifyAdmins('Matching listo', `${result.candidates.length} candidato(s) para ${request.materia || request.subject || 'la solicitud'}.`, {
      type: 'matching_ready',
      requestId,
      url: '/pages/login.html',
    });
  }
});

exports.createAssignmentOnRequestAssigned = onDocumentUpdated({
  region: REGION,
  document: 'solicitudes/{requestId}',
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const requestId = event.params.requestId;
  const beforeTeacher = before.assignedTeacherUid || before.profesor_asignado_id;
  const teacherUid = after.assignedTeacherUid || after.profesor_asignado_id;
  const status = after.status || after.estado;

  if (!teacherUid || beforeTeacher === teacherUid || !['asignada', 'asignado'].includes(status)) return;

  const studentId = after.studentId || after.alumno_id;
  const familyUid = after.familyUid || after.familia_id || null;
  const assignmentId = `${requestId}_${teacherUid}`;
  await db.collection('asignaciones').doc(assignmentId).set({
    requestId,
    solicitud_id: requestId,
    teacherUid,
    profesor_id: teacherUid,
    studentId: studentId || null,
    alumno_id: studentId || null,
    familyUid,
    familia_id: familyUid,
    materia: after.materia || after.subject || '',
    active: true,
    activa: true,
    source: 'request_assignment',
    createdAt: now(),
    updatedAt: now(),
  }, { merge: true });

  await db.collection('solicitudMatches').doc(`${requestId}_${teacherUid}`).set({
    status: 'asignado',
    estado: 'asignado',
    selectedAt: now(),
    updatedAt: now(),
  }, { merge: true });

  await db.collection('automationEvents').add({
    type: 'assignment_created',
    requestId,
    assignmentId,
    teacherUid,
    studentId: studentId || null,
    createdAt: now(),
  });

  const [teacherUserUid, familyUserUid] = await Promise.all([
    resolveUserUidFromProfile('profesores', teacherUid, after.teacherUserUid),
    resolveUserUidFromProfile('familias', familyUid, after.familyUserUid),
  ]);
  await Promise.all([
    writeNotificationOnce(
      teacherUserUid,
      'Nueva asignacion',
      `Se te ha asignado una nueva solicitud de ${after.materia || after.subject || 'clase'}.`,
      { type: 'assignment_created', requestId, assignmentId, url: '/pages/login.html' },
      `assignment_created_${assignmentId}_teacher`,
      { role: 'profesor' },
    ),
    writeNotificationOnce(
      familyUserUid,
      'Profesor asignado',
      `Ya hay profesor asignado para ${after.materia || after.subject || 'tu solicitud'}.`,
      { type: 'assignment_created', requestId, assignmentId, url: '/pages/login.html' },
      `assignment_created_${assignmentId}_family`,
      { role: 'familia' },
    ),
  ]);
});

exports.scanPendingMatching = onSchedule({
  region: REGION,
  schedule: 'every 60 minutes',
  timeZone: 'Europe/Madrid',
}, async () => {
  const snap = await db.collection('solicitudes')
    .where('status', '==', 'nueva')
    .limit(25)
    .get();

  let processed = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.matchStatus === 'ready') continue;
    await generateMatchesForRequest(doc.id, data, 'scheduled_scan');
    processed += 1;
  }
  logger.info('scanPendingMatching completed', { processed });
});

exports.generateMonthlySummary = onSchedule({
  region: REGION,
  schedule: '0 8 1 * *',
  timeZone: 'Europe/Madrid',
}, async () => {
  const nowDate = new Date();
  const previousMonthDate = new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 1);
  const month = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const classesSnap = await db.collection('clases').get();
  const summary = {
    month,
    classes: 0,
    teacherTotals: {},
    familyTotals: {},
    createdAt: now(),
  };

  classesSnap.docs.forEach((doc) => {
    const data = doc.data();
    const date = clean(data.fecha || data.date);
    if (!date.startsWith(month)) return;
    if (!['realizada', 'completada'].includes(data.estado || data.status)) return;
    summary.classes += 1;
    const teacherUid = data.teacherUid || data.profesor_id || 'sin_profesor';
    const familyUid = data.familyUid || data.familia_id || 'sin_familia';
    summary.teacherTotals[teacherUid] = (summary.teacherTotals[teacherUid] || 0) + Number(data.importe_profesor || data.teacherAmount || 0);
    summary.familyTotals[familyUid] = (summary.familyTotals[familyUid] || 0) + Number(data.precio_total || data.amount || 0);
  });

  await db.collection('resumenMensual').doc(month).set(summary, { merge: true });
  await notifyAdmins('Resumen mensual generado', `Resumen ${month}: ${summary.classes} clase(s) procesadas.`, {
    type: 'monthly_summary',
    month,
  });
});
