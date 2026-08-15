/**
 * Firebase implementation of the auth adapter contract.
 *
 * Not connected to production pages yet.
 */

import {
  completeGoogleAccount,
  completePasswordSetupLink,
  getSession,
  getGoogleAccountCompletion,
  getPasswordSetupEmail,
  getUsuarioActual,
  isPasswordSetupLink,
  login,
  loginWithGoogle,
  logout,
  onAuthChange,
  register,
  requestAssistedFamilyActivation,
  requestPasswordSetupLink,
  requireAuth,
  resetPassword,
  setPasswordAfterEmailVerification,
  verifyPasswordResetCode,
  confirmPasswordResetCode,
} from '../firebase-auth.js?v=20260815-onboarding-gate';

export const authAdapter = {
  completeGoogleAccount,
  completePasswordSetupLink,
  getSession,
  getGoogleAccountCompletion,
  getPasswordSetupEmail,
  getCurrentUser: getUsuarioActual,
  isPasswordSetupLink,
  requireAuth,
  login,
  loginWithGoogle,
  logout,
  register,
  requestAssistedFamilyActivation,
  requestPasswordSetupLink,
  resetPassword,
  setPasswordAfterEmailVerification,
  verifyPasswordResetCode,
  confirmPasswordResetCode,
  onAuthChange,
};

export default authAdapter;
