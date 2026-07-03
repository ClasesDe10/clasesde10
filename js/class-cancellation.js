import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import {
  classEndAt,
  cleanCalendarText,
  isScheduledClassStatus,
  normalizeClassStatus,
} from './calendar-engine.js?v=20260701-attendance-clarity';

export const CLASS_CANCELLATION_PENALTY_POINTS = -3;

function clean(value, max = 500) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function dateLabel(classData = {}) {
  const date = clean(classData.fecha || classData.date, 20).slice(0, 10);
  const start = clean(classData.hora_inicio || classData.startTime, 8).slice(0, 5);
  const end = clean(classData.hora_fin || classData.endTime, 8).slice(0, 5);
  const parsed = new Date(`${date}T00:00:00`);
  const formattedDate = Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${formattedDate}${start ? ` de ${start}${end ? ` a ${end}` : ''}` : ''}`.trim();
}

export function canCancelClassFromCalendar(classData = {}, nowMs = Date.now()) {
  const status = normalizeClassStatus(classData.estado || classData.status);
  if (status === 'cancelada' || status === 'realizada' || status === 'pagada') return false;
  if (!isScheduledClassStatus(status)) return false;
  const end = classEndAt(classData);
  return !end || end.getTime() >= nowMs - 15 * 60 * 1000;
}

export function classCancellationCounterparty(classData = {}, actorRole = '') {
  const role = clean(actorRole, 40).toLowerCase();
  if (role === 'familia') {
    return {
      uid: clean(classData.teacherUid || classData.profesor_id, 180),
      role: 'profesor',
      name: clean(classData.teacherName || classData.profesor_nombre || 'el profesor', 160),
    };
  }
  return {
    uid: clean(classData.familyUid || classData.familia_id, 180),
    role: 'familia',
    name: clean(classData.familyName || classData.familia_nombre || 'la familia', 160),
  };
}

export function buildClassCancellationPayload({
  classData = {},
  currentUser = {},
  role = '',
  reason = '',
  nowIso = new Date().toISOString(),
} = {}) {
  const actorUid = clean(currentUser.uid || currentUser.firebase_uid || currentUser.id, 180);
  const actorRole = clean(role, 40).toLowerCase() === 'profesor' ? 'profesor' : 'familia';
  const normalizedReason = cleanCalendarText(reason || 'Cancelada desde el calendario', 800);
  return {
    estado: 'cancelada',
    status: 'cancelada',
    lifecycleStatus: 'cancelada',
    attendanceStatus: 'incidencia',
    incidentStatus: 'abierta',
    cancelacion_motivo: normalizedReason,
    cancellationReason: normalizedReason,
    cancelledAt: serverTimestamp(),
    canceledAt: serverTimestamp(),
    cancelledByUid: actorUid,
    cancelledByRole: actorRole,
    cancelledByName: clean([currentUser.nombre, currentUser.apellidos].filter(Boolean).join(' ') || currentUser.email || actorRole, 180),
    responsibilityPenalty: {
      points: CLASS_CANCELLATION_PENALTY_POINTS,
      appliedToUid: actorUid,
      appliedToRole: actorRole,
      reason: 'calendar_cancellation',
      classId: clean(classData.id || classData.classId, 180),
      at: nowIso,
    },
    trustScoreDelta: CLASS_CANCELLATION_PENALTY_POINTS,
    trustPenaltyReason: 'calendar_cancellation',
    updatedAt: serverTimestamp(),
    updated_at: nowIso,
  };
}

export function buildClassCancellationNotificationPayload({
  classId = '',
  classData = {},
  currentUser = {},
  role = '',
  reason = '',
} = {}) {
  const actorRole = clean(role, 40).toLowerCase() === 'profesor' ? 'profesor' : 'familia';
  const counterparty = classCancellationCounterparty(classData, actorRole);
  const actorLabel = actorRole === 'profesor' ? 'El profesor' : 'La familia';
  const subject = clean(classData.materia || classData.subject || 'Clase', 160);
  const body = `${actorLabel} ha cancelado ${subject} (${dateLabel(classData)}). Motivo: ${clean(reason || 'Cancelada desde el calendario', 500)}.`;
  return {
    userUid: counterparty.uid,
    usuario_id: counterparty.uid,
    title: 'Clase cancelada',
    titulo: 'Clase cancelada',
    body,
    cuerpo: body,
    type: 'class_cancelled',
    category: 'calendar',
    priority: 'high',
    channels: ['in_app', 'push'],
    payload: {
      type: 'class_cancelled',
      classId: clean(classId || classData.id || classData.classId, 180),
      assignmentId: clean(classData.assignmentId || classData.asignacion_id, 180),
      url: `/pages/dashboard/${counterparty.role}#calendario`,
    },
    actionUrl: `/pages/dashboard/${counterparty.role}#calendario`,
    role: counterparty.role,
    readAt: null,
    leida: false,
    fromRole: actorRole,
    createdByUid: clean(currentUser.uid || currentUser.firebase_uid || currentUser.id, 180),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export async function cancelClassFromCalendar({
  firebaseDb,
  classId = '',
  classData = {},
  currentUser = {},
  role = '',
  reason = '',
} = {}) {
  const id = clean(classId || classData.id || classData.classId, 180);
  if (!firebaseDb) throw new Error('Base de datos no disponible.');
  if (!id) throw new Error('Clase no disponible.');
  if (!canCancelClassFromCalendar(classData)) {
    throw new Error('Esta clase ya no se puede cancelar desde el calendario.');
  }
  const payload = buildClassCancellationPayload({ classData: { ...classData, id }, currentUser, role, reason });
  await updateDoc(doc(firebaseDb, 'clases', id), payload);
  await getDocs(query(collection(firebaseDb, 'busySlots'), where('classId', '==', id)))
    .then((snap) => Promise.all(snap.docs.map((item) => deleteDoc(item.ref))))
    .catch((error) => {
      console.warn('No se pudieron liberar franjas ocupadas de la clase cancelada', error);
    });
  const notification = buildClassCancellationNotificationPayload({ classId: id, classData, currentUser, role, reason });
  if (notification.userUid) {
    await addDoc(collection(firebaseDb, 'notificaciones'), notification).catch((error) => {
      console.warn('No se pudo crear notificacion de cancelacion', error);
    });
  }
  return { classId: id, payload, notification };
}
