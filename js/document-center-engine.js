/**
 * Professional document center engine for ClasesDe10.
 *
 * Pure helpers for document taxonomy, versioning, verification, expiry,
 * permissions and operational summaries. UI, automations and tests share this
 * model so document handling stays consistent across dashboards.
 */

export const DOCUMENT_CENTER_VERSION = 'document-center-2026-06-28';

export const DOCUMENT_STATUSES = Object.freeze([
  'pendiente',
  'en_revision',
  'validado',
  'rechazado',
  'requiere_actualizacion',
  'caducado',
  'sustituido',
  'archivado',
]);

export const DOCUMENT_VERIFICATION_LEVELS = Object.freeze([
  'sin_verificar',
  'metadata_validada',
  'validado_admin',
  'validado_automatico',
  'rechazado',
]);

export const DOCUMENT_VISIBILITY = Object.freeze(['owner', 'admin', 'internal']);

export const DOCUMENT_TYPE_DEFINITIONS = Object.freeze({
  dni: {
    label: 'DNI / NIE / Pasaporte',
    category: 'identidad',
    roles: ['profesor', 'familia', 'admin'],
    requiredFor: ['profesor'],
    defaultValidityDays: 730,
    sensitive: true,
    trustWeight: 14,
    publicSignal: 'Identidad validada',
    autoVerifiable: false,
  },
  identidad: {
    label: 'Documento de identidad',
    category: 'identidad',
    roles: ['profesor', 'familia', 'admin'],
    requiredFor: ['familia'],
    defaultValidityDays: 730,
    sensitive: true,
    trustWeight: 10,
    publicSignal: 'Identidad documentada',
    autoVerifiable: false,
  },
  titulo: {
    label: 'Titulo academico',
    category: 'academica',
    roles: ['profesor'],
    requiredFor: [],
    defaultValidityDays: null,
    sensitive: true,
    trustWeight: 12,
    publicSignal: 'Formacion validada',
    autoVerifiable: false,
  },
  notas_curso_anterior: {
    label: 'Notas finales del curso anterior',
    category: 'academica',
    roles: ['profesor'],
    requiredFor: ['profesor'],
    defaultValidityDays: null,
    sensitive: true,
    trustWeight: 10,
    publicSignal: 'Notas academicas validadas',
    autoVerifiable: false,
  },
  notas_universidad: {
    label: 'Expediente o notas universitarias',
    category: 'academica',
    roles: ['profesor'],
    requiredFor: ['profesor'],
    defaultValidityDays: null,
    sensitive: true,
    trustWeight: 10,
    publicSignal: 'Expediente academico validado',
    autoVerifiable: false,
  },
  certificado: {
    label: 'Certificado / licencia profesional',
    category: 'academica',
    roles: ['profesor'],
    requiredFor: [],
    defaultValidityDays: 1095,
    sensitive: true,
    trustWeight: 8,
    publicSignal: 'Certificacion validada',
    autoVerifiable: false,
  },
  antecedentes: {
    label: 'Certificado de antecedentes',
    category: 'seguridad',
    roles: ['profesor'],
    requiredFor: [],
    defaultValidityDays: 365,
    sensitive: true,
    trustWeight: 16,
    publicSignal: 'Verificacion reforzada',
    autoVerifiable: false,
  },
  contrato: {
    label: 'Contrato',
    category: 'legal',
    roles: ['profesor', 'familia', 'admin'],
    requiredFor: [],
    defaultValidityDays: null,
    sensitive: true,
    trustWeight: 0,
    publicSignal: '',
    autoVerifiable: false,
  },
  autorizacion: {
    label: 'Autorizacion',
    category: 'legal',
    roles: ['familia', 'admin'],
    requiredFor: [],
    defaultValidityDays: 365,
    sensitive: true,
    trustWeight: 4,
    publicSignal: 'Autorizacion registrada',
    autoVerifiable: false,
  },
  factura: {
    label: 'Factura',
    category: 'finanzas',
    roles: ['profesor', 'familia', 'admin'],
    requiredFor: [],
    defaultValidityDays: null,
    sensitive: true,
    trustWeight: 0,
    publicSignal: '',
    autoVerifiable: true,
  },
  recibo: {
    label: 'Recibo',
    category: 'finanzas',
    roles: ['profesor', 'familia', 'admin'],
    requiredFor: [],
    defaultValidityDays: null,
    sensitive: true,
    trustWeight: 0,
    publicSignal: '',
    autoVerifiable: true,
  },
  justificante: {
    label: 'Justificante',
    category: 'finanzas',
    roles: ['profesor', 'familia', 'admin'],
    requiredFor: [],
    defaultValidityDays: null,
    sensitive: true,
    trustWeight: 0,
    publicSignal: '',
    autoVerifiable: true,
  },
  justificante_pago: {
    label: 'Justificante de pago',
    category: 'finanzas',
    roles: ['familia', 'admin'],
    requiredFor: [],
    defaultValidityDays: null,
    sensitive: true,
    trustWeight: 0,
    publicSignal: '',
    autoVerifiable: true,
  },
  curriculum: {
    label: 'Curriculum',
    category: 'perfil',
    roles: ['profesor'],
    requiredFor: [],
    defaultValidityDays: 730,
    sensitive: true,
    trustWeight: 3,
    publicSignal: '',
    autoVerifiable: false,
  },
  interno: {
    label: 'Documento interno',
    category: 'interno',
    roles: ['admin'],
    requiredFor: [],
    defaultValidityDays: null,
    sensitive: true,
    trustWeight: 0,
    publicSignal: '',
    autoVerifiable: false,
  },
  otro: {
    label: 'Otro documento',
    category: 'otro',
    roles: ['profesor', 'familia', 'admin'],
    requiredFor: [],
    defaultValidityDays: null,
    sensitive: true,
    trustWeight: 0,
    publicSignal: '',
    autoVerifiable: false,
  },
});

