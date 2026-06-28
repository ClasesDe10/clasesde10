/**
 * ClasesDe10 - Auth provider switch.
 *
 * Stable import surface for production pages. Authentication is now delegated
 * to Firebase through ./auth.js.
 */

export {
  getSession,
  getUsuarioActual,
  login,
  loginWithGoogle,
  logout,
  onAuthChange,
  redirectByRole,
  register,
  requireAuth,
  resetPassword,
} from './auth.js?v=20260628-audit';
