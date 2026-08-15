import { buildAdminClassPayload } from './calendar-engine.js?v=20260704-prorated-duration';
import { buildClassPricingQuote } from './finance-erp-engine.js?v=20260704-prorated-duration';
import { classResetWriteFields } from './class-reset.js';

export const ONE_OFF_PROPOSAL_KIND = 'one_off';

function clean(value, max = 2000) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : null;
}

function timeToMinutes(value = '') {
  const match = clean(value, 8).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function durationMinutesFromProposal(proposal = {}) {
  const start = timeToMinutes(proposal.hora_inicio || proposal.startTime);
  const end = timeToMinutes(proposal.hora_fin || proposal.endTime);
  if (start !== null && end !== null && end > start) return end - start;
  const explicit = Number(proposal.durationMinutes || proposal.duracion_minutos || 60);
  return Number.isFinite(explicit) && explicit > 0 ? explicit : 60;
}

function amountFromHourly(hourlyRate, durationMinutes = 60) {
  const hourly = Number(hourlyRate);
  if (!Number.isFinite(hourly) || hourly <= 0) return null;
  return Math.round(((hourly * durationMinutes / 60) + Number.EPSILON) * 100) / 100;
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

function pricingFromHourly(source = {}, durationMinutes = 60) {
  const familyHourly = Number(
    source.familyHourlyRate
    ?? source.precio_hora_familia
    ?? source.familyRatePerHour
    ?? source.tarifa_hora_familia
  );
  const teacherHourly = Number(
    source.teacherHourlyRate
    ?? source.importe_hora_profesor
    ?? source.teacherRatePerHour
    ?? source.tarifa_hora_profesor
  );
  const familyAmount = amountFromHourly(familyHourly, durationMinutes);
  const teacherAmount = amountFromHourly(teacherHourly, durationMinutes);
  if (familyAmount === null || teacherAmount === null) return null;
  const platformFee = money(familyAmount - teacherAmount);
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
    marginPct: familyAmount > 0 ? Math.round(((platformFee || 0) / familyAmount) * 10000) / 100 : null,
  };
}

function safeIdPart(value = '') {
  return clean(value, 180).replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
}

function participantMap(ids = []) {
  return [...new Set(ids.map((id) => clean(id, 180)).filter(Boolean))]
    .reduce((acc, id) => ({ ...acc, [id]: true }), {});
}

function firstText(...values) {
  return values.map((value) => clean(value, 180)).find(Boolean) || '';
}

export function isOneOffScheduleProposal(proposal = {}) {
  return clean(proposal.kind || proposal.scheduleKind, 40) === ONE_OFF_PROPOSAL_KIND;
}

export function isPendingOneOffScheduleProposal(proposal = {}) {
  return isOneOffScheduleProposal(proposal)
    && clean(proposal.status || 'propuesta', 40).toLowerCase() === 'propuesta';
}

export function oneOffProposalRowId(chatId = '', proposalId = '') {
  return `proposal_${safeIdPart(chatId)}_${safeIdPart(proposalId)}`.slice(0, 180);
}

export function oneOffClassId(chatId = '', proposalId = '') {
  return `oneoff_${safeIdPart(chatId)}_${safeIdPart(proposalId)}`.slice(0, 180);
}

export function oneOffBusySlotId(resourceType = '', resourceId = '', classId = '') {
  return [resourceType, resourceId, classId]
    .map(safeIdPart)
    .filter(Boolean)
    .join('_')
    .slice(0, 180);
}

export function oneOffProposalToClassRow(chat = {}, proposal = {}, context = {}) {
  const proposalId = clean(proposal.id || proposal.scheduleProposalId, 180);
  const chatId = clean(chat.id || proposal.assignmentId || proposal.asignacion_id, 180);
  const durationMinutes = durationMinutesFromProposal(proposal);
  const teacherUid = firstText(proposal.teacherUid, proposal.profesor_id, chat.teacherUid, chat.profesor_id);
  const familyUid = firstText(proposal.familyUid, proposal.familia_id, chat.familyUid, chat.familia_id);
  const studentId = firstText(proposal.studentId, proposal.alumno_id, chat.studentId, chat.alumno_id);
  return {
    id: oneOffProposalRowId(chatId, proposalId),
    proposalId,
    scheduleProposalId: proposalId,
    assignmentId: chatId,
    asignacion_id: chatId,
    isOneOffProposal: true,
    calendarEventType: 'one_off_proposal',
    proposalStatus: 'propuesta',
    proposedByUid: clean(proposal.proposedByUid, 180),
    proposedByRole: clean(proposal.proposedByRole, 40),
    sourceProposal: proposal,
    sourceChat: chat,
    teacherUid,
    profesor_id: teacherUid,
    familyUid,
    familia_id: familyUid,
    studentId,
    alumno_id: studentId,
    fecha: clean(proposal.fecha || proposal.firstClassDate, 20).slice(0, 10),
    date: clean(proposal.fecha || proposal.firstClassDate, 20).slice(0, 10),
    hora_inicio: clean(proposal.hora_inicio, 8),
    startTime: clean(proposal.hora_inicio, 8),
    hora_fin: clean(proposal.hora_fin, 8),
    endTime: clean(proposal.hora_fin, 8),
    materia: firstText(proposal.materia, proposal.subject, chat.materia, chat.subject),
    subject: firstText(proposal.subject, proposal.materia, chat.subject, chat.materia),
    modalidad: clean(proposal.modalidad || 'por_acordar', 40) || 'por_acordar',
    modality: clean(proposal.modalidad || 'por_acordar', 40) || 'por_acordar',
    notas: clean(proposal.notas, 300),
    observaciones: clean(proposal.notas, 300),
    duracion_minutos: durationMinutes,
    durationMinutes,
    estado: 'propuesta',
    status: 'propuesta',
    lifecycleStatus: 'proposal_pending',
    attendanceStatus: 'pendiente',
    familyName: firstText(context.familyName, chat.familyName, chat.familia_nombre, proposal.familyName),
    teacherName: firstText(context.teacherName, chat.teacherName, chat.profesor_nombre, proposal.teacherName),
    studentName: firstText(context.studentName, chat.studentName, chat.alumno_nombre, proposal.studentName, chat.studentDisplayName),
    familia_nombre: firstText(context.familyName, chat.familyName, chat.familia_nombre, proposal.familyName),
    profesor_nombre: firstText(context.teacherName, chat.teacherName, chat.profesor_nombre, proposal.teacherName),
    alumno_nombre: firstText(context.studentName, chat.studentName, chat.alumno_nombre, proposal.studentName, chat.studentDisplayName),
    ...pickClassPriceFields(pricingFromHourly({ ...chat, ...proposal }, durationMinutes) || proposal || chat),
  };
}

export function buildAcceptedOneOffClassPayload(chat = {}, proposal = {}, context = {}) {
  const nowIso = context.nowIso || new Date().toISOString();
  const serverTimestamp = typeof context.serverTimestamp === 'function'
    ? context.serverTimestamp
    : () => nowIso;
  const proposalId = clean(proposal.id || context.proposalId, 180);
  const chatId = clean(chat.id || proposal.assignmentId || proposal.asignacion_id, 180);
  const classId = context.classId || oneOffClassId(chatId, proposalId);
  const durationMinutes = durationMinutesFromProposal(proposal);
  const teacherUid = firstText(proposal.teacherUid, proposal.profesor_id, chat.teacherUid, chat.profesor_id);
  const familyUid = firstText(proposal.familyUid, proposal.familia_id, chat.familyUid, chat.familia_id);
  const studentId = firstText(proposal.studentId, proposal.alumno_id, chat.studentId, chat.alumno_id);
  const pricingInput = {
    ...chat,
    ...proposal,
    profesor_id: teacherUid,
    teacherUid,
    familia_id: familyUid,
    familyUid,
    alumno_id: studentId,
    studentId,
    fecha: proposal.fecha || proposal.firstClassDate,
    date: proposal.fecha || proposal.firstClassDate,
    hora_inicio: proposal.hora_inicio,
    startTime: proposal.hora_inicio,
    hora_fin: proposal.hora_fin,
    endTime: proposal.hora_fin,
    durationMinutes,
    duracion_minutos: durationMinutes,
    calendarUid: classId,
    estado: 'confirmada',
    status: 'confirmada',
  };
  const pricing = pricingFromHourly(pricingInput, durationMinutes)
    || pickClassPriceFields(buildClassPricingQuote(pricingInput, context.teacherProfile || {}, {
      config: context.config || globalThis.CD10PlatformConfig || {},
    }));
  const baseFields = buildAdminClassPayload({
    ...pricingInput,
    ...pricing,
    materia: proposal.materia || proposal.subject || chat.materia || chat.subject || '',
    subject: proposal.subject || proposal.materia || chat.subject || chat.materia || '',
    observaciones: proposal.notas || '',
  }, {}, { nowIso, calendarUid: classId, config: context.config || globalThis.CD10PlatformConfig || {} });
  const participantUids = {
    ...(chat.participantUids || {}),
    ...participantMap([
      context.currentUid,
      familyUid,
      teacherUid,
      chat.familyUid,
      chat.familia_id,
      chat.teacherUid,
      chat.profesor_id,
    ]),
  };
  return {
    ...classResetWriteFields(),
    profesor_id: baseFields.profesor_id,
    teacherUid: baseFields.teacherUid,
    familia_id: baseFields.familia_id,
    familyUid: baseFields.familyUid,
    alumno_id: baseFields.alumno_id,
    studentId: baseFields.studentId,
    fecha: baseFields.fecha,
    date: baseFields.date,
    materia: baseFields.materia,
    subject: baseFields.subject,
    hora_inicio: baseFields.hora_inicio,
    startTime: baseFields.startTime,
    hora_fin: baseFields.hora_fin,
    endTime: baseFields.endTime,
    duracion_minutos: baseFields.duracion_minutos,
    durationMinutes: baseFields.durationMinutes,
    ...pickClassPriceFields(baseFields),
    estado: baseFields.estado,
    status: baseFields.status,
    lifecycleStatus: baseFields.lifecycleStatus,
    attendanceStatus: baseFields.attendanceStatus,
    teacherConfirmationStatus: baseFields.teacherConfirmationStatus,
    familyConfirmationStatus: baseFields.familyConfirmationStatus,
    confirmacion_familia: baseFields.confirmacion_familia,
    paymentStatus: baseFields.paymentStatus,
    familyPaymentStatus: baseFields.familyPaymentStatus,
    estado_pago: baseFields.estado_pago,
    estado_pago_familia: baseFields.estado_pago_familia,
    teacherPaymentStatus: baseFields.teacherPaymentStatus,
    estado_pago_profesor: baseFields.estado_pago_profesor,
    observaciones: baseFields.observaciones,
    calendarUid: baseFields.calendarUid,
    calendarSync: baseFields.calendarSync,
    previousSchedule: baseFields.previousSchedule,
    lastScheduleChangeAt: baseFields.lastScheduleChangeAt,
    assignmentId: chatId,
    asignacion_id: chatId,
    scheduleProposalId: proposalId,
    createdFrom: 'chat_schedule_proposal',
    schedulingStatus: 'confirmed',
    modality: proposal.modalidad || 'por_acordar',
    modalidad: proposal.modalidad || 'por_acordar',
    familyName: firstText(context.familyName, chat.familyName, chat.familia_nombre),
    teacherName: firstText(context.teacherName, chat.teacherName, chat.profesor_nombre),
    studentName: firstText(context.studentName, chat.studentName, chat.alumno_nombre, chat.studentDisplayName),
    familia_nombre: firstText(context.familyName, chat.familyName, chat.familia_nombre),
    profesor_nombre: firstText(context.teacherName, chat.teacherName, chat.profesor_nombre),
    alumno_nombre: firstText(context.studentName, chat.studentName, chat.alumno_nombre, chat.studentDisplayName),
    participantUids,
    createdByUid: clean(context.currentUid, 180),
    createdByRole: clean(context.currentRole, 40),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updated_at: nowIso,
  };
}

export function buildBusySlotPayloadsForOneOffClass(classId = '', classFields = {}, context = {}) {
  const serverTimestamp = typeof context.serverTimestamp === 'function'
    ? context.serverTimestamp
    : () => new Date().toISOString();
  const common = {
    source: 'class',
    ...classResetWriteFields(),
    classId: clean(classId, 180),
    assignmentId: clean(classFields.assignmentId || classFields.asignacion_id, 180),
    fecha: clean(classFields.fecha || classFields.date, 20).slice(0, 10),
    date: clean(classFields.fecha || classFields.date, 20).slice(0, 10),
    hora_inicio: clean(classFields.hora_inicio || classFields.startTime, 8),
    startTime: clean(classFields.hora_inicio || classFields.startTime, 8),
    hora_fin: clean(classFields.hora_fin || classFields.endTime, 8),
    endTime: clean(classFields.hora_fin || classFields.endTime, 8),
    durationMinutes: Number(classFields.durationMinutes || classFields.duracion_minutos || 60),
    duracion_minutos: Number(classFields.durationMinutes || classFields.duracion_minutos || 60),
    status: clean(classFields.status || classFields.estado || 'confirmada', 80),
    estado: clean(classFields.status || classFields.estado || 'confirmada', 80),
    lifecycleStatus: clean(classFields.lifecycleStatus || 'clase_programada', 80),
    createdByUid: clean(context.currentUid, 180),
    createdByRole: clean(context.currentRole, 40),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const rows = [];
  const teacherUid = clean(classFields.teacherUid || classFields.profesor_id, 180);
  const studentId = clean(classFields.studentId || classFields.alumno_id, 180);
  if (teacherUid) {
    rows.push({
      id: oneOffBusySlotId('teacher', teacherUid, classId),
      payload: {
        ...common,
        resourceType: 'teacher',
        resourceId: teacherUid,
        resourceKey: `teacher:${teacherUid}`,
      },
    });
  }
  if (studentId) {
    rows.push({
      id: oneOffBusySlotId('student', studentId, classId),
      payload: {
        ...common,
        resourceType: 'student',
        resourceId: studentId,
        resourceKey: `student:${studentId}`,
      },
    });
  }
  return rows;
}
