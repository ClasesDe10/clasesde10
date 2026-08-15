export const ONE_OFF_SCHEDULE_KIND = 'one_off';

function clean(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function oneOffIsoDateLocal(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function oneOffAddLocalDays(date = new Date(), days = 0) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + Number(days || 0));
}

function parseIsoDate(value = '') {
  const raw = clean(value, 20).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function parseSpanishDate(value = '') {
  const raw = clean(value, 20).replace(/[.\s-]+/g, '/');
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const rawYear = Number(match[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function normalizeOneOffDateInput(value = '') {
  const date = parseIsoDate(value) || parseSpanishDate(value);
  return date ? oneOffIsoDateLocal(date) : '';
}

export function normalizeOneOffTimeInput(value = '') {
  const raw = clean(value, 12).replace(/[.hH]/g, ':').replace(/\s+/g, '');
  if (!raw) return '';
  const compact = raw.match(/^(\d{1,2})(\d{2})$/);
  const colon = raw.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  const hour = compact ? Number(compact[1]) : colon ? Number(colon[1]) : NaN;
  const minute = compact ? Number(compact[2]) : colon ? Number(colon[2] || 0) : NaN;
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
  return `${pad2(hour)}:${pad2(minute)}`;
}

export function oneOffTimeToMinutes(value = '') {
  const normalized = normalizeOneOffTimeInput(value);
  if (!normalized) return NaN;
  const [hour, minute] = normalized.split(':').map(Number);
  return hour * 60 + minute;
}

export function oneOffDefaultDraft(now = new Date()) {
  return {
    date: oneOffIsoDateLocal(oneOffAddLocalDays(now, 1)),
    start: '17:00',
    end: '18:00',
    modality: 'por_acordar',
    notes: '',
  };
}

export function oneOffDateBounds(now = new Date(), maxDays = 548) {
  return {
    min: oneOffIsoDateLocal(now),
    max: oneOffIsoDateLocal(oneOffAddLocalDays(now, maxDays)),
  };
}

export function validateOneOffClassDraft(input = {}, options = {}) {
  const date = normalizeOneOffDateInput(input.date || input.fecha);
  const start = normalizeOneOffTimeInput(input.start || input.hora_inicio);
  const end = normalizeOneOffTimeInput(input.end || input.hora_fin);
  if (!date) return { valid: false, field: 'date', message: 'Elige una fecha completa con dia, mes y ano.' };
  if (!start) return { valid: false, field: 'start', message: 'Indica una hora de inicio valida.' };
  if (!end) return { valid: false, field: 'end', message: 'Indica una hora de fin valida.' };

  const classDate = parseIsoDate(date);
  const now = options.now instanceof Date ? options.now : new Date();
  const minDate = parseIsoDate(options.minDate) || new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const maxDate = parseIsoDate(options.maxDate) || oneOffAddLocalDays(minDate, Number(options.maxDays || 548));
  if (classDate < minDate) return { valid: false, field: 'date', message: 'La clase puntual no puede quedar en una fecha pasada.' };
  if (classDate > maxDate) return { valid: false, field: 'date', message: 'La fecha queda demasiado lejos. Revisa el ano elegido.' };

  const startMinutes = oneOffTimeToMinutes(start);
  const endMinutes = oneOffTimeToMinutes(end);
  const durationMinutes = endMinutes - startMinutes;
  const minDuration = Number(options.minDurationMinutes || 15);
  const maxDuration = Number(options.maxDurationMinutes || 360);
  if (durationMinutes <= 0) return { valid: false, field: 'end', message: 'La hora de fin debe ser posterior a la de inicio.' };
  if (durationMinutes < minDuration) return { valid: false, field: 'end', message: `La clase debe durar al menos ${minDuration} minutos.` };
  if (durationMinutes > maxDuration) return { valid: false, field: 'end', message: `La clase no puede durar mas de ${Math.round(maxDuration / 60)} horas.` };

  return {
    valid: true,
    date,
    start,
    end,
    durationMinutes,
  };
}

export function buildOneOffScheduleProposal(chat = {}, input = {}, context = {}) {
  const validation = validateOneOffClassDraft(input, context);
  if (!validation.valid) return { validation, proposal: null };
  const serverTimestamp = typeof context.serverTimestamp === 'function'
    ? context.serverTimestamp
    : () => new Date().toISOString();
  const currentUid = clean(context.currentUid, 180);
  const role = clean(context.role, 40);
  const notes = clean(input.notes || input.notas, 300);
  const modality = clean(input.modality || input.modalidad || 'por_acordar', 40) || 'por_acordar';
  const proposal = {
    assignmentId: clean(chat.id || chat.assignmentId || chat.asignacion_id, 180),
    asignacion_id: clean(chat.asignacion_id || chat.assignmentId || chat.id, 180),
    familyUid: clean(chat.familyUid || chat.familia_id, 180),
    familia_id: clean(chat.familia_id || chat.familyUid, 180),
    teacherUid: clean(chat.teacherUid || chat.profesor_id, 180),
    profesor_id: clean(chat.profesor_id || chat.teacherUid, 180),
    studentId: clean(chat.studentId || chat.alumno_id, 180) || null,
    alumno_id: clean(chat.alumno_id || chat.studentId, 180) || null,
    materia: clean(chat.materia || chat.subject || input.subject || input.materia, 180),
    subject: clean(chat.subject || chat.materia || input.subject || input.materia, 180),
    kind: ONE_OFF_SCHEDULE_KIND,
    scheduleKind: ONE_OFF_SCHEDULE_KIND,
    firstClassDate: validation.date,
    fecha: validation.date,
    hora_inicio: validation.start,
    hora_fin: validation.end,
    durationMinutes: validation.durationMinutes,
    duracion_minutos: validation.durationMinutes,
    modalidad: modality,
    notas: notes,
    status: 'propuesta',
    availabilityStatus: 'pending_review',
    source: 'classes_panel_one_off',
    proposedByUid: currentUid,
    proposedByRole: role,
    proposedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  return { validation, proposal };
}

export function oneOffProposalMessage(proposal = {}, actorName = '') {
  const who = clean(actorName, 120) || 'Una persona';
  const subject = clean(proposal.materia || proposal.subject || 'clase', 120);
  return `${who} ha propuesto una clase puntual de ${subject} el ${proposal.fecha} de ${proposal.hora_inicio} a ${proposal.hora_fin}.`;
}
