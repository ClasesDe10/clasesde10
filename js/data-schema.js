/**
 * ClasesDe10 canonical data model.
 *
 * The app still accepts legacy Supabase-era field names while dashboards are
 * migrated module by module. This file defines which fields are canonical,
 * which ones are compatibility aliases, and which values are derived.
 */

export const DATA_SCHEMA_VERSION = 'data-schema-2026-06-29';

export const DATA_COLLECTIONS = Object.freeze({
  users: 'users',
  profesores: 'profesores',
  familias: 'familias',
  alumnos: 'alumnos',
  solicitudes: 'solicitudes',
  asignaciones: 'asignaciones',
  clases: 'clases',
  pagos: 'pagos',
  documentos: 'documentos',
  notificaciones: 'notificaciones',
  chats: 'chats',
  incidencias: 'incidencias',
  disponibilidad: 'disponibilidad',
  leadsPublicos: 'leadsPublicos',
  auditLogs: 'auditLogs',
  analyticsEvents: 'analyticsEvents',
  automationEvents: 'automationEvents',
  systemJobs: 'systemJobs',
});

export const COLLECTION_ALIASES = Object.freeze({
  usuarios: DATA_COLLECTIONS.users,
  v_clases_completas: DATA_COLLECTIONS.clases,
  v_dashboard_admin: 'dashboardStats',
  v_resumen_profesor_mes: 'resumenProfesorMes',
});

export const FIELD_ALIAS_GROUPS = Object.freeze({
  userUid: ['userUid', 'usuario_id', 'uid', 'firebase_uid'],
  familyUid: ['familyUid', 'familia_id', 'familyId'],
  teacherUid: ['teacherUid', 'profesor_id', 'teacherId'],
  studentId: ['studentId', 'alumno_id', 'studentUid', 'alumnoId'],
  assignedTeacherUid: ['assignedTeacherUid', 'profesor_asignado_id'],
  status: ['status', 'estado'],
  active: ['active', 'activo', 'activa'],
  verificationStatus: ['verificationStatus', 'estado_verificacion'],
  createdAt: ['createdAt', 'created_at'],
  updatedAt: ['updatedAt', 'updated_at'],
  date: ['date', 'fecha'],
  startTime: ['startTime', 'hora_inicio'],
  endTime: ['endTime', 'hora_fin'],
  durationMinutes: ['durationMinutes', 'duracion_minutos'],
  subject: ['subject', 'materia'],
  level: ['level', 'nivel'],
  familyAmount: ['familyAmount', 'precio_total', 'amount', 'monto'],
  teacherAmount: ['teacherAmount', 'importe_profesor'],
  platformFee: ['platformFee', 'comision_clasesde10'],
  paymentStatus: ['paymentStatus', 'estado_pago'],
  familyPaymentStatus: ['familyPaymentStatus', 'estado_pago_familia'],
  teacherPaymentStatus: ['teacherPaymentStatus', 'estado_pago_profesor'],
  ownerUid: ['ownerUid', 'owner_uid', 'usuario_id', 'userUid'],
});

