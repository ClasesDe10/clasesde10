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
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-storage.js';
import { firebaseAuth, firebaseDb, firebaseStorage } from './firebase-client.js?v=20260627-domain-auth';
import {
  buildAdminClassPayload,
  validateClassTimeRange,
} from './calendar-engine.js?v=20260704-prorated-duration';
import { buildClassPricingQuote } from './finance-erp-engine.js?v=20260704-prorated-duration';
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
} from './notification-engine.js?v=20260705-payment-alerts';
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
const CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const CHAT_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/wav',
]);
const CHAT_ATTACHMENT_MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
};
const chatAttachmentUrlCache = new Map();

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

function escapeAttribute(value, max = 300000) {
  return clean(value, max)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function ensureNotificationPriorityStyles() {
  if (typeof document === 'undefined' || document.getElementById('cd10-notification-priority-styles')) return;
  const style = document.createElement('style');
  style.id = 'cd10-notification-priority-styles';
  style.textContent = `
    .notification-item.priority-media,
    .notification-item.priority-medium,
    .notification-item.priority-normal {
      border-color: rgba(232,160,48,.32);
      background: linear-gradient(90deg, rgba(255,221,125,.16), var(--white, #fff) 44%);
    }
    .notification-item.priority-media.unread,
    .notification-item.priority-medium.unread,
    .notification-item.priority-normal.unread {
      box-shadow: inset 3px 0 0 #f2bd2f;
    }
    .notification-item.priority-media .notification-kicker,
    .notification-item.priority-medium .notification-kicker,
    .notification-item.priority-normal .notification-kicker {
      color: #8a650d;
    }
  `;
  document.head?.appendChild(style);
}

function safeImageSrc(value) {
  const src = clean(value, 300000);
  if (!src) return '';
  const lowerPrefix = src.slice(0, 80).toLowerCase();
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(lowerPrefix)) return src;
  if (/^(https?:|blob:)/i.test(src)) return src;
  if (/^(\/|\.\/|\.\.\/)/.test(src)) return src;
  return '';
}

function initialsFromName(name = '') {
  const words = clean(name, 180).split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] || '';
  const second = words.length > 1 ? words[1]?.[0] : '';
  return `${first}${second}`.toUpperCase() || '?';
}

function chatIcon(name) {
  const icons = {
    clip: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M21.4 11.6 12 21a6 6 0 0 1-8.5-8.5l10-10a4 4 0 0 1 5.7 5.7l-10 10a2 2 0 1 1-2.8-2.8l9.4-9.4"/></svg>',
    image: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 16-5-5L5 19"/></svg>',
    mic: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M19 11a7 7 0 0 1-14 0"/><path d="M12 18v3"/><path d="M8 21h8"/></svg>',
    phone: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.7.6 2.5a2 2 0 0 1-.5 2.1L8 9.5a16 16 0 0 0 6.5 6.5l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.6.5 2.5.6A2 2 0 0 1 22 16.9Z"/></svg>',
    calendar: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M3 11h18"/></svg>',
    edit: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  };
  return icons[name] || '';
}

function fileExtension(name = '') {
  return clean(name, 240).split('.').pop()?.toLowerCase() || '';
}

function mimeTypeForFile(file = {}) {
  const direct = clean(file.type, 180).split(';')[0].toLowerCase();
  if (direct) return direct;
  return CHAT_ATTACHMENT_MIME_BY_EXT[fileExtension(file.name)] || 'application/octet-stream';
}

function chatAttachmentKindFromMime(mimeType = '') {
  const type = clean(mimeType, 180).toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('audio/')) return 'audio';
  return 'file';
}

function safeStorageFileName(fileName = '') {
  return clean(fileName, 180)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'archivo';
}

function validateChatAttachmentFile(file) {
  if (!file) throw new Error('Selecciona un archivo.');
  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) throw new Error('El archivo no puede superar 10 MB.');
  const mimeType = mimeTypeForFile(file);
  if (!CHAT_ATTACHMENT_TYPES.has(mimeType)) {
    throw new Error('Formato no admitido. Usa imagen, PDF, Word, Excel, PowerPoint, texto o audio.');
  }
  return mimeType;
}

function normalizeChatAttachment(attachment = {}) {
  if (!attachment || typeof attachment !== 'object') return null;
  const storagePath = clean(attachment.storagePath || attachment.storage_path || attachment.path, 600);
  if (!storagePath) return null;
  const mimeType = clean(attachment.mimeType || attachment.mime_type, 180).toLowerCase();
  const kind = clean(attachment.kind || chatAttachmentKindFromMime(mimeType), 40) || 'file';
  return {
    kind: ['image', 'audio', 'file'].includes(kind) ? kind : 'file',
    name: clean(attachment.name || attachment.fileName || attachment.nombre || 'Archivo', 180),
    mimeType,
    sizeBytes: Number(attachment.sizeBytes || attachment.tamano_bytes || 0) || null,
    storagePath,
    durationMs: Number(attachment.durationMs || 0) || null,
  };
}

function chatAttachmentLabel(attachment = {}) {
  const normalized = normalizeChatAttachment(attachment);
  if (!normalized) return '';
  if (normalized.kind === 'image') return `Foto: ${normalized.name}`;
  if (normalized.kind === 'audio') return 'Nota de audio';
  return `Archivo: ${normalized.name}`;
}

function chatMessagePreview(body = '', attachment = null) {
  return clean(body, 180) || chatAttachmentLabel(attachment) || 'Mensaje';
}

