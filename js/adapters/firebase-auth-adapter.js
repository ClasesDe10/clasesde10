/**
 * Firebase implementation of the auth adapter contract.
 *
 * Not connected to production pages yet.
 */

import {
  getSession,
  getUsuarioActual,
  login,
  loginWithGoogle,
  logout,
  onAuthChange,
  register,
  requireAuth,
  resetPassword,
  verifyPasswordResetCode,
  confirmPasswordResetCode,
} from '../firebase-auth.js?v=20260627-domain-auth';

export const authAdapter = {
  getSession,
  getCurrentUser: getUsuarioActual,
  requireAuth,
  login,
  loginWithGoogle,
  logout,
  register,
  resetPassword,
  verifyPasswordResetCode,
  confirmPasswordResetCode,
  onAuthChange,
};

export default authAdapter;
