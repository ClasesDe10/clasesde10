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

const [adminDashboard, calendarEngine, financeEngine, platformConfig] = await Promise.all([
  read('pages/dashboard/admin.html'),
  read('js/calendar-engine.js'),
  read('js/finance-erp-engine.js'),
  read('js/platform-config.js'),
]);

assert(adminDashboard.includes('data-section="finanzas"'), 'Admin sidebar must expose the finance section.');
assert(adminDashboard.includes('id="section-finanzas"'), 'Admin dashboard must render the finance section.');
assert(adminDashboard.includes('id="finanzas-stats"'), 'Finance dashboard must render KPI cards.');
assert(adminDashboard.includes('id="finanzas-proyeccion"'), 'Finance dashboard must render projection content.');
assert(adminDashboard.includes('id="finanzas-evolucion"'), 'Finance ERP dashboard must render historical trend content.');
assert(adminDashboard.includes('id="finanzas-cashflow"'), 'Finance ERP dashboard must render cashflow content.');
assert(adminDashboard.includes('id="finanzas-segmentos"'), 'Finance ERP dashboard must render revenue segmentation.');
assert(adminDashboard.includes('id="finanzas-rankings"'), 'Finance ERP dashboard must render profitability rankings.');
assert(adminDashboard.includes('id="finanzas-filtro"'), 'Finance ERP dashboard must include advanced search/filtering.');
assert(adminDashboard.includes('id="tbody-finanzas-riesgos"'), 'Finance dashboard must render risk table.');
assert(adminDashboard.includes('id="tbody-finanzas-profesores"'), 'Finance dashboard must render teacher ranking.');

assert(adminDashboard.includes('id="clase-importe-profesor"'), 'Class modal must capture teacher amount per class.');
assert(adminDashboard.includes('id="clase-comision-preview"'), 'Class modal must preview ClasesDe10 margin.');
assert(adminDashboard.includes('function classTeacherAmount'), 'Finance helpers must read teacher class amount.');
assert(adminDashboard.includes('function classPlatformFee'), 'Finance helpers must calculate platform fee.');
assert(adminDashboard.includes('function calcularFinanzas'), 'Finance dashboard must calculate business metrics.');
assert(adminDashboard.includes('function cargarFinanzas'), 'Finance dashboard must load data from runtime providers.');
assert(adminDashboard.includes('function parseMoneyInput'), 'Class save must preserve numeric money inputs.');
assert(adminDashboard.includes('buildFinanceErpReport'), 'Finance dashboard must delegate calculations to the ERP engine.');
assert(adminDashboard.includes('FINANCE_ERP_VERSION'), 'Finance dashboard must expose the ERP engine version.');
assert(adminDashboard.includes("safeListFirestore('profesores')"), 'Finance dashboard must load teacher profiles for variable rates without new compat queries.');
assert(adminDashboard.includes("safeListFirestore('familias')"), 'Finance dashboard must load family profiles for segmentation without new compat queries.');
assert(adminDashboard.includes("safeListFirestore('alumnos')"), 'Finance dashboard must load student profiles for segmentation without new compat queries.');

assert(adminDashboard.includes('buildAdminClassPayload'), 'Class save must use the calendar payload builder.');
assert(adminDashboard.includes('importe_profesor: importeProfesor'), 'Class save must pass importe_profesor to the payload builder.');
assert(calendarEngine.includes('teacherAmount'), 'Class payload builder must persist Firebase-compatible teacherAmount.');
assert(calendarEngine.includes('comision_clasesde10'), 'Class payload builder must persist platform fee.');
assert(calendarEngine.includes('platformFee'), 'Class payload builder must persist Firebase-compatible platformFee.');
assert(calendarEngine.includes('marginPct'), 'Class payload builder must persist margin percentage.');

assert(adminDashboard.includes('porCobrarFamilias'), 'Finance metrics must track outstanding family payments.');
assert(adminDashboard.includes('porPagarProfesores'), 'Finance metrics must track outstanding teacher payments.');
assert(adminDashboard.includes('proyeccionCierre'), 'Finance metrics must project month close.');
assert(adminDashboard.includes('clasesMargenNegativo'), 'Finance metrics must detect negative margins.');
assert(adminDashboard.includes('clasesMargenBajo'), 'Finance metrics must detect low-margin classes.');
assert(adminDashboard.includes('metrics.forecast.annual'), 'Finance metrics must calculate annual forecast.');
assert(adminDashboard.includes('metrics.breakdowns.byCity'), 'Finance metrics must group revenue by city.');
assert(adminDashboard.includes('metrics.breakdowns.bySubject'), 'Finance metrics must group revenue by subject.');
assert(adminDashboard.includes('metrics.breakdowns.byModality'), 'Finance metrics must group revenue by modality.');

assert(financeEngine.includes('resolveTeacherRateForClass'), 'Finance ERP engine must resolve teacher-specific rates.');
assert(financeEngine.includes('buildClassFinancialPatch'), 'Finance ERP engine must build class financial patches.');
assert(financeEngine.includes('detectFinanceAnomalies'), 'Finance ERP engine must detect financial anomalies.');
assert(financeEngine.includes('buildFinanceCsvRows'), 'Finance ERP engine must export ERP-ready CSV rows.');
assert(platformConfig.includes("id: 'finance'"), 'Platform config must expose finance ERP settings.');
assert(platformConfig.includes('finance.lowMarginAlertPct'), 'Finance config must expose low margin threshold.');
assert(platformConfig.includes('finance.autoCreateIncidentFromAnomalies'), 'Finance config must control automatic anomaly incidents.');

console.log('Finance module static validation passed.');
