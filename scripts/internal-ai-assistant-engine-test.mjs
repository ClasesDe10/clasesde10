#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  INTERNAL_AI_ASSISTANT_VERSION,
  buildInternalAiAssistantPlan,
} from '../js/internal-ai-assistant-engine.js';

const root = process.cwd();

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

const plan = buildInternalAiAssistantPlan({
  profesores: [
    {
      id: 'teacher_1',
      nombre: 'Miguel',
      apellidos: 'Gutierrez',
      status: 'active',
      telefono: '600000000',
      materias: ['Matematicas'],
      profileCompletionPercent: 62,
    },
  ],
  familias: [
    {
      id: 'family_1',
      nombre: 'Esperanza',
      status: 'active',
      profileCompletionPercent: 45,
    },
  ],
  chats: [
    {
      id: 'chat_1',
      familyUid: 'family_1',
      teacherUid: 'teacher_1',
      subject: 'Matematicas',
      updatedAt: '2026-06-29T08:00:00.000Z',
    },
  ],
  mensajes: [
    { id: 'm1', chatId: 'chat_1', text: 'No responde y tenemos un problema con la clase.', createdAt: '2026-06-29T08:05:00.000Z' },
    { id: 'm2', chatId: 'chat_1', text: 'Es urgente porque no vino ayer y falta confirmacion.', createdAt: '2026-06-29T09:05:00.000Z' },
    { id: 'm3', chatId: 'chat_1', text: 'Quedamos una hora o cancelamos?', createdAt: '2026-06-29T10:05:00.000Z' },
  ],
  incidencias: [
    {
      id: 'inc_1',
      title: 'Pago conflictivo',
      status: 'abierta',
      priority: 'alta',
      history: ['Se abre incidencia', 'Familia adjunta justificante', 'Profesor reclama pago', 'Admin pide revision'],
      updatedAt: '2026-06-28T10:00:00.000Z',
    },
    {
      id: 'inc_2',
      category: 'pagos',
      status: 'abierta',
      createdAt: '2026-06-20T10:00:00.000Z',
    },
    {
      id: 'inc_3',
      category: 'pagos',
      status: 'cerrada',
      createdAt: '2026-06-21T10:00:00.000Z',
    },
    {
      id: 'inc_4',
      category: 'pagos',
      status: 'abierta',
      createdAt: '2026-06-22T10:00:00.000Z',
    },
  ],
  documentos: [
    {
      id: 'doc_1',
      tipo: 'DNI',
      ownerRole: 'profesor',
      status: 'pendiente',
      createdAt: '2026-06-28T09:00:00.000Z',
    },
  ],
  clases: [
    {
      id: 'class_1',
      materia: 'Matematicas',
      status: 'realizada',
      familyUid: 'family_1',
      teacherUid: 'teacher_1',
      familyAmount: 0,
      teacherAmount: 0,
      startAtIso: '2026-06-29T18:00:00.000Z',
    },
  ],
  asignaciones: [
    {
      id: 'assignment_1',
      status: 'active',
      familyUid: 'family_1',
      teacherUid: 'teacher_1',
    },
  ],
  proactiveAssistSignals: [
    {
      id: 'proactive_1',
      title: 'Profesor sin disponibilidad',
      priority: 'high',
      priorityScore: 84,
      status: 'active',
      recommendedAction: 'Pedir franjas reales.',
    },
  ],
  platformSupervisionFindings: [
    {
      id: 'finding_1',
      title: 'Asignacion sin chat',
      severity: 'critical',
      priorityScore: 96,
      status: 'active',
    },
  ],
}, {
  nowIso: '2026-06-30T12:00:00.000Z',
  longConversationMessageThreshold: 3,
  conflictKeywordThreshold: 2,
  documentReviewHours: 12,
  profileCompletionMinPercent: 85,
  recurrentPatternThreshold: 3,
});

assert.equal(plan.version, INTERNAL_AI_ASSISTANT_VERSION, 'Plan must expose the internal AI assistant version.');
assert.equal(plan.summary.chatInsights, 1, 'Engine must detect chat conflict or summary opportunities.');
assert.equal(plan.summary.incidentInsights >= 1, true, 'Engine must summarize actionable incidents.');
assert.equal(plan.summary.documentInsights, 1, 'Engine must prepare document review assistance.');
assert.equal(plan.summary.profileInsights, 2, 'Engine must help teacher and family profile completion.');
assert.equal(plan.summary.dataQualityInsights >= 2, true, 'Engine must detect class financials and missing chat consistency.');
assert.equal(plan.summary.patternInsights, 1, 'Engine must detect repeated incident patterns.');
assert.equal(plan.summary.adminBriefs, 1, 'Engine must consolidate admin priorities into a daily brief.');
assert.equal(plan.insights.some((item) => item.insightId === 'chat_conflict_risk' && item.requiresHumanReview), true, 'Chat conflict insight must require human review.');
assert.equal(plan.insights.some((item) => item.insightId === 'document_review_assist' && item.suggestedActions.length >= 3), true, 'Document insight must include review checklist.');
assert.equal(plan.insights.some((item) => item.insightId === 'profile_completion_assist' && item.externalModelRequired === false), true, 'Profile insight must be deterministic and free.');
assert.equal(plan.insights[0].priorityScore >= plan.insights.at(-1).priorityScore, true, 'Insights must be sorted by priority.');

const [worker, config, rules, ops, control, pkg] = await Promise.all([
  read('scripts/firebase-automation-worker.mjs'),
  read('js/platform-config.js'),
  read('firebase/firestore.rules'),
  read('js/admin-ops-engine.js'),
  read('js/admin-control-center.js'),
  read('package.json'),
]);

assert.ok(worker.includes('buildInternalAiAssistantPlan'), 'Worker must execute the internal AI assistant plan.');
assert.ok(worker.includes('internalAiInsights'), 'Worker must materialize internal AI insights.');
assert.ok(config.includes('internalAssistantEnabled'), 'Platform config must expose internal assistant controls.');
assert.ok(rules.includes('match /internalAiInsights/{insightId}'), 'Firestore rules must protect internal AI insights.');
assert.ok(rules.includes('match /internalAiInsightSnapshots/{snapshotId}'), 'Firestore rules must protect internal AI snapshots.');
assert.ok(ops.includes('internalAiInsights'), 'Admin ops must load internal AI insights.');
assert.ok(control.includes('internalAiInsights'), 'Mission Control must load internal AI insights.');
assert.ok(pkg.includes('test:internal-ai-assistant'), 'package.json must expose internal AI assistant validation.');

console.log(JSON.stringify({
  ok: true,
  version: plan.version,
  total: plan.total,
  summary: plan.summary,
}, null, 2));
