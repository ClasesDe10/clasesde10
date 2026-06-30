#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildAdminClassPayload } from '../js/calendar-engine.js';
import { buildFamilyPaymentPayload } from '../js/payment-engine.js';

const require = createRequire(import.meta.url);
const { buildAutomationPlan } = require('../functions/platform-automation-engine.js');

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function assertIncludes(file, needle, message) {
  assert.ok(read(file).includes(needle), message || `${file} must include ${needle}`);
}

for (const needle of [
  'PLATFORM_CONFIG_DEFAULTS',
  'PLATFORM_CONFIG_SECTIONS',
  'savePlatformConfig',
  'publicRuntimeFromConfig',
  'platformConfigHistory',
  'defaultCommissionPercent',
  'defaultPaymentDueDays',
  'systemJobBatchLimit',
  'qualityCheckCompletedClasses',
  'repeatedCancellationThreshold',
  'teacherScanLimit',
  'maintenanceMode',
  'featureFlags',
]) {
  assertIncludes('js/platform-config.js', needle, `Platform config schema missing ${needle}.`);
}

for (const needle of [
  'initAdminPlatformConfig',
  'validatePlatformConfig',
  'Guardar cambios',
  'Historial y control de versiones',
  'recordAdminAudit',
]) {
  assertIncludes('js/admin-platform-config.js', needle, `Admin config UI missing ${needle}.`);
}

assertIncludes('js/platform-public-runtime.js', 'configuracionPublica', 'Public runtime must read public configuration.');
assertIncludes('js/platform-public-runtime.js', 'maintenance', 'Public runtime must apply maintenance state.');
assertIncludes('js/pwa.js', 'platform-public-runtime.js', 'PWA must load public runtime configuration.');
assertIncludes('pages/dashboard/admin.html', 'data-section="configuracion"', 'Admin navigation must expose configuration section.');
assertIncludes('pages/dashboard/admin.html', 'initAdminPlatformConfig', 'Admin dashboard must initialize configuration center.');
assertIncludes('pages/dashboard/admin.html', 'window.CD10PlatformConfig', 'Admin dashboard must share active configuration with modules.');
assertIncludes('firebase/firestore.rules', 'match /platformConfigHistory/{historyId}', 'Firestore rules must protect config history.');
assertIncludes('firebase/firestore.indexes.json', '"collectionGroup": "platformConfigHistory"', 'Firestore indexes must include config history.');
assertIncludes('functions/index.js', 'loadPlatformConfig', 'Functions must load platform configuration.');
assertIncludes('scripts/firebase-automation-worker.mjs', 'loadWorkerPlatformConfig', 'Worker must load platform configuration.');

const classPayload = buildAdminClassPayload({
  profesor_id: 'prof_1',
  alumno_id: 'alum_1',
  fecha: '2026-06-28',
  materia: 'Matematicas',
  hora_inicio: '10:00',
  hora_fin: '11:00',
  precio_total: 100,
  importe_profesor: null,
  estado: 'confirmada',
}, {}, {
  config: {
    business: {
      defaultCommissionPercent: 30,
      minimumPlatformFee: 0,
    },
  },
});
assert.equal(classPayload.importe_profesor, 70, 'Class payload must derive teacher amount from configurable commission.');
assert.equal(classPayload.comision_clasesde10, 30, 'Class payload must derive platform fee from configurable commission.');

const paymentPayload = buildFamilyPaymentPayload({
  familyUid: 'fam_1',
  amount: 50,
  reference: 'bizum_1',
}, {
  nowIso: '2026-06-28T10:00:00.000Z',
  defaultPaymentDueDays: 3,
});
assert.ok(paymentPayload.dueAt.startsWith('2026-07-01'), 'Payment due date must use configurable due days.');

const requestPlan = buildAutomationPlan({
  type: 'request.created',
  entityType: 'solicitudes',
  entityId: 'req_config',
  data: { id: 'req_config', materia: 'Fisica' },
}, {
  config: {
    automation: {
      metricsSnapshotDelayMinutes: 2,
    },
  },
});
assert.ok(
  requestPlan.systemJobs.some((job) => job.type === 'metrics.snapshot' && job.runAfterMinutes === 2),
  'Automation rules must use configurable metrics delay.',
);

const overduePlan = buildAutomationPlan({
  type: 'payment.overdue',
  entityType: 'pagos',
  entityId: 'pay_config',
  data: { id: 'pay_config', amount: 80, familyUserUid: 'fam_user' },
}, {
  config: {
    automation: {
      overduePaymentReviewMinutes: 30,
    },
  },
});
assert.ok(
  overduePlan.crmTasks.some((task) => task.title === 'Resolver pago vencido' && task.dueAfterMinutes === 30),
  'Automation rules must use configurable overdue payment SLA.',
);

console.log(JSON.stringify({
  ok: true,
  checked: 'platform_configuration_center',
  derivedTeacherAmount: classPayload.importe_profesor,
  paymentDueAt: paymentPayload.dueAt,
}, null, 2));
