/**
 * Professional incident/ticket engine for ClasesDe10.
 *
 * The engine keeps legacy `incidencias` documents compatible while adding a
 * normalized ticket model: readable identifiers, SLA, ownership, timeline,
 * conversation, attachments, root cause and resolution metrics.
 */

export const INCIDENT_ENGINE_VERSION = 'incident-engine-2026-06-28';
export const PREVENTIVE_INCIDENT_VERSION = 'preventive-incident-radar-2026-06-30';

export const INCIDENT_STATUSES = Object.freeze([
  'abierta',
  'en_proceso',
  'esperando_usuario',
  'resuelta',
  'cerrada',
]);

export const INCIDENT_PRIORITIES = Object.freeze(['urgente', 'alta', 'media', 'baja']);

export const INCIDENT_CATEGORIES = Object.freeze([
  'pago',
  'finanzas',
  'clase',
  'documentacion',
  'tecnica',
  'ia',
  'sincronizacion',
  'conflicto',
  'seguridad',
  'perfil',
  'matching',
  'comunicacion',
  'operativa',
]);

const PRIORITY_META = Object.freeze({
  urgente: { rank: 1, severity: 'critical', label: 'Urgente', defaultSlaHours: 2 },
  alta: { rank: 2, severity: 'high', label: 'Alta', defaultSlaHours: 12 },
  media: { rank: 3, severity: 'medium', label: 'Media', defaultSlaHours: 24 },
  baja: { rank: 4, severity: 'low', label: 'Baja', defaultSlaHours: 48 },
});

const CATEGORY_KEYWORDS = Object.freeze([
  ['seguridad', /(acoso|amenaza|agresion|violencia|seguridad|riesgo|menor|inapropiado)/i],
  ['finanzas', /(finanzas|margen|beneficio|erp|cashflow|rentabilidad|prevision|facturacion)/i],
  ['pago', /(pago|cobro|bizum|stripe|transferencia|factura|deuda|vencido|dinero)/i],
  ['clase', /(clase|asistencia|no vino|no se presento|cancelada|reprogramada|horario|puntualidad)/i],
  ['documentacion', /(documento|dni|titulo|certificado|verificacion|archivo|pdf)/i],
  ['tecnica', /(login|error|web|app|firebase|storage|pantalla|no carga|fallo)/i],
  ['ia', /\b(ia|ai|matching inteligente|modelo|clasificacion automatica)\b/i],
  ['sincronizacion', /(sync|sincronizacion|calendar|ical|google calendar|conciliacion)/i],
  ['conflicto', /(conflicto|queja|reclamacion|disputa|desacuerdo|problema entre)/i],
  ['perfil', /(perfil|foto|telefono|direccion|estudios|datos)/i],
  ['matching', /(matching|emparejamiento|asignacion|profesor adecuado|encaje)/i],
  ['comunicacion', /(mensaje|chat|email|correo|no responde|contacto)/i],
]);

