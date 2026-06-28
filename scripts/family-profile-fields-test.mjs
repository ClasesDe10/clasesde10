#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const familyDashboard = fs.readFileSync('pages/dashboard/familia.html', 'utf8');
const professorDashboard = fs.readFileSync('pages/dashboard/profesor.html', 'utf8');
const profileEngine = fs.readFileSync('js/profile-engine.js', 'utf8');
const firestoreRules = fs.readFileSync('firebase/firestore.rules', 'utf8');
const storageRules = fs.readFileSync('firebase/storage.rules', 'utf8');

for (const id of [
  'familia-calidad-panel',
  'p-zona',
  'p-contacto-preferido',
  'p-emergencia-nombre',
  'p-emergencia-telefono',
  'p-idiomas',
  'p-notas',
  'fam-doc-tipo',
  'fam-doc-file',
  'btn-subir-doc-familia',
  'tbody-docs-familia',
]) {
  assert.ok(familyDashboard.includes(`id="${id}"`), `Missing family profile field ${id}`);
}

for (const id of [
  'perfil-calidad-panel',
  'p-especialidades',
  'p-idiomas',
  'p-certificaciones',
]) {
  assert.ok(professorDashboard.includes(`id="${id}"`), `Missing professor professional profile field ${id}`);
}

for (const field of [
  'profileCompletionPercent',
  'profileIssues',
  'preferredContact',
  'emergencyContactPhone',
  'specialties',
  'languages',
  'certifications',
]) {
  assert.ok(
    familyDashboard.includes(field) || professorDashboard.includes(field),
    `Dashboards must persist ${field}`,
  );
  assert.ok(firestoreRules.includes(`'${field}'`), `Firestore rules must allow ${field}`);
}

for (const computedField of ['trustScore', 'trustLevel']) {
  assert.ok(
    familyDashboard.includes(computedField) || professorDashboard.includes(computedField) || profileEngine.includes(computedField),
    `Dashboards must display calculated ${computedField}`,
  );
  assert.ok(!firestoreRules.includes(`'${computedField}'`), `Users must not self-write calculated ${computedField}`);
}

assert.ok(profileEngine.includes('evaluateTeacherProfileProfessional'), 'Missing teacher profile evaluator');
assert.ok(profileEngine.includes('evaluateFamilyProfileProfessional'), 'Missing family profile evaluator');
assert.ok(storageRules.includes('match /users/{uid}/{filePath=**}'), 'Storage rules must allow owner-scoped documents');
assert.ok(storageRules.includes('match /documentos/{uid}/{filePath=**}'), 'Storage rules must keep legacy document paths readable');
assert.ok(familyDashboard.includes('ownerUid: ownerUid()'), 'Family document uploads must persist ownerUid');
assert.ok(professorDashboard.includes('ownerUid: ownerUid()'), 'Professor document uploads must persist ownerUid');

for (const removed of ['p-iban', 'tarifa_hora', 'hourlyRate']) {
  assert.ok(!professorDashboard.includes(removed), `Removed teacher field returned: ${removed}`);
}

console.log(JSON.stringify({
  ok: true,
  checked: 'family_and_professor_profile_fields',
}, null, 2));
