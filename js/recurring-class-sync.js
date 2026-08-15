const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CLASS_CREATE_FIELDS = new Set([
  'profesor_id',
  'teacherUid',
  'familia_id',
  'familyUid',
  'alumno_id',
  'studentId',
  'fecha',
  'date',
  'materia',
  'subject',
  'hora_inicio',
  'startTime',
  'hora_fin',
  'endTime',
  'duracion_minutos',
  'durationMinutes',
  'precio_total',
  'amount',
  'familyAmount',
  'importe_profesor',
  'teacherAmount',
  'precio_hora_familia',
  'familyHourlyRate',
  'importe_hora_profesor',
  'teacherHourlyRate',
  'comision_clasesde10',
  'platformFee',
  'marginPct',
  'estado',
  'status',
  'lifecycleStatus',
  'attendanceStatus',
  'teacherConfirmationStatus',
  'familyConfirmationStatus',
  'confirmacion_familia',
  'paymentStatus',
  'familyPaymentStatus',
  'estado_pago',
  'estado_pago_familia',
  'teacherPaymentStatus',
  'estado_pago_profesor',
  'observaciones',
  'calendarUid',
  'calendarSync',
  'previousSchedule',
  'lastScheduleChangeAt',
  'classResetGeneration',
  'createdAfterClassReset',
  'classResetCutoffIso',
  'assignmentId',
  'asignacion_id',
  'scheduleProposalId',
  'classSeriesId',
  'seriesId',
  'seriesIndex',
  'seriesTotal',
  'seriesStartDate',
  'seriesEndDate',
  'isRecurring',
  'recurrence',
  'recurrenceLabel',
  'parentClassId',
  'createdFrom',
  'schedulingStatus',
  'modality',
  'modalidad',
  'familyName',
  'teacherName',
  'studentName',
  'familia_nombre',
  'profesor_nombre',
  'alumno_nombre',
  'participantUids',
  'createdByUid',
  'createdByRole',
  'createdAt',
  'updatedAt',
  'updated_at',
]);

function clean(value, max = 500) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function firstText(...values) {
  return values.map((value) => clean(value, 900)).find(Boolean) || '';
}

export function normalizeIsoDate(value = '') {
  const raw = clean(value, 30).slice(0, 10);
  if (!ISO_DATE_RE.test(raw)) return '';
  const [year, month, day] = raw.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return raw;
}

export function addDaysIso(dateIso = '', days = 0) {
  const normalized = normalizeIsoDate(dateIso);
  if (!normalized) return '';
  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + Number(days || 0));
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function diffDays(startIso = '', endIso = '') {
  const start = normalizeIsoDate(startIso);
  const end = normalizeIsoDate(endIso);
  if (!start || !end) return null;
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  return Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
}

function weeksBetween(startIso = '', endIso = '') {
  const days = diffDays(startIso, endIso);
  return days === null ? null : Math.round(days / 7);
}

function weekdayIndexFromIso(dateIso = '') {
  const normalized = normalizeIsoDate(dateIso);
  if (!normalized) return null;
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return (date.getDay() + 6) % 7;
}

function academicYearEndForDate(firstClassDate = '') {
  const normalized = normalizeIsoDate(firstClassDate);
  if (!normalized) return '';
  const [year, month] = normalized.split('-').map(Number);
  return `${month >= 7 ? year + 1 : year}-06-30`;
}

