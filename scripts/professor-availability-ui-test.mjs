import assert from 'node:assert/strict';
import fs from 'node:fs';

const professorDashboard = fs.readFileSync(new URL('../pages/dashboard/profesor.html', import.meta.url), 'utf8');
const dashboardCss = fs.readFileSync(new URL('../css/dashboard.css', import.meta.url), 'utf8');
const firestoreRules = fs.readFileSync(new URL('../firebase/firestore.rules', import.meta.url), 'utf8');

assert(professorDashboard.includes('teacher-availability-section'), 'Teacher availability page must have its own stable full-width section.');
assert(professorDashboard.includes('teacher-availability-shell'), 'Teacher availability page must not rely on a generic card layout.');
assert(professorDashboard.includes('teacher-availability-hero'), 'Teacher availability page must keep the add action visible in the main header.');
assert(professorDashboard.includes('teacher-availability-summary'), 'Teacher availability page must show a concise saved-slots summary.');
assert(professorDashboard.includes('teacher-availability-modal'), 'Teacher availability modal must use the polished layout class.');
assert(professorDashboard.includes('teacher-availability-time-grid'), 'Teacher availability modal must align start/end controls responsively.');
assert(professorDashboard.includes('teacher-availability-preview'), 'Teacher availability modal must show a readable preview.');
assert(professorDashboard.includes('teacher-availability-card'), 'Teacher availability list must render stable cards.');

assert(professorDashboard.includes("cargarFirestoreWhere('disponibilidad', 'teacherUid', '==', id)"), 'Teacher availability must read canonical teacherUid rows.');
assert(professorDashboard.includes("cargarFirestoreWhere('disponibilidad', 'profesor_id', '==', id)"), 'Teacher availability must also read legacy profesor_id rows.');
assert(professorDashboard.includes('teacherUid,'), 'Teacher availability writes must include teacherUid.');
assert(professorDashboard.includes('profesor_id: legacyTeacherId'), 'Teacher availability writes must keep legacy profesor_id for compatibility.');
assert(professorDashboard.includes("addDoc(firestoreCollection(firebaseDb, 'disponibilidad'), payload)"), 'Teacher availability must write directly to Firestore with the reviewed payload.');
assert(professorDashboard.includes("setTeacherActionBusy(button, 'Guardando...')"), 'Saving availability must block duplicate clicks.');
assert(professorDashboard.includes('teacherAvailabilityKey(row) === teacherAvailabilityKey(draft)'), 'Saving availability must prevent duplicate slots.');
assert(professorDashboard.includes("showToast('No se pudo guardar'"), 'Saving availability must surface write errors to the teacher.');
assert(professorDashboard.includes("setTeacherActionBusy(button, 'Eliminando...')"), 'Deleting availability must block duplicate clicks.');

assert(dashboardCss.includes('.teacher-availability-section'), 'Availability page must have dedicated section CSS.');
assert(dashboardCss.includes('.teacher-availability-shell'), 'Availability page must have a stable shell width.');
assert(dashboardCss.includes('.teacher-availability-hero'), 'Availability page must style the main header.');
assert(dashboardCss.includes('.teacher-availability-summary'), 'Availability summary must have dedicated CSS.');
assert(dashboardCss.includes('.teacher-availability-card'), 'Availability cards must have dedicated CSS.');
assert(dashboardCss.includes('.teacher-availability-time-grid'), 'Availability time grid must have dedicated CSS.');
assert(dashboardCss.includes('.teacher-availability-card .btn'), 'Availability cards must adapt actions on mobile.');

assert(firestoreRules.includes('validTeacherAvailabilityPayload'), 'Firestore rules must validate teacher availability writes.');
assert(firestoreRules.includes('availabilityTeacherBelongsToAuth(data.profesor_id)'), 'Firestore rules must allow a teacher-owned legacy profesor_id.');

console.log('Professor availability UI validation passed.');