function clean(value, max = 2000) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function lower(value) {
  return clean(value, 200).toLowerCase();
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

export function dateToIso(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function addHours(iso, hours) {
  const base = new Date(dateToIso(iso) || new Date().toISOString());
  base.setHours(base.getHours() + Number(hours || 0));
  return base.toISOString();
}

function minutesBetween(start, end) {
  const a = new Date(dateToIso(start) || 0);
  const b = new Date(dateToIso(end) || 0);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
}

export function normalizeIncidentStatus(value) {
  const raw = lower(value);
  if (!raw) return 'abierta';
  if (['open', 'pendiente', 'nueva', 'nuevo'].includes(raw)) return 'abierta';
  if (['in_progress', 'en curso', 'progreso', 'gestionando'].includes(raw)) return 'en_proceso';
  if (['waiting', 'esperando', 'esperando respuesta', 'waiting_user'].includes(raw)) return 'esperando_usuario';
  if (['resolved', 'solucionada', 'solucionado'].includes(raw)) return 'resuelta';
  if (['closed', 'archivada', 'archivado'].includes(raw)) return 'cerrada';
  return INCIDENT_STATUSES.includes(raw) ? raw : 'abierta';
}

export function normalizeIncidentCategory(value, text = '') {
  const raw = lower(value);
  if (INCIDENT_CATEGORIES.includes(raw)) return raw;
  const haystack = `${raw} ${clean(text, 4000)}`;
  const found = CATEGORY_KEYWORDS.find(([, pattern]) => pattern.test(haystack));
  return found?.[0] || 'operativa';
}

export function normalizeIncidentPriority(value, category = 'operativa') {
  if (typeof value === 'number') {
    if (value <= 1) return 'urgente';
    if (value === 2) return 'alta';
    if (value === 3) return 'media';
    return 'baja';
  }
  const raw = lower(value);
  if (!raw) {
    if (category === 'seguridad') return 'urgente';
    if (['pago', 'clase', 'conflicto'].includes(category)) return 'alta';
    return 'media';
  }
  if (['critical', 'critica', 'critico', 'urgent', 'urgency', '1'].includes(raw)) return 'urgente';
  if (['high', 'alta', 'alto', '2'].includes(raw)) return 'alta';
  if (['medium', 'normal', 'media', 'medio', '3'].includes(raw)) return 'media';
  if (['low', 'baja', 'bajo', '4'].includes(raw)) return 'baja';
  return INCIDENT_PRIORITIES.includes(raw) ? raw : 'media';
}

export function incidentPriorityMeta(priority) {
  const normalized = normalizeIncidentPriority(priority);
  return PRIORITY_META[normalized] || PRIORITY_META.media;
}

export function incidentSlaHours(priority, category = 'operativa', config = {}) {
  const normalized = normalizeIncidentPriority(priority, category);
  const incidents = config?.incidents || {};
  const configured = {
    urgente: incidents.urgentSlaHours,
    alta: incidents.highSlaHours,
    media: incidents.mediumSlaHours,
    baja: incidents.lowSlaHours,
  }[normalized];
  const fallback = incidentPriorityMeta(normalized).defaultSlaHours;
  const value = Number(configured);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function incidentReadableId(id = '', createdAt = '') {
  const date = (dateToIso(createdAt) || new Date().toISOString()).slice(0, 10).replaceAll('-', '');
  const suffix = clean(id || Math.random().toString(36).slice(2, 8), 32)
    .replace(/[^a-z0-9]/gi, '')
    .slice(-6)
    .toUpperCase()
    .padStart(6, '0');
  return `INC-${date}-${suffix}`;
}

export function normalizeIncident(raw = {}, options = {}) {
  const nowIso = options.nowIso || new Date().toISOString();
  const description = clean(firstPresent(raw.descripcion, raw.description, raw.detalle, raw.body), 4000);
  const title = clean(firstPresent(raw.titulo, raw.title, description, 'Incidencia sin titulo'), 180);
  const category = normalizeIncidentCategory(firstPresent(raw.categoria, raw.category, raw.aiClassification?.category), `${title} ${description}`);
  const priority = normalizeIncidentPriority(firstPresent(raw.prioridad, raw.priority, raw.aiClassification?.priority), category);
  const status = normalizeIncidentStatus(firstPresent(raw.estado, raw.status));
  const createdAt = dateToIso(firstPresent(raw.createdAt, raw.created_at, raw.fecha)) || nowIso;
  const updatedAt = dateToIso(firstPresent(raw.updatedAt, raw.updated_at)) || createdAt;
  const resolvedAt = dateToIso(firstPresent(raw.resolvedAt, raw.fecha_resolucion, raw.resuelta_at));
  const dueAt = dateToIso(firstPresent(raw.slaDueAt, raw.dueAt, raw.fecha_limite))
    || addHours(createdAt, incidentSlaHours(priority, category, options.config));
  const meta = incidentPriorityMeta(priority);
  const history = normalizeIncidentHistory(firstPresent(raw.history, raw.historial));
  const conversations = normalizeIncidentConversation(firstPresent(raw.conversations, raw.conversaciones, raw.messages));
  const attachments = normalizeIncidentAttachments(firstPresent(raw.attachments, raw.adjuntos, raw.files));
  const resolutionTimeMinutes = raw.resolutionTimeMinutes ?? raw.tiempo_resolucion_minutos ?? (
    resolvedAt ? minutesBetween(createdAt, resolvedAt) : null
  );

  return {
    ...raw,
    id: raw.id || '',
    ticketId: clean(raw.ticketId || raw.identifier || incidentReadableId(raw.id, createdAt), 40),
    schemaVersion: 'incident_ticket_v1',
    incidentEngineVersion: INCIDENT_ENGINE_VERSION,
    titulo: title,
    title,
    descripcion: description,
    description,
    categoria: category,
    category,
    prioridad: priority,
    priority: meta.severity,
    priorityLabel: meta.label,
    priorityRank: meta.rank,
    estado: status,
    status,
    userUid: clean(firstPresent(raw.userUid, raw.usuario_id, raw.reportado_por), 120),
    reportado_por: clean(firstPresent(raw.reportado_por, raw.userUid, raw.usuario_id), 120),
    relatedUserUid: clean(firstPresent(raw.relatedUserUid, raw.usuario_relacionado_id), 120),
    teacherUid: clean(firstPresent(raw.teacherUid, raw.profesor_id), 120),
    profesor_id: clean(firstPresent(raw.profesor_id, raw.teacherUid), 120),
    familyUid: clean(firstPresent(raw.familyUid, raw.familia_id), 120),
    familia_id: clean(firstPresent(raw.familia_id, raw.familyUid), 120),
    classId: clean(firstPresent(raw.classId, raw.clase_id), 120),
    clase_id: clean(firstPresent(raw.clase_id, raw.classId), 120),
    paymentId: clean(firstPresent(raw.paymentId, raw.pago_id), 120),
    documentId: clean(firstPresent(raw.documentId, raw.documento_id), 120),
    assignedAdminUid: clean(firstPresent(raw.assignedAdminUid, raw.admin_responsable_uid, raw.responsable_uid), 120),
    assignedAdminEmail: clean(firstPresent(raw.assignedAdminEmail, raw.admin_responsable_email, raw.responsable_email), 180),
    source: clean(raw.source || raw.tipo || raw.type || 'manual', 100),
    automatic: raw.automatic === true || raw.createdByUid === 'automation' || raw.reportado_por === 'automation',
    slaHours: incidentSlaHours(priority, category, options.config),
    slaDueAt: dueAt,
    dueAt,
    isOverdue: !['resuelta', 'cerrada'].includes(status) && new Date(dueAt).getTime() < new Date(nowIso).getTime(),
    createdAt,
    created_at: raw.created_at || createdAt,
    updatedAt,
    updated_at: raw.updated_at || updatedAt,
    resolvedAt: resolvedAt || null,
    fecha_resolucion: raw.fecha_resolucion || resolvedAt || null,
    resolution: clean(firstPresent(raw.resolution, raw.resolucion), 4000),
    resolucion: clean(firstPresent(raw.resolucion, raw.resolution), 4000),
    rootCause: clean(firstPresent(raw.rootCause, raw.causa), 800),
    causa: clean(firstPresent(raw.causa, raw.rootCause), 800),
    actionsTaken: toArray(firstPresent(raw.actionsTaken, raw.acciones_realizadas)).map((item) => normalizeIncidentAction(item)),
    history,
    historial: history,
    conversations,
    conversaciones: conversations,
    attachments,
    adjuntos: attachments,
    resolutionTimeMinutes,
    tiempo_resolucion_minutos: resolutionTimeMinutes,
    tags: toArray(raw.tags || raw.etiquetas).map((item) => clean(item, 60)).filter(Boolean).slice(0, 20),
    suggestedActions: toArray(raw.suggestedActions || raw.aiClassification?.suggestedActions).map((item) => clean(item, 240)).slice(0, 8),
  };
}

function normalizeIncidentHistory(value) {
  return toArray(value).map((item) => ({
    at: dateToIso(firstPresent(item.at, item.createdAt, item.fecha)) || new Date().toISOString(),
    actorUid: clean(firstPresent(item.actorUid, item.uid), 120),
    actorEmail: clean(firstPresent(item.actorEmail, item.email), 180),
    action: clean(firstPresent(item.action, item.accion, item.type), 120),
    note: clean(firstPresent(item.note, item.nota, item.description), 1000),
    changes: Array.isArray(item.changes) ? item.changes.slice(0, 20) : [],
  })).slice(-80);
}

function normalizeIncidentConversation(value) {
  return toArray(value).map((item) => ({
    id: clean(item.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, 80),
    at: dateToIso(firstPresent(item.at, item.createdAt, item.fecha)) || new Date().toISOString(),
    authorUid: clean(firstPresent(item.authorUid, item.uid), 120),
    authorEmail: clean(firstPresent(item.authorEmail, item.email), 180),
    authorRole: clean(firstPresent(item.authorRole, item.role), 80),
    visibility: clean(item.visibility || 'internal', 40),
    body: clean(firstPresent(item.body, item.text, item.message), 2000),
  })).filter((item) => item.body).slice(-120);
}

function normalizeIncidentAttachments(value) {
  return toArray(value).map((item) => ({
    id: clean(item.id || `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, 80),
    name: clean(firstPresent(item.name, item.nombre, item.fileName, item.url), 180),
    url: clean(firstPresent(item.url, item.downloadUrl), 1200),
    type: clean(firstPresent(item.type, item.mimeType), 100),
    addedAt: dateToIso(firstPresent(item.addedAt, item.createdAt)) || new Date().toISOString(),
    addedByUid: clean(firstPresent(item.addedByUid, item.ownerUid), 120),
  })).filter((item) => item.name || item.url).slice(-40);
}

function normalizeIncidentAction(value) {
  if (typeof value === 'string') {
    return { at: new Date().toISOString(), action: clean(value, 400), actorUid: '', actorEmail: '' };
  }
  return {
    at: dateToIso(firstPresent(value.at, value.createdAt)) || new Date().toISOString(),
    action: clean(firstPresent(value.action, value.text, value.descripcion), 500),
    actorUid: clean(firstPresent(value.actorUid, value.uid), 120),
    actorEmail: clean(firstPresent(value.actorEmail, value.email), 180),
  };
}

function actorInfo(actor = {}) {
  return {
    actorUid: clean(firstPresent(actor.uid, actor.id, actor.actorUid), 120),
    actorEmail: clean(firstPresent(actor.email, actor.actorEmail), 180),
    actorRole: clean(firstPresent(actor.rol, actor.role, actor.actorRole, 'admin'), 80),
  };
}

export function buildIncidentHistoryEntry(action, actor = {}, note = '', changes = [], nowIso = new Date().toISOString()) {
  return {
    at: nowIso,
    ...actorInfo(actor),
    action: clean(action, 120),
    note: clean(note, 1000),
    changes: Array.isArray(changes) ? changes.slice(0, 20) : [],
  };
}

export function buildIncidentCreatePayload(input = {}, actor = {}, options = {}) {
  const nowIso = options.nowIso || new Date().toISOString();
  const base = normalizeIncident({
    ...input,
    estado: input.estado || input.status || 'abierta',
    createdAt: input.createdAt || nowIso,
    updatedAt: input.updatedAt || nowIso,
  }, { ...options, nowIso });
  const history = normalizeIncidentHistory(base.history);
  history.push(buildIncidentHistoryEntry('incident.created', actor, 'Ticket creado.', [], nowIso));
  return {
    ...base,
    ticketId: base.ticketId || incidentReadableId(input.id, nowIso),
    createdByUid: clean(firstPresent(input.createdByUid, actor.uid, actor.id, actor.actorUid), 120),
    createdByEmail: clean(firstPresent(input.createdByEmail, actor.email, actor.actorEmail), 180),
    history,
    historial: history,
    createdAt: nowIso,
    created_at: nowIso,
    updatedAt: nowIso,
    updated_at: nowIso,
  };
}

export function buildIncidentUpdatePatch(previous = {}, changes = {}, actor = {}, options = {}) {
  const nowIso = options.nowIso || new Date().toISOString();
  const before = normalizeIncident(previous, options);
  const merged = normalizeIncident({ ...before, ...changes, updatedAt: nowIso, updated_at: nowIso }, { ...options, nowIso });
  const diff = [];
  ['estado', 'prioridad', 'categoria', 'assignedAdminUid', 'assignedAdminEmail', 'rootCause', 'resolution'].forEach((field) => {
    if (String(before[field] ?? '') !== String(merged[field] ?? '')) {
      diff.push({ field, before: before[field] ?? null, after: merged[field] ?? null });
    }
  });

  const history = normalizeIncidentHistory(before.history);
  const note = clean(changes.note || changes.actionNote || changes.resolution || changes.resolucion || '', 1000);
  if (diff.length || note) history.push(buildIncidentHistoryEntry('incident.updated', actor, note, diff, nowIso));

  const conversations = normalizeIncidentConversation(before.conversations);
  if (clean(changes.message)) {
    const actorData = actorInfo(actor);
    conversations.push({
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      at: nowIso,
      authorUid: actorData.actorUid,
      authorEmail: actorData.actorEmail,
      authorRole: actorData.actorRole,
      visibility: clean(changes.messageVisibility || 'internal', 40),
      body: clean(changes.message, 2000),
    });
  }

  const actionsTaken = toArray(before.actionsTaken);
  if (clean(changes.actionTaken)) {
    const actorData = actorInfo(actor);
    actionsTaken.push({
      at: nowIso,
      action: clean(changes.actionTaken, 500),
      actorUid: actorData.actorUid,
      actorEmail: actorData.actorEmail,
    });
  }

  const attachments = normalizeIncidentAttachments(before.attachments);
  if (clean(changes.attachmentUrl) || clean(changes.attachmentName)) {
    const actorData = actorInfo(actor);
    attachments.push({
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: clean(changes.attachmentName || changes.attachmentUrl, 180),
      url: clean(changes.attachmentUrl, 1200),
      type: clean(changes.attachmentType || 'link', 100),
      addedAt: nowIso,
      addedByUid: actorData.actorUid,
    });
  }

  const resolved = ['resuelta', 'cerrada'].includes(merged.estado);
  const resolvedAt = resolved ? (before.resolvedAt || nowIso) : null;
  const resolutionTimeMinutes = resolved ? minutesBetween(before.createdAt, resolvedAt) : null;

  return normalizeIncident({
    ...merged,
    history,
    historial: history,
    conversations,
    conversaciones: conversations,
    actionsTaken,
    acciones_realizadas: actionsTaken,
    attachments,
    adjuntos: attachments,
    resolvedAt,
    fecha_resolucion: resolvedAt,
    resolutionTimeMinutes,
    tiempo_resolucion_minutos: resolutionTimeMinutes,
    updatedAt: nowIso,
    updated_at: nowIso,
  }, { ...options, nowIso });
}

export function buildAutomaticIncidentPayload(kind, source = {}, options = {}) {
  const nowIso = options.nowIso || new Date().toISOString();
  const labels = {
    payment_overdue: ['Pago vencido sin resolver', 'pago', 'alta'],
    finance_anomaly: ['Anomalia financiera detectada', 'finanzas', 'alta'],
    class_unconfirmed: ['Clase sin confirmar', 'clase', 'alta'],
    document_stale: ['Documento pendiente atascado', 'documentacion', 'media'],
    document_expired: ['Documento caducado', 'documentacion', 'alta'],
    matching_blocked: ['Matching bloqueado', 'matching', 'alta'],
    preventive_risk: ['Riesgo preventivo detectado', 'operativa', 'media'],
    ai_error: ['Error de IA detectado', 'ia', 'media'],
    sync_error: ['Problema de sincronizacion', 'sincronizacion', 'media'],
    system_error: ['Error tecnico del sistema', 'tecnica', 'alta'],
    user_conflict: ['Conflicto entre usuarios', 'conflicto', 'alta'],
  };
  const [title, category, priority] = labels[kind] || ['Incidencia operativa', 'operativa', 'media'];
  const idSource = clean(firstPresent(source.id, source.classId, source.paymentId, source.documentId, source.eventId, kind), 120);
  return buildIncidentCreatePayload({
    id: `auto_${kind}_${idSource}`.replace(/[^a-z0-9_-]/gi, '_').slice(0, 160),
    ticketId: source.ticketId,
    titulo: source.titulo || source.title || title,
    descripcion: source.descripcion || source.description || source.reason || title,
    categoria: category,
    prioridad: source.prioridad || source.priority || priority,
    source: kind,
    automatic: true,
    classId: source.classId || source.clase_id || '',
    clase_id: source.clase_id || source.classId || '',
    paymentId: source.paymentId || source.pago_id || '',
    pago_id: source.pago_id || source.paymentId || '',
    documentId: source.documentId || source.documento_id || '',
    documento_id: source.documento_id || source.documentId || '',
    teacherUid: source.teacherUid || source.profesor_id || '',
    profesor_id: source.profesor_id || source.teacherUid || '',
    familyUid: source.familyUid || source.familia_id || '',
    familia_id: source.familia_id || source.familyUid || '',
    relatedUserUid: source.relatedUserUid || source.userUid || source.ownerUid || '',
    tags: ['automatico', kind, category],
    suggestedActions: source.suggestedActions || [],
    createdAt: nowIso,
    updatedAt: nowIso,
  }, { uid: 'automation', email: '', role: 'system' }, options);
}

const PREVENTIVE_SEVERITY_META = Object.freeze({
  critical: { priorityRank: 1, prioridad: 'urgente', label: 'Critico' },
  high: { priorityRank: 2, prioridad: 'alta', label: 'Alto' },
  medium: { priorityRank: 3, prioridad: 'media', label: 'Medio' },
  low: { priorityRank: 4, prioridad: 'baja', label: 'Bajo' },
});

const PREVENTIVE_OPEN_STATUSES = new Set([
  '',
  'nueva',
  'nuevo',
  'pendiente',
  'pending',
  'open',
  'abierta',
  'en_proceso',
  'revision',
  'en_revision',
  'activa',
  'active',
  'programada',
  'confirmada',
  'solicitado',
  'propuesto',
  'enviado',
]);

const PREVENTIVE_CLOSED_STATUSES = new Set([
  'cerrada',
  'cerrado',
  'resuelta',
  'resolved',
  'done',
  'completada',
  'completado',
  'archivada',
  'archived',
  'cancelada',
  'cancelado',
  'cancelled',
  'rechazada',
  'rechazado',
  'rejected',
]);

const PREVENTIVE_PAID_STATUSES = new Set([
  'pagado',
  'paid',
  'validado',
  'validated',
  'succeeded',
  'cobrado',
  'confirmado',
  'comision_liquidada',
]);

function preventiveNumber(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function preventiveList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function preventiveStatus(item = {}) {
  return lower(firstPresent(
    item.status,
    item.estado,
    item.lifecycleStatus,
    item.estado_verificacion,
    item.verificationStatus,
    item.matchStatus,
  ));
}

function preventiveDate(value) {
  const iso = dateToIso(value);
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function preventiveReferenceDate(item = {}) {
  return preventiveDate(firstPresent(
    item.lastActivityAt,
    item.lastMessageAt,
    item.lastLoginAt,
    item.updatedAt,
    item.updated_at,
    item.fecha_actualizacion,
    item.createdAt,
    item.created_at,
    item.fecha,
  ));
}

function preventiveHoursSince(value, nowMs) {
  const date = preventiveDate(value);
  if (!date) return 0;
  return Math.max(0, (nowMs - date.getTime()) / 36e5);
}

function preventiveDaysSince(value, nowMs) {
  return preventiveHoursSince(value, nowMs) / 24;
}

function preventiveIsOpen(item = {}) {
  const status = preventiveStatus(item);
  if (PREVENTIVE_CLOSED_STATUSES.has(status)) return false;
  return PREVENTIVE_OPEN_STATUSES.has(status) || !status;
}

function preventiveIsPaymentOpen(item = {}) {
  const status = lower(firstPresent(
    item.familyPaymentStatus,
    item.estado_pago_familia,
    item.paymentStatus,
    item.estado,
    item.status,
  ));
  return !PREVENTIVE_PAID_STATUSES.has(status) && !PREVENTIVE_CLOSED_STATUSES.has(status);
}

function preventiveId(item = {}, ...fields) {
  return clean(firstPresent(...fields.map((field) => item[field]), item.id, item.uid, item.userUid, item.email), 180);
}

function preventiveUserUid(item = {}, role = '') {
  if (role === 'teacher') return clean(firstPresent(item.teacherUid, item.profesor_id, item.profesorUid, item.userUid, item.usuario_id, item.id), 180);
  if (role === 'family') return clean(firstPresent(item.familyUid, item.familia_id, item.familyUserUid, item.userUid, item.usuario_id, item.id), 180);
  if (role === 'student') return clean(firstPresent(item.studentId, item.alumno_id, item.studentUid, item.id), 180);
  return clean(firstPresent(item.userUid, item.usuario_id, item.ownerUid, item.id), 180);
}

function preventiveSafeId(...parts) {
  return clean(parts
    .map((part) => clean(part, 180).toLowerCase().replace(/[^a-z0-9_-]+/g, '_'))
    .filter(Boolean)
    .join('__'), 180);
}

function preventiveSeverity(value = 'medium') {
  const severity = lower(value);
  if (['critical', 'critico', 'urgente'].includes(severity)) return 'critical';
  if (['high', 'alto', 'alta'].includes(severity)) return 'high';
  if (['low', 'bajo', 'baja'].includes(severity)) return 'low';
  return 'medium';
}

function preventiveRisk(input = {}) {
  const severity = preventiveSeverity(input.severity);
  const meta = PREVENTIVE_SEVERITY_META[severity] || PREVENTIVE_SEVERITY_META.medium;
  const entityType = clean(input.entityType || 'platform', 80);
  const entityId = clean(input.entityId || input.id || input.type || 'general', 180);
  const type = clean(input.type || 'preventive_risk', 100);
  const id = preventiveSafeId('preventive', type, entityType, entityId, input.fingerprint || '');
  return {
    id,
    type,
    severity,
    severityLabel: meta.label,
    prioridad: input.prioridad || meta.prioridad,
    priorityRank: meta.priorityRank,
    entityType,
    entityId,
    title: clean(input.title || 'Riesgo preventivo detectado', 180),
    description: clean(input.description || input.title || 'El sistema ha detectado una situacion que requiere seguimiento.', 1200),
    metric: clean(input.metric || '', 160),
    value: input.value ?? null,
    threshold: input.threshold ?? null,
    familyUid: clean(input.familyUid || '', 180),
    teacherUid: clean(input.teacherUid || '', 180),
    studentId: clean(input.studentId || '', 180),
    classId: clean(input.classId || '', 180),
    paymentId: clean(input.paymentId || '', 180),
    requestId: clean(input.requestId || '', 180),
    assignmentId: clean(input.assignmentId || '', 180),
    chatId: clean(input.chatId || '', 180),
    incidentId: clean(input.incidentId || '', 180),
    notificationId: clean(input.notificationId || '', 180),
    impactedRoles: preventiveList(input.impactedRoles).map((item) => clean(item, 80)).slice(0, 6),
    suggestedActions: preventiveList(input.suggestedActions).map((item) => clean(item, 220)).slice(0, 8),
    evidence: preventiveList(input.evidence).map((item) => clean(item, 260)).slice(0, 8),
    related: input.related && typeof input.related === 'object' ? input.related : {},
    shouldCreateIncident: input.shouldCreateIncident !== false && ['critical', 'high'].includes(severity),
    shouldNotifyAdmin: input.shouldNotifyAdmin !== false && ['critical', 'high'].includes(severity),
    shouldCreateTask: input.shouldCreateTask !== false && severity !== 'low',
    detectedAt: input.detectedAt || new Date().toISOString(),
    version: PREVENTIVE_INCIDENT_VERSION,
  };
}

function preventivePushRisk(risks, seen, input) {
  const risk = preventiveRisk(input);
  if (!risk.entityId || seen.has(risk.id)) return;
  seen.add(risk.id);
  risks.push(risk);
}

function preventiveIsCancelledClass(item = {}) {
  return ['cancelada', 'cancelado', 'cancelled', 'rechazada', 'rechazado'].includes(preventiveStatus(item));
}

function preventiveIsClassActive(item = {}) {
  return !PREVENTIVE_CLOSED_STATUSES.has(preventiveStatus(item));
}

function preventiveClassDate(item = {}) {
  return preventiveDate(firstPresent(
    item.endAtIso,
    item.fecha_fin,
    item.endsAt,
    item.startAtIso,
    item.fecha,
    item.date,
    item.createdAt,
    item.created_at,
  ));
}

function preventivePaymentDueDate(item = {}) {
  return preventiveDate(firstPresent(
    item.dueAt,
    item.fecha_vencimiento,
    item.familyPaymentDueAt,
    item.paymentDueAt,
    item.vencimiento,
  ));
}

function preventiveGroupCount(groups, key, item) {
  if (!key) return;
  const group = groups.get(key) || { key, count: 0, items: [] };
  group.count += 1;
  group.items.push(item);
  groups.set(key, group);
}

function preventiveArrayField(item = {}, ...fields) {
  return fields.flatMap((field) => {
    const value = item[field];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return value.split(',').map((part) => part.trim()).filter(Boolean);
    return [];
  }).filter(Boolean);
}

function preventiveTeacherProfileAudit(teacher = {}, minPercent = 85) {
  const checks = [
    ['nombre', clean(firstPresent(teacher.nombre, teacher.name, teacher.displayName))],
    ['telefono', clean(firstPresent(teacher.telefono, teacher.phone, teacher.whatsapp))],
    ['foto', clean(firstPresent(teacher.foto_url, teacher.photoUrl, teacher.profilePhotoUrl, teacher.avatarUrl))],
    ['direccion', clean(firstPresent(teacher.direccion, teacher.calle, teacher.address, teacher.zona, teacher.ciudad))],
    ['materias', preventiveArrayField(teacher, 'materias', 'subjects').length],
    ['niveles', preventiveArrayField(teacher, 'niveles_educativos', 'niveles', 'levels').length],
    ['disponibilidad', clean(firstPresent(teacher.disponibilidad_resumen, teacher.availabilitySummary, teacher.preferencia_horario))],
    ['experiencia', clean(firstPresent(teacher.experiencia, teacher.bio, teacher.descripcion))],
    ['colegio', clean(firstPresent(teacher.colegio, teacher.schoolName, teacher.centro_escolar))],
    ['universidad', clean(firstPresent(teacher.universidad, teacher.centro_estudios, teacher.universityName))],
    ['estudios', clean(firstPresent(teacher.estudio_exacto, teacher.titulacion, teacher.nivel_estudios))],
    ['bizum', teacher.acepta_bizum === true || teacher.bizumEnabled === true || teacher.tieneBizum === true],
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([field]) => field);
  const percent = Math.round(((checks.length - missing.length) / checks.length) * 100);
  return {
    percent: Number.isFinite(Number(teacher.profileCompletionPercent))
      ? Math.round(Number(teacher.profileCompletionPercent))
      : percent,
    missing,
    belowThreshold: percent < minPercent || Number(teacher.profileCompletionPercent || percent) < minPercent,
  };
}

function preventiveRecent(item = {}, windowDays, nowMs) {
  const date = preventiveReferenceDate(item);
  if (!date) return false;
  return nowMs - date.getTime() <= windowDays * 24 * 60 * 60 * 1000;
}

export function buildPreventiveIncidentPlan(dataset = {}, options = {}) {
  const nowIso = options.nowIso || new Date().toISOString();
  const nowDate = new Date(nowIso);
  const nowMs = Number.isNaN(nowDate.getTime()) ? Date.now() : nowDate.getTime();
  const thresholds = {
    teacherNonResponseHours: preventiveNumber(options.teacherNonResponseHours, 8, 1, 720),
    staleRequestHours: preventiveNumber(options.staleRequestHours, 24, 1, 1440),
    unscheduledAssignmentHours: preventiveNumber(options.unscheduledAssignmentHours, 48, 1, 1440),
    chatStalledHours: preventiveNumber(options.chatStalledHours, 48, 1, 1440),
    paymentGraceHours: preventiveNumber(options.paymentGraceHours, 24, 0, 720),
    repeatedCancellationWindowDays: preventiveNumber(options.repeatedCancellationWindowDays, 30, 1, 365),
    repeatedCancellationThreshold: preventiveNumber(options.repeatedCancellationThreshold, 3, 2, 50),
    recurrentIncidentWindowDays: preventiveNumber(options.recurrentIncidentWindowDays, 30, 1, 365),
    recurrentIncidentThreshold: preventiveNumber(options.recurrentIncidentThreshold, 3, 2, 50),
    incompleteProfilePercent: preventiveNumber(options.incompleteProfilePercent, 85, 1, 100),
    familyInactiveDays: preventiveNumber(options.familyInactiveDays, 14, 1, 365),
    unreadHighNotificationHours: preventiveNumber(options.unreadHighNotificationHours, 24, 1, 720),
  };

  const classes = preventiveList(dataset.classes || dataset.clases);
  const payments = preventiveList(dataset.payments || dataset.pagos);
  const requests = preventiveList(dataset.requests || dataset.solicitudes);
  const requestMatches = preventiveList(dataset.requestMatches || dataset.solicitudMatches || dataset.matches);
  const assignments = preventiveList(dataset.assignments || dataset.asignaciones);
  const incidents = preventiveList(dataset.incidents || dataset.incidencias);
  const teachers = preventiveList(dataset.teachers || dataset.profesores);
  const families = preventiveList(dataset.families || dataset.familias);
  const chats = preventiveList(dataset.chats || dataset.conversaciones || dataset.threads);
  const notifications = preventiveList(dataset.notifications || dataset.notificaciones);
  const deadLetters = preventiveList(dataset.deadLetters);
  const opsAlerts = preventiveList(dataset.opsAlerts);
  const automationEvents = preventiveList(dataset.automationEvents);

  const risks = [];
  const seen = new Set();
  const activeClassesByAssignment = new Map();
  const activeClassesByRequest = new Map();
  const assignmentsByRequest = new Map();

  for (const klass of classes) {
    if (!preventiveIsClassActive(klass)) continue;
    const assignmentId = clean(firstPresent(klass.assignmentId, klass.asignacion_id), 180);
    const requestId = clean(firstPresent(klass.requestId, klass.solicitud_id), 180);
    if (assignmentId) preventiveGroupCount(activeClassesByAssignment, assignmentId, klass);
    if (requestId) preventiveGroupCount(activeClassesByRequest, requestId, klass);
  }

  for (const assignment of assignments) {
    const requestId = clean(firstPresent(assignment.requestId, assignment.solicitud_id), 180);
    if (requestId) preventiveGroupCount(assignmentsByRequest, requestId, assignment);
  }

  for (const match of requestMatches) {
    const status = lower(firstPresent(match.status, match.estado, match.responseStatus, match.teacherResponseStatus));
    if (PREVENTIVE_CLOSED_STATUSES.has(status) || ['aceptada', 'aceptado', 'accepted'].includes(status)) continue;
    const requestId = clean(firstPresent(match.requestId, match.solicitud_id, match.solicitudId), 180);
    const teacherUid = clean(firstPresent(match.teacherUid, match.profesor_id, match.profesorUid), 180);
    const reference = firstPresent(match.sentAt, match.createdAt, match.created_at, match.updatedAt);
    const age = preventiveHoursSince(reference, nowMs);
    if (!requestId || !teacherUid || age < thresholds.teacherNonResponseHours) continue;
    preventivePushRisk(risks, seen, {
      type: 'teacher_non_response',
      severity: age >= thresholds.teacherNonResponseHours * 2 ? 'high' : 'medium',
      entityType: 'solicitudMatches',
      entityId: clean(firstPresent(match.id, `${requestId}_${teacherUid}`), 180),
      requestId,
      teacherUid,
      title: 'Profesor sin respuesta a una propuesta',
      description: `El profesor lleva ${Math.round(age)}h sin responder una propuesta de matching.`,
      metric: 'horas_sin_respuesta',
      value: Math.round(age),
      threshold: thresholds.teacherNonResponseHours,
      impactedRoles: ['admin', 'profesor', 'familia'],
      suggestedActions: [
        'Recordar al profesor que acepte o rechace la propuesta.',
        'Preparar un profesor alternativo si no responde dentro del siguiente SLA.',
        'Evitar que la familia quede esperando sin explicacion.',
      ],
      evidence: [`Solicitud ${requestId}`, `Profesor ${teacherUid}`, `Estado ${status || 'pendiente'}`],
    });
  }

  for (const request of requests) {
    if (!preventiveIsOpen(request)) continue;
    const requestId = preventiveId(request, 'requestId', 'solicitud_id');
    const assignedTeacher = clean(firstPresent(request.assignedTeacherUid, request.profesor_asignado_id, request.teacherUid, request.profesor_id), 180);
    const age = preventiveHoursSince(firstPresent(request.createdAt, request.created_at, request.fecha), nowMs);
    if (!assignedTeacher && age >= thresholds.staleRequestHours) {
      const activePlan = request.activeMatchingPlan || {};
      const blocked = ['blocked_no_candidates', 'stale_waiting_teacher', 'needs_admin_attention'].includes(lower(activePlan.status));
      preventivePushRisk(risks, seen, {
        type: 'request_without_teacher',
        severity: blocked || age >= thresholds.staleRequestHours * 2 ? 'high' : 'medium',
        entityType: 'solicitudes',
        entityId: requestId,
        requestId,
        familyUid: preventiveUserUid(request, 'family'),
        studentId: preventiveUserUid(request, 'student'),
        title: 'Familia esperando profesor',
        description: `La solicitud lleva ${Math.round(age)}h abierta sin profesor asignado.`,
        metric: 'horas_sin_asignacion',
        value: Math.round(age),
        threshold: thresholds.staleRequestHours,
        impactedRoles: ['admin', 'familia'],
        suggestedActions: [
          'Abrir la solicitud y usar el ranking de matching.',
          'Si no hay candidatos, ampliar modalidad, zona o materia.',
          'Avisar a la familia si el sistema detecta baja oferta.',
        ],
        evidence: [
          `Materia ${clean(firstPresent(request.subject, request.materia, 'sin materia'), 120)}`,
          `Estado matching ${clean(firstPresent(request.matchStatus, activePlan.status, 'sin estado'), 120)}`,
        ],
      });
    }

    if (assignedTeacher && !assignmentsByRequest.has(requestId) && !activeClassesByRequest.has(requestId)) {
      preventivePushRisk(risks, seen, {
        type: 'request_assigned_without_relationship',
        severity: 'high',
        entityType: 'solicitudes',
        entityId: requestId,
        requestId,
        teacherUid: assignedTeacher,
        familyUid: preventiveUserUid(request, 'family'),
        title: 'Solicitud asignada sin relacion operativa',
        description: 'La solicitud tiene profesor asignado, pero no aparece asignacion ni clase activa relacionada.',
        metric: 'sin_asignacion_ni_clase',
        impactedRoles: ['admin'],
        suggestedActions: [
          'Crear o reparar la asignacion profesor-familia.',
          'Verificar que exista chat y que el calendario pueda programar clases.',
        ],
      });
    }
  }

  for (const assignment of assignments) {
    if (!preventiveIsOpen(assignment)) continue;
    const assignmentId = preventiveId(assignment, 'assignmentId', 'asignacion_id');
    const requestId = clean(firstPresent(assignment.requestId, assignment.solicitud_id), 180);
    const teacherUid = preventiveUserUid(assignment, 'teacher');
    const familyUid = preventiveUserUid(assignment, 'family');
    const age = preventiveHoursSince(firstPresent(assignment.acceptedAt, assignment.createdAt, assignment.created_at, assignment.updatedAt), nowMs);
    const hasClass = activeClassesByAssignment.has(assignmentId) || (requestId && activeClassesByRequest.has(requestId));
    if (!hasClass && age >= thresholds.unscheduledAssignmentHours) {
      preventivePushRisk(risks, seen, {
        type: 'assignment_without_scheduled_class',
        severity: age >= thresholds.unscheduledAssignmentHours * 2 ? 'high' : 'medium',
        entityType: 'asignaciones',
        entityId: assignmentId,
        assignmentId,
        requestId,
        teacherUid,
        familyUid,
        title: 'Relacion aceptada sin primera clase',
        description: `Profesor y familia estan relacionados, pero no hay clase programada despues de ${Math.round(age)}h.`,
        metric: 'horas_sin_primera_clase',
        value: Math.round(age),
        threshold: thresholds.unscheduledAssignmentHours,
        impactedRoles: ['admin', 'profesor', 'familia'],
        suggestedActions: [
          'Recordar a ambas partes que acuerden horario fijo.',
          'Crear una tarea para que administracion proponga franjas compatibles.',
          'Comprobar que el chat existe y esta visible para ambos usuarios.',
        ],
      });
    }
    if (!clean(firstPresent(assignment.chatId, assignment.threadId, assignment.conversationId), 180)) {
      preventivePushRisk(risks, seen, {
        type: 'assignment_without_chat',
        severity: 'high',
        entityType: 'asignaciones',
        entityId: assignmentId,
        assignmentId,
        requestId,
        teacherUid,
        familyUid,
        title: 'Relacion sin chat disponible',
        description: 'Hay una asignacion activa sin identificador de chat, lo que puede bloquear la coordinacion de horarios.',
        metric: 'chat_faltante',
        impactedRoles: ['admin', 'profesor', 'familia'],
        suggestedActions: ['Recrear el chat de la relacion.', 'Enviar mensaje de bienvenida cuando el chat quede disponible.'],
      });
    }
  }

  for (const chat of chats) {
    const chatId = preventiveId(chat, 'chatId', 'threadId', 'conversationId');
    const status = preventiveStatus(chat);
    if (PREVENTIVE_CLOSED_STATUSES.has(status)) continue;
    const age = preventiveHoursSince(firstPresent(chat.lastMessageAt, chat.updatedAt, chat.updated_at, chat.createdAt), nowMs);
    if (age < thresholds.chatStalledHours) continue;
    const requestId = clean(firstPresent(chat.requestId, chat.solicitud_id), 180);
    const assignmentId = clean(firstPresent(chat.assignmentId, chat.asignacion_id), 180);
    const hasClass = (assignmentId && activeClassesByAssignment.has(assignmentId)) || (requestId && activeClassesByRequest.has(requestId));
    if (hasClass) continue;
    preventivePushRisk(risks, seen, {
      type: 'chat_stalled_before_scheduling',
      severity: age >= thresholds.chatStalledHours * 2 ? 'high' : 'medium',
      entityType: 'chats',
      entityId: chatId,
      chatId,
      requestId,
      assignmentId,
      teacherUid: preventiveUserUid(chat, 'teacher'),
      familyUid: preventiveUserUid(chat, 'family'),
      title: 'Chat parado antes de programar clase',
      description: `El chat lleva ${Math.round(age)}h sin actividad y no existe una clase activa relacionada.`,
      metric: 'horas_chat_inactivo',
      value: Math.round(age),
      threshold: thresholds.chatStalledHours,
      impactedRoles: ['admin', 'profesor', 'familia'],
      suggestedActions: [
        'Enviar recordatorio contextual a la parte que debe proponer horario.',
        'Sugerir franjas compatibles si ambos tienen disponibilidad cargada.',
      ],
    });
  }

  for (const payment of payments) {
    if (!preventiveIsPaymentOpen(payment)) continue;
    const dueAt = preventivePaymentDueDate(payment);
    if (!dueAt) continue;
    const overdueHours = Math.max(0, (nowMs - dueAt.getTime()) / 36e5);
    if (overdueHours < thresholds.paymentGraceHours) continue;
    const paymentId = preventiveId(payment, 'paymentId', 'pago_id');
    preventivePushRisk(risks, seen, {
      type: 'payment_overdue_preventive',
      severity: overdueHours >= thresholds.paymentGraceHours + 24 ? 'critical' : 'high',
      entityType: 'pagos',
      entityId: paymentId,
      paymentId,
      classId: clean(firstPresent(payment.classId, payment.clase_id, preventiveList(payment.classIds)[0]), 180),
      teacherUid: preventiveUserUid(payment, 'teacher'),
      familyUid: preventiveUserUid(payment, 'family'),
      title: 'Pago vencido con impacto operativo',
      description: `Pago pendiente desde hace ${Math.round(overdueHours)}h tras su vencimiento.`,
      metric: 'horas_pago_vencido',
      value: Math.round(overdueHours),
      threshold: thresholds.paymentGraceHours,
      impactedRoles: ['admin', 'familia'],
      suggestedActions: [
        'Recordar a la familia que suba justificante o confirme Bizum.',
        'Bloquear nuevas clases si se acumulan impagos.',
        'Revisar si existe justificante pendiente de validacion.',
      ],
    });
  }

  const cancelledByEntity = new Map();
  for (const klass of classes) {
    if (!preventiveIsCancelledClass(klass)) continue;
    const date = preventiveClassDate(klass);
    if (!date || nowMs - date.getTime() > thresholds.repeatedCancellationWindowDays * 24 * 60 * 60 * 1000) continue;
    const teacherUid = preventiveUserUid(klass, 'teacher');
    const familyUid = preventiveUserUid(klass, 'family');
    if (teacherUid) preventiveGroupCount(cancelledByEntity, `teacher:${teacherUid}`, klass);
    if (familyUid) preventiveGroupCount(cancelledByEntity, `family:${familyUid}`, klass);
  }
  for (const group of cancelledByEntity.values()) {
    if (group.count < thresholds.repeatedCancellationThreshold) continue;
    const [role, id] = group.key.split(':');
    preventivePushRisk(risks, seen, {
      type: 'repeated_cancellations',
      severity: group.count >= thresholds.repeatedCancellationThreshold + 2 ? 'high' : 'medium',
      entityType: role === 'teacher' ? 'profesores' : 'familias',
      entityId: id,
      teacherUid: role === 'teacher' ? id : '',
      familyUid: role === 'family' ? id : '',
      title: role === 'teacher' ? 'Profesor con cancelaciones repetidas' : 'Familia con cancelaciones repetidas',
      description: `${group.count} cancelaciones en los ultimos ${thresholds.repeatedCancellationWindowDays} dias.`,
      metric: 'cancelaciones_periodo',
      value: group.count,
      threshold: thresholds.repeatedCancellationThreshold,
      impactedRoles: ['admin', role === 'teacher' ? 'profesor' : 'familia'],
      suggestedActions: [
        'Revisar si existe un problema de disponibilidad real.',
        'Actualizar reputacion y registrar seguimiento operativo.',
        'Ajustar horarios recurrentes para evitar nuevas cancelaciones.',
      ],
    });
  }

  const incidentGroups = new Map();
  for (const incident of incidents) {
    if (!preventiveIsOpen(incident) && !preventiveRecent(incident, thresholds.recurrentIncidentWindowDays, nowMs)) continue;
    const category = normalizeIncidentCategory(firstPresent(incident.categoria, incident.category), `${incident.titulo || ''} ${incident.descripcion || ''}`);
    const teacherUid = preventiveUserUid(incident, 'teacher');
    const familyUid = preventiveUserUid(incident, 'family');
    const relatedUserUid = clean(firstPresent(incident.relatedUserUid, incident.userUid, incident.reportado_por), 180);
    if (teacherUid) preventiveGroupCount(incidentGroups, `teacher:${teacherUid}:${category}`, incident);
    if (familyUid) preventiveGroupCount(incidentGroups, `family:${familyUid}:${category}`, incident);
    if (relatedUserUid) preventiveGroupCount(incidentGroups, `user:${relatedUserUid}:${category}`, incident);
  }
  for (const group of incidentGroups.values()) {
    if (group.count < thresholds.recurrentIncidentThreshold) continue;
    const [role, id, category] = group.key.split(':');
    preventivePushRisk(risks, seen, {
      type: 'recurrent_incident_pattern',
      severity: group.count >= thresholds.recurrentIncidentThreshold + 2 ? 'high' : 'medium',
      entityType: role === 'teacher' ? 'profesores' : role === 'family' ? 'familias' : 'users',
      entityId: id,
      teacherUid: role === 'teacher' ? id : '',
      familyUid: role === 'family' ? id : '',
      title: 'Patron de incidencias recurrentes',
      description: `${group.count} incidencias de ${category} relacionadas con el mismo usuario.`,
      metric: 'incidencias_recurrentes',
      value: group.count,
      threshold: thresholds.recurrentIncidentThreshold,
      impactedRoles: ['admin'],
      suggestedActions: [
        'Abrir la ficha CRM del usuario y revisar el historial completo.',
        'Definir causa raiz para evitar que se repita.',
      ],
    });
  }

  for (const teacher of teachers) {
    const status = preventiveStatus(teacher);
    if (teacher.active === false || teacher.activo === false || ['rechazado', 'rejected', 'inactivo', 'inactive'].includes(status)) continue;
    const audit = preventiveTeacherProfileAudit(teacher, thresholds.incompleteProfilePercent);
    if (!audit.belowThreshold) continue;
    const teacherUid = preventiveUserUid(teacher, 'teacher');
    preventivePushRisk(risks, seen, {
      type: 'incomplete_teacher_profile',
      severity: audit.percent < 60 ? 'high' : 'medium',
      entityType: 'profesores',
      entityId: teacherUid,
      teacherUid,
      title: 'Perfil de profesor incompleto',
      description: `El perfil esta al ${audit.percent}% y puede perjudicar confianza, verificacion o matching.`,
      metric: 'perfil_completado',
      value: audit.percent,
      threshold: thresholds.incompleteProfilePercent,
      impactedRoles: ['admin', 'profesor'],
      suggestedActions: [
        'Pedir al profesor que complete los campos obligatorios.',
        'Priorizar colegio, estudios, materias, niveles, foto, disponibilidad y Bizum.',
      ],
      evidence: audit.missing.slice(0, 8).map((field) => `Falta ${field}`),
    });
  }

  for (const family of families) {
    const familyUid = preventiveUserUid(family, 'family');
    if (!familyUid) continue;
    const hasOpenRequest = requests.some((request) => preventiveUserUid(request, 'family') === familyUid && preventiveIsOpen(request));
    if (!hasOpenRequest) continue;
    const inactiveDays = preventiveDaysSince(firstPresent(family.lastActivityAt, family.lastLoginAt, family.updatedAt, family.createdAt), nowMs);
    if (inactiveDays < thresholds.familyInactiveDays) continue;
    preventivePushRisk(risks, seen, {
      type: 'inactive_family_with_open_request',
      severity: inactiveDays >= thresholds.familyInactiveDays * 2 ? 'high' : 'medium',
      entityType: 'familias',
      entityId: familyUid,
      familyUid,
      title: 'Familia inactiva con solicitud abierta',
      description: `La familia tiene una solicitud abierta y lleva ${Math.round(inactiveDays)} dias sin actividad detectada.`,
      metric: 'dias_inactividad',
      value: Math.round(inactiveDays),
      threshold: thresholds.familyInactiveDays,
      impactedRoles: ['admin', 'familia'],
      suggestedActions: [
        'Enviar recordatorio claro con el siguiente paso.',
        'Cerrar o archivar la solicitud si ya no hay interes tras seguimiento.',
      ],
    });
  }

  for (const notification of notifications) {
    const read = notification.readAt || notification.leida === true || notification.read === true;
    if (read) continue;
    const severity = preventiveSeverity(firstPresent(notification.severity, notification.priority));
    if (!['critical', 'high'].includes(severity)) continue;
    const age = preventiveHoursSince(firstPresent(notification.createdAt, notification.created_at), nowMs);
    if (age < thresholds.unreadHighNotificationHours) continue;
    const notificationId = preventiveId(notification, 'notificationId');
    preventivePushRisk(risks, seen, {
      type: 'unread_priority_notification',
      severity: 'medium',
      entityType: 'notificaciones',
      entityId: notificationId,
      notificationId,
      familyUid: preventiveUserUid(notification, 'family'),
      teacherUid: preventiveUserUid(notification, 'teacher'),
      title: 'Aviso prioritario sin leer',
      description: `Una notificacion prioritaria lleva ${Math.round(age)}h sin leerse.`,
      metric: 'horas_notificacion_sin_leer',
      value: Math.round(age),
      threshold: thresholds.unreadHighNotificationHours,
      impactedRoles: ['admin'],
      suggestedActions: ['Revisar si hace falta escalar por correo interno o tarea CRM.'],
    });
  }

  for (const klass of classes) {
    if (!preventiveIsClassActive(klass)) continue;
    const classId = preventiveId(klass, 'classId', 'clase_id');
    const classTeacherUid = clean(firstPresent(klass.teacherUid, klass.profesor_id, klass.profesorUid), 180);
    const classFamilyUid = clean(firstPresent(klass.familyUid, klass.familia_id, klass.familyUserUid), 180);
    const classStudentId = clean(firstPresent(klass.studentId, klass.alumno_id, klass.studentUid), 180);
    const missing = [
      classTeacherUid ? '' : 'profesor',
      classFamilyUid ? '' : 'familia',
      classStudentId ? '' : 'alumno',
    ].filter(Boolean);
    if (!missing.length) continue;
    preventivePushRisk(risks, seen, {
      type: 'class_missing_core_relation',
      severity: 'high',
      entityType: 'clases',
      entityId: classId,
      classId,
      title: 'Clase con relacion incompleta',
      description: `La clase no tiene ${missing.join(', ')} asociado correctamente.`,
      metric: 'relaciones_faltantes',
      value: missing.length,
      threshold: 0,
      impactedRoles: ['admin'],
      suggestedActions: ['Reparar la clase antes de que afecte a calendario, pagos o chat.'],
      evidence: missing.map((field) => `Falta ${field}`),
    });
  }

  for (const item of deadLetters) {
    const status = preventiveStatus(item);
    if (PREVENTIVE_CLOSED_STATUSES.has(status)) continue;
    const id = preventiveId(item, 'jobId', 'id');
    preventivePushRisk(risks, seen, {
      type: 'automation_dead_letter',
      severity: 'critical',
      entityType: 'deadLetters',
      entityId: id,
      title: 'Automatizacion en dead letter',
      description: clean(firstPresent(item.error, item.message, item.type, 'Hay un job que no ha podido recuperarse.'), 900),
      metric: 'dead_letter_abierta',
      impactedRoles: ['admin'],
      suggestedActions: [
        'Revisar el error exacto del job.',
        'Reprocesar cuando el dato o permiso bloqueante este corregido.',
      ],
    });
  }

  for (const alert of opsAlerts) {
    const status = preventiveStatus(alert);
    if (PREVENTIVE_CLOSED_STATUSES.has(status)) continue;
    const id = preventiveId(alert, 'alertId', 'id');
    preventivePushRisk(risks, seen, {
      type: lower(firstPresent(alert.alertType, alert.type)).includes('ai') ? 'ai_operational_alert' : 'open_ops_alert',
      severity: preventiveSeverity(firstPresent(alert.severity, alert.priority, 'high')),
      entityType: 'opsAlerts',
      entityId: id,
      title: clean(firstPresent(alert.title, alert.alertType, alert.type, 'Alerta operativa abierta'), 180),
      description: clean(firstPresent(alert.message, alert.description, 'Hay una alerta operativa sin cerrar.'), 900),
      metric: 'alerta_ops_abierta',
      impactedRoles: ['admin'],
      suggestedActions: ['Abrir Mission Control y resolver la causa antes de que llegue al usuario.'],
    });
  }

  for (const event of automationEvents) {
    const type = lower(firstPresent(event.type, event.action, event.name));
    const errorText = lower(firstPresent(event.error, event.message, event.status));
    if (!/(error|failed|fallo|quota|permission|denied|ai)/.test(`${type} ${errorText}`)) continue;
    if (!preventiveRecent(event, 7, nowMs)) continue;
    const id = preventiveId(event, 'eventId', 'id');
    preventivePushRisk(risks, seen, {
      type: type.includes('ai') || errorText.includes('ai') ? 'ai_recent_error' : 'automation_recent_error',
      severity: /(permission|denied|quota|failed)/.test(errorText) ? 'high' : 'medium',
      entityType: 'automationEvents',
      entityId: id,
      title: 'Error reciente en automatizacion',
      description: clean(firstPresent(event.error, event.message, event.type, 'Evento automatico con error reciente.'), 900),
      metric: 'error_automatizacion_reciente',
      impactedRoles: ['admin'],
      suggestedActions: ['Revisar si el error se esta repitiendo y convertirlo en incidencia si afecta a usuarios.'],
    });
  }

  risks.sort((a, b) => (a.priorityRank - b.priorityRank) || String(a.type).localeCompare(String(b.type)));
  const byType = countBy(risks, 'type');
  const bySeverity = countBy(risks, 'severity');
  return {
    version: PREVENTIVE_INCIDENT_VERSION,
    generatedAt: nowIso,
    thresholds,
    total: risks.length,
    risks,
    summary: {
      total: risks.length,
      critical: bySeverity.critical || 0,
      high: bySeverity.high || 0,
      medium: bySeverity.medium || 0,
      low: bySeverity.low || 0,
      byType,
      bySeverity,
      actionable: risks.filter((risk) => risk.shouldCreateTask).length,
      incidentsToCreate: risks.filter((risk) => risk.shouldCreateIncident).length,
      adminNotifications: risks.filter((risk) => risk.shouldNotifyAdmin).length,
    },
  };
}

export function buildIncidentStats(items = [], options = {}) {
  const nowIso = options.nowIso || new Date().toISOString();
  const incidents = items.map((item) => normalizeIncident(item, { ...options, nowIso }));
  const open = incidents.filter((item) => !['resuelta', 'cerrada'].includes(item.estado));
  const resolved = incidents.filter((item) => ['resuelta', 'cerrada'].includes(item.estado));
  const overdue = open.filter((item) => item.isOverdue);
  const critical = open.filter((item) => item.priorityRank <= 2);
  const avgResolutionMinutes = resolved.length
    ? Math.round(resolved.reduce((sum, item) => sum + Number(item.resolutionTimeMinutes || 0), 0) / resolved.length)
    : 0;
  return {
    total: incidents.length,
    open: open.length,
    resolved: resolved.length,
    overdue: overdue.length,
    critical: critical.length,
    avgResolutionMinutes,
    byStatus: countBy(incidents, 'estado'),
    byCategory: countBy(incidents, 'categoria'),
    byPriority: countBy(incidents, 'prioridad'),
    patterns: incidentPatterns(incidents),
  };
}

function countBy(items, field) {
  return items.reduce((acc, item) => {
    const key = clean(item[field] || 'sin_clasificar', 80);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

export function incidentPatterns(items = []) {
  const normalized = items.map((item) => normalizeIncident(item));
  const groups = new Map();
  normalized.forEach((item) => {
    const key = `${item.categoria}:${item.source}`;
    const group = groups.get(key) || {
      key,
      category: item.categoria,
      source: item.source,
      count: 0,
      open: 0,
      overdue: 0,
      critical: 0,
      latestAt: '',
    };
    group.count += 1;
    if (!['resuelta', 'cerrada'].includes(item.estado)) group.open += 1;
    if (item.isOverdue) group.overdue += 1;
    if (item.priorityRank <= 2) group.critical += 1;
    if (!group.latestAt || dateToIso(item.createdAt) > group.latestAt) group.latestAt = dateToIso(item.createdAt);
    groups.set(key, group);
  });
  return [...groups.values()]
    .sort((a, b) => (b.critical - a.critical) || (b.overdue - a.overdue) || (b.count - a.count))
    .slice(0, 12);
}
