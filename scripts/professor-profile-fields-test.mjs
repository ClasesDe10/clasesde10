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
  'p-colegio',
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
assert.ok(professorDashboard.includes('Etapas y niveles que cubro'), 'Teacher levels section must cover academic and activity levels');
assert.ok(professorDashboard.includes('Iniciacion'), 'Teacher levels must keep initiation level for sports/music/adults');
assert.ok(professorDashboard.includes('Intermedio'), 'Teacher levels must keep intermediate level for sports/music/adults');
assert.ok(professorDashboard.includes('Avanzado'), 'Teacher levels must keep advanced level for sports/music/adults');
assert.ok(professorDashboard.includes('normalizeTeacherLevels'), 'Teacher levels must be normalized before display/save');
assert.ok(professorDashboard.includes('Conservatorio / escuela de musica'), 'Teacher profile must support music training');
assert.ok(professorDashboard.includes('Entrenador / monitor deportivo'), 'Teacher profile must support sports training');
assert.ok(professorDashboard.includes('Notas finales del curso anterior'), 'Teacher documents must request previous course grades');
assert.ok(professorDashboard.includes('Expediente o notas universitarias'), 'Teacher documents must request university/main training grades');
assert.ok(professorDashboard.includes('Certificado de idiomas'), 'Teacher documents must allow language certificates');
assert.ok(professorDashboard.includes('certificado_formacion_especializada'), 'Teacher documents must allow specialized training certificates');
assert.ok(professorDashboard.includes('referencia_academica_profesional'), 'Teacher documents must allow academic/professional references');
assert.ok(professorDashboard.includes('Curriculum opcional'), 'Teacher documents must keep CV optional');
assert.ok(professorDashboard.includes('Coche para desplazamientos'), 'Teacher profile must ask for car availability');
assert.ok(professorDashboard.includes('Colegio donde estudiaste'), 'Teacher profile must require the school attended');
assert.ok(professorDashboard.includes('Universidad o centro superior'), 'Teacher profile must require university or higher education center separately');
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
  'Cuenta datos concretos y verificables para aumentar confianza.',
]) {
  assert.ok(!professorDashboard.includes(removed), `Removed field still present in professor dashboard: ${removed}`);
  assert.ok(!publicTeacherPage.includes(removed), `Removed field still present in public teacher page: ${removed}`);
}

for (const field of [
  'estudio_exacto',
  'colegio',
  'schoolName',
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
assert.ok(adminDashboard.includes("fila('Colegio'"), 'Admin detail must show teacher school');
assert.ok(adminDashboard.includes("fila('Universidad / centro superior'"), 'Admin detail must show teacher university/higher center');
assert.ok(adminDashboard.includes("fila('Bizum'"), 'Admin detail must show Bizum confirmation');
assert.ok(adminDashboard.includes("fila('Coche'"), 'Admin detail must show car availability');
assert.ok(!adminDashboard.includes("fila('Tarifa'"), 'Admin detail must not show teacher-provided tariff');

console.log(JSON.stringify({
  ok: true,
  checked: 'teacher_profile_fields',
}, null, 2));