function maxIso(a = '', b = '') {
  const left = normalizeIsoDate(a);
  const right = normalizeIsoDate(b);
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function minIso(a = '', b = '') {
  const left = normalizeIsoDate(a);
  const right = normalizeIsoDate(b);
  if (!left) return right;
  if (!right) return left;
  return left < right ? left : right;
}

function dateFromClass(row = {}) {
  return normalizeIsoDate(row.fecha || row.date || row.firstClassDate || row.seriesStartDate);
}

function recurringSeriesId(row = {}) {
  return clean(row.classSeriesId || row.seriesId || row.scheduleProposalId, 180);
}

function scheduleProposalSeriesId(proposal = {}) {
  return clean(proposal.id || proposal.scheduleProposalId || proposal.classSeriesId || proposal.seriesId, 180);
}

function isAcceptedWeeklyScheduleProposal(proposal = {}) {
  const kind = clean(proposal.scheduleKind || proposal.kind, 40);
  return clean(proposal.status, 40) === 'aceptada'
    && (
      kind === 'weekly_recurring'
      || proposal.recurrence?.frequency === 'weekly'
    )
    && scheduleProposalSeriesId(proposal)
    && normalizeIsoDate(proposal.fecha || proposal.firstClassDate || proposal.seriesStartDate);
}

function isWeeklyRecurringClass(row = {}) {
  return Boolean(
    recurringSeriesId(row)
    && (
      row.isRecurring === true
      || row.recurrence?.frequency === 'weekly'
      || row.scheduleKind === 'weekly_recurring'
      || row.kind === 'weekly_recurring'
    )
    && normalizeIsoDate(row.seriesStartDate || row.fecha || row.date)
    && clean(row.assignmentId || row.asignacion_id, 180)
    && clean(row.scheduleProposalId || row.classSeriesId || row.seriesId, 180)
  );
}

function recurringBaseClassId(seed = {}) {
  const direct = clean(seed.parentClassId || seed.calendarUid, 900);
  if (direct) return direct;
  const id = clean(seed.id, 900);
  const seriesStart = normalizeIsoDate(seed.seriesStartDate || seed.fecha || seed.date);
  const currentDate = dateFromClass(seed);
  if (id && seriesStart && currentDate && currentDate !== seriesStart) {
    return id.replace(/_\d{8}$/, '');
  }
  return id;
}

function classIdFromScheduleProposal(chatId = '', proposalId = '') {
  return `chat_${clean(chatId, 300)}_${clean(proposalId, 300)}`.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 900);
}

export function recurringOccurrenceId(seed = {}, occurrenceDate = '', index = 0) {
  const base = recurringBaseClassId(seed);
  if (!base) return '';
  if (!Number(index)) return base;
  const suffix = normalizeIsoDate(occurrenceDate).replace(/-/g, '') || String(index).padStart(2, '0');
  return `${base}_${suffix}`.slice(0, 900);
}

function participantMap(seed = {}, currentUid = '') {
  const participantUids = { ...(seed.participantUids || {}) };
  [
    currentUid,
    seed.familyUid,
    seed.familia_id,
    seed.teacherUid,
    seed.profesor_id,
  ].forEach((uid) => {
    const key = clean(uid, 180);
    if (key) participantUids[key] = true;
  });
  return participantUids;
}

function allowedClassWritePayload(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => CLASS_CREATE_FIELDS.has(key) && value !== undefined),
  );
}

function resetOccurrenceState(payload = {}) {
  return {
    ...payload,
    estado: 'confirmada',
    status: 'confirmada',
    lifecycleStatus: 'clase_programada',
    attendanceStatus: 'pendiente',
    teacherConfirmationStatus: null,
    familyConfirmationStatus: null,
    confirmacion_familia: null,
    paymentStatus: 'pendiente',
    familyPaymentStatus: 'pendiente',
    estado_pago: 'pendiente',
    estado_pago_familia: 'pendiente',
    teacherPaymentStatus: 'pendiente',
    estado_pago_profesor: 'pendiente',
  };
}

