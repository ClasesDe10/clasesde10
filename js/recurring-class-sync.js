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
  const existing = existingSeriesDateSet(classes);
  const horizonEnd = minIso(addDaysIso(end, Number(options.bufferDays || 0)), options.maxEndDate || addDaysIso(start, 540));
  const missing = [];
  seriesSeeds(classes).forEach((seed) => {
    const seriesStart = normalizeIsoDate(seed.seriesStartDate || seed.fecha || seed.date);
    if (!seriesStart) return;
    const targetStart = maxIso(start, seriesStart);
    const targetEnd = maxIso(horizonEnd, normalizeIsoDate(seed.seriesEndDate));
    let current = seriesStart;
    while (current && current <= targetEnd && missing.length < Number(options.maxWrites || 80)) {
      const index = weeksBetween(seriesStart, current);
      const key = `${recurringSeriesId(seed)}|${current}`;
      if (index !== null && index >= 0 && current >= targetStart && current <= horizonEnd && !existing.has(key)) {
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
