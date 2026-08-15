import {
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
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
} from './notifications-provider.js?v=20260808-action-center';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  mergeNotificationSettings,
  notificationActionUrl,
  notificationCategoryLabel,
  notificationPriorityClass,
} from './notification-engine.js?v=20260808-action-center';
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
const CHAT_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const VOICE_CALL_RING_TIMEOUT_MS = 90 * 1000;
const VOICE_CALL_STALE_MS = 2 * 60 * 1000;
const VOICE_CALL_FALLBACK_DELAY_MS = 10 * 1000;
const VOICE_CALL_FALLBACK_SAMPLE_RATE = 8000;
const VOICE_CALL_FALLBACK_CHUNK_SAMPLES = 4000;
const VOICE_CALL_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
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
    video: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-3v10l-4-3Z"/></svg>',
    cameraOff: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="m2 2 20 20"/><path d="M10.7 5H15l2 2h2a2 2 0 0 1 2 2v7.3M6.2 6.2 5 7H3a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 1.3-.5"/><path d="M14.1 14.1A3 3 0 0 1 9.9 9.9"/></svg>',
    back: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>',
    search: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    hangup: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M4.2 10.6c4.9-3.5 10.7-3.5 15.6 0a2 2 0 0 1 .7 2.4l-1 2.3a2 2 0 0 1-2.2 1.2l-3.1-.6a2 2 0 0 1-1.6-1.9v-1.2a11.4 11.4 0 0 0-1.2 0V14a2 2 0 0 1-1.6 1.9l-3.1.6a2 2 0 0 1-2.2-1.2l-1-2.3a2 2 0 0 1 .7-2.4Z"/></svg>',
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

function normalizeChatReply(reply = {}) {
  if (!reply || typeof reply !== 'object') return null;
  const messageId = clean(reply.messageId || reply.id, 180);
  if (!messageId) return null;
  return {
    messageId,
    senderUid: clean(reply.senderUid, 180),
    senderName: clean(reply.senderName || 'Mensaje', 160),
    bodyPreview: clean(reply.bodyPreview || reply.body || 'Mensaje', 240),
    messageType: clean(reply.messageType || 'text', 40),
  };
}

