/**
 * ClasesDe10 - Auth provider switch.
 *
 * Stable import surface for production pages. Authentication is now delegated
 * to Firebase through ./auth.js.
 */

export {
  completeGoogleAccount,
  completePasswordSetupLink,
  getGoogleAccountCompletion,
  getPasswordSetupEmail,
  getSession,
  getUsuarioActual,
  login,
  loginWithGoogle,
  logout,
  onAuthChange,
  redirectByRole,
  register,
  requestAssistedFamilyActivation,
  requestPasswordSetupLink,
  requireAuth,
  resetPassword,
  isPasswordSetupLink,
  setPasswordAfterEmailVerification,
} from './auth.js?v=20260815-logout-r1';
