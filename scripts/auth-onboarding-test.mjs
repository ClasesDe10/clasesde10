#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeAccountRole,
  resolveGoogleAccountCompletion,
} from '../js/auth-onboarding.js';

const read = (file) => fs.readFileSync(file, 'utf8');
const firebaseAuth = read('js/firebase-auth.js');
const auth = read('js/auth.js');
const adapter = read('js/adapters/firebase-auth-adapter.js');
const provider = read('js/auth-provider.js');
const login = read('pages/login.html');
const register = read('pages/registro.html');
const completion = read('termina-tu-cuenta.html');
const passwordSetup = read('pages/crear-contrasena.html');
const hosting = JSON.parse(read('firebase.json'));

assert.equal(normalizeAccountRole(' Admin '), 'admin');
assert.equal(normalizeAccountRole('administrador'), 'admin');
assert.deepEqual(resolveGoogleAccountCompletion({
  authEmail: 'admin@example.com',
  storedRole: 'admin',
  userExists: true,
}), {
  role: 'admin',
  telefono: '',
  complete: true,
  requiresAccountCompletion: false,
  eligibleForCompletion: false,
  reason: 'role-exempt',
}, 'An admin role must never enter account completion.');
assert.equal(resolveGoogleAccountCompletion({
  authEmail: ' CONTACTO.CLASESDE10@GMAIL.COM ',
  userExists: false,
}).requiresAccountCompletion, false, 'The official admin identity must be exempt even while its profile is being resolved.');
assert.equal(resolveGoogleAccountCompletion({
  authEmail: 'student@example.com',
  storedRole: 'alumno',
  userExists: true,
}).requiresAccountCompletion, false, 'Invited students use their own provisioning flow.');
assert.equal(resolveGoogleAccountCompletion({
  authEmail: 'new-family@example.com',
  rememberedRole: 'familia',
}).requiresAccountCompletion, true, 'A new Google family account must complete its minimum data.');
assert.equal(resolveGoogleAccountCompletion({
  authEmail: 'family@example.com',
  storedRole: 'familia',
  userExists: true,
  profileExists: true,
  userPhone: '+34 600 000 000',
}).requiresAccountCompletion, false, 'A complete existing family account must go directly to its dashboard.');
assert.equal(resolveGoogleAccountCompletion({
  authEmail: 'teacher@example.com',
  storedRole: 'profesor',
  userExists: true,
  profileExists: true,
}).requiresAccountCompletion, true, 'A teacher without a valid phone still needs minimum completion.');
assert.deepEqual(resolveGoogleAccountCompletion({
  authEmail: 'legacy@example.com',
  storedRole: 'unknown-role',
  rememberedRole: 'familia',
  userExists: true,
}), {
  role: '',
  telefono: '',
  complete: false,
  requiresAccountCompletion: false,
  eligibleForCompletion: false,
  reason: 'invalid-existing-role',
}, 'An invalid existing role must not be silently converted through onboarding.');

assert.match(firebaseAuth, /googleProvider\.addScope\('https:\/\/www\.googleapis\.com\/auth\/userinfo\.email'\)/);
assert.match(firebaseAuth, /googleProvider\.addScope\('https:\/\/www\.googleapis\.com\/auth\/userinfo\.profile'\)/);
assert.doesNotMatch(firebaseAuth, /auth\/gmail\./, 'Authentication must not request mailbox access.');
assert.match(firebaseAuth, /requiresAccountCompletion/);
assert.match(firebaseAuth, /export async function getGoogleAccountCompletion/);
assert.match(firebaseAuth, /export async function completeGoogleAccount/);
assert.match(firebaseAuth, /completion\.data\.requiresAccountCompletion/);
assert.match(firebaseAuth, /isKnownAdminIdentity/);
assert.match(firebaseAuth, /GoogleAuthProvider\.credentialFromError\(error\)/, 'Pending Google credentials must be preserved for secure linking.');
assert.match(firebaseAuth, /await linkWithCredential\(credential\.user, googleLink\.credential\)/, 'Password reauthentication must link the pending Google credential.');
assert.match(firebaseAuth, /sendSignInLinkToEmail/, 'Google-only accounts need a secure inbox verification flow.');
assert.match(firebaseAuth, /EmailAuthProvider\.credentialWithLink/, 'Email links must be completed as Firebase credentials.');
assert.match(firebaseAuth, /await updatePassword\(user, password\)/, 'A verified account must be able to add password access.');
assert.doesNotMatch(firebaseAuth, /fetchSignInMethodsForEmail/, 'Email enumeration protection must remain compatible.');
assert.match(firebaseAuth, /const batch = writeBatch\(firebaseDb\)/, 'Signup profile writes must be atomic.');
assert.match(firebaseAuth, /await deleteUser\(createdUser\)/, 'Failed signup must compensate the Firebase Auth identity.');

