/**
 * ClasesDe10 - Auth Module.
 *
 * Public production API kept stable for pages and dashboards. The
 * implementation now delegates authentication operations to the Firebase Auth
 * adapter.
 */

import authAdapter from './adapters/firebase-auth-adapter.js?v=20260815-onboarding-gate';
import { trackAuthEvent } from './analytics-client.js?v=20260628-analytics';

export const getSession = authAdapter.getSession;
export const getUsuarioActual = authAdapter.getCurrentUser;
export const requireAuth = authAdapter.requireAuth;
export const onAuthChange = authAdapter.onAuthChange;
export const completePasswordSetupLink = authAdapter.completePasswordSetupLink;
export const getPasswordSetupEmail = authAdapter.getPasswordSetupEmail;
export const isPasswordSetupLink = authAdapter.isPasswordSetupLink;
export const requestPasswordSetupLink = authAdapter.requestPasswordSetupLink;
export const requestAssistedFamilyActivation = authAdapter.requestAssistedFamilyActivation;
export const setPasswordAfterEmailVerification = authAdapter.setPasswordAfterEmailVerification;

function authDuration(startedAt) {
  return Math.max(0, Date.now() - startedAt);
}

function authErrorMetadata(error, startedAt, method = 'email') {
  return {
    method,
    code: error?.code || '',
    message: error?.message || 'Auth operation failed',
    durationMs: authDuration(startedAt),
  };
}

export async function login(email, password) {
  const startedAt = Date.now();
  await trackAuthEvent('auth.login.started', { method: 'email' });
  try {
    const result = await authAdapter.login(email, password);
    await trackAuthEvent('auth.login.succeeded', { method: 'email', durationMs: authDuration(startedAt), role: result?.user?.role || result?.user?.rol || '' });
    return result;
  } catch (error) {
    await trackAuthEvent('auth.login.failed', authErrorMetadata(error, startedAt, 'email'));
    throw error;
  }
}

export async function loginWithGoogle(roleForNewAccount = '') {
  const startedAt = Date.now();
  await trackAuthEvent('auth.login.started', { method: 'google' });
  try {
    const result = await authAdapter.loginWithGoogle(roleForNewAccount);
    await trackAuthEvent('auth.login.succeeded', { method: 'google', durationMs: authDuration(startedAt), role: result?.user?.role || result?.user?.rol || '' });
    return result;
  } catch (error) {
    await trackAuthEvent('auth.login.failed', authErrorMetadata(error, startedAt, 'google'));
    throw error;
  }
}

export const getGoogleAccountCompletion = authAdapter.getGoogleAccountCompletion;
export const completeGoogleAccount = authAdapter.completeGoogleAccount;

export async function logout(options = {}) {
  await trackAuthEvent('auth.logout', { method: 'firebase' });
  return authAdapter.logout(options);
}

export async function register(...args) {
  const startedAt = Date.now();
  await trackAuthEvent('auth.signup.started', { method: 'email' });
  try {
    const result = await authAdapter.register(...args);
    await trackAuthEvent('auth.signup.succeeded', { method: 'email', durationMs: authDuration(startedAt), role: result?.user?.role || result?.user?.rol || args?.[2] || '' });
    return result;
  } catch (error) {
    await trackAuthEvent('auth.signup.failed', authErrorMetadata(error, startedAt, 'email'));
    throw error;
  }
}

export async function resetPassword(email) {
  const startedAt = Date.now();
  try {
    const result = await authAdapter.resetPassword(email);
    await trackAuthEvent('auth.password_reset.requested', { method: 'email', durationMs: authDuration(startedAt) });
    return result;
  } catch (error) {
    await trackAuthEvent('auth.login.failed', authErrorMetadata(error, startedAt, 'password_reset'));
    throw error;
  }
}

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