function chatStoragePath(chatId = '', uid = '', fileName = '') {
  const safeChat = clean(chatId, 180).replace(/\//g, '_') || 'chat';
  const safeUid = clean(uid, 180).replace(/\//g, '_') || 'usuario';
  return `chats/${safeChat}/${safeUid}/${Date.now()}-${safeStorageFileName(fileName)}`;
}

async function getChatAttachmentUrl(path = '') {
  const cleanPath = clean(path, 600);
  if (!cleanPath) return '';
  if (chatAttachmentUrlCache.has(cleanPath)) return chatAttachmentUrlCache.get(cleanPath);
  const url = await getDownloadURL(storageRef(firebaseStorage, cleanPath));
  chatAttachmentUrlCache.set(cleanPath, url);
  return url;
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
  const explicitKind = proposal.kind || proposal.scheduleKind;
  if (explicitKind) return normalizeScheduleKind(explicitKind);
  return proposal.recurrence?.frequency === 'weekly' ? SCHEDULE_KIND_WEEKLY : SCHEDULE_KIND_ONE_OFF;
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

function addDaysToDateString(dateString, days = 0) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + Number(days || 0));
  return dateInputValue(date);
}

function academicYearEndForDate(firstClassDate = '') {
  const date = new Date(`${firstClassDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getMonth() >= 6 ? date.getFullYear() + 1 : date.getFullYear();
  return `${year}-06-30`;
}

function classIdFromProposalOccurrence(chatId, proposalId, occurrenceDate, index = 0) {
  const base = classIdFromProposal(chatId, proposalId);
  if (!Number(index)) return base;
  const suffix = String(occurrenceDate || '').replace(/[^0-9]+/g, '') || String(index).padStart(2, '0');
  return `${base}_${suffix}`.slice(0, 900);
}

function buildWeeklyClassOccurrences(chatId, proposal = {}, options = {}) {
  const firstDate = clean(proposal.fecha || proposal.firstClassDate, 20).slice(0, 10);
  if (!firstDate) return [];
  if (!isWeeklyRecurringProposal(proposal)) {
    return [{
      classId: classIdFromProposalOccurrence(chatId, proposal.id, firstDate, 0),
      fecha: firstDate,
      index: 0,
      total: 1,
      seriesStartDate: firstDate,
      seriesEndDate: firstDate,
      isRecurring: false,
    }];
  }
  const seriesEndDate = clean(options.seriesEndDate || proposal.seriesEndDate || academicYearEndForDate(firstDate), 20).slice(0, 10);
  const dates = [];
  let currentDate = firstDate;
  while (currentDate && currentDate <= seriesEndDate && dates.length < 60) {
    dates.push(currentDate);
    currentDate = addDaysToDateString(currentDate, 7);
  }
  if (!dates.length) dates.push(firstDate);
  return dates.map((fecha, index) => ({
    classId: classIdFromProposalOccurrence(chatId, proposal.id, fecha, index),
    fecha,
    index,
    total: dates.length,
    seriesStartDate: firstDate,
    seriesEndDate,
    isRecurring: true,
  }));
}

function withTimeout(promise, timeoutMs = 8000, label = 'operacion', fallbackValue) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      console.warn(`Timeout en ${label}; usando fallback seguro.`);
      resolve(fallbackValue);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function withTimeoutReject(promise, timeoutMs = 12000, label = 'operacion') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} tardo demasiado. Comprueba conexion e intentalo de nuevo.`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
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
    precio_hora_familia: fields.precio_hora_familia ?? fields.familyHourlyRate ?? null,
    familyHourlyRate: fields.familyHourlyRate ?? fields.precio_hora_familia ?? null,
    importe_hora_profesor: fields.importe_hora_profesor ?? fields.teacherHourlyRate ?? null,
    teacherHourlyRate: fields.teacherHourlyRate ?? fields.importe_hora_profesor ?? null,
    comision_clasesde10: fields.comision_clasesde10 ?? null,
    platformFee: fields.platformFee ?? null,
    marginPct: fields.marginPct ?? null,
  };
}

function proratedPricingFromHourly(chat = {}, durationMinutes = 60) {
  const familyHourly = Number(chat.familyHourlyRate ?? chat.precio_hora_familia ?? chat.familyRatePerHour ?? chat.precio_total ?? chat.amount ?? chat.familyAmount);
  const teacherHourly = Number(chat.teacherHourlyRate ?? chat.importe_hora_profesor ?? chat.teacherRatePerHour ?? chat.importe_profesor ?? chat.teacherAmount);
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
    precio_hora_familia: familyHourly,
    familyHourlyRate: familyHourly,
    importe_hora_profesor: teacherHourly,
    teacherHourlyRate: teacherHourly,
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

const GENERIC_IDENTITY_LABELS = new Set([
  'profesor',
  'profesora',
  'profesor/a',
  'profesor asignado',
  'profesor sin nombre',
  'profesor pendiente de nombre',
  'familia',
  'familia sin nombre',
  'familia pendiente de nombre',
  'alumno',
  'alumna',
  'alumno/a',
  'alumno sin nombre',
  'alumno/a sin nombre',
  'alumno pendiente de nombre',
  'nombre pendiente',
  'estudiante',
  'docente',
  'contacto',
  'sin nombre',
  'la otra persona',
  'este alumno',
  'este profesor',
]);

function isGenericIdentityLabel(value) {
  const text = clean(value, 180);
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  if (!normalized || GENERIC_IDENTITY_LABELS.has(normalized)) return true;
  const ascii = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  if (/^[a-z]$/i.test(ascii)) return true;
  const generated = ascii.match(/^(?:profesor(?:a|\/a)?|profesor asignado|docente|alumno(?:a|\/a)?|familia)\s+([A-Za-z0-9_-]{1,12})$/i);
  if (!generated) return false;
  const token = generated[1].replace(/[^A-Za-z0-9]/g, '');
  if (token.length <= 1) return true;
  return /\d/.test(token) || /^[A-Z]{2,8}$/.test(token) || /^[a-f0-9]{6,12}$/i.test(token);
}

function identityKey(value) {
  return clean(value, 180)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function reliableName(value, fallback = '') {
  const text = clean(value, 180);
  if (text.length > 1 && !isGenericIdentityLabel(text)) return text;
  const fallbackText = clean(fallback, 180);
  return fallbackText.length > 1 && !isGenericIdentityLabel(fallbackText) ? fallbackText : '';
}

function hydrateChatNames(data = {}, fallback = {}) {
  const teacherPhotoUrl = safeImageSrc(
    data.teacherPhotoUrl
    || data.profesor_foto_url
    || data.teacherAvatarUrl
    || data.teacherProfilePhotoUrl
    || fallback.teacherPhotoUrl
    || fallback.profesor_foto_url
    || fallback.teacherAvatarUrl
    || fallback.teacherProfilePhotoUrl,
  );
  const teacherPhone = clean(
    data.teacherPhone
    || data.profesor_telefono
    || fallback.teacherPhone
    || fallback.profesor_telefono,
    40,
  );
  const familyPhone = clean(
    data.familyPhone
    || data.familia_telefono
    || fallback.familyPhone
    || fallback.familia_telefono,
    40,
  );
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
    teacherPhotoUrl,
    profesor_foto_url: teacherPhotoUrl,
    teacherPhone,
    profesor_telefono: teacherPhone,
    familyPhone,
    familia_telefono: familyPhone,
  };
}

function mergeDocsById(rows = []) {
  const map = new Map();
  rows.filter(Boolean).forEach((row) => map.set(String(row.id || row.assignmentId || row.asignacion_id), row));
  return Array.from(map.values());
}

function chatRelationshipKey(chat = {}) {
  const teacherUid = clean(chat.teacherUid || chat.profesor_id, 180);
  const familyUid = clean(chat.familyUid || chat.familia_id, 180);
  const studentId = clean(chat.studentId || chat.alumno_id, 180);
  const subject = identityKey(chat.materia || chat.subject || '');
  if (teacherUid && familyUid) return `participants:${teacherUid}:${familyUid}:${studentId || 'sin-alumno'}:${subject || 'sin-materia'}`;
  const assignmentId = clean(chat.assignmentId || chat.asignacion_id, 180);
  return assignmentId ? `assignment:${assignmentId}` : '';
}

function chatHasGeneratedIdentity(chat = {}) {
  return [
    chat.teacherName,
    chat.profesor_nombre,
    chat.studentName,
    chat.alumno_nombre,
    chat.familyName,
    chat.familia_nombre,
  ].some((value) => clean(value, 180) && isGenericIdentityLabel(value));
}

function chatIdentityScore(chat = {}, role = '') {
  const title = chatTitle(chat, role);
  let score = isUsefulChatIdentity(title) ? 20 : 0;
  if (!chatHasGeneratedIdentity(chat)) score += 10;
  if (clean(chat.assignmentId || chat.asignacion_id, 180)) score += 4;
  if (clean(chat.teacherPhotoUrl || chat.profesor_foto_url, 300000)) score += 2;
  if (clean(chat.lastMessageAt || chat.updatedAt, 80)) score += 1;
  return score;
}

function dedupeGeneratedChats(chats = [], role = '') {
  const byRelationship = new Map();
  const passthrough = [];
  for (const chat of chats) {
    const key = chatRelationshipKey(chat);
    if (!key) {
      passthrough.push(chat);
      continue;
    }
    const current = byRelationship.get(key);
    if (!current) {
      byRelationship.set(key, chat);
      continue;
    }
    const currentGenerated = chatHasGeneratedIdentity(current);
    const nextGenerated = chatHasGeneratedIdentity(chat);
    if (!currentGenerated && !nextGenerated) {
      passthrough.push(chat);
      continue;
    }
    byRelationship.set(key, chatIdentityScore(chat, role) >= chatIdentityScore(current, role) ? chat : current);
  }
  return [...byRelationship.values(), ...passthrough];
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
  if (role === 'profesor') {
    const studentId = chat.studentId || chat.alumno_id;
    return student || family || (studentId ? shortChatEntityLabel('Alumno', studentId) : shortChatEntityLabel('Familia', chat.familyUid || chat.familia_id));
  }
  if (role === 'familia') return teacher || shortChatEntityLabel('Profesor', chat.teacherUid || chat.profesor_id);
  return [
    family || shortChatEntityLabel('Familia', chat.familyUid || chat.familia_id),
    teacher || shortChatEntityLabel('Profesor', chat.teacherUid || chat.profesor_id),
  ].join(' / ');
}

function chatTitle(chat, role, preference = {}) {
  return reliableName(preference.displayNameOverride, '') || defaultChatTitle(chat, role);
}

function chatCounterpartPhotoUrl(chat = {}, role = '') {
  if (role !== 'familia') return '';
  return safeImageSrc(chat.teacherPhotoUrl || chat.profesor_foto_url || chat.teacherAvatarUrl || chat.teacherProfilePhotoUrl);
}

function chatCounterpartPhone(chat = {}, role = '') {
  const phone = role === 'familia'
    ? chat.teacherPhone || chat.profesor_telefono
    : role === 'profesor'
      ? chat.familyPhone || chat.familia_telefono
      : '';
  return clean(phone, 40).replace(/[^\d+]/g, '');
}

function renderChatCallActions(chat = {}, role = '') {
  if (!chat?.id || role === 'admin') return '';
  const phone = chatCounterpartPhone(chat, role);
  return phone
    ? `<a class="chat-icon-btn" href="tel:${escapeAttribute(phone, 40)}" title="Llamar" aria-label="Llamar">${chatIcon('phone')}</a>`
    : '';
}

function renderChatCounterpartAvatar(chat = {}, role = '', preference = {}, variant = 'list') {
  if (role !== 'familia') return '';
  const title = chatTitle(chat, role, preference);
  const photoUrl = chatCounterpartPhotoUrl(chat, role);
  const classes = `chat-contact-avatar chat-contact-avatar-${variant}${photoUrl ? ' has-image' : ''}`;
  if (photoUrl) {
    return `<span class="${classes}"><img src="${escapeAttribute(photoUrl)}" alt="${escapeAttribute(`Foto de ${title}`, 240)}" loading="lazy" referrerpolicy="no-referrer"></span>`;
  }
  return `<span class="${classes}" aria-hidden="true">${escapeHtml(initialsFromName(title))}</span>`;
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
  const text = clean(value, 120);
  return text.length > 1 && !isGenericIdentityLabel(text);
}

function readableChatIdentity(...values) {
  return values.map((value) => clean(value, 180)).find(isUsefulChatIdentity) || '';
}

function shortChatEntityLabel(label, id = '') {
  const roleLabel = clean(label, 40);
  return roleLabel ? `${roleLabel} pendiente de nombre` : 'Nombre pendiente';
}

function isExpectedPermissionFallback(error) {
  const message = clean(error?.message || error, 400).toLowerCase();
  return /permission|insufficient permissions/.test(message);
}

async function loadRoleProfile(collectionName = '', uid = '') {
  const cleanCollection = clean(collectionName, 40);
  const cleanUid = clean(uid, 180);
  if (!cleanCollection || !cleanUid) return {};
  try {
    const snap = await getDoc(doc(firebaseDb, cleanCollection, cleanUid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : {};
  } catch (error) {
    if (!isExpectedPermissionFallback(error)) {
      console.warn('No se pudo cargar perfil para completar el chat', {
        collectionName: cleanCollection,
        uid: cleanUid,
        message: error.message || String(error),
      });
    }
    return {};
  }
}

function chatSubtitle(chat, role, preference = {}) {
  const parts = [];
  const realTitle = realChatTitle(chat, role);
  const defaultTitle = defaultChatTitle(chat, role);
  const override = reliableName(preference.displayNameOverride, '');
  if (override && isUsefulChatIdentity(realTitle) && identityKey(realTitle) !== identityKey(override)) parts.push(`Nombre real: ${realTitle}`);
  const familyName = readableChatIdentity(chat.familyName, chat.familia_nombre, chat.familyEmail);
  const studentName = readableChatIdentity(chat.studentName, chat.alumno_nombre, chat.studentDisplayName);
  if (role === 'profesor' && familyName && familyName !== defaultTitle) parts.push(familyName);
  if (role !== 'profesor' && studentName) parts.push(studentName);
  if (chat.materia) parts.push(chat.materia);
  return parts.join(' - ') || 'Asignacion activa';
}

async function loadAssignments(dbCompat, role, profileId, actorIds = []) {
  const select = '*, alumnos(nombre,apellidos), familias(nombre,apellidos,telefono,usuarios(nombre,apellidos,email,telefono)), profesores(nombre,apellidos,email,telefono,foto_url,photoUrl,usuarios(nombre,apellidos,email,telefono))';
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
  const [teacherProfile, familyProfile, studentProfile] = await Promise.all([
    loadRoleProfile('profesores', teacherUid),
    loadRoleProfile('familias', familyUid),
    studentId ? loadRoleProfile('alumnos', studentId) : Promise.resolve({}),
  ]);
  const teacherProfileUser = teacherProfile.usuarios || teacherProfile.usuario || {};
  const familyProfileUser = familyProfile.usuarios || familyProfile.usuario || {};
  const teacherName = readableChatIdentity(fullName(
    assignment.profesores?.usuarios?.nombre || assignment.profesores?.nombre,
    assignment.profesores?.usuarios?.apellidos || assignment.profesores?.apellidos,
  ), fullName(
    teacherProfileUser.nombre || teacherProfile.nombre,
    teacherProfileUser.apellidos || teacherProfile.apellidos,
  ), assignment.teacherName, assignment.profesor_nombre, teacherProfile.displayName, teacherProfile.nombre_completo, assignment.profesores?.usuarios?.email, assignment.profesores?.email, teacherProfileUser.email, teacherProfile.email)
    || shortChatEntityLabel('Profesor', teacherUid);
  const teacherPhotoUrl = safeImageSrc(
    assignment.teacherPhotoUrl
    || assignment.profesor_foto_url
    || assignment.profesores?.foto_url
    || assignment.profesores?.photoUrl
    || assignment.profesores?.avatarUrl
    || assignment.profesores?.profilePhotoUrl
    || teacherProfile.foto_url
    || teacherProfile.photoUrl
    || teacherProfile.avatarUrl
    || teacherProfile.profilePhotoUrl
    || teacherProfile.photoURL
  );
  const teacherPhone = clean(
    assignment.teacherPhone
    || assignment.profesor_telefono
    || assignment.telefono_profesor
    || assignment.profesores?.usuarios?.telefono
    || assignment.profesores?.telefono
    || assignment.profesores?.phone
    || assignment.profesores?.telefono_bizum
    || assignment.profesores?.bizumPhone
    || teacherProfileUser.telefono
    || teacherProfile.telefono
    || teacherProfile.phone
    || teacherProfile.telefono_bizum
    || teacherProfile.bizumPhone,
    40,
  );
  const familyName = readableChatIdentity(fullName(
    assignment.familias?.usuarios?.nombre || assignment.familias?.nombre,
    assignment.familias?.usuarios?.apellidos || assignment.familias?.apellidos,
  ), fullName(
    familyProfileUser.nombre || familyProfile.nombre,
    familyProfileUser.apellidos || familyProfile.apellidos,
  ), assignment.familyName, assignment.familia_nombre, familyProfile.displayName, familyProfile.nombre_completo, assignment.familias?.usuarios?.email, familyProfileUser.email, familyProfile.email)
    || shortChatEntityLabel('Familia', familyUid);
  const familyPhone = clean(
    assignment.familyPhone
    || assignment.familia_telefono
    || assignment.telefono_familia
    || assignment.familias?.usuarios?.telefono
    || assignment.familias?.telefono
    || assignment.familias?.phone
    || familyProfileUser.telefono
    || familyProfile.telefono
    || familyProfile.phone,
    40,
  );
  const studentName = readableChatIdentity(
    fullName(assignment.alumnos?.nombre, assignment.alumnos?.apellidos),
    fullName(studentProfile.nombre, studentProfile.apellidos),
    assignment.studentName,
    assignment.alumno_nombre,
    assignment.studentDisplayName,
    studentProfile.displayName,
    studentProfile.nombre_completo,
  ) || shortChatEntityLabel('Alumno', studentId);
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
    teacherPhotoUrl,
    profesor_foto_url: teacherPhotoUrl,
    teacherPhone,
    profesor_telefono: teacherPhone,
    familyPhone,
    familia_telefono: familyPhone,
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
      'precio_hora_familia',
      'familyHourlyRate',
      'importe_hora_profesor',
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
    const chats = dedupeGeneratedChats(snap.docs.map((item) => ({ id: item.id, ...item.data() })), role);
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
  const chats = dedupeGeneratedChats(mergeDocsById([...firestoreChats, ...assignmentChats]), role);
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
    teacherUid,
    profesor_id: teacherUid,
    studentId,
    alumno_id: studentId,
    teacherName: readableChatIdentity(chat.teacherName, chat.profesor_nombre, chat.teacherEmail) || shortChatEntityLabel('Profesor', teacherUid),
    studentName: readableChatIdentity(chat.studentName, chat.alumno_nombre, chat.studentDisplayName) || shortChatEntityLabel('Alumno', studentId),
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
  await withTimeoutReject(
    Promise.all(slots.map((slot) => setDoc(doc(firebaseDb, 'busySlots', slot.id), slot.payload))),
    12000,
    'Reserva de disponibilidad',
  );
  return slots.map((slot) => ({ id: slot.id, ...slot.payload }));
}

function availabilityForRole(role, availability = {}) {
  const teacherSlots = availability.teacherSlots || [];
  const studentSlots = availability.studentSlots || [];
  const teacherLabel = readableChatIdentity(availability.teacherName) || shortChatEntityLabel('Profesor', availability.teacherUid || availability.profesor_id);
  const studentLabel = readableChatIdentity(availability.studentName) || shortChatEntityLabel('Alumno', availability.studentId || availability.alumno_id);
  if (role === 'familia') return {
    targetLabel: teacherLabel,
    targetSlots: teacherSlots,
    ownLabel: studentLabel,
    ownSlots: studentSlots,
  };
  if (role === 'profesor') return {
    targetLabel: studentLabel,
    targetSlots: studentSlots,
    ownLabel: teacherLabel,
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
  const teacherLabel = readableChatIdentity(availability.teacherName) || shortChatEntityLabel('Profesor', availability.teacherUid || availability.profesor_id);
  const studentLabel = readableChatIdentity(availability.studentName) || shortChatEntityLabel('Alumno', availability.studentId || availability.alumno_id);
  const targetAvailabilityText = `de ${roleContext.targetLabel}`;
  const targetMissing = role !== 'admin' && !roleContext.targetSlots.length;
  const ownMissing = role !== 'admin' && !roleContext.ownSlots.length;
  const ownSection = role === 'profesor' ? 'disponibilidad' : role === 'familia' ? 'alumnos' : '';
  const statusClass = targetMissing ? 'warning' : 'success';
  const statusText = targetMissing
    ? `Falta disponibilidad ${targetAvailabilityText}; no se puede proponer horario todavia.`
    : `Las propuestas deben estar dentro de las franjas ${targetAvailabilityText} y fuera de horas ya ocupadas.`;

  return `
    <div class="schedule-availability-summary ${statusClass}">
      <div class="schedule-availability-status">${escapeHtml(statusText)}</div>
      <div class="schedule-availability-grid">
        <div><span>${escapeHtml(teacherLabel)}</span><strong>${escapeHtml(teacherSummary || 'Sin franjas marcadas')}</strong></div>
        <div><span>${escapeHtml(studentLabel)}</span><strong>${escapeHtml(studentSummary || 'Sin franjas marcadas')}</strong></div>
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
            <div class="chat-subtitle">Mensajes y avisos</div>
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
          <div class="chat-empty-subtitle">Elige un chat para empezar.</div>
        </div>
        <div class="chat-messages" data-chat-messages></div>
        <section class="chat-schedule-panel" data-chat-schedule-panel style="display:none"></section>
        <form class="chat-compose" data-chat-form style="display:none">
          <input type="file" data-chat-file-input hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.webp,.gif">
          <input type="file" data-chat-image-input hidden accept="image/jpeg,image/png,image/webp,image/gif">
          <div class="chat-compose-tools" aria-label="Acciones del chat">
            <button class="chat-icon-btn" type="button" data-chat-attach-file title="Adjuntar archivo" aria-label="Adjuntar archivo">${chatIcon('clip')}</button>
            <button class="chat-icon-btn" type="button" data-chat-attach-image title="Enviar foto" aria-label="Enviar foto">${chatIcon('image')}</button>
            <button class="chat-icon-btn" type="button" data-chat-audio-record aria-pressed="false" title="Nota de audio" aria-label="Nota de audio">${chatIcon('mic')}</button>
          </div>
          <textarea class="form-control" data-chat-input rows="1" maxlength="2000" aria-label="Mensaje" placeholder="Mensaje"></textarea>
          <button class="btn btn-primary" type="submit">Enviar</button>
        </form>
      </section>
      <section class="chat-thread-panel notifications-panel" data-chat-panel="notificaciones" style="display:none">
        <div class="chat-thread-header">
          <div>
            <div class="chat-thread-title">Notificaciones</div>
            <div class="chat-thread-subtitle">Avisos importantes.</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
            <button class="btn btn-ghost btn-sm" type="button" data-chat-open-panel="chats">Ver chats</button>
            <button class="btn btn-ghost btn-sm" type="button" data-enable-browser-notifications>Activar avisos en este dispositivo</button>
            <button class="btn btn-ghost btn-sm" type="button" data-mark-all-notifications>Revisadas</button>
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
            <label><input type="checkbox" data-notification-event="class_unmarked_after_24h"> Clases sin marcar 24h</label>
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
            ${canRespond ? '<button class="btn btn-primary btn-sm" type="button" data-cd10-ux="off" data-accept-schedule>Aceptar y crear clase</button><button class="btn btn-ghost btn-sm" type="button" data-cd10-ux="off" data-reject-schedule>Rechazar</button>' : ''}
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
  const scheduleVisible = panel.dataset.scheduleVisible === 'true';
  const scheduleToggle = container.querySelector('[data-chat-toggle-schedule]');
  if (scheduleToggle) {
    scheduleToggle.classList.toggle('active', scheduleVisible);
    scheduleToggle.classList.toggle('has-pending', proposals.some((proposal) => proposal.status === 'propuesta'));
  }
  panel.classList.toggle('is-expanded', scheduleVisible);
  if (!scheduleVisible) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }
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
            ${canRespond ? '<button class="btn btn-primary btn-sm" type="button" data-cd10-ux="off" data-accept-schedule>Aceptar y crear clase</button><button class="btn btn-ghost btn-sm" type="button" data-cd10-ux="off" data-reject-schedule>Rechazar</button>' : ''}
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
    list.innerHTML = '<div class="chat-empty-state">Sin chats activos.</div>';
    return;
  }
  list.innerHTML = chats.map((chat) => {
    const preference = preferences[chat.id] || {};
    return `
      <button class="chat-list-item ${chat.id === selectedId ? 'active' : ''}" type="button" data-chat-id="${escapeHtml(chat.id)}">
        <span class="chat-list-main">
          ${renderChatCounterpartAvatar(chat, role, preference, 'list')}
          <span class="chat-list-copy">
            <span class="chat-list-name">${escapeHtml(chatTitle(chat, role, preference))}</span>
            <span class="chat-list-meta">${escapeHtml(chatSubtitle(chat, role, preference))}</span>
            <span class="chat-list-preview">${escapeHtml(chat.lastMessage || 'Sin mensajes todavia')}</span>
          </span>
        </span>
      </button>`;
  }).join('');
}

function renderThreadHeader(container, chat, role, preference = {}) {
  const header = container.querySelector('[data-chat-header]');
  if (!chat) return;
  const customName = clean(preference.displayNameOverride, 120);
  header.innerHTML = `
    <div class="chat-thread-identity">
      ${renderChatCounterpartAvatar(chat, role, preference, 'thread')}
      <div class="chat-thread-heading">
        <div class="chat-thread-title">${escapeHtml(chatTitle(chat, role, preference))}</div>
        <div class="chat-thread-subtitle">${escapeHtml(chatSubtitle(chat, role, preference))}</div>
      </div>
    </div>
    <form class="chat-alias-form" data-chat-name-form hidden>
      <input class="form-control" type="text" maxlength="120" value="${escapeHtml(customName)}" data-chat-name-input aria-label="Nombre guardado para este chat" placeholder="${escapeHtml(defaultChatTitle(chat, role))}">
      <button class="btn btn-primary btn-sm" type="submit">Guardar</button>
    </form>
    <div class="chat-header-actions">
      <button class="chat-icon-btn" type="button" data-chat-toggle-schedule title="Horario" aria-label="Horario">${chatIcon('calendar')}</button>
      ${renderChatCallActions(chat, role)}
      <button class="chat-icon-btn chat-alias-toggle" type="button" data-edit-chat-name title="Nombre del chat" aria-label="Nombre del chat">${chatIcon('edit')}</button>
    </div>`;
}

function renderMessageAttachment(attachment = {}) {
  const item = normalizeChatAttachment(attachment);
  if (!item) return '';
  const path = escapeAttribute(item.storagePath, 600);
  const name = escapeHtml(item.name);
  if (item.kind === 'image') {
    return `
      <a class="chat-attachment chat-attachment-image" data-chat-attachment-path="${path}" href="#" target="_blank" rel="noopener" aria-label="Abrir ${escapeAttribute(item.name, 180)}">
        <img data-chat-attachment-path="${path}" alt="${escapeAttribute(item.name, 180)}" loading="lazy">
        <span>${name}</span>
      </a>`;
  }
  if (item.kind === 'audio') {
    return `
      <div class="chat-attachment chat-attachment-audio">
        <audio controls preload="metadata" data-chat-attachment-path="${path}"></audio>
        <a data-chat-attachment-path="${path}" href="#" target="_blank" rel="noopener">Descargar audio</a>
      </div>`;
  }
  return `
    <a class="chat-attachment chat-attachment-file" data-chat-attachment-path="${path}" href="#" target="_blank" rel="noopener">
      ${chatIcon('clip')}
      <span>${name}</span>
    </a>`;
}

function renderMessageText(value = '') {
  const text = clean(value, 2000);
  const urlPattern = /https:\/\/[^\s]+/g;
  let html = '';
  let lastIndex = 0;
  for (const match of text.matchAll(urlPattern)) {
    const url = match[0];
    html += escapeHtml(text.slice(lastIndex, match.index));
    html += `<a href="${escapeAttribute(url, 600)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`;
    lastIndex = match.index + url.length;
  }
  html += escapeHtml(text.slice(lastIndex));
  return html;
}

async function hydrateMessageAttachments(box) {
  const nodes = [...box.querySelectorAll('[data-chat-attachment-path]')];
  await Promise.all(nodes.map(async (node) => {
    const path = node.dataset.chatAttachmentPath;
    if (!path || node.dataset.chatAttachmentReady === 'true') return;
    try {
      const url = await getChatAttachmentUrl(path);
      if (node.tagName === 'IMG' || node.tagName === 'AUDIO') {
        node.src = url;
      } else if (node.tagName === 'A') {
        node.href = url;
      }
      node.dataset.chatAttachmentReady = 'true';
    } catch (_) {
      node.classList.add('is-error');
      if (node.tagName === 'A') node.removeAttribute('href');
    }
  }));
}

function messageSenderDisplayName(message = {}, chat = {}, currentUid = '', currentDisplayName = '') {
  const senderUid = clean(message.senderUid, 180);
  const senderRole = clean(message.senderRole, 40).toLowerCase();
  if (senderUid === 'system' || senderRole === 'system') return 'ClasesDe10';
  const directName = readableChatIdentity(message.senderName);
  const currentName = readableChatIdentity(currentDisplayName);
  if (senderUid && senderUid === currentUid) return currentName || directName || 'Tu';
  const teacherIds = [
    chat.teacherUserUid,
    chat.teacherUid,
    chat.profesor_id,
  ].map((value) => clean(value, 180)).filter(Boolean);
  const familyIds = [
    chat.familyUserUid,
    chat.familyUid,
    chat.familia_id,
  ].map((value) => clean(value, 180)).filter(Boolean);
  if ((senderUid && teacherIds.includes(senderUid)) || senderRole === 'profesor') {
    return readableChatIdentity(chat.teacherName, chat.profesor_nombre, chat.teacherEmail) || directName || 'Profesor pendiente de nombre';
  }
  if ((senderUid && familyIds.includes(senderUid)) || senderRole === 'familia') {
    return readableChatIdentity(chat.familyName, chat.familia_nombre, chat.familyEmail) || directName || currentName || 'Familia pendiente de nombre';
  }
  return directName || currentName || 'Usuario';
}

function renderMessages(container, messages, currentUid, chat = {}, currentDisplayName = '') {
  const box = container.querySelector('[data-chat-messages]');
  const hadMessages = Boolean(box.querySelector('.chat-message'));
  const distanceFromBottom = box.scrollHeight - box.scrollTop - box.clientHeight;
  const shouldStickToBottom = !hadMessages || distanceFromBottom < 120;
  const previousScrollTop = box.scrollTop;
  if (!messages.length) {
    box.innerHTML = '<div class="chat-empty-state">Sin mensajes todavia.</div>';
    return;
  }
  box.innerHTML = messages.map((message) => {
    const mine = message.senderUid === currentUid;
    const attachment = normalizeChatAttachment(message.attachment);
    const body = clean(message.body, 2000);
    const senderDisplayName = messageSenderDisplayName(message, chat, currentUid, currentDisplayName);
    return `
      <div class="chat-message ${mine ? 'mine' : ''}">
        <div class="chat-message-meta">${escapeHtml(senderDisplayName)} - ${escapeHtml(formatDateTime(message.createdAt))}</div>
        ${body ? `<div class="chat-message-body">${renderMessageText(body)}</div>` : ''}
        ${attachment ? renderMessageAttachment(attachment) : ''}
      </div>`;
  }).join('');
  hydrateMessageAttachments(box).catch(() => {});
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
  return normalized === 'normal' ? 'normal' : '';
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
  ensureNotificationPriorityStyles();
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
    audioRecorder: null,
    audioStream: null,
    audioChunks: [],
    audioStartedAt: 0,
  };
  const currentUid = clean(firebaseAuth.currentUser?.uid || usuario.firebase_uid || usuario.uid || usuario.id, 180);
  const currentActorIds = new Set([
    currentUid,
    usuario.uid,
    usuario.firebase_uid,
    usuario.id,
    profileId,
  ].map((value) => clean(value, 180)).filter(Boolean));
  const senderName = readableChatIdentity(fullName(usuario.nombre, usuario.apellidos), usuario.displayName, usuario.email) || role;

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

  async function sendChatMessage({ body = '', attachment = null, messageType = 'text' } = {}) {
    if (!state.selectedChat) return;
    const safeBody = clean(body || chatAttachmentLabel(attachment), 2000);
    if (!safeBody && !attachment) return;
    const chatRef = doc(firebaseDb, 'chats', state.selectedChat.id);
    const payload = {
      senderUid: currentUid,
      senderRole: role,
      senderName,
      body: safeBody || 'Mensaje',
      messageType,
      createdAt: serverTimestamp(),
      readBy: { [currentUid]: true },
    };
    if (attachment) payload.attachment = normalizeChatAttachment(attachment);
    await addDoc(collection(chatRef, 'mensajes'), payload);
    await updateDoc(chatRef, {
      lastMessage: chatMessagePreview(safeBody, attachment),
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async function uploadChatAttachment(file, forcedKind = '') {
    if (!state.selectedChat) throw new Error('Selecciona un chat.');
    const mimeType = validateChatAttachmentFile(file);
    const kind = forcedKind || chatAttachmentKindFromMime(mimeType);
    if (forcedKind === 'image' && !mimeType.startsWith('image/')) throw new Error('Selecciona una imagen.');
    if (forcedKind === 'audio' && !mimeType.startsWith('audio/')) throw new Error('Selecciona un audio.');
    const storagePath = chatStoragePath(state.selectedChat.id, currentUid, file.name);
    await uploadBytes(storageRef(firebaseStorage, storagePath), file, { contentType: mimeType });
    return {
      kind,
      name: clean(file.name || (kind === 'audio' ? 'nota-audio.webm' : 'archivo'), 180),
      mimeType,
      sizeBytes: Number(file.size || 0),
      storagePath,
    };
  }

  async function sendChatAttachmentFile(file, forcedKind = '') {
    const attachment = await uploadChatAttachment(file, forcedKind);
    await sendChatMessage({
      body: chatAttachmentLabel(attachment),
      attachment,
      messageType: attachment.kind,
    });
    return attachment;
  }

  async function handleChatFileInput(input) {
    const file = input.files?.[0];
    input.value = '';
    if (!file || !state.selectedChat) return;
    const submitButton = container.querySelector('[data-chat-form] button[type="submit"]');
    submitButton.disabled = true;
    try {
      const forcedKind = input.matches('[data-chat-image-input]') ? 'image' : '';
      await sendChatAttachmentFile(file, forcedKind);
      showToast('Enviado', 'Archivo enviado en el chat.', 'success');
      await refreshChats();
      selectChat(state.selectedChat.id);
    } catch (error) {
      showToast('No se envio', error.message || 'No se pudo adjuntar el archivo.', 'error');
    } finally {
      submitButton.disabled = false;
    }
  }

  async function finishAudioRecording(button) {
    const recorder = state.audioRecorder;
    if (!recorder || recorder.state !== 'recording') return;
    button?.classList.remove('is-recording');
    button?.setAttribute('aria-pressed', 'false');
    recorder.stop();
  }

  async function toggleAudioRecording(button) {
    if (state.audioRecorder?.state === 'recording') {
      await finishAudioRecording(button);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      showToast('Audio no disponible', 'Este navegador no permite grabar notas de voz.', 'warning');
      return;
    }
    if (!state.selectedChat) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      state.audioRecorder = recorder;
      state.audioStream = stream;
      state.audioChunks = [];
      state.audioStartedAt = Date.now();
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data?.size) state.audioChunks.push(event.data);
      });
      recorder.addEventListener('stop', async () => {
        const chunks = state.audioChunks.slice();
        const durationMs = Math.max(0, Date.now() - state.audioStartedAt);
        state.audioStream?.getTracks?.().forEach((track) => track.stop());
        state.audioRecorder = null;
        state.audioStream = null;
        state.audioChunks = [];
        if (!chunks.length || durationMs < 600) {
          showToast('Audio muy corto', 'Graba al menos un segundo.', 'info');
          return;
        }
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const file = new File([blob], `nota-audio-${Date.now()}.webm`, { type: blob.type || 'audio/webm' });
        try {
          const attachment = await uploadChatAttachment(file, 'audio');
          attachment.durationMs = durationMs;
          await sendChatMessage({ body: 'Nota de audio', attachment, messageType: 'audio' });
          showToast('Audio enviado', 'Nota de voz enviada.', 'success');
          await refreshChats();
          if (state.selectedChat?.id) selectChat(state.selectedChat.id);
        } catch (error) {
          showToast('No se envio el audio', error.message || 'No se pudo subir la nota de voz.', 'error');
        }
      });
      recorder.start();
      button?.classList.add('is-recording');
      button?.setAttribute('aria-pressed', 'true');
      showToast('Grabando', 'Pulsa de nuevo el micro para enviar.', 'info');
    } catch (error) {
      showToast('Microfono bloqueado', error.message || 'Permite el microfono para grabar notas de audio.', 'warning');
    }
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
      schedulePanel.dataset.scheduleVisible = 'false';
      schedulePanel.dataset.schedulePlannerOpen = 'false';
      schedulePanel.dataset.scheduleKind = SCHEDULE_KIND_WEEKLY;
    }
    state.scheduleProposals = [];
    state.availabilityByChat[chat.id] = { loading: true, teacherSlots: [], studentSlots: [] };
    renderSchedulePanelWithActions(container, chat, state.scheduleProposals, role, currentActorIds, state.availabilityByChat[chat.id]);

    loadChatAvailability(chat, currentUid, role).then((availability) => {
      if (state.selectedChat?.id !== chat.id) return;
      state.availabilityByChat[chat.id] = availability;
      renderSchedulePanelWithActions(container, chat, state.scheduleProposals || [], role, currentActorIds, availability);
    }).catch((error) => {
      if (state.selectedChat?.id !== chat.id) return;
      state.availabilityByChat[chat.id] = {
        loading: false,
        teacherSlots: [],
        studentSlots: [],
        error: error.message || 'No se pudo cargar la disponibilidad.',
      };
      renderSchedulePanelWithActions(container, chat, state.scheduleProposals || [], role, currentActorIds, state.availabilityByChat[chat.id]);
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
      renderMessages(container, snap.docs.map((item) => ({ id: item.id, ...item.data() })), currentUid, chat, senderName);
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
      renderSchedulePanelWithActions(container, chat, state.scheduleProposals, role, currentActorIds, state.availabilityByChat[chat.id] || { loading: true });
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

  async function resolveScheduleProposalForAction(proposalNode) {
    const proposalId = clean(proposalNode?.dataset.scheduleProposalId, 180);
    if (!proposalId || !state.selectedChat?.id) return null;
    const cached = state.scheduleProposals?.find((entry) => entry.id === proposalId);
    if (cached) return cached;

    const proposalRef = doc(firebaseDb, 'chats', state.selectedChat.id, 'programaciones', proposalId);
    const proposalSnap = await getDoc(proposalRef).catch((error) => {
      console.warn('No se pudo leer la propuesta de horario desde Firestore', error);
      return null;
    });
    if (!proposalSnap?.exists?.()) return null;
    const proposal = { id: proposalSnap.id, ...proposalSnap.data() };
    state.scheduleProposals = [
      ...(state.scheduleProposals || []).filter((entry) => entry.id !== proposal.id),
      proposal,
    ];
    return proposal;
  }

  async function handleScheduleProposalAction(event) {
    const accept = event.target.closest('[data-accept-schedule]');
    const reject = event.target.closest('[data-reject-schedule]');
    if (!accept && !reject) return false;

    event.preventDefault();
    event.stopPropagation();
    const actionButton = accept || reject;
    if (actionButton.dataset.scheduleActionBusy === 'true') return true;
    actionButton.dataset.scheduleActionBusy = 'true';

    const proposalNode = event.target.closest('[data-schedule-proposal-id]');
    try {
      const proposal = await resolveScheduleProposalForAction(proposalNode);
      if (!proposal || !state.selectedChat) {
        console.warn('No se pudo resolver la propuesta de horario', {
          proposalId: proposalNode?.dataset.scheduleProposalId || '',
          chatId: state.selectedChat?.id || '',
        });
        showToast('Horario no disponible', 'Recarga el chat e intentalo de nuevo.', 'warning');
        return true;
      }
      if (accept) {
        await acceptScheduleProposal(proposal, accept);
      } else {
        await rejectScheduleProposal(proposal);
      }
    } catch (error) {
      if (accept) {
        console.error('No se pudo aceptar horario', error);
        showToast('No se creo la clase', error.message || 'Revisa permisos o datos de horario.', 'error');
      } else {
        console.error('No se pudo rechazar horario', error);
        showToast('No se rechazo', error.message || 'Revisa permisos.', 'error');
      }
    } finally {
      delete actionButton.dataset.scheduleActionBusy;
    }
    return true;
  }

  function wireScheduleActionButtons() {
    container.querySelectorAll('[data-accept-schedule], [data-reject-schedule]').forEach((button) => {
      if (button.dataset.scheduleDirectHandler === 'true') return;
      button.dataset.scheduleDirectHandler = 'true';
      button.addEventListener('click', (event) => {
        handleScheduleProposalAction(event);
      });
    });
  }

  function renderSchedulePanelWithActions(...args) {
    renderSchedulePanel(...args);
    wireScheduleActionButtons();
  }

  container.addEventListener('click', (event) => {
    if (!event.target.closest('[data-accept-schedule], [data-reject-schedule]')) return;
    handleScheduleProposalAction(event);
  }, true);

  container.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (!event.target.closest('[data-accept-schedule], [data-reject-schedule]')) return;
    handleScheduleProposalAction(event);
  }, true);

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

    const attachFile = event.target.closest('[data-chat-attach-file]');
    if (attachFile) {
      container.querySelector('[data-chat-file-input]')?.click();
      return;
    }

    const attachImage = event.target.closest('[data-chat-attach-image]');
    if (attachImage) {
      container.querySelector('[data-chat-image-input]')?.click();
      return;
    }

    const audioRecord = event.target.closest('[data-chat-audio-record]');
    if (audioRecord) {
      await toggleAudioRecording(audioRecord);
      return;
    }

    const toggleSchedule = event.target.closest('[data-chat-toggle-schedule]');
    if (toggleSchedule && state.selectedChat) {
      const panel = container.querySelector('[data-chat-schedule-panel]');
      if (panel) {
        const nextVisible = panel.dataset.scheduleVisible !== 'true';
        panel.dataset.scheduleVisible = nextVisible ? 'true' : 'false';
        if (!nextVisible) panel.dataset.schedulePlannerOpen = 'false';
        renderSchedulePanelWithActions(container, state.selectedChat, state.scheduleProposals || [], role, currentActorIds, state.availabilityByChat[state.selectedChat.id] || {});
        if (nextVisible) panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
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
        panel.dataset.scheduleVisible = 'true';
        panel.dataset.schedulePlannerOpen = 'true';
        panel.dataset.scheduleKind = normalizeScheduleKind(openSchedulePlanner.dataset.openSchedulePlanner);
        renderSchedulePanelWithActions(container, state.selectedChat, state.scheduleProposals || [], role, currentActorIds, state.availabilityByChat[state.selectedChat?.id] || {});
        focusSchedulePrimaryField(panel);
      }
      return;
    }

    const closeSchedulePlanner = event.target.closest('[data-close-schedule-planner]');
    if (closeSchedulePlanner) {
      const panel = container.querySelector('[data-chat-schedule-panel]');
      if (panel) {
        panel.dataset.schedulePlannerOpen = 'false';
        renderSchedulePanelWithActions(container, state.selectedChat, state.scheduleProposals || [], role, currentActorIds, state.availabilityByChat[state.selectedChat?.id] || {});
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

    const accept = event.target.closest('[data-accept-schedule]');
    const reject = event.target.closest('[data-reject-schedule]');
    if (accept || reject) {
      await handleScheduleProposalAction(event);
      return;
    }

    const item = event.target.closest('[data-chat-id]');
    if (item) {
      selectChat(item.dataset.chatId);
      return;
    }
  });

  window.addEventListener('cd10:open-chat-planner', (event) => {
    if (!state.selectedChat) return;
    setPanel('chats');
    const panel = container.querySelector('[data-chat-schedule-panel]');
    if (!panel) return;
    panel.dataset.scheduleVisible = 'true';
    panel.dataset.schedulePlannerOpen = 'true';
    panel.dataset.scheduleKind = normalizeScheduleKind(event.detail?.kind || SCHEDULE_KIND_ONE_OFF);
    renderSchedulePanelWithActions(container, state.selectedChat, state.scheduleProposals || [], role, currentActorIds, state.availabilityByChat[state.selectedChat.id] || {});
    setTimeout(() => focusSchedulePrimaryField(panel), 50);
  });

  container.addEventListener('change', async (event) => {
    const chatFileInput = event.target.closest('[data-chat-file-input], [data-chat-image-input]');
    if (chatFileInput) {
      await handleChatFileInput(chatFileInput);
      return;
    }

    const kindSelect = event.target.closest('[data-schedule-kind]');
    if (!kindSelect || !state.selectedChat) return;
    const panel = container.querySelector('[data-chat-schedule-panel]');
    if (!panel) return;
    panel.dataset.scheduleKind = normalizeScheduleKind(kindSelect.value);
    renderSchedulePanelWithActions(container, state.selectedChat, state.scheduleProposals || [], role, currentActorIds, state.availabilityByChat[state.selectedChat.id] || {});
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

  async function acceptScheduleProposal(proposal, actionButton = null) {
    const previousButtonText = actionButton?.textContent || '';
    const setActionStage = (text) => {
      if (actionButton?.isConnected) actionButton.textContent = text;
    };
    if (actionButton) {
      actionButton.disabled = true;
      actionButton.setAttribute('aria-busy', 'true');
      actionButton.textContent = 'Creando clase...';
    }
    const occurrences = buildWeeklyClassOccurrences(state.selectedChat.id, proposal);
    const firstOccurrence = occurrences[0];
    const classId = firstOccurrence?.classId || classIdFromProposal(state.selectedChat.id, proposal.id);
    const classIds = occurrences.map((occurrence) => occurrence.classId);
    const classSeriesId = isWeeklyRecurringProposal(proposal) ? proposal.id : '';
    const proposalRef = doc(firebaseDb, 'chats', state.selectedChat.id, 'programaciones', proposal.id);
    const nowIso = new Date().toISOString();
    const availabilityFallback = state.availabilityByChat[state.selectedChat.id] || { teacherSlots: [], studentSlots: [], busySlots: [] };
    try {
    setActionStage('Validando horario...');
    const latestAvailability = await withTimeout(
      loadChatAvailability(state.selectedChat, currentUid, role).catch(() => availabilityFallback),
      8000,
      'carga de disponibilidad para aceptar horario',
      availabilityFallback,
    );
    const busySlots = busySlotsForChatValidation(latestAvailability, state.scheduleProposals || [], state.selectedChat, proposal.id);
    const conflictContext = {
      teacherUid: state.selectedChat.teacherUid || state.selectedChat.profesor_id,
      studentId: state.selectedChat.studentId || state.selectedChat.alumno_id,
    };
    const conflict = occurrences
      .map((occurrence) => ({
        occurrence,
        slot: findBusySlotConflict(
          busySlots,
          occurrence.fecha,
          proposal.hora_inicio,
          proposal.hora_fin,
          conflictContext,
        ),
      }))
      .find((item) => item.slot);
    if (conflict) {
      throw new Error(`Ese horario ya esta ocupado el ${formatDate(conflict.occurrence.fecha)}. Ocupado: ${busySlotLabel(conflict.slot)}.`);
    }
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
    const acceptanceOverrideOwnAvailability = availabilityValidation.reason === 'outside_own_availability';
    if (!availabilityValidation.valid && !acceptanceOverrideOwnAvailability) {
      const details = '';
      throw new Error(`${availabilityValidation.message || 'Ese horario ya no esta disponible.'}${details}`);
    }
    state.availabilityByChat[state.selectedChat.id] = {
      ...latestAvailability,
      busySlots,
    };
    const baseInput = {
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
      hora_inicio: proposal.hora_inicio,
      hora_fin: proposal.hora_fin,
      estado: 'confirmada',
      observaciones: proposal.notas || '',
    };
    setActionStage('Calculando precio...');
    const pricingInput = { ...baseInput, fecha: firstOccurrence?.fecha || proposal.fecha, calendarUid: classId };
    const pricing = await withTimeout(
      buildScheduleClassPricing(state.selectedChat, pricingInput),
      8000,
      'calculo de precio para aceptar horario',
      pickClassPriceFields(buildClassPricingQuote(pricingInput, {}, { config: globalThis.CD10PlatformConfig || {} })),
    );
    Object.assign(baseInput, pricing);
    const firstClassFields = buildAdminClassPayload({ ...baseInput, fecha: firstOccurrence?.fecha || proposal.fecha, calendarUid: classId }, {}, { nowIso, calendarUid: classId });
    const participantUids = { ...(state.selectedChat.participantUids || {}) };
    [
      currentUid,
      firstClassFields.familyUid,
      firstClassFields.familia_id,
      firstClassFields.teacherUid,
      firstClassFields.profesor_id,
    ].forEach((uid) => {
      const cleanUid = clean(uid, 180);
      if (cleanUid) participantUids[cleanUid] = true;
    });
    const buildOccurrencePayload = (occurrence) => {
      const classFamilyName = readableChatIdentity(state.selectedChat.familyName, state.selectedChat.familia_nombre, state.selectedChat.familyEmail);
      const classTeacherName = readableChatIdentity(state.selectedChat.teacherName, state.selectedChat.profesor_nombre, state.selectedChat.teacherEmail);
      const classStudentName = readableChatIdentity(state.selectedChat.studentName, state.selectedChat.alumno_nombre, state.selectedChat.studentDisplayName);
      const occurrenceFields = buildAdminClassPayload({
        ...baseInput,
        fecha: occurrence.fecha,
        calendarUid: occurrence.classId,
      }, {}, { nowIso, calendarUid: occurrence.classId });
      const seriesFields = occurrence.isRecurring ? {
        classSeriesId,
        seriesId: classSeriesId,
        seriesIndex: occurrence.index,
        seriesTotal: occurrence.total,
        seriesStartDate: occurrence.seriesStartDate,
        seriesEndDate: occurrence.seriesEndDate,
        isRecurring: true,
        recurrence: proposal.recurrence || {
          frequency: 'weekly',
          dayOfWeek: normalizeScheduleWeekdayIndex(proposal.fecha),
          startTime: proposal.hora_inicio,
          endTime: proposal.hora_fin,
          timezone: 'Europe/Madrid',
        },
        recurrenceLabel: proposal.recurrenceLabel || scheduleProposalDisplayLabel(proposal),
        parentClassId: classId,
      } : {};
      return {
        ...classResetWriteFields(),
        profesor_id: occurrenceFields.profesor_id,
        teacherUid: occurrenceFields.teacherUid,
        familia_id: occurrenceFields.familia_id,
        familyUid: occurrenceFields.familyUid,
        alumno_id: occurrenceFields.alumno_id,
        studentId: occurrenceFields.studentId,
        fecha: occurrenceFields.fecha,
        date: occurrenceFields.date,
        materia: occurrenceFields.materia,
        subject: occurrenceFields.subject,
        hora_inicio: occurrenceFields.hora_inicio,
        startTime: occurrenceFields.startTime,
        hora_fin: occurrenceFields.hora_fin,
        endTime: occurrenceFields.endTime,
        duracion_minutos: occurrenceFields.duracion_minutos,
        durationMinutes: occurrenceFields.durationMinutes,
        ...pickClassPriceFields(occurrenceFields),
        estado: occurrenceFields.estado,
        status: occurrenceFields.status,
        lifecycleStatus: occurrenceFields.lifecycleStatus,
        attendanceStatus: occurrenceFields.attendanceStatus,
        paymentStatus: occurrenceFields.paymentStatus,
        familyPaymentStatus: occurrenceFields.familyPaymentStatus,
        estado_pago: occurrenceFields.estado_pago,
        estado_pago_familia: occurrenceFields.estado_pago_familia,
        teacherPaymentStatus: occurrenceFields.teacherPaymentStatus,
        estado_pago_profesor: occurrenceFields.estado_pago_profesor,
        observaciones: occurrenceFields.observaciones,
        calendarUid: occurrenceFields.calendarUid,
        updated_at: occurrenceFields.updated_at,
        assignmentId: baseInput.assignmentId,
        asignacion_id: baseInput.assignmentId,
        scheduleProposalId: proposal.id,
        ...seriesFields,
        createdFrom: 'chat_schedule_proposal',
        schedulingStatus: 'confirmed',
        modality: proposal.modalidad || 'por_acordar',
        modalidad: proposal.modalidad || 'por_acordar',
        familyName: classFamilyName,
        teacherName: classTeacherName,
        studentName: classStudentName,
        familia_nombre: classFamilyName,
        profesor_nombre: classTeacherName,
        alumno_nombre: classStudentName,
        participantUids,
        createdByUid: currentUid,
        createdByRole: role,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
    };
    const occurrencePayloads = occurrences.map((occurrence) => ({
      ...occurrence,
      payload: buildOccurrencePayload(occurrence),
    }));
    setActionStage(occurrencePayloads.length > 1 ? 'Creando serie...' : 'Guardando clase...');
    const classBatch = writeBatch(firebaseDb);
    occurrencePayloads.forEach((occurrence) => {
      classBatch.set(doc(firebaseDb, 'clases', occurrence.classId), occurrence.payload);
    });
    await withTimeoutReject(classBatch.commit(), 20000, 'Creacion de la serie de clases');
    setActionStage('Reservando horario...');
    const createdBusySlots = await Promise.all(occurrencePayloads.map((occurrence) => (
      persistBusySlotsForClass(occurrence.classId, occurrence.payload, {
        assignmentId: state.selectedChat.id,
        createdByUid: currentUid,
        createdByRole: role,
      })
    ))).then((rows) => rows.flat()).catch((error) => {
      console.warn('No se pudieron materializar las franjas ocupadas desde el cliente', error);
      return [];
    });
    setActionStage('Actualizando propuesta...');
    await withTimeoutReject(updateDoc(proposalRef, {
      ...classResetWriteFields(),
      status: 'aceptada',
      classId,
      classIds,
      classCount: classIds.length,
      classSeriesId: classSeriesId || null,
      seriesEndDate: firstOccurrence?.seriesEndDate || proposal.fecha,
      respondedByUid: currentUid,
      respondedByRole: role,
      respondedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }), 12000, 'Actualizacion de la propuesta');
    setActionStage('Actualizando chat...');
    await withTimeoutReject(updateDoc(doc(firebaseDb, 'chats', state.selectedChat.id), {
      schedulingStatus: 'clase_programada',
      relationshipStage: 'clase_programada',
      relationshipStatus: 'active',
      activeClassId: classId,
      activeClassIds: classIds.slice(0, 60),
      classSeriesId: classSeriesId || null,
      seriesEndDate: firstOccurrence?.seriesEndDate || proposal.fecha,
      lastRelationshipEvent: 'class_scheduled_from_chat',
      relationshipUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }), 12000, 'Actualizacion del chat');
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
      ? `Horario semanal aceptado (${scheduleProposalDisplayLabel(proposal)}). Se han creado ${classIds.length} clases hasta el ${formatDate(firstOccurrence?.seriesEndDate)}. Primera clase: ${formatDate(proposal.fecha)} de ${proposal.hora_inicio} a ${proposal.hora_fin}.`
      : `Clase puntual aceptada y creada: ${formatDate(proposal.fecha)} de ${proposal.hora_inicio} a ${proposal.hora_fin}.`;
    setActionStage('Avisando a la otra parte...');
    await withTimeoutReject(addSystemChatMessage(state.selectedChat, scheduleText), 12000, 'Mensaje de sistema');
    showToast(isWeeklyRecurringProposal(proposal) ? 'Horario semanal guardado' : 'Clase creada', 'La clase ya aparece en el calendario de familia y profesor.', 'success');
    } finally {
      if (actionButton?.isConnected) {
        actionButton.disabled = false;
        actionButton.removeAttribute('aria-busy');
        if (previousButtonText) actionButton.textContent = previousButtonText;
      }
    }
  }

  container.querySelector('[data-chat-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = container.querySelector('[data-chat-input]');
    const body = clean(input.value, 2000);
    if (!body || !state.selectedChat) return;

    input.disabled = true;
    try {
      await sendChatMessage({ body, messageType: 'text' });
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
