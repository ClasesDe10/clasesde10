#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DATA_SCHEMA_VERSION,
  analyzeEntityData,
  collectionForWrite,
  normalizeEntityForWrite,
} from '../js/data-schema.js';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const teacher = normalizeEntityForWrite('profesores', {
  usuario_id: 'user_1',
  email: 'ana@example.com',
  nombre: 'Ana',
  apellidos: 'Garcia',
  telefono: '+34 600 000 000',
  ciudad: 'Madrid',
  zona: 'Centro',
  materias: 'Matematicas, Fisica',
  niveles_educativos: ['ESO', 'Bachillerato'],
  colegio: 'Colegio El Prado',
  centro_estudios: 'Universidad Complutense de Madrid',
  experiencia_anios: '4',
  disponibilidad_resumen: 'Tardes',
  acepta_bizum: true,
  tiene_coche: true,
  profileCompletionPercent: 92,
  estado_verificacion: 'pendiente',
});

assert.equal(teacher.userUid, 'user_1');
assert.equal(teacher.usuario_id, 'user_1');
assert.equal(teacher.displayName, 'Ana Garcia');
assert.deepEqual(teacher.subjects, ['Matematicas', 'Fisica']);
assert.equal(teacher.schoolName, 'Colegio El Prado');
assert.equal(teacher.studyCenter, 'Universidad Complutense de Madrid');
assert.equal(teacher.experienceYears, 4);
assert.equal(teacher.hasBizum, true);
assert.equal(teacher.hasCar, true);
assert.equal(teacher.verificationStatus, 'pendiente');
assert.equal(teacher.estado_verificacion, 'pendiente');
assert.equal(teacher.schemaVersion, DATA_SCHEMA_VERSION);

const classDoc = normalizeEntityForWrite('clases', {
  profesor_id: 'teacher_1',
  familia_id: 'family_1',
  alumno_id: 'student_1',
  materia: 'Ingles',
  fecha: '2026-07-01',
  hora_inicio: '17:00',
  duracion_minutos: 60,
  precio_total: '25.50',
  importe_profesor: '18',
  estado: 'programada',
});

assert.equal(classDoc.teacherUid, 'teacher_1');
assert.equal(classDoc.profesor_id, 'teacher_1');
assert.equal(classDoc.familyUid, 'family_1');
assert.equal(classDoc.studentId, 'student_1');
assert.equal(classDoc.subject, 'Ingles');
assert.equal(classDoc.materia, 'Ingles');
assert.equal(classDoc.familyAmount, 25.5);
assert.equal(classDoc.precio_total, 25.5);
assert.equal(classDoc.teacherAmount, 18);
assert.equal(classDoc.lifecycleStatus, 'clase_programada');
assert.ok(classDoc.startAtIso.includes('2026-07-01T17:00:00'));
assert.ok(classDoc.endAtIso.includes('2026-07-01T18:00:00'));
assert.equal(classDoc.month, '2026-07');
assert.equal(classDoc.partitionKey, '2026-07');
assert.ok(/^s\d{2}$/.test(classDoc.scaleShard));

const payment = normalizeEntityForWrite('pagos', {
  familia_id: 'family_1',
  monto: '25.50',
  metodo: 'bizum',
  estado: 'pending',
});

assert.equal(payment.familyUid, 'family_1');
assert.equal(payment.amount, 25.5);
assert.equal(payment.monto, 25.5);
assert.equal(payment.method, 'bizum');
assert.equal(payment.status, 'pendiente');
assert.equal(payment.estado, 'pendiente');
assert.ok(payment.month, 'Payment documents must include scale partition month.');
assert.ok(payment.scaleShard, 'Payment documents must include scale shard.');
assert.equal(payment.precio_total, undefined, 'Payment documents must not inherit class price aliases.');
assert.equal(payment.familyAmount, undefined, 'Payment documents must not expose class familyAmount.');

const request = normalizeEntityForWrite('solicitudes', {
  familia_id: 'family_1',
  alumno_id: 'student_1',
  materia: 'Piano',
  preferencia_horario: 'Tardes',
});
assert.equal(request.familyUid, 'family_1');
assert.equal(request.studentId, 'student_1');
assert.equal(request.subject, 'Piano');
assert.equal(request.schedulePreference, 'Tardes');
assert.equal(request.matchStatus, 'pending');
assert.equal(request.lifecycleStatus, 'solicitud_enviada');
assert.ok(request.partitionKey, 'Requests must include a partition key for future scale.');

const analysis = analyzeEntityData('profesores', teacher);
assert.equal(analysis.collection, 'profesores');
assert.ok(analysis.canonicalCoverage > 40);
assert.ok(analysis.duplicateAliases.some((item) => item.canonical === 'userUid' && item.alias === 'usuario_id' && item.consistent));

assert.equal(collectionForWrite('usuarios'), 'users');

const firebaseDataClient = read('js/firebase-data-client.js');
const firestoreAdapter = read('js/adapters/firebase-firestore-adapter.js');
const firebaseAuth = read('js/firebase-auth.js');
const worker = read('scripts/firebase-automation-worker.mjs');
const serviceWorker = read('service-worker.js');
const pkg = read('package.json');

assert(firebaseDataClient.includes('normalizeEntityForWrite'), 'Compatibility data client must normalize writes.');
assert(firestoreAdapter.includes('normalizeEntityForWrite'), 'Firestore adapters must normalize writes.');
assert(firebaseAuth.includes('normalizeEntityForWrite'), 'Auth-created profiles must normalize writes.');
assert(worker.includes('normalizeEntityForWrite'), 'Automation worker must normalize writes.');
assert(serviceWorker.includes('/js/data-schema.js'), 'PWA must precache data schema runtime module.');
assert(serviceWorker.includes('/js/scale-engine.js'), 'PWA must precache scale engine runtime module.');
assert(pkg.includes('test:data-schema'), 'package.json must expose data schema validation.');

console.log(JSON.stringify({
  ok: true,
  checked: 'data_schema',
  version: DATA_SCHEMA_VERSION,
}, null, 2));
