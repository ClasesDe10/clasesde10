import assert from 'node:assert/strict';
import {
  AdminPersonDirectory,
  renderAdminPersonReference,
} from '../js/admin-person-context.js';

const directory = new AdminPersonDirectory().register({
  users: [
    { id: 'family-user-1', role: 'familia', nombre: 'María', apellidos: 'García López', email: 'maria@example.com' },
    { id: 'teacher-user-1', role: 'profesor', nombre: 'Javier', apellidos: 'Martín Ruiz' },
  ],
  families: [
    { id: 'family-profile-1', userUid: 'family-user-1', nombre: 'María' },
  ],
  teachers: [
    { id: 'teacher-profile-1', userUid: 'teacher-user-1', nombre: 'Javier' },
  ],
  students: [
    { id: 'student-1', nombre: 'Lucía', apellidos: 'García Pérez', familyUid: 'family-profile-1' },
    { id: 'student-2', nombre: 'Pablo', apellidos: 'García Pérez', familyUid: 'family-profile-1' },
  ],
  classes: [
    { id: 'class-1', teacherUid: 'teacher-profile-1', familyUid: 'family-profile-1', studentId: 'student-1' },
    { id: 'class-2', teacherUid: 'teacher-user-1', familyUid: 'family-user-1', studentId: 'student-2' },
  ],
});

const family = directory.resolve({ role: 'familia', id: 'family-user-1' });
assert.equal(family.profileId, 'family-profile-1', 'El UID de cuenta debe abrir la ficha CRM de familia');
assert.equal(family.fullName, 'María García López', 'Debe conservar nombre y apellidos del usuario autorizado');
assert.match(family.relationshipLabel, /Lucía García Pérez/);
assert.match(family.relationshipLabel, /Pablo García Pérez/);

const classFamily = directory.resolve({
  role: 'familia',
  id: 'family-profile-1',
  source: { studentId: 'student-1' },
});
assert.equal(classFamily.relationshipLabel, 'Hijo/a: Lucía García Pérez', 'El contexto de clase debe priorizar al hijo concreto');

const teacher = directory.resolve({ role: 'profesor', id: 'teacher-user-1', studentId: 'student-1' });
assert.equal(teacher.fullName, 'Javier Martín Ruiz');
assert.equal(teacher.relationshipLabel, 'Alumno/a: Lucía García Pérez');
assert.equal(teacher.profileId, 'teacher-profile-1');
assert.match(directory.resolve({ role: 'profesor', id: 'teacher-profile-1' }).relationshipLabel, /Pablo García Pérez/, 'Los alias de cuenta no deben crear una ficha duplicada');

const student = directory.resolve({ role: 'alumno', id: 'student-1' });
assert.equal(student.fullName, 'Lucía García Pérez');
assert.equal(student.relationshipLabel, 'Familia: María García López');

const unresolved = directory.resolve({ role: 'familia', id: 'opaque-987654', name: 'maria@example.com' });
assert.equal(unresolved.fullName, 'Familia pendiente de nombre', 'Nunca debe presentar correo o ID como nombre personal');

const html = renderAdminPersonReference({ role: 'familia', id: 'family-profile-1', studentId: 'student-1' }, directory);
assert.match(html, /María García López/);
assert.match(html, /Hijo\/a: Lucía García Pérez/);
assert.match(html, /data-action="ver-persona-admin"/);
assert.match(html, /data-person-role="familia"/);
assert.match(html, /data-person-id="family-profile-1"/);

console.log('admin-person-context-test: OK');
