/**
 * ClasesDe10 - Firebase Auth transition layer.
 *
 * This module is the production Firebase Auth provider behind auth-provider.js.
 * It supports Email/Password and Google Sign-In while keeping the dashboard
 * profile contract stable.
 */

import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  isSignInWithEmailLink,
  linkWithCredential,
  onAuthStateChanged,
  confirmPasswordReset as firebaseConfirmPasswordReset,
  reauthenticateWithCredential,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
  verifyPasswordResetCode as firebaseVerifyPasswordResetCode,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { firebaseAuth, firebaseDb } from './firebase-client.js?v=20260627-domain-auth';
import { recordAuthAudit } from './audit-client.js?v=20260628-audit';
import { normalizeEntityForWrite } from './data-schema.js';
import {
  isKnownAdminIdentity,
  isValidCompletionPhone,
  normalizeAccountRole,
  normalizeCompletionRole,
  resolveGoogleAccountCompletion,
} from './auth-onboarding.js?v=20260815-onboarding-gate';

const CANONICAL_ORIGIN = 'https://clasesde10.com';
const AUTH_ALLOWED_ORIGINS = new Set([
  CANONICAL_ORIGIN,
  'https://www.clasesde10.com',
  'https://clasesde10-50add.web.app',
  'https://clasesde10-50add.firebaseapp.com',
  'https://clasesde10-50add--fase2-auth-ws7x8zcz.web.app',
]);

const ROLES_RUTAS = {
  admin: '/pages/dashboard/admin.html',
  profesor: '/pages/dashboard/profesor.html',
  familia: '/pages/dashboard/familia.html',
  alumno: '/pages/dashboard/alumno.html',
};

const googleProvider = new GoogleAuthProvider();
firebaseAuth.languageCode = 'es';
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.email');
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.profile');
googleProvider.setCustomParameters({ prompt: 'select_account' });

const PASSWORD_SETUP_STORAGE_KEY = 'cd10-password-setup-email';
const PASSWORD_SETUP_TTL_MS = 30 * 60 * 1000;
const PENDING_GOOGLE_LINK_TTL_MS = 10 * 60 * 1000;
const LOGOUT_AUDIT_TIMEOUT_MS = 600;
let pendingGoogleCredential = null;
let pendingGoogleEmail = '';
let pendingGoogleStartedAt = 0;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || '').trim();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function clearPendingGoogleLink() {
  pendingGoogleCredential = null;
  pendingGoogleEmail = '';
  pendingGoogleStartedAt = 0;
}

function getPendingGoogleLink() {
  if (!pendingGoogleCredential || Date.now() - pendingGoogleStartedAt > PENDING_GOOGLE_LINK_TTL_MS) {
    clearPendingGoogleLink();
    return null;
  }
  return { credential: pendingGoogleCredential, email: pendingGoogleEmail };
}

function rememberPasswordSetupEmail(email) {
  try {
    window.localStorage.setItem(PASSWORD_SETUP_STORAGE_KEY, JSON.stringify({
      email: normalizeEmail(email),
      requestedAt: Date.now(),
    }));
  } catch (_) {}
}

export function getPasswordSetupEmail() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(PASSWORD_SETUP_STORAGE_KEY) || 'null');
    if (!stored?.email || Date.now() - Number(stored.requestedAt || 0) > PASSWORD_SETUP_TTL_MS) {
      window.localStorage.removeItem(PASSWORD_SETUP_STORAGE_KEY);
      return '';
    }
    return normalizeEmail(stored.email);
  } catch (_) {
    return '';
  }
}

function clearPasswordSetupEmail() {
  try {
    window.localStorage.removeItem(PASSWORD_SETUP_STORAGE_KEY);
  } catch (_) {}
}

function splitDisplayName(displayName, fallbackEmail = '') {
  const cleanName = normalizeText(displayName);
  if (cleanName) {
    const parts = cleanName.split(/\s+/);
    return {
      nombre: parts.shift() || cleanName,
      apellidos: parts.join(' '),
    };
  }

  const localPart = normalizeEmail(fallbackEmail).split('@')[0] || 'Usuario';
  return {
    nombre: localPart.replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
    apellidos: '',
  };
}

function authError(message, code = 'firebase-auth/precondition') {
  return { message, code };
}

function getAuthActionOrigin() {
  const currentOrigin = window.location.origin;
  return AUTH_ALLOWED_ORIGINS.has(currentOrigin) ? currentOrigin : CANONICAL_ORIGIN;
}

function mapFirebaseError(error) {
  const messages = {
    'auth/account-exists-with-different-credential': 'Ya existe una cuenta con este email usando otro metodo de acceso.',
    'auth/cancelled-popup-request': 'Ya hay una ventana de Google abierta.',
    'auth/email-already-in-use': 'Ya existe una cuenta con este email.',
    'auth/invalid-credential': 'Email o contrasena incorrectos.',
    'auth/invalid-email': 'Introduce un email valido.',
    'auth/missing-password': 'Introduce la contrasena.',
    'auth/operation-not-allowed': 'El acceso con Google no esta activado en Firebase.',
    'auth/popup-blocked': 'El navegador ha bloqueado la ventana de Google. Permite ventanas emergentes para continuar.',
    'auth/popup-closed-by-user': 'Has cerrado la ventana de Google antes de terminar.',
    'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
    'auth/unauthorized-domain': 'Este dominio no esta autorizado en Firebase Auth.',
    'auth/user-disabled': 'Tu cuenta esta desactivada. Contacta con soporte.',
    'auth/user-not-found': 'Email o contrasena incorrectos.',
    'auth/weak-password': 'La contrasena debe tener al menos 8 caracteres.',
    'auth/wrong-password': 'Email o contrasena incorrectos.',
    'auth/expired-action-code': 'El enlace ha caducado. Solicita uno nuevo.',
    'auth/invalid-action-code': 'El enlace no es valido o ya fue utilizado.',
    'auth/provider-already-linked': 'Este metodo de acceso ya estaba vinculado a tu cuenta.',
    'auth/requires-recent-login': 'Por seguridad, vuelve a verificar tu acceso antes de cambiar la contrasena.',
  };

  if (!error) return null;
  return {
    ...error,
    message: messages[error.code] || error.message || 'No se pudo completar la operacion.',
  };
}

