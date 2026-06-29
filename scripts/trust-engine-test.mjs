#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  TRUST_VERSION,
  buildFamilyTrustProfile,
  buildTeacherTrustProfile,
  buildTrustSnapshotPatch,
  summarizeTrustForDisplay,
} from '../js/trust-engine.js';
import { rankTeachersForRequest } from '../js/ai-engine.js';

const now = new Date('2026-06-28T12:00:00Z');

const teacher = {
  id: 'teacher_1',
  teacherUid: 'teacher_1',
  userUid: 'teacher_1',
  nombre: 'Ana',
  apellidos: 'Lopez',
  email: 'ana@example.com',
  telefono: '600111222',
  foto_url: 'https://example.com/ana.jpg',
  active: true,
  status: 'verificado',
  estado_verificacion: 'verificado',
  profileCompletionPercent: 96,
  materias: ['Matematicas'],
  niveles_educativos: ['ESO'],
  modalidad: 'online',
  zona: 'Madrid',
  disponibilidad_resumen: 'Tardes entre semana',
  experiencia_anios: 6,
  rating: 4.8,
  reviewsCount: 14,
  acepta_bizum: true,
};

const weakTeacher = {
  ...teacher,
  id: 'teacher_weak',
  teacherUid: 'teacher_weak',
  userUid: 'teacher_weak',
  status: 'pendiente',
  estado_verificacion: 'pendiente',
  profileCompletionPercent: 45,
  experiencia_anios: 0,
  rating: 0,
  reviewsCount: 0,
};

const context = {
  now,
  documents: [
    { ownerUid: 'teacher_1', tipo: 'dni', estado: 'validado' },
    { ownerUid: 'teacher_1', tipo: 'titulo', estado: 'validado' },
    { ownerUid: 'teacher_weak', tipo: 'dni', estado: 'pendiente' },
    { ownerUid: 'family_1', tipo: 'dni', estado: 'validado' },
  ],
  classes: [
    { id: 'c1', teacherUid: 'teacher_1', familyUid: 'family_1', status: 'realizada', fecha: '2026-06-20' },
    { id: 'c2', teacherUid: 'teacher_1', familyUid: 'family_1', status: 'realizada', fecha: '2026-06-22' },
    { id: 'c3', teacherUid: 'teacher_1', familyUid: 'family_1', status: 'realizada', fecha: '2026-06-24' },
    { id: 'c4', teacherUid: 'teacher_weak', familyUid: 'family_2', status: 'cancelada', fecha: '2026-06-24' },
  ],
  payments: [
    { id: 'p1', familyUid: 'family_1', teacherUid: 'teacher_1', status: 'validado', paidAt: '2026-06-24' },
    { id: 'p2', familyUid: 'family_1', teacherUid: 'teacher_1', status: 'validado', paidAt: '2026-06-25' },
  ],
  matches: [
    { teacherUid: 'teacher_1', status: 'accepted', createdAt: '2026-06-20T10:00:00Z', acceptedAt: '2026-06-20T11:00:00Z' },
  ],
  assignments: [
    { teacherUid: 'teacher_1', familyUid: 'family_1', active: true, createdAt: '2026-06-20T11:00:00Z' },
  ],
  students: [
    { id: 's1', familyUid: 'family_1', active: true },
  ],
  requests: [
    { id: 'r1', familyUid: 'family_1', assignedTeacherUid: 'teacher_1', createdAt: '2026-06-20T10:00:00Z', assignedAt: '2026-06-20T11:00:00Z' },
  ],
  incidents: [],
};

const teacherTrust = buildTeacherTrustProfile(teacher, context);
assert.equal(teacherTrust.version, TRUST_VERSION);
assert.ok(teacherTrust.score >= 80, `Expected strong trust score, got ${teacherTrust.score}`);
assert.ok(['Bronce', 'Plata', 'Oro', 'Platino'].includes(teacherTrust.level), `Unexpected teacher level ${teacherTrust.level}`);
assert.notEqual(teacherTrust.level, 'Platino', 'Three classes must not produce a top tier automatically.');
assert.ok(teacherTrust.badges.some((item) => item.key === 'admin_verified'));
assert.ok(teacherTrust.badges.some((item) => item.key === 'identity_verified'));
assert.equal(teacherTrust.metrics.completedClasses, 3);
assert.equal(teacherTrust.metrics.openIncidents, 0);
assert.equal(teacherTrust.adminStats.reputationCanBeManipulatedByProfileOnly, false);
assert.ok(teacherTrust.adminStats.sampleConfidence < 0.5);

