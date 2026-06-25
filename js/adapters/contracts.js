/**
 * ClasesDe10 - data adapter contracts.
 *
 * These contracts define the future dashboard-facing data boundary. Production
 * pages are not wired to this layer yet.
 */

export const ADAPTER_DOMAINS = Object.freeze([
  'auth',
  'users',
  'profesores',
  'familias',
  'alumnos',
  'asignaciones',
  'solicitudes',
  'clases',
  'pagos',
  'documentos',
  'notificaciones',
  'configuracion',
]);

export const COLLECTIONS = Object.freeze({
  users: 'users',
  profesores: 'profesores',
  familias: 'familias',
  alumnos: 'alumnos',
  asignaciones: 'asignaciones',
  solicitudes: 'solicitudes',
  clases: 'clases',
  pagos: 'pagos',
  documentos: 'documentos',
  notificaciones: 'notificaciones',
  configuracion: 'configuracion',
  configuracionPublica: 'configuracionPublica',
});

export const BASE_ADAPTER_METHODS = Object.freeze([
  'getById',
  'list',
  'create',
  'update',
  'upsert',
  'remove',
]);

export const DOMAIN_METHODS = Object.freeze({
  auth: [
    'getSession',
    'getCurrentUser',
    'requireAuth',
    'login',
    'logout',
    'register',
    'resetPassword',
    'verifyPasswordResetCode',
    'confirmPasswordResetCode',
    'onAuthChange',
  ],
  users: [...BASE_ADAPTER_METHODS, 'getCurrentProfile', 'listByRole', 'setActive'],
  profesores: [...BASE_ADAPTER_METHODS, 'getByUserUid', 'listByVerificationStatus'],
  familias: [...BASE_ADAPTER_METHODS, 'getByUserUid'],
  alumnos: [...BASE_ADAPTER_METHODS, 'listByFamily', 'listByStudentUid'],
  asignaciones: [...BASE_ADAPTER_METHODS, 'listByTeacher', 'listByFamily', 'listByStudent'],
  solicitudes: [...BASE_ADAPTER_METHODS, 'listByFamily', 'listByStatus', 'assignTeacher'],
  clases: [...BASE_ADAPTER_METHODS, 'listByTeacher', 'listByFamily', 'listByStudent', 'setStatus'],
  pagos: [...BASE_ADAPTER_METHODS, 'listByFamily', 'listByStatus', 'validatePayment'],
  documentos: [...BASE_ADAPTER_METHODS, 'listByOwner', 'uploadForOwner', 'getDownloadUrl'],
  notificaciones: [...BASE_ADAPTER_METHODS, 'listByUser', 'watchUnread', 'markAsRead'],
  configuracion: ['getValue', 'setValue', 'getPublicValue', 'setPublicValue'],
});

export function adapterResult(data = null, error = null) {
  return { data, error };
}

export function adapterError(error, fallbackMessage = 'No se pudo completar la operacion.') {
  if (!error) return { message: fallbackMessage };
  if (typeof error === 'string') return { message: error };
  return {
    ...error,
    message: error.message || fallbackMessage,
  };
}

export function toDocument(id, data) {
  if (!data) return null;
  return { id, ...data };
}

export function normalizeId(value) {
  return String(value || '').trim();
}

export function cleanUndefined(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, cleanUndefined(entryValue)]),
  );
}
