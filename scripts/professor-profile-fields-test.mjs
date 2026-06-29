#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const professorDashboard = fs.readFileSync('pages/dashboard/profesor.html', 'utf8');
const adminDashboard = fs.readFileSync('pages/dashboard/admin.html', 'utf8');
const aiEngine = fs.readFileSync('js/ai-engine.js', 'utf8');
const publicTeacherPage = fs.readFileSync('para-profesores.html', 'utf8');

for (const id of [
  'p-foto-file',
  'p-estudio-exacto',
  'p-centro-estudios',
  'p-nota-bachillerato',
  'p-nota-universidad',
  'p-especialidades',
  'p-idiomas',
  'p-certificaciones',
  'p-bizum',
  'p-coche',
  'perfil-calidad-panel',
]) {
  assert.ok(professorDashboard.includes(`id="${id}"`), `Missing teacher profile field ${id}`);
}

assert.ok(professorDashboard.includes('type="file" id="p-foto-file"'), 'Profile photo must be uploaded as a file');
assert.ok(professorDashboard.includes('accept="image/jpeg,image/png,image/webp"'), 'Profile photo must restrict image file types');
assert.ok(professorDashboard.includes('padel, guitarra, piano'), 'Teacher subjects must mention non-academic activities');
assert.ok(professorDashboard.includes('Conservatorio / escuela de musica'), 'Teacher profile must support music training');
assert.ok(professorDashboard.includes('Entrenador / monitor deportivo'), 'Teacher profile must support sports training');
assert.ok(professorDashboard.includes('Notas finales del curso anterior'), 'Teacher documents must request previous course grades');
assert.ok(professorDashboard.includes('Expediente o notas universitarias'), 'Teacher documents must request university/main training grades');
assert.ok(professorDashboard.includes('Curriculum opcional'), 'Teacher documents must keep CV optional');
assert.ok(professorDashboard.includes('Coche para desplazamientos'), 'Teacher profile must ask for car availability');
assert.ok(aiEngine.includes('estimateTravelForMatch'), 'Matching engine must estimate travel distance/time');
assert.ok(aiEngine.includes('locationEstimate'), 'Matching results must expose location estimate');

for (const removed of [
  'p-tarifa',
  'p-iban',
  'p-foto-url',
  'tarifa_hora',
  'hourlyRate',
  'IBAN',
  '<option value="titulo">',
  '<option value="certificado">',
  '<option value="identidad">',
]) {
  assert.ok(!professorDashboard.includes(removed), `Removed field still present in professor dashboard: ${removed}`);
  assert.ok(!publicTeacherPage.includes(removed), `Removed field still present in public teacher page: ${removed}`);
}

for (const field of [
  'estudio_exacto',
  'centro_estudios',
  'nota_bachillerato',
  'nota_media_universidad',
  'acepta_bizum',
  'tiene_coche',
  'hasCar',
  'profileCompletionPercent',
  'profileIssues',
  'trustScore',
  'especialidades',
  'idiomas',
  'certificaciones',
]) {
  assert.ok(aiEngine.includes(field) || professorDashboard.includes(field), `Missing Firebase/AI field ${field}`);
}

assert.ok(adminDashboard.includes("fila('Nota Bachillerato'"), 'Admin detail must show Bachillerato grade');
assert.ok(adminDashboard.includes("fila('Nota formacion superior'"), 'Admin detail must show higher education grade');
assert.ok(adminDashboard.includes("fila('Bizum'"), 'Admin detail must show Bizum confirmation');
assert.ok(adminDashboard.includes("fila('Coche'"), 'Admin detail must show car availability');
assert.ok(!adminDashboard.includes("fila('Tarifa'"), 'Admin detail must not show teacher-provided tariff');

console.log(JSON.stringify({
  ok: true,
  checked: 'teacher_profile_fields',
}, null, 2));
