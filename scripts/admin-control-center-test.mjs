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

const [admin, module, css, pkg] = await Promise.all([
  read('pages/dashboard/admin.html'),
  read('js/admin-control-center.js'),
  read('css/dashboard.css'),
  read('package.json'),
]);

assert(admin.includes('data-admin-control-center'), 'Admin dashboard must expose the control center root.');
assert(admin.includes('initAdminControlCenter'), 'Admin dashboard must initialize the control center module.');
assert(admin.includes("navigate: irA"), 'Control center actions must navigate to existing admin sections.');

assert(module.includes('computeControlCenter'), 'Control center must compute aggregate metrics.');
assert(module.includes('forecastMonthClose'), 'Control center must forecast month close.');
assert(module.includes('detectBusinessAnomalies'), 'Control center must detect business anomalies.');
assert(module.includes('computeTeacherLeaderboard'), 'Control center must rank outstanding teachers.');
assert(module.includes('computeOperationalTiming'), 'Control center must compute operational timing.');
assert(module.includes('LIVE_COLLECTIONS'), 'Control center must subscribe to live Firestore collections.');
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
assert(css.includes('.control-health-score'), 'Dashboard CSS must style the business health score.');
assert(css.includes('.control-forecast-grid'), 'Dashboard CSS must style forecast cards.');
assert(css.includes('.control-insight-card'), 'Dashboard CSS must style insight cards.');
assert(css.includes('.control-anomaly-card'), 'Dashboard CSS must style anomaly cards.');
assert(css.includes('.control-rank-row'), 'Dashboard CSS must style teacher ranking rows.');
assert(css.includes('.control-grid-main'), 'Dashboard CSS must style control center layout.');
assert(css.includes('.control-chart'), 'Dashboard CSS must style monthly charts.');
assert(css.includes('.control-activity-item'), 'Dashboard CSS must style activity feed.');
assert(css.includes('@media (max-width: 640px)'), 'Dashboard CSS must include mobile responsive rules.');

assert(pkg.includes('test:admin-control-center'), 'package.json must expose the admin control center test.');

console.log('Admin control center validation passed.');
