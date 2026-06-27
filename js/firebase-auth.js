/**
 * ClasesDe10 - Firebase Auth transition layer.
 *
 * This module is intentionally not wired into production pages yet. It mirrors
 * the public API of js/auth.js so login/register screens can be switched from
 * Supabase to Firebase once Authentication is enabled and the first admin user
 * has been bootstrapped.
 */

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  confirmPasswordReset as firebaseConfirmPasswordReset,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  verifyPasswordResetCode as firebaseVerifyPasswordResetCode,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { firebaseAuth, firebaseDb } from './firebase-client.js?v=20260627-domain-auth';

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

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || '').trim();
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
    'auth/email-already-in-use': 'Ya existe una cuenta con este email.',
    'auth/invalid-credential': 'Email o contrasena incorrectos.',
    'auth/invalid-email': 'Introduce un email valido.',
    'auth/missing-password': 'Introduce la contrasena.',
    'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
    'auth/user-disabled': 'Tu cuenta esta desactivada. Contacta con soporte.',
    'auth/user-not-found': 'Email o contrasena incorrectos.',
    'auth/weak-password': 'La contrasena debe tener al menos 8 caracteres.',
    'auth/wrong-password': 'Email o contrasena incorrectos.',
    'auth/expired-action-code': 'El enlace ha caducado. Solicita uno nuevo.',
    'auth/invalid-action-code': 'El enlace no es valido o ya fue utilizado.',
  };

  if (!error) return null;
  return {
    ...error,
    message: messages[error.code] || error.message || 'No se pudo completar la operacion.',
  };
}

function mapProfile(uid, data) {
  if (!data) return null;
  const legacy = data.legacy || {};
  const appUserId = legacy.supabaseUserId || data.supabaseUserId || uid;

  return {
    id: appUserId,
    auth_id: legacy.supabaseAuthId || uid,
    uid,
    firebase_uid: uid,
    email: data.email || '',
    nombre: data.nombre || '',
    apellidos: data.apellidos || '',
    telefono: data.telefono || '',
    rol: data.role,
    role: data.role,
    activo: data.active !== false,
    active: data.active !== false,
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

export async function requireAuth(rolesPermitidos = []) {
  const usuario = await getUsuarioActual();

  if (!usuario) {
    window.location.href = '/pages/login.html';
    return new Promise(() => {});
  }

  if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(usuario.rol)) {
    const rutaPropia = ROLES_RUTAS[usuario.rol];
    if (rutaPropia) window.location.href = rutaPropia;
    return new Promise(() => {});
  }

  return usuario;
}

export async function login(emailRaw, passwordRaw) {
  const email = normalizeEmail(emailRaw);
  const password = passwordRaw || '';

  if (!email || !password) {
    return { error: authError('Email y contrasena son obligatorios.') };
  }

  try {
    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    const usuario = await getUsuarioActual();

    if (!usuario) {
      await signOut(firebaseAuth);
      return { error: authError('No existe perfil de usuario en Firestore.') };
    }

    if (!usuario.activo) {
      await signOut(firebaseAuth);
      return { error: authError('Tu cuenta esta desactivada. Contacta con soporte.') };
    }

    return { data: credential, usuario };
  } catch (error) {
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
}) {
  const emailClean = normalizeEmail(email);
  const nombreClean = normalizeText(nombre);
  const apellidosClean = normalizeText(apellidos);
  const telefonoClean = normalizeText(telefono);
  const role = normalizeText(rol);
  const invitationToken = normalizeText(alumno_invitacion_token || alumnoInvitacionToken);

  if (!emailClean || !password || !nombreClean || !apellidosClean || !role) {
    return { error: authError('Todos los campos obligatorios deben completarse.') };
  }

  if (password.length < 8) {
    return { error: authError('La contrasena debe tener al menos 8 caracteres.') };
  }

  if (!['profesor', 'familia', 'alumno'].includes(role)) {
    return { error: authError('Rol no valido.') };
  }

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

    await updateProfile(user, {
      displayName: `${nombreClean} ${apellidosClean}`.trim(),
    });

    await setDoc(doc(firebaseDb, 'users', user.uid), {
      email: emailClean,
      nombre: nombreClean,
      apellidos: apellidosClean,
      telefono: telefonoClean || null,
      role,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

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
      await setDoc(doc(firebaseDb, 'familias', user.uid), {
        ...profilePayload,
        status: 'activo',
      }, { merge: true });
    }

    if (role === 'profesor') {
      await setDoc(doc(firebaseDb, 'profesores', user.uid), {
        ...profilePayload,
        status: 'pendiente_revision',
      }, { merge: true });
    }

    if (role === 'alumno') {
      await updateDoc(doc(firebaseDb, 'alumnos', studentInvitation.studentId || studentInvitation.alumno_id), {
        studentUid: user.uid,
        usuario_id: user.uid,
        updatedAt: serverTimestamp(),
        updated_at: new Date().toISOString(),
      });
      await updateDoc(doc(firebaseDb, 'alumno_invitaciones', studentInvitation.id), {
        status: 'usada',
        estado: 'usada',
        usedByUid: user.uid,
        usedAt: serverTimestamp(),
      });
    }

    try {
      await sendEmailVerification(user, {
        url: `${getAuthActionOrigin()}/pages/login.html`,
      });
    } catch (verificationError) {
      console.warn('No se pudo enviar el email de verificacion en este momento.', verificationError);
    }

    return { data: credential, usuario: await getUsuarioActual() };
  } catch (error) {
    return { error: mapFirebaseError(error) };
  }
}

export async function logout() {
  await signOut(firebaseAuth);
  window.location.href = '/';
}

export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(firebaseAuth, normalizeEmail(email), {
      url: `${getAuthActionOrigin()}/pages/reset-password.html`,
    });
    return { error: null };
  } catch (error) {
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
    return { error: null };
  } catch (error) {
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
