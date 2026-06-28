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

const adminDashboard = await read('pages/dashboard/admin.html');

assert(adminDashboard.includes('data-section="finanzas"'), 'Admin sidebar must expose the finance section.');
assert(adminDashboard.includes('id="section-finanzas"'), 'Admin dashboard must render the finance section.');
assert(adminDashboard.includes('id="finanzas-stats"'), 'Finance dashboard must render KPI cards.');
assert(adminDashboard.includes('id="finanzas-proyeccion"'), 'Finance dashboard must render projection content.');
assert(adminDashboard.includes('id="tbody-finanzas-riesgos"'), 'Finance dashboard must render risk table.');
assert(adminDashboard.includes('id="tbody-finanzas-profesores"'), 'Finance dashboard must render teacher ranking.');

assert(adminDashboard.includes('id="clase-importe-profesor"'), 'Class modal must capture teacher amount per class.');
assert(adminDashboard.includes('id="clase-comision-preview"'), 'Class modal must preview ClasesDe10 margin.');
assert(adminDashboard.includes('function classTeacherAmount'), 'Finance helpers must read teacher class amount.');
assert(adminDashboard.includes('function classPlatformFee'), 'Finance helpers must calculate platform fee.');
assert(adminDashboard.includes('function calcularFinanzas'), 'Finance dashboard must calculate business metrics.');
assert(adminDashboard.includes('function cargarFinanzas'), 'Finance dashboard must load data from runtime providers.');
assert(adminDashboard.includes('function parseMoneyInput'), 'Class save must preserve numeric money inputs.');

assert(adminDashboard.includes('importe_profesor: importeProfesor'), 'Class save must persist importe_profesor.');
assert(adminDashboard.includes('teacherAmount: importeProfesor'), 'Class save must persist Firebase-compatible teacherAmount.');
assert(adminDashboard.includes('comision_clasesde10: comision'), 'Class save must persist platform fee.');
assert(adminDashboard.includes('platformFee: comision'), 'Class save must persist Firebase-compatible platformFee.');
assert(adminDashboard.includes('marginPct'), 'Class save must persist margin percentage.');

assert(adminDashboard.includes('porCobrarFamilias'), 'Finance metrics must track outstanding family payments.');
assert(adminDashboard.includes('porPagarProfesores'), 'Finance metrics must track outstanding teacher payments.');
assert(adminDashboard.includes('proyeccionCierre'), 'Finance metrics must project month close.');
assert(adminDashboard.includes('clasesMargenNegativo'), 'Finance metrics must detect negative margins.');
assert(adminDashboard.includes('clasesMargenBajo'), 'Finance metrics must detect low-margin classes.');

console.log('Finance module static validation passed.');