export function buildRecurringClassOccurrencePayload(seed = {}, occurrenceDate = '', options = {}) {
  const seriesStartDate = normalizeIsoDate(seed.seriesStartDate || seed.fecha || seed.date);
  const fecha = normalizeIsoDate(occurrenceDate);
  const index = weeksBetween(seriesStartDate, fecha);
  if (!seriesStartDate || !fecha || index === null || index < 0) return null;
  const classId = recurringOccurrenceId(seed, fecha, index);
  if (!classId) return null;
  const seriesEndDate = normalizeIsoDate(options.seriesEndDate) || normalizeIsoDate(seed.seriesEndDate) || fecha;
  const seriesTotal = Math.max(
    Number(seed.seriesTotal || 0),
    Number(options.seriesTotal || 0),
    (weeksBetween(seriesStartDate, seriesEndDate) ?? index) + 1,
    index + 1,
  );
  const nowIso = options.nowIso || new Date().toISOString();
  const serverTimestamp = options.serverTimestamp || (() => nowIso);
  const payload = allowedClassWritePayload(resetOccurrenceState({
    ...seed,
    id: undefined,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updated_at: nowIso,
    fecha,
    date: fecha,
    calendarUid: classId,
    classSeriesId: recurringSeriesId(seed),
    seriesId: recurringSeriesId(seed),
    seriesIndex: index,
    seriesTotal,
    seriesStartDate,
    seriesEndDate,
    isRecurring: true,
    recurrence: seed.recurrence || {
      frequency: 'weekly',
      dayOfWeek: weekdayIndexFromIso(seriesStartDate),
      startTime: seed.hora_inicio || seed.startTime || '',
      endTime: seed.hora_fin || seed.endTime || '',
      timezone: 'Europe/Madrid',
    },
    recurrenceLabel: seed.recurrenceLabel || '',
    parentClassId: recurringBaseClassId(seed),
    assignmentId: seed.assignmentId || seed.asignacion_id || '',
    asignacion_id: seed.asignacion_id || seed.assignmentId || '',
    scheduleProposalId: seed.scheduleProposalId || recurringSeriesId(seed),
    createdFrom: 'chat_schedule_proposal',
    schedulingStatus: 'confirmed',
    participantUids: participantMap(seed, options.currentUid),
    createdByUid: clean(options.currentUid || seed.createdByUid, 180),
    createdByRole: clean(options.currentRole || seed.createdByRole, 40) || 'familia',
  }));
  return { id: classId, ...payload };
}

function rowId(row = {}) {
  return clean(row.id || row.calendarUid || row.classId, 900);
}

function sameTextId(left = '', right = '') {
  const a = clean(left, 300);
  const b = clean(right, 300);
  return Boolean(a && b && a === b);
}

function sameClassTime(left = {}, right = {}) {
  const leftStart = clean(left.hora_inicio || left.startTime, 20);
  const rightStart = clean(right.hora_inicio || right.startTime, 20);
  const leftEnd = clean(left.hora_fin || left.endTime, 20);
  const rightEnd = clean(right.hora_fin || right.endTime, 20);
  return Boolean(leftStart && rightStart && leftEnd && rightEnd && leftStart === rightStart && leftEnd === rightEnd);
}

function classMatchesScheduleProposal(row = {}, chat = {}, proposal = {}) {
  const chatId = clean(chat.id || proposal.chatId || proposal.assignmentId, 300);
  const proposalId = scheduleProposalSeriesId(proposal);
  const expectedBaseId = classIdFromScheduleProposal(chatId, proposalId);
  const rowDate = dateFromClass(row);
  const proposalDate = normalizeIsoDate(proposal.fecha || proposal.firstClassDate || proposal.seriesStartDate);
  if (expectedBaseId && rowId(row) === expectedBaseId) return true;
  if (proposalId && recurringSeriesId(row) === proposalId) return true;
  if (!rowDate || rowDate !== proposalDate || !sameClassTime(row, proposal)) return false;
  const sameAssignment = sameTextId(row.assignmentId || row.asignacion_id, chatId);
  const sameTeacher = sameTextId(row.teacherUid || row.profesor_id, chat.teacherUid || chat.profesor_id || proposal.teacherUid || proposal.profesor_id);
  const sameFamily = sameTextId(row.familyUid || row.familia_id, chat.familyUid || chat.familia_id || proposal.familyUid || proposal.familia_id);
  const sameStudent = sameTextId(row.studentId || row.alumno_id, chat.studentId || chat.alumno_id || proposal.studentId || proposal.alumno_id);
  return sameAssignment || (sameTeacher && sameFamily && sameStudent);
}

function existingOccurrenceMatches(classes = [], seed = {}, occurrenceDate = '', index = 0) {
  const expectedId = recurringOccurrenceId(seed, occurrenceDate, index);
  const seedSeriesId = recurringSeriesId(seed);
  return classes.some((row) => {
    const date = dateFromClass(row);
    if (!date || date !== occurrenceDate) return false;
    if (expectedId && rowId(row) === expectedId) return true;
    if (seedSeriesId && recurringSeriesId(row) === seedSeriesId) return true;
    if (!sameClassTime(row, seed)) return false;
    const sameAssignment = sameTextId(row.assignmentId || row.asignacion_id, seed.assignmentId || seed.asignacion_id);
    const sameTeacher = sameTextId(row.teacherUid || row.profesor_id, seed.teacherUid || seed.profesor_id);
    const sameFamily = sameTextId(row.familyUid || row.familia_id, seed.familyUid || seed.familia_id);
    const sameStudent = sameTextId(row.studentId || row.alumno_id, seed.studentId || seed.alumno_id);
    return sameAssignment || (sameTeacher && sameFamily && sameStudent);
  });
}

