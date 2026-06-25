/**
 * Firebase implementation of the auth adapter contract.
 *
 * Not connected to production pages yet.
 */

import {
  getSession,
  getUsuarioActual,
  login,
  logout,
  onAuthChange,
  register,
  requireAuth,
  resetPassword,
  verifyPasswordResetCode,
  confirmPasswordResetCode,
} from '../firebase-auth.js';

export const authAdapter = {
  getSession,
  getCurrentUser: getUsuarioActual,
  requireAuth,
  login,
  logout,
  register,
  resetPassword,
  verifyPasswordResetCode,
  confirmPasswordResetCode,
  onAuthChange,
};

export default authAdapter;
