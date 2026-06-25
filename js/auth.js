/**
 * ClasesDe10 - Auth Module.
 *
 * Public production API kept stable for pages and dashboards. The
 * implementation now delegates authentication operations to the Firebase Auth
 * adapter.
 */

import authAdapter from './adapters/firebase-auth-adapter.js';

export const getSession = authAdapter.getSession;
export const getUsuarioActual = authAdapter.getCurrentUser;
export const requireAuth = authAdapter.requireAuth;
export const login = authAdapter.login;
export const logout = authAdapter.logout;
export const register = authAdapter.register;
export const resetPassword = authAdapter.resetPassword;
export const onAuthChange = authAdapter.onAuthChange;

const ROLES_RUTAS = {
  admin: '/pages/dashboard/admin.html',
  profesor: '/pages/dashboard/profesor.html',
  familia: '/pages/dashboard/familia.html',
  alumno: '/pages/dashboard/alumno.html',
};

export function redirectByRole(rol) {
  const ruta = ROLES_RUTAS[rol];
  if (ruta) window.location.href = ruta;
}
