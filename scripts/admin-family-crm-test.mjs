import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [adminHtml, familySmoke, trustSmoke] = await Promise.all([
  readFile(new URL('../pages/dashboard/admin.html', import.meta.url), 'utf8'),
  readFile(new URL('./admin-families-smoke.playwright.js', import.meta.url), 'utf8'),
  readFile(new URL('./admin-trust-smoke.playwright.js', import.meta.url), 'utf8'),
]);

const trustPanel = adminHtml.match(/function renderTrustPanel[\s\S]*?(?=\nfunction firstCrm)/)?.[0] || '';
const familyProfile = adminHtml.match(/function renderFamilyCrmProfile[\s\S]*?(?=\nfunction renderCrmFicha)/)?.[0] || '';
const familyDetail = adminHtml.match(/function renderFamiliaDetalle[\s\S]*?(?=\ndocument\.getElementById\('tbody-familias')/ )?.[0] || '';

assert.ok(trustPanel, 'No se encontro el panel de confianza del CRM.');
assert.ok(familyProfile, 'No se encontro la ficha CRM propia de familias.');
assert.ok(familyDetail, 'No se encontro el detalle familiar auxiliar.');

assert.match(trustPanel, /type = 'profesor'/, 'El panel debe distinguir el tipo de perfil.');
assert.match(trustPanel, /type === 'familia'/, 'El panel no identifica la variante familiar.');
assert.match(trustPanel, /Confianza familiar/, 'Falta el encabezado de confianza familiar.');
assert.match(trustPanel, /Como se valora la relacion familiar/, 'Falta la explicacion familiar de confianza.');
assert.match(trustPanel, /clases recibidas/, 'La familia debe ver clases recibidas, no horas impartidas.');
assert.match(trustPanel, /pagos al dia/, 'La familia debe ver fiabilidad de pagos.');
assert.match(trustPanel, /justificantes vencidos/, 'La familia debe ver el estado de sus justificantes.');

for (const section of [
  'Datos propios de la familia',
  'Contacto familiar',
  'Domicilio y zona de servicio',
  'Contexto y seguimiento',
  'Estado de la cuenta',
  'Alumnos vinculados',
  'Solicitudes realizadas',
  'Asignaciones de servicio',
]) {
  assert.ok(familyProfile.includes(section), `Falta la seccion o dato familiar: ${section}.`);
}

assert.match(adminHtml, /isFamily \? renderFamilyCrmProfile\(entity, data\) : renderAdminCompleteProfile\(entity, type\)/, 'La ficha familiar no utiliza su renderizador propio.');
assert.match(adminHtml, /renderTrustPanel\(trust, type\)/, 'La ficha CRM no transmite el tipo al panel de confianza.');
assert.match(familyDetail, /renderTrustPanel\(trust, 'familia'\)/, 'El detalle auxiliar de familia reutiliza la variante de profesor.');
assert.match(familySmoke, /professorOnlyConcepts/, 'La prueba productiva no bloquea conceptos exclusivos del profesor.');
assert.match(trustSmoke, /familyModalHasTrust[\s\S]*Confianza familiar/, 'La prueba de confianza no comprueba el encabezado familiar.');

console.log('Admin family CRM separation test: OK');