function googleIdentity(user) {
  const emailClean = normalizeEmail(user.email);
  const providerProfile = user.providerData?.find((provider) => provider.providerId === 'google.com') || {};
  const names = splitDisplayName(user.displayName || providerProfile.displayName, emailClean);
  return {
    email: emailClean,
    nombre: names.nombre,
    apellidos: names.apellidos,
    photoUrl: normalizeText(user.photoURL || providerProfile.photoURL),
  };
}

function isGoogleUser(user) {
  return Boolean(user?.providerData?.some((provider) => provider.providerId === 'google.com'));
}

function validRole(value) {
  return normalizeCompletionRole(value);
}

function validPhone(value) {
  return isValidCompletionPhone(value);
}

function rememberGoogleSignupRole(role) {
  try {
    if (role) {
      window.sessionStorage.setItem('cd10-google-signup-role', JSON.stringify({
        role: validRole(role),
        startedAt: Date.now(),
      }));
    } else {
      window.sessionStorage.removeItem('cd10-google-signup-role');
    }
  } catch (_) {}
}

function rememberedGoogleSignupRole() {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem('cd10-google-signup-role') || 'null');
    const isFresh = stored?.startedAt && Date.now() - Number(stored.startedAt) <= PENDING_GOOGLE_LINK_TTL_MS;
    if (!isFresh) {
      window.sessionStorage.removeItem('cd10-google-signup-role');
      return '';
    }
    return validRole(stored.role);
  } catch (_) {
    try { window.sessionStorage.removeItem('cd10-google-signup-role'); } catch (_) {}
    return '';
  }
}

function clearRememberedGoogleSignupRole() {
  try {
    window.sessionStorage.removeItem('cd10-google-signup-role');
  } catch (_) {}
}

const AUTH_CREATE_FIELDS = Object.freeze({
  users: [
    'email', 'nombre', 'apellidos', 'telefono', 'role', 'active',
    'onboardingSource', 'assistedLeadId', 'passwordSetupRequired', 'profileCompletionRequired',
    'createdAt', 'updatedAt',
  ],
  familias: [
    'userUid', 'email', 'nombre', 'apellidos', 'telefono', 'active', 'status',
    'onboardingSource', 'assistedLeadId', 'createdAt', 'updatedAt',
  ],
  profesores: [
    'userUid', 'email', 'nombre', 'apellidos', 'telefono', 'active', 'status',
    'perfil_completo', 'profileComplete', 'estado_verificacion', 'verificationStatus',
    'createdAt', 'updatedAt',
  ],
});

function normalizeAuthCreate(collectionName, payload) {
  const normalized = normalizeEntityForWrite(collectionName, payload, { isCreate: true });
  return Object.fromEntries(
    (AUTH_CREATE_FIELDS[collectionName] || [])
      .filter((field) => normalized[field] !== undefined)
      .map((field) => [field, normalized[field]]),
  );
}

function mapProfile(uid, data) {
  if (!data) return null;
  const legacy = data.legacy || {};
  const appUserId = legacy.supabaseUserId || data.supabaseUserId || uid;
  const storedRole = data.role || data.rol || '';
  const role = isKnownAdminIdentity({ role: storedRole, email: data.email })
    ? 'admin'
    : normalizeAccountRole(storedRole);

  return {
    id: appUserId,
    auth_id: legacy.supabaseAuthId || uid,
    uid,
    firebase_uid: uid,
    email: data.email || '',
    nombre: data.nombre || '',
    apellidos: data.apellidos || '',
    telefono: data.telefono || '',
    rol: role,
    role,
    activo: data.active !== false,
    active: data.active !== false,
    onboardingSource: data.onboardingSource || '',
    assistedLeadId: data.assistedLeadId || '',
    passwordSetupRequired: data.passwordSetupRequired === true,
    passwordSetupCompletedAt: data.passwordSetupCompletedAt || null,
    profileCompletionRequired: data.profileCompletionRequired === true,
    profileCompletedAt: data.profileCompletedAt || null,
    legacy,
  };
}