export const CANONICAL_FIELDS = Object.freeze({
  users: ['email', 'nombre', 'apellidos', 'displayName', 'telefono', 'role', 'active', 'createdAt', 'updatedAt'],
  profesores: [
    'userUid', 'email', 'nombre', 'apellidos', 'displayName', 'telefono', 'photoUrl',
    'address', 'city', 'postalCode', 'zone', 'subjects', 'levels', 'specialties',
    'languages', 'certifications', 'experienceYears', 'studyLevel', 'exactStudy',
    'studyCenter', 'bachilleratoGrade', 'universityAverageGrade', 'availabilitySummary',
    'hasBizum', 'profileComplete', 'profileCompletionPercent', 'verificationStatus',
    'status', 'active', 'createdAt', 'updatedAt',
  ],
  familias: ['userUid', 'email', 'nombre', 'apellidos', 'displayName', 'telefono', 'address', 'city', 'postalCode', 'zone', 'status', 'active', 'createdAt', 'updatedAt'],
  alumnos: ['familyUid', 'studentUid', 'nombre', 'apellidos', 'displayName', 'level', 'course', 'school', 'birthDate', 'active', 'createdAt', 'updatedAt'],
  solicitudes: ['familyUid', 'studentId', 'subject', 'level', 'modality', 'zone', 'schedulePreference', 'notes', 'status', 'matchStatus', 'assignedTeacherUid', 'createdAt', 'updatedAt'],
  asignaciones: ['requestId', 'familyUid', 'teacherUid', 'studentId', 'subject', 'status', 'active', 'chatId', 'schedulingStatus', 'relationshipStage', 'createdAt', 'updatedAt'],
  clases: ['assignmentId', 'scheduleProposalId', 'familyUid', 'teacherUid', 'studentId', 'subject', 'date', 'startTime', 'endTime', 'startAtIso', 'endAtIso', 'durationMinutes', 'status', 'lifecycleStatus', 'attendanceStatus', 'familyAmount', 'teacherAmount', 'platformFee', 'familyPaymentStatus', 'teacherPaymentStatus', 'createdAt', 'updatedAt'],
  pagos: ['paymentType', 'familyUid', 'teacherUid', 'studentId', 'classIds', 'amount', 'method', 'gateway', 'status', 'dueAt', 'reconciliationStatus', 'idempotencyKey', 'createdAt', 'updatedAt'],
  documentos: ['ownerUid', 'ownerRole', 'type', 'name', 'storagePath', 'downloadUrl', 'status', 'verificationStatus', 'expiresAt', 'createdAt', 'updatedAt'],
  notificaciones: ['userUid', 'role', 'type', 'title', 'body', 'payload', 'readAt', 'leida', 'createdAt', 'updatedAt'],
  chats: ['assignmentId', 'familyUid', 'teacherUid', 'studentId', 'participantUids', 'relationshipStatus', 'relationshipStage', 'schedulingStatus', 'active', 'createdAt', 'updatedAt'],
  incidencias: ['ticketId', 'category', 'priority', 'status', 'familyUid', 'teacherUid', 'studentId', 'classId', 'paymentId', 'assignedAdminUid', 'resolution', 'createdAt', 'updatedAt'],
});

const LEGACY_WRITE_ALIASES = Object.freeze({
  userUid: ['usuario_id', 'firebase_uid'],
  familyUid: ['familia_id'],
  teacherUid: ['profesor_id'],
  studentId: ['alumno_id'],
  assignedTeacherUid: ['profesor_asignado_id'],
  status: ['estado'],
  active: ['activo'],
  verificationStatus: ['estado_verificacion'],
  date: ['fecha'],
  startTime: ['hora_inicio'],
  endTime: ['hora_fin'],
  durationMinutes: ['duracion_minutos'],
  subject: ['materia'],
  level: ['nivel'],
  familyAmount: ['precio_total'],
  teacherAmount: ['importe_profesor'],
  platformFee: ['comision_clasesde10'],
  paymentStatus: ['estado_pago'],
  familyPaymentStatus: ['estado_pago_familia'],
  teacherPaymentStatus: ['estado_pago_profesor'],
});

const COLLECTION_FIELD_ALIASES = Object.freeze({
  users: {
    role: ['rol'],
  },
  profesores: {
    photoUrl: ['foto_url'],
    address: ['direccion'],
    city: ['ciudad'],
    postalCode: ['codigo_postal'],
    zone: ['zona'],
    studyLevel: ['nivel_estudios'],
    exactStudy: ['estudio_exacto'],
    studyCenter: ['centro_estudios', 'colegio_estudios', 'universidad'],
    bachilleratoGrade: ['nota_bachillerato'],
    universityAverageGrade: ['nota_media_universidad'],
    experienceYears: ['experiencia_anios'],
    availabilitySummary: ['disponibilidad_resumen'],
    subjects: ['materias'],
    levels: ['niveles_educativos', 'niveles'],
    specialties: ['especialidades'],
    languages: ['idiomas'],
    certifications: ['certificaciones'],
    hasBizum: ['acepta_bizum'],
    profileComplete: ['perfil_completo'],
  },
  familias: {
    address: ['direccion'],
    city: ['ciudad'],
    postalCode: ['codigo_postal'],
    zone: ['zona'],
  },
  alumnos: {
    level: ['nivel_educativo', 'nivel'],
    course: ['curso'],
    school: ['colegio'],
    birthDate: ['fecha_nacimiento'],
  },
  solicitudes: {
    schedulePreference: ['preferencia_horario'],
    notes: ['observaciones'],
    modality: ['modalidad'],
    zone: ['zona'],
  },
  documentos: {
    name: ['nombre'],
    storagePath: ['storage_path'],
    downloadUrl: ['download_url', 'url'],
    type: ['tipo'],
    expiresAt: ['expires_at', 'fecha_caducidad'],
  },
  incidencias: {
    category: ['categoria'],
    priority: ['prioridad'],
    resolution: ['resolucion'],
    assignedAdminUid: ['admin_responsable_uid'],
  },
  pagos: {
    amount: ['monto'],
    method: ['metodo'],
    provider: ['gateway'],
    dueAt: ['due_at', 'fecha_vencimiento'],
  },
});

