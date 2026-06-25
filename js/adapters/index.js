/**
 * ClasesDe10 - Firebase adapter registry.
 *
 * Future dashboards should import from this file instead of importing Firebase
 * or Supabase clients directly.
 */

import auth from './firebase-auth-adapter.js';
import users from './users-adapter.js';
import profesores from './profesores-adapter.js';
import familias from './familias-adapter.js';
import alumnos from './alumnos-adapter.js';
import asignaciones from './asignaciones-adapter.js';
import solicitudes from './solicitudes-adapter.js';
import clases from './clases-adapter.js';
import pagos from './pagos-adapter.js';
import documentos from './documentos-adapter.js';
import notificaciones from './notificaciones-adapter.js';
import configuracion from './configuracion-adapter.js';

export {
  auth,
  users,
  profesores,
  familias,
  alumnos,
  asignaciones,
  solicitudes,
  clases,
  pagos,
  documentos,
  notificaciones,
  configuracion,
};

export const firebaseAdapters = {
  auth,
  users,
  profesores,
  familias,
  alumnos,
  asignaciones,
  solicitudes,
  clases,
  pagos,
  documentos,
  notificaciones,
  configuracion,
};

export default firebaseAdapters;
