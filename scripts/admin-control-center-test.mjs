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

const [admin, module, css, pkg, rules] = await Promise.all([
  read('pages/dashboard/admin.html'),
  read('js/admin-control-center.js'),
  read('css/dashboard.css'),
  read('package.json'),
  read('firebase/firestore.rules'),
]);

assert(admin.includes('data-admin-control-center'), 'Admin dashboard must expose the control center root.');
assert(admin.includes('initAdminControlCenter'), 'Admin dashboard must initialize the control center module.');
assert(admin.includes("navigate: irA"), 'Control center actions must navigate to existing admin sections.');
assert(admin.includes('data-section="ia"'), 'Admin dashboard must expose the admin AI section in navigation.');
assert(admin.includes('data-section="configuracion"'), 'Admin dashboard must expose the platform configuration section in navigation.');
assert(admin.includes('data-admin-platform-config'), 'Admin dashboard must expose the platform configuration root.');
assert(admin.includes('initAdminPlatformConfig'), 'Admin dashboard must initialize the platform configuration center.');
assert(admin.includes('data-admin-ai-assistant'), 'Admin dashboard must expose the admin AI assistant root.');
assert(admin.includes('initAdminAiAssistant'), 'Admin dashboard must initialize the admin AI assistant.');
assert(admin.includes('renderCrmFicha'), 'Admin dashboard must render unified CRM profiles.');
assert(admin.includes('buildCrmDataset'), 'Admin dashboard must build CRM datasets from operational collections.');
assert(admin.includes('recordCrmAudit'), 'Admin dashboard must write CRM audit events.');
assert(admin.includes("collection(firebaseDb, 'crmNotes')"), 'Admin dashboard must persist private CRM notes.');
assert(admin.includes("collection(firebaseDb, 'crmTasks')"), 'Admin dashboard must persist CRM tasks.');
assert(admin.includes('bulk-prof-action'), 'Admin dashboard must expose professor bulk actions.');
assert(admin.includes('bulk-fam-action'), 'Admin dashboard must expose family bulk actions.');
assert(admin.includes('filtro-prof-riesgo'), 'Admin dashboard must expose professor CRM risk filters.');
assert(admin.includes('filtro-fam-riesgo'), 'Admin dashboard must expose family CRM risk filters.');
assert(admin.includes('crm-add-note'), 'Admin dashboard must expose private note actions.');
assert(admin.includes('crm-add-task'), 'Admin dashboard must expose task creation actions.');

assert(module.includes('computeControlCenter'), 'Control center must compute aggregate metrics.');
assert(module.includes('computeMissionControl'), 'Control center must compute Mission Control system health.');
assert(module.includes('platformHealthChecks'), 'Control center must persist platform health snapshots.');
assert(module.includes('Mission Control'), 'Control center must render the Mission Control hero.');
assert(module.includes('Estado tecnico de la plataforma'), 'Mission Control must expose technical platform status.');
assert(module.includes('Firebase'), 'Mission Control must monitor Firebase.');
assert(module.includes('Base de datos'), 'Mission Control must monitor the database.');
assert(module.includes('Autenticacion'), 'Mission Control must monitor authentication.');
assert(module.includes('Cloud Functions'), 'Mission Control must monitor Cloud Functions.');
assert(module.includes('APIs externas'), 'Mission Control must monitor external APIs.');
assert(module.includes('Notificaciones'), 'Mission Control must monitor notifications.');
assert(module.includes('IA'), 'Mission Control must monitor AI.');
assert(module.includes('Matching'), 'Mission Control must monitor matching.');
assert(module.includes('Calendario'), 'Mission Control must monitor calendar.');
assert(module.includes('Pagos'), 'Mission Control must monitor payments.');
assert(module.includes('Chat'), 'Mission Control must monitor chat.');
assert(module.includes('Almacenamiento'), 'Mission Control must monitor storage.');
assert(module.includes('PWA'), 'Mission Control must monitor PWA.');
assert(module.includes('Backups'), 'Mission Control must monitor backups.');
assert(module.includes('Tareas programadas'), 'Mission Control must monitor scheduled tasks.');
assert(module.includes('Procesos automaticos'), 'Mission Control must monitor automatic processes.');
assert(module.includes('Causa probable'), 'Mission Control must explain probable causes.');
assert(module.includes('Como solucionarlo'), 'Mission Control must explain remediation.');
assert(module.includes('Afectados'), 'Mission Control must show affected users.');
assert(module.includes('forecastMonthClose'), 'Control center must forecast month close.');
assert(module.includes('detectBusinessAnomalies'), 'Control center must detect business anomalies.');
assert(module.includes('computeTeacherLeaderboard'), 'Control center must rank outstanding teachers.');
assert(module.includes('computeOperationalTiming'), 'Control center must compute operational timing.');
assert(module.includes('LIVE_SIGNAL_COLLECTIONS'), 'Control center must subscribe to bounded live Firestore signal collections.');
assert(module.includes('firestoreLimit(limit)'), 'Control center live subscriptions must cap realtime reads.');
assert(module.includes('orderBy(orderField'), 'Control center live subscriptions must use ordered signal queries.');
assert(!module.includes('onSnapshot(collection(firebaseDb, name))'), 'Control center must not subscribe to whole Firestore collections.');
assert(module.includes('Inteligencia empresarial'), 'Control center must render the business intelligence hero.');
assert(module.includes('Prevision de cierre'), 'Control center must render close forecast.');
assert(module.includes('Deteccion de anomalias'), 'Control center must render anomaly detection.');
assert(module.includes('Tiempo medio hasta profesor'), 'Control center must render time-to-teacher metrics.');
assert(module.includes('SLA operativo'), 'Control center must render operational SLA.');
assert(module.includes('Profesores destacados'), 'Control center must render teacher leaderboard.');
assert(module.includes('Usuarios inactivos'), 'Control center must render inactive user intelligence.');
assert(module.includes('Salud del marketplace'), 'Control center must render marketplace health.');
assert(module.includes('Evolucion mensual'), 'Control center must render monthly evolution.');
assert(module.includes('Alertas automaticas'), 'Control center must render automatic alerts.');
assert(module.includes('Actividad reciente'), 'Control center must render user/activity feed.');
assert(module.includes('Moderacion y auditorias'), 'Control center must render moderation and audit tools.');
assert(module.includes('Calidad de datos'), 'Control center must render data quality audits.');
assert(module.includes('Leads -> solicitudes'), 'Control center must render conversion funnel metrics.');
assert(module.includes('Profesores activos'), 'Control center must render active teacher metrics.');
assert(module.includes('Familias activas'), 'Control center must render active family metrics.');
assert(module.includes('Pagos pendientes'), 'Control center must render payment risk metrics.');

