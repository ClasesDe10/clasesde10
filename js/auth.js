/**
 * ClasesDe10 — Auth Module
 * Gestiona login, registro, logout y protección de rutas.
 *
 * IMPORTANTE: No aplicar sanitize() a email ni a nombre/apellidos antes de
 * enviar a la BD. Los datos deben guardarse en texto plano. La sanitización
 * solo debe aplicarse en el momento de RENDERIZAR en HTML.
 */

import db from './supabase-client.js';

// ─── CONSTANTES ────────────────────────────────────────────────
const ROLES_RUTAS = {
  admin:    '/pages/dashboard/admin.html',
  profesor: '/pages/dashboard/profesor.html',
  familia:  '/pages/dashboard/familia.html',
  alumno:   '/pages/dashboard/alumno.html',
};

// ─── OBTENER SESIÓN ACTUAL ──────────────────────────────────────
export async function getSession() {
  const { data: { session } } = await db.auth.getSession();
  return session;
}

// ─── OBTENER USUARIO CON ROL ────────────────────────────────────
export async function getUsuarioActual() {
  const session = await getSession();
  if (!session) return null;

  const { data, error } = await db
    .from('usuarios')
    .select('*')
    .eq('auth_id', session.user.id)
    .single();

  if (error) return null;
  return data;
}

// ─── PROTEGER RUTA ──────────────────────────────────────────────
export async function requireAuth(rolesPermitidos = []) {
  const usuario = await getUsuarioActual();

  if (!usuario) {
    window.location.href = '/pages/login.html';
    return null;
  }

  if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(usuario.rol)) {
    const rutaPropia = ROLES_RUTAS[usuario.rol];
    if (rutaPropia) window.location.href = rutaPropia;
    return null;
  }

  return usuario;
}

// ─── LOGIN ──────────────────────────────────────────────────────
export async function login(emailRaw, passwordRaw) {
  // Solo normalizar email — NO sanitizar con entidades HTML
  const email    = emailRaw.trim().toLowerCase();
  const password = passwordRaw;

  if (!email || !password) {
    return { error: { message: 'Email y contraseña son obligatorios.' } };
  }

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) return { error };

  const usuario = await getUsuarioActual();
  if (!usuario) return { error: { message: 'Error al cargar perfil.' } };
  if (!usuario.activo) {
    await db.auth.signOut();
    return { error: { message: 'Tu cuenta está desactivada. Contacta con soporte.' } };
  }

  return { data, usuario };
}

// ─── REGISTRO ───────────────────────────────────────────────────
export async function register({ email, password, nombre, apellidos, telefono, rol }) {
  // Normalizar sin sanitizar — los datos se guardan en texto plano en la BD
  const emailClean    = email.trim().toLowerCase();
  const nombreClean   = nombre.trim();
  const apellidosClean = apellidos.trim();
  const telefonoClean = (telefono || '').trim();

  if (!emailClean || !password || !nombreClean || !apellidosClean || !rol) {
    return { error: { message: 'Todos los campos obligatorios deben completarse.' } };
  }

  if (password.length < 8) {
    return { error: { message: 'La contraseña debe tener al menos 8 caracteres.' } };
  }

  if (!['profesor', 'familia'].includes(rol)) {
    return { error: { message: 'Rol no válido.' } };
  }

  // El trigger handle_new_auth_user (migración 003) creará automáticamente:
  // - Registro en tabla `usuarios`
  // - Registro en tabla `profesores` (si rol = 'profesor')
  // - Registro en tabla `familias` (si rol = 'familia')
  const { data, error } = await db.auth.signUp({
    email: emailClean,
    password,
    options: {
      data: {
        nombre:    nombreClean,
        apellidos: apellidosClean,
        telefono:  telefonoClean,
        rol,
      },
      emailRedirectTo: `${location.origin}/pages/login.html`,
    },
  });

  return { data, error };
}

// ─── LOGOUT ─────────────────────────────────────────────────────
export async function logout() {
  await db.auth.signOut();
  window.location.href = '/';
}

// ─── RESET PASSWORD ──────────────────────────────────────────────
export async function resetPassword(email) {
  const { error } = await db.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${location.origin}/pages/reset-password.html`,
  });
  return { error };
}

// ─── REDIRIGIR SEGÚN ROL TRAS LOGIN ─────────────────────────────
export function redirectByRole(rol) {
  const ruta = ROLES_RUTAS[rol];
  if (ruta) window.location.href = ruta;
}

// ─── ESCUCHAR CAMBIOS DE AUTH ────────────────────────────────────
export function onAuthChange(callback) {
  return db.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}
