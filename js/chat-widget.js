import {
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { firebaseAuth, firebaseDb } from './firebase-client.js?v=20260627-domain-auth';
import {
  buildAdminClassPayload,
  validateClassTimeRange,
} from './calendar-engine.js?v=20260628-calendar';
import { buildClassPricingQuote } from './finance-erp-engine.js?v=20260629-pricing';
import {
  availabilitySlotLabel,
  busySlotLabel,
  findBusySlotConflict,
  summarizeAvailabilitySlots,
  summarizeBusySlots,
  validateScheduleAvailability,
  weekdayIndexFromDate,
  WEEKDAY_LABELS,
} from './availability-engine.js?v=20260629-busy-slots';
import {
  createAdminNotification,
  loadNotificationSettings,
  markAllNotificationsRead,
  markNotificationRead,
  requestBrowserNotificationPermission,
  saveNotificationSettings,
  showBrowserNotification,
  watchUserNotifications,
} from './notifications-provider.js?v=20260627-domain-auth';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  mergeNotificationSettings,
  notificationActionUrl,
  notificationCategoryLabel,
  notificationPriorityClass,
} from './notification-engine.js';
import {
  registerPushNotifications,
  watchForegroundPushMessages,
} from './push-notifications.js';
import {
  classResetWriteFields,
  filterAfterClassReset,
  isAfterClassReset,
  isBusySlotAfterClassReset,
} from './class-reset.js';

const SCHEDULE_KIND_WEEKLY = 'weekly_recurring';
const SCHEDULE_KIND_ONE_OFF = 'one_off';
const SCHEDULE_KINDS = new Set([SCHEDULE_KIND_WEEKLY, SCHEDULE_KIND_ONE_OFF]);
const ACCEPTED_SCHEDULE_STATUSES = new Set(['aceptada', 'accepted', 'confirmada', 'confirmed']);