const weakTrust = buildTeacherTrustProfile(weakTeacher, context);
assert.ok(weakTrust.score < teacherTrust.score);
assert.ok(weakTrust.warnings.length > 0);

const familyTrust = buildFamilyTrustProfile({
  id: 'family_1',
  familyUid: 'family_1',
  userUid: 'family_1',
  email: 'familia@example.com',
  telefono: '600333444',
  direccion: 'Calle Familia 1',
  codigo_postal: '28010',
  profileCompletionPercent: 92,
  status: 'verificado',
  active: true,
}, context);
assert.ok(familyTrust.score >= 80, `Expected reliable family trust, got ${familyTrust.score}`);
assert.equal(familyTrust.metrics.activeStudents, 1);
assert.equal(familyTrust.metrics.pendingPayments, 0);

const overdueFamilyTrust = buildFamilyTrustProfile({
  id: 'family_overdue',
  familyUid: 'family_overdue',
  userUid: 'family_overdue',
  email: 'overdue@example.com',
  telefono: '600333555',
  direccion: 'Calle Prueba 1',
  codigo_postal: '28010',
  profileCompletionPercent: 92,
  status: 'verificado',
  active: true,
}, {
  now,
  documents: [{ ownerUid: 'family_overdue', tipo: 'dni', estado: 'validado' }],
  students: [{ id: 'student_overdue', familyUid: 'family_overdue', active: true }],
  classes: [{
    id: 'class_overdue',
    familyUid: 'family_overdue',
    teacherUid: 'teacher_1',
    studentId: 'student_overdue',
    status: 'realizada',
    fecha: '2026-06-20',
    hora_fin: '18:00',
    familyAmount: 30,
    familyPaymentStatus: 'pendiente',
  }],
  paymentSchedules: [{
    id: 'schedule_overdue',
    ownerUid: 'family_overdue',
    familyUid: 'family_overdue',
    teacherUid: 'teacher_1',
    studentId: 'student_overdue',
    dayOfWeek: 5,
    time: '20:00',
    graceHours: 24,
    active: true,
  }],
  payments: [],
  requests: [],
  assignments: [],
  incidents: [],
});
assert.equal(overdueFamilyTrust.metrics.overdueClassPayments, 1);
assert.ok(overdueFamilyTrust.score < familyTrust.score, 'Overdue class payments must reduce family trust until recovered.');

const patch = buildTrustSnapshotPatch(teacherTrust);
assert.equal(patch.trustScore, teacherTrust.score);
assert.equal(patch.trustVersion, TRUST_VERSION);
assert.equal(patch.trustLevelKey, teacherTrust.levelKey);
assert.ok(Array.isArray(patch.trustBadges));
assert.ok(patch.reputationMetrics.completedClasses >= 3);
assert.ok(Array.isArray(patch.trustRiskFlags));
assert.ok(patch.adminTrustStats.sourceCollections.includes('clases'));

const display = summarizeTrustForDisplay(teacherTrust);
assert.equal(display.score, teacherTrust.score);
assert.ok(display.topBadges.length > 0);
assert.equal(display.levelLabel, teacherTrust.publicLevelLabel);

const request = {
  materia: 'Matematicas',
  nivel: 'ESO',
  modalidad: 'online',
  zona: 'Madrid',
  preferencia_horario: 'martes tarde',
};
const ranking = rankTeachersForRequest(request, [
  { ...weakTeacher, trustScore: weakTrust.score, trustLevel: weakTrust.level, reputationMetrics: weakTrust.metrics },
  { ...teacher, trustScore: teacherTrust.score, trustLevel: teacherTrust.level, reputationMetrics: teacherTrust.metrics },
], { limit: 2, includeZeroScore: true });
assert.equal(ranking[0].teacherUid, 'teacher_1');
assert.ok(ranking[0].scoreBreakdown.reputation.points > ranking[1].scoreBreakdown.reputation.points);

console.log(JSON.stringify({
  ok: true,
  checked: 'trust_engine',
  teacherScore: teacherTrust.score,
  familyScore: familyTrust.score,
  topTeacher: ranking[0].teacherUid,
}, null, 2));
