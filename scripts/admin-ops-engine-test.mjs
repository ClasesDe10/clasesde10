#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  ADMIN_OPS_ENGINE_VERSION,
  buildAdminOpsModel,
  searchOpsIndex,
  summarizeOpsForClipboard,
} from '../js/admin-ops-engine.js';

const root = process.cwd();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

const now = new Date('2026-06-29T10:00:00.000Z');
const dataset = {
  solicitudes: [
    {
      id: 'req_1',
      materia: 'Matematicas',
      nivel: '2 ESO',
      estado: 'nueva',
      createdAt: '2026-06-27T08:00:00.000Z',
      familyName: 'Familia Alvarez',
    },
  ],
  solicitudMatches: [{ id: 'match_1', requestId: 'req_1', score: 92 }],
  pagos: [
    {
      id: 'pay_1',
      status: 'pendiente',
      amount: 120,
      dueAt: '2026-06-26T10:00:00.000Z',
      familyName: 'Familia Alvarez',
    },
  ],
  clases: [
    {
      id: 'class_1',
      subject: 'Fisica',
      status: 'confirmada',
      endAtIso: '2026-06-29T08:00:00.000Z',
      studentName: 'Leo',
    },
  ],
  incidencias: [
    {
      id: 'inc_1',
      status: 'abierta',
      priority: 'urgente',
      category: 'pago',
      createdAt: '2026-06-28T12:00:00.000Z',
    },
  ],
  documentos: [
    {
      id: 'doc_1',
      status: 'pendiente',
      type: 'DNI',
      ownerRole: 'profesor',
      createdAt: '2026-06-28T09:00:00.000Z',
    },
  ],
  profesores: [
    {
      id: 'teacher_1',
      nombre: 'Ana',
      apellidos: 'Ruiz',
      email: 'ana@example.com',
      materias: ['Matematicas'],
      status: 'pendiente_revision',
      profileCompletionPercent: 96,
      trustScore: 81,
    },
  ],
  familias: [
    {
      id: 'family_1',
      nombre: 'Miguel',
      apellidos: 'Alvarez',
      email: 'miguel@example.com',
      reputationMetrics: { pendingPayments: 1 },
    },
  ],
  alumnos: [
    { id: 'student_1', nombre: 'Leo', curso: '2 ESO' },
  ],
  leadsPublicos: [
    {
      id: 'lead_1',
      tipo: 'familia',
      estado: 'nuevo',
      nombre: 'Laura',
      email: 'laura@example.com',
      createdAt: '2026-06-28T07:00:00.000Z',
    },
  ],
  crmTasks: [
    {
      id: 'task_1',
      entityType: 'profesor',
      entityId: 'teacher_1',
      title: 'Llamar profesor',
      status: 'open',
      dueAt: '2026-06-28',
    },
  ],
  chats: [
    {
      id: 'chat_1',
      schedulingStatus: 'pendiente_horario',
      materia: 'Matematicas',
      updatedAt: '2026-06-26T09:00:00.000Z',
    },
  ],
};

const model = buildAdminOpsModel(dataset, { now });
assert(ADMIN_OPS_ENGINE_VERSION === 'admin-ops-engine-2026-06-29', 'Unexpected admin ops engine version.');
assert(model.items.length >= 8, 'Ops model must create a cross-module operational queue.');
assert(model.summary.urgent >= 2, 'Ops model must detect urgent work.');
assert(model.summary.waitingMatching === 1, 'Ops model must count requests waiting for matching.');
assert(model.summary.revenueAtRisk === 120, 'Ops model must calculate revenue at risk.');
assert(model.automationGroups.some((group) => group.type === 'matching_followup'), 'Ops model must suggest matching automation groups.');
assert(model.items[0].priority >= model.items.at(-1).priority, 'Ops items must be sorted by priority.');

const search = searchOpsIndex(model.searchIndex, 'matematicas');
assert(search.length >= 1, 'Global search must find operational records.');
assert(search.some((row) => ['solicitudes', 'profesores', 'chats'].includes(row.section)), 'Search results must navigate to admin sections.');

const summary = summarizeOpsForClipboard(model);
assert(summary.includes('Bandeja operativa ClasesDe10'), 'Clipboard summary must be readable.');
assert(summary.includes('Siguientes acciones'), 'Clipboard summary must include next actions.');

const [admin, workbench, css, pkg] = await Promise.all([
  read('pages/dashboard/admin.html'),
  read('js/admin-ops-workbench.js'),
  read('css/dashboard.css'),
  read('package.json'),
]);

assert(admin.includes('data-section="operaciones"'), 'Admin sidebar must expose Operaciones.');
assert(admin.includes('data-admin-ops-workbench'), 'Admin dashboard must expose the ops workbench root.');
assert(admin.includes('initAdminOpsWorkbench'), 'Admin dashboard must initialize the ops workbench.');
assert(admin.includes('busqueda-global'), 'Admin dashboard must keep the global search input.');
assert(workbench.includes('crmTasks'), 'Ops workbench must create CRM follow-up tasks.');
assert(workbench.includes('recordAdminAudit'), 'Ops workbench must audit operational actions.');
assert(workbench.includes('data-ops-review'), 'Ops workbench must allow marking queue items as reviewed.');
assert(workbench.includes('admin-global-search-panel'), 'Ops workbench must render global search results.');
assert(css.includes('.ops-workbench'), 'Dashboard CSS must style the ops workbench.');
assert(css.includes('.admin-global-search-panel'), 'Dashboard CSS must style global search results.');
assert(pkg.includes('test:admin-ops'), 'package.json must expose admin ops validation.');

console.log(JSON.stringify({
  ok: true,
  version: ADMIN_OPS_ENGINE_VERSION,
  items: model.items.length,
  urgent: model.summary.urgent,
}, null, 2));
