/**
 * ClasesDe10 - Firebase data compatibility client.
 *
 * Runtime dashboards still use an older query shape. This module keeps that
 * API surface but routes reads/writes to Firebase.
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit as firestoreLimit,
  orderBy as firestoreOrderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-storage.js';
import { firebaseDb, firebaseStorage } from './firebase-client.js?v=20260627-domain-auth';
import { recordDataAudit } from './audit-client.js?v=20260628-audit';
import { trackDataMutation } from './analytics-client.js?v=20260628-analytics';
import { lifecycleStatusForClassStatus } from './calendar-engine.js';
import {
  COLLECTION_ALIASES as CANONICAL_COLLECTION_ALIASES,
  FIELD_ALIAS_GROUPS as CANONICAL_FIELD_ALIAS_GROUPS,
  normalizeEntityForWrite,
} from './data-schema.js';
import { buildIncidentCreatePayload, normalizeIncident } from './incident-engine.js?v=20260628-incidents';
import { getConfigValue } from './platform-config.js?v=20260628-config';
import {
  buildFamilyPaymentPayload,
  buildTeacherPayoutPayload,
  isTeacherPayout,
  paymentAmount,
  paymentDueAtFromDate,
  paymentFingerprint,
  storedPaymentStatus,
} from './payment-engine.js';

const COLLECTION_ALIASES = {
  ...CANONICAL_COLLECTION_ALIASES,
  usuarios: 'users',
  v_clases_completas: 'clases',
  v_dashboard_admin: 'dashboardStats',
  v_resumen_profesor_mes: 'resumenProfesorMes',
};

const FIELD_ALIASES = {
  usuario_id: CANONICAL_FIELD_ALIAS_GROUPS.userUid,
  familia_id: CANONICAL_FIELD_ALIAS_GROUPS.familyUid,
  profesor_id: CANONICAL_FIELD_ALIAS_GROUPS.teacherUid,
  alumno_id: CANONICAL_FIELD_ALIAS_GROUPS.studentId,
  profesor_asignado_id: CANONICAL_FIELD_ALIAS_GROUPS.assignedTeacherUid,
  estado_verificacion: CANONICAL_FIELD_ALIAS_GROUPS.verificationStatus,
  estado: CANONICAL_FIELD_ALIAS_GROUPS.status,
  activa: CANONICAL_FIELD_ALIAS_GROUPS.active,
  activo: CANONICAL_FIELD_ALIAS_GROUPS.active,
  created_at: CANONICAL_FIELD_ALIAS_GROUPS.createdAt,
  updated_at: CANONICAL_FIELD_ALIAS_GROUPS.updatedAt,
  fecha: CANONICAL_FIELD_ALIAS_GROUPS.date,
  hora_inicio: CANONICAL_FIELD_ALIAS_GROUPS.startTime,
  hora_fin: CANONICAL_FIELD_ALIAS_GROUPS.endTime,
};

const SERVER_FIELD_ALIASES = {
  usuario_id: 'userUid',
  familia_id: 'familyUid',
  profesor_id: 'teacherUid',
  alumno_id: 'studentId',
  profesor_asignado_id: 'assignedTeacherUid',
  estado_verificacion: 'verificationStatus',
  estado: 'status',
  activa: 'active',
  activo: 'active',
  created_at: 'createdAt',
  fecha: 'date',
};
const COLLECTION_MAP_CACHE_MS = 30 * 1000;
const collectionMapCache = new Map();

function collectionName(name) {
  return COLLECTION_ALIASES[name] || name;
}

function normalizeDate(value) {
  if (!value) return value;
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value.seconds) return new Date(value.seconds * 1000).toISOString();
  return value;
}

function toLegacyDoc(snap) {
  const data = snap.data() || {};
  const createdAt = normalizeDate(data.createdAt || data.created_at);
  const updatedAt = normalizeDate(data.updatedAt || data.updated_at);

  return {
    id: snap.id,
    ...data,
    created_at: data.created_at || createdAt || null,
    updated_at: data.updated_at || updatedAt || null,
  };
}

function serverFilterField(field) {
  if (field === 'id') return documentId();
  return SERVER_FIELD_ALIASES[field] || field;
}

function serverOrderField(field) {
  if (field === 'id') return documentId();
  return SERVER_FIELD_ALIASES[field] || field;
}

function serverFilterOperator(operator) {
  if (operator === 'eq') return '==';
  if (operator === 'in') return 'in';
  if (operator === 'gte') return '>=';
  if (operator === 'lte') return '<=';
  if (operator === 'lt') return '<';
  return null;
}

function buildServerQuery(name, filters = [], sorts = [], max = null) {
  const constraints = [];
  for (const filter of filters) {
    const op = serverFilterOperator(filter.operator);
    if (!op || filter.value === undefined) continue;
    constraints.push(where(serverFilterField(filter.field), op, filter.value));
  }
  for (const sort of sorts) {
    if (!sort?.field) continue;
    constraints.push(firestoreOrderBy(serverOrderField(sort.field), sort.ascending === false ? 'desc' : 'asc'));
  }
  if (Number.isFinite(Number(max)) && Number(max) > 0) {
    constraints.push(firestoreLimit(Number(max)));
  }
  const ref = collection(firebaseDb, collectionName(name));
  return constraints.length ? query(ref, ...constraints) : ref;
}

async function listCollection(name, filters = [], sorts = [], max = null) {
  let snap;
  try {
    snap = await getDocs(buildServerQuery(name, filters, sorts, max));
  } catch (error) {
    if (!sorts.length && !max) throw error;
    snap = await getDocs(buildServerQuery(name, filters));
  }
  return snap.docs.map(toLegacyDoc);
}

async function safeListCollection(name) {
  try {
    return await listCollection(name);
  } catch (_) {
    return [];
  }
}

async function getCollectionMap(name) {
  const rows = await listCollection(name);
  return new Map(rows.map((row) => [row.id, row]));
}

async function safeCollectionMap(name) {
  const cached = collectionMapCache.get(name);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const value = await getCollectionMap(name);
    collectionMapCache.set(name, { value, expiresAt: Date.now() + COLLECTION_MAP_CACHE_MS });
    return value;
  } catch (_) {
    return new Map();
  }
}

function firstValue(row, field) {
  const aliases = FIELD_ALIASES[field] || [field];
  for (const alias of aliases) {
    if (row?.[alias] !== undefined) return row[alias];
  }
  return undefined;
}

function matchesFilter(row, filter) {
  const value = firstValue(row, filter.field);
  if (filter.operator === 'eq') return value === filter.value;
  if (filter.operator === 'gte') return String(value || '') >= String(filter.value || '');
  if (filter.operator === 'lte') return String(value || '') <= String(filter.value || '');
  if (filter.operator === 'lt') return String(value || '') < String(filter.value || '');
  if (filter.operator === 'in') return Array.isArray(filter.value) && filter.value.includes(value);
  return true;
}

function compareValues(a, b, direction) {
  const aa = normalizeDate(a) || '';
  const bb = normalizeDate(b) || '';
  if (aa === bb) return 0;
  const result = aa > bb ? 1 : -1;
  return direction === false ? -result : result;
}

function normalizeUser(user) {
  if (!user) return null;
  return {
    ...user,
    nombre: user.nombre || '',
    apellidos: user.apellidos || '',
    email: user.email || '',
    telefono: user.telefono || '',
  };
}

async function hydrateRows(table, rows) {
  if (!rows.length) return rows;

  const users = await safeCollectionMap('users');
  const familias = table !== 'familias' ? await safeCollectionMap('familias') : new Map();
  const profesores = table !== 'profesores' ? await safeCollectionMap('profesores') : new Map();
  const alumnos = table !== 'alumnos' ? await safeCollectionMap('alumnos') : new Map();
  const documentos = table !== 'documentos' ? await safeCollectionMap('documentos') : new Map();

  return rows.map((row) => {
    const userUid = row.userUid || row.usuario_id || row.uid || row.id;
    const familiaId = row.familyUid || row.familia_id;
    const profesorId = row.teacherUid || row.profesor_id || row.profesor_asignado_id || row.assignedTeacherUid;
    const alumnoId = row.studentId || row.studentUid || row.alumno_id;
    const familia = familias.get(familiaId);
    const profesor = profesores.get(profesorId);
    const alumno = alumnos.get(alumnoId);
    const documento = documentos.get(row.documento_id || row.documentId);
    const usuario = normalizeUser(users.get(userUid));
    const familiaUser = normalizeUser(users.get(familia?.userUid || familia?.usuario_id || familia?.id));
    const profesorUser = normalizeUser(users.get(profesor?.userUid || profesor?.usuario_id || profesor?.id));

    return {
      ...row,
      usuarios: row.usuarios || usuario,
      familias: row.familias || (familia ? { ...familia, usuarios: familiaUser } : null),
      profesores: row.profesores || (profesor ? { ...profesor, usuarios: profesorUser } : null),
      alumnos: row.alumnos || alumno || null,
      documentos: row.documentos || documento || null,
      alumno_nombre: row.alumno_nombre || [alumno?.nombre, alumno?.apellidos].filter(Boolean).join(' '),
      profesor_nombre: row.profesor_nombre || [profesorUser?.nombre, profesorUser?.apellidos].filter(Boolean).join(' '),
      familia_nombre: row.familia_nombre || [familiaUser?.nombre, familiaUser?.apellidos].filter(Boolean).join(' '),
      fecha: row.fecha || row.date || null,
      hora_inicio: row.hora_inicio || row.startTime || null,
      hora_fin: row.hora_fin || row.endTime || null,
      materia: row.materia || row.subject || '',
      estado: row.estado || row.status || '',
      estado_verificacion: row.estado_verificacion || row.verificationStatus || '',
      activo: row.activo ?? row.active ?? true,
    };
  });
}

async function dashboardStats() {
  const [profesores, familias, alumnos, clases, solicitudes, pagos, incidencias] = await Promise.all([
    safeListCollection('profesores'),
    safeListCollection('familias'),
    safeListCollection('alumnos'),
    safeListCollection('clases'),
    safeListCollection('solicitudes'),
    safeListCollection('pagos'),
    safeListCollection('incidencias'),
  ]);

  return {
    profesores_activos: profesores.filter((p) => p.active !== false && p.activo !== false).length,
    familias_activas: familias.filter((f) => f.active !== false && f.activo !== false).length,
    alumnos_activos: alumnos.filter((a) => a.active !== false && a.activo !== false).length,
    clases_mes: clases.length,
    ingresos_mes: pagos.reduce((sum, p) => sum + Number(p.monto || p.amount || 0), 0),
    comisiones_mes: clases.reduce((sum, c) => sum + Number(c.comision_clasesde10 || c.platformFee || 0), 0),
    solicitudes_nuevas: solicitudes.filter((s) => ['nueva', 'nuevo'].includes(s.estado || s.status)).length,
    pagos_pendientes: pagos.filter((p) => ['pendiente', 'solicitado', 'procesando', 'vencido'].includes(storedPaymentStatus(p.estado || p.status))).length,
    incidencias_abiertas: incidencias.filter((i) => (i.estado || i.status) === 'abierta').length,
  };
}

function withWriteTimestamps(payload, isCreate = false) {
  const base = { ...(payload || {}) };
  if (isCreate) {
    base.createdAt = base.createdAt || serverTimestamp();
    base.created_at = base.created_at || new Date().toISOString();
  }
  base.updatedAt = serverTimestamp();
  base.updated_at = new Date().toISOString();
  return base;
}

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeWritePayload(table, payload, isCreate = false) {
  const data = { ...(payload || {}) };

  if (data.familia_id && !data.familyUid) data.familyUid = data.familia_id;
  if (data.alumno_id && !data.studentId) data.studentId = data.alumno_id;
  if (data.profesor_id && !data.teacherUid) data.teacherUid = data.profesor_id;
  if (data.profesor_asignado_id && !data.assignedTeacherUid) data.assignedTeacherUid = data.profesor_asignado_id;
  if (data.usuario_id && !data.userUid) data.userUid = data.usuario_id;
  if (data.estado && !data.status) data.status = data.estado;
  if (data.activo !== undefined && data.active === undefined) data.active = data.activo;

  if (table === 'alumnos') {
    data.activo = data.activo ?? data.active ?? true;
    data.active = data.active ?? data.activo ?? true;
  }

  if (table === 'solicitudes') {
    data.estado = data.estado || data.status || 'nueva';
    data.status = data.status || data.estado;
  }

  if (table === 'pagos') {
    const platformConfig = globalThis.CD10PlatformConfig || {};
    const defaultPaymentDueDays = Number(getConfigValue(platformConfig, 'payments.defaultPaymentDueDays', 7));
    if (isCreate) {
      const normalized = isTeacherPayout(data)
        ? buildTeacherPayoutPayload(data.teacherUid || data.profesor_id || data.userUid, data)
        : buildFamilyPaymentPayload(data, { defaultPaymentDueDays });
      Object.assign(data, normalized);
    }
    data.estado = storedPaymentStatus(data.estado || data.status || 'pendiente');
    data.status = data.status || data.estado;
    if (data.monto !== undefined || data.amount !== undefined) {
      data.monto = paymentAmount(data);
      data.amount = data.amount ?? data.monto;
    }
    data.gateway = data.gateway || data.provider || 'manual';
    data.provider = data.provider || data.gateway;
    data.metodo = data.metodo || data.method || 'bizum';
    data.method = data.method || data.metodo;
    if (isCreate) {
      data.dueAt = data.dueAt || data.due_at || paymentDueAtFromDate(new Date(), Number.isFinite(defaultPaymentDueDays) ? defaultPaymentDueDays : 7);
      data.due_at = data.due_at || data.dueAt;
    }
    data.idempotencyKey = data.idempotencyKey || paymentFingerprint(data);
  }

  if (table === 'incidencias') {
    const platformConfig = globalThis.CD10PlatformConfig || {};
    const normalized = isCreate
      ? buildIncidentCreatePayload(data, globalThis.CD10CurrentUser || {}, { config: platformConfig })
      : normalizeIncident(data, { config: platformConfig });
    Object.assign(data, normalized);
    if (isCreate) delete data.createdAt;
    delete data.updatedAt;
  }

  if (table === 'clases') {
    data.estado = data.estado || data.status || 'confirmada';
    data.status = data.status || data.estado;
    if (data.fecha && !data.date) data.date = data.fecha;
    if (data.date && !data.fecha) data.fecha = data.date;
    if (data.hora_inicio && !data.startTime) data.startTime = data.hora_inicio;
    if (data.startTime && !data.hora_inicio) data.hora_inicio = data.startTime;
    if (data.hora_fin && !data.endTime) data.endTime = data.hora_fin;
    if (data.endTime && !data.hora_fin) data.hora_fin = data.endTime;
    if (data.duracion_minutos && !data.durationMinutes) data.durationMinutes = data.duracion_minutos;
    if (data.durationMinutes && !data.duracion_minutos) data.duracion_minutos = data.durationMinutes;
    if (data.precio_total !== undefined && data.amount === undefined) data.amount = data.precio_total;
    if (data.amount !== undefined && data.precio_total === undefined) data.precio_total = data.amount;
    if (data.familyAmount === undefined && data.precio_total !== undefined) data.familyAmount = data.precio_total;
    if (data.importe_profesor !== undefined && data.teacherAmount === undefined) data.teacherAmount = data.importe_profesor;
    if (data.teacherAmount !== undefined && data.importe_profesor === undefined) data.importe_profesor = data.teacherAmount;
    data.lifecycleStatus = data.lifecycleStatus || lifecycleStatusForClassStatus(data.estado);
    data.attendanceStatus = data.attendanceStatus || 'pendiente';
  }

  if (table === 'alumno_invitaciones' && isCreate) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    data.token = data.token || randomToken();
    data.expira_at = data.expira_at || expiresAt;
    data.expiraAt = data.expiraAt || data.expira_at;
    data.estado = data.estado || 'pendiente';
    data.status = data.status || data.estado;
    data.studentId = data.studentId || data.alumno_id;
    data.createdByUid = data.createdByUid || data.creado_por;
    data.familyUid = data.familyUid || data.creado_por;
  }

  return normalizeEntityForWrite(table, data, { isCreate });
}

function auditModuleForTable(table) {
  if (['users', 'usuarios', 'profesores', 'familias', 'alumnos', 'disponibilidad'].includes(table)) return 'profiles';
  if (['clases', 'v_clases_completas'].includes(table)) return 'classes';
  if (['pagos', 'resumenMensual'].includes(table)) return 'payments';
  if (['solicitudes', 'solicitudMatches', 'matchingRuns', 'asignaciones'].includes(table)) return 'matching';
  if (['documentos'].includes(table)) return 'documents';
  if (['incidencias'].includes(table)) return 'incidents';
  if (['notificaciones', 'notificationPreferences', 'notificationTokens'].includes(table)) return 'notifications';
  if (['chats', 'mensajes'].includes(table)) return 'messaging';
  if (['configuracion', 'configuracionPublica', 'platformConfigHistory'].includes(table)) return 'configuration';
  if ([
    'automationEvents',
    'automationRules',
    'automationRuleRuns',
    'systemJobs',
    'deadLetters',
    'metricSnapshots',
    'opsAlerts',
    'platformHealthChecks',
  ].includes(table)) return 'automation';
  return 'data';
}

function auditActionForWrite(table, mode) {
  const target = collectionName(table);
  if (mode === 'insert') return `${target}.created`;
  if (mode === 'update') return `${target}.updated`;
  if (mode === 'delete') return `${target}.deleted`;
  return `${target}.changed`;
}

function auditDescription(table, mode, count = 1) {
  const label = collectionName(table);
  if (mode === 'insert') return `${count} registro(s) creado(s) en ${label}.`;
  if (mode === 'update') return `${count} registro(s) actualizado(s) en ${label}.`;
  if (mode === 'delete') return `${count} registro(s) eliminado(s) de ${label}.`;
  return `${count} registro(s) modificados en ${label}.`;
}

async function auditDataWrite(table, mode, records = [], extra = {}) {
  if (collectionName(table) === 'auditLogs') return;
  const items = Array.isArray(records) ? records : [records];
  await Promise.all(items.filter(Boolean).map((item) => recordDataAudit(auditActionForWrite(table, mode), {
    module: auditModuleForTable(table),
    entityType: collectionName(table),
    entityId: item.id || item.after?.id || item.before?.id || 'unknown',
    description: auditDescription(table, mode, 1),
    severity: mode === 'delete' ? 'warning' : 'info',
    before: item.before || null,
    after: item.after || null,
    metadata: {
      table,
      targetCollection: collectionName(table),
      writeMode: mode,
      filters: extra.filters || [],
      count: items.length,
      source: 'compat_db_from',
    },
  }).catch((error) => {
    console.warn('Data audit failed', table, mode, error);
  })));
}

class FirebaseCompatQuery {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.sorts = [];
    this.max = null;
    this.rangeBounds = null;
    this.singleRow = false;
    this.countMode = false;
    this.headMode = false;
    this.writeMode = null;
    this.writePayload = null;
  }

  select(_columns = '*', options = {}) {
    this.countMode = options?.count === 'exact';
    this.headMode = options?.head === true;
    return this;
  }

  eq(field, value) {
    this.filters.push({ field, operator: 'eq', value });
    return this;
  }

  gte(field, value) {
    this.filters.push({ field, operator: 'gte', value });
    return this;
  }

  lte(field, value) {
    this.filters.push({ field, operator: 'lte', value });
    return this;
  }

  lt(field, value) {
    this.filters.push({ field, operator: 'lt', value });
    return this;
  }

  in(field, value) {
    this.filters.push({ field, operator: 'in', value });
    return this;
  }

  or() {
    return this;
  }

  order(field, options = {}) {
    this.sorts.push({ field, ascending: options.ascending !== false });
    return this;
  }

  limit(value) {
    this.max = value;
    return this;
  }

  range(from, to) {
    this.rangeBounds = { from, to };
    return this;
  }

  single() {
    this.singleRow = true;
    return this;
  }

  insert(payload) {
    this.writeMode = 'insert';
    this.writePayload = payload;
    return this;
  }

  update(payload) {
    this.writeMode = 'update';
    this.writePayload = payload;
    return this;
  }

  delete() {
    this.writeMode = 'delete';
    return this;
  }

  async executeRead() {
    if (this.table === 'v_dashboard_admin') {
      const data = await dashboardStats();
      return { data: this.singleRow ? data : [data], count: 1, error: null };
    }

    const serverMax = this.singleRow ? 1 : this.max;
    let rows = await listCollection(this.table, this.filters, this.sorts, serverMax);
    rows = await hydrateRows(this.table, rows);
    rows = rows.filter((row) => this.filters.every((filter) => matchesFilter(row, filter)));

    for (const sort of this.sorts.reverse()) {
      rows.sort((a, b) => compareValues(firstValue(a, sort.field), firstValue(b, sort.field), sort.ascending));
    }

    const total = rows.length;
    if (this.rangeBounds) rows = rows.slice(this.rangeBounds.from, this.rangeBounds.to + 1);
    if (this.max) rows = rows.slice(0, this.max);

    if (this.headMode) return { data: null, count: total, error: null };
    if (this.singleRow) return { data: rows[0] || null, count: total, error: null };
    return { data: rows, count: this.countMode ? total : null, error: null };
  }

  async executeWrite() {
    const target = collectionName(this.table);

    if (this.writeMode === 'insert') {
      const payloads = Array.isArray(this.writePayload) ? this.writePayload : [this.writePayload];
      const written = [];
      for (const payload of payloads) {
        const data = withWriteTimestamps(normalizeWritePayload(this.table, payload, true), true);
        if (this.table === 'alumno_invitaciones' && data.token) {
          await setDoc(doc(firebaseDb, target, data.token), data, { merge: false });
          written.push({ id: data.token, ...data });
        } else if (payload?.id) {
          await setDoc(doc(firebaseDb, target, payload.id), data, { merge: true });
          written.push({ id: payload.id, ...data });
        } else {
          const refDoc = await addDoc(collection(firebaseDb, target), data);
          written.push({ id: refDoc.id, ...data });
        }
      }
      await auditDataWrite(this.table, 'insert', written.map((row) => ({ id: row.id, after: row })), {
        filters: this.filters,
      });
      trackDataMutation(this.table, 'insert', written.map((row) => ({ id: row.id, after: row })), {
        filters: this.filters.length,
        source: 'compat_insert',
      });
      return { data: Array.isArray(this.writePayload) ? written : written[0], error: null };
    }

    const matches = await this.executeRead();
    const rows = Array.isArray(matches.data) ? matches.data : matches.data ? [matches.data] : [];

    if (this.writeMode === 'update') {
      const data = withWriteTimestamps(normalizeWritePayload(this.table, this.writePayload, false), false);
      await Promise.all(rows.map((row) => updateDoc(doc(firebaseDb, target, row.id), data)));
      const updatedRows = rows.map((row) => ({ ...row, ...data }));
      await auditDataWrite(this.table, 'update', rows.map((row, index) => ({
        id: row.id,
        before: row,
        after: updatedRows[index],
      })), {
        filters: this.filters,
      });
      trackDataMutation(this.table, 'update', rows.map((row, index) => ({
        id: row.id,
        before: row,
        after: updatedRows[index],
      })), {
        filters: this.filters.length,
        source: 'compat_update',
      });
      return { data: updatedRows, error: null };
    }

    if (this.writeMode === 'delete') {
      await Promise.all(rows.map((row) => deleteDoc(doc(firebaseDb, target, row.id))));
      await auditDataWrite(this.table, 'delete', rows.map((row) => ({ id: row.id, before: row })), {
        filters: this.filters,
      });
      trackDataMutation(this.table, 'delete', rows.map((row) => ({ id: row.id, before: row })), {
        filters: this.filters.length,
        source: 'compat_delete',
      });
      return { data: rows, error: null };
    }

    return this.executeRead();
  }

  async execute() {
    try {
      if (this.writeMode) return await this.executeWrite();
      return await this.executeRead();
    } catch (error) {
      return {
        data: this.singleRow || this.headMode ? null : [],
        count: this.countMode || this.headMode ? 0 : null,
        error,
      };
    }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

function from(table) {
  return new FirebaseCompatQuery(table);
}

const storage = {
  from(bucket) {
    return {
      async upload(path, file, options = {}) {
        try {
          const objectPath = [bucket, path].filter(Boolean).join('/');
          const fileRef = ref(firebaseStorage, objectPath);
          const upload = await uploadBytes(fileRef, file, {
            contentType: options.contentType || file?.type || undefined,
          });
          return { data: { path: objectPath, fullPath: upload.ref.fullPath }, error: null };
        } catch (error) {
          return { data: null, error };
        }
      },
      async createSignedUrl(path) {
        try {
          const objectPath = [bucket, path].filter(Boolean).join('/');
          const url = await getDownloadURL(ref(firebaseStorage, objectPath));
          return { data: { signedUrl: url, url }, error: null };
        } catch (error) {
          return { data: null, error };
        }
      },
    };
  },
};

function channel() {
  return {
    on() { return this; },
    subscribe(callback) {
      if (typeof callback === 'function') callback('SUBSCRIBED');
      return this;
    },
    unsubscribe() {},
  };
}

export const db = {
  from,
  storage,
  channel,
  removeChannel(channelRef) {
    if (channelRef?.unsubscribe) channelRef.unsubscribe();
  },
};

export default db;
