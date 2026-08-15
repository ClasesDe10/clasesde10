#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const familyDashboard = fs.readFileSync('pages/dashboard/familia.html', 'utf8');
const professorDashboard = fs.readFileSync('pages/dashboard/profesor.html', 'utf8');
const profileEngine = fs.readFileSync('js/profile-engine.js', 'utf8');
const storageProvider = fs.readFileSync('js/document-storage-provider.js', 'utf8');
const utils = fs.readFileSync('js/utils.js', 'utf8');
const dashboardCss = fs.readFileSync('css/dashboard.css', 'utf8');
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
assert.ok(firestoreRules.includes('match /documentBlobs/{blobId}'), 'Firestore rules must allow the temporary document fallback collection');
assert.ok(firestoreRules.includes('firestore_fallback_no_storage_bucket'), 'Firestore fallback writes must be explicitly marked');
assert.ok(firestoreRules.includes('match /documentBlobChunks/{chunkId}'), 'Firestore rules must allow chunked fallback documents');
assert.ok(firestoreRules.includes('firestore_chunked_no_storage_bucket'), 'Chunked Firestore fallback writes must be explicitly marked');
assert.ok(firestoreRules.includes('sizeBytes <= 5 * 1024 * 1024'), 'Firestore document fallback must enforce a zero-cost file limit');
assert.ok(storageProvider.includes('FIRESTORE_FALLBACK_MAX_BYTES = 5 * 1024 * 1024'), 'Document fallback must accept normal receipts up to 5 MB');
assert.ok(storageProvider.includes('documentBlobChunks'), 'Document fallback must split larger files into Firestore chunks');
assert.ok(familyDashboard.includes('ownerUid: ownerUid()'), 'Family document uploads must persist ownerUid');
assert.ok(professorDashboard.includes('ownerUid: ownerUid()'), 'Professor document uploads must persist ownerUid');
assert.ok(familyDashboard.includes('Documentos opcionales'), 'Family documents must be clearly optional');
assert.ok(familyDashboard.includes('No es obligatorio para usar ClasesDe10'), 'Family documents must explain when they are needed');
assert.ok(!profileEngine.includes("label: 'Documento del tutor subido'"), 'Family completion must not require tutor documents');
assert.ok(familyDashboard.includes('id="family-profile-overview"'), 'Family profile must have a compact read-only overview');
assert.ok(familyDashboard.includes('id="modal-perfil-familia"'), 'Family profile edits must use a task dialog');
assert.ok(familyDashboard.includes('id="modal-documentos-familia"'), 'Family documents must use a separate task dialog');
assert.ok(professorDashboard.includes('id="teacher-profile-overview"'), 'Teacher profile must have a compact read-only overview');
assert.ok(professorDashboard.includes('id="modal-perfil-profesor"'), 'Teacher profile edits must use a task dialog');
assert.ok(utils.includes('export async function confirmAction'), 'Dashboard actions must use an accessible confirmation dialog');
assert.ok(utils.includes('export async function promptAction'), 'Dashboard actions must use an accessible prompt dialog');
assert.ok(!/window\.(?:confirm|prompt)\s*\(/.test(familyDashboard), 'Family dashboard must not use native browser prompts');
assert.ok(!/window\.(?:confirm|prompt)\s*\(/.test(professorDashboard), 'Teacher dashboard must not use native browser prompts');
assert.ok(dashboardCss.includes('.profile-page-shell'), 'Compact profile layout styles are missing');

for (const removed of [
  'id="p-iban"',
  'id="p-tarifa-hora"',
  'name="tarifa_hora"',
  'id="p-hourly-rate"',
  'name="hourlyRate"',
]) {
  assert.ok(!professorDashboard.includes(removed), `Removed teacher profile field returned: ${removed}`);
}

console.log(JSON.stringify({
  ok: true,
  checked: 'family_and_professor_profile_fields',
}, null, 2));
