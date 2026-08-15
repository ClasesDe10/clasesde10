import {
  classEndAt,
  classStartAt,
  cleanCalendarText,
  normalizeDateString,
  normalizeTimeString,
} from './calendar-engine.js';

function pad(value) {
  return String(value).padStart(2, '0');
}

function toIcsDate(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function toIcsDay(value) {
  const text = normalizeDateString(value);
  if (!text) return '';
  return text.replace(/-/g, '');
}

function addDaysToIsoDay(value, days = 1) {
  const text = normalizeDateString(value);
  if (!text) return '';
  const date = new Date(`${text}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function escapeIcs(value) {
  return cleanCalendarText(value, 2000)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldIcsLine(line) {
  const chunks = [];
  let rest = line;
  while (rest.length > 74) {
    chunks.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  chunks.push(rest);
  return chunks.join('\r\n');
}

export function classCalendarUid(classData = {}, fallbackId = '') {
  return cleanCalendarText(
    classData.calendarUid
    || classData.id
    || fallbackId
    || `${classData.fecha || classData.date}-${classData.hora_inicio || classData.startTime}-${classData.profesor_id || classData.teacherUid}-${classData.alumno_id || classData.studentId}`,
    180,
  ).replace(/[^a-zA-Z0-9_.-]/g, '-');
}

export function classCalendarSummary(classData = {}) {
  if (classData.calendarTitle || classData.summary || classData.title) {
    return cleanCalendarText(classData.calendarTitle || classData.summary || classData.title, 160);
  }
  if (classData.calendarEventType === 'family_payment_due') return 'ClasesDe10 - Dia de pago';
  if (classData.calendarEventType === 'teacher_payout_day') return 'ClasesDe10 - Cobro previsto';
  return cleanCalendarText(`ClasesDe10 - ${classData.materia || classData.subject || 'Clase'}`, 160);
}

function calendarPersonName(role, id = '', ...values) {
  const generic = new Set(['profesor', 'profesora', 'profesor/a', 'alumno', 'alumna', 'alumno/a', 'sin nombre', 'contacto']);
  for (const value of values) {
    const candidate = cleanCalendarText(value, 180);
    const key = candidate.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const generated = candidate
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .match(/^(?:profesor(?:a|\/a)?|profesor asignado|docente|alumno(?:a|\/a)?|familia)\s+([A-Za-z0-9_-]{1,12})$/i);
    const token = generated?.[1]?.replace(/[^A-Za-z0-9]/g, '') || '';
    const generatedName = /^[a-z]$/i.test(candidate)
      || (generated && (token.length <= 1 || /\d/.test(token) || /^[A-Z]{2,8}$/.test(token) || /^[a-f0-9]{6,12}$/i.test(token)));
    if (candidate && !generic.has(key) && !generatedName) return candidate;
  }
  return `${role} pendiente de nombre`;
}

export function classCalendarDescription(classData = {}) {
  if (classData.calendarDescription || classData.description) {
    return cleanCalendarText(classData.calendarDescription || classData.description, 2000);
  }
  if (classData.calendarEventType === 'family_payment_due') {
    const group = classData.paymentGroup || {};
    return [
      `Alumno: ${calendarPersonName('Alumno', group.studentId || group.alumno_id, group.studentName)}`,
      `Profesor: ${calendarPersonName('Profesor', group.teacherUid || group.profesor_id, group.teacherName)}`,
      group.amount ? `Importe: ${group.amount} EUR` : '',
      group.classCount ? `Clases incluidas: ${group.classCount}` : '',
      `Bizum a: ${group.paymentRecipientName || 'Miguel G. G.'} (${group.paymentRecipientPhone || '613016665'})`,
      'ClasesDe10 recibe el pago y despues liquida al profesor correspondiente.',
    ].filter(Boolean).join('\n');
  }
  if (classData.calendarEventType === 'teacher_payout_day') {
    return [
      `Periodo: ${classData.periodStart || ''} - ${classData.periodEnd || ''}`,
      classData.payoutAmount ? `Importe previsto: ${classData.payoutAmount} EUR` : '',
      Array.isArray(classData.payoutClasses) ? `Clases incluidas: ${classData.payoutClasses.length}` : '',
    ].filter(Boolean).join('\n');
  }
  const studentName = calendarPersonName('Alumno', classData.alumno_id || classData.studentId, classData.alumno_nombre, classData.studentName);
  const teacherName = calendarPersonName('Profesor', classData.profesor_id || classData.teacherUid, classData.profesor_nombre, classData.teacherName);
  return [
    `Materia: ${classData.materia || classData.subject || 'Clase'}`,
    `Alumno: ${studentName}`,
    `Profesor: ${teacherName}`,
    classData.observaciones ? `Notas: ${classData.observaciones}` : '',
  ].filter(Boolean).join('\n');
}

export function buildIcsEvent(classData = {}, options = {}) {
  const forceAllDay = classData.allDay === true
    || classData.calendarEventType === 'family_payment_due'
    || classData.calendarEventType === 'teacher_payout_day';
  const start = forceAllDay ? null : classStartAt(classData);
  const end = forceAllDay ? null : classEndAt(classData);
  const day = normalizeDateString(classData.fecha || classData.date || classData.payoutDate || classData.dueDate);
  if ((!start || !end) && !day) return '';
  const uid = `${classCalendarUid(classData, options.fallbackId)}@clasesde10.com`;
  const stamp = toIcsDate(options.now ? new Date(options.now) : new Date());
  const status = ['cancelada'].includes(cleanCalendarText(classData.estado || classData.status).toLowerCase())
    ? 'CANCELLED'
    : 'CONFIRMED';
  const dateLines = start && end
    ? [
        `DTSTART:${toIcsDate(start)}`,
        `DTEND:${toIcsDate(end)}`,
      ]
    : [
        `DTSTART;VALUE=DATE:${toIcsDay(day)}`,
        `DTEND;VALUE=DATE:${toIcsDay(addDaysToIsoDay(day, 1))}`,
      ];
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    ...dateLines,
    `SUMMARY:${escapeIcs(classCalendarSummary(classData))}`,
    `DESCRIPTION:${escapeIcs(classCalendarDescription(classData))}`,
    `STATUS:${status}`,
    'END:VEVENT',
  ];
  return lines.map(foldIcsLine).join('\r\n');
}

export function buildIcsCalendar(classes = [], options = {}) {
  const events = classes.map((item, index) => buildIcsEvent(item, { ...options, fallbackId: `class-${index}` })).filter(Boolean);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ClasesDe10//Calendar//ES',
    `X-WR-CALNAME:${escapeIcs(options.calendarName || 'ClasesDe10')}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export function googleCalendarTemplateUrl(classData = {}) {
  const forceAllDay = classData.allDay === true
    || classData.calendarEventType === 'family_payment_due'
    || classData.calendarEventType === 'teacher_payout_day';
  const start = forceAllDay ? null : classStartAt(classData);
  const end = forceAllDay ? null : classEndAt(classData);
  const day = normalizeDateString(classData.fecha || classData.date || classData.payoutDate || classData.dueDate);
  if ((!start || !end) && !day) return '';
  const dates = start && end
    ? `${toIcsDate(start).replace(/Z$/, 'Z')}/${toIcsDate(end).replace(/Z$/, 'Z')}`
    : `${toIcsDay(day)}/${toIcsDay(addDaysToIsoDay(day, 1))}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: classCalendarSummary(classData),
    dates,
    details: classCalendarDescription(classData),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function calendarSyncMetadata(classData = {}) {
  return {
    version: 1,
    uid: classCalendarUid(classData),
    date: normalizeDateString(classData.fecha || classData.date),
    startTime: normalizeTimeString(classData.hora_inicio || classData.startTime),
    endTime: normalizeTimeString(classData.hora_fin || classData.endTime),
    providers: {
      google: {
        status: 'not_connected',
        mode: 'future_oauth_push',
        requiredScopes: ['https://www.googleapis.com/auth/calendar.events'],
      },
      ical: {
        status: 'ready',
        mode: 'download_or_feed',
      },
    },
  };
}
