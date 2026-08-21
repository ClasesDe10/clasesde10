const WEEKLY_KIND = 'weekly_recurring';
const ACCEPTED = new Set(['aceptada', 'accepted', 'confirmada', 'confirmed']);
const PENDING = new Set(['propuesta', 'pending', 'proposed']);
const REJECTED = new Set(['rechazada', 'rejected', 'cancelada', 'cancelled', 'canceled']);
const SUPERSEDED = new Set(['sustituida', 'superseded', 'reemplazada', 'replaced']);

export const WEEKDAY_LABELS_ES = Object.freeze([
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
  'domingo',
]);

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (Number.isFinite(value?.seconds)) return Number(value.seconds) * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function weeklyProposalKind(proposal = {}) {
  const explicit = clean(proposal.kind || proposal.scheduleKind, 40).toLowerCase();
  if (explicit) return explicit;
  return proposal.recurrence?.frequency === 'weekly' ? WEEKLY_KIND : 'one_off';
}

export function isWeeklyProposal(proposal = {}) {
  return weeklyProposalKind(proposal) === WEEKLY_KIND;
}

export function normalizedScheduleStatus(proposal = {}) {
  const status = clean(proposal.status || proposal.estado, 40).toLowerCase();
  if (ACCEPTED.has(status)) return 'accepted';
  if (PENDING.has(status)) return 'pending';
  if (REJECTED.has(status)) return 'rejected';
  if (SUPERSEDED.has(status)) return 'superseded';
  return status || 'unknown';
}

export function sortScheduleProposals(proposals = []) {
  return [...(Array.isArray(proposals) ? proposals : [])].sort((left, right) => {
    const rightTime = timestampMs(right.updatedAt || right.respondedAt || right.proposedAt || right.createdAt || right.created_at);
    const leftTime = timestampMs(left.updatedAt || left.respondedAt || left.proposedAt || left.createdAt || left.created_at);
    return rightTime - leftTime || clean(right.id, 180).localeCompare(clean(left.id, 180));
  });
}

export function weeklyScheduleLabel(proposal = {}) {
  if (!proposal || !isWeeklyProposal(proposal)) return '';
  const direct = clean(proposal.recurrenceLabel, 180);
  if (direct) return direct;
  const dayIndex = Number(proposal.recurrence?.dayOfWeek);
  const day = Number.isInteger(dayIndex) && WEEKDAY_LABELS_ES[dayIndex]
    ? WEEKDAY_LABELS_ES[dayIndex]
    : 'día acordado';
  const start = clean(proposal.hora_inicio || proposal.startTime, 8);
  const end = clean(proposal.hora_fin || proposal.endTime, 8);
  return `Todos los ${day}${start ? `, ${start}${end ? `-${end}` : ''}` : ''}`;
}

export function buildWeeklyScheduleState(proposals = [], role = '') {
  const weekly = sortScheduleProposals(proposals).filter(isWeeklyProposal);
  const latest = weekly[0] || null;
  const pending = weekly.find((proposal) => normalizedScheduleStatus(proposal) === 'pending') || null;
  const accepted = weekly.find((proposal) => normalizedScheduleStatus(proposal) === 'accepted') || null;
  const actorRole = clean(role, 40).toLowerCase();
  const proposedByRole = clean(pending?.proposedByRole || pending?.createdByRole, 40).toLowerCase();
  const pendingForRole = Boolean(pending && proposedByRole && proposedByRole !== actorRole && actorRole !== 'admin');
  const waitingForOther = Boolean(pending && (proposedByRole === actorRole || actorRole === 'admin'));
  const firstProposalRequired = !pending && !accepted;

  let key = 'family_must_propose';
  let title = 'Falta proponer el horario semanal';
  let detail = 'La familia debe enviar la primera propuesta para que el profesor pueda responder.';
  let tone = 'warning';

  if (pendingForRole) {
    key = 'pending_for_me';
    title = 'Tienes una propuesta pendiente';
    detail = `${weeklyScheduleLabel(pending)}. Acéptala o propón una alternativa.`;
    tone = 'warning';
  } else if (waitingForOther) {
    key = 'waiting_for_other';
    title = actorRole === 'familia' ? 'Esperando al profesor' : 'Esperando a la familia';
    detail = `${weeklyScheduleLabel(pending)}. La otra parte debe responder.`;
    tone = 'info';
  } else if (accepted) {
    key = 'accepted';
    title = 'Horario semanal acordado';
    detail = weeklyScheduleLabel(accepted);
    tone = 'success';
  } else if (normalizedScheduleStatus(latest || {}) === 'rejected' && actorRole !== 'profesor') {
    key = 'proposal_needed';
    title = 'Propón una nueva alternativa';
    detail = 'La propuesta anterior no quedó aceptada.';
    tone = 'warning';
  } else if (actorRole === 'profesor') {
    key = 'waiting_family_first';
    title = 'Esperando la primera propuesta familiar';
    detail = 'Cuando la familia proponga un horario, podrás aceptarlo o modificarlo.';
    tone = 'info';
  }

  return {
    key,
    title,
    detail,
    tone,
    weekly,
    latest,
    pending,
    accepted,
    pendingForRole,
    waitingForOther,
    firstProposalRequired,
    canOpenPlanner: actorRole !== 'profesor' || Boolean(pendingForRole) || Boolean(accepted),
    actionLabel: pendingForRole ? 'Responder horario'
      : accepted ? 'Ver o cambiar horario'
        : key === 'proposal_needed' ? 'Proponer otro horario'
          : actorRole === 'familia' ? 'Proponer horario' : 'Ver estado',
  };
}

export function weeklyScheduleDashboardRoute(role = '', assignmentId = '', proposalId = '') {
  const normalizedRole = clean(role, 40).toLowerCase();
  const page = normalizedRole === 'profesor' ? 'profesor' : 'familia';
  const section = normalizedRole === 'profesor' ? 'alumnos' : 'profesores';
  const params = new URLSearchParams();
  if (assignmentId) params.set('assignment', clean(assignmentId, 180));
  if (proposalId) params.set('proposal', clean(proposalId, 180));
  return `/pages/dashboard/${page}.html${params.size ? `?${params.toString()}` : ''}#${section}`;
}