function scheduleSeedFromAcceptedProposal(chat = {}, proposal = {}, classes = []) {
  if (!isAcceptedWeeklyScheduleProposal(proposal)) return null;
  const chatId = clean(chat.id || proposal.chatId || proposal.assignmentId, 300);
  const proposalId = scheduleProposalSeriesId(proposal);
  const firstDate = normalizeIsoDate(proposal.fecha || proposal.firstClassDate || proposal.seriesStartDate);
  if (!chatId || !proposalId || !firstDate) return null;
  const expectedBaseId = classIdFromScheduleProposal(chatId, proposalId);
  const sourceClass = classes.find((row) => classMatchesScheduleProposal(row, chat, proposal)) || {};
  const startTime = firstText(sourceClass.hora_inicio, sourceClass.startTime, proposal.hora_inicio, proposal.startTime);
  const endTime = firstText(sourceClass.hora_fin, sourceClass.endTime, proposal.hora_fin, proposal.endTime);
  const teacherUid = firstText(sourceClass.teacherUid, sourceClass.profesor_id, chat.teacherUid, chat.profesor_id, proposal.teacherUid, proposal.profesor_id);
  const familyUid = firstText(sourceClass.familyUid, sourceClass.familia_id, chat.familyUid, chat.familia_id, proposal.familyUid, proposal.familia_id);
  const studentId = firstText(sourceClass.studentId, sourceClass.alumno_id, chat.studentId, chat.alumno_id, proposal.studentId, proposal.alumno_id);
  const duration = Number(sourceClass.durationMinutes || sourceClass.duracion_minutos || proposal.durationMinutes || proposal.duracion_minutos || 60) || 60;
  const recurrence = proposal.recurrence || {
    frequency: 'weekly',
    dayOfWeek: weekdayIndexFromIso(firstDate),
    startTime,
    endTime,
    timezone: 'Europe/Madrid',
  };
  return {
    ...sourceClass,
    id: rowId(sourceClass) || expectedBaseId,
    calendarUid: firstText(sourceClass.calendarUid, sourceClass.id, expectedBaseId),
    profesor_id: teacherUid,
    teacherUid,
    familia_id: familyUid,
    familyUid,
    alumno_id: studentId,
    studentId,
    fecha: firstText(sourceClass.fecha, sourceClass.date, firstDate),
    date: firstText(sourceClass.date, sourceClass.fecha, firstDate),
    materia: firstText(sourceClass.materia, sourceClass.subject, proposal.materia, proposal.subject, chat.materia, chat.subject),
    subject: firstText(sourceClass.subject, sourceClass.materia, proposal.materia, proposal.subject, chat.materia, chat.subject),
    hora_inicio: startTime,
    startTime,
    hora_fin: endTime,
    endTime,
    duracion_minutos: duration,
    durationMinutes: duration,
    estado: firstText(sourceClass.estado, sourceClass.status, 'confirmada'),
    status: firstText(sourceClass.status, sourceClass.estado, 'confirmada'),
    lifecycleStatus: firstText(sourceClass.lifecycleStatus, 'clase_programada'),
    attendanceStatus: firstText(sourceClass.attendanceStatus, 'pendiente'),
    paymentStatus: firstText(sourceClass.paymentStatus, sourceClass.familyPaymentStatus, sourceClass.estado_pago, 'pendiente'),
    familyPaymentStatus: firstText(sourceClass.familyPaymentStatus, sourceClass.paymentStatus, sourceClass.estado_pago_familia, 'pendiente'),
    estado_pago: firstText(sourceClass.estado_pago, sourceClass.paymentStatus, 'pendiente'),
    estado_pago_familia: firstText(sourceClass.estado_pago_familia, sourceClass.familyPaymentStatus, 'pendiente'),
    teacherPaymentStatus: firstText(sourceClass.teacherPaymentStatus, sourceClass.estado_pago_profesor, 'pendiente'),
    estado_pago_profesor: firstText(sourceClass.estado_pago_profesor, sourceClass.teacherPaymentStatus, 'pendiente'),
    assignmentId: firstText(sourceClass.assignmentId, sourceClass.asignacion_id, chatId),
    asignacion_id: firstText(sourceClass.asignacion_id, sourceClass.assignmentId, chatId),
    scheduleProposalId: proposalId,
    classSeriesId: proposalId,
    seriesId: proposalId,
    seriesIndex: Number(sourceClass.seriesIndex || 0) || 0,
    seriesStartDate: firstDate,
    seriesEndDate: normalizeIsoDate(proposal.seriesEndDate) || normalizeIsoDate(sourceClass.seriesEndDate) || academicYearEndForDate(firstDate),
    isRecurring: true,
    recurrence,
    recurrenceLabel: firstText(proposal.recurrenceLabel, sourceClass.recurrenceLabel),
    parentClassId: firstText(sourceClass.parentClassId, expectedBaseId),
    createdFrom: firstText(sourceClass.createdFrom, 'chat_schedule_proposal'),
    schedulingStatus: firstText(sourceClass.schedulingStatus, 'confirmed'),
    modality: firstText(sourceClass.modality, sourceClass.modalidad, proposal.modalidad),
    modalidad: firstText(sourceClass.modalidad, sourceClass.modality, proposal.modalidad),
    familyName: firstText(sourceClass.familyName, sourceClass.familia_nombre, chat.familyName, chat.familia_nombre),
    teacherName: firstText(sourceClass.teacherName, sourceClass.profesor_nombre, chat.teacherName, chat.profesor_nombre),
    studentName: firstText(sourceClass.studentName, sourceClass.alumno_nombre, sourceClass.studentDisplayName, chat.studentName, chat.alumno_nombre, chat.studentDisplayName),
    familia_nombre: firstText(sourceClass.familia_nombre, sourceClass.familyName, chat.familia_nombre, chat.familyName),
    profesor_nombre: firstText(sourceClass.profesor_nombre, sourceClass.teacherName, chat.profesor_nombre, chat.teacherName),
    alumno_nombre: firstText(sourceClass.alumno_nombre, sourceClass.studentName, sourceClass.studentDisplayName, chat.alumno_nombre, chat.studentName, chat.studentDisplayName),
    participantUids: participantMap({
      ...sourceClass,
      participantUids: { ...(chat.participantUids || {}), ...(sourceClass.participantUids || {}) },
      familyUid,
      familia_id: familyUid,
      teacherUid,
      profesor_id: teacherUid,
    }),
    createdByUid: firstText(sourceClass.createdByUid, proposal.respondedByUid, proposal.proposedByUid),
    createdByRole: firstText(sourceClass.createdByRole, proposal.respondedByRole, proposal.proposedByRole),
  };
}