const STATUS_ALIASES = Object.freeze({
  pending: 'pendiente',
  revision: 'en_revision',
  review: 'en_revision',
  en_revision: 'en_revision',
  validado: 'validado',
  verified: 'validado',
  verificado: 'validado',
  approved: 'validado',
  rejected: 'rechazado',
  rechazado: 'rechazado',
  expired: 'caducado',
  caducado: 'caducado',
  sustituido: 'sustituido',
  replaced: 'sustituido',
  requiere_actualizacion: 'requiere_actualizacion',
  needs_update: 'requiere_actualizacion',
  archivado: 'archivado',
  archived: 'archivado',
});

const ALLOWED_MIME_TYPES = Object.freeze([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

function clean(value, max = 1000) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function lower(value, max = 1000) {
  return clean(value, max).toLowerCase();
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function dateFrom(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(value = new Date()) {
  const date = dateFrom(value) || new Date();
  return date.toISOString();
}

function addDays(value, days) {
  const date = dateFrom(value) || new Date();
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString();
}

function daysBetween(a, b = new Date()) {
  const start = dateFrom(a);
  const end = dateFrom(b);
  if (!start || !end) return null;
  return Math.ceil((start.getTime() - end.getTime()) / 86400000);
}

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value].filter(Boolean);
}

function typeKey(value) {
  const raw = lower(value || 'otro', 80)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_ -]+/g, '')
    .replace(/[\s-]+/g, '_');
  if (['pasaporte', 'nie', 'nif'].includes(raw)) return 'dni';
  if (['notas', 'boletin', 'boletin_notas', 'notas_finales', 'notas_curso', 'notas_curso_anterior', 'curso_anterior', 'nota_bachillerato', 'bachillerato'].includes(raw)) return 'notas_curso_anterior';
  if (['expediente', 'expediente_academico', 'expediente_universitario', 'notas_universidad', 'nota_universidad', 'universidad', 'notas_formacion_superior', 'formacion_superior'].includes(raw)) return 'notas_universidad';
  if (['certificacion', 'licencia'].includes(raw)) return 'certificado';
  if (['cv'].includes(raw)) return 'curriculum';
  if (['pago'].includes(raw)) return 'justificante_pago';
  return DOCUMENT_TYPE_DEFINITIONS[raw] ? raw : 'otro';
}

function statusKey(value) {
  const raw = lower(value || 'pendiente', 80).replace(/[\s-]+/g, '_');
  return STATUS_ALIASES[raw] || (DOCUMENT_STATUSES.includes(raw) ? raw : 'pendiente');
}

function roleKey(value) {
  const raw = lower(value || '', 80);
  if (['teacher', 'professor', 'profesor'].includes(raw)) return 'profesor';
  if (['family', 'familia', 'padre', 'madre'].includes(raw)) return 'familia';
  if (raw === 'admin') return 'admin';
  return raw || 'usuario';
}

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
}