const DEFAULT_STATUS_BY_COLLECTION = Object.freeze({
  profesores: 'pendiente_perfil',
  familias: 'activo',
  alumnos: 'activo',
  solicitudes: 'nueva',
  asignaciones: 'activa',
  clases: 'programada',
  pagos: 'pendiente',
  documentos: 'pendiente',
  notificaciones: 'nueva',
  chats: 'active',
  incidencias: 'abierta',
});

const STATUS_TO_LIFECYCLE = Object.freeze({
  propuesta: 'clase_programada',
  programada: 'clase_programada',
  confirmada: 'clase_programada',
  realizada: 'pendiente_confirmacion',
  completada: 'pendiente_pago',
  cancelada: 'clase_cancelada',
  reprogramada: 'clase_programada',
});

const COMMON_ALIAS_KEYS = Object.freeze([
  'userUid',
  'familyUid',
  'teacherUid',
  'studentId',
  'assignedTeacherUid',
  'status',
  'active',
  'verificationStatus',
  'createdAt',
  'updatedAt',
]);

const COLLECTION_ALIAS_KEYS = Object.freeze({
  profesores: ['userUid', 'status', 'active', 'verificationStatus', 'createdAt', 'updatedAt'],
  familias: ['userUid', 'status', 'active', 'createdAt', 'updatedAt'],
  alumnos: ['userUid', 'familyUid', 'studentId', 'status', 'active', 'createdAt', 'updatedAt'],
  solicitudes: ['familyUid', 'teacherUid', 'studentId', 'assignedTeacherUid', 'status', 'subject', 'level', 'createdAt', 'updatedAt'],
  asignaciones: ['familyUid', 'teacherUid', 'studentId', 'status', 'active', 'subject', 'createdAt', 'updatedAt'],
  clases: ['familyUid', 'teacherUid', 'studentId', 'status', 'date', 'startTime', 'endTime', 'durationMinutes', 'subject', 'level', 'familyAmount', 'teacherAmount', 'platformFee', 'paymentStatus', 'familyPaymentStatus', 'teacherPaymentStatus', 'createdAt', 'updatedAt'],
  pagos: ['familyUid', 'teacherUid', 'studentId', 'status', 'createdAt', 'updatedAt'],
  documentos: ['userUid', 'ownerUid', 'status', 'verificationStatus', 'createdAt', 'updatedAt'],
  notificaciones: ['userUid', 'status', 'createdAt', 'updatedAt'],
  chats: ['familyUid', 'teacherUid', 'studentId', 'status', 'active', 'createdAt', 'updatedAt'],
  incidencias: ['familyUid', 'teacherUid', 'studentId', 'status', 'createdAt', 'updatedAt'],
});

function cleanText(value, max = 500) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function lower(value) {
  return cleanText(value).toLowerCase();
}

function firstDefined(source, fields = []) {
  for (const field of fields) {
    if (source[field] !== undefined && source[field] !== null && source[field] !== '') return source[field];
  }
  return undefined;
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function amount(value) {
  const number = numberOrNull(value);
  return number === null ? undefined : Math.round(number * 100) / 100;
}

function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => cleanText(item, 180)).filter(Boolean);
  const text = cleanText(value, 1000);
  if (!text) return [];
  return text.split(/[,;/+|]|\sy\s/i).map((item) => cleanText(item, 180)).filter(Boolean);
}

function normalizeCollection(collectionName) {
  return COLLECTION_ALIASES[collectionName] || collectionName;
}

function readField(source, canonical, collectionName) {
  const collectionAliases = COLLECTION_FIELD_ALIASES[collectionName]?.[canonical] || [];
  return firstDefined(source, [canonical, ...(FIELD_ALIAS_GROUPS[canonical] || []), ...collectionAliases]);
}

function setIfMissing(target, field, value) {
  if (value === undefined || value === null || value === '') return;
  if (target[field] === undefined || target[field] === null || target[field] === '') target[field] = value;
}

function mirrorAliases(target, canonicalField, aliases = []) {
  if (target[canonicalField] === undefined || target[canonicalField] === null) return;
  aliases.forEach((alias) => {
    target[alias] = target[canonicalField];
  });
}