export function recurringScheduleSeedsFromAcceptedProposals(chats = [], proposals = [], classes = []) {
  const chatById = new Map((chats || []).filter(Boolean).map((chat) => [clean(chat.id || chat.assignmentId, 300), chat]));
  const seeds = (proposals || [])
    .map((proposal) => {
      const chatId = clean(proposal.chatId || proposal.assignmentId || proposal.asignacion_id, 300);
      return scheduleSeedFromAcceptedProposal(chatById.get(chatId) || proposal.chat || {}, proposal, classes);
    })
    .filter(Boolean);
  const bySeries = new Map();
  seeds.forEach((seed) => {
    const key = recurringSeriesId(seed);
    if (key && !bySeries.has(key)) bySeries.set(key, seed);
  });
  return Array.from(bySeries.values());
}

function seriesSeeds(classes = []) {
  const bySeries = new Map();
  classes.filter(isWeeklyRecurringClass).forEach((row) => {
    const key = recurringSeriesId(row);
    const current = bySeries.get(key);
    if (!current) {
      bySeries.set(key, row);
      return;
    }
    const currentIndex = Number(current.seriesIndex ?? 999999);
    const nextIndex = Number(row.seriesIndex ?? 999999);
    const currentDate = dateFromClass(current);
    const nextDate = dateFromClass(row);
    if (nextIndex < currentIndex || (nextIndex === currentIndex && nextDate && (!currentDate || nextDate < currentDate))) {
      bySeries.set(key, row);
    }
  });
  return Array.from(bySeries.values());
}

