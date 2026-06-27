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
  GoogleAuthProvider,
  onAuthStateChanged,
  confirmPasswordReset as firebaseConfirmPasswordReset,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
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

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || '').trim();
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
  };

  if (!error) return null;
  return {
    ...error,
    message: messages[error.code] || error.message || 'No se pudo completar la operacion.',
  };
}

async function createMinimalRoleProfile(user, role) {
  const emailClean = normalizeEmail(user.email);
  const providerProfile = user.providerData?.find((provider) => provider.providerId === 'google.com') || {};
  const names = splitDisplayName(user.displayName || providerProfile.displayName, emailClean);

  const basePayload = {
    email: emailClean,
    nombre: names.nombre,
    apellidos: names.apellidos,
    telefono: null,
    role,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(firebaseDb, 'users', user.uid), basePayload, { merge: true });

  const profilePayload = {
    userUid: user.uid,
    email: emailClean,
    nombre: names.nombre,
    apellidos: names.apellidos,
    telefono: null,
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
      perfil_completo: false,
      profileComplete: false,
      estado_verificacion: 'pendiente_perfil',
      verificationStatus: 'pendiente_perfil',
      status: 'pendiente_perfil',
    }, { merge: true });
  }

  return getUsuarioActual();
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

export async function loginWithGoogle(roleForNewAccount = '') {
  try {
    const credential = await signInWithPopup(firebaseAuth, googleProvider);
    let usuario = await getUsuarioActual();

    if (!usuario) {
      const role = normalizeText(roleForNewAccount);
      if (!['profesor', 'familia'].includes(role)) {
        await signOut(firebaseAuth);
        return {
          error: authError('No existe perfil para esta cuenta. Entra en Crear cuenta y elige familia o profesor antes de continuar con Google.'),
        };
      }
      usuario = await createMinimalRoleProfile(credential.user, role);
    }

    if (!usuario?.activo) {
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
  foto_url,
  direccion,
  ciudad,
  codigo_postal,
  zona,
  materias,
  niveles_educativos,
  experiencia_anios,
  tarifa_hora,
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
  const tarifaNum = Number(tarifa_hora || 0);
  const hasExperience = normalizeText(experiencia_anios) !== '' && Number.isFinite(experienciaNum);
  const hasHourlyRate = normalizeText(tarifa_hora) !== '' && Number.isFinite(tarifaNum) && tarifaNum > 0;

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
    hasHourlyRate,
    disponibilidadClean,
    bioClean.length >= 40,
  ].every(Boolean);

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
        ...(fotoUrlClean ? { foto_url: fotoUrlClean, photoUrl: fotoUrlClean } : {}),
        ...(direccionClean ? { direccion: direccionClean, address: direccionClean } : {}),
        ...(ciudadClean ? { ciudad: ciudadClean, city: ciudadClean } : {}),
        ...(codigoPostalClean ? { codigo_postal: codigoPostalClean, postalCode: codigoPostalClean } : {}),
        ...(zonaClean ? { zona: zonaClean, zone: zonaClean } : {}),
        ...(materiasList.length ? { materias: materiasList, subjects: materiasList } : {}),
        ...(nivelesList.length ? { niveles_educativos: nivelesList, levels: nivelesList } : {}),
        ...(hasExperience ? { experiencia_anios: experienciaNum, experienceYears: experienciaNum } : {}),
        ...(hasHourlyRate ? { tarifa_hora: tarifaNum, hourlyRate: tarifaNum } : {}),
        ...(disponibilidadClean ? { disponibilidad_resumen: disponibilidadClean, availabilitySummary: disponibilidadClean } : {}),
        ...(bioClean ? { bio: bioClean } : {}),
        perfil_completo: teacherProfileComplete,
        profileComplete: teacherProfileComplete,
        estado_verificacion: teacherProfileComplete ? 'pendiente' : 'pendiente_perfil',
        verificationStatus: teacherProfileComplete ? 'pendiente' : 'pendiente_perfil',
        status: teacherProfileComplete ? 'pendiente_revision' : 'pendiente_perfil',
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