assert(css.includes('.control-center'), 'Dashboard CSS must style the control center shell.');
assert(css.includes('.mission-control'), 'Dashboard CSS must style Mission Control shell.');
assert(css.includes('.mission-system-grid'), 'Dashboard CSS must style Mission Control system grid.');
assert(css.includes('.mission-mini-map'), 'Dashboard CSS must style Mission Control subsystem map.');
assert(css.includes('.control-health-score'), 'Dashboard CSS must style the business health score.');
assert(css.includes('.control-forecast-grid'), 'Dashboard CSS must style forecast cards.');
assert(css.includes('.control-insight-card'), 'Dashboard CSS must style insight cards.');
assert(css.includes('.control-anomaly-card'), 'Dashboard CSS must style anomaly cards.');
assert(css.includes('.control-rank-row'), 'Dashboard CSS must style teacher ranking rows.');
assert(css.includes('.control-grid-main'), 'Dashboard CSS must style control center layout.');
assert(css.includes('.control-chart'), 'Dashboard CSS must style monthly charts.');
assert(css.includes('.control-activity-item'), 'Dashboard CSS must style activity feed.');
assert(css.includes('.admin-ai'), 'Dashboard CSS must style the admin AI assistant.');
assert(css.includes('.admin-ai-row'), 'Dashboard CSS must style admin AI answer rows.');
assert(css.includes('.crm-profile-main-grid'), 'Dashboard CSS must style the CRM profile main layout.');
assert(css.includes('.crm-profile-side-grid'), 'Dashboard CSS must style the CRM profile secondary layout.');
assert(css.includes('.control-timeline-item'), 'Dashboard CSS must style CRM timeline items.');
assert(css.includes('@media (max-width: 640px)'), 'Dashboard CSS must include mobile responsive rules.');

assert(pkg.includes('test:admin-control-center'), 'package.json must expose the admin control center test.');
assert(pkg.includes('test:admin-ai'), 'package.json must expose the admin AI engine test.');
assert(rules.includes('match /crmNotes/{noteId}'), 'Firestore rules must protect CRM notes.');
assert(rules.includes('match /crmTasks/{taskId}'), 'Firestore rules must protect CRM tasks.');
assert(rules.includes('match /adminAiQueries/{queryId}'), 'Firestore rules must protect admin AI query logs.');
assert(rules.includes('match /platformHealthChecks/{checkId}'), 'Firestore rules must protect Mission Control health checks.');
assert(rules.includes('match /platformConfigHistory/{historyId}'), 'Firestore rules must protect platform configuration history.');

console.log('Admin control center validation passed.');