function latestVersion(doc = {}) {
  const versions = asArray(doc.versions || doc.versiones);
  if (versions.length) return Math.max(...versions.map((item) => toNumber(item.version || item.number || 1, 1)));
  return Math.max(1, toNumber(doc.version || doc.versionNumber || 1, 1));
}

function fileNameFromPath(path = '') {
  return clean(String(path).split('/').pop() || '', 240);
}

function expiryFrom(doc = {}, definition = DOCUMENT_TYPE_DEFINITIONS.otro) {
  const explicit = first(doc.expiresAt, doc.fecha_caducidad, doc.expirationDate, doc.caduca_el);
  if (explicit) return iso(explicit);
  if (!definition.defaultValidityDays) return '';
  const base = first(doc.validatedAt, doc.fecha_validacion, doc.uploadedAt, doc.createdAt, doc.created_at, new Date());
  return addDays(base, definition.defaultValidityDays);
}

export function documentTypeDefinition(type) {
  return DOCUMENT_TYPE_DEFINITIONS[typeKey(type)] || DOCUMENT_TYPE_DEFINITIONS.otro;
}

export function normalizeDocumentStatus(value) {
  return statusKey(value);
}

export function normalizeDocumentRecord(doc = {}, now = new Date()) {
  const documentType = typeKey(first(doc.documentType, doc.tipo, doc.type));
  const definition = documentTypeDefinition(documentType);
  const status = statusKey(first(doc.storedStatus, doc.rawStatus, doc.status, doc.estado, doc.verificationStatus));
  const storedStatus = status;
  const createdAt = first(doc.createdAt, doc.created_at, doc.uploadedAt, doc.fecha_subida) || '';
  const updatedAt = first(doc.updatedAt, doc.updated_at, createdAt) || '';
  const expiresAt = expiryFrom(doc, definition);
  const daysToExpiry = expiresAt ? daysBetween(expiresAt, now) : null;
  const expired = daysToExpiry !== null && daysToExpiry < 0;
  const expiresSoon = daysToExpiry !== null && daysToExpiry >= 0 && daysToExpiry <= 30;
  const ownerUid = clean(first(doc.ownerUid, doc.userUid, doc.usuario_id, doc.teacherUid, doc.familyUid), 180);
  const role = roleKey(first(doc.role, doc.ownerRole, doc.userRole));
  const storagePath = clean(first(doc.storagePath, doc.storage_path, doc.path, doc.url), 600);
  const name = clean(first(doc.name, doc.nombre, doc.fileName, fileNameFromPath(storagePath), definition.label), 240);
  const version = latestVersion(doc);
  const verificationLevel = clean(first(doc.verificationLevel, doc.nivelVerificacion, status === 'validado' ? 'validado_admin' : 'sin_verificar'), 80);
  const autoChecks = buildDocumentAutoChecks({
    ...doc,
    documentType,
    mimeType: first(doc.mimeType, doc.mime_type),
    sizeBytes: first(doc.sizeBytes, doc.tamano_bytes),
    storagePath,
  });
  const lifecycleStatus = expired && ['validado', 'en_revision', 'pendiente'].includes(status) ? 'caducado' : status;

  return {
    ...doc,
    id: clean(doc.id, 180),
    ownerUid,
    userUid: clean(first(doc.userUid, ownerUid), 180),
    usuario_id: clean(first(doc.usuario_id, ownerUid), 180),
    profileId: clean(doc.profileId || doc.perfil_id, 180),
    role,
    ownerRole: role,
    documentType,
    tipo: documentType,
    typeLabel: definition.label,
    category: definition.category,
    name,
    nombre: name,
    status: lifecycleStatus,
    estado: lifecycleStatus,
    storedStatus,
    rawStatus: storedStatus,
    verificationStatus: lifecycleStatus,
    verificationLevel,
    version,
    versions: asArray(doc.versions || doc.versiones),
    history: asArray(doc.history || doc.historial),
    observations: clean(first(doc.observations, doc.observaciones, doc.notas_admin), 1200),
    adminNotes: clean(first(doc.adminNotes, doc.notas_admin), 1200),
    storagePath,
    storage_path: storagePath,
    mimeType: clean(first(doc.mimeType, doc.mime_type), 180),
    sizeBytes: toNumber(first(doc.sizeBytes, doc.tamano_bytes), 0),
    uploadedAt: createdAt ? iso(createdAt) : '',
    createdAt: createdAt ? iso(createdAt) : '',
    created_at: createdAt ? iso(createdAt) : '',
    updatedAt: updatedAt ? iso(updatedAt) : '',
    expiresAt,
    daysToExpiry,
    expired,
    expiresSoon,
    requiresManualVerification: !definition.autoVerifiable,
    sensitive: definition.sensitive,
    publicSignal: definition.publicSignal,
    trustWeight: definition.trustWeight,
    permissions: normalizeDocumentPermissions(doc, definition, ownerUid, role),
    autoChecks,
    automationFlags: {
      expired,
      expiresSoon,
      metadataValid: autoChecks.valid,
      canAutoValidateMetadata: definition.autoVerifiable && autoChecks.valid,
    },
  };
}