function clean(value, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

function escapeHtml(value) {
  return clean(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function isAcceptedScheduleProposal(proposal = {}) {
  return ACCEPTED_SCHEDULE_STATUSES.has(clean(proposal.status || proposal.estado, 80).toLowerCase());
}

function normalizeDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value.seconds) return new Date(value.seconds * 1000).toISOString();
  return '';
}

function formatDateTime(value) {
  const iso = normalizeDate(value);
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return clean(value, 20);
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function normalizeScheduleKind(value) {
  const kind = clean(value, 40);
  return SCHEDULE_KINDS.has(kind) ? kind : SCHEDULE_KIND_WEEKLY;
}

function scheduleKindLabel(value) {
  return normalizeScheduleKind(value) === SCHEDULE_KIND_WEEKLY ? 'Horario semanal fijo' : 'Clase puntual';
}

function proposalScheduleKind(proposal = {}) {
  return normalizeScheduleKind(proposal.kind || proposal.scheduleKind);
}

function isWeeklyRecurringProposal(proposal = {}) {
  return proposalScheduleKind(proposal) === SCHEDULE_KIND_WEEKLY;
}

function normalizeScheduleWeekdayIndex(value) {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 6) return numeric;
  return weekdayIndexFromDate(value);
}

function recurrenceLabelFromFields(dayOrDate = '', start = '', end = '') {
  const dayIndex = normalizeScheduleWeekdayIndex(dayOrDate);
  const dayLabel = Number.isInteger(dayIndex) ? WEEKDAY_LABELS[dayIndex] : 'dia acordado';
  return `Todos los ${dayLabel} ${start}-${end}`;
}

function scheduleProposalDisplayLabel(proposal = {}) {
  if (isWeeklyRecurringProposal(proposal)) {
    const dayOfWeek = proposal.recurrence?.dayOfWeek ?? proposal.fecha;
    return proposal.recurrenceLabel || recurrenceLabelFromFields(dayOfWeek, proposal.hora_inicio, proposal.hora_fin);
  }
  return `${formatDate(proposal.fecha)} de ${proposal.hora_inicio} a ${proposal.hora_fin}`;
}

function dateInputValue(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function todayWeekdayIndex(now = new Date()) {
  return (now.getDay() + 6) % 7;
}

function nextDateForWeekday(dayOfWeek, startTime = '', now = new Date()) {
  const normalizedDay = normalizeScheduleWeekdayIndex(dayOfWeek);
  if (!Number.isInteger(normalizedDay)) return '';
  const target = new Date(now);
  target.setHours(0, 0, 0, 0);
  let dayOffset = normalizedDay - todayWeekdayIndex(now);
  if (dayOffset < 0) dayOffset += 7;
  const timeMatch = clean(startTime, 8).match(/^(\d{2}):(\d{2})$/);
  if (dayOffset === 0 && timeMatch) {
    const startMinutes = Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    if (startMinutes <= currentMinutes) dayOffset = 7;
  }
  target.setDate(target.getDate() + dayOffset);
  return dateInputValue(target);
}

function weekdayOptions(selectedDay = todayWeekdayIndex()) {
  const day = normalizeScheduleWeekdayIndex(selectedDay);
  return WEEKDAY_LABELS.map((label, index) => (
    `<option value="${index}" ${day === index ? 'selected' : ''}>${escapeHtml(label)}</option>`
  )).join('');
}

function fullName(...parts) {
  return parts.map(clean).filter(Boolean).join(' ').trim();
}

function classIdFromProposal(chatId, proposalId) {
  return `chat_${chatId}_${proposalId}`.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 900);
}

function busyResourceKey(resourceType, resourceId) {
  const type = clean(resourceType, 40);
  const id = clean(resourceId, 180);
  return type && id ? `${type}:${id}` : '';
}

function busySlotDocId(resourceType, resourceId, classId) {
  return [resourceType, resourceId, classId]
    .map((part) => clean(part, 180).replace(/[^a-zA-Z0-9_-]+/g, '_'))
    .filter(Boolean)
    .join('_')
    .slice(0, 900);
}

function pickClassPriceFields(fields = {}) {
  return {
    precio_total: fields.precio_total ?? null,
    amount: fields.amount ?? null,
    familyAmount: fields.familyAmount ?? null,
    importe_profesor: fields.importe_profesor ?? null,
    teacherAmount: fields.teacherAmount ?? null,
    comision_clasesde10: fields.comision_clasesde10 ?? null,
    platformFee: fields.platformFee ?? null,
    marginPct: fields.marginPct ?? null,
  };
}

function proratedPricingFromHourly(chat = {}, durationMinutes = 60) {
  const familyHourly = Number(chat.familyHourlyRate ?? chat.precio_hora_familia ?? chat.familyRatePerHour);
  const teacherHourly = Number(chat.teacherHourlyRate ?? chat.importe_hora_profesor ?? chat.teacherRatePerHour);
  if (!Number.isFinite(familyHourly) || familyHourly <= 0 || !Number.isFinite(teacherHourly) || teacherHourly <= 0) return null;
  const factor = (Number(durationMinutes) || 60) / 60;
  const familyAmount = Math.round((familyHourly * factor + Number.EPSILON) * 100) / 100;
  const teacherAmount = Math.round((teacherHourly * factor + Number.EPSILON) * 100) / 100;
  const platformFee = Math.round((familyAmount - teacherAmount + Number.EPSILON) * 100) / 100;
  const marginPct = familyAmount > 0 ? Math.round((platformFee / familyAmount) * 10000) / 100 : null;
  return {
    precio_total: familyAmount,
    amount: familyAmount,
    familyAmount,
    importe_profesor: teacherAmount,
    teacherAmount,
    comision_clasesde10: platformFee,
    platformFee,
    marginPct,
  };
}

function participantMap(ids) {
  return [...new Set(ids.map(clean).filter(Boolean))]
    .reduce((acc, id) => ({ ...acc, [id]: true }), {});
}

function assignmentIds(assignment) {
  const familyUid = clean(assignment.familyUid || assignment.familia_id);
  const teacherUid = clean(assignment.teacherUid || assignment.profesor_id);
  const studentId = clean(assignment.studentId || assignment.alumno_id);
  const familyUserUid = clean(assignment.familias?.userUid || assignment.familias?.usuario_id || assignment.familias?.id);
  const teacherUserUid = clean(assignment.teacherUserUid || assignment.profesores?.userUid || assignment.profesores?.usuario_id || assignment.profesores?.id);
  return { familyUid, teacherUid, studentId, familyUserUid, teacherUserUid };
}

function reliableName(value, fallback = '') {
  const text = clean(value, 180);
  return text.length > 1 ? text : clean(fallback, 180);
}

function hydrateChatNames(data = {}, fallback = {}) {
  return {
    ...data,
    familyName: reliableName(data.familyName, fallback.familyName),
    teacherName: reliableName(data.teacherName, fallback.teacherName),
    studentName: reliableName(data.studentName, fallback.studentName),
    materia: reliableName(data.materia, fallback.materia),
    familyUid: clean(data.familyUid || data.familia_id || fallback.familyUid, 180),
    familia_id: clean(data.familia_id || data.familyUid || fallback.familyUid, 180),
    teacherUid: clean(data.teacherUid || data.profesor_id || fallback.teacherUid, 180),
    profesor_id: clean(data.profesor_id || data.teacherUid || fallback.teacherUid, 180),
    studentId: clean(data.studentId || data.alumno_id || fallback.studentId, 180) || null,
    alumno_id: clean(data.alumno_id || data.studentId || fallback.studentId, 180) || null,
    assignmentId: clean(data.assignmentId || data.asignacion_id || fallback.assignmentId, 180),
    asignacion_id: clean(data.asignacion_id || data.assignmentId || fallback.assignmentId, 180),
    precio_total: data.precio_total ?? data.amount ?? data.familyAmount ?? fallback.precio_total ?? fallback.amount ?? fallback.familyAmount ?? null,
    amount: data.amount ?? data.precio_total ?? data.familyAmount ?? fallback.amount ?? fallback.precio_total ?? fallback.familyAmount ?? null,
    familyAmount: data.familyAmount ?? data.precio_total ?? data.amount ?? fallback.familyAmount ?? fallback.precio_total ?? fallback.amount ?? null,
    importe_profesor: data.importe_profesor ?? data.teacherAmount ?? fallback.importe_profesor ?? fallback.teacherAmount ?? null,
    teacherAmount: data.teacherAmount ?? data.importe_profesor ?? fallback.teacherAmount ?? fallback.importe_profesor ?? null,
    comision_clasesde10: data.comision_clasesde10 ?? data.platformFee ?? fallback.comision_clasesde10 ?? fallback.platformFee ?? null,
    platformFee: data.platformFee ?? data.comision_clasesde10 ?? fallback.platformFee ?? fallback.comision_clasesde10 ?? null,
    marginPct: data.marginPct ?? fallback.marginPct ?? null,
    familyHourlyRate: data.familyHourlyRate ?? data.precio_hora_familia ?? fallback.familyHourlyRate ?? fallback.precio_hora_familia ?? null,
    teacherHourlyRate: data.teacherHourlyRate ?? data.importe_hora_profesor ?? fallback.teacherHourlyRate ?? fallback.importe_hora_profesor ?? null,
    commissionPercent: data.commissionPercent ?? data.comision_porcentaje ?? fallback.commissionPercent ?? fallback.comision_porcentaje ?? null,
    pricingRule: data.pricingRule || fallback.pricingRule || '',
    teacherRateSource: data.teacherRateSource || fallback.teacherRateSource || '',
  };
}

function mergeDocsById(rows = []) {
  const map = new Map();
  rows.filter(Boolean).forEach((row) => map.set(String(row.id || row.assignmentId || row.asignacion_id), row));
  return Array.from(map.values());
}

async function loadFirestoreChatsBy(field, value) {
  const cleanValue = clean(value, 180);
  if (!cleanValue) return [];
  const snap = await getDocs(query(
    collection(firebaseDb, 'chats'),
    where(field, '==', cleanValue),
    limit(80),
  ));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function loadFirestoreChatsForActor(role, actorIds = []) {
  const ids = [...new Set(Array.from(actorIds || []).map((id) => clean(id, 180)).filter(Boolean))];
  if (!ids.length) return [];
  const queries = ids.flatMap((id) => {
    const entries = [
      loadFirestoreChatsBy(`participantUids.${id}`, true).catch(() => []),
    ];
    if (role === 'familia') {
      entries.push(loadFirestoreChatsBy('familyUid', id).catch(() => []));
      entries.push(loadFirestoreChatsBy('familia_id', id).catch(() => []));
    }
    if (role === 'profesor') {
      entries.push(loadFirestoreChatsBy('teacherUid', id).catch(() => []));
      entries.push(loadFirestoreChatsBy('profesor_id', id).catch(() => []));
    }
    return entries;
  });
  return mergeDocsById((await Promise.all(queries)).flat());
}

function defaultChatTitle(chat, role) {
  const family = readableChatIdentity(chat.familyName, chat.familia_nombre, chat.familyEmail);
  const teacher = readableChatIdentity(chat.teacherName, chat.profesor_nombre, chat.teacherEmail);
  const student = readableChatIdentity(chat.studentName, chat.alumno_nombre, chat.studentDisplayName);
  if (role === 'profesor') return student || family || shortChatEntityLabel('Familia', chat.familyUid || chat.familia_id);
  if (role === 'familia') return teacher || shortChatEntityLabel('Profesor', chat.teacherUid || chat.profesor_id);
  return [
    family || shortChatEntityLabel('Familia', chat.familyUid || chat.familia_id),
    teacher || shortChatEntityLabel('Profesor', chat.teacherUid || chat.profesor_id),
  ].join(' / ');
}

function chatTitle(chat, role, preference = {}) {
  return reliableName(preference.displayNameOverride, '') || defaultChatTitle(chat, role);
}

function realChatTitle(chat, role) {
  const family = readableChatIdentity(chat.familyName, chat.familia_nombre, chat.familyEmail);
  const teacher = readableChatIdentity(chat.teacherName, chat.profesor_nombre, chat.teacherEmail);
  const student = readableChatIdentity(chat.studentName, chat.alumno_nombre, chat.studentDisplayName);
  if (role === 'profesor') return student || family;
  if (role === 'familia') return teacher;
  return [family, teacher].filter(Boolean).join(' / ');
}

function isUsefulChatIdentity(value) {
  const normalized = clean(value, 120).toLowerCase();
  return normalized
    && normalized.length > 1
    && !['profesor', 'familia', 'alumno', 'alumno/a', 'profesor asignado'].includes(normalized);
}

function readableChatIdentity(...values) {
  return values.map((value) => clean(value, 180)).find(isUsefulChatIdentity) || '';
}

function shortChatEntityLabel(label, id = '') {
  const suffix = clean(id, 180).replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
  return suffix ? `${label} ${suffix}` : label;
}

function isExpectedPermissionFallback(error) {
  const message = clean(error?.message || error, 400).toLowerCase();
  return /permission|insufficient permissions/.test(message);
}

function chatSubtitle(chat, role, preference = {}) {
  const parts = [];
  const realTitle = realChatTitle(chat, role);
  const defaultTitle = defaultChatTitle(chat, role);
  if (preference.displayNameOverride && isUsefulChatIdentity(realTitle)) parts.push(`Nombre real: ${realTitle}`);
  const familyName = readableChatIdentity(chat.familyName, chat.familia_nombre, chat.familyEmail);
  const studentName = readableChatIdentity(chat.studentName, chat.alumno_nombre, chat.studentDisplayName);
  if (role === 'profesor' && familyName && familyName !== defaultTitle) parts.push(`Familia: ${familyName}`);
  if (role !== 'profesor' && studentName) parts.push(`Alumno/a: ${studentName}`);
  if (chat.materia) parts.push(chat.materia);
  return parts.join(' · ') || 'Asignacion activa';
}

async function loadAssignments(dbCompat, role, profileId, actorIds = []) {
  const select = '*, alumnos(nombre,apellidos), familias(nombre,apellidos,usuarios(nombre,apellidos,email,telefono)), profesores(nombre,apellidos,email,usuarios(nombre,apellidos,email,telefono))';
  if (role === 'admin') {
    const { data, error } = await dbCompat.from('asignaciones').select(select).eq('activa', true);
    if (error) throw error;
    return data || [];
  }

  const ids = [...new Set([profileId, ...actorIds].map((id) => clean(id, 180)).filter(Boolean))];
  const field = role === 'familia' ? 'familia_id' : 'profesor_id';
  const results = await Promise.all(ids.map(async (id) => {
    const { data, error } = await dbCompat.from('asignaciones').select(select).eq('activa', true).eq(field, id);
    if (error) {
      if (!isExpectedPermissionFallback(error)) {
        console.warn(`No se pudieron cargar asignaciones por ${field}`, { id, message: error.message || String(error) });
      }
      return [];
    }
    return data || [];
  }));
  return mergeDocsById(results.flat());
}

async function ensureChatForAssignment(assignment, usuario, role) {
  const assignmentId = clean(assignment.id);
  if (!assignmentId) return null;

  const { familyUid, teacherUid, studentId, familyUserUid, teacherUserUid } = assignmentIds(assignment);
  if (!familyUid || !teacherUid) return null;

  const ref = doc(firebaseDb, 'chats', assignmentId);
  const existing = await getDoc(ref);
  const teacherName = fullName(
    assignment.profesores?.usuarios?.nombre || assignment.profesores?.nombre,
    assignment.profesores?.usuarios?.apellidos || assignment.profesores?.apellidos,
  ) || assignment.profesores?.usuarios?.email || assignment.profesores?.email || 'Profesor';
  const familyName = fullName(
    assignment.familias?.usuarios?.nombre || assignment.familias?.nombre,
    assignment.familias?.usuarios?.apellidos || assignment.familias?.apellidos,
  ) || assignment.familias?.usuarios?.email || 'Familia';
  const studentName = fullName(assignment.alumnos?.nombre, assignment.alumnos?.apellidos);
  const participantUids = participantMap([
    familyUid,
    teacherUid,
    familyUserUid,
    teacherUserUid,
    usuario.uid,
    usuario.firebase_uid,
  ]);

  const base = {
    assignmentId,
    asignacion_id: assignmentId,
    familyUid,
    familia_id: familyUid,
    teacherUid,
    profesor_id: teacherUid,
    studentId: studentId || null,
    alumno_id: studentId || null,
    materia: clean(assignment.materia || assignment.subject, 180),
    ...pickClassPriceFields(assignment),
    familyHourlyRate: assignment.familyHourlyRate ?? assignment.precio_hora_familia ?? null,
    teacherHourlyRate: assignment.teacherHourlyRate ?? assignment.importe_hora_profesor ?? null,
    commissionPercent: assignment.commissionPercent ?? assignment.comision_porcentaje ?? null,
    pricingRule: assignment.pricingRule || assignment.teacherRateRuleId || assignment.teacherRateSource || '',
    teacherRateSource: assignment.teacherRateSource || '',
    familyName,
    teacherName,
    studentName,
    participantUids,
    active: true,
    schedulingStatus: assignment.schedulingStatus || assignment.estado_programacion || 'pendiente_horario',
    updatedAt: serverTimestamp(),
  };
  if (role !== 'admin') {
    for (const field of [
      'precio_total',
      'amount',
      'familyAmount',
      'importe_profesor',
      'teacherAmount',
      'comision_clasesde10',
      'platformFee',
      'marginPct',
      'familyHourlyRate',
      'teacherHourlyRate',
      'commissionPercent',
      'pricingRule',
      'teacherRateSource',
    ]) {
      delete base[field];
    }
  }

  if (!existing.exists()) {
    await setDoc(ref, {
      ...base,
      createdAt: serverTimestamp(),
      lastMessage: '',
      lastMessageAt: null,
    });
  } else if (role === 'admin') {
    await setDoc(ref, base, { merge: true });
  } else {
    return { id: existing.id, ...hydrateChatNames(existing.data(), base) };
  }

  const snap = await getDoc(ref);
  return { id: snap.id, ...hydrateChatNames(snap.data(), base) };
}

async function loadChats(dbCompat, role, profileId, usuario, actorIds = []) {
  if (role === 'admin') {
    const assignments = await loadAssignments(dbCompat, role, profileId, actorIds);
    await Promise.all(assignments.map((assignment) => ensureChatForAssignment(assignment, usuario, role).catch((error) => {
      if (!isExpectedPermissionFallback(error)) {
        console.warn('No se pudo preparar chat de asignacion', { assignmentId: assignment.id, message: error.message || String(error) });
      }
      return null;
    })));
    const snap = await getDocs(query(
      collection(firebaseDb, 'chats'),
      orderBy('updatedAt', 'desc'),
      limit(200),
    ));
    const chats = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    chats.sort((a, b) => String(normalizeDate(b.lastMessageAt || b.updatedAt)).localeCompare(String(normalizeDate(a.lastMessageAt || a.updatedAt))));
    return chats;
  }

  const actorSet = new Set([usuario?.uid, usuario?.firebase_uid, profileId, ...Array.from(actorIds || [])].map((id) => clean(id, 180)).filter(Boolean));
  const firestoreChats = await loadFirestoreChatsForActor(role, actorSet).catch(() => []);
  const assignments = await loadAssignments(dbCompat, role, profileId, actorIds);
  const assignmentChats = (await Promise.all(assignments.map((assignment) => ensureChatForAssignment(assignment, usuario, role).catch((error) => {
    if (!isExpectedPermissionFallback(error)) {
      console.warn('No se pudo preparar chat de asignacion', { assignmentId: assignment.id, message: error.message || String(error) });
    }
    return null;
  }))))
    .filter(Boolean);
  const chats = mergeDocsById([...firestoreChats, ...assignmentChats]);
  chats.sort((a, b) => String(normalizeDate(b.lastMessageAt || b.updatedAt)).localeCompare(String(normalizeDate(a.lastMessageAt || a.updatedAt))));
  return chats;
}

async function loadChatPreferences(chats = [], currentUid = '') {
  if (!currentUid || !chats.length) return {};
  const entries = await Promise.all(chats.map(async (chat) => {
    try {
      const snap = await getDoc(doc(firebaseDb, 'chats', chat.id, 'preferencias', currentUid));
      return [chat.id, snap.exists() ? { exists: true, ...snap.data() } : { exists: false }];
    } catch (error) {
      return [chat.id, { exists: false, error: error.message || 'No se pudo cargar el nombre guardado.' }];
    }
  }));
  return Object.fromEntries(entries);
}

function uniqueAvailabilityRows(rows = []) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = row.id || `${row.teacherUid || row.profesor_id || ''}:${row.familyUid || row.familia_id || ''}:${row.studentId || row.alumno_id || ''}:${row.dia_semana}:${row.hora_inicio}:${row.hora_fin}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueBusyRows(rows = []) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = row.id || `${row.resourceKey || ''}:${row.classId || row.scheduleProposalId || ''}:${row.fecha || row.date}:${row.hora_inicio || row.startTime}:${row.hora_fin || row.endTime}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const ACTIVE_CLIENT_BUSY_STATUSES = new Set([
  'pendiente',
  'confirmada',
  'programada',
  'reprogramada',
  'scheduled',
  'confirmed',
  'pendiente_confirmacion',
  'clase_programada',
  'clase_proxima',
  'recordatorio_enviado',
  'clase_iniciada',
  'clase_en_curso',
]);

const INACTIVE_CLIENT_BUSY_STATUSES = new Set([
  'cancelada',
  'cancelado',
  'cancelled',
  'canceled',
  'rechazada',
  'realizada',
  'completada',
  'completed',
  'pagada',
  'paid',
  'archivada',
  'archived',
]);

function classBlocksAvailability(row = {}) {
  const status = clean(row.status || row.estado || row.lifecycleStatus || 'confirmada', 80).toLowerCase();
  const lifecycle = clean(row.lifecycleStatus, 80).toLowerCase();
  const attendance = clean(row.attendanceStatus || row.estado_asistencia, 80).toLowerCase();
  if (INACTIVE_CLIENT_BUSY_STATUSES.has(status)
    || INACTIVE_CLIENT_BUSY_STATUSES.has(lifecycle)
    || INACTIVE_CLIENT_BUSY_STATUSES.has(attendance)) {
    return false;
  }
  return ACTIVE_CLIENT_BUSY_STATUSES.has(status)
    || ACTIVE_CLIENT_BUSY_STATUSES.has(lifecycle)
    || !status;
}

function busySlotsFromClassRows(rows = []) {
  return filterAfterClassReset(rows)
    .filter(classBlocksAvailability)
    .flatMap((row) => buildBusySlotPayloadsForClass(row.id || row.classId, row, {
      assignmentId: row.assignmentId || row.asignacion_id,
    }).map((slot) => ({ id: slot.id, ...slot.payload })));
}

async function loadClassRowsBy(field, value) {
  const cleanValue = clean(value, 180);
  if (!cleanValue) return [];
  const snap = await getDocs(query(
    collection(firebaseDb, 'clases'),
    where(field, '==', cleanValue),
    limit(80),
  ));
  return filterAfterClassReset(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
}

async function loadVisibleClassBusySlots(chat = {}, currentUid = '') {
  const teacherUid = clean(chat.teacherUid || chat.profesor_id, 180);
  const familyUid = clean(chat.familyUid || chat.familia_id, 180);
  const studentId = clean(chat.studentId || chat.alumno_id, 180);
  const queries = [];
  if (teacherUid && teacherUid === currentUid) queries.push(loadClassRowsBy('teacherUid', teacherUid).catch(() => []));
  if (teacherUid && teacherUid === currentUid) queries.push(loadClassRowsBy('profesor_id', teacherUid).catch(() => []));
  if (familyUid && familyUid === currentUid) queries.push(loadClassRowsBy('familyUid', familyUid).catch(() => []));
  if (familyUid && familyUid === currentUid) queries.push(loadClassRowsBy('familia_id', familyUid).catch(() => []));
  if (studentId) queries.push(loadClassRowsBy('studentId', studentId).catch(() => []));
  if (studentId) queries.push(loadClassRowsBy('alumno_id', studentId).catch(() => []));
  if (!queries.length) return [];
  const rows = mergeDocsById((await Promise.all(queries)).flat());
  return busySlotsFromClassRows(rows);
}

function repairBusySlotsFromVisibleClasses(slots = [], currentUid = '', role = '') {
  const activeSlots = uniqueBusyRows(slots).filter((slot) => slot.source === 'class' || slot.source === 'class_automation');
  if (!activeSlots.length || !currentUid) return;
  activeSlots.forEach((slot) => {
    const id = clean(slot.id, 180);
    if (!id || !slot.classId) return;
    setDoc(doc(firebaseDb, 'busySlots', id), {
      resourceType: slot.resourceType,
      resourceId: slot.resourceId,
      resourceKey: slot.resourceKey,
      ...classResetWriteFields(),
      classId: slot.classId,
      assignmentId: slot.assignmentId,
      source: 'class',
      fecha: slot.fecha,
      date: slot.date || slot.fecha,
      hora_inicio: slot.hora_inicio,
      startTime: slot.startTime || slot.hora_inicio,
      hora_fin: slot.hora_fin,
      endTime: slot.endTime || slot.hora_fin,
      durationMinutes: Number(slot.durationMinutes || slot.duracion_minutos || 60),
      duracion_minutos: Number(slot.duracion_minutos || slot.durationMinutes || 60),
      status: slot.status || slot.estado || 'confirmada',
      estado: slot.estado || slot.status || 'confirmada',
      lifecycleStatus: slot.lifecycleStatus || 'clase_programada',
      createdByUid: currentUid,
      createdByRole: role || 'admin',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  });
}

async function loadAvailabilityBy(field, value) {
  const cleanValue = clean(value, 180);
  if (!cleanValue) return [];
  const snap = await getDocs(query(
    collection(firebaseDb, 'disponibilidad'),
    where(field, '==', cleanValue),
    limit(80),
  ));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function loadBusySlotsByResource(resourceType, resourceId) {
  const resourceKey = busyResourceKey(resourceType, resourceId);
  if (!resourceKey) return [];
  const snap = await getDocs(query(
    collection(firebaseDb, 'busySlots'),
    where('resourceKey', '==', resourceKey),
    where('resourceType', '==', clean(resourceType, 40)),
    limit(120),
  ));
  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter(isBusySlotAfterClassReset);
}

async function loadChatAvailability(chat = {}, currentUid = '', role = '') {
  const teacherUid = clean(chat.teacherUid || chat.profesor_id, 180);
  const familyUid = clean(chat.familyUid || chat.familia_id, 180);
  const studentId = clean(chat.studentId || chat.alumno_id, 180);
  const [
    teacherCanonical,
    teacherLegacy,
    studentCanonical,
    studentLegacy,
    familyStudentCanonical,
    familyStudentLegacy,
    teacherBusy,
    studentBusy,
    visibleClassBusy,
  ] = await Promise.all([
    loadAvailabilityBy('teacherUid', teacherUid).catch(() => []),
    loadAvailabilityBy('profesor_id', teacherUid).catch(() => []),
    loadAvailabilityBy('studentId', studentId).catch(() => []),
    loadAvailabilityBy('alumno_id', studentId).catch(() => []),
    loadAvailabilityBy('familyUid', familyUid).catch(() => []),
    loadAvailabilityBy('familia_id', familyUid).catch(() => []),
    loadBusySlotsByResource('teacher', teacherUid).catch(() => []),
    loadBusySlotsByResource('student', studentId).catch(() => []),
    loadVisibleClassBusySlots(chat, currentUid).catch(() => []),
  ]);
  const studentRows = [...studentCanonical, ...studentLegacy, ...familyStudentCanonical, ...familyStudentLegacy]
    .filter((slot) => clean(slot.studentId || slot.alumno_id, 180) === studentId);
  const busySlots = uniqueBusyRows([...teacherBusy, ...studentBusy, ...visibleClassBusy]);
  repairBusySlotsFromVisibleClasses(visibleClassBusy, currentUid, role);
  return {
    loading: false,
    teacherSlots: uniqueAvailabilityRows([...teacherCanonical, ...teacherLegacy]),
    studentSlots: uniqueAvailabilityRows(studentRows),
    busySlots,
  };
}

function busySlotsFromAcceptedProposals(proposals = [], chat = {}, ignoredProposalId = '') {
  const teacherUid = clean(chat.teacherUid || chat.profesor_id, 180);
  const studentId = clean(chat.studentId || chat.alumno_id, 180);
  const assignmentId = clean(chat.id || chat.assignmentId || chat.asignacion_id, 180);
  return (Array.isArray(proposals) ? proposals : [])
    .filter((proposal) => proposal && proposal.id !== ignoredProposalId && isAcceptedScheduleProposal(proposal))
    .filter(isAfterClassReset)
    .flatMap((proposal) => {
      const base = {
        source: 'chat_schedule_proposal',
        ...classResetWriteFields(),
        classId: clean(proposal.classId, 180),
        scheduleProposalId: proposal.id,
        assignmentId,
        fecha: proposal.fecha,
        date: proposal.fecha,
        hora_inicio: proposal.hora_inicio,
        startTime: proposal.hora_inicio,
        hora_fin: proposal.hora_fin,
        endTime: proposal.hora_fin,
        status: 'confirmada',
        estado: 'confirmada',
      };
      return [
        teacherUid ? {
          ...base,
          id: `accepted_teacher_${proposal.id}`,
          resourceType: 'teacher',
          resourceId: teacherUid,
          resourceKey: busyResourceKey('teacher', teacherUid),
          teacherUid,
          profesor_id: teacherUid,
        } : null,
        studentId ? {
          ...base,
          id: `accepted_student_${proposal.id}`,
          resourceType: 'student',
          resourceId: studentId,
          resourceKey: busyResourceKey('student', studentId),
          studentId,
          alumno_id: studentId,
        } : null,
      ].filter(Boolean);
    });
}

function busySlotsForChatValidation(availability = {}, proposals = [], chat = {}, ignoredProposalId = '') {
  return uniqueBusyRows([
    ...(availability.busySlots || []),
    ...busySlotsFromAcceptedProposals(proposals, chat, ignoredProposalId),
  ]);
}

async function loadTeacherProfileForPricing(teacherUid = '') {
  const cleanUid = clean(teacherUid, 180);
  if (!cleanUid) return {};
  try {
    const snap = await getDoc(doc(firebaseDb, 'profesores', cleanUid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : {};
  } catch (error) {
    console.warn('No se pudo cargar tarifa del profesor para cotizar la clase', error);
    return {};
  }
}

async function buildScheduleClassPricing(chat = {}, input = {}) {
  const hourly = proratedPricingFromHourly(chat, input.durationMinutes || input.duracion_minutos || 60);
  if (hourly) return hourly;
  const existing = pickClassPriceFields(chat);
  const hasExisting = Number(existing.familyAmount ?? existing.precio_total ?? 0) > 0
    && Number(existing.teacherAmount ?? existing.importe_profesor ?? 0) > 0;
  if (hasExisting) return existing;
  const teacherProfile = await loadTeacherProfileForPricing(chat.teacherUid || chat.profesor_id);
  return pickClassPriceFields(buildClassPricingQuote(input, teacherProfile, {
    config: globalThis.CD10PlatformConfig || {},
  }));
}

function buildBusySlotPayloadsForClass(classId, classFields = {}, context = {}) {
  const teacherUid = clean(classFields.teacherUid || classFields.profesor_id, 180);
  const studentId = clean(classFields.studentId || classFields.alumno_id, 180);
  const common = {
    source: 'class',
    ...classResetWriteFields(),
    classId,
    assignmentId: clean(classFields.assignmentId || classFields.asignacion_id || context.assignmentId, 180),
    fecha: clean(classFields.fecha || classFields.date, 20).slice(0, 10),
    date: clean(classFields.date || classFields.fecha, 20).slice(0, 10),
    hora_inicio: clean(classFields.hora_inicio || classFields.startTime, 8),
    startTime: clean(classFields.startTime || classFields.hora_inicio, 8),
    hora_fin: clean(classFields.hora_fin || classFields.endTime, 8),
    endTime: clean(classFields.endTime || classFields.hora_fin, 8),
    durationMinutes: Number(classFields.durationMinutes || classFields.duracion_minutos || 60),
    duracion_minutos: Number(classFields.duracion_minutos || classFields.durationMinutes || 60),
    status: clean(classFields.status || classFields.estado || 'confirmada', 80),
    estado: clean(classFields.estado || classFields.status || 'confirmada', 80),
    lifecycleStatus: clean(classFields.lifecycleStatus || 'clase_programada', 80),
    createdByUid: clean(context.createdByUid, 180),
    createdByRole: clean(context.createdByRole, 40),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  return [
    teacherUid ? {
      id: busySlotDocId('teacher', teacherUid, classId),
      payload: {
        ...common,
        resourceType: 'teacher',
        resourceId: teacherUid,
        resourceKey: busyResourceKey('teacher', teacherUid),
      },
    } : null,
    studentId ? {
      id: busySlotDocId('student', studentId, classId),
      payload: {
        ...common,
        resourceType: 'student',
        resourceId: studentId,
        resourceKey: busyResourceKey('student', studentId),
      },
    } : null,
  ].filter(Boolean);
}

async function persistBusySlotsForClass(classId, classFields = {}, context = {}) {
  const slots = buildBusySlotPayloadsForClass(classId, classFields, context);
  if (!slots.length) return [];
  await Promise.all(slots.map((slot) => setDoc(doc(firebaseDb, 'busySlots', slot.id), slot.payload)));
  return slots.map((slot) => ({ id: slot.id, ...slot.payload }));
}

function availabilityForRole(role, availability = {}) {
  const teacherSlots = availability.teacherSlots || [];
  const studentSlots = availability.studentSlots || [];
  if (role === 'familia') return {
    targetLabel: 'profesor',
    targetSlots: teacherSlots,
    ownLabel: 'alumno',
    ownSlots: studentSlots,
  };
  if (role === 'profesor') return {
    targetLabel: 'alumno',
    targetSlots: studentSlots,
    ownLabel: 'profesor',
    ownSlots: teacherSlots,
  };
  return {
    targetLabel: 'ambas partes',
    targetSlots: [...teacherSlots, ...studentSlots],
    ownLabel: 'agenda',
    ownSlots: [],
  };
}

function defaultScheduleWeekday(availability = {}, role = '') {
  const roleContext = availabilityForRole(role, availability);
  const preferredSlot = roleContext.targetSlots?.[0] || roleContext.ownSlots?.[0];
  const slotDay = normalizeScheduleWeekdayIndex(preferredSlot?.dia_semana ?? preferredSlot?.dayIndex);
  return Number.isInteger(slotDay) ? slotDay : todayWeekdayIndex();
}

function focusSchedulePrimaryField(panel) {
  panel?.querySelector('[data-schedule-weekday], [data-schedule-date], [data-schedule-start]')?.focus();
}

function readScheduleDraft(panel) {
  const form = panel?.querySelector('[data-schedule-form]');
  if (!form) return {};
  return {
    kind: form.querySelector('[data-schedule-kind]')?.value || '',
    weekday: form.querySelector('[data-schedule-weekday]')?.value || '',
    date: form.querySelector('[data-schedule-date]')?.value || '',
    start: form.querySelector('[data-schedule-start]')?.value || '',
    end: form.querySelector('[data-schedule-end]')?.value || '',
    modality: form.querySelector('[data-schedule-modality]')?.value || '',
    notes: form.querySelector('[data-schedule-notes]')?.value || '',
  };
}

function renderAvailabilitySummary(availability = {}, role = '') {
  if (availability.loading) {
    return '<div class="schedule-availability-note">Cargando disponibilidad de la asignacion...</div>';
  }
  if (availability.error) {
    return `<div class="schedule-availability-note warning">${escapeHtml(availability.error)}</div>`;
  }

  const teacherSummary = summarizeAvailabilitySlots(availability.teacherSlots || []);
  const studentSummary = summarizeAvailabilitySlots(availability.studentSlots || []);
  const busySummary = summarizeBusySlots(availability.busySlots || [], 3);
  const roleContext = availabilityForRole(role, availability);
  const targetMissing = role !== 'admin' && !roleContext.targetSlots.length;
  const ownMissing = role !== 'admin' && !roleContext.ownSlots.length;
  const ownSection = role === 'profesor' ? 'disponibilidad' : role === 'familia' ? 'alumnos' : '';
  const statusClass = targetMissing ? 'warning' : 'success';
  const statusText = targetMissing
    ? `Falta disponibilidad del ${roleContext.targetLabel}; no se puede proponer horario todavia.`
    : `Las propuestas deben estar dentro de las franjas del ${roleContext.targetLabel} y fuera de horas ya ocupadas.`;

  return `
    <div class="schedule-availability-summary ${statusClass}">
      <div class="schedule-availability-status">${escapeHtml(statusText)}</div>
      <div class="schedule-availability-grid">
        <div><span>Profesor</span><strong>${escapeHtml(teacherSummary || 'Sin franjas marcadas')}</strong></div>
        <div><span>Alumno</span><strong>${escapeHtml(studentSummary || 'Sin franjas marcadas')}</strong></div>
        <div class="schedule-availability-busy"><span>Ocupado</span><strong>${escapeHtml(busySummary || 'Sin clases confirmadas en conflicto')}</strong></div>
      </div>
      ${ownMissing && ownSection ? `
        <div class="schedule-availability-action">
          <span>Completa tus franjas para que el horario salga a la primera.</span>
          <button class="btn btn-ghost btn-sm" type="button" data-open-dashboard-section="${ownSection}">Marcar disponibilidad</button>
        </div>` : ''}
    </div>`;
}

function renderShell(container, role) {
  container.innerHTML = `
    <div class="chat-layout" data-chat-layout>
      <aside class="chat-list-panel">
        <div class="chat-panel-header">
          <div>
            <div class="chat-title">Chat</div>
            <div class="chat-subtitle">Conversaciones de asignaciones activas</div>
          </div>
        </div>
        <div class="chat-tabs">
          <button type="button" class="chat-tab active" data-chat-tab="chats">Chats</button>
          <button type="button" class="chat-tab" data-chat-tab="notificaciones">Notificaciones <span data-notification-count></span></button>
        </div>
        <div class="chat-list" data-chat-list></div>
      </aside>
      <section class="chat-thread-panel" data-chat-panel="chats">
        <div class="chat-thread-header" data-chat-header>
          <div class="chat-empty-title">Selecciona una conversacion</div>
          <div class="chat-empty-subtitle">Solo aparecen chats de asignaciones activas.</div>
        </div>
        <div class="chat-messages" data-chat-messages></div>
        <section class="chat-schedule-panel" data-chat-schedule-panel style="display:none"></section>
        <form class="chat-compose" data-chat-form style="display:none">
          <textarea class="form-control" data-chat-input rows="2" maxlength="2000" aria-label="Escribe un mensaje" placeholder="Escribe un mensaje..."></textarea>
          <button class="btn btn-primary" type="submit">Enviar</button>
        </form>
      </section>
      <section class="chat-thread-panel notifications-panel" data-chat-panel="notificaciones" style="display:none">
        <div class="chat-thread-header">
          <div>
            <div class="chat-thread-title">Notificaciones</div>
            <div class="chat-thread-subtitle">Avisos importantes de Admin y Sistema. En movil/PWA puedes activar avisos fuera de la app.</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
            <button class="btn btn-ghost btn-sm" type="button" data-chat-open-panel="chats">Ver chats</button>
            <button class="btn btn-ghost btn-sm" type="button" data-enable-browser-notifications>Activar avisos en este dispositivo</button>
            <button class="btn btn-ghost btn-sm" type="button" data-mark-all-notifications>Marcar revisadas</button>
          </div>
        </div>
        <form class="admin-notification-form" data-admin-notification-form style="${role === 'admin' ? '' : 'display:none'}">
          <select class="form-control" data-admin-notification-target aria-label="Destinatarios">
            <option value="todos">Todos</option>
            <option value="familia">Familias</option>
            <option value="profesor">Profesores</option>
            <option value="alumno">Alumnos</option>
            <option value="admin">Admins</option>
          </select>
          <input class="form-control" type="text" maxlength="120" data-admin-notification-title placeholder="Titulo">
          <textarea class="form-control" rows="2" maxlength="800" data-admin-notification-body placeholder="Mensaje"></textarea>
          <button class="btn btn-primary btn-sm" type="submit">Enviar aviso</button>
        </form>
        <form class="notification-settings-form" data-notification-settings-form style="${role === 'admin' ? '' : 'display:none'}">
          <div class="notification-settings-grid">
            <label><input type="checkbox" data-notification-setting="enabled"> Sistema activo</label>
            <label><input type="checkbox" data-notification-channel="internal"> Internas</label>
            <label><input type="checkbox" data-notification-channel="browser"> Navegador</label>
            <label><input type="checkbox" data-notification-channel="push"> Push PWA</label>
            <label><input type="checkbox" data-notification-event="class_unmarked_after_1h"> Clases sin marcar</label>
            <label><input type="checkbox" data-notification-event="class_confirmation_needed"> Confirmaciones</label>
            <label><input type="checkbox" data-notification-event="weekly_payment_due"> Pagos semana</label>
            <label><input type="checkbox" data-notification-event="chat_message"> Mensajes</label>
            <label><input type="checkbox" data-notification-event="verification_pending"> Verificaciones</label>
            <label><input type="checkbox" data-notification-event="request_created"> Solicitudes</label>
          </div>
          <div class="notification-settings-actions">
            <input class="form-control" type="text" maxlength="300" data-notification-vapid-key placeholder="Clave publica FCM/VAPID">
            <button class="btn btn-ghost btn-sm" type="submit">Guardar configuracion</button>
          </div>
        </form>
        <div class="notifications-list" data-notifications-list>
          <div class="chat-empty-state">Cargando notificaciones...</div>
        </div>
      </section>
    </div>`;
}

function renderSchedulePanelLegacy(container, chat, proposals, role, currentActorIds = new Set(), availability = {}) {
  const panel = container.querySelector('[data-chat-schedule-panel]');
  if (!panel || !chat) return;
  panel.style.display = '';
  const activeProposal = proposals.find((proposal) => proposal.status === 'propuesta');
  const accepted = proposals.find((proposal) => proposal.status === 'aceptada');
  const roleAvailability = availabilityForRole(role, availability);
  const proposalDisabled = role !== 'admin' && (availability.loading || !roleAvailability.targetSlots.length);
  const disabledAttr = proposalDisabled ? 'disabled' : '';
  const proposalRows = proposals.length
    ? proposals.map((proposal) => {
      const mine = currentActorIds.has(clean(proposal.proposedByUid, 180)) || (role !== 'admin' && proposal.proposedByRole === role);
      const canRespond = proposal.status === 'propuesta' && (role === 'admin' || !mine);
      const statusLabel = proposal.status === 'aceptada' ? 'Aceptada'
        : proposal.status === 'rechazada' ? 'Rechazada'
          : proposal.status === 'cancelada' ? 'Cancelada'
            : 'Pendiente';
      return `
        <article class="schedule-proposal ${proposal.status === 'propuesta' ? 'active' : ''}" data-schedule-proposal-id="${escapeHtml(proposal.id)}">
          <div>
            <strong>${escapeHtml(formatDate(proposal.fecha))} · ${escapeHtml(proposal.hora_inicio)}-${escapeHtml(proposal.hora_fin)}</strong>
            <div>${escapeHtml(proposal.materia || chat.materia || 'Clase')} · ${escapeHtml(proposal.modalidad || 'online/presencial por acordar')}</div>
            ${proposal.availabilityStatus === 'matched' ? '<small class="schedule-availability-ok">Disponibilidad validada</small>' : ''}
            ${proposal.notas ? `<small>${escapeHtml(proposal.notas)}</small>` : ''}
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
            <span class="badge ${proposal.status === 'aceptada' ? 'badge-success' : proposal.status === 'rechazada' ? 'badge-danger' : 'badge-warning'}">${statusLabel}</span>
            ${canRespond ? '<button class="btn btn-primary btn-sm" type="button" data-accept-schedule>Aceptar y crear clase</button><button class="btn btn-ghost btn-sm" type="button" data-reject-schedule>Rechazar</button>' : ''}
            ${proposal.status === 'propuesta' && mine ? '<span class="badge badge-info">Esperando respuesta</span>' : ''}
          </div>
        </article>`;
    }).join('')
    : '<div class="chat-empty-state">Aun no hay horarios propuestos.</div>';

  panel.innerHTML = `
    <div class="chat-schedule-header">
      <div>
        <div class="chat-thread-title">Coordinar primera clase</div>
        <div class="chat-thread-subtitle">${accepted ? 'Ya hay una clase creada desde el chat.' : activeProposal ? 'Hay una propuesta pendiente de respuesta.' : 'Propón fecha y hora para convertir el acuerdo en clase programada.'}</div>
      </div>
    </div>
    ${renderAvailabilitySummary(availability, role)}
    <form class="chat-schedule-form" data-schedule-form>
      <input class="form-control" type="date" data-schedule-date required aria-label="Fecha de clase" ${disabledAttr}>
      <input class="form-control" type="time" data-schedule-start required aria-label="Hora de inicio" ${disabledAttr}>
      <input class="form-control" type="time" data-schedule-end required aria-label="Hora de fin" ${disabledAttr}>
      <select class="form-control" data-schedule-modality aria-label="Modalidad" ${disabledAttr}>
        <option value="por_acordar">Modalidad por acordar</option>
        <option value="online">Online</option>
        <option value="presencial">Presencial</option>
      </select>
      <input class="form-control" type="text" maxlength="300" data-schedule-notes placeholder="Notas: lugar, material, frecuencia..." ${disabledAttr}>
      <button class="btn btn-primary btn-sm" type="submit" ${disabledAttr}>Proponer horario</button>
    </form>
    <div class="schedule-proposal-list">${proposalRows}</div>`;
}

function renderSchedulePanel(container, chat, proposals, role, currentActorIds = new Set(), availability = {}) {
  const panel = container.querySelector('[data-chat-schedule-panel]');
  if (!panel || !chat) return;
  panel.style.display = '';
  const plannerOpen = panel.dataset.schedulePlannerOpen === 'true';
  const draft = readScheduleDraft(panel);
  const selectedKind = normalizeScheduleKind(draft.kind || panel.dataset.scheduleKind || SCHEDULE_KIND_WEEKLY);
  panel.dataset.scheduleKind = selectedKind;
  panel.classList.toggle('is-open', plannerOpen);
  const activeProposal = proposals.find((proposal) => proposal.status === 'propuesta');
  const accepted = proposals.find((proposal) => proposal.status === 'aceptada');
  const acceptedRecurring = proposals.find((proposal) => proposal.status === 'aceptada' && isWeeklyRecurringProposal(proposal));
  const pendingRecurring = proposals.find((proposal) => proposal.status === 'propuesta' && isWeeklyRecurringProposal(proposal));
  const roleAvailability = availabilityForRole(role, availability);
  const proposalDisabled = role !== 'admin' && (availability.loading || !roleAvailability.targetSlots.length);
  const disabledAttr = proposalDisabled ? 'disabled' : '';
  const isMine = (proposal) => currentActorIds.has(clean(proposal.proposedByUid, 180)) || (role !== 'admin' && proposal.proposedByRole === role);
  const proposalRows = proposals.length
    ? proposals.map((proposal) => {
      const mine = isMine(proposal);
      const canRespond = proposal.status === 'propuesta' && (role === 'admin' || !mine);
      const statusLabel = proposal.status === 'aceptada' ? 'Aceptada'
        : proposal.status === 'rechazada' ? 'Rechazada'
          : proposal.status === 'cancelada' ? 'Cancelada'
            : 'Pendiente';
      return `
        <article class="schedule-proposal ${proposal.status === 'propuesta' ? 'active' : ''}" data-schedule-proposal-id="${escapeHtml(proposal.id)}">
          <div>
            <strong>${escapeHtml(scheduleKindLabel(proposalScheduleKind(proposal)))} - ${escapeHtml(scheduleProposalDisplayLabel(proposal))}</strong>
            <div>${escapeHtml(proposal.materia || chat.materia || 'Clase')} - ${escapeHtml(proposal.modalidad || 'online/presencial por acordar')}</div>
            ${proposal.availabilityStatus === 'matched' ? '<small class="schedule-availability-ok">Disponibilidad validada</small>' : ''}
            ${proposal.notas ? `<small>${escapeHtml(proposal.notas)}</small>` : ''}
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
            <span class="badge ${proposal.status === 'aceptada' ? 'badge-success' : proposal.status === 'rechazada' ? 'badge-danger' : 'badge-warning'}">${statusLabel}</span>
            ${canRespond ? '<button class="btn btn-primary btn-sm" type="button" data-accept-schedule>Aceptar y crear clase</button><button class="btn btn-ghost btn-sm" type="button" data-reject-schedule>Rechazar</button>' : ''}
            ${proposal.status === 'propuesta' && mine ? '<span class="badge badge-info">Esperando respuesta</span>' : ''}
          </div>
        </article>`;
    }).join('')
    : '<div class="chat-empty-state">Aun no hay horarios propuestos.</div>';

  const summary = acceptedRecurring
    ? escapeHtml(scheduleProposalDisplayLabel(acceptedRecurring))
    : pendingRecurring
      ? 'Horario semanal pendiente de respuesta.'
      : accepted
        ? 'Hay una clase puntual creada desde el acuerdo.'
      : activeProposal
        ? 'Hay una propuesta puntual pendiente de respuesta.'
        : 'Acordad un horario semanal fijo y usad clases puntuales solo como excepcion.';
  const activeProposalMine = activeProposal ? isMine(activeProposal) : false;
  const canRespondActiveProposal = activeProposal && (role === 'admin' || !activeProposalMine);
  const summaryActions = canRespondActiveProposal
    ? `
        <button class="btn btn-primary btn-sm" type="button" data-focus-active-proposal>Responder propuesta</button>
        <button class="btn btn-ghost btn-sm" type="button" data-open-schedule-planner="${SCHEDULE_KIND_ONE_OFF}">Proponer alternativa</button>`
    : proposalDisabled && !plannerOpen
      ? `<button class="btn btn-primary btn-sm" type="button" data-open-schedule-planner="${SCHEDULE_KIND_WEEKLY}">Ver disponibilidad</button>`
      : `
        <button class="btn btn-primary btn-sm" type="button" data-open-schedule-planner="${SCHEDULE_KIND_WEEKLY}">${acceptedRecurring ? 'Cambiar semanal' : 'Proponer semanal'}</button>
        <button class="btn btn-ghost btn-sm" type="button" data-open-schedule-planner="${SCHEDULE_KIND_ONE_OFF}">Clase puntual</button>`;
  const visibleProposalList = !plannerOpen && proposals.length
    ? `<div class="schedule-proposal-list chat-schedule-visible-proposals">${proposalRows}</div>`
    : '';
  const dateOrWeekdayControl = selectedKind === SCHEDULE_KIND_WEEKLY
    ? `<select class="form-control" data-schedule-weekday required aria-label="Dia semanal" ${disabledAttr}>
        ${weekdayOptions(draft.weekday || defaultScheduleWeekday(availability, role))}
      </select>`
    : `<input class="form-control" type="date" data-schedule-date required aria-label="Fecha de clase puntual" value="${escapeHtml(draft.date)}" ${disabledAttr}>`;
  const modalityValue = clean(draft.modality, 40) || 'por_acordar';

  panel.innerHTML = `
    <div class="chat-schedule-summary">
      <div>
        <div class="chat-thread-title">Horario de clases</div>
        <div class="chat-thread-subtitle">${summary}</div>
      </div>
      <div class="chat-schedule-actions">
        ${summaryActions}
        ${plannerOpen ? '<button class="btn btn-ghost btn-sm" type="button" data-close-schedule-planner>Cerrar</button>' : ''}
      </div>
    </div>
    ${visibleProposalList}
    ${plannerOpen ? `
      <div class="chat-schedule-planner">
        ${renderAvailabilitySummary(availability, role)}
        <form class="chat-schedule-form" data-schedule-form>
          <select class="form-control" data-schedule-kind aria-label="Tipo de clase" ${disabledAttr}>
            <option value="${SCHEDULE_KIND_WEEKLY}" ${selectedKind === SCHEDULE_KIND_WEEKLY ? 'selected' : ''}>Semanal fija</option>
            <option value="${SCHEDULE_KIND_ONE_OFF}" ${selectedKind === SCHEDULE_KIND_ONE_OFF ? 'selected' : ''}>Puntual</option>
          </select>
          ${dateOrWeekdayControl}
          <input class="form-control" type="time" data-schedule-start required aria-label="Hora de inicio" value="${escapeHtml(draft.start)}" ${disabledAttr}>
          <input class="form-control" type="time" data-schedule-end required aria-label="Hora de fin" value="${escapeHtml(draft.end)}" ${disabledAttr}>
          <select class="form-control" data-schedule-modality aria-label="Modalidad" ${disabledAttr}>
            <option value="por_acordar" ${modalityValue === 'por_acordar' ? 'selected' : ''}>Modalidad por acordar</option>
            <option value="online" ${modalityValue === 'online' ? 'selected' : ''}>Online</option>
            <option value="presencial" ${modalityValue === 'presencial' ? 'selected' : ''}>Presencial</option>
          </select>
          <input class="form-control" type="text" maxlength="300" data-schedule-notes placeholder="Notas: lugar, material, excepcion..." value="${escapeHtml(draft.notes)}" ${disabledAttr}>
          <button class="btn btn-primary btn-sm" type="submit" ${disabledAttr}>Proponer</button>
        </form>
        <div class="schedule-proposal-list">${proposalRows}</div>
      </div>` : ''}`;
}

function renderChatList(container, chats, selectedId, role, preferences = {}) {
  const list = container.querySelector('[data-chat-list]');
  if (!chats.length) {
    list.innerHTML = '<div class="chat-empty-state">No hay chats disponibles. Apareceran cuando exista una asignacion activa.</div>';
    return;
  }
  list.innerHTML = chats.map((chat) => `
    <button class="chat-list-item ${chat.id === selectedId ? 'active' : ''}" type="button" data-chat-id="${escapeHtml(chat.id)}">
      <span class="chat-list-name">${escapeHtml(chatTitle(chat, role, preferences[chat.id] || {}))}</span>
      <span class="chat-list-meta">${escapeHtml(chatSubtitle(chat, role, preferences[chat.id] || {}))}</span>
      <span class="chat-list-preview">${escapeHtml(chat.lastMessage || 'Sin mensajes todavia')}</span>
    </button>`).join('');
}

function renderThreadHeader(container, chat, role, preference = {}) {
  const header = container.querySelector('[data-chat-header]');
  if (!chat) return;
  const customName = clean(preference.displayNameOverride, 120);
  header.innerHTML = `
    <div class="chat-thread-heading">
      <div class="chat-thread-title">${escapeHtml(chatTitle(chat, role, preference))}</div>
      <div class="chat-thread-subtitle">${escapeHtml(chatSubtitle(chat, role, preference))}</div>
    </div>
    <form class="chat-alias-form" data-chat-name-form hidden>
      <input class="form-control" type="text" maxlength="120" value="${escapeHtml(customName)}" data-chat-name-input aria-label="Nombre guardado para este chat" placeholder="${escapeHtml(defaultChatTitle(chat, role))}">
      <button class="btn btn-primary btn-sm" type="submit">Guardar</button>
    </form>
    <button class="btn btn-ghost btn-sm chat-alias-toggle" type="button" data-edit-chat-name>${customName ? 'Cambiar nombre' : 'Personalizar nombre'}</button>`;
}

function renderMessages(container, messages, currentUid) {
  const box = container.querySelector('[data-chat-messages]');
  const hadMessages = Boolean(box.querySelector('.chat-message'));
  const distanceFromBottom = box.scrollHeight - box.scrollTop - box.clientHeight;
  const shouldStickToBottom = !hadMessages || distanceFromBottom < 120;
  const previousScrollTop = box.scrollTop;
  if (!messages.length) {
    box.innerHTML = '<div class="chat-empty-state">Todavia no hay mensajes. Escribe el primero para coordinar la clase.</div>';
    return;
  }
  box.innerHTML = messages.map((message) => {
    const mine = message.senderUid === currentUid;
    return `
      <div class="chat-message ${mine ? 'mine' : ''}">
        <div class="chat-message-meta">${escapeHtml(message.senderName || message.senderRole || 'Usuario')} · ${escapeHtml(formatDateTime(message.createdAt))}</div>
        <div class="chat-message-body">${escapeHtml(message.body)}</div>
      </div>`;
  }).join('');
  box.scrollTop = shouldStickToBottom ? box.scrollHeight : previousScrollTop;
}

function notificationTitle(notification) {
  return notification.title || notification.titulo || 'Notificacion';
}

function notificationBody(notification) {
  return notification.body || notification.cuerpo || '';
}

function isNotificationUnread(notification) {
  return !notification.readAt && notification.leida !== true;
}

function notificationPriorityLabel(priority) {
  const normalized = clean(priority, 40).toLowerCase();
  if (normalized === 'critical' || normalized === 'critica') return 'critica';
  if (normalized === 'high' || normalized === 'alta') return 'alta';
  if (normalized === 'medium' || normalized === 'media') return 'media';
  return '';
}

function notificationSourceLabel(notification = {}) {
  const source = clean(notification.source || notification.origin || '', 80).toLowerCase();
  const actorRole = clean(notification.createdByRole || notification.senderRole || notification.actorRole || '', 80).toLowerCase();
  const type = clean(notification.type, 80);
  if (source === 'admin' || actorRole === 'admin' || type === 'admin_manual') return 'Admin';
  return 'Sistema';
}

function notificationDisplayKey(notification) {
  const date = normalizeDate(notification.createdAt).slice(0, 16);
  return [
    notification.type || '',
    notificationTitle(notification),
    notificationBody(notification),
    date,
  ].map((value) => clean(value, 220)).join('|');
}

function notificationDisplayItems(notifications = []) {
  const byKey = new Map();
  notifications.forEach((notification) => {
    const key = notificationDisplayKey(notification);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, { ...notification, duplicateCount: 1 });
      return;
    }
    const keepNext = isNotificationUnread(notification) && !isNotificationUnread(current);
    byKey.set(key, {
      ...(keepNext ? notification : current),
      duplicateCount: (current.duplicateCount || 1) + 1,
    });
  });
  return [...byKey.values()];
}

function dashboardSectionForNotification(notification, role = '') {
  const type = clean(notification.type, 80);
  const payload = notification.payload || {};
  if (payload.chatId || ['chat_message', 'schedule_proposed', 'schedule_accepted', 'schedule_rejected'].includes(type)) {
    return { section: 'chat', panel: 'chats', chatId: clean(payload.chatId, 180), label: 'Abrir chat' };
  }
  if (payload.classId || type.startsWith('class_')) {
    return { section: type === 'class_reminder' || type === 'class_schedule_change' ? 'calendario' : 'clases', label: 'Revisar clase' };
  }
  if (payload.paymentId || type.includes('payment') || type.includes('payout')) {
    return { section: role === 'profesor' ? 'ingresos' : 'pagos', label: role === 'profesor' ? 'Ver ingresos' : 'Ver pagos' };
  }
  if (payload.documentId || type.startsWith('document_') || type === 'verification_pending') {
    return { section: 'documentos', label: 'Ver documentos' };
  }
  if (payload.requestId || type.startsWith('request_') || type === 'assignment_created') {
    return { section: role === 'profesor' ? 'alumnos' : 'solicitudes', label: role === 'profesor' ? 'Ver alumnos' : 'Ver solicitud' };
  }
  if (payload.incidentId || type.includes('incident')) {
    return { section: role === 'admin' ? 'incidencias' : 'chat', panel: role === 'admin' ? '' : 'notificaciones', label: role === 'admin' ? 'Ver incidencia' : 'Ver aviso' };
  }
  if (type === 'teacher_verified' || type === 'profile_updated' || payload.profileId || payload.teacherId) {
    return { section: role === 'admin' ? 'profesores' : 'perfil', label: role === 'admin' ? 'Ver perfil' : 'Mi perfil' };
  }
  return null;
}

function notificationExternalAction(notification) {
  const url = notificationActionUrl(notification);
  if (!url || /\/pages\/login(?:\.html)?$/i.test(url)) return null;
  return { url, label: 'Abrir enlace' };
}

function notificationAction(notification, role = '') {
  return dashboardSectionForNotification(notification, role) || notificationExternalAction(notification);
}

function renderNotifications(container, notifications) {
  const list = container.querySelector('[data-notifications-list]');
  const count = notifications.filter(isNotificationUnread).length;
  const countNode = container.querySelector('[data-notification-count]');
  if (countNode) {
    countNode.textContent = count > 0 ? count : '';
    countNode.style.display = count > 0 ? '' : 'none';
  }
  if (!list) return;

  if (!notifications.length) {
    list.innerHTML = '<div class="chat-empty-state">Sin notificaciones pendientes. Te avisaremos aqui cuando haya algo importante.</div>';
    return;
  }

  list.innerHTML = notificationDisplayItems(notifications).map((notification) => {
    const unread = isNotificationUnread(notification);
    const priority = notificationPriorityClass(notification);
    const priorityLabel = notificationPriorityLabel(priority);
    const label = `${notificationSourceLabel(notification)} - ${notificationCategoryLabel(notification.type)}`;
    const action = notificationAction(notification, container.dataset.chatRole || '');
    const meta = [
      formatDateTime(notification.createdAt),
      unread ? 'Pendiente' : 'Revisada',
      notification.duplicateCount > 1 ? `${notification.duplicateCount} avisos iguales agrupados` : '',
    ].filter(Boolean).join(' · ');
    return `
      <article class="notification-item ${unread ? 'unread' : ''} priority-${escapeHtml(priority)}" data-notification-id="${escapeHtml(notification.id)}">
        <div>
          <div class="notification-kicker">${escapeHtml(label)}${priorityLabel ? ` · ${escapeHtml(priorityLabel)}` : ''}${unread ? ' · nueva' : ''}</div>
          <div class="notification-title">${escapeHtml(notificationTitle(notification))}</div>
          <div class="notification-body">${escapeHtml(notificationBody(notification))}</div>
          <div class="notification-meta">${escapeHtml(meta)}</div>
        </div>
        <div class="notification-actions">
          ${action ? `<button class="btn btn-primary btn-sm" type="button" data-open-notification>${escapeHtml(action.label)}</button>` : ''}
          ${unread ? '<button class="btn btn-ghost btn-sm" type="button" data-mark-notification>Marcar revisada</button>' : ''}
        </div>
      </article>`;
  }).join('');
}

function renderNotificationSettings(container, settings, publicConfig = {}) {
  const form = container.querySelector('[data-notification-settings-form]');
  if (!form) return;
  const merged = mergeNotificationSettings(settings || DEFAULT_NOTIFICATION_SETTINGS);
  const enabled = form.querySelector('[data-notification-setting="enabled"]');
  if (enabled) enabled.checked = merged.enabled !== false;
  form.querySelectorAll('[data-notification-channel]').forEach((input) => {
    input.checked = merged.channels?.[input.dataset.notificationChannel] !== false;
  });
  form.querySelectorAll('[data-notification-event]').forEach((input) => {
    input.checked = merged.eventTypes?.[input.dataset.notificationEvent] !== false;
  });
  const vapid = form.querySelector('[data-notification-vapid-key]');
  if (vapid) vapid.value = publicConfig.fcmVapidKey || publicConfig.vapidKey || '';
}

function readNotificationSettingsForm(form, currentSettings) {
  const merged = mergeNotificationSettings(currentSettings || DEFAULT_NOTIFICATION_SETTINGS);
  const enabled = form.querySelector('[data-notification-setting="enabled"]');
  const channels = { ...merged.channels };
  const eventTypes = { ...merged.eventTypes };
  form.querySelectorAll('[data-notification-channel]').forEach((input) => {
    channels[input.dataset.notificationChannel] = input.checked;
  });
  form.querySelectorAll('[data-notification-event]').forEach((input) => {
    eventTypes[input.dataset.notificationEvent] = input.checked;
  });
  return {
    settings: {
      ...merged,
      enabled: enabled ? enabled.checked : merged.enabled,
      channels,
      eventTypes,
    },
    publicConfig: {
      fcmVapidKey: clean(form.querySelector('[data-notification-vapid-key]')?.value, 300),
    },
  };
}

export async function initChatWidget({
  container,
  db,
  usuario,
  role,
  profileId,
  showToast = () => {},
}) {
  if (!container) return;
  renderShell(container, role);
  container.dataset.chatRole = role;

  const state = {
    chats: [],
    notifications: [],
    notificationsReady: false,
    lastUnreadCount: 0,
    selectedChat: null,
    unsubscribe: null,
    unsubscribeProposals: null,
    unsubscribeNotifications: null,
    unsubscribePushMessages: null,
    unsubscribeAuth: null,
    disposed: false,
    notificationSettings: DEFAULT_NOTIFICATION_SETTINGS,
    notificationPublicConfig: {},
    availabilityByChat: {},
    chatPreferencesById: {},
  };
  const currentUid = clean(firebaseAuth.currentUser?.uid || usuario.firebase_uid || usuario.uid || usuario.id, 180);
  const currentActorIds = new Set([
    currentUid,
    usuario.uid,
    usuario.firebase_uid,
    usuario.id,
    profileId,
  ].map((value) => clean(value, 180)).filter(Boolean));
  const senderName = fullName(usuario.nombre, usuario.apellidos) || usuario.email || role;

  function disposeRealtimeListeners() {
    state.disposed = true;
    [
      'unsubscribe',
      'unsubscribeProposals',
      'unsubscribeNotifications',
      'unsubscribePushMessages',
    ].forEach((key) => {
      if (typeof state[key] === 'function') {
        state[key]();
        state[key] = null;
      }
    });
  }

  function disposeWidget() {
    disposeRealtimeListeners();
    if (typeof state.unsubscribeAuth === 'function') {
      state.unsubscribeAuth();
      state.unsubscribeAuth = null;
    }
  }

  function isCurrentSessionActive() {
    const activeUid = clean(firebaseAuth.currentUser?.uid, 180);
    return Boolean(activeUid && activeUid === currentUid && !state.disposed);
  }

  function handleRealtimeError(label, fallbackTitle, fallbackBody, error) {
    if (!isCurrentSessionActive()) return;
    console.error(label, error);
    showToast(fallbackTitle, error.message || fallbackBody, 'error');
  }

  state.unsubscribeAuth = onAuthStateChanged(firebaseAuth, (user) => {
    if (!user || clean(user.uid, 180) !== currentUid) disposeRealtimeListeners();
  });
  window.addEventListener('pagehide', disposeWidget, { once: true });

  async function sendAdminNotification(targetRole, title, body) {
    if (role !== 'admin') return 0;
    return createAdminNotification({ targetRole, title, body, currentUid });
  }

  async function addSystemChatMessage(chat, body) {
    const chatRef = doc(firebaseDb, 'chats', chat.id);
    await addDoc(collection(chatRef, 'mensajes'), {
      senderUid: currentUid,
      senderRole: role,
      senderName,
      body,
      createdAt: serverTimestamp(),
      readBy: { [currentUid]: true },
    });
    await updateDoc(chatRef, {
      lastMessage: body.slice(0, 180),
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async function refreshChats() {
    container.querySelector('[data-chat-list]').innerHTML = '<div class="chat-empty-state">Cargando chats...</div>';
    state.chats = await loadChats(db, role, profileId, usuario, currentActorIds);
    state.chatPreferencesById = await loadChatPreferences(state.chats, currentUid);
    renderChatList(container, state.chats, state.selectedChat?.id, role, state.chatPreferencesById);
    if (!state.selectedChat && state.chats.length) selectChat(state.chats[0].id);
  }

  function selectChat(chatId) {
    const chat = state.chats.find((item) => item.id === chatId);
    if (!chat) return;
    state.selectedChat = chat;
    renderChatList(container, state.chats, chat.id, role, state.chatPreferencesById);
    renderThreadHeader(container, chat, role, state.chatPreferencesById[chat.id] || {});
    container.querySelector('[data-chat-form]').style.display = '';
    const schedulePanel = container.querySelector('[data-chat-schedule-panel]');
    if (schedulePanel) {
      schedulePanel.dataset.schedulePlannerOpen = 'false';
      schedulePanel.dataset.scheduleKind = SCHEDULE_KIND_WEEKLY;
    }
    state.scheduleProposals = [];
    state.availabilityByChat[chat.id] = { loading: true, teacherSlots: [], studentSlots: [] };
    renderSchedulePanel(container, chat, state.scheduleProposals, role, currentActorIds, state.availabilityByChat[chat.id]);

    loadChatAvailability(chat, currentUid, role).then((availability) => {
      if (state.selectedChat?.id !== chat.id) return;
      state.availabilityByChat[chat.id] = availability;
      renderSchedulePanel(container, chat, state.scheduleProposals || [], role, currentActorIds, availability);
    }).catch((error) => {
      if (state.selectedChat?.id !== chat.id) return;
      state.availabilityByChat[chat.id] = {
        loading: false,
        teacherSlots: [],
        studentSlots: [],
        error: error.message || 'No se pudo cargar la disponibilidad.',
      };
      renderSchedulePanel(container, chat, state.scheduleProposals || [], role, currentActorIds, state.availabilityByChat[chat.id]);
    });

    if (state.unsubscribe) state.unsubscribe();
    if (state.unsubscribeProposals) state.unsubscribeProposals();
    const messagesQuery = query(
      collection(firebaseDb, 'chats', chat.id, 'mensajes'),
      orderBy('createdAt', 'asc'),
      limit(100),
    );
    state.unsubscribe = onSnapshot(messagesQuery, (snap) => {
      if (!isCurrentSessionActive()) return;
      renderMessages(container, snap.docs.map((item) => ({ id: item.id, ...item.data() })), currentUid);
    }, (error) => {
      handleRealtimeError('No se pudo abrir el chat', 'Chat no disponible', 'No se pudo abrir la conversacion.', error);
    });

    const proposalsQuery = query(
      collection(firebaseDb, 'chats', chat.id, 'programaciones'),
      orderBy('createdAt', 'desc'),
      limit(20),
    );
    state.unsubscribeProposals = onSnapshot(proposalsQuery, (snap) => {
      if (!isCurrentSessionActive()) return;
      state.scheduleProposals = snap.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((proposal) => !isAcceptedScheduleProposal(proposal) || isAfterClassReset(proposal));
      renderSchedulePanel(container, chat, state.scheduleProposals, role, currentActorIds, state.availabilityByChat[chat.id] || { loading: true });
    }, (error) => {
      handleRealtimeError('No se pudieron abrir propuestas de horario', 'Horarios no disponibles', 'No se pudieron abrir las propuestas.', error);
    });
  }

  function setPanel(panel) {
    container.querySelectorAll('[data-chat-tab]').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.chatTab === panel);
    });
    container.querySelectorAll('[data-chat-panel]').forEach((panelNode) => {
      panelNode.style.display = panelNode.dataset.chatPanel === panel ? '' : 'none';
    });
    container.querySelector('[data-chat-layout]')?.classList.toggle('chat-layout-notifications', panel === 'notificaciones');
  }

  function navigateDashboardSection(section) {
    const target = clean(section, 80);
    if (!target) return false;
    const trigger = [...document.querySelectorAll('.sidebar-link[data-section]')]
      .find((item) => item.dataset.section === target);
    if (trigger) {
      trigger.click();
      return true;
    }
    const sectionNode = document.getElementById(`section-${target}`);
    if (!sectionNode) return false;
    document.querySelectorAll('.dash-section').forEach((node) => { node.style.display = 'none'; });
    sectionNode.style.display = '';
    return true;
  }

  function openNotificationAction(notification) {
    const action = notificationAction(notification, role);
    if (!action) {
      showToast('Aviso sin destino', 'Este aviso queda como registro informativo.', 'info');
      return false;
    }
    if (action.section) {
      const navigated = navigateDashboardSection(action.section);
      if (action.section === 'chat') {
        setTimeout(() => {
          setPanel(action.panel || 'chats');
          if (action.chatId) selectChat(action.chatId);
        }, 80);
      }
      return navigated;
    }
    if (action.url) {
      window.location.href = action.url;
      return true;
    }
    return false;
  }

  container.addEventListener('click', async (event) => {
    const tab = event.target.closest('[data-chat-tab]');
    if (tab) {
      setPanel(tab.dataset.chatTab);
      return;
    }

    const openPanel = event.target.closest('[data-chat-open-panel]');
    if (openPanel) {
      setPanel(openPanel.dataset.chatOpenPanel);
      return;
    }

    const openDashboardSection = event.target.closest('[data-open-dashboard-section]');
    if (openDashboardSection) {
      navigateDashboardSection(openDashboardSection.dataset.openDashboardSection);
      return;
    }

    const focusActiveProposal = event.target.closest('[data-focus-active-proposal]');
    if (focusActiveProposal) {
      const active = container.querySelector('.schedule-proposal.active');
      active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      active?.querySelector('[data-accept-schedule], [data-reject-schedule]')?.focus();
      return;
    }

    const openSchedulePlanner = event.target.closest('[data-open-schedule-planner]');
    if (openSchedulePlanner) {
      const panel = container.querySelector('[data-chat-schedule-panel]');
      if (panel) {
        panel.dataset.schedulePlannerOpen = 'true';
        panel.dataset.scheduleKind = normalizeScheduleKind(openSchedulePlanner.dataset.openSchedulePlanner);
        renderSchedulePanel(container, state.selectedChat, state.scheduleProposals || [], role, currentActorIds, state.availabilityByChat[state.selectedChat?.id] || {});
        focusSchedulePrimaryField(panel);
      }
      return;
    }

    const closeSchedulePlanner = event.target.closest('[data-close-schedule-planner]');
    if (closeSchedulePlanner) {
      const panel = container.querySelector('[data-chat-schedule-panel]');
      if (panel) {
        panel.dataset.schedulePlannerOpen = 'false';
        renderSchedulePanel(container, state.selectedChat, state.scheduleProposals || [], role, currentActorIds, state.availabilityByChat[state.selectedChat?.id] || {});
      }
      return;
    }

    const enableNotifications = event.target.closest('[data-enable-browser-notifications]');
    if (enableNotifications) {
      requestBrowserNotificationPermission().then(async (permission) => {
        if (permission === 'granted') {
          const pushResult = await registerPushNotifications({ userUid: currentUid, role }).catch((error) => ({ ok: false, status: error.message }));
          if (pushResult.ok) showToast('Avisos activados', 'Push PWA e internos activados para este dispositivo.', 'success');
          else if (pushResult.status === 'missing_vapid_key') showToast('Avisos locales activados', 'Falta la clave publica FCM/VAPID para push en segundo plano.', 'warning');
          else showToast('Avisos activados', 'Te avisaremos mientras la app este abierta.', 'success');
        } else if (permission === 'denied') showToast('Avisos bloqueados', 'Activalos desde los ajustes del navegador si quieres recibir avisos.', 'warning');
        else showToast('Avisos no disponibles', 'Este navegador no permite notificaciones web.', 'warning');
      });
      return;
    }

    const markAll = event.target.closest('[data-mark-all-notifications]');
    if (markAll) {
      markAll.disabled = true;
      markAllNotificationsRead(state.notifications).then(() => {
        showToast('Notificaciones actualizadas', 'Todos los avisos quedan marcados como revisados.', 'success');
      }).catch((error) => {
        showToast('No se pudieron marcar', error.message || 'Revisa permisos de notificaciones.', 'error');
      }).finally(() => {
        markAll.disabled = false;
      });
      return;
    }

    const openNotification = event.target.closest('[data-open-notification]');
    if (openNotification) {
      const item = openNotification.closest('[data-notification-id]');
      const notification = state.notifications.find((entry) => entry.id === item?.dataset.notificationId);
      openNotification.disabled = true;
      if (notification?.id && isNotificationUnread(notification)) {
        markNotificationRead(notification.id).catch((error) => {
          showToast('No se pudo marcar', error.message || 'Revisa permisos de notificaciones.', 'error');
        });
      }
      openNotificationAction(notification || {});
      openNotification.disabled = false;
      return;
    }

    const markOne = event.target.closest('[data-mark-notification]');
    if (markOne) {
      const item = markOne.closest('[data-notification-id]');
      markOne.disabled = true;
      markNotificationRead(item?.dataset.notificationId).then(() => {
        showToast('Aviso revisado', 'El aviso queda guardado como revisado.', 'success');
      }).catch((error) => {
        showToast('No se pudo marcar', error.message || 'Revisa permisos de notificaciones.', 'error');
      }).finally(() => {
        markOne.disabled = false;
      });
      return;
    }

    const editChatName = event.target.closest('[data-edit-chat-name]');
    if (editChatName) {
      const form = container.querySelector('[data-chat-name-form]');
      if (!form) return;
      form.hidden = !form.hidden;
      if (!form.hidden) form.querySelector('[data-chat-name-input]')?.focus();
      return;
    }

    const item = event.target.closest('[data-chat-id]');
    if (item) {
      selectChat(item.dataset.chatId);
      return;
    }

    const accept = event.target.closest('[data-accept-schedule]');
    const reject = event.target.closest('[data-reject-schedule]');
    if (!accept && !reject) return;
    const proposalNode = event.target.closest('[data-schedule-proposal-id]');
    const proposal = state.scheduleProposals?.find((entry) => entry.id === proposalNode?.dataset.scheduleProposalId);
    if (!proposal || !state.selectedChat) return;
    if (accept) {
      acceptScheduleProposal(proposal).catch((error) => {
        console.error('No se pudo aceptar horario', error);
        showToast('No se creo la clase', error.message || 'Revisa permisos o datos de horario.', 'error');
      });
    } else {
      rejectScheduleProposal(proposal).catch((error) => {
        console.error('No se pudo rechazar horario', error);
        showToast('No se rechazo', error.message || 'Revisa permisos.', 'error');
      });
    }
  });

  window.addEventListener('cd10:open-chat-planner', (event) => {
    if (!state.selectedChat) return;
    setPanel('chats');
    const panel = container.querySelector('[data-chat-schedule-panel]');
    if (!panel) return;
    panel.dataset.schedulePlannerOpen = 'true';
    panel.dataset.scheduleKind = normalizeScheduleKind(event.detail?.kind || SCHEDULE_KIND_ONE_OFF);
    renderSchedulePanel(container, state.selectedChat, state.scheduleProposals || [], role, currentActorIds, state.availabilityByChat[state.selectedChat.id] || {});
    setTimeout(() => focusSchedulePrimaryField(panel), 50);
  });

  container.addEventListener('change', (event) => {
    const kindSelect = event.target.closest('[data-schedule-kind]');
    if (!kindSelect || !state.selectedChat) return;
    const panel = container.querySelector('[data-chat-schedule-panel]');
    if (!panel) return;
    panel.dataset.scheduleKind = normalizeScheduleKind(kindSelect.value);
    renderSchedulePanel(container, state.selectedChat, state.scheduleProposals || [], role, currentActorIds, state.availabilityByChat[state.selectedChat.id] || {});
    setTimeout(() => focusSchedulePrimaryField(panel), 0);
  });

  container.addEventListener('submit', async (event) => {
    const chatNameForm = event.target.closest('[data-chat-name-form]');
    if (chatNameForm) {
      event.preventDefault();
      if (!state.selectedChat || !currentUid) return;
      const input = chatNameForm.querySelector('[data-chat-name-input]');
      const displayNameOverride = clean(input?.value, 120);
      const existingPreference = state.chatPreferencesById[state.selectedChat.id] || {};
      const payload = {
        displayNameOverride,
        updatedAt: serverTimestamp(),
      };
      if (!existingPreference.exists) payload.createdAt = serverTimestamp();

      const button = chatNameForm.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await setDoc(doc(firebaseDb, 'chats', state.selectedChat.id, 'preferencias', currentUid), payload, { merge: true });
        state.chatPreferencesById[state.selectedChat.id] = {
          exists: true,
          displayNameOverride,
        };
        renderChatList(container, state.chats, state.selectedChat.id, role, state.chatPreferencesById);
        renderThreadHeader(container, state.selectedChat, role, state.chatPreferencesById[state.selectedChat.id] || {});
        showToast(displayNameOverride ? 'Nombre guardado' : 'Nombre restablecido', displayNameOverride ? 'Solo lo veras tu en este chat.' : 'Vuelves a ver el nombre por defecto.', 'success');
      } catch (error) {
        showToast('No se pudo guardar', error.message || 'Revisa permisos del chat.', 'error');
      } finally {
        button.disabled = false;
      }
      return;
    }

    const scheduleForm = event.target.closest('[data-schedule-form]');
    if (!scheduleForm) return;
    event.preventDefault();
    if (!state.selectedChat) return;
    const scheduleKind = normalizeScheduleKind(scheduleForm.querySelector('[data-schedule-kind]')?.value);
    const selectedWeekday = normalizeScheduleWeekdayIndex(scheduleForm.querySelector('[data-schedule-weekday]')?.value);
    const horaInicio = clean(scheduleForm.querySelector('[data-schedule-start]')?.value, 8);
    const horaFin = clean(scheduleForm.querySelector('[data-schedule-end]')?.value, 8);
    const fecha = scheduleKind === SCHEDULE_KIND_WEEKLY
      ? nextDateForWeekday(selectedWeekday, horaInicio)
      : clean(scheduleForm.querySelector('[data-schedule-date]')?.value, 20);
    const modalidad = clean(scheduleForm.querySelector('[data-schedule-modality]')?.value, 40);
    const notas = clean(scheduleForm.querySelector('[data-schedule-notes]')?.value, 300);
    if (scheduleKind === SCHEDULE_KIND_WEEKLY && !Number.isInteger(selectedWeekday)) {
      showToast('Dia no valido', 'Elige el dia de la semana de la clase fija.', 'warning');
      return;
    }
    const validation = validateClassTimeRange(fecha, horaInicio, horaFin);
    if (!validation.valid) {
      showToast('Horario no valido', scheduleKind === SCHEDULE_KIND_WEEKLY ? 'El dia semanal y la hora de fin deben ser correctos.' : 'La fecha y la hora de fin deben ser correctas.', 'warning');
      return;
    }
    const availability = state.availabilityByChat[state.selectedChat.id] || { loading: true };
    if (availability.loading && role !== 'admin') {
      showToast('Disponibilidad cargando', 'Espera unos segundos a que se carguen las franjas antes de proponer.', 'warning');
      return;
    }
    const busySlots = busySlotsForChatValidation(availability, state.scheduleProposals || [], state.selectedChat);
    const availabilityValidation = validateScheduleAvailability({
      role,
      fecha,
      horaInicio,
      horaFin,
      teacherSlots: availability.teacherSlots || [],
      studentSlots: availability.studentSlots || [],
      busySlots,
      teacherUid: state.selectedChat.teacherUid || state.selectedChat.profesor_id,
      studentId: state.selectedChat.studentId || state.selectedChat.alumno_id,
    });
    if (!availabilityValidation.valid) {
      showToast(
        availabilityValidation.reason === 'time_conflict' ? 'Horario ocupado' : 'Fuera de disponibilidad',
        availabilityValidation.message || 'El horario no encaja con las franjas marcadas.',
        'warning',
      );
      return;
    }
    const button = scheduleForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const proposal = {
        assignmentId: state.selectedChat.id,
        familyUid: state.selectedChat.familyUid || state.selectedChat.familia_id,
        teacherUid: state.selectedChat.teacherUid || state.selectedChat.profesor_id,
        studentId: state.selectedChat.studentId || state.selectedChat.alumno_id || null,
        materia: state.selectedChat.materia || '',
        kind: scheduleKind,
        scheduleKind,
        firstClassDate: fecha,
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        durationMinutes: validation.durationMinutes,
        modalidad,
        notas,
        status: 'propuesta',
        availabilityStatus: availabilityValidation.reason === 'matched' ? 'matched' : availabilityValidation.reason,
        availabilityValidation: {
          checkedByRole: role,
          checkedAt: new Date().toISOString(),
          requiredScope: availabilityValidation.requiredScope || '',
          teacherSlotId: availabilityValidation.teacherSlot?.id || '',
          teacherSlotLabel: availabilityValidation.teacherSlot ? availabilitySlotLabel(availabilityValidation.teacherSlot) : '',
          studentSlotId: availabilityValidation.studentSlot?.id || '',
          studentSlotLabel: availabilityValidation.studentSlot ? availabilitySlotLabel(availabilityValidation.studentSlot) : '',
          busySlotId: availabilityValidation.busySlot?.id || '',
          busySlotLabel: availabilityValidation.busySlot ? busySlotLabel(availabilityValidation.busySlot) : '',
        },
        proposedByUid: currentUid,
        proposedByRole: role,
        proposedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (scheduleKind === SCHEDULE_KIND_WEEKLY) {
        proposal.recurrence = {
          frequency: 'weekly',
          dayOfWeek: selectedWeekday,
          startTime: horaInicio,
          endTime: horaFin,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid',
        };
        proposal.recurrenceLabel = recurrenceLabelFromFields(selectedWeekday, horaInicio, horaFin);
      }
      await addDoc(collection(firebaseDb, 'chats', state.selectedChat.id, 'programaciones'), proposal);
      await updateDoc(doc(firebaseDb, 'chats', state.selectedChat.id), {
        schedulingStatus: 'horario_propuesto',
        relationshipStage: 'horario_propuesto',
        relationshipStatus: 'active',
        lastRelationshipEvent: 'schedule_proposed',
        relationshipUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      scheduleForm.reset();
      await addSystemChatMessage(state.selectedChat, `${scheduleKindLabel(scheduleKind)} propuesto: ${scheduleKind === SCHEDULE_KIND_WEEKLY ? recurrenceLabelFromFields(selectedWeekday, horaInicio, horaFin) : `${formatDate(fecha)} de ${horaInicio} a ${horaFin}`}.`);
      showToast('Horario propuesto', scheduleKind === SCHEDULE_KIND_WEEKLY ? 'La otra parte puede aceptar el horario semanal fijo.' : 'La otra parte puede aceptar la clase puntual.', 'success');
    } catch (error) {
      showToast('No se pudo proponer', error.message || 'Revisa permisos de chat.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  async function rejectScheduleProposal(proposal) {
    const ref = doc(firebaseDb, 'chats', state.selectedChat.id, 'programaciones', proposal.id);
    await updateDoc(ref, {
      status: 'rechazada',
      respondedByUid: currentUid,
      respondedByRole: role,
      respondedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(firebaseDb, 'chats', state.selectedChat.id), {
      schedulingStatus: 'pendiente_horario',
      relationshipStage: 'pendiente_horario',
      relationshipStatus: 'active',
      lastRelationshipEvent: 'schedule_rejected',
      relationshipUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await addSystemChatMessage(state.selectedChat, `Horario rechazado: ${scheduleProposalDisplayLabel(proposal)}.`);
    showToast('Horario rechazado', 'Podéis proponer otra alternativa.', 'info');
  }

  async function acceptScheduleProposal(proposal) {
    const classId = classIdFromProposal(state.selectedChat.id, proposal.id);
    const proposalRef = doc(firebaseDb, 'chats', state.selectedChat.id, 'programaciones', proposal.id);
    const nowIso = new Date().toISOString();
    const latestAvailability = await loadChatAvailability(state.selectedChat, currentUid, role)
      .catch(() => state.availabilityByChat[state.selectedChat.id] || { teacherSlots: [], studentSlots: [], busySlots: [] });
    const busySlots = busySlotsForChatValidation(latestAvailability, state.scheduleProposals || [], state.selectedChat, proposal.id);
    const conflict = findBusySlotConflict(
      busySlots,
      proposal.fecha,
      proposal.hora_inicio,
      proposal.hora_fin,
      {
        teacherUid: state.selectedChat.teacherUid || state.selectedChat.profesor_id,
        studentId: state.selectedChat.studentId || state.selectedChat.alumno_id,
      },
    );
    const availabilityValidation = validateScheduleAvailability({
      role,
      fecha: proposal.fecha,
      horaInicio: proposal.hora_inicio,
      horaFin: proposal.hora_fin,
      teacherSlots: latestAvailability.teacherSlots || [],
      studentSlots: latestAvailability.studentSlots || [],
      busySlots,
      teacherUid: state.selectedChat.teacherUid || state.selectedChat.profesor_id,
      studentId: state.selectedChat.studentId || state.selectedChat.alumno_id,
    });
    if (!availabilityValidation.valid) {
      const details = conflict ? ` Ocupado: ${busySlotLabel(conflict)}.` : '';
      throw new Error(`${availabilityValidation.message || 'Ese horario ya no esta disponible.'}${details}`);
    }
    state.availabilityByChat[state.selectedChat.id] = {
      ...latestAvailability,
      busySlots,
    };
    const input = {
      assignmentId: state.selectedChat.id,
      scheduleProposalId: proposal.id,
      profesor_id: state.selectedChat.teacherUid || state.selectedChat.profesor_id,
      teacherUid: state.selectedChat.teacherUid || state.selectedChat.profesor_id,
      familia_id: state.selectedChat.familyUid || state.selectedChat.familia_id,
      familyUid: state.selectedChat.familyUid || state.selectedChat.familia_id,
      alumno_id: state.selectedChat.studentId || state.selectedChat.alumno_id,
      studentId: state.selectedChat.studentId || state.selectedChat.alumno_id,
      materia: proposal.materia || state.selectedChat.materia || '',
      subject: proposal.materia || state.selectedChat.materia || '',
      fecha: proposal.fecha,
      hora_inicio: proposal.hora_inicio,
      hora_fin: proposal.hora_fin,
      estado: 'confirmada',
      observaciones: proposal.notas || '',
      calendarUid: classId,
    };
    const pricing = await buildScheduleClassPricing(state.selectedChat, input);
    Object.assign(input, pricing);
    const classFields = buildAdminClassPayload(input, {}, { nowIso, calendarUid: classId });
    const participantUids = { ...(state.selectedChat.participantUids || {}) };
    [
      currentUid,
      classFields.familyUid,
      classFields.familia_id,
      classFields.teacherUid,
      classFields.profesor_id,
    ].forEach((uid) => {
      const cleanUid = clean(uid, 180);
      if (cleanUid) participantUids[cleanUid] = true;
    });
    const payload = {
      ...classResetWriteFields(),
      profesor_id: classFields.profesor_id,
      teacherUid: classFields.teacherUid,
      familia_id: classFields.familia_id,
      familyUid: classFields.familyUid,
      alumno_id: classFields.alumno_id,
      studentId: classFields.studentId,
      fecha: classFields.fecha,
      date: classFields.date,
      materia: classFields.materia,
      subject: classFields.subject,
      hora_inicio: classFields.hora_inicio,
      startTime: classFields.startTime,
      hora_fin: classFields.hora_fin,
      endTime: classFields.endTime,
      duracion_minutos: classFields.duracion_minutos,
      durationMinutes: classFields.durationMinutes,
      ...pickClassPriceFields(classFields),
      estado: classFields.estado,
      status: classFields.status,
      lifecycleStatus: classFields.lifecycleStatus,
      attendanceStatus: classFields.attendanceStatus,
      paymentStatus: classFields.paymentStatus,
      familyPaymentStatus: classFields.familyPaymentStatus,
      estado_pago: classFields.estado_pago,
      estado_pago_familia: classFields.estado_pago_familia,
      teacherPaymentStatus: classFields.teacherPaymentStatus,
      estado_pago_profesor: classFields.estado_pago_profesor,
      observaciones: classFields.observaciones,
      calendarUid: classFields.calendarUid,
      updated_at: classFields.updated_at,
      assignmentId: input.assignmentId,
      asignacion_id: input.assignmentId,
      scheduleProposalId: proposal.id,
      createdFrom: 'chat_schedule_proposal',
      schedulingStatus: 'confirmed',
      modality: proposal.modalidad || 'por_acordar',
      modalidad: proposal.modalidad || 'por_acordar',
      familyName: clean(state.selectedChat.familyName, 160),
      teacherName: clean(state.selectedChat.teacherName, 160),
      studentName: clean(state.selectedChat.studentName, 160),
      familia_nombre: clean(state.selectedChat.familyName, 160),
      profesor_nombre: clean(state.selectedChat.teacherName, 160),
      alumno_nombre: clean(state.selectedChat.studentName, 160),
      participantUids,
      createdByUid: currentUid,
      createdByRole: role,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const classRef = doc(firebaseDb, 'clases', classId);
    await setDoc(classRef, payload);
    const createdBusySlots = await persistBusySlotsForClass(classId, payload, {
      assignmentId: state.selectedChat.id,
      createdByUid: currentUid,
      createdByRole: role,
    }).catch((error) => {
      console.warn('No se pudieron materializar las franjas ocupadas desde el cliente', error);
      return [];
    });
    await updateDoc(proposalRef, {
      ...classResetWriteFields(),
      status: 'aceptada',
      classId,
      respondedByUid: currentUid,
      respondedByRole: role,
      respondedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(firebaseDb, 'chats', state.selectedChat.id), {
      schedulingStatus: 'clase_programada',
      relationshipStage: 'clase_programada',
      relationshipStatus: 'active',
      activeClassId: classId,
      lastRelationshipEvent: 'class_scheduled_from_chat',
      relationshipUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    state.availabilityByChat[state.selectedChat.id] = {
      ...(state.availabilityByChat[state.selectedChat.id] || {}),
      loading: false,
      busySlots: uniqueBusyRows([
        ...(state.availabilityByChat[state.selectedChat.id]?.busySlots || []),
        ...createdBusySlots,
        ...busySlotsFromAcceptedProposals([{ ...proposal, id: proposal.id, status: 'aceptada', classId }], state.selectedChat),
      ]),
    };
    const scheduleText = isWeeklyRecurringProposal(proposal)
      ? `Horario semanal aceptado (${scheduleProposalDisplayLabel(proposal)}). Primera clase creada: ${formatDate(proposal.fecha)} de ${proposal.hora_inicio} a ${proposal.hora_fin}.`
      : `Clase puntual aceptada y creada: ${formatDate(proposal.fecha)} de ${proposal.hora_inicio} a ${proposal.hora_fin}.`;
    await addSystemChatMessage(state.selectedChat, scheduleText);
    showToast(isWeeklyRecurringProposal(proposal) ? 'Horario semanal guardado' : 'Clase creada', 'La clase ya aparece en el calendario de familia y profesor.', 'success');
  }

  container.querySelector('[data-chat-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = container.querySelector('[data-chat-input]');
    const body = clean(input.value, 2000);
    if (!body || !state.selectedChat) return;

    input.disabled = true;
    try {
      const chatRef = doc(firebaseDb, 'chats', state.selectedChat.id);
      await addDoc(collection(chatRef, 'mensajes'), {
        senderUid: currentUid,
        senderRole: role,
        senderName,
        body,
        createdAt: serverTimestamp(),
        readBy: { [currentUid]: true },
      });
      await updateDoc(chatRef, {
        lastMessage: body.slice(0, 180),
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      input.value = '';
      await refreshChats();
      selectChat(state.selectedChat.id);
    } catch (error) {
      console.error('No se pudo enviar el mensaje', error);
      showToast('No se envio el mensaje', error.message || 'Revisa permisos de chat.', 'error');
    } finally {
      input.disabled = false;
      input.focus();
    }
  });

  container.querySelector('[data-admin-notification-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const target = form.querySelector('[data-admin-notification-target]').value;
    const title = clean(form.querySelector('[data-admin-notification-title]').value, 120);
    const body = clean(form.querySelector('[data-admin-notification-body]').value, 800);
    if (!title || !body) {
      showToast('Faltan datos', 'Escribe titulo y mensaje.', 'warning');
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const sent = await sendAdminNotification(target, title, body);
      form.reset();
      showToast('Aviso enviado', `${sent} destinatario(s).`, 'success');
    } catch (error) {
      showToast('No se envio', error.message || 'Revisa permisos de notificaciones.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  container.querySelector('[data-notification-settings-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (role !== 'admin') return;
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const next = readNotificationSettingsForm(form, state.notificationSettings);
    button.disabled = true;
    try {
      state.notificationSettings = await saveNotificationSettings(next.settings, next.publicConfig);
      state.notificationPublicConfig = next.publicConfig;
      renderNotificationSettings(container, state.notificationSettings, state.notificationPublicConfig);
      showToast('Configuracion guardada', 'Las automatizaciones usaran estos ajustes.', 'success');
    } catch (error) {
      showToast('No se guardo', error.message || 'Revisa permisos de configuracion.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  try {
    if (role === 'admin') {
      const loaded = await loadNotificationSettings();
      state.notificationSettings = loaded.settings;
      state.notificationPublicConfig = loaded.publicConfig;
      renderNotificationSettings(container, state.notificationSettings, state.notificationPublicConfig);
    }
    state.unsubscribeNotifications = watchUserNotifications(currentUid, (notifications) => {
      const unreadCount = notifications.filter(isNotificationUnread).length;
      const latestUnread = notifications.find(isNotificationUnread);
      state.notifications = notifications;
      renderNotifications(container, notifications);

      if (state.notificationsReady && unreadCount > state.lastUnreadCount && latestUnread) {
        showBrowserNotification(notificationTitle(latestUnread), notificationBody(latestUnread), {
          url: '/pages/login.html',
          notificationId: latestUnread.id,
        });
      }
      state.notificationsReady = true;
      state.lastUnreadCount = unreadCount;
    });
    if (!state.unsubscribeNotifications) {
      state.notifications = [];
      renderNotifications(container, []);
    }
    Promise.resolve(watchForegroundPushMessages((payload) => {
      const title = payload.notification?.title || payload.data?.title || 'ClasesDe10';
      const body = payload.notification?.body || payload.data?.body || '';
      showBrowserNotification(title, body, {
        url: payload.fcmOptions?.link || payload.data?.url || '/pages/login.html',
        type: payload.data?.type || 'push',
      });
    })).then((unsubscribe) => {
      state.unsubscribePushMessages = unsubscribe;
    }).catch((error) => {
      console.warn('No se pudo activar escucha push en primer plano', error);
    });
    await refreshChats();
  } catch (error) {
    console.error('No se pudieron cargar chats', error);
    container.querySelector('[data-chat-list]').innerHTML = '<div class="chat-empty-state">No se pudieron cargar los chats.</div>';
    showToast('Chat no disponible', error.message || 'No se pudieron cargar los chats.', 'error');
  }
}
