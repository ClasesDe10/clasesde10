/**
 * Professional incident/ticket engine for ClasesDe10.
 *
 * The engine keeps legacy `incidencias` documents compatible while adding a
 * normalized ticket model: readable identifiers, SLA, ownership, timeline,
 * conversation, attachments, root cause and resolution metrics.
 */

export const INCIDENT_ENGINE_VERSION = 'incident-engine-2026-06-28';

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
  ['comunicacion', /(mensaje|chat|whatsapp|email|no responde|contacto)/i],
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
