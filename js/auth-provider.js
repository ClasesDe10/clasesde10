/**
 * ClasesDe10 - Auth provider switch.
 *
 * Keep production on Supabase until Firebase Auth is enabled, an admin user
 * exists, and dashboards have been migrated. When that cutover is ready, this
 * file is the single import surface to switch from ./auth.js to
 * ./firebase-auth.js.
 */

export {
  getSession,
  getUsuarioActual,
  login,
  logout,
  onAuthChange,
  redirectByRole,
  register,
  requireAuth,
  resetPassword,
} from './auth.js';

