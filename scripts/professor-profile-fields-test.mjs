#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const professorDashboard = fs.readFileSync('pages/dashboard/profesor.html', 'utf8');
const adminDashboard = fs.readFileSync('pages/dashboard/admin.html', 'utf8');
const aiEngine = fs.readFileSync('js/ai-engine.js', 'utf8');
const publicTeacherPage = fs.readFileSync('para-profesores.html', 'utf8');

for (const id of [
  'p-foto-file',
  'p-fecha-nacimiento',
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
  'form-dia-cobro-profesor',
  'ing-cobro-frecuencia',
  'ing-cobro-fecha-inicio',
  'perfil-cobro-reminder',
  'perfil-calidad-panel',
]) {
  assert.ok(professorDashboard.includes(`id="${id}"`), `Missing teacher profile field ${id}`);
}

assert.ok(professorDashboard.includes('type="file" id="p-foto-file"'), 'Profile photo must be uploaded as a file');
assert.ok(professorDashboard.includes('accept="image/jpeg,image/png,image/webp"'), 'Profile photo must restrict image file types');
assert.ok(professorDashboard.includes('Que clases puedes dar'), 'Teacher profile must organize offers by teaching scope.');
assert.ok(professorDashboard.includes('Estudio y materias'), 'Teacher profile must include academic study scope.');
assert.ok(professorDashboard.includes('Deporte'), 'Teacher profile must include sport scope.');
assert.ok(professorDashboard.includes('Instrumentos y musica'), 'Teacher profile must include instrument/music scope.');
assert.ok(professorDashboard.includes('data-scope-select-all'), 'Teacher profile must allow selecting all options in a scope.');
assert.ok(professorDashboard.includes('data-scope-custom-input'), 'Teacher profile must allow adding custom scope options.');
assert.ok(professorDashboard.includes('teaching-scope-builder'), 'Teacher profile must render the structured scope builder.');
assert.ok(professorDashboard.includes('Iniciacion'), 'Teacher levels must keep initiation level for sports/music/adults');
assert.ok(professorDashboard.includes('Intermedio'), 'Teacher levels must keep intermediate level for sports/music/adults');
assert.ok(professorDashboard.includes('Avanzado'), 'Teacher levels must keep advanced level for sports/music/adults');
assert.ok(professorDashboard.includes('normalizeTeacherLevels'), 'Teacher levels must be normalized before display/save');
assert.ok(professorDashboard.includes('Notas finales del curso anterior'), 'Teacher documents must request previous course grades');
assert.ok(professorDashboard.includes('Expediente o notas universitarias'), 'Teacher documents must request university/main training grades');
assert.ok(professorDashboard.includes('Certificado de idiomas'), 'Teacher documents must allow language certificates');
assert.ok(professorDashboard.includes('certificado_formacion_especializada'), 'Teacher documents must allow specialized training certificates');
assert.ok(professorDashboard.includes('referencia_academica_profesional'), 'Teacher documents must allow academic/professional references');
assert.ok(professorDashboard.includes('Curriculum opcional'), 'Teacher documents must keep CV optional');
assert.ok(professorDashboard.includes('Coche para desplazamientos'), 'Teacher profile must ask for car availability');
assert.ok(professorDashboard.includes('Las familias solo verán tu edad'), 'Teacher birth date must remain private while exposing only age to families');
assert.ok(professorDashboard.includes('Dia de cobro'), 'Teacher income section must include payout day settings');
assert.ok(professorDashboard.includes('Una vez guardado no se puede cambiar desde el panel'), 'Teacher payout day must clearly explain the lock after saving');
assert.ok(professorDashboard.includes('guardarDiaCobroProfesor'), 'Teacher payout day must save independently from profile edits');
assert.ok(professorDashboard.includes('payoutLockedAt'), 'Teacher payout day must persist a lock timestamp');
assert.ok(professorDashboard.includes('Colegio donde estudiaste'), 'Teacher profile must require the school attended');
assert.ok(professorDashboard.includes('Universidad o centro superior donde estudias o estudiaste'), 'Teacher profile must ask for university or higher education center naturally');
assert.ok(professorDashboard.includes('Grado, carrera o titulacion que estudias o estudiaste'), 'Teacher profile must ask for the exact degree/title naturally');
assert.ok(professorDashboard.includes('no hace falta indicar barrio'), 'Teacher profile must explain exact-distance matching instead of asking barrio.');
assert.ok(aiEngine.includes('estimateTravelForMatch'), 'Matching engine must estimate travel distance/time');
assert.ok(aiEngine.includes('locationEstimate'), 'Matching results must expose location estimate');
assert.ok(aiEngine.includes('formatTravelEstimateForDisplay'), 'Matching engine must expose formatted travel estimates');
assert.ok(adminDashboard.includes('formatTravelEstimateForDisplay'), 'Admin recommendations must display formatted mobility estimates');
assert.ok(adminDashboard.includes('normalizeTravelDisplayOptions'), 'Admin recommendations must recover travel badges from legacy/partial estimates');
assert.ok(adminDashboard.includes('normalizeMatchingRiskText'), 'Admin recommendations must normalize legacy route-risk copy');
assert.ok(adminDashboard.includes('professional_matching_v6_google_routes') || adminDashboard.includes('MATCHING_VERSION'), 'Admin recommendations must recalculate stale pre-Google-Routes matches');
assert.ok(adminDashboard.includes('Ruta estimada · Maps pendiente'), 'Admin recommendations must distinguish estimated routes from exact Google Maps data');
assert.ok(adminDashboard.includes('GMP-attribution') && adminDashboard.includes('translate="no"'), 'Admin recommendations must attribute exact route content to Google Maps');
assert.ok(adminDashboard.includes('Tiene coche'), 'Admin recommendations must show car mobility state');
assert.ok(adminDashboard.includes('Sin coche: a pie / transporte publico'), 'Admin recommendations must show walking/transit mobility without a car');

for (const removed of [
  'p-tarifa',
  'p-iban',
  'p-cobro-frecuencia',
  'p-cobro-fecha-inicio',
  'p-foto-url',
  'IBAN',
  'p-zona',
  'p-nivel',
  'Zona/barrio',
  'Tipo de formacion principal',
  'Estudio exacto / titulacion',
  'nueva-materia',
  'btn-add-materia',
  'niveles-check',
  'Materias y actividades que imparto',
  'Etapas y niveles que cubro',
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
  'fecha_nacimiento',
  'colegio',
  'schoolName',
  'centro_estudios',
  'nota_bachillerato',
  'nota_media_universidad',
  'acepta_bizum',
  'frecuencia_cobro_profesor',
  'payoutFrequency',
  'fecha_inicio_cobro_profesor',
  'payoutAnchorDate',
  'tiene_coche',
  'hasCar',
  'profileCompletionPercent',
  'profileIssues',
  'trustScore',
  'especialidades',
  'idiomas',
  'certificaciones',
  'ambitos_ensenanza',
  'teachingScopes',
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