export function normalizeDocumentPermissions(doc = {}, definition = DOCUMENT_TYPE_DEFINITIONS.otro, ownerUid = '', role = '') {
  const visibility = clean(first(doc.visibility, doc.visibilidad, definition.category === 'interno' ? 'internal' : 'owner'), 40);
  const normalizedVisibility = DOCUMENT_VISIBILITY.includes(visibility) ? visibility : 'owner';
  const allowedRoles = asArray(doc.allowedRoles || doc.rolesPermitidos || definition.roles).map(roleKey);
  const allowedUids = asArray(doc.allowedUids || doc.usuariosPermitidos).map((item) => clean(item, 180));
  return {
    visibility: normalizedVisibility,
    ownerUid,
    ownerRole: role,
    allowedRoles,
    allowedUids,
    adminCanRead: true,
    ownerCanRead: normalizedVisibility !== 'internal',
    ownerCanReplace: normalizedVisibility !== 'internal',
    publicVisible: false,
  };
}

export function buildDocumentAutoChecks(doc = {}) {
  const mimeType = clean(first(doc.mimeType, doc.mime_type), 180);
  const sizeBytes = toNumber(first(doc.sizeBytes, doc.tamano_bytes), 0);
  const storagePath = clean(first(doc.storagePath, doc.storage_path, doc.path, doc.url), 600);
  const extension = lower(storagePath.split('.').pop() || '', 20);
  const extensionAllowed = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'xlsx', 'txt'].includes(extension);
  const mimeAllowed = !mimeType || ALLOWED_MIME_TYPES.includes(mimeType);
  const sizeAllowed = !sizeBytes || sizeBytes <= 10 * 1024 * 1024;
  const hasPath = storagePath.length > 3;
  return {
    hasPath,
    mimeAllowed,
    extensionAllowed,
    sizeAllowed,
    valid: hasPath && mimeAllowed && extensionAllowed && sizeAllowed,
    checkedAt: iso(),
    checksVersion: DOCUMENT_CENTER_VERSION,
  };
}

export function buildDocumentUploadRecord({
  ownerUid,
  role,
  type,
  file = {},
  storagePath,
  profileId = '',
  uploadedByUid = ownerUid,
  source = 'dashboard',
  extra = {},
} = {}) {
  const documentType = typeKey(type);
  const definition = documentTypeDefinition(documentType);
  const now = iso();
  const name = clean(first(file.name, extra.name, extra.nombre, definition.label), 240);
  const version = toNumber(extra.version, 1);
  const base = {
    ...extra,
    ownerUid: clean(ownerUid, 180),
    usuario_id: clean(ownerUid, 180),
    userUid: clean(ownerUid, 180),
    profileId: clean(profileId, 180),
    role: roleKey(role),
    ownerRole: roleKey(role),
    documentType,
    tipo: documentType,
    category: definition.category,
    name,
    nombre: name,
    status: 'pendiente',
    estado: 'pendiente',
    verificationStatus: 'pendiente',
    verificationLevel: 'metadata_validada',
    version,
    versions: [{
      version,
      storagePath: clean(storagePath, 600),
      uploadedAt: now,
      uploadedByUid: clean(uploadedByUid, 180),
      fileName: name,
      sizeBytes: toNumber(first(file.size, extra.sizeBytes, extra.tamano_bytes), 0),
      mimeType: clean(first(file.type, extra.mimeType, extra.mime_type), 180),
    }],
    history: [historyEntry('subido', uploadedByUid, 'Documento subido y pendiente de revision.', { source })],
    storagePath: clean(storagePath, 600),
    storage_path: clean(storagePath, 600),
    url: clean(storagePath, 600),
    sizeBytes: toNumber(first(file.size, extra.sizeBytes, extra.tamano_bytes), 0),
    tamano_bytes: toNumber(first(file.size, extra.sizeBytes, extra.tamano_bytes), 0),
    mimeType: clean(first(file.type, extra.mimeType, extra.mime_type), 180),
    mime_type: clean(first(file.type, extra.mimeType, extra.mime_type), 180),
    uploadedAt: now,
    createdAt: now,
    created_at: now,
    updatedAt: now,
    expiresAt: extra.expiresAt || '',
    permissions: normalizeDocumentPermissions(extra, definition, ownerUid, roleKey(role)),
    autoChecks: buildDocumentAutoChecks({ ...extra, storagePath, mimeType: file.type, sizeBytes: file.size }),
    documentCenterVersion: DOCUMENT_CENTER_VERSION,
  };
  return normalizeDocumentRecord(base);
}

