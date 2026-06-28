#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  evaluateTeacherProfile,
  rankTeachersForRequest,
  scoreTeacherForRequest,
  summarizeTeacherProfile,
} from '../js/ai-engine.js';

const request = {
  id: 'req_1',
  materia: 'Matematicas',
  nivel: '2 ESO',
  modalidad: 'online',
  zona: 'Madrid',
  preferencia_horario: 'Tardes entre semana',
};

const completeTeacher = {
  id: 'teacher_complete',
  nombre: 'Ana',
  apellidos: 'Lopez',
  email: 'ana@example.com',
  telefono: '600111222',
  foto_url: 'https://example.com/ana.jpg',
  direccion: 'Calle Mayor 1',
  ciudad: 'Madrid',
  codigo_postal: '28001',
  zona: 'Madrid centro',
  modalidad: 'online',
  materias: ['Matematicas', 'Fisica'],
  niveles_educativos: ['ESO', 'Bachillerato'],
  nivel_estudios: 'Grado universitario',
  estudio_exacto: 'Grado en Matematicas',
  centro_estudios: 'Universidad Complutense de Madrid',
  nota_bachillerato: 8.7,
  nota_media_universidad: 8.1,
  disponibilidad_resumen: 'Tardes entre semana',
  bio: 'Profesora universitaria con experiencia real preparando alumnos de ESO y Bachillerato.',
  acepta_bizum: true,
  status: 'verificado',
  active: true,
  maxStudents: 5,
  activeAssignments: 1,
};

const incompleteTeacher = {
  id: 'teacher_incomplete',
  nombre: 'Luis',
  email: 'luis@example.com',
  materias: ['Ingles'],
  status: 'pendiente_perfil',
  active: false,
};

const completeQuality = evaluateTeacherProfile(completeTeacher);
assert.equal(completeQuality.assignable, true);
assert.equal(completeQuality.readiness, 'asignable');
assert.ok(completeQuality.score >= 85);

const incompleteQuality = evaluateTeacherProfile(incompleteTeacher);
assert.equal(incompleteQuality.assignable, false);
assert.ok(incompleteQuality.issueLabels.includes('Completar telefono'));
assert.ok(incompleteQuality.score < completeQuality.score);

const completeScore = scoreTeacherForRequest(request, completeTeacher);
assert.equal(completeScore.assignable, true);
assert.ok(completeScore.score > 80);
assert.ok(completeScore.reasons.some((reason) => reason.toLowerCase().includes('materia')));

const ranking = rankTeachersForRequest(request, [incompleteTeacher, completeTeacher], { limit: 2, includeZeroScore: true });
assert.equal(ranking[0].teacherUid, 'teacher_complete');
assert.equal(ranking[0].assignable, true);
assert.equal(ranking[1].assignable, false);

const summary = summarizeTeacherProfile(incompleteTeacher);
assert.ok(summary.nextActions.length > 0);
assert.equal(summary.assignable, false);

console.log(JSON.stringify({
  ok: true,
  completeScore: completeScore.score,
  incompleteProfileScore: incompleteQuality.score,
  topTeacher: ranking[0].teacherUid,
}, null, 2));