function displayName(data = {}) {
  return cleanText([data.nombre, data.apellidos].filter(Boolean).join(' '), 180) || cleanText(data.email, 180);
}

function searchKeywords(...values) {
  return [...new Set(values.flatMap((value) => {
    if (Array.isArray(value)) return value.flatMap((item) => searchKeywords(item));
    return lower(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1);
  }))].slice(0, 80);
}

function isoDateTime(date, time) {
  const day = cleanText(date, 20);
  const hour = cleanText(time, 8).slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(hour)) return '';
  const parsed = new Date(`${day}T${hour}:00`);
  return Number.isNaN(parsed.getTime()) ? '' : `${day}T${hour}:00`;
}

function localIso(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:00`;
}

function endIsoFromClass(data) {
  const explicit = isoDateTime(data.date, data.endTime);
  if (explicit) return explicit;
  const start = isoDateTime(data.date, data.startTime);
  const minutes = numberOrNull(data.durationMinutes);
  if (!start || !minutes) return '';
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + minutes);
  return localIso(end);
}

function normalizeStatusValue(value, fallback = '') {
  const status = lower(value || fallback);
  if (status === 'pending') return 'pendiente';
  if (status === 'active') return 'activo';
  if (status === 'completed') return 'completada';
  if (status === 'cancelled' || status === 'canceled') return 'cancelada';
  if (status === 'paid' || status === 'succeeded') return 'pagado';
  if (status === 'validated') return 'validado';
  return status || fallback;
}

function canonicalizeCommon(collectionName, payload, options = {}) {
  const data = { ...(payload || {}) };
  const canonicalCollection = normalizeCollection(collectionName);
  const nowIso = options.nowIso || new Date().toISOString();

  const aliasKeys = new Set(COLLECTION_ALIAS_KEYS[canonicalCollection] || COMMON_ALIAS_KEYS);
  for (const canonical of aliasKeys) {
    setIfMissing(data, canonical, firstDefined(data, FIELD_ALIAS_GROUPS[canonical] || [canonical]));
  }
  for (const canonical of Object.keys(COLLECTION_FIELD_ALIASES[canonicalCollection] || {})) {
    setIfMissing(data, canonical, readField(data, canonical, canonicalCollection));
  }

  if (data.email !== undefined) data.email = cleanText(data.email, 254).toLowerCase();
  if (data.nombre !== undefined) data.nombre = cleanText(data.nombre, 120);
  if (data.apellidos !== undefined) data.apellidos = cleanText(data.apellidos, 160);
  if (data.telefono !== undefined && data.telefono !== null) data.telefono = cleanText(data.telefono, 40);

  if (options.isCreate) {
    setIfMissing(data, 'created_at', nowIso);
  }
  setIfMissing(data, 'updated_at', nowIso);

  if (data.status !== undefined || DEFAULT_STATUS_BY_COLLECTION[canonicalCollection]) {
    data.status = normalizeStatusValue(data.status, DEFAULT_STATUS_BY_COLLECTION[canonicalCollection]);
  }
  if (data.active === undefined && ['profesores', 'familias', 'alumnos', 'asignaciones', 'chats'].includes(canonicalCollection)) {
    data.active = data.activo ?? data.activa ?? true;
  }
  if (['users', 'profesores', 'familias', 'alumnos'].includes(canonicalCollection)) {
    setIfMissing(data, 'displayName', displayName(data));
  }

  return data;
}

function normalizeProfile(collectionName, payload, options) {
  const data = canonicalizeCommon(collectionName, payload, options);
  const profileArrays = ['subjects', 'levels', 'specialties', 'languages', 'certifications'];
  profileArrays.forEach((field) => {
    if (data[field] !== undefined) data[field] = asArray(data[field]);
  });
  if (data.experienceYears !== undefined) data.experienceYears = Math.max(0, numberOrNull(data.experienceYears) || 0);
  if (data.profileCompletionPercent !== undefined) {
    data.profileCompletionPercent = Math.max(0, Math.min(100, Math.round(numberOrNull(data.profileCompletionPercent) || 0)));
    setIfMissing(data, 'profileCompletion', data.profileCompletionPercent);
  }
  if (data.profileComplete === undefined && data.profileCompletionPercent !== undefined) {
    data.profileComplete = data.profileCompletionPercent >= 90;
  }
  if (data.hasBizum !== undefined) data.hasBizum = data.hasBizum === true || data.hasBizum === 'true';
  data.searchKeywords = searchKeywords(data.displayName, data.email, data.telefono, data.city, data.zone, data.subjects, data.levels, data.specialties);
  return data;
}

function normalizeStudent(payload, options) {
  const data = canonicalizeCommon('alumnos', payload, options);
  setIfMissing(data, 'displayName', displayName(data));
  data.searchKeywords = searchKeywords(data.displayName, data.level, data.course, data.school);
  return data;
}

function normalizeRequest(payload, options) {
  const data = canonicalizeCommon('solicitudes', payload, options);
  data.subject = cleanText(data.subject || data.materia, 180);
  data.level = cleanText(data.level || data.nivel, 120);
  setIfMissing(data, 'matchStatus', data.assignedTeacherUid ? 'assigned' : 'pending');
  setIfMissing(data, 'lifecycleStatus', data.assignedTeacherUid ? 'profesor_asignado' : 'solicitud_enviada');
  data.searchKeywords = searchKeywords(data.subject, data.level, data.zone, data.schedulePreference, data.notes);
  return data;
}

function normalizeAssignment(payload, options) {
  const data = canonicalizeCommon('asignaciones', payload, options);
  data.active = data.active ?? true;
  setIfMissing(data, 'schedulingStatus', data.chatId ? 'pendiente_horario' : 'pendiente_chat');
  setIfMissing(data, 'relationshipStage', data.schedulingStatus || 'pendiente_horario');
  mirrorAliases(data, 'requestId', ['solicitud_id']);
  return data;
}

function normalizeClass(payload, options) {
  const data = canonicalizeCommon('clases', payload, options);
  data.subject = cleanText(data.subject || data.materia, 180);
  if (data.durationMinutes !== undefined) data.durationMinutes = Math.max(0, Math.round(numberOrNull(data.durationMinutes) || 0));
  if (data.familyAmount !== undefined) data.familyAmount = amount(data.familyAmount);
  if (data.teacherAmount !== undefined) data.teacherAmount = amount(data.teacherAmount);
  if (data.platformFee !== undefined) data.platformFee = amount(data.platformFee);
  setIfMissing(data, 'startAtIso', isoDateTime(data.date, data.startTime));
  setIfMissing(data, 'endAtIso', endIsoFromClass(data));
  setIfMissing(data, 'attendanceStatus', 'pendiente');
  setIfMissing(data, 'familyPaymentStatus', data.paymentStatus || 'pendiente');
  setIfMissing(data, 'teacherPaymentStatus', 'pendiente');
  setIfMissing(data, 'lifecycleStatus', STATUS_TO_LIFECYCLE[data.status] || data.status);
  data.searchKeywords = searchKeywords(data.subject, data.status, data.date, data.familyUid, data.teacherUid, data.studentId);
  return data;
}

function normalizePayment(payload, options) {
  const data = canonicalizeCommon('pagos', payload, options);
  data.amount = amount(data.amount) ?? amount(data.monto) ?? 0;
  data.paymentType = data.paymentType || data.tipo || 'family_payment';
  data.method = data.method || data.metodo || 'bizum';
  data.gateway = data.gateway || data.provider || 'manual';
  data.status = normalizeStatusValue(data.status || data.estado, 'pendiente');
  setIfMissing(data, 'reconciliationStatus', data.classIds?.length ? 'pending_payment' : 'needs_review');
  if (Array.isArray(data.classIds)) data.classIds = data.classIds.map((item) => cleanText(item, 180)).filter(Boolean);
  data.searchKeywords = searchKeywords(data.paymentType, data.status, data.familyUid, data.teacherUid, data.classIds);
  return data;
}

function normalizeDocument(payload, options) {
  const data = canonicalizeCommon('documentos', payload, options);
  data.status = normalizeStatusValue(data.status || data.verificationStatus, 'pendiente');
  setIfMissing(data, 'verificationStatus', data.status);
  data.searchKeywords = searchKeywords(data.name, data.type, data.ownerUid, data.ownerRole, data.status);
  return data;
}

function normalizeNotification(payload, options) {
  const data = canonicalizeCommon('notificaciones', payload, options);
  setIfMissing(data, 'title', data.titulo);
  setIfMissing(data, 'body', data.cuerpo);
  if (data.leida === undefined) data.leida = Boolean(data.readAt);
  data.status = data.leida ? 'leida' : 'nueva';
  return data;
}

function normalizeIncident(payload, options) {
  const data = canonicalizeCommon('incidencias', payload, options);
  data.status = normalizeStatusValue(data.status || data.estado, 'abierta');
  data.category = cleanText(data.category || data.categoria || 'general', 80);
  data.priority = cleanText(data.priority || data.prioridad || 'media', 40);
  data.searchKeywords = searchKeywords(data.ticketId, data.category, data.priority, data.status, data.familyUid, data.teacherUid);
  return data;
}

function normalizeChat(payload, options) {
  const data = canonicalizeCommon('chats', payload, options);
  data.active = data.active ?? true;
  setIfMissing(data, 'relationshipStatus', 'active');
  setIfMissing(data, 'relationshipStage', data.schedulingStatus || 'pendiente_horario');
  if (Array.isArray(data.participantUids)) {
    data.participantUids = Object.fromEntries(data.participantUids.map((uid) => [cleanText(uid, 180), true]).filter(([uid]) => uid));
  }
  return data;
}

export function normalizeEntityForWrite(collectionName, payload = {}, options = {}) {
  const canonicalCollection = normalizeCollection(collectionName);
  let data;
  if (canonicalCollection === 'profesores' || canonicalCollection === 'familias') data = normalizeProfile(canonicalCollection, payload, options);
  else if (canonicalCollection === 'alumnos') data = normalizeStudent(payload, options);
  else if (canonicalCollection === 'solicitudes') data = normalizeRequest(payload, options);
  else if (canonicalCollection === 'asignaciones') data = normalizeAssignment(payload, options);
  else if (canonicalCollection === 'clases') data = normalizeClass(payload, options);
  else if (canonicalCollection === 'pagos') data = normalizePayment(payload, options);
  else if (canonicalCollection === 'documentos') data = normalizeDocument(payload, options);
  else if (canonicalCollection === 'notificaciones') data = normalizeNotification(payload, options);
  else if (canonicalCollection === 'incidencias') data = normalizeIncident(payload, options);
  else if (canonicalCollection === 'chats') data = normalizeChat(payload, options);
  else data = canonicalizeCommon(canonicalCollection, payload, options);

  const aliasKeys = new Set(COLLECTION_ALIAS_KEYS[canonicalCollection] || COMMON_ALIAS_KEYS);
  for (const canonical of aliasKeys) {
    mirrorAliases(data, canonical, LEGACY_WRITE_ALIASES[canonical] || []);
  }
  for (const [canonical, aliases] of Object.entries(COLLECTION_FIELD_ALIASES[canonicalCollection] || {})) {
    mirrorAliases(data, canonical, aliases);
  }

  data.schemaVersion = data.schemaVersion || DATA_SCHEMA_VERSION;
  data.canonicalCollection = data.canonicalCollection || canonicalCollection;
  return data;
}

export function analyzeEntityData(collectionName, payload = {}) {
  const canonicalCollection = normalizeCollection(collectionName);
  const normalized = normalizeEntityForWrite(canonicalCollection, payload);
  const schemaFields = CANONICAL_FIELDS[canonicalCollection] || [];
  const presentCanonical = schemaFields.filter((field) => normalized[field] !== undefined && normalized[field] !== null && normalized[field] !== '');
  const missingCanonical = schemaFields.filter((field) => !presentCanonical.includes(field));
  const aliasKeys = new Set(COLLECTION_ALIAS_KEYS[canonicalCollection] || COMMON_ALIAS_KEYS);
  const scopedAliases = Object.fromEntries([...aliasKeys].map((canonical) => [canonical, FIELD_ALIAS_GROUPS[canonical] || []]));
  const duplicateAliases = Object.entries({
    ...scopedAliases,
    ...(COLLECTION_FIELD_ALIASES[canonicalCollection] || {}),
  }).flatMap(([canonical, aliases]) => {
    const value = normalized[canonical];
    return aliases
      .filter((alias) => alias !== canonical && normalized[alias] !== undefined)
      .map((alias) => ({ canonical, alias, consistent: String(normalized[alias]) === String(value) }));
  });

  return {
    collection: canonicalCollection,
    schemaVersion: DATA_SCHEMA_VERSION,
    canonicalCoverage: schemaFields.length ? Math.round((presentCanonical.length / schemaFields.length) * 100) : 100,
    presentCanonical,
    missingCanonical,
    duplicateAliases,
    derivedFields: ['displayName', 'searchKeywords', 'startAtIso', 'endAtIso', 'lifecycleStatus', 'profileCompletionPercent'].filter((field) => normalized[field] !== undefined),
  };
}

export function collectionForWrite(collectionName) {
  return normalizeCollection(collectionName);
}