export function historyEntry(action, actorUid = '', note = '', metadata = {}) {
  return {
    at: iso(),
    action: clean(action, 80),
    actorUid: clean(actorUid, 180) || 'system',
    note: clean(note, 1200),
    metadata,
  };
}

export function buildDocumentVerificationPatch(document = {}, {
  status = 'validado',
  actorUid = '',
  actorEmail = '',
  notes = '',
  expiresAt = '',
} = {}) {
  const normalized = normalizeDocumentRecord(document);
  const targetStatus = statusKey(status);
  const now = iso();
  const history = [
    ...normalized.history,
    historyEntry(`verificacion_${targetStatus}`, actorUid, notes || `Documento marcado como ${targetStatus}.`, { actorEmail }),
  ];
  const verificationLevel = targetStatus === 'validado'
    ? 'validado_admin'
    : targetStatus === 'rechazado'
      ? 'rechazado'
      : normalized.verificationLevel;
  return {
    status: targetStatus,
    estado: targetStatus,
    storedStatus: targetStatus,
    rawStatus: targetStatus,
    verificationStatus: targetStatus,
    verificationLevel,
    verifiedAt: targetStatus === 'validado' ? now : normalized.verifiedAt || '',
    verifiedByUid: targetStatus === 'validado' ? clean(actorUid, 180) : normalized.verifiedByUid || '',
    verifiedByEmail: targetStatus === 'validado' ? clean(actorEmail, 180) : normalized.verifiedByEmail || '',
    rejectedAt: targetStatus === 'rechazado' ? now : normalized.rejectedAt || '',
    rejectedByUid: targetStatus === 'rechazado' ? clean(actorUid, 180) : normalized.rejectedByUid || '',
    adminNotes: clean(notes, 1200),
    notas_admin: clean(notes, 1200),
    observations: clean(notes, 1200),
    expiresAt: expiresAt ? iso(expiresAt) : normalized.expiresAt,
    history,
    updatedAt: now,
    updated_at: now,
    documentCenterVersion: DOCUMENT_CENTER_VERSION,
  };
}

export function buildDocumentReplacementPatch(document = {}, {
  file = {},
  storagePath = '',
  actorUid = '',
  notes = '',
} = {}) {
  const normalized = normalizeDocumentRecord(document);
  const version = normalized.version + 1;
  const now = iso();
  const versionEntry = {
    version,
    storagePath: clean(storagePath, 600),
    uploadedAt: now,
    uploadedByUid: clean(actorUid, 180),
    fileName: clean(file.name || fileNameFromPath(storagePath) || normalized.name, 240),
    sizeBytes: toNumber(file.size, 0),
    mimeType: clean(file.type, 180),
  };
  return {
    version,
    versions: [...normalized.versions, versionEntry],
    storagePath: versionEntry.storagePath,
    storage_path: versionEntry.storagePath,
    url: versionEntry.storagePath,
    name: versionEntry.fileName,
    nombre: versionEntry.fileName,
    sizeBytes: versionEntry.sizeBytes,
    tamano_bytes: versionEntry.sizeBytes,
    mimeType: versionEntry.mimeType,
    mime_type: versionEntry.mimeType,
    status: 'pendiente',
    estado: 'pendiente',
    storedStatus: 'pendiente',
    rawStatus: 'pendiente',
    verificationStatus: 'pendiente',
    verificationLevel: 'metadata_validada',
    autoChecks: buildDocumentAutoChecks(versionEntry),
    history: [...normalized.history, historyEntry('nueva_version', actorUid, notes || `Nueva version ${version} subida.`, { version })],
    updatedAt: now,
    updated_at: now,
    documentCenterVersion: DOCUMENT_CENTER_VERSION,
  };
}

