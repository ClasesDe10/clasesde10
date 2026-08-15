/**
 * Pure account-completion rules shared by Firebase Auth and their tests.
 *
 * "Termina tu cuenta" is intentionally limited to Google accounts that will
 * be used as a family or teacher. Admin and student identities have different
 * provisioning flows and must never be sent through this form.
 */

const ACCOUNT_ROLES = new Set(['admin', 'familia', 'profesor', 'alumno']);
const COMPLETION_ROLES = new Set(['familia', 'profesor']);
const ADMIN_ACCOUNT_EMAILS = new Set(['contacto.clasesde10@gmail.com']);

const ROLE_ALIASES = Object.freeze({
  administrador: 'admin',
  administradora: 'admin',
  administrator: 'admin',
  family: 'familia',
  teacher: 'profesor',
  student: 'alumno',
});

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeAccountRole(value) {
  const cleanRole = String(value || '').trim().toLowerCase();
  const role = ROLE_ALIASES[cleanRole] || cleanRole;
  return ACCOUNT_ROLES.has(role) ? role : '';
}

export function normalizeCompletionRole(value) {
  const role = normalizeAccountRole(value);
  return COMPLETION_ROLES.has(role) ? role : '';
}

export function isKnownAdminIdentity({ role = '', email = '' } = {}) {
  return normalizeAccountRole(role) === 'admin' || ADMIN_ACCOUNT_EMAILS.has(normalizeEmail(email));
}

export function isValidCompletionPhone(value) {
  const phone = String(value || '').trim();
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15 && /^[+\d\s().-]+$/.test(phone);
}

export function resolveGoogleAccountCompletion({
  authEmail = '',
  storedRole = '',
  rememberedRole = '',
  userExists = false,
  profileExists = false,
  userPhone = '',
  profilePhone = '',
} = {}) {
  const canonicalStoredRole = normalizeAccountRole(storedRole);
  const adminIdentity = isKnownAdminIdentity({ role: canonicalStoredRole, email: authEmail });
  const role = adminIdentity
    ? 'admin'
    : canonicalStoredRole || (!userExists ? normalizeCompletionRole(rememberedRole) : '');
  const telefono = String(userPhone || profilePhone || '').trim();

  if (role === 'admin' || role === 'alumno') {
    return {
      role,
      telefono,
      complete: true,
      requiresAccountCompletion: false,
      eligibleForCompletion: false,
      reason: 'role-exempt',
    };
  }

  if (userExists && !canonicalStoredRole) {
    return {
      role: '',
      telefono,
      complete: false,
      requiresAccountCompletion: false,
      eligibleForCompletion: false,
      reason: 'invalid-existing-role',
    };
  }

  const complete = Boolean(
    userExists
    && COMPLETION_ROLES.has(role)
    && profileExists
    && isValidCompletionPhone(telefono)
  );

  return {
    role,
    telefono,
    complete,
    requiresAccountCompletion: !complete,
    eligibleForCompletion: true,
    reason: complete ? 'complete' : 'missing-required-account-data',
  };
}
