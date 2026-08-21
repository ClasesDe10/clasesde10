#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CUSTOM_EDUCATION_COURSE_VALUE,
  EDUCATION_COURSE_GROUPS,
  canonicalEducationCourse,
  educationCourseFromStudent,
  educationStageForCourse,
  resolveEducationCourse,
} from '../js/education-course.js';
import { getRequestProfile } from '../js/ai-engine.js';

const read = (path) => fs.readFileSync(path, 'utf8');

const allCourses = EDUCATION_COURSE_GROUPS.flatMap((group) => group.courses);
assert.equal(new Set(allCourses).size, allCourses.length, 'The exact-course catalog must not contain duplicates.');
assert(allCourses.includes('1º Primaria'));
assert(allCourses.includes('4º ESO'));
assert(allCourses.includes('2º Bachillerato'));
assert(allCourses.includes('2º FP Grado Superior'));
assert(allCourses.includes('6º Universidad'));
assert.equal(allCourses.includes('ESO'), false, 'Broad stages must not be selectable as an exact course.');

assert.equal(canonicalEducationCourse('3º de ESO'), '3º ESO');
assert.equal(canonicalEducationCourse('2 bach'), '2º Bachillerato');
assert.equal(canonicalEducationCourse('EVAU'), 'Selectividad / EBAU');
assert.equal(educationStageForCourse('4º ESO'), 'ESO');
assert.equal(educationStageForCourse('2º FP Grado Medio'), 'FP Grado Medio');
assert.equal(resolveEducationCourse('3º ESO'), '3º ESO');
assert.equal(resolveEducationCourse(CUSTOM_EDUCATION_COURSE_VALUE, '  2º   Conservatorio profesional  '), '2º Conservatorio profesional');
assert.equal(resolveEducationCourse(CUSTOM_EDUCATION_COURSE_VALUE, 'ESO'), '', 'A broad custom stage must not pass as an exact course.');

assert.deepEqual(
  educationCourseFromStudent({ curso: '3º', nivel_educativo: 'ESO' }),
  { selectValue: '3º ESO', customValue: '' },
);
assert.deepEqual(
  educationCourseFromStudent({ curso: '2º Conservatorio profesional', nivel_educativo: 'Música' }),
  { selectValue: CUSTOM_EDUCATION_COURSE_VALUE, customValue: '2º Conservatorio profesional' },
);
assert.deepEqual(
  educationCourseFromStudent({ nivel_educativo: 'ESO' }),
  { selectValue: '', customValue: '' },
  'A broad stage must not be silently accepted as an exact course.',
);
assert.deepEqual(
  educationCourseFromStudent({ curso: 'ESO', nivel_educativo: 'ESO' }),
  { selectValue: '', customValue: '' },
  'A broad value stored in the student course field must still require an exact selection.',
);

const matchingProfile = getRequestProfile({
  curso: '3º ESO',
  nivel: 'ESO',
  materia: 'Matemáticas',
});
assert.equal(matchingProfile.level, '3º ESO', 'Matching must prioritize the exact course over the broad legacy stage.');

const familyDashboard = read('pages/dashboard/familia.html');
const adminDashboard = read('pages/dashboard/admin.html');
assert.match(familyDashboard, /id="sol-curso" required/);
assert.match(familyDashboard, /id="sol-curso-otro"[^>]*disabled/);
assert.match(familyDashboard, /Selecciona un hijo\/a, indica la materia y el curso exacto/);
assert.match(familyDashboard, /curso,\s*\n\s*nivel:\s+curso/);
assert.match(familyDashboard, /nivel_educativo:\s+educationStageForCourse\(curso\)/);
assert.equal(familyDashboard.includes('id="sol-nivel"'), false, 'The broad-level request input must be removed.');
assert.match(familyDashboard, /<th>Curso exacto<\/th>/);
assert.match(adminDashboard, /<th>Curso exacto<\/th>/);
assert.match(adminDashboard, /s\.course\|\|s\.curso\|\|s\.nivel/);

console.log(JSON.stringify({
  ok: true,
  checked: 'family_request_exact_course',
  courseCount: allCourses.length,
}, null, 2));