export function buildDocumentExpiryPatch(document = {}, actorUid = 'automation') {
  const normalized = normalizeDocumentRecord(document);
  if (!normalized.expired || normalized.storedStatus === 'caducado') return null;
  return {
    status: 'caducado',
    estado: 'caducado',
    storedStatus: 'caducado',
    rawStatus: 'caducado',
    verificationStatus: 'caducado',
    history: [...normalized.history, historyEntry('caducado', actorUid, 'Documento marcado automaticamente como caducado.')],
    updatedAt: iso(),
    updated_at: iso(),
    documentCenterVersion: DOCUMENT_CENTER_VERSION,
  };
}

export function requiredDocumentTypesForRole(role) {
  const normalizedRole = roleKey(role);
  return Object.entries(DOCUMENT_TYPE_DEFINITIONS)
    .filter(([, definition]) => definition.requiredFor.includes(normalizedRole))
    .map(([key]) => key);
}

export function buildDocumentCompliance(owner = {}, documents = [], now = new Date()) {
  const role = roleKey(first(owner.role, owner.ownerRole, owner.rol));
  const normalizedDocs = documents.map((doc) => normalizeDocumentRecord(doc, now));
  const required = requiredDocumentTypesForRole(role);
  const validDocs = normalizedDocs.filter((doc) => doc.status === 'validado' && !doc.expired);
  const uploadedTypes = new Set(normalizedDocs.map((doc) => doc.documentType));
  const validTypes = new Set(validDocs.map((doc) => doc.documentType));
  const missingRequired = required.filter((type) => !uploadedTypes.has(type));
  const pendingRequired = required.filter((type) => uploadedTypes.has(type) && !validTypes.has(type));
  const expiringSoon = normalizedDocs.filter((doc) => doc.expiresSoon && !doc.expired);
  const expired = normalizedDocs.filter((doc) => doc.expired || doc.status === 'caducado');
  const rejected = normalizedDocs.filter((doc) => doc.status === 'rechazado');
  const trustWeight = validDocs.reduce((sum, doc) => sum + toNumber(doc.trustWeight), 0);
  const completeness = required.length
    ? Math.round(((required.length - missingRequired.length - pendingRequired.length * 0.5) / required.length) * 100)
    : (normalizedDocs.length ? 100 : 0);
  return {
    role,
    documents: normalizedDocs,
    requiredTypes: required,
    missingRequired,
    pendingRequired,
    expiringSoon,
    expired,
    rejected,
    verifiedCount: validDocs.length,
    pendingCount: normalizedDocs.filter((doc) => ['pendiente', 'en_revision', 'requiere_actualizacion'].includes(doc.status)).length,
    total: normalizedDocs.length,
    trustWeight,
    completeness: Math.max(0, Math.min(100, completeness)),
    readyForVerification: missingRequired.length === 0 && pendingRequired.length === 0 && expired.length === 0,
  };
}

