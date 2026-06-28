#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DEFAULT_AUTOMATION_RULES,
  EVENT_CATALOG,
  RULE_ENGINE_VERSION,
  buildAutomationPlan,
} = require('../functions/platform-automation-engine.js');
const {
  ACTION_CATALOG,
  matchesCondition,
  mergeRuleSets,
  resolveValue,
} = require('../functions/rules-engine.js');

function assertHas(items, predicate, message) {
  assert.ok(items.some(predicate), message);
}

for (const eventType of [
  'user.registered',
  'teacher.verified',
  'request.created',
  'class.scheduled',
  'class.rescheduled',
  'class.cancelled',
  'class.completed',
  'payment.verified',
  'payment.overdue',
  'message.received',
  'profile.updated',
  'incident.created',
  'document.created',
  'review.created',
]) {
  assertHas(EVENT_CATALOG, (item) => item.type === eventType, `Event catalog must include ${eventType}`);
}

for (const actionType of ['automationEvent', 'notification', 'systemJob', 'audit', 'crmTask', 'opsAlert', 'patch']) {
  assert.ok(ACTION_CATALOG.includes(actionType), `Action catalog must include ${actionType}`);
}

const defaultRuleIds = DEFAULT_AUTOMATION_RULES.map((rule) => rule.id);
assert.equal(new Set(defaultRuleIds).size, defaultRuleIds.length, 'Default automation rules must not contain duplicate IDs.');

const conditionContext = {
  data: {
    amount: 42,
    status: 'PENDIENTE',
    materia: 'Matematicas',
  },
};
assert.equal(matchesCondition({
  all: [
    { path: 'data.amount', operator: 'gte', value: 40 },
    { path: 'data.status', operator: 'eq', value: 'pendiente' },
    { path: 'data.materia', operator: 'regex', value: 'mat' },
  ],
}, conditionContext), true, 'Rule conditions must support numeric, string and regex operators.');
assert.equal(resolveValue('Pago {{data.amount}} {{data.status}}', conditionContext), 'Pago 42 PENDIENTE');
assert.deepEqual(resolveValue({ firstOf: ['data.missing', 'data.materia'] }, conditionContext), 'Matematicas');

const mergedRules = mergeRuleSets(
  [{ id: 'demo.rule', priority: 500, actions: [{ type: 'audit', action: 'demo' }] }],
  [{ id: 'demo.rule', active: false, priority: 10 }],
);
assert.equal(mergedRules[0].id, 'demo.rule');
assert.equal(mergedRules[0].active, false, 'Configured rules must be able to disable default rules.');
assert.equal(mergedRules[0].actions.length, 1, 'Disabling a default rule should preserve its actions for auditability.');

const customPlan = buildAutomationPlan({
  type: 'custom.event',
  entityType: 'custom',
  entityId: 'custom_1',
  data: {
    userUid: 'family_user_1',
    amount: 42,
    status: 'pending',
  },
  source: 'test',
}, {
  replaceDefaultRules: true,
  rules: [{
    id: 'custom.event.notify',
    name: 'Custom notification rule',
    source: 'firestore',
    eventTypes: ['custom.event'],
    priority: 1,
    when: {
      all: [
        { path: 'data.userUid', operator: 'not_empty' },
        { path: 'data.amount', operator: 'gt', value: 0 },
      ],
    },
    actions: [{
      type: 'notification',
      target: {
        userUid: { path: 'data.userUid' },
        role: 'familia',
      },
      title: 'Evento configurable',
      body: 'Importe {{data.amount}} para {{computed.id}}',
      payload: {
        type: 'custom_event',
        amount: { path: 'data.amount' },
      },
      options: {
        type: 'custom_event',
        priority: 'high',
      },
    }],
  }],
});

assertHas(customPlan.notifications, (item) => (
  item.userUid === 'family_user_1'
  && item.type === 'custom_event'
  && item.body.includes('Importe 42')
), 'Custom configurable rules must materialize resolved notifications.');
assertHas(customPlan.ruleRuns, (item) => (
  item.ruleId === 'custom.event.notify'
  && item.source === 'firestore'
  && item.actionCount === 1
  && item.engineVersion === RULE_ENGINE_VERSION
), 'Custom configurable rules must create rule run metadata.');

const disabledPaymentPlan = buildAutomationPlan({
  type: 'payment.overdue',
  entityType: 'pagos',
  entityId: 'pay_1',
  data: {
    familyUserUid: 'family_user_1',
    amount: 80,
    status: 'pendiente',
  },
  source: 'test',
}, {
  rules: [{
    id: 'payment.overdue.core',
    active: false,
    source: 'firestore',
  }],
});

assert.equal(
  disabledPaymentPlan.notifications.some((item) => item.type === 'payment_overdue'),
  false,
  'Configured inactive rules must prevent the default rule from firing.',
);
assertHas(
  disabledPaymentPlan.auditLogs,
  (item) => item.action === 'automation.event_recorded',
  'Fallback audit rule must preserve traceability when an event has no active primary rule.',
);

console.log(JSON.stringify({
  ok: true,
  ruleEngineVersion: RULE_ENGINE_VERSION,
  defaultRules: DEFAULT_AUTOMATION_RULES.length,
  catalogEvents: EVENT_CATALOG.length,
}, null, 2));
