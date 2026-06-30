#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  evaluateFamilyProfileProfessional,
  evaluateTeacherProfileProfessional,
  toProfileList,
  validatePhone,
  validatePostalCode,
} from '../js/profile-engine.js';

assert.deepEqual(toProfileList('Matematicas, matematicas, Padel\nGuitarra'), ['Matematicas', 'Padel', 'Guitarra']);
assert.equal(validatePhone('+34 600 000 000').valid, true);
assert.equal(validatePhone('abc').valid, false);
assert.equal(validatePostalCode('28010').valid, true);
assert.equal(validatePostalCode('2801').valid, false);

const teacher = evaluateTeacherProfileProfessional({
  nombre: 'Profesor',
  apellidos: 'Completo',
  telefono: '611222333',
  foto_url: 'data:image/jpeg;base64,abcdabcdabcdabcdabcd',
  direccion: 'Calle Profesor 10',
  ciudad: 'Madrid',
  codigo_postal: '28020',
  zona: 'Madrid centro',
  nivel_estudios: 'Grado universitario',
  estudio_exacto: 'Grado en Matematicas',
  colegio: 'Colegio El Prado',
  centro_estudios: 'Universidad Complutense de Madrid',
  nota_bachillerato: 8.7,
  nota_media_universidad: 8.1,
  bio: 'Profesor con experiencia y metodologia clara para validar el perfil completo.',
  experiencia_anios: 3,
  disponibilidad_resumen: 'Tardes entre semana',
  materias: ['Matematicas', 'Padel'],
  niveles_educativos: ['ESO', 'Deporte'],
  especialidades: ['EVAU'],
  idiomas: ['Espanol', 'Ingles'],
  certificaciones: ['C1'],
  acepta_bizum: true,
  tiene_coche: true,
}, [
  { tipo: 'dni', estado: 'validado' },
  { tipo: 'notas_universidad', estado: 'pendiente' },
  { tipo: 'certificado_idiomas', estado: 'validado' },
]);

assert.equal(teacher.complete, true);
assert.ok(teacher.percent >= 90, `Teacher percent too low: ${teacher.percent}`);
assert.ok(teacher.trustScore >= 60, `Teacher trust too low: ${teacher.trustScore}`);
assert.equal(teacher.trustProfile.adminStats.reputationCanBeManipulatedByProfileOnly, false);
assert.ok(teacher.trustProfile.riskFlags.includes('low_activity_sample'));
assert.ok(teacher.trustEvidence.some((item) => item.key === 'identity'));
assert.ok(teacher.trustNextActions.some((item) => item.section === 'documentos'));
assert.deepEqual(teacher.normalized.subjects, ['Matematicas', 'Padel']);
assert.equal(teacher.normalized.schoolName, 'Colegio El Prado');
assert.equal(teacher.normalized.studyCenter, 'Universidad Complutense de Madrid');
assert.ok(teacher.indicators.some((item) => item.label === 'Idiomas certificados' && item.complete));

const family = evaluateFamilyProfileProfessional({
  nombre: 'Familia',
  apellidos: 'Completa',
  telefono: '600123456',
  direccion: 'Calle Familia 10',
  ciudad: 'Madrid',
  codigo_postal: '28010',
  zona: 'Chamberi',
  contacto_preferido: 'chat',
  contacto_emergencia_nombre: 'Tutor dos',
  contacto_emergencia_telefono: '699123456',
  idiomas: ['Espanol'],
  notas_perfil: 'Preferimos clases presenciales por la tarde y seguimiento semanal.',
}, [
  { id: 'a1', active: true },
], [
  { tipo: 'dni', estado: 'validado' },
]);

assert.equal(family.complete, true);
assert.ok(family.percent >= 90, `Family percent too low: ${family.percent}`);
assert.ok(family.trustScore >= 70, `Family trust too low: ${family.trustScore}`);
assert.ok(family.trustEvidence.some((item) => item.key === 'payments'));
assert.ok(Array.isArray(family.trustNextActions));

const familyWithoutDocs = evaluateFamilyProfileProfessional({
  nombre: 'Familia',
  apellidos: 'Completa',
  telefono: '600123456',
  direccion: 'Calle Familia 10',
  ciudad: 'Madrid',
  codigo_postal: '28010',
  zona: 'Chamberi',
  contacto_preferido: 'chat',
  contacto_emergencia_nombre: 'Tutor dos',
  contacto_emergencia_telefono: '699123456',
  idiomas: ['Espanol'],
  notas_perfil: 'Preferimos clases presenciales por la tarde y seguimiento semanal.',
}, [
  { id: 'a1', active: true },
], []);

assert.equal(familyWithoutDocs.complete, true);
assert.ok(familyWithoutDocs.percent >= 90, `Family without docs percent too low: ${familyWithoutDocs.percent}`);
assert.ok(!familyWithoutDocs.recommendations.includes('Documento del tutor subido'));
assert.ok(!familyWithoutDocs.indicators.some((item) => item.label === 'Identidad documentada'));

const incompleteFamily = evaluateFamilyProfileProfessional({
  nombre: 'F',
  telefono: '123',
}, [], []);
assert.equal(incompleteFamily.complete, false);
assert.ok(incompleteFamily.issueLabels.length >= 3);

console.log(JSON.stringify({
  ok: true,
  checked: 'profile_engine',
  teacher: { percent: teacher.percent, trustScore: teacher.trustScore },
  family: { percent: family.percent, trustScore: family.trustScore },
}, null, 2));