function waitForCurrentUser() {
  if (firebaseAuth.currentUser) return Promise.resolve(firebaseAuth.currentUser);

  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

export async function getSession() {
  const user = await waitForCurrentUser();
  return user ? { user } : null;
}

export async function getUsuarioActual() {
  const user = await waitForCurrentUser();
  if (!user) return null;

  const snap = await getDoc(doc(firebaseDb, 'users', user.uid));
  if (!snap.exists()) return null;

  return mapProfile(user.uid, snap.data());
}

function assistedLeadIdFromLink(emailLink = window.location.href) {
  const raw = String(emailLink || '');
  const read = (value) => {
    try {
      const url = new URL(value, window.location.origin);
      return normalizeText(url.searchParams.get('solicitud_asistida'));
    } catch (_) {
      return '';
    }
  };
  const direct = read(raw);
  if (direct) return direct;
  try {
    const nested = new URL(raw, window.location.origin).searchParams.get('continueUrl');
    return nested ? read(decodeURIComponent(nested)) : '';
  } catch (_) {
    return '';
  }
}

async function createAssistedFamilyAccount(user, leadId) {
  const cleanLeadId = normalizeText(leadId).slice(0, 180);
  if (!user || !cleanLeadId) return null;

  const leadRef = doc(firebaseDb, 'leadsPublicos', cleanLeadId);
  const leadSnap = await getDoc(leadRef);
  if (!leadSnap.exists()) throw authError('La solicitud de ayuda ya no esta disponible.', 'auth/assisted-request-not-found');

  const lead = leadSnap.data() || {};
  const email = normalizeEmail(user.email);
  if (
    lead.tipo !== 'familia'
    || normalizeEmail(lead.email) !== email
    || lead.metadata?.account_mode !== 'assisted_parent_activation'
  ) {
    throw authError('La solicitud no corresponde con el correo verificado.', 'auth/assisted-request-mismatch');
  }

  const names = splitDisplayName(lead.nombre, email);
  const studentName = normalizeText(lead.metadata?.alumno).slice(0, 160);
  const subject = normalizeText(lead.metadata?.materia || lead.asunto || lead.mensaje).slice(0, 180);
  const studentId = `lead_${cleanLeadId}`;
  const solicitudId = `lead_${cleanLeadId}`;
  const batch = writeBatch(firebaseDb);

  batch.set(doc(firebaseDb, 'users', user.uid), normalizeAuthCreate('users', {
    email,
    nombre: names.nombre,
    apellidos: names.apellidos,
    telefono: normalizeText(lead.telefono).slice(0, 40) || null,
    role: 'familia',
    active: true,
    onboardingSource: 'assisted_parent_form',
    assistedLeadId: cleanLeadId,
    passwordSetupRequired: true,
    profileCompletionRequired: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  batch.set(doc(firebaseDb, 'familias', user.uid), normalizeAuthCreate('familias', {
    userUid: user.uid,
    email,
    nombre: names.nombre,
    apellidos: names.apellidos,
    telefono: normalizeText(lead.telefono).slice(0, 40) || null,
    active: true,
    status: 'activo',
    onboardingSource: 'assisted_parent_form',
    assistedLeadId: cleanLeadId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  batch.update(leadRef, {
    accountStatus: 'activated',
    accountUid: user.uid,
    accountActivatedAt: serverTimestamp(),
    studentId,
    solicitudId,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();

  if (studentName) {
    await setDoc(doc(firebaseDb, 'alumnos', studentId), {
      familyUid: user.uid,
      familia_id: user.uid,
      nombre: studentName,
      apellidos: '',
      materias: subject ? [subject] : [],
      materias_necesita: subject ? [subject] : [],
      active: true,
      activo: true,
      source: 'assisted_parent_form',
      publicLeadId: cleanLeadId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).catch((error) => {
      console.warn('No se pudo preparar el alumno de la solicitud asistida.', error);
    });
  }

  const requestRef = doc(firebaseDb, 'solicitudes', solicitudId);
  const requestSnap = await getDoc(requestRef).catch(() => null);
  if (requestSnap?.exists()) {
    await setDoc(requestRef, {
      familyUid: user.uid,
      familia_id: user.uid,
      studentId: studentName ? studentId : null,
      alumno_id: studentName ? studentId : null,
      familySnapshot: {
        nombre: normalizeText(lead.nombre).slice(0, 160),
        email,
        telefono: normalizeText(lead.telefono).slice(0, 40),
      },
      studentSnapshot: {
        nombre: studentName,
        nivel: normalizeText(lead.metadata?.nivel).slice(0, 120),
      },
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch((error) => {
      console.warn('La solicitud quedara enlazada por la automatizacion administrativa.', error);
    });
  } else {
    await setDoc(requestRef, {
      source: 'publicLead',
      publicLeadId: cleanLeadId,
      familyUid: user.uid,
      familia_id: user.uid,
      studentId: studentName ? studentId : null,
      alumno_id: studentName ? studentId : null,
      materia: subject,
      nivel: normalizeText(lead.metadata?.nivel).slice(0, 120),
      modalidad: normalizeText(lead.metadata?.modalidad).slice(0, 120),
      zona: normalizeText(lead.metadata?.zona).slice(0, 180),
      preferencia_horario: normalizeText(lead.metadata?.disponibilidad).slice(0, 300),
      observaciones: normalizeText(lead.mensaje).slice(0, 2000),
      estado: 'nueva',
      status: 'nueva',
      familySnapshot: {
        nombre: normalizeText(lead.nombre).slice(0, 160),
        email,
        telefono: normalizeText(lead.telefono).slice(0, 40),
      },
      studentSnapshot: {
        nombre: studentName,
        nivel: normalizeText(lead.metadata?.nivel).slice(0, 120),
      },
      matchStatus: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).catch((error) => {
      console.warn('La solicitud quedara enlazada por la automatizacion administrativa.', error);
    });
  }

  await updateProfile(user, { displayName: normalizeText(lead.nombre).slice(0, 160) }).catch(() => null);
  return getUsuarioActual();
}

export async function getGoogleAccountCompletion() {
  const user = await waitForCurrentUser();
  if (!user) {
    return { data: null, error: authError('Inicia sesion con Google para terminar tu cuenta.') };
  }
  if (!isGoogleUser(user)) {
    return { data: null, error: authError('Esta pantalla solo completa cuentas iniciadas con Google.') };
  }

  const identity = googleIdentity(user);
  const userRef = doc(firebaseDb, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  const userData = userSnap.exists() ? userSnap.data() : null;
  const storedRole = userData?.role || userData?.rol || '';
  const initialDecision = resolveGoogleAccountCompletion({
    authEmail: identity.email,
    storedRole,
    rememberedRole: rememberedGoogleSignupRole(),
    userExists: Boolean(userData),
    userPhone: userData?.telefono,
  });
  const role = initialDecision.role;
  let profileData = null;
  let profileExists = false;

  if (['familia', 'profesor'].includes(role)) {
    const profileSnap = await getDoc(doc(firebaseDb, role === 'profesor' ? 'profesores' : 'familias', user.uid));
    profileExists = profileSnap.exists();
    profileData = profileExists ? profileSnap.data() : null;
  }

  const completion = resolveGoogleAccountCompletion({
    authEmail: identity.email,
    storedRole,
    rememberedRole: initialDecision.role,
    userExists: Boolean(userData),
    profileExists,
    userPhone: userData?.telefono,
    profilePhone: profileData?.telefono,
  });
  return {
    data: {
      uid: user.uid,
      ...identity,
      ...completion,
      isNewAccount: !userData,
    },
    error: null,
  };
}

export async function completeGoogleAccount({ role: roleRaw, telefono: phoneRaw, acceptedTerms = false } = {}) {
  const user = await waitForCurrentUser();
  if (!user || !isGoogleUser(user)) {
    return { error: authError('La sesion de Google no esta disponible. Vuelve a iniciar sesion.') };
  }

  const identity = googleIdentity(user);
  const telefono = normalizeText(phoneRaw);
  if (!validPhone(telefono)) {
    return { error: authError('Introduce un telefono valido de entre 9 y 15 digitos.') };
  }
  if (!acceptedTerms) {
    return { error: authError('Debes aceptar los Terminos y la Politica de privacidad.') };
  }

  try {
    const userRef = doc(firebaseDb, 'users', user.uid);
    const existingUserSnap = await getDoc(userRef);
    const existingUser = existingUserSnap.exists() ? existingUserSnap.data() : null;
    const existingRole = normalizeAccountRole(existingUser?.role || existingUser?.rol);
    if (isKnownAdminIdentity({ role: existingRole, email: identity.email }) || existingRole === 'alumno') {
      return { error: authError('Esta cuenta no necesita completar este formulario.', 'auth/account-completion-not-required') };
    }
    if (existingUser && !existingRole) {
      return { error: authError('La cuenta existe, pero no tiene un rol valido. Contacta con soporte.', 'auth/invalid-account-role') };
    }
    const role = validRole(existingRole) || validRole(roleRaw) || rememberedGoogleSignupRole();
    if (!role) {
      return { error: authError('Elige si usaras la cuenta como familia o como profesor.') };
    }
    if (existingRole && existingRole !== role) {
      return { error: authError('El rol de una cuenta existente no se puede cambiar desde este formulario.') };
    }

    const collectionName = role === 'profesor' ? 'profesores' : 'familias';
    const profileRef = doc(firebaseDb, collectionName, user.uid);
    const profileSnap = await getDoc(profileRef);
    const batch = writeBatch(firebaseDb);

    if (existingUserSnap.exists()) {
      batch.update(userRef, {
        nombre: existingUser.nombre || identity.nombre,
        apellidos: existingUser.apellidos || identity.apellidos,
        telefono,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(userRef, normalizeAuthCreate('users', {
        email: identity.email,
        nombre: identity.nombre,
        apellidos: identity.apellidos,
        telefono,
        role,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }));
    }

    if (profileSnap.exists()) {
      const profileData = profileSnap.data();
      batch.update(profileRef, {
        nombre: profileData.nombre || identity.nombre,
        apellidos: profileData.apellidos || identity.apellidos,
        telefono,
        updatedAt: serverTimestamp(),
      });
    } else {
      const profilePayload = {
        userUid: user.uid,
        email: identity.email,
        nombre: identity.nombre,
        apellidos: identity.apellidos,
        telefono,
        active: true,
        status: role === 'profesor' ? 'pendiente_perfil' : 'activo',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (role === 'profesor') {
        Object.assign(profilePayload, {
          perfil_completo: false,
          profileComplete: false,
          estado_verificacion: 'pendiente_perfil',
          verificationStatus: 'pendiente_perfil',
        });
      }
      batch.set(profileRef, normalizeAuthCreate(collectionName, profilePayload));
    }

    await batch.commit();

    if (role === 'profesor' && identity.photoUrl) {
      await setDoc(profileRef, {
        foto_url: identity.photoUrl,
        photoUrl: identity.photoUrl,
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch((photoError) => {
        console.warn('No se pudo guardar la foto publica de Google.', photoError);
      });
    }

    clearRememberedGoogleSignupRole();

    await recordAuthAudit('auth.google_account_completed', {
      entityId: user.uid,
      actor: { actorUid: user.uid, actorEmail: identity.email, actorRole: role },
      description: 'Cuenta de Google completada con los datos minimos.',
      metadata: {
        role,
        newAccount: !existingUser,
        termsAccepted: true,
        privacyAccepted: true,
        googleProfileFieldsUsed: ['email', 'displayName', ...(identity.photoUrl ? ['photoUrl'] : [])],
      },
    });

    return { data: { user }, usuario: await getUsuarioActual(), error: null };
  } catch (error) {
    await recordAuthAudit('auth.google_account_completion_failed', {
      entityId: user.uid,
      actor: { actorUid: user.uid, actorEmail: identity.email },
      severity: 'warning',
      description: 'No se pudo completar la cuenta iniciada con Google.',
      metadata: { requestedRole: validRole(roleRaw) },
      error,
    });
    return { error: mapFirebaseError(error) };
  }
}

export async function requireAuth(rolesPermitidos = []) {
  const usuario = await getUsuarioActual();

  if (!usuario) {
    window.location.href = '/pages/login.html';
    return new Promise(() => {});
  }

  if (usuario.passwordSetupRequired && !window.location.pathname.includes('/pages/crear-contrasena')) {
    window.location.href = '/pages/crear-contrasena.html?activacion=pendiente';
    return new Promise(() => {});
  }

  const sessionUser = firebaseAuth.currentUser;
  if (isGoogleUser(sessionUser) && ['familia', 'profesor'].includes(usuario.rol)) {
    const completion = await getGoogleAccountCompletion();
    if (!completion.error && completion.data.requiresAccountCompletion) {
      window.location.href = `/termina-tu-cuenta?rol=${encodeURIComponent(usuario.rol)}`;
      return new Promise(() => {});
    }
  }

  if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(usuario.rol)) {
    if (rolesPermitidos.includes('admin')) {
      try {
        const roleLabel = usuario.rol || usuario.role || 'otro rol';
        sessionStorage.setItem(
          'cd10-auth-notice',
          `Estabas conectado con una cuenta de ${roleLabel}. Para entrar al panel de administrador, inicia sesion con una cuenta administradora.`
        );
      } catch (_) {}
      try {
        await signOut(firebaseAuth);
      } catch (_) {}
      window.location.href = '/pages/login.html?admin=1';
      return new Promise(() => {});
    }

    const rutaPropia = ROLES_RUTAS[usuario.rol];
    if (rutaPropia) window.location.href = rutaPropia;
    return new Promise(() => {});
  }

  return usuario;
}

export async function login(emailRaw, passwordRaw) {
  const email = normalizeEmail(emailRaw);
  const password = passwordRaw || '';
  const googleLink = getPendingGoogleLink();

  if (!email || !password) {
    return { error: authError('Email y contrasena son obligatorios.') };
  }
  if (googleLink?.email && googleLink.email !== email) {
    return {
      error: authError(
        'Usa el mismo correo que acabas de verificar con Google para vincular las dos formas de acceso.',
        'auth/google-link-email-mismatch',
      ),
    };
  }

  try {
    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    let googleLinked = false;

    if (googleLink?.credential) {
      try {
        await linkWithCredential(credential.user, googleLink.credential);
        googleLinked = true;
        clearPendingGoogleLink();
        await recordAuthAudit('auth.providers_linked', {
          entityId: credential.user.uid,
          actor: { actorUid: credential.user.uid, actorEmail: credential.user.email || email },
          description: 'Google se ha vinculado a una cuenta existente con contrasena.',
          metadata: { existingProvider: 'password', linkedProvider: 'google.com' },
        });
      } catch (linkError) {
        if (linkError?.code === 'auth/provider-already-linked') {
          googleLinked = true;
          clearPendingGoogleLink();
        } else {
          await recordAuthAudit('auth.provider_link_failed', {
            entityId: credential.user.uid,
            actor: { actorUid: credential.user.uid, actorEmail: credential.user.email || email },
            severity: 'warning',
            description: 'No se pudo vincular Google a la cuenta existente.',
            metadata: { existingProvider: 'password', linkedProvider: 'google.com' },
            error: linkError,
          });
          await signOut(firebaseAuth);
          return { error: mapFirebaseError(linkError) };
        }
      }
    }
    const usuario = await getUsuarioActual();

    if (!usuario) {
      await recordAuthAudit('auth.login_blocked_missing_profile', {
        entityId: credential.user.uid,
        actor: { actorUid: credential.user.uid, actorEmail: credential.user.email || email },
        severity: 'high',
        description: 'Inicio de sesion bloqueado porque no existe perfil Firestore.',
        metadata: { provider: 'password', email },
      });
      await signOut(firebaseAuth);
      return { error: authError('No existe perfil de usuario en Firestore.') };
    }

    if (!usuario.activo) {
      await recordAuthAudit('auth.login_blocked_inactive_user', {
        entityId: credential.user.uid,
        actor: {
          actorUid: credential.user.uid,
          actorEmail: credential.user.email || email,
          actorRole: usuario.rol || usuario.role || '',
        },
        severity: 'high',
        description: 'Inicio de sesion bloqueado porque la cuenta esta desactivada.',
        metadata: { provider: 'password', role: usuario.rol || usuario.role || '' },
      });
      await signOut(firebaseAuth);
      return { error: authError('Tu cuenta esta desactivada. Contacta con soporte.') };
    }

    await recordAuthAudit('auth.login_success', {
      entityId: credential.user.uid,
      actor: {
        actorUid: credential.user.uid,
        actorEmail: credential.user.email || email,
        actorRole: usuario.rol || usuario.role || '',
      },
      description: 'Inicio de sesion correcto.',
      metadata: {
        provider: 'password',
        role: usuario.rol || usuario.role || '',
        googleLinked,
      },
    });
    return { data: credential, usuario, googleLinked };
  } catch (error) {
    await recordAuthAudit('auth.login_failed', {
      actor: { actorEmail: email },
      severity: 'warning',
      description: 'Intento de inicio de sesion fallido.',
      metadata: { provider: 'password', email },
      error,
    });
    return { error: mapFirebaseError(error) };
  }
}

export async function loginWithGoogle(roleForNewAccount = '') {
  try {
    const requestedRole = validRole(roleForNewAccount);
    rememberGoogleSignupRole(requestedRole);
    clearPendingGoogleLink();
    const credential = await signInWithPopup(firebaseAuth, googleProvider);
    const usuario = await getUsuarioActual();

    if (usuario && !usuario.activo) {
      await recordAuthAudit('auth.google_login_blocked_inactive_user', {
        entityId: credential.user.uid,
        actor: {
          actorUid: credential.user.uid,
          actorEmail: credential.user.email || '',
          actorRole: usuario?.rol || usuario?.role || '',
        },
        severity: 'high',
        description: 'Login con Google bloqueado porque la cuenta esta desactivada.',
        metadata: { provider: 'google' },
      });
      await signOut(firebaseAuth);
      return { error: authError('Tu cuenta esta desactivada. Contacta con soporte.') };
    }

    const completion = await getGoogleAccountCompletion();
    if (completion.error) return completion;
    const requiresAccountCompletion = completion.data.requiresAccountCompletion;

    if (!requiresAccountCompletion && !completion.data.complete) {
      await recordAuthAudit('auth.google_login_blocked_invalid_role', {
        entityId: credential.user.uid,
        actor: { actorUid: credential.user.uid, actorEmail: credential.user.email || '' },
        severity: 'high',
        description: 'Login con Google bloqueado porque el perfil existente no tiene un rol valido.',
        metadata: { provider: 'google', completionReason: completion.data.reason },
      });
      await signOut(firebaseAuth);
      return { error: authError('Tu cuenta no tiene un rol valido. Contacta con soporte.', 'auth/invalid-account-role') };
    }

    if (!requiresAccountCompletion && !usuario) {
      await recordAuthAudit('auth.google_login_blocked_missing_profile', {
        entityId: credential.user.uid,
        actor: { actorUid: credential.user.uid, actorEmail: credential.user.email || '' },
        severity: 'high',
        description: 'Login con Google bloqueado porque no existe el perfil principal en Firestore.',
        metadata: { provider: 'google', resolvedRole: completion.data.role },
      });
      await signOut(firebaseAuth);
      return { error: authError('No existe el perfil principal de esta cuenta. Contacta con soporte.', 'auth/missing-user-profile') };
    }

    if (!requiresAccountCompletion) clearRememberedGoogleSignupRole();

    await recordAuthAudit('auth.google_login_success', {
      entityId: credential.user.uid,
      actor: {
        actorUid: credential.user.uid,
        actorEmail: credential.user.email || '',
        actorRole: usuario?.rol || usuario?.role || requestedRole,
      },
      description: 'Inicio de sesion con Google correcto.',
      metadata: {
        provider: 'google',
        role: usuario?.rol || usuario?.role || requestedRole,
        requiresAccountCompletion,
        scopes: ['openid', 'email', 'profile'],
      },
    });
    return {
      data: credential,
      usuario,
      requiresAccountCompletion,
      suggestedRole: completion.data.role || requestedRole,
    };
  } catch (error) {
    if (error?.code === 'auth/account-exists-with-different-credential') {
      const credential = GoogleAuthProvider.credentialFromError(error);
      const email = normalizeEmail(error?.customData?.email || error?.email);
      if (credential) {
        pendingGoogleCredential = credential;
        pendingGoogleEmail = email;
        pendingGoogleStartedAt = Date.now();
      }
      await recordAuthAudit('auth.google_link_pending', {
        actor: { actorEmail: email },
        severity: 'info',
        description: 'Google coincide con una cuenta existente y requiere verificar su acceso actual.',
        metadata: { provider: 'google', existingAccountEmailKnown: Boolean(email) },
      });
      return {
        error: {
          ...mapFirebaseError(error),
          email,
          requiresPasswordSignIn: Boolean(credential),
          message: 'Ese correo ya tiene una cuenta. Introduce su contrasena para verificarla y vincular Google sin crear un usuario duplicado.',
        },
      };
    }
    await recordAuthAudit('auth.google_login_failed', {
      severity: 'warning',
      description: 'Intento de inicio de sesion con Google fallido.',
      metadata: { provider: 'google', requestedRole: roleForNewAccount || '' },
      error,
    });
    return { error: mapFirebaseError(error) };
  }
}

export async function register({
  email,
  password,
  nombre,
  apellidos,
  telefono,
  rol,
  alumno_invitacion_token,
  alumnoInvitacionToken,
  foto_url,
  direccion,
  ciudad,
  codigo_postal,
  zona,
  materias,
  niveles_educativos,
  experiencia_anios,
  disponibilidad_resumen,
  bio,
}) {
  const emailClean = normalizeEmail(email);
  const nombreClean = normalizeText(nombre);
  const apellidosClean = normalizeText(apellidos);
  const telefonoClean = normalizeText(telefono);
  const role = normalizeText(rol);
  const invitationToken = normalizeText(alumno_invitacion_token || alumnoInvitacionToken);
  const fotoUrlClean = normalizeText(foto_url);
  const direccionClean = normalizeText(direccion);
  const ciudadClean = normalizeText(ciudad);
  const codigoPostalClean = normalizeText(codigo_postal);
  const zonaClean = normalizeText(zona);
  const disponibilidadClean = normalizeText(disponibilidad_resumen);
  const bioClean = normalizeText(bio);
  const materiasList = Array.isArray(materias)
    ? materias.map(normalizeText).filter(Boolean)
    : normalizeText(materias).split(',').map((item) => item.trim()).filter(Boolean);
  const nivelesList = Array.isArray(niveles_educativos)
    ? niveles_educativos.map(normalizeText).filter(Boolean)
    : normalizeText(niveles_educativos).split(',').map((item) => item.trim()).filter(Boolean);
  const experienciaNum = Number(experiencia_anios || 0);
  const hasExperience = normalizeText(experiencia_anios) !== '' && Number.isFinite(experienciaNum);

  if (!emailClean || !password || !nombreClean || !apellidosClean || !role) {
    return { error: authError('Todos los campos obligatorios deben completarse.') };
  }

  if (password.length < 8) {
    return { error: authError('La contrasena debe tener al menos 8 caracteres.') };
  }

  if (!['profesor', 'familia', 'alumno'].includes(role)) {
    return { error: authError('Rol no valido.') };
  }

  const teacherProfileComplete = role === 'profesor' && [
    telefonoClean,
    fotoUrlClean,
    direccionClean,
    ciudadClean,
    codigoPostalClean,
    zonaClean,
    materiasList.length,
    nivelesList.length,
    hasExperience,
    disponibilidadClean,
    bioClean.length >= 40,
  ].every(Boolean);

  let createdUser = null;
  try {
    let studentInvitation = null;

    if (role === 'alumno') {
      if (!invitationToken) {
        return { error: authError('El acceso de alumno requiere una invitacion valida de una familia.') };
      }

      const invitationSnap = await getDoc(doc(firebaseDb, 'alumno_invitaciones', invitationToken));
      studentInvitation = invitationSnap.exists()
        ? { id: invitationSnap.id, ...invitationSnap.data() }
        : null;

      if (!studentInvitation || (studentInvitation.status || studentInvitation.estado) !== 'pendiente') {
        return { error: authError('La invitacion no existe o ya fue utilizada.') };
      }

      const expiresAt = studentInvitation.expiraAt || studentInvitation.expira_at;
      if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
        return { error: authError('La invitacion ha caducado. Pide una nueva a tu familia.') };
      }
    }

    const credential = await createUserWithEmailAndPassword(firebaseAuth, emailClean, password);
    const { user } = credential;
    createdUser = user;

    await updateProfile(user, {
      displayName: `${nombreClean} ${apellidosClean}`.trim(),
    });

    const batch = writeBatch(firebaseDb);
    batch.set(doc(firebaseDb, 'users', user.uid), normalizeAuthCreate('users', {
      email: emailClean,
      nombre: nombreClean,
      apellidos: apellidosClean,
      telefono: telefonoClean || null,
      role,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));

    const profilePayload = {
      userUid: user.uid,
      email: emailClean,
      nombre: nombreClean,
      apellidos: apellidosClean,
      telefono: telefonoClean || null,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (role === 'familia') {
      batch.set(doc(firebaseDb, 'familias', user.uid), normalizeAuthCreate('familias', {
        ...profilePayload,
        status: 'activo',
      }));
    }

    if (role === 'profesor') {
      batch.set(doc(firebaseDb, 'profesores', user.uid), normalizeAuthCreate('profesores', {
        ...profilePayload,
        perfil_completo: false,
        profileComplete: false,
        estado_verificacion: 'pendiente_perfil',
        verificationStatus: 'pendiente_perfil',
        status: 'pendiente_perfil',
      }));
    }

    if (role === 'alumno') {
      batch.update(doc(firebaseDb, 'alumnos', studentInvitation.studentId || studentInvitation.alumno_id), {
        studentUid: user.uid,
        usuario_id: user.uid,
        updatedAt: serverTimestamp(),
        updated_at: new Date().toISOString(),
      });
      batch.update(doc(firebaseDb, 'alumno_invitaciones', studentInvitation.id), {
        status: 'usada',
        estado: 'usada',
        usedByUid: user.uid,
        usedAt: serverTimestamp(),
      });
    }

    await batch.commit();

    let storedTeacherProfileComplete = false;
    if (role === 'profesor' && teacherProfileComplete) {
      try {
        await setDoc(doc(firebaseDb, 'profesores', user.uid), {
          foto_url: fotoUrlClean,
          photoUrl: fotoUrlClean,
          direccion: direccionClean,
          address: direccionClean,
          ciudad: ciudadClean,
          city: ciudadClean,
          codigo_postal: codigoPostalClean,
          postalCode: codigoPostalClean,
          zona: zonaClean,
          zone: zonaClean,
          materias: materiasList,
          subjects: materiasList,
          niveles_educativos: nivelesList,
          levels: nivelesList,
          experiencia_anios: experienciaNum,
          experienceYears: experienciaNum,
          disponibilidad_resumen: disponibilidadClean,
          availabilitySummary: disponibilidadClean,
          bio: bioClean,
          perfil_completo: true,
          profileComplete: true,
          estado_verificacion: 'pendiente',
          verificationStatus: 'pendiente',
          status: 'pendiente_revision',
          updatedAt: serverTimestamp(),
        }, { merge: true });
        storedTeacherProfileComplete = true;
      } catch (profileError) {
        console.warn('La cuenta se creo, pero el perfil profesional ampliado queda pendiente.', profileError);
      }
    }

    let emailVerificationSent = false;
    try {
      await sendEmailVerification(user, {
        url: `${getAuthActionOrigin()}/pages/login.html`,
      });
      emailVerificationSent = true;
    } catch (verificationError) {
      console.warn('No se pudo enviar el email de verificacion en este momento.', verificationError);
    }

    await recordAuthAudit('auth.register_success', {
      entityId: user.uid,
      actor: {
        actorUid: user.uid,
        actorEmail: emailClean,
        actorRole: role,
      },
      description: `Registro de ${role} completado.`,
      metadata: {
        role,
        teacherProfileComplete: storedTeacherProfileComplete,
        invitationUsed: Boolean(studentInvitation),
        emailVerificationSent,
      },
      after: {
        uid: user.uid,
        email: emailClean,
        role,
        active: true,
      },
    });

    return { data: credential, usuario: await getUsuarioActual() };
  } catch (error) {
    await recordAuthAudit('auth.register_failed', {
      actor: { actorEmail: emailClean, actorRole: role },
      severity: 'warning',
      description: 'Intento de registro fallido.',
      metadata: { role, email: emailClean },
      error,
    });
    if (createdUser) {
      try {
        await deleteUser(createdUser);
      } catch (cleanupError) {
        console.warn('No se pudo eliminar la identidad tras fallar el alta de perfil.', cleanupError);
      }
    }
    return { error: mapFirebaseError(error) };
  }
}

export async function logout(options = {}) {
  const triggeredByClick = typeof options?.preventDefault === 'function' && 'currentTarget' in options;
  const trigger = triggeredByClick && options.currentTarget?.nodeType === 1 ? options.currentTarget : null;
  const logoutOptions = triggeredByClick ? {} : (options || {});
  if (triggeredByClick) options.preventDefault();
  if (trigger?.dataset.logoutPending === 'true') return;

  const wasDisabled = Boolean(trigger?.disabled);
  if (trigger) {
    trigger.dataset.logoutPending = 'true';
    trigger.disabled = true;
    trigger.setAttribute('aria-busy', 'true');
  }

  const user = firebaseAuth.currentUser;
  try {
    await Promise.race([
      recordAuthAudit('auth.logout', {
        entityId: user?.uid || 'current_user',
        actor: { actorUid: user?.uid || '', actorEmail: user?.email || '' },
        description: 'Cierre de sesion.',
      }),
      new Promise((resolve) => window.setTimeout(resolve, LOGOUT_AUDIT_TIMEOUT_MS)),
    ]);
    await signOut(firebaseAuth);
  } catch (error) {
    if (trigger) {
      delete trigger.dataset.logoutPending;
      trigger.disabled = wasDisabled;
      trigger.removeAttribute('aria-busy');
    }
    throw error;
  }

  if (logoutOptions.redirect === false) {
    if (trigger) {
      delete trigger.dataset.logoutPending;
      trigger.disabled = wasDisabled;
      trigger.removeAttribute('aria-busy');
    }
    return;
  }
  window.location.replace(logoutOptions.redirectTo || '/pages/login.html?logout=1');
}

export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(firebaseAuth, normalizeEmail(email), {
      url: `${getAuthActionOrigin()}/pages/reset-password.html`,
    });
    await recordAuthAudit('auth.password_reset_requested', {
      actor: { actorEmail: normalizeEmail(email) },
      severity: 'info',
      description: 'Solicitud de recuperacion de contrasena.',
      metadata: { email: normalizeEmail(email) },
    });
    return { error: null };
  } catch (error) {
    await recordAuthAudit('auth.password_reset_request_failed', {
      actor: { actorEmail: normalizeEmail(email) },
      severity: 'warning',
      description: 'Solicitud de recuperacion de contrasena fallida.',
      metadata: { email: normalizeEmail(email) },
      error,
    });
    return { error: mapFirebaseError(error) };
  }
}

export function isPasswordSetupLink(emailLink = window.location.href) {
  return isSignInWithEmailLink(firebaseAuth, String(emailLink || ''));
}

export async function requestPasswordSetupLink(emailRaw, options = {}) {
  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email)) {
    return { error: authError('Introduce un correo electronico valido.', 'auth/invalid-email') };
  }

  try {
    const assistedLeadId = normalizeText(options.assistedLeadId).slice(0, 180);
    const setupUrl = new URL('/pages/crear-contrasena.html', getAuthActionOrigin());
    if (assistedLeadId) setupUrl.searchParams.set('solicitud_asistida', assistedLeadId);
    await sendSignInLinkToEmail(firebaseAuth, email, {
      url: setupUrl.toString(),
      handleCodeInApp: true,
      linkDomain: 'clasesde10.com',
    });
    rememberPasswordSetupEmail(email);
    await recordAuthAudit('auth.password_setup_link_requested', {
      actor: { actorEmail: email },
      severity: 'info',
      description: 'Solicitud de enlace seguro para activar el acceso con contrasena.',
      metadata: { email, method: 'emailLink', assistedLeadId },
    });
    return { error: null };
  } catch (error) {
    await recordAuthAudit('auth.password_setup_link_failed', {
      actor: { actorEmail: email },
      severity: 'warning',
      description: 'No se pudo enviar el enlace para activar el acceso con contrasena.',
      metadata: { email, method: 'emailLink', assistedLeadId },
      error,
    });
    return { error: mapFirebaseError(error) };
  }
}

export async function requestAssistedFamilyActivation(emailRaw, leadIdRaw) {
  const leadId = normalizeText(leadIdRaw).slice(0, 180);
  if (!leadId) {
    return { error: authError('No se pudo identificar el formulario enviado.', 'auth/assisted-request-not-found') };
  }
  return requestPasswordSetupLink(emailRaw, { assistedLeadId: leadId });
}

export async function completePasswordSetupLink(emailRaw, emailLink = window.location.href) {
  const email = normalizeEmail(emailRaw);
  const link = String(emailLink || '');
  if (!isValidEmail(email)) {
    return { error: authError('Confirma el correo al que se envio el enlace.', 'auth/invalid-email') };
  }
  if (!isPasswordSetupLink(link)) {
    return { error: authError('El enlace no es valido o ya no se puede utilizar.', 'auth/invalid-action-code') };
  }

  let credential = null;
  let hadProfileBeforeAssistedActivation = false;
  try {
    const currentUser = firebaseAuth.currentUser;
    const currentEmail = normalizeEmail(currentUser?.email);

    if (currentUser && currentEmail === email) {
      const emailCredential = EmailAuthProvider.credentialWithLink(email, link);
      const hasPasswordProvider = currentUser.providerData?.some((provider) => provider.providerId === 'password');
      credential = hasPasswordProvider
        ? await reauthenticateWithCredential(currentUser, emailCredential)
        : await linkWithCredential(currentUser, emailCredential);
    } else {
      if (currentUser) await signOut(firebaseAuth);
      credential = await signInWithEmailLink(firebaseAuth, email, link);
    }

    let usuario = await getUsuarioActual();
    hadProfileBeforeAssistedActivation = Boolean(usuario);
    const assistedLeadId = assistedLeadIdFromLink(link);
    if (!usuario && assistedLeadId) {
      usuario = await createAssistedFamilyAccount(credential.user, assistedLeadId);
    }
    if (!usuario) {
      const isNewUser = Boolean(getAdditionalUserInfo(credential)?.isNewUser);
      if (isNewUser) {
        await deleteUser(credential.user).catch(() => signOut(firebaseAuth));
      } else {
        await signOut(firebaseAuth);
      }
      clearPasswordSetupEmail();
      return {
        error: authError(
          'No se pudo asociar el enlace a una cuenta activa. Crea una cuenta o contacta con soporte.',
          'auth/missing-profile',
        ),
      };
    }
    if (!usuario.activo) {
      await signOut(firebaseAuth);
      clearPasswordSetupEmail();
      return { error: authError('Tu cuenta esta desactivada. Contacta con soporte.', 'auth/user-disabled') };
    }

    clearPasswordSetupEmail();
    await recordAuthAudit('auth.password_setup_email_verified', {
      entityId: credential.user.uid,
      actor: {
        actorUid: credential.user.uid,
        actorEmail: credential.user.email || email,
        actorRole: usuario.rol || usuario.role || '',
      },
      description: 'Correo verificado para activar el acceso con contrasena.',
      metadata: {
        method: 'emailLink',
        role: usuario.rol || usuario.role || '',
        assistedLeadId: assistedLeadId || '',
      },
    });
    return { data: credential, usuario, error: null };
  } catch (error) {
    if (credential?.user && !hadProfileBeforeAssistedActivation) {
      const isNewUser = Boolean(getAdditionalUserInfo(credential)?.isNewUser);
      if (isNewUser) await deleteUser(credential.user).catch(() => signOut(firebaseAuth));
    }
    await recordAuthAudit('auth.password_setup_verification_failed', {
      actor: { actorEmail: email },
      severity: 'warning',
      description: 'No se pudo verificar el enlace para activar la contrasena.',
      metadata: { method: 'emailLink' },
      error,
    });
    return { error: mapFirebaseError(error) };
  }
}

export async function setPasswordAfterEmailVerification(passwordRaw) {
  const password = String(passwordRaw || '');
  const user = firebaseAuth.currentUser;
  if (!user) {
    return { error: authError('Vuelve a abrir el enlace de verificacion para continuar.', 'auth/requires-recent-login') };
  }
  if (password.length < 8 || password.length > 128) {
    return { error: authError('La contrasena debe tener entre 8 y 128 caracteres.', 'auth/weak-password') };
  }

  try {
    await updatePassword(user, password);
    await reload(user);
    let usuario = await getUsuarioActual();
    if (usuario?.passwordSetupRequired) {
      await setDoc(doc(firebaseDb, 'users', user.uid), {
        passwordSetupRequired: false,
        passwordSetupCompletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      usuario = await getUsuarioActual();
    }
    await recordAuthAudit('auth.password_provider_enabled', {
      entityId: user.uid,
      actor: {
        actorUid: user.uid,
        actorEmail: user.email || '',
        actorRole: usuario?.rol || usuario?.role || '',
      },
      description: 'Acceso con contrasena activado tras verificar el correo.',
      metadata: {
        existingProviders: user.providerData?.map((provider) => provider.providerId) || [],
        emailVerified: Boolean(user.emailVerified),
      },
    });
    return { data: { user }, usuario, error: null };
  } catch (error) {
    await recordAuthAudit('auth.password_provider_enable_failed', {
      entityId: user.uid,
      actor: { actorUid: user.uid, actorEmail: user.email || '' },
      severity: 'warning',
      description: 'No se pudo activar el acceso con contrasena.',
      error,
    });
    return { error: mapFirebaseError(error) };
  }
}

export async function verifyPasswordResetCode(oobCode) {
  try {
    const email = await firebaseVerifyPasswordResetCode(firebaseAuth, String(oobCode || '').trim());
    return { data: { email }, error: null };
  } catch (error) {
    return { data: null, error: mapFirebaseError(error) };
  }
}

export async function confirmPasswordResetCode(oobCode, password) {
  try {
    await firebaseConfirmPasswordReset(firebaseAuth, String(oobCode || '').trim(), password);
    await recordAuthAudit('auth.password_reset_confirmed', {
      severity: 'info',
      description: 'Cambio de contrasena confirmado con codigo de recuperacion.',
      metadata: { oobCodePresent: Boolean(oobCode), passwordLength: password?.length || 0 },
    });
    return { error: null };
  } catch (error) {
    await recordAuthAudit('auth.password_reset_confirm_failed', {
      severity: 'warning',
      description: 'Cambio de contrasena fallido.',
      metadata: { oobCodePresent: Boolean(oobCode) },
      error,
    });
    return { error: mapFirebaseError(error) };
  }
}

export function redirectByRole(rol) {
  const ruta = ROLES_RUTAS[rol];
  if (ruta) window.location.href = ruta;
}

export function onAuthChange(callback) {
  return onAuthStateChanged(firebaseAuth, async (user) => {
    callback(user ? 'SIGNED_IN' : 'SIGNED_OUT', user ? { user } : null);
  });
}
