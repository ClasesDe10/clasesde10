import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const parents = read('para-padres.html');
const auth = read('js/firebase-auth.js');
const authProvider = read('js/auth-provider.js');
const rules = read('firebase/firestore.rules');
const admin = read('pages/dashboard/admin.html');
const family = read('pages/dashboard/familia.html');
const password = read('pages/crear-contrasena.html');
const worker = read('scripts/firebase-automation-worker.mjs');

for (const id of ['nombre-padre', 'nombre-alumno', 'necesidad-profesor', 'telefono-familia', 'email-familia']) {
  assert.match(parents, new RegExp(`id="${id}"`), `Missing assisted form field ${id}`);
}
assert.match(parents, /Entrar o crear cuenta/);
assert.match(parents, /requestAssistedFamilyActivation/);
assert.match(parents, /account_mode:\s*'assisted_parent_activation'/);
assert.match(authProvider, /requestAssistedFamilyActivation/);
assert.match(auth, /sendSignInLinkToEmail/);
assert.match(auth, /passwordSetupRequired:\s*true/);
assert.match(auth, /profileCompletionRequired:\s*true/);
assert.match(auth, /createAssistedFamilyAccount/);
assert.match(auth, /accountStatus:\s*'activated'/);
assert.match(auth, /updatePassword\(user, password\)/);
assert.doesNotMatch(
  auth,
  /(?:updatePassword|createUserWithEmailAndPassword)\([^\n]{0,240}split\('@'\)\[0\]/i,
  'The email local part must never become a password.',
);
assert.doesNotMatch(parents, /contrase(?:n|ñ)a temporal/i, 'The public flow must not expose a temporary predictable password.');

assert.match(rules, /validOwnAssistedFamilyLeadClaim/);
assert.match(rules, /validOwnAssistedFamilyRequestClaim/);
assert.match(rules, /canReadOwnAssistedFamilyRequest/);
assert.match(rules, /request\.resource\.data\.accountUid == request\.auth\.uid/);
assert.match(rules, /request\.resource\.data\.passwordSetupRequired == false/);
assert.match(rules, /request\.resource\.data\.profileCompletionRequired == false/);

assert.match(admin, />\s*Formularios\s*</);
assert.match(admin, /Nuevo formulario recibido/);
assert.match(admin, /Cuenta activada/);
assert.match(family, /Termina de preparar tu cuenta/);
assert.match(family, /profileCompletedAt:\s*serverTimestamp\(\)/);
assert.match(password, /completa los datos necesarios de tu perfil/i);
assert.match(worker, /processActivatedAssistedFamilyLeads/);
assert.match(worker, /Nuevo formulario de familia/);

console.log('Assisted family onboarding validation passed.');