function chatReplyFromMessage(message = {}, chat = {}, currentUid = '', currentDisplayName = '') {
  const bodyPreview = chatMessagePreview(message.body, message.attachment);
  return normalizeChatReply({
    messageId: message.id,
    senderUid: message.senderUid,
    senderName: messageSenderDisplayName(message, chat, currentUid, currentDisplayName),
    bodyPreview,
    messageType: message.messageType || 'text',
  });
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

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value.seconds) return Number(value.seconds) * 1000;
  const parsed = Date.parse(typeof value === 'string' ? value : normalizeDate(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMessageTime(value) {
  const milliseconds = timestampMs(value);
  if (!milliseconds) return '';
  return new Date(milliseconds).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatChatListTime(value) {
  const milliseconds = timestampMs(value);
  if (!milliseconds) return '';
  const date = new Date(milliseconds);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return formatMessageTime(value);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Ayer';
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function messageDateLabel(value) {
  const milliseconds = timestampMs(value);
  if (!milliseconds) return '';
  const date = new Date(milliseconds);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Hoy';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Ayer';
  return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

function chatUnreadCount(chat = {}, currentUid = '') {
  return Math.max(0, Number(chat.unreadBy?.[currentUid] || 0) || 0);
}

function chatCounterpartUids(chat = {}, currentUid = '') {
  const ids = new Set(Object.entries(chat.participantUids || {})
    .filter(([, allowed]) => Boolean(allowed))
    .map(([uid]) => clean(uid, 180)));
  [chat.familyUserUid, chat.familyUid, chat.familia_id, chat.teacherUserUid, chat.teacherUid, chat.profesor_id]
    .map((uid) => clean(uid, 180)).filter(Boolean).forEach((uid) => ids.add(uid));
  ids.delete(clean(currentUid, 180));
  return [...ids];
}

function messageReceiptState(message = {}, chat = {}, currentUid = '') {
  const messageTime = timestampMs(message.createdAt);
  if (!messageTime) return 'sent';
  const counterparts = chatCounterpartUids(chat, currentUid);
  if (counterparts.some((uid) => timestampMs(chat.readAtBy?.[uid]) >= messageTime)) return 'read';
  if (counterparts.some((uid) => timestampMs(chat.deliveredAtBy?.[uid]) >= messageTime)) return 'delivered';
  return 'sent';
}

function renderMessageReceipt(state = 'sent') {
  const labels = { sent: 'Enviado', delivered: 'Entregado', read: 'Visto' };
  const ticks = state === 'sent' ? '✓' : '✓✓';
  return `<span class="chat-message-receipt ${state}" title="${labels[state] || labels.sent}" aria-label="${labels[state] || labels.sent}">${ticks}</span>`;
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
    teacherPhone: '',
    profesor_telefono: '',
    familyPhone: '',
    familia_telefono: '',
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

function renderChatCallActions(chat = {}, role = '') {
  if (!chat?.id || role === 'admin') return '';
  return `
    <button class="chat-icon-btn" type="button" data-chat-start-call="video" title="Videollamada" aria-label="Iniciar videollamada">${chatIcon('video')}</button>
    <button class="chat-icon-btn" type="button" data-chat-start-call="voice" title="Llamada" aria-label="Iniciar llamada de voz">${chatIcon('phone')}</button>`;
}

function chatCallStartedBody(sender, counterpart, callKind = 'voice') {
  const requester = reliableName(sender, '') || 'La otra persona';
  const target = reliableName(counterpart, '');
  const label = callKind === 'video' ? 'Videollamada' : 'Llamada de voz';
  return `${label} iniciada: ${requester} ha abierto una llamada${target ? ` con ${target}` : ''}. Pulsa "Unirse" en este chat para responder. ClasesDe10 no comparte telefonos reales.`;
}

function chatCallRequesterName(chat = {}, role = '', fallback = '') {
  if (role === 'familia') {
    return readableChatIdentity(chat.familyName, chat.familia_nombre) || 'La familia';
  }
  if (role === 'profesor') {
    return readableChatIdentity(chat.teacherName, chat.profesor_nombre) || 'El profesor';
  }
  return readableChatIdentity(fallback, chat.familyName, chat.teacherName) || 'ClasesDe10';
}

function renderChatCounterpartAvatar(chat = {}, role = '', preference = {}, variant = 'list') {
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
  const familyName = readableChatIdentity(fullName(
    assignment.familias?.usuarios?.nombre || assignment.familias?.nombre,
    assignment.familias?.usuarios?.apellidos || assignment.familias?.apellidos,
  ), fullName(
    familyProfileUser.nombre || familyProfile.nombre,
    familyProfileUser.apellidos || familyProfile.apellidos,
  ), assignment.familyName, assignment.familia_nombre, familyProfile.displayName, familyProfile.nombre_completo, assignment.familias?.usuarios?.email, familyProfileUser.email, familyProfile.email)
    || shortChatEntityLabel('Familia', familyUid);
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

function renderShell(container, role, showNotifications = true) {
  container.innerHTML = `
    <div class="chat-layout" data-chat-layout>
      <aside class="chat-list-panel">
        <div class="chat-panel-header">
          <div>
            <div class="chat-title">Mensajes <span class="chat-total-unread" data-chat-total-unread hidden></span></div>
            <div class="chat-subtitle">Familias y profesores</div>
          </div>
        </div>
        <div class="chat-tabs" ${showNotifications ? '' : 'hidden'}>
          <button type="button" class="chat-tab active" data-chat-tab="chats">Chats</button>
          <button type="button" class="chat-tab" data-chat-tab="notificaciones" ${showNotifications ? '' : 'hidden'}>Notificaciones <span data-notification-count></span></button>
        </div>
        <div class="chat-list-controls">
          <label class="chat-search-field">
            ${chatIcon('search')}
            <input type="search" data-chat-search maxlength="120" autocomplete="off" placeholder="Buscar conversación" aria-label="Buscar conversación">
          </label>
          <div class="chat-filter-chips" aria-label="Filtrar conversaciones">
            <button type="button" class="chat-filter-chip active" data-chat-filter="all">Todos</button>
            <button type="button" class="chat-filter-chip" data-chat-filter="unread">No leídos</button>
          </div>
        </div>
        <div class="chat-list" data-chat-list></div>
      </aside>
      <section class="chat-thread-panel" data-chat-panel="chats">
        <div class="chat-thread-header" data-chat-header>
          <div class="chat-empty-title">Selecciona una conversacion</div>
          <div class="chat-empty-subtitle">Elige un chat para empezar.</div>
        </div>
        <div class="chat-voice-call-bar" data-chat-voice-call-bar hidden></div>
        <div class="chat-video-call-stage" data-chat-video-stage hidden></div>
        <div class="chat-thread-search" data-chat-thread-search hidden>
          <label>
            ${chatIcon('search')}
            <input type="search" data-chat-thread-search-input maxlength="120" autocomplete="off" placeholder="Buscar en esta conversación" aria-label="Buscar mensajes en esta conversación">
          </label>
          <span data-chat-thread-search-count aria-live="polite"></span>
          <button type="button" data-chat-search-previous aria-label="Resultado anterior" title="Resultado anterior">↑</button>
          <button type="button" data-chat-search-next aria-label="Resultado siguiente" title="Resultado siguiente">↓</button>
          <button type="button" data-chat-close-thread-search aria-label="Cerrar búsqueda" title="Cerrar búsqueda">×</button>
        </div>
        <div class="chat-messages" data-chat-messages></div>
        <div class="chat-typing-indicator" data-chat-typing-indicator hidden aria-live="polite"></div>
        <section class="chat-schedule-panel" data-chat-schedule-panel style="display:none"></section>
        <form class="chat-compose" data-chat-form style="display:none">
          <input type="file" data-chat-file-input hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.webp,.gif">
          <input type="file" data-chat-image-input hidden accept="image/jpeg,image/png,image/webp,image/gif">
          <div class="chat-compose-reply" data-chat-compose-reply hidden>
            <span class="chat-compose-reply-line" aria-hidden="true"></span>
            <span class="chat-compose-reply-copy">
              <strong data-chat-compose-reply-name>Responder</strong>
              <span data-chat-compose-reply-text></span>
            </span>
            <button class="chat-compose-reply-close" type="button" data-chat-cancel-reply aria-label="Cancelar respuesta">×</button>
          </div>
          <div class="chat-compose-edit" data-chat-compose-edit hidden>
            <span class="chat-compose-reply-line" aria-hidden="true"></span>
            <span class="chat-compose-reply-copy">
              <strong>Editando mensaje</strong>
              <span>Los demás verán que se ha editado.</span>
            </span>
            <button class="chat-compose-reply-close" type="button" data-chat-cancel-edit aria-label="Cancelar edición">×</button>
          </div>
          <div class="chat-compose-tools" aria-label="Acciones del chat">
            <button class="chat-icon-btn chat-emoji-toggle" type="button" data-chat-toggle-emoji title="Emoji" aria-label="Abrir emojis" aria-expanded="false">☺</button>
            <button class="chat-icon-btn" type="button" data-chat-attach-file title="Adjuntar archivo" aria-label="Adjuntar archivo">${chatIcon('clip')}</button>
            <button class="chat-icon-btn" type="button" data-chat-attach-image title="Enviar foto" aria-label="Enviar foto">${chatIcon('image')}</button>
            <button class="chat-icon-btn" type="button" data-chat-audio-record aria-pressed="false" title="Nota de audio" aria-label="Nota de audio">${chatIcon('mic')}</button>
          </div>
          <textarea class="form-control" data-chat-input rows="1" maxlength="2000" aria-label="Mensaje" placeholder="Mensaje"></textarea>
          <button class="btn btn-primary chat-send-button" type="submit">Enviar</button>
          <div class="chat-emoji-picker" data-chat-emoji-picker hidden aria-label="Emojis rápidos">
            ${['😊', '👍', '🙌', '👏', '🎉', '❤️', '😂', '🙏', '✅', '📚', '💡', '👋'].map((emoji) => `<button type="button" data-chat-emoji="${emoji}" aria-label="Insertar ${emoji}">${emoji}</button>`).join('')}
          </div>
        </form>
      </section>
      <section class="chat-thread-panel notifications-panel" data-chat-panel="notificaciones" ${showNotifications ? 'style="display:none"' : 'hidden style="display:none"'}>
        <div class="chat-thread-header">
          <div>
            <div class="chat-thread-title">Notificaciones</div>
            <div class="chat-thread-subtitle">Solo avisos que requieren atencion.</div>
          </div>
          <div class="notifications-quick-actions">
            <button class="btn btn-outline btn-sm" type="button" data-chat-open-panel="chats">Chats</button>
            <button class="btn btn-ghost btn-sm" type="button" data-enable-browser-notifications>Activar avisos</button>
            <button class="btn btn-ghost btn-sm" type="button" data-mark-all-notifications>Marcar todo revisado</button>
          </div>
        </div>
        <details class="notification-admin-tools" data-notification-admin-tools ${role === 'admin' ? '' : 'hidden'}>
          <summary>Herramientas admin</summary>
          <form class="admin-notification-form" data-admin-notification-form>
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
          <form class="notification-settings-form" data-notification-settings-form>
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
        </details>
        <div class="notifications-list" data-notifications-list>
          <div class="chat-empty-state">Cargando notificaciones...</div>
        </div>
      </section>
    </div>
    <div class="sr-only" data-chat-live-region aria-live="polite" aria-atomic="true"></div>`;
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
  const requestedKind = normalizeScheduleKind(draft.kind || panel.dataset.scheduleKind || SCHEDULE_KIND_WEEKLY);
  const selectedKind = requestedKind === SCHEDULE_KIND_ONE_OFF ? SCHEDULE_KIND_WEEKLY : requestedKind;
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
        <button class="btn btn-primary btn-sm" type="button" data-focus-active-proposal>Responder propuesta</button>`
    : proposalDisabled && !plannerOpen
      ? `<button class="btn btn-primary btn-sm" type="button" data-open-schedule-planner="${SCHEDULE_KIND_WEEKLY}">Ver disponibilidad</button>`
      : `
        <button class="btn btn-primary btn-sm" type="button" data-open-schedule-planner="${SCHEDULE_KIND_WEEKLY}">${acceptedRecurring ? 'Cambiar semanal' : 'Proponer semanal'}</button>`;
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

function renderChatList(container, chats, selectedId, role, preferences = {}, currentUid = '', filter = 'all', search = '', drafts = {}) {
  const list = container.querySelector('[data-chat-list]');
  const searchKey = identityKey(search);
  const visibleChats = chats.filter((chat) => {
    const preference = preferences[chat.id] || {};
    if (filter === 'unread' && chatUnreadCount(chat, currentUid) === 0) return false;
    if (!searchKey) return true;
    return identityKey([chatTitle(chat, role, preference), chatSubtitle(chat, role, preference), chat.lastMessage].join(' ')).includes(searchKey);
  });
  if (!visibleChats.length) {
    list.innerHTML = chats.length
      ? '<div class="chat-empty-state">No hay conversaciones que coincidan.</div>'
      : '<div class="chat-empty-state">Sin chats activos.</div>';
    return;
  }
  list.innerHTML = visibleChats.map((chat) => {
    const preference = preferences[chat.id] || {};
    const unread = chatUnreadCount(chat, currentUid);
    const draft = clean(drafts[chat.id], 2000);
    const mine = clean(chat.lastMessageByUid, 180) === clean(currentUid, 180);
    const receiptState = mine ? messageReceiptState({ createdAt: chat.lastMessageAt }, chat, currentUid) : '';
    const preview = draft || chat.lastMessage || 'Sin mensajes todavía';
    return `
      <button class="chat-list-item ${chat.id === selectedId ? 'active' : ''} ${unread ? 'unread' : ''} ${draft ? 'has-draft' : ''}" type="button" data-chat-id="${escapeHtml(chat.id)}" aria-label="${escapeAttribute(`${chatTitle(chat, role, preference)}${draft ? ', borrador guardado' : ''}${unread ? `, ${unread} mensajes sin leer` : ''}`, 240)}">
        <span class="chat-list-main">
          ${renderChatCounterpartAvatar(chat, role, preference, 'list')}
          <span class="chat-list-copy">
            <span class="chat-list-heading"><span class="chat-list-name">${escapeHtml(chatTitle(chat, role, preference))}</span><time class="chat-list-time">${escapeHtml(formatChatListTime(chat.lastMessageAt))}</time></span>
            <span class="chat-list-meta">${escapeHtml(chatSubtitle(chat, role, preference))}</span>
            <span class="chat-list-preview-row"><span class="chat-list-preview">${draft ? '<span class="chat-draft-label">Borrador: </span>' : mine ? renderMessageReceipt(receiptState) : ''}${!draft && mine ? '<span class="chat-preview-mine">Tú: </span>' : ''}${escapeHtml(preview)}</span>${unread ? `<span class="chat-unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}</span>
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
    <button class="chat-icon-btn chat-mobile-back" type="button" data-chat-mobile-back title="Conversaciones" aria-label="Volver a conversaciones">${chatIcon('back')}</button>
    <div class="chat-thread-identity">
      ${renderChatCounterpartAvatar(chat, role, preference, 'thread')}
      <div class="chat-thread-heading">
        <div class="chat-thread-title">${escapeHtml(chatTitle(chat, role, preference))}</div>
        <div class="chat-thread-subtitle" data-chat-presence data-default-text="${escapeAttribute(chatSubtitle(chat, role, preference), 240)}">${escapeHtml(chatSubtitle(chat, role, preference))}</div>
      </div>
    </div>
    <form class="chat-alias-form" data-chat-name-form hidden>
      <input class="form-control" type="text" maxlength="120" value="${escapeHtml(customName)}" data-chat-name-input aria-label="Nombre guardado para este chat" placeholder="${escapeHtml(defaultChatTitle(chat, role))}">
      <button class="btn btn-primary btn-sm" type="submit">Guardar</button>
    </form>
    <div class="chat-header-actions">
      <button class="chat-icon-btn" type="button" data-chat-toggle-thread-search title="Buscar mensajes" aria-label="Buscar en esta conversación">${chatIcon('search')}</button>
      <button class="chat-icon-btn" type="button" data-chat-toggle-starred title="Mensajes destacados" aria-label="Mostrar mensajes destacados">★</button>
      <button class="chat-icon-btn chat-header-secondary" type="button" data-chat-toggle-schedule title="Horario" aria-label="Horario">${chatIcon('calendar')}</button>
      ${renderChatCallActions(chat, role)}
      <button class="chat-icon-btn chat-alias-toggle chat-header-secondary" type="button" data-edit-chat-name title="Nombre del chat" aria-label="Nombre del chat">${chatIcon('edit')}</button>
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

function renderHighlightedTextSegment(value = '', search = '') {
  const text = String(value || '');
  const queryText = clean(search, 120);
  if (!queryText) return escapeHtml(text);
  const lowerText = text.toLocaleLowerCase('es');
  const lowerQuery = queryText.toLocaleLowerCase('es');
  let html = '';
  let index = 0;
  let matchIndex = lowerText.indexOf(lowerQuery, index);
  while (matchIndex >= 0) {
    html += escapeHtml(text.slice(index, matchIndex));
    html += `<mark>${escapeHtml(text.slice(matchIndex, matchIndex + queryText.length))}</mark>`;
    index = matchIndex + queryText.length;
    matchIndex = lowerText.indexOf(lowerQuery, index);
  }
  html += escapeHtml(text.slice(index));
  return html;
}

function renderMessageText(value = '', search = '') {
  const text = clean(value, 2000);
  const urlPattern = /https:\/\/[^\s]+/g;
  let html = '';
  let lastIndex = 0;
  for (const match of text.matchAll(urlPattern)) {
    const url = match[0];
    html += renderHighlightedTextSegment(text.slice(lastIndex, match.index), search);
    html += `<a href="${escapeAttribute(url, 600)}" target="_blank" rel="noopener">${renderHighlightedTextSegment(url, search)}</a>`;
    lastIndex = match.index + url.length;
  }
  html += renderHighlightedTextSegment(text.slice(lastIndex), search);
  return html;
}

function renderCallMessageActions(message = {}, mine = false) {
  const callId = clean(message.callId, 180);
  if (!callId) return '';
  const label = message.callKind === 'video' ? 'Videollamada' : 'Llamada de voz';
  if (mine) {
    return `
      <div class="chat-call-message-actions">
        <span>${label} iniciada desde ClasesDe10.</span>
      </div>`;
  }
  return `
    <div class="chat-call-message-actions">
      <span>${label}. Si sigue activa, el control para responder aparece arriba del chat.</span>
    </div>`;
}

function renderMessageReply(reply = {}) {
  const normalized = normalizeChatReply(reply);
  if (!normalized) return '';
  return `
    <button class="chat-message-reply-quote" type="button" data-chat-jump-message="${escapeAttribute(normalized.messageId, 180)}" aria-label="Ir al mensaje respondido">
      <strong>${escapeHtml(normalized.senderName || 'Mensaje')}</strong>
      <span>${escapeHtml(normalized.bodyPreview || 'Mensaje')}</span>
    </button>`;
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
  if (senderUid && senderUid === currentUid) {
    if (senderRole === 'familia') {
      return readableChatIdentity(chat.familyName, chat.familia_nombre) || directName || currentName || 'Tu';
    }
    if (senderRole === 'profesor') {
      return readableChatIdentity(chat.teacherName, chat.profesor_nombre) || directName || currentName || 'Tu';
    }
    return directName || currentName || 'Tu';
  }
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

function renderMessageReactions(messageId = '', reactions = [], currentUid = '') {
  const grouped = new Map();
  reactions.filter((reaction) => reaction.messageId === messageId).forEach((reaction) => {
    const emoji = clean(reaction.emoji, 8);
    if (!CHAT_REACTION_EMOJIS.includes(emoji)) return;
    const current = grouped.get(emoji) || { emoji, count: 0, mine: false };
    current.count += 1;
    current.mine = current.mine || clean(reaction.uid, 180) === currentUid;
    grouped.set(emoji, current);
  });
  if (!grouped.size) return '';
  return `
    <div class="chat-message-reactions" aria-label="Reacciones">
      ${Array.from(grouped.values()).map((reaction) => `
        <button type="button" class="${reaction.mine ? 'mine' : ''}" data-chat-react-message="${escapeAttribute(messageId, 180)}" data-chat-reaction="${escapeAttribute(reaction.emoji, 8)}" aria-label="${escapeAttribute(`${reaction.emoji}, ${reaction.count} reacciones`, 80)}">
          <span>${reaction.emoji}</span><b>${reaction.count}</b>
        </button>`).join('')}
    </div>`;
}

function renderMessages(container, messages, currentUid, chat = {}, currentDisplayName = '', options = {}) {
  const box = container.querySelector('[data-chat-messages]');
  const search = clean(options.search, 120);
  const starredIds = options.starredIds instanceof Set ? options.starredIds : new Set(options.starredIds || []);
  const reactions = Array.isArray(options.reactions) ? options.reactions : [];
  const visibleMessages = options.showStarredOnly
    ? messages.filter((message) => starredIds.has(message.id))
    : messages;
  const hadMessages = Boolean(box.querySelector('.chat-message'));
  const distanceFromBottom = box.scrollHeight - box.scrollTop - box.clientHeight;
  const shouldStickToBottom = !hadMessages || distanceFromBottom < 120;
  const previousScrollTop = box.scrollTop;
  if (!visibleMessages.length) {
    box.innerHTML = options.showStarredOnly
      ? '<div class="chat-empty-state">No hay mensajes destacados en esta conversación.</div>'
      : '<div class="chat-empty-state">Sin mensajes todavia.</div>';
    return;
  }
  let lastDateLabel = '';
  box.innerHTML = visibleMessages.map((message) => {
    const mine = message.senderUid === currentUid;
    const deleted = Boolean(message.deletedAt);
    const attachment = deleted ? null : normalizeChatAttachment(message.attachment);
    const body = clean(message.body, 2000);
    const starred = starredIds.has(message.id);
    const searchMatch = Boolean(search && body.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
    const searchCurrent = searchMatch && message.id === options.searchCurrentId;
    const senderDisplayName = messageSenderDisplayName(message, chat, currentUid, currentDisplayName);
    const dateLabel = messageDateLabel(message.createdAt);
    const dateSeparator = dateLabel && dateLabel !== lastDateLabel
      ? `<div class="chat-date-separator"><span>${escapeHtml(dateLabel)}</span></div>`
      : '';
    lastDateLabel = dateLabel || lastDateLabel;
    const receipt = mine ? renderMessageReceipt(messageReceiptState(message, chat, currentUid)) : '';
    return `
      ${dateSeparator}
      <div class="chat-message ${mine ? 'mine' : ''} ${starred ? 'is-starred' : ''} ${deleted ? 'is-deleted' : ''} ${searchMatch ? 'is-search-match' : ''} ${searchCurrent ? 'is-search-current' : ''}" data-message-id="${escapeAttribute(message.id, 180)}">
        ${!deleted ? `<div class="chat-message-actions" aria-label="Acciones del mensaje">
          <button type="button" data-chat-open-message-reactions="${escapeAttribute(message.id, 180)}" aria-label="Reaccionar al mensaje" title="Reaccionar">☺</button>
          <button type="button" data-chat-reply-message="${escapeAttribute(message.id, 180)}" aria-label="Responder al mensaje" title="Responder">↩</button>
          <button type="button" data-chat-toggle-message-menu="${escapeAttribute(message.id, 180)}" aria-label="Más acciones" title="Más acciones">⋮</button>
        </div>
        <div class="chat-message-reaction-picker" data-chat-message-reaction-picker="${escapeAttribute(message.id, 180)}" hidden>
          ${CHAT_REACTION_EMOJIS.map((emoji) => `<button type="button" data-chat-react-message="${escapeAttribute(message.id, 180)}" data-chat-reaction="${emoji}" aria-label="Reaccionar con ${emoji}">${emoji}</button>`).join('')}
        </div>
        <div class="chat-message-more-menu" data-chat-message-menu="${escapeAttribute(message.id, 180)}" hidden>
          <button type="button" data-chat-star-message="${escapeAttribute(message.id, 180)}">${starred ? '☆ Quitar destacado' : '★ Destacar mensaje'}</button>
          ${body ? `<button type="button" data-chat-copy-message="${escapeAttribute(message.id, 180)}">⧉ Copiar texto</button>` : ''}
          ${mine && message.messageType === 'text' ? `<button type="button" data-chat-edit-message="${escapeAttribute(message.id, 180)}">✎ Editar mensaje</button>` : ''}
          ${mine ? `<button type="button" class="is-danger" data-chat-delete-message="${escapeAttribute(message.id, 180)}">⌫ Eliminar para todos</button>` : ''}
        </div>` : ''}
        <div class="chat-message-bubble">
          ${!mine && senderDisplayName ? `<div class="chat-message-sender">${escapeHtml(senderDisplayName)}</div>` : ''}
          ${deleted ? '' : renderMessageReply(message.replyTo)}
          ${body ? `<div class="chat-message-body ${deleted ? 'chat-message-deleted' : ''}">${deleted ? 'Este mensaje fue eliminado.' : renderMessageText(body, search)}</div>` : ''}
          ${!deleted && message.messageType === 'call' ? renderCallMessageActions(message, mine) : ''}
          ${attachment ? renderMessageAttachment(attachment) : ''}
          <div class="chat-message-meta">${starred ? '<span title="Mensaje destacado">★</span>' : ''}${message.editedAt && !deleted ? '<span>Editado</span>' : ''}<time>${escapeHtml(formatMessageTime(message.createdAt))}</time>${receipt}</div>
        </div>
        ${deleted ? '' : renderMessageReactions(message.id, reactions, currentUid)}
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
    return { section: role === 'admin' ? 'incidencias' : 'chat', panel: role === 'admin' ? '' : 'notificaciones', label: role === 'admin' ? 'Arreglar incidencia' : 'Ver aviso' };
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
          <div class="notification-kicker">${escapeHtml(label)}${priorityLabel ? ` · ${escapeHtml(priorityLabel)}` : ''}</div>
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
  showNotifications = true,
}) {
  if (!container) return;
  renderShell(container, role, showNotifications);
  container.dataset.chatRole = role;

  const state = {
    chats: [],
    notifications: [],
    notificationsReady: false,
    lastUnreadCount: 0,
    lastRenderedUnreadCount: -1,
    selectedChat: null,
    unsubscribe: null,
    unsubscribeProposals: null,
    unsubscribeNotifications: null,
    unsubscribePushMessages: null,
    unsubscribeVoiceCalls: null,
    unsubscribeTyping: null,
    unsubscribeReactions: null,
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
    voiceCall: null,
    currentMessages: [],
    messageReactions: [],
    replyTarget: null,
    editTarget: null,
    draftsByChat: {},
    draftSaveTimer: null,
    chatSubscriptions: new Map(),
    chatSnapshotReady: new Set(),
    previousLastMessageAt: new Map(),
    pendingReceiptWrites: new Set(),
    chatListFilter: 'all',
    chatSearch: '',
    threadSearch: '',
    threadSearchIndex: 0,
    showStarredOnly: false,
    typingTimer: null,
    typingChatId: '',
    originalDocumentTitle: document.title,
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
  const draftStorageKey = `cd10_chat_drafts_${currentUid || 'anonimo'}`;

  try {
    const storedDrafts = JSON.parse(localStorage.getItem(draftStorageKey) || '{}');
    if (storedDrafts && typeof storedDrafts === 'object' && !Array.isArray(storedDrafts)) {
      state.draftsByChat = Object.fromEntries(Object.entries(storedDrafts)
        .map(([chatId, value]) => [clean(chatId, 180), clean(value, 2000)])
        .filter(([chatId, value]) => chatId && value));
    }
  } catch (_) {
    state.draftsByChat = {};
  }

  function persistChatDrafts() {
    clearTimeout(state.draftSaveTimer);
    state.draftSaveTimer = null;
    try {
      localStorage.setItem(draftStorageKey, JSON.stringify(state.draftsByChat));
    } catch (_) {}
  }

  function updateChatDraft(chatId, value, { immediate = false } = {}) {
    const safeChatId = clean(chatId, 180);
    if (!safeChatId) return;
    const draft = clean(value, 2000);
    if (draft) state.draftsByChat[safeChatId] = draft;
    else delete state.draftsByChat[safeChatId];
    renderChatListFromState();
    clearTimeout(state.draftSaveTimer);
    if (immediate) persistChatDrafts();
    else state.draftSaveTimer = setTimeout(persistChatDrafts, 350);
  }

  function renderComposerReply() {
    const box = container.querySelector('[data-chat-compose-reply]');
    if (!box) return;
    const reply = normalizeChatReply(state.replyTarget);
    box.hidden = !reply;
    if (!reply) return;
    const name = box.querySelector('[data-chat-compose-reply-name]');
    const text = box.querySelector('[data-chat-compose-reply-text]');
    if (name) name.textContent = `Responder a ${reply.senderName || 'mensaje'}`;
    if (text) text.textContent = reply.bodyPreview || 'Mensaje';
  }

  function setComposerReply(reply = null) {
    const nextReply = normalizeChatReply(reply);
    if (nextReply && state.editTarget) setComposerEdit(null);
    state.replyTarget = nextReply;
    renderComposerReply();
    const input = container.querySelector('[data-chat-input]');
    input?.focus();
  }

  function renderComposerEdit() {
    const box = container.querySelector('[data-chat-compose-edit]');
    if (box) box.hidden = !state.editTarget;
    const replyBox = container.querySelector('[data-chat-compose-reply]');
    if (replyBox && state.editTarget) replyBox.hidden = true;
  }

  function setComposerEdit(message = null) {
    state.editTarget = message && !message.deletedAt ? message : null;
    if (state.editTarget) setComposerReply(null);
    renderComposerEdit();
    const input = container.querySelector('[data-chat-input]');
    if (!input) return;
    if (state.editTarget) {
      input.value = clean(state.editTarget.body, 2000);
      input.style.height = 'auto';
      input.style.height = `${Math.min(112, input.scrollHeight)}px`;
    } else if (state.selectedChat?.id) {
      input.value = state.draftsByChat[state.selectedChat.id] || '';
    }
    input.focus();
  }

  function starredMessageIds(chatId = state.selectedChat?.id) {
    const preference = state.chatPreferencesById[chatId] || {};
    return new Set(Array.isArray(preference.starredMessageIds) ? preference.starredMessageIds.map(String) : []);
  }

  function threadSearchMatches() {
    const search = clean(state.threadSearch, 120).toLocaleLowerCase('es');
    if (!search) return [];
    const starredIds = starredMessageIds();
    return state.currentMessages.filter((message) => (
      !message.deletedAt
      && (!state.showStarredOnly || starredIds.has(message.id))
      && clean(message.body, 2000).toLocaleLowerCase('es').includes(search)
    ));
  }

  function renderCurrentMessages({ focusSearchResult = false } = {}) {
    const matches = threadSearchMatches();
    if (matches.length) state.threadSearchIndex = Math.max(0, Math.min(state.threadSearchIndex, matches.length - 1));
    else state.threadSearchIndex = 0;
    const currentMatch = matches[state.threadSearchIndex];
    renderMessages(container, state.currentMessages, currentUid, state.selectedChat || {}, senderName, {
      reactions: state.messageReactions,
      search: state.threadSearch,
      searchCurrentId: currentMatch?.id || '',
      starredIds: starredMessageIds(),
      showStarredOnly: state.showStarredOnly,
    });
    const count = container.querySelector('[data-chat-thread-search-count]');
    if (count) count.textContent = state.threadSearch ? (matches.length ? `${state.threadSearchIndex + 1} de ${matches.length}` : 'Sin resultados') : '';
    if (focusSearchResult && currentMatch) {
      requestAnimationFrame(() => {
        container.querySelector(`[data-message-id="${CSS.escape(currentMatch.id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    }
  }

  function syncThreadHeaderControls() {
    const searchOpen = !container.querySelector('[data-chat-thread-search]')?.hidden;
    container.querySelector('[data-chat-toggle-thread-search]')?.classList.toggle('active', searchOpen);
    const starredToggle = container.querySelector('[data-chat-toggle-starred]');
    starredToggle?.classList.toggle('active', state.showStarredOnly);
    starredToggle?.setAttribute('aria-pressed', state.showStarredOnly ? 'true' : 'false');
  }

  async function persistSelectedChatPreference(patch = {}) {
    if (!state.selectedChat?.id || !currentUid) return;
    const existing = state.chatPreferencesById[state.selectedChat.id] || { exists: false };
    const payload = { ...patch, updatedAt: serverTimestamp() };
    if (!existing.exists) payload.createdAt = serverTimestamp();
    await setDoc(doc(firebaseDb, 'chats', state.selectedChat.id, 'preferencias', currentUid), payload, { merge: true });
    state.chatPreferencesById[state.selectedChat.id] = { ...existing, ...patch, exists: true };
  }

  async function copyChatText(value = '') {
    const text = clean(value, 2000);
    if (!text) return false;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    const copied = document.execCommand('copy');
    helper.remove();
    return copied;
  }

  function disposeRealtimeListeners() {
    state.disposed = true;
    [
      'unsubscribe',
      'unsubscribeProposals',
      'unsubscribeNotifications',
      'unsubscribePushMessages',
      'unsubscribeVoiceCalls',
      'unsubscribeTyping',
      'unsubscribeReactions',
    ].forEach((key) => {
      if (typeof state[key] === 'function') {
        state[key]();
        state[key] = null;
      }
    });
  }

  function disposeWidget() {
    persistChatDrafts();
    teardownVoiceCall();
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

  function messageRecipients(chat = {}) {
    return chatCounterpartUids(chat, currentUid).filter(Boolean);
  }

  function chatAfterMessageUpdates(chat, messageId, preview, messageType = 'text') {
    const updates = {
      lastMessage: clean(preview, 180) || 'Mensaje',
      lastMessageAt: serverTimestamp(),
      lastMessageByUid: currentUid,
      lastMessageId: clean(messageId, 180),
      lastMessageType: clean(messageType, 40) || 'text',
      updatedAt: serverTimestamp(),
      [`unreadBy.${currentUid}`]: 0,
      [`readAtBy.${currentUid}`]: serverTimestamp(),
    };
    messageRecipients(chat).forEach((uid) => {
      updates[`unreadBy.${uid}`] = increment(1);
    });
    return updates;
  }

  async function addSystemChatMessage(chat, body) {
    const chatRef = doc(firebaseDb, 'chats', chat.id);
    const messageRef = doc(collection(chatRef, 'mensajes'));
    const batch = writeBatch(firebaseDb);
    batch.set(messageRef, {
      senderUid: currentUid,
      senderRole: role,
      senderName,
      body,
      createdAt: serverTimestamp(),
      readBy: { [currentUid]: true },
    });
    batch.update(chatRef, chatAfterMessageUpdates(chat, messageRef.id, body, 'text'));
    await batch.commit();
  }

  async function sendChatMessage({ body = '', attachment = null, messageType = 'text', senderDisplayName = '', callId = '', callKind = '', replyTo = null } = {}) {
    if (!state.selectedChat) return;
    const safeBody = clean(body || chatAttachmentLabel(attachment), 2000);
    if (!safeBody && !attachment) return;
    const safeSenderName = readableChatIdentity(senderDisplayName, senderName) || role;
    const safeCallId = clean(callId, 180);
    const safeCallKind = clean(callKind, 20);
    const chatRef = doc(firebaseDb, 'chats', state.selectedChat.id);
    const messageRef = doc(collection(chatRef, 'mensajes'));
    const payload = {
      senderUid: currentUid,
      senderRole: role,
      senderName: safeSenderName,
      body: safeBody || 'Mensaje',
      messageType,
      createdAt: serverTimestamp(),
      readBy: { [currentUid]: true },
    };
    if (attachment) payload.attachment = normalizeChatAttachment(attachment);
    if (safeCallId) payload.callId = safeCallId;
    if (safeCallKind) payload.callKind = safeCallKind;
    const normalizedReply = normalizeChatReply(replyTo);
    if (normalizedReply) payload.replyTo = normalizedReply;
    const batch = writeBatch(firebaseDb);
    batch.set(messageRef, payload);
    batch.update(chatRef, chatAfterMessageUpdates(state.selectedChat, messageRef.id, chatMessagePreview(safeBody, attachment), messageType));
    await batch.commit();
  }

  function currentMessageById(messageId = '') {
    return state.currentMessages.find((message) => message.id === clean(messageId, 180)) || null;
  }

  async function editChatMessage(message, body = '') {
    if (!state.selectedChat?.id || !message || message.senderUid !== currentUid || message.deletedAt) return;
    const safeBody = clean(body, 2000);
    if (!safeBody) throw new Error('El mensaje no puede quedar vacío.');
    const messageRef = doc(firebaseDb, 'chats', state.selectedChat.id, 'mensajes', message.id);
    const batch = writeBatch(firebaseDb);
    batch.update(messageRef, { body: safeBody, editedAt: serverTimestamp() });
    if (state.selectedChat.lastMessageId === message.id) {
      batch.update(doc(firebaseDb, 'chats', state.selectedChat.id), {
        lastMessage: safeBody.slice(0, 180),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  async function deleteChatMessage(message) {
    if (!state.selectedChat?.id || !message || message.senderUid !== currentUid || message.deletedAt) return;
    const messageRef = doc(firebaseDb, 'chats', state.selectedChat.id, 'mensajes', message.id);
    const batch = writeBatch(firebaseDb);
    const deletePatch = {
      body: 'Mensaje eliminado',
      deletedAt: serverTimestamp(),
      deletedByUid: currentUid,
    };
    if (message.attachment) deletePatch.attachment = null;
    batch.update(messageRef, deletePatch);
    if (state.selectedChat.lastMessageId === message.id) {
      batch.update(doc(firebaseDb, 'chats', state.selectedChat.id), {
        lastMessage: 'Mensaje eliminado',
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  function chatReactionDoc(messageId = '') {
    const safeMessageId = clean(messageId, 180);
    return doc(firebaseDb, 'chats', state.selectedChat.id, 'reacciones', `${safeMessageId}_${currentUid}`);
  }

  async function toggleMessageReaction(messageId = '', emoji = '') {
    if (!state.selectedChat?.id || !currentUid) return;
    const safeMessageId = clean(messageId, 180);
    const safeEmoji = clean(emoji, 8);
    if (!safeMessageId || !CHAT_REACTION_EMOJIS.includes(safeEmoji) || !currentMessageById(safeMessageId)) return;
    const existing = state.messageReactions.find((reaction) => reaction.messageId === safeMessageId && reaction.uid === currentUid);
    const reactionRef = chatReactionDoc(safeMessageId);
    if (existing?.emoji === safeEmoji) {
      await deleteDoc(reactionRef);
      return;
    }
    const payload = {
      uid: currentUid,
      messageId: safeMessageId,
      emoji: safeEmoji,
      updatedAt: serverTimestamp(),
    };
    if (!existing) payload.createdAt = serverTimestamp();
    await setDoc(reactionRef, payload, { merge: true });
  }

  async function toggleStarredMessage(messageId = '') {
    const safeMessageId = clean(messageId, 180);
    if (!safeMessageId || !currentMessageById(safeMessageId)) return;
    const ids = starredMessageIds();
    if (ids.has(safeMessageId)) ids.delete(safeMessageId);
    else ids.add(safeMessageId);
    const starredMessageIdsValue = Array.from(ids).slice(-100);
    await persistSelectedChatPreference({ starredMessageIds: starredMessageIdsValue });
    renderCurrentMessages();
  }

  function selectedChatCallCollection(chatId = state.selectedChat?.id) {
    return collection(firebaseDb, 'chats', chatId, 'calls');
  }

  function selectedChatCallDoc(callId, chatId = state.selectedChat?.id) {
    return doc(firebaseDb, 'chats', chatId, 'calls', callId);
  }

  function voiceCallsAvailable() {
    return Boolean(window.RTCPeerConnection && window.RTCSessionDescription && window.RTCIceCandidate && navigator.mediaDevices?.getUserMedia);
  }

  function chatParticipantUidMap(chat = {}) {
    const map = {};
    if (chat.participantUids && typeof chat.participantUids === 'object') {
      Object.entries(chat.participantUids).forEach(([uid, allowed]) => {
        const safeUid = clean(uid, 180);
        if (safeUid && allowed) map[safeUid] = true;
      });
    }
    [
      currentUid,
      chat.familyUserUid,
      chat.familyUid,
      chat.familia_id,
      chat.teacherUserUid,
      chat.teacherUid,
      chat.profesor_id,
    ].map((value) => clean(value, 180)).filter(Boolean).forEach((uid) => {
      map[uid] = true;
    });
    return map;
  }

  function sessionDescriptionData(description) {
    const rawSdp = String(description?.sdp || '').slice(0, 200000);
    return {
      type: clean(description?.type, 40),
      // SDP is line-oriented and must retain its final CRLF. Trimming it makes
      // Chromium reject an otherwise valid offer/answer as an invalid SDP line.
      sdp: rawSdp && !rawSdp.endsWith('\n') ? `${rawSdp}\r\n` : rawSdp,
    };
  }

  function candidateData(candidate) {
    const json = candidate?.toJSON?.() || {};
    return {
      candidate: clean(json.candidate, 4000),
      sdpMid: json.sdpMid === null || json.sdpMid === undefined ? null : clean(json.sdpMid, 80),
      sdpMLineIndex: Number.isFinite(json.sdpMLineIndex) ? json.sdpMLineIndex : null,
      usernameFragment: json.usernameFragment === undefined || json.usernameFragment === null ? null : clean(json.usernameFragment, 120),
      createdByUid: currentUid,
      createdAt: serverTimestamp(),
    };
  }

  function setVoiceCallBar(text = '', {
    callId = '',
    callKind = state.voiceCall?.kind || 'voice',
    tone = 'active',
    canJoin = false,
    canEnd = true,
    canDecline = false,
    canMute = Boolean(state.voiceCall?.localStream),
  } = {}) {
    const bar = container.querySelector('[data-chat-voice-call-bar]');
    if (!bar) return;
    const safeCallId = clean(callId || state.voiceCall?.callId, 180);
    if (!text) {
      bar.hidden = true;
      bar.innerHTML = '';
      delete bar.dataset.callState;
      delete bar.dataset.callTransport;
      delete bar.dataset.remoteAudio;
      delete bar.dataset.callKind;
      renderVideoCallStage();
      return;
    }
    if (state.voiceCall) {
      state.voiceCall.statusText = text;
      state.voiceCall.statusOptions = { callId: safeCallId, callKind, tone, canJoin, canEnd, canDecline, canMute };
    }
    const muted = Boolean(state.voiceCall?.muted);
    bar.hidden = false;
    bar.dataset.callTone = tone;
    bar.dataset.callState = tone;
    bar.dataset.callTransport = state.voiceCall?.fallbackActive ? 'firestore' : 'webrtc';
    bar.dataset.remoteAudio = state.voiceCall?.fallbackRemoteChunks > 0 ? 'live' : 'pending';
    bar.dataset.callKind = callKind;
    const isVideo = callKind === 'video';
    const cameraOff = Boolean(state.voiceCall?.cameraOff);
    bar.innerHTML = `
      <div class="chat-voice-call-copy">
        <span class="chat-voice-call-dot" aria-hidden="true"></span>
        <div>
          <strong>${isVideo ? 'Videollamada' : 'Llamada de voz'}</strong>
          <span>${escapeHtml(text)}</span>
        </div>
      </div>
      <div class="chat-voice-call-actions">
        ${canJoin && safeCallId ? `<button class="btn btn-primary btn-sm" type="button" data-chat-join-call="${escapeAttribute(safeCallId)}">${isVideo ? chatIcon('video') : chatIcon('phone')} Unirse</button>` : ''}
        ${canDecline && safeCallId ? `<button class="btn btn-ghost btn-sm" type="button" data-chat-decline-call="${escapeAttribute(safeCallId)}">Rechazar</button>` : ''}
        ${isVideo && state.voiceCall?.localStream ? `<button class="btn btn-ghost btn-sm" type="button" data-chat-toggle-camera aria-pressed="${cameraOff ? 'true' : 'false'}">${cameraOff ? chatIcon('video') : chatIcon('cameraOff')} ${cameraOff ? 'Activar cámara' : 'Apagar cámara'}</button>` : ''}
        ${canMute ? `<button class="btn btn-ghost btn-sm" type="button" data-chat-toggle-mute aria-pressed="${muted ? 'true' : 'false'}">${chatIcon('mic')} ${muted ? 'Activar micro' : 'Silenciar'}</button>` : ''}
        ${canEnd ? `<button class="btn btn-ghost btn-sm" type="button" data-chat-end-call>${chatIcon('hangup')} Colgar</button>` : ''}
      </div>
      <audio data-chat-remote-audio autoplay playsinline></audio>`;
    const audio = bar.querySelector('[data-chat-remote-audio]');
    if (audio && state.voiceCall?.remoteStream) attachRemoteStreamToBar(state.voiceCall.remoteStream);
    renderVideoCallStage();
  }

  function renderVideoCallStage() {
    const stage = container.querySelector('[data-chat-video-stage]');
    if (!stage) return;
    const call = state.voiceCall;
    if (!call || call.kind !== 'video') {
      stage.hidden = true;
      stage.innerHTML = '';
      return;
    }
    stage.hidden = false;
    if (call.fallbackActive) {
      stage.innerHTML = '<div class="chat-video-fallback"><strong>Vídeo no disponible en esta red</strong><span>La conversación continúa por audio seguro.</span></div>';
      return;
    }
    stage.innerHTML = `
      <video class="chat-video-remote" data-chat-remote-video autoplay playsinline></video>
      <video class="chat-video-local" data-chat-local-video autoplay playsinline muted></video>
      <div class="chat-video-placeholder" data-chat-video-placeholder>Conectando vídeo…</div>`;
    const localVideo = stage.querySelector('[data-chat-local-video]');
    const remoteVideo = stage.querySelector('[data-chat-remote-video]');
    if (localVideo && call.localStream) {
      localVideo.srcObject = call.localStream;
      localVideo.play?.().catch(() => {});
    }
    if (remoteVideo && call.remoteStream) {
      remoteVideo.srcObject = call.remoteStream;
      remoteVideo.play?.().catch(() => {});
      const hasRemoteVideo = call.remoteStream.getVideoTracks?.().some((track) => track.readyState === 'live');
      stage.querySelector('[data-chat-video-placeholder]')?.toggleAttribute('hidden', Boolean(hasRemoteVideo));
    }
  }

  function teardownVoiceCall({ hideBar = true } = {}) {
    const call = state.voiceCall;
    if (!call) {
      if (hideBar) setVoiceCallBar('');
      return;
    }
    call.unsubscribers?.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch (_) {}
    });
    clearTimeout(call.connectionTimer);
    clearTimeout(call.ringTimer);
    clearTimeout(call.fallbackTimer);
    if (call.fallbackProcessor) call.fallbackProcessor.onaudioprocess = null;
    call.fallbackProcessor?.disconnect?.();
    call.fallbackSource?.disconnect?.();
    call.fallbackSilentGain?.disconnect?.();
    call.fallbackAudioContext?.close?.().catch?.(() => {});
    call.localStream?.getTracks?.().forEach((track) => track.stop());
    state.voiceCall = null;
    call.peer?.close?.();
    if (hideBar) setVoiceCallBar('');
    else renderVideoCallStage();
  }

  async function markVoiceCallEnded() {
    const call = state.voiceCall;
    if (!call?.callRef) {
      teardownVoiceCall();
      return;
    }
    try {
      await updateDoc(call.callRef, {
        status: 'ended',
        endedByUid: currentUid,
        endedByRole: role,
        endedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (_) {
      // The local call still needs to release the microphone even if the remote update fails.
    }
    teardownVoiceCall();
  }

  async function declineVoiceCall(callId) {
    const safeCallId = clean(callId, 180);
    if (!safeCallId || !state.selectedChat?.id) return;
    const callRef = selectedChatCallDoc(safeCallId, state.selectedChat.id);
    try {
      await updateDoc(callRef, {
        status: 'rejected',
        endedByUid: currentUid,
        endedByRole: role,
        endedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setVoiceCallBar('');
    } catch (error) {
      showToast('No se pudo rechazar', error.message || 'Actualiza el chat e intentalo de nuevo.', 'error');
    }
  }

  function attachRemoteStreamToBar(remoteStream) {
    const audio = container.querySelector('[data-chat-remote-audio]');
    if (!audio) return;
    audio.srcObject = remoteStream;
    const playback = audio.play?.();
    if (!playback?.catch) return;
    playback.catch(() => {
      const actions = container.querySelector('.chat-voice-call-actions');
      if (!actions || actions.querySelector('[data-chat-enable-audio]')) return;
      actions.insertAdjacentHTML('afterbegin', '<button class="btn btn-primary btn-sm" type="button" data-chat-enable-audio>Activar audio</button>');
    });
    renderVideoCallStage();
  }

  function toggleVoiceCallMute() {
    const call = state.voiceCall;
    if (!call?.localStream) return;
    call.muted = !call.muted;
    call.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !call.muted;
    });
    setVoiceCallBar(call.statusText || 'Llamada en curso.', call.statusOptions || { tone: 'active' });
  }

  function toggleVideoCamera() {
    const call = state.voiceCall;
    if (!call?.localStream || call.kind !== 'video') return;
    call.cameraOff = !call.cameraOff;
    call.localStream.getVideoTracks().forEach((track) => { track.enabled = !call.cameraOff; });
    setVoiceCallBar(call.statusText || 'Videollamada en curso.', call.statusOptions || { callKind: 'video', tone: 'active' });
  }

  function preferredVoiceTransport() {
    try {
      return clean(sessionStorage.getItem('cd10_call_transport'), 40).toLowerCase();
    } catch (_) {
      return '';
    }
  }

  function voicePeerConfiguration() {
    const preferredTransport = preferredVoiceTransport();
    const forceRelay = preferredTransport === 'relay' || preferredTransport === 'firestore';
    return {
      iceServers: VOICE_CALL_ICE_SERVERS,
      iceCandidatePoolSize: 4,
      ...(forceRelay ? { iceTransportPolicy: 'relay' } : {}),
    };
  }

  function floatSampleToMuLaw(value) {
    let sample = Math.max(-1, Math.min(1, Number(value) || 0)) * 32767;
    const sign = sample < 0 ? 0x80 : 0;
    if (sample < 0) sample = -sample;
    sample = Math.min(32635, Math.round(sample)) + 0x84;
    let exponent = 7;
    for (let mask = 0x4000; exponent > 0 && (sample & mask) === 0; mask >>= 1) exponent -= 1;
    const mantissa = (sample >> (exponent + 3)) & 0x0f;
    return (~(sign | (exponent << 4) | mantissa)) & 0xff;
  }

  function muLawToFloatSample(value) {
    const decoded = (~Number(value)) & 0xff;
    const sign = decoded & 0x80;
    const exponent = (decoded >> 4) & 0x07;
    const mantissa = decoded & 0x0f;
    let sample = ((mantissa << 3) + 0x84) << exponent;
    sample -= 0x84;
    return (sign ? -sample : sample) / 32768;
  }

  function downsampleToMuLaw(input, inputRate) {
    const ratio = Math.max(1, Number(inputRate) / VOICE_CALL_FALLBACK_SAMPLE_RATE);
    const outputLength = Math.max(1, Math.floor(input.length / ratio));
    const output = new Uint8Array(outputLength);
    for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
      const start = Math.floor(outputIndex * ratio);
      const end = Math.min(input.length, Math.max(start + 1, Math.floor((outputIndex + 1) * ratio)));
      let total = 0;
      for (let inputIndex = start; inputIndex < end; inputIndex += 1) total += input[inputIndex];
      output[outputIndex] = floatSampleToMuLaw(total / Math.max(1, end - start));
    }
    return output;
  }

  function bytesToBase64(bytes) {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(String(value || ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function ensureVoiceAudioActivationButton() {
    const actions = container.querySelector('.chat-voice-call-actions');
    if (!actions || actions.querySelector('[data-chat-enable-audio]')) return;
    actions.insertAdjacentHTML('afterbegin', '<button class="btn btn-primary btn-sm" type="button" data-chat-enable-audio>Activar audio</button>');
  }

  function playFallbackAudioBytes(call, bytes) {
    const audioContext = call?.fallbackAudioContext;
    if (!audioContext || !bytes?.length || state.voiceCall !== call) return;
    const buffer = audioContext.createBuffer(1, bytes.length, VOICE_CALL_FALLBACK_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < bytes.length; index += 1) channel[index] = muLawToFloatSample(bytes[index]);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    const earliestStart = audioContext.currentTime + 0.05;
    const startAt = Math.max(earliestStart, call.fallbackNextPlaybackAt || (audioContext.currentTime + 0.15));
    source.start(startAt);
    call.fallbackNextPlaybackAt = startAt + buffer.duration;
  }

  function flushFallbackPlaybackQueue(call = state.voiceCall) {
    if (!call?.fallbackAudioContext || call.fallbackAudioContext.state !== 'running') return;
    const pending = call.fallbackPlaybackQueue?.splice(0) || [];
    pending.forEach((bytes) => playFallbackAudioBytes(call, bytes));
  }

  async function resumeFallbackAudio(call = state.voiceCall) {
    if (!call?.fallbackAudioContext) return;
    await call.fallbackAudioContext.resume().catch(() => {});
    if (call.fallbackAudioContext.state === 'running') flushFallbackPlaybackQueue(call);
    else ensureVoiceAudioActivationButton();
  }

  function scheduleFallbackPlayback(call, encodedAudio) {
    if (!call?.fallbackActive || state.voiceCall !== call || !encodedAudio) return;
    let bytes;
    try {
      bytes = base64ToBytes(encodedAudio);
    } catch (error) {
      console.warn('No se pudo decodificar un tramo de audio seguro', error);
      return;
    }
    call.fallbackRemoteChunks = (call.fallbackRemoteChunks || 0) + 1;
    if (call.fallbackRemoteChunks === 1) {
      setVoiceCallBar('Conectada. Audio seguro activo.', { tone: 'connected', canMute: true });
    }
    if (call.fallbackAudioContext?.state === 'running') {
      playFallbackAudioBytes(call, bytes);
      return;
    }
    call.fallbackPlaybackQueue = call.fallbackPlaybackQueue || [];
    call.fallbackPlaybackQueue.push(bytes);
    if (call.fallbackPlaybackQueue.length > 20) call.fallbackPlaybackQueue.shift();
    ensureVoiceAudioActivationButton();
  }

  function watchFallbackAudio(call) {
    const remoteUid = clean(call?.remoteUid, 180);
    if (!remoteUid) return null;
    const seenSequences = new Set();
    return onSnapshot(
      collection(call.callRef, 'audioStreams', remoteUid, 'chunks'),
      (snap) => {
        const changes = snap.docChanges()
          .filter((change) => ['added', 'modified'].includes(change.type))
          .map((change) => change.doc.data() || {})
          .filter((data) => Number.isInteger(data.seq) && !seenSequences.has(data.seq))
          .sort((a, b) => a.seq - b.seq);
        changes.forEach((data) => {
          seenSequences.add(data.seq);
          if (seenSequences.size > 120) {
            const oldest = Math.min(...seenSequences);
            seenSequences.delete(oldest);
          }
          scheduleFallbackPlayback(call, data.audio);
        });
      },
      (error) => {
        console.warn('No se pudo recibir el audio seguro de la llamada', error);
        if (state.voiceCall === call) setVoiceCallBar('Reconectando el audio seguro...', { tone: 'warning', canMute: true });
      },
    );
  }

  async function writeFallbackAudioChunk(call, bytes) {
    if (!call?.fallbackActive || state.voiceCall !== call || !bytes?.length) return;
    const sequence = call.fallbackSequence || 0;
    call.fallbackSequence = sequence + 1;
    const slotId = `slot_${String(sequence % 12).padStart(2, '0')}`;
    const chunkRef = doc(call.callRef, 'audioStreams', currentUid, 'chunks', slotId);
    await setDoc(chunkRef, {
      senderUid: currentUid,
      seq: sequence,
      sampleRate: VOICE_CALL_FALLBACK_SAMPLE_RATE,
      codec: 'mulaw',
      audio: bytesToBase64(bytes),
      createdAt: serverTimestamp(),
    });
  }

  async function startFirestoreAudioFallback() {
    const call = state.voiceCall;
    if (!call || call.fallbackActive || call.fallbackStarting) return;
    if (!clean(call.remoteUid, 180)) {
      clearTimeout(call.fallbackTimer);
      call.fallbackTimer = setTimeout(() => startFirestoreAudioFallback(), 500);
      return;
    }
    call.fallbackStarting = true;
    try {
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextConstructor) throw new Error('El navegador no permite el canal de audio alternativo.');
      call.fallbackActive = true;
      clearTimeout(call.connectionTimer);
      clearTimeout(call.fallbackTimer);
      const previousPeer = call.peer;
      call.peer = null;
      previousPeer?.close?.();
      if (call.kind === 'video') {
        call.videoFallback = true;
        call.localStream?.getVideoTracks?.().forEach((track) => track.stop());
        renderVideoCallStage();
      }

      const audioContext = new AudioContextConstructor({ latencyHint: 'interactive' });
      const source = audioContext.createMediaStreamSource(call.localStream);
      const processor = audioContext.createScriptProcessor(2048, 1, 1);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      call.fallbackAudioContext = audioContext;
      call.fallbackSource = source;
      call.fallbackProcessor = processor;
      call.fallbackSilentGain = silentGain;
      call.fallbackPendingBytes = [];
      call.fallbackPlaybackQueue = [];
      call.fallbackSequence = call.fallbackSequence || 0;
      call.fallbackRemoteChunks = call.fallbackRemoteChunks || 0;
      call.fallbackWriteQueue = call.fallbackWriteQueue || Promise.resolve();
      processor.onaudioprocess = (event) => {
        if (!call.fallbackActive || state.voiceCall !== call || call.muted) return;
        const encoded = downsampleToMuLaw(event.inputBuffer.getChannelData(0), audioContext.sampleRate);
        call.fallbackPendingBytes.push(...encoded);
        while (call.fallbackPendingBytes.length >= VOICE_CALL_FALLBACK_CHUNK_SAMPLES) {
          const bytes = Uint8Array.from(call.fallbackPendingBytes.splice(0, VOICE_CALL_FALLBACK_CHUNK_SAMPLES));
          call.fallbackWriteQueue = call.fallbackWriteQueue
            .then(() => writeFallbackAudioChunk(call, bytes))
            .catch((error) => {
              console.warn('No se pudo enviar un tramo de audio seguro', error);
              if (state.voiceCall === call) setVoiceCallBar('Reconectando el audio seguro...', { tone: 'warning', canMute: true });
            });
        }
      };
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);
      const unsubscribe = watchFallbackAudio(call);
      if (unsubscribe) call.unsubscribers.push(unsubscribe);
      setVoiceCallBar('Conectando audio seguro...', { tone: 'active', canMute: true });
      await resumeFallbackAudio(call);
      await updateDoc(call.callRef, {
        status: 'active',
        transportMode: 'firestore_audio',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      call.fallbackActive = false;
      console.warn('No se pudo activar el audio seguro alternativo', error);
      if (state.voiceCall === call) setVoiceCallBar('No se ha podido conectar el audio. Intentalo de nuevo.', { tone: 'warning', canMute: true });
    } finally {
      call.fallbackStarting = false;
    }
  }

  function scheduleVoiceFallback(peer, delay = null) {
    const call = state.voiceCall;
    if (!call || call.peer !== peer || call.fallbackActive) return;
    clearTimeout(call.fallbackTimer);
    const preferredDelay = preferredVoiceTransport() === 'firestore' ? 500 : VOICE_CALL_FALLBACK_DELAY_MS;
    call.fallbackTimer = setTimeout(() => {
      if (state.voiceCall !== call || call.fallbackActive || peer.connectionState === 'connected') return;
      startFirestoreAudioFallback();
    }, Number.isFinite(delay) ? delay : preferredDelay);
  }

  async function createVoicePeer(callRef, candidateCollectionName, callKind = 'voice') {
    const wantsVideo = callKind === 'video';
    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: wantsVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
    });
    const remoteStream = new MediaStream();
    const peer = new RTCPeerConnection(voicePeerConfiguration());
    localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
    peer.addEventListener('track', (event) => {
      const stream = event.streams?.[0];
      if (stream) {
        stream.getTracks().forEach((track) => {
          if (!remoteStream.getTracks().some((item) => item.id === track.id)) remoteStream.addTrack(track);
        });
      } else if (event.track) {
        remoteStream.addTrack(event.track);
      }
      attachRemoteStreamToBar(remoteStream);
      renderVideoCallStage();
    });
    peer.addEventListener('icecandidate', (event) => {
      if (!event.candidate) return;
      addDoc(collection(callRef, candidateCollectionName), candidateData(event.candidate)).catch((error) => {
        console.warn('No se pudo guardar candidato de llamada', error);
      });
    });
    peer.addEventListener('connectionstatechange', async () => {
      if (state.voiceCall?.peer !== peer) return;
      if (peer.connectionState === 'connected') {
        clearTimeout(state.voiceCall.connectionTimer);
        clearTimeout(state.voiceCall.fallbackTimer);
        state.voiceCall.connectionTimer = null;
        setVoiceCallBar(wantsVideo ? 'Conectada. Ya podéis veros y hablar.' : 'Conectada. Ya podéis hablar.', { callKind, tone: 'connected', canMute: true });
      } else if (peer.connectionState === 'disconnected') {
        setVoiceCallBar('Recuperando la conexion...', { tone: 'warning', canMute: true });
        clearTimeout(state.voiceCall.connectionTimer);
        state.voiceCall.connectionTimer = setTimeout(() => {
          if (state.voiceCall?.peer !== peer || peer.connectionState === 'connected') return;
          startFirestoreAudioFallback();
        }, 8000);
      } else if (peer.connectionState === 'failed') {
        setVoiceCallBar('Cambiando al audio seguro...', { tone: 'warning', canMute: true });
        startFirestoreAudioFallback();
      } else if (peer.connectionState === 'closed') {
        teardownVoiceCall();
      }
    });
    return { peer, localStream, remoteStream };
  }

  async function addOrQueueRemoteCandidate(peer, data = {}) {
    const call = state.voiceCall;
    if (!call || call.peer !== peer || !data.candidate) return;
    const candidate = new RTCIceCandidate({
      candidate: clean(data.candidate, 4000),
      sdpMid: data.sdpMid ?? null,
      sdpMLineIndex: data.sdpMLineIndex ?? null,
      usernameFragment: data.usernameFragment ?? null,
    });
    if (!peer.remoteDescription?.type) {
      call.pendingRemoteCandidates.push(candidate);
      return;
    }
    try {
      await peer.addIceCandidate(candidate);
    } catch (error) {
      if (peer.signalingState !== 'closed') console.warn('No se pudo aplicar candidato remoto de llamada', error);
    }
  }

  async function flushRemoteCandidates(peer) {
    const call = state.voiceCall;
    if (!call || call.peer !== peer || !peer.remoteDescription?.type) return;
    const pending = call.pendingRemoteCandidates.splice(0);
    for (const candidate of pending) {
      try {
        await peer.addIceCandidate(candidate);
      } catch (error) {
        if (peer.signalingState !== 'closed') console.warn('No se pudo aplicar candidato remoto pendiente', error);
      }
    }
  }

  function watchRemoteCandidates(callRef, candidateCollectionName, peer) {
    const seen = new Set();
    return onSnapshot(collection(callRef, candidateCollectionName), (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type !== 'added' || seen.has(change.doc.id)) return;
        seen.add(change.doc.id);
        const data = change.doc.data() || {};
        if (clean(data.createdByUid, 180) === currentUid || !data.candidate) return;
        addOrQueueRemoteCandidate(peer, data);
      });
    }, (error) => {
      console.warn('No se pudieron recibir candidatos de llamada', error);
    });
  }

  function watchVoiceCallDocument(callRef, peer, mode) {
    return onSnapshot(callRef, async (snap) => {
      if (!snap.exists() || state.voiceCall?.callRef?.path !== callRef.path) return;
      const data = snap.data() || {};
      if (['ended', 'failed', 'missed', 'rejected'].includes(data.status)) {
        teardownVoiceCall();
        const endedCopy = data.status === 'rejected'
          ? 'La llamada ha sido rechazada.'
          : data.status === 'missed' ? 'La llamada no ha sido atendida.' : 'La llamada ha terminado.';
        showToast('Llamada finalizada', endedCopy, 'info');
        return;
      }
      if (mode === 'caller' && data.answeredByUid) state.voiceCall.remoteUid = clean(data.answeredByUid, 180);
      if (mode === 'answerer' && data.createdByUid) state.voiceCall.remoteUid = clean(data.createdByUid, 180);
      if (data.transportMode === 'firestore_audio' && !state.voiceCall.fallbackActive) {
        await startFirestoreAudioFallback();
        return;
      }
      if (mode === 'caller' && data.answer && !state.voiceCall.remoteDescriptionSet && !state.voiceCall.remoteDescriptionPending) {
        state.voiceCall.remoteDescriptionPending = true;
        try {
          await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
          state.voiceCall.remoteDescriptionSet = true;
          await flushRemoteCandidates(peer);
          setVoiceCallBar(state.voiceCall.kind === 'video' ? 'Conectando vídeo…' : 'Conectando audio…', { callKind: state.voiceCall.kind, tone: 'active', canMute: true });
          scheduleVoiceFallback(peer);
        } catch (error) {
          showToast('No se pudo conectar', error.message || 'La llamada no pudo completarse.', 'error');
        } finally {
          if (state.voiceCall?.peer === peer) state.voiceCall.remoteDescriptionPending = false;
        }
      }
    });
    state.chatSubscriptions.forEach((unsubscribe) => {
      try { unsubscribe(); } catch (_) {}
    });
    state.chatSubscriptions.clear();
    clearTimeout(state.typingTimer);
    document.title = state.originalDocumentTitle;
  }

  function voiceCallCreatedAtMs(call = {}) {
    if (typeof call.createdAt?.toMillis === 'function') return call.createdAt.toMillis();
    const parsed = Date.parse(call.createdAt || '');
    return Number.isFinite(parsed) ? parsed : Date.now();
  }

  function freshVoiceCallsFromSnapshot(snap) {
    const oldestAllowed = Date.now() - VOICE_CALL_STALE_MS;
    return snap.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((item) => voiceCallCreatedAtMs(item) >= oldestAllowed)
      .sort((a, b) => voiceCallCreatedAtMs(b) - voiceCallCreatedAtMs(a));
  }

  async function findOpenVoiceCall(chatId) {
    const snap = await getDocs(query(
      collection(firebaseDb, 'chats', chatId, 'calls'),
      where('status', 'in', ['ringing', 'active']),
      limit(8),
    ));
    const fresh = freshVoiceCallsFromSnapshot(snap);
    const freshIds = new Set(fresh.map((item) => item.id));
    snap.docs.forEach((item) => {
      if (freshIds.has(item.id)) return;
      updateDoc(item.ref, { status: 'missed', endedAt: serverTimestamp(), updatedAt: serverTimestamp() }).catch(() => {});
    });
    return fresh[0] || null;
  }

  function watchIncomingVoiceCalls(chat) {
    if (!chat?.id || role === 'admin') return null;
    const openCallsQuery = query(
      collection(firebaseDb, 'chats', chat.id, 'calls'),
      where('status', 'in', ['ringing', 'active']),
      limit(8),
    );
    return onSnapshot(openCallsQuery, (snap) => {
      if (state.selectedChat?.id !== chat.id || state.voiceCall) return;
      const incoming = freshVoiceCallsFromSnapshot(snap)
        .find((item) => clean(item.createdByUid, 180) !== currentUid);
      if (!incoming) {
        setVoiceCallBar('');
        return;
      }
      const caller = readableChatIdentity(incoming.callerName) || 'La otra persona';
      const callKind = incoming.kind === 'video' ? 'video' : 'voice';
      const copy = incoming.status === 'active'
        ? `Hay una ${callKind === 'video' ? 'videollamada' : 'llamada'} en curso. Puedes unirte ahora.`
        : `${caller} te está llamando${callKind === 'video' ? ' por vídeo' : ''}.`;
      setVoiceCallBar(copy, {
        callId: incoming.id,
        callKind,
        tone: 'active',
        canJoin: true,
        canEnd: false,
        canDecline: incoming.status === 'ringing',
        canMute: false,
      });
    }, (error) => {
      console.warn('No se pudo escuchar el estado de las llamadas', error);
    });
  }

  function scheduleRingingTimeout(callRef, peer) {
    const call = state.voiceCall;
    if (!call || call.peer !== peer) return;
    call.ringTimer = setTimeout(async () => {
      if (state.voiceCall?.peer !== peer) return;
      try {
        const snap = await getDoc(callRef);
        if (snap.exists() && snap.data()?.status === 'ringing') {
          await updateDoc(callRef, {
            status: 'missed',
            endedByUid: currentUid,
            endedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (_) {}
      if (state.voiceCall?.peer === peer) {
        teardownVoiceCall();
        showToast('Sin respuesta', 'La llamada no ha sido atendida.', 'info');
      }
    }, VOICE_CALL_RING_TIMEOUT_MS);
  }

  async function startVoiceCall(button, requestedKind = 'voice') {
    if (!state.selectedChat || role === 'admin') return;
    const callKind = requestedKind === 'video' ? 'video' : 'voice';
    if (!voiceCallsAvailable()) {
      showToast('Llamadas no disponibles', 'Este navegador no permite llamadas de voz desde la web.', 'warning');
      return;
    }
    const chat = state.selectedChat;
    const chatId = chat.id;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      const openCall = await findOpenVoiceCall(chatId).catch(() => null);
      if (openCall?.id) {
        if (clean(openCall.createdByUid, 180) !== currentUid) {
          await joinVoiceCall(openCall.id, button);
          return;
        }
        await updateDoc(selectedChatCallDoc(openCall.id, chatId), {
          status: 'failed',
          endedByUid: currentUid,
          endedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      teardownVoiceCall();
      const callRef = doc(selectedChatCallCollection(chatId));
      const { peer, localStream, remoteStream } = await createVoicePeer(callRef, 'offerCandidates', callKind);
      state.voiceCall = {
        callId: callRef.id,
        chatId,
        callRef,
        peer,
        localStream,
        remoteStream,
        unsubscribers: [],
        pendingRemoteCandidates: [],
        remoteDescriptionSet: false,
        remoteDescriptionPending: false,
        muted: false,
        mode: 'caller',
        kind: callKind,
        cameraOff: false,
        remoteUid: '',
        fallbackActive: false,
        fallbackStarting: false,
        fallbackRemoteChunks: 0,
      };
      setVoiceCallBar('Llamando… La otra persona recibirá el aviso en este chat.', { callId: callRef.id, callKind, tone: 'active', canMute: true });
      const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: callKind === 'video' });
      await peer.setLocalDescription(offer);
      await setDoc(callRef, {
        kind: callKind,
        status: 'ringing',
        createdByUid: currentUid,
        createdByRole: role,
        callerName: chatCallRequesterName(chat, role, senderName),
        participantUids: chatParticipantUidMap(chat),
        offer: sessionDescriptionData(peer.localDescription),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      state.voiceCall.unsubscribers.push(watchVoiceCallDocument(callRef, peer, 'caller'));
      state.voiceCall.unsubscribers.push(watchRemoteCandidates(callRef, 'answerCandidates', peer));
      scheduleRingingTimeout(callRef, peer);
      const counterpart = chatTitle(chat, role, state.chatPreferencesById?.[chatId] || {});
      const requester = chatCallRequesterName(chat, role, senderName);
      await sendChatMessage({
        body: chatCallStartedBody(requester, counterpart, callKind),
        messageType: 'call',
        senderDisplayName: requester,
        callId: callRef.id,
        callKind,
      }).catch((error) => {
        console.warn('La llamada se inicio, pero no se pudo guardar el mensaje informativo', error);
      });
      showToast(callKind === 'video' ? 'Videollamada iniciada' : 'Llamada iniciada', 'La otra persona puede pulsar Unirse. No se comparte ningún teléfono.', 'success');
      await refreshChats();
      selectChat(chatId);
    } catch (error) {
      teardownVoiceCall();
      showToast('No se pudo iniciar la llamada', error.message || 'Revisa permisos de microfono y chat.', 'error');
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }

  async function joinVoiceCall(callId, button = null) {
    if (!state.selectedChat || role === 'admin') return;
    if (!voiceCallsAvailable()) {
      showToast('Llamadas no disponibles', 'Este navegador no permite llamadas de voz desde la web.', 'warning');
      return;
    }
    const safeCallId = clean(callId, 180);
    if (!safeCallId) return;
    const chatId = state.selectedChat.id;
    const callRef = selectedChatCallDoc(safeCallId, chatId);
    button?.setAttribute('aria-busy', 'true');
    if (button) button.disabled = true;
    try {
      const callSnap = await getDoc(callRef);
      if (!callSnap.exists()) throw new Error('La llamada ya no existe.');
      const callData = callSnap.data() || {};
      const callKind = callData.kind === 'video' ? 'video' : 'voice';
      if (!['ringing', 'active'].includes(callData.status)) throw new Error('La llamada ya ha terminado.');
      if (clean(callData.createdByUid, 180) === currentUid) throw new Error('Esta llamada ya la has iniciado tu.');
      if (!callData.offer?.sdp) throw new Error('La llamada aun no esta preparada.');
      teardownVoiceCall();
      const { peer, localStream, remoteStream } = await createVoicePeer(callRef, 'answerCandidates', callKind);
      state.voiceCall = {
        callId: safeCallId,
        chatId,
        callRef,
        peer,
        localStream,
        remoteStream,
        unsubscribers: [],
        pendingRemoteCandidates: [],
        remoteDescriptionSet: false,
        remoteDescriptionPending: false,
        muted: false,
        mode: 'answerer',
        kind: callKind,
        cameraOff: false,
        remoteUid: clean(callData.createdByUid, 180),
        fallbackActive: false,
        fallbackStarting: false,
        fallbackRemoteChunks: 0,
      };
      setVoiceCallBar(callKind === 'video' ? 'Conectando vídeo…' : 'Conectando audio…', { callId: safeCallId, callKind, tone: 'active', canMute: true });
      state.voiceCall.unsubscribers.push(watchVoiceCallDocument(callRef, peer, 'answerer'));
      state.voiceCall.unsubscribers.push(watchRemoteCandidates(callRef, 'offerCandidates', peer));
      await peer.setRemoteDescription(new RTCSessionDescription(callData.offer));
      state.voiceCall.remoteDescriptionSet = true;
      await flushRemoteCandidates(peer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await updateDoc(callRef, {
        status: 'active',
        answer: sessionDescriptionData(peer.localDescription),
        answeredByUid: currentUid,
        answeredByRole: role,
        startedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      scheduleVoiceFallback(peer);
      showToast(callKind === 'video' ? 'Entrando en videollamada' : 'Entrando en llamada', 'Conexión dentro de ClasesDe10, sin teléfonos reales.', 'success');
    } catch (error) {
      teardownVoiceCall();
      showToast('No se pudo entrar en la llamada', error.message || 'Permite el microfono e intentalo de nuevo.', 'error');
    } finally {
      button?.removeAttribute('aria-busy');
      if (button) button.disabled = false;
    }
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
      replyTo: state.replyTarget,
    });
    setComposerReply(null);
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
          await sendChatMessage({ body: 'Nota de audio', attachment, messageType: 'audio', replyTo: state.replyTarget });
          setComposerReply(null);
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

  function sortChatsByActivity() {
    state.chats.sort((a, b) => timestampMs(b.lastMessageAt || b.updatedAt) - timestampMs(a.lastMessageAt || a.updatedAt));
  }

  function renderChatListFromState() {
    sortChatsByActivity();
    renderChatList(
      container,
      state.chats,
      state.selectedChat?.id,
      role,
      state.chatPreferencesById,
      currentUid,
      state.chatListFilter,
      state.chatSearch,
      state.draftsByChat,
    );
    const totalUnread = state.chats.reduce((total, chat) => total + chatUnreadCount(chat, currentUid), 0);
    const counter = container.querySelector('[data-chat-total-unread]');
    if (counter) {
      counter.hidden = totalUnread === 0;
      counter.textContent = totalUnread > 99 ? '99+' : String(totalUnread || '');
    }
    document.querySelectorAll('.sidebar-link[data-section="chat"]').forEach((link) => {
      let badge = link.querySelector('[data-chat-nav-unread]');
      if (!badge && totalUnread) {
        badge = document.createElement('span');
        badge.dataset.chatNavUnread = '';
        badge.className = 'chat-nav-unread';
        link.appendChild(badge);
      }
      if (badge) {
        badge.hidden = totalUnread === 0;
        badge.textContent = totalUnread > 99 ? '99+' : String(totalUnread || '');
      }
      link.classList.toggle('has-chat-unread', totalUnread > 0);
    });
    document.querySelectorAll('.hamburger-btn').forEach((button) => {
      let badge = button.querySelector('[data-chat-menu-unread]');
      if (!badge && totalUnread) {
        badge = document.createElement('b');
        badge.dataset.chatMenuUnread = '';
        badge.className = 'chat-menu-unread';
        button.appendChild(badge);
      }
      if (badge) {
        badge.hidden = totalUnread === 0;
        badge.textContent = totalUnread > 99 ? '99+' : String(totalUnread || '');
        badge.setAttribute('aria-label', `${totalUnread} mensajes sin leer`);
      }
      button.classList.toggle('has-chat-unread', totalUnread > 0);
    });
    document.title = totalUnread ? `(${totalUnread}) ${state.originalDocumentTitle}` : state.originalDocumentTitle;
    if (state.lastRenderedUnreadCount !== totalUnread) {
      state.lastRenderedUnreadCount = totalUnread;
      window.dispatchEvent(new CustomEvent('cd10:chat-unread', { detail: { count: totalUnread } }));
    }
  }

  function playIncomingMessageTone() {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return;
    try {
      const audioContext = new AudioContextConstructor();
      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.18);
      const oscillator = audioContext.createOscillator();
      oscillator.frequency.setValueAtTime(740, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime + 0.08);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.2);
      oscillator.addEventListener('ended', () => audioContext.close().catch(() => {}), { once: true });
    } catch (_) {}
  }

  function notifyIncomingChatMessage(chat) {
    const title = chatTitle(chat, role, state.chatPreferencesById[chat.id] || {});
    const body = clean(chat.lastMessage, 180) || 'Nuevo mensaje';
    const liveRegion = container.querySelector('[data-chat-live-region]');
    if (liveRegion) liveRegion.textContent = `Nuevo mensaje de ${title}: ${body}`;
    playIncomingMessageTone();
    const shouldInterrupt = state.selectedChat?.id !== chat.id || document.visibilityState !== 'visible' || !container.offsetParent;
    if (shouldInterrupt) {
      showToast(`Mensaje de ${title}`, body, 'info');
      showBrowserNotification(`Mensaje de ${title}`, body, {
        url: `${window.location.pathname}#chat`,
        type: 'chat_message',
        chatId: chat.id,
      });
    }
  }

  async function markChatDelivered(chat) {
    if (!chat?.id || clean(chat.lastMessageByUid, 180) === currentUid) return;
    const lastMessageAt = timestampMs(chat.lastMessageAt);
    if (!lastMessageAt || timestampMs(chat.deliveredAtBy?.[currentUid]) >= lastMessageAt) return;
    const key = `delivered:${chat.id}:${lastMessageAt}`;
    if (state.pendingReceiptWrites.has(key)) return;
    state.pendingReceiptWrites.add(key);
    try {
      await updateDoc(doc(firebaseDb, 'chats', chat.id), {
        [`deliveredAtBy.${currentUid}`]: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.warn('No se pudo confirmar la entrega del mensaje', error);
    } finally {
      state.pendingReceiptWrites.delete(key);
    }
  }

  async function markChatRead(chat) {
    if (!chat?.id || document.visibilityState !== 'visible' || !container.offsetParent) return;
    const lastMessageAt = timestampMs(chat.lastMessageAt);
    const unread = chatUnreadCount(chat, currentUid);
    if (!unread && (!lastMessageAt || timestampMs(chat.readAtBy?.[currentUid]) >= lastMessageAt)) return;
    const key = `read:${chat.id}:${lastMessageAt}`;
    if (state.pendingReceiptWrites.has(key)) return;
    state.pendingReceiptWrites.add(key);
    const optimisticTime = new Date().toISOString();
    chat.unreadBy = { ...(chat.unreadBy || {}), [currentUid]: 0 };
    chat.readAtBy = { ...(chat.readAtBy || {}), [currentUid]: optimisticTime };
    chat.deliveredAtBy = { ...(chat.deliveredAtBy || {}), [currentUid]: optimisticTime };
    renderChatListFromState();
    try {
      await updateDoc(doc(firebaseDb, 'chats', chat.id), {
        [`unreadBy.${currentUid}`]: 0,
        [`deliveredAtBy.${currentUid}`]: serverTimestamp(),
        [`readAtBy.${currentUid}`]: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.warn('No se pudo guardar el visto del chat', error);
    } finally {
      state.pendingReceiptWrites.delete(key);
    }
  }

  function applyRealtimeChat(chatId, data = {}) {
    const index = state.chats.findIndex((item) => item.id === chatId);
    if (index < 0) return;
    const previous = state.chats[index];
    const next = { ...previous, ...data, id: chatId };
    const previousMessageAt = state.previousLastMessageAt.get(chatId) || timestampMs(previous.lastMessageAt);
    const nextMessageAt = timestampMs(next.lastMessageAt);
    const wasReady = state.chatSnapshotReady.has(chatId);
    state.chats[index] = next;
    if (state.selectedChat?.id === chatId) {
      state.selectedChat = next;
      if (state.currentMessages.length) renderCurrentMessages();
    }
    renderChatListFromState();
    if (wasReady && nextMessageAt > previousMessageAt && clean(next.lastMessageByUid, 180) !== currentUid) {
      notifyIncomingChatMessage(next);
    }
    state.chatSnapshotReady.add(chatId);
    state.previousLastMessageAt.set(chatId, nextMessageAt);
    if (clean(next.lastMessageByUid, 180) !== currentUid) markChatDelivered(next);
    if (state.selectedChat?.id === chatId) markChatRead(next);
  }

  function syncChatRealtimeSubscriptions() {
    const activeIds = new Set(state.chats.map((chat) => chat.id));
    state.chatSubscriptions.forEach((unsubscribe, chatId) => {
      if (activeIds.has(chatId)) return;
      unsubscribe();
      state.chatSubscriptions.delete(chatId);
    });
    state.chats.forEach((chat) => {
      if (state.chatSubscriptions.has(chat.id)) return;
      const unsubscribe = onSnapshot(doc(firebaseDb, 'chats', chat.id), (snap) => {
        if (!isCurrentSessionActive() || !snap.exists()) return;
        applyRealtimeChat(chat.id, snap.data() || {});
      }, (error) => console.warn('No se pudo actualizar la conversación en tiempo real', error));
      state.chatSubscriptions.set(chat.id, unsubscribe);
    });
  }

  async function refreshChats() {
    container.querySelector('[data-chat-list]').innerHTML = '<div class="chat-empty-state">Cargando chats...</div>';
    state.chats = await loadChats(db, role, profileId, usuario, currentActorIds);
    state.chatPreferencesById = await loadChatPreferences(state.chats, currentUid);
    renderChatListFromState();
    syncChatRealtimeSubscriptions();
    if (!state.selectedChat && state.chats.length && !window.matchMedia('(max-width: 720px)').matches) selectChat(state.chats[0].id);
  }

  async function publishTyping(chatId, isTyping) {
    const safeChatId = clean(chatId, 180);
    if (!safeChatId || !currentUid) return;
    await setDoc(doc(firebaseDb, 'chats', safeChatId, 'typing', currentUid), {
      uid: currentUid,
      name: senderName,
      isTyping: Boolean(isTyping),
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch(() => {});
  }

  function stopTyping(chatId = state.typingChatId) {
    clearTimeout(state.typingTimer);
    state.typingTimer = null;
    state.lastTypingWriteAt = 0;
    state.typingChatId = '';
    if (chatId) publishTyping(chatId, false);
  }

  function scheduleTyping() {
    const chatId = state.selectedChat?.id;
    if (!chatId) return;
    const now = Date.now();
    state.typingChatId = chatId;
    if (!state.lastTypingWriteAt || now - state.lastTypingWriteAt > 1800) {
      state.lastTypingWriteAt = now;
      publishTyping(chatId, true);
    }
    clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(() => stopTyping(chatId), 2400);
  }

  function watchTyping(chat) {
    const indicator = container.querySelector('[data-chat-typing-indicator]');
    if (!chat?.id || !indicator) return null;
    return onSnapshot(collection(firebaseDb, 'chats', chat.id, 'typing'), (snap) => {
      const active = snap.docs.map((item) => item.data() || {}).find((entry) => (
        clean(entry.uid, 180) !== currentUid
        && entry.isTyping === true
        && Date.now() - timestampMs(entry.updatedAt) < 8000
      ));
      indicator.hidden = !active;
      indicator.textContent = active ? `${readableChatIdentity(active.name) || 'La otra persona'} está escribiendo…` : '';
      const presence = container.querySelector('[data-chat-presence]');
      if (presence) {
        presence.textContent = active ? 'escribiendo…' : (presence.dataset.defaultText || chatSubtitle(chat, role, state.chatPreferencesById[chat.id] || {}));
        presence.classList.toggle('is-typing', Boolean(active));
      }
    }, () => {
      indicator.hidden = true;
      indicator.textContent = '';
      const presence = container.querySelector('[data-chat-presence]');
      if (presence) {
        presence.textContent = presence.dataset.defaultText || chatSubtitle(chat, role, state.chatPreferencesById[chat.id] || {});
        presence.classList.remove('is-typing');
      }
    });
  }

  function selectChat(chatId) {
    const chat = state.chats.find((item) => item.id === chatId);
    if (!chat) return;
    if (state.selectedChat?.id && state.selectedChat.id !== chatId) stopTyping(state.selectedChat.id);
    setComposerReply(null);
    setComposerEdit(null);
    state.threadSearch = '';
    state.threadSearchIndex = 0;
    state.showStarredOnly = false;
    state.messageReactions = [];
    const threadSearch = container.querySelector('[data-chat-thread-search]');
    if (threadSearch) threadSearch.hidden = true;
    const threadSearchInput = container.querySelector('[data-chat-thread-search-input]');
    if (threadSearchInput) threadSearchInput.value = '';
    const emojiPicker = container.querySelector('[data-chat-emoji-picker]');
    const emojiToggle = container.querySelector('[data-chat-toggle-emoji]');
    if (emojiPicker) emojiPicker.hidden = true;
    emojiToggle?.setAttribute('aria-expanded', 'false');
    state.selectedChat = chat;
    container.querySelector('[data-chat-layout]')?.classList.add('chat-mobile-thread-open');
    renderChatListFromState();
    renderThreadHeader(container, chat, role, state.chatPreferencesById[chat.id] || {});
    syncThreadHeaderControls();
    container.querySelector('[data-chat-form]').style.display = '';
    const draftInput = container.querySelector('[data-chat-input]');
    if (draftInput) {
      draftInput.value = state.draftsByChat[chat.id] || '';
      draftInput.style.height = 'auto';
      draftInput.style.height = `${Math.min(112, draftInput.scrollHeight)}px`;
    }
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
    if (state.unsubscribeVoiceCalls) state.unsubscribeVoiceCalls();
    if (state.unsubscribeTyping) state.unsubscribeTyping();
    if (state.unsubscribeReactions) state.unsubscribeReactions();
    state.unsubscribeVoiceCalls = watchIncomingVoiceCalls(chat);
    state.unsubscribeTyping = watchTyping(chat);
    state.unsubscribeReactions = onSnapshot(
      query(collection(firebaseDb, 'chats', chat.id, 'reacciones'), limit(500)),
      (snap) => {
        if (!isCurrentSessionActive() || state.selectedChat?.id !== chat.id) return;
        state.messageReactions = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
        renderCurrentMessages();
      },
      (error) => console.warn('No se pudieron cargar las reacciones del chat', error),
    );
    const messagesQuery = query(
      collection(firebaseDb, 'chats', chat.id, 'mensajes'),
      orderBy('createdAt', 'desc'),
      limit(250),
    );
    state.unsubscribe = onSnapshot(messagesQuery, (snap) => {
      if (!isCurrentSessionActive()) return;
      state.currentMessages = snap.docs.map((item) => ({ id: item.id, ...item.data() })).reverse();
      renderCurrentMessages();
      markChatRead(state.selectedChat || chat);
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
    if (!event.target.closest('[data-chat-toggle-emoji], [data-chat-emoji-picker]')) {
      const picker = container.querySelector('[data-chat-emoji-picker]');
      const toggle = container.querySelector('[data-chat-toggle-emoji]');
      if (picker) picker.hidden = true;
      toggle?.setAttribute('aria-expanded', 'false');
    }
    if (!event.target.closest('[data-chat-open-message-reactions], [data-chat-message-reaction-picker], [data-chat-react-message]')) {
      container.querySelectorAll('[data-chat-message-reaction-picker]').forEach((picker) => { picker.hidden = true; });
    }
    if (!event.target.closest('[data-chat-toggle-message-menu], [data-chat-message-menu]')) {
      container.querySelectorAll('[data-chat-message-menu]').forEach((menu) => { menu.hidden = true; });
    }

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

    const toggleThreadSearch = event.target.closest('[data-chat-toggle-thread-search]');
    if (toggleThreadSearch) {
      const searchPanel = container.querySelector('[data-chat-thread-search]');
      if (!searchPanel) return;
      searchPanel.hidden = !searchPanel.hidden;
      toggleThreadSearch.classList.toggle('active', !searchPanel.hidden);
      if (!searchPanel.hidden) container.querySelector('[data-chat-thread-search-input]')?.focus();
      return;
    }

    if (event.target.closest('[data-chat-close-thread-search]')) {
      const searchPanel = container.querySelector('[data-chat-thread-search]');
      if (searchPanel) searchPanel.hidden = true;
      state.threadSearch = '';
      state.threadSearchIndex = 0;
      const input = container.querySelector('[data-chat-thread-search-input]');
      if (input) input.value = '';
      container.querySelector('[data-chat-toggle-thread-search]')?.classList.remove('active');
      renderCurrentMessages();
      return;
    }

    const searchNavigation = event.target.closest('[data-chat-search-previous], [data-chat-search-next]');
    if (searchNavigation) {
      const matches = threadSearchMatches();
      if (!matches.length) return;
      const direction = searchNavigation.matches('[data-chat-search-previous]') ? -1 : 1;
      state.threadSearchIndex = (state.threadSearchIndex + direction + matches.length) % matches.length;
      renderCurrentMessages({ focusSearchResult: true });
      return;
    }

    const toggleStarred = event.target.closest('[data-chat-toggle-starred]');
    if (toggleStarred) {
      state.showStarredOnly = !state.showStarredOnly;
      toggleStarred.classList.toggle('active', state.showStarredOnly);
      toggleStarred.setAttribute('aria-pressed', state.showStarredOnly ? 'true' : 'false');
      renderCurrentMessages();
      return;
    }

    const emojiToggle = event.target.closest('[data-chat-toggle-emoji]');
    if (emojiToggle) {
      const picker = container.querySelector('[data-chat-emoji-picker]');
      if (!picker) return;
      picker.hidden = !picker.hidden;
      emojiToggle.setAttribute('aria-expanded', picker.hidden ? 'false' : 'true');
      if (!picker.hidden) picker.querySelector('button')?.focus();
      return;
    }

    const emojiButton = event.target.closest('[data-chat-emoji]');
    if (emojiButton) {
      const input = container.querySelector('[data-chat-input]');
      if (!input) return;
      const emoji = emojiButton.dataset.chatEmoji || '';
      const start = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
      const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : start;
      input.setRangeText(emoji, start, end, 'end');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      container.querySelector('[data-chat-emoji-picker]').hidden = true;
      container.querySelector('[data-chat-toggle-emoji]')?.setAttribute('aria-expanded', 'false');
      input.focus();
      return;
    }

    if (event.target.closest('[data-chat-cancel-reply]')) {
      setComposerReply(null);
      return;
    }

    if (event.target.closest('[data-chat-cancel-edit]')) {
      setComposerEdit(null);
      return;
    }

    const openReactionPicker = event.target.closest('[data-chat-open-message-reactions]');
    if (openReactionPicker) {
      const picker = container.querySelector(`[data-chat-message-reaction-picker="${CSS.escape(openReactionPicker.dataset.chatOpenMessageReactions || '')}"]`);
      if (picker) picker.hidden = !picker.hidden;
      return;
    }

    const reactionButton = event.target.closest('[data-chat-react-message]');
    if (reactionButton) {
      try {
        await toggleMessageReaction(reactionButton.dataset.chatReactMessage, reactionButton.dataset.chatReaction);
      } catch (error) {
        showToast('No se guardó la reacción', error.message || 'Inténtalo de nuevo.', 'error');
      }
      return;
    }

    const messageMenuToggle = event.target.closest('[data-chat-toggle-message-menu]');
    if (messageMenuToggle) {
      const menu = container.querySelector(`[data-chat-message-menu="${CSS.escape(messageMenuToggle.dataset.chatToggleMessageMenu || '')}"]`);
      if (menu) menu.hidden = !menu.hidden;
      return;
    }

    const starButton = event.target.closest('[data-chat-star-message]');
    if (starButton) {
      try {
        await toggleStarredMessage(starButton.dataset.chatStarMessage);
      } catch (error) {
        showToast('No se pudo destacar', error.message || 'Inténtalo de nuevo.', 'error');
      }
      return;
    }

    const editButton = event.target.closest('[data-chat-edit-message]');
    if (editButton) {
      const message = currentMessageById(editButton.dataset.chatEditMessage);
      container.querySelectorAll('[data-chat-message-menu]').forEach((menu) => { menu.hidden = true; });
      if (message) setComposerEdit(message);
      return;
    }

    const deleteButton = event.target.closest('[data-chat-delete-message]');
    if (deleteButton) {
      if (deleteButton.dataset.confirmDelete !== 'true') {
        deleteButton.dataset.confirmDelete = 'true';
        deleteButton.textContent = 'Confirmar eliminación';
        setTimeout(() => {
          if (!deleteButton.isConnected) return;
          delete deleteButton.dataset.confirmDelete;
          deleteButton.textContent = '⌫ Eliminar para todos';
        }, 3500);
        return;
      }
      const message = currentMessageById(deleteButton.dataset.chatDeleteMessage);
      try {
        await deleteChatMessage(message);
        if (state.editTarget?.id === message?.id) setComposerEdit(null);
        showToast('Mensaje eliminado', 'Ya no se muestra su contenido en la conversación.', 'success');
      } catch (error) {
        showToast('No se pudo eliminar', error.message || 'Inténtalo de nuevo.', 'error');
      }
      return;
    }

    const replyButton = event.target.closest('[data-chat-reply-message]');
    if (replyButton) {
      const message = state.currentMessages.find((item) => String(item.id) === String(replyButton.dataset.chatReplyMessage));
      if (message) setComposerReply(chatReplyFromMessage(message, state.selectedChat || {}, currentUid, senderName));
      return;
    }

    const copyButton = event.target.closest('[data-chat-copy-message]');
    if (copyButton) {
      const message = state.currentMessages.find((item) => String(item.id) === String(copyButton.dataset.chatCopyMessage));
      try {
        const copied = await copyChatText(message?.body || '');
        showToast(copied ? 'Mensaje copiado' : 'No se pudo copiar', copied ? 'Ya puedes pegarlo donde quieras.' : 'Selecciona el texto manualmente.', copied ? 'success' : 'warning');
      } catch (_) {
        showToast('No se pudo copiar', 'Selecciona el texto manualmente.', 'warning');
      }
      return;
    }

    const jumpButton = event.target.closest('[data-chat-jump-message]');
    if (jumpButton) {
      const target = container.querySelector(`[data-message-id="${CSS.escape(jumpButton.dataset.chatJumpMessage || '')}"]`);
      if (target) {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        target.classList.add('is-highlighted');
        setTimeout(() => target.classList.remove('is-highlighted'), 1400);
      } else {
        showToast('Mensaje anterior', 'Ese mensaje ya no está entre los últimos cargados.', 'info');
      }
      return;
    }

    const mobileBack = event.target.closest('[data-chat-mobile-back]');
    if (mobileBack) {
      stopTyping(state.selectedChat?.id);
      setComposerReply(null);
      state.selectedChat = null;
      state.currentMessages = [];
      state.unsubscribe?.();
      state.unsubscribe = null;
      state.unsubscribeProposals?.();
      state.unsubscribeProposals = null;
      state.unsubscribeVoiceCalls?.();
      state.unsubscribeVoiceCalls = null;
      state.unsubscribeTyping?.();
      state.unsubscribeTyping = null;
      state.unsubscribeReactions?.();
      state.unsubscribeReactions = null;
      setComposerEdit(null);
      container.querySelector('[data-chat-layout]')?.classList.remove('chat-mobile-thread-open');
      container.querySelector('[data-chat-header]').innerHTML = '<div><div class="chat-empty-title">Selecciona una conversación</div><div class="chat-empty-subtitle">Elige un chat para empezar.</div></div>';
      container.querySelector('[data-chat-messages]').innerHTML = '';
      container.querySelector('[data-chat-form]').style.display = 'none';
      renderChatListFromState();
      return;
    }

    const chatFilter = event.target.closest('[data-chat-filter]');
    if (chatFilter) {
      state.chatListFilter = chatFilter.dataset.chatFilter === 'unread' ? 'unread' : 'all';
      container.querySelectorAll('[data-chat-filter]').forEach((button) => {
        button.classList.toggle('active', button === chatFilter);
      });
      renderChatListFromState();
      return;
    }

    const startCall = event.target.closest('[data-chat-start-call]');
    if (startCall) {
      await startVoiceCall(startCall, startCall.dataset.chatStartCall);
      return;
    }

    const joinCall = event.target.closest('[data-chat-join-call]');
    if (joinCall) {
      await joinVoiceCall(joinCall.dataset.chatJoinCall, joinCall);
      return;
    }

    const endCall = event.target.closest('[data-chat-end-call]');
    if (endCall) {
      await markVoiceCallEnded();
      return;
    }

    const declineCall = event.target.closest('[data-chat-decline-call]');
    if (declineCall) {
      await declineVoiceCall(declineCall.dataset.chatDeclineCall);
      return;
    }

    const toggleMute = event.target.closest('[data-chat-toggle-mute]');
    if (toggleMute) {
      toggleVoiceCallMute();
      return;
    }

    const toggleCamera = event.target.closest('[data-chat-toggle-camera]');
    if (toggleCamera) {
      toggleVideoCamera();
      return;
    }

    const enableAudio = event.target.closest('[data-chat-enable-audio]');
    if (enableAudio) {
      const audio = container.querySelector('[data-chat-remote-audio]');
      await audio?.play?.().catch(() => {});
      await resumeFallbackAudio();
      enableAudio.remove();
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
    panel.dataset.scheduleKind = SCHEDULE_KIND_WEEKLY;
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

      const button = chatNameForm.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await persistSelectedChatPreference({ displayNameOverride });
        renderChatListFromState();
        renderThreadHeader(container, state.selectedChat, role, state.chatPreferencesById[state.selectedChat.id] || {});
        syncThreadHeaderControls();
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

  container.querySelector('[data-chat-search]')?.addEventListener('input', (event) => {
    state.chatSearch = clean(event.currentTarget.value, 120);
    renderChatListFromState();
  });

  container.querySelector('[data-chat-thread-search-input]')?.addEventListener('input', (event) => {
    state.threadSearch = clean(event.currentTarget.value, 120);
    state.threadSearchIndex = 0;
    renderCurrentMessages({ focusSearchResult: Boolean(state.threadSearch) });
  });

  const chatInput = container.querySelector('[data-chat-input]');
  chatInput?.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = `${Math.min(112, chatInput.scrollHeight)}px`;
    if (state.selectedChat?.id && !state.editTarget) updateChatDraft(state.selectedChat.id, chatInput.value);
    if (clean(chatInput.value, 2000)) scheduleTyping();
    else stopTyping(state.selectedChat?.id);
  });
  chatInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const picker = container.querySelector('[data-chat-emoji-picker]');
      if (picker && !picker.hidden) {
        picker.hidden = true;
        container.querySelector('[data-chat-toggle-emoji]')?.setAttribute('aria-expanded', 'false');
        event.preventDefault();
        return;
      }
      if (state.replyTarget) {
        setComposerReply(null);
        event.preventDefault();
        return;
      }
      if (state.editTarget) {
        setComposerEdit(null);
        event.preventDefault();
        return;
      }
    }
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    container.querySelector('[data-chat-form]')?.requestSubmit();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.selectedChat) markChatRead(state.selectedChat);
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-section="chat"]')) return;
    setTimeout(() => {
      if (state.selectedChat) markChatRead(state.selectedChat);
    }, 80);
  });
  window.addEventListener('hashchange', () => {
    if (window.location.hash !== '#chat') return;
    setTimeout(() => {
      if (state.selectedChat) markChatRead(state.selectedChat);
    }, 80);
  });

  container.querySelector('[data-chat-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = container.querySelector('[data-chat-input]');
    const body = clean(input.value, 2000);
    if (!body || !state.selectedChat) return;
    const chatId = state.selectedChat.id;
    const replyTo = state.replyTarget;
    const editTarget = state.editTarget;

    input.disabled = true;
    try {
      if (editTarget) await editChatMessage(editTarget, body);
      else await sendChatMessage({ body, messageType: 'text', replyTo });
      input.value = '';
      input.style.height = 'auto';
      if (!editTarget) updateChatDraft(chatId, '', { immediate: true });
      if (state.selectedChat?.id === chatId) {
        setComposerReply(null);
        if (editTarget) setComposerEdit(null);
      }
      stopTyping(chatId);
    } catch (error) {
      console.error(editTarget ? 'No se pudo editar el mensaje' : 'No se pudo enviar el mensaje', error);
      showToast(editTarget ? 'No se editó el mensaje' : 'No se envió el mensaje', error.message || 'Revisa permisos de chat.', 'error');
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
    if (showNotifications && role === 'admin') {
      const loaded = await loadNotificationSettings();
      state.notificationSettings = loaded.settings;
      state.notificationPublicConfig = loaded.publicConfig;
      renderNotificationSettings(container, state.notificationSettings, state.notificationPublicConfig);
    }
    if (showNotifications) {
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
    }
    await refreshChats();
  } catch (error) {
    console.error('No se pudieron cargar chats', error);
    container.querySelector('[data-chat-list]').innerHTML = '<div class="chat-empty-state">No se pudieron cargar los chats.</div>';
    showToast('Chat no disponible', error.message || 'No se pudieron cargar los chats.', 'error');
  }
}