assert.match(auth, /authAdapter\.loginWithGoogle\(roleForNewAccount\)/, 'The public auth layer must preserve the selected role.');
for (const source of [adapter, provider]) {
  assert.match(source, /completeGoogleAccount/);
  assert.match(source, /getGoogleAccountCompletion/);
  assert.match(source, /requestPasswordSetupLink/);
  assert.match(source, /completePasswordSetupLink/);
  assert.match(source, /setPasswordAfterEmailVerification/);
}

assert.match(login, /\/termina-tu-cuenta/);
assert.match(register, /\/termina-tu-cuenta\?rol=/);
assert.doesNotMatch(login, /requiresAccountCompletion\s*\|\|\s*usuario\?\.rol\s*!==\s*['"]admin['"]/);
assert.doesNotMatch(register, /requiresAccountCompletion\s*\|\|\s*usuario\?\.rol\s*!==\s*['"]admin['"]/);
assert.match(login, /if \(requiresAccountCompletion\)/);
assert.match(register, /if \(requiresAccountCompletion\)/);
assert.match(login, /<button[^>]*id="tab-login"[^>]*>Iniciar sesión<\/button>/);
assert.match(login, /<a class="tab-btn" href="registro\.html">Crear cuenta<\/a>/);
assert.match(login, /id="go-forgot">¿Has olvidado la contraseña\?<\/a>/);
assert.doesNotMatch(login, /id="tab-forgot"|Recuperar acceso/);
assert.doesNotMatch(login, /Volver a la web/);
assert.doesNotMatch(register, /Volver a la web/);
assert.match(login, /developers\.google\.com\/static\/identity\/images\/g-logo\.png/);
assert.match(register, /developers\.google\.com\/static\/identity\/images\/g-logo\.png/);
assert.doesNotMatch(login, /<span class="google-auth-mark">G<\/span>/);
assert.doesNotMatch(register, /<span class="google-auth-mark">G<\/span>/);
assert.match(login, /id="password-setup-help"/);
assert.match(login, /id="btn-password-setup"/);
assert.match(login, /requestPasswordSetupLink/);
assert.match(passwordSetup, /completePasswordSetupLink/);
assert.match(passwordSetup, /setPasswordAfterEmailVerification/);
assert.match(passwordSetup, /autocomplete="new-password"/);
assert.doesNotMatch(passwordSetup, /[?&]email=/, 'The verified email must never be transported in the continue URL.');
assert.match(completion, /id="telefono"/);
assert.match(completion, /id="accepted-terms"/);
assert.match(completion, /name="role" value="familia"/);
assert.match(completion, /name="role" value="profesor"/);
assert.doesNotMatch(completion, /id="(direccion|ciudad|codigo-postal|materias|niveles|experiencia)"/, 'Google onboarding must stay minimal.');
assert.match(completion, /Completa los datos necesarios para acceder a tu panel/);
assert.match(completion, /if \(!data\.requiresAccountCompletion\)/, 'Exempt roles must leave the completion page immediately.');
assert.doesNotMatch(completion, /Google ya nos ha dado tu nombre y correo/);

const completionHeader = hosting.hosting.headers.find((entry) => entry.source === '/termina-tu-cuenta');
assert.ok(completionHeader, 'The completion route must have private cache and robots headers.');
assert.ok(completionHeader.headers.some((header) => header.key === 'Cache-Control' && header.value.includes('no-store')));
assert.ok(completionHeader.headers.some((header) => header.key === 'X-Robots-Tag' && header.value === 'noindex, nofollow'));

const decisionHeader = hosting.hosting.headers.find((entry) => entry.source === '/js/auth-onboarding.js');
assert.ok(decisionHeader, 'The central onboarding decision must not be served stale.');
assert.ok(decisionHeader.headers.some((header) => header.key === 'Cache-Control' && header.value.includes('no-store')));

const passwordSetupHeader = hosting.hosting.headers.find((entry) => entry.source === '/pages/crear-contrasena.html');
assert.ok(passwordSetupHeader, 'The password setup route must have private cache and robots headers.');
assert.ok(passwordSetupHeader.headers.some((header) => header.key === 'Cache-Control' && header.value.includes('no-store')));
assert.ok(passwordSetupHeader.headers.some((header) => header.key === 'Referrer-Policy' && header.value === 'no-referrer'));

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
for (const [name, html] of [['login', login], ['register', register], ['completion', completion], ['passwordSetup', passwordSetup]]) {
  const scripts = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.ok(scripts.length > 0, `${name} must include a module script.`);
  for (const script of scripts) {
    const withoutImports = script.replace(/import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?\s*/g, '');
    assert.doesNotThrow(() => new AsyncFunction(withoutImports), `${name} inline module script must parse.`);
  }
}

console.log('Auth onboarding tests passed.');
