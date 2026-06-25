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
} from '../firebase-auth.js';

export const authAdapter = {
  getSession,
  getCurrentUser: getUsuarioActual,
  requireAuth,
  login,
  logout,
  register,
  resetPassword,
  onAuthChange,
};

export default authAdapter;
