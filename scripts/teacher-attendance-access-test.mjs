#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const engine = read('js/calendar-engine.js');
const teacherDashboard = read('pages/dashboard/profesor.html');
const familyDashboard = read('pages/dashboard/familia.html');
const worker = read('scripts/firebase-automation-worker.mjs');
const rules = read('firebase/firestore.rules');
const styles = read('css/dashboard.css');

assert.match(engine, /TEACHER_ATTENDANCE_LOCK_GRACE_DAYS = 5/, 'The teacher attendance grace period must remain exactly five days.');
assert.match(engine, /teacherAttendanceAccessState/, 'The shared calendar engine must calculate teacher access state.');
assert.match(engine, /El profesor debe marcar primero si la clase se dio o no se dio\./, 'Family payloads must reject attendance before the teacher.');

assert.match(teacherDashboard, /teacher-attendance-access-locked/, 'Teacher dashboard must expose a locked access state.');
assert.match(teacherDashboard, /TEACHER_ATTENDANCE_ALLOWED_SECTIONS = new Set\(\['calendario'\]\)/, 'Locked teachers must only be allowed into the calendar.');
assert.match(teacherDashboard, /refreshTeacherAttendanceAccessState/, 'Teacher access must be recalculated after attendance updates.');
assert.match(styles, /teacher-attendance-access-locked \.sidebar-link\[data-section\]:not\(\[data-section="calendario"\]\)/, 'Locked teacher navigation must hide every section except the calendar.');

assert.match(familyDashboard, /if \(!attendance\.teacherMarked\)/, 'Family dashboard must re-check the teacher result before writing attendance.');
assert.match(rules, /classTeacherAttendanceResult\(resource\.data\) in \['realizada', 'no_realizada'\]/, 'Firestore rules must reject family attendance without a teacher result.');
assert.doesNotMatch(rules, /request\.resource\.data\.attendanceStatus == 'pendiente_profesor'/, 'New family writes must never create a pending-teacher state.');

assert.match(worker, /processTeacherAttendanceAccessSweep/, 'Automation worker must persist and restore teacher access locks.');
assert.match(worker, /teacherAttendanceAccessLocksApplied/, 'Worker statistics must report applied teacher locks.');
assert.match(worker, /teacherAttendanceAccessLocksRestored/, 'Worker statistics must report restored teacher access.');
assert.doesNotMatch(worker, /No confirmo la asistencia de la clase dentro de las 24h posteriores\./, 'Families must not be penalized while waiting for the teacher.');

console.log('Teacher attendance access validation passed.');