function existingSeriesDateSet(classes = []) {
  const set = new Set();
  classes.forEach((row) => {
    const key = recurringSeriesId(row);
    const date = dateFromClass(row);
    if (key && date) set.add(`${key}|${date}`);
  });
  return set;
}

export function missingRecurringOccurrences(classes = [], rangeStart = '', rangeEnd = '', options = {}) {
  const start = normalizeIsoDate(rangeStart);
  const end = normalizeIsoDate(rangeEnd);
  if (!start || !end || start > end) return [];
  const seedRows = Array.isArray(options.recurrenceSeeds) ? options.recurrenceSeeds : [];
  const recurrenceSources = [...classes, ...seedRows];
  const existing = existingSeriesDateSet(classes);
  const horizonEnd = minIso(addDaysIso(end, Number(options.bufferDays || 0)), options.maxEndDate || addDaysIso(start, 540));
  const missing = [];
  seriesSeeds(recurrenceSources).forEach((seed) => {
    const seriesStart = normalizeIsoDate(seed.seriesStartDate || seed.fecha || seed.date);
    if (!seriesStart) return;
    const targetStart = maxIso(start, seriesStart);
    const targetEnd = maxIso(horizonEnd, normalizeIsoDate(seed.seriesEndDate));
    let current = seriesStart;
    while (current && current <= targetEnd && missing.length < Number(options.maxWrites || 80)) {
      const index = weeksBetween(seriesStart, current);
      const key = `${recurringSeriesId(seed)}|${current}`;
      if (
        index !== null
        && index >= 0
        && current >= targetStart
        && current <= horizonEnd
        && !existing.has(key)
        && !existingOccurrenceMatches(classes, seed, current, index)
      ) {
        const payload = buildRecurringClassOccurrencePayload(seed, current, {
          ...options,
          seriesEndDate: targetEnd,
        });
        if (payload) {
          missing.push(payload);
          existing.add(key);
        }
      }
      current = addDaysIso(current, 7);
    }
  });
  return missing;
}

export async function loadParticipantClasses({ firebaseDb, firestoreCollection, getDocs, firestoreQuery, where, uid }) {
  const cleanUid = clean(uid, 180);
  if (!cleanUid) return [];
  const snap = await getDocs(firestoreQuery(
    firestoreCollection(firebaseDb, 'clases'),
    where(`participantUids.${cleanUid}`, '==', true),
  ));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function loadAcceptedRecurringScheduleSeeds(options = {}) {
  const {
    firebaseDb,
    firestoreCollection,
    getDocs,
    chats = [],
    classes = [],
  } = options;
  if (!firebaseDb || !firestoreCollection || !getDocs || !Array.isArray(chats) || !chats.length) return [];
  const rows = await Promise.all(chats.map(async (chat) => {
    const chatId = clean(chat.id || chat.assignmentId, 300);
    if (!chatId) return [];
    try {
      const snap = await getDocs(firestoreCollection(firebaseDb, 'chats', chatId, 'programaciones'));
      return snap.docs.map((item) => ({
        id: item.id,
        chatId,
        chat,
        ...item.data(),
      }));
    } catch {
      return [];
    }
  }));
  return recurringScheduleSeedsFromAcceptedProposals(chats, rows.flat(), classes);
}

export async function ensureRecurringClassOccurrencesForRange(options = {}) {
  const {
    firebaseDb,
    firestoreDoc,
    setDoc,
    serverTimestamp,
    classes = [],
    rangeStart = '',
    rangeEnd = '',
    currentUid = '',
    currentRole = '',
  } = options;
  if (!firebaseDb || !firestoreDoc || !setDoc) return [];
  const missing = missingRecurringOccurrences(classes, rangeStart, rangeEnd, {
    currentUid,
    currentRole,
    serverTimestamp,
    bufferDays: options.bufferDays ?? 35,
    maxWrites: options.maxWrites ?? 80,
    recurrenceSeeds: options.recurrenceSeeds || [],
  });
  if (!missing.length) return [];
  const writes = missing.map((payload) => {
    const { id, ...writePayload } = payload;
    return setDoc(
      firestoreDoc(firebaseDb, 'clases', id),
      writePayload,
    );
  });
  await Promise.all(writes);
  return missing;
}
