import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

const files = Object.fromEntries(await Promise.all([
  'pages/dashboard/admin.html',
  'pages/dashboard/familia.html',
  'pages/dashboard/profesor.html',
  'js/chat-widget.js',
  'js/payment-engine.js',
  'js/class-cancellation.js',
  'js/finance-erp-engine.js',
  'js/analytics-engine.js',
  'js/ai-engine.js',
  'js/calendar-sync.js',
  'js/relationship-engine.js',
  'scripts/firebase-automation-worker.mjs',
].map(async (file) => [file, await read(file)])));

const requiredHelpers = [
  ['pages/dashboard/admin.html', 'adminPersonName'],
  ['pages/dashboard/familia.html', 'personDisplayName'],
  ['pages/dashboard/profesor.html', 'studentDisplayName'],
  ['js/chat-widget.js', 'isGenericIdentityLabel'],
  ['js/payment-engine.js', 'paymentPersonName'],
  ['js/class-cancellation.js', 'cancellationPersonName'],
  ['js/finance-erp-engine.js', 'financePersonFallback'],
  ['js/analytics-engine.js', 'analyticsPersonName'],
  ['js/ai-engine.js', 'teacherNameOrFallback'],
  ['js/calendar-sync.js', 'calendarPersonName'],
  ['js/relationship-engine.js', 'GENERIC_RELATIONSHIP_PERSON_LABELS'],
  ['scripts/firebase-automation-worker.mjs', 'workerPersonName'],
];

for (const [file, helper] of requiredHelpers) {
  assert(files[file].includes(helper), `${file} must use ${helper} for personalized names.`);
}

const forbiddenFragments = [
  ['pages/dashboard/admin.html', "c.profesor_nombre || 'Profesor'"],
  ['pages/dashboard/admin.html', "p.email || 'Profesor'"],
  ['pages/dashboard/admin.html', "pago.profesor_nombre || 'Profesor'"],
  ['pages/dashboard/admin.html', "|| f?.id || 'Familia'"],
  ['pages/dashboard/admin.html', "|| p?.id || 'Profesor'"],
  ['pages/dashboard/admin.html', "m.teacherName || m.nombreProfesor || m.teacherEmail || teacherId || 'Profesor'"],
  ['scripts/firebase-automation-worker.mjs', "data.familyName || data.familia_nombre || data.parentName || data.familyUid || data.familia_id || 'familia sin nombre'"],
  ['scripts/firebase-automation-worker.mjs', "data.teacherName || data.profesor_nombre || data.teacherName || data.teacherUid || data.profesor_id || 'profesor sin nombre'"],
  ['scripts/firebase-automation-worker.mjs', "teacherProfile.data.email || teacherUser.data.email || 'Contacto'"],
  ['js/class-cancellation.js', "classData.teacherName || classData.profesor_nombre || 'el profesor'"],
  ['js/class-cancellation.js', "classData.familyName || classData.familia_nombre || 'la familia'"],
  ['js/finance-erp-engine.js', "|| 'Sin profesor'"],
  ['js/finance-erp-engine.js', "|| 'Sin familia'"],
  ['js/finance-erp-engine.js', "|| 'Sin alumno'"],
  ['js/finance-erp-engine.js', "item.teacherName || 'Profesor'"],
  ['js/finance-erp-engine.js', "item.familyName || 'Familia'"],
  ['js/analytics-engine.js', "teacherUid || 'Sin profesor'"],
  ['js/ai-engine.js', "best.teacherName || 'Profesor'"],
  ['js/ai-engine.js', "profile.name || 'Profesor'"],
  ['js/calendar-sync.js', "classData.alumno_nombre || classData.studentName || classData.alumno_id || classData.studentId || ''"],
  ['js/calendar-sync.js', "classData.profesor_nombre || classData.teacherName || classData.profesor_id || classData.teacherUid || ''"],
];

for (const [file, fragment] of forbiddenFragments) {
  assert(!files[file].includes(fragment), `${file} still contains generic person fallback: ${fragment}`);
}

console.log('Personalized names checks passed.');