export function buildDocumentCenterReport(documents = [], owners = [], now = new Date()) {
  const normalized = documents.map((doc) => normalizeDocumentRecord(doc, now));
  const ownersByUid = new Map(owners.map((owner) => [clean(first(owner.uid, owner.id, owner.userUid), 180), owner]));
  const grouped = new Map();
  normalized.forEach((doc) => {
    const key = doc.ownerUid || 'sin_propietario';
    grouped.set(key, [...(grouped.get(key) || []), doc]);
  });
  const compliance = [...grouped.entries()].map(([ownerUid, docs]) => buildDocumentCompliance({
    ...(ownersByUid.get(ownerUid) || {}),
    ownerUid,
    role: docs[0]?.role,
  }, docs, now));
  const byStatus = DOCUMENT_STATUSES.reduce((acc, status) => {
    acc[status] = normalized.filter((doc) => doc.status === status).length;
    return acc;
  }, {});
  const byType = normalized.reduce((acc, doc) => {
    acc[doc.documentType] = (acc[doc.documentType] || 0) + 1;
    return acc;
  }, {});
  return {
    version: DOCUMENT_CENTER_VERSION,
    total: normalized.length,
    byStatus,
    byType,
    pending: normalized.filter((doc) => ['pendiente', 'en_revision'].includes(doc.status)),
    expired: normalized.filter((doc) => doc.expired || doc.status === 'caducado'),
    expiringSoon: normalized.filter((doc) => doc.expiresSoon && !doc.expired),
    rejected: normalized.filter((doc) => doc.status === 'rechazado'),
    compliance,
    risks: [
      ...normalized.filter((doc) => doc.expired).map((doc) => ({ type: 'expired', severity: 'high', documentId: doc.id, ownerUid: doc.ownerUid, label: doc.name })),
      ...normalized.filter((doc) => doc.expiresSoon && !doc.expired).map((doc) => ({ type: 'expires_soon', severity: doc.daysToExpiry <= 7 ? 'high' : 'medium', documentId: doc.id, ownerUid: doc.ownerUid, label: doc.name })),
      ...compliance.flatMap((item) => item.missingRequired.map((type) => ({ type: 'missing_required', severity: 'high', ownerUid: item.documents[0]?.ownerUid || '', label: documentTypeDefinition(type).label }))),
    ],
  };
}

export function shouldSendExpiryReminder(document = {}, now = new Date(), windowDays = 30) {
  const normalized = normalizeDocumentRecord(document, now);
  if (!normalized.expiresAt || normalized.expired || normalized.status !== 'validado') return false;
  if (normalized.daysToExpiry === null || normalized.daysToExpiry > windowDays) return false;
  const last = dateFrom(first(document.lastExpiryReminderAt, document.ultimo_recordatorio_caducidad));
  if (!last) return true;
  return daysBetween(addDays(last, 7), now) <= 0;
}

export function buildDocumentAutomationEvents(documents = [], now = new Date(), options = {}) {
  const reminderWindowDays = toNumber(options.reminderWindowDays, 30);
  return documents.flatMap((doc) => {
    const normalized = normalizeDocumentRecord(doc, now);
    const events = [];
    if (normalized.expired && normalized.storedStatus !== 'caducado') {
      events.push({ type: 'document.expired', document: normalized });
    }
    if (shouldSendExpiryReminder(doc, now, reminderWindowDays)) {
      events.push({ type: 'document.expiring_soon', document: normalized });
    }
    if (['pendiente', 'en_revision'].includes(normalized.status) && normalized.uploadedAt) {
      const uploadedAt = dateFrom(normalized.uploadedAt);
      const referenceDate = dateFrom(now) || new Date();
      const ageDays = uploadedAt ? Math.floor((referenceDate.getTime() - uploadedAt.getTime()) / 86400000) : 0;
      if (ageDays >= toNumber(options.staleReviewDays, 1)) {
        events.push({ type: 'document.stale', document: normalized });
      }
    }
    return events;
  });
}

export function documentRowsForCsv(documents = []) {
  return documents.map((doc) => {
    const normalized = normalizeDocumentRecord(doc);
    return {
      id: normalized.id,
      ownerUid: normalized.ownerUid,
      role: normalized.role,
      tipo: normalized.documentType,
      nombre: normalized.name,
      estado: normalized.status,
      version: normalized.version,
      uploadedAt: normalized.uploadedAt,
      expiresAt: normalized.expiresAt,
      daysToExpiry: normalized.daysToExpiry ?? '',
      verificationLevel: normalized.verificationLevel,
    };
  });
}

export default {
  DOCUMENT_CENTER_VERSION,
  DOCUMENT_TYPE_DEFINITIONS,
  DOCUMENT_STATUSES,
  buildDocumentUploadRecord,
  buildDocumentVerificationPatch,
  buildDocumentReplacementPatch,
  buildDocumentExpiryPatch,
  buildDocumentCompliance,
  buildDocumentCenterReport,
  buildDocumentAutomationEvents,
  documentRowsForCsv,
  documentTypeDefinition,
  normalizeDocumentRecord,
  normalizeDocumentStatus,
  shouldSendExpiryReminder,
};
